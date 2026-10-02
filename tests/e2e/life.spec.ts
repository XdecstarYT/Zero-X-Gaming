import { dismissRotate, expect, test } from "./fixtures";

test.use({ viewport: { width: 900, height: 506 } });

type Hooks = {
  __life: {
    life: () => { me: { age: number; alive: boolean }; money: number; home: { plot: number; owned: boolean }; builds: Record<number, { walls: unknown[] }> };
    world: () => { mode: string; needs: { energy: number }; prompt: string; minutes: number };
    ageTo: (age: number) => void;
    give: (n: number) => void;
    goTo: (x: number, z: number) => void;
    placeDoor: (id: string) => { x: number; z: number };
    act: () => void;
    buildAt: (x: number, z: number) => void;
    setTool: (t: string, item?: string) => void;
    die: () => void;
  };
};

/** Life: be born, grow up on the phone, live a day in 3D (shop on Main Street), buy a plot and build on it, then die and see the score. */
test("Life: a life on the phone and a day in the 3D town", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("zx-life-prefs", JSON.stringify({ gfx: "low" })));
  await page.goto("/games/life?life=test");
  const stage = page.getByTestId("game-stage");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await stage.getByLabel("First name").fill("Robin");
  await stage.getByLabel("Last name").fill("Tester");
  await stage.getByTestId("life-born").click();
  await expect(stage.getByTestId("life-name")).toHaveText("Robin Tester");
  await expect(stage.getByTestId("life-age")).toHaveText("Age 0");
  // Age up a few years by hand, answering any events.
  for (let i = 0; i < 4; i++) {
    const ev = stage.getByTestId("life-event");
    if (await ev.isVisible().catch(() => false)) await stage.getByTestId("life-choice-0").click();
    await stage.getByTestId("life-age-up").click();
  }
  await expect(stage.getByTestId("life-age")).toHaveText("Age 4");
  await expect(stage.getByTestId("life-log")).toContainText("Robin Tester");
  // Grow up and get some money.
  await page.evaluate(() => (window as unknown as Hooks).__life.ageTo(20));
  await page.evaluate(() => (window as unknown as Hooks).__life.give(400000));
  await stage.getByTestId("life-tab-people").click();
  await expect(stage.getByText(/Mother|Father/).first()).toBeVisible();
  await stage.getByTestId("life-tab-life").click();
  // Live a day.
  await stage.getByTestId("life-live").click();
  await expect(stage.getByTestId("life-hud")).toBeVisible({ timeout: 60_000 });
  await expect(stage.getByTestId("life-clock")).toContainText("Day");
  // Walk to Harbour Realty and buy a plot.
  const realty = await page.evaluate(() => (window as unknown as Hooks).__life.placeDoor("realty"));
  await page.evaluate((d) => (window as unknown as Hooks).__life.goTo(d.x, d.z + 1.5), realty);
  await expect(stage.getByTestId("life-prompt")).toContainText("Harbour Realty", { timeout: 10_000 });
  await page.evaluate(() => (window as unknown as Hooks).__life.act());
  await expect(stage.getByTestId("life-place-realty")).toBeVisible();
  await stage.getByTestId("life-place-realty").getByRole("button", { name: /^Buy / }).first().click();
  const life = await page.evaluate(() => (window as unknown as Hooks).__life.life());
  expect(life.home.owned).toBe(true);
  // Build: a wall on the new plot.
  await stage.getByTestId("life-build").click();
  await expect(stage.getByTestId("life-build-panel")).toBeVisible();
  await page.evaluate(() => {
    const h = (window as unknown as Hooks).__life;
    h.setTool("wall");
    h.buildAt(2, 24);
    h.buildAt(8, 24);
  });
  const built = await page.evaluate(() => {
    const l = (window as unknown as Hooks).__life.life();
    return (l.builds[l.home.plot]?.walls.length ?? 0) > 0;
  });
  expect(built).toBe(true);
  // Back to the phone: the day is recorded.
  await stage.getByTestId("life-phone").click();
  await expect(stage.getByTestId("life-screen")).toBeVisible();
  await expect(stage.getByTestId("life-log")).toContainText("A day in Harbour City");
  // The end.
  await page.evaluate(() => (window as unknown as Hooks).__life.die());
  await expect(stage.getByTestId("life-death")).toBeVisible();
  await expect(stage.getByTestId("life-death")).toContainText("Life score");
  expect(errors).toEqual([]);
});
