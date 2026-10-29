import { COURSE, JOINT, SITE, type Need } from "./data";
import * as m from "./model";

/**
 * Plans: ready-drawn buildings to put up with a tap. Pick one, size it, tap where it goes, and
 * it's built the way you'd build it by hand, a stage at a time (slab, door frames, walls to the
 * sills, windows, walls to the plate, roof…), every brick still a brick. Each stage is worked out
 * from the site as it stands, so the walls cut round the windows already in and the roof sits on
 * the walls that are actually there.
 */

export type PlanId = "wall" | "planter" | "patio" | "fence" | "deck" | "shed" | "carport" | "garage" | "cottage" | "bungalow" | "two-storey";

export interface PlanInfo {
  id: PlanId;
  name: string;
  icon: string;
  blurb: string;
  /** A line (length only) or a rectangle. */
  line?: boolean;
  /** Frontage (or length) and depth: min, max, default, in metres. */
  w: [number, number, number];
  d: [number, number, number];
  /** Has a brick finish to choose, and a roof. */
  brick?: boolean;
  roof?: boolean;
}

export const PLANS: PlanInfo[] = [
  { id: "bungalow", name: "Bungalow", icon: "🏠", blurb: "A brick house on a slab: two doors, four windows, a tiled gable roof and gutters.", w: [8.1, 13.5, 9], d: [6.3, 10.8, 6.75], brick: true, roof: true },
  { id: "two-storey", name: "Two-storey house", icon: "🏡", blurb: "Two floors of brick with a timber first floor, eight windows, a tiled roof.", w: [7.2, 12.6, 8.1], d: [6.3, 9.9, 6.75], brick: true, roof: true },
  { id: "cottage", name: "Cottage", icon: "🏘️", blurb: "A granny flat: a door, three windows, a tiled roof.", w: [5.4, 8.1, 6.3], d: [4.5, 6.3, 4.95], brick: true, roof: true },
  { id: "garage", name: "Garage", icon: "🚗", blurb: "A single brick garage with a sectional door and a gable roof.", w: [3.6, 6.3, 3.6], d: [5.4, 7.2, 5.85], brick: true, roof: true },
  { id: "shed", name: "Garden shed", icon: "🛖", blurb: "A timber-framed shed on a slab with a door and a sheet roof.", w: [2.25, 4.05, 2.7], d: [2.25, 4.05, 3.15], roof: true },
  { id: "carport", name: "Carport", icon: "🚙", blurb: "Posts on a slab under a sheet roof.", w: [3.15, 6.3, 3.6], d: [5.4, 6.75, 5.85], roof: true },
  { id: "deck", name: "Deck", icon: "▤", blurb: "Joists on two footings, boarded over.", w: [2.7, 6.3, 4.5], d: [2.25, 4.5, 3.6] },
  { id: "patio", name: "Patio", icon: "▦", blurb: "Clay pavers in herringbone.", w: [2, 8, 4], d: [2, 8, 4] },
  { id: "planter", name: "Raised planter", icon: "🌿", blurb: "Brick walls round a bed, on footings.", w: [1.35, 4.05, 2.7], d: [0.9, 2.25, 1.35], brick: true },
  { id: "wall", name: "Garden wall", icon: "🧱", blurb: "A brick wall on a strip footing.", line: true, w: [2.25, 12, 5.4], d: [0.45, 1.8, 0.9], brick: true },
  { id: "fence", name: "Paling fence", icon: "┇", blurb: "Posts, rails and palings.", line: true, w: [2.4, 20, 8], d: [1.2, 2.1, 1.8] },
];

export const planInfo = (id: PlanId) => PLANS.find((p) => p.id === id)!;

export interface Placed {
  id: PlanId;
  /** Frontage (or length) and depth (or height, for a line). */
  w: number;
  d: number;
  /** Centre on the site. */
  cx: number;
  cz: number;
  /** Which way the front faces: 0 +z (the street), 1 +x, 2 −z, 3 −x. */
  front: number;
  brick: number;
  roof: number;
  solar: boolean;
}

export interface Stage {
  name: string;
  icon: string;
  make: (s: m.State) => m.Spec[];
}

const W = 0.05625; // Half a brick's depth with its joint: the centre of a half-brick wall in from its face.
const snap225 = (v: number) => Math.max(0.45, Math.round(v / 0.225) * 0.225);

/** The plan's rectangle (outside corners), its dimensions along x and z. */
export function rectOf(p: Placed) {
  const info = planInfo(p.id);
  const along = p.front % 2 === 0;
  if (info.line) {
    const L = snap225(p.w);
    const x0 = m.snapG(p.cx - (along ? L / 2 : 0));
    const z0 = m.snapG(p.cz - (along ? 0 : L / 2));
    return { x0, z0, x1: along ? x0 + L : x0, z1: along ? z0 : z0 + L, W: along ? L : 0, D: along ? 0 : L };
  }
  const fw = snap225(p.w);
  const fd = snap225(p.d);
  const Wx = along ? fw : fd;
  const Dz = along ? fd : fw;
  const x0 = m.snapG(p.cx - Wx / 2);
  const z0 = m.snapG(p.cz - Dz / 2);
  return { x0, z0, x1: x0 + Wx, z1: z0 + Dz, W: Wx, D: Dz };
}

/** Sides by where they face, relative to the front: 0 front, 1 right, 2 back, 3 left. */
function sideOf(front: number, rel: number) {
  return (front + rel) % 4;
}

type Rect = ReturnType<typeof rectOf>;

/** A door or window set into the wall on a side (0 +z, 1 +x, 2 −z, 3 −x) a fraction t along it. */
function opening(r: Rect, side: number, t: number, k: "door" | "window", s: [number, number, number], y: number, v: number, inset = W): m.Spec {
  const alongX = side % 2 === 0;
  const lo = alongX ? r.x0 : r.z0;
  const len = alongX ? r.W : r.D;
  const half = s[0] / 2;
  const c = m.snapCentre(Math.max(lo + 0.45 + half, Math.min(lo + len - 0.45 - half, lo + t * len)), s[0] + JOINT);
  // Faces out: −z is r 0, −x is r 1, +z is r 2, +x is r 3.
  if (side === 0) return { k, x: c, y, z: r.z1 - inset, r: 2, v, s };
  if (side === 2) return { k, x: c, y, z: r.z0 + inset, r: 0, v, s };
  if (side === 1) return { k, x: r.x1 - inset, y, z: c, r: 3, v, s };
  return { k, x: r.x0 + inset, y, z: c, r: 1, v, s };
}

const DOOR: [number, number, number] = [0.89, 2.09, 0.1025];
const GARAGE_DOOR: [number, number, number] = [2.465, 2.09, 0.1025];
const WIN: [number, number, number] = [1.115, 1.19, 0.1025];
const WIDE: [number, number, number] = [1.79, 1.19, 0.1025];
const SMALL: [number, number, number] = [0.665, 1.19, 0.1025];

type Open = { rel: number; t: number; k: "door" | "window"; s: [number, number, number]; v?: number };

/** A brick building: slab, door frames, walls in two lifts round the windows, and a roof. */
function house(p: Placed, doors: Open[], windows: Open[], opts: { storeys: 1 | 2; upper?: Open[]; pitch: number; path?: boolean; style?: "gable" | "flat" }): Stage[] {
  const r = rectOf(p);
  const a = { x: r.x0, z: r.z0 };
  const b = { x: r.x1, z: r.z1 };
  const y0 = 0.15 + JOINT;
  const wall = { kind: "brick" as const, bond: "stretcher" as const, v: p.brick, lintels: true };
  const place = (list: Open[], y: number) => list.map((o) => opening(r, sideOf(p.front, o.rel), o.t, o.k, o.s, y, o.v ?? 0));
  const stages: Stage[] = [
    { name: "Pour the slab", icon: "▭", make: () => m.slabRect({ x: a.x - 0.225, z: a.z - 0.225 }, { x: b.x + 0.225, z: b.z + 0.225 }) },
    { name: "Stand the door frames", icon: "🚪", make: () => place(doors, y0) },
    { name: "Walls up to the sills", icon: "🧱", make: (s) => m.wallRect(s, a, b, y0, { ...wall, courses: 12 }) },
    { name: "Set the windows", icon: "🪟", make: () => place(windows, y0 + 12 * COURSE) },
  ];
  let top = y0 + 34 * COURSE - JOINT;
  if (opts.storeys === 1) stages.push({ name: "Walls up to the roof", icon: "🧱", make: (s) => m.wallRect(s, a, b, y0, { ...wall, courses: 34, from: 12 }) });
  else {
    const floorY = y0 + 36 * COURSE - JOINT;
    const y1 = floorY + 0.19 + 0.022 + JOINT;
    top = y1 + 34 * COURSE - JOINT;
    stages.push({ name: "Walls up to the first floor", icon: "🧱", make: (s) => m.wallRect(s, a, b, y0, { ...wall, courses: 36, from: 12 }) });
    stages.push({
      name: "Lay the first floor",
      icon: "▤",
      make: () => {
        const out = m.floorRect(a, b, floorY, 0);
        // A painted band round the edge of the floor, where the joists show.
        for (const z of [r.z0 - 0.011, r.z1 + 0.011]) out.push({ k: "fascia", x: (r.x0 + r.x1) / 2, y: floorY, z, r: 0, v: 3, s: [r.W + 0.044, 0.212, 0.022] });
        for (const x of [r.x0 - 0.011, r.x1 + 0.011]) out.push({ k: "fascia", x, y: floorY, z: (r.z0 + r.z1) / 2, r: 1, v: 3, s: [r.D, 0.212, 0.022] });
        return out;
      },
    });
    stages.push({ name: "Upstairs walls to the sills", icon: "🧱", make: (s) => m.wallRect(s, a, b, y1, { ...wall, courses: 12 }) });
    stages.push({ name: "Upstairs windows", icon: "🪟", make: () => place(opts.upper ?? [], y1 + 12 * COURSE) });
    stages.push({ name: "Upstairs walls to the roof", icon: "🧱", make: (s) => m.wallRect(s, a, b, y1, { ...wall, courses: 34, from: 12 }) });
  }
  stages.push({
    name: "Put the roof on",
    icon: "🏠",
    make: (s) => m.roofGen(s, a, b, top, { style: opts.style ?? "gable", pitch: opts.pitch, cover: "tile", v: p.roof, gables: true, gutters: true, solar: p.solar ? 8 : 0 }),
  });
  if (opts.path) {
    stages.push({
      name: "Pave the front path",
      icon: "▦",
      make: () => {
        const d = place(doors.slice(0, 1), y0)[0];
        const f = sideOf(p.front, 0);
        const out = f % 2 === 0 ? { x0: d.x - 0.6, x1: d.x + 0.6, z0: f === 0 ? r.z1 + 0.35 : r.z0 - 2.6, z1: f === 0 ? r.z1 + 2.6 : r.z0 - 0.35 } : { z0: d.z - 0.6, z1: d.z + 0.6, x0: f === 1 ? r.x1 + 0.35 : r.x0 - 2.6, x1: f === 1 ? r.x1 + 2.6 : r.x0 - 0.35 };
        return m.paveRect({ x: out.x0, z: out.z0 }, { x: out.x1, z: out.z1 }, 0, "herring", 0);
      },
    });
  }
  return stages;
}

/** The stages of a plan, in the order you'd build it. */
export function stages(p: Placed): Stage[] {
  const r = rectOf(p);
  const a = { x: r.x0, z: r.z0 };
  const b = { x: r.x1, z: r.z1 };
  switch (p.id) {
    case "bungalow":
      return house(
        p,
        [
          { rel: 0, t: 0.32, k: "door", s: DOOR, v: 0 },
          { rel: 2, t: 0.72, k: "door", s: DOOR, v: 4 },
        ],
        [
          { rel: 0, t: 0.74, k: "window", s: WIDE },
          { rel: 2, t: 0.28, k: "window", s: WIN },
          { rel: 1, t: 0.5, k: "window", s: WIN },
          { rel: 3, t: 0.5, k: "window", s: SMALL },
        ],
        { storeys: 1, pitch: 30, path: true },
      );
    case "two-storey":
      return house(
        p,
        [{ rel: 0, t: 0.3, k: "door", s: DOOR, v: 1 }],
        [
          { rel: 0, t: 0.72, k: "window", s: WIN },
          { rel: 2, t: 0.3, k: "window", s: WIN },
          { rel: 2, t: 0.72, k: "window", s: WIN },
          { rel: 1, t: 0.5, k: "window", s: SMALL },
        ],
        {
          storeys: 2,
          pitch: 32,
          path: true,
          upper: [
            { rel: 0, t: 0.28, k: "window", s: WIN },
            { rel: 0, t: 0.72, k: "window", s: WIN },
            { rel: 2, t: 0.5, k: "window", s: WIDE },
            { rel: 3, t: 0.5, k: "window", s: SMALL },
          ],
        },
      );
    case "cottage":
      return house(
        p,
        [{ rel: 0, t: 0.3, k: "door", s: DOOR, v: 2 }],
        [
          { rel: 0, t: 0.74, k: "window", s: WIN },
          { rel: 2, t: 0.5, k: "window", s: WIN },
          { rel: 1, t: 0.5, k: "window", s: SMALL },
        ],
        { storeys: 1, pitch: 28, path: true },
      );
    case "garage":
      return house(p, [{ rel: 0, t: 0.5, k: "door", s: GARAGE_DOOR, v: 5 }], [{ rel: 1, t: 0.5, k: "window", s: SMALL }], { storeys: 1, pitch: 22 });
    case "shed": {
      const y0 = 0.15;
      const door = opening(r, sideOf(p.front, 0), 0.5, "door", DOOR, y0, 3, 0.045);
      const f = sideOf(p.front, 0);
      return [
        { name: "Pour the slab", icon: "▭", make: () => m.slabRect({ x: a.x - 0.15, z: a.z - 0.15 }, { x: b.x + 0.15, z: b.z + 0.15 }) },
        { name: "Hang the door", icon: "🚪", make: () => [door] },
        {
          name: "Frame the walls",
          icon: "🪵",
          make: () => {
            const out: m.Spec[] = [];
            const dlo = (f % 2 === 0 ? door.x : door.z) - 0.445 - 0.07;
            const dhi = (f % 2 === 0 ? door.x : door.z) + 0.445 + 0.07;
            // Front and back run the full width; the sides fit between them.
            for (const side of [0, 2]) {
              const z = side === 0 ? r.z1 - 0.045 : r.z0 + 0.045;
              if (f === side) {
                out.push(...m.frameRun({ x: r.x0, z }, { x: dlo, z }, y0, 2.4, 0));
                out.push(...m.frameRun({ x: dhi, z }, { x: r.x1, z }, y0, 2.4, 0));
              } else out.push(...m.frameRun({ x: r.x0, z }, { x: r.x1, z }, y0, 2.4, 0));
            }
            for (const side of [1, 3]) {
              const x = side === 1 ? r.x1 - 0.045 : r.x0 + 0.045;
              if (f === side) {
                out.push(...m.frameRun({ x, z: r.z0 + 0.1125 }, { x, z: dlo }, y0, 2.4, 0));
                out.push(...m.frameRun({ x, z: dhi }, { x, z: r.z1 - 0.1125 }, y0, 2.4, 0));
              } else out.push(...m.frameRun({ x, z: r.z0 + 0.1125 }, { x, z: r.z1 - 0.1125 }, y0, 2.4, 0));
            }
            return out;
          },
        },
        { name: "Put the roof on", icon: "🏠", make: (s) => m.roofGen(s, a, b, y0 + 2.4, { style: "skillion", pitch: 10, cover: "sheet", v: p.roof, gables: false, gutters: true, solar: p.solar ? 2 : 0 }) },
      ];
    }
    case "carport": {
      const y0 = 0.15;
      const ridgeX = r.W >= r.D;
      const A = ridgeX ? r.W : r.D;
      const n = A > 4.5 ? 3 : 2;
      const posts: m.Spec[] = [];
      for (const w of [0, 1])
        for (let i = 0; i < n; i++) {
          const u = 0.25 + ((A - 0.5) * i) / (n - 1);
          const cross = w ? (ridgeX ? r.z1 : r.x1) - 0.1 : (ridgeX ? r.z0 : r.x0) + 0.1;
          posts.push(ridgeX ? { k: "post", x: r.x0 + u, y: y0, z: cross, r: 0, v: 0, s: [0.09, 2.4, 0.09] } : { k: "post", x: cross, y: y0, z: r.z0 + u, r: 0, v: 0, s: [0.09, 2.4, 0.09] });
        }
      const ra = { x: r.x0 + (ridgeX ? 0 : 0.055), z: r.z0 + (ridgeX ? 0.055 : 0) };
      const rb = { x: r.x1 - (ridgeX ? 0 : 0.055), z: r.z1 - (ridgeX ? 0.055 : 0) };
      return [
        { name: "Pour the slab", icon: "▭", make: () => m.slabRect(a, b) },
        { name: "Stand the posts", icon: "▮", make: () => posts },
        { name: "Put the roof on", icon: "🏠", make: (s) => m.roofGen(s, ra, rb, y0 + 2.4, { style: "skillion", pitch: 8, cover: "sheet", v: p.roof, gables: false, gutters: true, solar: p.solar ? 4 : 0 }) },
      ];
    }
    case "deck": {
      const joistsAlongZ = r.D <= r.W;
      const foot = joistsAlongZ
        ? [m.footingRun({ x: r.x0 - 0.1125, z: r.z0 + 0.225 }, { x: r.x1 + 0.1125, z: r.z0 + 0.225 }), m.footingRun({ x: r.x0 - 0.1125, z: r.z1 - 0.225 }, { x: r.x1 + 0.1125, z: r.z1 - 0.225 })]
        : [m.footingRun({ x: r.x0 + 0.225, z: r.z0 - 0.1125 }, { x: r.x0 + 0.225, z: r.z1 + 0.1125 }), m.footingRun({ x: r.x1 - 0.225, z: r.z0 - 0.1125 }, { x: r.x1 - 0.225, z: r.z1 + 0.1125 })];
      return [
        { name: "Pour the footings", icon: "▬", make: () => foot.flat() },
        { name: "Joists and boards", icon: "▤", make: () => m.floorRect(a, b, 0.225, 0) },
      ];
    }
    case "patio":
      return [{ name: "Lay the pavers", icon: "▦", make: () => m.paveRect(a, b, 0, "herring", p.brick % 5) }];
    case "planter":
      return [
        { name: "Pour the footings", icon: "▬", make: () => m.footingRect(a, b) },
        { name: "Lay the walls", icon: "🧱", make: (s) => m.wallRect(s, a, b, 0.225 + JOINT, { kind: "brick", bond: "stretcher", courses: 8, v: p.brick }) },
      ];
    case "wall": {
      const courses = Math.max(3, Math.ceil(p.d / COURSE));
      const along = p.front % 2 === 0;
      const end = along ? { x: r.x1, z: r.z0 } : { x: r.x0, z: r.z1 };
      const lo = along ? { x: r.x0 - 0.1125, z: r.z0 } : { x: r.x0, z: r.z0 - 0.1125 };
      const hi = along ? { x: r.x1 + 0.225, z: r.z0 } : { x: r.x0, z: r.z1 + 0.225 };
      return [
        { name: "Pour the footing", icon: "▬", make: () => m.footingRun(lo, hi) },
        { name: "Lay the wall", icon: "🧱", make: (s) => m.wallRun(s, a, end, 0.225 + JOINT, { kind: "brick", bond: "stretcher", courses, v: p.brick }) },
      ];
    }
    case "fence": {
      const along = p.front % 2 === 0;
      const end = along ? { x: r.x1, z: r.z0 } : { x: r.x0, z: r.z1 };
      return [{ name: "Build the fence", icon: "┇", make: () => m.fenceRun(a, end, Math.round(p.d / 0.3) * 0.3, 0) }];
    }
  }
}

/** Boxes to preview where a plan goes: the slab and the walls at full height (or the line). */
export function footprint(p: Placed): m.Spec[] {
  const r = rectOf(p);
  const info = planInfo(p.id);
  if (info.line) {
    const along = p.front % 2 === 0;
    const L = along ? r.W : r.D;
    const h = p.id === "fence" ? p.d : Math.max(0.3, p.d);
    return [{ k: "slab", x: along ? r.x0 + L / 2 : r.x0, y: 0, z: along ? r.z0 : r.z0 + L / 2, r: along ? 0 : 1, v: 0, s: [L, h, 0.12] }];
  }
  const h = p.id === "two-storey" ? 5.6 : p.id === "patio" ? 0.05 : p.id === "deck" ? 0.44 : p.id === "planter" ? 0.7 : 2.7;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const out: m.Spec[] = [{ k: "slab", x: cx, y: 0, z: cz, r: 0, v: 0, s: [r.W, 0.04, r.D] }];
  if (h > 0.5) {
    out.push({ k: "slab", x: cx, y: 0, z: r.z0 + W, r: 0, v: 0, s: [r.W, h, 0.11] });
    out.push({ k: "slab", x: cx, y: 0, z: r.z1 - W, r: 0, v: 0, s: [r.W, h, 0.11] });
    out.push({ k: "slab", x: r.x0 + W, y: 0, z: cz, r: 1, v: 0, s: [r.D - 0.22, h, 0.11] });
    out.push({ k: "slab", x: r.x1 - W, y: 0, z: cz, r: 1, v: 0, s: [r.D - 0.22, h, 0.11] });
    // An arrow of sorts: a marker on the front.
    const f = p.front;
    const mx = f === 1 ? r.x1 + 0.5 : f === 3 ? r.x0 - 0.5 : cx;
    const mz = f === 0 ? r.z1 + 0.5 : f === 2 ? r.z0 - 0.5 : cz;
    out.push({ k: "slab", x: mx, y: 0, z: mz, r: 0, v: 0, s: [0.5, 0.06, 0.5] });
  }
  return out;
}

/** Can it go there? Null if so, or why not. */
export function siteCheck(s: m.State, p: Placed): string | null {
  const r = rectOf(p);
  const pad = 0.5;
  if (r.x0 - pad < -SITE || r.x1 + pad > SITE || r.z0 - pad < -SITE || r.z1 + pad > SITE) return "It won't fit on the site there";
  const inWay = m.within(s, { x0: r.x0 - 0.2, x1: r.x1 + 0.2, z0: r.z0 - 0.2, z1: r.z1 + 0.2, y0: 0.001, y1: 8 });
  if (inWay.length) return "Something's already built there";
  return null;
}

/** What the whole plan will take: tried out on a copy of the site. */
export function estimate(s: m.State, p: Placed) {
  const t = m.load(m.save(s))!;
  t.mode = "free";
  t.speed = s.speed;
  let cost = 0;
  let minutes = 0;
  let pieces = 0;
  let skipped = 0;
  for (const st of stages(p)) {
    const r = m.commit(t, st.make(t), true);
    for (const q of r.added) cost += m.costOf(q);
    minutes += r.added.reduce((acc, q) => acc + m.minutesOf(q), 0) / (s.speed ?? 1);
    pieces += r.added.length;
    skipped += r.skipped;
  }
  return { cost: Math.round(cost), minutes, pieces, skipped };
}

/** A plan sized to a brief and centred in its zone. */
export function planForBrief(needs: Need[], zone: [number, number, number, number]): Placed | null {
  const cx = (zone[0] + zone[2]) / 2;
  const cz = (zone[1] + zone[3]) / 2;
  const base = { cx, cz, front: 0, brick: 0, roof: 0, solar: false };
  const up = (v: number) => Math.ceil(v / 0.225) * 0.225 + 0.225;
  const find = <K extends Need["k"]>(k: K) => needs.find((n) => n.k === k) as Extract<Need, { k: K }> | undefined;
  const count = (of: string) => (needs.find((n) => n.k === "count" && n.of === of) as Extract<Need, { k: "count" }> | undefined)?.n ?? 0;
  const fence = find("fence");
  if (fence) return { ...base, id: "fence", w: fence.len + 0.6, d: 1.8 };
  const paved = find("paved");
  if (paved) {
    const side = Math.ceil(Math.sqrt(paved.area) * 10) / 10 + 0.2;
    return { ...base, id: "patio", w: side, d: side };
  }
  const deck = find("deck");
  if (deck) {
    const side = Math.sqrt(deck.area);
    return { ...base, id: "deck", w: up(side * 1.15), d: up(side * 0.9) };
  }
  const wall = find("wall");
  if (wall) return { ...base, id: "wall", w: wall.len + 0.225, d: wall.h };
  const enc = find("enclosed");
  if (count("stud")) {
    const sl = find("slab");
    const side = Math.sqrt(sl?.area ?? 6) + 0.1;
    return { ...base, id: "shed", w: up(side), d: up(side) };
  }
  if (count("post")) {
    const sl = find("slab");
    const area = sl?.area ?? 16;
    return { ...base, id: "carport", w: 3.6, d: up(area / 3.6) };
  }
  if (!enc) return null;
  const w = Math.max(enc.w, enc.d);
  const d = Math.min(enc.w, enc.d);
  if (enc.h < 1.5) return { ...base, id: "planter", w: up(w), d: up(d) };
  if (enc.h > 4) return { ...base, id: "two-storey", w: up(w), d: up(d) };
  if (count("window") >= 3 || count("door") >= 2) return { ...base, id: "bungalow", w: up(w), d: up(d) };
  if (count("window") >= 1) return { ...base, id: "cottage", w: up(w), d: up(d) };
  return { ...base, id: "garage", w: up(d), d: up(w) };
}

/** Default placement for a plan picked from the list. */
export function placeNew(id: PlanId, cx: number, cz: number, prev?: Placed | null): Placed {
  const info = planInfo(id);
  return { id, w: info.w[2], d: info.d[2], cx, cz, front: prev?.front ?? 0, brick: prev?.brick ?? 0, roof: prev?.roof ?? 0, solar: prev?.solar ?? false };
}

