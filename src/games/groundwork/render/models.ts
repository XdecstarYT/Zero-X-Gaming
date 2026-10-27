import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { KINDS, type Kind } from "../data";
import type { Mats } from "./materials";

/**
 * The shapes of Groundwork's pieces, each with its origin at the middle of its underside, its
 * length along x and its depth along z (a window or door faces out along -z). Bricks, blocks and
 * stones are modelled at their real size with softened arrises; anything that comes in lengths
 * (footings, timbers, beams, sheets) is a unit shape stretched to size; windows and doors are
 * built to each size, frame, sashes, glass, sill and all.
 */

export interface Model {
  geo: THREE.BufferGeometry;
  mat: THREE.Material | THREE.Material[];
  /** Stretched to each piece's size (rather than modelled at it). */
  scaled: boolean;
}

const unitBox = () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

function rounded(L: number, H: number, D: number, r: number) {
  const g = new RoundedBoxGeometry(L, H, D, 1, Math.min(r, L / 2.2, H / 2.2, D / 2.2));
  g.translate(0, H / 2, 0);
  return g;
}

/** Merge parts that each carry a material index into one geometry with groups. */
function grouped(parts: { g: THREE.BufferGeometry; m: number }[]) {
  const geos = parts.map((p) => {
    const g = p.g.index ? p.g.toNonIndexed() : p.g;
    g.clearGroups();
    g.addGroup(0, g.getAttribute("position").count, p.m);
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    return g;
  });
  return mergeGeometries(geos, true)!;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** A clay roof tile: a flat pan with a single big roll, lapped over the next one along. */
function tileGeometry(L: number, H: number, D: number) {
  const s = new THREE.Shape();
  const n = 18;
  const top: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = -L / 2 + (L * i) / n;
    const t = (x + L / 2) / L;
    // The roll, a third of the way across.
    const roll = t > 0.12 && t < 0.42 ? Math.sin(((t - 0.12) / 0.3) * Math.PI) * 0.034 : 0;
    const lip = t > 0.92 ? (t - 0.92) * 0.12 : 0;
    top.push([x, H + roll + lip]);
  }
  s.moveTo(top[0][0], 0);
  for (const [x, y] of top) s.lineTo(x, y);
  for (let i = n; i >= 0; i--) {
    const [x, y] = top[i];
    s.lineTo(x, Math.max(0, y - H));
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -D / 2);
  g.computeVertexNormals();
  return g;
}

/** Corrugated sheet: a unit square, its ribs running along z (down the slope). */
function sheetGeometry() {
  const nx = 64;
  const g = new THREE.PlaneGeometry(1, 1, nx, 1).rotateX(-Math.PI / 2);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setY(i, 0.5 + 0.5 * Math.sin((x + 0.5) * Math.PI * 2 * 9));
  }
  g.computeVertexNormals();
  return g;
}

/** A universal beam, unit length along x, in the proportions of a 200 × 100. */
function steelGeometry() {
  const s = new THREE.Shape();
  const f = 0.0425;
  const w = 0.028;
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0.5, f);
  s.lineTo(w, f);
  s.lineTo(w, 1 - f);
  s.lineTo(0.5, 1 - f);
  s.lineTo(0.5, 1);
  s.lineTo(-0.5, 1);
  s.lineTo(-0.5, 1 - f);
  s.lineTo(-w, 1 - f);
  s.lineTo(-w, f);
  s.lineTo(-0.5, f);
  s.closePath();
  // The profile is in (z, y); extrude along x.
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2);
  return g;
}

/** A ridge tile: a half-round, unit length along x. */
function ridgeGeometry() {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1, true, -Math.PI / 2, Math.PI);
  g.rotateZ(Math.PI / 2);
  g.translate(0, 0.08, 0);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) p.setY(i, Math.max(0, p.getY(i)));
  g.computeVertexNormals();
  return g;
}

/** A window, built to its size: frame, sashes, glass, and a stone sill outside. Materials: 0 frame, 1 glass, 2 sill. */
function windowGeometry(L: number, H: number, D: number) {
  const parts: { g: THREE.BufferGeometry; m: number }[] = [];
  const f = 0.065;
  const fd = 0.07;
  // Set back from the outside face (z = -D/2) in a reveal.
  const zc = -D / 2 + 0.03 + fd / 2;
  parts.push({ g: box(L, f, fd, 0, H - f / 2, zc), m: 0 });
  parts.push({ g: box(L, f, fd, 0, f / 2, zc), m: 0 });
  parts.push({ g: box(f, H - 2 * f, fd, -L / 2 + f / 2, H / 2, zc), m: 0 });
  parts.push({ g: box(f, H - 2 * f, fd, L / 2 - f / 2, H / 2, zc), m: 0 });
  // Mullions on a wide window, a transom on a tall one.
  const lights = L > 1.4 ? 3 : L > 0.8 ? 2 : 1;
  const cols: [number, number][] = [];
  for (let i = 0; i < lights; i++) {
    const x0 = -L / 2 + f + ((L - 2 * f) * i) / lights;
    const x1 = -L / 2 + f + ((L - 2 * f) * (i + 1)) / lights;
    cols.push([x0, x1]);
    if (i > 0) parts.push({ g: box(0.05, H - 2 * f, fd, x0, H / 2, zc), m: 0 });
  }
  const transom = H > 1.0 ? H - f - (H - 2 * f) * 0.28 : -1;
  if (transom > 0) parts.push({ g: box(L - 2 * f, 0.05, fd, 0, transom, zc), m: 0 });
  // Sashes (opening lights) and the glass in every light.
  const sash = 0.042;
  for (const [x0, x1] of cols) {
    const rows: [number, number][] = transom > 0 ? [[f, transom - 0.025], [transom + 0.025, H - f]] : [[f, H - f]];
    for (const [y0, y1] of rows) {
      const w = x1 - x0 - 0.02;
      const h = y1 - y0;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const zs = zc - 0.006;
      parts.push({ g: box(w, sash, 0.05, cx, y1 - sash / 2, zs), m: 0 });
      parts.push({ g: box(w, sash, 0.05, cx, y0 + sash / 2, zs), m: 0 });
      parts.push({ g: box(sash, h - 2 * sash, 0.05, x0 + 0.01 + sash / 2, cy, zs), m: 0 });
      parts.push({ g: box(sash, h - 2 * sash, 0.05, x1 - 0.01 - sash / 2, cy, zs), m: 0 });
      parts.push({ g: box(w - 2 * sash + 0.01, h - 2 * sash + 0.01, 0.006, cx, cy, zs - 0.008), m: 1 });
      parts.push({ g: box(w - 2 * sash + 0.01, h - 2 * sash + 0.01, 0.006, cx, cy, zs + 0.012), m: 1 });
    }
  }
  // A sill: projecting, sloped a touch, with a drip.
  parts.push({ g: box(L + 0.1, 0.05, D * 0.6 + 0.06, 0, -0.025, -D / 2 + (D * 0.6) / 2 - 0.03), m: 2 });
  return grouped(parts);
}

/** A door in its frame. Materials: 0 leaf (painted), 1 frame, 2 glass, 3 ironmongery, 4 threshold. */
function doorGeometry(L: number, H: number, D: number) {
  const parts: { g: THREE.BufferGeometry; m: number }[] = [];
  const f = 0.07;
  const fd = 0.085;
  const zc = -D / 2 + 0.025 + fd / 2;
  parts.push({ g: box(L, f, fd, 0, H - f / 2, zc), m: 1 });
  parts.push({ g: box(f, H - f, fd, -L / 2 + f / 2, (H - f) / 2, zc), m: 1 });
  parts.push({ g: box(f, H - f, fd, L / 2 - f / 2, (H - f) / 2, zc), m: 1 });
  parts.push({ g: box(L + 0.06, 0.03, D + 0.04, 0, -0.015, 0), m: 4 });
  const garage = L > 2;
  const leaves = garage ? 1 : L > 1.2 ? 2 : 1;
  const lw = (L - 2 * f) / leaves;
  const lh = H - f - 0.01;
  for (let k = 0; k < leaves; k++) {
    const cx = -L / 2 + f + lw * (k + 0.5);
    const zl = zc - 0.01;
    if (garage) {
      // A sectional door: ribbed panels.
      parts.push({ g: box(lw - 0.006, lh, 0.045, cx, lh / 2 + 0.005, zl), m: 0 });
      for (let r = 1; r < 4; r++) parts.push({ g: box(lw - 0.03, 0.012, 0.01, cx, (lh * r) / 4, zl - 0.026), m: 0 });
      for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) parts.push({ g: box(lw / 6 - 0.06, lh / 4 - 0.08, 0.008, cx - lw / 2 + (lw * (i + 0.5)) / 6, (lh * (r + 0.5)) / 4, zl - 0.025), m: 0 });
      parts.push({ g: box(0.22, 0.03, 0.03, cx, 0.9, zl - 0.035), m: 3 });
      continue;
    }
    parts.push({ g: box(lw - 0.006, lh, 0.045, cx, lh / 2 + 0.005, zl), m: 0 });
    // Four panels, the top pair glazed on a front door.
    const pw = (lw - 0.24) / 2;
    const rows = [
      [0.18, 0.86],
      [1.02, lh - 0.18],
    ];
    rows.forEach(([y0, y1], ri) => {
      for (const sx of [-1, 1]) {
        const px = cx + sx * (pw / 2 + 0.04);
        const glazed = ri === 1 && leaves === 1;
        parts.push({ g: box(pw, y1 - y0, 0.012, px, (y0 + y1) / 2, zl - 0.026), m: glazed ? 2 : 0 });
        if (!glazed) parts.push({ g: box(pw - 0.07, y1 - y0 - 0.07, 0.01, px, (y0 + y1) / 2, zl - 0.034), m: 0 });
      }
    });
    // Handle, a letterbox and a knocker.
    const hx = leaves === 2 ? cx + (k === 0 ? 1 : -1) * (lw / 2 - 0.07) : cx + lw / 2 - 0.08;
    parts.push({ g: new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12).rotateX(Math.PI / 2).translate(hx, 1.0, zl - 0.038), m: 3 });
    parts.push({ g: box(0.12, 0.018, 0.016, hx - 0.04, 1.0, zl - 0.06), m: 3 });
    if (leaves === 1) parts.push({ g: box(0.26, 0.05, 0.012, cx, 0.94, zl - 0.03), m: 3 });
  }
  return grouped(parts);
}

const models = new Map<string, Model>();

export function sizeKey(k: Kind, s: [number, number, number]) {
  return `${k}|${s.map((v) => v.toFixed(4)).join(",")}`;
}

/** Is this kind modelled at each piece's size, or a unit shape stretched to it? */
export function isScaled(k: Kind) {
  const I = KINDS[k];
  return !(I.family === "masonry" || k === "window" || k === "door" || k === "tile");
}

/** The model for a kind (at a size, for those built to size). */
export function modelFor(M: Mats, k: Kind, s: [number, number, number]): Model {
  const scaled = isScaled(k);
  const key = scaled ? `${k}|u` : sizeKey(k, s);
  let m = models.get(key);
  if (m) return m;
  const [L, H, D] = s;
  switch (k) {
    case "brick":
    case "bat":
    case "closer":
      m = { geo: rounded(L, H, D, 0.0045), mat: M.brick, scaled };
      break;
    case "block":
    case "halfblock":
      m = { geo: rounded(L, H, D, 0.004), mat: M.concrete, scaled };
      break;
    case "stone":
    case "halfstone":
      m = { geo: rounded(L, H, D, 0.012), mat: M.concrete, scaled };
      break;
    case "glassblock":
      m = { geo: rounded(L, H, D, 0.01), mat: M.glassBlock, scaled };
      break;
    case "footing":
    case "slab":
    case "lintel":
      m = { geo: unitBox(), mat: M.concrete, scaled };
      break;
    case "steel":
      m = { geo: steelGeometry(), mat: M.steel, scaled };
      break;
    case "sheet":
      m = { geo: sheetGeometry(), mat: M.metal, scaled };
      break;
    case "tile":
      m = { geo: tileGeometry(L, H, D), mat: M.tile, scaled };
      break;
    case "ridge":
      m = { geo: ridgeGeometry(), mat: M.tile, scaled };
      break;
    case "fascia":
      m = { geo: unitBox(), mat: M.painted, scaled };
      break;
    case "window":
      m = { geo: windowGeometry(L, H, D), mat: [M.frame, M.glass, M.concreteFixed], scaled };
      break;
    case "door":
      m = { geo: doorGeometry(L, H, D), mat: [M.painted, M.frameWhite, M.glass, M.handle, M.concreteFixed], scaled };
      break;
    default:
      m = { geo: unitBox(), mat: M.timber, scaled };
  }
  models.set(key, m);
  return m;
}

/** The mortar round a piece laid in mortar: its bed under it and half its perpends each side, set back 4 mm from the face. */
export const mortarGeometry = unitBox;
