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

## Post-launch additions

45. **Intro splash ("induction ad")** is a full-screen, CSS- and SVG-only brand sequence shown once per browser
    session:
    - The X mark draws itself, then come a glitch-in logo, the tagline, a game-title reel, and a neon grid floor.
    - It's server-rendered, so first-time visitors see no flash of the page.
    - A tiny inline `<head>` script hides it before paint for returning visitors.
    - Skip it with the button, Esc, Enter, Space, any key, or a tap. It auto-dismisses after about 5 s (1.6 s static
      with reduced motion).
    - The page behind is `inert` while it plays.

    E2E specs use a fixture that marks the intro as seen, and `intro.spec.ts` covers the intro itself.

46. **Neon Siege (FPS)** is a raycast ("2.5D") shooter on Canvas 2D, not WebGL. It reuses the shared engine, stays
    tiny, runs on low-end phones, and keeps the code consistent with the other games. The rules
    (`map/path/world/bots/solo.ts`) are pure and seeded, and unit tested with simulations.
47. **Bot AI plays fair.** Bots use a vision cone plus line of sight, hearing up close, and noticing who shot them.
    Their state machine runs patrol → hunt → engage → retreat to cover, with A* navigation. Difficulty only changes
    reaction time, aim error, turn speed, burst discipline, and a weaker, less accurate bot rifle. In solo waves,
    drones also get a noisy "signal pulse" of the player's area every 4 s, so they converge instead of wandering.
    That tuning came from simulation: without it, first contact took 13–105 s and the player died in 0.4 s.
48. **Only solo Siege mode is ranked.** Its ceiling is 1,500 pts/s, which an aimbot simulation stays under. The
    `games.category` check gains `shooter`.
49. **Games can ask the platform to pause** (`requestPause`), because Esc releases pointer lock without delivering
    a keydown. A final score can be flagged `ranked: false` so it's never submitted.
50. **Online multiplayer is peer-to-peer over Supabase Realtime** (broadcast plus presence), not a game server. It
    needs zero infrastructure and works for guests on the free tier. The trade-off is trust: clients decide their
    own hits (the receiving owner caps damage per hit), so online matches are **unranked** and never call
    `submit_score`. A dedicated authoritative server (e.g. a Supabase Edge Function or a small WebSocket service)
    would be needed to rank them.
51. **The host is the oldest peer by presence join time**, so every client agrees without extra messages. Bots
    live on the host. On host migration, the next-oldest peer adopts the bots from its last snapshot and keeps
    their IDs, so kill feeds and scoreboards stay consistent.
52. **A BroadcastChannel transport for same-browser rooms.** It makes multiplayer testable in E2E (two real tabs),
    lets you try multiplayer without Supabase, and runs the exact netcode path the Supabase transport does. An
    in-memory hub drives the unit tests (sync, hit ownership, kill credit, bots across the network, host migration,
    match end, damage clamping).
53. **Neon Siege mirrors its canvas HUD into a visually hidden status region**: score, room, player count, health,
    ammo, and fighters. Screen reader users can follow the match, and tests can assert on it.
54. **The intro's animations are compositor-only.** The grid floor scrolls via `transform` on a tiled layer (not
    `background-position`), there's no full-screen `mix-blend-mode`, no animated `filter`, and no fade-in from
    opacity 0. The first version cost about 1.4 s of blocking time and dropped Lighthouse on `/` to 61; after the
    fix it scores 91–95 with the intro playing. Invite links (`?room=`) skip the intro.
55. **Mobile-first navigation.** Phones get a fixed bottom tab bar (Home, Games, Pass, Ranks, Profile) with 56px
    targets and safe-area padding, replacing the hamburger menu. The header keeps the logo, settings, and a compact
    account control. `viewport-fit=cover` plus `env(safe-area-inset-*)` handles notches and home indicators.
56. **Immersive play on touch devices.** Pressing Play turns the stage into a fixed, full-viewport (`100dvh`)
    surface. The platform requests element fullscreen, and landscape orientation lock for games that prefer it
    (`Game.orientation`). Both are best-effort: iOS Safari ignores them, and the fixed layout still fills the
    screen. Page scroll and pull-to-refresh are disabled while playing. Leaving fullscreen with the back gesture
    pauses the game. Pause sits at top-center, clear of every game's controls, and Exit lives in the pause and
    game-over overlays. Landscape games show a dismissable "rotate your phone" card in portrait.
57. **Neon Siege became a battle royale on a 2D-grid simulation with a 3D view.** The rules still run on the 1 m grid
    (A*, raycast hitscan, collision), so they stay pure, seeded, fast in unit tests, and shared by the bots, online
    play, and both renderers. The three.js view is a presentation layer: buildings get storeys, roofs, and windows,
    and trees get canopies that are visual only. Shots are horizontal, with no vertical aim. That trade keeps the
    netcode and bot AI simple and makes touch controls one-thumb friendly.
58. **All 3D assets are procedural.** Textures are painted on canvases at startup, and models (guns, characters,
    town) are built from primitives. There's nothing to download or license, the chunk stays small (three.js plus
    our code, lazy-loaded only when you play or open the Locker), and every design is original. Static geometry is
    merged per material, so the whole town draws in a couple of dozen calls.
59. **Quality tiers and a fallback.** High adds shadows, antialiasing, and pixel ratio up to 2. Low (the default on
    touch devices) drops those and pulls the fog in. Classic 2D is the old raycaster, used automatically if WebGL
    fails. The HUD is DOM, so it's identical and crisp across all three.
60. **The battle pass is free and server-authoritative for signed-in players.** No purchases; every tier is earned
    by playing. `record_siege_match` accepts only plausible match stats:
    - bounded kills, placement, damage, chests, and time;
    - damage limited to 200 per second survived;
    - a match can't last longer than the time since the previous one was recorded.
    It computes XP and challenge progress itself, so clients never write progress tables. The catalogue lives in
    TypeScript and is mirrored in SQL, and a unit test fails if they drift. Guests progress on-device.
61. **Score caps were re-tuned for the battle royale** (`max_score` 5,000, 150 pts/s). Leaderboard entries from
    the earlier wave-survival mode stay in the history. `?siege=quick` speeds the storm up for testing, and those
    matches are unranked.
62. **Two site themes on one set of tokens.** Classic (dark neon) and X-1+ (light, friendly) share every CSS
    variable name, so components don't know which is active. X-1+ also swaps type (rounded Nunito, no all-caps
    headings), radii and shadows via variables. The saved choice is applied by an inline `<head>` script before
    first paint, so there's no flash. Accent colours were chosen per theme for WCAG AA (axe runs on both).
    Text drawn over game art keeps fixed light colours in both themes.
63. **Toward photorealism, still fully procedural.**
    - Textures double in resolution on High and get tangent-space normal maps derived from each height field.
    - Trees are built SpeedTree-style from alpha-tested foliage cards (leaf clusters, pine sprays) around bark
      trunks.
    - Tens of thousands of wind-swayed grass tufts are instanced.
    - Roads get sidewalks, curbs and street lamps, and buildings get plinths.
    - The sky has a drifting cloud layer.
    - High adds GTAO ambient occlusion, 4K sun shadows, a filmic grade and SMAA. Bloom was tried and removed,
      because daylight whites blew out.
    - Characters gained faces, shoulders, tapered limbs, hands, gear and a woven-cloth normal map.
    - Low (the phone default) keeps grass and cards but skips the post-processing, and uses blob contact shadows.
64. **Coins, Cash Cups and the Item Shop are an earn-only economy.**
    - Coins come only from Cash Cups: every third ranked match, played on Hard, pays 50 / 20 / 5 to the top 3.
    - They're spent on the battle pass (200) or Item Shop drops.
    - There is no real-money purchase anywhere.
    - For signed-in players the server owns everything. It decides whether a match is a Cash Cup from its own
      match count, and a wallet plus append-only ledger is changed only by `SECURITY DEFINER` functions.
      `buy_battle_pass` and `buy_shop_item` check the balance, ownership and the live drop window.
    - Guests run the same rules on-device.
    - The battle pass now gates tier rewards. XP and tiers still progress without it, and buying it grants
      every tier already reached. Rewards earned before the pass existed stay owned.
    - The shop is organised as timed "drops" (DROP 1: 30 Sep – 14 Oct), mirrored in `shop_items`, and a unit
      test keeps the TypeScript and SQL catalogues in sync.
65. **The battle pass got a free lane of coins.** Tiers 5/10/15/20/25 pay 25 coins and tier 30 pays 50: 175 over the
    season, for everyone. A database trigger on `season_progress.xp` pays them, so any XP source is covered, and
    guests get the same on-device. The paid lane keeps one cosmetic per tier. The track is shown as two
    horizontal lanes that scroll to your current tier.
66. **Matches end on a results screen, not a toast.** It shows placement, stats, the Cash Cup prize ladder with
    your payout, XP with an animated tier bar and "TIER UP", unlocks, completed challenges and coin totals.
    Continue hands off to the platform's game-over, which still submits the leaderboard score. The rewards
    promise resolves while you read, and unranked matches say so.
67. **Item images are rendered, not drawn.** One shared offscreen WebGL renderer takes studio shots of outfits
    (the real rigged character) and wraps (the real rifle). Renders are queued one at a time and cached as data
    URLs, then used by the shop, Locker and battle pass, with the flat illustrations as fallback. The shop adds a
    3D inspect dialog with a turntable and blurb, confirm-to-buy, and a full-screen rarity burst with confetti
    and "Equip now". Motion respects the reduce-motion settings.
68. **Accounts are "ZXG accounts": an account name and a password, no email.** Supabase Auth still needs an
    email, so the name maps to `<name>@zxg-acc.invalid` (a reserved, undeliverable domain). The profile shows a
    `ZXG-ACC-XXXXXXXX` tag derived from the user id. This needs "Confirm email" off in Supabase, and there's no
    password reset (there's nowhere to send one). OAuth buttons were removed from the dialog to keep it simple.
69. **Trenches reuses the Neon Siege engine instead of forking it.** The shell takes a `ShellConfig` (slug and
    custom menu), transports became generic over the message type with a channel namespace, and the mode
    interface gained optional hooks (map markers, name-tag colours, result title, return-to-lobby). Everything is
    opt-in, so Neon Siege is unchanged.
70. **Trenches lobbies are host-authoritative snapshots over the same P2P channels.** The oldest peer owns the
    lobby state (teams auto-balanced, ready, class, phase, seed, match id) and rebroadcasts it every 1.5 s;
    others send requests. Starting flips the phase and bumps the match id, which every client (and anyone who
    joins mid-battle) treats as "load in". The public lobby list is Supabase presence, so it needs no table.
    With no authoritative server, matches are unranked and don't reach the leaderboards.
