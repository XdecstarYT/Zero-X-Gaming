import { useMemo, type ReactNode } from "react";
import { rng } from "../core/rng";
import { Icon } from "./Icons";
import { useT } from "./hooks";

/** A golden-hour skyline with a low sun, drawn as SVG (the loading screen's backdrop). */
export function Skyline() {
  const buildings = useMemo(() => {
    const r = rng(42);
    const out: { x: number; w: number; h: number; lit: [number, number][] }[] = [];
    for (let x = -20; x < 1620; ) {
      const w = r.range(40, 110);
      const h = r.range(90, 420) * (1 - Math.abs(x - 800) / 1400);
      const lit: [number, number][] = [];
      for (let k = 0; k < (w * h) / 900; k++) if (r.chance(0.35)) lit.push([x + 6 + r.next() * (w - 14), 900 - h + 8 + r.next() * (h - 20)]);
      out.push({ x, w, h, lit });
      x += w + r.range(2, 14);
    }
    return out;
  }, []);
  return (
    <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" style={{ filter: "blur(7px) saturate(1.15)", transform: "scale(1.08)" }} aria-hidden>
      <defs>
        <linearGradient id="zc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2c55" />
          <stop offset="0.45" stopColor="#c8605a" />
          <stop offset="0.72" stopColor="#f5a25a" />
          <stop offset="1" stopColor="#ffd59a" />
        </linearGradient>
        <radialGradient id="zc-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6dc" />
          <stop offset="0.35" stopColor="#ffd58a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ff9a4a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="zc-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e08a5a" />
          <stop offset="1" stopColor="#3a2a48" />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#zc-sky)" />
      <circle cx="960" cy="860" r="320" fill="url(#zc-sun)" />
      <circle cx="960" cy="880" r="70" fill="#fff1c8" />
      {buildings.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={900 - b.h} width={b.w} height={b.h} fill={i % 3 ? "#3a2c40" : "#4a3040"} />
          {b.lit.map(([x, y], k) => (
            <rect key={k} x={x} y={y} width={5} height={7} fill="#ffcf7a" opacity={0.85} />
          ))}
        </g>
      ))}
      <rect y="900" width="1600" height="100" fill="url(#zc-water)" />
    </svg>
  );
}

/** A full-screen glass sheet with a title and a close button. */
export function Sheet({ title, onClose, children, chip, wide = false }: { title: string; onClose: () => void; children: ReactNode; chip?: ReactNode; wide?: boolean }) {
  const t = useT();
  return (
    <div className="absolute inset-0 z-30 flex items-stretch justify-center p-2 sm:p-6 zc-in" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`zc-glass zc-slide flex w-full flex-col overflow-hidden ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
          <h2 className="zc-h flex-1 text-[1.4em]">{title}</h2>
          {chip}
          <button type="button" className="zc-btn" onClick={onClose} aria-label={t("close")} data-testid="zc-sheet-close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="zc-scroll flex-1 p-5">{children}</div>
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, label, testId }: { on: boolean; onChange: (v: boolean) => void; label: string; testId?: string }) {
  const t = useT();
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-3">
      <span className="font-semibold">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        data-testid={testId}
        onClick={() => onChange(!on)}
        className="zc-btn min-w-[84px] font-black"
        style={{ background: on ? "color-mix(in srgb, var(--zc-on) 22%, transparent)" : "color-mix(in srgb, var(--zc-off) 18%, transparent)", color: on ? "var(--zc-on)" : "var(--zc-off)", borderColor: on ? "var(--zc-on)" : "var(--zc-off)" }}
      >
        {on ? t("on") : t("off")}
      </button>
    </div>
  );
}

export function Slider({ value, onChange, label, min = 0, max = 100, testId, suffix = "%" }: { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number; testId?: string; suffix?: string }) {
  return (
    <label className="flex min-h-[44px] flex-wrap items-center gap-3">
      <span className="min-w-[10em] flex-1 font-semibold">{label}</span>
      <input type="range" min={min} max={max} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="max-w-[16em] flex-[2]" data-testid={testId} aria-label={label} />
      <span className="w-[3.5em] text-end font-black tabular-nums">
        {value}
        {suffix}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label, testId }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; testId?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-[var(--zc-rs)] border border-white/10 bg-black/25 p-1" data-testid={testId}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} onClick={() => onChange(o.id)} className={`zc-btn zc-label min-w-0 flex-1 border-0 px-2 text-[0.68em] ${o.id === value ? "zc-on" : "bg-transparent"}`} data-testid={testId ? `${testId}-${o.id}` : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min, max, label, testId }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string; testId?: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <span className="zc-label me-1 opacity-70">{label}</span>
      <button type="button" className="zc-btn px-0" aria-label={`${label} −`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} data-testid={testId ? `${testId}-minus` : undefined}>
        <Icon name="minus" size={16} />
      </button>
      <span className="w-[2em] text-center font-black tabular-nums" data-testid={testId}>
        {value}
      </span>
      <button type="button" className="zc-btn px-0" aria-label={`${label} +`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} data-testid={testId ? `${testId}-plus` : undefined}>
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}
