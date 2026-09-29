import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RecentPlay } from "@/lib/types";

const MAX_RECENT = 12;

/**
 * Guest-side favourites and recently played. Synced to Supabase
 * (`favorites`, `play_sessions`) for signed-in players in Phase 2.
 */
export interface LibraryState {
  hydrated: boolean;
  favorites: string[];
  recent: RecentPlay[];
  toggleFavorite: (slug: string) => void;
  recordPlay: (slug: string, score?: number) => void;
  clearRecent: () => void;
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      hydrated: false,
      favorites: [],
      recent: [],
      toggleFavorite: (slug) =>
        set((s) => ({
          favorites: s.favorites.includes(slug) ? s.favorites.filter((f) => f !== slug) : [slug, ...s.favorites],
        })),
      recordPlay: (slug, score = 0) =>
        set((s) => {
          const prev = s.recent.find((r) => r.slug === slug);
          const entry: RecentPlay = {
            slug,
            lastPlayedAt: new Date().toISOString(),
            bestScore: Math.max(prev?.bestScore ?? 0, score),
          };
          return { recent: [entry, ...s.recent.filter((r) => r.slug !== slug)].slice(0, MAX_RECENT) };
        }),
      clearRecent: () => set({ recent: [] }),
    }),
    {
      name: "zx-library",
      version: 1,
      skipHydration: true,
      partialize: (s) => ({ favorites: s.favorites, recent: s.recent }),
      onRehydrateStorage: () => () => useLibrary.setState({ hydrated: true }),
    },
  ),
);
