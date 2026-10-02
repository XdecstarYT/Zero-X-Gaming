import * as THREE from "three";
import { mergeGeometries as mergeRaw } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { barkTexture, grassBladesTexture, leafClusterTexture } from "../neon-siege/three/textures";
import { blockAt, HALF_ROAD, HALF_STREET, type Building, type City } from "./city";
import { BASE_UNITS, BASE_W, GROUND_FLOOR, UPPER } from "./facades";

/**
 * Scenery geometry for Code 3's streamed chunks: facade walls split into a
 * ground-floor strip and upper floors (a whole number of bays and floors per
 * wall), cornices / band courses / plinths / porches, hip roofs on the houses,
 * foliage-card trees and a patch of wind-blown grass that follows the camera.
 */

function merge(list: THREE.BufferGeometry[]) {
  const out = mergeRaw(list.map((g) => (g.index ? g.toNonIndexed() : g)));
  if (!out) throw new Error("Code 3: couldn't merge scenery");
  return out;
}

type FacadeKind = Exclude<Building["kind"], "parked">;

export function styleOf(b: Building) {
  if (b.kind === "tower" || b.kind === "office" || b.kind === "house") return b.style % 4;
  if (b.kind === "warehouse") return b.style % 2;
  return 0;
}

function hash(x: number, z: number) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Per-building tint: houses take their paint colour; the rest vary a little in tone. */
function tintOf(b: Building) {
  const c = new THREE.Color("#ffffff");
  const k = hash(b.x, b.z);
  if (b.kind === "house") c.lerp(new THREE.Color(b.color), 0.85);
  else c.lerp(new THREE.Color(b.color), 0.12).multiplyScalar(0.9 + k * 0.16);
  return c;
}

class Sheet {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  /** A vertical wall quad from a to b (seen from outside, left to right). */
  wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, u0: number, u1: number, v0: number, v1: number, n: [number, number, number], c: THREE.Color) {
    const A = [ax, y0, az, u0, v0];
    const B = [bx, y0, bz, u1, v0];
    const C = [bx, y1, bz, u1, v1];
    const D = [ax, y1, az, u0, v1];
    for (const v of [A, B, C, A, C, D]) {
      this.pos.push(v[0], v[1], v[2]);
      this.uv.push(v[3], v[4]);
      this.nor.push(...n);
      this.col.push(c.r, c.g, c.b);
    }
  }
  tri(p: number[][], uv: number[][], c: THREE.Color) {
    const a = new THREE.Vector3(...p[0]);
    const n = new THREE.Vector3(...p[1]).sub(a).cross(new THREE.Vector3(...p[2]).sub(a)).normalize();
    for (let i = 0; i < 3; i++) {
      this.pos.push(...p[i]);
      this.uv.push(...uv[i]);
      this.nor.push(n.x, n.y, n.z);
      this.col.push(c.r, c.g, c.b);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

/** Which face of a house looks onto its street: N (-z) or S (+z). */
function houseFront(city: City, b: Building) {
  const bi = blockAt(city, b.x, b.z);
  const bl = city.blocks[bi];
  if (!bl) return "N";
  return b.z < (bl.z0 + bl.z1) / 2 ? "N" : "S";
}

/**
 * Walls for a list of buildings, grouped by facade material key:
 * `u:<kind>:<style>[:front]` for upper floors, `b:<kind>:<style>` for ground floors.
 * `crowns` are tower setbacks: upper-floor walls from `from` to their own top.
 */
export function wallGeometry(city: City, list: Building[], crowns: (Building & { from: number })[] = []) {
  const sheets = new Map<string, Sheet>();
  const sheet = (k: string) => sheets.get(k) ?? sheets.set(k, new Sheet()).get(k)!;
  const emit = (b: Building, y0: number, y1: number, upperFrom: number) => {
    const kind = b.kind as FacadeKind;
    const style = styleOf(b);
    const L = UPPER[kind];
    const GF = GROUND_FLOOR[kind];
    const tint = tintOf(b);
    const x0 = b.x - b.hw;
    const x1 = b.x + b.hw;
    const z0 = b.z - b.hd;
    const z1 = b.z + b.hd;
    const front = kind === "house" ? houseFront(city, b) : "";
    const faces: [string, number, number, number, number, [number, number, number]][] = [
      ["N", x1, z0, x0, z0, [0, 0, -1]],
      ["E", x1, z1, x1, z0, [1, 0, 0]],
      ["S", x0, z1, x1, z1, [0, 0, 1]],
      ["W", x0, z0, x0, z1, [-1, 0, 0]],
    ];
    for (const [name, ax, az, bx, bz, n] of faces) {
      const fw = Math.hypot(bx - ax, bz - az);
      const bays = Math.max(1, Math.round(fw / L.bayW));
      const U = bays / L.bays;
      if (kind === "store" && y0 === 0) {
        const units = Math.max(1, Math.round(fw / (BASE_W / BASE_UNITS)));
        sheet(`b:${kind}:${style}`).wall(ax, az, bx, bz, 0, y1, 0, units / BASE_UNITS, 0, y1 / GF, n, tint);
        continue;
      }
      let top = y0;
      if (y0 === 0 && GF > 0 && y1 > GF + 1.5) {
        const units = Math.max(1, Math.round(fw / (BASE_W / BASE_UNITS)));
        sheet(`b:${kind}:${style}`).wall(ax, az, bx, bz, 0, GF, 0, units / BASE_UNITS, 0, 1, n, tint);
        top = GF;
      }
      const from = Math.max(top, upperFrom);
      const floors = Math.max(1, Math.round((y1 - upperFrom) / L.floorH));
      const V = floors / L.floors;
      const vAt = (y: number) => ((y - upperFrom) / (y1 - upperFrom)) * V;
      const key = `u:${kind}:${style}${front === name ? ":front" : ""}`;
      sheet(key).wall(ax, az, bx, bz, from, y1, 0, U, vAt(from), V, n, tint);
    }
  };
  for (const b of list) {
    if (b.kind === "parked") continue;
    const GF = GROUND_FLOOR[b.kind as FacadeKind];
    const split = b.kind !== "store" && GF > 0 && b.h > GF + 1.5;
    emit(b, 0, b.h, split ? GF : 0);
  }
  for (const c of crowns) emit(c, c.from, c.h, c.from);
  const out = new Map<string, THREE.BufferGeometry>();
  for (const [k, s] of sheets) out.set(k, s.geometry());
  return out;
}

const TRIM: Record<string, string[]> = {
  tower: ["#3a3f44", "#c8c1b2", "#e0ded8", "#2c2824"],
  office: ["#d4cdbf", "#e0d6c2", "#b0ada5", "#e7dcc6"],
  store: ["#d8d2c4"],
  warehouse: ["#7d7b76", "#7d7b76"],
  station: ["#b5ae9f"],
  hospital: ["#f4f5f6"],
  house: ["#f4f2ec"],
};

function box(list: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i));
    const ny = Math.abs(n.getY(i));
    const fw = ny > 0.5 ? w : nx > 0.5 ? d : w;
    const fh = ny > 0.5 ? d : h;
    uv.setXY(i, (uv.getX(i) * fw) / 2, (uv.getY(i) * fh) / 2);
  }
  const cols = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) cols.set([color.r, color.g, color.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  list.push(g.translate(x, y, z));
}

/** Cornices, band courses, plinths, porches and chimneys (one merged mesh, vertex-tinted). */
export function trimGeometry(city: City, list: Building[], crowns: (Building & { from: number })[] = []) {
  const parts: THREE.BufferGeometry[] = [];
  const col = new THREE.Color();
  for (const b of list) {
    if (b.kind === "parked") continue;
    const kind = b.kind as FacadeKind;
    col.set(TRIM[kind][styleOf(b) % TRIM[kind].length]);
    const W = b.hw * 2;
    const D = b.hd * 2;
    const GF = GROUND_FLOOR[kind];
    if (kind === "house") {
      box(parts, W + 0.1, 0.4, D + 0.1, b.x, 0.2, b.z, col.set("#6d6a64"));
      // Porch over the front door: a roof slab on two posts, and a step.
      const s = houseFront(city, b) === "N" ? -1 : 1;
      const fz = b.z + s * b.hd;
      const white = new THREE.Color("#f4f2ec");
      box(parts, 2.9, 0.14, 1.5, b.x, 2.62, fz + s * 0.75, white);
      for (const dx of [-1.3, 1.3]) box(parts, 0.13, 2.55, 0.13, b.x + dx, 1.3, fz + s * 1.4, white);
      box(parts, 1.8, 0.2, 0.7, b.x, 0.1, fz + s * 0.35, new THREE.Color("#9a968e"));
      // Chimney (brick) through the roof.
      box(parts, 0.8, 2.6, 0.8, b.x + b.hw * 0.5, b.h + 1.3, b.z + b.hd * 0.3, new THREE.Color("#7a4636"));
      continue;
    }
    if (kind === "tower" || kind === "office" || kind === "station" || kind === "hospital") box(parts, W + 0.12, 0.5, D + 0.12, b.x, 0.25, b.z, col);
    if (GF > 0 && b.h > GF + 1.5 && kind !== "store" && kind !== "warehouse") box(parts, W + 0.24, 0.28, D + 0.24, b.x, GF + 0.1, b.z, col);
    if (kind !== "warehouse") {
      box(parts, W + 0.5, 0.55, D + 0.5, b.x, b.h - 0.35, b.z, col);
      box(parts, W + 0.3, 0.2, D + 0.3, b.x, b.h - 0.75, b.z, col);
    } else box(parts, W + 0.2, 0.3, D + 0.2, b.x, b.h - 0.2, b.z, col);
  }
  for (const c of crowns) {
    col.set(TRIM.tower[styleOf(c) % 4]);
    box(parts, c.hw * 2 + 0.5, 0.55, c.hd * 2 + 0.5, c.x, c.h - 0.35, c.z, col);
  }
  return parts.length ? merge(parts) : null;
}

/** Hip roofs with a 0.45 m overhang; UVs in metres along the eave and up the slope. */
export function hipRoofGeometry(list: Building[]) {
  const s = new Sheet();
  const ROOFS = ["#5a4a42", "#3d3f44", "#6b5b4b", "#7a3e32", "#4a5560"];
  for (const b of list) {
    if (b.kind !== "house") continue;
    const c = new THREE.Color(ROOFS[Math.floor(hash(b.z, b.x) * ROOFS.length)]).multiplyScalar(1.6);
    const o = 0.45;
    const alongX = b.hw >= b.hd;
    // Work in a frame where the ridge runs along local x.
    const hl = (alongX ? b.hw : b.hd) + o;
    const hs = (alongX ? b.hd : b.hw) + o;
    const rise = hs * 0.62;
    const r = Math.max(0.2, hl - hs);
    const y = b.h;
    const P = (lx: number, ly: number, lz: number) => (alongX ? [b.x + lx, ly, b.z + lz] : [b.x + lz, ly, b.z + lx]);
    const slope = Math.hypot(hs, rise);
    const e0 = P(-hl, y, -hs);
    const e1 = P(hl, y, -hs);
    const e2 = P(hl, y, hs);
    const e3 = P(-hl, y, hs);
    const r0 = P(-r, y + rise, 0);
    const r1 = P(r, y + rise, 0);
    // Winding must face outward; flip when the frame swaps axes (mirror).
    const tri = (a: number[], bb: number[], cc: number[], ua: number[], ub: number[], uc: number[]) => (alongX ? s.tri([a, bb, cc], [ua, ub, uc], c) : s.tri([a, cc, bb], [ua, uc, ub], c));
    // Long sides (trapezoids as two triangles each).
    tri(e0, r0, e1, [0, 0], [hl - r, slope], [hl * 2, 0]);
    tri(e1, r0, r1, [hl * 2, 0], [hl - r, slope], [hl + r, slope]);
    tri(e2, r1, e3, [0, 0], [hl - r, slope], [hl * 2, 0]);
    tri(e3, r1, r0, [hl * 2, 0], [hl - r, slope], [hl + r, slope]);
    // Hip ends.
    const endSlope = Math.hypot(hl - r, rise);
    tri(e1, r1, e2, [0, 0], [hs, endSlope], [hs * 2, 0]);
    tri(e3, r0, e0, [0, 0], [hs, endSlope], [hs * 2, 0]);
  }
  if (!s.pos.length) return null;
  const g = s.geometry();
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
  return g;
}

/** Flat roofs (planar UVs, 4 m tile) for everything but houses. */
export function flatRoofGeometry(list: Building[], crowns: Building[] = []) {
  const s = new Sheet();
  const grey = new THREE.Color();
  for (const b of [...list, ...crowns]) {
    if (b.kind === "house" || b.kind === "parked") continue;
    grey.setScalar(0.85 + hash(b.x, b.z) * 0.3);
    const x0 = b.x - b.hw;
    const x1 = b.x + b.hw;
    const z0 = b.z - b.hd;
    const z1 = b.z + b.hd;
    s.tri([[x0, b.h, z0], [x0, b.h, z1], [x1, b.h, z1]], [[x0 / 4, z0 / 4], [x0 / 4, z1 / 4], [x1 / 4, z1 / 4]], grey);
    s.tri([[x0, b.h, z0], [x1, b.h, z1], [x1, b.h, z0]], [[x0 / 4, z0 / 4], [x1 / 4, z1 / 4], [x1 / 4, z0 / 4]], grey);
  }
  return s.pos.length ? s.geometry() : null;
}

// ------------------------------------------------------------------ trees

export interface TreeSpot {
  x: number;
  z: number;
  s: number;
  /** Ground height (0 if left out). */
  y?: number;
}

interface Canopy {
  cards: THREE.BufferGeometry;
  mass: THREE.BufferGeometry;
  trunk: THREE.BufferGeometry;
}

function rngOf(seed: number) {
  let r = seed * 16807 % 2147483647;
  return () => ((r = (r * 16807) % 2147483647) - 1) / 2147483646;
}

/**
 * SpeedTree-style broadleaf trees: alpha-tested leaf-cluster cards over a dark
 * inner mass, normals bent outward from the crown's centre so the canopy
 * shades as a volume; the cards sway in the wind.
 */
export class TreeKit {
  readonly time = { value: 0 };
  private variants: Canopy[] = [];
  /** Low detail: opaque canopies only (alpha-tested cards overdraw badly on slow GPUs). */
  private readonly solid: boolean;
  private mats: { cards: THREE.MeshStandardMaterial; mass: THREE.MeshStandardMaterial; bark: THREE.MeshStandardMaterial };

  constructor(detail: "high" | "low") {
    this.solid = detail === "low";
    const bark = barkTexture(detail === "high" ? 128 : 64);
    bark.map.repeat.set(2, 3);
    bark.normal?.repeat.set(2, 3);
    this.mats = {
      bark: new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normal ?? null, roughness: 0.95 }),
      cards: new THREE.MeshStandardMaterial({
        map: leafClusterTexture(detail === "high" ? 256 : 128),
        alphaTest: 0.42,
        side: THREE.DoubleSide,
        vertexColors: true,
        roughness: 0.8,
      }),
      mass: new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.95 }),
    };
    const time = this.time;
    this.mats.cards.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = `uniform float uTime;\n${sh.vertexShader}`.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 tp0 = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #else
          vec4 tp0 = vec4(0.0);
        #endif
        float tw = sin(uTime * 1.3 + tp0.x * 0.21 + tp0.z * 0.17) + 0.4 * sin(uTime * 3.7 + position.y * 2.0 + tp0.x);
        transformed.x += tw * 0.05 * max(0.0, position.y - 2.0);
        transformed.z += tw * 0.03 * max(0.0, position.y - 2.0);`,
      );
    };
    this.mats.cards.customProgramCacheKey = () => "code3-leaves";
    const cards = detail === "high" ? 46 : 22;
    this.variants = [
      this.canopy(1, 2.3, 0.85, 2.9, cards),
      this.canopy(2, 1.8, 1.35, 3.3, cards),
      this.canopy(3, 1.6, 0.9, 2.5, Math.round(cards * 0.8)),
    ];
  }

  private canopy(seed: number, R: number, squash: number, trunkH: number, n: number): Canopy {
    const rnd = rngOf(seed * 101);
    const cy = trunkH + R * squash * 0.7;
    const centre = new THREE.Vector3(0, cy, 0);
    const list: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const u = rnd() * Math.PI * 2;
      const v = Math.acos(-0.6 + rnd() * 1.6);
      const rr = R * (0.55 + 0.45 * Math.sqrt(rnd()));
      const p = new THREE.Vector3(Math.sin(v) * Math.cos(u) * rr, cy + Math.cos(v) * rr * squash, Math.sin(v) * Math.sin(u) * rr);
      const size = 1.15 + rnd() * 0.75;
      const g = new THREE.PlaneGeometry(size, size);
      e.set(rnd() * 1.6 - 0.8, rnd() * Math.PI * 2, rnd() * 1 - 0.5);
      q.setFromEuler(e);
      m.compose(p, q, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(m);
      // Normals bent outward from the crown; colour lighter on top and outside.
      const pos = g.attributes.position as THREE.BufferAttribute;
      const nor = g.attributes.normal as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 3);
      const tmp = new THREE.Vector3();
      for (let k = 0; k < pos.count; k++) {
        tmp.set(pos.getX(k), pos.getY(k), pos.getZ(k)).sub(centre);
        const out = tmp.length() / (R * 1.1);
        const top = tmp.y / (R * squash);
        tmp.normalize();
        tmp.y += 0.35;
        tmp.normalize();
        nor.setXYZ(k, tmp.x, tmp.y, tmp.z);
        const b = Math.max(0.45, Math.min(1.15, 0.62 + out * 0.3 + top * 0.18 + (rnd() - 0.5) * 0.12));
        col.set([b, b, b], k * 3);
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      list.push(g);
    }
    const cards = merge(list);
    // Inner mass, so the crown never looks see-through.
    const mass = new THREE.IcosahedronGeometry(R * (this.solid ? 0.95 : 0.78), this.solid ? 2 : 1).toNonIndexed();
    mass.scale(1, squash, 1).translate(0, cy, 0);
    const mp = mass.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < mp.count; k++) {
      const x = mp.getX(k);
      const y = mp.getY(k);
      const z = mp.getZ(k);
      const f = 1 + Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7) * 0.12 + Math.sin(y * 4.3) * 0.06;
      mp.setXYZ(k, x * f, cy + (y - cy) * f, z * f);
    }
    mass.computeVertexNormals();
    const mc = new Float32Array(mp.count * 3);
    for (let k = 0; k < mp.count; k++) {
      const up = Math.max(0, (mp.getY(k) - cy) / (R * squash));
      // Seen alone (Low), the core is the canopy: lighter, lit from above.
      const t = this.solid ? 0.42 + up * 0.25 + Math.sin(k * 1.7) * 0.05 : 0.16 + up * 0.1;
      mc.set([t * 0.9, t * 1.25, t * 0.6], k * 3);
    }
    mass.setAttribute("color", new THREE.BufferAttribute(mc, 3));
    // Trunk and three limbs reaching into the crown.
    const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.12, 0.24, trunkH + 0.6, 8, 1).translate(0, (trunkH + 0.6) / 2, 0)];
    for (let b = 0; b < 3; b++) {
      const a = b * 2.1 + seed;
      const limb = new THREE.CylinderGeometry(0.05, 0.1, R * 0.95, 6, 1).translate(0, (R * 0.95) / 2, 0);
      limb.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.sin(a) * 0.7, 0, Math.cos(a) * 0.7)));
      parts.push(limb.translate(0, trunkH - 0.2, 0));
    }
    const trunk = merge(parts);
    for (const g of [cards, mass, trunk]) g.userData.shared = true;
    return { cards, mass, trunk };
  }

  /** Instanced trees for one chunk. */
  build(target: THREE.Object3D, trees: TreeSpot[], shadows: boolean) {
    const by: TreeSpot[][] = [[], [], []];
    for (const t of trees) by[Math.floor(hash(t.x, t.z) * 3)].push(t);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    by.forEach((list, v) => {
      if (!list.length) return;
      const c = this.variants[v];
      const trunk = new THREE.InstancedMesh(c.trunk, this.mats.bark, list.length);
      const cards = new THREE.InstancedMesh(c.cards, this.mats.cards, list.length);
      const mass = new THREE.InstancedMesh(c.mass, this.mats.mass, list.length);
      list.forEach((t, k) => {
        const h = hash(t.z, t.x);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h * Math.PI * 2);
        const s = t.s * (0.9 + h * 0.2);
        m4.compose(new THREE.Vector3(t.x, t.y ?? 0, t.z), q, new THREE.Vector3(s, s * (0.92 + hash(t.x, 7) * 0.16), s));
        trunk.setMatrixAt(k, m4);
        cards.setMatrixAt(k, m4);
        mass.setMatrixAt(k, m4);
        // Summer greens with the odd yellowing crown.
        col.setHSL(0.22 + h * 0.08 - (h > 0.9 ? 0.07 : 0), 0.35 + h * 0.2, 0.62 + hash(t.x, t.z + 1) * 0.12, THREE.SRGBColorSpace);
        cards.setColorAt(k, col);
        mass.setColorAt(k, col);
      });
      trunk.castShadow = cards.castShadow = shadows;
      cards.receiveShadow = true;
      target.add(trunk, mass);
      if (!this.solid) target.add(cards);
    });
  }
}

/** Street trees in pits along the busier sidewalks (render only). */
export function streetTrees(city: City, avoid: { x: number; z: number }[]): TreeSpot[] {
  const out: TreeSpot[] = [];
  const clear = (x: number, z: number) => avoid.every((a) => (a.x - x) ** 2 + (a.z - z) ** 2 > 9);
  for (const b of city.blocks) {
    if (b.district !== "downtown" && b.district !== "midtown") continue;
    const off = HALF_STREET - HALF_ROAD - 1.45;
    const edges = [
      { x0: b.x0, z0: b.z0 - off, dx: 1, dz: 0, len: b.x1 - b.x0 },
      { x0: b.x0, z0: b.z1 + off, dx: 1, dz: 0, len: b.x1 - b.x0 },
      { x0: b.x0 - off, z0: b.z0, dx: 0, dz: 1, len: b.z1 - b.z0 },
      { x0: b.x1 + off, z0: b.z0, dx: 0, dz: 1, len: b.z1 - b.z0 },
    ];
    for (const e of edges)
      for (let t = 9; t < e.len - 8; t += 14) {
        const x = e.x0 + e.dx * t;
        const z = e.z0 + e.dz * t;
        if (clear(x, z)) out.push({ x, z, s: 0.75 + hash(x, z) * 0.2 });
      }
  }
  return out;
}

/** Tree pits: a dark soil square with a steel grate around each street tree. */
export function treePitGeometry(trees: TreeSpot[]) {
  if (!trees.length) return null;
  const list = trees.map((t) => new THREE.PlaneGeometry(1.4, 1.4).rotateX(-Math.PI / 2).translate(t.x, 0.155, t.z));
  return merge(list);
}

// ------------------------------------------------------------------ grass

/** Is this spot open lawn (suburban yards, the park) where grass can grow? */
export function isLawn(city: City, x: number, z: number) {
  const bi = blockAt(city, x, z);
  if (bi < 0) return false;
  const b = city.blocks[bi];
  if (b.district !== "suburbs" && b.district !== "park") return false;
  if (x < b.x0 + 0.3 || x > b.x1 - 0.3 || z < b.z0 + 0.3 || z > b.z1 - 0.3) return false;
  for (const k of city.byBlock[bi]) {
    const bl = city.buildings[k];
    if (Math.abs(x - bl.x) < bl.hw + (bl.kind === "house" ? 1.2 : 0.5) && Math.abs(z - bl.z) < bl.hd + (bl.kind === "house" ? 1.8 : 0.5)) return false;
  }
  if (b.district === "suburbs") {
    const lw = (b.x1 - b.x0) / 3;
    for (let a = 0; a < 3; a++) {
      const dx = b.x0 + lw * (a + 0.5) + 3;
      if (x > dx - 0.3 && x < dx + 2.9 && (z < b.z0 + 7.3 || z > b.z1 - 7.3)) return false;
    }
  } else {
    // Keep off the footpaths across the park.
    const w = b.x1 - b.x0;
    const h = b.z1 - b.z0;
    const d1 = Math.abs((x - b.x0) * h - (z - b.z0) * w) / Math.hypot(w, h);
    const d2 = Math.abs((x - b.x1) * h + (z - b.z0) * w) / Math.hypot(w, h);
    if (d1 < 1.6 || d2 < 1.6) return false;
  }
  return true;
}

/** Grass tufts on the lawns around the camera, re-seeded as it moves (stable per cell). */
export class GrassField {
  readonly mesh: THREE.InstancedMesh;
  readonly time = { value: 0 };
  private lastX = 1e9;
  private lastZ = 1e9;
  private readonly cell = 0.85;
  private readonly radius: number;

  constructor(
    private city: City,
    count: number,
    radius: number,
  ) {
    this.radius = radius;
    const a = new THREE.PlaneGeometry(0.75, 0.5).translate(0, 0.25, 0);
    const geo = merge([a, a.clone().rotateY(Math.PI / 3), a.clone().rotateY((Math.PI * 2) / 3)]);
    const n = geo.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const mat = new THREE.MeshStandardMaterial({ map: grassBladesTexture(128), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
    const time = this.time;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = `uniform float uTime;\n${sh.vertexShader}`.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vec4 gp0 = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
         float sway = sin(uTime * 1.8 + gp0.x * 0.35 + gp0.z * 0.25) * 0.5 + sin(uTime * 3.1 + gp0.z * 0.9) * 0.2;
         transformed.x += sway * 0.12 * position.y;
         transformed.z += sway * 0.06 * position.y;`,
      );
    };
    mat.customProgramCacheKey = () => "code3-grass";
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
  }

  update(x: number, z: number) {
    if ((x - this.lastX) ** 2 + (z - this.lastZ) ** 2 < 9) return;
    this.lastX = x;
    this.lastZ = z;
    const R = this.radius;
    const c = this.cell;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    const max = this.mesh.instanceMatrix.count;
    const i0 = Math.floor((x - R) / c);
    const i1 = Math.floor((x + R) / c);
    const j0 = Math.floor((z - R) / c);
    const j1 = Math.floor((z + R) / c);
    for (let j = j0; j <= j1 && n < max; j++)
      for (let i = i0; i <= i1 && n < max; i++) {
        const h = hash(i, j);
        if (h > 0.8) continue;
        const px = (i + hash(j, i)) * c;
        const pz = (j + h) * c;
        if ((px - x) ** 2 + (pz - z) ** 2 > R * R) continue;
        if (!isLawn(this.city, px, pz)) continue;
        q.setFromAxisAngle(up, h * 6.28);
        const k = 0.7 + hash(i + 3, j) * 0.7;
        m4.compose(p.set(px, 0, pz), q, s.set(k, k * (0.8 + h * 0.6), k));
        this.mesh.setMatrixAt(n, m4);
        col.setHSL(0.22 + (h - 0.4) * 0.06, 0.3, 0.68 + hash(j + 5, i) * 0.18, THREE.SRGBColorSpace);
        this.mesh.setColorAt(n, col);
        n++;
      }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
