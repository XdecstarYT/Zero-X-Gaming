import * as THREE from "three";
import { hash } from "../core/rng";

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Dark asphalt with grain and a few patches. */
export function asphaltTexture() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = "#34363a";
    g.fillRect(0, 0, 256, 256);
    const img = g.getImageData(0, 0, 256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const n = (hash(i % 256, Math.floor(i / 256)) - 0.5) * 34;
      img.data[i * 4] += n;
      img.data[i * 4 + 1] += n;
      img.data[i * 4 + 2] += n;
    }
    g.putImageData(img, 0, 0);
    g.globalAlpha = 0.18;
    for (let k = 0; k < 6; k++) {
      g.fillStyle = k % 2 ? "#2a2c30" : "#45474b";
      g.fillRect(hash(k, 1) * 220, hash(k, 2) * 220, 20 + hash(k, 3) * 50, 10 + hash(k, 4) * 30);
    }
  });
}

/** Light paving slabs. */
export function sidewalkTexture() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = "#bdb8ae";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(90,85,78,.35)";
    g.lineWidth = 2;
    for (let i = 0; i <= 128; i += 32) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 128);
      g.moveTo(0, i);
      g.lineTo(128, i);
      g.stroke();
    }
    for (let k = 0; k < 400; k++) {
      g.fillStyle = `rgba(0,0,0,${hash(k, 7) * 0.05})`;
      g.fillRect(hash(k, 1) * 128, hash(k, 2) * 128, 2, 2);
    }
  });
}

export const SPEEDS = [30, 40, 50, 60, 70, 90, 110];

/** Painted road numbers (speed limits), one tile each, white on transparent. */
export function speedAtlas() {
  const tile = 128;
  return canvasTex(tile * SPEEDS.length, tile * 2, (g) => {
    g.clearRect(0, 0, tile * SPEEDS.length, tile * 2);
    g.fillStyle = "#f3f3ee";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "900 120px system-ui, sans-serif";
    SPEEDS.forEach((s, i) => {
      g.save();
      g.translate(i * tile + tile / 2, tile);
      g.scale(0.62, 1.7);
      g.fillText(String(s), 0, 0);
      g.restore();
    });
  });
}

const labelCache = new Map<string, { tex: THREE.Texture; aspect: number }>();

/** A street name, for a flat label along the road. */
export function labelTexture(text: string) {
  const hit = labelCache.get(text);
  if (hit) return hit;
  const font = "800 44px system-ui, sans-serif";
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 28;
  const h = 64;
  const tex = canvasTex(w, h, (g) => {
    g.font = font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 8;
    g.strokeStyle = "rgba(10,12,18,.75)";
    g.strokeText(text, w / 2, h / 2 + 2);
    g.fillStyle = "#ffffff";
    g.fillText(text, w / 2, h / 2 + 2);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const out = { tex, aspect: w / h };
  labelCache.set(text, out);
  return out;
}

/** Arrows for the route highlight. */
export function chevronTexture() {
  return canvasTex(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 10;
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(14, 46);
    g.lineTo(32, 20);
    g.lineTo(50, 46);
    g.stroke();
  });
}
