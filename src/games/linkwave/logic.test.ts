import { describe, expect, it } from "vitest";
import { createRng } from "../engine/rng";
import { at, blast, COLS, commit, extend, hasMove, isLoop, linkSize, MIN_LINK, newBoard, newGame, pointsFor, ROWS, START_TIME, tick, type Board, type Game, type Pos } from "./logic";

/** A board from a picture: one letter a colour (a–e), P a pulse, X a prism (colour 0). */
function boardFrom(rows: string[]): Board {
  const b: Board = { cells: Array.from({ length: COLS }, () => []), nextId: 1 };
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const ch = rows[r][c];
      const kind = ch === "P" ? "pulse" : ch === "X" ? "prism" : "node";
      b.cells[c][r] = { color: kind === "node" ? ch.charCodeAt(0) - 97 : 0, kind, id: b.nextId++ };
    }
  return b;
}
const game = (rows: string[]): Game => ({ ...newGame(1), board: boardFrom(rows) });
const P = (c: number, r: number): Pos => ({ c, r });
const drag = (g: Game, path: Pos[]) => path.reduce((ch, p) => extend(g.board, ch, p), [] as Pos[]);

const PLAIN = ["aabbcc", "aabbcc", "ddeedd", "eeddee", "abcdea", "bcdeab", "cdeabc", "deabcd"];

describe("Linkwave", () => {
  it("links neighbours of one colour, steps back, and refuses anything else", () => {
    const g = game(PLAIN);
    expect(drag(g, [P(0, 0), P(1, 0), P(1, 1)])).toHaveLength(3);
    // Not a neighbour, a different colour: ignored.
    expect(drag(g, [P(0, 0), P(2, 0)])).toEqual([P(0, 0)]);
    expect(drag(g, [P(0, 0), P(0, 1), P(2, 2)])).toHaveLength(2);
    // Dragging back onto the previous node undoes the step.
    expect(drag(g, [P(0, 0), P(1, 0), P(0, 0)])).toEqual([P(0, 0)]);
  });

  it("clears a link of three or more, scores it, lets the column fall and refills", () => {
    const g = game(PLAIN);
    const top = at(g.board, P(0, 2)).id;
    const r = commit(g, drag(g, [P(0, 0), P(1, 0), P(1, 1)]))!;
    expect(r.cleared).toHaveLength(3);
    expect(g.score).toBe(r.points);
    expect(r.points).toBe(pointsFor(3, 0, false, 1));
    // Nothing above (0,2) fell in column 0? (0,0) went, so (0,1) fell one; (0,2) stays.
    expect(at(g.board, P(0, 2)).id).toBe(top);
    expect(g.board.cells.every((col) => col.length === ROWS)).toBe(true);
    expect(commit(g, drag(g, [P(2, 2), P(3, 2)]))).toBeNull();
  });

  it("a loop takes every node of its colour and leaves a prism", () => {
    const g = game(PLAIN);
    const chain = drag(g, [P(0, 0), P(1, 0), P(1, 1), P(0, 1), P(0, 0)]);
    expect(isLoop(chain)).toBe(true);
    expect(linkSize(chain)).toBe(4);
    const before = START_TIME;
    const r = commit(g, chain)!;
    expect(r.loop).toBe(true);
    expect(r.made?.kind).toBe("prism");
    // Every "a": the four in the corner and the five scattered below.
    expect(r.cleared.length).toBe(4 + 5 - 1);
    expect(g.time).toBe(before + 3);
  });

  it("a link of six leaves a pulse, and a pulse clears the 3×3 around it", () => {
    const g = game(["aaabbc", "cccabc", "dddeee", "eeedda", "abcdea", "bcdeab", "cdeabc", "deabcd"]);
    const r = commit(g, drag(g, [P(0, 0), P(1, 0), P(2, 0), P(3, 1)].slice(0, 3)));
    expect(r?.made).toBeNull();
    const h = game(["aaaaaa", "bbbbbb", "cccccc", "dddddd", "eeeeee", "abcdea", "bcdeab", "cdeabc"]);
    const six = drag(h, [0, 1, 2, 3, 4, 5].map((c) => P(c, 0)));
    expect(commit(h, six)!.made?.kind).toBe("pulse");
    const b = boardFrom(["aaaaaa", "aaPaaa", "aaaaaa", "aaaaaa", "aaaaaa", "aaaaaa", "aaaaaa", "aaaaaa"]);
    expect(blast(b, [P(2, 1)]).size).toBe(9);
    const x = boardFrom(["aaaaaa", "aaXaaa", "aaaaaa", "aaaaaa", "aaaaaa", "aaaaaa", "aaaaaa", "aaaaaa"]);
    expect(blast(x, [P(2, 1)]).size).toBe(COLS + ROWS - 1);
  });

  it("quick links build a combo; the clock ends the run", () => {
    const g = game(PLAIN);
    commit(g, drag(g, [P(0, 0), P(1, 0), P(1, 1)]));
    expect(g.combo).toBe(1);
    tick(g, 1);
    const ok = (() => {
      for (let c = 0; c < COLS; c++)
        for (let r = 0; r < ROWS; r++) {
          const col = at(g.board, P(c, r)).color;
          const path = [P(c, r)];
          for (const n of [P(c + 1, r), P(c + 1, r + 1), P(c, r + 1)]) if (at(g.board, n)?.color === col) path.push(n);
          const ch = drag(g, path);
          if (linkSize(ch) >= MIN_LINK) return commit(g, ch);
        }
      return null;
    })();
    if (ok) expect(g.combo).toBe(2);
    tick(g, 99);
    expect(g.over).toBe(true);
    expect(commit(g, [P(0, 0), P(1, 0), P(2, 0)])).toBeNull();
  });

  it("every board has a move, from a new game through a hundred links", () => {
    const g = newGame(42);
    expect(hasMove(g.board)).toBe(true);
    for (let i = 0; i < 100; i++) {
      // Find any three-link and play it.
      let played = false;
      for (let c = 0; c < COLS && !played; c++)
        for (let r = 0; r < ROWS && !played; r++) {
          const col = at(g.board, P(c, r)).color;
          const ch: Pos[] = [P(c, r)];
          const seen = new Set([`${c},${r}`]);
          while (ch.length < 3) {
            const last = ch[ch.length - 1];
            const next = [P(last.c + 1, last.r), P(last.c - 1, last.r), P(last.c, last.r + 1), P(last.c, last.r - 1)].find((n) => at(g.board, n)?.color === col && !seen.has(`${n.c},${n.r}`));
            if (!next) break;
            seen.add(`${next.c},${next.r}`);
            ch.push(next);
          }
          if (ch.length >= 3) played = !!commit(g, ch);
        }
      expect(hasMove(g.board)).toBe(true);
    }
    expect(g.links).toBeGreaterThan(50);
    expect(newBoard(createRng(3)).cells.flat()).toHaveLength(COLS * ROWS);
  });
});
