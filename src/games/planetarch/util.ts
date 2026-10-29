/** Small helpers shared by Planetarch's simulation and UI. */
import { DAY_MS, START } from "./data";

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sum = (a: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
};

/** A seeded random source kept in the world so a save replays the same. */
export function rngNext(w: { rng: number }): number {
  let t = (w.rng = (w.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function mulberry(seed: number) {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)];

export const dateOf = (day: number) => new Date(START + day * DAY_MS);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(day: number, long = false) {
  const d = dateOf(day);
  return long ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
export const yearOf = (day: number) => dateOf(day).getUTCFullYear();
export const monthOf = (day: number) => dateOf(day).getUTCMonth();
export const dayOfMonth = (day: number) => dateOf(day).getUTCDate();
/** Day number for a "YYYY-MM" (the first Sunday-ish of that month; elections fall early in the month). */
export function dayFor(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return Math.round((Date.UTC(y, (m || 1) - 1, 5) - START) / DAY_MS);
}
export const ageOf = (born: number, day: number) => (day - born) / 365.25;

/** Money in $bn, shown sensibly. */
export function money(bn: number, digits = 1): string {
  const a = Math.abs(bn);
  const s = bn < 0 ? "−" : "";
  if (a >= 1000) return `${s}$${(a / 1000).toFixed(digits)}tn`;
  if (a >= 1) return `${s}$${a.toFixed(a >= 100 ? 0 : digits)}bn`;
  if (a >= 0.001) return `${s}$${(a * 1000).toFixed(0)}m`;
  return `${s}$${Math.round(a * 1e6)}k`;
}
export function people(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}bn`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e8 ? 0 : 1)}m`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
}
export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
export const signed = (v: number, digits = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;

/** Exponential smoothing toward a target over roughly `days`. */
export const ease = (cur: number, target: number, days: number) => cur + (target - cur) / Math.max(1, days);
