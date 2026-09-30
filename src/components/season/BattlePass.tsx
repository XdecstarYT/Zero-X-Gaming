"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { SignInButton } from "@/components/layout/SignInButton";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { activeChallenges, REWARDS, SEASON, seasonTimeLeft, tierFromXp, type ActiveChallenge } from "@/lib/season";
import { RewardArt, itemName, rarityColor, rarityOf } from "./RewardArt";
import { useSeason } from "./use-season";

const subscribeMinute = (cb: () => void) => {
  const id = setInterval(cb, 60_000);
  return () => clearInterval(id);
};
/** Current time rounded to the minute (stable between renders, null on the server). */
function useNow() {
  return useSyncExternalStore(
    subscribeMinute,
    () => Math.floor(Date.now() / 60_000) * 60_000,
    () => null,
  );
}

function resetsIn(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

export function BattlePass() {
  const { state, error, reload } = useSeason();
  const now = useNow();
  const xp = state?.xp ?? 0;
  const { tier, into, need, pct } = tierFromXp(xp);
  const left = now ? seasonTimeLeft(now) : null;
  const challenges = now ? activeChallenges(now) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Header */}
      <section
        className="relative overflow-hidden rounded-2xl border border-border p-5 sm:p-8"
        style={{ background: "linear-gradient(135deg,#2b3024 0%,#1a1d17 45%,#3a2a10 100%)" }}
      >
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ffb321]">
              Season {SEASON.number}
              {left ? ` · ${left.days} days left` : ""}
            </p>
            <h1 className="mt-1 font-display text-3xl font-black uppercase tracking-tight sm:text-5xl">{SEASON.name}</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Play Neon Siege battle royale to earn Season XP. Every tier unlocks an outfit, weapon wrap or banner. It&apos;s
              all free: nothing to buy, just play.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="grid h-20 w-20 place-items-center rounded-xl border-2 border-[#ffb321] bg-black/40 text-center">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Tier</p>
                <p className="font-display text-3xl font-black" data-testid="bp-tier">
                  {tier}
                </p>
              </div>
            </div>
            <Link
              href="/games/neon-siege"
              className="rounded-md bg-[#ffb321] px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-[#1b1406] hover:brightness-110"
            >
              Play
            </Link>
          </div>
        </div>
        <div className="relative mt-6">
          <div className="flex justify-between text-xs text-muted">
            <span>{tier >= SEASON.tiers ? "Battle pass complete!" : `${formatNumber(into)} / ${formatNumber(need)} XP to tier ${tier + 1}`}</span>
            <span>{formatNumber(xp)} Season XP</span>
          </div>
          <div
            className="mt-1.5 h-3 overflow-hidden rounded-full bg-black/50"
            role="progressbar"
            aria-label="Progress to next tier"
            aria-valuemin={0}
            aria-valuemax={need}
            aria-valuenow={into}
          >
            <div className="h-full rounded-full bg-gradient-to-r from-[#ffb321] to-[#ff6a3d]" style={{ width: `${pct * 100}%` }} />
          </div>
          {state && (
            <p className="mt-3 text-xs text-muted">
              {state.matches} matches · {state.wins} Victory Royales · {state.kills} eliminations
            </p>
          )}
        </div>
      </section>

      {state && !state.signedIn && (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">Playing as a guest: your battle pass progress is saved on this device only.</p>
          <SignInButton size="sm">Sign in to save progress</SignInButton>
        </div>
      )}
      {error && (
        <div role="alert" className="mt-4 flex items-center justify-between rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm">
          Couldn&apos;t load your season progress.
          <button type="button" onClick={reload} className="font-semibold text-cyan hover:underline">
            Retry
          </button>
        </div>
      )}

      {/* Challenges */}
      <section className="mt-8 grid gap-6 lg:grid-cols-2" aria-label="Challenges">
        {(["daily", "weekly"] as const).map((kind) => {
          const list = challenges.filter((c) => c.kind === kind);
          return (
            <div key={kind} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-bold uppercase tracking-wide">{kind === "daily" ? "Daily" : "Weekly"} challenges</h2>
                {list[0] && now && <p className="text-xs text-muted">Resets in {resetsIn(list[0].endsAt - now)}</p>}
              </div>
              <ul className="mt-3 flex flex-col gap-3">
                {list.map((c) => (
                  <ChallengeRow key={c.id} c={c} progress={state?.challenges[`${c.id}:${c.period}`]} />
                ))}
                {!now && <li className="h-24 animate-pulse rounded-md bg-surface-2" />}
              </ul>
            </div>
          );
        })}
      </section>

      {/* Reward track */}
      <section className="mt-10" aria-labelledby="rewards-title">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="rewards-title" className="font-display text-xl font-bold uppercase tracking-wide">
            Rewards
          </h2>
          <Link href="/locker" className="text-sm font-semibold text-cyan hover:underline">
            Open Locker →
          </Link>
        </div>
        <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
          {REWARDS.map((r) => {
            const unlocked = tier >= r.tier;
            const current = r.tier === tier + 1;
            const rarity = rarityOf(r.kind, r.item);
            return (
              <li
                key={r.tier}
                className={cn(
                  "relative flex flex-col overflow-hidden rounded-lg border-2 bg-surface",
                  current ? "ring-2 ring-[#ffb321] ring-offset-2 ring-offset-bg" : "",
                  !unlocked && "opacity-80",
                )}
                style={{ borderColor: rarityColor(rarity) + (unlocked ? "" : "66") }}
              >
                <div className="flex items-center justify-between px-2 pt-1.5 text-[11px] font-bold">
                  <span>Tier {r.tier}</span>
                  <span className={unlocked ? "text-success" : "text-subtle"}>{unlocked ? "✓ Owned" : "Locked"}</span>
                </div>
                <RewardArt kind={r.kind} item={r.item} className="mx-2 mt-1.5 aspect-[4/3]" />
                <div className="px-2 pt-1.5 pb-2">
                  <p className="truncate text-sm font-semibold">{itemName(r.kind, r.item)}</p>
                  <p className="text-[11px] capitalize" style={{ color: rarityColor(rarity) }}>
                    {rarity} {r.kind}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function ChallengeRow({ c, progress }: { c: ActiveChallenge; progress?: { progress: number; completed: boolean } }) {
  const p = progress?.progress ?? 0;
  const done = progress?.completed ?? false;
  return (
    <li className="rounded-md border border-border bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className={cn("text-sm font-semibold", done && "text-success")}>
          {done ? "✓ " : ""}
          {c.title}
        </p>
        <span className="shrink-0 rounded bg-black/30 px-1.5 py-0.5 text-[11px] font-bold text-[#ffb321]">+{formatNumber(c.xp)} XP</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/40">
          <div className={cn("h-full rounded-full", done ? "bg-success" : "bg-cyan")} style={{ width: `${Math.min(100, (p / c.goal) * 100)}%` }} />
        </div>
        <span className="text-[11px] tabular-nums text-muted">
          {formatNumber(p)} / {formatNumber(c.goal)}
        </span>
      </div>
    </li>
  );
}
