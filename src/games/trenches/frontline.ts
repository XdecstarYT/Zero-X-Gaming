import { createRng } from "../engine/rng";
import { GROUND, SOLID, type Building, type GameMap, type MapDecor } from "../neon-siege/map";
import type { Battlefield, Flag } from "./battlefield";
import { FRONTS } from "./fronts";

/**
 * Cape Helles: the Frontline map. Not mirrored: a long corridor from the sea
 * (west) to the enemy headquarters (east), fought for objective by objective:
 *
 *   sea | W Beach (wire, MG bunkers) | bluffs | Sedd el Bahr | fields |
 *   Krithia (church) | no-man's-land | enemy trench line | HQ fort | defenders' base
 */

export function generateFrontline(seed = 1915): Battlefield {
  const def = FRONTS.helles;
  const W = def.width;
  const H = def.height;
  const rng = createRng(seed);
  const cells = new Uint8Array(W * H);
  const ground = new Uint8Array(W * H).fill(GROUND.dirt);
  const idx = (x: number, y: number) => y * W + x;
  const inside = (x: number, y: number) => x > 0 && y > 0 && x < W - 1 && y < H - 1;
  const setC = (x: number, y: number, v: number) => {
    if (inside(x, y)) cells[idx(x, y)] = v;
  };
  const setG = (x: number, y: number, v: number) => {
    if (inside(x, y)) ground[idx(x, y)] = v;
  };
  const getC = (x: number, y: number) => (inside(x, y) ? cells[idx(x, y)] : SOLID.perimeter);
  const isTrench = (x: number, y: number) => inside(x, y) && ground[idx(x, y)] === GROUND.trench;
  const free = (x: number, y: number) => inside(x, y) && getC(x, y) === 0 && !isTrench(x, y) && ground[idx(x, y)] !== GROUND.floor;
  const buildings: Building[] = [];
  const craters: MapDecor["craters"] = [];
  const cy = Math.floor(H / 2);

  // Ground bands: sand on the beach, scrubby grass in the fields, churned dirt in no-man's-land.
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (x < 36) setG(x, y, GROUND.sand);
      else if (x > 96 && x < 110) setG(x, y, GROUND.grass);
      else if (rng.next() < 0.08) setG(x, y, GROUND.grass);
    }
  // Roads through both villages.
  for (let x = 36; x < 168; x++) for (const y of [cy - 1, cy]) if (!(x > 96 && x < 110)) setG(x, y, GROUND.road);

  // ------------------------------------------------------------- W Beach
  for (let y = 2; y < H - 2; y++) {
    if (y % 9 > 1) setC(18, y, SOLID.wire);
    if ((y + 4) % 9 > 1) setC(23, y, SOLID.wire);
  }
  for (let i = 0; i < 18; i++) {
    const x = rng.int(12, 30);
    const y = rng.int(3, H - 4);
    if (free(x, y)) setC(x, y, SOLID.rock);
  }
  bunker(28, 12);
  bunker(28, H - 17);
  // Bluffs above the beach, with three gullies up.
  for (let y = 1; y < H - 1; y++) {
    const gully = Math.abs(y - 12) < 3 || Math.abs(y - cy) < 3 || Math.abs(y - (H - 13)) < 3;
    if (!gully) for (const x of [36, 37]) if (rng.next() < 0.85) setC(x, y, SOLID.rock);
  }

  // ------------------------------------------------------------ villages
  village(44, 92, 0.75);
  village(112, 164, 0.9);
  // A church in Krithia's square (north side).
  ruin({ x: 132, y: cy - 16, w: 12, h: 9, material: "brick", floors: 2 });
  // Hedgerows and trees in the fields between.
  for (let x = 98; x < 110; x += 5) for (let y = 3; y < H - 3; y++) if (Math.abs(y - cy) > 3 && y % 11 > 2 && rng.next() < 0.8) setC(x, y, SOLID.shrub);
  for (let i = 0; i < 10; i++) {
    const x = rng.int(97, 109);
    const y = rng.int(3, H - 4);
    if (free(x, y)) setC(x, y, SOLID.tree);
  }

  // ------------------------------------------------------ no-man's-land
  for (let i = 0; i < 40; i++) {
    const x = rng.range(168, 204);
    const y = rng.range(3, H - 3);
    const r = rng.range(1, 2.6);
    const water = r > 1.8 && rng.next() < 0.3;
    craters.push({ x, y, r, water });
    if (water)
      for (let yy = Math.floor(y - r * 0.6); yy <= y + r * 0.6; yy++)
        for (let xx = Math.floor(x - r * 0.6); xx <= x + r * 0.6; xx++) if (Math.hypot(xx + 0.5 - x, yy + 0.5 - y) < r * 0.6 && free(xx, yy)) setC(xx, yy, SOLID.water);
  }
  for (let i = 0; i < 14; i++) {
    const x = rng.int(168, 205);
    const y = rng.int(3, H - 4);
    if (free(x, y)) setC(x, y, SOLID.tree);
  }
  for (let y = 2; y < H - 2; y++) {
    if (y % 10 > 1) setC(200, y, SOLID.wire);
    if ((y + 5) % 10 > 1) setC(203, y, SOLID.wire);
  }
  // The enemy line: a zigzag fire trench and a support trench with communication trenches.
  const zig = (x0: number, bay: number) => (y: number) => x0 + (Math.floor(y / bay) % 2 ? 3 : 0);
  const front = zig(208, 6);
  const support = zig(222, 8);
  for (let y = 2; y < H - 2; y++) {
    for (const at of [front, support]) {
      const tx = at(y);
      for (let x = tx; x < tx + 2; x++) setG(x, y, GROUND.trench);
      if (y > 2 && at(y - 1) !== tx) for (let x = Math.min(at(y - 1), tx); x <= Math.max(at(y - 1), tx) + 1; x++) setG(x, y, GROUND.trench);
    }
  }
  for (const y of [10, cy, H - 11]) for (let x = front(y); x <= support(y); x++) {
    setG(x, y, GROUND.trench);
    setG(x, y + 1, GROUND.trench);
  }
  for (let y = 6; y < H - 6; y += 12) {
    setC(front(y) - 1, y, SOLID.sandbag);
    setC(front(y) - 1, y + 1, SOLID.sandbag);
  }

  // ------------------------------------------------------------------ HQ
  const hq: Building = { x: 244, y: cy - 10, w: 24, h: 20, material: "concrete", floors: 1 };
  buildings.push(hq);
  for (let y = hq.y; y < hq.y + hq.h; y++)
    for (let x = hq.x; x < hq.x + hq.w; x++) {
      const edge = x === hq.x || y === hq.y || x === hq.x + hq.w - 1 || y === hq.y + hq.h - 1;
      const wing = (y === hq.y + 6 || y === hq.y + hq.h - 7) && (x < hq.x + 7 || x > hq.x + hq.w - 8);
      if (edge || wing) setC(x, y, SOLID.concrete);
      else {
        setC(x, y, 0);
        setG(x, y, GROUND.floor);
      }
    }
  // Gates on every side, doors through the wings.
  for (const y of [cy - 1, cy]) {
    setC(hq.x, y, 0);
    setC(hq.x + hq.w - 1, y, 0);
  }
  for (const x of [hq.x + 11, hq.x + 12]) {
    setC(x, hq.y, 0);
    setC(x, hq.y + hq.h - 1, 0);
  }
  for (const x of [hq.x + 3, hq.x + hq.w - 4]) {
    setC(x, hq.y + 6, 0);
    setC(x, hq.y + hq.h - 7, 0);
  }
  // Wire around the HQ, with lanes.
  for (let y = 2; y < H - 2; y++) if (y % 8 > 1) setC(238, y, SOLID.wire);
  bunker(234, 8);
  bunker(234, H - 13);
  for (let i = 0; i < 8; i++) {
    const x = rng.int(270, W - 3);
    const y = rng.int(3, H - 4);
    if (free(x, y)) setC(x, y, SOLID.crate);
  }

  // Perimeter.
  for (let x = 0; x < W; x++) {
    cells[idx(x, 0)] = SOLID.perimeter;
    cells[idx(x, H - 1)] = SOLID.perimeter;
  }
  for (let y = 0; y < H; y++) {
    cells[idx(0, y)] = SOLID.perimeter;
    cells[idx(W - 1, y)] = SOLID.perimeter;
  }

  // ------------------------------------------------------- objectives
  const flags: Flag[] = [
    { id: "1", name: "W Beach", x: 31.5, y: cy + 0.5, r: 6 },
    { id: "2", name: "Sedd el Bahr", x: 68.5, y: cy + 0.5, r: 6 },
    { id: "3", name: "Krithia", x: 138.5, y: cy + 0.5, r: 6 },
    { id: "4", name: "The Line", x: front(cy) + 1, y: cy + 0.5, r: 6 },
    { id: "5", name: "Headquarters", x: hq.x + hq.w / 2, y: cy + 0.5, r: 6 },
  ];
  for (const f of flags)
    for (let y = Math.floor(f.y - 4); y <= f.y + 4; y++)
      for (let x = Math.floor(f.x - 4); x <= f.x + 4; x++) {
        const c = getC(x, y);
        if (Math.hypot(x + 0.5 - f.x, y + 0.5 - f.y) <= 3.6 && inside(x, y) && c !== SOLID.brick && c !== SOLID.concrete && c !== SOLID.perimeter) cells[idx(x, y)] = 0;
      }

  // Spawns: attackers on the waterline, defenders behind the HQ.
  const base1: { x: number; y: number }[] = [];
  const base2: { x: number; y: number }[] = [];
  for (let y = 4; y < H - 4; y += 3) {
    for (const x of [4, 7, 10]) if (!cells[idx(x, y)]) base1.push({ x: x + 0.5, y: y + 0.5 });
    for (const x of [271, 274, 277]) if (!cells[idx(x, y)] && !isTrench(x, y)) base2.push({ x: x + 0.5, y: y + 0.5 });
  }
  // Every objective reachable from both ends.
  for (const f of flags) for (const b of [base1[Math.floor(base1.length / 2)], base2[Math.floor(base2.length / 2)]]) if (!reachable(b, f)) carve(b, f);

  const map: GameMap = {
    name: def.name,
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
    front: def.theme,
    decor: { craters },
    dug: [],
  };
  return { front: "helles", map, flags, bases: [base1, base2] };

  // ------------------------------------------------------------- helpers

  function bunker(x: number, y: number) {
    const b: Building = { x, y, w: 5, h: 5, material: "concrete", floors: 1 };
    buildings.push(b);
    for (let yy = y; yy < y + 5; yy++)
      for (let xx = x; xx < x + 5; xx++) {
        const edge = xx === x || yy === y || xx === x + 4 || yy === y + 4;
        if (edge) setC(xx, yy, SOLID.concrete);
        else {
          setC(xx, yy, 0);
          setG(xx, yy, GROUND.floor);
        }
      }
    // Firing slit side (west) stays shut; the door faces east.
    setC(x + 4, y + 2, 0);
  }

  function ruin(b: Building) {
    buildings.push(b);
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++) {
        if (!inside(x, y)) continue;
        const edge = x === b.x || y === b.y || x === b.x + b.w - 1 || y === b.y + b.h - 1;
        if (edge && rng.next() < 0.75) setC(x, y, SOLID.brick);
        else {
          setC(x, y, 0);
          setG(x, y, GROUND.floor);
        }
      }
    setC(b.x + Math.floor(b.w / 2), b.y + b.h - 1, 0);
    setC(b.x, b.y + Math.floor(b.h / 2), 0);
    setC(b.x + b.w - 1, b.y + Math.floor(b.h / 2), 0);
  }

  /** Rows of shelled houses on both sides of the main street, with side streets. */
  function village(x0: number, x1: number, density: number) {
    for (let x = x0; x < x1 - 6; x += 9) {
      if (Math.abs(x + 4 - (x0 + x1) / 2) < 6) continue; // the square
      for (const side of [-1, 1]) {
        let y = side < 0 ? cy - 5 : cy + 3;
        for (let row = 0; row < 3; row++) {
          const w = rng.int(5, 7);
          const h = rng.int(4, 6);
          const by = side < 0 ? y - h : y;
          if (rng.next() < density && by > 2 && by + h < H - 2) ruin({ x: x + rng.int(0, 2), y: by, w, h, material: "brick", floors: rng.next() < 0.3 ? 2 : 1 });
          y += side * (h + 4);
        }
      }
    }
    for (let i = 0; i < 10; i++) {
      const x = rng.int(x0, x1);
      const y = rng.int(3, H - 4);
      if (free(x, y) && Math.abs(y - cy) > 2) setC(x, y, SOLID.crate);
    }
  }

  function reachable(from: { x: number; y: number }, to: { x: number; y: number }) {
    const seen = new Uint8Array(W * H);
    const start = idx(Math.floor(from.x), Math.floor(from.y));
    const goal = idx(Math.floor(to.x), Math.floor(to.y));
    const q = [start];
    seen[start] = 1;
    while (q.length) {
      const i = q.pop()!;
      if (i === goal) return true;
      const x = i % W;
      for (const n of [i - 1, i + 1, i - W, i + W]) {
        if (n < 0 || n >= W * H || seen[n] || cells[n] !== 0) continue;
        if ((n === i - 1 && x === 0) || (n === i + 1 && x === W - 1)) continue;
        seen[n] = 1;
        q.push(n);
      }
    }
    return false;
  }

  function carve(from: { x: number; y: number }, to: { x: number; y: number }) {
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 2);
    for (let i = 0; i <= steps; i++) {
      const x = Math.floor(from.x + ((to.x - from.x) * i) / steps);
      const y = Math.floor(from.y + ((to.y - from.y) * i) / steps);
      for (const [dx, dy] of [
        [0, 0],
        [0, 1],
      ])
        if (inside(x + dx, y + dy)) cells[idx(x + dx, y + dy)] = 0;
    }
  }
}
