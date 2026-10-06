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
| `world/maps.ts` | The ten maps and the three Riviera DLC maps: seeds, terrain recipes, resources, gateway highway, trees, thumbnails |
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
| `politics/politics.ts` | Mayor mode: treasury, taxes, voter groups, approval, laws and ministries, dilemmas, promises, elections (pure, unit-tested) |
| `politics/mandate.ts` | Mandate (0.9): electoral districts, the ideology compass, your party's funds, members, headquarters and politicians, named members who can rebel, the whip, polls, the newspaper, no confidence, district-by-district elections (pure, unit-tested) |
| `politics/statecraft.ts` + `budget.ts`, `decrees.ts`, `lobbies.ts`, `media.ts`, `opposition.ts`, `factions.ts`, `crises.ts`, `legacy.ts` | Statecraft (1.0): the department budget, decrees, lobbies, the press, the opposition, party factions, crises and your legacy, run hour by hour (pure, unit-tested) |
| `politics/parliament.ts` | The parliament: parties and seats, coalitions, political capital, bills, lobbying, referendums, the cabinet and scandals, the campaign (pure, unit-tested) |
| `ui/mandate/*` | The Mandate side app: shell and briefing (`MandateApp.tsx`), the other pages (`pages.tsx`), portraits, the chamber, charts, the compass and the district map (`parts.tsx`) |
| `ui/mandate/statecraft.tsx` | The Statecraft pages: Budget, Decrees, Lobbies, Media (press conference, interviews, the TV debate), Opposition, Factions, Legacy, and the crisis card |
| `render/signalView.ts`, `render/politicsView.ts` | Traffic-light masts lit from the sim's signal states; protests, strikes, floods, festivals, billboards and fireworks in the streets |
| `ui/*` | React screens (loading, menu, map select, settings, load, update log, credits, pause), HUD, City Hall (`politics.tsx`) and the liquid glass (`glass.tsx`) |

## Mayor mode

Pick **Mayor** instead of **Sandbox** on the map screen. The rules live in
`politics/politics.ts` and run on the main thread from the sim's stats every game hour:

- **Money.** The city starts with $80,000 and a $25,000 credit line. Roads cost per
  metre by type (three times over water), civic buildings, bus stops and earthworks cost
  money; zoning is free. Undo and redo refund and re-charge (the city's `spent` total is
  part of each undo step). Every hour taxes come in (residents, commercial and industrial
  jobs × rate) and upkeep goes out (roads per km, services, policies, bus lines).
- **Voters.** Workers, Business, Families, Greens and Seniors each have an approval
  heading toward a target computed from what they care about (jobs, taxes, traffic,
  service coverage, pollution, parks, the books) plus policies and short-lived moods.
  Their share of the electorate follows the kind of city it is.
- **Parliament and laws.** See "The parliament" below. 24 laws in six ministries each
  change the sim (demand, max tier, car share, road wear, fires, tourism) or the books,
  and cost per day.
- **Dilemmas, promises, town halls.** A dilemma lands on the desk every half day or so;
  ignoring it costs approval. One campaign promise per term pays off (or costs 1.5×) on
  election day. A town hall once a day buys a little goodwill.
- **Elections.** Every term is four game days. With a day to go a challenger appears; on
  election day each group votes by how it feels, the council is reseated by share, and
  you either begin the next term or carry on building in Sandbox.

The sim side is `SimSettings.policy` (demand bias, a tier cap, a car-share multiplier) and
the coverage/pollution numbers in `Stats`. Saves keep `mode`, `politics` and `spent`.

## Roads and the ground

`world/city.ts` keeps the ground under roads consistent:

- **Settling.** After any road change, `settle` sets every terrain vertex within a road's
  flat strip (`flatOf`: the footprint plus 1.5 cells) to `GAP` below the lowest road over it.
  It checks the new roads and every road near them. It uses the lowest road height within a
  cell either way, so the straight ground between grid points can't cut across a bend in the
  road and come up through it. Only spans over water (bridges) are left alone.
- **Profiles don't drift.**
  - Each road's surface heights are saved with the city (`CityJSON.profiles`) and kept in
    undo snapshots, so a load or an undo puts roads back exactly.
  - When a road is split or joined, the new pieces inherit the old heights (`inheritProfile`).
  - Older saves read heights off the ground, which `groundFor` raises back by `GAP`.
- **Grades.** Where a road's two ends differ by more than the 10% limit allows, it takes the
  grade it needs instead of riding an embankment and dropping off a cliff at the far junction.
- **Junctions have room** (`RoadGraph.junctionOn`): a road that crosses or ends on another
  too close to an existing junction for two (both mouths and their zebras) joins that
  junction instead of making a second one, and the new road bends into it. Older saves with
  junctions crammed together are folded into one on load (`RoadGraph.collapseStubs`); lots
  and stops on the removed stub go with it. One-way roundabout rings are left alone.
- **Junctions are level** (`levelAtJunctions`): each arm eases to the junction's height near
  it, so crossing roads on a slope meet flush.
- **Rendering** (`render/roadView.ts`):
  - Each arm stops short of a junction by the distance its whole width needs to clear every
    other arm at that angle (`clearance`), so surfaces never overlap.
  - Junction pads meet each arm at that arm's own height.
  - Corner paving shares its vertices, so there are no wedge gaps.
  - Roads' outer faces run down into the ground (`WALL_DEPTH`), so ground falling away beside
    a road reads as a retaining wall, not a gap.

## The Metropolis update (0.7)

- **Milestones** (`world/milestones.ts`): eight ranks by the best population the city has reached, from Hamlet to Megalopolis (`City.bestPop`, saved). Each one shows on the HUD chip, pays a grant in Mayor mode and unlocks landmarks.
- **Landmarks**: a hospital, a museum, a university, a stadium and a landmark tower. They're service kinds (`SERVICE_SPEC` in `lots.ts`, `SERVICE_COST` in `politics.ts`) built from the Build tab, one each, once unlocked.
  - They reach much further than ordinary services (`farServices` in the sim). The hospital counts as clinic cover and the university as school cover.
  - They add land value (`VALUE_ADD`) and draw tourists (`TOURISM`). Tourists push up commercial demand and pay commercial tax in Mayor mode.
- **Fires**: any finished building can catch fire (`FIRE_RATE` per game hour, lower inside fire-station cover).
  - With a fire station in reach, the crew puts it out in 30 game minutes. Without one, the building burns down after 100 minutes and the plot regrows.
  - Flames and smoke come from `render/fireView.ts`.
  - Settings → Building fires switches fires off.
- **Info views**: the Land tab colours lots by land value, services in reach, pollution or fire cover. The sim sends the per-lot cover mask with land values.
- **Zone plots**: empty zoned lots are drawn as outlines with a faint fill. They're strong while zoning, quiet otherwise, and dimmed at night, so they no longer glare as bright slabs. Trees on a plot are cleared when something is built there.

## Roadworks (0.8)

- **Wear** (`roadwork()` in `sim/sim.ts`, once a sim second): every road has a condition
  from 1 (new) to 0. Cars wear it (`WEAR_PER_CAR`, spread over length and lanes; trucks
  count four times) and so does age (`WEAR_AGE` a day). The Road fund law and a good
  transport minister slow it (`SimPolicy.wearMul`).
- **Effects**: below half condition cars slow down (`roadSpeedFactor`, also used for route
  costs) and nearby land loses value. Notices ask for repairs or a depot.
- **Roadworks**: a maintenance depot (Build tab) sends up to two crews at a time to the
  worst roads in its reach once they drop below 45%. Works take `60 + length / 4` game
  minutes; the road is down to 45% speed with one lane coned off, then it's as new.
  The Repair draw mode in the Roads tab orders works on any road (Mayor mode charges per
  metre, cheaper with a depot).
- **Drawing**: `render/roadView.ts` adds cracks, potholes and patches by condition, and
  cones, barriers and fresh tarmac during works. The Land tab's Road condition view
  colours every road from red to green.
- **Saves**: `SimSave.roads` keeps each road's condition and works.

## The parliament (0.8)

Mayor mode's council is now a 15-seat chamber (`politics/parliament.ts`), loosely in the
style of Lawgivers:

- **Parties**: your Civic Party plus Labour, Enterprise, Greens and Heritage, each speaking
  for a mix of voter groups (`PARTY_BASE`). Seats are shared out by largest remainder
  after each election. If you lose the popular vote but your coalition still holds 8
  seats, you stay mayor.
- **Coalitions and capital**: political capital builds every hour (faster when popular
  and with a majority). Spend it to invite parties into government (they accept by
  relations and how their voters rate you), lobby, appoint ministers and call
  referendums. Partners leave if relations sour; each party has a law it wants.
- **Bills**: drafting a law puts it on the floor with a seat-by-seat forecast. Lobby
  parties to move their votes, then call the vote. A failed law can go to a referendum
  once a term.
- **Cabinet**: six ministries (finance, transport, environment, housing, safety, culture).
  A minister's skill boosts their area (`simPolicy`, `ledger`, `targets`); low loyalty
  risks a scandal you either sack them over or ride out.
- **Campaign**: once a challenger appears (the last day of a term), rallies for each voter group, up to three ad
  blitzes and one TV debate.

## Mandate, the politics app (0.9)

Mayor mode's deep politics live in a full-screen side app (`ui/mandate/`), opened from
the MANDATE button in the top bar or from City Hall. It has its own sidebar (a rail of
icons on smaller stages, a tab bar on phones), a header with the clock and speed, and
nine pages. Esc goes back to the city; the city keeps running underneath. The rules are in
`politics/mandate.ts`:

- **Districts.** Once the city has a handful of plots it's cut into 2–7 districts by
  k-means over the plots (weighted by people and jobs, seeded, so the same city always gets
  the same map), named round the compass from the Old Town, and redrawn each time the city
  doubles. The fifteen seats are shared out by population (largest remainder, at least one
  each). A district's voters by group come from what's built there: industry means
  workers, shops mean business, homes mean families and seniors.
- **How a district votes.** Each group backs you by how it feels (a logistic curve on
  approval) plus your ground game there; the rest of its vote goes to the parties that speak
  for it (`supportIn`). `projection` turns that into seats per district, and on election
  night `electDistricts` does the same with the night's feelings: the chamber is the sum of
  the districts. With no districts yet the whole city is one.
- **Your party.** Its own funds (members' dues and business donors in; salaries,
  headquarters and offices out, `fundsPerDay`), separate from the city treasury, and a
  membership that follows approval. Headquarters has four buildings with three levels each:
  a pollster (district polls for every party), a press office (softens scandals you ride
  out), a campaign office (more members, a faster ground game) and a think tank (capital).
  A fundraising gala once a day; the party conference once a term sets your platform on the
  compass and lifts loyalty.
- **Politicians.** A roster of up to 16, each with a portrait drawn from a seed, charisma,
  competence, loyalty, ambition, popularity and a trait (orator, policy wonk, fixer,
  firebrand, loyalist, schemer, local hero, media darling). Recruit, train, expel, send
  them to work a district, or make them ministers (`appointOwn`). Loyalty follows how the
  party's doing; an ambitious, disloyal member may cross the floor and take their seat.
- **The chamber.** Every seat is a named member from a district. Your members whose district
  hates a law (and who don't owe you enough) rebel (`rebels`); a three-line whip (10
  capital) holds them, at a cost in their loyalty. The hemicycle shows how every member
  will vote. A minority government with low approval can face a motion of no confidence;
  lose it and there's a snap election in twelve hours.
- **Ideology.** Parties, voter groups and laws sit on two axes (economy, society). Voters
  near your platform warm to you every hour; the compass also shows where your laws have
  actually put your government (`governmentPosition`).
- **Polls and the papers.** A poll of every party each morning, with the seat projection;
  a newspaper that reports laws, referendums, coalitions, scandals, defections, polls,
  no-confidence motions and elections.

Saves keep it all on `politics.m`; older saves get a party and a seated chamber on load
(`normaliseMandate`).

## Statecraft (1.0)

The biggest update so far takes the Mandate app from 9 pages to 16. Every system is a pure
module under `politics/`, kept in `PoliticsState.x` and advanced one game hour at a time by
`statecraftHour` (at most a day's worth after a long pause). Events come back as a list, and
`game.ts` turns each one into a newspaper story, a toast and, where it counts, a line in the
record book.

- **Budget** (`budget.ts`). Six departments run from deep cuts (0) to generous (4); standard
  (2) costs nothing extra. Every two days Budget Day opens a 12-hour window to draft the levels
  and put them to the chamber. Each party weighs what its voters get against the cost
  (Enterprise most, and twice as hard while the city is in the red). A defeat costs capital;
  two in a cycle, or missing the window, rolls the old budget over at a bigger price. Levels
  feed approval targets, upkeep, tax collection, road wear, fires, tourism and housing demand.
- **Decrees** (`decrees.ts`). Seven orders that skip the vote: curfew, festival, hiring freeze,
  car-free day, public works, tax amnesty and emergency housing. Each costs capital (some cash
  too), lasts a set time, has a cooldown, and annoys every party outside the government.
- **Lobbies** (`lobbies.ts`). Unions, Chamber of Commerce, parents, the green network,
  pensioners and builders. Each has laws it likes and hates and a rival. Meet them, answer
  their demands (met or snubbed when the deadline passes) and take their donations, but
  donations build exposure that can leak at 9 pm. In the campaign they endorse or oppose you.
- **Media** (`media.ts`). Four outlets with their own readers and lean drift towards or away
  from you each hour, and their readers' moods follow. A daily press conference asks three
  questions picked from what's going wrong in the city; an interview a day wins over one outlet
  at a cost to its opposite. The TV debate is interactive: the rival leader answers each
  question for their own base and the city's mix of voters scores both.
- **Opposition** (`opposition.ts`). Each opposition party has a named leader (charisma and a
  fierce, pragmatic or populist style). They work the districts (which eats into your
  projected vote), table their own bills every day or so, and run attack ads in the campaign.
  Set your members' stance on each bill or spend capital to negotiate its withdrawal.
- **Factions** (`factions.ts`). Your party's moderates, progressives and traditionalists judge
  you on how close the platform sits to them, their share of ministers and their wish-list law.
  An unhappy faction with enough members mounts a leadership challenge: concede (the platform
  shifts towards them) or fight a party ballot.
- **Crises** (`crises.ts`). A strike (threat, then a walkout that cuts industrial tax to 40%), a
  flood in one district, corruption allegations that can become an inquiry, a protest by one
  group, and a cash crunch. Each stage has a deadline and three responses, some of them gambles.
- **Legacy** (`legacy.ts`). A record book of 14 counts, 23 achievements worth legacy points,
  and six titles from Rookie Mayor to Living Legend.

Election night now reveals the results district by district before the totals.

## Traffic, streets and spectacle (1.1)

**Junctions.** Every junction with three or more roads is run one of three ways (`sim/sim.ts`):
traffic lights, an all-way stop, or give way to the bigger road. By default (`autoControl`)
crossings of two avenues or bigger get lights, equal roads get an all-way stop, and mixed
junctions give way; highways always give way. The player can override any junction with the
Junctions road tool (`RNode.control`, saved with the roads). Lights are actuated: each phase
(roads facing each other) gets 7–20 s of green (a little longer for a long queue), ending
early when nobody comes and others wait, then amber and an all-red. Whatever the control, cars
take turns fairly: a car that has waited at the line goes before newer arrivals whose paths
cross its own, and a car held up only by a full exit still keeps first claim on that exit.
Cars choose their lane by their next turn: they come out of a junction in the lane that suits
the turn they just made, then change lanes smoothly on the road (`changeLane`) when there's a
gap. Waiting at a red light or in a queue isn't counted as stuck, so the gridlock breaker only
ever removes the car at the front of a real jam. Cars and pedestrians draw from their own random
stream, so traffic never changes how the city grows. `sim.trips` counts completed and abandoned
trips; the unit test keeps abandoned trips under 1%.

**Road geometry.** Junction setbacks are worked out in one place (`junctionSetback` and
`stopSetback` in `world/roads.ts`), so the renderer's pads and zebras, the sim's stop lines and
the traffic lights (`render/signalView.ts`) line up. A road that joins at less than 32 degrees
to another arm is bent so it meets at that angle (`easeShallowEnds`), and a road ending anywhere
on another road's surface joins it rather than lying on top.

**Look.** The sky shader has haze and drifting clouds, and is rendered into a PMREM environment
map whenever the time of day moves on, which lights and reflects in every standard material
(cars have clear-coat paint, windows are mirror-like glass). A grading pass after tone mapping
adds contrast, warmth and a vignette, plus an optional tilt-shift depth of field (the DoF setting,
on with Ultra). Grass is varied in world space, trees are welded organic crowns with leaf dappling
and wind sway (`foliageMaterial`), vehicles are extruded profiles with glasshouses and wheels, and
empty plots are only drawn while zoning.

**Politics in the streets** (`render/politicsView.ts`, fed by `Game.politicsScene` once a
second): protest crowds with placards at the district's junction, strikers at the nearest
factory gates, floodwater over the district, reporters for a corruption probe, bunting, a crowd
and fireworks for the festival decree, billboards in every district in the leading party's
colours and rally crowds during the campaign, and fireworks on a winning election night.
Clicking a crowd opens the briefing; Show me on the crisis card flies the camera there.

## The Riviera DLC (0.8)

A paid expansion: 50 ZX Cash, once (`ZERO_CITY_DLC_PRICE` in `src/lib/economy.ts`).

- **Content**: three coastal maps (`dlc: "riviera"` in `world/maps.ts`), a warm building
  palette (`look: "riviera"`, `LOOKS` in `render/buildingKit.ts`) and four landmarks (marina,
  lighthouse, casino, beach resort) that can be built on any map and need no milestone.
- **Gate**: `ZeroXPlatform.dlcOwned()` / `buyDlc()`. On Zero X they go to
  `zeroCityDlcOwned` / `buyZeroCityDlc` in `src/lib/season-client.ts`: guests pay from the
  device wallet, signed-in players through the `buy_zero_city_dlc` RPC
  (`supabase/migrations/20261026100000_zero_city_riviera.sql`), which charges with
  `add_coins` and records a `player_unlocks` row. The mock platform keeps a flag in IndexedDB.
- **UI**: a menu row and store sheet (`DlcSheet`), a RIVIERA badge on the maps (Start
  becomes Unlock), and a Riviera row on the Build bar. `newCity` refuses a locked map.
  Saves made on a Riviera map still load if the DLC is not owned.

## Liquid glass

Panels refract the city at their rims with an SVG displacement filter used as a
`backdrop-filter` (`ui/glass.tsx` builds the lens maps at runtime; Chromium only, others
get the same rim, sheen and tint over a blur). The styles are in `theme.ts` under
`.zc-ui-liquid`; Settings → Interface glass switches to Frosted or Solid, and systems
asking for reduced transparency get Solid.

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
- Money is UNLIMITED in Sandbox; Mayor mode has the real budget.
- Road names are generated from English word lists in every language (they are
  proper nouns in the save).
- "Building density" thins optional building details (rooftop units, fences, yard
  and street trees, parked cars), not the number of buildings.
