import * as THREE from "three";
import type { BuildingKind } from "./city";

/**
 * Procedural building facades for Code 3, painted on canvases at startup (no
 * downloads). Each style yields four maps:
 *  - map:    albedo (brick courses, ashlar, siding, curtain walls, grime)
 *  - lit:    the night-lit windows and shop interiors (emissive)
 *  - rm:     ambient occlusion (R), roughness (G) and metalness (B), so glass
 *            mirrors the sky and window reveals sit in shadow
 *  - normal: from a height field (recessed glass, raised sills, mortar joints)
 *
 * Upper floors tile per bay and floor (the geometry fits a whole number of
 * each onto every wall, so windows never get cut at a corner); ground floors
 * are a separate strip: shopfronts, lobbies, loading doors.
 */

export interface FacadeSet {
  map: THREE.Texture;
  lit: THREE.Texture;
  rm: THREE.Texture;
  normal: THREE.Texture;
}

export interface FacadeLayout {
  /** Metres per bay / per floor, and how many of each one texture tile holds. */
  bayW: number;
  floorH: number;
  bays: number;
  floors: number;
}

/** Upper-floor tiles by kind. */
export const UPPER: Record<Exclude<BuildingKind, "parked">, FacadeLayout> = {
  tower: { bayW: 4, floorH: 3.6, bays: 4, floors: 4 },
  office: { bayW: 4, floorH: 3.4, bays: 4, floors: 4 },
  house: { bayW: 3.6, floorH: 2.75, bays: 3, floors: 2 },
  store: { bayW: 4, floorH: 3.4, bays: 4, floors: 4 },
  warehouse: { bayW: 4, floorH: 4, bays: 4, floors: 2 },
  station: { bayW: 4, floorH: 3.5, bays: 4, floors: 4 },
  hospital: { bayW: 4, floorH: 3.5, bays: 4, floors: 4 },
};

/** Ground-floor strip height (m) by kind; 0 = no separate ground floor. */
export const GROUND_FLOOR: Record<Exclude<BuildingKind, "parked">, number> = {
  tower: 5,
  office: 4.5,
  store: 5,
  warehouse: 5,
  station: 4,
  hospital: 4.5,
  house: 0,
};
/** Ground-floor strips are 16 m wide (two 8 m shopfronts). */
export const BASE_W = 16;
export const BASE_UNITS = 2;

type Layer = { c?: string; e?: string; r?: number; m?: number; h?: number };

class Painter {
  readonly W: number;
  readonly H: number;
  readonly col: CanvasRenderingContext2D;
  readonly lit: CanvasRenderingContext2D;
  readonly rm: CanvasRenderingContext2D;
  readonly hgt: CanvasRenderingContext2D;
  readonly cv: HTMLCanvasElement[];
  constructor(
    readonly wM: number,
    readonly hM: number,
    readonly P: number,
    readonly rnd: () => number,
  ) {
    this.W = Math.round(wM * P);
    this.H = Math.round(hM * P);
    const mk = () => {
      const c = document.createElement("canvas");
      c.width = this.W;
      c.height = this.H;
      return c;
    };
    this.cv = [mk(), mk(), mk(), mk()];
    [this.col, this.lit, this.rm, this.hgt] = this.cv.map((c) => c.getContext("2d")!);
    this.lit.fillStyle = "#000";
    this.lit.fillRect(0, 0, this.W, this.H);
    this.rm.fillStyle = "rgb(255,230,0)";
    this.rm.fillRect(0, 0, this.W, this.H);
    this.hgt.fillStyle = "#999";
    this.hgt.fillRect(0, 0, this.W, this.H);
  }
  /** Canvas rect for metres (x right, y up from the tile's bottom). */
  px(x: number, y: number, w: number, h: number): [number, number, number, number] {
    return [x * this.P, this.H - (y + h) * this.P, w * this.P, h * this.P];
  }
  rect(x: number, y: number, w: number, h: number, l: Layer) {
    const r = this.px(x, y, w, h);
    if (l.c) {
      this.col.fillStyle = l.c;
      this.col.fillRect(...r);
    }
    if (l.e) {
      this.lit.fillStyle = l.e;
      this.lit.fillRect(...r);
    }
    if (l.r !== undefined || l.m !== undefined) {
      this.rm.fillStyle = `rgb(255,${Math.round((l.r ?? 0.9) * 255)},${Math.round((l.m ?? 0) * 255)})`;
      this.rm.fillRect(...r);
    }
    if (l.h !== undefined) {
      const v = Math.round(l.h * 255);
      this.hgt.fillStyle = `rgb(${v},${v},${v})`;
      this.hgt.fillRect(...r);
    }
  }
  /** Multiply the colour (and optionally the AO channel) over a rect. */
  shade(x: number, y: number, w: number, h: number, k: number, ao = k) {
    const r = this.px(x, y, w, h);
    this.col.globalCompositeOperation = "multiply";
    const v = Math.round(k * 255);
    this.col.fillStyle = `rgb(${v},${v},${v})`;
    this.col.fillRect(...r);
    this.col.globalCompositeOperation = "source-over";
    this.rm.globalCompositeOperation = "multiply";
    this.rm.fillStyle = `rgb(${Math.round(ao * 255)},255,255)`;
    this.rm.fillRect(...r);
    this.rm.globalCompositeOperation = "source-over";
  }
  /** Fine speckle and blotches: weathering over everything painted so far. */
  weather(amount: number) {
    const { col, W, H, rnd } = this;
    for (let k = 0; k < W * H * 0.02 * amount; k++) {
      col.fillStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "255,255,255"},${rnd() * 0.07})`;
      col.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    for (let k = 0; k < 10 * amount; k++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const r = (0.5 + rnd() * 2.5) * this.P;
      const g = col.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(40,34,28,${0.05 + rnd() * 0.05})`);
      g.addColorStop(1, "rgba(40,34,28,0)");
      col.fillStyle = g;
      col.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  /** Rain streaks down from ledges and a grime gradient at the foot of the tile. */
  streaks(n: number, foot = 0) {
    const { col, W, H, rnd, P } = this;
    for (let k = 0; k < n; k++) {
      const x = rnd() * W;
      const y = rnd() * H * 0.8;
      const len = (0.6 + rnd() * 2.4) * P;
      const g = col.createLinearGradient(0, y, 0, y + len);
      g.addColorStop(0, `rgba(30,28,24,${0.08 + rnd() * 0.1})`);
      g.addColorStop(1, "rgba(30,28,24,0)");
      col.fillStyle = g;
      col.fillRect(x, y, 1 + rnd() * P * 0.08, len);
    }
    if (foot > 0) {
      const g = col.createLinearGradient(0, H - foot * P, 0, H);
      g.addColorStop(0, "rgba(35,30,25,0)");
      g.addColorStop(1, "rgba(35,30,25,0.3)");
      col.fillStyle = g;
      col.fillRect(0, H - foot * P, W, foot * P);
    }
  }
  done(normalStrength = 2.5): FacadeSet {
    return {
      map: tex(this.cv[0], true),
      lit: tex(this.cv[1], true),
      rm: tex(this.cv[2], false),
      normal: normalFromHeight(this.cv[3], normalStrength),
    };
  }
}

function tex(c: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function normalFromHeight(src: HTMLCanvasElement, strength: number) {
  const w = src.width;
  const h = src.height;
  const sd = src.getContext("2d")!.getImageData(0, 0, w, h).data;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
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
  let r = (seed * 9301 + 49297) % 233280;
  return () => (r = (r * 9301 + 49297) % 233280) / 233280;
}

function jitter(hex: string, k: number, rnd: () => number) {
  const c = new THREE.Color(hex);
  const f = 1 + (rnd() - 0.5) * 2 * k;
  c.r = Math.min(1, c.r * f);
  c.g = Math.min(1, c.g * f);
  c.b = Math.min(1, c.b * f);
  return `#${c.getHexString()}`;
}

// ------------------------------------------------------------------ walls

function wallPlain(p: Painter, color: string, rough = 0.9) {
  p.rect(0, 0, p.wM, p.hM, { c: color, r: rough, m: 0, h: 0.6 });
}

function wallBrick(p: Painter, color: string, mortar: string) {
  wallPlain(p, mortar, 0.95);
  const course = 0.1;
  const len = 0.3;
  for (let y = 0, row = 0; y < p.hM; y += course, row++) {
    const off = row % 2 ? len / 2 : 0;
    for (let x = -off; x < p.wM; x += len) p.rect(x + 0.012, y + 0.012, len - 0.012, course - 0.012, { c: jitter(color, 0.13, p.rnd), h: 0.66 });
  }
}

function wallAshlar(p: Painter, color: string) {
  wallPlain(p, jitter(color, 0.05, p.rnd), 0.85);
  const bh = 0.45;
  for (let y = 0, row = 0; y < p.hM; y += bh, row++) {
    const bw = 0.9;
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -off; x < p.wM; x += bw) p.rect(x + 0.02, y + 0.02, bw - 0.02, bh - 0.02, { c: jitter(color, 0.05, p.rnd), h: 0.64 });
  }
}

function wallPanels(p: Painter, color: string, pw: number, ph: number, rough = 0.8) {
  wallPlain(p, color, rough);
  for (let y = 0; y < p.hM; y += ph) p.rect(0, y, p.wM, 0.03, { c: "rgba(0,0,0,0.3)", h: 0.4 });
  for (let x = 0; x < p.wM; x += pw) p.rect(x, 0, 0.03, p.hM, { c: "rgba(0,0,0,0.3)", h: 0.4 });
}

function wallSiding(p: Painter, color: string) {
  wallPlain(p, color, 0.7);
  const board = 0.2;
  for (let y = 0; y < p.hM; y += board) {
    // Each clapboard: shadow line at its lower lip, a lighter face above.
    p.rect(0, y, p.wM, 0.035, { c: "rgba(0,0,0,0.28)", h: 0.35 });
    p.rect(0, y + 0.035, p.wM, board * 0.5, { h: 0.55 });
    p.rect(0, y + 0.035 + board * 0.5, p.wM, board * 0.46, { h: 0.7 });
  }
}

function wallCorrugated(p: Painter, color: string) {
  p.rect(0, 0, p.wM, p.hM, { c: color, r: 0.55, m: 0.55, h: 0.5 });
  const rib = 0.16;
  for (let x = 0; x < p.wM; x += rib) {
    p.rect(x, 0, rib * 0.35, p.hM, { c: "rgba(255,255,255,0.07)", h: 0.75 });
    p.rect(x + rib * 0.55, 0, rib * 0.3, p.hM, { c: "rgba(0,0,0,0.12)", h: 0.3 });
  }
  // Rust runs.
  for (let k = 0; k < 12; k++) {
    const x = p.rnd() * p.wM;
    const [cx, cy, , ch] = p.px(x, 0, 0.1, p.hM * (0.3 + p.rnd() * 0.6));
    const g = p.col.createLinearGradient(0, cy + ch, 0, cy);
    g.addColorStop(0, "rgba(120,60,30,0.25)");
    g.addColorStop(1, "rgba(120,60,30,0)");
    p.col.fillStyle = g;
    p.col.fillRect(cx, cy, p.P * (0.1 + p.rnd() * 0.3), ch);
  }
}

// ---------------------------------------------------------------- windows

interface WinOpts {
  frame: string;
  frameW?: number;
  glass: string;
  /** Glass metalness: punched windows ~0.35, curtain wall ~0.9. */
  metal?: number;
  mullions?: number;
  transom?: boolean;
  sill?: string;
  lintel?: string;
  shutters?: string;
  /** Chance the room is lit at night. */
  litChance?: number;
  /** Curtains / blinds variety (0 = bare glass). */
  dressing?: number;
  recess?: number;
}

const WARM = ["#ffcf8a", "#ffc070", "#ffd9a6", "#ffe4b8"];
const COOL = ["#d4e6ff", "#bcd6ff"];
const CURTAINS = ["#d8cfc0", "#b9a58a", "#8f9aa6", "#c9c2b6", "#7d5a4a", "#e6e1d6"];

function glassGradient(p: Painter, r: [number, number, number, number], glass: string) {
  // A dim sky reflection toward the top of the pane; the env map adds the real one.
  const g = p.col.createLinearGradient(0, r[1], 0, r[1] + r[3]);
  const top = new THREE.Color(glass).lerp(new THREE.Color("#8aa3b8"), 0.25);
  g.addColorStop(0, `#${top.getHexString()}`);
  g.addColorStop(0.55, glass);
  g.addColorStop(1, `#${new THREE.Color(glass).multiplyScalar(0.7).getHexString()}`);
  p.col.fillStyle = g;
  p.col.fillRect(...r);
}

function window_(p: Painter, x: number, y: number, w: number, h: number, o: WinOpts) {
  const fw = o.frameW ?? 0.07;
  const recess = o.recess ?? 0.12;
  // Reveal (the wall's return into the opening) and the sill / lintel.
  if (o.lintel) p.rect(x - 0.1, y + h, w + 0.2, 0.18, { c: o.lintel, r: 0.8, h: 0.8 });
  if (o.sill) p.rect(x - 0.08, y - 0.1, w + 0.16, 0.1, { c: o.sill, r: 0.75, h: 0.85 });
  p.rect(x, y, w, h, { c: o.frame, r: 0.5, m: 0.1, h: 0.45 });
  const gx = x + fw;
  const gy = y + fw;
  const gw = w - fw * 2;
  const gh = h - fw * 2;
  const r = p.px(gx, gy, gw, gh);
  glassGradient(p, r, o.glass);
  p.rect(gx, gy, gw, gh, { r: 0.04, m: o.metal ?? 0.35, h: 0.15 });
  // Interior dressing: curtains at the sides or blinds part-way down.
  const d = p.rnd();
  let litTop = gh;
  let litL = 0;
  let litR = 0;
  if ((o.dressing ?? 0.6) > 0 && d < (o.dressing ?? 0.6)) {
    const cur = CURTAINS[Math.floor(p.rnd() * CURTAINS.length)];
    if (d < (o.dressing ?? 0.6) * 0.5) {
      const cw = gw * (0.18 + p.rnd() * 0.2);
      p.rect(gx, gy, cw, gh, { c: cur, r: 0.95, m: 0, h: 0.2 });
      p.rect(gx + gw - cw, gy, cw, gh, { c: cur, r: 0.95, m: 0, h: 0.2 });
      for (let k = 0; k < 6; k++) {
        p.rect(gx + (cw / 6) * k, gy, 0.02, gh, { c: "rgba(0,0,0,0.12)" });
        p.rect(gx + gw - (cw / 6) * k, gy, 0.02, gh, { c: "rgba(0,0,0,0.12)" });
      }
      litL = cw;
      litR = cw;
    } else {
      const down = gh * (0.2 + p.rnd() * 0.75);
      p.rect(gx, gy + gh - down, gw, down, { c: "#d9d6cf", r: 0.8, m: 0, h: 0.2 });
      for (let s = 0; s < down; s += 0.06) p.rect(gx, gy + gh - s - 0.015, gw, 0.015, { c: "rgba(0,0,0,0.12)" });
      litTop = gh - down;
    }
  }
  // Mullions and a transom.
  const mul = o.mullions ?? (w > 1.3 ? 1 : 0);
  for (let k = 1; k <= mul; k++) p.rect(gx + (gw * k) / (mul + 1) - 0.025, gy, 0.05, gh, { c: o.frame, r: 0.5, m: 0.1, h: 0.45 });
  if (o.transom) p.rect(gx, gy + gh * 0.72, gw, 0.05, { c: o.frame, r: 0.5, m: 0.1, h: 0.45 });
  // The reveal throws a shadow onto the glass: darker along the top and one side.
  p.shade(gx, gy + gh - recess, gw, recess, 0.72, 0.55);
  p.shade(gx, gy, recess * 0.6, gh, 0.82, 0.7);
  if (o.shutters) {
    const sw = w * 0.42;
    p.rect(x - sw - 0.05, y, sw, h, { c: o.shutters, r: 0.7, m: 0, h: 0.7 });
    p.rect(x + w + 0.05, y, sw, h, { c: o.shutters, r: 0.7, m: 0, h: 0.7 });
    for (let s = 0.05; s < h; s += 0.08) {
      p.rect(x - sw - 0.05, y + s, sw, 0.02, { c: "rgba(0,0,0,0.25)", h: 0.55 });
      p.rect(x + w + 0.05, y + s, sw, 0.02, { c: "rgba(0,0,0,0.25)", h: 0.55 });
    }
  }
  // Lit at night: a warm or cool room, dimmer behind blinds.
  if (p.rnd() < (o.litChance ?? 0.4)) {
    const warm = p.rnd() < 0.75;
    const tone = warm ? WARM[Math.floor(p.rnd() * WARM.length)] : COOL[Math.floor(p.rnd() * COOL.length)];
    const dim = 0.55 + p.rnd() * 0.45;
    p.lit.globalAlpha = dim;
    p.lit.fillStyle = tone;
    p.lit.fillRect(...p.px(gx + litL, gy, gw - litL - litR, litTop));
    if (litTop < gh) {
      p.lit.globalAlpha = dim * 0.25;
      p.lit.fillRect(...p.px(gx, gy + litTop, gw, gh - litTop));
    }
    p.lit.globalAlpha = 1;
  }
}

// ------------------------------------------------------------ upper floors

/** Paint one upper-floor tile for a building kind / style. */
export function upperFacade(kind: Exclude<BuildingKind, "parked">, style: number, P: number, front = false): FacadeSet {
  const L = UPPER[kind];
  const p = new Painter(L.bayW * L.bays, L.floorH * L.floors, P, rng(kind.length * 97 + style * 13 + (front ? 7 : 0)));
  const bays = L.bays;
  const floors = L.floors;
  const each = (fn: (x: number, y: number, b: number, f: number) => void) => {
    for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) fn(b * L.bayW, f * L.floorH, b, f);
  };
  if (kind === "tower") {
    if (style === 0) {
      // Blue-green curtain wall: full-height glass, aluminium mullions, dark spandrels.
      p.rect(0, 0, p.wM, p.hM, { c: "#2c4656", r: 0.04, m: 0.9, h: 0.3 });
      each((x, y) => {
        for (let k = 0; k < 3; k++) {
          const r = p.px(x + (k * L.bayW) / 3, y + 0.9, L.bayW / 3, L.floorH - 0.9);
          glassGradient(p, r, jitter("#2c4656", 0.12, p.rnd));
        }
        p.rect(x, y, L.bayW, 0.9, { c: jitter("#1c2a33", 0.08, p.rnd), r: 0.3, m: 0.6, h: 0.4 });
        for (let k = 0; k <= 3; k++) p.rect(x + (k * L.bayW) / 3 - 0.04, y, 0.08, L.floorH, { c: "#9aa4ad", r: 0.35, m: 0.8, h: 0.7 });
        p.rect(x, y + 0.88, L.bayW, 0.06, { c: "#9aa4ad", r: 0.35, m: 0.8, h: 0.7 });
        if (p.rnd() < 0.38) {
          p.lit.globalAlpha = 0.35 + p.rnd() * 0.4;
          p.lit.fillStyle = p.rnd() < 0.6 ? "#dfe8f8" : "#ffe2b0";
          p.lit.fillRect(...p.px(x, y + 0.9, L.bayW, L.floorH - 0.9));
          p.lit.globalAlpha = 1;
        }
      });
    } else if (style === 1) {
      // Stone piers with tall glass between.
      wallAshlar(p, "#b9b2a4");
      each((x, y) => window_(p, x + 0.55, y + 0.5, L.bayW - 1.1, L.floorH - 0.8, { frame: "#2b2f33", glass: "#1d2a35", metal: 0.7, mullions: 2, transom: true, litChance: 0.4, dressing: 0.2, recess: 0.2 }));
    } else if (style === 2) {
      // White concrete frame grid, recessed windows.
      wallPanels(p, "#d9d7cf", L.bayW, L.floorH, 0.75);
      each((x, y) => window_(p, x + 0.35, y + 0.45, L.bayW - 0.7, L.floorH - 0.85, { frame: "#3a3f45", glass: "#243442", metal: 0.6, mullions: 1, litChance: 0.4, dressing: 0.35, recess: 0.3 }));
    } else {
      // Bronze glass ribbon windows with dark metal spandrels.
      p.rect(0, 0, p.wM, p.hM, { c: "#2a2520", r: 0.25, m: 0.7, h: 0.55 });
      each((x, y) => {
        const r = p.px(x, y + 1.0, L.bayW, L.floorH - 1.2);
        glassGradient(p, r, jitter("#3a2f24", 0.1, p.rnd));
        p.rect(x, y + 1.0, L.bayW, L.floorH - 1.2, { r: 0.03, m: 0.92, h: 0.25 });
        p.rect(x + L.bayW / 2 - 0.03, y + 1.0, 0.06, L.floorH - 1.2, { c: "#1a1714", r: 0.3, m: 0.8, h: 0.5 });
        if (p.rnd() < 0.35) {
          p.lit.globalAlpha = 0.45 + p.rnd() * 0.4;
          p.lit.fillStyle = "#ffd9a0";
          p.lit.fillRect(...p.px(x, y + 1.0, L.bayW, L.floorH - 1.2));
          p.lit.globalAlpha = 1;
        }
      });
    }
    p.streaks(30);
    p.weather(0.4);
    return p.done(2);
  }
  if (kind === "office") {
    if (style === 0) {
      wallBrick(p, "#8a4a36", "#b8ad9c");
      each((x, y) => window_(p, x + 1.1, y + 0.8, 1.8, 2.1, { frame: "#e9e6de", glass: "#1f2a33", sill: "#d4cdbf", lintel: "#cfc6b4", transom: true, litChance: 0.42 }));
    } else if (style === 1) {
      wallAshlar(p, "#cdbfa3");
      each((x, y) => window_(p, x + 0.95, y + 0.7, 2.1, 2.3, { frame: "#2c2f33", glass: "#1b252e", sill: "#e0d6c2", mullions: 1, transom: true, litChance: 0.4, recess: 0.18 }));
      for (let f = 1; f <= floors; f++) p.rect(0, f * L.floorH - 0.12, p.wM, 0.12, { c: "#ddd2bd", h: 0.85 });
    } else if (style === 2) {
      wallPanels(p, "#9d9a92", 2, L.floorH, 0.8);
      each((x, y) => window_(p, x + 0.2, y + 0.95, L.bayW - 0.4, 1.6, { frame: "#55595e", glass: "#202a33", metal: 0.5, mullions: 2, litChance: 0.4, dressing: 0.5 }));
    } else {
      wallPlain(p, "#c9b28f", 0.92);
      each((x, y) => window_(p, x + 1.0, y + 0.75, 2.0, 2.1, { frame: "#3f5a4a", glass: "#1d262c", sill: "#e7dcc6", lintel: "#e7dcc6", mullions: 1, transom: true, litChance: 0.42 }));
    }
    p.streaks(40);
    p.weather(1);
    return p.done();
  }
  if (kind === "house") {
    wallSiding(p, "#f2efe8");
    const shut = ["#2f4a3a", "#1f2d44", "#5a2a24", "#3a3a3a"][style % 4];
    each((x, y, b, f) => {
      if (front && f === 0 && b === 1) {
        // Front door with a fanlight, and a porch lamp.
        p.rect(x + 1.2, y, 1.2, 2.25, { c: "#e8e4da", r: 0.6, h: 0.8 });
        p.rect(x + 1.3, y, 1.0, 2.1, { c: ["#7a2a22", "#1f3552", "#2f4a3a", "#3b2b20"][style % 4], r: 0.45, m: 0.05, h: 0.5 });
        for (const [dx, dy] of [[0.1, 0.2], [0.55, 0.2], [0.1, 1.15], [0.55, 1.15]]) p.rect(x + 1.3 + dx, y + dy, 0.35, 0.8, { c: "rgba(0,0,0,0.18)", h: 0.42 });
        p.rect(x + 2.0, y + 1.05, 0.06, 0.06, { c: "#d9b56a", m: 1, r: 0.3, h: 0.7 });
        p.rect(x + 2.6, y + 1.9, 0.14, 0.24, { c: "#f3e2b0", e: "#ffd28a", h: 0.8 });
        return;
      }
      window_(p, x + 1.05, y + 0.8, 1.5, 1.45, { frame: "#f4f2ec", frameW: 0.08, glass: "#1d252c", sill: "#f4f2ec", shutters: style % 2 === 0 ? shut : undefined, mullions: 1, transom: true, litChance: 0.45, dressing: 0.8 });
    });
    p.weather(0.6);
    p.streaks(8, 0.4);
    return p.done(3);
  }
  if (kind === "warehouse") {
    wallCorrugated(p, style % 2 ? "#a07a55" : "#8d8a80");
    // Clerestory strip of wired glass near the eaves.
    for (let b = 0; b < bays; b++) window_(p, b * L.bayW + 0.3, p.hM - 1.5, L.bayW - 0.6, 0.9, { frame: "#4d5054", glass: "#3a4650", metal: 0.3, mullions: 3, litChance: 0.3, dressing: 0 });
    p.weather(0.8);
    return p.done(2);
  }
  if (kind === "hospital") {
    wallPanels(p, "#eceeef", 2, L.floorH, 0.7);
    each((x, y) => window_(p, x + 0.2, y + 0.9, L.bayW - 0.4, 1.7, { frame: "#b8c2ca", glass: "#3e5f78", metal: 0.65, mullions: 2, litChance: 0.6, dressing: 0.5 }));
    p.streaks(20);
    p.weather(0.4);
    return p.done();
  }
  // station (and a store's upper floors, rarely seen)
  wallPanels(p, kind === "station" ? "#c7c1b3" : "#d8d2c4", 1.33, 0.66, 0.85);
  each((x, y) => window_(p, x + 0.7, y + 0.9, 2.6, 1.6, { frame: "#2a3440", glass: "#1a2533", metal: 0.45, mullions: 1, litChance: 0.55, dressing: 0.5 }));
  p.streaks(25);
  p.weather(0.7);
  return p.done();
}

// ------------------------------------------------------------ ground floor

const SHOPS = ["CAFE", "DELI", "SALON", "BOOKS", "PHARMACY", "PIZZA", "LAUNDRY", "BAR & GRILL", "SHOES", "TAILOR", "FLORIST", "BAKERY", "NOODLES", "PAWN", "PHONES", "DINER", "BARBER", "OPTICIAN"];
const FASCIA = ["#1d3b2a", "#5a1a1a", "#1a2a4a", "#2a2a2a", "#6b4a1a", "#3a1a4a", "#0f4a4a", "#7a2a10"];

function shopfront(p: Painter, x: number, w: number, gf: number, pier: string) {
  const riser = 0.45;
  const fasciaY = gf - 1.05;
  // Piers either side.
  p.rect(x, 0, 0.35, gf, { c: pier, r: 0.8, h: 0.8 });
  p.rect(x + w - 0.35, 0, 0.35, gf, { c: pier, r: 0.8, h: 0.8 });
  // Fascia with the shop's name (lit at night).
  const bg = FASCIA[Math.floor(p.rnd() * FASCIA.length)];
  p.rect(x + 0.35, fasciaY, w - 0.7, 0.8, { c: bg, r: 0.5, m: 0.1, h: 0.75 });
  const name = SHOPS[Math.floor(p.rnd() * SHOPS.length)];
  const [tx, ty, tw, th] = p.px(x + 0.35, fasciaY, w - 0.7, 0.8);
  for (const ctx of [p.col, p.lit]) {
    ctx.fillStyle = ctx === p.lit ? "#fff1d0" : "#f3ead2";
    ctx.font = `bold ${Math.round(th * 0.55)}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, tx + tw / 2, ty + th / 2, tw * 0.9);
  }
  // Stall riser, display window with the interior behind, and a door.
  p.rect(x + 0.35, 0, w - 0.7, riser, { c: "#3b3b3d", r: 0.4, m: 0.1, h: 0.7 });
  const doorLeft = p.rnd() < 0.5;
  const dx = doorLeft ? x + 0.45 : x + w - 1.55;
  const winX = doorLeft ? x + 1.65 : x + 0.45;
  const winW = w - 2.1;
  const top = fasciaY - 0.12;
  p.rect(winX, riser, winW, top - riser, { c: "#222", r: 0.5, m: 0.6, h: 0.5 });
  const gx = winX + 0.06;
  const gy = riser + 0.06;
  const gw = winW - 0.12;
  const gh = top - riser - 0.12;
  // Interior: warm light, shelves and goods.
  const warm = new THREE.Color(["#6a5238", "#4a4035", "#5a4a3a", "#3a3a40"][Math.floor(p.rnd() * 4)]);
  p.rect(gx, gy, gw, gh, { c: `#${warm.getHexString()}`, r: 0.05, m: 0.25, h: 0.12 });
  for (let s = 0; s < 3; s++) {
    const sy = gy + 0.2 + s * (gh / 3.2);
    p.rect(gx + 0.2, sy, gw - 0.4, 0.05, { c: "rgba(20,15,10,0.6)" });
    for (let k = 0; k < 10; k++) {
      const ix = gx + 0.25 + p.rnd() * (gw - 0.6);
      const ih = 0.15 + p.rnd() * 0.35;
      p.rect(ix, sy + 0.05, 0.12 + p.rnd() * 0.25, ih, { c: `hsl(${Math.floor(p.rnd() * 360)},40%,${35 + Math.floor(p.rnd() * 30)}%)` });
    }
  }
  const lit = p.px(gx, gy, gw, gh);
  const g = p.lit.createLinearGradient(0, lit[1], 0, lit[1] + lit[3]);
  g.addColorStop(0, "#ffe2b0");
  g.addColorStop(1, "#b0885a");
  p.lit.globalAlpha = 0.62;
  p.lit.fillStyle = g;
  p.lit.fillRect(...lit);
  p.lit.globalAlpha = 1;
  // Glass sheen over the interior.
  const sheen = p.col.createLinearGradient(lit[0], lit[1], lit[0] + lit[2], lit[1] + lit[3]);
  sheen.addColorStop(0, "rgba(160,190,210,0.25)");
  sheen.addColorStop(0.5, "rgba(160,190,210,0.05)");
  sheen.addColorStop(1, "rgba(160,190,210,0.18)");
  p.col.fillStyle = sheen;
  p.col.fillRect(...lit);
  p.rect(gx + gw / 2 - 0.03, gy, 0.06, gh, { c: "#1a1a1a", r: 0.4, m: 0.7, h: 0.5 });
  p.shade(gx, gy + gh - 0.25, gw, 0.25, 0.7, 0.6);
  // Door: glass with a push bar, a transom above.
  p.rect(dx, 0, 1.1, top, { c: "#1e1e20", r: 0.4, m: 0.7, h: 0.55 });
  p.rect(dx + 0.08, 0.1, 0.94, top - 0.7, { c: "#3a3228", r: 0.05, m: 0.3, h: 0.15 });
  p.lit.globalAlpha = 0.6;
  p.lit.fillStyle = "#ffd8a0";
  p.lit.fillRect(...p.px(dx + 0.08, 0.1, 0.94, top - 0.7));
  p.lit.globalAlpha = 1;
  p.rect(dx + 0.15, 1.0, 0.8, 0.05, { c: "#c9ccd0", m: 1, r: 0.25, h: 0.8 });
}

/** Paint the ground-floor strip (BASE_W wide × the kind's ground-floor height). */
export function baseFacade(kind: Exclude<BuildingKind, "parked">, style: number, P: number): FacadeSet {
  const gf = GROUND_FLOOR[kind] || 4.5;
  const p = new Painter(BASE_W, gf, P, rng(kind.length * 131 + style * 17 + 5));
  const unit = BASE_W / BASE_UNITS;
  if (kind === "office" || kind === "store") {
    const pier = kind === "store" ? "#8a4a36" : ["#6e4a3a", "#cdbfa3", "#8d8a82", "#b8a488"][style % 4];
    wallPlain(p, pier, 0.85);
    for (let u = 0; u < BASE_UNITS; u++) shopfront(p, u * unit, unit, kind === "store" ? gf - 0.5 : gf, pier);
    if (kind === "store") p.rect(0, gf - 0.5, p.wM, 0.5, { c: "#d8d2c4", r: 0.8, h: 0.8 });
    p.weather(0.8);
    p.streaks(10, 0.5);
    return p.done();
  }
  if (kind === "tower") {
    // Double-height lobby: big glass, stone cladding, a revolving door per 16 m.
    wallAshlar(p, style === 3 ? "#3a3632" : "#b6b0a4");
    const top = gf - 0.6;
    for (let u = 0; u < BASE_UNITS; u++) {
      const x = u * unit;
      p.rect(x + 0.6, 0.15, unit - 1.2, top - 0.15, { c: "#2a2d30", r: 0.3, m: 0.8, h: 0.5 });
      const r = p.px(x + 0.7, 0.2, unit - 1.4, top - 0.3);
      glassGradient(p, r, "#2c3a44");
      p.rect(x + 0.7, 0.2, unit - 1.4, top - 0.3, { r: 0.04, m: 0.55, h: 0.15 });
      // Lobby: bright ceiling line, reception silhouette.
      p.lit.globalAlpha = 0.9;
      p.lit.fillStyle = "#fff0d8";
      p.lit.fillRect(...p.px(x + 0.7, top - 0.5, unit - 1.4, 0.25));
      p.lit.globalAlpha = 0.45;
      p.lit.fillRect(...p.px(x + 0.7, 0.2, unit - 1.4, top - 0.8));
      p.lit.globalAlpha = 1;
      p.rect(x + unit / 2 - 1.5, 0.2, 3, 1.1, { c: "rgba(60,50,40,0.6)" });
      for (let k = 1; k < 4; k++) p.rect(x + 0.7 + ((unit - 1.4) * k) / 4 - 0.05, 0.2, 0.1, top - 0.3, { c: "#26292c", r: 0.3, m: 0.8, h: 0.5 });
      // Revolving door drum.
      p.rect(x + unit / 2 - 1.1, 0.2, 2.2, 2.6, { c: "#3a3f44", r: 0.2, m: 0.9, h: 0.6 });
      p.rect(x + unit / 2 - 1.0, 0.25, 2.0, 2.4, { c: "#4a5560", r: 0.05, m: 0.6, h: 0.3 });
      p.rect(x + unit / 2 - 0.04, 0.25, 0.08, 2.4, { c: "#c9ccd0", m: 1, r: 0.2, h: 0.7 });
    }
    p.weather(0.4);
    return p.done();
  }
  if (kind === "warehouse") {
    wallCorrugated(p, style % 2 ? "#a07a55" : "#8d8a80");
    p.rect(0, 0, p.wM, 0.6, { c: "#8c8a84", r: 0.9, m: 0, h: 0.8 });
    for (let u = 0; u < BASE_UNITS; u++) {
      const x = u * unit;
      // Roller door with its guide rails, hazard-striped bollards, a steel door.
      p.rect(x + 1, 0, 4, 4.3, { c: "#6e7175", r: 0.5, m: 0.6, h: 0.55 });
      for (let s = 0; s < 4.1; s += 0.12) p.rect(x + 1.1, s, 3.8, 0.04, { c: "rgba(0,0,0,0.25)", h: 0.35 });
      p.rect(x + 0.9, 0, 0.1, 4.4, { c: "#3a3c3f", m: 0.8, r: 0.4, h: 0.8 });
      p.rect(x + 5, 0, 0.1, 4.4, { c: "#3a3c3f", m: 0.8, r: 0.4, h: 0.8 });
      for (const bx of [x + 0.55, x + 5.3])
        for (let s = 0; s < 1.1; s += 0.2) p.rect(bx, s, 0.25, 0.1, { c: (s / 0.2) % 2 < 1 ? "#e5b800" : "#1a1a1a", r: 0.6, h: 0.9 });
      p.rect(x + 6.2, 0, 1.0, 2.1, { c: "#4d5a66", r: 0.5, m: 0.5, h: 0.5 });
      p.rect(x + 6.3, 2.2, 0.8, 0.25, { c: "#f0f0e8", e: "#fff4d0", h: 0.8 });
    }
    p.weather(1);
    return p.done(2);
  }
  // station / hospital: glazed entrance, panels, a canopy band.
  const panel = kind === "hospital" ? "#e6e9eb" : "#bdb7a9";
  wallPanels(p, panel, 1.33, 0.66, 0.8);
  for (let u = 0; u < BASE_UNITS; u++) {
    const x = u * unit;
    window_(p, x + 0.6, 0.3, unit - 1.2, gf - 1.2, {
      frame: kind === "hospital" ? "#8a98a4" : "#1f2a36",
      glass: kind === "hospital" ? "#3a566a" : "#1a2533",
      metal: 0.5,
      mullions: 3,
      transom: true,
      litChance: 0.9,
      dressing: 0,
    });
    p.rect(x, gf - 0.6, unit, 0.6, { c: kind === "hospital" ? "#1d5fa0" : "#12305e", r: 0.5, m: 0.2, h: 0.85 });
  }
  p.weather(0.5);
  return p.done();
}

/** Asphalt shingles (neutral grey; tinted per house through vertex colours). 4 m tile. */
export function shingleTexture(P: number) {
  const p = new Painter(4, 4, P, rng(77));
  wallPlain(p, "#8a8a88", 0.9);
  const row = 0.2;
  for (let y = 0, r = 0; y < 4; y += row, r++) {
    const off = r % 2 ? 0.17 : 0;
    for (let x = -off; x < 4; x += 0.34) {
      p.rect(x + 0.01, y, 0.32, row - 0.02, { c: jitter("#8a8a88", 0.18, p.rnd), h: 0.55 });
      p.rect(x + 0.01, y, 0.32, 0.03, { c: "rgba(0,0,0,0.35)", h: 0.3 });
    }
  }
  p.weather(1.5);
  return p.done(3);
}
