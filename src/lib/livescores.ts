/**
 * Real sports, live: scores, clocks, play-by-play and where it's on TV, from
 * free public data (no keys, no paid plans):
 *  - ESPN's public site API (scoreboard and game summaries) for the leagues
 *    it covers;
 *  - TheSportsDB's free tier for cricket and rugby.
 * Video of the games themselves isn't free to show, so each game lists its
 * broadcasters and links to the official gamecast and highlights.
 *
 * This module is pure: league config and normalisers from the upstream
 * shapes to ours. The /api/live-scores route fetches and caches; the page
 * polls it.
 */

export type LiveState = "pre" | "in" | "post";

export interface LiveTeam {
  name: string;
  short: string;
  score: string;
  logo: string | null;
  color: string | null;
  winner: boolean;
}

export interface LiveMatch {
  id: string;
  league: string;
  state: LiveState;
  /** "Q3 4:12", "72'", "Final", "7:30 PM"... */
  detail: string;
  start: string;
  home: LiveTeam;
  away: LiveTeam;
  venue: string | null;
  broadcasts: string[];
  /** The official gamecast / match centre. */
  link: string | null;
}

export interface LivePlay {
  id: string;
  text: string;
  clock: string;
  period: string;
  scoring: boolean;
}

export interface LiveDetail {
  match: LiveMatch;
  plays: LivePlay[];
  /** Team stat rows: label, home, away. */
  stats: [string, string, string][];
  /** Official highlight clips (links out). */
  videos: { title: string; link: string }[];
}

export interface League {
  id: string;
  name: string;
  sport: string;
  source: "espn" | "tsdb";
  /** ESPN: "basketball/nba". TheSportsDB: the sport name for eventsday. */
  path: string;
}

export const LEAGUES: League[] = [
  { id: "afl", name: "AFL", sport: "Aussie rules", source: "espn", path: "australian-football/afl" },
  { id: "epl", name: "Premier League", sport: "Football", source: "espn", path: "soccer/eng.1" },
  { id: "ucl", name: "Champions League", sport: "Football", source: "espn", path: "soccer/uefa.champions" },
  { id: "aleague", name: "A-League", sport: "Football", source: "espn", path: "soccer/aus.1" },
  { id: "laliga", name: "LaLiga", sport: "Football", source: "espn", path: "soccer/esp.1" },
  { id: "mls", name: "MLS", sport: "Football", source: "espn", path: "soccer/usa.1" },
  { id: "nba", name: "NBA", sport: "Basketball", source: "espn", path: "basketball/nba" },
  { id: "wnba", name: "WNBA", sport: "Basketball", source: "espn", path: "basketball/wnba" },
  { id: "nfl", name: "NFL", sport: "American football", source: "espn", path: "football/nfl" },
  { id: "mlb", name: "MLB", sport: "Baseball", source: "espn", path: "baseball/mlb" },
  { id: "nhl", name: "NHL", sport: "Ice hockey", source: "espn", path: "hockey/nhl" },
  { id: "cricket", name: "Cricket", sport: "Cricket", source: "tsdb", path: "Cricket" },
  { id: "rugby", name: "Rugby", sport: "Rugby", source: "tsdb", path: "Rugby" },
];
export const leagueById = (id: string) => LEAGUES.find((l) => l.id === id);

const ESPN = "https://site.api.espn.com/apis/site/v2/sports";
export const espnScoreboard = (l: League) => `${ESPN}/${l.path}/scoreboard`;
export const espnSummary = (l: League, event: string) => `${ESPN}/${l.path}/summary?event=${encodeURIComponent(event)}`;
/** TheSportsDB's free key (overridable for a paid one). */
export const tsdbDay = (l: League, day: string, key = "123") => `https://www.thesportsdb.com/api/v1/json/${key}/eventsday.php?d=${day}&s=${encodeURIComponent(l.path)}`;

// ------------------------------------------------------------------ ESPN

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const httpsOnly = (u: string) => (/^https:\/\//.test(u) ? u : null);

function espnTeam(c: Json): LiveTeam {
  const t = obj(c.team);
  const color = str(t.color);
  return {
    name: str(t.displayName) || str(t.name) || "TBD",
    short: str(t.abbreviation) || str(t.shortDisplayName) || "",
    score: str(c.score),
    logo: httpsOnly(str(t.logo)),
    color: /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : null,
    winner: c.winner === true,
  };
}

function espnLink(links: unknown) {
  for (const l of arr(links)) {
    const o = obj(l);
    const rel = arr(o.rel).map(str);
    if (rel.includes("summary") || rel.includes("gamecast") || rel.includes("desktop")) {
      const h = httpsOnly(str(o.href));
      if (h) return h;
    }
  }
  return null;
}

export function espnEvent(league: string, e: Json): LiveMatch | null {
  const comp = obj(arr(e.competitions)[0]);
  const cs = arr(comp.competitors).map(obj);
  const home = cs.find((c) => c.homeAway === "home") ?? cs[0];
  const away = cs.find((c) => c.homeAway === "away") ?? cs[1];
  if (!home || !away) return null;
  const status = obj(comp.status ?? e.status);
  const type = obj(status.type);
  const state = (["pre", "in", "post"].includes(str(type.state)) ? str(type.state) : "pre") as LiveState;
  const broadcasts = new Set<string>();
  for (const b of arr(comp.broadcasts)) for (const n of arr(obj(b).names)) if (str(n)) broadcasts.add(str(n));
  for (const b of arr(comp.geoBroadcasts)) {
    const n = str(obj(obj(b).media).shortName);
    if (n) broadcasts.add(n);
  }
  return {
    id: str(e.id),
    league,
    state,
    detail: str(type.shortDetail) || str(type.detail) || str(type.description),
    start: str(e.date) || str(comp.date),
    home: espnTeam(home),
    away: espnTeam(away),
    venue: str(obj(comp.venue).fullName) || null,
    broadcasts: [...broadcasts],
    link: espnLink(e.links),
  };
}

export function espnScoreboardMatches(league: string, body: unknown): LiveMatch[] {
  return arr(obj(body).events)
    .map((e) => espnEvent(league, obj(e)))
    .filter((m): m is LiveMatch => !!m);
}

export function espnDetail(league: string, body: unknown): LiveDetail | null {
  const b = obj(body);
  const header = obj(b.header);
  const comp = obj(arr(header.competitions)[0]);
  const match = espnEvent(league, { id: header.id, competitions: [comp], links: header.links, date: comp.date });
  if (!match) return null;
  // Play-by-play: "plays" (US sports), "keyEvents" or "commentary" (football).
  const raw = arr(b.plays).length ? arr(b.plays) : arr(b.keyEvents).length ? arr(b.keyEvents) : arr(b.commentary);
  const plays: LivePlay[] = raw
    .map(obj)
    .map((p, i) => {
      const play = Object.keys(obj(p.play)).length ? obj(p.play) : p;
      const period = obj(play.period);
      return {
        id: str(play.id) || String(i),
        text: str(play.text) || str(p.text) || str(obj(play.type).text),
        clock: str(obj(play.clock).displayValue) || str(obj(p.time).displayValue),
        period: str(period.displayValue) || (period.number ? `P${str(period.number)}` : ""),
        scoring: play.scoringPlay === true || /goal|try|touchdown|home run/i.test(str(obj(play.type).text)),
      };
    })
    .filter((p) => p.text)
    .slice(-80)
    .reverse();
  // Team stats side by side.
  const teams = arr(obj(b.boxscore).teams).map(obj);
  const stats: LiveDetail["stats"] = [];
  const hs = teams.find((t) => obj(t.team).id === obj(arr(comp.competitors).map(obj).find((c) => c.homeAway === "home")?.team).id) ?? teams[1];
  const as = teams.find((t) => t !== hs) ?? teams[0];
  if (hs && as) {
    const list = (t: Json) => arr(t.statistics).map(obj);
    for (const s of list(hs).slice(0, 12)) {
      const other = list(as).find((x) => x.name === s.name);
      const label = str(s.label) || str(s.displayName) || str(s.name);
      if (label) stats.push([label, str(s.displayValue), str(other?.displayValue)]);
    }
  }
  const videos = arr(b.videos)
    .map(obj)
    .map((v) => ({ title: str(v.headline) || str(v.description), link: httpsOnly(str(obj(obj(obj(v.links).web)).href)) ?? "" }))
    .filter((v) => v.title && v.link)
    .slice(0, 6);
  return { match, plays, stats, videos };
}

// ------------------------------------------------------------ TheSportsDB

export function tsdbMatches(league: string, body: unknown): LiveMatch[] {
  return arr(obj(body).events)
    .map(obj)
    .map((e) => {
      const status = str(e.strStatus).toLowerCase();
      const hs = str(e.intHomeScore);
      const as = str(e.intAwayScore);
      const done = /finish|ft|ended|result|abandon|aet|pen/.test(status);
      const notYet = !status || /not started|ns|scheduled|tbd|postponed/.test(status);
      const state: LiveState = done ? "post" : notYet && !hs ? "pre" : "in";
      const start = str(e.strTimestamp) ? `${str(e.strTimestamp).replace(/Z?$/, "Z")}` : str(e.dateEvent) ? `${str(e.dateEvent)}T${str(e.strTime) || "00:00:00"}Z` : "";
      const team = (name: string, badge: string, score: string, other: string): LiveTeam => ({
        name: name || "TBD",
        short: name ? name.split(" ").map((w) => w[0]).join("").slice(0, 4).toUpperCase() : "",
        score,
        logo: httpsOnly(badge),
        color: null,
        winner: done && score !== "" && other !== "" && Number(score) > Number(other),
      });
      return {
        id: str(e.idEvent),
        league: str(e.strLeague) || league,
        state,
        detail: done ? (str(e.strResult).split("\n")[0] || "Final").slice(0, 80) : state === "in" ? str(e.strProgress) || str(e.strStatus) || "Live" : "",
        start,
        home: team(str(e.strHomeTeam), str(e.strHomeTeamBadge), hs, as),
        away: team(str(e.strAwayTeam), str(e.strAwayTeamBadge), as, hs),
        venue: str(e.strVenue) || null,
        broadcasts: [],
        link: str(e.idEvent) ? `https://www.thesportsdb.com/event/${str(e.idEvent)}` : null,
      } satisfies LiveMatch;
    })
    .filter((m) => m.id);
}

/** Live first, then upcoming by start time, then finished (latest first). */
export function sortMatches(list: LiveMatch[]) {
  const rank = { in: 0, pre: 1, post: 2 } as const;
  return [...list].sort((a, b) => rank[a.state] - rank[b.state] || (a.state === "post" ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));
}
