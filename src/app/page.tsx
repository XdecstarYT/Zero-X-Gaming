import { LinkButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Rating } from "@/components/ui/Rating";
import { YourProgress } from "@/components/layout/YourProgress";
import { LiveLeaderboard } from "@/components/game/LeaderboardTabs";
import { GameArt } from "@/components/game/GameArt";
import { GameCard } from "@/components/game/GameCard";
import { ContinuePlaying } from "@/components/game/ContinuePlaying";
import { CardRow, CardRowItem, Section } from "@/components/layout/Section";
import { FEATURED_SLUG, GAMES, getGame } from "@/lib/catalog";
import { queryGames } from "@/lib/game-query";
import { formatCompact } from "@/lib/format";
import { SportsLineup } from "@/components/sports/SportsLineup";

export default function HomePage() {
  const featured = getGame(FEATURED_SLUG) ?? GAMES[0];
  const trending = queryGames(GAMES, { sort: "popular" });
  const newest = queryGames(GAMES, { sort: "new" });
  const totalPlays = GAMES.reduce((n, g) => n + g.plays, 0);

  return (
    <div className="space-y-16 pb-8">
      {/* Hero */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden border-b border-border">
        <div
          className="zx-grid-bg absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1.1fr_1fr]">
          <div className="animate-rise">
            <Badge tone="cyan">
              <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-cyan" aria-hidden />
              {GAMES.length} original games · no downloads
            </Badge>
            <h1
              id="hero-title"
              className="mt-5 font-display text-4xl font-black uppercase leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
            >
              Play. Compete.
              <br />
              <span className="bg-gradient-to-r from-cyan via-violet to-magenta bg-clip-text text-transparent">
                Level up.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Two full 3D shooters in your browser. Dig in on five Great War fronts in Trenches, or drop into the Neon
              Siege battle royale. Earn XP, unlock the battle pass, and play with friends on desktop or phone.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href={`/games/${featured.slug}`} size="lg">
                Play {featured.title}
              </LinkButton>
              <LinkButton href="/games" size="lg" variant="secondary">
                Browse games
              </LinkButton>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-6">
              {[
                { k: "Games", v: String(GAMES.length) },
                { k: "Plays", v: formatCompact(totalPlays) },
                { k: "Downloads", v: "0" },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="text-xs uppercase tracking-wider text-muted">{s.k}</dt>
                  <dd className="font-display text-2xl font-bold">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Featured game */}
          <article aria-labelledby="featured-title" className="animate-rise [animation-delay:120ms]">
            <div className="relative overflow-hidden rounded-xl border border-cyan/40 bg-surface shadow-glow-cyan">
              <div className="aspect-[16/10]">
                <GameArt game={featured} />
              </div>
              <div className="flex flex-wrap items-end justify-between gap-4 border-t border-border p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-magenta">Featured</p>
                  <h2 id="featured-title" className="font-display text-2xl font-bold uppercase">
                    {featured.title}
                  </h2>
                  <p className="text-sm text-muted">{featured.tagline}</p>
                  <div className="mt-2">
                    <Rating value={featured.rating} count={featured.ratingCount} />
                  </div>
                </div>
                <LinkButton href={`/games/${featured.slug}`} variant="accent" aria-label={`Play ${featured.title} now`}>
                  Play now
                </LinkButton>
              </div>
            </div>
          </article>
        </div>
      </section>

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
