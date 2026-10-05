import type { Lang } from "./i18n";

export type Preset = "low" | "medium" | "high" | "ultra" | "custom";
export type Shadows = "off" | "soft" | "sharp";

export interface Settings {
  preset: Preset;
  /** Percent values 0–100 (render scale 50–100). */
  renderScale: number;
  viewDistance: number;
  buildingDensity: number;
  pedDensity: number;
  trafficDensity: number;
  shadows: Shadows;
  aa: boolean;
  ao: boolean;
  bloom: boolean;
  pedestrians: boolean;
  traffic: boolean;
  language: Lang;
  master: number;
  music: number;
  effects: number;
  reducedMotion: boolean;
  textScale: number;
  colorBlind: boolean;
}

type Quality = Pick<Settings, "renderScale" | "viewDistance" | "buildingDensity" | "pedDensity" | "trafficDensity" | "shadows" | "aa" | "ao" | "bloom">;

/** What each preset sets. Low has to run on a phone; Ultra may use every effect. */
export const PRESETS: Record<Exclude<Preset, "custom">, Quality> = {
  low: { renderScale: 70, viewDistance: 45, buildingDensity: 45, pedDensity: 35, trafficDensity: 45, shadows: "off", aa: false, ao: false, bloom: false },
  medium: { renderScale: 85, viewDistance: 65, buildingDensity: 70, pedDensity: 60, trafficDensity: 70, shadows: "soft", aa: true, ao: false, bloom: false },
  high: { renderScale: 100, viewDistance: 85, buildingDensity: 90, pedDensity: 85, trafficDensity: 90, shadows: "soft", aa: true, ao: false, bloom: true },
  ultra: { renderScale: 100, viewDistance: 100, buildingDensity: 100, pedDensity: 100, trafficDensity: 100, shadows: "sharp", aa: true, ao: true, bloom: true },
};

export const QUALITY_KEYS = Object.keys(PRESETS.low) as (keyof Quality)[];

export function defaultSettings(coarse: boolean, language: Lang = "en"): Settings {
  const preset = coarse ? "low" : "high";
  return {
    preset,
    ...PRESETS[preset],
    pedestrians: true,
    traffic: true,
    language,
    master: 80,
    music: 55,
    effects: 75,
    reducedMotion: false,
    textScale: 100,
    colorBlind: true,
  };
}

/** Pick a preset: copies its values in. */
export function applyPreset(s: Settings, preset: Preset): Settings {
  if (preset === "custom") return { ...s, preset };
  return { ...s, ...PRESETS[preset], preset };
}

/** Change one value: any quality control switches the preset to CUSTOM. */
export function changeSetting<K extends keyof Settings>(s: Settings, key: K, value: Settings[K]): Settings {
  const next = { ...s, [key]: value };
  if ((QUALITY_KEYS as string[]).includes(key as string)) next.preset = matchingPreset(next);
  return next;
}

/** The preset these values equal, or "custom". */
export function matchingPreset(s: Settings): Preset {
  for (const [id, q] of Object.entries(PRESETS)) if (QUALITY_KEYS.every((k) => s[k] === q[k])) return id as Preset;
  return "custom";
}

export function sameSettings(a: Settings, b: Settings) {
  return (Object.keys(a) as (keyof Settings)[]).every((k) => a[k] === b[k]);
}

/** Fill in anything a stored settings object is missing (older saves, new options). */
export function normaliseSettings(raw: Partial<Settings> | null | undefined, coarse: boolean, language: Lang): Settings {
  const base = defaultSettings(coarse, language);
  if (!raw || typeof raw !== "object") return base;
  const out = { ...base };
  for (const k of Object.keys(base) as (keyof Settings)[]) {
    const v = raw[k];
    if (v !== undefined && typeof v === typeof base[k]) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
