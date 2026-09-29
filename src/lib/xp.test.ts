import { describe, expect, it } from "vitest";
import { levelFromXp, MAX_LEVEL, totalXpForLevel, xpForNextLevel } from "./xp";

describe("xpForNextLevel", () => {
  it("costs 100 XP to go from level 1 to 2", () => {
    expect(xpForNextLevel(1)).toBe(100);
  });

  it("rounds to the nearest 10 and grows with level", () => {
    expect(xpForNextLevel(2)).toBe(280); // 100 * 2^1.5 = 282.8
    for (let l = 1; l < 50; l++) {
      expect(xpForNextLevel(l + 1)).toBeGreaterThan(xpForNextLevel(l));
      expect(xpForNextLevel(l) % 10).toBe(0);
    }
  });

  it("treats invalid levels as level 1", () => {
    expect(xpForNextLevel(0)).toBe(100);
    expect(xpForNextLevel(-5)).toBe(100);
    expect(xpForNextLevel(NaN)).toBe(100);
  });
});

describe("levelFromXp", () => {
  it("starts at level 1 with no progress", () => {
    expect(levelFromXp(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForLevel: 100, progress: 0, isMaxLevel: false });
  });

  it("levels up exactly at the threshold", () => {
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100)).toMatchObject({ level: 2, xpIntoLevel: 0 });
    expect(levelFromXp(150)).toMatchObject({ level: 2, xpIntoLevel: 50, xpForLevel: 280 });
  });

  it("round-trips with totalXpForLevel", () => {
    for (const l of [1, 2, 5, 17, 42, 99]) {
      expect(levelFromXp(totalXpForLevel(l)).level).toBe(l);
      expect(levelFromXp(totalXpForLevel(l) - 1).level).toBe(Math.max(1, l - 1));
    }
  });

  it("clamps negative / non-finite XP to zero", () => {
    expect(levelFromXp(-50).level).toBe(1);
    expect(levelFromXp(Number.NaN).level).toBe(1);
  });

  it("caps at max level", () => {
    const p = levelFromXp(Number.MAX_SAFE_INTEGER);
    expect(p).toMatchObject({ level: MAX_LEVEL, isMaxLevel: true, progress: 1 });
  });

  it("reports progress between 0 and 1", () => {
    const { progress } = levelFromXp(totalXpForLevel(10) + xpForNextLevel(10) / 2);
    expect(progress).toBeCloseTo(0.5, 2);
  });
});
