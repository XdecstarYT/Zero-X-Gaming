import type { GameModule } from "../types";
import { NeonSiege } from "../neon-siege/index";
import { RoyaleController } from "../neon-siege/mode";
import { cupArena } from "../neon-siege/map";
import { readLoadout } from "../neon-siege/loadout";
import type { MatchStats } from "../neon-siege/royale";
import { CUP_FIELD, placePrize } from "@/lib/cash-cup";

/**
 * One Cash Cup tournament match: the Neon Siege shell (renderer, HUD, input,
 * results) with a battle royale of 55 on the Cash Cup Arena, on Hard. It drops
 * straight in (no menu); when the match ends, `onEnd` gets the stats so the
 * Cash Cup app can report them and pay out.
 */
export function cupMatch(opts: { name: string; seed?: number; onEnd: (stats: MatchStats | null) => void }): GameModule {
  let started = false;
  return new NeonSiege(undefined, undefined, undefined, {
    slug: "cash-cup",
    results: false,
    menu: ({ container, start }) => {
      container.append(Object.assign(document.createElement("p"), { className: "font-display text-xl uppercase tracking-[0.3em] text-[#10b981]", textContent: "Dropping in…" }));
      if (started) return;
      started = true;
      const loadout = readLoadout();
      start(
        new RoyaleController("hard", opts.seed ?? Date.now(), {
          outfit: loadout.outfit,
          name: opts.name,
          map: cupArena(),
          field: CUP_FIELD,
          tournament: { text: "CASH CUP TOURNAMENT", sub: `${CUP_FIELD} fighters · 1st wins ${placePrize(1)} ZX Cash`, color: "#10b981" },
        }),
      );
    },
    onMatchEnd: (mode) => {
      opts.onEnd(mode.stats());
      return null;
    },
  });
}
