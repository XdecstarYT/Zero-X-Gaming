import { createRng } from "../engine/rng";
import { GROUND, SOLID, type Building, type GameMap, type MapDecor } from "../neon-siege/map";
import { generateFrontline } from "./frontline";
import { DEFAULT_FRONT, FRONTS, type FrontId } from "./fronts";

/**
 * Battlefield generator for the Trenches fronts. The west half is laid out and
 * point-mirrored onto the east half, so both armies get the same ground:
 *
 *   base (dugouts) | support trench | communication trenches | front trench
 *   (fire bays, saps, MG nests) | wire belts | no-man's-land (craters, the
 *   front's own set piece) | centre ... mirrored.
 *
 * Trenches are walkable GROUND.trench cells: the renderer sinks them 1.3 m
 * into the earth and the match gives soldiers inside them cover.
 */

export type Team = 1 | 2;

export interface Flag {
  id: string;
  /** Objective name (Frontline), e.g. "W Beach". */
  name?: string;
  x: number;
  y: number;
  /** Capture radius (cells). */
  r: number;
}

export interface Battlefield {
  front: FrontId;
  map: GameMap;
  flags: Flag[];
  /** Spawn points per team (index 0 = team 1). */
  bases: { x: number; y: number }[][];
  /** Emplaced Vickers guns: where the gunner stands, which way it faces, whose line it's on. */
  mgs?: { x: number; y: number; a: number; team: Team }[];
}

const BASE_W = 10;

export function generateBattlefield(id: FrontId = DEFAULT_FRONT, seed?: number): Battlefield {
  if (id === "helles") return generateFrontline(seed);
  const def = FRONTS[id];
  const W = def.width;
  const H = def.height;
  const half = Math.floor(W / 2);
  const rng = createRng(seed ?? hash(id));
  const cells = new Uint8Array(W * H);
  const ground = new Uint8Array(W * H).fill(GROUND.dirt);
  const idx = (x: number, y: number) => y * W + x;
  const inside = (x: number, y: number) => x > 0 && y > 0 && x < W - 1 && y < H - 1;
  const west = (x: number, y: number) => inside(x, y) && x < half;
  const setC = (x: number, y: number, v: number) => {
    if (west(x, y)) cells[idx(x, y)] = v;
  };
  const setG = (x: number, y: number, v: number) => {
    if (west(x, y)) ground[idx(x, y)] = v;
  };
  const getC = (x: number, y: number) => (inside(x, y) ? cells[idx(x, y)] : SOLID.perimeter);
  const getG = (x: number, y: number) => (inside(x, y) ? ground[idx(x, y)] : GROUND.dirt);
  const trench = (x: number, y: number) => {
    if (!west(x, y)) return;
    ground[idx(x, y)] = GROUND.trench;
    cells[idx(x, y)] = 0;
  };
  const isTrench = (x: number, y: number) => getG(x, y) === GROUND.trench;
  const buildings: Building[] = [];
  const craters: MapDecor["craters"] = [];
  const covered: number[] = [];

  // ---------------------------------------------------------------- ground
  // Base: a firm track; a second soil tone in blotches over no-man's-land.
  const baseGround = id === "gallipoli" ? GROUND.sand : id === "vimy" ? GROUND.snow : GROUND.road;
  const openGround = id === "vimy" ? GROUND.snow : id === "gallipoli" ? GROUND.sand : GROUND.dirt;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < half; x++) setG(x, y, openGround);
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < BASE_W; x++) setG(x, y, baseGround);
  for (let i = 0; i < Math.round((W * H) / 700); i++) {
    const cx = rng.int(BASE_W, half);
    const cy = rng.int(2, H - 3);
    const r = rng.range(2, 6);
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if (Math.hypot(x - cx, y - cy) <= r * rng.range(0.7, 1) && getG(x, y) === openGround) setG(x, y, GROUND.grass);
  }

  // -------------------------------------------------------------- trenches
  const frontX = Math.round(BASE_W + (half - BASE_W) * def.frontLine * 0.75);
  const supportX = Math.round(BASE_W + 3 + (frontX - BASE_W - 3) * 0.35);
  /** A zigzag fire trench, two cells wide, with traverses every `bay` rows. */
  const zigzag = (x0: number, bay: number, amp: number) => {
    const at = (y: number) => x0 + (Math.floor(y / bay) % 2 ? amp : 0);
    for (let y = 3; y < H - 3; y++) {
      const tx = at(y);
      trench(tx, y);
      trench(tx + 1, y);
      if (y > 3 && at(y - 1) !== tx) for (let x = Math.min(at(y - 1), tx); x <= Math.max(at(y - 1), tx) + 1; x++) trench(x, y);
    }
    return at;
  };
  const frontAt = zigzag(frontX, 6, 3);
  const supportAt = zigzag(supportX, 9, 2);
  // Communication trenches: base → support → front, with a dog-leg.
  const commRows: number[] = [];
  for (let y = 8; y < H - 8; y += Math.max(14, Math.floor(H / 6))) commRows.push(y);
  for (const y of commRows) {
    const jog = rng.next() < 0.5 ? 2 : -2;
    const mid = Math.round((BASE_W + supportAt(y)) / 2);
    for (let x = BASE_W - 1; x <= supportAt(y); x++) {
      const yy = x < mid ? y : y + jog;
      trench(x, yy);
      trench(x, yy + 1);
      if (x === mid) for (let k = Math.min(y, y + jog); k <= Math.max(y, y + jog) + 1; k++) trench(x, k);
    }
    const y2 = y + 4;
    for (let x = supportAt(y2); x <= frontAt(y2); x++) {
      trench(x, y2);
      trench(x, y2 + 1);
    }
  }
  // Saps: short trenches pushed out into no-man's-land, ending at a listening post.
  for (let y = 10; y < H - 10; y += 17) {
    const x0 = frontAt(y) + 2;
    const len = rng.int(5, 9);
    for (let x = x0; x < x0 + len; x++) trench(x, y);
    trench(x0 + len - 1, y + 1);
    trench(x0 + len, y + 1);
  }
  // MG nests: sandbag blocks on the front trench's enemy lip, with room to fire around them;
  // every other nest has an emplaced Vickers in the trench beside the sandbags.
  const guns: { x: number; y: number }[] = [];
  for (let y = 6; y < H - 6; y += 12) {
    const x = frontAt(y) + 2;
    if (isTrench(x, y)) continue;
    setC(x, y, SOLID.sandbag);
    setC(x, y + 1, SOLID.sandbag);
    if (((y - 6) / 12) % 2 === 0 && isTrench(x - 1, y + 2) && !isTrench(x, y + 2)) guns.push({ x: x - 1 + 0.5, y: y + 2 + 0.5 });
  }
  // Gallipoli: the Lone Pine trenches were roofed with timber.
  if (id === "gallipoli")
    for (let y = Math.floor(H * 0.3); y < H * 0.55; y++)
      for (let x = frontAt(y); x <= frontAt(y) + 1; x++) if (isTrench(x, y)) covered.push(idx(x, y));

  // Dugouts behind the support line: concrete shelters with a doorway facing the trench.
  for (let y = 6; y < H - 10; y += Math.max(18, Math.floor(H / 4))) {
    const b: Building = { x: BASE_W + 1, y, w: 5, h: 4, material: "concrete", floors: 1 };
    if (b.x + b.w >= supportX - 1) continue;
    let clash = false;
    for (let yy = b.y - 1; yy <= b.y + b.h; yy++) for (let xx = b.x - 1; xx <= b.x + b.w; xx++) if (isTrench(xx, yy)) clash = true;
    if (clash) continue;
    addBuilding(b, [[b.x + b.w - 1, b.y + 1]]);
  }

  // ------------------------------------------------------------------ wire
  const wireA = frontX + 7;
  const wireB = frontX + 9;
  for (let y = 2; y < H - 2; y++) {
    if (y % 11 > 1 && !isTrench(wireA, y)) setC(wireA, y, SOLID.wire);
    if ((y + 5) % 11 > 1 && !isTrench(wireB, y)) setC(wireB, y, SOLID.wire);
  }

  // ------------------------------------------------------------- set piece
  const nmlX0 = wireB + 2;
  const cx = half;
  const cy = Math.floor(H / 2);
  switch (id) {
    case "somme": {
      // Ruined village around the centre square.
      const houses = [
        { x: cx - 13, y: cy - 12, w: 6, h: 5 },
        { x: cx - 14, y: cy + 4, w: 5, h: 6 },
        { x: cx - 6, y: cy - 16, w: 5, h: 5 },
        { x: cx - 7, y: cy + 11, w: 6, h: 5 },
      ];
      for (const h of houses) ruin({ ...h, material: "brick", floors: 1 });
      // Lochnagar: the great mine crater, north of the village.
      bigCrater(cx - 22, Math.floor(H * 0.2), 7);
      craterField(nmlX0, cx - 6, 34, 0.1);
      scatter(SOLID.tree, 16, nmlX0, cx);
      break;
    }
    case "verdun": {
      // The fort: a concrete ring with casemates, straddling the centre.
      fort(cx - 9, cy - 11, 9, 22);
      craterField(nmlX0, cx - 10, 40, 0);
      // Shattered forest.
      scatter(SOLID.tree, 120, BASE_W + 2, cx - 10);
      break;
    }
    case "passchendaele": {
      // Ruined church at the centre.
      ruin({ x: cx - 6, y: cy - 7, w: 6, h: 14, material: "brick", floors: 2 });
      // Concrete pillboxes in no-man's-land.
      for (const [px, py] of [
        [cx - 18, Math.floor(H * 0.22)],
        [cx - 16, Math.floor(H * 0.7)],
      ])
        addBuilding({ x: px, y: py, w: 4, h: 4, material: "concrete", floors: 1 }, [[px, py + 1]]);
      craterField(nmlX0, cx - 7, 46, 0.6);
      // Duckboard tracks from the front to the church.
      for (const y0 of [Math.floor(H * 0.3), Math.floor(H * 0.62)]) {
        let y = y0;
        for (let x = frontX + 2; x < cx - 6; x++) {
          if (rng.next() < 0.15) y += rng.next() < 0.5 ? -1 : 1;
          y = Math.max(3, Math.min(H - 4, y));
          for (const yy of [y, y + 1]) {
            if (getC(x, yy) === SOLID.water || getC(x, yy) === SOLID.wire) setC(x, yy, 0);
            if (!isTrench(x, yy) && getC(x, yy) === 0) setG(x, yy, GROUND.duck);
          }
        }
      }
      scatter(SOLID.tree, 12, nmlX0, cx);
      break;
    }
    case "vimy": {
      // A chain of mine craters across no-man's-land.
      for (const [fy, r] of [
        [0.18, 5],
        [0.42, 6],
        [0.7, 5],
        [0.9, 4],
      ] as const)
        bigCrater(cx - 9 + rng.int(-2, 2), Math.floor(H * fy), r);
      // Tunnel entrances (concrete) behind the support trench.
      craterField(nmlX0, cx - 4, 26, 0);
      scatter(SOLID.tree, 10, nmlX0, cx);
      scatter(SOLID.rock, 18, nmlX0, cx);
      break;
    }
    case "argonne": {
      // Dense autumn forest, a rocky ravine across no-man's-land, and the old mill at the centre.
      scatter(SOLID.tree, 230, BASE_W + 2, cx - 1);
      for (let x = nmlX0; x < cx - 4; x++) {
        const ry = Math.round(H * 0.34 + Math.sin(x * 0.35) * 2);
        for (const yy of [ry - 2, ry + 3]) if (free(x, yy) && rng.next() < 0.75) setC(x, yy, SOLID.rock);
        for (let yy = ry - 1; yy <= ry + 2; yy++) if (west(x, yy) && getC(x, yy) === SOLID.tree) setC(x, yy, 0);
      }
      ruin({ x: cx - 7, y: cy - 6, w: 7, h: 12, material: "brick", floors: 2 });
      addBuilding({ x: cx - 20, y: Math.floor(H * 0.72), w: 5, h: 4, material: "concrete", floors: 1 }, [[cx - 20, Math.floor(H * 0.72) + 1]]);
      craterField(nmlX0, cx - 8, 22, 0.2);
      scatter(SOLID.shrub, 60, nmlX0, cx - 1);
      break;
    }
    case "gallipoli": {
      // Scrub, rocky gullies and a few stunted pines.
      scatter(SOLID.shrub, 150, BASE_W + 1, cx - 1);
      for (let g = 0; g < 4; g++) {
        let x = rng.int(BASE_W + 4, cx - 6);
        let y = rng.int(4, H - 5);
        const dx = rng.range(-1, 1);
        const dy = rng.range(-1, 1);
        for (let i = 0; i < 14; i++) {
          if (!isTrench(Math.round(x), Math.round(y)) && rng.next() < 0.7) setC(Math.round(x), Math.round(y), SOLID.rock);
          x += dx;
          y += dy;
        }
      }
      scatter(SOLID.tree, 10, BASE_W + 1, cx - 2);
      craterField(nmlX0, cx - 1, 14, 0);
      break;
    }
  }

  // Wreckage and ammunition dumps.
  scatter(SOLID.crate, Math.round(H / 8), BASE_W, frontX - 2);

  // ---------------------------------------------------------------- mirror
  for (let y = 0; y < H; y++)
    for (let x = 0; x < half; x++) {
      const mx = W - 1 - x;
      const my = H - 1 - y;
      cells[idx(mx, my)] = cells[idx(x, y)];
      ground[idx(mx, my)] = ground[idx(x, y)];
    }
  // Odd widths: the centre column copies its west neighbour.
  if (W % 2)
    for (let y = 0; y < H; y++) {
      cells[idx(half, y)] = cells[idx(half - 1, y)] === SOLID.brick || cells[idx(half - 1, y)] === SOLID.concrete ? cells[idx(half - 1, y)] : 0;
      ground[idx(half, y)] = ground[idx(half - 1, y)];
    }
  const mirrorB = (b: Building): Building => ({ ...b, x: W - b.x - b.w, y: H - b.y - b.h });
  const west0 = buildings.length;
  for (let i = 0; i < west0; i++) {
    const b = buildings[i];
    // Buildings touching the centre line are mirrored into one whole building.
    if (b.x + b.w >= half) buildings[i] = { ...b, w: W - 2 * b.x };
    else buildings.push(mirrorB(b));
  }
  for (const c of [...craters]) craters.push({ ...c, x: W - c.x, y: H - c.y });
  for (const i of [...covered]) {
    const x = i % W;
    const y = Math.floor(i / W);
    covered.push(idx(W - 1 - x, H - 1 - y));
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

  // ------------------------------------------------------- flags & spawns
  const xA = Math.round(half - W * 0.16);
  const xB = Math.round(half - W * 0.09);
  const flags: Flag[] = [
    { id: "A", x: xA + 0.5, y: Math.round(H * 0.22) + 0.5, r: 4 },
    { id: "B", x: xB + 0.5, y: Math.round(H * 0.76) + 0.5, r: 4 },
    { id: "C", x: W / 2, y: H / 2, r: 5 },
    { id: "D", x: W - xB - 0.5, y: H - Math.round(H * 0.76) - 0.5, r: 4 },
    { id: "E", x: W - xA - 0.5, y: H - Math.round(H * 0.22) - 0.5, r: 4 },
  ];
  // Keep flag zones clear of clutter (walls of set pieces stay).
  for (const f of flags)
    for (let y = Math.floor(f.y - 3); y <= f.y + 3; y++)
      for (let x = Math.floor(f.x - 3); x <= f.x + 3; x++) {
        const c = getC(x, y);
        if (Math.hypot(x + 0.5 - f.x, y + 0.5 - f.y) <= 2.6 && inside(x, y) && c !== SOLID.brick && c !== SOLID.concrete) cells[idx(x, y)] = 0;
      }

  const base1: { x: number; y: number }[] = [];
  for (let y = 4; y < H - 4; y += 3) for (const x of [3, 5, 7]) if (!cells[idx(x, y)] && !isTrench(x, y)) base1.push({ x: x + 0.5, y: y + 0.5 });
  const base2 = base1.map((p) => ({ x: W - p.x, y: H - p.y }));

  // Every flag must be reachable from both bases: carve a lane through anything in the way.
  for (const f of flags) {
    for (const b of [base1[Math.floor(base1.length / 2)], base2[Math.floor(base2.length / 2)]]) {
      if (reachable(cells, W, H, b, f)) continue;
      carve(b, f);
    }
  }

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
    decor: { craters, covered },
    dug: [],
  };
  // Emplaced guns: the west line's face east (team 1); mirrored ones face west (team 2).
  const mgs = [
    ...guns.map((g) => ({ x: g.x, y: g.y, a: 0, team: 1 as Team })),
    ...guns.map((g) => ({ x: W - g.x, y: H - g.y, a: Math.PI, team: 2 as Team })),
  ];
  return { front: id, map, flags, bases: [base1, base2], mgs };

  // ------------------------------------------------------------- helpers

  function free(x: number, y: number) {
    return west(x, y) && getC(x, y) === 0 && !isTrench(x, y) && getG(x, y) !== GROUND.floor;
  }

  function scatter(type: number, n: number, x0: number, x1: number) {
    for (let i = 0; i < n; i++) {
      const x = rng.int(x0, Math.max(x0 + 1, x1));
      const y = rng.int(2, H - 3);
      if (!free(x, y)) continue;
      // Keep a clear lip around trenches so they stay usable.
      if (isTrench(x + 1, y) || isTrench(x - 1, y) || isTrench(x, y + 1) || isTrench(x, y - 1)) continue;
      setC(x, y, type);
      if (type === SOLID.crate && rng.next() < 0.5 && free(x + 1, y)) setC(x + 1, y, SOLID.crate);
      if (type === SOLID.shrub && rng.next() < 0.5 && free(x, y + 1)) setC(x, y + 1, SOLID.shrub);
    }
  }

  function craterField(x0: number, x1: number, n: number, waterChance: number) {
    for (let i = 0; i < n; i++) {
      const x = rng.range(x0, x1);
      const y = rng.range(3, H - 3);
      const r = rng.range(1, 2.8);
      if (isTrench(Math.floor(x), Math.floor(y))) continue;
      const water = r > 1.6 && rng.next() < waterChance;
      craters.push({ x, y, r, water });
      if (water)
        for (let yy = Math.floor(y - r * 0.6); yy <= y + r * 0.6; yy++)
          for (let xx = Math.floor(x - r * 0.6); xx <= x + r * 0.6; xx++)
            if (Math.hypot(xx + 0.5 - x, yy + 0.5 - y) < r * 0.6 && free(xx, yy)) setC(xx, yy, SOLID.water);
    }
  }

  function bigCrater(x: number, y: number, r: number) {
    craters.push({ x: x + 0.5, y: y + 0.5, r });
    for (let a = 0; a < 24; a++) {
      if (rng.next() < 0.45) continue;
      const rx = Math.round(x + Math.cos((a / 24) * Math.PI * 2) * (r + 0.6));
      const ry = Math.round(y + Math.sin((a / 24) * Math.PI * 2) * (r + 0.6));
      if (free(rx, ry)) setC(rx, ry, SOLID.rock);
    }
    // Clear the bowl.
    for (let yy = y - r; yy <= y + r; yy++)
      for (let xx = x - r; xx <= x + r; xx++) if (Math.hypot(xx - x, yy - y) < r - 0.5 && west(xx, yy) && getC(xx, yy) !== SOLID.brick) setC(xx, yy, 0);
  }

  function addBuilding(b: Building, doors: [number, number][]) {
    buildings.push(b);
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++) {
        const edge = x === b.x || y === b.y || x === b.x + b.w - 1 || y === b.y + b.h - 1;
        if (edge) setC(x, y, b.material === "brick" ? SOLID.brick : SOLID.concrete);
        else {
          setC(x, y, 0);
          setG(x, y, GROUND.floor);
        }
      }
    for (const [x, y] of doors) {
      setC(x, y, 0);
      setC(x, y + 1, 0);
      setG(x, y, GROUND.floor);
      setG(x, y + 1, GROUND.floor);
    }
  }

  /** A shelled building: walls with gaps, open to the sky (the renderer draws ruins). */
  function ruin(b: Building) {
    buildings.push(b);
    const x1 = Math.min(b.x + b.w, half + 1);
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < x1; x++) {
        if (!west(x, y)) continue;
        const edge = x === b.x || y === b.y || x === b.x + b.w - 1 || y === b.y + b.h - 1;
        if (edge && rng.next() < 0.72) setC(x, y, SOLID.brick);
        else {
          setC(x, y, 0);
          setG(x, y, GROUND.floor);
        }
      }
    // Always a way in from each side.
    const my = b.y + Math.floor(b.h / 2);
    setC(b.x, my, 0);
    setC(b.x, my - 1, 0);
    const mx = b.x + Math.floor(b.w / 2);
    setC(mx, b.y, 0);
    setC(mx, b.y + b.h - 1, 0);
  }

  /** Fort: concrete outer wall, a courtyard and casemates, entrances on every side. */
  function fort(x: number, y: number, w: number, h: number) {
    buildings.push({ x, y, w, h, material: "concrete", floors: 1 });
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        const edge = xx === x || yy === y || yy === y + h - 1;
        const casemate = (xx === x + 3 && (yy < y + 6 || yy > y + h - 7)) || (yy === y + 5 && xx < x + 4) || (yy === y + h - 6 && xx < x + 4);
        if (edge || casemate) setC(xx, yy, SOLID.concrete);
        else {
          setC(xx, yy, 0);
          setG(xx, yy, GROUND.floor);
        }
      }
    for (const yy of [y + 2, y + Math.floor(h / 2), y + h - 3]) {
      setC(x, yy, 0);
      setC(x, yy + 1, 0);
    }
    setC(x + 1, y + 2, 0);
    setC(x + w - 3, y, 0);
    setC(x + w - 2, y, 0);
    setC(x + w - 3, y + h - 1, 0);
    setC(x + w - 2, y + h - 1, 0);
    setC(x + 3, y + 2, 0);
    setC(x + 3, y + h - 3, 0);
  }

  function carve(from: { x: number; y: number }, to: { x: number; y: number }) {
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 2);
    for (let i = 0; i <= steps; i++) {
      const x = Math.floor(from.x + ((to.x - from.x) * i) / steps);
      const y = Math.floor(from.y + ((to.y - from.y) * i) / steps);
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
      ])
        for (const [cx, cy] of [
          [x + dx, y + dy],
          [W - 1 - x - dx, H - 1 - y - dy],
        ])
          if (inside(cx, cy)) cells[idx(cx, cy)] = 0;
    }
  }
}

/** Flood fill over walkable cells. */
function reachable(cells: Uint8Array, W: number, H: number, from: { x: number; y: number }, to: { x: number; y: number }) {
  const seen = new Uint8Array(W * H);
  const start = Math.floor(from.y) * W + Math.floor(from.x);
  const goal = Math.floor(to.y) * W + Math.floor(to.x);
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

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const templates = new Map<FrontId, Battlefield>();

/**
 * A fresh battlefield for a match: the layout is generated once per front and
 * cached, but each match gets its own ground layer (digging mutates it).
 */
export function battlefield(id: FrontId = DEFAULT_FRONT): Battlefield {
  let t = templates.get(id);
  if (!t) templates.set(id, (t = generateBattlefield(id)));
  return { ...t, map: { ...t.map, ground: t.map.ground.slice(), dug: [] } };
}

