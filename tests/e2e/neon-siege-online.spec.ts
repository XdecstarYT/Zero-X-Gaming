import { expect, test } from "./fixtures";

/**
 * Two tabs in the same browser join the same room over the local
 * (BroadcastChannel) transport, which shares all netcode with the Supabase
 * transport used in production.
 */
test("Neon Siege online: two players meet in a room, bots fill the rest, leaving updates the roster", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const url = "/games/neon-siege?net=local&room=E2E01";
  const second = await context.newPage();
  await second.addInitScript(() => sessionStorage.setItem("zx-intro-seen", "1"));

  async function joinRoom(p: typeof page) {
    await p.goto(url);
    const stage = p.getByTestId("game-stage");
    await p.getByRole("button", { name: "Play", exact: true }).click();
    await expect(stage.getByText("Online · Deathmatch")).toBeVisible();
    await expect(stage.getByLabel("Room code")).toHaveValue("E2E01");
    await expect(stage.getByText(/Local mode/)).toBeVisible();
    await stage.getByRole("button", { name: "Join room" }).click();
    await expect(stage).toHaveAttribute("data-phase", "playing");
    return stage.getByTestId("siege-hud");
  }

  const hudA = await joinRoom(page);
  await expect(hudA).toContainText("ROOM E2E01");
  await expect(hudA).toContainText("1 ONLINE");
  await expect(hudA).toContainText("[BOT]");

  const hudB = await joinRoom(second);
  await expect(hudA).toContainText("2 ONLINE", { timeout: 10_000 });
  await expect(hudB).toContainText("2 ONLINE", { timeout: 10_000 });

  // Both see each other and the same two bots (room of 4).
  const nameA = await page.evaluate(() => sessionStorage.getItem("zx-guest-name"));
  const nameB = await second.evaluate(() => sessionStorage.getItem("zx-guest-name"));
  await expect(hudA).toContainText(nameB!, { timeout: 10_000 });
  await expect(hudB).toContainText(nameA!, { timeout: 10_000 });
  await expect.poll(async () => ((await hudB.textContent()) ?? "").match(/\[BOT\]/g)?.length ?? 0).toBe(2);

  // B leaves: A's roster drops back to 1 and a bot refills the slot.
  await second.close();
  await expect(hudA).toContainText("1 ONLINE", { timeout: 10_000 });
  await expect
    .poll(async () => ((await hudA.textContent()) ?? "").match(/\[BOT\]/g)?.length ?? 0, { timeout: 10_000 })
    .toBe(3);
});

test("room codes are validated", async ({ page }) => {
  await page.goto("/games/neon-siege?net=local");
  const stage = page.getByTestId("game-stage");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await stage.getByLabel("Room code").fill("!!");
  await stage.getByRole("button", { name: "Join room" }).click();
  await expect(stage.getByRole("status").filter({ hasText: "Room codes are 4–8 letters or numbers." })).toBeVisible();
  await expect(stage).toHaveAttribute("data-phase", "playing"); // still on the menu inside the running stage
  await expect(stage.getByRole("button", { name: "Deploy vs bots" })).toBeVisible();
});
