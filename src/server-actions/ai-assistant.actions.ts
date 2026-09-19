"use server";

import { requireAuth } from "@/lib/auth";
import { fail, ok, type ActionResult } from "@/types/actions";
import { executeAiQuery, type AiAssistantQueryResult } from "@/lib/ai/ai-query-engine";

/**
 * Server action nhận câu hỏi tự nhiên và trả về phân tích dữ liệu kho/nhập hàng
 */
export async function askAiAssistantAction(
  userMessage: string
): Promise<ActionResult<AiAssistantQueryResult>> {
  try {
    const { authorized } = await requireAuth(["owner", "manager", "staff"]);
    if (!authorized) {
      return fail("Bạn không có quyền sử dụng Trợ lý AI.");
    }

    if (!userMessage || !userMessage.trim()) {
      return fail("Vui lòng nhập câu hỏi.");
    }

    const result = await executeAiQuery(userMessage.trim());
    return ok(result);
  } catch (err) {
    console.error("[askAiAssistantAction] Error:", err);
    const msg = err instanceof Error ? err.message : "Đã có lỗi xảy ra khi xử lý câu hỏi.";
    return fail(msg);
  }
}
