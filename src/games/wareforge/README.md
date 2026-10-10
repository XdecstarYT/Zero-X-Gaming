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

## The super mega update

| Area | What's new |
| --- | --- |
| Map | The grid is 80 tiles wide. After the first expansion (to bay 42), the **Mega hall** runs to bay 78 with room for 18 doors. |
| Rail | A siding behind the building with two rail doors. Trains bring 16 pallets at 10% off and $60 freight, and forklifts unload them through the back wall. |
| Sites | WH-09 Harbor Gate (rail, port scenery) and WH-12 Summit Mega DC (Mega hall, rail, a full production line). |
| Forklifts | Batteries drain per tile and per lift. Below 22% a forklift drives to a **charging bay** (2×1, two points). Fast chargers double the charge rate. |
| Production | Copper wire → motor (Motor Winder) and battery cells → battery pack (Cell Pack Line). The Robot Cell (three inputs) makes e-bikes, camera drones and laptops. |
| Market | Every item's price drifts each day (×0.75–1.35) and drives both buying and order values. |
| Contracts | A customer offers N shipments of one item every few hours at 10% over list, with a bonus if all are on time. Far-future shipments don't hold a door. |
| Events | Storm (trucks +1 h), shopping rush (2× offers, +10%), supplier strike (2× lead time, +15%), power cut (machines stop), heatwave (batteries drain faster), tech boom (high-tech goods +20%). |
| Upgrades | 13 new: Mega hall, rail siding, fast chargers, AGV fleet, solar roof, warehouse system, robotics, quality lab, insurance, driver training, cross-docking, brand campaign, premium customers (high-tech orders). |
| Goals | 12 new. |
| Look | A day and night cycle (sun path, dusk colours, moonlight) with lamps and window glow, floodlights and bloom on high quality. Also: roof trusses with high-bay lights, a walkway and bollards, shrink-wrapped goods, blue forklift safety spots, workers walking the floor, an office, a car park, a gatehouse with a barrier, street lamps, freight trains, and themed surroundings (river, fields, old works, harbor with cranes and a ship, hills). |

Older saves load: the new fields get defaults.

## Code

| File | What |
| --- | --- |
| `data.ts` | Goods, machines and recipes, sites, carriers, suppliers, customers, upgrades, goals |
| `sim.ts` | The pure, seeded simulation (see below) |
| `game.ts` | Controller: state, clock and speed, selection, build tool, saving (`zx-wareforge-save`), score |
| `render/world.ts` | three.js world, kept in step with the sim each frame; picking |
| `render/models.ts` | Forklift, truck, train, machine, charger, worker, car, office, gatehouse, lamp, crane, tree and pin models; canvas textures |
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

The game plays in the NextX app at `/nextx/play/wareforge` (`/games/wareforge` redirects there). `?wf` on the URL exposes the controller as `window.__wf` for tests.
