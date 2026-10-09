/** The building blocks every YourGov panel is made of: sheets, rows, groups, bars, segmented controls. */
import type { ReactNode } from "react";
import * as G from "../sim";
import { flagUrl } from "./flags";
import { Icon } from "./icons";

/** Party money, in millions of the country's currency. */
export const money = (s: G.GameState, m: number) => `${m < 0 ? "–" : ""}${s.sc.economy.cur}${Math.abs(m) >= 1000 ? (Math.abs(m) / 1000).toFixed(2) + " B" : Math.abs(m).toFixed(1) + " M"}`;
/** A small weekly amount (wages), in thousands. */
export const wage = (s: G.GameState, m: number) => `${s.sc.economy.cur}${Math.round(m * 1000)} k`;
export const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
export const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** A big amount in billions of the country's currency (trillions above a thousand). */
export const big = (s: G.GameState, bn: number) => `${s.sc.economy.cur}${Math.abs(bn) >= 1000 ? (Math.abs(bn) / 1000).toFixed(Math.abs(bn) >= 100000 ? 0 : 1) + " T" : Math.abs(bn).toFixed(0) + " B"}`;

export function Sheet({ title, eyebrow, onClose, onBack, children, testId, actions }: { title: string; eyebrow?: string; onClose?: () => void; onBack?: () => void; children: ReactNode; testId?: string; actions?: ReactNode }) {
  return (
    <section className="yg-glass yg-sheet" data-testid={testId} aria-label={title}>
      <header className="yg-sheet-head">
        {onBack && (
          <button type="button" className="yg-btn icon small" onClick={onBack} aria-label="Back">
            <Icon name="back" size={18} />
          </button>
        )}
        <div className="yg-sheet-title">
          {eyebrow && <p className="yg-eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
        {actions}
        {onClose && (
          <button type="button" className="yg-btn icon small" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        )}
      </header>
      <div className="yg-sheet-body">{children}</div>
    </section>
  );
}

export function Row({ children, on, onClick, testId, className = "", disabled }: { children: ReactNode; on?: boolean; onClick?: () => void; testId?: string; className?: string; disabled?: boolean }) {
  if (onClick)
    return (
      <button type="button" className={`yg-row btn${on ? " on" : ""} ${className}`} onClick={onClick} data-testid={testId} disabled={disabled}>
        {children}
      </button>
    );
  return (
    <div className={`yg-row${on ? " on" : ""} ${className}`} data-testid={testId}>
      {children}
    </div>
  );
}

export const Group = ({ label, children, testId }: { label?: ReactNode; children: ReactNode; testId?: string }) => (
  <div className="yg-group" data-testid={testId}>
    {label && <p className="yg-label">{label}</p>}
    <div className="yg-group-box">{children}</div>
  </div>
);

/** A bar 0–1 (it fills the row, or takes a fixed width with `w`). */
export const Bar = ({ v, color, w }: { v: number; color: string; w?: number }) => (
  <span className="yg-bar" style={w ? { flex: "none", width: w } : undefined}>
    <i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: color }} />
  </span>
);

/** A bar for a value that can go either way, filled from the middle. */
export const MidBar = ({ v, lo, hi, w }: { v: number; lo: number; hi: number; w?: number }) => {
  const zero = -lo / (hi - lo);
  const at = (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo);
  const left = Math.min(zero, at);
  return (
    <span className="yg-bar mid" style={w ? { width: w } : undefined}>
      <i style={{ marginLeft: `${left * 100}%`, width: `${Math.abs(at - zero) * 100}%`, background: v >= 0 ? "var(--good)" : "var(--bad)" }} />
      <b style={{ left: `${zero * 100}%` }} />
    </span>
  );
};

export const Sw = ({ c }: { c: string }) => <span className="yg-sw" style={{ background: c }} />;

export const Flag = ({ code, name, size = 22 }: { code?: string; name: string; size?: number }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={flagUrl(code, name)} alt={`Flag of ${name}`} width={Math.round(size * 1.5)} height={size} style={{ borderRadius: 4, flex: "none", objectFit: "cover", boxShadow: "0 0 0 1px rgba(255,255,255,.25)" }} />
);

export function Seg<T extends string>({ value, options, onChange, label, testId, className = "" }: { value: T; options: { id: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string; testId?: string; className?: string }) {
  return (
    <div className={`yg-seg ${className}`} role="radiogroup" aria-label={label} data-testid={testId}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} title={o.title} onClick={() => onChange(o.id)} data-testid={testId ? `${testId}-${o.id}` : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A card that needs an answer, over the game. */
export function Modal({ children, label, testId, wide }: { children: ReactNode; label: string; testId: string; wide?: boolean }) {
  return (
    <div className="yg-modal-back" data-testid={testId}>
      <section className={`yg-glass yg-modal ${wide ? "" : "small"} yg-decision`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </section>
    </div>
  );
}

/** One to five stars for a 3–9 rating. */
export const Stars = ({ n }: { n: number }) => {
  const k = Math.max(1, Math.min(5, Math.round((n - 2) / 1.4)));
  return (
    <span className="yg-stars" aria-label={`${k} of 5`}>
      {"★★★★★".slice(0, k)}
      <em>{"★★★★★".slice(k)}</em>
    </span>
  );
};

export function fxText(s: G.GameState, fx: { happiness?: number; growth?: number; budget?: number; unemployment?: number; approval?: number }) {
  const out: string[] = [];
  if (fx.approval) out.push(`approval ${fx.approval > 0 ? "+" : ""}${fx.approval.toFixed(0)}`);
  if (fx.happiness) out.push(`happiness ${fx.happiness > 0 ? "+" : ""}${fx.happiness.toFixed(1)}`);
  if (fx.growth) out.push(`growth ${fx.growth > 0 ? "+" : ""}${fx.growth.toFixed(2)}%`);
  if (fx.budget) out.push(`budget ${fx.budget > 0 ? "+" : "–"}${big(s, fx.budget * (s.sc.economy.gdp / 18))}`);
  if (fx.unemployment) out.push(`jobless ${fx.unemployment > 0 ? "+" : ""}${fx.unemployment.toFixed(1)}%`);
  return out.join(" · ");
}
