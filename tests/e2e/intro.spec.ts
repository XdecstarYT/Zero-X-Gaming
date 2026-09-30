import { expect, introTest as test } from "./fixtures";

test("intro plays on first visit, can be skipped, and doesn't return this session", async ({ page }) => {
  await page.goto("/");
  const intro = page.getByRole("dialog", { name: "Zero X Gaming intro" });
  await expect(intro).toBeVisible();
  await expect(intro.getByRole("button", { name: "Skip intro" })).toBeFocused();
  // Page behind is inert while the intro plays.
  expect(await page.locator("main").evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  await intro.getByRole("button", { name: "Skip intro" }).click();
  await expect(intro).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Play. Compete.");
  expect(await page.locator("main").evaluate((el) => (el as HTMLElement).inert)).toBe(false);

  await page.goto("/games");
  await expect(page.getByRole("dialog", { name: "Zero X Gaming intro" })).toHaveCount(0);
  await expect(page.locator("#zx-intro")).toBeHidden();
});

test("intro dismisses itself and with any key", async ({ page }) => {
  await page.goto("/");
  const intro = page.getByRole("dialog", { name: "Zero X Gaming intro" });
  await expect(intro).toBeVisible();
  await page.keyboard.press("KeyA");
  await expect(intro).toBeHidden();

  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Zero X Gaming intro" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Zero X Gaming intro" })).toBeHidden({ timeout: 8000 });
});

test("reduced motion gets a short static intro", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Zero X Gaming intro" })).toBeHidden({ timeout: 4000 });
  expect(Date.now() - t0).toBeLessThan(4000);
  await ctx.close();
});

test("invite links (?room=) skip the intro so friends land straight in the game", async ({ page }) => {
  await page.goto("/games/neon-siege?room=ABCD&net=local");
  await expect(page.locator("#zx-intro")).toBeHidden();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
});
