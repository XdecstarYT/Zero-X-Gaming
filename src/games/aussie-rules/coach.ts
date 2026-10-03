import { createRng, type Rng } from "../engine/rng";
import { clubById, NATIONAL } from "./clubs";
import { GOAL_WEIGHT, rosterFor } from "./rosters";
import { finish, ladder, nextGame, nextYear, premiers, recordResult, startSeason, strength, type Awards, type Season } from "./season";

/**
 * Coach career: you run a National League club from the coaches' box. A list
 * of thirty with ages, ratings, form, fitness and injuries; pick the eighteen,
 * set the game plan and the week's training, then coach each match quarter by
 * quarter (a speech and changes at every break) or play it yourself. The
 * board sets a target from where the club's tipped to finish and its patience
 * runs out if you miss it; win and other clubs come calling. Each off-season:
 * the year in review, the trade period, the national draft, ageing and
 * retirements. Pure data, saved to the device.
 */

export type Line = "back" | "mid" | "fwd" | "ruck";
export const LINES: { id: Line; name: string; slots: number }[] = [
  { id: "back", name: "Backs", slots: 6 },
  { id: "mid", name: "Midfield", slots: 5 },
  { id: "fwd", name: "Forwards", slots: 6 },
  { id: "ruck", name: "Ruck", slots: 1 },
];

export interface Footballer {
  id: number;
  first: string;
  last: string;
  line: Line;
  age: number;
  /** 30–99. */
  rating: number;
  /** Where they could get to (the scouts' guess is shown, not this). */
  potential: number;
  /** -10 (out of sorts) to +10 (flying). */
  form: number;
  /** 0–100: how fresh. */
  fitness: number;
  /** Weeks out injured (0: available). */
  injury: number;
  injuryName?: string;
  games: number;
  goals: number;
  votes: number;
  /** This season. */
  sGames: number;
  sGoals: number;
  sVotes: number;
  /** The year they were drafted by you, if they were. */
  drafted?: number;
}

export type Tactic = "attack" | "possession" | "pressure" | "defensive";
/** Each plan's effect on your scoring and theirs, and the plan it gets the better of. */
export const TACTICS: Record<Tactic, { name: string; sub: string; us: number; them: number; beats: Tactic; tiring: number }> = {
  attack: { name: "All-out attack", sub: "Kick it long and often. More goals both ways.", us: 1.1, them: 1.06, beats: "defensive", tiring: 1 },
  possession: { name: "Possession", sub: "Chip it around, keep it off them.", us: 0.98, them: 0.93, beats: "attack", tiring: 0.9 },
  pressure: { name: "Pressure", sub: "Swarm the ball, tackle everything. Tiring.", us: 1.02, them: 0.92, beats: "possession", tiring: 1.35 },
  defensive: { name: "Flood", sub: "Numbers back, strangle the game.", us: 0.9, them: 0.86, beats: "pressure", tiring: 0.95 },
};

export type Focus = "fitness" | "skills" | "tactics" | "recovery";
export const FOCUS: Record<Focus, { name: string; sub: string }> = {
  fitness: { name: "Fitness", sub: "Fewer soft-tissue injuries, players stay fresh" },
  skills: { name: "Skills", sub: "The young ones improve faster" },
  tactics: { name: "Match prep", sub: "Study this week's opponent: a sharper side on the day" },
  recovery: { name: "Recovery", sub: "Ice baths and rest: fitness and injuries mend quicker" },
};

export type Speech = "fire" | "settle" | "backThem";
export const SPEECHES: Record<Speech, { name: string; sub: string }> = {
  fire: { name: "Fire them up", sub: "More intensity, more goals, more tired legs" },
  settle: { name: "Settle down", sub: "Composure: kick straighter" },
  backThem: { name: "Back them in", sub: "Confidence: a lift in form if you're in front" },
};

export interface CoachYear {
  year: number;
  club: string;
  finish: string;
  position: number;
  won: number;
  lost: number;
  drawn: number;
  flag: boolean;
  target: number;
  award: boolean;
  sacked: boolean;
}

export interface TradeOffer {
  club: string;
  /** Your player they want. */
  give: number;
  get: Footballer;
}

export type CoachStage = "season" | "review" | "trades" | "draft" | "offers" | "sacked";

export interface Coach {
  v: 1;
  seed: number;
  name: string;
  year: number;
  club: string;
  squad: Footballer[];
  nextId: number;
  /** The eighteen, by id. */
  selected: number[];
  tactic: Tactic;
  focus: Focus;
  season: Season;
  /** The board's patience, 0–100: at 0 you're gone. */
  security: number;
  /** 0–100: how the football world rates you. */
  reputation: number;
  /** The board's target: finish this high or better. */
  target: number;
  stage: CoachStage;
  history: CoachYear[];
  news: string[];
  /** Counter for the deterministic randomness. */
  tick: number;
  trades: TradeOffer[];
  draft: { pool: Footballer[]; order: string[]; at: number; log: string[] } | null;
  offers: string[];
  review: { finish: string; verdict: string; awards: string[] } | null;
  totals: { won: number; lost: number; drawn: number; flags: number };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MEN = ["Jack", "Tom", "Lachie", "Josh", "Will", "Sam", "Harry", "Max", "Ollie", "Charlie", "Jye", "Zac", "Riley", "Callum", "Noah", "Darcy", "Toby", "Isaac", "Mitch", "Hayden", "Cooper", "Jordan", "Nick", "Bailey", "Kane", "Luke", "Jake", "Ben", "Dylan", "Ryan", "Archie", "Finn", "Leo", "Hugo", "Xavier"];
const LAST = [
  "Abbott", "Barlow", "Cassidy", "Delaney", "Egan", "Finnigan", "Gleeson", "Halloran", "Irving", "Jolly", "Keane", "Lynch", "Madden", "Neale", "Ogle", "Pendlebury", "Rioli", "Selwood", "Treloar", "Varcoe",
  "Wingard", "Yarran", "Zorko", "Ainsworth", "Bowes", "Crouch", "Dangerfield", "Ebert", "Frawley", "Goodwin", "Hipwood", "Impey", "Josephs", "Kolodjashnij", "Lycett", "Mansell", "Newnes", "Oliver", "Parish", "Rozee",
  "Sicily", "Taranto", "Viney", "Worpel", "Bramble", "Cripps", "Dusty", "Edwards", "Florent", "Gaff", "Hurn", "Jacobs", "Kozzie", "Laird", "Macrae", "Neal-Bullen", "Petracca", "Rowell", "Stringer", "Tom",
];
const INJURIES: [string, number, number][] = [
  ["Hamstring", 2, 4],
  ["Corked thigh", 1, 1],
  ["Ankle", 1, 3],
  ["Concussion", 1, 2],
  ["Calf", 2, 3],
  ["Shoulder", 3, 6],
  ["Knee", 4, 10],
  ["Broken finger", 2, 3],
];

/** The deterministic random stream for the next thing that happens. */
function rng(c: Coach, salt: number): Rng {
  c.tick++;
  return createRng((c.seed * 2654435761 + c.tick * 40503 + salt * 97 + c.year * 31) >>> 0);
}

const pickLast = (r: Rng, used: Set<string>) => {
  let last = LAST[Math.floor(r.next() * LAST.length)];
  for (let k = 0; k < 60 && used.has(last); k++) last = LAST[Math.floor(r.next() * LAST.length)];
  if (used.has(last)) last = `${last} ${used.size}`;
  used.add(last);
  return last;
};

/** A club's list of thirty: its known eighteen plus the depth, rated to the club's standing. */
export function generateSquad(club: string, seed: number, quality: number, startId = 1): Footballer[] {
  const r = createRng(seed >>> 0);
  const base = rosterFor(club);
  // The eighteen are in position order: 0–5 backs, 6–8 centre line, 9–14 forwards, 15–16 on-ballers, 17 ruck.
  const lineOf = (i: number): Line => (i < 6 ? "back" : i < 9 ? "mid" : i < 15 ? "fwd" : i < 17 ? "mid" : "ruck");
  const used = new Set(base.map((p) => p.last));
  const out: Footballer[] = [];
  const mk = (first: string, last: string, line: Line, star: number): Footballer => {
    const age = Math.round(19 + r.next() * 13);
    const rating = clamp(Math.round(quality + star + (r.next() - 0.5) * 10 - Math.max(0, 22 - age) * 1.5), 38, 94);
    const potential = clamp(Math.round(rating + Math.max(0, 25 - age) * (1.5 + r.next() * 2.5) + r.next() * 4), rating, 97);
    return { id: startId + out.length, first, last, line, age, rating, potential, form: 0, fitness: 100, injury: 0, games: Math.max(0, Math.round((age - 19) * (10 + r.next() * 8))), goals: 0, votes: 0, sGames: 0, sGoals: 0, sVotes: 0 };
  };
  base.forEach((p, i) => out.push(mk(p.first, p.last, lineOf(i), i === 6 || i === 15 || i === 16 || i === 12 ? 6 : i % 4 === 0 ? 2 : 0)));
  const depth: Line[] = ["back", "back", "back", "mid", "mid", "mid", "mid", "fwd", "fwd", "fwd", "ruck", "ruck"];
  for (const line of depth) out.push(mk(MEN[Math.floor(r.next() * MEN.length)], pickLast(r, used), line, -7));
  return out;
}

/** How a player stands up this week: rating, form and freshness. */
export const effective = (p: Footballer) => p.rating + p.form * 0.6 - (100 - p.fitness) * 0.12;

/** The best eighteen available: six backs, five mids, six forwards, a ruck (filling gaps from anywhere). */
export function bestEighteen(c: Coach): number[] {
  const fit = c.squad.filter((p) => p.injury === 0).sort((a, b) => effective(b) - effective(a));
  const out: number[] = [];
  for (const l of LINES) out.push(...fit.filter((p) => p.line === l.id).slice(0, l.slots).map((p) => p.id));
  for (const p of fit) if (out.length < 18 && !out.includes(p.id)) out.push(p.id);
  return out.slice(0, 18);
}

/**
 * The eighteen in the match engine's position order: six backs, the centre
 * line, six forwards, two on-ballers and the ruck (the gaps filled from anyone).
 */
export function fieldOrder(c: Coach): Footballer[] {
  const team = c.selected.map((id) => c.squad.find((p) => p.id === id)).filter((p): p is Footballer => !!p);
  const left = [...team];
  const take = (line: Line, n: number) => {
    const out: Footballer[] = [];
    for (const p of left.filter((x) => x.line === line).slice(0, n)) {
      out.push(p);
      left.splice(left.indexOf(p), 1);
    }
    while (out.length < n && left.length) out.push(left.shift()!);
    return out;
  };
  const backs = take("back", 6);
  const centre = take("mid", 3);
  const fwds = take("fwd", 6);
  const ball = take("mid", 2);
  const ruck = take("ruck", 1);
  return [...backs, ...centre, ...fwds, ...ball, ...ruck];
}

/** Your side's strength this week (a rating, ~55–90), with a penalty for a lopsided team. */
export function teamRating(c: Coach, ids = c.selected) {
  const team = ids.map((id) => c.squad.find((p) => p.id === id)).filter((p): p is Footballer => !!p && p.injury === 0);
  if (!team.length) return 40;
  let r = team.reduce((a, p) => a + effective(p), 0) / team.length;
  r -= (18 - team.length) * 3;
  for (const l of LINES) r -= Math.abs(team.filter((p) => p.line === l.id).length - l.slots) * 1.2;
  return r;
}

/** Team rating to the season engine's strength scale (0.84–1.16 for the AI clubs). */
const toK = (rating: number) => clamp(0.84 + ((rating - 58) / 28) * 0.32, 0.7, 1.3);
const qualityOf = (k: number) => Math.round(58 + ((k - 0.84) / 0.32) * 26);

/** Where the experts tip a club to finish this year (1–18). */
export function tipped(s: Season, club: string, ours?: number) {
  const k = (id: string) => (id === club && ours !== undefined ? toK(ours) : strength(s, id));
  return s.clubs.filter((id) => id !== club).filter((id) => k(id) > k(club)).length + 1;
}

/** What the board wants this year, in words. */
export function targetText(t: number) {
  return t <= 2 ? "Win the flag" : t <= 4 ? "A top-four finish" : t <= 8 ? "Make the finals" : t <= 12 ? `Finish ${t}th or better` : "Show some fight: top 14";
}

/** Start a coaching career at any National League club. */
export function newCoach(o: { name: string; club: string; seed: number; year?: number; rounds?: number }): Coach {
  const year = o.year ?? 2027;
  const season = startSeason({ league: "national", club: o.club, seed: o.seed, rounds: o.rounds, year, momentum: true });
  const quality = qualityOf(strength(season, o.club));
  const c: Coach = {
    v: 1,
    seed: o.seed,
    name: o.name.trim().slice(0, 24) || "Coach",
    year,
    club: o.club,
    squad: generateSquad(o.club, o.seed ^ 0x51ed, quality),
    nextId: 31,
    selected: [],
    tactic: "possession",
    focus: "fitness",
    season,
    security: 70,
    reputation: 30,
    target: 9,
    stage: "season",
    history: [],
    news: [],
    tick: 0,
    trades: [],
    draft: null,
    offers: [],
    review: null,
    totals: { won: 0, lost: 0, drawn: 0, flags: 0 },
  };
  c.selected = bestEighteen(c);
  setTarget(c);
  c.news.unshift(`${c.name} is the new senior coach of ${clubById(c.club).name}. The board wants: ${targetText(c.target).toLowerCase()}.`);
  return c;
}

function setTarget(c: Coach) {
  const t = tipped(c.season, c.club, teamRating(c));
  c.target = t <= 2 ? 1 : t <= 4 ? 4 : t <= 8 ? 8 : t <= 12 ? 12 : 14;
}

// -------------------------------------------------------------- matches

export interface CoachEvent {
  q: number;
  /** Minute of the quarter. */
  min: number;
  team: 0 | 1;
  kind: "goal" | "behind" | "injury" | "note";
  text: string;
  /** Your player (goals, injuries). */
  who?: number;
  /** Their scorer's surname. */
  them?: string;
}

/**
 * A match from the coaches' box, a quarter at a time. Between quarters you
 * can change the plan, give a speech and make changes; injuries force them.
 */
export class CoachMatch {
  readonly opponent: string;
  readonly label: string;
  readonly home: boolean;
  /** Quarters played (0–4). */
  q = 0;
  score: [{ g: number; b: number }, { g: number; b: number }] = [
    { g: 0, b: 0 },
    { g: 0, b: 0 },
  ];
  quarters: [number, number][] = [];
  events: CoachEvent[] = [];
  on: number[];
  speech: Speech | null = null;
  tactic: Tactic;
  readonly theirTactic: Tactic;
  private goals = new Map<number, number>();
  private theirGoals = new Map<string, number>();
  private rnd: Rng;
  private prep: number;

  constructor(private c: Coach) {
    const g = nextGame(c.season);
    if (!g) throw new Error("No game to play");
    this.opponent = g.opponent;
    this.label = g.label;
    this.home = g.fixture.home === c.club;
    this.rnd = rng(c, 4242);
    this.on = c.selected.filter((id) => this.player(id)?.injury === 0);
    this.tactic = c.tactic;
    const plans = Object.keys(TACTICS) as Tactic[];
    this.theirTactic = plans[Math.floor(this.rnd.next() * plans.length)];
    this.prep = c.focus === "tactics" ? 1.04 : 1;
  }

  private player(id: number) {
    return this.c.squad.find((p) => p.id === id);
  }

  get done() {
    return this.q >= 4;
  }
  get points(): [number, number] {
    return [this.score[0].g * 6 + this.score[0].b, this.score[1].g * 6 + this.score[1].b];
  }
  /** The bench: fit players not on the field. */
  get bench() {
    return this.c.squad.filter((p) => p.injury === 0 && !this.on.includes(p.id)).sort((a, b) => effective(b) - effective(a));
  }

  /** Swap a player on the field for one on the bench. */
  interchange(off: number, on: number) {
    if (this.done || !this.on.includes(off) || this.on.includes(on) || this.player(on)?.injury) return false;
    this.on = this.on.map((x) => (x === off ? on : x));
    this.events.push({ q: this.q + 1, min: 0, team: 0, kind: "note", text: `${this.player(on)!.first} ${this.player(on)!.last} comes on for ${this.player(off)!.last}.` });
    return true;
  }

  /** Play the next quarter: its goals, behinds and any injuries. */
  playQuarter(): CoachEvent[] {
    if (this.done) return [];
    const r = this.rnd;
    const q = ++this.q;
    const opp = this.opponent;
    const T = TACTICS[this.tactic];
    const O = TACTICS[this.theirTactic];
    const matchup = (T.beats === this.theirTactic ? 1.06 : 1) / (O.beats === this.tactic ? 1.06 : 1);
    const ours = toK(teamRating(this.c, this.on)) * this.prep * (this.home ? 1.03 : 1);
    const theirs = strength(this.c.season, opp) * (this.home ? 1 : 1.03);
    const speech = this.speech;
    const lead = this.points[0] - this.points[1];
    const sp = speech === "fire" ? 1.06 : speech === "backThem" && lead > 0 ? 1.04 : 1;
    const acc = speech === "settle" ? 0.06 : 0;
    // A tired side fades in the last quarter.
    const legs = (q === 4 ? 1 - (T.tiring - 1) * 0.12 : 1) * (speech === "fire" && q === 4 ? 0.98 : 1);
    const expect = (k: number) => 3.9 * k;
    const usK = (ours / theirs) ** 1.6 * T.us * O.them * matchup * sp * legs;
    const themK = (theirs / ours) ** 1.6 * O.us * T.them / matchup;
    const shots = (k: number) => Math.max(0, Math.round(expect(k) + (r.next() + r.next() + r.next() - 1.5) * 2.6));
    const out: CoachEvent[] = [];
    const field = this.on.map((id) => this.player(id)!).filter(Boolean);
    const scorer = () => {
      const w = field.map((p) => (p.line === "fwd" ? 5 : p.line === "mid" ? 1.6 : p.line === "ruck" ? 0.7 : 0.12) * (effective(p) / 70) ** 2);
      let x = r.next() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < field.length; i++) if ((x -= w[i]) <= 0) return field[i];
      return field[field.length - 1];
    };
    const theirNames = rosterFor(opp, this.c.season.women);
    const theirScorer = () => {
      let x = r.next() * GOAL_WEIGHT.reduce((a, b) => a + b, 0);
      for (let i = 0; i < GOAL_WEIGHT.length; i++) if ((x -= GOAL_WEIGHT[i]) <= 0) return theirNames[i].last;
      return theirNames[12].last;
    };
    for (let i = shots(usK); i > 0; i--) {
      const p = scorer();
      const goal = r.next() < 0.52 + acc + (effective(p) - 70) * 0.006;
      const min = Math.ceil(r.next() * 25);
      if (goal) {
        this.score[0].g++;
        this.goals.set(p.id, (this.goals.get(p.id) ?? 0) + 1);
      } else this.score[0].b++;
      out.push({ q, min, team: 0, kind: goal ? "goal" : "behind", who: p.id, text: goal ? `GOAL ${p.last}${(this.goals.get(p.id) ?? 0) > 1 ? ` (his ${this.goals.get(p.id)})` : ""}` : `Behind, ${p.last}` });
    }
    for (let i = shots(themK); i > 0; i--) {
      const last = theirScorer();
      const goal = r.next() < 0.52;
      const min = Math.ceil(r.next() * 25);
      if (goal) {
        this.score[1].g++;
        this.theirGoals.set(last, (this.theirGoals.get(last) ?? 0) + 1);
      } else this.score[1].b++;
      out.push({ q, min, team: 1, kind: goal ? "goal" : "behind", them: last, text: goal ? `${clubById(opp).short} goal: ${last}` : `${clubById(opp).short} behind` });
    }
    // Knocks: about one every other game.
    if (r.next() < (this.c.focus === "fitness" ? 0.09 : 0.14)) {
      const p = field[Math.floor(r.next() * field.length)];
      const [name, lo, hi] = INJURIES[Math.floor(r.next() * INJURIES.length)];
      p.injury = lo + Math.floor(r.next() * (hi - lo + 1));
      p.injuryName = name;
      out.push({ q, min: Math.ceil(r.next() * 25), team: 0, kind: "injury", who: p.id, text: `INJURY: ${p.first} ${p.last} (${name.toLowerCase()}, ${p.injury} week${p.injury > 1 ? "s" : ""})` });
      // The doctors take him off; the best on the bench goes on.
      const sub = this.bench[0];
      if (sub) this.on = this.on.map((x) => (x === p.id ? sub.id : x));
      else this.on = this.on.filter((x) => x !== p.id);
    }
    // Legs: everyone on the ground tires.
    for (const p of field) p.fitness = clamp(p.fitness - (3 + r.next() * 2) * T.tiring * (speech === "fire" ? 1.15 : 1), 20, 100);
    out.sort((a, b) => a.min - b.min);
    this.events.push(...out);
    this.quarters.push(this.points);
    this.speech = null;
    return out;
  }

  /** Coach the rest of the game on autopilot. */
  playOut() {
    while (!this.done) {
      // Sensible changes at the breaks: the most tired off for the freshest on the bench.
      const tired = this.on.map((id) => this.player(id)!).sort((a, b) => a.fitness - b.fitness)[0];
      const fresh = this.bench.find((p) => p.line === tired?.line);
      if (this.q > 0 && tired && fresh && tired.fitness < 70) this.interchange(tired.id, fresh.id);
      if (this.q === 3) this.speech = this.points[0] < this.points[1] ? "fire" : "settle";
      this.playQuarter();
    }
  }

  /** The umpires' 3-2-1 and the goal-kickers, for the season's counts. */
  awards(): { awards: Awards; mine: Record<string, number> } {
    const r = this.rnd;
    const [us, them] = this.points;
    const pool: { key: string; mine?: number; w: number }[] = [];
    for (const id of new Set([...this.c.selected, ...this.on])) {
      const p = this.player(id);
      if (!p) continue;
      pool.push({ key: `${this.c.club}:${p.last}`, mine: p.id, w: ((effective(p) / 70) ** 4) * (1 + (this.goals.get(p.id) ?? 0) * 0.8) * (us >= them ? 2 : 1) * (p.line === "mid" ? 1.6 : 1) });
    }
    rosterFor(this.opponent, this.c.season.women).forEach((p, i) => pool.push({ key: `${this.opponent}:${p.last}`, w: [0.7, 0.5, 0.5, 0.9, 0.8, 0.8, 2.6, 1.6, 1.6, 1.4, 1.1, 1.1, 1.6, 0.9, 0.9, 2.8, 2.5, 1.8][i] * (1 + (this.theirGoals.get(p.last) ?? 0) * 0.8) * (them > us ? 2 : 1) * strength(this.c.season, this.opponent) }));
    const out: Awards = { votes: {}, goals: {} };
    const mine: Record<string, number> = {};
    for (const v of [3, 2, 1]) {
      let x = r.next() * pool.reduce((a, b) => a + b.w, 0);
      let i = 0;
      for (; i < pool.length - 1; i++) if ((x -= pool[i].w) <= 0) break;
      out.votes[pool[i].key] = v;
      if (pool[i].mine !== undefined) {
        const p = this.player(pool[i].mine!)!;
        mine[p.last] = v;
      }
      pool.splice(i, 1);
    }
    for (const [id, n] of this.goals) out.goals[`${this.c.club}:${this.player(id)!.last}`] = n;
    for (const [last, n] of this.theirGoals) out.goals[`${this.opponent}:${last}`] = n;
    return { awards: out, mine };
  }

  /** Goals by your players (id → goals). */
  get ourGoals() {
    return new Map(this.goals);
  }
}

// --------------------------------------------------------- after a game

/**
 * Put a finished game into the season and the club: the ladder, players'
 * games, goals, votes, form and fitness, the week's training, injuries mending,
 * the board's mood, the news.
 */
export function recordCoachGame(c: Coach, res: { us: number; them: number; goals: Map<number, number>; votes: Record<string, number>; awards?: Awards; played: number[] }) {
  if (c.stage !== "season") return;
  const g = nextGame(c.season);
  if (!g) return;
  const r = rng(c, 77);
  const final = c.season.stage === "finals";
  const label = g.label;
  const opp = clubById(g.opponent).name;
  recordResult(c.season, res.us, res.them, final ? {} : res.votes, res.awards);
  const won = res.us > res.them;
  const margin = Math.abs(res.us - res.them);
  if (won) c.totals.won++;
  else if (res.us < res.them) c.totals.lost++;
  else c.totals.drawn++;
  // The players.
  for (const p of c.squad) {
    const played = res.played.includes(p.id);
    const goals = res.goals.get(p.id) ?? 0;
    const votes = res.votes[p.last] ?? 0;
    if (played) {
      p.games++;
      p.sGames++;
      p.goals += goals;
      p.sGoals += goals;
      if (!final) {
        p.votes += votes;
        p.sVotes += votes;
      }
      p.form = clamp(p.form * 0.7 + (won ? 1.5 : -1.5) + goals * 0.8 + votes * 1.2 + (r.next() - 0.5) * 3, -10, 10);
    } else p.form = clamp(p.form * 0.85, -10, 10);
    // The week: rest, training, mending.
    const mend = c.focus === "recovery" ? 2 : 1;
    if (p.injury > 0) {
      p.injury = Math.max(0, p.injury - mend);
      if (p.injury === 0) delete p.injuryName;
    }
    p.fitness = clamp(p.fitness + (played ? 10 : 22) + (c.focus === "recovery" ? 12 : c.focus === "fitness" ? 6 : 0) - (c.focus === "fitness" ? 2 : 0), 30, 100);
    if (c.focus === "skills" && p.age <= 23 && r.next() < 0.25 && p.rating < p.potential) p.rating++;
  }
  // The board.
  if (final) c.security = clamp(c.security + (won ? 6 : -2), 0, 100);
  else c.security = clamp(c.security + (won ? 2 : res.us === res.them ? 0 : margin >= 50 ? -7 : -3) + (won && margin >= 50 ? 1 : 0), 0, 100);
  // The news.
  const best = [...res.goals.entries()].sort((a, b) => b[1] - a[1])[0];
  const scorer = best && best[1] >= 4 ? c.squad.find((p) => p.id === best[0]) : null;
  c.news.unshift(
    `${label}: ${won ? "beat" : res.us < res.them ? "lost to" : "drew with"} ${opp} ${res.us}–${res.them}.${scorer ? ` ${scorer.first} ${scorer.last} kicked ${best![1]}.` : ""}${margin >= 50 && !won ? " The board wants answers." : ""}`,
  );
  c.news = c.news.slice(0, 12);
  // Out of their patience: sacked mid-season.
  if (c.security <= 0 && c.season.stage !== "done") return sack(c);
  // Keep the team picked: injured players out, the best available in.
  c.selected = c.selected.filter((id) => c.squad.find((p) => p.id === id)?.injury === 0);
  if (c.selected.length < 18) c.selected = [...c.selected, ...bestEighteen(c).filter((id) => !c.selected.includes(id))].slice(0, 18);
  if (c.season.stage === "done") review(c);
}

/** Coach your next game on autopilot. */
export function simCoachGame(c: Coach) {
  const m = new CoachMatch(c);
  m.playOut();
  const { awards, mine } = m.awards();
  const [us, them] = m.points;
  recordCoachGame(c, { us, them, goals: m.ourGoals, votes: mine, awards, played: [...new Set([...c.selected, ...m.on])] });
  return m;
}

function sack(c: Coach) {
  const pos = ladder(c.season).findIndex((r) => r.id === c.club) + 1;
  c.history.push({ year: c.year, club: c.club, finish: `Sacked (${pos}${pos === 1 ? "st" : pos === 2 ? "nd" : pos === 3 ? "rd" : "th"} at the time)`, position: pos, won: 0, lost: 0, drawn: 0, flag: false, target: c.target, award: false, sacked: true });
  c.stage = "sacked";
  c.reputation = clamp(c.reputation - 15, 0, 100);
  c.news.unshift(`SACKED: ${clubById(c.club).name} have parted ways with ${c.name}.`);
  // Struggling clubs will still talk to you.
  const s = c.season;
  const weak = s.clubs.filter((id) => id !== c.club).sort((a, b) => strength(s, a) - strength(s, b));
  c.offers = weak.slice(0, 3);
}

/** The season's over: the verdict, awards, the board. */
function review(c: Coach) {
  const s = c.season;
  const pos = ladder(s).findIndex((r) => r.id === c.club) + 1;
  const row = ladder(s)[pos - 1];
  const flag = premiers(s);
  const fin = finish(s);
  const awards: string[] = [];
  const beat = c.target - pos;
  if (flag) {
    c.totals.flags++;
    awards.push(`${s.year ?? c.year} PREMIERS`);
    c.security = 100;
    c.reputation = clamp(c.reputation + 18, 0, 100);
  } else {
    c.security = clamp(c.security + beat * 5 + (pos <= 8 ? 6 : 0), 0, 100);
    c.reputation = clamp(c.reputation + beat * 2 + (pos <= 8 ? 4 : -2), 0, 100);
  }
  const award = beat >= 4 || (flag && c.target > 2);
  if (award) awards.push("Coach of the Year");
  const top = [...c.squad].sort((a, b) => b.sVotes - a.sVotes)[0];
  if (top?.sVotes) awards.push(`Best and fairest: ${top.first} ${top.last} (${top.sVotes} votes)`);
  const kicker = [...c.squad].sort((a, b) => b.sGoals - a.sGoals)[0];
  if (kicker?.sGoals) awards.push(`Leading goalkicker: ${kicker.first} ${kicker.last} (${kicker.sGoals})`);
  const verdict = flag
    ? "The board is over the moon. A premiership coach: you have a job for life."
    : beat >= 3
      ? "The board is thrilled: well ahead of where you were tipped."
      : beat >= 0
        ? "The board is satisfied. Target met."
        : beat >= -3
          ? "The board is disappointed. Next year has to be better."
          : "The board is furious. You're on thin ice.";
  c.history.push({ year: c.year, club: c.club, finish: fin, position: pos, won: row.won, lost: row.lost, drawn: row.drawn, flag, target: c.target, award, sacked: false });
  c.review = { finish: fin, verdict, awards };
  c.news.unshift(flag ? `PREMIERS! ${c.name} coaches ${clubById(c.club).name} to the ${s.year ?? c.year} flag!` : `Season over: ${fin}. ${verdict}`);
  c.stage = c.security <= 12 ? "sacked" : "review";
  if (c.stage === "sacked") {
    c.history[c.history.length - 1].sacked = true;
    c.news.unshift(`SACKED: after missing the target, ${clubById(c.club).name} move on from ${c.name}.`);
    const weak = s.clubs.filter((id) => id !== c.club).sort((a, b) => strength(s, a) - strength(s, b));
    c.offers = weak.slice(0, 3);
  }
}

// ------------------------------------------------------------ off-season

/** On from the year in review to the trade period: four offers from other clubs. */
export function openTrades(c: Coach) {
  if (c.stage !== "review") return;
  const r = rng(c, 3131);
  c.trades = [];
  const others = NATIONAL.map((x) => x.id).filter((id) => id !== c.club);
  const mine = [...c.squad].sort((a, b) => b.rating - a.rating);
  for (let i = 0; i < 4; i++) {
    // They want one of your good players; they offer a different shape of player of similar value.
    const want = mine[Math.floor(r.next() * Math.min(14, mine.length))];
    if (!want || c.trades.some((t) => t.give === want.id)) continue;
    const club = others[Math.floor(r.next() * others.length)];
    const younger = r.next() < 0.5;
    const age = clamp(want.age + (younger ? -3 - Math.floor(r.next() * 4) : 2 + Math.floor(r.next() * 4)), 19, 33);
    const rating = clamp(want.rating + (younger ? -3 : 2) + Math.round((r.next() - 0.5) * 6), 45, 95);
    const lines: Line[] = ["back", "mid", "fwd", "ruck"];
    const get: Footballer = {
      id: c.nextId++,
      first: MEN[Math.floor(r.next() * MEN.length)],
      last: pickLast(r, new Set(c.squad.map((p) => p.last))),
      line: r.next() < 0.6 ? want.line : lines[Math.floor(r.next() * 3)],
      age,
      rating,
      potential: clamp(rating + Math.max(0, 25 - age) * 2.5, rating, 96),
      form: 0,
      fitness: 100,
      injury: 0,
      games: Math.max(0, (age - 19) * 14),
      goals: 0,
      votes: 0,
      sGames: 0,
      sGoals: 0,
      sVotes: 0,
    };
    c.trades.push({ club, give: want.id, get });
  }
  c.stage = "trades";
}

export function acceptTrade(c: Coach, i: number) {
  const t = c.trades[i];
  if (c.stage !== "trades" || !t) return false;
  const gone = c.squad.find((p) => p.id === t.give);
  if (!gone) return false;
  c.squad = c.squad.filter((p) => p.id !== t.give);
  c.squad.push(t.get);
  c.news.unshift(`TRADE: ${gone.first} ${gone.last} to ${clubById(t.club).name} for ${t.get.first} ${t.get.last}.`);
  c.trades = c.trades.filter((x) => x !== t && x.give !== t.give);
  c.selected = c.selected.filter((id) => id !== t.give);
  return true;
}

/** The scouts' read on a draftee: a letter grade from the (noisy) potential. */
export function scoutGrade(p: Footballer) {
  const guess = p.potential + ((p.id * 37) % 9) - 4;
  return guess >= 88 ? "A+" : guess >= 82 ? "A" : guess >= 76 ? "B" : guess >= 70 ? "C" : "D";
}

/** The national draft: two rounds, the worst club picks first. */
export function openDraft(c: Coach) {
  if (c.stage !== "trades") return;
  const r = rng(c, 5151);
  const used = new Set(c.squad.map((p) => p.last));
  const pool: Footballer[] = [];
  const lines: Line[] = ["back", "mid", "mid", "fwd", "fwd", "back", "ruck"];
  for (let i = 0; i < 44; i++) {
    const rating = Math.round(44 + r.next() * 16);
    pool.push({ id: c.nextId++, first: MEN[Math.floor(r.next() * MEN.length)], last: pickLast(r, used), line: lines[i % lines.length], age: 18, rating, potential: clamp(Math.round(rating + 14 + r.next() * 30), rating, 97), form: 0, fitness: 100, injury: 0, games: 0, goals: 0, votes: 0, sGames: 0, sGoals: 0, sVotes: 0 });
  }
  const order = ladder(c.season)
    .map((x) => x.id)
    .reverse();
  // The premiers pick last, the runner-up second-last.
  const s = c.season;
  if (s.premier) {
    const gf = s.finals.find((f) => f.key === "GF");
    const ru = gf ? (gf.home === s.premier ? gf.away : gf.home) : "";
    for (const id of [ru, s.premier]) {
      const i = order.indexOf(id);
      if (i >= 0) order.push(...order.splice(i, 1));
    }
  }
  c.draft = { pool, order: [...order, ...order], at: 0, log: [] };
  c.stage = "draft";
  runDraft(c);
}

/** AI clubs pick (best grade first) until it's your turn or the draft's done. */
function runDraft(c: Coach) {
  const d = c.draft!;
  while (d.at < d.order.length && d.order[d.at] !== c.club) {
    const pick = [...d.pool].sort((a, b) => b.potential + b.rating * 0.5 - (a.potential + a.rating * 0.5))[Math.floor(((d.at * 7) % 3) / 2)];
    if (!pick) break;
    d.pool = d.pool.filter((p) => p !== pick);
    d.log.push(`Pick ${d.at + 1}: ${clubById(d.order[d.at]).short} take ${pick.first} ${pick.last}`);
    d.at++;
  }
}

/** Your pick: the draft runs on to your next one. */
export function draftPick(c: Coach, id: number) {
  const d = c.draft;
  if (c.stage !== "draft" || !d || d.order[d.at] !== c.club) return false;
  const p = d.pool.find((x) => x.id === id);
  if (!p) return false;
  d.pool = d.pool.filter((x) => x !== p);
  p.drafted = c.year;
  c.squad.push(p);
  d.log.push(`Pick ${d.at + 1}: ${clubById(c.club).short} take ${p.first} ${p.last}`);
  c.news.unshift(`DRAFT: with pick ${d.at + 1}, ${clubById(c.club).name} select ${p.first} ${p.last} (${scoutGrade(p)}).`);
  d.at++;
  runDraft(c);
  return true;
}

/** Your pick number now, or null if the draft's done. */
export const yourPick = (c: Coach) => (c.draft && c.draft.at < c.draft.order.length && c.draft.order[c.draft.at] === c.club ? c.draft.at + 1 : null);

/** After the draft: offers from other clubs, if you've made a name. */
export function closeDraft(c: Coach) {
  if (c.stage !== "draft") return;
  c.draft = null;
  const r = rng(c, 6161);
  c.offers = [];
  if (c.reputation >= 45) {
    const s = c.season;
    const others = s.clubs.filter((id) => id !== c.club).sort((a, b) => strength(s, b) - strength(s, a));
    const from = c.reputation >= 70 ? others.slice(0, 6) : others.slice(4, 14);
    for (let i = 0; i < 2; i++) {
      const id = from[Math.floor(r.next() * from.length)];
      if (id && !c.offers.includes(id)) c.offers.push(id);
    }
  }
  c.stage = c.offers.length ? "offers" : "review";
  if (!c.offers.length) startYear(c);
}

/** Take a job (after the draft, or after the sack). */
export function takeJob(c: Coach, club: string) {
  if ((c.stage !== "offers" && c.stage !== "sacked") || !c.offers.includes(club)) return false;
  const sacked = c.stage === "sacked";
  c.news.unshift(`${c.name} is appointed senior coach of ${clubById(club).name}.`);
  c.club = club;
  c.offers = [];
  c.security = 65;
  if (sacked) {
    // Finish out the year away from the game; start fresh next season.
    c.review = null;
  }
  startYear(c, true);
  return true;
}

/** Stay put (turn down the offers). */
export function stay(c: Coach) {
  if (c.stage !== "offers") return;
  c.offers = [];
  startYear(c);
}

/** A new year: everyone a year older, development and decline, retirements, rookies, a new season. */
export function startYear(c: Coach, newClub = false) {
  const r = rng(c, 7171);
  const old = c.season;
  c.year++;
  if (newClub) {
    // A new list at the new club, rated to its standing.
    const probe = startSeason({ league: "national", club: c.club, seed: (c.seed + c.year * 7919) >>> 0, year: c.year, momentum: true });
    c.squad = generateSquad(c.club, (c.seed ^ c.year) >>> 0, qualityOf(strength(probe, c.club)), c.nextId);
    c.nextId += c.squad.length;
    c.season = startSeason({ league: "national", club: c.club, seed: probe.seed, rounds: old.rounds, year: c.year, momentum: true, honours: old.honours });
  } else {
    const retired: string[] = [];
    for (const p of c.squad) {
      p.age++;
      const d = p.age <= 23 ? (p.potential - p.rating) * (0.16 + r.next() * 0.12) + r.next() * 2 : p.age <= 28 ? r.next() * 2.5 - 0.6 : p.age <= 31 ? -r.next() * 2.5 : -(1.5 + r.next() * 3);
      p.rating = clamp(Math.round(p.rating + d), 35, 97);
    }
    c.squad = c.squad.filter((p) => {
      const go = p.age >= 35 || (p.age >= 32 && r.next() < 0.45) || (p.age >= 29 && p.rating < 55 && r.next() < 0.5);
      if (go) retired.push(`${p.first} ${p.last}`);
      return !go;
    });
    if (retired.length) c.news.unshift(`Retiring: ${retired.slice(0, 5).join(", ")}${retired.length > 5 ? ` and ${retired.length - 5} more` : ""}.`);
    // Trim the list to 34 (delist the lowest-rated), top it up to 30 with rookies.
    c.squad.sort((a, b) => b.rating - a.rating);
    if (c.squad.length > 34) c.squad.length = 34;
    const used = new Set(c.squad.map((p) => p.last));
    const need: Line[] = ["back", "mid", "fwd", "ruck", "mid", "fwd", "back"];
    for (let i = 0; c.squad.length < 30; i++) {
      const rating = Math.round(46 + r.next() * 10);
      c.squad.push({ id: c.nextId++, first: MEN[Math.floor(r.next() * MEN.length)], last: pickLast(r, used), line: need[i % need.length], age: 19, rating, potential: rating + 10 + Math.round(r.next() * 20), form: 0, fitness: 100, injury: 0, games: 0, goals: 0, votes: 0, sGames: 0, sGoals: 0, sVotes: 0 });
    }
    c.season = nextYear(old, c.club);
    c.season.year = c.year;
  }
  for (const p of c.squad) {
    Object.assign(p, { form: 0, fitness: 100, injury: 0, sGames: 0, sGoals: 0, sVotes: 0 });
    delete p.injuryName;
  }
  c.selected = bestEighteen(c);
  setTarget(c);
  c.review = null;
  c.trades = [];
  c.stage = "season";
  c.news.unshift(`${c.year}: a new season at ${clubById(c.club).name}. The board wants: ${targetText(c.target).toLowerCase()}.`);
  c.news = c.news.slice(0, 12);
}

/** Your record as a coach. */
export function coachRecord(c: Coach) {
  const t = c.totals;
  const games = t.won + t.lost + t.drawn;
  return { games, ...t, pct: games ? Math.round(((t.won + t.drawn / 2) / games) * 1000) / 10 : 0 };
}

export function parseCoach(raw: unknown): Coach | null {
  const c = raw as Coach | null;
  return c && c.v === 1 && Array.isArray(c.squad) && c.season && c.season.v === 2 ? c : null;
}
