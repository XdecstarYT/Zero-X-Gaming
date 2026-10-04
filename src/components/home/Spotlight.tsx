"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { LinkButton } from "@/components/ui/Button";
import { GameArt } from "@/components/game/GameArt";
import { cn } from "@/lib/cn";
import { spotlightGames } from "@/lib/spotlight";

const SLIDES = spotlightGames();
const EVERY_MS = 6500;

function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}

/**
 * The home page's spotlight: one big game at a time, turning over on its own
 * (paused while you're hovering or focused on it, and never with reduced motion).
 */
export function Spotlight() {
  const [i, setI] = useState(0);
  const [held, setHeld] = useState(false);
  const still = useReducedMotion();
  const slide = SLIDES[i % SLIDES.length];

  useEffect(() => {
    if (held || still || SLIDES.length < 2) return;
    const t = window.setTimeout(() => setI((n) => (n + 1) % SLIDES.length), EVERY_MS);
    return () => clearTimeout(t);
  }, [i, held, still]);

  if (!slide) return null;
  return (
    <section
      aria-roledescription="carousel"
      aria-label="Spotlight"
      data-testid="spotlight"
      data-slide={slide.slug}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className="relative overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-card"
    >
      <div className="relative aspect-[16/11] sm:aspect-[16/10]">
        {SLIDES.map((s, n) => (
          <div
            key={s.slug}
            aria-hidden={n !== i}
            className={cn("absolute inset-0 transition-opacity duration-700 ease-zx", n === i ? "opacity-100" : "opacity-0")}
          >
            <GameArt game={s.game} className={cn(!still && n === i && "animate-[zx-kenburns_9s_ease-out_both]")} />
          </div>
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" aria-hidden />
        <div
          className="absolute inset-x-0 bottom-0 p-5 sm:p-6"
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${SLIDES.length}: ${slide.game.title}`}
          aria-live={held || still ? "polite" : "off"}
        >
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan">{slide.kicker}</p>
          <h2 className="mt-1 font-display text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">{slide.game.title}</h2>
          <p className="mt-1 max-w-md text-sm text-white/80">{slide.pitch}</p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <LinkButton href={`/games/${slide.slug}`} variant="accent" data-testid="spotlight-play">
              Play {slide.game.title}
            </LinkButton>
            <div className="flex gap-1.5" role="group" aria-label="Choose a game">
              {SLIDES.map((s, n) => (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => setI(n)}
                  aria-label={s.game.title}
                  aria-current={n === i ? "true" : undefined}
                  className="grid h-6 place-items-center px-0.5"
                >
                  <span className={cn("block h-1.5 rounded-full transition-all", n === i ? "w-6 bg-cyan" : "w-2 bg-white/40 hover:bg-white/70")} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
