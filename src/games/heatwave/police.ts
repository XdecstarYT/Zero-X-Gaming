import { HEAT, VEHICLES, type VehicleKind } from "./data";
import { aimAt, fire, losClear, startReload } from "./combat";
import { carById, clamp, emit, makeCar, makePed, pedById, player, playerCar, playerPos, speedOf, type Car, type Ped, type State } from "./state";
import { chasePoint, followPath, randomLook, roadSpawn } from "./traffic";
import { leave, NO_DRIVE, seat, type Drive } from "./vehicles";
import { route } from "./world";

/**
 * The law: crimes raise a wanted level (one to five stars) when the police see them or someone
 * calls them in. Patrol cars, then interceptors, a tactical van and helicopters come after you;
 * they chase by the roads and ram, get out and run you down, try to cuff you at low heat and shoot
 * at high. Break their line of sight and leave the search area for long enough and they give up.
 */

export type Crime = "shoot" | "assault" | "kill" | "jack" | "steal" | "copAttack" | "copKill" | "robbery" | "explode" | "ram" | "trespass";

const CRIME: Record<Crime, { cop: number; civ: number; report: number }> = {
  shoot: { cop: 2, civ: 1, report: 0.85 },
  assault: { cop: 1, civ: 1, report: 0.55 },
  kill: { cop: 2, civ: 2, report: 0.9 },
  jack: { cop: 1, civ: 1, report: 0.5 },
  steal: { cop: 1, civ: 0, report: 0 },
  copAttack: { cop: 2, civ: 2, report: 1 },
  copKill: { cop: 3, civ: 3, report: 1 },
  robbery: { cop: 2, civ: 2, report: 1 },
  explode: { cop: 2, civ: 2, report: 1 },
  ram: { cop: 1, civ: 0, report: 0 },
  trespass: { cop: 2, civ: 0, report: 0 },
};

export const isCop = (p: Ped) => p.role === "cop" || p.role === "swat";

/** Does any officer (or the helicopter) see this spot? */
export function policeSee(s: State, x: number, z: number) {
  for (const q of s.peds) {
    if (!isCop(q) || q.state !== "ok") continue;
    const c = q.car >= 0 ? carById(s, q.car) : undefined;
    const qx = c ? c.x : q.x;
    const qz = c ? c.z : q.z;
    const d = Math.hypot(qx - x, qz - z);
    if (d > (c ? 85 : 60)) continue;
    if (d < 12 || losClear(s, qx, qz, x, z)) return true;
  }
  for (const c of s.cars) if (c.kind === "heli" && !c.wrecked && Math.hypot(c.x - x, c.z - z) < 150) return true;
  return false;
}

/** Someone committed a crime at (x, z). The police know now, or soon (a witness calls). */
export function crime(s: State, kind: Crime, x: number, z: number) {
  const c = CRIME[kind];
  const w = s.wanted;
  if (kind === "copAttack" || kind === "copKill") w.hostile = true;
  let need = c.cop;
  if (kind === "copKill") need = Math.min(5, 3 + Math.floor(w.copKills / 3));
  // Already wanted: more crime on top pushes it up.
  if (w.level > 0 && (kind === "kill" || kind === "shoot" || kind === "explode") && w.level < 4 && policeSee(s, x, z)) need = Math.max(need, w.level + (kind === "kill" ? 1 : 0));
  if (policeSee(s, x, z)) {
    raise(s, need, x, z);
    return;
  }
  if (c.civ <= 0) return;
  // A witness who saw it calls it in.
  const witness = s.peds.some((q) => q.role === "civ" && q.state === "ok" && Math.hypot(q.x - x, q.z - z) < 40);
  const loud = kind === "shoot" || kind === "explode" || kind === "robbery";
  if ((witness || loud) && s.rng.next() < c.report) {
    if (c.civ > w.pending) {
      w.pending = c.civ;
      w.reportAt = s.t + s.rng.range(2.5, 6);
      w.lx = x;
      w.lz = z;
    }
  }
}

/** Raise the wanted level to at least `level` (from a sighting at x, z). */
export function raise(s: State, level: number, x: number, z: number) {
  const w = s.wanted;
  const L = Math.min(5, Math.max(w.level, level));
  if (L > w.level) emit(s, { kind: "wanted", n: L });
  w.level = L;
  w.lx = x;
  w.lz = z;
  w.seenAt = s.t;
  s.stats.maxWanted = Math.max(s.stats.maxWanted, L);
}

export function clearWanted(s: State) {
  const w = s.wanted;
  w.level = 0;
  w.pending = 0;
  w.copKills = 0;
  w.hostile = false;
  standDown(s);
}

/** No one's wanted: cars go back to patrol, officers back to walking. */
function standDown(s: State) {
  for (const c of s.cars) {
    if (c.ai.mode === "police" || c.ai.mode === "swat") {
      c.siren = false;
      c.ai.mode = c.seats[0] >= 0 ? "traffic" : "idle";
      c.ai.seg = -1;
    }
    if (c.kind === "heli") c.ai.mode = "escape";
  }
  for (const q of s.peds) if (isCop(q) && q.car < 0 && q.state === "ok" && q.ai.mode === "cop") q.ai.mode = "wander";
}

/** Every step: reports come in, sightings, losing them. */
export function stepWanted(s: State, dt: number) {
  const w = s.wanted;
  if (w.pending > 0 && s.t >= w.reportAt) {
    raise(s, w.pending, w.lx, w.lz);
    w.pending = 0;
  }
  if (w.level <= 0) return;
  const pos = playerPos(s);
  w.seen = policeSee(s, pos.x, pos.z);
  if (w.seen) {
    w.lx = pos.x;
    w.lz = pos.z;
    w.seenAt = s.t;
  }
  const inCar = !!playerCar(s);
  const nina = s.chars[s.active].id === "nina" && inCar;
  const search = HEAT[w.level].search * (nina ? 0.75 : 1);
  const far = Math.hypot(pos.x - w.lx, pos.z - w.lz) > 45 + 22 * w.level;
  if (!w.seen && s.t - w.seenAt > search && far) {
    emit(s, { kind: "lost", n: w.level });
    clearWanted(s);
  }
  void dt;
}

/* ------------------------------------------------------------------ dispatch */

let dispatchT = 0;

export function dispatch(s: State, dt: number) {
  dispatchT -= dt;
  if (dispatchT > 0) return;
  dispatchT = 1.6;
  const L = s.wanted.level;
  if (L <= 0) return;
  const H = HEAT[L];
  const units = s.cars.filter((c) => (c.ai.mode === "police" || c.ai.mode === "swat") && !c.wrecked && !VEHICLES[c.kind].air);
  const swats = units.filter((c) => c.kind === "swat").length;
  const helis = s.cars.filter((c) => c.kind === "heli" && !c.wrecked && c.ai.mode !== "escape").length;
  const pos = playerPos(s);
  if (helis < H.heli) {
    const a = s.rng.range(0, Math.PI * 2);
    const heli = makeCar(s, "heli", pos.x + Math.cos(a) * 260, pos.z + Math.sin(a) * 260, a + Math.PI, "#1b2a44", { y: 55 });
    heli.ai.mode = "police";
    heli.siren = true;
    for (let i = 0; i < 2; i++) seat(s, cop(s, heli.x, heli.z, L >= 4 ? "rifle" : "pistol", "cop"), heli, i);
    return;
  }
  if (units.length - swats < H.cars) {
    const kind: VehicleKind = L >= 3 && s.rng.next() < 0.5 ? "policeSuv" : "police";
    spawnUnit(s, kind, L);
    return;
  }
  if (swats < H.swat) spawnUnit(s, "swat", L);
}

function cop(s: State, x: number, z: number, weapon: "pistol" | "smg" | "rifle" | "shotgun", role: "cop" | "swat") {
  const look = randomLook(s);
  look.shirt = role === "swat" ? "#1b1d22" : "#1f2b44";
  look.pants = role === "swat" ? "#1b1d22" : "#1a2233";
  const p = makePed(s, role, x, z, 0, look, { weapon, armor: role === "swat" ? 100 : 30, hp: role === "swat" ? 140 : 100, maxHp: role === "swat" ? 140 : 100 });
  p.clip = weapon === "pistol" ? 12 : weapon === "shotgun" ? 8 : 30;
  p.ammo = { [weapon]: 400 };
  p.ai.mode = "cop";
  return p;
}

function spawnUnit(s: State, kind: VehicleKind, L: number) {
  const pos = playerPos(s);
  const sp = roadSpawn(s, pos.x, pos.z, 120, 190);
  if (!sp) return;
  const c = makeCar(s, kind, sp.x, sp.z, sp.h, undefined, { siren: true });
  c.ai.mode = kind === "swat" ? "swat" : "police";
  c.ai.cruise = 30;
  const n = kind === "swat" ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const weapon = kind === "swat" ? "rifle" : L >= 4 ? (s.rng.next() < 0.5 ? "smg" : "shotgun") : L >= 3 && s.rng.next() < 0.3 ? "smg" : "pistol";
    seat(s, cop(s, c.x, c.z, weapon, kind === "swat" ? "swat" : "cop"), c, i);
  }
  // Pointed at you, already moving.
  const h = Math.atan2(pos.z - c.z, pos.x - c.x);
  if (Math.cos(h - c.h) < 0 && s.rng.next() < 0.5) c.h += Math.PI;
  c.vx = Math.cos(c.h) * 14;
  c.vz = Math.sin(c.h) * 14;
}

/* ------------------------------------------------------------------ police driving */

export function policeDrive(s: State, c: Car, dt: number): Drive {
  const pl = player(s);
  const pc = playerCar(s);
  const L = s.wanted.level;
  if (L <= 0) return NO_DRIVE;
  const recent = s.t - s.wanted.seenAt < 4;
  const tx = recent ? (pc ? pc.x : pl.x) : s.wanted.lx;
  const tz = recent ? (pc ? pc.z : pl.z) : s.wanted.lz;
  const d = Math.hypot(tx - c.x, tz - c.z);
  // On foot nearby: pull up and get out.
  if (!pc && recent && d < 22) {
    const sp = speedOf(c);
    if (sp < 2.5) {
      for (const id of [...c.seats]) {
        const p = pedById(s, id);
        if (p && p.state === "ok") {
          leave(s, p);
          p.ai.mode = "cop";
          p.ai.target = c.id;
        }
      }
      c.ai.mode = "idle";
    }
    return { throttle: -clamp(sp / 6, 0, 1), steer: 0, handbrake: sp < 6 };
  }
  // Drive-by shooting from the passenger seat at higher heat.
  if (pc && recent && d < 32 && (L >= 3 || s.wanted.hostile)) {
    const gunner = pedById(s, c.seats[1]);
    if (gunner && gunner.state === "ok" && losClear(s, c.x, c.z, pc.x, pc.z)) {
      const a = aimAt(s, gunner, pc);
      fire(s, gunner, a.h, a.p);
      if (gunner.clip <= 0) startReload(s, gunner);
    }
  }
  if (d > 70 || !recent || !losClear(s, c.x, c.z, tx, tz)) {
    // By the roads.
    if (c.ai.path.length === 0 || c.ai.wait <= 0) {
      c.ai.path = route(s.city, c.x, c.z, tx, tz);
      c.ai.pi = 0;
      c.ai.wait = 3;
    }
    c.ai.wait -= dt;
    return followPath(s, c, 30, dt);
  }
  // Close, in sight: straight at them, leading a little.
  const lead = pc ? Math.min(1.1, d / 28) : 0;
  const px = tx + (pc ? pc.vx : 0) * lead;
  const pz = tz + (pc ? pc.vz : 0) * lead;
  return chasePoint(s, c, px, pz, pc ? 34 : 10, dt);
}

/* ------------------------------------------------------------------ officers on foot */

export function stepCop(s: State, p: Ped, dt: number, walk: (p: Ped, tx: number, tz: number, speed: number, dt: number) => void) {
  const L = s.wanted.level;
  const pl = player(s);
  if (L <= 0 || pl.state === "dead") {
    p.ai.mode = "wander";
    p.aiming = false;
    return;
  }
  const pc = playerCar(s);
  const tx = pc ? pc.x : pl.x;
  const tz = pc ? pc.z : pl.z;
  const d = Math.hypot(tx - p.x, tz - p.z);
  p.ai.timer -= dt;
  // Back to the car when they drive off.
  if (pc && speedOf(pc) > 7 && d > 26) {
    const own = carById(s, p.ai.target);
    if (own && !own.wrecked && Math.hypot(own.x - p.x, own.z - p.z) < 40) {
      if (Math.hypot(own.x - p.x, own.z - p.z) < 3.2) {
        const free = own.seats.indexOf(-1);
        if (free >= 0) {
          seat(s, p, own, free);
          own.ai.mode = own.kind === "swat" ? "swat" : "police";
          own.siren = true;
          return;
        }
      }
      walk(p, own.x, own.z, 5.2, dt);
      return;
    }
  }
  const canShoot = HEAT[L].shoot || s.wanted.hostile;
  const sight = d < 70 && (d < 10 || losClear(s, p.x, p.z, tx, tz));
  if (canShoot && sight && d < (p.weapon === "shotgun" ? 22 : 48)) {
    // Stop and shoot (with the odd step to the side).
    const a = aimAt(s, p, pc ?? pl);
    p.aiming = true;
    p.h = a.h;
    p.aimH = a.h;
    const strafe = Math.sin(s.t * 0.9 + p.id) * 1.6;
    p.vx += (-Math.sin(a.h) * strafe - p.vx) * Math.min(1, dt * 4);
    p.vz += (Math.cos(a.h) * strafe - p.vz) * Math.min(1, dt * 4);
    if (d > 16) walk(p, tx, tz, 2.4, dt);
    // Bursts, not a hosepipe.
    if (Math.sin(s.t * 1.7 + p.id * 2.1) > -0.2) fire(s, p, a.h, a.p);
    if (p.clip <= 0) startReload(s, p);
    return;
  }
  p.aiming = false;
  // Arrest at low heat: get close and cuff.
  if (!canShoot && !pc && d < 1.9) {
    p.h = Math.atan2(tz - p.z, tx - p.x);
    p.vx *= 0.5;
    p.vz *= 0.5;
    if (Math.hypot(pl.vx, pl.vz) < 2.2) pl.cuffT += dt;
    if (pl.cuffT > 1.5 && !s.down) {
      s.down = { kind: "busted", t: 4 };
      emit(s, { kind: "busted" });
    }
    return;
  }
  if (!canShoot && pc && speedOf(pc) < 1 && d < 3.4) {
    pl.cuffT += dt;
    if (pl.cuffT > 2 && !s.down) {
      s.down = { kind: "busted", t: 4 };
      emit(s, { kind: "busted" });
    }
    return;
  }
  walk(p, tx, tz, d > 6 ? 5.4 : 3, dt);
}

/* ------------------------------------------------------------------ the helicopter */

export function stepHeli(s: State, c: Car, dt: number) {
  const pos = playerPos(s);
  if (c.hp <= 0 && !c.wrecked) {
    // Going down.
    c.y -= dt * 9;
    c.w += dt * 3;
    c.h += c.w * dt;
    c.x += c.vx * dt;
    c.z += c.vz * dt;
    if (c.y <= 1) {
      c.y = 0.5;
      c.wrecked = true;
      for (const id of c.seats) {
        const p = pedById(s, id);
        if (p) {
          p.state = "dead";
          p.car = -1;
          p.x = c.x;
          p.z = c.z;
        }
      }
      c.seats.fill(-1);
      s.booms.push({ x: c.x, z: c.z, y: 1, t: 0, r: 9 });
      emit(s, { kind: "boom", x: c.x, z: c.z, n: 9 });
    }
    return;
  }
  if (c.wrecked) return;
  let tx: number;
  let tz: number;
  let ty = 38;
  if (c.ai.mode === "escape") {
    tx = c.x + Math.cos(c.h) * 300;
    tz = c.z + Math.sin(c.h) * 300;
    ty = 80;
  } else {
    // Orbit the player (or where they were last seen).
    const recent = s.t - s.wanted.seenAt < 3;
    const cx = recent ? pos.x : s.wanted.lx;
    const cz = recent ? pos.z : s.wanted.lz;
    const a = s.t * 0.25 + c.id;
    tx = cx + Math.cos(a) * 34;
    tz = cz + Math.sin(a) * 34;
  }
  const dx = tx - c.x;
  const dz = tz - c.z;
  const d = Math.hypot(dx, dz);
  const sp = Math.min(32, d * 0.8);
  c.vx += ((dx / Math.max(1, d)) * sp - c.vx) * Math.min(1, dt * 1.2);
  c.vz += ((dz / Math.max(1, d)) * sp - c.vz) * Math.min(1, dt * 1.2);
  c.x += c.vx * dt;
  c.z += c.vz * dt;
  c.y += (ty - c.y) * Math.min(1, dt * 0.8);
  const face = c.ai.mode === "escape" ? Math.atan2(c.vz, c.vx) : Math.atan2(pos.z - c.z, pos.x - c.x);
  c.h += Math.atan2(Math.sin(face - c.h), Math.cos(face - c.h)) * Math.min(1, dt * 1.5);
  // A marksman leans out at four stars and up.
  if (c.ai.mode !== "escape" && s.wanted.level >= 4) {
    const gunner = pedById(s, c.seats[1]);
    const pl = player(s);
    if (gunner && gunner.state === "ok" && Math.hypot(pos.x - c.x, pos.z - c.z) < 60 && Math.sin(s.t * 0.7 + c.id) > 0.6) {
      const a = aimAt(s, gunner, playerCar(s) ?? pl);
      fire(s, gunner, a.h, a.p);
      if (gunner.clip <= 0) startReload(s, gunner);
    }
  }
  if (c.ai.mode === "escape" && Math.hypot(c.x - pos.x, c.z - pos.z) > 400) {
    c.wrecked = true;
    c.tag = "gone";
  }
}

export { clamp };
