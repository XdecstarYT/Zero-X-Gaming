# Zero X | Gaming

A browser gaming hub: discover, play, and compete in original web games. Dark, neon, fast. No downloads.

**Status:** all six phases are complete, plus an intro splash and an arena FPS with bots and online play. The project
has:

- 3 full 3D games: **Trenches**, a realistic Great War shooter (six fronts, diggable trenches, multiplayer
  lobbies, Classic / Frontline / Breakthrough, loadouts and support calls), **Neon Siege**, a battle royale with
  AI bots, online rooms and a Season 1 battle pass, and **Code 3**, a police patrol sim (city, traffic, dispatch
  callouts, traffic stops, pursuits, arrests, careers)
- a cinematic intro splash on each visitor's first page load in a session, and a one-time "mega ad" for every
  game right after the very first one
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
| **Trenches**     | War / Conquest | WASD + mouse, click fire, right-click aim, Shift sprint, C crouch, X prone, Q grenade, hold G dig, B artillery, N supplies, T recon, 1–5 switch, R reload, Tab scores · stick (push to sprint), drag look, FIRE/AIM/CRCH/PRONE/NADE/DIG/ARTY/SUP/RCN |
| **Code 3**       | Police sim     | W/S drive, A/D steer, Space handbrake, Q lights/siren, H yelp, E exit/enter, mouse look, click fire, right-click aim, X taser/sidearm, G shout, K spike strip, 1–9 actions, Y/N dispatch, B backup, Tab MDT, C camera · stick, drag look, buttons, tap actions |

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
- **Frontline** (`frontline.ts`, `conquest.ts`): a 280 m landing corridor at **Cape Helles**. Attackers storm W
  Beach, then Sedd el Bahr, Krithia, the trench line in no-man's-land and finally the concrete HQ, one objective at
  a time. Every attacker has only 3 redeploys (each objective taken gives one back); defenders win when the
  25-minute clock runs out or the landing is wiped out.
- **Loadouts and perks** (`protocol.ts`, `match.ts`): each class picks a primary (Lee-Enfield, scoped
  Lee-Enfield, Bergmann MP18, M1897 trench gun), a sidearm (Webley, or none to move faster) and a gadget (grenade
  bag, field dressings, body armour, entrenching tool), remembered per class. Perks: riflemen carry an extra
  grenade, raiders sprint longer, medics heal over time, snipers' support recharges faster, engineers dig faster.
- **Support calls:** B calls a 6-shell artillery strike on where you're looking (22–110 m out), N drops a supply
  crate that restocks your squad, T fires a recon flare that marks enemies within 45 m on the minimap. Each has a
  cooldown shown under the minimap; player strikes are accepted from their caller only, at most one a minute.
- **Great War guns and animation** (`neon-siege/three/guns.ts`, `render3d.ts`): walnut-and-blued-steel models
  of every weapon; the viewmodel cycles the bolt or pump after each shot, reloads with the off hand, lowers and
  cants when sprinting, sways with breathing, arcs a Mills bomb when throwing and swings a spade when digging.
- **Breakthrough** (`conquest.ts`): Iron Legion attacks, Crimson Front defends. The flags fall in sectors (A+B,
  then C, then D+E); only the live sector can be fought over. Attackers have 200 tickets (+60 per sector taken),
  defenders never run out; 20-minute limit.
- **Grenades and artillery** (`explosives.ts`): Q (or NADE) throws a grenade on a real ballistic arc; it bounces
  off walls, drops into trenches, rolls, and blows after 3.2 s. The host calls an artillery barrage every 45–80 s
  (8 shells walking around a live flag, with a whistle and a warning). Blasts fall off with distance and are
  soaked up by trenches, lying flat and walls. Every client simulates each grenade and hurts only the soldiers
  it owns; kills flow through the normal kill messages.
- **Progression:** every battle (20 s or longer) earns season XP (`trenchesMatchXp`, mirrored by
  `public.trenches_match_xp`), counts toward the daily/weekly challenges and the battle pass free coin lane, and is
  added to the player's **war record** (profile page: totals, battles per front, and fifteen medals from "Mentioned in
  Dispatches" to the "Victoria Cross"). Online accounts go through `record_trenches_match` (range-checked and
  rate-limited); guests and device accounts use the same rules on the device.
- **Over the Top update** (`warfare.ts`, pure rules shared by the match, renderer and tests):
  - **Poison gas:** one host barrage in three is gas, and H calls 3 gas shells on your aim point (3-minute
    cooldown). Clouds grow to 7.5 m, drift with each front's wind, thin out after ~34 s and pool in trenches
    (60% stronger: get up out of it). M pulls on a small-box respirator (1.1 s): the screen narrows to two
    eyepieces and your aim is 30% wider, but the gas can't hurt you. Bots mask up after a moment.
  - **Bayonets:** V lunges forward; a Lee-Enfield's bayonet kills outright, anything else (rifle butt,
    pistol, trench gun) hurts. Sprinting in is a charge with more reach.
  - **Vickers guns:** 3–4 emplacements on each front line. E mans one: locked to its tripod with a limited
    traverse, steady and belt-fed, but it overheats (about 5 s of fire) and must cool. Bots man them too.
  - **Revives:** a fallen soldier lies WOUNDED for up to 10 s when a medic is near (fire redeploys at once).
    Medics hold E beside them for 1.6 s to bring them back at half health, and the ticket returns. Bot
    medics do the same.
  - **The Argonne Forest:** a sixth front (Meuse-Argonne, 1918): dense autumn forest, a rocky ravine and the
    old mill at the centre.
  - New medals: Cold Steel, Machine Gun Corps, Stretcher Bearer, Argonne Cross.
- **Classes:** Rifleman, Trench Raider, Medic, Sniper, Engineer. Teams: Iron Legion and Crimson Front.
- **Lobbies** (`lobby.ts`, `directory.ts`, `menu.ts`): create a lobby (name, front, 4v4 to 16v16, bot fill),
  browse the live list or join by code or invite link (`?lobby=CODE`). The host can change the front; players
  switch team, pick a class, ready up and chat. The host starts the battle for everyone; late joiners drop
  straight in, and after the match everyone returns to the lobby. The lobby list is a Supabase presence channel
  (`trenches:directory`), rooms are `trenches:<code>` broadcast channels, and `?net=local` runs both over
  BroadcastChannel between tabs.
- **Netcode:** each client owns its soldier (and stance), the oldest peer hosts bots, flags and tickets and
  broadcasts the Conquest state 4× a second. Matches are unranked.

### Code 3: police patrol sim

Code 3 (`src/games/code-3/`) is its own engine: a pure simulation (`sim.ts`, `vehicles.ts`, `city.ts`,
`people.ts`) that the three.js renderer (`render.ts`, `models.ts`), the DOM HUD (`hud.ts`) and the game module
(`index.ts`) read. It's inspired by police mods for open-world games, with no borrowed names or assets.

- **Bayview** (`city.ts`): an 8×8 grid of two-lane streets (518 m square) with a downtown of towers, a midtown
  ring with corner stores, suburbs with houses and trees, an industrial corner with the gas station, a park, the
  bank, St. Mary's Hospital and the police station. Every intersection has traffic lights on a 20 s cycle.
- **Driving** (`vehicles.ts`): a bicycle model with tyre grip (handbrake turns slide), damage that slows a car and
  eventually disables it, circle collisions with buildings and cars, and a PIT spin when you hit a rear quarter.
  Four units unlock by rank: Patrol Sedan, Interceptor SUV, Slicktop (hidden lights) and Pursuit Coupe.
- **Traffic AI:** civilian cars follow lanes, stop at red lights, keep their distance, creep on when blocked,
  pull to the kerb for your siren, and include speeders, drunk and reckless drivers. Pedestrians walk the
  sidewalks.
- **Traffic stops, by the book:** follow a car with your lights on (no siren) and it pulls over (or runs); with
  the siren on you are responding to a call and traffic just clears the way. Walk to the driver's window for the
  action menu: licence and registration, MDT checks on the driver (licence status, warrants, notes) and the plate
  (expired, uninsured, stolen), questions, step out, breathalyzer, and a search that needs consent or probable
  cause (searching after a refusal is unlawful and the evidence is thrown out). Citations need a violation and
  pay per violation; arrests need charges (a wrongful arrest costs points). The radar shows the speed of the car
  ahead; speeding, red lights and weaving are recorded as reasons for the stop.
- **Dispatch callouts** (unlocked by rank): suspicious person, traffic collision, drunk driver, domestic
  disturbance, stolen vehicle, armed robbery, shots fired, pursuit in progress, street racing and bank robbery.
  Accept (Y) or decline (N); the GPS route and marker lead you there; response time earns a bonus.
- **Pursuits and force:** fleeing cars pick escape routes; wreck or box them in and the driver bails, fights or
  gives up. Tackle runners by sprinting into them, tase them (non-lethal), or use the sidearm, which is only
  justified against an armed attacker: an unjustified shooting suspends you and ends the shift. B calls backup
  units that chase and subdue suspects; prisoner transport can collect the cuffed, or you drive them to the
  station and book them for a bonus.
- **Shift and career** (`career.ts`): a night (20:00–04:00) or day (08:00–16:00) shift of 15 or 8 minutes with a
  full day/night cycle. The shift report lists every point earned or lost; the score is submitted (ranked) and
  added to your career XP, from Cadet to Chief of Police (saved per device account).
- **More police work:** K lays a spike strip (blows a fleeing car's tyres; it limps along at 40 % speed), verbal
  warnings as an alternative to a ticket, EMS for injured people (an ambulance comes to collect them) and the
  coroner for the dead, towing and impounding an arrestee's car, and two more callouts: a fleeing shoplifter and a
  hit and run.
- **Checkpoints and road tools:** on foot at the side of a road, set up a **sobriety checkpoint** (P, or from the
  action list): cones down the centre line, a sign and a barrier; traffic in that lane queues at the line, and you
  screen each driver (wave them through, or "licence please", which turns into a full stop with a bonus for
  catching a drunk or wanted driver). During a pursuit you can **block the road** (O): a solid barrier that
  civilians stop for and fleeing drivers route around (or crash into). **Cones** (U) close a lane; at night they
  carry flares.
- **More systems:** an **automatic plate reader** on the unit calls out stolen, expired, uninsured and
  wanted-owner plates near you (and marks them on the map); **Air-1** (I), a helicopter with a searchlight that
  keeps the eye on a fleeing car or runner so it can't be lost; **K9** sniffs on stopped cars (an alert is
  probable cause); **field sobriety tests**; **Miranda** warnings (booking without them loses points); repair and
  restock at the station; a flashlight (L); three siren tones (J: wail, yelp, phaser) and a horn; pursuit radio
  updates and a pursuit readout; turn signals and hazards on traffic; bystanders who run from gunfire; street
  **incidents** you come across on patrol (fights, drunks, jaywalkers); three more callouts (burglary, street fight,
  intoxicated person); a zoomable minimap (M or tap it); and a report-card grade for every shift.
- **Real car shapes:** every body is its real side silhouette (nose, bonnet, raked screen, roofline, boot, cut-out
  wheel arches) extruded with rounded edges, with a narrower glasshouse, glass set into pillars, and indicators
  per side.
- **Performance:** the city streams in 144 m chunks around the camera (buildings, rooftops, signs, trees, street
  furniture, parked cars), one chunk per frame so nothing hitches, and far chunks are freed. Parked cars are baked
  into a few meshes per chunk, polycounts are trimmed on Low, and the render resolution adapts to the frame rate.
- **Phones:** gas and brake pedals under the right thumb with the stick steering, a separate on-foot button set,
  utilities beside the minimap, a compact HUD that respects notches, big action buttons placed out of thumb
  reach, a full-screen MDT, and haptics on crashes and hits.
- **Weather:** clear, overcast, rain or fog (or random). Rain wets the streets (reflective asphalt and puddles,
  falling rain) and cuts tyre grip and braking for everyone; fog closes the view down to ~90 m.
- **Presentation (`render.ts`, `models.ts`, `textures.ts`):** clear-coated car paint, tinted reflective glass,
  chrome, spoked rims that spin and steer, door seams, mirrors and number plates; full police, unmarked and
  ambulance liveries with multi-segment LED light bars (and real flashing lights on your unit). A sky dome with a
  moving sun, dusk colours, stars and moon feeds image-based reflections for every material. Facades have
  recessed, glossy windows that light up at night; roofs have parapets, plant and water tanks; shops have
  awnings and signs. Streets have raised kerbs, worn lanes, cracks, manholes, hydrants, bins, benches, meters,
  news boxes and bus shelters; lamps cast real light near the camera; parked cars fill driveways and the station
  lot. Headlights throw pools on the road, sliding tyres leave skid marks, crashes and gunfire shake the camera.
  High graphics adds soft shadows, ambient occlusion, bloom, SMAA and a filmic grade (split tone, vignette,
  grain). C cycles chase, far and hood cameras.
- **Sound:** synthesized siren (wail and yelp), engine, radio, gunshots, taser and cuffs, and a rotating minimap
  with the GPS route.
- **Photoreal pass (`facades.ts`, `scenery.ts`, `people3d.ts`):** a physically based sky (Rayleigh / Mie
  scattering with drifting volumetric clouds) lights the city and its reflections by day, with the night dome
  blended over it after dusk. Facades are painted per style at startup with albedo, night-lit windows, one
  AO / roughness / metalness texture (glass mirrors the sky, reveals sit in shadow) and normals: brick and
  ashlar offices with sills and lintels, curtain-wall towers, clapboard houses with shutters and front doors,
  corrugated warehouses. Ground floors are their own strip (shopfronts with names, lit interiors and doors,
  tower lobbies with revolving doors, loading bays), and every wall fits a whole number of bays and floors so no
  window is cut at a corner. Buildings get cornices, band courses and plinths; houses get hip roofs with
  shingles, porches and chimneys; downtown sidewalks get street trees in pits. Trees are leaf-card canopies over
  a dark core that sway in the wind; lawns get detail and wind-blown grass near the camera; the asphalt gets
  grit. Street lamps are downward spotlights, so light pools on the road instead of washing whole facades.
- **People:** one skinned mesh per person (a single draw call) with knees, elbows, a waist and a neck that bend
  smoothly, and outfits (tees, long sleeves, jackets, hoodies, suits, skirts, shorts, caps, beanies, backpacks,
  beards and five hairstyles). Officers wear the uniform with vest, duty belt, holster, radio and cap. Around
  twenty blended animations: walk to run, idle breathing, talking gestures, hands up, kneeling with hands on head,
  prone, cuffed (standing or on their knees), tased, injured, fighting, two-handed aiming, radio, phone,
  pointing, frisking and panicking.
- **Procedures:** a **felony stop** for stolen, flagged or wanted cars (order the driver out from cover, walk
  them backwards to you, kneel them, cuff: "by the book" pays best); **verbal commands** at a distance (on your
  knees, get down on the ground) to anyone with their hands up; and **paperwork**: arrests, closed calls and every
  use of force create a report you file from the parked unit's MDT (unfiled reports cost points at end of watch).
- **Six more callouts:** officer needs assistance (another unit holding combative suspects at gunpoint),
  vandalism in progress (a tagger, and fresh graffiti on the wall), wanted fugitive (find them from the
  description; they bolt when they spot you), abandoned vehicle (run the plate, recover it if stolen, tow it),
  road rage (two drivers fighting at the kerb) and a noise complaint (talk to the resident; warn or cite).
- **Ticket book:** "Write a ticket" opens a notice-to-appear form: tick the violations (speeding, red light,
  seatbelt, phone, expired registration, insurance, licence, parking, jaywalking, littering, noise...), see each
  fine and the total, and issue it (keys 1–9 tick, Enter issues). Charges you established pay; ones you never saw
  or checked are thrown out in court and cost points. Seatbelts and phones get noticed at the window.
- **A world you can work:** illegally parked cars at hydrants, bus stops and red zones (ticket them, and the slip
  sits under the wiper, or have them towed; sometimes the owner comes running); direct traffic from the middle
  of an intersection (stop all lanes or hold one axis and wave the other through); ask passers-by if they've seen
  your suspect (they point you the right way); grab a coffee at a shop or gas station; get the unit fixed at the
  gas station. Pedestrians greet you, freeze with their hands up if you point a weapon their way, and get their
  phones out to film.
- **Sharper and smoother:** a contrast-adaptive sharpening pass (no more chromatic fringing, lighter grain),
  anti-aliasing before the grade, higher render resolution, adaptive resolution that never drops below 75 %,
  facade textures painted in idle frames so streaming never stalls, and ambient occlusion moved to a new
  **Ultra** setting.
- **HUD:** a compass with the call's bearing and a location bar (street, cross street, district), a speedometer
  dial with the limit marked and light-bar lamps, an active-call card with the next step, a score feed, and the
  action list grouped by kind (commands, talk, checks, enforcement, custody, scene, unit) with icons. The MDT
  (Tab) has tabs: Call, Contact, Queries, Reports and Shift. The menu has a field guide.

### Sports+

`/sports` is the new section for upcoming sports games (`src/lib/sports.ts`, `src/components/sports/`): Pitch
Kings (five-a-side football), Hoops X (3v3 basketball), Gridiron Blitz (7v7 American football), Slapshot (3v3
hockey), Ace Rally (tennis), Diamond Derby (home run derby), Knockout (boxing) and Fairway (golf). Each card shows
its status and season window, original drawn art, the planned features and a **Notify me** toggle remembered on
the device. Sports+ is in the top nav, the phone tab bar, the footer, the sitemap and a teaser row on the home
page.

**Sports+ costs 50 coins, once.** The pass (`SPORTS_PASS_PRICE` / `SPORTS_PASS_ID` in `src/lib/economy.ts`)
unlocks every Sports+ game, now and later. Signed in, `buy_sports_pass()` takes the coins and records the
unlock in `player_unlocks`; guests pay from their device save. Games with `pass: "sports-plus"` in the catalog
show the unlock card instead of **Play** until it's owned (`SportsPassCard`, `useSportsPass`).

**The welcome.** Buying the pass plays a ~20-second cinematic (`SportsInduction`): the stadium's six light
towers bang on one by one, the oval draws itself, SPORTS+ slams in with shockwaves and sparks, every sport flies
past the camera ("Every sport. One pass."), Screamer kicks a goal, and you're handed a holographic all-access
pass card with your name and number. It has its own synthesized score (booms, riser, impact, whooshes, crowd
roar) when sound is on, can be skipped, and ends on **Play Screamer** / **See the line-up**.

**The Sports+ ad.** A 25-second spot (`SportsAd`) built from the same scenes: a cold open under the lights,
the logo, the sports fly-through, Screamer's goal, "One pass. Every sport. 50 coins, once, forever", and a
**Get Sports+** end card. Like the Code 3 spot it plays after the intro on up to three visits and can't be
skipped. It never plays with the one-time mega ad, on invite links or for pass owners, and a visit gets one
ad at most: Sports+ goes first, then Code 3's spot gets its turns. All of it is SVG and CSS (`zx-sp-*` in
`globals.css`), no video files, and it calms down for reduced motion.

#### Screamer: Aussie Rules

The first Sports+ game (`src/games/aussie-rules/`): an 18-a-side Australian rules football match on a full 3D
oval. You play the Harbour Hawks against an AI side (Coastline Sharks, Ironbark Rams or Riverton Kings; Rookie,
Pro or Legend), over four quarters of 2, 4 or 8 minutes, by day, at twilight or under lights.

- **Rules:** centre bounces, kicks (hold to charge), handballs, a bounce every 15 m, marks from kicks of 15 m+
  (screamers when you climb a pack), set shots and free kicks with play on, tackles with prior opportunity and
  holding the ball, ball-ups, throw-ins, out on the full, goals (6), behinds (1), rushed behinds and posters,
  kick-ins, changes of ends and a kick after the siren.
- **AI:** positional zones, man-on-man defence goal-side, leads at the ball carrier, chasers and tacklers, ruck
  contests, pack marks and spoils, shots at goal from range.
- **Looks:** a mown oval with painted and modelled markings, padded goal posts and netting, an LED fence, a
  two-tier bowl with a roof, an instanced crowd that cheers, six light towers, live score screens, players built
  on Code 3's skinned rig (guernseys, numbers, socks, new kick / handball / mark / tackle / ruck poses), a red
  leather ball that tumbles end over end, a physical sky, soft shadows, bloom, SMAA and a sharpening grade.
- **Cameras:** a telephoto broadcast camera, a behind-the-player camera, over-the-shoulder set shots, a crane
  shot to open and a goal-celebration orbit.
- **Score:** points, margin, marks, contested marks, screamers, tackles and the result, ×1.5 on Pro and ×2 on
  Legend. `?footy=quick` runs 20-second quarters (unranked) for testing.

**The mega update.** Eight clubs (pick any as yours), a **Premiership season** (`season.ts`: seven rounds,
a ladder on 4 points a win then percentage, semi-finals 1 v 4 and 2 v 3, a Grand Final, saved on the device;
win it and the captain lifts the cup under confetti), three **kick styles** (R / STYLE: drop punt, a
torpedo that spirals 70 m+ but sprays, and a snap that starts wide and curls back through from a tight
angle), **rain** (a greasy ball, skidding bounces, a slick ground and falling rain), **instant goal replays**
from behind the posts (snapshots every 1/30 s, slow motion, any button skips), a **commentary** ticker, and
per-player stats with the umpires' **3-2-1 best-on-ground votes** on the results card.

**Kicking, leagues and career.** Kicks aim at the mouse (or along your facing): a gold ring marks the teammate
you're kicking to, and a tick on the power bar shows the power that lands it; hit it and the kick is truer.
Set shots go through a meter: line up (allowing for the wind, shown on screen and simulated as drag through
moving air), hold to run in for power, then tap as the accuracy needle crosses the green (quicker after the
siren, steadier with composure). Three leagues (`clubs.ts`): the National League's 18 clubs play out of the
real home bases with our own nicknames (no league or club marks; the **club editor** renames and recolours
any club on the device), plus a State League and a Local League. The premiership (`season.ts`) runs 9, 17 or
23 rounds with the real final eight (qualifying and elimination finals, semis, prelims, the Grand Final) and
lets you play or sim any game. **Career mode** (`career.ts`): create a player, start at 17 in the Local
League, earn a State League spot, get drafted, and play out a professional career controlling only your
player (Q / CALL calls for the ball), with attributes bought with skill points, the medal count, honours,
captaincy, decline after 30 and retirement.

#### Diamond Derby

A home run derby (`src/games/diamond-derby/`) in a full ballpark: diamond-cut grass, infield dirt, an
outfield wall with distance markers and foul poles, bleachers round a batter's eye, a grandstand behind LED
boards, light towers, a scoreboard and a skyline. Pitches (four-seam fastball, changeup, curve, slider) are
solved to cross the plate on target; you aim the plate coverage circle (mouse, keys or drag) and time the
swing (click / Space / SWING). Contact quality from timing and aim sets exit velocity, launch angle and
spray; the ball flies with drag and backspin lift (105 mph at 28 degrees carries about 425 ft). Every swing
that isn't a homer is an out, so is a called strike: ten outs a round to beat the AI slugger's mark,
quarterfinal, semifinal, final. Statcast readouts, fireworks, batter and centre-field cameras.

#### Ace Rally

Singles tennis (`src/games/ace-rally/`) on Centre Court: a toss-and-hit serve (hit at the top of the toss for
pace), then topspin, slice, lob, drop and automatic smashes, each solved to land where you aim (the direction
you hold at contact) with spin (Magnus) and drag, scattered by timing, footwork and incoming pace. Hard, clay
(with ball marks) and grass bounce differently. Full scoring (`score.ts`: deuce, advantage, tiebreaks, one set
or best of three, or a match tiebreak), lets, faults, Hawk-Eye on close calls, an optional spoken umpire
(the browser's speech voice), men's and women's draws against invented touring pros, and manual or assisted
footwork.

#### Sports+ Live

`/sports/live` shows three 24/7 channels, free to watch: **Screamer TV** (AI v AI footy, 12-minute slots),
**Derby Night** (6) and **Centre Court** (24). `src/games/live/schedule.ts` splits the clock into fixed
slots; each slot's seed (channel + slot number) picks the matchup and conditions and seeds the sim, and the
sims are deterministic, so `Broadcast` fast-forwards to "now" and everyone watching sees the same match.
Each channel's feed is lazy-loaded and drives the game's own view and HUD in spectator mode; the page adds
a commentary box, the coming-up schedule, sound / quality / full-screen controls and a link to play.

#### Boundary Blitz

T20 cricket (`src/games/cricket/`), in the Sports+ pass. `sim.ts` is the whole match ball by ball: deliveries
are real projectiles (launched to pitch on a target, swing in the air, seam and turn off the pitch), the bat
meets the ball through `contact()` (aim, shot type and timing against the ball's line and length: perfect,
early to leg, late to off, edges to the slips, played on, misses), LBW is judged by carrying the ball on to the
stumps, fielders read the hit's predicted flight (`predict`/`planField`) to catch it or cut it off, the batters
run what's safe before the throw (or what you push for) and throws run them out. AI batters look for gaps and
pace their innings to the chase; AI bowlers vary pace and spin deliveries and aim off for movement. You bowl by
choosing a delivery, a target on the pitch, a field and stopping a release meter (late is a no-ball and a free
hit). Online (`online.ts`), two people play each other in a room on the shared Realtime transports (BroadcastChannel
with `?net=local`): the first one in hosts and runs the match, the guest's sim is a puppet fed by snapshots (15 a
second, plus the scorecard when it changes) and sends its input back. Timing stays fair both ways: the guest flies
each delivery on their own screen and sends their press with its delivery time while the host holds the ball at
the bat until it arrives, and a guest bowler's meter value is the one they saw. `simulateToEnd` plays a whole match headlessly; across seeds an AI innings averages about 170 for 6 with
20 fours and 8 sixes. Modes: T20 (2, 5 or 20 overs), super over, nets. Registered by
`20261008090000_boundary_blitz.sql`.

The Sports+ games share `src/games/sports-kit/`: the renderer pipeline (tone mapping, shadows, bloom, SMAA,
the sharpening grade, adaptive resolution, sun or floodlights), the instanced crowd, stadium geometry
helpers, synthesized crowd/organ sound and the menu UI. Diamond Derby and Ace Rally are registered in the
`games` table by `20261005090000_sports_plus_derby_tennis.sql`.

### Life: the flagship

A life sim (`src/games/life/`) in two layers that feed each other:

- `life.ts`: the life, year by year (BitLife-style). Birth into a family, stats (happiness, health, smarts,
  looks), school, high school and university degrees (`careers.ts`), jobs with ladders and promotions, money and
  living costs, relationships (family, friends, partners, marriage, kids), random events with choices, activities
  (gym, dates, lottery, crime and prison...), health conditions, death, ribbons, a life score, and carrying on as
  one of your children with the inheritance.
- `world.ts`: Harbour City in 3D (Bloxburg-style), as data and rules: Main Street's shops and workplaces, 48
  residential plots, house builds (walls cut by doors and windows, floors, 26 furniture types), needs and the day
  clock, collisions, the cashier, barista and pizza-delivery shifts, and arcade driving.
- `models.ts` / `render.ts`: houses merged into a few meshes each, Code 3 facades on the shops, PBR ground, roads
  and footpaths, trees and street lamps, the harbour, parked cars, neighbours, your character and car, a sun that
  follows the clock, and build-mode ghosts.
- `lifeui.ts` / `index.ts`: the phone (stats, story, tabs, events, death and heirs) and the 3D day (HUD, shops,
  shifts, build mode). Saved in `localStorage` (`zx-life-save`). Registered by `20261009090000_life.sql`; it's the
  home page's featured game.

### Clanforge: base-building strategy

An original village-builder in the Clash style (`src/games/clanforge/`), with its own names, buildings,
troops and art. Everything is pure and driven by a timestamp, so offline progress is just `tick(v, now)`:

- `data.ts`: every building (Keep, Gold Mine, Mana Well, Gold Vault, Mana Vat, Barracks, War Camp, Builder's
  Hut, Clan Hall, Cannon, Archer Tower, Mortar, Storm Spire, Air Lance, Wall) and troop (Brawler, Ranger,
  Raider, Brute, Sapper, Drake) with levels, costs, times and what each Keep level unlocks.
- `village.ts`: the 40 × 40 village, builders and their timers, collectors, storage caps, the training queue,
  clan reinforcements, loot rules, raid and defence results. Saved to `localStorage` (`zx-clanforge`).
- `battle.ts`: the raid sim: deploy from the border (not next to a building), A* pathing that breaks
  through walls when it's cheaper, troop target preferences, defenses with projectiles and splash, stars
  (50%, the Keep, 100%) and loot. `simulateRaid` runs an AI raid headlessly.
- `bases.ts`: AI villages generated from a trophy count and a seed (walled core, rings of defenses,
  collectors outside), your village as a base, and raiders' armies.
- `render.ts` / `index.ts`: the three.js valley on the Sports+ pipeline, low-poly models for every building
  and level, the village HUD, shop with a placement ghost, army and clan panels, defence log, search /
  battle HUD and results. While you're away you're raided once per unshielded three hours (up to three).

Posting your trophies after a raid submits them as the score. Registered by `20261007090000_clanforge.sql`,
which also adds the `strategy` category.

### Sign in with Zero X (OAuth 2.1)

The Supabase OAuth 2.1 server lets other apps offer "Sign in with Zero X". Supabase sends players to
`/oauth/consent?authorization_id=…` (set **Authentication → OAuth Server → Authorization Path** to
`/oauth/consent`; it's joined to the Site URL). The page asks guests to sign in first, then shows the app,
the account it'll see and what each scope shares in plain words, and approves or denies through
`supabase.auth.oauth` (redirecting only to http(s) URLs). Apps already approved go straight back.
**Settings → Connected apps** lists the apps you've allowed and removes their access. Register clients in the
Supabase dashboard; for the `openid` scope use asymmetric JWT signing keys.

### Themes

Settings → Theme switches between **Classic** (dark neon) and **X-1+** (light and friendly). Both are the same CSS
tokens in `src/app/globals.css` (`html[data-theme="x1"]` overrides them), applied before paint by `themeScript`.

### Spots (ads)

After the intro, at most one spot plays per visit, in a queue: Boundary Blitz, then Clanforge (two plays each),
then Sports+ and Code 3 (three each). `useAdTurn` (`src/components/layout/ad-turn.ts`) handles the turn-taking
through `data-*` attributes on `<html>`, the play counts in `localStorage`, the one-ad-per-visit session keys,
and making the page inert while a spot plays. The spots are SVG and CSS, with no video files.

### Intro splash

`src/components/layout/IntroSplash.tsx` plays a CSS/SVG brand intro once per browser session. It's skippable with
the button, any key, or a tap, auto-dismisses after about 5 s, and is short and static with reduced motion. An inline
`<head>` script hides it before paint for returning visitors. E2E specs import `test` from `tests/e2e/fixtures.ts`,
which marks it as seen.

Right after the first intro, `src/components/layout/MegaAd.tsx` plays a one-time cinematic "mega ad" for every
game (about 18 s). It can't be skipped (a countdown shows what's left), the page behind is inert while it plays,
and it's marked as seen in `localStorage` as soon as it starts, so it never shows again. Invite links skip it.

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
