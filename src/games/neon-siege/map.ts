/**
 * Grid arena for Neon Siege. World units are cells (1 cell = 1 unit).
 * Walls: '#' cyan, '%' magenta, '@' violet. '.' floor, 'S' spawn point (floor).
 */

export const ARENA = [
  "########################",
  "#S.....#........#.....S#",
  "#......#........#......#",
  "#..%%..#..@..@..#..%%..#",
  "#..%%..............%%..#",
  "#......................#",
  "####..###..##..###..####",
  "#......#........#......#",
  "#..@...#..%%%%..#...@..#",
  "#......#........#......#",
  "#.........#..#.........#",
  "#S..%%....#..#....%%..S#",
  "#S..%%....#..#....%%..S#",
  "#.........#..#.........#",
  "#......#........#......#",
  "#..@...#..%%%%..#...@..#",
  "#......#........#......#",
  "####..###..##..###..####",
  "#......................#",
  "#..%%..............%%..#",
  "#..%%..#..@..@..#..%%..#",
  "#......#........#......#",
  "#S.....#........#.....S#",
  "########################",
];

export interface GameMap {
  width: number;
  height: number;
  /** 0 = floor, 1..3 = wall type. Row-major. */
  cells: Uint8Array;
  spawns: { x: number; y: number }[];
}

const WALL_TYPES: Record<string, number> = { "#": 1, "%": 2, "@": 3 };

export function parseMap(rows: string[] = ARENA): GameMap {
  const height = rows.length;
  const width = rows[0].length;
  const cells = new Uint8Array(width * height);
  const spawns: { x: number; y: number }[] = [];
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`Map row ${y} has length ${row.length}, expected ${width}`);
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      cells[y * width + x] = WALL_TYPES[ch] ?? 0;
      if (ch === "S") spawns.push({ x: x + 0.5, y: y + 0.5 });
    }
  });
  return { width, height, cells, spawns };
}

export function wallAt(map: GameMap, cx: number, cy: number): number {
  if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return 1;
  return map.cells[cy * map.width + cx];
}

export function isWall(map: GameMap, x: number, y: number): boolean {
  return wallAt(map, Math.floor(x), Math.floor(y)) !== 0;
}

export interface RayHit {
  dist: number;
  /** 0 = hit a vertical (x) grid line, 1 = horizontal (y). */
  side: 0 | 1;
  wall: number;
  /** 0..1 position along the wall face (for texturing / edge lines). */
  u: number;
}

/** DDA grid raycast. Returns the perpendicular-free Euclidean distance to the first wall. */
export function castRay(map: GameMap, ox: number, oy: number, angle: number, maxDist = 64): RayHit {
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
    if (w !== 0) {
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
    isWall(map, px - r, py - r) ||
    isWall(map, px + r, py - r) ||
    isWall(map, px - r, py + r) ||
    isWall(map, px + r, py + r);
  let nx = x + dx;
  if (blocked(nx, y)) nx = x;
  let ny = y + dy;
  if (blocked(nx, ny)) ny = y;
  return { x: nx, y: ny };
}

export function floorCells(map: GameMap): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) if (map.cells[y * map.width + x] === 0) out.push({ x, y });
  return out;
}
