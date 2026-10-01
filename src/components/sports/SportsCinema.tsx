"use client";

import { useEffect, useState } from "react";
import { SPORTS } from "@/lib/sports";
import { SportsArt } from "./SportsArt";

/**
 * Shared scenes for the Sports+ cinema (the welcome after you buy the pass,
 * and the Sports+ ad): floodlights snapping on, the oval drawing itself, the
 * logo slam, a fly-through of every sport, and a goal from Screamer.
 * Pure SVG and CSS (classes `zx-sp-*` in globals.css), no video files.
 */

/** Seconds since `running` became true, ticking ten times a second. */
export function useTimeline(running: boolean) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t0 = performance.now();
    const id = window.setInterval(() => setT((performance.now() - t0) / 1000), 100);
    return () => clearInterval(id);
  }, [running]);
  return running ? t : 0;
}

/** Which beat we're on: the last [start, id] whose start has passed. */
export function beatAt<T extends string>(beats: readonly (readonly [number, T])[], t: number): T {
  let b = beats[0][1];
  for (const [at, id] of beats) if (t >= at) b = id;
  return b;
}

/** Letterbox bars, film grain and a vignette over a scene. */
export function Frame({ children, label, testId }: { children: React.ReactNode; label: string; testId: string }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={label} data-testid={testId} className="zx-sp-bars fixed inset-0 z-[120] overflow-hidden bg-black text-white">
      {children}
      <div className="pointer-events-none absolute -inset-[10%] z-30 zx-sp-grain" aria-hidden />
      <div className="pointer-events-none absolute inset-0 z-30 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.75))]" aria-hidden />
    </div>
  );
}

const TOWERS = [90, 300, 520, 1080, 1300, 1510];

/** A dark stadium whose six light towers flick on one by one. */
export function Floodlights({ delay = 0.3, gap = 0.45 }: { delay?: number; gap?: number }) {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="sp-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6dc" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff6dc" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="sp-glow">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".25" stopColor="#fff3cc" stopOpacity=".8" />
          <stop offset="1" stopColor="#fff3cc" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sp-grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f5e2a" />
          <stop offset="1" stopColor="#0b2410" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="#03050a" />
      {/* Stands: tiers of seats in silhouette. */}
      <path d="M0 520 Q800 360 1600 520 L1600 900 L0 900 Z" fill="#0a0d14" />
      {Array.from({ length: 9 }, (_, i) => (
        <path key={i} d={`M0 ${540 + i * 14} Q800 ${385 + i * 14} 1600 ${540 + i * 14}`} stroke="#141a26" strokeWidth="3" fill="none" />
      ))}
      <ellipse cx="800" cy="760" rx="900" ry="210" fill="url(#sp-grass)" className="zx-sp-cone" style={{ animationDelay: `${delay + gap * 3}s` }} />
      {TOWERS.map((x, i) => {
        const d = `${delay + i * gap}s`;
        const top = 80 + Math.abs(i - 2.5) * 22;
        return (
          <g key={x}>
            <rect x={x - 6} y={top} width="12" height={520 - top} fill="#1c2230" />
            <path d={`M${x - 46} ${top + 30} L${x + 46} ${top + 30} L${800 + (x - 800) * 0.25 + 260} 900 L${800 + (x - 800) * 0.25 - 260} 900 Z`} fill="url(#sp-cone)" className="zx-sp-cone" style={{ animationDelay: d }} />
            <rect x={x - 50} y={top - 6} width="100" height="40" rx="4" fill="#20242c" />
            <g className="zx-sp-light" style={{ animationDelay: d }}>
              {Array.from({ length: 12 }, (_, k) => (
                <circle key={k} cx={x - 40 + (k % 6) * 16} cy={top + 4 + Math.floor(k / 6) * 16} r="6" fill="#fffbea" />
              ))}
              <circle cx={x} cy={top + 14} r="140" fill="url(#sp-glow)" opacity=".85" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** The oval drawing itself in perspective: boundary, centre square and circle, 50 m arcs, posts rising. */
export function OvalDraw() {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="sp-turf" cx="50%" cy="55%" r="60%">
          <stop offset="0" stopColor="#2f7d39" />
          <stop offset="1" stopColor="#0b2410" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="#03050a" />
      <ellipse cx="800" cy="520" rx="760" ry="300" fill="url(#sp-turf)" className="zx-sp-cone" />
      <g opacity=".05">
        <g className="zx-sp-cone" style={{ animationDelay: "0.3s" }}>
          {Array.from({ length: 10 }, (_, i) => (
            <rect key={i} x={40 + i * 152} y="220" width="76" height="600" fill="#fff" />
          ))}
        </g>
      </g>
      <g fill="none" stroke="#f6f6f0" strokeWidth="5" strokeLinecap="round">
        <ellipse cx="800" cy="520" rx="700" ry="270" className="zx-sp-draw" style={{ ["--len" as string]: 3100 }} />
        <path d="M640 455 L960 455 L1010 585 L590 585 Z" className="zx-sp-draw" style={{ ["--len" as string]: 1300, animationDelay: "0.5s" }} />
        <ellipse cx="800" cy="520" rx="44" ry="18" className="zx-sp-draw" style={{ ["--len" as string]: 220, animationDelay: "0.8s" }} />
        <path d="M130 360 Q420 520 130 680" className="zx-sp-draw" style={{ ["--len" as string]: 600, animationDelay: "0.9s" }} />
        <path d="M1470 360 Q1180 520 1470 680" className="zx-sp-draw" style={{ ["--len" as string]: 600, animationDelay: "0.9s" }} />
      </g>
      {[100, 1500].map((x) =>
        [-46, -16, 16, 46].map((o, k) => (
          <rect key={`${x}${o}`} x={x + o * (x < 800 ? 0.6 : -0.6) - 3} y={k === 0 || k === 3 ? 400 : 320} width="6" height={k === 0 || k === 3 ? 120 : 200} fill="#fff" className="zx-sp-rise-post" style={{ animationDelay: `${1.4 + k * 0.08}s` }} />
        )),
      )}
    </svg>
  );
}

const SPARKS = Array.from({ length: 36 }, (_, i) => {
  const a = (i / 36) * Math.PI * 2 + (i % 3) * 0.2;
  const r = 180 + ((i * 53) % 220);
  return { dx: `${Math.cos(a) * r}px`, dy: `${Math.sin(a) * r * 0.7}px`, s: 4 + (i % 4) * 2, c: i % 4 === 0 ? "#22d3ee" : i % 5 === 0 ? "#e879f9" : "#f2c230" };
});

/** SPORTS+ slammed into frame with shockwaves and a spray of gold sparks. */
export function LogoSlam({ sub }: { sub?: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#1a2a52_0%,#05070c_60%)]" aria-hidden />
      <div className="zx-ad-rays absolute inset-0 opacity-40" aria-hidden />
      {[0, 0.18, 0.36].map((d) => (
        <span key={d} className="zx-sp-ring absolute top-1/2 left-1/2 h-[40vmin] w-[40vmin] rounded-full border-4 border-[#f2c230]/70" style={{ animationDelay: `${0.45 + d}s` }} aria-hidden />
      ))}
      {SPARKS.map((p, i) => (
        <span
          key={i}
          className="zx-sp-spark absolute top-1/2 left-1/2 rounded-full"
          style={{ width: p.s, height: p.s, background: p.c, boxShadow: `0 0 12px ${p.c}`, ["--dx" as string]: p.dx, ["--dy" as string]: p.dy, animationDelay: "0.5s" }}
          aria-hidden
        />
      ))}
      <div className="relative text-center">
        <p className="zx-sp-slam font-display text-[18vw] leading-none font-black uppercase italic tracking-tighter drop-shadow-[0_0_40px_rgba(242,194,48,0.35)] sm:text-[12rem]">
          Sports
          <span className="zx-sp-plus ml-1 text-[#f2c230]" style={{ animationDelay: "0.2s" }}>
            +
          </span>
        </p>
        {sub && <p className="zx-ad-rise mt-3 font-display text-sm font-bold uppercase tracking-[0.55em] text-white/85 [animation-delay:1100ms] sm:text-base">{sub}</p>}
      </div>
      <div className="zx-sp-sweep pointer-events-none absolute inset-0" style={{ animationDelay: "0.9s" }} aria-hidden />
    </div>
  );
}

const SLOTS = [
  ["-38vw", "-18vh", "35deg"],
  ["34vw", "-22vh", "-30deg"],
  ["-30vw", "20vh", "25deg"],
  ["36vw", "18vh", "-35deg"],
  ["-8vw", "-30vh", "10deg"],
  ["10vw", "28vh", "-12deg"],
  ["-40vw", "2vh", "40deg"],
  ["40vw", "0vh", "-40deg"],
] as const;

/** Every Sports+ game flying past the camera, with the line over the top. */
export function SportsTunnel({ words }: { words: string[] }) {
  return (
    <div className="absolute inset-0 overflow-hidden [perspective:900px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#0e1a33,#020308_70%)]" aria-hidden />
      <div className="absolute inset-0 grid place-items-center [transform-style:preserve-3d]">
        {SPORTS.map((g, i) => {
          const [x, y, r] = SLOTS[i % SLOTS.length];
          return (
            <div
              key={g.id}
              className="zx-sp-fly absolute w-[34vmin] overflow-hidden rounded-xl border border-white/20 shadow-[0_0_40px_rgba(0,0,0,0.6)]"
              style={{ ["--x" as string]: x, ["--y" as string]: y, ["--r" as string]: r, animationDelay: `${i * 0.42}s` }}
              aria-hidden
            >
              <SportsArt game={g} className="block h-auto w-full" />
            </div>
          );
        })}
      </div>
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-1 text-center">
        {words.map((w, i) => (
          <p key={w} className="zx-sp-word font-display text-5xl font-black uppercase italic tracking-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)] sm:text-8xl" style={{ animationDelay: `${0.4 + i * 1.3}s` }}>
            {w}
          </p>
        ))}
      </div>
    </div>
  );
}

/** Screamer: a floodlit oval, a drop punt tumbling through the big sticks, GOAL. */
export function ScreamerShot({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" className="zx-sp-kenburns absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="sp-night" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#050a18" />
            <stop offset=".55" stopColor="#13213d" />
            <stop offset=".56" stopColor="#2c7a36" />
            <stop offset="1" stopColor="#174d21" />
          </linearGradient>
        </defs>
        <rect width="800" height="450" fill="url(#sp-night)" />
        {/* Crowd: rows of dots catching the light. */}
        {Array.from({ length: 220 }, (_, i) => (
          <circle key={i} cx={(i * 37) % 800} cy={170 + ((i * 13) % 70)} r="2.2" fill={["#a3122c", "#f2c230", "#e5e7eb", "#1a2d68", "#64748b"][i % 5]} opacity=".55" />
        ))}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <rect key={i} x={i * 100} y="248" width="50" height="202" fill="#fff" opacity=".04" />
        ))}
        {/* Goal posts at the far end. */}
        {[
          [655, 150, 3],
          [690, 95, 4],
          [740, 95, 4],
          [775, 150, 3],
        ].map(([x, y, w]) => (
          <rect key={x} x={x} y={y} width={w} height={300 - y} fill="#f8fafc" />
        ))}
        <path d="M610 300 L800 300" stroke="#fff" strokeOpacity=".6" strokeWidth="2" />
        {/* A player follows through. */}
        <g transform="translate(120 250)">
          <circle cx="0" cy="-58" r="9" fill="#d9a07a" />
          <path d="M-12 -48 h24 l4 30 h-32 z" fill="#a3122c" />
          <path d="M-12 -34 h24 v6 h-24 z" fill="#f2c230" />
          <path d="M-8 -18 l-6 34 M8 -18 l30 -18" stroke="#15171d" strokeWidth="8" strokeLinecap="round" />
          <path d="M-12 -44 l-22 18 M12 -44 l20 -12" stroke="#d9a07a" strokeWidth="6" strokeLinecap="round" />
        </g>
      </svg>
      {/* The ball, end over end along its arc (same 800×450 frame). */}
      <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
        <g className="zx-sp-ball" style={{ animationDelay: "0.5s" }}>
          <g className="zx-sp-tumble">
            <ellipse cx="0" cy="0" rx="14" ry="9" fill="#b3261e" stroke="#fff" strokeOpacity=".8" strokeWidth="1.5" />
            <path d="M-6 -3 L6 -3" stroke="#fff" strokeWidth="1.5" />
          </g>
        </g>
      </svg>
      <div className="zx-sp-flash pointer-events-none absolute inset-0 bg-white" style={{ animationDelay: "2.15s" }} aria-hidden />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="zx-sp-stamp font-display text-6xl font-black italic text-[#f2c230] drop-shadow-[0_6px_30px_rgba(0,0,0,0.9)] sm:text-9xl" style={{ animationDelay: "2.2s" }}>
          GOAL!
        </p>
      </div>
      <div className="absolute inset-x-0 bottom-[11vh] px-6 text-center">
        <p className="zx-ad-rise font-display text-2xl font-black uppercase italic sm:text-5xl [animation-delay:2600ms]">{title}</p>
        <p className="zx-ad-rise mt-1 text-xs font-bold uppercase tracking-[0.4em] text-white/80 sm:text-sm [animation-delay:3000ms]">{sub}</p>
      </div>
    </div>
  );
}

/** A synthesized score for the cinema: booms, a riser, the impact, whooshes and a crowd roar. */
export class CinemaSound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  constructor(volume: number) {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.55 * volume;
      this.out.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.05 * w) / 1.05;
        d[i] = last * 3 + w * 0.15;
      }
    } catch {
      this.ctx = null;
    }
  }

  private tone(at: number, f0: number, f1: number, dur: number, peak: number, type: OscillatorType = "sine") {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private hiss(at: number, dur: number, f0: number, f1: number, peak: number, attack: number) {
    const ctx = this.ctx;
    if (!ctx || !this.out || !this.noise) return;
    const t = ctx.currentTime + at;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.out);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  /** Floodlights banging on. */
  boom(at = 0) {
    this.tone(at, 90, 32, 0.9, 0.7);
    this.hiss(at, 0.25, 3000, 800, 0.15, 0.005);
  }
  riser(at: number, dur: number) {
    this.hiss(at, dur, 300, 4000, 0.35, dur * 0.9);
    this.tone(at, 110, 440, dur, 0.12, "sawtooth");
  }
  impact(at = 0) {
    this.tone(at, 70, 25, 1.6, 0.9);
    this.tone(at, 220, 110, 0.8, 0.25, "triangle");
    this.hiss(at, 1.4, 1800, 300, 0.4, 0.01);
    // A bright chord on top.
    for (const f of [523, 659, 784, 1046]) this.tone(at + 0.05, f, f, 2.2, 0.07, "triangle");
  }
  whoosh(at = 0) {
    this.hiss(at, 0.5, 400, 2400, 0.25, 0.3);
  }
  roar(at = 0) {
    this.hiss(at, 4, 450, 900, 0.6, 0.3);
    this.hiss(at, 4, 1000, 1600, 0.25, 0.4);
  }
  thud(at = 0) {
    this.tone(at, 150, 45, 0.15, 0.6);
  }
  close() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
