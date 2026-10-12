import * as THREE from "three";
import { createRng } from "../../engine/rng";
import { groundY, WATER_Y } from "../world";

/**
 * Heatwave's painted textures (no downloads): sand and ground detail, palm fronds, sea ripples,
 * the shoreline mask the sea uses for its shallows and surf, neon signs and billboards.
 */

function canvas(w: number, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

function tex(c: HTMLCanvasElement, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Fine grain for the ground (multiplied over the vertex colours): one tile = 8 m. */
export function groundDetail() {
  const N = 256;
  const { c, g } = canvas(N);
  const r = createRng(21);
  g.fillStyle = "#d8d8d8";
  g.fillRect(0, 0, N, N);
  for (let i = 0; i < 9000; i++) {
    const v = Math.floor(170 + r.next() * 85);
    g.fillStyle = `rgba(${v},${v},${v},${0.35 + r.next() * 0.4})`;
    g.fillRect(r.next() * N, r.next() * N, 1 + r.next() * 2.5, 1 + r.next() * 2.5);
  }
  for (let i = 0; i < 40; i++) {
    const x = r.next() * N;
    const y = r.next() * N;
    const rr = 10 + r.next() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    const dark = r.next() < 0.5;
    gr.addColorStop(0, dark ? "rgba(120,120,120,0.25)" : "rgba(255,255,255,0.22)");
    gr.addColorStop(1, "rgba(128,128,128,0)");
    g.fillStyle = gr;
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  return tex(c, false);
}

/** Sun-bleached asphalt: aggregate speckle and faint patches (one tile = 4 m). */
export function asphaltTone() {
  const N = 256;
  const { c, g } = canvas(N);
  const r = createRng(44);
  g.fillStyle = "#64666a";
  g.fillRect(0, 0, N, N);
  for (let i = 0; i < 26; i++) {
    const x = r.next() * N;
    const y = r.next() * N;
    const rr = 16 + r.next() * 50;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, r.next() < 0.55 ? "rgba(40,42,46,0.22)" : "rgba(150,150,148,0.16)");
    gr.addColorStop(1, "rgba(100,100,100,0)");
    g.fillStyle = gr;
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) g.fillRect(x - rr + ox, y - rr + oy, rr * 2, rr * 2);
  }
  for (let i = 0; i < 14000; i++) {
    const v = Math.floor(60 + r.next() * 110);
    g.fillStyle = `rgba(${v},${v},${v + 2},${0.4 + r.next() * 0.5})`;
    g.fillRect(r.next() * N, r.next() * N, 1 + r.next() * 1.6, 1 + r.next() * 1.6);
  }
  return tex(c);
}

/** A palm frond: a midrib with leaflets, on transparent. */
export function frondTexture() {
  const W = 256;
  const H = 64;
  const { c, g } = canvas(W, H);
  const r = createRng(33);
  g.clearRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const t = i / 70;
    const x = 8 + t * (W - 16);
    const len = (1 - Math.pow(t - 0.35, 2) * 1.6) * 26 * (0.85 + r.next() * 0.3);
    for (const side of [-1, 1]) {
      const light = 0.75 + r.next() * 0.35;
      g.strokeStyle = `rgb(${(70 * light) | 0},${(118 * light) | 0},${(44 * light) | 0})`;
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(x, H / 2);
      g.quadraticCurveTo(x + 6, H / 2 + side * len * 0.5, x + 10, H / 2 + side * len);
      g.stroke();
    }
  }
  g.strokeStyle = "#5b6b2e";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, H / 2);
  g.lineTo(W, H / 2);
  g.stroke();
  const t = tex(c, true, false);
  return t;
}

/** Soft ripples for the sea and pools: a tileable normal map. */
export function rippleNormal() {
  const N = 256;
  const { c, g } = canvas(N);
  const img = g.createImageData(N, N);
  const h = new Float32Array(N * N);
  const r = createRng(41);
  const waves = Array.from({ length: 14 }, () => ({ kx: r.int(-6, 6), ky: r.int(-6, 6), a: 0.2 + r.next() * 0.8, p: r.next() * 6.28 }));
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v = 0;
      for (const w of waves) v += Math.sin(((x * w.kx + y * w.ky) / N) * Math.PI * 2 + w.p) * w.a;
      h[y * N + x] = v;
    }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x + N - 1) % N)];
      const dy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
      const nx = -dx * 0.6;
      const ny = -dy * 0.6;
      const nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * N + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return tex(c, false);
}

/**
 * The shore mask over the whole map: R = how shallow (1 at the waterline, 0 deep), G = land.
 * The sea reads it for turquoise shallows and a line of surf.
 */
export function shoreMask(x0: number, z0: number, x1: number, z1: number, N = 512) {
  const { c, g } = canvas(N);
  const img = g.createImageData(N, N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = x0 + ((i + 0.5) / N) * (x1 - x0);
      const z = z0 + ((j + 0.5) / N) * (z1 - z0);
      const y = groundY(x, z);
      const depth = WATER_Y - y;
      const shallow = depth <= 0 ? 1 : Math.max(0, 1 - depth / 5);
      const k = (j * N + i) * 4;
      img.data[k] = shallow * 255;
      img.data[k + 1] = depth <= 0 ? 255 : 0;
      img.data[k + 2] = 0;
      img.data[k + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

/** A neon sign: glowing script on a dark backing (lit from inside at night). */
export function neonSign(text: string, color: string, w = 512, h = 128) {
  const { c, g } = canvas(w, h);
  g.fillStyle = "rgba(16,14,22,0.92)";
  g.fillRect(0, 0, w, h);
  g.font = `italic 900 ${Math.round(h * 0.56)}px "Trebuchet MS", Arial, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = color;
  g.shadowBlur = h * 0.16;
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2 + 4, w * 0.92);
  g.shadowBlur = 0;
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.font = `italic 900 ${Math.round(h * 0.5)}px "Trebuchet MS", Arial, sans-serif`;
  g.fillText(text, w / 2, h / 2 + 4, w * 0.9);
  return tex(c, true, false);
}

/** A painted shop sign. */
export function shopSign(text: string, bg: string, fg: string) {
  const { c, g } = canvas(512, 96);
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = 4;
  g.strokeRect(4, 4, 504, 88);
  g.fillStyle = fg;
  g.font = "900 54px Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text.toUpperCase(), 256, 52, 480);
  return tex(c, true, false);
}

const ADS: [string, string, string, string][] = [
  ["SUNLINE COLA", "Taste the heat", "#e14b6a", "#fff4e0"],
  ["NEON 88 FM", "Synthwave all night", "#7a5cc4", "#3fd0c9"],
  ["VANTA GT", "Faster than the news", "#1c1f24", "#f2c230"],
  ["SOLANO PIER", "Rides · Fish · Fun", "#3fa7a0", "#ffffff"],
  ["QUIK STOP", "Open 24 hours", "#d81e2b", "#ffe14d"],
  ["SPRAY BAY", "New paint, new you", "#f08a5d", "#1c1f24"],
  ["CALLE 104", "Más ritmo", "#f2b134", "#7a1d1d"],
  ["BULLSEYE ARMS", "Protect what's yours", "#2b3442", "#e9e2d0"],
];

/** A billboard poster (one of a handful of made-up ads). */
export function billboard(i: number) {
  const [title, line, bg, fg] = ADS[i % ADS.length];
  const { c, g } = canvas(512, 256);
  const gr = g.createLinearGradient(0, 0, 512, 256);
  gr.addColorStop(0, bg);
  gr.addColorStop(1, shade(bg, -0.35));
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = "rgba(255,255,255,0.08)";
  for (let k = 0; k < 6; k++) {
    g.beginPath();
    g.arc(420, 60, 40 + k * 26, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = fg;
  g.font = "900 64px Arial, sans-serif";
  g.textAlign = "left";
  g.fillText(title, 28, 120, 460);
  g.font = "italic 600 34px Arial, sans-serif";
  g.fillText(line, 30, 180, 460);
  return tex(c, true, false);
}

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 + k);
  return `#${c.getHexString()}`;
}

/** A round glow (lamps, headlights, muzzle flash). */
export function glow(size = 64) {
  const { c, g } = canvas(size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.25, "rgba(255,255,255,0.55)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return tex(c, true, false);
}

/** A soft puff of smoke. */
export function puff(size = 128) {
  const { c, g } = canvas(size);
  const r = createRng(77);
  for (let i = 0; i < 14; i++) {
    const x = size * (0.3 + r.next() * 0.4);
    const y = size * (0.3 + r.next() * 0.4);
    const rr = size * (0.16 + r.next() * 0.2);
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, "rgba(255,255,255,0.4)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
  }
  return tex(c, true, false);
}

/** Pool tiles: pale blue squares with grout. */
export function poolTiles() {
  const { c, g } = canvas(128);
  g.fillStyle = "#7fd3e8";
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(255,255,255,0.5)";
  g.lineWidth = 2;
  for (let i = 0; i <= 128; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.moveTo(0, i);
    g.lineTo(128, i);
    g.stroke();
  }
  return tex(c);
}

/** Roof tiles (Spanish barrel tiles) for the houses: one tile = 2 m. */
export function barrelTiles() {
  const { c, g } = canvas(128);
  g.fillStyle = "#b5582f";
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16)
    for (let x = 0; x < 128; x += 12) {
      const off = (y / 16) % 2 ? 6 : 0;
      const gr = g.createLinearGradient(x + off, 0, x + off + 12, 0);
      gr.addColorStop(0, "rgba(0,0,0,0.25)");
      gr.addColorStop(0.5, "rgba(255,220,180,0.25)");
      gr.addColorStop(1, "rgba(0,0,0,0.25)");
      g.fillStyle = gr;
      g.fillRect(x + off, y, 12, 16);
    }
  return tex(c);
}

/** Corrugated steel for containers and sheds: vertical ribs. */
export function ribbed() {
  const { c, g } = canvas(64);
  for (let x = 0; x < 64; x++) {
    const v = 180 + Math.sin((x / 64) * Math.PI * 16) * 50;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x, 0, 1, 64);
  }
  return tex(c, false);
}

/** Planks for the piers. */
export function planks() {
  const { c, g } = canvas(256);
  const r = createRng(91);
  for (let y = 0; y < 256; y += 16) {
    const v = 0.8 + r.next() * 0.3;
    g.fillStyle = `rgb(${(150 * v) | 0},${(112 * v) | 0},${(76 * v) | 0})`;
    g.fillRect(0, y, 256, 15);
    g.fillStyle = "rgba(40,25,15,0.6)";
    g.fillRect(0, y + 15, 256, 1);
    for (let k = 0; k < 6; k++) {
      g.fillStyle = `rgba(60,40,25,${0.15 + r.next() * 0.2})`;
      g.fillRect(r.next() * 256, y + 2 + r.next() * 10, 20 + r.next() * 50, 1);
    }
  }
  return tex(c);
}
