import { afterEach, describe, expect, it, vi } from "vitest";
import { rolled } from "./ad-turn";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("an ad's chance of turning up", () => {
  it("always plays without a chance", () => {
    expect(rolled("x", 1)).toBe(true);
  });

  it("rolls once per visit and keeps the answer", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    expect(rolled("ub", 0.3)).toBe(true);
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    expect(rolled("ub", 0.3)).toBe(true);
    sessionStorage.clear();
    expect(rolled("ub", 0.3)).toBe(false);
  });

  it("comes up on about 30% of visits", () => {
    let yes = 0;
    for (let i = 0; i < 4000; i++) {
      sessionStorage.clear();
      if (rolled("ub", 0.3)) yes++;
    }
    expect(yes / 4000).toBeGreaterThan(0.26);
    expect(yes / 4000).toBeLessThan(0.34);
  });
});
