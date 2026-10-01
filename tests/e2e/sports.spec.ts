import { expect, test } from "./fixtures";

test("Sports+ lists the upcoming sports games and remembers who you follow", async ({ page, isMobile }) => {
  await page.goto("/");
  const nav = isMobile ? page.getByRole("navigation", { name: "Primary" }) : page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Sports+" }).click();
  await expect(page).toHaveURL(/\/sports$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sports");
  const lineup = page.getByRole("list", { name: "Upcoming sports games" });
  await expect(lineup.getByRole("article")).toHaveCount(8);
  await expect(lineup.getByRole("heading", { name: "Pitch Kings" })).toBeVisible();
  const notify = lineup.getByRole("article", { name: "Hoops X" }).getByRole("button", { name: "Notify me" });
  await notify.click();
  await expect(lineup.getByRole("article", { name: "Hoops X" }).getByRole("button", { name: /notified/ })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("list", { name: "Upcoming sports games" }).getByRole("article", { name: "Hoops X" }).getByRole("button", { name: /notified/ })).toBeVisible();
});

test("the home page teases Sports+", async ({ page }) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: "Sports+" });
  await expect(section.getByRole("article")).toHaveCount(4);
  await section.getByRole("link", { name: /See all sports/ }).click();
  await expect(page).toHaveURL(/\/sports$/);
});

test("Sports+ shows the live game and the 50-coin unlock", async ({ page }) => {
  await page.goto("/sports");
  const now = page.getByRole("region", { name: "Now playing" });
  await expect(now.getByRole("heading", { name: "Screamer: Aussie Rules" })).toBeVisible();
  await expect(now.getByTestId("sports-pass")).toContainText("50");
  await now.getByRole("link", { name: "Play now" }).click();
  await expect(page).toHaveURL(/\/games\/aussie-rules$/);
});
