"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { LeaderboardSkeleton, LeaderboardTable } from "@/components/ui/LeaderboardTable";
import { Button } from "@/components/ui/Button";
import { useLeaderboard, type Period } from "@/lib/use-leaderboard";
import { cn } from "@/lib/cn";

export const PERIODS: { id: Period; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "all", label: "All-time" },
];

/** A live board with loading / error / empty / offline states. `game` null = global XP. */
export function LiveLeaderboard({
  game,
  period,
  limit = 10,
  caption,
}: {
  game: string | null;
  period: Period;
  limit?: number;
  caption: string;
}) {
  const { state, retry } = useLeaderboard(game, period, limit);
  const valueLabel = game ? "Score" : "XP";

  if (state.status === "loading") return <LeaderboardSkeleton rows={Math.min(limit, 5)} />;
  if (state.status === "disabled")
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
        Leaderboards need online accounts, which aren&apos;t enabled on this deployment.
      </div>
    );
  if (state.status === "error")
    return (
      <div className="rounded-lg border border-danger/40 bg-danger/5 p-6 text-center" role="alert">
        <p className="text-sm">Couldn&apos;t load the leaderboard.</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={retry}>
          Retry
        </Button>
      </div>
    );
  return (
    <LeaderboardTable
      entries={state.entries}
      caption={caption}
      valueLabel={valueLabel}
      emptyMessage={
        game
          ? period === "daily"
            ? "No scores today yet. Be the first on the board."
            : "Be the first to put a score on the board."
          : "Nobody has earned XP in this period yet."
      }
    />
  );
}

/** ARIA tabs (arrow-key navigation) switching daily / weekly / all-time boards. */
export function LeaderboardTabs({
  scope,
  scopeLabel,
  size = 10,
}: {
  /** Game slug, or "global" for the XP board. */
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
        <LiveLeaderboard
          game={scope === "global" ? null : scope}
          period={period}
          limit={size}
          caption={`${scopeLabel}: ${label} leaderboard`}
        />
      </div>
    </div>
  );
}
