import { expect, test } from "./fixtures";

test("NextX: the logo plays in, the library shows YourGov and Zero City, and the tabs work", async ({ page }) => {
  await page.goto("/nextx");
  await page.getByTestId("nextx-intro").click({ timeout: 2000 }).catch(() => {});
  await expect(page.getByTestId("nextx-title-yourgov")).toBeVisible();
  await expect(page.getByTestId("nextx-title-zero-city")).toBeVisible();
  await expect(page.getByTestId("nextx-launch-yourgov")).toHaveAttribute("href", "/games/yourgov");
  const tab = (id: string) => page.locator(`[data-testid="nextx-tab-${id}"]:visible, [data-testid="nextx-mtab-${id}"]:visible`).first();
  await tab("studio").click();
  await expect(page.getByTestId("nextx-studio")).toBeVisible();
  await tab("updates").click();
  await expect(page.getByTestId("nextx-updates")).toContainText("YourGov");
  await page.getByTestId("nextx-exit").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("nextx-teaser")).toBeVisible();
});

test("NextX titles carry the label on their pages", async ({ page }) => {
  await page.goto("/games/zero-city");
  await page.getByTestId("game-nextx").click();
  await expect(page.getByTestId("nextx-app")).toBeVisible();
});
