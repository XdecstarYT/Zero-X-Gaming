import { dismissRotate, expect, test } from "./fixtures";

test.use({ viewport: { width: 900, height: 506 } });

type Hooks = { __cricket: { phase: string; cur: number; humanRuns: number; innings: { runs: number }[] }; __cricketAdvance: (s: number) => void };

/** Boundary Blitz with the Sports+ pass: a 2-over T20, bat first, then fast-forward through the chase. */
test("Boundary Blitz: bat a T20, chase and see the result", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 10, hasPass: false, purchases: ["unlock:sports-plus"], challenges: {} }));
    localStorage.setItem("zx-cricket-prefs", JSON.stringify({ gfx: "low" }));
  });
  await page.goto("/games/boundary-blitz?cricket=test");
  const stage = page.getByTestId("game-stage");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(stage.getByText("T20 cricket · Under lights · Every ball counts")).toBeVisible();
  await stage.getByRole("group", { name: "Mode" }).getByRole("button", { name: /T20 match/ }).click();
  await stage.getByRole("group", { name: "Overs" }).getByRole("button", { name: /2 overs/ }).click();
  await stage.getByRole("group", { name: "Toss" }).getByRole("button", { name: /Bat first/ }).click();
  await stage.getByTestId("cricket-start").click();

  const bug = stage.getByTestId("cricket-score");
  await expect(bug).toContainText("ZXL", { timeout: 60_000 });
  await page.waitForFunction(() => "__cricketAdvance" in window);
  // Face a ball yourself: play a shot as it arrives.
  await page.waitForFunction(() => (window as unknown as Hooks).__cricket.phase === "delivery", null, { timeout: 30_000 });
  await page.keyboard.press("Space");
  await page.waitForFunction(() => ["live", "dead", "plan"].includes((window as unknown as Hooks).__cricket.phase), null, { timeout: 15_000 });

  // Fast-forward to the innings break.
  for (let i = 0; i < 40; i++) {
    const phase = await page.evaluate(() => {
      const w = window as unknown as Hooks;
      w.__cricketAdvance(20);
      return w.__cricket.phase;
    });
    if (phase === "break") break;
  }
  const next = stage.getByTestId("cricket-continue");
  await expect(next).toBeVisible();
  await expect(stage.getByText("Innings break")).toBeVisible();
  await next.click();
  await expect(next).toBeHidden();
  await expect(bug).toContainText(/Need \d+ off \d+/);
  // Bowling: the controls are up.
  await expect(stage.getByTestId("cricket-bowl-panel")).toBeVisible();
  await stage.getByTestId("cricket-kind-yorker").or(stage.getByTestId("cricket-kind-legbreak")).or(stage.getByTestId("cricket-kind-offbreak")).first().click();
  for (let i = 0; i < 60; i++) {
    const phase = await page.evaluate(() => {
      const w = window as unknown as Hooks;
      w.__cricketAdvance(20);
      return w.__cricket.phase;
    });
    if (phase === "done") break;
  }
  const results = stage.getByTestId("cricket-results");
  await expect(results).toBeVisible({ timeout: 30_000 });
  await expect(results).toContainText(/won by|tied/);
  await expect(results).toContainText("Match score");
  await results.getByRole("button", { name: "Continue" }).click();
  expect(errors).toEqual([]);
});
