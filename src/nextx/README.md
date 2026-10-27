# NextX Engine

What every NextX title (WareForge, YourGov, Zero City, and what comes next) is built on, shared so each new
game starts where the last one finished. The NextX app (`/nextx`,
`src/components/nextx/NextXApp.tsx`) runs on it too.

- **Liquid Glass** (`glass.tsx`): surfaces that bend what's behind them at the rim like a thick
  lens (an SVG displacement filter used as a backdrop filter, Chromium), split the colours a touch
  at the edge, and catch a highlight that follows the pointer. `GlassDefs({ prefix })` puts the
  lens filters on the page (`#<prefix>-lg`, `#<prefix>-lg-bar`); `trackSheen(root, selector)` moves
  the highlights; `canRefract()` says whether the browser can bend. YourGov uses it with the `yg`
  prefix (`games/yourgov/ui/glass.tsx`), WareForge with `wf` in a light theme; the NextX app with `nx` (`.nx-glass`, `.nx-btn`,
  `.nx-capsule` in `globals.css`). Zero City's glass (`games/zero-city/ui/glass.tsx`) is the
  original it grew from.
- **Photoreal backdrops** (`backdrops.ts`, load lazily): the titles' own renderers running as a
  living background. `mountBackdrop("country", host)` is YourGov's country (terrain, a physical
  sky, a sea with surf, clouds) turning in the sun; `mountBackdrop("city", host)` is Zero City's
  island city (PBR buildings, roads, trees, image-based light, ACES grading) orbiting at golden
  hour; `mountBackdrop("warehouse", host)` is WareForge's yard at work (trucks backing onto the doors,
  forklifts on the aisles); `mountBackdrop("world", host)` is Sovereign's living world in 3D relief,
  its nations playing on as the camera drifts east; `mountBackdrop("xcity", host)` is a grown XCity
  by the river, the camera circling while it builds; `mountBackdrop("groundwork", host)` is
  Groundwork's show home on its plot, the camera walking slowly round it. Quality is picked for the device; a still camera for people who prefer
  less motion.
- **The look** (`look.ts`): one light for every title. `makeSky()` is a sky dome with a sun disc,
  a halo, drifting clouds and stars at night; `skyFor(sunHeight)` gives the sky's colours and the
  sun and ambient intensities from night through dusk and golden hour to full day;
  `SkyEnvironment` captures the sky into an environment map (recaptured as the light changes) so
  the scene is lit and reflected by its own sky; `GRADE` is the colour grade and vignette for the
  end of a post chain. Grown from Zero City's sky; WareForge runs on it.
- **Static batching** (`batch.ts`): `mergeStatic(root)` folds every mesh under a group that never
  moves into one mesh per material (and shadow setting), so buildings made of hundreds of parts
  draw in tens of calls. Anything marked `userData.dynamic` is left alone; shared materials stay
  shared, so their colour or glow can still change. With `{ palette: true }`, plain painted parts
  (a standard material with no textures, glow or transparency) go further: their colour,
  roughness and metalness are written into the vertices and they all draw with one shared
  `paletteMaterial()`, so a forklift of fifteen paints is one draw call. Build a model once,
  merge it and `clone()` it: copies share the merged geometry.
- **Camera rig** (`rig.ts`): an orbiting camera with damping (target, distance, yaw, pitch), pan
  under the finger, zoom toward a point. Built for YourGov's map, used by WareForge.
- **Powered by** (`PoweredBy.tsx`): the mark on each title's title screen, linking to the app.
- **World relief** (`games/sovereign/relief.ts`): a whole map raised from a height image and drawn
  with one shader (the painted terrain lit by the real slope, a sea swell that fades out before it
  can shimmer, a political layer from a canvas, cloud shadows, distance fog), a camera that tilts
  toward the horizon as you zoom, and `project`/`unproject` so a 2D overlay (labels, units, picks)
  sits on it. Built for Sovereign.
- **Planner's city** (`games/xcity/render/`): a road graph drawn as asphalt, footpaths cut back at
  junctions, markings, zebras, bike lanes, tram tracks and bridges; buildings in chunks that merge
  their walls into one facade mesh and rebuild only when they change; instanced trees, traffic and
  trams; a ground painted from the districts. Built for XCity.
- **Piece by piece** (`games/groundwork/render/`): thousands of bricks, tiles and timbers drawn as
  instances, each material's textures laid on in the piece's own metres by a shader patch (so grain
  runs along every board and no two bricks match), mortar beds whose colour dries as the day goes
  on, windows and doors built to each size, leaf-card trees lit as soft crowns, and instanced grass
  that sways and clears under whatever is built. Built for Groundwork.
