"use client";

import { useEffect, useState } from "react";
import { SPORTS, SPORTS_FOLLOW_KEY, type SportStatus } from "@/lib/sports";
import { SportsArt } from "./SportsArt";

const STATUS_TONE: Record<SportStatus, string> = {
  "In development": "border-lime-400/60 text-lime-300",
  Prototype: "border-cyan/60 text-cyan",
  Planned: "border-violet/60 text-violet",
};

function readFollows() {
  try {
    const v = JSON.parse(localStorage.getItem(SPORTS_FOLLOW_KEY) ?? "[]");
    return new Set<string>(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set<string>();
  }
}

/** The Sports+ line-up: every upcoming game with a "Notify me" toggle (kept on this device). */
export function SportsLineup({ compact = false }: { compact?: boolean }) {
  const [follows, setFollows] = useState<Set<string>>(new Set());
  useEffect(() => {
    const t = window.setTimeout(() => setFollows(readFollows()), 0);
    return () => clearTimeout(t);
  }, []);

  const toggle = (id: string) => {
    const next = new Set(follows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFollows(next);
    try {
      localStorage.setItem(SPORTS_FOLLOW_KEY, JSON.stringify([...next]));
    } catch {
      // Private mode: the toggle still works for this visit.
    }
  };

  const list = compact ? SPORTS.slice(0, 4) : SPORTS;
  return (
    <ul aria-label="Upcoming sports games" className={compact ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-4" : "grid gap-5 sm:grid-cols-2 lg:grid-cols-3"}>
      {list.map((g) => {
        const on = follows.has(g.id);
        return (
          <li key={g.id}>
            <article aria-labelledby={`sport-${g.id}`} className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface">
              <div className="relative aspect-[16/9]">
                <SportsArt game={g} className="h-full w-full" />
                <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Coming soon</span>
                <span className={`absolute top-2 right-2 rounded-full border bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_TONE[g.status]}`}>{g.status}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 id={`sport-${g.id}`} className="font-display text-lg font-bold uppercase tracking-wide">
                    {g.title}
                  </h3>
                  <span className="shrink-0 text-xs font-semibold text-muted">{g.eta}</span>
                </div>
                <p className="text-sm text-muted">{g.tagline}</p>
                {!compact && (
                  <ul className="mt-1 space-y-1 text-sm">
                    {g.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <span aria-hidden className="text-cyan">
                          ▸
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(g.id)}
                  className={`mt-auto min-h-11 rounded-md border px-3 py-2 font-display text-xs font-bold uppercase tracking-wider transition-colors ${on ? "border-cyan bg-cyan text-bg" : "border-border hover:border-cyan hover:text-cyan"}`}
                >
                  {on ? "✓ You'll be notified" : "Notify me"}
                </button>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
