/**
 * The real Melbourne map: a gzipped binary built from Overture Maps data (OpenStreetMap
 * contributors and others, ODbL) by `scripts/heatwave-map/build.py`, served from
 * `/heatwave/melbourne.bin`. Local metres round the corner of Flinders and Swanston Sts: x east,
 * z south.
 *
 * Roads come as nodes and straight edges (each real road split at its junctions and bends), with
 * a class, one-way flags, a width and a name; buildings as footprints (outer ring and courtyards)
 * with heights; rail lines, elevated freeways and piers as polylines; street furniture as
 * points; and the ground as a 4 m raster (land, grass, sand, sports grounds, paving, railway
 * ballast, decks, and water with its depth).
 */

export const MAP_URL = "/heatwave/melbourne.bin";

export interface Lines {
  tag: Float32Array;
  /** First point of each line in `xy` (pairs). */
  start: Uint32Array;
  len: Uint16Array;
  xy: Float32Array;
}

export interface MapData {
  lat0: number;
  lon0: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  names: string[];
  nodeXY: Float32Array;
  lights: Uint8Array;
  edgeAB: Uint32Array;
  edgeCls: Uint8Array;
  edgeFlags: Uint8Array;
  edgeWidth: Uint8Array;
  edgeName: Uint16Array;
  bH: Float32Array;
  bMin: Float32Array;
  bCat: Uint8Array;
  bRoof: Uint8Array;
  bColor: Uint16Array;
  bName: Uint16Array;
  bRings: Uint8Array;
  /** Index of each building's first ring in `ringLen` / `ringStart`. */
  bRing0: Uint32Array;
  ringLen: Uint16Array;
  /** First point of each ring in `coords` (pairs). */
  ringStart: Uint32Array;
  coords: Float32Array;
  rails: Lines;
  elevated: Lines;
  piers: Lines;
  ptType: Uint8Array;
  ptXY: Float32Array;
  ptName: Uint16Array;
  ground: { nx: number; nz: number; cell: number; data: Uint8Array };
}

export const F_BRIDGE = 1;
export const F_FWD = 2;
export const F_BACK = 4;
export const F_ALLEY = 8;

/** Ground raster classes. */
export const G = { land: 0, grass: 1, sand: 2, sport: 3, paved: 4, ballast: 5, deck: 6, water: 16 } as const;

/** Street furniture point types. */
export const PT = { bench: 0, bin: 1, lamp: 2, busStop: 3, pole: 4, stop: 5, fountain: 6, mast: 7, signal: 8, artwork: 9, toilets: 10, tap: 11 } as const;

export function parseMap(buf: Uint8Array): MapData {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  const u32 = () => {
    const v = dv.getUint32(o, true);
    o += 4;
    return v;
  };
  const f32 = () => {
    const v = dv.getFloat32(o, true);
    o += 4;
    return v;
  };
  const al = () => {
    o = (o + 3) & ~3;
  };
  const copy = <T>(Ctor: { new (b: ArrayBuffer): T; BYTES_PER_ELEMENT: number }, n: number): T => {
    al();
    const bytes = n * Ctor.BYTES_PER_ELEMENT;
    const ab = buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + bytes) as ArrayBuffer;
    o += bytes;
    return new Ctor(ab);
  };
  const q = (n: number) => {
    const a = copy(Int16Array, n);
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = a[i] / 4;
    return f;
  };
  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (magic !== "HWM2") throw new Error(`Heatwave: bad map file (${magic})`);
  o = 8;
  const lat0 = f32();
  const lon0 = f32();
  const x0 = f32();
  const z0 = f32();
  const x1 = f32();
  const z1 = f32();
  const nNames = u32();
  const names: string[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < nNames; i++) {
    const l = dv.getUint16(o, true);
    o += 2;
    names.push(dec.decode(buf.subarray(o, o + l)));
    o += l;
  }
  const nN = u32();
  const nodeXY = q(nN * 2);
  const lights = copy(Uint8Array, nN);
  const nE = u32();
  const edgeAB = copy(Uint32Array, nE * 2);
  const edgeCls = copy(Uint8Array, nE);
  const edgeFlags = copy(Uint8Array, nE);
  const edgeWidth = copy(Uint8Array, nE);
  const edgeName = copy(Uint16Array, nE);
  const nB = u32();
  const h10 = copy(Uint16Array, nB);
  const m10 = copy(Uint16Array, nB);
  const bCat = copy(Uint8Array, nB);
  const bRoof = copy(Uint8Array, nB);
  const bColor = copy(Uint16Array, nB);
  const bName = copy(Uint16Array, nB);
  const bRings = copy(Uint8Array, nB);
  const nR = u32();
  const ringLen = copy(Uint16Array, nR);
  const nC = u32();
  const coords = q(nC * 2);
  const bH = new Float32Array(nB);
  const bMin = new Float32Array(nB);
  for (let i = 0; i < nB; i++) {
    bH[i] = h10[i] / 10;
    bMin[i] = m10[i] / 10;
  }
  const bRing0 = new Uint32Array(nB);
  for (let i = 0, r = 0; i < nB; i++) {
    bRing0[i] = r;
    r += bRings[i];
  }
  const ringStart = new Uint32Array(nR);
  for (let i = 0, p = 0; i < nR; i++) {
    ringStart[i] = p;
    p += ringLen[i];
  }
  const lines = (): Lines => {
    const n = u32();
    const tag = copy(Float32Array, n);
    const len = copy(Uint16Array, n);
    const np = u32();
    const xy = q(np * 2);
    const start = new Uint32Array(n);
    for (let i = 0, p = 0; i < n; i++) {
      start[i] = p;
      p += len[i];
    }
    return { tag, start, len, xy };
  };
  const rails = lines();
  const elevated = lines();
  const piers = lines();
  const nP = u32();
  const ptType = copy(Uint8Array, nP);
  const ptXY = q(nP * 2);
  const ptName = copy(Uint16Array, nP);
  const nx = u32();
  const nz = u32();
  const cell = f32();
  const data = copy(Uint8Array, nx * nz);
  return { lat0, lon0, x0, z0, x1, z1, names, nodeXY, lights, edgeAB, edgeCls, edgeFlags, edgeWidth, edgeName, bH, bMin, bCat, bRoof, bColor, bName, bRings, bRing0, ringLen, ringStart, coords, rails, elevated, piers, ptType, ptXY, ptName, ground: { nx, nz, cell, data } };
}

let current: MapData | null = null;
let pending: Promise<MapData> | null = null;

export function setMap(m: MapData) {
  current = m;
}

/** The loaded map (load it first with `loadMap`). */
export function getMap(): MapData {
  if (!current) throw new Error("Heatwave: the map isn't loaded yet");
  return current;
}

export const mapLoaded = () => !!current;

/** Fetch and unpack the map once (the browser). */
export function loadMap(url = MAP_URL): Promise<MapData> {
  if (current) return Promise.resolve(current);
  pending ??= (async () => {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Heatwave: couldn't load the map (${res.status})`);
    const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    const m = parseMap(buf);
    current = m;
    return m;
  })();
  return pending;
}

/** Degrees to local metres (the same projection the build script uses). */
export function ll(lat: number, lon: number, m: { lat0: number; lon0: number } = getMap()) {
  const R = 6371008.8;
  const kx = Math.cos((m.lat0 * Math.PI) / 180) * ((R * Math.PI) / 180);
  const kz = (R * Math.PI) / 180;
  return { x: (lon - m.lon0) * kx, z: -(lat - m.lat0) * kz };
}
