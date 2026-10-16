import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries as mergeRaw } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Prop } from "../world";

/**
 * Model kit: street props built from simple shapes with vertex colours (merged into each city
 * chunk), palm fronds and leaves on alpha cards, and the vehicles the shared car kit doesn't have
 * (a sports bike, a speedboat, an airboat, the police helicopter) plus the guns in people's hands.
 */

export function merge(list: THREE.BufferGeometry[]) {
  const flat = list.map((x) => (x.index ? x.toNonIndexed() : x));
  // Parts tagged with their own metal and roughness (`surface`) merge with untagged ones, which
  // keep the material's own.
  if (flat.some((g) => g.attributes.aMR)) for (const g of flat) if (!g.attributes.aMR) g.setAttribute("aMR", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
  const g = mergeRaw(flat);
  if (!g) throw new Error("Heatwave: couldn't merge geometry");
  return g;
}

/** Give a geometry one flat vertex colour. */
export function paint(g: THREE.BufferGeometry, color: string | THREE.Color, jitter = 0) {
  const c = typeof color === "string" ? new THREE.Color(color) : color;
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = jitter ? 1 + (Math.sin(i * 12.9898) * 0.5) * jitter : 1;
    a[i * 3] = c.r * k;
    a[i * 3 + 1] = c.g * k;
    a[i * 3 + 2] = c.b * k;
  }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

/** Tag a geometry's metalness and roughness (read by the prop material; see `propSurface`). */
export function surface<T extends THREE.BufferGeometry>(g: T, metal: number, rough: number) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([metal, rough, 1], i * 3);
  g.setAttribute("aMR", new THREE.BufferAttribute(a, 3));
  return g;
}

/** Let a vertex-coloured material read per-vertex metal and roughness where they're tagged. */
export function propSurface<M extends THREE.MeshStandardMaterial>(m: M) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aMR;\nvarying vec3 vMR;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMR = aMR;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vMR;")
      .replace("float roughnessFactor = roughness;", "float roughnessFactor = vMR.z > 0.5 ? vMR.y : roughness;")
      .replace("float metalnessFactor = metalness;", "float metalnessFactor = vMR.z > 0.5 ? vMR.x : metalness;");
  };
  m.customProgramCacheKey = () => "hwprop";
  return m;
}

/* Surfaces for the street furniture. */
const STEEL = (g: THREE.BufferGeometry, c = "#3d4248") => surface(paint(g, c), 0.75, 0.38);
const TIMBER = (g: THREE.BufferGeometry, c = "#8a6444") => surface(paint(g, c, 0.12), 0, 0.72);
const GLASS = (g: THREE.BufferGeometry) => surface(paint(g, "#2c383f"), 0.55, 0.05);
const CONC = (g: THREE.BufferGeometry, c = "#bdb7ab") => surface(paint(g, c, 0.06), 0, 0.92);
const PAINTED = (g: THREE.BufferGeometry, c: string) => surface(paint(g, c), 0.25, 0.45);

/** A tube along points (a pole's arm, a rail, a frame). */
function tube(pts: [number, number, number][], r: number, seg = 6, tubular = 12) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, tubular, r, seg, false);
}

/** A turned shape (a pole, a bin, a bollard) from (radius, height) pairs. */
function turned(prof: [number, number][], seg = 12) {
  return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

/** A rounded slab (bench slats, lids, panels). */
function slab(w: number, h: number, d: number, x: number, y: number, z: number, r = 0.015) {
  return new RoundedBoxGeometry(w, h, d, 1, Math.min(r, h / 2 - 0.001, d / 2 - 0.001, w / 2 - 0.001)).translate(x, y + h / 2, z);
}

export function box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  if (ry) g.rotateY(ry);
  g.translate(x, y + h / 2, z);
  return paint(g, color);
}

export function cyl(r0: number, r1: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 8) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg).toNonIndexed();
  g.translate(x, y + h / 2, z);
  return paint(g, color);
}

/** One template per prop kind: solid (vertex-coloured), leaves (alpha cards), lamp glows. */
export interface PropTemplate {
  solid: THREE.BufferGeometry[];
  /** Palm fronds (frond texture). */
  fronds: THREE.BufferGeometry[];
  /** Broadleaf cards (leaf cluster texture). */
  leaves: THREE.BufferGeometry[];
  /** Pool water. */
  water: THREE.BufferGeometry[];
  /** Lamp head positions (local). */
  glows: [number, number, number][];
}

const empty = (): PropTemplate => ({ solid: [], fronds: [], leaves: [], water: [], glows: [] });

function frond(len: number, droop: number) {
  const g = new THREE.PlaneGeometry(len, 1.15, 6, 1).toNonIndexed();
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + len / 2;
    const t = x / len;
    // Lie flat, rise then droop along the length; a little V across.
    p.setXYZ(i, x, t * 1.1 - t * t * droop + Math.abs(p.getY(i)) * 0.25, p.getY(i));
  }
  g.computeVertexNormals();
  return g;
}

function cross(size: number, y: number, n = 3) {
  const list: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(size, size).toNonIndexed();
    g.rotateY((i / n) * Math.PI);
    g.translate(0, y, 0);
    list.push(g);
  }
  // Two cards tipped over, so the crown isn't a neat star from any side.
  for (const tilt of [0.75, -0.75]) {
    const g = new THREE.PlaneGeometry(size * 0.85, size * 0.85).toNonIndexed();
    g.rotateX(tilt);
    g.rotateY(tilt * 1.9 + n);
    g.translate(0, y + size * 0.05, 0);
    list.push(g);
  }
  // A flat one on top so it's not see-through from above.
  const top = new THREE.PlaneGeometry(size * 0.9, size * 0.9).toNonIndexed();
  top.rotateX(-Math.PI / 2);
  top.translate(0, y + size * 0.12, 0);
  list.push(top);
  return list;
}

/** A leafy mass: a ball pushed in and out by noise, so its outline is ragged, not faceted. */
function clump(r: number, x: number, y: number, z: number, color: string, seed = 0) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 2.7 + seed) * Math.sin(v.y * 3.1 + seed * 1.7) * Math.sin(v.z * 2.3 - seed);
    v.multiplyScalar(1 + n * 0.32).setY(v.y * 0.86);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.translate(x, y, z);
  return paint(g.index ? g.toNonIndexed() : g, color, 0.22);
}

const cache = new Map<string, PropTemplate>();

export function propTemplate(kind: Prop["kind"], s = 1, color = "#ffffff"): PropTemplate {
  const key = `${kind}:${s}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const t = empty();
  switch (kind) {
    case "palm": {
      // A curving trunk with rings, a crown of fronds and coconuts.
      const H = 7.5;
      const segs = 7;
      let x = 0;
      for (let i = 0; i < segs; i++) {
        const y0 = (i / segs) * H;
        const lean = Math.pow(i / segs, 1.6) * 0.9;
        const g = cyl(0.24 - i * 0.012, 0.22 - i * 0.012, H / segs + 0.05, i % 2 ? "#8a6d4a" : "#7a5e3e", 0, 0, 0, 7);
        g.translate(lean, y0, 0);
        t.solid.push(g);
        x = lean;
      }
      for (let k = 0; k < 3; k++) t.solid.push(paint(new THREE.SphereGeometry(0.16, 6, 5).toNonIndexed().translate(x + Math.cos(k * 2.1) * 0.25, H - 0.3, Math.sin(k * 2.1) * 0.25), "#5a4520"));
      for (let k = 0; k < 9; k++) {
        const f = frond(3.6 + (k % 3) * 0.4, 2.2 + (k % 2) * 0.6);
        f.rotateZ(0.15);
        f.rotateY((k / 9) * Math.PI * 2 + (k % 2) * 0.2);
        f.translate(x, H - 0.1, 0);
        t.fronds.push(f);
      }
      break;
    }
    case "tree": {
      t.solid.push(cyl(0.28, 0.2, 3.2, "#5a4632"));
      for (const g of cross(5.2, 4.6, 3)) t.leaves.push(paint(g, "#d8f0b8"));
      t.solid.push(clump(1.9, 0, 4.4, 0, "#3e5f2a", 1.3));
      break;
    }
    case "plane":
    case "elm": {
      // London plane trees and elms: a stout, mottled trunk forking into a big rounded crown.
      const elm = kind === "elm";
      const H = elm ? 5.2 : 4.4;
      t.solid.push(cyl(0.34, 0.24, H, elm ? "#4e4436" : "#8a8270", 0, 0, 0, 8));
      for (let k = 0; k < 3; k++) {
        const g = cyl(0.16, 0.1, 3.2, elm ? "#4e4436" : "#8a8270", 0, 0, 0, 6);
        g.rotateZ(0.5);
        g.rotateY(k * 2.1);
        g.translate(0, H - 0.3, 0);
        t.solid.push(g);
      }
      const R = elm ? 4.6 : 4.1;
      for (const [dx, dy, dz, r] of [[0, H + 2.4, 0, R], [1.8, H + 1.3, 1.1, R * 0.7], [-1.7, H + 1.5, -0.9, R * 0.72], [0.6, H + 3.6, -1.2, R * 0.6]] as [number, number, number, number][]) {
        for (const g of cross(r * 2, 0, 4)) t.leaves.push(paint(g.translate(dx, dy, dz), elm ? "#c4dc9e" : "#dcefa8", 0.12));
        // A small dark core so the crown never looks hollow.
        t.solid.push(clump(r * 0.42, dx, dy, dz, elm ? "#41602f" : "#577a34", dx + dz));
      }
      break;
    }
    case "gum": {
      // A eucalypt: a tall pale trunk that leans and forks, with thin, drooping grey-green clumps.
      const H = 9;
      const pale = "#d9d2c4";
      for (let i = 0; i < 5; i++) {
        const g = cyl(0.3 - i * 0.04, 0.26 - i * 0.04, H / 5 + 0.1, i % 2 ? pale : "#cfc5b2", 0, 0, 0, 7);
        g.translate(Math.sin(i * 0.6) * 0.5, (i / 5) * H, 0);
        t.solid.push(g);
      }
      for (let k = 0; k < 4; k++) {
        const g = cyl(0.12, 0.07, 4, pale, 0, 0, 0, 5);
        g.rotateZ(0.7 - (k % 2) * 0.2);
        g.rotateY(k * 1.6);
        g.translate(0.4, H * 0.7, 0);
        t.solid.push(g);
      }
      for (const [dx, dy, dz, r] of [[2.4, H + 0.6, 0.4, 3.2], [-1.8, H + 1.6, -1.4, 3], [0.4, H + 3, 1.6, 2.8], [-0.6, H - 0.4, 2.2, 2.4], [1.2, H + 2.2, -2, 2.4]] as [number, number, number, number][]) {
        for (const g of cross(r * 2, 0, 2)) t.leaves.push(paint(g.scale(1, 0.75, 1).translate(dx, dy, dz), "#a9b89a"));
      }
      break;
    }
    case "bin": {
      // A city litter bin: a ribbed steel drum, a domed lid with the slot, a plinth.
      const ribs = turned([[0.001, 0], [0.31, 0], [0.31, 0.06], [0.29, 0.08], [0.3, 0.95], [0.32, 0.97], [0.001, 0.97]], 18);
      t.solid.push(STEEL(ribs, "#2d4a3b"));
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        t.solid.push(STEEL(slab(0.045, 0.78, 0.03, 0, 0.12, 0, 0.01).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3), "#25402f"));
      }
      t.solid.push(STEEL(turned([[0.001, 0.97], [0.34, 0.97], [0.33, 1.03], [0.24, 1.1], [0.001, 1.12]], 18), "#1f2a25"));
      t.solid.push(paint(new THREE.TorusGeometry(0.2, 0.025, 6, 16).rotateX(Math.PI / 2).translate(0, 1.075, 0), "#0b0c0d"));
      break;
    }
    case "beachbox": {
      // A Middle Park bathing box: weatherboard walls, a pitched corrugated roof, painted doors.
      t.solid.push(box(2.4, 2.2, 2.4, "#efe9dc"), box(1.6, 1.8, 0.06, color, 0, 0.1, 1.22), box(0.12, 2.2, 2.46, color, -1.18, 0), box(0.12, 2.2, 2.46, color, 1.18, 0));
      const roof = new THREE.CylinderGeometry(0.01, 1.9, 1, 4, 1).toNonIndexed();
      roof.rotateY(Math.PI / 4);
      roof.scale(1, 1, 1);
      roof.translate(0, 2.7, 0);
      t.solid.push(paint(roof, "#8a8f96"));
      break;
    }
    case "tennis":
      t.solid.push(box(10.97, 0.04, 23.77, "#2f6f5a", 0, 0), box(8.23, 0.05, 23.77, "#3f8a6a", 0, 0.01), box(0.05, 1.07, 12.8, "#f6f1e7", 0, 0, 0, Math.PI / 2));
      for (const [x, z] of [[-6.5, -13.5], [6.5, -13.5], [-6.5, 13.5], [6.5, 13.5]]) t.solid.push(box(0.08, 3, 0.08, "#2b2f36", x, 0, z));
      break;
    case "flame":
      // The casino's gas towers along the river: dark pillars that burst into flame at night.
      t.solid.push(cyl(0.9, 0.7, 11, "#2b2f36", 0, 0, 0, 10), cyl(1, 1, 0.5, "#c9a24a", 0, 11, 0, 10));
      t.glows.push([0, 12.5, 0]);
      break;
    case "graffiti":
      break;
    case "lamp": {
      // A street light: a tapered galvanised pole on a flanged base, a sweeping outreach arm and
      // a slim LED head angled down over the road.
      t.solid.push(STEEL(turned([[0.001, 0], [0.2, 0], [0.2, 0.05], [0.13, 0.08], [0.12, 0.6], [0.105, 0.64], [0.085, 7.4], [0.07, 7.6], [0.001, 7.62]], 12), "#8b9096"));
      t.solid.push(STEEL(slab(0.12, 0.32, 0.05, 0, 0.7, 0.1, 0.01), "#6f747a"));
      t.solid.push(STEEL(tube([[0, 7.2, 0], [0.25, 7.62, 0], [0.9, 7.82, 0], [1.9, 7.86, 0]], 0.05, 6, 10), "#8b9096"));
      t.solid.push(STEEL(slab(0.78, 0.09, 0.32, 2.1, 7.76, 0, 0.04).rotateZ(-0.04), "#5d6268"));
      t.solid.push(surface(paint(slab(0.62, 0.02, 0.24, 2.12, 7.74, 0, 0.008), "#f1efe6"), 0, 0.2));
      t.glows.push([2.12, 7.66, 0]);
      break;
    }
    case "bench": {
      // A city bench: hardwood slats on cast frames, with armrests.
      for (let k = 0; k < 4; k++) t.solid.push(TIMBER(slab(1.8, 0.035, 0.085, 0, 0.44, 0.16 - k * 0.105)));
      for (let k = 0; k < 3; k++) t.solid.push(TIMBER(slab(1.8, 0.085, 0.032, 0, 0.56 + k * 0.12, -0.24 - k * 0.02, 0.012).rotateX(0)));
      for (const sx of [-0.78, 0.78]) {
        t.solid.push(STEEL(tube([[sx, 0, 0.22], [sx, 0.42, 0.18], [sx, 0.44, -0.2], [sx, 0.9, -0.3]], 0.025, 6, 10), "#2a2d31"));
        t.solid.push(STEEL(tube([[sx, 0, -0.2], [sx, 0.42, -0.18]], 0.025, 6, 2), "#2a2d31"));
        t.solid.push(STEEL(tube([[sx, 0.44, 0.2], [sx, 0.66, 0.18], [sx, 0.66, -0.14]], 0.02, 6, 8), "#2a2d31"));
      }
      break;
    }
    case "busstop": {
      // A glass shelter: a slim frame, a glass back and end, a curved roof, a perch seat and a
      // lit poster case at one end.
      for (const x of [-1.95, 0, 1.95]) t.solid.push(STEEL(slab(0.07, 2.55, 0.07, x, 0, -0.75, 0.02), "#4a4f55"));
      t.solid.push(STEEL(slab(0.07, 2.55, 0.07, -1.95, 0, 0.55, 0.02), "#4a4f55"));
      const roof = new THREE.CylinderGeometry(4.2, 4.2, 4.1, 24, 1, true, -0.2, 0.4).rotateZ(Math.PI / 2).translate(0, -1.6, -0.1);
      t.solid.push(STEEL(roof, "#3a3f45"));
      t.solid.push(GLASS(slab(3.8, 2.1, 0.02, 0, 0.35, -0.75, 0.005)));
      t.solid.push(GLASS(slab(0.02, 2.1, 1.2, -1.95, 0.35, -0.1, 0.005)));
      t.solid.push(STEEL(slab(3.9, 0.06, 0.06, 0, 2.48, -0.75, 0.02), "#4a4f55"));
      t.solid.push(STEEL(slab(2.4, 0.06, 0.32, 0.2, 0.62, -0.55, 0.02), "#6f747a"));
      t.solid.push(PAINTED(slab(1.25, 1.85, 0.16, 2.6, 0.3, -0.6, 0.03), "#2f3338"));
      t.solid.push(surface(paint(slab(1.08, 1.6, 0.02, 2.6, 0.42, -0.51, 0.005), "#f4e7c6"), 0, 0.15));
      break;
    }
    case "umbrella": {
      t.solid.push(cyl(0.03, 0.03, 2.3, "#e8e8e6"));
      const cone = paint(new THREE.ConeGeometry(1.4, 0.5, 10, 1, true).toNonIndexed().translate(0, 2.35, 0), color);
      t.solid.push(cone);
      // A towel under it.
      t.solid.push(box(0.8, 0.02, 1.8, color === "#f6f1e7" ? "#4b8fd6" : "#f6f1e7", 1.2, 0, 0));
      break;
    }
    case "lifeguard": {
      for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) t.solid.push(box(0.16, 2.2, 0.16, "#e8e2d0", x, 0, z));
      t.solid.push(box(2.8, 0.15, 2.8, "#e8e2d0", 0, 2.2), box(2.4, 1.8, 2.4, color, 0, 2.35), box(3, 0.2, 3, "#f6f1e7", 0, 4.15), box(1, 0.08, 3.4, "#e8e2d0", 2.6, 1.1, 0, 0));
      t.solid.push(box(2.4, 0.9, 0.05, "#2b2f36", 0, 3.1, -1.21));
      break;
    }
    case "volley":
      t.solid.push(cyl(0.05, 0.05, 2.5, "#e8e8e6", 0, 0, -4.5), cyl(0.05, 0.05, 2.5, "#e8e8e6", 0, 0, 4.5), box(0.03, 0.9, 9, "#f6f1e7", 0, 1.55));
      break;
    case "container": {
      for (let k = 0; k < s; k++) t.solid.push(box(2.44, 2.59, 12.2, color, 0, k * 2.6, 0));
      break;
    }
    case "crane": {
      const c = "#d4ac0d";
      for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) t.solid.push(box(0.9, 34, 0.9, c, x, 0, z));
      t.solid.push(box(14, 1.4, 1.4, c, 0, 30, -6), box(14, 1.4, 1.4, c, 0, 30, 6), box(1.4, 1.4, 14, c, -6, 30, 0), box(1.4, 1.4, 14, c, 6, 30, 0));
      // The boom out over the water (south), the back stay inland, the cab.
      t.solid.push(box(3, 2, 62, c, 0, 34, 16), box(5, 4, 5, "#2b2f36", 0, 30, 20), box(0.5, 10, 0.5, c, -1.3, 35, -6), box(0.5, 10, 0.5, c, 1.3, 35, -6));
      break;
    }
    case "pump":
      // A fuel dispenser: a white cabinet, a coloured crown, a screen, hoses on their hooks, a kerb island.
      t.solid.push(CONC(slab(1.6, 0.18, 1.0, 0, 0, 0, 0.05), "#c9c3b6"));
      t.solid.push(PAINTED(slab(1.0, 1.7, 0.55, 0, 0.18, 0, 0.06), "#eceae4"), PAINTED(slab(1.04, 0.34, 0.6, 0, 1.6, 0, 0.06), "#e14b6a"));
      t.solid.push(surface(paint(slab(0.42, 0.3, 0.02, 0, 1.15, 0.28, 0.01), "#10161c"), 0.2, 0.08));
      for (const sx of [-0.36, 0.36]) {
        t.solid.push(PAINTED(slab(0.12, 0.22, 0.08, sx, 0.9, 0.3, 0.02), "#2b2f36"));
        t.solid.push(paint(tube([[sx, 1.1, 0.31], [sx * 1.4, 0.7, 0.42], [sx * 1.25, 0.5, 0.36]], 0.018, 5, 8), "#141414"));
      }
      break;
    case "canopy":
      t.solid.push(box(16, 0.8, 10, "#e8e8e6", 0, 5.2), box(16.1, 0.3, 10.1, "#e14b6a", 0, 5.2));
      for (const dx of [-5, 5]) t.solid.push(box(0.5, 5.2, 0.5, "#cfd3d8", dx, 0, 0));
      t.glows.push([-4, 5, 0], [4, 5, 0]);
      break;
    case "pool": {
      const w = 4 * s;
      const l = 8 * s;
      t.solid.push(box(w + 1.2, 0.12, l + 1.2, "#e9e2d0", 0, 0.0), box(w + 3, 0.04, l + 3, "#d8cfbf", 0, -0.02));
      const g = new THREE.PlaneGeometry(w, l).toNonIndexed();
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0.14, 0);
      t.water.push(paint(g, "#ffffff"));
      break;
    }
    case "yacht": {
      const L = 16 * s;
      const hull = new THREE.CylinderGeometry(1.8 * s, 1.2 * s, L, 10, 1).toNonIndexed();
      hull.rotateZ(Math.PI / 2);
      hull.scale(1, 0.55, 1);
      hull.translate(0, 0.6, 0);
      t.solid.push(paint(hull, "#f6f6f2"));
      t.solid.push(box(L * 0.45, 1.6 * s, 2.4 * s, "#f6f6f2", -L * 0.05, 1.2), box(L * 0.3, 1.2 * s, 2.0 * s, "#1c2a44", -L * 0.08, 2.8), box(L * 0.2, 0.1, 2.6 * s, "#8a6a48", L * 0.3, 1.25));
      break;
    }
    case "billboard":
      t.solid.push(box(0.4, 8, 0.4, "#3a3f47", -3, 0, 0), box(0.4, 8, 0.4, "#3a3f47", 3, 0, 0), box(10.4, 5.4, 0.3, "#2b2f36", 0, 6, -0.25));
      break;
    case "fountain":
      t.solid.push(cyl(4.6 * s, 4.6 * s, 0.6, "#d8cfbf", 0, 0, 0, 20), cyl(0.5, 0.7, 2.2, "#d8cfbf"), cyl(1.4, 1.4, 0.2, "#d8cfbf", 0, 1.6, 0, 12));
      {
        const g = new THREE.CircleGeometry(4.2 * s, 20).toNonIndexed();
        g.rotateX(-Math.PI / 2);
        g.translate(0, 0.5, 0);
        t.water.push(paint(g, "#ffffff"));
      }
      break;
    case "dumpster": {
      // A steel skip: tapered sides with ribs, a split plastic lid, castors.
      const g = new THREE.CylinderGeometry(0.72, 0.62, 1.05, 4, 1).rotateY(Math.PI / 4).scale(1.75, 1, 1).translate(0, 0.62, 0);
      t.solid.push(STEEL(g, "#2f5a3a"));
      for (const x of [-0.6, 0, 0.6]) t.solid.push(STEEL(slab(0.06, 0.95, 1.12, x, 0.12, 0, 0.02), "#284e32"));
      t.solid.push(surface(paint(slab(0.9, 0.06, 1.12, -0.46, 1.14, 0, 0.02).rotateZ(0.04), "#1d2a22"), 0, 0.6), surface(paint(slab(0.9, 0.06, 1.12, 0.46, 1.14, 0, 0.02).rotateZ(-0.04), "#1d2a22"), 0, 0.6));
      for (const [x, z] of [[-0.7, -0.38], [0.7, -0.38], [-0.7, 0.38], [0.7, 0.38]]) t.solid.push(paint(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10).rotateX(Math.PI / 2).translate(x, 0.07, z), "#141414"));
      break;
    }
    case "planter":
      // A precast concrete planter with a clipped shrub.
      t.solid.push(CONC(turned([[0.001, 0], [0.5, 0], [0.62, 0.55], [0.66, 0.6], [0.6, 0.62], [0.001, 0.62]], 8)));
      t.solid.push(clump(0.55, 0, 0.95, 0, "#3e6a2a", 2.1));
      break;
    case "fence":
      // A pool-style fence: square posts, top and bottom rails and pickets.
      for (const x of [-2, 2]) t.solid.push(STEEL(slab(0.06, 1.25, 0.06, x, 0, 0, 0.01), "#2b2f36"));
      for (const y of [0.1, 1.12]) t.solid.push(STEEL(slab(4, 0.04, 0.04, 0, y, 0, 0.01), "#2b2f36"));
      for (let k = 0; k < 36; k++) t.solid.push(STEEL(new THREE.BoxGeometry(0.018, 1.0, 0.018).translate(-1.94 + k * 0.111, 0.62, 0), "#2b2f36"));
      break;
  }
  cache.set(key, t);
  return t;
}

/* ------------------------------------------------------------------ vehicles the kit doesn't have */

export interface CustomVehicle {
  group: THREE.Group;
  paint: THREE.MeshStandardMaterial;
  wheels: THREE.Object3D[];
  rotor?: THREE.Object3D;
  tail?: THREE.Object3D;
  fan?: THREE.Object3D;
  spot?: THREE.Mesh;
  heads: THREE.Mesh[];
}

const dark = new THREE.MeshStandardMaterial({ color: "#16181c", roughness: 0.6, metalness: 0.3 });
const chrome = new THREE.MeshStandardMaterial({ color: "#c9ced6", roughness: 0.2, metalness: 0.9 });
const glass = new THREE.MeshStandardMaterial({ color: "#1d2a36", roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.75 });
const white = new THREE.MeshStandardMaterial({ color: "#f2f2ee", roughness: 0.35 });
const lamp = new THREE.MeshStandardMaterial({ color: "#fff6dd", emissive: "#fff2c8", emissiveIntensity: 1.2 });

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

/** A sports bike: along +x, seat at about 0.85 m. */
export function buildBike(color: string): CustomVehicle {
  const g = new THREE.Group();
  const p = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.4 });
  const wheel = () => {
    const w = new THREE.Group();
    const tyre = mesh(new THREE.TorusGeometry(0.3, 0.09, 8, 18), dark);
    w.add(tyre);
    w.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12).rotateX(Math.PI / 2), chrome));
    return w;
  };
  const fw = wheel();
  fw.position.set(0.72, 0.38, 0);
  const rw = wheel();
  rw.position.set(-0.68, 0.38, 0);
  g.add(fw, rw);
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.42, 0.34), p, 0, 0.72, 0));
  g.add(mesh(new THREE.BoxGeometry(0.55, 0.32, 0.4), p, 0.5, 0.92, 0).rotateZ(-0.35));
  g.add(mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), dark, -0.25, 0.98, 0));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), p, -0.6, 0.9, 0).rotateZ(0.25));
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75), chrome, 0.62, 0.92, 0).rotateZ(0.35));
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.04, 0.7), dark, 0.68, 1.15, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6).rotateZ(Math.PI / 2), chrome, -0.5, 0.5, 0.18));
  const head = mesh(new THREE.BoxGeometry(0.08, 0.1, 0.16), lamp, 0.82, 1.0, 0);
  g.add(head);
  return { group: g, paint: p, wheels: [fw, rw], heads: [head] };
}

/** A speedboat: deep-V hull, a windscreen, an outboard. Along +x, sits at the waterline. */
export function buildBoat(color: string, air = false): CustomVehicle {
  const g = new THREE.Group();
  const p = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.1 });
  const L = air ? 4.6 : 7;
  const W = air ? 2.2 : 2.4;
  // Hull: a tapered box with a pointed bow.
  const shape = new THREE.Shape();
  shape.moveTo(-L / 2, -W / 2);
  shape.lineTo(L / 2 - 1.6, -W / 2);
  shape.quadraticCurveTo(L / 2, -W * 0.15, L / 2, 0);
  shape.quadraticCurveTo(L / 2, W * 0.15, L / 2 - 1.6, W / 2);
  shape.lineTo(-L / 2, W / 2);
  shape.lineTo(-L / 2, -W / 2);
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: air ? 0.6 : 1.0, bevelEnabled: false });
  hullGeo.rotateX(-Math.PI / 2);
  const hull = mesh(hullGeo, air ? new THREE.MeshStandardMaterial({ color: "#5b6b4a", roughness: 0.6 }) : white, 0, -0.35, 0);
  g.add(hull);
  g.add(mesh(new THREE.BoxGeometry(L * 0.9, 0.12, W * 0.92), p, -0.2, air ? 0.3 : 0.68, 0));
  if (air) {
    // A big fan in a cage at the back, a raised seat.
    const cage = mesh(new THREE.TorusGeometry(1.0, 0.05, 6, 20).rotateY(Math.PI / 2), chrome, -1.8, 1.4, 0);
    g.add(cage);
    const fan = new THREE.Group();
    fan.position.set(-1.75, 1.4, 0);
    for (let k = 0; k < 2; k++) fan.add(mesh(new THREE.BoxGeometry(0.05, 1.8, 0.16).rotateX((k * Math.PI) / 2), dark));
    g.add(fan);
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.9, 0.6), dark, -0.8, 0.6, 0));
    return { group: g, paint: p, wheels: [], fan, heads: [] };
  }
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.5, W * 0.8).rotateZ(0.5), glass, 0.9, 0.95, 0));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.4, 0.9), white, -0.3, 0.8, -0.4), mesh(new THREE.BoxGeometry(0.9, 0.4, 0.9), white, -0.3, 0.8, 0.45));
  g.add(mesh(new THREE.BoxGeometry(0.4, 1.0, 0.4), dark, -L / 2 - 0.1, 0.1, 0));
  const head = mesh(new THREE.BoxGeometry(0.1, 0.1, 0.2), lamp, L / 2 - 0.4, 0.8, 0);
  g.add(head);
  return { group: g, paint: p, wheels: [], heads: [head] };
}

/** The police helicopter: a body, tail boom, skids, rotors and a searchlight. Along +x. */
export function buildHeli(): CustomVehicle {
  const g = new THREE.Group();
  const p = new THREE.MeshStandardMaterial({ color: "#1b2a44", roughness: 0.35, metalness: 0.3 });
  const body = mesh(new THREE.SphereGeometry(1.4, 16, 12).scale(1.6, 1, 1), p, 0, 1.4, 0);
  g.add(body);
  g.add(mesh(new THREE.SphereGeometry(1.1, 12, 10).scale(1.3, 0.85, 0.95), glass, 1.1, 1.55, 0));
  g.add(mesh(new THREE.BoxGeometry(5.5, 0.45, 0.4), p, -3.6, 1.7, 0));
  g.add(mesh(new THREE.BoxGeometry(0.9, 1.2, 0.12), p, -6.2, 2.2, 0));
  g.add(mesh(new THREE.BoxGeometry(3.2, 0.1, 0.4), white, 0.1, 1.95, 0.0));
  for (const z of [-0.95, 0.95]) {
    g.add(mesh(new THREE.BoxGeometry(3.4, 0.08, 0.1), dark, 0, 0.12, z));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), dark, 0.8, 0.45, z), mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), dark, -0.8, 0.45, z));
  }
  const rotor = new THREE.Group();
  rotor.position.set(0, 2.75, 0);
  for (let k = 0; k < 4; k++) rotor.add(mesh(new THREE.BoxGeometry(10.5, 0.05, 0.32).rotateY((k * Math.PI) / 4), dark));
  rotor.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4), dark));
  g.add(rotor);
  const tail = new THREE.Group();
  tail.position.set(-6.2, 2.2, 0.2);
  for (let k = 0; k < 2; k++) tail.add(mesh(new THREE.BoxGeometry(0.06, 1.6, 0.16).rotateX((k * Math.PI) / 2), dark));
  g.add(tail);
  // A searchlight cone, seen at night.
  const coneGeo = new THREE.ConeGeometry(9, 42, 24, 1, true);
  coneGeo.translate(0, -21, 0);
  const spot = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: "#fff6d8", transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  spot.position.set(1.6, 0.6, 0);
  spot.visible = false;
  g.add(spot);
  // Police markings.
  g.add(mesh(new THREE.BoxGeometry(2.2, 0.3, 0.02), white, -0.4, 1.3, 1.36), mesh(new THREE.BoxGeometry(2.2, 0.3, 0.02), white, -0.4, 1.3, -1.36));
  return { group: g, paint: p, wheels: [], rotor, tail, spot, heads: [] };
}

/* ------------------------------------------------------------------ guns in hand */

const gunMat = new THREE.MeshStandardMaterial({ color: "#1b1c1f", roughness: 0.45, metalness: 0.7 });
const woodMat = new THREE.MeshStandardMaterial({ color: "#6b4a2e", roughness: 0.7 });

/** A weapon model to hang off a hand bone (pointing down the forearm, along −y). */
export function weaponModel(kind: "smg" | "shotgun" | "rifle" | "bat" | "grenade") {
  const g = new THREE.Group();
  switch (kind) {
    case "smg":
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.42, 0.07), gunMat, 0, -0.18, 0.02), mesh(new THREE.BoxGeometry(0.04, 0.16, 0.05), gunMat, 0, -0.06, 0.08));
      break;
    case "shotgun":
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.9, 0.06), gunMat, 0, -0.32, 0.02), mesh(new THREE.BoxGeometry(0.06, 0.3, 0.08), woodMat, 0, 0.1, 0.03));
      break;
    case "rifle":
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.85, 0.07), gunMat, 0, -0.28, 0.02), mesh(new THREE.BoxGeometry(0.05, 0.16, 0.1), gunMat, 0, -0.08, 0.08), mesh(new THREE.BoxGeometry(0.06, 0.26, 0.08), gunMat, 0, 0.14, 0.03));
      break;
    case "bat":
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.022, 0.85, 8), woodMat, 0, -0.38, 0));
      break;
    case "grenade":
      g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: "#3d4530", roughness: 0.6 }), 0, -0.06, 0));
      break;
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}
