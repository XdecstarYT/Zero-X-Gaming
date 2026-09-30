import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/Button";
import { SportsLineup } from "@/components/sports/SportsLineup";
import { SPORTS } from "@/lib/sports";

export const metadata: Metadata = {
  title: "Sports+",
  description: "Sports+ is the new Zero X Gaming section for sports games: football, basketball, hockey, tennis and more, coming soon.",
};

export default function SportsPage() {
  const sports = new Set(SPORTS.map((s) => s.sport)).size;
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
            A whole new line-up of sports games is on the way: {SPORTS.length} games across {sports} sports, built for your browser and your
            phone, with online play, leaderboards and the battle pass. Tap <strong className="text-text">Notify me</strong> on the ones you
            want first.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton href="#lineup" size="lg">
              See the line-up
            </LinkButton>
            <LinkButton href="/games" size="lg" variant="secondary">
              Play what&apos;s out now
            </LinkButton>
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
