# Groundwork

A photoreal construction game, and the seventh NextX title (a ZLink+ exclusive that plays in the
NextX app). Build anything from scratch, brick by brick: pour the footings, lay every course, set
the doors and windows in, frame it and roof it, tile by tile, and get it past the inspector.

## The model

- `data.ts`: the catalogue. Every kind of piece at its real size in metres (a brick is
  215 × 65 × 102.5 mm and with its 10 mm joint takes a 225 × 75 × 112.5 mm module, and blocks,
  openings and lintels are sized to the same quarter-brick grid), how it's laid (in mortar, on the
  ground), what holds it up (`bed`, `span`, `touch`, `none`), its finishes, its cost (each, per metre
  or per square metre) and labour, the four bonds, and the career's six jobs with their briefs.
- `model.ts`: the site. Pieces (`x, z` centre, `y` bottom, quarter turns `r`, finish `v`, size `s`,
  pitch `p`, group `g`, the labour minute `t` it was laid) in a 1 m spatial index.
  - `check` refuses a piece off the plot, in the ground, too high, in something else's way or not
    held up; `commit` lays a list in order (each can hold up the next), charges for it and runs the
    clock; `remove` takes pieces out and lets anything that loses its support fall, refunding half.
    Undo and redo keep whole steps.
  - `candidate` turns a tap on the ground or on a face into the piece it would lay, snapped to the
    grid and bedded on what's under it.
  - `wallRun` and `wallRect` lay walls course by course: stretcher bond offset by half a brick (with
    bats to finish), English (header and stretcher courses, queen closers at the quoins) and Flemish
    (alternating along each course), stack bond, and rectangles with the corners bonded in turn. A
    wall cuts round the doors and windows already standing and puts a lintel over each.
  - `footingRun`/`footingRect`, `slabRect`, `frameRun` (plates, studs at 600 mm, noggins),
    `floorRect` (joists the short way, boards across) and `roofGen` (wall plates, rafters, battens,
    tiles hung course by course, ridge tiles, fascias and barge boards, or sheets on a skillion;
    `gableInfill` raises the brick gables).
  - `cutOpening` sets a window or door into finished brickwork, taking out what's in the way.
  - `save` and `load` keep a site in a compact form.
- `jobs.ts`: the inspector. `progress` measures the work in the job's pegged-out zone against each
  need in the brief (a wall this long and high, four walls round a space, footings, a slab, a count
  of windows or doors, a roof over it); `inspect` adds the workmanship (`footingShare`: the share of
  the bottom course standing on a footing or slab; `bondShare`: the share of perpends that don't
  line up with the one below) and rates the job in half stars for the brief, the budget and the
  time, and what the client pays.
- `showcase.ts`: the show home, built as a player would (a slab, two doors, walls to the sills, five
  windows, walls to the plate with lintels, a tiled gable roof), for the title screen and the NextX
  app's backdrop. It passes the bungalow brief.

## 2.0: Property & Contracts

- `model.ts` adds `paveRect` (pavers on a 100 mm grid in herringbone, basketweave, stretcher or
  stack, then cut halves wherever the edge leaves a gap), `fenceRun` (posts at most 2.4 m apart,
  two rails per bay, palings 10 mm apart), flat roofs, gutters, downpipes and solar panels in
  `roofGen` (portrait panels, or landscape on a short slope), `repaint` (refinish pieces as one
  undo step, charged at a tenth of their cost), `copySpecs` (pieces moved and turned in quarter
  turns), `knockOff` (on to the next morning) and a crew `speed` that divides the labour. Company
  sites (`contract`, `property`) pay for materials like a career job; fittings clip onto what's
  there without counting as in the way.
- `jobs.ts` adds needs for paving, fencing and decking, and `assess`: what a valuer measures in a
  zone (finished or not, floor area and storeys, roof cover, windows and doors, a garage,
  workmanship, paving, fencing, decking, solar, gutters).
- `company.ts`: the business. `newCompany`, the contracts board (`makeContract` from eleven
  templates gated by reputation, each with an estimate, a fair price, the client's ceiling,
  deadline, damages and a number of rivals), `winChance` and `tender` (rivals bid 85–130% of the
  fair price; a reputation of 100 makes yours count 20% cheaper), `contractJob` and `settle`
  (balance less damages and a 5% retention, a bonus for 4½ stars or more, reputation up or down),
  `abandon`; land (`makeListing` in six suburbs, `buy` with 4% duty), `valuation`, `survey`, `sell`
  (auction at 94–108% of value, 2% to the agent), `rentOut` and `endLease`; the crew (`makeWorker`,
  `hire`, `fire`, `crewSpeed`, `wages`); the bank (`loanLimit`, `borrow`, `repay`); and `advance`,
  which pays wages for days worked and every seventh day collects rent, charges interest, moves the
  market, releases retentions and restocks the boards.
- `game.ts` runs company sites in their own saves (`zx-groundwork-save-c<id>`, `-p<id>`, with the
  company in `zx-groundwork-save-co`): the site's cash is the company's, and every new working day
  on site pays the crew. `ui/hq.tsx` is the office (overview, contracts, property, crew, bank).

## The renderer (`render/`)

- `textures.ts`: canvas-painted PBR sets (colour, normal, roughness) for brick, mortar, concrete,
  timber, clay tile, metal, grass, soil, gravel and asphalt, and whole-wall brickwork for the
  neighbours.
- `materials.ts`: `localMaterial` patches a standard material so its textures are laid on in each
  piece's own metres (an instance's scale and position feed the lookup), so grain runs along every
  board and no two bricks show the same patch; `groundMaterial` lays a lawn worn to soil through a
  mask.
- `models.ts`: the shapes. Bricks and blocks with softened arrises, clay tiles with a roll and a
  nose, corrugated sheet, an I-beam, ridge tiles, and windows and doors built to each size (frame,
  mullions, transoms, sashes, double glazing, a sill; a panelled door with glazing, a handle and a
  letterbox, or a sectional garage door).
- `site.ts`: everything round the build: the lawn (worn bare where you work), instanced grass that
  sways and is cleared under pieces, a paling fence, the houses next door, the street, footpath and
  kerbs, trees (`trees.ts`: branching trunks and crowns of leaf cards that stir in the wind) and the
  site gear (pallets of bricks, a sand pile, a mixer, a barrow, a skip, a portaloo, a ute).
- `view.ts`: the scene on the NextX look (sky, image-based light, a sun whose shadow follows the
  camera, ambient occlusion and the grade on high). Pieces are instanced by shape, with a mortar
  bed under every piece laid in mortar that dries from dark to pale; new pieces drop into place;
  the ghost shows what a tap would lay (red if it won't go); string lines and pegs mark a job's zone.

## The game

- `game.ts`: the controller. Tools: look, lay, wall, footing, slab, frame, floor, roof, knock out and
  measure. The two-point tools take a start and an end and then wait for "Build it" with a quote.
  Gestures: drag to orbit, pinch or wheel to zoom, two fingers or right-drag to pan; keys for the
  rest. Free build saves to `zx-groundwork-save`, a career job to `zx-groundwork-save-job`, and
  stars, earnings and pieces laid to `zx-groundwork-prefs`.
- `ui/`: the phone-first interface in NextX liquid glass with a hi-vis orange accent: the title
  (continue, free build, career, change log, settings), the top bar (cash or spent, the day and
  time, pieces, undo and redo), the dock, a materials tray with finishes and sizes, options for
  each tool, the confirm sheet, and panels for the brief, the inspector's report, the jobs, a
  piece, the site's tally and help.
- `index.ts`: the game module. `?gw` exposes `window.__gw` (the controller) and `window.__gwHouse()`
  (puts the show home up) for tests.

The score is a thousand for every star earned on jobs plus one for every piece laid, plus the
company's growth in worth ÷ 100 (capped at 2,000,000). It goes in once a session, after 250 pieces or a job handed over. Members only.
