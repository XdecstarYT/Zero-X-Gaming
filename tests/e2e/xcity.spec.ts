import type { Page } from "@playwright/test";
import { dismissRotate, expect, test } from "./fixtures";

type XC = {
  s: { districts: ({ use: string; pattern?: string } | null)[]; buildings: ({ city: boolean; done: boolean } | null)[]; apps: { id: number }[]; edges: ({ name: string } | null)[]; month: number; stats: { pop: number } };
};
const xc = <T,>(page: Page, f: (g: XC) => T) => page.evaluate(`(${f.toString()})(window.__xc)`) as Promise<T>;
const camera = (page: Page, x: number, z: number, dist: number, pitch: number) =>
  page.evaluate(
    ([x, z, dist, pitch]) => {
      const g = (window as unknown as { __xc: { view: { rig: { goal: Cam; cur: Cam } } } }).__xc;
      type Cam = { target: { set(a: number, b: number, c: number): void }; dist: number; yaw: number; pitch: number };
      for (const k of [g.view.rig.goal, g.view.rig.cur]) {
        k.target.set(x, 0, z);
        k.dist = dist;
        k.yaw = 0;
        k.pitch = pitch;
      }
    },
    [x, z, dist, pitch],
  );

/** Drag across the map from one fraction of the canvas to another. */
async function drag(page: Page, a: [number, number], b: [number, number]) {
  const box = (await page.getByTestId("xc-canvas").boundingBox())!;
  const p = (f: [number, number]) => ({ x: box.x + box.width * f[0], y: box.y + box.height * f[1] });
  const from = p(a);
  const to = p(b);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
  await page.mouse.up();
}

test("XCity: zone a neighbourhood, set its rules, design a building, review an application and save", async ({ page }, info) => {
  test.setTimeout(300_000);
  const mobile = info.project.name === "mobile";
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_TUNNEL|Failed to load resource|supabase/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  if (!mobile) await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => {
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
  });
  // A NextX title: it plays in the NextX app, for ZLink+ members.
  await page.goto("/games/xcity?xc");
  await expect(page).toHaveURL(/\/nextx\/play\/xcity/);
  await expect(page.getByTestId("game-access")).toHaveText("ZLink+ exclusive");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(page.getByTestId("xc-title")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("nextx-powered")).toBeVisible();
  // A sandbox world: politics off, plan from day one.
  await page.getByTestId("xc-new").click();
  await expect(page.getByTestId("xc-setup")).toBeVisible();
  await page.getByTestId("xc-politics-toggle").click();
  await page.getByTestId("xc-next").click();
  await page.getByTestId("xc-begin").click();
  await expect(page.getByTestId("xc-stat-pop")).toBeVisible();
  await expect(page.getByTestId("xc-date")).toContainText("January, Year 1");

  // Zone curvy streets of homes over the fields east of the village.
  await page.getByTestId("xc-tool-zone").click();
  await page.getByTestId("xc-use-homes").click();
  await page.getByTestId("xc-pattern-curvy").click();
  await camera(page, 700, 620, 1300, 1.3);
  await page.waitForTimeout(800);
  const before = await xc(page, (g) => g.s.districts.length);
  await drag(page, [0.25, 0.3], [0.75, 0.62]);
  await expect(page.getByTestId("xc-confirm")).toBeVisible();
  await page.getByTestId("xc-confirm-ok").click();
  await expect.poll(() => xc(page, (g) => g.s.districts.length)).toBeGreaterThan(before);
  expect(await xc(page, (g) => g.s.districts.some((d) => d?.pattern === "curvy" && d.use === "homes"))).toBe(true);

  // Its rules: no parking minimum.
  await page.getByTestId("xc-tool-inspect").click();
  await page.evaluate(() => {
    const g = (window as unknown as { __xc: { s: { districts: { pattern?: string }[] }; showDistrict(i: number): void } }).__xc;
    g.showDistrict(g.s.districts.findIndex((d) => d?.pattern === "curvy"));
  });
  await expect(page.getByTestId("xc-district")).toBeVisible();
  await page.getByTestId("xc-rules-tab").click();
  await page.getByTestId("xc-parking-0").click();
  await expect(page.getByTestId("xc-parking-0")).toHaveClass(/on/);
  await page.getByTestId("xc-close").click();

  // Design our own building on a house in the village: seven storeys with a roof terrace.
  await page.evaluate(() => {
    const g = (window as unknown as { __xc: { s: { lots: ({ id: number; bld: number } | null)[]; buildings: ({ form: string } | null)[] }; openDesigner(id: number, n: number): void } }).__xc;
    const l = g.s.lots.find((l) => l && l.bld >= 0 && g.s.buildings[l.bld]!.form === "house")!;
    g.openDesigner(l.id, 2);
  });
  await expect(page.getByTestId("xc-designer")).toBeVisible();
  await page.getByTestId("xc-storeys-7").click();
  await page.getByTestId("xc-roof-terrace").click();
  await page.getByTestId("xc-bay").click();
  await expect(page.getByTestId("xc-designer")).toContainText("7 storeys");
  await page.getByTestId("xc-build").click();
  await expect(page.getByTestId("xc-designer")).toHaveCount(0);
  expect(await xc(page, (g) => g.s.buildings.some((b) => b?.city && !b.done))).toBe(true);

  // A developer pitches a project: review it from the card, haggle, approve.
  const id = await page.evaluate(() => (window as unknown as { __xcPitch: () => number }).__xcPitch());
  expect(id).toBeGreaterThan(0);
  await expect(page.getByTestId("xc-app-toast")).toBeVisible();
  await page.getByTestId("xc-app-toast").getByRole("button", { name: "Review" }).click();
  await expect(page.getByTestId("xc-agenda")).toBeVisible();
  await expect(page.getByTestId(`xc-app-${id}`)).toContainText(/Planners lean (yes|no)/);
  await page.getByTestId(`xc-app-terms-${id}`).click();
  await page.getByTestId("xc-term-affordable").click();
  if (await page.getByTestId(`xc-app-approve-${id}`).count()) await page.getByTestId(`xc-app-approve-${id}`).click();
  await expect.poll(() => xc(page, (g) => g.s.apps.length)).toBe(0);
  await page.getByTestId("xc-close").click();

  // Lay a road by dragging, then paint bike lanes on it.
  await page.getByTestId("xc-tool-road").click();
  await page.getByTestId("xc-road-street").click();
  await camera(page, -1150, 600, 700, 1.35);
  await page.waitForTimeout(800);
  const roads = await xc(page, (g) => g.s.edges.filter(Boolean).length);
  await drag(page, [0.3, 0.3], [0.7, 0.3]);
  await expect.poll(() => xc(page, (g) => g.s.edges.filter(Boolean).length)).toBeGreaterThan(roads);

  // Fast-forward a few months: the clock runs and the city grows.
  await page.getByTestId("xc-speed-3").click();
  await expect.poll(() => xc(page, (g) => g.s.month), { timeout: 60_000 }).toBeGreaterThan(1);
  await page.getByTestId("xc-tool-city").click();
  await expect(page.getByTestId("xc-city")).toBeVisible();
  await page.getByTestId("xc-city-budget").click();
  await page.getByTestId("xc-city-travel").click();
  await page.getByTestId("xc-close").click();

  // Save and quit, then carry on.
  await page.getByTestId("xc-menu").click();
  await page.getByTestId("xc-quit").click();
  await expect(page.getByTestId("xc-continue")).toBeVisible();
  await page.getByTestId("xc-continue").click();
  await expect(page.getByTestId("xc-stat-pop")).toBeVisible();
  expect(await xc(page, (g) => g.s.districts.some((d) => d?.pattern === "curvy"))).toBe(true);
  expect(errors).toEqual([]);
});
