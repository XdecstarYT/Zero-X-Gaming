import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRY_LIST, realCountry } from "../countries";
import type { Game } from "../game";
import { mapReady } from "../map";
import { avalon, EXEC_KINDS, LOWER_SYSTEMS, shareCode, UPPER_KINDS, type Scenario } from "../scenario";
import * as G from "../sim";
import type { Mode } from "../career";
import { Stage3D } from "../render/stage";
import { flagUrl } from "./flags";
import { Icon } from "./icons";
import { HallOfFame, ModePicker } from "./Power";
import { ScenarioStudio } from "./ScenarioStudio";
import { PoweredBy } from "@/nextx/PoweredBy";

/** The scenario behind a pick: Avalon (new every game), a real country, or one of yours. */
function scenarioFor(id: string, seed: number, library: Scenario[]): Scenario {
  if (id === "avalon") return avalon(seed);
  return realCountry(id) ?? library.find((x) => x.id === id) ?? avalon(seed);
}

const FlagImg = ({ sc, size = 26 }: { sc: Scenario; size?: number }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={flagUrl(sc.flag, sc.name)} alt="" width={Math.round(size * 1.5)} height={size} className="yg-flagimg" />
);

/** One line on how a country is governed. */
export function systemLine(sc: Scenario) {
  const sy = sc.system;
  const up = sy.upper.kind === "none" ? "one chamber" : `${sy.upper.name} (${UPPER_KINDS.find((x) => x.id === sy.upper.kind)?.name.toLowerCase()})`;
  return `${EXEC_KINDS.find((x) => x.id === sy.exec)?.name} · ${sy.lower.name}: ${sy.lower.seats} seats, ${LOWER_SYSTEMS.find((x) => x.id === sy.lower.system)?.name.toLowerCase()} · ${up}`;
}

/** The title: pick a country, then a party, with the country slowly turning in the sun behind. */
export function Title({ g }: { g: Game }) {
  const [pick, setPick] = useState("avalon");
  const [step, setStep] = useState<"country" | "party">("country");
  const [tab, setTab] = useState<"real" | "mine" | "hall">("real");
  const [mode, setMode] = useState<Mode>({ difficulty: "normal", sandbox: false });
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6) + 1);
  const [studio, setStudio] = useState<Scenario | null>(null);
  const [importing, setImporting] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [shared, setShared] = useState<string | null>(null);
  const sc = useMemo(() => scenarioFor(pick, seed, g.library), [pick, seed, g.library]);
  const [, setLoaded] = useState(0);
  const ready = mapReady(sc.map);
  const [partyFor, setPartyFor] = useState<Record<string, string>>({});
  const canvas = useRef<HTMLCanvasElement>(null);
  const quality = g.quality;

  // Load the map data the pick needs (real countries' outlines and elevation).
  useEffect(() => {
    let live = true;
    if (!mapReady(sc.map))
      g.prepare(sc)
        .then(() => live && setLoaded((n) => n + 1))
        .catch(() => live && setMsg("Couldn't load that country's map. Check your connection."));
    return () => {
      live = false;
    };
  }, [sc, g]);

  // The country behind the card.
  useEffect(() => {
    if (!canvas.current || !ready) return;
    let st: Stage3D | null = null;
    try {
      st = new Stage3D(canvas.current, G.country(sc), quality, null, {});
      st.spin = 0.035;
      st.isPaused = () => g.paused;
      st.world.rig.jump({ target: st.world.rig.goal.target.clone().set(0, 0, 10), dist: 330, yaw: 0.5, pitch: 0.62 });
      st.world.setOverlay({ colors: new Uint8Array(8192), selectedState: -1, hoverCounty: -1 }, 0);
      st.world.bordersOn = false;
      st.labels = { selected: -1, hidden: true };
    } catch {
      st = null;
    }
    return () => st?.dispose();
  }, [sc, ready, quality, g]);

  const presets: { id: string; sc: Scenario }[] = useMemo(() => [{ id: "avalon", sc: avalon(seed) }, ...COUNTRY_LIST.map((c) => ({ id: c.code, sc: realCountry(c.code)! }))], [seed]);
  const parties = sc.parties.filter((p) => !p.noRun && !p.others).sort((a, b) => b.base - a.base);
  // A pick starts with its biggest party.
  const party = partyFor[sc.id] && parties.some((p) => p.id === partyFor[sc.id]) ? partyFor[sc.id] : (parties[0]?.id ?? "");
  const setParty = (id: string) => setPartyFor((m) => ({ ...m, [sc.id]: id }));
  const baseSum = sc.parties.reduce((a, p) => a + (p.noRun ? 0 : p.base), 0) || 1;
  const chosen = sc.parties.find((p) => p.id === party);

  const start = () => {
    if (!ready || !chosen) return;
    g.newGame(party, seed, sc, mode);
  };
  const customise = (from: Scenario) => {
    const copy = structuredClone(from);
    if (!copy.id.startsWith("custom-")) {
      copy.id = `custom-${Date.now().toString(36)}`;
      copy.name = from.id === "avalon" ? "New Republic" : `${from.name} (custom)`;
      if (from.id === "avalon") copy.about = undefined;
      if (copy.map.kind === "gen") copy.map.name = copy.name;
      copy.flag = from.id === "avalon" ? undefined : copy.flag;
    }
    setStudio(copy);
  };

  return (
    <div className="yg-title" data-testid="yg-title">
      <canvas ref={canvas} className="yg-canvas" aria-hidden />
      <div className="yg-title-shade" />
      <div className="yg-glass yg-title-card wide">
        <div className="yg-title-head">
          <FlagImg sc={sc} />
          <div>
            <h1>YourGov</h1>
            <p>Lead a party. Write the laws. Win the country, county by county.</p>
            <PoweredBy style={{ marginTop: 8 }} />
          </div>
          <span className="grow" />
          <button type="button" className="yg-btn small" onClick={() => g.setUI({ extra: "slots" })} data-testid="yg-title-saves">
            💾 Saves
          </button>
          <button type="button" className="yg-btn small" onClick={() => g.setUI({ extra: "notes" })} data-testid="yg-title-notes">
            🆕 What&apos;s new
          </button>
        </div>

        {step === "country" ? (
          <>
            <div className="yg-title-tabs">
              <div className="yg-seg" role="radiogroup" aria-label="Countries">
                <button type="button" role="radio" aria-checked={tab === "real"} onClick={() => setTab("real")} data-testid="yg-tab-real">
                  Countries
                </button>
                <button type="button" role="radio" aria-checked={tab === "mine"} onClick={() => setTab("mine")} data-testid="yg-tab-mine">
                  Your scenarios{g.library.length ? ` (${g.library.length})` : ""}
                </button>
                <button type="button" role="radio" aria-checked={tab === "hall"} onClick={() => setTab("hall")} data-testid="yg-tab-hall">
                  🏆 Hall of fame
                </button>
              </div>
            </div>
            {tab === "hall" ? (
              <HallOfFame g={g} />
            ) : tab === "real" ? (
              <div className="yg-countries" role="listbox" aria-label="Choose a country">
                {presets.map(({ id, sc: p }) => (
                  <button key={id} type="button" role="option" aria-selected={pick === id} className={`yg-country${pick === id ? " on" : ""}`} onClick={() => setPick(id)} data-testid={`yg-country-${id}`}>
                    <FlagImg sc={p} size={22} />
                    <span>
                      <b>{p.name}</b>
                      <small>{id === "avalon" ? "Made up, new every game" : `${p.parties.filter((x) => !x.noRun).length} parties · ${p.system.lower.seats} seats`}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="yg-mine">
                <div className="yg-chips">
                  <button type="button" className="yg-btn small primary" onClick={() => customise(avalon(Math.floor(Math.random() * 1e6) + 1))} data-testid="yg-new-scenario">
                    <Icon name="plus" size={15} /> New scenario
                  </button>
                  <button type="button" className="yg-btn small" onClick={() => setImporting(!importing)} data-testid="yg-import">
                    <Icon name="write" size={15} /> Paste a code
                  </button>
                </div>
                {importing && (
                  <div className="yg-import">
                    <textarea className="yg-input" rows={3} placeholder="YG1.…" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Scenario code" data-testid="yg-import-code" />
                    <button
                      type="button"
                      className="yg-btn small"
                      onClick={() => {
                        const r = g.importScenario(code);
                        if (typeof r === "string") setMsg(r);
                        else {
                          setMsg(`Added ${r.name}`);
                          setPick(r.id);
                          setImporting(false);
                          setCode("");
                        }
                      }}
                      data-testid="yg-import-go"
                    >
                      Add it
                    </button>
                  </div>
                )}
                {!g.library.length && <p className="yg-muted small">Make your own country: draw a map, found the parties and write the constitution. Or customise any country in the list.</p>}
                {g.library.map((x) => (
                  <div key={x.id} className={`yg-country row${pick === x.id ? " on" : ""}`}>
                    <button type="button" className="grow" onClick={() => setPick(x.id)} data-testid={`yg-scenario-${x.id}`}>
                      <FlagImg sc={x} size={20} />
                      <span>
                        <b>{x.name}</b>
                        <small>
                          {x.parties.length} parties · {x.map.kind === "gen" ? "made-up map" : `map of ${COUNTRY_LIST.find((c) => c.code === (x.map as { code: string }).code)?.name ?? "a real country"}`}
                        </small>
                      </span>
                    </button>
                    <button type="button" className="yg-btn icon small" aria-label={`Edit ${x.name}`} onClick={() => setStudio(structuredClone(x))}>
                      <Icon name="edit" size={15} />
                    </button>
                    <button type="button" className="yg-btn icon small" aria-label={`Share ${x.name}`} onClick={() => setShared(shared === x.id ? null : x.id)}>
                      <Icon name="news" size={15} />
                    </button>
                    <button
                      type="button"
                      className="yg-btn icon small"
                      aria-label={`Delete ${x.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete ${x.name}?`)) {
                          g.deleteScenario(x.id);
                          if (pick === x.id) setPick("avalon");
                        }
                      }}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                    {shared === x.id && <textarea className="yg-input share" readOnly rows={2} value={shareCode(x)} onFocus={(e) => e.target.select()} aria-label="Share code" />}
                  </div>
                ))}
              </div>
            )}
            <div className="yg-pickinfo">
              <b>{sc.name}</b>
              <p className="yg-muted small">{sc.about ?? systemLine(sc)}</p>
              {sc.about && <p className="yg-faint small">{systemLine(sc)}</p>}
            </div>
            {msg && (
              <p className="yg-note" role="status">
                {msg}
              </p>
            )}
            <div className="yg-title-actions">
              <button type="button" className="yg-btn" onClick={() => customise(sc)} data-testid="yg-customise">
                <Icon name="settings" size={15} /> Customise
              </button>
              {pick === "avalon" && (
                <button type="button" className="yg-btn" onClick={() => setSeed(Math.floor(Math.random() * 1e6) + 1)} aria-label="A different Avalon">
                  <Icon name="map" size={15} /> New map
                </button>
              )}
              <button type="button" className="yg-btn primary grow" onClick={() => setStep("party")} data-testid="yg-next">
                Choose your party <Icon name="chevron" size={16} />
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="yg-label">
              {sc.name} · choose your party
            </p>
            <div className="yg-parties">
              {parties.map((x) => (
                <button key={x.id} type="button" className={`yg-partypick${party === x.id ? " on" : ""}`} style={{ ["--c" as string]: x.color }} onClick={() => setParty(x.id)} aria-pressed={party === x.id} data-testid={`yg-party-${x.id}`}>
                  <i />
                  <b>{x.name}</b>
                  <small>
                    {x.ideology} · {Math.round((x.base / baseSum) * 100)}%{x.only ? " · regional" : ""}
                  </small>
                </button>
              ))}
            </div>
            <ModePicker mode={mode} onChange={setMode} />
            <p className="yg-muted small yg-title-blurb">
              {chosen
                ? `You lead the ${chosen.name} in ${sc.name}. ${sc.system.exec === "presidential" ? `Win the presidency and the ${sc.system.lower.short}` : `Win the ${sc.system.lower.short}, build a coalition if you must, and become ${sc.system.titles.head}`}. Each week hold events, write and vote on bills (and draft laws of your own) and keep your promises. Your score grows with every law, seat and promise over a twenty-year career.`
                : ""}
            </p>
            <div className="yg-title-actions">
              <button type="button" className="yg-btn" onClick={() => setStep("country")} data-testid="yg-back">
                <Icon name="back" size={15} /> Countries
              </button>
              <button type="button" className="yg-btn primary big grow" disabled={!ready || !chosen} onClick={start} data-testid="yg-start">
                {ready ? (
                  <>
                    <Icon name="play" size={16} /> Begin your career
                  </>
                ) : (
                  <>
                    <span className="yg-spin" /> Loading the map…
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
      {studio && (
        <ScenarioStudio
          g={g}
          initial={studio}
          onClose={() => setStudio(null)}
          onSaved={(saved) => {
            setStudio(null);
            setTab("mine");
            setPick(saved.id);
            setMsg(`${saved.name} is saved in your scenarios`);
          }}
        />
      )}
    </div>
  );
}
