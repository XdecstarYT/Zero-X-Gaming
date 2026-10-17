import { light } from "./traffic";
import { makeCar, playerPos, type Car, type State } from "./state";
import { geo, nearestRoad, routeNodes, segsAt, TRAMS, type City, type Node, type TramRoute } from "./world";

/**
 * Melbourne's trams. Each route is a double track down the middle of the road (the inside lane,
 * shared with the cars, as in Melbourne): one track each way, offset to the left of travel, with
 * curved corners. Trams run the line, stop at the stops, wait at red lights and for whatever's
 * on the track ahead, and at the end of the line change ends and come back on the other track.
 * They're heavy and kinematic: they shove cars aside rather than being shoved.
 *
 * The renderer draws the rails, the overhead wires and the stops from the same tracks.
 */

/** How far the track sits from the road's centre line (the inside lane). */
export const TRACK_OFF = 1.9;
const CORNER_R = 13;

export interface Track {
  route: number;
  dir: 0 | 1;
  loop: boolean;
  /** Points every couple of metres, with their heading and distance along. */
  x: Float32Array;
  z: Float32Array;
  h: Float32Array;
  s: Float32Array;
  len: number;
  /** Distances along to the stops. */
  stops: number[];
  /** Lit junctions on the way: the distance to stop short of, the node and the axis it's on. */
  lights: { s: number; node: Node; ph: number }[];
}

const cache = new Map<City, Track[]>();

/** Every track (two per route), built once per city. */
export function tracksFor(city: City): Track[] {
  const t = cache.get(city);
  if (t) return t;
  const it = trackSteps(city);
  while (!it.next().done);
  return cache.get(city)!;
}

/** Build the tracks a route at a time (yielding the share done), then cache them. */
export function* trackSteps(city: City): Generator<number, void> {
  if (cache.has(city)) return;
  const t: Track[] = [];
  for (let i = 0; i < TRAMS.length; i++) {
    t.push(buildTrack(city, TRAMS[i], i, 0), buildTrack(city, TRAMS[i], i, 1));
    yield (i + 1) / TRAMS.length;
  }
  cache.set(city, t);
}

function buildTrack(city: City, r: TramRoute, route: number, dir: 0 | 1): Track {
  const { nodes, segs } = city.roads;
  // The way through the real streets, waypoint to waypoint.
  let way = r.via.map(([lat, lon]) => geo(lat, lon));
  if (dir === 1) way = way.reverse();
  if (r.loop) way.push({ ...way[0] });
  const ends = (p: { x: number; z: number }) => {
    const n = nearestRoad(city, p.x, p.z);
    return n.seg.cls === "lane" ? [n.seg.a, n.seg.b] : [n.seg.a, n.seg.b];
  };
  let pts: { x: number; z: number }[] = [];
  for (let i = 0; i < way.length - 1; i++) {
    const chain = routeNodes(city, ends(way[i]), new Set(ends(way[i + 1])), way[i + 1].x, way[i + 1].z, { lanes: false });
    for (const id of chain) {
      const n = nodes[id];
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(last.x - n.x, last.z - n.z) > 0.5) pts.push({ x: n.x, z: n.z });
    }
  }
  if (pts.length < 2) pts = way.map((p) => ({ ...p }));
  if (r.loop && pts.length > 3) {
    // A closed line has the same first and last point, which simplifying would collapse to
    // nothing: simplify its two halves, split at the point farthest from the start.
    let m = 1;
    for (let i = 1; i < pts.length - 1; i++) if (Math.hypot(pts[i].x - pts[0].x, pts[i].z - pts[0].z) > Math.hypot(pts[m].x - pts[0].x, pts[m].z - pts[0].z)) m = i;
    const closed = Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].z - pts[0].z) < 0.5 ? pts : [...pts, { ...pts[0] }];
    pts = [...simplify(closed.slice(0, m + 1), 3), ...simplify(closed.slice(m), 3).slice(1)];
    // The loop's corner joins the last leg back to the first, so leave the closing point off.
    pts.pop();
  } else pts = simplify(pts, 3);
  void segs;
  // Offset each leg to the left of travel (x east, z south: left of heading h is (sin h, −cos h)).
  const legs: { ax: number; az: number; bx: number; bz: number; h: number; len: number }[] = [];
  const run = r.loop ? [...pts, pts[0]] : pts;
  for (let i = 0; i < run.length - 1; i++) {
    const a = run[i];
    const b = run[i + 1];
    const h = Math.atan2(b.z - a.z, b.x - a.x);
    const ox = Math.sin(h) * TRACK_OFF;
    const oz = -Math.cos(h) * TRACK_OFF;
    legs.push({ ax: a.x + ox, az: a.z + oz, bx: b.x + ox, bz: b.z + oz, h, len: Math.hypot(b.x - a.x, b.z - a.z) });
  }
  // Join the legs where their offset lines cross, rounding each corner.
  const out: { x: number; z: number }[] = [];
  const corner = (l0: (typeof legs)[number], l1: (typeof legs)[number]) => {
    const d0x = Math.cos(l0.h);
    const d0z = Math.sin(l0.h);
    const d1x = Math.cos(l1.h);
    const d1z = Math.sin(l1.h);
    const turn = Math.atan2(Math.sin(l1.h - l0.h), Math.cos(l1.h - l0.h));
    const cross = d0x * d1z - d0z * d1x;
    if (Math.abs(turn) < 0.05 || Math.abs(cross) < 1e-3) {
      out.push({ x: l0.bx, z: l0.bz }, { x: l1.ax, z: l1.az });
      return;
    }
    // Where the two offset lines meet.
    const t = ((l1.ax - l0.ax) * d1z - (l1.az - l0.az) * d1x) / cross;
    const vx = l0.ax + d0x * t;
    const vz = l0.az + d0z * t;
    const R = Math.min(CORNER_R, l0.len / 2.2, l1.len / 2.2);
    const sx = vx - d0x * R;
    const sz = vz - d0z * R;
    const ex = vx + d1x * R;
    const ez = vz + d1z * R;
    // A quadratic curve through the corner, close enough to an arc for a tram.
    const n = Math.max(3, Math.round((Math.abs(turn) * R) / 2));
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      out.push({ x: (1 - u) * (1 - u) * sx + 2 * (1 - u) * u * vx + u * u * ex, z: (1 - u) * (1 - u) * sz + 2 * (1 - u) * u * vz + u * u * ez });
    }
  };
  out.push({ x: legs[0].ax, z: legs[0].az });
  for (let i = 0; i < legs.length - 1; i++) corner(legs[i], legs[i + 1]);
  if (r.loop) {
    corner(legs[legs.length - 1], legs[0]);
    out[0] = { ...out[out.length - 1] };
  } else out.push({ x: legs[legs.length - 1].bx, z: legs[legs.length - 1].bz });
  // Resample every 2 m.
  const xs: number[] = [];
  const zs: number[] = [];
  const ss: number[] = [];
  let acc = 0;
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i];
    const b = out[i + 1];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(d / 2));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      xs.push(a.x + (b.x - a.x) * t);
      zs.push(a.z + (b.z - a.z) * t);
      ss.push(acc + d * t);
    }
    acc += d;
  }
  const last = out[out.length - 1];
  xs.push(last.x);
  zs.push(last.z);
  ss.push(acc);
  const hs = xs.map((_, i) => {
    const j = Math.min(xs.length - 1, i + 1);
    const k = Math.max(0, j - 1);
    return Math.atan2(zs[j] - zs[k], xs[j] - xs[k]);
  });
  const track: Track = { route, dir, loop: r.loop, x: Float32Array.from(xs), z: Float32Array.from(zs), h: Float32Array.from(hs), s: Float32Array.from(ss), len: acc, stops: [], lights: [] };
  // Lit junctions near the line, and the junction boxes to keep stops out of.
  const near = (x: number, z: number, r: number) => {
    const out: Node[] = [];
    for (const id of segsAt(city.roads, x, z)) {
      const sg = city.roads.segs[id];
      for (const nid of [sg.a, sg.b]) {
        const n = nodes[nid];
        if (n.segs.length >= 3 && Math.abs(n.x - x) < r && Math.abs(n.z - z) < r && !out.includes(n)) out.push(n);
      }
    }
    return out;
  };
  // Stops every 260 m or so (and at each end), never in a junction.
  for (let d = r.loop ? 120 : 30; d < acc - 20; d += 260) {
    let dd = d;
    for (let k = 0; k < 20; k++) {
      const p = at(track, dd);
      if (!near(p.x, p.z, 16).length) break;
      dd += 6;
    }
    track.stops.push(dd);
  }
  if (!r.loop) track.stops.push(acc - 18);
  // The lit junctions it passes through: stop short of each box, on the phase it crosses on.
  const seen = new Set<number>();
  for (let i = 0; i < xs.length; i += 2) {
    for (const n of near(xs[i], zs[i], 12)) {
      if (!n.light || seen.has(n.id)) continue;
      seen.add(n.id);
      // The segment at the node most in line with the track.
      let ph = 0;
      let best = -1;
      n.segs.forEach((sid, k) => {
        const sg = city.roads.segs[sid];
        const al = Math.abs(Math.cos(sg.h - hs[i]));
        if (al > best) {
          best = al;
          ph = n.ph[k];
        }
      });
      track.lights.push({ s: Math.max(0, ss[i] - n.r - 4), node: n, ph });
    }
  }
  track.lights.sort((a, b) => a.s - b.s);
  return track;
}

/** Position and heading at a distance along a track. */
export function at(t: Track, d: number) {
  if (t.loop) d = ((d % t.len) + t.len) % t.len;
  else d = Math.max(0, Math.min(t.len, d));
  // Binary search the samples.
  let lo = 0;
  let hi = t.s.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (t.s[m] <= d) lo = m;
    else hi = m;
  }
  const span = t.s[hi] - t.s[lo] || 1;
  const k = (d - t.s[lo]) / span;
  return { x: t.x[lo] + (t.x[hi] - t.x[lo]) * k, z: t.z[lo] + (t.z[hi] - t.z[lo]) * k, h: Math.atan2(t.z[hi] - t.z[lo], t.x[hi] - t.x[lo]) };
}

/** Put the trams on their lines: a few per route, spread out, some each way. */
export function spawnTrams(s: State) {
  const tracks = tracksFor(s.city);
  TRAMS.forEach((r, ri) => {
    const t0 = tracks[ri * 2];
    const n = Math.max(1, Math.round(t0.len / 1300));
    for (let k = 0; k < n * 2; k++) {
      const dir = (k % 2) as 0 | 1;
      const t = tracks[ri * 2 + dir];
      const d = ((Math.floor(k / 2) + (dir ? 0.5 : 0)) / n) * t.len * 0.92 + 10;
      const p = at(t, d);
      const kind = r.type === "W" ? "wtram" : "tram";
      const c = makeCar(s, kind, p.x, p.z, p.h, r.type === "W" ? "#2f5a3a" : "#e8e8e6", { tag: `tram-${r.id}` });
      c.ai.mode = "idle";
      c.tram = { route: ri, dir, s: d, v: 0, dwell: s.rng.range(0, 6), stop: t.stops.findIndex((x) => x > d) };
    }
  });
}

export const isTram = (c: Car) => !!c.tram;

/** Run a tram for a step. */
export function stepTram(s: State, c: Car, dt: number, drive: number | null = null) {
  const tr = c.tram!;
  const tracks = tracksFor(s.city);
  const t = tracks[tr.route * 2 + tr.dir];
  const r = TRAMS[tr.route];
  const top = r.type === "W" ? 9 : 13;
  const len = c.kind === "wtram" ? 14.5 : 33;
  if (drive !== null) {
    // The player at the controls: power and brake; the rails steer.
    tr.dwell = 0;
    if (drive > 0.05) tr.v = Math.min(top * 1.3, tr.v + 1.4 * drive * dt);
    else if (drive < -0.05) tr.v = Math.max(0, tr.v + 2.8 * drive * dt);
    else tr.v = Math.max(0, tr.v - 0.2 * dt);
    // Keep the timetable's next stop ahead of us, so it doesn't stop for ones we've passed.
    const sNow = t.loop ? ((tr.s % t.len) + t.len) % t.len : tr.s;
    const k = t.stops.findIndex((x) => x > sNow + len / 2);
    tr.stop = k >= 0 ? k : t.loop ? 0 : t.stops.length - 1;
    if (!t.loop && tr.s + tr.v * dt > t.len - len / 2 - 2) {
      // The end of the line: change ends onto the other track.
      tr.dir = tr.dir === 0 ? 1 : 0;
      tr.s = len / 2 + 2;
      tr.v = 0;
      const back = tracks[tr.route * 2 + tr.dir];
      tr.stop = back.stops.findIndex((x) => x > tr.s + len / 2);
      const q = at(back, tr.s);
      c.x = q.x;
      c.z = q.z;
      c.h = q.h;
      c.vx = c.vz = 0;
      return;
    }
  } else if (tr.dwell > 0) {
    tr.dwell -= dt;
    tr.v = 0;
  } else {
    let want = top;
    // Curves: slow right down.
    const ahead = at(t, tr.s + 14);
    const turn = Math.abs(Math.atan2(Math.sin(ahead.h - c.h), Math.cos(ahead.h - c.h)));
    if (turn > 0.15) want = Math.min(want, 5);
    const brake = (gap: number) => Math.max(0, Math.sqrt(2 * 1.6 * Math.max(0, gap)));
    // The next stop.
    const next = tr.stop >= 0 && tr.stop < t.stops.length ? t.stops[tr.stop] : Infinity;
    const toStop = (t.loop ? (next - (tr.s % t.len) + t.len) % t.len : next - tr.s) - len / 2;
    if (toStop < 0.5) {
      tr.dwell = 7 + s.rng.range(0, 5);
      tr.stop++;
      if (tr.stop >= t.stops.length) {
        if (t.loop) tr.stop = 0;
        else {
          // End of the line: change ends and come back on the other track.
          tr.dir = tr.dir === 0 ? 1 : 0;
          tr.s = 4;
          tr.stop = 0;
          tr.dwell = 18;
          const back = tracks[tr.route * 2 + tr.dir];
          const p = at(back, tr.s + len / 2);
          c.x = p.x;
          c.z = p.z;
          c.h = p.h;
          c.vx = c.vz = 0;
          return;
        }
      }
    } else want = Math.min(want, brake(toStop));
    // Red lights.
    const sNow = t.loop ? ((tr.s % t.len) + t.len) % t.len : tr.s;
    for (const L of t.lights) {
      const gap = L.s - sNow - len / 2;
      if (gap < -2 || gap > 60) continue;
      const lt = light(s, L.node, L.ph);
      if (lt === "red" || (lt === "amber" && gap > 6)) want = Math.min(want, brake(gap - 0.5));
      break;
    }
    // Anything on the track ahead (cars, people, other trams); far from anyone, just the trams.
    const fx = Math.cos(c.h);
    const fz = Math.sin(c.h);
    const me = playerPos(s);
    const far = Math.abs(me.x - c.x) > 380 || Math.abs(me.z - c.z) > 380;
    for (const o of s.cars) {
      if (far && !o.tram) continue;
      if (o === c || o.wrecked) continue;
      const dx = o.x - c.x;
      const dz = o.z - c.z;
      if (Math.abs(dx) > 60 || Math.abs(dz) > 60) continue;
      const ah = dx * fx + dz * fz;
      const lat = Math.abs(-dx * fz + dz * fx);
      if (ah <= 0 || ah > 45 || lat > 2.2) continue;
      const olen = o.tram ? (o.kind === "wtram" ? 14.5 : 33) : 4.6;
      want = Math.min(want, brake(ah - len / 2 - olen / 2 - 3));
    }
    for (const p of far ? [] : s.peds) {
      if (p.car >= 0 || p.state === "dead") continue;
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      if (Math.abs(dx) > 40 || Math.abs(dz) > 40) continue;
      const ah = dx * fx + dz * fz;
      if (ah <= 0 || ah > 30) continue;
      if (Math.abs(-dx * fz + dz * fx) > 1.8) continue;
      want = Math.min(want, brake(ah - len / 2 - 2.5));
      // The bell.
      if (c.horn <= 0 && s.rng.next() < 0.02) c.horn = 0.5;
    }
    const acc = want > tr.v ? 1.3 : -2.4;
    tr.v = want > tr.v ? Math.min(want, tr.v + acc * dt) : Math.max(want, tr.v + acc * dt * 1.6);
    tr.v = Math.max(0, tr.v);
  }
  tr.s += tr.v * dt;
  if (t.loop) tr.s = ((tr.s % t.len) + t.len) % t.len;
  // The body sits on its middle (it's drawn as sections following the rails).
  const p = at(t, tr.s);
  c.vx = (p.x - c.x) / Math.max(dt, 1e-3);
  c.vz = (p.z - c.z) / Math.max(dt, 1e-3);
  if (Math.hypot(c.vx, c.vz) > 30) c.vx = c.vz = 0;
  c.x = p.x;
  c.z = p.z;
  c.h = p.h;
  c.horn = Math.max(0, c.horn - dt);
}

/** Douglas–Peucker: drop points within `tol` metres of the line through their neighbours. */
function simplify(pts: { x: number; z: number }[], tol: number): { x: number; z: number }[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const a = pts[i];
    const b = pts[j];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    let far = -1;
    let fd = tol;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((pts[k].x - a.x) * dz - (pts[k].z - a.z) * dx) / l;
      if (d > fd) {
        fd = d;
        far = k;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([i, far], [far, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}
