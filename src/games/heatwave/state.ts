import { createRng, type Rng } from "../engine/rng";
import { LEADS, START_MONEY, VEHICLES, WEAPONS, type CharId, type StationId, type VehicleKind, type WeaponId } from "./data";
import { generate, type City, type Poi } from "./world";

/**
 * The simulation's state: plain objects stepped by the systems in vehicles.ts, peds.ts,
 * traffic.ts, combat.ts, police.ts and missions.ts. Headings follow the shared kit: forward is
 * (cos h, sin h), and a model's rotation.y is −h.
 */

export type Role = "player" | "civ" | "cop" | "swat" | "gang" | "mission" | "partner" | "medic";

export type PedMode =
  | "wander"
  | "idle"
  | "flee"
  | "cower"
  | "fight"
  | "cop"
  | "drive"
  | "ride"
  | "goto"
  | "guard"
  | "follow"
  | "enter"
  | "beach";

export interface PedAi {
  mode: PedMode;
  /** Sidewalk walking: the segment, which way, which side (−1 left, 1 right). */
  seg: number;
  fwd: boolean;
  side: number;
  /** Target ped (fight, cop, follow) or vehicle (enter). */
  target: number;
  timer: number;
  /** Where they're headed (goto, flee from, beach stroll). */
  dx: number;
  dz: number;
  /** Has seen the player do something (a witness, about to call it in). */
  report: number;
}

export interface Look {
  seed: number;
  skin: string;
  shirt: string;
  pants: string;
  hair?: string;
  female?: boolean;
  top?: string;
  bottom?: string;
  hairStyle?: string;
  hat?: string;
  beard?: boolean;
}

export interface Ped {
  id: number;
  role: Role;
  x: number;
  z: number;
  y: number;
  vy: number;
  h: number;
  /** Ground velocity (also knockback). */
  vx: number;
  vz: number;
  hp: number;
  maxHp: number;
  armor: number;
  state: "ok" | "down" | "dead";
  /** Seconds on the ground / since death (bodies are cleared later). */
  downT: number;
  /** The vehicle they're in (−1 on foot) and the seat (0 drives). */
  car: number;
  seat: number;
  weapon: WeaponId;
  clip: number;
  ammo: Partial<Record<WeaponId, number>>;
  reloadT: number;
  cool: number;
  aiming: boolean;
  /** Where they're aiming (heading), and pitch. */
  aimH: number;
  aimP: number;
  /** Muzzle flash / swing timer for the renderer. */
  fireT: number;
  hitT: number;
  swim: boolean;
  look: Look;
  ai: PedAi;
  /** Fights back / attacks the player on sight. */
  hostile: boolean;
  /** A mission's ped: kept, never despawned. */
  tag: string;
  /** Who last hurt them. */
  lastHit: number;
  /** Getting in (seconds left) / jacking someone out. */
  enterT: number;
  /** Arrest progress (cops cuffing the player). */
  cuffT: number;
}

export type CarMode = "traffic" | "parked" | "flee" | "police" | "idle" | "goto" | "chase" | "escape" | "swat" | "wreck";

export interface CarAi {
  mode: CarMode;
  seg: number;
  fwd: boolean;
  lane: number;
  /** The next segment chosen at the junction ahead. */
  next: number;
  nextFwd: boolean;
  wait: number;
  stuck: number;
  /** Chasing / ramming this ped (or their car). */
  target: number;
  /** A route to follow (goto / escape), and how far along it. */
  path: { x: number; z: number }[];
  pi: number;
  cruise: number;
  /** Reversing out of a jam. */
  backT: number;
}

export interface Car {
  id: number;
  kind: VehicleKind;
  x: number;
  z: number;
  h: number;
  vx: number;
  vz: number;
  /** Yaw rate (rad/s). */
  w: number;
  steer: number;
  throttle: number;
  brake: boolean;
  hp: number;
  /** Seconds until it blows (−1 when not on fire). */
  burn: number;
  wrecked: boolean;
  sink: number;
  color: string;
  plate: string;
  /** Seat → ped id (−1 empty); seat 0 drives. */
  seats: number[];
  ai: CarAi;
  siren: boolean;
  horn: number;
  alarm: number;
  locked: boolean;
  tag: string;
  /** Heli altitude (air vehicles), boat bob. */
  y: number;
  lastHit: number;
  /** Owned by the player (their signature ride, or a mission's). */
  own: boolean;
  /** Seconds since it was last near the player (for despawning). */
  idleT: number;
  /** A tram: which route and track, how far along it, its speed and its dwell at a stop. */
  tram?: { route: number; dir: 0 | 1; s: number; v: number; dwell: number; stop: number };
}

export interface Wanted {
  level: number;
  /** Where the police last saw the player, and when. */
  lx: number;
  lz: number;
  seenAt: number;
  /** Seen right now. */
  seen: boolean;
  /** Cops killed this spree (each three adds a star). */
  copKills: number;
  /** Rising to at least this (a crime being reported) at `reportAt`. */
  pending: number;
  reportAt: number;
  /** The police have been shot at (cops shoot back even at one star). */
  hostile: boolean;
}

export interface Tracer {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  t: number;
  by_: number;
}

export interface Boom {
  x: number;
  z: number;
  y: number;
  t: number;
  r: number;
}

export interface Grenade {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuse: number;
  by: number;
}

export type EvKind = "toast" | "shot" | "hit" | "boom" | "crash" | "money" | "wanted" | "lost" | "arrested" | "hospitalised" | "mission" | "pass" | "fail" | "pickup" | "horn" | "siren" | "punch" | "glass" | "dialog" | "unlock" | "stunt";
export interface Ev {
  kind: EvKind;
  text?: string;
  x?: number;
  z?: number;
  n?: number;
  who?: string;
}

export interface CharState {
  id: CharId;
  /** The ped while playing as them; their spot while not. */
  x: number;
  z: number;
  h: number;
  hp: number;
  armor: number;
  weapons: Partial<Record<WeaponId, number>>;
  weapon: WeaponId;
  outfit: string;
  outfits: string[];
}

export interface Stats {
  played: number;
  driven: number;
  walked: number;
  carsStolen: number;
  kills: number;
  copsKilled: number;
  shots: number;
  hits: number;
  arrests: number;
  hospital: number;
  maxWanted: number;
  stores: number;
  races: number;
  exports: number;
  earned: number;
  spent: number;
  explosions: number;
  topSpeed: number;
  jumps: number;
}

export interface Pickup {
  id: number;
  kind: "cash" | "weapon" | "armor" | "health" | "package";
  x: number;
  z: number;
  n: number;
  weapon?: WeaponId;
  /** Respawns after taking (fixed pickups), or gone. */
  respawn: number;
  takenAt: number;
}

export interface Settings {
  /** Auto-aim on touch (always on), and when aiming with a mouse. */
  aimAssist: boolean;
}

export interface State {
  seed: number;
  rng: Rng;
  city: City;
  t: number;
  /** Minutes into the day (0–1440). */
  clock: number;
  day: number;
  weather: { kind: "clear" | "cloudy" | "storm"; next: number; rain: number; to: number };
  nextId: number;
  peds: Ped[];
  cars: Car[];
  /** The player's ped id. */
  player: number;
  active: 0 | 1;
  chars: [CharState, CharState];
  money: number;
  wanted: Wanted;
  stats: Stats;
  tracers: Tracer[];
  booms: Boom[];
  grenades: Grenade[];
  pickups: Pickup[];
  events: Ev[];
  waypoint: { x: number; z: number } | null;
  /** Arrested or hospitalised: the screen fades and you're moved (seconds left). */
  down: { kind: "arrested" | "hospitalised"; t: number } | null;
  radio: StationId;
  settings: Settings;
  /** Mission and side-job state (missions.ts). */
  story: Story;
  /** Density by quality: how many cars and people to keep round the player. */
  density: { cars: number; peds: number };
  /** Spawn bookkeeping. */
  spawnT: number;
  /** For tests: no random traffic or people. */
  empty: boolean;
  /** Mission markers start a mission only once you've stepped away from them (not on arrival or loading). */
  armed: boolean;
}

export interface Story {
  /** Story missions passed, by id. */
  done: string[];
  /** The mission running. */
  run: MissionRun | null;
  /** Side jobs: store robbery cooldowns (store id → time), races won, exports delivered. */
  robbed: Record<string, number>;
  races: Record<string, number>;
  exportsDone: string[];
  /** Today's wanted car for the chop shop. */
  exportCar: VehicleKind;
  exportDay: number;
  /** Respray uses. */
  sprays: number;
  /** Hidden sun tokens found. */
  tokens: number[];
  /** Properties bought (safehouses beyond the first two). */
  owned: string[];
  /** The last place the game was saved (a safehouse id). */
  savedAt: string;
}

export interface MissionRun {
  id: string;
  step: number;
  /** Time in this step, and in the mission. */
  t: number;
  total: number;
  /** Mission entities by tag. */
  peds: number[];
  cars: number[];
  /** Step state (counters, a checkpoint index). */
  n: number;
  /** The objective line and dialogue. */
  text: string;
  /** Where to go (marker). */
  goal: { x: number; z: number; r: number } | null;
  /** Failed with this reason (shown, then cleared). */
  failed: string;
  /** A countdown (seconds left), if the step has one. */
  timer: number;
  /** Money banked on passing. */
  pay: number;
}

export function blankStats(): Stats {
  return { played: 0, driven: 0, walked: 0, carsStolen: 0, kills: 0, copsKilled: 0, shots: 0, hits: 0, arrests: 0, hospital: 0, maxWanted: 0, stores: 0, races: 0, exports: 0, earned: 0, spent: 0, explosions: 0, topSpeed: 0, jumps: 0 };
}

export function newChar(id: CharId, city: City): CharState {
  const home = poi(city, LEADS[id].home);
  return {
    id,
    x: home.x,
    z: home.z,
    h: Math.atan2(-home.fz, -home.fx),
    hp: 100,
    armor: 0,
    weapons: { fists: 0, ...(id === "dex" ? { bat: 0 } : {}) },
    weapon: "fists",
    outfit: `${id}-start`,
    outfits: [`${id}-start`],
  };
}

export function poi(city: City, id: string): Poi {
  const p = city.pois.find((q) => q.id === id);
  if (!p) throw new Error(`Heatwave: no place ${id}`);
  return p;
}

let cityCache: { seed: number; city: City } | null = null;
/** The map is the same for every game of a seed: build it once. */
export function cityFor(seed: number) {
  if (!cityCache || cityCache.seed !== seed) cityCache = { seed, city: generate(seed) };
  return cityCache.city;
}

export function createState(seed = 7, opts: { empty?: boolean } = {}): State {
  const city = cityFor(7);
  const s: State = {
    seed,
    rng: createRng(seed),
    city,
    t: 0,
    clock: 9 * 60,
    day: 1,
    weather: { kind: "clear", next: 900, rain: 0, to: 0 },
    nextId: 1,
    peds: [],
    cars: [],
    player: -1,
    active: 0,
    chars: [newChar("nina", city), newChar("dex", city)],
    money: START_MONEY,
    wanted: blankWanted(),
    stats: blankStats(),
    tracers: [],
    booms: [],
    grenades: [],
    pickups: [],
    events: [],
    waypoint: null,
    down: null,
    radio: "neon",
    settings: { aimAssist: true },
    story: { done: [], run: null, robbed: {}, races: {}, exportsDone: [], exportCar: "vanta", exportDay: 0, sprays: 0, tokens: [], owned: [], savedAt: "safe-nina" },
    density: { cars: 30, peds: 34 },
    spawnT: 0,
    empty: !!opts.empty,
    armed: false,
  };
  return s;
}

export function blankWanted(): Wanted {
  return { level: 0, lx: 0, lz: 0, seenAt: -1e9, seen: false, copKills: 0, pending: 0, reportAt: 0, hostile: false };
}

/* ------------------------------------------------------------------ lookups and helpers */

export const fwdX = (h: number) => Math.cos(h);
export const fwdZ = (h: number) => Math.sin(h);
export const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(bx - ax, bz - az);

export function pedById(s: State, id: number) {
  for (const p of s.peds) if (p.id === id) return p;
  return undefined;
}
export function carById(s: State, id: number) {
  for (const c of s.cars) if (c.id === id) return c;
  return undefined;
}
export function player(s: State) {
  return pedById(s, s.player)!;
}
/** The car the player's in, if any. */
export function playerCar(s: State) {
  const p = player(s);
  return p && p.car >= 0 ? carById(s, p.car) : undefined;
}
/** Where the player is (their car's position when driving). */
export function playerPos(s: State) {
  const p = player(s);
  const c = playerCar(s);
  return c ? { x: c.x, z: c.z, h: c.h } : { x: p.x, z: p.z, h: p.h };
}

export function emit(s: State, e: Ev) {
  s.events.push(e);
  if (s.events.length > 200) s.events.splice(0, s.events.length - 200);
}

export function toast(s: State, text: string) {
  emit(s, { kind: "toast", text });
}

export function earn(s: State, n: number, why = "") {
  s.money += n;
  s.stats.earned += n;
  emit(s, { kind: "money", n, text: why });
}

export function spend(s: State, n: number) {
  if (s.money < n) return false;
  s.money -= n;
  s.stats.spent += n;
  emit(s, { kind: "money", n: -n });
  return true;
}

export function makePed(s: State, role: Role, x: number, z: number, h: number, look: Look, o: Partial<Ped> = {}): Ped {
  const p: Ped = {
    id: s.nextId++,
    role,
    x,
    z,
    y: 0,
    vy: 0,
    h,
    vx: 0,
    vz: 0,
    hp: 100,
    maxHp: 100,
    armor: 0,
    state: "ok",
    downT: 0,
    car: -1,
    seat: -1,
    weapon: "fists",
    clip: 0,
    ammo: {},
    reloadT: 0,
    cool: 0,
    aiming: false,
    aimH: h,
    aimP: 0,
    fireT: 0,
    hitT: 0,
    swim: false,
    look,
    ai: { mode: "idle", seg: -1, fwd: true, side: 1, target: -1, timer: 0, dx: x, dz: z, report: 0 },
    hostile: false,
    tag: "",
    lastHit: -1,
    enterT: 0,
    cuffT: 0,
    ...o,
  };
  s.peds.push(p);
  return p;
}

const PLATE = "ABCDEFGHJKLMNPRSTUVWXYZ";
export function makeCar(s: State, kind: VehicleKind, x: number, z: number, h: number, color?: string, o: Partial<Car> = {}): Car {
  const spec = VEHICLES[kind];
  const r = s.rng;
  const c: Car = {
    id: s.nextId++,
    kind,
    x,
    z,
    h,
    vx: 0,
    vz: 0,
    w: 0,
    steer: 0,
    throttle: 0,
    brake: false,
    hp: spec.hp,
    burn: -1,
    wrecked: false,
    sink: 0,
    color: color ?? (spec.colors ? r.pick(spec.colors) : r.pick(["#1c1f24", "#e8e8e6", "#8a8f96", "#7a1d1d", "#1d3f7a", "#2f5a3a", "#c9b27a", "#b8c4cf", "#3a3a44", "#d0662b", "#3fa7a0", "#e14b6a"])),
    plate: `${PLATE[r.int(0, PLATE.length - 1)]}${PLATE[r.int(0, PLATE.length - 1)]}${r.int(10, 99)} ${PLATE[r.int(0, PLATE.length - 1)]}${r.int(100, 999)}`,
    seats: Array.from({ length: spec.seats }, () => -1),
    ai: { mode: "idle", seg: -1, fwd: true, lane: 0, next: -1, nextFwd: true, wait: 0, stuck: 0, target: -1, path: [], pi: 0, cruise: 12, backT: 0 },
    siren: false,
    horn: 0,
    alarm: 0,
    locked: false,
    tag: "",
    y: spec.air ? 30 : 0,
    lastHit: -1,
    own: false,
    idleT: 0,
    ...o,
  };
  s.cars.push(c);
  return c;
}

export function speedOf(c: Car) {
  return Math.hypot(c.vx, c.vz);
}
/** Signed speed along the car's heading. */
export function fwdSpeed(c: Car) {
  return c.vx * Math.cos(c.h) + c.vz * Math.sin(c.h);
}

/** A lead's look, in the outfit they're wearing. */
export function leadLook(cs: CharState, outfit: { shirt: string; pants: string; top: string; bottom: string; hat: string }): Look {
  const L = LEADS[cs.id];
  return {
    seed: cs.id === "nina" ? 4242 : 7171,
    skin: L.skin,
    shirt: outfit.shirt,
    pants: outfit.pants,
    hair: L.hair,
    female: L.female,
    top: outfit.top,
    bottom: outfit.bottom,
    hairStyle: L.hairStyle,
    hat: outfit.hat,
    beard: L.beard,
  };
}

export function hasWeapon(cs: CharState, w: WeaponId) {
  return cs.weapons[w] !== undefined;
}

export function weaponSpec(w: WeaponId) {
  return WEAPONS[w];
}
