import { describe, expect, it } from "vitest";
import { acceptTrade, bestEighteen, closeDraft, CoachMatch, draftPick, newCoach, openDraft, openTrades, simCoachGame, stay, takeJob, teamRating, yourPick, type Coach } from "./coach";
import { formGuide, headlines, honourOf, ladder, nextGame } from "./season";

/** Coach a whole season on autopilot (stopping if the board sacks you). */
function playSeason(c: Coach) {
  let games = 0;
  while (c.stage === "season" && nextGame(c.season) && games < 40) {
    simCoachGame(c);
    games++;
  }
  return games;
}

describe("coach career", () => {
  it("starts you with a list of thirty, a picked eighteen and a target", () => {
    const c = newCoach({ name: "Kim Hart", club: "geelong", seed: 99, rounds: 9 });
    expect(c.squad).toHaveLength(30);
    expect(new Set(c.squad.map((p) => p.last)).size).toBe(30);
    expect(c.selected).toHaveLength(18);
    const lines = c.selected.map((id) => c.squad.find((p) => p.id === id)!.line);
    expect(lines.filter((l) => l === "back")).toHaveLength(6);
    expect(lines.filter((l) => l === "ruck")).toHaveLength(1);
    expect([1, 4, 8, 12, 14]).toContain(c.target);
    expect(c.news[0]).toMatch(/new senior coach/);
  });

  it("coaches a match quarter by quarter with changes and a speech", () => {
    const c = newCoach({ name: "Kim Hart", club: "sydney", seed: 5, rounds: 9 });
    const m = new CoachMatch(c);
    m.playQuarter();
    expect(m.q).toBe(1);
    const off = m.on[0];
    const on = m.bench[0].id;
    expect(m.interchange(off, on)).toBe(true);
    expect(m.on).toContain(on);
    m.speech = "fire";
    m.tactic = "attack";
    m.playOut();
    expect(m.done).toBe(true);
    expect(m.quarters).toHaveLength(4);
    const [us, them] = m.points;
    expect(us + them).toBeGreaterThan(60);
    const { awards } = m.awards();
    expect(Object.values(awards.votes).sort()).toEqual([1, 2, 3]);
    const goals = Object.values(awards.goals).reduce((a, b) => a + b, 0);
    expect(goals).toBe(m.score[0].g + m.score[1].g);
  });

  it("better teams win more", () => {
    const wins = (boost: number) => {
      let w = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const c = newCoach({ name: "A", club: "carlton", seed, rounds: 3 });
        for (const p of c.squad) p.rating += boost;
        const m = new CoachMatch(c);
        m.playOut();
        if (m.points[0] > m.points[1]) w++;
      }
      return w;
    };
    expect(wins(15)).toBeGreaterThan(wins(-15) + 8);
  });

  it("plays a season, reviews it, trades, drafts and starts the next year older and wiser", () => {
    const c = newCoach({ name: "Kim Hart", club: "hawthorn", seed: 21, rounds: 9 });
    for (const p of c.squad) p.rating = Math.min(97, p.rating + 12);
    c.security = 100;
    playSeason(c);
    expect(c.history).toHaveLength(1);
    expect(c.history[0].year).toBe(2027);
    expect(c.review?.awards.length).toBeGreaterThan(0);
    expect(c.stage).toBe("review");
    expect(c.totals.won + c.totals.lost + c.totals.drawn).toBeGreaterThanOrEqual(9);
    expect(formGuide(c.season, c.club).length).toBe(5);
    expect(headlines(c.season, 3).length).toBeGreaterThan(0);
    expect(honourOf(c.season)?.year).toBe(2027);
    openTrades(c);
    expect(c.stage).toBe("trades");
    expect(c.trades.length).toBeGreaterThan(0);
    const t = c.trades[0];
    expect(acceptTrade(c, 0)).toBe(true);
    expect(c.squad.some((p) => p.id === t.give)).toBe(false);
    expect(c.squad.some((p) => p.id === t.get.id)).toBe(true);
    openDraft(c);
    expect(c.stage).toBe("draft");
    let picks = 0;
    while (yourPick(c)) {
      const best = c.draft!.pool[0];
      expect(draftPick(c, best.id)).toBe(true);
      picks++;
    }
    expect(picks).toBe(2);
    expect(c.draft!.log.length).toBe(36);
    const oldest = Math.max(...c.squad.map((p) => p.age));
    closeDraft(c);
    if (c.stage === "offers") stay(c);
    expect(c.stage).toBe("season");
    expect(c.year).toBe(2028);
    expect(c.season.year).toBe(2028);
    expect(c.season.honours).toHaveLength(1);
    expect(c.squad.length).toBeGreaterThanOrEqual(30);
    expect(c.squad.some((p) => p.drafted === 2027)).toBe(true);
    expect(Math.max(...c.squad.map((p) => p.age))).toBeLessThanOrEqual(oldest + 1);
    expect(bestEighteen(c)).toHaveLength(18);
  });

  it("the board sacks a losing coach, and a struggling club gives you another go", () => {
    const c = newCoach({ name: "Kim Hart", club: "richmond", seed: 8, rounds: 23 });
    for (const p of c.squad) p.rating = 40;
    expect(teamRating(c)).toBeLessThan(45);
    c.security = 20;
    playSeason(c);
    expect(c.stage).toBe("sacked");
    expect(c.history.at(-1)!.sacked).toBe(true);
    expect(c.offers.length).toBeGreaterThan(0);
    const club = c.offers[0];
    expect(takeJob(c, club)).toBe(true);
    expect(c.club).toBe(club);
    expect(c.stage).toBe("season");
    expect(ladder(c.season)).toHaveLength(18);
  });
});
