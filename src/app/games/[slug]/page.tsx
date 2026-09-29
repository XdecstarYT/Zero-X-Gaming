import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GAMES, getGame } from "@/lib/mock-data";
import { formatCompact } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Rating } from "@/components/ui/Rating";
import { GameStage } from "@/components/game/GameStage";
import { LeaderboardTabs } from "@/components/game/LeaderboardTabs";
import { FavoriteButton } from "@/components/game/FavoriteButton";

export const dynamicParams = false;

export function generateStaticParams() {
  return GAMES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata(props: PageProps<"/games/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const game = getGame(slug);
  return game ? { title: game.title, description: game.tagline } : { title: "Game not found" };
}

export default async function GamePage(props: PageProps<"/games/[slug]">) {
  const { slug } = await props.params;
  const game = getGame(slug);
  if (!game) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link href="/games" className="hover:text-text">
          Games
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <span aria-current="page" className="text-text">
          {game.title}
        </span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <GameStage game={game} />

          <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="cyan">{game.category}</Badge>
                {game.tags.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
              <h1 className="mt-3 font-display text-3xl font-black uppercase tracking-tight sm:text-4xl">
                {game.title}
              </h1>
              <p className="mt-1 text-lg text-muted">{game.tagline}</p>
            </div>
            <FavoriteButton slug={game.slug} title={game.title} className="h-11 w-11" />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <Rating value={game.rating} count={game.ratingCount} />
            <span className="text-muted">{formatCompact(game.plays)} plays</span>
          </div>

          <p className="mt-5 max-w-3xl leading-relaxed text-muted">{game.description}</p>

          <section aria-labelledby="controls-title" className="mt-8">
            <h2 id="controls-title" className="font-display text-lg font-bold uppercase tracking-wide">
              Controls
            </h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-surface p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Keyboard</h3>
                <dl className="mt-3 space-y-2">
                  {game.controls.map((c) => (
                    <div key={c.action} className="flex items-center justify-between gap-4 text-sm">
                      <dt className="flex flex-wrap gap-1">
                        {c.keys.map((k) => (
                          <kbd
                            key={k}
                            className="rounded border border-border-strong bg-surface-2 px-2 py-0.5 font-mono text-xs"
                          >
                            {k}
                          </kbd>
                        ))}
                      </dt>
                      <dd className="text-right text-muted">{c.action}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Touch</h3>
                <p className="mt-3 text-sm text-muted">{game.touchControls}</p>
              </div>
            </div>
          </section>
        </div>

        <aside aria-labelledby="game-lb-title">
          <h2 id="game-lb-title" className="mb-3 font-display text-lg font-bold uppercase tracking-wide">
            Leaderboard
          </h2>
          <LeaderboardTabs scope={game.slug} scopeLabel={game.title} />
          <p className="mt-3 text-xs text-subtle">Sign in to save your scores to the board.</p>
        </aside>
      </div>
    </div>
  );
}
