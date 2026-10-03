import { describe, expect, it } from "vitest";
import { allLeagueTeam, countOf, formGuide, headlines, honourOf, nextGame, nextYear, recordResult, simulateMine, startSeason, streak, type Season } from "./season";

const playOut = (s: Season) => {
  while (nextGame(s)) {
    const [us, them] = simulateMine(s);
    recordResult(s, us, them);
  }
};

describe("a premiership dynasty", () => {
  it("rolls on year to year with the honour board", () => {
    let s = startSeason({ league: "national", club: "melbourne", seed: 3, rounds: 9, year: 2027, momentum: true });
    playOut(s);
    const h = honourOf(s)!;
    expect(h.year).toBe(2027);
    expect(h.premier).toBe(s.premier);
    expect(h.score[0]).toBeGreaterThanOrEqual(h.score[1]);
    s = nextYear(s);
    expect(s.year).toBe(2028);
    expect(s.honours).toHaveLength(1);
    expect(s.stage).toBe("home");
    expect(s.club).toBe("melbourne");
    playOut(s);
    s = nextYear(s);
    expect(s.honours!.map((x) => x.year)).toEqual([2027, 2028]);
  });

  it("keeps the medal count round by round, adding up to the total", () => {
    const s = startSeason({ league: "national", club: "fremantle", seed: 12, rounds: 9, momentum: true });
    playOut(s);
    const rounds = s.medalRounds!;
    expect(rounds.length).toBe(9);
    const sum: Record<string, number> = {};
    for (const r of rounds) for (const [k, v] of Object.entries(r)) sum[k] = (sum[k] ?? 0) + v;
    expect(sum).toEqual(s.medal);
    expect(allLeagueTeam(s)).toHaveLength(18);
    expect(allLeagueTeam(s)[0]).toEqual(countOf(s.medal, 1)[0]);
  });

  it("has form guides, streaks, talking points and momentum", () => {
    const s = startSeason({ league: "national", club: "adelaide", seed: 44, rounds: 17, momentum: true });
    for (let i = 0; i < 8; i++) recordResult(s, 130, 40);
    expect(formGuide(s, "adelaide")).toEqual(["W", "W", "W", "W", "W"]);
    expect(streak(s, "adelaide")).toBe(8);
    const news = headlines(s);
    expect(news.length).toBeGreaterThan(0);
    expect(news.some((n) => /smash|on the trot|sit on top/.test(n))).toBe(true);
    expect(Object.keys(s.drift ?? {}).length).toBe(18);
    expect(Math.max(...Object.values(s.drift!).map(Math.abs))).toBeLessThanOrEqual(0.07);
  });
});
