import { createRng, type Rng } from "../engine/rng";

/**
 * Grid Lock rules. Slide a whole row or column one step (it wraps around).
 * Lines of 3+ matching tiles clear, tiles fall, the board refills, and
 * cascades multiply points. A slide that clears nothing overloads the circuit
 * and costs time. Pure and seeded; rendered by ./index.ts.
 */

export const SIZE = 6;
export const COLORS = 5;
export const ROUND_SECONDS = 90;
export const MISS_PENALTY_S = 3;
export const POINTS_PER_TILE = 10;
const MAX_CASCADES = 20;

export type Board = number[];

export interface Move {
  axis: "row" | "col";
  index: number;
  /** row: +1 = right, -1 = left. col: +1 = down, -1 = up. */
  dir: 1 | -1;
}

export interface LockState {
  rng: Rng;
  board: Board;
  score: number;
  timeLeft: number;
  moves: number;
  bestCascade: number;
  over: boolean;
}

export interface MoveResult {
  cleared: number;
  cascades: number;
  points: number;
  /** Indices cleared in the first wave, for effects. */
  firstWave: number[];
}

export const idx = (r: number, c: number) => r * SIZE + c;

export function findMatches(board: Board): Set<number> {
  const hit = new Set<number>();
  for (let r = 0; r < SIZE; r++) {
    let run = 1;
    for (let c = 1; c <= SIZE; c++) {
      if (c < SIZE && board[idx(r, c)] === board[idx(r, c - 1)] && board[idx(r, c)] >= 0) run++;
      else {
        if (run >= 3) for (let k = c - run; k < c; k++) hit.add(idx(r, k));
        run = 1;
      }
    }
  }
  for (let c = 0; c < SIZE; c++) {
    let run = 1;
    for (let r = 1; r <= SIZE; r++) {
      if (r < SIZE && board[idx(r, c)] === board[idx(r - 1, c)] && board[idx(r, c)] >= 0) run++;
      else {
        if (run >= 3) for (let k = r - run; k < r; k++) hit.add(idx(k, c));
        run = 1;
      }
    }
  }
  return hit;
}

/** A random board with no matches already on it. */
export function createBoard(rng: Rng): Board {
  const b: Board = new Array(SIZE * SIZE).fill(-1);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const banned = new Set<number>();
      if (c >= 2 && b[idx(r, c - 1)] === b[idx(r, c - 2)]) banned.add(b[idx(r, c - 1)]);
      if (r >= 2 && b[idx(r - 1, c)] === b[idx(r - 2, c)]) banned.add(b[idx(r - 1, c)]);
      const options = Array.from({ length: COLORS }, (_, i) => i).filter((v) => !banned.has(v));
      b[idx(r, c)] = rng.pick(options);
    }
  }
  return b;
}

export function slide(board: Board, move: Move): Board {
  const next = board.slice();
  for (let k = 0; k < SIZE; k++) {
    const to = (k + move.dir + SIZE) % SIZE;
    if (move.axis === "row") next[idx(move.index, to)] = board[idx(move.index, k)];
    else next[idx(to, move.index)] = board[idx(k, move.index)];
  }
  return next;
}

/** Remove cleared cells, drop tiles down, refill from the top. */
export function collapse(board: Board, cleared: Set<number>, rng: Rng): Board {
  const next = board.slice();
  for (let c = 0; c < SIZE; c++) {
    const kept: number[] = [];
    for (let r = SIZE - 1; r >= 0; r--) if (!cleared.has(idx(r, c))) kept.push(board[idx(r, c)]);
    for (let r = SIZE - 1, i = 0; r >= 0; r--, i++) {
      next[idx(r, c)] = i < kept.length ? kept[i] : rng.int(0, COLORS - 1);
    }
  }
  return next;
}

/** Resolve all matches and cascades. Points = tiles × 10 × cascade number. */
export function resolve(board: Board, rng: Rng): { board: Board } & MoveResult {
  let b = board;
  let cleared = 0;
  let cascades = 0;
  let points = 0;
  let firstWave: number[] = [];
  while (cascades < MAX_CASCADES) {
    const m = findMatches(b);
    if (m.size === 0) break;
    cascades++;
    if (cascades === 1) firstWave = [...m];
    cleared += m.size;
    points += m.size * POINTS_PER_TILE * cascades;
    b = collapse(b, m, rng);
  }
  return { board: b, cleared, cascades, points, firstWave };
}

export function createLock(seed = Date.now()): LockState {
  const rng = createRng(seed);
  return {
    rng,
    board: createBoard(rng),
    score: 0,
    timeLeft: ROUND_SECONDS,
    moves: 0,
    bestCascade: 0,
    over: false,
  };
}

export function applyMove(s: LockState, move: Move): MoveResult {
  if (s.over) return { cleared: 0, cascades: 0, points: 0, firstWave: [] };
  s.moves++;
  const res = resolve(slide(s.board, move), s.rng);
  s.board = res.board;
  if (res.cleared === 0) {
    s.timeLeft = Math.max(0, s.timeLeft - MISS_PENALTY_S);
    if (s.timeLeft <= 0) s.over = true;
  } else {
    s.score += res.points;
    s.bestCascade = Math.max(s.bestCascade, res.cascades);
  }
  return res;
}

export function tick(s: LockState, dt: number) {
  if (s.over) return;
  s.timeLeft = Math.max(0, s.timeLeft - dt);
  if (s.timeLeft <= 0) s.over = true;
}

/** All 24 possible moves on the board. */
export function allMoves(): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < SIZE; i++)
    for (const dir of [1, -1] as const) {
      out.push({ axis: "row", index: i, dir });
      out.push({ axis: "col", index: i, dir });
    }
  return out;
}
