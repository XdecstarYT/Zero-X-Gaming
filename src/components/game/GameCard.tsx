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

/**
 * Whole card is clickable via a stretched link; the favourite button sits
 * above it so we never nest interactive elements.
 */
export function GameCard({ game, className, meta }: { game: Game; className?: string; meta?: string }) {
  const isNew = isNewRelease(game, GAMES);
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-lg border border-border bg-surface shadow-card transition-[border-color,box-shadow,transform] duration-200 ease-zx",
        "hover:-translate-y-0.5 hover:border-cyan/60 hover:shadow-glow-cyan focus-within:border-cyan/60",
        className,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <GameArt game={game} className="transition-transform duration-500 ease-zx group-hover:scale-[1.04]" />
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
        <h3 className="font-display text-base font-bold tracking-wide">
          <Link
            href={`/games/${game.slug}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {game.title}
          </Link>
        </h3>
        <p className="mt-0.5 line-clamp-1 text-sm text-muted">{meta ?? game.tagline}</p>
        <div className="mt-3 flex items-center justify-between">
          <Rating value={game.rating} />
          <span className="text-xs text-muted">{formatCompact(game.plays)} plays</span>
        </div>
      </div>
      <FavoriteButton slug={game.slug} title={game.title} className="absolute right-3 top-3 z-10" />
      {/* Focus ring for the stretched link, drawn on the card. */}
      <span
        className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-cyan opacity-0 group-has-[a:focus-visible]:opacity-100"
        aria-hidden
      />
    </article>
  );
}
