import { createRng, type Rng } from "../engine/rng";

/**
 * Linkwave: the rules. A board of coloured nodes; drag through neighbours of
 * one colour to link them (three or more), and they clear. Close a loop and
 * every node of that colour goes. Long links leave a power node behind:
 * a Pulse (clears the 3×3 around it) or, from a loop, a Prism (clears its
 * row and column). Against the clock, with a combo for quick links.
 */

export const COLS = 6;
export const ROWS = 8;
export const COLORS = 5;
export const MIN_LINK = 3;
/** A run starts with this long on the clock (seconds). */
export const START_TIME = 75;
/** Quick links within this many seconds of each other keep the combo going. */
export const COMBO_WINDOW = 2.2;
export const MAX_COMBO = 5;

export type Kind = "node" | "pulse" | "prism";
export interface Cell {
  color: number;
  kind: Kind;
  /** Unique, so the renderer can animate a node as it falls. */
  id: number;
}

export interface Pos {
  c: number;
  r: number;
}

export interface Board {
  cells: Cell[][]; // [col][row], row 0 at the top
  nextId: number;
}

export interface Game {
  board: Board;
  score: number;
  time: number;
  combo: number;
  /** Seconds since the last link (for the combo). */
  sinceLink: number;
  links: number;
  best: number;
  loops: number;
  over: boolean;
  rng: Rng;
}

const key = (p: Pos) => `${p.c},${p.r}`;
export const same = (a: Pos, b: Pos) => a.c === b.c && a.r === b.r;
export const adjacent = (a: Pos, b: Pos) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r) === 1;
export const at = (b: Board, p: Pos) => b.cells[p.c]?.[p.r];

function fresh(b: Board, rng: Rng, kind: Kind = "node"): Cell {
  return { color: Math.floor(rng.next() * COLORS), kind, id: b.nextId++ };
}

/** A new board with at least one link on it. */
export function newBoard(rng: Rng): Board {
  const b: Board = { cells: [], nextId: 1 };
  for (let c = 0; c < COLS; c++) {
    b.cells.push([]);
    for (let r = 0; r < ROWS; r++) b.cells[c].push(fresh(b, rng));
  }
  ensureMove(b, rng);
  return b;
}

export function newGame(seed = Date.now()): Game {
  const rng = createRng(seed);
  return { board: newBoard(rng), score: 0, time: START_TIME, combo: 0, sinceLink: 99, links: 0, best: 0, loops: 0, over: false, rng };
}

/** Is there a link of three anywhere? (Two neighbours of a colour with a third touching either.) */
export function hasMove(b: Board) {
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++) {
      const p = { c, r };
      const col = at(b, p).color;
      const group = new Set<string>([key(p)]);
      const stack = [p];
      while (stack.length && group.size < MIN_LINK) {
        const q = stack.pop()!;
        for (const n of neighbours(q)) {
          if (group.has(key(n)) || at(b, n).color !== col) continue;
          group.add(key(n));
          stack.push(n);
        }
      }
      if (group.size >= MIN_LINK) return true;
    }
  return false;
}

/** Shuffle colours until a link exists. */
export function ensureMove(b: Board, rng: Rng) {
  for (let i = 0; i < 50 && !hasMove(b); i++) for (const col of b.cells) for (const cell of col) cell.color = Math.floor(rng.next() * COLORS);
}

export function neighbours(p: Pos): Pos[] {
  return [
    { c: p.c + 1, r: p.r },
    { c: p.c - 1, r: p.r },
    { c: p.c, r: p.r + 1 },
    { c: p.c, r: p.r - 1 },
  ].filter((q) => q.c >= 0 && q.c < COLS && q.r >= 0 && q.r < ROWS);
}

/**
 * Drag onto `p`: extend the link, step back (onto the previous node), or
 * close a loop (onto a node already in it, four or more back). Anything else
 * leaves the link as it was.
 */
export function extend(b: Board, chain: Pos[], p: Pos): Pos[] {
  if (!at(b, p)) return chain;
  if (!chain.length) return [p];
  const last = chain[chain.length - 1];
  if (same(last, p)) return chain;
  if (chain.length >= 2 && same(chain[chain.length - 2], p)) return chain.slice(0, -1);
  if (!adjacent(last, p) || at(b, p).color !== at(b, chain[0]).color) return chain;
  if (isLoop(chain)) return chain;
  const i = chain.findIndex((q) => same(q, p));
  if (i >= 0) return chain.length - i >= 4 ? [...chain, p] : chain;
  return [...chain, p];
}

/** The link ends where it passed before: a loop. */
export const isLoop = (chain: Pos[]) => chain.length >= 5 && chain.slice(0, -1).some((q) => same(q, chain[chain.length - 1]));

/** How many distinct nodes are in the link. */
export const linkSize = (chain: Pos[]) => new Set(chain.map(key)).size;

export interface Resolution {
  cleared: Pos[];
  points: number;
  loop: boolean;
  /** A power node left behind, where. */
  made: { at: Pos; kind: Kind } | null;
  /** Extra seconds on the clock. */
  bonus: number;
  /** The combo this link scored at. */
  combo: number;
}

/** Everything a set of cleared nodes takes with it: power nodes go off, and set off others. */
export function blast(b: Board, start: Pos[]): Set<string> {
  const out = new Set(start.map(key));
  const queue = [...start];
  while (queue.length) {
    const p = queue.pop()!;
    const cell = at(b, p);
    if (!cell || cell.kind === "node") continue;
    const hit: Pos[] = [];
    if (cell.kind === "pulse") for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) hit.push({ c: p.c + dc, r: p.r + dr });
    else {
      for (let c = 0; c < COLS; c++) hit.push({ c, r: p.r });
      for (let r = 0; r < ROWS; r++) hit.push({ c: p.c, r });
    }
    for (const q of hit) {
      if (q.c < 0 || q.c >= COLS || q.r < 0 || q.r >= ROWS || out.has(key(q))) continue;
      out.add(key(q));
      queue.push(q);
    }
  }
  return out;
}

/** Points for a link: 10 a node, growing with length; loops double; the combo multiplies. */
export function pointsFor(size: number, extra: number, loop: boolean, combo: number) {
  const base = size * 10 * (1 + Math.max(0, size - MIN_LINK) * 0.25) + extra * 15;
  return Math.round(base * (loop ? 2 : 1) * (1 + 0.5 * (Math.max(1, combo) - 1)));
}

/**
 * Commit a link: clear it (and everything its power nodes reach; a loop
 * takes every node of its colour), leave a power node for long links and
 * loops, let the rest fall, and fill from the top.
 */
export function commit(g: Game, chain: Pos[]): Resolution | null {
  const size = linkSize(chain);
  if (size < MIN_LINK || g.over) return null;
  const b = g.board;
  const color = at(b, chain[0]).color;
  const loop = isLoop(chain);
  const start = loop ? allOf(b, color) : [...new Map(chain.map((p) => [key(p), p])).values()];
  const end = chain[chain.length - 1];
  const madeKind: Kind | null = loop ? "prism" : size >= 6 ? "pulse" : null;
  const gone = blast(b, start);
  // The power node stays where the link ended.
  if (madeKind) gone.delete(key(end));
  const cleared = [...gone].map((k) => {
    const [c, r] = k.split(",").map(Number);
    return { c, r };
  });
  g.combo = g.sinceLink <= COMBO_WINDOW ? Math.min(MAX_COMBO, g.combo + 1) : 1;
  g.sinceLink = 0;
  const points = pointsFor(size, Math.max(0, cleared.length - size), loop, g.combo);
  g.score += points;
  g.links++;
  g.best = Math.max(g.best, size);
  if (loop) g.loops++;
  const bonus = (loop ? 3 : 0) + (size >= 5 ? 1.5 : 0);
  g.time += bonus;
  if (madeKind) {
    const cell = at(b, end);
    cell.kind = madeKind;
    cell.color = color;
  }
  collapse(b, gone, g.rng);
  ensureMove(b, g.rng);
  return { cleared, points, loop, made: madeKind ? { at: end, kind: madeKind } : null, bonus, combo: g.combo };
}

function allOf(b: Board, color: number): Pos[] {
  const out: Pos[] = [];
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (b.cells[c][r].color === color) out.push({ c, r });
  return out;
}

/** Remove the cleared nodes; the rest fall; new ones drop in at the top. */
export function collapse(b: Board, gone: Set<string>, rng: Rng) {
  for (let c = 0; c < COLS; c++) {
    const keep = b.cells[c].filter((_, r) => !gone.has(`${c},${r}`));
    const add = ROWS - keep.length;
    const top: Cell[] = [];
    for (let i = 0; i < add; i++) top.push(fresh(b, rng));
    b.cells[c] = [...top, ...keep];
  }
}

/** The clock runs down; the combo window closes. */
export function tick(g: Game, dt: number) {
  if (g.over) return;
  g.time = Math.max(0, g.time - dt);
  g.sinceLink += dt;
  if (g.sinceLink > COMBO_WINDOW) g.combo = 0;
  if (g.time <= 0) g.over = true;
}
