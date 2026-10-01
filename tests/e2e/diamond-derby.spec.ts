import { dismissRotate, expect, test } from "./fixtures";

test.use({ viewport: { width: 900, height: 506 } });

/** Diamond Derby with the Sports+ pass: menu, the box, a swing, then fast-forward to the end. */
test("Diamond Derby: step in, swing, and play the derby out", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 10, hasPass: false, purchases: ["unlock:sports-plus"], challenges: {} }));
    localStorage.setItem("zx-derby-prefs", JSON.stringify({ gfx: "low" }));
  });
  await page.goto("/games/diamond-derby?derby=test");
  const stage = page.getByTestId("game-stage");
  await expect(stage.getByTestId("sports-lock")).toHaveCount(0);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(stage.getByText("Home run derby · Three rounds · Under the lights")).toBeVisible();
  await stage.getByRole("group", { name: "Difficulty" }).getByRole("button", { name: /Rookie/ }).click();
  await stage.getByTestId("derby-start").click();

  const bug = stage.getByTestId("derby-score");
  await expect(bug).toContainText("Quarterfinal", { timeout: 60_000 });
  await expect(bug).toContainText("OUTS");

  // Fast-forward with the AI hitting until the derby is decided.
  await page.waitForFunction(() => "__derbyAdvance" in window);
  for (let i = 0; i < 20; i++) {
    const over = await page.evaluate(() => {
      const w = window as unknown as { __derbyAdvance: (s: number) => void; __derby: { phase: string } };
      w.__derbyAdvance(45);
      return w.__derby.phase === "over";
    });
    if (over) break;
  }
  const results = stage.getByTestId("derby-results");
  await expect(results).toBeVisible({ timeout: 60_000 });
  await expect(results).toContainText("Derby score");
  await results.getByRole("button", { name: "Continue" }).click();
  expect(errors).toEqual([]);
});
