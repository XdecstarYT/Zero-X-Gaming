# Zero City

A browser city builder for Zero X: draw roads, paint zones beside them, and watch a
low-poly city of cars, buses and people grow. It is a **ZLink+ exclusive** (`pass:
"zlink"` in `src/lib/catalog.ts`) and plays at `/games/zero-city`.

The working title lives in one constant: `GAME_NAME` in `config.ts`. Rename it there
(and the catalog entry's `title`) and every screen, the logo and the saves follow.

## Stack

Zero X already runs Next.js 16 + React 19 + three.js + Zustand, so Zero City uses
that stack rather than a separate Vite app: it is a normal Zero X game module
(`index.ts` implements `GameModule`) that mounts its own React tree inside the
platform's game stage. The simulation runs in a **Web Worker** (`sim/worker.ts`),
with an automatic main-thread fallback (`sim/host.ts`) for browsers or test runners
without workers.

## Layout

| Module | What it does |
| --- | --- |
| `config.ts` | Name, version, world scale, tick rate, autosave interval, undo depth |
| `theme.ts` | Every colour, radius and font, plus the scoped UI stylesheet |
| `i18n/` | One table per language; `index.ts` lists them (RTL flag) and formats numbers, clocks, play time |
| `settings.ts` | The settings model and the LOW / MEDIUM / HIGH / ULTRA presets (concrete values) |
| `platform/zeroxAdapter.ts` | **The only file that talks to the host platform** (see below) |
| `platform/idb.ts` | IndexedDB key–value store with an in-memory fallback |
| `world/terrain.ts` | Heightfield (257 × 257 vertices, 8 m apart, 64 × 64-cell chunks) |
| `world/maps.ts` | The ten maps: seeds, terrain recipes, resources, gateway highway, trees, thumbnails |
| `world/roads.ts` | Road types and groups, the road graph (split at crossings, snap, merge), lane layout, names |
| `world/lots.ts` | Occupancy grid, lot cutting from road frontage, civic building footprints |
| `world/buildingSpec.ts` | Floors, style and capacity for a zone × tier × lot (shared by sim and renderer) |
| `world/city.ts` | The editable city: roads with height profiles (bridges, cuttings), lots, services, transit, trees, undo/redo, save JSON |
| `sim/sim.ts` | Growth, tiers, demand, land value, A* routing, car following, junction rules, pedestrians, buses, notices |
| `sim/runner.ts`, `worker.ts`, `host.ts` | 10 Hz loop in a worker; messages both ways |
| `render/*` | Engine (sky, sun, fog, shadows, post FX), camera rig, terrain chunks, roads, building kit, instanced agents, overlays |
| `tools.ts` | Input routing (camera vs tool) and every tool |
| `game.ts` | The controller: screens, loading, saves, autosave, achievements, scores, audio |
| `audio.ts` | Generative ambient music, city hum, effects (all synthesised) |
| `ui/*` | React screens (loading, menu, map select, settings, load, update log, credits, pause) and HUD |

## Wiring the Zero X adapter

Game code only sees the `ZeroXPlatform` interface in `platform/zeroxAdapter.ts`.
Two implementations ship:

- `createMockPlatform()` – standalone: one local "Guest" player, everything in
  IndexedDB. Use it to run the game outside Zero X.
- `createZeroXPlatform(host, signals)` – used by `index.ts` on the site. The `host`
  object is where the real platform calls go:

  | Adapter call | Zero X today |
  | --- | --- |
  | `getPlayer()` | `useAuth` (signed-in user id and username), else a guest |
  | `listSaves / saveCity / loadCity / deleteCity` | IndexedDB, namespaced by player id (Zero X has no cloud save API yet) |
  | `getSettings / setSettings` | IndexedDB, per player |
  | `submitScore("population", mapId, n)` | Records the per-map best on the device, then posts to the site's Zero City leaderboard through `submit_score` when the city has grown by 10% (and 250+) or when the Stats panel's button forces it |
  | `submitScore("playtime", …)` | Device only (the site has no play-time board) |
  | `unlockAchievement / getAchievements` | Device only (site achievements are granted server-side by `submit_score`) |
  | `track(event, props)` | Dispatches a `zx:track` window event for an analytics listener |
  | `onPause / onResume` | Driven by the platform's `GameModule.pause()/resume()` and tab visibility |

To move saves to a cloud API, replace the `localStore` calls inside
`createZeroXPlatform` with the SDK's; nothing else changes. The site has one
leaderboard per game, so per-map population boards stay on the device; if Zero X
adds board keys, pass `mapId` through in `host.postScore`.

The database side is `supabase/migrations/20261024100000_zero_city.sql`: it registers
the game (score caps) and adds it to the members-only list in `submit_score`.

## Adding a map

1. Add an entry to `MAPS` in `world/maps.ts`: an `id`, a `seed`, a terrain tag and
   relief (i18n keys), resources (`[water, wood, farmland, oil]`, each 0–2), the
   gateway edge and position, and a `shape(u, v, noise)` function returning height
   in metres for the unit square (below 0 is water).
2. Add `map.<id>` and `desc.<id>` strings to every table in `i18n/`.
3. Run the tests: `logic.test.ts` checks every map is deterministic and that the
   gateway reaches dry land. The thumbnail is drawn from the heightmap.

## Adding a building

Buildings are assembled from parts in `render/buildingKit.ts`.

1. Add a style name to `Style` in `world/buildingSpec.ts` and pick it in
   `buildingSpec()` for a zone and tier (floors, coverage; capacity follows).
2. Add a `case` to `buildingParts()` that pushes parts with the `box()` helper:
   `facade` (walls with the window grid and night lights), `glass` (curtain wall),
   `box`, `metal`, `dark`, `cyl`, `cone`, `prism` (gable roof), `crown` (tree),
   `glow` (signs), `solar`. Coordinates are lot-local: x along the frontage, z away
   from the road (the front is at `-d/2`), y up from the ground.
3. Use `prop()` for optional details so the Building density setting thins them.

Civic buildings work the same way in `serviceParts()`, with footprints and
coverage radii in `SERVICE_SPEC` (`world/lots.ts`).

## Adding a language

1. Copy `i18n/en.ts` to `i18n/<code>.ts`, typed `Record<StringKey, string>` (the
   compiler lists anything missing), and translate. Keep `{placeholders}`.
2. Add it to `LANGS` in `i18n/index.ts` (set `rtl: true` for right-to-left scripts)
   and its locale in `formatNumber`.
3. `logic.test.ts` checks every key and placeholder exists in every language.

## Controls

Desktop: WASD or arrows pan, Q/E rotate, wheel zooms (toward the cursor), right or
middle drag orbits and tilts, 1–8 pick tabs, Esc cancels (then pauses), Ctrl+Z undo,
Ctrl+Y / Ctrl+Shift+Z redo, Shift draws freeform roads.
Touch: one finger uses the tool (or pans with no tool), two fingers pinch to zoom,
twist to rotate and slide up/down together to tilt. Every button is at least 44 px.

## Notes on scope

- Rail is a stub ("coming soon") in the Transit tab; bus stops and lines work.
- Custom maps (heightmap import) is a stub tab.
- Money is always UNLIMITED (sandbox); a budget mode can sit on top later.
- Road names are generated from English word lists in every language (they are
  proper nouns in the save).
- "Building density" thins optional building details (rooftop units, fences, yard
  and street trees, parked cars), not the number of buildings.
