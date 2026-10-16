import { WEAPONS } from "./data";
import { aimAt, fire, losClear, startReload, tickWeapon } from "./combat";
import { isCop, stepCop } from "./police";
import { carById, clamp, makePed, pedById, player, playerPos, type Ped, type State } from "./state";
import { randomLook } from "./traffic";
import { districtAt, groundY, onDeck, pushOut, ROAD, sandSpot, WATER_Y, type Solid } from "./world";

/**
 * People: the player on foot (walk, run, sprint, jump, swim), and everyone else: walking the
 * sidewalks and turning at corners, sunbathing and strolling on the beach, running from gunfire,
 * cowering, fighting back, gangs who guard their corner, officers on foot.
 */

export interface FootInput {
  mx: number;
  my: number;
  yaw: number;
  sprint: boolean;
  jump: boolean;
  aim: boolean;
}

const scratch: Solid[] = [];

export function stepPlayerFoot(s: State, p: Ped, inp: FootInput, dt: number) {
  if (p.state !== "ok" || p.enterT > 0) return;
  const fx = Math.cos(inp.yaw);
  const fz = Math.sin(inp.yaw);
  let mx = fx * inp.my + -fz * inp.mx;
  let mz = fz * inp.my + fx * inp.mx;
  const mag = Math.min(1, Math.hypot(mx, mz));
  if (mag > 1e-3) {
    mx /= Math.hypot(mx, mz);
    mz /= Math.hypot(mx, mz) || 1;
  }
  const lead = s.chars[s.active].id;
  let speed: number;
  if (p.swim) speed = inp.sprint ? 3.4 : 2.3;
  else if (inp.aim) speed = 2.4;
  else if (inp.sprint) speed = lead === "nina" ? 7.6 : 7.1;
  else speed = mag < 0.55 ? 1.9 : 4.6;
  speed *= mag;
  const tvx = mx * speed;
  const tvz = mz * speed;
  const k = Math.min(1, dt * (p.y > 0.05 ? 2 : 14));
  p.vx += (tvx - p.vx) * k;
  p.vz += (tvz - p.vz) * k;
  if (inp.aim) p.h = turn(p.h, p.aimH, dt * 18);
  else if (mag > 0.1) p.h = turn(p.h, Math.atan2(mz, mx), dt * 11);
  if (inp.jump && p.y <= 0.001 && !p.swim) {
    p.vy = 5.2;
    s.stats.jumps++;
  }
  // Cuffs come off if you break away.
  if (Math.hypot(p.vx, p.vz) > 3) p.cuffT = Math.max(0, p.cuffT - dt * 2);
}

export function turn(h: number, to: number, max: number) {
  const d = Math.atan2(Math.sin(to - h), Math.cos(to - h));
  return h + clamp(d, -max, max);
}

/** Movement, falling, knockdowns, swimming and walls, for anyone on foot. */
export function stepPedPhysics(s: State, p: Ped, dt: number) {
  tickWeapon(s, p, dt);
  if (p.enterT > 0) p.enterT -= dt;
  if (p.car >= 0) {
    const c = carById(s, p.car);
    if (c) {
      p.x = c.x;
      p.z = c.z;
      p.h = c.h;
      p.y = c.y;
    } else p.car = -1;
    return;
  }
  if (p.state !== "ok") {
    p.downT += dt;
    const f = Math.exp(-3.2 * dt);
    p.vx *= f;
    p.vz *= f;
    if (p.state === "down" && p.downT > 2.4 && p.hp > 0) {
      p.state = "ok";
      p.downT = 0;
    }
  }
  p.vy -= 16 * dt;
  p.y += p.vy * dt;
  if (p.y < 0) {
    p.y = 0;
    p.vy = 0;
  }
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  pushOut(s.city, p, 0.32, scratch, p.y > 1.5 ? 2.5 : Infinity);
  const g = groundY(p.x, p.z);
  const was = p.swim;
  p.swim = g < WATER_Y - 0.5 && !onDeck(p.x, p.z);
  if (p.swim && !was) {
    p.vx *= 0.3;
    p.vz *= 0.3;
    if (p.role === "player" && p.aiming) p.aiming = false;
  }
}

export function walkTo(p: Ped, tx: number, tz: number, speed: number, dt: number) {
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  const sp = d < 0.4 ? 0 : speed * Math.min(1, d / 1.2);
  const vx = d > 1e-6 ? (dx / d) * sp : 0;
  const vz = d > 1e-6 ? (dz / d) * sp : 0;
  const k = Math.min(1, dt * 8);
  p.vx += (vx - p.vx) * k;
  p.vz += (vz - p.vz) * k;
  if (sp > 0.2 && !p.aiming) p.h = turn(p.h, Math.atan2(dz, dx), dt * 9);
}

/* ------------------------------------------------------------------ sidewalks */

function walkLine(s: State, segId: number, side: number) {
  const seg = s.city.roads.segs[segId];
  const A = s.city.roads.nodes[seg.a];
  const B = s.city.roads.nodes[seg.b];
  const off = side * (ROAD[seg.cls].half + (seg.bridge ? 0.8 : ROAD[seg.cls].walk / 2));
  if (seg.axis === "ns") return { ax: A.x + off, az: A.z, bx: B.x + off, bz: B.z, A, B };
  return { ax: A.x, az: A.z + off, bx: B.x, bz: B.z + off, A, B };
}

function wander(s: State, p: Ped, dt: number) {
  if (p.ai.seg < 0) {
    // Find the nearest sidewalk.
    let best = -1;
    let bd = Infinity;
    for (const seg of s.city.roads.segs) {
      const A = s.city.roads.nodes[seg.a];
      const B = s.city.roads.nodes[seg.b];
      const cx = clamp(p.x, Math.min(A.x, B.x), Math.max(A.x, B.x));
      const cz = clamp(p.z, Math.min(A.z, B.z), Math.max(A.z, B.z));
      const d = Math.hypot(cx - p.x, cz - p.z);
      if (d < bd) {
        bd = d;
        best = seg.id;
      }
    }
    if (best < 0 || bd > 60) {
      p.vx *= 0.8;
      p.vz *= 0.8;
      return;
    }
    p.ai.seg = best;
    const seg = s.city.roads.segs[best];
    const A = s.city.roads.nodes[seg.a];
    p.ai.side = seg.axis === "ns" ? (p.x >= A.x ? 1 : -1) : p.z >= A.z ? 1 : -1;
    p.ai.fwd = s.rng.next() < 0.5;
  }
  const L = walkLine(s, p.ai.seg, p.ai.side);
  const ex = p.ai.fwd ? L.bx : L.ax;
  const ez = p.ai.fwd ? L.bz : L.az;
  const dx = ex - (p.ai.fwd ? L.ax : L.bx);
  const dz = ez - (p.ai.fwd ? L.az : L.bz);
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const rem = (ex - p.x) * ux + (ez - p.z) * uz;
  if (rem < 3) {
    // The corner: pick a way, keep to the nearer sidewalk.
    const node = p.ai.fwd ? L.B : L.A;
    const opts = node.dir.filter((d) => d >= 0 && d !== p.ai.seg);
    const dead = opts.length === 0;
    const next = dead ? p.ai.seg : opts[s.rng.int(0, opts.length - 1)];
    const seg = s.city.roads.segs[next];
    const n1 = walkLine(s, next, 1);
    const n2 = walkLine(s, next, -1);
    const d1 = Math.hypot((n1.ax + n1.bx) / 2 - p.x, (n1.az + n1.bz) / 2 - p.z);
    const d2 = Math.hypot((n2.ax + n2.bx) / 2 - p.x, (n2.az + n2.bz) / 2 - p.z);
    p.ai.side = d1 < d2 ? 1 : -1;
    p.ai.seg = next;
    p.ai.fwd = dead ? !p.ai.fwd : seg.a === node.id;
    return;
  }
  // Along the line, at a stroll; the odd pause.
  const ox = (p.ai.fwd ? L.ax : L.bx) + ux * ((p.x - (p.ai.fwd ? L.ax : L.bx)) * ux + (p.z - (p.ai.fwd ? L.az : L.bz)) * uz);
  const oz = (p.ai.fwd ? L.az : L.bz) + uz * ((p.x - (p.ai.fwd ? L.ax : L.bx)) * ux + (p.z - (p.ai.fwd ? L.az : L.bz)) * uz);
  const pace = 1.2 + (p.look.seed % 7) * 0.08;
  walkTo(p, ox + ux * 3, oz + uz * 3, pace, dt);
}

function beachStroll(s: State, p: Ped, dt: number) {
  p.ai.timer -= dt;
  const d = Math.hypot(p.ai.dx - p.x, p.ai.dz - p.z);
  if (d < 1 || p.ai.timer < -30) {
    if (p.ai.timer < 0) {
      // Somewhere new along the sand.
      const spot = sandSpot(p.x, p.z, 45, s.rng.next);
      p.ai.dx = spot ? spot.x : p.x;
      p.ai.dz = spot ? spot.z : p.z;
      p.ai.timer = s.rng.range(6, 26);
      p.ai.side = s.rng.next() < 0.35 ? 2 : 0;
    }
    p.vx *= 0.8;
    p.vz *= 0.8;
    return;
  }
  if (p.ai.timer > 0 && p.ai.side === 2) {
    // Lying on a towel.
    p.vx = 0;
    p.vz = 0;
    return;
  }
  walkTo(p, p.ai.dx, p.ai.dz, 1.1, dt);
}

/* ------------------------------------------------------------------ everyone else */

export function stepPed(s: State, p: Ped, dt: number) {
  if (p.role === "player" || p.state !== "ok" || p.car >= 0) return;
  if (isCop(p) && p.ai.mode === "cop") {
    stepCop(s, p, dt, (q, tx, tz, sp, d) => walkTo(q, tx, tz, sp, d));
    return;
  }
  const pl = player(s);
  switch (p.ai.mode) {
    case "wander":
      wander(s, p, dt);
      if (p.hostile && pl.state === "ok" && pl.car < 0 && Math.hypot(pl.x - p.x, pl.z - p.z) < 18) {
        p.ai.mode = "fight";
        p.ai.target = pl.id;
      }
      break;
    case "beach":
      beachStroll(s, p, dt);
      break;
    case "flee": {
      p.ai.timer -= dt;
      const dx = p.x - p.ai.dx;
      const dz = p.z - p.ai.dz;
      const d = Math.hypot(dx, dz) || 1;
      walkTo(p, p.x + (dx / d) * 10, p.z + (dz / d) * 10, 5.4, dt);
      if (p.ai.timer <= 0) {
        p.ai.mode = "wander";
        p.ai.seg = -1;
      }
      break;
    }
    case "cower":
      p.ai.timer -= dt;
      p.vx *= 0.7;
      p.vz *= 0.7;
      if (p.ai.timer <= 0) {
        p.ai.mode = "flee";
        p.ai.timer = 6;
      }
      break;
    case "fight":
      fight(s, p, dt);
      break;
    case "guard": {
      const d = Math.hypot(pl.x - p.x, pl.z - p.z);
      walkTo(p, p.ai.dx, p.ai.dz, 1.4, dt);
      if (Math.hypot(p.ai.dx - p.x, p.ai.dz - p.z) < 0.6) p.h = turn(p.h, Math.atan2(pl.z - p.z, pl.x - p.x), dt * 1.5);
      // Gangs don't like a gun pointed their way, or strangers lingering at night.
      if (pl.state === "ok" && d < 22 && (p.hostile || (pl.aiming && Math.abs(Math.atan2(Math.sin(pl.aimH - Math.atan2(p.z - pl.z, p.x - pl.x)), Math.cos(pl.aimH - Math.atan2(p.z - pl.z, p.x - pl.x)))) < 0.4))) {
        p.hostile = true;
        p.ai.mode = "fight";
        p.ai.target = pl.id;
        for (const q of s.peds) if (q.tag === p.tag && q.role === p.role && q.ai.mode === "guard" && Math.hypot(q.x - p.x, q.z - p.z) < 30) {
          q.hostile = true;
          q.ai.mode = "fight";
          q.ai.target = pl.id;
        }
      }
      break;
    }
    case "goto":
      walkTo(p, p.ai.dx, p.ai.dz, p.ai.timer > 0 ? 4.8 : 1.5, dt);
      if (Math.hypot(p.ai.dx - p.x, p.ai.dz - p.z) < 0.8) p.ai.mode = "idle";
      break;
    case "follow": {
      const t = pedById(s, p.ai.target);
      if (!t) break;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d > 2.5) walkTo(p, t.x, t.z, d > 8 ? 6.5 : 4.2, dt);
      else {
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
      // A partner shoots whoever's shooting at you.
      if (p.role === "partner") partnerCover(s, p);
      break;
    }
    default:
      p.vx *= 0.8;
      p.vz *= 0.8;
  }
}

function fight(s: State, p: Ped, dt: number) {
  const t = pedById(s, p.ai.target);
  p.ai.timer -= dt;
  if (!t || t.state === "dead" || (p.role === "civ" && p.ai.timer <= 0)) {
    p.ai.mode = p.role === "civ" ? "wander" : "guard";
    p.ai.seg = -1;
    p.aiming = false;
    return;
  }
  const c = t.car >= 0 ? carById(s, t.car) : undefined;
  const tx = c ? c.x : t.x;
  const tz = c ? c.z : t.z;
  const d = Math.hypot(tx - p.x, tz - p.z);
  const w = WEAPONS[p.weapon];
  if (w.melee) {
    if (d > 1.4) walkTo(p, tx, tz, 5, dt);
    else {
      p.vx *= 0.5;
      p.vz *= 0.5;
      const a = Math.atan2(tz - p.z, tx - p.x);
      p.h = a;
      if (!c) fire(s, p, a, 0);
    }
    return;
  }
  const sight = d < 60 && losClear(s, p.x, p.z, tx, tz);
  if (sight && d < w.range * 0.75) {
    const a = aimAt(s, p, c ?? t);
    p.aiming = true;
    p.h = a.h;
    if (d > 14) walkTo(p, tx, tz, 2, dt);
    else {
      p.vx *= 0.7;
      p.vz *= 0.7;
    }
    if (Math.sin(s.t * 1.9 + p.id) > -0.1) fire(s, p, a.h, a.p);
    if (p.clip <= 0) startReload(s, p);
  } else {
    p.aiming = false;
    walkTo(p, tx, tz, 5, dt);
  }
}

/** The partner (in a mission) shoots at whoever's after the player. */
function partnerCover(s: State, p: Ped) {
  if (WEAPONS[p.weapon].melee) return;
  let best: Ped | null = null;
  let bd = 40;
  for (const q of s.peds) {
    if (q.state !== "ok" || q.car >= 0 || !(q.hostile || (isCop(q) && s.wanted.level >= 2))) continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bd && losClear(s, p.x, p.z, q.x, q.z)) {
      bd = d;
      best = q;
    }
  }
  if (!best) {
    p.aiming = false;
    return;
  }
  const a = aimAt(s, p, best);
  p.aiming = true;
  p.h = a.h;
  if (Math.sin(s.t * 2.3 + p.id) > 0) fire(s, p, a.h, a.p);
  if (p.clip <= 0) startReload(s, p);
}

/* ------------------------------------------------------------------ spawning */

const GANGS = [
  // Wharfies gone bad round the docks, in their hi-vis.
  { tag: "dockrats", shirt: "#f28a1a", pants: "#2b3a55", where: (x: number, z: number) => districtAt(x, z) === "docks" || districtAt(x, z) === "westmelb" },
  { tag: "smithst", shirt: "#1c1f24", pants: "#1c1f24", where: (x: number, z: number) => districtAt(x, z) === "fitzroy" },
  { tag: "esplanade", shirt: "#d81e2b", pants: "#e8dcc0", where: (x: number, z: number) => districtAt(x, z) === "stkilda" && x < -100 },
];

export function spawnPed(s: State) {
  const pos = playerPos(s);
  const night = s.clock < 6 * 60 || s.clock > 21 * 60;
  const dist = districtAt(pos.x, pos.z);
  const want = Math.round(s.density.peds * (night ? 0.55 : 1) * (dist === "docks" ? 0.45 : dist === "cbd" ? 1.35 : dist === "beach" && !night ? 1.25 : 1));
  const civs = s.peds.filter((p) => p.role === "civ" && p.car < 0 && p.state !== "dead").length;
  if (civs >= want) return;
  // On the beach, by day.
  const sand = !night && s.rng.next() < 0.55 ? sandSpot(pos.x, pos.z, 120, s.rng.next) : null;
  if (sand) {
    const { x, z } = sand;
    if (Math.hypot(x - pos.x, z - pos.z) < 30) return;
    const p = makePed(s, "civ", x, z, s.rng.range(0, 6.28), randomLook(s, true));
    p.ai.mode = "beach";
    p.ai.dx = x;
    p.ai.dz = z;
    p.ai.timer = s.rng.range(-5, 20);
    p.ai.side = s.rng.next() < 0.4 ? 2 : 0;
    return;
  }
  const segs = s.city.roads.segs;
  for (let tries = 0; tries < 12; tries++) {
    const seg = segs[s.rng.int(0, segs.length - 1)];
    const side = s.rng.next() < 0.5 ? 1 : -1;
    const L = walkLine(s, seg.id, side);
    const t = s.rng.range(0.1, 0.9);
    const x = L.ax + (L.bx - L.ax) * t;
    const z = L.az + (L.bz - L.az) * t;
    const d = Math.hypot(x - pos.x, z - pos.z);
    if (d < 38 || d > 135) continue;
    if (groundY(x, z) < -0.1 && !onDeck(x, z)) continue;
    const probe = { x, z };
    if (pushOut(s.city, probe, 0.4, scratch).hit) continue;
    // Now and then a gang on their corner.
    const gang = GANGS.find((g) => g.where(x, z));
    if (gang && s.rng.next() < (night ? 0.22 : 0.08)) {
      for (let i = 0; i < 3; i++) {
        const look = randomLook(s);
        look.shirt = gang.shirt;
        look.pants = gang.pants;
        const w = s.rng.next() < 0.5 ? "pistol" : s.rng.next() < 0.5 ? "bat" : "smg";
        const g = makePed(s, "gang", x + i * 1.2, z + (i % 2) * 1.2, s.rng.range(0, 6.28), look, { weapon: w, clip: w === "pistol" ? 12 : w === "smg" ? 30 : 0, ammo: { [w]: 120 }, tag: gang.tag });
        g.ai.mode = "guard";
        g.ai.dx = g.x;
        g.ai.dz = g.z;
      }
      return;
    }
    const p = makePed(s, "civ", x, z, 0, randomLook(s));
    p.ai.mode = "wander";
    p.ai.seg = seg.id;
    p.ai.side = side;
    p.ai.fwd = s.rng.next() < 0.5;
    return;
  }
}

/** Clear people far behind, and bodies after a while. */
export function despawnPeds(s: State) {
  const pos = playerPos(s);
  s.peds = s.peds.filter((p) => {
    if (p.role === "player" || p.tag || p.car >= 0) return true;
    if (p.role === "partner") return true;
    const d = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (p.state === "dead") return p.downT < 45 && d < 110;
    return d < 175;
  });
}

export { clamp };
