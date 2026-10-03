"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { validatePassword } from "@/lib/auth";
import { accountError, isAccountEmail } from "@/lib/zxg-account";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/toast";

const inputCls = "h-11 w-full rounded-md border border-border bg-bg px-3 text-sm placeholder:text-subtle focus:border-cyan focus:outline-none";

/**
 * Your account's email (optional: add, change or remove it) and password. A
 * reset link from "Forgot password?" lands here with ?reset=1.
 */
export function AccountSecurity() {
  const status = useAuth((s) => s.status);
  const current = useAuth((s) => s.email);
  const uid = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);
  const hasEmail = !!current && !isAccountEmail(current);

  useEffect(() => {
    const t = window.setTimeout(() => setReset(new URLSearchParams(window.location.search).get("reset") === "1"), 0);
    return () => clearTimeout(t);
  }, []);

  if (status !== "signed_in") return null;
  const supabase = getSupabaseBrowser();
  if (!supabase) return null;
  const untyped = supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string; code?: string } | null }> };

  const saveEmail = async (value: string) => {
    setError(null);
    setBusy(true);
    const { error } = await untyped.rpc("zxg_set_email", { p_email: value });
    if (!error) {
      // A fresh token carries the new address.
      const { data } = await supabase.auth.refreshSession();
      useAuth.getState().set({ email: data.user?.email ?? null });
    }
    setBusy(false);
    if (error) return setError(accountError(error));
    setEmail("");
    toast(value ? "Email saved. You can sign in with it or your account name." : "Email removed. Sign in with your account name.", { tone: "success" });
  };

  const onEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("That email address doesn't look right.");
    void saveEmail(email.trim());
  };

  const onPassword = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validatePassword(password) ?? (password !== confirm ? "Passwords don't match." : null);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(accountError(error));
    setPassword("");
    setConfirm("");
    setReset(false);
    toast("Password changed.", { tone: "success" });
  };

  return (
    <section aria-labelledby={`${uid}-title`} className="rounded-xl border border-border bg-surface p-4 sm:p-5" data-testid="account-security">
      <h2 id={`${uid}-title`} className="font-display text-lg font-bold uppercase tracking-wide">
        Account
      </h2>
      {reset && <p className="mt-2 rounded-md bg-cyan/10 p-2 text-sm text-cyan">You&apos;re signed in from your reset link. Set a new password below.</p>}

      <h3 className="mt-4 text-sm font-semibold">Email (optional)</h3>
      <p className="mt-1 text-sm text-muted">{hasEmail ? `${current}: sign in with it or your account name, and reset your password if you forget it.` : "None. You sign in with your account name. Add one so you can reset a forgotten password."}</p>
      <form onSubmit={onEmail} className="mt-2 flex flex-col gap-2 sm:flex-row" noValidate>
        <label htmlFor={`${uid}-email`} className="sr-only">
          {hasEmail ? "New email" : "Email"}
        </label>
        <input id={`${uid}-email`} type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={hasEmail ? "New email" : "you@example.com"} className={inputCls} />
        <Button type="submit" disabled={busy}>
          {hasEmail ? "Change" : "Add email"}
        </Button>
        {hasEmail && (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void saveEmail("")}>
            Remove
          </Button>
        )}
      </form>

      <h3 className="mt-5 text-sm font-semibold">{reset ? "New password" : "Change password"}</h3>
      <form onSubmit={onPassword} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" noValidate>
        <label htmlFor={`${uid}-pw`} className="sr-only">
          New password
        </label>
        <input id={`${uid}-pw`} type="password" autoComplete="new-password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        <label htmlFor={`${uid}-pw2`} className="sr-only">
          Confirm new password
        </label>
        <input id={`${uid}-pw2`} type="password" autoComplete="new-password" placeholder="Confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
        <Button type="submit" disabled={busy}>
          Save
        </Button>
      </form>
      <p role="alert" className={error ? "mt-2 text-sm text-danger" : "sr-only"}>
        {error}
      </p>
    </section>
  );
}
