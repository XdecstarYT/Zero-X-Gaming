import { describe, expect, it } from "vitest";
import { espnDetail, espnScoreboard, espnScoreboardMatches, espnSummary, leagueById, sortMatches, tsdbDay, tsdbMatches, type LiveMatch } from "./livescores";

const espnEventJson = (id: string, state: string, extra: Record<string, unknown> = {}) => ({
  id,
  date: "2026-10-02T09:30Z",
  links: [{ rel: ["summary", "desktop", "event"], href: `https://www.espn.com/afl/game/_/gameId/${id}` }],
  competitions: [
    {
      venue: { fullName: "Riverside Oval" },
      status: { type: { state, shortDetail: state === "in" ? "Q3 4:12" : state === "post" ? "Final" : "7:30 PM" } },
      broadcasts: [{ names: ["Seven", "Kayo"] }],
      geoBroadcasts: [{ media: { shortName: "Kayo" } }, { media: { shortName: "Fox Footy" } }],
      competitors: [
        { homeAway: "away", score: "64", winner: false, team: { id: "2", displayName: "Harbour Gulls", abbreviation: "HAR", logo: "https://a.espncdn.com/x.png", color: "0b2a5b" } },
        { homeAway: "home", score: "71", winner: true, team: { id: "1", displayName: "River Hawks", abbreviation: "RIV", logo: "http://insecure/x.png", color: "nope" } },
      ],
      ...extra,
    },
  ],
});

describe("league config", () => {
  it("builds upstream urls", () => {
    const afl = leagueById("afl")!;
    expect(espnScoreboard(afl)).toBe("https://site.api.espn.com/apis/site/v2/sports/australian-football/afl/scoreboard");
    expect(espnSummary(afl, "123")).toContain("/summary?event=123");
    expect(tsdbDay(leagueById("cricket")!, "2026-10-02")).toBe("https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=2026-10-02&s=Cricket");
    expect(leagueById("nope")).toBeUndefined();
  });
});

describe("ESPN normalisers", () => {
  it("reads a scoreboard", () => {
    const [m] = espnScoreboardMatches("AFL", { events: [espnEventJson("401", "in")] });
    expect(m).toMatchObject({ id: "401", league: "AFL", state: "in", detail: "Q3 4:12", venue: "Riverside Oval", link: "https://www.espn.com/afl/game/_/gameId/401" });
    expect(m.home).toMatchObject({ name: "River Hawks", short: "RIV", score: "71", winner: true, logo: null, color: null });
    expect(m.away).toMatchObject({ name: "Harbour Gulls", logo: "https://a.espncdn.com/x.png", color: "#0b2a5b" });
    expect(m.broadcasts).toEqual(["Seven", "Kayo", "Fox Footy"]);
  });

  it("shrugs off junk", () => {
    expect(espnScoreboardMatches("AFL", null)).toEqual([]);
    expect(espnScoreboardMatches("AFL", { events: [{}, "x", { competitions: [{ competitors: [{}] }] }] })).toEqual([]);
  });

  it("reads a game summary: plays newest first, stats side by side, clips", () => {
    const ev = espnEventJson("401", "post");
    const d = espnDetail("AFL", {
      header: { id: "401", links: ev.links, competitions: ev.competitions },
      plays: [
        { id: "a", text: "Ball up", clock: { displayValue: "20:00" }, period: { number: 1 } },
        { id: "b", text: "Goal, River Hawks", scoringPlay: true, clock: { displayValue: "18:12" }, period: { displayValue: "1st" } },
        { id: "c", text: "" },
      ],
      boxscore: {
        teams: [
          { team: { id: "2" }, statistics: [{ name: "disposals", label: "Disposals", displayValue: "301" }] },
          { team: { id: "1" }, statistics: [{ name: "disposals", label: "Disposals", displayValue: "342" }] },
        ],
      },
      videos: [
        { headline: "Hawks hold on", links: { web: { href: "https://www.espn.com/video/1" } } },
        { headline: "No link" },
      ],
    })!;
    expect(d.match.state).toBe("post");
    expect(d.plays.map((p) => p.id)).toEqual(["b", "a"]);
    expect(d.plays[0]).toMatchObject({ scoring: true, clock: "18:12", period: "1st" });
    expect(d.plays[1].period).toBe("P1");
    expect(d.stats).toEqual([["Disposals", "342", "301"]]);
    expect(d.videos).toEqual([{ title: "Hawks hold on", link: "https://www.espn.com/video/1" }]);
  });

  it("falls back to football key events", () => {
    const ev = espnEventJson("9", "in");
    const d = espnDetail("EPL", { header: { id: "9", competitions: ev.competitions }, keyEvents: [{ id: "k", text: "Goal! 1-0", type: { text: "Goal" }, clock: { displayValue: "23'" } }] })!;
    expect(d.plays).toEqual([{ id: "k", text: "Goal! 1-0", clock: "23'", period: "", scoring: true }]);
    expect(espnDetail("EPL", {})).toBeNull();
  });
});

describe("TheSportsDB normaliser", () => {
  it("reads finished, live and upcoming games", () => {
    const ms = tsdbMatches("Cricket", {
      events: [
        { idEvent: "1", strLeague: "Test Series", strHomeTeam: "Northern Stags", strAwayTeam: "Coastal Kings", intHomeScore: "245", intAwayScore: "198", strStatus: "Match Finished", strResult: "Stags won by 47 runs\nmore", strTimestamp: "2026-10-01T04:00:00", strHomeTeamBadge: "https://r2.thesportsdb.com/b.png" },
        { idEvent: "2", strHomeTeam: "Western Owls", strAwayTeam: "Eastern Foxes", intHomeScore: "88", strStatus: "1st Innings", dateEvent: "2026-10-02", strTime: "03:00:00" },
        { idEvent: "3", strHomeTeam: "A Side", strAwayTeam: "B Side", strStatus: "Not Started", dateEvent: "2026-10-02", strTime: "10:00:00" },
        { strHomeTeam: "No id" },
      ],
    });
    expect(ms.map((m) => m.state)).toEqual(["post", "in", "pre"]);
    expect(ms[0]).toMatchObject({ league: "Test Series", detail: "Stags won by 47 runs", start: "2026-10-01T04:00:00Z", link: "https://www.thesportsdb.com/event/1" });
    expect(ms[0].home).toMatchObject({ short: "NS", winner: true, logo: "https://r2.thesportsdb.com/b.png" });
    expect(ms[0].away.winner).toBe(false);
    expect(ms[1]).toMatchObject({ league: "Cricket", detail: "1st Innings", start: "2026-10-02T03:00:00Z" });
    expect(tsdbMatches("Cricket", { events: null })).toEqual([]);
  });
});

describe("sortMatches", () => {
  const m = (id: string, state: LiveMatch["state"], start: string) => ({ id, state, start }) as LiveMatch;
  it("puts live first, then upcoming soonest, then finished latest", () => {
    const out = sortMatches([m("p1", "post", "2026-10-01T01:00Z"), m("u2", "pre", "2026-10-02T12:00Z"), m("l", "in", "x"), m("u1", "pre", "2026-10-02T09:00Z"), m("p2", "post", "2026-10-01T05:00Z")]);
    expect(out.map((x) => x.id)).toEqual(["l", "u1", "u2", "p2", "p1"]);
  });
});
