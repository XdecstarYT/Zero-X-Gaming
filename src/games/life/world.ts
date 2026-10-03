import { CATALOG, type BuildCategory } from "./catalog";
import { createRng, type Rng } from "../engine/rng";

/**
 * Life's 3D world, as data and rules: Harbour City's streets, the shops and
 * workplaces on Main Street, the residential plots you can rent, buy and
 * build on, house builds (walls, floors, openings, furniture), the needs that
 * run down through the day, and the job shifts. The renderer draws this; the
 * game module drives it. No three.js in here, so it's all unit-tested.
 *
 * World coordinates: metres, +x east, +z south, y up. Main Street runs east–
 * west along z = 0; houses are south of it.
 */

// ------------------------------------------------------------------- town

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export type PlaceId = "freshmart" | "cafe" | "pizza" | "hospital" | "school" | "office" | "police" | "fire" | "garage" | "studio" | "cityhall" | "gym" | "beach" | "airport" | "realty" | "carlot" | "furniture";

export interface Place extends Rect {
  id: PlaceId;
  name: string;
  /** Floors (for the facade). */
  floors: number;
  color: string;
  /** The door, on the street side. */
  door: { x: number; z: number };
  sign: string;
}

export interface Road extends Rect {
  name: string;
}

export const MAIN_Z = 0;
export const ROAD_W = 10;
export const WALK_W = 3;

/** Shops and workplaces along the north side of Main Street (doors face south onto it). */
export const PLACES: Place[] = (() => {
  const list: [PlaceId, string, number, number, number, string, string][] = [
    ["realty", "Harbour Realty", 16, 18, 2, "#e7e5e4", "HARBOUR REALTY"],
    ["freshmart", "Fresh Mart", 30, 24, 1, "#f5f5f4", "FRESH MART"],
    ["cafe", "Bean There Café", 14, 16, 2, "#78350f", "BEAN THERE"],
    ["pizza", "Slice of Heaven", 14, 16, 2, "#b91c1c", "SLICE OF HEAVEN"],
    ["gym", "Harbour Fitness", 20, 20, 2, "#1f2937", "HARBOUR FITNESS"],
    ["furniture", "Nest Furniture", 22, 20, 2, "#a8a29e", "NEST FURNITURE"],
    ["carlot", "Bayside Motors", 26, 22, 1, "#e5e7eb", "BAYSIDE MOTORS"],
    ["office", "Meridian Tower", 26, 26, 12, "#64748b", "MERIDIAN"],
    ["cityhall", "City Hall", 26, 22, 3, "#d6d3d1", "CITY HALL"],
    ["hospital", "Harbour General", 32, 28, 6, "#f8fafc", "HARBOUR GENERAL"],
    ["police", "Police Station", 20, 20, 2, "#1e3a8a", "POLICE"],
    ["fire", "Fire Station", 20, 20, 2, "#991b1b", "FIRE STATION"],
    ["school", "Bayview High", 36, 26, 3, "#c2410c", "BAYVIEW HIGH"],
    ["studio", "Lumen Studios", 24, 22, 3, "#312e81", "LUMEN STUDIOS"],
    ["garage", "Wrench & Sons", 18, 16, 1, "#525252", "WRENCH & SONS"],
  ];
  const out: Place[] = [];
  let x = -190;
  const front = -(ROAD_W / 2 + WALK_W);
  for (const [id, name, w, d, floors, color, sign] of list) {
    out.push({ id, name, x, z: front - d, w, d, floors, color, sign, door: { x: x + w / 2, z: front } });
    x += w + 4;
  }
  return out;
})();
export const placeById = (id: string) => PLACES.find((p) => p.id === id);

/** Residential plots south of Main Street, on two streets, facing north. */
export const PLOT_W = 24;
export const PLOT_D = 30;
export const STREETS_Z = [52, 132];
export const AVENUES_X = [-200, -100, 0, 100, 200];

export interface Plot extends Rect {
  id: number;
  street: string;
  number: number;
  /** Price to buy (rent is about 4.5% a year). */
  price: number;
  /** Which way the front faces (the street is on that side). */
  front: "north" | "south";
}

export const PLOTS: Plot[] = (() => {
  const out: Plot[] = [];
  let id = 0;
  const names = ["Oak Street", "Elm Street"];
  STREETS_Z.forEach((sz, row) => {
    for (const side of [-1, 1] as const) {
      // Plots on both sides of each street, between avenues.
      for (let k = 0; k < 4; k++) {
        const ax = AVENUES_X[k] + ROAD_W / 2 + 4;
        for (let j = 0; j < 3; j++) {
          const x = ax + j * (PLOT_W + 3) + 3;
          const z = side < 0 ? sz - ROAD_W / 2 - WALK_W - PLOT_D : sz + ROAD_W / 2 + WALK_W;
          const premium = row === 0 ? 1.15 : 1;
          out.push({ id, x, z, w: PLOT_W, d: PLOT_D, street: names[row], number: id + 1, price: Math.round((240000 + ((id * 37) % 9) * 22000) * premium), front: side < 0 ? "south" : "north" });
          id++;
        }
      }
    }
  });
  return out;
})();

/** Your family's house (where you live until you move out). */
export const FAMILY_PLOT = 4;

export const ROADS: Road[] = [
  { name: "Main Street", x: -240, z: MAIN_Z - ROAD_W / 2, w: 480, d: ROAD_W },
  ...STREETS_Z.map((z, i) => ({ name: ["Oak Street", "Elm Street"][i], x: -240, z: z - ROAD_W / 2, w: 480, d: ROAD_W })),
  ...AVENUES_X.map((x, i) => ({ name: ["Harbour Ave", "1st Ave", "Central Ave", "3rd Ave", "Bay Ave"][i], x: x - ROAD_W / 2, z: MAIN_Z - ROAD_W / 2, w: ROAD_W, d: 175 - (MAIN_Z - ROAD_W / 2) })),
];

/** Where you appear when you step out into town. */
export function spawnFor(plotId: number) {
  const p = PLOTS[plotId] ?? PLOTS[FAMILY_PLOT];
  const zFront = p.front === "north" ? p.z - 1.5 : p.z + p.d + 1.5;
  return { x: p.x + p.w / 2, z: zFront, heading: p.front === "north" ? Math.PI : 0 };
}

// ----------------------------------------------------------------- builds

export type FloorMat = "wood" | "tile" | "carpet" | "concrete" | "marble";
export type Need = "hunger" | "energy" | "hygiene" | "fun";

export interface FurnitureDef {
  name: string;
  price: number;
  /** Footprint in metres (w along x, d along z, before rotation). */
  w: number;
  d: number;
  h: number;
  room: "Kitchen" | "Bedroom" | "Bathroom" | "Living" | "Office" | "Outdoor" | "Decor";
  need?: Need;
  /** Need restored per game minute while using it. */
  rate?: number;
  action?: string;
  color: string;
  /** Lies flat on the ground: other things can stand on it (rugs, decks). */
  flat?: boolean;
  /** Fine on bare ground as well as a floor (plants, trees, outdoor things). */
  anywhere?: boolean;
  /** Which of the builder's three tabs it's in (worked out from the room if unset). */
  cat?: BuildCategory;
}

const BASE_FURNITURE = {
  fridge: { name: "Fridge", price: 900, w: 0.9, d: 0.75, h: 1.85, room: "Kitchen", need: "hunger", rate: 2.2, action: "Grab a snack", color: "#e5e7eb" },
  stove: { name: "Stove", price: 750, w: 0.75, d: 0.65, h: 0.92, room: "Kitchen", need: "hunger", rate: 1.4, action: "Cook a meal", color: "#d4d4d8" },
  counter: { name: "Counter", price: 300, w: 1.2, d: 0.65, h: 0.92, room: "Kitchen", color: "#f5f5f4" },
  sinkK: { name: "Kitchen Sink", price: 350, w: 1, d: 0.65, h: 0.92, room: "Kitchen", color: "#f5f5f4" },
  table: { name: "Dining Table", price: 450, w: 1.6, d: 0.9, h: 0.76, room: "Kitchen", color: "#92400e" },
  chair: { name: "Chair", price: 90, w: 0.5, d: 0.5, h: 0.9, room: "Kitchen", color: "#78350f" },
  bed: { name: "Double Bed", price: 1100, w: 1.6, d: 2.1, h: 0.6, room: "Bedroom", need: "energy", rate: 0.5, action: "Sleep", color: "#e2e8f0" },
  single: { name: "Single Bed", price: 500, w: 1, d: 2, h: 0.55, room: "Bedroom", need: "energy", rate: 0.42, action: "Sleep", color: "#bfdbfe" },
  wardrobe: { name: "Wardrobe", price: 600, w: 1.2, d: 0.6, h: 2.1, room: "Bedroom", color: "#a16207" },
  nightstand: { name: "Bedside Table", price: 120, w: 0.5, d: 0.45, h: 0.55, room: "Bedroom", color: "#a16207" },
  shower: { name: "Shower", price: 800, w: 0.9, d: 0.9, h: 2.1, room: "Bathroom", need: "hygiene", rate: 3.5, action: "Shower", color: "#e0f2fe" },
  bath: { name: "Bathtub", price: 1200, w: 1.7, d: 0.8, h: 0.6, room: "Bathroom", need: "hygiene", rate: 2.6, action: "Take a bath", color: "#f8fafc" },
  toilet: { name: "Toilet", price: 300, w: 0.45, d: 0.7, h: 0.8, room: "Bathroom", color: "#f8fafc" },
  basin: { name: "Basin", price: 250, w: 0.6, d: 0.45, h: 0.9, room: "Bathroom", color: "#f8fafc" },
  sofa: { name: "Sofa", price: 1400, w: 2.2, d: 0.95, h: 0.85, room: "Living", need: "fun", rate: 0.6, action: "Relax", color: "#475569" },
  tv: { name: "TV", price: 1100, w: 1.6, d: 0.45, h: 1.3, room: "Living", need: "fun", rate: 1.6, action: "Watch TV", color: "#111827" },
  armchair: { name: "Armchair", price: 600, w: 0.9, d: 0.9, h: 0.9, room: "Living", need: "fun", rate: 0.4, action: "Read", color: "#7c2d12" },
  rug: { name: "Rug", price: 200, w: 2.4, d: 1.7, h: 0.02, room: "Decor", color: "#9a3412" },
  bookshelf: { name: "Bookshelf", price: 400, w: 1, d: 0.35, h: 1.9, room: "Living", need: "fun", rate: 0.5, action: "Read a book", color: "#78350f" },
  desk: { name: "Desk & Computer", price: 1600, w: 1.4, d: 0.7, h: 1.2, room: "Office", need: "fun", rate: 1.2, action: "Play games", color: "#334155" },
  lamp: { name: "Floor Lamp", price: 150, w: 0.4, d: 0.4, h: 1.6, room: "Decor", color: "#fef3c7" },
  plant: { name: "Plant", price: 80, w: 0.5, d: 0.5, h: 1.1, room: "Decor", color: "#166534" },
  piano: { name: "Piano", price: 4500, w: 1.5, d: 0.6, h: 1.2, room: "Living", need: "fun", rate: 1, action: "Play piano", color: "#0c0a09" },
  bbq: { name: "Barbecue", price: 700, w: 1.2, d: 0.6, h: 1, room: "Outdoor", need: "hunger", rate: 1.6, action: "Grill", color: "#18181b" },
  pool: { name: "Pool", price: 18000, w: 4, d: 7, h: 0.05, room: "Outdoor", need: "fun", rate: 1.8, action: "Swim", color: "#38bdf8" },
  hottub: { name: "Hot Tub", price: 6000, w: 2.2, d: 2.2, h: 0.9, room: "Outdoor", need: "hygiene", rate: 1.5, action: "Soak", color: "#0ea5e9" },
} satisfies Record<string, FurnitureDef>;
/** Everything you can place: the original pieces and the builder's catalogue of 100. */
export const FURNITURE = { ...BASE_FURNITURE, ...CATALOG };
export type FurnitureType = keyof typeof FURNITURE;
/** The builder's tab for a piece: Furniture, Decor or Outdoor. */
export function categoryOf(t: FurnitureType): BuildCategory {
  const f = furnitureDef(t);
  return f.cat ?? (f.room === "Outdoor" ? "Outdoor" : f.room === "Decor" ? "Decor" : "Furniture");
}
export const isFurniture = (t: unknown): t is FurnitureType => typeof t === "string" && Object.prototype.hasOwnProperty.call(FURNITURE, t);
export const furnitureDef = (t: FurnitureType): FurnitureDef => FURNITURE[t];

export interface Wall {
  /** Grid points in plot-local metres (axis-aligned, whole metres). */
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  color: string;
  /** Doors and windows: offset along the wall (m) and kind. */
  open: { at: number; kind: "door" | "window" }[];
}

export interface FloorTile {
  x: number;
  z: number;
  mat: FloorMat;
}

export interface Item {
  id: number;
  type: FurnitureType;
  /** Centre in plot-local metres. */
  x: number;
  z: number;
  /** Quarter turns. */
  rot: number;
}

export interface Build {
  walls: Wall[];
  floors: FloorTile[];
  items: Item[];
  roof: string;
  nextId: number;
}

export const PRICES = { wall: 60, floor: 25, door: 250, window: 180, refund: 0.7 } as const;
export const WALL_H = 3;
export const WALL_T = 0.18;

export const buildCost = (b: Build) =>
  b.walls.reduce((a, w) => a + Math.hypot(w.x2 - w.x1, w.z2 - w.z1) * PRICES.wall + w.open.reduce((s, o) => s + (o.kind === "door" ? PRICES.door : PRICES.window), 0), 0) + b.floors.length * PRICES.floor + b.items.reduce((a, i) => a + furnitureDef(i.type).price, 0);

/** An item's footprint (rotation applied). */
export function itemRect(i: { type: FurnitureType; x: number; z: number; rot: number }): Rect {
  const f = furnitureDef(i.type);
  const turned = i.rot % 2 === 1;
  const w = turned ? f.d : f.w;
  const d = turned ? f.w : f.d;
  return { x: i.x - w / 2, z: i.z - d / 2, w, d };
}

const overlap = (a: Rect, b: Rect, pad = 0) => a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.z < b.z + b.d - pad && b.z < a.z + a.d - pad;

/** Distance from a point to a wall's centreline segment. */
export function wallDist(w: Wall, x: number, z: number) {
  const dx = w.x2 - w.x1;
  const dz = w.z2 - w.z1;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / len2));
  return Math.hypot(x - (w.x1 + dx * t), z - (w.z1 + dz * t));
}

export type BuildResult = { ok: true; cost: number } | { ok: false; why: string };

/** Can this wall go here? Inside the plot, axis-aligned, not on top of another. */
export function checkWall(b: Build, w: Pick<Wall, "x1" | "z1" | "x2" | "z2">): BuildResult {
  const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
  if (len < 1) return { ok: false, why: "Too short" };
  if (w.x1 !== w.x2 && w.z1 !== w.z2) return { ok: false, why: "Walls run straight along the grid" };
  for (const v of [w.x1, w.x2]) if (v < 0 || v > PLOT_W) return { ok: false, why: "Outside your plot" };
  for (const v of [w.z1, w.z2]) if (v < 0 || v > PLOT_D) return { ok: false, why: "Outside your plot" };
  for (const o of b.walls) {
    const sameLine = (o.x1 === o.x2 && w.x1 === w.x2 && o.x1 === w.x1) || (o.z1 === o.z2 && w.z1 === w.z2 && o.z1 === w.z1);
    if (!sameLine) continue;
    const [a0, a1] = w.x1 === w.x2 ? [Math.min(w.z1, w.z2), Math.max(w.z1, w.z2)] : [Math.min(w.x1, w.x2), Math.max(w.x1, w.x2)];
    const [b0, b1] = o.x1 === o.x2 ? [Math.min(o.z1, o.z2), Math.max(o.z1, o.z2)] : [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)];
    if (a0 < b1 && b0 < a1) return { ok: false, why: "There's already a wall there" };
  }
  return { ok: true, cost: Math.round(len * PRICES.wall) };
}

export function addWall(b: Build, w: Pick<Wall, "x1" | "z1" | "x2" | "z2">, color = "#f1ede4"): BuildResult {
  const r = checkWall(b, w);
  if (r.ok) b.walls.push({ ...w, color, open: [] });
  return r;
}

/** Put a door or window into the nearest wall at a point. */
export function addOpening(b: Build, x: number, z: number, kind: "door" | "window"): BuildResult {
  let best: Wall | null = null;
  let bd = 0.8;
  for (const w of b.walls) {
    const d = wallDist(w, x, z);
    if (d < bd) {
      bd = d;
      best = w;
    }
  }
  if (!best) return { ok: false, why: "Put it on a wall" };
  const len = Math.hypot(best.x2 - best.x1, best.z2 - best.z1);
  const along = best.x1 === best.x2 ? Math.abs(z - best.z1) : Math.abs(x - best.x1);
  const half = kind === "door" ? 0.5 : 0.7;
  const at = Math.round(Math.max(half, Math.min(len - half, along)) * 2) / 2;
  if (best.open.some((o) => Math.abs(o.at - at) < half + (o.kind === "door" ? 0.5 : 0.7))) return { ok: false, why: "Too close to another opening" };
  if (len < half * 2) return { ok: false, why: "Wall's too short" };
  best.open.push({ at, kind });
  return { ok: true, cost: kind === "door" ? PRICES.door : PRICES.window };
}

export function paintFloor(b: Build, x: number, z: number, mat: FloorMat): BuildResult {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  if (cx < 0 || cz < 0 || cx >= PLOT_W || cz >= PLOT_D) return { ok: false, why: "Outside your plot" };
  const f = b.floors.find((q) => q.x === cx && q.z === cz);
  if (f) {
    if (f.mat === mat) return { ok: false, why: "Already that floor" };
    f.mat = mat;
    return { ok: true, cost: PRICES.floor };
  }
  b.floors.push({ x: cx, z: cz, mat });
  return { ok: true, cost: PRICES.floor };
}

/** Can furniture go here? Inside the plot, not through walls or other furniture. Outdoor items don't need a floor. */
export function checkItem(b: Build, it: { type: FurnitureType; x: number; z: number; rot: number }, skip = -1): BuildResult {
  const r = itemRect(it);
  if (r.x < 0 || r.z < 0 || r.x + r.w > PLOT_W || r.z + r.d > PLOT_D) return { ok: false, why: "Outside your plot" };
  for (const o of b.items) {
    if (o.id === skip) continue;
    const isFlat = (t: FurnitureType) => !!furnitureDef(t).flat || t === "rug";
    if (!isFlat(o.type) && !isFlat(it.type) && overlap(r, itemRect(o), 0.02)) return { ok: false, why: "Something's in the way" };
  }
  for (const w of b.walls) {
    // Sample along the item's edges for wall contact.
    const pts = [
      [r.x + 0.05, r.z + 0.05],
      [r.x + r.w - 0.05, r.z + 0.05],
      [r.x + 0.05, r.z + r.d - 0.05],
      [r.x + r.w - 0.05, r.z + r.d - 0.05],
      [r.x + r.w / 2, r.z + r.d / 2],
    ];
    const minX = Math.min(w.x1, w.x2);
    const maxX = Math.max(w.x1, w.x2);
    const minZ = Math.min(w.z1, w.z2);
    const maxZ = Math.max(w.z1, w.z2);
    const crosses = w.x1 === w.x2 ? r.x < w.x1 + WALL_T / 2 && r.x + r.w > w.x1 - WALL_T / 2 && r.z < maxZ && r.z + r.d > minZ : r.z < w.z1 + WALL_T / 2 && r.z + r.d > w.z1 - WALL_T / 2 && r.x < maxX && r.x + r.w > minX;
    if (crosses || pts.some(([px, pz]) => wallDist(w, px, pz) < WALL_T / 2)) return { ok: false, why: "That's through a wall" };
  }
  const def = furnitureDef(it.type);
  if (def.room !== "Outdoor" && !def.anywhere && it.type !== "plant") {
    const cx = Math.floor(it.x);
    const cz = Math.floor(it.z);
    if (!b.floors.some((f) => f.x === cx && f.z === cz)) return { ok: false, why: "Indoor furniture needs a floor" };
  }
  return { ok: true, cost: def.price };
}

export function addItem(b: Build, it: { type: FurnitureType; x: number; z: number; rot: number }): BuildResult & { id?: number } {
  const r = checkItem(b, it);
  if (!r.ok) return r;
  const id = b.nextId++;
  b.items.push({ id, ...it });
  return { ...r, id };
}

/** Remove whatever's under a point (furniture first, then an opening, then a wall, then floor). Returns the refund. */
export function removeAt(b: Build, x: number, z: number): number {
  const item = [...b.items].reverse().find((i) => {
    const r = itemRect(i);
    return x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d;
  });
  if (item) {
    b.items = b.items.filter((i) => i !== item);
    return Math.round(furnitureDef(item.type).price * PRICES.refund);
  }
  const wall = b.walls.find((w) => wallDist(w, x, z) < 0.35);
  if (wall) {
    const along = wall.x1 === wall.x2 ? Math.abs(z - wall.z1) : Math.abs(x - wall.x1);
    const o = wall.open.find((q) => Math.abs(q.at - along) < 0.7);
    if (o) {
      wall.open = wall.open.filter((q) => q !== o);
      return Math.round((o.kind === "door" ? PRICES.door : PRICES.window) * PRICES.refund);
    }
    b.walls = b.walls.filter((w) => w !== wall);
    return Math.round(Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1) * PRICES.wall * PRICES.refund);
  }
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  const f = b.floors.find((q) => q.x === cx && q.z === cz);
  if (f) {
    b.floors = b.floors.filter((q) => q !== f);
    return Math.round(PRICES.floor * PRICES.refund);
  }
  return 0;
}

/** A room as four walls (whole metres), with an optional door on one side. */
export function room(b: Build, x: number, z: number, w: number, d: number, mat: FloorMat, door?: { side: "n" | "s" | "e" | "w"; at: number }) {
  const sides: [number, number, number, number, "n" | "s" | "e" | "w"][] = [
    [x, z, x + w, z, "n"],
    [x, z + d, x + w, z + d, "s"],
    [x, z, x, z + d, "w"],
    [x + w, z, x + w, z + d, "e"],
  ];
  for (const [x1, z1, x2, z2, s] of sides) {
    const r = checkWall(b, { x1, z1, x2, z2 });
    let wall: Wall | undefined;
    if (r.ok) {
      wall = { x1, z1, x2, z2, color: "#f1ede4", open: [] };
      b.walls.push(wall);
    } else wall = b.walls.find((o) => o.x1 === x1 && o.z1 === z1 && o.x2 === x2 && o.z2 === z2);
    if (wall && door && door.side === s && !wall.open.some((o) => Math.abs(o.at - door.at) < 1)) wall.open.push({ at: door.at, kind: "door" });
  }
  for (let i = x; i < x + w; i++) for (let k = z; k < z + d; k++) if (!b.floors.some((f) => f.x === i && f.z === k)) b.floors.push({ x: i, z: k, mat });
}

export const emptyBuild = (): Build => ({ walls: [], floors: [], items: [], roof: "#4b3a2f", nextId: 1 });

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * A build that came from somewhere else (the server, another player, an old
 * save) made safe to draw: unknown furniture and malformed pieces are dropped
 * rather than crashing whoever walks past. Null if it isn't a build at all.
 */
export function cleanBuild(raw: unknown): Build | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.walls)) return null;
  const walls = (r.walls as Wall[]).filter((w) => w && finite(w.x1) && finite(w.z1) && finite(w.x2) && finite(w.z2)).map((w) => ({ ...w, color: typeof w.color === "string" ? w.color : "#e7e5e4", open: Array.isArray(w.open) ? w.open.filter((o) => o && finite(o.at) && (o.kind === "door" || o.kind === "window")) : [] }));
  const floors = Array.isArray(r.floors) ? (r.floors as FloorTile[]).filter((f) => f && finite(f.x) && finite(f.z) && typeof f.mat === "string") : [];
  const items = Array.isArray(r.items) ? (r.items as Item[]).filter((i) => i && isFurniture(i.type) && finite(i.x) && finite(i.z) && finite(i.rot) && finite(i.id)) : [];
  const nextId = Math.max(finite(r.nextId) ? r.nextId : 1, ...items.map((i) => i.id + 1));
  return { walls, floors, items, roof: typeof r.roof === "string" ? r.roof : "#4b3a2f", nextId };
}

/**
 * A ready-made house for a plot: living room and kitchen, a bedroom or two and
 * a bathroom, windows all round, furnished. `size` 0–2 makes bigger houses.
 * The front (street side) is z = PLOT_D for north-facing plots' local frame,
 * so the house sits toward the back with a front yard.
 */
export function starterBuild(seed: number, size = 1): Build {
  const r = createRng(seed);
  const b = emptyBuild();
  const W = size >= 2 ? 16 : size === 1 ? 14 : 11;
  const D = size >= 2 ? 13 : 11;
  const x0 = Math.round((PLOT_W - W) / 2);
  const z0 = 4;
  const floorMat: FloorMat = r.pick(["wood", "wood", "tile", "marble"]);
  // Outer shell with the front door on the street side (south in local coords).
  room(b, x0, z0, W, D, floorMat, { side: "s", at: Math.round(W / 2) });
  // Inside: bedroom(s) at the back, bathroom, open living/kitchen at the front.
  const bedW = Math.round(W / 2) - 1;
  const bedD = Math.round(D * 0.45);
  room(b, x0, z0, bedW, bedD, "carpet", { side: "s", at: 1.5 });
  room(b, x0 + bedW, z0, 4, bedD, "tile", { side: "s", at: 1 });
  if (size >= 1) room(b, x0 + bedW + 4, z0, W - bedW - 4, bedD, "carpet", { side: "s", at: 1.5 });
  // Windows.
  const shell = b.walls.filter((w) => (w.z1 === z0 && w.z2 === z0) || (w.z1 === z0 + D && w.z2 === z0 + D) || (w.x1 === x0 && w.x2 === x0) || (w.x1 === x0 + W && w.x2 === x0 + W));
  for (const w of shell) {
    const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
    for (let a = 2; a < len - 1.5; a += 3.5) if (!w.open.some((o) => Math.abs(o.at - a) < 1.6)) w.open.push({ at: a, kind: "window" });
  }
  const put = (type: FurnitureType, x: number, z: number, rot = 0) => void addItem(b, { type, x, z, rot });
  // Bedroom.
  put("bed", x0 + 1.4, z0 + 1.6);
  put("nightstand", x0 + 2.6, z0 + 0.6);
  put("wardrobe", x0 + bedW - 1, z0 + 0.5);
  // Bathroom.
  put("shower", x0 + bedW + 0.7, z0 + 0.7);
  put("toilet", x0 + bedW + 2.2, z0 + 0.5);
  put("basin", x0 + bedW + 3.4, z0 + 0.4);
  if (size >= 1) {
    put("single", x0 + bedW + 4 + 1, z0 + 1.5);
    put("desk", x0 + W - 1, z0 + 0.6);
  }
  // Kitchen along the side wall, living room at the front.
  const kz = z0 + bedD + 1;
  put("fridge", x0 + 0.6, kz + 0.6, 1);
  put("stove", x0 + 0.5, kz + 1.6, 1);
  put("counter", x0 + 0.5, kz + 2.8, 1);
  put("sinkK", x0 + 0.5, kz + 4, 1);
  put("table", x0 + 3, kz + 2);
  put("chair", x0 + 3, kz + 1.3);
  put("chair", x0 + 3, kz + 2.7, 2);
  put("sofa", x0 + W - 3.5, z0 + D - 1.4, 2);
  put("tv", x0 + W - 3.5, kz + 0.4);
  put("rug", x0 + W - 3.5, kz + 2.2);
  put("plant", x0 + W - 0.6, z0 + D - 0.6);
  put("lamp", x0 + W - 0.6, kz + 0.6);
  // Out the back.
  put("bbq", x0 + 2, z0 - 1.6);
  b.roof = r.pick(["#4b3a2f", "#374151", "#7c2d12", "#1f2937"]);
  return b;
}

/** A plot's house: yours if you've built one, otherwise the ready-made one. */
export function buildFor(plotId: number, saved: Record<number, unknown>): Build {
  const b = saved[plotId] as Build | undefined;
  if (b && Array.isArray(b.walls)) return b;
  return starterBuild(1000 + plotId * 17, plotId % 3);
}

// ----------------------------------------------------------- local <-> world

/**
 * Plot-local (x along the plot's width, z from back to front, the street at
 * z = PLOT_D) to world. South-facing plots are unrotated; north-facing ones
 * are turned half a circle about the plot.
 */
export function toWorld(p: Plot, lx: number, lz: number) {
  return p.front === "south" ? { x: p.x + lx, z: p.z + lz } : { x: p.x + PLOT_W - lx, z: p.z + PLOT_D - lz };
}
export function toLocal(p: Plot, x: number, z: number) {
  return p.front === "south" ? { x: x - p.x, z: z - p.z } : { x: p.x + PLOT_W - x, z: p.z + PLOT_D - z };
}
/** Rotation (radians about y) that maps local axes onto the world for a plot. */
export const plotYaw = (p: Plot) => (p.front === "north" ? Math.PI : 0);

export function plotAt(x: number, z: number) {
  return PLOTS.find((p) => x >= p.x && x <= p.x + p.w && z >= p.z && z <= p.z + p.d) ?? null;
}

// ------------------------------------------------------------------ needs

export interface Needs {
  hunger: number;
  energy: number;
  hygiene: number;
  fun: number;
}
export const NEEDS: Need[] = ["hunger", "energy", "hygiene", "fun"];
/** Decay per game minute. */
export const DECAY: Record<Need, number> = { hunger: 0.085, energy: 0.06, hygiene: 0.05, fun: 0.07 };

export const freshNeeds = (): Needs => ({ hunger: 85, energy: 90, hygiene: 85, fun: 75 });
export const moodOf = (n: Needs) => Math.round((n.hunger + n.energy + n.hygiene + n.fun) / 4);

export function decayNeeds(n: Needs, minutes: number, mult: Partial<Record<Need, number>> = {}) {
  for (const k of NEEDS) n[k] = Math.max(0, Math.min(100, n[k] - DECAY[k] * minutes * (mult[k] ?? 1)));
}

/** Using a piece of furniture for some game minutes. */
export function applyFurniture(n: Needs, type: FurnitureType, minutes: number) {
  const f = furnitureDef(type);
  if (f.need && f.rate) n[f.need] = Math.min(100, n[f.need] + f.rate * minutes);
}

export function moodline(n: Needs) {
  const low = NEEDS.filter((k) => n[k] < 25);
  if (!low.length) return moodOf(n) > 75 ? "Feeling great" : "Doing fine";
  const say: Record<Need, string> = { hunger: "Hungry", energy: "Exhausted", hygiene: "Smelly", fun: "Bored" };
  return low.map((k) => say[k]).join(" · ");
}

// ------------------------------------------------------------------ clock

/** Game time: minutes since midnight on day 1. One real second is one game minute. */
export const clockText = (min: number) => {
  const m = Math.floor(min) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};
export const dayOf = (min: number) => Math.floor(min / 1440) + 1;
/** Sun height (-1 night .. 1 noon) for the time of day. */
export const sunAt = (min: number) => Math.sin(((((min % 1440) / 1440) * 24 - 6) / 24) * Math.PI * 2);

// ------------------------------------------------------------------ shifts

export interface Grocery {
  name: string;
  price: number;
  color: string;
}
const GROCERIES: Grocery[] = [
  { name: "Milk", price: 3.2, color: "#f8fafc" },
  { name: "Bread", price: 4.5, color: "#d97706" },
  { name: "Apples", price: 5.9, color: "#dc2626" },
  { name: "Eggs", price: 6.4, color: "#fde68a" },
  { name: "Cheese", price: 7.8, color: "#facc15" },
  { name: "Pasta", price: 2.6, color: "#fbbf24" },
  { name: "Coffee", price: 12.5, color: "#78350f" },
  { name: "Bananas", price: 3.9, color: "#fde047" },
  { name: "Chicken", price: 11.2, color: "#fecaca" },
  { name: "Cereal", price: 6.8, color: "#2563eb" },
  { name: "Juice", price: 4.9, color: "#fb923c" },
  { name: "Ice Cream", price: 8.5, color: "#f9a8d4" },
];

export interface Customer {
  items: Grocery[];
  scanned: boolean[];
  paid: number;
  name: string;
}

export function newCustomer(r: Rng): Customer {
  const n = 2 + Math.floor(r.next() * 5);
  const items = Array.from({ length: n }, () => r.pick(GROCERIES));
  const total = items.reduce((a, i) => a + i.price, 0);
  const notes = [5, 10, 20, 50, 100];
  const paid = notes.find((x) => x >= total) ?? Math.ceil(total / 10) * 10;
  return { items, scanned: items.map(() => false), paid, name: r.pick(["Mrs Chen", "Mr Okafor", "Dev", "Grace", "Tomas", "Aunty Rosa", "Kai", "Lucia", "Mr Haddad", "Ivy"]) };
}

export const customerTotal = (c: Customer) => Math.round(c.items.reduce((a, i) => a + i.price, 0) * 100) / 100;
export const changeDue = (c: Customer) => Math.round((c.paid - customerTotal(c)) * 100) / 100;

/** Score a served customer: all scanned, the right change, how fast. */
export function serveScore(c: Customer, change: number, seconds: number) {
  const allScanned = c.scanned.every(Boolean);
  const right = Math.abs(change - changeDue(c)) < 0.01;
  return Math.max(0, Math.round((allScanned ? 50 : 10) + (right ? 40 : 0) + Math.max(0, 20 - seconds) * 1.5));
}

export interface Order {
  size: "Small" | "Regular" | "Large";
  drink: "Flat White" | "Latte" | "Cappuccino" | "Mocha" | "Long Black" | "Chai";
  milk: "Full cream" | "Skim" | "Oat" | "Almond" | "None";
  name: string;
}
export const ORDER_OPTIONS = {
  size: ["Small", "Regular", "Large"] as const,
  drink: ["Flat White", "Latte", "Cappuccino", "Mocha", "Long Black", "Chai"] as const,
  milk: ["Full cream", "Skim", "Oat", "Almond", "None"] as const,
};
export function newOrder(r: Rng): Order {
  const drink = r.pick(ORDER_OPTIONS.drink);
  return { size: r.pick(ORDER_OPTIONS.size), drink, milk: drink === "Long Black" ? "None" : r.pick(ORDER_OPTIONS.milk.filter((m) => m !== "None")), name: r.pick(["Sam", "Priya", "Jonah", "Mia", "Leo", "Hana", "Omar", "Zoe"]) };
}
export const orderMatches = (a: Order, b: Omit<Order, "name">) => a.size === b.size && a.drink === b.drink && a.milk === b.milk;

/** A delivery: pick up at Slice of Heaven, drop at a house; pay plus a tip for speed. */
export function newDelivery(r: Rng, exclude = -1) {
  let plot = PLOTS[Math.floor(r.next() * PLOTS.length)];
  if (plot.id === exclude) plot = PLOTS[(plot.id + 5) % PLOTS.length];
  const shop = placeById("pizza")!;
  const target = spawnFor(plot.id);
  const dist = Math.hypot(target.x - shop.door.x, target.z - shop.door.z);
  return { plot: plot.id, x: target.x, z: target.z, limit: Math.round(30 + dist / 6), pay: 12 };
}
export const deliveryTip = (secondsLeft: number) => Math.max(0, Math.round(secondsLeft / 3));

/** Shift pay: hourly rate from the yearly salary, a full shift is 8 hours. */
export const shiftPay = (yearly: number, hours = 8) => Math.round((yearly / 2000) * hours);

// ---------------------------------------------------------------- driving

export interface Car {
  x: number;
  z: number;
  heading: number;
  speed: number;
}

/** Arcade car: throttle -1..1, steer -1..1; collides with buildings. */
export function driveStep(c: Car, throttle: number, steer: number, dt: number, solid: (x: number, z: number) => boolean) {
  const max = throttle < 0 ? 8 : 26;
  const accel = throttle * (throttle * c.speed < 0 ? 18 : 9);
  c.speed += accel * dt;
  c.speed -= c.speed * (throttle === 0 ? 0.8 : 0.15) * dt;
  c.speed = Math.max(-max, Math.min(max, c.speed));
  const turn = steer * Math.min(1, Math.abs(c.speed) / 6) * 1.6 * Math.sign(c.speed || 1);
  c.heading += turn * dt;
  const nx = c.x + Math.sin(c.heading) * c.speed * dt;
  const nz = c.z + Math.cos(c.heading) * c.speed * dt;
  if (solid(nx, nz)) {
    c.speed *= -0.25;
    return true;
  }
  c.x = nx;
  c.z = nz;
  return false;
}

/** Is a point inside a building or off the edge of town? */
export function townSolid(x: number, z: number) {
  if (x < -235 || x > 235 || z < -70 || z > 175) return true;
  return PLACES.some((p) => x > p.x && x < p.x + p.w && z > p.z && z < p.z + p.d);
}

export { createRng };

// -------------------------------------------------------------- collisions

export interface Colliders {
  /** Wall pieces in world space (door gaps removed): x1, z1, x2, z2. */
  segs: [number, number, number, number][];
  boxes: Rect[];
}

/** Everything solid in town: shops, house walls (doors are gaps), furniture. */
export function colliders(builds: (plotId: number) => Build): Colliders {
  const segs: Colliders["segs"] = [];
  const boxes: Rect[] = PLACES.map((p) => ({ x: p.x, z: p.z, w: p.w, d: p.d }));
  for (const p of PLOTS) {
    const b = builds(p.id);
    for (const w of b.walls) {
      const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
      const ux = (w.x2 - w.x1) / len;
      const uz = (w.z2 - w.z1) / len;
      const gaps = w.open.filter((o) => o.kind === "door").map((o) => [o.at - 0.5, o.at + 0.5]).sort((a, c) => a[0] - c[0]);
      let s = 0;
      for (const [g0, g1] of [...gaps, [len, len]]) {
        if (g0 > s + 0.01) {
          const a = toWorld(p, w.x1 + ux * s, w.z1 + uz * s);
          const c = toWorld(p, w.x1 + ux * g0, w.z1 + uz * g0);
          segs.push([a.x, a.z, c.x, c.z]);
        }
        s = Math.max(s, g1);
      }
    }
    for (const it of b.items) {
      const f = furnitureDef(it.type);
      if (it.type === "rug" || f.h < 0.1) continue;
      const r = itemRect(it);
      const a = toWorld(p, r.x, r.z);
      const c = toWorld(p, r.x + r.w, r.z + r.d);
      boxes.push({ x: Math.min(a.x, c.x), z: Math.min(a.z, c.z), w: Math.abs(c.x - a.x), d: Math.abs(c.z - a.z) });
    }
  }
  return { segs, boxes };
}

const segDist = (s: [number, number, number, number], x: number, z: number) => {
  const dx = s[2] - s[0];
  const dz = s[3] - s[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / l2));
  return Math.hypot(x - (s[0] + dx * t), z - (s[1] + dz * t));
};

/** Would a person of radius r standing at (x, z) be inside something? */
export function blocked(c: Colliders, x: number, z: number, r = 0.3) {
  if (x < -235 || x > 235 || z < -70 || z > 175) return true;
  for (const b of c.boxes) if (x > b.x - r && x < b.x + b.w + r && z > b.z - r && z < b.z + b.d + r) return true;
  for (const s of c.segs) if (segDist(s, x, z) < r + WALL_T / 2) return true;
  return false;
}

/**
 * Turn stick or WASD input into a world direction relative to the chase camera.
 * The camera sits at (sin yaw, cos yaw) behind you, so forward is (-sin yaw, -cos yaw)
 * and screen-right is (cos yaw, -sin yaw). `mx` is right-positive, `mz` down/back-positive
 * (screen axes). Returns a unit vector, or null with no input.
 */
export function cameraMove(yaw: number, mx: number, mz: number): { dx: number; dz: number } | null {
  if (!mx && !mz) return null;
  const dx = -Math.sin(yaw) * -mz + Math.cos(yaw) * mx;
  const dz = -Math.cos(yaw) * -mz - Math.sin(yaw) * mx;
  const len = Math.hypot(dx, dz) || 1;
  return { dx: dx / len, dz: dz / len };
}

/** Walk with sliding along walls. */
export function walk(c: Colliders, pos: { x: number; z: number }, dx: number, dz: number) {
  if (!blocked(c, pos.x + dx, pos.z + dz)) {
    pos.x += dx;
    pos.z += dz;
  } else if (!blocked(c, pos.x + dx, pos.z)) pos.x += dx;
  else if (!blocked(c, pos.x, pos.z + dz)) pos.z += dz;
}

/** Furniture you can use around a world point (your home only). */
export function usableNear(b: Build, p: Plot, x: number, z: number, reach = 1.4) {
  const l = toLocal(p, x, z);
  let best: { item: Item; d: number } | null = null;
  for (const it of b.items) {
    const f = furnitureDef(it.type);
    if (!f.action) continue;
    const r = itemRect(it);
    const dx = Math.max(r.x - l.x, 0, l.x - (r.x + r.w));
    const dz = Math.max(r.z - l.z, 0, l.z - (r.z + r.d));
    const d = Math.hypot(dx, dz);
    if (d < reach && (!best || d < best.d)) best = { item: it, d };
  }
  return best?.item ?? null;
}
