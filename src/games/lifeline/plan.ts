/**
 * A ready-made starter hospital, laid out the way a player might: used by the tests and
 * as the menu's backdrop. Coordinates are cells; the street is along the bottom.
 */
import type { Sim } from "./sim";
import { idx } from "./world";

/** Lay out (and optionally instantly build) a small working hospital. */
export function starterHospital(s: Sim, opts: { build: boolean; full?: boolean }) {
  // Main block: x 4–33, z 14–40 (walls on the edge).
  s.foundation(4, 14, 33, 40, "lino");
  // Front doors on the south wall, by the street.
  s.door(idx(10, 40));
  s.door(idx(11, 40));
  // Inner walls: a corridor along z = 27 splits the front (public) from the back (clinical).
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    const cells: number[] = [];
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) cells.push(idx(x, z));
    s.walls(cells);
  };
  // Back rooms: consulting (5–11), pharmacy (13–18), ward (20–32) above z 26.
  line(5, 26, 32, 26);
  line(12, 15, 12, 25);
  line(19, 15, 19, 25);
  s.door(idx(8, 26));
  s.door(idx(15, 26));
  s.door(idx(25, 26));
  // Front: reception + waiting (open plan), toilets (28–32, 35–39) walled off.
  line(27, 34, 27, 39);
  line(28, 34, 32, 34);
  s.door(idx(27, 37));
  if (opts.full) {
    // Staff room behind the ward block, emergency and radiology wings to the east.
    s.foundation(34, 14, 48, 26, "tile");
    s.door(idx(33, 20));
    s.door(idx(34, 20));
    line(41, 15, 41, 25);
    s.door(idx(41, 22));
    s.foundation(34, 27, 48, 40, "lino");
    s.door(idx(33, 33));
    s.door(idx(34, 33));
    s.door(idx(40, 40));
  }
  // Rooms.
  s.paintRoom(5, 15, 11, 25, "gp");
  s.paintRoom(13, 15, 18, 25, "pharmacy");
  s.paintRoom(20, 15, 32, 25, "ward");
  s.paintRoom(5, 27, 15, 39, "reception");
  s.paintRoom(16, 27, 32, 33, "waiting");
  s.paintRoom(16, 34, 26, 39, "waiting");
  s.paintRoom(28, 35, 32, 39, "toilets");
  s.paintRoom(2, 41, 12, 42, "deliveries");
  if (opts.full) {
    s.paintRoom(35, 15, 40, 25, "staffRoom");
    s.paintRoom(42, 15, 47, 25, "radiology");
    s.paintRoom(35, 28, 47, 39, "emergency");
  }
  // Furniture.
  s.placeObject("receptionDesk", 7, 31, 0);
  s.placeObject("chair", 8, 30, 0);
  s.placeObject("plant", 5, 27, 0);
  for (const [x, z] of [
    [17, 29],
    [21, 29],
    [25, 29],
    [17, 36],
    [21, 36],
  ])
    s.placeObject("seats", x, z, 0);
  s.placeObject("tv", 29, 28, 0);
  s.placeObject("desk", 6, 17, 0);
  s.placeObject("chair", 6, 16, 0);
  s.placeObject("examBed", 8, 21, 0);
  s.placeObject("pharmacyCounter", 14, 20, 0);
  s.placeObject("medCabinet", 17, 16, 0);
  for (const x of [21, 24, 27, 30]) s.placeObject("bed", x, 16, 0);
  s.placeObject("monitor", 22, 16, 0);
  s.placeObject("toilet", 30, 38, 2);
  s.placeObject("sink", 29, 35, 0);
  s.placeObject("vending", 26, 33, 2);
  if (opts.full) {
    s.placeObject("sofa", 36, 16, 0);
    s.placeObject("coffee", 39, 16, 0);
    s.placeObject("xray", 44, 18, 0);
    s.placeObject("leadScreen", 43, 23, 0);
    s.placeObject("traumaBed", 38, 31, 0);
    s.placeObject("traumaBed", 42, 31, 0);
    s.placeObject("defib", 40, 30, 0);
    s.placeObject("generator", 52, 30, 0);
  }
  if (opts.build) s.instantBuild();
}
