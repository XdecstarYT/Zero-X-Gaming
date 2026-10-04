"use client";

import { useDeferredValue, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CATEGORIES, GAMES } from "@/lib/catalog";
import { queryGames, SORT_OPTIONS, type GameSort } from "@/lib/game-query";
import type { GameCategory } from "@/lib/types";
import { cn } from "@/lib/cn";
import { GameCard } from "./GameCard";
import { Button } from "@/components/ui/Button";

export interface LibraryFilters {
  q: string;
  category: GameCategory | "all";
  sort: GameSort;
}

export function GameLibrary({ initial }: { initial: LibraryFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initial);
  const deferredQ = useDeferredValue(filters.q);
  const results = queryGames(GAMES, { search: deferredQ, category: filters.category, sort: filters.sort });

  function update(patch: Partial<LibraryFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.category !== "all") params.set("category", next.category);
    if (next.sort !== "popular") params.set("sort", next.sort);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const chips: { id: LibraryFilters["category"]; label: string }[] = [{ id: "all", label: "All" }, ...CATEGORIES];

  return (
    <div>
      <div className="zx-glass sticky top-20 z-30 flex flex-col gap-4 rounded-2xl border border-border/70 p-3 shadow-card md:flex-row md:items-center">
        <div className="relative flex-1">
          <label htmlFor="game-search" className="sr-only">
            Search games
          </label>
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            id="game-search"
            type="search"
            value={filters.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Search by name or tag…"
            className="h-11 w-full rounded-full border border-border bg-bg/70 pl-10 pr-4 text-sm placeholder:text-subtle focus:border-cyan focus:outline-none"
          />
        </div>
        <div role="radiogroup" aria-label="Sort" className="flex shrink-0 rounded-full border border-border bg-bg/70 p-1">
          {SORT_OPTIONS.map((o) => {
            const on = filters.sort === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => update({ sort: o.id as GameSort })}
                className={cn("rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors", on ? "bg-cyan text-bg" : "text-muted hover:text-text")}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="sr-only">Category</legend>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => {
            const active = filters.category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                onClick={() => update({ category: c.id })}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
                  active
                    ? "border-cyan bg-cyan/15 text-cyan"
                    : "border-border bg-surface text-muted hover:border-border-strong hover:text-text",
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <h2 className="sr-only">Results</h2>
      <p className="mt-6 flex items-baseline gap-2 text-sm text-muted" aria-live="polite">
        <span className="font-display text-2xl font-black text-text">{results.length}</span>{" "}
        <span>{results.length === 1 ? "game" : "games"}</span>
      </p>

      {results.length > 0 ? (
        <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((g) => (
            <li key={g.slug}>
              <GameCard game={g} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-border-strong bg-surface/60 p-12 text-center">
          <p className="font-display font-bold uppercase tracking-wider">No games match</p>
          <p className="mt-1 text-sm text-muted">Try a different search or category.</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => update({ q: "", category: "all" })}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
