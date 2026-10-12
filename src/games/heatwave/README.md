# Heatwave

The fourth NextX title and a ZLink+ exclusive: an open-world crime action game in **Port Solano**, an
island city on the sun coast. Two leads, any car, and the police on your tail. It plays in the NextX
app at `/nextx/play/heatwave`.

## Playing

- **The leads**: switch between them with `C` or the Leads tab of the phone. The camera swoops up and over the city when you switch.
  - **Nina Cruz**: a getaway driver from the Strand. Perk *Wheelwoman*: 12% more grip, and the search ends faster when she's in a car.
  - **Dex Holloway**: a laid-off dockworker. Perk *Bruiser*: he takes 25% less damage.

  Each lead has their own safehouse, outfit, weapons, health and car (Nina's red Castell Stallion and Dex's green Mesa Ranger, parked outside home). If a lead's car is wrecked, it's back at the curb the next time you're home.
- **On foot**: walk, run, sprint and jump; swim in the sea and the river.
- **Vehicles**: get into any car, bike or boat. If someone's driving, you drag them out, and a locked parked car means breaking the glass. There are 17 to drive:
  - Cars and vans: the Brisa, Norden Aria, Sunline Cab, Halvor Trek, Mesa Ranger, Orrin Cargo, Vanta GT, Castell Stallion and Furia RS.
  - Police and service vehicles: the SPD Cruiser, Interceptor and Tactical van, the ambulance and the armoured van.
  - The Rapido 600 bike, the Squall speedboat and the Gator airboat.
  - SPD Air One, the police helicopter, hunts you.

  Cars use a bicycle model with grip that changes with the surface (sand and grass are slippery), handbrake slides, damage, smoke, fire and explosions. A car in the sea stalls and sinks; bail out at speed and you tumble.
- **Traffic**: cars drive on the right in lanes, wait at stop lines, obey the 26-second light cycle at every avenue junction, keep the junction box clear and turn on their own. Pedestrians walk the pavements, stroll the beach, cower, flee or fight back. Three gangs hold their own turf: the Kings, the Gators and Sol.
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
  - Hospitalised: you wake at Solano General Hospital with a $300 bill.
  - Arrested: you're released at a police station with a $500 fee, and you lose your weapons.
- **Story**: twelve missions alternate between the leads:
  1. Sunburn
  2. Loose Change
  3. Hot Wheels
  4. Collections
  5. Low Tide
  6. Box Job
  7. Pier Pressure
  8. Casing the Joint
  9. Gear Up
  10. Armoured Car
  11. Double Cross
  12. The Big One

  Each starts at a yellow marker beside a door. They cover talking, driving, chases, losing the police, killing all, holding up a store, stopping a car and taking your partner along. A failed mission ends there, and its marker waits for you to try again.
- **Side jobs** (the Jobs tab):
  - Four street races, each in its own car: Strand Sprint, Downtown Loop, Glades Run and Causeway Dash.
  - Chop-shop exports.
  - Quik Stop hold-ups.
  - Twenty hidden sun tokens.
- **Shops**: walk into a door to open one.
  - Bullseye Arms, the gun stores in Calle Sol and Midtown.
  - Threadline, the clothes stores on the Strand and downtown: 11 outfits.
  - Spray Bay in Calle Sol and Midtown: a new colour and a clean slate.
  - Your safehouse: save, or sleep until 8 in the morning (or the evening).
- **The phone** (`Tab`, `M` or tap the minimap):
  - A map you can pan and zoom, with blips and a waypoint that the minimap's GPS line follows.
  - Jobs, Leads and Stats tabs.
  - Settings: quality, volume, music, sensitivity, invert, aim assist, touch layout, mph or km/h.
- **Radio**: four synthesised stations in any car. Neon 88 plays synthwave, Calle 104 Latin and reggaeton, Low Tide FM chill and lo-fi, and Bass Coast hip-hop and trap.
- **Time and weather**: a full day takes 24 real minutes. Sunrise, noon and dusk run to a neon night with lit windows, signs and street lamps. Summer storms bring rain.
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
| `world.ts` | Port Solano: the coastline, the river, the Keys island, piers and bridges. It also builds the road graph (avenues and streets, junctions with lights), buildings by district, props, POIs and parks. Spatial lookups: solids grid, road index, A* routes. Pure, seeded and cached per seed. |
| `data.ts` | Vehicles, weapons, leads, outfits, prices, the wanted table and the radio stations. |
| `state.ts` | The simulation state and its helpers. Plain data, so a save is a JSON copy. |
| `vehicles.ts` | Car physics, collisions, crash damage, explosions, doors and seats. |
| `traffic.ts` | Traffic lights, lane following, junction rules, AI drivers, spawning and despawning traffic and parked cars. |
| `peds.ts` | Movement on foot, swimming, pavements, the beach, crowds, gangs, fights. |
| `combat.ts` | Hitscan, melee and thrown weapons, lock-on, damage and armour, deaths, grenades. |
| `police.ts` | Crimes, witnesses, stars, the search, dispatch, police driving, arrests, the helicopter. |
| `missions.ts` | The step kit, twelve story missions, races, tokens and side jobs. |
| `sim.ts` | The fixed 60 Hz step that runs it all, getting in and out, hospital and arrest, shops, switching, save and load, the score. |
| `render/` | three.js. `city.ts` streams the city in 160 m chunks (fine detail only on the near ones, a low-detail skyline beyond) and lights lamps at night. `actors.ts` draws people and cars with the shared Code 3 kit. `fx.ts`, `camera.ts` and `view.ts` cover effects, the camera, the sky, the sea shader, shadows and post-processing. |
| `audio.ts` | Engine, siren, surf, effects and the radio sequencer (Web Audio, no files). |
| `game.ts` | The controller: input from keys, mouse and touch, the loop, the HUD state, shops, the phone, preferences and autosave. |
| `ui/` | The React HUD, touch controls, phone and shops (`hw-` test ids), the map and minimap canvases, and the styles. |
| `index.ts` | The `GameModule` for the platform. With `?hw` it exposes `window.__hw` and `window.__hwsim` for tests. |

The simulation never touches the DOM or three.js, so `heatwave.test.ts` runs it headless:
- world generation;
- traffic at the lights;
- shooting into a wanted level and a hospital respawn;
- the first mission;
- save and load.

`tests/e2e/heatwave.spec.ts` plays it in the browser on desktop and on a phone.
