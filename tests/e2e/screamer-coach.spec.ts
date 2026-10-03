import type { Page } from "@playwright/test";
import { newCoach, simCoachGame } from "../../src/games/aussie-rules/coach";
import { nextGame, recordResult, startSeason } from "../../src/games/aussie-rules/season";
import { dismissRotate, expect, test } from "./fixtures";

test.use({ viewport: { width: 900, height: 506 } });

const PASS = JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 10, hasPass: false, purchases: ["unlock:sports-plus"], challenges: {} });

async function open(page: Page, prefs: object, extra: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([pass, p, x]) => {
      localStorage.setItem("zx-season-s1", pass);
      localStorage.setItem("zx-footy-prefs", JSON.stringify(p));
      for (const [k, v] of Object.entries(x)) localStorage.setItem(k, JSON.stringify(v));
    },
    [PASS, { gfx: "low", minutes: 2, ...prefs }, extra] as const,
  );
  await page.goto("/games/aussie-rules?footy=quick");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
}

/** Coach career: take a job, coach a game from the box, sim the year, trade, draft. */
test("Screamer: a coaching career from the box", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, { mode: "coach", rounds: 9 });
  const stage = page.getByTestId("game-stage");
  await stage.getByLabel("Coach name").fill("Kim Hart");
  await stage.getByTestId("coach-start").click();
  const hub = stage.getByTestId("coach-hub");
  await expect(hub).toContainText("Kim Hart");
  await expect(stage.getByTestId("coach-board")).toContainText("The board:");
  // Drop a player and auto-pick back to eighteen.
  await expect(hub).toContainText("18/18 picked");
  await hub.locator('[data-testid^="coach-player-"][aria-pressed="true"]').first().click();
  await expect(hub).toContainText("17/18 picked");
  await hub.getByRole("button", { name: "Auto-pick" }).click();
  await expect(hub).toContainText("18/18 picked");
  // Round 1 from the coaches' box.
  await stage.getByTestId("coach-play").click();
  const box = stage.getByTestId("coach-match");
  await box.getByTestId("coach-next-q").click();
  await expect(box.getByTestId("coach-next-q")).toBeVisible({ timeout: 20_000 });
  await box.getByTestId("coach-speech-fire").click();
  await box.getByTestId("coach-sim-rest").click();
  await expect(box.getByTestId("coach-feed")).toContainText("Full time");
  await box.getByTestId("coach-done").click();
  await expect(hub).toContainText("Round 1:");
  // The rest of the year.
  await hub.getByRole("button", { name: "Sim the season" }).click();
  const ceremony = stage.getByTestId("footy-ceremony-done");
  if (await ceremony.isVisible().catch(() => false)) await ceremony.click();
  const trades = stage.getByTestId("coach-trades");
  const jobs = stage.locator('[data-testid^="coach-job-"]');
  await expect(trades.or(jobs.first())).toBeVisible();
  if (await trades.isVisible()) {
    await trades.click();
    await stage.getByTestId("coach-draft").click();
    await stage.locator('[data-testid^="coach-pick-"]').first().click();
    await stage.locator('[data-testid^="coach-pick-"]').first().click();
    await stage.getByTestId("coach-draft-done").click();
    const stayBtn = stage.getByRole("button", { name: /^Stay at/ });
    if (await stayBtn.isVisible().catch(() => false)) await stayBtn.click();
  } else await jobs.first().click();
  await expect(stage.getByTestId("coach-play")).toBeVisible();
  await expect(hub).toContainText("2028");
  expect(errors).toEqual([]);
});

/** The premiership: the tabs, and the Grand Final played in 3D, build-up to presentation. */
test("Screamer: Grand Final day in the premiership", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // A season where we've won everything up to Grand Final day.
  const s = startSeason({ league: "national", club: "geelong", seed: 17, rounds: 9, year: 2027, momentum: true });
  while (nextGame(s) && nextGame(s)!.label !== "Grand Final") recordResult(s, 140, 50);
  await open(page, { mode: "season" }, { "zx-footy-season2": s });
  const stage = page.getByTestId("game-stage");
  await expect(stage.getByTestId("footy-gf-week")).toContainText("Grand Final week");
  await stage.getByTestId("tab-round").click();
  await expect(stage.getByTestId("footy-round")).toContainText("Round 9");
  await stage.getByTestId("tab-finals").click();
  await expect(stage.getByTestId("footy-bracket")).toContainText("Preliminary final");
  await stage.getByTestId("tab-ladder").click();
  await stage.getByTestId("footy-start").click();
  await page.waitForFunction(() => "__footyAdvance" in window);
  // Play it out (the build-up rolls first; the autopilot plays both sides).
  for (let i = 0; i < 40; i++) {
    const over = await page.evaluate(() => {
      const w = window as unknown as { __footyAdvance: (s: number) => void; __footy: { phase: string } };
      w.__footyAdvance(5);
      return w.__footy.phase === "over";
    });
    if (over) break;
  }
  const ceremony = stage.getByTestId("footy-ceremony");
  const results = stage.getByTestId("footy-results");
  await expect(ceremony.or(results)).toBeVisible({ timeout: 60_000 });
  if (await ceremony.isVisible()) {
    await expect(ceremony).toContainText("2027 Grand Final");
    await expect(stage.getByTestId("footy-gf-medal")).toContainText("Grand Final Medal");
    await stage.getByTestId("footy-ceremony-done").click();
  }
  await expect(results).toBeVisible();
  await results.getByRole("button", { name: "Continue" }).click();
  // Test games aren't saved, so back at the hub the Grand Final's still to come: sim it this time.
  await stage.getByRole("button", { name: "Play again" }).click();
  await stage.getByTestId("footy-sim").click();
  if (await stage.getByTestId("footy-ceremony").isVisible().catch(() => false)) await stage.getByTestId("footy-ceremony-done").click();
  // The season's done: awards night and next year.
  await stage.getByTestId("tab-awards").click();
  await stage.getByTestId("footy-count").click();
  await expect(stage.getByTestId("footy-awards")).toContainText("The count");
  await stage.getByTestId("tab-honours").click();
  await stage.getByTestId("footy-next-season").click();
  await stage.getByTestId("tab-honours").click();
  await expect(stage.getByTestId("footy-honours")).toContainText("2027");
  expect(errors).toEqual([]);
});

/** Coach a Grand Final from the box: the build-up, then the cup. */
test("Screamer: coaching a Grand Final", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const c = newCoach({ name: "Kim Hart", club: "sydney", seed: 31, rounds: 9 });
  for (const p of c.squad) p.rating = 95;
  c.security = 100;
  while (c.stage === "season" && nextGame(c.season) && nextGame(c.season)!.label !== "Grand Final") simCoachGame(c);
  test.skip(nextGame(c.season)?.label !== "Grand Final", "this seed missed the Grand Final");
  await open(page, { mode: "coach" }, { "zx-footy-coach": c });
  const stage = page.getByTestId("game-stage");
  await expect(stage.getByTestId("footy-gf-week")).toBeVisible();
  await stage.getByTestId("coach-play").click();
  const box = stage.getByTestId("coach-match");
  await expect(box.getByTestId("coach-feed")).toContainText("parade");
  await box.getByTestId("coach-sim-rest").click({ timeout: 20_000 });
  await box.getByTestId("coach-done").click();
  const done = stage.getByTestId("footy-ceremony-done");
  if (await stage.getByTestId("footy-ceremony").isVisible().catch(() => false)) {
    await expect(stage.getByTestId("footy-ceremony")).toContainText(/PREMIERS!|Runners-up/);
    await done.click();
  }
  await expect(stage.getByTestId("coach-hub")).toContainText(/in review|Grand Final/);
  expect(errors).toEqual([]);
});
