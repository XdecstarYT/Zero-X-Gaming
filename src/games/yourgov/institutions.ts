/**
 * Institutions beyond the chambers: the whips (your own lawmakers can rebel, by faction), the
 * country's top court (judges, vacancies and nominations, and laws challenged and sometimes
 * struck down), and your party's annual conference.
 *
 * Works on sim.ts's state and seeded stream; nothing at the top level uses another module's
 * values.
 */
import { WEEKS, type PartyId, type Pos } from "./data";
import * as C from "./campaign";
import * as K from "./career";
import * as P from "./politics";
import * as G from "./sim";

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a: Pos, b: Pos) => Math.hypot(a.e - b.e, a.s - b.s);

// ------------------------------------------------------------------ the whips

export type Whip = "normal" | "three" | "free";
export const WHIPS: { id: Whip; name: string; about: string }[] = [
  { id: "normal", name: "Normal whip", about: "Most follow the party line; unhappy wings may not." },
  { id: "three", name: "Three-line whip", about: "Almost nobody rebels, but it costs unity." },
  { id: "free", name: "Free vote", about: "Everyone votes with their conscience. The wings like it." },
];

/** How strongly a faction feels about a bill (above zero: for it). */
function factionStance(s: G.GameState, f: P.Faction, b: G.Bill) {
  if (b.budget) return (s.gov.parties.includes(s.party) ? 0.6 : -0.2) + C.budgetLeanAt(b.plan, f.pos);
  const l = G.lawOf(s, b.law);
  if (!l) return 0;
  return (dist(l.options[s.laws[l.id]].pos, f.pos) - dist(l.options[b.option].pos, f.pos)) * 1.4;
}

/** A lawmaker of your party: the party line, pulled towards their wing's view as the whip allows. */
export function memberStance(s: G.GameState, p: G.Politician, b: G.Bill, line: number) {
  const f = s.factions?.find((x) => x.id === P.factionOf(p));
  if (!f) return line;
  const w = b.whip === "free" ? 1 : b.whip === "three" ? 0.06 : clamp(0.12 + (60 - f.mood) / 150, 0.04, 0.5);
  return line * (1 - w) + factionStance(s, f, b) * w;
}

/** After a vote: rebellions are news and cost unity; whips have their price. */
export function afterVote(s: G.GameState, b: G.Bill, t: G.Tally) {
  const ps = s.parties[s.party];
  if (b.whip === "three") ps.unity = clamp(ps.unity - 2, 0, 100);
  if (b.whip === "free") for (const f of s.factions) f.mood = clamp(f.mood + 1.5, 0, 100);
  const n = t.rebels ?? 0;
  if (!n || b.whip === "free") return;
  const seats = G.voters(s, b).filter((id) => G.pol(s, id)?.party === s.party).length || 1;
  ps.unity = clamp(ps.unity - Math.min(6, (n / seats) * 25), 0, 100);
  if (n >= 2 || n / seats > 0.1) G.news(s, "party", `${n} ${G.party(s, s.party).short} lawmakers rebel on ${b.budget ? "the budget" : (G.lawOf(s, b.law)?.name.toLowerCase() ?? "a bill")}`, -1);
}

export function setWhip(s: G.GameState, billId: number, w: Whip) {
  const b = s.bills.find((x) => x.id === billId);
  if (!b || b.stage === "passed" || b.stage === "failed") return false;
  b.whip = w;
  return true;
}

// ------------------------------------------------------------------ the court

export interface Judge {
  id: number;
  name: string;
  pos: Pos;
  age: number;
  since: number;
}
export interface Nominee {
  name: string;
  pos: Pos;
  /** 1–5 stars. */
  skill: number;
  label: string;
}
export interface Case {
  id: number;
  law: string;
  from: number;
  to: number;
  /** Week of the ruling. */
  week: number;
  /** Who brought it. */
  by: string;
  mine: boolean;
}
export interface Court {
  judges: Judge[];
  nominees: Nominee[] | null;
  /** Week of the next retirement. */
  next: number;
  cases: Case[];
  nextId: number;
}

export const COURT_SIZE = 9;
const COURT_NAMES: Record<string, string> = { us: "Supreme Court", gb: "Supreme Court", ca: "Supreme Court", au: "High Court", de: "Federal Constitutional Court", fr: "Constitutional Council", es: "Constitutional Court", it: "Constitutional Court", jp: "Supreme Court", in: "Supreme Court", br: "Supreme Federal Court", mx: "Supreme Court of Justice" };
export const courtName = (s: G.GameState) => COURT_NAMES[s.sc.map.kind === "real" ? s.sc.map.code : ""] ?? "Supreme Court";
/** Laws about rights get challenged in court far more often. */
const RIGHTS = new Set(["speech", "marriage", "gunPolicy", "deathPenalty", "immigration", "church", "drugPolicy", "votingAge", "campaignFinance", "unions", "police"]);
export const leanLabel = (p: Pos) => (p.s < -0.25 ? "Liberal" : p.s > 0.25 ? "Conservative" : "Centrist");

function judgeName(s: G.GameState, r: ReturnType<typeof G.roll>) {
  const pool = G.namePool(s);
  return `${r.pick(pool.first)} ${r.pick(pool.last)}`;
}

export function initCourt(s: G.GameState) {
  if (s.court) return;
  const r = G.roll(s);
  // A bench appointed over the years by governments of all stripes, centred on the country's politics.
  const ps = G.partyDefs(s).filter((p) => !p.noRun);
  const w = ps.reduce((a, p) => a + p.base, 0) || 1;
  const mid = { e: ps.reduce((a, p) => a + p.pos.e * p.base, 0) / w, s: ps.reduce((a, p) => a + p.pos.s * p.base, 0) / w };
  s.court = {
    judges: Array.from({ length: COURT_SIZE }, (_, i) => ({ id: i + 1, name: judgeName(s, r), pos: { e: clamp(mid.e + (r.next() - 0.5) * 0.9, -1, 1), s: clamp(mid.s + (r.next() - 0.5) * 1.1, -1, 1) }, age: r.int(52, 78), since: -r.int(0, 15) * WEEKS })),
    nominees: null,
    next: s.week + r.int(40, 120),
    cases: [],
    nextId: COURT_SIZE + 1,
  };
}

function nomineesFor(s: G.GameState): Nominee[] {
  const r = G.roll(s);
  const home = G.party(s, G.pol(s, s.gov.head)?.party ?? s.gov.parties[0]).pos;
  const mk = (pos: Pos, label: string): Nominee => ({ name: judgeName(s, r), pos: { e: clamp(pos.e, -1, 1), s: clamp(pos.s, -1, 1) }, skill: 2 + r.int(0, 3), label });
  return [mk({ e: home.e, s: home.s + (home.s >= 0 ? 0.15 : -0.15) }, "A loyalist"), mk({ e: home.e * 0.4, s: home.s * 0.4 }, "A moderate"), mk({ e: -home.e * 0.2, s: -home.s * 0.2 }, "Across the aisle")];
}

/** Does the upper house (where it votes on judges) confirm? Returns yes votes and the total. */
export function confirmation(s: G.GameState, n: Nominee) {
  const up = G.sys(s).upper.kind;
  if (G.sys(s).exec !== "presidential" || up === "none" || up === "appointed" || up === "council") return null;
  let yes = 0;
  for (const id of s.senate) {
    const p = G.pol(s, id);
    if (!p) continue;
    const pos = G.party(s, p.party).pos;
    if (s.gov.parties.includes(p.party) || dist(pos, n.pos) < 0.7 + n.skill * 0.05) yes++;
  }
  return { yes, total: s.senate.length };
}

/** Put a nominee forward (the head of government does). Returns the outcome. */
export function nominate(s: G.GameState, i: number): { ok: boolean; confirmed?: boolean; why?: string } {
  const c = s.court;
  const n = c.nominees?.[i];
  if (!n) return { ok: false, why: "No vacancy." };
  const vote = confirmation(s, n);
  const confirmed = !vote || vote.yes * 2 > vote.total;
  const yours = s.gov.head === s.you;
  if (confirmed) {
    c.judges.push({ id: c.nextId++, name: n.name, pos: n.pos, age: 48 + n.skill * 2, since: s.week });
    c.nominees = null;
    if (yours) {
      G.news(s, "government", `${n.name} joins the ${courtName(s)}${vote ? `, confirmed ${vote.yes} to ${vote.total - vote.yes}` : ""}`, 1);
      s.score += 40;
      C.note(s, "judges");
      K.mark(s, "⚖️", `Put ${n.name} on the ${courtName(s)}`);
    }
  } else {
    c.nominees = nomineesFor(s);
    G.news(s, "government", `The ${G.sys(s).upper.short} rejects ${n.name} for the ${courtName(s)}, ${vote!.yes} to ${vote!.total - vote!.yes}`, yours ? -1 : 0);
  }
  return { ok: true, confirmed };
}

/** A law has changed: will someone take it to court? */
export function maybeChallenge(s: G.GameState, law: string, from: number, to: number, mine: boolean) {
  const l = G.lawOf(s, law);
  if (!l || !s.court) return;
  const r = G.roll(s);
  const chance = l.constitutional ? 0.5 : RIGHTS.has(law) ? 0.4 : 0.06;
  if (r.next() >= chance) return;
  // Whoever lost out brings the case.
  const loser = P.GROUPS.find((g) => (g.likes[law] ?? 0) * Math.sign(to - from) < 0);
  const by = loser?.lobby ?? "A civil liberties group";
  s.court.cases.push({ id: s.court.nextId++, law, from, to, week: s.week + r.int(6, 12), by, mine });
  G.news(s, "law", `${by} challenge the change to ${l.name.toLowerCase()} at the ${courtName(s)}`, mine ? -1 : 0);
}

/** How the bench would rule on a case today: votes to uphold the new law. */
export function upholds(s: G.GameState, c: Case) {
  const l = G.lawOf(s, c.law);
  if (!l) return COURT_SIZE;
  const now = l.options[c.to].pos;
  const was = l.options[c.from].pos;
  // Judges defer to the legislature unless the change goes against their view by some way.
  return s.court.judges.filter((j) => dist(now, j.pos) <= dist(was, j.pos) + 0.3).length;
}

export function courtWeek(s: G.GameState) {
  initCourt(s);
  const c = s.court;
  const r = G.roll(s);
  // Rulings.
  for (const k of c.cases.filter((x) => x.week <= s.week)) {
    c.cases = c.cases.filter((x) => x !== k);
    const l = G.lawOf(s, k.law);
    if (!l || s.laws[k.law] !== k.to) continue;
    const yes = upholds(s, k);
    const total = c.judges.length;
    if (yes * 2 > total) {
      G.news(s, "law", `The ${courtName(s)} upholds the change to ${l.name.toLowerCase()}, ${yes} to ${total - yes}`, k.mine ? 1 : 0);
    } else {
      s.laws[k.law] = k.from;
      if (k.mine) {
        s.parties[s.party].swing -= 0.01;
        s.score = Math.max(0, s.score - 20);
      }
      G.news(s, "law", `The ${courtName(s)} strikes down the change to ${l.name.toLowerCase()}, ${total - yes} to ${yes}: it's back to ${l.options[k.from].label}`, k.mine ? -1 : 0);
    }
  }
  // Retirements: a seat comes free.
  if (s.week >= c.next && !c.nominees) {
    c.next = s.week + r.int(70, 150);
    const j = [...c.judges].sort((a, b) => b.age + (s.week - b.since) / WEEKS - (a.age + (s.week - a.since) / WEEKS))[0];
    if (j) {
      c.judges = c.judges.filter((x) => x !== j);
      c.nominees = nomineesFor(s);
      G.news(s, "government", `${j.name} retires from the ${courtName(s)}. A seat is free`, 0);
    }
  }
  // Someone else's government fills it straight away (with someone like them).
  if (c.nominees && s.gov.head !== s.you) nominate(s, 0);
}

/** Anything left at the end of the week: a vacancy you didn't fill gets the moderate. */
export function settleCourt(s: G.GameState, created: number) {
  if (s.court?.nominees && s.gov.head === s.you && s.week > created) nominate(s, 1);
}

// ------------------------------------------------------------------ the party conference

export const CONFERENCE_WEEK = 37;
export interface Motion {
  faction: string;
  law: string;
  dir: number;
}
export interface Conference {
  week: number;
  motions: Motion[];
}
export const SPEECHES = [
  { id: "unity", name: "Bring the party together", about: "Every wing hears something it likes.", unity: 8, press: 1, swing: 0 },
  { id: "vision", name: "A big vision for the country", about: "Talk to the voters, not the hall.", unity: 2, press: 4, swing: 0.015 },
  { id: "attack", name: "Tear into the opposition", about: "The hall loves it; the country isn't sure.", unity: 6, press: -2, swing: 0.005 },
];

/** The law a faction most wants moved a step. */
function factionWish(s: G.GameState, f: P.Faction, avoid: Set<string>) {
  let best: Motion | null = null;
  let gain = 0.12;
  for (const l of G.allLaws(s)) {
    if (l.constitutional || avoid.has(l.id)) continue;
    const cur = s.laws[l.id];
    for (const d of [-1, 1]) {
      const o = l.options[cur + d];
      if (!o) continue;
      const g = dist(l.options[cur].pos, f.pos) - dist(o.pos, f.pos);
      if (g > gain) {
        gain = g;
        best = { faction: f.id, law: l.id, dir: d };
      }
    }
  }
  return best;
}

function maybeConference(s: G.GameState) {
  if (s.conference || G.weekOf(s.week) !== CONFERENCE_WEEK - 1 || s.election) return;
  const taken = new Set<string>();
  const motions: Motion[] = [];
  for (const id of ["left", "right"]) {
    const f = s.factions.find((x) => x.id === id);
    const m = f && factionWish(s, f, taken);
    if (m) {
      motions.push(m);
      taken.add(m.law);
    }
  }
  s.conference = { week: s.week, motions };
}

/** Close the conference: your speech, and backing (true) or opposing (false) each motion. */
export function holdConference(s: G.GameState, speech: string, back: boolean[]) {
  const c = s.conference;
  if (!c) return null;
  s.conference = null;
  const ps = s.parties[s.party];
  const sp = SPEECHES.find((x) => x.id === speech) ?? SPEECHES[0];
  ps.unity = clamp(ps.unity + sp.unity, 0, 100);
  P.pressEvent(s, sp.press);
  ps.swing += sp.swing;
  c.motions.forEach((m, i) => {
    const f = s.factions.find((x) => x.id === m.faction);
    const other = s.factions.find((x) => x.id === (m.faction === "left" ? "right" : "left"));
    if (back[i]) {
      if (f) f.mood = clamp(f.mood + 10, 0, 100);
      if (other) other.mood = clamp(other.mood - 5, 0, 100);
      G.addPledge(s, m.law, m.dir);
    } else if (f) f.mood = clamp(f.mood - 6, 0, 100);
  });
  G.news(s, "party", `${G.party(s, s.party).name} conference: ${G.fullName(G.pol(s, s.you)!)} ${sp.id === "unity" ? "brings the party together" : sp.id === "vision" ? "sets out a vision for the country" : "tears into the opposition"}`, 1);
  return sp;
}

export function settleConference(s: G.GameState) {
  if (s.conference && s.week > s.conference.week) holdConference(s, "unity", s.conference.motions.map(() => false));
}

// ------------------------------------------------------------------ setup and the week

export function initInstitutions(s: G.GameState) {
  initCourt(s);
  s.conference ??= null;
  s.courtSeen ??= -1;
}

export function institutionsWeek(s: G.GameState) {
  courtWeek(s);
  if (s.court.nominees && s.courtSeen < 0) s.courtSeen = s.week;
  if (!s.court.nominees) s.courtSeen = -1;
  maybeConference(s);
}

export function settleInstitutions(s: G.GameState) {
  settleConference(s);
  if (s.courtSeen >= 0) settleCourt(s, s.courtSeen);
}

/** Party in charge of nominations (for display). */
export const nominator = (s: G.GameState): PartyId => G.pol(s, s.gov.head)?.party ?? s.gov.parties[0];
