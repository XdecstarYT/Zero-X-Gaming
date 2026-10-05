import { en, type StringKey } from "./en";
import { zh } from "./zh";
import { hi } from "./hi";
import { es } from "./es";
import { fr } from "./fr";
import { ar } from "./ar";
import { bn } from "./bn";
import { de } from "./de";

export type { StringKey };
export type Lang = "en" | "zh" | "hi" | "es" | "fr" | "ar" | "bn" | "de";

/** In the order the settings list shows them. To add a language: a table file, then one line here. */
export const LANGS: { id: Lang; rtl?: boolean; table: Record<StringKey, string> }[] = [
  { id: "en", table: en },
  { id: "zh", table: zh },
  { id: "hi", table: hi },
  { id: "es", table: es },
  { id: "fr", table: fr },
  { id: "ar", table: ar, rtl: true },
  { id: "bn", table: bn },
  { id: "de", table: de },
];

const byId = new Map(LANGS.map((l) => [l.id, l]));
export const isRtl = (lang: Lang) => !!byId.get(lang)?.rtl;

/** Look a string up and fill its {placeholders}. Missing keys fall back to English. */
export function translate(lang: Lang, key: StringKey, vars?: Record<string, string | number>) {
  const s = byId.get(lang)?.table[key] ?? en[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : s;
}

export function formatNumber(lang: Lang, n: number) {
  const locale = { en: "en-US", zh: "zh-CN", hi: "hi-IN", es: "es-ES", fr: "fr-FR", ar: "ar-EG", bn: "bn-BD", de: "de-DE" }[lang];
  try {
    return Math.round(n).toLocaleString(locale);
  } catch {
    return String(Math.round(n));
  }
}

/** "9:02 AM" (or 24-hour, by language) from minutes since midnight. */
export function formatClock(lang: Lang, minutes: number) {
  const m = Math.floor(((minutes % 1440) + 1440) % 1440);
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  if (translate(lang, "timeFormat") === "24h") return `${String(h).padStart(2, "0")}:${mm}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${translate(lang, h < 12 ? "am" : "pm")}`;
}

export function formatPlaytime(lang: Lang, seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? translate(lang, "hoursMinutes", { h, m }) : translate(lang, "minutesOnly", { m });
}

export function formatAgo(lang: Lang, at: number, now = Date.now()) {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 90) return translate(lang, "justNow");
  if (s < 3600) return translate(lang, "minutesAgo", { n: Math.round(s / 60) });
  if (s < 86400) return translate(lang, "hoursAgo", { n: Math.round(s / 3600) });
  return translate(lang, "daysAgo", { n: Math.round(s / 86400) });
}
