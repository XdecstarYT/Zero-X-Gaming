import { test as base, expect } from "@playwright/test";

/**
 * Default test: the intro splash, the one-time mega ad and every spot (UBusiness,
 * Boundary Blitz, Clanforge, Sports+, Code 3) and the ZX Cash fresh start count as already seen, so specs start on the page itself. Use `introTest` to exercise them.
 */
export const test = base.extend({
  page: async ({ page }, run) => {
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem("zx-intro-seen", "1");
        localStorage.setItem("zx-mega-ad-seen", "1");
        localStorage.setItem("zx-code3-ad-count", "3");
        localStorage.setItem("zx-sports-ad-count", "3");
        localStorage.setItem("zx-cricket-ad-count", "2");
        localStorage.setItem("zx-clanforge-ad-count", "2");
        localStorage.setItem("zx-ubusiness-ad-count", "3");
        // This browser has already had the ZX Cash fresh start (so seeded saves survive) and seen its notice.
        localStorage.setItem("zx-fresh-start", "2026-10-zx-cash");
        localStorage.setItem("zx-fresh-seen", "2026-10-zx-cash");
      } catch {}
    });
    await run(page);
  },
});

export const introTest = base;
export { expect };

/** Phones show a "rotate your device" card over landscape games; tests play in portrait. */
export async function dismissRotate(page: import("@playwright/test").Page) {
  const btn = page.getByRole("button", { name: "Play in portrait" });
  if (await btn.isVisible().catch(() => false)) await btn.click();
}
