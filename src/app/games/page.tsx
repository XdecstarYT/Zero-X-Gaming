import type { Metadata } from "next";
import { GameLibrary, type LibraryFilters } from "@/components/game/GameLibrary";
import { CATEGORIES, GAMES } from "@/lib/catalog";
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
    <div className="pb-10">
      <header className="relative overflow-hidden border-b border-border/60">
        <div className="zx-horizon opacity-60" aria-hidden />
        <span className="zx-outline pointer-events-none absolute -right-4 -top-6 select-none font-display text-[13rem] font-black leading-none sm:text-[18rem]" aria-hidden>
          {GAMES.length}
        </span>
        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-6 sm:pt-16">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-magenta">
            <span className="h-px w-6 bg-gradient-to-r from-magenta to-transparent" aria-hidden />
            The library
          </p>
          <h1 className="mt-2 font-display text-4xl font-black uppercase tracking-tighter sm:text-6xl">All games</h1>
          <p className="mt-3 max-w-2xl text-lg text-muted">Every game is original, free to start, and runs right in your browser.</p>
        </div>
      </header>
      <div className="mx-auto mt-8 max-w-7xl px-4 sm:px-6">
        <GameLibrary initial={initial} />
      </div>
    </div>
  );
}
