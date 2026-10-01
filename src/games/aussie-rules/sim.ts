import { createRng, type Rng } from "../engine/rng";

/**
 * Screamer: Aussie Rules. The match simulation: an 18-a-side game of
 * Australian rules football on an oval, with the real flow of play: centre
 * bounces, kicks, handballs, bounces every 15 m, marks (15 m kicks, taken on
 * the full), set shots and free kicks, tackles with prior opportunity and
 * holding the ball, ball-ups, throw-ins, out on the full, goals (6) and
 * behinds (1), kick-ins, four quarters with the siren (and a kick after it).
 *
 * Pure logic, no DOM: the renderer, HUD and audio read the state and drain
 * `events`. World frame: x along the ground (goals at ±GOAL_X), z across it,
 * y up; a heading h faces (cos h, sin h) in x/z.
 */

// ------------------------------------------------------------------ ground

/** Half length / half width of the oval (a 160 × 128 m ground). */
export const A = 80;
export const B = 64;
export const GOAL_HALF = 3.2;
export const BEHIND_HALF = 9.6;
/** The goal line: the ends of the oval are flat across the goal face. */
export const GOAL_X = A * Math.sqrt(1 - (BEHIND_HALF / B) ** 2);
export const GOAL_SQUARE = 9;
export const CENTRE_SQUARE = 25;
export const ARC = 50;
export const G = 9.8;
const BALL_R = 0.1;
const DRAG = 0.0032;

/** Outside the boundary line (flat across the goal face, an ellipse elsewhere). */
export function outside(x: number, z: number, pad = 0) {
  if (Math.abs(z) < BEHIND_HALF) return Math.abs(x) > GOAL_X + pad;
  return (x / (A + pad)) ** 2 + (z / (B + pad)) ** 2 > 1;
}

/** The nearest point on the boundary line to (x, z), and the inward normal there. */
export function boundaryAt(x: number, z: number) {
  if (Math.abs(z) < BEHIND_HALF) return { x: Math.sign(x) * GOAL_X, z, nx: -Math.sign(x), nz: 0 };
  const a = Math.atan2(z / B, x / A);
  const bx = A * Math.cos(a);
  const bz = B * Math.sin(a);
  const nx = -bx / (A * A);
  const nz = -bz / (B * B);
  const l = Math.hypot(nx, nz);
  return { x: bx, z: bz, nx: nx / l, nz: nz / l };
}

// ------------------------------------------------------------------ clubs

export type Team = 0 | 1;
export type Difficulty = "easy" | "pro" | "legend";

export interface Club {
  id: string;
  name: string;
  short: string;
  guernsey: string;
  hoop: string;
  shorts: string;
  number: string;
}

export const HOME: Club = { id: "hawks", name: "Harbour Hawks", short: "HAR", guernsey: "#a3122c", hoop: "#f2c230", shorts: "#15171d", number: "#ffffff" };
export const RIVALS: Club[] = [
  { id: "sharks", name: "Coastline Sharks", short: "COA", guernsey: "#0d7580", hoop: "#101418", shorts: "#f2f2f2", number: "#ffffff" },
  { id: "rams", name: "Ironbark Rams", short: "IRO", guernsey: "#1a2d68", hoop: "#ececec", shorts: "#1a2d68", number: "#ffffff" },
  { id: "kings", name: "Riverton Kings", short: "RIV", guernsey: "#47206f", hoop: "#e0b422", shorts: "#f2f2f2", number: "#e0b422" },
];

/** Positions: x as a fraction of A toward the team's attacking goal, z of B. */
export const POSITIONS = [
  { id: "FB", name: "Full back", x: -0.8, z: 0 },
  { id: "BP", name: "Back pocket", x: -0.7, z: -0.36 },
  { id: "BP", name: "Back pocket", x: -0.7, z: 0.36 },
  { id: "CHB", name: "Centre half-back", x: -0.42, z: 0 },
  { id: "HBF", name: "Half-back flank", x: -0.4, z: -0.5 },
  { id: "HBF", name: "Half-back flank", x: -0.4, z: 0.5 },
  { id: "C", name: "Centre", x: 0.02, z: 0.04 },
  { id: "W", name: "Wing", x: 0, z: -0.7 },
  { id: "W", name: "Wing", x: 0, z: 0.7 },
  { id: "CHF", name: "Centre half-forward", x: 0.42, z: 0 },
  { id: "HFF", name: "Half-forward flank", x: 0.4, z: -0.5 },
  { id: "HFF", name: "Half-forward flank", x: 0.4, z: 0.5 },
  { id: "FF", name: "Full forward", x: 0.8, z: 0 },
  { id: "FP", name: "Forward pocket", x: 0.7, z: -0.36 },
  { id: "FP", name: "Forward pocket", x: 0.7, z: 0.36 },
  { id: "RUC", name: "Ruck", x: 0.01, z: 0 },
  { id: "RR", name: "Ruck-rover", x: -0.05, z: -0.1 },
  { id: "ROV", name: "Rover", x: 0.05, z: 0.1 },
] as const;
/** Each position's direct opponent (full back on full forward, and so on). */
export const MATCHUP = [12, 14, 13, 9, 11, 10, 6, 8, 7, 3, 5, 4, 0, 2, 1, 15, 17, 16];
const RUCK = 15;
const MIDS = [6, 15, 16, 17];

const SURNAMES = [
  "Mitchell", "O'Rourke", "Kennedy", "Tran", "Walsh", "Papadopoulos", "Riley", "Nguyen", "Brennan", "Fitzgerald", "Dawson", "Kelly",
  "Harrington", "Costa", "McKay", "Ashby", "Sullivan", "Varga", "Whitlock", "Nash", "Cartwright", "Moloney", "Petrakis", "Quinlan",
  "Tuohy", "Delaney", "Hughes", "Anderson", "Barlow", "Cassidy", "Doyle", "Ellison", "Flanagan", "Gleeson", "Hayward", "Irving",
];

// ------------------------------------------------------------------ state

export type ActKind = "kick" | "handball" | "mark" | "tackle" | "bounce" | "ruck" | "spoil";

export interface Act {
  kind: ActKind;
  t: number;
  dur: number;
  /** Kicks and handballs: when the ball leaves the hand / boot. */
  release?: number;
  done?: boolean;
  aim?: number;
  power?: number;
  target?: number;
  /** A shot at goal. */
  shot?: boolean;
}

export interface Player {
  id: number;
  team: Team;
  role: number;
  name: string;
  number: number;
  x: number;
  z: number;
  /** Height off the ground (leaping). */
  y: number;
  vy: number;
  vx: number;
  vz: number;
  h: number;
  /** Walk-cycle phase (metres run). */
  step: number;
  speed: number;
  stamina: number;
  skill: { pace: number; kick: number; mark: number; tackle: number; ruck: number };
  act: Act | null;
  /** Seconds left on the ground after a tackle / fall. */
  down: number;
  /** Climbing a pack on this leap (a screamer). */
  climb: boolean;
  /** AI: where to go, and how hard. */
  tx: number;
  tz: number;
  urgency: number;
  think: number;
  /** Holding the ball: seconds held and metres run since the last bounce. */
  held: number;
  run: number;
  runTotal: number;
  /** Seconds this player can't touch the ball (just spilled / disposed). */
  noTouch: number;
  /** A human leap was pressed recently (timing bonus). */
  leapAt: number;
  celebrate: number;
}

export type BallState = "held" | "air" | "ground" | "dead";

export interface KickInfo {
  by: number;
  team: Team;
  fromX: number;
  fromZ: number;
  isKick: boolean;
  touched: boolean;
  bounced: boolean;
  target: number;
  /** Markable (kicked, not touched since). */
  markable: boolean;
  shot: boolean;
  afterSiren: boolean;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  state: BallState;
  holder: number;
  /** The last disposal (null after a bounce-down / throw-in). */
  kick: KickInfo | null;
  /** A ruck contest ball (centre bounce, ball-up, throw-in). */
  ruck: boolean;
  lastTeam: Team;
  /** Visual tumble. */
  spin: number;
  spinRate: number;
}

export interface Official {
  x: number;
  z: number;
  h: number;
  speed: number;
  step: number;
  signal: "" | "goal" | "behind" | "bounce" | "free";
  signalT: number;
}

export type Phase = "bounce" | "play" | "set" | "stoppage" | "goal" | "break" | "over";

export interface SetShot {
  id: number;
  kind: "mark" | "free" | "kickin";
  /** The mark (where the man on the mark stands). */
  x: number;
  z: number;
  aim: number;
  t: number;
  clock: number;
  /** The man on the mark. */
  onMark: number;
  reason: string;
}

export interface Stoppage {
  kind: "centre" | "ballup" | "throwin";
  x: number;
  z: number;
  nx: number;
  nz: number;
  t: number;
  launched: boolean;
}

export interface Score {
  goals: number;
  behinds: number;
}
export const points = (s: Score) => s.goals * 6 + s.behinds;

export interface FootyInput {
  /** Desired run direction in world x/z (length 0–1). */
  mx: number;
  mz: number;
  sprint: boolean;
  /** Kick button held (charging) this tick. */
  kick: boolean;
  /** Edges. */
  handball: boolean;
  leap: boolean;
  tackle: boolean;
  switchPlayer: boolean;
}
export const NO_INPUT: FootyInput = { mx: 0, mz: 0, sprint: false, kick: false, handball: false, leap: false, tackle: false, switchPlayer: false };

export type SimEvent =
  | { kind: "kick"; id: number; power: number; shot: boolean }
  | { kind: "handball"; id: number }
  | { kind: "mark"; id: number; screamer: boolean; contested: boolean; team: Team }
  | { kind: "spill"; id: number }
  | { kind: "spoil"; id: number }
  | { kind: "goal"; team: Team; by: number; dist: number; afterSiren: boolean }
  | { kind: "behind"; team: Team; by: number; rushed: boolean; post: boolean }
  | { kind: "tackle"; id: number; on: number; team: Team }
  | { kind: "brokenTackle"; id: number }
  | { kind: "free"; id: number; team: Team; reason: string }
  | { kind: "playon" }
  | { kind: "whistle" }
  | { kind: "siren"; quarter: number }
  | { kind: "bounceBall"; x: number; z: number; hard: number }
  | { kind: "runBounce"; id: number }
  | { kind: "centre" }
  | { kind: "ballup" }
  | { kind: "throwin" }
  | { kind: "out"; full: boolean }
  | { kind: "hitout"; id: number; team: Team }
  | { kind: "gather"; id: number; team: Team }
  | { kind: "cut" }
  | { kind: "quarter"; quarter: number }
  | { kind: "over" };

export interface TeamStats {
  kicks: number;
  handballs: number;
  marks: number;
  contested: number;
  screamers: number;
  tackles: number;
  hitouts: number;
  inside50: number;
  frees: number;
}
const emptyStats = (): TeamStats => ({ kicks: 0, handballs: 0, marks: 0, contested: 0, screamers: 0, tackles: 0, hitouts: 0, inside50: 0, frees: 0 });

export interface SimOptions {
  seed: number;
  rival: Club;
  difficulty: Difficulty;
  /** Seconds per quarter. */
  quarterSeconds: number;
  /** Players a side (18 in a full match). */
  perSide?: number;
}

// ---------------------------------------------------------------- kicking

/** Kick launch: speed and elevation for power 0–1 (a drop punt). */
export function kickLaunch(power: number) {
  const p = Math.max(0, Math.min(1, power));
  return { speed: 11 + 17.5 * p, elev: 0.42 + 0.18 * p };
}

/** Fly a ball from (0, y0) with speed/elevation until it falls to `landY`. */
export function flight(speed: number, elev: number, y0 = 0.6, landY = 1.8, dt = 1 / 120) {
  let x = 0;
  let y = y0;
  let vx = speed * Math.cos(elev);
  let vy = speed * Math.sin(elev);
  let t = 0;
  while (t < 12) {
    const sp = Math.hypot(vx, vy);
    vx -= DRAG * sp * vx * dt;
    vy -= (G + DRAG * sp * vy) * dt;
    x += vx * dt;
    y += vy * dt;
    t += dt;
    if (vy < 0 && y <= landY) break;
  }
  return { range: x, time: t };
}

const TABLE = Array.from({ length: 21 }, (_, i) => {
  const { speed, elev } = kickLaunch(i / 20);
  return flight(speed, elev);
});
/** Horizontal distance a kick of `power` carries to chest height. */
export function kickRange(power: number) {
  const f = Math.max(0, Math.min(1, power)) * 20;
  const i = Math.min(19, Math.floor(f));
  return TABLE[i].range + (TABLE[i + 1].range - TABLE[i].range) * (f - i);
}
export function kickTime(power: number) {
  const f = Math.max(0, Math.min(1, power)) * 20;
  const i = Math.min(19, Math.floor(f));
  return TABLE[i].time + (TABLE[i + 1].time - TABLE[i].time) * (f - i);
}
/** The power that carries `dist` metres (1 if out of range). */
export function powerFor(dist: number) {
  if (dist <= TABLE[0].range) return 0;
  for (let i = 0; i < 20; i++) if (TABLE[i + 1].range >= dist) return (i + (dist - TABLE[i].range) / (TABLE[i + 1].range - TABLE[i].range)) / 20;
  return 1;
}
export const MAX_KICK = TABLE[20].range;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// ------------------------------------------------------------------- sim

export class FootySim {
  readonly rng: Rng;
  readonly clubs: [Club, Club];
  readonly difficulty: Difficulty;
  readonly quarterSeconds: number;
  players: Player[] = [];
  ball: Ball = { x: 0, y: 0.5, z: 0, vx: 0, vy: 0, vz: 0, state: "dead", holder: -1, kick: null, ruck: false, lastTeam: 0, spin: 0, spinRate: 0 };
  umpire: Official = { x: 0, z: -3, h: Math.PI / 2, speed: 0, step: 0, signal: "", signalT: 0 };
  goalUmps: [Official, Official] = [
    { x: GOAL_X + 1.2, z: 0, h: Math.PI, speed: 0, step: 0, signal: "", signalT: 0 },
    { x: -GOAL_X - 1.2, z: 0, h: 0, speed: 0, step: 0, signal: "", signalT: 0 },
  ];
  phase: Phase = "bounce";
  quarter = 1;
  clock: number;
  score: [Score, Score] = [
    { goals: 0, behinds: 0 },
    { goals: 0, behinds: 0 },
  ];
  /** Score at each change of quarter, for the scoreboard. */
  byQuarter: [Score, Score][] = [];
  stats: [TeamStats, TeamStats] = [emptyStats(), emptyStats()];
  /** Your goals / marks etc. (the human's players). */
  set: SetShot | null = null;
  stoppage: Stoppage | null = null;
  phaseT = 0;
  sirenGone = false;
  human = 0;
  /** Kick charge 0–1 while the kick button is held. */
  charge = 0;
  private charging = false;
  private switchLock = 0;
  time = 0;
  events: SimEvent[] = [];
  /** Where an air ball comes down (for AI and the landing marker). */
  landing: { x: number; z: number; t: number } | null = null;
  private landingAt = 0;
  /** A tackle in progress: the carrier has a moment to get rid of it. */
  tackle: { by: number; on: number; t: number; prior: boolean } | null = null;
  /** After the final siren. */
  over = false;
  /** The AI plays your player too (tests, demos). */
  autopilot = false;
  /** Off the ball with the stick idle: the AI positions your player for you. */
  assist = false;
  /** The kick after the siren is away: the quarter ends when it comes down. */
  private finalKick = false;
  private readonly perSide: number;
  private diffK: number;

  constructor(o: SimOptions) {
    this.rng = createRng(o.seed);
    this.clubs = [HOME, o.rival];
    this.difficulty = o.difficulty;
    this.quarterSeconds = o.quarterSeconds;
    this.clock = o.quarterSeconds;
    this.perSide = Math.max(6, Math.min(18, o.perSide ?? 18));
    this.diffK = o.difficulty === "easy" ? 0.78 : o.difficulty === "pro" ? 0.92 : 1.04;
    const names = [...SURNAMES];
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    const roles = this.roles();
    let n = 0;
    for (const team of [0, 1] as Team[]) {
      const used = new Set<number>();
      for (const role of roles) {
        const k = team === 0 ? 0.95 : this.diffK;
        const r = () => 0.55 + this.rng.next() * 0.35;
        let num = 1 + Math.floor(this.rng.next() * 44);
        while (used.has(num)) num = 1 + Math.floor(this.rng.next() * 44);
        used.add(num);
        const tall = role === RUCK || role === 0 || role === 12 || role === 3 || role === 9;
        this.players.push({
          id: n,
          team,
          role,
          name: names[n % names.length],
          number: num,
          x: 0,
          z: 0,
          y: 0,
          vy: 0,
          vx: 0,
          vz: 0,
          h: 0,
          step: this.rng.next() * 10,
          speed: 0,
          stamina: 1,
          skill: {
            pace: Math.min(1, r() * k + (MIDS.includes(role) ? 0.06 : 0) - (tall ? 0.05 : 0)),
            kick: Math.min(1, r() * k + (role >= 9 && role <= 14 ? 0.06 : 0)),
            mark: Math.min(1, r() * k + (tall ? 0.12 : 0)),
            tackle: Math.min(1, r() * k + (MIDS.includes(role) ? 0.08 : 0)),
            ruck: role === RUCK ? 0.8 * k + this.rng.next() * 0.2 : 0.3,
          },
          act: null,
          down: 0,
          climb: false,
          tx: 0,
          tz: 0,
          urgency: 0.5,
          think: this.rng.next() * 0.3,
          held: 0,
          run: 0,
          runTotal: 0,
          noTouch: 0,
          leapAt: -9,
          celebrate: 0,
        });
        n++;
      }
    }
    this.centreBounceSetup();
  }

  /** Which positions play (all 18, or a trimmed side with the spine and the midfield). */
  private roles() {
    const order = [15, 6, 17, 16, 12, 0, 9, 3, 7, 8, 13, 1, 10, 4, 14, 2, 11, 5];
    return order.slice(0, this.perSide).sort((a, b) => a - b);
  }

  /** +1 if `team` kicks toward +x this quarter (ends change every quarter). */
  dir(team: Team) {
    const q = this.quarter % 2 === 1 ? 1 : -1;
    return team === 0 ? q : -q;
  }
  goalOf(team: Team) {
    return { x: GOAL_X * this.dir(team), z: 0 };
  }
  home(p: Player) {
    const pos = POSITIONS[p.role];
    const d = this.dir(p.team);
    return { x: pos.x * A * d, z: pos.z * B * d };
  }
  get carrier() {
    return this.ball.state === "held" ? this.players[this.ball.holder] : null;
  }
  get you() {
    return this.players[this.human];
  }
  opponent(p: Player) {
    const role = MATCHUP[p.role];
    return this.players.find((q) => q.team !== p.team && q.role === role) ?? null;
  }
  private emit(e: SimEvent) {
    this.events.push(e);
  }

  // ------------------------------------------------------------- stoppages

  /** Everyone to their centre-bounce spots: four per side in the centre square. */
  private centreBounceSetup() {
    for (const p of this.players) {
      const h = this.home(p);
      let x = h.x;
      let z = h.z;
      if (MIDS.includes(p.role)) {
        const d = this.dir(p.team);
        const spots: Record<number, [number, number]> = { 15: [-1.2, 0.4], 6: [-9, 7], 16: [-7, -9], 17: [-5, 10] };
        const s = spots[p.role];
        x = s[0] * d;
        z = s[1] * d;
      } else if (Math.abs(x) < CENTRE_SQUARE + 2 && Math.abs(z) < CENTRE_SQUARE + 2 && p.role !== 7 && p.role !== 8) {
        x = Math.sign(x || this.dir(p.team)) * (CENTRE_SQUARE + 3);
      }
      p.x = x;
      p.z = z;
      p.vx = p.vz = p.y = p.vy = 0;
      p.h = Math.atan2(-z, -x);
      p.act = null;
      p.down = 0;
      p.tx = x;
      p.tz = z;
      p.celebrate = 0;
    }
    this.ball = { ...this.ball, x: 0, y: 1.2, z: 0, vx: 0, vy: 0, vz: 0, state: "dead", holder: -1, kick: null, ruck: false };
    this.umpire.x = 0;
    this.umpire.z = -1.5;
    this.umpire.h = Math.PI / 2;
    this.phase = "bounce";
    this.stoppage = { kind: "centre", x: 0, z: 0, nx: 0, nz: 0, t: 0, launched: false };
    this.set = null;
    this.tackle = null;
    this.landing = null;
    this.human = this.players.find((p) => p.team === 0 && p.role === 17)?.id ?? 0;
    this.emit({ kind: "cut" });
  }

  private ballUp(x: number, z: number) {
    const b = boundaryAt(x, z);
    const inset = outside(x, z, -5);
    this.stoppage = { kind: "ballup", x: inset ? b.x + b.nx * 5 : x, z: inset ? b.z + b.nz * 5 : z, nx: 0, nz: 0, t: 0, launched: false };
    this.ball = { ...this.ball, x: this.stoppage.x, y: 1.1, z: this.stoppage.z, vx: 0, vy: 0, vz: 0, state: "dead", holder: -1, kick: null };
    this.phase = "stoppage";
    this.tackle = null;
    this.emit({ kind: "whistle" });
    this.emit({ kind: "ballup" });
  }

  private throwIn(x: number, z: number) {
    const b = boundaryAt(x, z);
    this.stoppage = { kind: "throwin", x: b.x, z: b.z, nx: b.nx, nz: b.nz, t: 0, launched: false };
    this.ball = { ...this.ball, x: b.x - b.nx * 0.5, y: 1.2, z: b.z - b.nz * 0.5, vx: 0, vy: 0, vz: 0, state: "dead", holder: -1, kick: null };
    this.phase = "stoppage";
    this.emit({ kind: "whistle" });
    this.emit({ kind: "out", full: false });
  }

  /** A mark, free kick or kick-in: `id` has the ball at (x, z). */
  private awardSet(id: number, x: number, z: number, kind: SetShot["kind"], reason: string) {
    const p = this.players[id];
    const b = boundaryAt(x, z);
    if (outside(x, z, -1.5)) {
      x = b.x + b.nx * 1.5;
      z = b.z + b.nz * 1.5;
    }
    const goal = this.goalOf(p.team);
    const dist = Math.hypot(goal.x - x, goal.z - z);
    const aim = dist < 65 ? Math.atan2(goal.z - z, goal.x - x) : this.dir(p.team) > 0 ? 0 : Math.PI;
    const onMark = this.players
      .filter((q) => q.team !== p.team && q.down <= 0)
      .reduce((best, q) => (Math.hypot(q.x - x, q.z - z) < Math.hypot(best.x - x, best.z - z) ? q : best), this.players.find((q) => q.team !== p.team)!);
    this.set = { id, kind, x, z, aim, t: 0, clock: 30, onMark: onMark.id, reason };
    this.phase = "set";
    this.tackle = null;
    this.landing = null;
    this.ball = { ...this.ball, state: "held", holder: id, kick: null, ruck: false, vx: 0, vy: 0, vz: 0 };
    p.act = null;
    p.held = 0;
    p.run = 0;
    p.h = aim;
    p.x = x - Math.cos(aim) * 3;
    p.z = z - Math.sin(aim) * 3;
    if (p.team === 0) this.setHuman(id);
    this.ball.lastTeam = p.team;
    this.charge = 0;
    this.charging = false;
  }

  // --------------------------------------------------------------- stepping

  step(dt: number, input: FootyInput = NO_INPUT) {
    if (this.phase === "over") return;
    this.time += dt;
    this.phaseT += dt;
    this.switchLock = Math.max(0, this.switchLock - dt);
    const live = this.phase === "play" || this.phase === "set" || this.phase === "stoppage";
    if (live && !this.sirenGone) {
      this.clock -= dt;
      if (this.clock <= 0) {
        this.clock = 0;
        this.sirenGone = true;
        this.emit({ kind: "siren", quarter: this.quarter });
        // A set shot after the siren still gets its kick; otherwise that's the quarter.
        if (!(this.phase === "set")) {
          this.endQuarter();
          return;
        }
      }
    }

    if (this.phase === "goal") {
      if (this.phaseT > 4.2) this.centreBounceSetup();
    } else if (this.phase === "break") {
      if (this.phaseT > 5) {
        this.quarter++;
        this.clock = this.quarterSeconds;
        this.sirenGone = false;
        this.centreBounceSetup();
        this.emit({ kind: "quarter", quarter: this.quarter });
      }
    } else if (this.phase === "bounce" || this.phase === "stoppage") {
      this.stepStoppage(dt);
    } else if (this.phase === "set") {
      this.stepSet(dt, input);
    }

    this.humanControl(dt, input);
    this.think(dt);
    this.movePlayers(dt);
    this.stepBall(dt);
    this.stepOfficials(dt);
    if (this.phase === "play") this.stepTackle(dt);
    if (this.finalKick && this.ball.state !== "air" && (this.phase === "play" || this.phase === "set" || this.phase === "stoppage")) this.endQuarter();
  }

  private endQuarter() {
    this.finalKick = false;
    this.byQuarter.push([{ ...this.score[0] }, { ...this.score[1] }]);
    this.ball.state = "dead";
    this.ball.holder = -1;
    this.set = null;
    this.tackle = null;
    this.landing = null;
    if (this.quarter >= 4) {
      this.phase = "over";
      this.over = true;
      this.emit({ kind: "over" });
    } else {
      this.phase = "break";
      this.phaseT = 0;
    }
  }

  private stepStoppage(dt: number) {
    const s = this.stoppage;
    if (!s) return;
    s.t += dt;
    const wait = s.kind === "centre" ? 1.6 : 1.2;
    if (!s.launched && s.t > wait) {
      s.launched = true;
      const b = this.ball;
      b.state = "air";
      b.ruck = true;
      b.kick = null;
      b.holder = -1;
      if (s.kind === "throwin") {
        // Boundary umpire's backwards throw: high, 8–12 m infield.
        b.x = s.x + s.nx * 0.5;
        b.z = s.z + s.nz * 0.5;
        b.y = 1.9;
        const k = 3.2 + this.rng.next() * 1.5;
        b.vx = s.nx * k;
        b.vz = s.nz * k;
        b.vy = 11.5;
        this.emit({ kind: "throwin" });
      } else {
        // The bounce: slammed down, up it goes.
        b.x = s.x + 0.4;
        b.z = s.z;
        b.y = 0.3;
        b.vx = (this.rng.next() - 0.5) * 0.8;
        b.vz = (this.rng.next() - 0.5) * 0.8;
        b.vy = s.kind === "centre" ? 15 : 10;
        this.umpire.signal = "bounce";
        this.umpire.signalT = 0.7;
        this.emit({ kind: "bounceBall", x: b.x, z: b.z, hard: 1 });
        if (s.kind === "centre") this.emit({ kind: "centre" });
      }
      b.spinRate = 6;
      this.phase = "play";
      this.phaseT = 0;
      this.stoppage = null;
    }
  }

  private stepSet(dt: number, input: FootyInput) {
    const s = this.set!;
    s.t += dt;
    const p = this.players[s.id];
    // Protected zone: the man on the mark stands on it.
    const m = this.players[s.onMark];
    m.tx = s.x;
    m.tz = s.z;
    m.urgency = 1;
    if (p.act?.kind === "kick") {
      // The run-up through the mark.
      p.tx = s.x;
      p.tz = s.z;
      p.urgency = 0.5;
      return;
    }
    p.tx = s.x - Math.cos(s.aim) * 3;
    p.tz = s.z - Math.sin(s.aim) * 3;
    p.urgency = 0.3;
    const isHuman = s.id === this.human && p.team === 0 && !this.autopilot;
    if (isHuman) {
      s.clock -= dt;
      // Aim with the stick; sprinting off the line (or a handball) is play on.
      if (Math.hypot(input.mx, input.mz) > 0.3 && !input.sprint) {
        const want = Math.atan2(input.mz, input.mx);
        s.aim = wrap(s.aim + Math.max(-1, Math.min(1, wrap(want - s.aim) * 3)) * dt * 0.8);
      }
      p.h = s.aim;
      if (input.sprint && Math.hypot(input.mx, input.mz) > 0.5 && s.t > 0.4) return this.playOn();
      if (input.handball) {
        this.playOn();
        return;
      }
      if (s.clock <= 0) this.startKick(p, s.aim, Math.max(0.6, this.charge), -1, true);
      return;
    }
    // AI: line up, then kick (a shot if in range, else to a leading teammate).
    const think = 2.5 + (s.id * 0.37) % 2;
    if (s.t > think) {
      const goal = this.goalOf(p.team);
      const dist = Math.hypot(goal.x - p.x, goal.z - p.z);
      const angle = this.goalAngle(p.x, p.z, p.team);
      if (s.kind !== "kickin" && dist < Math.min(55, MAX_KICK - 4) && angle > 0.12) {
        this.startKick(p, Math.atan2(goal.z - p.z, goal.x - p.x), Math.min(1, powerFor(dist + 6) + 0.04), -1, true);
      } else {
        const t = this.bestKickTarget(p, true);
        if (t) this.startKick(p, t.aim, t.power, t.id, false);
        else this.startKick(p, s.aim, 0.85, -1, false);
      }
    }
  }

  private playOn() {
    this.phase = "play";
    this.set = null;
    this.emit({ kind: "playon" });
  }

  /** The angle the goal face subtends from (x, z): how "open" a shot is. */
  goalAngle(x: number, z: number, team: Team) {
    const gx = this.goalOf(team).x;
    const a1 = Math.atan2(GOAL_HALF - z, gx - x);
    const a2 = Math.atan2(-GOAL_HALF - z, gx - x);
    return Math.abs(wrap(a1 - a2));
  }

  // ---------------------------------------------------------- human control

  private setHuman(id: number) {
    if (this.human === id) return;
    this.human = id;
    this.switchLock = 0.4;
    this.charge = 0;
    this.charging = false;
  }

  private humanControl(dt: number, input: FootyInput) {
    const p = this.you;
    const b = this.ball;
    // Auto-switch: to whoever of ours has the ball, else the one nearest the ball.
    if (b.state === "held" && this.players[b.holder].team === 0) this.setHuman(b.holder);
    if (input.switchPlayer) {
      const t = this.bestChaser(0, true);
      if (t) this.setHuman(t.id);
    }
    const hasBall = b.state === "held" && b.holder === p.id;
    if (this.autopilot) return;
    if (this.phase === "set" || this.phase === "play" || this.phase === "stoppage" || this.phase === "bounce") {
      // Kick: hold to charge, release to kick.
      if (hasBall && p.down <= 0 && !p.act) {
        if (input.kick) {
          this.charging = true;
          this.charge = Math.min(1, this.charge + dt / 1.05);
        } else if (this.charging) {
          this.charging = false;
          this.humanKick(p);
        }
        if (input.handball && this.phase === "play") this.humanHandball(p);
      } else {
        if (!input.kick) this.charging = false;
        if (!hasBall) this.charge = 0;
        if (input.leap && !hasBall && p.y <= 0 && p.down <= 0 && (!p.act || p.act.kind === "tackle")) this.leap(p, true);
        if (input.tackle && !hasBall && this.phase === "play") this.tryTackle(p, true);
      }
    }
    if (this.phase === "set" && this.set?.id === p.id) return;
    // Movement: the human's target is where the stick points.
    const m = Math.hypot(input.mx, input.mz);
    if (m > 0.05) {
      p.tx = p.x + (input.mx / m) * 6;
      p.tz = p.z + (input.mz / m) * 6;
      p.urgency = Math.min(1, m) * (input.sprint ? 1 : 0.72) * (this.charging ? 0.6 : 1);
    } else {
      p.tx = p.x;
      p.tz = p.z;
      p.urgency = 0;
    }
  }

  private humanKick(p: Player) {
    const power = Math.max(0.12, this.charge);
    let aim = p.h;
    let target = -1;
    let shot = false;
    const goal = this.goalOf(p.team);
    const gd = Math.hypot(goal.x - p.x, goal.z - p.z);
    const ga = Math.atan2(goal.z - p.z, goal.x - p.x);
    const range = kickRange(power);
    if (Math.abs(wrap(ga - aim)) < 0.4 && gd < range + 14) {
      // Aim assist toward the goal.
      aim = wrap(aim + wrap(ga - aim) * 0.75);
      shot = true;
    } else {
      // Or to a teammate in the cone whose lead the kick reaches.
      let best = 0;
      for (const q of this.players) {
        if (q.team !== p.team || q.id === p.id || q.down > 0) continue;
        const lx = q.x + q.vx * kickTime(power);
        const lz = q.z + q.vz * kickTime(power);
        const d = Math.hypot(lx - p.x, lz - p.z);
        const off = Math.abs(wrap(Math.atan2(lz - p.z, lx - p.x) - p.h));
        if (off > 0.35 || Math.abs(d - range) > 14) continue;
        const score = 1 - off - Math.abs(d - range) / 30 + this.freeness(lx, lz, p.team) * 0.05;
        if (score > best) {
          best = score;
          target = q.id;
          aim = wrap(p.h + wrap(Math.atan2(lz - p.z, lx - p.x) - p.h) * 0.8);
        }
      }
    }
    if (this.set?.id === p.id && this.set.kind !== "kickin") shot = shot || gd < 60;
    this.startKick(p, aim, power, target, shot);
    this.charge = 0;
  }

  private humanHandball(p: Player) {
    const t = this.bestHandball(p, p.h);
    if (t) this.startHandball(p, t.id);
    else this.startHandball(p, -1);
  }

  // ------------------------------------------------------------ disposals

  private startKick(p: Player, aim: number, power: number, target: number, shot: boolean) {
    p.act = { kind: "kick", t: 0, dur: 0.46, release: 0.22, aim, power, target, shot };
    p.h = aim;
    if (this.phase === "set" && this.set?.id === p.id) {
      // The run-up: the mark stands, play is on once it's kicked.
    }
  }

  private startHandball(p: Player, target: number) {
    p.act = { kind: "handball", t: 0, dur: 0.32, release: 0.13, target, aim: p.h };
  }

  private release(p: Player) {
    const a = p.act!;
    const b = this.ball;
    if (b.state !== "held" || b.holder !== p.id) return;
    const pressure = this.pressureOn(p);
    const setShot = this.phase === "set";
    if (setShot) {
      this.phase = "play";
      this.set = null;
    }
    b.state = "air";
    b.holder = -1;
    b.ruck = false;
    b.x = p.x + Math.cos(p.h) * 0.45;
    b.z = p.z + Math.sin(p.h) * 0.45;
    const isHuman = p.id === this.human;
    if (a.kind === "kick") {
      const skill = p.skill.kick;
      const power = Math.max(0, Math.min(1, (a.power ?? 0.7) * (1 + (this.rng.next() - 0.5) * 0.05)));
      const { speed, elev } = kickLaunch(power);
      const spread = (isHuman ? 0.022 : 0.034 + (1 - skill) * 0.06) + pressure * 0.08 + power * 0.03;
      const err = (this.rng.next() + this.rng.next() + this.rng.next() - 1.5) * spread * 1.4;
      const yaw = (a.aim ?? p.h) + err;
      b.y = 0.55;
      b.vx = Math.cos(yaw) * Math.cos(elev) * speed;
      b.vz = Math.sin(yaw) * Math.cos(elev) * speed;
      b.vy = Math.sin(elev) * speed;
      b.spinRate = -14 - power * 8;
      b.kick = { by: p.id, team: p.team, fromX: p.x, fromZ: p.z, isKick: true, touched: false, bounced: false, target: a.target ?? -1, markable: true, shot: !!a.shot, afterSiren: this.sirenGone };
      this.stats[p.team].kicks++;
      this.emit({ kind: "kick", id: p.id, power, shot: !!a.shot });
      // Inside 50?
      const g = this.goalOf(p.team);
      const land = { x: p.x + Math.cos(yaw) * kickRange(power), z: p.z + Math.sin(yaw) * kickRange(power) };
      if (Math.hypot(g.x - land.x, g.z - land.z) < ARC && Math.hypot(g.x - p.x, g.z - p.z) >= ARC) this.stats[p.team].inside50++;
    } else {
      const t = a.target !== undefined && a.target >= 0 ? this.players[a.target] : null;
      const tx = t ? t.x + t.vx * 0.45 : p.x + Math.cos(p.h) * 8;
      const tz = t ? t.z + t.vz * 0.45 : p.z + Math.sin(p.h) * 8;
      const d = Math.max(3, Math.hypot(tx - p.x, tz - p.z));
      const elev = 0.33;
      const speed = Math.min(17, Math.sqrt((d * 1.12 * G) / Math.sin(2 * elev)));
      const err = (this.rng.next() - 0.5) * (0.06 + pressure * 0.12);
      const yaw = Math.atan2(tz - p.z, tx - p.x) + err;
      p.h = Math.atan2(tz - p.z, tx - p.x);
      b.y = 1.0;
      b.vx = Math.cos(yaw) * Math.cos(elev) * speed;
      b.vz = Math.sin(yaw) * Math.cos(elev) * speed;
      b.vy = Math.sin(elev) * speed;
      b.spinRate = 4;
      b.kick = { by: p.id, team: p.team, fromX: p.x, fromZ: p.z, isKick: false, touched: false, bounced: false, target: a.target ?? -1, markable: false, shot: false, afterSiren: this.sirenGone };
      this.stats[p.team].handballs++;
      this.emit({ kind: "handball", id: p.id });
    }
    b.lastTeam = p.team;
    if (this.sirenGone) this.finalKick = true;
    p.noTouch = 0.35;
    p.held = 0;
    p.run = 0;
    this.tackle = null;
    this.landingAt = 0;
    // Our kick to a teammate: take control of the receiver.
    if (p.team === 0 && b.kick.target >= 0) this.setHuman(b.kick.target);
  }

  /** How close the nearest opponent is (0 = free, 1 = on top of them). */
  private pressureOn(p: Player) {
    let d = 99;
    for (const q of this.players) if (q.team !== p.team && q.down <= 0) d = Math.min(d, Math.hypot(q.x - p.x, q.z - p.z));
    return Math.max(0, Math.min(1, (5 - d) / 4));
  }

  /** Distance from (x, z) to the nearest opponent of `team`. */
  private freeness(x: number, z: number, team: Team) {
    let d = 99;
    for (const q of this.players) if (q.team !== team && q.down <= 0) d = Math.min(d, Math.hypot(q.x - x, q.z - z));
    return d;
  }

  bestKickTarget(p: Player, set = false) {
    const g = this.goalOf(p.team);
    const d = this.dir(p.team);
    let best: { id: number; aim: number; power: number; score: number } | null = null;
    for (const q of this.players) {
      if (q.team !== p.team || q.id === p.id || q.down > 0) continue;
      const dx0 = q.x - p.x;
      const dz0 = q.z - p.z;
      const d0 = Math.hypot(dx0, dz0);
      if (d0 < 15 || d0 > MAX_KICK - 5) continue;
      const power = powerFor(d0);
      const tt = kickTime(power);
      const lx = q.x + q.vx * tt * 0.8;
      const lz = q.z + q.vz * tt * 0.8;
      if (outside(lx, lz, -4)) continue;
      const dist = Math.hypot(lx - p.x, lz - p.z);
      const gain = (lx - p.x) * d;
      const free = Math.min(8, this.freeness(lx, lz, p.team));
      const toGoal = Math.hypot(g.x - lx, g.z - lz);
      const score = gain * 0.05 + free * 0.45 - (toGoal < ARC ? -1.5 : 0) - dist * 0.01 + this.rng.next() * 0.6 + (set ? 0.2 : 0);
      if (!best || score > best.score) best = { id: q.id, aim: Math.atan2(lz - p.z, lx - p.x), power: powerFor(dist), score };
    }
    return best && best.score > 0.8 ? best : best && set ? best : null;
  }

  private bestHandball(p: Player, facing: number | null, reach = 18) {
    let best: { id: number; score: number } | null = null;
    for (const q of this.players) {
      if (q.team !== p.team || q.id === p.id || q.down > 0) continue;
      const dd = Math.hypot(q.x - p.x, q.z - p.z);
      if (dd > reach || dd < 2) continue;
      const free = Math.min(6, this.freeness(q.x, q.z, p.team));
      const off = facing === null ? 0 : Math.abs(wrap(Math.atan2(q.z - p.z, q.x - p.x) - facing));
      const score = free * 0.5 - dd * 0.08 - off * 0.8 + (q.x - p.x) * this.dir(p.team) * 0.03;
      if (!best || score > best.score) best = { id: q.id, score };
    }
    return best;
  }

  // ------------------------------------------------------------- contests

  private leap(p: Player, human = false) {
    if (p.y > 0 || p.down > 0) return;
    p.vy = 3.9 + p.skill.mark * 0.5;
    p.act = { kind: p.role === RUCK && this.ball.ruck ? "ruck" : "mark", t: 0, dur: 1.0 };
    p.climb = false;
    if (human) p.leapAt = this.time;
  }

  tryTackle(p: Player, human = false) {
    const c = this.carrier;
    if (!c || c.team === p.team || p.down > 0 || (p.act && p.act.kind !== "mark")) return false;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d > (human ? 2.4 : 1.8)) {
      if (human) p.act = { kind: "tackle", t: 0, dur: 0.6 };
      if (human) p.down = 0.5;
      return false;
    }
    p.act = { kind: "tackle", t: 0, dur: 0.7 };
    p.h = Math.atan2(c.z - p.z, c.x - p.x);
    const chance = 0.38 + p.skill.tackle * 0.32 - c.skill.pace * 0.18 + (human ? 0.14 : 0) + (c.act ? 0.2 : 0);
    if (this.rng.next() < chance) {
      const prior = c.held > 1.4 || c.runTotal > 8;
      this.tackle = { by: p.id, on: c.id, t: 0, prior };
      c.vx *= 0.2;
      c.vz *= 0.2;
      this.stats[p.team].tackles++;
      this.emit({ kind: "tackle", id: p.id, on: c.id, team: p.team });
    } else {
      p.down = 0.9;
      this.emit({ kind: "brokenTackle", id: c.id });
    }
    return true;
  }

  private stepTackle(dt: number) {
    const t = this.tackle;
    if (!t) return;
    t.t += dt;
    const c = this.players[t.on];
    const tk = this.players[t.by];
    tk.x += (c.x - Math.cos(tk.h) * 0.7 - tk.x) * Math.min(1, dt * 10);
    tk.z += (c.z - Math.sin(tk.h) * 0.7 - tk.z) * Math.min(1, dt * 10);
    if (this.ball.holder !== c.id || this.ball.state !== "held") {
      // Got it away.
      this.tackle = null;
      tk.down = 0.8;
      return;
    }
    // AI carriers try to get a handball off in the tackle.
    if (c.id !== this.human && !c.act && t.t > 0.12 && this.rng.next() < dt * (this.difficulty === "legend" ? 5 : 3) * (c.team === 1 ? this.diffK : 0.9)) {
      const h = this.bestHandball(c, null, 25);
      if (h) this.startHandball(c, h.id);
      else this.startKick(c, c.h, 0.35, -1, false);
    }
    if (t.t > 0.55 && !c.act) {
      this.tackle = null;
      c.down = 1.1;
      tk.down = 0.9;
      if (t.prior) {
        this.stats[tk.team].frees++;
        this.emit({ kind: "whistle" });
        this.emit({ kind: "free", id: tk.id, team: tk.team, reason: "Holding the ball" });
        this.umpire.signal = "free";
        this.umpire.signalT = 1.5;
        this.awardSet(tk.id, c.x, c.z, "free", "Holding the ball");
      } else this.ballUp(c.x, c.z);
    }
  }

  /** Could `p` take the ball at its current position? */
  private inReach(p: Player, b: Ball) {
    const hd = Math.hypot(b.x - p.x, b.z - p.z);
    const leaping = p.y > 0.05;
    const reach = 0.85 + (leaping ? 0.3 : 0);
    const top = (p.role === RUCK ? 2.5 : 2.3) + p.y + (leaping ? 0.3 : 0);
    return hd < reach && b.y > 0.45 && b.y < top;
  }

  private airContest() {
    const b = this.ball;
    const cands = this.players.filter((p) => p.down <= 0 && p.noTouch <= 0 && this.inReach(p, b));
    if (cands.length === 0) return;
    // Everyone near enough to compete.
    const pack = this.players.filter((p) => p.down <= 0 && Math.hypot(b.x - p.x, b.z - p.z) < 1.7 && b.y < 3.2 + p.y);
    const k = b.kick;
    const kicked = !!k && k.isKick && k.markable && Math.hypot(b.x - k.fromX, b.z - k.fromZ) >= 15;
    if (b.ruck) return this.hitOut(cands);
    const score = (p: Player) =>
      p.skill.mark * 0.55 + (p.y > 0.05 ? 0.28 : 0) + p.y * 0.3 + this.rng.next() * 0.55 + (p.id === this.human && this.time - p.leapAt < 0.8 ? 0.25 : 0) + (p.team === 1 ? (this.diffK - 0.9) * 0.4 : 0);
    const ranked = [...new Set([...cands, ...pack])].map((p) => ({ p, s: score(p) })).sort((a, c) => c.s - a.s);
    const top = ranked[0].p;
    if (!cands.includes(top)) return;
    const contested = ranked.some((r) => r.p.team !== top.team);
    const human = top.id === this.human;
    const catchP = contested ? 0.5 + top.skill.mark * 0.25 + (human ? 0.1 : 0) : 0.84 + top.skill.mark * 0.12 + (human ? 0.05 : 0);
    if (this.rng.next() < catchP) {
      this.gain(top, kicked ? "mark" : "gather", contested);
      return;
    }
    // Spilled or spoiled.
    const spoiler = ranked.find((r) => r.p.team !== top.team);
    const a = this.rng.next() * Math.PI * 2;
    const k2 = 3 + this.rng.next() * 4;
    b.vx = Math.cos(a) * k2 + b.vx * 0.15;
    b.vz = Math.sin(a) * k2 + b.vz * 0.15;
    b.vy = 1 + this.rng.next() * 2.5;
    b.spinRate = 12;
    if (b.kick) {
      b.kick.touched = true;
      b.kick.markable = false;
    }
    for (const r of ranked) r.p.noTouch = 0.3;
    if (spoiler && this.rng.next() < 0.5) {
      spoiler.p.act = { kind: "spoil", t: 0, dur: 0.5 };
      this.emit({ kind: "spoil", id: spoiler.p.id });
    } else this.emit({ kind: "spill", id: top.id });
  }

  /** Ruck contest: the winner taps it down to a teammate. */
  private hitOut(cands: Player[]) {
    const b = this.ball;
    const sc = (p: Player) => p.skill.ruck + p.y * 0.4 + this.rng.next() * 0.5;
    const win = cands.reduce((a, c) => (sc(c) > sc(a) ? c : a));
    const mates = this.players.filter((q) => q.team === win.team && q.id !== win.id && q.down <= 0);
    let to = mates[0];
    let bd = 1e9;
    for (const q of mates) {
      const d = Math.hypot(q.x - b.x, q.z - b.z) - (q.x - b.x) * this.dir(win.team) * 0.2;
      if (d < bd && d > 1.5) {
        bd = d;
        to = q;
      }
    }
    const a = Math.atan2(to.z - b.z, to.x - b.x);
    const k = Math.min(9, 3 + Math.hypot(to.z - b.z, to.x - b.x) * 0.9);
    b.vx = Math.cos(a) * k;
    b.vz = Math.sin(a) * k;
    b.vy = 1.2;
    b.ruck = false;
    b.kick = { by: win.id, team: win.team, fromX: b.x, fromZ: b.z, isKick: false, touched: true, bounced: false, target: to.id, markable: false, shot: false, afterSiren: false };
    b.lastTeam = win.team;
    win.noTouch = 0.5;
    this.stats[win.team].hitouts++;
    this.emit({ kind: "hitout", id: win.id, team: win.team });
    if (to.team === 0) this.setHuman(to.id);
  }

  private gain(p: Player, how: "mark" | "gather", contested = false) {
    const b = this.ball;
    const screamer = how === "mark" && p.climb;
    b.state = "held";
    b.holder = p.id;
    b.ruck = false;
    b.vx = b.vy = b.vz = 0;
    b.lastTeam = p.team;
    p.held = 0;
    p.run = 0;
    p.runTotal = 0;
    this.landing = null;
    if (how === "mark") {
      this.stats[p.team].marks++;
      if (contested) this.stats[p.team].contested++;
      if (screamer) this.stats[p.team].screamers++;
      this.emit({ kind: "mark", id: p.id, screamer, contested, team: p.team });
      this.emit({ kind: "whistle" });
      const k = b.kick;
      b.kick = null;
      this.awardSet(p.id, p.x, p.z, "mark", screamer ? "Screamer!" : contested ? "Contested mark" : "Mark");
      void k;
    } else {
      b.kick = null;
      this.emit({ kind: "gather", id: p.id, team: p.team });
    }
  }

  // ------------------------------------------------------------------ AI

  /** The player of `team` best placed to get to the ball. */
  bestChaser(team: Team, anyone = false) {
    const b = this.ball;
    const tgt = this.landing && b.state === "air" ? this.landing : b;
    let best: Player | null = null;
    let bd = 1e9;
    for (const p of this.players) {
      if (p.team !== team || p.down > 0) continue;
      if (!anyone && p.id === this.human) continue;
      const d = Math.hypot(tgt.x - p.x, tgt.z - p.z) / (6 + p.skill.pace * 2);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private predictLanding() {
    const b = this.ball;
    let x = b.x;
    let y = b.y;
    let z = b.z;
    let vx = b.vx;
    let vy = b.vy;
    let vz = b.vz;
    const dt = 1 / 30;
    let t = 0;
    while (t < 8) {
      const sp = Math.hypot(vx, vy, vz);
      vx -= DRAG * sp * vx * dt;
      vz -= DRAG * sp * vz * dt;
      vy -= (G + DRAG * sp * vy) * dt;
      x += vx * dt;
      y += vy * dt;
      z += vz * dt;
      t += dt;
      if (vy < 0 && y < 1.9) break;
    }
    this.landing = { x, z, t };
  }

  private think(dt: number) {
    const b = this.ball;
    if (b.state === "air") {
      this.landingAt -= dt;
      if (this.landingAt <= 0) {
        this.predictLanding();
        this.landingAt = 0.2;
      }
    } else if (b.state !== "held") this.landing = null;

    const carrier = this.carrier;
    const inPoss = carrier ? carrier.team : null;
    // Chasers: the nearest one or two of each side go to the ball.
    const chasers = new Set<number>();
    for (const team of [0, 1] as Team[]) {
      if (inPoss === team) continue;
      const pool = this.players
        .filter((p) => p.team === team && p.down <= 0 && p.id !== this.human)
        .map((p) => {
          const tg = carrier ?? (this.landing && b.state === "air" ? this.landing : b);
          return { p, d: Math.hypot(tg.x - p.x, tg.z - p.z) };
        })
        .sort((a, c) => a.d - c.d);
      const n = carrier ? 2 : b.state === "air" ? 2 : 2;
      for (let i = 0; i < Math.min(n, pool.length); i++) if (i === 0 || pool[i].d < (carrier ? 9 : 18)) chasers.add(pool[i].p.id);
    }

    for (const p of this.players) {
      if (p.id === this.human && !this.autopilot && !(this.assist && carrier?.id !== p.id && !(this.phase === "set" && this.set?.id === p.id))) continue;
      if (p.down > 0) continue;
      p.think -= dt;
      const hasBall = carrier?.id === p.id;
      if (hasBall) {
        this.carrierAI(p, dt);
        continue;
      }
      if (this.phase === "set") {
        this.setPlayAI(p);
        continue;
      }
      if (this.phase === "bounce" || this.phase === "stoppage") {
        this.stoppageAI(p);
        continue;
      }
      if (this.phase !== "play") {
        p.tx = p.x;
        p.tz = p.z;
        p.urgency = 0;
        continue;
      }
      if (chasers.has(p.id)) {
        const tg = carrier ?? (this.landing && b.state === "air" ? this.landing : { x: b.x + b.vx * 0.3, z: b.z + b.vz * 0.3 });
        p.tx = tg.x;
        p.tz = tg.z;
        p.urgency = 1;
        if (carrier && Math.hypot(carrier.x - p.x, carrier.z - p.z) < 1.7 && !this.tackle && !p.act && p.think <= 0) {
          p.think = 0.25;
          if (this.rng.next() < (p.team === 1 ? 0.4 * this.diffK : 0.36)) this.tryTackle(p);
        }
        if (b.state === "air" && !p.act && p.y <= 0) {
          // Leap when the ball's about to arrive overhead.
          if (this.leapTime(p) < 0.4) this.leap(p);
        }
        continue;
      }
      if (b.state === "air" && b.kick?.target === p.id) {
        // The intended receiver runs to the drop.
        const tg = this.landing ?? b;
        p.tx = tg.x;
        p.tz = tg.z;
        p.urgency = 1;
        if (!p.act && p.y <= 0 && this.leapTime(p) < 0.38 && this.rng.next() < 0.6) this.leap(p);
        continue;
      }
      if (p.think > 0) continue;
      p.think = 0.25 + this.rng.next() * 0.2;
      if (inPoss === p.team) this.supportAI(p, carrier!);
      else if (inPoss !== null) this.defendAI(p, carrier!);
      else this.zoneAI(p, 0.55);
    }
  }

  /** Seconds until the ball is overhead and in leaping range (9 = not coming). */
  private leapTime(p: Player) {
    const b = this.ball;
    const hd = Math.hypot(b.x - p.x, b.z - p.z);
    if (hd > 3 || b.vy >= 0 || b.y < 1.2) return 9;
    const horiz = hd / Math.max(1, Math.hypot(b.vx, b.vz));
    const vert = (b.y - 2.7) / -b.vy;
    return Math.max(horiz, vert);
  }

  private zoneAI(p: Player, pull: number) {
    const h = this.home(p);
    const b = this.ball;
    const d = this.dir(p.team);
    p.tx = h.x * (1 - pull) + b.x * pull;
    p.tz = h.z * 0.65 + b.z * 0.35;
    // Keep forwards forward, backs back.
    const lo = POSITIONS[p.role].x < -0.3 ? -A : POSITIONS[p.role].x > 0.3 ? -10 : -A * 0.6;
    const hi = POSITIONS[p.role].x < -0.3 ? 10 : A;
    const along = Math.max(lo, Math.min(hi, p.tx * d));
    p.tx = along * d;
    p.urgency = 0.55;
  }

  private supportAI(p: Player, c: Player) {
    const d = this.dir(p.team);
    const g = this.goalOf(p.team);
    const dc = Math.hypot(c.x - p.x, c.z - p.z);
    const ahead = (p.x - c.x) * d;
    if (dc < 16 && ahead < 6) {
      // Run past for the handball receive.
      const side = p.id % 2 ? 1 : -1;
      p.tx = c.x + d * 5;
      p.tz = c.z + side * 5;
      p.urgency = 0.9;
    } else if (ahead > 15 && ahead < 70 && POSITIONS[p.role].x > -0.2) {
      // Lead: at the carrier, into space, favouring the corridor.
      const lead = 26 + ((p.id * 7) % 16);
      p.tx = c.x + d * lead;
      p.tz = c.z * 0.5 + POSITIONS[p.role].z * B * d * 0.5;
      if (Math.hypot(g.x - p.tx, g.z - p.tz) < 12) p.tx = g.x - d * 14;
      p.urgency = 0.95;
    } else this.zoneAI(p, 0.5);
    this.clampTarget(p);
  }

  private defendAI(p: Player, c: Player) {
    const opp = this.opponent(p);
    const own = this.goalOf(p.team === 0 ? 1 : 0);
    if (opp && Math.hypot(opp.x - c.x, opp.z - c.z) < 70) {
      // Goal-side of your opponent.
      const dx = own.x - opp.x;
      const dz = own.z - opp.z;
      const l = Math.hypot(dx, dz) || 1;
      p.tx = opp.x + (dx / l) * 2.2;
      p.tz = opp.z + (dz / l) * 2.2;
      p.urgency = 0.85;
    } else this.zoneAI(p, 0.45);
    this.clampTarget(p);
  }

  private setPlayAI(p: Player) {
    const s = this.set!;
    if (p.id === s.id || p.id === s.onMark) return;
    const kicker = this.players[s.id];
    if (p.team === kicker.team) this.supportAI(p, kicker);
    else this.defendAI(p, kicker);
    // Nobody inside the protected zone (10 m corridor to the mark).
    const dm = Math.hypot(p.tx - s.x, p.tz - s.z);
    if (dm < 10) {
      p.tx = s.x + ((p.tx - s.x) / (dm || 1)) * 10;
      p.tz = s.z + ((p.tz - s.z) / (dm || 1)) * 10;
    }
  }

  private stoppageAI(p: Player) {
    const s = this.stoppage;
    if (!s) return;
    if (s.kind === "centre") {
      if (p.role === RUCK) {
        p.tx = -1.1 * this.dir(p.team);
        p.tz = 0.3 * this.dir(p.team);
        p.urgency = 0.3;
      } else {
        p.tx = p.x;
        p.tz = p.z;
        p.urgency = 0;
      }
      return;
    }
    // Ball-up / throw-in: the nearest three of each side come to it.
    const near = this.players
      .filter((q) => q.team === p.team && q.down <= 0)
      .sort((a, c) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(c.x - s.x, c.z - s.z))
      .slice(0, 3);
    const i = near.indexOf(p);
    if (i >= 0) {
      const d = this.dir(p.team);
      const off = [[-1.2, 0.3], [-4, 4], [-4, -4]][i];
      p.tx = s.x + off[0] * d + s.nx * 3;
      p.tz = s.z + off[1] * d + s.nz * 3;
      p.urgency = 1;
    } else this.zoneAI(p, 0.35);
  }

  private clampTarget(p: Player) {
    if (outside(p.tx, p.tz, -3)) {
      const b = boundaryAt(p.tx, p.tz);
      p.tx = b.x + b.nx * 4;
      p.tz = b.z + b.nz * 4;
    }
  }

  private carrierAI(p: Player, dt: number) {
    if (p.act || this.phase === "set") return;
    const g = this.goalOf(p.team);
    const dist = Math.hypot(g.x - p.x, g.z - p.z);
    const angle = this.goalAngle(p.x, p.z, p.team);
    const press = this.pressureOn(p);
    const tackled = this.tackle?.on === p.id;
    p.think -= dt;
    if (tackled) return;
    // Run at goal, steering away from pressure.
    let ax = g.x - p.x;
    let az = g.z - p.z;
    const l = Math.hypot(ax, az) || 1;
    ax /= l;
    az /= l;
    for (const q of this.players) {
      if (q.team === p.team || q.down > 0) continue;
      const dx = p.x - q.x;
      const dz = p.z - q.z;
      const d = Math.hypot(dx, dz);
      if (d < 9 && d > 0.01) {
        ax += (dx / d) * (9 - d) * 0.12;
        az += (dz / d) * (9 - d) * 0.12;
      }
    }
    p.tx = p.x + ax * 6;
    p.tz = p.z + az * 6;
    p.urgency = 1;
    this.clampTarget(p);
    if (p.think > 0) return;
    p.think = 0.18;
    const react = p.team === 1 ? this.diffK : 0.95;
    if (dist < Math.min(50, MAX_KICK - 6) && angle > 0.1 && (press < 0.6 || dist < 30)) {
      if (p.held > 0.35 / react || press > 0.3) {
        this.startKick(p, Math.atan2(g.z - p.z, g.x - p.x), Math.min(1, powerFor(dist + 5) + 0.05), -1, true);
        return;
      }
    }
    if (press > 0.35 || (press > 0.15 && p.held > 0.5)) {
      const h = this.bestHandball(p, null);
      if (h && h.score > 0.6) return this.startHandball(p, h.id);
      const t = this.bestKickTarget(p, true);
      if (t) return this.startKick(p, t.aim, t.power, t.id, false);
      return this.startKick(p, this.dir(p.team) > 0 ? 0 : Math.PI, 0.9, -1, false);
    }
    if (p.held > 0.7 + (p.id % 3) * 0.45) {
      const t = this.bestKickTarget(p);
      if (t) return this.startKick(p, t.aim, t.power, t.id, false);
      if (p.held > 3.5) {
        const t2 = this.bestKickTarget(p, true);
        if (t2) return this.startKick(p, t2.aim, t2.power, t2.id, false);
      }
    }
  }

  // -------------------------------------------------------------- movement

  private movePlayers(dt: number) {
    const b = this.ball;
    for (const p of this.players) {
      p.noTouch = Math.max(0, p.noTouch - dt);
      p.celebrate = Math.max(0, p.celebrate - dt);
      if (p.act) {
        p.act.t += dt;
        const a = p.act;
        if ((a.kind === "kick" || a.kind === "handball") && !a.done && a.t >= (a.release ?? 0)) {
          a.done = true;
          this.release(p);
        }
        if (a.t >= a.dur && p.y <= 0) p.act = null;
      }
      // Leaping: gravity; climbing a pack gives a screamer.
      if (p.y > 0 || p.vy > 0) {
        if (!p.climb && p.vy > 0 && p.act?.kind === "mark" && p.act.t < 0.05) {
          // Up on someone's shoulders: the screamer (rarer for the AI than for a well-timed human leap).
          const human = p.id === this.human && this.time - p.leapAt < 0.1;
          for (const q of this.players) {
            if (q === p || q.y > 0.2 || q.down > 0) continue;
            if (Math.hypot(q.x - p.x, q.z - p.z) < 0.8 && this.rng.next() < (human ? 0.55 : 0.07) * (0.6 + p.skill.mark * 0.6)) {
              p.climb = true;
              p.vy += 2.4;
              break;
            }
          }
        }
        p.vy -= G * dt;
        p.y += p.vy * dt;
        if (p.y <= 0) {
          p.y = 0;
          p.vy = 0;
          p.climb = false;
        }
      }
      if (p.down > 0) {
        p.down -= dt;
        p.vx *= 0.9;
        p.vz *= 0.9;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.speed = Math.hypot(p.vx, p.vz);
        continue;
      }
      const tackled = this.tackle?.on === p.id;
      const inSet = this.phase === "set" && this.set?.id === p.id;
      let max = (5.6 + p.skill.pace * 2.6) * (0.82 + p.stamina * 0.18) * (b.holder === p.id ? 0.93 : 1);
      if (p.act?.kind === "kick" || p.act?.kind === "handball") max *= 0.45;
      if (tackled) max = 0.3;
      if (inSet) max = 1.6;
      let dx = p.tx - p.x;
      let dz = p.tz - p.z;
      const dist = Math.hypot(dx, dz);
      const want = dist < 0.4 ? 0 : Math.min(max * Math.max(0.25, p.urgency), dist * 2.2);
      if (dist > 0.001) {
        dx /= dist;
        dz /= dist;
      }
      const accel = p.y > 0 ? 2 : 10;
      p.vx += (dx * want - p.vx) * Math.min(1, accel * dt * 0.7);
      p.vz += (dz * want - p.vz) * Math.min(1, accel * dt * 0.7);
      p.speed = Math.hypot(p.vx, p.vz);
      const sprinting = p.speed > 6.5;
      p.stamina = Math.max(0, Math.min(1, p.stamina + (sprinting ? -0.03 : 0.05) * dt));
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.step += p.speed * dt;
      // Face where you're going; stand still facing the ball.
      let face = p.h;
      if (inSet && this.set) face = this.set.aim;
      else if (p.act?.aim !== undefined && !p.act.done) face = p.act.aim;
      else if (p.speed > 0.8) face = Math.atan2(p.vz, p.vx);
      else face = Math.atan2(b.z - p.z, b.x - p.x);
      if (!(p.act?.kind === "tackle")) p.h = wrap(p.h + wrap(face - p.h) * Math.min(1, dt * (p.speed > 4 ? 6 : 8)));
      // The ball carrier: bounce every 15 m.
      if (b.state === "held" && b.holder === p.id && this.phase === "play") {
        p.held += dt;
        p.run += p.speed * dt;
        p.runTotal += p.speed * dt;
        if (p.run > 13.5 && !p.act) {
          p.run = 0;
          p.act = { kind: "bounce", t: 0, dur: 0.45 };
          this.emit({ kind: "runBounce", id: p.id });
          this.emit({ kind: "bounceBall", x: p.x, z: p.z, hard: 0.5 });
        }
      }
      // Keep on the ground (runners can go a few metres over the line).
      if (outside(p.x, p.z, 6)) {
        const bd = boundaryAt(p.x, p.z);
        p.x = bd.x - bd.nx * 5.5;
        p.z = bd.z - bd.nz * 5.5;
      }
    }
    // Separation (players don't overlap, except in a pack in the air).
    const n = this.players.length;
    for (let i = 0; i < n; i++) {
      const p = this.players[i];
      for (let j = i + 1; j < n; j++) {
        const q = this.players[j];
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.49 || d2 < 1e-6) continue;
        if (Math.abs(p.y - q.y) > 0.4) continue;
        if (this.tackle && (this.tackle.by === p.id || this.tackle.by === q.id)) continue;
        const d = Math.sqrt(d2);
        const push = (0.7 - d) * 0.5;
        p.x -= (dx / d) * push;
        p.z -= (dz / d) * push;
        q.x += (dx / d) * push;
        q.z += (dz / d) * push;
      }
    }
  }

  // ------------------------------------------------------------------ ball

  private stepBall(dt: number) {
    const b = this.ball;
    b.spin += b.spinRate * dt;
    if (b.state === "held") {
      const p = this.players[b.holder];
      b.x = p.x + Math.cos(p.h) * 0.3;
      b.z = p.z + Math.sin(p.h) * 0.3;
      b.y = 1.05 + p.y;
      b.vx = p.vx;
      b.vz = p.vz;
      b.vy = 0;
      b.spinRate *= 0.9;
      return;
    }
    if (b.state === "dead") return;
    const px = b.x;
    if (b.state === "air") {
      const sp = Math.hypot(b.vx, b.vy, b.vz);
      b.vx -= DRAG * sp * b.vx * dt;
      b.vz -= DRAG * sp * b.vz * dt;
      b.vy -= (G + DRAG * sp * b.vy) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (b.y <= BALL_R) {
        b.y = BALL_R;
        if (b.kick) b.kick.bounced = true;
        if (b.kick) b.kick.markable = false;
        b.ruck = false;
        const hard = Math.abs(b.vy);
        if (hard > 2.2) {
          // An oval ball: bounces sit up, skid or kick sideways.
          const a = (this.rng.next() - 0.5) * 1.3;
          const k = 0.55 + this.rng.next() * 0.3;
          const c = Math.cos(a);
          const s = Math.sin(a);
          const vx = (b.vx * c - b.vz * s) * k;
          const vz = (b.vx * s + b.vz * c) * k;
          b.vx = vx;
          b.vz = vz;
          b.vy = hard * (0.3 + this.rng.next() * 0.35);
          b.spinRate = (this.rng.next() - 0.5) * 30;
          this.emit({ kind: "bounceBall", x: b.x, z: b.z, hard: Math.min(1, hard / 14) });
        } else {
          b.vy = 0;
          b.state = "ground";
        }
      }
      if (this.phase === "play" && b.y > 0.4) this.airContest();
      if ((b.state as BallState) === "held") return;
    } else if (b.state === "ground") {
      const sp = Math.hypot(b.vx, b.vz);
      const dec = Math.max(0, sp - (2.2 + sp * 0.5) * dt);
      if (sp > 0.001) {
        b.vx *= dec / sp;
        b.vz *= dec / sp;
      }
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.y = BALL_R;
      b.spinRate *= 0.97;
    }
    if (this.phase !== "play") return;
    // Scoring: the ball crosses the goal line.
    if (Math.abs(px) < GOAL_X && Math.abs(b.x) >= GOAL_X && Math.abs(b.z) < BEHIND_HALF + 0.3) {
      this.crossLine(b.x > 0 ? 1 : -1);
      return;
    }
    // Out of bounds.
    if (outside(b.x, b.z)) {
      const k = b.kick;
      if (k && k.isKick && !k.bounced && !k.touched) {
        // Out on the full: free kick to the other side where it crossed.
        const team: Team = k.team === 0 ? 1 : 0;
        const bd = boundaryAt(b.x, b.z);
        const taker = this.nearestOf(team, bd.x, bd.z);
        this.stats[team].frees++;
        this.emit({ kind: "whistle" });
        this.emit({ kind: "out", full: true });
        this.emit({ kind: "free", id: taker.id, team, reason: "Out on the full" });
        this.awardSet(taker.id, bd.x + bd.nx, bd.z + bd.nz, "free", "Out on the full");
        return;
      }
      this.throwIn(b.x, b.z);
      return;
    }
    // Ground balls: gather.
    if (b.state === "ground" || (b.state === "air" && b.y < 0.6)) {
      let best: Player | null = null;
      let bd = 1e9;
      for (const p of this.players) {
        if (p.down > 0 || p.noTouch > 0 || p.y > 0.3) continue;
        const d = Math.hypot(b.x - p.x, b.z - p.z);
        if (d < 0.95 && d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) {
        const sp = Math.hypot(b.vx, b.vz);
        const chance = (0.2 + best.skill.mark * 0.2 + (best.id === this.human ? 0.12 : 0)) * (sp > 10 ? 0.5 : 1);
        if (this.rng.next() < chance) this.gain(best, "gather");
        else {
          best.noTouch = 0.2;
          if (sp < 3 && this.rng.next() < 0.3) {
            // A fumble knocks it on.
            const a = best.h + (this.rng.next() - 0.5) * 1.5;
            b.vx = Math.cos(a) * 3;
            b.vz = Math.sin(a) * 3;
          }
        }
      }
    }
  }

  private nearestOf(team: Team, x: number, z: number) {
    let best = this.players.find((p) => p.team === team)!;
    let bd = 1e9;
    for (const p of this.players) {
      if (p.team !== team) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private crossLine(side: 1 | -1) {
    const b = this.ball;
    // The side attacking this end scores.
    const team: Team = this.dir(0) === side ? 0 : 1;
    const k = b.kick;
    const z = Math.abs(b.z);
    const by = k?.by ?? -1;
    const post = Math.abs(z - GOAL_HALF) < 0.18 && b.y < 15;
    const offBoot = !!k && k.isKick && !k.touched && k.team === team && !post;
    const quarterEnds = this.sirenGone;
    if (z < GOAL_HALF && offBoot) {
      this.score[team].goals++;
      const dist = k ? Math.hypot(side * GOAL_X - k.fromX, k.fromZ) : 0;
      this.emit({ kind: "goal", team, by, dist, afterSiren: k?.afterSiren ?? false });
      if (by >= 0) this.players[by].celebrate = 4;
      for (const p of this.players) if (p.team === team && Math.hypot(p.x - b.x, p.z - b.z) < 30) p.celebrate = 3.5;
      const gu = this.goalUmps[side > 0 ? 0 : 1];
      gu.signal = "goal";
      gu.signalT = 3;
      this.phase = "goal";
      this.phaseT = 0;
      this.ball.state = "dead";
      if (quarterEnds) this.endQuarter();
      return;
    }
    this.score[team].behinds++;
    const rushed = !k || k.team !== team;
    this.emit({ kind: "behind", team, by, rushed, post });
    const gu = this.goalUmps[side > 0 ? 0 : 1];
    gu.signal = "behind";
    gu.signalT = 2.5;
    if (quarterEnds) return this.endQuarter();
    // Kick-in from the goal square by the defending full back.
    const def: Team = team === 0 ? 1 : 0;
    const fb = this.players.find((p) => p.team === def && p.role === 0 && p.down <= 0) ?? this.nearestOf(def, side * GOAL_X, 0);
    fb.x = side * (GOAL_X - 1);
    fb.z = 0;
    this.awardSet(fb.id, side * (GOAL_X - GOAL_SQUARE), 0, "kickin", "Kick-in");
    this.set!.aim = side > 0 ? Math.PI + (this.rng.next() - 0.5) * 0.9 : (this.rng.next() - 0.5) * 0.9;
    // Kick-ins can be played on straight away; the AI takes a moment.
    this.set!.t = 1;
  }

  private stepOfficials(dt: number) {
    const u = this.umpire;
    const b = this.ball;
    u.signalT = Math.max(0, u.signalT - dt);
    if (u.signalT <= 0) u.signal = "";
    if (this.phase === "play" || this.phase === "set") {
      // Stay 10 m off the ball, on the centre side.
      const l = Math.hypot(b.x, b.z) || 1;
      const tx = b.x - (b.x / l) * 11;
      const tz = b.z - (b.z / l) * 11;
      this.moveOfficial(u, tx, tz, dt, 7.5);
    } else if (this.stoppage) {
      this.moveOfficial(u, this.stoppage.x - 1.2, this.stoppage.z - 0.8, dt, 5);
    }
    for (const g of this.goalUmps) {
      g.signalT = Math.max(0, g.signalT - dt);
      if (g.signalT <= 0) g.signal = "";
      const side = g.x > 0 ? 1 : -1;
      const tz = Math.max(-2.4, Math.min(2.4, b.z * 0.3));
      this.moveOfficial(g, side * (GOAL_X + 1.2), tz, dt, 2);
      if (g.speed < 0.3) g.h = side > 0 ? Math.PI : 0;
    }
  }

  private moveOfficial(o: Official, tx: number, tz: number, dt: number, max: number) {
    const dx = tx - o.x;
    const dz = tz - o.z;
    const d = Math.hypot(dx, dz);
    const sp = d < 0.5 ? 0 : Math.min(max, d * 1.5);
    o.speed += (sp - o.speed) * Math.min(1, dt * 4);
    if (d > 0.01) {
      o.x += (dx / d) * o.speed * dt;
      o.z += (dz / d) * o.speed * dt;
    }
    o.step += o.speed * dt;
    if (o.speed > 0.5) o.h = Math.atan2(dz, dx);
    else {
      const b = this.ball;
      o.h = wrap(o.h + wrap(Math.atan2(b.z - o.z, b.x - o.x) - o.h) * Math.min(1, dt * 4));
    }
  }

  // -------------------------------------------------------------- results

  /** Your match score for the leaderboard. */
  matchScore() {
    const us = points(this.score[0]);
    const them = points(this.score[1]);
    const s = this.stats[0];
    const k = this.difficulty === "easy" ? 1 : this.difficulty === "pro" ? 1.5 : 2;
    const win = us > them ? 400 : us === them ? 150 : 0;
    const raw = us * 10 + Math.max(0, us - them) * 8 + s.marks * 8 + s.contested * 6 + s.screamers * 40 + s.tackles * 8 + win;
    return Math.max(0, Math.min(20000, Math.round(raw * k * Math.min(1.5, this.quarterSeconds / 240))));
  }

  /** "12.9 (81)" */
  static fmt(s: Score) {
    return `${s.goals}.${s.behinds} (${points(s)})`;
  }

  /** The predicted flight of a kick the human is charging (for the aim arc). */
  aimPreview(steps = 24) {
    const p = this.you;
    if (this.ball.holder !== p.id || !this.charging) return null;
    const { speed, elev } = kickLaunch(Math.max(0.12, this.charge));
    const pts: [number, number, number][] = [];
    let x = p.x;
    let y = 0.55;
    let z = p.z;
    const aim = this.phase === "set" && this.set ? this.set.aim : p.h;
    let vx = Math.cos(aim) * Math.cos(elev) * speed;
    let vz = Math.sin(aim) * Math.cos(elev) * speed;
    let vy = Math.sin(elev) * speed;
    const dt = 1 / 20;
    for (let i = 0; i < 200 && pts.length < steps * 4; i++) {
      const sp = Math.hypot(vx, vy, vz);
      vx -= DRAG * sp * vx * dt;
      vz -= DRAG * sp * vz * dt;
      vy -= (G + DRAG * sp * vy) * dt;
      x += vx * dt;
      y += vy * dt;
      z += vz * dt;
      pts.push([x, y, z]);
      if (y < 0.1) break;
    }
    return pts;
  }
}
