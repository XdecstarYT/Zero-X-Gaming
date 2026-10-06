/** Building blocks of the Mandate app: portraits, the chamber, charts, the compass and the district map. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { rng } from "../../core/rng";
import type { StringKey } from "../../i18n";
import { GROUP_IDEOLOGY, PARTY_IDEOLOGY, type Mp, type Position } from "../../politics/mandate";
import { FACTIONS, PARTIES, PARTY_COLOR, type PartyId } from "../../politics/politics";
import type { DistrictView } from "../../store";
import { useGame, useNum, useT, useUI } from "../hooks";
import { Icon } from "../Icons";

export function useMoney() {
  const num = useNum();
  return (n: number) => `${n < 0 ? "−" : ""}$${num(Math.abs(Math.round(n)))}`;
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;

/** A district's name. */
export function useDistrictName() {
  const t = useT();
  return (name: number) => t(`dn.${name}` as StringKey);
}

/** Parties from left to right (yours where your platform puts it). */
export function partyOrder(platform: Position): PartyId[] {
  const x = (p: PartyId) => (p === "civic" ? platform[0] : PARTY_IDEOLOGY[p][0]);
  return [...PARTIES].sort((a, b) => x(a) - x(b));
}

// ----------------------------------------------------------------- layout

export function Card({ title, icon, action, children, className = "", testId }: { title?: string; icon?: string; action?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={`md-card flex flex-col gap-3 p-4 ${className}`} data-testid={testId}>
      {(title || action) && (
        <header className="flex items-center gap-2">
          {icon && <Icon name={icon} size={18} className="opacity-80" />}
          {title && <h3 className="md-h flex-1 text-[1.02em]">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone, testId }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad"; testId?: string }) {
  return (
    <div className="md-card flex min-w-0 flex-col gap-0.5 px-4 py-3" data-testid={testId}>
      <span className="md-label truncate">{label}</span>
      <span className="truncate text-[1.45em] font-black tabular-nums" style={{ color: tone === "bad" ? "var(--md-bad)" : tone === "good" ? "var(--md-good)" : undefined }}>
        {value}
      </span>
      {sub && <span className="truncate text-[0.8em] text-[var(--md-muted)]">{sub}</span>}
    </div>
  );
}

/** A labelled 0–1 bar. */
export function Bar({ label, value, color = "var(--md-accent)", right, hint }: { label: ReactNode; value: number; color?: string; right?: ReactNode; hint?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="flex flex-col gap-1" title={hint}>
      <div className="flex items-baseline justify-between gap-2 text-[0.88em]">
        <span className="min-w-0 truncate font-semibold">{label}</span>
        <span className="shrink-0 font-black tabular-nums">{right ?? pct(v)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--md-track)]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={typeof label === "string" ? label : undefined}>
        <div className="h-full rounded-full" style={{ width: `${v * 100}%`, background: color }} />
      </div>
    </div>
  );
}

/** Shares of a whole as one stacked bar, with a legend. */
export function Stacked({ parts, label, marker }: { parts: { key: string; value: number; color: string; name: string }[]; label: string; marker?: number }) {
  const total = parts.reduce((n, p) => n + p.value, 0) || 1;
  return (
    <figure className="m-0 flex flex-col gap-2">
      <div className="relative flex h-5 overflow-hidden rounded-full bg-[var(--md-track)]" role="img" aria-label={`${label}: ${parts.map((p) => `${p.name} ${Math.round((p.value / total) * 100)}%`).join(", ")}`}>
        {parts.map((p) =>
          p.value > 0 ? (
            <span key={p.key} className="h-full border-e-2 border-[var(--md-card)] last:border-e-0" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.name}: ${Math.round((p.value / total) * 100)}%`} />
          ) : null,
        )}
        {marker !== undefined && <span className="absolute inset-y-0 w-0.5 bg-[var(--md-ink)]" style={{ insetInlineStart: `${marker * 100}%` }} aria-hidden />}
      </div>
      <figcaption className="flex flex-wrap gap-x-3 gap-y-1 text-[0.8em] text-[var(--md-muted)]">
        {parts.map((p) => (
          <span key={p.key} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
            {p.name} <b className="text-[var(--md-ink)] tabular-nums">{p.value >= 1 ? p.value : `${Math.round((p.value / total) * 100)}%`}</b>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function PartyDot({ party, size = 12 }: { party: PartyId; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: PARTY_COLOR[party] }} aria-hidden />;
}

// --------------------------------------------------------------- portraits

const SKIN = ["#f6d7c0", "#f1c9a5", "#e0ac83", "#c68a5e", "#8d5a3b", "#5c3a24"];
const HAIR = ["#1f1b18", "#3b2618", "#6b4423", "#a8743a", "#d9b56a", "#8c8c8c", "#a23b2a"];

/** A politician's portrait, drawn from their seed (always the same face). */
export function Portrait({ face, party, size = 52, label }: { face: number; party: PartyId; size?: number; label?: string }) {
  const f = useMemo(() => {
    const r = rng(face + 17);
    return { skin: r.pick(SKIN), hair: r.pick(HAIR), style: r.int(0, 4), glasses: r.next() < 0.25, tie: r.next() < 0.6, brow: r.next() < 0.5 };
  }, [face]);
  const c = PARTY_COLOR[party];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="shrink-0 rounded-[12px]" role="img" aria-label={label}>
      <rect width="64" height="64" rx="12" fill={c} opacity="0.28" />
      <rect width="64" height="64" rx="12" fill="url(#md-vignette)" />
      {/* Shoulders and suit */}
      <path d="M8 64c2-12 11-17 24-17s22 5 24 17z" fill="#263044" />
      <path d="M26 47l6 9 6-9" fill="#f4f1ea" />
      {f.tie ? <path d="M31 50h2l1.5 9-2.5 3-2.5-3z" fill={c} /> : <path d="M26 47l6 6 6-6" fill="none" stroke={c} strokeWidth="2.5" />}
      <rect x="27" y="38" width="10" height="10" rx="3" fill={f.skin} />
      {/* Hair behind */}
      {f.style === 1 && <path d="M16 30c0-12 7-19 16-19s16 7 16 19v14H16z" fill={f.hair} />}
      {/* Head */}
      <ellipse cx="32" cy="29" rx="12" ry="14" fill={f.skin} />
      {/* Hair */}
      {f.style === 0 && <path d="M20 26c0-9 5-14 12-14s12 5 12 14c-3-4-7-6-12-6s-9 2-12 6z" fill={f.hair} />}
      {f.style === 1 && <path d="M19 27c1-9 6-14 13-14s12 5 13 14c-4-5-8-7-13-7s-9 2-13 7z" fill={f.hair} />}
      {f.style === 2 && (
        <>
          <circle cx="32" cy="12" r="5" fill={f.hair} />
          <path d="M20 25c0-8 5-12 12-12s12 4 12 12c-3-3-7-5-12-5s-9 2-12 5z" fill={f.hair} />
        </>
      )}
      {f.style === 3 && <path d="M20 30c-1-5 0-9 2-11M44 30c1-5 0-9-2-11" stroke={f.hair} strokeWidth="3.5" strokeLinecap="round" fill="none" />}
      {f.style === 4 && [20, 25, 31, 37, 43].map((x, i) => <circle key={i} cx={x} cy={i % 2 ? 15 : 18} r="5" fill={f.hair} />)}
      {/* Face */}
      {f.brow && <path d="M25 24h4M35 24h4" stroke={f.hair} strokeWidth="1.5" strokeLinecap="round" />}
      <circle cx="27.5" cy="28" r="1.4" fill="#1d2433" />
      <circle cx="36.5" cy="28" r="1.4" fill="#1d2433" />
      {f.glasses && (
        <g fill="none" stroke="#1d2433" strokeWidth="1.1">
          <circle cx="27.5" cy="28" r="3.6" />
          <circle cx="36.5" cy="28" r="3.6" />
          <path d="M31.1 28h1.8" />
        </g>
      )}
      <path d="M28.5 35c2 1.6 5 1.6 7 0" stroke="#7a3b2e" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Shared SVG defs (the portrait vignette). */
export function MandateDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <radialGradient id="md-vignette" cx="50%" cy="35%" r="75%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.25" />
        </radialGradient>
      </defs>
    </svg>
  );
}

// ----------------------------------------------------------------- chamber

/**
 * The chamber as a hemicycle: one seat per member, parties left to right by ideology,
 * government members ringed. With `votes`, each seat shows how its member will vote.
 */
export function Hemicycle({ mps, platform, government, votes, rebels = [], onPick, size = 360 }: { mps: Mp[]; platform: Position; government: PartyId[]; votes?: Record<number, boolean> | null; rebels?: number[]; onPick?: (mp: Mp) => void; size?: number }) {
  const t = useT();
  const dname = useDistrictName();
  const districts = useUI((s) => s.politics?.m.districts ?? []);
  const n = mps.length;
  const order = partyOrder(platform);
  const seated = [...mps].sort((a, b) => order.indexOf(a.party) - order.indexOf(b.party) || a.district - b.district);
  // Three rows; seats per row in proportion to its length.
  const radii = [52, 70, 88];
  const total = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.round((n * r) / total));
  counts[2] += n - counts.reduce((a, b) => a + b, 0);
  const spots: { x: number; y: number; a: number }[] = [];
  radii.forEach((r, ri) => {
    const c = counts[ri];
    for (let k = 0; k < c; k++) {
      const a = Math.PI - (Math.PI * (k + 0.5)) / c;
      spots.push({ x: 100 + Math.cos(a) * r, y: 100 - Math.sin(a) * r, a });
    }
  });
  spots.sort((p, q) => q.a - p.a);
  const yes = votes ? Object.values(votes).filter(Boolean).length : 0;
  return (
    <svg viewBox="0 0 200 108" width="100%" style={{ maxWidth: size }} className="mx-auto block" role="img" aria-label={`${t("md.chamber")}: ${order.map((p) => `${t(`party.${p}` as StringKey)} ${mps.filter((m) => m.party === p).length}`).join(", ")}`} data-testid="md-hemicycle">
      {seated.map((mp, i) => {
        const s = spots[i];
        if (!s) return null;
        const gov = government.includes(mp.party);
        const v = votes ? votes[mp.id] : undefined;
        const d = districts.find((x) => x.id === mp.district);
        return (
          <g key={mp.id} onClick={onPick ? () => onPick(mp) : undefined} style={{ cursor: onPick ? "pointer" : undefined }}>
            <circle cx={s.x} cy={s.y} r="7.2" fill={PARTY_COLOR[mp.party]} stroke={gov ? "var(--md-ink)" : "var(--md-card)"} strokeWidth={gov ? 1.8 : 1.2} opacity={v === false ? 0.38 : 1} />
            {v !== undefined && (
              <text x={s.x} y={s.y + 2.6} textAnchor="middle" fontSize="7.5" fontWeight="900" fill="#0b0f14">
                {v ? "✓" : "✗"}
              </text>
            )}
            {rebels.includes(mp.id) && <circle cx={s.x + 5.5} cy={s.y - 5.5} r="2.4" fill="var(--md-bad)" stroke="var(--md-card)" strokeWidth="0.8" />}
            <title>{`${mp.name} · ${t(`party.${mp.party}` as StringKey)}${d ? ` · ${dname(d.name)}` : ""}${v === undefined ? "" : ` · ${v ? t("md.aye") : t("md.no")}`}`}</title>
          </g>
        );
      })}
      <text x="100" y="92" textAnchor="middle" fontSize="15" fontWeight="900" fill="var(--md-ink)">
        {votes ? `${yes}–${n - yes}` : `${mps.filter((m) => government.includes(m.party)).length}/${n}`}
      </text>
      <text x="100" y="103" textAnchor="middle" fontSize="6.5" fill="var(--md-muted)">
        {votes ? t("md.ayesNoes") : t("md.government")}
      </text>
    </svg>
  );
}

// ------------------------------------------------------------------ charts

/** Each party's poll over time, one line each, with direct labels at the end. */
export function PollLines({ polls }: { polls: { m: number; v: Record<PartyId, number> }[] }) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  if (polls.length < 2) return <p className="text-[0.9em] text-[var(--md-muted)]">{t("md.pollsSoon")}</p>;
  const W = 460;
  const H = 170;
  const L = 30;
  const R = 70;
  const max = Math.max(0.4, ...polls.flatMap((p) => PARTIES.map((x) => p.v[x])));
  const top = Math.ceil(max * 10) / 10;
  const x = (i: number) => L + (i / (polls.length - 1)) * (W - L - R);
  const y = (v: number) => 8 + (1 - v / top) * (H - 24);
  const last = polls[polls.length - 1];
  const labels = [...PARTIES].sort((a, b) => last.v[b] - last.v[a]).map((p) => ({ p, y: y(last.v[p]) }));
  // Keep end labels from overlapping.
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 11) labels[i].y = labels[i - 1].y + 11;
  const hi = hover ?? polls.length - 1;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${t("md.pollTrend")}: ${PARTIES.map((p) => `${t(`party.${p}` as StringKey)} ${pct(last.v[p])}`).join(", ")}`} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((k) => (
          <g key={k}>
            <line x1={L} x2={W - R} y1={y(top * k)} y2={y(top * k)} stroke="var(--md-line)" />
            <text x={L - 4} y={y(top * k) + 3} textAnchor="end" fontSize="9" fill="var(--md-muted)">
              {pct(top * k)}
            </text>
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={8} y2={H - 16} stroke="var(--md-muted)" strokeDasharray="2 3" />}
        {PARTIES.map((p) => (
          <path key={p} d={polls.map((q, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(q.v[p]).toFixed(1)}`).join(" ")} fill="none" stroke={PARTY_COLOR[p]} strokeWidth={p === "civic" ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {PARTIES.map((p) => (
          <circle key={p} cx={x(hi)} cy={y(polls[hi].v[p])} r="3.5" fill={PARTY_COLOR[p]} stroke="var(--md-card)" strokeWidth="1.5" />
        ))}
        {labels.map(({ p, y: ly }) => (
          <text key={p} x={W - R + 6} y={ly + 3} fontSize="9.5" fontWeight="700" fill="var(--md-ink)">
            {t(`party.${p}` as StringKey)} {pct(last.v[p])}
          </text>
        ))}
        {polls.map((_, i) => (
          <rect key={i} x={x(i) - (W - L - R) / (polls.length - 1) / 2} y={0} width={(W - L - R) / (polls.length - 1)} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null && (
        <figcaption className="md-card mt-1 flex flex-wrap gap-x-3 px-3 py-1.5 text-[0.8em]" role="status">
          {[...PARTIES]
            .sort((a, b) => polls[hover].v[b] - polls[hover].v[a])
            .map((p) => (
              <span key={p} className="flex items-center gap-1">
                <PartyDot party={p} size={9} />
                {t(`party.${p}` as StringKey)} <b className="tabular-nums">{pct(polls[hover].v[p])}</b>
              </span>
            ))}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * The political compass: economy across, society up and down. Parties, voter groups, your
 * platform and where your government actually stands. With `onPick`, a click sets a new platform.
 */
export function Compass({ platform, position, pick, onPick, size = 300 }: { platform: Position; position: Position; pick?: Position | null; onPick?: (p: Position) => void; size?: number }) {
  const t = useT();
  const ref = useRef<SVGSVGElement>(null);
  const S = 220;
  const C = 110;
  const K = 76;
  const px = (v: number) => C + v * K;
  const py = (v: number) => C + v * K;
  const click = (e: React.MouseEvent) => {
    if (!onPick || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const vx = (((e.clientX - r.left) / r.width) * S - C) / K;
    const vy = (((e.clientY - r.top) / r.height) * S - C) / K;
    onPick([Math.max(-1, Math.min(1, Math.round(vx * 10) / 10)), Math.max(-1, Math.min(1, Math.round(vy * 10) / 10))]);
  };
  return (
    <figure className="m-0">
      <svg ref={ref} viewBox={`0 0 ${S} ${S}`} width="100%" style={{ maxWidth: size, cursor: onPick ? "crosshair" : undefined }} className="mx-auto block" onClick={click} role="img" aria-label={t("md.compassAria", { e: Math.round(platform[0] * 100), s: Math.round(platform[1] * 100) })} data-testid="md-compass">
        <rect x={C - K - 6} y={C - K - 6} width={2 * K + 12} height={2 * K + 12} rx="10" fill="var(--md-track)" />
        <line x1={C - K - 6} x2={C + K + 6} y1={C} y2={C} stroke="var(--md-line)" />
        <line y1={C - K - 6} y2={C + K + 6} x1={C} x2={C} stroke="var(--md-line)" />
        {/* Axis names sit outside the plot so nothing lands on them. */}
        <text x={C} y="11" fontSize="8.5" fontWeight="700" textAnchor="middle" fill="var(--md-muted)">
          {t("md.progressive")}
        </text>
        <text x={C} y={S - 4} fontSize="8.5" fontWeight="700" textAnchor="middle" fill="var(--md-muted)">
          {t("md.traditional")}
        </text>
        <text x="10" y={C} fontSize="8.5" fontWeight="700" textAnchor="middle" fill="var(--md-muted)" transform={`rotate(-90 10 ${C})`}>
          {t("md.left")}
        </text>
        <text x={S - 10} y={C} fontSize="8.5" fontWeight="700" textAnchor="middle" fill="var(--md-muted)" transform={`rotate(90 ${S - 10} ${C})`}>
          {t("md.right")}
        </text>
        {FACTIONS.map((g) => (
          <rect key={g} x={px(GROUP_IDEOLOGY[g][0]) - 3} y={py(GROUP_IDEOLOGY[g][1]) - 3} width="6" height="6" transform={`rotate(45 ${px(GROUP_IDEOLOGY[g][0])} ${py(GROUP_IDEOLOGY[g][1])})`} fill="var(--md-muted)" opacity="0.8">
            <title>{t(`f.${g}` as StringKey)}</title>
          </rect>
        ))}
        {(Object.keys(PARTY_IDEOLOGY) as (keyof typeof PARTY_IDEOLOGY)[]).map((p) => (
          <g key={p}>
            <circle cx={px(PARTY_IDEOLOGY[p][0])} cy={py(PARTY_IDEOLOGY[p][1])} r="6" fill={PARTY_COLOR[p]} stroke="var(--md-card)" strokeWidth="1.5" />
            <text x={px(PARTY_IDEOLOGY[p][0])} y={py(PARTY_IDEOLOGY[p][1]) + 15} fontSize="7.5" fontWeight="800" textAnchor="middle" fill="var(--md-ink)">
              {t(`party.${p}` as StringKey)}
            </text>
          </g>
        ))}
        <line x1={px(platform[0])} y1={py(platform[1])} x2={px(position[0])} y2={py(position[1])} stroke={PARTY_COLOR.civic} strokeDasharray="2 2" />
        <circle cx={px(position[0])} cy={py(position[1])} r="4" fill={PARTY_COLOR.civic} />
        <circle cx={px(platform[0])} cy={py(platform[1])} r="8" fill="none" stroke={PARTY_COLOR.civic} strokeWidth="3" />
        <text x={px(platform[0])} y={py(platform[1]) - 12} fontSize="8.5" fontWeight="900" textAnchor="middle" fill="var(--md-ink)">
          {t("md.you")}
        </text>
        {pick && <circle cx={px(pick[0])} cy={py(pick[1])} r="8" fill="none" stroke="var(--md-ink)" strokeWidth="2" strokeDasharray="3 2" />}
      </svg>
      <figcaption className="mt-1 flex flex-wrap justify-center gap-x-3 text-[0.75em] text-[var(--md-muted)]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rotate-45 bg-[var(--md-muted)]" aria-hidden />
          {t("md.voterGroups")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: PARTY_COLOR.civic }} aria-hidden />
          {t("md.platform")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: PARTY_COLOR.civic }} aria-hidden />
          {t("md.inPractice")}
        </span>
      </figcaption>
    </figure>
  );
}

// -------------------------------------------------------------- the map

/**
 * The electoral map: every plot coloured by the party leading its district (faint where nothing's
 * built yet), the roads over it, and each district's name. Click to pick a district.
 */
export function DistrictMap({ districts, selected, onPick, height = 420 }: { districts: DistrictView[]; selected: number | null; onPick: (id: number) => void; height?: number }) {
  const g = useGame();
  const t = useT();
  const dname = useDistrictName();
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const map = useMemo(() => g.mandateMap(), [g, districts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // World → canvas.
  const view = useMemo(() => {
    if (!map) return null;
    const b = map.bounds;
    const pad = 30;
    const sx = (w - pad * 2) / Math.max(1, b.maxX - b.minX);
    const sz = (height - pad * 2) / Math.max(1, b.maxZ - b.minZ);
    const k = Math.min(sx, sz);
    const ox = (w - (b.maxX - b.minX) * k) / 2 - b.minX * k;
    const oz = (height - (b.maxZ - b.minZ) * k) / 2 - b.minZ * k;
    return { k, ox, oz };
  }, [map, w, height]);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !map || !view) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = height * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(c);
    ctx.fillStyle = css.getPropertyValue("--md-map-bg") || "#0d1424";
    ctx.fillRect(0, 0, w, height);
    const X = (x: number) => x * view.k + view.ox;
    const Z = (z: number) => z * view.k + view.oz;
    const cell = Math.max(2.5, 14 * view.k);
    for (let i = 0; i < map.lots.length; i += 4) {
      const d = districts[map.lots[i + 2]];
      const built = map.lots[i + 3] > 0;
      ctx.globalAlpha = d ? (built ? 0.9 : 0.35) * (selected === null || selected === d.id ? 1 : 0.4) : 0.3;
      ctx.fillStyle = d ? PARTY_COLOR[d.winner] : "#64748b";
      ctx.fillRect(X(map.lots[i]) - cell / 2, Z(map.lots[i + 1]) - cell / 2, cell, cell);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css.getPropertyValue("--md-map-road") || "#cbd5e1";
    ctx.lineWidth = Math.max(1, 6 * view.k);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const pts of map.roads) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(pts[i]), Z(pts[i + 1]));
      ctx.stroke();
    }
    ctx.font = "800 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const d of districts) {
      const label = `${dname(d.name)} · ${d.seats}`;
      const x = X(d.cx);
      const y = Z(d.cz);
      const tw = ctx.measureText(label).width + 14;
      ctx.fillStyle = selected === d.id ? "#ffffff" : "rgba(10,14,24,.82)";
      ctx.beginPath();
      ctx.roundRect(x - tw / 2, y - 11, tw, 22, 11);
      ctx.fill();
      ctx.fillStyle = selected === d.id ? "#0b0f14" : "#ffffff";
      ctx.fillText(label, x, y + 4);
    }
  }, [map, view, districts, selected, w, height, dname]);
  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!view || !districts.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    const wx = (e.clientX - r.left - view.ox) / view.k;
    const wz = (e.clientY - r.top - view.oz) / view.k;
    let best = districts[0];
    for (const d of districts) if (Math.hypot(d.cx - wx, d.cz - wz) < Math.hypot(best.cx - wx, best.cz - wz)) best = d;
    onPick(best.id);
  };
  return (
    <div ref={wrap} className="relative w-full overflow-hidden rounded-[14px]">
      {map && districts.length ? (
        <canvas ref={canvas} style={{ width: w, height }} onClick={click} className="block cursor-pointer" role="img" aria-label={t("md.mapAria", { n: districts.length })} data-testid="md-map" />
      ) : (
        <div className="grid place-items-center rounded-[14px] bg-[var(--md-track)] p-10 text-center text-[var(--md-muted)]" style={{ height }}>
          <div>
            <Icon name="pin" size={36} className="mx-auto opacity-60" />
            <p className="mt-2 font-semibold">{t("md.noMap")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
