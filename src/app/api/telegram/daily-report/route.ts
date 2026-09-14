import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDailyReportPageData } from "@/lib/queries/reports.queries";
import { formatDailyTelegramReport, sendTelegramMessage } from "@/lib/telegram";

/**
 * Lấy ngày hôm nay theo múi giờ Asia/Ho_Chi_Minh ở định dạng YYYY-MM-DD.
 */
function getTodayInVietnam(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}

async function handleTelegramReportRequest(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const secretParam = searchParams.get("secret");
    const authHeader = req.headers.get("authorization") || req.headers.get("x-cron-secret");

    const targetDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : getTodayInVietnam();

    const supabase = await createClient();

    // 1. Kiểm tra secret nếu có cấu hình CRON secret
    const cronSecretEnv = process.env.TELEGRAM_CRON_SECRET;
    if (cronSecretEnv) {
      const providedSecret =
        secretParam ||
        (authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : authHeader);

      if (providedSecret !== cronSecretEnv) {
        return NextResponse.json(
          { ok: false, error: "Unauthorized: Invalid or missing cron secret" },
          { status: 401 }
        );
      }
    }

    // 2. Đọc cấu hình Telegram & tên nhà hàng từ app_settings / env
    const { data: settings } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [
        "restaurant_name",
        "telegram_bot_token",
        "telegram_chat_id",
        "telegram_enabled",
      ]);

    const map = new Map<string, unknown>();
    settings?.forEach((s) => map.set(s.key, s.value));

    const enabled = map.has("telegram_enabled")
      ? map.get("telegram_enabled") === true || map.get("telegram_enabled") === "true"
      : true;

    if (!enabled) {
      return NextResponse.json(
        { ok: false, error: "Tính năng gửi báo cáo qua Telegram đang bị tắt trong cài đặt." },
        { status: 400 }
      );
    }

    const botToken =
      (map.get("telegram_bot_token") as string) ||
      process.env.TELEGRAM_BOT_TOKEN ||
      "";
    const chatId =
      (map.get("telegram_chat_id") as string) ||
      process.env.TELEGRAM_CHAT_ID ||
      "";

    if (!botToken || !chatId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Chưa cấu hình Telegram Bot Token hoặc Chat ID trong app_settings hoặc biến môi trường.",
        },
        { status: 400 }
      );
    }

    let restaurantName = "Nhà hàng";
    const nameVal = map.get("restaurant_name");
    if (nameVal) {
      restaurantName =
        typeof nameVal === "string" ? nameVal.replace(/^"|"$/g, "") : String(nameVal);
    }

    // 3. Truy vấn dữ liệu báo cáo ngày
    const reportData = await getDailyReportPageData(targetDate);

    // 4. Định dạng và gửi qua Telegram
    const message = formatDailyTelegramReport(reportData, restaurantName);
    const result = await sendTelegramMessage(message, { botToken, chatId });

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error || "Gửi tin nhắn Telegram thất bại" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      date: targetDate,
      messageId: result.messageId,
      summary: {
        revenue: reportData.summary.revenue,
        cogs_total: reportData.summary.cogs_total,
        food_cost_pct: reportData.summary.food_cost_pct,
        net_profit: reportData.summary.net_profit,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleTelegramReportRequest(req);
}

export async function POST(req: NextRequest) {
  return handleTelegramReportRequest(req);
}
