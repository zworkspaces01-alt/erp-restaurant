export type AiProvider = "groq" | "gemini" | "openai";

export type AiKeyStatus = "active" | "rate_limited" | "paused" | "invalid";

export interface AiKeyItem {
  id: string;
  provider: AiProvider;
  key: string; // Plain key
  name: string; // Descriptive label e.g. "Groq Tài khoản 1 (Cá nhân)"
  status: AiKeyStatus;
  rateLimitedUntil?: number | null; // Timestamp in ms until rate limit expires
  lastUsedAt?: string | null;
  successCount?: number;
  failureCount?: number;
  isEnvKey?: boolean; // True if loaded from .env.local
}

export interface AiSettingsConfig {
  keys: AiKeyItem[];
  rotationStrategy: "round_robin" | "failover";
  autoRotateOnRateLimit: boolean;
  primaryProvider: AiProvider | "auto";
}

export interface KeyTestResult {
  success: boolean;
  provider: AiProvider;
  message: string;
  latencyMs?: number;
}

export function maskApiKey(key: string): string {
  if (!key) return "";
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "••••••••";
  const start = trimmed.slice(0, 4);
  const end = trimmed.slice(-4);
  return `${start}••••••••${end}`;
}
