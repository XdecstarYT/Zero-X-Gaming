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

## Playing

`game.ts` is the controller: tools (look, roads, zone, upzone, design, transit, civic, bulldoze),
touch and mouse input (one finger draws with the drawing tools, two fingers move, pinch and turn),
the clock (a month is 14 seconds at 1×), autosave, and the score (people plus twice the homes
built). `ui/` is the phone-first React interface in NextX liquid glass: the top bar, the dock, tool
options, the confirm sheet, toasts (applications get a Review card), and the panels: district
(zoning with the height picture, rules, copy a district), the designer, the agenda, a building,
the city (overview, budget, travel) and the menu.

`?xc` exposes `window.__xc` (the controller), `__xcGrow(years)` (a grown city) and `__xcPitch()`
(a developer's application) for the tests.
