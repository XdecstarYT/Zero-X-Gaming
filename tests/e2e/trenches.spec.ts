import { dismissRotate, expect, test } from "./fixtures";

test("Trenches quick battle: Conquest vs bots loads with tickets and flags", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("zx-siege-gfx", "2d"));
  await page.goto("/games/trenches?net=local");
  const stage = page.getByTestId("game-stage");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);

  await expect(stage.getByText("Conquest · No Man's Land")).toBeVisible();
  await stage.getByRole("group", { name: "Class" }).getByRole("button", { name: /Medic/ }).click();
  await stage.getByRole("button", { name: "Quick battle vs bots" }).click();
  const hud = stage.getByTestId("siege-hud");
  await expect(hud).toContainText("LEGION", { timeout: 15_000 });
  await expect(hud).toContainText("FRONT");
  await expect(hud).toContainText(/Pvt\.|Cpl\./);
  expect(errors).toEqual([]);
});

/**
 * Two tabs share the local (BroadcastChannel) transport, which runs the same
 * lobby and match netcode as the Supabase transport used in production.
 */
test("Trenches lobbies: create, browse, join, chat, start together", async ({ page, context }) => {
  test.setTimeout(120_000);
  const second = await context.newPage();
  await second.addInitScript(() => sessionStorage.setItem("zx-intro-seen", "1"));
  for (const p of [page, second]) await p.addInitScript(() => localStorage.setItem("zx-siege-gfx", "2d"));

  async function open(p: typeof page) {
    await p.goto("/games/trenches?net=local");
    await p.getByRole("button", { name: "Play", exact: true }).click();
    await dismissRotate(p);
    return p.getByTestId("game-stage");
  }

  const a = await open(page);
  await a.getByLabel("Lobby name").fill("E2E Front");
  await a.getByLabel("Size").selectOption("8");
  await a.getByRole("button", { name: "Create lobby" }).click();
  await expect(a.getByRole("button", { name: "Leave lobby" })).toBeVisible();
  await expect(a.getByRole("button", { name: /Start battle/ })).toBeVisible();

  const b = await open(second);
  await b.getByRole("button", { name: "Join E2E Front" }).click({ timeout: 15_000 });
  await expect(b.getByRole("button", { name: "Leave lobby" })).toBeVisible();
  // Guests can't start the battle; the host sees both players (auto-balanced across teams).
  await expect(b.getByRole("button", { name: /Start battle/ })).toHaveCount(0);
  const nameB = await second.evaluate(() => sessionStorage.getItem("zx-guest-name"));
  await expect(a).toContainText(nameB!, { timeout: 10_000 });

  await b.getByLabel("Chat message").fill("hold the line");
  await b.getByRole("button", { name: "Send" }).click();
  await expect(a.getByRole("log", { name: "Lobby chat" })).toContainText("hold the line", { timeout: 10_000 });

  await b.getByRole("button", { name: "Ready up" }).click();
  await a.getByRole("button", { name: "Ready up" }).click();
  await expect(a.getByRole("button", { name: "Start battle", exact: true })).toBeVisible({ timeout: 10_000 });
  await a.getByRole("button", { name: "Start battle", exact: true }).click();

  const hudA = a.getByTestId("siege-hud");
  const hudB = b.getByTestId("siege-hud");
  await expect(hudA).toContainText("LEGION", { timeout: 30_000 });
  await expect(hudB).toContainText("LEGION", { timeout: 30_000 });
});

test("Trenches Breakthrough: pick the mode, attack in sectors, throw a grenade", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("zx-siege-gfx", "2d"));
  await page.goto("/games/trenches?net=local");
  const stage = page.getByTestId("game-stage");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await stage.getByRole("group", { name: "Game mode" }).getByRole("button", { name: /Breakthrough/ }).click();
  await stage.getByRole("button", { name: "Quick battle vs bots" }).click();
  const hud = stage.getByTestId("siege-hud");
  await expect(hud).toContainText("ATTACK · SECTOR 1/3", { timeout: 15_000 });
  await expect(hud).toContainText("GRENADES 2");
  await page.keyboard.press("q");
  await expect(hud).toContainText("GRENADES 1");
  expect(errors).toEqual([]);
});
