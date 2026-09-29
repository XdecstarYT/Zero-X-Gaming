/**
 * XP / level curve.
 *
 * XP required to go from level L to L+1 is `BASE * L^EXP`, rounded to the nearest 10.
 * Level 1 → 2 costs 100 XP; the curve steepens gently so early levels come fast.
 */
const BASE = 100;
const EXP = 1.5;
export const MAX_LEVEL = 100;

export function xpForNextLevel(level: number): number {
  if (!Number.isFinite(level) || level < 1) return xpForNextLevel(1);
  return Math.round((BASE * Math.pow(Math.floor(level), EXP)) / 10) * 10;
}

/** Total XP needed to *reach* `level` from zero. Level 1 needs 0 XP. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  const target = Math.min(Math.max(1, Math.floor(level)), MAX_LEVEL);
  for (let l = 1; l < target; l++) total += xpForNextLevel(l);
  return total;
}

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP the current level requires in total (0 at max level). */
  xpForLevel: number;
  /** 0..1 */
  progress: number;
  isMaxLevel: boolean;
}

export function levelFromXp(totalXp: number): LevelProgress {
  let remaining = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;
  let level = 1;
  while (level < MAX_LEVEL) {
    const need = xpForNextLevel(level);
    if (remaining < need) {
      return { level, xpIntoLevel: remaining, xpForLevel: need, progress: remaining / need, isMaxLevel: false };
    }
    remaining -= need;
    level++;
  }
  return { level: MAX_LEVEL, xpIntoLevel: 0, xpForLevel: 0, progress: 1, isMaxLevel: true };
}
