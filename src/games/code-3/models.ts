import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries as mergeRaw } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Merge geometries whether or not they're indexed (RoundedBoxGeometry isn't; primitives are). */
function mergeGeometries(list: THREE.BufferGeometry[]) {
  const out = mergeRaw(list.map((g) => (g.index ? g.toNonIndexed() : g)));
  if (!out) throw new Error("Code 3: couldn't merge model geometry");
  return out;
}
import type { CarKind } from "./vehicles";
import { SPECS } from "./vehicles";

/**
 * Detailed procedural models for Code 3.
 *
 * Cars: rounded clear-coated bodies, tinted reflective glass, chrome trim,
 * spoked rims on turning/steering wheels, door seams and handles, mirrors,
 * number plates, head/tail/reverse lamps with glow, and full police, unmarked
 * and ambulance liveries with multi-segment light bars.
 *
 * People: capsule limbs, hands, shoes, neck, faces, hair styles, and officers
 * with caps, vests (POLICE on the back), duty belts, holsters and radios.
 *
 * Car local frame: +x forward, +y up, +z to the driver's right.
 */

/** Rounded-box segments: 2 for detailed cars, 1 (a chamfer) for low detail and parked cars. */
let SEG = 2;
const rbox = (w: number, h: number, d: number, r: number, x: number, y: number, z: number, seg = SEG) =>
  new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)).translate(x, y, z);
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** A rounded box whose top is pulled in front-to-back (windscreen and rear-window rake). */
function cabinGeo(len: number, h: number, wid: number, x: number, y: number, rakeF: number, rakeB: number) {
  const g = new RoundedBoxGeometry(len, h, wid, SEG, 0.1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const py = p.getY(i);
    const k = (py + h / 2) / h; // 0 at the bottom, 1 at the top
    const px = p.getX(i);
    p.setX(i, px > 0 ? px - rakeF * k : px + rakeB * k);
    p.setZ(i, p.getZ(i) * (1 - 0.1 * k));
  }
  g.computeVertexNormals();
  return g.translate(x, y, 0);
}

/**
 * The lower body as a real side silhouette: flat floor with arches cut over
 * the wheels, a rounded nose, a bonnet rising to the cowl, the beltline under
 * the glasshouse, the boot deck (or a flat load bed / van back) and the tail,
 * extruded across the car with rounded (bevelled) edges.
 */
function lowerBody(L: number, W: number, y0: number, top: number, wheel: number, xw: number, xr: number, flatBack: boolean, hi: boolean) {
  const s = new THREE.Shape();
  const R = Math.max(wheel * 0.8, Math.min(wheel + 0.08, top - 0.06 - wheel));
  const wy = wheel;
  const nose = Math.min(0.35, L * 0.07);
  s.moveTo(-L / 2 + 0.12, y0);
  for (const wx of [-L * 0.32, L * 0.32]) {
    const base = Math.max(y0, wy);
    const a0 = Math.asin(Math.min(0.99, (base - wy) / R));
    s.lineTo(wx - R * Math.cos(a0), base);
    s.absarc(wx, wy, R, Math.PI - a0, a0, true);
    s.lineTo(wx + R * Math.cos(a0), y0);
  }
  s.lineTo(L / 2 - 0.12, y0);
  s.quadraticCurveTo(L / 2, y0, L / 2, y0 + 0.12);
  s.lineTo(L / 2, top - 0.2);
  s.quadraticCurveTo(L / 2, top - 0.03, L / 2 - nose, top - 0.03);
  s.lineTo(xw + 0.05, top + 0.02);
  s.lineTo(xr, top + 0.02);
  if (flatBack) {
    s.lineTo(-L / 2 + 0.08, top);
    s.quadraticCurveTo(-L / 2, top, -L / 2, top - 0.1);
  } else {
    s.lineTo(Math.min(xr - 0.05, -L / 2 + 0.3), top + 0.01);
    s.quadraticCurveTo(-L / 2, top, -L / 2, top - 0.17);
  }
  s.lineTo(-L / 2, y0 + 0.12);
  s.quadraticCurveTo(-L / 2, y0, -L / 2 + 0.12, y0);
  const bt = 0.08;
  const g = new THREE.ExtrudeGeometry(s, {
    depth: W - 2 * bt,
    bevelEnabled: true,
    bevelThickness: bt,
    bevelSize: 0.05,
    bevelOffset: -0.05,
    bevelSegments: hi ? 3 : 1,
    curveSegments: hi ? 10 : 4,
  });
  return g.translate(0, 0, -(W - 2 * bt) / 2);
}

/** The glasshouse: raked screen, rounded roofline, rear window; extruded to `width`. */
function greenhouse(xw: number, xr: number, top: number, h: number, rakeF: number, rakeB: number, width: number, hi: boolean) {
  const s = new THREE.Shape();
  s.moveTo(xw, top);
  s.lineTo(xw - rakeF, top + h - 0.05);
  s.quadraticCurveTo(xw - rakeF - 0.03, top + h, xw - rakeF - 0.14, top + h);
  s.lineTo(xr + rakeB + 0.14, top + h);
  s.quadraticCurveTo(xr + rakeB + 0.03, top + h, xr + rakeB, top + h - 0.05);
  s.lineTo(xr, top);
  s.lineTo(xw, top);
  const bt = 0.04;
  const g = new THREE.ExtrudeGeometry(s, {
    depth: width - 2 * bt,
    bevelEnabled: true,
    bevelThickness: bt,
    bevelSize: 0.03,
    bevelOffset: -0.03,
    bevelSegments: hi ? 2 : 1,
    curveSegments: hi ? 6 : 2,
  });
  return g.translate(0, 0, -(width - 2 * bt) / 2);
}

interface Shape {
  bodyH: number;
  clear: number;
  cabFrom: number;
  cabTo: number;
  cabH: number;
  rakeF: number;
  rakeB: number;
  wheel: number;
  bed?: boolean;
  boxy?: boolean;
}

const SHAPES: Record<CarKind, Shape> = {
  sedan: { bodyH: 0.6, clear: 0.3, cabFrom: -0.3, cabTo: 0.17, cabH: 0.56, rakeF: 0.5, rakeB: 0.32, wheel: 0.34 },
  cruiser: { bodyH: 0.63, clear: 0.3, cabFrom: -0.3, cabTo: 0.17, cabH: 0.56, rakeF: 0.5, rakeB: 0.32, wheel: 0.35 },
  slicktop: { bodyH: 0.62, clear: 0.3, cabFrom: -0.3, cabTo: 0.17, cabH: 0.55, rakeF: 0.5, rakeB: 0.32, wheel: 0.35 },
  suv: { bodyH: 0.8, clear: 0.42, cabFrom: -0.45, cabTo: 0.15, cabH: 0.64, rakeF: 0.38, rakeB: 0.06, wheel: 0.4 },
  interceptor: { bodyH: 0.78, clear: 0.4, cabFrom: -0.45, cabTo: 0.15, cabH: 0.62, rakeF: 0.38, rakeB: 0.06, wheel: 0.4 },
  van: { bodyH: 1.05, clear: 0.38, cabFrom: -0.49, cabTo: 0.3, cabH: 0.85, rakeF: 0.35, rakeB: 0, wheel: 0.38, boxy: true },
  transport: { bodyH: 1.15, clear: 0.4, cabFrom: -0.49, cabTo: 0.3, cabH: 0.9, rakeF: 0.35, rakeB: 0, wheel: 0.4, boxy: true },
  ambulance: { bodyH: 1.25, clear: 0.42, cabFrom: -0.49, cabTo: 0.32, cabH: 1.0, rakeF: 0.35, rakeB: 0, wheel: 0.42, boxy: true },
  pickup: { bodyH: 0.78, clear: 0.45, cabFrom: -0.06, cabTo: 0.22, cabH: 0.62, rakeF: 0.32, rakeB: 0.04, wheel: 0.42, bed: true },
  sports: { bodyH: 0.48, clear: 0.18, cabFrom: -0.26, cabTo: 0.1, cabH: 0.44, rakeF: 0.62, rakeB: 0.5, wheel: 0.34 },
  pursuit: { bodyH: 0.5, clear: 0.2, cabFrom: -0.26, cabTo: 0.12, cabH: 0.45, rakeF: 0.58, rakeB: 0.45, wheel: 0.35 },
};

// ------------------------------------------------------------------ textures

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let glowTex: THREE.Texture | null = null;
export function glowTexture() {
  return (glowTex ??= canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(255,255,255,0.55)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }));
}

const textTex = new Map<string, THREE.Texture>();
function lettering(text: string, color: string, bg = "rgba(0,0,0,0)", w = 512, h = 128, font = "bold 84px Arial, sans-serif") {
  const key = `${text}|${color}|${bg}|${w}|${h}`;
  let t = textTex.get(key);
  if (!t) {
    t = canvasTex(w, h, (g) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = color;
      g.font = font;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, w / 2, h / 2 + 4, w - 16);
    });
    textTex.set(key, t);
  }
  return t;
}

function plateTexture(plate: string) {
  return canvasTex(256, 56, (g) => {
    g.fillStyle = "#f4f4ef";
    g.fillRect(0, 0, 256, 56);
    g.strokeStyle = "#1c3f7a";
    g.lineWidth = 4;
    g.strokeRect(3, 3, 250, 50);
    g.fillStyle = "#b3141b";
    g.font = "bold 11px Arial";
    g.textAlign = "center";
    g.fillText("B A Y V I E W", 128, 14);
    g.fillStyle = "#1c3f7a";
    g.font = "bold 34px 'Courier New', monospace";
    g.fillText(plate, 128, 46);
  });
}

function badgeTexture(kind: "police" | "ems") {
  return canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    if (kind === "police") {
      // Seven-point star badge.
      g.fillStyle = "#c9a227";
      g.beginPath();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 118 : 62;
        g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.fillStyle = "#12305e";
      g.beginPath();
      g.arc(128, 128, 52, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      g.font = "bold 26px Arial";
      g.textAlign = "center";
      g.fillText("BPD", 128, 138);
    } else {
      // Star of life.
      g.fillStyle = "#1f5fbf";
      for (let i = 0; i < 3; i++) {
        g.save();
        g.translate(128, 128);
        g.rotate((i * Math.PI) / 3);
        g.fillRect(-24, -110, 48, 220);
        g.restore();
      }
      g.fillStyle = "#fff";
      g.fillRect(122, 60, 12, 136);
    }
  });
}

// ------------------------------------------------------------------ materials

const M = {
  glass: new THREE.MeshPhysicalMaterial({ color: "#0b1016", metalness: 0.1, roughness: 0.04, envMapIntensity: 1.6, clearcoat: 1, transparent: true, opacity: 0.92 }),
  trim: new THREE.MeshStandardMaterial({ color: "#121315", roughness: 0.7, metalness: 0.2 }),
  chrome: new THREE.MeshStandardMaterial({ color: "#d9dde2", metalness: 1, roughness: 0.14 }),
  tyre: new THREE.MeshStandardMaterial({ color: "#101011", roughness: 0.92 }),
  rim: new THREE.MeshStandardMaterial({ color: "#b8bec6", metalness: 0.95, roughness: 0.22 }),
  rimDark: new THREE.MeshStandardMaterial({ color: "#26292d", metalness: 0.8, roughness: 0.35 }),
  seam: new THREE.MeshBasicMaterial({ color: "#050505" }),
  white: new THREE.MeshPhysicalMaterial({ color: "#f1f3f5", metalness: 0.3, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 }),
  headLens: new THREE.MeshPhysicalMaterial({ color: "#e9eef2", emissive: "#fff3d6", emissiveIntensity: 0.3, roughness: 0.05, metalness: 0.2, clearcoat: 1 }),
  reverse: new THREE.MeshStandardMaterial({ color: "#dddddd", emissive: "#ffffff", emissiveIntensity: 0 }),
  plateBack: new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.6 }),
  interior: new THREE.MeshStandardMaterial({ color: "#1b1c1f", roughness: 0.95 }),
  stripeRed: new THREE.MeshStandardMaterial({ color: "#c8102e", roughness: 0.4 }),
};
const paints = new Map<string, THREE.MeshPhysicalMaterial>();
function paint(color: string) {
  let m = paints.get(color);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1 });
    paints.set(color, m);
  }
  return m;
}

// ---------------------------------------------------------------------- cars

interface CarGeo {
  body: THREE.BufferGeometry;
  white?: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  chrome: THREE.BufferGeometry;
  seams: THREE.BufferGeometry;
  heads: THREE.BufferGeometry;
  tails: THREE.BufferGeometry;
  reverse: THREE.BufferGeometry;
  amberL: THREE.BufferGeometry;
  amberR: THREE.BufferGeometry;
  interior: THREE.BufferGeometry;
  stripe?: THREE.BufferGeometry;
  tyre: THREE.BufferGeometry;
  rim: THREE.BufferGeometry;
}

const geoCache = new Map<string, CarGeo>();

function carGeometry(kind: CarKind, detail: "high" | "low"): CarGeo {
  const cacheKey = `${kind}|${detail}`;
  const hit = geoCache.get(cacheKey);
  if (hit) return hit;
  SEG = detail === "high" ? 2 : 1;
  const s = SPECS[kind];
  const sh = SHAPES[kind];
  const L = s.len;
  const W = s.wid;
  const y0 = sh.clear;
  const top = y0 + sh.bodyH;
  const body: THREE.BufferGeometry[] = [];
  const white: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const chrome: THREE.BufferGeometry[] = [];
  const seams: THREE.BufferGeometry[] = [];
  const stripe: THREE.BufferGeometry[] = [];
  const police = !!s.police && kind !== "slicktop" && kind !== "ambulance" && kind !== "transport";
  const whiteBody = kind === "ambulance" || kind === "transport";
  const bodyList = whiteBody ? white : body;

  // Lower body: the real side silhouette (nose, bonnet, beltline, boot, tail,
  // cut-out wheel arches) extruded across the car with rounded edges.
  const hi = detail === "high";
  const xw = sh.boxy ? L * 0.3 : sh.cabTo * L; // windscreen base
  const xr = sh.cabFrom * L; // rear-window base
  bodyList.push(lowerBody(L, W, y0, top, sh.wheel, xw, xr, !!sh.boxy || !!sh.bed, hi));

  const cl = (sh.cabTo - sh.cabFrom) * L;
  const cx = ((sh.cabTo + sh.cabFrom) / 2) * L;
  const cy = top + sh.cabH / 2;
  if (!sh.boxy) {
    // Glasshouse: body-coloured shell (roof, pillars) with glass set into it.
    const roofList = police ? white : bodyList;
    roofList.push(greenhouse(xw, xr, top, sh.cabH, sh.rakeF, sh.rakeB, W * 0.84, hi));
    glass.push(greenhouse(xw + 0.012, xr - 0.012, top + 0.05, sh.cabH - 0.1, sh.rakeF * 0.94, sh.rakeB * 0.94, W * 0.855, hi));
    // A- and C-pillars along the screen edges, in body colour.
    const pillar = (x0: number, y0p: number, x1: number, y1p: number, z: number) => {
      const len = Math.hypot(x1 - x0, y1p - y0p);
      const g = new THREE.BoxGeometry(len, 0.07, 0.05).rotateZ(Math.atan2(y1p - y0p, x1 - x0)).translate((x0 + x1) / 2, (y0p + y1p) / 2, z);
      roofList.push(g);
    };
    for (const z of [W * 0.428, -W * 0.428]) {
      pillar(xw + 0.01, top + 0.02, xw - sh.rakeF + 0.03, top + sh.cabH - 0.02, z);
      pillar(xr - 0.01, top + 0.02, xr + sh.rakeB - 0.03, top + sh.cabH - 0.02, z);
    }
  }
  if (sh.boxy) {
    // Box body behind a raked cab.
    const boxLen = L * 0.7;
    bodyList.push(rbox(boxLen, sh.cabH + 0.05, W, 0.08, -L * 0.15, cy + 0.02, 0));
    glass.push(cabinGeo(L * 0.2, sh.cabH * 0.92, W * 0.98, L * 0.31, cy - 0.02, sh.rakeF, 0));
    glass.push(box(0.02, sh.cabH * 0.4, W * 0.8, -L / 2 - 0.005, cy + 0.12, 0));
    // Side windows on the box for vans; windowless for ambulance/transport.
    if (kind === "van") for (const zz of [W / 2 + 0.003, -W / 2 - 0.003]) glass.push(box(boxLen * 0.3, sh.cabH * 0.45, 0.01, L * 0.02, cy + 0.12, zz));
    if (kind === "ambulance") for (const zz of [W / 2 + 0.006, -W / 2 - 0.006]) stripe.push(box(L * 0.99, 0.18, 0.012, 0, y0 + sh.bodyH * 0.62, zz));
  } else {
    // B-pillars between the side windows.
    const roofX = cx + (sh.rakeB - sh.rakeF) / 2;
    for (const zz of [W * 0.43, -W * 0.43]) bodyList.push(box(0.08, sh.cabH * 0.9, 0.03, roofX + 0.05, cy, zz));
  }
  if (sh.bed) {
    bodyList.push(box(L * 0.4, 0.38, 0.07, -L * 0.29, top + 0.18, W / 2 - 0.04));
    bodyList.push(box(L * 0.4, 0.38, 0.07, -L * 0.29, top + 0.18, -W / 2 + 0.04));
    bodyList.push(box(0.07, 0.38, W, -L / 2 + 0.04, top + 0.18, 0));
    trim.push(box(L * 0.4, 0.02, W - 0.14, -L * 0.29, top + 0.01, 0));
  }

  // Bumpers, grille, sills, arches.
  trim.push(rbox(0.2, 0.26, W * 1.02, 0.06, L / 2 - 0.02, y0 + 0.14, 0));
  trim.push(rbox(0.2, 0.26, W * 1.02, 0.06, -L / 2 + 0.02, y0 + 0.14, 0));
  trim.push(box(L * 0.62, 0.07, W * 1.015, 0, y0 + 0.035, 0));
  trim.push(box(0.03, sh.bodyH * 0.28, W * 0.5, L / 2 + 0.005, y0 + sh.bodyH * 0.5, 0)); // grille
  chrome.push(box(0.035, 0.025, W * 0.52, L / 2 + 0.01, y0 + sh.bodyH * 0.66, 0));
  chrome.push(box(0.03, 0.03, W * 0.9, -L / 2 - 0.02, y0 + 0.3, 0));
  for (const wx of [L * 0.32, -L * 0.32])
    for (const zz of [W / 2 + 0.005, -W / 2 - 0.005])
      trim.push(new THREE.CylinderGeometry(sh.wheel + 0.07, sh.wheel + 0.07, 0.05, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(0).translate(wx, y0 + 0.02, zz));

  // Door seams and chrome handles on both sides.
  if (!sh.boxy)
    for (const zz of [W / 2 + 0.004, -W / 2 - 0.004]) {
      const zs = Math.sign(zz);
      for (const sx of [cx + cl * 0.42, cx, cx - cl * 0.42]) seams.push(box(0.012, sh.bodyH * 0.9, 0.006, sx, y0 + sh.bodyH * 0.52, zz));
      for (const hx of [cx + cl * 0.18, cx - cl * 0.24]) chrome.push(box(0.16, 0.035, 0.03, hx, top - 0.14, zz + zs * 0.012));
      // Mirror.
      bodyList.push(rbox(0.14, 0.1, 0.18, 0.03, cx + cl * 0.42, top + 0.12, zz + zs * 0.1));
      glass.push(box(0.01, 0.07, 0.14, cx + cl * 0.42 - 0.075, top + 0.12, zz + zs * 0.1));
    }

  const lensY = y0 + sh.bodyH * 0.72;
  const heads = mergeGeometries([rbox(0.06, 0.13, 0.36, 0.03, L / 2 - 0.005, lensY, W / 2 - 0.3), rbox(0.06, 0.13, 0.36, 0.03, L / 2 - 0.005, lensY, -W / 2 + 0.3)]);
  const tails = mergeGeometries([rbox(0.06, 0.14, 0.34, 0.03, -L / 2 + 0.005, lensY, W / 2 - 0.27), rbox(0.06, 0.14, 0.34, 0.03, -L / 2 + 0.005, lensY, -W / 2 + 0.27)]);
  const reverse = mergeGeometries([box(0.05, 0.05, 0.1, -L / 2 - 0.01, lensY - 0.12, W / 2 - 0.45), box(0.05, 0.05, 0.1, -L / 2 - 0.01, lensY - 0.12, -W / 2 + 0.45)]);
  // Indicators: front corner and rear, per side (left = -z).
  const side = (z: number) => mergeGeometries([box(0.05, 0.05, 0.14, L / 2 - 0.005, lensY - 0.14, z * (W / 2 - 0.18)), box(0.05, 0.06, 0.12, -L / 2 + 0.005, lensY - 0.12, z * (W / 2 - 0.16))]);
  const amberL = side(-1);
  const amberR = side(1);
  // Seats and dash seen through the glass.
  const interior = sh.boxy
    ? box(L * 0.18, 0.5, W * 0.8, L * 0.3, top + 0.25, 0)
    : mergeGeometries([box(cl * 0.5, 0.45, W * 0.8, cx - cl * 0.05, top + 0.2, 0), box(0.3, 0.12, W * 0.85, cx + cl * 0.34, top + 0.08, 0)]);

  // Wheels (built at the origin; placed and spun per car).
  const radial = detail === "high" ? 22 : 12;
  const tyre = new THREE.CylinderGeometry(sh.wheel, sh.wheel, 0.26, radial).rotateX(Math.PI / 2);
  const rimParts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(sh.wheel * 0.66, sh.wheel * 0.66, 0.27, radial).rotateX(Math.PI / 2)];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    rimParts.push(
      new THREE.BoxGeometry(0.06, sh.wheel * 1.2, 0.02)
        .rotateZ(a)
        .translate(0, 0, 0.14),
    );
  }
  rimParts.push(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 10).rotateX(Math.PI / 2));

  const out: CarGeo = {
    body: mergeGeometries(body.length ? body : [box(0.01, 0.01, 0.01, 0, 0, 0)]),
    white: white.length ? mergeGeometries(white) : undefined,
    glass: mergeGeometries(glass),
    trim: mergeGeometries(trim),
    chrome: mergeGeometries(chrome),
    seams: mergeGeometries(seams.length ? seams : [box(0.001, 0.001, 0.001, 0, 0, 0)]),
    heads,
    tails,
    reverse,
    amberL,
    amberR,
    interior,
    stripe: stripe.length ? mergeGeometries(stripe) : undefined,
    tyre,
    rim: mergeGeometries(rimParts),
  };
  geoCache.set(cacheKey, out);
  return out;
}

export interface CarModel {
  group: THREE.Group;
  tail: THREE.MeshStandardMaterial;
  heads: THREE.Mesh;
  reverse: THREE.Mesh;
  /** Wheel pivots: front-left, front-right, rear-left, rear-right. */
  wheels: THREE.Group[];
  /** Additive glow sprites (shown at night / when lit). */
  headGlow: THREE.Sprite[];
  tailGlow: THREE.Sprite[];
  /** Emergency lamps and their glows (red / blue, or red / white for EMS). */
  red?: THREE.MeshStandardMaterial;
  blue?: THREE.MeshStandardMaterial;
  redGlow?: THREE.Sprite[];
  blueGlow?: THREE.Sprite[];
  smoke?: THREE.Mesh;
  /** Faked headlight pool on the road ahead (night). */
  beam: THREE.Mesh;
  /** Indicator lamps (left / right). */
  amberL: THREE.MeshStandardMaterial;
  amberR: THREE.MeshStandardMaterial;
}

let beamTex: THREE.Texture | null = null;
function beamTexture() {
  return (beamTex ??= canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 96, 4, 64, 60, 70);
    gr.addColorStop(0, "rgba(255,245,220,0.9)");
    gr.addColorStop(0.5, "rgba(255,240,210,0.35)");
    gr.addColorStop(1, "rgba(255,240,210,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }));
}

function sprite(color: string, size: number, x: number, y: number, z: number) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  s.position.set(x, y, z);
  s.renderOrder = 5;
  return s;
}

export function buildCar(kind: CarKind, color: string, plate = "", detail: "high" | "low" = "high"): CarModel {
  const g = carGeometry(kind, detail);
  const s = SPECS[kind];
  const sh = SHAPES[kind];
  const group = new THREE.Group();
  const policeLivery = !!s.police && kind !== "slicktop" && kind !== "ambulance" && kind !== "transport";
  const body = paint(policeLivery ? "#0c0e12" : kind === "slicktop" ? "#1b2230" : color);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, cast = false) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = cast;
    group.add(mesh);
    return mesh;
  };
  add(g.body, body, true);
  if (g.white) add(g.white, M.white, true);
  add(g.glass, M.glass);
  add(g.trim, M.trim);
  add(g.chrome, M.chrome);
  add(g.interior, M.interior);
  if (detail === "high") add(g.seams, M.seam);
  if (g.stripe) add(g.stripe, M.stripeRed);
  const heads = add(g.heads, M.headLens.clone());
  const tail = new THREE.MeshStandardMaterial({ color: "#5a0b0b", emissive: "#ff1a1a", emissiveIntensity: 0.3, roughness: 0.2 });
  add(g.tails, tail);
  const reverse = add(g.reverse, M.reverse.clone());
  const amberL = new THREE.MeshStandardMaterial({ color: "#6a3a00", emissive: "#ff9a1a", emissiveIntensity: 0.1 });
  const amberR = amberL.clone();
  add(g.amberL, amberL);
  add(g.amberR, amberR);

  // Wheels.
  const wheels: THREE.Group[] = [];
  const L = s.len;
  const W = s.wid;
  for (const [wx, wz] of [
    [L * 0.32, -W / 2 + 0.14],
    [L * 0.32, W / 2 - 0.14],
    [-L * 0.32, -W / 2 + 0.14],
    [-L * 0.32, W / 2 - 0.14],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, sh.wheel, wz);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(g.tyre, M.tyre);
    tyre.castShadow = true;
    const rim = new THREE.Mesh(g.rim, policeLivery ? M.rimDark : M.rim);
    if (wz < 0) rim.rotation.y = Math.PI; // spokes face outward on both sides
    spin.add(tyre, rim);
    pivot.add(spin);
    group.add(pivot);
    wheels.push(pivot);
  }

  // Number plates.
  if (plate) {
    const pm = new THREE.MeshStandardMaterial({ map: plateTexture(plate), roughness: 0.4, emissive: "#ffffff", emissiveIntensity: 0, emissiveMap: null });
    const y = sh.clear + 0.3;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.114), pm);
    back.position.set(-L / 2 - 0.13, y, 0);
    back.rotation.y = -Math.PI / 2;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.114), pm);
    front.position.set(L / 2 + 0.13, sh.clear + 0.2, 0);
    front.rotation.y = Math.PI / 2;
    group.add(back, front);
  }

  // Glows.
  const lensY = sh.clear + sh.bodyH * 0.72;
  const headGlow = [sprite("#fff1d6", 1.1, L / 2 + 0.1, lensY, W / 2 - 0.3), sprite("#fff1d6", 1.1, L / 2 + 0.1, lensY, -W / 2 + 0.3)];
  const tailGlow = [sprite("#ff2020", 0.7, -L / 2 - 0.08, lensY, W / 2 - 0.27), sprite("#ff2020", 0.7, -L / 2 - 0.08, lensY, -W / 2 + 0.27)];
  group.add(...headGlow, ...tailGlow);
  const beam = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 7).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(L / 2 + 6.5, 0.05, 0),
    new THREE.MeshBasicMaterial({ map: beamTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
  );
  beam.renderOrder = 2;
  group.add(beam);

  const model: CarModel = { group, tail, heads, reverse, wheels, headGlow, tailGlow, beam, amberL, amberR };

  if (s.police) {
    const ems = kind === "ambulance";
    const red = new THREE.MeshStandardMaterial({ color: "#4a0000", emissive: "#ff1020", emissiveIntensity: 0, roughness: 0.2 });
    const blue = new THREE.MeshStandardMaterial({ color: ems ? "#555" : "#00104a", emissive: ems ? "#ffffff" : "#1848ff", emissiveIntensity: 0, roughness: 0.2 });
    const roof = sh.clear + sh.bodyH + sh.cabH + (sh.boxy ? 0.05 : 0.07);
    const cx = ((sh.cabTo + sh.cabFrom) / 2) * L;
    const redGlow: THREE.Sprite[] = [];
    const blueGlow: THREE.Sprite[] = [];
    const glowCol = ems ? "#ffffff" : "#2a5cff";
    if (kind === "slicktop") {
      // Visor bar behind the windscreen, grille strobes, rear deck.
      group.add(new THREE.Mesh(box(0.05, 0.07, 0.42, cx + 0.42, roof - 0.16, -0.3), red), new THREE.Mesh(box(0.05, 0.07, 0.42, cx + 0.42, roof - 0.16, 0.3), blue));
      group.add(new THREE.Mesh(box(0.03, 0.05, 0.14, L / 2 + 0.01, sh.clear + 0.4, -0.35), red), new THREE.Mesh(box(0.03, 0.05, 0.14, L / 2 + 0.01, sh.clear + 0.4, 0.35), blue));
      group.add(new THREE.Mesh(box(0.05, 0.05, 0.3, cx - 0.9, roof - 0.2, -0.3), red), new THREE.Mesh(box(0.05, 0.05, 0.3, cx - 0.9, roof - 0.2, 0.3), blue));
      redGlow.push(sprite("#ff2030", 1.3, cx + 0.5, roof - 0.16, -0.3), sprite("#ff2030", 0.9, L / 2 + 0.1, sh.clear + 0.4, -0.35));
      blueGlow.push(sprite(glowCol, 1.3, cx + 0.5, roof - 0.16, 0.3), sprite(glowCol, 0.9, L / 2 + 0.1, sh.clear + 0.4, 0.35));
    } else {
      const bx = sh.boxy ? L * 0.27 : cx;
      const bw = W * 0.9;
      // Base, clear housing, and eight LED heads.
      group.add(new THREE.Mesh(rbox(0.34, 0.07, bw, 0.03, bx, roof, 0), M.trim));
      for (let i = 0; i < 4; i++) {
        const z = -bw / 2 + 0.12 + (i * (bw / 2 - 0.1)) / 4;
        group.add(new THREE.Mesh(box(0.26, 0.09, bw / 9, bx, roof + 0.08, z), red));
        group.add(new THREE.Mesh(box(0.26, 0.09, bw / 9, bx, roof + 0.08, -z), blue));
      }
      group.add(new THREE.Mesh(rbox(0.3, 0.11, bw, 0.04, bx, roof + 0.08, 0), new THREE.MeshPhysicalMaterial({ color: "#ffffff", transparent: true, opacity: 0.18, roughness: 0.05 })));
      redGlow.push(sprite("#ff2030", 1.6, bx, roof + 0.12, -bw * 0.3), sprite("#ff2030", 1.1, bx, roof + 0.12, -bw * 0.1));
      blueGlow.push(sprite(glowCol, 1.6, bx, roof + 0.12, bw * 0.3), sprite(glowCol, 1.1, bx, roof + 0.12, bw * 0.1));
      // Grille lights and rear strobes.
      group.add(new THREE.Mesh(box(0.03, 0.05, 0.14, L / 2 + 0.01, sh.clear + sh.bodyH * 0.5, -0.25), red), new THREE.Mesh(box(0.03, 0.05, 0.14, L / 2 + 0.01, sh.clear + sh.bodyH * 0.5, 0.25), blue));
      redGlow.push(sprite("#ff2030", 0.8, L / 2 + 0.1, sh.clear + sh.bodyH * 0.5, -0.25));
      blueGlow.push(sprite(glowCol, 0.8, L / 2 + 0.1, sh.clear + sh.bodyH * 0.5, 0.25));
      if (policeLivery) {
        // Push bar, A-pillar spotlight, antenna.
        if (kind !== "pursuit") {
          group.add(new THREE.Mesh(mergeGeometries([box(0.06, 0.55, 0.06, L / 2 + 0.2, sh.clear + 0.3, 0.35), box(0.06, 0.55, 0.06, L / 2 + 0.2, sh.clear + 0.3, -0.35), box(0.1, 0.06, W * 0.62, L / 2 + 0.2, sh.clear + 0.56, 0), box(0.1, 0.06, W * 0.62, L / 2 + 0.2, sh.clear + 0.2, 0)]), M.trim));
        }
        group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.14, 12).rotateZ(Math.PI / 2).translate(cx + (sh.cabTo - sh.cabFrom) * L * 0.36, sh.clear + sh.bodyH + 0.15, -W / 2 - 0.02), M.chrome));
        group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.8, 4).translate(cx - 0.7, roof + 0.4, 0.2), M.trim));
      }
    }
    group.add(...redGlow, ...blueGlow);
    model.red = red;
    model.blue = blue;
    model.redGlow = redGlow;
    model.blueGlow = blueGlow;

    // Lettering.
    const doorY = sh.clear + sh.bodyH * 0.55;
    if (policeLivery || kind === "transport") {
      const word = new THREE.MeshBasicMaterial({ map: lettering(kind === "transport" ? "SHERIFF TRANSPORT" : "POLICE", "#0b1a3a"), transparent: true, depthWrite: false });
      const badge = new THREE.MeshBasicMaterial({ map: badgeTexture("police"), transparent: true, depthWrite: false });
      for (const side of [1, -1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(kind === "transport" ? 3 : 1.35, kind === "transport" ? 0.4 : 0.34), word);
        p.position.set(kind === "transport" ? -L * 0.12 : -L * 0.12, kind === "transport" ? sh.clear + sh.bodyH + 0.4 : doorY - 0.05, side * (W / 2 + 0.013));
        p.rotation.y = side > 0 ? 0 : Math.PI;
        const b = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), badge);
        b.position.set(L * 0.14, doorY, side * (W / 2 + 0.013));
        b.rotation.y = side > 0 ? 0 : Math.PI;
        group.add(p, b);
      }
      // Unit number on the roof for the helicopter.
      if (!sh.boxy) {
        const num = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: lettering("1A12", "#0b1a3a"), transparent: true, depthWrite: false }));
        num.rotation.x = -Math.PI / 2;
        num.rotation.z = -Math.PI / 2;
        num.position.set(cx - 0.35, sh.clear + sh.bodyH + sh.cabH + 0.05, 0);
        group.add(num);
      }
    }
    if (kind === "ambulance") {
      const word = new THREE.MeshBasicMaterial({ map: lettering("AMBULANCE", "#c8102e"), transparent: true, depthWrite: false });
      const star = new THREE.MeshBasicMaterial({ map: badgeTexture("ems"), transparent: true, depthWrite: false });
      for (const side of [1, -1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), word);
        p.position.set(-L * 0.18, sh.clear + sh.bodyH + 0.35, side * (W / 2 + 0.013));
        p.rotation.y = side > 0 ? 0 : Math.PI;
        const st = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), star);
        st.position.set(-L * 0.18, sh.clear + sh.bodyH - 0.3, side * (W / 2 + 0.013));
        st.rotation.y = side > 0 ? 0 : Math.PI;
        group.add(p, st);
      }
    }
  }
  return model;
}

// ------------------------------------------------------------------- people

export interface PedModel {
  group: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  gun: THREE.Mesh;
  taser: THREE.Mesh;
}

const pedMats = new Map<string, THREE.MeshStandardMaterial>();
function pmat(color: string, rough = 0.85) {
  const key = `${color}${rough}`;
  let m = pedMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough });
    pedMats.set(key, m);
  }
  return m;
}
const thighGeo = new THREE.CapsuleGeometry(0.085, 0.36, 2, 8).translate(0, -0.26, 0);
const shinGeo = new THREE.CapsuleGeometry(0.07, 0.36, 2, 8).translate(0, -0.66, 0);
const shoeGeo = new RoundedBoxGeometry(0.27, 0.09, 0.12, 2, 0.03).translate(0.05, -0.9, 0);
const upperArmGeo = new THREE.CapsuleGeometry(0.058, 0.26, 2, 8).translate(0, -0.18, 0);
const foreArmGeo = new THREE.CapsuleGeometry(0.05, 0.24, 2, 8).translate(0, -0.47, 0);
const handGeo = new THREE.SphereGeometry(0.055, 10, 8).scale(1, 1.2, 0.8).translate(0, -0.66, 0);
const torsoGeo = new RoundedBoxGeometry(0.25, 0.6, 0.44, 2, 0.1);
const hipsGeo = new RoundedBoxGeometry(0.24, 0.2, 0.38, 2, 0.07);
const neckGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10);
const headGeo = new THREE.SphereGeometry(0.115, 12, 10).scale(1, 1.15, 0.95);
const eyeGeo = new THREE.SphereGeometry(0.014, 6, 6);
const noseGeo = new THREE.ConeGeometry(0.02, 0.05, 6).rotateZ(-Math.PI / 2);
const hairShort = new THREE.SphereGeometry(0.122, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.1).scale(1, 1.1, 0.98);
const hairLong = mergeGeometries([hairShort.clone(), new THREE.CylinderGeometry(0.12, 0.1, 0.22, 14, 1, true, Math.PI * 0.6, Math.PI * 0.8).translate(0, -0.08, 0)]);
const capGeo = mergeGeometries([new THREE.CylinderGeometry(0.13, 0.125, 0.09, 16).translate(0, 0.08, 0), new THREE.CylinderGeometry(0.14, 0.14, 0.02, 16).translate(0, 0.13, 0)]);
const brimGeo = new THREE.BoxGeometry(0.1, 0.015, 0.2).translate(0.13, 0.05, 0);
const vestGeo = new RoundedBoxGeometry(0.29, 0.44, 0.47, 2, 0.08);
const beltGeo = new THREE.BoxGeometry(0.28, 0.07, 0.46);
const holsterGeo = new RoundedBoxGeometry(0.1, 0.18, 0.06, 2, 0.02);
const radioGeo = new RoundedBoxGeometry(0.05, 0.08, 0.04, 2, 0.01);
const legGeo = mergeGeometries([thighGeo, shinGeo]);
/** Head, neck and nose in the head's frame; the two eyes as one mesh. */
const faceGeo = mergeGeometries([headGeo, neckGeo.clone().translate(-0.01, -0.13, 0), noseGeo.clone().translate(0.12, -0.01, 0)]);
const eyesGeo = mergeGeometries([eyeGeo.clone().translate(0.1, 0.03, -0.04), eyeGeo.clone().translate(0.1, 0.03, 0.04)]);
const gunGeo = mergeGeometries([new THREE.BoxGeometry(0.19, 0.045, 0.035).translate(0.12, -0.66, 0), new THREE.BoxGeometry(0.05, 0.1, 0.035).translate(0.05, -0.7, 0)]);

let vestText: THREE.Texture | null = null;

export function buildPed(o: { skin: string; shirt: string; pants: string; officer?: boolean; hair?: string; long?: boolean }): PedModel {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const skin = pmat(o.skin, 0.55);
  const shirt = pmat(o.shirt);
  const pants = pmat(o.pants);
  const shoe = pmat("#15120f", 0.5);
  const mk = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const leg = (z: number) => {
    const g = new THREE.Group();
    g.position.set(0, 0.95, z);
    mk(legGeo, pants, g);
    mk(shoeGeo, shoe, g).castShadow = false;
    body.add(g);
    return g;
  };
  const legL = leg(-0.1);
  const legR = leg(0.1);
  mk(hipsGeo, pants, body, 0, 0.98, 0);
  mk(torsoGeo, shirt, body, 0, 1.3, 0);
  const arm = (z: number) => {
    const g = new THREE.Group();
    g.position.set(0, 1.55, z);
    mk(upperArmGeo, shirt, g);
    mk(foreArmGeo, o.officer ? shirt : skin, g);
    mk(handGeo, skin, g);
    body.add(g);
    return g;
  };
  const armL = arm(-0.29);
  const armR = arm(0.29);
  const head = new THREE.Group();
  head.position.set(0.01, 1.76, 0);
  body.add(head);
  mk(faceGeo, skin, head);
  mk(eyesGeo, pmat("#1a1410", 0.3), head).castShadow = false;
  if (o.officer) {
    const navy = pmat("#141c2e", 0.7);
    mk(capGeo, navy, head, 0, 0, 0);
    mk(brimGeo, pmat("#0b0f18", 0.4), head, 0, 0, 0);
    mk(new THREE.CircleGeometry(0.03, 7).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#d9b44a", metalness: 1, roughness: 0.25 }), head, 0.131, 0.1, 0);
    mk(vestGeo, pmat("#1b1e24", 0.9), body, 0, 1.32, 0);
    mk(beltGeo, pmat("#0c0c0c", 0.5), body, 0, 1.05, 0);
    mk(holsterGeo, pmat("#0c0c0c", 0.5), body, 0, 0.98, 0.25);
    mk(radioGeo, pmat("#111"), body, 0.12, 1.5, -0.18);
    mk(new THREE.BoxGeometry(0.02, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: "#d9b44a", metalness: 1, roughness: 0.25 }), body, 0.15, 1.42, -0.12);
    vestText ??= lettering("POLICE", "#f2f2f2", "rgba(0,0,0,0)", 512, 128);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), new THREE.MeshBasicMaterial({ map: vestText, transparent: true, depthWrite: false }));
    back.position.set(-0.148, 1.42, 0);
    back.rotation.y = -Math.PI / 2;
    body.add(back);
  } else {
    mk(o.long ? hairLong : hairShort, pmat(o.hair ?? "#2a1d14", 0.7), head, -0.005, 0.02, 0);
  }
  const gun = mk(gunGeo, pmat("#141414", 0.4), armR);
  gun.visible = false;
  const taser = mk(gunGeo, pmat("#e5c52e", 0.5), armR);
  taser.visible = false;
  return { group, body, legL, legR, armL, armR, gun, taser };
}

export type Pose = "walk" | "stand" | "handsup" | "cuffed" | "down" | "dead" | "aim" | "drive";

/** Animate a person: `step` is the walk cycle, `speed` in m/s, `t` time for idle breathing. */
export function posePed(m: PedModel, pose: Pose, step: number, speed: number, t = 0) {
  const swing = Math.min(1, speed / 4) * 0.7;
  const s = Math.sin(step * 2.2);
  const breathe = Math.sin(t * 1.7) * 0.01;
  m.body.rotation.set(0, 0, 0);
  m.body.position.set(0, Math.abs(Math.cos(step * 2.2)) * swing * 0.05 + breathe, 0);
  m.legL.rotation.set(0, 0, s * swing);
  m.legR.rotation.set(0, 0, -s * swing);
  m.armL.rotation.set(0.08, 0, -s * swing * 0.8);
  m.armR.rotation.set(-0.08, 0, s * swing * 0.8);
  if (speed > 4.5) m.body.rotation.z = -0.16;
  switch (pose) {
    case "handsup":
      m.armL.rotation.set(-0.25, 0, Math.PI * 0.93);
      m.armR.rotation.set(0.25, 0, Math.PI * 0.93);
      break;
    case "cuffed":
      m.armL.rotation.set(0.35, 0, -0.35);
      m.armR.rotation.set(-0.35, 0, -0.35);
      break;
    case "aim":
      m.armR.rotation.set(0, 0, Math.PI / 2);
      m.armL.rotation.set(0.38, 0, Math.PI / 2.15);
      break;
    case "down":
    case "dead":
      m.body.rotation.x = Math.PI / 2;
      m.body.position.y = 0.16;
      m.legL.rotation.set(0, 0, 0.1);
      m.legR.rotation.set(0, 0, -0.15);
      m.armL.rotation.set(-0.6, 0, 0.4);
      m.armR.rotation.set(0.6, 0, -0.2);
      break;
    case "drive":
      m.legL.rotation.set(0, 0, Math.PI / 2);
      m.legR.rotation.set(0, 0, Math.PI / 2);
      m.body.position.y = -0.45;
      m.armL.rotation.set(0, 0, Math.PI / 3);
      m.armR.rotation.set(0, 0, Math.PI / 3);
      break;
  }
}
