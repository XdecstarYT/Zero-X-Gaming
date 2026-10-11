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

test.describe("the tycoon update", () => {
  type G = {
    s: { cash: number; sandbox?: boolean; structs: { kind: string; dead?: boolean }[]; tenders: { id: number; bid?: number; state: string }[]; campaigns: Record<string, number>; time: number; pos: { air?: boolean }[] };
    select: (f: { k: string; id: number } | null) => void;
  };
  type Sim = { offerTender: (s: unknown) => { id: number }; placeError: (s: unknown, p: { kind: string; x: number; z: number }) => string | null };
  const g = <T,>(page: Page, f: (g: G, sim: Sim) => T) => page.evaluate(`(${f.toString()})(window.__wf, window.__wfsim)`) as Promise<T>;
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

  test("Freeport Estate: free build in a scored game, a break room, a tender, an ad campaign, the map and air freight", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "the phone runs the next test");
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await start(page);
    await expect(page.getByTestId("wf-sandbox")).toHaveAttribute("aria-pressed", "false");
    await page.getByTestId("wf-site-wh30").click();
    // Real money and a score: not the sandbox.
    await expect(page.getByTestId("wf-cash-value")).toHaveText(/^\$[\d,]+$/);
    expect(await g(page, (x) => x.s.sandbox)).toBeFalsy();
    // Open plan: the old aisle is buildable here (never the dock lanes).
    expect(await g(page, (x, sim) => sim.placeError(x.s, { kind: "rack", x: 30, z: 15 }))).toBeNull();
    expect(await g(page, (x, sim) => sim.placeError(x.s, { kind: "rack", x: 30, z: 17 }))).toMatch(/dock lanes/);
    // A break room, built by tapping the floor: the inspector says what it does.
    await page.getByTestId("wf-dock-build").click();
    await expect(page.getByTestId("wf-build-intro")).toContainText("Open plan");
    await page.getByTestId("wf-build-breakroom").click();
    const n = await g(page, (x) => x.s.structs.length);
    const box = (await page.locator("canvas.wf-canvas").boundingBox())!;
    for (const [fx, fy] of [[0.5, 0.42], [0.45, 0.38], [0.56, 0.4], [0.4, 0.45], [0.6, 0.35], [0.5, 0.33]]) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(250);
      if ((await g(page, (x) => x.s.structs.length)) > n) break;
    }
    expect(await g(page, (x) => x.s.structs.filter((t) => t.kind === "breakroom" && !t.dead).length)).toBe(1);
    await page.getByTestId("wf-tool-done").click();
    await page.getByTestId("wf-sheet-close").click();
    await g(page, (x) => x.select({ k: "struct", id: x.s.structs.findIndex((t) => t.kind === "breakroom") }));
    await expect(page.getByTestId("wf-facility-effect")).toContainText("5% quicker");
    // A tender: bid under list.
    const id = await g(page, (x, sim) => sim.offerTender(x.s).id);
    await page.getByTestId("wf-dock-company").click();
    await page.getByTestId("wf-co-market").click();
    await page.getByTestId("wf-bid-down").click();
    await page.getByTestId("wf-bid-down").click();
    await expect(page.getByTestId("wf-bid")).toHaveText("98% of list");
    await page.getByTestId("wf-bid-place").click();
    expect(await g(page, (x) => x.s.tenders[0].bid)).toBe(0.98);
    expect(await g(page, (x) => x.s.tenders[0].id)).toBe(id);
    // An ad campaign for the trade you're in.
    await page.getByTestId("wf-campaign-goods").click();
    expect(await g(page, (x) => x.s.campaigns.goods > x.s.time)).toBe(true);
    // The map: tap a city, and open a store there.
    await page.getByTestId("wf-co-map").click();
    await expect(page.getByTestId("wf-map")).toBeVisible();
    await page.getByTestId("wf-city-boston").click();
    await expect(page.getByTestId("wf-city-card")).toContainText("Boston");
    await page.getByTestId("wf-city-store").click();
    await expect(page.getByTestId("wf-store-city")).toHaveValue("Boston");
    // Air freight.
    await page.getByTestId("wf-sheet-close").click();
    await page.getByTestId("wf-dock-buy").click();
    await page.getByTestId("wf-buy-air").click();
    await page.getByTestId("wf-buy-helmet").click();
    expect(await g(page, (x) => x.s.pos[x.s.pos.length - 1].air)).toBe(true);
    // It's on the map, coming in.
    await page.getByTestId("wf-dock-company").click();
    await page.getByTestId("wf-co-map").click();
    await expect(page.getByTestId("wf-road")).toContainText("PPE Safety Helmet");
    expect(errors).toEqual([]);
  });
});

test.describe("the tycoon update on a phone", () => {
  test.use({ viewport: devices["Pixel 7"].viewport });

  test("the map and the market fit a phone", async ({ page }, testInfo) => {
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
    await page.getByTestId("wf-site-wh30").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("wf-title")).toContainText("open plan: build anywhere");
    await page.getByTestId("wf-site-wh30").click();
    await page.evaluate(`window.__wfsim.offerTender(window.__wf.s)`);
    await page.getByTestId("wf-dock-company").click();
    const vp = page.viewportSize()!;
    const fits = async (id: string) => {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.x, id).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, id).toBeLessThanOrEqual(vp.width);
    };
    await page.getByTestId("wf-co-map").click();
    await fits("wf-map");
    // Every city is on the map, and can be tapped.
    for (const c of ["cleveland", "boston", "richmond", "new-york", "newark"]) await fits(`wf-city-${c}`);
    await page.getByTestId("wf-city-richmond").click();
    await expect(page.getByTestId("wf-city-card")).toContainText("Richmond");
    await page.getByTestId("wf-co-market").scrollIntoViewIfNeeded();
    await page.getByTestId("wf-co-market").click();
    await fits("wf-tender");
    await page.getByTestId("wf-bid-place").click();
    await expect(page.getByTestId("wf-bid-place")).toContainText("Bid in");
  });
});

test.describe("the build update", () => {
  type Part = { k: string; done: boolean };
  type Prop = { id: number; plot: string; parts: Part[]; permit: string; crews: Record<string, { gangs: number } | undefined> };
  type G = {
    s: { cash: number; tipsOff?: boolean; structs: { kind: string; m?: { type: string } }[]; estate: { props: Prop[] } };
    view: { k: string };
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
  /** Where the middle of a plot cell is on screen. */
  const cell = (page: Page, x: number, z: number) =>
    page.evaluate(
      `(() => { const cam = window.__wf.build.camera; const v = cam.position.clone().set((${x} + 0.5) * 2, 0.02, (${z} + 0.5) * 2).project(cam); const r = document.querySelector("canvas.wf-canvas").getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; })()`,
    ) as Promise<{ x: number; y: number }>;

  test("Ironridge Quarry digs; buy a plot, draw a floor, a ready-made design, planning permission and a crew", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "the phone runs the next test");
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await start(page);
    await page.getByTestId("wf-site-wh31").click();
    // The quarry: a pit and a mineshaft dig, the kiln and the steelworks make something of it.
    const kinds = await g(page, (x) => x.s.structs.map((t) => t.m?.type).filter(Boolean));
    for (const m of ["quarry", "mineshaft", "kiln", "furnace"]) expect(kinds).toContain(m);
    await g(page, (x) => {
      x.s.cash = 5_000_000;
      x.s.tipsOff = true;
    });
    // Land in Philadelphia: buying it opens the site with the plans out.
    await page.getByTestId("wf-dock-estate").click();
    await page.getByTestId("wf-est-land").click();
    await page.getByTestId("wf-buy-plot-ph2").scrollIntoViewIfNeeded();
    await page.getByTestId("wf-buy-plot-ph2").click();
    await expect(page.getByTestId("wf-sitebar")).toContainText("Elfreth's Alley");
    await expect(page.getByTestId("wf-site-status")).toHaveText("Empty plot");
    await expect(page.getByTestId("wf-site-plan")).toBeVisible();
    await page.getByTestId("wf-site-close").click();
    // The floor tool: tap one corner, then the other.
    await page.getByTestId("wf-etool-found").click();
    await expect(page.getByTestId("wf-etool-found")).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(1500);
    for (const [x, z] of [[1, 1], [3, 2]]) {
      const pt = await cell(page, x, z);
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(200);
    }
    expect(await g(page, (x) => x.s.estate.props[0].parts.filter((p) => p.k === "found").length)).toBe(6);
    await expect(page.getByTestId("wf-toast")).toContainText("6 foundations planned");
    await page.getByTestId("wf-etool-found").click();
    // A ready-made design instead: the units it'll make are listed.
    await page.getByTestId("wf-panel-plan").click();
    await page.getByTestId("wf-tpl-house").click();
    expect(await g(page, (x) => x.s.estate.props[0].parts.some((p) => p.k === "roof"))).toBe(true);
    await expect(page.getByTestId("wf-planned-units").locator(".wf-trow")).not.toHaveCount(0);
    await expect(page.getByTestId("wf-estimate")).toBeVisible();
    // Planning permission, then a gang of bricklayers.
    await page.getByTestId("wf-apply-permit").click();
    await expect(page.getByTestId("wf-permit")).toContainText("With the planners");
    expect(await g(page, (x) => x.s.estate.props[0].permit)).toBe("pending");
    await page.getByTestId("wf-panel-site").click();
    await page.getByTestId("wf-crew-brick-more").click();
    expect(await g(page, (x) => x.s.estate.props[0].crews.brick?.gangs)).toBe(1);
    await expect(page.getByTestId("wf-site-materials")).toContainText("Bricks");
    // Back to the warehouse: the property is in the portfolio.
    await page.getByTestId("wf-site-close").click();
    await page.getByTestId("wf-site-back").click();
    expect(await g(page, (x) => x.view.k)).toBe("site");
    await page.getByTestId("wf-dock-estate").click();
    await page.getByTestId("wf-est-portfolio").click();
    await expect(page.getByTestId("wf-prop-ph2")).toContainText("Elfreth's Alley");
    expect(errors).toEqual([]);
  });
});

test.describe("the build update on a phone", () => {
  test.use({ viewport: devices["Pixel 7"].viewport });

  test("the building site's bar and tools fit a phone, and a store can be visited in 3D", async ({ page }, testInfo) => {
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
    await page.evaluate(`(window.__wf.s.cash = 5000000, window.__wf.s.tipsOff = true)`);
    const vp = page.viewportSize()!;
    const fits = async (id: string) => {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.x, id).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, id).toBeLessThanOrEqual(vp.width);
      expect(b.y + b.height, id).toBeLessThanOrEqual(vp.height);
    };
    await page.getByTestId("wf-dock-estate").scrollIntoViewIfNeeded();
    await page.getByTestId("wf-dock-estate").click();
    await page.getByTestId("wf-est-land").click();
    await page.getByTestId("wf-buy-plot-bo1").scrollIntoViewIfNeeded();
    await page.getByTestId("wf-buy-plot-bo1").click();
    await fits("wf-site-plan");
    await page.getByTestId("wf-site-close").click();
    await fits("wf-sitebar");
    await fits("wf-sitetools");
    // The storey stepper and the cutaway.
    await page.getByTestId("wf-storey-up").click();
    await expect(page.getByTestId("wf-storey")).toHaveText("Storey 2");
    await expect(page.getByTestId("wf-etool-found")).toContainText("Floor");
    await page.getByTestId("wf-cutaway").click();
    await expect(page.getByTestId("wf-cutaway")).toHaveAttribute("aria-pressed", "true");
    // The tools scroll sideways: the last is reachable.
    await page.getByTestId("wf-etool-lay").scrollIntoViewIfNeeded();
    await fits("wf-etool-lay");
    await page.getByTestId("wf-site-back").click();
    // A supermarket, then inside it.
    await page.getByTestId("wf-dock-company").scrollIntoViewIfNeeded();
    await page.getByTestId("wf-dock-company").click();
    await page.getByTestId("wf-co-stores").scrollIntoViewIfNeeded();
    await page.getByTestId("wf-co-stores").click();
    await page.getByTestId("wf-storekind-grocery").click();
    await page.getByTestId("wf-store-open").click();
    await page.getByTestId("wf-visit-store").click();
    await expect(page.getByTestId("wf-storebar")).toContainText("Supermarket");
    await fits("wf-storebar");
    await fits("wf-storecard");
    await page.getByTestId("wf-store-back").click();
    await expect(page.getByTestId("wf-storebar")).toHaveCount(0);
    expect(await page.evaluate(`window.__wf.view.k`)).toBe("site");
  });
});
