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
  await expect(games.getByRole("link")).toHaveCount(8);
  await expect(games).toContainText("Linkwave");
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
  await expect(page.getByTestId("daily-claim")).toHaveText("Claim 10 ZX Cash");
});

test("ZLink+: Neon Siege's battle pass still has to be bought on its own", async ({ page }) => {
  await guestWith(page, 100);
  await page.goto("/zlink");
  await page.getByTestId("zlink-join-button").click();
  await expect(page.getByTestId("zlink-days")).toBeVisible();
  await page.goto("/battle-pass");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("zx-season-s1")!).hasPass)).toBe(false);
});

test("ZLink+: Linkwave is members only; members play it, link, and get the dashboard and the weekly drop", async ({ page }) => {
  await guestWith(page, 100);
  await page.goto("/games/linkwave");
  await expect(page.getByTestId("game-access")).toHaveText("ZLink+ exclusive");
  await expect(page.getByTestId("zlink-lock")).toBeVisible();
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("game-stage")).toHaveAttribute("data-phase", "playing");
  // Find a link of three on the board and play it.
  const played = await page.evaluate(() => {
    type LW = { state: () => { board: number[][]; score: number }; link: (p: { c: number; r: number }[]) => void };
    const lw = (window as unknown as { __linkwave: LW }).__linkwave;
    const b = lw.state().board;
    for (let c = 0; c < b.length; c++)
      for (let r = 0; r < b[0].length; r++) {
        const col = b[c][r];
        const path = [{ c, r }];
        const seen = new Set([`${c},${r}`]);
        while (path.length < 3) {
          const last = path[path.length - 1];
          const next = [
            { c: last.c + 1, r: last.r },
            { c: last.c - 1, r: last.r },
            { c: last.c, r: last.r + 1 },
            { c: last.c, r: last.r - 1 },
          ].find((n) => b[n.c]?.[n.r] === col && !seen.has(`${n.c},${n.r}`));
          if (!next) break;
          seen.add(`${next.c},${next.r}`);
          path.push(next);
        }
        if (path.length === 3) {
          lw.link(path);
          return lw.state().score;
        }
      }
    return 0;
  });
  expect(played).toBeGreaterThan(0);
  // Run the clock out: the platform takes the score.
  await page.evaluate(() => (window as unknown as { __linkwave: { setTime: (t: number) => void } }).__linkwave.setTime(0));
  await expect(page.getByTestId("game-stage")).toHaveAttribute("data-phase", "over", { timeout: 10_000 });

  await page.goto("/zlink");
  await expect(page.getByTestId("zlink-dashboard")).toBeVisible();
  await expect(page.getByTestId("zlink-level")).toContainText("Bronze");
  await page.getByTestId("zlink-drop").click();
  await expect(page.getByTestId("zlink-drop-wait")).toContainText("7 days");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("zx-season-s1")!).coins)).toBe(100 - 40 + 15);
});
