import { dismissRotate, expect, test } from "./fixtures";

const BOARD = [
  { rank: 1, user_id: "u1", username: "NeonVandal", avatar_url: null, xp: 5000, score: 4200 },
  { rank: 2, user_id: "u2", username: "PixelHex", avatar_url: null, xp: 900, score: 3100 },
];

test("home renders hero, featured game and sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Play. Compete.");
  await expect(page.getByRole("heading", { name: "Life", level: 2 })).toBeVisible();
  for (const name of ["Continue playing", "Trending", "New releases", "Climb the ranks"]) {
    await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
  }
  await expect(page.getByText("Nothing here yet")).toBeVisible();
});

test("library filters by search and category and syncs the URL", async ({ page }) => {
  await page.goto("/games");
  await expect(page.getByText("9 games")).toBeVisible();
  await page.getByLabel("Search games").fill("conquest");
  await expect(page.getByText("1 game", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/q=conquest/);
  await page.getByLabel("Search games").fill("");
  await page.getByRole("button", { name: "Shooter" }).click();
  await expect(page.getByRole("heading", { name: "Trenches" })).toBeVisible();
  await expect(page).toHaveURL(/category=shooter/);
  await page.getByLabel("Search games").fill("nothing-matches");
  await expect(page.getByText("No games match")).toBeVisible();
});

test("favorites persist across pages", async ({ page }) => {
  await page.goto("/games/trenches");
  await expect(page.getByRole("heading", { level: 1, name: "Trenches" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Weekly" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Add Trenches to favorites" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added Trenches to favorites" })).toBeVisible();

  await page.goto("/profile");
  await expect(
    page.getByRole("list", { name: "Favorite games" }).getByRole("heading", { name: "Trenches" }),
  ).toBeVisible();
});

test("unknown game shows 404", async ({ page }) => {
  const res = await page.goto("/games/does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Game over" })).toBeVisible();
});

test("ZXG account modal: no email, validates, switches mode and closes with Escape", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Sign in to ZXG" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("No email needed")).toBeVisible();
  await expect(dialog.getByLabel(/Email/)).toHaveCount(0);

  await dialog.getByLabel("Account name").fill("no spaces");
  await dialog.getByLabel("Password", { exact: true }).fill("12345678");
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Use only letters, numbers, and underscores.");

  await dialog.getByRole("button", { name: "Create a ZXG account" }).click();
  const signUp = page.getByRole("dialog", { name: "Create a ZXG Account" });
  await signUp.getByLabel("Account name").fill("Trench_Rat");
  await signUp.getByLabel("Password", { exact: true }).fill("12345678");
  await signUp.getByLabel("Confirm password").fill("different1");
  await signUp.getByRole("button", { name: "Create account" }).click();
  await expect(signUp.getByRole("alert")).toHaveText("Passwords don't match.");

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
  for (const path of ["/", "/games", "/games/trenches", "/leaderboards", "/profile", "/settings"]) {
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
  await page.goto("/games/neon-siege");
  const aside = page.getByRole("complementary");
  await expect(aside.getByText("Couldn't load the leaderboard.")).toBeVisible();
  await aside.getByRole("button", { name: "Retry" }).click();
  await expect(aside.getByText("Be the first to put a score on the board.")).toBeVisible();
});

test("phones get a bottom tab bar; desktop gets the top nav", async ({ page, isMobile }) => {
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Primary" });
  if (isMobile) {
    await expect(tabs).toBeVisible();
    for (const name of ["Home", "Games", "Pass", "Ranks", "Profile"])
      await expect(tabs.getByRole("link", { name })).toBeVisible();
    await tabs.getByRole("link", { name: "Games" }).click();
    await expect(page).toHaveURL(/\/games$/);
    await expect(tabs.getByRole("link", { name: "Games" })).toHaveAttribute("aria-current", "page");
    // Tab targets are at least 44px tall.
    const box = await tabs.getByRole("link", { name: "Games" }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  } else {
    await expect(tabs).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Games" })).toBeVisible();
  }
});

test("on phones, playing goes immersive (full screen) and Exit returns to the page", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only behaviour");
  await page.goto("/games/trenches?net=local");
  const stage = page.getByTestId("game-stage");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(stage).toHaveAttribute("data-immersive", "true");
  const box = await stage.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.width).toBeGreaterThanOrEqual(vp.width - 1);
  expect(box!.height).toBeGreaterThanOrEqual(vp.height - 1);
  await stage.getByRole("button", { name: "Pause game" }).click();
  await stage.getByRole("button", { name: "Exit" }).click();
  await expect(stage).not.toHaveAttribute("data-immersive", "true");
});

test("landscape games ask phones in portrait to rotate (dismissable)", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only behaviour");
  await page.goto("/games/trenches?net=local");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const card = page.getByRole("dialog", { name: "Rotate your device" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Play in portrait" }).click();
  await expect(card).toBeHidden();
});

test("settings: switching to the X-1+ theme applies instantly and persists", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /X-1\+/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "x1");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "x1");
  await page.getByRole("button", { name: /Classic/ }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "x1");
});
