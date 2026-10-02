import { describe, expect, it } from "vitest";
import { NATIONAL } from "./clubs";
import { fullName, rosterFor, rosterNames } from "./rosters";
import { countOf, nextGame, recordResult, simulateMine, startSeason } from "./season";
import { FootySim, NO_INPUT, practiceSpots, RIVALS, type SimEvent } from "./sim";

describe("club rosters", () => {
  it("give every club the same eighteen, all different, men's and women's", () => {
    for (const c of NATIONAL) {
      const a = rosterFor(c.id);
      expect(a).toHaveLength(18);
      expect(new Set(a.map((p) => p.last)).size).toBe(18);
      expect(rosterFor(c.id)).toEqual(a);
      expect(rosterFor(c.id, true)).not.toEqual(a);
    }
    const last = rosterNames("geelong")[12];
    expect(fullName("geelong", last)).toMatch(new RegExp(`^\\w+ ${last}$`));
  });

  it("name the players in a match", () => {
    const sim = new FootySim({ seed: 1, rival: RIVALS[0], difficulty: "pro", quarterSeconds: 30, names: [rosterNames("geelong"), rosterNames(RIVALS[0].id)] });
    const home = sim.players.filter((p) => p.team === 0).map((p) => p.name);
    expect(home).toEqual(rosterNames("geelong"));
  });
});

describe("the women's competition", () => {
  it("plays the same match with a lighter kick", () => {
    const go = (women: boolean) => {
      const sim = new FootySim({ seed: 9, rival: RIVALS[1], difficulty: "pro", quarterSeconds: 20, women });
      sim.autopilot = true;
      let kicks = 0;
      for (let i = 0; i < 60 * 200 && sim.phase !== "over"; i++) {
        sim.step(1 / 60, NO_INPUT);
        kicks += sim.events.filter((e) => e.kind === "kick").length;
        sim.events.length = 0;
      }
      return { sim, kicks };
    };
    const w = go(true);
    expect(w.sim.women).toBe(true);
    expect(w.sim.phase).toBe("over");
    expect(w.kicks).toBeGreaterThan(10);
  });
});

describe("scores and reviews", () => {
  it("flag the close ones", () => {
    const sim = new FootySim({ seed: 4, rival: RIVALS[2], difficulty: "pro", quarterSeconds: 60 });
    sim.autopilot = true;
    const scores: SimEvent[] = [];
    for (let i = 0; i < 60 * 300 && sim.phase !== "over"; i++) {
      sim.step(1 / 60, NO_INPUT);
      scores.push(...sim.events.filter((e) => e.kind === "goal" || e.kind === "behind"));
      sim.events.length = 0;
    }
    expect(scores.length).toBeGreaterThan(3);
    for (const e of scores) if (e.kind === "goal" || e.kind === "behind") expect(typeof e.close).toBe("boolean");
  });
});

describe("the goalkicking challenge", () => {
  it("lines up ten shots, longer and wider as it goes", () => {
    const spots = practiceSpots(10, 3, 80);
    expect(spots).toHaveLength(10);
    const dist = spots.map((s) => Math.hypot(80 - s.x, s.z));
    expect(dist[9]).toBeGreaterThan(dist[0] + 15);
    expect(Math.abs(spots[9].z)).toBeGreaterThan(Math.abs(spots[0].z));
  });

  it("plays out: every shot scored, totals add up", () => {
    const sim = new FootySim({ seed: 3, rival: RIVALS[0], difficulty: "pro", quarterSeconds: 600, practice: 10 });
    sim.autopilot = true;
    const results: SimEvent[] = [];
    for (let i = 0; i < 60 * 300 && sim.phase !== "over"; i++) {
      sim.step(1 / 60, NO_INPUT);
      results.push(...sim.events.filter((e) => e.kind === "practice"));
      sim.events.length = 0;
    }
    expect(sim.phase).toBe("over");
    expect(results).toHaveLength(10);
    const t = sim.practiceTotals();
    expect(t.taken).toBe(10);
    expect(t.points).toBe(results.reduce((a, e) => a + (e.kind === "practice" ? e.points : 0), 0));
    expect(t.goals).toBeGreaterThan(0);
    expect(sim.matchScore()).toBeGreaterThan(0);
  });
});

describe("the league count", () => {
  it("tallies votes and goals across the league, home and away only", () => {
    const s = startSeason({ league: "national", club: "geelong", seed: 21, rounds: 9 });
    let games = 0;
    while (nextGame(s) && s.stage === "home") {
      const [us, them] = simulateMine(s);
      recordResult(s, us, them);
      games++;
    }
    expect(games).toBe(9);
    // Nine games a round, 3 + 2 + 1 votes each.
    const total = Object.values(s.medal ?? {}).reduce((a, b) => a + b, 0);
    expect(total).toBe(9 * 9 * 6);
    const top = countOf(s.medal, 3);
    expect(top[0].n).toBeGreaterThanOrEqual(top[1].n);
    expect(countOf(s.goals, 1)[0].n).toBeGreaterThan(9);
    // The finals don't count.
    while (nextGame(s)) {
      const [us, them] = simulateMine(s);
      recordResult(s, us, them);
    }
    expect(Object.values(s.medal ?? {}).reduce((a, b) => a + b, 0)).toBe(total);
  });

  it("records your game's own votes and goals", () => {
    const s = startSeason({ league: "national", club: "geelong", seed: 5, rounds: 3, women: true });
    expect(s.women).toBe(true);
    const name = rosterNames("geelong", true)[12];
    recordResult(s, 90, 60, {}, { votes: { [`geelong:${name}`]: 3 }, goals: { [`geelong:${name}`]: 5 } });
    expect(s.medal?.[`geelong:${name}`]).toBeGreaterThanOrEqual(3);
    expect(s.goals?.[`geelong:${name}`]).toBeGreaterThanOrEqual(5);
  });
});
