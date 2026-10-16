# Heatwave

The fourth NextX title and a ZLink+ exclusive: an open-world crime action game set in **Melbourne** in
a summer heatwave. Two leads, any car, and the police on your tail. It plays in the NextX app at
`/nextx/play/heatwave`.

## The city

A playable Melbourne, about 3.3 km by 2.7 km (`world.ts`):
- **The Hoddle Grid**: Flinders, Collins, Bourke, Lonsdale and La Trobe Sts crossed by Spencer through Spring, with the little streets and laneways between (some covered in graffiti), towers, sandstone banks and red-brick shops with awnings.
- **Around it**: Southbank and the casino on the Yarra, Docklands and Victoria Harbour, Swanson Dock's cranes and containers, West Melbourne, Carlton and Fitzroy's terraces with iron lace verandahs, East Melbourne, Richmond, South Melbourne, Port Melbourne, the Domain, South Yarra, Toorak's mansions, Albert Park and its lake, and St Kilda with its beach, pier and Acland St.
- **The water**: the Yarra with bridges at Queensbridge, St Kilda Rd, Kings Way, Clarendon St, Punt Rd and Church St; the bay from the West Gate round to Elwood, with the beach and bathing boxes.
- **Landmarks**, all modelled (`render/landmarks.ts`): Flinders Street Station with its dome and clocks, Federation Square, St Paul's Cathedral, a gold-crowned tower with a red stripe and a black-and-gold one, the Arts Centre spire, the casino and its gas towers, the MCG with its light towers, Docklands Stadium, an observation wheel, the Bolte and West Gate bridges, the Shrine, the Royal Exhibition Building, Parliament House, Queen Victoria Market, a fun park with a grinning gate and a scenic railway, the Palace Theatre, the pier kiosk, a ferry at Station Pier, Southern Cross Station's wavy roof and the Yarra boathouses.
- **Trams** (`trams.ts`): eight routes (16, 48, 96, the City Circle 35, 58, 78, 70 and 109) run along their tracks with stops, red lights and a bell. Modern three-section E-class trams and the City Circle's heritage W-class are drawn under the overhead wires.

## Playing

- **The leads**: switch between them with `C` or the Leads tab of the phone. The camera swoops up and over the city when you switch.
  - **Nina Cruz**: a getaway driver who grew up above a cake shop on Acland St. Perk *Wheelwoman*: 12% more grip, and the search ends faster when she's in a car.
  - **Dex Holloway**: a laid-off wharfie from Swanson Dock. Perk *Bruiser*: he takes 25% less damage.

  Each lead has their own safehouse (Nina's flat in St Kilda, Dex's cottage in Port Melbourne), outfit, weapons, health and car (Nina's red Castell Stallion and Dex's green Murray Ute, parked outside home). If a lead's car is wrecked, it's back at the curb the next time you're home.
- **On foot**: walk, run, sprint and jump; swim in the bay, the Yarra and the lakes.
- **Vehicles**: get into any car, bike or boat (not the trams). If someone's driving, you drag them out, and a locked parked car means breaking the glass. There are 17 to drive:
  - Cars and vans: the Wattle Hatch, Norden Aria, Melbourne Cab, Halvor Trek, Murray Ute, Orrin Cargo, Vanta GT, Castell Stallion and Furia RS.
  - Police and service vehicles: the Police Commodore, Highway Patrol and Critical Response van (white, with a blue-and-white chequered band), the ambulance and the Securitas armoured van.
  - The Rapido 600 bike, the Squall speedboat and the Yarra Runabout.
  - The Police Air Wing helicopter hunts you.

  Cars use a bicycle model with grip that changes with the surface (sand and grass are slippery), handbrake slides, damage, smoke, fire and explosions. A car in the sea stalls and sinks; bail out at speed and you tumble.
- **Traffic**: cars drive on the left in lanes, wait at stop lines, obey the 26-second light cycle at every lit junction, keep the junction box clear, give way to trams and turn on their own (left turns from the kerb lane). Pedestrians walk the footpaths, stroll the beach, cower, flee or fight back. Three gangs hold their own turf: the Dock Rats on the wharves, the Smith St crew in Fitzroy and the Esplanade boys in St Kilda.
- **Weapons**:

  | Weapon | Price |
  | --- | --- |
  | Fists | free |
  | Baseball bat | $120 |
  | Pistol | $450 |
  | SMG | $1,600 |
  | Pump shotgun | $1,250 |
  | Carbine rifle | $3,600 |
  | Grenades | $220 |
  | Body armour (absorbs two thirds of the damage) | $250 |

  Aiming locks on to the nearest target (always on touch screens, and optional with a mouse). Ammo is bought at the gun stores, and the dead drop cash or a weapon.
- **Wanted**: a crime the police see, or one a witness phones in, earns stars.

  | Stars | Who comes after you |
  | --- | --- |
  | ★ | Two patrol cars, and officers on foot who try to cuff you. |
  | ★★ | Three cars, and they shoot. |
  | ★★★ | A helicopter, and drive-bys from the cars. |
  | ★★★★ | A tactical van. |
  | ★★★★★ | Six cars, two helicopters and two vans. |

  Police cars route to you by the roads, chase and ram. Break their line of sight and stay out of the search area until the timer runs out, or drive into Spray Bay ($400).
  - Hospitalised: you wake at Yarra General Hospital with a $300 bill.
  - Arrested: you're released at a police station with a $500 fee, and you lose your weapons.
- **Story**: twelve missions alternate between the leads:
  1. Knock-Off
  2. Milk Run
  3. Toorak Tourist
  4. Collections
  5. Low Tide
  6. Box Job
  7. Pier Pressure
  8. Casing the Joint
  9. Gear Up
  10. Armoured Car
  11. Double Cross
  12. The Big One

  Each starts at a yellow marker beside a door. They run from Acland St to Swanson Dock, Toorak, St Kilda Pier and a vault on Collins St, and cover talking, driving, chases, losing the police, killing all, holding up a milk bar, stopping a car and taking your partner along. A failed mission ends there, and its marker waits for you to try again.
- **Side jobs** (the Jobs tab):
  - Four street races, each in its own car: Hoddle Grid Hustle, Beach Road Run, Dockyard Dash and the Albert Park Grand Prix.
  - Exports for Dockside Motors, the chop shop on the docks.
  - Milk bar hold-ups.
  - Twenty hidden sun tokens.
- **Shops**: walk into a door to open one.
  - Bullseye Arms, the gun stores in Richmond and South Melbourne.
  - Threadline, the clothes stores on Chapel St and in the city: 11 outfits.
  - Spray Bay in Richmond and Port Melbourne: a new colour and a clean slate.
  - Sunline Fuel servos.
  - Your safehouse: save, or sleep until 8 in the morning (or the evening).
- **The phone** (`Tab`, `M` or tap the minimap):
  - A map you can pan and zoom, with blips and a waypoint that the minimap's GPS line follows.
  - Jobs, Leads and Stats tabs.
  - Settings: quality, volume, music, sensitivity, invert, aim assist, touch layout, mph or km/h.
- **Radio**: four synthesised stations in any car. Neon 88 plays synthwave, Laneway 104 Latin and reggaeton, Bayside FM chill and lo-fi, and Bass Coast hip-hop and trap.
- **Time and weather**: a full day takes 24 real minutes. The sun rises in the east, crosses the north and sets in the west. Dusk runs into a night of lit windows, signs and street lamps. Summer storms bring rain and leave the roads wet for a while after.

## Graphics

Mobile first: there are three quality tiers. Phones with eight or more cores get medium (the full atmosphere), older phones get low, and desktops get medium or high. Adaptive resolution steps down when frames run slow.
- **Buildings** (`render/facade.ts`): one physically lit material draws every wall from a few numbers per vertex. The wall types are glass curtain walls, concrete grids, Victorian sandstone with arched windows, red brick, painted render, weatherboard, corrugated iron and bluestone. There are shopfronts at street level and a room behind every window (interior mapping, off on low), with blinds and lights at night. Fine patterns melt to their average with distance, so they never shimmer. Corrugated-iron hipped, gabled and sawtooth roofs, cast-iron lace verandahs (two storeys on the bigger terraces), shop awnings and signs.
- **Streets**: Australian markings (white centre lines, broken-line crossings, stop lines), kerbside lights on the left with a second low head, bluestone kerbs and channels, darker bluestone paving in the city, tram rails, overhead wires on poles, tram stops with shelters, and street trees (London planes, elms and gums).
- **Sky** (`render/sky.ts`): blue deepening overhead and away from the sun, a hazy horizon that burns orange round the sun at dawn and dusk, a Mie glow, lit cumulus with silver edges, cirrus, and a moon and stars at night.
- **Post** (`render/post.ts`): the scene renders HDR into a multisampled target with depth, then:
  1. Height fog that thickens toward the ground and brightens toward the sun.
  2. Light shafts between the towers.
  3. Heat shimmer off the road on hot, clear afternoons.
  4. Depth-based ambient occlusion (on high).
  5. Bloom (medium and high).
  6. A filmic pass: ACES, cool shadows and warm highlights, an S-curve, vignette, lens fringing, grain and dithering.

  Low runs the film pass only.
- **Score**: money earned ÷ 10, plus 5,000 a story mission, 1,200 a race win, 600 an export, 300 a token and 200 a hold-up. Progress is reported as you play; the final score goes in when you finish the story or leave the game (going back to the title only saves). The server caps it at 500,000 (`20261112100000_heatwave.sql`). Members only.

## Controls

| Keyboard and mouse | Touch |
| --- | --- |
| WASD move / drive, mouse to look (click to capture) | Drag on the left to walk or steer, on the right to look |
| Left click fire, right click aim | Fire / Hit and Aim buttons |
| F or E get in and out | Car / Exit |
| Shift sprint, Space jump (handbrake in a car) | Run, Jump; Gas, Brake, Drift |
| Q / X / wheel switch weapon, R reload | The weapon button |
| C switch lead, N radio, H horn | The lead and radio chips |
| Tab or M the phone, Esc / P pause | The phone chip, the pause button |

## Code

| File | What it does |
| --- | --- |
| `world.ts` | Melbourne: the bay's shore, the Yarra, the lakes, Victoria Harbour, piers and bridges. It also builds the road graph (named boulevards, avenues, streets and laneways, junctions with lights), the tram routes, the landmarks, buildings by district (with their wall types, roofs and verandahs), props, POIs and parks. Spatial lookups: solids grid, road index, A* routes. Pure, seeded and cached per seed. |
| `data.ts` | Vehicles, weapons, leads, outfits, prices, the wanted table and the radio stations. |
| `state.ts` | The simulation state and its helpers. Plain data, so a save is a JSON copy. |
| `vehicles.ts` | Car physics, collisions, crash damage, explosions, doors and seats. |
| `traffic.ts` | Traffic lights, lane following (on the left), junction rules, AI drivers, spawning and despawning traffic and parked cars. |
| `trams.ts` | Tram tracks built from the routes (offset to the left, curved corners), the stops, and trams that dwell, wait at red lights and for anything on the track. |
| `peds.ts` | Movement on foot, swimming, pavements, the beach, crowds, gangs, fights. |
| `combat.ts` | Hitscan, melee and thrown weapons, lock-on, damage and armour, deaths, grenades. |
| `police.ts` | Crimes, witnesses, stars, the search, dispatch, police driving, arrests, the helicopter. |
| `missions.ts` | The step kit, twelve story missions, races, tokens and side jobs. |
| `sim.ts` | The fixed 60 Hz step that runs it all, getting in and out, hospital and arrest, shops, switching, save and load, the score. |
| `render/` | three.js. `city.ts` streams the city in 160 m chunks (fine detail only on the near ones, a far skyline in the same facades beyond that hides what the chunks draw) and lights lamps at night. `facade.ts` and `sheet.ts` are the wall shader and its geometry builders. `landmarks.ts` models the landmarks. `actors.ts` draws people and cars with the shared Code 3 kit (police in Victoria livery), and `tram.ts` the articulated trams. `sky.ts`, `post.ts`, `fx.ts`, `camera.ts` and `view.ts` cover the sky, the post chain, effects, the camera, the sea and shadows. |
| `audio.ts` | Engine, siren, surf, effects and the radio sequencer (Web Audio, no files). |
| `game.ts` | The controller: input from keys, mouse and touch, the loop, the HUD state, shops, the phone, preferences and autosave. |
| `ui/` | The React HUD, touch controls, phone and shops (`hw-` test ids), the map and minimap canvases, and the styles. |
| `index.ts` | The `GameModule` for the platform. With `?hw` it exposes `window.__hw` and `window.__hwsim` for tests. |

The simulation never touches the DOM or three.js, so `heatwave.test.ts` runs it headless:
- world generation;
- traffic at the lights;
- trams on their routes;
- shooting into a wanted level and a hospital respawn;
- the first mission;
- save and load.

`tests/e2e/heatwave.spec.ts` plays it in the browser on desktop and on a phone.
