"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GameArt } from "@/components/game/GameArt";
import { getGame } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { NEXTX_STANDARD, NEXTX_TITLES, type NextXTitle } from "@/lib/nextx";
import { UPDATES } from "@/lib/updates";
import { useSettings } from "@/store/settings";
import { NextXLogo, NextXMark } from "./NextXLogo";

/**
 * NextX: Zero X's next-generation game production label, as an app of its own. It opens over
 * the site (its own top bar, its own tabs, a way back to Zero X), plays its logo in, then shows
 * the library (YourGov and Zero City), the NextX standard, and every update to its titles.
 */

type Tab = "library" | "studio" | "updates";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "library", label: "Library", icon: "M4 5h6v14H4zM14 5h6v6h-6zM14 15h6v4h-6z" },
  { id: "studio", label: "Studio", icon: "M12 3 21 8v8l-9 5-9-5V8zM12 8v8M8 10l4 2 4-2" },
  { id: "updates", label: "Updates", icon: "M4 6h16M4 12h10M4 18h13" },
];

const INTRO_KEY = "zx-nextx-intro";

export function NextXApp() {
  const [intro, setIntro] = useState(true);
  const [tab, setTab] = useState<Tab>("library");
  const reduce = useSettings((s) => s.reduceMotion);

  // The logo plays in once a session (briefly for people who prefer less motion); a tap skips it.
  const seenRef = useRef<boolean | null>(null);
  useEffect(() => {
    // Decided once (effects can run twice in development).
    if (seenRef.current === null) {
      seenRef.current = false;
      try {
        seenRef.current = sessionStorage.getItem(INTRO_KEY) === "1";
        sessionStorage.setItem(INTRO_KEY, "1");
      } catch {
        /* private mode */
      }
    }
    const seen = seenRef.current;
    const quiet = reduce || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setIntro(false), seen ? 0 : quiet ? 500 : 2800);
    return () => window.clearTimeout(t);
  }, [reduce]);

  // It's an app of its own: the page behind it doesn't scroll.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#04040d] text-white" data-testid="nextx-app">
      <div className="nx-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="nx-beam pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2" aria-hidden />

      {intro ? (
        <button type="button" className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6" onClick={() => setIntro(false)} aria-label="Skip the intro" data-testid="nextx-intro">
          <NextXLogo size="lg" animate />
          <span className="nx-word-in text-xs font-bold uppercase tracking-[0.5em] text-white/60">Next generation game production</span>
        </button>
      ) : (
        <>
          <header className="relative z-10 flex items-center gap-3 border-b border-white/10 bg-black/30 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-md sm:px-6">
            <NextXLogo size="sm" />
            <span className="hidden text-[10px] font-bold uppercase tracking-[0.35em] text-white/45 sm:inline">by Zero X</span>
            <nav aria-label="NextX" className="ml-6 hidden gap-1 md:flex">
              {TABS.map((t) => (
                <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id} className={cn("rounded-full px-4 py-1.5 text-sm font-semibold transition-colors", tab === t.id ? "bg-white text-[#0b0b1e]" : "text-white/65 hover:bg-white/10 hover:text-white")} data-testid={`nextx-tab-${t.id}`}>
                  {t.label}
                </button>
              ))}
            </nav>
            <Link href="/" className="ml-auto flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10" data-testid="nextx-exit">
              <span aria-hidden>←</span> Zero X
            </Link>
          </header>

          <main className="relative z-10 flex-1 overflow-y-auto overscroll-contain pb-24 md:pb-10">
            {tab === "library" ? <Library /> : tab === "studio" ? <Studio /> : <Updates />}
          </main>

          {/* Phones: the app's own tab bar. */}
          <nav aria-label="NextX" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-white/10 bg-[#06061a]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id} className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", tab === t.id ? "text-[#22e5ff]" : "text-white/55")} data-testid={`nextx-mtab-${t.id}`}>
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={t.icon} />
                </svg>
                {t.label}
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}

function Library() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="py-10 text-center sm:py-16">
        <p className="text-xs font-bold uppercase tracking-[0.45em] text-[#22e5ff]">Zero X presents</p>
        <h1 className="mt-4 font-display text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-6xl">
          Next generation
          <br />
          <span className="nx-word">game production</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-white/65">The NextX label is where Zero X makes its biggest games: photoreal 3D worlds, deep simulations and interfaces built for your phone first.</p>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        {NEXTX_TITLES.map((t) => (
          <TitleCard key={t.slug} t={t} />
        ))}
      </div>
      <div className="mt-6 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-10 text-center" data-testid="nextx-next">
        <NextXMark className="h-12 w-12 opacity-60" />
        <p className="font-display text-xl font-black uppercase tracking-wider">Project 03</p>
        <p className="max-w-md text-sm text-white/55">In production. The next NextX title is being built to the same standard.</p>
      </div>
    </div>
  );
}

function TitleCard({ t }: { t: NextXTitle }) {
  const g = getGame(t.slug);
  if (!g) return null;
  return (
    <article className="group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a1c] shadow-[0_40px_120px_-50px_var(--nx-a)]" style={{ ["--nx-a" as string]: t.accent }} data-testid={`nextx-title-${t.slug}`}>
      <div className="relative h-48 overflow-hidden sm:h-56">
        <GameArt game={g} className="transition-transform duration-700 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a1c] via-[#0a0a1c]/30 to-transparent" />
        <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] backdrop-blur">
          <NextXMark className="h-4 w-4" /> NextX
        </span>
        <span className="absolute right-4 top-4 rounded-full border border-[#8b5cff] bg-black/45 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#c4b0ff] backdrop-blur">ZLink+ exclusive</span>
      </div>
      <div className="relative -mt-10 px-5 pb-6 sm:px-7">
        <h2 className="font-display text-4xl font-black uppercase tracking-tight sm:text-5xl" style={{ textShadow: `0 0 40px ${t.accent}` }}>
          {g.title}
        </h2>
        <p className="mt-1 text-white/70">{t.pitch}</p>
        <dl className="mt-5 grid grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-white/[0.03]">
          {t.stats.map((x) => (
            <div key={x.k} className="px-3 py-3 text-center">
              <dd className="font-display text-2xl font-black" style={{ color: t.accent2 }}>
                {x.v}
              </dd>
              <dt className="text-[10px] uppercase tracking-wider text-white/50">{x.k}</dt>
            </div>
          ))}
        </dl>
        <ul className="mt-5 grid gap-2 text-sm text-white/75">
          {t.features.map((f) => (
            <li key={f} className="flex gap-2">
              <span style={{ color: t.accent }} aria-hidden>
                ◆
              </span>
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/games/${g.slug}`} className="rounded-full px-6 py-2.5 font-display text-sm font-black uppercase tracking-wider text-[#06061a] transition-transform hover:scale-105" style={{ background: `linear-gradient(120deg, ${t.accent2}, ${t.accent})` }} data-testid={`nextx-launch-${t.slug}`}>
            Launch ▸
          </Link>
          <Link href={`/games/${g.slug}#about`} className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-bold text-white/80 hover:bg-white/10">
            Details
          </Link>
        </div>
      </div>
    </article>
  );
}

function Studio() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6" data-testid="nextx-studio">
      <div className="flex flex-col items-center text-center">
        <NextXLogo size="lg" />
        <p className="mt-6 max-w-xl text-white/65">NextX is Zero X&apos;s next-generation game production label. Every NextX title is held to one standard.</p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {NEXTX_STANDARD.map((x) => (
          <div key={x.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="nx-word font-display text-2xl font-black">{x.icon}</p>
            <h3 className="mt-2 font-display text-lg font-black uppercase tracking-wider">{x.title}</h3>
            <p className="mt-1 text-sm text-white/60">{x.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-white/[0.03] text-center">
        {[
          { v: String(NEXTX_TITLES.length), k: "Titles" },
          { v: "1", k: "In production" },
          { v: "0", k: "Downloads needed" },
        ].map((x) => (
          <div key={x.k} className="py-5">
            <p className="nx-word font-display text-3xl font-black">{x.v}</p>
            <p className="text-[10px] uppercase tracking-wider text-white/50">{x.k}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Updates() {
  const list = UPDATES.filter((u) => NEXTX_TITLES.some((t) => u.href === `/games/${t.slug}`));
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6" data-testid="nextx-updates">
      <h2 className="font-display text-3xl font-black uppercase tracking-tight">Updates</h2>
      <p className="mt-1 text-white/55">Every update to a NextX title, newest first.</p>
      <ol className="mt-6 space-y-4">
        {list.map((u) => {
          const t = NEXTX_TITLES.find((x) => u.href === `/games/${x.slug}`)!;
          return (
            <li key={u.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5" style={{ borderLeft: `3px solid ${t.accent}` }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">
                {getGame(t.slug)?.title} · {u.tag}
              </p>
              <h3 className="mt-1 font-display text-lg font-black">{u.title}</h3>
              <p className="mt-1 text-sm text-white/65">{u.body}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
