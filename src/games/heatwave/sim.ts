import { ARREST_FEE, DAY, HOSPITAL_BILL, LEADS, OUTFITS, RESPRAY_PRICE, VEHICLES, WEAPON_ORDER, WEAPONS, type CharId, type WeaponId } from "./data";
import { aimAt, damage, fire, lockOn, startReload, stepFx, stepGrenades, syncAmmo } from "./combat";
import { failMission, stepMissions, missionScore } from "./missions";
import { despawnPeds, spawnPed, stepPed, stepPedPhysics, stepPlayerFoot } from "./peds";
import { clearWanted, crime, dispatch, isCop, stepHeli, stepWanted } from "./police";
import {
  carById,
  createState,
  emit,
  leadLook,
  makePed,
  pedById,
  player,
  playerCar,
  playerPos,
  poi,
  speedOf,
  spend,
  toast,
  type Car,
  type CharState,
  type Ped,
  type State,
} from "./state";
import { aiDrive, populate } from "./traffic";
import { spawnTrams, stepTram } from "./trams";
import { carToEnter, collideCars, collideWorld, doorSpot, hitPeds, leave, NO_DRIVE, seat, stepCar, type Drive } from "./vehicles";
import { districtAt, groundY, streetName, WATER_Y, type Poi } from "./world";

/**
 * Heatwave's simulation: one call a step. Pure state in, state out (plus events for the
 * renderer, the sound and the HUD), seeded, so the tests can drive it.
 */

export interface Input {
  /** Move stick (on foot): right, forward. */
  mx: number;
  my: number;
  /** Camera heading and pitch (what "forward" and aiming mean). */
  yaw: number;
  pitch: number;
  sprint: boolean;
  jump: boolean;
  aim: boolean;
  fire: boolean;
  /** Get in / out (edge). */
  enter: boolean;
  reload: boolean;
  next: boolean;
  prev: boolean;
  /** Driving. */
  throttle: number;
  steer: number;
  handbrake: boolean;
  horn: boolean;
  /** Touch: lock on to whatever's nearest the middle of the screen when firing. */
  autoAim: boolean;
}

export const NO_INPUT: Input = { mx: 0, my: 0, yaw: 0, pitch: 0, sprint: false, jump: false, aim: false, fire: false, enter: false, reload: false, next: false, prev: false, throttle: 0, steer: 0, handbrake: false, horn: false, autoAim: false };

/** Start a new game: Nina outside her apartment on the Strand, a sunny morning. */
export function newGame(seed = 7, opts: { empty?: boolean } = {}) {
  const s = createState(seed, opts);
  spawnLead(s);
  // Fill the streets before the first frame.
  spawnTrams(s);
  for (let i = 0; i < 90; i++) populate(s, 0.2, () => spawnPed(s));
  return s;
}

/** Put the active lead in the world as the player's ped. */
export function spawnLead(s: State) {
  const cs = s.chars[s.active];
  const out = OUTFITS.find((o) => o.id === cs.outfit) ?? OUTFITS[0];
  const p = makePed(s, "player", cs.x, cs.z, cs.h, leadLook(cs, out), { hp: cs.hp, maxHp: 100, armor: cs.armor });
  loadWeapons(p, cs);
  s.player = p.id;
  return p;
}

/** Arm a lead's ped from their inventory (clip from the reserve). */
function loadWeapons(p: Ped, cs: CharState) {
  p.ammo = {};
  for (const w of Object.keys(cs.weapons) as WeaponId[]) p.ammo[w] = cs.weapons[w] ?? 0;
  p.weapon = cs.weapons[cs.weapon] !== undefined ? cs.weapon : "fists";
  takeClip(p);
}

function takeClip(p: Ped) {
  const w = WEAPONS[p.weapon];
  if (w.melee || w.thrown) {
    p.clip = 0;
    return;
  }
  const have = p.ammo[p.weapon] ?? 0;
  p.clip = Math.min(w.clip, have);
  p.ammo[p.weapon] = have - p.clip;
}

/** Switch weapon (dir +1 / −1 through what you own). */
export function cycleWeapon(s: State, p: Ped, dir: number) {
  const owned = WEAPON_ORDER.filter((w) => p.ammo[w] !== undefined && (WEAPONS[w].melee || (p.ammo[w] ?? 0) + (w === p.weapon ? p.clip : 0) > 0));
  if (owned.length < 2) return;
  const i = owned.indexOf(p.weapon);
  selectWeapon(s, p, owned[(i + dir + owned.length) % owned.length]);
}

export function selectWeapon(s: State, p: Ped, w: WeaponId) {
  if (p.ammo[w] === undefined) return;
  // The clip goes back in the pouch.
  p.ammo[p.weapon] = (p.ammo[p.weapon] ?? 0) + p.clip;
  p.clip = 0;
  p.reloadT = 0;
  p.weapon = w;
  takeClip(p);
  if (p.role === "player") syncAmmo(s, p);
}

/** Give the player a weapon (or more rounds for it). */
export function giveWeapon(s: State, w: WeaponId, rounds: number) {
  const p = player(s);
  const had = p.ammo[w] !== undefined;
  p.ammo[w] = (p.ammo[w] ?? 0) + rounds;
  if (!had && !WEAPONS[w].melee && (WEAPONS[p.weapon].melee || p.weapon === "grenade")) selectWeapon(s, p, w);
  else if (w === p.weapon && p.clip === 0) takeClip(p);
  syncAmmo(s, p);
}

/* ------------------------------------------------------------------ the step */

let pushT = 0;

export function step(s: State, inp: Input, dt: number) {
  s.t += dt;
  s.stats.played += dt;
  stepClock(s, dt);
  const p = player(s);
  if (s.down) stepDown(s, dt);
  else if (p) controlPlayer(s, p, inp, dt);
  // Everyone else's minds.
  for (const q of s.peds) if (q.id !== s.player) stepPed(s, q, dt);
  // Vehicles.
  const pc = playerCar(s);
  for (const c of s.cars) {
    const spec = VEHICLES[c.kind];
    if (spec.air) {
      stepHeli(s, c, dt);
      continue;
    }
    if (c.tram) {
      stepTram(s, c, dt);
      continue;
    }
    let d: Drive = NO_DRIVE;
    if (pc === c && !s.down) d = { throttle: inp.throttle, steer: inp.steer, handbrake: inp.handbrake };
    else if (c.ai.mode === "parked" || c.wrecked) d = { throttle: 0, steer: 0, handbrake: true };
    else d = aiDrive(s, c, dt);
    stepCar(s, c, d, dt);
    collideWorld(s, c);
    hitPeds(s, c, (q, sp) => runOver(s, c, q, sp));
  }
  for (let i = 0; i < s.cars.length; i++)
    for (let j = i + 1; j < s.cars.length; j++) collideCars(s, s.cars[i], s.cars[j]);
  // Ramming a police car is a crime.
  for (const c of s.cars) {
    if (c.lastHit === s.player && VEHICLES[c.kind].police) crime(s, "ram", c.x, c.z);
    if (c.lastHit === s.player) c.lastHit = -2;
  }
  // Bodies on foot.
  for (const q of s.peds) stepPedPhysics(s, q, dt);
  pushT -= dt;
  if (pushT <= 0) {
    pushT = 0.05;
    separate(s);
  }
  stepGrenades(s, dt);
  stepFx(s, dt);
  stepPickups(s);
  stepWanted(s, dt);
  dispatch(s, dt);
  stepMissions(s, dt);
  if (!s.down) {
    populate(s, dt, () => spawnPed(s));
    despawnPeds(s);
  }
  // Stats.
  const pp = player(s);
  if (pp && !s.down) {
    const car = playerCar(s);
    if (car) {
      const sp = speedOf(car);
      s.stats.driven += sp * dt;
      s.stats.topSpeed = Math.max(s.stats.topSpeed, sp);
    } else s.stats.walked += Math.hypot(pp.vx, pp.vz) * dt;
  }
}

function stepClock(s: State, dt: number) {
  s.clock += dt;
  if (s.clock >= DAY) {
    s.clock -= DAY;
    s.day++;
  }
  const w = s.weather;
  if (s.t > w.next) {
    const r = s.rng.next();
    w.kind = r < 0.6 ? "clear" : r < 0.85 ? "cloudy" : "storm";
    w.next = s.t + s.rng.range(500, 1300);
    w.to = w.kind === "storm" ? 1 : 0;
  }
  w.rain += (w.to - w.rain) * Math.min(1, dt * 0.05);
}

function controlPlayer(s: State, p: Ped, inp: Input, dt: number) {
  const car = playerCar(s);
  if (p.state !== "ok") return;
  // Getting in (the walk to the door).
  if (p.ai.mode === "enter") {
    const c = carById(s, p.ai.target);
    if (!c || c.wrecked) {
      p.ai.mode = "idle";
      return;
    }
    const spot = doorSpot(c, 0);
    p.x += (spot.x - p.x) * Math.min(1, dt * 10);
    p.z += (spot.z - p.z) * Math.min(1, dt * 10);
    p.h = c.h;
    if (p.enterT <= 0) finishEnter(s, p, c);
    return;
  }
  if (inp.enter) {
    if (car) {
      if (VEHICLES[car.kind].water && groundY(car.x, car.z) < WATER_Y - 0.4 && speedOf(car) < 2) {
        // Off a boat: onto the nearest dry land if it's close, else into the water.
      }
      leave(s, p);
      return;
    }
    const c = carToEnter(s, p);
    if (c) startEnter(s, p, c);
  }
  if (inp.next) cycleWeapon(s, p, 1);
  if (inp.prev) cycleWeapon(s, p, -1);
  if (inp.reload) startReload(s, p);
  if (car) {
    if (inp.horn && car.horn <= 0) {
      car.horn = 0.5;
      emit(s, { kind: "horn", x: car.x, z: car.z });
    }
    // Drive-by.
    p.aiming = inp.aim || inp.fire;
    if (inp.fire && (p.weapon === "pistol" || p.weapon === "smg")) {
      const t = lockOn(s, p, inp.yaw, inp.autoAim ? 0.5 : 0.3, 45);
      const a = t ? aimAt(s, p, t) : { h: inp.yaw, p: inp.pitch };
      fire(s, p, a.h, a.p);
    } else if (inp.fire && !WEAPONS[p.weapon].melee && p.weapon !== "pistol" && p.weapon !== "smg") {
      const smg = p.ammo.smg !== undefined ? "smg" : p.ammo.pistol !== undefined ? "pistol" : null;
      if (smg) selectWeapon(s, p, smg);
    }
    return;
  }
  stepPlayerFoot(s, p, inp, dt);
  p.aiming = inp.aim && !WEAPONS[p.weapon].melee && !p.swim;
  if (p.aiming || inp.fire) {
    const cone = inp.autoAim ? 0.62 : inp.aim ? (s.settings.aimAssist ? 0.3 : 0.08) : 0.18;
    const w = WEAPONS[p.weapon];
    const t = lockOn(s, p, inp.yaw, cone, w.melee ? 3 : w.range * 0.9, (q) => (q.hostile || isCop(q) ? -2 : 0));
    const a = t ? aimAt(s, p, t) : { h: inp.yaw, p: inp.pitch };
    p.aimH = a.h;
    p.aimP = a.p;
    if (inp.fire) fire(s, p, a.h, a.p);
  }
}

function startEnter(s: State, p: Ped, c: Car) {
  p.ai.mode = "enter";
  p.ai.target = c.id;
  let t = 0.55;
  const d = pedById(s, c.seats[0]);
  if (d && d.state === "ok" && d.role !== "player" && d.role !== "partner") {
    // Dragging the driver out.
    t = 0.95;
    leave(s, d);
    d.state = "down";
    d.downT = 1;
    if (isCop(d)) {
      crime(s, "copAttack", c.x, c.z);
      d.ai.mode = "cop";
    } else {
      crime(s, "jack", c.x, c.z);
      const tough = d.look.seed % 4 === 0;
      d.ai.mode = tough ? "fight" : "flee";
      d.ai.target = p.id;
      d.ai.dx = c.x;
      d.ai.dz = c.z;
      d.ai.timer = 14;
    }
    for (let i = 1; i < c.seats.length; i++) {
      const q = pedById(s, c.seats[i]);
      if (q && q.role !== "partner") {
        leave(s, q);
        q.ai.mode = "flee";
        q.ai.dx = c.x;
        q.ai.dz = c.z;
        q.ai.timer = 12;
      }
    }
    emit(s, { kind: "toast", text: "" });
  } else if (c.locked && !c.own) {
    t = 1.1;
    c.locked = false;
    emit(s, { kind: "glass", x: c.x, z: c.z });
    if (s.rng.next() < 0.35) c.alarm = 12;
    crime(s, "steal", c.x, c.z);
  }
  if (VEHICLES[c.kind].police && !d) crime(s, "steal", c.x, c.z);
  p.enterT = t;
}

function finishEnter(s: State, p: Ped, c: Car) {
  p.ai.mode = "idle";
  const i = c.seats[0] < 0 || pedById(s, c.seats[0])?.state !== "ok" ? 0 : c.seats.indexOf(-1);
  if (i < 0) return;
  if (c.seats[0] >= 0 && i === 0) {
    const old = pedById(s, c.seats[0]);
    if (old) leave(s, old);
  }
  seat(s, p, c, i);
  // A stolen car keeps going once it's yours: no AI.
  if (c.ai.mode !== "wreck") c.ai.mode = "idle";
  if (!c.own && !c.tag) {
    s.stats.carsStolen++;
    c.tag = "";
  }
  c.siren = false;
  if (p.weapon !== "pistol" && p.weapon !== "smg" && !WEAPONS[p.weapon].melee) {
    // Long guns go on the back seat.
  }
  emit(s, { kind: "toast", text: "" });
}

function runOver(s: State, c: Car, q: Ped, sp: number) {
  const driver = pedById(s, c.seats[0]);
  const h = Math.atan2(c.vz, c.vx);
  q.vx = c.vx * 0.75 + Math.cos(h + Math.PI / 2) * (s.rng.next() - 0.5) * 4;
  q.vz = c.vz * 0.75 + Math.sin(h + Math.PI / 2) * (s.rng.next() - 0.5) * 4;
  q.vy = Math.min(5, sp * 0.18);
  q.state = "down";
  q.downT = 0;
  damage(s, q, sp * sp * 0.35, driver?.id ?? -1, h);
  emit(s, { kind: "hit", x: q.x, z: q.z, n: sp, who: "car" });
}

/** People don't stand inside each other. */
function separate(s: State) {
  const ps = s.peds;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    if (a.car >= 0 || a.state === "dead") continue;
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (b.car >= 0 || b.state === "dead") continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      if (Math.abs(dx) > 0.7 || Math.abs(dz) > 0.7) continue;
      const d = Math.hypot(dx, dz);
      if (d >= 0.62 || d < 1e-4) continue;
      const k = (0.62 - d) / 2 / d;
      a.x -= dx * k;
      a.z -= dz * k;
      b.x += dx * k;
      b.z += dz * k;
    }
  }
}

/* ------------------------------------------------------------------ pickups */

function stepPickups(s: State) {
  const p = player(s);
  if (!p || p.state !== "ok" || p.car >= 0) return;
  for (const k of s.pickups) {
    if (k.takenAt >= 0 && (k.respawn <= 0 || s.t - k.takenAt < k.respawn)) continue;
    if (Math.abs(k.x - p.x) > 1.4 || Math.abs(k.z - p.z) > 1.4) continue;
    if (k.kind === "health" && p.hp >= 100) continue;
    if (k.kind === "armor" && p.armor >= 100) continue;
    k.takenAt = s.t;
    if (k.kind === "cash") s.money += k.n;
    else if (k.kind === "weapon" && k.weapon) giveWeapon(s, k.weapon, k.n);
    else if (k.kind === "health") p.hp = 100;
    else if (k.kind === "armor") p.armor = 100;
    emit(s, { kind: "pickup", text: k.kind === "cash" ? `+$${k.n}` : k.kind === "weapon" ? WEAPONS[k.weapon!].name : k.kind === "health" ? "Health" : k.kind === "armor" ? "Body armour" : "Package", x: k.x, z: k.z });
  }
  s.pickups = s.pickups.filter((k) => k.respawn > 0 || k.takenAt < 0);
}

/* ------------------------------------------------------------------ arrested and hospitalised */

function stepDown(s: State, dt: number) {
  const d = s.down!;
  d.t -= dt;
  if (d.t > 0) return;
  const p = player(s);
  if (s.story.run) failMission(s, d.kind === "arrested" ? "You were arrested." : "You were hospitalised.");
  const kind = d.kind;
  s.down = null;
  const pos = playerPos(s);
  if (p.car >= 0) leave(s, p);
  let spot: Poi;
  if (kind === "hospitalised") {
    spot = nearestPoi(s, "hospital", pos.x, pos.z);
    const bill = Math.min(s.money, HOSPITAL_BILL);
    s.money -= bill;
    s.stats.hospital++;
    toast(s, `Hospital bill: $${bill}`);
  } else {
    spot = nearestPoi(s, "police", pos.x, pos.z);
    const fee = Math.min(s.money, ARREST_FEE);
    s.money -= fee;
    s.stats.arrests++;
    // The police keep your guns.
    const cs = s.chars[s.active];
    cs.weapons = { fists: 0, ...(cs.weapons.bat !== undefined ? { bat: 0 } : {}) };
    cs.weapon = "fists";
    loadWeapons(p, cs);
    toast(s, `Bail and fees: $${fee}. The police kept your weapons.`);
  }
  p.state = "ok";
  p.hp = 100;
  p.armor = 0;
  p.downT = 0;
  p.cuffT = 0;
  p.vx = p.vz = p.vy = 0;
  p.y = 0;
  p.x = spot.x;
  p.z = spot.z;
  p.h = Math.atan2(spot.fz, spot.fx);
  p.ai.mode = "idle";
  clearWanted(s);
  // The units still about go home.
  s.cars = s.cars.filter((c) => !(VEHICLES[c.kind].police && c.seats.every((id) => id < 0) && !c.tag));
}

export function nearestPoi(s: State, kind: Poi["kind"], x: number, z: number) {
  let best = s.city.pois[0];
  let bd = Infinity;
  for (const p of s.city.pois) {
    if (p.kind !== kind) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** A place the player is standing at (a shop's door, a safehouse), if any. */
export function atPoi(s: State, r = 3.2) {
  const p = player(s);
  if (!p || p.car >= 0 && !s.city.pois.some((q) => q.kind === "respray")) return null;
  const pos = playerPos(s);
  for (const q of s.city.pois) {
    const rr = q.kind === "respray" || q.kind === "gas" ? 7 : r;
    if (Math.abs(q.x - pos.x) < rr && Math.abs(q.z - pos.z) < rr) {
      if (p.car >= 0 && q.kind !== "respray") continue;
      return q;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ shops and services */

export function buyWeapon(s: State, w: WeaponId) {
  const spec = WEAPONS[w];
  const p = player(s);
  const owned = p.ammo[w] !== undefined;
  const price = owned ? spec.ammo[1] : spec.price;
  if (owned && spec.melee) return "You've already got one";
  if (!spend(s, price)) return "Not enough money";
  giveWeapon(s, w, owned ? spec.ammo[0] : spec.melee ? 0 : spec.ammo[0] + spec.clip);
  return null;
}

export function buyArmor(s: State) {
  const p = player(s);
  if (p.armor >= 100) return "You're already wearing it";
  if (!spend(s, 250)) return "Not enough money";
  p.armor = 100;
  return null;
}

export function buyOutfit(s: State, id: string) {
  const o = OUTFITS.find((x) => x.id === id);
  const cs = s.chars[s.active];
  if (!o) return "Not sold here";
  if (o.only && o.only !== cs.id) return `That's for ${LEADS[o.only].name}`;
  if (!cs.outfits.includes(id)) {
    if (!spend(s, o.price)) return "Not enough money";
    cs.outfits.push(id);
  }
  cs.outfit = id;
  const p = player(s);
  p.look = leadLook(cs, o);
  // Changing clothes throws the police off a little.
  if (s.wanted.level === 1 && !s.wanted.seen) clearWanted(s);
  return null;
}

/** A respray: a new colour, the dents out, and the police lose track of you (if they can't see you). */
export function respray(s: State, color: string) {
  const c = playerCar(s);
  if (!c) return "Drive in to get a respray";
  if (VEHICLES[c.kind].police) return "We don't touch police cars";
  if (s.wanted.seen && s.wanted.level > 0) return "Not with the police watching!";
  if (!spend(s, RESPRAY_PRICE)) return "Not enough money";
  c.color = color;
  c.hp = VEHICLES[c.kind].hp;
  c.burn = -1;
  if (s.wanted.level > 0) emit(s, { kind: "lost", n: s.wanted.level });
  clearWanted(s);
  s.story.sprays++;
  return null;
}

/* ------------------------------------------------------------------ switching lead */

export function canSwitch(s: State) {
  if (s.story.run) return "Not during a mission";
  if (s.wanted.level > 0) return "Lose the police first";
  if (s.down) return "Not now";
  return null;
}

export function switchLead(s: State) {
  const err = canSwitch(s);
  if (err) return err;
  const p = player(s);
  const cs = s.chars[s.active];
  // Leave them where they are (out of any car).
  if (p.car >= 0) leave(s, p);
  syncAmmo(s, p);
  cs.x = p.x;
  cs.z = p.z;
  cs.h = p.h;
  cs.hp = Math.max(30, p.hp);
  cs.armor = p.armor;
  s.peds = s.peds.filter((q) => q.id !== p.id);
  s.active = s.active === 0 ? 1 : 0;
  spawnLead(s);
  return null;
}

export function lead(s: State) {
  return LEADS[s.chars[s.active].id];
}

/* ------------------------------------------------------------------ saving */

export interface SaveFile {
  v: 1;
  active: 0 | 1;
  chars: CharState[];
  money: number;
  stats: State["stats"];
  story: Omit<State["story"], "run">;
  clock: number;
  day: number;
  radio: State["radio"];
}

export function save(s: State): string {
  const p = player(s);
  const cs = s.chars[s.active];
  if (p) {
    syncAmmo(s, p);
    const pos = playerPos(s);
    cs.x = pos.x;
    cs.z = pos.z;
    cs.h = pos.h;
    cs.hp = Math.max(40, p.hp);
    cs.armor = p.armor;
  }
  const story = { ...s.story, run: undefined };
  delete (story as { run?: unknown }).run;
  const f: SaveFile = { v: 1, active: s.active, chars: s.chars, money: s.money, stats: s.stats, story, clock: s.clock, day: s.day, radio: s.radio };
  return JSON.stringify(f);
}

export function load(json: string, seed = 7): State | null {
  try {
    const f = JSON.parse(json) as SaveFile;
    if (f.v !== 1) return null;
    const s = createState(seed);
    s.active = f.active;
    s.chars = [f.chars[0], f.chars[1]] as State["chars"];
    // A saved spot in the sea or a building: back home instead.
    for (const c of s.chars) if (groundY(c.x, c.z) < WATER_Y) Object.assign(c, { x: poi(s.city, LEADS[c.id].home).x, z: poi(s.city, LEADS[c.id].home).z });
    s.money = f.money;
    s.stats = { ...s.stats, ...f.stats };
    s.story = { ...s.story, ...f.story, run: null };
    s.clock = f.clock;
    s.day = f.day;
    s.radio = f.radio;
    spawnLead(s);
    spawnTrams(s);
    for (let i = 0; i < 90; i++) populate(s, 0.2, () => spawnPed(s));
    return s;
  } catch {
    return null;
  }
}

/** The leaderboard score: the story, side jobs and what you've earned. */
export function score(s: State) {
  return Math.round(s.stats.earned / 10 + missionScore(s));
}

/** Where the player is, for the HUD: street and district. */
export function whereAmI(s: State) {
  const pos = playerPos(s);
  return { street: streetName(s.city, pos.x, pos.z), district: districtAt(pos.x, pos.z) };
}

export function charOf(s: State, id: CharId) {
  return s.chars.find((c) => c.id === id)!;
}

export { player, playerCar, playerPos, speedOf };
