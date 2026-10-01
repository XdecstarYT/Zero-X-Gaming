import { describe, expect, it } from "vitest";
import { LEAGUES, NATIONAL } from "./clubs";
import { draw, finish, ladder, nextGame, premiers, recordResult, simulateMine, startSeason } from "./season";

describe("the draw", () => {
  it("one round robin: everyone plays everyone once", () => {
    const ids = NATIONAL.map((c) => c.id);
    const f = draw(ids, 42);
    expect(f).toHaveLength(17 * 9);
    for (let r = 0; r < 17; r++) {
      const round = f.filter((x) => x.round === r);
      expect(round).toHaveLength(9);
      expect(new Set(round.flatMap((x) => [x.home, x.away])).size).toBe(18);
    }
    expect(new Set(f.map((x) => [x.home, x.away].sort().join("-"))).size).toBe(153);
  });

  it("a full 23-round season: everyone plays every round, nobody meets anyone three times", () => {
    const ids = NATIONAL.map((c) => c.id);
    const f = draw(ids, 7, 23);
    expect(f).toHaveLength(23 * 9);
    const meet = new Map<string, number>();
    for (const x of f) {
      const k = [x.home, x.away].sort().join("-");
      meet.set(k, (meet.get(k) ?? 0) + 1);
    }
    expect(Math.max(...meet.values())).toBeLessThanOrEqual(2);
    for (const id of ids) expect(f.filter((x) => x.home === id || x.away === id)).toHaveLength(23);
  });
});

describe("a National League season with the final eight", () => {
  it("win everything: 23 rounds, a qualifying final, a week off, a prelim, the flag", () => {
    const s = startSeason({ league: "national", club: "geelong", seed: 11 });
    const labels: string[] = [];
    let games = 0;
    while (nextGame(s) && games < 40) {
      labels.push(nextGame(s)!.label);
      recordResult(s, 120, 60, { Smith: 2 });
      games++;
    }
    expect(games).toBe(23 + 3);
    expect(labels.slice(-3)).toEqual(["Qualifying final", "Preliminary final", "Grand Final"]);
    expect(premiers(s)).toBe(true);
    expect(finish(s)).toBe("Premiers");
    expect(ladder(s)[0].id).toBe("geelong");
    expect(s.finals).toHaveLength(9);
    expect(s.votes.Smith).toBe(52);
  });

  it("finishing fifth to eighth means the long way: elimination, semi, prelim, Grand Final", () => {
    const s = startSeason({ league: "national", club: "stkilda", seed: 5, rounds: 17 });
    // Lose a few, win the rest: land in 5th–8th.
    let n = 0;
    while (s.stage === "home" && n < 17) {
      recordResult(s, n < 7 ? 50 : 110, n < 7 ? 90 : 70);
      n++;
    }
    const pos = ladder(s).findIndex((r) => r.id === "stkilda") + 1;
    const labels: string[] = [];
    while (nextGame(s)) {
      labels.push(nextGame(s)!.label);
      recordResult(s, 100, 80);
    }
    if (pos > 8) expect(labels).toEqual([]);
    else if (pos > 4) expect(labels).toEqual(["Elimination final", "Semi-final", "Preliminary final", "Grand Final"]);
    else expect(labels[0]).toBe("Qualifying final");
    expect(s.stage).toBe("done");
  });

  it("losing every game misses the finals; the season still finishes", () => {
    const s = startSeason({ league: "national", club: "sydney", seed: 3, rounds: 9 });
    while (nextGame(s)) recordResult(s, 40, 100);
    expect(s.stage).toBe("done");
    expect(s.premier).not.toBe("sydney");
    expect(ladder(s).at(-1)?.id).toBe("sydney");
    expect(finish(s)).toBe("18th on the ladder");
  });

  it("simulating your own games works the same way", () => {
    const s = startSeason({ league: "state", club: "hawks", seed: 9 });
    let n = 0;
    while (nextGame(s) && n < 30) {
      const [us, them] = simulateMine(s, 1.1);
      expect(us).toBeGreaterThan(0);
      recordResult(s, us, them);
      n++;
    }
    expect(s.stage).toBe("done");
    expect(ladder(s).reduce((a, r) => a + r.played, 0)).toBe(LEAGUES.state.rounds * 8);
  });
});
