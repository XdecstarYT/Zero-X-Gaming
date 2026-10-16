import { light } from "./traffic";
import { makeCar, playerPos, type Car, type State } from "./state";
import { TRAMS, type City, type Node, type TramRoute } from "./world";

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
export const TRACK_OFF = 2.25;
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
  lights: { s: number; node: Node; axis: "ns" | "ew" }[];
}

const cache = new Map<City, Track[]>();

/** Every track (two per route), built once per city. */
export function tracksFor(city: City): Track[] {
  let t = cache.get(city);
  if (t) return t;
  t = [];
  TRAMS.forEach((r, i) => {
    t!.push(buildTrack(city, r, i, 0));
    t!.push(buildTrack(city, r, i, 1));
  });
  cache.set(city, t);
  return t;
}

function buildTrack(city: City, r: TramRoute, route: number, dir: 0 | 1): Track {
  let pts = r.pts.map(([x, z]) => ({ x, z }));
  if (dir === 1) pts = pts.reverse();
  if (r.loop) pts.push({ ...pts[0] });
  // Offset each leg to the left of travel (x east, z south: left of heading h is (sin h, −cos h)).
  const legs: { ax: number; az: number; bx: number; bz: number; h: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const h = Math.atan2(b.z - a.z, b.x - a.x);
    const ox = Math.sin(h) * TRACK_OFF;
    const oz = -Math.cos(h) * TRACK_OFF;
    legs.push({ ax: a.x + ox, az: a.z + oz, bx: b.x + ox, bz: b.z + oz, h });
  }
  // Join the legs where they cross, rounding each corner.
  const out: { x: number; z: number }[] = [];
  const corner = (l0: (typeof legs)[number], l1: (typeof legs)[number]) => {
    // The two (axis-aligned) offset lines meet at a point.
    const vx = Math.abs(Math.cos(l0.h)) < 0.5 ? l0.ax : l1.ax;
    const vz = Math.abs(Math.cos(l0.h)) < 0.5 ? l1.az : l0.az;
    const d0x = Math.cos(l0.h);
    const d0z = Math.sin(l0.h);
    const d1x = Math.cos(l1.h);
    const d1z = Math.sin(l1.h);
    const turn = Math.atan2(Math.sin(l1.h - l0.h), Math.cos(l1.h - l0.h));
    const R = CORNER_R;
    const sx = vx - d0x * R;
    const sz = vz - d0z * R;
    const ex = vx + d1x * R;
    const ez = vz + d1z * R;
    // A quadratic curve through the corner, close enough to an arc for a tram.
    const n = Math.max(4, Math.round((Math.abs(turn) * R) / 2));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * vx + t * t * ex;
      const z = (1 - t) * (1 - t) * sz + 2 * (1 - t) * t * vz + t * t * ez;
      out.push({ x, z });
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
  // Stops every 260 m or so (and at each end), never in a junction.
  const nodes = city.roads.nodes;
  const inBox = (x: number, z: number) => nodes.some((n) => Math.abs(n.x - x) < 16 && Math.abs(n.z - z) < 16);
  for (let d = r.loop ? 120 : 30; d < acc - 20; d += 260) {
    let dd = d;
    for (let k = 0; k < 20; k++) {
      const p = at(track, dd);
      if (!inBox(p.x, p.z)) break;
      dd += 6;
    }
    track.stops.push(dd);
  }
  if (!r.loop) track.stops.push(acc - 18);
  // The lit junctions it passes through: stop short of each box.
  const seen = new Set<number>();
  for (let i = 0; i < xs.length; i += 2) {
    for (const n of nodes) {
      if (!n.light || seen.has(n.id)) continue;
      if (Math.abs(n.x - xs[i]) > 14 || Math.abs(n.z - zs[i]) > 14) continue;
      seen.add(n.id);
      const axis = Math.abs(Math.cos(hs[i])) > 0.7 ? "ew" : "ns";
      track.lights.push({ s: Math.max(0, ss[i] - 16), node: n, axis });
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
    const n = Math.max(1, Math.round(t0.len / 650));
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
export function stepTram(s: State, c: Car, dt: number) {
  const tr = c.tram!;
  const tracks = tracksFor(s.city);
  const t = tracks[tr.route * 2 + tr.dir];
  const r = TRAMS[tr.route];
  const top = r.type === "W" ? 9 : 13;
  const len = c.kind === "wtram" ? 14.5 : 33;
  if (tr.dwell > 0) {
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
      const lt = light(s, L.node, L.axis);
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
