import * as THREE from "three";
import { A, ARC, B, BEHIND_HALF, CENTRE_SQUARE, GOAL_HALF, GOAL_SQUARE, GOAL_X } from "./sim";

/**
 * Screamer's procedural textures, painted on canvases at load (no downloads):
 * the mown oval, grass detail, seats with a painted crowd, LED boards, the
 * ball's leather, goal netting, floodlight banks and the stadium screen.
 */

function canvas(w: number, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function tex(c: HTMLCanvasElement, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

let seed = 1;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/** Smooth tileable value noise. */
function noise2(period: number, s: number) {
  seed = s;
  const g = Array.from({ length: period * period }, () => rnd());
  const at = (x: number, y: number) => g[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
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

/** The ground covers this rectangle (metres): the oval plus its apron. */
export const GROUND_X = A + 16;
export const GROUND_Z = B + 16;

/**
 * The whole ground's colour: mowing stripes (with a fainter cross-cut), wear
 * in the centre square and goal squares, and the apron beyond the boundary.
 */
export function groundTexture(res: number) {
  const w = res;
  const h = Math.round((res * GROUND_Z) / GROUND_X);
  const c = canvas(w, h);
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  const n1 = noise2(24, 7);
  const n2 = noise2(90, 9);
  const light = [86, 138, 58];
  const dark = [70, 118, 46];
  for (let y = 0; y < h; y++) {
    const z = (y / h - 0.5) * 2 * GROUND_Z;
    for (let x = 0; x < w; x++) {
      const wx = (x / w - 0.5) * 2 * GROUND_X;
      const i = (y * w + x) * 4;
      const e = (wx / (A + 9)) ** 2 + (z / (B + 9)) ** 2;
      const u = x / w;
      const v = y / h;
      const k = n1(u, v) * 0.6 + n2(u, v) * 0.4;
      if (e > 1) {
        // Apron: a darker, worn surround.
        const s = 0.75 + k * 0.2;
        img.data[i] = 64 * s;
        img.data[i + 1] = 92 * s;
        img.data[i + 2] = 44 * s;
        img.data[i + 3] = 255;
        continue;
      }
      // Stripes across the ground, a fainter cut along it.
      const band = Math.floor((wx + 1000) / 10) % 2;
      const cross = Math.floor((z + 1000) / 12) % 2;
      const base = band ? light : dark;
      const cs = cross ? 1.025 : 0.975;
      let r = base[0] * cs;
      let gg = base[1] * cs;
      let b = base[2] * cs;
      // Wear: worn and sandy where the packs are.
      const centre = Math.max(0, 1 - Math.hypot(wx, z) / 9);
      const goalWear = Math.max(0, 1 - Math.hypot(Math.abs(wx) - (A - 6), z * 1.4) / 9);
      const wear = Math.min(1, (centre * 0.8 + goalWear * 0.9) * (0.6 + k * 0.8));
      r += (132 - r) * wear * 0.55;
      gg += (124 - gg) * wear * 0.45;
      b += (82 - b) * wear * 0.55;
      const s = 0.9 + k * 0.2;
      img.data[i] = r * s;
      img.data[i + 1] = gg * s;
      img.data[i + 2] = b * s;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // The markings, painted soft into the turf too (so they hold up at a distance).
  const px = (x: number) => (x / (2 * GROUND_X) + 0.5) * w;
  const pz = (z: number) => (z / (2 * GROUND_Z) + 0.5) * h;
  const k = w / (2 * GROUND_X);
  g.strokeStyle = "rgba(250,250,245,0.85)";
  g.lineWidth = Math.max(1.2, 0.16 * k);
  g.beginPath();
  for (let i = 0; i <= 360; i++) {
    const t = (i / 360) * Math.PI * 2;
    let x = A * Math.cos(t);
    const z = B * Math.sin(t);
    if (Math.abs(z) < BEHIND_HALF) x = Math.sign(x) * Math.min(Math.abs(x), GOAL_X);
    if (i === 0) g.moveTo(px(x), pz(z));
    else g.lineTo(px(x), pz(z));
  }
  g.stroke();
  g.strokeRect(px(-CENTRE_SQUARE), pz(-CENTRE_SQUARE), px(CENTRE_SQUARE) - px(-CENTRE_SQUARE), pz(CENTRE_SQUARE) - pz(-CENTRE_SQUARE));
  for (const r of [5, 1.5]) {
    g.beginPath();
    g.ellipse(px(0), pz(0), r * k, r * k, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(px(0), pz(-5));
  g.lineTo(px(0), pz(5));
  for (const sx of [-1, 1]) {
    g.moveTo(px(sx * GOAL_X), pz(-GOAL_HALF));
    g.lineTo(px(sx * (GOAL_X - GOAL_SQUARE)), pz(-GOAL_HALF));
    g.lineTo(px(sx * (GOAL_X - GOAL_SQUARE)), pz(GOAL_HALF));
    g.lineTo(px(sx * GOAL_X), pz(GOAL_HALF));
  }
  g.stroke();
  g.save();
  g.beginPath();
  g.ellipse(px(0), pz(0), A * k, B * k, 0, 0, Math.PI * 2);
  g.clip();
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(px(sx * GOAL_X), pz(0), ARC * k, ARC * k, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
  return tex(c);
}

/** Grass detail around mid-grey (multiplied ×2 over the ground colour), tiling. */
export function grassDetail(size: number) {
  const c = canvas(size);
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  const n = noise2(16, 3);
  seed = 5;
  for (let i = 0; i < size * size; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    const blade = rnd();
    const k = n(x / size, y / size);
    const v = 112 + (blade - 0.5) * 70 + (k - 0.5) * 30;
    img.data[i * 4] = v * 0.98;
    img.data[i * 4 + 1] = v * 1.02;
    img.data[i * 4 + 2] = v * 0.96;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // Blades: short strokes.
  for (let k = 0; k < size * 6; k++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const l = 2 + rnd() * 5;
    const a = -Math.PI / 2 + (rnd() - 0.5) * 1.2;
    g.strokeStyle = rnd() < 0.5 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return tex(c, false, true);
}

/** A bank of seats seen from the front: rows of tip-up seats, a painted crowd on most. */
export function seatTexture(seatColor: string, crowd: number) {
  const c = canvas(512, 256);
  const g = c.getContext("2d")!;
  g.fillStyle = "#3a3d42";
  g.fillRect(0, 0, 512, 256);
  seed = 21;
  const rows = 8;
  const cols = 32;
  const shirts = ["#a3122c", "#f2c230", "#1a2d68", "#ffffff", "#15171d", "#0d7580", "#47206f", "#e6e6e6", "#7a7a7a", "#2f5a3a", "#b8322a", "#24272c"];
  const skins = ["#f1c9a5", "#e0ac84", "#c68c5d", "#8d5a3b", "#5a3a28"];
  for (let r = 0; r < rows; r++) {
    const y = r * 32;
    // Concrete step and the seat row.
    g.fillStyle = "#55595f";
    g.fillRect(0, y + 26, 512, 6);
    for (let k = 0; k < cols; k++) {
      const x = k * 16;
      g.fillStyle = seatColor;
      g.fillRect(x + 2, y + 12, 12, 14);
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(x + 2, y + 22, 12, 4);
      if (rnd() < crowd) {
        g.globalAlpha = 0.8;
        g.fillStyle = shirts[Math.floor(rnd() * shirts.length)];
        g.fillRect(x + 3, y + 8, 10, 14);
        g.fillStyle = skins[Math.floor(rnd() * skins.length)];
        g.beginPath();
        g.arc(x + 8, y + 5, 3.6, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
    }
  }
  return tex(c, true, true);
}

/** LED advertising boards: invented brands on coloured panels. */
export function adTexture() {
  const c = canvas(2048, 64);
  const g = c.getContext("2d")!;
  const ads: [string, string, string][] = [
    ["ZERO X GAMING", "#05070c", "#22d3ee"],
    ["SPORTS+", "#0f172a", "#f2c230"],
    ["HARBOUR ENERGY", "#a3122c", "#ffffff"],
    ["SOUTHERLY COLD", "#0b3d6b", "#ffffff"],
    ["KOOKA BANK", "#1d6b2f", "#fef3c7"],
    ["TOP DECK TYRES", "#111111", "#f97316"],
  ];
  const w = 2048 / ads.length;
  ads.forEach(([t, bg, fg], i) => {
    g.fillStyle = bg;
    g.fillRect(i * w, 0, w, 64);
    g.fillStyle = fg;
    g.font = "italic 900 40px Arial Black, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(t, i * w + w / 2, 34, w - 20);
  });
  // LED pixel grid.
  g.fillStyle = "rgba(0,0,0,0.22)";
  for (let x = 0; x < 2048; x += 3) g.fillRect(x, 0, 1, 64);
  for (let y = 0; y < 64; y += 3) g.fillRect(0, y, 2048, 1);
  const t = tex(c, true, true);
  return t;
}

/** The ball: red leather in four panels, white stitching, the lace on top. */
export function ballTexture() {
  const c = canvas(512, 256);
  const g = c.getContext("2d")!;
  seed = 33;
  const img = g.createImageData(512, 256);
  const n = noise2(40, 13);
  for (let i = 0; i < 512 * 256; i++) {
    const x = i % 512;
    const y = Math.floor(i / 512);
    const k = n(x / 512, y / 256) * 0.5 + rnd() * 0.5;
    img.data[i * 4] = 150 + k * 40;
    img.data[i * 4 + 1] = 26 + k * 14;
    img.data[i * 4 + 2] = 24 + k * 12;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // Seams (meridians tip to tip) with stitching.
  for (let k = 0; k < 4; k++) {
    const x = k * 128;
    g.fillStyle = "rgba(40,0,0,0.85)";
    g.fillRect(x - 2, 0, 4, 256);
    g.fillStyle = "#f2efe6";
    for (let y = 12; y < 244; y += 9) {
      g.fillRect(x - 6, y, 3, 4);
      g.fillRect(x + 3, y + 4, 3, 4);
    }
  }
  // Lace: cross-stitch over the top seam, middle third.
  g.strokeStyle = "#f7f4ea";
  g.lineWidth = 4;
  for (let y = 92; y < 168; y += 10) {
    g.beginPath();
    g.moveTo(52, y);
    g.lineTo(76, y + 5);
    g.stroke();
  }
  // Maker's mark.
  g.fillStyle = "rgba(242,194,48,0.9)";
  g.font = "bold 26px Arial, sans-serif";
  g.textAlign = "center";
  g.fillText("ZX", 320, 140);
  return tex(c);
}

/** Goal netting: a diamond mesh on transparency. */
export function netTexture() {
  const c = canvas(128);
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(240,240,240,0.55)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(128, 128);
  g.moveTo(128, 0);
  g.lineTo(0, 128);
  g.stroke();
  const t = tex(c, true, true);
  return t;
}

/** A floodlight bank: rows of lamp faces. */
export function lampTexture() {
  const c = canvas(256, 128);
  const g = c.getContext("2d")!;
  g.fillStyle = "#1a1c20";
  g.fillRect(0, 0, 256, 128);
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 12; x++) {
      const cx = 12 + x * 21;
      const cy = 12 + y * 21;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, 9);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.6, "#f4f1e0");
      grad.addColorStop(1, "#6b6b60");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, 9, 0, Math.PI * 2);
      g.fill();
    }
  return tex(c);
}

/** The stadium screen's canvas (redrawn when the score changes). */
export function screenCanvas() {
  return canvas(1024, 384);
}

/** A soft round blob (ball shadow, markers). */
export function blobTexture(inner = "rgba(0,0,0,0.55)") {
  const c = canvas(64);
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return tex(c);
}

/** A ring (the controlled player, the drop zone). */
export function ringTexture() {
  const c = canvas(128);
  const g = c.getContext("2d")!;
  g.strokeStyle = "#ffffff";
  g.lineWidth = 9;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.globalAlpha = 0.5;
  g.beginPath();
  g.arc(64, 64, 40, 0, Math.PI * 2);
  g.stroke();
  return tex(c);
}

/** Radial glow for lamps (bloom helper). */
export function glowTexture() {
  const c = canvas(64);
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.2, "rgba(255,250,235,0.7)");
  grad.addColorStop(1, "rgba(255,250,235,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return tex(c);
}
