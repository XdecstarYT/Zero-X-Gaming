import { COURSE, JOINT } from "./data";
import { commit, footingRect, newSite, roofGen, slabRect, wallRect, type Spec, type State } from "./model";

/**
 * A brick house built the way a player would build it, for the title screen and the NextX app's
 * backdrop: a slab, walls in stretcher bond laid in two lifts (with the windows set on the sill
 * course between), a front door, lintels over every opening, and a tiled gable roof.
 */
export function showcaseHouse(s: State = newSite("free"), stage = 1): State {
  const a = { x: -4.5, z: -3.375 };
  const b = { x: 4.5, z: 3.375 };
  commit(s, slabRect({ x: a.x - 0.225, z: a.z - 0.225 }, { x: b.x + 0.225, z: b.z + 0.225 }));
  const y0 = 0.15 + JOINT;
  const wall = { kind: "brick" as const, bond: "stretcher" as const, v: 0 };
  // Doors first, on the slab.
  commit(s, [
    { k: "door", x: -1.35 + 0.45, y: y0, z: a.z + 0.05625, r: 0, v: 1 },
    { k: "door", x: 2.25 + 0.45, y: y0, z: b.z - 0.05625, r: 2, v: 4, s: [0.89, 2.09, 0.1025] },
  ]);
  // Up to the sills.
  commit(s, wallRect(s, a, b, y0, { ...wall, courses: 12 }));
  if (stage < 0.4) return s;
  const sill = y0 + 12 * COURSE;
  const win: Spec[] = [
    { k: "window", x: -3.0, y: sill, z: a.z + 0.05625, r: 0, v: 0, s: [1.115, 1.19, 0.1025] },
    { k: "window", x: 1.8, y: sill, z: a.z + 0.05625, r: 0, v: 0, s: [1.79, 1.19, 0.1025] },
    { k: "window", x: -2.475, y: sill, z: b.z - 0.05625, r: 2, v: 0, s: [1.115, 1.19, 0.1025] },
    { k: "window", x: a.x + 0.05625, y: sill, z: 0, r: 1, v: 0, s: [1.115, 1.19, 0.1025] },
    { k: "window", x: b.x - 0.05625, y: sill, z: -0.45, r: 3, v: 0, s: [0.665, 1.19, 0.1025] },
  ];
  commit(s, win);
  // On up to the wall plate: lintels go in over the openings as the wall reaches their heads.
  commit(s, wallRect(s, a, b, y0, { ...wall, courses: 34, from: 12, lintels: true }));
  if (stage < 0.75) return s;
  const top = y0 + 34 * COURSE - JOINT;
  commit(s, roofGen(s, a, b, top, { style: "gable", pitch: 32, cover: "tile", v: 0, gables: true }), true);
  return s;
}

/** The footings a house like that would stand on (for the career's first steps). */
export function showcaseFootings(s: State) {
  return commit(s, footingRect({ x: -4.5, z: -3.375 }, { x: 4.5, z: 3.375 }));
}
