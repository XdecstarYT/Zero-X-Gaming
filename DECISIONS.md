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

## Phase 2

11. **Games put on hold (user request).** Phase 3 and 5 are deferred. The four games are registered in the `games`
    table as `coming_soon`, so `submit_score()` refuses scores for them until one ships.
12. **Supabase project `zero-x-gaming` in Sydney (`ap-southeast-2`)**, a new free-tier project, so the account's
    other apps are left untouched.
13. **Publishable key, no service-role key in the app.** All privileged writes (scores, streaks, XP, badges) go
    through `SECURITY DEFINER` Postgres functions that check `auth.uid()`. That leaves no server secret to leak and
    means no Edge Function to deploy.
14. **Score validation is a Postgres function (`submit_score`), not an Edge Function.** It lives next to the data,
    is atomic with the insert, and rate limits use the `scores` table itself. Per-game limits (`max_score`,
    `max_score_per_second`) are placeholder values, to be tuned when each game ships.
15. **Leaderboards are exposed as a read-only function (`get_leaderboard`) instead of SQL views.** A view would
    either run as its owner and bypass RLS (flagged by Supabase's linter), or need `scores` to be publicly readable.
    The function returns only rank, username, avatar, XP, and best score, never raw rows. Supabase's advisor lists
    it (and the other two RPCs) as intentionally callable `SECURITY DEFINER` functions.
16. **Profiles are public; everything else personal is owner-only.** Username, avatar, and XP must appear on
    leaderboards. Column-level grants stop players from editing their own `xp`. Earned badges are public so they
    can show on profiles.
17. **Usernames are auto-generated on signup** from the provider name or email prefix, sanitised to
    `[A-Za-z0-9_]{3,20}`, and made unique case-insensitively. Players can rename themselves from the profile page.
18. **Email + password, not magic links.** Players expect it and it works with password managers. OAuth covers
    Google and Discord.
19. **Guest favorites merge into the account on sign-in, and sign-out clears them from the device.** "Recently
    played" stays device-local until games exist; `play_sessions` will record real runs.
20. **Leaderboards UI still uses mock data.** No games exist to produce scores, so wiring
    `get_leaderboard()` into the UI waits for Phase 4 (the function is built and tested).
21. **The session is refreshed in `src/proxy.ts`** (Next 16's rename of middleware) with `auth.getClaims()`. The
    home, game, leaderboard, and settings pages stay static; `/games` (search params), `/profile` and `/auth/*` are
    dynamic.
