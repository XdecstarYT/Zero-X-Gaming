"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { PoweredBy } from "@/nextx/PoweredBy";
import { GlassDefs, canRefract, trackSheen } from "@/nextx/glass";
import { BONDS, CHANGELOG, JOBS, KIND_ORDER, KINDS, type Bond, type Kind } from "../data";
import { fmt, money, TWO_POINT, type Game, type Panel, type Tool } from "../game";
import { clockOf, costOf, cure, dayOf, dims, minutesOf } from "../model";
import type { Quality } from "../render/view";

const noSubscribe = () => () => {};

export function useGame(game: Game) {
  return useSyncExternalStore(game.subscribe, () => game.version, () => 0);
}

const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: "look", icon: "👆", label: "Look" },
  { id: "lay", icon: "🧱", label: "Lay" },
  { id: "wall", icon: "🏗️", label: "Wall" },
  { id: "footing", icon: "⛏️", label: "Footing" },
  { id: "slab", icon: "▭", label: "Slab" },
  { id: "frame", icon: "🪵", label: "Frame" },
  { id: "floor", icon: "▤", label: "Floor" },
  { id: "roof", icon: "🏠", label: "Roof" },
  { id: "demolish", icon: "🔨", label: "Knock out" },
  { id: "measure", icon: "📏", label: "Measure" },
];

const WALL_KINDS: Kind[] = ["brick", "block", "stone", "glassblock"];
const stars = (n: number) => `${"★".repeat(Math.floor(n))}${n % 1 ? "½" : ""}${"☆".repeat(Math.max(0, 5 - Math.ceil(n)))}`;

export function App({ game }: { game: Game }) {
  useGame(game);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const refract = useSyncExternalStore(noSubscribe, canRefract, () => false);
  useEffect(() => (root.current ? trackSheen(root.current, ".gw-glass, .gw-btn") : undefined), []);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    game.attach(c);
    return () => game.detach();
  }, [game]);
  return (
    <div ref={root} className={`gw${refract ? " gw-refract" : ""}`} data-testid="gw-root">
      <GlassDefs prefix="gw" />
      <canvas ref={canvas} className="gw-canvas" aria-label="The building site. Drag to turn, pinch or scroll to zoom, two fingers or right-drag to move." tabIndex={0} data-testid="gw-canvas" />
      {game.screen === "title" && <Title game={game} />}
      {game.screen === "play" && game.s && (
        <>
          <TopBar game={game} />
          <Toasts game={game} />
          {game.measure != null && (
            <div className="gw-tape num" data-testid="gw-tape">
              {game.measure.toFixed(3)} m
            </div>
          )}
          <Side game={game} />
          {game.pending ? <Confirm game={game} /> : !game.panel && <Options game={game} />}
          {game.panel && <Panels game={game} />}
          <Dock game={game} />
        </>
      )}
      {game.loading < 1 && (
        <div className="gw-loading gw-glass" role="status" data-testid="gw-loading">
          Setting out the site…
          <div className="gw-prog">
            <i />
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ title */

function Title({ game }: { game: Game }) {
  const p = game.prefs;
  const total = Object.values(p.stars).reduce((a, b) => a + b, 0);
  const tp = game.panel;
  return (
    <>
      <div className="gw-title" data-testid="gw-title">
        <PoweredBy />
        <h1 className="gw-logo">
          Ground<span>work</span>
        </h1>
        <p className="gw-tag">Build anything from scratch, brick by brick. Pour the footings, lay every course, frame it, roof it, and get it past the inspector.</p>
        <div className="gw-menu">
          {game.hasSave && (
            <button className="gw-btn white wide" type="button" onClick={() => game.freeBuild()} data-testid="gw-continue">
              Continue building
            </button>
          )}
          <button className={`gw-btn wide${game.hasSave ? "" : " white"}`} type="button" onClick={() => game.freeBuild(true)} data-testid="gw-free">
            🧱 Free build: an empty plot
          </button>
          <button className="gw-btn orange wide" type="button" onClick={() => game.openPanel("jobs")} data-testid="gw-career">
            🦺 Career {total > 0 && <span className="num">· {stars(Math.min(5, total / JOBS.length))}</span>}
          </button>
          <div className="gw-actions">
            <button className="gw-btn grow" type="button" onClick={() => game.openPanel("changelog")} data-testid="gw-changelog-open">
              📰 Change log
            </button>
            <button className="gw-btn grow" type="button" onClick={() => game.openPanel("settings")} data-testid="gw-settings-open">
              ⚙️ Settings
            </button>
          </div>
        </div>
      </div>
      {tp && (
        <div className="gw-title-panel" onClick={(e) => e.target === e.currentTarget && game.openPanel(null)}>
          {tp === "jobs" ? <JobsPanel game={game} center /> : tp === "changelog" ? <ChangeLog game={game} center /> : tp === "settings" ? <Settings game={game} center /> : null}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ the bar */

function TopBar({ game }: { game: Game }) {
  const s = game.s!;
  const job = game.job;
  const days = dayOf(s.minutes);
  const late = job && days > job.days;
  return (
    <div className="gw-top">
      <div className="gw-bar gw-glass">
        <button className="gw-btn icon" type="button" onClick={() => game.quit()} aria-label="Back to the menu" data-testid="gw-quit">
          ‹
        </button>
        <button className="gw-site" type="button" onClick={() => game.openPanel(job ? "job" : "tally")} data-testid="gw-site">
          <b>{job ? `${job.icon} ${job.title}` : "Free build"}</b>
          <small>{job ? job.client : "Your own plot, 30 × 30 m"}</small>
        </button>
      </div>
      <div className="gw-bar gw-glass gw-stats">
        {job ? <Stat label="Cash" value={money(s.money)} cls={s.money < job.budget * 0.15 ? "bad" : ""} id="money" /> : <Stat label="Spent" value={money(s.spent)} id="spent" />}
        {job && <Stat label="Budget" value={money(job.budget)} cls={s.spent > job.budget ? "bad" : "dim"} id="budget" />}
        <Stat label={job ? `Day of ${job.days}` : "Day"} value={`${days} · ${clockOf(s.minutes)}`} cls={late ? "bad" : ""} id="day" />
        <Stat label="Pieces" value={fmt(s.pieces.length)} id="pieces" />
      </div>
      <div className="gw-bar gw-glass gw-tools">
        <button className="gw-btn icon" type="button" onClick={() => game.undo()} aria-label="Undo" data-testid="gw-undo">
          ↶
        </button>
        <button className="gw-btn icon" type="button" onClick={() => game.redo()} aria-label="Redo" data-testid="gw-redo">
          ↷
        </button>
        <button className="gw-btn icon" type="button" onClick={() => game.openPanel("help")} aria-label="How to build" data-testid="gw-help-open">
          ?
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, cls, id }: { label: string; value: string; cls?: string; id: string }) {
  return (
    <div className="gw-stat">
      <small>{label}</small>
      <span className={`num ${cls ?? ""}`} data-testid={`gw-${id}`}>
        {value}
      </span>
    </div>
  );
}

function Toasts({ game }: { game: Game }) {
  return (
    <div className="gw-toasts" aria-live="polite">
      {game.toasts.map((t) => (
        <div key={t.id} className={`gw-toast gw-glass ${t.kind}`} data-testid="gw-toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}

function Side({ game }: { game: Game }) {
  return (
    <div className="gw-side gw-glass">
      <button type="button" onClick={() => game.lift(0.6)} aria-label="Look higher" title="Look higher">
        ⇡
      </button>
      <button type="button" onClick={() => game.focus()} aria-label="Frame the build" title="Frame the build" data-testid="gw-focus">
        ⌖
      </button>
      <button type="button" onClick={() => game.lift(-0.6)} aria-label="Look lower" title="Look lower">
        ⇣
      </button>
    </div>
  );
}

function Dock({ game }: { game: Game }) {
  return (
    <nav className="gw-dock gw-glass" aria-label="Tools">
      {TOOLS.map((t) => (
        <button key={t.id} type="button" className={`gw-tool${game.tool === t.id ? " on" : ""}`} onClick={() => game.setTool(t.id)} aria-pressed={game.tool === t.id} data-testid={`gw-tool-${t.id}`}>
          <span aria-hidden>{t.icon}</span>
          {t.label}
        </button>
      ))}
      {game.job && (
        <button type="button" className={`gw-tool${game.panel === "job" ? " on" : ""}`} onClick={() => game.openPanel("job")} data-testid="gw-tool-job">
          <span aria-hidden>📋</span>
          Brief
        </button>
      )}
    </nav>
  );
}

/* ------------------------------------------------------------------ tool options */

function Swatches({ game, k }: { game: Game; k: Kind }) {
  const vs = KINDS[k].variants;
  if (vs.length < 2) return null;
  const cur = game.variantOf(k);
  return (
    <div className="gw-row" role="radiogroup" aria-label="Finish">
      {vs.map((v, i) => (
        <button key={v.name} type="button" className={`gw-sw${cur === i ? " on" : ""}`} style={{ background: v.color }} onClick={() => game.setVariant(i, k)} aria-label={v.name} title={v.name} aria-checked={cur === i} role="radio" data-testid={`gw-finish-${i}`} />
      ))}
      <span className="gw-hint">{vs[cur]?.name}</span>
    </div>
  );
}

function MatTile({ k, on, onClick, game }: { k: Kind; on: boolean; onClick: () => void; game: Game }) {
  const info = KINDS[k];
  const c = info.variants[game.variantOf(k)]?.color ?? info.variants[0].color;
  return (
    <button type="button" className={`gw-mat${on ? " on" : ""}`} onClick={onClick} aria-pressed={on} data-testid={`gw-kind-${k}`}>
      <i style={{ background: `linear-gradient(180deg, ${c}, color-mix(in srgb, ${c} 70%, #000))` }} />
      {info.name}
    </button>
  );
}

function Step({ label, value, dec, inc, id }: { label: string; value: string; dec: () => void; inc: () => void; id: string }) {
  return (
    <div className="gw-step">
      <span className="muted">{label}</span>
      <button type="button" onClick={dec} aria-label={`Less ${label.toLowerCase()}`} data-testid={`gw-${id}-dec`}>
        −
      </button>
      <b className="num" data-testid={`gw-${id}`}>
        {value}
      </b>
      <button type="button" onClick={inc} aria-label={`More ${label.toLowerCase()}`} data-testid={`gw-${id}-inc`}>
        +
      </button>
    </div>
  );
}

function hint(game: Game): { text: React.ReactNode; bad?: boolean } {
  const t = game.tool;
  const a = !!game.anchor;
  switch (t) {
    case "look":
      return { text: "Tap a piece to see what it is. Double-tap to look closer. Drag to walk round the site." };
    case "lay": {
      if (game.hoverWhy) return { text: game.hoverWhy, bad: true };
      if (game.hoverCut) return { text: `The brickwork there will be cut out for the ${KINDS[game.kind].name.toLowerCase()}.` };
      const k = KINDS[game.kind];
      return { text: k.mortar ? <>Tap to lay a <b>{k.name.toLowerCase()}</b> in mortar: it beds onto whatever's under it and snaps to the joint. ↻ turns it.</> : <>Tap to lay a <b>{k.name.toLowerCase()}</b>. ↻ turns it.</> };
    }
    case "wall":
      return { text: a ? "Now tap where the wall ends (a corner, if it's a rectangle)." : "Tap where the wall starts: on the ground, a footing, a slab or the top of a wall." };
    case "footing":
      return { text: a ? "Tap the other end of the trench." : "Tap where the footing starts. It's poured in a trench, its top at ground level." };
    case "slab":
      return { text: a ? "Tap the opposite corner." : "Tap one corner of the slab." };
    case "frame":
      return { text: a ? "Tap where the frame ends." : "Tap where the stud wall starts (on a slab is best)." };
    case "floor":
      return { text: a ? "Tap the opposite corner: joists span the short way, boards go across them." : "Tap one corner of the floor, at the top of the walls." };
    case "roof":
      return { text: a ? "Tap the opposite corner of the walls." : "Tap the top of one corner of the walls: the roof sits on a timber plate along the top." };
    case "demolish":
      return { text: "Tap a piece to knock it out. Anything that was resting on it comes down too.", bad: false };
    case "measure":
      return { text: a ? "Tap the other end." : "Tap where to measure from." };
  }
}

function Options({ game }: { game: Game }) {
  const t = game.tool;
  const h = hint(game);
  const tray = KIND_ORDER.filter((k) => KINDS[k].tray);
  return (
    <div className="gw-opts gw-glass" data-testid="gw-opts">
      {t === "lay" && (
        <>
          <div className="gw-scroll" role="toolbar" aria-label="Materials">
            {tray.map((k) => (
              <MatTile key={k} k={k} on={game.kind === k} onClick={() => game.setKind(k)} game={game} />
            ))}
          </div>
          <div className="gw-row">
            <Swatches game={game} k={game.kind} />
            <button type="button" className="gw-btn small" onClick={() => game.rotate()} style={{ marginLeft: "auto" }} data-testid="gw-rotate">
              ↻ Turn
            </button>
          </div>
          {KINDS[game.kind].sizes && (
            <div className="gw-scroll" role="radiogroup" aria-label="Size">
              {KINDS[game.kind].sizes!.map((s, i) => {
                const on = game.sizeOf(game.kind) === s.s;
                return (
                  <button key={s.name} type="button" className={`gw-chip${on ? " on" : ""}`} onClick={() => game.setSize(i)} role="radio" aria-checked={on} data-testid={`gw-size-${i}`}>
                    {s.name} <span className="dim num">{Math.round(s.s[0] * 1000)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      {t === "wall" && (
        <>
          <div className="gw-scroll">
            {WALL_KINDS.map((k) => (
              <MatTile key={k} k={k} on={game.wall.kind === k} onClick={() => game.setWall({ kind: k })} game={game} />
            ))}
          </div>
          <Swatches game={game} k={game.wall.kind} />
          <div className="gw-scroll" role="radiogroup" aria-label="Bond">
            {(Object.keys(BONDS) as Bond[]).map((b) => (
              <button key={b} type="button" className={`gw-chip${game.wall.bond === b ? " on" : ""}`} onClick={() => game.setWall({ bond: b })} title={BONDS[b].blurb} role="radio" aria-checked={game.wall.bond === b} data-testid={`gw-bond-${b}`}>
                {BONDS[b].name}
              </button>
            ))}
          </div>
          <div className="gw-row">
            <Step label="Courses" value={`${game.wall.courses} · ${(game.wall.courses * 0.075).toFixed(2)} m`} dec={() => game.setWall({ courses: Math.max(1, game.wall.courses - 1) })} inc={() => game.setWall({ courses: Math.min(80, game.wall.courses + 1) })} id="courses" />
            <button type="button" className={`gw-chip${game.wall.rect ? " on" : ""}`} onClick={() => game.setWall({ rect: !game.wall.rect })} aria-pressed={game.wall.rect} data-testid="gw-rect">
              ▢ Four walls
            </button>
          </div>
        </>
      )}
      {t === "footing" && (
        <div className="gw-row">
          <button type="button" className={`gw-chip${!game.footRect ? " on" : ""}`} onClick={() => game.setFootRect(false)}>
            A run
          </button>
          <button type="button" className={`gw-chip${game.footRect ? " on" : ""}`} onClick={() => game.setFootRect(true)} data-testid="gw-foot-rect">
            ▢ Round a rectangle
          </button>
        </div>
      )}
      {(t === "frame" || t === "floor") && <Swatches game={game} k={t === "frame" ? "stud" : "board"} />}
      {t === "frame" && <Step label="Height" value={`${game.frameH.toFixed(1)} m`} dec={() => game.setFrameH(Math.max(1.2, +(game.frameH - 0.3).toFixed(1)))} inc={() => game.setFrameH(Math.min(3.6, +(game.frameH + 0.3).toFixed(1)))} id="frameh" />}
      {t === "roof" && (
        <>
          <div className="gw-scroll">
            <button type="button" className={`gw-chip${game.roof.style === "gable" ? " on" : ""}`} onClick={() => game.setRoof({ style: "gable" })} data-testid="gw-roof-gable">
              ⌂ Gable
            </button>
            <button type="button" className={`gw-chip${game.roof.style === "skillion" ? " on" : ""}`} onClick={() => game.setRoof({ style: "skillion" })} data-testid="gw-roof-skillion">
              ◺ Skillion
            </button>
            <button type="button" className={`gw-chip${game.roof.cover === "tile" ? " on" : ""}`} onClick={() => game.setRoof({ cover: "tile", v: 0 })} data-testid="gw-roof-tile">
              Tiles
            </button>
            <button type="button" className={`gw-chip${game.roof.cover === "sheet" ? " on" : ""}`} onClick={() => game.setRoof({ cover: "sheet", v: 0 })} data-testid="gw-roof-sheet">
              Sheet steel
            </button>
            <button type="button" className={`gw-chip${game.roof.gables ? " on" : ""}`} onClick={() => game.setRoof({ gables: !game.roof.gables })} aria-pressed={game.roof.gables}>
              Brick gables
            </button>
          </div>
          <div className="gw-row">
            {KINDS[game.roof.cover].variants.map((v, i) => (
              <button key={v.name} type="button" className={`gw-sw${game.roof.v === i ? " on" : ""}`} style={{ background: v.color }} onClick={() => game.setRoof({ v: i })} aria-label={v.name} title={v.name} />
            ))}
            <Step label="Pitch" value={`${game.roof.pitch}°`} dec={() => game.setRoof({ pitch: Math.max(game.roof.style === "skillion" ? 5 : 15, game.roof.pitch - 5) })} inc={() => game.setRoof({ pitch: Math.min(50, game.roof.pitch + 5) })} id="pitch" />
          </div>
        </>
      )}
      {t === "demolish" && (
        <div className="gw-row">
          <button type="button" className={`gw-chip${!game.demolishGroup ? " on" : ""}`} onClick={() => ((game.demolishGroup = false), game.bump())}>
            One piece
          </button>
          <button type="button" className={`gw-chip${game.demolishGroup ? " on" : ""}`} onClick={() => ((game.demolishGroup = true), game.bump())} data-testid="gw-demolish-group">
            The whole run
          </button>
        </div>
      )}
      <div className={`gw-hint${h.bad ? " bad" : ""}`} data-testid="gw-hint">
        {h.text}
      </div>
      {TWO_POINT.includes(t) && game.anchor && (
        <button type="button" className="gw-btn small" onClick={() => game.cancel()} style={{ alignSelf: "flex-start" }}>
          Start again
        </button>
      )}
    </div>
  );
}

function Confirm({ game }: { game: Game }) {
  const p = game.pending!;
  const q = game.quote(p.specs);
  const s = game.s!;
  const short = s.mode === "career" && q.cost > s.money;
  const hours = q.mins / 60;
  return (
    <div className="gw-confirm gw-glass" data-testid="gw-confirm">
      <div className="gw-quote">
        <span>{p.label}</span>
        <b className={`num${short ? " bad" : ""}`}>{money(q.cost)}</b>
      </div>
      <div className="gw-hint">
        About {hours < 1 ? `${Math.max(1, Math.round(q.mins))} minutes'` : hours < 9 ? `${hours.toFixed(1)} hours'` : `${(hours / 9).toFixed(1)} days'`} work.{" "}
        {game.tool === "wall" && `${BONDS[game.wall.bond].name} bond, ${game.wall.courses} courses.`}
        {short && <span className="bad"> You've only {money(s.money)}: what you can afford goes in, the rest doesn't.</span>}
      </div>
      <div className="gw-actions">
        <button type="button" className="gw-btn" onClick={() => game.cancel()} data-testid="gw-cancel">
          Cancel
        </button>
        <button type="button" className="gw-btn orange grow" onClick={() => game.confirm()} data-testid="gw-build">
          Build it
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ panels */

function Sheet({ game, icon, title, sub, children, center, id }: { game: Game; icon: string; title: string; sub?: string; children: React.ReactNode; center?: boolean; id: string }) {
  return (
    <section className={`gw-panel gw-glass${center ? " center" : ""}`} data-testid={`gw-panel-${id}`} aria-label={title}>
      <div className="gw-panel-h">
        <div className="ic" aria-hidden>
          {icon}
        </div>
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        <button type="button" className="x" onClick={() => game.openPanel(null)} aria-label="Close" data-testid="gw-close">
          ✕
        </button>
      </div>
      <div className="gw-body">{children}</div>
    </section>
  );
}

function Panels({ game }: { game: Game }) {
  const p: Panel = game.panel;
  if (p === "job") return <JobPanel game={game} />;
  if (p === "report") return <ReportPanel game={game} />;
  if (p === "jobs") return <JobsPanel game={game} />;
  if (p === "help") return <Help game={game} />;
  if (p === "changelog") return <ChangeLog game={game} />;
  if (p === "settings") return <Settings game={game} />;
  if (p === "piece") return <PiecePanel game={game} />;
  if (p === "tally") return <Tally game={game} />;
  return null;
}

function Checks({ game }: { game: Game }) {
  return (
    <div className="gw-sec" data-testid="gw-checks">
      <h5>The brief</h5>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {game.checks.map((c) => (
          <div key={c.label} className={`gw-check${c.ok ? " yes" : ""}`}>
            <span className="ok" aria-hidden>
              {c.ok ? "✓" : ""}
            </span>
            <div style={{ flex: 1 }}>
              {c.label}
              <small>{c.detail}</small>
              {c.score != null && (
                <div className="bar">
                  <i style={{ width: `${Math.round(c.score * 100)}%` }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobPanel({ game }: { game: Game }) {
  const j = game.job!;
  const s = game.s!;
  return (
    <Sheet game={game} icon={j.icon} title={j.title} sub={`For ${j.client}`} id="job">
      <div className="gw-sec">
        <p>{j.brief}</p>
      </div>
      <div className="gw-tiles">
        <div className="gw-tile">
          <b className={`num${s.spent > j.budget ? " bad" : ""}`}>{money(s.spent)}</b>
          <small>spent of {money(j.budget)}</small>
        </div>
        <div className="gw-tile">
          <b className={`num${dayOf(s.minutes) > j.days ? " bad" : ""}`}>Day {dayOf(s.minutes)}</b>
          <small>of {j.days}</small>
        </div>
        <div className="gw-tile">
          <b className="num">{money(j.fee)}</b>
          <small>the fee</small>
        </div>
      </div>
      <Checks game={game} />
      <div className="gw-note">Build inside the pink string line. The inspector checks the brief, then the workmanship: walls on footings, perpends staggered (no straight joints).</div>
      <button type="button" className="gw-btn orange wide" onClick={() => game.callInspector()} data-testid="gw-inspect">
        🦺 Call the inspector
      </button>
    </Sheet>
  );
}

function ReportPanel({ game }: { game: Game }) {
  const r = game.report;
  if (!r) return null;
  return (
    <Sheet game={game} icon="🦺" title={r.passed ? "Passed inspection" : "Not passed yet"} sub={`${r.job.title} for ${r.job.client}`} id="report">
      {r.passed ? (
        <div style={{ textAlign: "center" }}>
          <div className="gw-stars" aria-label={`${r.stars} stars`} data-testid="gw-stars">
            {stars(r.stars)}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {r.job.client} will pay <b className="num">{money(r.pay)}</b>
          </div>
        </div>
      ) : (
        <div className="gw-note no">The inspector won't sign it off yet. What's still missing is below.</div>
      )}
      <div className="gw-tiles">
        <div className="gw-tile">
          <b className={`num${r.spent > r.job.budget ? " bad" : ""}`}>{money(r.spent)}</b>
          <small>of {money(r.job.budget)}</small>
        </div>
        <div className="gw-tile">
          <b className={`num${r.days > r.job.days ? " bad" : ""}`}>{r.days} days</b>
          <small>of {r.job.days}</small>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {r.checks.map((c) => (
          <div key={c.label} className={`gw-check${c.ok ? " yes" : ""}`}>
            <span className="ok" aria-hidden>
              {c.ok ? "✓" : "✕"}
            </span>
            <div>
              {c.label}
              <small>{c.detail}</small>
            </div>
          </div>
        ))}
      </div>
      {r.passed ? (
        <button type="button" className="gw-btn orange wide" onClick={() => game.handOver()} data-testid="gw-handover">
          Hand over the keys
        </button>
      ) : (
        <button type="button" className="gw-btn wide" onClick={() => game.openPanel(null)}>
          Back to work
        </button>
      )}
    </Sheet>
  );
}

function JobsPanel({ game, center }: { game: Game; center?: boolean }) {
  const p = game.prefs;
  return (
    <Sheet game={game} icon="🦺" title="Career" sub={`Earned ${money(p.earned)} so far`} center={center} id="jobs">
      <div className="gw-sec">
        <p>Each job has a client, a brief, a budget and a deadline. Finish one to unlock the next.</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {JOBS.map((j, i) => {
          const open = game.unlocked(i);
          const st = p.stars[j.id] ?? 0;
          return (
            <button key={j.id} type="button" className="gw-job" disabled={!open} onClick={() => game.startJob(j.id)} data-testid={`gw-job-${j.id}`}>
              <span className="ic" aria-hidden>
                {open ? j.icon : "🔒"}
              </span>
              <span>
                <b>{j.title}</b>
                <small>
                  {j.client} · {money(j.fee)} fee · {j.days} {j.days === 1 ? "day" : "days"}
                </small>
              </span>
              {st > 0 && <span className="st">{stars(st)}</span>}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

function PiecePanel({ game }: { game: Game }) {
  const p = game.selected;
  const s = game.s!;
  if (!p) return null;
  const k = KINDS[p.k];
  const d = dims(p);
  const c = k.mortar ? cure(s, p) : 1;
  return (
    <Sheet game={game} icon={k.icon} title={k.name} sub={k.variants[p.v]?.name} id="piece">
      <div className="gw-sec">
        <p>{k.blurb}</p>
      </div>
      <div className="gw-kv num">
        <span>Size</span>
        <span>
          {d.map((n) => Math.round(n * 1000)).join(" × ")} mm
        </span>
        <span>Height off the ground</span>
        <span>{p.y.toFixed(3)} m</span>
        <span>Cost</span>
        <span>{money(costOf(p))}</span>
        <span>Labour</span>
        <span>{Math.max(1, Math.round(minutesOf(p)))} min</span>
        {k.mortar && (
          <>
            <span>Mortar</span>
            <span>{c >= 1 ? "Set" : c > 0.5 ? "Going off" : "Wet"}</span>
          </>
        )}
      </div>
      <button type="button" className="gw-btn red wide" onClick={() => game.removeSelected()} data-testid="gw-remove">
        🔨 Knock it out
      </button>
    </Sheet>
  );
}

function Tally({ game }: { game: Game }) {
  const s = game.s!;
  const by = new Map<Kind, number>();
  for (const p of s.pieces) by.set(p.k, (by.get(p.k) ?? 0) + 1);
  const rows = [...by.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <Sheet game={game} icon="🧾" title="The site" sub={`${s.pieces.length.toLocaleString()} pieces · ${money(s.spent)}`} id="tally">
      <div className="gw-tiles">
        <div className="gw-tile">
          <b className="num">{fmt(s.stats.laid)}</b>
          <small>laid</small>
        </div>
        <div className="gw-tile">
          <b className="num">{fmt(s.stats.fell)}</b>
          <small>fell down</small>
        </div>
        <div className="gw-tile">
          <b className="num">{dayOf(s.minutes)}</b>
          <small>days' work</small>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="gw-kv num">
          {rows.map(([k, n]) => (
            <span key={k} style={{ display: "contents" }}>
              <span>
                {KINDS[k].icon} {KINDS[k].name}
              </span>
              <span>{n.toLocaleString()}</span>
            </span>
          ))}
        </div>
      )}
      {s.mode === "free" && (
        <div className="gw-actions">
          <button type="button" className="gw-btn grow" onClick={() => game.showHome()} data-testid="gw-showhome">
            🏠 Put up the show home
          </button>
          <button type="button" className="gw-btn red grow" onClick={() => game.freeBuild(true)} data-testid="gw-clear">
            Clear the plot
          </button>
        </div>
      )}
    </Sheet>
  );
}

function Help({ game }: { game: Game }) {
  return (
    <Sheet game={game} icon="📘" title="How to build" sub="From the ground up" id="help">
      <div className="gw-sec">
        <h5>Order of work</h5>
        <p>1. Pour strip footings (or a slab) where the walls go. 2. Lay the walls on them, course by course, with a bonded corner. 3. Set doors and windows in as you go: lay one into a wall and the bricks are cut out for it, and a lintel goes over. 4. Frame and roof it.</p>
      </div>
      <div className="gw-sec">
        <h5>Everything must be held up</h5>
        <p>A brick needs at least a third of its bed on something solid; a lintel or a joist needs both ends on something. Take something out and what it carried falls.</p>
      </div>
      <div className="gw-sec">
        <h5>Moving round</h5>
        <div className="gw-keys">
          <kbd>Drag</kbd>
          <span>Walk round the site</span>
          <kbd>Pinch · scroll</kbd>
          <span>Closer, further</span>
          <kbd>Two fingers · right-drag</kbd>
          <span>Move across</span>
          <kbd>⇡ ⇣</kbd>
          <span>Look higher or lower (for upper courses)</span>
          <kbd>WASD · QE</kbd>
          <span>Move, turn</span>
          <kbd>R</kbd>
          <span>Turn the piece</span>
          <kbd>Ctrl Z · Ctrl Y</kbd>
          <span>Undo, redo</span>
          <kbd>Enter · Esc</kbd>
          <span>Build it, cancel</span>
        </div>
      </div>
    </Sheet>
  );
}

function ChangeLog({ game, center }: { game: Game; center?: boolean }) {
  return (
    <Sheet game={game} icon="📰" title="Change log" center={center} id="changelog">
      {CHANGELOG.map((c) => (
        <div key={c.version} className="gw-log">
          <h4>
            {c.version} · {c.title}
          </h4>
          <small className="dim">{c.date}</small>
          <ul>
            {c.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      ))}
    </Sheet>
  );
}

function Settings({ game, center }: { game: Game; center?: boolean }) {
  const q = game.prefs.quality ?? game.quality;
  const opts: { id: Quality; name: string; blurb: string }[] = [
    { id: "high", name: "High", blurb: "Grass, soft shadows and ambient occlusion" },
    { id: "medium", name: "Medium", blurb: "Shadows and grass, lighter" },
    { id: "low", name: "Low", blurb: "For older phones" },
  ];
  return (
    <Sheet game={game} icon="⚙️" title="Settings" center={center} id="settings">
      <div className="gw-sec">
        <h5>Graphics</h5>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {opts.map((o) => (
            <button key={o.id} type="button" className={`gw-job${q === o.id ? " on" : ""}`} onClick={() => (game.setQuality(o.id), game.bump())} aria-pressed={q === o.id} data-testid={`gw-quality-${o.id}`} style={q === o.id ? { background: "rgba(255,255,255,.14)" } : undefined}>
              <span>
                <b>{o.name}</b>
                <small>{o.blurb}</small>
              </span>
              {q === o.id && <span className="st">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
