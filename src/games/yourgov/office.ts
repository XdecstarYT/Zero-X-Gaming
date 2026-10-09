/**
 * Running the government: a priority for the whole government, the State of the Nation address
 * once a year, an honours list, public inquiries, emergency powers, civil service reform, a
 * one-tap reshuffle, and a confidence vote you can call in your own leadership.
 *
 * Works on sim.ts's state and seeded stream; nothing at the top level uses another module's
 * values (sim.ts imports this file and this file imports sim.ts).
 */
import * as C from "./campaign";
import * as K from "./career";
import * as P from "./politics";
import * as S from "./society";
import * as St from "./studio";
import * as G from "./sim";

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export type Priority = "none" | "economy" | "services" | "security" | "environment" | "reform";
export const PRIORITIES: { id: Priority; name: string; icon: string; about: string }[] = [
  { id: "none", name: "No single priority", icon: "⚪", about: "Every department for itself." },
  { id: "economy", name: "The economy", icon: "📈", about: "Growth +0.08 a year; economy policies cost a fifth less." },
  { id: "services", name: "Public services", icon: "🏥", about: "Happiness +0.4; schools and hospitals improve." },
  { id: "security", name: "Law and order", icon: "🚔", about: "Crime falls; crime policies cost a fifth less." },
  { id: "environment", name: "The environment", icon: "🌿", about: "The environment improves; green policies cost a fifth less." },
  { id: "reform", name: "Clean up politics", icon: "🧹", about: "Trust in politics rises; the budget saves a little." },
];
export const PRIORITY_GAP = 13;
export const SOTN_WEEK = 5;
export const INQUIRY_WEEKS = 16;
export const EMERGENCY_WEEKS = 8;
export const EMERGENCY_GAP = 52;
export const REFORM_GAP = 4 * 52;

export type InquiryTopic = "predecessor" | "crisis" | "lobbying";
export const INQUIRIES: { id: InquiryTopic; name: string; about: string }[] = [
  { id: "predecessor", name: "The last government's record", about: "Could hurt the opposition. Could backfire." },
  { id: "crisis", name: "How the last crisis was handled", about: "Lessons learned, or blame for ministers." },
  { id: "lobbying", name: "Lobbying and donations", about: "Good for trust, unless your own donors are named." },
];
export type HonoursKind = "donors" | "heroes" | "loyalists";
export const HONOURS: { id: HonoursKind; name: string; icon: string; about: string }[] = [
  { id: "donors", name: "Generous donors", icon: "💰", about: "Funds +6M. One in five times, a cash-for-honours row." },
  { id: "heroes", name: "Everyday heroes", icon: "🦸", about: "Nurses, firefighters, volunteers. Approval +2." },
  { id: "loyalists", name: "Party loyalists", icon: "🎖️", about: "Unity +8, every wing pleased." },
];

export interface Office {
  priority: Priority;
  priorityAt: number;
  /** The State of the Nation address is due (the week it fell due), or null. */
  sotn: number | null;
  sotnYear: number;
  honoursYear: number;
  inquiry: { topic: InquiryTopic; due: number } | null;
  /** Emergency powers last up to this week. */
  emergency: number;
  emergencyAt: number;
  reformAt: number;
  confidenceAt: number;
}

export function initOffice(s: G.GameState) {
  s.ox ??= { priority: "none", priorityAt: -PRIORITY_GAP, sotn: null, sotnYear: -1, honoursYear: -1, inquiry: null, emergency: -1, emergencyAt: -EMERGENCY_GAP, reformAt: -REFORM_GAP, confidenceAt: -26 };
}

const head = (s: G.GameState) => s.gov.head === s.you;
const notHead = (s: G.GameState) => `Only the ${G.titles(s).head} can do that.`;

/** What the government's choices do to the economy (folded into sim.ts's economy). */
export function officeFx(s: G.GameState) {
  const o = s.ox;
  if (!o || !head(s)) return { growth: 0, happiness: 0, budget: 0 };
  const reformed = o.reformAt >= 0 && s.week - o.reformAt >= 26 && s.week - o.reformAt < REFORM_GAP + 26;
  return {
    growth: o.priority === "economy" ? 0.08 : 0,
    happiness: o.priority === "services" ? 0.4 : 0,
    budget: (o.priority === "reform" ? 1 : 0) + (reformed ? 3 : 0),
  };
}

export const emergencyOn = (s: G.GameState) => (s.ox?.emergency ?? -1) >= s.week;

export function setPriority(s: G.GameState, p: Priority): string | null {
  if (!head(s)) return notHead(s);
  if (!PRIORITIES.some((x) => x.id === p)) return "Unknown priority.";
  if (s.ox.priority === p) return "That's the priority already.";
  if (s.week - s.ox.priorityAt < PRIORITY_GAP) return `The government can change course again in ${PRIORITY_GAP - (s.week - s.ox.priorityAt)} weeks.`;
  s.ox.priority = p;
  s.ox.priorityAt = s.week;
  G.news(s, "government", p === "none" ? "The government drops its single priority" : `The government's new priority: ${PRIORITIES.find((x) => x.id === p)!.name.toLowerCase()}`, 0);
  return null;
}

/** Give the State of the Nation address (a speech you write). */
export function giveSotn(s: G.GameState, d: St.SpeechDraft) {
  if (s.ox.sotn === null) return null;
  s.ox.sotn = null;
  s.ox.sotnYear = G.yearOf(s);
  const r = St.speechScore(s, d);
  s.stats.approval = clamp(s.stats.approval + r.points, 5, 95);
  S.improve(s, "trust", Math.max(0, r.points));
  C.note(s, "sotn");
  K.mark(s, "📜", `Gave the State of the Nation address`);
  G.news(s, "government", `State of the Nation: "${r.quote}" (${r.points >= 2 ? "a triumph" : r.points >= 0.5 ? "well received" : r.points >= -0.5 ? "mixed reviews" : "it falls flat"})`, r.points >= 0.5 ? 1 : r.points < -0.5 ? -1 : 0);
  return r;
}

export function honours(s: G.GameState, kind: HonoursKind): string | null {
  if (!head(s)) return notHead(s);
  if (s.ox.honoursYear === G.yearOf(s)) return "One honours list a year.";
  s.ox.honoursYear = G.yearOf(s);
  const ps = s.parties[s.party];
  if (kind === "donors") {
    ps.funds += 6;
    if (G.roll(s).next() < 0.2) {
      s.stats.approval = clamp(s.stats.approval - 3, 5, 95);
      S.shift(s, "trust", -4);
      P.pressEvent(s, -5);
      G.news(s, "scandal", "Cash for honours? Big donors top the honours list", -1);
      return null;
    }
  } else if (kind === "heroes") {
    s.stats.approval = clamp(s.stats.approval + 2, 5, 95);
    s.boosts.happiness += 0.3;
  } else {
    ps.unity = clamp(ps.unity + 8, 0, 100);
    for (const f of s.factions) f.mood = clamp(f.mood + 3, 0, 100);
  }
  G.news(s, "government", `The honours list: ${HONOURS.find((x) => x.id === kind)!.name.toLowerCase()} are recognised`, 1);
  return null;
}

export function startInquiry(s: G.GameState, topic: InquiryTopic): string | null {
  if (!head(s)) return notHead(s);
  if (s.ox.inquiry) return "An inquiry is already sitting.";
  if (!INQUIRIES.some((x) => x.id === topic)) return "Unknown inquiry.";
  s.ox.inquiry = { topic, due: s.week + INQUIRY_WEEKS };
  s.stats.debt += 1 * (s.sc.economy.gdp / 18);
  G.news(s, "government", `A public inquiry opens into ${INQUIRIES.find((x) => x.id === topic)!.name.toLowerCase()}`, 0);
  return null;
}

function inquiryReport(s: G.GameState) {
  const q = s.ox.inquiry!;
  s.ox.inquiry = null;
  const r = G.roll(s).next();
  const name = INQUIRIES.find((x) => x.id === q.topic)!.name.toLowerCase();
  const rival = G.running(s).filter((p) => !s.gov.parties.includes(p) && !G.party(s, p).others).sort((a, b) => (G.houseBy(s)[b] ?? 0) - (G.houseBy(s)[a] ?? 0))[0];
  if (q.topic === "predecessor") {
    if (r < 0.55 && rival) {
      s.parties[rival].swing -= 0.03;
      s.stats.approval = clamp(s.stats.approval + 1, 5, 95);
      G.news(s, "government", `The inquiry into ${name} is damning for the ${G.party(s, rival).short}`, 1);
    } else if (r < 0.85) G.news(s, "government", `The inquiry into ${name} reports: nothing new`, 0);
    else {
      s.stats.approval = clamp(s.stats.approval - 2, 5, 95);
      G.news(s, "government", `The inquiry into ${name} backfires: it praises the last government`, -1);
    }
  } else if (q.topic === "crisis") {
    if (r < 0.5) {
      S.improve(s, "trust", 4);
      G.news(s, "government", `The inquiry into ${name}: lessons learned, trust restored`, 1);
    } else if (r < 0.8) {
      s.stats.approval = clamp(s.stats.approval - 2, 5, 95);
      G.news(s, "government", `The inquiry into ${name} blames ministers`, -1);
    } else {
      s.stats.approval = clamp(s.stats.approval + 2, 5, 95);
      G.news(s, "government", `The inquiry into ${name} praises the government's response`, 1);
    }
  } else if (r < 0.6) {
    S.improve(s, "trust", 5);
    G.news(s, "government", `The lobbying inquiry exposes cosy deals; trust in politics rises`, 1);
  } else if (r < 0.85) {
    s.parties[s.party].swing -= 0.01;
    G.news(s, "scandal", `The lobbying inquiry names some of your own party's donors`, -1);
  } else G.news(s, "government", `The lobbying inquiry reports: nothing much to see`, 0);
}

/** Emergency powers, during a crisis or a protest. */
export function declareEmergency(s: G.GameState): string | null {
  if (!head(s)) return notHead(s);
  if (emergencyOn(s)) return "Emergency powers are already in force.";
  if (!s.crisis && !(s.soc?.protests.length ?? 0)) return "There's no emergency to use them on.";
  if (s.week - s.ox.emergencyAt < EMERGENCY_GAP) return `Not again so soon: in ${EMERGENCY_GAP - (s.week - s.ox.emergencyAt)} weeks.`;
  s.ox.emergency = s.week + EMERGENCY_WEEKS;
  s.ox.emergencyAt = s.week;
  S.shift(s, "trust", -6);
  for (const p of s.soc?.protests ?? []) p.size = clamp(p.size - 30, 0, 100);
  if (s.soc) s.soc.protests = s.soc.protests.filter((p) => p.size > 0);
  s.stats.approval = clamp(s.stats.approval + 1, 5, 95);
  G.news(s, "government", `The ${G.titles(s).head} declares a state of emergency`, 0);
  return null;
}

export function civilServiceReform(s: G.GameState): string | null {
  if (!head(s)) return notHead(s);
  if (s.ox.reformAt >= 0 && s.week - s.ox.reformAt < REFORM_GAP) return "The civil service is still digesting the last reform.";
  s.ox.reformAt = s.week;
  s.stats.approval = clamp(s.stats.approval - 1, 5, 95);
  P.courtGroup(s, "workers", -2);
  G.news(s, "government", "A shake-up of the civil service: savings in six months, grumbling now", 0);
  return null;
}

/** Put the most able minister in every post. */
export function reshuffle(s: G.GameState): string | null {
  if (!head(s)) return notHead(s);
  const pool = P.candidates(s).sort((a, b) => P.skill(b) - P.skill(a));
  if (!pool.length) return "No one to appoint.";
  const used = new Set<number>();
  let changed = 0;
  for (const pf of P.PORTFOLIOS) {
    const p = pool.find((x) => !used.has(x.id));
    if (!p) break;
    used.add(p.id);
    if (s.cabinet[pf.id] !== p.id) changed++;
  }
  if (!changed) return "Your best team is already in place.";
  s.cabinet = {};
  used.clear();
  for (const pf of P.PORTFOLIOS) {
    const p = pool.find((x) => !used.has(x.id));
    if (!p) break;
    used.add(p.id);
    s.cabinet[pf.id] = p.id;
  }
  G.news(s, "government", `A big reshuffle: ${changed} new faces around the cabinet table`, 0);
  return null;
}

/** Call a confidence vote in your own leadership: win it and the rebels are silenced. */
export function confidenceVote(s: G.GameState): { won: boolean; support: number } | string {
  if (s.challenge) return "There's already a challenge.";
  if (s.week - s.ox.confidenceAt < 26) return "Not again so soon.";
  s.ox.confidenceAt = s.week;
  const support = clamp(P.leadershipSupport(s) + 0.04 + (G.roll(s).next() - 0.5) * 0.1, 0, 1);
  const ps = s.parties[s.party];
  if (support >= 0.5) {
    ps.unity = clamp(ps.unity + 12, 0, 100);
    s.lowUnity = 0;
    for (const f of s.factions) f.mood = clamp(f.mood + 4, 0, 100);
    K.mark(s, "🗳️", `Won a confidence vote in the party`);
    G.news(s, "party", `${G.fullName(G.pol(s, s.you)!)} wins a confidence vote with ${Math.round(support * 100)}% of the party`, 1);
    return { won: true, support };
  }
  s.ousted = true;
  s.over = true;
  K.mark(s, "👋", "Lost a confidence vote");
  G.news(s, "party", `${G.fullName(G.pol(s, s.you)!)} loses a confidence vote and is out as ${G.titles(s).leader.toLowerCase()}`, -1);
  return { won: false, support };
}

/** The government's week. */
export function officeWeek(s: G.GameState) {
  initOffice(s);
  const o = s.ox;
  if (head(s) && G.weekOf(s.week) === SOTN_WEEK && o.sotnYear !== G.yearOf(s) && o.sotn === null) o.sotn = s.week;
  if (!head(s)) o.sotn = null;
  if (o.inquiry && s.week >= o.inquiry.due) inquiryReport(s);
  // Emergency powers may be struck down by the courts.
  if (emergencyOn(s) && G.roll(s).next() < 0.04) {
    o.emergency = -1;
    s.stats.approval = clamp(s.stats.approval - 3, 5, 95);
    G.news(s, "government", "The courts strike down the emergency powers", -1);
  }
}

/** Anything left unanswered at the end of the week. */
export function settleOffice(s: G.GameState) {
  if (s.ox?.sotn !== null && s.ox?.sotn !== undefined && s.week > s.ox.sotn) giveSotn(s, St.defaultSpeech());
}
