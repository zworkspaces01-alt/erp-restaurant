import { formatDate, formatNumber, formatPercent, formatVND } from "@/lib/format";
import type { DailyReportPageData } from "@/lib/queries/reports.queries";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled?: boolean;
}

/**
 * Gửi tin nhắn qua Telegram Bot API (sử dụng định dạng HTML).
 */
export async function sendTelegramMessage(
  text: string,
  config?: Partial<TelegramConfig>
): Promise<{ success: boolean; error?: string; messageId?: number }> {
  const botToken =
    config?.botToken ||
    process.env.TELEGRAM_BOT_TOKEN ||
    "";
  const chatId =
    config?.chatId ||
    process.env.TELEGRAM_CHAT_ID ||
    "";

  if (!botToken.trim()) {
    return {
      success: false,
      error: "Chưa cấu hình Telegram Bot Token. Vui lòng cung cấp Bot Token từ @BotFather.",
    };
  }

  if (!chatId.trim()) {
    return {
      success: false,
      error: "Chưa cấu hình Telegram Chat ID. Vui lòng cung cấp Chat ID người nhận hoặc ID nhóm.",
    };
  }

  const url = `https://api.telegram.org/bot${botToken.trim()}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId.trim(),
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      let desc = data.description || `Lỗi HTTP ${res.status}`;
      if (desc.includes("chat not found")) {
        desc = "Không tìm thấy Chat ID. Nếu gửi tin nhắn cá nhân, bạn phải bấm /start với bot trước; nếu gửi nhóm, bạn phải thêm bot vào nhóm.";
      } else if (desc.includes("Unauthorized")) {
        desc = "Bot Token không hợp lệ. Vui lòng kiểm tra lại token từ @BotFather.";
      }
      return { success: false, error: desc };
    }

    return { success: true, messageId: data.result?.message_id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi kết nối tới Telegram API";
    return { success: false, error: msg };
  }
}

/**
 * Kiểm tra kết nối Telegram Bot và gửi tin nhắn kiểm thử.
 */
export async function testTelegramConnection(
  botToken: string,
  chatId: string
): Promise<{ success: boolean; error?: string }> {
  const text = `🔔 <b>Kết Nối Telegram Thành Công!</b>\n\nBot đã sẵn sàng gửi báo cáo tiêu hao nguyên liệu & kết quả kinh doanh tự động từ <b>Restaurant ERP</b>.`;
  return sendTelegramMessage(text, { botToken, chatId });
}

/**
 * Định dạng bản tin báo cáo tiêu hao nguyên liệu và lỗ lãi theo ngày gửi qua Telegram.
 */
export function formatDailyTelegramReport(
  data: DailyReportPageData,
  restaurantName: string = "Nhà hàng"
): string {
  const s = data.summary;
  const dateFormatted = formatDate(data.date);

  // Đánh giá tỷ lệ Food Cost
  let fcEvalEmoji = "🟢";
  let fcEvalText = "Rất tốt (< 30%)";
  if (s.revenue <= 0) {
    fcEvalEmoji = "⚪";
    fcEvalText = "Chưa có doanh thu";
  } else if (s.food_cost_pct <= 30) {
    fcEvalEmoji = "🟢";
    fcEvalText = "Rất tốt (Lợi nhuận cao)";
  } else if (s.food_cost_pct <= 35) {
    fcEvalEmoji = "🟢";
    fcEvalText = "Lý tưởng (Chuẩn F&B 30-35%)";
  } else if (s.food_cost_pct <= 40) {
    fcEvalEmoji = "🟡";
    fcEvalText = "Hơi cao (Cần chú ý)";
  } else {
    fcEvalEmoji = "🔴";
    fcEvalText = "Nguy hiểm (> 40% doanh thu)";
  }

  // Top nguyên liệu tiêu hao nhiều nhất (Top 5)
  const topIngredients = data.ingredients.slice(0, 5);
  let ingListText = "";

  if (topIngredients.length > 0) {
    ingListText = topIngredients
      .map((it, idx) => {
        const costStr = formatVND(it.total_cost);
        const qtyStr = `${formatNumber(it.total_qty, 2)} ${it.base_unit}`;
        const pctDtStr = s.revenue > 0 ? ` (${it.pct_of_revenue.toFixed(1)}% DT)` : "";
        return `${idx + 1}. <b>${it.ingredient_name}</b>: ${qtyStr}\n   └ <i>${costStr}${pctDtStr}</i>`;
      })
      .join("\n");
  } else {
    ingListText = "<i>(Không có phát sinh tiêu hao nguyên liệu)</i>";
  }

  const lines = [
    `📊 <b>BÁO CÁO KINH DOANH & TIÊU HAO NGUYÊN LIỆU</b>`,
    `🏪 <b>${restaurantName}</b>`,
    `📅 Ngày: <code>${dateFormatted}</code>`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `💰 <b>1. KẾT QUẢ KINH DOANH NGÀY</b>`,
    `• <b>Doanh thu:</b> <b>${formatVND(s.revenue)}</b> (${formatNumber(s.order_count, 0)} đơn)`,
    `• <b>Giá trị TB/đơn:</b> ${formatVND(s.avg_order_value)}`,
    `• <b>Chi phí nguyên liệu (COGS):</b> ${formatVND(s.cogs_total)}`,
    `  ├ Bán ra qua món: ${formatVND(s.cogs_sales)}`,
    `  └ Hao hụt / hủy: ${formatVND(s.cogs_waste)}`,
    `• <b>Lợi nhuận gộp:</b> ${formatVND(s.gross_profit)} (${formatPercent(s.gross_margin_pct)})`,
    `• <b>Chi phí vận hành:</b> ${formatVND(s.opex_total)}`,
    `• <b>Chi phí nhân sự:</b> ${formatVND(s.labor_cost)}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🏆 <b>LỢI NHUẬN RÒNG:</b> <b>${formatVND(s.net_profit)}</b> (${s.revenue > 0 ? formatPercent(s.net_margin_pct) : "0%"})`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🥗 <b>2. TỶ LỆ FOOD COST / DOANH THU</b>`,
    `• <b>% Chi phí nguyên liệu:</b> <b>${s.revenue > 0 ? formatPercent(s.food_cost_pct) : "—"}</b>`,
    `• <b>Đánh giá:</b> ${fcEvalEmoji} <i>${fcEvalText}</i>`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📋 <b>3. TOP NGUYÊN LIỆU TIÊU HAO NHIỀU NHẤT</b>`,
    ingListText,
    ``,
    `<i>Báo cáo tự động từ Restaurant ERP · ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</i>`,
  ];

  return lines.join("\n");
}
