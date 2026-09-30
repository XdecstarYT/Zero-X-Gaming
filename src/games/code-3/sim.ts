import { createRng, type Rng } from "../engine/rng";
import {
  blockAt,
  buildingsNear,
  describe,
  generateCity,
  HALF_ROAD,
  HALF_STREET,
  lightFor,
  LINES,
  lineOfSight,
  nearestNode,
  neighbours,
  nodeId,
  nodePos,
  onRoad,
  SIZE,
  SPEED_LIMIT,
  type City,
  type Place,
} from "./city";
import {
  fullName,
  LINES_DRINK,
  LINES_ILLEGAL,
  LINES_WHY,
  makePerson,
  makeRegistration,
  type Offence,
  type Person,
  type PersonOpts,
  type Violation,
} from "./people";
import {
  CAR_COLORS,
  carCircles,
  COLOR_NAMES,
  chooseNext,
  CIVILIAN_KINDS,
  collideCars,
  collideWorld,
  damageFor,
  drive,
  forward,
  laneStart,
  makeAi,
  makeCar,
  right,
  spawnOnLane,
  speedOf,
  stepCar,
  type AiWorld,
  type Car,
  type CarKind,
} from "./vehicles";

/**
 * Code 3: one patrol shift in Bayview. Pure simulation (no DOM, no WebGL):
 * the officer on foot or in the unit, civilian traffic and pedestrians,
 * dispatch callouts, traffic stops with a real procedure (ID, MDT, questions,
 * breathalyzer, consent / probable cause searches, citations, arrests),
 * pursuits, foot chases, backup, prisoner transport and booking, and a score
 * that rewards good police work and punishes bad calls.
 */

export type PedState =
  | "walk"
  | "stand"
  | "talk"
  | "driving"
  | "flee"
  | "handsup"
  | "down"
  | "cuffed"
  | "escort"
  | "incar"
  | "attack"
  | "dead"
  | "gone"
  | "panic"
  | "fight"
  | "cross"
  /** Kneeling, hands on head, facing away (a command). */
  | "kneel"
  /** Face down on the ground, arms out (a command). */
  | "prone"
  /** Walking backwards toward the officer's voice (felony stop). */
  | "backing";

export type Role = "civilian" | "driver" | "suspect" | "victim" | "officer";

export interface Ped {
  id: string;
  person: Person;
  role: Role;
  x: number;
  z: number;
  h: number;
  speed: number;
  state: PedState;
  hp: number;
  /** Sidewalk walking: block index, perimeter position, direction. */
  walk?: { block: number; t: number; dir: 1 | -1 };
  carId?: string;
  downUntil: number;
  /** Next time this ped can shoot / punch. */
  attackAt: number;
  /** Weapon out (shown in hand). */
  drawn: boolean;
  shirt: string;
  pants: string;
  skin: string;
  /** Walk cycle phase (render). */
  step: number;
  /** Seconds this fleeing ped has been far from the officer. */
  lostT: number;
  /** Domestic: the one who did it. */
  aggressor?: boolean;
  /** Call this ped belongs to. */
  call?: string;
  /** Transport van coming for this prisoner. */
  pickup?: string;
  /** Panicking: running from this point until `panicUntil`. */
  panicFrom?: { x: number; z: number };
  panicUntil?: number;
  /** Fighting this ped. */
  foe?: string;
  /** Jaywalking toward this point. */
  cross?: { x: number; z: number };
  /** Cuffed from kneeling / prone: stays down until stood up. */
  kneeling?: boolean;
  /** Taser cycle: muscles locked until this time. */
  tasedUntil?: number;
  /** What they're doing on scene (render): spray-painting, blasting music. */
  task?: "spray" | "music" | "film";
  /** Fugitive already bolted once. */
  spooked?: boolean;
  /** Bystander: go back to walking at this time (after filming, hands up...). */
  resumeAt?: number;
  /** Already said hello / already asked as a witness. */
  greeted?: boolean;
  witnessed?: boolean;
}

/** Things the officer can set up on the road. */
export interface Deployable {
  id: string;
  kind: "checkpoint" | "roadblock" | "cones" | "traffic";
  /** Traffic control: which approaches are held (the officer directing traffic). */
  hold?: "all" | "ns" | "ew";
  node?: number;
  x: number;
  z: number;
  /** Direction of the traffic it controls (checkpoint) / along the road. */
  dx: number;
  dz: number;
  /** Cone positions (cones). */
  points?: { x: number; z: number }[];
  /** Collision box (roadblock). */
  hw?: number;
  hd?: number;
}

export interface Contact {
  id: string;
  ped: string;
  car?: string;
  reason: string;
  idShown: boolean;
  ranPerson: boolean;
  ranPlate: boolean;
  asked: Set<"why" | "drink" | "illegal" | "what">;
  breath: boolean;
  searched: boolean;
  /** Refused consent to search. */
  refused: boolean;
  /** Evidence from an illegal search (doesn't count). */
  tainted: boolean;
  /** Probable cause the officer has noticed. */
  pc: Set<string>;
  violations: Set<Violation>;
  offences: Set<Offence>;
  cited: boolean;
  resolved: "" | "released" | "arrested" | "cited" | "fled";
  /** Rolled once: will they run at the lights / during the stop? */
  runs: boolean;
  /** K9 sniff result arrives at this time. */
  k9At?: number;
  fst?: boolean;
  miranda?: boolean;
  /** Screened at this checkpoint. */
  checkpoint?: string;
  /** High-risk (felony) stop: driver ordered out at gunpoint. */
  felony?: boolean;
  /** Verbal commands obeyed during this contact. */
  commands?: number;
}

export type CallKind =
  | "robbery"
  | "bank"
  | "shots"
  | "stolen"
  | "pursuit"
  | "race"
  | "dui"
  | "collision"
  | "suspicious"
  | "domestic"
  | "hitrun"
  | "shoplift"
  | "burglary"
  | "fight"
  | "drunk"
  | "assist"
  | "vandalism"
  | "fugitive"
  | "abandoned"
  | "roadrage"
  | "noise";

export interface Call {
  id: string;
  kind: CallKind;
  title: string;
  code: 2 | 3;
  where: string;
  x: number;
  z: number;
  state: "offered" | "enroute" | "onscene" | "done" | "failed" | "expired" | "declined";
  offeredAt: number;
  acceptedAt: number;
  suspects: string[];
  victims: string[];
  cars: string[];
  /** Car whose position the GPS follows. */
  track?: string;
  trackAt: number;
  points: number;
  towAt?: number;
  note: string;
  /** Ped the GPS follows (last seen position). */
  trackPed?: string;
  /** Abandoned vehicle: plate run from the scene. */
  plateRun?: boolean;
}

/** Paperwork: every arrest, closed call and use of force needs a report filed from the unit's MDT. */
export interface Report {
  id: string;
  kind: "arrest" | "incident" | "force";
  title: string;
  lines: string[];
  at: number;
  filed: boolean;
}

export interface LogLine {
  t: number;
  text: string;
  kind: "radio" | "info" | "good" | "bad" | "speech";
}

export type SimEvent =
  | { type: "shot"; x: number; z: number; tx: number; tz: number; by: "player" | "ped" | "backup"; hit: boolean }
  | { type: "taser"; x: number; z: number; tx: number; tz: number; hit: boolean }
  | { type: "crash"; x: number; z: number; speed: number; player: boolean }
  | { type: "radio" }
  | { type: "cuff" }
  | { type: "score"; points: number; text: string }
  | { type: "hurt" };

export type OptionGroup = "talk" | "check" | "command" | "enforce" | "custody" | "scene" | "unit";

export interface Option {
  id: string;
  label: string;
  /** Category for the action menu (tabs / icons). */
  group?: OptionGroup;
}

const GROUP_OF: Record<string, OptionGroup> = {
  talk: "talk",
  why: "talk",
  what: "talk",
  drink: "talk",
  illegal: "talk",
  out: "command",
  "felony-out": "command",
  "cmd-kneel": "command",
  "cmd-prone": "command",
  "cmd-back": "command",
  id: "check",
  person: "check",
  plate: "check",
  fst: "check",
  breath: "check",
  k9: "check",
  search: "check",
  "ab-plate": "check",
  cite: "enforce",
  warn: "enforce",
  arrest: "enforce",
  release: "enforce",
  escort: "custody",
  load: "custody",
  transport: "custody",
  miranda: "custody",
  stand: "custody",
  tow: "scene",
  "ab-tow": "scene",
  ems: "scene",
  "cp-screen": "scene",
  "cp-wave": "scene",
  witness: "talk",
  "park-ticket": "enforce",
  "park-tow": "scene",
  "tc-all": "scene",
  "tc-ns": "scene",
  "tc-ew": "scene",
  "tc-off": "scene",
  coffee: "unit",
};

/** Fines by violation ($), printed on the ticket. */
export const FINES: Record<Violation, number> = {
  speeding: 185,
  "red light": 238,
  "broken tail light": 60,
  "expired registration": 120,
  "no insurance": 350,
  "suspended licence": 500,
  "expired licence": 90,
  "no licence": 400,
  "reckless driving": 450,
  jaywalking: 75,
  "noise ordinance": 150,
  "no seatbelt": 115,
  "phone while driving": 162,
  "illegal parking": 65,
  littering: 250,
};
/** Everything the ticket book can write, in book order. */
export const TICKET_BOOK = Object.keys(FINES) as Violation[];
export function groupOf(id: string): OptionGroup {
  return GROUP_OF[id] ?? "unit";
}

export interface Code3Input {
  throttle: number;
  steer: number;
  handbrake: boolean;
  /** On foot: -1..1 strafe / forward. */
  moveX: number;
  moveZ: number;
  /** Aim / camera yaw on foot (radians, same convention as heading). */
  yaw: number;
  sprint: boolean;
  fire: boolean;
  enter: boolean;
  /** Cycle lights → lights + siren → off (true = once, or a count of presses). */
  lights: boolean | number;
  horn: boolean;
  backup: boolean;
  accept: boolean;
  decline: boolean;
  choose: number | null;
  weapon: "taser" | "pistol" | null;
  /** "Police! Stop!" */
  shout: boolean;
  /** Lay (or pick up) a spike strip. */
  spikes?: boolean;
  /** Set up / take down a sobriety checkpoint, a roadblock, a line of cones. */
  checkpoint?: boolean;
  roadblock?: boolean;
  cones?: boolean;
  /** Request the helicopter. */
  air?: boolean;
  flashlight?: boolean;
  /** Cycle the siren tone (wail → yelp → phaser). */
  sirenTone?: boolean;
  /** Pick an action by id (the MDT's report list, the ticket book). */
  chooseId?: string | null;
  /** On foot with a weapon raised (bystanders react). */
  aim?: boolean;
}

export const NO_INPUT: Code3Input = {
  throttle: 0,
  steer: 0,
  handbrake: false,
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  sprint: false,
  fire: false,
  enter: false,
  lights: false,
  horn: false,
  backup: false,
  accept: false,
  decline: false,
  choose: null,
  weapon: null,
  shout: false,
};

export interface Stats {
  score: number;
  calls: number;
  arrests: number;
  citations: number;
  stops: number;
  pursuits: number;
  booked: number;
  penalties: number;
  /** Drivers screened at checkpoints. */
  screened: number;
  /** Fines written on tickets ($). */
  fines: number;
  /** Lines for the shift report. */
  report: { text: string; points: number }[];
}

export interface SimOptions {
  seed?: number;
  unit?: CarKind;
  /** Real seconds in the shift. */
  shiftSeconds?: number;
  /** Clock hour the shift starts (20 = night shift). */
  startHour?: number;
  /** Career rank index: unlocks harder calls. */
  rank?: number;
  traffic?: number;
  peds?: number;
  /** First callout after this many seconds. */
  firstCall?: number;
  weather?: Weather;
  /** Seconds a dispatch offer stays open (default 25). */
  offerSeconds?: number;
}

export type Weather = "clear" | "overcast" | "rain" | "fog";

const SKINS = ["#f1d0b5", "#e0b28f", "#c68b62", "#9a6440", "#6b4328", "#4a2e1d"];
const SHIRTS = ["#3f6fb5", "#b53f3f", "#e0e0e0", "#2f2f35", "#6b8e4e", "#d9a441", "#7a4fa3", "#3aa6a0", "#c77d4a", "#555c66"];
const PANTS = ["#2b3445", "#1f1f22", "#4b4034", "#5a6270", "#2f3b2a"];

export const WALK = 1.4;
export const RUN = 5.6;
export const OFFICER_WALK = 3.4;
export const OFFICER_SPRINT = 6.9;
const TASER_RANGE = 11;
const GUN_RANGE = 55;
const TALK_RANGE = 3;
const BACKUP_COOLDOWN = 45;

interface CallDef {
  kind: CallKind;
  title: string;
  code: 2 | 3;
  weight: number;
  minRank: number;
  points: number;
}

export const CALLS: CallDef[] = [
  { kind: "suspicious", title: "Suspicious person", code: 2, weight: 3, minRank: 0, points: 80 },
  { kind: "collision", title: "Traffic collision", code: 2, weight: 3, minRank: 0, points: 150 },
  { kind: "dui", title: "Possible drunk driver", code: 2, weight: 3, minRank: 0, points: 150 },
  { kind: "domestic", title: "Domestic disturbance", code: 3, weight: 2, minRank: 0, points: 180 },
  { kind: "shoplift", title: "Shoplifter fleeing a store", code: 2, weight: 2, minRank: 0, points: 120 },
  { kind: "hitrun", title: "Hit and run", code: 3, weight: 1.5, minRank: 1, points: 220 },
  { kind: "stolen", title: "Stolen vehicle spotted", code: 3, weight: 2.5, minRank: 0, points: 200 },
  { kind: "robbery", title: "Armed robbery in progress", code: 3, weight: 2, minRank: 1, points: 300 },
  { kind: "shots", title: "Shots fired", code: 3, weight: 1.5, minRank: 1, points: 300 },
  { kind: "pursuit", title: "Pursuit in progress: units requested", code: 3, weight: 2, minRank: 1, points: 250 },
  { kind: "race", title: "Street racing", code: 3, weight: 1.5, minRank: 2, points: 250 },
  { kind: "bank", title: "Bank robbery: silent alarm", code: 3, weight: 1, minRank: 3, points: 500 },
  { kind: "burglary", title: "Burglary in progress", code: 3, weight: 2, minRank: 0, points: 200 },
  { kind: "fight", title: "Fight in the street", code: 3, weight: 2, minRank: 0, points: 140 },
  { kind: "drunk", title: "Intoxicated person causing a disturbance", code: 2, weight: 2, minRank: 0, points: 90 },
  { kind: "assist", title: "Officer needs assistance", code: 3, weight: 1.5, minRank: 0, points: 260 },
  { kind: "vandalism", title: "Vandalism in progress", code: 2, weight: 2, minRank: 0, points: 110 },
  { kind: "fugitive", title: "Wanted fugitive sighted", code: 3, weight: 1.2, minRank: 1, points: 280 },
  { kind: "abandoned", title: "Abandoned vehicle", code: 2, weight: 1.8, minRank: 0, points: 90 },
  { kind: "roadrage", title: "Road rage: drivers fighting", code: 3, weight: 1.8, minRank: 0, points: 170 },
  { kind: "noise", title: "Noise complaint", code: 2, weight: 2, minRank: 0, points: 70 },
];

/** A shirt colour as a witness would say it. */
function colourWord(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 60) return "black";
  if (max - min < 25) return max > 200 ? "white" : "grey";
  if (r === max) return g > 150 ? (g > 200 ? "yellow" : "orange") : "red";
  if (g === max) return "green";
  return b > 150 && r > 100 ? "purple" : "blue";
}

export class Code3Sim {
  readonly city: City;
  readonly rng: Rng;
  time = 0;
  readonly shiftSeconds: number;
  readonly startHour: number;
  cars: Car[] = [];
  peds: Ped[] = [];
  readonly unit: Car;
  player = {
    x: 0,
    z: 0,
    h: 0,
    hp: 100,
    inCar: true,
    weapon: "taser" as "taser" | "pistol",
    taserAt: 0,
    gunAt: 0,
    stamina: 1,
    escort: null as string | null,
    moving: false,
    sprinting: false,
    hurtAt: -10,
  };
  contacts: Contact[] = [];
  calls: Call[] = [];
  log: LogLine[] = [];
  events: SimEvent[] = [];
  stats: Stats = { score: 0, calls: 0, arrests: 0, citations: 0, stops: 0, pursuits: 0, booked: 0, penalties: 0, screened: 0, fines: 0, report: [] };
  over: null | { reason: string } = null;
  /** Car being pulled over. */
  stopCar: string | null = null;
  /** Radar reading of the car ahead (m/s), or null. */
  radar: { id: string; speed: number } | null = null;
  /** Last line spoken to the officer (shown in the dialogue box). */
  speech: { who: string; text: string; at: number } | null = null;
  /** MDT results for the current contact. */
  mdt: { title: string; lines: string[]; flag: boolean; at: number }[] = [];
  backupReadyAt = 0;
  readonly weather: Weather;
  private readonly offerSeconds: number;
  /** Tyre grip multiplier from the weather. */
  readonly surface: number;
  /** Deployed spike strip (one at a time). */
  spikes: { x: number; z: number; h: number; until: number } | null = null;
  /** Checkpoint, roadblock and cones set up by the officer. */
  deploy: Deployable[] = [];
  /** Air-1: the police helicopter tracking a suspect. */
  air: { x: number; z: number; target: string; until: number } | null = null;
  airReadyAt = 0;
  flashlight = false;
  sirenTone: "wail" | "yelp" | "phaser" = "wail";
  /** Cars the plate reader has flagged (stolen, expired, wanted owner). */
  flagged = new Set<string>();
  /** Paperwork to file from the MDT. */
  reports: Report[] = [];
  /** The officer is on the radio until this time (render: hand to the shoulder mic). */
  radioUntil = 0;
  private coffeeAt = 0;
  private aimNoticedAt = 0;
  private scanned = new Set<string>();
  private alprAt = 0;
  private nextIncidentAt = 70;
  private pursuitReportAt = 0;
  private nextCallAt: number;
  private seq = 0;
  private readonly rankIdx: number;
  private readonly trafficN: number;
  private readonly pedN: number;
  private lightsWas = 0;
  private stopCandidate: { id: string; since: number } | null = null;

  constructor(o: SimOptions = {}) {
    this.rng = createRng(o.seed ?? 42);
    this.city = generateCity();
    this.shiftSeconds = o.shiftSeconds ?? 900;
    this.startHour = o.startHour ?? 20;
    this.rankIdx = o.rank ?? 0;
    this.trafficN = o.traffic ?? 26;
    this.pedN = o.peds ?? 34;
    this.nextCallAt = o.firstCall ?? 25;
    this.weather = o.weather ?? "clear";
    this.offerSeconds = o.offerSeconds ?? 25;
    this.surface = this.weather === "rain" ? 0.72 : 1;
    const st = this.city.station;
    this.unit = makeCar("unit", o.unit ?? "cruiser", st.x, st.z, -Math.PI / 2, "#101216");
    this.cars.push(this.unit);
    this.player.x = st.x;
    this.player.z = st.z;
    for (let k = 0; k < this.trafficN; k++) this.spawnTraffic(true);
    for (let k = 0; k < this.pedN; k++) this.spawnWalker(true);
    for (let k = 0; k < 10; k++) this.spawnParked(true);
    this.radio("Dispatch: Unit 1-Adam-12, you're 10-8 and in service. Have a safe shift.");
  }

  // ------------------------------------------------------------------ helpers

  private id(p: string) {
    return `${p}${++this.seq}`;
  }
  car(id: string | null | undefined) {
    return id ? this.cars.find((c) => c.id === id) : undefined;
  }
  ped(id: string | null | undefined) {
    return id ? this.peds.find((p) => p.id === id) : undefined;
  }
  /** Clock time as minutes since midnight. */
  clock() {
    return (this.startHour * 60 + (Math.min(this.time, this.shiftSeconds) / this.shiftSeconds) * 8 * 60) % (24 * 60);
  }
  clockText() {
    const m = Math.floor(this.clock());
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }
  radio(text: string) {
    if (text.startsWith("You:")) this.radioUntil = this.time + 2.2;
    this.log.push({ t: this.time, text, kind: "radio" });
    this.events.push({ type: "radio" });
    this.trimLog();
  }
  info(text: string, kind: LogLine["kind"] = "info") {
    this.log.push({ t: this.time, text, kind });
    this.trimLog();
  }
  private trimLog() {
    if (this.log.length > 60) this.log.splice(0, this.log.length - 60);
  }
  private say(p: Ped, text: string) {
    this.speech = { who: fullName(p.person), text, at: this.time };
    this.info(`${p.person.first}: "${text}"`, "speech");
  }
  award(points: number, text: string) {
    this.stats.score += points;
    if (points < 0) this.stats.penalties += -points;
    this.stats.report.push({ text, points });
    this.events.push({ type: "score", points, text });
    this.info(`${points > 0 ? "+" : ""}${points}  ${text}`, points >= 0 ? "good" : "bad");
  }
  /** The officer is mid-conversation (render: talking gestures). */
  get talking() {
    return !this.player.inCar && !!this.speech && this.time - this.speech.at < 2.5 && !!this.focus();
  }
  get officer() {
    return this.player.inCar ? { x: this.unit.x, z: this.unit.z } : { x: this.player.x, z: this.player.z };
  }
  distToOfficer(x: number, z: number) {
    const o = this.officer;
    return Math.hypot(x - o.x, z - o.z);
  }
  activeCall() {
    return this.calls.find((c) => c.state === "enroute" || c.state === "onscene") ?? null;
  }
  offeredCall() {
    return this.calls.find((c) => c.state === "offered") ?? null;
  }

  private newPed(person: Person, role: Role, x: number, z: number, state: PedState): Ped {
    const p: Ped = {
      id: this.id("ped"),
      person,
      role,
      x,
      z,
      h: this.rng.range(-Math.PI, Math.PI),
      speed: 0,
      state,
      hp: 100,
      downUntil: 0,
      attackAt: 0,
      drawn: false,
      shirt: role === "officer" ? "#1f2b44" : role === "suspect" ? this.rng.pick(["#1f1f22", "#2f2f35", "#3b2f2f", "#253040"]) : this.rng.pick(SHIRTS),
      pants: role === "officer" ? "#1a2233" : this.rng.pick(PANTS),
      skin: this.rng.pick(SKINS),
      step: 0,
      lostT: 0,
    };
    this.peds.push(p);
    return p;
  }

  // ------------------------------------------------------------ population

  private randomLane(minD: number, maxD: number) {
    const o = this.officer;
    for (let k = 0; k < 40; k++) {
      const a = this.rng.int(0, LINES * LINES - 1);
      const ns = neighbours(a);
      const b = this.rng.pick(ns);
      const t = this.rng.next();
      const seg = laneStart(a, b);
      const x = seg.ax + seg.dx * seg.len * t;
      const z = seg.az + seg.dz * seg.len * t;
      const d = Math.hypot(x - o.x, z - o.z);
      if (d >= minD && d <= maxD) return { a, b, t };
    }
    return null;
  }

  spawnTraffic(initial = false, o: { kind?: CarKind; person?: PersonOpts; stolen?: boolean; near?: { minD: number; maxD: number } } = {}) {
    const spot = this.randomLane(o.near?.minD ?? (initial ? 25 : 130), o.near?.maxD ?? (initial ? 330 : 260));
    if (!spot) return null;
    const kind = o.kind ?? this.rng.pick(CIVILIAN_KINDS);
    const car = makeCar(this.id("car"), kind, 0, 0, 0, this.rng.pick(CAR_COLORS));
    spawnOnLane(car, spot.a, spot.b, spot.t);
    const next = chooseNext(this.aiWorld(), { ...car, ai: makeAi(spot.a, spot.b, spot.b) }, spot.a, spot.b);
    car.ai = makeAi(spot.a, spot.b, next, SPEED_LIMIT * this.rng.range(0.72, 0.95));
    const person = makePerson(this.rng, o.person);
    const r = this.rng.next();
    if (r < 0.08) car.ai.cruise = this.rng.range(21, 27); // speeder
    if (person.bac >= 0.08) {
      car.ai.drunk = true;
      car.ai.reckless = this.rng.next() < 0.4;
    }
    car.brokenLight = this.rng.next() < 0.07;
    car.reg = makeRegistration(this.rng, person, { stolen: o.stolen, shady: o.person?.shady });
    const d = this.newPed(person, "driver", car.x, car.z, "driving");
    d.carId = car.id;
    car.driver = d.id;
    car.vx = Math.cos(car.h) * car.ai.cruise * 0.8;
    car.vz = Math.sin(car.h) * car.ai.cruise * 0.8;
    this.cars.push(car);
    return car;
  }

  private ringPoint(block: number, t: number) {
    const b = this.city.blocks[block];
    const x0 = b.x0 - 1.5;
    const z0 = b.z0 - 1.5;
    const w = b.x1 - b.x0 + 3;
    const d = b.z1 - b.z0 + 3;
    const per = 2 * (w + d);
    let u = ((t % per) + per) % per;
    if (u < w) return { x: x0 + u, z: z0, h: 0 };
    u -= w;
    if (u < d) return { x: x0 + w, z: z0 + u, h: Math.PI / 2 };
    u -= d;
    if (u < w) return { x: x0 + w - u, z: z0 + d, h: Math.PI };
    u -= w;
    return { x: x0, z: z0 + d - u, h: -Math.PI / 2 };
  }

  private spawnWalker(initial = false) {
    const o = this.officer;
    for (let k = 0; k < 20; k++) {
      const block = this.rng.int(0, this.city.blocks.length - 1);
      const t = this.rng.range(0, 400);
      const pt = this.ringPoint(block, t);
      const d = Math.hypot(pt.x - o.x, pt.z - o.z);
      if (d < (initial ? 10 : 70) || d > (initial ? 170 : 160)) continue;
      const p = this.newPed(makePerson(this.rng), "civilian", pt.x, pt.z, "walk");
      p.walk = { block, t, dir: this.rng.next() < 0.5 ? 1 : -1 };
      return p;
    }
    return null;
  }

  private aiWorld(): AiWorld {
    return {
      city: this.city,
      time: this.time,
      cars: this.cars,
      walkers: [
        ...this.peds.filter((p) => p.state !== "driving" && p.state !== "incar" && p.state !== "gone" && onRoad(p.x, p.z)),
        ...this.deploy.flatMap((d) => d.points ?? []),
        ...(this.player.inCar || !onRoad(this.player.x, this.player.z) ? [] : [this.player]),
      ],
      threat: this.officer,
      rand: () => this.rng.next(),
      stops: this.deploy.flatMap((d) =>
        d.kind === "checkpoint"
          ? [{ id: d.id, x: d.x, z: d.z, dx: d.dx, dz: d.dz }]
          : d.kind === "roadblock"
            ? [
                { id: d.id, x: d.x - d.dx * 7, z: d.z - d.dz * 7, dx: d.dx, dz: d.dz },
                { id: d.id, x: d.x + d.dx * 7, z: d.z + d.dz * 7, dx: -d.dx, dz: -d.dz },
              ]
            : [],
      ).concat(this.trafficStops()),
      avoid: this.deploy.filter((d) => d.kind === "roadblock"),
    };
  }

  // ------------------------------------------------------------------ step

  step(dt: number, input: Code3Input = NO_INPUT) {
    if (this.over) return;
    this.time += dt;
    this.handleCallInput(input);
    this.handleOfficer(dt, input);
    this.stepTraffic(dt);
    this.stepPeds(dt);
    this.stepStops(dt);
    this.stepCalls(dt);
    if (input.choose !== null) {
      const opt = this.options()[input.choose];
      if (opt) this.choose(opt.id);
    }
    if (input.chooseId) this.choose(input.chooseId);
    if (input.backup) this.callBackup();
    this.population();
    if (this.time >= this.shiftSeconds) this.end("End of shift");
    if (this.player.hp <= 0) this.end("Officer down");
  }

  end(reason: string) {
    if (this.over) return;
    if (reason === "End of shift") for (const r of this.reports) if (!r.filed) this.award(-10, `Unfiled paperwork: ${r.title}`);
    this.over = { reason };
    this.radio(
      reason === "End of shift"
        ? "Dispatch: 1-Adam-12, end of watch. Return to station. Good work out there."
        : reason === "Officer down"
          ? "Dispatch: OFFICER DOWN! All units respond!"
          : "Dispatch: 1-Adam-12, report to the watch commander. You're relieved of duty.",
    );
  }

  // --------------------------------------------------------------- officer

  private handleOfficer(dt: number, input: Code3Input) {
    const pl = this.player;
    const u = this.unit;
    if (input.weapon) pl.weapon = input.weapon;
    if (input.sirenTone) {
      this.sirenTone = this.sirenTone === "wail" ? "yelp" : this.sirenTone === "yelp" ? "phaser" : "wail";
      this.info(`Siren tone: ${this.sirenTone}.`, "info");
    }
    if (input.flashlight) this.flashlight = !this.flashlight;
    if (input.air) this.callAir();
    const presses = typeof input.lights === "number" ? input.lights : input.lights ? 1 : 0;
    for (let i = 0; i < presses; i++) {
      // off → lights → lights + siren → off
      const s = u.lights ? (u.siren ? 0 : 2) : 1;
      u.lights = s > 0;
      u.siren = s === 2;
    }

    if (pl.inCar) {
      stepCar(u, { throttle: input.throttle, brake: 0, steer: input.steer, handbrake: input.handbrake }, dt, this.surface);
      pl.x = u.x;
      pl.z = u.z;
      pl.h = u.h;
      if (input.enter && Math.abs(speedOf(u)) < 3) this.exitUnit();
    } else {
      stepCar(u, { throttle: 0, brake: 1, steer: 0, handbrake: true }, dt);
      const f = forward(input.yaw);
      const r = right(input.yaw);
      let mx = f.x * input.moveZ + r.x * input.moveX;
      let mz = f.z * input.moveZ + r.z * input.moveX;
      const m = Math.hypot(mx, mz);
      pl.moving = m > 0.05;
      pl.sprinting = pl.moving && input.sprint && pl.stamina > 0.05;
      const sp = pl.sprinting ? OFFICER_SPRINT : OFFICER_WALK;
      pl.stamina = Math.max(0, Math.min(1, pl.stamina + (pl.sprinting ? -dt / 9 : dt / 6)));
      if (m > 1) {
        mx /= m;
        mz /= m;
      }
      pl.x += mx * sp * dt;
      pl.z += mz * sp * dt;
      pl.h = input.yaw;
      this.pushOut(pl, 0.35);
      // Walk into the unit? push out of it.
      for (const c of this.cars) this.pushOutOfCar(pl, c);
      if (input.enter) this.tryEnter();
      if (input.spikes) this.toggleSpikes();
      if (input.checkpoint) this.choose(this.deploy.some((d) => d.kind === "checkpoint") ? "cp-remove" : "cp-deploy");
      if (input.roadblock) this.choose(this.deploy.some((d) => d.kind === "roadblock") ? "rb-remove" : "rb-deploy");
      if (input.cones) this.choose(this.deploy.some((d) => d.kind === "cones") ? "cones-remove" : "cones-deploy");
      if (input.fire) this.fire();
      if (input.aim) this.bystandersSeeGun();
      if (input.shout) this.shout();
      // Tackle: sprint into a fleeing suspect.
      if (pl.sprinting)
        for (const p of this.peds)
          if (p.state === "flee" && Math.hypot(p.x - pl.x, p.z - pl.z) < 1.2) {
            p.state = "down";
            p.downUntil = this.time + 4;
            this.info(`You tackled ${fullName(p.person)}!`, "good");
            this.addOffence(p, "resisting arrest");
          }
      if (pl.escort) {
        const p = this.ped(pl.escort);
        if (p && p.state === "escort") {
          const b = forward(pl.h);
          const tx = pl.x - b.x * 1.1 + right(pl.h).x * 0.5;
          const tz = pl.z - b.z * 1.1 + right(pl.h).z * 0.5;
          p.x += (tx - p.x) * Math.min(1, dt * 6);
          p.z += (tz - p.z) * Math.min(1, dt * 6);
          p.h = pl.h;
          p.step += Math.hypot(tx - p.x, tz - p.z) * dt * 3;
        } else pl.escort = null;
      }
    }
    pl.hp = Math.min(100, pl.hp + (this.time - pl.hurtAt > 8 ? dt * 2 : 0));

    // Radar: the car ahead of the unit.
    this.radar = null;
    if (pl.inCar) {
      const f = forward(u.h);
      let best = Infinity;
      for (const c of this.cars) {
        if (c === u || c.spec.police) continue;
        const dx = c.x - u.x;
        const dz = c.z - u.z;
        const ahead = dx * f.x + dz * f.z;
        if (ahead < 4 || ahead > 75) continue;
        if (Math.abs(dx * -f.z + dz * f.x) > 3 + ahead * 0.06) continue;
        if (ahead < best) {
          best = ahead;
          this.radar = { id: c.id, speed: Math.abs(speedOf(c)) };
        }
      }
      if (this.radar && this.radar.speed > SPEED_LIMIT + 2.3) this.car(this.radar.id)?.seen.add("speeding");
      if (this.time >= this.alprAt) {
        this.alprAt = this.time + 0.5;
        this.scanPlates();
      }
    }
  }

  private exitUnit() {
    const u = this.unit;
    const r = right(u.h);
    this.player.inCar = false;
    this.player.x = u.x - r.x * 1.6;
    this.player.z = u.z - r.z * 1.6;
    this.player.h = u.h;
  }

  private tryEnter() {
    const u = this.unit;
    if (Math.hypot(u.x - this.player.x, u.z - this.player.z) > 3.4) return;
    if (this.player.escort) {
      this.info("Put the prisoner in the back first (use the action menu).", "info");
      return;
    }
    this.player.inCar = true;
  }

  private pushOut(e: { x: number; z: number }, r: number) {
    for (const b of buildingsNear(this.city, e.x, e.z)) {
      const px = Math.max(b.x - b.hw, Math.min(e.x, b.x + b.hw));
      const pz = Math.max(b.z - b.hd, Math.min(e.z, b.z + b.hd));
      const dx = e.x - px;
      const dz = e.z - pz;
      const d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 1e-4) {
        // Inside: shove out the nearest face.
        const ox = b.hw - Math.abs(e.x - b.x);
        const oz = b.hd - Math.abs(e.z - b.z);
        if (ox < oz) e.x = b.x + Math.sign(e.x - b.x || 1) * (b.hw + r);
        else e.z = b.z + Math.sign(e.z - b.z || 1) * (b.hd + r);
        continue;
      }
      e.x += (dx / d) * (r - d);
      e.z += (dz / d) * (r - d);
    }
    e.x = Math.max(1, Math.min(SIZE - 1, e.x));
    e.z = Math.max(1, Math.min(SIZE - 1, e.z));
  }

  private pushOutOfCar(e: { x: number; z: number }, c: Car) {
    if (Math.abs(e.x - c.x) > 4 || Math.abs(e.z - c.z) > 4) return;
    for (const k of carCircles(c)) {
      const dx = e.x - k.x;
      const dz = e.z - k.z;
      const d = Math.hypot(dx, dz);
      const min = k.r + 0.35;
      if (d < min && d > 1e-4) {
        e.x += (dx / d) * (min - d);
        e.z += (dz / d) * (min - d);
      }
    }
  }

  /** The ped the officer is facing within `range` (closest to the aim line). */
  private aimed(range: number, width: number, filter: (p: Ped) => boolean) {
    const pl = this.player;
    const f = forward(pl.h);
    let best: Ped | null = null;
    let bestD = Infinity;
    for (const p of this.peds) {
      if (!filter(p)) continue;
      const dx = p.x - pl.x;
      const dz = p.z - pl.z;
      const along = dx * f.x + dz * f.z;
      if (along < 0.3 || along > range) continue;
      const lat = Math.abs(dx * -f.z + dz * f.x);
      if (lat > width + along * 0.02) continue;
      if (along < bestD && lineOfSight(this.city, pl.x, pl.z, p.x, p.z)) {
        bestD = along;
        best = p;
      }
    }
    return best;
  }

  private fire() {
    const pl = this.player;
    const f = forward(pl.h);
    const alive = (p: Ped) => p.state !== "dead" && p.state !== "gone" && p.state !== "driving" && p.state !== "incar";
    if (pl.weapon === "taser") {
      if (this.time < pl.taserAt) return;
      pl.taserAt = this.time + 2.5;
      const t = this.aimed(TASER_RANGE, 0.7, (p) => alive(p) && p.state !== "cuffed" && p.state !== "escort");
      this.events.push({
        type: "taser",
        x: pl.x,
        z: pl.z,
        tx: t ? t.x : pl.x + f.x * TASER_RANGE,
        tz: t ? t.z : pl.z + f.z * TASER_RANGE,
        hit: !!t,
      });
      if (!t) return;
      const threat = t.state === "attack" || t.state === "flee";
      const compliant = !threat && t.role !== "suspect" && t.state !== "down" && t.state !== "cuffed";
      t.state = "down";
      t.downUntil = this.time + 6;
      t.tasedUntil = this.time + 2.6;
      t.drawn = false;
      this.info(`Taser hit: ${fullName(t.person)} is down.`, "good");
      this.fileable("force", `Use of force: Taser, ${fullName(t.person)}`, [`Taser deployed at ${describe(t.x, t.z)}`, threat ? "Subject was fleeing / combative" : "Subject was not resisting"]);
      if (threat) this.addOffence(t, "resisting arrest");
      else if (compliant) this.award(-100, "Excessive force: tased a compliant civilian");
      return;
    }
    if (this.time < pl.gunAt) return;
    pl.gunAt = this.time + 0.35;
    const t = this.aimed(GUN_RANGE, 0.45, alive);
    this.events.push({
      type: "shot",
      x: pl.x,
      z: pl.z,
      tx: t ? t.x : pl.x + f.x * GUN_RANGE,
      tz: t ? t.z : pl.z + f.z * GUN_RANGE,
      by: "player",
      hit: !!t,
    });
    this.panicAround(pl.x, pl.z);
    if (!t) return;
    const justified = t.state === "attack" && t.person.armed;
    t.hp -= 45;
    this.fileable("force", `Officer-involved shooting: ${fullName(t.person)}`, [`Shots fired at ${describe(t.x, t.z)}`, justified ? "Subject was armed and attacking" : "Subject was NOT an armed threat"]);
    if (t.hp <= 0) {
      t.state = "dead";
      t.drawn = false;
      if (justified) this.info(`${fullName(t.person)} was neutralized. Shooting ruled justified.`, "info");
    }
    if (!justified) {
      if (t.state === "attack") this.award(-300, "Excessive force: deadly force on an unarmed attacker");
      else {
        this.award(-1000, "Unjustified shooting");
        this.end("Suspended");
      }
    }
  }

  private shout() {
    this.info('You: "POLICE! STOP! SHOW ME YOUR HANDS!"', "speech");
    for (const p of this.peds) {
      if (Math.hypot(p.x - this.player.x, p.z - this.player.z) > 18) continue;
      if (p.state === "flee" && this.rng.next() < 0.3) {
        p.state = "handsup";
        this.say(p, "Okay, okay! Don't shoot!");
      } else if (p.state === "attack" && !p.person.armed && this.rng.next() < 0.4) {
        p.state = "handsup";
        this.say(p, "Alright! I give up!");
      } else if (p.state === "attack" && p.person.armed && this.rng.next() < 0.15) {
        p.state = "handsup";
        p.drawn = false;
        this.say(p, "I'm putting it down! I'm putting it down!");
      }
    }
  }

  private toggleSpikes() {
    const pl = this.player;
    if (this.spikes && Math.hypot(this.spikes.x - pl.x, this.spikes.z - pl.z) < 6) {
      this.spikes = null;
      this.info("Spike strip picked up.", "info");
      return;
    }
    const f = forward(pl.h);
    this.spikes = { x: pl.x + f.x * 2.5, z: pl.z + f.z * 2.5, h: pl.h + Math.PI / 2, until: this.time + 90 };
    this.info("Spike strip deployed. Stay clear of it.", "info");
  }

  /** Did this car just drive over the spike strip? */
  private checkSpikes(c: Car) {
    const st = this.spikes;
    if (!st || c.spiked || Math.abs(speedOf(c)) < 2) return;
    if (Math.abs(c.x - st.x) > 6 || Math.abs(c.z - st.z) > 6) return;
    // Distance from the car to the 6 m strip segment.
    const dx = Math.cos(st.h);
    const dz = Math.sin(st.h);
    const t = Math.max(-3, Math.min(3, (c.x - st.x) * dx + (c.z - st.z) * dz));
    const d = Math.hypot(c.x - (st.x + dx * t), c.z - (st.z + dz * t));
    if (d > 1.3) return;
    c.spiked = true;
    c.health = Math.max(0, c.health - 15);
    this.events.push({ type: "crash", x: c.x, z: c.z, speed: 6, player: c === this.unit });
    if (c.ai?.mode === "flee") {
      this.award(60, "Spike strip: suspect's tyres blown");
      this.radio(`You: "Spikes deployed, got him! Tyres are shredded."`);
    } else if (c === this.unit) this.info("You drove over your own spike strip!", "bad");
  }

  // ------------------------------------------------------------ patrol tools

  /** Automatic plate reader: flags stolen, expired and wanted-owner plates near the unit. */
  private scanPlates() {
    const u = this.unit;
    for (const c of this.cars) {
      if (c === u || c.spec.police || !c.reg || this.scanned.has(c.id)) continue;
      if (Math.hypot(c.x - u.x, c.z - u.z) > 28) continue;
      this.scanned.add(c.id);
      const r = c.reg;
      const d = this.ped(c.driver);
      const ownerWanted = !!d && r.owner === fullName(d.person) && d.person.warrants.length > 0;
      const why = r.status === "stolen" ? "STOLEN" : ownerWanted ? "REGISTERED OWNER WANTED" : r.status === "expired" ? "EXPIRED REGISTRATION" : r.status === "uninsured" ? "NO INSURANCE" : "";
      if (!why) continue;
      this.flagged.add(c.id);
      this.radio(`ALPR: "${r.plate}, ${r.make}: ${why}."`);
    }
  }

  canCallAir() {
    return this.time >= this.airReadyAt && !this.air && (this.anyPursuit() || this.peds.some((p) => p.state === "flee"));
  }

  private callAir() {
    if (!this.canCallAir()) {
      this.info(this.air ? "Air-1 is already overhead." : "Air-1 only flies for pursuits.", "info");
      return;
    }
    const target = this.cars.find((c) => c.ai?.mode === "flee")?.id ?? this.peds.find((p) => p.state === "flee")!.id;
    const st = this.city.station;
    this.air = { x: st.x, z: st.z, target, until: this.time + 120 };
    this.airReadyAt = this.time + 180;
    this.radio(`You: "Requesting air support." Air-1: "Air-1 en route, we'll have the eye in a moment."`);
  }

  private stepAir(dt: number) {
    const a = this.air;
    if (!a) return;
    const c = this.car(a.target);
    const p = this.ped(a.target);
    const tracking = (c && c.ai?.mode === "flee") || (p && p.state === "flee");
    const tx = c?.x ?? p?.x ?? this.officer.x;
    const tz = c?.z ?? p?.z ?? this.officer.z;
    const d = Math.hypot(tx - a.x, tz - a.z);
    const sp = Math.min(40 * dt, d);
    if (d > 0.01) {
      a.x += ((tx - a.x) / d) * sp;
      a.z += ((tz - a.z) / d) * sp;
    }
    if (!tracking || this.time > a.until) {
      if (tracking) this.radio(`Air-1: "Low on fuel, breaking off."`);
      else this.radio(`Air-1: "Suspect's stopped. Air-1 clearing."`);
      this.air = null;
    }
  }

  /** Nearest spot on a road to the officer, away from intersections (for checkpoints etc). */
  roadSpot() {
    const pl = this.player;
    const nearest = (v: number) => this.city.lines.reduce((b, L) => (Math.abs(L - v) < Math.abs(b - v) ? L : b), this.city.lines[0]);
    const Lx = nearest(pl.x);
    const Lz = nearest(pl.z);
    const onNS = Math.abs(pl.x - Lx) < Math.abs(pl.z - Lz);
    if (Math.min(Math.abs(pl.x - Lx), Math.abs(pl.z - Lz)) > 9) return null;
    const margin = HALF_STREET + 14;
    const along = onNS ? pl.z : pl.x;
    const cross = nearest(along);
    const a = Math.abs(along - cross) < margin ? cross + Math.sign(along - cross || 1) * margin : along;
    if (a < margin || a > SIZE - margin) return null;
    // The lane on the officer's side of the road, and which way its traffic goes.
    if (onNS) {
      const south = pl.x < Lx;
      return { x: south ? Lx - 2 : Lx + 2, z: a, dx: 0, dz: south ? 1 : -1, cx: Lx, cz: a, ns: true };
    }
    const east = pl.z > Lz;
    return { x: a, z: east ? Lz + 2 : Lz - 2, dx: east ? 1 : -1, dz: 0, cx: a, cz: Lz, ns: false };
  }

  /** The car waiting at the front of your checkpoint queue. */
  checkpointCar() {
    const cp = this.deploy.find((d) => d.kind === "checkpoint");
    if (!cp) return null;
    for (const c of this.cars) {
      if (!c.ai || c.ai.mode !== "cruise" || c.ai.waved === cp.id || c.spec.police) continue;
      if (Math.abs(speedOf(c)) > 0.6) continue;
      const f = forward(c.h);
      if (f.x * cp.dx + f.z * cp.dz < 0.7) continue;
      const ahead = (cp.x - c.x) * f.x + (cp.z - c.z) * f.z;
      if (ahead > -1 && ahead < c.spec.len / 2 + 3 && Math.abs((cp.x - c.x) * -f.z + (cp.z - c.z) * f.x) < 3) return c;
    }
    return null;
  }

  /** Road tools and unit actions (not tied to a person). Returns true if handled. */
  private chooseTool(id: string) {
    const u = this.unit;
    switch (id) {
      case "cp-deploy":
      case "rb-deploy":
      case "cones-deploy": {
        const spot = this.roadSpot();
        if (!spot) {
          this.info("Stand at the side of a road, away from the intersection.", "info");
          return true;
        }
        const kind = id === "cp-deploy" ? "checkpoint" : id === "rb-deploy" ? "roadblock" : "cones";
        this.deploy = this.deploy.filter((d) => d.kind !== kind);
        if (kind === "checkpoint") {
          this.deploy.push({ id: this.id("cp"), kind, x: spot.x, z: spot.z, dx: spot.dx, dz: spot.dz });
          this.radio(`You: "Dispatch, 1-Adam-12 setting up a sobriety checkpoint, ${describe(spot.x, spot.z)}."`);
        } else if (kind === "roadblock") {
          const along = spot.ns ? { dx: 0, dz: 1 } : { dx: 1, dz: 0 };
          this.deploy.push({ id: this.id("rb"), kind, x: spot.cx, z: spot.cz, dx: along.dx, dz: along.dz, hw: spot.ns ? HALF_ROAD + 0.4 : 0.5, hd: spot.ns ? 0.5 : HALF_ROAD + 0.4 });
          this.radio(`You: "Roadblock in place, ${describe(spot.cx, spot.cz)}!"`);
        } else {
          const f = forward(this.player.h);
          const points = Array.from({ length: 6 }, (_, i) => ({ x: this.player.x + f.x * (1.5 + i * 1.3), z: this.player.z + f.z * (1.5 + i * 1.3) }));
          this.deploy.push({ id: this.id("cn"), kind, x: points[0].x, z: points[0].z, dx: f.x, dz: f.z, points });
          this.info("Cones out: traffic will steer around them.", "info");
        }
        return true;
      }
      case "cp-remove":
      case "rb-remove":
      case "cones-remove": {
        const kind = id === "cp-remove" ? "checkpoint" : id === "rb-remove" ? "roadblock" : "cones";
        for (const d of this.deploy) if (d.kind === kind) for (const c of this.cars) if (c.ai?.waved === d.id) c.ai.waved = undefined;
        this.deploy = this.deploy.filter((d) => d.kind !== kind);
        this.info(kind === "checkpoint" ? "Checkpoint taken down." : kind === "roadblock" ? "Roadblock cleared." : "Cones picked up.", "info");
        return true;
      }
      case "cp-wave":
      case "cp-screen": {
        const c = this.checkpointCar();
        const cp = this.deploy.find((d) => d.kind === "checkpoint");
        if (!c || !cp || !c.ai) return true;
        c.ai.waved = cp.id;
        this.stats.screened++;
        this.award(5, "Driver screened at the checkpoint");
        const d = this.ped(c.driver);
        if (id === "cp-wave" || !d) return true;
        c.ai.mode = "stopped";
        this.stopCar = c.id;
        const k = this.newContact(d, c, "Sobriety checkpoint");
        k.checkpoint = cp.id;
        k.runs = this.rng.next() < d.person.flee * 0.35;
        this.stats.stops++;
        if (d.person.bac >= 0.05 && this.rng.next() < 0.7) {
          k.pc.add("alcohol");
          this.info("You smell alcohol through the open window.", "info");
        }
        this.say(d, d.person.bac >= 0.08 ? "*fumbling* Just... heading home, officer." : "Evening. Just going home.");
        return true;
      }
      case "air":
        this.callAir();
        return true;
      case "repair":
        u.health = 100;
        u.spiked = false;
        this.player.hp = 100;
        this.info("Unit repaired, tyres changed, first-aid kit restocked.", "good");
        return true;
    }
    return false;
  }

  /** Things you run into on patrol without a call: fights, drunks, jaywalkers. */
  private stepIncidents() {
    if (this.time < this.nextIncidentAt || this.activeCall()) return;
    this.nextIncidentAt = this.time + this.rng.range(60, 110);
    const o = this.officer;
    for (let k = 0; k < 20; k++) {
      const block = this.rng.int(0, this.city.blocks.length - 1);
      const pt = this.ringPoint(block, this.rng.range(0, 400));
      const d = Math.hypot(pt.x - o.x, pt.z - o.z);
      if (d < 45 || d > 110) continue;
      const kind = this.rng.pick(["fight", "drunk", "jaywalk"] as const);
      if (kind === "fight") {
        const a = this.newPed(makePerson(this.rng, { shady: 0.5 }), "suspect", pt.x - 0.5, pt.z, "fight");
        const b = this.newPed(makePerson(this.rng, { shady: 0.5 }), "suspect", pt.x + 0.5, pt.z, "fight");
        a.foe = b.id;
        b.foe = a.id;
        this.info(`You see two people fighting near ${describe(pt.x, pt.z)}.`, "info");
      } else if (kind === "drunk") {
        const p = this.newPed(makePerson(this.rng, { shady: 0.3, drunk: true }), "suspect", pt.x, pt.z, "walk");
        p.person.bac = Math.max(p.person.bac, 0.15);
        p.walk = { block, t: 0, dir: 1 };
        this.info(`Someone is stumbling along the sidewalk near ${describe(pt.x, pt.z)}.`, "info");
      } else {
        const p = this.newPed(makePerson(this.rng, { shady: 0.2 }), "civilian", pt.x, pt.z, "cross");
        // Straight across the nearest street.
        const b = this.city.blocks[block];
        const toN = Math.abs(pt.z - b.z0);
        const toS = Math.abs(pt.z - b.z1);
        const toW = Math.abs(pt.x - b.x0);
        const toE = Math.abs(pt.x - b.x1);
        const m = Math.min(toN, toS, toW, toE);
        p.cross =
          m === toN ? { x: pt.x, z: pt.z - 17 } : m === toS ? { x: pt.x, z: pt.z + 17 } : m === toW ? { x: pt.x - 17, z: pt.z } : { x: pt.x + 17, z: pt.z };
      }
      return;
    }
  }

  /** Report-card grade for the shift. */
  grade() {
    const s = this.stats;
    const work = s.calls * 3 + s.arrests * 2 + s.citations + s.stops + s.screened * 0.3 + s.booked;
    const pts = s.score - s.penalties * 0.5;
    if (s.penalties >= 1000) return "F";
    if (pts > 2500 && work > 25) return "A+";
    if (pts > 1500 && work > 15) return "A";
    if (pts > 900) return "B";
    if (pts > 400) return "C";
    if (pts > 0) return "D";
    return "F";
  }

  // --------------------------------------------------------------- traffic

  private stepTraffic(dt: number) {
    const w = this.aiWorld();
    for (const c of this.cars) {
      if (c === this.unit || !c.ai) continue;
      const vf = speedOf(c);
      const prevS = c.ai ? this.segProgress(c) : 0;
      const ctl = drive(w, c, dt);
      stepCar(c, ctl, dt, this.surface);
      this.checkSpikes(c);
      // Saw it run a red light?
      if (c.ai.reckless && c.ai.mode === "cruise") {
        const seg = laneStart(c.ai.from, c.ai.to);
        const stopLine = seg.len - HALF_STREET - 2;
        const s = this.segProgress(c);
        const axis = Math.abs(seg.dz) > 0.5 ? "ns" : "ew";
        if (prevS < stopLine && s >= stopLine && lightFor(c.ai.to, axis, this.time) === "red" && this.distToOfficer(c.x, c.z) < 55)
          c.seen.add("red light");
      }
      if (c.ai.drunk && vf > 5 && this.distToOfficer(c.x, c.z) < 45) c.seen.add("reckless driving");
      // The driver ped rides along.
      const d = this.ped(c.driver);
      if (d && d.state === "driving") {
        d.x = c.x;
        d.z = c.z;
        d.h = c.h;
      }
    }
    // Collisions.
    for (const c of this.cars) {
      const hit = collideWorld(this.city, c);
      if (hit > 2) this.impact(c, hit, null);
    }
    for (let a = 0; a < this.cars.length; a++)
      for (let b = a + 1; b < this.cars.length; b++) {
        const hit = collideCars(this.cars[a], this.cars[b]);
        if (hit > 2) {
          this.impact(this.cars[a], hit, this.cars[b]);
          this.impact(this.cars[b], hit, this.cars[a]);
        }
      }
    // Roadblocks are solid.
    for (const d of this.deploy) {
      if (d.kind !== "roadblock") continue;
      for (const c of this.cars) {
        if (Math.abs(c.x - d.x) > 9 || Math.abs(c.z - d.z) > 9) continue;
        for (const k of carCircles(c)) {
          const px = Math.max(d.x - d.hw!, Math.min(k.x, d.x + d.hw!));
          const pz = Math.max(d.z - d.hd!, Math.min(k.z, d.z + d.hd!));
          const dx = k.x - px;
          const dz = k.z - pz;
          const dd = Math.hypot(dx, dz);
          if (dd >= k.r || dd < 1e-4) continue;
          const nx = dx / dd;
          const nz = dz / dd;
          c.x += nx * (k.r - dd);
          c.z += nz * (k.r - dd);
          const vn = c.vx * nx + c.vz * nz;
          if (vn < 0) {
            c.vx -= nx * vn * 1.3;
            c.vz -= nz * vn * 1.3;
            if (-vn > 2) this.impact(c, -vn * 1.6, null);
          }
        }
      }
    }
    // Sirens clear the road.
    const u = this.unit;
    if (u.siren && this.player.inCar && Math.abs(speedOf(u)) > 3)
      for (const c of this.cars) {
        if (!c.ai || c.ai.mode !== "cruise" || c.spec.police) continue;
        const f = forward(c.h);
        const behind = (u.x - c.x) * f.x + (u.z - c.z) * f.z;
        if (behind < -3 && behind > -32 && Math.abs((u.x - c.x) * -f.z + (u.z - c.z) * f.x) < 6) {
          c.ai.mode = "yield";
          c.ai.yieldT = 0;
        }
      }
    for (const c of this.cars) {
      if (!c.ai || c.ai.mode !== "yield") continue;
      const f = forward(c.h);
      const ahead = (u.x - c.x) * f.x + (u.z - c.z) * f.z;
      if ((ahead > 4 || Math.hypot(u.x - c.x, u.z - c.z) > 45 || !u.siren) && c.ai.yieldT > 2.5) c.ai.mode = "cruise";
    }
  }

  private segProgress(c: Car) {
    const seg = laneStart(c.ai!.from, c.ai!.to);
    return (c.x - seg.ax) * seg.dx + (c.z - seg.az) * seg.dz;
  }

  private impact(c: Car, speed: number, other: Car | null) {
    const dmg = damageFor(speed) * (c.spec.police ? 0.6 : 1);
    c.health = Math.max(0, c.health - dmg);
    if (this.time - c.lastImpact < 0.4) return;
    c.lastImpact = this.time;
    const player = c === this.unit;
    if (speed > 4) this.events.push({ type: "crash", x: c.x, z: c.z, speed, player });
    // Hitting uninvolved civilians is on you (not while in a pursuit of that car).
    if (player && other && other.ai && speed > 7 && other.ai.mode !== "flee" && !other.spec.police && !this.anyPursuit())
      this.award(-25, "Collision with a civilian vehicle");
  }

  anyPursuit() {
    return this.cars.some((c) => c.ai?.mode === "flee");
  }

  // ---------------------------------------------------------------- peds

  private stepPeds(dt: number) {
    const pl = this.player;
    const o = this.officer;
    for (const p of this.peds) {
      if (p.state === "gone" || p.state === "driving" || p.state === "incar" || p.state === "dead") continue;
      const prevX = p.x;
      const prevZ = p.z;
      switch (p.state) {
        case "walk": {
          const wk = p.walk!;
          wk.t += wk.dir * WALK * dt;
          const pt = this.ringPoint(wk.block, wk.t);
          p.x = pt.x;
          p.z = pt.z;
          p.h = wk.dir > 0 ? pt.h : pt.h + Math.PI;
          // Passers-by greet an officer on foot.
          if (!pl.inCar && !p.greeted && p.role === "civilian" && Math.hypot(p.x - pl.x, p.z - pl.z) < 2.4) {
            p.greeted = true;
            if (this.rng.next() < 0.45 && (!this.speech || this.time - this.speech.at > 4)) {
              const h = this.clock() / 60;
              this.say(p, this.rng.pick(h < 12 && h >= 5 ? ["Morning, officer.", "Good morning!", "Morning."] : ["Evening, officer.", "Stay safe out there.", "Hey, officer.", "Night, officer."]));
            }
          }
          break;
        }
        case "flee": {
          const dx = p.x - o.x;
          const dz = p.z - o.z;
          const d = Math.hypot(dx, dz) || 1;
          // Run away, veering along streets.
          let ax = dx / d;
          let az = dz / d;
          if (Math.abs(ax) > Math.abs(az)) az *= 0.3;
          else ax *= 0.3;
          const n = Math.hypot(ax, az) || 1;
          p.x += (ax / n) * RUN * dt;
          p.z += (az / n) * RUN * dt;
          p.h = Math.atan2(az, ax);
          this.pushOut(p, 0.35);
          if (d > 140) p.lostT += dt;
          else p.lostT = 0;
          if (p.lostT > 12) {
            p.state = "gone";
            this.award(-60, `Suspect ${fullName(p.person)} got away`);
            const k = this.contactFor(p.id);
            if (k) k.resolved = "fled";
          }
          break;
        }
        case "attack": {
          const d = Math.hypot(o.x - p.x, o.z - p.z);
          p.h = Math.atan2(o.z - p.z, o.x - p.x);
          if (p.person.armed) {
            p.drawn = true;
            // Keep some distance and shoot.
            if (d > 14) {
              p.x += Math.cos(p.h) * 2.2 * dt;
              p.z += Math.sin(p.h) * 2.2 * dt;
            }
            if (this.time >= p.attackAt && d < 38 && lineOfSight(this.city, p.x, p.z, o.x, o.z)) {
              p.attackAt = this.time + this.rng.range(0.9, 1.6);
              const chance = Math.max(0.08, 0.6 - d * 0.018) * (pl.inCar ? 0.4 : 1);
              const hit = this.rng.next() < chance;
              this.events.push({ type: "shot", x: p.x, z: p.z, tx: o.x, tz: o.z, by: "ped", hit });
              this.panicAround(p.x, p.z);
              if (hit) this.hurtOfficer(this.rng.int(11, 18));
              this.addOffence(p, "discharging a firearm");
              this.addOffence(p, "assault on an officer");
            }
          } else {
            if (d > 1.3) {
              p.x += Math.cos(p.h) * 4.4 * dt;
              p.z += Math.sin(p.h) * 4.4 * dt;
            } else if (this.time >= p.attackAt && !pl.inCar) {
              p.attackAt = this.time + 1.1;
              this.hurtOfficer(7);
              this.addOffence(p, "assault on an officer");
            }
          }
          this.pushOut(p, 0.35);
          break;
        }
        case "panic": {
          // Run from the gunfire, then stop and stay put.
          const from = p.panicFrom ?? o;
          const a = Math.atan2(p.z - from.z, p.x - from.x);
          p.x += Math.cos(a) * 4.5 * dt;
          p.z += Math.sin(a) * 4.5 * dt;
          p.h = a;
          this.pushOut(p, 0.35);
          if (this.time > (p.panicUntil ?? 0)) p.state = "stand";
          break;
        }
        case "fight": {
          const foe = this.ped(p.foe);
          if (!foe || foe.state !== "fight") {
            p.state = "stand";
            break;
          }
          p.h = Math.atan2(foe.z - p.z, foe.x - p.x);
          const d = Math.hypot(foe.x - p.x, foe.z - p.z);
          if (d > 1.1) {
            p.x += Math.cos(p.h) * 1.5 * dt;
            p.z += Math.sin(p.h) * 1.5 * dt;
          }
          p.step += dt * 6;
          // Break it up when the police arrive.
          if (Math.hypot(o.x - p.x, o.z - p.z) < 14) {
            for (const x of [p, foe]) {
              x.state = this.rng.next() < 0.3 ? "flee" : "stand";
              x.role = "suspect";
              this.addOffence(x, "disorderly conduct");
            }
            this.say(p, "He started it!");
          }
          break;
        }
        case "cross": {
          const tgt = p.cross!;
          const a = Math.atan2(tgt.z - p.z, tgt.x - p.x);
          p.x += Math.cos(a) * WALK * 1.2 * dt;
          p.z += Math.sin(a) * WALK * 1.2 * dt;
          p.h = a;
          if (onRoad(p.x, p.z) && this.distToOfficer(p.x, p.z) < 45) {
            const k = this.contacts.find((x) => x.ped === p.id && !x.resolved) ?? this.newContact(p, null, "Jaywalking");
            k.violations.add("jaywalking");
          }
          if (Math.hypot(tgt.x - p.x, tgt.z - p.z) < 0.5) p.state = "stand";
          break;
        }
        case "kneel":
        case "prone": {
          // Facing away from the officer; a runner may bolt if left alone too long.
          const d = Math.hypot(p.x - o.x, p.z - o.z);
          p.h = Math.atan2(p.z - o.z, p.x - o.x);
          if (d > 20 && p.role === "suspect" && this.rng.next() < p.person.flee * dt * 0.04) {
            p.state = "flee";
            this.say(p, "*gets up and runs*");
          }
          break;
        }
        case "backing": {
          // Back toward the officer's voice, hands up.
          const dx = o.x - p.x;
          const dz = o.z - p.z;
          const d = Math.hypot(dx, dz) || 1;
          p.h = Math.atan2(-dz, -dx);
          if (d > 4.5) {
            p.x += (dx / d) * 1.1 * dt;
            p.z += (dz / d) * 1.1 * dt;
            this.pushOut(p, 0.35);
          } else {
            p.state = "handsup";
            this.info('You: "STOP! Right there!"', "speech");
          }
          break;
        }
        case "down":
          if (this.time >= p.downUntil) {
            // Get up: suspects keep trying; civilians stand.
            if (p.role === "suspect" && this.rng.next() < p.person.flee * 0.6) p.state = "flee";
            else p.state = "handsup";
          }
          break;
        case "stand":
        case "talk":
        case "handsup":
        case "cuffed": {
          // Bystanders who stopped to film (or froze) walk on when it's over.
          if (p.resumeAt !== undefined && this.time > p.resumeAt && p.walk && (p.state === "stand" || p.state === "handsup") && !this.contacts.some((k) => k.ped === p.id && !k.resolved)) {
            p.state = "walk";
            p.task = undefined;
            p.resumeAt = undefined;
            break;
          }
          // Face the officer when close.
          if (Math.hypot(o.x - p.x, o.z - p.z) < 10 && p.state !== "cuffed") p.h = Math.atan2(o.z - p.z, o.x - p.x);
          break;
        }
      }
      const moved = Math.hypot(p.x - prevX, p.z - prevZ);
      p.speed = moved / dt;
      p.step += moved * 2.2 * (p.state === "backing" ? -1 : 1);
      // Cars hit people.
      if (p.state !== "escort")
        for (const c of this.cars) {
          const v = Math.abs(speedOf(c));
          if (v < 3 || Math.abs(c.x - p.x) > 4 || Math.abs(c.z - p.z) > 4) continue;
          if (!carCircles(c).some((k) => Math.hypot(k.x - p.x, k.z - p.z) < k.r + 0.3)) continue;
          const wasThreat = p.state === "flee" || p.state === "attack";
          p.state = v > 15 ? "dead" : "down";
          p.hp = v > 15 ? 0 : 40;
          p.downUntil = this.time + (wasThreat ? 5 : 1e9);
          p.drawn = false;
          if (c === this.unit) this.award(wasThreat ? -40 : -150, wasThreat ? "Struck a suspect with your vehicle" : "Struck a pedestrian");
          break;
        }
    }
  }

  /** Bystanders near gunfire run for cover. */
  private panicAround(x: number, z: number) {
    for (const p of this.peds)
      if ((p.state === "walk" || p.state === "stand") && p.role === "civilian" && Math.hypot(p.x - x, p.z - z) < 35) {
        p.state = "panic";
        p.walk = undefined;
        p.panicFrom = { x, z };
        p.panicUntil = this.time + 5;
      }
  }

  private hurtOfficer(n: number) {
    this.player.hp = Math.max(0, this.player.hp - n);
    this.player.hurtAt = this.time;
    this.events.push({ type: "hurt" });
  }

  // ----------------------------------------------------------------- stops

  /** Lights on behind a car: it pulls over (or runs). */
  private stepStops(dt: number) {
    const u = this.unit;
    const lightsNow = u.lights ? 1 : 0;
    const turnedOn = lightsNow && !this.lightsWas;
    this.lightsWas = lightsNow;

    if (!u.lights && this.stopCar) {
      // Lights off: an un-started stop is abandoned.
      const c = this.car(this.stopCar);
      const k = this.contacts.find((x) => x.car === this.stopCar && !x.resolved);
      if (c && c.ai && c.ai.mode === "stopped" && !k) c.ai.mode = "cruise";
      if (!k) this.stopCar = null;
    }
    // Lights only (no siren) behind a car for a moment: that's a traffic stop. With the siren on
    // you're responding to a call, and traffic just clears the way.
    if (u.lights && !u.siren && !this.stopCar && this.player.inCar) {
      const f = forward(u.h);
      let target: Car | null = null;
      let best = Infinity;
      for (const c of this.cars) {
        if (c === u || !c.ai || c.spec.police || c.ai.mode === "flee" || c.ai.mode === "parked") continue;
        const dx = c.x - u.x;
        const dz = c.z - u.z;
        const ahead = dx * f.x + dz * f.z;
        if (ahead < 4 || ahead > 30) continue;
        if (Math.abs(dx * -f.z + dz * f.x) > 3.4) continue;
        if (forward(c.h).x * f.x + forward(c.h).z * f.z < 0.6) continue;
        if (ahead < best) {
          best = ahead;
          target = c;
        }
      }
      if (target && this.stopCandidate?.id === target.id) {
        if (this.time - this.stopCandidate.since >= 1.5 || turnedOn) this.beginStop(target);
      } else this.stopCandidate = target ? { id: target.id, since: this.time } : null;
    } else this.stopCandidate = null;

    const c = this.car(this.stopCar);
    if (c && c.ai && c.ai.mode === "stopped" && Math.abs(speedOf(c)) < 0.4) {
      if (!this.contacts.some((k) => k.car === c.id && !k.resolved)) {
        const d = this.ped(c.driver);
        if (d) {
          const k = this.newContact(d, c, this.stopReason(c));
          this.stats.stops++;
          this.info(`Traffic stop: ${c.reg?.make ?? c.spec.name}, plate ${c.reg?.plate}. Walk up to the driver's window.`, "info");
          void k;
        }
      }
    }
    void dt;
  }

  private stopReason(c: Car) {
    const seen = [...c.seen];
    if (seen.length) return seen.join(", ");
    if (c.brokenLight) return "broken tail light";
    return "no visible reason";
  }

  private beginStop(c: Car) {
    const d = this.ped(c.driver);
    this.stopCar = c.id;
    const call = this.calls.find((x) => x.cars.includes(c.id));
    const stolen = c.reg?.status === "stolen";
    const runP = call?.kind === "race" ? 1 : ((d?.person.flee ?? 0) * 0.45 + (stolen ? 0.45 : 0)) * (call ? 1.3 : 1);
    if (this.rng.next() < runP) {
      this.startPursuit(c);
      return;
    }
    c.ai!.mode = "stopped";
    c.ai!.yieldT = 0;
    this.radio(`You: "1-Adam-12, traffic stop on a ${c.reg?.make ?? "vehicle"}, plate ${c.reg?.plate}, ${describe(c.x, c.z)}."`);
  }

  startPursuit(c: Car) {
    if (!c.ai) return;
    c.ai.mode = "flee";
    c.ai.stuck = 0;
    const d = this.ped(c.driver);
    if (d) this.addOffence(d, "evading police");
    this.stopCar = null;
    this.stats.pursuits++;
    this.radio(`You: "1-Adam-12, vehicle failing to yield! I'm in pursuit, ${describe(c.x, c.z)}. Requesting backup!"`);
    const k = this.contacts.find((x) => x.car === c.id && !x.resolved);
    if (k) k.resolved = "fled";
  }

  private newContact(p: Ped, c: Car | null, reason: string): Contact {
    const k: Contact = {
      id: this.id("k"),
      ped: p.id,
      car: c?.id,
      reason,
      idShown: false,
      ranPerson: false,
      ranPlate: false,
      asked: new Set(),
      breath: false,
      searched: false,
      refused: false,
      tainted: false,
      pc: new Set(),
      violations: new Set(),
      offences: new Set(),
      cited: false,
      resolved: "",
      runs: this.rng.next() < p.person.flee * 0.5,
    };
    if (c) {
      for (const s of c.seen) k.violations.add(s);
      if (c.brokenLight) k.violations.add("broken tail light");
    }
    this.contacts.push(k);
    return k;
  }

  contactFor(pedId: string) {
    return this.contacts.find((k) => k.ped === pedId && !k.resolved) ?? this.contacts.findLast((k) => k.ped === pedId);
  }

  private addOffence(p: Ped, o: Offence) {
    let k = this.contacts.find((x) => x.ped === p.id && (!x.resolved || x.resolved === "fled"));
    if (!k) k = this.newContact(p, this.car(p.carId) ?? null, "Incident");
    k.offences.add(o);
  }

  /** The contact the officer can act on right now (close enough to talk). */
  focus(): { ped: Ped; k: Contact | null } | null {
    if (this.player.inCar) return null;
    const pl = this.player;
    let best: { ped: Ped; k: Contact | null } | null = null;
    let bestD = Infinity;
    for (const p of this.peds) {
      if (p.state === "gone" || p.state === "incar" || p.state === "flee" || p.state === "attack") continue;
      let x = p.x;
      let z = p.z;
      if (p.state === "driving") {
        const c = this.car(p.carId);
        if (!c || Math.abs(speedOf(c)) > 1) continue;
        // Driver's window (left side).
        const r = right(c.h);
        const f = forward(c.h);
        x = c.x - r.x * 1.3 + f.x * 0.3;
        z = c.z - r.z * 1.3 + f.z * 0.3;
      }
      const d = Math.hypot(x - pl.x, z - pl.z);
      if (d > TALK_RANGE || d >= bestD) continue;
      const custody = p.state === "cuffed" || p.state === "escort";
      const k = this.contacts.find((x) => x.ped === p.id && !x.resolved) ?? (custody ? (this.contacts.findLast((x) => x.ped === p.id) ?? null) : null);
      if (p.state === "driving" && !k) continue;
      if (p.state === "walk" || p.state === "down" || p.state === "dead" || k || p.state === "stand" || p.state === "handsup" || p.state === "cuffed" || p.state === "escort" || p.state === "talk" || p.state === "kneel" || p.state === "prone") {
        best = { ped: p, k };
        bestD = d;
      }
    }
    return best;
  }

  // ------------------------------------------------------------- actions

  /** What the officer can do right now, grouped (commands first, unit last); keys 1–9 follow this order. */
  options(): Option[] {
    const order: OptionGroup[] = ["command", "talk", "check", "enforce", "custody", "scene", "unit"];
    return this.optionsRaw()
      .map((o, i) => ({ o: { ...o, group: o.group ?? groupOf(o.id) }, i }))
      .sort((a, b) => order.indexOf(a.o.group) - order.indexOf(b.o.group) || a.i - b.i)
      .map((x) => x.o);
  }

  /** A high-risk stopped car whose driver can be ordered out from cover (felony stop). */
  felonyTarget(): { car: Car; driver: Ped; k: Contact } | null {
    const c = this.car(this.stopCar);
    if (!c || !c.ai || c.ai.mode !== "stopped" || Math.abs(speedOf(c)) > 0.5) return null;
    const k = this.contacts.find((x) => x.car === c.id && !x.resolved);
    const d = this.ped(c.driver);
    if (!k || !d || d.state !== "driving" || k.felony) return null;
    const risky = c.reg?.status === "stolen" || this.flagged.has(c.id) || this.calls.some((x) => (x.state === "enroute" || x.state === "onscene") && x.cars.includes(c.id)) || k.offences.size > 0;
    if (!risky) return null;
    const dist = this.distToOfficer(c.x, c.z);
    return dist > 4 && dist < 38 ? { car: c, driver: d, k } : null;
  }

  /** The suspect you can give verbal commands to from a distance. */
  commandTarget(): Ped | null {
    const o = this.officer;
    let best: Ped | null = null;
    let bestD = 26;
    for (const p of this.peds) {
      if (p.state !== "handsup" && p.state !== "backing" && p.state !== "kneel" && p.state !== "stand" && p.state !== "talk") continue;
      const k = this.contactFor(p.id);
      const open = k && !k.resolved;
      const risky = !!(open && (k.felony || k.offences.size > 0)) || (p.role === "suspect" && p.state !== "talk");
      if (!risky) continue;
      const d = Math.hypot(p.x - o.x, p.z - o.z);
      if (d < bestD && lineOfSight(this.city, o.x, o.z, p.x, p.z)) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  private optionsRaw(): Option[] {
    if (this.over) return [];
    const out: Option[] = [];
    const u = this.unit;
    const pl = this.player;
    // Booking at the station.
    if (u.back.length && Math.hypot(u.x - this.city.station.x, u.z - this.city.station.z) < 26 && Math.abs(speedOf(u)) < 1)
      out.push({ id: "book", label: `Book ${u.back.length} prisoner${u.back.length > 1 ? "s" : ""} into custody` });
    // Run the plate of the car being stopped (from the MDT).
    const sc = this.car(this.stopCar);
    const sk = sc ? this.contacts.find((k) => k.car === sc.id && !k.resolved) : undefined;
    if (sk && !sk.ranPlate) out.push({ id: "plate", label: `MDT: run plate ${sc!.reg?.plate}` });
    // Collision scene: tow.
    const call = this.activeCall();
    if (call && call.kind === "collision" && call.state === "onscene" && !call.towAt && this.distToOfficer(call.x, call.z) < 40) {
      const handled = call.suspects.every((id) => {
        const k = this.contactFor(id);
        return k?.resolved || this.ped(id)?.state === "cuffed" || this.ped(id)?.state === "incar";
      });
      if (handled) out.push({ id: "tow", label: "Call a tow truck and clear the scene" });
    }
    const st = this.city.station;
    const gas = this.city.places.find((q) => q.kind === "gas");
    const atGarage = Math.hypot(u.x - st.x, u.z - st.z) < 26 || (!!gas && Math.hypot(u.x - gas.x, u.z - gas.z) < 18);
    if (pl.inCar && atGarage && Math.abs(speedOf(u)) < 1 && (u.health < 100 || u.spiked))
      out.push({ id: "repair", label: "Repair and restock the unit" });
    if (this.canCallAir()) out.push({ id: "air", label: "Request air support (Air-1)" });
    // Paperwork from the unit's MDT (parked).
    const todo = this.reports.find((r) => !r.filed);
    if (todo && pl.inCar && Math.abs(speedOf(u)) < 1) out.push({ id: `report:${todo.id}`, label: `MDT: file ${todo.title}` });
    const fel = this.felonyTarget();
    if (fel) out.push({ id: "felony-out", label: "Felony stop: \"DRIVER! Hands out the window! Step out slowly!\"" });

    if (pl.inCar) return out;
    // Abandoned vehicle on scene.
    if (call && call.kind === "abandoned" && call.state === "onscene") {
      const ac = this.car(call.cars[0]);
      if (ac && Math.hypot(ac.x - pl.x, ac.z - pl.z) < 6) {
        if (!call.plateRun) out.push({ id: "ab-plate", label: `MDT: run plate ${ac.reg?.plate}` });
        if (!call.towAt) out.push({ id: "ab-tow", label: "Tag it and call a tow truck" });
      }
    }
    // Verbal commands to a suspect at a distance.
    const ct = this.commandTarget();
    if (ct) {
      const ck = this.contactFor(ct.id);
      const far = this.distToOfficer(ct.x, ct.z) > 5.5;
      if (ct.state === "handsup" && far && ck?.felony) out.push({ id: "cmd-back", label: "\"Walk backwards toward my voice!\"" });
      if (ct.state !== "kneel" && ct.state !== "backing") out.push({ id: "cmd-kneel", label: "\"On your knees! Hands on your head!\"" });
      if (ct.state !== "backing") out.push({ id: "cmd-prone", label: "\"Get down on the ground! Arms out!\"" });
    }
    // Screening the driver waiting at your checkpoint.
    const cpc = this.checkpointCar();
    if (cpc) {
      const r = right(cpc.h);
      if (Math.hypot(cpc.x - r.x * 1.3 - pl.x, cpc.z - r.z * 1.3 - pl.z) < 3.5) {
        out.push({ id: "cp-screen", label: "Checkpoint: \"Licence please, where are you headed tonight?\"" });
        out.push({ id: "cp-wave", label: "Checkpoint: wave them through" });
        return out;
      }
    }
    // Illegally parked car in front of you.
    const pc = this.parkedCar();
    if (pc) {
      if (!pc.ticketed) out.push({ id: "park-ticket", label: `Parking ticket: ${pc.parking} ($${FINES["illegal parking"]})` });
      out.push({ id: "park-tow", label: `Have it towed (${pc.parking})` });
    }
    // Directing traffic from the middle of an intersection.
    if (this.controlNode() !== null) {
      const tc = this.deploy.find((d) => d.kind === "traffic");
      if (!tc || tc.hold !== "all") out.push({ id: "tc-all", label: "Direct traffic: stop all lanes" });
      if (!tc || tc.hold !== "ns") out.push({ id: "tc-ns", label: "Hold north–south, wave east–west through" });
      if (!tc || tc.hold !== "ew") out.push({ id: "tc-ew", label: "Hold east–west, wave north–south through" });
      if (tc) out.push({ id: "tc-off", label: "Release traffic (back to the signals)" });
    }
    if (this.nearShop()) out.push({ id: "coffee", label: "Grab a coffee to go" });
    const f = this.focus();
    if (!f) {
      // Setting up on the road.
      if (this.roadSpot()) {
        const has = (k: Deployable["kind"]) => this.deploy.some((d) => d.kind === k);
        out.push(has("checkpoint") ? { id: "cp-remove", label: "Take down the checkpoint" } : { id: "cp-deploy", label: "Set up a sobriety checkpoint here" });
        out.push(has("cones") ? { id: "cones-remove", label: "Pick up the cones" } : { id: "cones-deploy", label: "Put out a line of cones" });
        if (has("roadblock")) out.push({ id: "rb-remove", label: "Clear the roadblock" });
        else if (this.anyPursuit()) out.push({ id: "rb-deploy", label: "Block the road here (roadblock)" });
      }
      return out;
    }
    const { ped: p, k } = f;
    const name = k?.idShown ? fullName(p.person) : "them";
    if (p.state === "cuffed" || p.state === "escort") {
      if (p.kneeling) out.push({ id: "stand", label: `Stand ${name} up` });
      out.push({ id: "escort", label: p.state === "escort" ? "Stop escorting" : `Escort ${name}` });
      if (k && !k.searched) out.push({ id: "search", label: "Search (incident to arrest)" });
      if (Math.hypot(u.x - p.x, u.z - p.z) < 5 && u.back.length < 2) out.push({ id: "load", label: "Put in the back of the unit" });
      if (!p.pickup) out.push({ id: "transport", label: "Request prisoner transport" });
      const pc = this.car(p.carId);
      if (pc && !pc.towAt && pc !== u) out.push({ id: "tow", label: "Have their vehicle towed and impounded" });
      if (k && !k.ranPerson && k.idShown) out.push({ id: "person", label: `MDT: run ${name}` });
      if (k && !k.miranda) out.push({ id: "miranda", label: "Read them their rights (Miranda)" });
      return out;
    }
    if (p.state === "dead") {
      if (!p.pickup) out.push({ id: "ems", label: "Call the coroner" });
      return out;
    }
    if (p.state === "down" && p.role !== "suspect" && p.downUntil > this.time + 1e6) {
      if (!p.pickup) out.push({ id: "ems", label: "Call EMS: injured person" });
      return out;
    }
    if (p.state === "handsup" || p.state === "down" || p.state === "kneel" || p.state === "prone") {
      out.push({ id: "arrest", label: `Cuff ${name}` });
      if (k && !k.searched) out.push({ id: "search", label: "Frisk" });
      if (p.role !== "suspect") out.push({ id: "release", label: "You're free to go" });
      return out;
    }
    const canWitness = !p.witnessed && (p.role === "civilian" || p.role === "victim") && !!this.activeCall()?.suspects.length && !this.activeCall()!.suspects.includes(p.id);
    if (!k) {
      out.push({ id: "talk", label: "Talk: \"Excuse me, can I talk to you?\"" });
      if (canWitness) out.push({ id: "witness", label: "\"Have you seen anyone suspicious around here?\"" });
      return out;
    }
    if (canWitness) out.push({ id: "witness", label: "\"Have you seen anyone suspicious around here?\"" });
    const inCar = p.state === "driving";
    const car = this.car(k.car);
    if (!k.idShown) out.push({ id: "id", label: car ? "Licence and registration, please" : "Can I see some ID?" });
    if (k.idShown && !k.ranPerson) out.push({ id: "person", label: `MDT: run ${name}` });
    if (car && !k.ranPlate) out.push({ id: "plate", label: `MDT: run plate ${car.reg?.plate}` });
    if (!k.asked.has(car ? "why" : "what")) out.push({ id: car ? "why" : "what", label: car ? "Do you know why I stopped you?" : "What are you doing out here?" });
    if (!k.asked.has("drink")) out.push({ id: "drink", label: "Have you had anything to drink tonight?" });
    if (!k.asked.has("illegal")) out.push({ id: "illegal", label: car ? "Anything illegal in the vehicle?" : "Anything illegal on you?" });
    if (inCar) out.push({ id: "out", label: "Step out of the vehicle, please" });
    if (!inCar && !k.fst) out.push({ id: "fst", label: "Field sobriety tests" });
    if (!inCar && !k.breath) out.push({ id: "breath", label: "Breathalyzer" });
    if (car && !k.searched && k.k9At === undefined) out.push({ id: "k9", label: "Request a K9 sniff of the vehicle" });
    if (!k.searched) out.push({ id: "search", label: car ? "Search the vehicle" : "Search / frisk" });
    if (k.violations.size && !k.cited) {
      out.push({ id: "cite", label: `Write a ticket (${[...k.violations].join(", ")})` });
      out.push({ id: "warn", label: "Let them off with a verbal warning" });
    }
    out.push({ id: "arrest", label: "Place under arrest" });
    out.push({ id: "release", label: "You're free to go" });
    return out;
  }

  choose(id: string) {
    const u = this.unit;
    if (id === "book") return this.book();
    if (id === "tow") {
      const call = this.activeCall();
      if (call) {
        call.towAt = this.time + 10;
        this.radio("You: \"Dispatch, requesting a tow for two vehicles.\" Dispatch: \"10-4, tow en route.\"");
      }
      return;
    }
    if (this.chooseTool(id)) return;
    if (id.startsWith("report:")) return this.fileReport(id.slice(7));
    if (id === "felony-out") return this.felonyOut();
    if (id === "cmd-kneel" || id === "cmd-prone" || id === "cmd-back") {
      const t = this.commandTarget();
      if (t) this.command(t, id === "cmd-kneel" ? "kneel" : id === "cmd-prone" ? "prone" : "backing");
      return;
    }
    if (id === "ab-plate" || id === "ab-tow") return this.abandonedAction(id);
    if (id === "park-ticket" || id === "park-tow") return this.parkingAction(id);
    if (id.startsWith("tc-")) return this.trafficControl(id);
    if (id === "coffee") return this.coffee();
    if (id.startsWith("ticket:")) return this.writeTicket(id.slice(7));
    if (id === "plate" && this.player.inCar) {
      const c = this.car(this.stopCar);
      const k = c && this.contacts.find((x) => x.car === c.id && !x.resolved);
      if (c && k) this.runPlate(k, c);
      return;
    }
    const f = this.focus();
    if (!f) {
      if (id === "plate") {
        const c = this.car(this.stopCar);
        const k = c && this.contacts.find((x) => x.car === c.id && !x.resolved);
        if (c && k) this.runPlate(k, c);
      }
      return;
    }
    const p = f.ped;
    let k = f.k;
    const P = p.person;
    const car = this.car(k?.car);
    switch (id) {
      case "witness":
        return this.askWitness(p);
      case "talk": {
        k = this.newContact(p, null, "Consensual contact");
        const call = this.calls.find((c) => c.id === p.call);
        if (call) k.reason = call.title;
        if (call?.kind === "noise") {
          k.violations.add("noise ordinance");
          p.task = undefined;
        }
        if (p.state === "walk") p.state = "talk";
        if (P.attitude === "hostile" && this.rng.next() < 0.3) this.suspectReacts(p, k);
        else this.say(p, P.attitude === "polite" ? "Sure, officer. What's up?" : P.attitude === "nervous" ? "Uh... yeah? Did I do something?" : "What do you want?");
        return;
      }
      case "id": {
        k!.idShown = true;
        if (car && p.state === "driving") {
          const r = (p.person.id.charCodeAt(p.person.id.length - 1) * 7) % 100;
          if (r < 13) {
            k!.violations.add("no seatbelt");
            this.info("You notice the driver isn't wearing a seatbelt.", "info");
          } else if (r < 21) {
            k!.violations.add("phone while driving");
            this.info("There's a phone in their hand, screen still lit.", "info");
          }
        }
        if (car && P.licence === "none") {
          this.say(p, "I, uh... I don't have a licence.");
          k!.violations.add("no licence");
        } else if (!car && this.rng.next() < 0.15) {
          this.say(p, "I don't have ID on me. My name's " + fullName(P) + ".");
        } else this.say(p, car ? "Here you go." : "Here.");
        return;
      }
      case "person": {
        k!.ranPerson = true;
        const lines = [`${fullName(P)}, DOB ${P.dob} (${P.age})`, `Licence: ${P.licence.toUpperCase()}`];
        if (P.warrants.length) lines.push(`WARRANTS: ${P.warrants.join("; ")}`);
        else lines.push("No warrants");
        if (P.note) lines.push(`Note: ${P.note}`);
        const flag = P.warrants.length > 0 || P.licence !== "valid";
        this.mdt.unshift({ title: `PERSON: ${fullName(P)}`, lines, flag, at: this.time });
        this.mdt.length = Math.min(this.mdt.length, 6);
        if (car) {
          if (P.licence === "suspended") {
            k!.violations.add("suspended licence");
            k!.offences.add("driving while suspended");
          }
          if (P.licence === "expired") k!.violations.add("expired licence");
          if (P.licence === "none") k!.violations.add("no licence");
        }
        if (P.warrants.length) {
          k!.offences.add("outstanding warrant");
          this.radio(`Dispatch: "1-Adam-12, be advised, subject has an active warrant: ${P.warrants[0]}."`);
          if (k!.runs && p.state !== "cuffed") this.suspectReacts(p, k!);
        }
        return;
      }
      case "plate":
        if (car) this.runPlate(k!, car);
        return;
      case "why":
      case "what": {
        k!.asked.add(id);
        const call = this.calls.find((c) => c.id === p.call);
        if (call?.kind === "domestic") {
          this.say(p, p.aggressor ? "She's lying. Nothing happened, alright?" : "He grabbed me and threw me into the wall. I want him out.");
          if (!p.aggressor) {
            const agg = call.suspects.map((s) => this.ped(s)).find((x) => x?.aggressor);
            if (agg) this.addOffence(agg, "domestic assault");
            this.info("Victim statement taken: probable cause for domestic assault.", "info");
          }
          return;
        }
        this.say(p, this.rng.pick(LINES_WHY[P.attitude]));
        return;
      }
      case "drink": {
        k!.asked.add("drink");
        const line = P.bac >= 0.08 ? this.rng.pick(LINES_DRINK.drunk) : P.bac > 0.02 ? this.rng.pick(LINES_DRINK.some) : this.rng.pick(LINES_DRINK.sober);
        this.say(p, line);
        if (P.bac >= 0.05) {
          k!.pc.add("alcohol");
          this.info("You notice the smell of alcohol and glassy eyes.", "info");
        }
        return;
      }
      case "illegal": {
        k!.asked.add("illegal");
        const dirty = P.drugs || P.armed;
        this.say(p, this.rng.pick(dirty ? LINES_ILLEGAL.dirty : LINES_ILLEGAL.clean));
        if (P.drugs && this.rng.next() < 0.6) {
          k!.pc.add("odor");
          this.info("You smell cannabis coming from them.", "info");
        }
        if (!dirty && this.rng.next() < 0.7) k!.pc.add("consent");
        return;
      }
      case "out": {
        if (k!.runs && this.rng.next() < 0.5) return this.suspectReacts(p, k!);
        const c = this.car(p.carId);
        if (c) {
          const r = right(c.h);
          const f2 = forward(c.h);
          p.x = c.x - r.x * 1.6 - f2.x * 2.8;
          p.z = c.z - r.z * 1.6 - f2.z * 2.8;
          c.driver = null;
        }
        p.state = "stand";
        this.say(p, P.attitude === "hostile" ? "Fine. Whatever." : "Okay...");
        return;
      }
      case "fst": {
        k!.fst = true;
        const clues = P.bac >= 0.08 ? this.rng.int(4, 6) : P.bac >= 0.05 ? this.rng.int(2, 3) : this.rng.int(0, 1);
        const lines = [`Eye test (HGN): ${Math.min(6, clues)}/6 clues`, clues >= 4 ? "Walk-and-turn: stepped off the line, used arms for balance" : "Walk-and-turn: completed", clues >= 3 ? "One-leg stand: swayed, put foot down" : "One-leg stand: completed"];
        this.mdt.unshift({ title: "FIELD SOBRIETY TESTS", lines, flag: clues >= 4, at: this.time });
        if (clues >= 4) {
          k!.pc.add("alcohol");
          this.info("They failed the field sobriety tests: probable cause for a breath test.", "info");
        } else this.info("Field sobriety tests: no signs of impairment.", "info");
        return;
      }
      case "k9": {
        k!.k9At = this.time + 8;
        this.radio(`You: "Dispatch, requesting K9 for a sniff, ${describe(p.x, p.z)}." K9-3: "En route, two minutes out."`);
        return;
      }
      case "miranda": {
        k!.miranda = true;
        this.info('You: "You have the right to remain silent. Anything you say can and will be used against you..."', "speech");
        this.say(p, P.attitude === "polite" ? "I understand." : "Yeah, yeah. Lawyer.");
        return;
      }
      case "breath": {
        k!.breath = true;
        this.mdt.unshift({ title: "BREATHALYZER", lines: [`BAC ${P.bac.toFixed(3)}`, P.bac >= 0.08 ? "OVER THE LIMIT (0.08)" : "Under the limit"], flag: P.bac >= 0.08, at: this.time });
        if (P.bac >= 0.08) {
          k!.offences.add(car ? "DUI" : "public intoxication");
          this.info(`BAC ${P.bac.toFixed(3)}: over the limit.`, "info");
        } else this.info(`BAC ${P.bac.toFixed(3)}.`, "info");
        return;
      }
      case "search": {
        const custodial = p.state === "cuffed" || p.state === "escort" || p.state === "down" || p.state === "handsup";
        const cause = custodial || k!.pc.has("odor") || k!.offences.size > 0 || (k!.pc.has("alcohol") && !!car);
        if (!cause && !k!.pc.has("consent")) {
          const yes = P.attitude === "polite" ? 0.8 : P.attitude === "nervous" ? 0.45 : P.attitude === "rude" ? 0.2 : 0;
          if (!k!.refused && this.rng.next() < yes - (P.drugs || P.armed ? 0.25 : 0)) {
            k!.pc.add("consent");
            this.say(p, "Go ahead, I've got nothing to hide.");
          } else if (!k!.refused) {
            k!.refused = true;
            this.say(p, "No. I don't consent to any searches.");
            this.info("They refused consent. Searching now needs probable cause (choose Search again to search anyway).", "info");
            return;
          } else {
            k!.tainted = true;
            this.award(-50, "Unlawful search (no consent, no probable cause)");
          }
        }
        k!.searched = true;
        const found: string[] = [];
        if (P.drugs) found.push(this.rng.pick(["a baggie of cocaine", "methamphetamine", "a bag of pills", "a brick of cannabis"]));
        if (P.armed) found.push(this.rng.pick(["a loaded 9mm pistol", "a revolver", "a sawn-off shotgun"]));
        if (!found.length) this.info("Search complete: nothing illegal.", "info");
        else {
          this.info(`Search found: ${found.join(", ")}.${k!.tainted ? " (Inadmissible.)" : ""}`, "info");
          if (!k!.tainted) {
            if (P.drugs) k!.offences.add("possession of narcotics");
            if (P.armed) k!.offences.add("unlawful carry of a firearm");
          }
          P.armed = false;
          if (k!.runs && !custodial) this.suspectReacts(p, k!);
        }
        return;
      }
      case "cite": {
        k!.cited = true;
        const n = k!.violations.size;
        this.stats.citations++;
        this.award(40 + 30 * n, `Citation: ${[...k!.violations].join(", ")}`);
        this.say(p, P.attitude === "polite" ? "Thank you, officer." : P.attitude === "rude" ? "Unbelievable." : "...");
        if (!k!.offences.size) this.release(p, k!, true);
        return;
      }
      case "arrest": {
        const kk = k ?? this.newContact(p, this.car(p.carId) ?? null, "Arrest");
        const offences = [...kk.offences];
        const detained = p.state === "handsup" || p.state === "down" || p.state === "kneel" || p.state === "prone";
        if (!offences.length && (p.role !== "suspect" || !detained)) {
          this.award(-150, `Wrongful arrest of ${fullName(P)} (no charges)`);
          this.release(p, kk, false);
          return;
        }
        if ((p.state === "stand" || p.state === "talk" || p.state === "driving") && this.rng.next() < P.flee * 0.55) return this.suspectReacts(p, kk);
        this.cuff(p, kk);
        return;
      }
      case "release": {
        if (k) this.release(p, k, false);
        else {
          p.state = p.walk ? "walk" : "stand";
          p.role = p.role === "suspect" ? "civilian" : p.role;
        }
        return;
      }
      case "stand": {
        p.kneeling = false;
        this.say(p, "Alright, alright...");
        return;
      }
      case "escort": {
        p.kneeling = false;
        if (p.state === "escort") {
          p.state = "cuffed";
          this.player.escort = null;
        } else {
          p.state = "escort";
          this.player.escort = p.id;
        }
        return;
      }
      case "load": {
        p.state = "incar";
        if (this.player.escort === p.id) this.player.escort = null;
        u.back.push(p.id);
        this.info(`${fullName(P)} is in the back of your unit. Drive to the station to book them, or call transport.`, "info");
        return;
      }
      case "warn": {
        k!.cited = true;
        this.award(25, `Verbal warning: ${[...k!.violations].join(", ")}`);
        this.say(p, "Thank you, officer. It won't happen again.");
        if (!k!.offences.size) this.release(p, k!, true);
        return;
      }
      case "ems": {
        const amb = this.spawnPolice("ambulance", p.x, p.z);
        if (amb) {
          p.pickup = amb.id;
          amb.siren = p.state !== "dead";
          this.radio(
            p.state === "dead"
              ? `You: "Dispatch, I need the coroner at ${describe(p.x, p.z)}." Dispatch: "10-4."`
              : `You: "Dispatch, roll EMS Code 3, injured pedestrian, ${describe(p.x, p.z)}." Dispatch: "10-4, medics en route."`,
          );
        }
        return;
      }
      case "tow": {
        const pc = this.car(p.carId);
        if (pc) {
          pc.towAt = this.time + 12;
          this.award(15, "Vehicle impounded");
          this.radio(`You: "Dispatch, requesting a tow, ${pc.reg?.plate ?? "vehicle"} to impound." Dispatch: "10-4."`);
        }
        return;
      }
      case "transport": {
        p.pickup = "pending";
        const van = this.spawnPolice("transport", p.x, p.z);
        if (van) {
          p.pickup = van.id;
          this.radio(`You: "Dispatch, requesting prisoner transport, ${describe(p.x, p.z)}." Dispatch: "10-4, transport en route."`);
        } else p.pickup = undefined;
        return;
      }
    }
  }

  private runPlate(k: Contact, c: Car) {
    k.ranPlate = true;
    const r = c.reg!;
    const lines = [`${r.plate}: ${r.make}, ${c.spec.name}`, `Owner: ${r.owner}`, `Registration: ${r.status.toUpperCase()}`];
    this.mdt.unshift({ title: `PLATE: ${r.plate}`, lines, flag: r.status !== "valid", at: this.time });
    this.mdt.length = Math.min(this.mdt.length, 6);
    if (r.status === "expired") k.violations.add("expired registration");
    if (r.status === "uninsured") k.violations.add("no insurance");
    if (r.status === "stolen") {
      k.offences.add("stolen vehicle");
      this.radio(`Dispatch: "1-Adam-12, that plate comes back STOLEN. Use caution."`);
      const d = this.ped(k.ped);
      if (d && k.runs && (d.state === "driving" || d.state === "stand")) this.suspectReacts(d, k);
    }
  }

  /** Things go wrong: they run (in the car or on foot) or fight. */
  private suspectReacts(p: Ped, k: Contact) {
    const P = p.person;
    const fight = this.rng.next() < P.fight;
    const c = this.car(p.carId);
    if (!fight && p.state === "driving" && c) {
      this.startPursuit(c);
      return;
    }
    if (p.state === "driving" && c) {
      // Bail out of the car first.
      const r = right(c.h);
      p.x = c.x - r.x * 1.6;
      p.z = c.z - r.z * 1.6;
      c.driver = null;
      if (c.ai) c.ai.mode = "parked";
    }
    p.role = "suspect";
    if (fight) {
      p.state = "attack";
      p.attackAt = this.time + 0.8;
      this.say(p, P.armed ? "You're not taking me in!" : "Get off me!");
      this.radio(`You: "1-Adam-12, suspect is ${P.armed ? "ARMED and " : ""}combative! Requesting backup!"`);
      k.offences.add("resisting arrest");
    } else {
      p.state = "flee";
      this.say(p, "*runs*");
      this.radio(`You: "1-Adam-12, foot pursuit, ${describe(p.x, p.z)}!"`);
      k.offences.add("resisting arrest");
    }
  }

  private cuff(p: Ped, k: Contact) {
    const controlled = p.state === "kneel" || p.state === "prone";
    if (p.state === "driving") {
      const c = this.car(p.carId);
      if (c) {
        const r = right(c.h);
        p.x = c.x - r.x * 1.6;
        p.z = c.z - r.z * 1.6;
        c.driver = null;
      }
    }
    p.state = "cuffed";
    p.kneeling = controlled;
    p.drawn = false;
    const wasArmed = p.person.armed;
    p.person.armed = false;
    k.resolved = "arrested";
    this.stats.arrests++;
    this.events.push({ type: "cuff" });
    const charges = [...k.offences];
    const pts = charges.length ? 120 + 60 * Math.min(4, charges.length - 1) : 60;
    if (k.checkpoint && charges.length) this.award(50, "Checkpoint catch");
    if (k.felony && controlled) this.award(80, "Felony stop by the book");
    else if (controlled && (wasArmed || charges.some((c) => c === "armed robbery" || c === "assault on an officer" || c === "stolen vehicle"))) this.award(30, "High-risk suspect proned out before cuffing");
    this.fileable("arrest", `arrest report: ${fullName(p.person)}`, [
      `Charges: ${charges.join(", ") || "none"}`,
      `Location: ${describe(p.x, p.z)}`,
      k.searched ? (k.tainted ? "Search: unlawful (evidence suppressed)" : "Search: conducted lawfully") : "Search: not conducted",
      k.felony ? "Felony stop procedure" : controlled ? "Suspect controlled on the ground" : "Standing arrest",
    ]);
    this.award(pts, `Arrest: ${fullName(p.person)} (${charges.join(", ") || "detained"})`);
    this.say(p, p.person.attitude === "hostile" ? "I want my lawyer." : "This is a mistake...");
    // Their car stays where it is.
    const c = this.car(p.carId);
    if (c?.ai) c.ai.mode = "parked";
    if (this.stopCar === c?.id) this.stopCar = null;
  }

  private release(p: Ped, k: Contact, cited: boolean) {
    k.resolved = cited ? "cited" : "released";
    const c = this.car(k.car);
    if (c && c.ai) {
      // Back in the car and away.
      p.state = "driving";
      c.driver = p.id;
      c.ai.mode = "cruise";
      if (this.stopCar === c.id) this.stopCar = null;
    } else {
      p.state = p.walk ? "walk" : "stand";
      if (p.role === "suspect") p.role = "civilian";
    }
    this.say(p, "Thanks. Have a good night.");
  }

  private book() {
    const u = this.unit;
    for (const id of u.back) {
      const p = this.ped(id);
      if (!p) continue;
      const k = this.contacts.find((x) => x.ped === id && x.resolved === "arrested");
      if (k && !k.miranda) this.award(-25, `No Miranda warning for ${fullName(p.person)}: statements suppressed`);
      else if (k) this.award(10, "Rights read, paperwork in order");
      p.state = "gone";
      this.stats.booked++;
      this.award(100, `Booked ${fullName(p.person)} into custody`);
    }
    u.back = [];
    this.radio(`Dispatch: "10-4, prisoners booked. 1-Adam-12, you're back in service."`);
  }

  // ------------------------------------------------------------ street life

  /** An illegally parked car at the kerb (hydrant, bus stop, expired meter). */
  private spawnParked(initial: boolean) {
    const spot = this.randomLane(initial ? 20 : 150, initial ? 420 : 300);
    if (!spot) return null;
    const car = makeCar(this.id("car"), this.rng.pick(CIVILIAN_KINDS), 0, 0, 0, this.rng.pick(CAR_COLORS));
    spawnOnLane(car, spot.a, spot.b, spot.t);
    const r = right(car.h);
    car.x += r.x * 2.45;
    car.z += r.z * 2.45;
    car.vx = car.vz = 0;
    car.fixture = true;
    car.parking = this.rng.pick(["blocking a fire hydrant", "parked in a bus stop", "expired meter", "parked in a red zone", "blocking a driveway"]);
    car.reg = makeRegistration(this.rng, makePerson(this.rng), { shady: 0.3 });
    this.cars.push(car);
    return car;
  }

  /** The illegally parked car the officer is standing at. */
  parkedCar() {
    const pl = this.player;
    if (pl.inCar) return null;
    let best: Car | null = null;
    let bestD = 3.6;
    for (const c of this.cars) {
      if (!c.fixture || c.towAt !== undefined) continue;
      const d = Math.hypot(c.x - pl.x, c.z - pl.z);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  }

  private parkingAction(id: string) {
    const c = this.parkedCar();
    if (!c) return;
    if (id === "park-ticket") {
      if (c.ticketed) return;
      c.ticketed = true;
      this.stats.citations++;
      this.stats.fines += FINES["illegal parking"];
      this.award(30, `Parking ticket: ${c.reg?.make ?? "car"} ${c.parking} ($${FINES["illegal parking"]})`);
      // Sometimes the owner comes running.
      if (this.rng.next() < 0.25) {
        const r = right(c.h);
        const o = this.newPed(makePerson(this.rng, { shady: 0.2 }), "civilian", c.x - r.x * 1.8, c.z - r.z * 1.8, "stand");
        o.resumeAt = this.time + 12;
        this.say(o, this.rng.pick(["Hey! I was gone two minutes!", "Are you kidding me? Come on!", "Seriously? I'm moving it right now!"]));
      }
      return;
    }
    c.towAt = this.time + 12;
    this.award(15, `Towed: ${c.reg?.make ?? "car"} ${c.parking}`);
    this.radio(`You: "Dispatch, requesting a tow, ${c.reg?.plate ?? "vehicle"} ${c.parking}, ${describe(c.x, c.z)}." Dispatch: "10-4."`);
  }

  /** Civilians near an officer with a weapon raised freeze, get their phones out, or back off. */
  private bystandersSeeGun() {
    if (this.time < this.aimNoticedAt) return;
    this.aimNoticedAt = this.time + 1;
    const pl = this.player;
    const f = forward(pl.h);
    for (const p of this.peds) {
      if (p.role !== "civilian" || (p.state !== "walk" && p.state !== "stand")) continue;
      const dx = p.x - pl.x;
      const dz = p.z - pl.z;
      const d = Math.hypot(dx, dz);
      if (d > 22) continue;
      const inLine = (dx * f.x + dz * f.z) / (d || 1) > 0.94;
      if (inLine && d < 14) {
        p.state = "handsup";
        p.resumeAt = this.time + 6;
        if (!this.speech || this.time - this.speech.at > 2) this.say(p, "Whoa, whoa! I'm not doing anything!");
      } else if (this.rng.next() < 0.35) {
        p.state = "stand";
        p.task = "film";
        p.resumeAt = this.time + 7 + this.rng.next() * 5;
        p.h = Math.atan2(-dz, -dx);
      }
    }
  }

  /** Point a witness at the call's suspect. */
  private askWitness(p: Ped) {
    p.witnessed = true;
    const call = this.activeCall();
    const suspects = (call?.suspects ?? []).map((id) => this.ped(id)).filter((s): s is Ped => !!s && s.state !== "gone" && s.state !== "cuffed" && s.state !== "incar" && s.state !== "escort");
    const s = suspects.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (!call || !s || Math.hypot(s.x - p.x, s.z - p.z) > 180 || this.rng.next() < 0.25) {
      this.say(p, this.rng.pick(["Sorry, I didn't see anything.", "No, nothing. I just got here.", "Can't help you, officer."]));
      return;
    }
    const a = Math.atan2(s.z - p.z, s.x - p.x);
    const dir = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
    this.say(p, `Yeah, ${s.state === "flee" ? "someone ran" : "someone went"} ${dir}, toward ${describe(s.x, s.z)}. Dark pants, ${colourWord(s.shirt)} top.`);
    call.x = s.x;
    call.z = s.z;
    call.trackAt = this.time;
    this.award(10, "Witness lead");
  }

  /** The intersection the officer is standing in (for traffic control), or null. */
  private controlNode() {
    const pl = this.player;
    if (pl.inCar) return null;
    const n = nearestNode(pl.x, pl.z);
    const c = nodePos(n);
    return Math.abs(pl.x - c.x) < HALF_STREET + 3 && Math.abs(pl.z - c.z) < HALF_STREET + 3 ? n : null;
  }

  private trafficControl(id: string) {
    const n = this.controlNode();
    this.deploy = this.deploy.filter((d) => d.kind !== "traffic");
    if (id === "tc-off" || n === null) {
      this.info("You wave traffic on: signals back in control.", "info");
      return;
    }
    const c = nodePos(n);
    const hold = id === "tc-ns" ? "ns" : id === "tc-ew" ? "ew" : "all";
    this.deploy.push({ id: this.id("tc"), kind: "traffic", x: c.x, z: c.z, dx: 0, dz: 0, node: n, hold });
    this.info(hold === "all" ? 'You: "STOP!" (all lanes held)' : `You hold ${hold === "ns" ? "north–south" : "east–west"} traffic and wave the other way through.`, "speech");
  }

  /** Stop lines for the officer directing traffic, per held approach. */
  private trafficStops() {
    const out: { id: string; x: number; z: number; dx: number; dz: number }[] = [];
    for (const d of this.deploy) {
      if (d.kind !== "traffic") continue;
      const g = HALF_STREET + 1.5;
      if (d.hold !== "ew") {
        out.push({ id: `${d.id}s`, x: d.x - 2, z: d.z - g, dx: 0, dz: 1 });
        out.push({ id: `${d.id}n`, x: d.x + 2, z: d.z + g, dx: 0, dz: -1 });
      }
      if (d.hold !== "ns") {
        out.push({ id: `${d.id}e`, x: d.x - g, z: d.z + 2, dx: 1, dz: 0 });
        out.push({ id: `${d.id}w`, x: d.x + g, z: d.z - 2, dx: -1, dz: 0 });
      }
    }
    return out;
  }

  /** Is the officer directing traffic (render: pointing)? */
  get directing() {
    return this.deploy.some((d) => d.kind === "traffic") && !this.player.inCar;
  }

  /** What the ticket book shows for the current contact: what you've established and what the book can write. */
  ticketBook() {
    const f = this.focus();
    const k = f?.k;
    if (!k || k.cited) return null;
    return { name: k.idShown ? fullName(f!.ped.person) : "Unidentified", known: [...k.violations], book: TICKET_BOOK.map((v) => ({ v, fine: FINES[v] })) };
  }

  /** Write a ticket for a chosen list of violations; ones you never established get thrown out in court. */
  private writeTicket(list: string) {
    const f = this.focus();
    const k = f?.k;
    if (!f || !k || k.cited) return;
    const vs = [...new Set(list.split(",").filter((v): v is Violation => v in FINES))];
    if (!vs.length) return;
    const valid = vs.filter((v) => k.violations.has(v));
    const bogus = vs.filter((v) => !k.violations.has(v));
    k.cited = true;
    this.stats.citations++;
    const fine = valid.reduce((t, v) => t + FINES[v], 0);
    this.stats.fines += fine;
    if (valid.length) this.award(40 + 30 * valid.length, `Citation: ${valid.join(", ")} ($${fine})`);
    for (const b of bogus) this.award(-25, `Thrown out in court: ${b} (never established)`);
    const P = f.ped.person;
    this.say(f.ped, P.attitude === "polite" ? "Thank you, officer." : P.attitude === "rude" ? "Unbelievable. I'll see you in court." : "...");
    if (!k.offences.size) this.release(f.ped, k, true);
  }

  private coffee() {
    if (this.time < this.coffeeAt) {
      this.info(`Still buzzing. Another coffee in ${Math.ceil(this.coffeeAt - this.time)}s.`, "info");
      return;
    }
    this.coffeeAt = this.time + 150;
    this.player.stamina = 1;
    this.player.hp = Math.min(100, this.player.hp + 25);
    this.info("Coffee to go: stamina full, feeling better.", "good");
  }

  /** A shop or gas station the officer is standing at. */
  private nearShop() {
    const pl = this.player;
    return !pl.inCar && this.city.places.some((p) => (p.kind === "store" || p.kind === "gas") && Math.hypot(p.x - pl.x, p.z - pl.z) < 6);
  }

  // ------------------------------------------------------------ procedures

  /** Queue a report for the MDT. */
  private fileable(kind: Report["kind"], title: string, lines: string[]) {
    this.reports.push({ id: this.id("rep"), kind, title, lines, at: this.time, filed: false });
    if (this.reports.length > 40) this.reports.splice(0, this.reports.length - 40);
  }

  private fileReport(id: string) {
    const r = this.reports.find((x) => x.id === id);
    if (!r || r.filed) return;
    if (!this.player.inCar || Math.abs(speedOf(this.unit)) > 1) {
      this.info("Park the unit to do paperwork on the MDT.", "info");
      return;
    }
    r.filed = true;
    this.award(r.kind === "arrest" ? 25 : r.kind === "force" ? 20 : 15, `Report filed: ${r.title}`);
  }

  /** Felony stop: order a high-risk driver out of the car from cover. */
  private felonyOut() {
    const f = this.felonyTarget();
    if (!f) return;
    const { car: c, driver: p, k } = f;
    k.felony = true;
    k.commands = (k.commands ?? 0) + 1;
    this.radio(`You: "DRIVER! TURN OFF THE ENGINE! DROP THE KEYS OUT THE WINDOW! STEP OUT WITH YOUR HANDS UP!"`);
    if (k.runs && this.rng.next() < 0.55) return this.suspectReacts(p, k);
    const r = right(c.h);
    p.x = c.x - r.x * 1.5;
    p.z = c.z - r.z * 1.5;
    p.h = c.h;
    c.driver = null;
    p.state = "handsup";
    p.role = "suspect";
    this.say(p, p.person.attitude === "hostile" ? "Alright! Don't shoot, man!" : "Okay! Okay! I'm coming out!");
  }

  /** A verbal command: kneel, go prone, or walk backwards to the officer. */
  private command(p: Ped, what: "kneel" | "prone" | "backing") {
    const P = p.person;
    const k = this.contactFor(p.id);
    const lines = { kneel: "ON YOUR KNEES! HANDS ON YOUR HEAD!", prone: "GET DOWN ON THE GROUND! ARMS OUT TO THE SIDE!", backing: "WALK BACKWARDS TOWARD MY VOICE! KEEP YOUR HANDS UP!" };
    this.info(`You: "${lines[what]}"`, "speech");
    // Someone already on the ground has little left to try.
    const controlled = p.state === "kneel" || p.state === "prone";
    const defy = controlled ? 0 : P.fight * 0.3 + P.flee * 0.22 + (P.attitude === "hostile" ? 0.1 : 0) - (k?.felony ? 0.08 : 0);
    if (this.rng.next() < defy * 0.5 && k) return this.suspectReacts(p, k);
    p.state = what;
    p.drawn = false;
    p.walk = undefined;
    if (k) k.commands = (k.commands ?? 0) + 1;
    this.say(p, what === "backing" ? "Okay... okay, I'm coming back!" : P.attitude === "hostile" ? "This is bull...!" : "Okay! I'm doing it!");
  }

  private abandonedAction(id: string) {
    const call = this.activeCall();
    const c = this.car(call?.cars[0]);
    if (!call || !c || call.kind !== "abandoned") return;
    if (id === "ab-plate") {
      call.plateRun = true;
      const r = c.reg!;
      this.mdt.unshift({ title: `PLATE: ${r.plate}`, lines: [`${r.plate}: ${r.make}, ${c.spec.name}`, `Owner: ${r.owner}`, `Registration: ${r.status.toUpperCase()}`], flag: r.status !== "valid", at: this.time });
      this.mdt.length = Math.min(this.mdt.length, 6);
      if (r.status === "stolen") this.radio(`Dispatch: "1-Adam-12, that vehicle is listed STOLEN. Owner will be notified."`);
      return;
    }
    call.towAt = this.time + 10;
    if (call.plateRun && c.reg?.status === "stolen") this.award(60, "Stolen vehicle recovered");
    else if (!call.plateRun) this.award(-20, "Towed without running the plate");
    this.radio(`You: "Dispatch, requesting a tow for an abandoned ${c.reg?.make ?? "vehicle"}, ${describe(c.x, c.z)}." Dispatch: "10-4."`);
  }

  // ---------------------------------------------------------------- backup

  private spawnPolice(kind: CarKind, tx: number, tz: number) {
    // Start at an intersection 120–200 m away, toward the target.
    let best = -1;
    let bestD = Infinity;
    for (let n = 0; n < LINES * LINES; n++) {
      const p = nodePos(n);
      const d = Math.hypot(p.x - tx, p.z - tz);
      const score = Math.abs(d - 150);
      if (score < bestD) {
        bestD = score;
        best = n;
      }
    }
    if (best < 0) return null;
    const to = neighbours(best).sort((a, b) => {
      const pa = nodePos(a);
      const pb = nodePos(b);
      return Math.hypot(pa.x - tx, pa.z - tz) - Math.hypot(pb.x - tx, pb.z - tz);
    })[0];
    const car = makeCar(this.id("pd"), kind, 0, 0, 0, kind === "transport" ? "#e8e8e6" : "#101216");
    spawnOnLane(car, best, to, 0.1);
    car.ai = makeAi(best, to, to);
    car.ai.mode = "respond";
    car.ai.tx = tx;
    car.ai.tz = tz;
    car.ai.next = chooseNext(this.aiWorld(), car, best, to);
    car.lights = true;
    car.siren = kind !== "transport";
    const officer = this.newPed(makePerson(this.rng, { shady: 0 }), "officer", car.x, car.z, "driving");
    officer.carId = car.id;
    car.driver = officer.id;
    this.cars.push(car);
    return car;
  }

  private callBackup() {
    if (this.time < this.backupReadyAt) {
      this.info(`Backup is already on the way (available again in ${Math.ceil(this.backupReadyAt - this.time)}s).`, "info");
      return;
    }
    this.backupReadyAt = this.time + BACKUP_COOLDOWN;
    const o = this.officer;
    const car = this.spawnPolice(this.rng.next() < 0.5 ? "cruiser" : "interceptor", o.x, o.z);
    if (car) this.radio(`You: "1-Adam-12, requesting backup, ${describe(o.x, o.z)}." Dispatch: "10-4, unit en route Code 3."`);
  }

  /** Backup units chase fleeing cars, subdue violent or running suspects, then head off. */
  private stepBackup(dt: number) {
    const flee = this.cars.find((c) => c.ai?.mode === "flee");
    const threat = this.peds.find((p) => p.state === "attack") ?? this.peds.find((p) => p.state === "flee");
    for (const c of this.cars) {
      if (!c.spec.police || c === this.unit || !c.ai) continue;
      const ai = c.ai;
      if (c.kind === "transport" || c.kind === "ambulance") {
        const prisoner = this.peds.find((p) => p.pickup === c.id);
        if (prisoner) {
          ai.tx = prisoner.x;
          ai.tz = prisoner.z;
          if (Math.hypot(c.x - prisoner.x, c.z - prisoner.z) < 12) {
            if (prisoner.state !== "gone") {
              const hurt = c.kind === "ambulance";
              if (hurt && prisoner.state !== "dead") this.award(30, "Injured person taken to St. Mary's");
              prisoner.state = "gone";
              if (this.player.escort === prisoner.id) this.player.escort = null;
              this.radio(hurt ? `Medic: "We've got them. Transporting to St. Mary's."` : `Transport: "We've got your prisoner. Transporting to county."`);
            }
            ai.mode = "cruise";
            c.lights = false;
            c.siren = false;
          }
        }
        continue;
      }
      if (ai.mode !== "respond") continue;
      if (flee) {
        ai.tx = flee.x;
        ai.tz = flee.z;
        ai.chase = flee.id;
      } else if (threat) {
        ai.tx = threat.x;
        ai.tz = threat.z;
        if (Math.hypot(c.x - threat.x, c.z - threat.z) < 14) {
          ai.yieldT += dt;
          if (ai.yieldT > 2.5) {
            ai.yieldT = 0;
            threat.state = "down";
            threat.downUntil = this.time + 8;
            threat.tasedUntil = this.time + 2.6;
            threat.drawn = false;
            this.events.push({ type: "taser", x: c.x, z: c.z, tx: threat.x, tz: threat.z, hit: true });
            this.radio(`Backup: "Suspect is down! Taser deployed."`);
          }
        }
      } else {
        const o = this.officer;
        ai.tx = o.x;
        ai.tz = o.z;
        if (Math.hypot(c.x - o.x, c.z - o.z) < 25) ai.stuck = 0;
        ai.yieldT += dt;
        if (ai.yieldT > 40) {
          ai.mode = "cruise";
          c.siren = false;
          c.lights = false;
        }
      }
    }
  }

  // --------------------------------------------------------------- callouts

  private handleCallInput(input: Code3Input) {
    const offer = this.offeredCall();
    if (!offer) return;
    if (input.accept) this.acceptCall(offer);
    else if (input.decline) {
      offer.state = "declined";
      this.radio(`You: "1-Adam-12, unable." Dispatch: "10-4, another unit will take it."`);
      this.nextCallAt = this.time + 30;
    }
  }

  offerCall(kind?: CallKind) {
    const pool = CALLS.filter((c) => c.minRank <= this.rankIdx);
    let def = kind ? CALLS.find((c) => c.kind === kind)! : pool[0];
    if (!kind) {
      const total = pool.reduce((s, c) => s + c.weight, 0);
      let r = this.rng.next() * total;
      for (const c of pool) {
        r -= c.weight;
        if (r <= 0) {
          def = c;
          break;
        }
      }
    }
    const place = this.placeFor(def.kind);
    const call: Call = {
      id: this.id("call"),
      kind: def.kind,
      title: def.title,
      code: def.code,
      where: place ? (place.name === describe(place.x, place.z) ? place.name : `${place.name}, ${describe(place.x, place.z)}`) : "",
      x: place?.x ?? 0,
      z: place?.z ?? 0,
      state: "offered",
      offeredAt: this.time,
      acceptedAt: 0,
      suspects: [],
      victims: [],
      cars: [],
      trackAt: 0,
      points: def.points,
      note: "",
    };
    this.setupCall(call, place);
    this.calls.push(call);
    this.radio(`Dispatch: "Any unit, ${def.title.toLowerCase()}, ${call.where}. ${call.note} Respond Code ${def.code}."`);
    return call;
  }

  private placeFor(kind: CallKind): Place | { name: string; x: number; z: number } | null {
    const o = this.officer;
    const pick = (kinds: Place["kind"][]) => {
      const list = this.city.places.filter((p) => kinds.includes(p.kind) && Math.hypot(p.x - o.x, p.z - o.z) > 90);
      return list.length ? this.rng.pick(list) : this.rng.pick(this.city.places.filter((p) => kinds.includes(p.kind)));
    };
    switch (kind) {
      case "robbery":
      case "shoplift":
        return pick(["store", "gas"]);
      case "burglary":
        return pick(["house"]);
      case "fight":
      case "drunk":
        return pick(["store", "park", "gas"]);
      case "bank":
        return pick(["bank"]);
      case "domestic":
        return pick(["house"]);
      case "suspicious":
        return pick(["park", "store", "house"]);
      case "vandalism":
        return pick(["store", "park", "house"]);
      case "noise":
        return pick(["house"]);
      default: {
        // A street corner somewhere else in town.
        for (let k = 0; k < 30; k++) {
          const n = this.rng.int(0, LINES * LINES - 1);
          const p = nodePos(n);
          const d = Math.hypot(p.x - o.x, p.z - o.z);
          if (d > 140 && d < 380) return { name: describe(p.x, p.z), x: p.x + 4.5, z: p.z + 4.5 };
        }
        const p = nodePos(nodeId(3, 3));
        return { name: describe(p.x, p.z), x: p.x, z: p.z };
      }
    }
  }

  private setupCall(call: Call, place: { x: number; z: number } | null) {
    if (!place) return;
    const P = (o: PersonOpts, role: Role, x: number, z: number, state: PedState = "stand") => {
      const p = this.newPed(makePerson(this.rng, o), role, x, z, state);
      p.call = call.id;
      return p;
    };
    switch (call.kind) {
      case "robbery":
      case "bank": {
        const n = call.kind === "bank" ? 3 : this.rng.int(1, 2);
        for (let i = 0; i < n; i++) {
          const s = P({ shady: 0.9, armed: this.rng.next() < 0.75 }, "suspect", place.x + (i - 1) * 1.5, place.z + 1);
          call.suspects.push(s.id);
        }
        call.note = `${n} suspect${n > 1 ? "s" : ""}, ${call.kind === "bank" ? "masked, " : ""}possibly armed.`;
        break;
      }
      case "shots": {
        const s = P({ shady: 0.9, armed: true, hostile: true }, "suspect", place.x, place.z);
        call.suspects.push(s.id);
        call.note = "Caller reports a man firing a handgun in the street.";
        break;
      }
      case "burglary": {
        const s = P({ shady: 0.85 }, "suspect", place.x + 2, place.z + 4);
        call.suspects.push(s.id);
        call.note = "Homeowner hears someone breaking in through the back.";
        break;
      }
      case "fight": {
        const a = P({ shady: 0.6 }, "suspect", place.x - 0.5, place.z);
        const b = P({ shady: 0.6 }, "suspect", place.x + 0.5, place.z);
        a.state = b.state = "fight";
        a.foe = b.id;
        b.foe = a.id;
        call.suspects.push(a.id, b.id);
        call.note = "Two males fighting on the sidewalk, crowd gathering.";
        break;
      }
      case "drunk": {
        const s = P({ shady: 0.3, drunk: true }, "suspect", place.x, place.z);
        s.person.bac = Math.max(s.person.bac, 0.16);
        s.person.attitude = "rude";
        call.suspects.push(s.id);
        call.note = "Intoxicated male yelling at passers-by.";
        break;
      }
      case "shoplift": {
        const s = P({ shady: 0.7 }, "suspect", place.x, place.z + 1);
        call.suspects.push(s.id);
        call.note = "Clerk reports a male took merchandise without paying. Last seen outside.";
        break;
      }
      case "hitrun": {
        const v = P({ shady: 0 }, "victim", place.x, place.z);
        v.state = "down";
        v.downUntil = 1e12;
        v.hp = 40;
        call.victims.push(v.id);
        const car = this.spawnTraffic(false, { person: { shady: 0.75 }, near: { minD: 60, maxD: 200 } });
        if (car) {
          car.health = 55;
          car.ai!.reckless = true;
          car.ai!.cruise = 20;
          car.seen.add("reckless driving");
          call.cars.push(car.id);
          call.suspects.push(car.driver!);
          this.addOffence(this.ped(car.driver)!, "evading police");
          call.note = `Pedestrian struck. Suspect vehicle: ${COLOR_NAMES[car.color] ?? "dark"} ${car.reg?.make}, front damage, plate ${car.reg?.plate}.`;
        }
        break;
      }
      case "suspicious": {
        const s = P({ shady: 0.55 }, "suspect", place.x, place.z);
        call.suspects.push(s.id);
        call.note = "Caller reports someone looking into car windows.";
        break;
      }
      case "domestic": {
        const a = P({ shady: 0.6 }, "suspect", place.x - 1, place.z);
        a.aggressor = true;
        a.person.attitude = this.rng.pick(["rude", "hostile"] as const);
        a.person.fight = Math.max(a.person.fight, 0.25);
        const v = P({ shady: 0 }, "victim", place.x + 1, place.z);
        v.person.attitude = "polite";
        call.suspects.push(a.id);
        call.victims.push(v.id);
        call.note = "Neighbours report screaming and banging.";
        break;
      }
      case "collision": {
        // Two cars stopped at the corner, drivers out.
        for (let i = 0; i < 2; i++) {
          const car = makeCar(this.id("car"), this.rng.pick(CIVILIAN_KINDS), place.x + i * 5.5, place.z + 1.5, this.rng.range(-0.6, 0.6), this.rng.pick(CAR_COLORS));
          car.health = this.rng.int(25, 60);
          car.ai = makeAi(0, 1, 2);
          car.ai.mode = "parked";
          const d = P({ shady: 0.2, drunk: i === 0 && this.rng.next() < 0.45 }, "driver", car.x + 2.5, car.z + 2.5);
          d.carId = car.id;
          car.reg = makeRegistration(this.rng, d.person);
          this.cars.push(car);
          call.cars.push(car.id);
          call.suspects.push(d.id);
        }
        call.note = "Two vehicles involved, unknown injuries.";
        break;
      }
      case "dui":
      case "stolen": {
        const car = this.spawnTraffic(false, {
          person: call.kind === "dui" ? { shady: 0.3, drunk: true } : { shady: 0.8 },
          stolen: call.kind === "stolen",
          near: { minD: 150, maxD: 330 },
        });
        if (car) {
          if (call.kind === "dui" && car.ai) {
            car.ai.drunk = true;
            car.ai.reckless = true;
          }
          call.cars.push(car.id);
          call.track = car.id;
          call.suspects.push(car.driver!);
          call.x = car.x;
          call.z = car.z;
          call.where = describe(car.x, car.z);
          call.note = `${COLOR_NAMES[car.color] ?? "dark"} ${car.reg?.make} (${car.spec.name.toLowerCase()}), plate ${car.reg?.plate}.`;
        }
        break;
      }
      case "assist": {
        // Another unit, lights on, holding one or two combative subjects at gunpoint.
        const car = makeCar(this.id("pd"), "cruiser", place.x - 4, place.z, this.rng.range(-0.3, 0.3), "#101216");
        car.ai = makeAi(0, 1, 2);
        car.ai.mode = "parked";
        car.lights = true;
        car.reg = makeRegistration(this.rng, makePerson(this.rng));
        this.cars.push(car);
        call.cars.push(car.id);
        const cop = P({ shady: 0 }, "officer", place.x - 1.5, place.z + 1.2);
        cop.drawn = true;
        cop.carId = car.id;
        call.victims.push(cop.id);
        const n = this.rng.int(1, 2);
        for (let i = 0; i < n; i++) {
          const sp = P({ shady: 0.85, armed: this.rng.next() < 0.3, hostile: this.rng.next() < 0.45 }, "suspect", place.x + 3.5 + i * 1.3, place.z + 1.5 - i);
          call.suspects.push(sp.id);
        }
        const s0 = this.ped(call.suspects[0])!;
        cop.h = Math.atan2(s0.z - cop.z, s0.x - cop.x);
        call.note = `Unit 2-Adam-7 requesting assistance, ${n} combative subject${n > 1 ? "s" : ""}.`;
        break;
      }
      case "vandalism": {
        const pl = place as Partial<Place>;
        const s = P({ shady: 0.7 }, "suspect", place.x, place.z + 0.6);
        s.task = "spray";
        s.h = Math.atan2(-(pl.fz ?? -1), -(pl.fx ?? 0));
        call.suspects.push(s.id);
        call.note = "Caller reports someone spray-painting the building.";
        break;
      }
      case "noise": {
        const s = P({ shady: 0.35, drunk: this.rng.next() < 0.4 }, "civilian", place.x, place.z + 0.6);
        s.task = "music";
        call.suspects.push(s.id);
        call.note = "Neighbours report loud music for hours.";
        break;
      }
      case "fugitive": {
        let block = blockAt(this.city, place.x + 8, place.z + 8);
        if (block < 0) block = this.rng.int(0, this.city.blocks.length - 1);
        const t = this.rng.range(0, 200);
        const pt = this.ringPoint(block, t);
        const s = P({ shady: 0.95 }, "suspect", pt.x, pt.z, "walk");
        s.walk = { block, t, dir: this.rng.next() < 0.5 ? 1 : -1 };
        const tops: [string, string][] = [["#b3202a", "red"], ["#e0b400", "yellow"], ["#1f7a3a", "green"], ["#e06a10", "orange"], ["#f2f2f2", "white"]];
        const [col, colName] = this.rng.pick(tops);
        s.shirt = col;
        s.pants = "#1f1f22";
        s.person.warrants = ["Escaped fugitive: parole absconder", ...s.person.warrants].slice(0, 2);
        s.person.flee = Math.max(s.person.flee, 0.6);
        call.suspects.push(s.id);
        call.trackPed = s.id;
        call.x = pt.x;
        call.z = pt.z;
        call.note = `Subject about ${s.person.age}, wearing a ${colName} top and dark pants. Considered dangerous, do not let them run.`;
        break;
      }
      case "abandoned": {
        const spot = this.randomLane(140, 380);
        if (!spot) break;
        const car = makeCar(this.id("car"), this.rng.pick(CIVILIAN_KINDS), 0, 0, 0, this.rng.pick(CAR_COLORS));
        spawnOnLane(car, spot.a, spot.b, spot.t);
        // Half up on the kerb: out of the traffic lane.
        const r = right(car.h);
        car.x += r.x * 2.45;
        car.z += r.z * 2.45;
        car.reg = makeRegistration(this.rng, makePerson(this.rng, { shady: 0.5 }), { stolen: this.rng.next() < 0.45, shady: 0.6 });
        car.health = this.rng.int(35, 85);
        this.cars.push(car);
        call.cars.push(car.id);
        call.x = car.x;
        call.z = car.z;
        call.where = describe(car.x, car.z);
        call.note = `${COLOR_NAMES[car.color] ?? "Dark"} ${car.reg.make}, parked for days, a window smashed.`;
        break;
      }
      case "roadrage": {
        const spot = this.randomLane(140, 380);
        if (!spot) break;
        const drivers: Ped[] = [];
        for (let i = 0; i < 2; i++) {
          const car = makeCar(this.id("car"), this.rng.pick(CIVILIAN_KINDS), 0, 0, 0, this.rng.pick(CAR_COLORS));
          spawnOnLane(car, spot.a, spot.b, Math.min(0.95, spot.t + i * 0.09));
          const r = right(car.h);
          car.x += r.x * 2.45;
          car.z += r.z * 2.45;
          car.ai = makeAi(spot.a, spot.b, spot.b);
          car.ai.mode = "parked";
          const d = P({ shady: 0.45 }, "driver", car.x - r.x * 1.8, car.z - r.z * 1.8);
          d.carId = car.id;
          car.reg = makeRegistration(this.rng, d.person);
          this.cars.push(car);
          call.cars.push(car.id);
          call.suspects.push(d.id);
          drivers.push(d);
        }
        const [a, b] = drivers;
        a.state = b.state = "fight";
        a.foe = b.id;
        b.foe = a.id;
        a.aggressor = true;
        a.person.fight = Math.max(a.person.fight, 0.3);
        call.x = (a.x + b.x) / 2;
        call.z = (a.z + b.z) / 2;
        call.where = describe(call.x, call.z);
        call.note = "Two drivers out of their cars, punches thrown.";
        break;
      }
      case "pursuit":
      case "race": {
        const n = call.kind === "race" ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const car = this.spawnTraffic(false, { kind: call.kind === "race" ? "sports" : this.rng.pick(["sedan", "suv", "sports"] as const), person: { shady: 0.85 }, near: { minD: 160, maxD: 320 } });
          if (!car) continue;
          car.ai!.cruise = 26;
          car.ai!.reckless = true;
          call.cars.push(car.id);
          call.suspects.push(car.driver!);
          if (!call.track) call.track = car.id;
          if (call.kind === "pursuit") this.startPursuitQuiet(car);
        }
        const c = this.car(call.track);
        if (c) {
          call.x = c.x;
          call.z = c.z;
          call.where = describe(c.x, c.z);
        }
        call.note = call.kind === "race" ? "Two sports cars racing through intersections." : "Suspect vehicle fleeing another unit.";
        break;
      }
    }
  }

  private startPursuitQuiet(c: Car) {
    c.ai!.mode = "flee";
    const d = this.ped(c.driver);
    if (d) this.addOffence(d, "evading police");
    // Another unit is already behind it.
    const pd = this.spawnPolice("cruiser", c.x, c.z);
    if (pd?.ai) pd.ai.mode = "respond";
  }

  acceptCall(call: Call) {
    call.state = "enroute";
    call.acceptedAt = this.time;
    this.radio(`You: "1-Adam-12, show me responding." Dispatch: "10-4, 1-Adam-12."`);
  }

  private stepCalls(dt: number) {
    this.stepBackup(dt);
    const tc = this.deploy.find((d) => d.kind === "traffic");
    if (tc && (this.player.inCar || this.distToOfficer(tc.x, tc.z) > 30)) {
      this.deploy = this.deploy.filter((d) => d !== tc);
      this.info("You left the intersection: signals back in control.", "info");
    }
    if (this.spikes && this.time > this.spikes.until) this.spikes = null;
    this.stepAir(dt);
    for (const k of this.contacts) {
      if (k.k9At === undefined || this.time < k.k9At || k.pc.has("k9-done")) continue;
      k.pc.add("k9-done");
      const p = this.ped(k.ped);
      if (p?.person.drugs) {
        k.pc.add("odor");
        k.pc.add("K9 alert");
        this.radio(`K9-3: "Dog's alerting on the driver's door. You've got probable cause."`);
      } else this.radio(`K9-3: "No alert on the vehicle."`);
    }
    // Pursuit updates on the radio.
    const fleeing = this.cars.find((c) => c.ai?.mode === "flee");
    if (fleeing && this.time >= this.pursuitReportAt) {
      this.pursuitReportAt = this.time + 12;
      const who = this.air ? "Air-1" : "You";
      this.radio(`${who}: "Suspect vehicle now at ${describe(fleeing.x, fleeing.z)}, ${Math.round(Math.abs(speedOf(fleeing)) * 2.237)} mph."`);
    }
    this.stepIncidents();
    const offered = this.offeredCall();
    if (offered && this.time - offered.offeredAt > this.offerSeconds) {
      offered.state = "expired";
      this.cleanupCall(offered);
      this.radio(`Dispatch: "Disregard, another unit is handling."`);
      this.nextCallAt = this.time + 20;
    }
    if (!offered && !this.activeCall() && this.time >= this.nextCallAt && this.time < this.shiftSeconds - Math.min(45, this.shiftSeconds * 0.3)) this.offerCall();

    const call = this.activeCall();
    if (!call) return;
    const fug = this.ped(call.trackPed);
    if (fug && fug.state !== "gone") {
      if (this.time - call.trackAt > 15) {
        // Caller updates: a rough "last seen" position.
        call.trackAt = this.time;
        call.x = fug.x + this.rng.range(-8, 8);
        call.z = fug.z + this.rng.range(-8, 8);
      }
      if (!fug.spooked && fug.state === "walk" && this.distToOfficer(fug.x, fug.z) < 9) {
        fug.spooked = true;
        if (this.rng.next() < fug.person.flee * 0.8) {
          fug.state = "flee";
          fug.walk = undefined;
          this.addOffence(fug, "outstanding warrant");
          this.say(fug, "*sees you and bolts*");
          this.radio(`You: "1-Adam-12, subject is running! Foot pursuit, ${describe(fug.x, fug.z)}!"`);
        }
      }
    }
    const tracked = this.car(call.track);
    if (tracked && (this.time - call.trackAt > 6 || tracked.ai?.mode === "flee")) {
      call.trackAt = this.time;
      call.x = tracked.x;
      call.z = tracked.z;
    }
    const d = this.distToOfficer(call.x, call.z);
    if (call.state === "enroute" && d < 45) {
      call.state = "onscene";
      const secs = this.time - call.acceptedAt;
      const bonus = Math.max(0, Math.round(80 - secs * 0.8));
      this.radio(`You: "1-Adam-12, on scene."`);
      if (bonus > 0) this.award(bonus, `Response time ${Math.round(secs)}s`);
      this.triggerCall(call);
    }
    if (call.towAt && this.time >= call.towAt) {
      for (const id of call.cars) {
        const c = this.car(id);
        if (c && c.id !== this.unit.id) this.cars.splice(this.cars.indexOf(c), 1);
      }
      call.cars = [];
      call.towAt = undefined;
      this.finishCall(call, true);
      return;
    }
    if (call.state === "onscene" || call.state === "enroute") this.checkCall(call);
  }

  private triggerCall(call: Call) {
    for (const id of call.suspects) {
      const p = this.ped(id);
      if (!p) continue;
      if (call.kind === "robbery" || call.kind === "bank") {
        const r = this.rng.next();
        if (r < 0.4) p.state = "flee";
        else if (r < 0.75 && p.person.armed) {
          p.state = "attack";
          p.attackAt = this.time + 1.5;
        } else p.state = "handsup";
        this.addOffence(p, "armed robbery");
      } else if (call.kind === "burglary") {
        p.state = this.rng.next() < 0.55 ? "flee" : "handsup";
        this.addOffence(p, "burglary");
      } else if (call.kind === "shoplift") {
        if (this.rng.next() < 0.65) p.state = "flee";
        this.addOffence(p, "shoplifting");
      } else if (call.kind === "shots") {
        p.state = this.rng.next() < 0.7 ? "attack" : "flee";
        p.attackAt = this.time + 1.2;
        this.addOffence(p, "discharging a firearm");
      } else if (call.kind === "domestic" && p.aggressor && this.rng.next() < 0.2) {
        p.state = "flee";
      } else if (call.kind === "assist") {
        const r = this.rng.next();
        p.state = r < 0.45 ? "attack" : r < 0.72 ? "flee" : "handsup";
        p.attackAt = this.time + 1.4;
        this.addOffence(p, "assault on an officer");
        this.addOffence(p, "resisting arrest");
      } else if (call.kind === "vandalism") {
        this.addOffence(p, "vandalism");
        if (this.rng.next() < 0.55) {
          p.state = "flee";
          p.task = undefined;
        } else this.say(p, "It's art, man! It's just paint!");
      } else if (call.kind === "roadrage" && p.aggressor) {
        this.addOffence(p, "assault");
      }
    }
  }

  private handled(id: string, call: Call) {
    const p = this.ped(id);
    if (!p) return true;
    if (p.state === "cuffed" || p.state === "incar" || p.state === "gone" || p.state === "escort") return true;
    if (p.state === "dead") return true;
    const k = this.contactFor(id);
    // Releasing is fine for the calls where nobody has to go to jail.
    if (k?.resolved && (call.kind === "suspicious" || call.kind === "dui" || call.kind === "collision" || call.kind === "fight" || call.kind === "drunk" || call.kind === "noise" || call.kind === "roadrage")) return true;
    if (k?.resolved === "released" && call.kind === "domestic" && !p.aggressor) return true;
    return false;
  }

  private checkCall(call: Call) {
    if (call.kind === "collision" || call.kind === "abandoned") return; // needs the tow
    if (!call.suspects.length) return this.finishCall(call, false);
    if (call.suspects.every((id) => this.handled(id, call))) {
      const custody = call.suspects.some((id) => {
        const s = this.ped(id)?.state;
        return s === "cuffed" || s === "incar" || s === "escort" || (s === "gone" && !this.contacts.some((k) => k.ped === id && k.resolved === "fled"));
      });
      const escaped = call.suspects.every((id) => this.contacts.some((k) => k.ped === id && k.resolved === "fled") && this.ped(id)?.state === "gone");
      if (escaped) return this.finishCall(call, false);
      if (call.kind === "domestic" && !custody) return this.finishCall(call, false);
      this.finishCall(call, custody || call.kind === "suspicious" || call.kind === "dui" || call.kind === "noise" || call.kind === "roadrage");
    }
  }

  private finishCall(call: Call, ok: boolean) {
    call.state = ok ? "done" : "failed";
    this.nextCallAt = this.time + this.rng.range(25, 55);
    if (call.kind === "assist")
      for (const id of call.victims) {
        // The other unit holsters and clears.
        const cop = this.ped(id);
        const car = this.car(cop?.carId);
        if (!cop || !car?.ai) continue;
        cop.drawn = false;
        cop.state = "driving";
        car.driver = cop.id;
        car.ai.mode = "cruise";
        car.lights = false;
        if (ok) this.radio(`2-Adam-7: "Thanks for the assist, 1-Adam-12."`);
      }
    if (ok) {
      this.stats.calls++;
      this.award(call.points, `Call closed: ${call.title}`);
      this.fileable("incident", `incident report: ${call.title}`, [`Location: ${call.where}`, `Response: ${Math.round(call.acceptedAt ? this.time - call.acceptedAt : 0)}s from dispatch`, `Suspects: ${call.suspects.length}`, "Outcome: resolved"]);
      this.radio(`You: "1-Adam-12, Code 4, scene is secure." Dispatch: "10-4, 1-Adam-12."`);
    } else {
      this.award(-40, `Call not resolved: ${call.title}`);
      this.radio(`Dispatch: "10-4, clearing the call."`);
    }
    this.cleanupCall(call);
  }

  private cleanupCall(call: Call) {
    // Unused call entities that never got involved drift away with the population.
    for (const id of [...call.suspects, ...call.victims]) {
      const p = this.ped(id);
      if (p && (p.state === "stand" || p.state === "talk") && call.state !== "done") p.state = "gone";
    }
    if (call.state === "expired")
      for (const id of call.cars) {
        const c = this.car(id);
        if (c && c.ai?.mode !== "flee") this.cars.splice(this.cars.indexOf(c), 1);
      }
  }

  // ------------------------------------------------------------ population

  private population() {
    // Remove what's far away and unimportant, top back up.
    const o = this.officer;
    const busy = new Set<string>();
    for (const c of this.calls) if (c.state === "enroute" || c.state === "onscene" || c.state === "offered") [...c.cars, ...c.suspects, ...c.victims].forEach((x) => busy.add(x));
    for (const k of this.contacts) if (!k.resolved) {
      busy.add(k.ped);
      if (k.car) busy.add(k.car);
    }
    if (this.stopCar) busy.add(this.stopCar);
    this.cars = this.cars.filter((c) => {
      if (c.towAt !== undefined && this.time >= c.towAt && c !== this.unit) return false;
      if (c === this.unit || busy.has(c.id) || c.back.length || (c.fixture && c.towAt === undefined)) return true;
      if (c.ai?.mode === "flee") return true;
      const d = Math.hypot(c.x - o.x, c.z - o.z);
      if (d > 300 || (c.spec.police && c.ai?.mode === "cruise" && d > 140) || (c.health <= 0 && d > 90)) {
        const dr = this.ped(c.driver);
        if (dr && dr.state === "driving") dr.state = "gone";
        return false;
      }
      return true;
    });
    this.peds = this.peds.filter((p) => {
      if (p.state === "gone") return false;
      if (busy.has(p.id) || p.state === "incar" || p.state === "cuffed" || p.state === "escort") return true;
      if (p.state === "driving") return !!this.car(p.carId);
      const d = Math.hypot(p.x - o.x, p.z - o.z);
      return d < 200 || p.state === "flee";
    });
    const traffic = this.cars.filter((c) => c.ai && !c.spec.police && c.ai.mode !== "parked").length;
    if (traffic < this.trafficN) this.spawnTraffic(false);
    const walkers = this.peds.filter((p) => p.state === "walk").length;
    if (walkers < this.pedN) this.spawnWalker(false);
    if (this.cars.filter((c) => c.fixture).length < 10) this.spawnParked(false);
    // Pursuits end when the car is wrecked or boxed in.
    for (const c of this.cars) {
      if (c.ai?.mode !== "flee") continue;
      const v = Math.abs(speedOf(c));
      c.ai.yieldT = v < 1.2 ? c.ai.yieldT + 1 / 60 : 0;
      const d = Math.hypot(c.x - o.x, c.z - o.z);
      if (c.health <= 0 || (c.ai.yieldT > 3 && d < 70)) this.endPursuit(c);
      else if (d > 320 && this.air?.target !== c.id) {
        c.ai.weave += 1 / 60;
        if (c.ai.weave > 20) {
          const dr = this.ped(c.driver);
          if (dr) {
            dr.state = "gone";
            const k = this.contactFor(dr.id);
            if (k) k.resolved = "fled";
            else {
              const kk = this.newContact(dr, c, "Pursuit");
              kk.resolved = "fled";
            }
          }
          this.cars.splice(this.cars.indexOf(c), 1);
          this.award(-75, "Lost the suspect vehicle");
          this.radio(`Dispatch: "All units, suspect vehicle lost. Resume patrol."`);
          break;
        }
      } else c.ai.weave = 0;
    }
  }

  private endPursuit(c: Car) {
    if (!c.ai) return;
    c.ai.mode = "parked";
    c.lights = false;
    this.award(150, "Pursuit ended");
    const d = this.ped(c.driver);
    if (!d) return;
    const r = right(c.h);
    d.x = c.x - r.x * 1.7;
    d.z = c.z - r.z * 1.7;
    c.driver = null;
    d.role = "suspect";
    if (this.rng.next() < d.person.flee * 0.7) {
      d.state = "flee";
      this.radio(`You: "Suspect bailed! Foot pursuit!"`);
    } else if (d.person.armed && this.rng.next() < d.person.fight) {
      d.state = "attack";
      d.attackAt = this.time + 1;
    } else {
      d.state = "handsup";
      this.say(d, "Alright! Alright! I give up!");
    }
    this.addOffence(d, "evading police");
  }

  // ------------------------------------------------------------------ misc

  /** Waypoint for the GPS: active call, the station with prisoners aboard, or nothing. */
  waypoint(): { x: number; z: number; label: string } | null {
    const call = this.activeCall();
    if (call) return { x: call.x, z: call.z, label: call.title };
    if (this.unit.back.length) return { x: this.city.station.x, z: this.city.station.z, label: "Station: book prisoners" };
    return null;
  }

  /** Is the unit near a red light facing it? (for the HUD) */
  blockOf(x: number, z: number) {
    return blockAt(this.city, x, z);
  }

  nearestNode(x: number, z: number) {
    return nearestNode(x, z);
  }
}
