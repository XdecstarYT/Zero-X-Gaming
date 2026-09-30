import { test as base, expect } from "@playwright/test";

/**
 * Default test: the intro splash counts as already seen, so specs start on the
 * page itself. Use `introTest` to exercise the intro.
 */
export const test = base.extend({
  page: async ({ page }, run) => {
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem("zx-intro-seen", "1");
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
