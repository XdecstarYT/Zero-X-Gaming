import * as THREE from "three";
import { HALF_ROAD, HALF_STREET, LINES, line, SIZE, type City } from "./city";

/**
 * Procedural textures for Code 3: building facades (colour, lit windows,
 * roughness so the glass reflects the sky, normals for recessed windows),
 * the painted street plan, and tileable asphalt / concrete detail.
 */

const PX = 4; // street plan pixels per metre

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

function tex(c: HTMLCanvasElement, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Height map (grey levels) → tangent-space normal map. */
function normalFromHeight(src: HTMLCanvasElement, strength: number) {
  const w = src.width;
  const h = src.height;
  const sd = src.getContext("2d")!.getImageData(0, 0, w, h).data;
  const { c, g } = canvas(w, h);
  const out = g.createImageData(w, h);
  const at = (x: number, y: number) => sd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const n = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((-dx / n) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / n) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / n) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  g.putImageData(out, 0, 0);
  return tex(c, false);
}

function rng(seed: number) {
  let r = seed * 9301 + 49297;
  return () => (r = (r * 9301 + 49297) % 233280) / 233280;
}

export function paintGround(city: City) {
  const S = Math.ceil(SIZE * PX);
  const { c, g } = canvas(S, S);
  const m = (v: number) => v * PX;
  const colors: Record<string, string> = {
    downtown: "#8a8984",
    midtown: "#7d7b74",
    suburbs: "#4f6b3b",
    park: "#4c7438",
    industrial: "#6a6862",
    station: "#343538",
  };
  g.fillStyle = "#6f6d67";
  g.fillRect(0, 0, S, S);
  for (const b of city.blocks) {
    g.fillStyle = colors[b.district];
    g.fillRect(m(b.x0), m(b.z0), m(b.x1 - b.x0), m(b.z1 - b.z0));
    if (b.district === "suburbs" || b.district === "park") {
      for (let k = 0; k < 900; k++) {
        g.fillStyle = `rgba(${Math.random() < 0.5 ? "30,50,20" : "120,140,80"},0.14)`;
        g.beginPath();
        g.arc(m(b.x0 + Math.random() * (b.x1 - b.x0)), m(b.z0 + Math.random() * (b.z1 - b.z0)), m(0.3 + Math.random() * 1.4), 0, Math.PI * 2);
        g.fill();
      }
    }
    if (b.district === "suburbs") {
      g.fillStyle = "#8d8a82";
      for (let a = 0; a < 3; a++) {
        const lw = (b.x1 - b.x0) / 3;
        g.fillRect(m(b.x0 + lw * (a + 0.5) + 3), m(b.z0), m(2.6), m(7));
        g.fillRect(m(b.x0 + lw * (a + 0.5) + 3), m(b.z1 - 7), m(2.6), m(7));
      }
    }
    if (b.district === "park") {
      // Footpaths.
      g.strokeStyle = "#b7ab8c";
      g.lineWidth = m(2.2);
      g.beginPath();
      g.moveTo(m(b.x0), m(b.z0));
      g.lineTo(m(b.x1), m(b.z1));
      g.moveTo(m(b.x1), m(b.z0));
      g.lineTo(m(b.x0), m(b.z1));
      g.stroke();
    }
    if (b.district === "station") {
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.lineWidth = m(0.15);
      for (let k = 0; k <= 16; k++) {
        const x = b.x0 + 4 + k * 3.1;
        g.beginPath();
        g.moveTo(m(x), m(b.z0 + 4));
        g.lineTo(m(x), m(b.z0 + 9));
        g.stroke();
      }
    }
    // Oil stains in lots and yards.
    if (b.district === "station" || b.district === "industrial")
      for (let k = 0; k < 40; k++) {
        g.fillStyle = "rgba(0,0,0,0.12)";
        g.beginPath();
        g.ellipse(m(b.x0 + Math.random() * (b.x1 - b.x0)), m(b.z0 + Math.random() * (b.z1 - b.z0)), m(0.6), m(1), Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
  }
  // Carriageways.
  for (const L of city.lines) {
    g.fillStyle = "#2b2d30";
    g.fillRect(m(L - HALF_ROAD), 0, m(HALF_ROAD * 2), S);
    g.fillRect(0, m(L - HALF_ROAD), S, m(HALF_ROAD * 2));
  }
  // Wear: darker tyre tracks down each lane, patches and cracks.
  for (const L of city.lines)
    for (const off of [-3, -1, 1, 3]) {
      g.fillStyle = "rgba(0,0,0,0.12)";
      g.fillRect(m(L + off - 0.35), 0, m(0.7), S);
      g.fillRect(0, m(L + off - 0.35), S, m(0.7));
    }
  for (let k = 0; k < 500; k++) {
    const L = city.lines[Math.floor(Math.random() * city.lines.length)];
    const v = Math.random() * SIZE;
    const across = (Math.random() - 0.5) * 6;
    const vertical = Math.random() < 0.5;
    const x = vertical ? L + across : v;
    const z = vertical ? v : L + across;
    if (Math.random() < 0.5) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? "20,20,22" : "70,70,72"},0.5)`;
      g.fillRect(m(x), m(z), m(1 + Math.random() * 3), m(1 + Math.random() * 2));
    } else {
      g.strokeStyle = "rgba(10,10,10,0.5)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(m(x), m(z));
      for (let s = 0; s < 5; s++) g.lineTo(m(x + (Math.random() - 0.5) * 2), m(z + (Math.random() - 0.5) * 2));
      g.stroke();
    }
  }
  for (let k = 0; k < 90000; k++) {
    const shade = Math.random() < 0.5 ? "0,0,0" : "255,255,255";
    g.fillStyle = `rgba(${shade},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  // Markings, away from the intersections.
  const inX = (v: number) => city.lines.some((L) => Math.abs(v - L) < HALF_STREET + 0.5);
  g.fillStyle = "#e2b83a";
  for (const L of city.lines)
    for (let v = 0; v < SIZE; v += 0.5) {
      if (inX(v)) continue;
      g.fillRect(m(L - 0.3), m(v), m(0.18), m(0.52));
      g.fillRect(m(L + 0.12), m(v), m(0.18), m(0.52));
      g.fillRect(m(v), m(L - 0.3), m(0.52), m(0.18));
      g.fillRect(m(v), m(L + 0.12), m(0.52), m(0.18));
    }
  // Edge lines.
  g.fillStyle = "rgba(235,235,230,0.8)";
  for (const L of city.lines)
    for (let v = 0; v < SIZE; v += 0.5) {
      if (inX(v)) continue;
      for (const off of [-HALF_ROAD + 0.35, HALF_ROAD - 0.5]) {
        g.fillRect(m(L + off), m(v), m(0.15), m(0.52));
        g.fillRect(m(v), m(L + off), m(0.52), m(0.15));
      }
    }
  g.fillStyle = "#e9e9e4";
  for (let j = 0; j < LINES; j++)
    for (let i = 0; i < LINES; i++) {
      const X = line(i);
      const Z = line(j);
      for (let s = -HALF_ROAD + 0.4; s < HALF_ROAD - 0.3; s += 1)
        for (const d of [-1, 1]) {
          g.fillRect(m(X + s), m(Z + d * (HALF_STREET - 0.4) - 1.2), m(0.5), m(2.4));
          g.fillRect(m(X + d * (HALF_STREET - 0.4) - 1.2), m(Z + s), m(2.4), m(0.5));
        }
      g.fillRect(m(X - HALF_ROAD), m(Z - HALF_STREET - 2.2), m(HALF_ROAD), m(0.4));
      g.fillRect(m(X), m(Z + HALF_STREET + 1.8), m(HALF_ROAD), m(0.4));
      g.fillRect(m(X - HALF_STREET - 2.2), m(Z), m(0.4), m(HALF_ROAD));
      g.fillRect(m(X + HALF_STREET + 1.8), m(Z - HALF_ROAD), m(0.4), m(HALF_ROAD));
    }
  const t = tex(c, true, false);
  return t;
}

/** Tileable asphalt micro-detail: roughness + normal (one tile = 4 m). */
export function asphaltDetail() {
  const N = 256;
  const h = canvas(N, N);
  const r = canvas(N, N);
  const rnd = rng(7);
  h.g.fillStyle = "#808080";
  h.g.fillRect(0, 0, N, N);
  r.g.fillStyle = "#e0e0e0";
  r.g.fillRect(0, 0, N, N);
  for (let k = 0; k < 9000; k++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const v = Math.floor(90 + rnd() * 120);
    h.g.fillStyle = `rgb(${v},${v},${v})`;
    h.g.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2);
    const rv = Math.floor(170 + rnd() * 85);
    r.g.fillStyle = `rgb(${rv},${rv},${rv})`;
    r.g.fillRect(x, y, 2, 2);
  }
  return { normal: normalFromHeight(h.c, 2.2), rough: tex(r.c, false) };
}

/** Pavement slabs (one tile = 2 m). */
export function concrete() {
  const N = 256;
  const col = canvas(N, N);
  const h = canvas(N, N);
  const rnd = rng(3);
  col.g.fillStyle = "#a6a39b";
  col.g.fillRect(0, 0, N, N);
  h.g.fillStyle = "#c0c0c0";
  h.g.fillRect(0, 0, N, N);
  for (let k = 0; k < 3000; k++) {
    col.g.fillStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "255,255,255"},${rnd() * 0.06})`;
    col.g.fillRect(rnd() * N, rnd() * N, 2, 2);
  }
  col.g.strokeStyle = "rgba(0,0,0,0.25)";
  col.g.lineWidth = 2;
  h.g.strokeStyle = "#404040";
  h.g.lineWidth = 3;
  for (const v of [0, N / 2]) {
    for (const ctx of [col.g, h.g]) {
      ctx.beginPath();
      ctx.moveTo(v, 0);
      ctx.lineTo(v, N);
      ctx.moveTo(0, v);
      ctx.lineTo(N, v);
      ctx.stroke();
    }
  }
  return { map: tex(col.c), normal: normalFromHeight(h.c, 2) };
}

export function cloudTexture() {
  const { c, g } = canvas(1024, 256);
  g.clearRect(0, 0, 1024, 256);
  const rnd = rng(11);
  for (let k = 0; k < 260; k++) {
    const x = rnd() * 1024;
    const y = 40 + rnd() * 170;
    const r = 18 + rnd() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,255,255,0.35)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = tex(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function signTexture(text: string, bg: string, fg: string) {
  const { c, g } = canvas(512, 96);
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = fg;
  g.font = "bold 58px Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, 52, 490);
  return tex(c, true, false);
}

export function radialTexture(inner: string, outer: string) {
  const { c, g } = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
