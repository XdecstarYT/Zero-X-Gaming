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
import { GameTicker } from "@/components/home/GameTicker";
import { WhyZeroX } from "@/components/home/WhyZeroX";
import { ZLinkTeaser } from "@/components/home/ZLinkTeaser";

export default function HomePage() {
  const featured = getGame(FEATURED_SLUG) ?? GAMES[0];
  const trending = queryGames(GAMES, { sort: "popular" });
  const newest = queryGames(GAMES, { sort: "new" });

  return (
    <div className="space-y-20 pb-8">
      {/* Hero */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden">
        <div className="zx-horizon" aria-hidden />
        <span
          className="zx-outline pointer-events-none absolute -right-[6vw] top-1/2 hidden -translate-y-1/2 select-none font-display text-[46vw] font-black leading-none lg:block"
          aria-hidden
        >
          X
        </span>
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-14 pt-10 sm:px-6 sm:pt-16 lg:min-h-[78vh] lg:grid-cols-[1.15fr_1fr] lg:pb-24">
          <div className="animate-rise">
            <Badge tone="cyan" className="zx-glass">
              <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-cyan" aria-hidden />
              ZLink+ is here: every Sports+ game and UBusiness Ultimate
            </Badge>
            <h1
              id="hero-title"
              className="mt-5 font-display text-[2.9rem] font-black uppercase leading-[0.92] tracking-tighter sm:text-7xl xl:text-8xl"
            >
              Play. Compete.
              <br />
              <span className="zx-sweep">Level up.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base text-muted sm:text-lg">
              Live a whole life in Life, run a store in UBusiness, build a town together in Hometown, then dig in on the
              Great War fronts or play Sports+. Earn XP and coins, unlock the battle pass, and play with friends.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href={`/games/${featured.slug}`} size="lg">
                Play {featured.title}
              </LinkButton>
              <LinkButton href="/games" size="lg" variant="secondary">
                All games
              </LinkButton>
            </div>
            <dl className="mt-10 hidden max-w-lg grid-cols-3 divide-x divide-border/70 sm:grid" aria-label="Zero X at a glance">
              {[
                { k: "Original games", v: String(GAMES.length) },
                { k: "To download", v: "0" },
                { k: "To start", v: "Free" },
              ].map((x) => (
                <div key={x.k} className="px-4 first:pl-0">
                  <dd className="font-display text-3xl font-black">{x.v}</dd>
                  <dt className="text-xs uppercase tracking-wider text-muted">{x.k}</dt>
                </div>
              ))}
            </dl>
          </div>

          <div className="animate-rise [animation-delay:120ms]">
            {/* A glowing ring rather than a tilt: the spotlight has buttons, and they shouldn't move under the pointer. */}
            <div className="zx-ring rounded-2xl shadow-[0_40px_120px_-40px_var(--zx-violet)]">
              <Spotlight />
            </div>
          </div>
        </div>
      </section>

      <GameTicker />

      <ZLinkTeaser />

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <DailyRewards />
      </div>

      <Section index={1} title="Browse by vibe" eyebrow="Collections" href="/games" hrefLabel="All games">
        <Collections />
      </Section>

      <Section index={2} title="What's new" eyebrow="The mega update">
        <WhatsNew />
      </Section>

      <Section index={3} title="Continue playing" eyebrow="Jump back in">
        <ContinuePlaying />
      </Section>

      <Section index={4} title="Trending" eyebrow="Most played" href="/games?sort=popular">
        <CardRow label="Trending games">
          {trending.map((g) => (
            <CardRowItem key={g.slug}>
              <GameCard game={g} />
            </CardRowItem>
          ))}
        </CardRow>
      </Section>

      <Section index={5} title="New releases" eyebrow="Fresh drops" href="/games?sort=new">
        <CardRow label="New releases">
          {newest.map((g) => (
            <CardRowItem key={g.slug}>
              <GameCard game={g} />
            </CardRowItem>
          ))}
        </CardRow>
      </Section>

      <Section index={6} title="Sports+" eyebrow="Coming soon" href="/sports" hrefLabel="See all sports">
        <SportsLineup compact />
      </Section>

      <Section index={7} title="Why Zero X" eyebrow="Made to be played">
        <WhyZeroX />
      </Section>

      <Section index={8} title="Climb the ranks" eyebrow="Compete" href="/leaderboards" hrefLabel="All leaderboards">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="flex flex-col justify-between gap-6 rounded-2xl border border-border bg-surface/85 p-6">
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
