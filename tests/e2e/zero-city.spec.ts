import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// Wide enough that the game stage has room for the HUD and a work area above it.
test.use({ viewport: { width: 1400, height: 900 } });

type ZC = {
  debugState: () => { screen: string; mode: string; population: number; roads: number; lots: number; cars: number; peds: number; threaded: boolean; maps: number };
  quality: (p: "low" | "medium" | "high" | "ultra") => void;
  gateEnd: () => { x: number; z: number };
  look: (x: number, z: number, height: number, tilt: number, yaw: number) => void;
  screenOf: (x: number, z: number) => { x: number; y: number } | null;
};
const hook = <T,>(page: Page, f: (zc: ZC) => T) => page.evaluate(`(${f.toString()})(window.__zc)`) as Promise<T>;
const state = (page: Page) => hook(page, (zc) => zc.debugState());

test("Zero City: members only; settings, a new city, roads, zones and growth with no console errors", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const touch = testInfo.project.name === "mobile";
  const errors: string[] = [];
  // The sandboxed test server can't reach Supabase; those network errors aren't the game's.
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_TUNNEL|Failed to load resource|supabase/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
  });

  // ZLink+ gate, then the game's own loading screen and menu.
  await page.goto("/games/zero-city?zc=test");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("zc-menu")).toBeVisible({ timeout: 90_000 });
  await hook(page, (zc) => zc.quality("low"));

  // Settings: a preset change is UNSAVED until applied; Revert puts it back. Arabic flips the layout.
  await page.getByTestId("zc-settings").click();
  await page.getByTestId("zc-preset-medium").click();
  await expect(page.getByTestId("zc-unsaved")).toBeVisible();
  await page.getByTestId("zc-revert").click();
  await expect(page.getByTestId("zc-unsaved")).toBeHidden();
  await page.getByTestId("zc-lang-ar").click();
  await page.getByTestId("zc-apply").click();
  await expect(page.getByTestId("zero-city")).toHaveAttribute("dir", "rtl");
  await page.getByTestId("zc-lang-en").click();
  await page.getByTestId("zc-apply").click();
  await expect(page.getByTestId("zero-city")).toHaveAttribute("dir", "ltr");
  await page.getByTestId("zc-sheet-close").click();

  // Ten maps; start on the first.
  await page.getByTestId("zc-new").click();
  await expect(page.locator('[data-testid^="zc-map-"]:not([data-testid="zc-map-detail"])')).toHaveCount(13);
  await page.getByTestId("zc-start").click();
  await expect(page.getByTestId("zc-hud")).toBeVisible({ timeout: 90_000 });
  const start = await state(page);
  expect(start.roads).toBe(1); // the highway in

  const end = await hook(page, (zc) => zc.gateEnd());
  await page.evaluate(([x, z]) => (window as unknown as { __zc: ZC }).__zc.look(x + 110, z + 45, 300, 1.0, 0), [end.x, end.z]);
  await page.waitForTimeout(800);
  const at = async (dx: number, dz: number) => {
    const p = await page.evaluate(([x, z]) => (window as unknown as { __zc: ZC }).__zc.screenOf(x, z), [end.x + dx, end.z + dz]);
    expect(p).toBeTruthy();
    // Every point must be on the open map, not under the HUD.
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [p!.x, p!.y])).toBe("CANVAS");
    return p!;
  };
  const click = async (dx: number, dz: number) => {
    const p = await at(dx, dz);
    if (touch) {
      await page.touchscreen.tap(p.x, p.y);
      await page.waitForTimeout(150);
      return;
    }
    await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(150);
  };
  const drag = async (ax: number, az: number, bx: number, bz: number) => {
    const a = await at(ax, az);
    const b = await at(bx, bz);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  };

  // Roads: an avenue off the highway, then two streets across it (each splits it at a junction).
  await page.getByTestId("zc-tab-roads").click();
  await page.getByTestId("zc-rt-avenue").click();
  await click(0, 0);
  await click(220, 0);
  await page.keyboard.press("Escape"); // ends the chain, stays in the tool
  await expect(page.getByTestId("zc-ctx-roads")).toBeVisible();
  await page.getByTestId("zc-rt-street").click();
  for (const dx of [70, 150]) {
    await click(dx, -50);
    await click(dx, 50);
    await page.keyboard.press("Escape");
  }
  expect((await state(page)).roads).toBeGreaterThanOrEqual(7);
  await page.getByRole("button", { name: "Undo" }).click();
  const undone = (await state(page)).roads;
  await page.getByRole("button", { name: "Redo" }).click();
  expect((await state(page)).roads).toBeGreaterThan(undone);

  // Zoning: LINE drags beside the avenue (mirrored) and the streets; on touch, SINGLE taps lot by lot.
  await page.getByTestId("zc-tab-zoning").click();
  if (touch) {
    await page.getByTestId("zc-zm-single").click();
    for (let dx = 12; dx < 215; dx += 20) await click(dx, 14);
    await page.getByTestId("zc-zone-C").click();
    for (let dx = 12; dx < 215; dx += 20) await click(dx, -14);
  } else {
    await drag(5, 14, 215, 14);
    await page.getByTestId("zc-zone-C").click();
    for (const dx of [70, 150]) await drag(dx + 14, -45, dx + 14, 45);
  }
  await page.waitForTimeout(600);
  expect((await state(page)).lots).toBeGreaterThan(touch ? 8 : 20);

  // Growth at 3×: people move in, and cars and pedestrians appear.
  await page.getByTestId("zc-tab-zoning").click();
  await page.getByTestId("zc-speed-3").click();
  await expect.poll(async () => (await state(page)).population, { timeout: 120_000, intervals: [2000] }).toBeGreaterThan(50);
  await expect.poll(async () => (await state(page)).cars, { timeout: 60_000, intervals: [2000] }).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test("Zero City Mayor mode: a real treasury, refunds on undo, taxes, the council, a dilemma and election night", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "the desktop run covers Mayor mode; the touch path is covered above");
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_TUNNEL|Failed to load resource|supabase/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
  });
  await page.goto("/games/zero-city?zc=test");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("zc-menu")).toBeVisible({ timeout: 90_000 });
  await hook(page, (zc) => zc.quality("low"));
  await page.getByTestId("zc-new").click();
  await page.getByTestId("zc-mode-mayor").click();
  await expect(page.getByTestId("zc-mode-desc")).toContainText("election");
  await page.getByTestId("zc-start").click();
  await expect(page.getByTestId("zc-treasury")).toBeVisible({ timeout: 90_000 });
  type S = { cash: number; spent: number; population: number; policies: string[]; term: number; gameMode: string };
  const st = () => page.evaluate(() => (window as unknown as { __zc: { debugState: () => S } }).__zc.debugState());
  expect((await st()).cash).toBe(80_000);

  // Building costs money; undo gives it back; redo charges again.
  const end = await hook(page, (zc) => zc.gateEnd());
  await page.evaluate(([x, z]) => (window as unknown as { __zc: ZC }).__zc.look(x + 110, z + 45, 300, 1.0, 0), [end.x, end.z]);
  await page.waitForTimeout(600);
  const tap = async (dx: number, dz: number) => {
    const p = await page.evaluate(([x, z]) => (window as unknown as { __zc: ZC }).__zc.screenOf(x, z), [end.x + dx, end.z + dz]);
    await page.mouse.move(p!.x, p!.y, { steps: 3 });
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(150);
  };
  await page.getByTestId("zc-tab-roads").click();
  await page.getByTestId("zc-rt-avenue").click();
  await tap(0, 0);
  await tap(220, 0);
  await page.keyboard.press("Escape");
  const built = await st();
  expect(built.cash).toBeLessThan(80_000 - 4_000);
  expect(built.spent).toBe(80_000 - built.cash);
  await page.getByRole("button", { name: "Undo" }).click();
  expect((await st()).cash).toBe(80_000);
  await page.getByRole("button", { name: "Redo" }).click();
  expect((await st()).cash).toBe(built.cash);

  // Zone both sides and let people move in.
  await page.getByTestId("zc-tab-zoning").click();
  await page.getByTestId("zc-zm-single").click();
  for (let dx = 12; dx < 215; dx += 20) await tap(dx, 14);
  await page.getByTestId("zc-zone-C").click();
  for (let dx = 12; dx < 215; dx += 20) await tap(dx, -14);
  await page.getByTestId("zc-tab-zoning").click();
  await page.getByTestId("zc-speed-3").click();
  await expect.poll(async () => (await st()).population, { timeout: 120_000, intervals: [2000] }).toBeGreaterThan(40);

  // City Hall: approval, taxes, a bill before the council.
  await page.getByTestId("zc-hall").click();
  await expect(page.getByTestId("zc-overall")).toBeVisible();
  await page.getByTestId("zc-ph-budget").click();
  await page.getByTestId("zc-tax-R").fill("15");
  await expect(page.getByTestId("zc-tax-R-value")).toHaveText("15%");
  await page.getByTestId("zc-ph-policies").click();
  await page.getByTestId("zc-pol-freeTransit-go").click();
  await expect(page.getByTestId("zc-bill")).toBeVisible();
  await page.getByTestId("zc-ph-council").click();
  await expect(page.getByTestId("zc-council")).toBeVisible();
  await page.getByTestId("zc-ph-overview").click();
  await page.getByTestId("zc-pr-transit").click();
  await expect(page.getByTestId("zc-promise")).toBeVisible();
  await page.getByTestId("zc-hall-close").click();

  // A dilemma lands on the desk; answer it.
  await hook(page, (zc) => (zc as unknown as { debugPolitics: (w: string) => void }).debugPolitics("dilemma"));
  await expect(page.getByTestId("zc-dilemma")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("zc-dilemma-a").click();
  await expect(page.getByTestId("zc-dilemma")).toBeHidden();

  // Election night.
  await hook(page, (zc) => (zc as unknown as { debugPolitics: (w: string) => void }).debugPolitics("election"));
  await expect(page.getByTestId("zc-election")).toBeVisible({ timeout: 90_000 });
  const won = (await page.getByTestId("zc-election-result").textContent()) === "Re-elected!";
  await page.getByTestId("zc-election-go").click();
  await expect(page.getByTestId("zc-election")).toBeHidden();
  const after = await st();
  if (won) expect(after.term).toBe(2);
  else expect(after.gameMode).toBe("sandbox");

  expect(errors).toEqual([]);
});

test("Zero City Metropolis update: milestones, landmarks, fires, info views and quiet zone plots at night", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "covered on desktop");
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_TUNNEL|Failed to load resource|supabase/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
  });
  await page.goto("/games/zero-city?zc=test");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("zc-menu")).toBeVisible({ timeout: 90_000 });
  await hook(page, (zc) => zc.quality("low"));
  await page.getByTestId("zc-new").click();
  await page.getByTestId("zc-start").click();
  await expect(page.getByTestId("zc-hud")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("zc-milestone")).toHaveAttribute("aria-label", /Hamlet/);

  const end = await hook(page, (zc) => zc.gateEnd());
  await page.evaluate(([x, z]) => (window as unknown as { __zc: ZC }).__zc.look(x + 110, z + 45, 300, 1.0, 0), [end.x, end.z]);
  await page.waitForTimeout(800);
  const pt = async (dx: number, dz: number) => (await page.evaluate(([x, z]) => (window as unknown as { __zc: ZC }).__zc.screenOf(x, z), [end.x + dx, end.z + dz]))!;
  const click = async (dx: number, dz: number) => {
    const p = await pt(dx, dz);
    await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(150);
  };
  const drag = async (ax: number, az: number, bx: number, bz: number) => {
    const a = await pt(ax, az);
    const b = await pt(bx, bz);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  };
  await page.getByTestId("zc-tab-roads").click();
  await page.getByTestId("zc-rt-avenue").click();
  await click(0, 0);
  await click(220, 0);
  await page.keyboard.press("Escape");
  await page.getByTestId("zc-tab-zoning").click();
  // Homes on both sides (MIRROR is on).
  await drag(5, 14, 215, 14);
  await page.getByTestId("zc-tab-zoning").click();
  await page.getByTestId("zc-speed-3").click();
  await expect.poll(async () => (await state(page)).population, { timeout: 120_000, intervals: [2000] }).toBeGreaterThan(20);

  // Landmarks are locked until the city grows; reaching a milestone unlocks them.
  await page.getByTestId("zc-tab-build").click();
  await expect(page.getByTestId("zc-svc-hospital")).toHaveAttribute("aria-label", /Town/);
  await hook(page, (zc) => (zc as unknown as { debugBestPop: (n: number) => void }).debugBestPop(30_000));
  await expect(page.getByTestId("zc-milestone")).toHaveAttribute("aria-label", /^Metropolis/);
  await expect(page.getByTestId("zc-svc-hospital")).toHaveAttribute("aria-label", "Hospital");
  await expect(page.getByTestId("zc-svc-tower")).toHaveAttribute("aria-label", "Landmark tower");

  // A fire: a toast, flames, and the notice.
  await page.getByTestId("zc-speed-1").click();
  expect(await hook(page, (zc) => (zc as unknown as { debugFire: () => boolean }).debugFire())).toBe(true);
  await expect(page.locator("text=/Fire on/").first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => ((await state(page)) as unknown as { fires: number }).fires, { timeout: 15_000 }).toBeGreaterThan(0);
  if (process.env.ZC_SHOTS) await page.getByTestId("zero-city").screenshot({ path: `${process.env.ZC_SHOTS}/31-fire.png` });

  // Info views in the Land tab.
  await page.getByTestId("zc-tab-land").click();
  for (const v of ["services", "pollution", "fire", "value"]) {
    await page.getByTestId(`zc-iv-${v}`).click();
    await expect(page.getByTestId(`zc-iv-${v}`)).toHaveAttribute("aria-pressed", "true");
  }
  if (process.env.ZC_SHOTS) await page.getByTestId("zero-city").screenshot({ path: `${process.env.ZC_SHOTS}/32-land.png` });
  await page.getByTestId("zc-tab-land").click();

  // Night: empty plots are quiet outlines, not glowing slabs.
  await hook(page, (zc) => {
    const e = (zc as unknown as { engine: { setTime: (m: number) => void } }).engine;
    const set = e.setTime.bind(e);
    e.setTime = () => set(4 * 60 + 59);
  });
  await page.waitForTimeout(1500);
  if (process.env.ZC_SHOTS) await page.getByTestId("zero-city").screenshot({ path: `${process.env.ZC_SHOTS}/33-night.png` });
  expect(errors).toEqual([]);
});

test("Zero City 0.8: the Riviera DLC for ZX Cash, roadworks and the parliament", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "covered on desktop");
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_TUNNEL|Failed to load resource|supabase/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
  });
  await page.goto("/games/zero-city?zc=test");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("zc-menu")).toBeVisible({ timeout: 90_000 });
  await hook(page, (zc) => zc.quality("low"));
  type S = { roadCondition: number; roadworks: number; dlc: boolean; look: string; services: string[]; parl: { seats: Record<string, number>; coalition: string[]; capital: number } | null };
  const st = () => page.evaluate(() => (window as unknown as { __zc: { debugState: () => S } }).__zc.debugState());

  // Riviera maps are locked: their Start button opens the store instead.
  await expect(page.getByTestId("zc-dlc")).toContainText("50 ZX Cash");
  await page.getByTestId("zc-new").click();
  await expect(page.getByTestId("zc-dlcbadge-riviera-coast")).toBeVisible();
  await page.getByTestId("zc-map-riviera-coast").click();
  await expect(page.getByTestId("zc-start")).toHaveText(/Unlock for 50 ZX Cash/i);
  await page.getByTestId("zc-start").click();
  await expect(page.getByTestId("zc-dlcsheet")).toBeVisible();
  if (process.env.ZC_SHOTS) await page.getByTestId("zero-city").screenshot({ path: `${process.env.ZC_SHOTS}/40-dlc.png` });

  // Buy it with ZX Cash (the guest wallet here): the maps open up.
  await page.getByTestId("zc-dlc-buy").click();
  await expect(page.getByTestId("zc-dlc-play")).toBeVisible({ timeout: 15_000 });
  expect((await st()).dlc).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("zx-season-s1") ?? "{}").purchases)).toContain("unlock:zero-city-riviera");
  await page.getByTestId("zc-dlc-play").click();
  await page.getByTestId("zc-map-riviera-coast").click();
  await page.getByTestId("zc-mode-mayor").click();
  await expect(page.getByTestId("zc-start")).toHaveText(/start/i);
  await page.getByTestId("zc-start").click();
  await expect(page.getByTestId("zc-treasury")).toBeVisible({ timeout: 90_000 });
  expect((await st()).look).toBe("riviera");

  // The Riviera landmarks are on the build bar and ready.
  await page.getByTestId("zc-tab-build").click();
  await expect(page.getByTestId("zc-dlc-row")).toBeVisible();
  await expect(page.getByTestId("zc-svc-marina")).toHaveAttribute("aria-label", "Marina");
  await expect(page.getByTestId("zc-svc-depot")).toBeVisible();
  await page.getByTestId("zc-tab-build").click();

  // Roadworks: worn roads show on the Road condition view; the Repair tool orders works.
  await hook(page, (zc) => (zc as unknown as { debugWear: (c: number) => void }).debugWear(0.2));
  await expect.poll(async () => (await st()).roadCondition, { timeout: 15_000 }).toBeLessThan(0.5);
  await page.getByTestId("zc-tab-land").click();
  await page.getByTestId("zc-iv-roads").click();
  await expect(page.getByTestId("zc-iv-roads")).toHaveAttribute("aria-pressed", "true");
  if (process.env.ZC_SHOTS) await page.getByTestId("zero-city").screenshot({ path: `${process.env.ZC_SHOTS}/41-roads.png` });
  await page.getByTestId("zc-tab-land").click();
  await page.getByTestId("zc-tab-roads").click();
  await page.getByTestId("zc-dm-repair").click();
  const end = await hook(page, (zc) => zc.gateEnd());
  await page.evaluate(([x, z]) => (window as unknown as { __zc: ZC }).__zc.look(x, z, 260, 1.0, 0), [end.x, end.z]);
  await page.waitForTimeout(800);
  // Click the end of the highway: it sends a crew.
  const p = await page.evaluate(([x, z]) => (window as unknown as { __zc: ZC }).__zc.screenOf(x, z), [end.x, end.z]);
  await page.mouse.move(p!.x, p!.y, { steps: 3 });
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator("text=/Repair crew sent/").first()).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => (await st()).roadworks, { timeout: 15_000 }).toBeGreaterThan(0);
  if (process.env.ZC_SHOTS) await page.getByTestId("zero-city").screenshot({ path: `${process.env.ZC_SHOTS}/42-roadworks.png` });
  await page.keyboard.press("Escape");

  // Parliament: seats and a government, a law on the floor, lobbying and a vote.
  const parl = (await st()).parl!;
  expect(Object.values(parl.seats).reduce((a, b) => a + b, 0)).toBe(15);
  await page.getByTestId("zc-hall").click();
  await page.getByTestId("zc-ph-council").click();
  await expect(page.getByTestId("zc-gov")).toBeVisible();
  await expect(page.getByTestId("zc-council")).toBeVisible();
  await page.getByTestId("zc-ph-policies").click();
  await page.getByTestId("zc-pol-roadFund-go").click();
  await expect(page.getByTestId("zc-bill")).toBeVisible();
  await expect(page.getByTestId("zc-forecast")).toContainText(/Forecast/);
  const lobby = page.locator('[data-testid^="zc-lobby-"]:not([disabled])').first();
  if (await lobby.count()) await lobby.click();
  if (process.env.ZC_SHOTS) await page.getByTestId("zero-city").screenshot({ path: `${process.env.ZC_SHOTS}/43-parliament.png` });
  await page.getByTestId("zc-bill-vote").click();
  await expect(page.getByTestId("zc-bill-result")).toBeVisible();
  // The cabinet: appoint a finance minister.
  await page.getByTestId("zc-ph-cabinet").click();
  await expect(page.getByTestId("zc-min-finance")).toBeVisible();
  const sel = page.getByTestId("zc-appoint-finance");
  if (await sel.isEnabled()) {
    const v = await sel.locator("option").nth(1).getAttribute("value");
    await sel.selectOption(v!);
    await expect(page.getByTestId("zc-min-finance")).toContainText(/Skill/);
  }
  if (process.env.ZC_SHOTS) await page.getByTestId("zero-city").screenshot({ path: `${process.env.ZC_SHOTS}/44-cabinet.png` });
  await page.getByTestId("zc-hall-close").click();
  expect(errors).toEqual([]);
});

test("Zero City 0.9: Mandate, the politics app: districts, party, chamber, laws, cabinet, polls, campaign and the papers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "covered on desktop");
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_TUNNEL|Failed to load resource|supabase/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
  });
  await page.goto("/games/zero-city?zc=test");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("zc-menu")).toBeVisible({ timeout: 90_000 });
  await hook(page, (zc) => zc.quality("low"));
  await page.getByTestId("zc-new").click();
  await page.getByTestId("zc-mode-mayor").click();
  await page.getByTestId("zc-start").click();
  await expect(page.getByTestId("zc-treasury")).toBeVisible({ timeout: 90_000 });
  type S = { population: number; mandate: { districts: number; funds: number; roster: number; news: number; hq: Record<string, number> } };
  const st = () => page.evaluate(() => (window as unknown as { __zc: { debugState: () => S } }).__zc.debugState());

  // A small town: an avenue with streets across it, zoned on both sides.
  await page.evaluate(() => {
    const g = (window as unknown as { __zc: { city: { addRoad: (p: number[], t: string) => void; roads: { edges: Map<number, { id: number; type: string; pts: number[] }> }; paint: (e: number, side: number, s0: number, s1: number, o: object, m: boolean) => void }; worldChanged: () => void; gateEnd: () => { x: number; z: number } } }).__zc;
    const e = g.gateEnd();
    g.city.addRoad([e.x, e.z, e.x + 420, e.z], "avenue");
    for (const dx of [100, 210, 320]) g.city.addRoad([e.x + dx, e.z - 140, e.x + dx, e.z + 140], "street");
    const zones = ["R", "C", "R", "I"];
    let k = 0;
    for (const ed of [...g.city.roads.edges.values()]) if (ed.type !== "highway") for (const side of [1, -1]) g.city.paint(ed.id, side, 0, 1e6, { zone: zones[k++ % 4], width: 2, depth: 3, mixed: true }, false);
    g.worldChanged();
  });
  await page.getByTestId("zc-speed-3").click();
  await expect.poll(async () => (await st()).mandate.districts, { timeout: 120_000, intervals: [2000] }).toBeGreaterThan(1);

  // Open the app from the top bar: the briefing.
  await page.getByTestId("md-open").click();
  await expect(page.getByTestId("md-app")).toBeVisible();
  await expect(page.getByTestId("md-page-home")).toBeVisible();
  await expect(page.getByTestId("md-hemicycle")).toBeVisible();
  await expect(page.getByTestId("md-todo")).toBeVisible();
  const shot = async (name: string) => {
    if (process.env.ZC_SHOTS) await page.getByTestId("zero-city").screenshot({ path: `${process.env.ZC_SHOTS}/${name}.png` });
  };
  await shot("50-home");

  // The map: pick a district, canvass it, send someone to work it.
  await page.getByTestId("md-nav-map").click();
  await expect(page.getByTestId("md-map")).toBeVisible();
  await expect(page.getByTestId("md-district")).toBeVisible();
  await shot("51a-map-top");
  const funds0 = (await st()).mandate.funds;
  await page.getByTestId("md-canvass").click();
  expect((await st()).mandate.funds).toBeLessThan(funds0);
  await page.getByTestId("md-send").selectOption({ index: 1 });
  await shot("51-map");

  // The party: recruit, upgrade headquarters, the compass.
  await page.getByTestId("md-nav-party").click();
  const roster0 = (await st()).mandate.roster;
  await page.getByTestId("md-recruit").click();
  expect((await st()).mandate.roster).toBe(roster0 + 1);
  await page.getByTestId("md-hq-pollster-up").click();
  expect((await st()).mandate.hq.pollster).toBe(1);
  await expect(page.getByTestId("md-compass")).toBeVisible();
  await shot("52-party");

  // Laws → the chamber: put a law on the floor, whip, vote.
  await page.getByTestId("md-nav-laws").click();
  await page.getByTestId("md-law-roadFund-go").click();
  await expect(page.getByTestId("md-page-chamber")).toBeVisible();
  await expect(page.getByTestId("md-bill")).toBeVisible();
  await expect(page.getByTestId("md-forecast")).toContainText(/Forecast/);
  await shot("53a-chamber-top");
  await page.getByTestId("md-whip").click();
  await shot("53-chamber");
  await page.getByTestId("md-vote").click();
  await expect(page.getByTestId("zc-bill-result")).toBeVisible();

  // The cabinet: appoint one of your own.
  await page.getByTestId("md-nav-cabinet").click();
  await page.getByTestId("md-appoint-finance").selectOption({ index: 1 });
  await expect(page.getByTestId("md-min-finance")).toContainText(/Skill/);
  await shot("54-cabinet");

  // Polls, the campaign and the papers.
  await page.getByTestId("md-nav-polls").click();
  await expect(page.getByTestId("md-polls")).toBeVisible();
  await shot("55-polls");
  await page.getByTestId("md-compass").scrollIntoViewIfNeeded();
  await shot("55b-compass");
  await page.getByTestId("md-nav-campaign").click();
  await expect(page.getByTestId("md-ground")).toBeVisible();
  await shot("56-campaign");
  await page.getByTestId("md-nav-news").click();
  await expect(page.getByTestId("md-news")).toContainText(/Herald/);
  expect((await st()).mandate.news).toBeGreaterThan(2);
  await shot("57-news");

  // Esc takes you back to the city.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("md-app")).toBeHidden();
  expect(errors).toEqual([]);
});

test("Zero City 1.0: Statecraft: budget, decrees, lobbies, press, opposition, factions, crises and legacy", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "covered on desktop");
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_TUNNEL|Failed to load resource|supabase/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
  });
  await page.goto("/games/zero-city?zc=test");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("zc-menu")).toBeVisible({ timeout: 90_000 });
  await hook(page, (zc) => zc.quality("low"));
  await page.getByTestId("zc-new").click();
  await page.getByTestId("zc-mode-mayor").click();
  await page.getByTestId("zc-start").click();
  await expect(page.getByTestId("zc-treasury")).toBeVisible({ timeout: 90_000 });
  type S = { population: number; mandate: { districts: number; news: number }; parl: { capital: number }; statecraft: { budgetDue: boolean; budgetsPassed: number; levels: Record<string, number>; decrees: string[]; unions: number; pressHeld: number; press: boolean; bills: number; crisis: string | null; record: Record<string, number>; unlocked: string[] } };
  const st = () => page.evaluate(() => (window as unknown as { __zc: { debugState: () => S } }).__zc.debugState());

  // A small town: an avenue with streets across it, zoned on both sides.
  await page.evaluate(() => {
    const g = (window as unknown as { __zc: { city: { addRoad: (p: number[], t: string) => void; roads: { edges: Map<number, { id: number; type: string; pts: number[] }> }; paint: (e: number, side: number, s0: number, s1: number, o: object, m: boolean) => void }; worldChanged: () => void; gateEnd: () => { x: number; z: number } } }).__zc;
    const e = g.gateEnd();
    g.city.addRoad([e.x, e.z, e.x + 420, e.z], "avenue");
    for (const dx of [100, 210, 320]) g.city.addRoad([e.x + dx, e.z - 140, e.x + dx, e.z + 140], "street");
    const zones = ["R", "C", "R", "I"];
    let k = 0;
    for (const ed of [...g.city.roads.edges.values()]) if (ed.type !== "highway") for (const side of [1, -1]) g.city.paint(ed.id, side, 0, 1e6, { zone: zones[k++ % 4], width: 2, depth: 3, mixed: true }, false);
    g.worldChanged();
  });
  await page.getByTestId("zc-speed-3").click();
  await expect.poll(async () => (await st()).mandate.districts, { timeout: 120_000, intervals: [2000] }).toBeGreaterThan(1);
  type G = { politics: { cash: number; parl: { capital: number }; x: { hour: number; budget: { due: boolean; dueAt: number; draft: object | null; levels: object }; opp: { nextBill: number }; crises: { active: object | null } } }; publishPolitics: () => void };
  const poke = (what: "budget" | "crisis" | "bill" | "capital") =>
    page.evaluate((w) => {
      const g = (window as unknown as { __zc: G }).__zc;
      const x = g.politics.x;
      const now = x.hour * 60;
      if (w === "budget") Object.assign(x.budget, { due: true, dueAt: now + 12 * 60, draft: { ...x.budget.levels } });
      if (w === "crisis") x.crises.active = { id: "strike", stage: "threat", until: now + 24 * 60 };
      if (w === "bill") x.opp.nextBill = 0;
      if (w === "capital") {
        g.politics.parl.capital = 100;
        g.politics.cash = Math.max(g.politics.cash, 100_000);
      }
      g.publishPolitics();
    }, what);
  const shot = async (name: string) => {
    if (process.env.ZC_SHOTS) await page.getByTestId("zero-city").screenshot({ path: `${process.env.ZC_SHOTS}/${name}.png` });
  };
  await poke("capital");
  await poke("bill");
  await page.getByTestId("md-open").click();
  await expect(page.getByTestId("md-app")).toBeVisible();

  // Budget Day: cut finance, boost safety, put it to the vote.
  await poke("budget");
  await page.getByTestId("md-nav-budget").click();
  await expect(page.getByTestId("bg-depts")).toBeVisible();
  await page.getByTestId("bg-safety-3").click();
  await page.getByTestId("bg-culture-1").click();
  await expect(page.getByTestId("bg-vote")).toBeVisible();
  await shot("60-budget");
  await page.getByTestId("bg-present").click();
  await expect.poll(async () => (await st()).statecraft.budgetDue || (await st()).statecraft.budgetsPassed > 0).toBe(true);

  // A decree.
  await page.getByTestId("md-nav-decrees").click();
  await page.getByTestId("dc-festival-go").click();
  await expect.poll(async () => (await st()).statecraft.decrees).toContain("festival");
  await shot("61-decrees");

  // Lobbies: meet the unions.
  await page.getByTestId("md-nav-lobbies").click();
  const unions0 = (await st()).statecraft.unions;
  await page.getByTestId("lb-unions-meet").click();
  await expect.poll(async () => (await st()).statecraft.unions).toBeGreaterThan(unions0);
  await shot("62-lobbies");

  // The press conference: three questions.
  await page.getByTestId("md-nav-media").click();
  await page.getByTestId("me-press-start").click();
  for (let i = 0; i < 3; i++) {
    await expect(page.getByTestId("me-answer-0")).toBeVisible();
    if (i === 0) await shot("63-press");
    await page.getByTestId(`me-answer-${i % 3}`).click();
  }
  await expect.poll(async () => (await st()).statecraft.pressHeld).toBe(1);
  await expect(page.getByTestId("me-debate")).toBeVisible();

  // The opposition: a bill of theirs to take a stance on.
  await page.getByTestId("md-nav-opposition").click();
  await expect.poll(async () => (await st()).statecraft.bills, { timeout: 60_000 }).toBeGreaterThan(0);
  await expect(page.getByTestId("op-bills").locator("[data-testid^=op-bill-]").first()).toBeVisible();
  await shot("64-opposition");

  // Factions and the legacy page.
  await page.getByTestId("md-nav-caucus").click();
  await expect(page.getByTestId("fc-unity")).toBeVisible();
  await shot("65-caucus");
  await page.getByTestId("md-nav-legacy").click();
  await expect(page.getByTestId("lg-title")).toContainText(/Mayor|Boss|Leader/);
  await expect(page.getByTestId("lg-achievements")).toBeVisible();
  await shot("66-legacy");

  // A crisis lands on the briefing: settle it.
  await poke("crisis");
  await page.getByTestId("md-nav-home").click();
  await expect(page.getByTestId("cr-card")).toBeVisible();
  await shot("67-crisis");
  await page.getByTestId("cr-opt-0").click();
  await expect.poll(async () => (await st()).statecraft.crisis).toBeNull();
  expect((await st()).statecraft.record.crisesResolved).toBe(1);
  expect((await st()).statecraft.record.decreesIssued).toBe(1);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("md-app")).toBeHidden();
  expect(errors).toEqual([]);
});
