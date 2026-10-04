import type { Page } from "@playwright/test";
import { dismissRotate, expect, test } from "./fixtures";

/** A guest with coins in their device save. */
async function guestWith(page: Page, coins: number) {
  await page.addInitScript((coins) => {
    if (!localStorage.getItem("zx-season-s1")) localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins, hasPass: false, purchases: [], challenges: {} }));
  }, coins);
}

test("ZLink+: the page says what's in it, and that Neon Siege isn't", async ({ page }) => {
  await guestWith(page, 0);
  await page.goto("/");
  await page.getByTestId("zlink-teaser").click();
  await expect(page).toHaveURL(/\/zlink$/);
  const games = page.getByTestId("zlink-games");
  await expect(games.getByRole("link")).toHaveCount(6);
  await expect(games).toContainText("UBusiness");
  await expect(games).not.toContainText("Neon Siege");
  await expect(page.getByTestId("zlink-outside")).toContainText("Not part of ZLink+: Neon Siege");
  // Not enough coins: the button waits.
  await expect(page.getByTestId("zlink-join-button")).toBeDisabled();
});

test("ZLink+: join for 40 coins; Sports+ and UBusiness Ultimate open up, the mark shows, days stack", async ({ page }) => {
  await guestWith(page, 100);
  await page.goto("/zlink");
  await page.getByTestId("zlink-join-button").click();
  await expect(page.getByTestId("zlink-welcome")).toContainText("LINK ESTABLISHED");
  await expect(page.getByTestId("zlink-days")).toHaveText("30 days left");
  await expect(page.getByTestId("zlink-member")).toBeVisible();
  await page.getByTestId("zlink-extend").click();
  await expect(page.getByTestId("zlink-days")).toHaveText("60 days left");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("zx-season-s1")!).coins)).toBe(20);

  // A Sports+ game plays without the pass.
  await page.goto("/games/fairway");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.getByTestId("sports-lock")).toHaveCount(0);
  // UBusiness is Ultimate.
  await page.goto("/games/ubusiness");
  await expect(page.getByTestId("ubusiness-pass")).toHaveAttribute("data-tier", "ultimate");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(page.getByTestId("game-stage")).toContainText("UBusiness Ultimate", { timeout: 30_000 });
});

test("ZLink+: members get double daily coins", async ({ page }) => {
  await guestWith(page, 40);
  await page.goto("/zlink");
  await page.getByTestId("zlink-join-button").click();
  await expect(page.getByTestId("zlink-days")).toBeVisible();
  await page.goto("/");
  await expect(page.getByTestId("daily-claim")).toHaveText("Claim 10 coins");
});

test("ZLink+: Neon Siege's battle pass still has to be bought on its own", async ({ page }) => {
  await guestWith(page, 100);
  await page.goto("/zlink");
  await page.getByTestId("zlink-join-button").click();
  await expect(page.getByTestId("zlink-days")).toBeVisible();
  await page.goto("/battle-pass");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("zx-season-s1")!).hasPass)).toBe(false);
});
