/** Form pieces for the things players make: labelled sliders, voter-group pickers, colour swatches. */
import type { ReactNode } from "react";
import { GROUPS } from "../politics";

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="yg-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** A slider with its value beside the label (green when it helps, red when it hurts). */
export function Slider({ label, value, min, max, step, onChange, unit = "", digits = 0, good = 1, testId }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit?: string; digits?: number; good?: 1 | -1 | 0; testId?: string }) {
  const cls = !value || !good ? "" : value * good > 0 ? "up" : "down";
  return (
    <label className="yg-fx-row">
      <span>
        {label}
        <b className={cls}>
          {value > 0 && min < 0 ? "+" : ""}
          {value.toFixed(digits)}
          {unit}
        </b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} data-testid={testId} />
    </label>
  );
}

/** The eight voter groups: tap one to step it through the values (for, strongly for, against…). */
export function GroupPicker({ value, onChange, steps, testId }: { value: Record<string, number>; onChange: (v: Record<string, number>) => void; steps: number[]; testId?: string }) {
  return (
    <div className="yg-likes" data-testid={testId}>
      {GROUPS.map((gr) => {
        const v = value[gr.id] ?? 0;
        const next = steps[(steps.indexOf(v) + 1) % steps.length] ?? 0;
        return (
          <button
            key={gr.id}
            type="button"
            className={`yg-like ${v > 0 ? "up" : v < 0 ? "down" : ""}`}
            title={gr.name}
            aria-label={`${gr.name}: ${v === 0 ? "not involved" : v > 0 ? `for it (${v})` : `against it (${v})`}`}
            onClick={() => {
              const out = { ...value, [gr.id]: next };
              if (!next) delete out[gr.id];
              onChange(out);
            }}
            data-testid={testId ? `${testId}-${gr.id}` : undefined}
          >
            <span>{gr.icon}</span>
            <b>{v > 0 ? `+${v}` : v < 0 ? v : "·"}</b>
          </button>
        );
      })}
    </div>
  );
}

export function Swatches({ value, options, onChange, label }: { value: string; options: string[]; onChange: (c: string) => void; label: string }) {
  return (
    <div className="yg-swatches" role="radiogroup" aria-label={label}>
      {options.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value.toLowerCase() === c.toLowerCase()} aria-label={c} style={{ background: c }} onClick={() => onChange(c)} />
      ))}
    </div>
  );
}
