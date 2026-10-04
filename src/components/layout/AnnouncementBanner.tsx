"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { useSettingsLoaded, type Announcement } from "@/lib/owner";

const KEY = "zx-announcement-dismissed";
const listeners = new Set<() => void>();

function dismissedId(): number {
  try {
    return Number(localStorage.getItem(KEY) ?? 0);
  } catch {
    return 0;
  }
}

function dismiss(id: number) {
  try {
    localStorage.setItem(KEY, String(id));
  } catch {
    // Private mode: it just comes back next visit.
  }
  listeners.forEach((l) => l());
}

const TONES: Record<Announcement["tone"], { icon: string; cls: string }> = {
  info: { icon: "📣", cls: "border-cyan/40 bg-cyan/10" },
  success: { icon: "✅", cls: "border-success/40 bg-success/10" },
  warning: { icon: "⚠️", cls: "border-warning/40 bg-warning/10" },
  event: { icon: "🎉", cls: "border-magenta/40 bg-gradient-to-r from-magenta/15 via-violet/15 to-cyan/15" },
};

/** The site-wide banner the owner sets from the owner panel. Dismissed per announcement. */
export function AnnouncementBanner() {
  const ann = useSettingsLoaded().announcement;
  const gone = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dismissedId,
    () => -1,
  );
  if (!ann || gone === -1 || gone === ann.id) return null;
  const tone = TONES[ann.tone] ?? TONES.info;
  return (
    <div role="status" data-testid="announcement" className={cn("border-b text-sm", tone.cls)}>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 sm:px-6">
        <span aria-hidden>{tone.icon}</span>
        <p className="min-w-0 flex-1 font-semibold">
          {ann.text}
          {ann.href && (
            <Link href={ann.href} className="ml-2 whitespace-nowrap text-cyan underline-offset-2 hover:underline">
              Take a look →
            </Link>
          )}
        </p>
        <button
          type="button"
          onClick={() => dismiss(ann.id)}
          aria-label="Dismiss announcement"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
