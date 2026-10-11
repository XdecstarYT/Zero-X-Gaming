/**
 * WareForge models and textures, in the NextX look: clean physically based materials, rounded
 * edges, real detail (sectional dock doors, wooden pallets, cartons with labels, curtain-sider
 * trailers, counterbalance forklifts with masts and chains) and canvas textures for concrete,
 * cladding, asphalt, grass and wood. Geometry and materials are shared and cached, so a hundred
 * trucks coming and going cost nothing extra.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mergeStatic } from "@/nextx/batch";
import { CARRIERS, MACHINES, isExtractor, type MachineType } from "../data";

export const COL = {
  wall: "#e4e8ef",
  wallDark: "#4b5263",
  plinth: "#8f96a3",
  fascia: "#2f6fe4",
  door: "#3d5fd9",
  doorDark: "#2c47b3",
  shelter: "#22252d",
  floor: "#c9ccd3",
  yard: "#6b7079",
  road: "#545961",
  grass: "#6c9f57",
  rackPost: "#2459d1",
  rackBeam: "#f28c28",
  fork: "#f6c21c",
  forkDark: "#2b2f3a",
  pallet: "#c99b62",
  pin: "#2f6fe4",
  line: "#f3c623",
};

/** A seeded random for the textures, so every run looks the same. */
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const mats = new Map<string, THREE.MeshStandardMaterial>();
/** A shared standard material per colour (and roughness, metalness). */
export function mat(color: string, rough = 0.75, metal = 0) {
  const k = `${color}|${rough}|${metal}`;
  let m = mats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    mats.set(k, m);
  }
  return m;
}

const basics = new Map<string, THREE.MeshBasicMaterial>();
/** A shared unlit material (lamps, lenses, screens). */
export function glow(color: string) {
  let m = basics.get(color);
  if (!m) basics.set(color, (m = new THREE.MeshBasicMaterial({ color })));
  return m;
}

const boxes = new Map<string, THREE.BoxGeometry>();
export function boxGeo(w: number, h: number, d: number) {
  const k = `${w}|${h}|${d}`;
  let g = boxes.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    boxes.set(k, g);
  }
  return g;
}

/** A box mesh sitting on y (its base), centred on x/z. */
export function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(boxGeo(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

const rboxes = new Map<string, THREE.BufferGeometry>();
/** A box with rounded edges (cached). */
export function rboxGeo(w: number, h: number, d: number, r = 0.06) {
  const k = `${w}|${h}|${d}|${r}`;
  let g = rboxes.get(k);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    rboxes.set(k, g);
  }
  return g;
}

/** A rounded box sitting on y, centred on x/z. */
export function rbox(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0, r = 0.06, shadow = true) {
  const m = new THREE.Mesh(rboxGeo(w, h, d, r), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

const cyls = new Map<string, THREE.CylinderGeometry>();
function cylGeo(rt: number, rb: number, h: number, seg: number) {
  const k = `${rt}|${rb}|${h}|${seg}`;
  let g = cyls.get(k);
  if (!g) cyls.set(k, (g = new THREE.CylinderGeometry(rt, rb, h, seg)));
  return g;
}

function cyl(r: number, h: number, material: THREE.Material, seg = 12, rb = r) {
  const m = new THREE.Mesh(cylGeo(r, rb, h, seg), material);
  m.castShadow = true;
  return m;
}

/** A wheel lying on its side for an x axle: a tyre and a hub. */
function wheel(r: number, wdt: number, rim: THREE.Material, seg = 16) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(cylGeo(r, r, wdt, seg), mat("#1b1e24", 0.85));
  t.rotation.z = Math.PI / 2;
  t.castShadow = true;
  g.add(t);
  const h = new THREE.Mesh(cylGeo(r * 0.58, r * 0.58, wdt + 0.02, seg), rim);
  h.rotation.z = Math.PI / 2;
  g.add(h);
  const nut = new THREE.Mesh(cylGeo(r * 0.18, r * 0.18, wdt + 0.05, 8), mat("#5c6370", 0.4, 0.6));
  nut.rotation.z = Math.PI / 2;
  g.add(nut);
  return g;
}

function shadows(g: THREE.Object3D, cast = true) {
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = true;
    }
  });
}

/* ------------------------------------------------------------------ textures */

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const tiled = (t: THREE.Texture) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

/** Draw something at (x, y) and again across the edges, so the texture tiles without seams. */
function wrap(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void) {
  for (const dx of [-size, 0, size])
    for (const dy of [-size, 0, size]) {
      const px = x + dx;
      const py = y + dy;
      if (px + r < 0 || py + r < 0 || px - r > size || py - r > size) continue;
      draw(px, py);
    }
}

/** Soft blobs of light and dark, for mottled surfaces. */
function mottle(g: CanvasRenderingContext2D, size: number, n: number, rMin: number, rMax: number, light: string, dark: string, alpha: number) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = rMin + rnd() * (rMax - rMin);
    const c = rnd() > 0.5 ? light : dark;
    const a = alpha * (0.4 + rnd() * 0.6);
    wrap(size, x, y, r, (px, py) => {
      const gr = g.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, `rgba(${c},${a})`);
      gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr;
      g.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
}

function speckle(g: CanvasRenderingContext2D, size: number, n: number, light: string, dark: string, alpha: number, dot = 1.3) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${rnd() > 0.5 ? light : dark},${rnd() * alpha})`;
    g.fillRect(rnd() * size, rnd() * size, dot, dot);
  }
}

/** Cartons stacked on a pallet: seams, tape and a shipping label; tinted per item by instance colour. */
export function loadTexture() {
  seed = 11;
  return canvasTex(256, 256, (g) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 256, 256);
    const rows = 3;
    const rh = 256 / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? 64 : 0;
      for (let x = -128 + off; x < 256; x += 128) {
        const y = r * rh;
        // Each carton: lighter at the top, a shadowed seam round it.
        const gr = g.createLinearGradient(0, y, 0, y + rh);
        gr.addColorStop(0, "rgba(255,255,255,0.35)");
        gr.addColorStop(1, "rgba(0,0,0,0.10)");
        g.fillStyle = gr;
        g.fillRect(x + 2, y + 2, 124, rh - 4);
        g.strokeStyle = "rgba(40,30,20,0.32)";
        g.lineWidth = 3;
        g.strokeRect(x + 1.5, y + 1.5, 125, rh - 3);
        // Tape down the middle.
        g.fillStyle = "rgba(255,255,255,0.28)";
        g.fillRect(x + 56, y + 2, 16, rh - 4);
        g.fillStyle = "rgba(0,0,0,0.06)";
        g.fillRect(x + 56, y + 2, 2, rh - 4);
        // A label with a barcode on some.
        if ((r + Math.floor((x + 128) / 128)) % 2 === 0) {
          g.fillStyle = "rgba(255,255,255,0.92)";
          g.fillRect(x + 82, y + rh - 38, 36, 26);
          g.fillStyle = "rgba(20,24,32,0.85)";
          for (let b = 0; b < 12; b++) g.fillRect(x + 85 + b * 2.6, y + rh - 33, b % 3 ? 1 : 1.8, 12);
          g.fillRect(x + 85, y + rh - 18, 18, 2);
        }
      }
    }
  });
}

/** Polished concrete: mottled, speckled with aggregate, a saw-cut joint round each 4 × 4 tiles. */
export function floorTexture() {
  seed = 21;
  const t = canvasTex(512, 512, (g) => {
    g.fillStyle = "#c8ccd3";
    g.fillRect(0, 0, 512, 512);
    mottle(g, 512, 90, 30, 120, "255,255,255", "86,92,108", 0.09);
    speckle(g, 512, 9000, "255,255,255", "40,44,56", 0.09);
    // Faint trowel arcs.
    g.strokeStyle = "rgba(255,255,255,0.05)";
    g.lineWidth = 6;
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      g.arc(rnd() * 512, rnd() * 512, 40 + rnd() * 80, rnd() * 6, rnd() * 6 + 1.2);
      g.stroke();
    }
    // Saw cuts.
    g.fillStyle = "rgba(52,56,70,0.42)";
    g.fillRect(0, 0, 512, 2.5);
    g.fillRect(0, 0, 2.5, 512);
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fillRect(0, 2.5, 512, 1.5);
    g.fillRect(2.5, 0, 1.5, 512);
  });
  return tiled(t);
}

/** Asphalt with grit, patches and tyre marks, for the yard and the road. */
export function asphaltTexture(base: string) {
  seed = 31;
  const t = canvasTex(512, 512, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    mottle(g, 512, 50, 30, 110, "255,255,255", "10,12,20", 0.07);
    speckle(g, 512, 14000, "255,255,255", "0,0,20", 0.12, 1.6);
    // Oil spots.
    mottle(g, 512, 8, 8, 22, "0,0,0", "0,0,0", 0.14);
    // A few cracks.
    g.strokeStyle = "rgba(0,0,0,0.18)";
    g.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      let x = rnd() * 512;
      let y = rnd() * 512;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        x += (rnd() - 0.5) * 30;
        y += (rnd() - 0.5) * 30;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
  return tiled(t);
}

/** Lawn: blades and speckles in several greens, with darker and drier patches. */
export function grassTexture() {
  seed = 41;
  const t = canvasTex(512, 512, (g) => {
    g.fillStyle = COL.grass;
    g.fillRect(0, 0, 512, 512);
    mottle(g, 512, 60, 40, 140, "190,215,120", "30,70,30", 0.16);
    for (let i = 0; i < 16000; i++) {
      const v = rnd();
      g.fillStyle = v < 0.33 ? `rgba(40,90,40,${0.25 + rnd() * 0.3})` : v < 0.66 ? `rgba(150,190,95,${0.2 + rnd() * 0.3})` : `rgba(90,140,70,${0.25 + rnd() * 0.3})`;
      g.fillRect(rnd() * 512, rnd() * 512, 1.4, 2.6 + rnd() * 2.5);
    }
  });
  return tiled(t);
}

/** Brickwork in stretcher bond: four courses and two bricks across per tile, each brick a slightly different red, in pale mortar. */
export function brickTexture(tint = "#b5502f") {
  seed = 61;
  const c = new THREE.Color(tint);
  return tiled(
    canvasTex(256, 256, (g) => {
      g.fillStyle = "#d8d2c6";
      g.fillRect(0, 0, 256, 256);
      const rows = 8;
      const h = 256 / rows;
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? 32 : 0;
        for (let x = -64 + off; x < 256; x += 64) {
          const k = 0.82 + rnd() * 0.3;
          g.fillStyle = `rgb(${Math.round(c.r * 255 * k)},${Math.round(c.g * 255 * k)},${Math.round(c.b * 255 * k)})`;
          g.fillRect(x + 2, r * h + 2, 60, h - 4);
          g.fillStyle = "rgba(0,0,0,0.12)";
          g.fillRect(x + 2, r * h + h - 6, 60, 2);
        }
      }
      speckle(g, 256, 2500, "255,255,255", "40,20,10", 0.12);
    }),
  );
}

/** Rough rock: layered bands of stone, cracks and specks. */
export function rockTexture(base = "#9d978d") {
  seed = 67;
  return tiled(
    canvasTex(256, 256, (g) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 256, 256);
      // Broken blocks of stone, each a slightly different shade, rather than grain.
      for (let i = 0; i < 90; i++) {
        const w = 20 + rnd() * 50;
        const h = 14 + rnd() * 34;
        const l = Math.round(rnd() * 40 - 20);
        g.fillStyle = l > 0 ? `rgba(255,255,250,${l / 160})` : `rgba(30,28,26,${-l / 120})`;
        g.beginPath();
        const x = rnd() * 256;
        const y = rnd() * 256;
        g.moveTo(x, y);
        g.lineTo(x + w, y + rnd() * 8);
        g.lineTo(x + w - rnd() * 10, y + h);
        g.lineTo(x + rnd() * 8, y + h - rnd() * 6);
        g.fill();
      }
      mottle(g, 256, 40, 10, 40, "250,250,245", "40,38,34", 0.16);
      g.strokeStyle = "rgba(30,28,26,0.4)";
      for (let i = 0; i < 30; i++) {
        g.beginPath();
        let x = rnd() * 256;
        let y = rnd() * 256;
        g.moveTo(x, y);
        for (let k = 0; k < 4; k++) g.lineTo((x += (rnd() - 0.5) * 34), (y += (rnd() - 0.3) * 24));
        g.stroke();
      }
      speckle(g, 256, 3000, "255,255,255", "25,24,22", 0.2, 1.6);
    }),
  );
}

/** A flat roof: grey membrane under gravel, the welded seams of its sheets showing faintly. */
export function roofTexture(tint = "#80838a") {
  seed = 71;
  return tiled(
    canvasTex(256, 256, (g) => {
      g.fillStyle = tint;
      g.fillRect(0, 0, 256, 256);
      mottle(g, 256, 30, 14, 46, "235,235,230", "30,32,36", 0.12);
      speckle(g, 256, 9000, "245,242,232", "28,28,30", 0.35, 1.7);
      g.fillStyle = "rgba(20,22,26,0.18)";
      for (let x = 0; x < 256; x += 128) g.fillRect(x, 0, 2, 256);
    }),
  );
}

/**
 * Insulated metal cladding: vertical ribs, a little grime towards the ground. u runs along the
 * wall (one texture every two tiles), v up it (once per wall height).
 */
export function claddingTexture() {
  seed = 51;
  return tiled(
    canvasTex(256, 256, (g) => {
      const base = g.createLinearGradient(0, 0, 0, 256);
      base.addColorStop(0, "#f3f5f9");
      base.addColorStop(0.8, "#e4e8ef");
      base.addColorStop(1, "#c3c9d3");
      g.fillStyle = base;
      g.fillRect(0, 0, 256, 256);
      for (let x = 0; x < 256; x += 32) {
        // Each rib: a shadowed edge, a bright crest, a shaded far face.
        g.fillStyle = "rgba(36,44,66,0.22)";
        g.fillRect(x, 0, 3, 256);
        g.fillStyle = "rgba(255,255,255,0.7)";
        g.fillRect(x + 3, 0, 3, 256);
        g.fillStyle = "rgba(36,44,66,0.07)";
        g.fillRect(x + 6, 0, 7, 256);
      }
      speckle(g, 256, 1400, "255,255,255", "30,36,50", 0.05);
    }),
  );
}

/** A sectional dock door: six panels with grooves, a row of little windows. */
export function doorTexture() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = "#d7dce6";
    g.fillRect(0, 0, 256, 256);
    const ph = 256 / 6;
    for (let i = 0; i < 6; i++) {
      const y = i * ph;
      const gr = g.createLinearGradient(0, y, 0, y + ph);
      gr.addColorStop(0, "rgba(255,255,255,0.45)");
      gr.addColorStop(1, "rgba(30,40,60,0.12)");
      g.fillStyle = gr;
      g.fillRect(0, y, 256, ph);
      g.fillStyle = "rgba(30,38,56,0.35)";
      g.fillRect(0, y, 256, 2);
      // Ribbing.
      g.fillStyle = "rgba(30,38,56,0.06)";
      for (let x = 8; x < 256; x += 16) g.fillRect(x, y + 6, 1.5, ph - 10);
    }
    // Vision windows in the second panel from the top.
    for (let i = 0; i < 4; i++) {
      const x = 22 + i * 58;
      g.fillStyle = "#26324a";
      g.fillRect(x, ph + 10, 40, ph - 20);
      g.fillStyle = "rgba(255,255,255,0.25)";
      g.fillRect(x + 3, ph + 12, 12, ph - 24);
    }
  });
}

/** Yellow and black hazard stripes. */
export function hazardTexture() {
  return tiled(
    canvasTex(64, 64, (g) => {
      g.fillStyle = "#f5c518";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#1d1f25";
      for (let i = -64; i < 128; i += 32) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + 16, 0);
        g.lineTo(i + 16 - 64, 64);
        g.lineTo(i - 64, 64);
        g.fill();
      }
    }),
  );
}

/** Pallet wood: pale planks with grain. */
export function woodTexture() {
  seed = 61;
  return canvasTex(128, 128, (g) => {
    g.fillStyle = "#cfa46c";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${rnd() > 0.5 ? "120,80,40" : "255,230,190"},${0.12 + rnd() * 0.15})`;
      g.lineWidth = 0.8 + rnd();
      const y = rnd() * 128;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(40, y + (rnd() - 0.5) * 6, 90, y + (rnd() - 0.5) * 6, 128, y + (rnd() - 0.5) * 4);
      g.stroke();
    }
    g.fillStyle = "rgba(90,60,30,0.35)";
    for (let i = 0; i < 4; i++) g.fillRect(0, i * 32, 128, 2);
    mottle(g, 128, 6, 3, 6, "90,60,30", "90,60,30", 0.5);
  });
}

/** Chain-link fencing (alpha-tested), u along the fence a repeat per world unit, v up it. */
export function fenceTexture() {
  return tiled(
    canvasTex(64, 64, (g) => {
      g.clearRect(0, 0, 64, 64);
      g.strokeStyle = "rgba(70,78,92,1)";
      g.lineWidth = 3;
      for (const [x0, x1] of [[-64, 64], [0, 128]]) {
        g.beginPath();
        g.moveTo(x0, 64);
        g.lineTo(x1, -64 + (x1 - x0));
        g.stroke();
      }
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(64, 64);
      g.moveTo(-32, 32);
      g.lineTo(32, 96);
      g.moveTo(32, -32);
      g.lineTo(96, 32);
      g.moveTo(0, 64);
      g.lineTo(64, 0);
      g.moveTo(-32, 32);
      g.lineTo(32, -32);
      g.moveTo(32, 96);
      g.lineTo(96, 32);
      g.stroke();
    }),
  );
}

let fadeTex: THREE.Texture | null = null;
/** Dark at the bottom (v = 0) fading out by the top: shadow along the foot of a wall. */
export function fadeTexture() {
  if (!fadeTex)
    fadeTex = canvasTex(4, 64, (g) => {
      const gr = g.createLinearGradient(0, 64, 0, 0);
      gr.addColorStop(0, "rgba(0,0,0,0.7)");
      gr.addColorStop(0.35, "rgba(0,0,0,0.28)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 4, 64);
    });
  return fadeTex;
}

let flakeTex: THREE.Texture | null = null;
/** A soft white dot, for snowflakes. */
export function flakeTexture() {
  if (!flakeTex)
    flakeTex = canvasTex(32, 32, (g) => {
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.5, "rgba(255,255,255,0.7)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 32, 32);
    });
  return flakeTex;
}

let shadowTex: THREE.Texture | null = null;
/** A soft round shadow, for contact shadows under vehicles and people. */
export function shadowTexture() {
  if (!shadowTex)
    shadowTex = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      gr.addColorStop(0, "rgba(0,0,0,0.75)");
      gr.addColorStop(0.45, "rgba(0,0,0,0.45)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
  return shadowTex;
}

const blobMats = new Map<number, THREE.MeshBasicMaterial>();
const blobGeo = new THREE.PlaneGeometry(1, 1);
/** A contact shadow on the ground: w × d, its strength 0–1. Grounds things even without shadow maps. */
export function blob(w: number, d: number, strength = 0.6) {
  const k = Math.round(strength * 20) / 20;
  let m = blobMats.get(k);
  if (!m) blobMats.set(k, (m = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: k, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
  const p = new THREE.Mesh(blobGeo, m);
  p.rotation.x = -Math.PI / 2;
  p.scale.set(w, d, 1);
  p.position.y = 0.012;
  p.renderOrder = 1;
  p.userData.blob = true;
  return p;
}

const logoCache = new Map<number, THREE.MeshStandardMaterial>();
/** The carrier's livery on a trailer's curtain side: name, roundel and stripes. */
export function logoMaterial(carrier: number) {
  let m = logoCache.get(carrier);
  if (m) return m;
  const c = CARRIERS[carrier];
  const t = canvasTex(1024, 256, (g) => {
    g.fillStyle = "#f8f9fc";
    g.fillRect(0, 0, 1024, 256);
    // Curtain folds.
    for (let x = 0; x < 1024; x += 24) {
      g.fillStyle = "rgba(30,40,60,0.045)";
      g.fillRect(x, 0, 10, 256);
    }
    g.fillStyle = c.color;
    g.fillRect(0, 190, 1024, 66);
    g.fillStyle = c.stripe;
    g.fillRect(0, 176, 1024, 14);
    g.fillStyle = c.color;
    g.beginPath();
    g.arc(110, 92, 58, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.font = "900 64px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(c.name[0], 110, 96);
    g.fillStyle = "#18202e";
    g.textAlign = "left";
    g.font = "900 88px system-ui, sans-serif";
    g.fillText(c.name, 196, 96);
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.font = "700 30px system-ui, sans-serif";
    g.fillText("Logistics · Freight · Distribution", 40, 224);
  });
  m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 });
  logoCache.set(carrier, m);
  return m;
}

/** A sign over a door ("Bay 1", "In 2"). */
export function signTexture(text: string, color: string) {
  return canvasTex(256, 96, (g) => {
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(4, 4, 248, 88, 22);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.beginPath();
    g.roundRect(4, 4, 248, 40, [22, 22, 0, 0]);
    g.fill();
    g.fillStyle = "#fff";
    // Long names shrink to fit.
    let px = 46;
    g.font = `800 ${px}px system-ui, sans-serif`;
    while (px > 18 && g.measureText(text).width > 226) g.font = `800 ${(px -= 2)}px system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 128, 50);
  });
}

/** White lettering for the blue fascia band ("WAREFORGE · WH-01 RIVERSIDE HUB"). */
export function letteringTexture(text: string, sub: string) {
  return canvasTex(1024, 128, (g) => {
    g.clearRect(0, 0, 1024, 128);
    g.fillStyle = "#ffffff";
    g.font = "900 64px system-ui, sans-serif";
    g.textBaseline = "middle";
    g.textAlign = "left";
    // A cube mark, then the name.
    g.fillStyle = "#cfe0ff";
    g.beginPath();
    g.moveTo(40, 22);
    g.lineTo(84, 44);
    g.lineTo(84, 92);
    g.lineTo(40, 114);
    g.lineTo(-4, 92);
    g.lineTo(-4, 44);
    g.closePath();
    g.fill();
    g.fillStyle = "#ffd34d";
    g.beginPath();
    g.moveTo(48, 44);
    g.lineTo(34, 72);
    g.lineTo(46, 72);
    g.lineTo(38, 96);
    g.lineTo(60, 62);
    g.lineTo(48, 62);
    g.closePath();
    g.fill();
    // The name and the site, shrunk together if they'd run off the end.
    let k = 1;
    const fit = () => {
      g.font = `900 ${64 * k}px system-ui, sans-serif`;
      const a = g.measureText(text).width;
      g.font = `700 ${40 * k}px system-ui, sans-serif`;
      return a + 36 * k + g.measureText(sub).width;
    };
    while (k > 0.5 && 112 + fit() > 1010) k -= 0.05;
    g.fillStyle = "#ffffff";
    g.font = `900 ${64 * k}px system-ui, sans-serif`;
    g.fillText(text, 112, 70);
    const w = g.measureText(text).width;
    g.font = `700 ${40 * k}px system-ui, sans-serif`;
    g.globalAlpha = 0.85;
    g.fillText(sub, 112 + w + 36 * k, 72);
  });
}

/* ------------------------------------------------------------------ pallets */

let palletGeo: THREE.BufferGeometry | null = null;
/**
 * A wooden pallet 0.9 square and 0.14 high, centred on the origin: a slatted top deck, three
 * runners and three bottom boards, merged into one geometry for instancing.
 */
export function palletGeometry() {
  if (palletGeo) return palletGeo;
  const parts: THREE.BufferGeometry[] = [];
  const add = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    parts.push(g);
  };
  for (let i = 0; i < 5; i++) add(0.9, 0.025, 0.15, 0, 0.0575, -0.375 + i * 0.1875);
  for (const x of [-0.39, 0, 0.39]) add(0.12, 0.085, 0.9, x, 0.0025, 0);
  for (const z of [-0.39, 0, 0.39]) add(0.9, 0.025, 0.12, 0, -0.0575, z);
  palletGeo = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return palletGeo;
}

/* ------------------------------------------------------------------ forklift */

export interface ForkModel {
  group: THREE.Group;
  carriage: THREE.Group;
  beacon: THREE.Mesh;
}

let forkTemplate: THREE.Group | null = null;

/**
 * A counterbalance forklift, facing +z, about 0.65 wide and 1.3 long (forks to 1.3 ahead). Built
 * once and merged to a handful of draw calls (the body, the lifting carriage, the beacon); every
 * forklift after that is a copy sharing the same geometry.
 */
export function forklift(): ForkModel {
  forkTemplate ??= buildForklift();
  const g = forkTemplate.clone(true);
  const beacon = g.getObjectByName("beacon") as THREE.Mesh;
  beacon.material = (beacon.material as THREE.Material).clone();
  return { group: g, carriage: g.getObjectByName("carriage") as THREE.Group, beacon };
}

function buildForklift() {
  const g = new THREE.Group();
  const yellow = mat(COL.fork, 0.38, 0.05);
  const dark = mat(COL.forkDark, 0.55, 0.1);
  const steel = mat("#7d8494", 0.35, 0.75);
  const black = mat("#17191f", 0.6, 0.2);
  // Chassis, a rounded counterweight with the maker's stripe, footplate.
  g.add(rbox(0.64, 0.34, 0.86, yellow, 0, 0.13, -0.06, 0.06));
  g.add(rbox(0.66, 0.46, 0.32, dark, 0, 0.12, -0.5, 0.1));
  g.add(box(0.67, 0.05, 0.08, mat("#e5484d", 0.5), 0, 0.42, -0.6));
  g.add(box(0.5, 0.03, 0.3, black, 0, 0.47, 0.14));
  // LPG cylinder behind the seat.
  const tank = cyl(0.11, 0.5, mat("#dfe3ea", 0.3, 0.6), 14);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(0, 0.7, -0.5);
  g.add(tank);
  // Seat, steering column and wheel.
  g.add(rbox(0.34, 0.08, 0.3, black, 0, 0.47, -0.17, 0.03));
  g.add(rbox(0.34, 0.32, 0.07, black, 0, 0.55, -0.32, 0.03));
  const column = box(0.05, 0.36, 0.05, black, 0, 0.47, 0.17);
  column.rotation.x = -0.35;
  g.add(column);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 16), black);
  sw.rotation.x = Math.PI / 2 - 0.35;
  sw.position.set(0, 0.86, 0.23);
  g.add(sw);
  // Overhead guard: four posts and a slatted roof.
  for (const [x, z] of [[-0.29, 0.24], [0.29, 0.24], [-0.29, -0.38], [0.29, -0.38]]) g.add(box(0.045, 0.82, 0.045, dark, x, 0.45, z));
  for (const x of [-0.29, 0.29]) g.add(box(0.05, 0.05, 0.68, dark, x, 1.27, -0.07));
  for (let i = 0; i < 5; i++) g.add(box(0.6, 0.03, 0.04, dark, 0, 1.28, 0.22 - i * 0.14));
  // Driver: hi-vis vest, arms on the wheel, a hard hat.
  g.add(rbox(0.26, 0.3, 0.18, mat("#ff8a1f", 0.7), 0, 0.55, -0.15, 0.05));
  g.add(box(0.27, 0.04, 0.19, glow("#e9f2ff"), 0, 0.68, -0.15, false));
  for (const x of [-0.12, 0.12]) {
    const arm = box(0.06, 0.06, 0.24, mat("#ff8a1f", 0.7), x, 0.72, -0.02);
    arm.rotation.x = 0.5;
    g.add(arm);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), mat("#e9b48b", 0.8));
  head.position.set(0, 0.95, -0.15);
  g.add(head);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat("#ffffff", 0.35));
  hat.position.set(0, 0.97, -0.15);
  g.add(hat);
  // Mast: outer and inner channels, a crosshead, lift chains.
  for (const x of [-0.24, 0.24]) {
    g.add(box(0.07, 1.62, 0.08, steel, x, 0.1, 0.42));
    g.add(box(0.05, 1.5, 0.05, mat("#5c6370", 0.4, 0.7), x * 0.78, 0.16, 0.42));
    g.add(box(0.02, 1.35, 0.02, black, x * 0.45, 0.25, 0.455));
  }
  g.add(box(0.56, 0.07, 0.09, steel, 0, 1.66, 0.42));
  g.add(box(0.22, 0.12, 0.04, glow("#fff6d8"), 0, 1.5, 0.47, false));
  // Carriage: the plate, a load backrest and two tapered forks.
  const carriage = new THREE.Group();
  carriage.name = "carriage";
  carriage.userData.dynamic = true;
  carriage.add(box(0.56, 0.26, 0.05, dark, 0, 0, 0.47));
  for (let i = 0; i < 4; i++) carriage.add(box(0.04, 0.42, 0.03, dark, -0.21 + i * 0.14, 0.24, 0.475));
  carriage.add(box(0.56, 0.04, 0.03, dark, 0, 0.64, 0.475));
  for (const x of [-0.17, 0.17]) {
    carriage.add(box(0.08, 0.04, 0.84, steel, x, 0, 0.88));
    carriage.add(box(0.08, 0.3, 0.04, steel, x, 0, 0.49));
  }
  carriage.position.y = 0.1;
  g.add(carriage);
  const rim = mat("#e3e6ec", 0.35, 0.6);
  for (const [x, z, r] of [[-0.34, 0.24, 0.15], [0.34, 0.24, 0.15], [-0.32, -0.46, 0.125], [0.32, -0.46, 0.125]]) {
    const w = wheel(r, 0.13, rim, 14);
    w.position.set(x, r, z);
    g.add(w);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffb020" }));
  beacon.name = "beacon";
  beacon.userData.dynamic = true;
  beacon.position.set(0, 1.34, -0.32);
  g.add(beacon);
  shadows(g);
  beacon.castShadow = false;
  g.add(blob(1.1, 1.7, 0.55));
  mergeStatic(carriage, { palette: true });
  mergeStatic(g, { palette: true });
  return g;
}

/* ------------------------------------------------------------------ truck */

export interface TruckModel {
  group: THREE.Group;
}

export const TRAILER_LEN = 7.2;

const truckTemplates = new Map<number, THREE.Group>();

/**
 * A tractor unit and a curtain-sider trailer with its roof rolled back (so the load shows from
 * above). The origin is the middle of the trailer's rear; the cab points along +z. One merged
 * template per carrier, copied for every truck.
 */
export function truck(carrier: number): TruckModel {
  let t = truckTemplates.get(carrier);
  if (!t) truckTemplates.set(carrier, (t = buildTruck(carrier)));
  return { group: t.clone(true) };
}

function buildTruck(carrier: number) {
  const g = new THREE.Group();
  const c = CARRIERS[carrier];
  const W = 2.4;
  const L = TRAILER_LEN;
  const chassis = mat("#23262e", 0.6, 0.3);
  const alloy = mat("#c8cdd6", 0.3, 0.8);
  const paint = mat(c.color, 0.28, 0.35);
  const stripe = mat(c.stripe, 0.4, 0.2);
  const rim = mat("#d9dde4", 0.3, 0.75);
  // Trailer: chassis rails, a timber floor (the bed top stays at 0.6), side rails, posts and roof bows.
  g.add(box(1.0, 0.22, L, chassis, 0, 0.26, L / 2));
  g.add(box(W, 0.14, L, mat("#9b7a55", 0.85), 0, 0.46, L / 2));
  for (const sx of [-1, 1]) {
    g.add(box(0.08, 0.16, L, alloy, sx * (W / 2 - 0.04), 0.44, L / 2));
    // The curtain, its livery on the outside face (+x is box face 0, −x face 1).
    const plain = mat("#eef1f6", 0.7);
    const faces = [plain, plain, plain, plain, plain, plain];
    faces[sx > 0 ? 0 : 1] = logoMaterial(carrier);
    const curtain = new THREE.Mesh(boxGeo(0.04, 1.85, L - 0.2), faces);
    curtain.position.set(sx * (W / 2 - 0.02), 0.6 + 1.85 / 2, L / 2);
    curtain.castShadow = true;
    curtain.receiveShadow = true;
    g.add(curtain);
    g.add(box(0.07, 0.08, L, alloy, sx * (W / 2 - 0.03), 2.45, L / 2));
    // Side underrun guard and the landing legs.
    g.add(box(0.04, 0.1, L * 0.45, alloy, sx * (W / 2 - 0.1), 0.18, L * 0.5));
    g.add(box(0.1, 0.32, 0.1, chassis, sx * 0.5, 0, L - 1.8));
  }
  for (let z = 0.6; z < L; z += 1.2) g.add(box(W - 0.1, 0.05, 0.05, alloy, 0, 2.47, z));
  // Front bulkhead and the rear door frame with lights.
  g.add(box(W, 2.0, 0.08, mat("#eceff4", 0.6), 0, 0.53, L - 0.04));
  g.add(box(W, 0.12, 0.1, paint, 0, 2.4, L - 0.05));
  for (const sx of [-1, 1]) g.add(box(0.1, 1.95, 0.1, alloy, sx * (W / 2 - 0.05), 0.55, 0.05));
  g.add(box(W, 0.1, 0.1, alloy, 0, 2.4, 0.05));
  g.add(box(W, 0.14, 0.12, chassis, 0, 0.2, 0.0));
  for (const sx of [-1, 1]) {
    g.add(box(0.36, 0.1, 0.03, glow("#ff3b3b"), sx * 0.85, 0.24, -0.07, false));
    g.add(box(0.12, 0.1, 0.03, glow("#ffb020"), sx * 1.1, 0.24, -0.07, false));
  }
  // Tractor: chassis, fifth wheel, fuel tanks and steps, the cab with its fairing.
  g.add(box(1.0, 0.3, 4.2, chassis, 0, 0.3, L + 0.9));
  g.add(box(1.1, 0.06, 0.9, mat("#3a3f4a", 0.5, 0.4), 0, 0.62, L - 0.2));
  for (const sx of [-1, 1]) {
    const tank = cyl(0.26, 1.1, alloy, 14);
    tank.rotation.x = Math.PI / 2;
    tank.position.set(sx * 0.82, 0.5, L + 0.55);
    g.add(tank);
    g.add(box(0.36, 0.04, 0.5, chassis, sx * 1.05, 0.38, L + 1.65));
  }
  g.add(rbox(2.36, 1.95, 1.9, paint, 0, 0.66, L + 1.6, 0.14));
  g.add(rbox(2.3, 0.55, 1.6, paint, 0, 2.52, L + 1.5, 0.18));
  for (const sx of [-1, 1]) g.add(box(0.02, 0.14, 1.7, stripe, sx * 1.19, 1.05, L + 1.62, false));
  // Windscreen, side windows, grille, bumper, lamps, mirrors.
  const glass = mat("#1c2433", 0.08, 0.6);
  const ws = box(2.04, 0.78, 0.05, glass, 0, 1.5, L + 2.57, false);
  ws.rotation.x = -0.08;
  g.add(ws);
  for (const sx of [-1, 1]) g.add(box(0.04, 0.6, 0.9, glass, sx * 1.19, 1.55, L + 1.95, false));
  g.add(rbox(1.5, 0.62, 0.06, mat("#2a2e37", 0.4, 0.6), 0, 0.8, L + 2.56, 0.02));
  for (let i = 0; i < 5; i++) g.add(box(1.4, 0.03, 0.02, alloy, 0, 0.88 + i * 0.1, L + 2.6, false));
  g.add(rbox(2.4, 0.32, 0.22, chassis, 0, 0.32, L + 2.55, 0.06));
  for (const sx of [-0.92, 0.92]) {
    g.add(box(0.34, 0.14, 0.04, glow("#fff6d8"), sx, 0.62, L + 2.6, false));
    g.add(box(0.06, 0.42, 0.06, chassis, sx * 1.35, 1.55, L + 2.3));
    g.add(rbox(0.1, 0.36, 0.18, chassis, sx * 1.42, 1.5, L + 2.3, 0.03));
  }
  // An exhaust stack behind the cab.
  const stack = cyl(0.07, 1.6, alloy, 10);
  stack.position.set(1.0, 2.0, L + 0.55);
  g.add(stack);
  for (const z of [0.85, 1.85, L + 0.45, L + 1.35, L + 2.15])
    for (const sx of [-1, 1]) {
      const w = wheel(0.44, 0.36, rim, 18);
      w.position.set(sx * 0.98, 0.44, z);
      g.add(w);
    }
  shadows(g);
  const sh = blob(3.4, L + 4.0, 0.5);
  sh.position.z = (L + 2.7) / 2;
  g.add(sh);
  mergeStatic(g, { palette: true });
  return g;
}

/* ------------------------------------------------------------------ machines */

export interface MachineModel {
  group: THREE.Group;
  /** Parts that move while it runs (each says how: userData.anim is bob, spin, slide or swing). */
  moving: THREE.Object3D[];
  light: THREE.Mesh;
}

let hazardMat: THREE.MeshStandardMaterial | null = null;
let kilnBrick: THREE.MeshStandardMaterial | null = null;
let rockMat: THREE.MeshStandardMaterial | null = null;

/** A tracked excavator: undercarriage, a turning house with a cab, and a boom, stick and bucket (the `boom` group turns). */
export function excavator(color = "#f2b632") {
  const group = new THREE.Group();
  const paint = mat(color, 0.45, 0.2);
  const dark = mat("#2b2d33", 0.7);
  for (const z of [-0.42, 0.42]) group.add(rbox(1.5, 0.32, 0.3, dark, 0, 0, z, 0.1));
  group.add(box(0.9, 0.2, 0.7, dark, 0, 0.3, 0));
  const boom = new THREE.Group();
  boom.position.set(0, 0.5, 0);
  boom.add(rbox(1.1, 0.55, 0.9, paint, -0.1, 0, 0, 0.06));
  boom.add(rbox(0.45, 0.5, 0.45, paint, 0.15, 0.55, -0.2, 0.05));
  boom.add(box(0.38, 0.3, 0.02, mat("#9cc8ea", 0.1, 0.4), 0.18, 0.68, 0.04, false));
  boom.add(box(0.35, 0.3, 0.86, dark, -0.55, 0.1, 0));
  const arm1 = rbox(0.18, 1.3, 0.16, paint, 0.75, 0.35, 0.15, 0.04);
  arm1.rotation.z = -0.9;
  arm1.position.set(0.85, 0.85, 0.15);
  boom.add(arm1);
  const arm2 = rbox(0.14, 0.9, 0.14, paint, 0, 0, 0, 0.04);
  arm2.rotation.z = 0.5;
  arm2.position.set(1.35, 0.85, 0.15);
  boom.add(arm2);
  boom.add(box(0.36, 0.3, 0.42, dark, 1.55, 0.25, 0.15));
  group.add(boom);
  shadows(group);
  return { group, boom };
}

/** A big dump truck for the quarry: a cab on the left, a ribbed body tipped back, four tall wheels. */
export function haulTruck(color = "#f2b632") {
  const g = new THREE.Group();
  const paint = mat(color, 0.45, 0.2);
  g.add(rbox(3.6, 0.5, 2.2, mat("#2b2d33", 0.7), 0, 0.9, 0, 0.08));
  const bed = rbox(2.6, 1.2, 2.3, paint, 0.4, 1.4, 0, 0.1);
  bed.rotation.z = 0.08;
  g.add(bed);
  g.add(rbox(0.9, 1.0, 1.0, paint, -1.4, 1.4, -0.55, 0.08));
  g.add(box(0.5, 0.4, 0.02, mat("#9cc8ea", 0.1, 0.4), -1.45, 1.85, -0.04, false));
  for (const [x, z] of [[-1.2, -1.1], [-1.2, 1.1], [1.1, -1.1], [1.1, 1.1]]) {
    const wh = wheel(0.75, 0.55, mat("#c9ced8", 0.4, 0.6), 18);
    wh.rotation.y = Math.PI / 2;
    wh.position.set(x, 0.75, z);
    g.add(wh);
  }
  shadows(g);
  return g;
}
const inArrow = new THREE.MeshBasicMaterial({ color: "#3d8bff", transparent: true, opacity: 0.85, depthWrite: false });
const outArrow = new THREE.MeshBasicMaterial({ color: "#2fc488", transparent: true, opacity: 0.85, depthWrite: false });
let chevronGeo: THREE.BufferGeometry | null = null;
/** A flat chevron pointing along +x, for flow arrows. */
function chevron() {
  if (chevronGeo) return chevronGeo;
  const sh = new THREE.Shape();
  sh.moveTo(-0.16, -0.2);
  sh.lineTo(0.02, -0.2);
  sh.lineTo(0.2, 0);
  sh.lineTo(0.02, 0.2);
  sh.lineTo(-0.16, 0.2);
  sh.lineTo(0.02, 0);
  sh.closePath();
  chevronGeo = new THREE.ShapeGeometry(sh);
  chevronGeo.rotateX(-Math.PI / 2);
  return chevronGeo;
}

/** A machine filling w×d tiles from its origin corner; inputs on the left column, outputs on the right (or the other way round, mirrored). */
export function machine(type: MachineType, w: number, d: number, color: string, mirrored = false): MachineModel {
  const style = MACHINES[type].style;
  const g = new THREE.Group();
  const body = mat(color, 0.38, 0.25);
  const grey = mat("#d5d9e4", 0.55, 0.1);
  const dark = mat("#3a3f4c", 0.55, 0.2);
  const steel = mat("#a4abb9", 0.3, 0.75);
  // A safety-yellow outline painted round the machine.
  const paintMat = (hazardMat ??= new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.6 }));
  for (const [px, pz, pw, pd] of [[0, 0, w, 0.08], [0, d - 0.08, w, 0.08], [0, 0, 0.08, d], [w - 0.08, 0, 0.08, d]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), paintMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(px + pw / 2, 0.009, pz + pd / 2);
    m.userData.own = true;
    g.add(m);
  }
  // Conveyors at each end, under the buffers, with arrows for the flow: materials in (blue), goods out (green). A quarry or mine only has the way out.
  const dig = isExtractor(type);
  for (const x of dig ? [mirrored ? 0.5 : w - 0.5] : [0.5, w - 0.5]) {
    g.add(rbox(0.9, 0.45, d - 0.06, grey, x, 0.05, d / 2, 0.04));
    for (let i = 0; i < d * 4; i++) {
      const r = cyl(0.05, 0.86, steel, 8);
      r.rotation.z = Math.PI / 2;
      r.position.set(x, 0.5, 0.15 + i * 0.25);
      g.add(r);
    }
    const out = (x > w / 2) !== mirrored;
    for (let z = 0; z < d; z++) {
      const c = new THREE.Mesh(chevron(), out ? outArrow : inArrow);
      c.position.set(x, 0.57, z + 0.5);
      // Inputs point in, outputs point out.
      c.rotation.y = (x > w / 2) === out ? 0 : Math.PI;
      c.renderOrder = 2;
      g.add(c);
    }
  }
  const moving: THREE.Object3D[] = [];
  const anim = (o: THREE.Object3D, how: "bob" | "spin" | "slide" | "swing" | "wheel") => {
    o.userData.anim = how;
    moving.push(o);
    return o;
  };
  const mid = w / 2;
  const inner = w - 2;
  const brickMat = (kilnBrick ??= new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.9 }));
  if (style === "pit") {
    // A stepped rock face along the back, a dirt floor, and an excavator swinging its bucket.
    const rock = (rockMat ??= new THREE.MeshStandardMaterial({ map: rockTexture(), roughness: 0.95 }));
    const dirt = mat("#a88b67", 0.95);
    g.add(box(w - 1.1, 0.06, d - 0.1, dirt, mid - 0.45, 0, d / 2, false));
    const benches = [[1.9, 0.75], [1.25, 1.35], [0.65, 1.9]] as const;
    benches.forEach(([h, dd], i) => g.add(box(w - 1.2 - i * 0.2, h, dd * 0.6, rock, mid - 0.45, 0, 0.05 + (dd * 0.6) / 2 + i * 0.02)));
    // Loose rock at the foot of the face.
    for (let i = 0; i < 6; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + (i % 3) * 0.07, 0), rock);
      r.position.set(0.6 + i * ((w - 2.2) / 5), 0.12, 1.3 + (i % 2) * 0.25);
      r.rotation.set(i, i * 2, 0);
      r.castShadow = true;
      g.add(r);
    }
    const ex = excavator(color);
    ex.group.position.set(mid - 0.2, 0, d - 0.85);
    ex.group.rotation.y = Math.PI;
    g.add(ex.group);
    g.add(anim(ex.boom, "swing"));
  } else if (style === "shaft") {
    // A headframe over the shaft: two legs, a back stay, the winding wheels on top, and a winding house.
    const red = body;
    const hole = new THREE.Mesh(boxGeo(1.4, 0.04, 1.4), mat("#101216", 0.9));
    hole.position.set(mid - 0.3, 0.03, d / 2);
    g.add(hole);
    g.add(rbox(1.7, 0.18, 1.7, dark, mid - 0.3, 0, d / 2, 0.04));
    for (const z of [d / 2 - 0.75, d / 2 + 0.75]) {
      const leg = box(0.16, 4.6, 0.16, red, mid - 0.95, 0, z);
      g.add(leg);
      const leg2 = box(0.16, 4.6, 0.16, red, mid + 0.35, 0, z);
      g.add(leg2);
      const stay = box(0.14, 4.4, 0.14, red, mid + 0.95, 0, z);
      stay.rotation.z = 0.32;
      stay.position.x = mid + 0.95 - 0.7;
      g.add(stay);
    }
    for (const y of [1.3, 2.6, 3.8]) g.add(box(1.4, 0.1, 1.66, red, mid - 0.3, y, d / 2));
    g.add(box(1.6, 0.2, 1.8, dark, mid - 0.3, 4.55, d / 2));
    for (const z of [d / 2 - 0.4, d / 2 + 0.4]) {
      const sheave = new THREE.Group();
      sheave.position.set(mid - 0.3, 5.15, z);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 24), steel);
      rim.castShadow = true;
      sheave.add(rim);
      for (let k = 0; k < 4; k++) {
        const spoke = box(0.05, 1.0, 0.05, steel, 0, -0.5, 0);
        spoke.rotation.z = (k * Math.PI) / 4;
        sheave.add(spoke);
      }
      g.add(anim(sheave, "wheel"));
    }
    // Ropes down into the shaft.
    for (const z of [d / 2 - 0.4, d / 2 + 0.4]) g.add(box(0.03, 4.6, 0.03, mat("#2b2d33", 0.6), mid - 0.75, 0.5, z, false));
    const cage = box(0.6, 0.8, 0.6, mat("#d5d9e4", 0.5, 0.4), mid - 0.3, 0.2, d / 2);
    g.add(anim(cage, "bob"));
    // The winding house behind, with its roof and a door.
    g.add(rbox(1.0, 1.6, d - 0.6, mat("#c9b9a1", 0.85), w - 1.6, 0, d / 2, 0.05));
    g.add(box(1.1, 0.12, d - 0.5, dark, w - 1.6, 1.6, d / 2));
    g.add(box(0.04, 0.9, 0.5, mat("#6b4a2f", 0.7), w - 2.12, 0, d / 2));
  } else if (style === "crusher") {
    // A hopper over a jaw that chews, a flywheel turning, a short belt out.
    g.add(rbox(inner, 0.5, d - 0.4, dark, mid, 0, d / 2, 0.05));
    const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.35, 0.9, 4, 1, true), mat(color, 0.5, 0.3));
    hopper.rotation.y = Math.PI / 4;
    hopper.position.set(mid - 0.1, 1.7, d / 2);
    hopper.castShadow = true;
    (hopper.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    g.add(hopper);
    g.add(box(0.9, 0.8, 0.9, body, mid - 0.1, 0.5, d / 2));
    g.add(anim(box(0.7, 0.5, 0.12, steel, mid - 0.1, 0.85, d / 2 + 0.5), "bob"));
    const fly = new THREE.Mesh(cylGeo(0.42, 0.42, 0.1, 20), dark);
    fly.rotation.x = Math.PI / 2;
    fly.position.set(mid + 0.45, 0.95, d / 2 - 0.55);
    g.add(anim(fly, "spin"));
  } else if (style === "furnace") {
    // A blast furnace: a tall shell on a hearth, a skip hoist up its side, a glowing tap hole and a ladle car.
    g.add(rbox(inner, 0.5, d - 0.3, mat("#5c5149", 0.9), mid, 0, d / 2, 0.05));
    const shell = new THREE.Mesh(cylGeo(0.55, 0.85, 3.4, 20), mat("#4b5263", 0.45, 0.6));
    shell.position.set(mid - 0.2, 2.2, d / 2);
    shell.castShadow = true;
    g.add(shell);
    const top = new THREE.Mesh(cylGeo(0.2, 0.55, 0.6, 16), mat("#3a3f4c", 0.5, 0.5));
    top.position.set(mid - 0.2, 4.2, d / 2);
    g.add(top);
    const stack = cyl(0.1, 1.4, steel, 10);
    stack.position.set(mid - 0.2, 5.2, d / 2);
    g.add(stack);
    for (let k = 0; k < 4; k++) g.add(box(1.25 + k * 0.08, 0.08, 1.25 + k * 0.08, body, mid - 0.2, 1.0 + k * 0.8, d / 2, false));
    const hoist = box(0.25, 4.2, 0.25, steel, mid + 0.95, 0, d / 2 - 0.5);
    hoist.rotation.z = 0.35;
    hoist.position.x = mid + 0.35;
    g.add(hoist);
    g.add(box(0.5, 0.3, 0.06, glow("#ff7a1a"), mid - 0.2, 0.62, d / 2 + 0.86, false));
    g.add(anim(cyl(0.3, 0.45, mat("#2b2d33", 0.6, 0.3), 14), "slide"));
    moving[moving.length - 1].position.set(mid - 0.2, 0.75, d - 0.3);
    g.add(box(0.5, 0.06, 0.5, glow("#ffb24a"), mid - 0.2, 0.98, d - 0.3, false));
  } else if (style === "kiln") {
    // A brick kiln: a long vaulted chamber, glowing arches, a tall chimney and bricks stacked to cool.
    g.add(box(inner, 1.2, d - 0.3, brickMat, mid, 0, d / 2));
    const vault = new THREE.Mesh(new THREE.CylinderGeometry((d - 0.3) / 2, (d - 0.3) / 2, inner, 16, 1, false, 0, Math.PI), brickMat);
    vault.rotation.z = Math.PI / 2;
    vault.rotation.y = Math.PI / 2;
    vault.position.set(mid, 1.2, d / 2);
    vault.castShadow = true;
    g.add(vault);
    for (let i = 0; i < 3; i++) g.add(box(0.36, 0.55, 0.04, glow("#ff8a2a"), mid - inner / 2 + 0.45 + i * ((inner - 0.9) / 2), 0.1, d - 0.14, false));
    const chimney = cyl(0.22, 3.6, brickMat, 12, 0.3);
    chimney.position.set(mid + inner / 2 - 0.35, 3.0, 0.4);
    g.add(chimney);
    g.add(box(0.5, 0.12, 0.5, dark, mid + inner / 2 - 0.35, 4.8, 0.4));
  } else if (style === "press") {
    g.add(rbox(inner, 0.6, d - 0.3, dark, mid, 0, d / 2, 0.06));
    for (const [x, z] of [[mid - inner / 2 + 0.3, 0.3], [mid + inner / 2 - 0.3, 0.3], [mid - inner / 2 + 0.3, d - 0.3], [mid + inner / 2 - 0.3, d - 0.3]]) g.add(rbox(0.3, 2.6, 0.3, body, x, 0, z, 0.05));
    g.add(rbox(inner, 0.5, d - 0.2, body, mid, 2.5, d / 2, 0.08));
    const ram = box(inner - 0.8, 0.5, d - 0.8, steel, mid, 1.3, d / 2);
    g.add(anim(ram, "bob"));
  } else if (style === "saw") {
    g.add(rbox(inner, 0.85, d - 0.2, grey, mid, 0, d / 2, 0.06));
    g.add(box(0.15, 1.6, 0.15, body, mid - 0.4, 0.85, 0.15));
    g.add(box(0.15, 1.6, 0.15, body, mid - 0.4, 0.85, d - 0.15));
    g.add(rbox(0.3, 0.3, d - 0.1, body, mid - 0.4, 2.3, d / 2, 0.05));
    const blade = new THREE.Mesh(cylGeo(0.35, 0.35, 0.04, 24), steel);
    blade.rotation.x = Math.PI / 2;
    blade.position.set(mid, 1.15, d / 2);
    g.add(anim(blade, "spin"));
  } else if (style === "smt") {
    g.add(rbox(inner, 0.9, d - 0.4, body, mid, 0, d / 2, 0.06));
    const hood = new THREE.Mesh(boxGeo(inner - 0.2, 0.6, d - 0.6), new THREE.MeshPhysicalMaterial({ color: "#d6f1ff", transparent: true, opacity: 0.35, roughness: 0.05, transmission: 0, clearcoat: 1 }));
    hood.position.set(mid, 1.2, d / 2);
    g.add(hood);
    for (let i = 0; i < 3; i++) g.add(anim(box(0.25, 0.3, 0.25, dark, mid - inner / 2 + 0.6 + i * ((inner - 1.2) / 2), 1.05, d / 2), "slide"));
    g.add(box(0.5, 0.4, 0.06, glow("#3f7bff"), mid, 0.9, 0.18, false));
  } else if (style === "oven") {
    // A long insulated oven with a glowing window and a flue; trays slide through it.
    g.add(rbox(inner, 1.5, d - 0.3, body, mid, 0, d / 2, 0.1));
    g.add(rbox(inner + 0.1, 0.12, d - 0.2, dark, mid, 1.5, d / 2, 0.04));
    g.add(box(inner - 0.4, 0.22, 0.04, glow("#ffb24a"), mid, 0.7, 0.12, false));
    g.add(box(inner - 0.4, 0.22, 0.04, glow("#ffb24a"), mid, 0.7, d - 0.12, false));
    const flue = cyl(0.18, 1.4, steel, 14);
    flue.position.set(mid + inner / 2 - 0.5, 2.3, d / 2);
    g.add(flue);
    g.add(anim(box(0.8, 0.08, d - 0.6, steel, mid, 0.55, d / 2), "slide"));
  } else if (style === "tank") {
    // Stainless vats with domed tops, pipework between them and a stirrer turning in each.
    const n = Math.max(1, Math.round(inner / 1.4));
    g.add(rbox(inner, 0.25, d - 0.2, dark, mid, 0, d / 2, 0.05));
    for (let i = 0; i < n; i++) {
      const x = mid - inner / 2 + (inner / n) * (i + 0.5);
      const r = Math.min(0.62, (inner / n) * 0.42, d * 0.32);
      const vat = cyl(r, 1.7, steel, 20);
      vat.position.set(x, 1.1, d / 2);
      g.add(vat);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel);
      dome.position.set(x, 1.95, d / 2);
      dome.castShadow = true;
      dome.userData.own = true;
      g.add(dome);
      g.add(box(r * 2 + 0.04, 0.12, 0.06, body, x, 1.2, d / 2 - r - 0.02));
      const stir = box(0.5, 0.06, 0.08, dark, x, 2.35, d / 2);
      g.add(anim(stir, "spin"));
      g.add(box(0.06, 0.4, 0.06, dark, x, 1.98, d / 2));
    }
    const pipe = cyl(0.06, inner, mat("#c9ced8", 0.3, 0.8), 8);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(mid, 0.55, d - 0.25);
    g.add(pipe);
  } else if (style === "loom") {
    // A frame strung with threads (or a sewing table), and a beater bar sweeping across.
    g.add(rbox(inner, 0.75, d - 0.3, grey, mid, 0, d / 2, 0.05));
    for (const z of [0.25, d - 0.25]) {
      g.add(box(0.12, 1.5, 0.12, body, mid - inner / 2 + 0.2, 0.75, z));
      g.add(box(0.12, 1.5, 0.12, body, mid + inner / 2 - 0.2, 0.75, z));
    }
    g.add(box(inner - 0.2, 0.12, 0.12, body, mid, 2.2, 0.25));
    g.add(box(inner - 0.2, 0.12, 0.12, body, mid, 2.2, d - 0.25));
    const thread = mat(color, 0.6);
    for (let i = 0; i < 9; i++) g.add(box(0.025, 1.35, 0.02, thread, mid - inner / 2 + 0.4 + i * ((inner - 0.8) / 8), 0.8, d / 2, false));
    g.add(anim(box(0.1, 0.1, d - 0.6, dark, mid, 1.3, d / 2), "slide"));
  } else if (style === "line") {
    // An assembly line: a long low bed, a gantry, and robot arms either side of the work.
    g.add(rbox(inner, 0.55, d - 0.5, grey, mid, 0, d / 2, 0.05));
    for (const x of [mid - inner / 2 + 0.15, mid + inner / 2 - 0.15]) {
      g.add(box(0.15, 2.4, 0.15, body, x, 0, 0.2));
      g.add(box(0.15, 2.4, 0.15, body, x, 0, d - 0.2));
    }
    g.add(box(inner, 0.2, 0.2, body, mid, 2.3, 0.2));
    g.add(box(inner, 0.2, 0.2, body, mid, 2.3, d - 0.2));
    const arms = Math.max(2, Math.floor(inner / 1.5));
    for (let i = 0; i < arms; i++) {
      const x = mid - inner / 2 + (inner / arms) * (i + 0.5);
      const z = i % 2 ? d - 0.7 : 0.7;
      const base = cyl(0.26, 0.25, dark, 16);
      base.position.set(x, 0.68, z);
      g.add(base);
      const arm = new THREE.Group();
      arm.position.set(x, 0.8, z);
      const a1 = rbox(0.18, 0.9, 0.18, body, 0, 0, 0, 0.06);
      a1.rotation.x = i % 2 ? 0.4 : -0.4;
      arm.add(a1);
      const a2 = rbox(0.14, 0.7, 0.14, body, 0, 0.7, i % 2 ? -0.5 : 0.5, 0.05);
      a2.rotation.x = i % 2 ? 1.3 : -1.3;
      arm.add(a2);
      g.add(anim(arm, "swing"));
    }
  } else {
    // An assembly or robot cell: a guarded table and a robot arm.
    g.add(rbox(inner, 0.75, d - 0.4, grey, mid, 0, d / 2, 0.05));
    const fence = new THREE.MeshStandardMaterial({ color: "#f6c21c", transparent: true, opacity: 0.35, roughness: 0.4 });
    g.add(box(inner, 1.4, 0.04, fence, mid, 0.75, 0.25, false));
    const base = cyl(0.35, 0.3, dark, 18);
    base.position.set(mid, 0.9, d / 2);
    g.add(base);
    const arm = new THREE.Group();
    arm.position.set(mid, 1.05, d / 2);
    const a1 = rbox(0.24, 1.1, 0.24, body, 0, 0, 0, 0.08);
    a1.rotation.z = 0.35;
    arm.add(a1);
    const a2 = rbox(0.2, 0.9, 0.2, body, -0.6, 0.9, 0, 0.07);
    a2.rotation.z = 1.4;
    arm.add(a2);
    g.add(anim(arm, "swing"));
  }
  // A status beacon on a post.
  g.add(box(0.06, 2.8, 0.06, dark, w - 1.05, 0, 0.12));
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), new THREE.MeshBasicMaterial({ color: "#3ddc84" }));
  light.position.set(w - 1.05, 2.9, 0.12);
  g.add(light);
  shadows(g);
  g.traverse((o) => {
    if ((o as THREE.Mesh).material === inArrow || (o as THREE.Mesh).material === outArrow) o.castShadow = false;
  });
  for (const m of moving) m.userData.dynamic = true;
  light.userData.dynamic = true;
  return { group: g, moving, light };
}

/* ------------------------------------------------------------------ facilities */

const glassWall = new THREE.MeshStandardMaterial({ color: "#bcd8f0", transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0.2, depthWrite: false });

/** A glass-walled sales office from its corner: low walls, glazing, desks with screens, a sign. */
export function salesOffice(w: number, d: number, sign: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const frame = mat("#3a414f", 0.45, 0.5);
  const carpet = mat("#5b6b86", 0.95);
  const desk = mat("#e8e2d6", 0.6);
  const screen = glow("#7fb3ff");
  g.add(box(w - 0.1, 0.03, d - 0.1, carpet, w / 2, 0, d / 2, false));
  // Low walls, then glazing above, on a slim frame.
  for (const [x, z, ww, dd] of [[w / 2, 0.06, w - 0.1, 0.08], [w / 2, d - 0.06, w - 0.1, 0.08], [0.06, d / 2, 0.08, d - 0.1], [w - 0.06, d / 2, 0.08, d - 0.1]] as [number, number, number, number][]) {
    g.add(box(ww, 0.9, dd, mat("#eef1f6", 0.5), x, 0, z));
    const pane = new THREE.Mesh(boxGeo(ww, 1.2, dd * 0.5), glassWall);
    pane.position.set(x, 1.5, z);
    g.add(pane);
    g.add(box(ww, 0.06, dd, frame, x, 2.1, z));
  }
  for (const [x, z] of [[0.06, 0.06], [w - 0.06, 0.06], [0.06, d - 0.06], [w - 0.06, d - 0.06]]) g.add(box(0.09, 2.16, 0.09, frame, x, 0, z));
  // Desks in a row with screens and chairs.
  for (let i = 0; i < Math.floor(w); i++) {
    const x = 0.5 + i;
    g.add(box(0.75, 0.05, 0.5, desk, x, 0.72, d / 2 - 0.2));
    g.add(box(0.05, 0.72, 0.05, frame, x - 0.32, 0, d / 2 - 0.2));
    g.add(box(0.05, 0.72, 0.05, frame, x + 0.32, 0, d / 2 - 0.2));
    g.add(box(0.36, 0.24, 0.03, screen, x, 0.8, d / 2 - 0.36, false));
    g.add(box(0.36, 0.42, 0.36, mat("#2b2f3a", 0.7), x, 0.25, d / 2 + 0.35));
  }
  const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42), sign);
  s.position.set(w / 2, 2.35, d - 0.02);
  s.userData.own = true;
  g.add(s);
  g.add(box(1.7, 0.5, 0.04, frame, w / 2, 2.1, d - 0.05));
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== glassWall) o.castShadow = true;
  });
  return g;
}

/** A break room from its corner: a small cabin with a coffee machine, a fridge, a table and a sofa. */
export function breakRoom(w: number, d: number, sign: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const wall = mat("#f2efe8", 0.6);
  const trim = mat("#1f9d74", 0.45);
  g.add(box(w - 0.1, 0.03, d - 0.1, mat("#c9a77c", 0.8), w / 2, 0, d / 2, false));
  // Three walls (open to the front, so you can see in), a green band round the top.
  g.add(box(w - 0.1, 2.0, 0.08, wall, w / 2, 0, 0.06));
  g.add(box(0.08, 2.0, d - 0.1, wall, 0.06, 0, d / 2));
  g.add(box(0.08, 2.0, d - 0.1, wall, w - 0.06, 0, d / 2));
  g.add(box(w - 0.1, 0.12, 0.1, trim, w / 2, 1.9, 0.06));
  g.add(box(0.1, 0.12, d - 0.1, trim, 0.06, 1.9, d / 2));
  g.add(box(0.1, 0.12, d - 0.1, trim, w - 0.06, 1.9, d / 2));
  // A fridge, a coffee machine on a counter, a table with chairs, a sofa.
  g.add(rbox(0.5, 1.5, 0.45, mat("#dfe3ea", 0.35, 0.3), 0.4, 0, 0.35, 0.04));
  g.add(box(0.9, 0.85, 0.42, mat("#8d6e52", 0.7), 1.2, 0, 0.32));
  g.add(box(0.26, 0.34, 0.26, mat("#2b2f3a", 0.4, 0.3), 1.0, 0.85, 0.3));
  g.add(box(0.1, 0.05, 0.03, glow("#ff6b3d"), 1.0, 1.02, 0.44, false));
  const table = cyl(0.32, 0.05, mat("#e8e2d6", 0.6), 18);
  table.position.set(w / 2, 0.72, d / 2 + 0.2);
  g.add(table);
  g.add(box(0.06, 0.7, 0.06, mat("#3a414f", 0.5), w / 2, 0, d / 2 + 0.2));
  for (const a of [0, Math.PI]) g.add(rbox(0.28, 0.42, 0.28, mat("#1f9d74", 0.6), w / 2 + Math.cos(a) * 0.5, 0, d / 2 + 0.2, 0.05));
  g.add(rbox(0.4, 0.45, 1.2, mat("#5b6b86", 0.85), w - 0.35, 0, d / 2 + 0.1, 0.1));
  const s = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.36), sign);
  s.position.set(w / 2, 1.6, 0.11);
  s.userData.own = true;
  g.add(s);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}

/** A safety-fence tile centred on its tile: a post, and rails out to each neighbour that's fence too. */
export function fenceTile(links: { e: boolean; s: boolean; w: boolean; n: boolean }): THREE.Group {
  const g = new THREE.Group();
  const yellow = mat("#f5c518", 0.45, 0.2);
  const black = mat("#1d2027", 0.6);
  g.add(box(0.12, 1.0, 0.12, yellow, 0, 0, 0));
  g.add(box(0.14, 0.12, 0.14, black, 0, 1.0, 0));
  g.add(box(0.22, 0.04, 0.22, black, 0, 0, 0));
  const rail = (dx: number, dz: number) => {
    for (const y of [0.45, 0.85]) g.add(box(Math.abs(dx) ? 0.5 : 0.06, 0.07, Math.abs(dz) ? 0.5 : 0.06, yellow, dx * 0.25, y, dz * 0.25));
  };
  if (links.e) rail(1, 0);
  if (links.w) rail(-1, 0);
  if (links.s) rail(0, 1);
  if (links.n) rail(0, -1);
  // A lone post gets a short barrier of its own, across the tile.
  if (!links.e && !links.w && !links.s && !links.n) for (const y of [0.45, 0.85]) g.add(box(0.9, 0.07, 0.06, yellow, 0, y, 0));
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}

/* ------------------------------------------------------------------ conveyors */

let beltTex: THREE.CanvasTexture | null = null;
/** The rubber belt, with chevrons pointing the way it runs (scroll its offset to make it move). */
export function beltTexture() {
  if (beltTex) return beltTex;
  beltTex = canvasTex(128, 64, (g) => {
    g.fillStyle = "#2a2d34";
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = "rgba(255,255,255,0.05)";
    for (let x = 0; x < 128; x += 8) g.fillRect(x, 0, 3, 64);
    g.fillStyle = "#f5c518";
    for (const x0 of [16, 80]) {
      g.beginPath();
      g.moveTo(x0, 14);
      g.lineTo(x0 + 14, 14);
      g.lineTo(x0 + 30, 32);
      g.lineTo(x0 + 14, 50);
      g.lineTo(x0, 50);
      g.lineTo(x0 + 16, 32);
      g.closePath();
      g.fill();
    }
  }) as THREE.CanvasTexture;
  beltTex.wrapS = THREE.RepeatWrapping;
  return beltTex;
}

/** A conveyor tile, running along +x, centred on the origin: frame, legs, end rollers and the belt. */
export function belt(beltMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const frame = mat("#8b94a6", 0.35, 0.7);
  const leg = mat("#4b5263", 0.5, 0.5);
  for (const z of [-0.4, 0.4]) {
    g.add(box(1, 0.12, 0.07, frame, 0, 0.27, z));
    for (const x of [-0.38, 0.38]) g.add(box(0.06, 0.28, 0.06, leg, x, 0, z));
  }
  for (const x of [-0.42, 0.42]) {
    const r = cyl(0.06, 0.74, frame, 10);
    r.rotation.x = Math.PI / 2;
    r.position.set(x, 0.33, 0);
    g.add(r);
  }
  const top = new THREE.Mesh(boxGeo(1, 0.05, 0.74), beltMat);
  top.position.set(0, 0.365, 0);
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);
  return g;
}

/* ------------------------------------------------------------------ scenery */

const leafGeos: THREE.BufferGeometry[] = [];
/** A lumpy ball of leaves (a few shared shapes), welded so the bumps don't crack it open. */
function leafGeo(i: number) {
  if (!leafGeos.length)
    for (let k = 0; k < 4; k++) {
      let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 2);
      g.deleteAttribute("normal");
      g.deleteAttribute("uv");
      g = mergeVertices(g);
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const x = p.getX(v);
        const y = p.getY(v);
        const z = p.getZ(v);
        const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + k * 11.3) * 43758.5453;
        const f = 0.84 + 0.3 * (h - Math.floor(h));
        p.setXYZ(v, x * f, y * f * 0.88, z * f);
      }
      g.computeVertexNormals();
      leafGeos.push(g);
    }
  return leafGeos[i % leafGeos.length];
}

/** A broadleaf tree: a tapered trunk and lumpy crowns in two greens. */
export function tree(n: number) {
  const g = new THREE.Group();
  const trunk = cyl(0.09, 1.1, mat("#7b5b3e", 0.9), 7, 0.14);
  trunk.position.y = 0.55;
  g.add(trunk);
  const greens = ["#5d9a4f", "#4f8d52", "#6aa458", "#58955f"];
  const leaf = mat(greens[n % greens.length], 0.85);
  const leaf2 = mat(greens[(n + 1) % greens.length], 0.85);
  const k = 3 + (n % 2);
  for (let i = 0; i < k; i++) {
    const s = new THREE.Mesh(leafGeo(n + i), i % 2 ? leaf2 : leaf);
    const sc = 0.62 - i * 0.07;
    s.scale.setScalar(sc);
    const a = (n * 2.3 + i * 2.1) % (Math.PI * 2);
    s.position.set(Math.cos(a) * 0.28 * (i ? 1 : 0), 1.35 + i * 0.32, Math.sin(a) * 0.28 * (i ? 1 : 0));
    s.castShadow = true;
    s.receiveShadow = true;
    g.add(s);
  }
  return g;
}

/** A pine: layered cones on a short trunk (snow on the tips when it's cold). */
export function pine(n: number, snow = false) {
  const g = new THREE.Group();
  const trunk = cyl(0.08, 0.6, mat("#6b4e35", 0.9), 6);
  trunk.position.y = 0.3;
  g.add(trunk);
  const needles = mat(n % 2 ? "#3f7a5b" : "#356f55", 0.85);
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(cylGeo(0.0, 0.95 - i * 0.24, 1.3 - i * 0.18, 8), snow && i === 2 ? mat("#f4f8fc", 0.6) : needles);
    c.position.y = 0.9 + i * 0.62;
    c.castShadow = true;
    c.receiveShadow = true;
    g.add(c);
  }
  return g;
}

/** A blue map pin, its point at the origin. */
export function pin() {
  const g = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: COL.pin, roughness: 0.25, metalness: 0.1, emissive: COL.pin, emissiveIntensity: 0.3 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), blue);
  head.position.y = 1.35;
  g.add(head);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.95, 20), blue);
  cone.rotation.x = Math.PI;
  cone.position.y = 0.75;
  g.add(cone);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  dot.position.set(0, 1.38, 0.32);
  g.add(dot);
  return g;
}

/** A shared emissive material for lamps: its intensity follows the time of day. */
export const lampMat = new THREE.MeshStandardMaterial({ color: "#dcdfe5", emissive: "#ffe7b0", emissiveIntensity: 0, roughness: 0.35, metalness: 0.2 });
export const windowMat = new THREE.MeshStandardMaterial({ color: "#8fb4dc", emissive: "#ffd998", emissiveIntensity: 0, roughness: 0.05, metalness: 0.55 });

export interface TrainModel {
  group: THREE.Group;
}

const trainTemplates = new Map<number, THREE.Group>();

/** A shunting locomotive and two flat wagons, running along +x. The origin is the middle of the two wagons. */
export function train(carrier: number): TrainModel {
  let t = trainTemplates.get(carrier);
  if (!t) trainTemplates.set(carrier, (t = buildTrain(carrier)));
  return { group: t.clone(true) };
}

function buildTrain(carrier: number) {
  const g = new THREE.Group();
  const c = CARRIERS[carrier];
  const dark = mat("#2a2e38", 0.6, 0.2);
  const steel = mat("#7d8494", 0.4, 0.6);
  const rim = mat("#9aa1ad", 0.4, 0.7);
  const wagon = (cx: number) => {
    g.add(box(4.6, 0.25, 2.6, mat("#55606f", 0.55, 0.35), cx, 0.65, 0));
    g.add(box(4.7, 0.12, 2.65, mat("#e5484d", 0.5, 0.2), cx, 0.53, 0));
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) g.add(box(0.08, 0.7, 0.08, steel, cx - 2.2 + i * 1.47, 0.9, sx * 1.25));
    for (const wx of [-1.7, -1.0, 1.0, 1.7])
      for (const sz of [-0.85, 0.85]) {
        const w = wheel(0.32, 0.12, rim, 14);
        w.rotation.y = Math.PI / 2;
        w.position.set(cx + wx, 0.32, sz);
        g.add(w);
      }
  };
  wagon(-2.4);
  wagon(2.4);
  // The locomotive at the front (+x).
  const paint = mat(c.color, 0.3, 0.3);
  const lx = 8.4;
  g.add(box(7, 0.4, 2.6, dark, lx, 0.5, 0));
  g.add(rbox(4.6, 1.9, 2.2, paint, lx - 1, 0.9, 0, 0.12));
  g.add(rbox(2, 2.6, 2.5, paint, lx + 2.3, 0.9, 0, 0.16));
  g.add(rbox(2.02, 0.3, 2.52, mat(c.stripe, 0.45), lx + 2.3, 2.6, 0, 0.1));
  const glass = mat("#1c2433", 0.08, 0.6);
  g.add(box(0.05, 0.7, 2.0, glass, lx + 3.32, 2.2, 0, false));
  g.add(box(0.1, 0.12, 0.3, glow("#fff6d8"), lx + 3.35, 1.3, 0, false));
  g.add(box(4.6, 0.2, 2.25, mat(c.stripe, 0.45), lx - 1, 1.5, 0));
  for (const wx of [-2.8, -1.6, 1.6, 2.8])
    for (const sz of [-0.85, 0.85]) {
      const w = wheel(0.36, 0.14, rim, 14);
      w.rotation.y = Math.PI / 2;
      w.position.set(lx + wx, 0.36, sz);
      g.add(w);
    }
  shadows(g);
  const sh = blob(18, 3.6, 0.45);
  sh.position.x = 3;
  g.add(sh);
  mergeStatic(g, { palette: true });
  return g;
}

/** A charging bay: a cabinet and two charging posts with status lights, 2×1 tiles from its corner. */
export function charger() {
  const g = new THREE.Group();
  g.add(rbox(1.9, 1.3, 0.5, mat("#eef1f6", 0.45), 1, 0, 0.3, 0.06));
  g.add(rbox(1.92, 0.08, 0.55, mat("#2fae7e", 0.45), 1, 1.3, 0.3, 0.03));
  const leds: THREE.Mesh[] = [];
  for (const x of [0.5, 1.5]) {
    g.add(rbox(0.22, 1.1, 0.22, mat("#3a3f4c", 0.5), x, 0, 0.75, 0.05));
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: "#3ddc84" }));
    led.position.set(x, 1.0, 0.87);
    led.userData.dynamic = true;
    g.add(led);
    leds.push(led);
    // A charging spot painted in front.
    const spot = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ color: "#2fae7e", transparent: true, opacity: 0.35 }));
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(x, 0.007, 1.5);
    g.add(spot);
  }
  g.add(box(0.5, 0.35, 0.05, glow("#2fae7e"), 1, 0.85, 0.56, false));
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).geometry.type.startsWith("Plane")) o.castShadow = true;
  });
  return { group: g, leds };
}

export interface PersonModel {
  group: THREE.Group;
  legs: THREE.Mesh[];
}

const personTemplates = new Map<number, THREE.Group>();

/** A warehouse worker in a hi-vis vest with reflective bands, and a hard hat (twelve looks, each merged once and copied). */
export function person(n: number): PersonModel {
  const k = n % 12;
  let t = personTemplates.get(k);
  if (!t) personTemplates.set(k, (t = buildPerson(k)));
  const g = t.clone(true);
  return { group: g, legs: [g.getObjectByName("hip0") as THREE.Mesh, g.getObjectByName("hip1") as THREE.Mesh] };
}

function buildPerson(n: number) {
  const g = new THREE.Group();
  const trousers = mat(["#2c3443", "#3b3f4a", "#24314a"][n % 3], 0.8);
  [-0.07, 0.07].forEach((x, i) => {
    const l = box(0.1, 0.42, 0.1, trousers, 0, -0.42, 0);
    const hip = new THREE.Group();
    hip.name = `hip${i}`;
    hip.userData.dynamic = true;
    hip.position.set(x, 0.45, 0);
    l.position.y = -0.21;
    hip.add(l);
    g.add(hip);
  });
  const vest = mat(n % 2 ? "#ff8a1f" : "#d9f23a", 0.6);
  g.add(rbox(0.28, 0.42, 0.17, vest, 0, 0.44, 0, 0.05));
  for (const y of [0.56, 0.68]) g.add(box(0.29, 0.03, 0.18, glow("#eef4ff"), 0, y, 0, false));
  for (const x of [-0.18, 0.18]) g.add(rbox(0.07, 0.36, 0.08, vest, x, 0.5, 0, 0.03));
  const skin = mat(["#f0c7a0", "#c99a72", "#8d5f3d", "#e8b88f"][n % 4], 0.8);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), skin);
  head.position.y = 0.96;
  g.add(head);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(n % 3 === 0 ? "#f6c21c" : "#ffffff", 0.35));
  hat.position.y = 0.99;
  g.add(hat);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  g.add(blob(0.55, 0.55, 0.45));
  mergeStatic(g, { palette: true });
  return g;
}

/** A parked car, facing +z. */
export function car(n: number) {
  const g = new THREE.Group();
  const cols = ["#e8ecf4", "#2f6fe4", "#c63d3d", "#2b2f3a", "#9aa4b1", "#f0b429", "#1f9d74"];
  const paint = mat(cols[n % cols.length], 0.25, 0.45);
  g.add(rbox(1.76, 0.6, 4.1, paint, 0, 0.22, 0, 0.18));
  g.add(rbox(1.5, 0.52, 2.1, paint, 0, 0.72, -0.2, 0.2));
  const glass = mat("#1f2a3a", 0.05, 0.7);
  g.add(box(1.52, 0.4, 2.0, glass, 0, 0.78, -0.2, false));
  for (const x of [-0.78, 0.78])
    for (const z of [-1.3, 1.3]) {
      const w = wheel(0.32, 0.22, mat("#c8cdd6", 0.3, 0.8), 12);
      w.position.set(x, 0.32, z);
      g.add(w);
    }
  for (const x of [-0.6, 0.6]) {
    g.add(box(0.36, 0.1, 0.04, glow("#fff6d8"), x, 0.55, 2.05, false));
    g.add(box(0.36, 0.1, 0.04, glow("#d93636"), x, 0.6, -2.05, false));
  }
  shadows(g);
  return g;
}

/** A two-storey glass office with a canopy and a rooftop sign. w along x, d along z. */
export function office(w: number, d: number) {
  const g = new THREE.Group();
  const frame = mat("#eef1f6", 0.5);
  const dark = mat("#3a414f", 0.5, 0.4);
  g.add(box(w + 0.2, 0.3, d + 0.2, mat("#a9afba", 0.8), 0, 0, 0));
  g.add(box(w - 0.3, 5.6, d - 0.3, windowMat, 0, 0.3, 0));
  for (let x = -w / 2 + 0.15; x <= w / 2; x += 1.6) g.add(box(0.12, 5.6, d + 0.02, dark, x, 0.3, 0));
  for (let z = -d / 2 + 0.15; z <= d / 2; z += 1.6) g.add(box(w + 0.02, 5.6, 0.12, dark, 0, 0.3, z));
  for (const y of [0.3, 3.0, 5.8]) g.add(box(w + 0.05, 0.25, d + 0.05, frame, 0, y, 0));
  g.add(box(w + 0.4, 0.3, d + 0.4, frame, 0, 6.0, 0));
  g.add(box(w + 0.42, 0.08, d + 0.42, mat(COL.fascia, 0.4), 0, 6.3, 0));
  // Rooftop plant.
  g.add(rbox(2, 0.8, 1.4, mat("#c9ced8", 0.5, 0.3), w / 4, 6.3, -d / 4, 0.06));
  g.add(rbox(1.2, 0.6, 1.2, mat("#c9ced8", 0.5, 0.3), -w / 4, 6.3, -d / 5, 0.06));
  // The entrance canopy.
  g.add(box(3.6, 0.15, 2, frame, 0, 2.6, d / 2 + 1));
  for (const x of [-1.6, 1.6]) g.add(box(0.1, 2.6, 0.1, dark, x, 0, d / 2 + 1.9));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.2), new THREE.MeshBasicMaterial({ map: signTexture("WAREFORGE", COL.fascia), transparent: true }));
  sign.position.set(0, 7.1, d / 2 - 0.5);
  g.add(sign);
  g.add(box(5.2, 0.12, 0.12, frame, 0, 6.4, d / 2 - 0.5));
  shadows(g);
  return g;
}

/** The gatehouse and a barrier arm (returned so it can lift). */
export function gatehouse() {
  const g = new THREE.Group();
  g.add(rbox(2.4, 2.6, 2.4, mat("#eef1f6", 0.5), 0, 0, 0, 0.06));
  g.add(box(2.42, 0.9, 2.42, windowMat, 0, 1.3, 0));
  g.add(rbox(2.8, 0.2, 2.8, mat(COL.fascia, 0.45), 0, 2.6, 0, 0.05));
  g.add(box(0.3, 1.0, 0.3, mat("#f6c21c", 0.45), 1.6, 0, 1.4));
  const arm = new THREE.Group();
  arm.position.set(1.6, 0.95, 1.4);
  arm.userData.dynamic = true;
  arm.add(box(5.5, 0.12, 0.12, mat("#d94848", 0.45), 2.75, -0.06, 0));
  for (let i = 0; i < 4; i++) arm.add(box(0.6, 0.125, 0.125, mat("#ffffff", 0.45), 0.9 + i * 1.3, -0.065, 0));
  g.add(arm);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { group: g, arm };
}

/** A street lamp; its head glows at night. */
export function streetLamp() {
  const g = new THREE.Group();
  const pole = mat("#6d7482", 0.45, 0.6);
  g.add(cylAt(0.07, 5.2, pole, 0, 0, 0));
  g.add(box(1.2, 0.08, 0.08, pole, 0.55, 5.1, 0));
  g.add(rbox(0.62, 0.12, 0.3, mat("#3a414f", 0.5, 0.4), 1.1, 5.02, 0, 0.04));
  g.add(box(0.5, 0.03, 0.22, lampMat, 1.1, 5.0, 0, false));
  return g;
}

function cylAt(r: number, h: number, m: THREE.Material, x: number, y: number, z: number) {
  const c = cyl(r, h, m, 10);
  c.position.set(x, y + h / 2, z);
  return c;
}

/** A ship-to-shore container crane (for the harbor). */
export function crane(color: string) {
  const g = new THREE.Group();
  const m = mat(color, 0.45, 0.3);
  for (const x of [-3, 3]) for (const z of [-2.5, 2.5]) g.add(box(0.5, 14, 0.5, m, x, 0, z));
  g.add(box(6.5, 0.8, 0.8, m, 0, 13, -2.5));
  g.add(box(6.5, 0.8, 0.8, m, 0, 13, 2.5));
  g.add(box(0.8, 0.8, 26, m, -2.2, 14, 6));
  g.add(box(0.8, 0.8, 26, m, 2.2, 14, 6));
  g.add(box(3, 2, 2.2, mat("#e8ecf4", 0.45), 0, 12.6, 9));
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}

export const CONTAINER_COLORS = ["#c93f3f", "#2f6fe4", "#1f8f6a", "#e0692f", "#6e52d8", "#dfe3ea", "#e3a51f"];
