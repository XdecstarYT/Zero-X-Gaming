"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { friendlyAuthError, validateUsername } from "@/lib/auth";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/Button";
import { useSignOut } from "./AccountControl";

export function UsernameForm({ userId, current }: { userId: string; current: string }) {
  const router = useRouter();
  const signOut = useSignOut();
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (name === current) return;
    const problem = validateUsername(name);
    if (problem) return setError(problem);
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    setBusy(true);
    setError(null);
    const { error } = await supabase.from("profiles").update({ username: name }).eq("id", userId);
    setBusy(false);
    if (error) return setError(friendlyAuthError(error));

    const { profile, set } = useAuth.getState();
    if (profile) set({ profile: { ...profile, username: name } });
    toast("Username updated", { tone: "success" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <form onSubmit={onSubmit} noValidate className="flex-1">
        <label htmlFor="username" className="mb-1 block text-sm font-semibold">
          Username
        </label>
        <div className="flex max-w-md gap-2">
          <input
            id="username"
            value={value}
            maxLength={20}
            autoComplete="username"
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby="username-msg"
            className="h-10 flex-1 rounded-md border border-border bg-bg px-3 text-sm focus:border-cyan focus:outline-none aria-[invalid=true]:border-danger"
          />
          <Button type="submit" size="md" disabled={busy || value.trim() === current}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
        <p
          id="username-msg"
          role={error ? "alert" : undefined}
          className={error ? "mt-1 text-sm text-danger" : "mt-1 text-xs text-subtle"}
        >
          {error ?? "3–20 letters, numbers, or underscores. Shown on leaderboards."}
        </p>
      </form>
      <Button variant="secondary" onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}
