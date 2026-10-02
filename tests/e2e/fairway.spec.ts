import { dismissRotate, expect, test } from "./fixtures";

test.use({ viewport: { width: 900, height: 506 } });

/** Fairway with the Sports+ pass: menu, the first tee, a real three-press swing, then the autopilot plays the round out. */
test("Fairway: tee off, swing on the meter, and finish the round", async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 10, hasPass: false, purchases: ["unlock:sports-plus"], challenges: {} }));
    localStorage.setItem("zx-fairway-prefs", JSON.stringify({ gfx: "low" }));
  });
  await page.goto("/games/fairway?fairway=test");
  const stage = page.getByTestId("game-stage");
  await expect(stage.getByTestId("sports-lock")).toHaveCount(0);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(stage.getByText("Links and parkland golf · Stroke play · Closest to the pin")).toBeVisible();
  await stage.getByRole("group", { name: "Holes" }).getByRole("button", { name: /3 holes/ }).click();
  await stage.getByRole("group", { name: "Course" }).getByRole("button", { name: /Ironbark Hills/ }).click();
  await stage.getByTestId("golf-start").click();

  const bug = stage.getByTestId("golf-hole");
  await expect(bug).toContainText("Hole 1 · Par 4", { timeout: 90_000 });
  await expect(stage.getByTestId("golf-club")).toContainText("Driver");

  // A real swing: three presses on the meter.
  await page.waitForFunction(() => "__golf" in window);
  const meter = () => page.evaluate(() => (window as unknown as { __golf: { meter: { stage: number; value: number } } }).__golf.meter);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await meter()).value, { timeout: 30_000 }).toBeGreaterThan(0.6);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await meter()).stage).toBe(2);
  await expect.poll(async () => (await meter()).value, { timeout: 30_000 }).toBeLessThan(0.15);
  await page.keyboard.press("Space");
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __golf: { strokes: number } }).__golf.strokes), { timeout: 30_000 })
    .toBe(1);

  // The autopilot plays out the rest.
  for (let i = 0; i < 40; i++) {
    const over = await page.evaluate(() => {
      const w = window as unknown as { __golfAdvance: (s: number) => void; __golf: { phase: string } };
      w.__golfAdvance(20);
      return w.__golf.phase === "over";
    });
    if (over) break;
  }
  const results = stage.getByTestId("golf-results");
  await expect(results).toBeVisible({ timeout: 60_000 });
  await expect(results).toContainText("Ironbark Hills · 3 holes");
  await expect(results).toContainText("To par");
  await results.getByRole("button", { name: "Continue" }).click();
  expect(errors).toEqual([]);
});
