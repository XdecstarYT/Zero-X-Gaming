import { VEHICLES, WEAPONS, type WeaponId } from "./data";
import { crime, isCop } from "./police";
import { carById, clamp, emit, pedById, type Car, type Ped, type State } from "./state";
import { blowUp, setHooks } from "./vehicles";
import { groundY, solidsNear, WATER_Y, type Solid } from "./world";

/**
 * Combat: guns are hitscan rays (with spread, against people, vehicles, the helicopter and the
 * buildings), fists and bats hit what's in front, grenades arc and bounce; explosions hurt,
 * knock down and set cars burning. Deaths drop cash and ammo.
 */

const EYE = 1.42;
const scratch: Solid[] = [];

export interface Hit {
  t: number;
  ped?: Ped;
  car?: Car;
  wall?: boolean;
}

/** Cast a ray; the nearest thing it hits within `range`. */
export function cast(s: State, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, range: number, skipPed: number, skipCar: number): Hit | null {
  let best: Hit | null = null;
  const consider = (h: Hit) => {
    if (h.t >= 0 && h.t <= range && (!best || h.t < best.t)) best = h;
  };
  const hh = dx * dx + dz * dz;
  // People (standing: a vertical cylinder; down: a low one).
  for (const p of s.peds) {
    if (p.id === skipPed || p.car >= 0) continue;
    if (p.state === "dead" && p.downT > 0.5) continue;
    if (Math.abs(p.x - ox) > range + 2 || Math.abs(p.z - oz) > range + 2) continue;
    if (hh < 1e-9) continue;
    const t = ((p.x - ox) * dx + (p.z - oz) * dz) / hh;
    if (t < 0) continue;
    const cx = ox + dx * t - p.x;
    const cz = oz + dz * t - p.z;
    const r = p.state === "ok" ? 0.36 : 0.7;
    if (cx * cx + cz * cz > r * r) continue;
    const y = oy + dy * t;
    const y0 = p.swim ? WATER_Y - 0.4 : p.y;
    const y1 = y0 + (p.state === "ok" ? (p.swim ? 0.9 : 1.8) : 0.5);
    if (y < y0 - 0.1 || y > y1) continue;
    consider({ t: t * Math.sqrt(hh + dy * dy), ped: p });
  }
  // Vehicles (a box, or a ball for the helicopter).
  for (const c of s.cars) {
    if (c.id === skipCar) continue;
    if (Math.abs(c.x - ox) > range + 8 || Math.abs(c.z - oz) > range + 8) continue;
    const spec = VEHICLES[c.kind];
    if (spec.air) {
      const ex = c.x - ox;
      const ey = c.y - oy;
      const ez = c.z - oz;
      const L = Math.hypot(dx, dy, dz);
      const t = (ex * dx + ey * dy + ez * dz) / (L * L);
      if (t < 0) continue;
      const q = Math.hypot(ex - dx * t, ey - dy * t, ez - dz * t);
      if (q < 3) consider({ t: t * L, car: c });
      continue;
    }
    const fx = Math.cos(c.h);
    const fz = Math.sin(c.h);
    const lx = (ox - c.x) * fx + (oz - c.z) * fz;
    const lz = -(ox - c.x) * fz + (oz - c.z) * fx;
    const ldx = dx * fx + dz * fz;
    const ldz = -dx * fz + dz * fx;
    const hl = spec.len / 2;
    const hw = spec.wid / 2;
    let t0 = 0;
    let t1 = 1e9;
    const slab = (p: number, v: number, lo: number, hi: number) => {
      if (Math.abs(v) < 1e-9) return p >= lo && p <= hi;
      let a = (lo - p) / v;
      let b = (hi - p) / v;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      return t0 <= t1;
    };
    if (!slab(lx, ldx, -hl, hl) || !slab(lz, ldz, -hw, hw)) continue;
    const y = oy + dy * t0;
    const top = spec.water ? 1.4 : spec.body === "van" || spec.body === "transport" || spec.body === "ambulance" ? 2.5 : 1.6;
    if (y < c.y - 0.2 || y > c.y + top) continue;
    consider({ t: t0 * Math.sqrt(hh + dy * dy), car: c });
  }
  // Buildings.
  const L = Math.sqrt(hh + dy * dy);
  const mx = ox + (dx / L) * range * 0.5;
  const mz = oz + (dz / L) * range * 0.5;
  for (const w of solidsNear(s.city, mx, mz, range * 0.5 + 4, scratch)) {
    if (w.round) continue;
    let t0 = 0;
    let t1 = 1e9;
    const slab = (p: number, v: number, lo: number, hi: number) => {
      if (Math.abs(v) < 1e-9) return p >= lo && p <= hi;
      let a = (lo - p) / v;
      let b = (hi - p) / v;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      return t0 <= t1;
    };
    if (!slab(ox, dx, w.x - w.hw, w.x + w.hw) || !slab(oz, dz, w.z - w.hd, w.z + w.hd)) continue;
    const y = oy + dy * t0;
    if (y > w.h) continue;
    consider({ t: t0 * L, wall: true });
  }
  // The ground.
  if (dy < -1e-4) {
    const t = (0 - oy) / dy;
    consider({ t: t * L, wall: true });
  }
  return best;
}

/** The best target to lock on to in front of someone (aim assist). */
export function lockOn(s: State, p: Ped, h: number, cone: number, range: number, prefer?: (q: Ped) => number): Ped | Car | null {
  let best: Ped | Car | null = null;
  let bs = Infinity;
  const ox = p.car >= 0 ? (carById(s, p.car)?.x ?? p.x) : p.x;
  const oz = p.car >= 0 ? (carById(s, p.car)?.z ?? p.z) : p.z;
  for (const q of s.peds) {
    if (q.id === p.id || q.state !== "ok" || q.car >= 0) continue;
    const d = Math.hypot(q.x - ox, q.z - oz);
    if (d > range || d < 0.5) continue;
    const a = Math.abs(wrapA(Math.atan2(q.z - oz, q.x - ox) - h));
    if (a > cone) continue;
    if (!losClear(s, ox, oz, q.x, q.z)) continue;
    const score = a * 8 + d * 0.05 + (prefer ? prefer(q) : 0);
    if (score < bs) {
      bs = score;
      best = q;
    }
  }
  for (const c of s.cars) {
    if (c.wrecked || c.id === p.car) continue;
    const spec = VEHICLES[c.kind];
    const hostileCar = spec.police || spec.air || c.tag;
    if (!hostileCar) continue;
    const d = Math.hypot(c.x - ox, c.z - oz);
    if (d > range * (spec.air ? 1.6 : 1)) continue;
    const a = Math.abs(wrapA(Math.atan2(c.z - oz, c.x - ox) - h));
    if (a > cone) continue;
    const score = a * 8 + d * 0.05 + 4;
    if (score < bs) {
      bs = score;
      best = c;
    }
  }
  return best;
}

const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function losClear(s: State, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const L = Math.hypot(dx, dz);
  if (L < 1) return true;
  const hit = cast(s, ax, EYE, az, dx / L, 0, dz / L, L, -1, -1);
  return !hit || !hit.wall || hit.t > L - 0.5;
}

/** Aim at a target: heading and pitch from someone's gun to its middle. */
export function aimAt(s: State, p: Ped, t: Ped | Car) {
  const o = muzzle(s, p);
  const ty = "kind" in t ? (VEHICLES[t.kind].air ? t.y : 0.9) : t.state === "ok" ? t.y + 1.2 : 0.3;
  const dx = t.x - o.x;
  const dz = t.z - o.z;
  return { h: Math.atan2(dz, dx), p: Math.atan2(ty - o.y, Math.hypot(dx, dz)) };
}

function muzzle(s: State, p: Ped) {
  if (p.car >= 0) {
    const c = carById(s, p.car);
    if (c) return { x: c.x, y: c.y + 1.25, z: c.z };
  }
  return { x: p.x, y: (p.swim ? WATER_Y : p.y) + EYE, z: p.z };
}

/** Pull the trigger (or swing). Returns whether it fired. */
export function fire(s: State, p: Ped, h: number, pitch: number): boolean {
  if (p.state !== "ok" || p.cool > 0 || p.reloadT > 0 || p.swim || p.enterT > 0) return false;
  const w = WEAPONS[p.weapon];
  const isPlayer = p.role === "player";
  const dex = isPlayer && s.chars[s.active].id === "dex";
  if (p.car >= 0 && (w.melee || w.thrown || p.weapon === "shotgun" || p.weapon === "rifle")) return false;
  p.cool = 1 / w.rate;
  p.fireT = 0.08;
  p.aimH = h;
  p.aimP = pitch;
  if (p.car < 0) p.h = h;
  if (w.melee) {
    melee(s, p, h, w.dmg * (dex ? 1.35 : 1), w.range);
    return true;
  }
  if (w.thrown) {
    const n = p.ammo[p.weapon] ?? 0;
    if (n <= 0) return false;
    p.ammo[p.weapon] = n - 1;
    throwGrenade(s, p, h, pitch);
    if (isPlayer) syncAmmo(s, p);
    return true;
  }
  if (p.clip <= 0) {
    startReload(s, p);
    return false;
  }
  p.clip--;
  if (isPlayer) {
    s.stats.shots++;
    syncAmmo(s, p);
  }
  const o = muzzle(s, p);
  const moving = Math.hypot(p.vx, p.vz) > 2.5 || p.car >= 0;
  const spread = w.spread * (p.aiming ? 0.55 : 1) * (moving ? 1.5 : 1) * (dex ? 0.7 : 1) * (isPlayer ? 1 : 1.6);
  emit(s, { kind: "shot", x: o.x, z: o.z, who: p.weapon, n: isPlayer ? 1 : 0 });
  for (let k = 0; k < w.pellets; k++) {
    const hh = h + gauss(s) * spread;
    const pp = pitch + gauss(s) * spread * 0.6;
    const dx = Math.cos(pp) * Math.cos(hh);
    const dy = Math.sin(pp);
    const dz = Math.cos(pp) * Math.sin(hh);
    const hit = cast(s, o.x, o.y, o.z, dx, dy, dz, w.range, p.id, p.car);
    const t = hit ? hit.t : w.range;
    if (k === 0 || k % 3 === 0) s.tracers.push({ ax: o.x + dx * 0.6, ay: o.y, az: o.z + dz * 0.6, bx: o.x + dx * t, by: o.y + dy * t, bz: o.z + dz * t, t: 0, by_: p.id });
    if (!hit) continue;
    const fall = clamp(1.2 - t / w.range, 0.45, 1);
    if (hit.ped) {
      if (isPlayer) s.stats.hits++;
      damage(s, hit.ped, w.dmg * fall, p.id, h);
    } else if (hit.car) {
      shootCar(s, hit.car, w.dmg * fall, p.id);
      if (isPlayer) s.stats.hits++;
    }
  }
  // Gunfire: people near it run; the shooting gets reported.
  alarm(s, o.x, o.z, w.noise, p);
  if (isPlayer) crime(s, "shoot", o.x, o.z);
  if (p.clip <= 0) startReload(s, p);
  return true;
}

export function startReload(s: State, p: Ped) {
  const w = WEAPONS[p.weapon];
  if (w.melee || w.thrown || p.reloadT > 0) return;
  const reserve = p.ammo[p.weapon] ?? 0;
  if (reserve <= 0 || p.clip >= w.clip) return;
  p.reloadT = w.reload;
}

/** Called each step: finishing a reload moves rounds from the reserve to the clip. */
export function tickWeapon(s: State, p: Ped, dt: number) {
  if (p.cool > 0) p.cool -= dt;
  if (p.fireT > 0) p.fireT -= dt;
  if (p.hitT > 0) p.hitT -= dt;
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      const w = WEAPONS[p.weapon];
      const reserve = p.ammo[p.weapon] ?? 0;
      const n = Math.min(w.clip - p.clip, reserve);
      p.clip += n;
      p.ammo[p.weapon] = reserve - n;
      if (p.role === "player") syncAmmo(s, p);
    }
  }
}

/** Keep the lead's inventory (reserve + clip) in step with their ped. */
export function syncAmmo(s: State, p: Ped) {
  const cs = s.chars[s.active];
  for (const k of Object.keys(p.ammo) as WeaponId[]) cs.weapons[k] = (p.ammo[k] ?? 0) + (k === p.weapon ? p.clip : 0);
  cs.weapon = p.weapon;
}

function gauss(s: State) {
  return (s.rng.next() + s.rng.next() + s.rng.next() - 1.5) * 1.2;
}

function melee(s: State, p: Ped, h: number, dmg: number, range: number) {
  emit(s, { kind: "punch", x: p.x, z: p.z });
  let best: Ped | null = null;
  let bd = Infinity;
  for (const q of s.peds) {
    if (q.id === p.id || q.state === "dead" || q.car >= 0) continue;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > range + 0.4) continue;
    const a = Math.abs(wrapA(Math.atan2(dz, dx) - h));
    if (a > 1 || d >= bd) continue;
    best = q;
    bd = d;
  }
  if (best) {
    damage(s, best, dmg, p.id, h, dmg > 20 || s.rng.next() < 0.2);
    return;
  }
  // A swing at a car's window.
  for (const c of s.cars) {
    if (Math.hypot(c.x - p.x, c.z - p.z) < VEHICLES[c.kind].len / 2 + range) {
      c.hp -= dmg * 0.3;
      c.lastHit = p.id;
      break;
    }
  }
}

/** Hurt someone (armour first); knock them down if it's a big hit. */
export function damage(s: State, q: Ped, dmg: number, by: number, h = 0, knock = false) {
  if (q.state === "dead") return;
  const isLead = q.role === "player";
  if (isLead && s.chars[s.active].id === "dex") dmg *= 0.75;
  if (q.armor > 0) {
    const a = Math.min(q.armor, dmg * 0.66);
    q.armor -= a;
    dmg -= a;
  }
  q.hp -= dmg;
  q.hitT = 0.25;
  q.lastHit = by;
  q.vx += Math.cos(h) * Math.min(3, dmg * 0.06);
  q.vz += Math.sin(h) * Math.min(3, dmg * 0.06);
  const shooter = pedById(s, by);
  emit(s, { kind: "hit", x: q.x, z: q.z, n: dmg, who: q.role });
  if (q.hp <= 0) {
    kill(s, q, by);
    return;
  }
  if (knock && q.state === "ok") {
    q.state = "down";
    q.downT = 0;
  }
  reactToHit(s, q, shooter);
}

/** Someone's been hurt: they run, or turn on whoever did it. */
function reactToHit(s: State, q: Ped, by: Ped | undefined) {
  if (!by || q.role === "player") return;
  if (by.role === "player") {
    if (isCop(q)) crime(s, "copAttack", q.x, q.z);
    else if (q.role === "civ") crime(s, "assault", q.x, q.z);
  }
  if (q.role === "civ" && q.car < 0) {
    if (q.hostile || (q.look.seed % 5 === 0 && WEAPONS[q.weapon].melee)) {
      q.ai.mode = "fight";
      q.ai.target = by.id;
      q.ai.timer = 20;
    } else {
      q.ai.mode = "flee";
      q.ai.dx = by.x;
      q.ai.dz = by.z;
      q.ai.timer = 12;
    }
  }
  if (q.role === "gang" || q.role === "mission") {
    q.hostile = true;
    q.ai.mode = "fight";
    q.ai.target = by.id;
  }
}

/** Death. */
export function kill(s: State, q: Ped, by: number) {
  if (q.state === "dead") return;
  q.state = "dead";
  q.hp = 0;
  q.downT = 0;
  q.aiming = false;
  const c = q.car >= 0 ? carById(s, q.car) : undefined;
  if (c) {
    const i = c.seats.indexOf(q.id);
    if (i >= 0) c.seats[i] = -1;
    q.car = -1;
    q.x = c.x - Math.sin(c.h) * (VEHICLES[c.kind].wid / 2 + 0.8);
    q.z = c.z + Math.cos(c.h) * (VEHICLES[c.kind].wid / 2 + 0.8);
    if (i === 0 && c.ai.mode !== "wreck") c.ai.mode = "idle";
  }
  if (q.role === "player") {
    if (!s.down) s.down = { kind: "hospitalised", t: 4.5 };
    emit(s, { kind: "hospitalised" });
    return;
  }
  const killer = pedById(s, by);
  if (killer && killer.role === "player") {
    s.stats.kills++;
    if (isCop(q)) {
      s.stats.copsKilled++;
      s.wanted.copKills++;
      crime(s, "copKill", q.x, q.z);
    } else crime(s, "kill", q.x, q.z);
  }
  // What they drop: cash, or a cop's / gangster's gun.
  if (q.role === "civ" && s.rng.next() < 0.55) s.pickups.push({ id: s.nextId++, kind: "cash", x: q.x + 0.4, z: q.z, n: s.rng.int(5, 60), respawn: 0, takenAt: -1 });
  if ((isCop(q) || q.role === "gang") && !WEAPONS[q.weapon].melee) s.pickups.push({ id: s.nextId++, kind: "weapon", weapon: q.weapon, x: q.x + 0.4, z: q.z + 0.3, n: Math.max(12, Math.round(WEAPONS[q.weapon].clip * 1.5)), respawn: 0, takenAt: -1 });
}

function shootCar(s: State, c: Car, dmg: number, by: number) {
  const spec = VEHICLES[c.kind];
  c.hp -= dmg * (spec.body === "van" && c.kind === "armored" ? 0.4 : 1.4);
  c.lastHit = by;
  const shooter = pedById(s, by);
  if (shooter?.role === "player" && spec.police) crime(s, "copAttack", c.x, c.z);
  // Shots through the glass can hit whoever's inside.
  if (c.kind !== "armored" && s.rng.next() < 0.33) {
    const inside = c.seats.filter((id) => id >= 0);
    if (inside.length) {
      const q = pedById(s, inside[s.rng.int(0, inside.length - 1)]);
      if (q && q.id !== by) damage(s, q, dmg * 0.8, by);
    }
  }
  // A driver under fire floors it.
  const d = pedById(s, c.seats[0]);
  if (d && d.role === "civ" && c.ai.mode === "traffic") c.ai.mode = "flee";
}

/** Everyone who hears it reacts: civilians run or hide, gangs and cops turn to look. */
export function alarm(s: State, x: number, z: number, r: number, by: Ped) {
  for (const q of s.peds) {
    if (q.id === by.id || q.state !== "ok") continue;
    const d = Math.hypot(q.x - x, q.z - z);
    if (d > r) continue;
    if (q.role === "civ") {
      if (q.car >= 0) {
        const c = carById(s, q.car);
        if (c && c.ai.mode === "traffic" && d < r * 0.5) c.ai.mode = "flee";
        continue;
      }
      if (q.ai.mode === "fight") continue;
      q.ai.mode = s.rng.next() < 0.3 && d < 25 ? "cower" : "flee";
      q.ai.dx = x;
      q.ai.dz = z;
      q.ai.timer = s.rng.range(8, 16);
    } else if (q.role === "gang" && by.role === "player" && d < 40) {
      q.hostile = true;
      q.ai.mode = "fight";
      q.ai.target = by.id;
    }
  }
}

/* ------------------------------------------------------------------ grenades and explosions */

function throwGrenade(s: State, p: Ped, h: number, pitch: number) {
  const sp = 15;
  const up = Math.max(0.35, pitch + 0.45);
  s.grenades.push({ x: p.x + Math.cos(h) * 0.5, y: p.y + 1.6, z: p.z + Math.sin(h) * 0.5, vx: Math.cos(h) * Math.cos(up) * sp, vy: Math.sin(up) * sp, vz: Math.sin(h) * Math.cos(up) * sp, fuse: 2.6, by: p.id });
}

export function stepGrenades(s: State, dt: number) {
  for (const g of s.grenades) {
    g.vy -= 15 * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.z += g.vz * dt;
    const floor = Math.max(groundY(g.x, g.z), WATER_Y);
    if (g.y < floor + 0.08) {
      g.y = floor + 0.08;
      g.vy = Math.abs(g.vy) * 0.35;
      g.vx *= 0.6;
      g.vz *= 0.6;
    }
    // Off a wall.
    for (const w of solidsNear(s.city, g.x, g.z, 2, scratch)) {
      if (w.round || g.y > w.h) continue;
      if (Math.abs(g.x - w.x) < w.hw && Math.abs(g.z - w.z) < w.hd) {
        g.vx *= -0.4;
        g.vz *= -0.4;
        g.x += g.vx * dt * 2;
        g.z += g.vz * dt * 2;
      }
    }
    g.fuse -= dt;
    if (g.fuse <= 0) explode(s, g.x, g.z, g.y, 7, WEAPONS.grenade.dmg, g.by);
  }
  s.grenades = s.grenades.filter((g) => g.fuse > 0);
}

/** A blast: people knocked flat (and worse), cars shoved and set alight. */
export function explode(s: State, x: number, z: number, y: number, r: number, dmg: number, by: number) {
  s.booms.push({ x, z, y, t: 0, r });
  emit(s, { kind: "boom", x, z, n: r });
  const bp = pedById(s, by);
  if (bp?.role === "player") {
    s.stats.explosions++;
    crime(s, "explode", x, z);
  }
  for (const q of s.peds) {
    if (q.state === "dead") continue;
    const d = Math.hypot(q.x - x, q.z - z);
    if (d > r) continue;
    const k = Math.pow(1 - d / r, 1.5);
    const h = Math.atan2(q.z - z, q.x - x);
    if (q.car < 0) {
      q.vx += Math.cos(h) * 9 * k;
      q.vz += Math.sin(h) * 9 * k;
      q.vy = 3 * k;
      if (q.state === "ok") {
        q.state = "down";
        q.downT = 0;
      }
    }
    damage(s, q, dmg * k * (q.car >= 0 ? 0.4 : 1), by, h);
  }
  for (const c of s.cars) {
    if (c.wrecked) continue;
    const d = Math.hypot(c.x - x, c.z - z);
    if (d > r * 1.4) continue;
    const k = 1 - d / (r * 1.4);
    const h = Math.atan2(c.z - z, c.x - x);
    const m = VEHICLES[c.kind].mass;
    c.vx += (Math.cos(h) * 12 * k) / m;
    c.vz += (Math.sin(h) * 12 * k) / m;
    c.w += (s.rng.next() - 0.5) * 3 * k;
    c.hp -= 1600 * k;
    c.lastHit = by;
    if (c.hp <= 0 && c.burn < 0) c.burn = 0.4 + s.rng.next() * 1.4;
  }
}

/** Age tracers and booms (renderer reads them). */
export function stepFx(s: State, dt: number) {
  for (const t of s.tracers) t.t += dt;
  s.tracers = s.tracers.filter((t) => t.t < 0.12);
  for (const b of s.booms) b.t += dt;
  s.booms = s.booms.filter((b) => b.t < 2.5);
}

// Vehicles raise explosions and kill people inside through these.
setHooks(
  (s, x, z, y, r, dmg, by) => explode(s, x, z, y, r, dmg, by),
  (s, p, dmg, by) => damage(s, p, dmg, by),
);

export { blowUp };
