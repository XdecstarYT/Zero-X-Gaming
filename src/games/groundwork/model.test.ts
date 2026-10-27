import { describe, expect, it } from "vitest";
import { COURSE, JOBS, JOINT } from "./data";
import { bondShare, footingShare, inspect } from "./jobs";
import * as m from "./model";
import { showcaseHouse } from "./showcase";

const site = () => m.newSite("free");
const ground = (x: number, z: number): m.Hit => ({ x, y: 0, z, nx: 0, ny: 1, nz: 0, id: -1 });
const overlaps = (s: m.State) => {
  let n = 0;
  const solid = s.pieces.filter((p) => m.info(p).family !== "roof");
  for (const p of solid) for (const q of m.near(s, m.box(p))) if (q.id > p.id && m.info(q).family !== "roof" && m.intersects(m.box(p), m.box(q))) n++;
  return n;
};

describe("laying bricks", () => {
  it("lays a brick on the ground and the next on top, in a 10 mm mortar bed", () => {
    const s = site();
    const a = m.candidate(s, "brick", ground(0.3, 0.2), 0, 0)!;
    expect(m.commit(s, [a]).added.length).toBe(1);
    const p = s.pieces[0];
    // Snapped to the quarter-brick grid.
    expect(Math.abs((p.x - 0.1125) / 0.05625 - Math.round((p.x - 0.1125) / 0.05625))).toBeLessThan(1e-6);
    const top = m.candidate(s, "brick", { x: p.x, y: 0.065, z: p.z, nx: 0, ny: 1, nz: 0, id: p.id }, 0, 0)!;
    expect(top.y).toBeCloseTo(0.065 + JOINT, 6);
    expect(m.commit(s, [top]).added.length).toBe(1);
    // And one beside it, a joint away.
    const side = m.candidate(s, "brick", { x: p.x + 0.1075, y: 0.03, z: p.z, nx: 1, ny: 0, nz: 0, id: p.id }, 0, 0)!;
    expect(side.x - p.x).toBeCloseTo(0.225, 6);
    expect(m.commit(s, [side]).added.length).toBe(1);
  });

  it("won't lay a brick in mid-air, or through another", () => {
    const s = site();
    expect(m.commit(s, [{ k: "brick", x: 0.1125, y: 0.5, z: 0.05625, r: 0, v: 0 }]).why).toMatch(/Nothing under it/);
    m.commit(s, [{ k: "brick", x: 0.1125, y: 0, z: 0.05625, r: 0, v: 0 }]);
    expect(m.commit(s, [{ k: "brick", x: 0.2, y: 0, z: 0.05625, r: 0, v: 0 }]).why).toMatch(/in the way/);
  });

  it("needs a lintel to bear at both ends, and brings down what's above when you knock out the bottom", () => {
    const s = site();
    // Two piers with a gap between.
    m.commit(s, m.wallRun(s, { x: 0, z: 0 }, { x: 0.45, z: 0 }, 0, { kind: "brick", bond: "stretcher", courses: 4, v: 0 }));
    m.commit(s, m.wallRun(s, { x: 1.35, z: 0 }, { x: 1.8, z: 0 }, 0, { kind: "brick", bond: "stretcher", courses: 4, v: 0 }));
    const y = 4 * COURSE;
    const half = m.commit(s, [{ k: "lintel", x: 0.45 + 1.115 / 2 + 0.6, y, z: 0.05625, r: 0, v: 0, s: [1.115, 0.14, 0.1025] }]);
    expect(half.why).toMatch(/Each end/);
    const lin = m.commit(s, [{ k: "lintel", x: 0.9, y, z: 0.05625, r: 0, v: 0, s: [1.34, 0.14, 0.1025] }]);
    expect(lin.added.length).toBe(1);
    m.commit(s, m.wallRun(s, { x: 0, z: 0 }, { x: 1.8, z: 0 }, y + 2 * COURSE, { kind: "brick", bond: "stretcher", courses: 3, v: 0 }));
    const before = s.pieces.length;
    // Knock out the bottom of the left pier: it and everything it held comes down.
    const left = s.pieces.filter((p) => p.y < 0.01 && p.x < 0.5).map((p) => p.id);
    const r = m.remove(s, left);
    expect(r.fell).toBeGreaterThan(5);
    expect(s.pieces.length).toBeLessThan(before - left.length);
  });
});

describe("walls", () => {
  it("lays a stretcher-bond wall with bats at the ends and no straight joints", () => {
    const s = site();
    m.commit(s, m.footingRun({ x: -2.5, z: 0 }, { x: 2.5, z: 0 }));
    const y0 = 0.225 + JOINT;
    const r = m.commit(s, m.wallRun(s, { x: -2.25, z: 0 }, { x: 2.25, z: 0 }, y0, { kind: "brick", bond: "stretcher", courses: 12, v: 2 }));
    expect(r.skipped).toBe(0);
    expect(s.pieces.filter((p) => p.k === "bat").length).toBe(12);
    expect(bondShare(s, s.pieces)).toBe(1);
    expect(footingShare(s, s.pieces)).toBe(1);
    expect(overlaps(s)).toBe(0);
    const rep = inspect(s, JOBS[0]);
    expect(rep.checks[0].ok).toBe(true);
  });

  it("lays English and Flemish bond a brick thick, with queen closers, and stack bond shows up as straight joints", () => {
    for (const bond of ["english", "flemish"] as const) {
      const s = site();
      const r = m.commit(s, m.wallRun(s, { x: 0, z: 0 }, { x: 3.15, z: 0 }, 0, { kind: "brick", bond, courses: 8, v: 0 }));
      expect(r.skipped).toBe(0);
      expect(s.pieces.some((p) => p.k === "closer")).toBe(true);
      expect(s.pieces.some((p) => p.k === "brick" && p.r === 1)).toBe(true);
      expect(overlaps(s)).toBe(0);
      expect(bondShare(s, s.pieces)).toBeGreaterThan(0.9);
    }
    const st = site();
    m.commit(st, m.wallRun(st, { x: 0, z: 0 }, { x: 2.25, z: 0 }, 0, { kind: "brick", bond: "stack", courses: 6, v: 0 }));
    expect(bondShare(st, st.pieces)).toBeLessThan(0.1);
  });

  it("bonds the corners of a rectangle and cuts round the openings, with lintels over them", () => {
    const s = site();
    const a = { x: -2, z: -1.5 };
    const b = { x: 2.05, z: 1.5 };
    m.commit(s, m.footingRect(a, b));
    const y0 = 0.225 + JOINT;
    m.commit(s, m.wallRect(s, a, b, y0, { kind: "brick", bond: "stretcher", courses: 12, v: 0 }));
    const sill = y0 + 12 * COURSE;
    const w = m.commit(s, [{ k: "window", x: 0, y: sill, z: s.pieces.find((p) => p.k === "brick" && p.r === 0)!.z, r: 0, v: 0 }]);
    expect(w.added.length).toBe(1);
    m.commit(s, m.wallRect(s, a, b, y0, { kind: "brick", bond: "stretcher", courses: 34, from: 12, v: 0 }));
    expect(s.pieces.filter((p) => p.k === "lintel").length).toBe(1);
    expect(overlaps(s)).toBe(0);
    // Bricks carry on above the window.
    const win = s.pieces.find((p) => p.k === "window")!;
    expect(s.pieces.some((p) => p.k === "brick" && Math.abs(p.x - win.x) < 0.3 && p.y > win.y + 1.4)).toBe(true);
    expect(bondShare(s, s.pieces)).toBeGreaterThan(0.85);
  });

  it("cuts an opening into a finished wall without bringing it down", () => {
    const s = site();
    m.commit(s, m.wallRun(s, { x: -1.8, z: 0 }, { x: 1.8, z: 0 }, 0, { kind: "brick", bond: "stretcher", courses: 30, v: 0 }));
    const n = s.pieces.length;
    const z = s.pieces[0].z;
    const r = m.cutOpening(s, { k: "window", x: 0.0, y: 10 * COURSE, z, r: 0, v: 0 });
    expect(r.added.some((p) => p.k === "window")).toBe(true);
    expect(r.added.some((p) => p.k === "lintel")).toBe(true);
    expect(s.pieces.length).toBeLessThan(n);
    expect(s.pieces.filter((p) => p.y > 1.8 && p.k === "brick").length).toBeGreaterThan(20);
    // And it all undoes in one go.
    m.undo(s);
    expect(s.pieces.length).toBe(n);
  });
});

describe("roofs and houses", () => {
  it("frames a gable roof, tile by tile, and bricks up the gables", () => {
    const s = site();
    const a = { x: -2.25, z: -1.8 };
    const b = { x: 2.25, z: 1.8 };
    m.commit(s, m.wallRect(s, a, b, 0, { kind: "brick", bond: "stretcher", courses: 30, v: 0 }));
    const top = 30 * COURSE - JOINT;
    const r = m.commit(s, m.roofGen(s, a, b, top, { style: "gable", pitch: 35, cover: "tile", v: 0 }), true);
    const tiles = r.added.filter((p) => p.k === "tile").length;
    expect(tiles).toBeGreaterThan(150);
    expect(r.added.filter((p) => p.k === "rafter").length).toBeGreaterThan(10);
    expect(r.added.filter((p) => p.k === "ridge").length).toBeGreaterThan(8);
    const gable = r.added.filter((p) => p.k === "brick" || p.k === "bat" || p.k === "closer");
    expect(gable.length).toBeGreaterThan(30);
    expect(Math.max(...gable.map((p) => m.box(p).y1))).toBeGreaterThan(top + 1);
    expect(overlaps(s)).toBe(0);
  });

  it("builds the showcase house, and the inspector passes it as a bungalow", () => {
    const s = showcaseHouse();
    expect(s.pieces.filter((p) => p.k === "brick").length).toBeGreaterThan(3500);
    expect(s.pieces.filter((p) => p.k === "window").length).toBe(5);
    expect(s.pieces.filter((p) => p.k === "lintel").length).toBe(7);
    expect(overlaps(s)).toBe(0);
    const rep = inspect(s, JOBS.find((j) => j.id === "bungalow")!);
    const failed = rep.checks.slice(0, -2).filter((c) => !c.ok);
    expect(failed).toEqual([]);
    expect(rep.passed).toBe(true);
  });
});

describe("the site", () => {
  it("undoes, redoes, and saves and loads", () => {
    const s = site();
    m.commit(s, m.wallRun(s, { x: 0, z: 0 }, { x: 2.25, z: 0 }, 0, { kind: "brick", bond: "stretcher", courses: 5, v: 3 }));
    const n = s.pieces.length;
    m.undo(s);
    expect(s.pieces.length).toBe(0);
    m.redo(s);
    expect(s.pieces.length).toBe(n);
    const back = m.load(m.save(s))!;
    expect(back.pieces.length).toBe(n);
    expect(back.pieces[3].v).toBe(3);
    expect(m.box(back.pieces[7]).y0).toBeCloseTo(m.box(s.pieces[7]).y0, 4);
  });

  it("charges for materials in a career, and won't lay what you can't pay for", () => {
    const s = m.newSite("career", "garden-wall", 20);
    const r = m.commit(s, m.wallRun(s, { x: 0, z: 0 }, { x: 4.5, z: 0 }, 0, { kind: "brick", bond: "stretcher", courses: 4, v: 0 }));
    expect(r.why).toBe("Out of money");
    expect(s.money).toBeGreaterThanOrEqual(0);
    expect(s.money).toBeLessThan(2);
    expect(s.minutes).toBeGreaterThan(10);
  });
});
