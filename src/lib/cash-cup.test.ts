import { describe, expect, it } from "vitest";
import { CUP_BOUNTY, cupPrize, freeLeft, ordinal, placePrize, plausible } from "./cash-cup";

describe("Cash Cup rules", () => {
  it("pays far more than the old 50 for a win, down to break-even at 15th", () => {
    expect(placePrize(1)).toBe(250);
    expect(placePrize(2)).toBe(125);
    expect(placePrize(5)).toBe(40);
    expect(placePrize(10)).toBe(20);
    expect(placePrize(15)).toBe(10);
    expect(placePrize(16)).toBe(0);
    expect(cupPrize(1, 6)).toBe(250 + 6 * CUP_BOUNTY);
    expect(cupPrize(30, 1)).toBe(CUP_BOUNTY);
  });

  it("gives battle pass holders two free entries a season, and nobody else any", () => {
    expect(freeLeft(true, 0)).toBe(2);
    expect(freeLeft(true, 1)).toBe(1);
    expect(freeLeft(true, 5)).toBe(0);
    expect(freeLeft(false, 0)).toBe(0);
  });

  it("refuses results that couldn't have happened", () => {
    const ok = { placement: 4, kills: 5, damage: 900, chests: 4, survivedS: 300 };
    expect(plausible(ok, 320)).toBeNull();
    expect(plausible({ ...ok, survivedS: 400 }, 320)).toBe("time");
    expect(plausible({ ...ok, placement: 1, survivedS: 90 }, 100)).toBe("time");
    expect(plausible({ ...ok, placement: 51, kills: 5 }, 320)).toBe("kills");
    expect(plausible({ ...ok, placement: 0 }, 320)).toBe("placement");
    expect(plausible({ ...ok, damage: 300 * 200 + 1 }, 320)).toBe("damage");
    expect(plausible({ placement: 28, kills: 0, damage: 0, chests: 0, survivedS: 12 }, 15)).toBeNull();
  });

  it("writes places the way people say them", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 32].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "32nd"]);
  });
});
