import { expect, test } from "./fixtures";

test("NextX: the logo plays in, the library shows YourGov and Zero City, and the tabs work", async ({ page }) => {
  await page.goto("/nextx");
  await page.getByTestId("nextx-intro").click({ timeout: 2000 }).catch(() => {});
  await expect(page.getByTestId("nextx-title-yourgov")).toBeVisible();
  await expect(page.getByTestId("nextx-title-zero-city")).toBeVisible();
  await expect(page.getByTestId("nextx-launch-yourgov")).toHaveAttribute("href", "/nextx/play/yourgov");
  const tab = (id: string) => page.locator(`[data-testid="nextx-tab-${id}"]:visible, [data-testid="nextx-mtab-${id}"]:visible`).first();
  await tab("studio").click();
  await expect(page.getByTestId("nextx-studio")).toBeVisible();
  await tab("updates").click();
  await expect(page.getByTestId("nextx-updates")).toContainText("YourGov");
  await page.getByTestId("nextx-exit").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("nextx-teaser")).toBeVisible();
});

test("NextX titles run in the NextX app: their old pages send you there, and ZLink+ still unlocks them", async ({ page }) => {
  await page.goto("/games/wareforge");
  await expect(page).toHaveURL(/\/nextx\/play\/wareforge$/);
  await expect(page.getByTestId("nextx-player")).toBeVisible();
  await expect(page.getByTestId("game-access")).toHaveText("ZLink+ exclusive");
  await expect(page.getByTestId("zlink-lock-join")).toBeVisible();
  await page.getByTestId("nextx-back").click();
  await expect(page.getByTestId("nextx-app")).toBeVisible();
  await page.goto("/zlink");
  await expect(page.getByTestId("zlink-nextx")).toContainText("WareForge");
});

test("NextX titles fill the screen, even where the browser has no element fullscreen (iPhone)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "phones go immersive on Play; this checks the Fullscreen button's fallback");
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
    localStorage.setItem("zx-wareforge-prefs", JSON.stringify({ gfx: "low", sound: false }));
    for (const P of [Element.prototype, HTMLElement.prototype]) {
      Object.defineProperty(P, "requestFullscreen", { value: undefined, configurable: true });
      Object.defineProperty(P, "webkitRequestFullscreen", { value: undefined, configurable: true });
    }
  });
  await page.goto("/nextx/play/wareforge");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("nextx-player-bar")).toBeVisible();
  await page.getByTestId("game-fullscreen").click();
  await expect(page.getByTestId("game-stage")).toHaveAttribute("data-immersive", "true");
  // The NextX bar gets out of the way while the game fills the screen.
  await expect(page.getByTestId("nextx-player-bar")).toBeHidden();
  const vp = page.viewportSize()!;
  const box = (await page.getByTestId("game-stage").boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(vp.width - 1);
  expect(box.height).toBeGreaterThanOrEqual(vp.height - 1);
});

test("On a phone, playing a NextX title clears the NextX bar away until you exit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phones go full screen on Play");
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
    localStorage.setItem("zx-wareforge-prefs", JSON.stringify({ gfx: "low", sound: false }));
  });
  await page.goto("/nextx/play/wareforge");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("game-stage")).toHaveAttribute("data-immersive", "true");
  await expect(page.getByTestId("nextx-player-bar")).toBeHidden();
  // Nothing of the NextX page sits over the top of the game.
  const top = await page.evaluate(() => document.elementFromPoint(window.innerWidth / 2, 30)?.closest("[data-testid=game-stage]") !== null);
  expect(top).toBe(true);
  await page.getByRole("button", { name: "Pause game" }).click();
  await page.getByRole("button", { name: "Exit", exact: true }).click();
  await expect(page.getByTestId("nextx-player-bar")).toBeVisible();
});
