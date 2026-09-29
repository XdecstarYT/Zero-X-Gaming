"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { LeaderboardTable } from "@/components/ui/LeaderboardTable";
import { mockLeaderboard } from "@/lib/mock-data";
import { cn } from "@/lib/cn";

export const PERIODS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "all", label: "All-time" },
] as const;

type Period = (typeof PERIODS)[number]["id"];

/** ARIA tabs (arrow-key navigation) switching daily / weekly / all-time boards. */
export function LeaderboardTabs({
  scope,
  scopeLabel,
  size = 10,
}: {
  scope: string;
  scopeLabel: string;
  size?: number;
}) {
  const [period, setPeriod] = useState<Period>("weekly");
  const baseId = useId();

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const idx = PERIODS.findIndex((p) => p.id === period);
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % PERIODS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + PERIODS.length) % PERIODS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = PERIODS.length - 1;
    else return;
    e.preventDefault();
    setPeriod(PERIODS[next].id);
    document.getElementById(`${baseId}-tab-${PERIODS[next].id}`)?.focus();
  }

  const label = PERIODS.find((p) => p.id === period)!.label;

  return (
    <div>
      <div
        role="tablist"
        aria-label={`${scopeLabel} leaderboard period`}
        className="mb-3 inline-flex rounded-md border border-border bg-surface p-1"
      >
        {PERIODS.map((p) => {
          const selected = p.id === period;
          return (
            <button
              key={p.id}
              id={`${baseId}-tab-${p.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onKeyDown={onKeyDown}
              onClick={() => setPeriod(p.id)}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
                selected ? "bg-cyan text-bg" : "text-muted hover:text-text",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${period}`}>
        <LeaderboardTable
          entries={mockLeaderboard(`${scope}-${period}`, size)}
          caption={`${scopeLabel}: ${label} top scores`}
        />
      </div>
    </div>
  );
}
