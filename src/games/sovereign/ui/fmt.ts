/** Money is kept in $ millions. */
export function money(m: number) {
  const a = Math.abs(m);
  const sign = m < 0 ? "-" : "";
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}T`;
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(a >= 1e4 ? 0 : 1)}B`;
  return `${sign}$${a >= 10 ? Math.round(a) : a.toFixed(1)}M`;
}
export function perDay(m: number) {
  return `${m >= 0 ? "+" : ""}${money(m)}/d`;
}
export function people(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
}
export function qty(n: number) {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  if (Math.abs(n) >= 10) return String(Math.round(n));
  return n.toFixed(1);
}
export const pct = (v: number) => `${Math.round(v)}%`;
