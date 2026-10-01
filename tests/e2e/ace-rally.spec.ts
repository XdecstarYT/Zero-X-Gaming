import { dismissRotate, expect, test } from "./fixtures";

test.use({ viewport: { width: 900, height: 506 } });

/** Ace Rally with the Sports+ pass: pick a draw, walk out, and fast-forward a match tiebreak to the end. */
test("Ace Rally: walk out on court and play a match tiebreak out", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 10, hasPass: false, purchases: ["unlock:sports-plus"], challenges: {} }));
    localStorage.setItem("zx-tennis-prefs", JSON.stringify({ gfx: "low", umpire: false }));
  });
  await page.goto("/games/ace-rally?tennis=test");
  const stage = page.getByTestId("game-stage");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(stage.getByText("Singles · Centre Court · The Zero X Open")).toBeVisible();
  await stage.getByRole("group", { name: "Draw" }).getByRole("button", { name: /Women's singles/ }).click();
  await stage.getByRole("group", { name: "Opponent" }).getByRole("button", { name: /Rin Tanaka/ }).click();
  await stage.getByRole("group", { name: "Surface" }).getByRole("button", { name: /Grass/ }).click();
  await stage.getByTestId("tennis-start").click();

  const bug = stage.getByTestId("tennis-score");
  await expect(bug).toContainText("Rin Tanaka", { timeout: 60_000 });

  await page.waitForFunction(() => "__tennisAdvance" in window);
  for (let i = 0; i < 30; i++) {
    const over = await page.evaluate(() => {
      const w = window as unknown as { __tennisAdvance: (s: number) => void; __tennis: { phase: string } };
      w.__tennisAdvance(40);
      return w.__tennis.phase === "over";
    });
    if (over) break;
  }
  const results = stage.getByTestId("tennis-results");
  await expect(results).toBeVisible({ timeout: 60_000 });
  await expect(results).toContainText("Match score");
  await expect(results).toContainText("Aces");
  await results.getByRole("button", { name: "Continue" }).click();
  expect(errors).toEqual([]);
});
