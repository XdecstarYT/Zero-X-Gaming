import type { CosmeticKind } from "./season";

/**
 * Coins: earned in Cash Cups, spent on the battle pass and in the Item Shop.
 * There is no real-money purchase anywhere. Mirrored in SQL by the coins/shop
 * migration; `economy.test.ts` checks the two stay in sync.
 */

/** Every third ranked match is a Cash Cup. */
export const CASH_CUP_EVERY = 3;
/** Coins for 1st / 2nd / 3rd place in a Cash Cup. */
export const CASH_CUP_PRIZES: Record<number, number> = { 1: 50, 2: 20, 3: 5 };
/** Cash Cups are always played against Hard bots. */
export const CASH_CUP_DIFFICULTY = "hard" as const;

export const BATTLE_PASS_PRICE = 200;
/** Sports+ is a one-time unlock: every Sports+ game, now and later. */
export const SPORTS_PASS_PRICE = 50;
export const SPORTS_PASS_ID = "sports-plus";

/** Is the Nth ranked match of the season (1-based) a Cash Cup? */
export function isCashCup(matchNumber: number) {
  return matchNumber > 0 && matchNumber % CASH_CUP_EVERY === 0;
}

/** Matches until the next Cash Cup, given matches already played (0 = the next match is one). */
export function matchesUntilCashCup(played: number) {
  return (CASH_CUP_EVERY - ((played + 1) % CASH_CUP_EVERY)) % CASH_CUP_EVERY;
}

export function cashCupPrize(placement: number) {
  return CASH_CUP_PRIZES[placement] ?? 0;
}

// ------------------------------------------------------------------ item shop

export interface ShopItem {
  kind: CosmeticKind;
  item: string;
  price: number;
  /** Shown big at the top of the drop. */
  featured?: boolean;
  /** One line of flavour text for the inspect view. */
  blurb: string;
}

export interface Drop {
  id: string;
  name: string;
  tagline: string;
  startsAt: string;
  endsAt: string;
  items: ShopItem[];
}

export const DROPS: Drop[] = [
  {
    id: "drop-1",
    name: "DROP 1",
    tagline: "The first Item Shop drop of Season 1. Here for two weeks only.",
    startsAt: "2026-09-30T00:00:00Z",
    endsAt: "2026-10-14T00:00:00Z",
    items: [
      { kind: "outfit", item: "apex", price: 150, featured: true, blurb: "Blackout armour, red-hot visor. The last thing the lobby sees." },
      { kind: "outfit", item: "dropzone", price: 100, blurb: "Built for hot drops: glowing hazard trim and a jump helmet." },
      { kind: "outfit", item: "sunset", price: 90, blurb: "Golden-hour colours for fighters who finish every day on top." },
      { kind: "outfit", item: "frostbite", price: 60, blurb: "Ice-blue layers that stay cool when the storm closes in." },
      { kind: "wrap", item: "chrome", price: 80, blurb: "Mirror-polished metal. It reflects the storm and your wins." },
      { kind: "wrap", item: "molten", price: 60, blurb: "Cooling-lava camo with embers that never quite go out." },
      { kind: "wrap", item: "aurora", price: 40, blurb: "Northern lights streaked across the steel." },
      { kind: "banner", item: "cash-king", price: 35, blurb: "A crown of gold coins for Cash Cup regulars." },
      { kind: "banner", item: "drop-1", price: 25, blurb: "The hazard stripes of the very first drop. Day-one flex." },
    ],
  },
];

/** The drop live right now (or the next one to open), if any. */
export function currentDrop(now = Date.now()): Drop | null {
  const live = DROPS.find((d) => now >= Date.parse(d.startsAt) && now < Date.parse(d.endsAt));
  return live ?? null;
}

export function shopItemFor(kind: CosmeticKind, item: string) {
  for (const d of DROPS) {
    const it = d.items.find((x) => x.kind === kind && x.item === item);
    if (it) return { drop: d, ...it };
  }
  return null;
}
