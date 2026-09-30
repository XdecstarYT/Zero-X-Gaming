# Zero X | Gaming

A browser gaming hub: discover, play, and compete in original web games. Dark, neon, fast. No downloads.

**Status:** all six phases are complete, plus an intro splash and an arena FPS with bots and online play. The project
has:

- 2 full 3D shooters: **Trenches**, a realistic Great War shooter (five large fronts, diggable trenches,
  multiplayer lobbies, Conquest) and **Neon Siege**, a battle royale with AI bots, online rooms and a Season 1
  battle pass
- a cinematic intro splash on each visitor's first page load in a session
- ZXG accounts (account name + password, no email): online when Supabase is connected, otherwise saved on the
  device, so sign-up always works
- server-validated scores
- XP, levels, badges, and streaks
- live leaderboards
- moderation reports
- CI

See [`DECISIONS.md`](./DECISIONS.md) for every deviation from the original brief.

| Game             | Genre          | Controls (keyboard / touch)                                                       |
| ---------------- | -------------- | --------------------------------------------------------------------------------- |
| **Neon Siege**   | Battle royale  | WASD + mouse, click fire, right-click aim, E loot, 1–5 switch, R reload · stick, drag look, FIRE/AIM |
| **Trenches**     | War / Conquest | WASD + mouse, click fire, right-click aim, Shift sprint, C crouch, X prone, hold G dig, 1–5 switch, R reload, Tab scores · stick (push to sprint), drag look, FIRE/AIM/CRCH/PRONE/DIG |

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
| `npm run test:e2e`            | Playwright on desktop Chrome + Pixel 7: user flows, both games, Trenches lobbies, axe a11y scans       |
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

### Neon Siege: battle royale, 3D view, and Season 1

Neon Siege (`src/games/neon-siege/`) is a battle royale shooter. The simulation is 2D and grid-based: pure, seeded,
and unit tested. It's drawn by a three.js 3D view, or a Canvas 2D raycaster when WebGL is unavailable.

**Simulation**

- `map.ts` generates the Season 1 town "Ground Zero": 72 × 72 m with brick and concrete buildings (doors,
  partitions, windows), roads, a forest, a quarry, crate yards, chests, loot spots, and 24 spawns. It also does DDA
  raycasting, line of sight, and collision.
- `path.ts` is A* pathfinding.
- `items.ts` defines five weapons (pistol, SMG, assault rifle, pump shotgun, sniper), rarities from common to
  legendary (damage and reload bonuses), med kits, and shield potions.
- `world.ts` covers fighters, a 5-slot inventory, hitscan with pellets and falloff, shields, loot, chests, and
  consumables.
- `storm.ts` runs five shrinking circles with rising damage.
- `royale.ts` is the ranked mode: you plus 15 bots, last one standing. Score is `kills × 100 + placement bonus +
  2/s survived`.

**Bot AI** (`bots.ts`) runs a state machine: loot → rotate (to the safe zone) → heal → patrol → hunt → engage →
retreat. Bots pick the right gun for the range, use consumables, and perceive fairly (vision cone plus line of
sight, hearing, and noticing who shot them). Difficulty changes reaction time, aim, and a damage/spread handicap.

**Rendering** (`render3d.ts`, `three/`, lazy-loaded)

- Everything is procedural (no downloaded assets). High adds GTAO ambient occlusion, 4K shadows, a filmic grade and
  SMAA:
  - Normal-mapped textures: brick, concrete, asphalt, grass, wood, bark, roof tiles, stone.
  - Foliage-card trees, instanced wind-swayed grass, sidewalks, curbs and street lamps, and a cloud layer.
  - The atmospheric `Sky` with image-based lighting, a sun with soft shadows (High quality), and distance fog.
- The static town is merged by material into a couple of dozen draw calls.
- Characters are animated humanoids in their outfit (walk cycle, aiming, recoil, falling on elimination).
- The first-person weapon has sway, bob, recoil, reload and draw animations, and ADS zoom (a scope overlay for the
  sniper).
- Effects: muzzle flashes with light, tracers, impact sparks and dust, and a scrolling storm wall that tints the fog
  when you're caught outside.
- The HUD (`hud.ts`) is DOM: shield/health, hotbar, minimap with the storm, kill feed, and a loot/chest prompt.
- Touch controls: move stick, drag-to-look, a FIRE button you can drag to aim, AIM, reload, and tap-to-switch.
- Graphics: High, Low, or Classic 2D, remembered per device.
- Gunfire audio is synthesised per weapon and muffled with distance (`sfx.ts`).

**Coins, Cash Cups and the Item Shop** (`src/lib/economy.ts`, `supabase/migrations/20260930150000_coins_shop.sql`)

- Every third ranked match is a **Cash Cup** on Hard: 1st/2nd/3rd win 50/20/5 coins. The game menu shows when
  one is next.
- The **battle pass** costs 200 coins. XP always counts, and buying the pass unlocks every tier already reached.
  A **free lane** pays everyone 175 coins across the season (every 5 tiers).
- After every match, a **results screen** shows placement, stats, the Cash Cup payout, an animated XP/tier bar,
  unlocks and challenges.
- The **Item Shop** (`/shop`) sells timed drops. **DROP 1** has 4 outfits, 3 wraps and 2 banners. Items are shown
  as 3D-rendered product shots (`three/thumbs.ts`), with a 3D inspect view and an unlock celebration. Purchases
  land in the Locker.
- Coins are earn-only (no real money). They're server-validated for accounts and on-device for guests.

**Season 1 · Battle pass** (`src/lib/season.ts`, `supabase/migrations/20260930120000_season_one.sql`)

- Tiers: 30 tiers × 1,000 XP, each unlocking an outfit, weapon wrap, or banner. Everything is free to earn.
- Challenges: 3 daily and 4 weekly, rotating deterministically from a pool.
- Ranked matches award season XP through `record_siege_match`, which validates plausibility, rate-limits, advances
  challenges, and grants unlocks server-side. Guests progress on-device with the same rules.
- `/battle-pass` shows progress and rewards. `/locker` equips cosmetics, with a 3D preview (`set_loadout` checks
  ownership).
- A unit test checks the SQL seed against the TypeScript catalogue.

**Online deathmatch** (`net.ts`, `online.ts`, unranked) takes place in the same town with a fixed loadout (AR, shotgun, SMG, sniper, shields). It's free-for-all for up to 4 fighters, with bots filling
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

### Trenches: realistic war shooter with lobbies

Trenches (`src/games/trenches/`) reuses the Neon Siege engine, HUD and netcode through a `ShellConfig` (its own
slug and menu) and optional `ModeController` hooks (`markers`, `tagColor`, `resultTitle`, `afterResults`,
`realism`, `task`).

- **Fronts** (`fronts.ts`, `battlefield.ts`): five 150–190 m battlefields, each point-mirrored for fairness:
  **Gallipoli** (sand, scrub and gullies above the beach and the Aegean; the lines are close, Lone Pine is roofed),
  **The Somme** (chalky mud, a ruined village and the Lochnagar mine crater), **Verdun** (a concrete fort in a
  shattered, foggy forest), **Passchendaele** (rain, flooded shell holes, duckboard tracks, pillboxes, a ruined
  church) and **Vimy Ridge** (snow, a chain of mine craters). Each has support and front trench lines with
  traverses, communication trenches, saps, MG nests, wire belts with lanes, dugouts and five flags (A–E).
- **3D** (`neon-siege/three/front.ts`): the ground is built in 32 m chunks. Trench cells are real 1.35 m pits
  with earth walls, timber revetments and duckboards, sandbags on the lip facing the enemy; a dug cell rebuilds
  only its chunk. Each front has its own sky, light, fog, smoke and weather (rain, snow, dust).
- **Realism** (`match.ts`): stances (stand / crouch / prone) change speed, accuracy and silhouette; sprint drains
  stamina; mud and snow slow you; weapons hit about 2.2× harder; no crosshair (a dot, aim down sights); cover:
  soldiers in a trench are hard to hit and invisible when crouched (and can't fire out while crouched).
- **Digging:** hold G (or DIG) to dig the cell underfoot, then keep digging forward to extend the trench (3.6 s a
  cell, engineers 3× faster). Digs are broadcast; the host re-sends the full list every 5 s for late joiners.
- **Conquest** (`conquest.ts`): five flags, 150 tickets a side, 8 s captures (tug-of-war), ticket bleed for the
  side holding more flags, 1 ticket per death, 15-minute limit.
- **Classes:** Rifleman, Trench Raider, Medic, Sniper, Engineer. Teams: Iron Legion and Crimson Front.
- **Lobbies** (`lobby.ts`, `directory.ts`, `menu.ts`): create a lobby (name, front, 4v4 to 16v16, bot fill),
  browse the live list or join by code or invite link (`?lobby=CODE`). The host can change the front; players
  switch team, pick a class, ready up and chat. The host starts the battle for everyone; late joiners drop
  straight in, and after the match everyone returns to the lobby. The lobby list is a Supabase presence channel
  (`trenches:directory`), rooms are `trenches:<code>` broadcast channels, and `?net=local` runs both over
  BroadcastChannel between tabs.
- **Netcode:** each client owns its soldier (and stance), the oldest peer hosts bots, flags and tickets and
  broadcasts the Conquest state 4× a second. Matches are unranked.

### Themes

Settings → Theme switches between **Classic** (dark neon) and **X-1+** (light and friendly). Both are the same CSS
tokens in `src/app/globals.css` (`html[data-theme="x1"]` overrides them), applied before paint by `themeScript`.

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

1. **Auth → Sign In / Providers → Email:** turn **off** "Confirm email". ZXG accounts sign in with an account
   name and password (stored as `<name>@zxg-acc.invalid`), so no confirmation email can ever arrive.
2. **Auth → URL Configuration:** set the Site URL to the production URL. Add redirect URLs for
   `http://localhost:3000/auth/callback`, `https://<prod-domain>/auth/callback`, and the Vercel preview pattern.
3. **Auth → Providers → Google / Discord (optional, not used by the sign-in dialog):** create OAuth apps with the redirect URI
   `https://tbvaqinnbicxhlaqltik.supabase.co/auth/v1/callback`, then paste each client ID and secret.
4. **Auth → SMTP (optional):** configure a custom SMTP provider, because the built-in mailer is heavily
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
  - Reduce motion (OS setting or in-app toggle) is honoured by the UI and the games.
- **Lighthouse (mobile, production build):**

  | Page                | Performance | Accessibility |
  | ------------------- | ----------- | ------------- |
  | `/` (intro playing) | 91–95       | 100           |
  | `/games`            | 96          | 100           |
  | `/games/orbit`      | 97          | 100           |
  | `/games/neon-siege` | 97          | 100           |
  | `/leaderboards`     | 97          | 100           |

  CLS is ≤ 0.06 on every page.

- **Performance:** each game is a separate lazy chunk loaded on Play, cover art is procedural SVG (no images), and
  fonts are self-hosted with `next/font`.
