/**
 * Cash Cup: Neon Siege tournaments for ZX Cash. 55 fighters on the Cash Cup
 * Arena (four towns stitched together), on Hard, for a far bigger purse than
 * the free Cash Cup every third match. It costs 10 ZX Cash to enter; the
 * battle pass gives two free entries a season. The server checks entries and
 * results the same way these rules do (see the cash_cup migration).
 */

export const CUP_ENTRY = 10;
export const CUP_FREE_WITH_PASS = 2;
export const CUP_FIELD = 55;
/** An entry left open longer than this is forfeited (closed tab, crash). */
export const CUP_OPEN_MINUTES = 40;
/** ZX Cash per elimination, on top of the placement prize. */
export const CUP_BOUNTY = 3;

/** Placement prizes, best first: [from, to, ZX Cash]. */
export const CUP_PRIZES: [number, number, number][] = [
  [1, 1, 250],
  [2, 2, 125],
  [3, 3, 75],
  [4, 5, 40],
  [6, 10, 20],
  [11, 15, 10],
];

export const placePrize = (placement: number) => CUP_PRIZES.find(([a, b]) => placement >= a && placement <= b)?.[2] ?? 0;

/** What a finish pays: the placement prize plus a bounty per elimination. */
export const cupPrize = (placement: number, kills: number) => placePrize(placement) + Math.max(0, kills) * CUP_BOUNTY;

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

export interface CupResult {
  placement: number;
  kills: number;
  damage: number;
  chests: number;
  survivedS: number;
}

/**
 * Could this result really have happened in `elapsedS` seconds since entering?
 * (Mirrors finish_cash_cup on the server.)
 */
export function plausible(r: CupResult, elapsedS: number, players = CUP_FIELD): string | null {
  const whole = (v: number) => Number.isInteger(v) && v >= 0;
  if (!whole(r.placement) || r.placement < 1 || r.placement > players) return "placement";
  if (!whole(r.kills) || r.kills > players - r.placement) return "kills";
  if (!whole(r.chests) || r.chests > 120) return "chests";
  if (!(r.survivedS >= 0) || r.survivedS > 1800 || r.survivedS > elapsedS + 5) return "time";
  if (!(r.damage >= 0) || r.damage > 20000 || r.damage > r.survivedS * 200) return "damage";
  // The storm takes minutes to close: nobody wins or makes the top ten in seconds.
  if (r.placement === 1 && r.survivedS < 150) return "time";
  if (r.placement <= 10 && r.survivedS < 60) return "time";
  return null;
}

/** Free entries left this season. */
export const freeLeft = (hasPass: boolean, usedFree: number) => (hasPass ? Math.max(0, CUP_FREE_WITH_PASS - usedFree) : 0);
