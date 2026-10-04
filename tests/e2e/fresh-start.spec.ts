import { expect, test } from "./fixtures";

test("ZX Cash fresh start: old device saves are cleared once, settings stay, and the notice explains it", async ({ page }) => {
  // A browser from before the change: an old wallet, a membership and a city, plus settings.
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.removeItem("zx-fresh-start");
    localStorage.removeItem("zx-fresh-seen");
    localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 900, matches: 4, wins: 1, kills: 9, coins: 340, hasPass: true, purchases: [], challenges: {}, zlinkUntil: Date.now() + 9e9 }));
    localStorage.setItem("zx-zenith-city", "{}");
    localStorage.setItem("zx-zenith-prefs", JSON.stringify({ gfx: "low" }));
  });
  await page.goto("/");
  const notice = page.getByTestId("fresh-start");
  await expect(notice).toBeVisible({ timeout: 10_000 });
  await expect(notice).toContainText("Coins are now ZX Cash");
  const left = await page.evaluate(() => ({ season: localStorage.getItem("zx-season-s1"), city: localStorage.getItem("zx-zenith-city"), prefs: localStorage.getItem("zx-zenith-prefs") }));
  expect(left.city).toBeNull();
  expect(left.prefs).not.toBeNull();
  // The wallet starts again from zero.
  expect(left.season === null || JSON.parse(left.season).coins === 0).toBe(true);
  await expect(page.getByRole("link", { name: /Item Shop: 0 ZX Cash/ })).toBeVisible();
  await notice.getByRole("button", { name: "Got it" }).click();
  await expect(notice).toBeHidden();
  // Once only.
  await page.reload();
  await page.waitForTimeout(3000);
  await expect(page.getByTestId("fresh-start")).toBeHidden();
});
