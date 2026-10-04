import type { Page } from "@playwright/test";
import { dismissRotate, expect, test } from "./fixtures";

test.use({ viewport: { width: 1100, height: 620 } });

type UB = {
  state: () => { mode: string; tier: string; open: boolean; cash: number; shoppers: { stage: string; basket: number }[]; today: { revenue: number; customers: number } };
  setSpeed: (n: number) => void;
  spawn: (n: number) => void;
  place: (x: number, z: number) => void;
};
const ub = (page: Page) => page.evaluate(() => (window as unknown as { __ubiz: UB }).__ubiz.state());

/** A guest with coins in their device save (the battle pass page's guest wallet). */
async function guestWith(page: Page, coins: number, hasPass = false) {
  await page.addInitScript(
    ([coins, hasPass]) => {
      if (!localStorage.getItem("zx-season-s1")) localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins, hasPass, purchases: [], challenges: {} }));
      localStorage.setItem("zx-ubusiness-prefs", JSON.stringify({ gfx: "low" }));
    },
    [coins, hasPass] as const,
  );
}

test("UBusiness: buy Lite, then upgrade to Ultimate for the difference", async ({ page }) => {
  await guestWith(page, 40);
  await page.goto("/games/ubusiness");
  const card = page.getByTestId("ubusiness-pass");
  await expect(card).toContainText("Lite");
  await expect(card).toContainText("Free with the battle pass");
  await page.getByTestId("ubusiness-buy-lite").click();
  await expect(card).toContainText("You own Lite");
  await expect(page.getByTestId("ubusiness-buy-ultimate")).toHaveText("Upgrade for 25 coins");
  await page.getByTestId("ubusiness-buy-ultimate").click();
  await expect(card).toHaveAttribute("data-tier", "ultimate");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("zx-season-s1")!).coins)).toBe(10);
});

test("UBusiness: the battle pass unlocks Ultimate for free", async ({ page }) => {
  await guestWith(page, 0, true);
  await page.goto("/games/ubusiness");
  await expect(page.getByTestId("ubusiness-pass")).toHaveAttribute("data-tier", "ultimate");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test("UBusiness Lite: open the doors, serve at the till, order stock, build, bank the score", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await guestWith(page, 10);
  await page.goto("/games/ubusiness");
  await page.getByTestId("ubusiness-buy-lite").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  const stage = page.getByTestId("game-stage");
  await stage.getByTestId("ub-name").fill("Test Mart");
  await stage.getByTestId("ub-new").click();
  await expect(stage.getByTestId("ub-cash")).toHaveText("$3,000.00", { timeout: 60_000 });
  expect((await ub(page)).tier).toBe("lite");

  // Lite: marketing and photo mode are Ultimate features.
  await stage.getByTestId("ub-tool-marketing").click();
  await expect(stage.getByTestId("ub-toast")).toContainText("Ultimate");

  // Open, let shoppers in, and work the till.
  await stage.getByTestId("ub-open").click();
  await page.evaluate(() => {
    const u = (window as unknown as { __ubiz: UB }).__ubiz;
    u.setSpeed(5);
    u.spawn(4);
  });
  await expect(stage.getByTestId("ub-till-alert")).toBeVisible({ timeout: 90_000 });
  await stage.getByTestId("ub-till-alert").click();
  const till = stage.getByTestId("ub-panel-till");
  await expect(till).toBeVisible();
  while (await till.getByTestId("ub-scan").isVisible().catch(() => false)) await till.getByTestId("ub-scan").click();
  if (await till.getByTestId("ub-card").isVisible().catch(() => false)) {
    await till.getByTestId("ub-card").click();
  } else {
    // Count out the change, largest notes first.
    const text = (await till.textContent()) ?? "";
    const due = Math.round(Number(/Change due: \$([\d,.]+)/.exec(text)![1].replace(/,/g, "")) * 100);
    let left = due;
    for (const n of [10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 1])
      while (left >= n) {
        await till.getByTestId(`ub-note-${n}`).click();
        left -= n;
      }
    await till.getByTestId("ub-give-change").click();
  }
  await expect(stage.getByTestId("ub-toast")).toContainText("Thank you, come again!");
  await expect.poll(async () => (await ub(page)).today.customers, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  expect((await ub(page)).today.revenue).toBeGreaterThan(0);
  await stage.getByTestId("ub-close").click();

  // Order a box of bread.
  const before = (await ub(page)).cash;
  await stage.getByTestId("ub-tool-stock").click();
  await stage.getByTestId("ub-order-bread").click();
  await expect(stage.getByTestId("ub-toast")).toContainText("Ordered 12");
  expect((await ub(page)).cash).toBe(before - 12 * 180);
  await stage.getByTestId("ub-close").click();

  // Build a shelf; its stocking panel opens.
  await stage.getByTestId("ub-tool-build").click();
  await stage.getByTestId("ub-build-shelf").click();
  await page.evaluate(() => (window as unknown as { __ubiz: UB }).__ubiz.place(9.5, 6.3));
  await expect(stage.getByTestId("ub-panel-fixture")).toBeVisible();
  await stage.getByTestId("ub-close").click();

  // Bank the score: the platform takes it as the final score.
  await stage.getByTestId("ub-tool-books").click();
  await stage.getByTestId("ub-bank").click();
  await expect(stage).toHaveAttribute("data-phase", "over", { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("UBusiness: goals, the day's event, mess and the cleaner", async ({ page }) => {
  test.setTimeout(180_000);
  await guestWith(page, 0, true);
  await page.goto("/games/ubusiness");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  const stage = page.getByTestId("game-stage");
  await stage.getByTestId("ub-new").click();
  await expect(stage.getByTestId("ub-cash")).toBeVisible({ timeout: 60_000 });
  // Three goals for the day.
  await expect(stage.getByTestId("ub-goals")).toContainText("Today's goals");
  expect((await page.evaluate(() => (window as unknown as { __ubiz: { state: () => { goals: unknown[] } } }).__ubiz.state().goals)).length).toBe(3);
  // An event shows its banner.
  await page.evaluate(() => (window as unknown as { __ubiz: { setEvent: (e: string) => void } }).__ubiz.setEvent("heatwave"));
  await expect(stage.getByTestId("ub-event")).toContainText("Heatwave");
  // A mess: click it to clean it up.
  const id = await page.evaluate(() => (window as unknown as { __ubiz: { mess: (x: number, z: number) => number } }).__ubiz.mess(4, 3));
  await page.evaluate((id) => (window as unknown as { __ubiz: { clickMess: (id: number) => void } }).__ubiz.clickMess(id), id);
  await expect(stage.getByTestId("ub-toast")).toContainText("Cleaned up");
  // Ultimate: hire a cleaner, set a standing order.
  await stage.getByTestId("ub-tool-staff").click();
  await stage.getByTestId("ub-hire-cleaner").click();
  await expect(stage.getByTestId("ub-panel-staff")).toContainText("Cleaner");
  await stage.getByTestId("ub-close").click();
  await stage.getByTestId("ub-tool-stock").click();
  await stage.getByTestId("ub-auto-bread").getByRole("button", { name: "+" }).click();
  await expect(stage.getByTestId("ub-auto-bread")).toContainText("auto 1 box");
});

test("UBusiness: Ultimate is free to claim until 31 October, and keeps", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-20T10:00:00Z"));
  await guestWith(page, 0);
  await page.goto("/games/ubusiness");
  const free = page.getByTestId("ubusiness-free");
  await expect(free).toContainText("free until 31 October");
  await page.getByTestId("ubusiness-claim").click();
  await expect(page.getByTestId("ubusiness-pass")).toHaveAttribute("data-tier", "ultimate");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("zx-season-s1")!))).toMatchObject({ coins: 0, purchases: ["unlock:ubusiness-ultimate"] });
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test("UBusiness: the free offer is gone in November", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-02T10:00:00Z"));
  await guestWith(page, 0);
  await page.goto("/games/ubusiness");
  await expect(page.getByTestId("ubusiness-buy-lite")).toBeVisible();
  await expect(page.getByTestId("ubusiness-free")).toHaveCount(0);
});

test("UBusiness expansion: specials, upgrades, a loan, a freezer, and catching a shoplifter", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await guestWith(page, 0, true);
  await page.goto("/games/ubusiness");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  const stage = page.getByTestId("game-stage");
  await stage.getByTestId("ub-new").click();
  await expect(stage.getByTestId("ub-cash")).toHaveText("$3,000.00", { timeout: 60_000 });
  type X = { state: () => Record<string, unknown>; xp: (n: number) => void; give: (c: number) => void; place: (x: number, z: number) => void; thief: () => void };
  const ub = () => page.evaluate(() => (window as unknown as { __ubiz: X }).__ubiz.state());

  // A special: 20% off.
  await stage.getByTestId("ub-tool-prices").click();
  await stage.getByTestId("ub-special-pasta").click();
  await expect(stage.getByTestId("ub-toast")).toContainText("on special");
  expect((await ub()).specials).toEqual(["pasta"]);
  await stage.getByTestId("ub-close").click();

  // Upgrades and the bank.
  await stage.getByTestId("ub-tool-upgrades").click();
  await stage.getByTestId("ub-upgrade-doors").click();
  await expect(stage.getByTestId("ub-upgrade-doors")).toContainText("Fitted");
  await stage.getByTestId("ub-close").click();
  await stage.getByTestId("ub-tool-bank").click();
  await stage.getByTestId("ub-loan-small").click();
  await expect(stage.getByTestId("ub-cash")).toHaveText("$7,600.00");
  await expect(stage.getByTestId("ub-repay")).toBeVisible();
  await stage.getByTestId("ub-close").click();

  // Frozen food: the licence, then a freezer.
  await page.evaluate(() => {
    const u = (window as unknown as { __ubiz: X }).__ubiz;
    u.xp(5_000);
    u.give(1_000_000);
  });
  await stage.getByTestId("ub-tool-licences").click();
  await stage.getByTestId("ub-licence-frozen").click();
  await expect(stage.getByTestId("ub-licence-frozen")).toContainText("Licensed");
  await stage.getByTestId("ub-close").click();
  await stage.getByTestId("ub-tool-build").click();
  await stage.getByTestId("ub-build-freezer").click();
  await page.evaluate(() => (window as unknown as { __ubiz: X }).__ubiz.place(9.5, 6.3));
  await expect(stage.getByTestId("ub-panel-fixture")).toContainText("Freezer");
  await stage.getByTestId("ub-close").click();

  // A shoplifter: the alert, and you stop them.
  await stage.getByTestId("ub-open").click();
  await page.evaluate(() => (window as unknown as { __ubiz: X }).__ubiz.thief());
  await expect(stage.getByTestId("ub-thief-alert")).toBeVisible();
  await stage.getByTestId("ub-thief-alert").click();
  await expect(stage.getByTestId("ub-toast")).toContainText("Caught them");
  expect(((await ub()).lifetime as { caught: number }).caught).toBe(1);

  // Trophies: "Not on my watch" is in.
  await stage.getByTestId("ub-tool-trophies").click();
  await expect(stage.getByTestId("ub-panel-trophies")).toContainText("Not on my watch");
  expect((await ub()).milestones).toContain("catch");
  expect(errors).toEqual([]);
});

test("UBusiness round three: bulk orders, staff training, a coffee bar, the week in review and the profit chart", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await guestWith(page, 0, true);
  await page.goto("/games/ubusiness");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  const stage = page.getByTestId("game-stage");
  await stage.getByTestId("ub-new").click();
  await expect(stage.getByTestId("ub-cash")).toHaveText("$3,000.00", { timeout: 60_000 });
  type X = { state: () => Record<string, unknown>; xp: (n: number) => void; give: (c: number) => void; place: (x: number, z: number) => void; closeDay: () => void };
  const ub = () => page.evaluate(() => (window as unknown as { __ubiz: X }).__ubiz.state());
  const call = (fn: string, ...a: unknown[]) => page.evaluate(([fn, a]) => ((window as unknown as { __ubiz: Record<string, (...x: unknown[]) => void> }).__ubiz[fn as string](...(a as unknown[]))), [fn, a] as const);

  // Five boxes at the bulk price.
  await stage.getByTestId("ub-tool-stock").click();
  await stage.getByTestId("ub-order5-pasta").click();
  await expect(stage.getByTestId("ub-toast")).toContainText("8% bulk discount");
  await stage.getByTestId("ub-close").click();

  // Hire and train a cashier.
  await call("give", 1_000_000);
  await call("xp", 5_000);
  await stage.getByTestId("ub-tool-staff").click();
  await stage.getByTestId("ub-hire-cashier").click();
  const id = ((await ub()).staff as { id: number }[])[0].id;
  await stage.getByTestId(`ub-train-${id}`).click();
  await expect(stage.getByTestId("ub-toast")).toContainText("is now level 2");
  await stage.getByTestId("ub-close").click();

  // A coffee bar.
  await stage.getByTestId("ub-tool-build").click();
  await stage.getByTestId("ub-build-coffee").click();
  await call("place", 9.5, 6.3);
  await expect(stage.getByTestId("ub-toast")).toContainText("Coffee Bar placed");

  // A week of closing the books: the week in review, and two weeks of profit on the chart.
  for (let d = 1; d <= 7; d++) {
    await call("closeDay");
    if (d < 7) await stage.getByTestId("ub-next-day").click();
  }
  await expect(stage.getByTestId("ub-week")).toContainText("Week 1 in review");
  await stage.getByTestId("ub-next-day").click();
  await stage.getByTestId("ub-tool-books").click();
  await expect(stage.getByTestId("ub-profit-chart")).toContainText("Profit per day");
  expect(await stage.getByTestId("ub-profit-chart").locator(".group").count()).toBe(7);
  expect(errors).toEqual([]);
});
