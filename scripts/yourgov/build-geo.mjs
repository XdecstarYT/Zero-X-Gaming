#!/usr/bin/env node
/**
 * Builds YourGov's real-country map data (src/games/yourgov/geo/<code>.json) from public-domain
 * sources:
 *
 *  - Natural Earth (naturalearthdata.com, public domain): admin-1 states and provinces (10m),
 *    countries (50m) for the neighbouring land, and populated places (10m) for the cities.
 *  - Elevation: Tilezen/Mapzen terrain tiles ("terrarium" encoding) on AWS Open Data, built from
 *    SRTM, GMTED2010, ETOPO1 and other open sources.
 *
 * For each country it projects the land into YourGov's 480 × 320 map (Albers for the big ones,
 * with insets where a country has far-off parts), groups Natural Earth's units into the real
 * regions, simplifies the outlines, keeps neighbouring land, picks the biggest cities and
 * samples real elevation onto a 240 × 160 grid.
 *
 * Usage:
 *   node scripts/yourgov/build-geo.mjs <natural-earth-geojson-dir> <tile-cache-dir> [codes...]
 * The Natural Earth files needed (from github.com/nvkelso/natural-earth-vector/geojson):
 *   ne_10m_admin_1_states_provinces_lakes.geojson, ne_50m_admin_0_countries.geojson,
 *   ne_10m_populated_places_simple.geojson
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

const W = 480;
const H = 320;
const DEM_W = 240;
const DEM_H = 160;
const OUT = new URL("../../src/games/yourgov/geo/", import.meta.url).pathname;

// ------------------------------------------------------------------ projections

const RAD = Math.PI / 180;
/** Longitude difference wrapped to ±180° (the Aleutians cross the date line). */
const dlon = (lon, lon0) => ((((lon - lon0) % 360) + 540) % 360) - 180;
function albers({ lon0, lat1, lat2, lat0 }) {
  const p1 = lat1 * RAD;
  const p2 = lat2 * RAD;
  const n = (Math.sin(p1) + Math.sin(p2)) / 2;
  const C = Math.cos(p1) ** 2 + 2 * n * Math.sin(p1);
  const rho0 = Math.sqrt(C - 2 * n * Math.sin(lat0 * RAD)) / n;
  return {
    fwd(lon, lat) {
      const rho = Math.sqrt(C - 2 * n * Math.sin(lat * RAD)) / n;
      const th = n * dlon(lon, lon0) * RAD;
      return [rho * Math.sin(th), -(rho0 - rho * Math.cos(th))];
    },
    inv(x, y) {
      const yy = rho0 + y;
      const rho = Math.hypot(x, yy) * Math.sign(n);
      const th = Math.atan2(x * Math.sign(n), yy * Math.sign(n));
      const lat = Math.asin(Math.max(-1, Math.min(1, (C - (rho * n) ** 2) / (2 * n)))) / RAD;
      return [lon0 + th / n / RAD, lat];
    },
  };
}
/** Equirectangular, true to scale at lat0 (fine for small countries). */
function equirect({ lon0, lat0 }) {
  const k = Math.cos(lat0 * RAD);
  return {
    fwd: (lon, lat) => [dlon(lon, lon0) * RAD * k, -(lat - lat0) * RAD],
    inv: (x, y) => [lon0 + x / k / RAD, lat0 - y / RAD],
  };
}

// ------------------------------------------------------------------ countries

/** Region grouping: a function from a Natural Earth admin-1 feature to [region id, region name] (or null to drop). */
const byName = (rename = {}) => (p) => {
  const n = p.name || p.name_en;
  if (!n) return null;
  const id = rename[n] ?? n;
  return [slug(id), id];
};
const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const COUNTRIES = {
  US: {
    a3: "USA",
    proj: albers({ lon0: -96, lat1: 29.5, lat2: 45.5, lat0: 37.5 }),
    group: byName(),
    // Leave out the far north-western Hawaiian islands (they'd shrink the main ones to dots).
    keep: (lon, lat, p) => p.name !== "Hawaii" || dlon(lon, 0) > -161,
    insets: {
      alaska: { match: (p) => p.name === "Alaska", proj: albers({ lon0: -154, lat1: 55, lat2: 65, lat0: 50 }), box: [0.01, 0.66, 0.24, 0.32] },
      hawaii: { match: (p) => p.name === "Hawaii", proj: albers({ lon0: -157, lat1: 8, lat2: 18, lat0: 13 }), box: [0.24, 0.8, 0.14, 0.16] },
    },
    zoom: 5,
  },
  GB: {
    a3: "GBR",
    proj: equirect({ lon0: -3, lat0: 54.5 }),
    group: (p) => {
      if (p.geonunit === "Scotland") return ["scotland", "Scotland"];
      if (p.geonunit === "Wales") return ["wales", "Wales"];
      if (p.geonunit === "Northern Ireland") return ["northern-ireland", "Northern Ireland"];
      const r = { East: "East of England", "Greater London": "London" }[p.region] ?? p.region;
      return [slug(r), r];
    },
    zoom: 7,
  },
  CA: {
    a3: "CAN",
    proj: albers({ lon0: -96, lat1: 49, lat2: 77, lat0: 60 }),
    group: byName({ Québec: "Quebec" }),
    zoom: 4,
  },
  AU: {
    a3: "AUS",
    proj: albers({ lon0: 134, lat1: -18, lat2: -36, lat0: -27 }),
    group: (p) => {
      if (["Macquarie Island", "Lord Howe Island"].includes(p.name)) return null;
      if (p.name === "Jervis Bay Territory") return ["australian-capital-territory", "Australian Capital Territory"];
      return [slug(p.name), p.name];
    },
    zoom: 5,
  },
  DE: {
    a3: "DEU",
    proj: equirect({ lon0: 10.4, lat0: 51.2 }),
    group: (p) => [slug(p.name_en || p.name), p.name_en || p.name],
    zoom: 7,
  },
  FR: {
    a3: "FRA",
    proj: equirect({ lon0: 2.5, lat0: 46.5 }),
    group: (p) => (["Guyane française", "Martinique", "Guadeloupe", "Réunion", "Mayotte"].includes(p.region) ? null : [slug(p.region), p.region]),
    zoom: 7,
  },
  ES: {
    a3: "ESP",
    proj: equirect({ lon0: -3.7, lat0: 40.2 }),
    group: (p) => {
      if (["Ceuta", "Melilla"].includes(p.region)) return null;
      const r = { "Foral de Navarra": "Navarre", "País Vasco": "Basque Country", Cataluña: "Catalonia", Andalucía: "Andalusia", "Castilla y León": "Castile and León", Valenciana: "Valencia", "Canary Is.": "Canary Islands", "Islas Baleares": "Balearic Islands", "Castilla-La Mancha": "Castilla-La Mancha", Aragón: "Aragon" }[p.region] ?? p.region;
      return [slug(r), r];
    },
    insets: { canaries: { match: (p) => p.region === "Canary Is.", proj: equirect({ lon0: -15.7, lat0: 28.3 }), box: [0.02, 0.76, 0.3, 0.2] } },
    zoom: 7,
  },
  IT: {
    a3: "ITA",
    proj: equirect({ lon0: 12.5, lat0: 42 }),
    group: (p) => {
      const r = { Piemonte: "Piedmont", Lombardia: "Lombardy", "Trentino-Alto Adige": "Trentino-South Tyrol", Toscana: "Tuscany", Apulia: "Apulia", Sardegna: "Sardinia", Sicily: "Sicily" }[p.region] ?? p.region;
      return [slug(r), r];
    },
    zoom: 7,
  },
  JP: {
    a3: "JPN",
    proj: albers({ lon0: 137, lat1: 31, lat2: 42, lat0: 36 }),
    group: (p) => [slug(p.name_en || p.name), (p.name_en || p.name).replace(/ Prefecture$/, "")],
    // Leave out the far-flung Pacific islets (Ogasawara, Minami-Torishima, Okinotorishima).
    keep: (lon, lat, p) => p.name === "Okinawa" || (lat > 30 && lon < 146.5),
    insets: { okinawa: { match: (p) => p.name === "Okinawa", proj: equirect({ lon0: 127.5, lat0: 26.3 }), box: [0.02, 0.02, 0.22, 0.26] } },
    zoom: 6,
  },
  IN: {
    a3: "IND",
    proj: equirect({ lon0: 82, lat0: 22 }),
    group: (p) => [slug(p.name), p.name],
    zoom: 5,
  },
  BR: {
    a3: "BRA",
    keep: (lon) => lon < -33,
    proj: albers({ lon0: -54, lat1: -2, lat2: -22, lat0: -12 }),
    group: (p) => [slug(p.name), p.name],
    zoom: 5,
  },
  MX: {
    a3: "MEX",
    keep: (lon, lat) => !(lon < -112 && lat < 21) && !(lon < -117.5 && lat < 29.5 && lat > 28.5),
    proj: albers({ lon0: -102, lat1: 17.5, lat2: 29.5, lat0: 23 }),
    group: (p) => {
      if (!p.name) return ["yucatan", "Yucatán"];
      const n = p.name === "Distrito Federal" ? "Mexico City" : p.name === "México" ? "State of Mexico" : p.name;
      return [slug(n), n];
    },
    zoom: 5,
  },
};

// ------------------------------------------------------------------ geometry helpers

function polysOf(geom) {
  if (!geom) return [];
  if (geom.type === "Polygon") return [geom.coordinates];
  if (geom.type === "MultiPolygon") return geom.coordinates;
  return [];
}

function simplify(pts, eps) {
  const n = pts.length / 2;
  if (n < 4) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a * 2], ay = pts[a * 2 + 1];
    const dx = pts[b * 2] - ax, dy = pts[b * 2 + 1] - ay;
    const L = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bd = eps;
    for (let i = a + 1; i < b; i++) {
      const d = L > 1e-6 ? Math.abs((pts[i * 2] - ax) * dy - (pts[i * 2 + 1] - ay) * dx) / L : Math.hypot(pts[i * 2] - ax, pts[i * 2 + 1] - ay);
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

const area = (p) => {
  let s = 0;
  for (let i = 0, n = p.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    s += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  return Math.abs(s) / 2;
};

/** Clip a ring to a rectangle (Sutherland–Hodgman). */
function clipRect(p, x0, y0, x1, y1) {
  let pts = [];
  for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]]);
  const edges = [
    (q) => q[0] >= x0, (q) => q[0] <= x1, (q) => q[1] >= y0, (q) => q[1] <= y1,
  ];
  const cut = [
    (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])],
    (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1],
  ];
  for (let e = 0; e < 4 && pts.length; e++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[i];
      const ia = edges[e](a);
      const ib = edges[e](b);
      if (ib) {
        if (!ia) out.push(cut[e](a, b));
        out.push(b);
      } else if (ia) out.push(cut[e](a, b));
    }
    pts = out;
  }
  return pts.flat();
}

const pointInRing = (x, y, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// ------------------------------------------------------------------ elevation tiles

function decodePng(buf) {
  let p = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error(`unsupported png ${bitDepth}/${colorType}`);
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(w * h * 3);
  const stride = w * bpp;
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) out[(y * w + x) * 3 + k] = cur[x * bpp + k];
    prev.set(cur);
  }
  return { w, h, rgb: out };
}

function tileSampler(cacheDir, z) {
  const tiles = new Map();
  const n = 2 ** z;
  const get = (tx, ty) => {
    tx = ((tx % n) + n) % n;
    if (ty < 0 || ty >= n) return null;
    const key = `${z}/${tx}/${ty}`;
    if (tiles.has(key)) return tiles.get(key);
    const file = join(cacheDir, `${z}-${tx}-${ty}.png`);
    if (!existsSync(file)) execFileSync("curl", ["-s", "--max-time", "60", "-o", file, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${key}.png`]);
    let t = null;
    try {
      t = decodePng(readFileSync(file));
    } catch {
      t = null;
    }
    tiles.set(key, t);
    return t;
  };
  const px = (tx, ty, x, y) => {
    const t = get(tx, ty);
    if (!t) return 0;
    const i = (y * t.w + x) * 3;
    return t.rgb[i] * 256 + t.rgb[i + 1] + t.rgb[i + 2] / 256 - 32768;
  };
  return (lon, lat) => {
    const la = Math.max(-85, Math.min(85, lat)) * RAD;
    const fx = ((lon + 180) / 360) * n * 256 - 0.5;
    const fy = ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n * 256 - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const sx = fx - x0, sy = fy - y0;
    const at = (x, y) => px(Math.floor(x / 256), Math.floor(y / 256), ((x % 256) + 256) % 256, ((y % 256) + 256) % 256);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + c * (1 - sx) * sy + d * sx * sy;
  };
}

/** Elevation in metres → a byte: square-root steps so lowlands and shelves keep detail. */
const encodeElev = (m) => (m >= 0 ? Math.round(128 + Math.sqrt(Math.min(1, m / 6000)) * 127) : Math.round(128 - Math.sqrt(Math.min(1, -m / 3000)) * 128));

// ------------------------------------------------------------------ build

function build(code, cfg, ne) {
  const feats = ne.admin1.features.filter((f) => f.properties.adm0_a3 === cfg.a3);
  const insets = cfg.insets ?? {};
  // Group features into regions, noting which belong to an inset.
  const regions = new Map();
  for (const f of feats) {
    const g = cfg.group(f.properties);
    if (!g) continue;
    const inset = Object.entries(insets).find(([, v]) => v.match(f.properties))?.[0] ?? null;
    let r = regions.get(g[0]);
    if (!r) regions.set(g[0], (r = { id: g[0], name: g[1], polys: [], inset }));
    for (const poly of polysOf(f.geometry)) {
      const [lon, lat] = poly[0][0];
      if (!cfg.keep || cfg.keep(lon, lat, f.properties)) r.polys.push(poly);
    }
  }
  // Main frame: fit the projected mainland.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of regions.values()) {
    if (r.inset) continue;
    for (const poly of r.polys)
      for (const [lon, lat] of poly[0]) {
        const [x, y] = cfg.proj.fwd(lon, lat);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  }
  const M = 16;
  const k = Math.min((W - 2 * M) / (x1 - x0), (H - 2 * M) / (y1 - y0));
  const ox = (W - (x1 - x0) * k) / 2 - x0 * k;
  const oy = (H - (y1 - y0) * k) / 2 - y0 * k;
  const main = { fwd: (lon, lat) => { const [x, y] = cfg.proj.fwd(lon, lat); return [x * k + ox, y * k + oy]; }, inv: (px, py) => cfg.proj.inv((px - ox) / k, (py - oy) / k) };
  // Insets: each fitted into its own box.
  const insetT = {};
  for (const [name, v] of Object.entries(insets)) {
    let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
    for (const r of regions.values()) {
      if (r.inset !== name) continue;
      for (const poly of r.polys)
        for (const [lon, lat] of poly[0]) {
          const [x, y] = v.proj.fwd(lon, lat);
          a0 = Math.min(a0, x); a1 = Math.max(a1, x); b0 = Math.min(b0, y); b1 = Math.max(b1, y);
        }
    }
    const [bx, by, bw, bh] = v.box.map((t, i) => t * (i % 2 ? H : W));
    const kk = Math.min((bw * 0.9) / (a1 - a0), (bh * 0.9) / (b1 - b0));
    const ix = bx + (bw - (a1 - a0) * kk) / 2 - a0 * kk;
    const iy = by + (bh - (b1 - b0) * kk) / 2 - b0 * kk;
    insetT[name] = { box: [bx, by, bw, bh], fwd: (lon, lat) => { const [x, y] = v.proj.fwd(lon, lat); return [x * kk + ix, y * kk + iy]; }, inv: (px, py) => v.proj.inv((px - ix) / kk, (py - iy) / kk) };
  }
  const tf = (r) => (r.inset ? insetT[r.inset] : main);
  const q = (v) => Math.round(v * 10);

  // Regions: projected, simplified rings (outer and holes), tenths of a map pixel.
  const outRegions = [];
  for (const r of regions.values()) {
    const T = tf(r);
    const rings = [];
    const all = [];
    for (const poly of r.polys)
      poly.forEach((ring, ri) => {
        const flat = ring.flatMap(([lon, lat]) => T.fwd(lon, lat));
        const s = simplify(flat, 0.25);
        all.push({ s, a: area(s), hole: ri > 0 });
      });
    const biggest = Math.max(...all.map((x) => x.a));
    for (const x of all) if (x.s.length >= 6 && (x.a > 0.6 || x.a === biggest)) rings.push(x.s.map(q));
    outRegions.push({ id: r.id, name: r.name, inset: r.inset ?? undefined, rings });
  }

  // Neighbouring land (main frame only), clipped to the map.
  const foreign = [];
  for (const f of ne.admin0.features) {
    if (f.properties.ADM0_A3 === cfg.a3) continue;
    for (const poly of polysOf(f.geometry)) {
      const flat = poly[0].flatMap(([lon, lat]) => main.fwd(lon, lat));
      let fx0 = Infinity, fx1 = -Infinity, fy0 = Infinity, fy1 = -Infinity, jump = 0;
      for (let i = 0; i < flat.length; i += 2) {
        fx0 = Math.min(fx0, flat[i]); fx1 = Math.max(fx1, flat[i]); fy0 = Math.min(fy0, flat[i + 1]); fy1 = Math.max(fy1, flat[i + 1]);
        if (i >= 2) jump = Math.max(jump, Math.hypot(flat[i] - flat[i - 2], flat[i + 1] - flat[i - 1]));
      }
      if (fx1 < -10 || fy1 < -10 || fx0 > W + 10 || fy0 > H + 10) continue;
      // Skip anything on the far side of the globe the projection folds in: Antarctica, and
      // rings that wrap round the date line (one edge leaps across the map), which would
      // clip into full-width strips.
      if (f.properties.ADM0_A3 === "ATA" || !Number.isFinite(fx0) || fx1 - fx0 > W * 8 || jump > W / 2) continue;
      const c = clipRect(flat, -4, -4, W + 4, H + 4);
      if (c.length < 6) continue;
      const s = simplify(c, 0.35);
      if (area(s) > 1) foreign.push(s.map(q));
    }
  }

  // Cities: the biggest places, projected with their region's frame.
  const places = ne.places.features.filter((f) => f.properties.adm0_a3 === cfg.a3).sort((a, b) => b.properties.pop_max - a.properties.pop_max);
  const cities = [];
  for (const f of places) {
    if (cities.length >= 40) break;
    const p = f.properties;
    const lon = p.longitude, lat = p.latitude;
    let T = main;
    for (const r of regions.values()) {
      if (!r.inset) continue;
      if (r.polys.some((poly) => pointInRing(lon, lat, poly[0]))) T = insetT[r.inset];
    }
    // Drop places outside every region we kept (overseas territories and the like).
    const kept = [...regions.values()].some((r) => r.polys.some((poly) => pointInRing(lon, lat, poly[0])));
    if (!kept) continue;
    const [x, y] = T.fwd(lon, lat);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (cities.some((c) => c.n === p.name)) continue;
    cities.push({ n: p.name, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, p: Math.round(p.pop_max / 10000) / 100, c: p.featurecla === "Admin-0 capital" ? 1 : 0 });
  }

  // Elevation on a 240 × 160 grid (each cell 2 × 2 map pixels).
  const sample = tileSampler(ne.tiles, cfg.zoom);
  const dem = new Uint8Array(DEM_W * DEM_H);
  for (let j = 0; j < DEM_H; j++)
    for (let i = 0; i < DEM_W; i++) {
      const px = (i + 0.5) * (W / DEM_W);
      const py = (j + 0.5) * (H / DEM_H);
      let T = main;
      for (const t of Object.values(insetT)) {
        const [bx, by, bw, bh] = t.box;
        if (px >= bx && px < bx + bw && py >= by && py < by + bh) T = t;
      }
      const [lon, lat] = T.inv(px, py);
      dem[j * DEM_W + i] = Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) < 85 ? encodeElev(sample(lon, lat)) : encodeElev(-3000);
    }

  return {
    code,
    regions: outRegions,
    foreign,
    insets: Object.values(insetT).map((t) => t.box.map((v) => Math.round(v * 10) / 10)),
    cities,
    dem: { w: DEM_W, h: DEM_H, data: Buffer.from(dem).toString("base64") },
  };
}

// ------------------------------------------------------------------ main

const [neDir, tileDir, ...codes] = process.argv.slice(2);
if (!neDir || !tileDir) {
  console.error("usage: build-geo.mjs <natural-earth-geojson-dir> <tile-cache-dir> [codes...]");
  process.exit(1);
}
mkdirSync(tileDir, { recursive: true });
mkdirSync(OUT, { recursive: true });
const ne = {
  admin1: JSON.parse(readFileSync(join(neDir, "ne_10m_admin_1_states_provinces_lakes.geojson"), "utf8")),
  admin0: JSON.parse(readFileSync(join(neDir, "ne_50m_admin_0_countries.geojson"), "utf8")),
  places: JSON.parse(readFileSync(join(neDir, "ne_10m_populated_places_simple.geojson"), "utf8")),
  tiles: tileDir,
};
for (const code of codes.length ? codes : Object.keys(COUNTRIES)) {
  const t = Date.now();
  const g = build(code, COUNTRIES[code], ne);
  const json = JSON.stringify(g);
  writeFileSync(join(OUT, `${code.toLowerCase()}.json`), json);
  console.log(code, `${g.regions.length} regions, ${g.foreign.length} foreign rings, ${g.cities.length} cities, ${(json.length / 1024).toFixed(0)} KB, ${Date.now() - t} ms`);
}
