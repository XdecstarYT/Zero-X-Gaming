import { hash } from "../core/rng";
import type { Zone } from "./lots";

export type Style =
  | "house"
  | "walkup"
  | "midrise"
  | "brickTower"
  | "glassTower"
  | "shop"
  | "solarLot"
  | "shops"
  | "office"
  | "officeTower"
  | "shed"
  | "warehouse"
  | "factory"
  | "shophouse"
  | "mixedWalkup"
  | "mixedMid"
  | "mixedTower";

export interface Spec {
  style: Style;
  floors: number;
  /** Share of the lot the building covers. */
  coverage: number;
  residents: number;
  jobs: number;
}

export const FLOOR = 3.2;
export const MAX_TIER: Record<Zone, number> = { R: 4, C: 4, I: 3, M: 4 };

/** The biggest tier a lot of this size can carry. */
export function tierCap(zone: Zone, w: number, d: number) {
  const area = w * d;
  const cap = area >= 330 ? 4 : area >= 210 ? 3 : 2;
  return Math.min(cap, MAX_TIER[zone]);
}

/**
 * What stands on a lot of this zone and tier: deterministic from the seed so
 * the simulation (capacity) and the renderer (the model) always agree.
 */
export function buildingSpec(zone: Zone, tier: number, w: number, d: number, seed: number, resBonus = 0): Spec {
  const r = (k: number) => hash(seed, k);
  const area = w * d;
  const pick = <T>(xs: T[], k: number) => xs[Math.floor(r(k) * xs.length)];
  let style: Style;
  let floors: number;
  let coverage: number;
  switch (zone) {
    case "R":
      if (tier <= 1) [style, floors, coverage] = ["house", r(1) < 0.4 ? 2 : 1, 0.42];
      else if (tier === 2) [style, floors, coverage] = ["walkup", 3 + Math.floor(r(2) * 2), 0.62];
      else if (tier === 3) [style, floors, coverage] = ["midrise", 6 + Math.floor(r(3) * 4), 0.66];
      else [style, floors, coverage] = [r(4) < 0.62 ? "brickTower" : "glassTower", 12 + Math.floor(r(5) * 12), 0.58];
      break;
    case "C":
      if (tier <= 1) [style, floors, coverage] = [area >= 300 && r(6) < 0.18 ? "solarLot" : "shop", 1 + (r(7) < 0.3 ? 1 : 0), 0.6];
      else if (tier === 2) [style, floors, coverage] = ["shops", 2 + Math.floor(r(8) * 2), 0.7];
      else if (tier === 3) [style, floors, coverage] = ["office", 5 + Math.floor(r(9) * 4), 0.68];
      else [style, floors, coverage] = ["officeTower", 14 + Math.floor(r(10) * 16), 0.55];
      break;
    case "I":
      if (tier <= 1) [style, floors, coverage] = ["shed", 1, 0.55];
      else if (tier === 2) [style, floors, coverage] = ["warehouse", 2, 0.65];
      else [style, floors, coverage] = ["factory", 2 + Math.floor(r(11) * 2), 0.6];
      break;
    default:
      if (tier <= 1) [style, floors, coverage] = ["shophouse", 2, 0.6];
      else if (tier === 2) [style, floors, coverage] = ["mixedWalkup", 3 + Math.floor(r(12) * 2), 0.66];
      else if (tier === 3) [style, floors, coverage] = ["mixedMid", 6 + Math.floor(r(13) * 3), 0.66];
      else [style, floors, coverage] = [pick(["mixedTower", "brickTower"] as Style[], 14), 12 + Math.floor(r(15) * 10), 0.58];
  }
  const fp = area * coverage;
  let residents = 0;
  let jobs = 0;
  if (style === "house") residents = 2 + Math.floor(r(16) * 4);
  else if (zone === "R") residents = Math.round((fp * floors) / 36);
  else if (style === "solarLot") jobs = 3;
  else if (zone === "C") jobs = Math.round((fp * floors) / (tier <= 1 ? 22 : 30));
  else if (zone === "I") jobs = Math.round(((fp * floors) / 34) * (1 + 0.15 * resBonus));
  else {
    residents = Math.round((fp * (floors - 1)) / 38);
    jobs = Math.round(fp / 24);
  }
  return { style, floors, coverage, residents, jobs };
}
