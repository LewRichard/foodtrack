// Cleanup for the Supabase settings, shared by the app and the server.

/**
 * The project's base address. Copied values often include an API path (".../rest/v1/") or are the
 * dashboard link (".../dashboard/project/<ref>"); both make every request fail with "Invalid path".
 * Invisible characters (zero-width or non-breaking spaces) and quotes from copy-paste are removed.
 */
export function projectUrl(raw: string): string {
  const cleaned = raw.replace(/[^\x21-\x7E]|["']/g, "");
  if (!cleaned) return "";
  try {
    const u = new URL(cleaned.includes("://") ? cleaned : `https://${cleaned}`);
    const dashboard = u.pathname.match(/\/project\/([a-z0-9]+)/i);
    if (u.hostname.endsWith("supabase.com") && dashboard) return `https://${dashboard[1]}.supabase.co`;
    return u.origin;
  } catch {
    return cleaned.replace(/\/+$/, "");
  }
}

/** Keeps only characters a Supabase key can contain (copy-paste can add invisible ones). */
export function supabaseKey(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]/g, "");
}
