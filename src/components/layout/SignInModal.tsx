"use client";

import { useId, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { friendlyAuthError, validateEmail, validatePassword, validateUsername } from "@/lib/auth";
import { toast } from "@/store/toast";
import { cn } from "@/lib/cn";

type Mode = "sign_in" | "sign_up";
type OAuthProvider = "google" | "discord";

const inputCls =
  "h-11 w-full rounded-md border border-border bg-bg px-3 text-sm placeholder:text-subtle focus:border-cyan focus:outline-none aria-[invalid=true]:border-danger";

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
  const pathname = usePathname();
  const router = useRouter();
  const uid = useId();
  const ids = { email: `${uid}-email`, username: `${uid}-username`, hint: `${uid}-hint`, password: `${uid}-password` };
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "email" | OAuthProvider>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const callbackUrl = (next: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  function close() {
    setError(null);
    setSentTo(null);
    setPassword("");
    onClose();
  }

  async function onOAuth(provider: OAuthProvider) {
    if (!supabase) return;
    setBusy(provider);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: callbackUrl(pathname) } });
    if (error) {
      setError(friendlyAuthError(error));
      setBusy(null);
    }
    // On success the browser navigates away to the provider.
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const problem =
      validateEmail(email) ??
      validatePassword(password) ??
      (mode === "sign_up" && username ? validateUsername(username) : null);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy("email");
    setError(null);

    if (mode === "sign_in") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(null);
      if (error) return setError(friendlyAuthError(error));
      toast("Welcome back!", { tone: "success" });
      close();
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: callbackUrl("/profile"),
        data: username ? { username } : undefined,
      },
    });
    setBusy(null);
    if (error) return setError(friendlyAuthError(error));
    if (data.session) {
      toast("Account created. Welcome to Zero X!", { tone: "success" });
      close();
      router.refresh();
    } else {
      setSentTo(email.trim());
    }
  }

  const title = mode === "sign_in" ? "Sign in" : "Join Zero X";

  if (!supabase) {
    return (
      <Modal open={open} onClose={close} title="Join Zero X">
        <p className="text-sm text-muted">
          Accounts aren&apos;t available on this deployment yet. You can still play as a guest; favorites and settings
          are saved on this device.
        </p>
        <Button onClick={close} className="mt-5 w-full">
          Play as guest
        </Button>
      </Modal>
    );
  }

  if (sentTo) {
    return (
      <Modal open={open} onClose={close} title="Check your email">
        <p className="text-sm text-muted">
          We sent a confirmation link to <span className="font-semibold text-text">{sentTo}</span>. Open it on this
          device to finish creating your account.
        </p>
        <Button onClick={close} className="mt-5 w-full">
          Got it
        </Button>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={close} title={title}>
      <p className="text-sm text-muted">Save scores, earn XP, and climb the leaderboards.</p>

      <div className="mt-5 grid gap-2">
        <Button variant="secondary" className="w-full" disabled={busy !== null} onClick={() => onOAuth("google")}>
          {busy === "google" ? "Redirecting…" : "Continue with Google"}
        </Button>
        <Button variant="secondary" className="w-full" disabled={busy !== null} onClick={() => onOAuth("discord")}>
          {busy === "discord" ? "Redirecting…" : "Continue with Discord"}
        </Button>
      </div>

      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-subtle" aria-hidden>
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} noValidate className="grid gap-3">
        <div>
          <label htmlFor={ids.email} className="mb-1 block text-sm font-semibold">
            Email
          </label>
          <input
            id={ids.email}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </div>
        {mode === "sign_up" && (
          <div>
            <label htmlFor={ids.username} className="mb-1 block text-sm font-semibold">
              Username <span className="font-normal text-subtle">(optional)</span>
            </label>
            <input
              id={ids.username}
              autoComplete="username"
              maxLength={20}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-describedby={ids.hint}
              className={inputCls}
            />
            <p id={ids.hint} className="mt-1 text-xs text-subtle">
              3–20 letters, numbers, or underscores. You can change it later.
            </p>
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

        <p role="alert" className={cn("min-h-5 text-sm text-danger", !error && "sr-only")}>
          {error}
        </p>

        <Button type="submit" className="w-full" disabled={busy !== null}>
          {busy === "email" ? "Please wait…" : mode === "sign_in" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        {mode === "sign_in" ? "New here?" : "Already have an account?"}{" "}
        <button
          type="button"
          className="font-semibold text-cyan hover:underline"
          onClick={() => {
            setMode(mode === "sign_in" ? "sign_up" : "sign_in");
            setError(null);
          }}
        >
          {mode === "sign_in" ? "Create an account" : "Sign in"}
        </button>
      </p>
      <button type="button" onClick={close} className="mt-2 w-full text-center text-xs text-subtle hover:text-text">
        Keep playing as a guest
      </button>
    </Modal>
  );
}
