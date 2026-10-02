import type { NextRequest } from "next/server";
import { espnDetail, espnScoreboard, espnScoreboardMatches, espnSummary, leagueById, sortMatches, tsdbDay, tsdbMatches } from "@/lib/livescores";

/**
 * Real live scores, proxied from free public sources and cached briefly, so
 * every visitor shares one upstream request per league every ~20 seconds.
 *   GET /api/live-scores?league=nba             → today's games
 *   GET /api/live-scores?league=nba&event=123   → one game: plays, stats, clips
 */
const LIVE_S = 20;

async function getJson(url: string) {
  const res = await fetch(url, { next: { revalidate: LIVE_S }, headers: { accept: "application/json", "user-agent": "ZeroXGaming/1.0 (+live scores)" } });
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  return res.json() as Promise<unknown>;
}

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": status === 200 ? `public, s-maxage=${LIVE_S}, stale-while-revalidate=${LIVE_S * 3}` : "no-store" } });

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const league = leagueById(q.get("league") ?? "");
  if (!league) return reply({ error: "Unknown league" }, 400);
  const event = q.get("event");
  if (event && !/^[A-Za-z0-9-]{1,24}$/.test(event)) return reply({ error: "Bad event id" }, 400);
  try {
    if (league.source === "espn") {
      if (event) {
        const d = espnDetail(league.name, await getJson(espnSummary(league, event)));
        return d ? reply(d) : reply({ error: "No such game" }, 404);
      }
      const matches = sortMatches(espnScoreboardMatches(league.name, await getJson(espnScoreboard(league))));
      return reply({ league: league.id, updated: new Date().toISOString(), matches });
    }
    // TheSportsDB: today's and yesterday's games (UTC), so evening results stay up.
    const key = process.env.THESPORTSDB_KEY || "123";
    const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const lists = await Promise.all([day(0), day(-1)].map((d) => getJson(tsdbDay(league, d, key)).then((b) => tsdbMatches(league.name, b)).catch(() => [])));
    const seen = new Set<string>();
    const matches = sortMatches(lists.flat().filter((m) => !seen.has(m.id) && seen.add(m.id))).slice(0, 40);
    if (event) {
      const m = matches.find((x) => x.id === event);
      return m ? reply({ match: m, plays: [], stats: [], videos: [] }) : reply({ error: "No such game" }, 404);
    }
    return reply({ league: league.id, updated: new Date().toISOString(), matches });
  } catch {
    return reply({ error: "Live scores are unavailable right now." }, 502);
  }
}
