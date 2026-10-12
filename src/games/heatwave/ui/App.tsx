"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { ARMOR_PRICE, LEADS, OUTFITS, PAINT, RESPRAY_PRICE, STATIONS, VEHICLES, WEAPONS, type WeaponId } from "../data";
import type { Game, PhoneTab } from "../game";
import { missionStart, nextStory, RACES, STORY, TOKENS } from "../missions";
import * as sim from "../sim";
import { player, playerCar, type State } from "../state";
import { drawFullMap, drawMinimap, toWorld } from "./map";

/**
 * Heatwave's interface over the 3D view: the title, the HUD (money, wanted stars, weapon, the
 * turning minimap with health and armour, the objective and subtitles, banners), the phone
 * (map, jobs, stats, the two leads, settings), the shops, and touch controls on phones.
 */

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const clockText = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;

export function App({ game }: { game: Game }) {
  useSyncExternalStore(game.subscribe, game.getVersion, game.getVersion);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    game.attach(canvas.current);
    const ro = new ResizeObserver(() => {
      const r = canvas.current!.getBoundingClientRect();
      game.resize(r.width, r.height);
    });
    ro.observe(canvas.current);
    return () => {
      ro.disconnect();
      game.detach();
    };
  }, [game]);
  const s = game.s;
  return (
    <div ref={root} className={`hw${game.coarse ? " hw-touch" : ""}`} data-testid="hw-root">
      <canvas ref={canvas} className="hw-canvas" aria-label="Port Solano in 3D. Click to look round with the mouse." tabIndex={0} data-testid="hw-canvas" />
      {game.screen === "title" || !s ? (
        <Title game={game} />
      ) : (
        <>
          <Hud game={game} s={s} />
          {game.coarse && !game.panel && <Touch game={game} s={s} />}
          {game.panel === "phone" && <Phone game={game} s={s} />}
          {game.panel === "shop" && game.shop && <Shop game={game} s={s} />}
          <Overlays game={game} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ title */

function Title({ game }: { game: Game }) {
  const [help, setHelp] = useState(false);
  return (
    <div className="hw-title" data-testid="hw-title">
      <div className="hw-sun" aria-hidden />
      <div className="hw-title-card">
        <p className="hw-kicker">NextX · Port Solano</p>
        <h2 className="hw-logo">
          HEAT<span>WAVE</span>
        </h2>
        <p className="hw-tag">Two outlaws. One sun-baked city. Get rich, or get caught.</p>
        <div className="hw-leads">
          {(["nina", "dex"] as const).map((id) => (
            <div key={id} className={`hw-lead ${id}`}>
              <b>{LEADS[id].full}</b>
              <small>{LEADS[id].blurb}</small>
            </div>
          ))}
        </div>
        <div className="hw-title-actions">
          {game.hasSave && (
            <button className="hw-btn primary" onClick={() => game.continueGame()} data-testid="hw-continue">
              Continue
            </button>
          )}
          <button className={`hw-btn ${game.hasSave ? "" : "primary"}`} onClick={() => game.newGame()} data-testid="hw-new">
            New game
          </button>
          <button className="hw-btn ghost" onClick={() => setHelp((h) => !h)} aria-expanded={help} data-testid="hw-how">
            How to play
          </button>
        </div>
        <div className="hw-quality" role="radiogroup" aria-label="Graphics">
          <span>Graphics</span>
          {(["auto", "low", "medium", "high"] as const).map((q) => (
            <button key={q} role="radio" aria-checked={game.prefs.quality === q} className={game.prefs.quality === q ? "on" : ""} onClick={() => game.setPrefs({ quality: q })}>
              {q[0].toUpperCase() + q.slice(1)}
            </button>
          ))}
        </div>
        {help && (
          <ul className="hw-help" data-testid="hw-help">
            <li>
              <b>On foot:</b> WASD to move, mouse to look, Shift to sprint, Space to jump. Left click fires, right click aims (it locks on). Q / X or the wheel switch weapons, R reloads.
            </li>
            <li>
              <b>Vehicles:</b> F gets in (or drags the driver out) and out. W / S drive and brake, A / D steer, Space for the handbrake, H for the horn, N changes the radio.
            </li>
            <li>
              <b>The phone:</b> Tab (jobs) or M (map). Tap the map to set a waypoint. C switches between Nina and Dex.
            </li>
            <li>
              <b>The law:</b> crimes the police see (or someone reports) earn stars. Break their line of sight and leave the search area, or get a respray at Spray Bay.
            </li>
            <li>
              <b>Touch:</b> drag on the left to move or steer, drag on the right to look; the buttons fire, aim, jump, sprint, get in and out, and drive.
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ HUD */

function Hud({ game, s }: { game: Game; s: State }) {
  const h = game.hud();
  const p = player(s);
  const prompt = game.prompt();
  return (
    <div className="hw-hud" data-testid="hw-hud">
      <div className="hw-tl">
        <div className="hw-where" data-testid="hw-where">
          <b>{h.where.street}</b>
          <small>
            {clockText(h.clock)} · Day {h.day}
          </small>
        </div>
        <button className="hw-chip" onClick={() => game.openPhone("leads")} data-testid="hw-lead-chip" aria-label={`Playing as ${h.lead.full}. Open the phone.`}>
          <i className={`hw-dot ${h.lead.id}`} aria-hidden /> {h.lead.name}
        </button>
        {h.car && (
          <button className="hw-chip radio" onClick={() => game.cycleRadio()} data-testid="hw-radio" aria-label={`Radio: ${h.radio.name}. Change station.`}>
            📻 {h.radio.name}
          </button>
        )}
        <button className="hw-chip phone" onClick={() => game.openPhone()} data-testid="hw-phone-btn" aria-label="Open the phone (map, jobs, settings)">
          📱 <span className="hw-long">Phone</span>
        </button>
      </div>
      <div className="hw-tr">
        <div className="hw-money" data-testid="hw-money">
          {money(h.money)}
        </div>
        <div className={`hw-stars ${h.wanted && !h.seen ? "search" : ""}`} data-testid="hw-wanted" aria-label={`Wanted level ${h.wanted} of 5`}>
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={i <= h.wanted ? "on" : ""}>
              ★
            </span>
          ))}
        </div>
        <div className="hw-weapon" data-testid="hw-weapon">
          <span className="ic" aria-hidden>
            {h.weapon.icon}
          </span>
          <span>
            <b>{h.weapon.name}</b>
            {!h.weapon.melee && (
              <small>
                {h.weapon.thrown ? h.ammo : h.reloading ? "Reloading…" : `${h.clip} / ${h.ammo}`}
              </small>
            )}
          </span>
        </div>
      </div>
      <div className="hw-bl">
        <Minimap game={game} s={s} />
        <div className="hw-bars" role="img" aria-label={`Health ${Math.round(h.hp)}, armour ${Math.round(h.armor)}`}>
          <i className="hp" style={{ width: `${Math.max(0, Math.min(100, h.hp))}%` }} />
          <i className="ar" style={{ width: `${Math.max(0, Math.min(100, h.armor))}%` }} />
        </div>
        {h.car && (
          <div className="hw-speed" data-testid="hw-speed">
            <b>{Math.round(h.car.speed * (game.prefs.mph ? 2.237 : 3.6))}</b>
            <small>{game.prefs.mph ? "mph" : "km/h"}</small>
            <i style={{ width: `${Math.max(0, h.car.hp) * 100}%` }} className={h.car.hp < 0.3 ? "low" : ""} />
          </div>
        )}
      </div>
      <div className="hw-bottom">
        {game.line && (
          <p className="hw-line" data-testid="hw-line">
            <b className={game.line.who === "Nina" ? "nina" : game.line.who === "Dex" ? "dex" : ""}>{game.line.who}:</b> {game.line.text}
          </p>
        )}
        {h.objective && (
          <p className="hw-obj" data-testid="hw-objective">
            {h.objective}
          </p>
        )}
        {!h.objective && prompt && (
          <p className="hw-prompt" data-testid="hw-prompt">
            {prompt}
          </p>
        )}
        {!s.story.run && !h.objective && !prompt && h.next && h.next.lead !== s.chars[s.active].id && s.t % 20 < 6 && (
          <p className="hw-prompt dim">Switch to {LEADS[h.next.lead].name} to carry on the story (phone · Leads).</p>
        )}
      </div>
      <div className="hw-toasts" aria-live="polite">
        {game.toasts.map((t) => (
          <div key={t.id} className={`hw-toast ${t.kind}`} data-testid="hw-toast">
            {t.text}
          </div>
        ))}
      </div>
      {p && p.state === "ok" && !p.car && p.aiming && <div className="hw-cross" aria-hidden />}
    </div>
  );
}

function Minimap({ game, s }: { game: Game; s: State }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      if (!c || !game.view || !game.s) return;
      const size = c.clientWidth;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(size * dpr)) {
        c.width = Math.round(size * dpr);
        c.height = Math.round(size * dpr);
      }
      const g = c.getContext("2d");
      if (!g) return;
      drawMinimap(g, game.s, size, dpr, game.view.rig.heading, game.gps(game.s), performance.now() / 1000);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [game]);
  void s;
  return (
    <button className="hw-mini" onClick={() => game.openPhone("map")} aria-label="Minimap: open the full map" data-testid="hw-minimap">
      <canvas ref={ref} />
    </button>
  );
}

function Overlays({ game }: { game: Game }) {
  const b = game.banner;
  if (!b) return null;
  return (
    <div className={`hw-banner ${b.kind}`} key={b.id} data-testid="hw-banner" role="status">
      <h3>{b.title}</h3>
      {b.sub && <p>{b.sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ touch */

function Touch({ game, s }: { game: Game; s: State }) {
  const stick = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number } | null>(null);
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const car = playerCar(s);
  const p = player(s);
  const left = game.prefs.touchLayout === "left";
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const moveSide = left ? x > r.width * 0.55 : x < r.width * 0.45;
    if (moveSide && !stick.current) {
      stick.current = { id: e.pointerId, ox: x, oy: y };
      setKnob({ ox: x, oy: y, x, y });
    } else if (!look.current) look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (stick.current?.id === e.pointerId) {
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const R = 54;
      let dx = x - stick.current.ox;
      let dy = y - stick.current.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      game.touchStick(dx / R, -dy / R);
      setKnob({ ox: stick.current.ox, oy: stick.current.oy, x: stick.current.ox + dx, y: stick.current.oy + dy });
    } else if (look.current?.id === e.pointerId) {
      game.touchLook(e.clientX - look.current.x, e.clientY - look.current.y);
      look.current.x = e.clientX;
      look.current.y = e.clientY;
    }
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (stick.current?.id === e.pointerId) {
      stick.current = null;
      game.touchStick(0, 0);
      setKnob(null);
    }
    if (look.current?.id === e.pointerId) look.current = null;
  };
  const hold = (k: "fire" | "aim" | "sprint" | "gas" | "brake" | "handbrake", label: string, cls: string, testid: string) => (
    <button
      className={`hw-tb ${cls}`}
      aria-label={label}
      data-testid={testid}
      onPointerDown={(e) => {
        e.stopPropagation();
        game.touchHold(k, true);
        (e.currentTarget as HTMLElement).classList.add("on");
      }}
      onPointerUp={(e) => {
        game.touchHold(k, false);
        (e.currentTarget as HTMLElement).classList.remove("on");
      }}
      onPointerLeave={(e) => {
        game.touchHold(k, false);
        (e.currentTarget as HTMLElement).classList.remove("on");
      }}
      onPointerCancel={() => game.touchHold(k, false)}
    >
      {label}
    </button>
  );
  const tap = (fn: () => void, label: string, cls: string, testid: string) => (
    <button
      className={`hw-tb ${cls}`}
      aria-label={label}
      data-testid={testid}
      onPointerDown={(e) => {
        e.stopPropagation();
        fn();
      }}
    >
      {label}
    </button>
  );
  return (
    <div className={`hw-touchlayer${left ? " flip" : ""}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid="hw-touch">
      {knob && (
        <div className="hw-stick" style={{ left: knob.ox - 60, top: knob.oy - 60 }} aria-hidden>
          <i style={{ transform: `translate(${knob.x - knob.ox}px, ${knob.y - knob.oy}px)` }} />
        </div>
      )}
      <div className="hw-tpad" onPointerDown={(e) => e.stopPropagation()}>
        {car ? (
          <>
            {hold("gas", "Gas", "big gas", "hw-t-gas")}
            {hold("brake", "Brake", "mid brake", "hw-t-brake")}
            {hold("handbrake", "Drift", "small", "hw-t-hand")}
            {(p.weapon === "pistol" || p.weapon === "smg" || p.ammo.pistol !== undefined || p.ammo.smg !== undefined) && hold("fire", "Shoot", "small fire", "hw-t-fire")}
            {tap(() => game.press("enter"), "Exit", "small exit", "hw-t-enter")}
          </>
        ) : (
          <>
            {hold("fire", WEAPONS[p.weapon].melee ? "Hit" : "Fire", "big fire", "hw-t-fire")}
            <button
              className={`hw-tb mid ${game.touchAimToggle ? "on" : ""}`}
              aria-pressed={game.touchAimToggle}
              aria-label="Aim"
              data-testid="hw-t-aim"
              onPointerDown={(e) => {
                e.stopPropagation();
                game.toggleAim();
              }}
            >
              Aim
            </button>
            {tap(() => game.press("jump"), "Jump", "small", "hw-t-jump")}
            {hold("sprint", "Run", "small", "hw-t-sprint")}
            {tap(() => game.press("enter"), "Car", "small exit", "hw-t-enter")}
            {tap(() => game.press("next"), "⇄", "small", "hw-t-weapon")}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the phone */

const TABS: [PhoneTab, string, string][] = [
  ["map", "🗺️", "Map"],
  ["missions", "⭐", "Jobs"],
  ["leads", "👥", "Leads"],
  ["stats", "📊", "Stats"],
  ["settings", "⚙️", "Settings"],
];

function Phone({ game, s }: { game: Game; s: State }) {
  return (
    <div className="hw-phone-wrap" role="dialog" aria-modal="true" aria-label="Phone" data-testid="hw-phone" onPointerDown={(e) => e.stopPropagation()}>
      <div className="hw-phone">
        <header>
          <b>{clockText(s.clock)}</b>
          <span>{LEADS[s.chars[s.active].id].name}&apos;s phone</span>
          <button className="hw-x" onClick={() => game.closePanel()} aria-label="Close the phone" data-testid="hw-phone-close">
            ✕
          </button>
        </header>
        <div className="hw-screen">
          {game.tab === "map" && <MapTab game={game} s={s} />}
          {game.tab === "missions" && <Jobs game={game} s={s} />}
          {game.tab === "leads" && <Leads game={game} s={s} />}
          {game.tab === "stats" && <Stats s={s} />}
          {game.tab === "settings" && <Settings game={game} />}
        </div>
        <nav className="hw-apps" role="tablist" aria-label="Phone apps">
          {TABS.map(([k, ic, label]) => (
            <button key={k} role="tab" aria-selected={game.tab === k} className={game.tab === k ? "on" : ""} onClick={() => game.setTab(k)} data-testid={`hw-tab-${k}`}>
              <span aria-hidden>{ic}</span>
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function MapTab({ game, s }: { game: Game; s: State }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const view = useRef({ cx: sim.playerPos(s).x, cz: sim.playerPos(s).z, zoom: 0.6 });
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      if (!c || !game.s) return;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const g = c.getContext("2d");
      if (g) drawFullMap(g, game.s, w, h, view.current, game.gps(game.s), performance.now() / 1000);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [game]);
  const zoom = (k: number) => (view.current.zoom = Math.max(0.18, Math.min(3, view.current.zoom * k)));
  return (
    <div className="hw-map">
      <canvas
        ref={ref}
        data-testid="hw-map"
        aria-label="Map of Port Solano: drag to move, pinch or scroll to zoom, tap to set a waypoint"
        onWheel={(e) => zoom(e.deltaY > 0 ? 0.85 : 1.18)}
        onPointerDown={(e) => {
          pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const pts = pinch.current;
          if (pts.size === 2 && pts.has(e.pointerId)) {
            const [a, b] = [...pts.values()];
            const d0 = Math.hypot(a.x - b.x, a.y - b.y);
            pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const [c, d] = [...pts.values()];
            const d1 = Math.hypot(c.x - d.x, c.y - d.y);
            if (d0 > 0) zoom(d1 / d0);
            if (drag.current) drag.current.moved = true;
            return;
          }
          pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const dr = drag.current;
          if (!dr) return;
          const dx = e.clientX - dr.x;
          const dy = e.clientY - dr.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) dr.moved = true;
          view.current.cx -= dx / view.current.zoom;
          view.current.cz -= dy / view.current.zoom;
          dr.x = e.clientX;
          dr.y = e.clientY;
        }}
        onPointerUp={(e) => {
          pinch.current.delete(e.pointerId);
          const dr = drag.current;
          drag.current = null;
          if (dr && !dr.moved) {
            const r = e.currentTarget.getBoundingClientRect();
            const w = toWorld(e.clientX - r.left, e.clientY - r.top, r.width, r.height, view.current);
            game.setWaypoint(w.x, w.z);
          }
        }}
      />
      <div className="hw-map-tools">
        <button onClick={() => zoom(1.3)} aria-label="Zoom in">
          +
        </button>
        <button onClick={() => zoom(1 / 1.3)} aria-label="Zoom out">
          −
        </button>
        <button
          onClick={() => {
            const p = sim.playerPos(s);
            view.current.cx = p.x;
            view.current.cz = p.z;
          }}
          aria-label="Centre on you"
        >
          ◎
        </button>
        {s.waypoint && (
          <button onClick={() => game.setWaypoint(s.waypoint!.x, s.waypoint!.z)} aria-label="Clear the waypoint" data-testid="hw-clear-wp">
            ✕
          </button>
        )}
      </div>
      <p className="hw-legend">
        <i className="y" /> Mission <i className="g" /> Safehouse <i className="o" /> Guns <i className="v" /> Clothes <i className="t" /> Spray Bay <i className="p" /> Waypoint
      </p>
    </div>
  );
}

function Jobs({ game, s }: { game: Game; s: State }) {
  const r = s.story.run;
  const next = nextStory(s);
  const wp = (x: number, z: number) => {
    game.setWaypoint(x, z);
    game.say("Waypoint set", "info");
  };
  return (
    <div className="hw-list" data-testid="hw-jobs">
      {r && (
        <div className="hw-card now">
          <small>On a job</small>
          <b>{STORY.find((m) => m.id === r.id)?.name ?? RACES.find((x) => x.id === r.id)?.name}</b>
          <p>{r.text}</p>
        </div>
      )}
      <h4>The story · {s.story.done.length} of {STORY.length}</h4>
      {STORY.map((m) => {
        const done = s.story.done.includes(m.id);
        const isNext = next?.id === m.id;
        return (
          <div key={m.id} className={`hw-row ${done ? "done" : isNext ? "next" : "locked"}`} data-testid={`hw-story-${m.id}`}>
            <span className={`hw-dot ${m.lead}`} aria-hidden />
            <span className="t">
              <b>{done ? "✓ " : ""}{isNext || done ? m.name : "???"}</b>
              <small>{isNext || done ? m.blurb : "Not yet"}</small>
            </span>
            {isNext && !r && (
              <button
                className="hw-btn small"
                onClick={() => {
                  const st = missionStart(s, m);
                  wp(st.x, st.z);
                }}
              >
                {m.lead === s.chars[s.active].id ? "Go" : `${LEADS[m.lead].name}'s`}
              </button>
            )}
          </div>
        );
      })}
      <h4>Street races</h4>
      {RACES.map((race) => (
        <div key={race.id} className="hw-row">
          <span className="t">
            <b>🏁 {race.name}</b>
            <small>
              Prize {money(race.prize)} · won {s.story.races[race.id] ?? 0}× · drive into the start in any car
            </small>
          </span>
          <button className="hw-btn small" onClick={() => wp(race.pts[0].x, race.pts[0].z)}>
            Go
          </button>
        </div>
      ))}
      <h4>Odd jobs</h4>
      <div className="hw-row">
        <span className="t">
          <b>🚗 Dockside Motors wants a {VEHICLES[s.story.exportCar].name}</b>
          <small>{s.story.done.includes("wheels") ? "Bring one in today for cash (the better its condition, the more)." : "Unlocks after the story mission Hot Wheels."}</small>
        </span>
        <button
          className="hw-btn small"
          onClick={() => {
            const ch = s.city.pois.find((p) => p.id === "chop")!;
            wp(ch.x, ch.z);
          }}
        >
          Go
        </button>
      </div>
      <div className="hw-row">
        <span className="t">
          <b>🏪 Quik Stop hold-ups</b>
          <small>Aim a gun at the till in any Quik Stop. {s.stats.stores} done. Brings two stars.</small>
        </span>
      </div>
      <div className="hw-row">
        <span className="t">
          <b>☀️ Sun tokens · {s.story.tokens.length} / {TOKENS.length}</b>
          <small>Hidden all over Port Solano: $250 each, $5,000 for the set.</small>
        </span>
      </div>
    </div>
  );
}

function Leads({ game, s }: { game: Game; s: State }) {
  const can = sim.canSwitch(s);
  return (
    <div className="hw-list" data-testid="hw-leads">
      {s.chars.map((c, i) => {
        const L = LEADS[c.id];
        const me = i === s.active;
        return (
          <div key={c.id} className={`hw-card lead ${c.id} ${me ? "me" : ""}`}>
            <b>
              {L.full} {me && <small>· playing</small>}
            </b>
            <p>{L.blurb}</p>
            <p className="perk">{L.perk}</p>
            {!me && (
              <button className="hw-btn primary" disabled={!!can} onClick={() => game.switchLead()} data-testid="hw-switch">
                {can ?? `Switch to ${L.name}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stats({ s }: { s: State }) {
  const st = s.stats;
  const rows: [string, string][] = [
    ["Time played", `${Math.floor(st.played / 60)} min`],
    ["Money earned", money(st.earned)],
    ["Money spent", money(st.spent)],
    ["Story missions", `${s.story.done.length} / ${STORY.length}`],
    ["Driven", `${(st.driven / 1609).toFixed(1)} miles`],
    ["Walked", `${(st.walked / 1609).toFixed(1)} miles`],
    ["Top speed", `${Math.round(st.topSpeed * 2.237)} mph`],
    ["Cars stolen", `${st.carsStolen}`],
    ["Shots fired", `${st.shots}`],
    ["Accuracy", st.shots ? `${Math.round((st.hits / st.shots) * 100)}%` : "–"],
    ["Takedowns", `${st.kills}`],
    ["Highest wanted level", `${"★".repeat(st.maxWanted) || "–"}`],
    ["Arrests", `${st.arrests}`],
    ["Hospital visits", `${st.hospital}`],
    ["Stores held up", `${st.stores}`],
    ["Races won", `${st.races}`],
    ["Cars exported", `${st.exports}`],
    ["Explosions", `${st.explosions}`],
    ["Jumps", `${st.jumps}`],
    ["Sun tokens", `${s.story.tokens.length} / ${TOKENS.length}`],
  ];
  return (
    <div className="hw-list" data-testid="hw-stats" tabIndex={0} aria-label="Stats">
      <dl className="hw-stats">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Settings({ game }: { game: Game }) {
  const p = game.prefs;
  const seg = (label: string, value: string, opts: [string, string][], set: (v: string) => void): ReactNode => (
    <div className="hw-set">
      <span>{label}</span>
      <div className="hw-seg" role="radiogroup" aria-label={label}>
        {opts.map(([v, l]) => (
          <button key={v} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => set(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="hw-list" data-testid="hw-settings">
      {seg("Graphics", p.quality, [["auto", "Auto"], ["low", "Low"], ["medium", "Medium"], ["high", "High"]], (v) => game.setPrefs({ quality: v as never }))}
      <label className="hw-set">
        <span>Sound</span>
        <input type="range" min={0} max={1} step={0.05} value={p.volume} onChange={(e) => game.setPrefs({ volume: Number(e.target.value) })} />
      </label>
      <label className="hw-set">
        <span>Radio</span>
        <input type="range" min={0} max={1} step={0.05} value={p.music} onChange={(e) => game.setPrefs({ music: Number(e.target.value) })} />
      </label>
      <label className="hw-set">
        <span>Look speed</span>
        <input type="range" min={0.3} max={2.5} step={0.1} value={p.sens} onChange={(e) => game.setPrefs({ sens: Number(e.target.value) })} />
      </label>
      {seg("Station", game.s?.radio ?? "neon", STATIONS.map((x) => [x.id, x.name]), (v) => game.setRadio(v as never))}
      {seg("Invert look", p.invert ? "on" : "off", [["off", "Off"], ["on", "On"]], (v) => game.setPrefs({ invert: v === "on" }))}
      {seg("Aim assist", p.aimAssist ? "on" : "off", [["on", "On"], ["off", "Off"]], (v) => game.setPrefs({ aimAssist: v === "on" }))}
      {seg("Speed", p.mph ? "mph" : "kmh", [["mph", "mph"], ["kmh", "km/h"]], (v) => game.setPrefs({ mph: v === "mph" }))}
      {game.coarse && seg("Stick on the", p.touchLayout, [["right", "Left"], ["left", "Right"]], (v) => game.setPrefs({ touchLayout: v as never }))}
      <div className="hw-set end">
        <button
          className="hw-btn"
          onClick={() => {
            game.persist();
            game.say("Game saved", "good");
          }}
          data-testid="hw-save"
        >
          Save
        </button>
        <button className="hw-btn ghost" onClick={() => game.quitToTitle()} data-testid="hw-quit">
          Save &amp; quit to title
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ shops */

function Shop({ game, s }: { game: Game; s: State }) {
  const p = game.shop!;
  const pl = player(s);
  const cs = s.chars[s.active];
  const close = (
    <button className="hw-x" onClick={() => game.closePanel()} aria-label="Leave" data-testid="hw-shop-close">
      ✕
    </button>
  );
  let body: ReactNode = null;
  if (p.kind === "gunshop") {
    const list: WeaponId[] = ["bat", "pistol", "smg", "shotgun", "rifle", "grenade"];
    body = (
      <div className="hw-list">
        {list.map((w) => {
          const spec = WEAPONS[w];
          const owned = pl.ammo[w] !== undefined;
          const price = owned ? spec.ammo[1] : spec.price;
          return (
            <div key={w} className="hw-row" data-testid={`hw-buy-${w}`}>
              <span className="ic" aria-hidden>
                {spec.icon}
              </span>
              <span className="t">
                <b>{spec.name}</b>
                <small>{spec.melee ? "Close up." : owned ? `Ammo: ${spec.ammo[0]} rounds` : `${spec.dmg * spec.pellets} damage · ${spec.auto ? "automatic" : "semi-auto"} · ${spec.clip} a clip`}</small>
              </span>
              <button className="hw-btn small" disabled={(owned && spec.melee) || s.money < price} onClick={() => game.act(() => sim.buyWeapon(s, w), owned ? "Ammo bought" : `${spec.name} bought`)}>
                {owned && spec.melee ? "Owned" : money(price)}
              </button>
            </div>
          );
        })}
        <div className="hw-row" data-testid="hw-buy-armor">
          <span className="ic" aria-hidden>
            🦺
          </span>
          <span className="t">
            <b>Body armour</b>
            <small>Soaks up two-thirds of every hit until it&apos;s gone.</small>
          </span>
          <button className="hw-btn small" disabled={pl.armor >= 100 || s.money < ARMOR_PRICE} onClick={() => game.act(() => sim.buyArmor(s), "Armour on")}>
            {money(ARMOR_PRICE)}
          </button>
        </div>
      </div>
    );
  } else if (p.kind === "clothes") {
    body = (
      <div className="hw-list">
        {OUTFITS.filter((o) => !o.only || o.only === cs.id).map((o) => {
          const owned = cs.outfits.includes(o.id);
          return (
            <div key={o.id} className="hw-row" data-testid={`hw-outfit-${o.id}`}>
              <span className="hw-swatch" style={{ background: `linear-gradient(135deg, ${o.shirt} 50%, ${o.pants} 50%)` }} aria-hidden />
              <span className="t">
                <b>{o.name}</b>
                <small>{cs.outfit === o.id ? "Wearing it" : owned ? "In your wardrobe" : money(o.price)}</small>
              </span>
              <button className="hw-btn small" disabled={cs.outfit === o.id || (!owned && s.money < o.price)} onClick={() => game.act(() => sim.buyOutfit(s, o.id), `Wearing ${o.name}`)}>
                {owned ? "Wear" : "Buy"}
              </button>
            </div>
          );
        })}
      </div>
    );
  } else if (p.kind === "respray") {
    const car = playerCar(s);
    body = (
      <div className="hw-list">
        <p className="hw-note">{car ? `A new colour, the dents knocked out, and the police lose your description. ${money(RESPRAY_PRICE)}.` : "Drive in to get a respray."}</p>
        <div className="hw-paints">
          {PAINT.map((c) => (
            <button key={c} style={{ background: c }} aria-label={`Paint ${c}`} disabled={!car || s.money < RESPRAY_PRICE} onClick={() => game.act(() => sim.respray(s, c), "Fresh paint. Nobody'd recognise it.")} />
          ))}
        </div>
      </div>
    );
  } else if (p.kind === "safehouse") {
    const L = LEADS[cs.id];
    body = (
      <div className="hw-list">
        <p className="hw-note">Home. The game&apos;s saved.</p>
        <div className="hw-row">
          <span className="t">
            <b>😴 Sleep</b>
            <small>Until 8 o&apos;clock (morning or evening). Back to full health.</small>
          </span>
          <button className="hw-btn small" onClick={() => game.sleep()} data-testid="hw-sleep">
            Sleep
          </button>
        </div>
        <h4>Wardrobe</h4>
        {cs.outfits.map((id) => {
          const o = OUTFITS.find((x) => x.id === id)!;
          return (
            <div key={id} className="hw-row">
              <span className="hw-swatch" style={{ background: `linear-gradient(135deg, ${o.shirt} 50%, ${o.pants} 50%)` }} aria-hidden />
              <span className="t">
                <b>{o.name}</b>
              </span>
              <button className="hw-btn small" disabled={cs.outfit === id} onClick={() => game.act(() => sim.buyOutfit(s, id), `Wearing ${o.name}`)}>
                Wear
              </button>
            </div>
          );
        })}
        <p className="hw-note">{L.perk}</p>
      </div>
    );
  }
  return (
    <div className="hw-shop-wrap" role="dialog" aria-modal="true" aria-label={p.name} data-testid="hw-shop" onPointerDown={(e) => e.stopPropagation()}>
      <div className="hw-shop">
        <header>
          <span>
            <b>{p.name}</b>
            <small>{money(s.money)}</small>
          </span>
          {close}
        </header>
        {body}
      </div>
    </div>
  );
}
