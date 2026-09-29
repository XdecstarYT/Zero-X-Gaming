"use client";

import { useEffect, useRef, useState } from "react";
import type { Game } from "@/lib/types";
import { useLibrary } from "@/store/library";
import { Button } from "@/components/ui/Button";
import { GameArt } from "./GameArt";

/**
 * The player frame. In Phase 1 it shows a "coming soon" state; Phase 3
 * mounts the lazy-loaded GameModule into the canvas host here.
 */
export function GameStage({ game }: { game: Game }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const recordPlay = useLibrary((s) => s.recordPlay);
  const hydrated = useLibrary((s) => s.hydrated);

  // Opening a game counts as "recently played" (wait for storage to load first).
  useEffect(() => {
    if (hydrated) recordPlay(game.slug);
  }, [hydrated, game.slug, recordPlay]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frameRef.current?.requestFullscreen?.();
  }

  return (
    <div>
      <div
        ref={frameRef}
        className="relative aspect-video w-full overflow-hidden rounded-xl border border-border-strong bg-bg shadow-card"
      >
        <GameArt game={game} className="absolute inset-0 opacity-40" />
        <div className="absolute inset-0 grid place-items-center bg-bg/40 p-6 text-center">
          <div>
            <p className="font-display text-xl font-black uppercase tracking-wider sm:text-3xl">{game.title}</p>
            <p className="mt-2 text-sm text-muted sm:text-base">The game engine is loading in the next update.</p>
            <p className="mt-1 text-xs text-subtle">This is where the game will run.</p>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={toggleFullscreen} aria-pressed={isFullscreen}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            {isFullscreen ? (
              <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            ) : (
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            )}
          </svg>
          {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        </Button>
      </div>
    </div>
  );
}
