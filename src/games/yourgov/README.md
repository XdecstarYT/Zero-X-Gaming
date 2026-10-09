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
- **Events** (`data.ts`, `holdEvent`): 38 of them in four kinds (campaigning, winning over voter
  groups, raising money, the party). Each can be held twice a week (the second time does 60%).
  Fundraisers can always be held, even with an empty bank: they pay for themselves, but donors
  tire (`donors`, `donorFactor`) if you ask every week. Lobbying works twice per party per stage.
- Saves are version 3 (`GameState.sc` carries the scenario); version 1 and 2 saves load as
  Avalon games. Anything a save lacks from the wider politics is filled in by `initPolitics`.

## The wider politics (`politics.ts`)

Everything here works on the same state and the same seeded stream as `sim.ts`, and is called
from it each week (`politicsWeek`, `settlePending` at the start of `endTurn`, `runPlan` once the
date moves on, `afterElection`, `lawChanged` when a bill becomes law).

- **The diary** (`schedule`, `runPlan`): book any event up to 16 weeks ahead, in any region; it's
  held and paid for when its week comes (called off if the party can't pay).
- **Voter groups** (`GROUPS`): young voters, retirees, working families, business owners, rural
  voters, urban professionals, religious voters and environmentalists, each a share of every
  county (more of some in cities, others in the country: `groupMix`). Your goodwill with each
  (events aimed at it, the laws you pass, crises and executive actions) adds to your party's pull
  where they live (`playerBonus`); it fades without attention, and courting one side of a divide
  (workers or business, faith or the young, green or rural) costs a little with the other.
- **Interest groups** speak for each voter group: friendly ones give money every week and
  endorse you two weeks before a national election.
- **The press** (four outlets): press conferences, interviews and good debates win coverage;
  backfires and ministers' scandals cost it. What counts is coverage better or worse than an
  outlet would usually give your politics (`pressLift`).
- **Factions**: your party's progressive wing, moderates and traditionalists, each with a share
  and a mood. They judge the laws you pass by their own politics, want their share of your
  party's ministers, react to election results, and like congresses. Their moods drive unity;
  eight weeks of low unity bring a **leadership challenge** (face the vote, call a congress
  first, or make concessions). Lose and the career ends (`ousted`).
- **TV debates** three weeks before each national election against the leading rival: three
  questions, three ways to answer each (the facts, attack, from the heart).
- **The cabinet** (`PORTFOLIOS`): eight posts filled from the governing parties' lawmakers,
  shared out by seats. Each minister has a skill; a good finance minister lifts growth and the
  budget, health happiness, and so on (`cabinetFx`, folded into the economy). As head of
  government you appoint and reshuffle; scandals bring resignations; empty posts get acting
  ministers after a few weeks.
- **Coalition deals**: each junior partner wants one law moved within a year; keep it and they're
  loyal, break it (or starve them of posts) and they walk out. As a junior partner you get a
  promise of your own, and can leave.
- **Crises** (18, every 9–19 weeks): floods, strikes, bank collapses, a pandemic, diplomatic rows.
  As head of government you decide; otherwise you back or attack the government's response.
- **Executive actions** (10, with cooldowns; courts may block some in a presidential system),
  **referendums** (once a year: the people vote on a change to any law, by where the parties'
  voters stand and the groups that care), and **foreign relations** with each country's real
  neighbours and partners (state visits, trade deals that add growth, public rebukes).
- AI parties change leader after a bad election.

## The campaign machine (`campaign.ts`)

Wired in the same way (`initCampaign`, `campaignWeek` after `politicsWeek`, `settleCampaign`,
`campaignAfterElection`; staff effects inside `holdEvent`; the budget plan inside the budget bill).

- **The polling centre** (the Parties panel): national trend, voting intention by voter group
  (crosstabs) and by region (`regionPolls`, one pass over the counties), leader ratings
  (favourable / unfavourable from charisma, unity, the press and the government's approval), the
  most important issues (from the economy, the laws in force and any crisis, with the party most
  trusted by the group that cares most), and a commissioned **seat projection** (`projectSeats`
  in sim.ts runs today's polls through the real electoral system, and the presidency, then
  restores the random stream so nothing else changes).
- **Campaign HQ**: six staff roles (campaign manager, pollster, press secretary, finance director,
  field director, speechwriter), 1–5 stars, paid weekly; new people every ten weeks; unpaid staff
  quit. The **manifesto**: up to four pledges in the 30 weeks before a lower-house or
  presidential election; the groups that want them warm to you, your factions judge them, and in
  government they become promises (missions) to keep within two years. **Position**: move the
  party a step on the compass every six months, within reach of where it started.
- **The budget**: as head of government, set seven areas (health, education, welfare, defence,
  infrastructure, climate, taxes) from a big cut to a big rise. Parties vote by ideology (the left
  likes spending and taxes, the right cuts and smaller deficits); once passed it moves happiness,
  growth, jobs, approval and the deficit for a year, and the groups who gain or lose react. Other
  governments write their own (`aiBudget`).
- **Question Time** every three weeks (a press briefing or an oversight hearing in presidential
  systems), as head of government or a leader in opposition; **party scandals** to handle
  (suspend, stand by, apologise or deny); an **election-night speech**; an exit poll as the count
  begins.
- **Achievements**: 28 career milestones, each adding to the score.

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

## Phones

The layout is built for phones first, in either orientation. Held sideways, the dock runs in two
columns down the left; held upright, it runs along the bottom and panels take the full width.
Every list scrolls by touch (panels, cards and the title screen centre with flexbox so their
height is capped by the screen). Regions can be picked from a dropdown as well as on the map,
and the week strip picks when an event happens; tapping the timeline opens it at that week.

## Layout

| File | What it does |
| --- | --- |
| `scenario.ts` | Scenarios, parties, systems; checking and share codes; Avalon |
| `countries.ts` | The twelve real countries |
| `names.ts` | Name pools for made-up politicians, by language |
| `data.ts` | Laws and their options, committees, events |
| `map.ts` | Generated and real maps |
| `sim.ts` | Game state and every rule |
| `campaign.ts` | The polling centre, campaign staff, the manifesto, the budget, Question Time, party scandals, moving the party, election-night speeches, achievements |
| `politics.ts` | Voter groups, interest groups, the press, factions, debates, the diary, the cabinet, coalition deals, crises, executive actions, referendums, foreign relations |
| `game.ts` | The controller: actions, settings, the scenario library, sound, saving, score |
| `geo/` | Real countries' map data (generated; see above) |
| `render/` | The 3D country, chamber, camera rig, terrain builder and its worker |
| `ui/App.tsx` | The Liquid Glass HUD: bars, dock, sheets, election night, coalition talks |
| `ui/Politics.tsx` | Events and the diary, voters and the press, the government, factions; crisis, debate and challenge cards |
| `ui/Campaign.tsx` | The polling centre's pages, campaign HQ, the budget, Question Time and scandal cards, achievements, election-night extras |
| `ui/kit.tsx` | The building blocks every panel uses |
| `ui/Title.tsx` | Picking a country and a party; your scenarios; share codes |
| `ui/ScenarioStudio.tsx` | Making a country: map, parties, system, economy and laws |
| `ui/LawStudio.tsx` | Drafting and editing your own laws |
| `ui/flags.ts` | Flags as SVGs |
| `ui/charts.tsx`, `ui/glass.tsx`, `ui/style.ts` | Charts, the glass lens and the stylesheet |
| `index.ts` | The `GameModule` that mounts it all |

Add `?yg` to the URL to reach the controller as `window.__yg` (used by the e2e tests).
