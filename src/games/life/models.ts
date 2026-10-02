import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { canvasTexture, noise2 } from "../sports-kit/pipeline";
import { concreteTexture, woodFloorTexture } from "../neon-siege/three/textures";
import { furnitureDef, itemRect, WALL_H, WALL_T, type Build, type FloorMat, type FurnitureType } from "./world";

/**
 * Life's models: furniture built from shaped parts, and whole houses from a
 * Build (walls cut around doors and windows, floors, glass, a hip roof).
 * Each house is merged into a handful of meshes (one per material, colours
 * as vertex colours) so a street of furnished houses is cheap to draw.
 */

interface Part {
  geo: THREE.BufferGeometry;
  color: string;
  /** Goes in the glass mesh instead. */
  glass?: boolean;
  /** Shiny (metal / gloss) parts. */
  gloss?: boolean;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, o: Partial<Part> = {}): Part => ({ geo: new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), color, ...o });
const cyl = (r: number, h: number, x: number, y: number, z: number, color: string, seg = 12, o: Partial<Part> = {}): Part => ({ geo: new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z), color, ...o });
const ball = (r: number, x: number, y: number, z: number, color: string, o: Partial<Part> = {}): Part => ({ geo: new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), color, ...o });
/** A rounded slab (cushions, mattresses). */
const soft = (w: number, h: number, d: number, x: number, y: number, z: number, color: string): Part => {
  const g = new THREE.BoxGeometry(w, h, d, 4, 2, 4);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = Math.max(Math.abs(v.x) / (w / 2), Math.abs(v.z) / (d / 2));
    if (v.y > 0) v.y -= Math.pow(k, 4) * h * 0.25;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return { geo: g.translate(x, y + h / 2, z), color };
};
const legs = (w: number, d: number, h: number, color: string, r = 0.025) =>
  [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].map(([sx, sz]) => cyl(r, h, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), color, 8));

const BOOKS = ["#7f1d1d", "#1e3a8a", "#166534", "#a16207", "#4c1d95", "#0f766e", "#9a3412", "#334155"];

/** Parts for a piece of furniture, centred on the origin, front facing +z. */
export function furnitureParts(type: FurnitureType): Part[] {
  const f = furnitureDef(type);
  const { w, d, h } = f;
  const steel = "#9ca3af";
  const wood = "#8b5a2b";
  switch (type) {
    case "fridge":
      return [box(w, h, d, 0, 0, 0, "#e5e7eb", { gloss: true }), box(w - 0.02, 0.01, 0.02, 0, h * 0.62, d / 2, "#9ca3af"), box(0.03, 0.4, 0.04, w / 2 - 0.1, h * 0.7, d / 2 + 0.02, steel, { gloss: true }), box(0.03, 0.5, 0.04, w / 2 - 0.1, h * 0.25, d / 2 + 0.02, steel, { gloss: true })];
    case "stove":
      return [
        box(w, h - 0.03, d, 0, 0, 0, "#d4d4d8", { gloss: true }),
        box(w, 0.03, d, 0, h - 0.03, 0, "#111111", { gloss: true }),
        ...[-1, 1].flatMap((a) => [-1, 1].map((b) => cyl(0.09, 0.012, a * w * 0.25, h, b * d * 0.22, "#27272a", 16))),
        box(w * 0.8, 0.35, 0.02, 0, 0.3, d / 2, "#18181b", { glass: true }),
      ];
    case "counter":
      return [box(w, h - 0.04, d - 0.04, 0, 0, -0.02, "#f5f5f4"), box(w, 0.04, d, 0, h - 0.04, 0, "#57534e", { gloss: true }), box(0.15, 0.02, 0.02, -w / 4, h - 0.2, d / 2 - 0.02, steel), box(0.15, 0.02, 0.02, w / 4, h - 0.2, d / 2 - 0.02, steel)];
    case "sinkK":
      return [box(w, h - 0.04, d - 0.04, 0, 0, -0.02, "#f5f5f4"), box(w, 0.04, d, 0, h - 0.04, 0, "#57534e", { gloss: true }), box(w * 0.55, 0.02, d * 0.55, 0, h - 0.01, 0, "#a1a1aa", { gloss: true }), cyl(0.015, 0.3, 0, h, -d / 2 + 0.08, steel, 8, { gloss: true }), box(0.03, 0.03, 0.2, 0, h + 0.28, -d / 2 + 0.17, steel, { gloss: true })];
    case "table":
      return [box(w, 0.04, d, 0, h - 0.04, 0, wood), ...legs(w, d, h - 0.04, "#5b3a1e")];
    case "chair":
      return [box(w, 0.05, d, 0, 0.45, 0, "#6b4423"), ...legs(w, d, 0.45, "#4a2f17", 0.02), box(w, 0.45, 0.04, 0, 0.5, -d / 2 + 0.02, "#6b4423")];
    case "bed":
    case "single": {
      const sheet = type === "bed" ? "#e2e8f0" : "#bfdbfe";
      return [
        box(w, 0.28, d, 0, 0, 0, "#6b4423"),
        soft(w - 0.06, 0.22, d - 0.08, 0, 0.28, 0.02, "#f8fafc"),
        soft(w - 0.02, 0.06, d * 0.62, 0, 0.47, d * 0.18, sheet),
        ...(type === "bed" ? [-1, 1].map((s) => soft(w * 0.4, 0.12, 0.38, s * w * 0.23, 0.48, -d / 2 + 0.3, "#ffffff")) : [soft(w * 0.7, 0.12, 0.36, 0, 0.48, -d / 2 + 0.3, "#ffffff")]),
        box(w + 0.04, 1.0, 0.08, 0, 0, -d / 2 - 0.02, "#5b3a1e"),
      ];
    }
    case "wardrobe":
      return [box(w, h, d, 0, 0, 0, "#a16207"), box(0.01, h - 0.1, 0.01, 0, 0.05, d / 2, "#3f2a10"), box(0.03, 0.25, 0.03, -0.08, h * 0.5, d / 2 + 0.02, steel, { gloss: true }), box(0.03, 0.25, 0.03, 0.08, h * 0.5, d / 2 + 0.02, steel, { gloss: true })];
    case "nightstand":
      return [box(w, h, d, 0, 0, 0, "#a16207"), cyl(0.06, 0.04, 0.1, h, 0, "#d4d4d8"), cyl(0.012, 0.25, 0.1, h + 0.04, 0, "#d4d4d8"), { geo: new THREE.CylinderGeometry(0.07, 0.1, 0.14, 14, 1, true).translate(0.1, h + 0.32, 0), color: "#fef3c7" }];
    case "shower":
      return [box(w, 0.06, d, 0, 0, 0, "#f8fafc"), box(0.02, 2, d, w / 2, 0.06, 0, "#bae6fd", { glass: true }), box(w, 2, 0.02, 0, 0.06, d / 2, "#bae6fd", { glass: true }), cyl(0.012, 1.9, -w / 2 + 0.1, 0.06, -d / 2 + 0.06, steel, 8, { gloss: true }), cyl(0.08, 0.02, -w / 2 + 0.2, 1.95, -d / 2 + 0.15, steel, 16, { gloss: true })];
    case "bath":
      return [box(w, h, d, 0, 0, 0, "#f8fafc", { gloss: true }), box(w - 0.14, 0.02, d - 0.14, 0, h - 0.12, 0, "#7dd3fc", { gloss: true }), cyl(0.015, 0.2, -w / 2 + 0.1, h, 0, steel, 8, { gloss: true })];
    case "toilet":
      return [cyl(0.16, 0.38, 0, 0, 0.08, "#f8fafc", 16, { gloss: true }), { geo: new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1.2).translate(0, 0.4, 0.08), color: "#f8fafc", gloss: true }, box(0.4, 0.4, 0.18, 0, 0.38, -d / 2 + 0.09, "#f8fafc", { gloss: true })];
    case "basin":
      return [cyl(0.08, 0.75, 0, 0, 0, "#f8fafc", 12, { gloss: true }), box(w, 0.15, d, 0, 0.75, 0, "#f8fafc", { gloss: true }), cyl(0.012, 0.15, 0, 0.9, -d / 2 + 0.06, steel, 8, { gloss: true }), box(w * 0.8, 0.6, 0.02, 0, 1.15, -d / 2, "#cbd5e1", { glass: true })];
    case "sofa": {
      const c = "#475569";
      return [box(w, 0.2, d, 0, 0.08, 0, "#1f2937"), soft(w - 0.3, 0.22, d - 0.25, 0, 0.28, 0.1, c), box(w, 0.5, 0.22, 0, 0.28, -d / 2 + 0.11, c), box(0.18, 0.35, d, -w / 2 + 0.09, 0.28, 0, c), box(0.18, 0.35, d, w / 2 - 0.09, 0.28, 0, c), ...[-1, 1].map((s) => soft(0.4, 0.14, 0.14, s * w * 0.3, 0.55, -d / 2 + 0.3, "#94a3b8"))];
    }
    case "tv":
      return [box(w, 0.5, 0.42, 0, 0, 0, "#3f2a10"), box(w - 0.1, 0.72, 0.05, 0, 0.55, -0.1, "#0a0a0a", { gloss: true }), box(w - 0.16, 0.66, 0.01, 0, 0.58, -0.07, "#1e293b", { glass: true })];
    case "armchair": {
      const c = "#7c2d12";
      return [box(w, 0.3, d, 0, 0.05, 0, c), soft(w - 0.3, 0.15, d - 0.2, 0, 0.35, 0.08, "#9a3412"), box(w, 0.5, 0.18, 0, 0.35, -d / 2 + 0.09, c), box(0.15, 0.3, d, -w / 2 + 0.075, 0.35, 0, c), box(0.15, 0.3, d, w / 2 - 0.075, 0.35, 0, c)];
    }
    case "rug":
      return [box(w, 0.015, d, 0, 0.005, 0, "#9a3412"), box(w - 0.3, 0.017, d - 0.3, 0, 0.005, 0, "#c2410c")];
    case "bookshelf": {
      const parts: Part[] = [box(w, h, 0.03, 0, 0, -d / 2 + 0.015, "#5b3a1e"), box(0.03, h, d, -w / 2 + 0.015, 0, 0, "#78350f"), box(0.03, h, d, w / 2 - 0.015, 0, 0, "#78350f")];
      for (let s = 0; s < 5; s++) {
        const y = 0.05 + s * 0.38;
        parts.push(box(w - 0.06, 0.025, d, 0, y, 0, "#78350f"));
        let x = -w / 2 + 0.06;
        for (let k = 0; x < w / 2 - 0.08; k++) {
          const bw = 0.03 + ((s * 7 + k * 3) % 4) * 0.012;
          parts.push(box(bw, 0.22 + ((s + k) % 3) * 0.04, d * 0.7, x + bw / 2, y + 0.025, 0.02, BOOKS[(s * 3 + k) % BOOKS.length]));
          x += bw + 0.004;
        }
      }
      return parts;
    }
    case "desk":
      return [box(w, 0.04, d, 0, 0.72, 0, "#e7e5e4"), ...legs(w, d, 0.72, "#334155"), box(0.6, 0.36, 0.03, 0, 0.92, -d / 2 + 0.15, "#0a0a0a", { gloss: true }), box(0.56, 0.32, 0.01, 0, 0.94, -d / 2 + 0.17, "#1e3a8a", { glass: true }), box(0.05, 0.18, 0.05, 0, 0.76, -d / 2 + 0.15, "#27272a"), box(0.42, 0.02, 0.14, 0, 0.76, 0.1, "#27272a")];
    case "lamp":
      return [cyl(0.15, 0.03, 0, 0, 0, "#27272a"), cyl(0.015, 1.35, 0, 0.03, 0, "#27272a", 8), { geo: new THREE.CylinderGeometry(0.14, 0.2, 0.26, 18, 1, true).translate(0, 1.45, 0), color: "#fef3c7" }];
    case "plant":
      return [{ geo: new THREE.CylinderGeometry(0.18, 0.13, 0.32, 14).translate(0, 0.16, 0), color: "#9a3412" }, ...[0, 1, 2, 3, 4].map((k) => ball(0.2 + (k % 2) * 0.05, Math.cos(k * 1.3) * 0.12, 0.55 + k * 0.1, Math.sin(k * 1.3) * 0.12, k % 2 ? "#166534" : "#15803d"))];
    case "piano":
      return [box(w, 1.2, 0.35, 0, 0, -d / 2 + 0.175, "#0c0a09", { gloss: true }), box(w, 0.06, 0.25, 0, 0.72, 0.1, "#0c0a09", { gloss: true }), box(w - 0.1, 0.02, 0.15, 0, 0.78, 0.12, "#f8fafc"), ...legs(w, d, 0.72, "#0c0a09")];
    case "bbq":
      return [box(w, 0.4, d, 0, 0.55, 0, "#18181b", { gloss: true }), { geo: new THREE.CylinderGeometry(d / 2, d / 2, w, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0.95, 0), color: "#27272a", gloss: true }, ...legs(w, d, 0.55, "#3f3f46")];
    case "pool":
      return [box(w + 0.6, 0.06, d + 0.6, 0, -0.04, 0, "#d6d3d1"), box(w, 0.03, d, 0, 0.01, 0, "#38bdf8", { glass: true })];
    case "hottub":
      return [box(w, h, d, 0, 0, 0, "#78350f"), box(w - 0.2, 0.02, d - 0.2, 0, h - 0.1, 0, "#0ea5e9", { glass: true })];
  }
  return [box(w, h, d, 0, 0, 0, f.color)];
}

// ----------------------------------------------------------------- floors

const floorTex = new Map<FloorMat, THREE.Texture>();
/** Floor textures (cached). */
export function floorTexture(mat: FloorMat) {
  let t = floorTex.get(mat);
  if (t) return t;
  if (mat === "wood") t = woodFloorTexture(256).map;
  else if (mat === "concrete") t = concreteTexture(256).map;
  else if (mat === "tile")
    t = canvasTexture(
      256,
      256,
      (g) => {
        g.fillStyle = "#d6d3d1";
        g.fillRect(0, 0, 256, 256);
        for (let y = 0; y < 2; y++)
          for (let x = 0; x < 2; x++) {
            const k = (x + y) % 2 ? 236 : 226;
            g.fillStyle = `rgb(${k},${k - 2},${k - 6})`;
            g.fillRect(x * 128 + 3, y * 128 + 3, 122, 122);
          }
      },
      true,
    );
  else if (mat === "marble") {
    const n = noise2(8, 9);
    t = canvasTexture(
      256,
      256,
      (g) => {
        const img = g.createImageData(256, 256);
        for (let i = 0; i < 256 * 256; i++) {
          const x = (i % 256) / 256;
          const y = Math.floor(i / 256) / 256;
          const v = Math.abs(Math.sin((x * 3 + y * 2 + n(x, y) * 3) * Math.PI));
          const k = 232 - Math.pow(1 - v, 8) * 90;
          img.data.set([k, k, k + 3, 255], i * 4);
        }
        g.putImageData(img, 0, 0);
      },
      true,
    );
  } else {
    const n = noise2(32, 4);
    t = canvasTexture(
      128,
      128,
      (g) => {
        const img = g.createImageData(128, 128);
        for (let i = 0; i < 128 * 128; i++) {
          const k = n((i % 128) / 128, Math.floor(i / 128) / 128) * 30 + Math.random() * 18;
          img.data.set([120 + k, 112 + k, 130 + k, 255], i * 4);
        }
        g.putImageData(img, 0, 0);
      },
      true,
    );
  }
  floorTex.set(mat, t!);
  return t!;
}

// ------------------------------------------------------------------ houses

function colorize(g: THREE.BufferGeometry, color: string) {
  const c = new THREE.Color(color);
  const n = (g.attributes.position as THREE.BufferAttribute).count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  // Merging needs matching attributes.
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (g.index) return g.toNonIndexed();
  return g;
}

const mats = {
  wall: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }),
  furn: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 }),
  gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.35 }),
  glass: new THREE.MeshPhysicalMaterial({ color: "#a5c8e0", roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }),
  frame: new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.5 }),
};
const roofMats = new Map<string, THREE.MeshStandardMaterial>();
const floorMats = new Map<FloorMat, THREE.MeshStandardMaterial>();
const floorMat = (m: FloorMat) => {
  let x = floorMats.get(m);
  if (!x) floorMats.set(m, (x = new THREE.MeshStandardMaterial({ map: floorTexture(m), roughness: m === "marble" || m === "tile" ? 0.25 : m === "carpet" ? 0.98 : 0.6 })));
  return x;
};

export interface HouseModel {
  group: THREE.Group;
  roof: THREE.Object3D;
  /** Exterior walls, for cut-away views in build mode. */
  walls: THREE.Mesh;
}

/**
 * A house from a Build, in plot-local coordinates (the caller places and
 * turns the group onto the plot).
 */
export function houseModel(b: Build, lod: "high" | "low" = "high"): HouseModel {
  const group = new THREE.Group();
  const wallGeos: THREE.BufferGeometry[] = [];
  const glassGeos: THREE.BufferGeometry[] = [];
  const frameGeos: THREE.BufferGeometry[] = [];
  const furnGeos: THREE.BufferGeometry[] = [];
  const glossGeos: THREE.BufferGeometry[] = [];
  const add = (list: THREE.BufferGeometry[], g: THREE.BufferGeometry, color: string) => list.push(colorize(g, color));
  // Walls, cut around openings.
  for (const w of b.walls) {
    const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
    const alongX = w.z1 === w.z2;
    const dir = alongX ? Math.sign(w.x2 - w.x1) : Math.sign(w.z2 - w.z1);
    const at = (s: number, y0: number, y1: number, e: number) => {
      const l = e - s;
      if (l <= 0.001 || y1 - y0 <= 0.001) return null;
      const mid = s + l / 2;
      const g = alongX ? new THREE.BoxGeometry(l + (s === 0 || e === len ? WALL_T : 0), y1 - y0, WALL_T) : new THREE.BoxGeometry(WALL_T, y1 - y0, l + (s === 0 || e === len ? WALL_T : 0));
      const cx = alongX ? w.x1 + dir * mid : w.x1;
      const cz = alongX ? w.z1 : w.z1 + dir * mid;
      return g.translate(cx, (y0 + y1) / 2, cz);
    };
    const opens = [...w.open].sort((a, c) => a.at - c.at);
    let s = 0;
    for (const o of opens) {
      const half = o.kind === "door" ? 0.5 : 0.7;
      const g0 = o.at - half;
      const g1 = o.at + half;
      const full = at(s, 0, WALL_H, g0);
      if (full) add(wallGeos, full, w.color);
      if (o.kind === "door") {
        const top = at(g0, 2.15, WALL_H, g1);
        if (top) add(wallGeos, top, w.color);
      } else {
        const below = at(g0, 0, 0.9, g1);
        const above = at(g0, 2.1, WALL_H, g1);
        if (below) add(wallGeos, below, w.color);
        if (above) add(wallGeos, above, w.color);
        glassGeos.push(colorize(alongX ? new THREE.BoxGeometry(g1 - g0, 1.2, 0.02).translate(w.x1 + dir * o.at, 1.5, w.z1) : new THREE.BoxGeometry(0.02, 1.2, g1 - g0).translate(w.x1, 1.5, w.z1 + dir * o.at), "#ffffff"));
        // Window frame: sill and mullion.
        frameGeos.push(colorize(alongX ? new THREE.BoxGeometry(g1 - g0 + 0.1, 0.05, WALL_T + 0.08).translate(w.x1 + dir * o.at, 0.88, w.z1) : new THREE.BoxGeometry(WALL_T + 0.08, 0.05, g1 - g0 + 0.1).translate(w.x1, 0.88, w.z1 + dir * o.at), "#ffffff"));
        frameGeos.push(colorize(alongX ? new THREE.BoxGeometry(0.04, 1.2, WALL_T + 0.02).translate(w.x1 + dir * o.at, 1.5, w.z1) : new THREE.BoxGeometry(WALL_T + 0.02, 1.2, 0.04).translate(w.x1, 1.5, w.z1 + dir * o.at), "#ffffff"));
      }
      s = g1;
    }
    const rest = at(s, 0, WALL_H, len);
    if (rest) add(wallGeos, rest, w.color);
    // Skirting (a darker strip at the base).
  }
  const merged = (list: THREE.BufferGeometry[], m: THREE.Material, cast = true) => {
    if (!list.length) return null;
    const g = mergeGeometries(list)!;
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const walls = merged(wallGeos, mats.wall) ?? new THREE.Mesh();
  merged(frameGeos, mats.frame);
  // Floors, per material.
  const byMat = new Map<FloorMat, THREE.BufferGeometry[]>();
  for (const f of b.floors) {
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(f.x + 0.5, 0.03, f.z + 0.5);
    (byMat.get(f.mat) ?? byMat.set(f.mat, []).get(f.mat)!).push(g);
  }
  for (const [m, list] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(list)!, floorMat(m));
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // Foundation under the floors.
  if (b.floors.length) {
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const f of b.floors) {
      x0 = Math.min(x0, f.x);
      z0 = Math.min(z0, f.z);
      x1 = Math.max(x1, f.x + 1);
      z1 = Math.max(z1, f.z + 1);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.3, 0.2, z1 - z0 + 0.3).translate((x0 + x1) / 2, -0.08, (z0 + z1) / 2), new THREE.MeshStandardMaterial({ color: "#9ca3af", roughness: 0.95 }));
    base.receiveShadow = true;
    group.add(base);
  }
  // Furniture.
  for (const it of b.items) {
    const turn = new THREE.Matrix4().makeRotationY((it.rot * Math.PI) / 2);
    const place = new THREE.Matrix4().makeTranslation(it.x, 0.03, it.z);
    const m = place.multiply(turn);
    for (const p of furnitureParts(it.type)) {
      if (lod === "low" && p.geo.attributes.position.count > 300) p.geo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
      const g = p.geo.applyMatrix4(m);
      if (p.glass) glassGeos.push(colorize(g, p.color));
      else if (p.gloss) add(glossGeos, g, p.color);
      else add(furnGeos, g, p.color);
    }
  }
  merged(furnGeos, mats.furn);
  merged(glossGeos, mats.gloss);
  // Windows, shower screens and screens: one glass mesh.
  merged(glassGeos, mats.glass, false);
  // Roof: a hip roof over the walls' bounding box.
  const roof = new THREE.Group();
  if (b.walls.length) {
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const w of b.walls) {
      x0 = Math.min(x0, w.x1, w.x2);
      z0 = Math.min(z0, w.z1, w.z2);
      x1 = Math.max(x1, w.x1, w.x2);
      z1 = Math.max(z1, w.z1, w.z2);
    }
    const W = x1 - x0 + 0.8;
    const D = z1 - z0 + 0.8;
    const rise = Math.min(W, D) * 0.28;
    let mat = roofMats.get(b.roof);
    if (!mat) {
      const base = new THREE.Color(b.roof);
      const tex = canvasTexture(
        256,
        256,
        (g) => {
          for (let y = 0; y < 16; y++)
            for (let x = 0; x < 9; x++) {
              const k = 0.85 + ((x * 7 + y * 13) % 10) / 40;
              g.fillStyle = `#${base.clone().multiplyScalar(k).getHexString()}`;
              g.fillRect(x * 32 - (y % 2) * 16, y * 16, 31, 15);
            }
        },
        true,
      );
      tex.repeat.set(4, 4);
      roofMats.set(b.roof, (mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide })));
    }
    // A hip roof: four sloped faces to a ridge.
    const ridge = Math.max(0, W - D) / 2;
    const ridgeZ = Math.max(0, D - W) / 2;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const y = WALL_H;
    const P = (x: number, yy: number, z: number) => new THREE.Vector3(cx + x, yy, cz + z);
    const a = P(-W / 2, y, -D / 2);
    const bb = P(W / 2, y, -D / 2);
    const c = P(W / 2, y, D / 2);
    const d = P(-W / 2, y, D / 2);
    const r1 = P(-ridge, y + rise, -ridgeZ);
    const r2 = P(ridge, y + rise, ridgeZ);
    const tris = [
      [a, bb, ridge ? P(ridge, y + rise, 0) : r2, r1],
      [bb, c, r2],
      [c, d, ridge ? P(-ridge, y + rise, 0) : r1, r2],
      [d, a, r1],
    ];
    const pos: number[] = [];
    const uv: number[] = [];
    for (const poly of tris) {
      for (let i = 1; i < poly.length - 1; i++)
        for (const v of [poly[0], poly[i], poly[i + 1]]) {
          pos.push(v.x, v.y, v.z);
          uv.push(v.x / 4, v.z / 4 + v.y / 3);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true;
    roof.add(mesh);
    // Eaves / ceiling slab.
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, D).translate(cx, y + 0.06, cz), new THREE.MeshStandardMaterial({ color: "#f5f5f4", roughness: 0.9 }));
    slab.castShadow = true;
    roof.add(slab);
  }
  group.add(roof);
  return { group, roof, walls };
}

/** A single furniture model (for build-mode ghosts and shop previews). */
export function furnitureModel(type: FurnitureType, ghost = false) {
  const g = new THREE.Group();
  for (const p of furnitureParts(type)) {
    const m = ghost ? new THREE.MeshBasicMaterial({ color: "#4ade80", transparent: true, opacity: 0.5, depthWrite: false }) : new THREE.MeshStandardMaterial({ color: p.color, roughness: p.gloss ? 0.25 : 0.65, metalness: p.gloss ? 0.3 : 0, transparent: !!p.glass, opacity: p.glass ? 0.4 : 1 });
    const mesh = new THREE.Mesh(p.geo, m);
    mesh.castShadow = !ghost;
    g.add(mesh);
  }
  return g;
}

export { itemRect };
