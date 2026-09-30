"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MEGA_AD_KEY } from "./MegaAd";

/** How many times the Code 3 ad has played in this browser (it plays at most 3 times). */
export const CODE3_AD_KEY = "zx-code3-ad-count";
export const CODE3_AD_RUNS = 3;
/** Total length in seconds. */
export const CODE3_AD_S = 33;

/** The beats of the spot: [start second, id]. */
const BEATS = [
  [0, "radio"],
  [4, "title"],
  [8, "city"],
  [12, "stop"],
  [16, "ticket"],
  [20, "pursuit"],
  [24, "calls"],
  [28, "weather"],
  [30.5, "end"],
] as const;
type Beat = (typeof BEATS)[number][1];

const RADIO = "DISPATCH: ANY UNIT, 2-11 IN PROGRESS, FIRST BAYVIEW BANK. SUSPECTS ARMED. RESPOND CODE 3.";

function Skyline({ className = "" }: { className?: string }) {
  // A procedural skyline with lit windows (seeded, so it is the same every time).
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const towers: { x: number; w: number; h: number }[] = [];
  for (let x = 0; x < 1600; ) {
    const w = 40 + rnd() * 90;
    towers.push({ x, w, h: 90 + rnd() * 260 });
    x += w + 4;
  }
  return (
    <svg viewBox="0 0 1600 400" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden>
      {towers.map((t, i) => (
        <g key={i}>
          <rect x={t.x} y={400 - t.h} width={t.w} height={t.h} fill={i % 3 ? "#0b1220" : "#0f172a"} />
          {Array.from({ length: Math.floor(t.h / 22) * Math.floor(t.w / 16) }, (_, k) => {
            const cols = Math.floor(t.w / 16);
            const cx = k % cols;
            const cy = Math.floor(k / cols);
            return rnd() < 0.34 ? <rect key={k} x={t.x + 5 + cx * 16} y={400 - t.h + 8 + cy * 22} width={8} height={11} fill={rnd() < 0.8 ? "#ffcf8a" : "#cfe6ff"} opacity={0.55 + rnd() * 0.45} /> : null;
          })}
        </g>
      ))}
    </svg>
  );
}

function Cruiser({ className = "", lights = true }: { className?: string; lights?: boolean }) {
  return (
    <svg viewBox="0 0 320 110" className={className} aria-hidden>
      <path d="M12 78 L20 58 Q30 50 60 48 L100 30 Q112 24 132 24 L200 24 Q222 24 236 34 L262 50 Q300 54 308 64 L312 80 Z" fill="#101318" />
      <path d="M104 34 L132 28 L198 28 L226 40 L234 50 L96 50 Z" fill="#9fb4c4" opacity=".55" />
      <path d="M40 60 L300 60 L304 74 L20 74 Z" fill="#eeeeec" />
      <text x="150" y="71" fontSize="11" fontWeight="900" fill="#12305e" textAnchor="middle" fontFamily="Arial">BAYVIEW POLICE</text>
      <circle cx="78" cy="82" r="20" fill="#0a0a0a" />
      <circle cx="78" cy="82" r="9" fill="#777" />
      <circle cx="252" cy="82" r="20" fill="#0a0a0a" />
      <circle cx="252" cy="82" r="9" fill="#777" />
      <rect x="138" y="17" width="54" height="8" rx="3" fill="#222" />
      {lights && (
        <>
          <rect className="zx-c3-red" x="140" y="18" width="24" height="6" rx="2" fill="#ff2233" />
          <rect className="zx-c3-blue" x="166" y="18" width="24" height="6" rx="2" fill="#2b5bff" />
        </>
      )}
      <rect x="302" y="62" width="10" height="6" rx="2" fill="#fff6d0" />
    </svg>
  );
}

/**
 * A 33-second cinematic spot for Code 3, shown after the intro on up to three
 * visits (never in the same visit as the one-time mega ad, never on invite
 * links). Like the mega ad it can't be skipped, but the page is released the
 * moment it ends, and the last beat links straight to the game.
 */
export function Code3Ad() {
  const [state, setState] = useState<"waiting" | "playing" | "done">("waiting");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let runs = CODE3_AD_RUNS;
    let megaDue = false;
    let thisVisit = false;
    try {
      runs = Number(localStorage.getItem(CODE3_AD_KEY) ?? "0") || 0;
      megaDue = localStorage.getItem(MEGA_AD_KEY) !== "1";
      thisVisit = sessionStorage.getItem("zx-code3-ad-session") === "1";
    } catch {
      runs = CODE3_AD_RUNS;
    }
    const invite = /[?&](room|lobby)=/.test(window.location.search);
    if (runs >= CODE3_AD_RUNS || megaDue || thisVisit || invite) {
      const t = window.setTimeout(() => setState("done"), 0);
      return () => clearTimeout(t);
    }
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.intro === "done" && !document.getElementById("zx-intro") && !document.getElementById("zx-mega-ad")) {
        clearInterval(poll);
        try {
          localStorage.setItem(CODE3_AD_KEY, String(runs + 1));
          sessionStorage.setItem("zx-code3-ad-session", "1");
        } catch {}
        setState("playing");
      }
    }, 150);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (state !== "playing") return;
    const siblings = Array.from(document.body.children).filter((el) => el.id !== "zx-code3-ad") as HTMLElement[];
    siblings.forEach((el) => (el.inert = true));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t0 = performance.now();
    const tick = window.setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      setElapsed(s);
      if (s >= CODE3_AD_S) setState("done");
    }, 100);
    return () => {
      clearInterval(tick);
      siblings.forEach((el) => (el.inert = false));
      document.body.style.overflow = prevOverflow;
    };
  }, [state]);

  if (state !== "playing") return null;

  let beat: Beat = "radio";
  for (const [at, id] of BEATS) if (elapsed >= at) beat = id;
  const left = Math.max(0, Math.ceil(CODE3_AD_S - elapsed));
  const typed = RADIO.slice(0, Math.floor(Math.min(1, elapsed / 3.2) * RADIO.length));

  return (
    <div id="zx-code3-ad" role="dialog" aria-modal="true" aria-label="Code 3 trailer" data-testid="code3-ad" className="fixed inset-0 z-[110] overflow-hidden bg-black text-white">
      <p className="sr-only" aria-live="polite">
        Code 3, the police patrol sim. {beat}
      </p>

      {beat === "radio" && (
        <div key="radio" className="zx-ad-scene absolute inset-0 grid place-items-center px-6">
          <div className="zx-c3-static absolute inset-0 opacity-20" aria-hidden />
          <div className="relative max-w-3xl">
            <p className="font-mono text-[10px] tracking-[0.4em] text-[#9cc2ff]/70">BAYVIEW PD · CH 1 · 23:47</p>
            <p className="mt-3 font-mono text-lg leading-relaxed text-[#9cc2ff] sm:text-2xl">
              {typed}
              <span className="animate-pulse">▌</span>
            </p>
          </div>
        </div>
      )}

      {beat === "title" && (
        <div key="title" className="zx-ad-scene absolute inset-0 grid place-items-center text-center">
          <div className="zx-ad-police absolute inset-0" aria-hidden />
          <div className="relative">
            <p className="zx-ad-slam font-display text-7xl font-black italic tracking-tight sm:text-[10rem]">CODE 3</p>
            <p className="zx-ad-rise mt-2 font-display text-sm font-bold uppercase tracking-[0.6em] [animation-delay:500ms]">Lights. Sirens. Justice.</p>
          </div>
        </div>
      )}

      {beat === "city" && (
        <div key="city" className="zx-ad-scene absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-[#050814] via-[#0c1630] to-[#2a1c2a]" aria-hidden />
          <Skyline className="zx-c3-pan absolute bottom-0 h-[70%] w-[160%]" />
          <Cruiser className="zx-c3-drive absolute bottom-[6%] h-[22%]" />
          <div className="relative flex h-full flex-col justify-start gap-2 px-6 pt-[12vh] sm:px-16">
            <p className="zx-ad-rise font-display text-xs font-bold uppercase tracking-[0.5em] text-[#60a5fa]">Bayview never sleeps</p>
            <h2 className="zx-ad-slam font-display text-4xl font-black uppercase italic sm:text-7xl">Patrol a living city</h2>
            <p className="zx-ad-rise max-w-lg text-sm text-white/80 [animation-delay:700ms]">Traffic, pedestrians, lights and weather that run with or without you.</p>
          </div>
        </div>
      )}

      {beat === "stop" && (
        <div key="stop" className="zx-ad-scene absolute inset-0 grid place-items-center px-6">
          <div className="zx-ad-police absolute inset-0 opacity-40" aria-hidden />
          <div className="relative grid w-full max-w-4xl gap-3 sm:grid-cols-3">
            {[
              ["Pull them over", "Lights on, they pull to the kerb. Or they run."],
              ["Run the plate", "Stolen. Expired. Registered owner wanted."],
              ["Do it by the book", "Consent, probable cause, Miranda. Or it gets thrown out."],
            ].map(([h, t], i) => (
              <div key={h} className="zx-ad-rise rounded-xl border border-[#3b82f6]/60 bg-[#0b1220]/85 p-4" style={{ animationDelay: `${i * 350}ms` }}>
                <p className="font-display text-xl font-black uppercase">{h}</p>
                <p className="mt-1 text-sm text-white/75">{t}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {beat === "ticket" && (
        <div key="ticket" className="zx-ad-scene absolute inset-0 grid place-items-center overflow-hidden px-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#1e293b,#000)]" aria-hidden />
          <div className="relative flex flex-col items-center gap-4 sm:flex-row sm:gap-10">
            <div className="zx-c3-ticket w-64 rotate-[-4deg] rounded-sm bg-[#f5f1e6] p-4 font-mono text-[11px] text-[#222] shadow-2xl">
              <p className="text-center font-bold">BAYVIEW PD · CITATION</p>
              <p className="mt-2 border-t border-dashed border-[#999] pt-2">VIOLATION: SPEEDING 52/35</p>
              <p>VIOLATION: EXPIRED REGISTRATION</p>
              <p className="mt-2 flex justify-between"><span>FINE</span><span>$285</span></p>
              <p className="mt-3 text-right italic">Ofc. 1-Adam-12</p>
            </div>
            <div className="text-center sm:text-left">
              <h2 className="zx-ad-slam font-display text-4xl font-black uppercase italic sm:text-6xl">Write the ticket</h2>
              <p className="zx-ad-rise mt-2 max-w-sm text-sm text-white/80 [animation-delay:600ms]">Speeding, red lights, parking, jaywalking. Pick the charges, set the fine, hand it over.</p>
            </div>
          </div>
        </div>
      )}

      {beat === "pursuit" && (
        <div key="pursuit" className="zx-ad-scene absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-[#02040b] to-[#101a2e]" aria-hidden />
          <Skyline className="zx-c3-pan-fast absolute bottom-[18%] h-[55%] w-[200%] opacity-70" />
          <div className="absolute inset-x-0 bottom-0 h-[20%] bg-[#1a1c20]" aria-hidden>
            <div className="zx-c3-road absolute top-1/2 h-1.5 w-[200%] -translate-y-1/2" />
          </div>
          <Cruiser className="zx-c3-chase absolute bottom-[10%] h-[18%]" />
          <div className="zx-ad-police absolute inset-0 opacity-50 mix-blend-screen" aria-hidden />
          <div className="relative flex h-full flex-col justify-start gap-2 px-6 pt-[10vh] sm:px-16">
            <h2 className="zx-ad-slam font-display text-5xl font-black uppercase italic sm:text-8xl">Pursuit</h2>
            <p className="zx-ad-rise font-display text-lg font-bold uppercase tracking-wide sm:text-2xl [animation-delay:400ms]">PIT. Spike strips. Roadblocks. Air-1.</p>
            <p className="zx-ad-rise font-display text-lg font-bold uppercase tracking-wide sm:text-2xl [animation-delay:900ms]">Felony stops by the book.</p>
          </div>
        </div>
      )}

      {beat === "calls" && (
        <div key="calls" className="zx-ad-scene absolute inset-0 grid place-items-center px-6">
          <div className="zx-ad-rays absolute inset-0 opacity-60" aria-hidden />
          <div className="relative w-full max-w-3xl">
            <h2 className="zx-ad-slam text-center font-display text-3xl font-black uppercase italic sm:text-5xl">Every call counts</h2>
            <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {["Armed robbery", "Officer needs assistance", "Shots fired", "Wanted fugitive", "Street racing", "Domestic", "Road rage", "Hit and run", "Bank alarm"].map((c, i) => (
                <li key={c} className="zx-ad-rise rounded border-l-4 border-[#ef4444] bg-black/70 px-3 py-2 text-xs font-bold uppercase tracking-wider sm:text-sm" style={{ animationDelay: `${i * 160}ms` }}>
                  Code 3 · {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {beat === "weather" && (
        <div key="weather" className="zx-ad-scene absolute inset-0 grid grid-cols-2 sm:grid-cols-4">
          {[
            ["Day", "from-[#7fb2e5] to-[#dbe9f7]", "text-[#0b1220]"],
            ["Night", "from-[#02040b] to-[#1b2340]", "text-white"],
            ["Rain", "from-[#2b3340] to-[#56606e]", "text-white"],
            ["Fog", "from-[#9aa3ab] to-[#c7ccd1]", "text-[#0b1220]"],
          ].map(([t, g, c], i) => (
            <div key={t} className={`zx-ad-rise grid place-items-center bg-gradient-to-b ${g}`} style={{ animationDelay: `${i * 200}ms` }}>
              <p className={`font-display text-3xl font-black uppercase italic sm:text-5xl ${c}`}>{t}</p>
            </div>
          ))}
        </div>
      )}

      {beat === "end" && (
        <div key="end" className="zx-ad-scene absolute inset-0 grid place-items-center px-6 text-center">
          <div className="zx-ad-police absolute inset-0 opacity-70" aria-hidden />
          <div className="relative flex flex-col items-center">
            <p className="zx-ad-slam font-display text-6xl font-black italic sm:text-9xl">CODE 3</p>
            <p className="zx-ad-rise mt-2 font-display text-sm font-bold uppercase tracking-[0.5em]">Play free now · Zero X Gaming</p>
            <Link
              href="/games/code-3"
              onClick={() => setState("done")}
              className="zx-ad-rise mt-6 rounded-md bg-[#2563eb] px-6 py-3 font-display text-base font-black uppercase tracking-[0.2em] text-white shadow-[0_0_24px_#2563eb88] [animation-delay:500ms]"
            >
              Start your shift
            </Link>
          </div>
        </div>
      )}

      <div className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1 font-display text-xs font-bold tracking-wider">Ad · {left}s</div>
      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10" aria-hidden>
        <div className="h-full bg-gradient-to-r from-[#ef4444] to-[#3b82f6]" style={{ width: `${Math.min(100, (elapsed / CODE3_AD_S) * 100)}%` }} />
      </div>
    </div>
  );
}
