"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { GameStage } from "@/components/game/GameStage";
import { LeaderboardTabs } from "@/components/game/LeaderboardTabs";
import { cn } from "@/lib/cn";
import { NEXTX_TITLES } from "@/lib/nextx";
import type { Game } from "@/lib/types";
import { canRefract, GlassDefs, trackSheen } from "@/nextx/glass";
import { NextXLogo, NextXMark } from "./NextXLogo";

const noSubscribe = () => () => {};

/**
 * A NextX title played inside the NextX app: the app's own bar (back to the library, back to
 * Zero X), the game on a big stage, then its details and its ZLink+ leaderboard. The games are
 * ZLink+ games, so the stage asks for the membership as it would anywhere else.
 */
export function NextXPlayer({ game }: { game: Game }) {
  const root = useRef<HTMLDivElement>(null);
  const refract = useSyncExternalStore(noSubscribe, canRefract, () => false);
  const t = NEXTX_TITLES.find((x) => x.slug === game.slug);
  const accent = t?.accent ?? "#8a5cff";

  // An app of its own: the site behind it doesn't scroll.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => (root.current ? trackSheen(root.current) : undefined), []);

  return (
    <div ref={root} className={cn("fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#04040d] text-white", refract && "nx-refract")} data-testid="nextx-player" style={{ ["--nx-a" as string]: accent }}>
      <GlassDefs prefix="nx" />
      <div className="nx-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="nx-beam pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2" aria-hidden />
      <header className="relative z-10 px-3 pt-[calc(env(safe-area-inset-top)+0.6rem)] sm:px-5">
        <div className="nx-glass nx-capsule flex items-center gap-2 rounded-full py-2 pl-3 pr-2 sm:gap-3 sm:pl-4">
          <Link href="/nextx" className="flex items-center gap-2" aria-label="NextX library" data-testid="nextx-back">
            <span className="hidden sm:inline">
              <NextXLogo size="sm" />
            </span>
            <span className="sm:hidden">
              <NextXMark className="h-8 w-8" title="" />
            </span>
          </Link>
          <span className="text-white/30" aria-hidden>
            /
          </span>
          <h1 className="truncate font-display text-lg font-black uppercase tracking-wide sm:text-xl" style={{ textShadow: `0 0 24px ${accent}` }}>
            {game.title}
          </h1>
          <span className="hidden rounded-full border border-[#8b5cff] bg-black/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#d2c4ff] sm:inline" data-testid="game-access">
            ZLink+ exclusive
          </span>
          <Link href="/nextx" aria-label="NextX library" className="nx-btn ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white/90">
            <span aria-hidden>▦</span> <span className="hidden sm:inline">Library</span>
          </Link>
          <Link href="/" className="nx-btn flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white/90" data-testid="nextx-exit">
            <span aria-hidden>←</span> Zero X
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto grid max-w-[1500px] gap-6 px-3 pb-12 pt-4 sm:px-5 xl:grid-cols-[1fr_20rem]">
          <div className="min-w-0">
            <div className="nx-glass overflow-hidden rounded-[28px] p-1.5 sm:p-2">
              <GameStage game={game} />
            </div>
            <section id="about" className="nx-glass mt-6 rounded-[28px] p-5 sm:p-7">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white/60">
                <NextXMark className="h-4 w-4" title="" /> NextX Engine · Included with ZLink+
              </p>
              <p className="mt-2 text-lg font-semibold">{game.tagline}</p>
              <p className="mt-3 max-w-3xl leading-relaxed text-white/75">{game.description}</p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-white/60">Keyboard and mouse</h2>
                  <dl className="mt-3 grid gap-2">
                    {game.controls.map((c) => (
                      <div key={c.action} className="flex items-center justify-between gap-4 text-sm">
                        <dt className="flex flex-wrap gap-1">
                          {c.keys.map((k) => (
                            <kbd key={k} className="rounded-md border border-white/20 bg-white/5 px-2 py-0.5 font-mono text-xs">
                              {k}
                            </kbd>
                          ))}
                        </dt>
                        <dd className="text-right text-white/70">{c.action}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-white/60">Touch</h2>
                  <p className="mt-3 text-sm leading-relaxed text-white/70">{game.touchControls}</p>
                </div>
              </div>
            </section>
          </div>
          <aside aria-labelledby="nx-lb" className="xl:sticky xl:top-2 xl:self-start">
            <div className="nx-glass rounded-[28px] p-4">
              <h2 id="nx-lb" className="mb-3 font-display text-lg font-black uppercase tracking-wider">
                Leaderboard
              </h2>
              <LeaderboardTabs scope={game.slug} scopeLabel={game.title} />
              <p className="mt-3 text-xs text-white/55">Members only: ZLink+ players against each other.</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
