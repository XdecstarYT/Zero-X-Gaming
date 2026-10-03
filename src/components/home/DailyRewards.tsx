"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CoinIcon } from "@/components/shop/Coin";
import { cn } from "@/lib/cn";
import { claimDaily, DAILY_COINS, loadDaily, type DailyState } from "@/lib/daily";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/toast";

/** Seven days of coins for coming back: claim today's, see the week ahead. */
export function DailyRewards() {
  const status = useAuth((s) => s.status);
  const [state, setState] = useState<DailyState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    loadDaily().then(
      (s) => (setState(s), setError(null)),
      () => setError("Couldn't check your daily reward."),
    );
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    const t = window.setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [status, load]);

  const claim = async () => {
    setBusy(true);
    try {
      const r = await claimDaily();
      setState(r);
      if (r.coinsWon) toast(`+${r.coinsWon} coins!`, { description: r.day === 7 ? "Day 7: the big one. The week starts again tomorrow." : `Day ${r.day} of 7. Come back tomorrow for ${r.next}.`, tone: "success" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="daily-title" className="rounded-xl border border-border bg-surface p-4 sm:p-5" data-testid="daily-rewards">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="daily-title" className="font-display text-lg font-bold uppercase tracking-wide">
            Daily rewards
          </h2>
          <p className="text-sm text-muted">Come back every day for coins. Day 7 pays 50. Miss a day and it starts again.</p>
        </div>
        <Button onClick={() => void claim()} disabled={!state || state.claimed || busy} data-testid="daily-claim">
          {!state ? "…" : state.claimed ? "Claimed: see you tomorrow" : `Claim ${state.next} coins`}
        </Button>
      </div>
      <ol className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
        {DAILY_COINS.map((c, i) => {
          const n = i + 1;
          const done = !!state && (n < state.day || (n === state.day && state.claimed));
          const today = !!state && n === state.day;
          return (
            <li
              key={n}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-center",
                done ? "border-success/50 bg-success/10" : today ? "border-cyan bg-cyan/10 shadow-glow-cyan" : "border-border bg-bg",
                n === 7 && !done && "border-warning/60",
              )}
            >
              <span className="text-[10px] uppercase tracking-wider text-muted">Day {n}</span>
              <CoinIcon className={n === 7 ? "h-6 w-6" : "h-5 w-5"} />
              <span className="font-display text-sm font-bold tabular-nums">{done ? "✓" : c}</span>
            </li>
          );
        })}
      </ol>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
