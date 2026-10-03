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
