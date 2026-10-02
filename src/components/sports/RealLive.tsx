"use client";

import { useCallback, useEffect, useState } from "react";
import { LEAGUES, type LiveDetail, type LiveMatch, type LiveTeam } from "@/lib/livescores";

const REFRESH_MS = 30_000;

type Board = { league: string; updated: string; matches: LiveMatch[] };

async function load<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || "Live scores are unavailable right now.");
  return body;
}

/** Re-runs `fn` every REFRESH_MS while the tab is visible, and on return to it. */
function usePoll(fn: () => void, deps: unknown[]) {
  useEffect(() => {
    fn();
    const id = setInterval(() => document.visibilityState === "visible" && fn(), REFRESH_MS);
    const back = () => document.visibilityState === "visible" && fn();
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", back);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller lists what fn depends on
  }, deps);
}

const kickoff = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
};

function StateTag({ m }: { m: LiveMatch }) {
  if (m.state === "in")
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.15em] text-red-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
        {m.detail || "Live"}
      </span>
    );
  return <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted">{m.state === "post" ? m.detail || "Final" : kickoff(m.start) || m.detail}</span>;
}

function TeamRow({ t, live }: { t: LiveTeam; live: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${t.winner ? "font-bold" : ""}`}>
      {t.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- team logos from the data source's CDN
        <img src={t.logo} alt="" width={24} height={24} loading="lazy" referrerPolicy="no-referrer" className="h-6 w-6 shrink-0 object-contain" />
      ) : (
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-black text-white" style={{ background: t.color ?? "#334155" }} aria-hidden>
          {t.short.slice(0, 3)}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{t.name}</span>
      <span className={`font-mono tabular-nums ${live ? "text-cyan" : ""}`}>{t.score}</span>
    </div>
  );
}

function Detail({ league, match, onClose }: { league: string; match: LiveMatch; onClose: () => void }) {
  const [detail, setDetail] = useState<LiveDetail | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(() => {
    load<LiveDetail>(`/api/live-scores?league=${league}&event=${encodeURIComponent(match.id)}`)
      .then((d) => {
        setDetail(d);
        setError("");
      })
      .catch((e: Error) => setError(e.message));
  }, [league, match.id]);
  usePoll(refresh, [refresh]);
  const m = detail?.match ?? match;
  const live = m.state === "in";
  return (
    <section aria-labelledby="real-detail-title" className="rounded-xl border border-border bg-surface p-4" data-testid="real-detail">
      <div className="flex items-start justify-between gap-2">
        <div>
          <StateTag m={m} />
          <h3 id="real-detail-title" className="mt-1 font-display text-xl font-bold uppercase tracking-wide">
            {m.away.name} <span className="text-muted">at</span> {m.home.name}
          </h3>
          {m.venue && <p className="text-xs text-muted">{m.venue}</p>}
        </div>
        <button type="button" onClick={onClose} className="rounded border border-border px-2 py-1 text-xs font-bold uppercase hover:border-border-strong">
          Close
        </button>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
        <p className="truncate font-semibold">{m.away.short || m.away.name}</p>
        <p className={`font-mono text-3xl font-black tabular-nums ${live ? "text-cyan" : ""}`} data-testid="real-detail-score">
          {m.away.score || "–"} <span className="text-muted">-</span> {m.home.score || "–"}
        </p>
        <p className="truncate font-semibold">{m.home.short || m.home.name}</p>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
        <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-magenta">Where to watch</h4>
        {m.broadcasts.length ? (
          <ul className="mt-1 flex flex-wrap gap-1.5" data-testid="real-broadcasts">
            {m.broadcasts.map((b) => (
              <li key={b} className="rounded bg-black/40 px-2 py-0.5 text-xs font-semibold">
                {b}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted">Check your local listings or the league&apos;s official app.</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {m.link && (
            <a href={m.link} target="_blank" rel="noopener noreferrer" className="rounded bg-cyan px-3 py-1.5 text-xs font-bold uppercase text-black hover:opacity-90">
              Official match centre ↗
            </a>
          )}
        </div>
      </div>

      {error && !detail && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {detail && detail.videos.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted">Highlights</h4>
          <ul className="mt-1 space-y-1">
            {detail.videos.map((v) => (
              <li key={v.link}>
                <a href={v.link} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan hover:underline">
                  ▶ {v.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail && detail.stats.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted">Team stats</h4>
          <table className="mt-1 w-full text-sm" data-testid="real-stats">
            <thead className="sr-only">
              <tr>
                <th>{m.home.name}</th>
                <th>Stat</th>
                <th>{m.away.name}</th>
              </tr>
            </thead>
            <tbody>
              {detail.stats.map(([label, h, a]) => (
                <tr key={label} className="border-t border-border/60">
                  <td className="py-1 font-mono tabular-nums">{h}</td>
                  <td className="py-1 text-center text-xs text-muted">{label}</td>
                  <td className="py-1 text-right font-mono tabular-nums">{a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4">
        <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted">Play by play</h4>
        {detail && detail.plays.length ? (
          <ol className="mt-1 max-h-72 space-y-1 overflow-y-auto pr-1 text-sm" data-testid="real-plays" aria-live="polite">
            {detail.plays.map((p) => (
              <li key={p.id} className={`rounded px-2 py-1 ${p.scoring ? "bg-cyan/10 font-semibold" : ""}`}>
                <span className="mr-2 font-mono text-xs text-muted">{[p.period, p.clock].filter(Boolean).join(" ")}</span>
                {p.text}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-xs text-muted">{detail ? "No play-by-play for this one yet." : "Loading…"}</p>
        )}
      </div>
    </section>
  );
}

/**
 * Real sport, as it happens: scores, clocks, play-by-play and where it's on,
 * from free public data via /api/live-scores. Live video of the real thing
 * isn't free to show, so each match links out to the official match centre.
 */
export function RealLive({ initial = "afl" }: { initial?: string }) {
  const [league, setLeague] = useState(LEAGUES.some((l) => l.id === initial) ? initial : "afl");
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<LiveMatch | null>(null);

  const refresh = useCallback(() => {
    load<Board>(`/api/live-scores?league=${league}`)
      .then((b) => {
        setBoard(b);
        setError("");
      })
      .catch((e: Error) => setError(e.message));
  }, [league]);
  usePoll(refresh, [refresh]);

  const pick = (id: string) => {
    if (id === league) return;
    setLeague(id);
    setBoard(null);
    setOpen(null);
    setError("");
  };
  const matches = board?.league === league ? board.matches : null;
  const liveCount = matches?.filter((m) => m.state === "in").length ?? 0;

  return (
    <section aria-labelledby="real-title" className="mx-auto max-w-7xl px-4 sm:px-6" data-testid="real-live">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan">Real sport</p>
          <h2 id="real-title" className="font-display text-2xl font-black uppercase italic tracking-tight sm:text-3xl">
            Live scores
          </h2>
          <p className="max-w-2xl text-sm text-muted">Real games around the world: live scores, play by play and where to watch. Updates every 30 seconds.</p>
        </div>
        {board?.updated && matches && (
          <p className="text-xs text-muted" data-testid="real-updated">
            {liveCount ? `${liveCount} live · ` : ""}Updated {new Date(board.updated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
          </p>
        )}
      </div>

      <div role="tablist" aria-label="Leagues" className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-2">
        {LEAGUES.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={l.id === league}
            onClick={() => pick(l.id)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
              l.id === league ? "border-cyan bg-cyan text-black" : "border-border bg-surface hover:border-border-strong"
            }`}
          >
            {l.name}
          </button>
        ))}
      </div>

      <div className={`mt-2 grid gap-4 ${open ? "lg:grid-cols-[1fr_26rem]" : ""}`}>
        <div>
          {error && !matches && (
            <div role="alert" className="rounded-xl border border-border bg-surface p-4 text-sm">
              <p>{error}</p>
              <button type="button" onClick={() => refresh()} className="mt-2 rounded border border-border px-3 py-1 text-xs font-bold uppercase hover:border-border-strong">
                Try again
              </button>
            </div>
          )}
          {!matches && !error && (
            <p role="status" className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
              Loading scores…
            </p>
          )}
          {matches && matches.length === 0 && <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">No games today in this league. Try another.</p>}
          {matches && matches.length > 0 && (
            <ul className={`grid gap-2 sm:grid-cols-2 ${open ? "" : "lg:grid-cols-3"}`} data-testid="real-matches">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(m)}
                    aria-pressed={open?.id === m.id}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${open?.id === m.id ? "border-cyan bg-surface-2" : "border-border bg-surface hover:border-border-strong"}`}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <StateTag m={m} />
                      {m.broadcasts[0] && <span className="truncate text-[10px] uppercase text-muted">📺 {m.broadcasts.slice(0, 2).join(", ")}</span>}
                    </div>
                    <div className="space-y-1 text-sm">
                      <TeamRow t={m.away} live={m.state === "in"} />
                      <TeamRow t={m.home} live={m.state === "in"} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {open && <Detail key={`${league}:${open.id}`} league={league} match={open} onClose={() => setOpen(null)} />}
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Data from free public sources (ESPN, TheSportsDB). Logos and names belong to their leagues and clubs. Zero X Gaming doesn&apos;t stream real games; follow the links to watch on official broadcasters.
      </p>
    </section>
  );
}
