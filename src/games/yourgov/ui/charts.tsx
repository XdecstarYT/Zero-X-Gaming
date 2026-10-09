import { useRef, useState } from "react";
import { PARTY, type PartyId } from "../data";
import * as G from "../sim";

const W = 320;

/** Years along the bottom: a tick at each new year in the range. */
function yearTicks(h: G.HistoryPoint[], x: (i: number) => number) {
  const out: { x: number; label: string }[] = [];
  for (let i = 1; i < h.length; i++) if (G.yearOf(h[i].w) !== G.yearOf(h[i - 1].w)) out.push({ x: x(i), label: String(G.yearOf(h[i].w)) });
  return out.length > 6 ? out.filter((_, k) => k % Math.ceil(out.length / 6) === 0) : out;
}

/**
 * National polls over time: one line per party in its own colour (identity), one shared
 * percent axis, a legend, and a crosshair with the week's numbers on hover.
 */
export function PollChart({ s, height = 150 }: { s: G.GameState; height?: number }) {
  const h = s.history;
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  if (h.length < 2) return <p className="yg-muted">The trend appears after a week or two.</p>;
  const L = 30;
  const R = 8;
  const T = 8;
  const B = 18;
  const max = Math.min(1, Math.ceil(Math.max(...h.flatMap((p) => p.poll)) * 10 + 0.5) / 10);
  const x = (i: number) => L + ((W - L - R) * i) / (h.length - 1);
  const y = (v: number) => T + (height - T - B) * (1 - v / max);
  const order = [...G.PARTY_IDS].sort((a, b) => h[h.length - 1].poll[G.PARTY_IDS.indexOf(b)] - h[h.length - 1].poll[G.PARTY_IDS.indexOf(a)]);
  const grid = [0, max / 2, max];
  const hi = hover ?? h.length - 1;
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(h.length - 1, Math.round(((px - L) / (W - L - R)) * (h.length - 1)))));
  };
  return (
    <div className="yg-chart">
      <div className="yg-legend-row">
        {order.map((id) => (
          <span key={id} className="yg-legend-item">
            <i style={{ background: PARTY[id].color }} />
            {PARTY[id].short} <b>{(h[hi].poll[G.PARTY_IDS.indexOf(id)] * 100).toFixed(1)}%</b>
          </span>
        ))}
      </div>
      <svg ref={ref} viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label="National polls over time" onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ touchAction: "none" }}>
        {grid.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,.12)" />
            <text x={L - 5} y={y(v) + 3.5} fontSize="9" textAnchor="end" fill="rgba(245,247,251,.55)">
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}
        {yearTicks(h, x).map((t) => (
          <text key={t.label} x={t.x} y={height - 4} fontSize="9" textAnchor="middle" fill="rgba(245,247,251,.55)">
            {t.label}
          </text>
        ))}
        {[...G.PARTY_IDS].reverse().map((id) => {
          const k = G.PARTY_IDS.indexOf(id);
          const d = h.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.poll[k]).toFixed(1)}`).join("");
          return <path key={id} d={d} fill="none" stroke={PARTY[id].color} strokeWidth={id === s.party ? 2.6 : 2} strokeLinejoin="round" strokeLinecap="round" opacity={id === s.party ? 1 : 0.88} />;
        })}
        <line x1={x(hi)} x2={x(hi)} y1={T} y2={height - B} stroke="rgba(255,255,255,.4)" strokeDasharray="3 3" />
        {G.PARTY_IDS.map((id, k) => (
          <circle key={id} cx={x(hi)} cy={y(h[hi].poll[k])} r={3.2} fill={PARTY[id].color} stroke="rgba(10,14,22,.9)" strokeWidth={1.5} />
        ))}
      </svg>
      <p className="yg-chart-note">{G.dateLabel(h[hi].w)}</p>
    </div>
  );
}

/** One measure over time (a small chart of its own; never two scales on one axis). */
export function Trend({ s, pick, label, unit, color = "#64d2ff", digits = 1 }: { s: G.GameState; pick: (p: G.HistoryPoint) => number; label: string; unit: string; color?: string; digits?: number }) {
  const h = s.history;
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const height = 64;
  if (h.length < 2) return null;
  const vals = h.map(pick);
  let lo = Math.min(...vals);
  let hiV = Math.max(...vals);
  if (hiV - lo < 1e-6) {
    lo -= 1;
    hiV += 1;
  }
  const pad = (hiV - lo) * 0.12;
  lo -= pad;
  hiV += pad;
  const x = (i: number) => 4 + ((W - 8) * i) / (h.length - 1);
  const y = (v: number) => 6 + (height - 12) * (1 - (v - lo) / (hiV - lo));
  const i = hover ?? h.length - 1;
  const d = vals.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <div className="yg-trend">
      <div className="yg-trend-head">
        <span>{label}</span>
        <b>
          {vals[i].toFixed(digits)}
          {unit}
        </b>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        role="img"
        aria-label={`${label} over time`}
        onPointerMove={(e) => {
          const r = ref.current!.getBoundingClientRect();
          setHover(Math.max(0, Math.min(h.length - 1, Math.round((((e.clientX - r.left) / r.width) * W - 4) / ((W - 8) / (h.length - 1))))));
        }}
        onPointerLeave={() => setHover(null)}
        style={{ touchAction: "none" }}
      >
        <path d={`${d}L${x(h.length - 1)},${height}L${x(0)},${height}Z`} fill={color} opacity={0.12} />
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        <circle cx={x(i)} cy={y(vals[i])} r={3.2} fill={color} stroke="rgba(10,14,22,.9)" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

/** The half-circle seat chart. */
export function Hemicycle({ seats, size = 240, highlight }: { seats: Record<string, number>; size?: number; highlight?: PartyId }) {
  const order = [...G.PARTY_IDS].sort((a, b) => PARTY[a].pos.e - PARTY[b].pos.e);
  const list: { c: string; id: PartyId }[] = [];
  for (const id of order) for (let i = 0; i < (seats[id] ?? 0); i++) list.push({ c: PARTY[id].color, id });
  const n = list.length;
  const rows = n > 60 ? 6 : 4;
  const dots: { x: number; y: number; a: number }[] = [];
  const lens = Array.from({ length: rows }, (_, k) => 0.45 + (0.55 * k) / (rows - 1));
  const tot = lens.reduce((a, b) => a + b, 0);
  let left = n;
  lens.forEach((l, k) => {
    const m = k === rows - 1 ? left : Math.round((n * l) / tot);
    left -= m;
    for (let j = 0; j < m; j++) {
      const a = Math.PI * (1 - (j + 0.5) / m);
      dots.push({ x: 50 + Math.cos(a) * l * 46, y: 52 - Math.sin(a) * l * 46, a });
    }
  });
  dots.sort((p, q) => q.a - p.a);
  return (
    <svg width={size} height={size * 0.56} viewBox="0 0 100 56" role="img" aria-label={`${n} seats`}>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={n > 60 ? 2.1 : 3.3} fill={list[i]?.c} stroke={highlight && list[i]?.id === highlight ? "#fff" : "rgba(0,0,0,.35)"} strokeWidth={highlight && list[i]?.id === highlight ? 0.6 : 0.35} />
      ))}
      <text x="50" y="53" textAnchor="middle" fontSize="9" fontWeight="800" fill="rgba(245,247,251,.9)">
        {n}
      </text>
    </svg>
  );
}
