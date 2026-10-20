# Sovereign

A real-time grand strategy game (a ZLink+ exclusive that plays in the NextX app) on the real world map: pick any nation and lead it. Every
other nation is played by the AI.

## The map

`scripts/sovereign/build-world.mjs` builds `public/sovereign/` from public-domain
[Natural Earth](https://www.naturalearthdata.com/) data (50m countries and lakes, 10m populated
places) and the Mapzen/Tilezen terrain tiles on AWS Open Data (built from SRTM, GMTED2010, ETOPO1
and others):

- Web Mercator, 4096 px round the world, 78°N to 56°S. Countries are grouped by sovereign state
  (Greenland goes with Denmark); city-states too small to draw (Singapore, Bahrain, Malta) get a
  little island at their capital.
- Cities: each nation's real capital and its biggest towns, picked per landmass by area and
  population and kept apart so they cover the land (1,242 in all, 181 nations).
- Territory: every land pixel belongs to the nearest city of its nation on the same landmass
  (true distance on the sphere). The borders between those territories are traced into shared
  edges between junctions and simplified, so neighbours never gap or overlap (`edges.bin`).
- `grid.bin`: a 1024-wide city grid for "whose land is this?" and for paths.
- `terrain.webp` (and a 2048-wide `terrain-s.webp` for phones): relief painted from the
  elevation, coloured by height and a rough climate (the dry belts are desert), the sea by depth.
- `height.png`: a 1024-wide greyscale height map (square root of the land's mean height, sea 0)
  that the 3D world is raised from.

```
node scripts/sovereign/build-world.mjs <natural-earth-geojson-dir> <tile-cache-dir>
```

## The game

- `data.ts`: resources and goods, buildings, units, ideologies, laws, formables, events, and the
  real-world starting facts (who mines what, who governs how, who has the bomb).
- `state.ts`: the state and a new game: wealth from real GDP (flattened so small nations can still
  play), development from GDP per head, deposits from the real producers, starting industry and
  power, real-ish forces and fleets, relations and the two starting alliances.
- `economy.ts`: a day of power, mines and factory chains (iron → steel → motor parts; copper and
  gold → electronics; phosphate → fertilizer), consumer goods, GDP and taxes, upkeep and fuel,
  growth, construction, unrest, riots and revolts, stability, and the world market.
- `military.ts`: movement, combat (land, sea, air; dug-in defenders, forts, air cover, fuel),
  sieges and captures, capitulation, missiles and warheads, training.
- `path.ts`: A* over the grid; land units may enter only land they're allowed on and ship
  themselves across the sea; fleets stay on the water and put in at friendly ports.
- `actions.ts`: everything a nation can do, for the player and the AI alike.
- `ai.ts`: the other nations' economies, armies, diplomacy, war choices, fighting and peace.
- `sim.ts`: the clock (the war four times a day), events, elections, relations drift, offers to
  the player, the score and saving.
- `render.ts`: the canvas map; `game.ts`: the controller and input; `ui/`: the React interface.

The score is your nation's worth: GDP a year ($B) × 10, plus 25 a city, plus 500 for a formable.

## The 3D world

`relief.ts` raises the map from `height.png` (a 640×351 grid on desktop, 360 on phones), paints the
terrain over it lit by the slope, lays the political layer on top (nations, city borders and the
selection, redrawn at most every 0.35 s), and adds a sea swell, cloud shadows and fog. The camera
tilts from straight down (zoomed out) toward the horizon (zoomed in). `render.ts` draws everything
else on a transparent canvas above it through `toScreen`, and picks through `toMap`, so the game
code never knows which view is on. The World panel switches to the flat map (remembered); browsers
without WebGL2 always get it.
