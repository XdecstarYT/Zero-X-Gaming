import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth";

/**
 * Landing point for OAuth (Google / Discord) and email-confirmation links.
 * Handles both the PKCE `code` flow and `token_hash` email templates.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"));
  const fail = (reason: string) => NextResponse.redirect(new URL(`/auth/error?reason=${reason}`, url.origin));

  const supabase = await getSupabaseServer();
  if (!supabase) return fail("disabled");

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail("exchange");
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail("verify");
  } else {
    return fail(url.searchParams.get("error") ? "provider" : "missing");
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
