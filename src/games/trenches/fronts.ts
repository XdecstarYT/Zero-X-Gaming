import type { FrontTheme } from "../neon-siege/map";

/**
 * The fronts. Seven large (150–190 m) mirrored battlefields for Classic and
 * Breakthrough, each with its own layout feature and look, plus Cape Helles:
 * a 280 m landing corridor built for Frontline. Distances are metres (1 cell = 1 m).
 */

export type FrontId = "gallipoli" | "somme" | "verdun" | "passchendaele" | "vimy" | "argonne" | "helles" | "belleau";

export interface FrontDef {
  id: FrontId;
  name: string;
  /** Where / when, e.g. "Anzac Cove, 1915". */
  place: string;
  blurb: string;
  width: number;
  height: number;
  /** Front-line trench x (west side), as a fraction of the half-width. */
  frontLine: number;
  theme: FrontTheme;
  /** Only used by Frontline (not mirrored, so not in the Classic / Breakthrough picker). */
  frontlineOnly?: boolean;
}

export const FRONTS: Record<FrontId, FrontDef> = {
  gallipoli: {
    id: "gallipoli",
    name: "Gallipoli",
    place: "Anzac Cove, 1915",
    blurb: "Sun-baked scrub and gullies above the beach. The lines are close enough to throw a grenade: fight for Lone Pine.",
    width: 150,
    height: 110,
    frontLine: 0.78,
    theme: {
      id: "gallipoli",
      soil: "#c7ae80",
      soil2: "#a29363",
      earth: "#a48a62",
      sky: { turbidity: 6, rayleigh: 1.3, mie: 0.008, elevation: 38, azimuth: 110 },
      sun: { color: "#fff0d0", intensity: 2.9 },
      hemi: { sky: "#cfe0f5", ground: "#8a7a58", intensity: 0.8 },
      fog: { color: "#d8d2c0", near: 30, far: 170 },
      exposure: 0.6,
      clouds: "#ffffff",
      weather: "dust",
      sea: "west",
      grass: 1.2,
      grassColor: "#9a9458",
    },
  },
  somme: {
    id: "somme",
    name: "The Somme",
    place: "Picardy, 1916",
    blurb: "Chalk and mud churned by a week of shelling. A ruined village and the great mine crater hold the centre.",
    width: 180,
    height: 100,
    frontLine: 0.42,
    theme: {
      id: "somme",
      soil: "#8c8270",
      soil2: "#a7a08c",
      earth: "#6e604e",
      sky: { turbidity: 18, rayleigh: 0.22, mie: 0.03, elevation: 14, azimuth: 230 },
      sun: { color: "#ffd6a0", intensity: 1.6 },
      hemi: { sky: "#b8b4a8", ground: "#4a4034", intensity: 0.9 },
      fog: { color: "#a19b8e", near: 16, far: 120 },
      exposure: 0.72,
      clouds: "#9a958c",
      weather: "none",
      grass: 0.6,
      grassColor: "#8f8a5a",
    },
  },
  verdun: {
    id: "verdun",
    name: "Verdun",
    place: "Fort Douaumont, 1916",
    blurb: "A shattered forest in the fog around a concrete fortress. Take the fort, hold the ridge.",
    width: 160,
    height: 110,
    frontLine: 0.38,
    theme: {
      id: "verdun",
      soil: "#6f5e4b",
      soil2: "#5a4c3c",
      earth: "#5b4a38",
      sky: { turbidity: 18, rayleigh: 0.25, mie: 0.035, elevation: 8, azimuth: 200 },
      sun: { color: "#ffb070", intensity: 1.3 },
      hemi: { sky: "#a9a49a", ground: "#3d3328", intensity: 0.85 },
      fog: { color: "#8e887e", near: 8, far: 85 },
      exposure: 0.7,
      clouds: "#85817a",
      weather: "none",
      grass: 0.3,
      grassColor: "#7b7248",
    },
  },
  passchendaele: {
    id: "passchendaele",
    name: "Passchendaele",
    place: "Flanders, 1917",
    blurb: "Rain and bottomless mud. Flooded shell holes, duckboard tracks and concrete pillboxes around the ruined church.",
    width: 170,
    height: 100,
    frontLine: 0.4,
    theme: {
      id: "passchendaele",
      soil: "#5d5242",
      soil2: "#6b604c",
      earth: "#4e4232",
      sky: { turbidity: 20, rayleigh: 0.12, mie: 0.04, elevation: 20, azimuth: 180 },
      sun: { color: "#dfe3ea", intensity: 1.0 },
      hemi: { sky: "#9aa0a6", ground: "#3a332a", intensity: 0.95 },
      fog: { color: "#7f848a", near: 10, far: 95 },
      exposure: 0.68,
      clouds: "#6e7277",
      weather: "rain",
      grass: 0.2,
      grassColor: "#6e6a44",
    },
  },
  vimy: {
    id: "vimy",
    name: "Vimy Ridge",
    place: "Artois, 1917",
    blurb: "Snow and sleet over the ridge. A chain of mine craters splits no-man's-land; tunnels lead to the front.",
    width: 190,
    height: 100,
    frontLine: 0.4,
    theme: {
      id: "vimy",
      soil: "#e6eaef",
      soil2: "#cbd2da",
      earth: "#6a5d4d",
      sky: { turbidity: 14, rayleigh: 0.8, mie: 0.02, elevation: 12, azimuth: 140 },
      sun: { color: "#fff1de", intensity: 1.5 },
      hemi: { sky: "#dfe7f2", ground: "#8a8a8a", intensity: 1.0 },
      fog: { color: "#c9d1da", near: 12, far: 105 },
      exposure: 0.6,
      clouds: "#b7bec8",
      weather: "snow",
      grass: 0.3,
      grassColor: "#b9b39a",
    },
  },
  argonne: {
    id: "argonne",
    name: "Argonne Forest",
    place: "Meuse-Argonne, 1918",
    blurb: "Autumn in a dense, foggy forest. Fight through the ravine for the old mill where a battalion was cut off.",
    width: 170,
    height: 110,
    frontLine: 0.4,
    theme: {
      id: "argonne",
      soil: "#5f523d",
      soil2: "#7a5a2e",
      earth: "#4e3f2c",
      sky: { turbidity: 16, rayleigh: 0.4, mie: 0.03, elevation: 10, azimuth: 250 },
      sun: { color: "#ffc890", intensity: 1.25 },
      hemi: { sky: "#a9a08e", ground: "#3e3326", intensity: 0.9 },
      fog: { color: "#8d8676", near: 8, far: 82 },
      exposure: 0.7,
      clouds: "#8a857a",
      weather: "none",
      grass: 0.9,
      grassColor: "#8a7a3a",
    },
  },
  belleau: {
    id: "belleau",
    name: "Belleau Wood",
    place: "Château-Thierry, June 1918",
    blurb: "High summer. Cross a golden wheat field under fire, then fight tree to tree through a boulder-strewn wood for the old hunting lodge.",
    width: 170,
    height: 104,
    frontLine: 0.44,
    theme: {
      id: "belleau",
      soil: "#a99a5a",
      soil2: "#c9b26a",
      earth: "#6b5a3a",
      sky: { turbidity: 4, rayleigh: 1.6, mie: 0.006, elevation: 44, azimuth: 160 },
      sun: { color: "#fff3d6", intensity: 3.0 },
      hemi: { sky: "#cfe3f7", ground: "#8a7a44", intensity: 0.85 },
      fog: { color: "#dcd6b8", near: 28, far: 160 },
      exposure: 0.6,
      clouds: "#ffffff",
      weather: "none",
      grass: 1.6,
      grassColor: "#d4b45a",
    },
  },
  helles: {
    id: "helles",
    name: "Cape Helles",
    place: "W Beach, 1915",
    blurb: "Frontline: storm the beach, fight through two villages, cross no-man's-land and take the headquarters.",
    width: 280,
    height: 64,
    frontLine: 0.5,
    frontlineOnly: true,
    theme: {
      id: "helles",
      soil: "#bda678",
      soil2: "#8f8a5c",
      earth: "#9c8460",
      sky: { turbidity: 8, rayleigh: 1.0, mie: 0.012, elevation: 24, azimuth: 250 },
      sun: { color: "#ffe2b8", intensity: 2.4 },
      hemi: { sky: "#c9d8ea", ground: "#7d6e50", intensity: 0.85 },
      fog: { color: "#cfc6b2", near: 26, far: 150 },
      exposure: 0.62,
      clouds: "#f4efe6",
      weather: "dust",
      sea: "west",
      grass: 0.9,
      grassColor: "#8f8a52",
    },
  },
};

export const FRONT_IDS = (Object.keys(FRONTS) as FrontId[]).filter((id) => !FRONTS[id].frontlineOnly);
export const FRONTLINE_FRONT: FrontId = "helles";
export const DEFAULT_FRONT: FrontId = "somme";

export function isFrontId(v: unknown): v is FrontId {
  return typeof v === "string" && v in FRONTS;
}

