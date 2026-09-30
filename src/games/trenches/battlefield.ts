import { createRng } from "../engine/rng";
import { GROUND, SOLID, type Building, type GameMap } from "../neon-siege/map";

/**
 * "No Man's Land": a symmetric trench battlefield. The west half is generated
 * and point-mirrored onto the east half, so both teams get the same field.
 *
 *   base | trench line (sandbag parapets with firing gaps) | wire | craters,
 *   shattered trees, pillboxes | ruined farmhouse at the centre | ... mirrored
 */

export const BF_W = 84;
export const BF_H = 48;
export type Team = 1 | 2;

export interface Flag {
  id: "A" | "B" | "C";
  x: number;
  y: number;
  /** Capture radius (cells). */
  r: number;
}

export interface Battlefield {
  map: GameMap;
  flags: Flag[];
  /** Spawn points per team (index 0 = team 1). */
  bases: { x: number; y: number }[][];
}

export const BATTLEFIELD_SEED = 1916;

export function generateBattlefield(seed = BATTLEFIELD_SEED): Battlefield {
  const W = BF_W;
  const H = BF_H;
  const rng = createRng(seed);
  const cells = new Uint8Array(W * H);
  const ground = new Uint8Array(W * H).fill(GROUND.dirt);
  const idx = (x: number, y: number) => y * W + x;
  const inside = (x: number, y: number) => x > 0 && y > 0 && x < W - 1 && y < H - 1;
  const half = W / 2;
  const setC = (x: number, y: number, v: number) => {
    if (inside(x, y) && x < half) cells[idx(x, y)] = v;
  };
  const setG = (x: number, y: number, v: number) => {
    if (inside(x, y) && x < half) ground[idx(x, y)] = v;
  };
  const buildings: Building[] = [];

  // Base: a firm dugout area with a road-like track.
  for (let y = 3; y < H - 3; y++) for (let x = 2; x < 9; x++) setG(x, y, GROUND.road);
  // A mound of grass behind the lines (less churned than no-man's-land).
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < 2; x++) setG(x, y, GROUND.grass);

  // Front-line trench: zigzag, two cells wide, duckboard floor; parapet on the enemy side.
  const trenchX = (y: number) => 15 + (Math.floor(y / 6) % 2 ? 2 : 0);
  for (let y = 3; y < H - 3; y++) {
    const tx = trenchX(y);
    for (let x = tx; x < tx + 2; x++) setG(x, y, GROUND.floor);
    // Parapet with a firing gap every 3rd cell.
    if (y % 3 !== 0) setC(tx + 2, y, SOLID.sandbag);
    // Rear revetment (sandbags) with gaps for the communication trenches.
    if (y % 8 !== 4) setC(tx - 1, y, SOLID.sandbag);
    // Zig corners: close the step between segments.
    if (y % 6 === 0 && y > 3) {
      const prev = trenchX(y - 1);
      for (let x = Math.min(prev, tx); x <= Math.max(prev, tx) + 1; x++) setG(x, y, GROUND.floor);
    }
  }
  // Communication trenches from base to the front line.
  for (let y = 4; y < H - 3; y += 8) for (let x = 9; x < trenchX(y); x++) setG(x, y, GROUND.floor);

  // Barbed wire belts in front of the trench, with lanes through.
  for (let y = 2; y < H - 2; y++) if (y % 7 > 1) setC(21, y, SOLID.fence);

  // Concrete pillbox on the flank.
  const pb: Building = { x: 24, y: 6, w: 4, h: 4, material: "concrete", floors: 1 };
  buildings.push(pb);
  for (let y = pb.y; y < pb.y + pb.h; y++)
    for (let x = pb.x; x < pb.x + pb.w; x++) {
      const edge = x === pb.x || y === pb.y || x === pb.x + pb.w - 1 || y === pb.y + pb.h - 1;
      if (edge) setC(x, y, SOLID.concrete);
      else setG(x, y, GROUND.floor);
    }
  setC(pb.x, pb.y + 1, 0); // rear door (facing own lines)
  setC(pb.x, pb.y + 2, 0);

  // Craters (dirt already) ringed with rubble, shattered trees, crate stacks.
  for (let i = 0; i < 16; i++) {
    const cx = rng.int(23, half - 3);
    const cy = rng.int(3, H - 4);
    if (cells[idx(cx, cy)]) continue;
    const r = rng.int(1, 2);
    for (let a = 0; a < 6; a++) {
      const x = Math.round(cx + Math.cos(a) * (r + 1));
      const y = Math.round(cy + Math.sin(a) * (r + 1));
      if (rng.next() < 0.35) setC(x, y, SOLID.rock);
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = rng.int(20, half - 2);
    const y = rng.int(2, H - 3);
    if (!cells[idx(x, y)] && ground[idx(x, y)] === GROUND.dirt) setC(x, y, SOLID.tree);
  }
  for (let i = 0; i < 6; i++) {
    const x = rng.int(10, half - 4);
    const y = rng.int(3, H - 4);
    if (!cells[idx(x, y)] && ground[idx(x, y)] !== GROUND.floor) {
      setC(x, y, SOLID.crate);
      if (rng.next() < 0.5) setC(x + 1, y, SOLID.crate);
    }
  }

  // Ruined farmhouse straddling the centre (built on the west half, mirrored → whole).
  const fh: Building = { x: half - 5, y: H / 2 - 5, w: 5, h: 10, material: "brick", floors: 1 };
  for (let y = fh.y; y < fh.y + fh.h; y++)
    for (let x = fh.x; x < half; x++) {
      const edge = x === fh.x || y === fh.y || y === fh.y + fh.h - 1;
      if (edge && rng.next() < 0.8) setC(x, y, SOLID.brick);
      else setG(x, y, GROUND.floor);
    }
  // Doorways through the ruin (always open).
  for (const y of [fh.y + 2, fh.y + 7]) setC(fh.x, y, 0);
  for (const x of [fh.x + 2]) {
    setC(x, fh.y, 0);
    setC(x, fh.y + fh.h - 1, 0);
  }

  // Mirror the west half onto the east half (point symmetry).
  for (let y = 0; y < H; y++)
    for (let x = 0; x < half; x++) {
      const mx = W - 1 - x;
      const my = H - 1 - y;
      cells[idx(mx, my)] = cells[idx(x, y)];
      ground[idx(mx, my)] = ground[idx(x, y)];
    }
  for (const b of [...buildings]) {
    if (b === fh) continue;
    buildings.push({ ...b, x: W - b.x - b.w, y: H - b.y - b.h });
  }
  buildings.push({ ...fh, w: 10 });

  // Perimeter.
  for (let x = 0; x < W; x++) {
    cells[idx(x, 0)] = SOLID.perimeter;
    cells[idx(x, H - 1)] = SOLID.perimeter;
  }
  for (let y = 0; y < H; y++) {
    cells[idx(0, y)] = SOLID.perimeter;
    cells[idx(W - 1, y)] = SOLID.perimeter;
  }

  // Spawns: open cells in each base.
  const base1: { x: number; y: number }[] = [];
  for (let y = 4; y < H - 4; y += 3) for (const x of [3, 6]) if (!cells[idx(x, y)]) base1.push({ x: x + 0.5, y: y + 0.5 });
  const base2 = base1.map((p) => ({ x: W - p.x, y: H - p.y }));

  // Flags: A (west-north), B (centre, in the farmhouse yard), C (mirror of A).
  const flags: Flag[] = [
    { id: "A", x: 27.5, y: 13.5, r: 3 },
    { id: "B", x: W / 2, y: H / 2, r: 3 },
    { id: "C", x: W - 27.5, y: H - 13.5, r: 3 },
  ];
  // Keep flag zones clear.
  for (const f of flags)
    for (let y = Math.floor(f.y - 2); y <= f.y + 2; y++)
      for (let x = Math.floor(f.x - 2); x <= f.x + 2; x++) if (inside(x, y) && cells[idx(x, y)] !== SOLID.brick) cells[idx(x, y)] = 0;

  const map: GameMap = {
    name: "No Man's Land",
    width: W,
    height: H,
    cells,
    ground,
    buildings,
    spawns: [...base1, ...base2],
    lootSpots: [],
    chests: [],
    windows: [],
    theme: "battlefield",
  };
  return { map, flags, bases: [base1, base2] };
}

let cached: Battlefield | null = null;
export function battlefield() {
  return (cached ??= generateBattlefield());
}
