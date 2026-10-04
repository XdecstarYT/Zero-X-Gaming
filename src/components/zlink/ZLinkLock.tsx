"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ZLINK_PRICE } from "@/lib/economy";
import { useWallet } from "@/store/wallet";
import { ZLinkMark } from "./ZLinkMark";
import { useZlink } from "./use-zlink";

/** In front of a ZLink+ exclusive: what it is, and the way in. */
export function ZLinkLock() {
  const { until, busy, error, join } = useZlink();
  const coins = useWallet((s) => s.coins);
  const short = coins !== null && coins < ZLINK_PRICE;
  return (
    <div data-testid="zlink-lock" className="rounded-xl border border-violet/60 bg-surface p-4 text-center sm:p-5">
      <ZLinkMark className="text-5xl" />
      <p className="mt-2 text-sm font-bold uppercase tracking-[0.25em] text-violet">ZLink+ exclusive</p>
      <p className="mt-1 text-sm text-muted">Members only. ZLink+ also brings every Sports+ game, UBusiness Ultimate and double daily coins.</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => void join()} disabled={busy || until === undefined || short} data-testid="zlink-lock-join">
          {busy ? "Linking…" : until ? `Relink · ${ZLINK_PRICE} coins` : `Join ZLink+ · ${ZLINK_PRICE} coins`}
        </Button>
        <Link href="/zlink" className="text-sm font-semibold text-cyan hover:underline">
          What&apos;s in ZLink+ →
        </Link>
      </div>
      {short && <p className="mt-2 text-xs text-muted">You need {ZLINK_PRICE - (coins ?? 0)} more coins.</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
