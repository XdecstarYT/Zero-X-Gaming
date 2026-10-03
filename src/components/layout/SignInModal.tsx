"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { validatePassword } from "@/lib/auth";
import { ACTIVATION_HINT, accountEmail, accountError, validateAccountName } from "@/lib/zxg-account";
import { toast } from "@/store/toast";
import { createDeviceAccount, signInDeviceAccount } from "@/lib/device-accounts";
import { adoptGuestSave } from "@/lib/season-client";
import { refreshDeviceAuth } from "./AuthProvider";
import { cn } from "@/lib/cn";

type Mode = "sign_in" | "sign_up";

const inputCls =
  "h-11 w-full rounded-md border border-border bg-bg px-3 text-sm placeholder:text-subtle focus:border-cyan focus:outline-none aria-[invalid=true]:border-danger";

/**
 * ZXG Account sign-in / sign-up: an account name and a password, and an email
 * only if you want one (it lets you reset a forgotten password). Sign in with
 * either the account name or the email.
 */
export function SignInModal({
  open,
  onClose,
  initialMode = "sign_in",
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
}) {
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  const uid = useId();
  const ids = { name: `${uid}-name`, hint: `${uid}-hint`, email: `${uid}-email`, password: `${uid}-password`, confirm: `${uid}-confirm` };
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setError(null);
    setPassword("");
    setConfirm("");
    onClose();
  }

  /** Forgotten password: a reset link to the account's email (accounts without one can't be reset). */
  async function forgot() {
    setError(null);
    setNotice(null);
    const addr = name.trim();
    if (!supabase) return setError("Password resets need the online service.");
    if (!addr.includes("@")) return setError("Type the email on your account above, then press Forgot password. Accounts without an email can't be reset.");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(addr, { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/settings?reset=1")}` });
    setBusy(false);
    if (error) return setError(accountError(error));
    setNotice("If that email is on an account, a reset link is on its way. Check your inbox.");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const byEmail = mode === "sign_in" && name.includes("@");
    const problem =
      (byEmail ? null : validateAccountName(name)) ??
      (mode === "sign_up" && email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) ? "That email address doesn't look right." : null) ??
      validatePassword(password) ??
      (mode === "sign_up" && password !== confirm ? "Passwords don't match." : null);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);

    if (!supabase) {
      // No online service: the account lives in this browser.
      const res = mode === "sign_in" ? await signInDeviceAccount(name, password) : await createDeviceAccount(name, password);
      setBusy(false);
      if (!res.ok) return setError(res.error);
      if (mode === "sign_up") adoptGuestSave();
      refreshDeviceAuth();
      toast(mode === "sign_in" ? `Welcome back, ${res.account.username}!` : `Welcome to Zero X, ${res.account.username}!`, {
        description: mode === "sign_in" ? undefined : "Your ZXG account is ready.",
        tone: "success",
      });
      close();
      router.refresh();
      return;
    }
    const hidden = accountEmail(name);
    const untyped = supabase as unknown as { rpc: <T>(fn: string, args: Record<string, unknown>) => PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }> };

    if (mode === "sign_in") {
      let { error } = await supabase.auth.signInWithPassword({ email: byEmail ? name.trim() : hidden, password });
      if (error && !byEmail) {
        // An account with an email signs in under that address: find it (only given the right password).
        const { data: addr } = await untyped.rpc<string>("zxg_login_email", { p_name: name.trim(), p_password: password });
        if (addr && addr !== hidden) ({ error } = await supabase.auth.signInWithPassword({ email: addr, password }));
      }
      setBusy(false);
      if (error) return setError(accountError(error));
      toast("Welcome back!", { tone: "success" });
      close();
      router.refresh();
      return;
    }

    // Friendly early check: is the name free? (The database still enforces it.)
    const { data: taken } = await supabase.from("profiles").select("id").ilike("username", name.trim()).maybeSingle();
    if (taken) {
      setBusy(false);
      return setError("That account name is taken. Try another.");
    }
    // Accounts are made by the database (zxg_sign_up): Auth's own sign-up won't take the hidden addresses and
    // would wait on a confirmation email. Then it's an ordinary password sign-in.
    const address = email.trim() ? email.trim().toLowerCase() : hidden;
    const made = await untyped.rpc<null>("zxg_create_account", { p_name: name.trim(), p_password: password, p_email: email.trim() || null });
    if (made.error?.code === "PGRST202") {
      // A backend without that function (an older fork): fall back to Auth's sign-up.
      const { data, error } = await supabase.auth.signUp({ email: address, password, options: { data: { username: name.trim() } } });
      setBusy(false);
      if (error) return setError(accountError(error));
      if (!data.session) return setError(ACTIVATION_HINT);
    } else if (made.error) {
      setBusy(false);
      return setError(accountError(made.error));
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: address, password });
      setBusy(false);
      if (error) return setError(accountError(error));
    }
    toast(`Welcome to Zero X, ${name.trim()}!`, { description: "Your ZXG account is ready.", tone: "success" });
    close();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={close} title={mode === "sign_in" ? "Sign in to ZXG" : "Create a ZXG Account"}>
      <p className="text-sm text-muted">
        No email needed: just an account name and a password. Add an email if you like, so you can reset a forgotten password.{" "}
        {supabase
          ? "Save progress, coins and your Locker across devices."
          : "Your account, progress, coins and Locker are saved on this device."}
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-5 grid gap-3">
        <div>
          <label htmlFor={ids.name} className="mb-1 block text-sm font-semibold">
            {mode === "sign_in" && supabase ? "Account name or email" : "Account name"}
          </label>
          <input
            id={ids.name}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={mode === "sign_in" ? 254 : 20}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-describedby={ids.hint}
            className={inputCls}
          />
          <p id={ids.hint} className="mt-1 text-xs text-subtle">
            {mode === "sign_in" ? "Either works if your account has an email." : "3–20 letters, numbers, or underscores. This is also your player name."}
          </p>
        </div>
        {mode === "sign_up" && supabase && (
          <div>
            <label htmlFor={ids.email} className="mb-1 block text-sm font-semibold">
              Email <span className="font-normal text-subtle">(optional)</span>
            </label>
            <input
              id={ids.email}
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-subtle">Only for resetting your password. You can sign in with it too. Leave it blank to play without one.</p>
          </div>
        )}
        <div>
          <label htmlFor={ids.password} className="mb-1 block text-sm font-semibold">
            Password
          </label>
          <input
            id={ids.password}
            type="password"
            autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />
        </div>
        {mode === "sign_up" && (
          <div>
            <label htmlFor={ids.confirm} className="mb-1 block text-sm font-semibold">
              Confirm password
            </label>
            <input
              id={ids.confirm}
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputCls}
            />
            {!email.trim() && (
              <p className="mt-1 text-xs text-subtle">
                Without an email there&apos;s no way to reset it, so keep your password somewhere safe.
              </p>
            )}
          </div>
        )}

        <p role="alert" className={cn("min-h-5 text-sm text-danger", !error && "sr-only")}>
          {error}
        </p>
        {notice && (
          <p role="status" className="text-sm text-cyan">
            {notice}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "sign_in" ? "Sign in" : "Create account"}
        </Button>
      </form>

      {mode === "sign_in" && supabase && (
        <button type="button" onClick={() => void forgot()} className="mt-3 w-full text-center text-xs text-cyan underline underline-offset-2" disabled={busy}>
          Forgot password?
        </button>
      )}
      <p className="mt-4 text-center text-sm text-muted">
        {mode === "sign_in" ? "New here?" : "Already have a ZXG account?"}{" "}
        <button
          type="button"
          className="font-semibold text-cyan underline underline-offset-2"
          onClick={() => {
            setMode(mode === "sign_in" ? "sign_up" : "sign_in");
            setError(null);
            setNotice(null);
          }}
        >
          {mode === "sign_in" ? "Create a ZXG account" : "Sign in"}
        </button>
      </p>
      <button type="button" onClick={close} className="mt-2 w-full text-center text-xs text-subtle hover:text-text">
        Keep playing as a guest
      </button>
    </Modal>
  );
}
