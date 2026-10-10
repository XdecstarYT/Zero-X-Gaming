import { devices, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.use({ viewport: { width: 1400, height: 900 } });

type WF = {
  s: { cash: number; loan: number; time: number; orders: { id: number; code: string; state: string }[]; stats: { unloaded: number; delivered: number }; structs: unknown[]; forks: unknown[] };
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
  // The cash is always on the top bar, and opens the bank: borrow $10,000 and pay it back.
  await expect(page.getByTestId("wf-cash")).toContainText("$");
  await page.getByTestId("wf-cash").click();
  await expect(page.getByTestId("wf-sheet-bank")).toContainText("Cash by the hour");
  const before = await wf(page, (g) => g.s.cash);
  await page.getByTestId("wf-borrow-10000").click();
  await expect(page.getByTestId("wf-loan")).toHaveText("$10,000");
  expect(await wf(page, (g) => g.s.cash)).toBeGreaterThan(before + 9_000);
  await page.getByTestId("wf-repay-all").click();
  await expect.poll(() => wf(page, (g) => g.s.loan)).toBe(0);
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

test.describe("on a phone", () => {
  // The rest of this file plays on a big screen; this one uses the phone's own.
  test.use({ viewport: devices["Pixel 7"].viewport });

  test("WareForge on a phone: the cash is always on the top bar, with the figures hidden too, and the bar fits", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the phone layout");
    test.setTimeout(180_000);
    await page.addInitScript(() => {
      if (!localStorage.getItem("zx-season-s1"))
        localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
      localStorage.setItem("zx-wareforge-prefs", JSON.stringify({ gfx: "low", sound: false }));
    });
    await page.goto("/nextx/play/wareforge?wf");
    await page.getByTestId("zlink-lock-join").click();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByTestId("wf-title")).toBeVisible({ timeout: 120_000 });
    await page.getByTestId("wf-site-wh01").click();
    const cash = page.getByTestId("wf-cash");
    await expect(cash).toBeVisible();
    await expect(page.getByTestId("wf-cash-value")).toHaveText(/^\$[\d,]+$/);
    // Everything on the top bar is on the screen, the alerts bell last.
    const vp = page.viewportSize()!;
    const onScreen = async (id: string) => {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b, id).not.toBeNull();
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
    };
    for (const id of ["wf-cash", "wf-clock", "wf-pause", "wf-speed-cycle", "wf-kpitoggle", "wf-bell"]) await onScreen(id);
    // Even a six-figure balance fits.
    await wf(page, (g) => void (g.s.cash = 734_982));
    await expect(page.getByTestId("wf-cash-value")).toHaveText("$734,982");
    await onScreen("wf-bell");
    // Hide the row of figures: the cash stays.
    await page.getByTestId("wf-kpitoggle").click();
    await expect(page.getByTestId("wf-kpis")).toBeHidden();
    await expect(cash).toBeVisible();
    // One button steps the speed up on a phone.
    await page.getByTestId("wf-speed-cycle").click();
    await expect(page.getByTestId("wf-speed-cycle")).toHaveText("2×");
    // Tap the cash for the bank.
    await cash.click();
    await expect(page.getByTestId("wf-sheet-bank")).toBeVisible();
    await expect(page.getByTestId("wf-bank-cash")).toContainText("$");
    await page.getByTestId("wf-borrow-10000").click();
    await expect(page.getByTestId("wf-loan")).toHaveText("$10,000");
  });
});

test.describe("the industry update", () => {
  type G = {
    s: { cash: number; sandbox?: boolean; structs: { kind: string; dead?: boolean; m?: unknown }[]; stores: unknown[]; lic: Record<string, boolean>; managers: Record<string, boolean> };
    select: (f: { k: string; id: number }) => void;
  };
  const g = <T,>(page: Page, f: (g: G) => T) => page.evaluate(`(${f.toString()})(window.__wf)`) as Promise<T>;
  const start = async (page: Page) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem("zx-season-s1"))
        localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
      localStorage.setItem("zx-wareforge-prefs", JSON.stringify({ gfx: "low", sound: false }));
    });
    await page.goto("/nextx/play/wareforge?wf");
    await page.getByTestId("zlink-lock-join").click();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByTestId("wf-title")).toBeVisible({ timeout: 120_000 });
  };
  /** Tap round the middle of the floor until something new stands there. */
  const tapFloor = async (page: Page) => {
    const n = await g(page, (x) => x.s.structs.length);
    const box = (await page.locator("canvas.wf-canvas").boundingBox())!;
    for (const [fx, fy] of [[0.5, 0.42], [0.45, 0.38], [0.56, 0.4], [0.4, 0.45], [0.6, 0.35], [0.5, 0.33]]) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(250);
      if ((await g(page, (x) => x.s.structs.length)) > n) return true;
    }
    return false;
  };

  test("sandbox on the greenfield plot: lay conveyors, build an oven, move it, open a store and hire a manager", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "the phone runs the next test");
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await start(page);
    await page.getByTestId("wf-sandbox").click();
    await page.getByTestId("wf-site-wh20").click();
    await expect(page.getByTestId("wf-cash-value")).toHaveText("∞ Sandbox");
    expect(await g(page, (x) => x.s.structs.filter((t) => t.kind === "rack").length)).toBe(0);
    // A line of conveyor, then a machine from an industry the sandbox opens.
    await page.getByTestId("wf-dock-build").click();
    await page.getByTestId("wf-build-belt").click();
    await page.getByTestId("wf-tool-turn").click();
    await expect(page.getByTestId("wf-tool-turn")).toContainText("south");
    expect(await tapFloor(page)).toBe(true);
    await page.getByTestId("wf-tool-done").click();
    // The build panel comes back after "Done", ready for the next thing.
    await expect(page.getByTestId("wf-sheet-build")).toBeVisible();
    await page.getByTestId("wf-build-oven").click();
    expect(await tapFloor(page)).toBe(true);
    await page.getByTestId("wf-tool-done").click();
    await page.getByTestId("wf-sheet-close").click();
    // Move the oven somewhere else.
    await g(page, (x) => x.select({ k: "struct", id: x.s.structs.findIndex((t) => !!t.m && !t.dead) }));
    await page.getByTestId("wf-move").click();
    await expect(page.getByTestId("wf-toolbar")).toContainText("Moving");
    const box = (await page.locator("canvas.wf-canvas").boundingBox())!;
    for (const [fx, fy] of [[0.3, 0.3], [0.65, 0.3], [0.35, 0.45], [0.7, 0.45]]) {
      if (!(await page.getByTestId("wf-toolbar").isVisible())) break;
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(300);
    }
    await expect(page.getByTestId("wf-toolbar")).toBeHidden();
    expect(await g(page, (x) => x.s.structs.filter((t) => !!t.m && t.dead).length)).toBe(1);
    // The company: every industry is open in a sandbox; open a store and hire a manager.
    await page.getByTestId("wf-dock-company").click();
    await expect(page.getByTestId("wf-sheet-company")).toContainText("Today, by business");
    await page.getByTestId("wf-co-industries").click();
    await expect(page.getByTestId("wf-licence-auto")).toHaveCount(0);
    await page.getByTestId("wf-co-production").click();
    await expect(page.getByTestId("wf-production")).toContainText("Bakery Oven");
    await page.getByTestId("wf-co-stores").click();
    await page.getByTestId("wf-storekind-cars").click();
    await page.getByTestId("wf-store-city").selectOption("Boston");
    await page.getByTestId("wf-store-open").click();
    await expect(page.getByTestId("wf-store")).toContainText("Boston Car dealership");
    await page.getByTestId("wf-co-managers").click();
    await page.getByTestId("wf-hire-plant").click();
    await expect(page.getByTestId("wf-hire-plant")).toHaveText("Hired ✓");
    expect(await g(page, (x) => x.s.managers.plant)).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe("the industry update on a phone", () => {
  test.use({ viewport: devices["Pixel 7"].viewport });

  test("the bakery: license fashion, open a supermarket, and the company tabs fit", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the phone layout");
    test.setTimeout(240_000);
    await page.addInitScript(() => {
      if (!localStorage.getItem("zx-season-s1"))
        localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
      localStorage.setItem("zx-wareforge-prefs", JSON.stringify({ gfx: "low", sound: false }));
    });
    await page.goto("/nextx/play/wareforge?wf");
    await page.getByTestId("zlink-lock-join").click();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByTestId("wf-title")).toBeVisible({ timeout: 120_000 });
    await page.getByTestId("wf-site-wh21").click();
    await page.getByTestId("wf-dock-company").scrollIntoViewIfNeeded();
    await page.getByTestId("wf-dock-company").click();
    const sheet = page.getByTestId("wf-sheet-company");
    await expect(sheet).toBeVisible();
    // The tabs scroll sideways rather than squash; the page doesn't.
    await page.getByTestId("wf-co-managers").scrollIntoViewIfNeeded();
    await page.getByTestId("wf-co-industries").click();
    await page.getByTestId("wf-licence-fashion").click();
    await expect(page.getByTestId("wf-licence-fashion")).toHaveCount(0);
    expect(await page.evaluate(`window.__wf.s.lic.fashion`)).toBe(true);
    await page.getByTestId("wf-co-stores").click();
    await page.getByTestId("wf-storekind-grocery").click();
    await page.getByTestId("wf-store-open").click();
    await expect(page.getByTestId("wf-store")).toContainText("New York Supermarket");
    const vp = page.viewportSize()!;
    const b = (await page.getByTestId("wf-store").boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
  });
});
