import { expect, test } from "@playwright/test";

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

test("opening a game adds it to continue playing, favorites persist", async ({ page }) => {
  await page.goto("/games/orbit");
  await expect(page.getByRole("heading", { level: 1, name: "Orbit" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Weekly" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Add Orbit to favorites" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added Orbit to favorites" })).toBeVisible();

  await page.goto("/");
  const recent = page.getByRole("list", { name: "Recently played games" });
  await expect(recent.getByRole("heading", { name: "Orbit" })).toBeVisible();

  await page.goto("/profile");
  await expect(
    page.getByRole("list", { name: "Favorite games" }).getByRole("heading", { name: "Orbit" }),
  ).toBeVisible();
});

test("unknown game shows 404", async ({ page }) => {
  const res = await page.goto("/games/does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Game over" })).toBeVisible();
});

test("sign-in modal opens and closes with Escape", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Sign in" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Join Zero X" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
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
