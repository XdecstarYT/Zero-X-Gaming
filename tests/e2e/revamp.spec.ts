import { expect, test } from "./fixtures";

test("home: the spotlight turns over and links to its game", async ({ page }) => {
  await page.goto("/");
  const spot = page.getByTestId("spotlight");
  await expect(spot).toHaveAttribute("data-slide", "life");
  await spot.getByRole("button", { name: "UBusiness" }).click();
  await expect(spot).toHaveAttribute("data-slide", "ubusiness");
  await spot.getByTestId("spotlight-play").click();
  await expect(page).toHaveURL(/\/games\/ubusiness$/);
});

test("home: browse by vibe switches collections", async ({ page }) => {
  await page.goto("/");
  const c = page.getByTestId("collections");
  await expect(c.getByRole("link", { name: "UBusiness" })).toBeVisible();
  await c.getByTestId("collection-sports").click();
  await expect(c.getByTestId("collection-sports")).toHaveAttribute("aria-selected", "true");
  await expect(c.getByRole("link", { name: "Fairway" })).toBeVisible();
  await expect(c.getByRole("link", { name: "UBusiness" })).toHaveCount(0);
});

test("search: Ctrl+K finds a game by its tags and opens it", async ({ page }) => {
  await page.goto("/");
  await page.locator("body").click();
  await page.keyboard.press("Control+k");
  const pal = page.getByTestId("palette");
  await expect(pal).toBeVisible();
  await page.keyboard.type("golf");
  await expect(pal.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/games\/fairway$/);
  await expect(pal).toBeHidden();
});

test("owner panel: everyone else is turned away, and there's no crown in the bar", async ({ page }) => {
  await page.goto("/owner");
  await expect(page.getByTestId("owner-denied")).toBeVisible();
  await expect(page.getByTestId("owner-link")).toHaveCount(0);
});
