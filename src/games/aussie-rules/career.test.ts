import { describe, expect, it } from "vitest";
import { ATTRS, careerTotals, matchRating, newCareer, nextSeason, overall, recordMatch, retire, simulateMatch, spendPoint, toPro, type Career } from "./career";
import { nextGame } from "./season";

/** Sim a whole season, spending points as they come (on the position's main attributes). */
function simSeason(c: Career) {
  for (let i = 0; i < 40 && c.stage === "season" && nextGame(c.season); i++) {
    const m = simulateMatch(c);
    recordMatch(c, m.line, m.us, m.them);
    for (const a of ["kicking", "marking", "speed", "endurance", "composure"] as const) while (spendPoint(c, a) && c.points > 3);
  }
}

describe("career mode", () => {
  it("starts at 17 at a local club, with a sensible player", () => {
    const c = newCareer({ name: "Jamie Rookie", number: 23, position: "keyForward", seed: 1 });
    expect(c.age).toBe(17);
    expect(c.league).toBe("local");
    expect(c.stage).toBe("season");
    expect(nextGame(c.season)?.label).toBe("Round 1");
    const p = toPro(c);
    expect(p.role).toBe(12);
    expect(p.skill.kick).toBeGreaterThan(0.6);
    expect(p.skill.kick).toBeLessThan(0.8);
    expect(overall(c)).toBeGreaterThan(40);
  });

  it("a played match: stats, rating and skill points", () => {
    const c = newCareer({ name: "A", number: 9, position: "midfielder", seed: 2 });
    const before = c.points;
    const rating = matchRating({ kicks: 18, handballs: 12, marks: 6, contested: 2, screamers: 0, tackles: 7, hitouts: 0, goals: 1, behinds: 1, inside50: 4 });
    expect(rating).toBeGreaterThan(9);
    recordMatch(c, { goals: 1, behinds: 1, kicks: 18, handballs: 12, marks: 6, tackles: 7, hitouts: 0, rating, votes: 3 }, 90, 60);
    expect(c.line.games).toBe(1);
    expect(c.line.disposals).toBe(30);
    expect(c.line.votes).toBe(3);
    expect(c.points).toBeGreaterThan(before + 3);
    expect(nextGame(c.season)?.label).toBe("Round 2");
  });

  it("good players climb: local to state to the draft, then a pro career to retirement", () => {
    const c = newCareer({ name: "Star", number: 4, position: "keyForward", seed: 7 });
    // A gifted kid.
    for (const a of ATTRS) c.attrs[a.id] = 70;
    const path: string[] = [];
    for (let season = 0; season < 16 && c.stage !== "retired"; season++) {
      simSeason(c);
      expect(c.stage).toBe("offseason");
      path.push(c.league);
      if (c.age >= 33) retire(c);
      else nextSeason(c, 9);
    }
    expect(path).toContain("national");
    expect(c.drafted).not.toBeNull();
    expect(c.honours.some((h) => h.startsWith("Drafted"))).toBe(true);
    const t = careerTotals(c);
    expect(t.pro).toBeGreaterThan(20);
    expect(t.goals).toBeGreaterThan(30);
    expect(c.history.length).toBeGreaterThanOrEqual(5);
    expect(c.stage).toBe("retired");
  });

  it("points cost more near the top, and attributes cap at 99", () => {
    const c = newCareer({ name: "B", number: 1, position: "ruck", seed: 3 });
    c.points = 10;
    c.attrs.ruck = 97;
    expect(spendPoint(c, "ruck")).toBe(true);
    expect(c.points).toBe(7);
    expect(spendPoint(c, "ruck")).toBe(true);
    expect(c.attrs.ruck).toBe(99);
    expect(spendPoint(c, "ruck")).toBe(false);
  });
});
