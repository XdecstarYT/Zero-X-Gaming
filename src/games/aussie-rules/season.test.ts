import { describe, expect, it } from "vitest";
import { draw, ladder, nextGame, premiers, recordResult, ROUNDS, startSeason } from "./season";
import { CLUBS } from "./sim";

describe("the draw", () => {
  it("everyone plays everyone exactly once over seven rounds, four games a round", () => {
    const f = draw(CLUBS.map((c) => c.id), 42);
    expect(f).toHaveLength(28);
    for (let r = 0; r < ROUNDS; r++) {
      const round = f.filter((x) => x.round === r);
      expect(round).toHaveLength(4);
      expect(new Set(round.flatMap((x) => [x.home, x.away])).size).toBe(8);
    }
    const pairs = new Set(f.map((x) => [x.home, x.away].sort().join("-")));
    expect(pairs.size).toBe(28);
  });
});

describe("a season", () => {
  it("runs from round 1 through the finals to a premier, with the ladder adding up", () => {
    const s = startSeason("hawks", 7);
    expect(nextGame(s)?.label).toBe("Round 1");
    let games = 0;
    while (nextGame(s) && games < 20) {
      // Win every game by 20.
      recordResult(s, 100, 80, { Costa: 3 });
      games++;
    }
    expect(s.stage).toBe("done");
    expect(premiers(s)).toBe(true);
    expect(games).toBe(ROUNDS + 2);
    const top = ladder(s)[0];
    expect(top.id).toBe("hawks");
    expect(top.won).toBe(7);
    expect(top.points).toBe(28);
    expect(s.votes.Costa).toBe(27);
    const rows = ladder(s);
    expect(rows.reduce((a, r) => a + r.played, 0)).toBe(56);
    expect(rows.reduce((a, r) => a + r.won, 0)).toBe(rows.reduce((a, r) => a + r.lost, 0));
  });

  it("losing every game misses the finals and the season still finishes", () => {
    const s = startSeason("kings", 3);
    for (let i = 0; i < ROUNDS; i++) recordResult(s, 50, 90);
    expect(nextGame(s)).toBeNull();
    expect(s.stage).toBe("done");
    expect(s.premier).not.toBe("kings");
    expect(s.finals).toHaveLength(3);
    expect(ladder(s).at(-1)?.id).toBe("kings");
  });
});
