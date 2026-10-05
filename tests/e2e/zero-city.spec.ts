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
  await expect(page.locator('[data-testid^="zc-map-"]:not([data-testid="zc-map-detail"])')).toHaveCount(10);
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
