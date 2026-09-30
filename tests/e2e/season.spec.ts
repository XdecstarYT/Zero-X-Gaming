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
    localStorage.setItem(
      "zx-season-s1",
      JSON.stringify({ xp: 3500, matches: 4, wins: 1, kills: 9, coins: 0, hasPass: true, challenges: {} }),
    ),
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

test("battle pass costs 200 coins and unlocks the tiers already reached", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 3500, matches: 4, wins: 1, kills: 9, coins: 260, challenges: {} }));
    }
  });
  await page.goto("/battle-pass");
  await expect(page.getByText("Needs pass").first()).toBeVisible();
  const buy = page.getByRole("button", { name: /Buy for/ });
  await buy.click();
  await page.getByRole("button", { name: "Tap again to confirm" }).click();
  await expect(page.getByRole("heading", { name: "Battle Pass owned" })).toBeVisible();
  await expect(page.getByText("✓ Owned")).toHaveCount(3);
  // Free lane: coins every 5 tiers for everyone.
  await expect(page.getByText("Free · coins").first()).toBeAttached();
  await expect(page.getByRole("link", { name: /Item Shop: 60 coins/ })).toBeVisible();
});

test("item shop: DROP 1 is live, buy an item and it shows up in the Locker", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, challenges: {} }));
    }
  });
  await page.goto("/shop");
  await expect(page.getByTestId("drop-name")).toHaveText("DROP 1");
  await expect(page.getByRole("heading", { name: "Apex Predator" })).toBeVisible();
  // Can't afford the 150-coin featured outfit yet.
  await expect(page.getByRole("button", { name: "Buy Apex Predator for 150 coins" })).toBeDisabled();
  // Inspect in 3D, buy from the dialog, celebrate, equip.
  await page.getByRole("button", { name: "Inspect Frostbite" }).click();
  const dialog = page.getByRole("dialog", { name: "Frostbite" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Ice-blue layers");
  await dialog.getByRole("button", { name: "Buy Frostbite for 60 coins" }).click();
  await dialog.getByRole("button", { name: "Confirm: buy Frostbite for 60 coins" }).click();
  const party = page.getByRole("dialog", { name: "Unlocked!" });
  await expect(party).toBeVisible();
  await party.getByRole("button", { name: "Equip now" }).click();
  await expect(party).toBeHidden();
  await expect(page.getByRole("link", { name: /Item Shop: 40 coins/ })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("zx-siege-loadout") ?? "{}").outfit)).toBe("frostbite");
  await page.goto("/locker");
  const frost = page.getByRole("button", { name: /Frostbite/ });
  await expect(frost).toHaveAttribute("aria-pressed", "true");
});
