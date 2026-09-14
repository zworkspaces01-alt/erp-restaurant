"use server";

import { createClient } from "@/lib/supabase/server";
import { getDailyReportPageData } from "@/lib/queries/reports.queries";
import {
  formatDailyTelegramReport,
  sendTelegramMessage,
  testTelegramConnection,
  type TelegramConfig,
} from "@/lib/telegram";
import { fail, ok, type ActionResult } from "@/types/actions";
import type { Json } from "@/types/database";

interface TelegramSettingsResult {
  botToken: string;
  chatId: string;
  enabled: boolean;
  isConfigured: boolean;
  hasEnvFallback: boolean;
}

/**
 * Lấy cấu hình Telegram từ bảng `app_settings` hoặc fallback sang biến môi trường `.env`.
 */
export async function getTelegramConfigAction(): Promise<ActionResult<TelegramSettingsResult>> {
  try {
    const supabase = await createClient();
    const { data: settings, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["telegram_bot_token", "telegram_chat_id", "telegram_enabled"]);

    if (error) {
      return fail("Lỗi khi đọc cấu hình Telegram từ cơ sở dữ liệu");
    }

    const map = new Map<string, unknown>();
    settings?.forEach((s) => map.set(s.key, s.value));

    const dbToken = typeof map.get("telegram_bot_token") === "string" ? (map.get("telegram_bot_token") as string) : "";
    const dbChatId = typeof map.get("telegram_chat_id") === "string" ? (map.get("telegram_chat_id") as string) : "";
    const dbEnabled = map.get("telegram_enabled") === true || map.get("telegram_enabled") === "true";

    const envToken = process.env.TELEGRAM_BOT_TOKEN || "";
    const envChatId = process.env.TELEGRAM_CHAT_ID || "";

    const finalToken = dbToken || envToken;
    const finalChatId = dbChatId || envChatId;
    const enabled = map.has("telegram_enabled") ? dbEnabled : Boolean(finalToken && finalChatId);

    return ok({
      botToken: finalToken,
      chatId: finalChatId,
      enabled,
      isConfigured: Boolean(finalToken && finalChatId),
      hasEnvFallback: Boolean(envToken || envChatId),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định khi lấy cấu hình Telegram";
    return fail(msg);
  }
}

/**
 * Lưu thông tin cấu hình Telegram Bot vào bảng `app_settings`.
 */
export async function saveTelegramConfigAction(config: {
  botToken: string;
  chatId: string;
  enabled: boolean;
}): Promise<ActionResult<boolean>> {
  try {
    const supabase = await createClient();

    const items: { key: string; value: Json }[] = [
      {
        key: "telegram_bot_token",
        value: config.botToken.trim(),
      },
      {
        key: "telegram_chat_id",
        value: config.chatId.trim(),
      },
      {
        key: "telegram_enabled",
        value: config.enabled,
      },
    ];

    for (const item of items) {
      const { error } = await supabase.from("app_settings").upsert(item, { onConflict: "key" });
      if (error) {
        return fail(`Không thể lưu cài đặt ${item.key}: ${error.message}`);
      }
    }

    return ok(true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi khi lưu cấu hình Telegram";
    return fail(msg);
  }
}

/**
 * Kiểm tra thử nghiệm kết nối Telegram với Bot Token và Chat ID.
 */
export async function testTelegramAction(
  botToken: string,
  chatId: string
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const result = await testTelegramConnection(botToken, chatId);
    if (!result.success) {
      return fail(result.error || "Gửi tin nhắn thử nghiệm thất bại");
    }
    return ok({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi kiểm tra kết nối Telegram";
    return fail(msg);
  }
}

/**
 * Gửi báo cáo tiêu hao nguyên liệu & kết quả kinh doanh ngày qua Telegram.
 */
export async function sendDailyReportToTelegramAction(
  dateStr: string,
  customConfig?: Partial<TelegramConfig>
): Promise<ActionResult<{ success: boolean; messageId?: number }>> {
  try {
    const supabase = await createClient();

    // 1. Đọc tên nhà hàng
    const { data: nameSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "restaurant_name")
      .maybeSingle();

    let restaurantName = "Nhà hàng";
    if (nameSetting?.value) {
      restaurantName =
        typeof nameSetting.value === "string"
          ? nameSetting.value.replace(/^"|"$/g, "")
          : String(nameSetting.value);
    }

    // 2. Lấy dữ liệu báo cáo ngày
    const reportData = await getDailyReportPageData(dateStr);

    // 3. Format tin nhắn Telegram
    const messageText = formatDailyTelegramReport(reportData, restaurantName);

    // 4. Lấy config Telegram nếu customConfig chưa đầy đủ
    let botToken = customConfig?.botToken;
    let chatId = customConfig?.chatId;

    if (!botToken || !chatId) {
      const { data: dbSettings } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["telegram_bot_token", "telegram_chat_id"]);

      const map = new Map<string, unknown>();
      dbSettings?.forEach((s) => map.set(s.key, s.value));

      botToken = botToken || (map.get("telegram_bot_token") as string) || process.env.TELEGRAM_BOT_TOKEN;
      chatId = chatId || (map.get("telegram_chat_id") as string) || process.env.TELEGRAM_CHAT_ID;
    }

    if (!botToken || !chatId) {
      return fail(
        "Chưa có cấu hình Bot Token hoặc Chat ID. Vui lòng bấm Cấu hình Telegram để thiết lập."
      );
    }

    // 5. Gửi tin nhắn
    const sendResult = await sendTelegramMessage(messageText, { botToken, chatId });

    if (!sendResult.success) {
      return fail(sendResult.error || "Gửi tin nhắn Telegram thất bại");
    }

    return ok({ success: true, messageId: sendResult.messageId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi khi gửi báo cáo Telegram";
    return fail(msg);
  }
}
