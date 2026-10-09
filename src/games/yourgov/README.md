# YourGov

A turn-based political strategy game at `/games/yourgov`, a ZLink+ exclusive. You lead a party
for a twenty-year career in the made-up Federation of Avalon, one of twelve real countries, or
a country of your own. Score = laws passed, seats won, elections won, promises kept and
missions completed, banked when you retire or the career ends.

## Scenarios

Everything about the country you play is a **scenario** (`scenario.ts`): its map, its parties,
its political system, its economy and the laws in force. Three kinds:

- **Avalon** (`avalon(seed)`): a generated continent of sixteen states, six made-up parties and
  a presidential system, new every game.
- **Twelve real countries** (`countries.ts`): the US, UK, Canada, Australia, Germany, France,
  Spain, Italy, Japan, India, Brazil and Mexico, as they stood going into 2026, approximately:
  their parties (national vote shares from their last national elections, shares region by
  region where they differ, regional parties that only stand in some regions, alliances that
  share district candidates, parties that refuse to govern together), how each house is
  elected and how many seats it has, the real make-up of the houses and the regional
  governments today, the head of government, the election calendar, the titles, the economy
  and some of the laws in force. Every politician in the game is made up (`names.ts` has name
  pools for each language); no real person appears.
- **Your own**, made in the **scenario studio** (`ui/ScenarioStudio.tsx`): the map (generated:
  continent, island, peninsula, twin islands or archipelago, with regions, counties, mountains,
  lakes and cities as knobs and the regions named as you like; or any real country's map), the
  parties (name, colour, place on the compass, starting share, regional parties, refusals,
  alliances, crossbenchers), the system (below), the economy and the starting laws. Kept in
  `localStorage` (`zx-yourgov-scenarios`), checked by `checkScenario` like anything a player
  types, and shared as a code (`shareCode` / `readCode`: `YG1.` + base64 of the JSON).

## Political systems

`SystemDef` in `scenario.ts`:

- **Executive**: presidential (the President signs or vetoes; both houses can override with
  `override`, e.g. two thirds), parliamentary (the government needs the lower house: after an
  election, coalitions form, the player is asked when it's theirs to decide, `Talks`; losing a
  budget or a motion of no confidence brings it down and a snap election follows, unless the
  last election was under a year ago; a head of government can call an early election), or
  semi-presidential (an elected President and a Prime Minister from the Assembly: cohabitation
  happens).
- **Lower house**: first past the post (with tactical voting for the front two), two-round
  (the top two meet in a run-off; refusals steer the transfers, so a "republican front" forms),
  preferential (instant run-off), parallel (district plus list seats), mixed-member
  proportional (seats follow the party vote, with a threshold) or party lists by region. Seats
  are shared out by population with fixed counts where a country has them (Canada's PEI,
  India's states, Brazil's 8–70, no House vote for DC). The election-system law can change it.
- **Upper house**: none, elected region by region (plurality, proportional, or winner and
  runner-up; in halves or thirds), indirectly chosen (follows the vote slowly), a council of
  the regions' governments (the Bundesrat follows each Land's election), or appointed (the
  Lords, Canada's Senate; vacancies filled each year). Equal, or weak (the lower house can
  insist; Japan's needs two thirds).
- **President**: term, run-off, and an electoral college (each region's seats in both houses;
  three for a region with none).
- **Regions** elect their own governments on staggered calendars; titles per country ("First
  Minister", "Minister-President", "Chief Minister"…).

## How it plays (`sim.ts`)

- **Voters**: every county leans somewhere on the political compass (cities left and liberal,
  the countryside right and conservative). `calibrate` fits a per-region, per-party offset so
  the opening polls match the scenario: each party's national share, and its shares in the
  regions the scenario gives figures for. Campaigns, members, scandals, missions and the
  government's approval (relative to where it started) move it from there; governing wears a
  party down a little each week.
- **A turn is a week** (`endTurn`): bills come to a vote, the AI parties campaign and write
  bills, the economy moves with changes to the laws (scaled to the country's size), money and
  members, random events, regional elections, and national elections on the calendar.
- **Bills** go committee → lower house → upper house → President (or assent). A weak upper
  house sends a bill back; a veto goes to both houses. Constitutional laws need two thirds.
- **Laws of your own** (the law studio, `draftLaw`): a name, a category, 2–5 options with a
  place on the compass and effects. They work like any built-in law.
- **Elections** count county by county on the map; then the seats change hands seat by seat
  (`electLower`, `electUpper`, `electPresident`), the government forms, and missions resolve.
- Saves are version 3 (`GameState.sc` carries the scenario); version 1 and 2 saves load as
  Avalon games.

## Maps (`map.ts`)

`MapSpec` is a generated map (`GenMap`) or a real one (`RealMap`). Real countries' outlines,
cities and elevation come from `geo/<code>.json`, built by `scripts/yourgov/build-geo.mjs` from
public-domain [Natural Earth](https://www.naturalearthdata.com/) data (admin-1 regions with
lakes cut out, admin-0 countries, populated places) and the Mapzen/Tilezen terrain tiles on AWS
Open Data (built from SRTM, GMTED2010, ETOPO1 and others): projected into a 480 × 320 map
(Albers or equirectangular, insets for Alaska, Hawaii, the Canaries and Okinawa), simplified,
with real elevation on a 240 × 160 grid. `buildReal` rasterises the regions, gives each region
enough counties for its districts, places them densest round the real cities, spreads each
region's real population over them, and keeps a signed distance to the coast and the elevation
for the terrain. Files load on demand (`prepareMap`).

## The 3D views

One WebGL renderer (`render/stage.ts`) drives two scenes and the input (drag to pan, wheel or
pinch to zoom, right-drag or two-finger twist to turn).

- **The country** (`render/world3d.ts`, terrain from `render/terrain.ts` in a web worker): a
  heightfield (generated hills and ranges, or the real elevation squeezed and given ridges) and
  a satellite-style surface (farmland county by county, forest, rock, snow, beaches, cities,
  rivers and highways), neighbouring countries greyed back, a sky, a sea shader, clouds and
  instanced buildings. The politics are a palette lookup (up to 2048 counties); borders are
  vector lines. Region and city labels make way for each other and for bigger ones.
- **The chamber** (`render/chamber3d.ts`): any size of house (rows added and figures scaled),
  as a horseshoe or Westminster benches (government on the Speaker's right, opposition facing,
  crossbenches at the end, the table and the mace), with the country's seal, flags and the
  names of its houses on the vote boards.
- If WebGL isn't available, the flat map (`ui/MapView.tsx`) and drawn chamber stand in.

## Layout

| File | What it does |
| --- | --- |
| `scenario.ts` | Scenarios, parties, systems; checking and share codes; Avalon |
| `countries.ts` | The twelve real countries |
| `names.ts` | Name pools for made-up politicians, by language |
| `data.ts` | Laws and their options, committees, events |
| `map.ts` | Generated and real maps |
| `sim.ts` | Game state and every rule |
| `game.ts` | The controller: actions, settings, the scenario library, sound, saving, score |
| `geo/` | Real countries' map data (generated; see above) |
| `render/` | The 3D country, chamber, camera rig, terrain builder and its worker |
| `ui/App.tsx` | The Liquid Glass HUD: bars, dock, sheets, election night, coalition talks |
| `ui/Title.tsx` | Picking a country and a party; your scenarios; share codes |
| `ui/ScenarioStudio.tsx` | Making a country: map, parties, system, economy and laws |
| `ui/LawStudio.tsx` | Drafting and editing your own laws |
| `ui/flags.ts` | Flags as SVGs |
| `ui/charts.tsx`, `ui/glass.tsx`, `ui/style.ts` | Charts, the glass lens and the stylesheet |
| `index.ts` | The `GameModule` that mounts it all |

Add `?yg` to the URL to reach the controller as `window.__yg` (used by the e2e tests).
