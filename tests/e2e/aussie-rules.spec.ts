import { dismissRotate, expect, test } from "./fixtures";

test.use({ viewport: { width: 900, height: 506 } });

/**
 * Sports+ end to end: the game is locked until you unlock Sports+ (50 coins),
 * then a quick test match: menu, bounce, score bug, full time, results.
 */
test("Screamer: unlock Sports+ for 50 coins, then play a match to full time", async ({ page }) => {
  test.setTimeout(360_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    // A guest with 60 coins and no Sports+ pass; low graphics for the software renderer.
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 60, hasPass: false, purchases: [], challenges: {} }));
    localStorage.setItem("zx-footy-prefs", JSON.stringify({ gfx: "low", minutes: 2 }));
  });
  await page.goto("/games/aussie-rules?footy=quick");
  const stage = page.getByTestId("game-stage");
  await expect(stage.getByTestId("sports-lock")).toBeVisible();
  await expect(stage.getByRole("button", { name: "Play", exact: true })).toHaveCount(0);
  await stage.getByRole("button", { name: "Unlock for 50 coins" }).click();
  await expect(stage.getByTestId("sports-lock")).toHaveCount(0);

  // The pass is remembered (10 coins left).
  await page.reload();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(stage.getByText("Aussie Rules · 18 a side · Four quarters")).toBeVisible();
  await stage.getByRole("group", { name: "Opponent" }).getByRole("button", { name: /Ironbark Rams/ }).click();
  await stage.getByTestId("footy-start").click();

  const bug = stage.getByTestId("footy-score");
  await expect(bug).toContainText("HAR", { timeout: 60_000 });
  await expect(bug).toContainText("IRO");
  await expect(bug).toContainText("Q1");

  // Fast-forward the quick match (20 s quarters, the AI playing your side) to the final siren.
  await page.waitForFunction(() => "__footyAdvance" in window);
  for (let i = 0; i < 12; i++) {
    const over = await page.evaluate(() => {
      const w = window as unknown as { __footyAdvance: (s: number) => void; __footy: { phase: string } };
      w.__footyAdvance(20);
      return w.__footy.phase === "over";
    });
    if (over) break;
  }
  const results = stage.getByTestId("footy-results");
  await expect(results).toBeVisible({ timeout: 60_000 });
  await expect(results).toContainText("Full time");
  await expect(results).toContainText("Match score");
  await results.getByRole("button", { name: "Continue" }).click();
  await expect(stage).toHaveAttribute("data-phase", "over");
  expect(errors).toEqual([]);
});
