import { describe, expect, it } from "vitest";
import { inZlink, scramble, ZLINK_EXCLUDED, zlinkGames } from "./zlink";
import { ZLINK_DAYS, zlinkActive, zlinkDaysLeft, zlinkExtend } from "./economy";

describe("ZLink+", () => {
  it("covers every Sports+ game, UBusiness and the exclusives, and never Neon Siege", () => {
    const slugs = zlinkGames().map((g) => g.slug);
    expect(slugs).toContain("ubusiness");
    expect(slugs).toContain("aussie-rules");
    expect(slugs).toContain("linkwave");
    expect(slugs).toContain("zenith");
    expect(slugs).toContain("zero-city");
    expect(slugs).toContain("yourgov");
    expect(slugs.filter((s) => !["ubusiness", "linkwave", "zenith", "zero-city", "yourgov"].includes(s)).length).toBe(5);
    expect(inZlink(ZLINK_EXCLUDED)).toBe(false);
    expect(inZlink("neon-siege")).toBe(false);
    expect(inZlink("trenches")).toBe(false);
  });

  it("runs 30 days, and joining again adds 30 more from where it ends", () => {
    const now = Date.UTC(2026, 9, 10);
    const day = 86_400_000;
    const first = zlinkExtend(null, now);
    expect(first - now).toBe(ZLINK_DAYS * day);
    expect(zlinkExtend(first, now) - now).toBe(60 * day);
    // Lapsed: it starts again from today.
    expect(zlinkExtend(now - 5 * day, now) - now).toBe(30 * day);
    expect(zlinkActive(first, now)).toBe(true);
    expect(zlinkActive(first, first + 1)).toBe(false);
    expect(zlinkDaysLeft(first, now)).toBe(30);
    expect(zlinkDaysLeft(now + 1, now)).toBe(1);
    expect(zlinkDaysLeft(null, now)).toBe(0);
  });

  it("decrypts a line from left to right, keeping its shape", () => {
    const t = "ONE LINK. EVERY PLUS.";
    expect(scramble(t, 1)).toBe(t);
    const half = scramble(t, 0.5, () => 0);
    expect(half.slice(0, 10)).toBe(t.slice(0, 10));
    expect(half).toHaveLength(t.length);
  });
});

describe("link levels and the weekly drop", () => {
  it("climbs Bronze, Silver, Gold, Neon by days linked", async () => {
    const { linkLevel, zlinkDropReady } = await import("./economy");
    expect(linkLevel(0).level.name).toBe("Linked");
    expect(linkLevel(30).level.name).toBe("Bronze");
    expect(linkLevel(89).level.name).toBe("Bronze");
    expect(linkLevel(90).level.name).toBe("Silver");
    expect(linkLevel(400).level.name).toBe("Neon");
    expect(linkLevel(400).next).toBeNull();
    expect(linkLevel(60).progress).toBeCloseTo(0.5);
    const now = Date.UTC(2026, 9, 20);
    expect(zlinkDropReady(null, now)).toBe(true);
    expect(zlinkDropReady(now - 6 * 86_400_000, now)).toBe(false);
    expect(zlinkDropReady(now - 7 * 86_400_000, now)).toBe(true);
  });
});
