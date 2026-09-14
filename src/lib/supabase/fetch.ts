/**
 * Custom fetch wrapper for Supabase clients.
 *
 * Catches transient clock-skew errors between GoTrue (which mints JWTs) and PostgREST
 * (which verifies them with zero leeway). In Docker / local development, if PostgREST's
 * clock is even a few milliseconds behind GoTrue when a token is issued or refreshed,
 * PostgREST returns HTTP 401 with message "JWT issued at future".
 *
 * Waiting 1 second and retrying once allows the token timestamp to fall in the past,
 * resolving the request smoothly without failing the user experience.
 */
export const fetchWithJwtClockSkewRetry: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);

  if (res.status === 401) {
    try {
      const clone = res.clone();
      const body = await clone.json();
      if (
        typeof body?.message === "string" &&
        body.message.toLowerCase().includes("jwt issued at future")
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return await fetch(input, init);
      }
    } catch {
      // Body was not JSON or already consumed; return original response
    }
  }

  return res;
};
