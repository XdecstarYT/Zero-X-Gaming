"use client";

import { useSyncExternalStore } from "react";
import { useLibrary } from "@/store/library";
import { GAMES } from "@/lib/mock-data";
import { timeAgo } from "@/lib/format";
import { GameCard } from "./GameCard";
import { GameCardSkeleton } from "@/components/ui/Skeleton";
import { CardRow, CardRowItem } from "@/components/layout/Section";
import { LinkButton } from "@/components/ui/Button";

const subscribeNoop = () => () => {};

export function ContinuePlaying() {
  const hydrated = useLibrary((s) => s.hydrated);
  const recent = useLibrary((s) => s.recent);
  // Only compute relative times on the client, after hydration.
  const isClient = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  if (!hydrated || !isClient) {
    return (
      <CardRow label="Loading recently played games">
        {Array.from({ length: 4 }, (_, i) => (
          <CardRowItem key={i}>
            <GameCardSkeleton />
          </CardRowItem>
        ))}
      </CardRow>
    );
  }

  const items = recent
    .map((r) => ({ play: r, game: GAMES.find((g) => g.slug === r.slug) }))
    .filter((x): x is { play: typeof x.play; game: NonNullable<typeof x.game> } => Boolean(x.game))
    .slice(0, 4);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-border bg-surface/50 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-sm font-bold uppercase tracking-wider">Nothing here yet</p>
          <p className="mt-1 text-sm text-muted">Games you play show up here so you can jump straight back in.</p>
        </div>
        <LinkButton href="/games" variant="secondary" size="sm">
          Browse games
        </LinkButton>
      </div>
    );
  }

  return (
    <CardRow label="Recently played games">
      {items.map(({ play, game }) => (
        <CardRowItem key={game.slug}>
          <GameCard game={game} meta={`Played ${timeAgo(play.lastPlayedAt)}`} />
        </CardRowItem>
      ))}
    </CardRow>
  );
}
