import * as THREE from "three";
import { BULB_R, ROADS, type RoadKind } from "../data";
import { pointAt, polyLength, slice, type Pts } from "../geom";
import { inWater, isDeadEnd } from "../roads";
import type { REdge, RNode, State } from "../state";
import { addGeo, color, MATS, place, Sheet, treeGeometry, treeMaterial } from "./kit";

/**
 * The road network as meshes: asphalt with junction pads and turning circles, footpaths cut back
 * where side roads join, lane markings and zebra crossings, green bike lanes, tram tracks with
 * their poles and wires, bridges where a road crosses the river, street lights and street trees.
 */

const Y_ASPHALT = 0.1;
const Y_MARK = 0.125;
const Y_WALK = 0.17;

/** Offset a polyline sideways by d (positive to the (-dz, dx) side), mitred at the bends. */
export function offsetLine(p: Pts, d: number): Pts {
  const out: Pts = [];
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let nx = 0;
    let nz = 0;
    if (i > 0) {
      const dx = p[i * 2] - p[a * 2];
      const dz = p[i * 2 + 1] - p[a * 2 + 1];
      const l = Math.hypot(dx, dz) || 1;
      nx += -dz / l;
      nz += dx / l;
    }
    if (i < n - 1) {
      const dx = p[b * 2] - p[i * 2];
      const dz = p[b * 2 + 1] - p[i * 2 + 1];
      const l = Math.hypot(dx, dz) || 1;
      nx += -dz / l;
      nz += dx / l;
    }
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    // Mitre: push out more at a bend so the width stays even.
    let k = 1;
    if (i > 0 && i < n - 1) {
      const dx = p[i * 2] - p[a * 2];
      const dz = p[i * 2 + 1] - p[a * 2 + 1];
      const ll = Math.hypot(dx, dz) || 1;
      const cos = (-dz / ll) * nx + (dx / ll) * nz;
      k = 1 / Math.max(0.5, cos);
    }
    out.push(p[i * 2] + nx * d * k, p[i * 2 + 1] + nz * d * k);
  }
  return out;
}

/** A strip between offsets d0 and d1 along a polyline, at height y. */
function ribbon(sh: Sheet, p: Pts, d0: number, d1: number, y: number, col: THREE.Color) {
  if (p.length < 4) return;
  const A = offsetLine(p, d0);
  const B = offsetLine(p, d1);
  // Keep the strip facing up whichever side it's on.
  const flip = d1 < d0;
  for (let i = 2; i < p.length; i += 2) {
    const a0 = [A[i - 2], y, A[i - 1]];
    const a1 = [A[i], y, A[i + 1]];
    const b0 = [B[i - 2], y, B[i - 1]];
    const b1 = [B[i], y, B[i + 1]];
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    if (!flip) sh.quad(b0, b1, a1, a0, uv, [0, 1, 0], col);
    else sh.quad(a0, a1, b1, b0, uv, [0, 1, 0], col);
  }
}

/** Dashes along a polyline at offset d: `on` metres painted, `off` gap. */
function dashes(sh: Sheet, p: Pts, d: number, w: number, on: number, off: number, col: THREE.Color) {
  const L = polyLength(p);
  for (let s = off / 2; s + on < L; s += on + off) ribbon(sh, slice(p, s, s + on), d - w / 2, d + w / 2, Y_MARK, col);
}

function disc(sh: Sheet, x: number, z: number, r: number, y: number, col: THREE.Color, seg = 24) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    sh.tri([x, y, z], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [0, 1, 0], col);
  }
}

function ring(sh: Sheet, x: number, z: number, r0: number, r1: number, y: number, col: THREE.Color, seg = 28) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a: number, r: number) => [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
    sh.quad(p(a0, r0), p(a1, r0), p(a1, r1), p(a0, r1), [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0], col);
  }
}

/** The direction an edge leaves a node in. */
function outDir(e: REdge, nid: number) {
  const p = e.pts;
  if (e.a === nid) {
    const l = Math.hypot(p[2] - p[0], p[3] - p[1]) || 1;
    return { x: (p[2] - p[0]) / l, z: (p[3] - p[1]) / l };
  }
  const n = p.length;
  const l = Math.hypot(p[n - 4] - p[n - 2], p[n - 3] - p[n - 1]) || 1;
  return { x: (p[n - 4] - p[n - 2]) / l, z: (p[n - 3] - p[n - 1]) / l };
}

interface Trims {
  asphalt: number;
  marks: number;
  /** Footpath trims on the + and - offset sides. */
  plus: number;
  minus: number;
  zebra: boolean;
}

function trimsAt(s: State, e: REdge, n: RNode): Trims {
  const deg = n.edges.length;
  const t: Trims = { asphalt: 0, marks: 0, plus: 0, minus: 0, zebra: false };
  if (deg === 1) {
    if (isDeadEnd(s, n)) {
      t.marks = BULB_R;
      t.plus = t.minus = BULB_R - 1;
    }
    return t;
  }
  let rc = 0;
  for (const id of n.edges) rc = Math.max(rc, ROADS[s.edges[id]!.kind].carriage);
  const o = outDir(e, n.id);
  const nx = -o.z;
  const nz = o.x;
  const sign = e.a === n.id ? 1 : -1;
  for (const id of n.edges) {
    if (id === e.id) continue;
    const f = s.edges[id]!;
    const of = outDir(f, n.id);
    const dot = o.x * of.x + o.z * of.z;
    if (dot < -0.92) continue;
    const side = of.x * nx + of.z * nz;
    const sin = Math.sqrt(Math.max(0.0001, 1 - dot * dot));
    const trim = Math.min(40, (ROADS[f.kind].half + 0.5) / Math.max(0.45, sin));
    if (side * sign > 0) t.plus = Math.max(t.plus, trim);
    else t.minus = Math.max(t.minus, trim);
  }
  if (deg >= 3) {
    t.asphalt = rc;
    t.marks = rc + 4.2;
    t.zebra = e.kind !== "lane";
  } else {
    t.marks = Math.max(t.plus, t.minus) > 0 ? rc : 0;
  }
  return t;
}

const C = {
  asphalt: color("#55585c"),
  lane: color("#6a675f"),
  gravel: color("#a69d86"),
  walk: color("#c3bfb6"),
  white: color("#eeeeea"),
  yellow: color("#e2b62a"),
  bike: color("#3f9a52"),
  bed: color("#8c8a84"),
  rail: color("#9aa0a6"),
  deck: color("#9c968b"),
  pier: color("#857f75"),
  pole: color("#4b5056"),
};

export interface RoadMeshes {
  group: THREE.Group;
  dispose(): void;
}

/** A roughness-only grain on the asphalt, from world position (no UVs needed). */
function grainy(m: THREE.MeshStandardMaterial, grain: THREE.Texture, scale: number, key: string) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tGrain = { value: grain };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vGW;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D tGrain;\nvarying vec3 vGW;")
      .replace("#include <color_fragment>", `#include <color_fragment>\n diffuseColor.rgb *= 0.78 + texture2D(tGrain, vGW.xz / ${scale.toFixed(1)}).r * 0.32;`);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

export function buildRoads(s: State, grain: THREE.Texture, quality: "low" | "medium" | "high"): RoadMeshes {
  const asphalt = new Sheet();
  const walk = new Sheet();
  const marks = new Sheet();
  const rails = new Sheet();
  const props = new Sheet();
  const lights: THREE.Matrix4[] = [];
  const trees: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const wires: number[] = [];
  for (const e of s.edges) {
    if (!e) continue;
    const R = ROADS[e.kind];
    const ta = trimsAt(s, e, s.nodes[e.a]!);
    const tb = trimsAt(s, e, s.nodes[e.b]!);
    const L = e.len;
    const cut = (t0: number, t1: number) => (L - t0 - t1 > 0.5 ? slice(e.pts, t0, L - t1) : null);
    const car = cut(ta.asphalt, tb.asphalt);
    if (car) ribbon(asphalt, car, -R.carriage, R.carriage, Y_ASPHALT, e.kind === "lane" ? C.lane : C.asphalt);
    if (e.kind === "lane") {
      // Gravel shoulders.
      if (car) {
        ribbon(walk, car, R.carriage, R.half, Y_ASPHALT - 0.02, C.gravel);
        ribbon(walk, car, -R.half, -R.carriage, Y_ASPHALT - 0.02, C.gravel);
      }
    } else {
      const wp = cut(ta.plus, tb.plus);
      const wm = cut(ta.minus, tb.minus);
      if (wp) ribbon(walk, wp, R.carriage, R.half, Y_WALK, C.walk);
      if (wm) ribbon(walk, wm, -R.half, -R.carriage, Y_WALK, C.walk);
    }
    // Markings.
    const mk = cut(ta.marks, tb.marks);
    if (mk && e.kind !== "lane") {
      if (e.kind === "street") {
        dashes(marks, mk, 0, 0.14, 3, 4, C.yellow);
        const edge = R.carriage - 2.0;
        if (e.bike) {
          ribbon(marks, mk, edge, R.carriage - 0.2, Y_MARK - 0.004, C.bike);
          ribbon(marks, mk, -R.carriage + 0.2, -edge, Y_MARK - 0.004, C.bike);
        }
        ribbon(marks, mk, edge - 0.07, edge + 0.07, Y_MARK, C.white);
        ribbon(marks, mk, -edge - 0.07, -edge + 0.07, Y_MARK, C.white);
      } else {
        if (!e.tram) {
          ribbon(marks, mk, -0.28, -0.14, Y_MARK, C.yellow);
          ribbon(marks, mk, 0.14, 0.28, Y_MARK, C.yellow);
        }
        dashes(marks, mk, 4.5, 0.14, 3, 6, C.white);
        dashes(marks, mk, -4.5, 0.14, 3, 6, C.white);
        const edge = R.carriage - 2.4;
        ribbon(marks, mk, edge - 0.08, edge + 0.08, Y_MARK, C.white);
        ribbon(marks, mk, -edge - 0.08, -edge + 0.08, Y_MARK, C.white);
        if (e.bike) {
          ribbon(marks, mk, edge + 0.2, R.carriage - 0.2, Y_MARK - 0.004, C.bike);
          ribbon(marks, mk, -R.carriage + 0.2, -edge - 0.2, Y_MARK - 0.004, C.bike);
        }
      }
      // Zebra crossings where it meets a junction.
      for (const [t, at] of [[ta, ta.asphalt + 1.2], [tb, L - tb.asphalt - 4.2]] as const) {
        if (!t.zebra || at < 0 || at > L - 3) continue;
        const p0 = pointAt(e.pts, at);
        const nx = -p0.dz;
        const nz = p0.dx;
        for (let k = -R.carriage + 0.6; k < R.carriage - 0.4; k += 1.1) {
          const cx = p0.x + nx * k + p0.dx * 1.5;
          const cz = p0.z + nz * k + p0.dz * 1.5;
          const hx = p0.dx * 1.5;
          const hz = p0.dz * 1.5;
          const wx = nx * 0.28;
          const wz = nz * 0.28;
          marks.quad([cx - hx - wx, Y_MARK, cz - hz - wz], [cx - hx + wx, Y_MARK, cz - hz + wz], [cx + hx + wx, Y_MARK, cz + hz + wz], [cx + hx - wx, Y_MARK, cz + hz - wz], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0], C.white);
        }
      }
    }
    // Tram tracks: one each way in the inner lanes, with poles and wires down the middle.
    if (e.tram) {
      const tp = cut(ta.asphalt * 0.6, tb.asphalt * 0.6) ?? e.pts;
      for (const c of [-2.6, 2.6]) {
        ribbon(rails, tp, c - 1.0, c + 1.0, Y_MARK - 0.006, C.bed);
        for (const r of [-0.72, 0.72]) ribbon(rails, tp, c + r - 0.05, c + r + 0.05, Y_MARK + 0.01, C.rail);
        const w = offsetLine(tp, c);
        for (let i = 2; i < w.length; i += 2) wires.push(w[i - 2], 6.2, w[i - 1], w[i], 6.2, w[i + 1]);
      }
      for (let d = 10; d < L - 5; d += 36) {
        const p = pointAt(e.pts, d);
        addGeo(props, new THREE.CylinderGeometry(0.12, 0.16, 7, 6).translate(0, 3.5, 0), C.pole, place(p.x, 0, p.z));
        addGeo(props, new THREE.BoxGeometry(6.4, 0.1, 0.1).translate(0, 6.6, 0), C.pole, place(p.x, 0, p.z, -p.dz, p.dx));
      }
    }
    // Bridges: a deck, parapets and piers where the road is over the water.
    let wet0 = -1;
    for (let d = 0; d <= L; d += 4) {
      const p = pointAt(e.pts, Math.min(d, L));
      const wet = inWater(s, p.x, p.z, 4);
      if (wet && wet0 < 0) wet0 = d;
      if ((!wet || d + 4 > L) && wet0 >= 0) {
        const span = slice(e.pts, Math.max(0, wet0 - 6), Math.min(L, d + 6));
        for (const sd of [1, -1]) {
          const o = offsetLine(span, sd * (R.half - 0.2));
          for (let i = 2; i < o.length; i += 2) {
            const nrm = [sd * -(o[i + 1] - o[i - 1]), 0, sd * (o[i] - o[i - 2])];
            const l = Math.hypot(nrm[0], nrm[2]) || 1;
            const n = [nrm[0] / l, 0, nrm[2] / l];
            if (sd > 0) props.wall(o[i - 2], o[i - 1], o[i], o[i + 1], Y_WALK, Y_WALK + 1.1, 1, 0, 1, n, C.deck);
            else props.wall(o[i], o[i + 1], o[i - 2], o[i - 1], Y_WALK, Y_WALK + 1.1, 1, 0, 1, n, C.deck);
            if (sd > 0) props.wall(o[i - 2], o[i - 1], o[i], o[i + 1], -2.2, Y_ASPHALT, 1, 0, 1, n, C.pier);
            else props.wall(o[i], o[i + 1], o[i - 2], o[i - 1], -2.2, Y_ASPHALT, 1, 0, 1, n, C.pier);
          }
        }
        for (let k = wet0 + 10; k < d - 4; k += 26) {
          const p2 = pointAt(e.pts, k);
          addGeo(props, new THREE.BoxGeometry(2, 4, R.half * 1.6).translate(0, -2.4, 0), C.pier, place(p2.x, 0, p2.z, p2.dx, p2.dz));
        }
        wet0 = -1;
      }
    }
    // Street lights and street trees.
    if (e.kind !== "lane" && quality !== "low") {
      let side = 1;
      for (let d = Math.max(ta.marks, 8); d < L - Math.max(tb.marks, 8); d += 34) {
        const p = pointAt(e.pts, d);
        if (inWater(s, p.x, p.z, R.half)) continue;
        const nx = -p.dz * side;
        const nz = p.dx * side;
        lights.push(place(p.x + nx * (R.half - 0.6), Y_WALK, p.z + nz * (R.half - 0.6), -nx, -nz));
        side = -side;
      }
      for (let d = Math.max(ta.marks, 10) + 5; d < L - Math.max(tb.marks, 10); d += e.kind === "avenue" ? 11 : 13) {
        const p = pointAt(e.pts, d);
        if (inWater(s, p.x, p.z, R.half + 2)) continue;
        for (const sd of [1, -1]) {
          if (((d * 7 + sd * 3) | 0) % 5 === 0) continue;
          const nx = -p.dz * sd;
          const nz = p.dx * sd;
          const k = 0.75 + (((d * 13) | 0) % 7) / 18;
          trees.push({ m: place(p.x + nx * (R.half - 1.7), Y_WALK, p.z + nz * (R.half - 1.7), 1, 0, k, k, k), c: new THREE.Color(0.86 + (((d * 3) | 0) % 5) * 0.05, 0.92 + (((d * 5) | 0) % 3) * 0.04, 0.82) });
        }
      }
    }
  }
  // Junction pads and turning circles.
  for (const n of s.nodes) {
    if (!n || !n.edges.length) continue;
    const kinds = n.edges.map((id) => s.edges[id]!.kind);
    const rc = Math.max(...kinds.map((k: RoadKind) => ROADS[k].carriage));
    if (n.edges.length >= 2) disc(asphalt, n.x, n.z, rc, Y_ASPHALT - 0.003, kinds.every((k) => k === "lane") ? C.lane : C.asphalt);
    else if (isDeadEnd(s, n)) {
      disc(asphalt, n.x, n.z, BULB_R - 3.2, Y_ASPHALT - 0.003, C.asphalt);
      ring(walk, n.x, n.z, BULB_R - 3.2, BULB_R, Y_WALK, C.walk);
    }
  }
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const mesh = (sh: Sheet, mat: THREE.Material, shadow = false) => {
    if (sh.empty) return;
    const g = sh.geometry();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.castShadow = shadow;
    group.add(m);
    disposables.push(g);
  };
  mesh(asphalt, MATS_ROAD.asphalt(grain));
  mesh(walk, MATS_ROAD.walk(grain));
  mesh(marks, MATS_ROAD.marks);
  mesh(rails, MATS.metal);
  mesh(props, MATS.props, true);
  if (wires.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(wires, 3));
    group.add(new THREE.LineSegments(g, MATS_ROAD.wire));
    disposables.push(g);
  }
  if (lights.length) {
    const im = new THREE.InstancedMesh(lampGeo(), MATS.props, lights.length);
    lights.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = quality === "high";
    group.add(im);
    disposables.push({ dispose: () => im.dispose() });
  }
  if (trees.length) {
    const im = new THREE.InstancedMesh(streetTree(), treeMaterial, trees.length);
    trees.forEach((t, i) => {
      im.setMatrixAt(i, t.m);
      im.setColorAt(i, t.c);
    });
    im.castShadow = quality !== "low";
    im.receiveShadow = true;
    group.add(im);
    disposables.push({ dispose: () => im.dispose() });
  }
  return { group, dispose: () => disposables.forEach((d) => d.dispose()) };
}

let lamp: THREE.BufferGeometry | null = null;
function lampGeo() {
  if (lamp) return lamp;
  const sh = new Sheet();
  addGeo(sh, new THREE.CylinderGeometry(0.07, 0.11, 7.4, 6).translate(0, 3.7, 0), C.pole);
  addGeo(sh, new THREE.BoxGeometry(1.7, 0.08, 0.08).translate(0.85, 7.3, 0), C.pole);
  addGeo(sh, new THREE.BoxGeometry(0.6, 0.14, 0.3).translate(1.6, 7.2, 0), color("#d8d4c4"));
  lamp = sh.geometry();
  return lamp;
}

let stree: THREE.BufferGeometry | null = null;
function streetTree() {
  if (!stree) stree = treeGeometry("tall");
  return stree;
}

const MATS_ROAD = {
  _a: null as THREE.MeshStandardMaterial | null,
  _w: null as THREE.MeshStandardMaterial | null,
  asphalt(grain: THREE.Texture) {
    if (!this._a) {
      this._a = grainy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), grain, 3, "xc-asphalt");
    }
    return this._a;
  },
  walk(grain: THREE.Texture) {
    if (!this._w) this._w = grainy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), grain, 5, "xc-walk");
    return this._w;
  },
  marks: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  wire: new THREE.LineBasicMaterial({ color: "#2a2d31", transparent: true, opacity: 0.7 }),
};
