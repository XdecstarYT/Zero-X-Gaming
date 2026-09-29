import { beforeEach, describe, expect, it } from "vitest";
import { applyProgress, levelsGained } from "./progress";
import { totalXpForLevel } from "./xp";
import { useAuth } from "@/store/auth";
import { useToasts } from "@/store/toast";

describe("levelsGained", () => {
  it("lists every level crossed", () => {
    expect(levelsGained(0, 50)).toEqual([]);
    expect(levelsGained(0, 100)).toEqual([2]);
    expect(levelsGained(0, totalXpForLevel(4))).toEqual([2, 3, 4]);
    expect(levelsGained(500, 400)).toEqual([]);
  });
});

describe("applyProgress", () => {
  beforeEach(() => {
    useToasts.setState({ toasts: [] });
    useAuth.setState({ profile: { id: "u", username: "Alpha", avatar_url: null, xp: 90 } });
  });

  it("updates XP and announces level-ups and badges", () => {
    applyProgress(410, ["first-run", "top-10", "unknown-id"]);
    expect(useAuth.getState().profile?.xp).toBe(410);
    const titles = useToasts.getState().toasts.map((t) => t.title);
    expect(titles).toContain("Level up! You're now level 3");
    expect(titles).toContain("Badge unlocked: First Run");
    expect(titles).toContain("Badge unlocked: Top Ten");
    expect(titles).toHaveLength(3);
  });
});
