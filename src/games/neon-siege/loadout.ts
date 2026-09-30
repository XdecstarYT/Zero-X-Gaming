import { DEFAULT_OUTFIT, DEFAULT_WRAP, OUTFITS, WRAPS } from "./cosmetics";

/**
 * The equipped cosmetics, as last saved by the Locker. The Locker keeps this
 * in sync with the player's account; the game only reads it.
 */
export const LOADOUT_KEY = "zx-siege-loadout";

export interface Loadout {
  outfit: string;
  wrap: string;
}

export function readLoadout(): Loadout {
  try {
    const raw = JSON.parse(localStorage.getItem(LOADOUT_KEY) ?? "{}") as Partial<Loadout>;
    return {
      outfit: raw.outfit && OUTFITS[raw.outfit] ? raw.outfit : DEFAULT_OUTFIT,
      wrap: raw.wrap && WRAPS[raw.wrap] ? raw.wrap : DEFAULT_WRAP,
    };
  } catch {
    return { outfit: DEFAULT_OUTFIT, wrap: DEFAULT_WRAP };
  }
}

export function writeLoadout(l: Loadout) {
  try {
    localStorage.setItem(LOADOUT_KEY, JSON.stringify(l));
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

export type Graphics = "high" | "low" | "2d";
const GFX_KEY = "zx-siege-gfx";

export function readGraphics(coarse: boolean): Graphics {
  try {
    const v = localStorage.getItem(GFX_KEY);
    if (v === "high" || v === "low" || v === "2d") return v;
  } catch {
    // ignore
  }
  return coarse ? "low" : "high";
}

export function writeGraphics(g: Graphics) {
  try {
    localStorage.setItem(GFX_KEY, g);
  } catch {
    // ignore
  }
}
