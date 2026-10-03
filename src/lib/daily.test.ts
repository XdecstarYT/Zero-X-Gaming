import { describe, expect, it } from "vitest";
import { coinsForDay, guestState } from "./daily";

const day = (s: string) => Date.parse(`${s}T12:00:00Z`);

describe("daily rewards", () => {
  it("pays a seven-day cycle that ends on a big one, then starts over", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(coinsForDay)).toEqual([5, 5, 10, 10, 15, 20, 50, 5]);
  });

  it("counts a streak of consecutive days, and resets after a gap", () => {
    expect(guestState(null, day("2027-01-05"))).toEqual({ day: 1, claimed: false, next: 5 });
    expect(guestState({ last: "2027-01-04", day: 6 }, day("2027-01-05"))).toEqual({ day: 7, claimed: false, next: 50 });
    expect(guestState({ last: "2027-01-04", day: 7 }, day("2027-01-05"))).toEqual({ day: 1, claimed: false, next: 5 });
    expect(guestState({ last: "2027-01-02", day: 4 }, day("2027-01-05"))).toEqual({ day: 1, claimed: false, next: 5 });
    expect(guestState({ last: "2027-01-05", day: 3 }, day("2027-01-05"))).toEqual({ day: 3, claimed: true, next: 10 });
  });
});
