import { LEADS, VEHICLES } from "./data";
import { carById, clamp, emit, fwdSpeed, pedById, speedOf, type Car, type Ped, type State } from "./state";
import { groundY, onDeck, pushOut, surfaceAt, WATER_Y, type Solid } from "./world";

/**
 * Vehicles: a bicycle model with tyre grip (so a handbrake turn slides), circle collisions
 * against the city and each other, crash damage, smoke, fire and explosions, sinking, boats
 * that only go in water, and getting in and out (or dragging the driver out).
 */

export interface Drive {
  throttle: number;
  steer: number;
  handbrake: boolean;
}

export const NO_DRIVE: Drive = { throttle: 0, steer: 0, handbrake: false };

const GRIP: Record<string, { grip: number; top: number }> = {
  road: { grip: 1, top: 1 },
  deck: { grip: 1, top: 1 },
  walk: { grip: 0.95, top: 0.95 },
  lot: { grip: 0.9, top: 0.9 },
  grass: { grip: 0.7, top: 0.72 },
  sand: { grip: 0.55, top: 0.58 },
  water: { grip: 0.3, top: 0.2 },
};

const scratch: Solid[] = [];

export function stepCar(s: State, c: Car, d: Drive, dt: number) {
  const spec = VEHICLES[c.kind];
  if (spec.air) return;
  if (c.wrecked) {
    c.vx *= Math.pow(0.05, dt);
    c.vz *= Math.pow(0.05, dt);
    c.x += c.vx * dt;
    c.z += c.vz * dt;
    return;
  }
  const fx = Math.cos(c.h);
  const fz = Math.sin(c.h);
  const rx = -fz;
  const rz = fx;
  let vf = c.vx * fx + c.vz * fz;
  let vl = c.vx * rx + c.vz * rz;
  const wet = groundY(c.x, c.z) < WATER_Y - 0.1 && !onDeck(c.x, c.z);
  const surf = spec.water ? (wet ? GRIP.road : { grip: 2.5, top: 0.08 }) : GRIP[surfaceAt(s.city, c.x, c.z)] ?? GRIP.road;
  // Sinking: an engine in the sea soon dies.
  if (!spec.water && wet) {
    c.sink += dt;
    if (c.sink > 2.5) d = { throttle: 0, steer: d.steer, handbrake: false };
  } else if (!wet) c.sink = Math.max(0, c.sink - dt * 2);
  const dead = c.hp <= 0;
  const throttle = dead ? 0 : clamp(d.throttle, -1, 1);
  c.throttle = throttle;
  const driver = pedById(s, c.seats[0]);
  const perk = driver && driver.role === "player" && s.chars[s.active].id === "nina" ? 1.12 : 1;
  const top = spec.top * surf.top * (c.hp < spec.hp * 0.25 ? 0.75 : 1);
  // Engine and brakes.
  c.brake = false;
  if (throttle > 0.02) {
    if (vf < -0.5) {
      vf = Math.min(0, vf + spec.brake * throttle * dt);
      c.brake = true;
    } else {
      const k = Math.max(0, 1 - Math.pow(Math.max(0, vf) / top, 2));
      vf += spec.accel * throttle * (0.35 + 0.65 * k) * dt * (vf < top ? 1 : 0);
    }
  } else if (throttle < -0.02) {
    if (vf > 0.5) {
      vf = Math.max(0, vf + spec.brake * throttle * dt);
      c.brake = true;
    } else if (vf > -top * 0.32) vf += spec.accel * 0.6 * throttle * dt;
  } else {
    // Coasting: engine braking and rolling resistance.
    const drag = (spec.water ? 2.4 : 1.6) * dt;
    vf = Math.abs(vf) < drag ? 0 : vf - Math.sign(vf) * drag;
  }
  if (d.handbrake && !spec.water) {
    const hb = spec.brake * 0.55 * dt;
    vf = Math.abs(vf) < hb ? 0 : vf - Math.sign(vf) * hb;
  }
  vf -= vf * Math.abs(vf) * 0.0009 * dt * 10;
  // Steering: less lock at speed.
  const sp = Math.abs(vf);
  const lock = spec.lock / (1 + (sp * sp) / 650);
  c.steer += (clamp(d.steer, -1, 1) * lock - c.steer) * Math.min(1, dt * 8);
  const yawTarget = (vf / spec.base) * Math.tan(c.steer) * (d.handbrake ? 1.35 : 1);
  const grip = spec.grip * surf.grip * perk * (d.handbrake ? 0.22 : 1);
  c.w += (yawTarget - c.w) * Math.min(1, dt * (spec.water ? 2.5 : 9));
  c.h += c.w * dt;
  // Lateral slip decays with grip; what's left is the slide.
  vl *= Math.exp(-grip * dt);
  const nfx = Math.cos(c.h);
  const nfz = Math.sin(c.h);
  c.vx = nfx * vf + -nfz * vl;
  c.vz = nfz * vf + nfx * vl;
  if (!spec.water && wet) {
    c.vx *= Math.pow(0.25, dt);
    c.vz *= Math.pow(0.25, dt);
  }
  c.x += c.vx * dt;
  c.z += c.vz * dt;
  c.y = spec.water && wet ? WATER_Y + Math.sin(s.t * 2 + c.id) * 0.06 : wet ? Math.max(WATER_Y - 1.6, WATER_Y - c.sink * 0.4) : 0;
  // Fire: a badly smashed car catches, then blows.
  if (c.hp <= 0 && c.burn < 0) c.burn = 4.5;
  if (c.burn >= 0) {
    c.burn -= dt;
    if (c.burn <= 0) blowUp(s, c);
  }
  if (c.horn > 0) c.horn -= dt;
  if (c.alarm > 0) c.alarm -= dt;
}

/** The circles a car is made of (2 or 3 along its length). */
export function circles(c: Car, out: { x: number; z: number; r: number }[] = []) {
  const spec = VEHICLES[c.kind];
  out.length = 0;
  const r = spec.wid / 2 + 0.05;
  const n = spec.len > 12 ? Math.ceil(spec.len / 2.6) : spec.len > 5 ? 3 : 2;
  const fx = Math.cos(c.h);
  const fz = Math.sin(c.h);
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1) - 0.5) * (spec.len - spec.wid);
    out.push({ x: c.x + fx * t, z: c.z + fz * t, r });
  }
  return out;
}

const circ: { x: number; z: number; r: number }[] = [];
const circB: { x: number; z: number; r: number }[] = [];

/** Keep a car out of buildings, posts and containers; crash damage from the hit. */
export function collideWorld(s: State, c: Car) {
  const spec = VEHICLES[c.kind];
  if (spec.air) return;
  let hitN: { x: number; z: number } | null = null;
  let mx = 0;
  let mz = 0;
  circles(c, circ);
  for (const k of circ) {
    const p = { x: k.x, z: k.z };
    const r = pushOut(s.city, p, k.r, scratch);
    if (r.hit) {
      mx += p.x - k.x;
      mz += p.z - k.z;
      hitN = { x: r.nx, z: r.nz };
    }
  }
  if (!hitN) return;
  c.x += mx / circ.length;
  c.z += mz / circ.length;
  const vn = c.vx * hitN.x + c.vz * hitN.z;
  if (vn < 0) {
    c.vx -= 1.25 * vn * hitN.x;
    c.vz -= 1.25 * vn * hitN.z;
    c.w *= 0.5;
    crashDamage(s, c, -vn);
  }
  // Boats are kept off the land.
  if (spec.water && groundY(c.x, c.z) > WATER_Y - 0.1) {
    c.vx *= 0.6;
    c.vz *= 0.6;
  }
}

export function crashDamage(s: State, c: Car, impact: number) {
  if (impact < 3.5) return;
  const spec = VEHICLES[c.kind];
  const dmg = Math.pow(impact - 3, 1.7) * 9 * (spec.police ? 0.7 : 1);
  c.hp -= dmg;
  emit(s, { kind: "crash", x: c.x, z: c.z, n: Math.min(1, impact / 20) });
  // People inside get shaken (hurt at high speed).
  if (impact > 14) for (const id of c.seats) {
    const p = pedById(s, id);
    if (p && p.state === "ok") {
      const k = p.role === "player" && s.chars[s.active].id === "dex" ? 0.7 : 1;
      p.hp -= (impact - 14) * 2.2 * k;
      p.hitT = 0.3;
    }
  }
}

/** Two cars that touch push apart, swap momentum and dent each other. */
export function collideCars(s: State, a: Car, b: Car) {
  const sa = VEHICLES[a.kind];
  const sb = VEHICLES[b.kind];
  if (sa.air || sb.air) return;
  const reach = (sa.len + sb.len) / 2 + 2;
  if (Math.abs(a.x - b.x) > reach || Math.abs(a.z - b.z) > reach) return;
  if (!!sa.water !== !!sb.water) return;
  circles(a, circ);
  circles(b, circB);
  let best: { d: number; nx: number; nz: number; pen: number } | null = null;
  for (const p of circ)
    for (const q of circB) {
      const dx = p.x - q.x;
      const dz = p.z - q.z;
      const d = Math.hypot(dx, dz);
      const pen = p.r + q.r - d;
      if (pen > 0 && (!best || pen > best.pen)) best = { d, nx: d > 1e-6 ? dx / d : 1, nz: d > 1e-6 ? dz / d : 0, pen };
    }
  if (!best) return;
  const ma = sa.mass;
  const mb = sb.mass;
  const tot = ma + mb;
  a.x += best.nx * best.pen * (mb / tot);
  a.z += best.nz * best.pen * (mb / tot);
  b.x -= best.nx * best.pen * (ma / tot);
  b.z -= best.nz * best.pen * (ma / tot);
  const rv = (a.vx - b.vx) * best.nx + (a.vz - b.vz) * best.nz;
  if (rv >= 0) return;
  const j = (-(1 + 0.3) * rv) / (1 / ma + 1 / mb);
  a.vx += (j / ma) * best.nx;
  a.vz += (j / ma) * best.nz;
  b.vx -= (j / mb) * best.nx;
  b.vz -= (j / mb) * best.nz;
  a.w += (s.rng.next() - 0.5) * Math.min(2, -rv * 0.08);
  b.w += (s.rng.next() - 0.5) * Math.min(2, -rv * 0.08);
  crashDamage(s, a, -rv * (mb / tot) * 1.4);
  crashDamage(s, b, -rv * (ma / tot) * 1.4);
  a.lastHit = b.seats[0];
  b.lastHit = a.seats[0];
  // A driver who gets hit gets angry (or scared).
  for (const [x, y] of [[a, b], [b, a]] as const) {
    if (x.ai.mode === "traffic" && pedById(s, x.seats[0])?.role === "civ" && pedById(s, y.seats[0])?.role === "player") {
      x.horn = 1.2;
      if (-rv > 8) x.ai.mode = "flee";
    }
  }
}

/** A car hits someone on foot. */
export function hitPeds(s: State, c: Car, onHit: (p: Ped, speed: number) => void) {
  const spec = VEHICLES[c.kind];
  if (spec.air) return;
  const sp = speedOf(c);
  const fx = Math.cos(c.h);
  const fz = Math.sin(c.h);
  for (const p of s.peds) {
    if (p.car >= 0 || p.state === "dead" || p.swim) continue;
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
    const along = dx * fx + dz * fz;
    const across = -dx * fz + dz * fx;
    const hl = spec.len / 2 + 0.3;
    const hw = spec.wid / 2 + 0.3;
    if (Math.abs(along) > hl || Math.abs(across) > hw) continue;
    if (p.y > 1.2) continue;
    if (sp > 3.2 && p.state === "ok") onHit(p, sp);
    // Push them out of the side they're nearest.
    const ox = hl - Math.abs(along);
    const oz = hw - Math.abs(across);
    if (ox < oz) {
      const k = Math.sign(along) * ox;
      p.x += fx * k;
      p.z += fz * k;
    } else {
      const k = Math.sign(across) * oz;
      p.x += -fz * k;
      p.z += fx * k;
    }
  }
}

/** Blow a car up: the boom, a blackened wreck, and everyone inside. */
export function blowUp(s: State, c: Car) {
  if (c.wrecked) return;
  c.wrecked = true;
  c.burn = -1;
  c.hp = 0;
  c.ai.mode = "wreck";
  c.siren = false;
  // The blast itself is combat's (people and cars near it).
  boomHook?.(s, c.x, c.z, 1.2, 8, 170, c.lastHit);
  for (let i = 0; i < c.seats.length; i++) {
    const p = pedById(s, c.seats[i]);
    if (!p) continue;
    c.seats[i] = -1;
    p.car = -1;
    p.seat = -1;
    p.x = c.x + (i % 2 ? 1.6 : -1.6) * Math.sin(c.h);
    p.z = c.z - (i % 2 ? 1.6 : -1.6) * Math.cos(c.h);
    killHook?.(s, p, 400, c.lastHit);
  }
  c.vx += (s.rng.next() - 0.5) * 3;
  c.vz += (s.rng.next() - 0.5) * 3;
}

/** Set by combat.ts (it owns explosions and deaths). */
let boomHook: ((s: State, x: number, z: number, y: number, r: number, dmg: number, by: number) => void) | null = null;
let killHook: ((s: State, p: Ped, dmg: number, by: number) => void) | null = null;
export function setHooks(boom: typeof boomHook, kill: typeof killHook) {
  boomHook = boom;
  killHook = kill;
}

/* ------------------------------------------------------------------ getting in and out */

/** Where someone stands to get in a seat (driver's door is on the left). */
export function doorSpot(c: Car, seat: number) {
  const spec = VEHICLES[c.kind];
  // Right-hand drive: the driver gets in on the right.
  const side = seat % 2 === 0 ? 1 : -1;
  const back = seat >= 2 ? -0.9 : 0.25;
  const fx = Math.cos(c.h);
  const fz = Math.sin(c.h);
  const off = spec.wid / 2 + 0.7;
  return { x: c.x + fx * back * (spec.len / 4) + -fz * side * off, z: c.z + fz * back * (spec.len / 4) + fx * side * off };
}

/** The nearest car someone on foot could get into (within reach). */
export function carToEnter(s: State, p: Ped, reach = 3.4) {
  let best: Car | undefined;
  let bd = Infinity;
  for (const c of s.cars) {
    if (c.wrecked || VEHICLES[c.kind].air || c.tram) continue;
    const spec = VEHICLES[c.kind];
    const d = Math.hypot(c.x - p.x, c.z - p.z) - spec.len / 2 + 1;
    if (d < reach && d < bd && c.sink < 1.5) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** Put someone in a seat (no checks). */
export function seat(s: State, p: Ped, c: Car, i: number) {
  c.seats[i] = p.id;
  p.car = c.id;
  p.seat = i;
  p.vx = 0;
  p.vz = 0;
  p.aiming = false;
}

/** Get out on your own side (or the other, if that's blocked); bail out at speed. */
export function leave(s: State, p: Ped) {
  const c = carById(s, p.car);
  p.car = -1;
  if (!c) return;
  const i = c.seats.indexOf(p.id);
  if (i >= 0) c.seats[i] = -1;
  const spot = doorSpot(c, p.seat < 0 ? 0 : p.seat);
  p.seat = -1;
  p.x = spot.x;
  p.z = spot.z;
  p.h = c.h;
  const sp = speedOf(c);
  if (sp > 9) {
    // Bailing out: tumble along the road.
    p.vx = c.vx * 0.55;
    p.vz = c.vz * 0.55;
    p.state = "down";
    p.downT = 0;
    p.hp -= Math.min(30, (sp - 9) * 1.6);
  }
  if (groundY(p.x, p.z) < WATER_Y) p.swim = true;
}

/** A thrown-out driver's car keeps rolling; a driverless car slows. */
export function driverless(c: Car) {
  return c.seats[0] < 0;
}

export function leadPerkGrip(s: State) {
  return s.chars[s.active].id === "nina" ? LEADS.nina.perk : "";
}

export { fwdSpeed };
