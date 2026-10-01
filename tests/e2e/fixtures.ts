import { test as base, expect } from "@playwright/test";

/**
 * Default test: the intro splash and the one-time mega ad and the Code 3 and
 * Sports+ spots count as already seen, so specs start on the page itself. Use `introTest` to exercise them.
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
