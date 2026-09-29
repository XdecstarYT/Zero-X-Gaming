"use client";

import { BADGES } from "@/lib/catalog";
import { levelFromXp } from "@/lib/xp";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/toast";

/** Pure: which level-ups happened between two XP totals. */
export function levelsGained(prevXp: number, nextXp: number): number[] {
  const from = levelFromXp(prevXp).level;
  const to = levelFromXp(nextXp).level;
  return Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i + 1);
}

/**
 * Apply a server-confirmed XP total to the local profile and celebrate
 * level-ups and newly unlocked achievements.
 */
export function applyProgress(totalXp: number, newAchievements: string[]) {
  const { profile, set } = useAuth.getState();
  if (profile) {
    const levels = levelsGained(profile.xp, totalXp);
    set({ profile: { ...profile, xp: totalXp } });
    if (levels.length) toast(`Level up! You're now level ${levels[levels.length - 1]}`, { tone: "success" });
  }
  for (const id of newAchievements) {
    const badge = BADGES.find((b) => b.id === id);
    if (badge)
      toast(`Badge unlocked: ${badge.name}`, { tone: "success", description: badge.description, durationMs: 6000 });
  }
}
