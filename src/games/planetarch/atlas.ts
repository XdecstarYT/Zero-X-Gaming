/**
 * The map as Planetarch uses it: Sovereign's real world (nations, 1,242 cities whose
 * territories act as provinces, the territory grid and borders), plus what's worked out from it
 * once: which grid cells belong to each city, each city's neighbours by cell, how urban it is,
 * and where to put things on the globe.
 */
import { cityAt, latAt, lonAt, type World as MapWorld } from "../sovereign/world";

export interface Atlas {
  map: MapWorld;
  /** Cities by starting nation. */
  nationCities: number[][];
  /** Grid cells per city. */
  cityCells: number[][];
  /** City of each grid cell (−1 sea). */
  cellCity: Int16Array;
  /** Lat/lon of each city. */
  lat: Float32Array;
  lon: Float32Array;
  /** How urban a city's territory is (0…1): big city, small area. */
  urban: Float32Array;
  /** Height (0…1) per grid cell, if loaded. */
  height: Float32Array | null;
  /** City by name (first match). */
  byName: Map<string, number>;
  /** Map nation index of each ISO code. */
  iso: Map<string, number>;
}

export function buildAtlas(map: MapWorld): Atlas {
  const g = map.grid;
  const cellCity = new Int16Array(g.w * g.h);
  const cityCells: number[][] = map.cities.map(() => []);
  for (let i = 0; i < g.data.length; i++) {
    const c = g.data[i] - 1;
    cellCity[i] = c;
    if (c >= 0) cityCells[c].push(i);
  }
  const nationCities: number[][] = map.nations.map(() => []);
  const lat = new Float32Array(map.cities.length);
  const lon = new Float32Array(map.cities.length);
  const urban = new Float32Array(map.cities.length);
  const byName = new Map<string, number>();
  map.cities.forEach((c, i) => {
    nationCities[c.nation].push(i);
    lat[i] = latAt(map, c.y);
    lon[i] = lonAt(map, c.x);
    const density = c.pop / Math.max(1, cityCells[i].length);
    urban[i] = Math.max(0.15, Math.min(0.95, 0.25 + Math.log10(Math.max(10, density)) * 0.1 + (c.capital ? 0.1 : 0)));
    if (!byName.has(c.name)) byName.set(c.name, i);
  });
  const iso = new Map(map.nations.map((n, i) => [n.iso, i]));
  return { map, nationCities, cityCells, cellCity, lat, lon, urban, height: null, byName, iso };
}

/** The grid cell's centre in map px. */
export function cellXY(a: Atlas, cell: number): [number, number] {
  const g = a.map.grid;
  return [((cell % g.w) + 0.5) * g.cell, (Math.floor(cell / g.w) + 0.5) * g.cell];
}

/** Map px → lon/lat. */
export const toLonLat = (a: Atlas, x: number, y: number): [number, number] => [lonAt(a.map, x), latAt(a.map, y)];

/** Lon/lat → map px (Mercator); y may fall outside the map near the poles. */
export function toMap(a: Atlas, lon: number, lat: number): [number, number] {
  const w = a.map.w;
  const x = ((lon + 180) / 360) * w;
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  const y = (w / (2 * Math.PI)) * (Math.PI - Math.log(Math.tan(Math.PI / 4 + r / 2))) - a.map.y0;
  return [x, y];
}

/** The city at a lon/lat, or −1. */
export function cityAtLonLat(a: Atlas, lon: number, lat: number): number {
  const [x, y] = toMap(a, lon, lat);
  if (y < 0 || y >= a.map.h) return -1;
  return cityAt(a.map, x, y);
}

/** Four-way grid neighbours. */
export function cellNeighbours(a: Atlas, cell: number, out: number[]): number[] {
  const w = a.map.grid.w;
  const h = a.map.grid.h;
  out.length = 0;
  const x = cell % w;
  const y = (cell / w) | 0;
  out.push(y * w + ((x + 1) % w), y * w + ((x - 1 + w) % w));
  if (y > 0) out.push(cell - w);
  if (y < h - 1) out.push(cell + w);
  return out;
}
