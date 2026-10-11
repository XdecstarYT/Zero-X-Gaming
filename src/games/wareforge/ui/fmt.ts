/** Formatting shared by WareForge's panels. */
export const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
/** Short money for tight spots: $950, $12.4k, $1.25M. */
export const short = (n: number) => {
  const a = Math.abs(n);
  const trim = (x: string) => (x.includes(".") ? x.replace(/0+$/, "").replace(/\.$/, "") : x);
  const v = a >= 1e6 ? `$${trim((a / 1e6).toFixed(a >= 1e7 ? 1 : 2))}M` : a >= 1e4 ? `$${trim((a / 1e3).toFixed(a >= 1e5 ? 0 : 1))}k` : `$${Math.round(a).toLocaleString("en-US")}`;
  return `${n < 0 ? "−" : ""}${v}`;
};
/** Game seconds as "45 min" or "3h 20m". */
export const mins = (secs: number) => {
  const m = Math.max(0, Math.round(secs / 60));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
};
/** A factor against the usual: "Usual", "+15%", "−10%". */
export const pct = (p: number) => (Math.abs(p - 1) < 0.001 ? "Usual" : `${p > 1 ? "+" : "−"}${Math.round(Math.abs(p - 1) * 100)}%`);
