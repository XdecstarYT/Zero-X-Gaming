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

/** The Town Bank, the City Hall allowance, emotes and the minimap. */
test("Hometown: save at the bank, collect an allowance, emote", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openPractice(page);
  const stage = page.getByTestId("game-stage");
  await expect(stage.getByTestId("town-minimap")).toBeVisible();

  await walkTo(page, "carlot", /Town Bank/);
  await expect(stage.getByTestId("town-bank")).toBeVisible();
  await stage.getByTestId("town-bank-amount").fill("500");
  await stage.getByTestId("town-deposit").click();
  await expect(stage.getByTestId("town-toast")).toContainText("Savings: $500");
  await expect(stage.getByTestId("town-cash")).toHaveText("$1,000");
  await stage.getByTestId("town-bank-amount").fill("200");
  await stage.getByTestId("town-withdraw").click();
  await expect(stage.getByTestId("town-toast")).toContainText("Savings: $300");
  await expect(stage.getByTestId("town-cash")).toHaveText("$1,200");
  await stage.getByTestId("town-close").click();

  await walkTo(page, "cityhall", /City Hall/);
  await stage.getByTestId("town-allowance").click();
  await expect(stage.getByTestId("town-toast")).toContainText("allowance");
  await stage.getByTestId("town-close").click();

  await stage.getByTestId("town-emote-wave").click();
  expect(errors).toEqual([]);
});

/** Pushing right walks to the right of the screen, up walks away from the camera. */
test("Hometown: you walk the way you push", async ({ page }) => {
  test.setTimeout(180_000);
  await openPractice(page);
  type S = { me: { x: number; z: number }; yaw: number };
  const read = () => page.evaluate(() => (window as unknown as { __town: { state: () => S } }).__town.state()) as Promise<S>;
  const hold = async (key: string) => {
    const a = await read();
    await page.keyboard.down(key);
    await page.waitForTimeout(500);
    await page.keyboard.up(key);
    const b = await read();
    const right = [Math.cos(a.yaw), -Math.sin(a.yaw)];
    const fwd = [-Math.sin(a.yaw), -Math.cos(a.yaw)];
    const d = [b.me.x - a.me.x, b.me.z - a.me.z];
    return { right: d[0] * right[0] + d[1] * right[1], fwd: d[0] * fwd[0] + d[1] * fwd[1] };
  };
  await page.getByTestId("game-stage").click({ position: { x: 450, y: 300 } });
  const r = await hold("KeyD");
  expect(r.right).toBeGreaterThan(0.3);
  const l = await hold("KeyA");
  expect(l.right).toBeLessThan(-0.3);
  const f = await hold("KeyW");
  expect(f.fwd).toBeGreaterThan(0.3);
});

test.describe("touch", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  /** The thumbstick: push a way, walk that way on screen, and the knob sits under your thumb. */
  test("Hometown: the thumbstick walks you where you push it", async ({ page }) => {
    test.setTimeout(180_000);
    await openPractice(page);
    const stick = page.getByTestId("touch-stick");
    await expect(stick).toBeVisible();
    type V = { x: number; z: number };
    type T = { state: () => { me: V }; onScreen: (x: number, z: number) => { x: number; y: number } };
    for (const [dx, dy] of [[50, 0], [-50, 0], [0, -50], [0, 50]]) {
      const a = await page.evaluate(() => ({ ...(window as unknown as { __town: T }).__town.state().me }));
      const knob = await page.evaluate(([x, y, dx, dy]) => {
        const t = document.elementFromPoint(x, y)!;
        const ev = (type: string, cx: number, cy: number) => t.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: "touch", clientX: cx, clientY: cy, bubbles: true, buttons: 1 }));
        ev("pointerdown", x, y);
        ev("pointermove", x + dx, y + dy);
        (window as unknown as { __up: () => void }).__up = () => ev("pointerup", x + dx, y + dy);
        const k = document.querySelector('[data-testid="touch-stick"] > div')!.getBoundingClientRect();
        return { x: k.x + k.width / 2 - x, y: k.y + k.height / 2 - y };
      }, [110, 300, dx, dy]);
      // The knob is drawn right under the thumb (up to the ring's edge).
      expect(Math.abs(knob.x - Math.sign(dx) * 45)).toBeLessThan(3);
      expect(Math.abs(knob.y - Math.sign(dy) * 45)).toBeLessThan(3);
      await page.waitForTimeout(600);
      await page.evaluate(() => (window as unknown as { __up: () => void }).__up());
      const s = await page.evaluate((a) => {
        const t = (window as unknown as { __town: T }).__town;
        const b = t.state().me;
        const p = t.onScreen(a.x, a.z);
        const q = t.onScreen(b.x, b.z);
        return { x: q.x - p.x, y: q.y - p.y };
      }, a);
      // Screen y is up-positive, the thumb's is down-positive.
      if (dx) expect(Math.sign(s.x)).toBe(Math.sign(dx));
      if (dy) expect(Math.sign(s.y)).toBe(-Math.sign(dy));
      expect(Math.hypot(s.x, s.y)).toBeGreaterThan(0.1);
    }
  });
});

/** Three servers: Main Street is open, the two dev servers are locked; the street has its townsfolk. */
test("Hometown: servers, and townsfolk on the street", async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => localStorage.setItem("zx-town-prefs", JSON.stringify({ gfx: "low" })));
  await page.goto("/games/hometown?town=local");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  const servers = page.getByTestId("town-servers");
  await expect(servers.getByTestId("town-server-main")).toBeEnabled();
  await expect(servers.getByTestId("town-server-main")).toContainText("Selected");
  for (const id of ["harbour", "hillcrest"]) {
    await expect(servers.getByTestId(`town-server-${id}`)).toBeDisabled();
    await expect(servers.getByTestId(`town-server-${id}`)).toContainText("locked");
  }
  // Only the site owner gets the unlock buttons.
  await expect(page.getByTestId("town-server-toggle-harbour")).toHaveCount(0);

  await page.getByTestId("town-practice").click();
  await expect(page.getByTestId("town-hud")).toBeVisible({ timeout: 60_000 });
  type S = { server: string; folk: { name: string; x: number; z: number }[]; prompt: string };
  type T = { state: () => S; goTo: (x: number, z: number) => void };
  await page.waitForFunction(() => (window as unknown as { __town: T }).__town.state().folk.length === 12);
  expect(await page.evaluate(() => (window as unknown as { __town: T }).__town.state().server)).toBe("main");
  await expect(page.getByTestId("town-online")).toContainText("Main Street");

  // Walk up to one of them: E talks.
  await page.waitForFunction(() => {
    const t = (window as unknown as { __town: T }).__town;
    const n = t.state().folk[0];
    t.goTo(n.x + 0.5, n.z);
    return /Talk to/.test(t.state().prompt);
  });
  await page.evaluate(() => (window as unknown as { __town: { act: () => void } }).__town.act());
  await expect(page.getByTestId("town-toast")).toContainText(/".+"/);
});

/** The builder's catalogue: three tabs, a hundred new pieces, placed and saved. */
test("Hometown: build with the new catalogue (Furniture, Decor, Outdoor)", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openPractice(page);
  const stage = page.getByTestId("game-stage");
  await page.evaluate(() => (window as unknown as { __town: Town }).__town.give("cash", 3000));
  await page.evaluate(() => (window as unknown as { __town: Town }).__town.give("furniture", 10));
  const pieces = () => page.evaluate(() => (window as unknown as { __town: Town }).__town.state().info?.inventory.furniture ?? 0);
  const before = await pieces();
  await walkTo(page, "lot:6", /For sale/);
  await stage.getByTestId("town-buy-lot").click();
  await expect(stage.getByTestId("town-toast")).toContainText("is yours");
  await stage.getByTestId("town-build-here").click();
  await stage.getByTestId("town-tool-item").click();
  // Three tabs, with their counts.
  await expect(stage.getByTestId("town-cat-furniture")).toContainText("Furniture (54)");
  await expect(stage.getByTestId("town-cat-decor")).toContainText("Decor (36)");
  await expect(stage.getByTestId("town-cat-outdoor")).toContainText("Outdoor (36)");
  const place = async (x: number, z: number) => page.evaluate(([x, z]) => (window as unknown as { __town: Town }).__town.build(x, z), [x, z]);

  await stage.getByTestId("town-cat-outdoor").click();
  await expect(stage.getByTestId("town-item-sofa")).toHaveCount(0);
  await stage.getByTestId("town-item-gazebo").click();
  await place(6, 8);
  await stage.getByTestId("town-item-oakTree").click();
  await place(18, 6);

  await stage.getByTestId("town-cat-decor").click();
  await stage.getByTestId("town-item-monstera").click();
  await place(12, 20);

  // Indoor furniture needs a floor under it.
  await stage.getByTestId("town-cat-furniture").click();
  await stage.getByTestId("town-item-arcade").click();
  await page.evaluate(() => (window as unknown as { __town: Town }).__town.setTool("floor"));
  await place(15.5, 15.5);
  await page.evaluate(() => (window as unknown as { __town: Town }).__town.setTool("item"));
  await place(15.5, 15.5);

  const types = await page.evaluate(() => ((window as unknown as { __town: Town }).__town.builds(6) as unknown as { items: { type: string }[] }).items.map((i) => i.type));
  expect(types).toEqual(["gazebo", "oakTree", "monstera", "arcade"]);
  // One piece of furniture (from the workshop) per item placed.
  await expect.poll(pieces).toBe(before - 4);
  expect(errors).toEqual([]);
});
