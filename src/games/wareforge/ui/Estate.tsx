"use client";

/**
 * WareForge's property panels: the estate (your buildings, land for sale in the cities, finished
 * buildings on the market), the building site (tools to plan it cell by cell and storey by storey,
 * and panels for the plans and permit, the crews and materials, the units and tenants, and the
 * money), and the bar you see walking round one of your stores.
 */
import { useState } from "react";
import { CITIES, DAY, HOUR, ITEMS, STORES, STORE_HOURS, city, type ItemId } from "../data";
import * as E from "../estate";
import type { EstateTool, Game, SitePanel } from "../game";
import * as sim from "../sim";
import type { State, Store } from "../sim";
import { mins, money, pct, short } from "./fmt";

const TONE: Record<string, string> = { good: "good", warn: "warn", grey: "grey", "": "" };

/* ====================================================================== the estate sheet */

export function EstateSheet({ g, s }: { g: Game; s: State }) {
  const tab = g.estateTab;
  const tabs: [typeof tab, string][] = [
    ["portfolio", "Your property"],
    ["land", "Land"],
    ["market", "Market"],
  ];
  return (
    <>
      <div className="wf-tabs" role="tablist" aria-label="Property">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => g.openEstate(k)} data-testid={`wf-est-${k}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "portfolio" && <Portfolio g={g} s={s} />}
      {tab === "land" && <Land g={g} s={s} />}
      {tab === "market" && <Market g={g} s={s} />}
    </>
  );
}

function Portfolio({ g, s }: { g: Game; s: State }) {
  const props = s.estate.props;
  const value = props.reduce((a, p) => a + E.value(s, p), 0);
  const owed = props.reduce((a, p) => a + p.mortgage, 0);
  const rent = props.reduce((a, p) => a + p.rentToday, 0);
  const all = props.reduce((a, p) => a + E.units(p).units.length, 0);
  const let_ = props.reduce((a, p) => a + Object.keys(p.tenants).length, 0);
  return (
    <>
      <div className="wf-kv" style={{ marginTop: 10 }}>
        <div>
          <small>Worth</small>
          <b className="num">{money(value)}</b>
        </div>
        <div>
          <small>Mortgages</small>
          <b className="num">{money(owed)}</b>
        </div>
        <div>
          <small>Rent today</small>
          <b className="num wf-up">{money(rent)}</b>
        </div>
        <div>
          <small>Units let</small>
          <b className="num">
            {let_}/{all}
          </b>
        </div>
      </div>
      <div className="wf-section">Your buildings and sites</div>
      <div className="wf-list" data-testid="wf-portfolio">
        {props.map((p) => {
          const plot = E.plotDef(p.plot);
          const st = E.status(p);
          return (
            <button key={p.id} className="wf-trow" style={{ gridTemplateColumns: "auto 1fr auto" }} onClick={() => g.openProperty(p.id)} data-testid={`wf-prop-${p.plot}`}>
              <b aria-hidden="true">{E.ZONES[plot.zone].icon}</b>
              <span style={{ minWidth: 0 }}>
                {plot.address}
                <span className="sub">
                  {plot.city} · {short(E.value(s, p))}
                  {p.rentToday > 0 ? ` · ${short(p.rentToday)} rent today` : ""}
                </span>
              </span>
              <span className={`wf-pill ${TONE[st.tone]}`}>{st.text}</span>
            </button>
          );
        })}
        {!props.length && (
          <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
            Nothing yet. Buy a plot of land (Land) and build on it brick by brick, or buy a finished building (Market) and let it.
          </p>
        )}
      </div>
      <div className="wf-seg" style={{ marginTop: 10 }}>
        <button className="wf-btn small primary" onClick={() => g.openEstate("land")}>
          🏗️ Buy land
        </button>
        <button className="wf-btn small" onClick={() => g.openEstate("market")}>
          🏢 Buildings for sale
        </button>
      </div>
    </>
  );
}

function Land({ g, s }: { g: Game; s: State }) {
  const plots = [...E.PLOTS].sort((a, b) => city(b.city).pop - city(a.city).pop || E.plotPrice(s, b) - E.plotPrice(s, a));
  return (
    <>
      <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>
        Plots in the cities, each zoned for homes, shops and offices, or both, up to so many storeys. Land in a big city costs more, and lets for more.
      </p>
      <div className="wf-list" style={{ marginTop: 10 }}>
        {plots.map((pl) => {
          const own = s.estate.props.some((p) => p.plot === pl.id);
          const price = E.plotPrice(s, pl);
          const idx = E.cityIndex(s, pl.city);
          return (
            <div key={pl.id} className="wf-item" data-testid={`wf-plot-${pl.id}`}>
              <div className="wf-between">
                <h4>
                  {E.ZONES[pl.zone].icon} {pl.address}
                </h4>
                <span className="wf-pill grey">{pl.city}</span>
              </div>
              <p>
                {pl.w * E.CELL_M} × {pl.d * E.CELL_M} m · {E.ZONES[pl.zone].name.toLowerCase()} · up to {pl.storeys} storeys
                {Math.abs(idx - 1) > 0.005 ? ` · prices ${pct(idx).toLowerCase()} on usual` : ""}
              </p>
              <div className="wf-between" style={{ marginTop: 8 }}>
                <b className="num">{money(price)}</b>
                {own ? (
                  <button className="wf-btn small" onClick={() => g.openProperty(s.estate.props.find((p) => p.plot === pl.id)!.id)}>
                    Yours: open the site
                  </button>
                ) : (
                  <button className="wf-btn small primary" disabled={!sim.afford(s, price) || s.estate.props.length >= E.MAX_PROPS} onClick={() => g.buyPlot(pl.id)} data-testid={`wf-buy-plot-${pl.id}`}>
                    Buy the land
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Market({ g, s }: { g: Game; s: State }) {
  const ls = s.estate.listings;
  const idx = [...CITIES].sort((a, b) => E.cityIndex(s, b.name) - E.cityIndex(s, a.name));
  return (
    <>
      <div className="wf-section">Buildings for sale</div>
      <div className="wf-list">
        {ls.map((l) => {
          const pl = E.plotDef(l.plot);
          const pv = E.listingPreview(s, l);
          const t = E.TEMPLATES[l.tpl];
          return (
            <div key={l.id} className="wf-item" data-testid="wf-listing">
              <div className="wf-between">
                <h4>
                  {t.icon} {pl.address}
                </h4>
                <span className={`wf-pill ${l.condition < 0.65 ? "warn" : "grey"}`}>{l.condition < 0.65 ? "Needs work" : `${Math.round(l.condition * 100)}% condition`}</span>
              </div>
              <p>
                {t.name} in {pl.city}, {l.storeys} storeys: {pv.units.length} unit{pv.units.length === 1 ? "" : "s"} ({pv.units.reduce((a, u) => a + u.area, 0)} m²), about {Math.round(l.let * 100)}% let. On the market for {mins(l.until - s.time)} more.
              </p>
              <div className="wf-between" style={{ marginTop: 8 }}>
                <b className="num">{money(l.price)}</b>
                <button className="wf-btn small primary" disabled={!sim.afford(s, l.price) || s.estate.props.length >= E.MAX_PROPS} onClick={() => g.buyListing(l.id)} data-testid="wf-buy-listing">
                  Buy it
                </button>
              </div>
            </div>
          );
        })}
        {!ls.length && <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>Nothing for sale right now: finished buildings come on the market every day or so.</p>}
      </div>
      <div className="wf-section">House prices by city</div>
      <div className="wf-list" data-testid="wf-index">
        {idx.map((c) => {
          const v = E.cityIndex(s, c.name);
          return (
            <div key={c.name} className="wf-trow" style={{ gridTemplateColumns: "1fr auto" }}>
              <span>{c.name}</span>
              <b className={`num ${v > 1.005 ? "wf-up" : v < 0.995 ? "wf-down" : "dim"}`}>
                {v > 1.005 ? "▲" : v < 0.995 ? "▼" : ""} {pct(v)}
              </b>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ====================================================================== the building site */

const TOOLS: [EstateTool, string, string][] = [
  ["found", "⬛", "Floor"],
  ["walls", "🔲", "Walls"],
  ["wall", "🧱", "Wall"],
  ["window", "🪟", "Window"],
  ["door", "🚪", "Door"],
  ["stairs", "🪜", "Stairs"],
  ["roof", "🟥", "Roof"],
  ["erase", "🧹", "Take out"],
  ["lay", "✋", "Lay bricks"],
];
const PANELS: [Exclude<SitePanel, null>, string, string][] = [
  ["plan", "📐", "Plan"],
  ["site", "🚧", "Site"],
  ["units", "🔑", "Units"],
  ["money", "💰", "Money"],
];

export function SiteHud({ g, s, p }: { g: Game; s: State; p: E.Property }) {
  const plot = E.plotDef(p.plot);
  const st = E.status(p);
  const l = g.editLevel;
  const t = g.etool;
  const hint =
    !t ? "Tap a cell to see what's there"
    : t === "erase" ? "Tap what to take out"
    : t === "lay" ? "Tap a wall going up to lay a course"
    : t === "found" || t === "slab" || t === "roof" || t === "walls" ? (g.anchor ? "Now tap the far corner" : "Tap a corner, then the far corner (the same cell twice for one)")
    : "Tap a cell";
  return (
    <>
      <div className="wf-sitebar wf-glass wf-capsule" data-testid="wf-sitebar">
        <button className="wf-btn small" onClick={() => g.leaveView()} data-testid="wf-site-back" aria-label="Back to the warehouse">
          ← <span className="lbl">Warehouse</span>
        </button>
        <span className="name">
          <b>{plot.address}</b>
          <small>
            {plot.city} · {E.ZONES[plot.zone].name}
          </small>
        </span>
        <span className={`wf-pill ${TONE[st.tone]}`} data-testid="wf-site-status">
          {st.text}
        </span>
      </div>
      {g.esel && !t && !g.panel && <CellCard g={g} s={s} p={p} />}
      {g.panel && <SitePanelSheet g={g} s={s} p={p} panel={g.panel} />}
      <div className="wf-sitetools wf-glass" data-testid="wf-sitetools">
        <div className="row">
          <div className="wf-stepper" aria-label="Storey">
            <button className="wf-btn icon small" onClick={() => g.setEditLevel(l - 1)} disabled={l <= 0} aria-label="Storey down" data-testid="wf-storey-down">
              −
            </button>
            <output className="num" data-testid="wf-storey">
              {l >= p.storeys ? "Roof" : `Storey ${l + 1}`}
            </output>
            <button className="wf-btn icon small" onClick={() => g.setEditLevel(l + 1)} disabled={l >= p.storeys} aria-label="Storey up" data-testid="wf-storey-up">
              +
            </button>
          </div>
          <button className={`wf-btn small ${g.viewLevel !== 99 ? "on" : ""}`} aria-pressed={g.viewLevel !== 99} onClick={() => g.toggleCutaway()} title="Hide the storeys above this one" data-testid="wf-cutaway">
            👁 <span className="lbl">Cut away</span>
          </button>
          <span className="spacer" />
          {PANELS.map(([k, icon, label]) => (
            <button key={k} className={`wf-btn small ${g.panel === k ? "on" : ""}`} aria-pressed={g.panel === k} onClick={() => g.setPanel(k)} data-testid={`wf-panel-${k}`}>
              <span aria-hidden="true">{icon}</span> <span className="lbl">{label}</span>
            </button>
          ))}
        </div>
        <div className="tools" role="toolbar" aria-label="Build tools">
          {TOOLS.map(([k, icon, label]) => (
            <button key={k} className={t === k ? "on" : ""} aria-pressed={t === k} onClick={() => g.setEstateTool(t === k ? null : k)} data-testid={`wf-etool-${k}`}>
              <span aria-hidden="true">{icon}</span>
              {k === "found" ? (l === 0 ? "Foundation" : "Floor") : label}
            </button>
          ))}
        </div>
        <small className="hint dim" data-testid="wf-site-hint">
          {hint}
        </small>
      </div>
    </>
  );
}

/** What's on a tapped cell: its floor and what stands on it, how far along, and what you can do. */
function CellCard({ g, s, p }: { g: Game; s: State; p: E.Property }) {
  const c = g.esel!;
  const parts = [E.fillAt(p, c.x, c.z, c.l), E.floorAt(p, c.x, c.z, c.l)].filter((x): x is E.Part => !!x);
  const line = (part: E.Part) => {
    const def = E.PARTS[part.k];
    const stage = def.stages[part.stage];
    const state = part.done
      ? `Built · ${Math.round((part.q ?? 0.9) * 100)}% workmanship`
      : !part.paid && part.prog === 0 && part.stage === 0
        ? "Planned"
        : stage?.trade === "brick"
          ? `${Math.floor(part.prog * stage.work)} of ${stage.work} bricks laid`
          : `${E.TRADES[stage.trade].name} at work · ${Math.round(part.prog * 100)}%`;
    return { def, state };
  };
  return (
    <div className="wf-cellcard wf-glass" data-testid="wf-cellcard">
      <div className="wf-between">
        <span className="wf-eyebrow">
          Cell {c.x + 1},{c.z + 1} · {c.l >= p.storeys ? "roof" : `storey ${c.l + 1}`}
        </span>
        <button className="wf-btn icon small" onClick={() => g.setEstateTool(null)} aria-label="Close">
          ✕
        </button>
      </div>
      {parts.map((part) => {
        const { def, state } = line(part);
        const brick = !part.done && def.stages[part.stage]?.trade === "brick";
        return (
          <div key={def.kind} className="wf-between" style={{ marginTop: 6, gap: 8 }}>
            <span style={{ minWidth: 0 }}>
              <b>
                {def.icon} {def.name}
              </b>
              <small className="dim" style={{ display: "block" }}>
                {state}
              </small>
            </span>
            {brick && (
              <button className="wf-btn small primary" onClick={() => g.layCourse(c.x, c.z, c.l)} data-testid="wf-lay-course">
                ✋ Lay a course
              </button>
            )}
          </div>
        );
      })}
      {!parts.length && <p className="dim" style={{ fontSize: 12.5, margin: "6px 0 0" }}>Nothing here yet: pick a tool below to plan something.</p>}
      {parts.length > 0 && (
        <div className="wf-seg" style={{ marginTop: 8 }}>
          <button className="wf-btn small" onClick={() => g.unplanAt(c.x, c.z, c.l)} data-testid="wf-unplan">
            {parts.some((x) => x.done || x.paid || x.prog > 0) ? `Demolish · ${money(E.DEMOLISH)}` : "Take it out of the plan"}
          </button>
        </div>
      )}
      <small className="dim" style={{ display: "block", marginTop: 6 }}>
        {money(s.cash)} in the bank
      </small>
    </div>
  );
}

function SitePanelSheet({ g, s, p, panel }: { g: Game; s: State; p: E.Property; panel: Exclude<SitePanel, null> }) {
  const title = { plan: "Plans & permit", site: "Crews & materials", units: "Units & tenants", money: "Value, mortgage & sale" }[panel];
  return (
    <section className="wf-sheet wf-site-sheet wf-glass" aria-label={title} data-testid={`wf-site-${panel}`}>
      <header>
        <h2>{title}</h2>
        <button className="wf-btn icon small" onClick={() => g.setPanel(null)} aria-label="Close" data-testid="wf-site-close">
          ✕
        </button>
      </header>
      <div className="body" tabIndex={0}>
        {panel === "plan" && <PlanPanel g={g} s={s} p={p} />}
        {panel === "site" && <CrewPanel g={g} s={s} p={p} />}
        {panel === "units" && <UnitsPanel g={g} s={s} p={p} />}
        {panel === "money" && <MoneyPanel g={g} s={s} p={p} />}
      </div>
    </section>
  );
}

function PlanPanel({ g, s, p }: { g: Game; s: State; p: E.Property }) {
  const plot = E.plotDef(p.plot);
  const [storeys, setStoreys] = useState(Math.min(3, p.storeys));
  const lay = E.units(p, true);
  const est = E.estimate(p);
  const started = p.parts.some((x) => x.done || x.paid || x.prog > 0);
  const tpls = (Object.keys(E.TEMPLATES) as E.Template[]).filter((t) => E.TEMPLATES[t].zones.includes(plot.zone));
  return (
    <>
      <div className="wf-kv" style={{ marginTop: 4 }}>
        <div>
          <small>Plot</small>
          <b>
            {plot.w * E.CELL_M} × {plot.d * E.CELL_M} m ({plot.w}×{plot.d} cells)
          </b>
        </div>
        <div>
          <small>Zoning</small>
          <b>
            {E.ZONES[plot.zone].icon} {E.ZONES[plot.zone].name}, {p.storeys} storeys
          </b>
        </div>
      </div>
      <div className="wf-section">Planning permission</div>
      <div className="wf-item" data-testid="wf-permit">
        <div className="wf-between" style={{ gap: 8, flexWrap: "wrap" }}>
          <b>{p.permit === "granted" ? "✅ Granted: build away" : p.permit === "pending" ? `⏳ With the planners: a decision in ${mins(Math.max(0, p.permitAt - s.time))}` : "Not applied for yet"}</b>
          {p.permit === "none" && (
            <button className="wf-btn small primary" disabled={!p.parts.length || !sim.afford(s, E.permitFee(p))} onClick={() => g.applyPermit(p.id)} data-testid="wf-apply-permit">
              Apply · {money(E.permitFee(p))}
            </button>
          )}
        </div>
        <p>Crews can&apos;t start until it&apos;s granted (they&apos;re paid if they&apos;re waiting). Plans can change after: add to them as you go.</p>
        {p.variance === "none" && (
          <button className="wf-btn small" style={{ marginTop: 6 }} disabled={!sim.afford(s, E.VARIANCE.cost)} onClick={() => g.applyVariance(p.id)} data-testid="wf-variance">
            Ask for {E.VARIANCE.storeys} more storeys · {money(E.VARIANCE.cost)} ({Math.round(E.VARIANCE.chance * 100)}% chance)
          </button>
        )}
        {p.variance !== "none" && <p>Height variance: {p.variance === "pending" ? `deciding, ${mins(Math.max(0, p.varianceAt - s.time))}` : p.variance}.</p>}
      </div>
      <div className="wf-section">Ready-made designs</div>
      <div className="wf-grid2">
        {tpls.map((t) => (
          <button key={t} className="wf-tile" disabled={started} onClick={() => g.applyTemplate(p.id, t, storeys)} data-testid={`wf-tpl-${t}`}>
            <span className="big">{E.TEMPLATES[t].icon}</span>
            <b>{E.TEMPLATES[t].name}</b>
            <small>{E.TEMPLATES[t].blurb}</small>
          </button>
        ))}
      </div>
      <div className="wf-between" style={{ marginTop: 8 }}>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {started ? "Building's under way: add to it with the tools." : "Storeys for a ready-made design"}
        </span>
        <div className="wf-stepper" aria-label="Storeys">
          <button className="wf-btn icon small" onClick={() => setStoreys(Math.max(1, storeys - 1))} aria-label="Fewer storeys">
            −
          </button>
          <output className="num">{storeys}</output>
          <button className="wf-btn icon small" onClick={() => setStoreys(Math.min(p.storeys, storeys + 1))} aria-label="More storeys">
            +
          </button>
        </div>
      </div>
      <div className="wf-section">Drawing tools</div>
      <div className="wf-seg">
        <button className="wf-btn small" onClick={() => g.copyUp(p.id)} disabled={g.editLevel < 1} title="Pick the storey with the stepper first">
          ⬆ Copy the storey below up
        </button>
        <button className="wf-btn small" onClick={() => g.roofOver(p.id)}>
          🟥 Roof over the top
        </button>
        <button className="wf-btn small" onClick={() => g.clearPlan(p.id)}>
          🗑 Clear the plan
        </button>
      </div>
      <div className="wf-seg" style={{ marginTop: 6 }}>
        <button className={`wf-btn small ${p.letAs === "units" ? "on" : ""}`} aria-pressed={p.letAs === "units"} onClick={() => g.setSite(p.id, { letAs: "units" })}>
          Let by unit (flats, shops, offices)
        </button>
        <button className={`wf-btn small ${p.letAs === "whole" ? "on" : ""}`} aria-pressed={p.letAs === "whole"} onClick={() => g.setSite(p.id, { letAs: "whole" })}>
          Let the whole building
        </button>
      </div>
      <div className="wf-section">What it&apos;ll have</div>
      <div className="wf-list" data-testid="wf-planned-units">
        {lay.units.map((u) => (
          <div key={u.key} className="wf-trow" style={{ gridTemplateColumns: "auto 1fr auto" }}>
            <b aria-hidden="true">{E.UNIT_TYPES[u.type].icon}</b>
            <span>
              {E.UNIT_TYPES[u.type].name} · {u.area} m²
              <span className="sub">
                {u.levels.length > 1 ? `storeys ${u.levels[0] + 1}–${u.levels[u.levels.length - 1] + 1}` : `storey ${u.levels[0] + 1}`} · {u.windows} window{u.windows === 1 ? "" : "s"}
              </span>
            </span>
            <b className="num">{money(E.marketRent(s, p, u) * 24)}/day</b>
          </div>
        ))}
        {!lay.units.length && <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>No lettable units in the plan yet: rooms need walls all round, a floor or roof over them and a door in.</p>}
        {lay.problems.slice(0, 4).map((m, i) => (
          <p key={i} className="wf-pill warn" style={{ height: "auto", padding: "4px 10px", whiteSpace: "normal", margin: 0 }}>
            {m}
          </p>
        ))}
      </div>
      <div className="wf-section">Still to build</div>
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }} data-testid="wf-estimate">
        {p.parts.filter((x) => !x.done).length} parts: materials about {money(est.materials)}, labour about {money(est.labour)} at standard rates.
      </p>
      <div className="wf-chips" style={{ marginTop: 6 }}>
        {(Object.entries(est.need) as [ItemId, number][]).map(([i, n]) => (
          <span key={i} className="wf-pill grey">
            {ITEMS[i].icon} {n.toFixed(1)} {ITEMS[i].name.toLowerCase()}
          </span>
        ))}
      </div>
    </>
  );
}

function CrewPanel({ g, s, p }: { g: Game; s: State; p: E.Property }) {
  const shift = E.onShift(s, p);
  const need = E.materialsLeft(p);
  const coming = E.siteIncoming(s, p.id);
  const items = [...new Set([...(Object.keys(need) as ItemId[]), ...(Object.keys(p.stock) as ItemId[])])];
  return (
    <>
      <div className="wf-bar" style={{ marginTop: 4 }} aria-label={`${Math.round(E.progress(p) * 100)}% built`}>
        <i style={{ width: `${Math.round(E.progress(p) * 100)}%` }} />
      </div>
      <div className="wf-kv">
        <div>
          <small>Built</small>
          <b className="num">{Math.round(E.progress(p) * 100)}%</b>
        </div>
        <div>
          <small>Bricks laid</small>
          <b className="num">{Math.floor(p.bricks).toLocaleString("en-US")}</b>
        </div>
        <div>
          <small>Crews</small>
          <b>{p.permit !== "granted" ? "Waiting for the permit" : shift.on ? (shift.overtime ? "On overtime" : "At work") : "Off till 07:00"}</b>
        </div>
        <div>
          <small>Wages</small>
          <b className="num">{money(E.siteWages(p))}/h</b>
        </div>
      </div>
      {p.short.length > 0 && (
        <p className="wf-pill warn" style={{ marginTop: 8, height: "auto", padding: "4px 10px", whiteSpace: "normal" }} data-testid="wf-site-short">
          Crews waiting for {p.short.map((i) => ITEMS[i].name.toLowerCase()).join(", ")}: get some on site
        </p>
      )}
      <div className="wf-seg" style={{ marginTop: 8 }}>
        <button className={`wf-btn small ${p.overtime ? "on" : ""}`} aria-pressed={p.overtime} onClick={() => g.setSite(p.id, { overtime: !p.overtime })}>
          {p.overtime ? "Overtime ✓ (06–22)" : "Overtime (06–22, time and a half)"}
        </button>
        <button className={`wf-btn small ${p.autoSupply ? "on" : ""}`} aria-pressed={p.autoSupply} onClick={() => g.setSite(p.id, { autoSupply: !p.autoSupply })} data-testid="wf-autosite">
          {p.autoSupply ? "Auto-supply ✓" : "Auto-supply materials"}
        </button>
      </div>
      <div className="wf-section">Crews</div>
      <div className="wf-list">
        {E.TRADE_IDS.map((t) => {
          const c = p.crews[t];
          const gangs = c?.gangs ?? 0;
          const tier = c?.tier ?? 0;
          return (
            <div key={t} className="wf-item" data-testid={`wf-crew-${t}`}>
              <div className="wf-between" style={{ gap: 8 }}>
                <h4>
                  {E.TRADES[t].icon} {E.TRADES[t].name}
                </h4>
                <div className="wf-stepper" aria-label={`${E.TRADES[t].name} gangs`}>
                  <button className="wf-btn icon small" onClick={() => g.hireCrew(p.id, t, gangs - 1, tier)} disabled={!gangs} aria-label="One gang fewer">
                    −
                  </button>
                  <output className="num">{gangs}</output>
                  <button className="wf-btn icon small" onClick={() => g.hireCrew(p.id, t, gangs + 1, tier)} disabled={gangs >= E.MAX_GANGS} aria-label="One gang more" data-testid={`wf-crew-${t}-more`}>
                    +
                  </button>
                </div>
              </div>
              <p>{E.TRADES[t].blurb}</p>
              <div className="wf-seg" style={{ marginTop: 6 }}>
                {E.TIERS.map((tr, i) => (
                  <button key={tr.name} className={`wf-btn small ${tier === i ? "on" : ""}`} aria-pressed={tier === i} onClick={() => g.hireCrew(p.id, t, Math.max(1, gangs), i)}>
                    {tr.name} · ${Math.round(E.TRADES[t].wage * tr.wage)}/h
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="wf-section">Materials on site · pallets</div>
      <div className="wf-list" data-testid="wf-site-materials">
        {items.map((i) => {
          const have = p.stock[i] ?? 0;
          const want = Math.max(0, (need[i] ?? 0) - have - (coming[i] ?? 0));
          const free = Math.max(0, Math.floor(sim.freeStock(s, i)));
          const n = Math.min(12, Math.max(1, Math.ceil(want)));
          return (
            <div key={i} className="wf-trow" style={{ gridTemplateColumns: "auto 1fr auto" }}>
              <b aria-hidden="true">{ITEMS[i].icon}</b>
              <span style={{ minWidth: 0 }}>
                {ITEMS[i].name}
                <span className="sub">
                  {have.toFixed(1)} here{coming[i] ? ` · ${coming[i]} coming` : ""} · {(need[i] ?? 0).toFixed(1)} still needed · {free} spare in the warehouse
                </span>
              </span>
              <span className="wf-seg" style={{ flexWrap: "nowrap" }}>
                <button className="wf-btn small" disabled={free < 1} onClick={() => g.sendToSite(p.id, [{ item: i, n: Math.min(free, n) }])} title="By truck from your warehouse" data-testid={`wf-send-${i}`}>
                  🚚 {Math.min(free, n) || n}
                </button>
                <button className="wf-btn small" disabled={!sim.afford(s, E.directCost(s, i, n))} onClick={() => g.orderToSite(p.id, i, n)} title="From the supplier, straight to site" data-testid={`wf-direct-${i}`}>
                  🏭 {n} · {short(E.directCost(s, i, n))}
                </button>
              </span>
            </div>
          );
        })}
        {!items.length && <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>Draw up plans and the materials they need show here.</p>}
      </div>
      <div className="wf-section">Inspections</div>
      <div className="wf-chips">
        {p.passed.map((x) => (
          <span key={x} className="wf-pill good">
            ✓ {x === "foundation" ? "Foundations" : x === "final" ? "Final" : `Storey ${Number(x.split("-")[1]) + 1}`}
          </span>
        ))}
        {p.inspections.map((i, k) => (
          <span key={k} className="wf-pill warn">
            ⏳ {i.kind === "foundation" ? "Foundations" : i.kind === "final" ? "Final" : `Storey ${i.level + 1}`} in {mins(Math.max(0, i.at - s.time))}
          </span>
        ))}
        {!p.passed.length && !p.inspections.length && <span className="dim" style={{ fontSize: 12.5 }}>The inspector comes when the foundations are in, each storey&apos;s frame is up, and at the end.</span>}
      </div>
      <div className="wf-section">Site diary</div>
      <div className="wf-list">
        {[...p.log].reverse().slice(0, 6).map((x, i) => (
          <div key={i} className="wf-trow" style={{ gridTemplateColumns: "auto 1fr" }}>
            <b className="num dim">D{sim.day(x.t)} {sim.clock(x.t)}</b>
            <span>{x.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function UnitsPanel({ g, s, p }: { g: Game; s: State; p: E.Property }) {
  const lay = E.units(p);
  return (
    <>
      {!p.cert && (
        <p className="wf-pill warn" style={{ marginTop: 4, height: "auto", padding: "6px 10px", whiteSpace: "normal" }}>
          Finish the building and pass the final inspection to let it.
        </p>
      )}
      <div className="wf-between" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
        <div className="wf-stepper" aria-label="Rents">
          <button className="wf-btn icon small" onClick={() => g.setRent(p.id, p.rentLevel - 0.05)} aria-label="Lower rents">
            −
          </button>
          <output className="num" style={{ minWidth: 92 }} data-testid="wf-rent-level">
            Rents {pct(p.rentLevel)}
          </output>
          <button className="wf-btn icon small" onClick={() => g.setRent(p.id, p.rentLevel + 0.05)} aria-label="Raise rents">
            +
          </button>
        </div>
        <div className="wf-seg">
          <button className={`wf-btn small ${p.agent ? "on" : ""}`} aria-pressed={p.agent} onClick={() => g.setSite(p.id, { agent: !p.agent })} title={`Takes ${Math.round(E.AGENT_FEE * 100)}% of the rent: fixes things, chases arrears, keeps rents at the market`}>
            {p.agent ? "Letting agent ✓" : "Letting agent"}
          </button>
          <button className={`wf-btn small ${p.insured ? "on" : ""}`} aria-pressed={p.insured} onClick={() => g.setSite(p.id, { insured: !p.insured })}>
            {p.insured ? "Insured ✓" : "Insure"}
          </button>
        </div>
      </div>
      <div className="wf-section">Condition {Math.round(p.condition * 100)}%</div>
      <div className="wf-bar">
        <i style={{ width: `${Math.round(p.condition * 100)}%`, background: p.condition < 0.5 ? "linear-gradient(90deg,#f06c70,#d83d43)" : p.condition < 0.75 ? "linear-gradient(90deg,#f5a524,#e08a00)" : undefined }} />
      </div>
      {p.condition < 0.98 && (
        <button className="wf-btn small" style={{ marginTop: 8 }} disabled={!sim.afford(s, E.refurbCost(s, p))} onClick={() => g.refurbish(p.id)}>
          🛠 Refurbish · {money(E.refurbCost(s, p))}
        </button>
      )}
      <div className="wf-section">Units</div>
      <div className="wf-list" data-testid="wf-units">
        {lay.units.map((u) => {
          const t = p.tenants[u.key];
          return (
            <div key={u.key} className="wf-item">
              <div className="wf-between">
                <h4>
                  {E.UNIT_TYPES[u.type].icon} {E.UNIT_TYPES[u.type].name} · {u.area} m²
                </h4>
                <b className="num">{money(E.rentOf(s, p, u) * 24)}/day</b>
              </div>
              {t ? (
                <>
                  <p>
                    {t.name}, {t.kind === "business" ? "a business" : "a household"} · lease to day {sim.day(t.until)}
                    {t.owed ? ` · ${t.owed} h behind with the rent` : ""}
                  </p>
                  <div className="wf-bar" style={{ marginTop: 6 }} aria-label={`${Math.round(t.happy)}% happy`}>
                    <i style={{ width: `${Math.max(3, t.happy)}%`, background: t.happy < 35 ? "linear-gradient(90deg,#f06c70,#d83d43)" : t.happy < 60 ? "linear-gradient(90deg,#f5a524,#e08a00)" : undefined }} />
                  </div>
                  {t.owed > 0 && (
                    <button className="wf-btn small" style={{ marginTop: 6 }} onClick={() => g.evict(p.id, u.key)}>
                      Evict · {money(E.EVICT_FEE)}
                    </button>
                  )}
                </>
              ) : (
                <p>{p.cert ? "Vacant: a fair rent and a well-kept building let faster." : "Not ready yet."}</p>
              )}
            </div>
          );
        })}
        {!lay.units.length && <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>No finished units yet.</p>}
      </div>
      {p.requests.length > 0 && (
        <>
          <div className="wf-section">Repairs asked for</div>
          <div className="wf-list">
            {p.requests.map((r, i) => (
              <div key={i} className="wf-trow" style={{ gridTemplateColumns: "1fr auto" }}>
                <span>
                  {r.text}
                  <span className="sub">{p.tenants[r.unit]?.name ?? "A tenant"} · waiting {mins(s.time - r.at)}</span>
                </span>
                <button className="wf-btn small primary" disabled={!sim.afford(s, r.cost)} onClick={() => g.fixRequest(p.id, i)}>
                  Fix · {money(r.cost)}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function MoneyPanel({ g, s, p }: { g: Game; s: State; p: E.Property }) {
  const v = E.value(s, p);
  const limit = E.mortgageLimit(s, p);
  const [ask, setAsk] = useState(1.05);
  return (
    <>
      <div className="wf-kv" style={{ marginTop: 4 }}>
        <div>
          <small>Worth today</small>
          <b className="num" data-testid="wf-prop-value">
            {money(v)}
          </b>
        </div>
        <div>
          <small>Land</small>
          <b className="num">{money(E.landValue(s, E.plotDef(p.plot)))}</b>
        </div>
        <div>
          <small>Spent on it</small>
          <b className="num">{money(p.land + p.spent)}</b>
        </div>
        <div>
          <small>Rent today · all time</small>
          <b className="num">
            {short(p.rentToday)} · {short(p.rentTotal)}
          </b>
        </div>
      </div>
      <div className="wf-section">Mortgage · {Math.round(E.MORTGAGE.rate * 1000) / 10}% a day</div>
      <div className="wf-between" style={{ flexWrap: "wrap", gap: 8 }}>
        <b className="num">{money(p.mortgage)} owed</b>
        <div className="wf-seg">
          <button className="wf-btn small" disabled={limit < 1000} onClick={() => g.borrowOn(p.id, limit)} data-testid="wf-mortgage">
            Borrow {short(limit)}
          </button>
          <button className="wf-btn small" disabled={!p.mortgage || !sim.afford(s, p.mortgage)} onClick={() => g.repayOn(p.id, p.mortgage)}>
            Pay it off
          </button>
        </div>
      </div>
      <div className="wf-section">Selling</div>
      {p.sale ? (
        <div className="wf-item" data-testid="wf-sale">
          <div className="wf-between">
            <h4>On the market at {money(p.sale.ask)}</h4>
            <span className={`wf-pill ${p.sale.offer ? "good" : "grey"}`}>{p.sale.offer ? "Offer in" : "Waiting"}</span>
          </div>
          {p.sale.offer ? <p>A buyer offers {money(p.sale.offer)} (for {mins(Math.max(0, p.sale.offerUntil - s.time))}).</p> : <p>Buyers make offers now and then: a keener price gets more.</p>}
          <div className="wf-seg" style={{ marginTop: 8 }}>
            {p.sale.offer > 0 && (
              <button className="wf-btn small primary" onClick={() => g.acceptOffer(p.id)} data-testid="wf-accept-offer">
                Accept {short(p.sale.offer)}
              </button>
            )}
            <button className="wf-btn small" onClick={() => g.listForSale(p.id, null)}>
              Take it off the market
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="wf-between" style={{ flexWrap: "wrap", gap: 8 }}>
            <div className="wf-stepper" aria-label="Asking price">
              <button className="wf-btn icon small" onClick={() => setAsk(Math.max(0.8, Math.round((ask - 0.05) * 20) / 20))} aria-label="Ask less">
                −
              </button>
              <output className="num" style={{ minWidth: 100 }}>
                Ask {short(v * ask)}
              </output>
              <button className="wf-btn icon small" onClick={() => setAsk(Math.min(1.4, Math.round((ask + 0.05) * 20) / 20))} aria-label="Ask more">
                +
              </button>
            </div>
            <button className="wf-btn small primary" onClick={() => g.listForSale(p.id, v * ask)} data-testid="wf-list-sale">
              Put it on the market
            </button>
          </div>
          <button className="wf-btn small" style={{ marginTop: 8 }} onClick={() => g.quickSell(p.id)} data-testid="wf-quick-sell">
            Sell today to a cash buyer · {short(v * E.QUICK_SALE)}
          </button>
        </>
      )}
      <p className="dim" style={{ fontSize: 12, margin: "8px 0 0" }}>
        Tax {money((v * E.TAX))} a day{p.insured ? `, insurance ${money(v * E.INSURANCE)}` : ""}. Sales pay {Math.round(E.SALE_FEE * 100)}% to the agent, and the mortgage off first.
      </p>
    </>
  );
}

/* ====================================================================== in a store */

export function StoreHud({ g, s, st }: { g: Game; s: State; st: Store }) {
  const def = STORES[st.kind];
  const h = Math.floor((s.time % DAY) / HOUR);
  const trading = st.open && h >= STORE_HOURS[0] && h < STORE_HOURS[1];
  return (
    <>
      <div className="wf-sitebar wf-glass wf-capsule" data-testid="wf-storebar">
        <button className="wf-btn small" onClick={() => g.leaveView()} data-testid="wf-store-back" aria-label="Back to the warehouse">
          ← <span className="lbl">Warehouse</span>
        </button>
        <span className="name">
          <b>
            {def.icon} {st.name}
          </b>
          <small>
            {st.city} · {["", "Small", "Medium", "Large"][st.level] ?? ""} {def.name.toLowerCase()}
          </small>
        </span>
        <span className={`wf-pill ${trading ? "good" : "grey"}`}>{trading ? "Trading" : !st.open ? "Closed" : `Opens ${STORE_HOURS[0]}:00`}</span>
      </div>
      <div className="wf-storecard wf-glass" data-testid="wf-storecard">
        <div className="wf-kv" style={{ marginTop: 0, gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div>
            <small>Today</small>
            <b className="num wf-up">{money(st.today)}</b>
          </div>
          <div>
            <small>Shoppers</small>
            <b className="num">{Math.round(st.happy)}% happy</b>
          </div>
          <div>
            <small>Staff</small>
            <b className="num">{st.staff}</b>
          </div>
        </div>
        <div className="wf-chips" style={{ marginTop: 8 }}>
          {def.goods.map((i) => (
            <span key={i} className={`wf-pill ${(st.stock[i] ?? 0) < 0.3 ? "warn" : "grey"}`}>
              {ITEMS[i].icon} {(st.stock[i] ?? 0).toFixed(1)}
            </span>
          ))}
        </div>
        <div className="wf-seg" style={{ marginTop: 8 }}>
          <button
            className="wf-btn small primary"
            onClick={() => {
              g.leaveView();
              g.openCompany("stores");
            }}
            data-testid="wf-store-manage"
          >
            Manage the store
          </button>
        </div>
      </div>
    </>
  );
}
