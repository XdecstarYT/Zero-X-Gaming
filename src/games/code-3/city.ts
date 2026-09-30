import { createRng } from "../engine/rng";

/**
 * Bayview, the Code 3 city: an 8×8 grid of two-lane streets (7×7 blocks) with
 * a downtown of towers, a midtown ring, leafy suburbs, an industrial corner, a
 * park and the places callouts happen (stores, a bank, a gas station). Pure data:
 * the simulation, the renderer and the minimap all read it.
 *
 * Coordinates are metres on the ground plane: x east, z south. Traffic drives
 * on the right.
 */

/** Road lines per axis. */
export const LINES = 8;
/** Distance between road centrelines. */
export const PITCH = 72;
/** Half the carriageway (two 4 m lanes). */
export const HALF_ROAD = 4;
/** Carriageway plus sidewalks: the property line is this far from the centreline. */
export const HALF_STREET = 7;
/** Lane centre offset to the right of the centreline. */
export const LANE = 2;
export const SIZE = HALF_STREET * 2 + PITCH * (LINES - 1);
/** Town speed limit (m/s): 35 mph. */
export const SPEED_LIMIT = 15.6;

export const STREETS_NS = ["Harbor Ave", "1st St", "2nd St", "3rd St", "Main St", "5th St", "6th St", "Ridge Ave"];
export const STREETS_EW = ["Ocean Blvd", "Pine St", "Oak St", "Maple St", "Elm St", "Cedar St", "Birch St", "Summit Blvd"];

export type District = "downtown" | "midtown" | "suburbs" | "industrial" | "park" | "station";
export type BuildingKind = "tower" | "office" | "house" | "warehouse" | "store" | "station" | "hospital";

export interface Building {
  x: number;
  z: number;
  /** Half extents. */
  hw: number;
  hd: number;
  h: number;
  kind: BuildingKind;
  /** Facade variant (0..3). */
  style: number;
  color: string;
  /** Shop sign, e.g. "QUICK-MART". */
  sign?: string;
}

export interface Place {
  id: string;
  name: string;
  kind: "store" | "bank" | "gas" | "station" | "hospital" | "house" | "park";
  /** Where to stand / park (on the sidewalk in front). */
  x: number;
  z: number;
  /** Door-facing direction (unit), toward the street. */
  fx: number;
  fz: number;
}

export interface Block {
  i: number;
  j: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  district: District;
}

export interface City {
  size: number;
  /** Road centreline coordinates (same on both axes). */
  lines: number[];
  blocks: Block[];
  buildings: Building[];
  /** Buildings per block (index into `blocks`) for fast collision. */
  byBlock: number[][];
  places: Place[];
  trees: { x: number; z: number; s: number }[];
  station: Place;
}

export const line = (i: number) => HALF_STREET + i * PITCH;

export function nodeId(i: number, j: number) {
  return j * LINES + i;
}
export function nodePos(id: number) {
  return { x: line(id % LINES), z: line(Math.floor(id / LINES)) };
}
export function neighbours(id: number) {
  const i = id % LINES;
  const j = Math.floor(id / LINES);
  const out: number[] = [];
  if (i > 0) out.push(nodeId(i - 1, j));
  if (i < LINES - 1) out.push(nodeId(i + 1, j));
  if (j > 0) out.push(nodeId(i, j - 1));
  if (j < LINES - 1) out.push(nodeId(i, j + 1));
  return out;
}

/** Nearest intersection to a point. */
export function nearestNode(x: number, z: number) {
  const i = Math.max(0, Math.min(LINES - 1, Math.round((x - HALF_STREET) / PITCH)));
  const j = Math.max(0, Math.min(LINES - 1, Math.round((z - HALF_STREET) / PITCH)));
  return nodeId(i, j);
}

/** "Main St & Oak St" for the nearest corner. */
export function describe(x: number, z: number) {
  const id = nearestNode(x, z);
  return `${STREETS_NS[id % LINES]} & ${STREETS_EW[Math.floor(id / LINES)]}`;
}

/** Is the point on a carriageway (not sidewalk, not a block)? */
export function onRoad(x: number, z: number) {
  const dx = Math.abs(((x - HALF_STREET + PITCH / 2) % PITCH + PITCH) % PITCH - PITCH / 2);
  const dz = Math.abs(((z - HALF_STREET + PITCH / 2) % PITCH + PITCH) % PITCH - PITCH / 2);
  const inside = x > 0 && z > 0 && x < SIZE && z < SIZE;
  return inside && (dx <= HALF_ROAD || dz <= HALF_ROAD);
}

/** Block index containing the point, or -1 on a street. */
export function blockAt(city: City, x: number, z: number) {
  const i = Math.floor((x - HALF_STREET) / PITCH);
  const j = Math.floor((z - HALF_STREET) / PITCH);
  if (i < 0 || j < 0 || i >= LINES - 1 || j >= LINES - 1) return -1;
  return j * (LINES - 1) + i;
}

/**
 * Traffic lights: every intersection runs a 20 s cycle (8 s green, 2 s amber
 * per axis); neighbouring intersections are offset by half a cycle.
 * Returns the light facing traffic that travels along `axis`.
 */
export const LIGHT_CYCLE = 20;
export type Light = "green" | "amber" | "red";
export function lightFor(node: number, axis: "ns" | "ew", t: number): Light {
  const i = node % LINES;
  const j = Math.floor(node / LINES);
  const phase = (((t + ((i + j) % 2) * (LIGHT_CYCLE / 2)) % LIGHT_CYCLE) + LIGHT_CYCLE) % LIGHT_CYCLE;
  const nsGreen = phase < 10;
  const local = phase % 10;
  const mine = axis === "ns" ? nsGreen : !nsGreen;
  if (!mine) return "red";
  return local < 8 ? "green" : "amber";
}

const STORE_NAMES = ["QUICK-MART", "LIQUOR BARN", "24/7 FOOD", "CORNER DELI", "ACE PAWN"];
const PALETTE_TOWER = ["#8fa3b8", "#6f7f90", "#b3b8bf", "#546273"];
const PALETTE_MID = ["#b88a6a", "#a39a8a", "#c9b79c", "#8c6f5a", "#9aa7a0"];
const PALETTE_HOUSE = ["#e9e1cf", "#c7d4dc", "#e4c7a0", "#b9c9a7", "#d8b4a6", "#f0efe8"];

function districtOf(i: number, j: number): District {
  const n = LINES - 1;
  if (i === 1 && j === 3) return "station";
  if (i === 4 && j === 4) return "park";
  if (i >= n - 2 && j >= n - 2) return "industrial";
  const d = Math.max(Math.abs(i - (n - 1) / 2), Math.abs(j - (n - 1) / 2));
  if (d <= 1) return "downtown";
  if (d <= 2) return "midtown";
  return "suburbs";
}

export function generateCity(seed = 1987): City {
  const rng = createRng(seed);
  const lines = Array.from({ length: LINES }, (_, i) => line(i));
  const blocks: Block[] = [];
  const buildings: Building[] = [];
  const byBlock: number[][] = [];
  const places: Place[] = [];
  const trees: City["trees"] = [];
  let storeN = 0;

  const add = (b: number, bld: Building) => {
    byBlock[b].push(buildings.length);
    buildings.push(bld);
  };

  for (let j = 0; j < LINES - 1; j++)
    for (let i = 0; i < LINES - 1; i++) {
      const x0 = line(i) + HALF_STREET;
      const x1 = line(i + 1) - HALF_STREET;
      const z0 = line(j) + HALF_STREET;
      const z1 = line(j + 1) - HALF_STREET;
      const district = districtOf(i, j);
      const b = blocks.length;
      blocks.push({ i, j, x0, z0, x1, z1, district });
      byBlock.push([]);
      const w = x1 - x0;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;

      if (district === "downtown") {
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const hw = rng.range(10, 13);
          const hd = rng.range(10, 13);
          add(b, {
            x: cx + sx * (w / 4),
            z: cz + sz * (w / 4),
            hw,
            hd,
            h: rng.range(30, 95),
            kind: "tower",
            style: rng.int(0, 3),
            color: rng.pick(PALETTE_TOWER),
          });
        }
        if (i === 3 && j === 2) {
          // The bank: a squat marble building on the corner.
          places.push({ id: "bank", name: "First Bayview Bank", kind: "bank", x: x0 + 14, z: z0 - 2, fx: 0, fz: -1 });
          buildings[byBlock[b][0]].sign = "FIRST BAYVIEW BANK";
          buildings[byBlock[b][0]].h = 14;
          buildings[byBlock[b][0]].color = "#d9d4c7";
        }
      } else if (district === "midtown") {
        for (let a = 0; a < 3; a++)
          for (const sz of [-1, 1]) {
            const lw = w / 3;
            add(b, {
              x: x0 + lw * (a + 0.5),
              z: cz + sz * (w / 4),
              hw: lw / 2 - 1.2,
              hd: w / 4 - 1.5,
              h: rng.range(9, 26),
              kind: "office",
              style: rng.int(0, 3),
              color: rng.pick(PALETTE_MID),
            });
          }
        // Every other midtown block has a corner store.
        if ((i + j) % 2 === 0) {
          const first = buildings[byBlock[b][0]];
          first.kind = "store";
          first.h = 5;
          first.sign = STORE_NAMES[storeN % STORE_NAMES.length];
          first.color = "#e8e2d4";
          places.push({ id: `store-${storeN}`, name: capital(first.sign), kind: "store", x: first.x, z: z0 - 2, fx: 0, fz: -1 });
          storeN++;
        }
      } else if (district === "suburbs") {
        for (let a = 0; a < 3; a++)
          for (const sz of [-1, 1]) {
            const lw = w / 3;
            const x = x0 + lw * (a + 0.5);
            const z = cz + sz * (w / 4);
            add(b, { x, z: z - sz * 2, hw: 5.5, hd: 5, h: 5.5, kind: "house", style: rng.int(0, 3), color: rng.pick(PALETTE_HOUSE) });
            trees.push({ x: x + rng.range(-5, 5), z: z + sz * 8 + rng.range(-1, 1), s: rng.range(0.8, 1.3) });
            if (a === 1 && sz === -1)
              places.push({ id: `house-${b}`, name: `${Math.floor(100 + rng.next() * 900)} ${STREETS_EW[j]}`, kind: "house", x, z: z0 - 2, fx: 0, fz: -1 });
          }
      } else if (district === "industrial") {
        add(b, { x: cx - 8, z: cz, hw: 16, hd: 20, h: rng.range(9, 13), kind: "warehouse", style: rng.int(0, 3), color: "#8d8a80" });
        add(b, { x: cx + 18, z: cz - 12, hw: 7, hd: 9, h: 7, kind: "warehouse", style: 1, color: "#a07a55" });
        if (i === LINES - 3 && j === LINES - 2) {
          places.push({ id: "gas", name: "Gas-N-Go", kind: "gas", x: x0 + 8, z: z0 - 2, fx: 0, fz: -1 });
          add(b, { x: cx + 18, z: cz + 16, hw: 7, hd: 6, h: 4.5, kind: "store", style: 2, color: "#e8e2d4", sign: "GAS-N-GO" });
        }
      } else if (district === "park") {
        for (let k = 0; k < 26; k++) trees.push({ x: rng.range(x0 + 3, x1 - 3), z: rng.range(z0 + 3, z1 - 3), s: rng.range(0.9, 1.6) });
        places.push({ id: "park", name: "Bayview Park", kind: "park", x: cx, z: z0 - 2, fx: 0, fz: -1 });
      } else if (district === "station") {
        // The station at the back; the front half is the car park.
        add(b, { x: cx, z: cz + 12, hw: 18, hd: 11, h: 11, kind: "station", style: 0, color: "#c9c3b5", sign: "BAYVIEW POLICE" });
      }
    }

  // Hospital: a tall white block in midtown (replaces that block's offices).
  const hb = 2 * (LINES - 1) + 5;
  for (const k of byBlock[hb]) buildings[k].h = 0;
  const hosp = blocks[hb];
  byBlock[hb] = [];
  add(hb, {
    x: (hosp.x0 + hosp.x1) / 2,
    z: (hosp.z0 + hosp.z1) / 2,
    hw: 22,
    hd: 18,
    h: 24,
    kind: "hospital",
    style: 0,
    color: "#eef0f2",
    sign: "ST. MARY'S HOSPITAL",
  });
  places.push({ id: "hospital", name: "St. Mary's Hospital", kind: "hospital", x: hosp.x0 + 29, z: hosp.z0 - 2, fx: 0, fz: -1 });

  const st = blocks[3 * (LINES - 1) + 1];
  const station: Place = { id: "station", name: "Bayview PD", kind: "station", x: (st.x0 + st.x1) / 2, z: st.z0 + 16, fx: 0, fz: -1 };
  places.push(station);

  // Drop the offices the hospital replaced and rebuild the per-block index.
  const kept: Building[] = [];
  const index: number[][] = blocks.map(() => []);
  for (const bl of buildings) {
    if (bl.h <= 0) continue;
    const bi = Math.floor((bl.x - HALF_STREET) / PITCH);
    const bj = Math.floor((bl.z - HALF_STREET) / PITCH);
    index[bj * (LINES - 1) + bi].push(kept.length);
    kept.push(bl);
  }

  return { size: SIZE, lines, blocks, buildings: kept, byBlock: index, places, trees, station };
}

function capital(s: string) {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => w.replace(/(^|-)(\w)/g, (_, p, c) => p + c.toUpperCase()))
    .join(" ");
}

/** Buildings near a point (its block and the neighbours). */
export function buildingsNear(city: City, x: number, z: number) {
  const i = Math.floor((x - HALF_STREET) / PITCH);
  const j = Math.floor((z - HALF_STREET) / PITCH);
  const out: Building[] = [];
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      const bi = i + di;
      const bj = j + dj;
      if (bi < 0 || bj < 0 || bi >= LINES - 1 || bj >= LINES - 1) continue;
      for (const k of city.byBlock[bj * (LINES - 1) + bi]) out.push(city.buildings[k]);
    }
  return out;
}

/** Is the straight line between two points clear of buildings? (sampled every metre) */
export function lineOfSight(city: City, ax: number, az: number, bx: number, bz: number) {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.ceil(d);
  let near = buildingsNear(city, ax, az);
  let lastBlock = blockAt(city, ax, az);
  for (let k = 1; k < n; k++) {
    const x = ax + ((bx - ax) * k) / n;
    const z = az + ((bz - az) * k) / n;
    const b = blockAt(city, x, z);
    if (b !== lastBlock) {
      near = buildingsNear(city, x, z);
      lastBlock = b;
    }
    for (const bl of near) if (Math.abs(x - bl.x) < bl.hw && Math.abs(z - bl.z) < bl.hd && bl.h > 1.5) return false;
  }
  return true;
}

/** Shortest route between two intersections (BFS on the grid). */
export function route(from: number, to: number): number[] {
  if (from === to) return [from];
  const prev = new Map<number, number>([[from, from]]);
  const q = [from];
  while (q.length) {
    const n = q.shift()!;
    for (const m of neighbours(n)) {
      if (prev.has(m)) continue;
      prev.set(m, n);
      if (m === to) {
        const out = [to];
        let c = to;
        while (c !== from) out.push((c = prev.get(c)!));
        return out.reverse();
      }
      q.push(m);
    }
  }
  return [from];
}
