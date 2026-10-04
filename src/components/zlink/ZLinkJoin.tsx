"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { CoinAmount } from "@/components/shop/Coin";
import { ZLINK_DAYS, ZLINK_PRICE, zlinkDaysLeft } from "@/lib/economy";
import { useWallet } from "@/store/wallet";
import { useZlink } from "./use-zlink";

/** Join, or see how long you've got and add another month. */
export function ZLinkJoin() {
  const { until, active, busy, error, join, welcome, dismiss } = useZlink();
  const coins = useWallet((s) => s.coins);
  const short = coins !== null && coins < ZLINK_PRICE;
  const left = zlinkDaysLeft(until);

  return (
    <div data-testid="zlink-join" data-active={active || undefined} className="zx-ring rounded-2xl border border-border bg-surface p-6 text-left shadow-card">
      {welcome && (
        <div role="status" data-testid="zlink-welcome" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-cyan/50 bg-cyan/10 px-4 py-3">
          <p className="font-mono text-sm font-bold tracking-widest text-cyan">LINK ESTABLISHED. Welcome to ZLink+.</p>
          <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-muted hover:text-text">
            ✕
          </button>
        </div>
      )}
      {active ? (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan">You&apos;re linked</p>
          <p className="mt-1 font-display text-3xl font-black uppercase" data-testid="zlink-days">
            {left} day{left === 1 ? "" : "s"} left
          </p>
          <p className="mt-1 text-sm text-muted">Runs to {new Date(until!).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}. Add another {ZLINK_DAYS} days any time.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => void join()} disabled={busy || short} data-testid="zlink-extend">
              {busy ? "Linking…" : `Add ${ZLINK_DAYS} days · ${ZLINK_PRICE} ZX Cash`}
            </Button>
            <Link href="/sports" className="self-center text-sm font-semibold text-cyan hover:underline">
              Play Sports+ →
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-magenta">{until ? "Your link lapsed" : "Get linked"}</p>
          <p className="mt-1 flex items-baseline gap-2 font-display text-4xl font-black uppercase">
            <CoinAmount amount={ZLINK_PRICE} />
            <span className="text-base font-bold text-muted normal-case">for {ZLINK_DAYS} days</span>
          </p>
          <p className="mt-1 text-sm text-muted">ZX Cash only. It doesn&apos;t renew on its own: add more days whenever you like.</p>
          <Button size="lg" className="mt-4 w-full sm:w-auto" onClick={() => void join()} disabled={busy || until === undefined || short} data-testid="zlink-join-button">
            {busy ? "Linking…" : until ? `Relink · ${ZLINK_PRICE} ZX Cash` : `Join ZLink+ · ${ZLINK_PRICE} ZX Cash`}
          </Button>
        </>
      )}
      <p className="mt-3 text-xs text-muted">
        {coins !== null && (
          <>
            You have <CoinAmount amount={coins} />.{" "}
          </>
        )}
        {short && "Not enough yet: claim your daily reward or win a Cash Cup."}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
