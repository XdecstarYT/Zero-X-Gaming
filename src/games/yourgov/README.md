# YourGov

A turn-based political strategy game at `/games/yourgov`, a ZLink+ exclusive. You lead one of
six parties in the Federation of Avalon for a twenty-year career. Score = laws passed, seats
won, promises kept and missions completed, banked when you retire or the career ends.

## How it plays

- **The country** (`map.ts`). A seeded island of about 950 counties ("sections") in 16 states,
  each with population, urban share and a regional lean. `makeCountry` builds a label raster
  (480 × 320) that the map view upscales and outlines.
- **Parties** (`data.ts` `PARTIES`). Six parties placed on an economic/social compass. Each
  has funds, members, unity, a national swing and relations with the others.
- **A turn is a week.** End it with the hourglass (or Enter). Each week the AI parties act,
  the economy moves with the laws in force, bills come to a vote, news and random events
  happen and missions are checked (`sim.ts` `endTurn`).
- **Bills** go committee → House → Senate → President → law (`proposeBill`, `advanceBill`).
  Members vote by how far the bill moves the law toward their party's position, party
  relations, unity and a little chance (`partyStance`, `tally`). Constitutional laws need two
  thirds. You vote where you sit, and can spend party money to lobby another party. The
  President's budget goes to the House in week 40.
- **Events** (`data.ts` `EVENTS`): rallies, speeches, interviews, polls, fundraisers and
  more, held in a state or nationally, cost money and lift your support (or backfire).
- **Elections** in week 45 every two years (a general election, with the President, every
  four). The count runs county by county on the map (sections go green while counting, then
  take the winner's colour), then the House (100 districts, or proportional if the law says
  so), the Senate (two per state), governors and the President change hands.
- **Missions** on the right: win elections, keep promises to change a law, grow the party,
  win seats and pass laws.

## Layout

| File | What it does |
| --- | --- |
| `data.ts` | Parties, laws and their options, committees, events, name pools |
| `map.ts` | The seeded country: land, counties, states, towns |
| `sim.ts` | Game state and every rule: polls, elections, bills, votes, events, missions, saves |
| `game.ts` | The controller between the rules and the UI: actions, saving, score |
| `ui/App.tsx` | The screen: top stats, side rail and panels, map or chamber, timeline |
| `ui/MapView.tsx` | The county map canvas (pan, zoom, select a state, the election count) |
| `ui/Chamber.tsx` | The chamber view, portraits and the seat chart |
| `index.ts` | The `GameModule` that mounts it all |

Add `?yg` to the URL to reach the controller as `window.__yg` (used by the e2e test).
