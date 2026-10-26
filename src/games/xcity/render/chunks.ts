import * as THREE from "three";
import { facadeMaterial } from "@/games/heatwave/render/facade";
import { LOT_D, LOT_W, MAP_HALF, STYLES } from "../data";
import { pointInPoly, rng } from "../geom";
import { inWater, nearestEdge, riverDist, roadHalf } from "../roads";
import { ix, type Building, type State } from "../state";
import { addGeo, color, craneGeometry, FacadeSheet, gable, MATS, obox, oflat, place, scaffoldMaterial, Sheet, treeGeometry, treeMaterial, unitBox, type TreeKind } from "./kit";

/**
 * Buildings and the trees around them, in 200 m chunks. Each chunk merges its walls into one
 * facade mesh (windows, brick and render drawn per pixel by the facade shader), its roofs and
 * props into another, its trees into instanced meshes, and adds scaffolding and cranes where
 * something is going up. Chunks rebuild only when what's in them changes.
 */

export const CHUNK = 200;
const NC = Math.ceil((MAP_HALF * 2) / CHUNK);

export const chunkOf = (x: number, z: number) => {
  const i = Math.max(0, Math.min(NC - 1, Math.floor((x + MAP_HALF) / CHUNK)));
  const j = Math.max(0, Math.min(NC - 1, Math.floor((z + MAP_HALF) / CHUNK)));
  return i * NC + j;
};

const ROOF_COLS = ["#4a4f57", "#5b463a", "#8e4a33", "#3f4a44", "#6d6c6a", "#7a5a44"];
const AWNINGS = ["#2f6f4f", "#9c2f2f", "#2d4f86", "#c27b28", "#5b3c7a", "#1f5f6f"];

const tmp = new THREE.Color();

const FLAT_ROOFS = ["#6f6d69", "#77746e", "#666a6d", "#7d786f", "#5f6164"];
/** A flat roof's colour: tar, gravel or membrane, a little different on each building. */
const flatRoof = (b: Pick<Building, "seed">) => color(FLAT_ROOFS[b.seed % FLAT_ROOFS.length]);

interface TreeSpot {
  kind: TreeKind;
  x: number;
  z: number;
  k: number;
}

interface ChunkOut {
  group: THREE.Group;
  dispose(): void;
}

const craneCache = new Map<string, THREE.BufferGeometry>();
let scaffoldMat: THREE.MeshStandardMaterial | null = null;
const treeGeos: Partial<Record<TreeKind, THREE.BufferGeometry>> = {};
const treeGeo = (k: TreeKind) => (treeGeos[k] ??= treeGeometry(k));

/** Everything in one chunk. */
export function buildChunk(s: State, id: number, quality: "low" | "medium" | "high"): ChunkOut {
  const i = Math.floor(id / NC);
  const j = id % NC;
  const x0 = -MAP_HALF + i * CHUNK;
  const z0 = -MAP_HALF + j * CHUNK;
  const fs = new FacadeSheet();
  const props = new Sheet();
  const roofs = new Sheet();
  const trees: TreeSpot[] = [];
  const sites: Building[] = [];
  for (const b of s.buildings) {
    if (!b || chunkOf(b.x, b.z) !== id) continue;
    if (!b.done) {
      sites.push(b);
      site(b, props);
      continue;
    }
    building(s, b, fs, props, roofs, trees);
  }
  nature(s, x0, z0, trees, quality);
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  if (!fs.empty) {
    const g = fs.geometry();
    const m = new THREE.Mesh(g, facadeMaterial(quality !== "low"));
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.pick = true;
    group.add(m);
    disposables.push(g);
  }
  if (!roofs.empty) {
    const g = roofs.geometry();
    const m = new THREE.Mesh(g, MATS.roof);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.pick = true;
    group.add(m);
    disposables.push(g);
  }
  if (!props.empty) {
    const g = props.geometry();
    const m = new THREE.Mesh(g, MATS.props);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    disposables.push(g);
  }
  // Trees, instanced by kind.
  const byKind = new Map<TreeKind, TreeSpot[]>();
  for (const t of trees) {
    let l = byKind.get(t.kind);
    if (!l) byKind.set(t.kind, (l = []));
    l.push(t);
  }
  for (const [kind, list] of byKind) {
    const im = new THREE.InstancedMesh(treeGeo(kind), treeMaterial, list.length);
    const R = rng(id * 31 + list.length);
    list.forEach((t, k) => {
      im.setMatrixAt(k, place(t.x, 0, t.z, Math.cos(R() * 6.28), Math.sin(R() * 6.28), t.k, t.k * (0.85 + R() * 0.3), t.k));
      im.setColorAt(k, tmp.setRGB(0.82 + R() * 0.3, 0.86 + R() * 0.24, 0.78 + R() * 0.15));
    });
    im.castShadow = quality !== "low";
    im.receiveShadow = true;
    group.add(im);
    disposables.push({ dispose: () => im.dispose() });
  }
  // Scaffolding and cranes on the building sites.
  if (sites.length) {
    scaffoldMat ??= scaffoldMaterial();
    for (const b of sites) {
      const H = heightOf(b) * Math.max(0.12, b.progress);
      const sc = new THREE.Mesh(unitBox, scaffoldMat);
      const w = b.hw * 2 + 1.2;
      const d = b.hd * 2 + 1.2;
      sc.scale.set(w, H + 1.5, d);
      sc.position.set(b.x, (H + 1.5) / 2, b.z);
      sc.rotation.y = -Math.atan2(b.uz, b.ux);
      group.add(sc);
      if (b.storeys >= 4 && b.form !== "house") {
        const full = heightOf(b);
        const h = Math.round((full + 12) / 4) * 4;
        const jib = Math.round(Math.max(24, Math.min(50, b.hw * 2 + 18)) / 4) * 4;
        const key = `${h}|${jib}`;
        let g = craneCache.get(key);
        if (!g) craneCache.set(key, (g = craneGeometry(h, jib)));
        const cr = new THREE.Mesh(g, MATS.props);
        const back = { x: -b.fx * (b.hd + 3), z: -b.fz * (b.hd + 3) };
        cr.position.set(b.x + back.x, 0, b.z + back.z);
        cr.rotation.y = (b.seed % 628) / 100;
        cr.castShadow = true;
        group.add(cr);
      }
    }
  }
  return { group, dispose: () => disposables.forEach((d) => d.dispose()) };
}

/* ------------------------------------------------------------------ buildings */

export function floorHeight(b: Pick<Building, "form" | "use">) {
  return b.form === "office" || b.form === "tower" ? 3.7 : b.form === "workshop" ? 4.5 : b.form === "house" || b.form === "farmhouse" ? 2.9 : 3.15;
}

export function groundHeight(b: Pick<Building, "form" | "use">) {
  return b.use === "shops" || b.use === "mixed" || b.form === "office" || b.form === "tower" ? 4.3 : floorHeight(b);
}

export function heightOf(b: Pick<Building, "form" | "use" | "storeys">) {
  return groundHeight(b) + (b.storeys - 1) * floorHeight(b);
}

function look(fs: FacadeSheet, b: Building, type: number, shop = false) {
  fs.look = { type, floor: floorHeight(b), gf: groundHeight(b), seed: (b.seed % 997) / 97, accent: tmp.set(b.style === "brick" ? "#e9e2d2" : b.style === "glass" ? "#2a3440" : "#3a3a3a").clone(), shop };
}

function building(s: State, b: Building, fs: FacadeSheet, props: Sheet, roofs: Sheet, trees: TreeSpot[]) {
  const R = rng(b.seed);
  const wall = new THREE.Color(b.color);
  const type = STYLES[b.style].wall;
  const H = heightOf(b);
  const { x, z, ux, uz, hw, hd, fx, fz } = b;
  const roofCol = color(ROOF_COLS[b.seed % ROOF_COLS.length]);
  const back = (d: number) => ({ x: x - fx * d, z: z - fz * d });
  switch (b.form) {
    case "house":
    case "farmhouse": {
      look(fs, b, type);
      obox(fs, x, z, ux, uz, hw, hd, 0, H, wall, false);
      // Ridge along the street on a wide house, front to back on a narrow one.
      if (hw >= hd * 0.85) gable(roofs, fs, x, z, ux, uz, hw, hd, H, 2.6 + R() * 0.8, roofCol, wall);
      else gable(roofs, fs, x, z, -uz, ux, hd, hw, H, 2.6 + R() * 0.8, roofCol, wall);
      // A porch on the front, and a chimney.
      const px = x + fx * (hd + 1.1);
      const pz = z + fz * (hd + 1.1);
      obox(props, px, pz, ux, uz, Math.min(hw * 0.6, 3), 1.1, 2.5, 2.7, color("#e8e4da"), true, roofCol, roofs);
      for (const sx of [-1, 1]) addGeo(props, new THREE.CylinderGeometry(0.08, 0.08, 2.5, 5).translate(0, 1.25, 0), color("#f0ece4"), place(px + ux * sx * (Math.min(hw * 0.6, 3) - 0.2) + fx * 0.9, 0, pz + uz * sx * (Math.min(hw * 0.6, 3) - 0.2) + fz * 0.9));
      if (R() < 0.7) obox(props, x + ux * hw * 0.55, z + uz * hw * 0.55, ux, uz, 0.45, 0.45, H, H + 3.4, color("#8a5040"));
      // Trees in the back yard.
      const nt = 1 + Math.floor(R() * 2);
      for (let k = 0; k < nt; k++) {
        const p = back(hd + 6 + R() * 6);
        trees.push({ kind: R() < 0.2 ? "pine" : "round", x: p.x + ux * (R() - 0.5) * 9, z: p.z + uz * (R() - 0.5) * 9, k: 0.7 + R() * 0.45 });
      }
      if (b.form === "farmhouse") {
        // A red barn and a silo behind.
        const bp = back(hd + 14);
        const barnCol = color(R() < 0.7 ? "#8e2f25" : "#7a6a55");
        const bx = bp.x + ux * 3;
        const bz = bp.z + uz * 3;
        obox(props, bx, bz, ux, uz, 6.5, 4.5, 0, 4.2, barnCol, false);
        gable(roofs, props, bx, bz, ux, uz, 6.5, 4.5, 4.2, 3.2, color("#4a4c50"), barnCol, 0.3);
        addGeo(props, new THREE.CylinderGeometry(2.4, 2.4, 11, 14).translate(0, 5.5, 0), color("#c9cdd0"), place(bp.x - ux * 7.5, 0, bp.z - uz * 7.5));
        addGeo(props, new THREE.SphereGeometry(2.4, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 11, 0), color("#a9adb0"), place(bp.x - ux * 7.5, 0, bp.z - uz * 7.5));
        for (let k = 0; k < 4; k++) trees.push({ kind: "tall", x: x + ux * (hw + 4 + k * 5) - fx * 2, z: z + uz * (hw + 4 + k * 5) - fz * 2, k: 0.9 + R() * 0.4 });
      }
      break;
    }
    case "townhouse": {
      const units = Math.max(1, Math.round((hw * 2) / 6.2));
      const uw = hw / units;
      for (let k = 0; k < units; k++) {
        const cx = x + ux * (-hw + uw * (2 * k + 1));
        const cz = z + uz * (-hw + uw * (2 * k + 1));
        const pal = STYLES[b.style].colors;
        const c = new THREE.Color(k === 0 ? b.color : pal[(b.seed + k * 3) % pal.length]);
        look(fs, b, type);
        fs.look.seed += k * 1.7;
        obox(fs, cx, cz, ux, uz, uw - 0.02, hd, 0, H, c, b.storeys > 2, flatRoof(b), roofs);
        if (b.storeys <= 2) gable(roofs, fs, cx, cz, -uz, ux, hd, uw - 0.02, H, 2.4, roofCol, c, 0.2);
        else {
          // A cornice (a band round the top, not a lid) and a stoop.
          obox(props, cx, cz, ux, uz, uw, hd + 0.25, H - 0.35, H + 0.55, color("#e4ddcf"), false);
          obox(props, cx + fx * (hd + 0.8), cz + fz * (hd + 0.8), ux, uz, 0.9, 0.8, 0, 0.9, color("#bdb4a4"));
        }
      }
      if (R() < 0.6) {
        const p = back(hd + 7);
        trees.push({ kind: "round", x: p.x, z: p.z, k: 0.65 + R() * 0.3 });
      }
      break;
    }
    case "shop": {
      look(fs, b, type, true);
      obox(fs, x, z, ux, uz, hw, hd, 0, H, wall, true, color("#8d8a84"), roofs);
      parapet(props, b, H, color("#d6d0c2"));
      // An awning over the shopfront.
      const aw = color(AWNINGS[b.seed % AWNINGS.length]);
      const ax = x + fx * (hd + 0.9);
      const az = z + fz * (hd + 0.9);
      const vx = -uz;
      const vz = ux;
      const sgn = vx * fx + vz * fz > 0 ? 1 : -1;
      const p = (a: number, dd: number, y: number) => [ax + ux * hw * 0.92 * a + vx * dd * sgn, y, az + uz * hw * 0.92 * a + vz * dd * sgn];
      props.quad(p(-1, -0.9, 3.3), p(1, -0.9, 3.3), p(1, 0.9, 2.8), p(-1, 0.9, 2.8), [[0, 0], [1, 0], [1, 1], [0, 1]], [fx * 0.3, 0.95, fz * 0.3], aw);
      obox(props, x + fx * (hd + 0.05), z + fz * (hd + 0.05), ux, uz, hw * 0.7, 0.08, 3.5, 4.1, color("#f3efe4"));
      rooftop(props, roofs, b, H, R);
      break;
    }
    case "workshop": {
      look(fs, b, 6);
      obox(fs, x, z, ux, uz, hw, hd, 0, H, wall, true, color("#7d7b77"), roofs);
      // A sawtooth of small pitched roofs.
      const n = Math.max(2, Math.round(hd / 4));
      const step = (hd * 2) / n;
      for (let k = 0; k < n; k++) {
        const off = -hd + step * (k + 0.5);
        gable(roofs, props, x - uz * off, z + ux * off, ux, uz, hw, step / 2, H, 1.4, color("#8f969b"), color("#8f969b"), 0.05);
      }
      // Roller doors on the front.
      for (let k = -1; k <= 1; k += 2) obox(props, x + fx * (hd + 0.05) + ux * k * hw * 0.45, z + fz * (hd + 0.05) + uz * k * hw * 0.45, ux, uz, 2, 0.06, 0, 3.6, color("#b0b4b8"));
      break;
    }
    case "civic": {
      civic(s, b, fs, props, roofs, trees, R);
      break;
    }
    default: {
      // Apartments and offices: a box (with a podium and setbacks if tall), parapet, rooftop.
      const glass = b.style === "glass";
      look(fs, b, type, b.use === "mixed" || (b.use === "jobs" && b.storeys < 6));
      if (b.form === "tower") {
        const podH = groundHeight(b) + 3 * floorHeight(b);
        obox(fs, x, z, ux, uz, hw, hd, 0, podH, wall, true, flatRoof(b), roofs);
        const tw = hw * 0.72;
        const td = hd * 0.82;
        const mid = podH + (H - podH) * 0.82;
        obox(fs, x, z, ux, uz, tw, td, podH, mid, wall, true, flatRoof(b), roofs);
        obox(fs, x, z, ux, uz, tw * 0.82, td * 0.82, mid, H, wall, true, flatRoof(b), roofs);
        parapet(props, { ...b, hw: tw * 0.82, hd: td * 0.82 }, H, glass ? color("#a8b4bc") : color("#d6d0c2"));
        // A crown and a mast.
        obox(props, x, z, ux, uz, tw * 0.4, td * 0.4, H, H + 4, color("#d9d7d2"));
        addGeo(props, new THREE.CylinderGeometry(0.15, 0.3, 14, 6).translate(0, H + 11, 0), color("#cfcfcf"), place(x, 0, z));
      } else if (b.storeys > 12) {
        const lower = groundHeight(b) + 7 * floorHeight(b);
        obox(fs, x, z, ux, uz, hw, hd, 0, lower, wall, true, flatRoof(b), roofs);
        obox(fs, x, z, ux, uz, hw - 1.8, hd - 1.6, lower, H, wall, true, flatRoof(b), roofs);
        parapet(props, { ...b, hw: hw - 1.8, hd: hd - 1.6 }, H, glass ? color("#a8b4bc") : color("#d8d2c4"));
        parapet(props, b, lower, color("#d8d2c4"));
        rooftop(props, roofs, { ...b, hw: hw - 1.8, hd: hd - 1.6 }, H, R);
      } else {
        obox(fs, x, z, ux, uz, hw, hd, 0, H, wall, true, flatRoof(b), roofs);
        parapet(props, b, H, b.style === "brick" ? color("#d9d1bf") : color("#cfcac0"));
        rooftop(props, roofs, b, H, R);
      }
      if (b.bay && b.form !== "tower") bays(fs, b, H);
      if (b.use === "mixed" || b.use === "shops") {
        const aw = color(AWNINGS[b.seed % AWNINGS.length]);
        obox(props, x + fx * (hd + 0.7), z + fz * (hd + 0.7), ux, uz, hw * 0.9, 0.7, 3.4, 3.55, aw);
      }
      // A garden tree or two out back.
      if (R() < 0.7) {
        const p = back(hd + 5);
        trees.push({ kind: "round", x: p.x + ux * (R() - 0.5) * hw, z: p.z + uz * (R() - 0.5) * hw, k: 0.7 + R() * 0.3 });
      }
    }
  }
}

/** A parapet: a low wall round a flat roof (no windows). */
function parapet(props: Sheet, b: Pick<Building, "x" | "z" | "ux" | "uz" | "hw" | "hd">, H: number, col: THREE.Color) {
  const t = 0.25;
  const { x, z, ux, uz, hw, hd } = b;
  const vx = -uz;
  const vz = ux;
  obox(props, x + vx * (hd - t), z + vz * (hd - t), ux, uz, hw, t, H, H + 0.9, col);
  obox(props, x - vx * (hd - t), z - vz * (hd - t), ux, uz, hw, t, H, H + 0.9, col);
  obox(props, x + ux * (hw - t), z + uz * (hw - t), ux, uz, t, hd, H, H + 0.9, col);
  obox(props, x - ux * (hw - t), z - uz * (hw - t), ux, uz, t, hd, H, H + 0.9, col);
}

/** What's on a flat roof: plant and a water tank, or the planner's choice of green, terrace or solar. */
function rooftop(props: Sheet, roofs: Sheet, b: Building, H: number, R: () => number) {
  const { x, z, ux, uz, hw, hd } = b;
  const y = H + 0.02;
  if (b.roof === "green") {
    oflat(props, x, z, ux, uz, hw - 0.4, hd - 0.4, y + 0.05, color("#5d8f3c"));
    for (let k = 0; k < 6; k++) addGeo(props, new THREE.IcosahedronGeometry(0.6 + R() * 0.4, 0).translate(0, 0.4, 0), color(R() < 0.5 ? "#4c7a33" : "#6b9a45"), place(x + ux * (R() - 0.5) * hw * 1.6 - uz * (R() - 0.5) * hd * 1.4, y, z + uz * (R() - 0.5) * hw * 1.6 + ux * (R() - 0.5) * hd * 1.4));
  } else if (b.roof === "terrace") {
    oflat(props, x, z, ux, uz, hw - 0.4, hd - 0.4, y + 0.05, color("#a4774e"));
    for (let k = 0; k < 4; k++) {
      const px = x + ux * (k - 1.5) * hw * 0.45;
      const pz = z + uz * (k - 1.5) * hw * 0.45;
      addGeo(props, new THREE.ConeGeometry(1.4, 0.5, 8).translate(0, 2.3, 0), color(k % 2 ? "#e8e0cc" : "#c9533b"), place(px, y, pz));
      addGeo(props, new THREE.CylinderGeometry(0.04, 0.04, 2.2, 4).translate(0, 1.1, 0), color("#555555"), place(px, y, pz));
      obox(props, px - uz * hd * 0.7, pz + ux * hd * 0.7, ux, uz, 1.2, 0.5, y, y + 0.6, color("#6b4a32"));
      addGeo(props, new THREE.IcosahedronGeometry(0.7, 0).translate(0, 1.1, 0), color("#4f8a3a"), place(px - uz * hd * 0.7, y, pz + ux * hd * 0.7));
    }
  } else if (b.roof === "solar") {
    const rows = Math.max(1, Math.floor((hd * 2 - 2) / 2.6));
    for (let k = 0; k < rows; k++) {
      const off = -hd + 1.5 + k * 2.6;
      const cx = x - uz * off;
      const cz = z + ux * off;
      addGeo(props, new THREE.BoxGeometry(hw * 1.7, 0.08, 1.7).rotateX(-0.45).translate(0, 0.7, 0), color("#1d2b45"), place(cx, y, cz, ux, uz));
    }
  } else {
    oflat(roofs, x, z, ux, uz, hw - 0.3, hd - 0.3, y + 0.02, flatRoof(b).multiplyScalar(1.08));
    // Plant: air-conditioning condensers (with their fans), vents, and a lift overrun on taller blocks.
    const vx = -uz;
    const vz = ux;
    const spot = () => ({ x: x + ux * (R() - 0.5) * hw * 1.4 + vx * (R() - 0.5) * hd * 1.2, z: z + uz * (R() - 0.5) * hw * 1.4 + vz * (R() - 0.5) * hd * 1.2 });
    const units = 2 + Math.floor(R() * 3);
    for (let k = 0; k < units; k++) {
      const p = spot();
      obox(props, p.x, p.z, ux, uz, 0.9, 0.55, y, y + 1.0, color("#c3c6c8"));
      addGeo(props, new THREE.CylinderGeometry(0.36, 0.36, 0.04, 12).translate(0, y + 1.02, 0), color("#3a3d40"), place(p.x, 0, p.z));
    }
    for (let k = 0; k < 3; k++) {
      const p = spot();
      addGeo(props, new THREE.CylinderGeometry(0.16, 0.16, 0.9, 8).translate(0, y + 0.45, 0), color("#9a9da0"), place(p.x, 0, p.z));
      addGeo(props, new THREE.CylinderGeometry(0.26, 0.22, 0.14, 8).translate(0, y + 0.95, 0), color("#8a8d90"), place(p.x, 0, p.z));
    }
    if (b.storeys >= 5) {
      const ox = x - ux * hw * 0.35;
      const oz = z - uz * hw * 0.35;
      obox(props, ox, oz, ux, uz, 1.8, 1.6, y, y + 3.2, color(b.style === "brick" ? "#a4553f" : "#c9c4b8"), true, flatRoof(b), roofs);
    }
    // And a timber water tank on a brick building.
    if (b.style === "brick" && b.storeys >= 5 && R() < 0.75) {
      const tx = x + ux * hw * 0.4;
      const tz = z + uz * hw * 0.4;
      for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) addGeo(props, new THREE.CylinderGeometry(0.1, 0.1, 3, 4).translate(a * 1.1, 1.5, c * 1.1), color("#3c3c3c"), place(tx, y, tz));
      addGeo(props, new THREE.CylinderGeometry(1.7, 1.7, 3.2, 12).translate(0, 4.6, 0), color("#7b5a3c"), place(tx, y, tz));
      addGeo(props, new THREE.ConeGeometry(1.9, 1.3, 12).translate(0, 6.85, 0), color("#4a4d52"), place(tx, y, tz));
    }
  }
}

/** Bay windows up the street front, from the first floor to the top. */
function bays(fs: FacadeSheet, b: Building, H: number) {
  const n = Math.max(1, Math.floor((b.hw * 2) / 6.5));
  const gf = groundHeight(b);
  for (let k = 0; k < n; k++) {
    const off = -b.hw + ((k + 0.5) * b.hw * 2) / n;
    const cx = b.x + b.ux * off + b.fx * (b.hd + 0.45);
    const cz = b.z + b.uz * off + b.fz * (b.hd + 0.45);
    obox(fs, cx, cz, b.ux, b.uz, 1.3, 0.45, gf + 0.3, H - 0.4, new THREE.Color(b.color).multiplyScalar(0.95));
  }
}

function civic(_s: State, b: Building, fs: FacadeSheet, props: Sheet, roofs: Sheet, trees: TreeSpot[], R: () => number) {
  const { x, z, ux, uz, hw, hd, fx, fz } = b;
  const kind = b.civic ?? "park";
  if (kind === "park" || kind === "plaza") {
    const n = kind === "park" ? 8 : 4;
    for (let k = 0; k < n; k++) trees.push({ kind: R() < 0.2 ? "pine" : "round", x: x + ux * (R() - 0.5) * hw * 2 + fx * (R() - 0.5) * LOT_D * 0.8, z: z + uz * (R() - 0.5) * hw * 2 + fz * (R() - 0.5) * LOT_D * 0.8, k: 0.8 + R() * 0.5 });
    if (kind === "park") {
      // A playground: a slide and a climbing frame in bright colours.
      obox(props, x + fx * 4, z + fz * 4, ux, uz, 1.5, 1, 0, 2.2, color("#e0b020"));
      obox(props, x + fx * 4 + ux * 3.5, z + fz * 4 + uz * 3.5, ux, uz, 0.5, 2, 0, 1.2, color("#d0422e"));
      obox(props, x - fx * 3, z - fz * 3, ux, uz, 2, 0.35, 0, 0.5, color("#7a5a3c"));
    } else {
      addGeo(props, new THREE.CylinderGeometry(3.4, 3.6, 0.7, 20).translate(0, 0.35, 0), color("#cfc8b8"), place(x, 0, z));
      addGeo(props, new THREE.CylinderGeometry(3, 3, 0.1, 20).translate(0, 0.66, 0), color("#4e8fa6"), place(x, 0, z));
      addGeo(props, new THREE.CylinderGeometry(0.3, 0.5, 2.4, 8).translate(0, 1.4, 0), color("#cfc8b8"), place(x, 0, z));
    }
    return;
  }
  const H = heightOf(b);
  const wall = new THREE.Color(kind === "clinic" ? "#ecebe6" : kind === "library" ? "#d4bf94" : b.color);
  const type = kind === "clinic" ? 4 : kind === "library" ? 2 : 3;
  look(fs, b, type);
  obox(fs, x, z, ux, uz, hw, hd, 0, H, wall, true, flatRoof(b), roofs);
  parapet(props, b, H, color("#e6e0d2"));
  if (kind === "school") {
    // A flagpole and a covered area.
    addGeo(props, new THREE.CylinderGeometry(0.06, 0.08, 9, 5).translate(0, 4.5, 0), color("#dddddd"), place(x + fx * (hd + 4) + ux * hw * 0.7, 0, z + fz * (hd + 4) + uz * hw * 0.7));
    addGeo(props, new THREE.BoxGeometry(2, 1.2, 0.04).translate(1, 8.2, 0), color("#2c6fb3"), place(x + fx * (hd + 4) + ux * hw * 0.7, 0, z + fz * (hd + 4) + uz * hw * 0.7));
    for (let k = 0; k < 4; k++) trees.push({ kind: "round", x: x - fx * (hd + 6) + ux * (k - 1.5) * hw * 0.5, z: z - fz * (hd + 6) + uz * (k - 1.5) * hw * 0.5, k: 0.9 });
  } else if (kind === "clinic") {
    const sx = x + fx * (hd + 0.1);
    const sz = z + fz * (hd + 0.1);
    obox(props, sx, sz, ux, uz, 0.9, 0.1, H - 2.6, H - 0.8, color("#d32f2f"));
    obox(props, sx, sz, ux, uz, 0.3, 0.12, H - 3.2, H - 0.2, color("#d32f2f"));
  } else if (kind === "library") {
    // Columns and a pediment on the front.
    for (let k = -2; k <= 2; k++) addGeo(props, new THREE.CylinderGeometry(0.45, 0.5, H - 1, 10).translate(0, (H - 1) / 2, 0), color("#e8dcc0"), place(x + fx * (hd + 1.5) + ux * k * hw * 0.38, 0, z + fz * (hd + 1.5) + uz * k * hw * 0.38));
    obox(props, x + fx * (hd + 1.5), z + fz * (hd + 1.5), ux, uz, hw * 0.92, 1.6, H - 1, H, color("#e8dcc0"));
  }
}

/** A building going up: a slab, a concrete frame as high as it's got. */
function site(b: Building, props: Sheet) {
  const H = heightOf(b) * Math.max(0.12, b.progress);
  oflat(props, b.x, b.z, b.ux, b.uz, b.hw + 1, b.hd + 1, 0.15, color("#a9a49a"));
  const fh = floorHeight(b);
  for (let y = fh; y <= H; y += fh) obox(props, b.x, b.z, b.ux, b.uz, b.hw, b.hd, y - 0.3, y, color("#b7b3ab"));
  // Columns at the corners and along the sides.
  const n = Math.max(2, Math.round(b.hw / 4));
  for (let k = 0; k <= n; k++)
    for (const sd of [-1, 1]) {
      const off = -b.hw + (k * b.hw * 2) / n;
      obox(props, b.x + b.ux * off - b.uz * sd * (b.hd - 0.3), b.z + b.uz * off + b.ux * sd * (b.hd - 0.3), b.ux, b.uz, 0.25, 0.25, 0, H, color("#9e9a92"), false);
    }
}

/* ------------------------------------------------------------------ nature */

/** Orchards, park trees, woods by the river and the odd tree in a meadow, in one chunk. */
function nature(s: State, x0: number, z0: number, trees: TreeSpot[], quality: "low" | "medium" | "high") {
  const R = rng(Math.round(x0 * 7 + z0 * 13 + 99991));
  const clear = (x: number, z: number, pad: number) => {
    const e = nearestEdge(s, x, z, 30);
    if (e && e.d < roadHalf(s.edges[e.id]!.kind) + pad) return false;
    return !inWater(s, x, z, 3);
  };
  const ds = s.districts.filter(Boolean);
  const top = (x: number, z: number) => {
    for (let i = ds.length - 1; i >= 0; i--) if (pointInPoly(x, z, ds[i]!.poly)) return ds[i]!;
    return null;
  };
  const step = quality === "low" ? 11 : 7.5;
  // Orchards: rows of fruit trees.
  for (let x = x0 + step / 2; x < x0 + CHUNK; x += step)
    for (let z = z0 + step / 2; z < z0 + CHUNK; z += step) {
      const d = top(x, z);
      if (!d || d.use !== "farms" || d.crop !== "orchard") continue;
      // Leave a track every few rows.
      if (Math.floor((z - z0) / step) % 9 === 0) continue;
      if (!clear(x, z, 6) || nearBuilding(s, x, z)) continue;
      trees.push({ kind: "fruit", x: x + (R() - 0.5) * 0.8, z: z + (R() - 0.5) * 0.8, k: 0.75 + R() * 0.3 });
    }
  // Parkland and meadows: scattered trees and clumps.
  const n = quality === "low" ? 18 : 40;
  for (let k = 0; k < n; k++) {
    const x = x0 + R() * CHUNK;
    const z = z0 + R() * CHUNK;
    const d = top(x, z);
    const near = riverDist(s, x, z, s.riverHalf + 50);
    const wantPark = d?.use === "parks";
    const wantWild = !d && R() < 0.3;
    const wantRiver = near < s.riverHalf + 45 && near > s.riverHalf + 6;
    const hedge = d?.use === "farms" && d.crop !== "orchard" && R() < 0.12;
    // The green between blocks in town gets the odd tree too.
    const wantTown = !!d && (d.use === "homes" || d.use === "mixed") && R() < 0.35;
    if (!(wantPark || wantWild || wantRiver || hedge || wantTown)) continue;
    if (!clear(x, z, 3) || nearBuilding(s, x, z)) continue;
    trees.push({ kind: R() < 0.25 ? "pine" : R() < 0.5 ? "tall" : "round", x, z, k: 0.8 + R() * 0.6 });
  }
}

/** Is (x, z) on a lot with something built on it? */
function nearBuilding(s: State, x: number, z: number) {
  for (const id of ix(s).lots.query(x - 2, z - 2, x + 2, z + 2)) {
    const l = s.lots[id];
    if (!l || l.bld < 0) continue;
    const dx = x - l.x;
    const dz = z - l.z;
    if (Math.abs(dx * l.ux + dz * l.uz) <= LOT_W / 2 + 1 && Math.abs(-dx * l.uz + dz * l.ux) <= LOT_D / 2 + 1) return true;
  }
  return false;
}
