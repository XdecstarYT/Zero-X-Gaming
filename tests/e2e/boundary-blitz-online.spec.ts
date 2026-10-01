import { dismissRotate, expect, test } from "./fixtures";

test.use({ viewport: { width: 900, height: 506 } });

type Hooks = { __cricket: { phase: string }; __cricketAdvance: (s: number) => void };

/**
 * Two tabs play each other over the local (BroadcastChannel) transport, which
 * shares all the netcode with the Supabase one used in production.
 */
test("Boundary Blitz online: two players meet in a room and play a match", async ({ page, context }) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  const url = "/games/boundary-blitz?net=local&room=CRK01&cricket=test";
  await page.addInitScript(() => {
    localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 10, hasPass: false, purchases: ["unlock:sports-plus"], challenges: {} }));
    localStorage.setItem("zx-cricket-prefs", JSON.stringify({ gfx: "low", overs: 2 }));
  });
  const second = await context.newPage();
  await second.addInitScript(() => sessionStorage.setItem("zx-intro-seen", "1"));
  for (const p of [page, second]) p.on("pageerror", (e) => errors.push(e.message));

  async function join(p: typeof page) {
    await p.goto(url);
    const stage = p.getByTestId("game-stage");
    await p.getByRole("button", { name: "Play", exact: true }).click();
    await dismissRotate(p);
    await expect(stage.getByText("Play a friend online")).toBeVisible();
    await expect(stage.getByTestId("cricket-room")).toHaveValue("CRK01");
    await expect(stage.getByText(/Local mode/)).toBeVisible();
    await stage.getByTestId("cricket-join").click();
    return stage;
  }

  const a = await join(page);
  await expect(a.getByTestId("cricket-online-status")).toContainText("waiting for your opponent");
  const b = await join(second);
  await expect(a.getByTestId("cricket-online-status")).toContainText("is in", { timeout: 10_000 });
  await expect(b.getByTestId("cricket-online-status")).toContainText("Waiting for the host", { timeout: 10_000 });
  await expect(b.getByTestId("cricket-online-start")).toHaveCount(0);

  await a.getByTestId("cricket-online-start").click();
  // Both are in the match: one batting, one bowling.
  await expect(a.getByTestId("cricket-score")).toBeVisible({ timeout: 60_000 });
  await expect(b.getByTestId("cricket-score")).toBeVisible({ timeout: 60_000 });
  await expect(b.getByTestId("cricket-score")).toContainText(/ZXL|CYC/, { timeout: 30_000 });

  // Two software-rendered 3D tabs barely tick in headless Chrome, so the test steps both loops itself.
  const tickGuest = async () => {
    await page.evaluate(() => (window as unknown as Hooks).__cricket.phase === "break" || (window as unknown as Hooks).__cricketAdvance(0.05));
    await second.evaluate(() => (window as unknown as Hooks).__cricketAdvance(0.3));
  };

  // Fast-forward the first innings on the host; the guest calls the chase on.
  for (let i = 0; i < 40; i++) {
    const phase = await page.evaluate(() => {
      const w = window as unknown as Hooks;
      w.__cricketAdvance(20);
      return w.__cricket.phase;
    });
    await tickGuest();
    if (phase === "break") break;
  }
  const next = b.getByTestId("cricket-continue");
  await expect
    .poll(async () => {
      await tickGuest();
      return next.isVisible();
    }, { timeout: 60_000 })
    .toBe(true);
  await next.click();
  await tickGuest();
  await expect
    .poll(async () => {
      await page.evaluate(() => (window as unknown as Hooks).__cricketAdvance(0.2));
      return page.evaluate(() => (window as unknown as Hooks).__cricket.phase);
    }, { timeout: 60_000 })
    .not.toBe("break");
  await expect
    .poll(async () => {
      await tickGuest();
      return (await b.getByTestId("cricket-score").textContent()) ?? "";
    }, { timeout: 60_000 })
    .toMatch(/Need \d+ off \d+/);

  for (let i = 0; i < 60; i++) {
    const phase = await page.evaluate(() => {
      const w = window as unknown as Hooks;
      w.__cricketAdvance(20);
      return w.__cricket.phase;
    });
    await tickGuest();
    if (phase === "done") break;
  }
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => (window as unknown as Hooks).__cricketAdvance(0.3));
    await tickGuest();
  }
  const ra = a.getByTestId("cricket-results");
  const rb = b.getByTestId("cricket-results");
  await expect
    .poll(async () => {
      await page.evaluate(() => (window as unknown as Hooks).__cricketAdvance(0.3));
      return ra.isVisible();
    }, { timeout: 60_000 })
    .toBe(true);
  await expect
    .poll(async () => {
      await tickGuest();
      return rb.isVisible();
    }, { timeout: 60_000 })
    .toBe(true);
  await expect(rb).toContainText("online");
  const result = await ra.locator("p").nth(2).textContent();
  await expect(rb).toContainText(result!.trim());
  expect(errors).toEqual([]);
});
