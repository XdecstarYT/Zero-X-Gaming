import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import { SportsLineup } from "@/components/sports/SportsLineup";
import { SportsPassCard } from "@/components/sports/SportsPassCard";
import { GameArt } from "@/components/game/GameArt";
import { getGame } from "@/lib/catalog";
import { SPORTS_PASS_PRICE } from "@/lib/economy";
import { UPCOMING } from "@/lib/sports";

export const metadata: Metadata = {
  title: "Sports+",
  description: `Sports+ is the Zero X Gaming section for sports games. Unlock it once for ${SPORTS_PASS_PRICE} ZX Cash and play Screamer: Aussie Rules, Diamond Derby, Ace Rally and Boundary Blitz now, watch Sports+ Live for free, with football, basketball, hockey and more on the way.`,
};

export default function SportsPage() {
  const sports = new Set(UPCOMING.map((s) => s.sport)).size;
  const live = getGame("aussie-rules")!;
  const out = ["aussie-rules", "diamond-derby", "ace-rally", "boundary-blitz", "fairway"].map((slug) => getGame(slug)!);
  return (
    <div className="pb-8">
      <section aria-labelledby="sports-title" className="relative overflow-hidden border-b border-border">
        <div className="zx-grid-bg absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" aria-hidden />
        <div
          className="absolute inset-0 opacity-40"
          aria-hidden
          style={{ background: "radial-gradient(circle at 15% 20%, #22c55e55, transparent 40%), radial-gradient(circle at 85% 30%, #f9731655, transparent 40%)" }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 md:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-magenta">New section</p>
          <h1 id="sports-title" className="mt-2 font-display text-5xl font-black uppercase italic tracking-tight sm:text-7xl">
            Sports<span className="text-cyan">+</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            Unlock Sports+ once for <strong className="text-text">{SPORTS_PASS_PRICE} ZX Cash</strong> and play every sports game:{" "}
            <strong className="text-text">{out.map((g) => g.title.split(":")[0]).join(", ")}</strong>, and every one still to come. Or watch{" "}
            <strong className="text-text">Sports+ Live</strong> for free. {UPCOMING.length} more games across {sports} sports are on the way, built
            for your browser and your phone.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton href={`/games/${live.slug}`} size="lg">
              Play {live.title.split(":")[0]}
            </LinkButton>
            <LinkButton href="/sports/live" size="lg" variant="accent">
              Watch live
            </LinkButton>
            <LinkButton href="#lineup" size="lg" variant="secondary">
              See the line-up
            </LinkButton>
          </div>
        </div>
      </section>

      <section aria-labelledby="now-title" className="mx-auto mt-10 max-w-7xl px-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-magenta">Out now</p>
        <h2 id="now-title" className="mb-5 font-display text-2xl font-bold uppercase tracking-wide">
          Now playing
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {out.map((g) => (
            <article key={g.slug} aria-labelledby={`now-${g.slug}`} className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
              <div className="relative aspect-[16/9]">
                <GameArt game={g} className="h-full w-full" />
                <span className="absolute top-2 left-2 rounded-full bg-lime-400 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bg">Out now</span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 id={`now-${g.slug}`} className="font-display text-xl font-bold uppercase tracking-wide">
                  {g.title}
                </h3>
                <p className="mt-1 flex-1 text-sm text-muted">{g.tagline}</p>
                <LinkButton href={`/games/${g.slug}`} className="mt-4 self-start">
                  Play now
                </LinkButton>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <Link
            href="/sports/live"
            data-testid="live-banner"
            className="group relative overflow-hidden rounded-xl border border-border bg-surface p-5 transition-colors hover:border-magenta"
          >
            <div className="absolute inset-0 opacity-50" aria-hidden style={{ background: "radial-gradient(circle at 10% 0%, #ef444466, transparent 50%), radial-gradient(circle at 90% 100%, #22d3ee44, transparent 50%)" }} />
            <p className="relative flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-magenta">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
              On air now · free
            </p>
            <p className="relative mt-1 font-display text-3xl font-black uppercase italic">Sports+ Live</p>
            <p className="relative mt-1 text-sm text-muted">Screamer TV, Derby Night and Centre Court: AI-versus-AI matches around the clock, the same match for everyone watching.</p>
            <span className="relative mt-3 inline-block text-sm font-bold uppercase tracking-wider text-cyan group-hover:underline">Tune in →</span>
          </Link>
          <div id="pass" className="scroll-mt-20">
            <SportsPassCard />
          </div>
        </div>
      </section>

      <section id="lineup" aria-labelledby="lineup-title" className="mx-auto mt-10 max-w-7xl scroll-mt-20 px-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-magenta">Coming soon</p>
        <h2 id="lineup-title" className="mb-5 font-display text-2xl font-bold uppercase tracking-wide">
          The line-up
        </h2>
        <SportsLineup />
      </section>

      <section aria-labelledby="promise-title" className="mx-auto mt-14 max-w-7xl px-4 sm:px-6">
        <h2 id="promise-title" className="mb-4 font-display text-xl font-bold uppercase tracking-wide">
          What every Sports+ game gets
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Free, no downloads", "Straight in the browser, like everything on Zero X."],
            ["Phone-first controls", "Swipe and tap schemes designed for touch, plus keyboard and gamepad."],
            ["Play with friends", "Online matches and local pass-and-play."],
            ["Ranked and rewarded", "Leaderboards, XP and battle pass progress."],
          ].map(([t, d]) => (
            <li key={t} className="rounded-xl border border-border bg-surface p-4">
              <p className="font-display font-bold uppercase">{t}</p>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
