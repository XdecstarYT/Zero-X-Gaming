# Lifeline

A 3D hospital management sim at `/games/lifeline`, open to everyone. Score = lives saved
(patients treated), banked from the Reports panel.

## How it plays

- **Build.** Lay a foundation (a floor with walls round the edge), add walls and doors,
  re-floor, paint rooms, place objects. Everything is a job: the delivery truck brings a
  crate of materials per order (to a painted **Deliveries** zone, or the kerb), and
  **workmen** carry each crate to its site and build it. Floors need no crate.
- **Rooms** work when they have enough floor, the objects they need, walls and a door
  where required, and power for required equipment (`ROOMS` in `data.ts`). Click a room to
  see what's missing.
- **Staff** pick a room that needs their role, walk to their station (a chair, a machine,
  a bedside) and are on duty there. Tired staff rest in a staff room. Janitors clean the
  dirtiest floor nearby. Administrators need an office each and unlock things: the
  director opens more grants, the chief of medicine unlocks theatres and surgeons, the
  accountant loans and cheaper wages, the head of facilities faster work.
- **Patients** walk in once there's a working reception (ambulances once there's an
  emergency room), check in, wait (seated if they can), and go through their condition's
  steps (`CONDITIONS`): consulting room, radiology, pharmacy, ward, theatre, emergency.
  Health falls while they wait; hunger and the toilet pull them away; dirty floors infect
  them. They pay on discharge, give up after a long wait, or die.
- **Running it:** hourly wages, hygiene, power, reputation (cure rate, hygiene, waiting
  times), grants for milestones, and events (flu season, bus crash, inspection, donation,
  heatwave, outbreaks).

## Mega update

- **Research.** A research lab (enclosed, a lab bench; microscopes speed it up) staffed by
  a doctor puts points into a project each hour (`RESEARCH` in `data.ts`): rapid
  diagnostics, ergonomics, antibiotics, telehealth, surgical robotics, and the projects that
  unlock departments.
- **Departments.** Intensive care, maternity (midwives), psychiatry (psychiatrists), an MRI
  suite, the research lab and a helipad, with 13 new objects and 8 new conditions. Rooms
  and roles locked behind research say so (`ROOMS[...].research`, `ROLES[...].research`).
- **Air ambulances.** A helipad zone plus an emergency room brings helicopters with major
  trauma cases (`Vehicle` kind `helicopter`, flown in `flyHelicopter`).
- **Wear and repairs.** Powered objects wear with each patient; at 75% a repair job ($250)
  goes to the workmen; at 100% the machine is broken and its room stops until it's fixed.
- **Experience.** Staff gain XP per patient, job or clean; `levelOf` gives level 1–5, each
  level 10% faster.
- **Campaign.** Five `SCENARIOS` with a metric, a time limit and bronze/silver/gold goals;
  best medals are kept on the device (`zx-lifeline-medals`).
- **Weekly awards**, new grants (discovery, newborns, airlift), baby-boom and power-surge
  events, and a follow camera.

## Quick rooms and the emergency department

- **Quick rooms** (`quick.ts`). There are 24 ready-made rooms, from a full emergency department to a janitor's closet.
  - Pick one, turn it with R, and click. `Sim.placeQuickRoom` orders the foundation, inner walls, doors, zones and furniture as ordinary jobs.
  - `quickPlan` checks the space and gives the cost. Outer walls may share walls that are already there; the inside must be clear. Locked rooms say why.
  - Layouts are written facing south and turned with `layoutQuick`.
- **Triage.** A triage room has a triage desk and a chair, and a nurse sits behind the desk.
  - Ambulance and helicopter cases see the triage nurse first (the `triage` step).
  - Triaged patients lose health 40% more slowly while waiting.
  - The emergency room takes the sickest patient first.
- **Ambulance bay.** An outdoor zone. Ambulances stop there, and patients arrive at the bay a little steadier.
- **Incoming.** Ambulances and helicopters are radioed in (`Sim.incoming`) with their condition and arrival time before they set off. The HUD lists them.
- **Emergencies** (`Sim.emergency`, one at a time, rolled hourly from day 2, or `triggerEmergency`):
  - **Code Blue.** A patient's heart stops. The nearest doctor or nurse runs to them within `CODE_BLUE_MINUTES`; a defibrillator anywhere in the hospital raises the odds.
  - **Major incident.** Five to eight radioed casualties. Each one saved pays $1,500, plus $10,000 if nobody is lost.
  - **Fire.** It spreads within a room, closes the room and wrecks equipment. Workmen and janitors put it out, twice as fast with an extinguisher. Flames are drawn by `render/fx.ts`.
- New grants: Golden hour, First things first, and All hands.

`plan.ts` has `megaWing`, a ready-made wing with every new department (used by the tests
and the menu backdrop).

## Code

| File | What it does |
| --- | --- |
| `data.ts` | Every floor, object, room, role, condition, grant and event |
| `world.ts` | The grid (foundations, floors, walls, doors, rooms, dirt), objects, room detection and checks, A* pathfinding, save encoding |
| `sim.ts` | The rules: jobs and deliveries, staff and patient behaviour, money, reputation, grants, events, notices, saves (pure, unit-tested) |
| `quick.ts` | Quick-room layouts, turning, and cost estimates |
| `plan.ts` | A ready-made starter hospital (tests, the menu backdrop, the "small hospital" start) |
| `render/*` | three.js: camera and day/night (`engine`), floors/walls/doors/rooms/dirt (`buildingView`), object models (`objects`), people, crates and vehicles (`agents`) |
| `game.ts` | Controller: loop, input and build tools with previews, saves (localStorage), sound, score |
| `ui/*` | React HUD and panels |

Adding an object: add it to `ObjectId` and `OBJECTS` in `data.ts` and a builder to
`BUILDERS` in `render/objects.ts` (models face +z, centred on their footprint). Adding a
room: `RoomId` and `ROOMS`; if patients use it, a `Step`, `STEP_ROOM`, `STEP_MINUTES` and the
patient object in `PATIENT_OBJ` (`sim.ts`).

The database side is `supabase/migrations/20261025100000_lifeline.sql` (score caps).
