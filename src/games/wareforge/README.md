# WareForge

The third NextX title and a ZLink+ exclusive: a 3D warehouse, production and manufacturing strategy
game. Run a dock, racks and a production floor; accept orders and ship them on time.

## Playing

- **Sites**:
  - WH-01 Riverside Hub (easy distribution).
  - WH-04 Southfield Cross-Dock (many doors, busy customers).
  - WH-07 Northgate Works (a factory with a press and an assembly cell).
- **Orders**: customers offer shipments with a deadline. Accept one and a door is assigned:
  1. Forklifts pick the pallets onto the six-slot lane behind that door.
  2. A carrier's truck arrives, backs onto the door and is loaded.
  3. The truck drives away.

  Shipment tracking follows each order through Order Confirmed → Picked → Loading n/N → In Transit → Delivered. A late delivery pays 60% and costs reputation, and a cancelled order costs 20%.
- **Stock**: buy finished goods wholesale, or raw materials and parts. A supplier's truck brings them in, and forklifts unload it into free bays. If the racks are full, they unload onto the door's lane instead. Auto-replenish keeps four pallets of an item.
- **Building**:
  - Racks are 2×1 with two levels, or three with high-bay racking, and are picked from the side the arrow shows.
  - Floor blocks are 2×2.
  - Machines: a Stamping Press, a CNC Saw, an SMT Line and an Assembly Cell. Inputs feed in on the left column and outputs leave from the right.

  You can't build in the aisle or the dock area. You also can't build anything that would leave a bay or machine unreachable.
- **Machines**: they run recipes (steel → frame, plastic → shell, timber → panel, electronics → board, then bicycles, chairs, helmets, phones and tool kits). They wear with every cycle and can break down; repair or service them.
- **Money**:
  - Running costs: rent, $40/h a forklift and machine upkeep.
  - Detention of $3 a minute for a truck kept over an hour.
  - Fourteen upgrades and twelve goals with cash rewards.
- **Time**: 1× is two real minutes a game hour, with speeds up to 8×. A season is five days. The score is net worth gained ÷ 10, + 25 per on-time delivery, + 5 per finished pallet made. It is final when the season ends or the business goes bust (cash below −$25,000). Play carries on after the season.

## Code

| File | What |
| --- | --- |
| `data.ts` | Goods, machines and recipes, sites, carriers, suppliers, customers, upgrades, goals |
| `sim.ts` | The pure, seeded simulation (see below) |
| `game.ts` | Controller: state, clock and speed, selection, build tool, saving (`zx-wareforge-save`), score |
| `render/world.ts` | three.js world, kept in step with the sim each frame; picking |
| `render/models.ts` | Forklift, truck, machine, tree and pin models; canvas textures |
| `render/stage.ts` | Renderer, loop and input (pan, turn, pinch, wheel, tap) |
| `ui/App.tsx`, `ui/style.ts` | The liquid-glass interface (NextX `GlassDefs` with the `wf` prefix) |
| `index.ts` | The Zero X `GameModule` |

The simulation is plain JSON on a 44×34 tile grid:

| Tiles | Area |
| --- | --- |
| z 2–14 | Inside, buildable |
| z 15–16 | Main aisle |
| z 17–18 | Staging lanes |
| z 19 | Apron |
| z 20 | Dock wall |
| z 21–29 | Yard |
| z 30+ | Road |

- Doors sit every four tiles.
- Pallets live in slots, trucks, or on forks.
- Idle forklifts pick the most urgent job: load > unload > clear a machine > pick an order > feed a machine > put away.
- Forklifts route with A* (turns cost a little) round racks and machines.

`?wf` on the game URL exposes the controller as `window.__wf` for tests.
