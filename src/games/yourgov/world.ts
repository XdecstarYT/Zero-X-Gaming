/**
 * The world outside: a global economy that booms and busts, summits twice a year (a decision
 * for the head of government), treaties, foreign aid, sanctions and state visits.
 *
 * Works on sim.ts's state and seeded stream; nothing at the top level uses another module's
 * values (sim.ts imports this file and this file imports sim.ts).
 */
import * as P from "./politics";
import * as G from "./sim";

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export interface TreatyDef {
  id: string;
  name: string;
  icon: string;
  about: string;
  /** Average relations needed to sign. */
  minRel: number;
  /** Per year while in force (billions at Avalon's scale, + is income). */
  growth?: number;
  unemployment?: number;
  budget?: number;
  /** When it's signed: the voter groups, and relations abroad. */
  goodwill?: Record<string, number>;
  foreign?: number;
  approval?: number;
}

export const TREATIES: TreatyDef[] = [
  { id: "climate", name: "Climate accord", icon: "🌍", about: "Binding cuts in emissions, with everyone else.", minRel: 0, growth: -0.03, goodwill: { green: 5, rural: -2 }, foreign: 5 },
  { id: "defence", name: "Defence pact", icon: "🛡️", about: "An attack on one is an attack on all.", minRel: 15, budget: -3, approval: 1, goodwill: { retirees: 2, young: -1 } },
  { id: "movement", name: "Free movement", icon: "🛂", about: "Live and work in each other's countries.", minRel: 25, growth: 0.05, unemployment: 0.1, goodwill: { professionals: 4, workers: -3 } },
  { id: "tradeBloc", name: "Customs union", icon: "📦", about: "No tariffs, one set of rules.", minRel: 20, growth: 0.08, goodwill: { business: 3, rural: -2 } },
  { id: "extradition", name: "Extradition treaty", icon: "⚖️", about: "Criminals can't hide abroad.", minRel: 10, goodwill: { retirees: 2 } },
  { id: "nuclear", name: "Nuclear arms ban", icon: "☮️", about: "No nuclear weapons, ever.", minRel: -10, foreign: 4, goodwill: { faith: 2, young: 2 } },
];
export const TREATY: Record<string, TreatyDef> = Object.fromEntries(TREATIES.map((t) => [t.id, t]));

/** Foreign aid: a share of the economy, what it costs, and the goodwill it buys abroad each week. */
export const AID = [
  { name: "None", pct: 0, cost: 0, rel: 0 },
  { name: "0.3% of GDP", pct: 0.3, cost: 3, rel: 0.05 },
  { name: "0.7% of GDP", pct: 0.7, cost: 7, rel: 0.1 },
  { name: "1% of GDP", pct: 1, cost: 12, rel: 0.15 },
];

export type SummitKind = "world" | "climate";
export interface SummitOption {
  label: string;
  approval?: number;
  foreign?: number;
  goodwill?: Record<string, number>;
  /** Better (or worse) for the environment. */
  env?: number;
  growth?: number;
  budget?: number;
}
export const SUMMITS: Record<SummitKind, { name: string; icon: string; week: number; text: string; options: SummitOption[] }> = {
  world: {
    name: "World leaders' summit",
    icon: "🌐",
    week: 24,
    text: "Leaders of the biggest economies meet to talk trade, security and the global economy.",
    options: [
      { label: "Lead the talks", approval: 2, foreign: 8, budget: -2 },
      { label: "Cooperate quietly", foreign: 4 },
      { label: "Walk out over trade", approval: 1, foreign: -10, goodwill: { workers: 3, professionals: -3 } },
    ],
  },
  climate: {
    name: "Climate summit",
    icon: "🌡️",
    week: 46,
    text: "The world's leaders gather to agree what to do about a warming planet.",
    options: [
      { label: "Pledge net zero by 2060", foreign: 6, env: 6, growth: -0.05, goodwill: { green: 8, rural: -4 } },
      { label: "Sign the joint statement", foreign: 3, goodwill: { green: 3 } },
      { label: "Walk out", foreign: -6, goodwill: { green: -6, rural: 3 } },
    ],
  },
};

export interface SummitState {
  kind: SummitKind;
  week: number;
}

export interface World {
  /** The global economy: -1 deep recession … +1 boom. */
  cycle: number;
  /** Treaties in force, and the week each was signed. */
  treaties: Record<string, number>;
  aid: number;
  summit: SummitState | null;
  /** Summits you led (for the achievement). */
  led: number;
}

export function initWorld(s: G.GameState) {
  s.wd ??= { cycle: 0, treaties: {}, aid: 1, summit: null, led: 0 };
  for (const f of s.foreign ?? []) f.sanctioned ??= false;
}

/** What the world does to the economy each week (folded into sim.ts's economy). */
export function worldFx(s: G.GameState) {
  const w = s.wd;
  if (!w) return { growth: 0, budget: 0, unemployment: 0 };
  let growth = w.cycle * 0.3;
  let budget = -(AID[w.aid]?.cost ?? 0);
  let unemployment = 0;
  for (const id of Object.keys(w.treaties)) {
    const t = TREATY[id];
    if (!t) continue;
    growth += t.growth ?? 0;
    budget += t.budget ?? 0;
    unemployment += t.unemployment ?? 0;
  }
  growth -= 0.03 * (s.foreign?.filter((f) => f.sanctioned).length ?? 0);
  return { growth, budget, unemployment };
}

const avgRel = (s: G.GameState) => (s.foreign.length ? s.foreign.reduce((a, f) => a + f.rel, 0) / s.foreign.length : 0);
const head = (s: G.GameState) => s.gov.head === s.you;
const notHead = (s: G.GameState) => `Only the ${G.titles(s).head} can do that.`;

/** Sign a treaty. Returns why you can't, or null. */
export function signTreaty(s: G.GameState, id: string): string | null {
  const t = TREATY[id];
  if (!t) return "Unknown treaty.";
  if (!head(s)) return notHead(s);
  if (s.wd.treaties[id] !== undefined) return "It's already in force.";
  if (avgRel(s) < t.minRel) return "Relations abroad need to be warmer first.";
  s.wd.treaties[id] = s.week;
  if (t.approval) s.stats.approval = clamp(s.stats.approval + t.approval, 5, 95);
  for (const [g, v] of Object.entries(t.goodwill ?? {})) P.courtGroup(s, g, v);
  for (const f of s.foreign) {
    if (id === "defence") f.rel = clamp(f.rel + (f.rel > 30 ? 8 : f.rel < -20 ? -8 : 0), -100, 100);
    else if (t.foreign) f.rel = clamp(f.rel + t.foreign, -100, 100);
  }
  s.counters.treaties = (s.counters.treaties ?? 0) + 1;
  G.news(s, "government", `${t.icon} The government signs the ${t.name.toLowerCase()}`, 1);
  return null;
}

export function withdrawTreaty(s: G.GameState, id: string): string | null {
  const t = TREATY[id];
  if (!t || s.wd.treaties[id] === undefined) return "That treaty isn't in force.";
  if (!head(s)) return notHead(s);
  delete s.wd.treaties[id];
  s.stats.approval = clamp(s.stats.approval - 1, 5, 95);
  for (const f of s.foreign) f.rel = clamp(f.rel - 6, -100, 100);
  for (const [g, v] of Object.entries(t.goodwill ?? {})) P.courtGroup(s, g, -v / 2);
  G.news(s, "government", `The government pulls out of the ${t.name.toLowerCase()}`, -1);
  return null;
}

export function setAid(s: G.GameState, level: number): string | null {
  if (!head(s)) return notHead(s);
  const v = clamp(Math.round(level), 0, AID.length - 1);
  if (v === s.wd.aid) return "That's the level already.";
  const up = v > s.wd.aid;
  s.wd.aid = v;
  P.courtGroup(s, "faith", up ? 2 : -2);
  P.courtGroup(s, "young", up ? 1 : -1);
  P.courtGroup(s, "workers", up ? -1.5 : 1.5);
  G.news(s, "government", `Foreign aid ${up ? "rises" : "is cut"} to ${AID[v].name.toLowerCase()}`, 0);
  return null;
}

export function sanction(s: G.GameState, name: string, on: boolean): string | null {
  if (!head(s)) return notHead(s);
  const f = s.foreign.find((x) => x.name === name);
  if (!f) return "Unknown country.";
  if (!!f.sanctioned === on) return on ? "They're under sanctions already." : "There are no sanctions to lift.";
  f.sanctioned = on;
  if (on) {
    const hostile = f.rel < -30;
    f.rel = clamp(f.rel - 25, -100, 100);
    f.deal = false;
    s.stats.approval = clamp(s.stats.approval + (hostile ? 2 : -2), 5, 95);
    G.news(s, "government", `The government puts sanctions on ${f.name}`, hostile ? 1 : -1);
  } else {
    f.rel = clamp(f.rel + 8, -100, 100);
    G.news(s, "government", `Sanctions on ${f.name} are lifted`, 0);
  }
  return null;
}

/** The head of government's answer at a summit. */
export function answerSummit(s: G.GameState, choice: number) {
  const sm = s.wd.summit;
  if (!sm) return false;
  const def = SUMMITS[sm.kind];
  const o = def.options[choice] ?? def.options[1];
  s.wd.summit = null;
  const k = s.sc.economy.gdp / 18;
  if (o.approval) s.stats.approval = clamp(s.stats.approval + o.approval, 5, 95);
  if (o.foreign) for (const f of s.foreign) f.rel = clamp(f.rel + o.foreign, -100, 100);
  for (const [g, v] of Object.entries(o.goodwill ?? {})) P.courtGroup(s, g, v);
  if (o.env && s.soc) s.soc.bonus.environment -= o.env;
  if (o.growth) s.boosts.growth += o.growth;
  if (o.budget) s.stats.debt -= o.budget * k;
  if (choice === 0) s.wd.led++;
  G.news(s, "government", `${def.icon} ${def.name}: the ${G.titles(s).head} chooses to ${o.label.toLowerCase()}`, (o.foreign ?? 0) >= 0 ? 1 : -1);
  return true;
}

/** The world's week. */
export function worldWeek(s: G.GameState) {
  initWorld(s);
  const w = s.wd;
  const r = G.roll(s);
  const before = w.cycle;
  w.cycle = clamp(w.cycle + (0 - w.cycle) * 0.01 + (r.next() - 0.5) * 0.06, -1, 1);
  const shock = r.next();
  if (shock < 0.004) {
    w.cycle = clamp(w.cycle - 0.7, -1, 1);
    G.news(s, "economy", "A global recession: markets tumble around the world", -1);
  } else if (shock > 0.994) {
    w.cycle = clamp(w.cycle + 0.4, -1, 1);
    G.news(s, "economy", "The world economy is booming", 1);
  } else if (before > -0.5 && w.cycle <= -0.5) G.news(s, "economy", "The world economy slides towards recession", -1);
  else if (before < 0.5 && w.cycle >= 0.5) G.news(s, "economy", "Good times abroad: world trade is surging", 1);
  // Aid buys friends.
  const aid = AID[w.aid]?.rel ?? 0;
  if (aid) for (const f of s.foreign) if (!f.sanctioned) f.rel = clamp(f.rel + aid, -100, 100);
  // Summits.
  const wk = G.weekOf(s.week);
  for (const kind of Object.keys(SUMMITS) as SummitKind[]) {
    if (SUMMITS[kind].week !== wk) continue;
    if (head(s)) w.summit = { kind, week: s.week };
    else G.news(s, "government", `${SUMMITS[kind].icon} The ${SUMMITS[kind].name.toLowerCase()} meets; the ${G.titles(s).head} attends`, 0);
  }
  // State visits.
  if (r.next() < 0.025) {
    const friends = s.foreign.filter((f) => f.rel > 20 && !f.sanctioned);
    if (friends.length) {
      const f = r.pick(friends);
      f.rel = clamp(f.rel + 5, -100, 100);
      if (head(s)) s.stats.approval = clamp(s.stats.approval + 0.5, 5, 95);
      G.news(s, "government", `The leader of ${f.name} arrives on a state visit`, head(s) ? 1 : 0);
    }
  }
}

/** Anything left unanswered at the end of the week. */
export function settleWorld(s: G.GameState) {
  if (s.wd?.summit && s.week > s.wd.summit.week) answerSummit(s, 1);
}
