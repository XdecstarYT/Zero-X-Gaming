import { beforeEach, describe, expect, it } from "vitest";
import { FRESH_START_EPOCH, FRESH_START_KEY, freshStartScript, keepKey, wipeList } from "./fresh-start";

describe("the ZX Cash fresh start", () => {
  it("wipes progress and keeps accounts, settings and preferences", () => {
    for (const k of ["zx-season-s1", "zx-season-s1:abc", "zx-daily", "zx-daily:abc", "zx-zenith-city", "zx-ubusiness-ultimate", "zx-life-save", "zx-war-record", "zx-code3-career", "zx-footy-career", "zx-siege-loadout", "zx-clanforge", "zx-derby-record"])
      expect(keepKey(k)).toBe(false);
    for (const k of ["zx-settings", "zx-device-accounts", "zx-device-session", "zx-guest-name", "zx-library", "zx-zenith-prefs", "zx-code3-gfx", "zx-ubusiness-ad-count", "zx-intro-seen", "other-site-key"])
      expect(keepKey(k)).toBe(true);
    expect(wipeList(["zx-settings", "zx-season-s1", "zx-zenith-prefs"])).toEqual(["zx-season-s1"]);
  });

  describe("the inline script", () => {
    beforeEach(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    const run = () => new Function(freshStartScript)();

    it("clears old saves once, then leaves new progress alone", () => {
      localStorage.setItem("zx-season-s1", JSON.stringify({ coins: 500, zlinkUntil: 9e12 }));
      localStorage.setItem("zx-settings", "{}");
      localStorage.setItem("zx-zenith-prefs", "{}");
      sessionStorage.setItem("zx-ubusiness-tier", "ultimate");
      run();
      expect(localStorage.getItem("zx-season-s1")).toBeNull();
      expect(sessionStorage.getItem("zx-ubusiness-tier")).toBeNull();
      expect(localStorage.getItem("zx-settings")).toBe("{}");
      expect(localStorage.getItem("zx-zenith-prefs")).toBe("{}");
      expect(localStorage.getItem(FRESH_START_KEY)).toBe(FRESH_START_EPOCH);
      // Progress earned after the fresh start is kept on the next visit.
      localStorage.setItem("zx-season-s1", JSON.stringify({ coins: 5 }));
      run();
      expect(localStorage.getItem("zx-season-s1")).not.toBeNull();
    });
  });
});
