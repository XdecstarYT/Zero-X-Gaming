# Zero X | Gaming

A browser-based gaming hub: discover, play, and compete in original web games. Dark, neon, fast.

**Status:** Phase 1 (hub UI) and Phase 2 (Supabase backend, auth, profiles) are complete. Games are on hold for now.
See [Roadmap](#roadmap) and [`DECISIONS.md`](./DECISIONS.md).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Zustand · Supabase (Postgres, Auth, RLS) ·
Vitest + Testing Library · Playwright. Deploy target: Vercel.

## Setup

Requires Node 20.9+ (developed on Node 22).

```bash
npm install
cp .env.example .env.local   # add the Supabase URL + publishable key (or leave empty for guest-only mode)
npm run dev                  # http://localhost:3000
```

Without Supabase env vars the app runs in **guest-only mode**. Everything works except accounts; favorites and
settings are stored on the device.

## Scripts

| Script                        | What it does                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev`                 | Dev server                                                                                  |
| `npm run build` / `npm start` | Production build / serve                                                                    |
| `npm run lint`                | ESLint (flat config)                                                                        |
| `npm run typecheck`           | Generates route types (`next typegen`) then `tsc --noEmit`                                  |
| `npm test`                    | Vitest unit + component tests                                                               |
| `npm run test:e2e`            | Playwright on desktop Chrome and Pixel 7 viewports (builds and starts the app on port 3100) |
| `npm run format`              | Prettier                                                                                    |

## Environment variables

| Var                                    | Scope  | Purpose                                                   |
| -------------------------------------- | ------ | --------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | client | Supabase project URL                                      |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client | Publishable key (`sb_publishable_…`). Safe in the browser |

No server-only secret is needed: every privileged write goes through Postgres functions guarded by RLS and
`auth.uid()`. Never add the `service_role` / secret key to this app.

## Supabase

Project: **zero-x-gaming** (`tbvaqinnbicxhlaqltik`, Sydney `ap-southeast-2`). The schema lives in
`supabase/migrations/` and has been applied to that project.

### Tables (RLS on all)

| Table                 | Who can read                    | Who can write                                                                |
| --------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| `games`               | everyone                        | nobody (admin/migrations only)                                               |
| `profiles`            | everyone (username, avatar, xp) | owner, `username` and `avatar_url` columns only; created by a signup trigger |
| `scores`              | owner                           | only via `submit_score()`                                                    |
| `achievements`        | everyone                        | nobody                                                                       |
| `player_achievements` | everyone (public badges)        | nobody (server-awarded, Phase 4)                                             |
| `favorites`           | owner                           | owner (insert / delete)                                                      |
| `play_sessions`       | owner                           | owner (insert)                                                               |
| `daily_streaks`       | owner                           | only via `touch_daily_streak()`                                              |

### Functions (RPC)

- `submit_score(game, score, duration_ms)`: the only way scores enter the database. It rejects anonymous
  callers, unknown games, and games that aren't `live`. It also rejects out-of-range scores, scores that are
  implausible for the run length (`games.max_score_per_second`), and more than 1 run per 5 s per game or
  120 runs per hour.
- `get_leaderboard(game | null, 'daily' | 'weekly' | 'all', limit)`: read-only boards, best score per player,
  UTC day / Monday-start week. With `null` it returns the global board ranked by XP.
- `touch_daily_streak()`: bumps or resets the caller's login streak. The app calls it once per sign-in.

All four games are registered with `status = 'coming_soon'`, so no scores can be submitted until a game ships.

### Dashboard setup (one-time, manual)

These can't be set from the code:

1. **Auth → URL Configuration:** set **Site URL** to the production URL. Add redirect URLs for
   `http://localhost:3000/auth/callback`, the production URL `/auth/callback`, and Vercel previews
   (`https://*-<team>.vercel.app/auth/callback`).
2. **Auth → Providers → Google:** create an OAuth client in Google Cloud Console with the redirect URI
   `https://tbvaqinnbicxhlaqltik.supabase.co/auth/v1/callback`, then paste the client ID and secret.
3. **Auth → Providers → Discord:** create an app at discord.com/developers with the same redirect URI, then
   paste the client ID and secret.
4. **Auth → Emails / SMTP (before launch):** the built-in mailer is rate-limited, so configure a custom SMTP
   provider.

Until steps 2 and 3 are done, the Google and Discord buttons show a provider error. Email sign-up works as soon
as step 1 is done.

### Changing the schema

Add a new file to `supabase/migrations/` (never edit an applied one). Apply it with the Supabase CLI
(`supabase db push`) or the dashboard SQL editor, then regenerate `src/lib/supabase/database.types.ts`.

## Architecture

```
src/
  proxy.ts                refreshes the Supabase session cookie on each request (Next 16 "proxy" = middleware)
  app/                    routes (App Router)
    page.tsx              home: hero, featured, continue playing, trending, new releases, ranks
    games/page.tsx        library: search, category filter, sort (synced to ?q=&category=&sort=)
    games/[slug]/         game page: player frame (placeholder), fullscreen, controls, leaderboard tabs
    profile/              server-rendered: account profile when signed in, guest profile otherwise
    auth/callback/        OAuth + email-confirmation landing (PKCE code or token_hash)
    auth/error/           friendly auth failure page
    leaderboards/ settings/ loading.tsx error.tsx not-found.tsx
  components/
    ui/                   design-system primitives: Button, Badge, XPBar, Modal, Toaster, LeaderboardTable, ...
    layout/               Navbar, AccountControl, SignInModal, UsernameForm, AuthProvider, Providers, ...
    game/                 GameCard, GameArt (procedural SVG covers), GameStage, GameLibrary, FavoriteButton, ...
  lib/
    supabase/             env, browser client, server client, generated Database types
    auth.ts               validation, safe redirects, error copy, favorites merge (tested)
    favorites-sync.ts     guest → account favorites merge + remote writes
    xp.ts game-query.ts format.ts keys.ts mock-data.ts
  store/                  Zustand: auth, settings (persisted), library (favorites/recent, persisted), toast
supabase/migrations/      SQL schema, RLS policies, functions
tests/e2e/                Playwright specs
```

**Auth flow:** `AuthProvider` subscribes to `onAuthStateChange` and mirrors the session into the `useAuth`
store (`loading → guest | signed_in`, or `disabled` without env vars). On sign-in it:

- loads the profile,
- calls `touch_daily_streak()`,
- merges the guest's local favorites into the account.

Favorites are updated optimistically and rolled back if the write fails. Signing out clears account favorites from
the device.

**Design tokens** live in `src/app/globals.css`. Raw values are CSS custom properties on `:root` (`--zx-*`),
mapped to Tailwind utilities via `@theme`. Fonts: Orbitron (display) and Space Grotesk (body).

**Persisted stores** use `skipHydration` and are rehydrated after mount, so server HTML matches the first client
render.

## Accessibility

- Skip link and a visible focus ring everywhere
- Native `<dialog>` modals
- ARIA tabs with arrow-key support
- `role="switch"` toggles and a `progressbar` XP bar
- Labelled form fields with `role="alert"` errors
- Polite live region for toasts
- Colour tokens that meet AA contrast

## Roadmap

- [x] **Phase 1:** project setup, design tokens, layout, navbar, home page with mock data
- [x] **Phase 2:** Supabase schema + RLS, auth (email, Google, Discord, guest), profiles
- [ ] **Games (on hold):** `GameModule` interface, Zero Dash, Grid Lock, Orbit, Blitz Trivia
- [ ] **Phase 4:** wire leaderboards to `get_leaderboard`, XP awards, achievements
- [ ] **Phase 6:** polish, a11y/perf audits (Lighthouse), deploy config
