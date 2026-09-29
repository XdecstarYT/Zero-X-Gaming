# Zero X | Gaming

A browser gaming hub: discover, play, and compete in original web games. Dark, neon, fast. No downloads.

**Status:** all six phases are complete, plus an intro splash and an arena FPS with bots and online play. The project
has:

- 5 games, including **Neon Siege**, an arena FPS with AI bots and online multiplayer
- a cinematic intro splash on each visitor's first page load in a session
- accounts
- server-validated scores
- XP, levels, badges, and streaks
- live leaderboards
- moderation reports
- CI

See [`DECISIONS.md`](./DECISIONS.md) for every deviation from the original brief.

| Game             | Genre          | Controls (keyboard / touch)                                                       |
| ---------------- | -------------- | --------------------------------------------------------------------------------- |
| **Zero Dash**    | Endless runner | Space / ↑ / W to jump, hold for higher · tap, hold for higher                     |
| **Grid Lock**    | Slide & match  | Arrows move the cursor, Shift + arrows slide · swipe along a row or column        |
| **Orbit**        | Gravity arcade | ← → steer, Space boost · drag to steer, second finger to boost                    |
| **Blitz Trivia** | 60 s quiz      | 1–4 or Tab + Enter · tap an answer                                                |
| **Neon Siege**   | Arena FPS      | WASD + mouse (click to lock), click/Space fire, R reload · stick, drag look, FIRE |

Esc (or the pause key from Settings) pauses any game. Games also pause when the tab is hidden.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Zustand · Supabase (Postgres, Auth, RLS) ·
Canvas 2D with a small shared engine · Vitest + Testing Library · Playwright + axe · Vercel.

## Setup

Requires Node 20.9+ (CI uses Node 22).

```bash
npm install
cp .env.example .env.local   # Supabase URL + publishable key (leave empty for guest-only mode)
npm run dev                  # http://localhost:3000
```

Without Supabase env vars the app runs in **guest-only mode**: every game is playable, while favorites, recent
plays, and settings stay on the device. Leaderboards show an "accounts not enabled" state.

## Scripts

| Script                        | What it does                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev`                 | Dev server                                                                            |
| `npm run build` / `npm start` | Production build / serve                                                              |
| `npm run lint`                | ESLint (flat config)                                                                  |
| `npm run typecheck`           | `next typegen` + `tsc --noEmit`                                                       |
| `npm test`                    | Vitest: XP curve, game rules (with bot simulations), auth helpers, stores, components |
| `npm run test:e2e`            | Playwright on desktop Chrome + Pixel 7: user flows, all 4 games, axe a11y scans       |
| `npm run format`              | Prettier                                                                              |

## Environment variables

| Var                                    | Scope  | Purpose                                                      |
| -------------------------------------- | ------ | ------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | client | Supabase project URL                                         |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client | Publishable key (`sb_publishable_…`), safe in the browser    |
| `NEXT_PUBLIC_SITE_URL`                 | build  | Canonical URL for sitemap and OG tags (defaults to Vercel's) |

No server secret is used anywhere. Never add the Supabase `service_role` / secret key to this app.

## Architecture

```
src/
  proxy.ts                    refreshes the Supabase session cookie (Next 16 "proxy" = middleware)
  app/                        routes: / · /games · /games/[slug] · /leaderboards · /profile · /settings · /auth/*
                              + loading/error/not-found states, manifest, robots, sitemap, OG image
  components/
    ui/                       design system: Button, Badge, XPBar, Modal, Toaster, LeaderboardTable, Skeleton, …
    layout/                   Navbar, AccountControl, SignInModal, UsernameForm, AuthProvider, …
    game/                     GameStage (hosts games), GameCard, GameArt, LeaderboardTabs, ReportDialog, …
  games/
    types.ts                  the GameModule contract
    registry.ts               slug → lazy import(), one chunk per game
    engine/                   fixed-timestep loop, DPR canvas, WebAudio SFX, seeded RNG, score emitter
    zero-dash/ grid-lock/ orbit/ blitz-trivia/
      logic.ts                pure, seeded rules (unit tested)
      index.ts                rendering + input, implements GameModule
  lib/                        catalog, XP curve, scores/progress clients, leaderboard hook, auth helpers, supabase/
  store/                      Zustand: auth, settings, library (favorites/recent), toast
supabase/migrations/          schema, RLS, functions (append-only history)
tests/e2e/                    Playwright specs (app flows + a11y)
```

### Neon Siege: bots and multiplayer

Neon Siege (`src/games/neon-siege/`) is a raycast ("2.5D") shooter on the same Canvas engine:

- `map.ts` holds the arena grid, DDA raycasting, line of sight, and collision.
- `path.ts` is A* pathfinding.
- `world.ts` covers fighters, hitscan weapons, damage, kills, and respawns.
- `render.ts` draws walls, depth-sorted sprites, the gun, and the HUD.

**Bot AI** (`bots.ts`) runs a state machine: patrol → hunt → engage → retreat to cover. Bots perceive fairly: a vision
cone plus line of sight, hearing up close, and noticing who shot them. They navigate with A* and fire in bursts.
Difficulty only changes reaction time, aim error, turn speed, burst discipline, and the bot rifle's
damage/spread/fire rate.

**Solo "Siege" mode** (`solo.ts`, ranked) is wave survival. Waves grow in size, bot HP, and skill. Kills score
`100 + 25 × wave` (max 300), and each cleared wave adds a bonus and heals you.

**Online deathmatch** (`net.ts`, `online.ts`, unranked) is free-for-all for up to 4 fighters, with bots filling
empty slots. The match runs to 15 kills or 5 minutes.

- **Rooms:** players join a room by code, or by an invite link with `?room=CODE`.
- **Transport:** Supabase Realtime broadcast plus presence, on channel `siege:<CODE>`. No server code or table is
  needed, and guests can play.
- **Local rooms:** without Supabase, or with `?net=local`, rooms are local to the browser (BroadcastChannel), so
  two tabs can play each other. The E2E suite uses this.
- **Ownership:** each client owns its own fighter. It decides its own hits and sends them to the victim's owner,
  who applies the damage (capped).
- **Host:** the oldest peer is the host. It runs the bots' AI and the match clock. If the host leaves, the
  next-oldest peer adopts the bots from its last snapshot.
- **Sync:** fighters broadcast state at 15 Hz, and other clients interpolate.
- **Unranked:** there's no authoritative server, so online scores never reach the leaderboards.

### Intro splash

`src/components/layout/IntroSplash.tsx` plays a CSS/SVG brand intro once per browser session. It's skippable with
the button, any key, or a tap, auto-dismisses after about 5 s, and is short and static with reduced motion. An inline
`<head>` script hides it before paint for returning visitors. E2E specs import `test` from `tests/e2e/fixtures.ts`,
which marks it as seen.

### Adding a game

1. Create `src/games/<slug>/logic.ts` (rules) and `index.ts`. The default export is a `GameFactory` returning a
   `GameModule`:
   ```ts
   interface GameModule {
     init({ root, settings }): void; // build canvas/DOM inside root
     start(): void;
     pause(): void;
     resume(): void;
     destroy(): void;
     onScore(listener): () => void; // emit { kind: "progress" | "final", score, durationMs? }
   }
   ```
2. Add one line to `src/games/registry.ts` and an entry in `src/lib/catalog.ts`.
3. Add a migration that inserts the game into `public.games` with `max_score`, `max_score_per_second`, and
   `xp_divisor`. Set `status = 'live'` when it ships.

The platform handles loading, pause UI, fullscreen, game over, score submission, XP, and badges.

### Scores, XP, and progression (all server-side)

- **`submit_score(game, score, duration_ms)`** is the only way a score enters the database. It rejects:
  - signed-out players
  - games that aren't live
  - scores over `max_score`, or higher than `max_score_per_second × duration`
  - more than 1 run per 2 s per game, or more than 120 runs per hour

  In the same transaction it awards run XP (`10 + min(score / xp_divisor, 190)`) and badges (First Run, Top Ten on
  today's board, All-Rounder). It returns the PB flag, XP gained, the new total, today's rank, and newly unlocked
  badges.

- **`touch_daily_streak()`** runs once per session. The first visit each UTC day earns `10 × streak` XP (max 70),
  and a 7-day streak unlocks "On Fire".
- **`get_leaderboard(game | null, 'daily' | 'weekly' | 'all', limit)`** returns read-only boards of best score per
  player (UTC days, Monday weeks). `null` gives the global XP board, built from the `xp_events` ledger for
  daily/weekly and from total XP for all-time. Hidden profiles are excluded.
- **Level curve:** the XP to go from level L to L+1 is `100 × L^1.5`, up to level 100 (`src/lib/xp.ts`).

### Tables (RLS on all)

| Table                 | Read                            | Write                                           |
| --------------------- | ------------------------------- | ----------------------------------------------- |
| `games`               | everyone                        | migrations only                                 |
| `profiles`            | everyone (username, avatar, xp) | owner: `username`, `avatar_url` only            |
| `scores`              | owner                           | `submit_score()` only                           |
| `xp_events`           | owner                           | server functions only                           |
| `achievements`        | everyone                        | migrations only                                 |
| `player_achievements` | everyone (public badges)        | server functions only                           |
| `favorites`           | owner                           | owner (insert/delete)                           |
| `play_sessions`       | owner                           | owner (insert)                                  |
| `daily_streaks`       | owner                           | `touch_daily_streak()` only                     |
| `reports`             | reporter                        | `report_content()` only (rate-limited, no self) |

### Moderation

Signed-in players can flag another player from any leaderboard row (offensive name, cheating, harassment,
other). To moderate, review `public.reports` in the Supabase dashboard (filter `status = 'open'`). Set
`profiles.is_hidden = true` to remove a player from every public board, then mark the report `actioned` or
`dismissed`. `target_type` is open-ended, so future user content can reuse the same pipeline.

## Supabase project

**zero-x-gaming** (`tbvaqinnbicxhlaqltik`, Sydney). All migrations in `supabase/migrations/` are applied.

One-time dashboard setup, which can't be done from code:

1. **Auth → URL Configuration:** set the Site URL to the production URL. Add redirect URLs for
   `http://localhost:3000/auth/callback`, `https://<prod-domain>/auth/callback`, and the Vercel preview pattern.
2. **Auth → Providers → Google / Discord:** create OAuth apps with the redirect URI
   `https://tbvaqinnbicxhlaqltik.supabase.co/auth/v1/callback`, then paste each client ID and secret.
3. **Auth → SMTP (before launch):** configure a custom SMTP provider, because the built-in mailer is heavily
   rate-limited.

**Schema changes:** add a new migration file (never edit an applied one), apply it with `supabase db push`, then
regenerate `src/lib/supabase/database.types.ts`.

## Deploying (Vercel)

1. Import the repo in Vercel. The framework preset is detected; no `vercel.json` is needed.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and optionally
   `NEXT_PUBLIC_SITE_URL`.
3. Add the production and preview callback URLs in Supabase (see above).

Production responses carry security headers (CSP, `X-Frame-Options: DENY`, `nosniff`, a strict referrer, and a
permissions policy) set in `next.config.ts`.

## Quality

- **CI** (`.github/workflows/ci.yml`) runs lint, typecheck, and unit tests, then a production build and the
  Playwright suite on desktop and mobile viewports.
- **Accessibility:**
  - axe (WCAG 2.1 A/AA) finds no serious or critical issues on any page, including in-game and in dialogs.
  - Every page has a skip link and visible focus.
  - Modals use native `<dialog>` and tabs use ARIA.
  - Grid Lock tiles are shape-coded as well as colour-coded.
  - Trivia is real DOM with a live region.
  - Reduce motion (OS setting or in-app toggle) is honoured by the UI and the games.
- **Lighthouse (mobile, production build):**

  | Page            | Performance | Accessibility |
  | --------------- | ----------- | ------------- |
  | `/`             | 96          | 100           |
  | `/games`        | 96          | 100           |
  | `/games/orbit`  | 97          | 100           |
  | `/leaderboards` | 97          | 100           |

  CLS is ≤ 0.06 on every page.

- **Performance:** each game is a separate lazy chunk loaded on Play, cover art is procedural SVG (no images), and
  fonts are self-hosted with `next/font`.
