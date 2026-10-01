import { describe, expect, it } from "vitest";
import { TennisScore, type Side } from "./score";

const win = (s: TennisScore, p: Side, n: number) => {
  for (let i = 0; i < n; i++) s.point(p);
};
const game = (s: TennisScore, p: Side) => win(s, p, 4);

describe("tennis scoring", () => {
  it("counts love, 15, 30, 40, deuce and advantage", () => {
    const s = new TennisScore("set");
    expect(s.calls()).toEqual(["0", "0"]);
    expect(s.announce(["A", "B"])).toBe("Love all");
    s.point(0);
    expect(s.calls()).toEqual(["15", "0"]);
    expect(s.announce(["A", "B"])).toBe("15–love");
    win(s, 1, 2);
    expect(s.announce(["A", "B"])).toBe("15–30");
    win(s, 0, 2);
    win(s, 1, 1);
    expect(s.announce(["A", "B"])).toBe("Deuce");
    s.point(1);
    expect(s.calls()).toEqual(["", "AD"]);
    expect(s.announce(["A", "B"])).toBe("Advantage B");
    s.point(0);
    expect(s.announce(["A", "B"])).toBe("Deuce");
    win(s, 0, 2);
    expect(s.games).toEqual([1, 0]);
    expect(s.points).toEqual([0, 0]);
  });

  it("switches server each game and the court each point", () => {
    const s = new TennisScore("set", 0);
    expect(s.court).toBe("deuce");
    s.point(1);
    expect(s.court).toBe("ad");
    win(s, 0, 4);
    expect(s.server).toBe(1);
    expect(s.court).toBe("deuce");
  });

  it("a set is won by two games; 6–6 goes to a tiebreak to 7", () => {
    const s = new TennisScore("set");
    for (let i = 0; i < 5; i++) {
      game(s, 0);
      game(s, 1);
    }
    game(s, 0);
    expect(s.games).toEqual([6, 5]);
    expect(s.winner).toBe(-1);
    game(s, 1);
    expect(s.tiebreak).toBe(true);
    // Tiebreak serving: first point one player, then two each.
    const first = s.server;
    s.point(0);
    expect(s.server).toBe(1 - first);
    s.point(0);
    expect(s.server).toBe(1 - first);
    s.point(1);
    expect(s.server).toBe(first);
    win(s, 0, 4);
    expect(s.calls()).toEqual(["6", "1"]);
    expect(s.pressure()).toEqual({ kind: "match", for: 0 });
    s.point(0);
    expect(s.winner).toBe(0);
    expect(s.line(0)).toBe("7–6");
  });

  it("best of three needs two sets", () => {
    const s = new TennisScore("three");
    for (let i = 0; i < 6; i++) game(s, 0);
    expect(s.winner).toBe(-1);
    expect(s.sets).toEqual([[6, 0]]);
    for (let i = 0; i < 6; i++) game(s, 1);
    expect(s.winner).toBe(-1);
    for (let i = 0; i < 6; i++) game(s, 0);
    expect(s.winner).toBe(0);
    expect(s.line(0)).toBe("6–0 0–6 6–0");
    expect(s.line(1)).toBe("0–6 6–0 0–6");
  });

  it("a match tiebreak is first to 10 by two", () => {
    const s = new TennisScore("tiebreak");
    win(s, 0, 9);
    win(s, 1, 9);
    s.point(0);
    expect(s.winner).toBe(-1);
    s.point(0);
    expect(s.winner).toBe(0);
    expect(s.sets).toEqual([[11, 9]]);
  });

  it("flags break points", () => {
    const s = new TennisScore("set", 0);
    win(s, 1, 3);
    expect(s.pressure()).toEqual({ kind: "break", for: 1 });
  });
});
