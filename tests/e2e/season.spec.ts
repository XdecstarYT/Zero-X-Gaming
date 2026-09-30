import { expect, test } from "./fixtures";

test("battle pass shows the season, tier progress, challenges and the reward track", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 3500, matches: 4, wins: 1, kills: 9, challenges: {} })),
  );
  await page.goto("/battle-pass");
  await expect(page.getByRole("heading", { name: "Ground Zero" })).toBeVisible();
  await expect(page.getByTestId("bp-tier")).toHaveText("3");
  await expect(page.getByRole("progressbar", { name: "Progress to next tier" })).toHaveAttribute("aria-valuenow", "500");
  await expect(page.getByRole("heading", { name: "Daily challenges" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weekly challenges" })).toBeVisible();
  await expect(page.getByText("Vanguard Prime")).toBeVisible();
  await expect(page.getByText(/saved on this device only/)).toBeVisible();
});

test("locker: equip an owned outfit; locked items show their tier", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 3500, matches: 4, wins: 1, kills: 9, challenges: {} })),
  );
  await page.goto("/locker");
  const urban = page.getByRole("button", { name: /Urban Ops/ });
  await expect(urban).toBeEnabled();
  await urban.click();
  await expect(urban).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("zx-siege-loadout") ?? "{}").outfit)).toBe("urban");
  const vanguard = page.getByRole("button", { name: /Vanguard Prime/ });
  await expect(vanguard).toBeDisabled();
  await expect(vanguard).toContainText("Battle Pass tier 30");
  await page.getByRole("tab", { name: "Wraps" }).click();
  await page.getByRole("button", { name: /Woodland/ }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("zx-siege-loadout") ?? "{}").wrap)).toBe("woodland");
});
