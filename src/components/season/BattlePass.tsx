"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { SignInButton } from "@/components/layout/SignInButton";
import { CoinAmount } from "@/components/shop/Coin";
import { BATTLE_PASS_PRICE } from "@/lib/economy";
import { buyBattlePass } from "@/lib/season-client";
import { toast } from "@/store/toast";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { activeChallenges, REWARDS, SEASON, seasonTimeLeft, tierFromXp, type ActiveChallenge } from "@/lib/season";
import { RewardTrack } from "./RewardTrack";
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
  const { state, error, reload, setState } = useSeason();
  const [buying, setBuying] = useState<"idle" | "confirm" | "busy">("idle");

  async function purchase() {
    if (!state) return;
    if (buying === "idle") return setBuying("confirm");
    setBuying("busy");
    try {
      const r = await buyBattlePass();
      const owned = new Set(state.owned);
      r.unlocked.forEach((u) => owned.add(u.item));
      setState({ ...state, coins: r.coins, hasPass: true, owned });
      toast("Battle Pass unlocked!", {
        description: r.unlocked.length
          ? `${r.unlocked.length} rewards added to your Locker.`
          : "Rewards unlock as you rank up.",
        tone: "success",
      });
    } catch (e) {
      toast("Couldn't buy the Battle Pass", { description: (e as Error).message, tone: "error" });
    } finally {
      setBuying("idle");
    }
  }
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
            <h1 className="mt-1 font-display text-3xl font-black uppercase tracking-tight sm:text-5xl">
              {SEASON.name}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Play Neon Siege battle royale to earn Season XP. With the pass (200 coins, won in Cash Cups; never real
              money), every tier unlocks an outfit, weapon wrap or banner.
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
            <span>
              {tier >= SEASON.tiers
                ? "Battle pass complete!"
                : `${formatNumber(into)} / ${formatNumber(need)} XP to tier ${tier + 1}`}
            </span>
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
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#ffb321] to-[#ff6a3d]"
              style={{ width: `${pct * 100}%` }}
            />
          </div>
          {state && (
            <p className="mt-3 text-xs text-muted">
              {state.matches} matches · {state.wins} Victory Royales · {state.kills} eliminations
            </p>
          )}
        </div>
      </section>

      {state && (
        <section
          aria-labelledby="pass-title"
          className={cn(
            "mt-4 flex flex-col gap-3 rounded-xl border-2 p-4 sm:flex-row sm:items-center sm:justify-between",
            state.hasPass ? "border-success/50 bg-success/5" : "border-[#f2c230]/60 bg-[#f2c230]/10",
          )}
        >
          <div>
            <h2 id="pass-title" className="font-display text-lg font-bold uppercase">
              {state.hasPass ? "Battle Pass owned" : "Get the Battle Pass"}
            </h2>
            <p className="text-sm text-muted">
              {state.hasPass
                ? "Every tier you reach drops its reward straight into your Locker."
                : `Unlock all ${REWARDS.length} tiers of rewards, including everything you've already reached. You have `}
              {!state.hasPass && <CoinAmount amount={state.coins} />}
              {!state.hasPass && "."}
            </p>
            {!state.hasPass && state.coins < BATTLE_PASS_PRICE && (
              <p className="mt-1 text-xs text-muted">
                Win ZX Cash in{" "}
                <Link href="/shop" className="text-cyan underline underline-offset-2">
                  Cash Cups
                </Link>
                : every third match pays the top 3.
              </p>
            )}
          </div>
          {!state.hasPass && (
            <button
              type="button"
              onClick={purchase}
              disabled={buying === "busy" || state.coins < BATTLE_PASS_PRICE}
              className={cn(
                "flex shrink-0 items-center justify-center gap-2 rounded-md px-5 py-2.5 font-bold disabled:cursor-not-allowed disabled:opacity-50",
                buying === "confirm" ? "bg-[#ff7a1a] text-black" : "bg-[#10b981] text-[#022c22] hover:brightness-110",
              )}
            >
              {buying === "busy" ? (
                "Buying…"
              ) : buying === "confirm" ? (
                "Tap again to confirm"
              ) : (
                <>
                  Buy for <CoinAmount amount={BATTLE_PASS_PRICE} />
                </>
              )}
            </button>
          )}
        </section>
      )}

      {state && !state.signedIn && (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            Playing as a guest: your battle pass progress is saved on this device only.
          </p>
          <SignInButton size="sm">Sign in to save progress</SignInButton>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm"
        >
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
                <h2 className="font-display text-lg font-bold uppercase tracking-wide">
                  {kind === "daily" ? "Daily" : "Weekly"} challenges
                </h2>
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
        <p className="mt-1 text-sm text-muted">
          Free lane: ZX Cash every 5 tiers for everyone. Battle Pass lane: a new cosmetic every tier.
        </p>
        <RewardTrack tier={tier} pct={pct} owned={state?.owned ?? null} hasPass={state?.hasPass ?? false} />
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
        <span className="shrink-0 rounded bg-warning/10 px-1.5 py-0.5 text-[11px] font-bold text-warning">
          +{formatNumber(c.xp)} XP
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/40">
          <div
            className={cn("h-full rounded-full", done ? "bg-success" : "bg-cyan")}
            style={{ width: `${Math.min(100, (p / c.goal) * 100)}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums text-muted">
          {formatNumber(p)} / {formatNumber(c.goal)}
        </span>
      </div>
    </li>
  );
}
