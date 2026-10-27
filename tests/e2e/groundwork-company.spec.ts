import type { Page } from "@playwright/test";
import { dismissRotate, expect, test } from "./fixtures";

type GW = { s: { pieces: unknown[]; money: number } | null; view: { ready: boolean; rig: { goal: Cam; cur: Cam } } | null; co: { cash: number; day: number; active: unknown[]; props: unknown[]; crew: unknown[] } | null };
type Cam = { target: { set(a: number, b: number, c: number): void }; dist: number; yaw: number; pitch: number };
const gw = <T,>(page: Page, f: (g: GW) => T) => page.evaluate(`(${f.toString()})(window.__gw)`) as Promise<T>;

async function tap(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId("gw-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test("Groundwork company: win a tender, work the site, buy land and build on it, hire a crew", async ({ page }, info) => {
  test.setTimeout(480_000);
  const mobile = info.project.name === "mobile";
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_TUNNEL|Failed to load resource|supabase/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  if (!mobile) await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("zx-groundwork-prefs", JSON.stringify({ quality: "low" }));
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
  });
  await page.goto("/games/groundwork?gw");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);

  // Start a company.
  await page.getByTestId("gw-company").click({ timeout: 60_000 });
  await page.getByTestId("gw-co-name").fill("Brick & Mortar Ltd");
  await page.getByTestId("gw-co-start").click();
  await expect(page.getByTestId("gw-co-title")).toHaveText("Brick & Mortar Ltd");
  await expect(page.getByTestId("gw-co-cash")).toHaveText("$80,000");

  // Tender for the first job at the bottom of the range: that always beats the rivals.
  await page.getByTestId("gw-tab-contracts").click();
  await expect(page.getByTestId("gw-tender")).toHaveCount(6);
  const slider = page.getByTestId("gw-bid-price").first();
  await slider.evaluate((el: HTMLInputElement) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(el, el.min);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.getByTestId("gw-tender").first()).toContainText("100% to win");
  await page.getByTestId("gw-bid").first().click();
  await expect(page.getByTestId("gw-active")).toHaveCount(1);
  expect(await gw(page, (g) => g.co!.cash)).toBeGreaterThan(80_000);

  // On site: the contract's terms, and some paving laid on the company's money.
  await page.getByTestId("gw-go-site").click();
  await expect(page.getByTestId("gw-terms")).toBeVisible();
  await page.getByTestId("gw-close").click();
  await expect.poll(() => gw(page, (g) => !!g.view?.ready), { timeout: 120_000 }).toBe(true);
  await page.evaluate(() => {
    const g = (window as unknown as { __gw: GW }).__gw;
    for (const k of [g.view!.rig.goal, g.view!.rig.cur]) {
      k.target.set(0, 0, 0);
      k.dist = 9;
      k.yaw = 0;
      k.pitch = 1.2;
    }
  });
  await page.waitForTimeout(1500);
  const cash = await gw(page, (g) => g.s!.money);
  await page.getByTestId("gw-tool-pave").click();
  await page.getByTestId("gw-pattern-basket").click();
  await tap(page, 0.4, 0.3);
  await tap(page, 0.55, 0.42);
  await expect(page.getByTestId("gw-confirm")).toContainText("paver");
  await page.getByTestId("gw-build").click();
  await expect.poll(() => gw(page, (g) => g.s!.pieces.length)).toBeGreaterThan(10);
  expect(await gw(page, (g) => g.s!.money)).toBeLessThan(cash);

  // Paint the paving: pick it, then a finish.
  await page.getByTestId("gw-tool-paint").click();
  await tap(page, 0.47, 0.36);
  await page.getByTestId("gw-paint-2").click();
  await expect(page.getByTestId("gw-toast").last()).toContainText("Refinished");

  // Back to the office.
  await page.getByTestId("gw-quit").click();
  await expect(page.getByTestId("gw-office")).toBeVisible();
  expect(await gw(page, (g) => g.co!.cash)).toBeLessThan(cash);

  // Buy a block (with a top-up from the test hook: land isn't cheap) and visit it.
  await page.evaluate(() => {
    const g = (window as unknown as { __gw: GW & { bump(): void } }).__gw;
    g.co!.cash = 500_000;
    g.bump();
  });
  await page.getByTestId("gw-tab-property").click();
  await page.getByTestId("gw-buy").first().click();
  await expect(page.getByTestId("gw-prop")).toHaveCount(1);
  await page.getByTestId("gw-prop-go").click();
  await expect(page.getByTestId("gw-panel-property")).toBeVisible();
  await expect(page.getByTestId("gw-valuation")).not.toHaveText("$0");
  await page.getByTestId("gw-to-office").click();
  await expect(page.getByTestId("gw-office")).toBeVisible();

  // Hire someone, borrow, and let a week go by.
  await page.getByTestId("gw-tab-crew").click();
  await page.getByTestId("gw-hire-btn").first().click();
  await expect(page.getByTestId("gw-worker")).toHaveCount(1);
  await page.getByTestId("gw-tab-bank").click();
  await page.getByTestId("gw-borrow-10000").click();
  await expect(page.getByTestId("gw-loan")).toHaveText("$10,000");
  const day = await gw(page, (g) => g.co!.day);
  await page.getByTestId("gw-skip-week").click();
  expect(await gw(page, (g) => g.co!.day)).toBe(day + 7);

  // It all survives a reload.
  await page.reload();
  // Membership is remembered.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(page.getByTestId("gw-company")).toContainText("Brick & Mortar Ltd", { timeout: 60_000 });
  expect(await gw(page, (g) => [g.co!.active.length, g.co!.props.length, g.co!.crew.length])).toEqual([1, 1, 1]);

  expect(errors).toEqual([]);
});
