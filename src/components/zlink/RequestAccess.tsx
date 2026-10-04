"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { accessCode, ZLINK_KEY } from "@/lib/zlink";

const listeners = new Set<() => void>();
const read = () => {
  try {
    return localStorage.getItem(ZLINK_KEY);
  } catch {
    return null;
  }
};

/** Get on the list: an access code to keep, saved on this device. */
export function RequestAccess() {
  const code = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => null,
  );
  const [busy, setBusy] = useState(false);

  const request = () => {
    setBusy(true);
    // A beat of "establishing link" before the code appears.
    window.setTimeout(() => {
      try {
        localStorage.setItem(ZLINK_KEY, accessCode(Date.now()));
      } catch {
        // Private mode: they'll have to ask again next time.
      }
      listeners.forEach((l) => l());
      setBusy(false);
    }, 900);
  };

  if (code)
    return (
      <div role="status" data-testid="zlink-access" className="rounded-xl border border-cyan/50 bg-cyan/10 p-4 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan">You&apos;re on the list</p>
        <p className="mt-2 font-mono text-2xl font-black tracking-widest">{code}</p>
        <p className="mt-1 text-sm text-muted">Keep your code. When the link opens, you&apos;ll know.</p>
      </div>
    );
  return (
    <Button size="lg" onClick={request} disabled={busy} data-testid="zlink-request" className="w-full sm:w-auto">
      {busy ? "Establishing link…" : "Request access"}
    </Button>
  );
}
