import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.use({ viewport: { width: 1200, height: 800 } });

/** A guest with ZX Cash (and maybe the battle pass) on this device, on the 2D view for speed. */
async function guest(page: Page, coins: number, hasPass = false) {
  await page.addInitScript(
    ([coins, hasPass]) => {
      if (!localStorage.getItem("zx-season-s1")) localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins, hasPass, purchases: [], challenges: {} }));
      localStorage.setItem("zx-siege-gfx", "2d");
    },
    [coins, hasPass] as const,
  );
}

const save = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("zx-season-s1")!));

async function toLobby(page: Page) {
  await page.goto("/cash-cup?cup=test");
  await page.getByTestId("cash-cup-intro").click();
  await expect(page.getByTestId("cash-cup-loading")).toBeVisible();
  await expect(page.getByTestId("cash-cup-lobby")).toBeVisible({ timeout: 30_000 });
}

test("Cash Cup: intro, loading, lobby; enter for 10 ZX Cash, drop into a 55-player cup, collect the prize", async ({ page }) => {
  test.setTimeout(180_000);
  await guest(page, 25);
  await toLobby(page);
  await expect(page.getByTestId("cash-cup-balance")).toContainText("25");
  await expect(page.getByTestId("cash-cup-free")).toContainText("The battle pass gives 2 free entries");
  await page.getByTestId("cash-cup-enter").click();
  await expect(page.getByTestId("cash-cup-ticket")).toContainText("10 ZX Cash paid");
  expect((await save(page)).coins).toBe(15);
  await expect(page.getByTestId("cash-cup-match")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("siege-hud")).toContainText("55 ALIVE", { timeout: 30_000 });

  // The cup ends: 9th with 4 eliminations pays 20 + 4 × 3.
  await page.evaluate(() => (window as unknown as { __cashCup: { finish: (s: object) => void } }).__cashCup.finish({ kills: 4, placement: 9, players: 55, damage: 700, chests: 3, survivedS: 0, difficulty: "hard" }));
  await expect(page.getByTestId("cash-cup-payout")).toBeVisible();
  // Too quick for a top-ten finish: the result is refused.
  await expect(page.getByTestId("cash-cup-payout").getByRole("alert")).toContainText("not plausible");
  await page.getByTestId("cash-cup-done").click();

  // A real finish: enter again and come 20th with 2 eliminations.
  await page.getByTestId("cash-cup-enter").click();
  await expect(page.getByTestId("cash-cup-match")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => (window as unknown as { __cashCup: { finish: (s: object) => void } }).__cashCup.finish({ kills: 2, placement: 20, players: 55, damage: 150, chests: 1, survivedS: 1, difficulty: "hard" }));
  await expect(page.getByTestId("cash-cup-prize")).toHaveText("+6");
  expect((await save(page)).coins).toBe(5 + 6);
  await page.getByTestId("cash-cup-done").click();
  await expect(page.getByTestId("cash-cup-history")).toContainText("20th of 55");
  // 11 left: enough for one more; at 5 it isn't.
});

test("Cash Cup: a win gets the champion's celebration, then the prize", async ({ page }) => {
  test.setTimeout(120_000);
  await guest(page, 10);
  await toLobby(page);
  await page.getByTestId("cash-cup-enter").click();
  await expect(page.getByTestId("cash-cup-match")).toBeVisible({ timeout: 20_000 });
  // Pretend the cup has been running for five minutes, long enough to win it.
  await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem("zx-season-s1")!);
    g.cupOpen.at -= 300_000;
    localStorage.setItem("zx-season-s1", JSON.stringify(g));
  });
  await page.evaluate(() => (window as unknown as { __cashCup: { finish: (s: object) => void } }).__cashCup.finish({ kills: 6, placement: 1, players: 55, damage: 1400, chests: 5, survivedS: 290, difficulty: "hard" }));
  const victory = page.getByTestId("cash-cup-victory");
  await expect(victory.getByRole("heading", { name: "Champion" })).toBeVisible();
  await expect(victory).toContainText("Last one standing of 55 · 6 eliminations");
  // 250 for the win + 6 × 3.
  await expect(page.getByTestId("cash-cup-collect")).toHaveText("Collect 268 ZX Cash");
  await page.getByTestId("cash-cup-collect").click();
  await expect(page.getByTestId("cash-cup-prize")).toHaveText("+268");
  expect((await save(page)).coins).toBe(268);
});

test("Cash Cup: the battle pass gives two free entries, then it's 10 a go", async ({ page }) => {
  test.setTimeout(120_000);
  await guest(page, 5, true);
  await toLobby(page);
  await expect(page.getByTestId("cash-cup-enter")).toHaveText("Enter free · 2 left");
  for (const left of [1, 0]) {
    await page.getByTestId("cash-cup-enter").click();
    await expect(page.getByTestId("cash-cup-ticket")).toContainText("Battle pass free entry");
    await expect(page.getByTestId("cash-cup-match")).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => (window as unknown as { __cashCup: { finish: (s: object) => void } }).__cashCup.finish({ kills: 0, placement: 30, players: 55, damage: 0, chests: 0, survivedS: 1, difficulty: "hard" }));
    await page.getByTestId("cash-cup-done").click();
    expect((await save(page)).cupFree).toBe(2 - left);
  }
  expect((await save(page)).coins).toBe(5);
  // Out of free entries, and 5 ZX Cash isn't enough.
  await expect(page.getByTestId("cash-cup-enter")).toHaveText("Enter · 10 ZX Cash");
  await expect(page.getByTestId("cash-cup-enter")).toBeDisabled();
  await expect(page.getByText("You need 5 more ZX Cash.")).toBeVisible();
});
