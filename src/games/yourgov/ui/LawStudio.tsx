import { useRef, useState } from "react";
import { COMMITTEES, GROUP_COMMITTEE, LAW_GROUPS, PARTIES, type Effects, type LawGroup, type Pos } from "../data";
import type { Game } from "../game";
import * as G from "../sim";
import { Icon } from "./icons";

type Opt = G.LawDraft["options"][number];

const TEMPLATES: { id: string; label: string; options: Opt[]; start: number }[] = [
  {
    id: "yesno",
    label: "No · Yes",
    start: 0,
    options: [
      { label: "No", pos: { e: 0, s: 0.3 }, fx: {} },
      { label: "Yes", pos: { e: 0, s: -0.3 }, fx: {} },
    ],
  },
  {
    id: "ban",
    label: "Ban · Regulate · Allow",
    start: 1,
    options: [
      { label: "Banned", pos: { e: 0.1, s: 0.6 }, fx: {} },
      { label: "Regulated", pos: { e: 0, s: 0 }, fx: {} },
      { label: "Allowed", pos: { e: 0.2, s: -0.6 }, fx: {} },
    ],
  },
  {
    id: "level",
    label: "Low · Medium · High",
    start: 1,
    options: [
      { label: "Low", pos: { e: 0.6, s: 0 }, fx: { budget: 10 } },
      { label: "Medium", pos: { e: 0, s: 0 }, fx: {} },
      { label: "High", pos: { e: -0.6, s: 0 }, fx: { budget: -10 } },
    ],
  },
  {
    id: "blank",
    label: "Blank",
    start: 0,
    options: [
      { label: "Option A", pos: { e: 0, s: 0 }, fx: {} },
      { label: "Option B", pos: { e: 0, s: 0 }, fx: {} },
    ],
  },
];

const FX: { k: keyof Effects; label: string; step: number; unit: string; digits: number }[] = [
  { k: "happiness", label: "Happiness", step: 0.5, unit: "", digits: 1 },
  { k: "growth", label: "Growth", step: 0.05, unit: "%", digits: 2 },
  { k: "budget", label: "Budget", step: 5, unit: " B", digits: 0 },
  { k: "unemployment", label: "Unemployment", step: 0.1, unit: "%", digits: 1 },
];

const clone = (o: Opt[]): Opt[] => o.map((x) => ({ label: x.label, pos: { ...x.pos }, fx: { ...x.fx } }));

/** A small political compass: click or drag to place an option. */
function CompassPad({ value, onChange, testId }: { value: Pos; onChange: (p: Pos) => void; testId?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const e1 = ((e.clientX - r.left) / r.width) * 2 - 1;
    const s1 = -(((e.clientY - r.top) / r.height) * 2 - 1);
    onChange({ e: Math.round(Math.max(-1, Math.min(1, e1)) * 20) / 20, s: Math.round(Math.max(-1, Math.min(1, s1)) * 20) / 20 });
  };
  return (
    <svg
      ref={ref}
      className="yg-pad"
      viewBox="-1.1 -1.1 2.2 2.2"
      role="slider"
      aria-label="Where this option sits: left to right, liberal to conservative"
      aria-valuetext={`economy ${value.e.toFixed(2)}, society ${value.s.toFixed(2)}`}
      data-testid={testId}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
    >
      <rect x="-1" y="-1" width="2" height="2" rx="0.12" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.18)" strokeWidth="0.02" />
      <line x1="0" y1="-1" x2="0" y2="1" stroke="rgba(255,255,255,.15)" strokeWidth="0.015" />
      <line x1="-1" y1="0" x2="1" y2="0" stroke="rgba(255,255,255,.15)" strokeWidth="0.015" />
      <text x="0" y="-0.86" fontSize="0.13" textAnchor="middle" fill="rgba(245,247,251,.5)">
        conservative
      </text>
      <text x="0" y="0.95" fontSize="0.13" textAnchor="middle" fill="rgba(245,247,251,.5)">
        liberal
      </text>
      <text x="-0.97" y="0.05" fontSize="0.13" fill="rgba(245,247,251,.5)">
        left
      </text>
      <text x="0.97" y="0.05" fontSize="0.13" textAnchor="end" fill="rgba(245,247,251,.5)">
        right
      </text>
      {PARTIES.map((p) => (
        <circle key={p.id} cx={p.pos.e} cy={-p.pos.s} r={0.055} fill={p.color} opacity={0.55} />
      ))}
      <circle cx={value.e} cy={-value.s} r={0.09} fill="#fff" stroke="#0a84ff" strokeWidth={0.04} />
    </svg>
  );
}

export function LawStudio({ g }: { g: Game }) {
  const s = g.s!;
  const editing = g.ui.studio?.id ? G.lawOf(s, g.ui.studio.id) : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [about, setAbout] = useState(editing?.about ?? "");
  const [group, setGroup] = useState<LawGroup>(editing?.group ?? "Society");
  const [committee, setCommittee] = useState<number>(editing?.committee ?? GROUP_COMMITTEE[editing?.group ?? "Society"]);
  const [autoCommittee, setAutoCommittee] = useState(!editing);
  const [constitutional, setConstitutional] = useState(!!editing?.constitutional);
  const [options, setOptions] = useState<Opt[]>(editing ? clone(editing.options) : clone(TEMPLATES[1].options));
  const [start, setStart] = useState(editing?.start ?? TEMPLATES[1].start);
  const [open, setOpen] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const funds = s.parties[s.party].funds;
  const locked = !!editing && s.bills.some((b) => b.law === editing.id);

  const upd = (i: number, f: (o: Opt) => void) =>
    setOptions((os) => {
      const next = clone(os);
      f(next[i]);
      return next;
    });
  const draft = (): G.LawDraft => ({ name, about, group, committee, constitutional, start, options });
  const check = G.checkDraft(s, draft(), editing?.id);
  // Who would vote to move the law from today's option to each other option?
  const backers = (i: number) =>
    PARTIES.filter((p) => {
      const d = (a: Pos) => Math.hypot(a.e - p.pos.e, a.s - p.pos.s);
      return d(options[start].pos) - d(options[i].pos) > 0.05;
    });

  return (
    <div className="yg-modal-back" role="presentation" onPointerDown={(e) => e.target === e.currentTarget && g.setUI({ studio: null })}>
      <section className="yg-glass yg-modal" role="dialog" aria-modal="true" aria-label="Law studio" data-testid="yg-studio">
        <header className="yg-modal-head">
          <div>
            <p className="yg-eyebrow">Law studio</p>
            <h2>{editing ? `Edit “${editing.name}”` : "Draft a new law"}</h2>
          </div>
          <button type="button" className="yg-btn icon" onClick={() => g.setUI({ studio: null })} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="yg-modal-body yg-studio">
          <div className="yg-col">
            <label className="yg-field">
              <span>Name</span>
              <input className="yg-input" value={name} maxLength={40} placeholder="e.g. Four-day week" onChange={(e) => setName(e.target.value)} data-testid="yg-law-name" />
            </label>
            <label className="yg-field">
              <span>What it&apos;s about (optional)</span>
              <textarea className="yg-input" value={about} maxLength={120} rows={2} placeholder="One line for the record" onChange={(e) => setAbout(e.target.value)} />
            </label>
            <div className="yg-field">
              <span>Category</span>
              <div className="yg-seg wrap" role="radiogroup" aria-label="Category">
                {LAW_GROUPS.map((gr) => (
                  <button
                    key={gr}
                    type="button"
                    role="radio"
                    aria-checked={group === gr}
                    onClick={() => {
                      setGroup(gr);
                      if (autoCommittee) setCommittee(GROUP_COMMITTEE[gr]);
                    }}
                    data-testid={`yg-law-group-${gr}`}
                  >
                    {gr}
                  </button>
                ))}
              </div>
            </div>
            <label className="yg-field">
              <span>Committee</span>
              <select
                className="yg-input"
                value={committee}
                onChange={(e) => {
                  setCommittee(Number(e.target.value));
                  setAutoCommittee(false);
                }}
              >
                {COMMITTEES.map((c, i) => (
                  <option key={c} value={i + 1}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="yg-switch">
              <input type="checkbox" checked={constitutional} onChange={(e) => setConstitutional(e.target.checked)} />
              <i />
              <span>
                Constitutional
                <small>Changing it needs two thirds of each house.</small>
              </span>
            </label>
            {!editing && (
              <div className="yg-field">
                <span>Start from</span>
                <div className="yg-chips">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="yg-btn small"
                      onClick={() => {
                        setOptions(clone(t.options));
                        setStart(t.start);
                        setOpen(0);
                      }}
                      data-testid={`yg-tpl-${t.id}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="yg-col">
            <div className="yg-field">
              <span>Options ({options.length}/5)</span>
            </div>
            {options.map((o, i) => (
              <div key={i} className={`yg-opt${open === i ? " open" : ""}`}>
                <div className="yg-opt-head">
                  <input className="yg-input" value={o.label} maxLength={28} aria-label={`Option ${i + 1} name`} onChange={(e) => upd(i, (x) => (x.label = e.target.value))} onFocus={() => setOpen(i)} data-testid={`yg-opt-label-${i}`} />
                  <label className={`yg-force${start === i ? " on" : ""}`} title="The option in force today">
                    <input type="radio" name="yg-start" checked={start === i} onChange={() => setStart(i)} data-testid={`yg-opt-start-${i}`} />
                    {start === i ? "In force" : "Set in force"}
                  </label>
                  <button type="button" className="yg-btn icon small" aria-label={open === i ? "Collapse" : "Expand"} onClick={() => setOpen(open === i ? -1 : i)}>
                    <Icon name="chevron" size={16} style={{ transform: open === i ? "rotate(90deg)" : undefined, transition: "transform .2s" }} />
                  </button>
                  {options.length > 2 && (
                    <button
                      type="button"
                      className="yg-btn icon small"
                      aria-label={`Remove ${o.label || `option ${i + 1}`}`}
                      onClick={() => {
                        setOptions((os) => os.filter((_, k) => k !== i));
                        setStart((st) => (st === i ? 0 : st > i ? st - 1 : st));
                        setOpen(-1);
                      }}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  )}
                </div>
                {open === i && (
                  <div className="yg-opt-body">
                    <CompassPad value={o.pos} onChange={(p) => upd(i, (x) => (x.pos = p))} testId={`yg-opt-pad-${i}`} />
                    <div className="yg-fx">
                      {FX.map((f) => {
                        const lim = G.FX_LIMITS[f.k];
                        const v = o.fx[f.k] ?? 0;
                        return (
                          <label key={f.k} className="yg-fx-row">
                            <span>
                              {f.label}
                              <b className={v > 0 === (f.k !== "unemployment") && v !== 0 ? "up" : v !== 0 ? "down" : ""}>
                                {v > 0 ? "+" : ""}
                                {v.toFixed(f.digits)}
                                {f.unit}
                              </b>
                            </span>
                            <input type="range" min={-lim} max={lim} step={f.step} value={v} onChange={(e) => upd(i, (x) => (x.fx[f.k] = Number(e.target.value)))} aria-label={`${f.label} effect of ${o.label}`} data-testid={`yg-opt-${f.k}-${i}`} />
                          </label>
                        );
                      })}
                      <p className="yg-muted small">Each year it&apos;s in force, compared with no law at all.</p>
                    </div>
                  </div>
                )}
                {i !== start && (
                  <div className="yg-backers">
                    <span>Would back a change to it:</span>
                    {backers(i).length ? (
                      backers(i).map((p) => (
                        <span key={p.id} className="yg-chip" style={{ ["--c" as string]: p.color }}>
                          <i />
                          {p.short}
                        </span>
                      ))
                    ) : (
                      <span className="yg-muted">nobody yet</span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {options.length < 5 && (
              <button
                type="button"
                className="yg-btn"
                onClick={() => {
                  setOptions((os) => [...clone(os), { label: `Option ${String.fromCharCode(65 + os.length)}`, pos: { e: 0, s: 0 }, fx: {} }]);
                  setOpen(options.length);
                }}
                data-testid="yg-opt-add"
              >
                <Icon name="plus" size={16} /> Add an option
              </button>
            )}
          </div>
        </div>
        <footer className="yg-modal-foot">
          <p className={typeof check === "string" || error ? "yg-err" : "yg-muted"} role="status">
            {error ?? (typeof check === "string" ? check : locked ? "This law has been before the legislature, so it can't be changed now." : editing ? "Changes apply straight away." : `Drafting costs ${G.DRAFT_COST.toFixed(1)} M of party funds. Then write a bill to change it.`)}
          </p>
          {editing && (
            <button type="button" className="yg-btn bad" onClick={() => g.repealLaw(editing.id)} data-testid="yg-law-repeal">
              <Icon name="trash" size={16} /> Strike it
            </button>
          )}
          <button
            type="button"
            className="yg-btn primary"
            disabled={typeof check === "string" || locked || (!editing && (funds < G.DRAFT_COST || s.custom.length >= G.CUSTOM_MAX))}
            onClick={() => setError(g.saveLaw(draft(), editing?.id ?? null))}
            data-testid="yg-law-save"
          >
            <Icon name="check" size={16} /> {editing ? "Save changes" : "Draft the law"}
          </button>
        </footer>
      </section>
    </div>
  );
}
