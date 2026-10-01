"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/store/auth";
import { useSettings } from "@/store/settings";
import { beatAt, CinemaSound, Floodlights, Frame, LogoSlam, OvalDraw, ScreamerShot, SportsTunnel, useTimeline } from "./SportsCinema";
import { useSportsPassStore } from "./use-sports-pass";

const BEATS = [
  [0, "lights"],
  [3.2, "oval"],
  [6, "logo"],
  [10, "tunnel"],
  [14.4, "screamer"],
  [19.4, "card"],
] as const;
export const INDUCTION_S = 19.4;

/**
 * The Sports+ welcome: plays the moment you buy the pass. The stadium lights
 * bang on, the oval draws itself, SPORTS+ slams in, every sport flies past,
 * Screamer kicks a goal, and your all-access pass is handed over.
 * Skippable; the last card stays until you choose where to go.
 */
export function SportsInduction() {
  const active = useSportsPassStore((s) => s.induction);
  const end = useSportsPassStore((s) => s.endInduction);
  const [skipped, setSkipped] = useState(false);
  const t = useTimeline(active);
  const sound = useRef<CinemaSound | null>(null);
  const name = useAuth((s) => s.profile?.username) ?? "Guest";
  const [number] = useState(() => String(10000 + Math.floor(Math.random() * 89999)));

  // The score, scheduled up front (the purchase click unlocks audio).
  useEffect(() => {
    if (!active) return;
    const { sound: on, volume } = useSettings.getState();
    if (on && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const s = new CinemaSound(volume);
      for (let i = 0; i < 6; i++) s.boom(0.3 + i * 0.45);
      s.riser(4.4, 1.9);
      s.impact(6.45);
      for (let i = 0; i < 8; i++) s.whoosh(10.3 + i * 0.42);
      s.thud(14.9);
      s.roar(16.55);
      s.impact(19.5);
      sound.current = s;
    }
    const siblings = Array.from(document.body.children).filter((el) => el.id !== "zx-sports-induction") as HTMLElement[];
    siblings.forEach((el) => (el.inert = true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      sound.current?.close();
      sound.current = null;
      siblings.forEach((el) => (el.inert = false));
      document.body.style.overflow = prev;
      setSkipped(false);
    };
  }, [active]);

  if (!active) return null;
  const beat = skipped ? "card" : beatAt(BEATS, t);
  const skip = () => {
    sound.current?.close();
    sound.current = null;
    setSkipped(true);
  };

  return (
    <div id="zx-sports-induction">
      <Frame label="Welcome to Sports+" testId="sports-induction">
        <p className="sr-only" aria-live="polite">
          {beat === "card" ? "Welcome to Sports+. Your all-access pass is ready." : "Welcome to Sports+."}
        </p>
        {beat === "lights" && (
          <div key="lights" className="absolute inset-0">
            <Floodlights />
            <p className="zx-ad-rise absolute inset-x-0 bottom-[14vh] text-center font-display text-xs font-bold uppercase tracking-[0.6em] text-white/70 [animation-delay:1800ms]">Pass confirmed</p>
          </div>
        )}
        {beat === "oval" && (
          <div key="oval" className="absolute inset-0">
            <OvalDraw />
            <div className="absolute inset-0 grid place-items-center">
              <p className="zx-sp-track font-display text-2xl font-black uppercase text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.9)] sm:text-5xl">Welcome to</p>
            </div>
          </div>
        )}
        {beat === "logo" && (
          <div key="logo" className="absolute inset-0">
            <LogoSlam sub="You're in" />
          </div>
        )}
        {beat === "tunnel" && (
          <div key="tunnel" className="absolute inset-0">
            <SportsTunnel words={["Every sport.", "One pass."]} />
          </div>
        )}
        {beat === "screamer" && (
          <div key="screamer" className="absolute inset-0">
            <ScreamerShot title="Screamer: Aussie Rules" sub="Unlocked · play it now" />
          </div>
        )}
        {beat === "card" && (
          <div key="card" className="absolute inset-0 grid place-items-center overflow-auto px-4 py-[11vh]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,#1a2a52,#03050a_70%)]" aria-hidden />
            <div className="zx-ad-rays absolute inset-0 opacity-25" aria-hidden />
            <div className="relative flex w-full max-w-md flex-col items-center text-center">
              {/* The pass: a holographic all-access card. */}
              <div className="zx-sp-card relative aspect-[1.586] w-full max-w-sm rounded-2xl p-[2px] shadow-[0_30px_80px_rgba(0,0,0,0.7)]">
                <div className="zx-sp-holo absolute inset-0 rounded-2xl opacity-90" aria-hidden />
                <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-[14px] bg-[#070b16]/92 p-4 text-left">
                  <div className="zx-sp-sweep pointer-events-none absolute inset-0" style={{ animationDelay: "1s" }} aria-hidden />
                  <span className="pointer-events-none absolute -right-6 -bottom-16 font-display text-[12rem] leading-none font-black text-[#f2c230]/[0.07]" aria-hidden>
                    +
                  </span>
                  <span className="absolute top-[42%] right-5 h-8 w-11 rounded-md bg-gradient-to-br from-[#f7d774] to-[#a87f1a] shadow-inner" aria-hidden />
                  <div className="flex items-start justify-between">
                    <p className="font-display text-2xl font-black italic">
                      SPORTS<span className="text-[#f2c230]">+</span>
                    </p>
                    <span className="rounded-full border border-[#f2c230]/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#f2c230]">All access</span>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-white/50">Pass holder</p>
                    <p className="font-display text-xl font-bold uppercase tracking-wide">{name}</p>
                  </div>
                  <div className="flex items-end justify-between text-[10px] uppercase tracking-[0.25em] text-white/60">
                    <span>No. {number}</span>
                    <span>Valid: forever</span>
                  </div>
                </div>
              </div>
              <h2 className="zx-ad-rise mt-6 font-display text-3xl font-black uppercase italic [animation-delay:500ms] sm:text-4xl">Welcome to Sports+</h2>
              <p className="zx-ad-rise mt-2 text-sm text-white/75 [animation-delay:700ms]">Every Sports+ game is yours, now and as new ones launch. First up: Screamer.</p>
              <div className="zx-ad-rise mt-5 flex flex-wrap justify-center gap-3 [animation-delay:900ms]">
                <Link
                  href="/games/aussie-rules"
                  onClick={end}
                  className="rounded-md bg-[#a3122c] px-6 py-3 font-display text-sm font-black uppercase tracking-[0.2em] text-white shadow-[0_0_24px_#a3122c99] hover:brightness-110"
                  autoFocus
                >
                  Play Screamer
                </Link>
                <Link href="/sports#lineup" onClick={end} className="rounded-md border-2 border-white/25 px-5 py-3 font-display text-sm font-bold uppercase tracking-[0.15em] hover:border-[#f2c230]">
                  See the line-up
                </Link>
              </div>
              <button type="button" onClick={end} className="mt-4 text-xs font-semibold text-white/60 underline hover:text-white">
                Close
              </button>
            </div>
          </div>
        )}
        {beat !== "card" && (
          <button type="button" onClick={skip} className="absolute right-4 bottom-[calc(9vh+0.75rem)] z-40 rounded-full border border-white/30 bg-black/50 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-white/85 hover:bg-white/10">
            Skip
          </button>
        )}
        {beat !== "card" && (
          <div className="absolute inset-x-0 bottom-[9vh] z-40 h-0.5 bg-white/10" aria-hidden>
            <div className="h-full bg-gradient-to-r from-[#f2c230] to-[#22d3ee]" style={{ width: `${Math.min(100, (t / INDUCTION_S) * 100)}%` }} />
          </div>
        )}
      </Frame>
    </div>
  );
}
