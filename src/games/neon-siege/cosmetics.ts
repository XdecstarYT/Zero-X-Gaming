import type { Rarity } from "./items";

/**
 * Cosmetic catalogue: outfits (character looks) and weapon wraps. Purely
 * visual, never affects gameplay. All designs are original to Zero X.
 */

export type Headgear = "none" | "cap" | "helmet" | "beanie" | "hood" | "visor";

export interface Outfit {
  id: string;
  name: string;
  rarity: Rarity;
  skin: string;
  top: string;
  bottom: string;
  /** Vest / trim / gloves. */
  accent: string;
  boots: string;
  headgear: Headgear;
  headColor: string;
  /** Emissive detail (visor, stripes), or null. */
  glow: string | null;
}

export const OUTFITS: Record<string, Outfit> = {
  recruit: {
    id: "recruit",
    name: "Recruit",
    rarity: "common",
    skin: "#c68d6a",
    top: "#6b7350",
    bottom: "#3d4a63",
    accent: "#4a4032",
    boots: "#2b2622",
    headgear: "none",
    headColor: "#2e2219",
    glow: null,
  },
  ranger: {
    id: "ranger",
    name: "Ranger",
    rarity: "common",
    skin: "#8d5a3b",
    top: "#4d5a36",
    bottom: "#5b5a3c",
    accent: "#2f3526",
    boots: "#29231c",
    headgear: "cap",
    headColor: "#3a4429",
    glow: null,
  },
  urban: {
    id: "urban",
    name: "Urban Ops",
    rarity: "uncommon",
    skin: "#e0b08f",
    top: "#50555c",
    bottom: "#2e3238",
    accent: "#1d2024",
    boots: "#16181b",
    headgear: "helmet",
    headColor: "#3c4046",
    glow: null,
  },
  desert: {
    id: "desert",
    name: "Dune Runner",
    rarity: "uncommon",
    skin: "#b07a55",
    top: "#b89a6a",
    bottom: "#8f7550",
    accent: "#6b5638",
    boots: "#4a3a28",
    headgear: "hood",
    headColor: "#a88a5c",
    glow: null,
  },
  arctic: {
    id: "arctic",
    name: "Whiteout",
    rarity: "rare",
    skin: "#f0c9a8",
    top: "#dfe5ea",
    bottom: "#b9c3cc",
    accent: "#7d8b99",
    boots: "#4b5560",
    headgear: "beanie",
    headColor: "#eef2f5",
    glow: null,
  },
  crimson: {
    id: "crimson",
    name: "Crimson Ace",
    rarity: "rare",
    skin: "#d49b77",
    top: "#8e1f25",
    bottom: "#2a2a30",
    accent: "#e0e0e0",
    boots: "#1a1a1d",
    headgear: "cap",
    headColor: "#8e1f25",
    glow: null,
  },
  midnight: {
    id: "midnight",
    name: "Midnight",
    rarity: "epic",
    skin: "#6e4a36",
    top: "#1c1d2b",
    bottom: "#15161f",
    accent: "#3b2d5c",
    boots: "#0e0e14",
    headgear: "visor",
    headColor: "#1c1d2b",
    glow: "#8a6bff",
  },
  jungle: {
    id: "jungle",
    name: "Canopy",
    rarity: "uncommon",
    skin: "#a36f4c",
    top: "#3f6b39",
    bottom: "#4f4a33",
    accent: "#27401f",
    boots: "#2b2418",
    headgear: "beanie",
    headColor: "#2d4a28",
    glow: null,
  },
  // Battle pass exclusives (Season 1: Ground Zero)
  nomad: {
    id: "nomad",
    name: "Nomad",
    rarity: "uncommon",
    skin: "#9c6848",
    top: "#7a5a3a",
    bottom: "#4d3f30",
    accent: "#c2a06a",
    boots: "#2e2418",
    headgear: "hood",
    headColor: "#6b4f33",
    glow: null,
  },
  ember: {
    id: "ember",
    name: "Ember",
    rarity: "rare",
    skin: "#d1a07c",
    top: "#c4561d",
    bottom: "#2f2b28",
    accent: "#f2c230",
    boots: "#1e1a17",
    headgear: "helmet",
    headColor: "#d9d2c3",
    glow: "#ff9a3c",
  },
  tidal: {
    id: "tidal",
    name: "Tidebreaker",
    rarity: "epic",
    skin: "#e2b894",
    top: "#1f5f7a",
    bottom: "#173246",
    accent: "#7fd6e8",
    boots: "#10202b",
    headgear: "visor",
    headColor: "#173246",
    glow: "#4fe0ff",
  },
  cipher: {
    id: "cipher",
    name: "Cipher",
    rarity: "epic",
    skin: "#8a5a3e",
    top: "#262a2e",
    bottom: "#1b1e21",
    accent: "#39d98a",
    boots: "#101214",
    headgear: "hood",
    headColor: "#202326",
    glow: "#39d98a",
  },
  vanguard: {
    id: "vanguard",
    name: "Vanguard Prime",
    rarity: "legendary",
    skin: "#c58f69",
    top: "#23211d",
    bottom: "#1a1916",
    accent: "#d4a637",
    boots: "#12110f",
    headgear: "helmet",
    headColor: "#d4a637",
    glow: "#ffcf5a",
  },
  // Item Shop · DROP 1
  apex: {
    id: "apex",
    name: "Apex Predator",
    rarity: "legendary",
    skin: "#b98563",
    top: "#1b1d22",
    bottom: "#141518",
    accent: "#c8102e",
    boots: "#0d0d0f",
    headgear: "visor",
    headColor: "#1b1d22",
    glow: "#ff3b3b",
  },
  sunset: {
    id: "sunset",
    name: "Sunset Rider",
    rarity: "epic",
    skin: "#d8a47f",
    top: "#e0703a",
    bottom: "#3b2f4a",
    accent: "#f6c453",
    boots: "#2a1f1a",
    headgear: "cap",
    headColor: "#7a3fa0",
    glow: null,
  },
  frostbite: {
    id: "frostbite",
    name: "Frostbite",
    rarity: "rare",
    skin: "#f1cdb0",
    top: "#9fd3ea",
    bottom: "#e9f1f6",
    accent: "#3d6f8f",
    boots: "#2c3e4f",
    headgear: "beanie",
    headColor: "#3d6f8f",
    glow: null,
  },
  dropzone: {
    id: "dropzone",
    name: "Drop Zone",
    rarity: "epic",
    skin: "#8f5d40",
    top: "#2f3a2c",
    bottom: "#23291f",
    accent: "#ff7a1a",
    boots: "#141612",
    headgear: "helmet",
    headColor: "#2f3a2c",
    glow: "#ff7a1a",
  },
};

export interface Wrap {
  id: string;
  name: string;
  rarity: Rarity;
  /** Base and secondary colours of the gun body; pattern draws with the second. */
  base: string;
  alt: string;
  pattern: "solid" | "stripes" | "camo" | "hex" | "flat";
  metal: number;
}

export const WRAPS: Record<string, Wrap> = {
  factory: { id: "factory", name: "Factory Finish", rarity: "common", base: "#2b2d30", alt: "#3b3e42", pattern: "flat", metal: 0.6 },
  woodland: { id: "woodland", name: "Woodland", rarity: "uncommon", base: "#4a5234", alt: "#2d321f", pattern: "camo", metal: 0.3 },
  sandstorm: { id: "sandstorm", name: "Sandstorm", rarity: "uncommon", base: "#b39a6d", alt: "#8c754c", pattern: "camo", metal: 0.3 },
  carbon: { id: "carbon", name: "Carbon Weave", rarity: "rare", base: "#1b1c1e", alt: "#2e3034", pattern: "hex", metal: 0.4 },
  tiger: { id: "tiger", name: "Tiger Stripe", rarity: "rare", base: "#d8741e", alt: "#1a1410", pattern: "stripes", metal: 0.35 },
  glacier: { id: "glacier", name: "Glacier", rarity: "epic", base: "#bfe3f0", alt: "#5aa8c8", pattern: "camo", metal: 0.5 },
  retro: { id: "retro", name: "Neon Retro", rarity: "epic", base: "#1a1238", alt: "#ff2bd6", pattern: "stripes", metal: 0.5 },
  gilded: { id: "gilded", name: "Gilded", rarity: "legendary", base: "#caa13a", alt: "#8a6a1c", pattern: "solid", metal: 1 },
  // Item Shop · DROP 1
  molten: { id: "molten", name: "Molten", rarity: "epic", base: "#1a0e0a", alt: "#ff5a1f", pattern: "camo", metal: 0.5 },
  aurora: { id: "aurora", name: "Aurora", rarity: "rare", base: "#123a4a", alt: "#5cffc8", pattern: "stripes", metal: 0.5 },
  chrome: { id: "chrome", name: "Liquid Chrome", rarity: "legendary", base: "#dfe4ea", alt: "#8f9aa6", pattern: "solid", metal: 1 },
};

export const DEFAULT_OUTFIT = "recruit";
export const DEFAULT_WRAP = "factory";

export function outfitOf(id: string | undefined): Outfit {
  return (id && OUTFITS[id]) || OUTFITS[DEFAULT_OUTFIT];
}

export function wrapOf(id: string | undefined): Wrap {
  return (id && WRAPS[id]) || WRAPS[DEFAULT_WRAP];
}
