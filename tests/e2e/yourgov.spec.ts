import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.use({ viewport: { width: 1400, height: 900 } });

type YG = {
  s: { week: number; bills: { law: string; stage: string }[]; election: unknown; lastElection: unknown; news: { text: string }[] };
  endTurn: () => void;
};
const yg = <T,>(page: Page, f: (g: YG) => T) => page.evaluate(`(${f.toString()})(window.__yg)`) as Promise<T>;

test("Zenith shows its retirement notice", async ({ page }) => {
  await page.goto("/games/zenith");
  await expect(page.getByTestId("game-retiring")).toContainText("Zero City");
});

test("YourGov: members only; pick a party, write a bill, hold events, end weeks and count an election", async ({ page }, testInfo) => {
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

  // Write a bill: it goes to committee.
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

  // The chamber view and the parliament panel.
  await page.getByTestId("yg-view-chamber").dispatchEvent("click");
  await expect(page.getByTestId("yg-chamber")).toBeVisible();
  await page.getByTestId("yg-tab-chamber").click();
  await page.getByTestId("yg-view-map").dispatchEvent("click");

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
