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

## Phase 3

22. **Games resumed (user request: "do all phases").**
23. **Plain Canvas 2D instead of Phaser 3.** Phaser adds roughly 1 MB (≈300 KB gzipped) per game page. These games
    need a loop, rectangles, and text, so a ~200-line shared engine (`src/games/engine/`: fixed-timestep loop,
    DPR-aware letterboxed canvas, WebAudio SFX, seeded RNG) keeps each game chunk small. The `GameModule`
    interface is engine-agnostic, so a Phaser game could still plug in later.
24. **Game rules are pure, seeded modules (`logic.ts`) separate from rendering (`index.ts`).** They're unit tested,
    including a bot simulation that checks real score rates stay under the server's `max_score_per_second`.
25. **The platform owns pause.** Esc or the pause key, the on-screen pause button, and tab-hidden all pause the
    game. Games only handle their own gameplay input while running.
26. **"Recently played" now means a finished run** (it used to mean opening the page), and it keeps the device
    best score.
27. **The per-game submission cooldown dropped from 5 s to 2 s**, because a runner can die quickly and players
    retry at once.
28. **The music toggle is stored but no game plays music yet.** Sound effects are synthesized with WebAudio, so
    there are no audio assets.

## Phase 4

29. **An XP ledger (`xp_events`) was added beyond the prompt's eight tables.** Daily and weekly global boards need
    XP earned _within_ a window, which a single `profiles.xp` total can't answer. It's append-only, owner-readable,
    and written only by server functions.
30. **XP rules (server-side only):**
    - A run earns `10 + min(floor(score / games.xp_divisor), 190)`.
    - The first visit each UTC day earns `10 × streak` (capped at 70).
    - Each badge adds its `xp_reward`.

    `award_xp()` and `grant_achievement()` are internal: execute is revoked from every client role.

31. **Achievements are awarded inside the same transaction as the triggering score or login**, so a badge can't
    be granted without the event that earned it:
    - First Run: any saved run.
    - Top Ten: top 10 on that game's daily board.
    - All-Rounder: a score in all four launch games.
    - On Fire: a 7-day streak.
32. **`submit_score` returns everything the game-over screen needs in one round trip:** PB flag, XP gained, new
    total, today's rank, and newly unlocked badges.
33. **Leaderboards are live everywhere (mock boards removed), each with its own empty, loading, error, and offline
    states.** The E2E suite stubs the RPC to stay deterministic.
34. **`mock-data.ts` was renamed `catalog.ts`.** Game copy and controls stay in code, while `games` and
    `achievements` in Supabase are the authoritative rows the server enforces.

## Phase 5

35. **Grid Lock:** a 6×6 board of 5 tile types, each with its own colour _and_ shape so colour-blind players can
    play. Players slide a whole row or column one step (wrapping). Lines of 3+ clear and cascades multiply points.
    A 90-second circuit timer runs, and misses cost 3 s. Its plausibility ceiling is 800 pts/s, because a
    superhuman greedy bot peaks near 520.
36. **Orbit:** steer a thrusting probe through planetary gravity wells, chain energy shards within 3 s for up to
    x4, and dodge debris that ramps up over time. A 2 s spawn shield (bounce plus no debris) stops instant deaths.
    Touch steering turns toward your finger, and a second finger boosts.
37. **Blitz Trivia renders real DOM instead of canvas**: buttons, focus management, and an `aria-live` prompt, so
    it works with screen readers. It has an original 90-question bank across 6 categories plus "Mixed". The clock
    pauses during the brief answer feedback.
38. **The game stage is 4:3 on phones and 16:9 from `sm` up.** Canvas games letterbox into the extra height,
    which leaves room for the on-screen pause button.
39. **Play stays disabled until hydration**, so a click during page load is never silently dropped.

## Phase 6

40. **Moderation hook: a `reports` table plus `report_content()`, and a `profiles.is_hidden` flag.** Reporting
    lives on leaderboard rows, since usernames are the only user-generated content today. Moderators work in the
    Supabase dashboard; building an admin UI is deferred until there's more user content.
41. **The CSP uses `'unsafe-inline'` for scripts.** Nonces would force dynamic rendering of every page and lose
    the static home and game pages. The policy still restricts `connect-src` to self plus Supabase, and blocks
    framing, plugins, and foreign form targets.
42. **CI uses placeholder Supabase values.** The E2E suite stubs every Supabase call it depends on, so CI needs no
    secrets and never touches the real project.
43. **Accessibility is enforced with axe in the E2E suite** (serious and critical violations fail the build), not
    just checked once by hand.
44. **Lighthouse was measured in the dev container, where Supabase is unreachable.** The resulting console errors
    cost Best Practices a few points (96). They don't occur when Supabase is reachable.
