import { createRng } from "../engine/rng";
import { clubById, LEAGUES, type LeagueId } from "./clubs";

/**
 * A season in any league: home-and-away rounds from repeated round robins
 * (7 to 23 rounds), a ladder (four points a win, two a draw, then percentage),
 * and finals: a final four (semis, then the Grand Final) or the final eight
 * (qualifying and elimination finals, semis, preliminary finals, the Grand
 * Final, with the top four getting the double chance). You play (or sim) your
 * club's games; the rest of each round is simulated from club form. Pure
 * data, saved to the device.
 */

export interface Fixture {
  round: number;
  home: string;
  away: string;
  /** Points for each side once played. */
  result?: [number, number];
  /** Finals: QF1, EF2, SF1, PF2, GF... */
  key?: string;
}

export type Stage = "home" | "finals" | "done";

export interface Season {
  v: 2;
  seed: number;
  league: LeagueId;
  clubs: string[];
  club: string;
  rounds: number;
  /** The next home-and-away round (0-based). */
  round: number;
  fixtures: Fixture[];
  stage: Stage;
  finals: Fixture[];
  /** Finals week (0-based). */
  week: number;
  premier?: string;
  /** Your club's players' 3-2-1 votes over the season. */
  votes: Record<string, number>;
}

export interface LadderRow {
  id: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  for: number;
  against: number;
  points: number;
  pct: number;
}

/** Round robins (circle method), repeated with home and away swapped, to `rounds` rounds. */
export function draw(ids: string[], seed: number, rounds = ids.length - 1): Fixture[] {
  const rng = createRng(seed);
  const list = [...ids];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  if (list.length % 2) list.push("bye");
  const n = list.length;
  const out: Fixture[] = [];
  const rot = list.slice(1);
  for (let r = 0; r < rounds; r++) {
    const cycle = Math.floor(r / (n - 1));
    if (r % (n - 1) === 0 && cycle > 0) {
      // A new round robin: shuffle the rotation so the second meeting comes at a different time.
      for (let i = rot.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [rot[i], rot[j]] = [rot[j], rot[i]];
      }
    }
    const ring = [list[0], ...rot];
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i];
      const b = ring[n - 1 - i];
      if (a === "bye" || b === "bye") continue;
      const flip = ((r + i) % 2 === 1) !== (cycle % 2 === 1);
      out.push(flip ? { round: r, home: a, away: b } : { round: r, home: b, away: a });
    }
    rot.unshift(rot.pop()!);
  }
  return out;
}

export function newSeason(o: { league: LeagueId; club: string; seed: number; rounds?: number }): Season {
  const lg = LEAGUES[o.league];
  const clubs = lg.clubs.map((c) => c.id);
  const rounds = Math.max(1, Math.min(o.rounds ?? lg.rounds, 30));
  return { v: 2, seed: o.seed, league: o.league, clubs, club: o.club, rounds, round: 0, fixtures: draw(clubs, o.seed, rounds), stage: "home", finals: [], week: 0, votes: {} };
}

/** Each club's form this season (deterministic per season). */
export function strength(s: Season, id: string) {
  const r = createRng((s.seed ^ (id.charCodeAt(0) * 7919 + id.charCodeAt(id.length - 1) * 104729 + id.length * 31)) >>> 0);
  return 0.84 + r.next() * 0.32;
}

/** A simulated game's score in points: goals and behinds from each side's form. */
export function simulateGame(s: Season, f: Fixture, salt: number): [number, number] {
  const h = (f.home + f.away).split("").reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rng = createRng((s.seed * 31 + salt * 1009 + f.round * 97 + h) >>> 0);
  const g = (k: number) => {
    const goals = Math.max(3, Math.round(11.5 * k + (rng.next() + rng.next() + rng.next() - 1.5) * 5));
    const behinds = Math.max(2, Math.round(9 * k + (rng.next() - 0.5) * 8));
    return goals * 6 + behinds;
  };
  return [g(strength(s, f.home) * 1.04), g(strength(s, f.away))];
}

export function ladder(s: Season): LadderRow[] {
  const rows = new Map<string, LadderRow>(s.clubs.map((id) => [id, { id, played: 0, won: 0, lost: 0, drawn: 0, for: 0, against: 0, points: 0, pct: 0 }]));
  for (const f of s.fixtures) {
    if (!f.result) continue;
    const [h, a] = f.result;
    const H = rows.get(f.home)!;
    const A = rows.get(f.away)!;
    H.played++;
    A.played++;
    H.for += h;
    H.against += a;
    A.for += a;
    A.against += h;
    if (h > a) {
      H.won++;
      A.lost++;
      H.points += 4;
    } else if (a > h) {
      A.won++;
      H.lost++;
      A.points += 4;
    } else {
      H.drawn++;
      A.drawn++;
      H.points += 2;
      A.points += 2;
    }
  }
  const out = [...rows.values()];
  for (const r of out) r.pct = r.against ? Math.round((r.for / r.against) * 1000) / 10 : 0;
  return out.sort((x, y) => y.points - x.points || y.pct - x.pct || x.id.localeCompare(y.id));
}

const FINAL_NAMES: Record<string, string> = {
  QF: "Qualifying final",
  EF: "Elimination final",
  SF: "Semi-final",
  PF: "Preliminary final",
  GF: "Grand Final",
};
export const finalName = (key: string) => FINAL_NAMES[key.slice(0, 2)] ?? "Final";

/** How many teams make the finals. */
export const finalsSpots = (s: Season) => (LEAGUES[s.league].finals === "top8" ? 8 : 4);

/** Your next game: the fixture, the opponent and what it's called. */
export function nextGame(s: Season): { fixture: Fixture; opponent: string; label: string } | null {
  if (s.stage === "done") return null;
  const mine = (f: Fixture) => f.home === s.club || f.away === s.club;
  let f: Fixture | undefined;
  let label = "";
  if (s.stage === "home") {
    f = s.fixtures.find((x) => x.round === s.round && mine(x));
    label = `Round ${s.round + 1}`;
  } else {
    f = s.finals.find((x) => !x.result && mine(x));
    label = f?.key ? finalName(f.key) : "Final";
  }
  if (!f) return null;
  return { fixture: f, opponent: f.home === s.club ? f.away : f.home, label };
}

/** A final's winner (a draw goes to the higher-placed club). */
function winner(f: Fixture, order: string[]) {
  const [h, a] = f.result!;
  if (h !== a) return h > a ? f.home : f.away;
  return order.indexOf(f.home) < order.indexOf(f.away) ? f.home : f.away;
}
const loser = (f: Fixture, order: string[]) => (winner(f, order) === f.home ? f.away : f.home);

/** The next week of finals from the last one's results. */
function nextFinals(s: Season, order: string[]): Fixture[] | null {
  const by = (k: string) => s.finals.find((f) => f.key === k)!;
  const fx = (key: string, a: string, b: string): Fixture => {
    // The higher-placed club is at home.
    const [home, away] = order.indexOf(a) <= order.indexOf(b) ? [a, b] : [b, a];
    return { round: s.rounds + s.week, home, away, key };
  };
  if (LEAGUES[s.league].finals === "top4") {
    if (s.week === 1) return [fx("GF", winner(by("SF1"), order), winner(by("SF2"), order))];
    return null;
  }
  if (s.week === 1)
    return [fx("SF1", loser(by("QF1"), order), winner(by("EF1"), order)), fx("SF2", loser(by("QF2"), order), winner(by("EF2"), order))];
  if (s.week === 2) return [fx("PF1", winner(by("QF1"), order), winner(by("SF2"), order)), fx("PF2", winner(by("QF2"), order), winner(by("SF1"), order))];
  if (s.week === 3) return [fx("GF", winner(by("PF1"), order), winner(by("PF2"), order))];
  return null;
}

/** Simulate everything still to play until your next game (or the end of the season). */
function advance(s: Season) {
  for (let guard = 0; guard < 200; guard++) {
    if (s.stage === "home") {
      const round = s.fixtures.filter((f) => f.round === s.round);
      if (round.some((f) => !f.result && (f.home === s.club || f.away === s.club))) return;
      for (const f of round) if (!f.result) f.result = simulateGame(s, f, 1);
      s.round++;
      if (s.round >= s.rounds) {
        const top = ladder(s).map((r) => r.id);
        const fx = (key: string, a: number, b: number): Fixture => ({ round: s.rounds, home: top[a], away: top[b], key });
        s.finals = LEAGUES[s.league].finals === "top8" ? [fx("QF1", 0, 3), fx("QF2", 1, 2), fx("EF1", 4, 7), fx("EF2", 5, 6)] : [fx("SF1", 0, 3), fx("SF2", 1, 2)];
        s.stage = "finals";
        s.week = 0;
      }
      continue;
    }
    if (s.stage === "finals") {
      const open = s.finals.filter((f) => !f.result);
      if (open.some((f) => f.home === s.club || f.away === s.club)) return;
      for (const f of open) f.result = simulateGame(s, f, 7 + s.week);
      const order = ladder(s).map((r) => r.id);
      s.week++;
      const gf = s.finals.find((f) => f.key === "GF" && f.result);
      if (gf) {
        s.premier = winner(gf, order);
        s.stage = "done";
        return;
      }
      const next = nextFinals(s, order);
      if (next) s.finals.push(...next);
      continue;
    }
    return;
  }
}

/** Record your game's result (points for you, points against) and move the season on. */
export function recordResult(s: Season, us: number, them: number, votes: Record<string, number> = {}) {
  const g = nextGame(s);
  if (!g) return s;
  const f = g.fixture;
  f.result = f.home === s.club ? [us, them] : [them, us];
  for (const [name, v] of Object.entries(votes)) s.votes[name] = (s.votes[name] ?? 0) + v;
  advance(s);
  return s;
}

/** Simulate your next game instead of playing it: the score, [us, them]. `form` nudges your side (career). */
export function simulateMine(s: Season, form = 1): [number, number] {
  const g = nextGame(s);
  if (!g) return [0, 0];
  const f = g.fixture;
  const salt = 3 + s.round * 13 + s.week * 101;
  const [h, a] = simulateGame(s, f, salt);
  const homeIsUs = f.home === s.club;
  const us = Math.round((homeIsUs ? h : a) * form);
  return [us, homeIsUs ? a : h];
}

/** Start a season and play out anything before your first game. */
export function startSeason(o: { league: LeagueId; club: string; seed: number; rounds?: number }) {
  const s = newSeason(o);
  advance(s);
  return s;
}

/** A saved season, if it's in the current format. */
export function parseSeason(raw: unknown): Season | null {
  const s = raw as Season | null;
  return s && s.v === 2 && Array.isArray(s.fixtures) && Array.isArray(s.clubs) ? s : null;
}

export const clubName = (id: string) => clubById(id).name;

/** Did you win the flag? */
export const premiers = (s: Season) => s.stage === "done" && s.premier === s.club;

/** Where your club finished: "Premiers", "Runners-up", "Preliminary finalist", ..., or the ladder position. */
export function finish(s: Season): string {
  if (s.premier === s.club) return "Premiers";
  const mine = s.finals.filter((f) => f.home === s.club || f.away === s.club);
  if (mine.length) {
    const last = mine[mine.length - 1];
    if (last.key === "GF") return "Runners-up";
    return `${finalName(last.key ?? "")}ist`.replace("Grand Finalist", "Runners-up");
  }
  const pos = ladder(s).findIndex((r) => r.id === s.club) + 1;
  return `${pos}${ordinal(pos)} on the ladder`;
}

export const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th"));
