"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PoweredBy } from "@/nextx/PoweredBy";
import { GlassDefs, canRefract, trackSheen } from "@/nextx/glass";
import {
  CARRIERS, CHARGER, EVENTS, FORKLIFT_COST, GOALS, HIGH_TECH, ITEMS, MACHINES, MACHINE_TYPES, MAX_FORKLIFTS, RACK, FLOOR, RAIL_CAP, RAW, PARTS, GOODS, SEASON_DAYS, SPEEDS, UPGRADES,
  buyPrice, siteDef, supplierFor, type DoorType, type ItemId,
} from "../data";
import type { Game, Sheet } from "../game";
import * as sim from "../sim";
import type { Focus, Order, State } from "../sim";

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const mins = (secs: number) => {
  const m = Math.max(0, Math.round(secs / 60));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
};

export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id="wf-m1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7aa6ff" />
          <stop offset="1" stopColor="#2f6fe4" />
        </linearGradient>
        <linearGradient id="wf-m2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b9a8ff" />
          <stop offset="1" stopColor="#7c5cf0" />
        </linearGradient>
      </defs>
      <path d="M32 4 58 18v28L32 60 6 46V18z" fill="url(#wf-m1)" />
      <path d="M32 4 58 18 32 32 6 18z" fill="#cfe0ff" opacity=".85" />
      <path d="M32 32v28L6 46V18z" fill="url(#wf-m2)" opacity=".9" />
      <path d="M20 26h8v8h-8zM34 34h8v8h-8z" fill="#fff" opacity=".9" />
      <path d="M44 22 36 34h6l-4 10 10-14h-6l4-8z" fill="#ffd34d" />
    </svg>
  );
}

const STATE_LABEL: Record<string, string> = {
  transit: "En route", queued: "Waiting in the yard", arriving: "Arriving", backing: "Backing in", docked: "Docked", leaving: "Departing", gone: "Gone",
};

/* ====================================================================== app */

export function App({ game: g }: { game: Game }) {
  useSyncExternalStore(g.subscribe, g.getVersion, g.getVersion);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const refract = useSyncExternalStore(
    () => () => {},
    () => canRefract(),
    () => false,
  );

  useEffect(() => {
    if (!canvas.current) return;
    g.attach(canvas.current);
    return () => g.detach();
  }, [g]);
  useEffect(() => (root.current ? trackSheen(root.current, ".wf-glass") : undefined), []);

  // Keys: space pauses, 1-4 set the speed, Esc closes things, R turns the build tool.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (g.screen !== "play") return;
      if (e.key === " ") {
        e.preventDefault();
        g.togglePause();
      } else if (["1", "2", "3", "4"].includes(e.key)) g.setSpeed(Number(e.key) - 1);
      else if (e.key === "Escape") {
        if (g.tool) g.setTool(null);
        else if (g.sheet) g.open(null);
        else g.select(null);
      } else if (e.key === "r" || e.key === "R") g.rotateTool();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [g]);

  const s = g.s;
  return (
    <div ref={root} className={`wf${refract ? " wf-refract" : ""}`} data-testid="wf-root">
      <GlassDefs prefix="wf" />
      <canvas ref={canvas} className="wf-canvas" aria-label="The warehouse in 3D: drag to move, pinch or scroll to zoom, tap to inspect" tabIndex={0} />
      {g.screen === "title" || !s ? (
        <Title g={g} />
      ) : (
        <>
          <TopBar g={g} s={s} />
          {g.prefs.kpis !== false && <Kpis s={s} />}
          {s.event && <EventBanner s={s} />}
          {g.sel && !g.tool && <Inspector g={g} s={s} f={g.sel} />}
          <Tracking g={g} s={s} />
          <Table g={g} s={s} />
          {g.tool ? <Toolbar g={g} /> : g.sheet && <Sheets g={g} s={s} sheet={g.sheet} />}
          <Dock g={g} s={s} />
          {(s.bankrupt || (s.seasonOver && !s.goals.__seen)) && <Over g={g} s={s} />}
        </>
      )}
      {g.toast && (
        <div key={g.toast.id} className={`wf-toast wf-glass wf-capsule ${g.toast.kind}`} role="status" data-testid="wf-toast">
          {g.toast.text}
        </div>
      )}
    </div>
  );
}

/* ====================================================================== title */

function Title({ g }: { g: Game }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="wf-title" data-testid="wf-title">
      <div className="wf-hero">
        <div className="logo">
          <Mark size={64} /> WareForge
        </div>
        <p>Run the dock, the racks and the production floor. Book trucks, pick orders, build machines and ship on time, in 3D.</p>
      </div>
      <div className="wf-sites">
        {g.sites.map((d) => (
          <div key={d.id} className="wf-site wf-glass">
            <div className="wf-between">
              <span className="wf-eyebrow">{d.code}</span>
              <span className={`wf-pill ${d.difficulty === "Easy" ? "good" : d.difficulty === "Normal" ? "" : d.difficulty === "Hard" ? "warn" : "bad"}`}>{d.difficulty}</span>
            </div>
            <h3>{d.name}</h3>
            <p>{d.blurb}</p>
            <div className="wf-row dim" style={{ fontSize: 12, fontWeight: 600, flexWrap: "wrap" }}>
              <span>{money(d.cash)}</span>·<span>{d.doors.length} doors</span>·<span>{d.forklifts} forklifts</span>
              {d.machines.length > 0 && <>·<span>{d.machines.length} machines</span></>}
              {d.rail && <>·<span>rail</span></>}
              {d.mega && <>·<span>Mega hall</span></>}
            </div>
            <button className="wf-btn primary wide" data-testid={`wf-site-${d.id}`} onClick={() => g.newGame(d.id)}>
              Run {d.code}
            </button>
          </div>
        ))}
      </div>
      <div className="wf-titlebar">
        {g.hasSave && (
          <button className="wf-btn" data-testid="wf-continue" onClick={() => g.continueGame()}>
            ▶ Continue
          </button>
        )}
        <button className="wf-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
          How to play
        </button>
      </div>
      {open && (
        <div className="wf-glass wf-card" style={{ maxWidth: 560, marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
          <b>Accept orders</b> from customers, and forklifts pick the pallets onto the lanes behind a door. A truck backs onto the door, is loaded and drives off; deliver before the deadline to be paid in full. <b>Buy stock</b> or raw materials (a truck brings them in), <b>build</b> racks, floor blocks and machines that turn materials into goods, buy forklifts and upgrades. Five days make a season; your score is how much you grow the business.
        </div>
      )}
      <div className="wf-powered">
        <PoweredBy />
      </div>
    </div>
  );
}

/* ====================================================================== top bar */

function TopBar({ g, s }: { g: Game; s: State }) {
  const def = siteDef(s.site);
  const k = sim.kpis(s);
  const unread = s.alerts.filter((a) => a.id > g.seenAlert && a.kind !== "info").length;
  const doorsOut = s.doors.length;
  return (
    <header className="wf-top wf-glass wf-capsule" data-testid="wf-top">
      <div className="wf-brand">
        <Mark /> <span>WareForge</span>
      </div>
      <Search g={g} s={s} />
      <div className="wf-spacer" />
      <div className="wf-chip" title={`${def.code} ${def.name}`}>
        <span className="ico">▦</span>
        <div>
          <b>
            {def.code} {def.name}
          </b>
          <small>
            {k.full}% full · {k.docked}/{doorsOut} docked
          </small>
        </div>
      </div>
      <div className={`wf-live${g.hold ? " held" : ""}`} data-testid="wf-clock">
        <i /> <span className="num">Day {sim.day(s.time)} · {sim.clock(s.time)}</span>
      </div>
      <div className="wf-speeds" role="group" aria-label="Speed">
        <button className={g.hold ? "on" : ""} onClick={() => g.togglePause()} aria-label={g.hold ? "Resume" : "Pause"} data-testid="wf-pause">
          {g.hold ? "▶" : "❚❚"}
        </button>
        {SPEEDS.map((v, i) => (
          <button key={v} className={!g.hold && g.speed === v ? "on" : ""} onClick={() => g.setSpeed(i)} aria-label={`${v} times speed`} data-testid={`wf-speed-${v}`}>
            {v}×
          </button>
        ))}
      </div>
      <button
        className={`wf-btn icon small wf-kpitoggle ${g.prefs.kpis !== false ? "on" : ""}`}
        aria-label={g.prefs.kpis !== false ? "Hide the figures" : "Show the figures"}
        aria-pressed={g.prefs.kpis !== false}
        onClick={() => g.setPrefs({ kpis: g.prefs.kpis === false })}
        data-testid="wf-kpitoggle"
      >
        📊
      </button>
      <button className="wf-btn icon small wf-bell" aria-label={`Alerts${unread ? ` (${unread} new)` : ""}`} onClick={() => g.open("alerts")} data-testid="wf-bell">
        🔔{unread > 0 && <em>{unread}</em>}
      </button>
      <div className="wf-me">
        <span className="av">YOU</span>
        <div>
          <b>You</b>
          <small>Operations Manager</small>
        </div>
      </div>
    </header>
  );
}

function Search({ g, s, inline = false }: { g: Game; s: State; inline?: boolean }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => (q ? sim.search(s, q) : []), [q, s, s.time]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
      <div className={inline ? "wf-search wf-search-inline" : "wf-search"}>
        <span className="ic" aria-hidden="true">⌕</span>
        <input aria-label="Search trucks, forklifts, pallets and shipments" placeholder="Search trucks, forklifts, pallets, shipments" value={q} onChange={(e) => setQ(e.target.value)} />
        {hits.length > 0 && (
          <div className="wf-hits wf-glass" role="listbox">
            {hits.map((h, i) => (
              <button
                key={i}
                className="wf-hit"
                role="option"
                aria-selected="false"
                onClick={() => {
                  g.select(h.focus, true);
                  setQ("");
                }}
              >
                <b style={{ fontSize: 13 }}>{h.label}</b>
                <small className="muted">{h.sub}</small>
              </button>
            ))}
          </div>
        )}
      </div>
  );
}

/* ====================================================================== events */

function EventBanner({ s }: { s: State }) {
  const e = s.event!;
  const def = EVENTS.find((x) => x.kind === e.kind)!;
  return (
    <div className="wf-event wf-glass wf-capsule" role="status" data-testid="wf-event">
      <span aria-hidden="true">{def.icon}</span>
      <b>{def.name}</b>
      <span className="muted">{def.body}</span>
      <span className="wf-pill grey">{mins(e.until - s.time)} left</span>
    </div>
  );
}

/* ====================================================================== KPIs */

function Kpis({ s }: { s: State }) {
  const k = sim.kpis(s);
  return (
    <div className="wf-kpis" data-testid="wf-kpis">
      <div className="wf-kpi wf-glass">
        <div className="k">
          <i aria-hidden="true">▤</i> <span>Stock on hand</span>
        </div>
        <div className="v num">
          {k.stock.toLocaleString("en-US")} <small>pallets</small>
        </div>
        <div className={`d ${k.delta > 0 ? "wf-up" : k.delta < 0 ? "wf-down" : ""}`}>
          {k.delta > 0 ? "+" : ""}
          {k.delta} today · {k.capacity} bays
        </div>
      </div>
      <div className="wf-kpi wf-glass">
        <div className="k">
          <i aria-hidden="true">🚚</i> <span>Trucks on site</span>
        </div>
        <div className="v num">{k.onSite}</div>
        <div className="d">{k.inbound} en route</div>
      </div>
      <div className="wf-kpi wf-glass">
        <div className="k">
          <i aria-hidden="true">⏱</i> <span>On-time delivery</span>
        </div>
        <div className={`v num ${k.onTime >= 95 ? "" : k.onTime >= 80 ? "" : "wf-down"}`}>{k.onTime.toFixed(1)}%</div>
        <div className="d">last {k.deliveries || 0} deliveries</div>
      </div>
      <div className="wf-kpi wf-glass">
        <div className="k">
          <i aria-hidden="true">$</i> <span>Cash</span>
        </div>
        <div className={`v num ${k.cash < 0 ? "wf-down" : ""}`}>{money(k.cash)}</div>
        <div className="d">worth {money(k.worth)}</div>
      </div>
      <div className="wf-kpi wf-glass">
        <div className="k">
          <i aria-hidden="true">⚙</i> <span>Made today</span>
        </div>
        <div className="v num">
          {k.made} <small>pallets</small>
        </div>
        <div className="d">rep {Math.round(s.rep)}/100</div>
      </div>
    </div>
  );
}

/* ====================================================================== inspector */

function Inspector({ g, s, f }: { g: Game; s: State; f: Focus }) {
  const close = () => g.select(null);
  let body: React.ReactNode = null;
  if (f.k === "pallet") body = <PalletInfo g={g} s={s} id={f.id} />;
  else if (f.k === "fork") body = <ForkInfo s={s} id={f.id} />;
  else if (f.k === "truck") body = <TruckInfo g={g} s={s} id={f.id} />;
  else if (f.k === "door") body = <DoorInfo g={g} s={s} i={f.id} />;
  else if (f.k === "struct") body = <StructInfo g={g} s={s} id={f.id} />;
  else if (f.k === "order") {
    const o = s.orders.find((x) => x.id === f.id);
    body = o ? <OrderCard g={g} s={s} o={o} /> : null;
  }
  if (!body) body = <p className="muted">It&apos;s gone.</p>;
  return (
    <aside className="wf-insp wf-glass wf-card" data-testid="wf-inspector" aria-label="Inspector">
      <button className="wf-x" onClick={close} aria-label="Close">
        ✕
      </button>
      {body}
    </aside>
  );
}

function slotLabel(s: State, slotId: number) {
  const sl = s.slots[slotId];
  if (!sl) return "—";
  if (sl.kind === "stage") return `${sim.doorName(s, sl.owner)} lane`;
  const t = s.structs[sl.owner];
  if (sl.kind === "in" || sl.kind === "out") return `${MACHINES[t.m!.type].name} ${sl.kind === "in" ? "input" : "output"}`;
  const lv = Math.round(sl.y / sim.LEVEL_H);
  return `${t.kind === "rack" ? `Rack R-${String(t.id + 1).padStart(2, "0")}` : `Block F-${String(t.id + 1).padStart(2, "0")}`}${t.kind === "rack" ? ` · level ${lv + 1}` : ""}`;
}

function PalletInfo({ g, s, id }: { g: Game; s: State; id: number }) {
  const p = s.pallets[id];
  if (!p) return null;
  const it = ITEMS[p.item];
  const o = p.order >= 0 ? s.orders.find((x) => x.id === p.order) : null;
  const where = p.loc === "slot" ? slotLabel(s, p.ref) : p.loc === "fork" ? `On ${s.forks[p.ref]?.name}` : `In ${s.trucks.find((t) => t.id === p.ref)?.plate}`;
  const status = p.loc === "fork" ? "Moving" : p.loc === "truck" ? "In trailer" : s.slots[p.ref]?.kind === "stage" ? "Staged" : s.slots[p.ref]?.kind === "store" ? "Stored" : "At machine";
  return (
    <>
      <div className="wf-eyebrow">Pallet · {it.name}</div>
      <div className="title">PAL-{1000 + p.id}</div>
      <div className="wf-chips">
        <span className="wf-pill">{status}</span>
        <span className="wf-pill grey">{siteDef(s.site).code}</span>
        {o && <span className="wf-pill violet">#{o.code}</span>}
      </div>
      <div className="wf-kv">
        <div>
          <small>Location</small>
          <b>{where}</b>
        </div>
        <div>
          <small>Quantity</small>
          <b>{it.units} units</b>
        </div>
        <div>
          <small>Gross weight</small>
          <b>{Math.round(it.units * it.kg + 22)} kg</b>
        </div>
        <div>
          <small>Lot</small>
          <b>{p.lot}</b>
        </div>
        <div>
          <small>Received</small>
          <b>
            Day {sim.day(p.born)} {sim.clock(p.born)}
          </b>
        </div>
        <div>
          <small>Value</small>
          <b>{money(buyPrice(p.item))}</b>
        </div>
      </div>
      {o && (
        <button className="wf-btn small wide" style={{ marginTop: 10 }} onClick={() => g.select({ k: "order", id: o.id }, true)}>
          Open shipment #{o.code}
        </button>
      )}
    </>
  );
}

function ForkInfo({ s, id }: { s: State; id: number }) {
  const f = s.forks[id];
  if (!f) return null;
  const j = f.job;
  const p = j ? s.pallets[j.pallet] : null;
  const verb: Record<string, string> = { charge: "Charging", load: "Loading a truck", unload: "Unloading a truck", output: "Clearing a machine", pick: "Picking an order", feed: "Feeding a machine", putaway: "Putting away" };
  return (
    <>
      <div className="wf-eyebrow">Forklift</div>
      <div className="title">{f.name}</div>
      <div className="wf-chips">
        <span className={`wf-pill ${j ? "good" : "grey"}`}>{j ? verb[j.kind] : f.phase === "charge" ? "Charging" : f.phase === "park" ? "Parking" : "Idle"}</span>
      </div>
      <div className="wf-kv">
        <div>
          <small>Carrying</small>
          <b>{p && p.loc === "fork" ? ITEMS[p.item].name : "—"}</b>
        </div>
        <div>
          <small>Trips</small>
          <b className="num">{f.trips}</b>
        </div>
        <div>
          <small>Driven</small>
          <b className="num">{(f.dist * 2 / 1000).toFixed(2)} km</b>
        </div>
        <div>
          <small>Wage</small>
          <b>{sim.up(s, "agv") ? "$16/h (AGV)" : "$40/h"}</b>
        </div>
      </div>
      <div className="wf-section">Battery {Math.round(f.battery * 100)}%{f.phase === "charge" ? " · charging" : ""}</div>
      <div className="wf-bar">
        <i style={{ width: `${f.battery * 100}%`, background: f.battery < 0.22 ? "linear-gradient(90deg,#f06c70,#d83d43)" : "linear-gradient(90deg,#2fc488,#159a63)" }} />
      </div>
    </>
  );
}

function TruckInfo({ g, s, id }: { g: Game; s: State; id: number }) {
  const t = s.trucks.find((x) => x.id === id);
  if (!t) return null;
  const c = CARRIERS[t.carrier];
  const o = t.dir === "out" ? s.orders.find((x) => x.id === t.ref) : null;
  const po = t.dir === "in" ? s.pos.find((x) => x.id === t.ref) : null;
  const n = t.cargo.filter((x) => x >= 0).length;
  return (
    <>
      <div className="wf-eyebrow">{t.rail ? "Freight train" : t.dir === "in" ? "Inbound truck" : "Outbound truck"} · {c.name}</div>
      <div className="title">{t.plate}</div>
      <div className="wf-chips">
        <span className={`wf-pill ${t.state === "docked" ? "good" : t.state === "queued" ? "warn" : ""}`}>{STATE_LABEL[t.state]}</span>
        {t.door >= 0 && <span className="wf-pill grey">{t.rail ? `Rail ${t.door + 1}` : sim.doorName(s, t.door)}</span>}
      </div>
      <div className="wf-kv">
        <div>
          <small>{t.dir === "in" ? "Bringing" : "For"}</small>
          <b>{po ? `${po.n} × ${ITEMS[po.item].name}` : o ? `#${o.code}` : "—"}</b>
        </div>
        <div>
          <small>{t.rail ? "On the wagons" : "In trailer"}</small>
          <b className="num">
            {n}/{t.dir === "out" && o ? o.total : t.cap}
          </b>
        </div>
        <div>
          <small>{t.state === "transit" ? "Due in" : "On site"}</small>
          <b>{t.state === "transit" ? mins(t.eta - s.time) : t.arrived >= 0 ? mins(s.time - t.arrived) : "—"}</b>
        </div>
        <div>
          <small>{t.dir === "in" ? "Supplier" : "To"}</small>
          <b>{po ? po.supplier : o ? o.city : "—"}</b>
        </div>
      </div>
      {t.arrived >= 0 && s.time - t.arrived > 3600 && t.state !== "leaving" && <p className="wf-pill warn" style={{ marginTop: 10 }}>Detention: $3 a minute</p>}
      {o && (
        <button className="wf-btn small wide" style={{ marginTop: 10 }} onClick={() => g.select({ k: "order", id: o.id }, true)}>
          Open shipment #{o.code}
        </button>
      )}
    </>
  );
}

function DoorInfo({ g, s, i }: { g: Game; s: State; i: number }) {
  const d = s.doors[i];
  if (!d) return null;
  const t = d.truck >= 0 ? s.trucks.find((x) => x.id === d.truck) : null;
  const o = d.order >= 0 ? s.orders.find((x) => x.id === d.order) : null;
  const staged = d.stage.filter((id) => s.slots[id].pallet >= 0).length;
  return (
    <>
      <div className="wf-eyebrow">Dock bay</div>
      <div className="title">{sim.doorName(s, i)}</div>
      <div className="wf-chips">
        <span className={`wf-pill ${t ? "good" : "grey"}`}>{t ? (t.state === "docked" ? "Truck docked" : STATE_LABEL[t.state]) : o ? "Booked" : "Available"}</span>
      </div>
      <div className="wf-kv">
        <div>
          <small>Truck</small>
          <b>{t ? t.plate : "—"}</b>
        </div>
        <div>
          <small>Shipment</small>
          <b>{o ? `#${o.code}` : "—"}</b>
        </div>
        <div>
          <small>Lane</small>
          <b className="num">{staged}/6 staged</b>
        </div>
        <div>
          <small>Due</small>
          <b>{o ? mins(o.due - s.time) : "—"}</b>
        </div>
      </div>
      <div className="wf-section">Door use</div>
      <div className="wf-seg">
        {(["out", "in", "flex"] as DoorType[]).map((ty) => (
          <button key={ty} className={`wf-btn small ${d.type === ty ? "on" : ""}`} onClick={() => g.setDoor(i, ty)}>
            {ty === "out" ? "Outbound" : ty === "in" ? "Inbound" : "Flex"}
          </button>
        ))}
      </div>
    </>
  );
}

function StructInfo({ g, s, id }: { g: Game; s: State; id: number }) {
  const t = s.structs[id];
  if (!t || t.dead) return null;
  const pallets = t.slots.map((sl) => s.slots[sl].pallet).filter((p) => p >= 0);
  const chips = (
    <div className="wf-chips">
      {pallets.map((pid) => {
        const p = s.pallets[pid];
        return (
          <button key={pid} className="wf-palchip" onClick={() => g.select({ k: "pallet", id: pid })}>
            <i style={{ background: ITEMS[p.item].load }} /> {ITEMS[p.item].sku} · PAL-{1000 + pid}
          </button>
        );
      })}
      {!pallets.length && <span className="dim" style={{ fontSize: 12.5 }}>Empty</span>}
    </div>
  );
  if (t.m) {
    const m = t.m;
    const def = MACHINES[m.type];
    const stateTxt: Record<string, [string, string]> = {
      running: ["Running", "good"], starved: ["Waiting for materials", "warn"], blocked: ["Output full", "warn"], broken: ["Broken down", "bad"], repair: ["Being repaired", ""], service: ["Being serviced", ""], idle: ["Ready", "grey"], off: ["Switched off", "grey"],
    };
    const [label, cls] = sim.eventOn(s, "power") && m.state !== "broken" ? ["No power", "bad"] : (stateTxt[m.state] ?? ["", "grey"]);
    const cyc = sim.cycleSecs(s, t);
    return (
      <>
        <div className="wf-eyebrow">Machine · M-{String(t.id + 1).padStart(2, "0")}</div>
        <div className="title">{def.name}</div>
        <div className="wf-chips">
          <span className={`wf-pill ${cls}`}>{label}</span>
          <span className="wf-pill grey">Made {m.made}</span>
        </div>
        {m.state === "running" && (
          <div className="wf-bar" style={{ marginTop: 10 }}>
            <i style={{ width: `${Math.min(100, (m.t / cyc) * 100)}%` }} />
          </div>
        )}
        <div className="wf-section">Recipe</div>
        <div className="wf-list">
          {def.recipes.map((rc, i) => (
            <button key={i} className={`wf-tile ${i === m.recipe ? "on" : ""}`} onClick={() => g.setRecipe(t.id, i)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <span>{rc.inputs.map((x) => ITEMS[x].icon).join(" + ")}</span>
              <span className="dim">→</span>
              <span>{ITEMS[rc.output].icon}</span>
              <b style={{ flex: 1 }}>{ITEMS[rc.output].name}</b>
              <small>{Math.round(rc.secs / 60)} min</small>
            </button>
          ))}
        </div>
        <div className="wf-kv">
          <div>
            <small>Wear</small>
            <b className={m.wear > 0.6 ? "wf-down" : ""}>{Math.round(m.wear * 100)}%</b>
          </div>
          <div>
            <small>Upkeep</small>
            <b>${def.upkeep}/h</b>
          </div>
        </div>
        <div className="wf-section">Buffers</div>
        {chips}
        <div className="wf-seg" style={{ marginTop: 12 }}>
          {m.state === "broken" && (
            <button className="wf-btn small bad" onClick={() => g.repair(t.id)}>
              Repair {money(sim.REPAIR_COST)}
            </button>
          )}
          <button className="wf-btn small" onClick={() => g.service(t.id)}>
            Service {money(sim.SERVICE_COST)}
          </button>
          <button className="wf-btn small" onClick={() => g.toggleMachine(t.id)}>
            {m.on ? "Switch off" : "Switch on"}
          </button>
          <button className="wf-btn small" onClick={() => g.removeStruct(t.id)}>
            Sell
          </button>
        </div>
      </>
    );
  }
  if (t.kind === "charger") {
    const using = s.forks.filter((f) => f.charger >= 0 && Math.floor(f.charger / 2) === t.id);
    return (
      <>
        <div className="wf-eyebrow">Charging bay</div>
        <div className="title">C-{String(t.id + 1).padStart(2, "0")}</div>
        <div className="wf-chips">
          <span className={`wf-pill ${using.length ? "warn" : "good"}`}>{using.length ? `${using.length}/2 in use` : "Free"}</span>
          {sim.up(s, "fastcharge") && <span className="wf-pill grey">Fast chargers</span>}
        </div>
        <div className="wf-list" style={{ marginTop: 10 }}>
          {using.map((f) => (
            <div key={f.id} className="wf-between" style={{ fontSize: 13 }}>
              <b>{f.name}</b>
              <span className="num">{Math.round(f.battery * 100)}%</span>
            </div>
          ))}
        </div>
        <div className="wf-seg" style={{ marginTop: 12 }}>
          <button className="wf-btn small" onClick={() => g.removeStruct(t.id)}>
            Remove
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="wf-eyebrow">{t.kind === "rack" ? "Pallet rack" : "Floor block"}</div>
      <div className="title">
        {t.kind === "rack" ? "R" : "F"}-{String(t.id + 1).padStart(2, "0")}
      </div>
      <div className="wf-chips">
        <span className="wf-pill">
          {pallets.length}/{t.slots.length} full
        </span>
        {t.kind === "rack" && <span className="wf-pill grey">Picked from the {t.rot ? "north" : "south"}</span>}
      </div>
      <div className="wf-section">Pallets</div>
      {chips}
      <div className="wf-seg" style={{ marginTop: 12 }}>
        {t.kind === "rack" && (
          <button className="wf-btn small" onClick={() => g.flipRack(t.id)}>
            Turn round
          </button>
        )}
        <button className="wf-btn small" onClick={() => g.removeStruct(t.id)}>
          Remove
        </button>
      </div>
    </>
  );
}

/* ====================================================================== shipments */

function OrderCard({ g, s, o, compact = false }: { g: Game; s: State; o: Order; compact?: boolean }) {
  const st = sim.trackStage(s, o);
  const pr = sim.orderProgress(s, o);
  const left = o.due - s.time;
  const lines = o.lines.map((l) => `${l.n} × ${ITEMS[l.item].name}`).join(", ");
  const truck = s.trucks.find((t) => t.id === o.truck);
  const where = o.state === "transit" ? `On the road · arrives in ${mins(o.delivers - s.time)}` : o.state === "delivered" ? `Delivered${o.onTime ? " on time" : " late"} · ${money(o.paid)}` : o.door >= 0 ? `${siteDef(s.site).code} ${sim.doorName(s, o.door)} · ${left > 0 ? `${mins(left)} left` : `${mins(-left)} late`}` : left > 0 ? `${mins(left)} left` : `${mins(-left)} late`;
  const label = ["Order Confirmed", "Picked", `Loading ${pr.loaded}/${o.total}`, "In Transit", "Delivered"];
  return (
    <div data-testid={`wf-order-${o.code}`}>
      {!compact && (
        <>
          <div className="wf-eyebrow">
            Shipment · {o.customer}
            {o.rush && " · RUSH"}
          </div>
          <div className="title">#{o.code}</div>
        </>
      )}
      <div className="wf-steps" aria-label="Shipment tracking">
        {label.map((l, i) => (
          <div key={i} className={`wf-step ${i < st || o.state === "delivered" ? "done" : i === st ? "now" : ""}`}>
            <b>{i < st || o.state === "delivered" ? "✓" : i + 1}</b>
            {l}
          </div>
        ))}
      </div>
      <div className="wf-ship">
        <span className="truck">🚚</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="wf-between">
            <b style={{ fontSize: 13.5 }}>
              #{o.code} <span className="muted" style={{ fontWeight: 600 }}>To {o.city}</span>
            </b>
            <span className={`wf-pill ${left < 0 && o.state !== "delivered" && o.state !== "transit" ? "bad" : left < 3600 && st < 3 ? "warn" : ""}`}>{["Confirmed", "Picked", "Loading", "In transit", "Delivered"][st]}</span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {where}
          </div>
        </div>
      </div>
      {!compact && (
        <>
          <div className="wf-kv">
            <div>
              <small>Goods</small>
              <b title={lines}>{lines}</b>
            </div>
            <div>
              <small>Value</small>
              <b>{money(o.value)}</b>
            </div>
            <div>
              <small>Picked</small>
              <b className="num">
                {pr.picked}/{o.total}
              </b>
            </div>
            <div>
              <small>Truck</small>
              <b>{truck ? `${truck.plate} · ${STATE_LABEL[truck.state]}` : "—"}</b>
            </div>
          </div>
          {pr.short.length > 0 && o.state === "confirmed" && (
            <p className="wf-pill bad" style={{ marginTop: 10, height: "auto", padding: "4px 10px", whiteSpace: "normal" }}>
              Short: {pr.short.map((x) => `${x.n} × ${ITEMS[x.item].name}`).join(", ")}. Buy or make them.
            </p>
          )}
          {["confirmed", "picked", "loading"].includes(o.state) && (
            <div className="wf-seg" style={{ marginTop: 10 }}>
              {truck?.state === "transit" && (
                <button className="wf-btn small" onClick={() => g.callTruck(o.id)}>
                  Call truck now ($150)
                </button>
              )}
              <button className="wf-btn small" onClick={() => g.cancel(o.id)}>
                Cancel (20% penalty)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Tracking({ g, s, inline = false }: { g: Game; s: State; inline?: boolean }) {
  const active = s.orders.filter((o) => ["confirmed", "picked", "loading", "transit"].includes(o.state)).sort((a, b) => a.due - b.due);
  const o = (g.sel?.k === "order" && s.orders.find((x) => x.id === g.sel!.id)) || active[0];
  return (
    <section className={inline ? "wf-track wf-inline" : "wf-track wf-glass wf-card"} aria-label="Shipment tracking">
      <div className="wf-between">
        <h3>Shipment Tracking</h3>
        <span className="wf-pill grey">{active.length} active</span>
      </div>
      {o ? <OrderCard g={g} s={s} o={o} compact /> : <p className="muted" style={{ fontSize: 13 }}>No shipments yet: accept an order.</p>}
    </section>
  );
}

/* ====================================================================== table */

function Table({ g, s, inline = false }: { g: Game; s: State; inline?: boolean }) {
  const [tab, setTab] = useState<"docks" | "forks" | "trucks" | "machines">("docks");
  const rows: { key: string; a: string; b: string; sub: string; pill: [string, string]; f: Focus }[] = [];
  if (tab === "docks")
    for (const d of s.doors) {
      const t = d.truck >= 0 ? s.trucks.find((x) => x.id === d.truck) : null;
      const o = d.order >= 0 ? s.orders.find((x) => x.id === d.order) : null;
      const pr = o ? sim.orderProgress(s, o) : null;
      rows.push({
        key: `d${d.i}`, a: sim.doorName(s, d.i), b: t ? t.plate : o ? `#${o.code}` : "No truck assigned", sub: t ? CARRIERS[t.carrier].name : o ? o.city : d.type === "in" ? "Inbound" : d.type === "out" ? "Outbound" : "Flex",
        pill: t ? (t.state === "docked" ? (t.dir === "out" && pr ? [`Loading ${pr.loaded}/${o!.total}`, ""] : ["Unloading", ""]) : [STATE_LABEL[t.state], "warn"]) : o ? ["Picking", "violet"] : ["Available", "good"], f: { k: "door", id: d.i },
      });
    }
  if (tab === "forks")
    for (const f of s.forks)
      rows.push({
        key: `f${f.id}`, a: f.name, b: f.phase === "charge" ? "Charging" : f.job ? f.job.kind[0].toUpperCase() + f.job.kind.slice(1) : "Idle", sub: `${f.trips} trips · battery ${Math.round(f.battery * 100)}%`,
        pill: f.phase === "charge" ? ["Charging", "violet"] : f.battery < 0.22 ? ["Low battery", "bad"] : f.job ? ["Busy", "good"] : ["Idle", "grey"], f: { k: "fork", id: f.id },
      });
  if (tab === "trucks")
    for (const t of [...s.trucks].filter((x) => x.state !== "gone").sort((a, b) => a.eta - b.eta))
      rows.push({
        key: `t${t.id}`, a: t.rail ? "Train" : t.dir === "in" ? "Inbound" : "Outbound", b: t.plate, sub: CARRIERS[t.carrier].name,
        pill: t.state === "transit" ? [`En route ${mins(t.eta - s.time)}`, ""] : [STATE_LABEL[t.state], t.state === "queued" ? "warn" : "good"], f: { k: "truck", id: t.id },
      });
  if (tab === "machines")
    for (const t of s.structs)
      if (!t.dead && t.m)
        rows.push({
          key: `m${t.id}`, a: `M-${String(t.id + 1).padStart(2, "0")}`, b: MACHINES[t.m.type].name, sub: ITEMS[MACHINES[t.m.type].recipes[t.m.recipe].output].name,
          pill: [t.m.state === "running" ? "Running" : t.m.state === "broken" ? "Broken" : t.m.state === "starved" ? "Starved" : t.m.state === "blocked" ? "Blocked" : t.m.state[0].toUpperCase() + t.m.state.slice(1), t.m.state === "running" ? "good" : t.m.state === "broken" ? "bad" : "warn"], f: { k: "struct", id: t.id },
        });
  return (
    <section className={inline ? "wf-table wf-inline" : "wf-table wf-glass wf-card"} aria-label="Site status" style={inline ? { marginTop: 14 } : undefined}>
      <div className="wf-tabs" role="tablist">
        {(["docks", "forks", "trucks", "machines"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {k === "docks" ? "Docks" : k === "forks" ? "Forklifts" : k === "trucks" ? "Trucks" : "Machines"}
          </button>
        ))}
      </div>
      <div className="wf-rows">
        {rows.map((r) => (
          <button key={r.key} className="wf-trow" onClick={() => g.select(r.f, true)}>
            <b>{r.a}</b>
            <span style={{ minWidth: 0 }}>
              {r.b}
              <span className="sub">{r.sub}</span>
            </span>
            <span className={`wf-pill ${r.pill[1]}`}>{r.pill[0]}</span>
          </button>
        ))}
        {!rows.length && <p className="dim" style={{ fontSize: 12.5, padding: 8 }}>Nothing here yet.</p>}
      </div>
    </section>
  );
}

/* ====================================================================== dock */

const DOCK: { id: Exclude<Sheet, null>; icon: string; label: string }[] = [
  { id: "site", icon: "🏭", label: "Site" },
  { id: "orders", icon: "📦", label: "Orders" },
  { id: "buy", icon: "🛒", label: "Buy" },
  { id: "build", icon: "🏗️", label: "Build" },
  { id: "fleet", icon: "🚜", label: "Fleet" },
  { id: "upgrades", icon: "⚡", label: "Upgrades" },
  { id: "goals", icon: "🎯", label: "Goals" },
  { id: "stats", icon: "📊", label: "Books" },
  { id: "menu", icon: "☰", label: "Menu" },
];

function Dock({ g, s }: { g: Game; s: State }) {
  const offers = s.orders.filter((o) => o.state === "offer").length;
  return (
    <nav className="wf-dock wf-glass" aria-label="Panels" data-testid="wf-dock">
      {DOCK.map((d) => (
        <button key={d.id} className={`${d.id === "site" ? "site " : ""}${g.sheet === d.id ? "on" : ""}`} onClick={() => g.open(d.id)} data-testid={`wf-dock-${d.id}`} aria-pressed={g.sheet === d.id}>
          <span aria-hidden="true">{d.icon}</span>
          {d.label}
          {d.id === "orders" && offers > 0 && <em>{offers}</em>}
        </button>
      ))}
    </nav>
  );
}

function Toolbar({ g }: { g: Game }) {
  const t = g.tool!;
  const name = t.kind === "remove" ? "Remove: tap a rack or machine" : t.kind === "machine" ? MACHINES[t.type!].name : t.kind === "rack" ? "Pallet rack" : "Floor block";
  return (
    <div className="wf-toolbar wf-glass wf-capsule" data-testid="wf-toolbar">
      <span>{name}</span>
      <span className="dim" style={{ fontWeight: 600 }}>
        {t.kind !== "remove" ? "tap the floor to build" : ""}
      </span>
      {t.kind === "rack" && (
        <button className="wf-btn small" onClick={() => g.rotateTool()}>
          ↻ Face {t.rot ? "north" : "south"}
        </button>
      )}
      <button className="wf-btn small primary" onClick={() => g.setTool(null)} data-testid="wf-tool-done">
        Done
      </button>
    </div>
  );
}

/* ====================================================================== sheets */

function Sheets({ g, s, sheet }: { g: Game; s: State; sheet: Exclude<Sheet, null> }) {
  const titles: Record<string, string> = { site: "Site", orders: "Orders", buy: "Buy stock", build: "Build", fleet: "Fleet & docks", upgrades: "Upgrades", goals: "Goals", stats: "The books", menu: "Menu", alerts: "Alerts", help: "How to play" };
  return (
    <section className="wf-sheet wf-glass" aria-label={titles[sheet]} data-testid={`wf-sheet-${sheet}`}>
      <header>
        <h2>{titles[sheet]}</h2>
        <button className="wf-btn icon small" onClick={() => g.open(null)} aria-label="Close" data-testid="wf-sheet-close">
          ✕
        </button>
      </header>
      <div className="body">
        {sheet === "site" && (
          <>
            <Search g={g} s={s} inline />
            <Tracking g={g} s={s} inline />
            <Table g={g} s={s} inline />
          </>
        )}
        {sheet === "orders" && <OrdersSheet g={g} s={s} />}
        {sheet === "buy" && <BuySheet g={g} s={s} />}
        {sheet === "build" && <BuildSheet g={g} s={s} />}
        {sheet === "fleet" && <FleetSheet g={g} s={s} />}
        {sheet === "upgrades" && <UpgradesSheet g={g} s={s} />}
        {sheet === "goals" && <GoalsSheet s={s} />}
        {sheet === "stats" && <StatsSheet s={s} />}
        {sheet === "menu" && <MenuSheet g={g} s={s} />}
        {sheet === "alerts" && <AlertsSheet g={g} s={s} />}
      </div>
    </section>
  );
}

function OrdersSheet({ g, s }: { g: Game; s: State }) {
  const offers = s.orders.filter((o) => o.state === "offer");
  const active = s.orders.filter((o) => ["confirmed", "picked", "loading", "transit"].includes(o.state)).sort((a, b) => a.due - b.due);
  const done = s.orders.filter((o) => o.state === "delivered" || o.state === "failed").slice(-6).reverse();
  const contracts = s.contracts.filter((c) => c.state === "offer" || c.state === "active");
  return (
    <>
      {contracts.length > 0 && (
        <>
          <div className="wf-section">Contracts</div>
          <div className="wf-list">
            {contracts.map((c) => (
              <div key={c.id} className="wf-item" data-testid="wf-contract">
                <div className="wf-between">
                  <h4>
                    📝 {c.customer} <span className="muted" style={{ fontWeight: 600 }}>· {c.city}</span>
                  </h4>
                  <span className="wf-pill violet">Bonus {money(c.bonus)}</span>
                </div>
                <p>
                  {c.count} shipments of {c.n} × {ITEMS[c.item].icon} {ITEMS[c.item].name}, one every {c.every} hours, 10% over list. The bonus is paid if every one is on time.
                </p>
                {c.state === "offer" ? (
                  <div className="wf-between" style={{ marginTop: 8 }}>
                    <span className="dim" style={{ fontSize: 11.5 }}>
                      expires {mins(c.expires - s.time)}
                    </span>
                    <div className="wf-seg">
                      <button className="wf-btn small" onClick={() => g.declineContract(c.id)}>
                        Decline
                      </button>
                      <button className="wf-btn small primary" onClick={() => g.acceptContract(c.id)} data-testid="wf-contract-accept">
                        Sign
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <div className="wf-bar">
                      <i style={{ width: `${((c.onTime + c.late) / c.count) * 100}%` }} />
                    </div>
                    <small className="dim">
                      {c.onTime + c.late}/{c.count} done{c.late ? ` · ${c.late} late` : ""}
                    </small>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <div className="wf-section">New offers</div>
      <div className="wf-list">
        {offers.map((o) => {
          const can = o.lines.every((l) => sim.availableCount(s, l.item) >= l.n);
          return (
            <div key={o.id} className="wf-item" data-testid="wf-offer">
              <div className="wf-between">
                <h4>
                  {o.customer} <span className="muted" style={{ fontWeight: 600 }}>· {o.city}</span>
                </h4>
                <b>{money(o.value)}</b>
              </div>
              <p>
                {o.lines.map((l) => `${l.n} × ${ITEMS[l.item].icon} ${ITEMS[l.item].name}`).join(" · ")}
                <br />
                Deliver within {mins(o.due - s.time)} ({mins(o.transit * 60)} on the road){o.rush ? " · RUSH +25%" : ""}
                {o.lines.some((l) => HIGH_TECH.includes(l.item)) ? " · high tech" : ""}
              </p>
              <div className="wf-between" style={{ marginTop: 8 }}>
                <span className={`wf-pill ${can ? "good" : "warn"}`}>{can ? "In stock" : "Need stock"}</span>
                <div className="wf-seg">
                  <span className="dim" style={{ fontSize: 11.5, alignSelf: "center" }}>
                    expires {mins(o.expires - s.time)}
                  </span>
                  <button className="wf-btn small" onClick={() => g.decline(o.id)}>
                    Decline
                  </button>
                  <button className="wf-btn small primary" onClick={() => g.accept(o.id)} data-testid="wf-accept">
                    Accept
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {!offers.length && <p className="dim" style={{ fontSize: 13 }}>No offers right now. Customers order through the day.</p>}
      </div>
      <div className="wf-section">Shipments</div>
      <div className="wf-list">
        {active.map((o) => (
          <button key={o.id} className="wf-item" style={{ textAlign: "left" }} onClick={() => g.select({ k: "order", id: o.id }, true)}>
            <OrderCard g={g} s={s} o={o} compact />
          </button>
        ))}
        {!active.length && <p className="dim" style={{ fontSize: 13 }}>Nothing on the go.</p>}
      </div>
      {done.length > 0 && (
        <>
          <div className="wf-section">Recent</div>
          <div className="wf-list">
            {done.map((o) => (
              <div key={o.id} className="wf-between" style={{ fontSize: 12.5 }}>
                <span>
                  #{o.code} · {o.customer}
                </span>
                <span className={`wf-pill ${o.state === "failed" ? "bad" : o.onTime ? "good" : "warn"}`}>{o.state === "failed" ? "Cancelled" : o.onTime ? `On time ${money(o.paid)}` : `Late ${money(o.paid)}`}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function BuySheet({ g, s }: { g: Game; s: State }) {
  const [n, setN] = useState(6);
  const [rail, setRail] = useState(false);
  const max = rail ? RAIL_CAP : 12;
  const group = (title: string, items: ItemId[]) => (
    <>
      <div className="wf-section">{title}</div>
      <div className="wf-list">
        {items.map((id) => {
          const it = ITEMS[id];
          const cost = sim.purchaseCost(s, id, Math.min(n, max), rail);
          const mk = sim.marketOf(s, id);
          const auto = s.auto[id];
          return (
            <div key={id} className="wf-item">
              <div className="wf-between">
                <h4>
                  {it.icon} {it.name}
                </h4>
                <span className="muted num" style={{ fontSize: 12.5 }}>
                  {sim.stock(s, id)} held · {sim.incoming(s, id)} coming
                </span>
              </div>
              <div className="wf-between" style={{ marginTop: 6 }}>
                <span className="dim" style={{ fontSize: 12 }}>
                  {money(sim.unitCost(s, id, rail))}/pallet{" "}
                  {Math.abs(mk - 1) > 0.01 && (
                    <b className={mk > 1 ? "wf-down" : "wf-up"} title="Today's market">
                      {mk > 1 ? "▲" : "▼"} {Math.abs(Math.round((mk - 1) * 100))}%
                    </b>
                  )}{" "}
                  · {supplierFor(id).name}
                </span>
                <div className="wf-seg">
                  <button className={`wf-btn small ${auto ? "on" : ""}`} onClick={() => g.setAuto(id, auto ? 0 : 4, n)} title="Keep at least 4 pallets: reorder automatically">
                    {auto ? "Auto ✓" : "Auto"}
                  </button>
                  <button className="wf-btn small primary" disabled={s.cash < cost} onClick={() => g.buy(id, Math.min(n, max), rail)} data-testid={`wf-buy-${id}`}>
                    Buy {Math.min(n, max)} · {money(cost)}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
  return (
    <>
      <div className="wf-between">
        <span className="muted" style={{ fontSize: 13 }}>Pallets per {rail ? "train" : "truck"}</span>
        <div className="wf-stepper">
          <button className="wf-btn icon small" onClick={() => setN(Math.max(1, n - 1))} aria-label="Fewer">
            −
          </button>
          <output className="num">{n}</output>
          <button className="wf-btn icon small" onClick={() => setN(Math.min(max, n + 1))} aria-label="More">
            +
          </button>
        </div>
      </div>
      {s.rail && (
        <div className="wf-seg" style={{ marginTop: 8 }}>
          <button className={`wf-btn small ${!rail ? "on" : ""}`} onClick={() => setRail(false)}>
            🚚 By truck
          </button>
          <button className={`wf-btn small ${rail ? "on" : ""}`} onClick={() => setRail(true)} data-testid="wf-buy-rail">
            🚆 By rail (up to {RAIL_CAP}, 10% off)
          </button>
        </div>
      )}
      <p className="dim" style={{ fontSize: 12, margin: "6px 0 0" }}>
        Plus {rail ? "$60 freight a train" : "$120 freight a truck"}. Prices move with the market every day. Auto keeps four pallets in stock and reorders when you fall below.
      </p>
      {group("Finished goods (wholesale)", GOODS)}
      {group("Raw materials", RAW)}
      {group("Parts", PARTS)}
    </>
  );
}

function BuildSheet({ g, s }: { g: Game; s: State }) {
  return (
    <>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        Pick something, then tap the floor inside the building (anywhere behind the yellow aisle). Racks are picked from the side the arrow points to; keep an aisle in front of them.
      </p>
      <div className="wf-section">Storage</div>
      <div className="wf-grid2">
        <button className="wf-tile" onClick={() => g.setTool({ kind: "rack", rot: 0 })} disabled={s.cash < RACK.cost} data-testid="wf-build-rack">
          <span className="big">🗄️</span>
          <b>{RACK.name}</b>
          <small>{RACK.blurb}</small>
          <b>{money(RACK.cost)}</b>
        </button>
        <button className="wf-tile" onClick={() => g.setTool({ kind: "floor", rot: 0 })} disabled={s.cash < FLOOR.cost}>
          <span className="big">⬚</span>
          <b>{FLOOR.name}</b>
          <small>{FLOOR.blurb}</small>
          <b>{money(FLOOR.cost)}</b>
        </button>
        <button className="wf-tile" onClick={() => g.setTool({ kind: "charger", rot: 0 })} disabled={s.cash < CHARGER.cost} data-testid="wf-build-charger">
          <span className="big">🔌</span>
          <b>{CHARGER.name}</b>
          <small>{CHARGER.blurb}</small>
          <b>{money(CHARGER.cost)}</b>
        </button>
      </div>
      <div className="wf-section">Production</div>
      <div className="wf-grid2">
        {MACHINE_TYPES.map((t) => {
          const m = MACHINES[t];
          return (
            <button key={t} className="wf-tile" onClick={() => g.setTool({ kind: "machine", type: t, rot: 0 })} disabled={s.cash < m.cost} data-testid={`wf-build-${t}`}>
              <span className="big" style={{ color: m.color }}>
                ⚙
              </span>
              <b>{m.name}</b>
              <small>{m.blurb}</small>
              <small>{m.recipes.map((r) => ITEMS[r.output].name).join(", ")}</small>
              <b>
                {money(m.cost)} <span className="dim">· {m.w}×{m.d}</span>
              </b>
            </button>
          );
        })}
      </div>
      <div className="wf-section">Tools</div>
      <button className="wf-btn" onClick={() => g.setTool({ kind: "remove", rot: 0 })}>
        🗑 Remove (half the cost back)
      </button>
    </>
  );
}

function FleetSheet({ g, s }: { g: Game; s: State }) {
  return (
    <>
      <div className="wf-between">
        <div>
          <b>
            {s.forks.length}/{MAX_FORKLIFTS} forklifts
          </b>
          <div className="dim" style={{ fontSize: 12 }}>
            $40 an hour each, with a driver
          </div>
        </div>
        <button className="wf-btn primary" onClick={() => g.buyForklift()} disabled={s.cash < FORKLIFT_COST || s.forks.length >= MAX_FORKLIFTS} data-testid="wf-buy-forklift">
          Buy forklift · {money(FORKLIFT_COST)}
        </button>
      </div>
      <div className="wf-section">Forklifts</div>
      <div className="wf-list">
        {s.forks.map((f) => (
          <button key={f.id} className="wf-trow" onClick={() => g.select({ k: "fork", id: f.id }, true)}>
            <b>{f.name}</b>
            <span>{f.job ? f.job.kind : "Idle"}</span>
            <span className={`wf-pill ${f.job ? "good" : "grey"}`}>{f.trips} trips</span>
          </button>
        ))}
      </div>
      <div className="wf-section">Dock doors</div>
      <div className="wf-list">
        {s.doors.map((d) => (
          <div key={d.i} className="wf-between" style={{ fontSize: 13 }}>
            <b>{sim.doorName(s, d.i)}</b>
            <div className="wf-seg">
              {(["out", "in", "flex"] as DoorType[]).map((ty) => (
                <button key={ty} className={`wf-btn small ${d.type === ty ? "on" : ""}`} onClick={() => g.setDoor(d.i, ty)}>
                  {ty === "out" ? "Out" : ty === "in" ? "In" : "Flex"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function UpgradesSheet({ g, s }: { g: Game; s: State }) {
  return (
    <div className="wf-grid2">
      {UPGRADES.map((u) => {
        const done = u.id !== "door" && sim.up(s, u.id);
        const cost = sim.upgradeCost(s, u.id);
        const locked = u.needs && !sim.up(s, u.needs);
        return (
          <button key={u.id} className={`wf-tile ${done ? "on" : ""}`} disabled={done || !!locked || s.cash < cost} onClick={() => g.buyUpgrade(u.id)} data-testid={`wf-up-${u.id}`}>
            <span className="big">{u.icon}</span>
            <b>{u.name}</b>
            <small>{u.body}</small>
            <b>{done ? "✓ Done" : locked ? "Locked" : money(cost)}</b>
          </button>
        );
      })}
    </div>
  );
}

function GoalsSheet({ s }: { s: State }) {
  const n = GOALS.filter((x) => s.goals[x.id]).length;
  return (
    <>
      <div className="wf-bar" style={{ marginBottom: 10 }}>
        <i style={{ width: `${(n / GOALS.length) * 100}%` }} />
      </div>
      <div className="wf-list">
        {GOALS.map((x) => (
          <div key={x.id} className="wf-item wf-between">
            <div>
              <h4>
                {s.goals[x.id] ? "✅" : "◻️"} {x.name}
              </h4>
              <p>{x.body}</p>
            </div>
            {x.reward > 0 && <span className={`wf-pill ${s.goals[x.id] ? "good" : "grey"}`}>{money(x.reward)}</span>}
          </div>
        ))}
      </div>
    </>
  );
}

function StatsSheet({ s }: { s: State }) {
  const L = s.ledger;
  const days = [...s.days, s.today];
  const max = Math.max(1, ...days.map((d) => Math.max(d.revenue, d.costs)));
  return (
    <>
      <div className="wf-kv" style={{ marginTop: 0 }}>
        <div>
          <small>Net worth</small>
          <b>{money(sim.worth(s))}</b>
        </div>
        <div>
          <small>Score</small>
          <b className="num" data-testid="wf-score">{sim.score(s).toLocaleString("en-US")}</b>
        </div>
        <div>
          <small>Delivered</small>
          <b>
            {s.stats.delivered} ({s.stats.onTime} on time)
          </b>
        </div>
        <div>
          <small>Season</small>
          <b>{s.seasonOver ? "Over: playing on" : `Day ${sim.day(s.time)} of ${SEASON_DAYS}`}</b>
        </div>
      </div>
      <div className="wf-section">Revenue and costs by day</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110 }} role="img" aria-label="Revenue and costs by day">
        {days.map((d) => (
          <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 90 }}>
              <span style={{ width: 9, height: `${(d.revenue / max) * 90}px`, background: "#2f6fe4", borderRadius: "4px 4px 0 0" }} title={`Revenue ${money(d.revenue)}`} />
              <span style={{ width: 9, height: `${(d.costs / max) * 90}px`, background: "#f28c28", borderRadius: "4px 4px 0 0" }} title={`Costs ${money(d.costs)}`} />
            </div>
            <small className="dim" style={{ fontSize: 10.5 }}>
              D{d.day}
            </small>
          </div>
        ))}
      </div>
      <div className="wf-row dim" style={{ fontSize: 11.5, gap: 12, marginTop: 4 }}>
        <span>
          <i style={{ display: "inline-block", width: 9, height: 9, background: "#2f6fe4", borderRadius: 2 }} /> Revenue
        </span>
        <span>
          <i style={{ display: "inline-block", width: 9, height: 9, background: "#f28c28", borderRadius: 2 }} /> Costs
        </span>
      </div>
      <div className="wf-section">Ledger</div>
      <div className="wf-list" style={{ fontSize: 13 }}>
        {(
          [
            ["Revenue", L.revenue],
            ["Goal rewards and sales", L.rewards],
            ["Stock and materials", -L.purchases],
            ["Wages", -L.wages],
            ["Machine upkeep and repairs", -L.upkeep],
            ["Rent", -L.rent],
            ["Penalties and detention", -L.penalties],
            ["Equipment and building", -L.capex],
          ] as [string, number][]
        ).map(([k, v]) => (
          <div key={k} className="wf-between">
            <span className="muted">{k}</span>
            <b className={`num ${v < 0 ? "wf-down" : "wf-up"}`}>{money(v)}</b>
          </div>
        ))}
      </div>
    </>
  );
}

function MenuSheet({ g, s }: { g: Game; s: State }) {
  return (
    <div className="wf-list">
      <div className="wf-item">
        <h4>Graphics</h4>
        <p>High has soft shadows and sharper edges; low runs lighter. Applies when you next open the game.</p>
        <div className="wf-seg" style={{ marginTop: 8 }}>
          {(["auto", "high", "low"] as const).map((q) => (
            <button key={q} className={`wf-btn small ${g.prefs.gfx === q ? "on" : ""}`} onClick={() => g.setPrefs({ gfx: q })}>
              {q[0].toUpperCase() + q.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="wf-item">
        <h4>Time of day</h4>
        <p>Follow the clock through sunrise, sunset and night (lights come on), or keep it daytime.</p>
        <div className="wf-seg" style={{ marginTop: 8 }}>
          <button className={`wf-btn small ${g.prefs.daylight === "cycle" ? "on" : ""}`} onClick={() => g.setPrefs({ daylight: "cycle" })} data-testid="wf-daylight-cycle">
            Day and night
          </button>
          <button className={`wf-btn small ${g.prefs.daylight === "day" ? "on" : ""}`} onClick={() => g.setPrefs({ daylight: "day" })}>
            Always day
          </button>
        </div>
      </div>
      <div className="wf-item">
        <h4>Controls</h4>
        <p>Drag to move, pinch or scroll to zoom, two fingers (or right-drag) to turn. Tap anything to inspect it. Space pauses, 1 to 4 set the speed, R turns a rack you&apos;re placing, Esc closes.</p>
      </div>
      <div className="wf-seg">
        <button
          className="wf-btn"
          onClick={() => {
            g.save();
            g.say("Saved", "good");
          }}
        >
          💾 Save
        </button>
        <button className="wf-btn" onClick={() => g.quit()} data-testid="wf-quit">
          ⏏ Save and leave
        </button>
      </div>
      <p className="dim" style={{ fontSize: 12 }}>
        {siteDef(s.site).code} {siteDef(s.site).name} · season of {SEASON_DAYS} days · your score is how much you grow the business.
      </p>
    </div>
  );
}

function AlertsSheet({ g, s }: { g: Game; s: State }) {
  return (
    <div className="wf-list">
      {[...s.alerts].reverse().map((a) => (
        <button key={a.id} className="wf-item" style={{ textAlign: "left" }} onClick={() => a.focus && g.select(a.focus, true)}>
          <div className="wf-between">
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {a.kind === "bad" ? "⛔" : a.kind === "warn" ? "⚠️" : a.kind === "good" ? "✅" : "ℹ️"} {a.text}
            </span>
            <small className="dim num">
              D{sim.day(a.t)} {sim.clock(a.t)}
            </small>
          </div>
        </button>
      ))}
    </div>
  );
}

function Over({ g, s }: { g: Game; s: State }) {
  return (
    <div className="wf-over" data-testid="wf-over">
      <div className="wf-glass wf-card">
        <div style={{ fontSize: 40 }}>{s.bankrupt ? "📉" : "🏁"}</div>
        <h3 style={{ fontSize: 22 }}>{s.bankrupt ? "Bankrupt" : "Season over"}</h3>
        <p className="muted">
          Net worth {money(sim.worth(s))} · {s.stats.delivered} shipments, {s.stats.onTime} on time · {s.stats.madeGoods} pallets made.
        </p>
        <p style={{ fontSize: 28, fontWeight: 900, margin: "6px 0" }} className="num">
          {sim.score(s).toLocaleString("en-US")}
        </p>
        <div className="dim" style={{ fontSize: 12, marginBottom: 12 }}>
          Score
        </div>
        <div className="wf-seg" style={{ justifyContent: "center" }}>
          {!s.bankrupt && (
            <button
              className="wf-btn primary"
              onClick={() => g.keepGoing()}
            >
              Keep going
            </button>
          )}
          <button className="wf-btn" onClick={() => g.quit()}>
            Back to sites
          </button>
        </div>
      </div>
    </div>
  );
}
