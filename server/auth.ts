import { projectUrl, supabaseKey } from "../shared/supabase.ts";

/** Returns the user id for a Supabase access token, or null if it isn't valid. */
export type VerifyUser = (token: string) => Promise<string | null>;

const CACHE_MS = 5 * 60 * 1000;

/**
 * Checks sign-in tokens with Supabase (the same project the app uses, from VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY). Results are cached briefly so each scan doesn't wait on an extra request.
 * Returns null when Supabase isn't configured, so the server works without accounts too.
 */
export function supabaseVerifier(env: NodeJS.ProcessEnv = process.env, fetchFn: typeof fetch = fetch): VerifyUser | null {
  const url = projectUrl(env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? "");
  const key = supabaseKey(env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? "");
  if (!url || !key) return null;

  const cache = new Map<string, { userId: string | null; until: number }>();
  return async (token) => {
    const now = Date.now();
    const hit = cache.get(token);
    if (hit && hit.until > now) return hit.userId;
    let userId: string | null = null;
    try {
      const res = await fetchFn(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const user = (await res.json()) as { id?: string };
        userId = typeof user.id === "string" ? user.id : null;
      } else if (res.status >= 500) {
        return null; // Supabase trouble: don't cache, try again next time
      }
    } catch {
      return null;
    }
    if (cache.size > 2000) cache.clear();
    cache.set(token, { userId, until: now + CACHE_MS });
    return userId;
  };
}
