import { createRng, type Rng } from "../engine/rng";
import { CAREERS, CARS, careerById, DEGREES, type Degree } from "./careers";

/**
 * Life's life-sim layer: one person from birth to death in Harbour City.
 * Every "Age up" is a year: school, work, money, relationships, health and
 * random events with choices. You can play the days in between in the 3D
 * world (your house, your job, the town), which feeds back into the year.
 * When you die you can carry on as one of your children.
 *
 * Everything here is pure data + functions on a `Life`, seeded, so a life is
 * reproducible and the whole thing is unit-tested without a browser.
 */

export type Sex = "M" | "F";
export type Stat = "happiness" | "health" | "smarts" | "looks";
export type RelKind = "mother" | "father" | "sibling" | "friend" | "partner" | "spouse" | "child" | "ex";

export interface Npc {
  id: number;
  first: string;
  last: string;
  sex: Sex;
  /** Age in the year they were last updated (their age moves with yours). */
  age: number;
  looks: number;
  smarts: number;
  money: number;
  job: string;
  alive: boolean;
}

export interface Relation {
  npc: Npc;
  kind: RelKind;
  /** 0–100. */
  closeness: number;
}

export interface LogEntry {
  age: number;
  text: string;
}

export interface Home {
  /** Plot id in the town (see world.ts); -1 is your parents' place. */
  plot: number;
  owned: boolean;
  /** Rent a year when not owned. */
  rent: number;
}

export interface Job {
  career: string;
  level: number;
  performance: number;
  years: number;
}

export interface Life {
  v: 1;
  seed: number;
  /** Year counter for the RNG and the calendar. */
  year: number;
  generation: number;
  me: { first: string; last: string; sex: Sex; age: number; alive: boolean; cause: string };
  stats: Record<Stat, number>;
  /** Hidden: how kind you are. */
  karma: number;
  money: number;
  relations: Relation[];
  nextNpc: number;
  /** School: stage and grades (0–100). */
  school: { stage: "none" | "primary" | "high" | "uni" | "done"; grades: number; uni?: Degree; uniYears?: number; dropped?: boolean };
  degrees: Degree[];
  job: Job | null;
  jobsHeld: string[];
  home: Home;
  cars: string[];
  /** Years left in prison (0 = free), and the record. */
  prison: number;
  record: string[];
  conditions: string[];
  fame: number;
  /** Investments: an index fund (its value) and rental properties, with the market's recent years. */
  invest?: { shares: number; property: Property[]; history: number[] };
  pets?: Pet[];
  /** Social media followers. */
  followers?: number;
  /** Places you've been. */
  travels?: string[];
  /** Events waiting for a choice. */
  pending: string[];
  /** Activities done this year (once a year each). */
  doneThisYear: string[];
  /** The 3D world's needs averaged over the days you played this year (0–100), if any. */
  dayNeeds: number[];
  log: LogEntry[];
  /** Totals across the life (for the score and ribbons). */
  totals: { earned: number; partners: number; kids: number; crimes: number; promotions: number; daysPlayed: number; housesBuilt: number };
  /** The world's saved house builds (plot id → build). */
  builds: Record<number, unknown>;
}

// ------------------------------------------------------------------ names

const MALE = ["Liam", "Noah", "Oliver", "Jack", "Leo", "Ethan", "Lucas", "Mason", "Arjun", "Kai", "Mateo", "Hugo", "Isaac", "Theo", "Omar", "Felix", "Ravi", "Sam", "Max", "Finn", "Elijah", "Daniel", "Ari", "Jonah", "Malik", "Hiro", "Diego", "Caleb"];
const FEMALE = ["Olivia", "Amelia", "Isla", "Ava", "Mia", "Grace", "Zoe", "Chloe", "Aria", "Lily", "Priya", "Sofia", "Hana", "Maya", "Ruby", "Ella", "Nora", "Leila", "Ivy", "Freya", "Zara", "Layla", "Emma", "Sienna", "Aisha", "Yuki", "Lucia", "Hazel"];
const LAST = ["Walker", "Nguyen", "Patel", "Smith", "Chen", "Garcia", "Kelly", "Rossi", "Okafor", "Fischer", "Cohen", "Tanaka", "Silva", "Murphy", "Khan", "Novak", "Hughes", "Reyes", "Andersen", "Moreau", "Brooks", "Haddad", "Kowalski", "Dube", "Laurent", "Ibrahim", "Sato", "Bennett"];

export const firstName = (r: Rng, sex: Sex) => r.pick(sex === "M" ? MALE : FEMALE);
export const lastName = (r: Rng) => r.pick(LAST);

// ---------------------------------------------------------------- helpers

export const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));
export const rngFor = (l: Life, salt = 0) => createRng((l.seed * 31 + l.year * 977 + l.log.length * 7 + salt) >>> 0);

export function bump(l: Life, s: Stat, d: number) {
  l.stats[s] = clamp(Math.round(l.stats[s] + d));
}

export function say(l: Life, text: string) {
  l.log.push({ age: l.me.age, text });
  return text;
}

export const fullName = (p: { first: string; last: string }) => `${p.first} ${p.last}`;
export const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

export function newNpc(l: Life, r: Rng, o: Partial<Npc> = {}): Npc {
  const sex: Sex = o.sex ?? (r.next() < 0.5 ? "M" : "F");
  return {
    id: l.nextNpc++,
    first: o.first ?? firstName(r, sex),
    last: o.last ?? lastName(r),
    sex,
    age: o.age ?? l.me.age,
    looks: o.looks ?? Math.round(20 + r.next() * 75),
    smarts: o.smarts ?? Math.round(20 + r.next() * 75),
    money: o.money ?? Math.round(r.next() * 60000),
    job: o.job ?? "",
    alive: true,
  };
}

export const rel = (l: Life, kind: RelKind) => l.relations.filter((x) => x.kind === kind && x.npc.alive);
export const partner = (l: Life) => l.relations.find((x) => (x.kind === "partner" || x.kind === "spouse") && x.npc.alive) ?? null;
export const isAdult = (l: Life) => l.me.age >= 18;
export const livesWithParents = (l: Life) => l.home.plot < 0;

// ------------------------------------------------------------------ birth

export interface NewLifeOpts {
  first?: string;
  last?: string;
  sex?: Sex;
  /** Carry on from a parent (generation, money, house, builds). */
  heir?: { generation: number; money: number; home: Home; builds: Record<number, unknown>; cars: string[] };
}

export function newLife(seed: number, o: NewLifeOpts = {}): Life {
  const r = createRng(seed);
  const sex: Sex = o.sex ?? (r.next() < 0.5 ? "M" : "F");
  const last = o.last ?? lastName(r);
  const l: Life = {
    v: 1,
    seed,
    year: 2026,
    generation: o.heir?.generation ?? 1,
    me: { first: o.first ?? firstName(r, sex), last, sex, age: 0, alive: true, cause: "" },
    stats: { happiness: Math.round(60 + r.next() * 40), health: Math.round(70 + r.next() * 30), smarts: Math.round(15 + r.next() * 85), looks: Math.round(15 + r.next() * 85) },
    karma: 50,
    money: o.heir?.money ?? 0,
    relations: [],
    nextNpc: 1,
    school: { stage: "none", grades: 60 },
    degrees: [],
    job: null,
    jobsHeld: [],
    home: o.heir?.home ?? { plot: -1, owned: false, rent: 0 },
    cars: o.heir?.cars ?? [],
    prison: 0,
    record: [],
    conditions: [],
    fame: 0,
    pending: [],
    doneThisYear: [],
    dayNeeds: [],
    log: [],
    totals: { earned: 0, partners: 0, kids: 0, crimes: 0, promotions: 0, daysPlayed: 0, housesBuilt: 0 },
    builds: o.heir?.builds ?? {},
  };
  if (!o.heir) {
    const mum = newNpc(l, r, { sex: "F", last, age: Math.round(24 + r.next() * 14), job: r.pick(CAREERS).ladder[1] ?? "" });
    const dad = newNpc(l, r, { sex: "M", last, age: Math.round(25 + r.next() * 15), job: r.pick(CAREERS).ladder[1] ?? "" });
    l.relations.push({ npc: mum, kind: "mother", closeness: 70 + Math.round(r.next() * 30) }, { npc: dad, kind: "father", closeness: 60 + Math.round(r.next() * 40) });
    const sibs = Math.floor(r.next() * 3);
    for (let i = 0; i < sibs; i++) l.relations.push({ npc: newNpc(l, r, { last, age: 1 + Math.floor(r.next() * 9) }), kind: "sibling", closeness: 50 + Math.round(r.next() * 40) });
  }
  say(l, `I was born a ${sex === "M" ? "boy" : "girl"} in Harbour City. My name is ${fullName(l.me)}.`);
  const parents = l.relations.filter((x) => x.kind === "mother" || x.kind === "father");
  if (parents.length) say(l, `My parents are ${parents.map((p) => `${fullName(p.npc)} (${p.npc.job || "unemployed"})`).join(" and ")}.`);
  return l;
}

// ----------------------------------------------------------------- ageing

/** Chance of dying this year from old age and ill health. */
export function deathChance(age: number, health: number) {
  const base = age < 50 ? 0.0008 : age < 70 ? 0.006 + (age - 50) * 0.0012 : 0.03 + (age - 70) * 0.012;
  return Math.min(0.95, base * (1 + (100 - health) / 25) + (health <= 3 ? 0.6 : 0));
}

/** Yearly take-home pay for a job level. */
export function salary(l: Life) {
  if (!l.job) return 0;
  const c = careerById(l.job.career);
  return c ? c.pay[Math.min(l.job.level, c.pay.length - 1)] : 0;
}

/** Living costs a year: rent or upkeep, food, cars. */
export function costs(l: Life) {
  if (!isAdult(l) || livesWithParents(l)) return 0;
  const home = l.home.owned ? 4000 : l.home.rent;
  const kids = rel(l, "child").filter((c) => c.npc.age < 18).length * 9000;
  return home + 9000 + l.cars.length * 2500 + kids;
}

/** One year passes. Returns the year's headlines. */
export function ageUp(l: Life): string[] {
  if (!l.me.alive) return [];
  const r = rngFor(l, 1);
  const out: string[] = [];
  const add = (t: string) => out.push(say(l, t));
  l.me.age++;
  l.year++;
  l.doneThisYear = [];
  // How the days you played went.
  if (l.dayNeeds.length) {
    const avg = l.dayNeeds.reduce((a, b) => a + b, 0) / l.dayNeeds.length;
    bump(l, "happiness", (avg - 55) / 6);
    bump(l, "health", (avg - 50) / 10);
    l.dayNeeds = [];
  }
  // Everyone else gets older too.
  for (const x of l.relations) {
    if (!x.npc.alive) continue;
    x.npc.age++;
    x.closeness = clamp(x.closeness - (x.kind === "friend" ? 4 : 2) + Math.round((r.next() - 0.5) * 4));
    if (x.kind !== "child" && x.npc.age > 60 && r.next() < deathChance(x.npc.age, 70)) {
      x.npc.alive = false;
      add(`My ${x.kind === "mother" ? "mother" : x.kind === "father" ? "father" : x.kind} ${fullName(x.npc)} died at ${x.npc.age}.`);
      bump(l, "happiness", -15);
      // Inheritance from parents.
      if ((x.kind === "mother" || x.kind === "father") && x.npc.money > 0) {
        const share = Math.round(x.npc.money * 0.5);
        l.money += share;
        add(`I inherited ${money(share)}.`);
      }
    }
    // Friends drift away.
    if (x.kind === "friend" && x.closeness <= 0) x.kind = "ex";
  }
  l.relations = l.relations.filter((x) => !(x.kind === "ex" && x.closeness <= 0));
  // Prison.
  if (l.prison > 0) {
    l.prison--;
    bump(l, "happiness", -8);
    bump(l, "health", -2);
    add(l.prison ? `Another year behind bars. ${l.prison} to go.` : "I was released from prison.");
  }
  // School.
  schoolYear(l, r, add);
  // Work.
  if (l.job && !l.prison) workYear(l, r, add);
  // Money.
  const pay = l.prison ? 0 : Math.round(salary(l) * 0.72);
  const cost = costs(l);
  if (pay) {
    l.money += pay;
    l.totals.earned += pay;
  }
  if (cost) {
    l.money -= cost;
    if (l.money < 0 && !l.home.owned && !livesWithParents(l)) {
      add("I couldn't make rent and had to move back in with family.");
      l.home = { plot: -1, owned: false, rent: 0 };
      bump(l, "happiness", -10);
    }
  }
  // Investments, pets and fame.
  yearExtras(l, r, add);
  // Body and mind.
  if (l.me.age > 45) bump(l, "health", -(0.5 + (l.me.age - 45) / 25) - r.next() * 1.5);
  if (l.me.age > 40) bump(l, "looks", -r.next() * 1.2);
  if (l.me.age < 18) bump(l, "smarts", r.next() * 2);
  const p = partner(l);
  if (p) bump(l, "happiness", (p.closeness - 50) / 15);
  if (l.conditions.length) bump(l, "health", -3 * l.conditions.length);
  if (r.next() < 0.04 + (100 - l.stats.health) / 1500) {
    const c = r.pick(["the flu", "a broken arm", "migraines", "high blood pressure", "back pain", "asthma", "insomnia"]);
    if (!l.conditions.includes(c)) {
      l.conditions.push(c);
      add(`I came down with ${c}.`);
      bump(l, "health", -6);
    }
  }
  // Kids grow up and leave.
  for (const c of rel(l, "child")) if (c.npc.age === 18) add(`My ${c.npc.sex === "M" ? "son" : "daughter"} ${c.npc.first} turned 18.`);
  // Birthdays.
  if (l.me.age === 18) add("I'm 18! I can move out, work full-time and go to university.");
  if (l.me.age === 16 && !l.cars.length) add("I'm old enough to get my driver's licence.");
  // A random event or two.
  const evs = pickEvents(l, r);
  l.pending.push(...evs);
  // Death.
  if (l.me.age > 1 && r.next() < deathChance(l.me.age, l.stats.health)) die(l, l.stats.health < 15 ? "illness" : "old age");
  return out;
}

function schoolYear(l: Life, r: Rng, add: (t: string) => void) {
  const s = l.school;
  const g = () => clamp(Math.round(s.grades + (l.stats.smarts - 50) / 10 + (r.next() - 0.5) * 12));
  if (l.me.age === 5 && s.stage === "none") {
    s.stage = "primary";
    add("I started primary school at Harbour Primary.");
  } else if (l.me.age === 12 && s.stage === "primary") {
    s.stage = "high";
    add("I started high school at Bayview High.");
  } else if (s.stage === "primary" || s.stage === "high") {
    s.grades = g();
  }
  if (l.me.age === 18 && s.stage === "high") {
    if (s.grades >= 35 || l.stats.smarts >= 40) {
      l.degrees.push("high");
      add(`I graduated from high school with ${s.grades >= 80 ? "honours" : s.grades >= 60 ? "good grades" : "a pass"}.`);
      bump(l, "happiness", 6);
    } else add("I didn't graduate from high school.");
    s.stage = "done";
  }
  if (s.stage === "uni" && s.uni) {
    s.grades = g();
    s.uniYears = (s.uniYears ?? 0) + 1;
    const d = DEGREES.find((x) => x.id === s.uni)!;
    if (s.uniYears >= d.years) {
      if (s.grades >= 40) {
        l.degrees.push(s.uni);
        add(`I graduated from Harbour University with a degree in ${d.name}!`);
        bump(l, "happiness", 10);
        bump(l, "smarts", 5);
      } else add(`I failed my final year of ${d.name}.`);
      s.stage = "done";
      s.uni = undefined;
    }
  }
}

function workYear(l: Life, r: Rng, add: (t: string) => void) {
  const j = l.job!;
  const c = careerById(j.career);
  if (!c) return;
  j.years++;
  j.performance = clamp(Math.round(j.performance + (l.stats.smarts - 50) / 20 + (r.next() - 0.45) * 14));
  if (j.performance >= 80 && j.level < c.ladder.length - 1 && r.next() < 0.5) {
    j.level++;
    j.performance = 55;
    l.totals.promotions++;
    add(`I was promoted to ${c.ladder[j.level]}!`);
    bump(l, "happiness", 8);
  } else if (j.performance <= 15 && r.next() < 0.6) {
    add(`I was fired from my job as ${c.ladder[j.level]}.`);
    l.job = null;
    bump(l, "happiness", -12);
  }
  if ((c.id === "musician" || c.id === "actor") && l.job) l.fame = clamp(l.fame + j.level * 3 + (l.stats.looks - 50) / 10);
}

export function die(l: Life, cause: string) {
  // The estate: investments are sold for the heirs.
  const estate = investValue(l);
  if (estate > 0) {
    l.money += estate;
    l.invest = { shares: 0, property: [], history: l.invest?.history ?? [] };
  }
  l.me.alive = false;
  l.me.cause = cause;
  l.pending = [];
  say(l, `I died of ${cause} at the age of ${l.me.age}.`);
}

// ----------------------------------------------------------------- events

export interface Choice {
  label: string;
  do: (l: Life, r: Rng) => string;
}
export interface LifeEvent {
  id: string;
  min: number;
  max: number;
  weight?: number;
  when?: (l: Life) => boolean;
  text: (l: Life, r: Rng) => string;
  choices: Choice[];
}

/** The year's random events (0–2). */
function pickEvents(l: Life, r: Rng) {
  const pool = EVENTS.filter((e) => l.me.age >= e.min && l.me.age <= e.max && (!e.when || e.when(l)) && !(l.prison > 0 && !e.id.startsWith("prison")));
  const n = l.me.age < 3 ? 0 : r.next() < 0.35 ? 2 : r.next() < 0.75 ? 1 : 0;
  const out: string[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const total = pool.reduce((a, e) => a + (e.weight ?? 1), 0);
    let k = r.next() * total;
    const e = pool.find((x) => (k -= x.weight ?? 1) <= 0) ?? pool[0];
    out.push(e.id);
    pool.splice(pool.indexOf(e), 1);
  }
  return out;
}

export function eventById(id: string) {
  return EVENTS.find((e) => e.id === id);
}

/** Answer the first pending event. */
export function choose(l: Life, index: number) {
  const id = l.pending.shift();
  const e = id ? eventById(id) : undefined;
  if (!e) return "";
  const c = e.choices[Math.max(0, Math.min(e.choices.length - 1, index))];
  return say(l, c.do(l, rngFor(l, 7 + index)));
}

const pct = (r: Rng, p: number) => r.next() < p;

export const EVENTS: LifeEvent[] = [
  {
    id: "toddler-tantrum",
    min: 3,
    max: 5,
    text: () => "You really want a toy at the shop and your parent said no.",
    choices: [
      { label: "Throw a tantrum", do: (l) => (bump(l, "happiness", -3), (l.karma -= 2), "I screamed the shop down. Everyone stared.") },
      { label: "Ask nicely", do: (l, r) => (pct(r, 0.5) ? (bump(l, "happiness", 6), "I asked nicely and got the toy!") : (bump(l, "happiness", -2), "I asked nicely. Still no.")) },
      { label: "Let it go", do: (l) => ((l.karma += 2), "I let it go. My parent was proud.") },
    ],
  },
  {
    id: "bully",
    min: 7,
    max: 16,
    text: (l, r) => `A kid called ${firstName(r, r.next() < 0.5 ? "M" : "F")} has been bullying you at ${l.me.age < 12 ? "school" : "Bayview High"}.`,
    choices: [
      { label: "Stand up to them", do: (l, r) => (pct(r, 0.5 + (l.stats.health - 50) / 200) ? (bump(l, "happiness", 10), "I stood up to them and they backed off.") : (bump(l, "health", -6), bump(l, "happiness", -6), "They pushed me over. It hurt.")) },
      { label: "Tell a teacher", do: (l, r) => (pct(r, 0.7) ? (bump(l, "happiness", 5), "The teacher dealt with it.") : (bump(l, "happiness", -4), "Nothing changed. Now they call me a snitch.")) },
      { label: "Ignore them", do: (l) => (bump(l, "happiness", -3), "I kept my head down.") },
    ],
  },
  {
    id: "found-money",
    min: 6,
    max: 90,
    text: () => "You found a wallet on the footpath with $120 in it.",
    choices: [
      { label: "Hand it in", do: (l, r) => ((l.karma += 8), pct(r, 0.4) ? ((l.money += 50), bump(l, "happiness", 4), "The owner gave me a $50 reward!") : (bump(l, "happiness", 3), "I handed it in. Felt good.")) },
      { label: "Keep the cash", do: (l) => ((l.money += 120), (l.karma -= 8), "I kept the $120 and binned the wallet.") },
    ],
  },
  {
    id: "school-test",
    min: 8,
    max: 17,
    text: () => "You have a big test tomorrow.",
    choices: [
      { label: "Study all night", do: (l) => ((l.school.grades = clamp(l.school.grades + 8)), bump(l, "smarts", 2), bump(l, "health", -1), "I studied hard and aced it.") },
      { label: "Cram a bit", do: (l, r) => ((l.school.grades = clamp(l.school.grades + (pct(r, 0.5) ? 3 : -3))), "I crammed for an hour. It went okay.") },
      { label: "Play video games", do: (l) => ((l.school.grades = clamp(l.school.grades - 8)), bump(l, "happiness", 5), "I gamed instead. The test did not go well.") },
    ],
  },
  {
    id: "cigarette",
    min: 13,
    max: 25,
    text: (_l, r) => `Your friend ${firstName(r, r.next() < 0.5 ? "M" : "F")} offers you a cigarette behind the gym.`,
    choices: [
      { label: "Try it", do: (l, r) => (bump(l, "health", -4), pct(r, 0.3) && !l.conditions.includes("a smoking habit") ? (l.conditions.push("a smoking habit"), "I tried it. Now I can't stop.") : "I coughed my lungs out. Never again.") },
      { label: "Say no", do: (l) => (bump(l, "health", 1), "I said no thanks.") },
    ],
  },
  {
    id: "party",
    min: 15,
    max: 30,
    text: () => "You're invited to a huge house party this weekend.",
    choices: [
      { label: "Go wild", do: (l, r) => (bump(l, "happiness", 10), bump(l, "health", -4), pct(r, 0.2) ? ((l.record.push("disorderly conduct"), l.totals.crimes++), "Best night ever, until the police showed up. I got a fine.") : "Best night ever.") },
      { label: "Go, but take it easy", do: (l) => (bump(l, "happiness", 6), "I went and had a good time.") },
      { label: "Stay home", do: (l) => (bump(l, "smarts", 1), "I stayed home and read.") },
    ],
  },
  {
    id: "crush",
    min: 12,
    max: 17,
    when: (l) => !partner(l),
    text: (_l, r) => `You have a crush on ${firstName(r, r.next() < 0.5 ? "M" : "F")} from class.`,
    choices: [
      {
        label: "Ask them out",
        do: (l, r) =>
          pct(r, 0.3 + l.stats.looks / 200)
            ? (l.relations.push({ npc: newNpc(l, r, { age: l.me.age }), kind: "partner", closeness: 70 }), l.totals.partners++, bump(l, "happiness", 12), "They said yes! We're going out.")
            : (bump(l, "happiness", -8), "They laughed. Ouch."),
      },
      { label: "Admire from afar", do: () => "I kept it to myself." },
    ],
  },
  {
    id: "lottery",
    min: 18,
    max: 99,
    weight: 0.6,
    text: () => "A mate wants to go halves on a $20 lottery ticket.",
    choices: [
      { label: "Go halves", do: (l, r) => ((l.money -= 10), pct(r, 0.01) ? ((l.money += 250000), bump(l, "happiness", 30), "WE WON! My half is $250,000!") : pct(r, 0.1) ? ((l.money += 40), "We won $80 between us.") : "We didn't win anything.") },
      { label: "No thanks", do: () => "I kept my $10." },
    ],
  },
  {
    id: "promotion-offer",
    min: 20,
    max: 70,
    when: (l) => !!l.job,
    text: () => "Your boss offers you extra responsibility for no extra pay.",
    choices: [
      { label: "Take it on", do: (l) => (l.job && (l.job.performance = clamp(l.job.performance + 12)), bump(l, "happiness", -3), "I took it on. My boss noticed.") },
      { label: "Politely decline", do: (l) => (l.job && (l.job.performance = clamp(l.job.performance - 4)), "I said I was at capacity.") },
    ],
  },
  {
    id: "coworker-conflict",
    min: 18,
    max: 70,
    when: (l) => !!l.job,
    text: (_l, r) => `A coworker, ${firstName(r, r.next() < 0.5 ? "M" : "F")}, keeps taking credit for your work.`,
    choices: [
      { label: "Confront them", do: (l, r) => (pct(r, 0.6) ? (l.job && (l.job.performance = clamp(l.job.performance + 6)), "I called them out. It stopped.") : (bump(l, "happiness", -5), "It turned into a shouting match.")) },
      { label: "Tell the manager", do: (l) => (l.job && (l.job.performance = clamp(l.job.performance + 4)), "My manager sorted it out.") },
      { label: "Let it slide", do: (l) => (bump(l, "happiness", -4), "I let it go. It still bugs me.") },
    ],
  },
  {
    id: "stray-dog",
    min: 8,
    max: 80,
    text: () => "A scruffy stray dog follows you home.",
    choices: [
      { label: "Keep it", do: (l) => (bump(l, "happiness", 12), (l.karma += 4), (l.money -= 600), "I named him Biscuit. Best decision ever.") },
      { label: "Take it to the shelter", do: (l) => ((l.karma += 3), "I took it to Harbour Animal Rescue.") },
      { label: "Shoo it away", do: (l) => ((l.karma -= 3), "I shooed it away.") },
    ],
  },
  {
    id: "car-crash",
    min: 17,
    max: 85,
    weight: 0.4,
    when: (l) => l.cars.length > 0,
    text: () => "Someone runs a red light and hits your car.",
    choices: [
      { label: "Swap details calmly", do: (l) => (bump(l, "health", -3), "We swapped details. Insurance covered it.") },
      { label: "Yell at them", do: (l) => (bump(l, "happiness", -4), (l.karma -= 2), "I yelled. It didn't fix the car.") },
    ],
  },
  {
    id: "investment",
    min: 22,
    max: 75,
    weight: 0.7,
    when: (l) => l.money > 5000,
    text: () => "A friend pitches you a 'can't-miss' startup. They want $5,000.",
    choices: [
      { label: "Invest", do: (l, r) => ((l.money -= 5000), pct(r, 0.18) ? ((l.money += 60000), bump(l, "happiness", 15), "It took off! My stake is worth $60,000.") : (bump(l, "happiness", -6), "It folded within a year. The money's gone.")) },
      { label: "Pass", do: () => "I passed." },
    ],
  },
  {
    id: "marathon",
    min: 18,
    max: 65,
    weight: 0.6,
    text: () => "Your neighbour asks you to run the Harbour City Marathon with them.",
    choices: [
      { label: "Train and run it", do: (l, r) => (pct(r, 0.4 + l.stats.health / 250) ? (bump(l, "health", 8), bump(l, "happiness", 10), "I finished the marathon!") : (bump(l, "health", -3), "I pulled a hamstring at 30 km.")) },
      { label: "Cheer from the sidelines", do: (l) => (bump(l, "happiness", 2), "I cheered them on.") },
    ],
  },
  {
    id: "talent-scout",
    min: 14,
    max: 35,
    weight: 0.4,
    when: (l) => l.stats.looks > 70,
    text: () => "A talent scout stops you at the mall: 'Ever thought about modelling?'",
    choices: [
      { label: "Give it a go", do: (l, r) => (pct(r, 0.5) ? ((l.money += 8000), (l.fame = clamp(l.fame + 10)), "I did a shoot for a clothing brand: $8,000!") : "The agency never called back.") },
      { label: "Not for me", do: () => "I said no thanks." },
    ],
  },
  {
    id: "jury-duty",
    min: 18,
    max: 75,
    weight: 0.5,
    text: () => "You've been called for jury duty.",
    choices: [
      { label: "Serve", do: (l) => ((l.karma += 3), bump(l, "smarts", 2), "I served on a jury for two weeks. Fascinating.") },
      { label: "Fake an illness", do: (l) => ((l.karma -= 4), "I got out of it.") },
    ],
  },
  {
    id: "family-dinner",
    min: 4,
    max: 90,
    when: (l) => rel(l, "mother").length + rel(l, "father").length > 0,
    text: () => "Your family is having a big dinner and everyone's arguing.",
    choices: [
      { label: "Keep the peace", do: (l) => (l.relations.forEach((x) => (x.kind === "mother" || x.kind === "father" || x.kind === "sibling") && (x.closeness = clamp(x.closeness + 6))), (l.karma += 2), "I calmed everyone down.") },
      { label: "Pick a side", do: (l) => (bump(l, "happiness", -3), "I took my mum's side. Dad's still sulking.") },
      { label: "Leave early", do: () => "I made an excuse and left." },
    ],
  },
  {
    id: "proposal",
    min: 20,
    max: 70,
    when: (l) => partner(l)?.kind === "partner" && (partner(l)?.closeness ?? 0) > 75,
    text: (l) => `${partner(l)!.npc.first} is acting nervous at dinner... they get down on one knee!`,
    choices: [
      { label: "Say yes!", do: (l) => (marry(l), bump(l, "happiness", 15), "I said yes! We got married at Harbour Gardens.") },
      { label: "Say no", do: (l) => (l.relations.find((x) => x === partner(l))!.kind = "ex", bump(l, "happiness", -10), "I said no. We broke up.") },
    ],
  },
  {
    id: "baby-news",
    min: 20,
    max: 48,
    weight: 0.8,
    when: (l) => partner(l)?.kind === "spouse",
    text: (l) => `${partner(l)!.npc.first} asks if you're ready to have a baby.`,
    choices: [
      { label: "Yes, let's try", do: (l, r) => (pct(r, 0.7) ? haveBaby(l, r) : "It didn't happen this year.") },
      { label: "Not yet", do: () => "We decided to wait." },
    ],
  },
  {
    id: "mugged",
    min: 14,
    max: 90,
    weight: 0.4,
    text: () => "A guy with a knife demands your wallet in an alley.",
    choices: [
      { label: "Hand it over", do: (l) => ((l.money -= 200), bump(l, "happiness", -6), "I handed it over. $200 gone.") },
      { label: "Fight back", do: (l, r) => (pct(r, l.stats.health / 200) ? (bump(l, "happiness", 8), "I disarmed him and he ran!") : (bump(l, "health", -25), "I got stabbed. I'm in hospital.")) },
      { label: "Run", do: (l, r) => (pct(r, 0.6) ? "I got away." : ((l.money -= 200), "He caught me and took my wallet.")) },
    ],
  },
  {
    id: "prison-fight",
    min: 18,
    max: 90,
    when: (l) => l.prison > 0,
    text: () => "An inmate shoves you in the yard.",
    choices: [
      { label: "Fight", do: (l, r) => (pct(r, 0.5) ? (bump(l, "happiness", 5), "I won. People leave me alone now.") : ((l.prison += 1), bump(l, "health", -10), "I lost and got a year added for fighting.")) },
      { label: "Walk away", do: (l) => (bump(l, "happiness", -4), "I walked away.") },
    ],
  },
  {
    id: "prison-parole",
    min: 18,
    max: 90,
    when: (l) => l.prison > 1,
    text: () => "You have a parole hearing.",
    choices: [
      { label: "Show remorse", do: (l, r) => (pct(r, 0.35 + l.karma / 300) ? ((l.prison = 0), "Parole granted. I'm free!") : "Parole denied.") },
      { label: "Say nothing", do: () => "Parole denied." },
    ],
  },
  {
    id: "health-scare",
    min: 40,
    max: 99,
    weight: 0.7,
    text: () => "You've been having chest pains.",
    choices: [
      { label: "See a doctor", do: (l) => ((l.money -= 400), bump(l, "health", 6), "The doctor caught it early. I'm on medication.") },
      { label: "Ignore it", do: (l, r) => (pct(r, 0.5) ? "It went away." : (bump(l, "health", -20), "I had a heart attack.")) },
    ],
  },
  {
    id: "grandkid",
    min: 45,
    max: 99,
    when: (l) => rel(l, "child").some((c) => c.npc.age >= 22),
    text: (l) => `${rel(l, "child").find((c) => c.npc.age >= 22)!.npc.first} asks you to babysit for the weekend.`,
    choices: [
      { label: "Of course!", do: (l) => (bump(l, "happiness", 8), rel(l, "child").forEach((c) => (c.closeness = clamp(c.closeness + 8))), "I spoiled the grandkids rotten.") },
      { label: "I'm busy", do: (l) => (rel(l, "child").forEach((c) => (c.closeness = clamp(c.closeness - 5))), "I said I was busy.") },
    ],
  },
  {
    id: "neighbour-noise",
    min: 18,
    max: 99,
    when: (l) => !livesWithParents(l),
    text: () => "Your neighbours play loud music until 3 am every night.",
    choices: [
      { label: "Knock and ask nicely", do: (l, r) => (pct(r, 0.7) ? "They turned it down. Nice people, actually." : "They turned it up.") },
      { label: "Call the council", do: () => "The council sent them a warning." },
      { label: "Blast your own music back", do: (l) => ((l.karma -= 3), bump(l, "happiness", 3), "A war of the speakers. I won.") },
    ],
  },
];

// -------------------------------------------------------------- relations

export function marry(l: Life) {
  const p = partner(l);
  if (!p) return;
  p.kind = "spouse";
  p.closeness = clamp(p.closeness + 10);
  l.money -= 15000;
}

export function haveBaby(l: Life, r: Rng) {
  const p = partner(l);
  const sex: Sex = r.next() < 0.5 ? "M" : "F";
  const kid = newNpc(l, r, { sex, last: l.me.last, age: 0, looks: Math.round(((p?.npc.looks ?? 50) + l.stats.looks) / 2), smarts: Math.round(((p?.npc.smarts ?? 50) + l.stats.smarts) / 2), money: 0 });
  l.relations.push({ npc: kid, kind: "child", closeness: 90 });
  l.totals.kids++;
  bump(l, "happiness", 15);
  return `${p ? `${p.npc.first} and I` : "I"} welcomed a baby ${sex === "M" ? "boy" : "girl"}: ${kid.first}!`;
}

/** Interactions with someone in your life. */
export type Interaction = "time" | "compliment" | "argue" | "money" | "gift" | "propose" | "breakup" | "baby";

export function interact(l: Life, npcId: number, what: Interaction): string {
  const x = l.relations.find((q) => q.npc.id === npcId && q.npc.alive);
  if (!x) return "";
  const r = rngFor(l, 100 + npcId + what.length);
  const n = x.npc.first;
  let t = "";
  switch (what) {
    case "time":
      x.closeness = clamp(x.closeness + 8 + Math.round(r.next() * 6));
      bump(l, "happiness", 3);
      t = `I spent time with ${n}. ${r.pick(["We went to the beach.", "We watched a movie.", "We had dinner at the pier.", "We walked the harbour."])}`;
      break;
    case "compliment":
      x.closeness = clamp(x.closeness + 4);
      t = `I told ${n} ${r.pick(["they look great", "how proud I am of them", "they're a great cook", "they have a beautiful smile"])}.`;
      break;
    case "argue":
      x.closeness = clamp(x.closeness - 15);
      bump(l, "happiness", -4);
      t = `I argued with ${n} about ${r.pick(["money", "politics", "the dishes", "nothing really"])}.`;
      break;
    case "money": {
      const ok = (x.kind === "mother" || x.kind === "father") && x.closeness > 40 && r.next() < 0.6;
      const amt = ok ? Math.round(50 + r.next() * (l.me.age < 18 ? 100 : 2000)) : 0;
      l.money += amt;
      x.closeness = clamp(x.closeness - 5);
      t = ok ? `${n} gave me ${money(amt)}.` : `${n} said no.`;
      break;
    }
    case "gift": {
      const cost = 150;
      if (l.money < cost) return "I can't afford a gift right now.";
      l.money -= cost;
      x.closeness = clamp(x.closeness + 12);
      t = `I bought ${n} ${r.pick(["flowers", "a watch", "concert tickets", "a book they wanted"])}.`;
      break;
    }
    case "propose":
      if (x.kind !== "partner") return "";
      if (r.next() < x.closeness / 120) {
        marry(l);
        bump(l, "happiness", 15);
        t = `I proposed to ${n}. They said YES! We got married.`;
      } else {
        x.closeness = clamp(x.closeness - 20);
        t = `I proposed to ${n}. They said they're not ready.`;
      }
      break;
    case "breakup":
      if (x.kind !== "partner" && x.kind !== "spouse") return "";
      if (x.kind === "spouse") l.money = Math.round(l.money / 2);
      t = x.kind === "spouse" ? `${n} and I got divorced. They took half of everything.` : `${n} and I split up.`;
      x.kind = "ex";
      x.closeness = 10;
      bump(l, "happiness", -10);
      break;
    case "baby":
      if (x.kind !== "spouse" && x.kind !== "partner") return "";
      t = r.next() < 0.6 ? haveBaby(l, r) : "We tried for a baby. Not this year.";
      break;
  }
  return say(l, t);
}

// ------------------------------------------------------------- activities

export interface Activity {
  id: string;
  name: string;
  group: "Mind & Body" | "Love" | "Money" | "Crime" | "Education" | "Career" | "Assets" | "Travel" | "Fame";
  minAge: number;
  cost?: number;
  can?: (l: Life) => boolean | string;
  run: (l: Life, r: Rng) => string;
}

export interface Destination {
  id: string;
  name: string;
  icon: string;
  cost: number;
  happy: number;
  health: number;
  /** What happened there. */
  moments: string[];
}
export const DESTINATIONS: Destination[] = [
  { id: "coast", name: "Road trip up the coast", icon: "🚐", cost: 900, happy: 8, health: 1, moments: ["surfed at dawn", "ate fish and chips on the pier", "camped under the stars"] },
  { id: "bali", name: "Bali", icon: "🌴", cost: 3_500, happy: 14, health: 3, moments: ["learned to surf", "hiked a volcano at sunrise", "did yoga in the rice terraces"] },
  { id: "tokyo", name: "Tokyo", icon: "🗼", cost: 5_500, happy: 15, health: 1, moments: ["sang karaoke till 4am", "saw the cherry blossoms", "ate the best ramen of my life"] },
  { id: "europe", name: "Europe by train", icon: "🚆", cost: 9_000, happy: 18, health: 2, moments: ["watched the sun set over Lisbon", "got lost in Venice", "saw a concert in Berlin"] },
  { id: "safari", name: "African safari", icon: "🦁", cost: 12_000, happy: 20, health: 2, moments: ["saw a lion up close", "watched the great migration", "slept in a tent by a watering hole"] },
  { id: "antarctica", name: "Antarctica", icon: "🐧", cost: 30_000, happy: 25, health: 1, moments: ["walked among penguins", "saw a glacier calve", "swam in the polar plunge"] },
];

export const ACTIVITIES: Activity[] = [
  { id: "gym", name: "Go to the gym", group: "Mind & Body", minAge: 12, cost: 30, run: (l) => (bump(l, "health", 5), bump(l, "looks", 2), bump(l, "happiness", 2), "I worked out at Harbour Fitness.") },
  { id: "library", name: "Visit the library", group: "Mind & Body", minAge: 5, run: (l) => (bump(l, "smarts", 4), "I read three books at the library.") },
  { id: "meditate", name: "Meditate", group: "Mind & Body", minAge: 10, run: (l) => (bump(l, "happiness", 6), bump(l, "health", 1), "I meditated by the harbour.") },
  { id: "doctor", name: "See a doctor", group: "Mind & Body", minAge: 1, cost: 200, run: (l, r) => {
      if (!l.conditions.length) return (bump(l, "health", 2), "The doctor says I'm in good shape.");
      const c = l.conditions.splice(Math.floor(r.next() * l.conditions.length), 1)[0];
      bump(l, "health", 10);
      return `The doctor treated my ${c}.`;
    } },
  { id: "salon", name: "Salon & spa", group: "Mind & Body", minAge: 12, cost: 120, run: (l) => (bump(l, "looks", 5), bump(l, "happiness", 4), "New haircut, new me.") },
  ...DESTINATIONS.map(
    (d): Activity => ({
      id: `trip-${d.id}`,
      name: `${d.icon} ${d.name}`,
      group: "Travel",
      minAge: 18,
      cost: d.cost,
      run: (l, r) => travel(l, r, d),
    }),
  ),
  { id: "post", name: "Post on social media", group: "Fame", minAge: 13, run: (l, r) => postOnline(l, r, false) },
  { id: "viral", name: "Try to go viral (a stunt)", group: "Fame", minAge: 16, cost: 300, run: (l, r) => postOnline(l, r, true) },
  { id: "collab", name: "Collab with an influencer", group: "Fame", minAge: 16, cost: 1500, can: (l) => ((l.followers ?? 0) >= 5000 ? true : "Get 5,000 followers first."), run: (l, r) => {
      const gain = Math.round((l.followers ?? 0) * (0.15 + r.next() * 0.5));
      l.followers = (l.followers ?? 0) + gain;
      l.fame = clamp(l.fame + 3);
      return `A collab with @${r.pick(["sunnyside", "bigbrekkie", "harbourhype", "gymbro", "chefzara"])}: +${gain.toLocaleString("en-US")} followers.`;
    } },
  {
    id: "date",
    name: "Go on a date",
    group: "Love",
    minAge: 16,
    can: (l) => (partner(l) ? "You're already seeing someone." : true),
    run: (l, r) => {
      const p = newNpc(l, r, { age: Math.max(16, l.me.age + Math.round((r.next() - 0.5) * 8)) });
      if (r.next() < 0.35 + l.stats.looks / 220) {
        l.relations.push({ npc: p, kind: "partner", closeness: 55 + Math.round(r.next() * 25) });
        l.totals.partners++;
        bump(l, "happiness", 10);
        return `I went on a date with ${fullName(p)} (${p.age}). Sparks flew! We're together now.`;
      }
      bump(l, "happiness", -3);
      return `I went on a date with ${fullName(p)}. No spark.`;
    },
  },
  { id: "friend", name: "Make a friend", group: "Love", minAge: 5, run: (l, r) => {
      const f = newNpc(l, r, { age: Math.max(5, l.me.age + Math.round((r.next() - 0.5) * 6)) });
      l.relations.push({ npc: f, kind: "friend", closeness: 50 + Math.round(r.next() * 20) });
      bump(l, "happiness", 5);
      return `I made a new friend: ${fullName(f)}.`;
    } },
  { id: "parttime", name: "Find a part-time job", group: "Career", minAge: 14, can: (l) => (l.job ? "You already have a job." : true), run: (l, r) => {
      const opts = CAREERS.filter((c) => c.partTime && l.me.age >= c.minAge);
      const c = r.pick(opts);
      return applyFor(l, c.id);
    } },
  { id: "worker", name: "Work harder", group: "Career", minAge: 14, can: (l) => (l.job ? true : "You don't have a job."), run: (l) => (l.job && (l.job.performance = clamp(l.job.performance + 10)), bump(l, "happiness", -2), "I put in extra hours.") },
  { id: "raise", name: "Ask for a raise", group: "Career", minAge: 16, can: (l) => (l.job ? true : "You don't have a job."), run: (l, r) => {
      const j = l.job!;
      const c = careerById(j.career)!;
      if (j.performance > 70 && j.level < c.ladder.length - 1 && r.next() < 0.5) {
        j.level++;
        l.totals.promotions++;
        return `My boss agreed. I'm now ${c.ladder[j.level]}!`;
      }
      j.performance = clamp(j.performance - 6);
      return "My boss said no.";
    } },
  { id: "quit", name: "Quit your job", group: "Career", minAge: 14, can: (l) => (l.job ? true : "You don't have a job."), run: (l) => {
      const c = careerById(l.job!.career)!;
      l.job = null;
      return `I quit my job as ${c.ladder[0]}.`;
    } },
  { id: "study", name: "Study harder", group: "Education", minAge: 6, can: (l) => (l.school.stage === "primary" || l.school.stage === "high" || l.school.stage === "uni" ? true : "You're not in school."), run: (l) => ((l.school.grades = clamp(l.school.grades + 10)), bump(l, "smarts", 2), "I hit the books.") },
  { id: "dropout", name: "Drop out", group: "Education", minAge: 16, can: (l) => (l.school.stage === "high" || l.school.stage === "uni" ? true : "You're not in school."), run: (l) => ((l.school.stage = "done"), (l.school.dropped = true), "I dropped out.") },
  { id: "lottery", name: "Buy a lottery ticket", group: "Money", minAge: 18, cost: 10, run: (l, r) => (r.next() < 0.002 ? ((l.money += 1_000_000), bump(l, "happiness", 40), "I WON THE JACKPOT! $1,000,000!") : r.next() < 0.05 ? ((l.money += 100), "I won $100.") : "Nothing. Of course.") },
  { id: "casino", name: "Casino night", group: "Money", minAge: 18, cost: 200, run: (l, r) => {
      const win = r.next() < 0.42;
      const amt = win ? 200 + Math.round(r.next() * 600) : 0;
      l.money += amt;
      return win ? `I won ${money(amt)} at blackjack!` : "The house won. It always does.";
    } },
  { id: "shoplift", name: "Shoplift", group: "Crime", minAge: 10, run: (l, r) => crime(l, r, "shoplifting", 0.25, 80, 0) },
  { id: "pickpocket", name: "Pickpocket", group: "Crime", minAge: 12, run: (l, r) => crime(l, r, "theft", 0.35, 300, 1) },
  { id: "burglary", name: "Burglary", group: "Crime", minAge: 16, run: (l, r) => crime(l, r, "burglary", 0.45, 4000, 3) },
  { id: "heist", name: "Bank heist", group: "Crime", minAge: 18, run: (l, r) => crime(l, r, "armed robbery", 0.7, 120000, 12) },
];

function crime(l: Life, r: Rng, what: string, risk: number, loot: number, years: number) {
  l.totals.crimes++;
  l.karma -= 6;
  if (r.next() < risk) {
    l.record.push(what);
    if (years) {
      l.prison = years;
      l.job = null;
      bump(l, "happiness", -20);
      return `I was caught and convicted of ${what}. ${years} year${years > 1 ? "s" : ""} in prison.`;
    }
    bump(l, "happiness", -6);
    return `I was caught ${what === "shoplifting" ? "shoplifting" : `doing ${what}`} and got a fine and a warning.`;
  }
  const got = Math.round(loot * (0.4 + r.next() * 0.8));
  l.money += got;
  return `I got away with it: ${money(got)}.`;
}

export function canDo(l: Life, a: Activity): true | string {
  if (!l.me.alive) return "You're dead.";
  if (l.prison > 0 && a.group !== "Mind & Body" && a.group !== "Love") return "You're in prison.";
  if (l.me.age < a.minAge) return `You need to be ${a.minAge}.`;
  if (l.doneThisYear.includes(a.id)) return "Already done this year.";
  if (a.cost && l.money < a.cost) return `It costs ${money(a.cost)}.`;
  const c = a.can?.(l);
  if (typeof c === "string") return c;
  return true;
}

export function doActivity(l: Life, id: string) {
  const a = ACTIVITIES.find((x) => x.id === id);
  if (!a) return "";
  const ok = canDo(l, a);
  if (ok !== true) return ok;
  if (a.cost) l.money -= a.cost;
  l.doneThisYear.push(a.id);
  return say(l, a.run(l, rngFor(l, id.length * 13 + l.doneThisYear.length)));
}

// ----------------------------------------------------------- careers & uni

export function jobsOpen(l: Life) {
  return CAREERS.filter((c) => l.me.age >= c.minAge && (c.partTime || isAdult(l)));
}

export function qualifies(l: Life, careerId: string): true | string {
  const c = careerById(careerId);
  if (!c) return "No such job.";
  if (l.prison) return "You're in prison.";
  if (l.me.age < c.minAge) return `You need to be ${c.minAge}.`;
  if (!c.partTime && !isAdult(l)) return "You need to be 18.";
  if (c.needs !== "none" && !l.degrees.includes(c.needs)) return c.needs === "high" ? "Needs a high school diploma." : `Needs a degree in ${DEGREES.find((d) => d.id === c.needs)?.name ?? c.needs}.`;
  if (l.stats.smarts < c.minSmarts) return "Your smarts aren't high enough.";
  if (l.record.length > 1 && (c.id === "police" || c.id === "lawyer" || c.id === "teacher")) return "Your criminal record rules you out.";
  return true;
}

export function applyFor(l: Life, careerId: string) {
  const ok = qualifies(l, careerId);
  const c = careerById(careerId)!;
  if (ok !== true) return say(l, `I applied to be a ${c.ladder[0]}. ${ok}`);
  const r = rngFor(l, 300 + careerId.length);
  const chance = 0.45 + l.stats.smarts / 300 + l.stats.looks / 600 - (l.record.length ? 0.2 : 0);
  if (r.next() < chance) {
    l.job = { career: c.id, level: 0, performance: 55, years: 0 };
    if (!l.jobsHeld.includes(c.id)) l.jobsHeld.push(c.id);
    bump(l, "happiness", 6);
    return say(l, `I got the job! I'm now a ${c.ladder[0]} (${money(c.pay[0])} a year).`);
  }
  return say(l, `I interviewed to be a ${c.ladder[0]} but didn't get it.`);
}

export function enrolUni(l: Life, degree: Exclude<Degree, "none" | "high">) {
  const d = DEGREES.find((x) => x.id === degree)!;
  if (!l.degrees.includes("high")) return say(l, "I need a high school diploma first.");
  if (l.school.stage === "uni") return say(l, "I'm already at university.");
  if (l.stats.smarts < d.minSmarts) return say(l, `Harbour University rejected my application to study ${d.name}.`);
  const parentsPay = l.me.age < 22 && rel(l, "mother").concat(rel(l, "father")).some((p) => p.npc.money > d.cost);
  if (!parentsPay) {
    if (l.money < d.cost) {
      l.money -= d.cost;
      say(l, `I took out a ${money(d.cost)} student loan.`);
    } else l.money -= d.cost;
  }
  l.school = { stage: "uni", grades: 60, uni: degree, uniYears: 0 };
  return say(l, `I enrolled at Harbour University to study ${d.name}${parentsPay ? " (my parents are paying!)" : ""}.`);
}

// ----------------------------------------------------------------- assets

/** Buy a plot in town (see world.ts for the list) and move in, or rent one. */
export function moveTo(l: Life, plot: number, price: number, buy: boolean) {
  if (!isAdult(l)) return say(l, "I'm too young to move out.");
  if (buy) {
    if (l.money < price * 0.2) return say(l, "I can't afford the deposit.");
    l.money -= price;
    l.home = { plot, owned: true, rent: 0 };
    return say(l, `I bought a place on plot ${plot + 1} for ${money(price)}.${l.money < 0 ? " (With a big mortgage.)" : ""}`);
  }
  l.home = { plot, owned: false, rent: Math.round(price * 0.045) };
  return say(l, `I moved into a rental on plot ${plot + 1} (${money(l.home.rent)} a year).`);
}

export function buyCar(l: Life, id: string) {
  const c = CARS.find((x) => x.id === id);
  if (!c) return "";
  if (l.me.age < 16) return say(l, "I'm too young to drive.");
  if (l.money < c.price) return say(l, `I can't afford the ${c.name}.`);
  l.money -= c.price;
  l.cars.push(c.id);
  bump(l, "happiness", 6);
  return say(l, `I bought a ${c.name} for ${money(c.price)}.`);
}

// ------------------------------------------------------------ the 3D days

/** A day played in the 3D world: needs went into it, maybe a shift's pay. */
export function recordDay(l: Life, d: { needs: number; earned: number; shiftScore?: number; built?: boolean }) {
  l.dayNeeds.push(clamp(d.needs));
  l.money += d.earned;
  l.totals.earned += d.earned;
  l.totals.daysPlayed++;
  if (d.built) l.totals.housesBuilt++;
  if (l.job && d.shiftScore !== undefined) l.job.performance = clamp(l.job.performance + (d.shiftScore - 50) / 8);
}

// ---------------------------------------------------------- death & heirs

export function heirs(l: Life) {
  return rel(l, "child");
}

/** Carry on as one of your children. */
export function continueAs(l: Life, childId: number): Life {
  const c = l.relations.find((x) => x.npc.id === childId);
  if (!c) throw new Error("No such child");
  const share = Math.round(Math.max(0, l.money) * (0.8 / Math.max(1, heirs(l).length)));
  const next = newLife((l.seed * 7919 + childId) >>> 0, { first: c.npc.first, last: c.npc.last, sex: c.npc.sex, heir: { generation: l.generation + 1, money: share, home: c.npc.age >= 18 ? l.home : { plot: -1, owned: false, rent: 0 }, builds: l.builds, cars: [] } });
  next.me.age = c.npc.age;
  next.year = l.year;
  next.stats.looks = c.npc.looks;
  next.stats.smarts = c.npc.smarts;
  next.log = [{ age: c.npc.age, text: `My ${l.me.sex === "M" ? "father" : "mother"}, ${fullName(l.me)}, died at ${l.me.age}. I inherited ${money(share)}.` }];
  const other = partner(l);
  const parent: Npc = { id: next.nextNpc++, first: l.me.first, last: l.me.last, sex: l.me.sex, age: l.me.age, looks: l.stats.looks, smarts: l.stats.smarts, money: 0, job: l.job ? (careerById(l.job.career)?.ladder[l.job.level] ?? "") : "", alive: false };
  next.relations.push({ npc: parent, kind: l.me.sex === "M" ? "father" : "mother", closeness: c.closeness });
  if (other) next.relations.push({ npc: { ...other.npc, id: next.nextNpc++ }, kind: other.npc.sex === "M" ? "father" : "mother", closeness: 70 });
  for (const s of heirs(l)) if (s.npc.id !== childId) next.relations.push({ npc: { ...s.npc, id: next.nextNpc++ }, kind: "sibling", closeness: 60 });
  if (c.npc.age >= 5) next.school = { stage: c.npc.age >= 18 ? "done" : c.npc.age >= 12 ? "high" : "primary", grades: 60 };
  if (c.npc.age >= 18) next.degrees = ["high"];
  return next;
}

// --------------------------------------------------------- score & ribbons

export const RIBBONS: { id: string; name: string; test: (l: Life) => boolean }[] = [
  { id: "rich", name: "Rich", test: (l) => l.money >= 1_000_000 },
  { id: "scholar", name: "Scholar", test: (l) => l.degrees.some((d) => d !== "high") },
  { id: "family", name: "Family", test: (l) => l.totals.kids >= 3 },
  { id: "lover", name: "Lover", test: (l) => l.totals.partners >= 5 },
  { id: "famous", name: "Famous", test: (l) => l.fame >= 60 },
  { id: "criminal", name: "Criminal", test: (l) => l.record.length >= 3 },
  { id: "builder", name: "Builder", test: (l) => l.totals.housesBuilt >= 3 },
  { id: "hardworker", name: "Hard Worker", test: (l) => l.totals.promotions >= 3 },
  { id: "elder", name: "Elder", test: (l) => l.me.age >= 90 },
  { id: "saint", name: "Saint", test: (l) => l.karma >= 80 },
  { id: "happy", name: "Happy", test: (l) => l.stats.happiness >= 85 },
];

export const ribbonsOf = (l: Life) => RIBBONS.filter((r) => r.test(l));

/** The life's score: years, money, family, achievements. */
export function lifeScore(l: Life) {
  return Math.max(
    0,
    Math.round(l.me.age * 10 + Math.min(5000, Math.max(0, l.money + investValue(l)) / 400) + (l.travels?.length ?? 0) * 40 + (l.pets?.length ?? 0) * 60 + Math.min(1500, (l.followers ?? 0) / 1000) + l.totals.kids * 120 + l.degrees.length * 150 + l.totals.promotions * 80 + l.stats.happiness * 4 + ribbonsOf(l).length * 250 + l.totals.daysPlayed * 15 + l.totals.housesBuilt * 200),
  );
}

export function parseLife(raw: unknown): Life | null {
  const l = raw as Life | null;
  return l && l.v === 1 && l.me && Array.isArray(l.relations) ? l : null;
}

// ------------------------------------------------- investing, pets, fame, travel

export interface Property {
  name: string;
  /** What you paid. */
  price: number;
  /** What it's worth now. */
  value: number;
  /** Rent a year (after costs). */
  rent: number;
  /** Still owed to the bank (rent pays it off first). */
  debt: number;
}

/** Rental properties for sale (price, rent a year after costs). */
export const PROPERTIES: { name: string; price: number; rent: number }[] = [
  { name: "Studio flat in the city", price: 180_000, rent: 8_500 },
  { name: "Townhouse on Elm Street", price: 420_000, rent: 18_000 },
  { name: "Beach house", price: 950_000, rent: 36_000 },
  { name: "Shopping strip", price: 2_400_000, rent: 105_000 },
];

export type PetKind = "dog" | "cat" | "rabbit" | "parrot" | "horse";
export interface Pet {
  name: string;
  kind: PetKind;
  age: number;
  /** 0–100: how much you two love each other. */
  bond: number;
  alive: boolean;
}
export const PETS: Record<PetKind, { name: string; icon: string; cost: number; lifespan: number; joy: number }> = {
  dog: { name: "Dog", icon: "🐶", cost: 600, lifespan: 13, joy: 6 },
  cat: { name: "Cat", icon: "🐱", cost: 300, lifespan: 16, joy: 5 },
  rabbit: { name: "Rabbit", icon: "🐰", cost: 120, lifespan: 9, joy: 3 },
  parrot: { name: "Parrot", icon: "🦜", cost: 900, lifespan: 40, joy: 4 },
  horse: { name: "Horse", icon: "🐴", cost: 12_000, lifespan: 28, joy: 8 },
};
const PET_NAMES = ["Biscuit", "Luna", "Milo", "Pepper", "Ziggy", "Maple", "Rocket", "Olive", "Bruno", "Coco", "Nugget", "Pickles"];

const ensureInvest = (l: Life) => (l.invest ??= { shares: 0, property: [], history: [] });

/** Everything invested, at today's value. */
export function investValue(l: Life) {
  const v = l.invest;
  return v ? Math.round(v.shares + v.property.reduce((a, p) => a + p.value - (p.debt ?? 0), 0)) : 0;
}

/** Put money into (positive) or take it out of (negative) the index fund. */
export function tradeShares(l: Life, amount: number) {
  if (!isAdult(l)) return "You need to be 18 to invest.";
  const v = ensureInvest(l);
  if (amount > 0) {
    if (l.money < amount) return `You only have ${money(l.money)}.`;
    l.money -= amount;
    v.shares += amount;
    return say(l, `I invested ${money(amount)} in the share market.`);
  }
  const out = Math.min(v.shares, -amount);
  if (out <= 0) return "Nothing invested to sell.";
  v.shares -= out;
  l.money += Math.round(out);
  return say(l, `I sold ${money(out)} of shares.`);
}

export function buyProperty(l: Life, i: number) {
  const p = PROPERTIES[i];
  if (!p) return "";
  if (!isAdult(l)) return "You need to be 18 to buy property.";
  // A 20% deposit and the bank lends the rest (paid off out of the rent).
  const deposit = Math.round(p.price * 0.2);
  if (l.money < deposit) return `The deposit is ${money(deposit)}.`;
  l.money -= deposit;
  ensureInvest(l).property.push({ name: p.name, price: p.price, value: p.price, rent: p.rent, debt: p.price - deposit });
  return say(l, `I bought a ${p.name.toLowerCase()} for ${money(p.price)} (${money(deposit)} down, the bank lent the rest) to rent out.`);
}

export function sellProperty(l: Life, i: number) {
  const v = l.invest;
  const p = v?.property[i];
  if (!v || !p) return "";
  v.property.splice(i, 1);
  const net = Math.round(p.value - (p.debt ?? 0));
  l.money += net;
  const gain = p.value - p.price;
  return say(l, `I sold the ${p.name.toLowerCase()} for ${money(p.value)}, ${money(net)} after paying off the loan (${gain >= 0 ? "a profit" : "a loss"} of ${money(Math.abs(gain))} on the price).`);
}

export function adoptPet(l: Life, kind: PetKind, r: Rng = rngFor(l, 77 + (l.pets?.length ?? 0))) {
  const k = PETS[kind];
  if (l.me.age < 8) return "You're too young for a pet of your own.";
  if (l.money < k.cost) return `A ${k.name.toLowerCase()} costs ${money(k.cost)}.`;
  if ((l.pets ?? []).filter((p) => p.alive).length >= 4) return "Four pets is plenty.";
  l.money -= k.cost;
  const pet: Pet = { name: r.pick(PET_NAMES), kind, age: kind === "horse" ? 4 : 0, bond: 60, alive: true };
  (l.pets ??= []).push(pet);
  bump(l, "happiness", 8);
  return say(l, `I brought home a ${k.name.toLowerCase()} called ${pet.name}! ${k.icon}`);
}

export function petCare(l: Life, i: number, what: "play" | "vet") {
  const p = l.pets?.[i];
  if (!p || !p.alive) return "";
  const key = `pet-${i}-${what}`;
  if (l.doneThisYear.includes(key)) return "Already done this year.";
  if (what === "vet") {
    if (l.money < 250) return "The vet costs $250.";
    l.money -= 250;
    p.bond = clamp(p.bond + 5);
    l.doneThisYear.push(key);
    return say(l, `${p.name} had a check-up at the vet. All good.`);
  }
  p.bond = clamp(p.bond + 12);
  bump(l, "happiness", 4);
  l.doneThisYear.push(key);
  return say(l, `I spent the afternoon playing with ${p.name}.`);
}

function travel(l: Life, r: Rng, d: Destination) {
  bump(l, "happiness", d.happy);
  bump(l, "health", d.health);
  (l.travels ??= []).push(d.name);
  let out = `I went to ${d.name} and ${r.pick(d.moments)}.`;
  if (!partner(l) && r.next() < 0.12) {
    const p = newNpc(l, r, { age: Math.max(18, l.me.age + Math.round((r.next() - 0.5) * 8)) });
    l.relations.push({ npc: p, kind: "partner", closeness: 65 });
    l.totals.partners++;
    out += ` And I met ${fullName(p)}: a holiday romance that came home with me!`;
  }
  if ((l.followers ?? 0) > 1000) {
    const gain = Math.round((l.followers ?? 0) * 0.04 + r.next() * 300);
    l.followers = (l.followers ?? 0) + gain;
    out += ` The photos got me ${gain.toLocaleString("en-US")} new followers.`;
  }
  return out;
}

function postOnline(l: Life, r: Rng, stunt: boolean) {
  const f = l.followers ?? 0;
  const appeal = (l.stats.looks + l.stats.smarts + l.fame * 2) / 400;
  if (stunt && r.next() < 0.12) {
    bump(l, "health", -10);
    bump(l, "happiness", -5);
    return "The stunt went wrong. I ended up in hospital, and the video got 40 views.";
  }
  const viral = r.next() < (stunt ? 0.25 : 0.03) + appeal * 0.05;
  const gain = viral ? Math.round(5000 + r.next() * 50_000 * (0.5 + appeal) + f * 0.3) : Math.round(10 + r.next() * 200 * (0.4 + appeal) + f * 0.02);
  l.followers = f + gain;
  l.fame = clamp(Math.max(l.fame, Math.log10(l.followers + 1) * 14 - 30));
  bump(l, "happiness", viral ? 10 : 2);
  return viral ? `I WENT VIRAL! ${gain.toLocaleString("en-US")} new followers overnight.` : `I posted a ${r.pick(["selfie", "recipe video", "dance", "hot take", "sunset"])}: +${gain.toLocaleString("en-US")} followers.`;
}

/** Once a year: the market moves, rent comes in, pets grow up, followers come and go (and sponsors pay). */
export function yearExtras(l: Life, r: Rng, add: (t: string) => void) {
  const v = l.invest;
  if (v) {
    // The market: mostly up, sometimes a crash.
    const ret = r.next() < 0.12 ? -0.1 - r.next() * 0.25 : -0.05 + r.next() * 0.27;
    v.history = [...v.history, Math.round(ret * 1000) / 10].slice(-10);
    if (v.shares > 0) {
      const before = v.shares;
      v.shares = Math.round(v.shares * (1 + ret));
      if (Math.abs(v.shares - before) >= 1000) add(ret >= 0 ? `My shares grew ${(ret * 100).toFixed(1)}% this year (${money(v.shares - before)}).` : `The market fell ${(-ret * 100).toFixed(1)}%. My shares lost ${money(before - v.shares)}.`);
    }
    let rent = 0;
    for (const p of v.property) {
      p.value = Math.round(p.value * (1 + (r.next() * 0.1 - 0.02)));
      // The rent pays down the loan first.
      const toLoan = Math.min(p.debt ?? 0, p.rent);
      p.debt = (p.debt ?? 0) - toLoan;
      rent += p.rent - toLoan;
    }
    if (rent) {
      l.money += rent;
      l.totals.earned += rent;
    }
  }
  for (const p of l.pets ?? []) {
    if (!p.alive) continue;
    p.age++;
    p.bond = clamp(p.bond - 6);
    bump(l, "happiness", (PETS[p.kind].joy * p.bond) / 100);
    const life = PETS[p.kind].lifespan;
    if (p.age > life - 3 && r.next() < (p.age - (life - 3)) / 6) {
      p.alive = false;
      bump(l, "happiness", -12);
      add(`My ${PETS[p.kind].name.toLowerCase()} ${p.name} died at ${p.age}. I'll never forget them.`);
    }
  }
  const f = l.followers ?? 0;
  if (f > 0) {
    // Followers drift away unless you keep posting.
    l.followers = Math.max(0, Math.round(f * (0.88 + r.next() * 0.06)));
    if (l.followers >= 10_000) {
      const deal = Math.round((l.followers / 1000) * (150 + r.next() * 200));
      l.money += deal;
      l.totals.earned += deal;
      add(`Sponsorships from my ${l.followers.toLocaleString("en-US")} followers paid ${money(deal)}.`);
    }
  }
}
