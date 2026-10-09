/**
 * Politics beyond the ballot box: the voter groups and the interest groups behind them, your
 * party's factions (and the leadership challenges they mount), TV debates, the planner, the
 * cabinet, crises that need a decision, executive actions, referendums, coalition deals,
 * foreign relations and the press.
 *
 * Everything here works on the game state in sim.ts and is just as deterministic (all
 * randomness comes from the state's own stream).
 */
import { EVENT, LAW, WEEKS, type PartyId, type Pos } from "./data";
import type { Country } from "./map";
import * as G from "./sim";

const dist = (a: Pos, b: Pos) => Math.hypot(a.e - b.e, a.s - b.s);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// ------------------------------------------------------------------ voter groups

export interface VoterGroup {
  id: string;
  name: string;
  icon: string;
  /** Share of the population. */
  base: number;
  /** -1 rural … +1 urban. */
  urban: number;
  pos: Pos;
  /** Laws it cares about: +1 wants a higher option, -1 a lower one. */
  likes: Record<string, number>;
  /** The interest group that speaks for it. */
  lobby: string;
}

export const GROUPS: VoterGroup[] = [
  { id: "young", name: "Young voters", icon: "🎓", base: 0.16, urban: 0.6, pos: { e: -0.35, s: -0.6 }, likes: { education: 1, housing: 1, carbonTax: 1, drugPolicy: 1, votingAge: -1, transport: 1, marriage: 1 }, lobby: "Student union" },
  { id: "retirees", name: "Retirees", icon: "🧓", base: 0.19, urban: -0.2, pos: { e: 0.05, s: 0.45 }, likes: { pensions: 1, healthcare: 1, police: 1 }, lobby: "Seniors' association" },
  { id: "workers", name: "Working families", icon: "🛠️", base: 0.2, urban: 0, pos: { e: -0.45, s: 0.25 }, likes: { minimumWage: 1, unions: 1, welfare: 1, trade: -1, healthcare: 1 }, lobby: "Trade unions" },
  { id: "business", name: "Business owners", icon: "💼", base: 0.08, urban: 0.4, pos: { e: 0.7, s: 0 }, likes: { corporateTax: -1, capitalGains: -1, unions: -1, trade: 1, minimumWage: -1 }, lobby: "Chamber of commerce" },
  { id: "rural", name: "Farmers & rural", icon: "🚜", base: 0.1, urban: -1, pos: { e: 0.25, s: 0.55 }, likes: { subsidies: 1, carbonTax: -1, gunPolicy: 1, trade: -1, energy: -1 }, lobby: "Farmers' federation" },
  { id: "professionals", name: "Urban professionals", icon: "🏙️", base: 0.12, urban: 1, pos: { e: 0.15, s: -0.55 }, likes: { transport: 1, immigration: 1, education: 1, incomeTax: -1 }, lobby: "Tech industry" },
  { id: "faith", name: "Religious voters", icon: "⛪", base: 0.09, urban: -0.5, pos: { e: 0.1, s: 0.85 }, likes: { marriage: -1, church: -1, drugPolicy: -1 }, lobby: "Faith council" },
  { id: "green", name: "Environmentalists", icon: "🌿", base: 0.06, urban: 0.5, pos: { e: -0.35, s: -0.5 }, likes: { carbonTax: 1, energy: 1, transport: 1 }, lobby: "Green groups" },
];
export const GROUP: Record<string, VoterGroup> = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
/** Groups that pull against each other: courting one costs a little with the other. */
export const RIVAL_GROUPS: Record<string, string> = { workers: "business", business: "workers", faith: "young", young: "faith", green: "rural", rural: "green" };
/** How much each point of goodwill is worth at the ballot box. */
const GOODWILL_PULL = 0.005;

const mixCache = new WeakMap<Country, Float32Array>();
/** How much of each county belongs to each group (rows of GROUPS.length, summing to 1). */
export function groupMix(c: Country) {
  let m = mixCache.get(c);
  if (m) return m;
  const n = GROUPS.length;
  m = new Float32Array(c.sections.length * n);
  c.sections.forEach((sec, i) => {
    let sum = 0;
    GROUPS.forEach((g, k) => {
      const w = g.base * Math.max(0.15, 1 + g.urban * (sec.urban - 0.4) * 1.6);
      m![i * n + k] = w;
      sum += w;
    });
    for (let k = 0; k < n; k++) m![i * n + k] /= sum;
  });
  mixCache.set(c, m);
  return m;
}

/** The extra pull your party has in a county from the groups you've won over and the press. */
export function playerBonus(s: G.GameState, section: number) {
  const gw = s.goodwill;
  if (!gw) return 0;
  const m = groupMix(G.country(s));
  const n = GROUPS.length;
  let b = 0;
  for (let k = 0; k < n; k++) b += m[section * n + k] * (gw[GROUPS[k].id] ?? 0);
  return b * GOODWILL_PULL + pressLift(s) * 0.004;
}

/** Who a voter group backs: a share per party (scenario order). */
export function groupPoll(s: G.GameState, groupId: string, poll = G.nationalPoll(s)) {
  const g = GROUP[groupId];
  const ps = G.partyDefs(s);
  const u = ps.map((p) => (p.noRun || (poll[p.id] ?? 0) <= 0 ? -Infinity : -3 * dist(g.pos, p.pos) + Math.log((poll[p.id] ?? 0) + 0.01) * 1.2 + (p.id === s.party ? (s.goodwill[g.id] ?? 0) * 0.03 : 0)));
  const mx = Math.max(...u.filter((x) => x > -Infinity));
  const e = u.map((x) => (x === -Infinity ? 0 : Math.exp(x - mx)));
  const sum = e.reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(ps.map((p, i) => [p.id, e[i] / sum])) as Record<PartyId, number>;
}

/** The event that does most for a voter group. */
export const courtEvent = (group: string) => Object.values(EVENT).filter((e) => e.group === group && e.kind === "voters").sort((a, b) => (b.goodwill ?? 0) - (a.goodwill ?? 0))[0]?.id ?? null;

const bump = (rec: Record<string, number>, k: string, v: number, lo = -40, hi = 60) => (rec[k] = clamp((rec[k] ?? 0) + v, lo, hi));

/** Win (or lose) a voter group's goodwill; its interest group notices, and its rival group a little. */
export function courtGroup(s: G.GameState, group: string, v: number) {
  if (!GROUP[group] || !v) return;
  bump(s.goodwill, group, v);
  bump(s.lobbies, group, v / 2, -50, 100);
  const rival = RIVAL_GROUPS[group];
  if (rival && v > 0) bump(s.goodwill, rival, -v * 0.3);
}

/** A law changed: the groups that care remember who did it. */
export function lawChanged(s: G.GameState, law: string, from: number, to: number, byYou: boolean, govCredit: boolean) {
  const dir = Math.sign(to - from);
  if (!dir) return;
  for (const g of GROUPS) {
    const like = g.likes[law];
    if (!like) continue;
    const v = like * dir;
    if (byYou) {
      bump(s.goodwill, g.id, v * 4);
      bump(s.lobbies, g.id, v * 6, -50, 100);
    } else if (govCredit) bump(s.goodwill, g.id, v * 2);
  }
  // Your factions judge every law your party passes.
  if (byYou) {
    const l = G.lawOf(s, law);
    if (l) for (const f of s.factions) f.mood = clamp(f.mood + (dist(l.options[from].pos, f.pos) - dist(l.options[to].pos, f.pos)) * 25, 0, 100);
  }
}

// ------------------------------------------------------------------ factions

export interface Faction {
  id: string;
  name: string;
  pos: Pos;
  /** Share of the party, %. */
  strength: number;
  /** 0 furious – 100 delighted. */
  mood: number;
}

export function makeFactions(s: G.GameState): Faction[] {
  const p = G.party(s, s.party).pos;
  const r = G.roll(s);
  const a = 26 + r.int(0, 14);
  const b = 26 + r.int(0, 14);
  return [
    { id: "left", name: "Progressive wing", pos: { e: clamp(p.e - 0.35, -1, 1), s: clamp(p.s - 0.25, -1, 1) }, strength: a, mood: 60 },
    { id: "centre", name: "Moderates", pos: { ...p }, strength: 100 - a - b, mood: 62 },
    { id: "right", name: "Traditionalists", pos: { e: clamp(p.e + 0.35, -1, 1), s: clamp(p.s + 0.25, -1, 1) }, strength: b, mood: 60 },
  ];
}

/** How the factions would vote on your leadership: the share of the party behind you. */
export function leadershipSupport(s: G.GameState) {
  const you = G.pol(s, s.you);
  let sum = 0;
  for (const f of s.factions) sum += f.strength * clamp((f.mood - 25) / 30, 0, 1);
  return clamp(sum / 100 + ((you?.charisma ?? 5) - 5) * 0.02, 0, 1);
}

export type ChallengeAnswer = "vote" | "concede" | "congress";
export const CONGRESS_COST = 4;

/** Answer a leadership challenge: face the vote, buy off the rebels, or call a congress first. */
export function answerChallenge(s: G.GameState, a: ChallengeAnswer) {
  const ch = s.challenge;
  if (!ch) return null;
  const f = s.factions.find((x) => x.id === ch.faction) ?? s.factions[0];
  const ps = s.parties[s.party];
  s.challenge = null;
  s.lowUnity = 0;
  if (a === "concede") {
    // The rebels get their way: a promise in their direction.
    f.mood = clamp(f.mood + 25, 0, 100);
    ps.unity = clamp(ps.unity + 12, 0, 100);
    s.score = Math.max(0, s.score - 40);
    G.news(s, "party", `${G.fullName(G.pol(s, s.you)!)} makes concessions to the ${f.name.toLowerCase()}; the challenge is dropped`, 0);
    return { survived: true, support: leadershipSupport(s) };
  }
  if (a === "congress" && ps.funds >= CONGRESS_COST) {
    ps.funds -= CONGRESS_COST;
    for (const x of s.factions) x.mood = clamp(x.mood + 12, 0, 100);
  }
  const support = leadershipSupport(s) + (G.roll(s).next() - 0.5) * 0.12;
  if (support >= 0.5) {
    ps.unity = clamp(ps.unity + 15, 0, 100);
    for (const x of s.factions) x.mood = clamp(x.mood + 6, 0, 100);
    s.score += 50;
    G.news(s, "party", `${G.fullName(G.pol(s, s.you)!)} survives a leadership challenge with ${Math.round(support * 100)}% of the party`, 1);
    return { survived: true, support };
  }
  s.ousted = true;
  s.over = true;
  G.news(s, "party", `${G.fullName(G.pol(s, s.you)!)} is ousted as ${G.titles(s).leader.toLowerCase()} of the ${G.party(s, s.party).name}`, -1);
  return { survived: false, support };
}

// ------------------------------------------------------------------ the planner

export interface PlanItem {
  id: number;
  week: number;
  event: string;
  state: number;
}
export const PLAN_AHEAD = 16;
export const PLAN_MAX = 24;

/** Schedule an event for a later week (it's held, and paid for, when the week comes). */
export function schedule(s: G.GameState, event: string, week: number, state = s.homeState): PlanItem | string {
  if (!EVENT[event]) return "Unknown event.";
  if (week <= s.week) return "Pick a week from next week on.";
  if (week > s.week + PLAN_AHEAD) return `You can plan ${PLAN_AHEAD} weeks ahead.`;
  if (s.plan.length >= PLAN_MAX) return "Your diary is full.";
  if (s.plan.filter((p) => p.week === week && p.event === event).length >= 2) return "That's already twice that week.";
  const item = { id: s.nextPlan++, week, event, state };
  s.plan.push(item);
  s.plan.sort((a, b) => a.week - b.week || a.id - b.id);
  return item;
}
export function unschedule(s: G.GameState, id: number) {
  const n = s.plan.length;
  s.plan = s.plan.filter((p) => p.id !== id);
  return s.plan.length < n;
}

/** The week has come: hold what was planned for it. */
export function runPlan(s: G.GameState) {
  const due = s.plan.filter((p) => p.week <= s.week);
  s.plan = s.plan.filter((p) => p.week > s.week);
  for (const p of due) {
    const r = G.holdEvent(s, p.event, p.state);
    const ev = EVENT[p.event];
    if (!r.ok) G.news(s, "event", `Planned ${ev.name.toLowerCase()} called off: not enough party funds`, -1);
    else if (!r.backfired) G.news(s, "event", `${ev.name} held as planned${ev.scope === "state" ? ` in ${G.country(s).states[p.state]?.name ?? ""}` : ""}`, 1);
  }
}

// ------------------------------------------------------------------ debates

export const DEBATE_TOPICS = [
  { id: "economy", name: "the economy", group: "business" },
  { id: "health", name: "health care", group: "retirees" },
  { id: "jobs", name: "jobs and wages", group: "workers" },
  { id: "climate", name: "the climate", group: "green" },
  { id: "housing", name: "housing", group: "young" },
  { id: "crime", name: "crime", group: "retirees" },
  { id: "immigration", name: "immigration", group: "workers" },
  { id: "values", name: "family and values", group: "faith" },
  { id: "tech", name: "technology", group: "professionals" },
  { id: "farms", name: "farming", group: "rural" },
];
export type DebateStyle = "facts" | "attack" | "heart";
export const DEBATE_STYLES: { id: DebateStyle; name: string; about: string }[] = [
  { id: "facts", name: "The facts", about: "Steady and detailed. Rarely wins big, rarely loses." },
  { id: "attack", name: "Go on the attack", about: "Hit your rival hard. Brilliant or disastrous." },
  { id: "heart", name: "Speak from the heart", about: "A story people remember. Charisma counts." },
];

export interface DebateState {
  week: number;
  rival: PartyId;
  topics: string[];
  answers: { style: DebateStyle; points: number }[];
}

/** Answer a debate question. Returns the points scored (and finishes the debate after the last). */
export function debateAnswer(s: G.GameState, style: DebateStyle) {
  const d = s.debate;
  if (!d) return null;
  const r = G.roll(s);
  const you = G.pol(s, s.you);
  const ch = you?.charisma ?? 5;
  const unity = s.parties[s.party].unity;
  const points = style === "facts" ? 2 + r.next() * 3 + (unity - 60) / 25 : style === "attack" ? -6 + r.next() * 16 : (ch - 5) * 1.3 + (r.next() - 0.4) * 8;
  d.answers.push({ style, points: Math.round(points * 10) / 10 });
  if (d.answers.length >= d.topics.length) return { points, done: finishDebate(s) };
  return { points, done: null };
}

/** The debate is over (unanswered questions get careful answers). */
export function finishDebate(s: G.GameState) {
  const d = s.debate;
  if (!d) return null;
  while (d.answers.length < d.topics.length) d.answers.push({ style: "facts", points: 2 });
  const total = d.answers.reduce((a, x) => a + x.points, 0);
  s.debate = null;
  const rival = G.party(s, d.rival);
  const ps = s.parties[s.party];
  const won = total > 6;
  const lost = total < 0;
  if (won) {
    ps.swing += 0.05;
    ps.members += 2000;
    s.score += 50;
    for (const t of d.topics) bump(s.goodwill, DEBATE_TOPICS.find((x) => x.id === t)!.group, 3);
    bump(s.press, "broadcaster", 6);
  } else if (lost) {
    ps.swing -= 0.04;
    s.parties[d.rival].swing += 0.02;
  }
  G.news(s, "election", won ? `Debate night: ${G.fullName(G.pol(s, s.you)!)} wins the debate against the ${rival.short}` : lost ? `Debate night: the ${rival.short} leader comes out on top` : `Debate night: no clear winner between the ${G.party(s, s.party).short} and the ${rival.short}`, won ? 1 : lost ? -1 : 0);
  return { won, lost, total };
}

// ------------------------------------------------------------------ the cabinet

export const PORTFOLIOS = [
  { id: "finance", name: "Finance", icon: "💰", about: "Growth and the budget" },
  { id: "foreign", name: "Foreign Affairs", icon: "🌐", about: "Relations abroad" },
  { id: "interior", name: "Home Affairs", icon: "🛡️", about: "Order and approval" },
  { id: "defence", name: "Defence", icon: "🎖️", about: "Security and allies" },
  { id: "health", name: "Health", icon: "🏥", about: "Happiness" },
  { id: "education", name: "Education", icon: "📚", about: "Young voters, long-run growth" },
  { id: "environment", name: "Environment & Energy", icon: "🌿", about: "Environmentalists" },
  { id: "justice", name: "Justice", icon: "⚖️", about: "Fewer scandals" },
];

/** How good a politician is at running a department, 3–9. */
export const skill = (p: G.Politician | undefined) => (p ? 3 + ((p.face >>> 4) % 7) : 0);
/** Which wing of their party a politician is in. */
export const FACTION_IDS = ["left", "centre", "right"] as const;
export const factionOf = (p: G.Politician) => FACTION_IDS[(p.face >>> 9) % 3];
/** An empty post is run by civil servants: worse than most ministers. */
const VACANT = 4;
/** A cabinet of ministers this good leaves the country as it is (a typical one comes out about here). */
const PAR = 8;
/** "Minister of Health", or "Secretary of Health" in presidential systems. */
export const ministerTitle = (s: G.GameState, portfolio: string) => {
  const pf = PORTFOLIOS.find((x) => x.id === portfolio)!;
  return `${G.sys(s).exec === "presidential" ? "Secretary" : "Minister"} of ${pf.name}`;
};

/** Who could serve: members of the governing parties in either house (not the head of government). */
export function candidates(s: G.GameState) {
  const ids = new Set([...s.house, ...s.senate]);
  return s.politicians.filter((p) => ids.has(p.id) && s.gov.parties.includes(p.party) && p.id !== s.gov.head && p.id !== s.president);
}

/** Fill the cabinet: posts shared among the governing parties by seats, the able and the well-connected first. */
export function formCabinet(s: G.GameState) {
  const r = G.roll(s);
  const order = new Map(candidates(s).map((p) => [p.id, skill(p) + r.next() * 5]));
  const pool = candidates(s).sort((a, b) => order.get(b.id)! - order.get(a.id)!);
  const by = G.houseBy(s);
  const govSeats = s.gov.parties.reduce((a, p) => a + (by[p] ?? 0), 0) || 1;
  const quota = Object.fromEntries(s.gov.parties.map((p) => [p, Math.max(p === s.gov.parties[0] ? 3 : 1, Math.round((PORTFOLIOS.length * (by[p] ?? 0)) / govSeats))]));
  const used = new Set<number>();
  s.cabinet = {};
  for (const pf of PORTFOLIOS) {
    const p = pool.find((x) => !used.has(x.id) && (quota[x.party] ?? 0) > 0) ?? pool.find((x) => !used.has(x.id));
    if (!p) continue;
    used.add(p.id);
    quota[p.party] = (quota[p.party] ?? 0) - 1;
    s.cabinet[pf.id] = p.id;
  }
}

/** Appoint (or reshuffle) a minister. Only the head of government can. */
export function appoint(s: G.GameState, portfolio: string, id: number) {
  if (s.gov.head !== s.you || !PORTFOLIOS.some((p) => p.id === portfolio)) return false;
  if (!candidates(s).some((p) => p.id === id)) return false;
  // Someone moving from another post leaves it empty.
  for (const [k, v] of Object.entries(s.cabinet)) if (v === id) delete s.cabinet[k];
  const before = s.cabinet[portfolio];
  s.cabinet[portfolio] = id;
  const p = G.pol(s, id)!;
  if (before !== undefined && before !== id) G.news(s, "government", `Reshuffle: ${G.fullName(p)} becomes ${ministerTitle(s, portfolio)}`, 0);
  return true;
}

/** What the cabinet does to the country (per week, folded into the economy). */
export function cabinetFx(s: G.GameState) {
  const sk = (pf: string) => {
    const id = s.cabinet?.[pf];
    const p = id === undefined ? undefined : G.pol(s, id);
    return p ? skill(p) : VACANT;
  };
  const all = PORTFOLIOS.map((p) => sk(p.id));
  const avg = all.reduce((a, b) => a + b, 0) / all.length;
  return {
    growth: (sk("finance") - PAR) * 0.05 + (sk("education") - PAR) * 0.01,
    budget: (sk("finance") - PAR) * 4,
    happiness: (sk("health") - PAR) * 0.3,
    approval: (avg - PAR) * 1.2 + (sk("interior") - PAR) * 0.3,
    scandal: 1 - (sk("justice") - PAR) * 0.08,
    foreign: (sk("foreign") - PAR) * 0.08 + (sk("defence") - PAR) * 0.03,
    young: (sk("education") - PAR) * 0.03,
    green: (sk("environment") - PAR) * 0.03,
  };
}

// ------------------------------------------------------------------ coalition deals

export interface Deal {
  party: PartyId;
  law: string;
  dir: number;
  start: number;
  deadline: number;
  /** The government promised this to you (you're the junior partner). */
  forYou?: boolean;
}

/** The law a party most wants moved one step (and which way). */
function wish(s: G.GameState, p: PartyId) {
  const pos = G.party(s, p).pos;
  let best: { law: string; dir: number; gain: number } | null = null;
  for (const l of G.allLaws(s)) {
    if (l.constitutional) continue;
    const cur = s.laws[l.id];
    for (const d of [-1, 1]) {
      const o = l.options[cur + d];
      if (!o) continue;
      const gain = dist(l.options[cur].pos, pos) - dist(o.pos, pos);
      if (gain > 0.1 && (!best || gain > best.gain)) best = { law: l.id, dir: d, gain };
    }
  }
  return best;
}

/** A new government: partners' moods and the deals that hold it together. */
export function newGovernment(s: G.GameState) {
  formCabinet(s);
  s.partners = Object.fromEntries(s.gov.parties.slice(1).map((p) => [p, 60]));
  s.deals = [];
  const youLead = s.gov.parties[0] === s.party;
  if (youLead)
    for (const p of s.gov.parties.slice(1)) {
      const w = wish(s, p);
      if (w) s.deals.push({ party: p, law: w.law, dir: w.dir, start: s.laws[w.law], deadline: s.week + WEEKS });
    }
  else if (s.gov.parties.includes(s.party)) {
    const w = wish(s, s.party);
    if (w) s.deals.push({ party: s.party, law: w.law, dir: w.dir, start: s.laws[w.law], deadline: s.week + WEEKS, forYou: true });
  }
}

/** Leave a government you're a junior partner in. */
export function leaveGovernment(s: G.GameState) {
  if (!s.gov.parties.includes(s.party) || s.gov.parties[0] === s.party) return false;
  s.gov = { ...s.gov, parties: s.gov.parties.filter((p) => p !== s.party) };
  s.deals = s.deals.filter((d) => d.party !== s.party);
  delete s.partners[s.party];
  for (const [k, v] of Object.entries(s.cabinet)) if (G.pol(s, v)?.party === s.party) delete s.cabinet[k];
  s.parties[s.gov.parties[0]].relations[s.party] -= 25;
  G.news(s, "government", `The ${G.party(s, s.party).name} walk out of the government`, 0);
  return true;
}

function partnersWeek(s: G.GameState) {
  for (const d of [...s.deals]) {
    const moved = Math.sign(s.laws[d.law] - d.start) === d.dir;
    const l = LAW[d.law] ?? G.lawOf(s, d.law);
    if (moved) {
      s.deals = s.deals.filter((x) => x !== d);
      if (d.forYou) {
        s.score += 60;
        G.news(s, "government", `The government keeps its promise to the ${G.party(s, s.party).short}: ${l?.name ?? "a law"} changes`, 1);
      } else {
        s.partners[d.party] = clamp((s.partners[d.party] ?? 50) + 25, 0, 100);
        G.news(s, "government", `Coalition deal kept: the ${G.party(s, d.party).short} get their way on ${l?.name.toLowerCase() ?? "a law"}`, 1);
      }
    } else if (s.week > d.deadline) {
      s.deals = s.deals.filter((x) => x !== d);
      if (!d.forYou) {
        s.partners[d.party] = clamp((s.partners[d.party] ?? 50) - 30, 0, 100);
        G.news(s, "government", `Coalition row: the ${G.party(s, d.party).short} say a deal on ${l?.name.toLowerCase() ?? "a law"} was broken`, -1);
      }
    }
  }
  // Partners want their share of the cabinet.
  const posts: Record<string, number> = {};
  for (const id of Object.values(s.cabinet)) {
    const p = G.pol(s, id)?.party;
    if (p) posts[p] = (posts[p] ?? 0) + 1;
  }
  const by = G.houseBy(s);
  const govSeats = s.gov.parties.reduce((a, p) => a + (by[p] ?? 0), 0) || 1;
  for (const p of s.gov.parties.slice(1)) {
    if (p === s.party) continue;
    const fair = (PORTFOLIOS.length * (by[p] ?? 0)) / govSeats;
    let m = s.partners[p] ?? 50;
    m += ((posts[p] ?? 0) - fair) * 0.4 + (55 - m) * 0.01;
    s.partners[p] = clamp(m, 0, 100);
    if (m < 12 && s.gov.parties[0] === s.party) {
      // The partner walks out.
      s.gov = { ...s.gov, parties: s.gov.parties.filter((x) => x !== p) };
      delete s.partners[p];
      s.deals = s.deals.filter((d) => d.party !== p);
      for (const [k, v] of Object.entries(s.cabinet)) if (G.pol(s, v)?.party === p) delete s.cabinet[k];
      s.stats.approval -= 4;
      G.news(s, "government", `The ${G.party(s, p).name} quit the coalition. The government is left in a minority`, -1);
    }
  }
}

// ------------------------------------------------------------------ crises

export interface CrisisOption {
  label: string;
  approval?: number;
  happiness?: number;
  /** Billions at Avalon's scale (scaled to the country). */
  budget?: number;
  /** A temporary boost to growth (fades over months). */
  growth?: number;
  goodwill?: Record<string, number>;
  foreign?: number;
}
export interface CrisisDef {
  id: string;
  icon: string;
  title: string;
  text: string;
  options: CrisisOption[];
}

export const CRISES: CrisisDef[] = [
  { id: "flood", icon: "🌊", title: "Floods in {region}", text: "Rivers burst their banks across {region}. Thousands are out of their homes.", options: [{ label: "An emergency relief fund", budget: -12, approval: 4, happiness: 1 }, { label: "Send in the army", budget: -5, approval: 2 }, { label: "Leave it to the regional government", approval: -5, happiness: -1 }] },
  { id: "strike", icon: "🚆", title: "The rail workers walk out", text: "A national rail strike shuts down the trains. Commuters are furious; the unions say they're underpaid.", options: [{ label: "Meet their demands", budget: -6, approval: 1, goodwill: { workers: 6, business: -4 } }, { label: "Tough it out", growth: -0.2, approval: -2, goodwill: { workers: -6, business: 3 } }, { label: "Call in mediators", approval: 1, goodwill: { workers: 2 } }] },
  { id: "pandemic", icon: "🦠", title: "A new virus spreads", text: "Hospitals are filling up with a new respiratory virus.", options: [{ label: "Lock down", growth: -0.6, happiness: -2, approval: 3, goodwill: { retirees: 5, young: -4, business: -4 } }, { label: "A mass vaccination drive", budget: -15, approval: 4, happiness: 1 }, { label: "Stay open", approval: -4, goodwill: { retirees: -6, business: 5 } }] },
  { id: "bank", icon: "🏦", title: "A major bank collapses", text: "One of the country's biggest banks is about to go under, taking savings with it.", options: [{ label: "Bail it out", budget: -40, approval: -3, goodwill: { business: 4, workers: -3 } }, { label: "Let it fail", growth: -0.7, approval: -2, goodwill: { business: -5 } }, { label: "Nationalise it", budget: -20, goodwill: { business: -6, workers: 3 } }] },
  { id: "wildfire", icon: "🔥", title: "Wildfires in {region}", text: "Fires sweep through the hills of {region}. The smoke reaches the cities.", options: [{ label: "Fund the firefighters", budget: -8, approval: 3, goodwill: { green: 2 } }, { label: "Declare it a climate emergency", budget: -4, goodwill: { green: 6, rural: -3 } }, { label: "Blame the regional government", approval: -2 }] },
  { id: "cyber", icon: "💻", title: "A cyber attack on the government", text: "Hackers take down government websites and leak emails.", options: [{ label: "Retaliate", approval: 2, foreign: -12 }, { label: "Invest in cyber defence", budget: -6, approval: 2 }, { label: "Investigate quietly", approval: -1 }] },
  { id: "protest", icon: "📢", title: "Protests over the cost of living", text: "Hundreds of thousands march against rising prices.", options: [{ label: "Cut fuel duty", budget: -10, happiness: 2, goodwill: { green: -4, workers: 3 } }, { label: "Address the nation", approval: 1 }, { label: "A police crackdown", approval: -3, goodwill: { retirees: 2, young: -6 } }] },
  { id: "housing", icon: "🏘️", title: "House prices hit a record", text: "A generation is priced out of buying a home.", options: [{ label: "Build 300,000 homes", budget: -15, growth: 0.1, goodwill: { young: 6, rural: -2 } }, { label: "Grants for first-time buyers", budget: -8, goodwill: { young: 3, retirees: 1 } }, { label: "Let the market sort it out", goodwill: { young: -4, business: 2 } }] },
  { id: "refugees", icon: "🧳", title: "Refugees arrive at the border", text: "Thousands fleeing a war abroad arrive at the border.", options: [{ label: "Welcome them", budget: -5, goodwill: { professionals: 3, workers: -3, faith: 2 } }, { label: "Close the border", foreign: -8, goodwill: { workers: 3, professionals: -4 } }, { label: "Ask allies to share the load", approval: 1, foreign: 5 }] },
  { id: "drought", icon: "🌾", title: "Drought hits the farms", text: "No rain for months: the harvest is failing.", options: [{ label: "Emergency farm aid", budget: -6, goodwill: { rural: 6 } }, { label: "Water restrictions", happiness: -1, goodwill: { green: 2 } }, { label: "Do nothing", goodwill: { rural: -6 } }] },
  { id: "factory", icon: "🏭", title: "A carmaker may close its plant in {region}", text: "Thousands of jobs in {region} hang on one decision.", options: [{ label: "A subsidy to stay", budget: -7, goodwill: { workers: 5, business: 2 } }, { label: "Retrain the workers", budget: -4, goodwill: { workers: 2, young: 1 } }, { label: "Let it go", growth: -0.1, goodwill: { workers: -5 } }] },
  { id: "techhq", icon: "🛰️", title: "A tech giant picks a new headquarters", text: "A household-name tech company is choosing between us and a rival country.", options: [{ label: "Tax breaks to win it", budget: -5, growth: 0.2, goodwill: { professionals: 4, workers: -2 } }, { label: "No special deals", approval: 1, goodwill: { professionals: -2 } }] },
  { id: "corruption", icon: "🕵️", title: "Corruption probe in a ministry", text: "Investigators raid a government department over rigged contracts.", options: [{ label: "A full public inquiry", approval: 2 }, { label: "Sack the department's chief", approval: 1 }, { label: "Keep it internal", approval: -3 }] },
  { id: "oil", icon: "🛢️", title: "Oil prices spike", text: "A war overseas sends oil prices soaring.", options: [{ label: "Subsidise fuel", budget: -12, happiness: 1, goodwill: { green: -4, rural: 3 } }, { label: "Speed up renewables", budget: -6, goodwill: { green: 5, rural: -2 } }, { label: "Let prices rise", happiness: -2, growth: -0.2 }] },
  { id: "olympics", icon: "🏅", title: "A bid to host the Olympics", text: "The sports world wants us to bid for the Games.", options: [{ label: "Bid", budget: -10, approval: 3, happiness: 2, growth: 0.1 }, { label: "Don't bid", approval: -1 }] },
  { id: "row", icon: "🚩", title: "A diplomatic row with {partner}", text: "{partner} accuses our diplomats of spying.", options: [{ label: "Expel their diplomats", approval: 2, foreign: -20 }, { label: "Apologise", approval: -2, foreign: 10 }, { label: "Quiet talks", foreign: 4 }] },
  { id: "teachers", icon: "🏫", title: "Teachers threaten to strike", text: "Schools could close next month over pay.", options: [{ label: "A pay rise", budget: -6, goodwill: { young: 2, workers: 3 } }, { label: "Hold the line", approval: -2, goodwill: { workers: -3 } }] },
  { id: "storm", icon: "🌀", title: "A storm batters {region}", text: "Power lines are down and roads cut off across {region}.", options: [{ label: "Rebuild fast", budget: -9, approval: 3 }, { label: "Insurance and loans", budget: -3, approval: 1 }, { label: "A slow, cheap repair", approval: -3 }] },
];
export const CRISIS: Record<string, CrisisDef> = Object.fromEntries(CRISES.map((c) => [c.id, c]));

export interface CrisisState {
  id: string;
  week: number;
  region: number;
  partner: string;
  /** You decide (as head of government); otherwise you react to the government's choice. */
  mine: boolean;
  govChoice: number;
}

export const crisisText = (s: G.GameState, c: CrisisState, t: string) => t.replace(/\{region\}/g, G.country(s).states[c.region]?.name ?? "the north").replace(/\{partner\}/g, c.partner);

/** Apply a crisis option's effects (for whoever governs). */
function applyOption(s: G.GameState, o: CrisisOption, scale = 1) {
  const st = s.stats;
  const k = s.sc.economy.gdp / 18;
  if (o.approval) st.approval = clamp(st.approval + o.approval * scale, 5, 95);
  if (o.happiness) st.happiness += o.happiness * scale;
  if (o.budget) st.debt -= o.budget * k * scale;
  if (o.growth) s.boosts.growth += o.growth * scale;
  if (o.foreign) for (const f of s.foreign) f.rel = clamp(f.rel + o.foreign * scale * (f.name === s.crisis?.partner ? 1 : 0.3), -100, 100);
}

/** Decide (or react to) the crisis on the table. */
export function answerCrisis(s: G.GameState, choice: number) {
  const c = s.crisis;
  if (!c) return false;
  const def = CRISIS[c.id];
  s.crisis = null;
  if (c.mine) {
    const o = def.options[choice] ?? def.options[0];
    applyOption(s, o);
    // The groups remember who decided.
    for (const [g, v] of Object.entries(o.goodwill ?? {})) bump(s.goodwill, g, v);
    s.score += (o.approval ?? 0) > 0 ? 20 : 5;
    G.news(s, "government", `${crisisText(s, c, def.title)}: the government decides to ${o.label.toLowerCase()}`, (o.approval ?? 0) >= 0 ? 1 : -1);
    return true;
  }
  // In opposition (or a junior partner): back or criticise the government's response.
  const o = def.options[c.govChoice] ?? def.options[0];
  const good = (o.approval ?? 0) > 0;
  const ps = s.parties[s.party];
  const gp = s.gov.parties[0];
  if (choice === 0) {
    s.parties[gp].relations[s.party] = clamp(s.parties[gp].relations[s.party] + 4, -100, 100);
    ps.swing += good ? 0.01 : -0.015;
    G.news(s, "event", `The ${G.party(s, s.party).short} back the government's response to ${crisisText(s, c, def.title).toLowerCase()}`, good ? 1 : 0);
  } else {
    s.parties[gp].relations[s.party] = clamp(s.parties[gp].relations[s.party] - 4, -100, 100);
    ps.swing += good ? -0.015 : 0.03;
    G.news(s, "event", `The ${G.party(s, s.party).short} attack the government's handling of ${crisisText(s, c, def.title).toLowerCase()}`, good ? -1 : 1);
  }
  return true;
}

function maybeCrisis(s: G.GameState) {
  if (s.crisis || s.week < s.nextCrisis) return;
  const r = G.roll(s);
  s.nextCrisis = s.week + 9 + r.int(0, 10);
  const def = r.pick(CRISES);
  const c = G.country(s);
  const head = s.gov.head === s.you;
  const best = def.options.reduce((bi, o, i) => ((o.approval ?? 0) - (o.budget ?? 0) * 0.03 > (def.options[bi].approval ?? 0) - (def.options[bi].budget ?? 0) * 0.03 ? i : bi), 0);
  const govChoice = r.next() < 0.7 ? best : r.int(0, def.options.length - 1);
  s.crisis = { id: def.id, week: s.week, region: r.int(0, c.states.length - 1), partner: r.pick(s.foreign)?.name ?? "a neighbour", mine: head, govChoice };
  if (!head) applyOption(s, def.options[govChoice]);
  G.news(s, "government", `${def.icon} ${crisisText(s, s.crisis, def.title)}`, 0);
}

// ------------------------------------------------------------------ executive actions

export interface OrderDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  cooldown: number;
  approval?: number;
  happiness?: number;
  budget?: number;
  growth?: number;
  unemployment?: number;
  goodwill?: Record<string, number>;
  foreign?: number;
  /** Chance the courts (or the legislature) block it in a presidential system. */
  risk?: number;
}

export const ORDERS: OrderDef[] = [
  { id: "address", name: "Address the nation", icon: "🎤", desc: "A prime-time speech to the country.", cooldown: 12, approval: 3 },
  { id: "rebate", name: "Tax rebate cheques", icon: "💸", desc: "Money back in every household's pocket.", cooldown: 52, budget: -25, happiness: 2, approval: 3 },
  { id: "infrastructure", name: "Infrastructure blitz", icon: "🏗️", desc: "Roads, rail and broadband, now.", cooldown: 26, budget: -15, growth: 0.25, goodwill: { workers: 3 } },
  { id: "priceCap", name: "Energy price cap", icon: "⚡", desc: "Cap household energy bills.", cooldown: 26, budget: -8, happiness: 1.5, goodwill: { business: -3 } },
  { id: "crackdown", name: "Crime crackdown", icon: "🚔", desc: "More police on the streets.", cooldown: 26, approval: 2, goodwill: { retirees: 3, young: -3 }, risk: 0.1 },
  { id: "climate", name: "Climate emergency", icon: "🌍", desc: "Declare a climate emergency.", cooldown: 52, goodwill: { green: 8, rural: -4, business: -2 } },
  { id: "hiringFreeze", name: "Public hiring freeze", icon: "🧊", desc: "Save money; the public sector feels it.", cooldown: 26, budget: 10, happiness: -1, goodwill: { workers: -3 } },
  { id: "tariffs", name: "Emergency tariffs", icon: "🚧", desc: "Protect home industry from imports.", cooldown: 52, growth: -0.1, foreign: -10, goodwill: { workers: 4, rural: 2, business: -4 }, risk: 0.2 },
  { id: "youthJobs", name: "Youth jobs scheme", icon: "🧑‍🔧", desc: "A guaranteed job or training for every young person.", cooldown: 26, budget: -6, unemployment: -0.3, goodwill: { young: 5 } },
  { id: "border", name: "Border order", icon: "🛂", desc: "Tighten the border by order.", cooldown: 52, approval: 1, foreign: -5, goodwill: { workers: 3, professionals: -3 }, risk: 0.25 },
];
export const ORDER: Record<string, OrderDef> = Object.fromEntries(ORDERS.map((o) => [o.id, o]));

/** Use an executive action (heads of government only; each has a cooldown). */
export function issueOrder(s: G.GameState, id: string): { ok: boolean; blocked?: boolean; why?: string } {
  const o = ORDER[id];
  if (!o) return { ok: false, why: "Unknown action." };
  if (s.gov.head !== s.you) return { ok: false, why: `Only the ${G.titles(s).head} can do that.` };
  if ((s.orders[id] ?? 0) > s.week) return { ok: false, why: `Ready again in ${s.orders[id] - s.week} weeks.` };
  s.orders[id] = s.week + o.cooldown;
  const r = G.roll(s);
  const presidential = G.sys(s).exec === "presidential";
  if (o.risk && r.next() < o.risk * (presidential ? 1 : 0.5)) {
    s.stats.approval = clamp(s.stats.approval - 2, 5, 95);
    G.news(s, "government", `${o.name}: the courts block the order`, -1);
    return { ok: true, blocked: true };
  }
  const k = s.sc.economy.gdp / 18;
  if (o.approval) s.stats.approval = clamp(s.stats.approval + o.approval, 5, 95);
  if (o.happiness) s.boosts.happiness += o.happiness;
  if (o.budget) s.stats.debt -= o.budget * k;
  if (o.growth) s.boosts.growth += o.growth;
  if (o.unemployment) s.stats.unemployment = Math.max(1, s.stats.unemployment + o.unemployment);
  if (o.foreign) for (const f of s.foreign) f.rel = clamp(f.rel + o.foreign, -100, 100);
  for (const [g, v] of Object.entries(o.goodwill ?? {})) bump(s.goodwill, g, v);
  s.score += 10;
  G.news(s, "government", `${presidential ? "Executive order" : "Government action"}: ${o.name.toLowerCase()}`, 1);
  return { ok: true };
}

// ------------------------------------------------------------------ referendums

export const REFERENDUM_COST = 4;
export const REFERENDUM_GAP = WEEKS;

/** Put a change to a law to the people. Returns the yes share, or why it can't happen. */
export function callReferendum(s: G.GameState, law: string, option: number): { yes: number; passed: boolean } | string {
  const l = G.lawOf(s, law);
  if (!l || !l.options[option] || option === s.laws[law]) return "Pick a change to the law.";
  if (s.gov.head !== s.you) return `Only the ${G.titles(s).head} can call a referendum.`;
  if (s.week - s.lastReferendum < REFERENDUM_GAP) return `One referendum a year: the next can be in ${REFERENDUM_GAP - (s.week - s.lastReferendum)} weeks.`;
  const ps = s.parties[s.party];
  if (ps.funds < REFERENDUM_COST) return "Not enough party funds for the campaign.";
  ps.funds -= REFERENDUM_COST;
  s.lastReferendum = s.week;
  const cur = l.options[s.laws[law]].pos;
  const nxt = l.options[option].pos;
  const poll = G.nationalPoll(s);
  let yes = 0;
  for (const p of G.partyDefs(s)) {
    const want = dist(cur, p.pos) - dist(nxt, p.pos);
    yes += (poll[p.id] ?? 0) * clamp(0.5 + want * 0.9, 0.12, 0.88);
  }
  // The groups that care, the government's standing, and the campaign.
  for (const g of GROUPS) if (g.likes[law]) yes += g.base * g.likes[law] * Math.sign(option - s.laws[law]) * 0.06;
  yes += (s.stats.approval - 50) / 400 + (G.roll(s).next() - 0.5) * 0.06;
  yes = clamp(yes, 0.05, 0.95);
  const passed = yes > 0.5;
  const from = s.laws[law];
  if (passed) {
    s.laws[law] = option;
    lawChanged(s, law, from, option, true, true);
    s.lawsPassed++;
    s.score += 60;
  } else s.stats.approval = clamp(s.stats.approval - 4, 5, 95);
  G.news(s, "law", `Referendum on ${l.name.toLowerCase()} (${l.options[option].label}): ${passed ? "yes" : "no"} wins with ${Math.round((passed ? yes : 1 - yes) * 100)}%`, passed ? 1 : -1);
  return { yes, passed };
}

// ------------------------------------------------------------------ foreign relations

export interface Foreign {
  name: string;
  rel: number;
  base: number;
  deal: boolean;
  /** Week of the next visit you can make. */
  ready: number;
}

/** Each country's neighbours and partners (and how they get on today). */
const PARTNERS: Record<string, [string, number][]> = {
  us: [["Canada", 70], ["Mexico", 35], ["United Kingdom", 75], ["European Union", 55], ["Japan", 70], ["China", -25], ["India", 40], ["Russia", -60]],
  gb: [["United States", 75], ["European Union", 40], ["France", 50], ["Germany", 55], ["Ireland", 55], ["India", 45], ["China", -15], ["Russia", -65]],
  ca: [["United States", 45], ["Mexico", 40], ["United Kingdom", 70], ["European Union", 60], ["Japan", 55], ["China", -20], ["India", -10], ["Australia", 70]],
  au: [["United States", 70], ["China", -5], ["Japan", 60], ["Indonesia", 35], ["New Zealand", 85], ["India", 50], ["United Kingdom", 70], ["European Union", 45]],
  de: [["France", 75], ["United States", 50], ["Poland", 45], ["United Kingdom", 50], ["Italy", 60], ["China", 10], ["Russia", -55], ["Turkey", 15]],
  fr: [["Germany", 70], ["United States", 45], ["United Kingdom", 45], ["Italy", 50], ["Spain", 60], ["Algeria", 0], ["China", 5], ["Russia", -50]],
  es: [["France", 65], ["Portugal", 80], ["Morocco", 25], ["Germany", 55], ["Italy", 60], ["United States", 50], ["Mexico", 30], ["United Kingdom", 40]],
  it: [["France", 50], ["Germany", 55], ["Spain", 60], ["United States", 60], ["Libya", -10], ["China", 5], ["Russia", -40], ["Albania", 40]],
  jp: [["United States", 75], ["China", -20], ["South Korea", 30], ["Australia", 65], ["India", 55], ["Taiwan", 55], ["Russia", -45], ["European Union", 50]],
  in: [["United States", 45], ["Russia", 40], ["China", -35], ["Pakistan", -60], ["Bangladesh", 40], ["Japan", 55], ["European Union", 40], ["Nepal", 45]],
  br: [["Argentina", 40], ["United States", 25], ["China", 40], ["European Union", 35], ["Paraguay", 45], ["Portugal", 60], ["India", 35], ["Venezuela", -15]],
  mx: [["United States", 25], ["Canada", 45], ["Guatemala", 35], ["Spain", 45], ["Brazil", 35], ["China", 15], ["Colombia", 40], ["Cuba", 20]],
};
const MADE_UP: [string, number][] = [["Republic of Norland", 50], ["Eastmark", 30], ["Union of Meridia", 15], ["Kingdom of Valtria", 40], ["Pacifica", 55], ["Federation of Borea", -20], ["Sultanate of Qadir", 5], ["Isles of Corran", 35]];

export function makeForeign(s: G.GameState): Foreign[] {
  const list = PARTNERS[s.sc.map.kind === "real" ? s.sc.map.code : ""] ?? MADE_UP;
  return list.map(([name, rel]) => ({ name, rel, base: rel, deal: false, ready: 0 }));
}

export type ForeignAction = "visit" | "deal" | "condemn";
export const VISIT_GAP = 8;

/** Diplomacy (heads of government only): a state visit, a trade deal, or a public rebuke. */
export function diplomacy(s: G.GameState, name: string, a: ForeignAction): { ok: boolean; why?: string; success?: boolean } {
  const f = s.foreign.find((x) => x.name === name);
  if (!f) return { ok: false, why: "Unknown country." };
  if (s.gov.head !== s.you) return { ok: false, why: `Only the ${G.titles(s).head} can do that.` };
  if (f.ready > s.week) return { ok: false, why: `Ready again in ${f.ready - s.week} weeks.` };
  f.ready = s.week + VISIT_GAP;
  const r = G.roll(s);
  if (a === "visit") {
    f.rel = clamp(f.rel + 12, -100, 100);
    if (f.rel > 0) s.stats.approval = clamp(s.stats.approval + 0.8, 5, 95);
    G.news(s, "government", `State visit: ${G.fullName(G.pol(s, s.you)!)} meets the leaders of ${f.name}`, 1);
    return { ok: true, success: true };
  }
  if (a === "deal") {
    if (f.deal) return { ok: false, why: "There's already a trade deal." };
    if (f.rel < 35) return { ok: false, why: "Relations aren't warm enough for a deal." };
    const success = r.next() < 0.4 + f.rel / 200;
    if (success) {
      f.deal = true;
      s.tradeGrowth += 0.08;
      bump(s.goodwill, "business", 4);
      bump(s.goodwill, "workers", -2);
      s.score += 40;
      G.news(s, "government", `A trade deal with ${f.name} is signed`, 1);
    } else {
      f.rel = clamp(f.rel - 6, -100, 100);
      G.news(s, "government", `Trade talks with ${f.name} collapse`, -1);
    }
    return { ok: true, success };
  }
  f.rel = clamp(f.rel - 20, -100, 100);
  s.stats.approval = clamp(s.stats.approval + (f.rel < 0 ? 1.5 : -1), 5, 95);
  G.news(s, "government", `The government condemns ${f.name}`, 0);
  return { ok: true, success: true };
}

// ------------------------------------------------------------------ the press

export const OUTLETS = [
  { id: "clarion", name: "The Clarion", pos: { e: -0.5, s: -0.4 }, kind: "left-leaning daily" },
  { id: "broadcaster", name: "The Public Broadcaster", pos: { e: 0, s: 0 }, kind: "national TV and radio" },
  { id: "courier", name: "The Daily Courier", pos: { e: 0.45, s: 0.3 }, kind: "right-leaning daily" },
  { id: "star", name: "The Evening Star", pos: { e: 0.15, s: 0.55 }, kind: "tabloid" },
];

/** Where an outlet's coverage of you settles, given your party's politics. */
const pressBase = (s: G.GameState, o: (typeof OUTLETS)[number]) => clamp(25 - 45 * dist(o.pos, G.party(s, s.party).pos), -40, 40);

/** How much better (or worse) the press is treating you than it usually would. */
export function pressLift(s: G.GameState) {
  const p = s.press;
  if (!p) return 0;
  let sum = 0;
  for (const o of OUTLETS) sum += (p[o.id] ?? 0) - pressBase(s, o);
  return sum / OUTLETS.length;
}

/** How the press treats you on average (-50 … 50). */
export function pressMood(s: G.GameState) {
  const p = s.press;
  if (!p) return 0;
  let sum = 0;
  for (const o of OUTLETS) sum += p[o.id] ?? 0;
  return sum / OUTLETS.length;
}

/** An event changes the coverage (press conferences help; scandals hurt; tabloids swing hardest). */
export function pressEvent(s: G.GameState, v: number) {
  for (const o of OUTLETS) bump(s.press, o.id, v * (o.id === "star" ? 1.6 : 1), -50, 50);
}

// ------------------------------------------------------------------ setup and the week

/** Fresh politics for a new game (and missing pieces for older saves). */
export function initPolitics(s: G.GameState) {
  s.plan ??= [];
  s.nextPlan ??= 1;
  s.goodwill ??= Object.fromEntries(GROUPS.map((g) => [g.id, 0]));
  s.lobbies ??= Object.fromEntries(GROUPS.map((g) => [g.id, Math.round(clamp(40 - 60 * dist(g.pos, G.party(s, s.party).pos), -40, 60))]));
  s.factions ??= makeFactions(s);
  s.lowUnity ??= 0;
  s.challenge ??= null;
  s.cabinet ??= {};
  s.partners ??= {};
  s.deals ??= [];
  s.crisis ??= null;
  s.nextCrisis ??= s.week + 8;
  s.orders ??= {};
  s.foreign ??= makeForeign(s);
  s.press ??= Object.fromEntries(OUTLETS.map((o) => [o.id, Math.round(pressBase(s, o))]));
  s.debate ??= null;
  s.lastReferendum ??= -WEEKS;
  s.boosts ??= { growth: 0, happiness: 0 };
  s.tradeGrowth ??= 0;
  s.donors ??= 0;
  if (!Object.keys(s.cabinet).length && s.gov.parties.length) newGovernment(s);
}

/** The week in politics (called from endTurn, before the date moves on). */
export function politicsWeek(s: G.GameState) {
  const r = G.roll(s);
  const ps = s.parties[s.party];
  const cab = cabinetFx(s);
  // Goodwill fades without attention; interest groups give to friends.
  for (const g of GROUPS) {
    s.goodwill[g.id] = (s.goodwill[g.id] ?? 0) * 0.975;
    s.lobbies[g.id] = (s.lobbies[g.id] ?? 0) + (0 - (s.lobbies[g.id] ?? 0)) * 0.004;
    ps.funds += Math.max(0, s.lobbies[g.id] ?? 0) * 0.0025;
  }
  if (s.gov.parties[0] === s.party) {
    bump(s.goodwill, "young", cab.young);
    bump(s.goodwill, "green", cab.green);
  }
  // Ministers whose party has left the government go with it; when someone else leads, they fill gaps.
  for (const [k, v] of Object.entries(s.cabinet)) {
    const p = G.pol(s, v);
    if (!p || !s.gov.parties.includes(p.party)) delete s.cabinet[k];
  }
  // When you lead, a post you leave empty gets an acting minister after a few weeks.
  if (Object.keys(s.cabinet).length < PORTFOLIOS.length && (s.gov.head !== s.you || r.next() < 0.25)) {
    const used = new Set(Object.values(s.cabinet));
    const pool = candidates(s).filter((p) => !used.has(p.id));
    for (const pf of PORTFOLIOS) {
      if (s.cabinet[pf.id] !== undefined || !pool.length) continue;
      const p = pool.splice(r.int(0, pool.length - 1), 1)[0];
      s.cabinet[pf.id] = p.id;
      if (s.gov.head === s.you) G.news(s, "government", `${G.fullName(p)} steps in as acting ${ministerTitle(s, pf.id)}`, 0);
      if (s.gov.head === s.you) break;
    }
  }
  // Your factions want their share of your party's posts.
  if (s.gov.parties.includes(s.party)) {
    const mine = Object.values(s.cabinet)
      .map((id) => G.pol(s, id))
      .filter((p): p is G.Politician => !!p && p.party === s.party);
    if (mine.length)
      for (const f of s.factions) {
        const share = mine.filter((p) => factionOf(p) === f.id).length / mine.length;
        f.mood = clamp(f.mood + (share - f.strength / 100) * 0.6, 0, 100);
      }
  }
  // The press drifts back to what it thinks of your politics.
  for (const o of OUTLETS) s.press[o.id] = (s.press[o.id] ?? 0) + (pressBase(s, o) - (s.press[o.id] ?? 0)) * 0.04;
  // Donors forget (slowly) how often you've asked.
  s.donors *= 0.8;
  // Factions: moods settle; unity follows them; a long stretch of disunity brings a challenge.
  for (const f of s.factions) f.mood += (55 - f.mood) * 0.02;
  const fm = s.factions.reduce((a, f) => a + (f.strength * f.mood) / 100, 0);
  ps.unity = clamp(ps.unity + (fm - ps.unity) * 0.05, 0, 100);
  if (ps.unity < 30) s.lowUnity++;
  else s.lowUnity = Math.max(0, s.lowUnity - 1);
  if (s.lowUnity === 4) G.news(s, "party", `Rumblings in the ${G.party(s, s.party).short}: rebels talk of a leadership challenge`, -1);
  if (s.lowUnity >= 8 && !s.challenge && !s.over) {
    const worst = [...s.factions].sort((a, b) => a.mood - b.mood)[0];
    s.challenge = { week: s.week, faction: worst.id };
    G.news(s, "party", `The ${worst.name.toLowerCase()} trigger a leadership challenge`, -1);
  }
  // Coalition partners, crises, foreign relations.
  if (s.gov.parties.length > 1) partnersWeek(s);
  for (const f of s.foreign) f.rel = clamp(f.rel + (f.base - f.rel) * 0.01 + (s.gov.parties[0] === s.party ? cab.foreign : 0), -100, 100);
  maybeCrisis(s);
  // Minister scandals (fewer with a good justice minister).
  if (s.gov.head === s.you && r.next() < 0.012 * cab.scandal) {
    const posts = Object.entries(s.cabinet);
    if (posts.length) {
      const [pf, id] = r.pick(posts);
      const p = G.pol(s, id);
      if (p) {
        delete s.cabinet[pf];
        s.stats.approval = clamp(s.stats.approval - 2, 5, 95);
        pressEvent(s, -6);
        G.news(s, "scandal", `${G.fullName(p)} resigns as ${ministerTitle(s, pf)} after a scandal. Appoint a replacement`, -1);
      }
    }
  }
  // A TV debate three weeks before a national election.
  const next = G.nextElection(s);
  if (next.week - s.week === 3 && (next.kind !== "upper") && !s.debate) {
    const poll = G.nationalPoll(s);
    const rival = G.running(s)
      .filter((p) => p !== s.party && !G.party(s, p).others)
      .sort((a, b) => poll[b] - poll[a])[0];
    if (rival) {
      const topics = [...DEBATE_TOPICS].sort(() => r.next() - 0.5).slice(0, 3).map((t) => t.id);
      s.debate = { week: s.week, rival, topics, answers: [] };
    }
  }
  // Interest groups endorse two weeks out.
  if (next.week - s.week === 2 && next.kind !== "upper")
    for (const g of GROUPS) {
      if ((s.lobbies[g.id] ?? 0) >= 55) {
        bump(s.goodwill, g.id, 5);
        G.news(s, "election", `The ${g.lobby.toLowerCase()} endorse the ${G.party(s, s.party).name}`, 1);
      }
    }
  // Temporary boosts fade.
  s.boosts.growth *= 0.96;
  s.boosts.happiness *= 0.95;
}

/** End-of-week: anything still waiting on the player is settled with a sensible default. */
export function settlePending(s: G.GameState) {
  if (s.crisis) answerCrisis(s, s.crisis.mine ? 0 : 0);
  if (s.debate && s.week > s.debate.week) finishDebate(s);
  if (s.challenge) answerChallenge(s, "vote");
}

/** After an election: factions react, beaten AI parties may change leader. */
export function afterElection(s: G.GameState, e: G.ElectionRun) {
  if (e.contests.lower) {
    const d = (e.houseSeats[s.party] ?? 0) - (e.prevHouse[s.party] ?? 0);
    for (const f of s.factions) f.mood = clamp(f.mood + clamp(d * (400 / Math.max(100, G.sys(s).lower.seats)), -15, 15), 0, 100);
    const r = G.roll(s);
    for (const p of G.running(s)) {
      if (p === s.party) continue;
      const before = e.prevHouse[p] ?? 0;
      const after = e.houseSeats[p] ?? 0;
      if (before > 4 && after < before * 0.8 && r.next() < 0.7) {
        const ps = s.parties[p];
        const heir = G.newPolitician(s, p, r.int(0, G.country(s).states.length - 1));
        const old = G.pol(s, ps.leader);
        ps.leader = heir.id;
        if (s.gov.parties[0] === p && G.sys(s).exec !== "presidential") s.gov = { ...s.gov, head: heir.id };
        G.news(s, "party", `${old ? G.fullName(old) : "The leader"} steps down after the ${G.party(s, p).short}'s defeat; ${G.fullName(heir)} takes over`, 0);
      }
    }
  }
}
