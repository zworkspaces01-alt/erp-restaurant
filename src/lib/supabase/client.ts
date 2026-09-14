"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { fetchWithJwtClockSkewRetry } from "./fetch";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "";

  return createBrowserClient<Database>(
    supabaseUrl,
    supabaseKey,
    {
      global: {
        fetch: fetchWithJwtClockSkewRetry,
      },
    }
  );
}
