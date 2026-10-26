"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { PoweredBy } from "@/nextx/PoweredBy";
import { GlassDefs, canRefract, trackSheen } from "@/nextx/glass";
import { BANDS, CIVIC_ORDER, CIVICS, MILESTONES, PATTERNS, ROADS, USE_ORDER, USES, type Pattern, type RoadKind } from "../data";
import { fmt, SPEEDS, type Game, type Tool, type TransitTool } from "../game";
import { dateLabel } from "../state";
import { MONTHS } from "../data";
import { Panels, PatternIcon, Wanted } from "./panels";
import { ChangeLog, ElectionNight, SettingsPanel, Setup } from "./politics";
import { canPlan, cityShare, playerParty } from "../politics";

const noSubscribe = () => () => {};

export function useGame(game: Game) {
  return useSyncExternalStore(game.subscribe, () => game.version, () => 0);
}

const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: "inspect", icon: "👆", label: "Look" },
  { id: "road", icon: "🛣️", label: "Roads" },
  { id: "zone", icon: "🗺️", label: "Zone" },
  { id: "upzone", icon: "⬆️", label: "Upzone" },
  { id: "design", icon: "✏️", label: "Design" },
  { id: "transit", icon: "🚋", label: "Transit" },
  { id: "civic", icon: "🏛️", label: "Civic" },
  { id: "bulldoze", icon: "🚧", label: "Bulldoze" },
];

export function App({ game }: { game: Game }) {
  useGame(game);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const refract = useSyncExternalStore(noSubscribe, canRefract, () => false);
  useEffect(() => (root.current ? trackSheen(root.current, ".xc-glass, .xc-btn") : undefined), []);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    game.attach(c);
    return () => game.detach();
  }, [game]);
  return (
    <div ref={root} className={`xc${refract ? " xc-refract" : ""}`} data-testid="xc-root">
      <GlassDefs prefix="xc" />
      <canvas ref={canvas} className="xc-canvas" aria-label="The city. Drag to move, pinch or scroll to zoom, two fingers to turn." tabIndex={0} data-testid="xc-canvas" />
      {game.screen === "title" && <Title game={game} />}
      {game.screen === "setup" && <Setup game={game} />}
      {game.screen === "play" && game.s && (
        <>
          <TopBar game={game} />
          <Toasts game={game} />
          {game.pending ? <Confirm game={game} /> : !game.panel && game.tool !== "inspect" && <ToolOptions game={game} />}
          <Panels game={game} />
          <Dock game={game} />
          {game.s.pol?.night && <ElectionNight game={game} />}
        </>
      )}
      {game.loading < 1 && game.screen === "play" && (
        <div className="xc-loading xc-glass" role="status">
          Laying out the city…
          <div className="xc-prog">
            <i style={{ width: `${Math.round(game.loading * 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function Title({ game }: { game: Game }) {
  return (
    <>
      <div className="xc-title" data-testid="xc-title">
        <PoweredBy />
        <h1 className="xc-logo">
          <span>X</span>CITY
        </h1>
        <p className="xc-tag">A city builder that takes zoning seriously, and the politics that come with it. Win the election, then plan it all.</p>
        <div className="xc-menu">
          {game.hasSave && (
            <button className="xc-btn white wide" type="button" onClick={() => game.continueGame()} data-testid="xc-continue">
              Continue
            </button>
          )}
          <button className={`xc-btn wide${game.hasSave ? "" : " white"}`} type="button" onClick={() => game.startSetup()} data-testid="xc-new">
            Start a new world
          </button>
          <div className="xc-actions">
            <button className="xc-btn grow" type="button" onClick={() => game.openTitlePanel("changelog")} data-testid="xc-changelog-open">
              📰 Change log
            </button>
            <button className="xc-btn grow" type="button" onClick={() => game.openTitlePanel("settings")} data-testid="xc-settings-open">
              ⚙️ Settings
            </button>
          </div>
        </div>
      </div>
      {game.titlePanel && (
        <div className="xc-title-panel" onClick={(e) => e.target === e.currentTarget && game.openTitlePanel(null)}>
          {game.titlePanel === "changelog" ? <ChangeLog game={game} /> : <SettingsPanel game={game} />}
        </div>
      )}
    </>
  );
}

function TopBar({ game }: { game: Game }) {
  const s = game.s!;
  const st = s.stats;
  const hist = s.history;
  const prevRent = hist.length > 3 ? hist[hist.length - 4].rent : Math.round(1350 * s.rentIndex);
  const rent = Math.round(1350 * s.rentIndex);
  const trend = rent - prevRent;
  return (
    <div className="xc-top">
      <div className="xc-bar xc-glass">
        <button className="xc-city" type="button" onClick={() => game.openPanel("city")} data-testid="xc-cityname">
          <b>{s.name}</b>
          <small>{MILESTONES[s.milestone].name}</small>
        </button>
      </div>
      <div className="xc-bar xc-glass xc-stats">
        <Stat label="People" value={st.pop.toLocaleString()} id="pop" />
        <button className="xc-stat" type="button" onClick={() => game.openPanel("city")}>
          <small>Homes</small>
          <Wanted d={st.homeDemand} n={st.homes} />
        </button>
        <Stat label="Rent" value={`$${rent.toLocaleString()}`} extra={trend ? <i className={trend > 0 ? "bad" : "good"}>{trend > 0 ? "▲" : "▼"}</i> : null} id="rent" />
        <Stat label="Approval" value={`${Math.round(s.approval)}%`} cls={s.approval >= 55 ? "good" : s.approval < 35 ? "bad" : ""} id="approval" />
        <Stat label="Budget" value={`$${fmt(s.money)}`} cls={s.money < 0 ? "bad" : ""} id="money" />
        <Stat label="Clout" value={`✦${s.clout}`} cls="gold" id="clout" />
      </div>
      {s.pol && <PolChip game={game} />}
      <div className="xc-bar xc-glass xc-clock">
        <span className="date num" data-testid="xc-date">
          {dateLabel(s.month, MONTHS)}
        </span>
        <button className={`xc-speed${game.paused ? " on" : ""}`} type="button" onClick={() => game.togglePause()} aria-label={game.paused ? "Play" : "Pause"} data-testid="xc-pause">
          {game.paused ? "▶" : "❚❚"}
        </button>
        {SPEEDS.slice(1).map((sp, i) => (
          <button key={sp} className={`xc-speed${!game.paused && game.speed === i + 1 ? " on" : ""}`} type="button" onClick={() => game.setSpeed(i + 1)} data-testid={`xc-speed-${i + 1}`}>
            {sp}×
          </button>
        ))}
        <button className="xc-speed" type="button" onClick={() => game.openPanel("help")} aria-label="Menu" data-testid="xc-menu">
          ☰
        </button>
      </div>
    </div>
  );
}

function PolChip({ game }: { game: Game }) {
  const p = game.s!.pol!;
  const me = playerParty(p);
  const share = cityShare(p)[p.player];
  return (
    <div className="xc-bar xc-glass xc-polbar">
      <button className="xc-polchip" type="button" onClick={() => game.openPanel("politics")} data-testid="xc-polchip">
        <span style={{ fontSize: 15 }}>{me.icon}</span>
        <span style={{ color: me.color }}>{Math.round(share * 100)}%</span>
        <span className="dim">{p.campaign ? `Week ${p.week + 1}/${p.settings.campaignWeeks}` : p.government === p.player ? "Governing" : "Opposition"}</span>
      </button>
      {p.campaign && (
        <button className="xc-btn white tiny" type="button" onClick={() => game.endWeek()} data-testid="xc-end-week-top">
          End week ▶
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, cls, extra, id }: { label: string; value: string; cls?: string; extra?: React.ReactNode; id: string }) {
  return (
    <div className="xc-stat" data-testid={`xc-stat-${id}`}>
      <small>{label}</small>
      <span className={`num ${cls ?? ""}`}>
        {value}
        {extra}
      </span>
    </div>
  );
}

function Dock({ game }: { game: Game }) {
  const s = game.s!;
  return (
    <nav className="xc-dock xc-glass" aria-label="Tools">
      {TOOLS.filter((t) => t.id === "inspect" || canPlan(s)).map((t) => (
        <button key={t.id} className={`xc-tool${game.tool === t.id ? " on" : ""}`} type="button" onClick={() => game.setTool(t.id)} data-testid={`xc-tool-${t.id}`} aria-pressed={game.tool === t.id}>
          <span aria-hidden>{t.icon}</span>
          {t.label}
        </button>
      ))}
      {s.pol && (
        <button className={`xc-tool${game.panel === "politics" ? " on" : ""}`} type="button" onClick={() => game.openPanel("politics")} data-testid="xc-tool-politics">
          <span aria-hidden>🗳️</span>
          Politics
          {(s.pol.campaign || (s.pol.federal.sitting && s.pol.federal.bills.some((b) => b.status === "pending"))) && <b className="xc-badge">!</b>}
        </button>
      )}
      {canPlan(s) && (
        <button className={`xc-tool${game.panel === "agenda" ? " on" : ""}`} type="button" onClick={() => game.openPanel("agenda")} data-testid="xc-tool-agenda">
          <span aria-hidden>📋</span>
          Agenda
          {s.apps.length > 0 && <b className="xc-badge">{s.apps.length}</b>}
        </button>
      )}
      <button className={`xc-tool${game.panel === "city" ? " on" : ""}`} type="button" onClick={() => game.openPanel("city")} data-testid="xc-tool-city">
        <span aria-hidden>📊</span>
        City
      </button>
    </nav>
  );
}

function ToolOptions({ game }: { game: Game }) {
  const s = game.s!;
  const pop = s.stats.pop;
  switch (game.tool) {
    case "road":
      return (
        <div className="xc-opts xc-glass" data-testid="xc-opts-road">
          <div className="xc-scroll">
            {(Object.keys(ROADS) as RoadKind[]).map((k) => (
              <button key={k} className={`xc-chip${game.roadKind === k ? " on" : ""}`} type="button" disabled={pop < ROADS[k].unlock} onClick={() => game.setRoadKind(k)} data-testid={`xc-road-${k}`}>
                {ROADS[k].name} <span className="dim">${ROADS[k].cost.toLocaleString()}/m</span>
              </button>
            ))}
            <button className={`xc-chip${game.curve ? " on" : ""}`} type="button" onClick={() => game.toggleCurve()} data-testid="xc-road-curve">
              〰 Curved
            </button>
          </div>
          {game.roadQuote ? (
            <div className="xc-quote">
              <span>
                <b>${fmt(game.roadQuote.cost)}</b>
                {game.roadQuote.homes > 0 && <span className="bad"> · knocks down {game.roadQuote.homes} homes</span>}
                {game.roadQuote.ok && <span className="bad"> · {game.roadQuote.ok}</span>}
              </span>
              <button className="xc-btn small" type="button" onClick={() => game.escape()}>
                Cancel
              </button>
            </div>
          ) : (
            <p className="xc-hint">{pop < ROADS.avenue.unlock ? `Avenues unlock at ${ROADS.avenue.unlock.toLocaleString()} people. ` : ""}Drag from a road to where the new one ends, or tap the start and then the end.</p>
          )}
        </div>
      );
    case "zone":
      return (
        <div className="xc-opts xc-glass" data-testid="xc-opts-zone">
          <div className="xc-scroll">
            {USE_ORDER.map((u) => (
              <button key={u} className={`xc-chip${game.zoneUse === u ? " on" : ""}`} type="button" onClick={() => game.setZone({ use: u })} data-testid={`xc-use-${u}`}>
                {USES[u].icon} {USES[u].name}
              </button>
            ))}
          </div>
          {USES[game.zoneUse].bands[0] > 0 && (
            <div className="xc-scroll">
              {USES[game.zoneUse].bands.map((b) => (
                <button key={b} className={`xc-chip${game.zoneBand === b ? " on" : ""}`} type="button" disabled={pop < BANDS[b].unlock} onClick={() => game.setZone({ band: b })} data-testid={`xc-band-${b}`}>
                  {BANDS[b].label} <span className="dim">{BANDS[b].form}</span>
                </button>
              ))}
            </div>
          )}
          <div className="xc-pats">
            {(["none", "grid", "curvy", "culdesac", "superblock"] as const).map((p) => (
              <button key={p} className={`xc-pat${game.pattern === p ? " on" : ""}`} type="button" onClick={() => game.setZone({ pattern: p })} data-testid={`xc-pattern-${p}`}>
                <PatternIcon p={p} />
                {p === "none" ? "Just zone" : PATTERNS[p as Pattern].name}
              </button>
            ))}
          </div>
          <p className="xc-hint">{game.pattern === "none" ? "Drag over the map to zone the lots already there." : `Drag over open land: ${PATTERNS[game.pattern as Pattern].blurb.toLowerCase()}`} Two fingers move the map.</p>
        </div>
      );
    case "upzone":
      return (
        <div className="xc-opts xc-glass" data-testid="xc-opts-upzone">
          <p className="xc-hint">
            <b>Rents climbing? Upzone.</b> Drag over an area to let it build one step taller. Developers will knock down the old and put up more homes.
          </p>
        </div>
      );
    case "design":
      return (
        <div className="xc-opts xc-glass">
          <p className="xc-hint">
            <b>Design your own building.</b> Tap a plot (or a building to replace) and draw it up: storeys, style, roof, bay windows and colour. You can even build taller than the zoning allows, for some clout.
          </p>
        </div>
      );
    case "transit": {
      const opts: [TransitTool, string, string][] = [
        ["bike", "🚲 Bike lanes", "Paint green bike lanes. Tap again to remove."],
        ["tram", "🚋 Tram line", "Lay tram tracks down an avenue (a street is widened first)."],
        ["avenue", "↔️ Widen to avenue", "Four lanes and room for a tram. Knocks back what's in the way."],
        ["street", "↕️ Narrow to street", "Back to two lanes."],
      ];
      return (
        <div className="xc-opts xc-glass" data-testid="xc-opts-transit">
          <div className="xc-scroll">
            {opts.map(([k, label]) => (
              <button key={k} className={`xc-chip${game.transitTool === k ? " on" : ""}`} type="button" onClick={() => game.setTransitTool(k)} data-testid={`xc-transit-${k}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="xc-hint">
            {opts.find((o) => o[0] === game.transitTool)![2]} Cater to cars, bikes or transit: {Math.round(s.modes.car * 100)}% drive, {Math.round(s.modes.bike * 100)}% cycle, {Math.round(s.modes.transit * 100)}% take the tram.
          </p>
        </div>
      );
    }
    case "civic":
      return (
        <div className="xc-opts xc-glass" data-testid="xc-opts-civic">
          <div className="xc-scroll">
            {CIVIC_ORDER.map((k) => (
              <button key={k} className={`xc-chip${game.civicKind === k ? " on" : ""}`} type="button" onClick={() => game.setCivic(k)} data-testid={`xc-civic-${k}`}>
                {CIVICS[k].icon} {CIVICS[k].name} <span className="dim">${fmt(CIVICS[k].cost)}</span>
              </button>
            ))}
          </div>
          <p className="xc-hint">
            {CIVICS[game.civicKind].blurb} Takes {CIVICS[game.civicKind].lots} plots in a row. Tap where it goes.
          </p>
        </div>
      );
    case "bulldoze":
      return (
        <div className="xc-opts xc-glass">
          <p className="xc-hint">Tap a building to buy it out and knock it down, or a road to remove it (and what&apos;s along it).</p>
        </div>
      );
    default:
      return null;
  }
}

function Confirm({ game }: { game: Game }) {
  const p = game.pending!;
  const up = p.kind === "upzone";
  const size = Math.round(((p.obb.hw * 2) / 10) * ((p.obb.hd * 2) / 10)) / 100;
  return (
    <div className="xc-confirm xc-glass" data-testid="xc-confirm">
      <b>{up ? "Upzone this area one step taller?" : `Zone ${USES[game.zoneUse].name.toLowerCase()}${USES[game.zoneUse].bands[0] > 0 ? `, ${BANDS[game.zoneBand].label}` : ""}`}</b>
      <span className="muted" style={{ fontSize: 13 }}>
        {size.toFixed(1)} ha
        {!up && game.pattern !== "none" && ` · ${PATTERNS[game.pattern as Pattern].name} streets, $${fmt(p.cost)}`}
        {!up && game.pattern === "none" && " · zoning is free"}
      </span>
      <div className="xc-actions">
        <button className="xc-btn grow" type="button" onClick={() => game.cancelArea()}>
          Cancel
        </button>
        <button className="xc-btn white grow" type="button" onClick={() => game.confirmArea()} disabled={!up && p.cost > game.s!.money} data-testid="xc-confirm-ok">
          {up ? "Upzone" : game.pattern === "none" ? "Zone it" : "Lay out & zone"}
        </button>
      </div>
    </div>
  );
}

function Toasts({ game }: { game: Game }) {
  return (
    <div className={`xc-toasts${game.s?.pol ? " pol" : ""}`} aria-live="polite">
      {game.toasts.map((t) => {
        const a = t.app !== undefined ? game.s!.apps.find((x) => x.id === t.app) : null;
        if (a)
          return (
            <div key={t.id} className="xc-app xc-glass" data-testid="xc-app-toast">
              <div className="k">🏗️ New application</div>
              <h4>{a.plan.name}</h4>
              <p>{a.homes ? `${a.homes} homes` : `${a.jobs} jobs`}</p>
              <button
                className="xc-btn white small"
                type="button"
                onClick={() => {
                  game.dismiss(t.id);
                  game.review(a.id);
                }}
              >
                Review
              </button>
            </div>
          );
        return (
          <div key={t.id} className={`xc-toast xc-glass ${t.kind}`} onClick={() => game.dismiss(t.id)}>
            {t.text}
          </div>
        );
      })}
    </div>
  );
}
