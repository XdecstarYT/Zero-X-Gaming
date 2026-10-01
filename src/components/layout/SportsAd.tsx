"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasSportsPass } from "@/lib/season-client";
import { SPORTS_PASS_PRICE } from "@/lib/economy";
import { useAuth } from "@/store/auth";
import { CoinIcon } from "@/components/shop/Coin";
import { beatAt, Floodlights, Frame, LogoSlam, ScreamerShot, SportsTunnel, useTimeline } from "@/components/sports/SportsCinema";
import { MEGA_AD_KEY } from "./MegaAd";

/** How many times the Sports+ ad has played in this browser (at most 3). */
export const SPORTS_AD_KEY = "zx-sports-ad-count";
export const SPORTS_AD_RUNS = 3;
export const SPORTS_AD_S = 25;
const SESSION_KEY = "zx-sports-ad-session";

const BEATS = [
  [0, "cold"],
  [4, "logo"],
  [8, "tunnel"],
  [13, "screamer"],
  [18, "price"],
  [22, "end"],
] as const;

const COLD = "THIS SEASON, THE GAME CHANGES.";

/**
 * A 25-second spot for Sports+, shown after the intro on up to three visits:
 * never with the one-time mega ad, never on invite links, never to someone
 * who already owns the pass, and one ad per visit (it goes before Code 3's,
 * which waits for it via `data-sports-ad` on <html>). Unskippable like the
 * other spots; the last beat links to Sports+.
 */
export function SportsAd() {
  const [state, setState] = useState<"waiting" | "playing" | "done">("waiting");
  const t = useTimeline(state === "playing");
  const authStatus = useAuth((s) => s.status);

  useEffect(() => {
    const root = document.documentElement;
    let runs = SPORTS_AD_RUNS;
    let megaDue = false;
    let thisVisit = false;
    try {
      runs = Number(localStorage.getItem(SPORTS_AD_KEY) ?? "0") || 0;
      megaDue = localStorage.getItem(MEGA_AD_KEY) !== "1";
      thisVisit = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      runs = SPORTS_AD_RUNS;
    }
    const invite = /[?&](room|lobby)=/.test(window.location.search);
    if (thisVisit || megaDue) {
      // An ad already ran (or the mega ad has this visit): no more ads.
      root.dataset.sportsAd = "done";
      const id = window.setTimeout(() => setState("done"), 0);
      return () => clearTimeout(id);
    }
    if (runs >= SPORTS_AD_RUNS || invite) {
      root.dataset.sportsAd = "skip";
      const id = window.setTimeout(() => setState("done"), 0);
      return () => clearTimeout(id);
    }
    if (authStatus === "loading") return;
    let cancelled = false;
    let poll = 0;
    void hasSportsPass()
      .catch(() => false)
      .then((owned) => {
        if (cancelled) return;
        if (owned) {
          // Nothing to sell: retire the spot for this browser.
          try {
            localStorage.setItem(SPORTS_AD_KEY, String(SPORTS_AD_RUNS));
          } catch {}
          root.dataset.sportsAd = "skip";
          setState("done");
          return;
        }
        root.dataset.sportsAd = "pending";
        poll = window.setInterval(() => {
          if (root.dataset.intro === "done" && !document.getElementById("zx-intro") && !document.getElementById("zx-mega-ad")) {
            clearInterval(poll);
            try {
              localStorage.setItem(SPORTS_AD_KEY, String(runs + 1));
              sessionStorage.setItem(SESSION_KEY, "1");
            } catch {}
            root.dataset.sportsAd = "playing";
            setState("playing");
          }
        }, 150);
      });
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [authStatus]);

  useEffect(() => {
    if (state !== "playing") return;
    const siblings = Array.from(document.body.children).filter((el) => el.id !== "zx-sports-ad") as HTMLElement[];
    siblings.forEach((el) => (el.inert = true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      siblings.forEach((el) => (el.inert = false));
      document.body.style.overflow = prev;
      document.documentElement.dataset.sportsAd = "done";
    };
  }, [state]);

  useEffect(() => {
    if (state === "playing" && t >= SPORTS_AD_S) {
      const id = window.setTimeout(() => setState("done"), 0);
      return () => clearTimeout(id);
    }
  }, [state, t]);

  if (state !== "playing") return null;
  const beat = beatAt(BEATS, t);
  const left = Math.max(0, Math.ceil(SPORTS_AD_S - t));
  const typed = COLD.slice(0, Math.floor(Math.min(1, Math.max(0, t - 0.8) / 2.2) * COLD.length));

  return (
    <div id="zx-sports-ad">
      <Frame label="Sports+ trailer" testId="sports-ad">
        <p className="sr-only" aria-live="polite">
          Sports+ on Zero X Gaming. {beat}
        </p>
        {beat === "cold" && (
          <div key="cold" className="absolute inset-0">
            <Floodlights delay={0.2} gap={0.5} />
            <div className="absolute inset-x-0 bottom-[16vh] px-6 text-center">
              <p className="font-display text-xl font-black uppercase italic tracking-wide drop-shadow-[0_2px_16px_rgba(0,0,0,0.9)] sm:text-4xl">
                {typed}
                <span className="animate-pulse text-[#f2c230]">▌</span>
              </p>
            </div>
          </div>
        )}
        {beat === "logo" && (
          <div key="logo" className="absolute inset-0">
            <LogoSlam sub="A new home for sports" />
          </div>
        )}
        {beat === "tunnel" && (
          <div key="tunnel" className="absolute inset-0">
            <SportsTunnel words={["Football. Hoops.", "Hockey. Tennis.", "And more."]} />
          </div>
        )}
        {beat === "screamer" && (
          <div key="screamer" className="absolute inset-0">
            <ScreamerShot title="Out now: Screamer" sub="Aussie rules · 18 a side · under lights" />
          </div>
        )}
        {beat === "price" && (
          <div key="price" className="absolute inset-0 grid place-items-center px-6 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,#3a2a05,#05070c_65%)]" aria-hidden />
            <div className="zx-ad-rays absolute inset-0 opacity-30" aria-hidden />
            <div className="relative flex flex-col items-center">
              <p className="zx-sp-word font-display text-4xl font-black uppercase italic sm:text-7xl">One pass.</p>
              <p className="zx-sp-word font-display text-4xl font-black uppercase italic sm:text-7xl" style={{ animationDelay: "0.5s" }}>
                Every sport.
              </p>
              <div className="zx-sp-coin mt-6 flex items-center gap-3" style={{ animationDelay: "1s" }}>
                <CoinIcon className="h-16 w-16 drop-shadow-[0_0_24px_rgba(242,194,48,0.7)] sm:h-24 sm:w-24" />
                <span className="font-display text-6xl font-black text-[#f2c230] sm:text-8xl">{SPORTS_PASS_PRICE}</span>
              </div>
              <p className="zx-ad-rise mt-3 font-display text-sm font-bold uppercase tracking-[0.5em] text-white/85 [animation-delay:1800ms]">coins · once · forever</p>
            </div>
          </div>
        )}
        {beat === "end" && (
          <div key="end" className="absolute inset-0">
            <LogoSlam sub="Only on Zero X Gaming" />
            <div className="absolute inset-x-0 bottom-[14vh] flex justify-center">
              <Link
                href="/sports"
                onClick={() => setState("done")}
                className="zx-ad-rise rounded-md bg-[#f2c230] px-6 py-3 font-display text-sm font-black uppercase tracking-[0.2em] text-[#0b0f18] shadow-[0_0_30px_#f2c23088] [animation-delay:900ms]"
              >
                Get Sports+
              </Link>
            </div>
          </div>
        )}
        <div className="absolute top-[calc(9vh+0.75rem)] right-3 z-40 rounded-full bg-black/60 px-3 py-1 font-display text-xs font-bold tracking-wider">Ad · {left}s</div>
        <div className="absolute inset-x-0 bottom-[9vh] z-40 h-0.5 bg-white/10" aria-hidden>
          <div className="h-full bg-gradient-to-r from-[#f2c230] to-[#22d3ee]" style={{ width: `${Math.min(100, (t / SPORTS_AD_S) * 100)}%` }} />
        </div>
      </Frame>
    </div>
  );
}
