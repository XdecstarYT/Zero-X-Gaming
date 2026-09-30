import { createRng } from "../engine/rng";

/**
 * Arena maps. World units are cells (1 cell ≈ 2 m). Collision and line of sight
 * use a solid-cell grid; renderers read the extra layout data (ground types,
 * buildings for roofs, props) to dress it up.
 *
 * Solid cell types:
 *   1 concrete wall   2 brick wall   3 perimeter wall
 *   4 tree            5 crate        6 rock           7 fence
 * Ground types (walkable cells): 0 grass  1 asphalt road  2 interior floor  3 dirt path
 */

export const SOLID = {
  concrete: 1,
  brick: 2,
  perimeter: 3,
  tree: 4,
  crate: 5,
  rock: 6,
  fence: 7,
  /** Sandbag parapet (Trenches). */
  sandbag: 8,
  /** Flooded shell hole / sea (Trenches): blocks movement, not bullets or sight. */
  water: 9,
  /** Barbed-wire entanglement (Trenches): blocks movement, not bullets or sight. */
  wire: 10,
  /** Low scrub (Trenches): blocks movement, not bullets or sight. */
  shrub: 11,
} as const;

/** Solid cells that stop bodies but not rays (bullets, line of sight). */
export const SEE_THROUGH = new Set<number>([SOLID.water, SOLID.wire, SOLID.shrub]);

export const GROUND = {
  grass: 0,
  road: 1,
  floor: 2,
  dirt: 3,
  /** A dug trench: walkable, 1.3 m below the surface (Trenches). */
  trench: 4,
  sand: 5,
  snow: 6,
  /** Duckboard track laid over the mud. */
  duck: 7,
} as const;

export interface MapDecor {
  /** Shell craters (visual; water ones also have water cells at their centre). */
  craters: { x: number; y: number; r: number; water?: boolean }[];
  /** Trench cells roofed with timber (Gallipoli's Lone Pine). */
  covered?: number[];
}

/** Visual/atmospheric settings for a Trenches front (read by the 3D view). */
export interface FrontTheme {
  id: string;
  /** Surface tint for open ground (no-man's-land) and its secondary patches. */
  soil: string;
  soil2: string;
  /** Trench wall/floor earth. */
  earth: string;
  sky: { turbidity: number; rayleigh: number; mie: number; elevation: number; azimuth: number };
  sun: { color: string; intensity: number };
  hemi: { sky: string; ground: string; intensity: number };
  fog: { color: string; near: number; far: number };
  exposure: number;
  clouds: string;
  weather: "none" | "rain" | "snow" | "dust";
  /** A sea beyond this map edge (Gallipoli). */
  sea?: "west" | "east";
  /** Grass tufts per 100 m² of open ground. */
  grass: number;
  grassColor: string;
  /** Smoke drifting over no-man's-land (0..1). */
  smoke: number;
}

export interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
  material: "brick" | "concrete";
  /** Storeys, for roof height. */
  floors: 1 | 2;
}

export interface GameMap {
  name: string;
  width: number;
  height: number;
  /** 0 = walkable, otherwise a solid type (see SOLID). Row-major. */
  cells: Uint8Array;
  /** Ground material for walkable cells (see GROUND). */
  ground: Uint8Array;
  buildings: Building[];
  spawns: { x: number; y: number }[];
  /** Candidate floor-loot positions (cell centres). */
  lootSpots: { x: number; y: number }[];
  chests: { x: number; y: number }[];
  /** Window openings in building walls (visual only: walls stay solid). */
  windows: { x: number; y: number }[];
  /** Visual theme for the 3D view (default "town"). */
  theme?: "town" | "battlefield";
  /** Trenches: the front's look (sky, soil, weather). */
  front?: FrontTheme;
  /** Trenches: visual-only set dressing. */
  decor?: MapDecor;
  /** Trenches: cells dug into trench during the match, in order (renderers watch this). */
  dug?: number[];
}

export function wallAt(map: GameMap, cx: number, cy: number): number {
  if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return SOLID.perimeter;
  return map.cells[cy * map.width + cx];
}

export function isWall(map: GameMap, x: number, y: number): boolean {
  return wallAt(map, Math.floor(x), Math.floor(y)) !== 0;
}

export function groundAt(map: GameMap, cx: number, cy: number): number {
  if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return GROUND.grass;
  return map.ground[cy * map.width + cx];
}

// --------------------------------------------------------------- raycasting

export interface RayHit {
  dist: number;
  /** 0 = hit a vertical (x) grid line, 1 = horizontal (y). */
  side: 0 | 1;
  wall: number;
  /** 0..1 position along the wall face. */
  u: number;
}

/** DDA grid raycast: Euclidean distance to the first solid cell. */
export function castRay(map: GameMap, ox: number, oy: number, angle: number, maxDist = 128): RayHit {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let cx = Math.floor(ox);
  let cy = Math.floor(oy);
  const stepX = dx < 0 ? -1 : 1;
  const stepY = dy < 0 ? -1 : 1;
  const deltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const deltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  let sideX = dx < 0 ? (ox - cx) * deltaX : (cx + 1 - ox) * deltaX;
  let sideY = dy < 0 ? (oy - cy) * deltaY : (cy + 1 - oy) * deltaY;
  let side: 0 | 1 = 0;
  let dist = 0;
  while (dist < maxDist) {
    if (sideX < sideY) {
      dist = sideX;
      sideX += deltaX;
      cx += stepX;
      side = 0;
    } else {
      dist = sideY;
      sideY += deltaY;
      cy += stepY;
      side = 1;
    }
    const w = wallAt(map, cx, cy);
    if (w !== 0 && !SEE_THROUGH.has(w)) {
      const hit = side === 0 ? oy + dist * dy : ox + dist * dx;
      return { dist, side, wall: w, u: hit - Math.floor(hit) };
    }
  }
  return { dist: maxDist, side, wall: 0, u: 0 };
}

export function lineOfSight(map: GameMap, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 1e-6) return true;
  return castRay(map, ax, ay, Math.atan2(by - ay, bx - ax), d + 1).dist >= d;
}

/** Axis-separated movement with a circular body against grid walls. */
export function moveWithCollision(map: GameMap, x: number, y: number, dx: number, dy: number, r: number) {
  const blocked = (px: number, py: number) =>
    isWall(map, px - r, py - r) || isWall(map, px + r, py - r) || isWall(map, px - r, py + r) || isWall(map, px + r, py + r);
  let nx = x + dx;
  if (blocked(nx, y)) nx = x;
  let ny = y + dy;
  if (blocked(nx, ny)) ny = y;
  return { x: nx, y: ny };
}

const floorCache = new WeakMap<Uint8Array, { x: number; y: number }[]>();
/** Walkable cells (cached per map: the solid grid never changes during a match). */
export function floorCells(map: GameMap): { x: number; y: number }[] {
  const hit = floorCache.get(map.cells);
  if (hit) return hit;
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) if (map.cells[y * map.width + x] === 0) out.push({ x, y });
  floorCache.set(map.cells, out);
  return out;
}

// ---------------------------------------------------------------- generator

export const MAP_SIZE = 72;
/** The Season 1 map. Fixed seed: every player (and every online peer) gets the same town. */
export const GROUND_ZERO_SEED = 20261001;

/**
 * "Ground Zero": a small town at a crossroads, with a forest to the north-west,
 * a quarry of rocks to the north-east, farm fields with crate stacks to the
 * south, and a walled perimeter.
 */
export function generateTown(seed = GROUND_ZERO_SEED, size = MAP_SIZE): GameMap {
  const rng = createRng(seed);
  const W = size;
  const H = size;
  const cells = new Uint8Array(W * H);
  const ground = new Uint8Array(W * H);
  const idx = (x: number, y: number) => y * W + x;
  const inside = (x: number, y: number, pad = 1) => x >= pad && y >= pad && x < W - pad && y < H - pad;
  const setSolid = (x: number, y: number, t: number) => {
    if (inside(x, y)) cells[idx(x, y)] = t;
  };
  const free = (x: number, y: number) => inside(x, y, 2) && cells[idx(x, y)] === 0;

  // Perimeter wall
  for (let i = 0; i < W; i++) {
    cells[idx(i, 0)] = SOLID.perimeter;
    cells[idx(i, H - 1)] = SOLID.perimeter;
    cells[idx(0, i)] = SOLID.perimeter;
    cells[idx(W - 1, i)] = SOLID.perimeter;
  }

  // Roads: a main crossroads and a ring of side streets.
  const mid = Math.floor(W / 2);
  const roadRows = new Set<number>();
  const roadCols = new Set<number>();
  for (let d = -2; d <= 1; d++) {
    roadRows.add(mid + d);
    roadCols.add(mid + d);
  }
  for (const r of [18, 54])
    for (let d = 0; d < 2; d++) {
      roadRows.add(r + d);
      roadCols.add(r + d);
    }
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const onRow = roadRows.has(y) && (Math.abs(y - mid) <= 2 || (x >= 16 && x <= 56));
      const onCol = roadCols.has(x) && (Math.abs(x - mid) <= 2 || (y >= 16 && y <= 56));
      if (onRow || onCol) ground[idx(x, y)] = GROUND.road;
    }
  const isRoad = (x: number, y: number) => ground[idx(x, y)] === GROUND.road;

  // Buildings: placed in the blocks around the town centre, doors facing a road.
  const buildings: Building[] = [];
  const chests: { x: number; y: number }[] = [];
  const windows: { x: number; y: number }[] = [];
  const lootSpots: { x: number; y: number }[] = [];
  const overlaps = (b: { x: number; y: number; w: number; h: number }) => {
    for (let y = b.y - 1; y < b.y + b.h + 1; y++)
      for (let x = b.x - 1; x < b.x + b.w + 1; x++) {
        if (!inside(x, y, 2)) return true;
        if (isRoad(x, y) || cells[idx(x, y)] !== 0) return true;
      }
    return false;
  };
  // City blocks between the roads, split into 2x2 plots; the town centre is dense,
  // the outskirts get the odd farmhouse. The far north-west stays forest.
  const bands = [
    [2, 17],
    [20, 33],
    [38, 53],
    [56, W - 3],
  ];
  const plots: { x: number; y: number; w: number; h: number; p: number }[] = [];
  for (let by = 0; by < bands.length; by++)
    for (let bx = 0; bx < bands.length; bx++) {
      if (bx === 0 && by === 0) continue;
      const inner = bx > 0 && bx < 3 && by > 0 && by < 3;
      const [x0, x1] = bands[bx];
      const [y0, y1] = bands[by];
      const hw = Math.floor((x1 - x0 + 1 - 3) / 2);
      const hh = Math.floor((y1 - y0 + 1 - 3) / 2);
      for (let sy = 0; sy < 2; sy++)
        for (let sx = 0; sx < 2; sx++) {
          const w = Math.min(11, hw - rng.int(0, 1));
          const h = Math.min(10, hh - rng.int(0, 1));
          if (w < 5 || h < 5) continue;
          const px = x0 + 1 + sx * (hw + 1);
          const py = y0 + 1 + sy * (hh + 1);
          plots.push({ x: px + rng.int(0, hw - w), y: py + rng.int(0, hh - h), w, h, p: inner ? 0.8 : 0.22 });
        }
    }
  for (const b of plots) {
    if (buildings.length >= 22 || rng.next() > b.p) continue;
    const { x, y, w, h } = b;
    if (overlaps(b)) continue;
    const material: Building["material"] = rng.next() < 0.55 ? "brick" : "concrete";
    const wall = material === "brick" ? SOLID.brick : SOLID.concrete;
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        const edge = xx === x || yy === y || xx === x + w - 1 || yy === y + h - 1;
        if (edge) setSolid(xx, yy, wall);
        else ground[idx(xx, yy)] = GROUND.floor;
      }
    // Doors: one on the side facing the nearest road, plus a back door.
    const sides: ["n" | "s" | "e" | "w", number][] = [
      ["n", Math.abs(y - mid)],
      ["s", Math.abs(y + h - mid)],
      ["w", Math.abs(x - mid)],
      ["e", Math.abs(x + w - mid)],
    ];
    sides.sort((a, c) => a[1] - c[1]);
    const door = (side: "n" | "s" | "e" | "w") => {
      if (side === "n" || side === "s") {
        const dx = rng.int(x + 1, x + w - 3);
        const dy = side === "n" ? y : y + h - 1;
        cells[idx(dx, dy)] = 0;
        cells[idx(dx + 1, dy)] = 0;
        ground[idx(dx, dy)] = ground[idx(dx + 1, dy)] = GROUND.floor;
      } else {
        const dy = rng.int(y + 1, y + h - 3);
        const dx = side === "w" ? x : x + w - 1;
        cells[idx(dx, dy)] = 0;
        cells[idx(dx, dy + 1)] = 0;
        ground[idx(dx, dy)] = ground[idx(dx, dy + 1)] = GROUND.floor;
      }
    };
    door(sides[0][0]);
    door(sides[3][0]);
    // Interior partition with a doorway, for bigger buildings.
    if (w >= 9) {
      const px = x + Math.floor(w / 2);
      const gap = rng.int(y + 1, y + h - 3);
      for (let yy = y + 1; yy < y + h - 1; yy++) if (yy !== gap && yy !== gap + 1) setSolid(px, yy, wall);
    }
    // Windows (visual) on remaining solid perimeter cells.
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        const edge = xx === x || yy === y || xx === x + w - 1 || yy === y + h - 1;
        const corner = (xx === x || xx === x + w - 1) && (yy === y || yy === y + h - 1);
        if (edge && !corner && cells[idx(xx, yy)] !== 0 && (xx + yy) % 3 === 0) windows.push({ x: xx, y: yy });
      }
    // Chest in a corner, loot on the floor.
    const corners = [
      { x: x + 1, y: y + 1 },
      { x: x + w - 2, y: y + 1 },
      { x: x + 1, y: y + h - 2 },
      { x: x + w - 2, y: y + h - 2 },
    ].filter((c) => cells[idx(c.x, c.y)] === 0);
    const c = corners.length ? rng.pick(corners) : null;
    if (c) chests.push({ x: c.x + 0.5, y: c.y + 0.5 });
    lootSpots.push({ x: x + Math.floor(w / 2) + 0.5 - 1, y: y + Math.floor(h / 2) + 0.5 });
    buildings.push({ x, y, w, h, material, floors: rng.next() < 0.3 ? 2 : 1 });
  }

  // Forest (north-west), quarry rocks (north-east), crate yards (south).
  const scatter = (x0: number, y0: number, x1: number, y1: number, n: number, t: number, minGap: number) => {
    for (let i = 0, placed = 0; i < n * 6 && placed < n; i++) {
      const x = rng.int(x0, x1);
      const y = rng.int(y0, y1);
      if (!free(x, y) || isRoad(x, y) || ground[idx(x, y)] === GROUND.floor) continue;
      let ok = true;
      for (let yy = y - minGap; yy <= y + minGap && ok; yy++)
        for (let xx = x - minGap; xx <= x + minGap && ok; xx++)
          if (inside(xx, yy) && cells[idx(xx, yy)] !== 0 && cells[idx(xx, yy)] !== SOLID.perimeter) ok = false;
      if (!ok) continue;
      setSolid(x, y, t);
      placed++;
    }
  };
  scatter(2, 2, 26, 26, 90, SOLID.tree, 1);
  scatter(2, 44, 14, 70, 25, SOLID.tree, 1);
  scatter(46, 2, 69, 22, 28, SOLID.rock, 2);
  scatter(2, 2, 69, 69, 40, SOLID.tree, 2); // sparse trees everywhere
  // Crate stacks (2x2 / 3x1 clusters) in the south fields and around town.
  for (let i = 0; i < 26; i++) {
    const x = rng.int(4, W - 6);
    const y = rng.int(i < 14 ? 46 : 20, i < 14 ? 68 : 52);
    const shape = rng.pick([
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ],
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      [
        [0, 0],
        [0, 1],
      ],
    ]);
    if (shape.every(([dx, dy]) => free(x + dx, y + dy) && !isRoad(x + dx, y + dy) && ground[idx(x + dx, y + dy)] !== GROUND.floor)) {
      for (const [dx, dy] of shape) setSolid(x + dx, y + dy, SOLID.crate);
      lootSpots.push({ x: x - 0.5, y: y + 0.5 });
    }
  }
  // Farm fences with gaps (south-east).
  for (let x = 44; x < 66; x++) if (x % 7 !== 3 && free(x, 60) && !isRoad(x, 60)) setSolid(x, 60, SOLID.fence);
  for (let y = 58; y < 69; y++) if (y % 6 !== 2 && free(44, y) && !isRoad(44, y)) setSolid(44, y, SOLID.fence);

  // Dirt paths into the forest and quarry.
  for (let i = 4; i < mid - 2; i++) {
    const y = Math.round(12 + Math.sin(i / 6) * 3);
    for (const yy of [y, y + 1]) if (cells[idx(i, yy)] === 0 && !isRoad(i, yy)) ground[idx(i, yy)] = GROUND.dirt;
  }

  // Outdoor loot spread around the map.
  for (let i = 0; i < 40; i++) {
    const x = rng.int(3, W - 4);
    const y = rng.int(3, H - 4);
    if (free(x, y)) lootSpots.push({ x: x + 0.5, y: y + 0.5 });
  }

  // Spawns: 24 outdoor points spread out (farthest-point sampling).
  const outdoor: { x: number; y: number }[] = [];
  for (let y = 3; y < H - 3; y += 2)
    for (let x = 3; x < W - 3; x += 2) if (free(x, y) && ground[idx(x, y)] !== GROUND.floor) outdoor.push({ x: x + 0.5, y: y + 0.5 });
  const spawns: { x: number; y: number }[] = [rng.pick(outdoor)];
  while (spawns.length < 24) {
    let best = outdoor[0];
    let bestD = -1;
    for (let i = 0; i < 200; i++) {
      const c = rng.pick(outdoor);
      const d = Math.min(...spawns.map((s) => Math.hypot(s.x - c.x, s.y - c.y)));
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
    spawns.push(best);
  }

  const map: GameMap = { name: "Ground Zero", width: W, height: H, cells, ground, buildings, spawns, lootSpots, chests, windows };
  ensureConnected(map);
  return map;
}

/** Remove props that seal off pockets of floor, so every walkable cell is reachable. */
function ensureConnected(map: GameMap) {
  const { width: W, height: H, cells } = map;
  for (let pass = 0; pass < 8; pass++) {
    const seen = new Uint8Array(W * H);
    const start = map.spawns[0];
    const q = [Math.floor(start.y) * W + Math.floor(start.x)];
    seen[q[0]] = 1;
    while (q.length) {
      const k = q.pop()!;
      const x = k % W;
      const y = (k - x) / W;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const n = (y + dy) * W + (x + dx);
        if (!seen[n] && cells[n] === 0) {
          seen[n] = 1;
          q.push(n);
        }
      }
    }
    let fixed = false;
    for (let k = 0; k < W * H; k++) {
      if (cells[k] !== 0 || seen[k]) continue;
      // Unreachable floor: knock out an adjacent removable prop / interior wall.
      const x = k % W;
      const y = (k - x) / W;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const n = (y + dy) * W + (x + dx);
        const t = cells[n];
        if (t !== 0 && t !== SOLID.perimeter && x + dx > 0 && y + dy > 0 && x + dx < W - 1 && y + dy < H - 1) {
          cells[n] = 0;
          fixed = true;
          break;
        }
      }
    }
    if (!fixed) return;
  }
}

/** Legacy ASCII parser (small test arenas). '#' concrete, '%' brick, '@' crate, 'S' spawn. */
export function parseMap(rows: string[]): GameMap {
  const height = rows.length;
  const width = rows[0].length;
  const cells = new Uint8Array(width * height);
  const ground = new Uint8Array(width * height);
  const spawns: { x: number; y: number }[] = [];
  const T: Record<string, number> = { "#": SOLID.concrete, "%": SOLID.brick, "@": SOLID.crate };
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`Map row ${y} has length ${row.length}, expected ${width}`);
    for (let x = 0; x < width; x++) {
      cells[y * width + x] = T[row[x]] ?? 0;
      if (row[x] === "S") spawns.push({ x: x + 0.5, y: y + 0.5 });
    }
  });
  return { name: "Test", width, height, cells, ground, buildings: [], spawns, lootSpots: [], chests: [], windows: [] };
}

let cached: GameMap | null = null;
/** The shared Season map (generated once per page). */
export function seasonMap(): GameMap {
  cached ??= generateTown();
  return cached;
}
