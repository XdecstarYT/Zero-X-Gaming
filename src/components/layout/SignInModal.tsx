"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { validatePassword } from "@/lib/auth";
import { ACTIVATION_HINT, accountEmail, accountError, validateAccountName } from "@/lib/zxg-account";
import { toast } from "@/store/toast";
import { cn } from "@/lib/cn";

type Mode = "sign_in" | "sign_up";

const inputCls =
  "h-11 w-full rounded-md border border-border bg-bg px-3 text-sm placeholder:text-subtle focus:border-cyan focus:outline-none aria-[invalid=true]:border-danger";

/**
 * ZXG Account sign-in / sign-up: an account name and a password. No email,
 * no third-party logins.
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
  const ids = { name: `${uid}-name`, hint: `${uid}-hint`, password: `${uid}-password`, confirm: `${uid}-confirm` };
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setError(null);
    setPassword("");
    setConfirm("");
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const problem =
      validateAccountName(name) ??
      validatePassword(password) ??
      (mode === "sign_up" && password !== confirm ? "Passwords don't match." : null);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const email = accountEmail(name);

    if (mode === "sign_in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: name.trim() } },
    });
    setBusy(false);
    if (error) return setError(accountError(error));
    if (!data.session) return setError(ACTIVATION_HINT);
    toast(`Welcome to Zero X, ${name.trim()}!`, { description: "Your ZXG account is ready.", tone: "success" });
    close();
    router.refresh();
  }

  if (!supabase) {
    return (
      <Modal open={open} onClose={close} title="ZXG Account">
        <p className="text-sm text-muted">
          Accounts aren&apos;t switched on for this site yet. You can still play as a guest: your progress is saved on
          this device.
        </p>
        <p className="mt-3 rounded-md bg-surface-2 p-3 text-xs text-muted">
          Site owner: add <code className="font-mono text-text">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-mono text-text">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to your hosting environment
          variables, then redeploy.
        </p>
        <Button onClick={close} className="mt-5 w-full">
          Play as guest
        </Button>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={close} title={mode === "sign_in" ? "Sign in to ZXG" : "Create a ZXG Account"}>
      <p className="text-sm text-muted">
        No email needed. Just an account name and a password. Save progress, coins and your Locker across devices.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-5 grid gap-3">
        <div>
          <label htmlFor={ids.name} className="mb-1 block text-sm font-semibold">
            Account name
          </label>
          <input
            id={ids.name}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-describedby={ids.hint}
            className={inputCls}
          />
          <p id={ids.hint} className="mt-1 text-xs text-subtle">
            3–20 letters, numbers, or underscores. This is also your player name.
          </p>
        </div>
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
            <p className="mt-1 text-xs text-subtle">
              There&apos;s no email to reset it with, so keep your password somewhere safe.
            </p>
          </div>
        )}

        <p role="alert" className={cn("min-h-5 text-sm text-danger", !error && "sr-only")}>
          {error}
        </p>

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "sign_in" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        {mode === "sign_in" ? "New here?" : "Already have a ZXG account?"}{" "}
        <button
          type="button"
          className="font-semibold text-cyan underline underline-offset-2"
          onClick={() => {
            setMode(mode === "sign_in" ? "sign_up" : "sign_in");
            setError(null);
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
