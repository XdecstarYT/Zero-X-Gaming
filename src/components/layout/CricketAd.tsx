"use client";

import Link from "next/link";
import { beatAt, Floodlights, Frame, LogoSlam, useTimeline } from "@/components/sports/SportsCinema";
import { useAdTurn } from "./ad-turn";

/** How many times the Boundary Blitz spot has played in this browser (it plays twice). */
export const CRICKET_AD_KEY = "zx-cricket-ad-count";
export const CRICKET_AD_RUNS = 2;
export const CRICKET_AD_S = 24;

const BEATS = [
  [0, "cold"],
  [4.5, "logo"],
  [7.5, "title"],
  [11, "six"],
  [15.5, "words"],
  [18.5, "yorker"],
  [21.5, "end"],
] as const;

const COLD = "THE LIGHTS ARE ON. THE ROPE IS SIXTY-FIVE METRES AWAY.";

/** Three stumps and two bails; `fly` sends them cartwheeling. */
function Stumps({ fly, delay = 0 }: { fly?: boolean; delay?: number }) {
  return (
    <g>
      {[-34, 0, 34].map((x, i) => (
        <rect
          key={x}
          x={x - 7}
          y={-200}
          width="14"
          height="200"
          rx="5"
          fill="#f1ead6"
          className={fly ? "zx-ck-stump" : undefined}
          style={fly ? { ["--r" as string]: `${[-38, 12, 44][i]}deg`, ["--dx" as string]: `${[-60, 10, 90][i]}px`, animationDelay: `${delay}s` } : undefined}
        />
      ))}
      {[-17, 17].map((x, i) => (
        <rect
          key={x}
          x={x - 22}
          y={-212}
          width="44"
          height="10"
          rx="5"
          fill="#e11d48"
          className={fly ? "zx-ck-bail" : undefined}
          style={fly ? { ["--dx" as string]: `${i ? 180 : -160}px`, ["--dy" as string]: `${i ? -260 : -220}px`, ["--r" as string]: `${i ? 540 : -480}deg`, animationDelay: `${delay}s` } : undefined}
        />
      ))}
    </g>
  );
}

/** A night stadium from behind the batter: the swing, the ball sailing over the rope into the crowd. */
function SixShot({ t }: { t: number }) {
  const dist = Math.min(94, Math.max(0, Math.round((t - 0.6) * 60)));
  return (
    <div className="absolute inset-0 overflow-hidden">
      <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" className="zx-sp-kenburns absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="ck-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#040814" />
            <stop offset=".45" stopColor="#101c38" />
            <stop offset=".46" stopColor="#226b31" />
            <stop offset="1" stopColor="#123d1c" />
          </linearGradient>
        </defs>
        <rect width="800" height="450" fill="url(#ck-sky)" />
        {Array.from({ length: 260 }, (_, i) => (
          <circle key={i} cx={(i * 31) % 800} cy={120 + ((i * 17) % 80)} r="2.2" fill={["#0e7490", "#f97316", "#e5e7eb", "#facc15", "#64748b"][i % 5]} opacity=".6" />
        ))}
        {[60, 230, 570, 740].map((x) => (
          <g key={x}>
            <rect x={x - 3} y="20" width="6" height="110" fill="#1c2230" />
            <rect x={x - 22} y="12" width="44" height="14" rx="3" fill="#fffbea" />
            <circle cx={x} cy="19" r="40" fill="#fff3cc" opacity=".25" />
          </g>
        ))}
        <path d="M0 206 Q400 186 800 206" stroke="#f8fafc" strokeOpacity=".8" strokeWidth="3" fill="none" />
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={i * 80} y="208" width="40" height="242" fill="#fff" opacity=".035" />
        ))}
        <path d="M360 450 L388 260 L412 260 L440 450 Z" fill="#c9b27a" />
        {/* The batter, follow-through. */}
        <g transform="translate(400 420)">
          <circle cx="0" cy="-120" r="14" fill="#0e7490" />
          <path d="M-18 -104 h36 l6 52 h-48 z" fill="#0e7490" />
          <path d="M-14 -52 l-12 52 M14 -52 l10 52" stroke="#f4f4f2" strokeWidth="14" strokeLinecap="round" />
          <path d="M14 -98 l40 -48" stroke="#c68c5d" strokeWidth="8" strokeLinecap="round" />
          <path d="M52 -146 l60 -70" stroke="#e3c48f" strokeWidth="12" strokeLinecap="round" />
        </g>
      </svg>
      <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
        <g className="zx-ck-six" style={{ animationDelay: "0.4s" }}>
          <circle r="7" fill="#fff" />
          <circle r="16" fill="#fffbe6" opacity=".35" />
        </g>
      </svg>
      <div className="zx-sp-flash pointer-events-none absolute inset-0 bg-white" style={{ animationDelay: "2.1s" }} aria-hidden />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="zx-sp-stamp font-display text-7xl font-black italic text-[#facc15] drop-shadow-[0_6px_30px_rgba(0,0,0,0.9)] sm:text-[10rem]" style={{ animationDelay: "2.15s" }}>
          SIX!
        </p>
      </div>
      <div className="absolute top-[13vh] left-6 rounded bg-black/60 px-3 py-2 font-mono text-sm sm:left-12">
        <p className="text-[10px] tracking-[0.3em] text-white/60">DISTANCE</p>
        <p className="font-display text-3xl font-black tabular-nums text-[#22d3ee]">{dist} m</p>
      </div>
    </div>
  );
}

/**
 * A 24-second spot for Boundary Blitz (Sports+ cricket), the first in the ad
 * queue: it plays after the intro on two visits, one ad per visit, then hands
 * the slot to the Clanforge spot. Unskippable like the other spots; the last
 * beat links to the game.
 */
export function CricketAd() {
  const ad = useAdTurn({ name: "cricketAd", elementId: "zx-cricket-ad", countKey: CRICKET_AD_KEY, sessionKey: "zx-cricket-ad-session", runs: CRICKET_AD_RUNS, seconds: CRICKET_AD_S });
  const t = useTimeline(ad.playing);
  if (!ad.playing) return null;
  const beat = beatAt(BEATS, t);
  const left = Math.max(0, Math.ceil(CRICKET_AD_S - t));
  const typed = COLD.slice(0, Math.floor(Math.min(1, Math.max(0, t - 0.8) / 2.6) * COLD.length));
  const start = BEATS.find((b) => b[1] === beat)![0];

  return (
    <div id="zx-cricket-ad">
      <Frame label="Boundary Blitz trailer" testId="cricket-ad">
        <p className="sr-only" aria-live="polite">
          Boundary Blitz, T20 cricket on Sports+. {beat}
        </p>
        {beat === "cold" && (
          <div key="cold" className="absolute inset-0">
            <Floodlights delay={0.2} gap={0.45} />
            <div className="absolute inset-x-0 bottom-[16vh] px-6 text-center">
              <p className="font-display text-xl font-black uppercase italic tracking-wide drop-shadow-[0_2px_16px_rgba(0,0,0,0.9)] sm:text-4xl">
                {typed}
                <span className="animate-pulse text-[#22d3ee]">▌</span>
              </p>
            </div>
          </div>
        )}
        {beat === "logo" && (
          <div key="logo" className="absolute inset-0">
            <LogoSlam sub="presents" />
          </div>
        )}
        {beat === "title" && (
          <div key="title" className="absolute inset-0 grid place-items-center text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,#0e3a4a,#03050a_65%)]" aria-hidden />
            <div className="zx-ad-rays absolute inset-0 opacity-30" aria-hidden />
            <svg viewBox="-200 -260 400 280" className="absolute bottom-[12vh] left-1/2 h-[32vh] -translate-x-1/2" aria-hidden>
              <Stumps fly delay={0.9} />
            </svg>
            <div className="relative -mt-[18vh]">
              <p className="zx-sp-slam font-display text-[13vw] leading-[0.9] font-black uppercase italic tracking-tighter drop-shadow-[0_0_40px_rgba(34,211,238,0.35)] sm:text-[9rem]">
                Boundary
                <br />
                <span className="text-[#22d3ee]">Blitz</span>
              </p>
              <p className="zx-ad-rise mt-3 font-display text-sm font-bold uppercase tracking-[0.55em] text-white/85 [animation-delay:1200ms]">T20 cricket under lights</p>
            </div>
          </div>
        )}
        {beat === "six" && (
          <div key="six" className="absolute inset-0">
            <SixShot t={t - start} />
          </div>
        )}
        {beat === "words" && (
          <div key="words" className="absolute inset-0 grid place-items-center px-6 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#123d1c,#03050a_70%)]" aria-hidden />
            <div className="relative flex flex-col items-center">
              {["Time it.", "Loft it.", "Clear the rope."].map((w, i) => (
                <p key={w} className="zx-sp-word font-display text-5xl font-black uppercase italic sm:text-8xl" style={{ animationDelay: `${0.2 + i * 0.85}s`, color: i === 2 ? "#facc15" : undefined }}>
                  {w}
                </p>
              ))}
            </div>
          </div>
        )}
        {beat === "yorker" && (
          <div key="yorker" className="absolute inset-0 grid place-items-center text-center">
            <div className="absolute inset-0 bg-[linear-gradient(#040814_0%,#0b1f14_55%,#1d5a2a_56%,#0f3a1a_100%)]" aria-hidden />
            <svg viewBox="-400 -300 800 340" className="absolute inset-x-0 bottom-[6vh] mx-auto h-[60vh]" aria-hidden>
              <path d="M-140 40 L-60 -40 L60 -40 L140 40 Z" fill="#c9b27a" />
              <Stumps fly delay={0.75} />
              <g className="zx-ck-yorker">
                <circle r="9" fill="#fff" />
              </g>
            </svg>
            <div className="relative -mt-[30vh]">
              <p className="zx-ad-rise font-display text-lg font-bold uppercase tracking-[0.45em] text-white/80">Then bowl the yorker</p>
              <p className="zx-sp-stamp mt-2 font-display text-6xl font-black italic text-[#ef4444] sm:text-8xl" style={{ animationDelay: "1s" }}>
                BOWLED HIM!
              </p>
            </div>
          </div>
        )}
        {beat === "end" && (
          <div key="end" className="absolute inset-0 grid place-items-center px-6 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,#0e3a4a,#03050a_65%)]" aria-hidden />
            <div className="zx-ad-rays absolute inset-0 opacity-30" aria-hidden />
            <div className="relative flex flex-col items-center">
              <p className="zx-ad-slam font-display text-6xl font-black uppercase italic tracking-tight sm:text-8xl">
                Boundary <span className="text-[#22d3ee]">Blitz</span>
              </p>
              <p className="zx-ad-rise mt-2 font-display text-xs font-bold uppercase tracking-[0.45em] text-white/80 [animation-delay:400ms] sm:text-sm">T20 · Super overs · The nets · Now on Sports+</p>
              <Link
                href="/games/boundary-blitz"
                onClick={ad.stop}
                className="zx-ad-rise mt-6 rounded-md bg-[#22d3ee] px-6 py-3 font-display text-sm font-black uppercase tracking-[0.2em] text-[#05070c] shadow-[0_0_30px_#22d3ee88] [animation-delay:900ms]"
              >
                Play Boundary Blitz
              </Link>
            </div>
          </div>
        )}
        <div className="absolute top-[calc(9vh+0.75rem)] right-3 z-40 rounded-full bg-black/60 px-3 py-1 font-display text-xs font-bold tracking-wider">Ad · {left}s</div>
        <div className="absolute inset-x-0 bottom-[9vh] z-40 h-0.5 bg-white/10" aria-hidden>
          <div className="h-full bg-gradient-to-r from-[#22d3ee] to-[#f97316]" style={{ width: `${Math.min(100, (t / CRICKET_AD_S) * 100)}%` }} />
        </div>
      </Frame>
    </div>
  );
}
