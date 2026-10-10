"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getGame } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { NEXTX_ENGINE, NEXTX_STANDARD, NEXTX_TITLES, type NextXSlug, type NextXTitle } from "@/lib/nextx";
import { UPDATES } from "@/lib/updates";
import { canRefract, GlassDefs, trackSheen } from "@/nextx/glass";
import { useSettings } from "@/store/settings";
import { NextXLogo, NextXMark } from "./NextXLogo";

/**
 * NextX: Zero X's next-generation game production label, as an app of its own, built on the
 * NextX Engine. Behind everything runs a live, photoreal scene from the featured title's own
 * renderer (YourGov's country or Zero City's city); in front, liquid glass panels that bend it.
 * It opens over the site (its own top bar, its own tabs, a way back to Zero X), plays its logo
 * in, then shows the library, the studio and its engine, and every update to its titles.
 */

type Tab = "library" | "studio" | "updates";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "library", label: "Library", icon: "M4 5h6v14H4zM14 5h6v6h-6zM14 15h6v4h-6z" },
  { id: "studio", label: "Engine", icon: "M12 3 21 8v8l-9 5-9-5V8zM12 8v8M8 10l4 2 4-2" },
  { id: "updates", label: "Updates", icon: "M4 6h16M4 12h10M4 18h13" },
];

const INTRO_KEY = "zx-nextx-intro";
const noSubscribe = () => () => {};
const SCENE: Record<NextXSlug, "country" | "city"> = { yourgov: "country", "zero-city": "city" };

/** The featured title's world, live, behind the glass. */
function EngineBackdrop({ slug, still }: { slug: NextXSlug; still: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let gone = false;
    let dispose: (() => void) | null = null;
    // Let the page settle before the renderer starts.
    const t = window.setTimeout(() => {
      import("@/nextx/backdrops")
        .then(({ mountBackdrop }) => {
          if (gone) return;
          try {
            const b = mountBackdrop(SCENE[slug], el, undefined, still);
            dispose = () => b.dispose();
            b.ready.then(() => !gone && setShown(slug));
          } catch {
            /* no WebGL: the gradient stays */
          }
        })
        .catch(() => {});
    }, 250);
    return () => {
      gone = true;
      window.clearTimeout(t);
      dispose?.();
      setShown(null);
    };
  }, [slug, still]);
  return <div ref={host} className={cn("absolute inset-0 transition-opacity duration-1000", shown === slug ? "opacity-100" : "opacity-0")} aria-hidden data-testid="nextx-backdrop" data-scene={shown ?? ""} />;
}

export function NextXApp() {
  const [intro, setIntro] = useState(true);
  const [tab, setTab] = useState<Tab>("library");
  const [featured, setFeatured] = useState<NextXSlug>("yourgov");
  const reduce = useSettings((s) => s.reduceMotion);
  const root = useRef<HTMLDivElement>(null);
  // Refraction is a browser feature: off on the server, checked in the browser.
  const refract = useSyncExternalStore(noSubscribe, canRefract, () => false);
  // People who prefer less motion get a still scene.
  const still = useMemo(() => reduce || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches), [reduce]);

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
    const t = window.setTimeout(() => setIntro(false), seen ? 0 : still ? 500 : 2800);
    return () => window.clearTimeout(t);
  }, [still]);

  // It's an app of its own: the page behind it doesn't scroll.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => (root.current ? trackSheen(root.current) : undefined), []);

  return (
    <div ref={root} className={cn("fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#04040d] text-white", refract && "nx-refract")} data-testid="nextx-app">
      <GlassDefs prefix="nx" />
      {/* Under everything: a gradient, then the live scene, then a shade so the glass reads. */}
      <div className="nx-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="nx-beam pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2" aria-hidden />
      {!intro && <EngineBackdrop slug={featured} still={still} />}
      <div className="nx-shade pointer-events-none absolute inset-0" aria-hidden />

      {intro ? (
        <button type="button" className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6" onClick={() => setIntro(false)} aria-label="Skip the intro" data-testid="nextx-intro">
          <NextXLogo size="lg" animate />
          <span className="nx-word-in text-xs font-bold uppercase tracking-[0.5em] text-white/60">Next generation game production</span>
        </button>
      ) : (
        <>
          <header className="relative z-10 px-3 pt-[calc(env(safe-area-inset-top)+0.6rem)] sm:px-5">
            <div className="nx-glass nx-capsule flex items-center gap-3 rounded-full py-2 pl-3 pr-2 sm:pl-4">
              <NextXLogo size="sm" />
              <span className="hidden text-[10px] font-bold uppercase tracking-[0.35em] text-white/55 lg:inline">Engine · by Zero X</span>
              <nav aria-label="NextX" className="ml-4 hidden gap-1 md:flex">
                {TABS.map((t) => (
                  <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id} className={cn("rounded-full px-4 py-1.5 text-sm font-semibold transition-colors", tab === t.id ? "bg-white text-[#0b0b1e] shadow-[0_2px_10px_-2px_rgba(0,0,0,0.5)]" : "text-white/75 hover:bg-white/10 hover:text-white")} data-testid={`nextx-tab-${t.id}`}>
                    {t.label}
                  </button>
                ))}
              </nav>
              <Link href="/" className="nx-btn ml-auto flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold text-white/90" data-testid="nextx-exit">
                <span aria-hidden>←</span> Zero X
              </Link>
            </div>
          </header>

          <main className="relative z-10 flex-1 overflow-y-auto overscroll-contain pb-28 md:pb-10">
            {tab === "library" ? <Library featured={featured} setFeatured={setFeatured} /> : tab === "studio" ? <Studio /> : <Updates />}
          </main>

          {/* Phones: the app's own floating glass tab bar. */}
          <nav aria-label="NextX" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.6rem)] z-20 md:hidden">
            <div className="nx-glass nx-capsule grid grid-cols-3 rounded-full p-1">
              {TABS.map((t) => (
                <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id} className={cn("flex h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold transition-colors", tab === t.id ? "bg-white text-[#0b0b1e]" : "text-white/70")} data-testid={`nextx-mtab-${t.id}`}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={t.icon} />
                  </svg>
                  {t.label}
                </button>
              ))}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}

function Library({ featured, setFeatured }: { featured: NextXSlug; setFeatured: (s: NextXSlug) => void }) {
  const f = getGame(featured);
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="flex min-h-[46vh] flex-col items-center justify-center py-10 text-center sm:min-h-[52vh]">
        <p className="text-xs font-bold uppercase tracking-[0.45em] text-[#22e5ff] drop-shadow">Zero X presents</p>
        <h1 className="mt-4 font-display text-4xl font-black uppercase leading-[0.95] tracking-tight drop-shadow-[0_4px_30px_rgba(0,0,0,0.6)] sm:text-6xl">
          Next generation
          <br />
          <span className="nx-word">game production</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-white/80 drop-shadow">The NextX label is where Zero X makes its biggest games, all on the NextX Engine: photoreal 3D worlds behind liquid glass, built for your phone first.</p>
        {/* What's running behind the glass, and a way to switch it. */}
        <div className="nx-glass nx-capsule mt-7 flex items-center gap-1 rounded-full p-1" role="radiogroup" aria-label="Live in the engine">
          <span className="px-3 text-[10px] font-bold uppercase tracking-[0.25em] text-white/60">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff2bd6] align-middle" aria-hidden />
            Live
          </span>
          {NEXTX_TITLES.map((t) => (
            <button key={t.slug} type="button" role="radio" aria-checked={featured === t.slug} onClick={() => setFeatured(t.slug)} className={cn("rounded-full px-4 py-1.5 text-sm font-semibold transition-colors", featured === t.slug ? "bg-white text-[#0b0b1e]" : "text-white/80 hover:bg-white/10")} data-testid={`nextx-live-${t.slug}`}>
              {getGame(t.slug)?.title}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/55">Behind the glass: {f?.title}&apos;s own renderer, running live.</p>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        {NEXTX_TITLES.map((t) => (
          <TitleCard key={t.slug} t={t} on={featured === t.slug} onPreview={() => setFeatured(t.slug)} />
        ))}
      </div>
      <div className="nx-glass mt-6 flex flex-col items-center gap-3 rounded-[28px] px-6 py-10 text-center" data-testid="nextx-next">
        <NextXMark className="h-12 w-12 opacity-70" />
        <p className="font-display text-xl font-black uppercase tracking-wider">Project 03</p>
        <p className="max-w-md text-sm text-white/65">In production on the NextX Engine. The next NextX title is being built to the same standard.</p>
      </div>
    </div>
  );
}

function TitleCard({ t, on, onPreview }: { t: NextXTitle; on: boolean; onPreview: () => void }) {
  const g = getGame(t.slug);
  if (!g) return null;
  return (
    <article className={cn("nx-glass relative overflow-hidden rounded-[28px] transition-shadow", on && "shadow-[0_0_0_2px_var(--nx-a),0_30px_90px_-30px_var(--nx-a)]")} style={{ ["--nx-a" as string]: t.accent }} data-testid={`nextx-title-${t.slug}`}>
      <div className="px-5 pb-6 pt-5 sm:px-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
            <NextXMark className="h-4 w-4" title="" /> NextX Engine
          </span>
          <span className="rounded-full border border-[#8b5cff] bg-black/30 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#d2c4ff]">ZLink+ exclusive</span>
          <button type="button" onClick={onPreview} aria-pressed={on} className="nx-btn ml-auto rounded-full px-3 py-1 text-[11px] font-bold text-white/90" data-testid={`nextx-preview-${t.slug}`}>
            {on ? "● Live behind" : "▸ Preview live"}
          </button>
        </div>
        <h2 className="mt-4 font-display text-4xl font-black uppercase tracking-tight sm:text-5xl" style={{ textShadow: `0 0 40px ${t.accent}` }}>
          {g.title}
        </h2>
        <p className="mt-1 text-white/80">{t.pitch}</p>
        <dl className="mt-5 grid grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-black/25">
          {t.stats.map((x) => (
            <div key={x.k} className="px-3 py-3 text-center">
              <dd className="font-display text-2xl font-black" style={{ color: t.accent2 }}>
                {x.v}
              </dd>
              <dt className="text-[10px] uppercase tracking-wider text-white/60">{x.k}</dt>
            </div>
          ))}
        </dl>
        <ul className="mt-5 grid gap-2 text-sm text-white/85">
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
          <Link href={`/games/${g.slug}`} className="rounded-full px-6 py-2.5 font-display text-sm font-black uppercase tracking-wider text-[#06061a] shadow-[0_8px_30px_-8px_var(--nx-a)] transition-transform hover:scale-105" style={{ background: `linear-gradient(120deg, ${t.accent2}, ${t.accent})` }} data-testid={`nextx-launch-${t.slug}`}>
            Launch ▸
          </Link>
          <Link href={`/games/${g.slug}#about`} className="nx-btn rounded-full px-5 py-2.5 text-sm font-bold text-white/90">
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
        <p className="mt-3 font-display text-lg font-black uppercase tracking-[0.4em] text-white/70">Engine</p>
        <p className="mt-4 max-w-xl text-white/80">One engine under every NextX title: the photoreal renderers and the liquid glass interface that YourGov and Zero City are built on, shared so each new game starts where the last one finished.</p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2" data-testid="nextx-engine">
        {NEXTX_ENGINE.map((x) => (
          <div key={x.title} className="nx-glass rounded-3xl p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-black uppercase tracking-wider">{x.title}</h3>
              <span className="rounded-full bg-black/35 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70">{x.from}</span>
            </div>
            <p className="mt-1 text-sm text-white/75">{x.body}</p>
          </div>
        ))}
      </div>
      <h2 className="mt-12 text-center font-display text-2xl font-black uppercase tracking-wider">The NextX standard</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {NEXTX_STANDARD.map((x) => (
          <div key={x.title} className="nx-glass rounded-3xl p-5">
            <p className="nx-word font-display text-2xl font-black">{x.icon}</p>
            <h3 className="mt-2 font-display text-lg font-black uppercase tracking-wider">{x.title}</h3>
            <p className="mt-1 text-sm text-white/75">{x.body}</p>
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
      <h2 className="font-display text-3xl font-black uppercase tracking-tight drop-shadow">Updates</h2>
      <p className="mt-1 text-white/70">Every update to a NextX title, newest first.</p>
      <ol className="mt-6 space-y-4">
        {list.map((u) => {
          const t = NEXTX_TITLES.find((x) => u.href === `/games/${x.slug}`)!;
          return (
            <li key={u.title} className="nx-glass rounded-3xl p-5" style={{ borderLeft: `3px solid ${t.accent}` }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/60">
                {getGame(t.slug)?.title} · {u.tag}
              </p>
              <h3 className="mt-1 font-display text-lg font-black">{u.title}</h3>
              <p className="mt-1 text-sm text-white/75">{u.body}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
