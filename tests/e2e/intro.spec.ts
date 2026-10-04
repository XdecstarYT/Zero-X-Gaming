import { expect, introTest } from "./fixtures";

/** Intro tests: the one-time mega ad counts as seen (it has its own test below). */
const test = introTest.extend({
  page: async ({ page }, run) => {
    await page.addInitScript(() => {
      localStorage.setItem("zx-mega-ad-seen", "1");
      localStorage.setItem("zx-code3-ad-count", "3");
      localStorage.setItem("zx-sports-ad-count", "3");
      localStorage.setItem("zx-cricket-ad-count", "2");
      localStorage.setItem("zx-clanforge-ad-count", "2");
      localStorage.setItem("zx-ubusiness-ad-count", "3");
    });
    await run(page);
  },
});

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

introTest("the mega ad plays once after the intro, can't be skipped, then never again", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByRole("dialog", { name: "Zero X Gaming intro" }).getByRole("button", { name: "Skip intro" }).click();
  const ad = page.getByTestId("mega-ad");
  await expect(ad).toBeVisible();
  await expect(ad).toContainText(/Ad · \d+s/);
  expect(await page.locator("main").evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  // Keys and clicks don't dismiss it.
  await page.keyboard.press("Escape");
  await page.mouse.click(20, 20);
  await expect(ad).toBeVisible();
  await expect(ad).toContainText("Trenches", { timeout: 15_000 });
  await expect(ad).toBeHidden({ timeout: 45_000 });
  expect(await page.locator("main").evaluate((el) => (el as HTMLElement).inert)).toBe(false);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByRole("dialog", { name: "Zero X Gaming intro" }).getByRole("button", { name: "Skip intro" }).click();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("mega-ad")).toHaveCount(0);
});


introTest("the Code 3 trailer plays after the intro on later visits, three times at most", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem("zx-mega-ad-seen", "1");
    localStorage.setItem("zx-sports-ad-count", "3");
    localStorage.setItem("zx-cricket-ad-count", "2");
    localStorage.setItem("zx-clanforge-ad-count", "2");
      localStorage.setItem("zx-ubusiness-ad-count", "3");
    if (!localStorage.getItem("zx-code3-ad-count")) localStorage.setItem("zx-code3-ad-count", "2");
  });
  await page.goto("/");
  await page.getByRole("dialog", { name: "Zero X Gaming intro" }).getByRole("button", { name: "Skip intro" }).click();
  const ad = page.getByTestId("code3-ad");
  await expect(ad).toBeVisible();
  await expect(ad).toContainText(/Ad · \d+s/);
  expect(await page.evaluate(() => localStorage.getItem("zx-code3-ad-count"))).toBe("3");
  await expect(ad).toContainText("CODE 3", { timeout: 10_000 });
  await expect(ad).toBeHidden({ timeout: 40_000 });
  // That was the third run: never again.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByRole("dialog", { name: "Zero X Gaming intro" }).getByRole("button", { name: "Skip intro" }).click();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("code3-ad")).toHaveCount(0);
});

introTest("the Sports+ ad plays after the intro (one ad per visit, three runs at most)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem("zx-mega-ad-seen", "1");
    localStorage.setItem("zx-code3-ad-count", "0");
    localStorage.setItem("zx-cricket-ad-count", "2");
    localStorage.setItem("zx-clanforge-ad-count", "2");
      localStorage.setItem("zx-ubusiness-ad-count", "3");
    if (!localStorage.getItem("zx-sports-ad-count")) localStorage.setItem("zx-sports-ad-count", "2");
  });
  await page.goto("/");
  await page.getByRole("dialog", { name: "Zero X Gaming intro" }).getByRole("button", { name: "Skip intro" }).click();
  const ad = page.getByTestId("sports-ad");
  await expect(ad).toBeVisible();
  await expect(ad).toContainText(/Ad · \d+s/);
  expect(await page.locator("main").evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("zx-sports-ad-count"))).toBe("3");
  await expect(ad).toContainText("Sports", { timeout: 10_000 });
  await expect(ad.getByRole("link", { name: "Get Sports+" })).toBeVisible({ timeout: 30_000 });
  await expect(ad).toBeHidden({ timeout: 10_000 });
  // One ad per visit: Code 3's spot doesn't follow it.
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("code3-ad")).toHaveCount(0);
  // Third run done: next visit the Code 3 spot gets its turn instead.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByRole("dialog", { name: "Zero X Gaming intro" }).getByRole("button", { name: "Skip intro" }).click();
  await expect(page.getByTestId("code3-ad")).toBeVisible();
  await expect(page.getByTestId("sports-ad")).toHaveCount(0);
});

introTest("the Boundary Blitz and Clanforge spots go first, one per visit, twice each", async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    localStorage.setItem("zx-mega-ad-seen", "1");
    if (!localStorage.getItem("zx-cricket-ad-count")) localStorage.setItem("zx-cricket-ad-count", "1");
    if (!localStorage.getItem("zx-clanforge-ad-count")) localStorage.setItem("zx-clanforge-ad-count", "1");
    localStorage.setItem("zx-ubusiness-ad-count", "3");
  });
  await page.goto("/");
  await page.getByRole("dialog", { name: "Zero X Gaming intro" }).getByRole("button", { name: "Skip intro" }).click();
  const cricket = page.getByTestId("cricket-ad");
  await expect(cricket).toBeVisible();
  await expect(cricket).toContainText(/Ad · \d+s/);
  expect(await page.locator("main").evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("zx-cricket-ad-count"))).toBe("2");
  await expect(cricket).toContainText("Boundary", { timeout: 12_000 });
  await expect(cricket.getByRole("link", { name: "Play Boundary Blitz" })).toBeVisible({ timeout: 30_000 });
  await expect(cricket).toBeHidden({ timeout: 10_000 });
  // One ad per visit.
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("clanforge-ad")).toHaveCount(0);
  await expect(page.getByTestId("sports-ad")).toHaveCount(0);
  // Next visit: the cricket spot has had its two runs, so Clanforge's plays.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByRole("dialog", { name: "Zero X Gaming intro" }).getByRole("button", { name: "Skip intro" }).click();
  const clan = page.getByTestId("clanforge-ad");
  await expect(clan).toBeVisible();
  await expect(page.getByTestId("cricket-ad")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("zx-clanforge-ad-count"))).toBe("2");
  await expect(clan).toContainText("Build.", { timeout: 12_000 });
  await expect(clan.getByRole("link", { name: "Build your village" })).toBeVisible({ timeout: 30_000 });
  await expect(clan).toBeHidden({ timeout: 10_000 });
});

introTest("the UBusiness coming-soon spot plays first (when its 30% roll comes up), one ad per visit", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem("zx-mega-ad-seen", "1");
    if (!localStorage.getItem("zx-ubusiness-ad-count")) localStorage.setItem("zx-ubusiness-ad-count", "2");
    // This visit's roll came up.
    sessionStorage.setItem("zx-ad-roll-ubusinessAd", "1");
  });
  await page.goto("/");
  await page.getByRole("dialog", { name: "Zero X Gaming intro" }).getByRole("button", { name: "Skip intro" }).click();
  const ad = page.getByTestId("ubusiness-ad");
  await expect(ad).toBeVisible();
  await expect(ad).toContainText(/Ad · \d+s/);
  expect(await page.locator("main").evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("zx-ubusiness-ad-count"))).toBe("3");
  await expect(ad).toContainText("Coming soon", { timeout: 15_000 });
  await expect(ad.getByRole("link", { name: "Take a look" })).toBeVisible({ timeout: 30_000 });
  await expect(ad).toBeHidden({ timeout: 10_000 });
  // One ad per visit: Boundary Blitz waits for the next one.
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("cricket-ad")).toHaveCount(0);
  expect(await page.locator("main").evaluate((el) => (el as HTMLElement).inert)).toBe(false);
});

introTest("most visits skip the UBusiness spot: the next one in the queue plays instead", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem("zx-mega-ad-seen", "1");
    localStorage.setItem("zx-ubusiness-ad-count", "0");
    // This visit's roll didn't come up.
    sessionStorage.setItem("zx-ad-roll-ubusinessAd", "0");
  });
  await page.goto("/");
  await page.getByRole("dialog", { name: "Zero X Gaming intro" }).getByRole("button", { name: "Skip intro" }).click();
  await expect(page.getByTestId("cricket-ad")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("ubusiness-ad")).toHaveCount(0);
  // A skipped visit doesn't use up one of its three plays.
  expect(await page.evaluate(() => localStorage.getItem("zx-ubusiness-ad-count"))).toBe("0");
});
