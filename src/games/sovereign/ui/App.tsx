"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PoweredBy } from "@/nextx/PoweredBy";
import { GlassDefs, canRefract, trackSheen } from "@/nextx/glass";
import { IDEOLOGIES, UNITS } from "../data";
import type { Game, PanelId } from "../game";
import { score } from "../sim";
import { dateText, shownCount, unitCount } from "../state";
import { CityCard, NationCard } from "./cards";
import { money, people, perDay } from "./fmt";
import { Panel } from "./panels";

const TABS: { id: PanelId; icon: string; label: string }[] = [
  { id: "nation", icon: "🏛️", label: "Nation" },
  { id: "economy", icon: "💰", label: "Economy" },
  { id: "military", icon: "⚔️", label: "Military" },
  { id: "diplomacy", icon: "🤝", label: "Diplomacy" },
  { id: "politics", icon: "📜", label: "Politics" },
  { id: "world", icon: "🌍", label: "World" },
];

const noSubscribe = () => () => {};

export function useGame(game: Game) {
  return useSyncExternalStore(game.subscribe, () => game.version, () => 0);
}

export function App({ game }: { game: Game }) {
  useGame(game);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // NextX Engine liquid glass: the panels bend the world behind them (where the browser can).
  const refract = useSyncExternalStore(noSubscribe, canRefract, () => false);
  useEffect(() => (root.current ? trackSheen(root.current, ".sv-glass, .sv-btn") : undefined), []);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    game.attach(c);
    const ro = new ResizeObserver(() => game.resize());
    ro.observe(c);
    return () => {
      ro.disconnect();
      game.detach();
    };
  }, [game]);
  const s = game.s;
  return (
    <div ref={root} className={`sv${refract ? " sv-refract" : ""}`} data-testid="sv-root">
      <GlassDefs prefix="sv" />
      <canvas ref={canvas} className="sv-canvas" aria-label="The world map. Drag to pan, pinch or scroll to zoom, tap a city or your armies." tabIndex={0} data-testid="sv-canvas" />
      <div className="sv-attrib">Map: Natural Earth · terrain: Mapzen/AWS</div>
      {game.screen === "loading" && (
        <div className="sv-loading">
          {game.loadError ? (
            <>
              <p>The world map couldn&apos;t load. Check your connection.</p>
              <button className="sv-btn gold" type="button" onClick={() => location.reload()}>
                Retry
              </button>
            </>
          ) : (
            <>
              <div className="sv-spin" />
              <p>Drawing the world…</p>
            </>
          )}
        </div>
      )}
      {game.screen === "title" && <Title game={game} />}
      {game.screen === "pick" && <Picker game={game} />}
      {game.screen === "play" && s && (
        <>
          <TopBar game={game} />
          <Ticker game={game} />
          <Dock game={game} />
          {game.panel && <Panel game={game} />}
          {game.city !== null && !game.panel && <CityCard game={game} id={game.city} />}
          {game.inspect !== null && !game.panel && game.city === null && <NationCard game={game} id={game.inspect} />}
          {game.selection.length > 0 && !game.panel && game.city === null && game.inspect === null && <UnitBar game={game} />}
          {game.targeting && (
            <div className="sv-target sv-glass">
              <span>{game.targeting.kind === "nuke" ? "☢️ Choose a target for the warhead" : "🎯 Choose a target for the missile"}</span>
              <button className="sv-btn small" type="button" onClick={() => game.cancelTarget()}>
                Cancel
              </button>
            </div>
          )}
          <Inbox game={game} />
          {s.over && <GameOver game={game} />}
        </>
      )}
      <div className="sv-toasts" aria-live="polite">
        {game.toasts.map((t) => (
          <div key={t.id} className={`sv-toast sv-glass ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Title({ game }: { game: Game }) {
  return (
    <div className="sv-title">
      <div className="sv-title-card sv-glass">
        <PoweredBy style={{ marginBottom: 14 }} />
        <h1 className="sv-logo">SOVEREIGN</h1>
        <p className="sv-sub">Lead any nation on Earth. Build it up, rule it your way, make friends and enemies, and fight for the map.</p>
        <div className="sv-title-actions">
          <button className="sv-btn gold" type="button" onClick={() => game.choose()} data-testid="sv-new">
            New game: choose a nation
          </button>
          {game.hasSave && (
            <button className="sv-btn" type="button" onClick={() => game.continueGame()} data-testid="sv-continue">
              Continue
            </button>
          )}
        </div>
        <p className="sv-note" style={{ marginTop: 14 }}>
          181 real nations and 1,242 real cities on a map built from Natural Earth. Mine and trade eleven resources, run factories and power, set taxes and laws, change government, form alliances, justify and declare wars, take cities, form historic empires and, if it comes to it, launch the missiles.
        </p>
      </div>
    </div>
  );
}

function Picker({ game }: { game: Game }) {
  const [q, setQ] = useState("");
  const p = game.preview!;
  const world = game.world!;
  const list = useMemo(
    () =>
      p.nations
        .filter((n) => n.alive && n.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.last.gdp - a.last.gdp),
    [p, q],
  );
  const n = game.pick !== null ? p.nations[game.pick] : null;
  const cities = n ? p.cities.filter((c) => c.owner === n.id) : [];
  return (
    <div className="sv-pick sv-glass" data-testid="sv-picker">
      <div className="sv-sheet-head">
        <h2>Choose your nation</h2>
        <button className="sv-x" type="button" aria-label="Back" onClick={() => game.backToTitle()}>
          ✕
        </button>
      </div>
      {n ? (
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="sv-swatch" style={{ background: n.color }} />
            <b style={{ fontSize: 17 }}>{n.name}</b>
            <span className="sv-pill">{IDEOLOGIES[n.ideology].icon} {IDEOLOGIES[n.ideology].name}</span>
          </div>
          <div className="sv-kv" style={{ marginTop: 8 }}>
            <div>
              <small>GDP</small>
              <b>{perDay(n.last.gdp)}</b>
            </div>
            <div>
              <small>Cities</small>
              <b>{cities.length}</b>
            </div>
            <div>
              <small>People</small>
              <b>{people(world.nations[n.id].pop)}</b>
            </div>
            <div>
              <small>Treasury</small>
              <b>{money(n.money)}</b>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {(["easy", "normal", "hard"] as const).map((d) => (
              <button key={d} type="button" className={`sv-btn small ${game.difficulty === d ? "on" : ""}`} onClick={() => game.setDifficulty(d)}>
                {d[0].toUpperCase() + d.slice(1)}
              </button>
            ))}
            <button className="sv-btn gold" type="button" style={{ flex: 1 }} onClick={() => game.start(n.iso)} data-testid="sv-start">
              Lead {n.name}
            </button>
          </div>
        </div>
      ) : (
        <p className="sv-note" style={{ padding: "0 12px" }}>
          Tap a country on the map, or find it below.
        </p>
      )}
      <div style={{ padding: "8px 10px 0" }}>
        <input className="sv-search" placeholder="Search nations" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search nations" data-testid="sv-search" />
      </div>
      <div className="sv-pick-list">
        {list.map((x) => (
          <button key={x.id} type="button" className="sv-row click" style={{ width: "100%", textAlign: "left" }} onClick={() => game.look(x.id)} data-testid={`sv-pick-${x.iso}`}>
            <span className="sv-swatch" style={{ background: x.color }} />
            <span className="grow">
              <b>{x.name}</b>
              <small>
                {IDEOLOGIES[x.ideology].name} · GDP {perDay(x.last.gdp)}
              </small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TopBar({ game }: { game: Game }) {
  const s = game.s!;
  const n = s.nations[s.player];
  const inc = n.last.income;
  return (
    <div className="sv-top">
      <button className="sv-nation sv-glass" type="button" onClick={() => game.togglePanel("nation")} data-testid="sv-me">
        <span className="sv-swatch" style={{ background: n.color }} />
        <b>{n.name}</b>
      </button>
      <div className="sv-stats sv-glass">
        <div className="sv-stat" title="Treasury and daily income">
          <small>Money</small>
          <span className={`num ${n.money < 0 ? "bad" : ""}`} data-testid="sv-money">
            {money(n.money)}
          </span>
          <i className={`num ${inc >= 0 ? "good" : "bad"}`}>{perDay(inc)}</i>
        </div>
        <div className="sv-stat">
          <small>Manpower</small>
          <span className="num">{people(n.manpower)}</span>
        </div>
        <div className="sv-stat">
          <small>Stability</small>
          <span className={`num ${n.stability < 35 ? "bad" : n.stability < 55 ? "warn" : "good"}`}>{Math.round(n.stability)}%</span>
        </div>
        <div className="sv-stat">
          <small>GDP</small>
          <span className="num">{perDay(n.last.gdp)}</span>
        </div>
        <div className="sv-stat">
          <small>Score</small>
          <span className="num">{score(s).toLocaleString()}</span>
        </div>
      </div>
      <div className="sv-clock sv-glass">
        <span className="date num" data-testid="sv-date">
          {dateText(s.day)}
        </span>
        {game.speeds.map((sp, i) => (
          <button key={i} type="button" className={`sv-speed ${game.speed === i ? "on" : ""}`} onClick={() => game.setSpeed(i)} aria-label={i === 0 ? "Pause" : `Speed ${sp}×`} data-testid={`sv-speed-${i}`}>
            {i === 0 ? "❚❚" : `${sp}×`}
          </button>
        ))}
      </div>
    </div>
  );
}

function Ticker({ game }: { game: Game }) {
  const s = game.s!;
  const item = s.news.find((n) => s.day - n.day < 6 && (n.who.includes(s.player) || n.kind === "war" || n.kind === "world"));
  if (!item || game.panel || game.toasts.length) return null;
  return (
    <div className={`sv-ticker sv-glass ${item.kind === "bad" || item.kind === "war" ? "bad" : ""}`} data-testid="sv-ticker">
      {item.kind === "war" ? "⚔️ " : item.kind === "peace" ? "🕊️ " : item.kind === "world" ? "🌍 " : "📰 "}
      {item.text}
    </div>
  );
}

function Dock({ game }: { game: Game }) {
  const s = game.s!;
  const offers = s.offers.length;
  return (
    <nav className="sv-dock sv-glass" aria-label="Panels">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`sv-tab ${game.panel === t.id ? "on" : ""}`}
          onClick={() => game.togglePanel(t.id)}
          data-testid={`sv-tab-${t.id}`}
        >
          <span>{t.icon}</span>
          {t.label}
          {t.id === "diplomacy" && offers > 0 && <em className="badge">{offers}</em>}
        </button>
      ))}
    </nav>
  );
}

function UnitBar({ game }: { game: Game }) {
  const s = game.s!;
  const sel = game.selection;
  const air = sel.some((a) => UNITS[a.kind].domain === "air");
  const total = sel.reduce((a, b) => a + unitCount(b), 0);
  return (
    <div className="sv-unitbar sv-glass" data-testid="sv-unitbar">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ fontSize: 13.5 }}>
          {sel.length === 1 ? UNITS[sel[0].kind].name : `${sel.length} stacks`} · {Math.ceil(total)} units
        </b>
        <span className="dim" style={{ fontSize: 12, flex: 1 }}>
          {air ? "Tap the map: fighters patrol there, bombers strike it." : "Tap the map to move. Right-click on desktop."}
        </span>
        <button className="sv-x" type="button" aria-label="Deselect" onClick={() => game.clearSelection()}>
          ✕
        </button>
      </div>
      <div className="sv-units">
        {sel.map((a) => (
          <span key={a.id} className="sv-chip">
            {UNITS[a.kind].icon} {shownCount(a)}
            {a.fighting > 0 && <span className="bad">⚔</span>}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="sv-btn small" type="button" onClick={() => game.stop()}>
          Stop
        </button>
        <button className="sv-btn small" type="button" onClick={() => game.split()} disabled={sel.length !== 1}>
          Split
        </button>
        <button className="sv-btn small" type="button" onClick={() => game.merge()} disabled={sel.length < 2}>
          Merge
        </button>
        <button className="sv-btn small red" type="button" onClick={() => game.disband()}>
          Disband
        </button>
        <span className="dim" style={{ fontSize: 11.5, alignSelf: "center" }}>
          {sel.every((a) => a.owner === s.player) ? "" : "Not yours"}
        </span>
      </div>
    </div>
  );
}

function Inbox({ game }: { game: Game }) {
  const s = game.s!;
  const o = s.offers[0];
  if (!o || game.panel) return null;
  const from = s.nations[o.from];
  const w = o.warId !== undefined ? s.wars.find((x) => x.id === o.warId) : null;
  const text =
    o.kind === "peace"
      ? `${from.name} offers peace in the ${w?.name ?? "war"}${o.terms === "return" ? ": everyone gives back what they took." : o.terms === "subjugate" ? ": you'd become their subject." : ": each keeps what it holds."}`
      : o.kind === "alliance"
        ? `${from.name} asks you into an alliance.`
        : o.kind === "trade"
          ? `${from.name} proposes a trade deal (+GDP for both).`
          : o.kind === "nap"
            ? `${from.name} proposes a non-aggression pact.`
            : `${from.name} asks for military access.`;
  return (
    <div className="sv-inbox sv-glass" data-testid="sv-inbox">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span className="sv-swatch" style={{ background: from.color }} />
        <b style={{ flex: 1 }}>{from.name}</b>
        {s.offers.length > 1 && <span className="dim">+{s.offers.length - 1} more</span>}
      </div>
      <p className="sv-note">{text}</p>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="sv-btn small green" type="button" onClick={() => game.reply(o.id, true)} data-testid="sv-accept">
          Accept
        </button>
        <button className="sv-btn small" type="button" onClick={() => game.reply(o.id, false)}>
          Decline
        </button>
      </div>
    </div>
  );
}

function GameOver({ game }: { game: Game }) {
  const s = game.s!;
  return (
    <div className="sv-over">
      <div className="sv-title-card sv-glass">
        <h2 style={{ margin: 0 }}>{s.over!.reason}</h2>
        <p className="sv-sub">
          {dateText(s.day)} · Score {(s.over!.score || score(s)).toLocaleString()}
        </p>
        <button className="sv-btn gold wide" type="button" onClick={() => game.quitToTitle()}>
          Back to the title
        </button>
      </div>
    </div>
  );
}
