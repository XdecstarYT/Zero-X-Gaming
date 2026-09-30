"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GAMES } from "@/lib/catalog";

export const INTRO_SEEN_KEY = "zx-intro-seen";
const DURATION_MS = 5200;
const REDUCED_DURATION_MS = 1600;
const EXIT_MS = 450;

/**
 * Runs in <head> before first paint: returning visitors (this session) never see
 * the intro, not even for a frame, and neither do people arriving on a game
 * invite link (?room=). Kept tiny and dependency-free on purpose.
 */
export const introGateScript = `try{if(sessionStorage.getItem("${INTRO_SEEN_KEY}")||/[?&]room=/.test(location.search))document.documentElement.dataset.intro="done"}catch(e){document.documentElement.dataset.intro="done"}`;

/**
 * Cinematic brand intro shown once per browser session. Pure CSS/SVG (no video,
 * no assets), skippable by button, Esc/Enter/Space or click, and shortened to a
 * static card when reduced motion is on.
 */
export function IntroSplash() {
  const [phase, setPhase] = useState<"playing" | "leaving" | "gone">("playing");
  const skipRef = useRef<HTMLButtonElement>(null);
  const finish = useCallback(() => setPhase((p) => (p === "playing" ? "leaving" : p)), []);

  // While playing: make the page behind inert, lock scroll, listen for keys, auto-dismiss.
  // The cleanup runs as soon as the phase leaves "playing", so the page is usable immediately.
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.intro === "done") {
      // Already seen this session (hidden by the head script before paint).
      const t = window.setTimeout(() => setPhase("gone"), 0);
      return () => clearTimeout(t);
    }
    if (phase !== "playing") return;
    const reduced =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches || root.dataset.reduceMotion === "true";
    const siblings = Array.from(document.body.children).filter((el) => el.id !== "zx-intro") as HTMLElement[];
    siblings.forEach((el) => (el.inert = true));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    skipRef.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      // Any key enters, except bare modifiers and Tab (keyboard users moving focus to "Skip").
      if (["Tab", "Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      e.preventDefault();
      finish();
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(finish, reduced ? REDUCED_DURATION_MS : DURATION_MS);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      siblings.forEach((el) => (el.inert = false));
      document.body.style.overflow = prevOverflow;
    };
  }, [phase, finish]);

  // Leaving: remember for this session, play the exit animation, then unmount.
  useEffect(() => {
    if (phase !== "leaving") return;
    try {
      sessionStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {}
    document.querySelector<HTMLElement>("#main")?.focus({ preventScroll: true });
    const t = window.setTimeout(() => {
      document.documentElement.dataset.intro = "done";
      setPhase("gone");
    }, EXIT_MS);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "gone") return null;

  const titles = [...GAMES.map((g) => g.title)];

  return (
    <div
      id="zx-intro"
      role="dialog"
      aria-modal="true"
      aria-label="Zero X Gaming intro"
      onClick={finish}
      className={`zx-intro fixed inset-0 z-[100] cursor-pointer overflow-hidden bg-bg text-text ${phase === "leaving" ? "zx-intro-exit pointer-events-none" : ""}`}
    >
      {/* Perspective grid floor + glow */}
      <div className="zx-intro-floor absolute inset-x-[-50%] bottom-[-10%] h-[70%]" aria-hidden />
      <div className="zx-intro-glow absolute inset-0" aria-hidden />
      <div className="zx-intro-scanlines pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
        <svg viewBox="0 0 120 120" className="zx-intro-mark h-28 w-28 sm:h-36 sm:w-36" aria-hidden>
          <rect
            x="6"
            y="6"
            width="108"
            height="108"
            rx="24"
            fill="none"
            stroke="var(--zx-magenta)"
            strokeWidth="4"
            pathLength={1}
            className="zx-intro-draw zx-intro-draw-3"
          />
          <path
            d="M34 34 L86 86"
            stroke="var(--zx-cyan)"
            strokeWidth="14"
            strokeLinecap="square"
            pathLength={1}
            className="zx-intro-draw zx-intro-draw-1"
          />
          <path
            d="M86 34 L34 86"
            stroke="var(--zx-magenta)"
            strokeWidth="14"
            strokeLinecap="square"
            pathLength={1}
            className="zx-intro-draw zx-intro-draw-2"
          />
        </svg>

        <p
          className="zx-intro-title mt-8 font-display text-5xl font-black uppercase tracking-[0.25em] sm:text-7xl"
          data-text="ZERO X"
        >
          ZERO <span className="text-magenta">X</span>
        </p>
        <p className="zx-intro-sub mt-3 font-display text-sm font-bold uppercase tracking-[0.6em] text-muted sm:text-base">
          Gaming
        </p>

        <p className="zx-intro-tagline mt-10 font-display text-lg font-bold uppercase tracking-[0.3em] sm:text-2xl">
          <span className="zx-intro-word zx-intro-word-1">Play.</span>{" "}
          <span className="zx-intro-word zx-intro-word-2">Compete.</span>{" "}
          <span className="zx-intro-word zx-intro-word-3 text-cyan">Level up.</span>
        </p>

        <ul
          className="zx-intro-reel mt-8 h-6 text-xs font-semibold uppercase tracking-[0.35em] text-subtle"
          aria-hidden
        >
          {titles.map((t, i) => (
            <li key={t} className="zx-intro-reel-item" style={{ animationDelay: `${2.1 + i * 0.45}s` }}>
              {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <div className="zx-intro-progress h-full bg-gradient-to-r from-cyan to-magenta" />
          </div>
          <button
            ref={skipRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              finish();
            }}
            className="rounded-md border border-border-strong bg-surface/80 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-text backdrop-blur hover:border-cyan"
          >
            Skip intro
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] uppercase tracking-[0.3em] text-subtle">
          Press any key or tap to enter
        </p>
      </div>
    </div>
  );
}
