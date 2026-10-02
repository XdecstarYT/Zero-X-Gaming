import { expect, test } from "./fixtures";
import type { LiveDetail, LiveMatch } from "../../src/lib/livescores";

/** Real live scores on /sports/live, with the upstream proxy mocked (tests stay offline). */
const team = (name: string, short: string, score: string, winner = false) => ({ name, short, score, logo: null, color: "#0b2a5b", winner });
const MATCHES: Record<string, LiveMatch[]> = {
  afl: [
    { id: "1", league: "AFL", state: "in", detail: "Q3 4:12", start: "2026-10-02T09:30Z", home: team("River Hawks", "RIV", "71"), away: team("Harbour Gulls", "HAR", "64"), venue: "Riverside Oval", broadcasts: ["Seven", "Kayo"], link: "https://www.espn.com/afl/game/_/gameId/1" },
    { id: "2", league: "AFL", state: "post", detail: "Final", start: "2026-10-01T09:30Z", home: team("Bay Lions", "BAY", "88", true), away: team("Hill Rams", "HIL", "80"), venue: null, broadcasts: [], link: null },
  ],
  nba: [{ id: "9", league: "NBA", state: "pre", detail: "7:30 PM", start: "2099-10-02T23:30Z", home: team("Metro Owls", "MET", ""), away: team("Lake Foxes", "LAK", ""), venue: null, broadcasts: ["TNT"], link: null }],
};

test("real live scores: leagues, live games, play by play and where to watch", async ({ page }) => {
  // The simulated channel player above shares the page; software WebGL makes it slow.
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "matchMedia", {
      value: (q: string) => ({ matches: q.includes("coarse"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    });
  });
  const asked: string[] = [];
  await page.route("**/api/live-scores?*", async (route) => {
    const q = new URL(route.request().url()).searchParams;
    const league = q.get("league")!;
    const event = q.get("event");
    asked.push(event ? `${league}:${event}` : league);
    if (league === "nfl") return route.fulfill({ status: 502, json: { error: "Live scores are unavailable right now." } });
    if (event) {
      const match = MATCHES[league].find((m) => m.id === event)!;
      const detail: LiveDetail = {
        match: { ...match, home: { ...match.home, score: "77" } },
        plays: [
          { id: "b", text: "Goal, River Hawks", clock: "4:12", period: "Q3", scoring: true },
          { id: "a", text: "Mark, Harbour Gulls", clock: "5:01", period: "Q3", scoring: false },
        ],
        stats: [["Disposals", "301", "288"]],
        videos: [{ title: "Hawks surge", link: "https://www.espn.com/video/1" }],
      };
      return route.fulfill({ json: detail });
    }
    return route.fulfill({ json: { league, updated: new Date().toISOString(), matches: MATCHES[league] ?? [] } });
  });

  await page.goto("/sports/live?league=afl");
  const real = page.getByTestId("real-live");
  await real.scrollIntoViewIfNeeded();
  await expect(real.getByRole("heading", { name: "Live scores" })).toBeVisible();
  await expect(real.getByRole("tab", { name: "AFL", exact: true })).toHaveAttribute("aria-selected", "true");
  const cards = real.getByTestId("real-matches").getByRole("button");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Q3 4:12");
  await expect(cards.first()).toContainText("River Hawks");
  await expect(real.getByTestId("real-updated")).toContainText("1 live");

  // Open the live game: refreshed score, where to watch, links out, plays and stats.
  await cards.first().click({ timeout: 60_000 });
  const detail = real.getByTestId("real-detail");
  await expect(detail.getByTestId("real-detail-score")).toContainText("64 - 77");
  await expect(detail.getByTestId("real-broadcasts")).toContainText("Kayo");
  const centre = detail.getByRole("link", { name: /Official match centre/ });
  await expect(centre).toHaveAttribute("href", "https://www.espn.com/afl/game/_/gameId/1");
  await expect(centre).toHaveAttribute("rel", "noopener noreferrer");
  await expect(detail.getByRole("link", { name: /Hawks surge/ })).toHaveAttribute("target", "_blank");
  await expect(detail.getByTestId("real-plays").locator("li").first()).toContainText("Goal, River Hawks");
  await expect(detail.getByTestId("real-stats")).toContainText("Disposals");
  await detail.getByRole("button", { name: "Close" }).click();
  await expect(detail).toHaveCount(0);

  // Another league, then one whose feed is down (with a retry).
  await real.getByRole("tab", { name: "NBA", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Lake Foxes");
  await real.getByRole("tab", { name: "NFL", exact: true }).click();
  await expect(real.getByRole("alert")).toContainText("unavailable");
  await real.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => asked.filter((a) => a === "nfl").length).toBeGreaterThanOrEqual(2);

  expect(asked).toContain("afl:1");
  expect(errors).toEqual([]);
});

test("live scores API rejects unknown leagues and bad event ids", async ({ request }) => {
  const bad = await request.get("/api/live-scores?league=quidditch");
  expect(bad.status()).toBe(400);
  const evil = await request.get("/api/live-scores?league=nba&event=../../x");
  expect(evil.status()).toBe(400);
});
