import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** Run a snippet against the controller (`g`) and the simulation module (`sim`), exposed by `?hw`. */
const hw = <T,>(page: Page, body: string) => page.evaluate(`((g, sim) => ${body})(window.__hw, window.__hwsim)`) as Promise<T>;

async function open(page: Page, errors: string[]) {
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_TUNNEL|Failed to load resource|supabase/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
    localStorage.setItem("zx-heatwave-prefs", JSON.stringify({ quality: "low", volume: 0, music: 0 }));
  });
  await page.goto("/nextx/play/heatwave?hw");
  await expect(page.getByTestId("game-access")).toHaveText("ZLink+ exclusive");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("hw-title")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("hw-title")).toContainText("Nina Cruz");
  await page.getByTestId("hw-new").click();
  await expect(page.getByTestId("hw-hud")).toBeVisible({ timeout: 120_000 });
}

test("Heatwave: members only; a new game in Melbourne, the phone, a gun store, a car, the police and saving", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "the phone run below covers touch");
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 760 });
  const errors: string[] = [];
  await open(page, errors);
  await expect(page.getByTestId("hw-money")).toHaveText("$500");
  await expect(page.getByTestId("hw-where")).toContainText("Day 1");
  await expect(page.getByTestId("hw-wanted")).toHaveAttribute("aria-label", "Wanted level 0 of 5");

  // The phone: the map, the story jobs and the leads.
  await page.keyboard.press("KeyM");
  await expect(page.getByTestId("hw-phone")).toBeVisible();
  await expect(page.getByTestId("hw-map")).toBeVisible();
  await page.getByTestId("hw-tab-missions").click();
  await expect(page.getByTestId("hw-jobs")).toContainText("Knock-Off");
  await page.getByTestId("hw-tab-leads").click();
  await expect(page.getByTestId("hw-leads")).toContainText("Dex");
  await page.getByTestId("hw-phone-close").click();
  await expect(page.getByTestId("hw-phone")).toBeHidden();

  // Walk up to a gun store and buy a pistol.
  await hw(page, `(() => { g.s.money = 5000; const d = g.s.city.pois.find((x) => x.id === "gun-rich"); const p = sim.player(g.s); p.x = d.x; p.z = d.z; })()`);
  await expect(page.getByTestId("hw-shop")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("hw-shop")).toContainText("Bullseye Arms");
  await page.getByTestId("hw-buy-pistol").getByRole("button").click();
  await expect(page.getByTestId("hw-money")).toHaveText("$4,550", { timeout: 20_000 });
  await expect(page.getByTestId("hw-weapon")).toContainText("Pistol", { timeout: 20_000 });
  await page.getByTestId("hw-shop-close").click();
  await expect(page.getByTestId("hw-shop")).toBeHidden();

  // Get into Nina's car and drive off.
  await hw(page, `(() => { const c = g.s.cars.find((x) => x.tag === "ride-nina"); const p = sim.player(g.s); p.x = c.x - Math.sin(c.h) * 2.2; p.z = c.z + Math.cos(c.h) * 2.2; })()`);
  await page.keyboard.press("KeyF");
  await expect(page.getByTestId("hw-speed")).toBeVisible({ timeout: 20_000 });
  await page.keyboard.down("KeyW");
  await expect.poll(() => hw<number>(page, `sim.speedOf(sim.playerCar(g.s))`), { timeout: 60_000 }).toBeGreaterThan(2);
  await page.keyboard.up("KeyW");

  // The police: their stars show on the HUD.
  await hw(page, `(g.s.wanted.level = 2, g.s.wanted.seenAt = g.s.t)`);
  await expect(page.getByTestId("hw-wanted")).toHaveAttribute("aria-label", "Wanted level 2 of 5", { timeout: 20_000 });

  // Save and quit, and the title offers to carry on.
  await hw(page, `(g.s.wanted.level = 0)`);
  await page.keyboard.press("KeyM");
  await page.getByTestId("hw-tab-settings").click();
  await page.getByTestId("hw-quit").click();
  await expect(page.getByTestId("hw-continue")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("hw-continue").click();
  await expect(page.getByTestId("hw-hud")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("hw-money")).toHaveText("$4,550", { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test("Heatwave on a phone: landscape touch controls and the phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "touch layout");
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 915, height: 412 });
  const errors: string[] = [];
  await open(page, errors);
  await expect(page.getByTestId("hw-touch")).toBeVisible();
  await expect(page.getByTestId("hw-t-aim")).toBeVisible();
  // Nothing on the HUD hides under the platform's pause button.
  const pause = await page.getByRole("button", { name: "Pause game" }).boundingBox();
  const where = await page.getByTestId("hw-where").boundingBox();
  expect(pause && where && where.x >= pause.x + pause.width - 1).toBe(true);
  await page.getByTestId("hw-phone-btn").tap();
  await expect(page.getByTestId("hw-phone")).toBeVisible();
  await page.getByTestId("hw-tab-missions").tap();
  await expect(page.getByTestId("hw-jobs")).toContainText("Knock-Off");
  await page.getByTestId("hw-phone-close").tap();
  await expect(page.getByTestId("hw-phone")).toBeHidden();
  expect(errors).toEqual([]);
});
