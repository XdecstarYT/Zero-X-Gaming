import { createRng, type Rng } from "../engine/rng";
import type { CricketSim, Innings } from "./sim";
import { bowlers, TEAMS, teamById, type Team } from "./teams";

/**
 * The Blitz League: a season for the eight franchises. Everyone plays
 * everyone once (seven rounds), the top four go to the semi-finals (1 v 4,
 * 2 v 3) and the winners meet in the final. Two points a win, one a tie, then
 * net run rate. You play your club's games in the stadium (or sim them); the
 * rest are simulated ball by ball from the squads, so every player has a
 * season: the Orange Cap for the most runs, the Purple Cap for wickets.
 * Pure data, saved on the device.
 */

export interface Side {
  runs: number;
  wkts: number;
  /** Legal balls faced (an all-out side counts its full quota for NRR). */
  balls: number;
}

export interface Fixture {
  round: number;
  a: string;
  b: string;
  /** Batting first: 0 for a, 1 for b. */
  first?: 0 | 1;
  result?: { a: Side; b: Side; winner: string | null; text: string };
  /** Play-offs: SF1, SF2, F. */
  key?: "SF1" | "SF2" | "F";
}

export interface PlayerLine {
  team: string;
  name: string;
  runs: number;
  balls: number;
  outs: number;
  fours: number;
  sixes: number;
  hs: number;
  wkts: number;
  bBalls: number;
  bRuns: number;
  /** Best bowling: wickets then runs. */
  best: [number, number];
}

export type LeagueStage = "league" | "playoffs" | "done";

export interface League {
  v: 1;
  seed: number;
  team: string;
  overs: number;
  fixtures: Fixture[];
  /** The next league round (0-based). */
  round: number;
  stage: LeagueStage;
  playoffs: Fixture[];
  champion?: string;
  stats: Record<string, PlayerLine>;
}

export interface TableRow {
  id: string;
  p: number;
  w: number;
  l: number;
  t: number;
  pts: number;
  nrr: number;
  rf: number;
  bf: number;
  ra: number;
  ba: number;
}

export const ROUNDS = TEAMS.length - 1;

/** Round robin (circle method). */
function roundRobin(ids: string[], seed: number): Fixture[] {
  const r = createRng(seed);
  const list = [...ids].sort(() => r.next() - 0.5);
  const n = list.length;
  const out: Fixture[] = [];
  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const x = list[i];
      const y = list[n - 1 - i];
      out.push(round % 2 ? { round, a: y, b: x } : { round, a: x, b: y });
    }
    list.splice(1, 0, list.pop()!);
  }
  return out;
}

export function newLeague(o: { team: string; overs: number; seed: number }): League {
  return { v: 1, seed: o.seed, team: o.team, overs: o.overs, fixtures: roundRobin(TEAMS.map((t) => t.id), o.seed), round: 0, stage: "league", playoffs: [], stats: {} };
}

const key = (team: string, name: string) => `${team}:${name}`;
function line(L: League, team: string, name: string): PlayerLine {
  const k = key(team, name);
  return (L.stats[k] ??= { team, name, runs: 0, balls: 0, outs: 0, fours: 0, sixes: 0, hs: 0, wkts: 0, bBalls: 0, bRuns: 0, best: [0, 0] });
}

/** Fold an innings' scorecard into the season stats. */
function addInnings(L: League, batT: Team, bowlT: Team, inn: Pick<Innings, "cards" | "bowl">) {
  inn.cards.forEach((c, i) => {
    if (!c.balls && !c.out) return;
    const p = line(L, batT.id, batT.players[i].name);
    p.runs += c.runs;
    p.balls += c.balls;
    p.fours += c.fours;
    p.sixes += c.sixes;
    if (c.out) p.outs++;
    p.hs = Math.max(p.hs, c.runs);
  });
  for (const [i, b] of inn.bowl) {
    if (!b.balls) continue;
    const p = line(L, bowlT.id, bowlT.players[i].name);
    p.wkts += b.wkts;
    p.bBalls += b.balls;
    p.bRuns += b.runs;
    if (b.wkts > p.best[0] || (b.wkts === p.best[0] && b.runs < p.best[1]) || (p.best[0] === 0 && p.best[1] === 0)) p.best = [b.wkts, b.runs];
  }
}

// --------------------------------------------------------------- quick sim

/** One innings ball by ball from the squads: batters' and bowlers' ratings set the odds. */
export function quickInnings(r: Rng, bat: Team, bowl: Team, overs: number, target = 0): Innings {
  const inn: Innings = {
    bat: 0,
    runs: 0,
    wkts: 0,
    balls: 0,
    extras: 0,
    fours: 0,
    sixes: 0,
    cards: bat.players.map(() => ({ runs: 0, balls: 0, fours: 0, sixes: 0, out: null })),
    bowl: new Map(),
    striker: 0,
    nonStriker: 1,
    next: 2,
    bowler: -1,
    lastBowler: -1,
    over: [],
    worm: [],
    shots: [],
  };
  const attack = bowlers(bowl);
  const quota = Math.max(1, Math.ceil(overs / 5));
  const total = overs * 6;
  let last = -1;
  for (let o = 0; o < overs && inn.wkts < 10; o++) {
    const pool = attack.filter((i) => i !== last && Math.floor((inn.bowl.get(i)?.balls ?? 0) / 6) < quota);
    const bw = pool[(o * 3 + Math.floor(r.next() * 2)) % Math.max(1, pool.length)] ?? attack[0];
    last = bw;
    const bc = inn.bowl.get(bw) ?? { balls: 0, runs: 0, wkts: 0 };
    inn.bowl.set(bw, bc);
    for (let b = 0; b < 6 && inn.wkts < 10; b++) {
      if (target && inn.runs >= target) break;
      // A wide now and then.
      if (r.next() < 0.03) {
        inn.runs++;
        inn.extras++;
        bc.runs++;
        b--;
        continue;
      }
      const left = total - inn.balls;
      const need = target ? (target - inn.runs) / Math.max(1, left) : 0;
      const death = inn.balls >= total - Math.min(24, total * 0.25);
      const agg = Math.min(1.6, (target ? 0.7 + need * 0.45 : 0.8) + (death ? 0.35 : 0));
      const batter = bat.players[inn.striker];
      const edge = (batter.bat - bowl.players[bw].bowl) / 100;
      const pW = Math.max(0.015, 0.05 - edge * 0.035) * (0.75 + agg * 0.35);
      const x = r.next();
      let runs = 0;
      let out = false;
      if (x < pW) out = true;
      else {
        const y = (x - pW) / (1 - pW);
        const p6 = (0.045 + edge * 0.03) * agg;
        const p4 = (0.1 + edge * 0.04) * (0.8 + agg * 0.25);
        runs = y < p6 ? 6 : y < p6 + p4 ? 4 : y < p6 + p4 + 0.08 ? 2 : y < p6 + p4 + 0.09 ? 3 : y < p6 + p4 + 0.45 ? 1 : 0;
      }
      inn.balls++;
      bc.balls++;
      const c = inn.cards[inn.striker];
      c.balls++;
      if (out) {
        const how = r.next();
        c.out = how < 0.55 ? `c ${bowl.players[Math.floor(r.next() * 11)].name.split(" ")[1]} b ${bowl.players[bw].name.split(" ")[1]}` : how < 0.8 ? `b ${bowl.players[bw].name.split(" ")[1]}` : how < 0.92 ? `lbw b ${bowl.players[bw].name.split(" ")[1]}` : "run out";
        inn.wkts++;
        if (c.out !== "run out") bc.wkts++;
        if (inn.next < 11) inn.striker = inn.next++;
      } else {
        c.runs += runs;
        inn.runs += runs;
        bc.runs += runs;
        if (runs === 4) {
          c.fours++;
          inn.fours++;
        }
        if (runs === 6) {
          c.sixes++;
          inn.sixes++;
        }
        if (runs % 2) [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
      }
    }
    [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
    if (target && inn.runs >= target) break;
  }
  return inn;
}

const side = (i: Innings, overs: number): Side => ({ runs: i.runs, wkts: i.wkts, balls: i.wkts >= 10 ? overs * 6 : i.balls });

function resultText(first: Team, second: Team, i1: Innings, i2: Innings): { winner: string | null; text: string } {
  if (i2.runs > i1.runs) return { winner: second.id, text: `${second.name} won by ${10 - i2.wkts} wicket${10 - i2.wkts === 1 ? "" : "s"}` };
  if (i2.runs < i1.runs) return { winner: first.id, text: `${first.name} won by ${i1.runs - i2.runs} run${i1.runs - i2.runs === 1 ? "" : "s"}` };
  return { winner: null, text: "Match tied" };
}

/** Simulate a fixture, record it and everyone's stats. */
export function simFixture(L: League, f: Fixture, salt: number) {
  const r = createRng(L.seed * 31 + salt * 977 + f.round * 7);
  const A = teamById(f.a);
  const B = teamById(f.b);
  const first: 0 | 1 = r.next() < 0.5 ? 0 : 1;
  const [T1, T2] = first === 0 ? [A, B] : [B, A];
  const i1 = quickInnings(r, T1, T2, L.overs);
  const i2 = quickInnings(r, T2, T1, L.overs, i1.runs + 1);
  addInnings(L, T1, T2, i1);
  addInnings(L, T2, T1, i2);
  let { winner, text } = resultText(T1, T2, i1, i2);
  // Knock-outs can't end level: a super over, settled on the sides' strength.
  if (!winner && f.key) {
    winner = (teamRating(A) + r.next() * 40 > teamRating(B) + r.next() * 40 ? A : B).id;
    text = `${teamById(winner).name} won the super over`;
  }
  const s1 = side(i1, L.overs);
  const s2 = side(i2, L.overs);
  f.first = first;
  f.result = { a: first === 0 ? s1 : s2, b: first === 0 ? s2 : s1, winner, text };
}

const teamRating = (t: Team) => t.players.reduce((a, p) => a + p.bat * 0.5 + p.bowl * 0.5, 0) / t.players.length;

/** Record a match you played in the stadium. */
export function recordPlayed(L: League, f: Fixture, sim: CricketSim) {
  const [i1, i2] = sim.innings;
  const T1 = sim.teams[i1.bat];
  const T2 = sim.teams[i2?.bat ?? 1 - i1.bat];
  addInnings(L, T1, T2, i1);
  if (i2) addInnings(L, T2, T1, i2);
  const s1 = side(i1, L.overs);
  const s2 = i2 ? side(i2, L.overs) : { runs: 0, wkts: 0, balls: L.overs * 6 };
  const first: 0 | 1 = T1.id === f.a ? 0 : 1;
  let winner: string | null = sim.winner === null ? null : sim.teams[sim.winner].id;
  let text = sim.resultText;
  if (!winner && f.key) {
    winner = f.a === L.team ? f.a : f.b;
    text = `${teamById(winner).name} won the super over`;
  }
  f.first = first;
  f.result = { a: first === 0 ? s1 : s2, b: first === 0 ? s2 : s1, winner, text };
}

// ---------------------------------------------------------------- the table

export function table(L: League): TableRow[] {
  const rows = new Map<string, TableRow>(TEAMS.map((t) => [t.id, { id: t.id, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: 0, rf: 0, bf: 0, ra: 0, ba: 0 }]));
  for (const f of L.fixtures) {
    if (!f.result) continue;
    const a = rows.get(f.a)!;
    const b = rows.get(f.b)!;
    const { a: sa, b: sb, winner } = f.result;
    a.p++;
    b.p++;
    a.rf += sa.runs;
    a.bf += sa.balls;
    a.ra += sb.runs;
    a.ba += sb.balls;
    b.rf += sb.runs;
    b.bf += sb.balls;
    b.ra += sa.runs;
    b.ba += sa.balls;
    if (!winner) {
      a.t++;
      b.t++;
      a.pts++;
      b.pts++;
    } else if (winner === f.a) {
      a.w++;
      b.l++;
      a.pts += 2;
    } else {
      b.w++;
      a.l++;
      b.pts += 2;
    }
  }
  for (const r of rows.values()) r.nrr = r.bf && r.ba ? (r.rf / r.bf - r.ra / r.ba) * 6 : 0;
  return [...rows.values()].sort((x, y) => y.pts - x.pts || y.nrr - x.nrr || x.id.localeCompare(y.id));
}

/** Your next game, if there is one. */
export function nextFixture(L: League): Fixture | null {
  if (L.stage === "league") return L.fixtures.find((f) => f.round === L.round && (f.a === L.team || f.b === L.team)) ?? null;
  if (L.stage === "playoffs") return L.playoffs.find((f) => !f.result && (f.a === L.team || f.b === L.team)) ?? null;
  return null;
}

/** Sim the rest of the current round (or play-off week), then move on. */
export function advance(L: League) {
  if (L.stage === "league") {
    L.fixtures.filter((f) => f.round === L.round && !f.result).forEach((f, i) => simFixture(L, f, L.round * 10 + i));
    L.round++;
    if (L.round >= ROUNDS) {
      const t = table(L);
      L.stage = "playoffs";
      L.playoffs = [
        { round: ROUNDS, a: t[0].id, b: t[3].id, key: "SF1" },
        { round: ROUNDS, a: t[1].id, b: t[2].id, key: "SF2" },
      ];
    }
    return;
  }
  if (L.stage === "playoffs") {
    const open = L.playoffs.filter((f) => !f.result);
    open.forEach((f, i) => simFixture(L, f, 900 + L.playoffs.length * 10 + i));
    const sf = L.playoffs.filter((f) => f.key !== "F");
    const fin = L.playoffs.find((f) => f.key === "F");
    if (!fin && sf.every((f) => f.result)) {
      L.playoffs.push({ round: ROUNDS + 1, a: sf[0].result!.winner!, b: sf[1].result!.winner!, key: "F" });
    } else if (fin?.result) {
      L.champion = fin.result.winner!;
      L.stage = "done";
    }
  }
}

/** You've just played (or simmed) your game: the rest of the round follows. */
export function afterMyGame(L: League) {
  advance(L);
}

export function simMine(L: League) {
  const f = nextFixture(L);
  if (f) simFixture(L, f, 500 + L.round);
  advance(L);
}

/** Has your season ended (knocked out or the final's done)? */
export function myStatus(L: League): string {
  if (L.stage === "done") return L.champion === L.team ? "Champions!" : `${teamById(L.champion!).name} are champions`;
  if (L.stage === "playoffs") {
    const mine = L.playoffs.filter((f) => f.a === L.team || f.b === L.team);
    if (!mine.length) return "Missed the play-offs";
    const last = mine[mine.length - 1];
    if (last.result && last.result.winner !== L.team) return `Knocked out in the ${last.key === "F" ? "final" : "semi-final"}`;
    return last.key === "F" ? "Into the final!" : "Into the semi-finals";
  }
  const pos = table(L).findIndex((r) => r.id === L.team) + 1;
  return `Round ${L.round + 1} of ${ROUNDS} · ${pos}${["th", "st", "nd", "rd"][pos > 3 ? 0 : pos]} on the table`;
}

export function caps(L: League) {
  const all = Object.values(L.stats);
  return {
    orange: [...all].sort((a, b) => b.runs - a.runs || a.balls - b.balls).slice(0, 5),
    purple: [...all].filter((p) => p.bBalls).sort((a, b) => b.wkts - a.wkts || a.bRuns / Math.max(1, a.bBalls) - b.bRuns / Math.max(1, b.bBalls)).slice(0, 5),
  };
}

export function parseLeague(raw: unknown): League | null {
  const L = raw as League | null;
  if (!L || L.v !== 1 || !Array.isArray(L.fixtures) || !TEAMS.some((t) => t.id === L.team)) return null;
  L.stats ??= {};
  L.playoffs ??= [];
  return L;
}
