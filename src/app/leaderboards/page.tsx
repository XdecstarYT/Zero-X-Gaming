import type { Metadata } from "next";
import { LeaderboardTabs } from "@/components/game/LeaderboardTabs";
import { GAMES } from "@/lib/catalog";

export const metadata: Metadata = { title: "Leaderboards" };

export default function LeaderboardsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-magenta">Compete</p>
      <h1 className="font-display text-3xl font-black uppercase tracking-tight sm:text-4xl">Leaderboards</h1>
      <p className="mt-2 max-w-2xl text-muted">Daily boards reset at midnight UTC. Weekly boards reset every Monday.</p>

      <section aria-labelledby="global-lb" className="mt-8">
        <h2 id="global-lb" className="mb-3 font-display text-xl font-bold uppercase">
          Global (XP)
        </h2>
        <LeaderboardTabs scope="global" scopeLabel="Global" />
      </section>

      <div className="mt-12 grid gap-10 md:grid-cols-2">
        {GAMES.map((g) => (
          <section key={g.slug} aria-labelledby={`lb-${g.slug}`}>
            <h2 id={`lb-${g.slug}`} className="mb-3 font-display text-lg font-bold uppercase">
              {g.title}
            </h2>
            <LeaderboardTabs scope={g.slug} scopeLabel={g.title} size={5} />
          </section>
        ))}
      </div>
    </div>
  );
}
