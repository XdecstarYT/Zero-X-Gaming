"use client";

import { useState } from "react";
import { BANDS, CIVICS, MILESTONES, MONTHS, PARKING_NAMES, PATTERNS, ROOF_ORDER, ROOFS, STYLE_ORDER, STYLES, USE_ORDER, USES, type Parking, type Pattern } from "../data";
import { planStats } from "../design";
import { fmt, type Game } from "../game";
import { TERMS, type Term } from "../actions";
import { PoliticsPanel } from "./politics";
import { dateLabel, type Application, type BUse } from "../state";

/* ------------------------------------------------------------------ bits */

/** "Homes · Wanted": a meter of demand against what's there. */
export function Wanted({ d, n }: { d: number; n: number }) {
  const k = Math.max(0, Math.min(1, d / Math.max(40, n * 0.5)));
  const label = d > n * 0.15 + 20 ? "Wanted" : d > 0 ? "Some demand" : "Enough";
  return (
    <span className="xc-want">
      <span className="xc-meter">
        <i style={{ width: `${Math.max(6, k * 100)}%`, background: d > 0 ? undefined : "var(--ink3)" }} />
      </span>
      <span style={{ fontSize: 12, fontWeight: 650, color: d > 0 ? "var(--green)" : "var(--ink3)" }}>{label}</span>
    </span>
  );
}

export function PatternIcon({ p }: { p: Pattern | "none" }) {
  const road = "#5b5f63";
  return (
    <svg viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" fill="#7fae52" />
      {p === "none" && (
        <>
          <rect x="6" y="6" width="28" height="28" fill="rgba(255,255,255,.25)" stroke="#fff" strokeWidth="1.5" strokeDasharray="3 2" />
        </>
      )}
      {p === "grid" && (
        <g stroke={road} strokeWidth="3">
          {[8, 20, 32].map((y) => (
            <line key={y} x1="0" y1={y} x2="40" y2={y} />
          ))}
          {[12, 28].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="40" />
          ))}
        </g>
      )}
      {p === "curvy" && (
        <g stroke={road} strokeWidth="3" fill="none">
          <path d="M0 9 C 12 3, 24 15, 40 8" />
          <path d="M0 21 C 12 15, 26 28, 40 20" />
          <path d="M0 33 C 14 27, 26 39, 40 32" />
          <path d="M20 0 C 15 14, 25 26, 18 40" />
        </g>
      )}
      {p === "culdesac" && (
        <g stroke={road} strokeWidth="3" fill="none">
          <path d="M0 22 C 12 16, 26 28, 40 20" />
          <line x1="10" y1="19" x2="10" y2="6" />
          <line x1="22" y1="23" x2="22" y2="35" />
          <line x1="31" y1="22" x2="31" y2="8" />
          <circle cx="10" cy="5" r="3" fill={road} />
          <circle cx="22" cy="36" r="3" fill={road} />
          <circle cx="31" cy="7" r="3" fill={road} />
        </g>
      )}
      {p === "superblock" && (
        <g>
          <rect x="3" y="3" width="34" height="34" fill="none" stroke={road} strokeWidth="4" />
          <rect x="14" y="14" width="12" height="12" fill="#3f9a52" />
          <g stroke={road} strokeWidth="2.5">
            <line x1="20" y1="3" x2="20" y2="13" />
            <line x1="20" y1="27" x2="20" y2="37" />
            <line x1="3" y1="20" x2="13" y2="20" />
            <line x1="27" y1="20" x2="37" y2="20" />
          </g>
        </g>
      )}
    </svg>
  );
}

/** A street scene with buildings as tall as the band allows. */
function Skyline({ band }: { band: number }) {
  const b = BANDS[band];
  const st = band === 0 ? 1 : b.max;
  const n = band <= 1 ? 5 : band === 2 ? 6 : band === 3 ? 4 : 3;
  const H = 120;
  const floor = Math.min(14, (H - 26) / Math.max(4, st));
  const items = Array.from({ length: n }, (_, i) => i);
  return (
    <svg viewBox="0 0 220 130" preserveAspectRatio="xMidYMax meet" aria-hidden>
      <rect x="0" y="112" width="220" height="18" fill="#3b3f42" />
      <rect x="0" y="108" width="220" height="5" fill="#9fd06a" />
      {items.map((i) => {
        const w = 200 / n - 6;
        const x = 10 + i * (200 / n);
        const s = Math.max(1, Math.round(st * (0.75 + ((i * 37) % 10) / 40)));
        const h = Math.min(100, s * floor + (band <= 1 ? 4 : 0));
        const cols = ["#c7684e", "#e6d6b5", "#a64f3c", "#d9cfc0", "#8c9aa4"];
        const c = band >= 4 ? ["#d9dee2", "#c8d2d8", "#e4e1da"][i % 3] : cols[i % cols.length];
        return (
          <g key={i}>
            <rect x={x} y={108 - h} width={w} height={h} fill={c} />
            {band <= 2 && <polygon points={`${x - 2},${108 - h} ${x + w / 2},${108 - h - 10} ${x + w + 2},${108 - h}`} fill="#8e3b2c" />}
            {Array.from({ length: Math.min(s, 30) }, (_, k) => (
              <rect key={k} x={x + 3} y={108 - h + 4 + k * floor} width={w - 6} height={Math.max(1.5, floor * 0.4)} fill="rgba(40,55,70,.55)" />
            ))}
          </g>
        );
      })}
      <circle cx="30" cy="100" r="2.5" fill="#222" />
      <rect x="29" y="102" width="2" height="6" fill="#222" />
      <circle cx="160" cy="100" r="2.5" fill="#d33" />
      <rect x="159" y="102" width="2" height="6" fill="#d33" />
    </svg>
  );
}

function HeightSlider({ bands, value, onChange, pop }: { bands: number[]; value: number; onChange: (b: number) => void; pop: number }) {
  const list = [...bands].reverse();
  return (
    <div className="xc-height" style={{ position: "relative" }}>
      <div className="rail">
        {list.map((b) => (
          <span key={b} style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <button type="button" className={`stop${value === b ? " on" : ""}`} disabled={pop < BANDS[b].unlock} onClick={() => onChange(b)} aria-label={`${BANDS[b].label}, ${BANDS[b].form}`} title={pop < BANDS[b].unlock ? `Unlocks at ${BANDS[b].unlock.toLocaleString()} people` : BANDS[b].label} data-testid={`xc-height-${b}`} />
            {value === b && (
              <span className="lbl" style={{ left: 30, whiteSpace: "nowrap", zIndex: 1 }}>
                {BANDS[value].label} <span style={{ opacity: 0.7 }}>{BANDS[value].form}</span>
              </span>
            )}
          </span>
        ))}
      </div>
      <Skyline band={value} />
    </div>
  );
}

function Header({ icon, title, sub, onClose }: { icon: string; title: React.ReactNode; sub?: React.ReactNode; onClose: () => void }) {
  return (
    <div className="xc-panel-h">
      <div className="ic" aria-hidden>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <h3>{title}</h3>
        {sub && <p>{sub}</p>}
      </div>
      <button className="x" type="button" onClick={onClose} aria-label="Close" data-testid="xc-close">
        ✕
      </button>
    </div>
  );
}

const stars = (q: number) => "★".repeat(Math.floor(q)) + (q % 1 ? "½" : "") + "☆".repeat(5 - Math.ceil(q));

/* ------------------------------------------------------------------ panels */

export function Panels({ game }: { game: Game }) {
  switch (game.panel) {
    case "district":
      return <DistrictPanel game={game} />;
    case "design":
      return game.design ? <DesignPanel game={game} /> : null;
    case "agenda":
      return <AgendaPanel game={game} />;
    case "building":
      return <BuildingPanel game={game} />;
    case "city":
      return <CityPanel game={game} />;
    case "help":
      return <HelpPanel game={game} />;
    case "politics":
      return game.s?.pol ? <PoliticsPanel game={game} /> : null;
    default:
      return null;
  }
}

function DistrictPanel({ game }: { game: Game }) {
  const s = game.s!;
  const d = s.districts[game.selDistrict];
  const [tab, setTab] = useState<"zoning" | "rules">("zoning");
  if (!d) return null;
  let lots = 0;
  let homes = 0;
  let jobs = 0;
  let empty = 0;
  for (const l of s.lots) {
    if (!l || l.district !== d.id) continue;
    lots++;
    const b = l.bld >= 0 ? s.buildings[l.bld] : null;
    if (!b) empty++;
    else if (b.lots[0] === l.id && b.done) {
      homes += b.homes;
      jobs += b.jobs;
    }
  }
  const u = USES[d.use];
  const homesy = d.use === "homes" || d.use === "mixed";
  return (
    <section className="xc-panel xc-glass" data-testid="xc-district">
      <Header icon={u.icon} title={d.name} sub={homesy ? <Wanted d={s.stats.homeDemand} n={s.stats.homes} /> : u.blurb} onClose={() => game.openPanel(null)} />
      <div className="xc-tabs">
        <button type="button" className={tab === "zoning" ? "on" : ""} onClick={() => setTab("zoning")}>
          Zoning
        </button>
        <button type="button" className={tab === "rules" ? "on" : ""} onClick={() => setTab("rules")} data-testid="xc-rules-tab">
          Rules
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => game.copyDistrict(d.id)} data-testid="xc-copy-district">
          Copy a district
        </button>
      </div>
      <div className="xc-body">
        {tab === "zoning" ? (
          <>
            <div className="xc-scroll">
              {USE_ORDER.map((k) => (
                <button key={k} className={`xc-chip${d.use === k ? " on" : ""}`} type="button" onClick={() => game.editDistrict({ use: k })}>
                  {USES[k].icon} {USES[k].name}
                </button>
              ))}
            </div>
            {u.bands[0] > 0 && <HeightSlider bands={u.bands} value={d.band} onChange={(b) => game.editDistrict({ band: b })} pop={s.stats.pop} />}
            {d.pattern && (
              <div className="xc-row" style={{ alignItems: "center", fontSize: 13 }}>
                <span style={{ width: 34 }}>
                  <PatternIcon p={d.pattern} />
                </span>
                <span className="muted">{PATTERNS[d.pattern].name} streets</span>
              </div>
            )}
            <div className="xc-tiles">
              <Tile v={lots} l="plots" />
              <Tile v={empty} l="empty" />
              <Tile v={homes} l="homes" />
              <Tile v={jobs} l="jobs" />
            </div>
          </>
        ) : (
          <>
            <div className="xc-sec">
              <h5>Parking minimum</h5>
              <div className="xc-row">
                {PARKING_NAMES.map((n, i) => (
                  <button key={n} className={`xc-chip${d.rules.parking === i ? " on" : ""}`} type="button" onClick={() => game.editDistrict({ rules: { parking: i as Parking } })} data-testid={`xc-parking-${i}`}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="xc-hint" style={{ marginTop: 6 }}>
                Full parking means a space for every home: fewer homes, more cars, dearer buildings.
              </p>
            </div>
            <div className="xc-sec">
              <h5>Affordable homes required</h5>
              <div className="xc-row">
                {[0, 10, 20].map((n) => (
                  <button key={n} className={`xc-chip${d.rules.affordable === n ? " on" : ""}`} type="button" onClick={() => game.editDistrict({ rules: { affordable: n } })}>
                    {n}%
                  </button>
                ))}
              </div>
            </div>
            <Toggle label="Corner shops allowed" on={d.rules.corner} onChange={(v) => game.editDistrict({ rules: { corner: v } })} />
            <Toggle label="Developers may join plots together" on={d.rules.merge} onChange={(v) => game.editDistrict({ rules: { merge: v } })} />
          </>
        )}
        <div className="xc-actions">
          <button className="xc-btn red small" type="button" onClick={() => game.removeDistrict()}>
            Remove zoning
          </button>
        </div>
      </div>
    </section>
  );
}

function Toggle({ label, on, onChange, id }: { label: string; on: boolean; onChange: (v: boolean) => void; id?: string }) {
  return (
    <div className="xc-toggle">
      <span>{label}</span>
      <button type="button" className={`xc-switch${on ? " on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} data-testid={id} />
    </div>
  );
}

function Tile({ v, l }: { v: React.ReactNode; l: string }) {
  return (
    <div className="xc-tile">
      <b className="num">{v}</b>
      <small>{l}</small>
    </div>
  );
}

const DESIGN_USES: [BUse, string][] = [
  ["homes", "Homes"],
  ["mixed", "Homes + shops"],
  ["shops", "Shops"],
  ["jobs", "Offices"],
];

function DesignPanel({ game }: { game: Game }) {
  const s = game.s!;
  const plan = game.design!;
  const chk = game.designStats()!;
  const st = chk.st;
  const style = STYLES[plan.style];
  const [named, setNamed] = useState(false);
  const name = plan.name || (st.homes ? "Your building" : "Your building");
  const presets = [4, 7, 12, 20];
  const effects: string[] = [];
  if (st.loss.homes) effects.push(`Clears ${st.loss.homes} homes`);
  if (st.loss.jobs) effects.push(`${st.loss.jobs} jobs`);
  if (st.loss.people) effects.push(`${st.loss.people} people move out`);
  return (
    <section className="xc-panel xc-glass" data-testid="xc-designer">
      <div className="xc-panel-h">
        <div className="ic" aria-hidden>
          🏠
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          {named ? (
            <input
              autoFocus
              defaultValue={plan.name}
              maxLength={28}
              placeholder="Name it"
              onBlur={(e) => {
                game.editDesign({ name: e.target.value.trim() });
                setNamed(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "4px 8px", width: "100%" }}
            />
          ) : (
            <h3 onClick={() => setNamed(true)} style={{ cursor: "text" }}>
              {name} <span style={{ fontSize: 13, opacity: 0.6 }}>✎</span>
            </h3>
          )}
          <p>
            {style.name} · {plan.storeys} storeys
          </p>
        </div>
        <button className="x" type="button" onClick={() => game.closeDesigner()} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="xc-body">
        <div className="xc-storeys">
          {presets.map((p, i) => (
            <button key={p} type="button" className={`xc-sty${plan.storeys === p || (i === 3 && plan.storeys >= 20) ? " on" : ""}`} onClick={() => game.editDesign({ storeys: p })} data-testid={`xc-storeys-${p}`}>
              <i style={{ height: 8 + i * 14 }} />
              {i === 3 ? "20+" : p}
            </button>
          ))}
        </div>
        <div className="xc-step" style={{ justifyContent: "space-between" }}>
          <span className="xc-step">
            <button type="button" onClick={() => game.editDesign({ storeys: plan.storeys - 1 })} aria-label="One storey fewer" data-testid="xc-storey-down">
              −
            </button>
            <b className="num">{plan.storeys} storeys</b>
            <button type="button" onClick={() => game.editDesign({ storeys: plan.storeys + 1 })} aria-label="One storey more" data-testid="xc-storey-up">
              +
            </button>
          </span>
          <span className="muted num">{st.homes ? `${st.homes} homes` : `${st.jobs} jobs`}</span>
        </div>
        {st.over > 0 && <div className="xc-note">⚠️ {st.over} storeys taller than the zoning allows here ({st.zoned}). It costs clout.</div>}
        <div className="xc-sec">
          <h5>What&apos;s in it</h5>
          <div className="xc-scroll">
            {DESIGN_USES.map(([u, l]) => (
              <button key={u} className={`xc-chip${plan.use === u ? " on" : ""}`} type="button" onClick={() => game.editDesign({ use: u })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="xc-sec">
          <h5>Width</h5>
          <div className="xc-row">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} className={`xc-chip${plan.lots.length === n ? " on" : ""}`} type="button" onClick={() => game.editDesign({ width: n })} data-testid={`xc-width-${n}`}>
                {n} plot{n > 1 ? "s" : ""}
              </button>
            ))}
          </div>
        </div>
        <div className="xc-sec">
          <h5>Style</h5>
          <div className="xc-scroll">
            {STYLE_ORDER.map((k) => (
              <button key={k} className={`xc-chip${plan.style === k ? " on" : ""}`} type="button" disabled={STYLES[k].max < plan.storeys} onClick={() => game.editDesign({ style: k, color: "" })}>
                {STYLES[k].name}
              </button>
            ))}
          </div>
        </div>
        <div className="xc-sec">
          <h5>Roof</h5>
          <div className="xc-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {ROOF_ORDER.map((r) => (
              <button key={r} className={`xc-chip${plan.roof === r ? " on" : ""}`} type="button" onClick={() => game.editDesign({ roof: r })} data-testid={`xc-roof-${r}`} style={{ justifyContent: "center" }}>
                {ROOFS[r].name}
              </button>
            ))}
          </div>
        </div>
        <Toggle label="Bay windows" on={plan.bay} onChange={(v) => game.editDesign({ bay: v })} id="xc-bay" />
        <div className="xc-sec">
          <h5>Colour</h5>
          <div className="xc-swatches">
            {style.colors.map((c) => (
              <button key={c} type="button" className={`xc-sw${(plan.color || style.colors[0]) === c ? " on" : ""}`} style={{ background: c }} onClick={() => game.editDesign({ color: c })} aria-label={`Colour ${c}`} />
            ))}
          </div>
        </div>
        <div className="xc-tiles">
          <Tile v={st.homes} l="Homes" />
          <Tile v={st.people} l="People" />
          <Tile v={`${st.months} mo`} l="To build" />
          <div className="xc-tile">
            <Wanted d={st.demand === "wanted" ? 999 : st.demand === "some" ? 1 : -1} n={10} />
            <small>{st.homes ? "Homes" : "Space"}</small>
          </div>
        </div>
        {effects.length > 0 && <div className="xc-note no">🏚️ {effects.join(", ")}</div>}
        <div className="xc-kv">
          <span>Build cost</span>
          <span className="num">${fmt(st.cost + st.land)}</span>
          <span>Sells for</span>
          <span className="num">${fmt(st.value)}</span>
          <span>Rent per home</span>
          <span className="num">{st.homes ? `$${st.rent.toLocaleString()}/mo` : "—"}</span>
          <span>Quality</span>
          <span className="xc-stars">{stars(st.quality)}</span>
        </div>
        <div className="xc-cost">
          {st.clout > 0 && <span className="clout">✦{st.clout}</span>}
          <b className="num" style={{ fontSize: 18 }}>
            {st.net >= 0 ? `+ $${st.net.toLocaleString()}` : `City earns $${(-st.net).toLocaleString()}`}
          </b>
          <span className="dim" style={{ fontSize: 11.5, width: "100%" }}>
            You have ✦{s.clout} and ${fmt(s.money)}
          </span>
        </div>
        {chk.why && <div className="xc-note no">{chk.why}</div>}
        <div className="xc-actions">
          <button className="xc-btn grow" type="button" onClick={() => game.closeDesigner()}>
            Cancel
          </button>
          <button className="xc-btn white grow" type="button" disabled={!!chk.why} onClick={() => game.build()} data-testid="xc-build">
            Build
          </button>
        </div>
      </div>
    </section>
  );
}

function describe(a: Application, game: Game) {
  const s = game.s!;
  const l = s.lots[a.plan.lots[0]];
  const b = l && l.bld >= 0 ? s.buildings[l.bld] : null;
  const what = a.plan.use === "jobs" ? "offices" : a.plan.use === "mixed" ? "apartments over shops" : a.plan.use === "shops" ? "shops" : "apartments";
  const lo = Math.max(1, a.plan.storeys - 4);
  return `${b ? `Replace ${b.form === "house" ? "a house" : `${b.name}`}` : "Build on an empty plot"} with ${what}, ${lo}–${a.plan.storeys} storeys`;
}

function AgendaPanel({ game }: { game: Game }) {
  const s = game.s!;
  const [open, setOpen] = useState<number | null>(null);
  const [haggle, setHaggle] = useState<number | null>(null);
  return (
    <section className="xc-panel xc-glass" data-testid="xc-agenda">
      <Header icon="📋" title={`${MONTHS[s.month % 12]} agenda`} sub={`${s.apps.length} awaiting review`} onClose={() => game.openPanel(null)} />
      <div className="xc-body">
        {!s.apps.length && <p className="xc-hint">Nothing to decide. When rents climb, developers will come to you with plans bigger than the zoning allows.</p>}
        {s.apps.map((a) => {
          const st = planStats(s, a.plan);
          return (
            <div key={a.id} className="xc-agenda-card" data-testid={`xc-app-${a.id}`}>
              <div className="by">
                <span>{a.dev}</span>
                <span>Submitted {dateLabel(a.submitted, MONTHS).replace(",", "")}</span>
              </div>
              <h4>{a.plan.name}</h4>
              <div className="what">{describe(a, game)}</div>
              <div className="xc-tiles">
                <Tile v={<span className="good">+{a.homes || a.jobs}</span>} l={a.homes ? "homes" : "jobs"} />
                <Tile v={<span className="good">+${fmt(st.tax)}</span>} l="tax a year" />
                <Tile v={a.homesLost} l="homes lost" />
                <Tile v={PARKING_NAMES[a.plan.parking]} l="parking" />
              </div>
              <div className={`xc-note ${a.lean}`}>
                {a.lean === "no" ? "👎" : "👍"} <span>
                  <b>Planners lean {a.lean}.</b> {a.reason[0].toUpperCase() + a.reason.slice(1)}.
                </span>
              </div>
              <div className="xc-actions">
                <button className={`xc-btn icon small${game.viewingApp === a.id ? " white" : ""}`} type="button" onClick={() => game.viewApp(game.viewingApp === a.id ? -1 : a.id)} aria-label="Show it on the map" data-testid={`xc-app-view-${a.id}`}>
                  👁
                </button>
                <button className="xc-btn blue small grow" type="button" onClick={() => game.decide(a.id, true)} data-testid={`xc-app-approve-${a.id}`}>
                  ✓ Approve
                </button>
                <button className="xc-btn small grow" type="button" onClick={() => game.decide(a.id, false)} data-testid={`xc-app-deny-${a.id}`}>
                  Deny
                </button>
              </div>
              <div className="xc-actions">
                <button className="xc-btn tiny" type="button" disabled={a.changed} onClick={() => setHaggle(haggle === a.id ? null : a.id)} data-testid={`xc-app-terms-${a.id}`}>
                  ⚙ Change terms
                </button>
                <button className="xc-btn tiny" type="button" onClick={() => setOpen(open === a.id ? null : a.id)}>
                  {open === a.id ? "Fewer details" : "More details"}
                </button>
              </div>
              {haggle === a.id && (
                <div className="xc-terms">
                  {(Object.keys(TERMS) as Term[]).map((t) => (
                    <button
                      key={t}
                      className="xc-btn tiny"
                      type="button"
                      onClick={() => {
                        setHaggle(null);
                        game.terms(a.id, t);
                      }}
                      data-testid={`xc-term-${t}`}
                    >
                      {TERMS[t]}
                    </button>
                  ))}
                </div>
              )}
              {open === a.id && (
                <div className="xc-kv">
                  <span>Storeys</span>
                  <span>
                    {a.plan.storeys} (zoned {a.zoned})
                  </span>
                  <span>Style</span>
                  <span>{STYLES[a.plan.style].name}</span>
                  <span>Roof</span>
                  <span>{ROOFS[a.plan.roof].name}</span>
                  <span>Affordable</span>
                  <span>{a.plan.affordable}%</span>
                  <span>Rent per home</span>
                  <span>{st.homes ? `$${st.rent.toLocaleString()}/mo` : "—"}</span>
                  <span>Jobs lost</span>
                  <span>{a.jobsLost}</span>
                  <span>Built in</span>
                  <span>about {st.months} months</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BuildingPanel({ game }: { game: Game }) {
  const s = game.s!;
  const b = game.selectedBuilding;
  if (!b) return null;
  const civic = b.use === "civic";
  const forms: Record<string, string> = { house: "House", townhouse: "Townhouses", walkup: "Walk-up apartments", midrise: "Mid-rise apartments", highrise: "High-rise", tower: "Tower", shop: "Shops", office: "Offices", workshop: "Workshop", civic: civic ? CIVICS[b.civic ?? "park"].name : "Civic", farmhouse: "Farmstead" };
  const l = s.lots[b.lots[0]];
  const d = l && l.district >= 0 ? s.districts[l.district] : null;
  return (
    <section className="xc-panel xc-glass" data-testid="xc-building">
      <Header icon={civic ? CIVICS[b.civic ?? "park"].icon : b.homes ? "🏠" : "🏢"} title={b.name} sub={`${forms[b.form]} · ${STYLES[b.style].name} · ${b.storeys} storeys`} onClose={() => game.openPanel(null)} />
      <div className="xc-body">
        {!b.done && (
          <div className="xc-note">
            🏗️ Being built: {Math.round(b.progress * 100)}% done, about {Math.max(1, Math.ceil((1 - b.progress) * b.months))} months to go.
          </div>
        )}
        <div className="xc-tiles">
          <Tile v={b.homes} l="homes" />
          <Tile v={b.jobs} l="jobs" />
          <Tile v={<span className="xc-stars" style={{ fontSize: 13 }}>{stars(b.quality)}</span>} l="quality" />
        </div>
        <div className="xc-kv">
          <span>Started</span>
          <span>{dateLabel(b.started, MONTHS)}</span>
          {d && (
            <>
              <span>District</span>
              <span>
                {d.name} ({USES[d.use].name}
                {USES[d.use].bands[0] > 0 ? `, ${BANDS[d.band].label}` : ""})
              </span>
            </>
          )}
          <span>Roof</span>
          <span>{ROOFS[b.roof].name}</span>
          <span>Parking</span>
          <span>{PARKING_NAMES[b.parking]}</span>
          {b.city && (
            <>
              <span>Built by</span>
              <span>The city</span>
            </>
          )}
        </div>
        <div className="xc-actions">
          {!civic && b.done && (
            <button className="xc-btn white grow" type="button" onClick={() => game.openDesigner(b.lots[0], b.lots.length)} data-testid="xc-redesign">
              ✏️ Redesign
            </button>
          )}
          {d && (
            <button
              className="xc-btn grow"
              type="button"
              onClick={() => game.showDistrict(d.id)}
            >
              Zoning
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <p className="xc-hint">A few months of history will show here.</p>;
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 300},${54 - ((v - lo) / Math.max(1, hi - lo)) * 48}`).join(" ");
  return (
    <svg className="xc-spark" viewBox="0 0 300 56" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function CityPanel({ game }: { game: Game }) {
  const s = game.s!;
  const st = s.stats;
  const [tab, setTab] = useState<"overview" | "budget" | "travel">("overview");
  const next = MILESTONES[s.milestone + 1];
  const B = s.budget;
  const income = B.tax + B.farms + B.fees;
  const spend = B.roads + Math.max(0, B.transit) + B.civic + B.services;
  const modes: [string, number, string][] = [
    ["Car", s.modes.car, "#8b9096"],
    ["Tram", s.modes.transit, "#e0503c"],
    ["Bike", s.modes.bike, "#34c77b"],
    ["Walk", s.modes.walk, "#5fb7ff"],
  ];
  return (
    <section className="xc-panel xc-glass" data-testid="xc-city">
      <Header icon="📊" title={s.name} sub={`${MILESTONES[s.milestone].name}${next ? ` · ${next.name} at ${next.pop.toLocaleString()} people` : ""}`} onClose={() => game.openPanel(null)} />
      <div className="xc-tabs">
        {(["overview", "budget", "travel"] as const).map((t) => (
          <button key={t} type="button" className={tab === t ? "on" : ""} onClick={() => setTab(t)} data-testid={`xc-city-${t}`}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="xc-body">
        {tab === "overview" && (
          <>
            <div className="xc-tiles">
              <Tile v={st.pop.toLocaleString()} l="people" />
              <Tile v={st.homes.toLocaleString()} l="homes" />
              <Tile v={st.jobs.toLocaleString()} l="jobs" />
              <Tile v={`${Math.round(s.approval)}%`} l="approval" />
            </div>
            <div className="xc-sec">
              <h5>What&apos;s wanted</h5>
              <div className="xc-kv">
                <span>Homes</span>
                <Wanted d={st.homeDemand} n={st.homes} />
                <span>Workplaces</span>
                <Wanted d={st.jobDemand} n={st.jobs} />
                <span>Shops</span>
                <Wanted d={st.shopDemand} n={st.shopJobs} />
              </div>
            </div>
            <div className="xc-sec">
              <h5>Average rent · ${Math.round(1350 * s.rentIndex).toLocaleString()}/month</h5>
              <Spark data={s.history.slice(-60).map((h) => h.rent)} color="#ff6a5f" />
            </div>
            <div className="xc-sec">
              <h5>People</h5>
              <Spark data={s.history.slice(-60).map((h) => h.pop)} color="#34c77b" />
            </div>
            <div className="xc-kv">
              <span>Households</span>
              <span className="num">{s.households.toLocaleString()}</span>
              <span>Empty homes</span>
              <span className="num">{Math.max(0, st.homes - s.households).toLocaleString()}</span>
              <span>Being built</span>
              <span className="num">{st.building}</span>
              <span>Homes built so far</span>
              <span className="num">{s.homesBuilt.toLocaleString()}</span>
            </div>
          </>
        )}
        {tab === "budget" && (
          <>
            <div className="xc-tiles">
              <Tile v={`$${fmt(s.money)}`} l="in the bank" />
              <Tile v={<span className={income - spend >= 0 ? "good" : "bad"}>${fmt(income - spend)}</span>} l="last month" />
            </div>
            <div className="xc-kv">
              <span>Property tax</span>
              <span className="num good">+${fmt(B.tax)}</span>
              <span>Farm income</span>
              <span className="num good">+${fmt(B.farms)}</span>
              <span>Permit fees</span>
              <span className="num good">+${fmt(B.fees)}</span>
              <span>Road upkeep</span>
              <span className="num bad">−${fmt(B.roads)}</span>
              <span>Trams (less fares)</span>
              <span className="num bad">{B.transit >= 0 ? `−$${fmt(B.transit)}` : `+$${fmt(-B.transit)}`}</span>
              <span>Schools, parks, clinics</span>
              <span className="num bad">−${fmt(B.civic)}</span>
              <span>City services</span>
              <span className="num bad">−${fmt(B.services)}</span>
            </div>
            <div className="xc-sec">
              <h5>Property tax rate</h5>
              <div className="xc-step">
                <button type="button" onClick={() => game.setTax(s.taxRate - 0.1)} aria-label="Lower tax">
                  −
                </button>
                <b className="num">{s.taxRate.toFixed(1)}% a year</b>
                <button type="button" onClick={() => game.setTax(s.taxRate + 0.1)} aria-label="Raise tax">
                  +
                </button>
              </div>
              <p className="xc-hint" style={{ marginTop: 6 }}>
                Higher taxes fill the coffers and cost you approval.
              </p>
            </div>
          </>
        )}
        {tab === "travel" && (
          <>
            <div className="xc-sec">
              <h5>How people get to work</h5>
              <div className="xc-bars">
                {modes.map(([k, v, c]) => (
                  <i key={k} style={{ width: `${v * 100}%`, background: c }} />
                ))}
              </div>
              <div className="xc-legend" style={{ marginTop: 6 }}>
                {modes.map(([k, v, c]) => (
                  <span key={k}>
                    <b style={{ background: c }} />
                    {k} {Math.round(v * 100)}%
                  </span>
                ))}
              </div>
            </div>
            <div className="xc-kv">
              <span>Traffic</span>
              <span className={s.congestion > 0.4 ? "bad" : s.congestion > 0.1 ? "warn" : "good"}>{s.congestion > 0.8 ? "Gridlock" : s.congestion > 0.4 ? "Heavy" : s.congestion > 0.1 ? "Busy" : "Flowing"}</span>
              <span>Tram lines</span>
              <span>{Math.round(s.edges.reduce((a, e) => a + (e?.tram ? e.len : 0), 0) / 100) / 10} km</span>
              <span>Bike lanes</span>
              <span>{Math.round(s.edges.reduce((a, e) => a + (e?.bike ? e.len : 0), 0) / 100) / 10} km</span>
            </div>
            <p className="xc-hint">Cater to cars, bikes or transit. Trams need avenues; homes near a stop are worth more, and fewer people drive.</p>
          </>
        )}
      </div>
    </section>
  );
}

function HelpPanel({ game }: { game: Game }) {
  return (
    <section className="xc-panel xc-glass" data-testid="xc-help">
      <Header icon="☰" title="XCity" sub="You're the city planner." onClose={() => game.openPanel(null)} />
      <div className="xc-body">
        <div className="xc-kv" style={{ gridTemplateColumns: "auto 1fr" }}>
          <span>🗺️ Zone</span>
          <span>Drag over the fields to zone homes, shops or offices, how tall, and lay out the streets: grid, curvy, cul-de-sac or superblock.</span>
          <span>⬆️ Upzone</span>
          <span>Rents climbing? Let an area build taller. Developers do the rest.</span>
          <span>✏️ Design</span>
          <span>Draw up your own building on any plot, even taller than the zoning (for clout).</span>
          <span>📋 Agenda</span>
          <span>Developers pitch projects. Approve, deny or change the terms.</span>
          <span>🚋 Transit</span>
          <span>Bike lanes, avenues and tram lines.</span>
          <span>Camera</span>
          <span>Drag to move, pinch or scroll to zoom, two fingers (or right-drag) to turn and tilt.</span>
        </div>
        <div className="xc-sec">
          <h5>Graphics</h5>
          <div className="xc-row">
            {(["low", "medium", "high"] as const).map((q) => (
              <button key={q} className={`xc-chip${game.quality === q ? " on" : ""}`} type="button" onClick={() => game.setQuality(q)}>
                {q[0].toUpperCase() + q.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="xc-actions">
          <button className="xc-btn grow" type="button" onClick={() => game.persist()}>
            Save
          </button>
          <button className="xc-btn white grow" type="button" onClick={() => game.quitToTitle()} data-testid="xc-quit">
            Save & quit
          </button>
        </div>
      </div>
    </section>
  );
}
