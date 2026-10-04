import { LinkButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { YourProgress } from "@/components/layout/YourProgress";
import { LiveLeaderboard } from "@/components/game/LeaderboardTabs";
import { GameCard } from "@/components/game/GameCard";
import { ContinuePlaying } from "@/components/game/ContinuePlaying";
import { CardRow, CardRowItem, Section } from "@/components/layout/Section";
import { FEATURED_SLUG, GAMES, getGame } from "@/lib/catalog";
import { queryGames } from "@/lib/game-query";
import { SportsLineup } from "@/components/sports/SportsLineup";
import { DailyRewards } from "@/components/home/DailyRewards";
import { WhatsNew } from "@/components/home/WhatsNew";
import { Spotlight } from "@/components/home/Spotlight";
import { Collections } from "@/components/home/Collections";

export default function HomePage() {
  const featured = getGame(FEATURED_SLUG) ?? GAMES[0];
  const trending = queryGames(GAMES, { sort: "popular" });
  const newest = queryGames(GAMES, { sort: "new" });

  return (
    <div className="space-y-16 pb-8">
      {/* Hero */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden border-b border-border">
        <div
          className="zx-grid-bg absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-8 sm:gap-10 sm:px-6 sm:py-14 md:py-20 lg:grid-cols-[1.1fr_1fr]">
          <div className="animate-rise">
            <Badge tone="cyan">
              <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-cyan" aria-hidden />
              UBusiness Ultimate is free until 31 October
            </Badge>
            <h1
              id="hero-title"
              className="mt-4 font-display text-[2.4rem] font-black uppercase leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
            >
              Play. Compete.
              <br />
              <span className="bg-gradient-to-r from-cyan via-violet to-magenta bg-clip-text text-transparent">
                Level up.
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted sm:mt-5 sm:text-lg">
              Live a whole life in Life, run a store in UBusiness, build a town together in Hometown, then dig in on the
              Great War fronts or play Sports+. Earn XP and coins, unlock the battle pass, and play with friends.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 sm:mt-8">
              <LinkButton href={`/games/${featured.slug}`} size="lg">
                Play {featured.title}
              </LinkButton>
              <LinkButton href="/games" size="lg" variant="secondary">
                All games
              </LinkButton>
            </div>
            <ul className="mt-6 hidden flex-wrap gap-2 sm:mt-8 sm:flex" aria-label="Why play here">
              {[
                { icon: "🎮", k: `${GAMES.length} original games` },
                { icon: "⚡", k: "Free, no downloads" },
                { icon: "📱", k: "Phone and desktop" },
                { icon: "🏆", k: "Battle pass and ranks" },
              ].map((s) => (
                <li key={s.k} className="flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-sm text-muted backdrop-blur">
                  <span aria-hidden>{s.icon}</span>
                  {s.k}
                </li>
              ))}
            </ul>
          </div>

          <div className="animate-rise [animation-delay:120ms]">
            <Spotlight />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <DailyRewards />
      </div>

      <Section title="Browse by vibe" eyebrow="Collections" href="/games" hrefLabel="All games">
        <Collections />
      </Section>

      <Section title="What's new" eyebrow="The mega update">
        <WhatsNew />
      </Section>

      <Section title="Continue playing" eyebrow="Jump back in">
        <ContinuePlaying />
      </Section>

      <Section title="Trending" eyebrow="Most played" href="/games?sort=popular">
        <CardRow label="Trending games">
          {trending.map((g) => (
            <CardRowItem key={g.slug}>
              <GameCard game={g} />
            </CardRowItem>
          ))}
        </CardRow>
      </Section>

      <Section title="New releases" eyebrow="Fresh drops" href="/games?sort=new">
        <CardRow label="New releases">
          {newest.map((g) => (
            <CardRowItem key={g.slug}>
              <GameCard game={g} />
            </CardRowItem>
          ))}
        </CardRow>
      </Section>

      <Section title="Sports+" eyebrow="Coming soon" href="/sports" hrefLabel="See all sports">
        <SportsLineup compact />
      </Section>

      <Section title="Climb the ranks" eyebrow="Compete" href="/leaderboards" hrefLabel="All leaderboards">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="flex flex-col justify-between gap-6 rounded-lg border border-border bg-surface p-6">
            <div>
              <h3 className="font-display text-lg font-bold uppercase">Every run counts</h3>
              <p className="mt-2 text-sm text-muted">
                Scores earn XP. XP earns levels, badges, and daily streak bonuses. Guests can play right away; sign up
                to keep your progress.
              </p>
            </div>
            <YourProgress />
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-muted">Top players this week (XP)</p>
            <LiveLeaderboard game={null} period="weekly" limit={5} caption="Top players this week" />
          </div>
        </div>
      </Section>
    </div>
  );
}
