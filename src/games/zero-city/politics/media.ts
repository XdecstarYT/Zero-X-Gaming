/**
 * The press (Statecraft, 1.0). Four outlets, each with its own lean and readers. How they feel
 * about you colours what their readers hear every hour. You can hold a press conference once a
 * day (three questions, three answers each), give one outlet an exclusive interview, and, in the
 * campaign, face your rival in a three-round televised debate scored by the audience.
 */
import type { Stats } from "../sim/sim";
import type { Position } from "./mandate";
import { PARTIES, PARTY_BASE, overall, shares, type Faction, type Moods, type PartyId, type PoliticsState } from "./politics";
import { clamp, rollOf } from "./util";

export const OUTLET_IDS = ["herald", "ledger", "clarion", "channel9"] as const;
export type OutletId = (typeof OUTLET_IDS)[number];
export interface OutletDef {
  readers: Partial<Moods>;
  lean: Position;
  color: string;
}
export const OUTLETS: Record<OutletId, OutletDef> = {
  herald: { readers: { workers: 0.2, business: 0.2, families: 0.2, greens: 0.2, seniors: 0.2 }, lean: [0, 0], color: "#e5e7eb" },
  ledger: { readers: { business: 0.45, seniors: 0.35, families: 0.2 }, lean: [0.6, 0.3], color: "#60a5fa" },
  clarion: { readers: { workers: 0.5, greens: 0.3, families: 0.2 }, lean: [-0.6, -0.2], color: "#f87171" },
  channel9: { readers: { families: 0.4, seniors: 0.3, workers: 0.3 }, lean: [0.1, 0.4], color: "#fbbf24" },
};
/** Each outlet's natural opposite (an exclusive with one irritates the other). */
const OPPOSITE: Record<OutletId, OutletId> = { herald: "channel9", ledger: "clarion", clarion: "ledger", channel9: "herald" };

type Effect = { mood: Partial<Moods>; outlets: Partial<Record<OutletId, number>> };
export const QUESTION_IDS = ["taxes", "jobs", "traffic", "housing", "crime", "pollution", "scandal", "deficit", "coalition", "schools", "parks", "record"] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];
export interface QuestionDef {
  /** When it comes up (always-on questions fill in). */
  when: (s: PoliticsState, st: Stats) => boolean;
  answers: [Effect, Effect, Effect];
}
const e = (mood: Partial<Moods>, outlets: Partial<Record<OutletId, number>>): Effect => ({ mood, outlets });
const all = (v: number): Partial<Moods> => ({ workers: v, business: v, families: v, greens: v, seniors: v });
export const QUESTIONS: Record<QuestionId, QuestionDef> = {
  taxes: { when: (s) => s.taxes.R >= 0.11 || s.taxes.C >= 0.11 || s.taxes.I >= 0.11, answers: [e({ workers: 1, business: -2 }, { clarion: 5, ledger: -4 }), e({ business: 3, families: 2, workers: -1 }, { ledger: 6, clarion: -4 }), e({}, { herald: 2 })] },
  jobs: { when: (_, st) => st.unemployed / Math.max(1, st.population * 0.52) > 0.06, answers: [e({ workers: 3, business: -1 }, { clarion: 4 }), e({ business: 3, workers: -1 }, { ledger: 4 }), e({ families: 1, workers: 1 }, { herald: 3 })] },
  traffic: { when: (_, st) => st.congestion > 0.25, answers: [e({ greens: 2, workers: 1 }, { clarion: 3, ledger: -2 }), e({ business: 2, greens: -3 }, { ledger: 3 }), e({ greens: 2, business: -3 }, { clarion: 2, channel9: -3 })] },
  housing: { when: () => true, answers: [e({ workers: 3, business: -2 }, { clarion: 4 }), e({ business: 3, seniors: -2 }, { ledger: 4 }), e({ seniors: 3, business: -2 }, { channel9: 4 })] },
  crime: { when: (_, st) => st.coverage.police < 0.6, answers: [e({ seniors: 3, greens: -2 }, { channel9: 5 }), e({ greens: 2, families: 1 }, { clarion: 3 }), e({ seniors: -2 }, { herald: -3 })] },
  pollution: { when: (_, st) => st.pollution > 0.08, answers: [e({ greens: 3, business: -2 }, { clarion: 3 }), e({ greens: 1, business: 1 }, { herald: 3 }), e({ workers: 2, greens: -3 }, { ledger: 3 })] },
  scandal: { when: (s) => !!s.parl.scandal || !!s.x?.lobbies.leaked, answers: [e(all(1), { herald: 5 }), e(all(-1), { channel9: -6, herald: -3 }), e({ seniors: 1 }, { herald: -6, clarion: -4, channel9: 3 })] },
  deficit: { when: (s) => s.cash < 0, answers: [e({ business: 3, workers: -2 }, { ledger: 4 }), e({ workers: 1, seniors: -2 }, { clarion: 2, ledger: -3 }), e({ greens: 1, business: -3 }, { clarion: 3, ledger: -3 })] },
  coalition: { when: (s) => s.parl.coalition.length > 0, answers: [e(all(0.5), { herald: 3 }), e({ seniors: 1 }, { channel9: 2, clarion: -1 }), e({}, { herald: -2 })] },
  schools: { when: (_, st) => st.coverage.school < 0.6, answers: [e({ families: 3 }, { herald: 3 }), e({ business: 2, families: -1 }, { ledger: 3 }), e({ families: -2 }, { channel9: -2 })] },
  parks: { when: (_, st) => st.coverage.park < 0.5, answers: [e({ greens: 2, families: 2 }, { clarion: 2 }), e({ business: 2, greens: -2 }, { ledger: 2 }), e({ greens: -1 }, { channel9: 1 })] },
  record: { when: () => true, answers: [e({ business: 2, workers: 1 }, { ledger: 3 }), e({ families: 2, seniors: 1 }, { herald: 3 }), e(all(0.5), { channel9: 3 })] },
};

export interface DebateState {
  qs: QuestionId[];
  i: number;
  you: number;
  them: number;
  rival: PartyId;
  /** Each round: the question, your answer, theirs, and the audience's verdict on each. */
  log: { q: QuestionId; a: number; ra: number; you: number; them: number }[];
}
export interface MediaState {
  rel: Record<OutletId, number>;
  /** Today's press conference: questions, how far through, the running tone. */
  press: { qs: QuestionId[]; i: number; tone: number } | null;
  pressAt: number;
  interviewAt: number;
  debate: DebateState | null;
  pressHeld: number;
  debatesWon: number;
}

export function newMedia(): MediaState {
  return { rel: { herald: 10, ledger: 0, clarion: 0, channel9: 5 }, press: null, pressAt: -1e9, interviewAt: -1e9, debate: null, pressHeld: 0, debatesWon: 0 };
}

const dist = (a: Position, b: Position) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Where an outlet's view of you is heading: how close you are to its lean, and how you're doing. */
export function outletTarget(s: PoliticsState, id: OutletId, approval: number) {
  return clamp(25 - 30 * dist(s.m.platform, OUTLETS[id].lean) + (approval - 50) * 0.3, -100, 100);
}

/** An hour of coverage: outlets drift, and their readers hear about you. */
export function mediaHour(s: PoliticsState, st: Stats) {
  const sh = shares(st);
  const approval = overall(s.approval, sh);
  const m = s.x.media;
  for (const id of OUTLET_IDS) {
    m.rel[id] = clamp(m.rel[id] + (outletTarget(s, id, approval) - m.rel[id]) * 0.02, -100, 100);
    for (const [g, w] of Object.entries(OUTLETS[id].readers)) s.mood[g as Faction] += (w ?? 0) * (m.rel[id] / 100) * 0.06;
  }
}

/** Questions that fit the moment (seeded pick), filled from the always-on ones. */
function pickQuestions(s: PoliticsState, st: Stats, n: number) {
  const r = rollOf(s, 5501);
  const hot = QUESTION_IDS.filter((q) => q !== "housing" && q !== "record" && QUESTIONS[q].when(s, st));
  const out: QuestionId[] = [];
  while (out.length < n && hot.length) out.push(hot.splice(Math.floor(r.next() * hot.length), 1)[0]);
  for (const q of ["housing", "record", "taxes"] as const) if (out.length < n && !out.includes(q)) out.push(q);
  return out.slice(0, n);
}

function apply(s: PoliticsState, ef: Effect, scale = 1) {
  for (const [g, v] of Object.entries(ef.mood)) s.mood[g as Faction] += (v ?? 0) * scale;
  for (const [o, v] of Object.entries(ef.outlets)) s.x.media.rel[o as OutletId] = clamp(s.x.media.rel[o as OutletId] + (v ?? 0), -100, 100);
}

/** Once a day: face the press. */
export function startPress(s: PoliticsState, st: Stats, minutes: number) {
  const m = s.x.media;
  if (m.press || minutes - m.pressAt < 24 * 60) return null;
  m.pressAt = minutes;
  m.press = { qs: pickQuestions(s, st, 3), i: 0, tone: 0 };
  return m.press;
}

/** Answer the question in front of you. Returns true when the conference is over. */
export function answerPress(s: PoliticsState, a: number) {
  const m = s.x.media;
  const p = m.press;
  if (!p) return null;
  const ef = QUESTIONS[p.qs[p.i]].answers[clamp(a, 0, 2)];
  apply(s, ef);
  p.tone += Object.values(ef.outlets).reduce((n, v) => n + (v ?? 0), 0);
  p.i++;
  if (p.i >= p.qs.length) {
    m.press = null;
    m.pressHeld++;
    return { done: true, tone: p.tone };
  }
  return { done: false, tone: p.tone };
}

/** An exclusive with one outlet: it warms to you; its rival doesn't. Once a day. */
export function interview(s: PoliticsState, id: OutletId, minutes: number) {
  const m = s.x.media;
  if (minutes - m.interviewAt < 24 * 60) return false;
  m.interviewAt = minutes;
  m.rel[id] = clamp(m.rel[id] + 15, -100, 100);
  m.rel[OPPOSITE[id]] = clamp(m.rel[OPPOSITE[id]] - 6, -100, 100);
  for (const [g, w] of Object.entries(OUTLETS[id].readers)) s.mood[g as Faction] += (w ?? 0) * 4;
  return true;
}

// ------------------------------------------------------------------ debate

/** How the audience takes an answer: the city's groups, by size. */
function audience(ef: Effect, sh: Moods) {
  let v = 0;
  for (const [g, x] of Object.entries(ef.mood)) v += (x ?? 0) * sh[g as Faction];
  return v;
}

/** The televised debate (once, in the campaign): three questions against the strongest rival. */
export function startDebate(s: PoliticsState, st: Stats) {
  const m = s.x.media;
  if (!s.challenger || s.parl.campaign.debated || m.debate) return null;
  const rival = PARTIES.filter((p) => p !== "civic").reduce((a, b) => (s.parl.seats[b] > s.parl.seats[a] ? b : a), "labour" as PartyId);
  m.debate = { qs: pickQuestions(s, st, 3), i: 0, you: 0, them: 0, rival, log: [] };
  return m.debate;
}

/** Your answer to this round; the rival answers for their base. Returns the result once it's over. */
export function debateAnswer(s: PoliticsState, st: Stats, a: number) {
  const m = s.x.media;
  const d = m.debate;
  if (!d) return null;
  const sh = shares(st);
  const q = QUESTIONS[d.qs[d.i]];
  const base = PARTY_BASE[d.rival as Exclude<PartyId, "civic">];
  // The rival picks what their own voters want to hear.
  let ra = 0;
  let best = -Infinity;
  q.answers.forEach((ef, i) => {
    let v = 0;
    for (const [g, x] of Object.entries(ef.mood)) v += (x ?? 0) * (base[g as Faction] ?? 0);
    if (v > best) {
      best = v;
      ra = i;
    }
  });
  const leader = s.x.opp.leaders[d.rival as Exclude<PartyId, "civic">];
  const mine = audience(q.answers[clamp(a, 0, 2)], sh) * (1 + (overall(s.approval, sh) - 50) / 200) + 0.4;
  const theirs = audience(q.answers[ra], sh) * (0.85 + (leader?.charisma ?? 5) / 30) + 0.4;
  d.you += mine;
  d.them += theirs;
  d.log.push({ q: d.qs[d.i], a, ra, you: mine, them: theirs });
  d.i++;
  if (d.i < d.qs.length) return { done: false as const };
  const won = d.you >= d.them;
  for (const g of Object.keys(s.mood) as Faction[]) s.mood[g] += won ? 4 : -2;
  s.parl.campaign.debated = true;
  if (won) m.debatesWon++;
  m.debate = null;
  return { done: true as const, won, you: d.you, them: d.them, rival: d.rival };
}
