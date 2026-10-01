/**
 * "Sign in with Zero X": the Supabase OAuth 2.1 server. Third-party apps send
 * players to /oauth/consent?authorization_id=…; the consent screen shows who's
 * asking and for what, then approves or denies through supabase.auth.oauth.
 */

export const CONSENT_PATH = "/oauth/consent";

/** What each OAuth scope shares, in plain words. Unknown scopes are shown as-is. */
export const SCOPES: Record<string, { label: string; detail: string }> = {
  openid: { label: "Confirm it's you", detail: "Your Zero X account ID, so the app knows it's the same player each time." },
  email: { label: "Your email address", detail: "The email on your Zero X account." },
  profile: { label: "Your public profile", detail: "Your username and avatar." },
  phone: { label: "Your phone number", detail: "If your account has one." },
};

export function describeScopes(scope: string | null | undefined) {
  const ids = (scope ?? "").split(/\s+/).filter(Boolean);
  return [...new Set(ids)].map((id) => ({ id, ...(SCOPES[id] ?? { label: id, detail: "Access requested by the app." }) }));
}

/** Only ever send the browser to an http(s) URL (the OAuth client's redirect). */
export function safeRedirect(url: string | null | undefined) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The host to show for a client's site or redirect URI ("app.example.com"). */
export function hostOf(url: string | null | undefined) {
  try {
    return url ? new URL(url).host : "";
  } catch {
    return "";
  }
}
