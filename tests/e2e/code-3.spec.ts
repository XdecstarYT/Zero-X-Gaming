import { dismissRotate, expect, test } from "./fixtures";

// Software-rendered CI browsers are slow at full HD; a smaller canvas keeps the shift moving.
test.use({ viewport: { width: 900, height: 506 } });

/**
 * Code 3 end to end: menu, start a quick test shift, lights and siren,
 * out of the unit, answer dispatch, and the shift report at the end.
 */
test("Code 3: start a shift, run lights and siren, get out, answer dispatch, finish the shift", async ({ page }) => {
  test.setTimeout(360_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("zx-code3-gfx", "low"));
  await page.goto("/games/code-3?code3=quick");
  const stage = page.getByTestId("game-stage");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);

  await expect(stage.getByText("Bayview Police Department · Patrol")).toBeVisible();
  await expect(stage.getByText("Cadet")).toBeVisible();
  // Faster units are locked until you rank up.
  await expect(stage.getByRole("group", { name: "Unit" }).getByRole("button", { name: /Interceptor SUV/ })).toBeDisabled();
  await stage.getByRole("button", { name: "Start shift" }).click();

  const hud = stage.getByTestId("code3-hud");
  await expect(hud).toContainText("IN UNIT", { timeout: 60_000 });
  await expect(hud).toContainText("LIGHTS OFF");
  await page.keyboard.press("q");
  await expect(hud).toContainText("· LIGHTS", { timeout: 20_000 });
  await page.keyboard.press("q");
  await expect(hud).toContainText("SIREN", { timeout: 20_000 });
  await page.keyboard.press("e");
  await expect(hud).toContainText("ON FOOT", { timeout: 20_000 });

  // Dispatch offers a call (the quick shift starts one after a few seconds); take it.
  await expect(hud).toContainText("OFFER:", { timeout: 90_000 });
  await page.keyboard.press("y");
  await expect(hud).toContainText("CALL:", { timeout: 20_000 });

  // The quick shift (60 s, sped up once a call is taken) ends with the shift report, then the platform's game-over screen.
  const results = stage.getByTestId("code3-results");
  await expect(results).toBeVisible({ timeout: 280_000 });
  await expect(results).toContainText("End of shift");
  await expect(results).toContainText("Career:");
  await results.getByRole("button", { name: "Continue" }).click();
  await expect(stage.getByText("Game over")).toBeVisible();
  await stage.getByRole("button", { name: "Play again" }).click();
  await expect(stage.getByRole("button", { name: "Start shift" })).toBeVisible();
  expect(errors).toEqual([]);
});
