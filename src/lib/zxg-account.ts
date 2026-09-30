/**
 * ZXG Accounts (ZXG-ACC): an account name + password, no email.
 *
 * Supabase Auth identifies users by email, so each account gets a hidden,
 * undeliverable address: `<name>@zxg-acc.invalid`. The `.invalid` TLD is
 * reserved (RFC 2606) and can never receive mail, so nothing is ever sent.
 * This needs "Confirm email" turned off in Supabase Auth (otherwise sign-up
 * waits for a confirmation that can't arrive; see ACTIVATION_HINT).
 */

import { USERNAME_RE } from "./auth";

export const ACCOUNT_DOMAIN = "zxg-acc.invalid";

export function accountEmail(name: string) {
  return `${name.trim().toLowerCase()}@${ACCOUNT_DOMAIN}`;
}

export function isAccountEmail(email: string | null | undefined) {
  return !!email && email.endsWith(`@${ACCOUNT_DOMAIN}`);
}

/** The account name behind a hidden account address (null for other sign-in types). */
export function accountNameFromEmail(email: string | null | undefined) {
  return isAccountEmail(email) ? email!.slice(0, -(ACCOUNT_DOMAIN.length + 1)) : null;
}

/** Public account ID shown on the profile, e.g. "ZXG-ACC-3F9A12BC". */
export function accountTag(userId: string) {
  return `ZXG-ACC-${userId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function validateAccountName(name: string): string | null {
  const n = name.trim();
  if (n.length < 3) return "Account names need at least 3 characters.";
  if (n.length > 20) return "Account names can be at most 20 characters.";
  if (!USERNAME_RE.test(n)) return "Use only letters, numbers, and underscores.";
  return null;
}

export const ACTIVATION_HINT =
  "Accounts are almost ready. Site owner: in Supabase → Authentication → Sign In / Providers → Email, turn off \"Confirm email\".";

/** Player-facing copy for ZXG account errors. */
export function accountError(err: { message?: string; code?: string } | null | undefined): string {
  if (!err) return "Something went wrong. Please try again.";
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "Wrong account name or password.";
  if (code === "user_already_exists" || msg.includes("already registered")) return "That account name is taken. Try another.";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed") || msg.includes("confirmation"))
    return ACTIVATION_HINT;
  if (code === "email_address_invalid" || msg.includes("email address") || code === "email_provider_disabled" || msg.includes("signups not allowed"))
    return "Account sign-ups are switched off on this site right now.";
  if (code === "weak_password") return "That password is too weak. Try a longer one.";
  if (code === "over_request_rate_limit" || msg.includes("rate limit")) return "Too many attempts. Wait a minute and try again.";
  if (msg.includes("failed to fetch") || msg.includes("network")) return "Can't reach the server. Check your connection.";
  return err.message || "Something went wrong. Please try again.";
}
