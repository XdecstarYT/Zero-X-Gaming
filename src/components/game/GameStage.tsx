"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Game } from "@/lib/types";
import type { GameModule } from "@/games/types";
import { GAME_LOADERS } from "@/games/registry";
import { useLibrary } from "@/store/library";
import { useSettings } from "@/store/settings";
import { useAuth } from "@/store/auth";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { submitScore, type SubmitResult } from "@/lib/scores";
import { applyProgress } from "@/lib/progress";
import { formatNumber } from "@/lib/format";
import { formatKeyCode } from "@/lib/keys";
import { Button } from "@/components/ui/Button";
import { SignInButton } from "@/components/layout/SignInButton";
import { GameArt } from "./GameArt";

const noopSubscribe = () => () => {};

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

/** Name shown to other players online: username if signed in, else a per-session guest tag. */
function displayName() {
  const username = useAuth.getState().profile?.username;
  if (username) return username;
  try {
    let tag = sessionStorage.getItem("zx-guest-name");
    if (!tag) {
      tag = `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
      sessionStorage.setItem("zx-guest-name", tag);
    }
    return tag;
  } catch {
    return "Guest";
  }
}

type Phase = "idle" | "loading" | "playing" | "paused" | "over" | "error";
type Submit =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; result: SubmitResult }
  | { state: "failed"; message: string }
  | { state: "unranked" };

/**
 * Hosts a GameModule: lazy-loads it, owns the lifecycle (start / pause /
 * resume / destroy), the overlays, and score submission.
 */
export function GameStage({ game }: { game: Game }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const moduleRef = useRef<GameModule | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const [submit, setSubmit] = useState<Submit>({ state: "idle" });
  const [isFullscreen, setIsFullscreen] = useState(false);
  /** Phones: once playing, the stage takes over the whole screen. */
  const [immersive, setImmersive] = useState(false);
  const [rotateDismissed, setRotateDismissed] = useState(false);
  const coarse = useMedia("(pointer: coarse)");
  const portrait = useMedia("(orientation: portrait)");
  const wantsLandscape = game.orientation === "landscape";
  const recordPlay = useLibrary((s) => s.recordPlay);
  const localBest = useLibrary((s) => s.recent.find((r) => r.slug === game.slug)?.bestScore ?? 0);
  const authStatus = useAuth((s) => s.status);
  const pauseKey = useSettings((s) => s.keybindings.pause);
  const playable = game.status === "live" && game.slug in GAME_LOADERS;
  // Keep Play disabled until hydrated, so an early click is never silently lost.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const handleFinal = useCallback(
    async (finalScore: number, durationMs: number, ranked = true) => {
      setScore(finalScore);
      setPhase("over");
      recordPlay(game.slug, finalScore);
      const supabase = getSupabaseBrowser();
      if (!ranked) {
        setSubmit({ state: "unranked" });
        return;
      }
      if (useAuth.getState().status !== "signed_in" || !supabase || finalScore <= 0) {
        setSubmit({ state: "idle" });
        return;
      }
      setSubmit({ state: "saving" });
      try {
        const res = await submitScore(supabase, game.slug, finalScore, durationMs);
        setSubmit({ state: "saved", result: res });
        applyProgress(res.totalXp, res.newAchievements);
      } catch (e) {
        setSubmit({ state: "failed", message: (e as Error).message });
      }
    },
    [game.slug, recordPlay],
  );

  const pause = useCallback(() => {
    moduleRef.current?.pause();
    setPhase((p) => (p === "playing" ? "paused" : p));
  }, []);

  const enterImmersive = useCallback(() => {
    setImmersive(true);
    const frame = frameRef.current;
    if (frame && !document.fullscreenElement) {
      frame.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {});
    }
    if (wantsLandscape) (screen.orientation as LockableOrientation | undefined)?.lock?.("landscape").catch(() => {});
  }, [wantsLandscape]);

  const launch = useCallback(async () => {
    const host = hostRef.current;
    if (!host || !playable) return;
    if (window.matchMedia("(pointer: coarse)").matches) enterImmersive();
    setPhase("loading");
    setSubmit({ state: "idle" });
    setScore(0);
    try {
      if (!moduleRef.current) {
        const { default: factory } = await GAME_LOADERS[game.slug]();
        const mod = factory();
        const { sound, volume, reduceMotion, keybindings } = useSettings.getState();
        const osReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        mod.init({
          root: host,
          settings: { sound, volume, reduceMotion: reduceMotion || osReduce, keybindings },
          requestPause: pause,
          playerName: displayName(),
        });
        mod.onScore((e) => {
          if (e.kind === "progress") setScore(e.score);
          else void handleFinal(e.score, e.durationMs, e.ranked ?? true);
        });
        moduleRef.current = mod;
      }
      moduleRef.current.start();
      setPhase("playing");
      // Games with their own menus focus a control inside the frame; don't steal it.
      if (!frameRef.current?.contains(document.activeElement)) frameRef.current?.focus({ preventScroll: true });
    } catch {
      setPhase("error");
    }
  }, [game.slug, playable, handleFinal, pause, enterImmersive]);

  const exitImmersive = useCallback(() => {
    moduleRef.current?.pause();
    setPhase((p) => (p === "playing" ? "paused" : p));
    setImmersive(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    (screen.orientation as LockableOrientation | undefined)?.unlock?.();
  }, []);

  const resume = useCallback(() => {
    moduleRef.current?.resume();
    setPhase("playing");
    frameRef.current?.focus({ preventScroll: true });
  }, []);

  // Tear the module down when leaving the page.
  useEffect(() => () => moduleRef.current?.destroy(), []);

  // Pause when the tab is hidden; pause/resume on Esc or the pause key.
  useEffect(() => {
    const onVisibility = () => document.hidden && phase === "playing" && pause();
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape" && e.code !== pauseKey) return;
      if (phase === "playing") {
        e.preventDefault();
        pause();
      } else if (phase === "paused" && e.code !== "Escape") {
        e.preventDefault();
        resume();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase, pause, resume, pauseKey]);

  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement === frameRef.current;
      setIsFullscreen(fs);
      // Android back / swipe out of fullscreen mid-game: pause rather than keep playing blind.
      if (!fs && immersive) pause();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [immersive, pause]);

  // Immersive mode: no page scroll or pull-to-refresh behind the game.
  useEffect(() => {
    if (!immersive) return;
    const { overflow, overscrollBehavior } = document.body.style;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.overscrollBehavior = overscrollBehavior;
    };
  }, [immersive]);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frameRef.current?.requestFullscreen?.();
  }

  const showArt = phase === "idle" || phase === "loading" || phase === "error" || !playable;

  return (
    <div>
      <div
        ref={frameRef}
        tabIndex={-1}
        data-testid="game-stage"
        data-phase={phase}
        data-immersive={immersive || undefined}
        className={
          immersive
            ? "fixed inset-0 z-[70] h-[100dvh] w-screen touch-none overflow-hidden bg-black focus:outline-none"
            : "relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border-strong bg-bg shadow-card focus:outline-none sm:aspect-video"
        }
      >
        <div ref={hostRef} className="absolute inset-0" />
        {showArt && <GameArt game={game} className="absolute inset-0 opacity-40" />}

        {!playable && (
          <Overlay>
            <p className="font-display text-xl font-black uppercase tracking-wider sm:text-3xl">{game.title}</p>
            <p className="mt-2 text-sm text-muted sm:text-base">Coming soon. This game is still in development.</p>
          </Overlay>
        )}

        {playable && (phase === "idle" || phase === "loading") && (
          <Overlay>
            <p className="font-display text-xl font-black uppercase tracking-wider sm:text-3xl">{game.title}</p>
            <p className="mt-1 text-sm text-muted">{game.tagline}</p>
            <Button size="lg" className="mt-5" onClick={launch} disabled={phase === "loading" || !hydrated} autoFocus>
              {phase === "loading" ? "Loading…" : "Play"}
            </Button>
            {localBest > 0 && <p className="mt-3 text-xs text-subtle">Your best: {formatNumber(localBest)}</p>}
          </Overlay>
        )}

        {phase === "playing" && (
          <button
            type="button"
            onClick={pause}
            aria-label="Pause game"
            className={
              immersive
                ? "absolute top-[max(0.5rem,env(safe-area-inset-top))] left-1/2 z-10 grid h-11 w-11 -translate-x-1/2 place-items-center rounded-full border border-white/15 bg-black/50 text-white/80 backdrop-blur"
                : "absolute right-3 bottom-3 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/50 text-white/80 backdrop-blur hover:text-white"
            }
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
            </svg>
          </button>
        )}

        {phase === "paused" && (
          <Overlay dim>
            <p className="font-display text-2xl font-black uppercase tracking-wider">Paused</p>
            <p className="mt-1 text-sm text-muted">Score {formatNumber(score)}</p>
            <div className="mt-5 flex gap-3">
              <Button onClick={resume} autoFocus>
                Resume
              </Button>
              <Button variant="secondary" onClick={launch}>
                Restart
              </Button>
              {immersive && (
                <Button variant="ghost" onClick={exitImmersive}>
                  Exit
                </Button>
              )}
            </div>
            {!coarse && <p className="mt-3 text-xs text-subtle">Press {formatKeyCode(pauseKey)} to resume</p>}
          </Overlay>
        )}

        {phase === "over" && (
          <Overlay dim>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-magenta">Game over</p>
            <p className="font-display text-4xl font-black" aria-live="polite">
              {formatNumber(score)}
            </p>
            <SubmitStatus submit={submit} authStatus={authStatus} localBest={localBest} score={score} />
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button onClick={launch} autoFocus>
                Play again
              </Button>
              {authStatus === "guest" && score > 0 && (
                <SignInButton variant="accent" initialMode="sign_up">
                  Save my scores
                </SignInButton>
              )}
              {immersive && (
                <Button variant="ghost" onClick={exitImmersive}>
                  Exit
                </Button>
              )}
            </div>
          </Overlay>
        )}

        {immersive && wantsLandscape && portrait && !rotateDismissed && phase !== "over" && (
          <div
            className="absolute inset-0 z-20 grid place-items-center bg-black/85 p-6 text-center"
            role="dialog"
            aria-label="Rotate your device"
          >
            <div className="flex flex-col items-center">
              <svg
                viewBox="0 0 48 48"
                className="h-16 w-16 text-cyan motion-safe:animate-pulse"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden
              >
                <rect x="14" y="6" width="20" height="36" rx="3" />
                <path d="M40 30a14 14 0 0 1-12 12m0 0 3-4m-3 4 4 3" />
              </svg>
              <p className="mt-4 font-display text-lg font-bold uppercase tracking-wider">Rotate your phone</p>
              <p className="mt-1 text-sm text-muted">{game.title} plays best in landscape.</p>
              <Button variant="secondary" size="sm" className="mt-5" onClick={() => setRotateDismissed(true)}>
                Play in portrait
              </Button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <Overlay dim>
            <p className="font-display text-xl font-bold uppercase">Couldn&apos;t load the game</p>
            <p className="mt-1 text-sm text-muted">Check your connection and try again.</p>
            <Button className="mt-5" onClick={launch}>
              Retry
            </Button>
          </Overlay>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-subtle">{playable ? `Press Esc or ${formatKeyCode(pauseKey)} to pause.` : " "}</p>
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

function Overlay({ children, dim = false }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <div
      className={`absolute inset-0 z-30 grid place-items-center p-6 text-center ${dim ? "bg-bg/75 backdrop-blur-sm" : "bg-bg/40"}`}
    >
      <div className="flex flex-col items-center animate-rise">{children}</div>
    </div>
  );
}

function SubmitStatus({
  submit,
  authStatus,
  localBest,
  score,
}: {
  submit: Submit;
  authStatus: string;
  localBest: number;
  score: number;
}) {
  const cls = "mt-2 text-sm";
  if (submit.state === "saving") return <p className={`${cls} text-muted`}>Saving score…</p>;
  if (submit.state === "saved") {
    const r = submit.result;
    return (
      <div role="status" className="mt-2 space-y-1 text-sm">
        <p className="text-success">
          {r.isPersonalBest ? "New personal best!" : `Score saved · Best ${formatNumber(r.personalBest)}`}
        </p>
        <p className="text-muted">
          <span className="font-display font-bold text-cyan">+{formatNumber(r.xpGained)} XP</span>
          {" · "}#{r.dailyRank} today
        </p>
      </div>
    );
  }
  if (submit.state === "unranked")
    return <p className={`${cls} text-muted`}>Online match · unranked (not saved to leaderboards)</p>;
  if (submit.state === "failed")
    return (
      <p className={`${cls} text-danger`} role="alert">
        {submit.message}
      </p>
    );
  if (authStatus === "guest" && score > 0)
    return (
      <p className={`${cls} text-muted`}>
        Playing as guest · Best on this device {formatNumber(Math.max(localBest, score))}
      </p>
    );
  return <p className={`${cls} text-muted`}>Best {formatNumber(Math.max(localBest, score))}</p>;
}
