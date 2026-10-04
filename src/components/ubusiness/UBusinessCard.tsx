"use client";

import Link from "next/link";
import { ZLinkHint } from "@/components/zlink/ZLinkHint";
import { Button } from "@/components/ui/Button";
import { CoinAmount } from "@/components/shop/Coin";
import { cn } from "@/lib/cn";
import { ubusinessFreeOpen, ubusinessPrice, type UBusinessTier } from "@/lib/economy";
import { useWallet } from "@/store/wallet";
import { useUBusiness } from "./use-ubusiness";

const EDITIONS: { tier: UBusinessTier; name: string; perks: string[] }[] = [
  { tier: "lite", name: "Lite", perks: ["Grocery, snacks, household, fresh and frozen", "Grow to a Mini Market", "One member of staff"] },
  {
    tier: "ultimate",
    name: "Ultimate",
    perks: ["All 10 departments, with the bakery, health, toys, fashion and electronics", "Grow to a Megastore", "Up to 6 staff and self-checkouts", "Marketing, 3 specials at once, the loyalty app, growth loans, 3× speed, photo mode"],
  },
];

/**
 * Buy UBusiness: two editions, a one-time unlock each. Ultimate is free while
 * you hold this season's battle pass; Lite owners upgrade for the difference.
 */
export function UBusinessCard({ compact = false }: { compact?: boolean }) {
  const { tier, busy, error, buy, claim } = useUBusiness();
  const free = ubusinessFreeOpen();
  const coins = useWallet((s) => s.coins);

  if (tier === "ultimate") {
    return (
      <div role="status" data-testid="ubusiness-pass" data-tier="ultimate" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/50 bg-amber-400/10 p-4">
        <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-amber-400 font-black text-bg">
          ✓
        </span>
        <div>
          <p className="font-display font-bold uppercase tracking-wide">UBusiness Ultimate</p>
          <p className="text-sm text-muted">Every department, every store size, the whole team. Open your doors.</p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="ubusiness-pass" data-tier={tier ?? undefined} className="rounded-xl border border-amber-400/40 bg-surface p-4 sm:p-5">
      {free && (
        <div data-testid="ubusiness-free" className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-400/50 bg-emerald-400/10 p-3">
          <span aria-hidden className="text-2xl">
            🎁
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display font-black uppercase tracking-wide">Ultimate is free until 31 October</p>
            <p className="text-sm text-muted">Launch offer: claim it now and it&apos;s yours to keep. No ZX Cash needed.</p>
          </div>
          <Button onClick={() => void claim()} disabled={!!busy || tier === undefined} data-testid="ubusiness-claim">
            {busy === "ultimate" ? "Claiming…" : "Claim Ultimate free"}
          </Button>
        </div>
      )}
      {!compact && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">One-time unlock · free with the battle pass</p>}
      <div className={cn("grid gap-3", compact ? "mt-1" : "mt-3", "sm:grid-cols-2")}>
        {EDITIONS.map((e) => {
          const owned = tier === e.tier;
          const price = ubusinessPrice(e.tier, tier ?? null);
          const short = coins !== null && coins < price;
          return (
            <div key={e.tier} className={cn("flex flex-col rounded-lg border p-3", e.tier === "ultimate" ? "border-amber-400/60 bg-amber-400/5" : "border-border")}>
              <p className="font-display text-lg font-black uppercase tracking-wide">
                {e.name} · <CoinAmount amount={price} />
              </p>
              {e.tier === "ultimate" && <p className="text-xs font-bold text-amber-300">Free with the battle pass{tier === "lite" ? " · 25 to upgrade from Lite" : ""}</p>}
              {!compact && (
                <ul className="mt-2 flex-1 space-y-0.5 text-sm text-muted">
                  {e.perks.map((p) => (
                    <li key={p}>• {p}</li>
                  ))}
                </ul>
              )}
              {owned ? (
                <p className="mt-3 text-sm font-bold text-success">✓ You own Lite</p>
              ) : (
                <Button className="mt-3" onClick={() => void buy(e.tier)} disabled={!!busy || tier === undefined || short} data-testid={`ubusiness-buy-${e.tier}`}>
                  {busy === e.tier ? "Unlocking…" : tier === "lite" ? `Upgrade for ${price} ZX Cash` : `Get ${e.name} · ${price} ZX Cash`}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted">
        {coins !== null && (
          <>
            You have <CoinAmount amount={coins} />.{" "}
          </>
        )}
        Holding this season&apos;s{" "}
        <Link href="/battle-pass" className="text-cyan underline">
          battle pass
        </Link>{" "}
        unlocks Ultimate for free.
      </p>
      {!compact && <ZLinkHint what="UBusiness Ultimate" />}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
