# XCity

A city builder that takes zoning seriously, and the sixth NextX title (a ZLink+ exclusive that plays
in the NextX app). You've just been hired to plan a farming village by a river; you don't build the
city, you zone it, lay out its streets, decide what developers may build, and design the odd
building yourself.

## The model

- `geom.ts`: polylines (flat `x, z` arrays), segment tests, oriented rectangles, polygons, a spatial
  hash and a seeded random.
- `roads.ts`: the road network, nodes and edges along polylines, in three kinds (country lane, street,
  avenue). `addRoad` snaps the ends to junctions or roads within 10 m, splits every road it crosses,
  refuses roads that run along another too closely, knocks down the lots it runs over and lines the
  new road (and the roads it meets) with lots. Lots are 15 m of frontage by 32 m, placed wherever
  they fit clear of roads, the river, turning circles and each other. `refreshConn` marks the roads
  that reach the edge of the map; nothing grows on a road that doesn't.
- `world.ts`: districts are polygons with a use, a height band and rules; each lot takes the topmost
  district its centre is in. `newCity` builds the farming village: Valley Road and Mill Road
  crossing by the river, section lanes, a school, houses, shops, farmsteads, orchards and fields.
- `patterns.ts`: lays a neighbourhood's streets in a rectangle: a grid of long blocks, gentle curves,
  a winding spine with cul-de-sacs, or superblocks (avenues round 380 m blocks with dead-end
  streets in and a park at the heart). Roads are clipped to dry land; loose ends reach out to the
  roads just beyond them, and a stranded neighbourhood is linked to the nearest connected road.
- `design.ts`: what a plan becomes. Its form (house, townhouse, walk-up, mid-rise, high-rise, tower,
  shop, office, workshop, civic, farmstead) from use, storeys and width; its footprint and setback;
  homes and jobs; build cost (style, height, roof, bay windows, parking: surface spaces low down,
  garage spaces higher up); its value from rents (bigger homes cost less a metre; affordable homes
  rent for less) and floor rents for shops, offices and workshops; quality; and against the
  zoning, how many storeys over it is and the clout that costs.
- `sim.ts`, month by month: households the region wants (a growing pull plus the city's jobs),
  homes and jobs built, demand for homes, workplaces and shops, the rent index, who moves in,
  location values (central, near a tram stop, park, school or the river), how people travel and
  how congested the roads are, approval and clout, the budget (property tax, farm income and permit
  fees against road and tram upkeep, civic upkeep and city services) and milestones.
  **Developers** pick zoned plots on connected roads, join neighbouring plots where allowed, try a
  few heights within the zoning and build the most profitable if it pays (replacing something only
  if it adds plenty). When rents run high, now and then they ask for more than the zoning allows:
  an **application**, with homes added and lost, the tax it brings, the parking and what the
  planners think (they lean no on far-too-tall plans, lost homes and full parking by a tram; yes
  when homes are badly needed). Applications lapse after three months.
- `actions.ts`: everything the planner does: build, widen, narrow and bulldoze roads; bike lanes and
  tram lines (trams need an avenue); zone, edit, remove and upzone districts; lay out a pattern;
  check and commission a design (the city covers the gap between cost and sale value, or earns the
  difference); civic buildings across several plots; approve, deny or change the terms of an
  application (a quarter fewer storeys, affordable homes, less parking, ground-floor shops), which
  the developer accepts if it still pays.
- `showcase.ts`: a city some years on, for the NextX app's backdrop and the tests.

## The 3D city (`render/`)

- `view.ts`: the stage on the NextX look (sky dome, its light and environment map, haze), an orbit
  rig, sun shadows that follow the camera (snapped to shadow texels), a post chain with ambient
  occlusion and the colour grade on fast machines, adaptive resolution, picking.
- `ground.ts`: the whole map painted onto one texture (patchwork fields and orchards, lawns, parks,
  backyards with driveways, paving, car parks, building sites, the riverbanks) with fine grain up
  close; countryside as a frame round the map, hills on the horizon, and the river.
- `roadmesh.ts`: asphalt with junction pads and turning circles, footpaths trimmed where side roads
  join, yellow centre lines, lane lines, zebra crossings, green bike lanes, tram tracks with poles
  and wires, bridges with parapets and piers, street lights and street trees.
- `chunks.ts`: buildings in 200 m chunks. Walls go into one mesh drawn by Heatwave's facade shader
  (brick, render, sandstone, weatherboard, concrete grids or curtain glass, windows per pixel);
  roofs and props into another (gables, parapets, water tanks, green roofs, terraces, solar panels,
  awnings, barns and silos, columns, playgrounds, fountains). Building sites get a slab, the frame
  as far as it's got, scaffolding and a tower crane. Trees are instanced. A chunk rebuilds only
  when its buildings change, or a road or district over it does.
- `traffic.ts`: cars on the right, bikes in the bike lanes, people on the footpaths, and articulated
  trams running each tram line end to end, stopping at the stops; numbers follow the households and
  how they travel.
- `overlay.ts`: district tints and outlines, the road being drawn, the area being dragged with the
  streets its pattern would lay, the volume of a proposed building, the selection.

Realism: the ground shader varies grass and crops over hundreds of metres from a smooth noise
texture (`macroTexture`) as well as the fine grain up close; the river sits clear of the ground
(no z-fighting) as deep, sky-reflecting water with moving ripples; roofs are their own mesh with
a world-space roof shader (tile or shingle courses on slopes, membrane seams and gravel on flat
roofs) and flat roofs carry condensers, vents and lift overruns; trees are clumped crowns shaded
darker underneath and inside, broken into leaf clusters by a foliage shader; distance haze and a
calmer grade give aerial perspective.

## Politics (`poltypes.ts`, `politics.ts`, `ui/politics.tsx`)

A new world can be political (the setup's first step; switch it off for a sandbox where you plan
from day one). You lead a party and win the right to plan:

- **Setup**: the title screen has Continue, New world, the change log and settings (graphics,
  autosave, delete the save). Then politics settings (first past the post or preferential voting,
  2–4 year terms, 6, 10 or 14 campaign weeks, fewer or more seats, 2–5 rival parties, 51, 101 or 151 federal seats,
  difficulty), world settings (name, seed, a village or a town, pace, money) and your party: start
  from one of six presets or from scratch, and pick the name, short name, leader, colour, icon,
  where it stands on housing, transport, tax and the environment, and whether you stand in the
  town centre, the suburbs or the country (the seats themselves are drawn with the world).
- **Electorates** are drawn by the Electoral Commission from where people live (`drawSeats`): the
  voters (every finished home, and the people on the farmland) are cut in two across their longest
  spread at the point that leaves each side its share of the seats, and again in each half, so
  every seat has about as many voters, the town's seats are small and the farm seats big, and the
  first is the one round the town centre. The number of seats grows with the population
  (`seatsFor`: about 4 for a village, up to 16), and before each campaign the map is redrawn
  (`redistribute`) if more or fewer seats are due or a seat is more than a quarter off the average.
  A redrawn seat is held notionally by the party that held most of its voters, keeps the old seat's
  name, member and campaign if it's that seat's main successor, and your candidacy and local
  promises move with you. Rival parties are the big national ones plus whoever speaks for the
  groups living here (a farm town gets its country party). Each electorate has its share of seven
  voter groups (renters, owners, families, the young, retirees, business, farmers) worked out
  from what's built there. A party's support in one comes from how close it stands to each group,
  goodwill from promises, debates and protests, endorsements, campaign effort, incumbency, how the
  city government is doing and your trust, through a softmax.
- **The campaign** starts ten weeks out (or as set) and runs a week at a time: the clock stops and
  you spend action points on doorknocking, rallies, ads and fundraising in any electorate, make up
  to six promises, lobby groups until they endorse you, and answer the televised debate three weeks
  out. AI parties campaign too. Election day counts every seat (preferences transfer to the
  closest party); election night declares them one by one. A hung council goes to the government
  if it's tied for most seats, else to the tied party with the most votes.
- **After it**: if your party governs, you plan the city with every tool until the next election
  (and promises are judged against what you did). If you lose, another party governs: the AI
  decides applications, moves tax, lays out homes, upzones, builds trams, bike lanes and parks, each
  logged, and from opposition you can protest (and maybe stop a building still going up), lobby
  City Hall and keep campaigning. The next campaign comes round each term.
- **Federal parliament**: winning your own seat sends you to it. It sits every three months, with
  government bills to vote on (a housing accord paying cities per new home, a transit fund halving
  tram costs, parking reform, a rates cap, a green belt, first home grants), a question to ask at
  Question Time and a bill of your own to bring in. Laws in force change the city's sim.
- **Your career** (`career`, the Party tab): you start as a candidate in a party led by someone
  else (or as its leader, if you choose). Reputation (0–100) rises with winning your seat and the
  city, kept promises, debates, Question Time and bills that pass, and falls with defeats, broken
  promises and crossing the floor; the leader's favour rises with loyalty. With a seat and 35
  reputation you can ask for a portfolio (Housing, Transport, Treasury, Environment; shadow ones
  in opposition), granted on reputation and favour, and the party then backs your portfolio's
  bills. With 50 you can challenge the leader (sound out colleagues first): the party's MPs vote on
  your reputation against the leader's standing; lose and you're benched for a year. A beaten
  leader may quit, opening a ballot you can stand in (40 reputation). As leader the party votes as
  you do and your reputation moves its national vote; win the most federal seats and you're Prime
  Minister and set the agenda (two bills a sitting, nothing imposed). A leader who loses their seat
  stands down, and one whose reputation collapses after a defeat can be rolled.
- The map tints each electorate by who holds it (or leads the polls in a campaign) with your seat
  outlined in gold; the politics panel has campaign, promises, groups, opposition, parliament and
  polls tabs.

## Playing

`game.ts` is the controller: tools (look, roads, zone, upzone, design, transit, civic, bulldoze),
touch and mouse input (one finger draws with the drawing tools, two fingers move, pinch and turn),
the clock (a month is 14 seconds at 1×), autosave, and the score (people plus twice the homes
built). `ui/` is the phone-first React interface in NextX liquid glass: the top bar, the dock, tool
options, the confirm sheet, toasts (applications get a Review card), and the panels: district
(zoning with the height picture, rules, copy a district), the designer, the agenda, a building,
the city (overview, budget, travel) and the menu.

`?xc` exposes `window.__xc` (the controller), `__xcGrow(years)` (a grown city), `__xcSkip(months)` and `__xcPitch()`
(a developer's application) for the tests.
