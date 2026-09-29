import { describe, expect, it } from "vitest";
import { createRng } from "../engine/rng";
import {
  allMoves,
  applyMove,
  collapse,
  createBoard,
  createLock,
  findMatches,
  idx,
  MISS_PENALTY_S,
  resolve,
  ROUND_SECONDS,
  SIZE,
  slide,
  tick,
  type Board,
} from "./logic";

const board = (rows: string[]): Board => rows.join("").split("").map(Number);
/** Row 0 has a horizontal 000; column 5 has a vertical 333 in rows 2–4. Nothing else matches. */
const FIXTURE = ["000123", "123401", "234013", "340123", "401233", "012341"];

describe("grid lock board", () => {
  it("generates boards with no ready-made matches", () => {
    for (let seed = 1; seed <= 50; seed++) expect(findMatches(createBoard(createRng(seed))).size).toBe(0);
  });

  it("finds horizontal and vertical runs of 3+", () => {
    const b = board(FIXTURE);
    const m = findMatches(b);
    expect([...m].sort((a, b) => a - b)).toEqual([0, 1, 2, idx(2, 5), idx(3, 5), idx(4, 5)]);
  });

  it("slides rows and columns with wrap-around", () => {
    const b = board(["012340", "123401", "234012", "340123", "401234", "012341"]);
    expect(slide(b, { axis: "row", index: 0, dir: 1 }).slice(0, SIZE)).toEqual([0, 0, 1, 2, 3, 4]);
    expect(slide(b, { axis: "row", index: 0, dir: -1 }).slice(0, SIZE)).toEqual([1, 2, 3, 4, 0, 0]);
    const down = slide(b, { axis: "col", index: 0, dir: 1 });
    expect(Array.from({ length: SIZE }, (_, r) => down[idx(r, 0)])).toEqual([0, 0, 1, 2, 3, 4]);
  });

  it("collapse drops tiles down and refills the top", () => {
    const b = board(["000000", "111111", "222222", "333333", "444444", "012340"]);
    const cleared = new Set([idx(5, 0)]);
    const next = collapse(b, cleared, createRng(1));
    expect(next[idx(5, 0)]).toBe(4); // tile above fell
    expect(next[idx(1, 0)]).toBe(0);
    expect(next[idx(0, 0)]).toBeGreaterThanOrEqual(0);
  });

  it("scores cascades with increasing multipliers and always ends stable", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = createRng(seed);
      const res = resolve(board(FIXTURE), rng);
      expect(res.cleared).toBeGreaterThanOrEqual(6);
      expect(res.points).toBeGreaterThanOrEqual(60);
      expect(res.points).toBeGreaterThanOrEqual(res.cleared * 10);
      expect(findMatches(res.board).size).toBe(0);
    }
  });
});

describe("grid lock rounds", () => {
  it("misses cost time and the round ends at zero", () => {
    const s = createLock(3);
    const miss = allMoves().find((m) => resolve(slide(s.board, m), createRng(0)).cleared === 0)!;
    applyMove(s, miss);
    expect(s.timeLeft).toBe(ROUND_SECONDS - MISS_PENALTY_S);
    tick(s, 1000);
    expect(s.over).toBe(true);
    expect(applyMove(s, miss).cleared).toBe(0);
  });

  it("a fast greedy player stays under the server's 800 points/second limit", () => {
    let worst = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = createLock(seed);
      const MOVES_PER_SECOND = 4; // well above human pace
      while (!s.over) {
        // Greedy: pick the move that clears the most (peeking with a throwaway RNG).
        let best = allMoves()[0];
        let bestCleared = -1;
        for (const m of allMoves()) {
          const c = findMatches(slide(s.board, m)).size;
          if (c > bestCleared) {
            bestCleared = c;
            best = m;
          }
        }
        applyMove(s, best);
        tick(s, 1 / MOVES_PER_SECOND);
      }
      worst = Math.max(worst, s.score / ROUND_SECONDS);
    }
    expect(worst).toBeGreaterThan(20);
    expect(worst).toBeLessThan(800);
  });
});
