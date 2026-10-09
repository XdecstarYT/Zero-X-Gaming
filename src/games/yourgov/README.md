# YourGov

A turn-based political strategy game at `/games/yourgov`, a ZLink+ exclusive. You lead one of
six parties in the Federation of Avalon for a twenty-year career. Score = laws passed, seats
won, promises kept and missions completed, banked when you retire or the career ends.

## How it plays

- **The country** (`map.ts`). A seeded country of about 950 counties ("sections") in 16 states,
  each with population, urban share and a regional lean. `makeCountry` builds a label raster
  (480 × 320); `landField` is the continuous coastline the 3D terrain uses.
- **Parties** (`data.ts` `PARTIES`). Six parties placed on an economic/social compass. Each
  has funds, members, unity, a national swing and relations with the others.
- **A turn is a week.** End it with the button (or Enter). Each week the AI parties act,
  the economy moves with the laws in force, bills come to a vote, news and random events
  happen, missions are checked and a snapshot goes into the history (`sim.ts` `endTurn`).
- **Bills** go committee → House → Senate → President → law (`proposeBill`, `advanceBill`).
  Members vote by how far the bill moves the law toward their party's position, party
  relations, unity and a little chance (`partyStance`, `tally`). Constitutional laws need two
  thirds. You vote where you sit, and can spend party money to lobby another party. The
  President's budget goes to the House in week 40.
- **Laws of your own** (the law studio). Draft a law (`draftLaw`): a name, a category and
  committee, whether it's constitutional, and 2–5 options, each with a place on the compass
  and its yearly effect on happiness, growth, the budget and unemployment (bounded by
  `FX_LIMITS`; text is cleaned in `checkDraft`). The option in force today is chosen too. It
  then works exactly like a built-in law: bills on it go through the legislature, the AI
  parties propose changes to it, promises can be made about it. You can edit it until it
  has been voted on (`editLaw`) and strike it from the books (`repealLaw`). Up to
  `CUSTOM_MAX` laws, kept in the save (`GameState.custom`); look laws up with `lawOf` /
  `allLaws`, never `LAW` directly.
- **Events** (`data.ts` `EVENTS`): rallies, speeches, interviews, polls, fundraisers and
  more, held in a state or nationally, cost money and lift your support (or backfire).
- **Elections** in week 45 every two years (a general election, with the President, every
  four). The count runs county by county on the map (counties go green as they report, then
  take the winner's colour), then the House (100 districts, or proportional if the law says
  so), the Senate (two per state), governors and the President change hands.
- **Missions**: win elections, keep promises to change a law, grow the party, win seats and
  pass laws.

## The 3D views

One WebGL renderer (`render/stage.ts`) drives two scenes and the input (drag to pan, wheel or
pinch to zoom, right-drag or two-finger twist to turn).

- **The country** (`render/world3d.ts`). The terrain (`render/terrain.ts`) is built in a web
  worker (`terrain.worker.ts`, cached per seed by `loadTerrain.ts`): a heightfield (plains,
  ridged mountain ranges with snow, lakes, a continental shelf) and a satellite-style surface
  texture (farmland surveyed county by county, forest, pasture, scrub, rock, beaches, cities
  with dense cores and leafy suburbs, rivers and highways). On top: a Preetham sky that also
  lights the scene through an environment map, a sun with shadows, a sea shader (depth tint,
  waves, sun glint, surf), drifting clouds with their shadows, and instanced buildings.
  The politics are a palette lookup in the terrain shader: a label texture says which county
  each pixel belongs to and a one-row palette says its colour (`ui/mapColors.ts`), so an
  election-count frame only rewrites that row. Borders are vector lines traced from the
  label image (`traceBorders`), draped on the hills: thin county lines, state borders as
  ribbons a constant width on screen, and a gold outline round the selected state.
- **The chamber** (`render/chamber3d.ts`). A round chamber with tiers of walnut desks,
  carpet, leather chairs, the Speaker's dais, flags, a dome with an oculus, the seal and two
  vote boards. Members are instanced figures in their party's tie; each desk has a lamp that
  lights green, red or white as the votes come in.
- If WebGL isn't available, the flat map (`ui/MapView.tsx`) and drawn chamber
  (`ui/Chamber.tsx`) stand in.

Graphics quality (auto, high, low), clouds, map colour strength and sound are in Settings
(`Prefs` in `game.ts`, saved as `zx-yourgov-prefs`).

## Layout

| File | What it does |
| --- | --- |
| `data.ts` | Parties, laws and their options, committees, events, name pools |
| `map.ts` | The seeded country: land, counties, states, towns |
| `sim.ts` | Game state and every rule: polls, elections, bills, votes, events, custom laws, history, saves |
| `game.ts` | The controller between the rules and the UI: actions, settings, sound, saving, score |
| `audio.ts` | Synthesised sound effects (WebAudio) |
| `render/` | The 3D country, chamber, camera rig, terrain builder and its worker |
| `ui/App.tsx` | The Liquid Glass HUD: top bar, dock, sheets, missions, timeline, election night, title |
| `ui/LawStudio.tsx` | Drafting and editing your own laws |
| `ui/charts.tsx` | Poll and economy charts, the seat chart |
| `ui/glass.tsx`, `ui/style.ts` | The glass lens filters, pointer sheen and the stylesheet |
| `index.ts` | The `GameModule` that mounts it all |

Add `?yg` to the URL to reach the controller as `window.__yg` (used by the e2e test).
