"use client";

import { useEffect, useRef } from "react";
import { CoinIcon } from "@/components/shop/Coin";
import { cn } from "@/lib/cn";
import { COIN_TIERS, REWARDS, SEASON } from "@/lib/season";
import { RewardArt, itemName, rarityColor, rarityOf } from "./RewardArt";

/**
 * The two-lane battle pass track: a Free lane (coins every 5 tiers, for
 * everyone) above the Battle Pass lane (a cosmetic every tier), strung along a
 * progress line. Scrolls itself to the tier you're working on.
 */
export function RewardTrack({
  tier,
  pct,
  owned,
  hasPass,
}: {
  tier: number;
  pct: number;
  owned: Set<string> | null;
  hasPass: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const el = currentRef.current;
    const box = scroller.current;
    if (!el || !box) return;
    box.scrollTo({
      left: Math.max(0, el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2),
      behavior: "instant" as ScrollBehavior,
    });
  }, [tier]);

  return (
    <div className="mt-4 flex rounded-xl border border-border bg-surface">
      {/* Lane labels (their own column, so they never cover a card) */}
      <div aria-hidden className="hidden w-16 shrink-0 flex-col border-r border-border pt-12 sm:flex">
        <span className="grid h-24 place-items-center font-display text-[10px] font-black tracking-widest text-muted [writing-mode:vertical-rl] rotate-180">
          FREE
        </span>
        <span className="mt-2 grid flex-1 place-items-center font-display text-[10px] font-black tracking-widest text-warning [writing-mode:vertical-rl] rotate-180">
          BATTLE PASS
        </span>
      </div>
      <div
        ref={scroller}
        tabIndex={0}
        role="region"
        aria-label="Battle pass reward track (scrolls sideways)"
        className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain scroll-smooth px-3 pt-3 pb-4 focus-visible:outline-2"
      >
        <ol className="flex w-max gap-2">
          {REWARDS.map((r) => {
            const reached = tier >= r.tier;
            const isNext = r.tier === tier + 1;
            const unlocked = reached && (owned?.has(r.item) ?? false);
            const rarity = rarityOf(r.kind, r.item);
            const coins = COIN_TIERS[r.tier];
            const fill = reached ? 1 : isNext ? pct : 0;
            return (
              <li
                key={r.tier}
                ref={isNext || (tier >= SEASON.tiers && r.tier === SEASON.tiers) ? currentRef : undefined}
                className="w-36 shrink-0"
              >
                {/* Tier node + progress segment */}
                <div className="relative mb-2 flex h-9 items-center justify-center">
                  <div className="absolute top-1/2 right-0 left-0 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full bg-gradient-to-r from-[#ffb321] to-[#ff6a3d]"
                      style={{ width: `${fill * 100}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "relative grid h-9 w-9 place-items-center rounded-full border-2 font-display text-sm font-black",
                      reached
                        ? "border-[#ffb321] bg-[#ffb321] text-[#1b1406]"
                        : isNext
                          ? "border-[#ffb321] bg-surface text-text"
                          : "border-border bg-surface-2 text-muted",
                    )}
                    aria-label={`Tier ${r.tier}${reached ? ", reached" : ""}`}
                  >
                    {r.tier}
                  </span>
                </div>

                {/* Free lane */}
                <div className="mb-2 h-24">
                  {coins ? (
                    <div
                      className={cn(
                        "flex h-full flex-col items-center justify-center gap-1 rounded-lg border-2 text-center",
                        reached ? "border-success/60 bg-success/10" : "border-[#f2c230]/50 bg-[#f2c230]/10",
                      )}
                    >
                      <span className="flex items-center gap-1 font-display text-lg font-black">
                        <CoinIcon className="h-5 w-5" />
                        {coins}
                      </span>
                      <span className={cn("text-[11px] font-bold", reached ? "text-success" : "text-muted")}>
                        {reached ? "✓ Earned" : "Free · coins"}
                      </span>
                    </div>
                  ) : (
                    <div aria-hidden className="h-full rounded-lg border border-dashed border-border/70" />
                  )}
                </div>

                {/* Battle pass lane */}
                <div
                  className={cn(
                    "relative flex flex-col overflow-hidden rounded-lg border-2 bg-surface-2",
                    isNext && "ring-2 ring-[#ffb321] ring-offset-2 ring-offset-surface",
                  )}
                  style={{ borderColor: rarityColor(rarity) + (unlocked ? "" : "77") }}
                >
                  <RewardArt
                    kind={r.kind}
                    item={r.item}
                    className={cn("m-1.5 aspect-square", !unlocked && "opacity-70")}
                  />
                  {!unlocked && (
                    <span
                      className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-[11px] text-white"
                      aria-hidden
                    >
                      {reached && !hasPass ? "★" : "🔒"}
                    </span>
                  )}
                  <div className="px-2 pb-2">
                    <p className="truncate text-sm font-semibold">{itemName(r.kind, r.item)}</p>
                    <p className="flex items-center gap-1.5 text-[11px] text-muted capitalize">
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: rarityColor(rarity) }}
                      />
                      {rarity} {r.kind}
                    </p>
                    <p className={cn("mt-0.5 text-[11px] font-bold", unlocked ? "text-success" : "text-muted")}>
                      {unlocked ? "✓ Owned" : reached ? "Needs pass" : "Locked"}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
