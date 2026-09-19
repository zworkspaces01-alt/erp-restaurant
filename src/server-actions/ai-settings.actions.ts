"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { fail, ok, type ActionResult } from "@/types/actions";
import type { Json } from "@/types/database";
import type { AiSettingsConfig, KeyTestResult, AiProvider } from "@/types/ai-settings";
import { loadAiConfig, testApiKeyConnectivity } from "@/lib/ai/api-key-rotator";

/**
 * Lấy cấu hình danh sách AI API Keys và cài đặt xoay vòng
 */
export async function getAiSettingsAction(): Promise<ActionResult<AiSettingsConfig>> {
  try {
    const { authorized } = await requireAuth(["owner", "manager"]);
    if (!authorized) {
      return fail("Bạn không có quyền xem cấu hình hệ thống AI.");
    }

    const config = await loadAiConfig();
    return ok(config);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi khi lấy cấu hình AI.";
    return fail(msg);
  }
}

/**
 * Lưu danh sách AI API Keys và cấu hình xoay vòng vào bảng `app_settings`
 */
export async function saveAiSettingsAction(
  config: AiSettingsConfig
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const { authorized } = await requireAuth(["owner"]);
    if (!authorized) {
      return fail("Chỉ Chủ nhà hàng (Owner) mới có quyền thay đổi cấu hình API Key.");
    }

    const supabase = await createClient();

    // Làm sạch và kiểm tra dữ liệu trước khi lưu
    const cleanedKeys = (config.keys || [])
      .map((k) => ({
        id: k.id || `key-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        provider: k.provider,
        key: k.key.trim(),
        name: k.name.trim() || `API Key ${k.provider.toUpperCase()}`,
        status: k.status || "active",
        isEnvKey: Boolean(k.isEnvKey),
        lastUsedAt: k.lastUsedAt || null,
      }))
      .filter((k) => k.key.length > 0);

    const payload: AiSettingsConfig = {
      keys: cleanedKeys,
      rotationStrategy: config.rotationStrategy || "round_robin",
      autoRotateOnRateLimit: config.autoRotateOnRateLimit ?? true,
      primaryProvider: config.primaryProvider || "auto",
    };

    const { error } = await supabase.from("app_settings").upsert(
      {
        key: "ai_settings",
        value: payload as unknown as Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      return fail(`Lỗi khi lưu cấu hình vào cơ sở dữ liệu: ${error.message}`);
    }

    revalidatePath("/settings/ai");
    revalidatePath("/purchases");
    revalidatePath("/inventory");

    return ok({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi khi lưu cấu hình AI.";
    return fail(msg);
  }
}

/**
 * Kiểm tra trực tiếp tình trạng hoạt động của một API Key
 */
export async function testAiKeyAction(
  provider: AiProvider,
  key: string
): Promise<ActionResult<KeyTestResult>> {
  try {
    const { authorized } = await requireAuth(["owner", "manager"]);
    if (!authorized) {
      return fail("Bạn không có quyền kiểm tra API Key.");
    }

    if (!key || !key.trim()) {
      return fail("Vui lòng cung cấp API Key để kiểm tra.");
    }

    const result = await testApiKeyConnectivity(provider, key.trim());
    return ok(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi khi kiểm tra API Key.";
    return fail(msg);
  }
}
