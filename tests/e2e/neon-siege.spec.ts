import { dismissRotate, expect, test } from "./fixtures";

test("Neon Siege battle royale: drop in, loot keys, pause/resume, the storm closes and the match ends", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // ?siege=quick runs the storm 12× faster (and makes the match unranked) so the test ends quickly.
  await page.goto("/games/neon-siege?siege=quick");
  const stage = page.getByTestId("game-stage");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);

  await expect(stage.getByText("Season 1 · Ground Zero")).toBeVisible();
  // Easy bots rarely find us in the first seconds, so the pause check can't race an early elimination;
  // the (quick) storm still ends the match.
  await stage.getByRole("button", { name: "Easy" }).click();
  await expect(stage.getByRole("button", { name: "Easy" })).toHaveAttribute("aria-pressed", "true");
  // Classic 2D keeps the test fast on software-rendered CI browsers; 3D is covered below.
  await stage.getByRole("button", { name: "Classic 2D" }).click();
  await stage.getByRole("button", { name: "Drop in" }).click();
  await expect(stage.locator("canvas").first()).toBeVisible();
  await expect(stage.getByRole("button", { name: "Drop in" })).toBeHidden();

  const hud = stage.getByTestId("siege-hud");
  await expect(hud).toContainText(/\d+ ALIVE/, { timeout: 10_000 });
  await expect(hud).toContainText("Service Pistol");

  // Keyboard-only controls work without pointer lock.
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(300);
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.press("KeyE");
  await page.keyboard.press("Digit2");
  await page.keyboard.press("Digit1");
  await page.keyboard.press("KeyR");

  await page.keyboard.press("KeyP");
  await expect(stage).toHaveAttribute("data-phase", "paused");
  await stage.getByRole("button", { name: "Resume" }).click();
  await expect(stage).toHaveAttribute("data-phase", "playing");

  // Standing still, the storm (or the bots) end the match.
  await expect(stage).toHaveAttribute("data-phase", "over", { timeout: 90_000 });
  expect(errors).toEqual([]);
});

test("Neon Siege 3D view starts and shows the HUD", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/games/neon-siege");
  const stage = page.getByTestId("game-stage");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await stage.getByRole("button", { name: "Low" }).click();
  await stage.getByRole("button", { name: "Drop in" }).click();
  // Software WebGL in CI is slow to build the town; real GPUs take a fraction of this.
  await expect(stage.locator("canvas").first()).toBeVisible({ timeout: 45_000 });
  await expect(stage.getByTestId("siege-hud")).toContainText("ALIVE", { timeout: 20_000 });
  await expect(stage.locator(`[aria-label="Slot 1: Service Pistol"]`)).toBeVisible();
  expect(errors).toEqual([]);
});
