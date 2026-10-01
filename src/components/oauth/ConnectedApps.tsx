"use client";

import { useCallback, useEffect, useState } from "react";
import type { OAuthGrant } from "@supabase/supabase-js";
import { Button } from "@/components/ui/Button";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { describeScopes, hostOf } from "@/lib/oauth";
import { useAuth } from "@/store/auth";

/** Apps you've let sign in with Zero X, and a way to take that back. */
export function ConnectedApps() {
  const status = useAuth((s) => s.status);
  const [grants, setGrants] = useState<OAuthGrant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const { data, error } = await supabase.auth.oauth.listGrants();
    if (error) {
      setError("Couldn't load your connected apps.");
      setGrants([]);
    } else {
      setError(null);
      setGrants(data ?? []);
    }
  }, []);

  useEffect(() => {
    if (status !== "signed_in") return;
    const t = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [status, load]);

  if (status !== "signed_in") return null;

  const revoke = async (g: OAuthGrant) => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setRevoking(g.client.id);
    const { error } = await supabase.auth.oauth.revokeGrant({ clientId: g.client.id });
    setRevoking(null);
    if (error) setError(`Couldn't remove ${g.client.name}. Try again.`);
    else await load();
  };

  return (
    <section aria-labelledby="apps-title" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 id="apps-title" className="font-display text-lg font-bold uppercase tracking-wide">
        Connected apps
      </h2>
      <p className="mt-1 text-sm text-muted">Apps you&apos;ve allowed to sign in with your Zero X account.</p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {grants === null ? (
        <p className="mt-3 text-sm text-subtle">Loading…</p>
      ) : grants.length === 0 ? (
        <p className="mt-3 text-sm text-subtle">No apps yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {grants.map((g) => (
            <li key={g.client.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-semibold">{g.client.name}</p>
                <p className="text-xs text-muted">
                  {[hostOf(g.client.uri), describeScopes(g.scopes.join(" ")).map((s) => s.label).join(", "), `since ${new Date(g.granted_at).toLocaleDateString()}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void revoke(g)} disabled={revoking === g.client.id}>
                {revoking === g.client.id ? "Removing…" : "Remove access"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
