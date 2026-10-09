import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.use({ viewport: { width: 1400, height: 900 } });

type YG = {
  s: { week: number; bills: { law: string; stage: string }[]; election: unknown; lastElection: unknown; news: { text: string }[]; custom: { id: string; name: string; options: { label: string }[] }[]; laws: Record<string, number> };
  endTurn: () => void;
};
const yg = <T,>(page: Page, f: (g: YG) => T) => page.evaluate(`(${f.toString()})(window.__yg)`) as Promise<T>;

test("Zenith shows its retirement notice", async ({ page }) => {
  await page.goto("/games/zenith");
  await expect(page.getByTestId("game-retiring")).toContainText("Zero City");
});

test("YourGov: members only; pick a party, draft a law of your own, write bills, hold events, end weeks and count an election", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "the desktop run covers play; the page is checked on mobile by the a11y pass");
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_TUNNEL|Failed to load resource|supabase/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
    // Low graphics keep the software renderer in CI quick.
    localStorage.setItem("zx-yourgov-prefs", JSON.stringify({ gfx: "low", sound: false }));
  });
  await page.goto("/games/yourgov?yg");
  await expect(page.getByTestId("game-access")).toHaveText("ZLink+ exclusive");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("yg-title")).toBeVisible({ timeout: 120_000 });

  await page.getByTestId("yg-party-grn").click();
  await page.getByTestId("yg-start").click();
  await expect(page.getByTestId("yourgov")).toBeVisible();
  await expect(page.getByTestId("yg-date")).toHaveText("2046.02");
  // The country comes up in 3D once its terrain is built.
  await expect(page.getByTestId("yg-map")).toBeVisible();
  await expect(page.getByTestId("yg-loading")).toHaveCount(0, { timeout: 120_000 });

  // Draft a law of your own in the law studio: name it, pick a template and an effect.
  await page.getByTestId("yg-tab-write").click();
  await page.getByTestId("yg-new-law").click();
  await expect(page.getByTestId("yg-studio")).toBeVisible();
  await expect(page.getByTestId("yg-law-save")).toBeDisabled();
  await page.getByTestId("yg-law-name").fill("Four-day week");
  await page.getByTestId("yg-law-group-Economy").click();
  await page.getByTestId("yg-tpl-yesno").click();
  await page.getByTestId("yg-opt-label-1").fill("Four days");
  await page.getByTestId("yg-opt-label-0").fill("Five days");
  await page.getByTestId("yg-law-save").click();
  await expect(page.getByTestId("yg-studio")).toHaveCount(0);
  await expect(page.getByTestId("yg-p-law")).toContainText("Four-day week");
  const custom = await yg(page, (g) => g.s.custom.map((l) => ({ id: l.id, options: l.options.map((o) => o.label) })));
  expect(custom).toEqual([{ id: "custom-1", options: ["Five days", "Four days"] }]);
  // …and put it to the legislature.
  await page.getByTestId("yg-propose-1").click();
  expect(await yg(page, (g) => g.s.bills.some((b) => b.law === "custom-1" && b.stage === "committee"))).toBe(true);

  // Write a bill on a built-in law: it goes to committee.
  await page.getByTestId("yg-tab-write").click();
  await page.getByTestId("yg-law-corporateTax").click();
  await page.getByTestId("yg-propose-2").click();
  expect(await yg(page, (g) => g.s.bills.some((b) => b.law === "corporateTax" && b.stage === "committee"))).toBe(true);

  // Take a poll.
  await page.getByTestId("yg-tab-events").click();
  await page.getByTestId("yg-ev-poll").click();
  await page.getByTestId("yg-hold").click();
  await expect(page.getByText("Poll results are in")).toBeVisible();

  // End three weeks (the hourglass and the Enter key).
  await page.getByTestId("yg-end-turn").dispatchEvent("click");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");
  await page.getByTestId("yg-end-turn").dispatchEvent("click");
  await expect(page.getByTestId("yg-date")).toHaveText("2046.05");

  // The chamber view, the parliament, the polls and the settings.
  await page.getByTestId("yg-view-chamber").dispatchEvent("click");
  await expect(page.getByTestId("yg-chamber")).toBeVisible();
  await page.getByTestId("yg-tab-chamber").click();
  await page.getByTestId("yg-house-senate").click();
  await expect(page.getByTestId("yg-p-chamber")).toContainText("Senate");
  await page.getByTestId("yg-view-map").dispatchEvent("click");
  await page.getByTestId("yg-tab-parties").click();
  await expect(page.getByRole("img", { name: "National polls over time" })).toBeVisible();
  await page.getByTestId("yg-mapmode-support").click();
  await page.getByTestId("yg-tab-settings").click();
  await expect(page.getByTestId("yg-p-settings")).toBeVisible();

  // Jump to the eve of the midterms: the count runs county by county, then seats change hands.
  await yg(page, (g) => {
    g.s.week = 52 * 2 + 43;
    g.endTurn();
  });
  expect(await yg(page, (g) => !!g.s.election)).toBe(true);
  await expect(page.getByTestId("yg-election-skip")).toBeVisible();
  await page.getByTestId("yg-election-skip").dispatchEvent("click");
  await page.getByTestId("yg-election-continue").dispatchEvent("click");
  expect(await yg(page, (g) => !g.s.election && !!g.s.lastElection)).toBe(true);
  await expect(page.getByTestId("yg-chamber")).toBeVisible();

  expect(errors).toEqual([]);
});
