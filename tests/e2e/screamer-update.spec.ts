import { dismissRotate, expect, test } from "./fixtures";

const PASS = JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 10, hasPass: false, purchases: ["unlock:sports-plus"], challenges: {} });

/** The women's premiership: the hub, the league medal count and the leading goalkicker. */
test("Screamer: a women's premiership with the medal count", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((pass) => {
    localStorage.setItem("zx-season-s1", pass);
    localStorage.setItem("zx-footy-prefs", JSON.stringify({ gfx: "low", minutes: 2, mode: "season" }));
  }, PASS);
  await page.goto("/games/aussie-rules?footy=quick");
  const stage = page.getByTestId("game-stage");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await stage.getByRole("group", { name: "Competition" }).getByRole("button", { name: /Women's/ }).click();
  await stage.getByRole("group", { name: "Season length" }).getByRole("button", { name: /Short/ }).click();
  await stage.getByTestId("footy-start").click();
  await expect(stage.getByText(/Women's National League/)).toBeVisible();
  await stage.getByTestId("tab-awards").click();
  const awards = stage.getByTestId("footy-awards");
  await expect(awards).toContainText("League Medal");
  await stage.getByTestId("footy-sim").click();
  await stage.getByTestId("tab-awards").click();
  await expect(awards).toContainText(/1\. .+ · \d+ votes/);
  await expect(awards).toContainText(/1\. .+ · \d+ goals/);
  expect(errors).toEqual([]);
});

/** The goalkicking challenge: ten set shots, then the card. */
test("Screamer: the goalkicking challenge", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((pass) => {
    localStorage.setItem("zx-season-s1", pass);
    localStorage.setItem("zx-footy-prefs", JSON.stringify({ gfx: "low", mode: "kicking" }));
  }, PASS);
  await page.goto("/games/aussie-rules?footy=test");
  const stage = page.getByTestId("game-stage");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(stage.getByText("Goalkicking challenge").first()).toBeVisible();
  await stage.getByTestId("footy-start").click();
  await expect(stage.getByTestId("footy-score")).toContainText("Goalkicking challenge", { timeout: 60_000 });
  await expect(stage.getByTestId("footy-setshot")).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => "__footyAdvance" in window);
  for (let i = 0; i < 30; i++) {
    const over = await page.evaluate(() => {
      const w = window as unknown as { __footyAdvance: (s: number) => void; __footy: { phase: string } };
      w.__footyAdvance(10);
      return w.__footy.phase === "over";
    });
    if (over) break;
  }
  const results = stage.getByTestId("footy-results");
  await expect(results).toBeVisible({ timeout: 60_000 });
  await expect(results).toContainText("Goalkicking challenge");
  await expect(results.locator("li")).toHaveCount(10);
  await results.getByRole("button", { name: "Continue" }).click();
  expect(errors).toEqual([]);
});
