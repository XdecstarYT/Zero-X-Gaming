import { describe, expect, it } from "vitest";
import { introGateScript } from "@/components/layout/IntroSplash";
import { themeScript } from "@/store/settings";
import { freshStartScript } from "./fresh-start";

// These run in <head> before the app: a syntax slip in one breaks the page silently.
describe("inline head scripts", () => {
  it.each([
    ["intro gate", introGateScript],
    ["theme", themeScript],
    ["fresh start", freshStartScript],
  ])("%s parses and runs", (_, src) => {
    expect(() => new Function(src)()).not.toThrow();
  });

  it("skips the site intro on the Cash Cup app, which has its own", () => {
    sessionStorage.clear();
    delete document.documentElement.dataset.intro;
    window.history.replaceState(null, "", "/cash-cup");
    new Function(introGateScript)();
    expect(document.documentElement.dataset.intro).toBe("done");
    delete document.documentElement.dataset.intro;
    window.history.replaceState(null, "", "/games");
    new Function(introGateScript)();
    expect(document.documentElement.dataset.intro).toBeUndefined();
  });
});
