import { JOINT, JOBS, KINDS, type Job, type Kind, type Need } from "./data";
import { box, dayOf, near, type Box, type Piece, type State } from "./model";

/**
 * The building inspector. Each job's brief is a list of needs (a wall this long and high, four
 * walls round a space, footings under the brickwork, a roof over it…); the inspector measures
 * what's been built in the job's pegged-out zone against each, checks the workmanship (are the
 * walls on proper foundations; are the perpends staggered, or are there straight joints), and
 * then rates the job on the brief, the budget and the deadline.
 */

export interface Check {
  label: string;
  ok: boolean;
  detail: string;
  /** For quality checks, 0..1. */
  score?: number;
}

export interface Report {
  job: Job;
  checks: Check[];
  /** All of the brief met. */
  passed: boolean;
  stars: number;
  pay: number;
  spent: number;
  days: number;
}

export const jobById = (id: string | null) => JOBS.find((j) => j.id === id) ?? null;

const inZone = (j: Job, p: Piece) => p.x >= j.zone[0] && p.x <= j.zone[2] && p.z >= j.zone[1] && p.z <= j.zone[3];
const masonry = (p: Piece) => KINDS[p.k].family === "masonry";
const ofKind = (p: Piece, of: Kind | string) => p.k === of || KINDS[p.k].family === of;

/** The pieces in the zone. */
function zonePieces(s: State, j: Job) {
  return s.pieces.filter((p) => inZone(j, p));
}

/** Are the walls on foundations? The share of the bottom course standing on a footing or slab. */
export function footingShare(s: State, ps: Piece[]) {
  let good = 0;
  let bad = 0;
  for (const p of ps) {
    if (!masonry(p)) continue;
    const b = box(p);
    if (b.y0 <= 0.002) {
      bad++;
      continue;
    }
    const under = near(s, { ...b, y0: b.y0 - 0.05, y1: b.y0 }).filter((q) => {
      const qb = box(q);
      return Math.abs(qb.y1 + JOINT - b.y0) < 0.006 || Math.abs(qb.y1 - b.y0) < 0.004;
    });
    // Only the foundation course counts: brickwork on brickwork, a lintel or a beam is fine.
    if (under.some((q) => masonry(q) || (KINDS[q.k].bears && q.k !== "footing" && q.k !== "slab"))) continue;
    if (under.some((q) => q.k === "footing" || q.k === "slab")) good++;
    else bad++;
  }
  return good + bad ? good / (good + bad) : 0;
}

/**
 * The bond: of the joints between bricks in a course, how many are clear of a joint in the
 * course below (a straight joint runs up the wall and weakens it).
 */
export function bondShare(s: State, ps: Piece[]) {
  let joints = 0;
  let straight = 0;
  for (const p of ps) {
    if (!masonry(p) || p.p) continue;
    const b = box(p);
    const alongX = p.r % 2 === 0;
    const hi = alongX ? b.x1 : b.z1;
    const c0 = alongX ? b.z0 : b.x0;
    const c1 = alongX ? b.z1 : b.x1;
    const around = near(s, { ...b, y0: b.y0 - 0.1, y1: b.y1 }, 0.3).filter((q) => q.id !== p.id && masonry(q));
    // Its right-hand joint, if another brick carries on in the same course.
    const next = around.find((q) => {
      const qb = box(q);
      if (Math.abs(qb.y0 - b.y0) > 0.004) return false;
      const qlo = alongX ? qb.x0 : qb.z0;
      const qc0 = alongX ? qb.z0 : qb.x0;
      const qc1 = alongX ? qb.z1 : qb.x1;
      return Math.abs(qlo - hi - JOINT) < 0.006 && qc1 > c0 + 0.01 && qc0 < c1 - 0.01;
    });
    if (!next) continue;
    const below = around.filter((q) => {
      const qb = box(q);
      const qc0 = alongX ? qb.z0 : qb.x0;
      const qc1 = alongX ? qb.z1 : qb.x1;
      return Math.abs(qb.y1 + JOINT - b.y0) < 0.006 && qc1 > c0 + 0.01 && qc0 < c1 - 0.01;
    });
    if (!below.length) continue;
    joints++;
    const j = hi + JOINT / 2;
    // A brick below that spans the joint means it's bonded.
    const bridged = below.some((q) => {
      const qb = box(q);
      return (alongX ? qb.x0 : qb.z0) < j - 0.02 && (alongX ? qb.x1 : qb.z1) > j + 0.02;
    });
    if (!bridged) straight++;
  }
  return joints ? 1 - straight / joints : 1;
}

/** The longest straight wall: for each wall line, the height of courses at least `len` long. */
function bestWall(s: State, ps: Piece[], len: number) {
  const lines = new Map<string, Piece[]>();
  for (const p of ps) {
    if (!masonry(p)) continue;
    const b = box(p);
    const alongX = p.r % 2 === 0;
    const cross = alongX ? (b.z0 + b.z1) / 2 : (b.x0 + b.x1) / 2;
    const k = `${alongX ? "x" : "z"}${Math.round(cross / 0.05)}`;
    let l = lines.get(k);
    if (!l) lines.set(k, (l = []));
    l.push(p);
  }
  let bestLen = 0;
  let bestH = 0;
  for (const [k, l] of lines) {
    const alongX = k[0] === "x";
    const courses = new Map<number, [number, number][]>();
    for (const p of l) {
      const b = box(p);
      const ck = Math.round(b.y0 / 0.0375);
      let c = courses.get(ck);
      if (!c) courses.set(ck, (c = []));
      c.push(alongX ? [b.x0, b.x1] : [b.z0, b.z1]);
    }
    const longest = (iv: [number, number][]) => {
      iv.sort((a, b) => a[0] - b[0]);
      let best = 0;
      let s0 = iv[0][0];
      let e0 = iv[0][1];
      for (const [a, b] of iv.slice(1)) {
        if (a <= e0 + JOINT + 0.006) e0 = Math.max(e0, b);
        else {
          best = Math.max(best, e0 - s0);
          s0 = a;
          e0 = b;
        }
      }
      return Math.max(best, e0 - s0);
    };
    const keys = [...courses.keys()].sort((a, b) => a - b);
    let runStart = -1;
    let runTop = 0;
    for (const ck of keys) {
      const L = longest(courses.get(ck)!);
      bestLen = Math.max(bestLen, L);
      if (L >= len - 0.05) {
        if (runStart < 0) runStart = ck * 0.0375;
        runTop = ck * 0.0375 + 0.075;
        bestH = Math.max(bestH, runTop - runStart);
      } else runStart = -1;
    }
  }
  return { len: bestLen, h: bestH };
}

/** Is a point inside some (non-roof) piece? */
function solidAt(s: State, x: number, y: number, z: number) {
  const b: Box = { x0: x - 0.01, x1: x + 0.01, y0: y - 0.01, y1: y + 0.01, z0: z - 0.01, z1: z + 0.01 };
  return near(s, b).some((p) => {
    if (KINDS[p.k].family === "roof") return false;
    const pb = box(p);
    return x >= pb.x0 - 0.006 && x <= pb.x1 + 0.006 && y >= pb.y0 - 0.012 && y <= pb.y1 + 0.012 && z >= pb.z0 - 0.006 && z <= pb.z1 + 0.006;
  });
}

/** The walls round the biggest enclosure: its size, its height, and how solid its four sides are. */
function enclosure(s: State, ps: Piece[]) {
  const m = ps.filter(masonry);
  if (!m.length) return null;
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  let top = 0;
  let base = Infinity;
  for (const p of m) {
    const b = box(p);
    x0 = Math.min(x0, b.x0);
    z0 = Math.min(z0, b.z0);
    x1 = Math.max(x1, b.x1);
    z1 = Math.max(z1, b.z1);
    top = Math.max(top, b.y1);
    base = Math.min(base, b.y0);
  }
  // Sample each side, a little in from the outside face, course by course up the wall: the walls'
  // height is as far up as all four sides are still there (so a gable doesn't count).
  const side = (pts: [number, number][], y: number) => {
    let hit = 0;
    for (const [x, z] of pts) if (solidAt(s, x, y, z)) hit++;
    return pts.length ? hit / pts.length : 0;
  };
  const step = 0.25;
  const along = (a0: number, a1: number, f: (a: number) => [number, number]) => {
    const out: [number, number][] = [];
    for (let a = a0 + 0.2; a <= a1 - 0.2; a += step) out.push(f(a));
    return out;
  };
  const lines = [along(x0, x1, (a) => [a, z0 + 0.05]), along(x0, x1, (a) => [a, z1 - 0.05]), along(z0, z1, (a) => [x0 + 0.05, a]), along(z0, z1, (a) => [x1 - 0.05, a])];
  let h = 0;
  let solidSum = 0;
  let n = 0;
  // A floor band (joists showing between storeys) is a short gap the walls carry on above.
  let gap = 0;
  for (let y = base + 0.2; y < top; y += 0.075) {
    const f = Math.min(...lines.map((l) => side(l, y)));
    if (f < 0.8) {
      if (++gap * 0.075 > 0.3) break;
      continue;
    }
    gap = 0;
    h = y - base + 0.075;
    solidSum += f;
    n++;
  }
  const solid = n ? solidSum / n : Math.min(...lines.map((l) => side(l, (base + top) / 2)));
  if (!n) h = 0;
  return { w: x1 - x0, d: z1 - z0, h, top: base + h, x0, z0, x1, z1, solid };
}

/** How much of a rectangle has roof over it. */
function roofCover(s: State, r: { x0: number; z0: number; x1: number; z1: number }, above: number) {
  let n = 0;
  let hit = 0;
  for (let x = r.x0 + 0.25; x < r.x1; x += 0.5)
    for (let z = r.z0 + 0.25; z < r.z1; z += 0.5) {
      n++;
      const col = near(s, { x0: x - 0.01, x1: x + 0.01, z0: z - 0.01, z1: z + 0.01, y0: above, y1: 20 });
      if (col.some((p) => (p.k === "tile" || p.k === "sheet" || p.k === "ridge" || p.k === "membrane" || (p.k === "slab" && box(p).y0 > above)) && box(p).y1 > above)) hit++;
    }
  return n ? hit / n : 0;
}

function needCheck(s: State, ps: Piece[], n: Need): Check {
  switch (n.k) {
    case "wall": {
      const w = bestWall(s, ps, n.len);
      const ok = w.len >= n.len - 0.05 && w.h >= n.h - 0.01;
      return { label: `A wall ${n.len} m long and ${Math.round(n.h * 1000)} mm high`, ok, detail: w.len ? `Longest ${w.len.toFixed(2)} m; ${Math.round(w.h * 1000)} mm high at that length` : "No wall yet" };
    }
    case "footings": {
      const f = footingShare(s, ps);
      return { label: "Brickwork on footings", ok: f >= n.min, detail: `${Math.round(f * 100)}% of the bottom course on a footing or slab`, score: f };
    }
    case "bond": {
      const b = bondShare(s, ps);
      return { label: "A sound bond (no straight joints)", ok: b >= n.min, detail: `${Math.round(b * 100)}% of joints staggered`, score: b };
    }
    case "enclosed": {
      const e = enclosure(s, ps);
      const dimsOk = !!e && ((e.w >= n.w - 0.05 && e.d >= n.d - 0.05) || (e.w >= n.d - 0.05 && e.d >= n.w - 0.05));
      const ok = !!e && dimsOk && e.h >= n.h - 0.01 && e.solid >= 0.85;
      return { label: `Walls round ${n.w} × ${n.d} m, ${n.h} m high`, ok, detail: e ? `${e.w.toFixed(2)} × ${e.d.toFixed(2)} m, ${e.h.toFixed(2)} m high, sides ${Math.round(e.solid * 100)}% built` : "No walls yet" };
    }
    case "roof": {
      const walls = enclosure(s, ps);
      const e = walls ?? slabBounds(ps);
      const c = e ? roofCover(s, e, walls ? walls.top - 0.3 : 0.2) : 0;
      return { label: "Roofed over", ok: c >= n.cover, detail: `${Math.round(c * 100)}% covered`, score: c };
    }
    case "count": {
      const c = ps.filter((p) => ofKind(p, n.of)).length;
      return { label: n.label, ok: c >= n.n, detail: `${c} of ${n.n}` };
    }
    case "slab": {
      const a = ps.filter((p) => p.k === "slab").reduce((acc, p) => acc + (p.s ?? KINDS.slab.size)[0] * (p.s ?? KINDS.slab.size)[2], 0);
      return { label: `A slab of ${n.area} m²`, ok: a >= n.area - 0.05, detail: `${a.toFixed(1)} m² poured` };
    }
    case "height": {
      const h = Math.max(0, ...ps.map((p) => box(p).y1));
      return { label: `${n.h} m high`, ok: h >= n.h, detail: `${h.toFixed(2)} m` };
    }
    case "paved": {
      const a = pavedArea(ps);
      return { label: `${n.area} m² paved`, ok: a >= n.area - 0.05, detail: `${a.toFixed(1)} m² laid` };
    }
    case "fence": {
      const l = fenceLength(ps);
      return { label: `${n.len} m of fence`, ok: l >= n.len - 0.1, detail: `${l.toFixed(1)} m built` };
    }
    case "deck": {
      const a = deckArea(ps);
      return { label: `A deck of ${n.area} m²`, ok: a >= n.area - 0.05, detail: `${a.toFixed(1)} m² boarded` };
    }
  }
}

const area = (p: Piece) => {
  const [L, , D] = p.s ?? KINDS[p.k].size;
  return L * D;
};
const pavedArea = (ps: Piece[]) => ps.filter((p) => p.k === "paver").reduce((a, p) => a + area(p), 0);
const deckArea = (ps: Piece[]) => ps.filter((p) => p.k === "board").reduce((a, p) => a + area(p), 0);
const fenceLength = (ps: Piece[]) => ps.filter((p) => p.k === "paling").length * 0.16;

/** What a building in a zone amounts to: for valuing it. */
export interface Assessment {
  /** A house: walls all round, roofed, with a door and some windows. */
  finished: boolean;
  /** Floor area under the roof, in m² (each storey counted). */
  floor: number;
  storeys: number;
  roofed: number;
  windows: number;
  doors: number;
  garage: boolean;
  /** Workmanship, 0..1: footings and bond. */
  quality: number;
  paved: number;
  fence: number;
  deck: number;
  solar: number;
  gutters: boolean;
  pieces: number;
}

/** Measure what's been built in a zone, the way a valuer would. */
export function assess(s: State, zone: [number, number, number, number]): Assessment {
  const j = { zone } as Job;
  const ps = zonePieces(s, j);
  const e = enclosure(s, ps);
  const walls = e && e.solid >= 0.85 && e.w >= 2.4 && e.d >= 2.4 ? e : null;
  const roofed = walls ? roofCover(s, walls, walls.top - 0.3) : 0;
  const windows = ps.filter((p) => p.k === "window").length;
  const doors = ps.filter((p) => p.k === "door").length;
  const garage = ps.some((p) => p.k === "door" && (p.s ?? KINDS.door.size)[0] > 2);
  const storeys = walls ? Math.max(1, Math.floor((walls.h + 0.3) / 2.6)) : 0;
  const floor = walls ? (walls.w - 0.2) * (walls.d - 0.2) * storeys : 0;
  const quality = ps.some((p) => KINDS[p.k].family === "masonry") ? (footingShare(s, ps) + bondShare(s, ps)) / 2 : 0.6;
  const finished = !!walls && walls.h >= 2.3 && roofed >= 0.85 && doors >= 1 && windows >= 1;
  return {
    finished,
    floor,
    storeys,
    roofed,
    windows,
    doors,
    garage,
    quality,
    paved: pavedArea(ps),
    fence: fenceLength(ps),
    deck: deckArea(ps),
    solar: ps.filter((p) => p.k === "solar").length,
    gutters: ps.some((p) => p.k === "gutter"),
    pieces: ps.length,
  };
}

function slabBounds(ps: Piece[]) {
  const sl = ps.filter((p) => p.k === "slab" || KINDS[p.k].family === "timber");
  if (!sl.length) return null;
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const p of sl) {
    const b = box(p);
    x0 = Math.min(x0, b.x0);
    z0 = Math.min(z0, b.z0);
    x1 = Math.max(x1, b.x1);
    z1 = Math.max(z1, b.z1);
  }
  return { x0, z0, x1, z1 };
}

/** Walk the job and measure it against the brief. */
export function inspect(s: State, j: Job): Report {
  const ps = zonePieces(s, j);
  const checks = j.needs.map((n) => needCheck(s, ps, n));
  const passed = checks.every((c) => c.ok);
  const days = dayOf(s.minutes);
  const spent = s.spent;
  checks.push({ label: "On budget", ok: spent <= j.budget, detail: `$${Math.round(spent).toLocaleString()} of $${j.budget.toLocaleString()}` });
  checks.push({ label: "On time", ok: days <= j.days, detail: `Day ${days} of ${j.days}` });
  let stars = 0;
  if (passed) {
    const quality = checks.filter((c) => c.score !== undefined).map((c) => c.score!);
    const q = quality.length ? quality.reduce((a, b) => a + b, 0) / quality.length : 1;
    stars = 2 + (q >= 0.98 ? 1 : q >= 0.92 ? 0.5 : 0) + (spent <= j.budget ? 1 : spent <= j.budget * 1.2 ? 0.5 : 0) + (days <= j.days ? 1 : days <= j.days * 1.5 ? 0.5 : 0);
    stars = Math.round(Math.min(5, stars) * 2) / 2;
  }
  const pay = passed ? Math.round(j.fee * (0.7 + stars * 0.06)) : 0;
  return { job: j, checks, passed, stars, pay, spent, days };
}

/** A quick look at progress on the brief (without the budget and time). */
export function progress(s: State, j: Job) {
  const ps = zonePieces(s, j);
  return j.needs.map((n) => needCheck(s, ps, n));
}
