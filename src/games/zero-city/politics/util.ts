/** Small shared helpers for the politics modules. */
import { rng } from "../core/rng";
import type { PoliticsState } from "./politics";

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** A fresh seeded stream per roll (each module salts it differently), so results don't depend on UI timing. */
export function rollOf(s: PoliticsState, salt: number) {
  s.rolls++;
  return rng(s.seed * salt + s.rolls * 104_729 + salt);
}

/** Daily hours at which things happen, so modules don't all fire at once. */
export const isHour = (h: number, at: number) => ((h % 24) + 24) % 24 === at;
