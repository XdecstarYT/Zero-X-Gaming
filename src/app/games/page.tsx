import type { Metadata } from "next";
import { GameLibrary, type LibraryFilters } from "@/components/game/GameLibrary";
import { CATEGORIES } from "@/lib/catalog";
import { isGameSort } from "@/lib/game-query";

export const metadata: Metadata = { title: "Games" };

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function GamesPage(props: PageProps<"/games">) {
  const sp = await props.searchParams;
  const category = first(sp.category);
  const sort = first(sp.sort);

  const initial: LibraryFilters = {
    q: first(sp.q) ?? "",
    category: CATEGORIES.some((c) => c.id === category) ? (category as LibraryFilters["category"]) : "all",
    sort: isGameSort(sort) ? sort : "popular",
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-magenta">Library</p>
      <h1 className="font-display text-3xl font-black uppercase tracking-tight sm:text-4xl">All games</h1>
      <p className="mt-2 max-w-2xl text-muted">Every game is original, free, and runs right in your browser.</p>
      <div className="mt-8">
        <GameLibrary initial={initial} />
      </div>
    </div>
  );
}
