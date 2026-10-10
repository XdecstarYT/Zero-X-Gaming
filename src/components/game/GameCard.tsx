import Link from "next/link";
import type { Game } from "@/lib/types";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/cn";
import { isNewRelease } from "@/lib/game-query";
import { GAMES } from "@/lib/catalog";
import { Badge } from "@/components/ui/Badge";
import { Rating } from "@/components/ui/Rating";
import { GameArt } from "./GameArt";
import { FavoriteButton } from "./FavoriteButton";
import { TiltCard } from "@/components/ui/TiltCard";
import { gameHref } from "@/lib/nextx";

/**
 * Whole card is clickable via a stretched link; the favourite button sits
 * above it so we never nest interactive elements.
 */
export function GameCard({ game, className, meta }: { game: Game; className?: string; meta?: string }) {
  const isNew = isNewRelease(game, GAMES);
  return (
    <TiltCard className={cn("h-full rounded-xl", className)}>
    <article
      className={cn(
        "zx-ring group relative h-full overflow-hidden rounded-xl border border-border bg-surface shadow-card transition-[border-color,box-shadow] duration-300 ease-zx",
        "hover:border-transparent hover:shadow-[0_24px_60px_-24px_rgb(0_0_0/0.65)] focus-within:border-transparent",
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <GameArt game={game} className="transition-transform duration-700 ease-zx group-hover:scale-[1.07]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent opacity-80" aria-hidden />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <Badge tone="neutral" className="!border-white/10 !bg-black/75 !text-white backdrop-blur">
            {game.category}
          </Badge>
          {game.status === "coming_soon" ? (
            <Badge tone="warning" className="!border-[#ffcb3d]/40 !bg-black/75 !text-[#ffcb3d] backdrop-blur">
              Soon
            </Badge>
          ) : (
            isNew && (
              <Badge tone="magenta" className="!border-[#ff6fcf]/40 !bg-black/75 !text-[#ff6fcf] backdrop-blur">
                New
              </Badge>
            )
          )}
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-display text-base font-bold tracking-wide transition-colors group-hover:text-cyan">
          <Link
            href={gameHref(game.slug)}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {game.title}
          </Link>
        </h3>
        <p className="mt-0.5 line-clamp-1 text-sm text-muted">{meta ?? game.tagline}</p>
        <div className="mt-3 flex min-h-5 items-center justify-between gap-2">
          {game.ratingCount > 0 ? (
            <Rating value={game.rating} />
          ) : (
            <ul className="flex min-w-0 gap-1.5 overflow-hidden" aria-label="Tags">
              {game.tags.slice(0, 2).map((t) => (
                <li key={t} className="truncate rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                  {t}
                </li>
              ))}
            </ul>
          )}
          {game.plays > 0 ? (
            <span className="shrink-0 text-xs text-muted">{formatCompact(game.plays)} plays</span>
          ) : game.pass ? (
            <span className="shrink-0 text-xs font-semibold text-violet">{game.pass === "sports-plus" ? "Sports+" : "Edition"}</span>
          ) : (
            <span className="shrink-0 text-xs font-semibold text-muted">Free</span>
          )}
        </div>
      </div>
      <FavoriteButton slug={game.slug} title={game.title} className="absolute right-3 top-3 z-10" />
      {/* Focus ring for the stretched link, drawn on the card. */}
      <span
        className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-cyan opacity-0 group-has-[a:focus-visible]:opacity-100"
        aria-hidden
      />
    </article>
    </TiltCard>
  );
}
