import type { Page } from "@playwright/test";
import { dismissRotate, expect, test } from "./fixtures";

test.use({ viewport: { width: 1200, height: 760 } });

type ZN = {
  state: () => {
    mode: string;
    day: number;
    money: number;
    population: number;
    buildings: number;
    roads: number;
    zoned: number;
    milestone: number;
  };
  zone: (ax: number, ay: number, bx: number, by: number, z: "R" | "C" | "I") => { ok: boolean };
  service: (k: string, x: number, y: number) => { ok: boolean };
  days: (n: number) => number;
  screenOf: (x: number, y: number) => { x: number; y: number };
  look: (x: number, y: number, dist?: number) => void;
};
const zn = (page: Page) => page.evaluate(() => (window as unknown as { __zenith: ZN }).__zenith.state());

/** A guest with coins in their device save, on low graphics. */
async function guestWith(page: Page, coins: number) {
  await page.addInitScript((coins) => {
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem(
        "zx-season-s1",
        JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins, hasPass: false, purchases: [], challenges: {} }),
      );
    localStorage.setItem("zx-zenith-prefs", JSON.stringify({ gfx: "low", clock: "day" }));
  }, coins);
}

test("Zenith: members only; found a city, drag a road, zone it, power it and watch it grow", async ({ page }) => {
  test.setTimeout(300_000);
  await guestWith(page, 100);
  await page.goto("/games/zenith");
  await expect(page.getByTestId("game-access")).toHaveText("ZLink+ exclusive");
  await expect(page.getByTestId("zlink-lock")).toBeVisible();
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await page.getByTestId("zn-new").click();
  await expect(page.getByTestId("zn-hud")).toBeVisible();
  await expect(page.getByTestId("zn-money")).toHaveText("$60,000");
  // Stop the clock so the books only move when we build.
  await page.getByTestId("zn-speed-0").click();

  // Lay a road off the highway with a real drag.
  await page.getByTestId("zn-tool-roads").click();
  await page.evaluate(() => (window as unknown as { __zenith: ZN }).__zenith.look(9, 24, 150));
  await page.waitForTimeout(1200);
  const [a, b] = await page.evaluate(() => {
    const z = (window as unknown as { __zenith: ZN }).__zenith;
    return [z.screenOf(4, 24), z.screenOf(16, 24)];
  });
  const before = await zn(page);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await zn(page)).roads).toBe(before.roads + 12);
  expect((await zn(page)).money).toBe(before.money - 12 * 25);

  // Zone both sides, add power and water, and let time pass.
  const pop = await page.evaluate(() => {
    const z = (window as unknown as { __zenith: ZN }).__zenith;
    z.zone(5, 22, 16, 23, "R");
    z.zone(5, 25, 10, 26, "C");
    z.zone(11, 25, 16, 26, "I");
    // Utilities go on the roadside.
    if (!z.service("coal", 16, 25).ok) throw new Error("no room for the plant");
    if (!z.service("tower", 5, 23).ok) throw new Error("no room for the tower");
    return z.days(60);
  });
  expect(pop).toBeGreaterThan(50);
  await expect(page.getByTestId("zn-pop")).not.toHaveText("0");

  // Bank the population as the score.
  await page.getByTestId("zn-tool-city").click();
  await page.getByTestId("zn-bank").click();
  await expect(page.getByTestId("game-stage")).toHaveAttribute("data-phase", "over", { timeout: 10_000 });

  // The city is saved on the device: Continue picks it up.
  await page.reload();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(page.getByTestId("zn-continue")).toBeVisible();
});

test("Zenith: the tool shows what's wrong instead of building", async ({ page }) => {
  test.setTimeout(300_000);
  await guestWith(page, 100);
  await page.goto("/zlink");
  await page.getByTestId("zlink-join-button").click();
  await page.goto("/games/zenith");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await page.getByTestId("zn-new").click();
  await page.getByTestId("zn-speed-0").click();
  // A power plant needs a road beside it.
  await page.getByTestId("zn-tool-power").click();
  await page.getByTestId("zn-item-coal").click();
  await page.evaluate(() => (window as unknown as { __zenith: ZN }).__zenith.look(20, 10, 150));
  await page.waitForTimeout(1200);
  const p = await page.evaluate(() => (window as unknown as { __zenith: ZN }).__zenith.screenOf(20, 10));
  const before = (await zn(page)).money;
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId("zn-toast")).toContainText("Needs a road beside it");
  expect((await zn(page)).money).toBe(before);
});
