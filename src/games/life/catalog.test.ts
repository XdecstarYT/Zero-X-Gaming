import { describe, expect, it } from "vitest";
import { CATALOG, CATEGORIES } from "./catalog";
import { furnitureParts } from "./models";
import { addItem, categoryOf, cleanBuild, emptyBuild, FURNITURE, PLOT_D, PLOT_W, type FurnitureType } from "./world";

const ids = Object.keys(CATALOG) as FurnitureType[];
const all = Object.keys(FURNITURE) as FurnitureType[];

/** A plot floored edge to edge, so indoor pieces have something to stand on. */
function flooredPlot() {
  const b = emptyBuild();
  for (let x = 0; x < PLOT_W; x++) for (let z = 0; z < PLOT_D; z++) b.floors.push({ x, z, mat: "wood" });
  return b;
}

describe("the builder's catalogue", () => {
  it("adds 100 pieces in three categories, without replacing any of the originals", () => {
    expect(ids).toHaveLength(100);
    expect(all).toHaveLength(126);
    const per = Object.fromEntries(CATEGORIES.map((c) => [c, ids.filter((t) => categoryOf(t) === c).length]));
    expect(per).toEqual({ Furniture: 34, Decor: 33, Outdoor: 33 });
    // Every piece, old and new, sits in one of the three tabs.
    for (const t of all) expect(CATEGORIES).toContain(categoryOf(t));
    expect(new Set(all.map((t) => FURNITURE[t].name)).size).toBe(all.length);
  });

  it("every piece has a price, fits a plot and can be placed (outdoor ones on bare ground)", () => {
    for (const t of ids) {
      const f = FURNITURE[t];
      expect(f.price, t).toBeGreaterThan(0);
      expect(Math.max(f.w, f.d), t).toBeLessThan(Math.min(PLOT_W, PLOT_D));
      expect(f.h, t).toBeGreaterThan(0);
      const b = categoryOf(t) === "Outdoor" ? emptyBuild() : flooredPlot();
      const r = addItem(b, { type: t, x: PLOT_W / 2, z: PLOT_D / 2, rot: 0 });
      expect(r.ok, `${t}: ${r.ok ? "" : r.why}`).toBe(true);
    }
  });

  it("indoor furniture still needs a floor; flat pieces can go under others", () => {
    expect(addItem(emptyBuild(), { type: "kingBed", x: 10, z: 10, rot: 0 }).ok).toBe(false);
    expect(addItem(emptyBuild(), { type: "oakTree", x: 10, z: 10, rot: 0 }).ok).toBe(true);
    const b = emptyBuild();
    expect(addItem(b, { type: "deck", x: 10, z: 10, rot: 0 }).ok).toBe(true);
    expect(addItem(b, { type: "sunLounger", x: 10, z: 10, rot: 0 }).ok).toBe(true);
  });

  it("every piece builds a model, and its parts stay inside its footprint", () => {
    for (const t of ids) {
      const parts = furnitureParts(t);
      expect(parts.length, t).toBeGreaterThan(0);
      const f = FURNITURE[t];
      for (const p of parts) {
        p.geo.computeBoundingBox();
        const bb = p.geo.boundingBox!;
        // A little give for rims, leaves and handles.
        expect(Math.abs(bb.min.x), t).toBeLessThan(f.w / 2 + 0.35);
        expect(Math.abs(bb.max.x), t).toBeLessThan(f.w / 2 + 0.35);
        expect(Math.abs(bb.min.z), t).toBeLessThan(f.d / 2 + 0.35);
        expect(Math.abs(bb.max.z), t).toBeLessThan(f.d / 2 + 0.35);
        expect(bb.min.y, t).toBeGreaterThan(-0.1);
        expect(bb.max.y, t).toBeLessThan(f.h + 0.4);
      }
    }
  });

  it("a build from elsewhere loses unknown or broken pieces instead of crashing", () => {
    const raw = {
      walls: [{ x1: 0, z1: 0, x2: 4, z2: 0, color: "#fff", open: [] }, { x1: "a" }],
      floors: [{ x: 1, z: 1, mat: "wood" }],
      items: [
        { id: 1, type: "gazebo", x: 5, z: 5, rot: 0 },
        { id: 2, type: "spaceship", x: 5, z: 5, rot: 0 },
        { id: 3, type: "__proto__", x: 5, z: 5, rot: 0 },
        { id: 4, type: "sofa", x: "x", z: 5, rot: 0 },
      ],
    };
    const b = cleanBuild(raw)!;
    expect(b.walls).toHaveLength(1);
    expect(b.items.map((i) => i.type)).toEqual(["gazebo"]);
    expect(b.nextId).toBe(2);
    expect(cleanBuild(null)).toBeNull();
    expect(cleanBuild({ items: [] })).toBeNull();
  });
});
