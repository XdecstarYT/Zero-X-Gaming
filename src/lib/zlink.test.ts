import { describe, expect, it } from "vitest";
import { inZlink, scramble, ZLINK_EXCLUDED, zlinkGames } from "./zlink";
import { ZLINK_DAYS, zlinkActive, zlinkDaysLeft, zlinkExtend } from "./economy";

describe("ZLink+", () => {
  it("covers every Sports+ game and UBusiness, and never Neon Siege", () => {
    const slugs = zlinkGames().map((g) => g.slug);
    expect(slugs).toContain("ubusiness");
    expect(slugs).toContain("aussie-rules");
    expect(slugs.filter((s) => s !== "ubusiness").length).toBe(5);
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
