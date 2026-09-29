import { expect, test } from "./fixtures";

test("Neon Siege solo: menu, deploy vs bots, pause/resume, and the run ends", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/games/neon-siege");
  const stage = page.getByTestId("game-stage");
  await page.getByRole("button", { name: "Play", exact: true }).click();

  await expect(stage.getByText("Neon Siege")).toBeVisible();
  await stage.getByRole("button", { name: "Hard" }).click();
  await expect(stage.getByRole("button", { name: "Hard" })).toHaveAttribute("aria-pressed", "true");
  await stage.getByRole("button", { name: "Deploy vs bots" }).click();
  await expect(stage.locator("canvas")).toBeVisible();
  await expect(stage.getByRole("button", { name: "Deploy vs bots" })).toBeHidden();

  // Keyboard-only controls work without pointer lock.
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(300);
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.press("KeyR");

  await page.keyboard.press("KeyP");
  await expect(stage).toHaveAttribute("data-phase", "paused");
  await stage.getByRole("button", { name: "Resume" }).click();
  await expect(stage).toHaveAttribute("data-phase", "playing");

  // Standing still on Hard, the drones find and eliminate us.
  await expect(stage).toHaveAttribute("data-phase", "over", { timeout: 70_000 });
  await expect(stage.getByText("Game over")).toBeVisible();
  expect(errors).toEqual([]);
});
