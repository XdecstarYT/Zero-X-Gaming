"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { CoinAmount } from "@/components/shop/Coin";
import { SPORTS_PASS_PRICE } from "@/lib/economy";
import { useWallet } from "@/store/wallet";
import { useSportsPass } from "./use-sports-pass";

/**
 * The Sports+ unlock: one-time, 50 coins, every Sports+ game now and later.
 * Shows the balance, the unlock button, and a ✓ once owned.
 */
export function SportsPassCard({ compact = false }: { compact?: boolean }) {
  const { owned, busy, error, buy } = useSportsPass();
  const coins = useWallet((s) => s.coins);
  const short = coins !== null && coins < SPORTS_PASS_PRICE;

  if (owned) {
    return (
      <div role="status" data-testid="sports-pass" data-owned="true" className="flex flex-wrap items-center gap-3 rounded-xl border border-lime-400/50 bg-lime-400/10 p-4">
        <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-lime-400 font-black text-bg">
          ✓
        </span>
        <div>
          <p className="font-display font-bold uppercase tracking-wide">Sports+ unlocked</p>
          <p className="text-sm text-muted">Every Sports+ game is yours, including new ones as they launch.</p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="sports-pass" data-owned={owned === false ? "false" : undefined} className="rounded-xl border border-cyan/50 bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-magenta">One-time unlock</p>
          <p className="mt-1 font-display text-xl font-black uppercase tracking-wide">
            Sports+ · <CoinAmount amount={SPORTS_PASS_PRICE} />
          </p>
          {!compact && <p className="mt-1 max-w-xl text-sm text-muted">Unlock once and play every Sports+ game, now and as new ones launch. No subscription.</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button size="lg" onClick={() => void buy()} disabled={busy || owned === null || short}>
            {busy ? "Unlocking…" : `Unlock for ${SPORTS_PASS_PRICE} coins`}
          </Button>
          {coins !== null && (
            <p className="text-xs text-muted">
              You have <CoinAmount amount={coins} />
            </p>
          )}
        </div>
      </div>
      {short && (
        <p className="mt-3 text-sm text-muted">
          You need {SPORTS_PASS_PRICE - (coins ?? 0)} more coins. Earn them in{" "}
          <Link href="/battle-pass" className="text-cyan underline">
            the battle pass
          </Link>{" "}
          and Cash Cups.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
