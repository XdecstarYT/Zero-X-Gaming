/**
 * What colour each county is on the map, for the current map mode or the election count:
 * r, g, b (sRGB) and how strongly to paint it over the land (0 leaves the land as it is).
 */
import { PAL } from "../render/world3d";
import * as G from "../sim";

export type MapMode = "politics" | "states" | "support" | "terrain" | "margin" | "second" | "targets";

const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
/** Soft, distinct tints for the states (identity only; no order implied). */
export const STATE_TINTS = ["#e8836f", "#6f9fe8", "#7fcf8a", "#e8c26f", "#b28be8", "#6fd1c8", "#e88fbf", "#c8c46f", "#8fa8e0", "#e0a27a", "#a6d07a", "#9a8fe8", "#e8a08f", "#7fd0a8", "#d09ae8", "#d8d07a"];
const COUNTED = [52, 199, 89];

/** Blue to orange: a ramp people with red-green colour blindness can read. */
const CB_LOW = [33, 102, 172];
const CB_HIGH = [230, 120, 20];
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

export function countyColors(s: G.GameState, mode: MapMode, count: number | null, cb = false): Uint8Array {
  const c = G.country(s);
  const n = c.sections.length;
  const out = new Uint8Array(PAL * 4);
  const set = (id: number, col: number[], a: number) => {
    out[id * 4] = col[0];
    out[id * 4 + 1] = col[1];
    out[id * 4 + 2] = col[2];
    out[id * 4 + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
  };
  const P = G.partyDefs(s).length;
  const pal = G.partyDefs(s).map((p) => rgb(p.color));
  const e = s.election;
  if (e && count !== null) {
    // First the counties report in (green), then the results come up in the same order.
    const greenUpTo = Math.floor(Math.min(1, count / 0.45) * n);
    const colourUpTo = Math.floor(Math.max(0, (count - 0.45) / 0.55) * n);
    for (let k = 0; k < greenUpTo; k++) set(e.order[k], COUNTED, 0.72);
    for (let k = 0; k < colourUpTo; k++) {
      const id = e.order[k];
      let w = 0;
      for (let i = 1; i < P; i++) if (e.shares[id * P + i] > e.shares[id * P + w]) w = i;
      let second = 0;
      for (let i = 0; i < P; i++) if (i !== w && e.shares[id * P + i] > second) second = e.shares[id * P + i];
      set(id, pal[w], Math.min(0.95, 0.5 + (e.shares[id * P + w] - second) * 2));
    }
    return out;
  }
  if (mode === "terrain") return out;
  if (mode === "states") {
    for (const sec of c.sections) set(sec.id, rgb(STATE_TINTS[sec.state % STATE_TINTS.length]), 0.55);
    return out;
  }
  if (mode === "support") {
    const me = G.pidx(s, s.party);
    const col = pal[me].every((v) => v > 230) ? [40, 40, 48] : pal[me];
    for (const sec of c.sections) {
      const v = G.sharesIn(s, sec.id)[me];
      if (cb) set(sec.id, mix(CB_LOW, CB_HIGH, Math.min(1, v * 2)), 0.85);
      else set(sec.id, col, Math.min(0.95, v * 2.4));
    }
    return out;
  }
  if (mode === "margin") {
    // Bright where the race is close; faint where it's a safe seat.
    for (const sec of c.sections) {
      const sh = [...G.sharesIn(s, sec.id)].sort((a, b) => b - a);
      const m = (sh[0] ?? 0) - (sh[1] ?? 0);
      const close = Math.max(0, 1 - m / 0.25);
      set(sec.id, cb ? mix(CB_LOW, CB_HIGH, close) : mix([70, 90, 120], [255, 214, 10], close), 0.25 + close * 0.65);
    }
    return out;
  }
  if (mode === "second") {
    for (const sec of c.sections) {
      const sh = G.sharesIn(s, sec.id);
      let w = 0;
      for (let i = 1; i < P; i++) if (sh[i] > sh[w]) w = i;
      let sIdx = w === 0 ? 1 : 0;
      for (let i = 0; i < P; i++) if (i !== w && sh[i] > sh[sIdx]) sIdx = i;
      set(sec.id, pal[sIdx] ?? [128, 128, 128], Math.min(0.85, 0.3 + (sh[sIdx] ?? 0) * 1.6));
    }
    return out;
  }
  if (mode === "targets") {
    const me = G.pidx(s, s.party);
    const targets = new Set(s.gr?.targets ?? []);
    for (const sec of c.sections) {
      const t = targets.has(sec.state);
      const sh = G.sharesIn(s, sec.id);
      let best = 0;
      for (let i = 0; i < P; i++) if (i !== me && sh[i] > best) best = sh[i];
      const m = sh[me] - best;
      const hot = Math.abs(m) < 0.06;
      if (t) set(sec.id, cb ? CB_HIGH : [255, 214, 10], 0.75);
      else if (hot) set(sec.id, cb ? CB_LOW : pal[me], 0.55);
      else set(sec.id, [40, 44, 56], 0.35);
    }
    return out;
  }
  for (const sec of c.sections) {
    const sh = G.sharesIn(s, sec.id);
    let w = 0;
    for (let i = 1; i < P; i++) if (sh[i] > sh[w]) w = i;
    let second = 0;
    for (let i = 0; i < P; i++) if (i !== w && sh[i] > second) second = sh[i];
    set(sec.id, pal[w], Math.min(0.92, 0.42 + (sh[w] - second) * 2.2));
  }
  return out;
}
