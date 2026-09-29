# Zero X | Gaming

A browser-based gaming hub: discover, play, and compete in original web games. Dark, neon, fast.

**Status: Phase 1 complete** (setup, design tokens, layout, navbar, home page with mock data).
See [Roadmap](#roadmap) and [`DECISIONS.md`](./DECISIONS.md).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Zustand · Vitest + Testing Library · Playwright.
Supabase (Postgres, Auth, RLS, Realtime) arrives in Phase 2. Deploy target: Vercel.

## Setup

Requires Node 20.9+ (developed on Node 22).

```bash
npm install
cp .env.example .env.local   # not needed until Phase 2
npm run dev                  # http://localhost:3000
```

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

See `.env.example`. None are required for Phase 1.

| Var                             | Scope       | Purpose                           |
| ------------------------------- | ----------- | --------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | client      | Supabase project URL              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client      | Supabase anon key (RLS-protected) |
| `SUPABASE_SERVICE_ROLE_KEY`     | server only | Score validation function         |

## Architecture

```
src/
  app/                    routes (App Router)
    page.tsx              home: hero, featured, continue playing, trending, new releases, ranks
    games/page.tsx        library: search, category filter, sort (synced to ?q=&category=&sort=)
    games/[slug]/         game page: player frame, fullscreen, controls, leaderboard tabs, rating
    leaderboards/ profile/ settings/
    loading.tsx error.tsx not-found.tsx   skeleton, error, and 404 states
  components/
    ui/                   design-system primitives: Button, Badge, XPBar, Modal, Toaster,
                          LeaderboardTable, Skeleton, Rating, Toggle
    layout/               Navbar, Footer, Logo, Section/CardRow, SignIn modal, Providers
    game/                 GameCard, GameArt (procedural SVG covers), GameStage, GameLibrary, ...
  lib/                    pure logic (tested): xp.ts, game-query.ts, format.ts, keys.ts, mock-data.ts
  store/                  Zustand: settings (persisted), library (favorites/recent, persisted), toast
  games/                  (Phase 3) one folder per GameModule, lazy-loaded
tests/e2e/                Playwright specs
```

**Design tokens** live in `src/app/globals.css`. Raw values are CSS custom properties on `:root` (`--zx-*`), which
canvas games can read too. The `@theme` block maps them to Tailwind utilities (`bg-surface`, `text-cyan`,
`shadow-glow-cyan`, `ease-zx`, `animate-rise`, ...). Fonts are Orbitron (display) and Space Grotesk (body), loaded
with `next/font`.

**Reduced motion** is honoured from `prefers-reduced-motion` and from the in-app Settings toggle, which sets
`data-reduce-motion` on `<html>`.

**Persisted stores** use `skipHydration` and are rehydrated in `<Providers>` after mount, so server HTML always
matches the first client render. Components that depend on stored data show skeletons until `hydrated` is true.

**Data** is mocked in `src/lib/mock-data.ts` with the same shapes as `src/lib/types.ts`. Phase 2 can swap in the real
source without touching components.

## Accessibility

- Skip link and a visible focus ring everywhere
- Native `<dialog>` modal
- ARIA tabs with arrow-key support
- `role="switch"` toggles and a `progressbar` XP bar
- Polite live region for toasts
- Colour tokens that meet AA contrast

## Roadmap

- [x] **Phase 1**: project setup, design tokens, layout, navbar, home page with mock data
- [ ] **Phase 2**: Supabase schema + RLS, auth (email, Google, Discord, guest), profiles
- [ ] **Phase 3**: `GameModule` interface + Zero Dash + server-validated score submission
- [ ] **Phase 4**: leaderboards, XP/levels, achievements, daily streaks
- [ ] **Phase 5**: Grid Lock, Orbit, Blitz Trivia
- [ ] **Phase 6**: polish, a11y/perf audits (Lighthouse), deploy config
