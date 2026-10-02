import { dismissRotate, expect, test } from "./fixtures";

test.use({ viewport: { width: 900, height: 506 } });

type Hooks = { __cricket: { phase: string }; __cricketAdvance: (s: number) => void };

/** The Blitz League: start a season, sim a round, play the next game (with the scorecard), and see the table move. */
test("Boundary Blitz league: start a season, sim, play and check the table", async ({ page }) => {
  test.setTimeout(360_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.addInitScript(() => {
    localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 10, hasPass: false, purchases: ["unlock:sports-plus"], challenges: {} }));
    localStorage.setItem("zx-cricket-prefs", JSON.stringify({ gfx: "low", overs: 2, mode: "match" }));
  });
  await page.goto("/games/boundary-blitz?cricket=test");
  const stage = page.getByTestId("game-stage");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await stage.getByRole("group", { name: "Mode" }).getByRole("button", { name: /Blitz League/ }).click();
  await stage.getByTestId("cricket-league-new").click();

  const hub = stage.getByTestId("cricket-league");
  await expect(hub).toContainText("Round 1 of 7");
  const tbl = stage.getByTestId("cricket-table");
  await expect(tbl.locator("tr")).toHaveCount(9);
  // Sim round 1.
  await stage.getByTestId("cricket-league-sim").click();
  await expect(hub).toContainText("Round 2 of 7");
  await expect(hub).toContainText("Orange Cap");

  // Play round 2 in the stadium.
  await stage.getByTestId("cricket-start").click();
  await expect(stage.getByTestId("cricket-score")).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => "__cricketAdvance" in window);
  await page.evaluate(() => (window as unknown as Hooks).__cricketAdvance(8));
  // The scorecard overlay.
  await page.keyboard.press("Tab");
  const card = stage.getByTestId("cricket-card");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("cricket-scorecard").first()).toContainText("Batter");
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toHaveCount(0);

  for (let i = 0; i < 60; i++) {
    const phase = await page.evaluate(() => {
      const w = window as unknown as Hooks;
      w.__cricketAdvance(20);
      if (w.__cricket.phase === "break") w.__cricketAdvance(4);
      return w.__cricket.phase;
    });
    if (phase === "done") break;
  }
  const results = stage.getByTestId("cricket-results");
  await expect(results).toBeVisible({ timeout: 60_000 });
  await expect(results).toContainText("Blitz League:");
  await expect(results).toContainText("full scorecard");
  await results.getByRole("button", { name: "Continue" }).click();
  expect(errors).toEqual([]);
});
