import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.use({ viewport: { width: 1400, height: 900 } });

type LL = {
  debugState: () => { screen: string; cash: number; jobs: number; crates: number; staff: number; patients: number; treated: number; rooms: { type: string; valid: boolean }[]; walls: number; objects: number };
  screenOf: (x: number, z: number) => { x: number; y: number } | null;
  look: (x: number, z: number, dist?: number, pitch?: number, yaw?: number) => void;
  fastForward: (h: number) => void;
  buildNow: () => void;
};
const ll = <T,>(page: Page, f: (g: LL) => T) => page.evaluate(`(${f.toString()})(window.__ll)`) as Promise<T>;
const shot = async (page: Page, name: string) => {
  if (process.env.LL_SHOTS) await page.getByTestId("lifeline").screenshot({ path: `${process.env.LL_SHOTS}/${name}.png` });
};

test("Lifeline: build a hospital from an empty plot, staff it, and treat patients with no console errors", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "the desktop run covers building; the menu is checked on mobile by the a11y pass");
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_TUNNEL|Failed to load resource|supabase/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/games/lifeline?ll");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("ll-menu")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1200);
  await shot(page, "01-menu");

  // An empty plot: lay a foundation by dragging.
  await page.getByTestId("ll-new").click();
  await expect(page.getByTestId("ll-hud")).toBeVisible();
  const start = await ll(page, (g) => g.debugState());
  expect(start.staff).toBe(2);
  await ll(page, (g) => g.look(20, 26, 46, 1.2, 0));
  await page.waitForTimeout(500);
  await page.getByTestId("ll-cat-build").click();
  await page.getByTestId("ll-t-foundation").click();
  const a = (await ll(page, (g) => g.screenOf(12, 20)))!;
  const b = (await ll(page, (g) => g.screenOf(24, 30)))!;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await expect(page.getByTestId("ll-cursor")).toContainText("13 × 11");
  await page.mouse.up();
  const planned = await ll(page, (g) => g.debugState());
  expect(planned.jobs).toBeGreaterThan(100);
  expect(planned.cash).toBeLessThan(start.cash);
  await page.keyboard.press("Escape");
  // The truck brings materials and the workmen start building.
  await ll(page, (g) => g.fastForward(3));
  await page.waitForTimeout(600);
  await shot(page, "02-building");
  const mid = await ll(page, (g) => g.debugState());
  expect(mid.jobs).toBeLessThan(planned.jobs);

  // A door, rooms and furniture.
  await ll(page, (g) => g.buildNow());
  // The build tray is still open (Esc only put the tool down).
  await page.getByTestId("ll-t-door").click();
  const d = (await ll(page, (g) => g.screenOf(18, 30)))!;
  await page.mouse.click(d.x, d.y);
  await page.getByTestId("ll-cat-rooms").click();
  await page.getByTestId("ll-r-reception").click();
  const r0 = (await ll(page, (g) => g.screenOf(13, 21)))!;
  const r1 = (await ll(page, (g) => g.screenOf(23, 29)))!;
  await page.mouse.move(r0.x, r0.y);
  await page.mouse.down();
  await page.mouse.move(r1.x, r1.y, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId("ll-cat-objects").click();
  await page.getByTestId("ll-oc-furniture").click();
  await page.getByTestId("ll-o-receptionDesk").click();
  const desk = (await ll(page, (g) => g.screenOf(18, 24)))!;
  await page.mouse.click(desk.x, desk.y);
  await page.getByTestId("ll-o-chair").click();
  const chair = (await ll(page, (g) => g.screenOf(18, 23)))!;
  await page.mouse.click(chair.x, chair.y);
  await page.keyboard.press("Escape");
  await ll(page, (g) => g.buildNow());
  await ll(page, (g) => g.fastForward(0.2));
  const built = await ll(page, (g) => g.debugState());
  expect(built.objects).toBe(2);
  expect(built.rooms.find((r) => r.type === "reception")?.valid).toBe(true);
  await ll(page, (g) => g.look(18, 25, 22, 0.9, 0.4));
  await page.waitForTimeout(800);
  await shot(page, "03-reception");

  // Hire from the Staff panel; panels open and close.
  await page.getByTestId("ll-panel-staff").click();
  await page.getByTestId("ll-hire2-receptionist").click();
  await expect(page.getByTestId("ll-staff")).toContainText("Receptionist");
  await page.getByTestId("ll-panel-grants").click();
  await expect(page.getByTestId("ll-grant-opening")).toBeVisible();
  await page.getByTestId("ll-panel-reports").click();
  await expect(page.getByTestId("ll-bank")).toBeVisible();
  await page.keyboard.press("Escape");
  expect((await ll(page, (g) => g.debugState())).staff).toBe(3);
  expect(errors).toEqual([]);
});

test("Lifeline: the small starter hospital treats patients, and the game saves and continues", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "covered on desktop");
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/games/lifeline?ll");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("ll-menu")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("ll-starter").click();
  await page.getByTestId("ll-cat-staff").click();
  for (const r of ["receptionist", "doctor", "nurse", "nurse", "janitor"]) await page.getByTestId(`ll-hire-${r}`).click();
  await ll(page, (g) => g.fastForward(20));
  await page.getByTestId("ll-speed-2").click();
  await ll(page, (g) => g.look(18, 27, 34, 1.0, 0.3));
  await page.waitForTimeout(1500);
  await shot(page, "04-starter");
  const s = await ll(page, (g) => g.debugState());
  expect(s.treated).toBeGreaterThan(2);
  await expect(page.getByTestId("ll-score")).toContainText(String(s.treated).slice(0, 1));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId("ll-menu-btn").click();
  await expect(page.getByTestId("ll-continue")).toBeVisible();
  await page.getByTestId("ll-continue").click();
  await expect(page.getByTestId("ll-hud")).toBeVisible();
  expect((await ll(page, (g) => g.debugState())).treated).toBeGreaterThanOrEqual(s.treated);
  expect(errors).toEqual([]);
});

test("Lifeline mega update: what's new, the campaign, research and follow cam", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "covered on desktop");
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_TUNNEL|Failed to load resource|supabase/i.test(m.text())) errors.push(m.text());
  });
  await page.goto("/games/lifeline?ll");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("ll-menu")).toBeVisible({ timeout: 60_000 });
  // The menu backdrop shows the new wing, with an air ambulance coming in.
  await ll(page, (g) => g.look(52, 22, 46, 0.95, 0.6));
  await page.waitForTimeout(5000);
  await shot(page, "10-wing");
  await page.getByTestId("ll-news").click();
  await expect(page.getByTestId("ll-news-list")).toContainText("Air ambulances");
  await page.getByRole("button", { name: "← Back" }).click();
  await page.getByTestId("ll-campaign").click();
  await expect(page.getByTestId("ll-scenarios").locator("li")).toHaveCount(5);
  await page.getByTestId("ll-sc-disaster").click();
  await expect(page.getByTestId("ll-scenario")).toContainText("Disaster response");
  // Research: pick a project.
  await page.getByTestId("ll-panel-research").click();
  await page.getByTestId("ll-rs-ergonomics").click();
  await expect(page.getByTestId("ll-research-current")).toContainText("Ergonomics");
  await page.keyboard.press("Escape");
  // Run the hospital, then follow a member of staff.
  await ll(page, (g) => g.fastForward(4));
  await page.getByTestId("ll-panel-staff").click();
  await page.getByTestId("ll-staff").locator("li button", { hasText: "Doctor ·" }).first().click();
  await expect(page.getByTestId("ll-inspector")).toContainText("Level");
  await page.getByTestId("ll-follow").click();
  await expect(page.getByTestId("ll-follow")).toHaveText("Following");
  await page.waitForTimeout(1500);
  await shot(page, "11-follow");
  expect(errors).toEqual([]);
});
