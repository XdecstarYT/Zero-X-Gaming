"use client";

import { useState } from "react";
import { GameCard } from "@/components/game/GameCard";
import { CardRow, CardRowItem } from "@/components/layout/Section";
import { cn } from "@/lib/cn";
import { COLLECTIONS, collectionGames } from "@/lib/spotlight";

/** "Browse by vibe": pick a mood, get the games for it. */
export function Collections() {
  const [id, setId] = useState(COLLECTIONS[0].id);
  const c = COLLECTIONS.find((x) => x.id === id) ?? COLLECTIONS[0];
  const games = collectionGames(c);
  return (
    <div data-testid="collections">
      <div role="tablist" aria-label="Collections" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {COLLECTIONS.map((x) => {
          const on = x.id === id;
          return (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="collection-panel"
              data-testid={`collection-${x.id}`}
              onClick={() => setId(x.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                on ? "border-cyan bg-cyan/15 text-text" : "border-border bg-surface text-muted hover:border-border-strong hover:text-text",
              )}
            >
              <span aria-hidden>{x.emoji}</span>
              {x.title}
              <span className="text-xs text-subtle">{collectionGames(x).length}</span>
            </button>
          );
        })}
      </div>
      <div id="collection-panel" role="tabpanel" aria-label={c.title} className="mt-5">
        <p className="mb-3 text-sm text-muted">{c.blurb}</p>
        <CardRow label={c.title}>
          {games.map((g) => (
            <CardRowItem key={g.slug}>
              <GameCard game={g} />
            </CardRowItem>
          ))}
        </CardRow>
      </div>
    </div>
  );
}
