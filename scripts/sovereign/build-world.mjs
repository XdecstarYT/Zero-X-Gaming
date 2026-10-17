#!/usr/bin/env node
/**
 * Builds Sovereign's world map (public/sovereign/) from public-domain sources:
 *
 *  - Natural Earth (naturalearthdata.com, public domain): countries (50m), lakes (50m) and
 *    populated places (10m), from github.com/nvkelso/natural-earth-vector/geojson.
 *  - Elevation and sea depth: Tilezen/Mapzen terrain tiles ("terrarium" encoding) on AWS Open Data,
 *    built from SRTM, GMTED2010, ETOPO1 and other open sources.
 *
 * The map is Web Mercator, 4096 px round the world, cropped to 78°N..56°S. Countries are grouped
 * by sovereign state (Greenland goes with Denmark). Each nation gets its real capital and its
 * biggest cities, spread out so they cover the land; every bit of land belongs to the nearest city
 * of its nation, and the borders between those city territories are traced and simplified into
 * shared edges (so neighbours never gap or overlap).
 *
 * Outputs:
 *   terrain.webp  the painted relief (land by height and climate, the sea by depth), 4096 wide
 *   terrain-s.webp the same at 2048 wide (phones on low)
 *   world.json    nations and cities
 *   edges.bin     the territory edges: u32 count, then per edge u16 a, u16 b, u16 n, n × (u16 x, u16 y) in 1/8 px
 *   grid.bin      1024-wide city grid (u16 per cell, 0 = water), run-length coded: u16 w, u16 h, then (u16 run, u16 value)…
 *
 * Usage: node scripts/sovereign/build-world.mjs <natural-earth-geojson-dir> <tile-cache-dir>
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const [NE, CACHE] = process.argv.slice(2);
if (!NE || !CACHE) {
  console.error("usage: build-world.mjs <natural-earth-geojson-dir> <tile-cache-dir>");
  process.exit(1);
}
const OUT = new URL("../../public/sovereign/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

const W = 4096;
const LAT_N = 78;
const LAT_S = -56;
const RAD = Math.PI / 180;
const mercY = (lat) => ((1 - Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2)) / Math.PI) / 2) * W;
const Y0 = Math.floor(mercY(LAT_N));
const H = Math.ceil(mercY(LAT_S)) - Y0;
const px = (lon) => ((lon + 180) / 360) * W;
const py = (lat) => mercY(Math.max(-85, Math.min(85, lat))) - Y0;
const latOf = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + Y0)) / W))) / RAD);
console.log(`map ${W} × ${H}`);

const load = (f) => JSON.parse(readFileSync(join(NE, f), "utf8"));

// ------------------------------------------------------------------ elevation

const Z = 4;
const T = 256;
const elev = new Float32Array(W * H);
{
  const ty0 = Math.floor(Y0 / T);
  const ty1 = Math.floor((Y0 + H - 1) / T);
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = 0; tx < 1 << Z; tx++) {
      const f = join(CACHE, `t${Z}-${tx}-${ty}.png`);
      if (!existsSync(f)) execFileSync("curl", ["-sS", "-o", f, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`]);
      const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true });
      const ch = info.channels;
      for (let y = 0; y < T; y++) {
        const gy = ty * T + y - Y0;
        if (gy < 0 || gy >= H) continue;
        for (let x = 0; x < T; x++) {
          const i = (y * T + x) * ch;
          elev[gy * W + tx * T + x] = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
        }
      }
    }
  console.log("elevation in");
}

// ------------------------------------------------------------------ countries → nations

const countries = load("ne_50m_admin_0_countries.geojson").features.filter((f) => f.properties.ADM0_A3 !== "ATA" && f.properties.SOV_A3 && f.properties.SOV_A3 !== "-99");
const groups = new Map();
for (const f of countries) {
  const p = f.properties;
  const k = p.SOV_A3;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(f);
}
// Short names where Natural Earth's are long.
const SHORT = { "United States of America": "United States", "Dem. Rep. Congo": "DR Congo", "Central African Rep.": "Central African Republic", "Bosnia and Herz.": "Bosnia", "Dominican Rep.": "Dominican Republic", "Eq. Guinea": "Equatorial Guinea", "S. Sudan": "South Sudan", "Solomon Is.": "Solomon Islands", "N. Cyprus": "Northern Cyprus", "W. Sahara": "Western Sahara", "Côte d'Ivoire": "Ivory Coast", "eSwatini": "Eswatini", "Czechia": "Czechia", "North Macedonia": "North Macedonia", "Timor-Leste": "East Timor" };
const nations = [];
const nationOfAdm = new Map();
for (const [sov, fs] of groups) {
  // The home part is the most populous (the UK, not Jersey; Denmark, not Greenland).
  const main = fs.slice().sort((a, b) => b.properties.POP_EST - a.properties.POP_EST)[0];
  const p = main.properties;
  const name = SHORT[p.NAME] ?? p.NAME;
  fs.sort((a, b) => b.properties.POP_EST - a.properties.POP_EST);
  const n = { id: nations.length + 1, sov, iso: p.ISO_A3_EH !== "-99" ? p.ISO_A3_EH : p.ADM0_A3, name, continent: p.CONTINENT, sub: p.SUBREGION, pop: fs.reduce((a, f) => a + (f.properties.POP_EST || 0), 0), gdp: fs.reduce((a, f) => a + (f.properties.GDP_MD || 0), 0), color9: p.MAPCOLOR9, features: fs };
  nations.push(n);
  for (const f of fs) nationOfAdm.set(f.properties.ADM0_A3, n);
}
console.log(`${nations.length} nations`);

// Scanline fill, even-odd per polygon.
function fillPolygon(rings, grid, value) {
  const edges = [];
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, ay] = [px(ring[i][0]), py(ring[i][1])];
      const [bx, by] = [px(ring[i + 1][0]), py(ring[i + 1][1])];
      if (ay === by) continue;
      edges.push(ax, ay, bx, by);
      y0 = Math.min(y0, ay, by);
      y1 = Math.max(y1, ay, by);
    }
  }
  const ra = Math.max(0, Math.floor(y0));
  const rb = Math.min(H - 1, Math.ceil(y1));
  const xs = [];
  for (let y = ra; y <= rb; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let e = 0; e < edges.length; e += 4) {
      const ay = edges[e + 1];
      const by = edges[e + 3];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(edges[e] + ((yc - ay) / (by - ay)) * (edges[e + 2] - edges[e]));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.round(xs[k]));
      const xb = Math.min(W, Math.round(xs[k + 1]));
      grid.fill(value, y * W + xa, y * W + xb);
    }
  }
}
const polys = (g) => (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []);

const nat = new Uint16Array(W * H);
for (const n of nations) for (const f of n.features) for (const p of polys(f.geometry)) fillPolygon(p, nat, n.id);
for (const f of load("ne_50m_lakes.geojson").features) if ((f.properties.scalerank ?? 9) <= 4) for (const p of polys(f.geometry)) fillPolygon(p, nat, 0);

const places = load("ne_10m_populated_places_simple.geojson").features.map((f) => f.properties);
const byIso2 = new Map();
for (const n of nations)
  for (const f of n.features) {
    const p = f.properties;
    for (const k of [p.ISO_A3_EH, p.ISO_A3, p.BRK_A3, p.GU_A3, p.SU_A3]) if (k && k !== "-99" && !nationOfAdm.has(k)) nationOfAdm.set(k, n);
    if (p.ISO_A2_EH && p.ISO_A2_EH !== "-99" && !byIso2.has(p.ISO_A2_EH)) byIso2.set(p.ISO_A2_EH, n);
  }
const placeNation = (p) => nationOfAdm.get(p.adm0_a3) ?? nationOfAdm.get(p.sov_a3) ?? byIso2.get(p.iso_a2);

// City-states too small to draw (Singapore, Bahrain, Malta...) get a little island at their capital.
{
  const a = new Float64Array(nations.length + 1);
  for (let i = 0; i < W * H; i++) if (nat[i]) a[nat[i]]++;
  for (const n of nations) {
    if (a[n.id] >= 14 || n.pop < 250000) continue;
    const cap = places.find((p) => placeNation(p) === n && p.adm0cap === 1) ?? places.filter((p) => placeNation(p) === n).sort((x, y) => y.pop_max - x.pop_max)[0];
    if (!cap) continue;
    const cx = px(cap.longitude);
    const cy = py(cap.latitude);
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const xx = Math.round(cx) + dx;
        const yy = Math.round(cy) + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && dx * dx + dy * dy <= 6.5 && (!nat[yy * W + xx] || nat[yy * W + xx] === n.id)) nat[yy * W + xx] = n.id;
      }
  }
}

// Land pieces: drop specks under 8 px, number the rest (each nation's islands are allotted cities apart).
const compOf = new Int32Array(W * H).fill(-1);
const comps = [];
{
  const stack = new Int32Array(W * H);
  const list = [];
  let dropped = 0;
  for (let i = 0; i < W * H; i++) {
    if (!nat[i] || compOf[i] !== -1) continue;
    const v = nat[i];
    let sp = 0;
    stack[sp++] = i;
    compOf[i] = comps.length;
    list.length = 0;
    while (sp) {
      const j = stack[--sp];
      list.push(j);
      const x = j % W;
      const nb = [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, j - W, j + W];
      for (const k of nb) if (k >= 0 && k < W * H && compOf[k] === -1 && nat[k] === v) (compOf[k] = comps.length), (stack[sp++] = k);
    }
    if (list.length < 8) {
      for (const j of list) (nat[j] = 0), (compOf[j] = -2);
      dropped++;
      continue;
    }
    let t = 0;
    for (const j of list) t += Math.cos(latOf(Math.floor(j / W) + 0.5) * RAD) ** 2;
    comps.push({ nation: v, area: list.length, trueArea: t });
  }
  console.log(`dropped ${dropped} specks, ${comps.length} land pieces`);
}
for (const n of nations) {
  n.area = 0;
  n.trueArea = 0;
}
for (const c of comps) {
  const n = nations[c.nation - 1];
  n.area += c.area;
  n.trueArea += c.trueArea;
}

// ------------------------------------------------------------------ cities

/** Capitals Natural Earth doesn't flag (or flags elsewhere). */
const CAPITALS = { SSD: "Juba", ZAF: "Pretoria", BOL: "La Paz", NLD: "Amsterdam", CIV: "Abidjan", TZA: "Dodoma", MMR: "Naypyidaw", LKA: "Colombo" };

const cities = [];
function snap(n, x, y) {
  let best = null;
  for (let r = 0; r <= 8 && !best; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const xx = Math.round(x) + dx;
        const yy = Math.round(y) + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (nat[yy * W + xx] === n.id && (!best || dx * dx + dy * dy < best.d)) best = { x: xx + 0.5, y: yy + 0.5, d: dx * dx + dy * dy, comp: compOf[yy * W + xx] };
      }
  return best;
}
for (const n of nations) {
  if (n.area < 4) continue;
  const home = n.features[0].properties.ADM0_A3;
  const cand = places
    .filter((p) => placeNation(p) === n && p.latitude < LAT_N && p.latitude > LAT_S)
    .map((p) => ({ name: p.nameascii || p.name, lon: p.longitude, lat: p.latitude, pop: Math.max(p.pop_max, p.pop_min, 1000), cap: p.adm0cap === 1 && (p.adm0_a3 === home || p.iso_a2 === n.features[0].properties.ISO_A2_EH) }))
    .map((c) => ({ ...c, ...(snap(n, px(c.lon), py(c.lat)) ?? {}) }))
    .filter((c) => c.x !== undefined)
    .sort((a, b) => b.pop - a.pop);
  if (!cand.length) continue;
  const capital = cand.find((c) => c.name === CAPITALS[n.iso]) ?? cand.find((c) => c.cap) ?? cand[0];
  const pick = [capital];
  const byComp = new Map();
  for (const c of cand) {
    if (!byComp.has(c.comp)) byComp.set(c.comp, []);
    byComp.get(c.comp).push(c);
  }
  // How many on each land piece: more for big and populous ones.
  for (const [ci, list] of byComp) {
    const comp = comps[ci];
    const pop = list.reduce((a, c) => a + c.pop, 0);
    const hasCap = list.includes(capital);
    let want = Math.round(Math.sqrt(comp.trueArea) / 17 + Math.max(0, Math.log10(pop / 1e6)) * 3.4 + (hasCap ? 0.8 : 0));
    // A big city always counts, however small its island (Honolulu on O'ahu).
    want = Math.min(48, Math.max(hasCap || list[0].pop >= 400000 ? 1 : 0, want));
    if (!want) continue;
    const minD = Math.max(7, Math.sqrt(comp.area / want) * 0.42);
    const mine = hasCap ? [capital] : [];
    const far = (c) => (mine.length ? Math.min(...mine.map((p) => Math.hypot(p.x - c.x, p.y - c.y))) : Infinity);
    // Biggest first, kept apart; then fill the empty land with the farthest decent towns.
    for (const c of list) if (mine.length < Math.ceil(want * 0.7) && !mine.includes(c) && far(c) > minD) mine.push(c);
    while (mine.length < want) {
      let best = null;
      let bd = minD;
      for (const c of list) {
        if (mine.includes(c)) continue;
        const d = far(c) * (0.6 + 0.4 * Math.min(1, Math.log10(c.pop) / 6));
        if (d > bd) (bd = d), (best = c);
      }
      if (!best) break;
      mine.push(best);
    }
    for (const c of mine) if (!pick.includes(c)) pick.push(c);
  }
  for (const c of pick.slice(0, 72)) cities.push({ name: c.name, nation: n.id, x: c.x, y: c.y, pop: c.pop, cap: c === capital, comp: c.comp });
}
console.log(`${cities.length} cities`);

// Territory: every land pixel goes to the nearest city of its nation (true distance on the sphere).
const cell = new Uint16Array(W * H);
{
  const byNation = new Map();
  const byComp = new Map();
  cities.forEach((c, i) => {
    if (!byNation.has(c.nation)) byNation.set(c.nation, []);
    byNation.get(c.nation).push(i);
    if (!byComp.has(c.comp)) byComp.set(c.comp, []);
    byComp.get(c.comp).push(i);
  });
  const lat = new Float64Array(H);
  for (let y = 0; y < H; y++) lat[y] = latOf(y + 0.5);
  const cityLat = cities.map((c) => latOf(c.y));
  for (let y = 0; y < H; y++) {
    const cl = Math.cos(lat[y] * RAD);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const n = nat[i];
      if (!n) continue;
      const list = byComp.get(compOf[i]) ?? byNation.get(n);
      if (!list) {
        nat[i] = 0;
        continue;
      }
      let best = list[0];
      let bd = Infinity;
      for (const ci of list) {
        const c = cities[ci];
        let dx = Math.abs(c.x - x - 0.5);
        if (dx > W / 2) dx = W - dx;
        const dlat = cityLat[ci] - lat[y];
        const d = (dx * (360 / W) * cl) ** 2 + dlat * dlat;
        if (d < bd) (bd = d), (best = ci);
      }
      cell[i] = best + 1;
    }
  }
  const cArea = new Float64Array(cities.length + 1);
  for (let i = 0; i < W * H; i++) cArea[cell[i]]++;
  cities.forEach((c, i) => (c.area = cArea[i + 1]));
  console.log("territories assigned");
}

// ------------------------------------------------------------------ edges

/** Trace the borders between territories (and the coasts) into polylines between junctions. */
function traceEdges() {
  const L = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : cell[y * W + x]);
  // H segment (x,y): from corner (x,y) to (x+1,y), between pixel (x,y-1) above and (x,y) below.
  const hasH = (x, y) => x >= 0 && x < W && y >= 0 && y <= H && L(x, y - 1) !== L(x, y);
  // V segment (x,y): from corner (x,y) to (x,y+1), between (x-1,y) left and (x,y) right.
  const hasV = (x, y) => y >= 0 && y < H && x >= 0 && x <= W && L(x - 1, y) !== L(x, y);
  const visH = new Uint8Array((W + 1) * (H + 1));
  const visV = new Uint8Array((W + 1) * (H + 1));
  const K = (x, y) => y * (W + 1) + x;
  const degree = (x, y) => (hasH(x, y) ? 1 : 0) + (hasH(x - 1, y) ? 1 : 0) + (hasV(x, y) ? 1 : 0) + (hasV(x, y - 1) ? 1 : 0);
  const out = [];
  function walk(sx, sy, dir) {
    // dir: 0 right (H x,y), 1 left (H x-1,y), 2 down (V x,y), 3 up (V x,y-1)
    const pts = [sx, sy];
    let x = sx;
    let y = sy;
    let a = 0;
    let b = 0;
    let first = true;
    for (;;) {
      if (dir === 0) {
        visH[K(x, y)] = 1;
        if (first) (a = L(x, y - 1)), (b = L(x, y));
        x++;
      } else if (dir === 1) {
        visH[K(x - 1, y)] = 1;
        if (first) (a = L(x - 1, y - 1)), (b = L(x - 1, y));
        x--;
      } else if (dir === 2) {
        visV[K(x, y)] = 1;
        if (first) (a = L(x - 1, y)), (b = L(x, y));
        y++;
      } else {
        visV[K(x, y - 1)] = 1;
        if (first) (a = L(x - 1, y - 1)), (b = L(x, y - 1));
        y--;
      }
      first = false;
      pts.push(x, y);
      if ((x === sx && y === sy) || degree(x, y) !== 2) break;
      if (dir !== 1 && hasH(x, y) && !visH[K(x, y)]) dir = 0;
      else if (dir !== 0 && hasH(x - 1, y) && !visH[K(x - 1, y)]) dir = 1;
      else if (dir !== 3 && hasV(x, y) && !visV[K(x, y)]) dir = 2;
      else if (dir !== 2 && hasV(x, y - 1) && !visV[K(x, y - 1)]) dir = 3;
      else break;
    }
    if (a === 0 && b === 0) return;
    out.push({ a: Math.min(a, b), b: Math.max(a, b), pts });
  }
  const start = (x, y) => {
    if (hasH(x, y) && !visH[K(x, y)]) walk(x, y, 0);
    if (hasH(x - 1, y) && !visH[K(x - 1, y)]) walk(x, y, 1);
    if (hasV(x, y) && !visV[K(x, y)]) walk(x, y, 2);
    if (hasV(x, y - 1) && !visV[K(x, y - 1)]) walk(x, y, 3);
  };
  // Junctions first, then the closed loops (islands, enclaves).
  for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) if (degree(x, y) > 2) start(x, y);
  for (let y = 0; y <= H; y++)
    for (let x = 0; x <= W; x++) {
      if (hasH(x, y) && !visH[K(x, y)]) walk(x, y, 0);
      if (hasV(x, y) && !visV[K(x, y)]) walk(x, y, 2);
    }
  return out;
}

function dp(pts, tol) {
  const n = pts.length / 2;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const ax = pts[i * 2], ay = pts[i * 2 + 1], bx = pts[j * 2], by = pts[j * 2 + 1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let md = -1, mk = -1;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((pts[k * 2] - ax) * dy - (pts[k * 2 + 1] - ay) * dx) / len;
      if (d > md) (md = d), (mk = k);
    }
    if (md > tol) {
      keep[mk] = 1;
      stack.push([i, mk], [mk, j]);
    }
  }
  const out = [];
  for (let k = 0; k < n; k++) if (keep[k]) out.push(pts[k * 2], pts[k * 2 + 1]);
  return out;
}
function simplify(pts, tol) {
  const n = pts.length / 2;
  const closed = pts[0] === pts[(n - 1) * 2] && pts[1] === pts[(n - 1) * 2 + 1];
  if (!closed) return dp(pts, tol);
  // A loop: split at its farthest point and simplify each half.
  let far = 1, fd = -1;
  for (let k = 1; k < n - 1; k++) {
    const d = (pts[k * 2] - pts[0]) ** 2 + (pts[k * 2 + 1] - pts[1]) ** 2;
    if (d > fd) (fd = d), (far = k);
  }
  const h1 = dp(pts.slice(0, far * 2 + 2), tol);
  const h2 = dp(pts.slice(far * 2), tol);
  return h1.concat(h2.slice(2));
}

const edges = traceEdges().map((e) => ({ ...e, pts: simplify(e.pts, 0.55) }));
let nPts = 0;
for (const e of edges) nPts += e.pts.length / 2;
console.log(`${edges.length} edges, ${nPts} points`);

{
  const size = 4 + edges.reduce((s, e) => s + 6 + e.pts.length * 2, 0);
  const buf = Buffer.alloc(size);
  let o = buf.writeUInt32LE(edges.length, 0);
  for (const e of edges) {
    o = buf.writeUInt16LE(e.a, o);
    o = buf.writeUInt16LE(e.b, o);
    o = buf.writeUInt16LE(e.pts.length / 2, o);
    for (const v of e.pts) o = buf.writeUInt16LE(Math.round(v * 8), o);
  }
  writeFileSync(join(OUT, "edges.bin"), buf);
  console.log(`edges.bin ${(size / 1024).toFixed(0)} KB`);
}

// ------------------------------------------------------------------ grid

{
  const GW = W / 4;
  const GH = Math.ceil(H / 4);
  const g = new Uint16Array(GW * GH);
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      const count = new Map();
      for (let dy = 0; dy < 4; dy++)
        for (let dx = 0; dx < 4; dx++) {
          const yy = y * 4 + dy;
          if (yy >= H) continue;
          const v = cell[yy * W + x * 4 + dx];
          count.set(v, (count.get(v) ?? 0) + 1);
        }
      let best = 0, bc = -1;
      // Land wins ties (and needs only a quarter of the block): narrow straits stay crossable by sea, small islands stay on the map.
      for (const [v, c] of count) if ((v ? c * 2.2 : c) > bc) (bc = v ? c * 2.2 : c), (best = v);
      g[y * GW + x] = best;
    }
  // Each city's own spot is its own.
  cities.forEach((c, i) => (g[Math.floor(c.y / 4) * GW + Math.floor(c.x / 4)] = i + 1));
  const runs = [];
  let cur = g[0], run = 0;
  for (let i = 0; i < g.length; i++) {
    if (g[i] === cur && run < 65535) run++;
    else {
      runs.push(run, cur);
      cur = g[i];
      run = 1;
    }
  }
  runs.push(run, cur);
  const buf = Buffer.alloc(4 + runs.length * 2);
  buf.writeUInt16LE(GW, 0);
  buf.writeUInt16LE(GH, 2);
  runs.forEach((v, i) => buf.writeUInt16LE(v, 4 + i * 2));
  writeFileSync(join(OUT, "grid.bin"), buf);
  console.log(`grid.bin ${GW}×${GH} ${(buf.length / 1024).toFixed(0)} KB`);
}

// ------------------------------------------------------------------ terrain

/** Rough climate: deserts and steppe where the world's dry belts are; the rest by latitude. */
const DRY = [
  // lon, lat, rx, ry (degrees), strength
  [10, 23, 26, 9, 1], [32, 22, 8, 8, 1], [-8, 22, 8, 7, 1], [45, 23, 12, 7, 1], [55, 30, 9, 5, 0.85], [62, 33, 6, 5, 0.6],
  [71, 27, 4, 3, 0.8], [85, 40, 8, 3.5, 0.85], [104, 42, 12, 4, 0.75], [60, 44, 10, 4, 0.55], [128, -25, 13, 7, 0.9],
  [18, -24, 6, 5, 0.75], [15, -20, 3, 6, 0.6], [-70, -23, 2.5, 6, 0.9], [-68, -42, 4, 7, 0.55], [-114, 36, 6, 5, 0.75],
  [-106, 29, 5, 4, 0.6], [-110, 42, 6, 4, 0.45], [47, 7, 5, 4, 0.6], [-40, -8, 4, 4, 0.35], [36, 32, 3, 2, 0.6],
];
function dryness(lon0, lat0) {
  // Warp the belts with noise so they read as real deserts, not ellipses.
  const lon = lon0 + (fbm(lon0 / 7, lat0 / 7) - 0.5) * 14;
  const lat = lat0 + (fbm(lon0 / 6 + 40, lat0 / 6 + 40) - 0.5) * 8;
  let d = 0;
  for (const [x, y, rx, ry, s] of DRY) {
    const q = ((lon - x) / rx) ** 2 + ((lat - y) / ry) ** 2;
    d = Math.max(d, s * Math.max(0, 1 - q * 0.75));
  }
  return Math.min(1, d);
}
function noise(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
function smoothNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const a = noise(xi, yi), b = noise(xi + 1, yi), c = noise(xi, yi + 1), d = noise(xi + 1, yi + 1);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => smoothNoise(x, y) * 0.5 + smoothNoise(x * 2.1, y * 2.1) * 0.3 + smoothNoise(x * 4.3, y * 4.3) * 0.2;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
{
  const img = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const lat = latOf(y + 0.5);
    const alat = Math.abs(lat);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const e = elev[i];
      const lon = ((x + 0.5) / W) * 360 - 180;
      const land = nat[i] > 0;
      // Hillshade from the north-west.
      const ex = elev[y * W + Math.min(W - 1, x + 1)] - elev[y * W + Math.max(0, x - 1)];
      const ey = elev[Math.min(H - 1, y + 1) * W + x] - elev[Math.max(0, y - 1) * W + x];
      const sc = Math.cos(lat * RAD);
      let shade = 1 + (-ex - ey) * 0.0016 * sc * (land ? 1 : 0.25);
      shade = Math.max(0.55, Math.min(1.35, shade));
      let c;
      if (land) {
        const n = fbm(x / 40, y / 40);
        const dry = Math.min(1, Math.max(0, dryness(lon, lat) * (0.55 + n * 0.9) - 0.05));
        const h = Math.max(0, e);
        // Green by latitude: tropics deep, temperate fresh, boreal dark, tundra grey-brown.
        let green = alat < 12 ? [44, 92, 40] : alat < 35 ? mix([44, 92, 40], [86, 122, 56], (alat - 12) / 23) : alat < 55 ? mix([86, 122, 56], [58, 96, 52], (alat - 35) / 20) : alat < 64 ? mix([58, 96, 52], [84, 98, 66], (alat - 55) / 9) : mix([84, 98, 66], [132, 130, 112], Math.min(1, (alat - 64) / 10));
        green = mix(green, [green[0] * 1.15, green[1] * 1.08, green[2]], n);
        const desert = mix([206, 178, 128], [222, 196, 146], n);
        c = mix(green, dry > 0.55 ? desert : [168, 156, 104], Math.min(1, dry * 1.25));
        // Height: highlands browner, peaks rock and snow.
        if (h > 600) c = mix(c, [142, 120, 92], Math.min(1, (h - 600) / 1800));
        if (h > 2600) c = mix(c, [176, 168, 160], Math.min(1, (h - 2600) / 1600));
        const snowLine = 5600 - Math.max(0, alat - 28) * 95;
        if (h > snowLine) c = mix(c, [240, 242, 246], Math.min(1, (h - snowLine) / 700));
        // Greenland's ice and the high Arctic.
        if (alat > 60 && (h > 1200 || (lon < -20 && lon > -60 && lat > 66 && h > 300))) c = mix(c, [236, 240, 244], 0.85);
      } else {
        const d = Math.min(0, e);
        const t = Math.min(1, -d / 5200);
        c = mix([96, 168, 196], [22, 58, 104], Math.pow(t, 0.55));
        if (d > -60) c = mix(c, [118, 186, 206], 0.5);
        if (alat > 70) c = mix(c, [190, 210, 224], Math.min(1, (alat - 70) / 6) * 0.6);
      }
      img[i * 3] = Math.max(0, Math.min(255, c[0] * shade));
      img[i * 3 + 1] = Math.max(0, Math.min(255, c[1] * shade));
      img[i * 3 + 2] = Math.max(0, Math.min(255, c[2] * shade));
    }
  }
  await sharp(img, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 82 }).toFile(join(OUT, "terrain.webp"));
  await sharp(img, { raw: { width: W, height: H, channels: 3 } }).resize(W / 2, Math.round(H / 2)).webp({ quality: 82 }).toFile(join(OUT, "terrain-s.webp"));
  console.log("terrain painted");
}

// ------------------------------------------------------------------ world.json

const keep = new Set(cities.map((c) => c.nation));
const world = {
  w: W,
  h: H,
  latN: LAT_N,
  latS: LAT_S,
  y0: Y0,
  nations: nations.filter((n) => keep.has(n.id)).map((n) => ({ id: n.id, iso: n.iso, name: n.name, continent: n.continent, sub: n.sub, pop: n.pop, gdp: n.gdp, c9: n.color9 })),
  cities: cities.map((c) => ({ n: c.name, k: c.nation, x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10, p: Math.round(c.pop), a: c.area, ...(c.cap ? { c: 1 } : {}) })),
};
writeFileSync(join(OUT, "world.json"), JSON.stringify(world));
console.log(`world.json ${(JSON.stringify(world).length / 1024).toFixed(0)} KB`);
