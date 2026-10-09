/**
 * The shape of a career: difficulty and sandbox play, skipping ahead to the next thing that
 * needs you, the career timeline, and the legacy you leave.
 *
 * Works on sim.ts's state; nothing at the top level uses another module's values.
 */
import { WEEKS } from "./data";
import * as C from "./campaign";
import * as G from "./sim";

export type Difficulty = "easy" | "normal" | "hard";
export interface Mode {
  difficulty: Difficulty;
  /** No twenty-year limit and no leadership challenges. */
  sandbox: boolean;
}
export const DIFFICULTIES: { id: Difficulty; name: string; about: string }[] = [
  { id: "easy", name: "Easy", about: "Rivals campaign less; your events do more; a patient party." },
  { id: "normal", name: "Normal", about: "The game as designed." },
  { id: "hard", name: "Hard", about: "Rivals campaign harder, crises come faster, the party is quick to turn." },
];

const mode = (s: G.GameState): Mode => s.mode ?? { difficulty: "normal", sandbox: false };
/** How hard AI parties campaign. */
export const aiStrength = (s: G.GameState) => ({ easy: 0.7, normal: 1, hard: 1.3 })[mode(s).difficulty];
/** How much more (or less) your events do. */
export const playerEdge = (s: G.GameState) => ({ easy: 1.2, normal: 1, hard: 0.9 })[mode(s).difficulty];
/** Weeks of low unity before a challenge (never in a sandbox). */
export const challengeAfter = (s: G.GameState) => (mode(s).sandbox ? Infinity : { easy: 12, normal: 8, hard: 6 }[mode(s).difficulty]);
/** Weeks between crises: a fixed part and a random part. */
export const crisisGap = (s: G.GameState): [number, number] => ({ easy: [12, 12] as [number, number], normal: [9, 10] as [number, number], hard: [7, 8] as [number, number] })[mode(s).difficulty];
export const startFunds = (d: Difficulty) => ({ easy: 30, normal: 0, hard: -20 })[d];
export const endless = (s: G.GameState) => mode(s).sandbox;

// ------------------------------------------------------------------ skipping ahead

/** What needs the player now (or null when the week can be skipped). */
export function needsYou(s: G.GameState): string | null {
  if (s.over) return "Your career is over";
  if (s.election) return "Election night";
  if (s.talks) return "Coalition talks";
  if (s.challenge) return "A leadership challenge";
  if (s.crisis) return "A crisis";
  if (s.scandal && s.scandal.week < s.week) return "A scandal";
  if (s.debate && s.debate.week < s.week) return "A TV debate";
  if (s.qt && s.qt.week < s.week) return C.qtName(s);
  if (s.conference) return "The party conference";
  if (s.court?.nominees && s.gov.head === s.you) return "A court vacancy";
  if (C.budgetDue(s)) return "The budget";
  if (s.bills.some((b) => b.stage !== "passed" && b.stage !== "failed" && b.voteAt <= s.week && G.youVoteOn(s, b) && b.yourVote === null)) return "A vote";
  return null;
}

// ------------------------------------------------------------------ the timeline

export interface Moment {
  w: number;
  icon: string;
  text: string;
}

/** Note a moment in the career. */
export function mark(s: G.GameState, icon: string, text: string) {
  s.timeline ??= [];
  if (s.timeline.some((m) => m.w === s.week && m.text === text)) return;
  s.timeline.push({ w: s.week, icon, text });
  if (s.timeline.length > 120) s.timeline.splice(0, s.timeline.length - 120);
}

/** Weekly: time in power (for the legacy). */
export function careerWeek(s: G.GameState) {
  if (s.gov.head === s.you) C.note(s, "weeksInPower");
  if (G.inGovernment(s)) C.note(s, "weeksInGov");
}

// ------------------------------------------------------------------ the legacy

export interface Legacy {
  title: string;
  /** 0–100. */
  rating: number;
  lines: string[];
}

export function legacy(s: G.GameState): Legacy {
  const n = s.counters ?? {};
  const years = Math.max(0, Math.floor((s.week - 1) / WEEKS));
  const power = n.weeksInPower ?? 0;
  const t = G.titles(s);
  const title = s.ousted
    ? "Brought down by their own party"
    : s.electionsWon >= 4 && power >= WEEKS * 8
      ? "A dominant force"
      : s.lawsPassed >= 15
        ? "The great reformer"
        : power >= WEEKS * 5
          ? `A long-serving ${t.head}`
          : s.electionsWon >= 2
            ? "The election winner"
            : (n.crisesDecided ?? 0) >= 5
              ? "A steady hand in a storm"
              : s.lawsPassed >= 5
                ? "A reformer"
                : power > 0
                  ? `A ${t.head} for a while`
                  : (n.weeksInGov ?? 0) > 0
                    ? "A partner in power"
                    : "The voice of the opposition";
  const rating = Math.max(1, Math.min(100, Math.round(s.score / 150)));
  const lines = [
    `${years} year${years === 1 ? "" : "s"} in politics`,
    power ? `${(power / WEEKS).toFixed(1)} years as ${t.head}` : "",
    `${s.lawsPassed} law${s.lawsPassed === 1 ? "" : "s"} passed, ${s.electionsWon} election${s.electionsWon === 1 ? "" : "s"} won`,
    `${Object.keys(s.achievements ?? {}).length} achievements`,
  ].filter(Boolean);
  return { title, rating, lines };
}

/** One career in the hall of fame. */
export interface HallEntry {
  name: string;
  party: string;
  color: string;
  country: string;
  flag?: string;
  score: number;
  years: number;
  title: string;
  date: string;
}

export function hallEntry(s: G.GameState): HallEntry {
  const you = G.pol(s, s.you);
  const p = G.party(s, s.party);
  return { name: you ? G.fullName(you) : "You", party: p.short, color: p.color, country: s.sc.name, flag: s.sc.flag, score: s.score, years: Math.max(0, Math.floor((s.week - 1) / WEEKS)), title: legacy(s).title, date: new Date().toISOString().slice(0, 10) };
}

/** Add a career to the hall of fame (best ten kept). Returns the new list and the entry's place (or -1). */
export function addToHall(list: HallEntry[], e: HallEntry) {
  const next = [...list, e].sort((a, b) => b.score - a.score).slice(0, 10);
  return { list: next, place: next.indexOf(e) };
}
