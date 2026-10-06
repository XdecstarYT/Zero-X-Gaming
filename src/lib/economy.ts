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
/** UBusiness editions: Lite 5 coins, Ultimate 30 (25 more from Lite), Ultimate free with the battle pass. */
export const UBUSINESS_PRICES = { lite: 5, ultimate: 30 } as const;
export type UBusinessTier = keyof typeof UBUSINESS_PRICES;
/** What Ultimate costs you now. */
export const ubusinessPrice = (tier: UBusinessTier, owned: UBusinessTier | null) => (tier === "ultimate" && owned === "lite" ? UBUSINESS_PRICES.ultimate - UBUSINESS_PRICES.lite : UBUSINESS_PRICES[tier]);

/** Zero City's Riviera DLC: three coastal maps, the Riviera look and four seaside landmarks. A one-time unlock. */
export const ZERO_CITY_DLC_PRICE = 50;
export const ZERO_CITY_DLC_ID = "zero-city-riviera";

/** ZLink+: the membership. 40 coins for 30 days; joining again adds 30 more. */
export const ZLINK_PRICE = 40;
export const ZLINK_DAYS = 30;
const DAY_MS = 86_400_000;
/** Is a membership running to `until` (ms) still on at `now`? */
export const zlinkActive = (until: number | null | undefined, now = Date.now()) => !!until && until > now;
/** Where a membership runs to after joining (or extending) at `now`. */
export const zlinkExtend = (until: number | null | undefined, now = Date.now()) => Math.max(now, until ?? 0) + ZLINK_DAYS * DAY_MS;
/** Whole days left (rounded up), 0 when it's over. */
export const zlinkDaysLeft = (until: number | null | undefined, now = Date.now()) => (zlinkActive(until, now) ? Math.ceil((until! - now) / DAY_MS) : 0);

/** The weekly member drop. */
export const ZLINK_DROP = 15;
export const ZLINK_DROP_DAYS = 7;
/** Can the weekly drop be taken (`lastDrop` in ms, or never)? */
export const zlinkDropReady = (lastDrop: number | null | undefined, now = Date.now()) => !lastDrop || now - lastDrop >= ZLINK_DROP_DAYS * DAY_MS;
/** Whole days until the next weekly drop (at least 1 while waiting; 0 if there's never been one). */
export const zlinkDropIn = (lastDrop: number | null | undefined, now = Date.now()) => (lastDrop ? Math.max(1, Math.ceil((lastDrop + ZLINK_DROP_DAYS * DAY_MS - now) / DAY_MS)) : 0);
/** Link levels, by total days ever linked. */
export const LINK_LEVELS = [
  { name: "Linked", days: 0, color: "#22e5ff" },
  { name: "Bronze", days: 30, color: "#d97706" },
  { name: "Silver", days: 90, color: "#cbd5e1" },
  { name: "Gold", days: 180, color: "#facc15" },
  { name: "Neon", days: 365, color: "#ff2bd6" },
] as const;
/** Your link level and how far to the next. */
export function linkLevel(daysTotal: number) {
  let i = 0;
  while (i + 1 < LINK_LEVELS.length && daysTotal >= LINK_LEVELS[i + 1].days) i++;
  const next = LINK_LEVELS[i + 1] ?? null;
  return { index: i, level: LINK_LEVELS[i], next, progress: next ? (daysTotal - LINK_LEVELS[i].days) / (next.days - LINK_LEVELS[i].days) : 1 };
}

/** Launch offer: UBusiness Ultimate is free to claim (and keep) until the end of 31 October 2026, anywhere on Earth. */
export const UBUSINESS_FREE_UNTIL = Date.parse("2026-11-01T12:00:00Z");
export const ubusinessFreeOpen = (now = Date.now()) => now < UBUSINESS_FREE_UNTIL;

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
