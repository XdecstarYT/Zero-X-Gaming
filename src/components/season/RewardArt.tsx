"use client";

import { OUTFITS, WRAPS } from "@/games/neon-siege/cosmetics";
import { RARITY, type Rarity } from "@/games/neon-siege/items";
import { BANNERS, type CosmeticKind } from "@/lib/season";
import { cn } from "@/lib/cn";
import { useItemThumb } from "./use-item-thumb";

export function rarityOf(kind: CosmeticKind, item: string): Rarity {
  if (kind === "outfit") return OUTFITS[item]?.rarity ?? "common";
  if (kind === "wrap") return WRAPS[item]?.rarity ?? "common";
  return item === "rookie"
    ? "common"
    : ["gilded", "victory", "apex", "legend", "zero"].includes(item)
      ? "legendary"
      : "rare";
}

export function itemName(kind: CosmeticKind, item: string) {
  if (kind === "outfit") return OUTFITS[item]?.name ?? item;
  if (kind === "wrap") return WRAPS[item]?.name ?? item;
  return BANNERS[item]?.name ?? item;
}

export const rarityColor = (r: Rarity) => RARITY[r].color;

/**
 * Art for a cosmetic: a 3D-rendered product shot for outfits and wraps once it's
 * ready, with a flat illustration meanwhile (and when WebGL isn't available).
 */
export function RewardArt({ kind, item, className }: { kind: CosmeticKind; item: string; className?: string }) {
  const thumb = useItemThumb(kind, item);
  if (thumb) {
    return (
      <div aria-hidden className={cn("relative overflow-hidden rounded-md bg-surface-3", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
        <img src={thumb} alt="" className="absolute inset-0 h-full w-full animate-rise object-contain" />
      </div>
    );
  }
  if (kind === "banner") {
    return <div aria-hidden className={cn("rounded-md", className)} style={{ background: BANNERS[item]?.art }} />;
  }
  if (kind === "wrap") {
    const w = WRAPS[item];
    const bg =
      w?.pattern === "stripes"
        ? `repeating-linear-gradient(120deg, ${w.base} 0 10px, ${w.alt} 10px 16px)`
        : w?.pattern === "camo"
          ? `radial-gradient(circle at 30% 40%, ${w.alt} 0 18%, transparent 19%), radial-gradient(circle at 70% 65%, ${w.alt} 0 16%, transparent 17%), radial-gradient(circle at 80% 20%, ${w.alt} 0 10%, transparent 11%), ${w.base}`
          : w?.pattern === "hex"
            ? `repeating-linear-gradient(60deg, ${w.alt} 0 1px, transparent 1px 8px), repeating-linear-gradient(-60deg, ${w.alt} 0 1px, transparent 1px 8px), ${w.base}`
            : `linear-gradient(135deg, ${w?.base}, ${w?.alt})`;
    return (
      <div aria-hidden className={cn("grid place-items-center rounded-md bg-surface-3", className)}>
        <svg viewBox="0 0 64 24" className="w-4/5">
          <defs>
            <clipPath id={`gun-${item}`}>
              <path d="M2 8h52v5H39l-3 9h-6l2-9h-9l-2 6h-5l1-6H11l-5 5H2z" />
            </clipPath>
          </defs>
          <foreignObject x="0" y="0" width="64" height="24" clipPath={`url(#gun-${item})`}>
            <div style={{ width: 64, height: 24, background: bg }} />
          </foreignObject>
        </svg>
      </div>
    );
  }
  const o = OUTFITS[item];
  if (!o) return null;
  return (
    <div aria-hidden className={cn("relative rounded-md bg-surface-3", className)}>
      <svg viewBox="0 0 40 64" className="absolute inset-0 m-auto h-[85%]">
        <circle cx="20" cy="10" r="6.5" fill={o.skin} />
        {o.headgear !== "none" ? (
          <path d="M13 9a7 7 0 0 1 14 0z" fill={o.headColor} />
        ) : (
          <path d="M13.5 8.5a6.5 6.5 0 0 1 13 0z" fill={o.headColor} />
        )}
        {o.glow && o.headgear === "visor" && <rect x="15" y="9" width="10" height="2.5" rx="1" fill={o.glow} />}
        <rect x="11" y="17" width="18" height="20" rx="4" fill={o.top} />
        <rect x="12" y="19" width="16" height="12" rx="2" fill={o.accent} opacity="0.9" />
        {o.glow && <rect x="12" y="23" width="16" height="1.5" fill={o.glow} />}
        <rect x="6" y="18" width="5" height="17" rx="2.5" fill={o.top} />
        <rect x="29" y="18" width="5" height="17" rx="2.5" fill={o.top} />
        <rect x="12" y="36" width="7" height="20" rx="3" fill={o.bottom} />
        <rect x="21" y="36" width="7" height="20" rx="3" fill={o.bottom} />
        <rect x="11" y="55" width="8.5" height="4" rx="1.5" fill={o.boots} />
        <rect x="20.5" y="55" width="8.5" height="4" rx="1.5" fill={o.boots} />
      </svg>
    </div>
  );
}
