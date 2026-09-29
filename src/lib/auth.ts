/** Shared, framework-free auth helpers (unit tested). */

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const MIN_PASSWORD_LENGTH = 8;

export function validateUsername(name: string): string | null {
  if (name.length < 3) return "Usernames need at least 3 characters.";
  if (name.length > 20) return "Usernames can be at most 20 characters.";
  if (!USERNAME_RE.test(name)) return "Use only letters, numbers, and underscores.";
  return null;
}

export function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : "Enter a valid email address.";
}

export function validatePassword(pw: string): string | null {
  return pw.length >= MIN_PASSWORD_LENGTH ? null : `Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`;
}

/**
 * Only allow same-origin relative redirects after auth ("/profile", not
 * "//evil.com" or "https://evil.com"), to prevent open redirects.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** Map Supabase / Postgres errors to player-facing copy. */
export function friendlyAuthError(err: { message?: string; code?: string } | null | undefined): string {
  if (!err) return "Something went wrong. Please try again.";
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "Wrong email or password.";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed"))
    return "Confirm your email first. Check your inbox for the link.";
  if (code === "user_already_exists" || msg.includes("already registered"))
    return "An account with this email already exists. Try signing in.";
  if (code === "weak_password") return "That password is too weak. Try a longer one.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || msg.includes("rate limit"))
    return "Too many attempts. Wait a minute and try again.";
  if (code === "23505") return "That username is taken.";
  if (code === "23514") return "That username isn't allowed.";
  if (msg.includes("failed to fetch") || msg.includes("network"))
    return "Can't reach the server. Check your connection.";
  return err.message || "Something went wrong. Please try again.";
}

/** Merge guest favorites into the account's, keeping local order first and dropping unknown games. */
export function mergeFavorites(local: string[], remote: string[], known: Set<string>) {
  const merged = [...new Set([...local, ...remote])].filter((s) => known.has(s));
  const toUpload = local.filter((s) => known.has(s) && !remote.includes(s));
  return { merged, toUpload: [...new Set(toUpload)] };
}
