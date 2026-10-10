import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GAMES, getGame } from "@/lib/catalog";
import { formatCompact } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Rating } from "@/components/ui/Rating";
import { GameStage } from "@/components/game/GameStage";
import { UBusinessEdition } from "@/components/ubusiness/UBusinessEdition";
import { LeaderboardTabs } from "@/components/game/LeaderboardTabs";
import { FavoriteButton } from "@/components/game/FavoriteButton";
import { GameArt } from "@/components/game/GameArt";
import { inZlink } from "@/lib/zlink";
import { isNextX } from "@/lib/nextx";
import { NextXMark } from "@/components/nextx/NextXLogo";
import { gameHref } from "@/lib/nextx";

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

  const passLabel = game.pass === "zlink" ? "ZLink+ exclusive" : game.pass === "sports-plus" ? "Sports+" : game.pass === "ubusiness" ? "Lite · Ultimate" : "Free";
  const inLink = inZlink(game.slug);

  return (
    <div className="pb-10">
      {/* A cinematic header lit by the game's own art. */}
      <header className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 scale-110 opacity-40 blur-2xl" aria-hidden>
          <GameArt game={game} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/70 to-bg" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-6">
          <nav aria-label="Breadcrumb" className="text-sm text-muted">
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
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <div className="flex items-end gap-5">
              <div className="hidden h-28 w-44 shrink-0 overflow-hidden rounded-xl border border-border-strong shadow-card sm:block">
                <GameArt game={game} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="cyan">{game.category}</Badge>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${game.pass === "zlink" ? "border-violet text-violet" : game.pass ? "border-magenta/60 text-magenta" : "border-border-strong text-muted"}`} data-testid="game-access">
                    {passLabel}
                  </span>
                  {isNextX(game.slug) && (
                    <Link href="/nextx" className="flex items-center gap-1 rounded-full border border-[#8b5cff]/60 bg-[#04040d] px-2.5 py-0.5 text-xs font-bold text-white hover:bg-[#8b5cff]/20" data-testid="game-nextx">
                      <NextXMark className="h-3.5 w-3.5" title="" /> NextX
                    </Link>
                  )}
                  {inLink && game.pass !== "zlink" && (
                    <Link href="/zlink" className="rounded-full border border-violet/60 px-2.5 py-0.5 text-xs font-bold text-violet hover:bg-violet/10">
                      Z+ Included with ZLink+
                    </Link>
                  )}
                </div>
                <h1 className="mt-3 font-display text-4xl font-black uppercase tracking-tighter sm:text-6xl">{game.title}</h1>
                <p className="mt-1 text-lg text-muted">{game.tagline}</p>
              </div>
            </div>
            <FavoriteButton slug={game.slug} title={game.title} className="h-11 w-11" />
          </div>
        </div>
      </header>

      <div className="mx-auto mt-8 grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          {game.retiring && (
            <div role="note" data-testid="game-retiring" className="mb-4 rounded-2xl border border-amber-400/60 bg-amber-400/10 p-4 text-sm">
              <p className="font-display text-base font-black uppercase tracking-wide text-amber-300">
                Retiring {new Date(game.retiring.on + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
              </p>
              <p className="mt-1 text-muted">{game.retiring.note}</p>
              {game.retiring.successor && (
                <Link href={gameHref(game.retiring.successor)} className="mt-2 inline-block font-bold text-violet hover:underline">
                  Play {getGame(game.retiring.successor)?.title ?? "its successor"} instead →
                </Link>
              )}
            </div>
          )}
          <GameStage game={game} />
          {game.pass === "ubusiness" && <UBusinessEdition />}

          {(game.ratingCount > 0 || game.plays > 0) && (
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              {game.ratingCount > 0 && <Rating value={game.rating} count={game.ratingCount} />}
              {game.plays > 0 && <span className="text-muted">{formatCompact(game.plays)} plays</span>}
            </div>
          )}

          <section aria-labelledby="about-title" className="mt-8 rounded-2xl border border-border bg-surface/80 p-6">
            <h2 id="about-title" className="font-display text-lg font-bold uppercase tracking-wide">
              About the game
            </h2>
            <p className="mt-3 max-w-3xl leading-relaxed text-muted">{game.description}</p>
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Tags">
              {game.tags.map((t) => (
                <li key={t} className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">
                  #{t.replace(/\s+/g, "")}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="controls-title" className="mt-6">
            <h2 id="controls-title" className="font-display text-lg font-bold uppercase tracking-wide">
              Controls
            </h2>
            <div className="mt-3 grid gap-4 md:grid-cols-[1.4fr_1fr]">
              <div className="rounded-2xl border border-border bg-surface/80 p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Keyboard and mouse</h3>
                <dl className="mt-3 grid gap-2">
                  {game.controls.map((c) => (
                    <div key={c.action} className="flex items-center justify-between gap-4 rounded-lg bg-surface-2/60 px-3 py-2 text-sm">
                      <dt className="flex flex-wrap gap-1">
                        {c.keys.map((k) => (
                          <kbd key={k} className="rounded-md border border-border-strong border-b-2 bg-surface px-2 py-0.5 font-mono text-xs">
                            {k}
                          </kbd>
                        ))}
                      </dt>
                      <dd className="text-right text-muted">{c.action}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="rounded-2xl border border-border bg-surface/80 p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Touch</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{game.touchControls}</p>
              </div>
            </div>
          </section>
        </div>

        <aside aria-labelledby="game-lb-title" className="lg:sticky lg:top-24 lg:self-start">
          <h2 id="game-lb-title" className="mb-3 font-display text-lg font-bold uppercase tracking-wide">
            Leaderboard
          </h2>
          <LeaderboardTabs scope={game.slug} scopeLabel={game.title} />
          <p className="mt-3 text-xs text-subtle">{game.pass === "zlink" ? "Members only: ZLink+ players against each other." : "Sign in to save your scores to the board."}</p>
        </aside>
      </div>
    </div>
  );
}
