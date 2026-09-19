import type { AiKeyItem, AiProvider, AiSettingsConfig, KeyTestResult } from "@/types/ai-settings";

export function maskApiKey(key: string): string {
  if (!key) return "";
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "••••••••";
  const start = trimmed.slice(0, 4);
  const end = trimmed.slice(-4);
  return `${start}••••••••${end}`;
}

/** Trạng thái rate limit của các key trong bộ nhớ node */
interface RuntimeKeyHealth {
  rateLimitedUntil: number; // ms timestamp
  consecutiveFailures: number;
  lastUsedAt: number;
}

const runtimeHealthMap = new Map<string, RuntimeKeyHealth>();
const roundRobinIndices: Record<string, number> = {
  groq: 0,
  gemini: 0,
  openai: 0,
  all: 0,
};

/**
 * Đọc cấu hình AI & API Keys từ bảng `app_settings` kết hợp biến môi trường `.env.local`
 */
export async function loadAiConfig(): Promise<AiSettingsConfig> {
  const defaultKeys: AiKeyItem[] = [];

  // 1. Quét biến môi trường (.env.local)
  const envGroq = process.env.GROQ_API_KEY || "";
  const envGroqMulti = process.env.GROQ_API_KEYS || "";
  const allEnvGroq = [
    ...envGroq.split(",").map((k) => k.trim()),
    ...envGroqMulti.split(",").map((k) => k.trim()),
  ].filter(Boolean);

  const uniqueEnvGroq = Array.from(new Set(allEnvGroq));
  uniqueEnvGroq.forEach((k, idx) => {
    defaultKeys.push({
      id: `env-groq-${idx + 1}`,
      provider: "groq",
      key: k,
      name: `Groq (Mặc định từ .env ${idx + 1})`,
      status: "active",
      isEnvKey: true,
    });
  });

  const envGemini = process.env.GEMINI_API_KEY || "";
  const envGeminiMulti = process.env.GEMINI_API_KEYS || "";
  const allEnvGemini = [
    ...envGemini.split(",").map((k) => k.trim()),
    ...envGeminiMulti.split(",").map((k) => k.trim()),
  ].filter(Boolean);

  const uniqueEnvGemini = Array.from(new Set(allEnvGemini));
  uniqueEnvGemini.forEach((k, idx) => {
    defaultKeys.push({
      id: `env-gemini-${idx + 1}`,
      provider: "gemini",
      key: k,
      name: `Google Gemini (Mặc định từ .env ${idx + 1})`,
      status: "active",
      isEnvKey: true,
    });
  });

  const envOpenai = process.env.OPENAI_API_KEY || "";
  if (envOpenai.trim()) {
    defaultKeys.push({
      id: "env-openai-1",
      provider: "openai",
      key: envOpenai.trim(),
      name: "OpenAI (Mặc định từ .env)",
      status: "active",
      isEnvKey: true,
    });
  }

  // 2. Đọc từ database bảng `app_settings`
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "ai_settings")
      .maybeSingle();

    if (!error && data?.value && typeof data.value === "object") {
      const stored = data.value as unknown as AiSettingsConfig;
      const storedKeys = Array.isArray(stored.keys) ? stored.keys : [];

      // Hợp nhất: Thêm các key từ DB (không trùng lặp key)
      const existingKeySet = new Set(storedKeys.map((k) => k.key));
      const finalKeys = [...storedKeys];

      for (const envK of defaultKeys) {
        if (!existingKeySet.has(envK.key)) {
          finalKeys.push(envK);
        }
      }

      // Gắn trạng thái rate limit từ runtime cache
      const now = Date.now();
      const hydratedKeys = finalKeys.map((k) => {
        const health = runtimeHealthMap.get(k.key);
        if (health && health.rateLimitedUntil > now) {
          return {
            ...k,
            status: "rate_limited" as const,
            rateLimitedUntil: health.rateLimitedUntil,
          };
        }
        return k;
      });

      return {
        keys: hydratedKeys,
        rotationStrategy: stored.rotationStrategy || "round_robin",
        autoRotateOnRateLimit: stored.autoRotateOnRateLimit ?? true,
        primaryProvider: stored.primaryProvider || "auto",
      };
    }
  } catch (err) {
    console.warn("Không thể tải ai_settings từ database, dùng env fallback:", err);
  }

  // Mặc định nếu DB chưa có
  return {
    keys: defaultKeys,
    rotationStrategy: "round_robin",
    autoRotateOnRateLimit: true,
    primaryProvider: "auto",
  };
}

/**
 * Lấy API key tiếp theo khả dụng cho một Provider cụ thể.
 * Áp dụng chiến lược Round-Robin hoặc Failover, tự động bỏ qua các key đang bị Rate Limit.
 */
export async function getNextAvailableKey(
  preferredProvider?: AiProvider,
  excludedKeys: string[] = []
): Promise<{ key: string; provider: AiProvider; name: string; id: string } | null> {
  const config = await loadAiConfig();
  const now = Date.now();

  // Lọc các key đang active và không bị rate limit
  const activeKeys = config.keys.filter((k) => {
    if (k.status === "paused" || k.status === "invalid") return false;
    if (excludedKeys.includes(k.key)) return false;

    const health = runtimeHealthMap.get(k.key);
    if (health && health.rateLimitedUntil > now) {
      return false; // Key đang trong thời gian chờ cooldown
    }
    return true;
  });

  if (activeKeys.length === 0) {
    return null;
  }

  // Xác định provider ưu tiên: tham số hoặc cấu hình
  const targetProvider = preferredProvider || (config.primaryProvider !== "auto" ? config.primaryProvider : undefined);

  let candidateKeys = targetProvider
    ? activeKeys.filter((k) => k.provider === targetProvider)
    : activeKeys;

  // Nếu provider được yêu cầu đã hết key khả dụng (hoặc đều bị 429), lập tức fallback sang provider khác
  if (candidateKeys.length === 0) {
    const providerOrder: AiProvider[] = ["groq", "gemini", "openai"];
    for (const p of providerOrder) {
      if (p === targetProvider) continue;
      const pKeys = activeKeys.filter((k) => k.provider === p);
      if (pKeys.length > 0) {
        candidateKeys = pKeys;
        break;
      }
    }
  }

  if (candidateKeys.length === 0) {
    candidateKeys = activeKeys;
  }

  if (candidateKeys.length === 0) {
    return null;
  }

  // Chiến lược chọn key:
  if (config.rotationStrategy === "round_robin" && candidateKeys.length > 1) {
    const pKey = targetProvider || "all";
    const lastIdx = roundRobinIndices[pKey] || 0;
    const nextIdx = (lastIdx + 1) % candidateKeys.length;
    roundRobinIndices[pKey] = nextIdx;

    const chosen = candidateKeys[nextIdx];
    return { key: chosen.key, provider: chosen.provider, name: chosen.name, id: chosen.id };
  }

  // Mặc định: Lấy key đầu tiên khả dụng
  const chosen = candidateKeys[0];
  return { key: chosen.key, provider: chosen.provider, name: chosen.name, id: chosen.id };
}

/**
 * Đánh dấu một key vừa bị 429 Rate Limit
 */
export function recordKeyRateLimit(key: string, waitSeconds: number): void {
  const now = Date.now();
  const cooldownMs = Math.max(waitSeconds, 30) * 1000;
  const current = runtimeHealthMap.get(key) || {
    rateLimitedUntil: 0,
    consecutiveFailures: 0,
    lastUsedAt: now,
  };

  runtimeHealthMap.set(key, {
    ...current,
    rateLimitedUntil: now + cooldownMs,
    consecutiveFailures: current.consecutiveFailures + 1,
    lastUsedAt: now,
  });

  console.warn(`[AI Key Rotator] Key ${maskApiKey(key)} bị 429 Rate Limit. Đã khóa tạm thời trong ${Math.ceil(cooldownMs / 1000)}s.`);
}

/**
 * Ghi nhận key hoạt động thành công
 */
export function recordKeySuccess(key: string): void {
  runtimeHealthMap.set(key, {
    rateLimitedUntil: 0,
    consecutiveFailures: 0,
    lastUsedAt: Date.now(),
  });
}

/**
 * Kiểm tra kết nối trực tiếp của một API key
 */
export async function testApiKeyConnectivity(
  provider: AiProvider,
  key: string
): Promise<KeyTestResult> {
  const start = Date.now();
  try {
    if (provider === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.trim()}`,
        },
        body: JSON.stringify({
          model: "qwen/qwen3.8-27b",
          messages: [{ role: "user", content: "Ping" }],
          max_tokens: 2,
        }),
      });

      const latencyMs = Date.now() - start;
      if (res.status === 200) {
        return {
          success: true,
          provider,
          message: `Kết nối thành công (${latencyMs}ms). Model qwen3.8-27b sẵn sàng.`,
          latencyMs,
        };
      }

      if (res.status === 429) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson.error?.message || "";
        return {
          success: false,
          provider,
          message: `Key hợp lệ nhưng đang chạm trần Rate Limit: ${errMsg}`,
          latencyMs,
        };
      }

      if (res.status === 401) {
        return {
          success: false,
          provider,
          message: "API Key không hợp lệ hoặc đã bị vô hiệu hóa (401 Unauthorized).",
          latencyMs,
        };
      }

      const txt = await res.text();
      return {
        success: false,
        provider,
        message: `Lỗi kết nối Groq (${res.status}): ${txt.slice(0, 150)}`,
        latencyMs,
      };
    }

    if (provider === "gemini") {
      const modelsToTry = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-2.5-flash"];
      let lastErrMsg = "";
      let hitRateLimit = false;

      for (const model of modelsToTry) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key.trim()}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: "Ping" }] }],
              generationConfig: { maxOutputTokens: 2 },
            }),
          }
        );

        const latencyMs = Date.now() - start;
        if (res.status === 200) {
          return {
            success: true,
            provider,
            message: `Kết nối thành công (${latencyMs}ms). Model ${model} sẵn sàng.`,
            latencyMs,
          };
        }

        if (res.status === 400 || res.status === 403) {
          return {
            success: false,
            provider,
            message: `API Key Gemini không hợp lệ hoặc chưa bật dịch vụ Generative AI (${res.status}).`,
            latencyMs,
          };
        }

        if (res.status === 429) {
          hitRateLimit = true;
          lastErrMsg = `Key tạm thời vượt hạn mức (Quota/Rate limit 429) cho model ${model}`;
          continue; // thử model khác
        }

        const txt = await res.text();
        lastErrMsg = `(${res.status}): ${txt.slice(0, 150)}`;
        if (res.status === 404) {
          continue; // thử model tiếp theo trong danh sách
        }
      }

      return {
        success: false,
        provider,
        message: hitRateLimit
          ? `Lỗi kết nối Gemini: Key đã chạm hạn mức sử dụng (Rate Limit / Quota 429). Hệ thống sẽ tự động xoay vòng sang key dự phòng hoặc Groq khi cần.`
          : `Lỗi kết nối Gemini: ${lastErrMsg}`,
        latencyMs: Date.now() - start,
      };
    }

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.trim()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "Ping" }],
          max_tokens: 2,
        }),
      });

      const latencyMs = Date.now() - start;
      if (res.status === 200) {
        return {
          success: true,
          provider,
          message: `Kết nối thành công (${latencyMs}ms). GPT-4o-mini sẵn sàng.`,
          latencyMs,
        };
      }

      return {
        success: false,
        provider,
        message: `Lỗi kết nối OpenAI (${res.status}).`,
        latencyMs,
      };
    }

    return {
      success: false,
      provider,
      message: `Nhà cung cấp ${provider} chưa được hỗ trợ kiểm tra.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      provider,
      message: `Không thể kết nối mạng: ${msg}`,
      latencyMs: Date.now() - start,
    };
  }
}
