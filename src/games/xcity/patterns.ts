import type { Pattern, RoadKind } from "./data";
import { obbCorners, pointAt, polyLength, rng, smooth, type OBB, type Pts } from "./geom";

/**
 * Street patterns: lay out a neighbourhood's roads inside a rectangle. A grid of long blocks;
 * gentle curves; a winding spine with cul-de-sacs off it; or superblocks, avenues round big
 * blocks with dead-end streets in and a park at the heart. Roads are clipped to dry land.
 */

export interface PatternRoad {
  pts: Pts;
  kind: RoadKind;
}

export interface PatternOut {
  roads: PatternRoad[];
  /** Parks to zone (superblock hearts). */
  parks: Pts[];
}

/** A point in the rectangle's own frame (u along, v across) to the world. */
function toWorld(r: OBB, u: number, v: number): [number, number] {
  return [r.x + r.ux * u - r.uz * v, r.z + r.uz * u + r.ux * v];
}

function line(r: OBB, uv: number[]): Pts {
  const out: Pts = [];
  for (let i = 0; i < uv.length; i += 2) out.push(...toWorld(r, uv[i], uv[i + 1]));
  return out;
}

/** Keep only the parts of a polyline on land, each at least `min` long. */
export function clipToLand(pts: Pts, land: (x: number, z: number) => boolean, min = 30): Pts[] {
  const L = polyLength(pts);
  const out: Pts[] = [];
  let cur: Pts = [];
  const step = 4;
  const flush = () => {
    if (cur.length >= 4 && polyLength(cur) >= min) out.push(cur);
    cur = [];
  };
  // Resample, keeping the original vertices so curves stay smooth.
  for (let d = 0; d <= L + 0.01; d += step) {
    const p = pointAt(pts, Math.min(d, L));
    if (land(p.x, p.z)) {
      if (!cur.length || d % 8 < step || d + step > L) cur.push(p.x, p.z);
    } else flush();
  }
  flush();
  return out;
}

export function patternRoads(r: OBB, pattern: Pattern, opts: { avenue: boolean; seed: number; land: (x: number, z: number) => boolean }): PatternOut {
  const R = rng(opts.seed);
  const roads: PatternRoad[] = [];
  const parks: Pts[] = [];
  const add = (pts: Pts, kind: RoadKind) => {
    for (const p of clipToLand(pts, opts.land)) roads.push({ pts: p, kind });
  };
  const { hw, hd } = r;
  if (pattern === "grid") {
    // Long blocks: streets along every 100 m, across every 220 m.
    const nv = Math.max(1, Math.round((2 * hd) / 100));
    for (let i = 0; i <= nv; i++) {
      const v = -hd + (i * 2 * hd) / nv;
      add(line(r, [-hw, v, hw, v]), opts.avenue && i === Math.floor(nv / 2) && nv >= 4 ? "avenue" : "street");
    }
    const nu = Math.max(1, Math.round((2 * hw) / 220));
    for (let i = 0; i <= nu; i++) {
      const u = -hw + (i * 2 * hw) / nu;
      add(line(r, [u, -hd, u, hd]), "street");
    }
  } else if (pattern === "curvy") {
    const nv = Math.max(1, Math.round((2 * hd) / 115));
    const lam = 380 + R() * 160;
    const ph = R() * 6.28;
    for (let i = 0; i <= nv; i++) {
      const v0 = -hd + (i * 2 * hd) / nv;
      const ctrl: number[] = [];
      const edge = i === 0 || i === nv;
      for (let u = -hw; u <= hw + 0.1; u += 60) {
        const amp = edge ? 0 : 22 * Math.sin(((u + hw) / (2 * hw)) * Math.PI);
        ctrl.push(u, v0 + amp * Math.sin((u / lam) * 6.28 + ph));
      }
      add(smooth(line(r, ctrl), 8), "street");
    }
    const nu = Math.max(1, Math.round((2 * hw) / 300));
    for (let i = 0; i <= nu; i++) {
      const u0 = -hw + (i * 2 * hw) / nu;
      const ctrl: number[] = [];
      const edge = i === 0 || i === nu;
      for (let v = -hd; v <= hd + 0.1; v += 50) ctrl.push(u0 + (edge ? 0 : 26 * Math.sin((v / 260) * 6.28 + ph + i)), v);
      add(smooth(line(r, ctrl), 8), "street");
    }
  } else if (pattern === "culdesac") {
    // A winding spine through the middle, with dead ends off both sides.
    const lam = 520 + R() * 200;
    const ph = R() * 6.28;
    const spine = (u: number) => 26 * Math.sin((u / lam) * 6.28 + ph);
    const ctrl: number[] = [];
    for (let u = -hw; u <= hw + 0.1; u += 50) ctrl.push(u, spine(u));
    add(smooth(line(r, ctrl), 8), opts.avenue && hw > 350 ? "avenue" : "street");
    let side = 1;
    for (let u = -hw + 70; u < hw - 50; u += 85) {
      const len = Math.min(hd - 22, 130 + R() * 50);
      if (len < 60) break;
      const bend = (R() - 0.5) * 50;
      const v0 = spine(u);
      const c = [u, v0, u + bend * 0.3, v0 + side * len * 0.5, u + bend, v0 + side * len];
      add(smooth(line(r, c), 8), "street");
      side = -side;
      if (side === 1) u -= 40;
    }
    // Loops round the outside so the far ends join up.
    for (const v of [-hd, hd]) add(line(r, [-hw, v, hw, v]), "street");
    for (const u of [-hw, hw]) add(line(r, [u, -hd, u, hd]), "street");
  } else {
    // Superblocks: avenues on a 380 m grid, four dead ends into each block, a park at the heart.
    const kind: RoadKind = opts.avenue ? "avenue" : "street";
    const nu = Math.max(1, Math.round((2 * hw) / 380));
    const nv = Math.max(1, Math.round((2 * hd) / 380));
    const us = Array.from({ length: nu + 1 }, (_, i) => -hw + (i * 2 * hw) / nu);
    const vs = Array.from({ length: nv + 1 }, (_, i) => -hd + (i * 2 * hd) / nv);
    for (const v of vs) add(line(r, [-hw, v, hw, v]), kind);
    for (const u of us) add(line(r, [u, -hd, u, hd]), kind);
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const cu = (us[i] + us[i + 1]) / 2;
        const cv = (vs[j] + vs[j + 1]) / 2;
        const bu = (us[i + 1] - us[i]) / 2;
        const bv = (vs[j + 1] - vs[j]) / 2;
        const heart = Math.min(bu, bv) * 0.36;
        add(line(r, [cu - bu, cv, cu - heart - 12, cv]), "street");
        add(line(r, [cu + bu, cv, cu + heart + 12, cv]), "street");
        add(line(r, [cu, cv - bv, cu, cv - heart - 12]), "street");
        add(line(r, [cu, cv + bv, cu, cv + heart + 12]), "street");
        parks.push(line(r, [cu - heart, cv - heart, cu + heart, cv - heart, cu + heart, cv + heart, cu - heart, cv + heart]));
      }
  }
  return { roads, parks };
}

export function rectPoly(r: OBB) {
  return obbCorners(r);
}
