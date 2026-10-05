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
- ZXG accounts (account name + password; an email is optional, for password resets and signing in with it):
  online when Supabase is connected, otherwise saved on the device, so sign-up always works
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
  app/                        routes: / · /games · /games/[slug] · /leaderboards · /profile · /settings · /owner · /auth/*
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
- `items.ts` defines seven weapons (pistol, SMG, assault rifle, pump shotgun, sniper, Marksman Rifle, Light
  Machine Gun; in Trenches the last two are the Gewehr 98 and the Lewis Gun), rarities from common to
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
  - **Belleau Wood:** a seventh front (Château-Thierry, June 1918): open summer wheat fields in front of a
    thick wood of trees and boulders, a hunting lodge in ruins and a barn. Its medal is the Belleau Oak Leaf.
    `20261014090200_trenches_belleau.sql` lets the server record matches there.
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

Below the channels, **Live scores** follows real sport as it happens, from free public data only: ESPN's
public site API (AFL, Premier League, Champions League, A-League, LaLiga, MLS, NBA, WNBA, NFL, MLB, NHL; no
key) and TheSportsDB's free tier (cricket and rugby; key `123`, or set `THESPORTSDB_KEY`). `/api/live-scores`
(`?league=nba`, `&event=<id>` for one game) fetches and normalises them (`src/lib/livescores.ts`) and caches
each answer for 20 seconds, so all visitors share one upstream call. The page polls every 30 seconds while
visible and shows each game's score and clock, play by play, team stats, where it's on TV and links to the
official match centre and highlights. Real broadcasts aren't free to show, so the site links out rather than
streaming them.

**Screamer, update two.** A **women's competition** (the same eighteen clubs; women's player models and a
slightly lighter kick) for exhibitions and premierships. Every club now has a fixed list (`rosters.ts`), so a
season keeps names: the premiership hub shows the **League Medal** count (3-2-1 votes from every
home-and-away game, played or simulated) and the **leading goalkicker**, with an awards night at the end.
Close calls (just inside or outside the post, or touched off the boot) go to a **score review**: the replay
runs under a SCORE REVIEW tag and the verdict follows. And the **goalkicking challenge**: ten set shots for
your full forward from in front out to the pockets, the field cleared, the wind and the needle against you
(6 a goal, bonuses from 35 and 45 m).

**Screamer, update three: the coach and the big day.**

- **Coach mode** (`coach.ts`, `coachui.ts`): run a National League club.
  - **The list:** thirty players: the club's eighteen plus depth, each with an age, a rating, potential, form, fitness and injuries.
  - **Before each game:** pick the eighteen (six backs, five mids, six forwards, a ruck), a game plan and the week's training. Game plans counter each other in a circle: attack beats the flood, the flood beats pressure, pressure beats possession, possession beats attack. Training is fitness, skills, match prep or recovery.
  - **Match day:** coach each game a quarter at a time in the match centre (`CoachMatch`), with a speech and changes at every break, or play it yourself in 3D.
  - **The board:** sets a target from where the club's tipped and sacks you if its patience runs out.
  - **The off-season:** the year in review, Coach of the Year, the trade period, a two-round national draft (reverse ladder, scout grades), job offers, ageing, development, retirements and rookies.
- **The premiership** (`premiership.ts`, `season.ts`) is now a dynasty. `nextYear` carries an honour board on.
  - **Form:** clubs' form drifts with results (`momentum`); there are form guides and streaks.
  - **The competition:** round-by-round results with talking points (`headlines`) and a finals bracket.
  - **Grand Final week:** the tale of the tape.
  - **Awards night:** reads the League Medal count out live, round by round (`medalRounds`), plus the All-League team.
- **Grand Final day:**
  - **Before the bounce:** the 3D view sweeps the packed ground through the build-up (banners, anthem, fireworks over the stands; `grandFinal`, `fireworks`).
  - **At the siren:** the winners, whoever they are, get the cup, confetti and fireworks.
  - **The presentation** (`ceremony.ts`): the flag, the cup, quarter-by-quarter scores, the Grand Final Medal and every premiership player's medal. It runs whether the final was played, coached or simmed.

#### Fairway

Golf (`src/games/fairway/`), in the Sports+ pass, on two original nine-hole courses: Saltgrass Links (dunes,
fescue, pot bunkers, the sea down one side, windy) and Ironbark Hills (gum-lined parkland with lakes).
`course.ts` builds each hole from a fixed seed: the line of play (straight or a dogleg), green, pin, bunkers,
ponds and trees, plus two pure functions over it, `heightAt` (sampled on a 25 cm lattice as it's asked for)
and `lieAt`, that the physics and the renderer both use. `sim.ts` flies every shot: launch speed, angle and
backspin per club, drag and Magnus lift, a spin axis tilted by a mis-hit so it curves, wind that grows with
height; then bounce, spin bite and roll by lie and slope, trees, lip-outs and the cup. The three-press meter
sets power and accuracy (early fades, late draws). The caddie suggests a club and line from the yardage book
(each club flown once on flat ground) and the "plays like" distance (rise and wind). Stroke play is against
11 AI pros with Stableford points; closest to the pin is five balls at a par 3. The view paints each hole's
lies into a texture (mowing stripes, first cut, sand, beach) over a detail texture on the terrain, with
Code 3's instanced trees, grass tufts, water, a gallery, break arrows on the greens, a TV tracer and a
camera that cuts to where the ball will land (by flying a copy ahead). `simulateToEnd` plays a round
headlessly; the autopilot solves putts by rolling trial putts and makes pars.

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

**The mega update.** The **Blitz League** (`league.ts`): a season for the eight franchises, everyone once,
two points a win then net run rate (an all-out side counts its full quota of overs), semi-finals 1 v 4 and
2 v 3, and a final. Play your games in the stadium or sim them; everyone else's are simulated ball by ball
from the squads' ratings, so every player has a season, and the **Orange and Purple Caps** follow the leading
run-scorer and wicket-taker. **DRS**: umpires now miss the odd LBW (more often on the marginal ones), and each
side gets one review an innings (V or REVIEW, seven seconds to decide; the AI reviews when it's fairly sure).
Ball-tracking replays the delivery's real path and carries it on to the stumps, revealing pitching, impact and
wickets in turn on a clean virtual pitch; umpire's call stands and keeps the review. The **powerplay** keeps all
but two fielders inside the circle for the first 30% of the overs. And full **scorecards** (how out, R, B, 4s,
6s, strike rate, extras, did not bat, bowling figures) with a **wagon wheel** of every scoring shot, at the
innings break, at the end and any time with Tab or CARD. DRS is off online.

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
  shifts, build mode). Investments (shares that move with a yearly market, rental property bought with 20% down
  and a loan rent pays off), pets, followers from posting and collabs, and trips abroad live on the Assets tab
  and count toward the life score. Saved in `localStorage` (`zx-life-save`). Registered by `20261009090000_life.sql`; it's the
  home page's featured game.

### Hometown: the online town

A persistent online town shared by everyone signed in (`src/games/hometown/`), on Life's Harbour City (its
streets, plots, house builder and renderer). Unlike every other game here, the state lives on the server:

- **The database is the game.** `20261011090000_hometown.sql` and the three files after it create the `town_*`
  tables (citizens, inventories, the 48 lots and their builds, businesses, the order book and trades, shops and
  shelves, elections, candidates, votes, the news log) and the `town_*` functions. Every table is read-only to
  clients (inventories and votes only to their owner); every change is a `SECURITY DEFINER` function that reads
  `auth.uid()`, locks what it touches and keeps money and goods conserved. Helpers (`town__*`) aren't callable.
- **Economy.** Shifts (farm, timber yard, mine: raw goods and $10; public works: the mayor's wage from the
  treasury) cost energy (it refills a point every two minutes; bread restores 35) and have a cooldown.
  Businesses on your lot turn goods into products (mill, bakery, sawmill, workshop, foundry, smithy); tools
  speed up shifts. The exchange is a limit order book: orders escrow cash or goods, match the best resting
  price, and closed orders are kept as history (`open = false`, never removed). Shops sell from shelves at
  the owner's price. Sellers pay the sales tax into the treasury; land sales carry the house, business and
  shop with them.
- **Civics.** Elections every six hours, resolved lazily (`town__tick` runs at the start of a snapshot, a vote or
  a candidacy): a 100 filing fee, a slogan and a platform (sales tax 0–20%, public wage 20–200), one changeable
  vote each. The winner's platform takes effect and the mayor can adjust it.
- `economy.ts`: items, jobs, recipes and rules, plus `LocalTown`, the same rules in memory (unit-tested in
  `economy.test.ts`). `backend.ts`: `SupabaseBackend` (thin RPC wrappers) and `LocalBackend`, the practice town
  (a few neighbours trading, a shop, a ballot), used without an account and by the e2e tests (`?town=local`).
- `presence.ts`: one Supabase Realtime room (`town:MAIN`) for positions (a few a second while moving), chat
  (rate-limited, sanitised) and "dirty" pings that make everyone refresh sooner. Nothing on it is trusted.
- `index.ts`: the 3D client. Walk Main Street (Life's shops repainted as the land office, farm co-op, timber
  yard, mine, City Hall, exchange and Gazette), visit lots (buy, shop, business, list for sale), build (a plank
  per wall, a piece of furniture per item), the phone (bag, market, Gazette), chat and other players' avatars
  with name tags. The clock is shared: a day every real hour.
- **Town Bank and allowance** (`20261014090100_hometown_bank.sql`): `town_bank` deposits or withdraws savings,
  which earn 2% a day paid lazily from the treasury when your savings are next touched (and only while the
  treasury can pay). `town_allowance` pays the public wage from the treasury once every 20 hours at City Hall.
  The HUD has a minimap and emotes (keys 1–5) that neighbours see through the presence pose.
- **Servers** (`20261015090000_hometown_servers_npcs.sql`): `town_servers` lists three streets of the one town,
  Main Street (open), Harbour Side and Hillcrest (in development, locked). Each server is its own Realtime room
  (you see the players on yours); land, money and elections are shared. Only the site owner's account (by its
  email, `town__owner()`) can open or close the dev servers, from the Hometown menu (`town_set_server`).
- **Townsfolk** (`npcs.ts`): up to twelve NPC citizens pace the footpaths, rest, chat and answer when you press
  E beside them. They make way for real players (twelve on the street at most). Where each one is comes from the
  shared clock (offset to the server's), so everyone on a server sees the same person in the same place with no
  network traffic. On the server the same townsfolk run the market while nobody is playing: `town__npcs()` (run
  by `town__tick`) catches up every quiet ten minutes since the last visit, buying a fair ask from a player
  (paid by the treasury) or selling from their stall (`town_npc_stock`) into a fair bid, so money only moves
  between players and the treasury.
- **Builder catalogue** (`life/catalog.ts`, shared with Life): 100 pieces on top of the original 26, in three
  tabs: Furniture (34 new: kitchen island, king and bunk beds, corner sofa, arcade cabinet, pool table, gaming
  setup...), Decor (33: lamps, chandelier, rugs, plants, aquarium, drum kit, fireplace...) and Outdoor (33: fences,
  hedges, trees, gazebo, shed, swings, trampoline, fountain, deck...). Each is plain data (footprint, price, what
  using it does, and its shape as boxes, cylinders, balls, cushions and cones that `models.ts` builds). Outdoor and
  potted pieces stand on bare ground; flat ones (rugs, decks) can have things on top. Every build loaded from the
  server goes through `cleanBuild`, which drops unknown or malformed pieces instead of crashing.
- **Touch stick** (`life/touchstick.ts`, shared with Life): the ring jumps under your thumb and the knob follows
  it exactly; walking is camera-relative (`cameraMove` in `life/world.ts`).

### UBusiness: run your own store

A photoreal retail sim (`src/games/ubusiness/`), sold in two editions through `player_unlocks`
(`20261016090000_ubusiness.sql`): **Lite** for 5 coins and **Ultimate** for 30 (25 more from Lite), with Ultimate
free for anyone holding this season's battle pass. `ubusiness_tier()` answers which edition you have,
`buy_ubusiness(tier)` takes the coins (guests pay from their device save, like Sports+). The game page shows the
two-edition card (`UBusinessCard`) instead of **Play** until you own one, and under the game afterwards so Lite
owners can upgrade.

- `logic.ts`: the rules, in cents. 45 products across 8 departments (licences unlock by level), fixtures (shelves,
  glass fridges, produce stands, clothing rails, tech displays, checkouts, self-checkouts, decor), the wholesaler
  and the stockroom (deliveries take 30 game minutes, 5 express), prices and what shoppers will pay (around the
  usual price, more at a well-liked store), footfall over the day, staff (cashiers, stockers), six store sizes,
  marketing, the till (customers tender the next note up; change in the fewest notes), the evening books (rent,
  wages, power), XP and levels, saves, and a walk grid with BFS paths. Tested in `logic.test.ts`.
- **Editions:** Lite sells grocery, snacks, household and fresh, grows to a Mini Market and has one member of
  staff. Ultimate adds health and beauty, toys, fashion and electronics, six sizes up to a Megastore, six staff,
  self-checkouts, marketing, express delivery, 3× speed, custom signs and photo mode.
- `render.ts`: a doll's-house view of the shop (walls between the camera and the floor drop away; the fascia and
  awning hide with the front wall). Polished concrete with clearcoat reflections, an interior reflection map
  (`RoomEnvironment`), down-facing LED panels and a few real lights, glass shop front with the physical sky and
  the street outside, a stockroom with a box stack per product line, and every product instanced (one draw per
  line) with its own printed packaging. Shoppers and staff are the articulated people from Code 3.
- `index.ts`: shoppers walk in, follow their list, judge each price, queue (patience runs out), and pay. Your own
  till is a mini-game: scan each item (Space), then approve the card or count out the change from the drawer;
  mistakes cost money or goodwill. Panels for stock, prices, staff, build (place, move, rotate, sell), licences,
  marketing, the store (grow, rename, sign colour) and the books. **Bank my score** submits the business's value.

**Every day is different.** About half the days bring an event (`EVENTS`, the same for a given store and day): a
heatwave sells cold drinks, rain keeps shoppers home but sells soup and coffee, payday and street festivals bring
crowds, health week sells fruit and vitamins, the wholesaler has a 15% sale, or a delivery strike triples delivery
times. It shows as a banner (and rain falls outside). Three **daily goals** (serve, takings, sell a department,
keep shoppers happy, clean up) pay cash and XP when met. **Demand follows price**: a bargain lands on more
shopping lists, an overpriced line drops off them. Shoppers **leave mess** (spills with a wet-floor sign, litter)
that drags everyone's mood and footfall down until you click it clean or hire a **cleaner**. Ultimate adds
**standing orders**: keep N boxes of a line in the stockroom, topped up overnight. Shoppers show how they feel in
speech bubbles; cars and pedestrians pass in the street; the door chimes and the till rings.

**The big expansion.** Two new departments: **Frozen** (Lite and Ultimate, sold from freezers) and the **Bakery**
(Ultimate, a warm-lit bakery case). Fresh food now **goes off overnight** (`spoil`: bakery loses half, bread and
produce some, tins nothing), shown as waste in the books, so you order what you'll sell. **Specials** (☆ on
Prices): 20% off, 1.5× the demand and a few more shoppers; Lite runs one, Ultimate one plus one per promo stand, up
to three. **Store upgrades** (automatic doors, sound system, tap-to-pay, LED lighting, CCTV, air conditioning, a
loading bay, a loyalty app) each change one rule. **The bank** lends a small loan (both editions) or a growth loan
(Ultimate), repaid each evening and counted against your score. **Shoplifters** (from day 2) head for the door with
the goods: a 🚨 alert lets you stop them, CCTV halves them and a **security guard** stops most at the door.
Shoppers leave **reviews** (stars follow their mood, the words their reason: sold out, too pricey, the queue, the
mess, short change). Sixteen **trophies** pay out once. New days: **Halloween** (far more likely in the last week
of October, with pumpkins at the door), a cold snap, big match day and school holidays. From day 6 **Bargain Barn**
opens across the street and takes a share of your shoppers, more if you're dearer than usual and less if you're
well liked; marketing and a 4★ reputation push it back. Old saves load with all of it switched on.

**Round three: people.** Shoppers come in six types (`SHOPPER_TYPES`): regulars, families (big trolleys, short
patience), pensioners (slow, patient, mostly cash, health and bakery), students (snacks on a budget), foodies (fresh
and bakery, pay more) and, from day 3 and at most once a day, a **food critic** whose verdict lands in tomorrow's
paper (±0.4★ reputation, kept under 📰 in the trophies panel). **Staff improve**: a level every five days worked
up to ★★★, and training courses to ★★★★★; better cashiers scan faster, stockers keep shelves fuller, cleaners mop
more, guards miss less, and wages rise 10% a star. A **Coffee Bar** fixture sells a $3.80 coffee to a quarter of
paying shoppers (two bars, up to 45%). The wholesaler's **bulk deal** takes 8% off five boxes and 15% off ten. A
**late-night licence** keeps the doors open until 10pm (wages and power +15%). A **price promise** (both editions)
halves what Bargain Barn takes for a day. Every seventh evening brings **the week in review**, and the books show
**profit per day** for the last fortnight. Fixed: the evening report couldn't be dismissed, so a store couldn't
start its second day.

**Free Ultimate until 31 October.** `claim_ubusiness_free()` (`20261018090000_ubusiness_free_claim.sql`) gives a
signed-in player the Ultimate unlock for nothing until 2026-11-01 12:00 UTC (the end of the 31st anywhere on Earth);
guests claim into their device save. A claimed copy is an ordinary unlock, so it's theirs to keep. The edition card
shows the offer while it's open (`UBUSINESS_FREE_UNTIL` in `src/lib/economy.ts`).

**The UBusiness spot** (`UBusinessAd`, 26 s): a shutter rolls up at dawn, the logo, a COMING SOON stamp, stock
dropping onto shelves, the till counting up to CHA-CHING, the store growing from a corner shop to a megastore,
the two editions, and a **Take a look** end card. It's first in the ad queue (three plays).

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

After the intro, at most one spot plays per visit, in a queue: UBusiness (three plays, and only on 30% of visits: the roll is kept for the visit, and a miss passes the slot on without using up a play), Boundary Blitz, then
Clanforge (two plays each), then Sports+ and Code 3 (three each). `useAdTurn` (`src/components/layout/ad-turn.ts`) handles the turn-taking
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

- **`claim_daily_reward(p_peek)`** (`20261014090000_daily_rewards.sql`) is the home page's daily rewards: 5, 5,
  10, 10, 15, 20 and 50 coins over a 7-day cycle, one claim per UTC day, back to day 1 after a missed day. Paid
  through `add_coins` with a `daily` ledger entry; guests keep the same cycle in `localStorage`
  (`src/lib/daily.ts`). The "What's new" list under it comes from `src/lib/updates.ts`.
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
| `town_*` (Hometown)   | everyone (inventory, votes: owner) | `town_*()` functions only                    |

### Moderation

Signed-in players can flag another player from any leaderboard row (offensive name, cheating, harassment,
other). The site owner works through them in the owner panel (below): **Hide player** sets
`profiles.is_hidden` (off every public board) and closes the report as `actioned`; **Dismiss** closes it as
`dismissed`. `target_type` is open-ended, so future user content can reuse the same pipeline.

### Owner panel (`/owner`)

Signed in with the site owner's account (`decmar098@gmail.com`), a 👑 appears in the bar and `/owner` opens the
panel. Everyone else gets "Not available", and every call is checked again in the database (`site__owner()`
compares the signed-in user's email in `auth.users`), so the page is only a view.

- **Numbers:** players (new today/this week, active this week), plays and a 14-day chart, coins in circulation and
  this week's flow, battle pass holders, Sports+ and UBusiness sales, Hometown citizens and treasury
  (`owner_dashboard()`, one call).
- **Announcement:** a banner across every page (`owner_set_setting('announcement', …)`): 2–200 characters, a tone
  (info, success, warning, event) and an optional link to a page on the site. Players can dismiss it; a new one shows
  again (dismissals are keyed by its id in `localStorage`).
- **Maintenance:** take any game down; its Play button becomes "Down for maintenance" for everyone but you.
- **Coins:** give a player coins or take some back (`owner_grant_coins`, logged as `owner` in `coin_ledger`).
- **Players and reports:** hide or unhide from the boards, work the open reports queue.
- **Hometown servers:** lock and unlock Harbour Side and Hillcrest.

Settings live in `site_settings` (readable by everyone; written only through `owner_set_setting`).

### ZX Cash and the fresh start

The site currency is **ZX Cash** (it was "coins"; code and the `player_wallet.coins` column keep the old name). Its
mark is an emerald token with a struck-through Z (`CoinIcon` in `src/components/shop/Coin.tsx`). The switch came
with a full reset, and everyone starts at zero:

- **Server** (`20261022090000_zx_cash_fresh_start.sql`): truncates the ledger, XP events, ZLink+ memberships, season
  progress, challenges, achievements, unlocks, cosmetics, loadouts, match records, play sessions and the Hometown
  economy; zeroes wallets, XP and streaks; puts every Hometown lot back on the market. Accounts, usernames,
  favourites, reports and leaderboard scores stay.
- **Devices** (`src/lib/fresh-start.ts`): an inline script in the root layout runs before first paint, once per
  `FRESH_START_EPOCH`, and clears every `zx-` save except settings, sign-ins, graphics and other preferences, ad
  counters and favourites. Bump the epoch to wipe devices again.
- Returning players see a one-time **Welcome to ZX Cash** notice (`FreshStartNotice`).

### Cash Cup (the tournament app)

`/cash-cup` is a full-screen app for Neon Siege tournaments (`src/components/cash-cup/CashCupApp.tsx`). It opens
on a cinematic intro (beams, a shockwave, the ZX Cash mark and the title slamming in), a loading screen while the
match engine and the 3D renderer load, then a flash-and-zoom reveal into the lobby: balance, the entry button,
the purse, your recent cups and a graphics picker. Entering stamps a ticket, drops you into the match, and the
prize is counted out with a burst of ZX Cash at the end; a win first gets the champion's celebration (gold
beams, a trophy slamming down, CHAMPION letter by letter, confetti and falling ZX Cash). No site intro, ads or notices interrupt it
(`src/lib/quiet.ts`).

- **The match** (`src/games/cash-cup/match.ts`): the Neon Siege shell with 55 fighters on Hard, on the
  **Cash Cup Arena**: four different towns stitched two by two (`cupArena()` in `map.ts`, 144 × 144, four times
  Ground Zero). The storm scales with the map (`phaseOf()` in `storm.ts`: wider circles, longer waits).
- **Entry:** 10 ZX Cash; the battle pass gives **two free entries a season** (used first). One cup at a time; an
  unfinished entry is forfeited when you enter again.
- **Prizes:** 250 / 125 / 75 / 40 (4th–5th) / 20 (6th–10th) / 10 (11th–15th), plus 3 per elimination.
- **Server** (`20261023090000_cash_cup.sql`): `cash_cup_entries`, `cash_cup_status()`, `enter_cash_cup()` and
  `finish_cash_cup()` (field raised to 55 in `20261024090000_cash_cup_55.sql`), which checks the result against the time since the entry (no top-ten finish in under a
  minute, no win in under 150 s, kills ≤ players outlasted) and pays it once. Guests get the same rules on their
  device (`src/lib/cash-cup.ts`, `season-client.ts`).
- The free Cash Cup every third Neon Siege match (50 · 20 · 5) is unchanged.

### ZLink+ (the membership)

**40 coins for 30 days** (`/zlink`; `20261019090000_zlink.sql`, `20261020090000_zlink_plus.sql`). Members get:

- **Zenith** and **Linkwave**, the members-only games (below). Their scores are refused for non-members by
  `submit_score`, so their leaderboards are members against members.
- **Every Sports+ game** and **UBusiness Ultimate**.
- **+25% XP** on every game except Neon Siege (in `submit_score`).
- **Double daily rewards**, and a **weekly drop** of 15 coins (`claim_zlink_drop()`, once every 7 days).
- **Link levels** from total days ever linked: Bronze 30, Silver 90, Gold 180, Neon 365 (`days_total`; never go down).
- The glowing **Z+** beside their coins, and a dashboard on `/zlink` (the exclusive game, level, drop).

It never renews on its own: joining again adds 30 days to wherever it runs to. **Neon Siege is not part of
ZLink+**: it stays free to play, and its battle pass, item shop and Cash Cups are bought separately. Anything bought
outright (Sports+, a UBusiness edition) is kept either way. Guests get the same rules in their device save.

### Linkwave (ZLink+ exclusive)

A neon link puzzle against the clock (`src/games/linkwave/`). A 6×8 board of five colours: drag through neighbours
of one colour (three or more) and let go to clear them; the rest fall and new nodes drop in. Close a **loop** and
every node of that colour goes (+3 s). A link of six leaves a **Pulse** (clears the 3×3 around it); a loop leaves a
**Prism** (clears its row and column), and power nodes set each other off. Links within 2.2 s build a combo up to
×5; links of five or more add 1.5 s. 75 seconds to start. Mouse, touch, or the keyboard (arrows, Space/Enter to
start and finish a link, Backspace to drop it). The rules are pure functions in `logic.ts` (tested, including a
hundred-link run that never leaves the board without a move); `index.ts` draws it on a canvas.

### Zenith (ZLink+ exclusive)

A photoreal city builder (`src/games/zenith/`; `20261021090000_zenith.sql`). A 48×48 map of 12 m tiles: a winding
river, woods, and a highway in from the west. Drag **roads** off it (L-shaped, $25 a tile, bridges $150), paint
**zones** beside them (residential, commercial, industrial; high density from Town), and supply **power** (coal,
wind, solar) and **water** (towers, riverside pumps). Buildings move in where there's demand, road access, power
and water, level up to 3 as land value rises (services, parks and the river add it; pollution takes it away), and
empty out after 20 days without. **Police, fire, clinics, hospitals and schools** cover a radius; the **views** show
power and water, land value, pollution and each coverage. Taxes per zone against upkeep in **Budget**; five
**milestones** from Hamlet to Metropolis, each with a grant and new buildings. The population is the score, banked
from **City** whenever you like (cap 400,000; members only).

`logic.ts` is the whole simulation as pure functions (tested). `render.ts` draws it with the shared PBR pipeline:
physical sky with a day/night cycle, the photoreal facades from Code 3 (windows light up at night), asphalt roads
with markings, sidewalks and streetlights, reflective water, instanced trees and traffic, chimney smoke, and a
data-texture overlay for the views. Buildings are merged per 8×8 district and rebuilt only when that district
changes. Camera: drag to pan, right-drag or two fingers to rotate, wheel or pinch to zoom, WASD/QE. The city saves
on the device every 10 seconds (`zx-zenith-city`). Tests drive it through `window.__zenith`.

### The look: arcade noir

Every page sits on a slow **aurora** (three soft gradient blobs drifting on their own clocks, transforms only) under
a fine **film grain**; the navbar floats as a frosted-glass pill. The hero has a synthwave **horizon floor**, a giant
outlined **X**, kinetic display type with a gradient sweeping through it, and a **ticker** of every game. Game cards
**tilt toward the pointer** with a glare that follows it (`TiltCard`, mouse and pen only) and light a spinning
gradient **ring** on hover; buttons are pills with a **sheen** that crosses on hover. Sections carry big outlined
numbers that slide in as you scroll (CSS scroll timelines), there's a **Why Zero X** bento grid, and the footer
ends on a giant outlined wordmark. All of it lives in the "Arcade noir" block of `globals.css`, runs on the theme
tokens (so Classic and X-1+ both get it), and holds still with reduced motion. Kept deliberately cheap: nothing
repaints every frame except while you hover it, and nothing that can be clicked ever moves on its own.

### The library and game pages

`/games` opens on a big header (the game count in outline over a horizon floor) with a sticky glass filter bar:
search, a segmented sort and category pills. Each game page opens on a cinematic header lit by the game's own art,
with its access badge (Free, Sports+, Lite · Ultimate, ZLink+ exclusive, or "Included with ZLink+"), then the stage,
an About panel with tags, keyboard and touch controls, and a sticky leaderboard.

### The front page

A spotlight carousel (Life, UBusiness, Hometown, Trenches, Neon Siege, Code 3; turns every 6.5 s, pauses on
hover/focus, stands still with reduced motion), **Browse by vibe** collections (`src/lib/spotlight.ts`), and search
everywhere with **Ctrl/⌘+K** (`CommandPalette`, `src/lib/palette.ts`). Game cards only show ratings and play counts
once there are some; until then they show tags and whether the game is free or needs a pass.

## Supabase project

**zero-x-gaming** (`tbvaqinnbicxhlaqltik`, Sydney). All migrations in `supabase/migrations/` are applied.

One-time dashboard setup, which can't be done from code:

1. **Accounts need no dashboard switch.** Auth's own sign-up rejects the hidden `<name>@zxg-acc.invalid`
   addresses, so accounts are created, already confirmed, by `zxg_create_account` (an optional real email goes
   in its place). `zxg_login_email` lets the account name sign in to an account with an email (it returns the
   address only for the right password), and `zxg_set_email` adds, changes or removes it from Settings.
   "Forgot password?" mails a reset link (Supabase's mailer) back to `/auth/callback?next=/settings?reset=1`.
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
2. Nothing to add for Supabase: the live project's URL and publishable key are built in (`src/lib/supabase/env.ts`;
   both are public by design, row-level security guards the data). Set the two `NEXT_PUBLIC_SUPABASE_*` variables
   only to point at another project, or `NEXT_PUBLIC_SUPABASE_URL=off` for guest-only mode. Optionally set
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
