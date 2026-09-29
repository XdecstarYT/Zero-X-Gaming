import { expect, test } from "@playwright/test";

const BOARD = [
  { rank: 1, user_id: "u1", username: "NeonVandal", avatar_url: null, xp: 5000, score: 4200 },
  { rank: 2, user_id: "u2", username: "PixelHex", avatar_url: null, xp: 900, score: 3100 },
];

test("home renders hero, featured game and sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Play. Compete.");
  await expect(page.getByRole("heading", { name: "Zero Dash", level: 2 })).toBeVisible();
  for (const name of ["Continue playing", "Trending", "New releases", "Climb the ranks"]) {
    await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
  }
  await expect(page.getByText("Nothing here yet")).toBeVisible();
});

test("library filters by search and category and syncs the URL", async ({ page }) => {
  await page.goto("/games");
  await expect(page.getByText("4 games")).toBeVisible();
  await page.getByLabel("Search games").fill("gravity");
  await expect(page.getByText("1 game", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/q=gravity/);
  await page.getByLabel("Search games").fill("");
  await page.getByRole("button", { name: "Puzzle" }).click();
  await expect(page.getByRole("heading", { name: "Grid Lock" })).toBeVisible();
  await expect(page).toHaveURL(/category=puzzle/);
  await page.getByLabel("Search games").fill("nothing-matches");
  await expect(page.getByText("No games match")).toBeVisible();
});

test("favorites persist across pages", async ({ page }) => {
  await page.goto("/games/orbit");
  await expect(page.getByRole("heading", { level: 1, name: "Orbit" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Weekly" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Add Orbit to favorites" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added Orbit to favorites" })).toBeVisible();

  await page.goto("/profile");
  await expect(
    page.getByRole("list", { name: "Favorite games" }).getByRole("heading", { name: "Orbit" }),
  ).toBeVisible();
});

test("Zero Dash: play, pause, resume, game over, then shows in continue playing", async ({ page }) => {
  await page.goto("/games/zero-dash");
  const stage = page.getByTestId("game-stage");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(stage).toHaveAttribute("data-phase", "playing");
  await expect(stage.locator("canvas")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(stage).toHaveAttribute("data-phase", "paused");
  await expect(stage.getByText("Paused")).toBeVisible();
  await stage.getByRole("button", { name: "Resume" }).click();
  await expect(stage).toHaveAttribute("data-phase", "playing");

  // Never jumping: the first obstacle ends the run.
  await expect(stage).toHaveAttribute("data-phase", "over", { timeout: 20_000 });
  await expect(stage.getByText("Game over")).toBeVisible();
  await expect(stage.getByRole("button", { name: "Play again" })).toBeVisible();

  await page.goto("/");
  const recent = page.getByRole("list", { name: "Recently played games" });
  await expect(recent.getByRole("heading", { name: "Zero Dash" })).toBeVisible();
});

test("unreleased games show coming soon instead of a play button", async ({ page }) => {
  await page.goto("/games/grid-lock");
  await expect(page.getByTestId("game-stage").getByText("Coming soon")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toHaveCount(0);
});

test("unknown game shows 404", async ({ page }) => {
  const res = await page.goto("/games/does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Game over" })).toBeVisible();
});

test("sign-in modal opens, validates, switches mode and closes with Escape", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Sign in" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Sign in" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Continue with Google" })).toBeEnabled();

  await dialog.getByLabel("Email").fill("not-an-email");
  await dialog.getByLabel("Password").fill("12345678");
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Enter a valid email address.");

  await dialog.getByRole("button", { name: "Create an account" }).click();
  const signUp = page.getByRole("dialog", { name: "Join Zero X" });
  await expect(signUp.getByLabel(/Username/)).toBeVisible();
  await signUp.getByLabel("Email").fill("player@zerox.gg");
  await signUp.getByLabel(/Username/).fill("no spaces");
  await signUp.getByRole("button", { name: "Create account" }).click();
  await expect(signUp.getByRole("alert")).toHaveText("Use only letters, numbers, and underscores.");

  await page.keyboard.press("Escape");
  await expect(signUp).toBeHidden();
});

test("auth callback without a code lands on a friendly error page", async ({ page }) => {
  await page.goto("/auth/callback?next=//evil.com");
  await expect(page).toHaveURL(/\/auth\/error\?reason=missing/);
  await expect(page.getByRole("heading", { name: "Couldn't sign you in" })).toBeVisible();
});

test("reduce motion setting persists and applies to <html>", async ({ page }) => {
  await page.goto("/settings");
  const sw = page.getByRole("switch", { name: "Reduce motion" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "true");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Reduce motion" })).toHaveAttribute("aria-checked", "true");
});

test("no horizontal overflow", async ({ page }) => {
  for (const path of ["/", "/games", "/games/zero-dash", "/leaderboards", "/profile", "/settings"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("leaderboards render live data from the API", async ({ page }) => {
  await page.route("**/rest/v1/rpc/get_leaderboard*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(BOARD) }),
  );
  await page.goto("/leaderboards");
  const global = page.getByRole("region", { name: "Global (XP)" });
  await expect(global.getByRole("cell", { name: /NeonVandal/ })).toBeVisible();
  await expect(global.getByRole("columnheader", { name: "XP" })).toBeVisible();
  await expect(global.getByText("4,200")).toBeVisible();
});

test("leaderboards show an error with retry when the API fails, and empty states", async ({ page }) => {
  let calls = 0;
  await page.route("**/rest/v1/rpc/get_leaderboard*", (route) => {
    calls += 1;
    return calls === 1
      ? route.fulfill({ status: 500, body: "{}" })
      : route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto("/games/zero-dash");
  const aside = page.getByRole("complementary");
  await expect(aside.getByText("Couldn't load the leaderboard.")).toBeVisible();
  await aside.getByRole("button", { name: "Retry" }).click();
  await expect(aside.getByText("Be the first to put a score on the board.")).toBeVisible();
});
