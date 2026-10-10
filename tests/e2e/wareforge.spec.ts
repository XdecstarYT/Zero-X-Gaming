import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.use({ viewport: { width: 1400, height: 900 } });

type WF = {
  s: { cash: number; time: number; orders: { id: number; code: string; state: string }[]; stats: { unloaded: number; delivered: number }; structs: unknown[]; forks: unknown[] };
  speed: number;
};
const wf = <T,>(page: Page, f: (g: WF) => T) => page.evaluate(`(${f.toString()})(window.__wf)`) as Promise<T>;

test("WareForge: members only; pick a site, accept an order, buy stock, build a rack, a forklift and an upgrade, and ship", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "the desktop run covers play; the page is checked on mobile by the a11y pass");
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_TUNNEL|Failed to load resource|supabase/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
    localStorage.setItem("zx-wareforge-prefs", JSON.stringify({ gfx: "low", sound: false }));
  });
  await page.goto("/games/wareforge?wf");
  await expect(page.getByTestId("game-access")).toHaveText("ZLink+ exclusive");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("wf-title")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("nextx-powered")).toBeVisible();
  await page.getByTestId("wf-site-wh01").click();
  await expect(page.getByTestId("wf-top")).toBeVisible();
  await expect(page.getByTestId("wf-kpis")).toContainText("Stock on hand");
  // In the page's game frame the tracker and the status table live in the Site panel.
  await page.getByTestId("wf-dock-site").click();
  await expect(page.getByTestId("wf-sheet-site")).toContainText("Shipment Tracking");

  // Orders: the booked shipment is there; accept an offer.
  await page.getByTestId("wf-dock-orders").click();
  await expect(page.getByTestId("wf-sheet-orders").getByTestId("wf-order-SHP-78442")).toBeVisible();
  const offers = await page.getByTestId("wf-accept").count();
  if (offers) await page.getByTestId("wf-accept").first().click();

  // Buy stock, a forklift and an upgrade.
  await page.getByTestId("wf-dock-buy").click();
  const cash0 = await wf(page, (g) => g.s.cash);
  await page.getByTestId("wf-buy-helmet").click();
  await expect(page.getByTestId("wf-toast")).toContainText("ordered");
  expect(await wf(page, (g) => g.s.cash)).toBeLessThan(cash0);
  await page.getByTestId("wf-dock-fleet").click();
  await page.getByTestId("wf-buy-forklift").click();
  expect(await wf(page, (g) => g.s.forks.length)).toBe(3);
  await page.getByTestId("wf-dock-upgrades").click();
  await page.getByTestId("wf-up-scanner").click();

  // Build a rack by tapping the floor.
  await page.getByTestId("wf-dock-build").click();
  const structs = await wf(page, (g) => g.s.structs.length);
  await page.getByTestId("wf-build-rack").click();
  await expect(page.getByTestId("wf-toolbar")).toBeVisible();
  const box = (await page.locator("canvas.wf-canvas").boundingBox())!;
  let built = false;
  for (const [fx, fy] of [[0.5, 0.45], [0.45, 0.4], [0.55, 0.42], [0.4, 0.48], [0.6, 0.38]]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(200);
    if ((await wf(page, (g) => g.s.structs.length)) > structs) {
      built = true;
      break;
    }
  }
  expect(built).toBe(true);
  await page.getByTestId("wf-tool-done").click();

  // Run at 8× until the first truck is unloaded and the first shipment delivered.
  await page.getByTestId("wf-speed-8").click();
  // The software renderer in CI draws few frames a second: fast-forward the clock so the shift gets going.
  await wf(page, (g) => void (g.speed = 64));
  await expect.poll(() => wf(page, (g) => g.s.stats.unloaded), { timeout: 150_000, intervals: [2000] }).toBeGreaterThan(0);
  await expect.poll(() => wf(page, (g) => g.s.stats.delivered), { timeout: 150_000, intervals: [2000] }).toBeGreaterThan(0);

  // Pick something in the world, then the inspector shows it.
  await page.getByTestId("wf-pause").click();
  await page.getByTestId("wf-dock-site").click();
  await page.locator(".wf-trow:visible").first().click();
  await expect(page.getByTestId("wf-inspector")).toBeVisible();

  // Save and leave, then continue.
  await page.getByTestId("wf-dock-menu").click();
  await page.getByTestId("wf-quit").click();
  await expect(page.getByTestId("wf-continue")).toBeVisible();
  await page.getByTestId("wf-continue").click();
  await expect(page.getByTestId("wf-top")).toBeVisible();
  expect(errors).toEqual([]);
});
