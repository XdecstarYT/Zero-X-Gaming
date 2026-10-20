import type { Page } from "@playwright/test";
import { dismissRotate, expect, test } from "./fixtures";

type SV = {
  s: { day: number; player: number; nations: { capital: number; justify: { target: number }[]; iso: string }[]; armies: { id: number; owner: number; kind: string; x: number; y: number; path: number[] }[] };
  world: { cities: { x: number; y: number; name: string; nation: number }[]; nations: { iso: string }[] };
  view: { toScreen(x: number, y: number): { x: number; y: number }; focus(x: number, y: number, z?: number): void; selected: Set<number> };
};
const sv = <T,>(page: Page, f: (g: SV) => T) => page.evaluate(`(${f.toString()})(window.__sv)`) as Promise<T>;

/** Tap (or click) a map point, in map px. */
async function tapMap(page: Page, x: number, y: number, mobile: boolean) {
  const pt = await page.evaluate(([mx, my]) => {
    const g = (window as unknown as { __sv: SV }).__sv;
    const r = document.querySelector("[data-testid=sv-canvas]")!.getBoundingClientRect();
    const sp = g.view.toScreen(mx, my);
    return { x: r.left + sp.x, y: r.top + sp.y };
  }, [x, y]);
  if (mobile) await page.touchscreen.tap(pt.x, pt.y);
  else await page.mouse.click(pt.x, pt.y);
}

test("Sovereign: pick a nation, build, train, move an army, justify a war and save", async ({ page }, info) => {
  test.setTimeout(240_000);
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
  await page.goto("/games/sovereign?sv");
  await expect(page).toHaveURL(/\/nextx\/play\/sovereign/);
  await expect(page.getByTestId("game-access")).toHaveText("ZLink+ exclusive");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(page.getByTestId("sv-new")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("nextx-powered")).toBeVisible();

  // Choose Australia from the list.
  await page.getByTestId("sv-new").click();
  await page.getByTestId("sv-search").fill("austral");
  await page.getByTestId("sv-pick-AUS").click();
  await page.getByTestId("sv-start").click();
  await expect(page.getByTestId("sv-money")).toBeVisible();
  expect(await sv(page, (g) => g.s.nations[g.s.player].iso)).toBe("AUS");
  // The world is drawn in 3D by the NextX Engine, under liquid glass.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __sv: { view: { is3D: boolean } } }).__sv.view.is3D), { timeout: 30_000 }).toBe(true);
  await page.getByTestId("sv-speed-0").click();

  // Open Sydney by tapping it, and build there.
  const syd = await sv(page, (g) => {
    const c = g.world.cities.find((x) => x.name === "Sydney")!;
    g.view.focus(c.x, c.y, 2.2);
    return { x: c.x, y: c.y };
  });
  await page.waitForTimeout(300);
  await tapMap(page, syd.x, syd.y, mobile);
  await expect(page.getByTestId("sv-city")).toContainText("Sydney");
  await page.getByTestId("sv-build-civilian").click();
  await expect(page.getByTestId("sv-city")).toContainText("Consumer factory → level");
  await page.getByTestId("sv-train-infantry").click();
  await expect(page.getByTestId("sv-city")).toContainText("Infantry");
  await page.getByRole("button", { name: "Close" }).first().click();

  // Select the army at Canberra by tapping its counter, then tap Melbourne to march there.
  const army = await sv(page, (g) => {
    const a = g.s.armies.find((x) => x.owner === g.s.player && x.kind === "infantry")!;
    g.view.focus(a.x, a.y, 2.2);
    return { id: a.id, x: a.x, y: a.y };
  });
  await page.waitForTimeout(300);
  await tapMap(page, army.x, army.y, mobile);
  await expect(page.getByTestId("sv-unitbar")).toBeVisible();
  const mel = await sv(page, (g) => {
    const c = g.world.cities.find((x) => x.name === "Melbourne")!;
    g.view.focus(c.x, c.y - 20);
    return c;
  });
  await page.waitForTimeout(200);
  await tapMap(page, mel.x, mel.y, mobile);
  expect(await sv(page, (g) => g.s.armies.filter((a) => a.owner === g.s.player).some((a) => a.path.length > 0))).toBe(true);

  // Run the clock.
  const day0 = await sv(page, (g) => g.s.day);
  await page.getByTestId("sv-speed-5").click();
  await page.waitForTimeout(2500);
  await page.getByTestId("sv-speed-0").click();
  expect(await sv(page, (g) => g.s.day)).toBeGreaterThan(day0 + 3);

  // The flat map is a tap away, and back.
  await page.getByTestId("sv-tab-world").click();
  await page.getByTestId("sv-map-flat").click();
  expect(await page.evaluate(() => (window as unknown as { __sv: { view: { is3D: boolean } } }).__sv.view.is3D)).toBe(false);
  await page.getByTestId("sv-map-3d").click();
  await page.getByTestId("sv-tab-world").click();

  // Every panel opens.
  for (const t of ["nation", "economy", "military", "diplomacy", "politics", "world"]) {
    await page.getByTestId(`sv-tab-${t}`).click();
    await expect(page.getByTestId(`sv-panel-${t}`)).toBeVisible();
  }
  // Diplomacy: look at Indonesia and justify a war.
  await page.getByTestId("sv-tab-diplomacy").click();
  await page.getByTestId("sv-panel-diplomacy").getByLabel("Search nations").fill("Indonesia");
  await page.getByTestId("sv-dip-IDN").click();
  await expect(page.getByTestId("sv-nation")).toContainText("Indonesia");
  await page.getByTestId("sv-justify").click();
  await expect(page.getByTestId("sv-nation")).toContainText("Justifying a war");

  // Save and quit: the title offers Continue.
  await page.getByTestId("sv-tab-nation").click();
  await page.getByRole("button", { name: "Save and quit" }).click();
  await expect(page.getByTestId("sv-continue")).toBeVisible();
  await page.getByTestId("sv-continue").click();
  await expect(page.getByTestId("sv-money")).toBeVisible();
  expect(errors).toEqual([]);
});
