# Decisions

Deviations from, or interpretations of, the master prompt. Newest last.

## Phase 1

1. **Next.js 16 + Tailwind v4.** These were the current stable versions at project start. Tailwind v4 is CSS-first,
   so design tokens live in `globals.css` (`:root` vars + `@theme`) instead of a `tailwind.config` file.
2. **Procedural SVG cover art (`GameArt`) instead of image files.** The hub ships no image payload, the art stays on
   brand, and there are no licensing questions. Real key art can replace it per game later.
3. **Guest state in localStorage (Zustand `persist`).** Favorites, recently played, and settings already work for
   guests. In Phase 2 they sync to `favorites` / `play_sessions` for signed-in users, and localStorage stays as the
   guest fallback.
4. **"Recently played" currently means "opened the game page".** It switches to "finished a run" once the games
   exist (Phase 3).
5. **Settings page shipped in Phase 1** (sound, music, volume, reduce motion, key bindings). The reduce-motion toggle
   belongs to the design system, so it made sense to build it now.
6. **XP curve implemented early.** `XPBar` needs it, so `src/lib/xp.ts` already has it: `100 * level^1.5`, rounded to
   the nearest 10, max level 100. Phase 4 may retune the constants; the tests pin down the behaviour.
7. **"New" badge** means released within 14 days of the catalog's newest game. It is anchored to the catalog rather
   than the clock, so SSR and client markup never disagree.
8. **Leaderboards use deterministic mock data**, seeded by game and period, until Phase 4.
9. **`@types/node@22`** (not 20), because Vitest 5 requires it. **`@playwright/test` is pinned to 1.56.1** to match the
   Chromium build preinstalled in the dev container.
10. **The sign-in modal is a placeholder**: disabled provider buttons plus a "Play as guest" action. The real flow
    lands in Phase 2.
