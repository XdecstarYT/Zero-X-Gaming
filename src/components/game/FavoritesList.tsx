"use client";

import { useLibrary } from "@/store/library";
import { GAMES } from "@/lib/catalog";
import { GameCard } from "./GameCard";
import { GameCardSkeleton } from "@/components/ui/Skeleton";
import { CardRow, CardRowItem } from "@/components/layout/Section";

export function FavoritesList() {
  const hydrated = useLibrary((s) => s.hydrated);
  const favorites = useLibrary((s) => s.favorites);

  if (!hydrated) {
    return (
      <CardRow label="Loading favorites">
        {Array.from({ length: 2 }, (_, i) => (
          <CardRowItem key={i}>
            <GameCardSkeleton />
          </CardRowItem>
        ))}
      </CardRow>
    );
  }

  const games = favorites.map((s) => GAMES.find((g) => g.slug === s)).filter((g) => g !== undefined);

  if (games.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
        No favorites yet. Tap the heart on any game to pin it here.
      </p>
    );
  }

  return (
    <CardRow label="Favorite games">
      {games.map((g) => (
        <CardRowItem key={g.slug}>
          <GameCard game={g} />
        </CardRowItem>
      ))}
    </CardRow>
  );
}
