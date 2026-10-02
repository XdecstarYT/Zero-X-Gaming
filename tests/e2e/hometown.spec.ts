import type { Page } from "@playwright/test";
import { dismissRotate, expect, test } from "./fixtures";

test.use({ viewport: { width: 900, height: 506 } });

type Town = {
  state: () => { mode: string; prompt: string; others: number; info: { cash: number; inventory: Record<string, number> } | null };
  goTo: (x: number, z: number) => void;
  door: (id: string) => { x: number; z: number };
  lotCentre: (id: number) => { x: number; z: number };
  act: () => void;
  give: (item: string, n: number) => Promise<void>;
  build: (x: number, z: number) => Promise<void>;
  setTool: (t: string) => void;
  builds: (id: number) => { walls: unknown[] } | undefined;
};

async function openPractice(page: Page) {
  await page.addInitScript(() => localStorage.setItem("zx-town-prefs", JSON.stringify({ gfx: "low" })));
  await page.goto("/games/hometown?town=local");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await page.getByTestId("town-practice").click();
  await expect(page.getByTestId("town-hud")).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => "__town" in window);
}


async function walkTo(page: Page, where: string, prompt: RegExp) {
  await page.evaluate((w) => {
    const t = (window as unknown as { __town: Town }).__town;
    const p = w.startsWith("lot:") ? t.lotCentre(Number(w.slice(4))) : { ...t.door(w), z: t.door(w).z + 1 };
    t.goTo(p.x, p.z);
  }, where);
  await expect(page.getByTestId("town-prompt")).toHaveText(prompt);
  await page.evaluate(() => (window as unknown as { __town: Town }).__town.act());
}

/** The practice town: the whole loop, offline, against its neighbours. */
test("Hometown: work, trade, buy land, build, open a shop, run for mayor", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openPractice(page);
  const stage = page.getByTestId("game-stage");
  await expect(stage.getByTestId("town-cash")).toHaveText("$1,500");

  // A farm shift: wheat and pay.
  await walkTo(page, "freshmart", /Greenacre Farm/);
  await stage.getByTestId("town-work-farm").click();
  await expect(stage.getByTestId("town-bag")).toContainText("🌾 3");
  await expect(stage.getByTestId("town-cash")).toHaveText("$1,510");
  await stage.getByTestId("town-close").click();

  // Sell it into the neighbours' bids on the exchange.
  await walkTo(page, "office", /Town Exchange/);
  await stage.getByTestId("town-item-wheat").click();
  await expect(stage.getByTestId("town-book")).toContainText("Buying");
  await stage.getByTestId("town-order-price").fill("1");
  await stage.getByTestId("town-order-qty").fill("3");
  await stage.getByTestId("town-order-sell").click();
  await expect(stage.getByTestId("town-toast")).toContainText(/Sold \d/);
  await stage.getByTestId("town-close").click();

  // Buy a lot and build a wall with a plank.
  await page.evaluate(() => (window as unknown as { __town: Town }).__town.give("cash", 3000));
  await page.evaluate(() => (window as unknown as { __town: Town }).__town.give("planks", 3));
  await walkTo(page, "lot:6", /For sale/);
  await stage.getByTestId("town-buy-lot").click();
  await expect(stage.getByTestId("town-toast")).toContainText("is yours");
  await stage.getByTestId("town-build-here").click();
  await expect(stage.getByTestId("town-build-panel")).toBeVisible();
  await page.evaluate(() => (window as unknown as { __town: Town }).__town.setTool("wall"));
  await page.evaluate(() => (window as unknown as { __town: Town }).__town.build(2, 2));
  await page.evaluate(() => (window as unknown as { __town: Town }).__town.build(10, 2));
  expect(await page.evaluate(() => (window as unknown as { __town: Town }).__town.builds(6)?.walls.length)).toBe(1);
  await expect(stage.getByTestId("town-bag")).toContainText("🪚 2");
  await stage.getByRole("button", { name: "Done" }).click();

  // Open a shop and put bread on the shelf.
  await walkTo(page, "lot:6", /Your lot/);
  await stage.getByTestId("town-open-shop").click();
  await expect(stage.getByTestId("town-toast")).toContainText("shop is open");
  await stage.getByTestId("town-stock-item").selectOption("bread");
  await stage.getByTestId("town-stock").click();
  await expect(stage.getByTestId("town-toast")).toContainText("on the shelf");
  await stage.getByTestId("town-close").click();

  // Stand for mayor and vote.
  await walkTo(page, "cityhall", /City Hall/);
  await stage.getByTestId("town-slogan").fill("Bread on every table");
  await stage.getByTestId("town-run").click();
  await expect(stage.getByTestId("town-ballot")).toContainText("Bread on every table");
  await stage.getByTestId("town-ballot").getByRole("button", { name: "Vote" }).first().click();
  await expect(stage.getByTestId("town-ballot")).toContainText("Your vote");
  await stage.getByTestId("town-close").click();

  // The Gazette has it all.
  await stage.getByTestId("town-phone").click();
  await stage.getByTestId("town-tab-news").click();
  await expect(stage.getByTestId("town-phone-news")).toContainText("running for mayor");
  expect(errors).toEqual([]);
});

/** Two tabs in the practice town see each other and can chat. */
test("Hometown: neighbours walk and talk", async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: { width: 900, height: 506 } });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("zx-intro-seen", "1");
    localStorage.setItem("zx-mega-ad-seen", "1");
  });
  const [a, b] = [await ctx.newPage(), await ctx.newPage()];
  await openPractice(a);
  await openPractice(b);
  for (const p of [a, b]) await p.waitForFunction(() => (window as unknown as { __town: Town }).__town.state().others >= 1, null, { timeout: 30_000 });
  await a.getByTestId("town-chat-input").fill("hello neighbour");
  await a.getByTestId("town-chat-input").press("Enter");
  await expect(b.getByTestId("town-chat")).toContainText("hello neighbour");
  await ctx.close();
});
