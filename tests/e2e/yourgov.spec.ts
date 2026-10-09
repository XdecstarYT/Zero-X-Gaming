import type { Page } from "@playwright/test";
import { dismissRotate, expect, test } from "./fixtures";

test.use({ viewport: { width: 1400, height: 900 } });

type YG = {
  s: {
    parties: Record<string, { funds: number }>;
    party: string;
    plan: { week: number; event: string; state: number }[];
    usedEvents: string[];
    staff: Record<string, unknown>;
    mrp: unknown;
    budgetDraft: { plan: Record<string, number> } | null;
    gov: { parties: string[]; head: number; since: number };
    you: number; week: number; cal: { lower: number }; bills: { law: string; stage: string }[]; election: unknown; lastElection: unknown; talks: unknown; news: { text: string }[]; custom: { id: string; name: string; options: { label: string }[] }[]; laws: Record<string, number>; house: number[]; sc: { id: string; name: string } };
  endTurn: () => void;
  setUI: (p: Record<string, unknown>) => void;
  quit: () => void;
  library: { id: string; name: string }[];
};
const yg = <T,>(page: Page, f: (g: YG) => T) => page.evaluate(`(${f.toString()})(window.__yg)`) as Promise<T>;

/** Put off any decision card that has come up (Question Time, a scandal, a crisis…). */
async function dismissCards(page: Page) {
  for (const id of ["yg-qt-later", "yg-scandal-later", "yg-crisis-later", "yg-debate-later", "yg-budget-later"]) {
    const b = page.getByTestId(id);
    if (await b.isVisible().catch(() => false)) await b.click();
  }
}

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

  // Avalon is picked to begin with; on to the parties.
  await page.getByTestId("yg-next").click();
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

  // Any event twice a week, not three times.
  await page.getByTestId("yg-ev-rally").click();
  await page.getByTestId("yg-hold").click();
  await expect(page.getByTestId("yg-hold")).toHaveText("Hold it again");
  await page.getByTestId("yg-hold").click();
  await expect(page.getByTestId("yg-hold")).toBeDisabled();
  expect(await yg(page, (g) => g.s.usedEvents.filter((e) => e === "rally").length)).toBe(2);

  // Broke? A fundraiser pays for itself (the funds in the top bar open it).
  await yg(page, (g) => (g.s.parties[g.s.party].funds = 0));
  await page.getByTestId("yg-funds").click();
  await expect(page.getByTestId("yg-evkind-money")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("yg-hold")).toBeEnabled();
  await page.getByTestId("yg-hold").click();
  expect(await yg(page, (g) => g.s.parties[g.s.party].funds)).toBeGreaterThan(0);

  // Plan a town hall for two weeks' time in a region picked from the list.
  await page.getByTestId("yg-evkind-campaign").click();
  await page.getByTestId("yg-ev-townHall").click();
  await page.getByTestId("yg-week-2").click();
  await page.getByTestId("yg-region").selectOption({ index: 2 });
  await page.getByTestId("yg-plan").click();
  const plan = await yg(page, (g) => g.s.plan.map((p) => ({ event: p.event, in: p.week - g.s.week })));
  expect(plan).toEqual([{ event: "townHall", in: 2 }]);
  await page.getByTestId("yg-evkind-diary").click();
  await expect(page.getByTestId("yg-diary")).toContainText("Town hall");

  // Voters and the press, the government, your party's factions.
  await page.getByTestId("yg-tab-voters").click();
  await expect(page.getByTestId("yg-p-voters")).toContainText("Young voters");
  await page.getByTestId("yg-tab-gov").click();
  await expect(page.getByTestId("yg-cabinet")).toBeVisible();
  await page.getByTestId("yg-tab-party").click();
  await expect(page.getByTestId("yg-factions")).toBeVisible();

  // The polling centre: voting intention by group, and a seat projection.
  await page.getByTestId("yg-tab-parties").click();
  await page.getByTestId("yg-poll-groups").click();
  await expect(page.getByTestId("yg-crosstabs")).toContainText("Young voters");
  await page.getByTestId("yg-poll-seats").click();
  await page.getByTestId("yg-mrp").click();
  expect(await yg(page, (g) => !!g.s.mrp)).toBe(true);

  // Campaign HQ: hire a campaign manager.
  await page.getByTestId("yg-tab-hq").click();
  await page.getByTestId("yg-hire-manager-0").click();
  expect(await yg(page, (g) => !!g.s.staff.manager)).toBe(true);

  // In charge, write a budget: more for health.
  await yg(page, (g) => {
    g.s.gov = { parties: [g.s.party], head: g.s.you, since: g.s.week };
    g.setUI({ tab: null, budget: true });
  });
  await page.getByTestId("yg-budget-health-seg-1").click();
  await page.getByTestId("yg-budget-save").click();
  expect(await yg(page, (g) => g.s.budgetDraft?.plan.health)).toBe(1);

  // End three weeks (the hourglass and the Enter key).
  await page.getByTestId("yg-end-turn").dispatchEvent("click");
  await dismissCards(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");
  await page.getByTestId("yg-end-turn").dispatchEvent("click");
  await expect(page.getByTestId("yg-date")).toHaveText("2046.05");
  await dismissCards(page);
  // The planned town hall was held when its week came.
  expect(await yg(page, (g) => g.s.plan.length)).toBe(0);

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

  // Jump to the eve of the election: the count runs county by county, then seats change hands.
  await yg(page, (g) => {
    g.s.week = g.s.cal.lower - 1;
    g.endTurn();
  });
  expect(await yg(page, (g) => !!g.s.election)).toBe(true);
  await expect(page.getByTestId("yg-election-skip")).toBeVisible();
  await page.getByTestId("yg-election-skip").dispatchEvent("click");
  // An election-night speech.
  await expect(page.getByTestId("yg-speech")).toBeVisible();
  await page.getByTestId("yg-speech").getByRole("button").first().click();
  await expect(page.getByTestId("yg-speech")).toHaveCount(0);
  await page.getByTestId("yg-election-continue").dispatchEvent("click");
  expect(await yg(page, (g) => !g.s.election && !!g.s.lastElection)).toBe(true);
  await expect(page.getByTestId("yg-chamber")).toBeVisible();

  expect(errors).toEqual([]);
});

test("YourGov: a real country's parliament, and a scenario of your own from the studio", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "the desktop run covers play");
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_TUNNEL|Failed to load resource|supabase/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
    localStorage.setItem("zx-yourgov-prefs", JSON.stringify({ gfx: "low", sound: false }));
  });
  await page.goto("/games/yourgov?yg");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("yg-title")).toBeVisible({ timeout: 120_000 });

  // The United Kingdom: Labour's 411 seats, a Prime Minister, the Lords.
  await page.getByTestId("yg-country-gb").click();
  await page.getByTestId("yg-next").click();
  await page.getByTestId("yg-party-lab").click();
  await expect(page.getByTestId("yg-start")).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId("yg-start").click();
  await expect(page.getByTestId("yg-date")).toHaveText("2026.02");
  expect(await yg(page, (g) => ({ name: g.s.sc.name, seats: g.s.house.length }))).toEqual({ name: "United Kingdom", seats: 650 });
  await page.getByTestId("yg-tab-chamber").click();
  await expect(page.getByTestId("yg-p-chamber")).toContainText("House of Commons");
  await expect(page.getByTestId("yg-p-chamber")).toContainText("411");
  await page.getByTestId("yg-house-senate").click();
  await expect(page.getByTestId("yg-p-chamber")).toContainText("House of Lords");

  // A country of your own: a new scenario from the studio, saved, then played.
  await yg(page, (g) => g.quit());
  await page.getByTestId("yg-tab-mine").click();
  await page.getByTestId("yg-new-scenario").click();
  await expect(page.getByTestId("yg-scenario-studio")).toBeVisible();
  await page.getByTestId("yg-sc-name").fill("Freedonia");
  await page.getByTestId("yg-sc-shape-island").click();
  await page.getByTestId("yg-st-parties").click();
  await page.getByTestId("yg-sp-add").click();
  await page.getByTestId("yg-sp-name").fill("Pirate Party");
  await page.getByTestId("yg-st-system").click();
  await page.getByTestId("yg-sy-exec-parliamentary").click();
  await page.getByTestId("yg-st-share").click();
  await expect(page.getByTestId("yg-share-code")).toHaveValue(/^YG1\./);
  await page.getByTestId("yg-sc-save").click();
  await expect(page.getByTestId("yg-scenario-studio")).toHaveCount(0);
  const lib = await yg(page, (g) => g.library.map((x) => x.name));
  expect(lib).toEqual(["Freedonia"]);
  await page.getByTestId("yg-next").click();
  await page.getByTestId("yg-start").click();
  await expect(page.getByTestId("yourgov")).toBeVisible();
  expect(await yg(page, (g) => g.s.sc.name)).toBe("Freedonia");
  await expect(page.getByTestId("yg-loading")).toHaveCount(0, { timeout: 120_000 });
  expect(errors).toEqual([]);
});

test("YourGov on a phone held upright: the title card fits, panels scroll, regions come from a list", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "the phone layout");
  test.setTimeout(300_000);
  await page.addInitScript(() => {
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
    localStorage.setItem("zx-yourgov-prefs", JSON.stringify({ gfx: "low", sound: false, clouds: false }));
  });
  await page.goto("/games/yourgov?yg");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(page.getByTestId("yg-title")).toBeVisible({ timeout: 120_000 });
  // The title card is never taller than the screen (it scrolls instead).
  const vh = page.viewportSize()!.height;
  const card = await page.locator(".yg-title-card").boundingBox();
  expect(card!.y + card!.height).toBeLessThanOrEqual(vh + 1);
  await page.getByTestId("yg-next").click();
  await page.getByTestId("yg-party-grn").click();
  await page.getByTestId("yg-start").click();
  await expect(page.getByTestId("yourgov")).toBeVisible();
  await page.getByTestId("yg-tab-events").click();
  await page.getByTestId("yg-ev-rally").click();
  // The card for the event scrolls into view inside the panel.
  await expect(page.getByTestId("yg-hold")).toBeInViewport();
  await page.getByTestId("yg-region").selectOption({ index: 3 });
  await page.getByTestId("yg-hold").click();
  const held = await yg(page, (g) => g.s.usedEvents);
  expect(held).toEqual(["rally"]);
  // The panel body scrolls.
  const body = page.locator(".yg-sheet-body");
  const top = await body.evaluate((el) => {
    el.scrollTop = 0;
    el.scrollTop = 200;
    return el.scrollTop;
  });
  expect(top).toBeGreaterThan(0);
});
