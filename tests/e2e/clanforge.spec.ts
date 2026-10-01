import { dismissRotate, expect, test } from "./fixtures";

test.use({ viewport: { width: 900, height: 506 } });

type Hooks = {
  __clan: {
    village: () => { buildings: { type: string; level: number; busyUntil?: number }[]; army: Record<string, number>; queue: unknown[]; trophies: number };
    mode: () => string;
    autoBattle: () => void;
    advance: (ms: number) => void;
  };
};

/** Clanforge: found a village, build and finish an Archer Tower, train a troop, then raid an AI village to the end. */
test("Clanforge: build, train and raid", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("zx-clanforge-prefs", JSON.stringify({ gfx: "low" })));
  await page.goto("/games/clanforge?clanforge=test");
  const stage = page.getByTestId("game-stage");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(stage.getByText("Build · Train · Raid · Defend")).toBeVisible();
  await stage.getByTestId("cf-start").click();

  const hud = stage.getByTestId("cf-hud");
  await expect(hud).toBeVisible({ timeout: 60_000 });
  await expect(stage.getByTestId("cf-gold")).toContainText("1,500");

  // Shop → Defense → Archer Tower, place it, finish it with crystals.
  await stage.getByTestId("cf-shop").click();
  await stage.getByTestId("cf-shop-panel").getByRole("button", { name: "Defense" }).click();
  await stage.getByTestId("cf-buy-archerTower").click();
  await stage.getByTestId("cf-place").click();
  await expect(stage.getByTestId("cf-gold")).toContainText("500");
  const panel = stage.getByTestId("cf-panel");
  await expect(panel).toContainText("Archer Tower");
  await expect(panel).toContainText("Under construction");
  await stage.getByTestId("cf-finish").click();
  await expect(panel).toContainText("Level 1");
  expect(await page.evaluate(() => (window as unknown as Hooks).__clan.village().buildings.find((b) => b.type === "archerTower")?.level)).toBe(1);

  // Train a brawler and let the clock run.
  await stage.getByTestId("cf-army").click();
  await stage.getByTestId("cf-train-brawler").click();
  await expect(stage.getByTestId("cf-army-panel")).toContainText("1 training");
  await page.evaluate(() => (window as unknown as Hooks).__clan.advance(10_000));
  await expect(stage.getByTestId("cf-army-panel")).toContainText("11 ready");
  await stage.getByTestId("cf-close").click();

  // Raid: search, then fight it out.
  await stage.getByTestId("cf-attack").click();
  const bhud = stage.getByTestId("cf-battle-hud");
  await expect(bhud).toBeVisible();
  await expect(bhud).toContainText("Available loot");
  await expect(stage.getByTestId("cf-troop-brawler")).toContainText("×11");
  await stage.getByTestId("cf-next").click();
  await expect(bhud).toBeVisible();
  await page.evaluate(() => (window as unknown as Hooks).__clan.autoBattle());
  const results = stage.getByTestId("cf-results");
  await expect(results).toBeVisible({ timeout: 30_000 });
  await expect(results).toContainText("Destruction");
  await expect(results).toContainText("Trophies");
  await results.getByTestId("cf-home").click();
  await expect(hud).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as Hooks).__clan.mode())).toBe("village");

  // The village is saved: leave and come back.
  await page.reload();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(stage.getByText("Raids won")).toBeVisible();
  await stage.getByTestId("cf-start").click();
  await expect(stage.getByTestId("cf-hud")).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});
