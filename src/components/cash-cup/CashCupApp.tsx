"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoinIcon } from "@/components/shop/Coin";
import { CUP_BOUNTY, CUP_ENTRY, CUP_FIELD, CUP_FREE_WITH_PASS, CUP_PRIZES, cupPrize, ordinal } from "@/lib/cash-cup";
import { cashCupStatus, enterCashCup, finishCashCup, type CupStatus } from "@/lib/season-client";
import { formatNumber } from "@/lib/format";
import { useAuth } from "@/store/auth";
import { useSettings } from "@/store/settings";
import type { GameModule } from "@/games/types";
import type { MatchStats } from "@/games/neon-siege/royale";
import { readGraphics, writeGraphics, type Graphics } from "@/games/neon-siege/loadout";

/**
 * Cash Cup: the tournament app. A cinematic intro, a loading screen while the
 * arena and the 3D engine load, then a reveal into the lobby. Enter (10 ZX
 * Cash, or a battle pass free entry), drop into a 55-player Neon Siege
 * tournament on the Cash Cup Arena, and the prize is counted out at the end
 * (after a champion's celebration, for a win).
 */

type Phase = "intro" | "loading" | "reveal" | "lobby" | "ticket" | "match" | "victory" | "payout";

const TIPS = [
  "The Arena is four towns wide: the storm waits longer and closes slower.",
  `Every elimination pays a ${CUP_BOUNTY} ZX Cash bounty, on top of your place.`,
  "Top 15 get paid. 1st takes 250 ZX Cash.",
  "Chests hold the best guns. The towns' centres have the most.",
  `Battle pass holders get ${CUP_FREE_WITH_PASS} free entries every season.`,
  "Cash Cups are played on Hard. Bring your aim.",
];

const reduced = () => {
  if (typeof window === "undefined") return false;
  return useSettings.getState().reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

function playerName() {
  const username = useAuth.getState().profile?.username;
  if (username) return username;
  try {
    return sessionStorage.getItem("zx-guest-name") ?? "You";
  } catch {
    return "You";
  }
}

export function CashCupApp() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [progress, setProgress] = useState(0);
  const [tip, setTip] = useState(0);
  const [status, setStatus] = useState<CupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<{ id: number; free: boolean } | null>(null);
  const [payout, setPayout] = useState<{ stats: MatchStats | null; prize: number | null; error?: string } | null>(null);
  const [paused, setPaused] = useState(false);
  const authStatus = useAuth((s) => s.status);
  const host = useRef<HTMLDivElement>(null);
  const mod = useRef<GameModule | null>(null);
  const loaded = useRef<Promise<typeof import("@/games/cash-cup/match")> | null>(null);
  const won = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await cashCupStatus());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the Cash Cup.");
    }
  }, []);

  // Intro → loading → reveal → lobby.
  useEffect(() => {
    if (phase !== "intro") return;
    const t = window.setTimeout(() => setPhase("loading"), reduced() ? 300 : 3200);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "loading" || authStatus === "loading") return;
    let live = true;
    const started = performance.now();
    const min = reduced() ? 400 : 2600;
    loaded.current ??= import("@/games/cash-cup/match");
    const status = cashCupStatus()
      .then((st) => live && setStatus(st))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't load the Cash Cup."));
    const steps: Promise<unknown>[] = [loaded.current, import("@/games/neon-siege/render3d").catch(() => null), status];
    let done = 0;
    for (const p of steps) void p.then(() => (done += 1));
    const tick = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - started) / min);
      // Real progress drives it; the clock keeps it moving smoothly.
      setProgress(Math.min(t, (done + t) / (steps.length + 0.0001)) * 100);
    }, 50);
    const tips = window.setInterval(() => setTip((i) => (i + 1) % TIPS.length), 1400);
    void Promise.all(steps).then(async () => {
      const left = min - (performance.now() - started);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      if (!live) return;
      setProgress(100);
      setPhase("reveal");
      window.setTimeout(() => live && setPhase("lobby"), reduced() ? 50 : 1100);
    });
    return () => {
      live = false;
      window.clearInterval(tick);
      window.clearInterval(tips);
    };
  }, [phase, authStatus]);

  const endMatch = useCallback(
    (entry: number, stats: MatchStats | null) => {
      won.current = stats?.placement === 1;
      setPayout({ stats, prize: null });
      if (!stats) return setPayout({ stats, prize: 0, error: "No result to report." });
      finishCashCup(entry, { placement: stats.placement, kills: stats.kills, damage: stats.damage, chests: stats.chests, survivedS: stats.survivedS })
        .then((r) => setPayout({ stats, prize: r.prize }))
        .catch((e) => setPayout({ stats, prize: 0, error: e instanceof Error ? e.message : "Couldn't report the result." }));
    },
    [],
  );

  const teardown = useCallback(() => {
    mod.current?.destroy();
    mod.current = null;
    setPaused(false);
  }, []);
  useEffect(() => teardown, [teardown]);

  // Drop into the match once the ticket animation has played.
  useEffect(() => {
    if (phase !== "ticket" || !ticket) return;
    const t = window.setTimeout(async () => {
      const { cupMatch } = await (loaded.current ??= import("@/games/cash-cup/match"));
      setPhase("match");
      await new Promise((r) => requestAnimationFrame(r));
      if (!host.current) return;
      const m = cupMatch({ name: playerName(), onEnd: (stats) => endMatch(ticket.id, stats) });
      const { sound, volume, reduceMotion, keybindings } = useSettings.getState();
      m.init({
        root: host.current,
        settings: { sound, volume, reduceMotion: reduceMotion || reduced(), keybindings },
        requestPause: () => {
          m.pause();
          setPaused(true);
        },
        playerName: playerName(),
      });
      m.onScore((e) => {
        if (e.kind !== "final") return;
        teardown();
        setPhase(won.current ? "victory" : "payout");
      });
      mod.current = m;
      m.start();
    }, reduced() ? 200 : 1900);
    return () => window.clearTimeout(t);
  }, [phase, ticket, endMatch, teardown]);

  // Test hook (?cup=test): finish the running cup with these stats.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("cup")) return;
    (window as unknown as { __cashCup?: object }).__cashCup = {
      finish: (stats: MatchStats) => {
        if (!ticket) return;
        endMatch(ticket.id, stats);
        teardown();
        setPhase(won.current ? "victory" : "payout");
      },
    };
  }, [ticket, endMatch, teardown]);

  const enter = async () => {
    setBusy(true);
    setError(null);
    try {
      const t = await enterCashCup();
      setTicket({ id: t.id, free: t.free });
      setPayout(null);
      setPhase("ticket");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't enter. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const backToLobby = () => {
    setPhase("lobby");
    void refresh();
  };

  const leave = () => {
    teardown();
    setPayout({ stats: null, prize: 0, error: "You left the match: the entry is forfeited." });
    setPhase("payout");
  };

  return (
    <div className="zx-cc fixed inset-0 z-[70] overflow-hidden bg-[#030806] text-white" data-testid="cash-cup" data-phase={phase}>
      {phase === "intro" && <Intro onSkip={() => setPhase("loading")} />}
      {phase === "loading" && <Loading progress={progress} tip={TIPS[tip]} />}
      {(phase === "reveal" || phase === "lobby") && (
        <Lobby status={status} error={error} busy={busy} onEnter={() => void enter()} revealing={phase === "reveal"} />
      )}
      {phase === "ticket" && ticket && <Ticket free={ticket.free} />}
      {phase === "match" && (
        <>
          <div ref={host} className="absolute inset-0" data-testid="cash-cup-match" />
          {paused && (
            <div className="absolute inset-0 z-40 grid place-items-center bg-black/70 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#10b981]/40 bg-[#06120d] p-6 text-center">
                <p className="font-display text-2xl font-black uppercase tracking-widest">Paused</p>
                <p className="max-w-xs text-sm text-white/70">The tournament carries on when you come back. Leaving forfeits your entry.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-[#10b981] px-5 py-2 font-display text-sm font-bold uppercase tracking-wider text-[#022c22]"
                    onClick={() => {
                      setPaused(false);
                      mod.current?.resume();
                    }}
                  >
                    Resume
                  </button>
                  <button type="button" className="rounded-full border border-white/25 px-5 py-2 text-sm font-semibold hover:border-white/60" onClick={leave}>
                    Leave the cup
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {phase === "victory" && payout && <Victory payout={payout} onCollect={() => setPhase("payout")} />}
      {phase === "payout" && payout && <Payout payout={payout} onDone={backToLobby} />}
    </div>
  );
}

// ------------------------------------------------------------------ intro

function Intro({ onSkip }: { onSkip: () => void }) {
  return (
    <button type="button" className="absolute inset-0 grid cursor-default place-items-center" onClick={onSkip} aria-label="Skip the intro" data-testid="cash-cup-intro">
      <span className="zx-cc-beams" aria-hidden />
      <span className="zx-cc-shock" aria-hidden />
      <span className="relative flex flex-col items-center">
        <span className="zx-cc-mark">
          <CoinIcon className="h-24 w-24 sm:h-32 sm:w-32" />
        </span>
        <span className="mt-4 flex gap-3 font-display text-6xl font-black italic tracking-tight sm:text-8xl">
          <span className="zx-cc-word" style={{ animationDelay: "0.9s" }}>
            CASH
          </span>
          <span className="zx-cc-word text-[#10b981]" style={{ animationDelay: "1.15s" }}>
            CUP
          </span>
        </span>
        <span className="zx-cc-sub mt-3 text-xs font-bold uppercase tracking-[0.6em] text-[#f5c542] sm:text-sm">Neon Siege tournaments</span>
      </span>
      <span className="absolute bottom-6 text-[11px] uppercase tracking-[0.4em] text-white/40">Tap to skip</span>
    </button>
  );
}

// ---------------------------------------------------------------- loading

function Loading({ progress, tip }: { progress: number; tip: string }) {
  return (
    <div className="zx-cc-fade absolute inset-0 flex flex-col items-center justify-center gap-6 px-6" role="status" aria-label="Loading the Cash Cup" data-testid="cash-cup-loading">
      <div className="zx-cc-grid absolute inset-0 opacity-40" aria-hidden />
      <div className="relative">
        <span className="zx-cc-orbit absolute -inset-6 rounded-full border-2 border-dashed border-[#10b981]/50" aria-hidden />
        <span className="zx-cc-spin block">
          <CoinIcon className="h-20 w-20" />
        </span>
      </div>
      <p className="relative font-display text-sm font-bold uppercase tracking-[0.5em] text-white/80">Loading the arena</p>
      <div className="relative h-2 w-[min(80vw,26rem)] overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-[#10b981] via-[#34d399] to-[#f5c542] transition-[width] duration-200" style={{ width: `${progress}%` }} />
      </div>
      <p className="relative font-mono text-xs text-white/50">{Math.round(progress)}% · Cash Cup Arena · 144 × 144</p>
      <p key={tip} className="zx-cc-tip relative max-w-md text-center text-sm text-white/75">
        {tip}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ lobby

function Lobby({ status, error, busy, onEnter, revealing }: { status: CupStatus | null; error: string | null; busy: boolean; onEnter: () => void; revealing: boolean }) {
  const free = (status?.freeLeft ?? 0) > 0;
  const short = !free && (status?.coins ?? 0) < CUP_ENTRY;
  return (
    <div className={`absolute inset-0 overflow-y-auto ${revealing ? "zx-cc-reveal" : ""}`} data-testid="cash-cup-lobby">
      {revealing && <span className="zx-cc-flash pointer-events-none fixed inset-0 z-10" aria-hidden />}
      <div className="zx-cc-grid pointer-events-none fixed inset-0 opacity-25" aria-hidden />
      <div className="relative mx-auto flex min-h-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 hover:border-white/40">
            ← Zero X
          </Link>
          <p className="flex items-center gap-2 font-display text-lg font-black italic tracking-tight">
            <CoinIcon className="h-6 w-6" /> CASH <span className="text-[#10b981]">CUP</span>
          </p>
          <p className="flex items-center gap-1.5 rounded-full border border-[#10b981]/40 bg-[#10b981]/10 px-3 py-1.5 text-sm font-bold tabular-nums" data-testid="cash-cup-balance">
            <CoinIcon /> {formatNumber(status?.coins ?? 0)}
            <span className="sr-only"> ZX Cash</span>
          </p>
        </header>

        <section className="zx-cc-hero relative overflow-hidden rounded-3xl border border-[#10b981]/40 p-5 sm:p-8">
          <span className="zx-cc-beams opacity-40" aria-hidden />
          <div className="relative grid gap-5 md:grid-cols-[1.4fr_1fr] md:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.4em] text-[#f5c542]">Tournament · now open</p>
              <h1 className="mt-2 font-display text-4xl font-black uppercase italic leading-none sm:text-6xl">
                Cash Cup <span className="text-[#10b981]">Arena</span>
              </h1>
              <p className="mt-3 max-w-lg text-sm text-white/75">
                {CUP_FIELD} fighters, four towns stitched into one map four times the size of Ground Zero, a storm that takes its time and a purse to match. Played on Hard. Last one standing takes {CUP_PRIZES[0][2]} ZX Cash.
              </p>
              <dl className="mt-4 flex flex-wrap gap-2 text-xs">
                {[
                  ["Fighters", String(CUP_FIELD)],
                  ["Map", "144 × 144"],
                  ["Difficulty", "Hard"],
                  ["Bounty", `+${CUP_BOUNTY} / kill`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5">
                    <dt className="text-[10px] uppercase tracking-wider text-white/50">{k}</dt>
                    <dd className="font-display font-bold">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="flex flex-col items-stretch gap-2">
              <button
                type="button"
                onClick={onEnter}
                disabled={busy || !status || short}
                className="zx-cc-cta rounded-2xl bg-[#10b981] px-6 py-4 font-display text-lg font-black uppercase tracking-wider text-[#022c22] disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="cash-cup-enter"
              >
                {busy ? "Entering…" : free ? `Enter free · ${status?.freeLeft} left` : `Enter · ${CUP_ENTRY} ZX Cash`}
              </button>
              <p className="text-center text-xs text-white/60" data-testid="cash-cup-free">
                {status?.hasPass
                  ? `Battle pass: ${status.freeLeft} of ${CUP_FREE_WITH_PASS} free entries left this season.`
                  : `The battle pass gives ${CUP_FREE_WITH_PASS} free entries a season.`}
              </p>
              {short && (
                <p className="text-center text-xs text-[#fca5a5]">
                  You need {CUP_ENTRY - (status?.coins ?? 0)} more ZX Cash.{" "}
                  <Link href="/" className="underline">
                    Claim your daily reward
                  </Link>
                </p>
              )}
              {status?.open && <p className="text-center text-xs text-white/50">An unfinished entry is forfeited when you enter again.</p>}
              <GraphicsPicker />
              {error && (
                <p className="text-center text-xs text-[#fca5a5]" role="alert">
                  {error}
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-labelledby="cc-prizes">
            <h2 id="cc-prizes" className="text-xs font-bold uppercase tracking-[0.3em] text-[#f5c542]">
              The purse
            </h2>
            <ol className="mt-3 flex flex-col gap-1.5">
              {CUP_PRIZES.map(([a, b, v], i) => (
                <li key={a} className={`flex items-center justify-between rounded-lg px-3 py-2 ${i === 0 ? "bg-gradient-to-r from-[#f5c542]/25 to-transparent" : "bg-white/[0.04]"}`}>
                  <span className="font-display font-bold">{a === b ? ordinal(a) : `${ordinal(a)}–${ordinal(b)}`}</span>
                  <span className="flex items-center gap-1.5 font-display font-black tabular-nums">
                    <CoinIcon /> {v}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-white/50">Plus {CUP_BOUNTY} ZX Cash for every elimination. The free Cash Cup every third Neon Siege match still pays 50 · 20 · 5.</p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-labelledby="cc-history">
            <h2 id="cc-history" className="text-xs font-bold uppercase tracking-[0.3em] text-[#10b981]">
              Your cups
            </h2>
            {!status?.history.length ? (
              <p className="mt-3 text-sm text-white/60">No cups yet. Your results land here.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1.5" data-testid="cash-cup-history">
                {status.history.map((h) => (
                  <li key={h.at} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-sm">
                    <span className="font-display font-bold">{h.placement ? `${ordinal(h.placement)} of ${CUP_FIELD}` : "Forfeited"}</span>
                    <span className="text-xs text-white/50">
                      {h.placement ? `${h.kills} kills` : ""}
                      {h.free ? " · free entry" : ""}
                    </span>
                    <span className={`flex items-center gap-1 font-bold tabular-nums ${h.prize ? "text-[#34d399]" : "text-white/40"}`}>
                      +{h.prize}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <p className="pb-4 text-center text-[11px] text-white/40">Entries and prizes are checked on the server. One cup at a time.</p>
      </div>
    </div>
  );
}

function GraphicsPicker() {
  const [gfx, setGfx] = useState<Graphics>(() => (typeof window === "undefined" ? "high" : readGraphics(window.matchMedia("(pointer: coarse)").matches)));
  return (
    <div className="mt-1 flex items-center justify-center gap-1.5 text-xs" role="group" aria-label="Graphics">
      <span className="text-white/50">Graphics</span>
      {(["high", "low", "2d"] as const).map((g) => (
        <button
          key={g}
          type="button"
          aria-pressed={gfx === g}
          onClick={() => {
            writeGraphics(g);
            setGfx(g);
          }}
          className={`rounded-full border px-2.5 py-0.5 font-semibold ${gfx === g ? "border-[#10b981] text-[#34d399]" : "border-white/15 text-white/70 hover:border-white/40"}`}
        >
          {g === "2d" ? "Classic 2D" : g === "high" ? "High" : "Low"}
        </button>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------- ticket

function Ticket({ free }: { free: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center" data-testid="cash-cup-ticket">
      <span className="zx-cc-beams" aria-hidden />
      <div className="zx-cc-ticket relative flex w-[min(86vw,22rem)] flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[#10b981] bg-[#06120d] px-6 py-7 text-center">
        <CoinIcon className="h-12 w-12" />
        <p className="font-display text-2xl font-black uppercase italic">Entry confirmed</p>
        <p className="text-sm text-white/70">{free ? "Battle pass free entry" : `${CUP_ENTRY} ZX Cash paid`}</p>
        <p className="zx-cc-stamp absolute -right-3 -top-4 rotate-12 rounded-md border-2 border-[#f5c542] px-2 py-0.5 font-display text-sm font-black uppercase text-[#f5c542]">Good luck</p>
        <p className="mt-2 text-xs uppercase tracking-[0.4em] text-white/50">Dropping into the arena</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- victory

const CONFETTI = ["#10b981", "#f5c542", "#ffffff", "#34d399", "#fde68a"];

/** 1st place: gold beams, a trophy slamming down, CHAMPION letter by letter, confetti and falling coins. */
function Victory({ payout, onCollect }: { payout: { stats: MatchStats | null; prize: number | null }; onCollect: () => void }) {
  const s = payout.stats;
  const still = reduced();
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden bg-[#0a0700]" data-testid="cash-cup-victory">
      <span className="zx-cc-beams zx-cc-gold-beams" aria-hidden />
      <span className="zx-cc-beams zx-cc-gold-beams zx-cc-gold-beams-back" aria-hidden />
      <span className="zx-cc-gold-glow absolute inset-0" aria-hidden />
      {!still && (
        <>
          <span className="zx-cc-shock zx-cc-gold-shock" aria-hidden />
          <span className="zx-cc-shock zx-cc-gold-shock" style={{ animationDelay: "0.95s" }} aria-hidden />
          <Confetti />
          <span className="zx-cc-flash zx-cc-gold-flash absolute inset-0" aria-hidden />
        </>
      )}
      <div className="relative flex flex-col items-center gap-2 px-4 text-center">
        <Trophy />
        <p className="zx-cc-sub text-xs font-bold uppercase tracking-[0.5em] text-[#fde68a]" style={{ animationDelay: "0.5s" }}>
          Cash Cup
        </p>
        <h2 className="flex font-display text-5xl font-black italic tracking-tight text-[#f5c542] drop-shadow-[0_0_30px_rgba(245,197,66,0.65)] sm:text-7xl" aria-label="Champion">
          {"CHAMPION".split("").map((c, i) => (
            <span key={i} className="zx-cc-word" style={{ animationDelay: `${0.75 + i * 0.07}s` }} aria-hidden>
              {c}
            </span>
          ))}
        </h2>
        {s && (
          <p className="zx-cc-sub text-sm font-semibold text-white/80" style={{ animationDelay: "1.5s" }}>
            Last one standing of {s.players} · {s.kills} elimination{s.kills === 1 ? "" : "s"}
          </p>
        )}
        <div className="zx-cc-sub mt-4" style={{ animationDelay: "2.1s" }}>
          <button
            type="button"
            onClick={onCollect}
            disabled={payout.prize === null}
            className="zx-cc-cta flex items-center gap-2 rounded-full bg-[#f5c542] px-6 py-3 font-display text-sm font-black uppercase tracking-wider text-[#2a1d00] disabled:opacity-60"
            data-testid="cash-cup-collect"
          >
            <CoinIcon className="h-5 w-5" />
            {payout.prize === null ? "Counting your winnings…" : `Collect ${payout.prize} ZX Cash`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Trophy() {
  return (
    <div className="zx-cc-trophy relative" aria-hidden>
      <svg viewBox="0 0 120 120" className="h-32 w-32 drop-shadow-[0_0_40px_rgba(245,197,66,0.7)] sm:h-44 sm:w-44">
        <defs>
          <linearGradient id="cc-gold" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#fff3b0" />
            <stop offset="0.45" stopColor="#f5c542" />
            <stop offset="1" stopColor="#a16207" />
          </linearGradient>
        </defs>
        <path d="M30 16h60v22a30 30 0 0 1-60 0z" fill="url(#cc-gold)" />
        <path d="M30 24H16v8a18 18 0 0 0 18 18M90 24h14v8a18 18 0 0 1-18 18" fill="none" stroke="url(#cc-gold)" strokeWidth="7" strokeLinecap="round" />
        <path d="M54 66h12v18H54z" fill="#ca8a04" />
        <path d="M38 84h44l4 14H34z" fill="url(#cc-gold)" />
        <rect x="30" y="98" width="60" height="10" rx="3" fill="#10b981" />
        <text x="60" y="48" textAnchor="middle" fontSize="28" fontWeight="900" fill="#7c4a03" fontFamily="system-ui, sans-serif">1</text>
      </svg>
      <span className="zx-cc-glint absolute inset-0" />
    </div>
  );
}

function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: 70 }, (_, i) => {
        const coin = i % 9 === 0;
        return (
          <span
            key={i}
            className="zx-cc-confetti absolute top-0"
            style={{
              left: `${(i * 37) % 100}%`,
              animationDelay: `${0.6 + ((i * 0.13) % 2.6)}s`,
              animationDuration: `${2.6 + (i % 5) * 0.45}s`,
              ["--sway" as string]: `${(i % 2 ? 1 : -1) * (4 + (i % 4) * 3)}vw`,
            }}
          >
            {coin ? (
              <CoinIcon className="h-5 w-5" />
            ) : (
              <span className="block h-3 w-1.5 rounded-sm" style={{ background: CONFETTI[i % CONFETTI.length], transform: `rotate(${i * 29}deg)` }} />
            )}
          </span>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------- payout

function Payout({ payout, onDone }: { payout: { stats: MatchStats | null; prize: number | null; error?: string }; onDone: () => void }) {
  const [counted, setShown] = useState(0);
  const prize = payout.prize;
  const instant = prize === 0 || reduced();
  const shown = instant ? (prize ?? 0) : counted;
  useEffect(() => {
    if (prize === null || instant) return;
    const start = performance.now();
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / 1400);
      setShown(Math.round(prize * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [prize, instant]);
  const s = payout.stats;
  const win = s?.placement === 1;
  return (
    <div className="zx-cc-fade absolute inset-0 grid place-items-center overflow-y-auto px-4 py-8" data-testid="cash-cup-payout">
      {!!prize && <Burst />}
      <div className="relative flex w-full max-w-md flex-col items-center gap-3 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.5em] text-[#f5c542]">{win ? "Champion" : "Cup over"}</p>
        <p className={`zx-cc-word font-display text-7xl font-black italic ${win ? "text-[#f5c542]" : ""}`}>{s ? `#${s.placement}` : "—"}</p>
        {s && (
          <p className="text-sm text-white/70">
            {ordinal(s.placement)} of {s.players} · {s.kills} eliminations · {Math.round(s.damage)} damage
          </p>
        )}
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-[#10b981]/40 bg-[#10b981]/10 px-6 py-4">
          <CoinIcon className="h-10 w-10" />
          <span className="font-display text-5xl font-black tabular-nums" data-testid="cash-cup-prize">
            {prize === null ? "…" : `+${shown}`}
          </span>
        </div>
        {s && prize !== null && !payout.error && (
          <p className="text-xs text-white/50">
            {prize - s.kills * CUP_BOUNTY > 0
              ? `${prize - s.kills * CUP_BOUNTY} for ${ordinal(s.placement)}${s.kills ? ` + ${s.kills * CUP_BOUNTY} in bounties` : ""}`
              : s.kills
                ? `${s.kills * CUP_BOUNTY} in bounties. Top 15 also win a placement prize (15th pays ${cupPrize(15, 0)}).`
                : `Top 15 win a placement prize, and every elimination pays ${CUP_BOUNTY}.`}
          </p>
        )}
        {payout.error && (
          <p className="text-sm text-[#fca5a5]" role="alert">
            {payout.error}
          </p>
        )}
        <button type="button" onClick={onDone} disabled={prize === null} className="mt-3 rounded-full bg-[#10b981] px-6 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-[#022c22] disabled:opacity-50" data-testid="cash-cup-done">
          Back to the lobby
        </button>
      </div>
    </div>
  );
}

function Burst() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2;
        const r = 30 + (i % 5) * 8;
        return (
          <span
            key={i}
            className="zx-cc-coin absolute left-1/2 top-1/2"
            style={{ ["--dx" as string]: `${Math.cos(a) * r}vmin`, ["--dy" as string]: `${Math.sin(a) * r}vmin`, animationDelay: `${(i % 7) * 60}ms` }}
          >
            <CoinIcon className="h-6 w-6" />
          </span>
        );
      })}
    </div>
  );
}
