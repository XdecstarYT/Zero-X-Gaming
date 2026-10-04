"use client";

import { useEffect, useState } from "react";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/layout/Logo";
import { SignInButton } from "@/components/layout/SignInButton";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { describeScopes, hostOf, safeRedirect } from "@/lib/oauth";
import { useAuth } from "@/store/auth";

type State =
  | { s: "loading" }
  | { s: "error"; message: string }
  | { s: "consent"; details: OAuthAuthorizationDetails }
  | { s: "redirecting"; to: string };

/**
 * "Sign in with Zero X": an app wants access to your account. Shows who's
 * asking, what they'll see and where you'll be sent, then approves or denies.
 */
export function OAuthConsent({ authorizationId }: { authorizationId: string | null }) {
  const status = useAuth((s) => s.status);
  const username = useAuth((s) => s.profile?.username);
  const [state, setState] = useState<State>({ s: "loading" });
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);

  useEffect(() => {
    if (!authorizationId || status !== "signed_in") return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;
    void supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) return setState({ s: "error", message: error?.message ?? "This sign-in request couldn't be found." });
      if ("authorization_id" in data) return setState({ s: "consent", details: data });
      // Already approved before: straight back to the app.
      const to = safeRedirect(data.redirect_url);
      if (!to) return setState({ s: "error", message: "The app's return address isn't valid." });
      setState({ s: "redirecting", to });
      window.location.assign(to);
    });
    return () => {
      cancelled = true;
    };
  }, [authorizationId, status]);

  const decide = async (approve: boolean) => {
    const supabase = getSupabaseBrowser();
    if (!supabase || !authorizationId) return;
    setBusy(approve ? "approve" : "deny");
    const api = supabase.auth.oauth;
    const { data, error } = approve
      ? await api.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await api.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    const to = safeRedirect(data?.redirect_url);
    if (error || !to) {
      setBusy(null);
      setState({ s: "error", message: error?.message ?? "Something went wrong. Try again from the app." });
      return;
    }
    setState({ s: "redirecting", to });
    window.location.assign(to);
  };

  const shell = (children: React.ReactNode) => (
    <section aria-labelledby="consent-title" className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>
      {children}
    </section>
  );

  if (!authorizationId)
    return shell(
      <>
        <h1 id="consent-title" className="text-center font-display text-xl font-bold uppercase">Nothing to authorize</h1>
        <p className="mt-2 text-center text-sm text-muted">This page is where apps send you to sign in with Zero X. Start again from the app you were using.</p>
      </>,
    );

  if (status === "loading")
    return shell(
      <p role="status" className="text-center text-sm text-muted">
        Checking your account…
      </p>,
    );

  if (status !== "signed_in")
    return shell(
      <>
        <h1 id="consent-title" className="text-center font-display text-xl font-bold uppercase">Sign in to continue</h1>
        <p className="mt-2 text-center text-sm text-muted">
          An app wants you to sign in with your Zero X account. {status === "device" ? "Accounts saved only on this device can't be used with other apps; " : ""}Sign in with your online account first.
        </p>
        <div className="mt-6 flex justify-center">
          <SignInButton size="lg">Sign in</SignInButton>
        </div>
      </>,
    );

  if (state.s === "loading")
    return shell(
      <p role="status" className="text-center text-sm text-muted">
        Loading the request…
      </p>,
    );

  if (state.s === "error")
    return shell(
      <div role="alert">
        <h1 id="consent-title" className="text-center font-display text-xl font-bold uppercase">Couldn&apos;t continue</h1>
        <p className="mt-2 text-center text-sm text-muted">{state.message}</p>
        <p className="mt-2 text-center text-xs text-subtle">The link may have expired: go back to the app and try signing in again.</p>
      </div>,
    );

  if (state.s === "redirecting")
    return shell(
      <p role="status" className="text-center text-sm text-muted">
        Taking you back to the app…
      </p>,
    );

  const d = state.details;
  const scopes = describeScopes(d.scope);
  const site = hostOf(d.client.uri);
  const back = hostOf(d.redirect_uri);
  const logo = safeRedirect(d.client.logo_uri);
  return shell(
    <>
      <div className="flex items-center justify-center gap-3">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- the client's own logo, any host
          <img src={logo} alt="" className="h-12 w-12 rounded-xl border border-border bg-surface-2 object-contain" referrerPolicy="no-referrer" />
        ) : (
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-xl bg-surface-3 font-display text-xl font-black uppercase">
            {d.client.name.slice(0, 1)}
          </span>
        )}
        <span aria-hidden className="text-2xl text-subtle">⇄</span>
        <span aria-hidden className="grid h-12 w-12 place-items-center rounded-xl bg-cyan font-display text-xl font-black text-bg">
          X
        </span>
      </div>
      <h1 id="consent-title" className="mt-5 text-center font-display text-xl font-bold">
        <span className="text-cyan">{d.client.name}</span> wants to use your Zero X account
      </h1>
      {site && <p className="mt-1 text-center text-xs text-subtle">{site}</p>}
      <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-center text-sm">
        Signed in as <strong>{username ?? d.user.email}</strong>
        {username && d.user.email ? <span className="text-muted"> · {d.user.email}</span> : null}
      </p>
      <h2 className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-muted">This will let it see</h2>
      <ul className="mt-2 space-y-2">
        {(scopes.length ? scopes : [{ id: "basic", label: "That you have a Zero X account", detail: "Nothing else." }]).map((s) => (
          <li key={s.id} className="flex gap-3 rounded-lg border border-border px-3 py-2">
            <span aria-hidden className="mt-0.5 text-success">
              ✓
            </span>
            <span>
              <span className="block text-sm font-semibold">{s.label}</span>
              <span className="block text-xs text-muted">{s.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">
        It can&apos;t see your password, spend your ZX Cash or play as you. You can remove its access any time in Settings → Connected apps.
        {back && (
          <>
            {" "}
            You&apos;ll be sent back to <strong className="text-text">{back}</strong>.
          </>
        )}
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button variant="secondary" size="lg" onClick={() => void decide(false)} disabled={busy !== null}>
          {busy === "deny" ? "Cancelling…" : "Cancel"}
        </Button>
        <Button size="lg" onClick={() => void decide(true)} disabled={busy !== null} autoFocus>
          {busy === "approve" ? "Allowing…" : "Allow"}
        </Button>
      </div>
    </>,
  );
}
