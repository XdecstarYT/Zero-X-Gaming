import type { Page } from "@playwright/test";
import { dismissRotate, expect, test } from "./fixtures";

const SHOTS = process.env.XC_SHOTS;
const shot = async (page: Page, name: string, project: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}-${project}-${name}.png` });
};
type P = { pol: { campaign: boolean; week: number; role: string; night: unknown; government: number; player: number; federal: { sitting: boolean; nextSitting: number }; electorates: { holder: number }[]; seat: number; campaignFrom: number } ; month: number };
const st = <T,>(page: Page, f: (s: P) => T) => page.evaluate(`(${f.toString()})(window.__xc.s)`) as Promise<T>;

test("XCity politics: set up a world and a party, campaign for ten weeks, election night, then parliament", async ({ page }, info) => {
  test.setTimeout(480_000);
  const project = info.project.name;
  const mobile = project === "mobile";
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (!mobile) await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => {
    // Low graphics: headless browsers draw WebGL in software, a few frames a second at best.
    if (!localStorage.getItem("zx-xcity-prefs")) localStorage.setItem("zx-xcity-prefs", JSON.stringify({ quality: "low" }));
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
  });
  await page.goto("/games/xcity?xc");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(page.getByTestId("xc-title")).toBeVisible({ timeout: 60_000 });
  await shot(page, "1title", project);

  // The change log and the settings.
  await page.getByTestId("xc-changelog-open").click();
  await expect(page.getByTestId("xc-changelog")).toContainText("Politics");
  await shot(page, "2changelog", project);
  await page.getByTestId("xc-changelog").getByRole("button", { name: "Close" }).click();
  await page.getByTestId("xc-settings-open").click();
  await expect(page.getByTestId("xc-settings")).toBeVisible();
  await page.getByTestId("xc-settings").getByRole("button", { name: "Close" }).click();

  // A new world: politics, then the world, then the party.
  await page.getByTestId("xc-new").click();
  await page.getByTestId("xc-electorates-4").click();
  await shot(page, "3politics", project);
  await page.getByTestId("xc-next").click();
  await page.getByTestId("xc-city-name").fill("Parkton");
  await page.getByTestId("xc-next").click();
  await page.getByTestId("xc-preset-1").click();
  await page.getByTestId("xc-party-name").fill("Parkton First");
  await page.getByTestId("xc-leader").fill("Jo Mayor");
  await shot(page, "4party", project);
  await page.getByTestId("xc-begin").click();

  // Ten weeks out: the campaign HQ opens.
  await expect(page.getByTestId("xc-politics")).toBeVisible();
  await expect(page.getByTestId("xc-polchip")).toContainText("Week 1/10");
  await expect(page.getByTestId("xc-tool-zone")).toHaveCount(0);
  await page.getByTestId("xc-elec-0").click();
  await page.getByTestId("xc-camp-rally").click();
  await page.getByTestId("xc-camp-doorknock").click();
  await shot(page, "5campaign", project);
  await page.getByTestId("xc-pol-promises").click();
  await page.getByTestId("xc-promise-farms").click();
  await page.getByTestId("xc-pol-groups").click();
  await shot(page, "6groups", project);
  await page.getByTestId("xc-pol-campaign").click();
  for (let w = 0; w < 10; w++) {
    if (await st(page, (s) => !!s.pol.night)) break;
    if (await page.getByTestId("xc-debate").count()) {
      await page.getByTestId("xc-debate-lo").click();
      await shot(page, "7debate", project);
    }
    if (w % 2 === 1) await page.getByTestId("xc-pol-groups").click().then(() => page.getByTestId("xc-lobby-owners").click()).then(() => page.getByTestId("xc-pol-campaign").click());
    await page.getByTestId("xc-end-week").click();
    await page.waitForTimeout(250);
  }
  // Election night.
  await expect(page.getByTestId("xc-night")).toBeVisible();
  await page.waitForTimeout(2000);
  await shot(page, "8night", project);
  // Skip the rest of the count (unless it has already finished).
  await page.getByTestId("xc-night-skip").click({ timeout: 3000 }).catch(() => {});
  await expect(page.getByTestId("xc-night-verdict")).toBeVisible({ timeout: 30_000 });
  await shot(page, "9verdict", project);
  await page.getByTestId("xc-night-continue").click();
  const role = await st(page, (s) => s.pol.role);
  expect(["govern", "opposition", "out"]).toContain(role);
  if (role === "govern") await expect(page.getByTestId("xc-tool-zone")).toBeVisible();
  else await expect(page.getByTestId("xc-tool-zone")).toHaveCount(0);

  // Into parliament (give ourselves the seat and call a sitting, to see it).
  await page.evaluate(() => {
    const s = (window as unknown as { __xc: { s: P } }).__xc.s;
    s.pol.electorates[s.pol.seat].holder = s.pol.player;
    s.pol.federal.nextSitting = s.month + 1;
  });
  await page.evaluate(() => (window as unknown as { __xcSkip: (n: number) => void }).__xcSkip(1));
  await expect.poll(() => st(page, (s) => s.pol.federal.sitting)).toBe(true);
  await page.getByTestId("xc-tool-politics").click();
  await page.getByTestId("xc-pol-parliament").click();
  await expect(page.getByTestId("xc-politics")).toContainText("Question Time");
  await page.getByTestId("xc-question-housing").click();
  await page.getByTestId("xc-propose-transitFund").click();
  await shot(page, "10parliament", project);
  if (role !== "govern") {
    await page.getByTestId("xc-pol-opposition").click();
    await shot(page, "11opposition", project);
  }
  expect(errors).toEqual([]);
});
