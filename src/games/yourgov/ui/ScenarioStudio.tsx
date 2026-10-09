import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { COUNTRY_LIST, realCountry } from "../countries";
import { LAWS } from "../data";
import type { Game } from "../game";
import { MAP_H, MAP_W, mapReady, prepareMap, SHAPES, type GenMap, type Shape } from "../map";
import { checkParty, checkScenario, EXEC_KINDS, LOWER_SYSTEMS, MAX_PARTIES, shareCode, UPPER_KINDS, type ExecKind, type LowerSystem, type PartyDef, type Scenario, type UpperKind } from "../scenario";
import * as G from "../sim";
import { CompassPad } from "./LawStudio";
import { Icon } from "./icons";
import { STATE_TINTS } from "./mapColors";

type TabId = "map" | "parties" | "system" | "economy" | "share";
const TABS: { id: TabId; label: string }[] = [
  { id: "map", label: "Country & map" },
  { id: "parties", label: "Parties" },
  { id: "system", label: "Political system" },
  { id: "economy", label: "Economy & laws" },
  { id: "share", label: "Share" },
];

const PALETTE = ["#e0453a", "#3d6fd8", "#f0b429", "#34b25a", "#9b4fd6", "#ff7a1a", "#14a3a3", "#e255a1", "#7b8794", "#1f3a8a", "#a3c93a", "#8d5524"];

/** A labelled slider with its value. */
function Num({ label, value, min, max, step = 1, onChange, fmt = (v: number) => String(v), testId }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string; testId?: string }) {
  return (
    <label className="yg-num">
      <span>
        {label}
        <b>{fmt(value)}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} data-testid={testId} />
    </label>
  );
}

function Text({ label, value, onChange, max = 40, testId, placeholder }: { label: string; value: string; onChange: (v: string) => void; max?: number; testId?: string; placeholder?: string }) {
  return (
    <label className="yg-field">
      <span>{label}</span>
      <input className="yg-input" value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
    </label>
  );
}

function Pick<T extends string>({ label, value, options, onChange, testId }: { label: string; value: T; options: { id: T; name: string; about?: string }[]; onChange: (v: T) => void; testId?: string }) {
  const cur = options.find((o) => o.id === value);
  return (
    <div className="yg-field">
      <span>{label}</span>
      <div className="yg-seg wrap" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)} data-testid={testId ? `${testId}-${o.id}` : undefined}>
            {o.name}
          </button>
        ))}
      </div>
      {cur?.about && <small className="yg-muted">{cur.about}</small>}
    </div>
  );
}

function Toggle({ label, hint, value, onChange, testId }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="yg-switch">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <i />
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

const Box = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="yg-studio-box">
    <p className="yg-label">{title}</p>
    {children}
  </div>
);

/** The map drawn small: each region in its own tint over the sea (neighbours grey). */
function MapPreview({ sc, version }: { sc: Scenario; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const c = useMemo(() => {
    try {
      return G.country(sc);
    } catch {
      return null;
    }
  }, [sc, version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !c) return;
    cv.width = MAP_W;
    cv.height = MAP_H;
    const g = cv.getContext("2d")!;
    const img = g.createImageData(MAP_W, MAP_H);
    const tints = STATE_TINTS.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      const l = c.labels[i];
      let col = [28, 58, 96];
      if (l >= 0) {
        const t = tints[c.sections[l].state % tints.length];
        const edge = c.stateEdge[i] ? 0.62 : 1;
        col = t.map((v) => v * edge);
      } else if (c.foreign?.[i]) col = [92, 96, 100];
      img.data[i * 4] = col[0];
      img.data[i * 4 + 1] = col[1];
      img.data[i * 4 + 2] = col[2];
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = "#fff";
    g.font = "bold 9px sans-serif";
    g.textAlign = "center";
    for (const st of c.states) if (st.sections.length > 3) g.fillText(st.name.slice(0, 14), st.cx, st.cy);
  }, [c]);
  return (
    <div className="yg-mappreview">
      <canvas ref={ref} aria-label="Map preview" data-testid="yg-map-preview" />
      {!c && <span className="yg-muted small">Loading the map…</span>}
    </div>
  );
}

const blankParty = (taken: string[], i: number): PartyDef => {
  const p = checkParty({ name: `New Party ${i + 1}`, short: `NP${i + 1}`, color: PALETTE[i % PALETTE.length], pos: { e: 0, s: 0 }, ideology: "Centrism", base: 0.1 }, taken);
  return p as PartyDef;
};

/** The scenario studio: make a whole country of your own, or rework one. */
export function ScenarioStudio({ g, initial, onClose, onSaved }: { g: Game; initial: Scenario; onClose: () => void; onSaved: (sc: Scenario) => void }) {
  const [sc, setSc] = useState<Scenario>(() => structuredClone(initial));
  const [tab, setTab] = useState<TabId>("map");
  const [sel, setSel] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [copied, setCopied] = useState(false);
  // The map preview builds from a debounced copy of the map settings.
  const [mapSc, setMapSc] = useState(sc);
  useEffect(() => {
    const t = setTimeout(() => setMapSc(structuredClone(sc)), 250);
    return () => clearTimeout(t);
  }, [sc.map]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mapReady(mapSc.map)) return;
    prepareMap(mapSc.map).then(() => setVersion((v) => v + 1));
  }, [mapSc]);

  const up = (f: (x: Scenario) => void) =>
    setSc((cur) => {
      const next = structuredClone(cur);
      f(next);
      return next;
    });
  const regions = useMemo(() => {
    try {
      return G.country(mapSc).states.map((st) => ({ key: st.key, name: st.name }));
    } catch {
      return [];
    }
  }, [mapSc, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const checked = useMemo(() => checkScenario(sc), [sc]);
  const sy = sc.system;
  const party = sc.parties[sel] ?? sc.parties[0];
  const gen = sc.map.kind === "gen" ? sc.map : null;
  const setGen = (f: (m: GenMap) => void) =>
    up((x) => {
      if (x.map.kind === "gen") f(x.map);
    });

  const save = () => {
    const e = g.saveScenario(sc);
    if (e) return setErr(e);
    onSaved(g.library.find((x) => x.id === sc.id) ?? g.library[g.library.length - 1]);
  };

  return (
    <div className="yg-modal-back" role="presentation">
      <section className="yg-glass yg-modal huge" role="dialog" aria-modal="true" aria-label="Scenario studio" data-testid="yg-scenario-studio">
        <header className="yg-modal-head">
          <div>
            <p className="yg-eyebrow">Scenario studio</p>
            <h2>{sc.name || "Untitled"}</h2>
          </div>
          <button type="button" className="yg-btn icon" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <nav className="yg-studio-tabs">
          <div className="yg-seg wrap" role="radiogroup" aria-label="Studio sections">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={tab === t.id} onClick={() => setTab(t.id)} data-testid={`yg-st-${t.id}`}>
                {t.label}
              </button>
            ))}
          </div>
        </nav>
        <div className="yg-modal-body">
          {tab === "map" && (
            <div className="yg-studio">
              <div className="yg-col">
                <Text label="Country name" value={sc.name} onChange={(v) => up((x) => ((x.name = v), x.map.kind === "gen" && (x.map.name = v)))} testId="yg-sc-name" />
                <Text label="One line about it" value={sc.about ?? ""} max={140} onChange={(v) => up((x) => (x.about = v))} placeholder="Optional" />
                <div className="yg-field">
                  <span>The land</span>
                  <select
                    className="yg-input"
                    value={sc.map.kind === "real" ? sc.map.code : "gen"}
                    onChange={(e) => {
                      const v = e.target.value;
                      up((x) => {
                        // Regional parties and regional shares belong to the old map's regions.
                        for (const p of x.parties) {
                          p.only = undefined;
                          p.regional = undefined;
                        }
                        if (v === "gen") x.map = { kind: "gen", seed: Math.floor(Math.random() * 1e6) + 1, name: x.name, shape: "continent", regions: 12, counties: 900, mountains: 0.5, lakes: 0.4, cities: 20 };
                        else {
                          const real = realCountry(v)!;
                          x.map = real.map;
                          // A real map's seats per region (and starting make-up) belong to that country.
                          x.system.lower.fixed = undefined;
                          x.system.upper.regionSeats = undefined;
                          x.start = undefined;
                        }
                      });
                    }}
                    data-testid="yg-sc-land"
                  >
                    <option value="gen">A made-up country (generated)</option>
                    {COUNTRY_LIST.map((c) => (
                      <option key={c.code} value={c.code}>
                        The map of {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                {gen && (
                  <>
                    <Pick<Shape> label="Shape" value={gen.shape} options={SHAPES} onChange={(v) => setGen((m) => (m.shape = v))} testId="yg-sc-shape" />
                    <Num label="Regions" value={gen.regions} min={3} max={30} onChange={(v) => setGen((m) => (m.regions = v))} testId="yg-sc-regions" />
                    <Num label="Counties" value={gen.counties} min={300} max={1400} step={50} onChange={(v) => setGen((m) => (m.counties = v))} />
                    <Num label="Mountains" value={gen.mountains} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setGen((m) => (m.mountains = v))} />
                    <Num label="Lakes" value={gen.lakes} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setGen((m) => (m.lakes = v))} />
                    <Num label="Big cities" value={gen.cities} min={6} max={40} onChange={(v) => setGen((m) => (m.cities = v))} />
                    <button type="button" className="yg-btn" onClick={() => setGen((m) => (m.seed = Math.floor(Math.random() * 1e6) + 1))} data-testid="yg-sc-reroll">
                      <Icon name="map" size={15} /> Another map like this
                    </button>
                  </>
                )}
              </div>
              <div className="yg-col">
                <MapPreview sc={mapSc} version={version} />
                {gen && regions.length > 0 && (
                  <Box title="Region names">
                    <div className="yg-regionnames">
                      {regions.map((r, i) => (
                        <input
                          key={r.key}
                          className="yg-input"
                          value={gen.names?.[i] ?? r.name}
                          maxLength={24}
                          aria-label={`Region ${i + 1} name`}
                          onChange={(e) =>
                            setGen((m) => {
                              const names = [...(m.names ?? regions.map((x) => x.name))];
                              names[i] = e.target.value;
                              m.names = names;
                            })
                          }
                        />
                      ))}
                    </div>
                  </Box>
                )}
                {!gen && <p className="yg-muted small">The real outlines, cities and mountains. Its regions keep their real names and populations.</p>}
              </div>
            </div>
          )}

          {tab === "parties" && (
            <div className="yg-studio">
              <div className="yg-col">
                <div className="yg-partylist">
                  {sc.parties.map((p, i) => (
                    <button key={p.id} type="button" className={`yg-row btn${sel === i ? " on" : ""}`} onClick={() => setSel(i)} data-testid={`yg-sp-${i}`}>
                      <span className="yg-sw" style={{ background: p.color }} />
                      <span className="grow">
                        {p.name}
                        {p.noRun && <span className="yg-tag">no elections</span>}
                        {p.only && <span className="yg-tag">regional</span>}
                      </span>
                      <span className="r muted">{p.noRun ? "" : `${Math.round(p.base * 100)}%`}</span>
                    </button>
                  ))}
                </div>
                <div className="yg-chips">
                  <button
                    type="button"
                    className="yg-btn small"
                    disabled={sc.parties.length >= MAX_PARTIES}
                    onClick={() => {
                      up((x) => x.parties.push(blankParty(x.parties.map((q) => q.id), x.parties.length)));
                      setSel(sc.parties.length);
                    }}
                    data-testid="yg-sp-add"
                  >
                    <Icon name="plus" size={15} /> Add a party
                  </button>
                  <button
                    type="button"
                    className="yg-btn small"
                    disabled={sc.parties.length <= 2}
                    onClick={() => {
                      up((x) => {
                        const gone = x.parties[sel].id;
                        x.parties.splice(sel, 1);
                        for (const q of x.parties) q.refuses = q.refuses?.filter((r) => r !== gone);
                        if (x.start) x.start = { pres: x.start.pres === gone ? undefined : x.start.pres, gov: x.start.gov?.filter((r) => r !== gone) };
                      });
                      setSel(0);
                    }}
                  >
                    <Icon name="trash" size={15} /> Remove
                  </button>
                </div>
                <p className="yg-muted small">Starting shares are relative: they&apos;re scaled to add up. Parties can stand everywhere or only in some regions.</p>
              </div>
              {party && (
                <div className="yg-col" key={party.id}>
                  <div className="yg-partyedit">
                    <Text label="Name" value={party.name} onChange={(v) => up((x) => (x.parties[sel].name = v))} testId="yg-sp-name" />
                    <div className="yg-two">
                      <Text label="Short" value={party.short} max={6} onChange={(v) => up((x) => (x.parties[sel].short = v))} testId="yg-sp-short" />
                      <label className="yg-field">
                        <span>Colour</span>
                        <input type="color" className="yg-color" value={party.color} onChange={(e) => up((x) => (x.parties[sel].color = e.target.value))} aria-label="Party colour" data-testid="yg-sp-color" />
                      </label>
                    </div>
                    <Text label="Ideology" value={party.ideology} max={32} onChange={(v) => up((x) => (x.parties[sel].ideology = v))} />
                  </div>
                  <div className="yg-two">
                    <div className="yg-field">
                      <span>Where it stands</span>
                      <CompassPad value={party.pos} onChange={(pos) => up((x) => (x.parties[sel].pos = pos))} parties={sc.parties.filter((_, i) => i !== sel)} color={party.color} label="Where the party stands: left to right, liberal to conservative" testId="yg-sp-pad" />
                    </div>
                    <div className="yg-col">
                      {!party.noRun && <Num label="Starting share" value={Math.round(party.base * 100)} min={0} max={60} fmt={(v) => `${v}%`} onChange={(v) => up((x) => (x.parties[sel].base = v / 100))} testId="yg-sp-base" />}
                      <Toggle label="Doesn't stand in elections" hint="Crossbenchers, appointed independents" value={!!party.noRun} onChange={(v) => up((x) => (x.parties[sel].noRun = v || undefined))} />
                      <Toggle label="Regional party" hint="Stands only in the regions you pick" value={!!party.only} onChange={(v) => up((x) => (x.parties[sel].only = v ? regions.slice(0, 1).map((r) => r.key) : undefined))} testId="yg-sp-regional" />
                    </div>
                  </div>
                  {party.only && (
                    <Box title="Stands in">
                      <div className="yg-chips">
                        {regions.map((r) => (
                          <button
                            key={r.key}
                            type="button"
                            className={`yg-chipbtn${party.only!.includes(r.key) ? " on" : ""}`}
                            onClick={() =>
                              up((x) => {
                                const o = new Set(x.parties[sel].only ?? []);
                                if (o.has(r.key)) o.delete(r.key);
                                else o.add(r.key);
                                x.parties[sel].only = o.size ? [...o] : [r.key];
                              })
                            }
                          >
                            {r.name}
                          </button>
                        ))}
                      </div>
                    </Box>
                  )}
                  <Box title="Won't govern with">
                    <div className="yg-chips">
                      {sc.parties
                        .filter((_, i) => i !== sel)
                        .map((q) => (
                          <button
                            key={q.id}
                            type="button"
                            className={`yg-chipbtn${party.refuses?.includes(q.id) ? " on bad" : ""}`}
                            onClick={() =>
                              up((x) => {
                                const r = new Set(x.parties[sel].refuses ?? []);
                                if (r.has(q.id)) r.delete(q.id);
                                else r.add(q.id);
                                x.parties[sel].refuses = r.size ? [...r] : undefined;
                              })
                            }
                          >
                            <i style={{ background: q.color }} /> {q.short}
                          </button>
                        ))}
                    </div>
                  </Box>
                  <Text label="Alliance (shared candidates, governs together)" value={party.bloc ?? ""} max={12} placeholder="e.g. left" onChange={(v) => up((x) => (x.parties[sel].bloc = v || undefined))} />
                </div>
              )}
            </div>
          )}

          {tab === "system" && (
            <div className="yg-studio">
              <div className="yg-col">
                <Pick<ExecKind>
                  label="Government"
                  value={sy.exec}
                  options={EXEC_KINDS}
                  onChange={(v) =>
                    up((x) => {
                      x.system.exec = v;
                      x.system.pres = v === "parliamentary" ? null : (x.system.pres ?? { term: 4, next: x.startYear + 2, week: 45, runoff: true, college: false });
                      if (v === "presidential") x.system.titles.head = "President";
                      else if (x.system.titles.head === "President") x.system.titles.head = "Prime Minister";
                    })
                  }
                  testId="yg-sy-exec"
                />
                <div className="yg-two">
                  <Text label="Head of government" value={sy.titles.head} max={32} onChange={(v) => up((x) => (x.system.titles.head = v))} />
                  <Text label="Party leader title" value={sy.titles.leader} max={32} onChange={(v) => up((x) => (x.system.titles.leader = v))} />
                </div>
                <div className="yg-two">
                  <Text label="A region is a…" value={sy.titles.region} max={24} onChange={(v) => up((x) => (x.system.titles.region = v))} />
                  <Text label="Plural" value={sy.titles.regions} max={32} onChange={(v) => up((x) => (x.system.titles.regions = v))} />
                </div>
                <Text label="Head of a region" value={sy.titles.regionHead} max={32} onChange={(v) => up((x) => (x.system.titles.regionHead = v))} />
                {sy.pres && (
                  <Box title={sy.titles.president}>
                    <Num label="Term (years)" value={sy.pres.term} min={2} max={8} onChange={(v) => up((x) => (x.system.pres!.term = v))} />
                    <Toggle label="Run-off" hint="Without a majority, the top two meet again" value={sy.pres.runoff} onChange={(v) => up((x) => (x.system.pres!.runoff = v))} />
                    <Toggle label="Electoral college" hint="Each region's electors go to its winner" value={sy.pres.college} onChange={(v) => up((x) => (x.system.pres!.college = v))} />
                    {sy.exec === "presidential" && <Num label="Veto override" value={Math.round(sy.override * 100)} min={50} max={90} fmt={(v) => `${v}%`} onChange={(v) => up((x) => (x.system.override = v / 100))} />}
                  </Box>
                )}
                <Toggle label="Compulsory voting" value={!!sy.compulsory} onChange={(v) => up((x) => (x.system.compulsory = v || undefined))} />
                <Pick<"hemicycle" | "westminster">
                  label="Chamber"
                  value={sy.layout ?? "hemicycle"}
                  options={[
                    { id: "hemicycle", name: "Horseshoe" },
                    { id: "westminster", name: "Westminster benches" },
                  ]}
                  onChange={(v) => up((x) => (x.system.layout = v))}
                />
              </div>
              <div className="yg-col">
                <Box title="Lower house">
                  <div className="yg-two">
                    <Text label="Name" value={sy.lower.name} onChange={(v) => up((x) => (x.system.lower.name = v))} testId="yg-sy-lower-name" />
                    <Text label="Members are" value={sy.lower.member} max={24} onChange={(v) => up((x) => (x.system.lower.member = v))} />
                  </div>
                  <Text label="Short name" value={sy.lower.short} max={20} onChange={(v) => up((x) => (x.system.lower.short = v))} />
                  <Num
                    label="Seats"
                    value={sy.lower.seats}
                    min={20}
                    max={800}
                    step={1}
                    onChange={(v) =>
                      up((x) => {
                        x.system.lower.seats = v;
                        // Seat counts fixed region by region no longer add up: keep only the regions with none.
                        if (x.system.lower.fixed) x.system.lower.fixed = Object.fromEntries(Object.entries(x.system.lower.fixed).filter(([, n]) => n === 0));
                      })
                    }
                    testId="yg-sy-seats"
                  />
                  <div className="yg-field">
                    <span>Elected by</span>
                    <select className="yg-input" value={sy.lower.system} onChange={(e) => up((x) => (x.system.lower.system = e.target.value as LowerSystem))} data-testid="yg-sy-system">
                      {LOWER_SYSTEMS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                    <small className="yg-muted">{LOWER_SYSTEMS.find((o) => o.id === sy.lower.system)?.about}</small>
                  </div>
                  {(sy.lower.system === "pr" || sy.lower.system === "mmp" || sy.lower.system === "parallel") && <Num label="Threshold" value={Math.round(sy.lower.threshold * 100)} min={0} max={15} fmt={(v) => `${v}%`} onChange={(v) => up((x) => (x.system.lower.threshold = v / 100))} />}
                  {(sy.lower.system === "mmp" || sy.lower.system === "parallel") && <Num label="List seats" value={Math.round(sy.lower.listShare * 100)} min={10} max={90} fmt={(v) => `${v}%`} onChange={(v) => up((x) => (x.system.lower.listShare = v / 100))} />}
                  <Num label="Term (years)" value={sy.lower.term} min={1} max={7} onChange={(v) => up((x) => (x.system.lower.term = v))} />
                </Box>
                <Box title="Upper house">
                  <div className="yg-field">
                    <span>Kind</span>
                    <select
                      className="yg-input"
                      value={sy.upper.kind}
                      onChange={(e) =>
                        up((x) => {
                          const k = e.target.value as UpperKind;
                          x.system.upper.kind = k;
                          if (k === "appointed" && x.system.upper.seats < 10) x.system.upper.seats = Math.round(x.system.lower.seats / 2);
                          if ((k === "elected" || k === "indirect") && x.system.upper.perRegion === 0 && !x.system.upper.seats) x.system.upper.perRegion = 2;
                        })
                      }
                      data-testid="yg-sy-upper"
                    >
                      {UPPER_KINDS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                    <small className="yg-muted">{UPPER_KINDS.find((o) => o.id === sy.upper.kind)?.about}</small>
                  </div>
                  {sy.upper.kind !== "none" && (
                    <>
                      <div className="yg-two">
                        <Text label="Name" value={sy.upper.name} onChange={(v) => up((x) => (x.system.upper.name = v))} />
                        <Text label="Members are" value={sy.upper.member} max={24} onChange={(v) => up((x) => (x.system.upper.member = v))} />
                      </div>
                      <Text label="Short name" value={sy.upper.short} max={20} onChange={(v) => up((x) => (x.system.upper.short = v))} />
                      {sy.upper.kind === "appointed" ? (
                        <Num label="Members" value={sy.upper.seats} min={20} max={900} onChange={(v) => up((x) => ((x.system.upper.seats = v), (x.system.upper.makeup = undefined)))} />
                      ) : (
                        sy.upper.kind !== "council" && (
                          <Num
                            label="Seats per region"
                            value={sy.upper.perRegion}
                            min={0}
                            max={12}
                            fmt={(v) => (v ? String(v) : "by population")}
                            onChange={(v) =>
                              up((x) => {
                                x.system.upper.perRegion = v;
                                x.system.upper.regionSeats = undefined;
                                if (!v && !x.system.upper.seats) x.system.upper.seats = Math.round(x.system.lower.seats / 3);
                              })
                            }
                          />
                        )
                      )}
                      {sy.upper.kind !== "appointed" && sy.upper.kind !== "council" && sy.upper.perRegion === 0 && <Num label="Seats in all" value={sy.upper.seats || 100} min={20} max={400} onChange={(v) => up((x) => (x.system.upper.seats = v))} />}
                      {sy.upper.kind === "elected" && (
                        <Pick<"plurality" | "pr" | "limited">
                          label="Counted by"
                          value={sy.upper.method}
                          options={[
                            { id: "plurality", name: "Most votes" },
                            { id: "pr", name: "Proportional" },
                            { id: "limited", name: "Winner and runner-up" },
                          ]}
                          onChange={(v) => up((x) => (x.system.upper.method = v))}
                        />
                      )}
                      {(sy.upper.kind === "elected" || sy.upper.kind === "indirect") && (
                        <>
                          <Num label="Classes (staggered)" value={sy.upper.classes} min={1} max={3} fmt={(v) => (v === 1 ? "all at once" : v === 2 ? "halves" : "thirds")} onChange={(v) => up((x) => (x.system.upper.classes = v))} />
                          <Num label="Years between elections" value={sy.upper.term} min={1} max={9} onChange={(v) => up((x) => (x.system.upper.term = v))} />
                        </>
                      )}
                      <Pick<"equal" | "weak">
                        label="Power"
                        value={sy.upper.power}
                        options={[
                          { id: "equal", name: "Equal", about: "Both houses must pass every law." },
                          { id: "weak", name: "Can be overruled", about: "The lower house can insist and pass it anyway." },
                        ]}
                        onChange={(v) => up((x) => (x.system.upper.power = v))}
                      />
                    </>
                  )}
                </Box>
              </div>
            </div>
          )}

          {tab === "economy" && (
            <div className="yg-studio">
              <div className="yg-col">
                <Text label="Currency sign" value={sc.economy.cur} max={4} onChange={(v) => up((x) => (x.economy.cur = v))} />
                <Num label="GDP (trillions)" value={sc.economy.gdp} min={0.1} max={50} step={0.1} fmt={(v) => v.toFixed(1)} onChange={(v) => up((x) => (x.economy.gdp = v))} />
                <Num label="Growth" value={sc.economy.growth} min={-3} max={8} step={0.1} fmt={(v) => `${v.toFixed(1)}%`} onChange={(v) => up((x) => (x.economy.growth = v))} />
                <Num label="Unemployment" value={sc.economy.unemployment} min={1} max={25} step={0.1} fmt={(v) => `${v.toFixed(1)}%`} onChange={(v) => up((x) => (x.economy.unemployment = v))} />
                <Num label="Government approval" value={sc.economy.approval} min={10} max={90} fmt={(v) => `${v}%`} onChange={(v) => up((x) => (x.economy.approval = v))} />
                <Num label="Budget balance (billions a year)" value={sc.economy.budget} min={-3000} max={500} step={10} onChange={(v) => up((x) => (x.economy.budget = v))} />
                <Num label="Start year" value={sc.startYear} min={1950} max={2100} onChange={(v) => up((x) => {
                  const d = v - x.startYear;
                  x.startYear = v;
                  x.system.lower.next += d;
                  x.system.upper.next += d;
                  if (x.system.pres) x.system.pres.next += d;
                })} />
              </div>
              <div className="yg-col">
                <Box title="Laws in force at the start">
                  <div className="yg-lawlist">
                    {LAWS.filter((l) => l.id !== "electoralSystem").map((l) => (
                      <label key={l.id} className="yg-row">
                        <span className="grow">{l.name}</span>
                        <select className="yg-input small" value={sc.laws[l.id] ?? l.start} onChange={(e) => up((x) => (x.laws[l.id] = Number(e.target.value)))} aria-label={l.name}>
                          {l.options.map((o, i) => (
                            <option key={i} value={i}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </Box>
              </div>
            </div>
          )}

          {tab === "share" && (
            <div className="yg-col">
              <p className="yg-muted">Anyone can paste this code into “Your scenarios” to play your country.</p>
              <textarea className="yg-input" readOnly rows={6} value={typeof checked === "string" ? checked : shareCode(checked)} onFocus={(e) => e.target.select()} aria-label="Share code" data-testid="yg-share-code" />
              <div className="yg-chips">
                <button
                  type="button"
                  className="yg-btn small"
                  disabled={typeof checked === "string"}
                  onClick={() => {
                    if (typeof checked !== "string") navigator.clipboard?.writeText(shareCode(checked)).then(() => setCopied(true));
                  }}
                >
                  <Icon name="check" size={15} /> {copied ? "Copied" : "Copy the code"}
                </button>
              </div>
            </div>
          )}
        </div>
        <footer className="yg-modal-foot">
          <p className={typeof checked === "string" || err ? "yg-err" : "yg-muted"} role="status">
            {err ?? (typeof checked === "string" ? checked : `${sc.parties.filter((p) => !p.noRun).length} parties · ${sy.lower.seats} seats · ${EXEC_KINDS.find((x) => x.id === sy.exec)?.name}`)}
          </p>
          <button type="button" className="yg-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="yg-btn primary" disabled={typeof checked === "string"} onClick={save} data-testid="yg-sc-save">
            <Icon name="check" size={16} /> Save scenario
          </button>
        </footer>
      </section>
    </div>
  );
}
