import { createRng } from "../engine/rng";
import { CLUBS, clubById } from "./sim";

/**
 * The Premiership season: eight clubs, seven home-and-away rounds (everyone
 * plays everyone once), a ladder (four points a win, two a draw, then
 * percentage), the top four into the finals: semi-finals 1 v 4 and 2 v 3,
 * then the Grand Final. You play your club's games; the rest of each round is
 * simulated from the clubs' form. Pure data, saved to the device.
 */

export interface Fixture {
  round: number;
  home: string;
  away: string;
  /** Points for each side once played. */
  result?: [number, number];
}

export type Stage = "home" | "semi" | "grand" | "done";

export interface Season {
  v: 1;
  seed: number;
  club: string;
  /** The next home-and-away round (0-based). */
  round: number;
  fixtures: Fixture[];
  stage: Stage;
  finals: Fixture[];
  premier?: string;
  /** Your players' 3-2-1 votes over the season. */
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

export const ROUNDS = CLUBS.length - 1;

/** The circle method: every club meets every other once over seven rounds. */
export function draw(ids: string[], seed: number): Fixture[] {
  const rng = createRng(seed);
  const list = [...ids];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  const n = list.length;
  const out: Fixture[] = [];
  const rot = list.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const ring = [list[0], ...rot];
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i];
      const b = ring[n - 1 - i];
      // Alternate home ground.
      out.push((r + i) % 2 ? { round: r, home: a, away: b } : { round: r, home: b, away: a });
    }
    rot.unshift(rot.pop()!);
  }
  return out;
}

export function newSeason(club: string, seed: number): Season {
  return { v: 1, seed, club, round: 0, fixtures: draw(CLUBS.map((c) => c.id), seed), stage: "home", finals: [], votes: {} };
}

/** Each club's form for simulated games (deterministic per season). */
function strength(s: Season, id: string) {
  const r = createRng(s.seed ^ (id.charCodeAt(0) * 7919 + id.length * 104729));
  return 0.86 + r.next() * 0.28;
}

/** A simulated game's score in points: goals and behinds from each side's form. */
export function simulateGame(s: Season, f: Fixture, salt: number): [number, number] {
  const rng = createRng((s.seed * 31 + salt * 1009 + f.round * 97 + f.home.length * 13) >>> 0);
  const g = (k: number) => {
    const goals = Math.max(3, Math.round(11.5 * k + (rng.next() + rng.next() + rng.next() - 1.5) * 5));
    const behinds = Math.max(2, Math.round(9 * k + (rng.next() - 0.5) * 8));
    return goals * 6 + behinds;
  };
  const home = g(strength(s, f.home) * 1.04);
  const away = g(strength(s, f.away));
  return [home, away];
}

export function ladder(s: Season): LadderRow[] {
  const rows = new Map<string, LadderRow>(CLUBS.map((c) => [c.id, { id: c.id, played: 0, won: 0, lost: 0, drawn: 0, for: 0, against: 0, points: 0, pct: 0 }]));
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

/** Your next game: the opponent, home or away, and what it's called. */
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
    label = s.stage === "grand" ? "Grand Final" : "Semi-final";
  }
  if (!f) return null;
  return { fixture: f, opponent: f.home === s.club ? f.away : f.home, label };
}

/** The winner of a final (a draw goes to the higher-placed club). */
function finalWinner(f: Fixture, order: string[]) {
  const [h, a] = f.result!;
  if (h !== a) return h > a ? f.home : f.away;
  return order.indexOf(f.home) < order.indexOf(f.away) ? f.home : f.away;
}

/** Simulate everything still to play until your next game (or the end of the season). */
function advance(s: Season) {
  for (;;) {
    if (s.stage === "home") {
      const round = s.fixtures.filter((f) => f.round === s.round);
      if (round.some((f) => !f.result && (f.home === s.club || f.away === s.club))) return;
      for (const f of round) if (!f.result) f.result = simulateGame(s, f, 1);
      s.round++;
      if (s.round >= ROUNDS) {
        const top = ladder(s).slice(0, 4).map((r) => r.id);
        s.finals = [
          { round: ROUNDS, home: top[0], away: top[3] },
          { round: ROUNDS, home: top[1], away: top[2] },
        ];
        s.stage = "semi";
      }
      continue;
    }
    if (s.stage === "semi" || s.stage === "grand") {
      const open = s.finals.filter((f) => !f.result);
      if (open.some((f) => f.home === s.club || f.away === s.club)) return;
      for (const f of open) f.result = simulateGame(s, f, 7 + s.finals.length);
      const order = ladder(s).map((r) => r.id);
      if (s.stage === "semi") {
        const [w1, w2] = s.finals.map((f) => finalWinner(f, order));
        s.finals.push({ round: ROUNDS + 1, home: w1, away: w2 });
        s.stage = "grand";
      } else {
        s.premier = finalWinner(s.finals[s.finals.length - 1], order);
        s.stage = "done";
        return;
      }
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

/** Start a season and play out anything before your first game. */
export function startSeason(club: string, seed: number) {
  const s = newSeason(club, seed);
  advance(s);
  return s;
}

export const clubName = (id: string) => clubById(id).name;

/** Did you win the flag? */
export const premiers = (s: Season) => s.stage === "done" && s.premier === s.club;
