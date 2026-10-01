import { createRng } from "../engine/rng";
import { LEAGUES, NATIONAL, type LeagueId } from "./clubs";
import { finish, ladder, nextGame, premiers, recordResult, simulateMine, startSeason, type Season } from "./season";
import type { Difficulty, PlayerStats, ProPlayer } from "./sim";

/**
 * Career mode: one player from the Local League to the National League.
 * You start at 17 at a local club. Good seasons get you picked up by a State
 * League club; good State League seasons (or a brilliant local one) get you
 * drafted; then you play out a professional career until you retire. Every
 * game (played or simmed) earns skill points for your attributes, the umpires'
 * votes add up toward the league medal, and the honours board fills up.
 * Pure data, saved to the device.
 */

export type Position = "keyForward" | "smallForward" | "midfielder" | "wing" | "halfBack" | "keyDefender" | "ruck";
export type Attr = "kicking" | "marking" | "speed" | "tackling" | "endurance" | "ruck" | "composure";
export type Attrs = Record<Attr, number>;

export const ATTRS: { id: Attr; name: string }[] = [
  { id: "kicking", name: "Kicking" },
  { id: "marking", name: "Marking" },
  { id: "speed", name: "Speed" },
  { id: "tackling", name: "Tackling" },
  { id: "endurance", name: "Endurance" },
  { id: "ruck", name: "Ruck work" },
  { id: "composure", name: "Composure" },
];

/** Each position: where you line up (the sim's role), and what it leans on. */
export const POSITIONS_CAREER: Record<Position, { name: string; role: number; weights: Partial<Attrs>; start: Partial<Attrs> }> = {
  keyForward: { name: "Key forward", role: 12, weights: { marking: 3, kicking: 3, composure: 2, speed: 1 }, start: { marking: 52, kicking: 50, composure: 46, ruck: 30 } },
  smallForward: { name: "Small forward", role: 13, weights: { speed: 3, kicking: 2, tackling: 2, composure: 2 }, start: { speed: 54, tackling: 48, kicking: 48 } },
  midfielder: { name: "Midfielder", role: 17, weights: { endurance: 3, kicking: 2, tackling: 2, speed: 2, marking: 1 }, start: { endurance: 54, kicking: 48, tackling: 48 } },
  wing: { name: "Wing", role: 7, weights: { endurance: 3, speed: 3, kicking: 2 }, start: { endurance: 52, speed: 52, kicking: 48 } },
  halfBack: { name: "Half-back", role: 4, weights: { kicking: 3, speed: 2, marking: 2, composure: 1 }, start: { kicking: 52, speed: 50, marking: 46 } },
  keyDefender: { name: "Key defender", role: 0, weights: { marking: 3, tackling: 2, composure: 2, speed: 1 }, start: { marking: 52, tackling: 50, composure: 46 } },
  ruck: { name: "Ruck", role: 15, weights: { ruck: 4, marking: 2, endurance: 1 }, start: { ruck: 56, marking: 48 } },
};

export interface SeasonLine {
  year: number;
  league: LeagueId;
  club: string;
  games: number;
  goals: number;
  behinds: number;
  disposals: number;
  marks: number;
  tackles: number;
  hitouts: number;
  votes: number;
  ratingSum: number;
  finish: string;
  awards: string[];
}

export type CareerStage = "season" | "offseason" | "retired";

export interface Career {
  v: 1;
  seed: number;
  name: string;
  number: number;
  position: Position;
  age: number;
  year: number;
  league: LeagueId;
  club: string;
  attrs: Attrs;
  /** Skill points to spend. */
  points: number;
  season: Season;
  /** This season so far. */
  line: SeasonLine;
  /** The league's best (simulated) for the medal and the goalkicking. */
  leader: { votes: number; goals: number };
  history: SeasonLine[];
  honours: string[];
  stage: CareerStage;
  /** How you got here (draft pick, club, year). */
  drafted: { pick: number; club: string; year: number } | null;
  captain: boolean;
  news: string[];
}

export interface MatchLine {
  goals: number;
  behinds: number;
  kicks: number;
  handballs: number;
  marks: number;
  tackles: number;
  hitouts: number;
  /** 0–10 match rating. */
  rating: number;
  /** The umpires' votes you got (0–3). */
  votes: number;
}

export const LEAGUE_MEDAL: Record<LeagueId, string> = { local: "Local League Best and Fairest", state: "State League Medal", national: "League Medal" };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rngFor = (c: Career, salt: number) => createRng((c.seed * 2654435761 + salt * 97 + c.year * 31) >>> 0);

const emptyLine = (year: number, league: LeagueId, club: string): SeasonLine => ({ year, league, club, games: 0, goals: 0, behinds: 0, disposals: 0, marks: 0, tackles: 0, hitouts: 0, votes: 0, ratingSum: 0, finish: "", awards: [] });

/** Start a career: 17, at a local club. */
export function newCareer(o: { name: string; number: number; position: Position; seed: number; year?: number }): Career {
  const rng = createRng(o.seed);
  const pos = POSITIONS_CAREER[o.position];
  const attrs = {} as Attrs;
  for (const a of ATTRS) attrs[a.id] = Math.round((pos.start[a.id] ?? 38) + rng.next() * 6);
  const locals = LEAGUES.local.clubs;
  const club = locals[Math.floor(rng.next() * locals.length)].id;
  const year = o.year ?? 2027;
  const c: Career = {
    v: 1,
    seed: o.seed,
    name: o.name.trim().slice(0, 24) || "Rookie",
    number: clamp(Math.round(o.number), 1, 99),
    position: o.position,
    age: 17,
    year,
    league: "local",
    club,
    attrs,
    points: 6,
    season: startSeason({ league: "local", club, seed: o.seed }),
    line: emptyLine(year, "local", club),
    leader: { votes: 0, goals: 0 },
    history: [],
    honours: [],
    stage: "season",
    drafted: null,
    captain: false,
    news: [`${o.name.trim() || "Rookie"} signs with ${LEAGUES.local.clubs.find((x) => x.id === club)!.name} in the ${LEAGUES.local.name}.`],
  };
  return c;
}

/** Overall rating (0–99) for your position. */
export function overall(c: Pick<Career, "attrs" | "position">) {
  const w = POSITIONS_CAREER[c.position].weights;
  let sum = 0;
  let tot = 0;
  for (const a of ATTRS) {
    const k = w[a.id] ?? 0.5;
    sum += c.attrs[a.id] * k;
    tot += k;
  }
  return Math.round(sum / tot);
}

const skill = (v: number) => 0.42 + (v / 99) * 0.55;

/** Your player for the match engine. */
export function toPro(c: Career): ProPlayer {
  const a = c.attrs;
  return {
    name: c.name,
    number: c.number,
    role: POSITIONS_CAREER[c.position].role,
    skill: { pace: skill((a.speed * 2 + a.endurance) / 3), kick: skill(a.kicking), mark: skill(a.marking), tackle: skill(a.tackling), ruck: skill(a.ruck) },
    composure: a.composure / 99,
  };
}

/** How hard the opposition is at each level. */
export function difficultyFor(league: LeagueId, pref: Difficulty): Difficulty {
  return league === "local" ? "easy" : league === "state" ? "pro" : pref;
}

/** A 0–10 rating from a match's stats. */
export function matchRating(st: PlayerStats) {
  const r = st.kicks + st.handballs + st.marks * 1.4 + st.contested * 1.2 + st.tackles * 1.6 + st.goals * 5 + st.behinds + st.hitouts * 0.5 + st.screamers * 3 + st.inside50 * 0.8;
  return Math.round(clamp(r / 4.2, 0, 10) * 10) / 10;
}

/** The cost of the next point in an attribute: dearer near the top. */
export const pointCost = (v: number) => (v >= 90 ? 3 : v >= 75 ? 2 : 1);

export function spendPoint(c: Career, a: Attr) {
  const cost = pointCost(c.attrs[a]);
  if (c.points < cost || c.attrs[a] >= 99) return false;
  c.points -= cost;
  c.attrs[a]++;
  return true;
}

/** The league's leaders move on a round: the medal favourite's votes and the top goalkicker's goals. */
function stepLeaders(c: Career) {
  const r = rngFor(c, 500 + c.line.games);
  const v = r.next();
  c.leader.votes += v < 0.4 ? 0 : v < 0.6 ? 1 : v < 0.8 ? 2 : 3;
  c.leader.goals += Math.round(1.2 + r.next() * 3.2);
}

/** After a game (played or simmed): stats, votes, skill points, the ladder. */
export function recordMatch(c: Career, m: MatchLine, us: number, them: number) {
  if (c.stage !== "season") return;
  const l = c.line;
  l.games++;
  l.goals += m.goals;
  l.behinds += m.behinds;
  l.disposals += m.kicks + m.handballs;
  l.marks += m.marks;
  l.tackles += m.tackles;
  l.hitouts += m.hitouts;
  l.ratingSum += m.rating;
  // Finals don't count for the medal.
  const g = nextGame(c.season);
  const final = c.season.stage === "finals";
  if (!final) l.votes += m.votes;
  c.points += 1 + Math.round(m.rating / 3) + (m.votes ? 1 : 0);
  if (!final) stepLeaders(c);
  const label = g?.label ?? "";
  recordResult(c.season, us, them, m.votes ? { [c.name]: m.votes } : {});
  if (m.goals >= 5) c.news.unshift(`${c.name} kicks ${m.goals} in ${label}!`);
  else if (m.votes === 3) c.news.unshift(`${c.name} best on ground in ${label} (${m.kicks + m.handballs} disposals).`);
  c.news = c.news.slice(0, 8);
  if (c.season.stage === "done") endSeason(c);
}

/** Simulate your next game: a stat line from your attributes and position. */
export function simulateMatch(c: Career): { line: MatchLine; us: number; them: number } {
  const r = rngFor(c, 1000 + c.line.games * 7 + c.season.week * 3);
  const ov = overall(c);
  const form = 0.9 + (ov / 99) * 0.2;
  const [us, them] = simulateMine(c.season, form);
  const a = c.attrs;
  const k = (v: number) => (v / 99) * (0.7 + r.next() * 0.6);
  const pos = c.position;
  const fwd = pos === "keyForward" || pos === "smallForward";
  const mid = pos === "midfielder" || pos === "wing";
  const goals = fwd ? Math.round(k(a.kicking) * (pos === "keyForward" ? 4.5 : 3.2)) : mid ? Math.round(k(a.kicking) * 1.2) : 0;
  const behinds = fwd ? Math.round(r.next() * 2.4) : Math.round(r.next() * 0.8);
  const kicks = Math.round((mid ? 14 : 9) * k(a.endurance + 20) + 2);
  const handballs = Math.round((mid ? 10 : 5) * k(a.endurance));
  const marks = Math.round((pos === "keyForward" || pos === "keyDefender" ? 8 : 4) * k(a.marking) + 1);
  const tackles = Math.round((mid || pos === "smallForward" ? 5 : 2.5) * k(a.tackling));
  const hitouts = pos === "ruck" ? Math.round(30 * k(a.ruck)) : 0;
  const st = { kicks, handballs, marks, contested: Math.round(marks * 0.3), screamers: 0, tackles, hitouts, goals, behinds, inside50: fwd ? 1 : 3 };
  const rating = matchRating(st);
  const vr = r.next();
  const votes = rating >= 8.5 ? (vr < 0.65 ? 3 : 2) : rating >= 7.2 ? (vr < 0.3 ? 2 : vr < 0.6 ? 1 : 0) : rating >= 6 ? (vr < 0.2 ? 1 : 0) : 0;
  return { line: { goals, behinds, kicks, handballs, marks, tackles, hitouts, rating, votes: us >= them ? votes : Math.min(votes, 1) }, us, them };
}

/** The end of a season: honours, the next step (promotion, the draft), age and decline. */
export function endSeason(c: Career) {
  const l = c.line;
  const s = c.season;
  const avg = l.games ? l.ratingSum / l.games : 0;
  l.finish = finish(s);
  const award = (a: string) => {
    l.awards.push(a);
    c.honours.push(`${a} (${c.year})`);
  };
  if (l.games && premiers(s)) award(`${LEAGUES[c.league].name} premiership`);
  if (l.votes > c.leader.votes) award(LEAGUE_MEDAL[c.league]);
  if (l.goals > c.leader.goals && l.goals >= 20) award(`${LEAGUES[c.league].name} leading goalkicker`);
  if (l.games >= 6 && avg >= 7) award("Club best and fairest");
  if (c.league === "national" && l.games >= 8 && avg >= 7.6) award("All-League team");
  if (c.league === "national" && c.drafted && c.drafted.year === c.year - 1 && l.games >= 6 && avg >= 6) award("Rising Star");
  c.history.push({ ...l });
  c.news.unshift(`Season ${c.year} over: ${l.games} games, ${l.goals} goals, ${l.votes} votes. ${l.finish}.`);

  // What's next.
  const r = rngFor(c, 9000);
  const score = avg * 10 + l.votes * 1.5 + l.goals * 0.4 + l.awards.length * 8;
  if (c.league === "local" && (score >= 62 || l.awards.length > 0)) {
    if (score >= 95) draft(c, score, r.next());
    else {
      const state = LEAGUES.state.clubs[Math.floor(r.next() * LEAGUES.state.clubs.length)];
      c.league = "state";
      c.club = state.id;
      c.news.unshift(`${c.name} is picked up by ${state.name} in the ${LEAGUES.state.name}.`);
    }
  } else if (c.league === "state" && (score >= 70 || (c.age >= 20 && score >= 60))) draft(c, score, r.next());
  else if (c.league === "national") {
    if (!c.captain && c.history.filter((h) => h.league === "national").length >= 3 && avg >= 7) {
      c.captain = true;
      c.news.unshift(`${c.name} is named captain!`);
    }
  }
  c.age++;
  // Decline after 30.
  if (c.age > 30) for (const a of ATTRS) c.attrs[a.id] = Math.max(30, c.attrs[a.id] - Math.round(r.next() * 2 + (c.age > 33 ? 1 : 0)));
  c.points += 5;
  c.stage = "offseason";
  c.news = c.news.slice(0, 8);
}

function draft(c: Career, score: number, roll: number) {
  const pick = clamp(Math.round(80 - score * 0.6 + roll * 8), 1, 70);
  const club = NATIONAL[(pick * 7 + Math.floor(roll * 18)) % NATIONAL.length];
  c.league = "national";
  c.club = club.id;
  c.drafted = { pick, club: club.id, year: c.year };
  c.honours.push(`Drafted, pick ${pick}, by ${club.name} (${c.year})`);
  c.news.unshift(`DRAFT NIGHT: with pick ${pick}, ${club.name} select ${c.name}!`);
}

/** Into the next season (after the off-season). */
export function nextSeason(c: Career, rounds?: number) {
  if (c.stage !== "offseason") return;
  c.year++;
  c.season = startSeason({ league: c.league, club: c.club, seed: (c.seed + c.year * 7919) >>> 0, rounds: c.league === "national" ? rounds : undefined });
  c.line = emptyLine(c.year, c.league, c.club);
  c.leader = { votes: 0, goals: 0 };
  c.stage = "season";
}

export function retire(c: Career) {
  c.stage = "retired";
  const tot = careerTotals(c);
  c.news.unshift(`${c.name} retires after ${tot.games} games and ${tot.goals} goals.`);
}

export function careerTotals(c: Career) {
  const all = [...c.history, ...(c.stage === "season" ? [c.line] : [])];
  return {
    games: all.reduce((a, l) => a + l.games, 0),
    pro: all.filter((l) => l.league === "national").reduce((a, l) => a + l.games, 0),
    goals: all.reduce((a, l) => a + l.goals, 0),
    votes: all.reduce((a, l) => a + l.votes, 0),
    flags: all.filter((l) => l.awards.some((a) => a.endsWith("premiership"))).length,
  };
}

/** Your club's position on the current ladder. */
export const ladderPosition = (c: Career) => ladder(c.season).findIndex((r) => r.id === c.club) + 1;

export function parseCareer(raw: unknown): Career | null {
  const c = raw as Career | null;
  return c && c.v === 1 && c.season && c.season.v === 2 && c.attrs ? c : null;
}
