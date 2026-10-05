import { rng } from "../core/rng";
import { world as W } from "../theme";
import { buildingSpec, FLOOR, type Style } from "../world/buildingSpec";
import type { Zone } from "../world/lots";
import type { ServiceKind } from "../world/lots";

/** Instanced part kinds. */
export type Kind = "facade" | "glass" | "box" | "metal" | "cyl" | "cone" | "prism" | "crown" | "glow" | "solar" | "dark";

/** One part, in lot-local space: x along the frontage, z away from the road (front at -d/2), y up from the ground. */
export interface Part {
  k: Kind;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  ry: number;
  c: string;
  /** Tip over (for logs lying down). */
  rz?: number;
}

const AWNINGS = ["#c0392b", "#1f7a5a", "#2a5d9f", "#d9822b", "#6b3fa0", "#2f2f2f"];
const SIGNS = ["#ff5a5f", "#22e5ff", "#ffd166", "#8b5cff", "#4ade80", "#ff8fab"];
const HOUSE = ["#efe6d0", "#d9c9a8", "#c9d6df", "#e8d5c4", "#b7c4a6", "#f2e8d8"];

/**
 * The modular kit: base, middle, top and props, picked from the lot's seed so
 * no two blocks match. `density` (0–1) thins out optional props.
 */
export function buildingParts(zone: Zone, tier: number, w: number, d: number, seed: number, density: number, res: number[]): { parts: Part[]; spec: ReturnType<typeof buildingSpec> } {
  const spec = buildingSpec(zone, tier, w, d, seed);
  const r = rng(seed);
  const P: Part[] = [];
  const prop = () => r.next() < density;
  const box = (k: Kind, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, ry = 0) => P.push({ k, x, y: y + sy / 2, z, sx, sy, sz, ry, c });
  const front = -d / 2;
  const frontAt = (depth: number, setback: number) => front + setback + depth / 2;

  const brick = r.pick(W.brick);
  const cream = r.pick(W.cream);
  const grey = r.pick(W.grey);
  const roofEquip = (cx: number, cz: number, top: number, bw: number, bd: number, n = 3) => {
    for (let i = 0; i < n; i++) {
      if (!prop()) continue;
      const s = r.range(1.2, 2.4);
      box("metal", cx + r.range(-bw / 2 + 2, bw / 2 - 2), top, cz + r.range(-bd / 2 + 2, bd / 2 - 2), s, r.range(0.8, 1.6), s * r.range(0.7, 1.2), r.pick(W.metal));
    }
  };
  const parapet = (cx: number, cz: number, top: number, bw: number, bd: number, c: string) => {
    box("box", cx, top, cz - bd / 2 + 0.15, bw, 0.9, 0.3, c);
    box("box", cx, top, cz + bd / 2 - 0.15, bw, 0.9, 0.3, c);
    box("box", cx - bw / 2 + 0.15, top, cz, 0.3, 0.9, bd, c);
    box("box", cx + bw / 2 - 0.15, top, cz, 0.3, 0.9, bd, c);
    box("box", cx, top, cz, bw - 0.4, 0.15, bd - 0.4, W.roofDark);
  };
  const waterTower = (x: number, z: number, top: number) => {
    for (const [dx, dz] of [
      [-0.9, -0.9],
      [0.9, -0.9],
      [-0.9, 0.9],
      [0.9, 0.9],
    ])
      box("cyl", x + dx, top, z + dz, 0.18, 2.6, 0.18, "#4a3b30");
    box("cyl", x, top + 2.6, z, 2.8, 3.2, 2.8, "#8b6a4a");
    box("cone", x, top + 5.8, z, 3.0, 1.4, 3.0, "#5b4636");
  };
  const storefront = (cx: number, cz: number, bw: number, bd: number, color: string, units = 1) => {
    const uw = bw / units;
    for (let u = 0; u < units; u++) {
      const ux = cx - bw / 2 + uw * (u + 0.5);
      box("glass", ux, 0, cz - bd / 2 + 0.02, uw - 0.6, FLOOR - 0.4, 0.3, "#ffffff");
      if (prop()) box("box", ux, FLOOR - 0.5, cz - bd / 2 - 0.9, uw - 0.8, 0.25, 1.8, r.pick(AWNINGS), 0);
      box("glow", ux, FLOOR - 0.15, cz - bd / 2 - 0.08, Math.min(uw - 1.2, 5), 0.6, 0.15, r.pick(SIGNS));
    }
    void color;
  };
  const tree = (x: number, z: number, s = 1) => {
    box("cyl", x, 0, z, 0.35 * s, 2.2 * s, 0.35 * s, W.trunk);
    box("crown", x, 1.6 * s, z, 3.4 * s, 3.2 * s, 3.4 * s, r.pick(W.trees));
  };
  const fence = (bw: number, bd: number, c = "#e9e4d8") => {
    const h = 1.1;
    box("box", 0, 0, d / 2 - 0.15, bw, h, 0.12, c);
    box("box", -bw / 2 + 0.06, 0, 0, 0.12, h, bd, c);
    box("box", bw / 2 - 0.06, 0, 0, 0.12, h, bd, c);
    box("box", -bw / 4 - 1, 0, front + 0.2, bw / 2 - 2, h * 0.8, 0.12, c);
    box("box", bw / 4 + 1, 0, front + 0.2, bw / 2 - 2, h * 0.8, 0.12, c);
  };
  // Foundation: hides sloping ground under the building.
  const plinth = (cx: number, cz: number, bw: number, bd: number, c = "#7d776d") => box("box", cx, -3, cz, bw + 0.3, 3.05, bd + 0.3, c);

  const style: Style = spec.style;
  const floors = spec.floors;
  const H = floors * FLOOR;
  switch (style) {
    case "house": {
      const bw = Math.min(w - 4, r.range(8, 11));
      const bd = Math.min(d - 7, r.range(7.5, 10));
      const cz = frontAt(bd, r.range(3.5, 5));
      const c = r.pick(HOUSE);
      plinth(0, cz, bw, bd);
      box("facade", 0, 0, cz, bw, H, bd, c);
      const roof = r.pick(W.roofTile);
      const alongX = r.next() < 0.5;
      P.push({ k: "prism", x: 0, y: H + 1.6, z: cz, sx: alongX ? bw + 0.8 : bd + 0.8, sy: 3.2, sz: alongX ? bd + 0.8 : bw + 0.8, ry: alongX ? 0 : Math.PI / 2, c: roof });
      if (prop()) box("box", bw / 3, H, cz + bd / 5, 0.8, 2.6, 0.8, "#8a5a44");
      box("dark", r.range(-bw / 4, bw / 4), 0, cz - bd / 2 - 0.05, 1.1, 2.2, 0.12, "#5a3b2a");
      if (prop()) box("dark", -w / 2 + 2.2, 0.01, front + 3.5, 3, 0.05, 7, "#55575a");
      if (prop()) fence(w, d);
      if (prop()) tree(r.range(-w / 2 + 2, w / 2 - 2), d / 2 - 3, r.range(0.8, 1.2));
      if (prop()) tree(w / 2 - 2, front + 2.5, 0.8);
      break;
    }
    case "walkup":
    case "mixedWalkup": {
      const bw = w - 1;
      const bd = Math.min(d - 3, 18);
      const cz = frontAt(bd, 0.6);
      plinth(0, cz, bw, bd);
      if (style === "mixedWalkup") {
        box("box", 0, 0, cz, bw, FLOOR, bd, "#3d3a36");
        storefront(0, cz, bw, bd, brick, Math.max(1, Math.round(bw / 9)));
        box("facade", 0, FLOOR, cz, bw, H - FLOOR, bd, brick);
      } else box("facade", 0, 0, cz, bw, H, bd, brick);
      box("box", 0, H, cz, bw + 0.5, 0.6, bd + 0.5, "#e6dccb");
      parapet(0, cz, H + 0.6, bw, bd, brick);
      if (prop()) for (let f = 1; f < floors; f++) box("dark", bw / 2 - 2.6, f * FLOOR, cz - bd / 2 - 0.7, 2.6, 0.12, 1.2, "#2a2a2a");
      if (floors >= 4 && prop()) waterTower(r.range(-bw / 4, bw / 4), cz + r.range(-bd / 5, bd / 5), H + 0.6);
      else roofEquip(0, cz, H + 0.6, bw, bd, 2);
      break;
    }
    case "midrise":
    case "mixedMid":
    case "office": {
      const bw = w - 1;
      const bd = Math.min(d - 2, 24);
      const cz = frontAt(bd, 0.6);
      const c = style === "office" ? grey : r.next() < 0.6 ? cream : grey;
      plinth(0, cz, bw, bd);
      const ground = style === "midrise" ? 1 : 1.25;
      box("box", 0, 0, cz, bw, FLOOR * ground, bd, "#4a4844");
      if (style !== "midrise") storefront(0, cz, bw, bd, c, Math.max(1, Math.round(bw / 10)));
      else box("glass", 0, 0, cz - bd / 2 + 0.02, Math.min(6, bw - 2), FLOOR - 0.4, 0.3, "#ffffff");
      const bodyH = H - FLOOR * ground;
      box("facade", 0, FLOOR * ground, cz, bw, bodyH - FLOOR, bd, c);
      // Set-back top floor.
      box("facade", 0, H - FLOOR, cz + 1, bw - 3, FLOOR, bd - 3, c);
      box("box", 0, H - FLOOR, cz, bw + 0.3, 0.35, bd + 0.3, "#d8d2c6");
      parapet(0, cz + 1, H, bw - 3, bd - 3, c);
      roofEquip(0, cz + 1, H, bw - 3, bd - 3, 4);
      break;
    }
    case "brickTower":
    case "mixedTower": {
      const pw = w - 1;
      const pd = Math.min(d - 2, 26);
      const cz = frontAt(pd, 0.6);
      plinth(0, cz, pw, pd);
      const podium = 2 * FLOOR;
      box("box", 0, 0, cz, pw, FLOOR, pd, "#3f3a35");
      storefront(0, cz, pw, pd, brick, Math.max(1, Math.round(pw / 10)));
      box("facade", 0, FLOOR, cz, pw, FLOOR, pd, brick);
      box("box", 0, podium, cz, pw + 0.4, 0.5, pd + 0.4, "#e6dccb");
      const tw = Math.max(10, pw * 0.72);
      const td = Math.max(10, pd * 0.68);
      const body = H - podium;
      box("facade", 0, podium + 0.5, cz + 0.6, tw, body * 0.82, td, brick);
      box("box", 0, podium + 0.5 + body * 0.82, cz + 0.6, tw + 0.4, 0.5, td + 0.4, "#e6dccb");
      box("facade", 0, podium + 1 + body * 0.82, cz + 0.9, tw - 2.4, body * 0.18, td - 2.4, brick);
      const top = podium + 1 + body;
      parapet(0, cz + 0.9, top, tw - 2.4, td - 2.4, brick);
      waterTower(tw / 6, cz + 0.9, top);
      if (prop()) waterTower(-tw / 5, cz + 1.4, top);
      break;
    }
    case "glassTower":
    case "officeTower": {
      const pw = w - 1;
      const pd = Math.min(d - 2, 26);
      const cz = frontAt(pd, 0.6);
      plinth(0, cz, pw, pd);
      box("glass", 0, 0, cz, pw, FLOOR * 1.5, pd, "#ffffff");
      box("box", 0, FLOOR * 1.5, cz, pw + 0.4, 0.4, pd + 0.4, "#c9ccd0");
      const tw = Math.max(10, pw * 0.7);
      const td = Math.max(10, pd * 0.7);
      const body = H - FLOOR * 1.5;
      box("glass", 0, FLOOR * 1.5 + 0.4, cz + 0.5, tw, body * 0.75, td, "#ffffff");
      box("glass", 0, FLOOR * 1.5 + 0.4 + body * 0.75, cz + 0.8, tw - 3, body * 0.25, td - 3, "#ffffff");
      const top = FLOOR * 1.5 + 0.4 + body;
      box("box", 0, top, cz + 0.8, tw - 2.4, 1.6, td - 2.4, "#9aa1a8");
      if (prop()) box("metal", 0, top + 1.6, cz + 0.8, 0.3, 9, 0.3, "#d0d4d8");
      break;
    }
    case "shop":
    case "shophouse": {
      const bw = w - 1;
      const bd = Math.min(d - 4, 14);
      const cz = frontAt(bd, 0.8);
      const c = style === "shop" ? r.pick([cream, "#e7d8c0", "#d6e0e4", "#efe2cf"]) : brick;
      plinth(0, cz, bw, bd);
      box("box", 0, 0, cz, bw, FLOOR, bd, c);
      storefront(0, cz, bw, bd, c, Math.max(1, Math.round(bw / 8)));
      if (floors > 1) box("facade", 0, FLOOR, cz, bw, (floors - 1) * FLOOR, bd, c);
      parapet(0, cz, H, bw, bd, c);
      roofEquip(0, cz, H, bw, bd, 2);
      if (prop()) box("dark", 0, 0.01, d / 2 - 3, w - 2, 0.05, 5, "#55575a");
      break;
    }
    case "shops": {
      const bw = w - 1;
      const bd = Math.min(d - 3, 18);
      const cz = frontAt(bd, 0.6);
      plinth(0, cz, bw, bd);
      const units = Math.max(2, Math.round(bw / 8));
      const uw = bw / units;
      for (let u = 0; u < units; u++) {
        const ux = -bw / 2 + uw * (u + 0.5);
        const c = r.pick([cream, brick, grey, "#d9c2a5", "#c7d3c0"]);
        const hh = H + r.range(-0.6, 1.2);
        box("box", ux, 0, cz, uw, FLOOR, bd, c);
        box("facade", ux, FLOOR, cz, uw, hh - FLOOR, bd, c);
        parapet(ux, cz, hh, uw, bd, c);
      }
      storefront(0, cz, bw, bd, cream, units);
      break;
    }
    case "solarLot": {
      box("dark", 0, -0.2, 0, w - 0.5, 0.25, d - 0.5, "#3c3e42");
      for (let x = -w / 2 + 3; x < w / 2 - 2; x += 3) box("box", x, 0.06, -d / 4, 0.12, 0.02, d / 2 - 2, "#e8e8e2");
      // Solar canopies over two rows of bays.
      for (const zz of [-d / 4, d / 4]) {
        for (let x = -w / 2 + 3; x < w / 2 - 2; x += 6) box("cyl", x, 0, zz, 0.25, 3.2, 0.25, "#9aa1a8");
        box("solar", 0, 3.2, zz, w - 3, 0.2, d / 2 - 3, "#1d2b4a", 0);
      }
      const kiosk = Math.min(6, w / 3);
      box("box", w / 2 - kiosk / 2 - 1, 0, d / 2 - 3, kiosk, 3, 4, cream);
      box("glow", w / 2 - kiosk / 2 - 1, 2.6, d / 2 - 5.05, kiosk - 1, 0.5, 0.1, r.pick(SIGNS));
      for (let i = 0; i < 4; i++) if (prop()) box("box", -w / 2 + 3 + i * 3, 0.05, -d / 4 + r.range(-2, 2), 1.8, 1.4, 4.2, r.pick(["#c0392b", "#2a5d9f", "#e8e8e2", "#2f2f2f", "#7f8c8d"]));
      break;
    }
    case "shed":
    case "warehouse":
    case "factory": {
      const bw = w - 2;
      const bd = Math.min(d - 5, style === "shed" ? 14 : 24);
      const cz = frontAt(bd, 2.5);
      const c = r.pick(W.metal);
      const bh = style === "shed" ? 5 : style === "warehouse" ? 8 : 9;
      plinth(0, cz, bw, bd);
      box("metal", 0, 0, cz, bw, bh, bd, c);
      if (style === "shed") for (let x = -bw / 2 + 2; x < bw / 2 - 1; x += 4) P.push({ k: "prism", x, y: bh + 0.9, z: cz, sx: 4, sy: 1.8, sz: bd, ry: Math.PI / 2, c: "#6f7a80" });
      else box("box", 0, bh, cz, bw, 0.3, bd, "#4f5559");
      // Roller doors and a dock apron.
      for (let x = -bw / 2 + 3; x < bw / 2 - 2; x += 6) box("dark", x, 0, cz - bd / 2 - 0.05, 3.6, Math.min(4, bh - 1), 0.12, "#3a3f44");
      box("dark", 0, 0.01, front + 1.3, w - 2, 0.05, 2.4, "#55575a");
      // Ladder up the side, vents on top.
      box("metal", bw / 2 + 0.1, 0, cz - bd / 4, 0.1, bh + 1, 0.7, "#c8a23a");
      for (let i = 0; i < 4; i++) if (prop()) box("cyl", r.range(-bw / 2 + 2, bw / 2 - 2), bh + 0.2, cz + r.range(-bd / 3, bd / 3), 0.9, 1.2, 0.9, "#b9c0c4");
      const kind = res[3] > 0 && r.next() < 0.45 ? "oil" : res[2] > 0 && r.next() < 0.45 ? "farm" : res[1] > 0 && r.next() < 0.45 ? "wood" : "plain";
      if (style !== "shed" || prop()) {
        const yardZ = Math.min(d / 2 - 3, cz + bd / 2 + 3);
        if (kind === "oil") {
          for (let i = 0; i < 2; i++) box("cyl", -w / 4 + i * 6, 0, yardZ, 4.5, 4.2, 4.5, "#d8d4cc");
          if (style === "factory") box("cyl", w / 2 - 3, 0, yardZ, 0.5, 16, 0.5, "#9aa1a8");
        } else if (kind === "farm") {
          for (let i = 0; i < 3; i++) {
            box("cyl", -w / 3 + i * 4.2, 0, yardZ, 3.4, 9, 3.4, "#c8ccd0");
            box("cone", -w / 3 + i * 4.2, 9, yardZ, 3.6, 1.6, 3.6, "#9aa1a8");
          }
        } else if (kind === "wood") {
          for (let i = 0; i < 6; i++) P.push({ k: "cyl", x: -w / 4 + 4, y: 0.55 + Math.floor(i / 3) * 1.0, z: yardZ - 1.2 + (i % 3) * 1.1, sx: 1, sy: 8, sz: 1, ry: 0, rz: Math.PI / 2, c: "#8a6a48" });
        } else {
          for (let i = 0; i < 3; i++) if (prop()) box("box", -w / 3 + i * 3, 0, yardZ, 2.4, 2.6, 6, r.pick(["#c0392b", "#2a5d9f", "#1f7a5a", "#d9822b"]));
        }
      }
      if (style === "factory") {
        for (let i = 0; i < 2; i++) {
          const x = bw / 2 - 3 - i * 4;
          box("cyl", x, bh, cz + bd / 4, 1.6, 14, 1.6, i ? "#b0503a" : "#c9c4bc");
          box("cyl", x, bh + 14, cz + bd / 4, 1.8, 1.2, 1.8, "#e8e3da");
        }
        box("cyl", -bw / 3, 0, cz + bd / 2 + 2, 5, 6, 5, "#d6d2ca");
        box("metal", 0, bh * 0.6, cz - bd / 2 - 0.6, bw * 0.6, 0.5, 0.5, "#9aa1a8");
      }
      break;
    }
  }
  // A street tree at the kerb for most urban lots.
  if (style !== "house" && style !== "solarLot" && zone !== "I" && prop()) tree(r.range(-w / 2 + 2, w / 2 - 2), front - 0.8, 0.85);
  return { parts: P, spec };
}

/** Civic buildings: each a recognisable little landmark. */
export function serviceParts(kind: ServiceKind, w: number, d: number, seed: number): Part[] {
  const r = rng(seed);
  const P: Part[] = [];
  const box = (k: Kind, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, ry = 0) => P.push({ k, x, y: y + sy / 2, z, sx, sy, sz, ry, c });
  const front = -d / 2;
  const plinth = (bw: number, bd: number, cz: number) => box("box", 0, -3, cz, bw + 0.3, 3.05, bd + 0.3, "#7d776d");
  switch (kind) {
    case "police": {
      plinth(w - 4, d - 8, 1);
      box("facade", 0, 0, 1, w - 4, 2 * FLOOR, d - 8, "#d9dee6");
      box("box", 0, 2 * FLOOR, 1, w - 3.5, 0.6, d - 7.5, "#1f3b7a");
      box("glow", 0, 2 * FLOOR - 1, front + 3.95, 6, 0.8, 0.15, "#3b82f6");
      box("dark", 0, 0.01, front + 2, w - 2, 0.05, 3.6, "#55575a");
      for (let i = 0; i < 2; i++) box("box", -4 + i * 5, 0.05, front + 2, 2, 1.4, 4.3, i ? "#1f3b7a" : "#f2f2f2");
      break;
    }
    case "fire": {
      plinth(w - 3, d - 8, 1);
      box("facade", 0, 0, 1, w - 3, 2 * FLOOR + 1, d - 8, "#b73a2c");
      for (let i = 0; i < 2; i++) box("dark", -4.5 + i * 9, 0, front + 3.95, 6, 4.4, 0.12, "#e8e3da");
      box("box", w / 2 - 3, 0, d / 2 - 5, 3, 14, 3, "#b73a2c");
      box("glow", 0, 2 * FLOOR, front + 3.92, 7, 0.8, 0.15, "#ffd166");
      break;
    }
    case "clinic": {
      plinth(w - 4, d - 6, 0);
      box("facade", 0, 0, 0, w - 4, 2 * FLOOR, d - 6, "#eef2f5");
      box("glow", 0, 2 * FLOOR + 0.6, front + 3, 2.6, 0.8, 0.2, "#ef4444");
      box("glow", 0, 2 * FLOOR + 0.6, front + 3, 0.8, 2.6, 0.2, "#ef4444");
      box("glass", 0, 0, front + 3.05, 5, FLOOR - 0.5, 0.2, "#ffffff");
      break;
    }
    case "school": {
      plinth(w - 6, 14, front + 9);
      box("facade", 0, 0, front + 9, w - 6, 2 * FLOOR, 14, "#c9603f");
      box("facade", -w / 2 + 7, 0, 4, 8, 2 * FLOOR, 16, "#c9603f");
      box("box", 0, 2 * FLOOR, front + 9, w - 5.5, 0.5, 14.5, "#e6dccb");
      box("box", 6, 0.02, d / 2 - 9, 14, 0.05, 12, "#3f8f4a");
      box("box", 6, 0.04, d / 2 - 9, 13, 0.04, 0.2, "#ffffff");
      box("metal", -w / 2 + 3, 0, front + 1.5, 0.12, 7, 0.12, "#d0d4d8");
      box("glow", -w / 2 + 3.6, 6, front + 1.5, 1.2, 0.8, 0.05, "#22e5ff");
      break;
    }
    case "power": {
      box("dark", 0, -0.1, 0, w - 1, 0.15, d - 1, "#6b6e72");
      box("metal", -w / 4, 0, d / 6, w / 2 - 2, 9, d / 2, "#9aa1a8");
      for (let i = 0; i < 2; i++) {
        box("cyl", w / 5 + i * 8 - 4, 0, -d / 6, 7, 16, 7, "#d6d2ca");
        box("cyl", w / 5 + i * 8 - 4, 16, -d / 6, 6.4, 2, 6.4, "#c2bdb4");
      }
      box("cyl", -w / 3, 9, d / 4, 1.2, 14, 1.2, "#b0503a");
      for (let x = -w / 2 + 2; x < w / 2; x += 3) box("metal", x, 0, -d / 2 + 0.5, 0.08, 2.2, 0.08, "#9aa1a8");
      break;
    }
    case "water": {
      for (const [dx, dz] of [
        [-2.4, -2.4],
        [2.4, -2.4],
        [-2.4, 2.4],
        [2.4, 2.4],
      ])
        box("cyl", dx, 0, dz, 0.4, 14, 0.4, "#8a9aa8");
      box("cyl", 0, 14, 0, 9, 5, 9, "#5aa6c9");
      box("cone", 0, 19, 0, 9.4, 2.2, 9.4, "#3f7f9f");
      box("glow", 0, 16.5, -4.6, 3.6, 0.9, 0.1, "#ffffff");
      break;
    }
    case "park": {
      box("box", 0, -0.05, 0, w - 0.5, 0.12, d - 0.5, "#4f9a3c");
      box("box", 0, 0.03, 0, 2, 0.05, d - 1, "#d8c9a8");
      box("box", 0, 0.03, 0, w - 1, 0.05, 2, "#d8c9a8");
      box("cyl", 0, 0, 0, 4, 0.7, 4, "#b8b2a6");
      box("cyl", 0, 0.7, 0, 3.2, 0.1, 3.2, "#5aa6c9");
      for (let i = 0; i < 6; i++) {
        const x = (i % 2 ? 1 : -1) * r.range(5, w / 2 - 3);
        const z = (i < 3 ? 1 : -1) * r.range(5, d / 2 - 3);
        box("cyl", x, 0, z, 0.35, 2.2, 0.35, W.trunk);
        box("crown", x, 1.6, z, 4, 3.6, 4, r.pick(W.trees));
      }
      for (let i = 0; i < 4; i++) box("box", (i % 2 ? 1 : -1) * 3, 0, (i < 2 ? 1 : -1) * 4.5, 1.6, 0.5, 0.5, "#6b4a2f");
      break;
    }
  }
  return P;
}
