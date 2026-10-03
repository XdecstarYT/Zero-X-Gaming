import { describe, expect, it } from "vitest";
import { STICK_RADIUS, stickInput } from "./touchstick";

describe("touch stick", () => {
  it("reads the thumb's direction: right is +mx, down is +mz", () => {
    expect(stickInput(30, 0).mx).toBeGreaterThan(0);
    expect(stickInput(-30, 0).mx).toBeLessThan(0);
    expect(stickInput(0, -30).mz).toBeLessThan(0);
    expect(stickInput(0, 30).mz).toBeGreaterThan(0);
  });

  it("is a circle: a full push is length 1 in any direction, no faster on diagonals", () => {
    for (const [dx, dy] of [[200, 0], [0, -200], [150, 150], [-90, 40]]) {
      const { mx, mz } = stickInput(dx, dy);
      expect(Math.hypot(mx, mz)).toBeCloseTo(1);
    }
    const half = stickInput(STICK_RADIUS / 2, 0);
    expect(half.mx).toBeCloseTo(0.5);
  });

  it("ignores a resting thumb's wobble", () => {
    expect(stickInput(3, -2)).toEqual({ mx: 0, mz: 0 });
  });
});
