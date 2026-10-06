/**
 * Your political legacy (Statecraft, 1.0): a record of everything you've done in office,
 * achievements worth legacy points, and the title they add up to.
 */
import { CHAMBER, MAJORITY, MINISTRIES, type PoliticsState } from "./politics";
import { HQ } from "./mandate";
import { LOBBY_IDS } from "./lobbies";

export const RECORD_KEYS = ["lawsPassed", "lawsRepealed", "referendaWon", "electionsWon", "ncSurvived", "crisesResolved", "pressHeld", "debatesWon", "budgetsPassed", "decreesIssued", "oppDefeated", "challengesSurvived", "leadDays", "daysInOffice"] as const;
export type RecordKey = (typeof RECORD_KEYS)[number];

export interface LegacyState {
  rec: Record<RecordKey, number>;
  /** Highest overall approval reached. */
  peak: number;
  unlocked: string[];
  /** Last day counted (for days in office and days leading the polls). */
  lastDay: number;
}

export function newLegacy(): LegacyState {
  const rec = {} as Record<RecordKey, number>;
  for (const k of RECORD_KEYS) rec[k] = 0;
  return { rec, peak: 0, unlocked: [], lastDay: -1 };
}

type Check = (s: PoliticsState, r: Record<RecordKey, number>) => boolean;
/** Each achievement: legacy points, and when it's earned. */
export const ACHIEVEMENTS: Record<string, { points: number; when: Check }> = {
  firstLaw: { points: 5, when: (_, r) => r.lawsPassed >= 1 },
  lawmaker: { points: 15, when: (_, r) => r.lawsPassed >= 10 },
  legislator: { points: 30, when: (_, r) => r.lawsPassed >= 25 },
  peoplesVoice: { points: 15, when: (_, r) => r.referendaWon >= 1 },
  secondTerm: { points: 20, when: (_, r) => r.electionsWon >= 1 },
  dynasty: { points: 40, when: (_, r) => r.electionsWon >= 3 },
  survivor: { points: 20, when: (_, r) => r.ncSurvived >= 1 },
  crisisManager: { points: 20, when: (_, r) => r.crisesResolved >= 3 },
  pressPro: { points: 10, when: (_, r) => r.pressHeld >= 5 },
  debater: { points: 15, when: (_, r) => r.debatesWon >= 1 },
  steadyHand: { points: 20, when: (_, r) => r.budgetsPassed >= 3 },
  strongman: { points: 10, when: (_, r) => r.decreesIssued >= 5 },
  gatekeeper: { points: 15, when: (_, r) => r.oppDefeated >= 5 },
  unbroken: { points: 20, when: (_, r) => r.challengesSurvived >= 1 },
  frontRunner: { points: 15, when: (_, r) => r.leadDays >= 7 },
  veteran: { points: 25, when: (_, r) => r.daysInOffice >= 20 },
  majority: { points: 15, when: (s) => s.parl.seats.civic >= MAJORITY },
  landslide: { points: 35, when: (s) => s.parl.seats.civic >= Math.ceil(CHAMBER * 0.75) },
  bigTent: { points: 15, when: (s) => s.parl.coalition.length >= 2 },
  fullCabinet: { points: 10, when: (s) => MINISTRIES.every((m) => !!s.parl.ministers[m]) },
  friendsEverywhere: { points: 20, when: (s) => LOBBY_IDS.every((id) => s.x.lobbies.rec[id].relation >= 30) },
  machine: { points: 25, when: (s) => HQ.every((h) => s.m.hq[h] >= 3) },
  beloved: { points: 20, when: (s) => s.x.legacy.peak >= 75 },
};
export const ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENTS);

/** Titles by legacy points. */
export const TITLES = [
  { id: "rookie", at: 0 },
  { id: "wardBoss", at: 40 },
  { id: "cityLeader", at: 100 },
  { id: "heavyweight", at: 180 },
  { id: "statesman", at: 280 },
  { id: "legend", at: 400 },
] as const;

export const points = (l: LegacyState) => l.unlocked.reduce((n, id) => n + (ACHIEVEMENTS[id]?.points ?? 0), 0);
export const title = (l: LegacyState) => [...TITLES].reverse().find((x) => points(l) >= x.at)!.id;
export const nextTitle = (l: LegacyState) => TITLES.find((x) => x.at > points(l)) ?? null;

export function bump(s: PoliticsState, k: RecordKey, n = 1) {
  s.x.legacy.rec[k] += n;
}

/** Count the day, note the peak, and hand out whatever's been earned. Returns the new ones. */
export function legacyCheck(s: PoliticsState, minutes: number, approval: number, leading: boolean): string[] {
  const l = s.x.legacy;
  const day = Math.floor(minutes / 1440);
  if (day > l.lastDay && s.status === "office") {
    if (l.lastDay >= 0) {
      l.rec.daysInOffice += day - l.lastDay;
      if (leading) l.rec.leadDays += 1;
    }
    l.lastDay = day;
  }
  l.peak = Math.max(l.peak, Math.round(approval));
  const fresh: string[] = [];
  for (const id of ACHIEVEMENT_IDS) {
    if (l.unlocked.includes(id)) continue;
    if (ACHIEVEMENTS[id].when(s, l.rec)) {
      l.unlocked = [...l.unlocked, id];
      fresh.push(id);
    }
  }
  return fresh;
}
