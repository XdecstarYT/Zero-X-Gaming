/**
 * The real world map: nations and cities from Natural Earth, the city grid (for "whose land is
 * this?" and for paths), and the traced territory edges (for drawing). Built by
 * scripts/sovereign/build-world.mjs into public/sovereign/.
 */
import { CITY_NAMES } from "./data";

export interface WorldNation {
  /** Index into World.nations. */
  id: number;
  iso: string;
  name: string;
  continent: string;
  sub: string;
  pop: number;
  /** GDP, $ millions a year (Natural Earth's estimate). */
  gdp: number;
  /** Natural Earth's 9-colour map scheme (neighbours differ). */
  c9: number;
}

export interface WorldCity {
  id: number;
  name: string;
  /** Starting nation (index). */
  nation: number;
  x: number;
  y: number;
  pop: number;
  /** Territory in map px. */
  area: number;
  capital: boolean;
  coastal: boolean;
  /** Cities sharing a land border. */
  near: number[];
}

/** A run of border between two territories (city id + 1; 0 is the sea), as x,y pairs in map px. */
export interface Edge {
  a: number;
  b: number;
  pts: Float32Array;
}

export interface World {
  w: number;
  h: number;
  /** Mercator row of the map's top edge (in a 4096-wide world). */
  y0: number;
  nations: WorldNation[];
  cities: WorldCity[];
  grid: { w: number; h: number; cell: number; data: Uint16Array };
  edges: Edge[];
}

interface WorldJson {
  w: number;
  h: number;
  y0: number;
  nations: { id: number; iso: string; name: string; continent: string; sub: string; pop: number; gdp: number; c9: number }[];
  cities: { n: string; k: number; x: number; y: number; p: number; a: number; c?: number }[];
}

export function parseWorld(json: WorldJson, gridBuf: ArrayBuffer, edgesBuf: ArrayBuffer): World {
  const idOf = new Map<number, number>();
  const nations: WorldNation[] = json.nations.map((n, i) => {
    idOf.set(n.id, i);
    return { id: i, iso: n.iso, name: n.name, continent: n.continent, sub: n.sub, pop: n.pop, gdp: n.gdp, c9: n.c9 };
  });
  const cities: WorldCity[] = json.cities.map((c, i) => ({ id: i, name: CITY_NAMES[c.n] ?? c.n, nation: idOf.get(c.k) ?? 0, x: c.x, y: c.y, pop: c.p, area: c.a, capital: !!c.c, coastal: false, near: [] }));

  // Grid: u16 w, u16 h, then (run, value) pairs.
  const g16 = new Uint16Array(gridBuf);
  const gw = g16[0];
  const gh = g16[1];
  const data = new Uint16Array(gw * gh);
  for (let i = 2, o = 0; i + 1 < g16.length && o < data.length; i += 2) {
    data.fill(g16[i + 1], o, o + g16[i]);
    o += g16[i];
  }

  // Edges: u32 count, then u16 a, u16 b, u16 n, n × (u16 x, u16 y) in 1/8 px.
  const dv = new DataView(edgesBuf);
  const count = dv.getUint32(0, true);
  const edges: Edge[] = [];
  let o = 4;
  const nearSets = cities.map(() => new Set<number>());
  for (let e = 0; e < count; e++) {
    const a = dv.getUint16(o, true);
    const b = dv.getUint16(o + 2, true);
    const n = dv.getUint16(o + 4, true);
    o += 6;
    const pts = new Float32Array(n * 2);
    for (let k = 0; k < n * 2; k++) pts[k] = dv.getUint16(o + k * 2, true) / 8;
    o += n * 4;
    edges.push({ a, b, pts });
    if (a === 0 && b > 0) cities[b - 1].coastal = true;
    else if (a > 0 && b > 0) {
      nearSets[a - 1].add(b - 1);
      nearSets[b - 1].add(a - 1);
    }
  }
  cities.forEach((c, i) => (c.near = [...nearSets[i]]));
  return { w: json.w, h: json.h, y0: json.y0, nations, cities, grid: { w: gw, h: gh, cell: json.w / gw, data }, edges };
}

/** Load the map from public/sovereign (in the browser). */
export async function loadWorld(base = "/sovereign"): Promise<World> {
  const [json, grid, edges] = await Promise.all([
    fetch(`${base}/world.json`).then((r) => r.json() as Promise<WorldJson>),
    fetch(`${base}/grid.bin`).then((r) => r.arrayBuffer()),
    fetch(`${base}/edges.bin`).then((r) => r.arrayBuffer()),
  ]);
  return parseWorld(json, grid, edges);
}

/* ------------------------------------------------------------------ geometry */

const RAD = Math.PI / 180;
/** Latitude (degrees) of a map row. */
export function latAt(world: World, y: number) {
  return Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + world.y0)) / world.w))) / RAD;
}
export function lonAt(world: World, x: number) {
  return (x / world.w) * 360 - 180;
}
/** km per map px at a row (Mercator stretches the north). */
export function kmPerPx(world: World, y: number) {
  return (40075 / world.w) * Math.cos(latAt(world, y) * RAD);
}
/** Great-circle distance in km between two map points. */
export function kmBetween(world: World, ax: number, ay: number, bx: number, by: number) {
  const la = latAt(world, ay) * RAD;
  const lb = latAt(world, by) * RAD;
  const dl = (lonAt(world, bx) - lonAt(world, ax)) * RAD;
  const h = Math.sin((lb - la) / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The grid cell index at a map point. */
export function gridIndex(world: World, x: number, y: number) {
  const g = world.grid;
  const gx = Math.max(0, Math.min(g.w - 1, Math.floor(x / g.cell)));
  const gy = Math.max(0, Math.min(g.h - 1, Math.floor(y / g.cell)));
  return gy * g.w + gx;
}
/** The city whose territory a map point is in, or -1 at sea. */
export function cityAt(world: World, x: number, y: number) {
  return world.grid.data[gridIndex(world, x, y)] - 1;
}
