"use client";

import { quietHere } from "@/lib/quiet";
import { useEffect, useState } from "react";
import { GAMES } from "@/lib/catalog";
import { GameArt } from "@/components/game/GameArt";

export const MEGA_AD_KEY = "zx-mega-ad-seen";
/** Seconds per scene. */
const SCENE_S = 3.6;

/** Extra punch lines per game (falls back to the catalog tagline). */
const HOOKS: Record<string, string[]> = {
  trenches: ["5 fronts. 3 modes.", "Dig in. Call the guns.", "Hold the line."],
  "neon-siege": ["Drop in. Loot up.", "Outlast the storm.", "Season 1 is live."],
  "code-3": ["Lights. Sirens. Justice.", "Patrol the city.", "Every call counts."],
};

/**
 * The one-time "mega ad": a cinematic promo for every game, shown once per
 * browser right after the intro splash. It can't be skipped (a countdown shows
 * how long is left), and it never shows again once it has started.
 */
export function MegaAd() {
  const [state, setState] = useState<"waiting" | "playing" | "done">("waiting");
  const [elapsed, setElapsed] = useState(0);
  const scenes = GAMES.length + 2; // opener + one per game + closer
  const total = scenes * SCENE_S;

  // Wait until the intro splash is gone, then start (once per browser).
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(MEGA_AD_KEY) === "1";
    } catch {
      seen = true;
    }
    // Friends arriving on a game invite link go straight in; they'll see it on a later visit.
    const invite = quietHere();
    if (seen || invite) {
      const t = window.setTimeout(() => setState("done"), 0);
      return () => clearTimeout(t);
    }
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.intro === "done" && !document.getElementById("zx-intro")) {
        clearInterval(poll);
        try {
          localStorage.setItem(MEGA_AD_KEY, "1");
        } catch {}
        setState("playing");
      }
    }, 150);
    return () => clearInterval(poll);
  }, []);

  // While playing: lock the page behind, run the clock, then close.
  useEffect(() => {
    if (state !== "playing") return;
    const siblings = Array.from(document.body.children).filter((el) => el.id !== "zx-mega-ad") as HTMLElement[];
    siblings.forEach((el) => (el.inert = true));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t0 = performance.now();
    const tick = window.setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      setElapsed(s);
      if (s >= total) setState("done");
    }, 100);
    return () => {
      clearInterval(tick);
      siblings.forEach((el) => (el.inert = false));
      document.body.style.overflow = prevOverflow;
    };
  }, [state, total]);

  if (state !== "playing") return null;

  const scene = Math.min(scenes - 1, Math.floor(elapsed / SCENE_S));
  const left = Math.max(0, Math.ceil(total - elapsed));
  const game = scene >= 1 && scene <= GAMES.length ? GAMES[scene - 1] : null;

  return (
    <div
      id="zx-mega-ad"
      role="dialog"
      aria-modal="true"
      aria-label="Zero X Gaming: all games"
      data-testid="mega-ad"
      className="fixed inset-0 z-[110] overflow-hidden bg-black text-white"
    >
      <p className="sr-only" aria-live="polite">
        {game ? `${game.title}. ${game.tagline}` : scene === 0 ? "Zero X Gaming presents" : "All games are free to play."}
      </p>

      {scene === 0 && (
        <div key="open" className="zx-ad-scene absolute inset-0 grid place-items-center text-center">
          <div className="zx-ad-rays absolute inset-0" aria-hidden />
          <div className="relative">
            <p className="zx-ad-rise font-display text-sm font-bold uppercase tracking-[0.6em] text-cyan">Zero X Gaming</p>
            <p className="zx-ad-slam mt-4 font-display text-5xl font-black uppercase italic sm:text-7xl">presents</p>
            <p className="zx-ad-rise mt-4 text-sm text-white/70 [animation-delay:600ms]">
              {GAMES.length} games. One hub. No downloads.
            </p>
          </div>
        </div>
      )}

      {game && (
        <div key={game.slug} className="zx-ad-scene absolute inset-0">
          <div className="zx-ad-kenburns absolute inset-0" aria-hidden>
            <GameArt game={game} className="h-full w-full" />
          </div>
          <div
            className="absolute inset-0"
            aria-hidden
            style={{ background: `linear-gradient(90deg, rgba(0,0,0,.88) 0%, rgba(0,0,0,.55) 45%, ${game.palette[0]}22 100%)` }}
          />
          {game.slug === "code-3" && <div className="zx-ad-police absolute inset-0 mix-blend-screen" aria-hidden />}
          <div className="relative flex h-full flex-col justify-center gap-3 px-6 sm:px-16">
            <p
              className="zx-ad-rise font-display text-xs font-bold uppercase tracking-[0.5em]"
              style={{ color: game.palette[0] }}
            >
              Now playing · {game.category}
            </p>
            <h2 className="zx-ad-slam font-display text-5xl font-black uppercase italic leading-none sm:text-8xl">
              {game.title}
            </h2>
            <ul className="mt-2 flex flex-col gap-1">
              {(HOOKS[game.slug] ?? [game.tagline]).map((h, i) => (
                <li
                  key={h}
                  className="zx-ad-rise font-display text-lg font-bold uppercase tracking-wide sm:text-2xl"
                  style={{ animationDelay: `${500 + i * 450}ms` }}
                >
                  {h}
                </li>
              ))}
            </ul>
            <p className="zx-ad-rise max-w-xl text-sm text-white/75 [animation-delay:1800ms]">{game.tagline}</p>
          </div>
        </div>
      )}

      {scene === scenes - 1 && (
        <div key="close" className="zx-ad-scene absolute inset-0 grid place-items-center px-6 text-center">
          <div className="zx-ad-rays absolute inset-0" aria-hidden />
          <div className="relative">
            <p className="zx-ad-slam font-display text-4xl font-black uppercase italic sm:text-6xl">Play free now</p>
            <ul className="mt-6 flex flex-wrap justify-center gap-3">
              {GAMES.map((g, i) => (
                <li
                  key={g.slug}
                  className="zx-ad-rise rounded-lg border-2 px-4 py-2 font-display text-sm font-black uppercase tracking-wider"
                  style={{ borderColor: g.palette[0], color: g.palette[0], animationDelay: `${200 + i * 200}ms` }}
                >
                  {g.title}
                </li>
              ))}
            </ul>
            <p className="zx-ad-rise mt-6 text-xs text-white/60 [animation-delay:1000ms]">Zero X Gaming · No downloads</p>
          </div>
        </div>
      )}

      {/* Progress + countdown (the ad can't be skipped, but you can see how long is left). */}
      <div className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1 font-display text-xs font-bold tracking-wider">
        Ad · {left}s
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10" aria-hidden>
        <div className="h-full bg-gradient-to-r from-cyan to-magenta" style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} />
      </div>
    </div>
  );
}
