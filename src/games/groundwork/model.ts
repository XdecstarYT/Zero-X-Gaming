import { BONDS, COURSE, DAY_MINUTES, GRID, HALF, JOINT, KINDS, SITE, type Bond, type Kind, type PavePattern, type RoofCover, type RoofStyle } from "./data";

/**
 * Groundwork's construction model. A site is a list of pieces, each a real-size box (bricks,
 * blocks, footings, timbers, windows, tiles…) at a position, turned in quarter turns (and, for
 * roof parts, pitched). Pieces go on a quarter-brick grid and must be held up: masonry needs a
 * bed under it, lintels and beams a bearing at each end. Take something away and whatever it was
 * holding up comes down too. The tools here lay single pieces, bonded walls course by course,
 * footings, slabs, timber frames, floors and whole roofs, all as ordinary pieces.
 */

export interface Piece {
  id: number;
  k: Kind;
  /** Centre of its footprint, and the bottom of it. */
  x: number;
  y: number;
  z: number;
  /** Quarter turns about the vertical: 0 lies along +x, 1 along z, 2 and 3 face the other way. */
  r: number;
  /** Which finish (an index into the kind's variants). */
  v: number;
  /** Its size, if not the kind's own: [length, height, depth]. */
  s?: [number, number, number];
  /** Pitch, in radians, for roof parts (tilted about their own length). */
  p?: number;
  /** A group (a roof, a wall run) that came together. */
  g?: number;
  /** The labour minute it was laid (mortar takes a while to go off). */
  t: number;
}

export interface Box {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

/** Free build pays for nothing; a career job, a contract and your own property are paid for. */
export type Mode = "free" | "career" | "contract" | "property";

export const paid = (s: Pick<State, "mode">) => s.mode !== "free";

export interface State {
  v: 1;
  mode: Mode;
  job: string | null;
  pieces: Piece[];
  nextId: number;
  nextGroup: number;
  /** Cash in hand (career), what's been spent on materials, and labour so far (minutes). */
  money: number;
  spent: number;
  minutes: number;
  stats: { laid: number; removed: number; fell: number };
  rev: number;
  seed: number;
  /** How many times faster than one builder the work goes (a crew on a company site). */
  speed?: number;
}

/** What placing came to: what went in, and why the rest didn't. */
export interface Result {
  added: Piece[];
  skipped: number;
  why: string | null;
}

const EPS = 0.002;

export const dims = (p: Pick<Piece, "k" | "s">): [number, number, number] => p.s ?? KINDS[p.k].size;
export const info = (p: Pick<Piece, "k">) => KINDS[p.k];

/* ------------------------------------------------------------------ geometry */

/** World corners of a pitched piece. */
function corners(p: Piece) {
  const [L, H, D] = dims(p);
  const a = (p.r * Math.PI) / 2;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const pp = p.p ?? 0;
  const cp = Math.cos(pp);
  const sp = Math.sin(pp);
  const out: [number, number, number][] = [];
  for (const sx of [-0.5, 0.5])
    for (const yy of [0, H])
      for (const sz of [-0.5, 0.5]) {
        const lx = sx * L;
        const lz = sz * D;
        // Pitch about the local x, then turn about the vertical (three.js "YXZ").
        const y1 = yy * cp - lz * sp;
        const z1 = yy * sp + lz * cp;
        out.push([p.x + lx * ca + z1 * sa, p.y + y1, p.z - lx * sa + z1 * ca]);
      }
  return out;
}

/** The box a piece fills (its own size, not its joints). */
export function box(p: Piece): Box {
  if (p.p) {
    const c = corners(p);
    const b = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
    for (const [x, y, z] of c) {
      b.x0 = Math.min(b.x0, x);
      b.y0 = Math.min(b.y0, y);
      b.z0 = Math.min(b.z0, z);
      b.x1 = Math.max(b.x1, x);
      b.y1 = Math.max(b.y1, y);
      b.z1 = Math.max(b.z1, z);
    }
    return b;
  }
  const [L, H, D] = dims(p);
  const hx = (p.r % 2 ? D : L) / 2;
  const hz = (p.r % 2 ? L : D) / 2;
  return { x0: p.x - hx, y0: p.y, z0: p.z - hz, x1: p.x + hx, y1: p.y + H, z1: p.z + hz };
}

/** The space a piece takes with its joints (where the next one goes beside it). */
export function moduleBox(p: Piece): Box {
  const b = box(p);
  const j = info(p).mortar ? JOINT / 2 : 0;
  return { x0: b.x0 - j, y0: b.y0, z0: b.z0 - j, x1: b.x1 + j, y1: b.y1, z1: b.z1 + j };
}

const overlapLen = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function intersects(a: Box, b: Box, e = EPS) {
  return a.x0 < b.x1 - e && a.x1 > b.x0 + e && a.y0 < b.y1 - e && a.y1 > b.y0 + e && a.z0 < b.z1 - e && a.z1 > b.z0 + e;
}

export const snapG = (v: number) => Math.round(v / GRID) * GRID;
/** The centre of a span of length m whose near edge is on the grid nearest to centring it on v. */
export const snapCentre = (v: number, m: number) => snapG(v - m / 2) + m / 2;

/* ------------------------------------------------------------------ index */

interface Index {
  byId: Map<number, Piece>;
  cells: Map<number, Set<number>>;
}

const CELL = 1;
const OFF = 64;
const indexes = new WeakMap<State, Index>();
const key = (i: number, j: number) => (i + OFF) * 1024 + (j + OFF);

function cellsOf(b: Box) {
  const out: number[] = [];
  const i0 = Math.floor(b.x0 / CELL);
  const i1 = Math.floor(b.x1 / CELL);
  const j0 = Math.floor(b.z0 / CELL);
  const j1 = Math.floor(b.z1 / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push(key(i, j));
  return out;
}

function ix(s: State): Index {
  let I = indexes.get(s);
  if (!I) {
    I = { byId: new Map(), cells: new Map() };
    indexes.set(s, I);
    for (const p of s.pieces) indexAdd(I, p);
  }
  return I;
}

function indexAdd(I: Index, p: Piece) {
  I.byId.set(p.id, p);
  for (const k of cellsOf(box(p))) {
    let c = I.cells.get(k);
    if (!c) I.cells.set(k, (c = new Set()));
    c.add(p.id);
  }
}

function indexRemove(I: Index, p: Piece) {
  I.byId.delete(p.id);
  for (const k of cellsOf(box(p))) I.cells.get(k)?.delete(p.id);
}

export function byId(s: State, id: number) {
  return ix(s).byId.get(id) ?? null;
}

/** Pieces whose boxes come near this one. */
export function near(s: State, b: Box, pad = 0.02): Piece[] {
  const I = ix(s);
  const seen = new Set<number>();
  const out: Piece[] = [];
  for (const k of cellsOf({ x0: b.x0 - pad, y0: b.y0, z0: b.z0 - pad, x1: b.x1 + pad, y1: b.y1, z1: b.z1 + pad })) {
    const c = I.cells.get(k);
    if (!c) continue;
    for (const id of c) {
      if (seen.has(id)) continue;
      seen.add(id);
      const p = I.byId.get(id);
      if (p) out.push(p);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ the site */

export function newSite(mode: Mode, job: string | null = null, money = 0): State {
  return { v: 1, mode, job, pieces: [], nextId: 1, nextGroup: 1, money, spent: 0, minutes: 0, stats: { laid: 0, removed: 0, fell: 0 }, rev: 0, seed: Math.floor(Math.random() * 1e6) };
}

export function costOf(p: Pick<Piece, "k" | "s">) {
  const I = KINDS[p.k];
  const [L, H, D] = dims(p);
  const len = I.stretch === "H" ? H : L;
  return I.per === "m" ? I.cost * len : I.per === "m2" ? I.cost * L * D : I.cost;
}

export function minutesOf(p: Pick<Piece, "k" | "s">) {
  const I = KINDS[p.k];
  const [L, H, D] = dims(p);
  const len = I.stretch === "H" ? H : L;
  return I.per === "m" ? I.minutes * len : I.per === "m2" ? I.minutes * L * D : I.minutes;
}

/** What it rests on: pieces that bear whose tops are at (or a mortar joint under) its bottom. */
function bearers(s: State, b: Box, self = -1) {
  const out: { p: Piece; a: number; b: Box }[] = [];
  for (const q of near(s, { ...b, y0: b.y0 - 0.05, y1: b.y0 + 0.01 })) {
    if (q.id === self || !KINDS[q.k].bears) continue;
    const qb = box(q);
    if (q.p) continue;
    if (qb.y1 < b.y0 - JOINT - 0.004 || qb.y1 > b.y0 + 0.004) continue;
    const a = overlapLen(b.x0, b.x1, qb.x0, qb.x1) * overlapLen(b.z0, b.z1, qb.z0, qb.z1);
    if (a > 1e-6) out.push({ p: q, a, b: qb });
  }
  return out;
}

/** Is it held up? Null if so, or why not. */
export function unsupported(s: State, p: Piece, b = box(p)): string | null {
  const I = KINDS[p.k];
  if (I.support === "none") return null;
  const onGround = b.y0 <= EPS;
  if (onGround) return I.ground ? null : `${I.name}s can't go on the bare ground`;
  const under = bearers(s, b, p.id);
  if (!under.length) return "Nothing under it to hold it up";
  if (I.support === "touch") return null;
  const area = (b.x1 - b.x0) * (b.z1 - b.z0);
  if (I.support === "bed") {
    const held = under.reduce((acc, u) => acc + u.a, 0);
    return held / area >= 0.3 ? null : "Not enough under it: it would tip off";
  }
  // Span: both ends must bear.
  const alongX = b.x1 - b.x0 >= b.z1 - b.z0;
  const lo = alongX ? b.x0 : b.z0;
  const hi = alongX ? b.x1 : b.z1;
  const end = Math.max(0.08, (hi - lo) * 0.12);
  const at = (a0: number, a1: number) => under.some((u) => overlapLen(a0, a1, alongX ? u.b.x0 : u.b.z0, alongX ? u.b.x1 : u.b.z1) > 0.02);
  if (!at(lo, lo + end) || !at(hi - end, hi)) return "Each end needs something to bear on";
  return null;
}

/** Can it go here? Null if so, or why not. */
export function check(s: State, p: Piece): string | null {
  const b = box(p);
  if (b.x0 < -SITE || b.x1 > SITE || b.z0 < -SITE || b.z1 > SITE) return "That's off the site";
  if (b.y0 < -EPS) return "Below the ground";
  if (b.y1 > 14) return "Too high to build without a crane";
  // Roof parts lap each other, and fittings (gutters, downpipes, panels) clip onto what's there.
  const loose = (k: Kind) => KINDS[k].family === "roof" || KINDS[k].family === "fitting";
  if (!loose(p.k)) {
    for (const q of near(s, b)) {
      if (q.id === p.id || loose(q.k)) continue;
      if (intersects(b, box(q))) return "Something's in the way";
    }
  }
  return unsupported(s, p, b);
}

/* ------------------------------------------------------------------ undo */

interface Action {
  added: Piece[];
  removed: Piece[];
  money: number;
  spent: number;
  minutes: number;
  /** Pieces refinished: their ids and finishes before and after. */
  changed?: { id: number; from: number; to: number }[];
}

const history = new WeakMap<State, { undo: Action[]; redo: Action[] }>();
const hist = (s: State) => {
  let h = history.get(s);
  if (!h) history.set(s, (h = { undo: [], redo: [] }));
  return h;
};

export const canUndo = (s: State) => hist(s).undo.length > 0;
export const canRedo = (s: State) => hist(s).redo.length > 0;

function rawAdd(s: State, p: Piece) {
  s.pieces.push(p);
  indexAdd(ix(s), p);
}

function rawRemove(s: State, ids: Set<number>) {
  const I = ix(s);
  const gone: Piece[] = [];
  s.pieces = s.pieces.filter((p) => {
    if (!ids.has(p.id)) return true;
    indexRemove(I, p);
    gone.push(p);
    return false;
  });
  return gone;
}

export function undo(s: State) {
  const h = hist(s);
  const a = h.undo.pop();
  if (!a) return false;
  rawRemove(s, new Set(a.added.map((p) => p.id)));
  for (const p of a.removed) rawAdd(s, p);
  for (const c of a.changed ?? []) {
    const p = byId(s, c.id);
    if (p) p.v = c.from;
  }
  s.money -= a.money;
  s.spent -= a.spent;
  s.minutes -= a.minutes;
  h.redo.push(a);
  s.rev++;
  return true;
}

export function redo(s: State) {
  const h = hist(s);
  const a = h.redo.pop();
  if (!a) return false;
  rawRemove(s, new Set(a.removed.map((p) => p.id)));
  for (const p of a.added) rawAdd(s, p);
  for (const c of a.changed ?? []) {
    const p = byId(s, c.id);
    if (p) p.v = c.to;
  }
  s.money += a.money;
  s.spent += a.spent;
  s.minutes += a.minutes;
  h.undo.push(a);
  s.rev++;
  return true;
}

function record(s: State, a: Action) {
  const h = hist(s);
  h.undo.push(a);
  if (h.undo.length > 60) h.undo.shift();
  h.redo = [];
}

/* ------------------------------------------------------------------ placing and taking away */

export type Spec = Omit<Piece, "id" | "t"> & { t?: number };

/**
 * Put pieces in, one after another (so a wall can stand on its own lower courses). Each must
 * fit and be held up; in a career each must be paid for. Returns what went in.
 */
export function commit(s: State, specs: Spec[], group = false): Result {
  const added: Piece[] = [];
  let skipped = 0;
  let why: string | null = null;
  let money = 0;
  let spent = 0;
  let minutes = 0;
  const g = group && specs.length > 1 ? s.nextGroup++ : undefined;
  for (const sp of specs) {
    const p: Piece = { ...sp, id: s.nextId, t: s.minutes + minutes, ...(g ? { g } : {}) };
    const err = check(s, p);
    if (err) {
      skipped++;
      why ??= err;
      continue;
    }
    const c = costOf(p);
    if (paid(s) && s.money + money < c) {
      skipped++;
      why = "Out of money";
      break;
    }
    s.nextId++;
    rawAdd(s, p);
    added.push(p);
    money -= paid(s) ? c : 0;
    spent += c;
    minutes += minutesOf(p) / (s.speed ?? 1);
  }
  if (added.length) {
    s.money += money;
    s.spent += spent;
    s.minutes += minutes;
    s.stats.laid += added.length;
    record(s, { added, removed: [], money, spent, minutes });
    s.rev++;
  }
  return { added, skipped, why: added.length ? (skipped ? why : null) : why };
}

/**
 * Take pieces away (half their cost back, in a career), and let whatever they were holding up
 * come down with them.
 */
export function remove(s: State, ids: number[]): { removed: Piece[]; fell: number } {
  const want = new Set(ids.filter((id) => byId(s, id)));
  if (!want.size) return { removed: [], fell: 0 };
  let gone = rawRemove(s, want);
  const direct = gone.length;
  // Anything left hanging falls, and so on up.
  let frontier = gone;
  for (let guard = 0; frontier.length && guard < 400; guard++) {
    const next = new Set<number>();
    for (const g of frontier) {
      const b = box(g);
      for (const q of near(s, { ...b, y0: b.y1 - 0.01, y1: b.y1 + 0.03 })) {
        if (next.has(q.id)) continue;
        const qb = box(q);
        if (qb.y0 < b.y1 - 0.01 || qb.y0 > b.y1 + JOINT + 0.005) continue;
        if (unsupported(s, q, qb)) next.add(q.id);
      }
    }
    if (!next.size) break;
    frontier = rawRemove(s, next);
    gone = gone.concat(frontier);
  }
  const refund = paid(s) ? gone.slice(0, direct).reduce((a, p) => a + costOf(p) * 0.5, 0) : 0;
  s.money += refund;
  s.stats.removed += direct;
  s.stats.fell += gone.length - direct;
  record(s, { added: [], removed: gone, money: refund, spent: 0, minutes: 0 });
  s.rev++;
  return { removed: gone, fell: gone.length - direct };
}

/** Pieces whose boxes meet a region (to clear an area, or cut an opening). */
export function within(s: State, b: Box) {
  return near(s, b).filter((p) => intersects(b, box(p), 0.004));
}

/* ------------------------------------------------------------------ where a tap puts a piece */

export interface Hit {
  x: number;
  y: number;
  z: number;
  /** The face's normal. */
  nx: number;
  ny: number;
  nz: number;
  /** The piece hit, or -1 for the ground. */
  id: number;
}

/**
 * The piece a tap would lay: on top of what you tapped (in a mortar bed if it's laid in mortar),
 * or beside it if you tapped a side, snapped to the quarter-brick grid.
 */
export function candidate(s: State, k: Kind, hit: Hit, r: number, v: number, size?: [number, number, number]): Spec | null {
  const I = KINDS[k];
  const [L, , D] = size ?? I.size;
  const j = I.mortar ? JOINT : 0;
  const mx = (r % 2 ? D : L) + j;
  const mz = (r % 2 ? L : D) + j;
  const base: Spec = { k, x: 0, y: 0, z: 0, r, v, ...(size ? { s: size } : {}) };
  const hp = hit.id >= 0 ? byId(s, hit.id) : null;
  if (!hp) return { ...base, x: snapCentre(hit.x, mx), y: 0, z: snapCentre(hit.z, mz) };
  const hb = box(hp);
  if (hit.ny > 0.6) return { ...base, x: snapCentre(hit.x, mx), y: hb.y1 + j, z: snapCentre(hit.z, mz) };
  if (Math.abs(hit.ny) > 0.4) return null;
  const hm = moduleBox(hp);
  if (Math.abs(hit.nx) >= Math.abs(hit.nz)) {
    const x = hit.nx > 0 ? hm.x1 + mx / 2 : hm.x0 - mx / 2;
    return { ...base, x, y: hp.y, z: snapCentre(hit.z, mz) };
  }
  const z = hit.nz > 0 ? hm.z1 + mz / 2 : hm.z0 - mz / 2;
  return { ...base, x: snapCentre(hit.x, mx), y: hp.y, z };
}

/** The height a tool should build from at a hit: the ground, or the top of what was tapped. */
export function baseAt(s: State, hit: Hit, mortar = true) {
  const hp = hit.id >= 0 ? byId(s, hit.id) : null;
  if (!hp || hit.ny < 0.6) return hp ? hp.y : 0;
  return box(hp).y1 + (mortar ? JOINT : 0);
}

/* ------------------------------------------------------------------ walls */

export interface WallOpts {
  kind: Kind;
  bond: Bond;
  courses: number;
  v: number;
  /** Start at this course (for a wall laid in lifts), counting from y0. */
  from?: number;
  /** Put lintels over openings when the wall reaches their heads. */
  lintels?: boolean;
}

type Axis = "x" | "z";

/** One laid unit in a line: where along it starts and ends, which kind, across offset, header or not. */
interface Unit {
  a0: number;
  a1: number;
  k: Kind;
  cross: number;
  header: boolean;
  s?: [number, number, number];
}

const brickLen = (k: Kind) => KINDS[k].size[0] + JOINT;

/** Cut pieces, largest first, that fill a length of wall (in a leaf). */
function fill(k: Kind, a0: number, a1: number, cross: number, thick: 1 | 2): Unit[] {
  const out: Unit[] = [];
  const full = brickLen(k);
  const half = HALF[k] ?? k;
  const sizes: [Kind, number, [number, number, number] | undefined][] = [
    [k, full, undefined],
    [half, brickLen(half), undefined],
  ];
  if (k === "brick") sizes.push(["closer", GRID, undefined]);
  let a = a0;
  while (a1 - a > GRID - 1e-6) {
    const pick = sizes.find(([, m]) => m <= a1 - a + 1e-6);
    if (!pick) break;
    const [kk, m] = pick;
    if (thick === 2) {
      out.push({ a0: a, a1: a + m, k: kk, cross: cross - GRID, header: false });
      out.push({ a0: a, a1: a + m, k: kk, cross: cross + GRID, header: false });
    } else out.push({ a0: a, a1: a + m, k: kk, cross, header: false });
    a += m;
  }
  return out;
}

/** The units of one course of a wall along a line, in its bond. */
function course(k: Kind, bond: Bond, c: number, len: number, cross: number, offset = true): Unit[] {
  const full = brickLen(k);
  if (bond === "stretcher" || bond === "stack" || k !== "brick") {
    const off = bond === "stack" || !offset ? 0 : (c % 2) * (full / 2);
    const out: Unit[] = [];
    if (off > 0) out.push(...fill(k, 0, Math.min(off, len), cross, 1));
    let a = off;
    while (a + full <= len + 1e-6) {
      out.push({ a0: a, a1: a + full, k, cross, header: false });
      a += full;
    }
    out.push(...fill(k, a, len, cross, 1));
    return out;
  }
  // One-brick walls: headers run through the wall; stretchers go in pairs, one each face.
  const H = GRID * 2;
  const out: Unit[] = [];
  const header = (a: number) => out.push({ a0: a, a1: a + H, k: "brick", cross, header: true });
  const pair = (a: number) => {
    out.push({ a0: a, a1: a + full, k: "brick", cross: cross - GRID, header: false });
    out.push({ a0: a, a1: a + full, k: "brick", cross: cross + GRID, header: false });
  };
  const closer = (a: number) => out.push({ a0: a, a1: a + GRID, k: "closer", cross, header: true, s: [0.215, 0.065, 0.04625] });
  let a = 0;
  if (bond === "english") {
    if (c % 2 === 0) {
      while (a + full <= len + 1e-6) {
        pair(a);
        a += full;
      }
    } else {
      // A header, a queen closer, then headers.
      if (a + H <= len + 1e-6) {
        header(a);
        a += H;
      }
      if (a + GRID <= len + 1e-6) {
        closer(a);
        a += GRID;
      }
      while (a + H <= len + 1e-6) {
        header(a);
        a += H;
      }
    }
  } else {
    // Flemish: stretcher, header, stretcher… and the next course a closer then header, stretcher…
    if (c % 2 === 1 && a + GRID <= len + 1e-6) {
      closer(a);
      a += GRID;
    }
    let useHeader = c % 2 === 1;
    for (;;) {
      if (useHeader) {
        if (a + H > len + 1e-6) break;
        header(a);
        a += H;
      } else {
        if (a + full > len + 1e-6) break;
        pair(a);
        a += full;
      }
      useHeader = !useHeader;
    }
  }
  out.push(...fill("brick", a, len, cross, 2));
  return out;
}

/** Openings and lintels in a wall line at a height: intervals along it to lay around. */
function obstacles(s: State, axis: Axis, start: number, len: number, crossLo: number, crossHi: number, y0: number, y1: number) {
  const b: Box = axis === "x" ? { x0: start, x1: start + len, z0: crossLo, z1: crossHi, y0, y1 } : { z0: start, z1: start + len, x0: crossLo, x1: crossHi, y0, y1 };
  const out: { a0: number; a1: number; p: Piece }[] = [];
  for (const p of near(s, b)) {
    const f = KINDS[p.k].family;
    if (f !== "opening" && p.k !== "lintel" && p.k !== "steel") continue;
    const pm = moduleBox(p);
    if (!intersects(b, pm, 0.004)) continue;
    out.push({ a0: (axis === "x" ? pm.x0 : pm.z0) - start, a1: (axis === "x" ? pm.x1 : pm.z1) - start, p });
  }
  return out;
}

/** Lintels for openings whose heads are at this course, over the line. */
function lintelsAt(s: State, axis: Axis, start: number, len: number, cross: number, thick: 1 | 2, y: number): Spec[] {
  const half = thick === 2 ? GRID * 2 : GRID;
  const b: Box = axis === "x" ? { x0: start, x1: start + len, z0: cross - half, z1: cross + half, y0: y - 0.3, y1: y } : { z0: start, z1: start + len, x0: cross - half, x1: cross + half, y0: y - 0.3, y1: y };
  const out: Spec[] = [];
  for (const p of near(s, b)) {
    if (KINDS[p.k].family !== "opening") continue;
    const pb = box(p);
    if (Math.abs(pb.y1 + JOINT - y) > 0.006) continue;
    if (!intersects(b, pb, 0.004)) continue;
    const along = axis === "x" ? pb.x1 - pb.x0 : pb.z1 - pb.z0;
    const L = along + 0.45;
    const H = L > 2.6 ? 0.215 : 0.14;
    const mid = axis === "x" ? (pb.x0 + pb.x1) / 2 : (pb.z0 + pb.z1) / 2;
    const leaves = thick === 2 ? [cross - GRID, cross + GRID] : [cross];
    for (const c of leaves) {
      const s2: Spec = { k: "lintel", x: axis === "x" ? mid : c, y, z: axis === "x" ? c : mid, r: axis === "x" ? 0 : 1, v: 0, s: [L, H, 0.1025] };
      out.push(s2);
    }
  }
  return out;
}

/**
 * Lay a wall line course by course: the bond's pattern from the line's start, cut round any
 * openings (with bats and closers at the jambs) and with lintels over them when asked.
 */
function layLine(s: State, axis: Axis, start: number, len: number, cross: number, y: number, c: number, o: WallOpts, offset = true, earlier: Spec[] = []): Spec[] {
  const thick = o.kind === "brick" ? BONDS[o.bond].thick : 1;
  const H = KINDS[o.kind].size[1] + JOINT;
  const out: Spec[] = [];
  if (o.lintels !== false) out.push(...lintelsAt(s, axis, start, len, cross, thick, y));
  const half = thick === 2 ? GRID * 2 : GRID;
  const obs = obstacles(s, axis, start, len, cross - half, cross + half, y, y + H - JOINT);
  // Lintels going in this course are obstacles too, and so are the ones this wall put in lower down
  // that are deeper than a course.
  const line: Box = axis === "x" ? { x0: start, x1: start + len, z0: cross - half, z1: cross + half, y0: y, y1: y + H - JOINT } : { z0: start, z1: start + len, x0: cross - half, x1: cross + half, y0: y, y1: y + H - JOINT };
  for (const l of earlier) {
    const lb = box({ ...l, id: -1, t: 0 });
    if (intersects(line, lb, 0.004)) obs.push({ a0: (axis === "x" ? lb.x0 : lb.z0) - JOINT / 2 - start, a1: (axis === "x" ? lb.x1 : lb.z1) + JOINT / 2 - start, p: { ...l, id: -1, t: 0 } });
  }
  for (const l of out) {
    const lb = box({ ...l, id: -1, t: 0 });
    obs.push({ a0: (axis === "x" ? lb.x0 : lb.z0) - JOINT / 2 - start, a1: (axis === "x" ? lb.x1 : lb.z1) + JOINT / 2 - start, p: { ...l, id: -1, t: 0 } });
  }
  const units: Unit[] = [];
  for (const u of course(o.kind, o.bond, c, len, cross, offset)) {
    const hit = obs.filter((ob) => ob.a0 < u.a1 - 1e-4 && ob.a1 > u.a0 + 1e-4);
    if (!hit.length) {
      units.push(u);
      continue;
    }
    // Cut it round the opening: fill what's left on either side.
    let free: [number, number][] = [[u.a0, u.a1]];
    for (const ob of hit) free = free.flatMap(([a0, a1]) => [[a0, Math.min(a1, ob.a0)], [Math.max(a0, ob.a1), a1]].filter(([p, q]) => q - p > GRID - 1e-6) as [number, number][]);
    for (const [a0, a1] of free) {
      const snapped0 = Math.ceil(a0 / GRID - 1e-6) * GRID;
      const snapped1 = Math.floor(a1 / GRID + 1e-6) * GRID;
      if (u.header) {
        if (snapped1 - snapped0 >= GRID - 1e-6) units.push({ ...u, a0: snapped0, a1: snapped0 + GRID, k: "closer", s: [0.215, 0.065, 0.04625] });
      } else units.push(...fill(u.k === "closer" ? "brick" : (Object.entries(HALF).find(([, h]) => h === u.k)?.[0] as Kind) ?? u.k, snapped0, snapped1, u.cross, 1));
    }
  }
  for (const u of units) {
    const mid = start + (u.a0 + u.a1) / 2;
    const I = KINDS[u.k];
    const sz = u.s ?? I.size;
    const r = axis === "x" ? (u.header ? 1 : 0) : u.header ? 0 : 1;
    out.push({ k: u.k, x: axis === "x" ? mid : u.cross, y, z: axis === "x" ? u.cross : mid, r, v: o.v, ...(u.s ? { s: sz } : {}) });
  }
  return out;
}

/** A straight wall from a to b, from height y0, course by course. */
export function wallRun(s: State, a: { x: number; z: number }, b: { x: number; z: number }, y0: number, o: WallOpts): Spec[] {
  const axis: Axis = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z) ? "x" : "z";
  const full = brickLen(o.kind);
  const thick = o.kind === "brick" ? BONDS[o.bond].thick : 1;
  const lo = Math.min(axis === "x" ? a.x : a.z, axis === "x" ? b.x : b.z);
  const hi = Math.max(axis === "x" ? a.x : a.z, axis === "x" ? b.x : b.z);
  const start = snapG(lo);
  const len = Math.max(full, Math.round((hi - lo) / (full / 2)) * (full / 2));
  const leaf = KINDS[o.kind].size[2] + JOINT;
  const cross = snapCentre(axis === "x" ? a.z : a.x, thick === 2 ? GRID * 4 : leaf);
  const H = KINDS[o.kind].size[1] + JOINT;
  const out: Spec[] = [];
  const lintels: Spec[] = [];
  for (let c = o.from ?? 0; c < o.courses; c++) {
    const line = layLine(s, axis, start, len, cross, y0 + c * H, c, o, true, lintels);
    lintels.push(...line.filter((p) => p.k === "lintel"));
    out.push(...line);
  }
  return out;
}

/**
 * Four walls round a rectangle (a to b are opposite outside corners), bonded at the corners:
 * on alternate courses one pair of walls runs through the corners and the other butts between.
 */
export function wallRect(s: State, a: { x: number; z: number }, b: { x: number; z: number }, y0: number, o: WallOpts): Spec[] {
  const thick = o.kind === "brick" ? BONDS[o.bond].thick : 1;
  const t = thick === 2 ? GRID * 4 : KINDS[o.kind].size[2] + JOINT;
  const half = brickLen(o.kind) / 2;
  const x0 = snapG(Math.min(a.x, b.x));
  const z0 = snapG(Math.min(a.z, b.z));
  const W = Math.max(half * 4, Math.round((Math.max(a.x, b.x) - x0) / half) * half);
  const D = Math.max(half * 4, Math.round((Math.max(a.z, b.z) - z0) / half) * half);
  const H = KINDS[o.kind].size[1] + JOINT;
  const out: Spec[] = [];
  const lintels: Spec[] = [];
  for (let c = o.from ?? 0; c < o.courses; c++) {
    const y = y0 + c * H;
    const xThrough = c % 2 === 0;
    // Along x (the south and north walls).
    const xs = xThrough ? x0 : x0 + t;
    const xl = xThrough ? W : W - 2 * t;
    const zs = xThrough ? z0 + t : z0;
    const zl = xThrough ? D - 2 * t : D;
    for (const cz of [z0 + t / 2, z0 + D - t / 2]) out.push(...layLine(s, "x", xs, xl, cz, y, c, o, false, lintels));
    for (const cx of [x0 + t / 2, x0 + W - t / 2]) out.push(...layLine(s, "z", zs, zl, cx, y, c, o, false, lintels));
    lintels.splice(0, lintels.length, ...out.filter((p) => p.k === "lintel"));
  }
  return out;
}

/* ------------------------------------------------------------------ concrete and timber */

/** A strip footing from a to b (450 wide, on the ground). */
export function footingRun(a: { x: number; z: number }, b: { x: number; z: number }): Spec[] {
  const axis: Axis = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z) ? "x" : "z";
  const lo = snapG(Math.min(axis === "x" ? a.x : a.z, axis === "x" ? b.x : b.z));
  const hi = snapG(Math.max(axis === "x" ? a.x : a.z, axis === "x" ? b.x : b.z));
  const L = Math.max(0.45, hi - lo);
  const c = snapCentre(axis === "x" ? a.z : a.x, 0.45);
  const mid = lo + L / 2;
  return [{ k: "footing", x: axis === "x" ? mid : c, y: 0, z: axis === "x" ? c : mid, r: axis === "x" ? 0 : 1, v: 0, s: [L, 0.225, 0.45] }];
}

/** A ring of footings under the walls of a rectangle (a, b its outside corners), the walls centred on them. */
export function footingRect(a: { x: number; z: number }, b: { x: number; z: number }, wallT = KINDS.brick.size[2] + JOINT): Spec[] {
  const x0 = snapG(Math.min(a.x, b.x));
  const z0 = snapG(Math.min(a.z, b.z));
  const x1 = snapG(Math.max(a.x, b.x));
  const z1 = snapG(Math.max(a.z, b.z));
  const w = 0.45;
  const m = (w - wallT) / 2;
  const out: Spec[] = [];
  for (const cz of [z0 + wallT / 2, z1 - wallT / 2]) out.push({ k: "footing", x: (x0 + x1) / 2, y: 0, z: cz, r: 0, v: 0, s: [x1 - x0 + 2 * m, 0.225, w] });
  for (const cx of [x0 + wallT / 2, x1 - wallT / 2]) out.push({ k: "footing", x: cx, y: 0, z: (z0 + z1) / 2, r: 1, v: 0, s: [z1 - z0 + 2 * m - 2 * w, 0.225, w] });
  return out;
}

/** A slab over a rectangle. */
export function slabRect(a: { x: number; z: number }, b: { x: number; z: number }, y = 0): Spec[] {
  const x0 = snapG(Math.min(a.x, b.x));
  const z0 = snapG(Math.min(a.z, b.z));
  const L = Math.max(0.45, snapG(Math.max(a.x, b.x)) - x0);
  const D = Math.max(0.45, snapG(Math.max(a.z, b.z)) - z0);
  return [{ k: "slab", x: x0 + L / 2, y, z: z0 + D / 2, r: 0, v: 0, s: [L, 0.15, D] }];
}

/** A timber stud wall from a to b: bottom plate, studs at 450 centres, top plate. */
export function frameRun(a: { x: number; z: number }, b: { x: number; z: number }, y0: number, height: number, v: number): Spec[] {
  const axis: Axis = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z) ? "x" : "z";
  const lo = snapG(Math.min(axis === "x" ? a.x : a.z, axis === "x" ? b.x : b.z));
  const hi = snapG(Math.max(axis === "x" ? a.x : a.z, axis === "x" ? b.x : b.z));
  const L = Math.max(0.6, hi - lo);
  const c = snapCentre(axis === "x" ? a.z : a.x, 0.09);
  const at = (along: number, cross: number) => (axis === "x" ? { x: along, z: cross } : { x: cross, z: along });
  const r = axis === "x" ? 0 : 1;
  const out: Spec[] = [{ k: "plate", ...at(lo + L / 2, c), y: y0, r, v, s: [L, 0.045, 0.09] }];
  const studH = height - 0.09;
  const n = Math.max(1, Math.round((L - 0.045) / 0.45));
  for (let i = 0; i <= n; i++) {
    const along = lo + 0.0225 + ((L - 0.045) * i) / n;
    out.push({ k: "stud", ...at(along, c), y: y0 + 0.045, r, v, s: [0.045, studH, 0.09] });
  }
  out.push({ k: "plate", ...at(lo + L / 2, c), y: y0 + 0.045 + studH, r, v, s: [L, 0.045, 0.09] });
  return out;
}

/** A timber floor over a rectangle at a height: joists at 450 across the shorter span, boards over them. */
export function floorRect(a: { x: number; z: number }, b: { x: number; z: number }, y: number, v: number): Spec[] {
  const x0 = snapG(Math.min(a.x, b.x));
  const z0 = snapG(Math.min(a.z, b.z));
  const W = Math.max(0.9, snapG(Math.max(a.x, b.x)) - x0);
  const D = Math.max(0.9, snapG(Math.max(a.z, b.z)) - z0);
  const joistsAlongZ = D <= W;
  const span = joistsAlongZ ? D : W;
  const across = joistsAlongZ ? W : D;
  const out: Spec[] = [];
  const n = Math.max(1, Math.round((across - 0.045) / 0.45));
  for (let i = 0; i <= n; i++) {
    const o = 0.0225 + ((across - 0.045) * i) / n;
    out.push(joistsAlongZ ? { k: "joist", x: x0 + o, y, z: z0 + D / 2, r: 1, v, s: [span, 0.19, 0.045] } : { k: "joist", x: x0 + W / 2, y, z: z0 + o, r: 0, v, s: [span, 0.19, 0.045] });
  }
  const by = y + 0.19;
  const boards = Math.floor(span / 0.142);
  for (let i = 0; i < boards; i++) {
    const o = 0.071 + i * 0.142;
    out.push(joistsAlongZ ? { k: "board", x: x0 + W / 2, y: by, z: z0 + o, r: 0, v, s: [W, 0.022, 0.14] } : { k: "board", x: x0 + o, y: by, z: z0 + D / 2, r: 1, v, s: [D, 0.022, 0.14] });
  }
  // A board ripped down to finish against the far edge.
  const rest = span - boards * 0.142;
  if (rest > 0.02) {
    const o = boards * 0.142 + rest / 2;
    const w = rest - 0.002;
    out.push(joistsAlongZ ? { k: "board", x: x0 + W / 2, y: by, z: z0 + o, r: 0, v, s: [W, 0.022, w] } : { k: "board", x: x0 + o, y: by, z: z0 + D / 2, r: 1, v, s: [D, 0.022, w] });
  }
  return out;
}

/* ------------------------------------------------------------------ roofs */

export interface RoofOpts {
  style: RoofStyle;
  /** Degrees. */
  pitch: number;
  cover: RoofCover;
  v: number;
  /** Fill the gables (or the high side of a skillion) with brickwork to the roof line. */
  gables?: boolean;
  /** Gutters along the eaves, with a downpipe at each end. */
  gutters?: boolean;
  /** Solar panels on the sunny slope (as many as fit, up to this many). */
  solar?: number;
}

/**
 * Frame and cover a roof over a rectangle of walls (a, b its outside corners; yTop the top of the
 * walls): wall plates, rafters at 600 mm, battens, then tiles (or sheets) one by one, ridge tiles,
 * fascias and barge boards, and the gable ends built up in brick to the roof line.
 */
export function roofGen(s: State, a: { x: number; z: number }, b: { x: number; z: number }, yTop: number, o: RoofOpts): Spec[] {
  const x0 = snapG(Math.min(a.x, b.x));
  const z0 = snapG(Math.min(a.z, b.z));
  const x1 = snapG(Math.max(a.x, b.x));
  const z1 = snapG(Math.max(a.z, b.z));
  const ridgeX = x1 - x0 >= z1 - z0;
  if (o.style === "flat") return flatRoof(x0, z0, x1, z1, yTop, ridgeX, o);
  // The roof's own frame: u along the ridge, w across it (w = 0 at the middle).
  const A = ridgeX ? x1 - x0 : z1 - z0;
  const S = ridgeX ? z1 - z0 : x1 - x0;
  const u0 = ridgeX ? x0 : z0;
  const wc = ridgeX ? (z0 + z1) / 2 : (x0 + x1) / 2;
  const P = (o.pitch * Math.PI) / 180;
  const tp = Math.tan(P);
  const cp = Math.cos(P);
  const sp = Math.sin(P);
  const ov = 0.35;
  const og = 0.18;
  const plateH = 0.045;
  const rafterH = 0.14;
  const battenH = 0.025;
  const gable = o.style === "gable";
  const sides: (1 | -1)[] = gable ? [1, -1] : [1];
  // The run of each slope, from its eave to the ridge (or the high side).
  const run = gable ? S / 2 : S;
  const Ls = (run + ov + (gable ? 0 : ov)) / cp;
  const world = (u: number, w: number, y: number) => (ridgeX ? { x: u0 + u, y, z: wc + w } : { x: wc + w, y, z: u0 + u });
  const yaw = (sd: 1 | -1) => (ridgeX ? (sd > 0 ? 0 : 2) : sd > 0 ? 1 : 3);
  const along = ridgeX ? 0 : 1;
  // A point on a slope: along the ridge u, q up the slope from the eave end, h off the rafters' underside.
  const slopePt = (sd: 1 | -1, u: number, q: number, h: number) => {
    const wEave = gable ? sd * (S / 2 + ov) : S / 2 + ov;
    const yEave = yTop + plateH - ov * tp;
    const wq = wEave - sd * q * cp;
    const yq = yEave + q * sp;
    return world(u, wq + sd * h * sp, yq + h * cp);
  };
  const out: Spec[] = [];
  const wood = 0;
  const tv = o.v;
  // Wall plates on the walls the rafters sit on (between the gable ends).
  const plateW = gable ? [S / 2 - GRID, -(S / 2 - GRID)] : [S / 2 - GRID];
  for (const w of plateW) {
    const p = world(A / 2, w, yTop);
    out.push({ k: "plate", ...p, r: along, v: wood, s: [A - 4 * GRID, plateH, 0.09] });
  }
  // Rafters at 600 mm (the end ones stand inside the gables).
  const nR = Math.max(1, Math.round((A - 0.5) / 0.6));
  for (const sd of sides) {
    for (let i = 0; i <= nR; i++) {
      const u = 0.25 + ((A - 0.5) * i) / nR;
      const mid = slopePt(sd, u, Ls / 2, 0);
      out.push({ k: "rafter", ...mid, r: yaw(sd), p: P, v: wood, s: [0.045, rafterH, Ls] });
    }
    // Battens across the rafters, a tile gauge apart.
    const A2 = A + 2 * og;
    for (let q = 0.06; q < Ls - 0.04; q += 0.32) out.push({ k: "batten", ...slopePt(sd, A / 2, q, rafterH), r: yaw(sd), p: P, v: wood, s: [A2, battenH, 0.05] });
    if (o.cover === "tile") {
      // Tiles, row by row up the slope, each hung on its batten and lapping the row below.
      const cols = Math.ceil(A2 / 0.3);
      const w0 = A / 2 - (cols * 0.3) / 2;
      for (let q = 0.06; q < Ls - 0.04; q += 0.32) {
        const qc = q + 0.21 - 0.075;
        for (let i = 0; i < cols; i++) out.push({ k: "tile", ...slopePt(sd, w0 + 0.15 + i * 0.3, qc, rafterH + battenH), r: yaw(sd), p: P + 0.035, v: tv, s: [0.3, 0.018, 0.42] });
      }
    } else {
      const cols = Math.ceil(A2 / 0.76);
      const w0 = A / 2 - (cols * 0.76) / 2;
      for (let i = 0; i < cols; i++) out.push({ k: "sheet", ...slopePt(sd, w0 + 0.38 + i * 0.76, Ls / 2, rafterH + battenH), r: yaw(sd), p: P, v: tv, s: [0.76, 0.02, Ls + 0.05] });
    }
    // The fascia along the eave, and barge boards up the gable ends.
    const e = slopePt(sd, A / 2, 0, -0.02);
    const ew = gable ? sd * (S / 2 + ov + 0.011) : S / 2 + ov + 0.011;
    const ep = world(A / 2, ew, e.y - 0.12);
    out.push({ k: "fascia", ...ep, r: along, v: 3, s: [A + 2 * og, 0.19, 0.022] });
    for (const u of [-og + 0.011, A + og - 0.011]) {
      const m = slopePt(sd, u, Ls / 2, rafterH + battenH - 0.12);
      out.push({ k: "fascia", ...m, r: yaw(sd), p: P, v: 3, s: [0.022, 0.19, Ls] });
    }
  }
  if (gable) {
    // Ridge tiles along the top.
    const yR = yTop + plateH + (S / 2) * tp + (rafterH + battenH + 0.03) / cp - 0.06;
    const A2 = A + 2 * og;
    const n = Math.ceil(A2 / 0.45);
    for (let i = 0; i < n; i++) {
      const u = -og + (A2 * (i + 0.5)) / n;
      out.push({ k: o.cover === "tile" ? "ridge" : "fascia", ...world(u, 0, yR), r: along, v: o.cover === "tile" ? tv : 0, ...(o.cover === "tile" ? { s: [A2 / n - 0.005, 0.13, 0.3] as [number, number, number] } : { s: [A2 / n, 0.04, 0.3] as [number, number, number] }) });
    }
  }
  const gv = Math.min(o.v, KINDS.gutter.variants.length - 1);
  if (o.gutters) {
    for (const sd of sides) {
      const e = slopePt(sd, A / 2, 0, -0.02);
      const gw = gable ? sd * (S / 2 + ov + 0.022 + 0.06) : S / 2 + ov + 0.022 + 0.06;
      out.push({ k: "gutter", ...world(A / 2, gw, e.y - 0.05), r: along, v: gv, s: [A + 2 * og, 0.1, 0.12] });
      const pw = gable ? sd * (S / 2 + 0.06) : S / 2 + 0.06;
      for (const u of [0.2, A - 0.2]) out.push({ k: "downpipe", ...world(u, pw, 0), r: along, v: gv, s: [0.09, Math.max(0.5, e.y - 0.05), 0.09] });
    }
  }
  if (o.solar) {
    // Portrait panels in up to two rows, clear of the eave and the ridge (landscape on a short slope).
    const sd = 1;
    const q0 = ov / cp + 0.35;
    const portrait = Ls - q0 - 0.35 >= 1.74;
    const [pw, pl] = portrait ? [1.13, 1.72] : [1.72, 1.13];
    const cols = Math.max(0, Math.floor((A - 0.6) / (pw + 0.02)));
    const rows = Math.max(0, Math.min(2, Math.floor((Ls - q0 - 0.35) / (pl + 0.02))));
    let n = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols && n < o.solar; c++, n++) {
        const u = A / 2 + (c - (cols - 1) / 2) * (pw + 0.02);
        out.push({ k: "solar", ...slopePt(sd, u, q0 + pl / 2 + r * (pl + 0.02), rafterH + battenH + 0.06), r: yaw(sd), p: P, v: 0, s: [pw, 0.035, pl] });
      }
  }
  if (o.gables !== false) out.push(...gableInfill(s, x0, z0, x1, z1, yTop, ridgeX, gable, tp, plateH));
  return out;
}

/** A flat roof: joists across the short span, a membrane over the deck, a deep fascia all round. */
function flatRoof(x0: number, z0: number, x1: number, z1: number, yTop: number, ridgeX: boolean, o: RoofOpts): Spec[] {
  const A = ridgeX ? x1 - x0 : z1 - z0;
  const S = ridgeX ? z1 - z0 : x1 - x0;
  const u0 = ridgeX ? x0 : z0;
  const wc = ridgeX ? (z0 + z1) / 2 : (x0 + x1) / 2;
  const ov = 0.3;
  const world = (u: number, w: number, y: number) => (ridgeX ? { x: u0 + u, y, z: wc + w } : { x: wc + w, y, z: u0 + u });
  const along = ridgeX ? 0 : 1;
  const across = ridgeX ? 1 : 0;
  const out: Spec[] = [];
  const n = Math.max(1, Math.round((A - 0.045) / 0.45));
  for (let i = 0; i <= n; i++) out.push({ k: "joist", ...world(0.0225 + ((A - 0.045) * i) / n, 0, yTop), r: across, v: 0, s: [S + 2 * ov, 0.19, 0.045] });
  const yM = yTop + 0.19;
  const strips = Math.ceil((A + 2 * ov) / 1.2);
  const sw = (A + 2 * ov) / strips;
  const mv = Math.min(o.v, KINDS.membrane.variants.length - 1);
  for (let i = 0; i < strips; i++) out.push({ k: "membrane", ...world(-ov + sw * (i + 0.5), 0, yM), r: across, v: mv, s: [S + 2 * ov, 0.012, sw] });
  for (const sd of [1, -1]) {
    out.push({ k: "fascia", ...world(A / 2, sd * (S / 2 + ov + 0.011), yTop - 0.04), r: along, v: 3, s: [A + 2 * ov + 0.044, 0.25, 0.022] });
    out.push({ k: "fascia", ...world(sd > 0 ? A + ov + 0.011 : -ov - 0.011, 0, yTop - 0.04), r: across, v: 3, s: [S + 2 * ov, 0.25, 0.022] });
  }
  if (o.gutters) {
    const gv = Math.min(o.v, KINDS.gutter.variants.length - 1);
    out.push({ k: "gutter", ...world(A / 2, S / 2 + ov + 0.022 + 0.06, yTop + 0.06), r: along, v: gv, s: [A + 2 * ov, 0.1, 0.12] });
    for (const u of [0.2, A - 0.2]) out.push({ k: "downpipe", ...world(u, S / 2 + 0.06, 0), r: along, v: gv, s: [0.09, yTop + 0.06, 0.09] });
  }
  if (o.solar) {
    const cols = Math.max(0, Math.floor((A - 0.4) / 1.15));
    const rows = Math.max(0, Math.floor((S - 0.4) / 2.0));
    let k = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols && k < o.solar; c++, k++) {
        const u = A / 2 + (c - (cols - 1) / 2) * 1.15;
        const w = (r - (rows - 1) / 2) * 2.0;
        out.push({ k: "solar", ...world(u, w, yM + 0.15), r: along, p: 0.17, v: 0, s: [1.13, 0.035, 1.72] });
      }
  }
  return out;
}

/** Brick the gable ends (and a skillion's high side) up to the underside of the roof. */
function gableInfill(s: State, x0: number, z0: number, x1: number, z1: number, yTop: number, ridgeX: boolean, gable: boolean, tp: number, plateH: number): Spec[] {
  const out: Spec[] = [];
  const S = ridgeX ? z1 - z0 : x1 - x0;
  const A = ridgeX ? x1 - x0 : z1 - z0;
  const u0 = ridgeX ? x0 : z0;
  const wc = ridgeX ? (z0 + z1) / 2 : (x0 + x1) / 2;
  /** The roof's underside above the wall top at w across. */
  const under = (w: number) => plateH + (gable ? S / 2 - Math.abs(w) : S / 2 - w) * tp;
  // What the walls are built of, from the top course at a gable end.
  const sample = (u: number) => {
    const p = ridgeX ? { x: u0 + u, z: wc } : { x: wc, z: u0 + u };
    const found = near(s, { x0: p.x - 0.3, x1: p.x + 0.3, z0: p.z - 0.3, z1: p.z + 0.3, y0: yTop - 0.1, y1: yTop + 0.01 }).find((q) => KINDS[q.k].family === "masonry" && Math.abs(box(q).y1 - yTop) < 0.01);
    return found ?? null;
  };
  // A skillion's high side is built up to its full height, all along.
  if (!gable) {
    const p = ridgeX ? { x: u0 + A / 2, z: wc - S / 2 + 0.06 } : { x: wc - S / 2 + 0.06, z: u0 + A / 2 };
    const m = near(s, { x0: p.x - 0.3, x1: p.x + 0.3, z0: p.z - 0.3, z1: p.z + 0.3, y0: yTop - 0.1, y1: yTop + 0.01 }).find((q) => KINDS[q.k].family === "masonry" && Math.abs(box(q).y1 - yTop) < 0.01);
    if (m) {
      const mb = box(m);
      const leafW = ridgeX ? (mb.z0 + mb.z1) / 2 : (mb.x0 + mb.x1) / 2;
      const k = m.k === "bat" || m.k === "closer" ? "brick" : m.k === "halfblock" ? "block" : m.k === "halfstone" ? "stone" : m.k;
      const H = KINDS[k].size[1] + JOINT;
      const rise = under(-S / 2) - 0.02;
      for (let c = 0; (c + 1) * H - JOINT <= rise; c++) {
        for (const u of course(k, "stretcher", c + 1, A, 0, true)) {
          const mid = u0 + (u.a0 + u.a1) / 2;
          out.push({ k: u.k, x: ridgeX ? mid : leafW, y: yTop + JOINT + c * H, z: ridgeX ? leafW : mid, r: ridgeX ? 0 : 1, v: m.v });
        }
      }
    }
  }
  const ends = [{ u: 0 }, { u: A }];
  for (const end of ends) {
    const m = sample(end.u === 0 ? 0.06 : A - 0.06);
    if (!m) continue;
    const mb = box(m);
    const leafU = ridgeX ? (mb.x0 + mb.x1) / 2 : (mb.z0 + mb.z1) / 2;
    const k = m.k === "bat" || m.k === "closer" ? "brick" : m.k === "halfblock" ? "block" : m.k === "halfstone" ? "stone" : m.k;
    const H = KINDS[k].size[1] + JOINT;
    for (let c = 0; c < 80; c++) {
      const y = yTop + JOINT + c * H;
      const top = y + H - JOINT - yTop;
      // How far across this course may run and stay under the roof.
      let lo = -S / 2;
      let hi = S / 2;
      if (gable) {
        const hw = S / 2 - (top + 0.02 - plateH) / tp;
        if (hw < GRID * 2) break;
        lo = -hw;
        hi = hw;
      } else {
        const wMax = S / 2 - (top + 0.02 - plateH) / tp;
        if (wMax < -S / 2 + GRID * 2) break;
        hi = wMax;
      }
      const lineStart = wc - S / 2;
      const units = course(k, "stretcher", c + 1, S, 0, true).filter((u) => u.a0 - S / 2 >= lo - 1e-6 && u.a1 - S / 2 <= hi + 1e-6);
      // And cut pieces to finish each end against the slope.
      const used = units.map((u) => [u.a0, u.a1]);
      const first = used.length ? Math.min(...used.map((x) => x[0])) : hi + S / 2;
      const last = used.length ? Math.max(...used.map((x) => x[1])) : lo + S / 2;
      const from = Math.ceil((lo + S / 2) / GRID - 1e-6) * GRID;
      const to = Math.floor((hi + S / 2) / GRID + 1e-6) * GRID;
      // Cut pieces either side of the whole ones (or, near the apex, all the way across once).
      const extra = used.length ? [...fill(k, from, first, 0, 1), ...fill(k, last, to, 0, 1)] : fill(k, from, to, 0, 1);
      for (const u of [...units, ...extra]) {
        const mid = lineStart + (u.a0 + u.a1) / 2;
        const w = mid - wc;
        if (gable && under(w) < top - 0.001) continue;
        out.push({ k: u.k, x: ridgeX ? leafU : mid, y, z: ridgeX ? mid : leafU, r: ridgeX ? 1 : 0, v: m.v });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ finishing, paving, fencing, copying */

/**
 * Refinish pieces (paint a door, re-colour a run of pavers, stain a fence): a coat costs a tenth
 * of what the pieces did, and a few minutes each. One undo step.
 */
export function repaint(s: State, ids: number[], v: number): number {
  const changed: { id: number; from: number; to: number }[] = [];
  let cost = 0;
  let minutes = 0;
  for (const id of ids) {
    const p = byId(s, id);
    if (!p || p.v === v || v >= KINDS[p.k].variants.length) continue;
    const c = costOf(p) * 0.1 + 0.2;
    if (paid(s) && s.money - cost < c) break;
    changed.push({ id, from: p.v, to: v });
    p.v = v;
    cost += c;
    minutes += Math.min(6, minutesOf(p) * 0.2 + 0.3) / (s.speed ?? 1);
  }
  if (!changed.length) return 0;
  const money = paid(s) ? -cost : 0;
  s.money += money;
  s.spent += cost;
  s.minutes += minutes;
  record(s, { added: [], removed: [], money, spent: cost, minutes, changed });
  s.rev++;
  return changed.length;
}

/** Down tools for the day: the clock goes on to tomorrow morning (and the mortar sets overnight). */
export function knockOff(s: State) {
  const next = Math.floor(s.minutes / DAY_MINUTES + 1) * DAY_MINUTES;
  s.minutes = next;
  s.rev++;
}

/**
 * Pavers over a rectangle (on the ground or a slab), in a pattern, worked out on a 100 mm grid:
 * whole pavers where the pattern puts them, and cut halves wherever the edge leaves a gap.
 */
export function paveRect(a: { x: number; z: number }, b: { x: number; z: number }, y: number, pattern: PavePattern, v: number): Spec[] {
  const u = 0.1;
  const x0 = Math.round(Math.min(a.x, b.x) / u) * u;
  const z0 = Math.round(Math.min(a.z, b.z) / u) * u;
  const W = Math.max(2, Math.min(140, Math.round((Math.max(a.x, b.x) - x0) / u)));
  const D = Math.max(2, Math.min(140, Math.round((Math.max(a.z, b.z) - z0) / u)));
  const used = new Uint8Array(W * D);
  const out: Spec[] = [];
  const free = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < D && !used[j * W + i];
  /** A whole paver with its corner cell at (i, j), along x (h) or along z. */
  const put = (i: number, j: number, h: boolean) => {
    const cells: [number, number][] = h ? [[i, j], [i + 1, j]] : [[i, j], [i, j + 1]];
    if (!cells.every(([ci, cj]) => free(ci, cj))) return;
    for (const [ci, cj] of cells) used[cj * W + ci] = 1;
    out.push({ k: "paver", x: x0 + (h ? i + 1 : i + 0.5) * u, y, z: z0 + (h ? j + 0.5 : j + 1) * u, r: h ? 0 : 1, v });
  };
  if (pattern === "herring") {
    // A staircase of a paver along x, then one along z, repeated every four rows.
    for (let i = -D - 4; i < W + 4; i++)
      for (let m = -Math.ceil((W + D) / 4) - 2; m <= Math.ceil((W + D) / 4) + 2; m++) {
        put(i, i + 4 * m, true);
        put(i, i + 1 + 4 * m, false);
      }
  } else if (pattern === "basket") {
    for (let j = 0; j < D; j += 2)
      for (let i = 0; i < W; i += 2) {
        const h = ((i + j) / 2) % 2 === 0;
        if (h) {
          put(i, j, true);
          put(i, j + 1, true);
        } else {
          put(i, j, false);
          put(i + 1, j, false);
        }
      }
  } else {
    for (let j = 0; j < D; j++) for (let i = pattern === "stretcher" && j % 2 ? 1 : 0; i < W; i += 2) put(i, j, true);
  }
  // Cut halves to fill the edges.
  for (let j = 0; j < D; j++)
    for (let i = 0; i < W; i++)
      if (free(i, j)) {
        used[j * W + i] = 1;
        out.push({ k: "paver", x: x0 + (i + 0.5) * u, y, z: z0 + (j + 0.5) * u, r: 0, v, s: [0.1, 0.05, 0.1] });
      }
  return out;
}

/** A paling fence from a to b: posts at most 2.4 m apart, two rails between them, palings along the rails. */
export function fenceRun(a: { x: number; z: number }, b: { x: number; z: number }, height: number, v: number): Spec[] {
  const axis: Axis = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z) ? "x" : "z";
  const lo = snapG(Math.min(axis === "x" ? a.x : a.z, axis === "x" ? b.x : b.z));
  const hi = snapG(Math.max(axis === "x" ? a.x : a.z, axis === "x" ? b.x : b.z));
  const L = Math.max(0.6, hi - lo);
  const c = snapCentre(axis === "x" ? a.z : a.x, 0.09);
  const at = (along: number, cross: number) => (axis === "x" ? { x: along, z: cross } : { x: cross, z: along });
  const r = axis === "x" ? 0 : 1;
  const out: Spec[] = [];
  const bays = Math.max(1, Math.ceil((L - 0.09) / 2.4));
  const bay = (L - 0.09) / bays;
  for (let i = 0; i <= bays; i++) out.push({ k: "post", ...at(lo + 0.045 + i * bay, c), y: 0, r, v: Math.min(v, 3), s: [0.09, height + 0.1, 0.09] });
  const railC = c + 0.045 + 0.019;
  for (let i = 0; i < bays; i++)
    for (const yy of [0.3, height - 0.35]) out.push({ k: "rail", ...at(lo + 0.045 + (i + 0.5) * bay, railC), y: yy, r, v, s: [bay - 0.09, 0.075, 0.038] });
  const palC = railC + 0.019 + 0.008;
  const n = Math.floor(L / 0.16);
  const start = lo + (L - n * 0.16) / 2 + 0.08;
  for (let i = 0; i < n; i++) out.push({ k: "paling", ...at(start + i * 0.16, palC), y: 0.05, r, v, s: [0.15, height - 0.05, 0.016] });
  return out;
}

/**
 * Copies of pieces moved by (dx, dy, dz) and turned a number of quarter turns about (cx, cz):
 * a wall run, a whole roof, a window and its lintel, laid again somewhere else.
 */
export function copySpecs(src: Piece[], dx: number, dy: number, dz: number, turns: number, cx: number, cz: number): Spec[] {
  const t = ((turns % 4) + 4) % 4;
  return src.map((p) => {
    let ox = p.x - cx;
    let oz = p.z - cz;
    for (let k = 0; k < t; k++) [ox, oz] = [oz, -ox];
    const sp: Spec = { k: p.k, x: cx + ox + dx, y: p.y + dy, z: cz + oz + dz, r: (p.r + t) % 4, v: p.v };
    if (p.s) sp.s = [...p.s];
    if (p.p) sp.p = p.p;
    return sp;
  });
}

/* ------------------------------------------------------------------ openings */

/**
 * Put a window or door into a wall that's already built: a lintel goes in over it first (in
 * place of the bricks it replaces), then the bricks where the opening goes come out.
 */
export function cutOpening(s: State, spec: Spec): Result {
  const p: Piece = { ...spec, id: -1, t: 0 };
  const b = box(p);
  const inWay = within(s, b);
  if (inWay.some((q) => KINDS[q.k].family !== "masonry")) return { added: [], skipped: 1, why: "Only brickwork can be cut out for an opening" };
  const ax: Axis = p.r % 2 ? "z" : "x";
  const along = ax === "x" ? b.x1 - b.x0 : b.z1 - b.z0;
  const L = along + 0.45;
  const lH = L > 2.6 ? 0.215 : 0.14;
  const lin: Spec = { k: "lintel", x: p.x, y: b.y1 + JOINT, z: p.z, r: p.r % 2, v: 0, s: [L, lH, 0.1025] };
  const lb = box({ ...lin, id: -1, t: 0 });
  const above = within(s, { ...b, y0: b.y1 + 0.004, y1: b.y1 + 0.2 }).length > 0;
  const toCut = inWay.map((q) => q.id);
  if (above) toCut.push(...within(s, lb).filter((q) => KINDS[q.k].family === "masonry").map((q) => q.id));
  // Take the bricks out without anything above falling: the lintel goes in in the same breath.
  const gone = rawRemove(s, new Set(toCut));
  const res = commit(s, above ? [lin, spec] : [spec]);
  if (!res.added.some((a) => a.k === spec.k)) {
    // It didn't take: put the bricks back.
    if (res.added.length) rawRemove(s, new Set(res.added.map((x) => x.id)));
    for (const g of gone) rawAdd(s, g);
    hist(s).undo.pop();
    s.rev++;
    return { added: [], skipped: 1, why: res.why ?? "It won't go there" };
  }
  // Fold the cut into the same undo step.
  const h = hist(s);
  const last = h.undo[h.undo.length - 1];
  if (last) last.removed.push(...gone);
  s.stats.removed += gone.length;
  return res;
}

/* ------------------------------------------------------------------ time and money */

export function dayOf(minutes: number) {
  return Math.floor(minutes / 540) + 1;
}

export function clockOf(minutes: number) {
  const m = minutes % 540;
  const h = 7 + Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  return `${h}:${String(mm).padStart(2, "0")}`;
}

/** How far a mortar joint has gone off (0 wet, 1 set): about half a working day. */
export function cure(s: State, p: Piece) {
  return Math.max(0, Math.min(1, (s.minutes - p.t) / 240));
}

/* ------------------------------------------------------------------ saving */

const KIND_LIST = Object.keys(KINDS) as Kind[];

export function save(s: State) {
  const r = (n: number) => Math.round(n * 10000) / 10000;
  const pcs = s.pieces.map((p) => [KIND_LIST.indexOf(p.k), r(p.x), r(p.y), r(p.z), p.r, p.v, p.s ? p.s.map(r) : 0, p.p ? r(p.p) : 0, p.g ?? 0, Math.round(p.t)]);
  return JSON.stringify({ ...s, pieces: pcs });
}

export function load(raw: string): State | null {
  try {
    const o = JSON.parse(raw) as Omit<State, "pieces"> & { pieces: (number | number[])[][] };
    if (!o || o.v !== 1 || !Array.isArray(o.pieces)) return null;
    let id = 1;
    const pieces: Piece[] = o.pieces.map((a) => {
      const p: Piece = { id: id++, k: KIND_LIST[a[0] as number], x: a[1] as number, y: a[2] as number, z: a[3] as number, r: a[4] as number, v: a[5] as number, t: (a[9] as number) ?? 0 };
      if (Array.isArray(a[6])) p.s = a[6] as [number, number, number];
      if (a[7]) p.p = a[7] as number;
      if (a[8]) p.g = a[8] as number;
      return p;
    });
    return { ...o, pieces, nextId: id, rev: 0 } as State;
  } catch {
    return null;
  }
}

export { COURSE };
