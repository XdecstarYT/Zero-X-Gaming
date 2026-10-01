import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/Button";
import { SportsLineup } from "@/components/sports/SportsLineup";
import { SportsPassCard } from "@/components/sports/SportsPassCard";
import { GameArt } from "@/components/game/GameArt";
import { getGame } from "@/lib/catalog";
import { SPORTS_PASS_PRICE } from "@/lib/economy";
import { SPORTS } from "@/lib/sports";

export const metadata: Metadata = {
  title: "Sports+",
  description: `Sports+ is the Zero X Gaming section for sports games. Unlock it once for ${SPORTS_PASS_PRICE} coins and play Screamer: Aussie Rules now, with football, basketball, hockey, tennis and more on the way.`,
};

export default function SportsPage() {
  const sports = new Set(SPORTS.map((s) => s.sport)).size;
  const live = getGame("aussie-rules")!;
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
            Unlock Sports+ once for <strong className="text-text">{SPORTS_PASS_PRICE} coins</strong> and play every sports game, starting
            with <strong className="text-text">{live.title}</strong>. {SPORTS.length} more games across {sports} sports are on the way, built
            for your browser and your phone. Tap <strong className="text-text">Notify me</strong> on the ones you want first.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton href={`/games/${live.slug}`} size="lg">
              Play {live.title.split(":")[0]}
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
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <article aria-labelledby="live-title" className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="relative aspect-[16/9]">
              <GameArt game={live} className="h-full w-full" />
              <span className="absolute top-2 left-2 rounded-full bg-lime-400 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bg">Out now</span>
            </div>
            <div className="p-4">
              <h3 id="live-title" className="font-display text-xl font-bold uppercase tracking-wide">
                {live.title}
              </h3>
              <p className="mt-1 text-sm text-muted">{live.tagline}</p>
              <p className="mt-2 text-sm">{live.description}</p>
              <LinkButton href={`/games/${live.slug}`} className="mt-4">
                Play now
              </LinkButton>
            </div>
          </article>
          <SportsPassCard />
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
