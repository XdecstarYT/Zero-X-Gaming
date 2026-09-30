import { buildingsNear, HALF_STREET, LANE, LINES, lightFor, neighbours, nodePos, SIZE, SPEED_LIMIT, type City } from "./city";
import type { Registration } from "./people";

/**
 * Cars: a light bicycle-model with grip (so handbrake turns slide), circle
 * collisions against buildings and each other, damage, and an AI driver that
 * follows lanes, obeys traffic lights, keeps its distance, pulls over for
 * sirens, flees in pursuits, or responds lights-and-sirens.
 */

export type CarKind = "sedan" | "suv" | "van" | "pickup" | "sports" | "cruiser" | "interceptor" | "slicktop" | "pursuit" | "transport" | "ambulance";

export interface CarSpec {
  name: string;
  len: number;
  wid: number;
  height: number;
  /** Top speed, m/s. */
  top: number;
  accel: number;
  brake: number;
  /** Lateral grip (1/s). */
  grip: number;
  mass: number;
  police?: boolean;
}

export const SPECS: Record<CarKind, CarSpec> = {
  sedan: { name: "Sedan", len: 4.6, wid: 1.85, height: 1.45, top: 42, accel: 6.5, brake: 11, grip: 9, mass: 1.5 },
  suv: { name: "SUV", len: 4.9, wid: 2, height: 1.8, top: 40, accel: 6, brake: 10, grip: 8, mass: 2.1 },
  van: { name: "Van", len: 5.3, wid: 2.05, height: 2.3, top: 34, accel: 4.5, brake: 8.5, grip: 7, mass: 2.6 },
  pickup: { name: "Pickup", len: 5.5, wid: 2, height: 1.85, top: 40, accel: 6, brake: 9.5, grip: 7.5, mass: 2.3 },
  sports: { name: "Sports car", len: 4.4, wid: 1.9, height: 1.2, top: 58, accel: 10, brake: 13, grip: 10.5, mass: 1.35 },
  cruiser: { name: "Patrol Sedan", len: 5, wid: 1.9, height: 1.5, top: 50, accel: 8, brake: 12.5, grip: 10, mass: 1.8, police: true },
  interceptor: { name: "Interceptor SUV", len: 5.05, wid: 2, height: 1.75, top: 52, accel: 8.6, brake: 12.5, grip: 10, mass: 2.2, police: true },
  slicktop: { name: "Slicktop (unmarked)", len: 5, wid: 1.9, height: 1.45, top: 56, accel: 9.4, brake: 13, grip: 10.5, mass: 1.8, police: true },
  pursuit: { name: "Pursuit Coupe", len: 4.7, wid: 1.95, height: 1.3, top: 64, accel: 11, brake: 14, grip: 11.5, mass: 1.6, police: true },
  ambulance: { name: "Ambulance", len: 6.2, wid: 2.2, height: 2.7, top: 40, accel: 5.2, brake: 9, grip: 7, mass: 3.2, police: true },
  transport: { name: "Prisoner Transport", len: 5.9, wid: 2.1, height: 2.5, top: 38, accel: 5, brake: 9, grip: 7, mass: 3, police: true },
};

export const CIVILIAN_KINDS: CarKind[] = ["sedan", "sedan", "sedan", "suv", "suv", "van", "pickup", "sports"];
export const CAR_COLORS = ["#1c1f24", "#e8e8e6", "#8a8f96", "#7a1d1d", "#1d3f7a", "#2f5a3a", "#c9b27a", "#5a3b2a", "#b8c4cf", "#3a3a44", "#d0662b", "#6b2d6b"];
export const COLOR_NAMES: Record<string, string> = {
  "#1c1f24": "black",
  "#e8e8e6": "white",
  "#8a8f96": "grey",
  "#7a1d1d": "red",
  "#1d3f7a": "blue",
  "#2f5a3a": "green",
  "#c9b27a": "tan",
  "#5a3b2a": "brown",
  "#b8c4cf": "silver",
  "#3a3a44": "charcoal",
  "#d0662b": "orange",
  "#6b2d6b": "purple",
};

export type AiMode = "cruise" | "yield" | "stopped" | "flee" | "respond" | "parked";

export interface Ai {
  mode: AiMode;
  from: number;
  to: number;
  next: number;
  /** Cruise speed (m/s). */
  cruise: number;
  /** Respond / flee target (world point) and the car being chased. */
  tx?: number;
  tz?: number;
  chase?: string;
  /** Seconds the car has been pushing without moving. */
  stuck: number;
  /** Reverse-out-of-trouble timer. */
  reverse: number;
  /** Seconds since the last reason to keep yielding. */
  yieldT: number;
  /** Drunk weave phase. */
  weave: number;
  /** Seconds held up by other traffic (not lights): impatient drivers creep on. */
  wait: number;
  /** Progress along the current segment (m). */
  s: number;
  drunk?: boolean;
  /** Runs red lights. */
  reckless?: boolean;
  /** Waved through this checkpoint. */
  waved?: string;
}

export interface Car {
  id: string;
  kind: CarKind;
  spec: CarSpec;
  x: number;
  z: number;
  /** Heading: forward is (cos h, sin h) in (x, z). */
  h: number;
  vx: number;
  vz: number;
  steer: number;
  /** Last controls (for lights / sounds). */
  throttle: number;
  braking: boolean;
  color: string;
  reg: Registration | null;
  /** Ped id of whoever is driving (null = empty / the player). */
  driver: string | null;
  /** Ped ids in the back seat. */
  back: string[];
  health: number;
  lights: boolean;
  siren: boolean;
  ai: Ai | null;
  brokenLight?: boolean;
  /** Ran over a spike strip: flat tyres. */
  spiked?: boolean;
  /** Tow truck collects it at this time. */
  towAt?: number;
  /** What the player has seen this car do (reasons to stop it). */
  seen: Set<"speeding" | "red light" | "reckless driving">;
  /** Wheel spin (render). */
  wheel: number;
  lastImpact: number;
}

export interface Controls {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}

export const forward = (h: number) => ({ x: Math.cos(h), z: Math.sin(h) });
export const right = (h: number) => ({ x: -Math.sin(h), z: Math.cos(h) });

export function speedOf(c: Car) {
  return c.vx * Math.cos(c.h) + c.vz * Math.sin(c.h);
}

export function makeCar(id: string, kind: CarKind, x: number, z: number, h: number, color: string): Car {
  return {
    id,
    kind,
    spec: SPECS[kind],
    x,
    z,
    h,
    vx: 0,
    vz: 0,
    steer: 0,
    throttle: 0,
    braking: false,
    color,
    reg: null,
    driver: null,
    back: [],
    health: 100,
    lights: false,
    siren: false,
    ai: null,
    seen: new Set(),
    wheel: 0,
    lastImpact: -10,
  };
}

/** Integrate one step of driving physics. */
export function stepCar(c: Car, ctl: Controls, dt: number, surface = 1) {
  const base = c.spec;
  // Wet roads and flat tyres cut grip and braking.
  const tyres = c.spiked ? 0.5 : 1;
  const s = { ...base, grip: base.grip * surface * tyres, brake: base.brake * (0.6 + 0.4 * surface) * (c.spiked ? 0.8 : 1), top: base.top * (c.spiked ? 0.4 : 1) };
  const f = forward(c.h);
  const r = right(c.h);
  let vf = c.vx * f.x + c.vz * f.z;
  const vr = c.vx * r.x + c.vz * r.z;
  const dead = c.health <= 0;
  const throttle = dead ? 0 : ctl.throttle;
  const top = s.top * (c.health < 35 ? 0.55 + c.health / 80 : 1);
  if (throttle > 0) {
    if (vf < -0.3) vf = Math.min(0, vf + s.brake * throttle * dt);
    else vf += s.accel * throttle * Math.max(0, 1 - vf / top) * dt;
  } else if (throttle < 0) {
    if (vf > 0.3) vf = Math.max(0, vf + s.brake * throttle * dt);
    else vf = Math.max(-8, vf + s.accel * 0.6 * throttle * dt);
  } else {
    // Rolling resistance.
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), (dead ? 3 : 1.1) * dt);
  }
  if (ctl.brake > 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), s.brake * ctl.brake * dt);
  if (ctl.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 4.5 * dt);
  vf -= vf * Math.abs(vf) * 0.0009 * dt * 10;

  c.steer += (ctl.steer - c.steer) * Math.min(1, dt * 7);
  const maxSteer = 0.6 / (1 + Math.abs(vf) / 16);
  let yaw = (vf * Math.tan(c.steer * maxSteer)) / (s.len * 0.62);
  if (ctl.handbrake) yaw *= 1.5;
  // The body turns; the momentum doesn't (until the tyres grip it round).
  const wx = f.x * vf + r.x * vr;
  const wz = f.z * vf + r.z * vr;
  c.h += yaw * dt;
  const f2 = forward(c.h);
  const r2 = right(c.h);
  const nf = wx * f2.x + wz * f2.z;
  const nr = (wx * r2.x + wz * r2.z) * Math.exp(-(ctl.handbrake ? 1.2 : s.grip) * dt);
  c.vx = f2.x * nf + r2.x * nr;
  c.vz = f2.z * nf + r2.z * nr;
  c.x += c.vx * dt;
  c.z += c.vz * dt;
  c.throttle = throttle;
  c.braking = ctl.brake > 0.1 || (throttle < 0 && vf > 0.3);
  c.wheel += (vf / 0.36) * dt;
}

/** The two collision circles along the car (front, back). */
export function carCircles(c: Car) {
  const f = forward(c.h);
  const off = c.spec.len / 2 - c.spec.wid / 2;
  const r = c.spec.wid / 2 + 0.05;
  return [
    { x: c.x + f.x * off, z: c.z + f.z * off, r },
    { x: c.x - f.x * off, z: c.z - f.z * off, r },
  ];
}

/** Push a car out of buildings and the city edge. Returns the impact speed (m/s). */
export function collideWorld(city: City, c: Car) {
  let impact = 0;
  const near = buildingsNear(city, c.x, c.z);
  for (const circle of carCircles(c)) {
    for (const b of near) {
      const px = Math.max(b.x - b.hw, Math.min(circle.x, b.x + b.hw));
      const pz = Math.max(b.z - b.hd, Math.min(circle.z, b.z + b.hd));
      let dx = circle.x - px;
      let dz = circle.z - pz;
      let d = Math.hypot(dx, dz);
      if (d >= circle.r) continue;
      if (d < 1e-4) {
        // Centre inside the box: push out along the shallowest axis.
        const ox = b.hw - Math.abs(circle.x - b.x);
        const oz = b.hd - Math.abs(circle.z - b.z);
        if (ox < oz) {
          dx = Math.sign(circle.x - b.x) || 1;
          dz = 0;
          d = -ox;
        } else {
          dx = 0;
          dz = Math.sign(circle.z - b.z) || 1;
          d = -oz;
        }
        const n = { x: dx, z: dz };
        impact = Math.max(impact, bounce(c, n, circle.r - d));
        continue;
      }
      impact = Math.max(impact, bounce(c, { x: dx / d, z: dz / d }, circle.r - d));
    }
  }
  const m = 1.2;
  if (c.x < m) impact = Math.max(impact, bounce(c, { x: 1, z: 0 }, m - c.x));
  if (c.z < m) impact = Math.max(impact, bounce(c, { x: 0, z: 1 }, m - c.z));
  if (c.x > SIZE - m) impact = Math.max(impact, bounce(c, { x: -1, z: 0 }, c.x - (SIZE - m)));
  if (c.z > SIZE - m) impact = Math.max(impact, bounce(c, { x: 0, z: -1 }, c.z - (SIZE - m)));
  return impact;
}

function bounce(c: Car, n: { x: number; z: number }, depth: number) {
  c.x += n.x * depth;
  c.z += n.z * depth;
  const vn = c.vx * n.x + c.vz * n.z;
  if (vn >= 0) return 0;
  c.vx -= n.x * vn * 1.25;
  c.vz -= n.z * vn * 1.25;
  // Scrub some speed along the wall too.
  c.vx *= 0.92;
  c.vz *= 0.92;
  return -vn;
}

/** Resolve car-vs-car overlaps. Returns the closing speed (0 if none). */
export function collideCars(a: Car, b: Car) {
  if (Math.abs(a.x - b.x) > 8 || Math.abs(a.z - b.z) > 8) return 0;
  let impact = 0;
  for (const ca of carCircles(a))
    for (const cb of carCircles(b)) {
      const dx = ca.x - cb.x;
      const dz = ca.z - cb.z;
      const d = Math.hypot(dx, dz);
      const min = ca.r + cb.r;
      if (d >= min || d < 1e-5) continue;
      const n = { x: dx / d, z: dz / d };
      const ma = a.spec.mass;
      const mb = b.spec.mass;
      const push = min - d;
      a.x += n.x * push * (mb / (ma + mb));
      a.z += n.z * push * (mb / (ma + mb));
      b.x -= n.x * push * (ma / (ma + mb));
      b.z -= n.z * push * (ma / (ma + mb));
      const rel = (a.vx - b.vx) * n.x + (a.vz - b.vz) * n.z;
      if (rel >= 0) continue;
      const j = (-(1 + 0.25) * rel) / (1 / ma + 1 / mb);
      a.vx += (j / ma) * n.x;
      a.vz += (j / ma) * n.z;
      b.vx -= (j / mb) * n.x;
      b.vz -= (j / mb) * n.z;
      // A hit on the rear quarter spins the car (the PIT manoeuvre).
      const spin = Math.min(1.8, -rel * 0.08);
      const fb = forward(b.h);
      const side = (ca.x - b.x) * -fb.z + (ca.z - b.z) * fb.x;
      const along = (ca.x - b.x) * fb.x + (ca.z - b.z) * fb.z;
      if (along < 0) b.h += Math.sign(side || 1) * spin * 0.5 * (ma / mb);
      impact = Math.max(impact, -rel);
    }
  return impact;
}

/** Damage from an impact of `speed` m/s. */
export function damageFor(speed: number) {
  return speed < 3 ? 0 : (speed - 3) * 3.2;
}

// ------------------------------------------------------------------ AI driving

export function laneStart(from: number, to: number, offset = LANE) {
  const a = nodePos(from);
  const b = nodePos(to);
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const dx = (b.x - a.x) / len;
  const dz = (b.z - a.z) / len;
  const rx = -dz;
  const rz = dx;
  return { ax: a.x + rx * offset, az: a.z + rz * offset, bx: b.x + rx * offset, bz: b.z + rz * offset, dx, dz, len };
}

export function makeAi(from: number, to: number, next: number, cruise = SPEED_LIMIT * 0.85): Ai {
  return { mode: "cruise", from, to, next, cruise, stuck: 0, reverse: 0, yieldT: 0, weave: 0, wait: 0, s: 0 };
}

export interface AiWorld {
  city: City;
  time: number;
  cars: Car[];
  /** Obstacles on foot in the road (peds). */
  walkers: { x: number; z: number }[];
  /** Where to run from (flee). */
  threat: { x: number; z: number };
  rand: () => number;
  /** Police checkpoints: stop lines for traffic travelling along (dx, dz). */
  stops?: { id: string; x: number; z: number; dx: number; dz: number }[];
  /** Roadblocks: fleeing drivers route away from these. */
  avoid?: { x: number; z: number }[];
}

/** Choose where to go after `to` (not back to `from` unless it's a dead end). */
export function chooseNext(w: AiWorld, c: Car, from: number, to: number): number {
  const opts = neighbours(to).filter((n) => n !== from);
  const list = opts.length ? opts : neighbours(to);
  const ai = c.ai!;
  if (ai.mode === "flee") {
    // Away from the threat, with some randomness so it isn't predictable.
    let best = list[0];
    let score = -Infinity;
    for (const n of list) {
      const p = nodePos(n);
      let s = Math.hypot(p.x - w.threat.x, p.z - w.threat.z) + w.rand() * 90;
      for (const b of w.avoid ?? []) if (Math.hypot(p.x - b.x, p.z - b.z) < 45) s -= 500;
      if (s > score) {
        score = s;
        best = n;
      }
    }
    return best;
  }
  if (ai.mode === "respond" && ai.tx !== undefined && ai.tz !== undefined) {
    let best = list[0];
    let d = Infinity;
    for (const n of list) {
      const p = nodePos(n);
      const dd = Math.hypot(p.x - ai.tx, p.z - ai.tz!);
      if (dd < d) {
        d = dd;
        best = n;
      }
    }
    return best;
  }
  return list[Math.floor(w.rand() * list.length)];
}

/** Controls for an AI car this step. */
export function drive(w: AiWorld, c: Car, dt: number): Controls {
  const ai = c.ai!;
  const vf = speedOf(c);
  if (ai.mode === "parked" || c.health <= 0) return { throttle: 0, brake: 1, steer: 0, handbrake: false };

  // Unstick: back up with opposite lock for a moment.
  if (ai.reverse > 0) {
    ai.reverse -= dt;
    return { throttle: -0.8, brake: 0, steer: -Math.sign(c.steer || 1), handbrake: false };
  }

  const fleeing = ai.mode === "flee";
  const responding = ai.mode === "respond";
  const offset = ai.mode === "yield" || ai.mode === "stopped" ? 3.1 : LANE;
  let seg = laneStart(ai.from, ai.to, offset);
  const f = forward(c.h);
  // Progress along the current segment.
  let s = (c.x - seg.ax) * seg.dx + (c.z - seg.az) * seg.dz;
  if (s > seg.len - HALF_STREET + 1.5 && ai.mode !== "stopped") {
    // Through the intersection: move on to the next segment.
    ai.from = ai.to;
    ai.to = ai.next;
    ai.next = chooseNext(w, c, ai.from, ai.to);
    seg = laneStart(ai.from, ai.to, offset);
    s = (c.x - seg.ax) * seg.dx + (c.z - seg.az) * seg.dz;
  }
  const look = 5 + Math.abs(vf) * 0.45;
  let tx: number;
  let tz: number;
  if (s + look <= seg.len) {
    tx = seg.ax + seg.dx * (s + look);
    tz = seg.az + seg.dz * (s + look);
  } else {
    const nxt = laneStart(ai.to, ai.next, offset);
    const over = s + look - seg.len;
    tx = nxt.ax + nxt.dx * over;
    tz = nxt.az + nxt.dz * over;
  }
  // Chasing: once close with the target in the open, drive straight at it.
  if (responding && ai.tx !== undefined && ai.tz !== undefined) {
    const d = Math.hypot(ai.tx - c.x, ai.tz - c.z);
    if (d < 38) {
      tx = ai.tx;
      tz = ai.tz;
    }
  }
  if (ai.drunk) {
    ai.weave += dt * 0.9;
    const r = right(c.h);
    const wv = Math.sin(ai.weave) * 1.6;
    tx += r.x * wv;
    tz += r.z * wv;
  }

  const rx = tx - c.x;
  const rz = tz - c.z;
  const lf = rx * f.x + rz * f.z;
  const lr = rx * -f.z + rz * f.x;
  const steer = Math.max(-1, Math.min(1, Math.atan2(lr, Math.max(0.1, lf)) * 2.2));

  // Desired speed.
  let want = fleeing ? 30 : responding ? 26 : ai.cruise;
  const turning = ai.next !== undefined && laneTurn(ai.from, ai.to, ai.next);
  const toNode = seg.len - s;
  if (turning && toNode < 30) want = Math.min(want, fleeing || responding ? 13 : 7);
  if (Math.abs(steer) > 0.6) want = Math.min(want, 9);

  if (ai.mode === "yield" || ai.mode === "stopped") {
    want = Math.max(0, Math.min(want, vf - 6 * dt * 10));
    ai.yieldT += dt;
  } else if (!fleeing && !responding && !ai.reckless) {
    // Traffic light at the end of this segment.
    const axis = Math.abs(seg.dz) > 0.5 ? "ns" : "ew";
    const light = lightFor(ai.to, axis, w.time);
    const stopAt = toNode - HALF_STREET - 2;
    if (light !== "green" && stopAt > -1 && stopAt < 32 && !(light === "amber" && stopAt < 6)) {
      want = Math.min(want, Math.sqrt(Math.max(0, 2 * 5 * (stopAt - 0.5))));
    }
  }

  // Police checkpoint ahead in our lane: stop at the line until waved through.
  if (!fleeing && !responding && ai.mode === "cruise")
    for (const st of w.stops ?? []) {
      if (ai.waved === st.id || f.x * st.dx + f.z * st.dz < 0.7) continue;
      const ox = st.x - c.x;
      const oz = st.z - c.z;
      const ahead = ox * f.x + oz * f.z;
      if (ahead < -0.5 || ahead > 40 || Math.abs(ox * -f.z + oz * f.x) > 3) continue;
      want = Math.min(want, Math.sqrt(Math.max(0, 2 * 5 * (ahead - 1.5))));
    }

  // Keep a gap to the car (or person) ahead. Cars crossing our path only
  // matter while they're moving (a stopped cross car is waiting its turn), and
  // after 6 s of being held up a driver creeps past cross traffic (never into
  // the car in front of it).
  ai.s = s;
  const lightWant = want;
  if (!responding) {
    for (const o of w.cars) {
      if (o === c) continue;
      const ox = o.x - c.x;
      const oz = o.z - c.z;
      const ahead = ox * f.x + oz * f.z;
      if (ahead <= 0 || ahead > 34) continue;
      const lat = Math.abs(ox * -f.z + oz * f.x);
      if (lat > 2.4) continue;
      const fo = forward(o.h);
      const same = fo.x * f.x + fo.z * f.z > 0.4;
      const moving = Math.hypot(o.vx, o.vz) > 1;
      if (!same && (ai.wait >= 6 || !(moving && ahead < 12))) continue;
      const gap = ahead - c.spec.len / 2 - o.spec.len / 2;
      want = Math.min(want, Math.max(0, (gap - 2.5) * (fleeing ? 1.6 : 0.8)));
    }
    if (!fleeing)
      for (const p of w.walkers) {
        const ox = p.x - c.x;
        const oz = p.z - c.z;
        const ahead = ox * f.x + oz * f.z;
        // Beside the car (e.g. the officer at the window) isn't in the way.
        if (ahead <= c.spec.len / 2 || ahead > 18) continue;
        if (Math.abs(ox * -f.z + oz * f.x) > 1.8) continue;
        want = Math.min(want, Math.max(0, (ahead - c.spec.len / 2 - 2) * 0.8));
      }
  }

  if (want < 0.5 && lightWant > 2 && ai.mode === "cruise") ai.wait += dt;
  else if (ai.wait >= 6) {
    ai.wait += dt;
    if (ai.wait > 8) ai.wait = 0;
  } else ai.wait = 0;

  const diff = want - vf;
  let throttle = diff > 0 ? Math.min(1, diff * 0.35 + 0.1) : 0;
  let brake = diff < -0.4 ? Math.min(1, -diff * 0.3) : 0;
  if (want < 0.2 && vf < 0.4) {
    throttle = 0;
    brake = 1;
  }

  // Stuck against something while trying to go.
  if (throttle > 0.4 && Math.abs(vf) < 0.6) ai.stuck += dt;
  else ai.stuck = Math.max(0, ai.stuck - dt * 2);
  if (ai.stuck > (fleeing ? 0.9 : 2.5)) {
    ai.stuck = 0;
    ai.reverse = fleeing ? 0.9 : 1.4;
  }
  if (fleeing && Math.abs(steer) > 0.85 && vf > 16) brake = Math.max(brake, 0.5);
  return { throttle, brake, steer, handbrake: false };
}

/** Is from→to→next a turn (not straight on)? */
export function laneTurn(from: number, to: number, next: number) {
  const a = nodePos(from);
  const b = nodePos(to);
  const c = nodePos(next);
  const d1x = Math.sign(b.x - a.x);
  const d1z = Math.sign(b.z - a.z);
  const d2x = Math.sign(c.x - b.x);
  const d2z = Math.sign(c.z - b.z);
  return d1x !== d2x || d1z !== d2z;
}

/** Place a car at a random spot on the lane between two nodes (facing along it). */
export function spawnOnLane(c: Car, from: number, to: number, t: number) {
  const seg = laneStart(from, to);
  const s = HALF_STREET + 3 + (seg.len - 2 * HALF_STREET - 6) * t;
  c.x = seg.ax + seg.dx * s;
  c.z = seg.az + seg.dz * s;
  c.h = Math.atan2(seg.dz, seg.dx);
  return c;
}

export { LINES };

/** Indicator state for rendering: -1 left, 1 right, 2 hazards, 0 off. */
export function signalOf(c: Car): -1 | 0 | 1 | 2 {
  const ai = c.ai;
  if (!ai) return 0;
  if (ai.mode === "stopped" || ai.mode === "parked" || c.health < 30) return 2;
  if (ai.mode !== "cruise" && ai.mode !== "yield") return 0;
  if (!laneTurn(ai.from, ai.to, ai.next)) return 0;
  const seg = laneStart(ai.from, ai.to);
  if (seg.len - ai.s > 32) return 0;
  const a = nodePos(ai.from);
  const b = nodePos(ai.to);
  const n = nodePos(ai.next);
  const cross = (b.x - a.x) * (n.z - b.z) - (b.z - a.z) * (n.x - b.x);
  return cross > 0 ? 1 : -1;
}
