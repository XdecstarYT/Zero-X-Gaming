import * as THREE from "three";
import { createRng, type Rng } from "../../engine/rng";

/**
 * Procedural PBR-ish textures painted on canvases at startup (no downloads).
 * Each returns a colour map and, where it helps, a bump map from the same pattern.
 */

export interface TexSet {
  map: THREE.Texture;
  bump?: THREE.Texture;
  /** Tangent-space normal map derived from the height field. */
  normal?: THREE.Texture;
}

/** Texture resolution multiplier: High renders at 2× (512 px base), Low at 1×. */
let SCALE = 1;
export function setTextureDetail(detail: "high" | "low") {
  SCALE = detail === "high" ? 2 : 1;
}

function canvas(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

function toTexture(c: HTMLCanvasElement, srgb: boolean, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/** Smooth value noise, tileable over `period` cells. */
function valueNoise(rng: Rng, period: number) {
  const grid = Array.from({ length: period * period }, () => rng.next());
  const at = (x: number, y: number) => grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  return (u: number, v: number) => {
    const x = u * period;
    const y = v * period;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

function fbm(rng: Rng, octaves: number[]) {
  const layers = octaves.map((p) => valueNoise(rng, p));
  return (u: number, v: number) => {
    let s = 0;
    let w = 0;
    layers.forEach((n, i) => {
      const k = 1 / (i + 1);
      s += n(u, v) * k;
      w += k;
    });
    return s / w;
  };
}

/** Paint every pixel with f(u,v) → [r,g,b,height]. */
function paint(size0: number, f: (u: number, v: number, x: number, y: number) => [number, number, number, number]) {
  const size = size0 * SCALE;
  const color = canvas(size);
  const bump = canvas(size);
  const cc = color.getContext("2d")!;
  const bc = bump.getContext("2d")!;
  const ci = cc.createImageData(size, size);
  const bi = bc.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [r, g, b, h] = f(x / size, y / size, x, y);
      const i = (y * size + x) * 4;
      ci.data[i] = clamp(r);
      ci.data[i + 1] = clamp(g);
      ci.data[i + 2] = clamp(b);
      ci.data[i + 3] = 255;
      const hv = clamp(h * 255);
      bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = hv;
      bi.data[i + 3] = 255;
    }
  cc.putImageData(ci, 0, 0);
  bc.putImageData(bi, 0, 0);
  // Normal map from the height field (central differences, wrapping so it tiles).
  const normal = canvas(size);
  const nc = normal.getContext("2d")!;
  const ni = nc.createImageData(size, size);
  const h = (x: number, y: number) => bi.data[((((y + size) % size) * size + ((x + size) % size)) * 4)] / 255;
  const k = 2.2 * SCALE;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * k;
      const dy = (h(x, y + 1) - h(x, y - 1)) * k;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      ni.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      ni.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      ni.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      ni.data[i + 3] = 255;
    }
  nc.putImageData(ni, 0, 0);
  return { color, bump, normal };
}

export function grassTexture(size = 256): TexSet {
  const rng = createRng(11);
  const n = fbm(rng, [4, 16, 64]);
  const { color, bump, normal } = paint(size, (u, v) => {
    const k = n(u, v);
    const blade = rng.next();
    const shade = 0.75 + k * 0.5 + (blade - 0.5) * 0.25;
    const dry = Math.max(0, n(v, u) - 0.62) * 2.2;
    return [(62 + dry * 70) * shade, (92 + dry * 35) * shade, (40 + dry * 10) * shade, k * 0.6 + blade * 0.4];
  });
  return { map: toTexture(color, true), bump: toTexture(bump, false), normal: toTexture(normal, false) };
}

export function asphaltTexture(size = 256): TexSet {
  const rng = createRng(12);
  const n = fbm(rng, [4, 32]);
  const { color, bump, normal } = paint(size, (u, v) => {
    const k = n(u, v);
    const grit = rng.next();
    const base = 58 + k * 22 + (grit > 0.93 ? 30 : 0) - (grit < 0.05 ? 14 : 0);
    return [base, base + 1, base + 4, grit * 0.7 + k * 0.3];
  });
  return { map: toTexture(color, true), bump: toTexture(bump, false), normal: toTexture(normal, false) };
}

export function dirtTexture(size = 256): TexSet {
  const rng = createRng(13);
  const n = fbm(rng, [4, 16, 64]);
  const { color, bump, normal } = paint(size, (u, v) => {
    const k = n(u, v);
    const pebble = rng.next() > 0.96 ? 25 : 0;
    return [118 * (0.75 + k * 0.5) + pebble, 96 * (0.75 + k * 0.5) + pebble, 66 * (0.75 + k * 0.5) + pebble, k];
  });
  return { map: toTexture(color, true), bump: toTexture(bump, false), normal: toTexture(normal, false) };
}

/**
 * Neutral grey churned soil (clods, pebbles, boot-trodden patches). Tinted per
 * front through vertex colours, so one texture serves mud, chalk, sand and snow.
 */
export function soilTexture(size = 256): TexSet {
  const rng = createRng(19);
  const n = fbm(rng, [4, 16, 64]);
  const clod = valueNoise(rng, 24);
  const { color, bump, normal } = paint(size, (u, v) => {
    const k = n(u, v);
    const c = Math.max(0, clod(u, v) - 0.6) * 2.5;
    const pebble = rng.next() > 0.97 ? 22 : 0;
    const base = 150 * (0.78 + k * 0.44) + pebble - c * 26;
    return [base, base, base, k * 0.7 + c * 0.3];
  });
  return { map: toTexture(color, true), bump: toTexture(bump, false), normal: toTexture(normal, false) };
}

export function concreteTexture(size = 256): TexSet {
  const rng = createRng(14);
  const n = fbm(rng, [3, 12, 48]);
  const stain = valueNoise(rng, 3);
  const { color, bump, normal } = paint(size, (u, v, x, y) => {
    const k = n(u, v);
    const s = Math.max(0, stain(u, v * 0.5) - 0.55) * 1.4;
    const seam = y % (size / 2) < 2 || x % (size / 2) < 1 ? -22 : 0;
    const base = 128 + (k - 0.5) * 36 - s * 50 + seam + (rng.next() - 0.5) * 10;
    return [base, base - 1, base - 5, k * 0.8 + (seam ? 0 : 0.2)];
  });
  return { map: toTexture(color, true), bump: toTexture(bump, false), normal: toTexture(normal, false) };
}

export function brickTexture(size = 256): TexSet {
  const rng = createRng(15);
  const n = fbm(rng, [8, 32]);
  const rows = 8;
  const cols = 4;
  const bh = size / rows;
  const bw = size / cols;
  const tint = Array.from({ length: rows * cols * 2 }, () => 0.8 + rng.next() * 0.35);
  const { color, bump, normal } = paint(size, (u, v, x, y) => {
    const row = Math.floor(y / bh);
    const off = row % 2 ? bw / 2 : 0;
    const col = Math.floor((x + off) / bw);
    const inX = (x + off) % bw;
    const inY = y % bh;
    const mortar = inX < 3 || inY < 3;
    const k = n(u, v);
    if (mortar) {
      const m = 165 + (k - 0.5) * 30;
      return [m, m - 4, m - 12, 0.1];
    }
    const t = tint[(row * cols + col) % tint.length] * (0.9 + k * 0.2);
    return [150 * t, 72 * t, 52 * t, 0.7 + k * 0.3];
  });
  return { map: toTexture(color, true), bump: toTexture(bump, false), normal: toTexture(normal, false) };
}

export function woodFloorTexture(size = 256): TexSet {
  const rng = createRng(16);
  const grain = fbm(rng, [2, 8, 32]);
  const planks = 6;
  const tone = Array.from({ length: planks * 3 }, () => 0.8 + rng.next() * 0.3);
  const { color, bump, normal } = paint(size, (u, v, x, y) => {
    const p = Math.floor(u * planks);
    const seg = Math.floor(v * 3 + (p % 2) * 0.5);
    const gap = x % (size / planks) < 2 || (y + (p % 2) * (size / 6)) % (size / 3) < 2;
    const g = grain(u * 0.3, v * 3);
    const t = tone[(p * 3 + seg) % tone.length] * (0.8 + g * 0.4);
    if (gap) return [60, 42, 28, 0];
    return [150 * t, 108 * t, 70 * t, 0.6 + g * 0.4];
  });
  return { map: toTexture(color, true), bump: toTexture(bump, false), normal: toTexture(normal, false) };
}

export function crateTexture(size = 128): TexSet {
  const rng = createRng(17);
  const grain = fbm(rng, [2, 16]);
  const { color, bump, normal } = paint(size, (u, v, x, y) => {
    const border = x < 10 || y < 10 || x > size - 11 || y > size - 11;
    const brace = Math.abs(x - y) < 7;
    const plank = x % (size / 4) < 2;
    const g = grain(u * 0.5, v * 4);
    const t = (border || brace ? 0.75 : 1) * (0.8 + g * 0.35);
    if (plank && !border && !brace) return [70, 50, 32, 0.1];
    return [168 * t, 124 * t, 74 * t, border || brace ? 0.9 : 0.5 + g * 0.3];
  });
  return { map: toTexture(color, true), bump: toTexture(bump, false), normal: toTexture(normal, false) };
}

export function barkTexture(size = 128): TexSet {
  const rng = createRng(18);
  const n = fbm(rng, [4, 16]);
  const { color, bump, normal } = paint(size, (u, v) => {
    const k = n(u * 4, v * 0.5);
    const ridge = Math.abs(Math.sin(u * Math.PI * 10 + k * 4));
    const t = 0.55 + ridge * 0.35;
    return [96 * t, 72 * t, 52 * t, ridge];
  });
  return { map: toTexture(color, true), bump: toTexture(bump, false), normal: toTexture(normal, false) };
}

export function roofTexture(size = 128): TexSet {
  const rng = createRng(19);
  const n = fbm(rng, [4, 16]);
  const rows = 8;
  const { color, bump, normal } = paint(size, (u, v) => {
    const row = Math.floor(v * rows);
    const inY = (v * rows) % 1;
    const off = row % 2 ? 0.5 : 0;
    const col = Math.floor(u * 6 + off);
    const edge = ((u * 6 + off) % 1) < 0.04;
    const k = n(u, v);
    const t = (0.65 + inY * 0.45) * (0.85 + k * 0.3) * (0.9 + ((col * 7 + row * 3) % 5) * 0.04);
    if (edge) return [40, 30, 28, 0.2];
    return [120 * t, 58 * t, 46 * t, inY];
  });
  return { map: toTexture(color, true), bump: toTexture(bump, false), normal: toTexture(normal, false) };
}

export function stoneTexture(size = 128): TexSet {
  const rng = createRng(20);
  const n = fbm(rng, [3, 12, 48]);
  const { color, bump, normal } = paint(size, (u, v) => {
    const k = n(u, v);
    const moss = Math.max(0, n(v, u) - 0.6) * 2;
    const b = 110 + (k - 0.5) * 70;
    return [b - moss * 30, b + moss * 10, b - 8 - moss * 30, k];
  });
  return { map: toTexture(color, true), bump: toTexture(bump, false), normal: toTexture(normal, false) };
}

/** Animated storm wall: soft vertical streaks, used with additive blending. */
export function stormTexture(size = 128) {
  const rng = createRng(21);
  const n = fbm(rng, [4, 8, 16]);
  const { color } = paint(size, (u, v) => {
    const k = n(u, v * 0.4);
    const a = 0.35 + k * 0.65;
    return [150 * a, 70 * a, 230 * a, 0];
  });
  return toTexture(color, true);
}

/** Radial glow sprite (muzzle flash, sparks, loot beams). */
export function glowTexture(size = 64) {
  const c = canvas(size);
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Star-shaped muzzle flash. */
export function flashTexture(size = 64) {
  const c = canvas(size);
  const g = c.getContext("2d")!;
  g.translate(size / 2, size / 2);
  for (let i = 0; i < 6; i++) {
    g.rotate(Math.PI / 3);
    const grad = g.createLinearGradient(0, 0, size / 2, 0);
    grad.addColorStop(0, "rgba(255,240,200,1)");
    grad.addColorStop(1, "rgba(255,160,40,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, -size * 0.06);
    g.lineTo(size / 2, 0);
    g.lineTo(0, size * 0.06);
    g.fill();
  }
  const r = g.createRadialGradient(0, 0, 0, 0, 0, size * 0.22);
  r.addColorStop(0, "rgba(255,255,230,1)");
  r.addColorStop(1, "rgba(255,190,80,0)");
  g.fillStyle = r;
  g.fillRect(-size / 2, -size / 2, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A camo / stripe / hex pattern for weapon wraps. */
export function wrapTexture(base: string, alt: string, pattern: "solid" | "stripes" | "camo" | "hex" | "flat", size = 128) {
  const c = canvas(size);
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const rng = createRng(base.length * 97 + alt.charCodeAt(1));
  g.fillStyle = alt;
  if (pattern === "stripes") {
    for (let i = -size; i < size * 2; i += 22) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 10 + rng.next() * 6, 0);
      g.lineTo(i + 40 + rng.next() * 8, size);
      g.lineTo(i + 30, size);
      g.fill();
    }
  } else if (pattern === "camo") {
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      const x = rng.next() * size;
      const y = rng.next() * size;
      g.ellipse(x, y, 6 + rng.next() * 16, 4 + rng.next() * 10, rng.next() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  } else if (pattern === "hex") {
    g.strokeStyle = alt;
    g.lineWidth = 1.5;
    for (let y = 0; y < size + 12; y += 10)
      for (let x = 0; x < size + 12; x += 12) {
        const ox = (y / 10) % 2 ? 6 : 0;
        g.strokeRect(x + ox, y, 6, 6);
      }
  } else if (pattern === "solid") {
    const grad = g.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, base);
    grad.addColorStop(0.5, alt);
    grad.addColorStop(1, base);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function alphaTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A tuft of grass blades on transparent background (for crossed-quad billboards). */
export function grassBladesTexture(size = 128) {
  const c = canvas(size);
  const g = c.getContext("2d")!;
  const rng = createRng(31);
  for (let i = 0; i < 70; i++) {
    const x = rng.range(0.08, 0.92) * size;
    const h = rng.range(0.45, 0.98) * size;
    const lean = rng.range(-0.18, 0.18) * size;
    const w = rng.range(1.2, 2.8) * (size / 128);
    const shade = rng.range(0.7, 1.1);
    const dry = rng.next() < 0.18;
    const r = (dry ? 150 : 70) * shade;
    const gr = (dry ? 140 : 118) * shade;
    const b = (dry ? 80 : 45) * shade;
    const grad = g.createLinearGradient(0, size, 0, size - h);
    grad.addColorStop(0, `rgb(${r * 0.45 | 0},${gr * 0.5 | 0},${b * 0.45 | 0})`);
    grad.addColorStop(1, `rgb(${r | 0},${gr | 0},${b | 0})`);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - w, size);
    g.quadraticCurveTo(x + lean * 0.3, size - h * 0.6, x + lean, size - h);
    g.quadraticCurveTo(x + lean * 0.3 + w * 0.5, size - h * 0.6, x + w, size);
    g.closePath();
    g.fill();
  }
  return alphaTexture(c);
}

/** A cluster of broad leaves on transparent background. */
export function leafClusterTexture(size = 256) {
  const c = canvas(size);
  const g = c.getContext("2d")!;
  const rng = createRng(32);
  for (let i = 0; i < 150; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * size * 0.42;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    const len = rng.range(0.06, 0.11) * size;
    const light = rng.range(0.55, 1.15) * (1 - (y / size) * 0.35);
    g.save();
    g.translate(x, y);
    g.rotate(rng.next() * Math.PI * 2);
    g.fillStyle = `rgb(${(58 * light) | 0},${(96 * light) | 0},${(38 * light) | 0})`;
    g.beginPath();
    g.ellipse(0, 0, len, len * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(30,50,20,0.5)`;
    g.lineWidth = Math.max(1, size / 256);
    g.beginPath();
    g.moveTo(-len, 0);
    g.lineTo(len, 0);
    g.stroke();
    g.restore();
  }
  return alphaTexture(c);
}

/** A drooping spray of pine needles on transparent background. */
export function pineSprayTexture(size = 256) {
  const c = canvas(size);
  const g = c.getContext("2d")!;
  const rng = createRng(33);
  for (let b = 0; b < 9; b++) {
    const x0 = size * 0.5;
    const y0 = size * 0.08;
    const ang = Math.PI / 2 + rng.range(-0.8, 0.8);
    const len = size * rng.range(0.55, 0.85);
    const x1 = x0 + Math.cos(ang) * len;
    const y1 = y0 + Math.sin(ang) * len;
    g.strokeStyle = "rgb(60,44,30)";
    g.lineWidth = Math.max(1, size / 180);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    for (let i = 0; i < 90; i++) {
      const t = rng.next();
      const px = x0 + (x1 - x0) * t;
      const py = y0 + (y1 - y0) * t;
      const na = ang + (rng.next() < 0.5 ? 1 : -1) * rng.range(0.5, 1.2);
      const nl = size * rng.range(0.03, 0.07) * (1 - t * 0.4);
      const light = rng.range(0.6, 1.1);
      g.strokeStyle = `rgb(${(34 * light) | 0},${(70 * light) | 0},${(40 * light) | 0})`;
      g.lineWidth = Math.max(1, size / 200);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl);
      g.stroke();
    }
  }
  return alphaTexture(c);
}

/** Soft cumulus clouds for the sky dome (white with alpha). */
export function cloudTexture(w = 1024, h = 256) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  const rng = createRng(34);
  const n = fbm(rng, [4, 8, 16, 32]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const d = n(u, v * 0.25);
      // Fade toward the horizon (bottom) and zenith (top).
      const band = Math.sin(v * Math.PI);
      const a = Math.max(0, Math.min(1, (d - 0.5) * 3.2)) * band;
      const shade = 225 + (1 - v) * 30 - (d - 0.5) * 60;
      const i = (y * w + x) * 4;
      img.data[i] = shade;
      img.data[i + 1] = shade;
      img.data[i + 2] = shade + 6;
      img.data[i + 3] = a * 235;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** A soft, lumpy smoke puff (Trenches gas clouds). */
export function puffTexture(size = 128) {
  const c = canvas(size);
  const g = c.getContext("2d")!;
  const rng = createRng(77);
  for (let i = 0; i < 14; i++) {
    const x = size * (0.3 + rng.next() * 0.4);
    const y = size * (0.3 + rng.next() * 0.4);
    const r = size * (0.16 + rng.next() * 0.2);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,0.35)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
