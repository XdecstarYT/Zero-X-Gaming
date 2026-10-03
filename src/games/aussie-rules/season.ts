import { createRng } from "../engine/rng";
import { clubById, LEAGUES, type LeagueId } from "./clubs";
import { GOAL_WEIGHT, rosterFor, VOTE_WEIGHT } from "./rosters";

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
  /** The women's competition. */
  women?: boolean;
  /** League-wide, home and away: 3-2-1 votes and goals, by "club:surname". */
  medal?: Record<string, number>;
  goals?: Record<string, number>;
  /** The medal votes round by round (for awards night's live count). */
  medalRounds?: Record<string, number>[];
  /** The year on the calendar (premiership dynasties carry on year to year). */
  year?: number;
  /** Clubs' form drifts through the season (winning streaks, slumps). */
  momentum?: boolean;
  drift?: Record<string, number>;
  /** Past seasons in this premiership, oldest first. */
  honours?: Honour[];
}

/** One season on the honour board. */
export interface Honour {
  year: number;
  premier: string;
  runnerUp: string;
  /** Grand Final score, winner first. */
  score: [number, number];
  minor: string;
  medal?: { key: string; n: number };
  coleman?: { key: string; n: number };
  /** Where your club finished. */
  ours: string;
}

/** Votes and goals from a game you played: by "club:surname". */
export interface Awards {
  votes: Record<string, number>;
  goals: Record<string, number>;
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

export function newSeason(o: { league: LeagueId; club: string; seed: number; rounds?: number; women?: boolean }): Season {
  const lg = LEAGUES[o.league];
  const clubs = lg.clubs.map((c) => c.id);
  const rounds = Math.max(1, Math.min(o.rounds ?? lg.rounds, 30));
  return { v: 2, seed: o.seed, league: o.league, clubs, club: o.club, rounds, round: 0, fixtures: draw(clubs, o.seed, rounds), stage: "home", finals: [], week: 0, votes: {}, women: !!o.women, medal: {}, goals: {} };
}

/** Each club's form this season (deterministic per season). */
export function strength(s: Season, id: string) {
  const r = createRng((s.seed ^ (id.charCodeAt(0) * 7919 + id.charCodeAt(id.length - 1) * 104729 + id.length * 31)) >>> 0);
  return 0.84 + r.next() * 0.32 + (s.drift?.[id] ?? 0);
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

/** Add a game's votes and goals to the season's counts (home-and-away games only). */
function addAwards(s: Season, a: Awards) {
  const m = (s.medal ??= {});
  const g = (s.goals ??= {});
  const byRound = (s.medalRounds ??= []);
  const rd = (byRound[s.round] ??= {});
  for (const [k, v] of Object.entries(a.votes)) {
    m[k] = (m[k] ?? 0) + v;
    rd[k] = (rd[k] ?? 0) + v;
  }
  for (const [k, v] of Object.entries(a.goals)) g[k] = (g[k] ?? 0) + v;
}

/** A simulated game's votes and goal-kickers, from the clubs' lists and the score. */
export function simAwards(s: Season, f: Fixture, salt: number): Awards {
  const [hp, ap] = f.result!;
  const r = createRng((s.seed * 17 + salt * 131 + f.round * 7919 + f.home.length * 31) >>> 0);
  const out: Awards = { votes: {}, goals: {} };
  const pick = (w: number[]) => {
    const t = w.reduce((a, b) => a + b, 0);
    let x = r.next() * t;
    for (let i = 0; i < w.length; i++) if ((x -= w[i]) <= 0) return i;
    return w.length - 1;
  };
  for (const [club, pts] of [
    [f.home, hp],
    [f.away, ap],
  ] as [string, number][]) {
    const list = rosterFor(club, s.women);
    // Goals from points: about one behind for every goal and a bit.
    const goals = Math.max(0, Math.round(pts / 7.4));
    for (let i = 0; i < goals; i++) {
      const k = `${club}:${list[pick(GOAL_WEIGHT)].last}`;
      out.goals[k] = (out.goals[k] ?? 0) + 1;
    }
  }
  // 3-2-1: the winners' best get most of them.
  const pool = [...rosterFor(f.home, s.women).map((p, i) => ({ k: `${f.home}:${p.last}`, w: VOTE_WEIGHT[i] * (hp >= ap ? 2.2 : 1) })), ...rosterFor(f.away, s.women).map((p, i) => ({ k: `${f.away}:${p.last}`, w: VOTE_WEIGHT[i] * (ap >= hp ? 2.2 : 1) }))];
  for (const v of [3, 2, 1]) {
    const i = pick(pool.map((x) => x.w));
    out.votes[pool[i].k] = v;
    pool.splice(i, 1);
  }
  return out;
}

/** The season's count, highest first: { key, club, last, n }. */
export function countOf(rec: Record<string, number> | undefined, n = 10) {
  return Object.entries(rec ?? {})
    .map(([key, v]) => ({ key, club: key.split(":")[0], last: key.split(":").slice(1).join(":"), n: v }))
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))
    .slice(0, n);
}

/** Momentum: winners get a little hotter, losers a little colder, and a bit of luck either way. */
function shiftForm(s: Season, round: Fixture[]) {
  const d = (s.drift ??= {});
  const r = createRng((s.seed * 131 + s.round * 7907) >>> 0);
  for (const f of round) {
    if (!f.result) continue;
    const [h, a] = f.result;
    for (const [id, won] of [
      [f.home, h > a],
      [f.away, a > h],
    ] as [string, boolean][])
      d[id] = Math.max(-0.07, Math.min(0.07, (d[id] ?? 0) * 0.92 + (won ? 0.006 : -0.006) + (r.next() - 0.5) * 0.02));
  }
}

/** Simulate everything still to play until your next game (or the end of the season). */
function advance(s: Season) {
  for (let guard = 0; guard < 200; guard++) {
    if (s.stage === "home") {
      const round = s.fixtures.filter((f) => f.round === s.round);
      if (round.some((f) => !f.result && (f.home === s.club || f.away === s.club))) return;
      for (const f of round)
        if (!f.result) {
          f.result = simulateGame(s, f, 1);
          addAwards(s, simAwards(s, f, 1));
        }
      if (s.momentum) shiftForm(s, round);
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
export function recordResult(s: Season, us: number, them: number, votes: Record<string, number> = {}, awards?: Awards) {
  const g = nextGame(s);
  if (!g) return s;
  const f = g.fixture;
  f.result = f.home === s.club ? [us, them] : [them, us];
  for (const [name, v] of Object.entries(votes)) s.votes[name] = (s.votes[name] ?? 0) + v;
  // Home and away only: the medal and the goalkicking count stop at the finals.
  if (s.stage === "home") addAwards(s, awards ?? simAwards(s, f, 5));
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
export function startSeason(o: { league: LeagueId; club: string; seed: number; rounds?: number; women?: boolean; year?: number; momentum?: boolean; honours?: Honour[] }) {
  const s = newSeason(o);
  if (o.year) s.year = o.year;
  if (o.momentum) s.momentum = true;
  if (o.honours) s.honours = o.honours;
  advance(s);
  return s;
}

// ----------------------------------------------------------- the dynasty

/** The season's line on the honour board (once it's over). */
export function honourOf(s: Season): Honour | null {
  const gf = s.finals.find((f) => f.key === "GF" && f.result);
  if (s.stage !== "done" || !gf || !s.premier) return null;
  const runnerUp = gf.home === s.premier ? gf.away : gf.home;
  const [h, a] = gf.result!;
  const medal = countOf(s.medal, 1)[0];
  const coleman = countOf(s.goals, 1)[0];
  return {
    year: s.year ?? 2027,
    premier: s.premier,
    runnerUp,
    score: gf.home === s.premier ? [h, a] : [a, h],
    minor: ladder(s)[0].id,
    medal: medal && { key: medal.key, n: medal.n },
    coleman: coleman && { key: coleman.key, n: coleman.n },
    ours: finish(s),
  };
}

/** Next year: the same competition and club, the honour board carried on. */
export function nextYear(s: Season, club = s.club, rounds = s.rounds): Season {
  const h = honourOf(s);
  const honours = [...(s.honours ?? []), ...(h ? [h] : [])];
  return startSeason({ league: s.league, club, seed: (s.seed * 48271 + 11) % 2147483647 || 7, rounds, women: s.women, year: (s.year ?? 2027) + 1, momentum: true, honours });
}

/** A club's last `n` results, oldest first: "W", "L" or "D". */
export function formGuide(s: Season, id: string, n = 5) {
  const out: ("W" | "L" | "D")[] = [];
  for (const f of [...s.fixtures, ...s.finals]) {
    if (!f.result || (f.home !== id && f.away !== id)) continue;
    const [us, them] = f.home === id ? f.result : [f.result[1], f.result[0]];
    out.push(us > them ? "W" : us < them ? "L" : "D");
  }
  return out.slice(-n);
}

/** Every game in a home-and-away round. */
export const roundResults = (s: Season, round: number) => s.fixtures.filter((f) => f.round === round);

/** The last completed home-and-away round (or -1). */
export const lastRound = (s: Season) => (s.stage === "home" ? s.round - 1 : s.rounds - 1);

/** A club's current run: +3 for three wins in a row, -2 for two losses. */
export function streak(s: Season, id: string) {
  const g = formGuide(s, id, 99);
  if (!g.length) return 0;
  const last = g[g.length - 1];
  let n = 0;
  for (let i = g.length - 1; i >= 0 && g[i] === last; i--) n++;
  return last === "W" ? n : last === "L" ? -n : 0;
}

/** The round's talking points: the big win, the upset, the streaks, the top of the table. */
export function headlines(s: Season, round = lastRound(s)): string[] {
  if (round < 0) return [];
  const games = roundResults(s, round).filter((f) => f.result);
  if (!games.length) return [];
  const name = (id: string) => clubById(id).name;
  const out: string[] = [];
  const margin = (f: Fixture) => Math.abs(f.result![0] - f.result![1]);
  const winnerOf = (f: Fixture) => (f.result![0] >= f.result![1] ? f.home : f.away);
  const loserOf = (f: Fixture) => (winnerOf(f) === f.home ? f.away : f.home);
  const big = [...games].sort((a, b) => margin(b) - margin(a))[0];
  if (margin(big) >= 40) out.push(`${name(winnerOf(big))} smash ${name(loserOf(big))} by ${margin(big)} points.`);
  const close = games.find((f) => margin(f) <= 6 && f !== big);
  if (close) out.push(close.result![0] === close.result![1] ? `${name(close.home)} and ${name(close.away)} can't be split: a draw!` : `Thriller: ${name(winnerOf(close))} hold on by ${margin(close)} against ${name(loserOf(close))}.`);
  const upset = games.find((f) => strength(s, loserOf(f)) - strength(s, winnerOf(f)) > 0.12);
  if (upset) out.push(`Upset! ${name(winnerOf(upset))} topple ${name(loserOf(upset))}.`);
  for (const id of s.clubs) {
    const k = streak(s, id);
    if (k >= 5 && formGuide(s, id, 1)[0] === "W" && games.some((f) => f.home === id || f.away === id)) out.push(`${name(id)} make it ${k} wins on the trot.`);
    else if (k <= -5 && games.some((f) => f.home === id || f.away === id)) out.push(`${name(id)}'s losing run hits ${-k}. The pressure's on.`);
  }
  const top = ladder(s)[0];
  if (top.played) out.push(`${name(top.id)} sit on top: ${top.won}-${top.lost}${top.drawn ? `-${top.drawn}` : ""}, ${top.pct.toFixed(1)}%.`);
  return out.slice(0, 5);
}

/** The year's All-League team: the best eighteen by votes. */
export function allLeagueTeam(s: Season) {
  return countOf(s.medal, 18);
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
