import * as THREE from "three";
import { FLOORS, type FloorId } from "../data";

function canvas(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = true) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Deterministic speckle so textures look the same every run. */
function speckle(g: CanvasRenderingContext2D, s: number, n: number, colors: string[], size = 2, seed = 1) {
  let x = seed;
  const r = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    g.globalAlpha = 0.25 + r() * 0.35;
    g.fillRect(r() * s, r() * s, size * (0.5 + r()), size * (0.5 + r()));
  }
  g.globalAlpha = 1;
}

const cache = new Map<string, THREE.Texture>();

/** One cell of floor: base colour, a grout/plank pattern and a little wear. */
export function floorTexture(id: FloorId) {
  const k = `floor:${id}`;
  if (cache.has(k)) return cache.get(k)!;
  const f = FLOORS[id];
  const t = canvas(128, (g, s) => {
    g.fillStyle = f.color;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = f.line;
    g.lineWidth = 3;
    if (id === "tile" || id === "lino") {
      const n = id === "tile" ? 2 : 1;
      for (let i = 0; i <= n; i++) {
        g.beginPath();
        g.moveTo((i * s) / n, 0);
        g.lineTo((i * s) / n, s);
        g.moveTo(0, (i * s) / n);
        g.lineTo(s, (i * s) / n);
        g.stroke();
      }
      speckle(g, s, 140, ["#ffffff", f.line], 2, 3);
    } else if (id === "wood") {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? "#ad7e50" : "#c49465";
        g.fillRect(0, (i * s) / 4 + 1, s, s / 4 - 2);
      }
      speckle(g, s, 200, ["#8a5f38", "#d4a476"], 3, 5);
    } else if (id === "carpet") {
      speckle(g, s, 900, ["#5a6c94", "#7a8db6", "#4f6089"], 2, 7);
    } else if (id === "path") {
      g.lineWidth = 2;
      for (let i = 0; i <= 2; i++) {
        g.beginPath();
        g.moveTo(0, (i * s) / 2);
        g.lineTo(s, (i * s) / 2);
        g.stroke();
      }
      for (let r = 0; r < 2; r++)
        for (let i = 0; i <= 2; i++) {
          const x = (i * s) / 2 + (r % 2 ? s / 4 : 0);
          g.beginPath();
          g.moveTo(x, (r * s) / 2);
          g.lineTo(x, ((r + 1) * s) / 2);
          g.stroke();
        }
      speckle(g, s, 300, ["#a9a294", "#ddd6c8"], 2, 9);
    } else {
      speckle(g, s, 600, ["#8f8f8a", "#bcbcb6", "#9d9d98"], 2, 11);
    }
  });
  cache.set(k, t);
  return t;
}

export function grassTexture() {
  if (cache.has("grass")) return cache.get("grass")!;
  const t = canvas(256, (g, s) => {
    g.fillStyle = "#5f9e45";
    g.fillRect(0, 0, s, s);
    speckle(g, s, 2600, ["#4f8a39", "#6fb052", "#7cbd5c", "#4a7f34"], 3, 13);
  });
  t.repeat.set(24, 24);
  cache.set("grass", t);
  return t;
}

export function asphaltTexture() {
  if (cache.has("asphalt")) return cache.get("asphalt")!;
  const t = canvas(256, (g, s) => {
    g.fillStyle = "#3a3d42";
    g.fillRect(0, 0, s, s);
    speckle(g, s, 3000, ["#2f3236", "#4a4d52", "#55585d"], 2, 17);
  });
  cache.set("asphalt", t);
  return t;
}

/** A soft brown smudge for dirty floors. */
export function dirtTexture() {
  if (cache.has("dirt")) return cache.get("dirt")!;
  const t = canvas(
    64,
    (g, s) => {
      const grd = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
      grd.addColorStop(0, "rgba(92,64,38,0.75)");
      grd.addColorStop(0.6, "rgba(92,64,38,0.35)");
      grd.addColorStop(1, "rgba(92,64,38,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
      speckle(g, s, 60, ["#3d2a18"], 3, 21);
    },
    false,
  );
  cache.set("dirt", t);
  return t;
}

/** A text label (room names) as a sprite texture. */
export function labelTexture(text: string, color: string, warn: boolean) {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = "800 30px Montserrat, Inter, system-ui, sans-serif";
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + (warn ? 58 : 34);
  c.width = w;
  c.height = 50;
  g.font = font;
  g.fillStyle = "rgba(10,14,22,0.72)";
  const r = 22;
  g.beginPath();
  g.moveTo(r, 2);
  g.arcTo(w - 2, 2, w - 2, 48, r);
  g.arcTo(w - 2, 48, 2, 48, r);
  g.arcTo(2, 48, 2, 2, r);
  g.arcTo(2, 2, w - 2, 2, r);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc(20, 25, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ffffff";
  g.textBaseline = "middle";
  g.fillText(text, 32, 26);
  if (warn) {
    g.fillStyle = "#fbbf24";
    g.fillText("!", w - 22, 26);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, aspect: w / 50 };
}
