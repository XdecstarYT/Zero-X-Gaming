"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PoweredBy } from "@/nextx/PoweredBy";
import { GlassDefs, canRefract, trackSheen } from "@/nextx/glass";
import {
  AIR, BELT, BREAKROOM, CAMPAIGN, CARRIERS, CARRIER_FEE, CHARGER, CITIES, FENCE, OFFICE, RIVALS, SUPPLIERS, EVENTS, FORKLIFT_COST, FREEZER, FROZEN, GOALS, HIGH_TECH, HOUR, INDUSTRIES, INDUSTRY_LEVELS, ITEMS, MACHINES, MANAGERS, MAX_FORKLIFTS, MAX_OWN_TRUCKS, MAX_STORES,
  OWN_TRUCK_COST, OWN_TRUCK_WAGE, RACK, FLOOR, RAIL_CAP, RAW, PARTS, GOODS, SEASON_DAYS, SPEEDS, STORES, STORE_HOURS, STORE_KINDS, THAW_SECS, UPGRADES,
  BID_RANGE, buyPrice, city, itemIndustry, machineIndustry, siteDef, supplierFor, type DoorType, type IndustryId, type ItemId, type StoreKind,
} from "../data";
import { TIPS, type CompanyTab, type Game, type Sheet } from "../game";
import * as sim from "../sim";
import type { Focus, Order, Pallet, State, Store } from "../sim";

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
/** Short money for tight spots: $950, $12.4k, $1.25M. */
const short = (n: number) => {
  const a = Math.abs(n);
  const trim = (x: string) => (x.includes(".") ? x.replace(/0+$/, "").replace(/\.$/, "") : x);
  const v = a >= 1e6 ? `$${trim((a / 1e6).toFixed(a >= 1e7 ? 1 : 2))}M` : a >= 1e4 ? `$${trim((a / 1e3).toFixed(a >= 1e5 ? 0 : 1))}k` : `$${Math.round(a).toLocaleString("en-US")}`;
  return `${n < 0 ? "−" : ""}${v}`;
};
/** Cash on the top bar: in full up to a million. */
const cashText = (n: number) => (Math.abs(n) >= 1e6 ? short(n) : money(n));
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
      ) : g.photo ? (
        <button className="wf-btn wf-photo-exit" onClick={() => g.togglePhoto()} data-testid="wf-photo-exit">
          ✕ Exit photo mode
        </button>
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
          {s.report && !g.sheet && !g.tool && <DayReport g={g} s={s} />}
          {!s.report && !g.sheet && !g.sel && !g.tool && !s.tipsOff && s.tip < TIPS.length && <TipCard g={g} s={s} />}
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
  const [sandbox, setSandbox] = useState(false);
  return (
    <div className="wf-title" data-testid="wf-title">
      <div className="wf-hero">
        <div className="logo">
          <Mark size={64} /> WareForge
        </div>
        <p>Run the dock, the racks and the production floor. Build your own factory, go into food, fashion, pharma and cars, open stores and run the whole company, in 3D.</p>
      </div>
      <div className="wf-titlebar" style={{ marginTop: 0, flexDirection: "column", gap: 4 }}>
        <button className={`wf-btn ${sandbox ? "on" : ""}`} aria-pressed={sandbox} onClick={() => setSandbox(!sandbox)} data-testid="wf-sandbox">
          🧪 Sandbox {sandbox ? "on" : "off"}
        </button>
        <small className="dim" style={{ fontWeight: 600, textAlign: "center" }}>
          {sandbox ? "Money no object, every industry open, no score: build anything." : "Turn it on to build freely with unlimited money."}
        </small>
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
              <span>{sandbox ? "∞" : money(d.cash)}</span>·<span>{d.doors.length} doors</span>·<span>{d.forklifts} forklifts</span>
              {d.machines.length > 0 && <>·<span>{d.machines.length} machines</span></>}
              {!!d.belts?.length && <>·<span>conveyors</span></>}
              {!d.racks.length && <>·<span>an empty floor</span></>}
              {d.rail && <>·<span>rail</span></>}
              {d.mega && <>·<span>Mega hall</span></>}
              {d.openPlan && <>·<b className="wf-up">open plan: build anywhere</b></>}
              {(d.industries ?? []).map((i) => (
                <span key={i}>· {INDUSTRIES.find((x) => x.id === i)!.icon} {INDUSTRIES.find((x) => x.id === i)!.name}</span>
              ))}
            </div>
            <button className="wf-btn primary wide" data-testid={`wf-site-${d.id}`} onClick={() => g.newGame(d.id, sandbox)}>
              {sandbox ? "Sandbox" : "Run"} {d.code}
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
          <b>Accept orders</b> from customers, and forklifts pick the pallets onto the lanes behind a door. A truck backs onto the door, is loaded and drives off; deliver before the deadline to be paid in full. <b>Buy stock</b> or raw materials (a truck brings them in), <b>build</b> racks, floor blocks, machines and conveyors that link them, and move anything about. In <b>Company</b>, license new industries (food, fashion, pharma, cars), open <b>stores</b> in thirteen cities and hire managers to run sales, supply, retail and the plant. Five days make a season; your score is how much you grow the business. Sandbox has no money worries and no score.
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
      <CashPill g={g} s={s} />
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
        <i />{" "}
        <span className="num">
          <span className="wf-day">
            <span className="wf-long">Day </span>
            <span className="wf-short">D</span>
            {sim.day(s.time)}
            <span className="wf-long"> ·</span>{" "}
          </span>
          {sim.clock(s.time)}
        </span>
      </div>
      <div className="wf-speeds" role="group" aria-label="Speed">
        <button className={g.hold ? "on" : ""} onClick={() => g.togglePause()} aria-label={g.hold ? "Resume" : "Pause"} data-testid="wf-pause">
          {g.hold ? "▶" : "❚❚"}
        </button>
        {SPEEDS.map((v, i) => (
          <button key={v} className={`sp${!g.hold && g.speed === v ? " on" : ""}`} onClick={() => g.setSpeed(i)} aria-label={`${v} times speed`} data-testid={`wf-speed-${v}`}>
            {v}×
          </button>
        ))}
        <button className={`cyc${!g.hold ? " on" : ""}`} onClick={() => g.cycleSpeed()} aria-label={`Speed ${g.speed} times: tap for faster`} data-testid="wf-speed-cycle">
          {g.speed}×
        </button>
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

/** The money, always on show: tap it for the bank. It flashes and pops "+$1,240" as money comes and goes. */
function CashPill({ g, s }: { g: Game; s: State }) {
  const trend = sim.cashTrend(s);
  const [base] = useState(() => (s.fx.length ? s.fx[s.fx.length - 1].id : 0));
  const pops = s.fx.filter((f) => f.id > base && f.amount !== 0).slice(-3);
  const last = pops[pops.length - 1];
  const tone = s.cash < 0 ? " neg" : s.cash < 5_000 ? " low" : "";
  return (
    <button
      className={`wf-cash${tone}${g.sheet === "bank" ? " on" : ""}`}
      onClick={() => g.open("bank")}
      data-testid="wf-cash"
      aria-label={s.sandbox ? "Sandbox: unlimited cash. Open the bank" : `Cash ${money(s.cash)}${s.loan ? `, owing ${money(s.loan)}` : ""}. Open the bank`}
      title="Cash: tap for the bank"
    >
      <i aria-hidden="true">$</i>
      <span key={last?.id ?? 0} className={`v num${last ? (last.amount > 0 ? " flash up" : " flash down") : ""}`} data-testid="wf-cash-value">
        {s.sandbox ? "∞ Sandbox" : cashText(s.cash)}
      </span>
      {trend !== 0 && (
        <small className={`t num ${trend > 0 ? "wf-up" : "wf-down"}`} aria-hidden="true">
          {trend > 0 ? "▲" : "▼"} {short(Math.abs(trend))}
        </small>
      )}
      <span className="wf-pops" aria-hidden="true">
        {pops.map((f) => (
          <span key={f.id} className={f.amount > 0 ? "up" : "down"} style={{ top: 6 + (f.id % 3) * 24 }}>
            {f.amount > 0 ? "+" : "−"}
            {money(Math.abs(f.amount)).replace("−", "")} <small>{f.text}</small>
          </span>
        ))}
      </span>
    </button>
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
    // Focusable: on a phone the row scrolls sideways.
    <div className="wf-kpis" data-testid="wf-kpis" role="region" aria-label="Key figures" tabIndex={0}>
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
          <i aria-hidden="true">📈</i> <span>Net worth</span>
        </div>
        <div className={`v num ${k.worth < 0 ? "wf-down" : ""}`}>{short(k.worth)}</div>
        <div className="d">{s.loan ? `owes ${money(s.loan)}` : "no debt"}</div>
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
      {s.stores.length > 0 && (
        <div className="wf-kpi wf-glass">
          <div className="k">
            <i aria-hidden="true">🏪</i> <span>Store sales today</span>
          </div>
          <div className="v num">{short(s.today.retail)}</div>
          <div className="d">
            {s.stores.length} store{s.stores.length > 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

/* ====================================================================== inspector */

function Inspector({ g, s, f }: { g: Game; s: State; f: Focus }) {
  const close = () => g.select(null);
  let body: React.ReactNode = null;
  if (f.k === "pallet") body = <PalletInfo g={g} s={s} id={f.id} />;
  else if (f.k === "fork") body = <ForkInfo g={g} s={s} id={f.id} />;
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
  if (sl.kind === "belt") return `On conveyor C-${String(t.id + 1).padStart(2, "0")}`;
  if (sl.kind === "in" || sl.kind === "out") return `${MACHINES[t.m!.type].name} ${sl.kind === "in" ? "input" : "output"}`;
  const lv = Math.round(sl.y / sim.LEVEL_H);
  const n = String(t.id + 1).padStart(2, "0");
  if (t.kind === "freezer") return `Freezer FZ-${n} · level ${lv + 1}`;
  return `${t.kind === "rack" ? `Rack R-${n}` : `Block F-${n}`}${t.kind === "rack" ? ` · level ${lv + 1}` : ""}`;
}

function PalletInfo({ g, s, id }: { g: Game; s: State; id: number }) {
  const p = s.pallets[id];
  if (!p) return null;
  const it = ITEMS[p.item];
  const o = p.order >= 0 ? s.orders.find((x) => x.id === p.order) : null;
  const where = p.loc === "slot" ? slotLabel(s, p.ref) : p.loc === "fork" ? `On ${s.forks[p.ref]?.name}` : `In ${s.trucks.find((t) => t.id === p.ref)?.plate}`;
  const status = p.loc === "fork" ? "Moving" : p.loc === "truck" ? "In trailer" : s.slots[p.ref]?.kind === "stage" ? "Staged" : s.slots[p.ref]?.kind === "store" ? "Stored" : s.slots[p.ref]?.kind === "belt" ? "On a conveyor" : "At machine";
  return (
    <>
      <div className="wf-eyebrow">Pallet · {it.name}</div>
      <div className="title">PAL-{1000 + p.id}</div>
      <div className="wf-chips">
        <span className="wf-pill">{status}</span>
        <span className="wf-pill grey">{siteDef(s.site).code}</span>
        {o && <span className="wf-pill violet">#{o.code}</span>}
        {it.frozen && <span className="wf-pill cold">❄ Frozen</span>}
      </div>
      {it.frozen && <ColdInfo s={s} p={p} />}
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

/** How long a frozen pallet has left out of the cold. */
function ColdInfo({ s, p }: { s: State; p: Pallet }) {
  const warm = p.warm ?? 0;
  const sl = p.loc === "slot" ? s.slots[p.ref] : null;
  const rate = sl ? sim.warmRate(s, sl) : 0;
  const pct = Math.min(1, warm / THAW_SECS);
  return (
    <>
      <div className="wf-section">Cold chain</div>
      <div className="wf-bar" role="img" aria-label={`Warmed ${Math.round(pct * 100)}%`}>
        <i style={{ width: `${Math.max(3, pct * 100)}%`, background: pct > 0.66 ? "linear-gradient(90deg,#f06c70,#d83d43)" : pct > 0.33 ? "linear-gradient(90deg,#f5a524,#e08a00)" : "linear-gradient(90deg,#8fd3ff,#3d8bff)" }} />
      </div>
      <small className="dim">
        {sl?.cold ? (warm > 0 ? "Back in the freezer: cooling down" : "In the freezer at −20 °C") : !sl ? "On the move: it keeps cold in transit" : `${sl.kind === "stage" ? "Waiting at the door" : "Out of the cold"}: spoils in ${mins((THAW_SECS - warm) / rate)}`}
      </small>
    </>
  );
}

function ForkInfo({ g, s, id }: { g: Game; s: State; id: number }) {
  const f = s.forks[id];
  if (!f) return null;
  const lv = sim.forkLevel(s, f);
  const j = f.job;
  const p = j ? s.pallets[j.pallet] : null;
  const verb: Record<string, string> = { charge: "Charging", load: "Loading a truck", unload: "Unloading a truck", output: "Clearing a machine", pick: "Picking an order", feed: "Feeding a machine", putaway: "Putting away" };
  return (
    <>
      <div className="wf-eyebrow">Forklift</div>
      <div className="title">{f.name}</div>
      <div className="wf-chips">
        <span className={`wf-pill ${j ? "good" : "grey"}`}>{j ? verb[j.kind] : f.phase === "charge" ? "Charging" : f.phase === "park" ? "Parking" : "Idle"}</span>
        <span className="wf-pill violet" title="Drivers get quicker with experience: 3% a level">
          ★ Level {lv}
        </span>
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
      <FollowButton g={g} f={{ k: "fork", id }} />
    </>
  );
}

function FollowButton({ g, f }: { g: Game; f: Focus }) {
  const on = g.following?.k === f.k && g.following.id === f.id;
  return (
    <button className={`wf-btn small wide ${on ? "on" : ""}`} style={{ marginTop: 10 }} onClick={() => g.toggleFollow(f)} aria-pressed={on} data-testid="wf-follow">
      {on ? "📍 Following: tap to stop" : "📍 Follow with the camera"}
    </button>
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
        {t.own !== undefined && <span className="wf-pill good">Your fleet</span>}
        {o?.vip && <span className="wf-pill gold">⭐ VIP</span>}
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
      <FollowButton g={g} f={{ k: "truck", id }} />
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
        <div className="wf-eyebrow">
          Machine · M-{String(t.id + 1).padStart(2, "0")} · {INDUSTRIES.find((x) => x.id === machineIndustry(m.type))!.icon} {INDUSTRIES.find((x) => x.id === machineIndustry(m.type))!.name}
        </div>
        <div className="title">{def.name}</div>
        <div className="wf-chips">
          <span className={`wf-pill ${cls}`}>{label}</span>
          <span className="wf-pill grey">Made {m.made}</span>
          <span className="wf-pill grey" title="Share of the last couple of hours spent running">Busy {Math.round((m.util ?? 0) * 100)}%</span>
          {m.mk && <span className="wf-pill violet">Mk II</span>}
          {t.rot === 1 && <span className="wf-pill grey">Mirrored</span>}
        </div>
        <MachineHint s={s} id={t.id} />
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
          {!m.mk && (
            <button className="wf-btn small primary" disabled={!sim.afford(s, sim.mk2Cost(t))} onClick={() => g.upgradeMachine(t.id)} data-testid="wf-mk2" title="A quarter faster, and wears 20% slower">
              ⬆ Mk II · {money(sim.mk2Cost(t))}
            </button>
          )}
          <button className="wf-btn small" onClick={() => g.startMove(t.id)} data-testid="wf-move">
            ✥ Move
          </button>
          <button className="wf-btn small" onClick={() => g.turn(t.id)} title="Materials in at the other end" data-testid="wf-mirror">
            ⇄ Mirror
          </button>
          <button className="wf-btn small" onClick={() => g.removeStruct(t.id)}>
            Sell
          </button>
        </div>
      </>
    );
  }
  if (t.kind === "belt") {
    const sl = s.slots[t.slots[0]];
    const p = sl.pallet >= 0 ? s.pallets[sl.pallet] : null;
    const [nx, nz] = sim.beltNext(t);
    const next = sim.structAt(s, nx, nz);
    const into = next && next.kind === "machine" && nx === sim.inColumn(next) ? next : null;
    const where = next?.kind === "belt" ? "Onto the next conveyor" : into ? `Into ${MACHINES[into.m!.type].name} M-${String(into.id + 1).padStart(2, "0")}` : "The end of the line: forklifts collect here";
    return (
      <>
        <div className="wf-eyebrow">Conveyor</div>
        <div className="title">C-{String(t.id + 1).padStart(2, "0")}</div>
        <div className="wf-chips">
          <span className="wf-pill">Runs {["east", "south", "west", "north"][t.rot & 3]} {["→", "↓", "←", "↑"][t.rot & 3]}</span>
          <span className="wf-pill grey">{where}</span>
        </div>
        <div className="wf-section">Carrying</div>
        {chips}
        {p && (
          <div className="wf-bar" style={{ marginTop: 8 }}>
            <i style={{ width: `${Math.min(100, (p.bt ?? 0) * 100)}%` }} />
          </div>
        )}
        <p className="dim" style={{ fontSize: 12, margin: "8px 0 0" }}>
          {BELT.blurb}
        </p>
        <div className="wf-seg" style={{ marginTop: 12 }}>
          <button className="wf-btn small" onClick={() => g.turn(t.id)} data-testid="wf-turn">
            ↻ Turn
          </button>
          <button className="wf-btn small" onClick={() => g.startMove(t.id)}>
            ✥ Move
          </button>
          <button className="wf-btn small" onClick={() => g.removeStruct(t.id)}>
            Remove
          </button>
        </div>
      </>
    );
  }
  if (sim.FACILITIES.includes(t.kind)) {
    const n = sim.built(s, t.kind);
    const def = t.kind === "office" ? OFFICE : t.kind === "breakroom" ? BREAKROOM : FENCE;
    const effect =
      t.kind === "office"
        ? `Customers order ${8 * Math.min(2, n)}% more (${n} office${n === 1 ? "" : "s"}, two count)`
        : t.kind === "breakroom"
          ? `Forklift drivers work ${Math.round((sim.breakBonus(s) - 1) * 100)}% quicker (${n} break room${n === 1 ? "" : "s"}, three count${sim.up(s, "ergonomics") ? ", doubled by Ergonomics" : ""})`
          : `${n} tile${n === 1 ? "" : "s"} of fence: forklifts go round`;
    return (
      <>
        <div className="wf-eyebrow">Facility</div>
        <div className="title">{def.name}</div>
        <div className="wf-chips">
          <span className={`wf-pill ${t.kind === "fence" ? "grey" : "good"}`} data-testid="wf-facility-effect">
            {effect}
          </span>
        </div>
        <p className="dim" style={{ fontSize: 12, margin: "8px 0 0" }}>
          {def.blurb}
        </p>
        <div className="wf-seg" style={{ marginTop: 12 }}>
          <button className="wf-btn small" onClick={() => g.startMove(t.id)} data-testid="wf-move">
            ✥ Move
          </button>
          <button className="wf-btn small" onClick={() => g.removeStruct(t.id)}>
            Remove
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
          <button className="wf-btn small" onClick={() => g.startMove(t.id)}>
            ✥ Move
          </button>
          <button className="wf-btn small" onClick={() => g.removeStruct(t.id)}>
            Remove
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="wf-eyebrow">{t.kind === "rack" ? "Pallet rack" : t.kind === "freezer" ? "Freezer rack" : "Floor block"}</div>
      <div className="title">
        {t.kind === "rack" ? "R" : t.kind === "freezer" ? "FZ" : "F"}-{String(t.id + 1).padStart(2, "0")}
      </div>
      <div className="wf-chips">
        <span className="wf-pill">
          {pallets.length}/{t.slots.length} full
        </span>
        {t.kind === "freezer" && <span className="wf-pill cold">❄ −20 °C</span>}
        {(t.kind === "rack" || t.kind === "freezer") && <span className="wf-pill grey">Picked from the {t.rot ? "north" : "south"}</span>}
      </div>
      <div className="wf-section">Pallets</div>
      {chips}
      <div className="wf-seg" style={{ marginTop: 12 }}>
        {(t.kind === "rack" || t.kind === "freezer") && (
          <button className="wf-btn small" onClick={() => g.turn(t.id)}>
            ↻ Turn round
          </button>
        )}
        <button className="wf-btn small" onClick={() => g.startMove(t.id)} data-testid="wf-move">
          ✥ Move
        </button>
        <button className="wf-btn small" onClick={() => g.removeStruct(t.id)}>
          Remove
        </button>
      </div>
    </>
  );
}

/** Why a machine isn't running, in a line: what it's short of, or where its goods should go. */
function MachineHint({ s, id }: { s: State; id: number }) {
  const t = s.structs[id];
  const m = t?.m;
  if (!m) return null;
  const r = MACHINES[m.type].recipes[m.recipe];
  let text = "";
  if (m.state === "starved") {
    const have = new Set(t.slots.map((x) => s.slots[x]).filter((sl) => sl.kind === "in" && sl.pallet >= 0).map((sl) => s.pallets[sl.pallet].item));
    const short = r.inputs.filter((i) => !have.has(i));
    const none = short.filter((i) => sim.availableCount(s, i) === 0 && sim.incoming(s, i) === 0);
    text = `Waiting for ${short.map((i) => ITEMS[i].name.toLowerCase()).join(" and ")}${none.length ? `: none in stock, buy ${none.map((i) => ITEMS[i].name.toLowerCase()).join(" and ")}` : ": on its way"}`;
  } else if (m.state === "blocked") text = sim.outBelts(s, t).length ? "Its conveyor is full: clear the end of the line, or add storage" : "Its output is full: forklifts will clear it (or run a conveyor off it)";
  else if (m.state === "off") text = "Switched off: it costs less to keep, but makes nothing";
  if (!text) return null;
  return (
    <p className={`wf-pill ${m.state === "off" ? "grey" : "warn"}`} style={{ marginTop: 8, height: "auto", padding: "4px 10px", whiteSpace: "normal" }}>
      {text}
    </p>
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
            {o.store !== undefined ? "Restock" : "Shipment"} · {o.customer}
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
              <b>{o.store !== undefined ? "Your store" : money(o.value)}</b>
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
                {o.store !== undefined ? "Call off (free)" : "Cancel (20% penalty)"}
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
  { id: "company", icon: "🏢", label: "Company" },
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
  const moving = t.kind === "move" && t.id !== undefined ? g.s?.structs[t.id] : undefined;
  const kind = moving ? moving.kind : t.kind;
  const what = (k: string, type?: string) =>
    k === "machine" ? MACHINES[type as keyof typeof MACHINES].name : k === "rack" ? "Pallet rack" : k === "freezer" ? FREEZER.name : k === "charger" ? CHARGER.name : k === "belt" ? BELT.name : k === "office" ? OFFICE.name : k === "breakroom" ? BREAKROOM.name : k === "fence" ? FENCE.name : "Floor block";
  const name = t.kind === "remove" ? "Remove: tap a rack or machine" : t.kind === "move" ? (moving ? `Moving: ${what(moving.kind, moving.m?.type)}` : "Move: tap what to pick up") : what(t.kind, t.type);
  const hint = t.kind === "remove" ? "" : t.kind === "move" && !moving ? "it must be empty" : t.kind === "move" ? "tap where it goes" : t.kind === "belt" || t.kind === "fence" ? "tap tile by tile to lay a line" : "tap the floor to build";
  return (
    <div className="wf-toolbar wf-glass wf-capsule" data-testid="wf-toolbar">
      <span>{name}</span>
      <span className="dim" style={{ fontWeight: 600 }}>
        {hint}
      </span>
      {(kind === "rack" || kind === "freezer") && (
        <button className="wf-btn small" onClick={() => g.rotateTool()}>
          ↻ Face {t.rot ? "north" : "south"}
        </button>
      )}
      {kind === "belt" && (
        <button className="wf-btn small" onClick={() => g.rotateTool()} data-testid="wf-tool-turn">
          ↻ Runs {["east →", "south ↓", "west ←", "north ↑"][t.rot & 3]}
        </button>
      )}
      {kind === "machine" && (
        <button className="wf-btn small" onClick={() => g.rotateTool()}>
          ⇄ In on the {t.rot ? "right" : "left"}
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
  const titles: Record<string, string> = { site: "Site", orders: "Orders", buy: "Buy stock", build: "Build", fleet: "Fleet & docks", upgrades: "Upgrades", goals: "Goals & missions", company: "Company", menu: "Menu", alerts: "Alerts", help: "How to play", bank: "Cash & bank" };
  return (
    <section className="wf-sheet wf-glass" aria-label={titles[sheet]} data-testid={`wf-sheet-${sheet}`}>
      <header>
        <h2>{titles[sheet]}</h2>
        <button className="wf-btn icon small" onClick={() => g.open(null)} aria-label="Close" data-testid="wf-sheet-close">
          ✕
        </button>
      </header>
      {/* Focusable so the keyboard can scroll panels with nothing to press (goals, the books). */}
      <div className="body" tabIndex={0}>
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
        {sheet === "company" && <CompanySheet g={g} s={s} />}
        {sheet === "menu" && <MenuSheet g={g} s={s} />}
        {sheet === "alerts" && <AlertsSheet g={g} s={s} />}
        {sheet === "bank" && <BankSheet g={g} s={s} />}
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
          const tier = sim.loyalty(s, o.customer);
          return (
            <div key={o.id} className={`wf-item${o.vip ? " vip" : ""}`} data-testid="wf-offer">
              <div className="wf-between">
                <h4>
                  {o.vip && <span className="wf-pill gold">⭐ VIP</span>} {o.customer} <span className="muted" style={{ fontWeight: 600 }}>· {o.city}</span>
                </h4>
                <b>{money(o.value)}</b>
              </div>
              {tier > 0 && (
                <span className={`wf-pill tier${tier}`} style={{ marginTop: 4 }}>
                  {sim.LOYALTY[tier]} customer · pays {[0, 3, 6, 10][tier]}% more
                </span>
              )}
              <p>
                {o.lines.map((l) => `${l.n} × ${ITEMS[l.item].icon} ${ITEMS[l.item].name}`).join(" · ")}
                <br />
                Deliver within {mins(o.due - s.time)} ({mins(o.transit * 60)} on the road){o.rush ? " · RUSH +25%" : ""}
                {o.vip ? " · VIP +50%, big reputation" : ""}
                {o.lines.some((l) => HIGH_TECH.includes(l.item)) ? " · high tech" : ""}
                {o.lines.some((l) => FROZEN.includes(l.item)) ? " · ❄ frozen" : ""}
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
      <Customers s={s} />
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

/** Who you deliver to, and how loyal they are (on-time deliveries make them Bronze, Silver, then Gold). */
function Customers({ s }: { s: State }) {
  const rows = Object.entries(s.customers)
    .map(([name, c]) => ({ name, ...c, tier: sim.loyalty(s, name) }))
    .sort((a, b) => b.tier - a.tier || b.onTime - a.onTime)
    .slice(0, 8);
  if (!rows.length) return null;
  return (
    <>
      <div className="wf-section">Customers</div>
      <div className="wf-list" data-testid="wf-customers">
        {rows.map((c) => (
          <div key={c.name} className="wf-between" style={{ fontSize: 12.5 }}>
            <span>
              <b>{c.name}</b>{" "}
              <span className="dim">
                {c.onTime} on time{c.late ? ` · ${c.late} late` : ""}
              </span>
            </span>
            <span className={`wf-pill ${c.tier ? `tier${c.tier}` : "grey"}`}>{c.tier ? sim.LOYALTY[c.tier] : "New"}</span>
          </div>
        ))}
      </div>
      <p className="dim" style={{ fontSize: 11.5, margin: "6px 0 0" }}>
        Deliver on time to make customers loyal: Bronze pays 3% more, Silver 6% and orders more, Gold 10%.
      </p>
    </>
  );
}

function BuySheet({ g, s }: { g: Game; s: State }) {
  const [n, setN] = useState(6);
  // What you trade in: the site's own goods, and everything from the industries you're licensed in.
  const trades = (id: ItemId) => {
    const ind = itemIndustry(id);
    return !ind || sim.licensed(s, ind) || siteDef(s.site).goodsMix.includes(id);
  };
  const [mode, setMode] = useState<"truck" | "rail" | "air">("truck");
  const rail = mode === "rail" && s.rail;
  const air = mode === "air";
  const max = rail ? RAIL_CAP : 12;
  const group = (title: string, items: ItemId[]) => (
    <>
      <div className="wf-section">{title}</div>
      <div className="wf-list">
        {items.map((id) => {
          const it = ITEMS[id];
          const cost = sim.purchaseCost(s, id, Math.min(n, max), rail, air);
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
                  {money(sim.unitCost(s, id, rail, air))}/pallet{" "}
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
                  <button className="wf-btn small primary" disabled={!sim.afford(s, cost)} onClick={() => g.buy(id, Math.min(n, max), rail, air)} data-testid={`wf-buy-${id}`}>
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
        <span className="muted" style={{ fontSize: 13 }}>Pallets per {rail ? "train" : air ? "flight" : "truck"}</span>
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
      <div className="wf-seg" style={{ marginTop: 8 }} role="group" aria-label="How it comes">
        <button className={`wf-btn small ${mode === "truck" || (mode === "rail" && !s.rail) ? "on" : ""}`} aria-pressed={mode === "truck"} onClick={() => setMode("truck")}>
          🚚 Truck
        </button>
        {s.rail && (
          <button className={`wf-btn small ${rail ? "on" : ""}`} aria-pressed={rail} onClick={() => setMode("rail")} data-testid="wf-buy-rail">
            🚆 Rail (up to {RAIL_CAP}, 10% off)
          </button>
        )}
        <button className={`wf-btn small ${air ? "on" : ""}`} aria-pressed={air} onClick={() => setMode("air")} data-testid="wf-buy-air">
          ✈️ Air (4× faster)
        </button>
      </div>
      <p className="dim" style={{ fontSize: 12, margin: "6px 0 0" }}>
        Plus {money(sim.freight(s, rail, air))} freight a {rail ? "train" : air ? "flight" : "truck"}
        {air ? `, and pallets cost ${Math.round((AIR.surcharge - 1) * (sim.up(s, "aircargo") ? 0.6 : 1) * 100)}% more (lands in a quarter of the time${sim.up(s, "aircargo") ? ", Air cargo deal applied" : ""})` : ""}. Prices move with the market every day. Auto keeps four pallets in stock and reorders when you fall below.
      </p>
      {group("Finished goods (wholesale)", GOODS.filter((id) => !FROZEN.includes(id) && trades(id)))}
      {sim.up(s, "cold") && group("Frozen (keep in freezer racks)", FROZEN)}
      {group("Raw materials", RAW.filter(trades))}
      {group("Parts", PARTS.filter(trades))}
      {INDUSTRIES.some((i) => !sim.licensed(s, i.id)) && (
        <p className="dim" style={{ fontSize: 12, margin: "10px 0 0" }}>
          More materials and goods come with each industry licence (Company → Industries).
        </p>
      )}
    </>
  );
}

const FACILITY_TILES = [
  ["office", OFFICE, "🏢"],
  ["breakroom", BREAKROOM, "☕"],
  ["fence", FENCE, "🚧"],
] as const;

function BuildSheet({ g, s }: { g: Game; s: State }) {
  const open = sim.openPlan(s);
  return (
    <>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }} data-testid="wf-build-intro">
        {open ? (
          <>
            <b>Open plan:</b> build anywhere in the hall, the old aisle included, right up to the yellow line by the dock lanes. Forklifts drive round whatever you put down, so leave them a way through.{" "}
          </>
        ) : (
          "Pick something, then tap the floor inside the building (anywhere behind the yellow aisle). "
        )}
        Racks are picked from the side the arrow points to; machines take materials in at the blue arrows and send goods out at the green. Anything can be moved later, free.
      </p>
      <div className="wf-section">Storage</div>
      <div className="wf-grid2">
        <button className="wf-tile" onClick={() => g.setTool({ kind: "rack", rot: 0 })} disabled={!sim.afford(s, RACK.cost)} data-testid="wf-build-rack">
          <span className="big">🗄️</span>
          <b>{RACK.name}</b>
          <small>{RACK.blurb}</small>
          <b>{money(RACK.cost)}</b>
        </button>
        <button className="wf-tile" onClick={() => g.setTool({ kind: "floor", rot: 0 })} disabled={!sim.afford(s, FLOOR.cost)}>
          <span className="big">⬚</span>
          <b>{FLOOR.name}</b>
          <small>{FLOOR.blurb}</small>
          <b>{money(FLOOR.cost)}</b>
        </button>
        {sim.up(s, "cold") && (
          <button className="wf-tile" onClick={() => g.setTool({ kind: "freezer", rot: 0 })} disabled={!sim.afford(s, FREEZER.cost)} data-testid="wf-build-freezer">
            <span className="big">❄️</span>
            <b>{FREEZER.name}</b>
            <small>{FREEZER.blurb}</small>
            <b>{money(FREEZER.cost)}</b>
          </button>
        )}
        <button className="wf-tile" onClick={() => g.setTool({ kind: "charger", rot: 0 })} disabled={!sim.afford(s, CHARGER.cost)} data-testid="wf-build-charger">
          <span className="big">🔌</span>
          <b>{CHARGER.name}</b>
          <small>{CHARGER.blurb}</small>
          <b>{money(CHARGER.cost)}</b>
        </button>
        <button className="wf-tile" onClick={() => g.setTool({ kind: "belt", rot: 0 })} disabled={!sim.afford(s, BELT.cost)} data-testid="wf-build-belt">
          <span className="big">➡️</span>
          <b>{BELT.name}</b>
          <small>{BELT.blurb}</small>
          <b>{money(BELT.cost)} a tile</b>
        </button>
      </div>
      <div className="wf-section">Facilities</div>
      <div className="wf-grid2">
        {FACILITY_TILES.map(([k, d, icon]) => {
          const n = sim.built(s, k);
          return (
            <button key={k} className="wf-tile" onClick={() => g.setTool({ kind: k, rot: 0 })} disabled={!sim.afford(s, d.cost)} data-testid={`wf-build-${k}`}>
              <span className="big">{icon}</span>
              <b>{d.name}</b>
              <small>{d.blurb}</small>
              <b>
                {money(d.cost)}
                {k === "fence" ? " a tile" : ""} <span className="dim">· {d.w}×{d.d}{n ? ` · ${n} built` : ""}</span>
              </b>
            </button>
          );
        })}
      </div>
      {INDUSTRIES.map((ind) => {
        const ok = sim.licensed(s, ind.id);
        return (
          <div key={ind.id}>
            <div className="wf-section wf-between">
              <span>
                {ind.icon} {ind.name}
              </span>
              {!ok && (
                <button className="wf-btn small" onClick={() => g.openCompany("industries")} data-testid={`wf-build-licence-${ind.id}`}>
                  🔒 Licence {money(ind.cost)}
                </button>
              )}
            </div>
            <div className="wf-grid2">
              {ind.machines.map((t) => {
                const m = MACHINES[t];
                return (
                  <button key={t} className="wf-tile" onClick={() => g.setTool({ kind: "machine", type: t, rot: 0 })} disabled={!ok || !sim.afford(s, m.cost)} data-testid={`wf-build-${t}`}>
                    <span className="big" style={{ color: m.color }}>
                      ⚙
                    </span>
                    <b>{m.name}</b>
                    <small>{m.blurb}</small>
                    <small>{m.recipes.map((r) => `${r.inputs.map((x) => ITEMS[x].icon).join("+")}→${ITEMS[r.output].icon}`).join("  ")}</small>
                    <b>
                      {money(m.cost)} <span className="dim">· {m.w}×{m.d}</span>
                    </b>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="wf-section">Tools</div>
      <div className="wf-seg">
        <button className="wf-btn" onClick={() => g.setTool({ kind: "move", rot: 0 })} data-testid="wf-tool-move">
          ✥ Move something (free)
        </button>
        <button className="wf-btn" onClick={() => g.setTool({ kind: "remove", rot: 0 })}>
          🗑 Remove (half the cost back)
        </button>
      </div>
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
            <span>
              {f.job ? f.job.kind : "Idle"}
              <span className="sub">
                ★ Level {sim.forkLevel(s, f)} · {f.trips} trips
              </span>
            </span>
            <span className={`wf-pill ${f.job ? "good" : "grey"}`}>{Math.round(f.battery * 100)}%</span>
          </button>
        ))}
      </div>
      <OwnFleet g={g} s={s} />
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

/** Your own trucks: no carrier's cut on the shipments they carry. */
function OwnFleet({ g, s }: { g: Game; s: State }) {
  const depot = sim.up(s, "depot");
  return (
    <>
      <div className="wf-section">Your trucks</div>
      {!depot ? (
        <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
          Carriers keep {Math.round(CARRIER_FEE * 100)}% of every shipment. Build the 🚛 Transport depot (Upgrades) to run your own trucks and keep it.
        </p>
      ) : (
        <>
          <div className="wf-between">
            <div className="dim" style={{ fontSize: 12 }}>
              {s.ownTrucks.length}/{MAX_OWN_TRUCKS} trucks · ${OWN_TRUCK_WAGE} an hour each with a driver
            </div>
            <button className="wf-btn small primary" onClick={() => g.buyOwnTruck()} disabled={s.cash < OWN_TRUCK_COST || s.ownTrucks.length >= MAX_OWN_TRUCKS} data-testid="wf-buy-truck">
              Buy truck · {money(OWN_TRUCK_COST)}
            </button>
          </div>
          <div className="wf-list" style={{ marginTop: 8 }}>
            {s.ownTrucks.map((t) => {
              const out = t.free > s.time;
              const truck = s.trucks.find((x) => x.own === t.id && x.state !== "gone");
              return (
                <button key={t.id} className="wf-trow" onClick={() => truck && g.select({ k: "truck", id: truck.id }, true)} disabled={!truck}>
                  <b>{t.name}</b>
                  <span>
                    {truck ? STATE_LABEL[truck.state] : out ? (t.free < sim.OUT_ON_JOB ? `Driving back · ${mins(t.free - s.time)}` : "Out on a job") : "At the depot"}
                    <span className="sub">{t.trips} trips</span>
                  </span>
                  <span className={`wf-pill ${out || truck ? "good" : "grey"}`}>{out || truck ? "Busy" : "Free"}</span>
                </button>
              );
            })}
            {!s.ownTrucks.length && <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>No trucks yet: buy one and it takes your next shipment.</p>}
          </div>
        </>
      )}
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

function Missions({ s }: { s: State }) {
  return (
    <div className="wf-list" data-testid="wf-missions">
      {s.missions.map((m, i) => {
        const p = Math.min(m.target, sim.missionProgress(s, m));
        return (
          <div key={i} className={`wf-item${m.done ? " done" : ""}`}>
            <div className="wf-between">
              <h4>
                {m.done ? "✅" : m.icon} {m.name}
              </h4>
              <span className={`wf-pill ${m.done ? "good" : ""}`}>{money(m.reward)}</span>
            </div>
            <div className="wf-bar" style={{ marginTop: 8 }}>
              <i style={{ width: `${(p / m.target) * 100}%` }} />
            </div>
            <small className="dim num">
              {m.kind === "revenue" ? `${money(p)} of ${money(m.target)}` : `${p.toLocaleString("en-US")} of ${m.target.toLocaleString("en-US")}`}
            </small>
          </div>
        );
      })}
      {!s.missions.length && <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>New missions arrive at midnight.</p>}
    </div>
  );
}

function GoalsSheet({ s }: { s: State }) {
  const n = GOALS.filter((x) => s.goals[x.id]).length;
  return (
    <>
      <div className="wf-section" style={{ marginTop: 0 }}>
        Today&apos;s missions · {s.stats.missions} done this season
      </div>
      <Missions s={s} />
      <div className="wf-section">
        Goals · {n}/{GOALS.length}
      </div>
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

/** The books: revenue and costs by day, and the ledger. */
function StatsSheet({ s }: { s: State }) {
  const L = s.ledger;
  const days = [...s.days, s.today];
  const max = Math.max(1, ...days.map((d) => Math.max(d.revenue, d.costs)));
  return (
    <>
      <div className="wf-kv">
        <div>
          <small>Delivered</small>
          <b>
            {s.stats.delivered} ({s.stats.onTime} on time)
          </b>
        </div>
        <div>
          <small>Season</small>
          <b>{s.sandbox ? "Sandbox: no season" : s.seasonOver ? "Over: playing on" : `Day ${sim.day(s.time)} of ${SEASON_DAYS}`}</b>
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
            ["Orders delivered", L.revenue],
            ["Store sales", L.retail],
            ["Goal rewards and sales", L.rewards],
            ["Stock and materials", -L.purchases],
            ["Wages", -L.wages],
            ["Machine upkeep and repairs", -L.upkeep],
            ["Rent", -L.rent],
            ["Penalties and detention", -L.penalties],
            ["Carriers' fees", -L.carriers],
            ["Loan interest", -L.interest],
            ["Spoiled stock", -L.spoilage],
            ["Store rent and staff", -L.stores],
            ["Managers' salaries", -L.managers],
            ["Equipment, building and licences", -L.capex],
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
        <p>High adds ambient occlusion, a glow on the lights and the NextX colour grade; medium is sharp with sun shadows (phones); low runs lightest. Applies when you next open the game.</p>
        <div className="wf-seg" style={{ marginTop: 8 }}>
          {(["auto", "high", "medium", "low"] as const).map((q) => (
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
        <h4>Sound and help</h4>
        <p>A till ding when money comes in, a horn at the gate, an alarm for trouble. Tips walk you through the first shift.</p>
        <div className="wf-seg" style={{ marginTop: 8 }}>
          <button className={`wf-btn small ${g.prefs.sound ? "on" : ""}`} onClick={() => g.setPrefs({ sound: !g.prefs.sound })} aria-pressed={g.prefs.sound} data-testid="wf-sound">
            {g.prefs.sound ? "🔊 Sound on" : "🔇 Sound off"}
          </button>
          <button
            className={`wf-btn small ${!s.tipsOff ? "on" : ""}`}
            aria-pressed={!s.tipsOff}
            onClick={() => g.toggleTips()}
          >
            💡 Tips {s.tipsOff ? "off" : "on"}
          </button>
          <button className="wf-btn small" onClick={() => g.togglePhoto()} data-testid="wf-photo">
            📷 Photo mode
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
          Net worth {money(sim.worth(s))} · {s.stats.delivered} shipments, {s.stats.onTime} on time · {s.stats.madeGoods} pallets made · {s.stats.missions} missions.
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

/* ====================================================================== the company */

const CO_TABS: [CompanyTab, string][] = [
  ["overview", "Overview"],
  ["map", "Map"],
  ["industries", "Industries"],
  ["production", "Production"],
  ["market", "Market"],
  ["stores", "Stores"],
  ["managers", "Managers"],
];

function CompanySheet({ g, s }: { g: Game; s: State }) {
  const tab = g.companyTab;
  return (
    <>
      <div className="wf-tabs" role="tablist" aria-label="Company">
        {CO_TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => g.openCompany(k)} data-testid={`wf-co-${k}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && <CompanyOverview g={g} s={s} />}
      {tab === "map" && <MapTab g={g} s={s} />}
      {tab === "industries" && <IndustriesTab g={g} s={s} />}
      {tab === "production" && <ProductionTab g={g} s={s} />}
      {tab === "market" && <MarketTab g={g} s={s} />}
      {tab === "stores" && <StoresTab g={g} s={s} />}
      {tab === "managers" && <ManagersTab g={g} s={s} />}
    </>
  );
}

function CompanyOverview({ g, s }: { g: Game; s: State }) {
  const t = s.today;
  const machines = s.structs.filter((x) => !x.dead && x.m);
  const running = machines.filter((x) => x.m!.state === "running").length;
  const licensed = INDUSTRIES.filter((i) => sim.licensed(s, i.id));
  const hired = MANAGERS.filter((m) => s.managers[m.id]);
  const seg: [string, string, number, CompanyTab | null][] = [
    ["📦", "Wholesale orders", t.revenue - t.retail, null],
    ["🏪", "Your stores", t.retail, "stores"],
    ["💸", "Running costs and buying", -t.costs, null],
  ];
  return (
    <>
      <div className="wf-kv" style={{ marginTop: 10 }}>
        <div>
          <small>Net worth</small>
          <b className="num">{s.sandbox ? "Sandbox" : money(sim.worth(s))}</b>
        </div>
        <div>
          <small>Profit today</small>
          <b className={`num ${t.revenue - t.costs < 0 ? "wf-down" : "wf-up"}`}>{money(t.revenue - t.costs)}</b>
        </div>
        <div>
          <small>Made today</small>
          <b className="num">{t.made} pallets</b>
        </div>
        <div>
          <small>Score</small>
          <b className="num" data-testid="wf-score">{s.sandbox ? "No score" : sim.score(s).toLocaleString("en-US")}</b>
        </div>
      </div>
      <div className="wf-section">Today, by business</div>
      <div className="wf-list">
        {seg.map(([icon, name, v, tab]) => (
          <button key={name} className="wf-trow" onClick={() => tab && g.openCompany(tab)} disabled={!tab} style={{ gridTemplateColumns: "auto 1fr auto" }}>
            <b aria-hidden="true">{icon}</b>
            <span>{name}</span>
            <b className={`num ${v < 0 ? "wf-down" : v > 0 ? "wf-up" : "dim"}`}>{money(v)}</b>
          </button>
        ))}
      </div>
      <div className="wf-section">The group</div>
      <div className="wf-list">
        <button className="wf-trow" onClick={() => g.openCompany("industries")} style={{ gridTemplateColumns: "auto 1fr auto" }}>
          <b aria-hidden="true">🏭</b>
          <span>
            Industries
            <span className="sub">{licensed.map((i) => `${i.icon} ${i.name} L${sim.industryLevel(s, i.id)}`).join(" · ")}</span>
          </span>
          <span className="wf-pill">
            {licensed.length}/{INDUSTRIES.length}
          </span>
        </button>
        <button className="wf-trow" onClick={() => g.openCompany("production")} style={{ gridTemplateColumns: "auto 1fr auto" }}>
          <b aria-hidden="true">⚙️</b>
          <span>
            Production
            <span className="sub">
              {machines.length} machines, {running} running · {s.structs.filter((x) => !x.dead && x.kind === "belt").length} conveyor tile{s.structs.filter((x) => !x.dead && x.kind === "belt").length === 1 ? "" : "s"}
            </span>
          </span>
          <span className={`wf-pill ${machines.length && running === 0 ? "warn" : "good"}`}>{machines.length ? `${Math.round((running / machines.length) * 100)}%` : "None"}</span>
        </button>
        <button className="wf-trow" onClick={() => g.openCompany("stores")} style={{ gridTemplateColumns: "auto 1fr auto" }}>
          <b aria-hidden="true">🏪</b>
          <span>
            Stores
            <span className="sub">{s.stores.length ? s.stores.map((x) => x.city).join(", ") : "Open one in a city: sell at shelf prices"}</span>
          </span>
          <span className="wf-pill">
            {s.stores.length}/{MAX_STORES}
          </span>
        </button>
        <button className="wf-trow" onClick={() => g.openCompany("managers")} style={{ gridTemplateColumns: "auto 1fr auto" }}>
          <b aria-hidden="true">👔</b>
          <span>
            Managers
            <span className="sub">{hired.length ? hired.map((m) => m.name).join(", ") : "Hire people to run sales, supply, stores and the plant"}</span>
          </span>
          <span className="wf-pill">{hired.length}/4</span>
        </button>
      </div>
      <StatsSheet s={s} />
    </>
  );
}

function IndustriesTab({ g, s }: { g: Game; s: State }) {
  return (
    <div className="wf-list" style={{ marginTop: 10 }}>
      {INDUSTRIES.map((ind) => {
        const ok = sim.licensed(s, ind.id);
        const lv = sim.industryLevel(s, ind.id);
        const made = sim.industryMade(s, ind.id);
        const next = INDUSTRY_LEVELS[lv - 1];
        return (
          <div key={ind.id} className="wf-item" data-testid={`wf-ind-${ind.id}`}>
            <div className="wf-between">
              <h4>
                {ind.icon} {ind.name}
              </h4>
              {ok ? (
                <span className="wf-pill good">
                  Level {lv}
                  {lv > 1 ? ` · pays ${[0, 5, 12][lv - 1]}% more` : ""}
                </span>
              ) : (
                <button className="wf-btn small primary" disabled={!sim.afford(s, ind.cost)} onClick={() => g.buyLicence(ind.id)} data-testid={`wf-licence-${ind.id}`}>
                  Get the licence · {money(ind.cost)}
                </button>
              )}
            </div>
            <p>{ind.blurb}</p>
            <div className="wf-chips" style={{ marginTop: 6 }}>
              {ind.goods.map((i) => (
                <span key={i} className="wf-pill grey">
                  {ITEMS[i].icon} {ITEMS[i].name} {short(ITEMS[i].price)}
                </span>
              ))}
            </div>
            {ok && next !== undefined && (
              <div style={{ marginTop: 8 }}>
                <div className="wf-bar">
                  <i style={{ width: `${Math.min(100, (made / next) * 100)}%` }} />
                </div>
                <small className="dim">
                  {made} of {next} pallets made for level {lv + 1}
                </small>
              </div>
            )}
            <small className="dim" style={{ display: "block", marginTop: 4 }}>
              Machines: {ind.machines.map((t) => MACHINES[t].name).join(", ")}
            </small>
          </div>
        );
      })}
    </div>
  );
}

function ProductionTab({ g, s }: { g: Game; s: State }) {
  const ms = s.structs.filter((t) => !t.dead && t.m);
  const belts = s.structs.filter((t) => !t.dead && t.kind === "belt");
  const riding = belts.filter((t) => s.slots[t.slots[0]].pallet >= 0).length;
  // What starved machines are waiting for.
  const short = new Map<ItemId, number>();
  for (const t of ms) {
    if (t.m!.state !== "starved") continue;
    const have = new Set(t.slots.map((x) => s.slots[x]).filter((sl) => sl.kind === "in" && sl.pallet >= 0).map((sl) => s.pallets[sl.pallet].item));
    for (const i of MACHINES[t.m!.type].recipes[t.m!.recipe].inputs) if (!have.has(i)) short.set(i, (short.get(i) ?? 0) + 1);
  }
  const label: Record<string, [string, string]> = {
    running: ["Running", "good"], starved: ["Starved", "warn"], blocked: ["Blocked", "warn"], broken: ["Broken", "bad"], repair: ["Repair", ""], service: ["Service", ""], idle: ["Ready", "grey"], off: ["Off", "grey"],
  };
  return (
    <>
      <div className="wf-kv" style={{ marginTop: 10 }}>
        <div>
          <small>Machines</small>
          <b className="num">
            {ms.filter((t) => t.m!.state === "running").length}/{ms.length} running
          </b>
        </div>
        <div>
          <small>Made today</small>
          <b className="num">{s.today.made} pallets of goods</b>
        </div>
        <div>
          <small>Conveyors</small>
          <b className="num">
            {belts.length} tiles · {riding} riding
          </b>
        </div>
        <div>
          <small>Carried in by conveyor</small>
          <b className="num">{s.stats.belted}</b>
        </div>
      </div>
      {short.size > 0 && (
        <p className="wf-pill warn" style={{ marginTop: 10, height: "auto", padding: "6px 10px", whiteSpace: "normal" }} data-testid="wf-short">
          Short of {[...short.entries()].map(([i, n]) => `${ITEMS[i].icon} ${ITEMS[i].name.toLowerCase()} (${n} machine${n > 1 ? "s" : ""})`).join(", ")}
        </p>
      )}
      <div className="wf-seg" style={{ marginTop: 10 }}>
        <button className="wf-btn small" onClick={() => g.autoSupply()} disabled={!ms.length} data-testid="wf-autosupply" title="Reorder every machine's raw materials when they run low">
          🔁 Auto-order every machine&apos;s materials
        </button>
        <button className="wf-btn small" onClick={() => g.openCompany("managers")}>
          👔 Managers
        </button>
      </div>
      <div className="wf-section">Machines</div>
      <div className="wf-list" data-testid="wf-production">
        {ms.map((t) => {
          const m = t.m!;
          const r = MACHINES[m.type].recipes[m.recipe];
          const [txt, cls] = label[m.state] ?? ["", "grey"];
          const rate = HOUR / sim.cycleSecs(s, t);
          return (
            <button key={t.id} className="wf-trow" onClick={() => g.select({ k: "struct", id: t.id }, true)}>
              <b>M-{String(t.id + 1).padStart(2, "0")}</b>
              <span style={{ minWidth: 0 }}>
                {MACHINES[m.type].name}
                <span className="sub">
                  {r.inputs.map((x) => ITEMS[x].icon).join("+")}→{ITEMS[r.output].icon} {ITEMS[r.output].name} · {rate.toFixed(1)}/h · busy {Math.round((m.util ?? 0) * 100)}% · made {m.made}
                </span>
              </span>
              <span className={`wf-pill ${cls}`}>{txt}</span>
            </button>
          );
        })}
        {!ms.length && <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>No machines yet: build one (Build), then link them with conveyors.</p>}
      </div>
    </>
  );
}

const pct = (p: number) => (Math.abs(p - 1) < 0.001 ? "Usual" : `${p > 1 ? "+" : "−"}${Math.round(Math.abs(p - 1) * 100)}%`);

function StoreCard({ g, s, st }: { g: Game; s: State; st: Store }) {
  const def = STORES[st.kind];
  const coming = sim.storeIncoming(s, st.id);
  const h = Math.floor((s.time % 86_400) / 3_600);
  const trading = st.open && h >= STORE_HOURS[0] && h < STORE_HOURS[1];
  return (
    <div className="wf-item" data-testid="wf-store">
      <div className="wf-between">
        <h4>
          {def.icon} {st.name}
        </h4>
        <span className={`wf-pill ${trading ? "good" : "grey"}`}>{!st.open ? "Closed" : trading ? "Trading" : `Opens ${STORE_HOURS[0]}:00`}</span>
      </div>
      <div className="wf-kv" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div>
          <small>Today</small>
          <b className="num wf-up">{money(st.today)}</b>
        </div>
        <div>
          <small>All time</small>
          <b className="num">{short(st.total)}</b>
        </div>
        <div>
          <small>{sim.STORE_SIZES[st.level]}</small>
          <b className="num">{money(sim.storeRent(st))}/h</b>
        </div>
      </div>
      <div className="wf-section" style={{ marginTop: 8 }}>
        Shoppers {Math.round(st.happy)}% happy{st.lost > 0.05 ? ` · ${st.lost.toFixed(1)} pallets of sales lost to empty shelves today` : ""}
      </div>
      <div className="wf-bar">
        <i style={{ width: `${Math.max(3, st.happy)}%`, background: st.happy < 35 ? "linear-gradient(90deg,#f06c70,#d83d43)" : st.happy < 65 ? "linear-gradient(90deg,#f5a524,#e08a00)" : undefined }} />
      </div>
      <div className="wf-section">Shelves (pallets) · tap to send two more</div>
      <div className="wf-chips">
        {def.goods.filter((i) => st.stock[i] !== undefined || !FROZEN.includes(i) || sim.up(s, "cold")).map((i) => {
          const free = Math.floor(sim.freeStock(s, i));
          return (
            <button key={i} className="wf-palchip" disabled={free < 1} onClick={() => g.restock(st.id, [{ item: i, n: Math.min(2, free) }])} title={`${free} free in the warehouse`} data-testid={`wf-restock-${i}`}>
              <i style={{ background: ITEMS[i].load }} /> {ITEMS[i].icon} {(st.stock[i] ?? 0).toFixed(1)}
              {coming[i] ? ` +${coming[i]} coming` : ""}
            </button>
          );
        })}
      </div>
      <div className="wf-between" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
        <div className="wf-stepper" aria-label="Prices">
          <button className="wf-btn icon small" onClick={() => g.setStore(st.id, { price: st.price - 0.05 })} aria-label="Lower prices">
            −
          </button>
          <output className="num" style={{ minWidth: 76 }}>
            Prices {pct(st.price)}
          </output>
          <button className="wf-btn icon small" onClick={() => g.setStore(st.id, { price: st.price + 0.05 })} aria-label="Raise prices">
            +
          </button>
        </div>
        <div className="wf-stepper" aria-label="Staff">
          <button className="wf-btn icon small" onClick={() => g.setStore(st.id, { staff: st.staff - 1 })} aria-label="Fewer staff">
            −
          </button>
          <output className="num" style={{ minWidth: 64 }}>
            {st.staff}/{sim.maxStaff(st)} staff
          </output>
          <button className="wf-btn icon small" onClick={() => g.setStore(st.id, { staff: st.staff + 1 })} aria-label="More staff">
            +
          </button>
        </div>
      </div>
      <div className="wf-seg" style={{ marginTop: 10 }}>
        <button className={`wf-btn small ${st.auto ? "on" : ""}`} aria-pressed={st.auto} onClick={() => g.setStore(st.id, { auto: !st.auto })}>
          {st.auto ? "Auto restock ✓" : "Auto restock"}
        </button>
        <button className="wf-btn small" onClick={() => g.setStore(st.id, { open: !st.open })}>
          {st.open ? "Close for now" : "Reopen"}
        </button>
        {st.level < 3 && (
          <button className="wf-btn small primary" disabled={!sim.afford(s, sim.storeUpgradeCost(st))} onClick={() => g.upgradeStore(st.id)}>
            ⬆ {sim.STORE_SIZES[st.level + 1]} · {short(sim.storeUpgradeCost(st))}
          </button>
        )}
        <button className="wf-btn small" onClick={() => g.closeStore(st.id)}>
          Sell
        </button>
      </div>
    </div>
  );
}

function StoresTab({ g, s }: { g: Game; s: State }) {
  const open = STORE_KINDS.filter((k) => sim.licensed(s, STORES[k].ind));
  const [kind, setKind] = useState<StoreKind>(open[0] ?? "discount");
  const [where, setWhere] = useState(g.storeCity);
  const def = STORES[kind];
  const cost = sim.storeCost(kind, where);
  return (
    <>
      <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>
        Stores sell your goods to shoppers at shelf prices ({Math.round((1.5 - 1) * 100)}% over wholesale) from {STORE_HOURS[0]}:00 to {STORE_HOURS[1]}:00. Restocks go out like any shipment: picked to a door and trucked to the city.
      </p>
      <div className="wf-list" style={{ marginTop: 10 }}>
        {s.stores.map((st) => (
          <StoreCard key={st.id} g={g} s={s} st={st} />
        ))}
      </div>
      <div className="wf-section">Open a store</div>
      <div className="wf-item" data-testid="wf-store-new">
        <div className="wf-chips">
          {STORE_KINDS.map((k) => {
            const ok = sim.licensed(s, STORES[k].ind);
            return (
              <button key={k} className={`wf-btn small ${kind === k ? "on" : ""}`} disabled={!ok} onClick={() => setKind(k)} title={ok ? STORES[k].goods.map((i) => ITEMS[i].name).join(", ") : `Needs the ${INDUSTRIES.find((x) => x.id === STORES[k].ind)!.name} licence`} data-testid={`wf-storekind-${k}`}>
                {ok ? STORES[k].icon : "🔒"} {STORES[k].name}
              </button>
            );
          })}
        </div>
        <p style={{ margin: "8px 0" }}>Sells {def.goods.map((i) => `${ITEMS[i].icon} ${ITEMS[i].name.toLowerCase()}`).join(", ")}.</p>
        <label className="wf-between" style={{ gap: 8, fontSize: 13 }}>
          <span className="muted">City</span>
          <select className="wf-select" value={where} onChange={(e) => setWhere(e.target.value)} data-testid="wf-store-city" aria-label="City">
            {[...CITIES]
              .sort((a, b) => b.pop - a.pop)
              .map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} · {c.pop >= 1.2 ? "big" : c.pop >= 0.95 ? "average" : "small"} · {short(sim.storeCost(kind, c.name))}
                </option>
              ))}
          </select>
        </label>
        <div className="wf-between" style={{ marginTop: 10 }}>
          <span className="dim" style={{ fontSize: 12 }}>
            {city(where).transit} min by road · rent from {money(Math.round(30 * city(where).pop))}/h
          </span>
          <button className="wf-btn small primary" disabled={!open.includes(kind) || !sim.afford(s, cost) || s.stores.length >= MAX_STORES} onClick={() => g.openStore(kind, where)} data-testid="wf-store-open">
            Open · {money(cost)}
          </button>
        </div>
      </div>
    </>
  );
}

function ManagersTab({ g, s }: { g: Game; s: State }) {
  return (
    <>
      <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>
        Managers run part of the business for you, every ten minutes, for a salary. Let them go any time.
      </p>
      <div className="wf-list" style={{ marginTop: 10 }}>
        {MANAGERS.map((m) => {
          const on = !!s.managers[m.id];
          return (
            <div key={m.id} className="wf-item">
              <div className="wf-between">
                <h4>
                  {m.icon} {m.name}
                </h4>
                <button className={`wf-btn small ${on ? "on" : "primary"}`} aria-pressed={on} onClick={() => g.hire(m.id)} data-testid={`wf-hire-${m.id}`}>
                  {on ? "Hired ✓" : `Hire · $${m.wage}/h`}
                </button>
              </div>
              <p>{m.body}</p>
            </div>
          );
        })}
      </div>
      <p className="dim" style={{ fontSize: 12, margin: "8px 0 0" }}>
        Salaries: {money(sim.managerWages(s))} an hour · {money(s.ledger.managers)} paid so far.
      </p>
    </>
  );
}

/* ---------------------------------------------------------------- the map */

/** The map is a schematic of the north-east (100 × 72 map units): cities sit where they are, nudged apart where they'd touch. */
const MAP_H = 72;
type Side = "l" | "r" | "b";
const PLACES: Record<string, { x: number; y: number; side: Side }> = {
  Cleveland: { x: 10, y: 22, side: "b" },
  Buffalo: { x: 31, y: 9, side: "b" },
  Pittsburgh: { x: 21.5, y: 34, side: "b" },
  Albany: { x: 72.5, y: 10.5, side: "l" },
  Boston: { x: 94, y: 13.5, side: "l" },
  Providence: { x: 90, y: 20.5, side: "b" },
  Hartford: { x: 81, y: 20.5, side: "l" },
  "New York": { x: 72, y: 31.5, side: "r" },
  Newark: { x: 66, y: 27.5, side: "l" },
  Philadelphia: { x: 59.5, y: 41, side: "l" },
  Baltimore: { x: 50, y: 46, side: "r" },
  Washington: { x: 44, y: 52, side: "l" },
  Richmond: { x: 42.5, y: 65, side: "r" },
};
const HOME = { x: 66, y: 37 };
/** Where each supplier ships from. */
const SUPPLIER_CITY: Record<string, string> = {
  "Ironvale Steel": "Pittsburgh",
  "Voltcell Energy": "Buffalo",
  "Polymer & Co.": "Newark",
  Timberline: "Albany",
  Circuitra: "Boston",
  "Arctic Freight": "Baltimore",
  "Harvest Farms": "Richmond",
  "Cotton & Hide Co.": "Washington",
  "Alutech Metals": "Cleveland",
  "Chemix Labs": "Philadelphia",
  "Wholesale Direct": "Hartford",
};
const LAND = {
  ocean:
    "M100,4 L96.7,7.5 98.4,10.2 95.5,12.9 95.1,14 97.9,17.2 100,19.5 100,21.5 96.7,22.1 92.6,23.2 88.5,24.8 80.3,25.1 74.6,28 72.5,29.6 81.1,28.2 88.5,27.2 78.7,31.3 71.3,32.7 70.5,34.5 70.1,37.7 68,44.2 62.7,50.3 59.8,46.4 57.8,43.1 59,48.5 61.5,51.7 61.9,56.1 60.2,60.4 57.4,64.7 54.5,70.1 54.1,72 100,72Z",
  erie: "M0,21 L7.4,22.6 17.2,17.8 23,15.1 30.3,8.1 27.9,7 19.7,10.6 9.8,10.8 2.5,16.2 0,17.2Z",
  ontario: "M23,0 L23,3.6 29.5,4.1 41,3.6 50,1.6 52.5,0Z",
  bay: "M54.5,72 L55.2,66 56.5,60 56.2,55 55,50 53.3,43.7 52.6,45 52.5,49 52,54 51,60 50,66 51.5,72Z",
};
/** Shipment colours (validated together on the map's land colour; the legend and the list below carry the same thing in words). */
const OUT = "#2a78d6";
const IN = "#eb6834";

interface Trip {
  key: string;
  dir: "out" | "in";
  from: { x: number; y: number };
  to: { x: number; y: number };
  p: number;
  what: string;
  place: string;
  eta: number;
  air?: boolean;
  store?: boolean;
}

function trips(s: State): Trip[] {
  const out: Trip[] = [];
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  for (const o of s.orders) {
    if (o.state !== "transit") continue;
    const to = PLACES[o.city];
    if (!to) continue;
    out.push({
      key: `o${o.id}`, dir: "out", from: HOME, to, p: clamp((s.time - o.departed) / Math.max(1, o.delivers - o.departed)), place: o.city, eta: o.delivers - s.time,
      what: `${o.lines.map((l) => `${l.n} × ${ITEMS[l.item].name}`).join(", ")} for ${o.store !== undefined ? "your store" : o.customer}`, store: o.store !== undefined,
    });
  }
  for (const po of s.pos) {
    if (po.done) continue;
    const t = s.trucks.find((x) => x.id === po.truck);
    if (!t || t.state !== "transit") continue;
    const where = SUPPLIER_CITY[po.supplier] ?? "Hartford";
    out.push({
      key: `p${po.id}`, dir: "in", from: PLACES[where], to: HOME, p: clamp((s.time - po.ordered) / Math.max(1, t.eta - po.ordered)), place: where, eta: t.eta - s.time,
      what: `${po.n} × ${ITEMS[po.item].name} from ${po.supplier}`, air: po.air,
    });
  }
  return out.sort((a, b) => a.eta - b.eta);
}

function MapTab({ g, s }: { g: Game; s: State }) {
  const [sel, setSel] = useState<string | null>(null);
  const list = trips(s);
  const nOut = list.filter((t) => t.dir === "out").length;
  const c = sel ? city(sel) : null;
  const stores = sel ? s.stores.filter((x) => x.city === sel) : [];
  const here = sel ? list.filter((t) => t.place === sel) : [];
  const sups = sel ? SUPPLIERS.filter((x) => SUPPLIER_CITY[x.name] === sel) : [];
  const tenders = sel ? s.tenders.filter((t) => t.state === "open" && t.city === sel) : [];
  const site = siteDef(s.site);
  return (
    <>
      <div className="wf-legend" aria-label="Map key">
        <span>
          <i className="ln" style={{ background: OUT }} /> To customers and stores ({nOut})
        </span>
        <span>
          <i className="ln" style={{ background: IN }} /> From suppliers ({list.length - nOut})
        </span>
        <span>
          <i className="ln dash" /> By air
        </span>
        <span>
          <i className="sq" /> Your store
        </span>
      </div>
      <div className="wf-map" data-testid="wf-map">
        <svg viewBox={`0 0 100 ${MAP_H}`} preserveAspectRatio="none" aria-hidden="true">
          <rect width="100" height={MAP_H} className="land" />
          <path d={LAND.ocean} className="water" />
          <path d={LAND.erie} className="water" />
          <path d={LAND.ontario} className="water" />
          <path d={LAND.bay} className="water" />
          {Object.entries(PLACES).map(([n, p]) => (
            <line key={n} x1={HOME.x} y1={HOME.y} x2={p.x} y2={p.y} className={`road ${n === sel ? "on" : ""}`} vectorEffect="non-scaling-stroke" />
          ))}
          {list.map((t) => (
            <line key={t.key} x1={t.from.x} y1={t.from.y} x2={t.to.x} y2={t.to.y} stroke={t.dir === "out" ? OUT : IN} strokeWidth="2" strokeDasharray={t.air ? "5 4" : undefined} strokeLinecap="round" opacity={0.55} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {list.map((t) => (
          <span
            key={t.key}
            className="wf-map-dot"
            style={{ left: `${t.from.x + (t.to.x - t.from.x) * t.p}%`, top: `${((t.from.y + (t.to.y - t.from.y) * t.p) / MAP_H) * 100}%`, background: t.dir === "out" ? OUT : IN }}
            aria-hidden="true"
          />
        ))}
        <span className="wf-map-home" style={{ left: `${HOME.x}%`, top: `${(HOME.y / MAP_H) * 100}%` }}>
          <i aria-hidden="true">🏭</i>
          <b>{site.code}</b>
        </span>
        {CITIES.map((cc) => {
          const p = PLACES[cc.name];
          if (!p) return null;
          const has = s.stores.some((x) => x.city === cc.name);
          return (
            <button
              key={cc.name}
              className={`wf-map-city ${p.side} ${has ? "store" : ""} ${sel === cc.name ? "on" : ""}`}
              style={{ left: `${p.x}%`, top: `${(p.y / MAP_H) * 100}%` }}
              onClick={() => setSel(sel === cc.name ? null : cc.name)}
              aria-pressed={sel === cc.name}
              title={`${cc.name}: ${cc.transit} min by road${has ? ", your store" : ""}`}
              data-testid={`wf-city-${cc.name.replace(/ /g, "-").toLowerCase()}`}
            >
              <i style={{ width: 7 + cc.pop * 5, height: 7 + cc.pop * 5 }} />
              <span>{cc.name}</span>
            </button>
          );
        })}
      </div>
      {c && sel ? (
        <div className="wf-item" style={{ marginTop: 10 }} data-testid="wf-city-card">
          <div className="wf-between">
            <h4>📍 {c.name}</h4>
            <span className="wf-pill grey">{c.pop >= 1.2 ? "Big city" : c.pop >= 0.95 ? "Average city" : "Small city"}</span>
          </div>
          <p>
            {c.transit} min by road · store rent from {money(Math.round(30 * c.pop))}/h · {Math.round(c.pop * 100)}% of the usual shoppers
            {sups.length ? ` · ${sups.map((x) => x.name).join(", ")} ship${sups.length === 1 ? "s" : ""} from here` : ""}
          </p>
          {stores.map((st) => (
            <div key={st.id} className="wf-between" style={{ fontSize: 13, marginTop: 6 }}>
              <span>
                {STORES[st.kind].icon} {st.name}
              </span>
              <b className="num wf-up">{money(st.today)} today</b>
            </div>
          ))}
          {(here.length > 0 || tenders.length > 0) && (
            <small className="dim" style={{ display: "block", marginTop: 6 }}>
              {here.length ? `${here.length} shipment${here.length === 1 ? "" : "s"} on the road` : ""}
              {here.length && tenders.length ? " · " : ""}
              {tenders.length ? `${tenders.length} tender${tenders.length === 1 ? "" : "s"} open` : ""}
            </small>
          )}
          <div className="wf-seg" style={{ marginTop: 10 }}>
            <button className="wf-btn small primary" onClick={() => g.openCompany("stores", c.name)} data-testid="wf-city-store">
              {stores.length ? "🏪 Manage stores" : "🏪 Open a store here"}
            </button>
            {tenders.length > 0 && (
              <button className="wf-btn small" onClick={() => g.openCompany("market")}>
                📑 Tenders
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="dim" style={{ fontSize: 12, margin: "8px 0 0" }}>
          Tap a city for its shoppers, road time and your stores there. Dots are shipments on the road now.
        </p>
      )}
      <div className="wf-section">On the road</div>
      <div className="wf-list" data-testid="wf-road">
        {list.slice(0, 14).map((t) => (
          <div key={t.key} className="wf-trow" style={{ gridTemplateColumns: "auto 1fr auto" }}>
            <i className="wf-dir" style={{ "--c": t.dir === "out" ? OUT : IN } as React.CSSProperties} role="img" aria-label={t.dir === "out" ? "Outbound" : "Inbound"}>
              {t.air ? "✈" : t.dir === "out" ? "→" : "←"}
            </i>
            <span style={{ minWidth: 0 }}>
              {t.dir === "out" ? `To ${t.place}` : `From ${t.place}`}
              <span className="sub">{t.what}</span>
            </span>
            <b className="num" style={{ fontSize: 12.5 }}>
              {t.eta > 0 ? mins(t.eta) : "Arriving"}
            </b>
          </div>
        ))}
        {list.length > 14 && <small className="dim">and {list.length - 14} more</small>}
        {!list.length && <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>Nothing on the road right now.</p>}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- the market */

function TenderCard({ g, s, t }: { g: Game; s: State; t: sim.Tender }) {
  const [bid, setBid] = useState(t.bid ?? 1);
  const intel = sim.up(s, "intel");
  const chance = sim.winChance(s, bid);
  const per = Math.round(t.list * bid);
  const total = per * t.n * t.count;
  const it = ITEMS[t.item];
  const step = (d: number) => setBid(Math.round(Math.max(BID_RANGE[0], Math.min(BID_RANGE[1], bid + d)) * 100) / 100);
  const odds = chance >= 0.7 ? ["Keen: very likely to win", "good"] : chance >= 0.35 ? ["Fair: a good chance", ""] : chance > 0.05 ? ["Dear: a long shot", "warn"] : ["Too dear to win", "bad"];
  return (
    <div className="wf-item" data-testid="wf-tender">
      <div className="wf-between">
        <h4>
          {it.icon} {t.customer}
        </h4>
        <span className="wf-pill warn">Closes in {mins(t.closes - s.time)}</span>
      </div>
      <p>
        {t.count} shipments of {t.n} × {it.name.toLowerCase()} to {t.city}, every {t.every} h. List {money(t.list)} a pallet; a 15% bonus if every shipment is on time.
      </p>
      <div className="wf-between" style={{ marginTop: 8, flexWrap: "wrap", gap: 8 }}>
        <div className="wf-stepper" aria-label="Your bid">
          <button className="wf-btn icon small" onClick={() => step(-0.01)} aria-label="Bid lower" data-testid="wf-bid-down">
            −
          </button>
          <output className="num" style={{ minWidth: 92 }} data-testid="wf-bid">
            {Math.round(bid * 100)}% of list
          </output>
          <button className="wf-btn icon small" onClick={() => step(0.01)} aria-label="Bid higher">
            +
          </button>
        </div>
        <span className={`wf-pill ${odds[1]}`}>
          {odds[0]}
          {intel ? ` (${Math.round(chance * 100)}%)` : ""}
        </span>
      </div>
      <small className="dim" style={{ display: "block", marginTop: 6 }}>
        {money(per)} a pallet · {money(total)} for the run
        {intel && s.rivals.some((r) => r.last !== undefined) ? ` · last time rivals bid ${s.rivals.filter((r) => r.last !== undefined).map((r) => `${r.name.split(" ")[0]} ${Math.round(r.last! * 100)}%`).join(", ")}` : ""}
      </small>
      <div className="wf-seg" style={{ marginTop: 10 }}>
        <button className="wf-btn small primary" onClick={() => g.bidTender(t.id, bid)} data-testid="wf-bid-place">
          {t.bid === undefined ? "Place bid" : t.bid === bid ? `Bid in ✓ ${Math.round(t.bid * 100)}%` : "Change bid"}
        </button>
        {t.bid !== undefined && (
          <button className="wf-btn small" onClick={() => g.bidTender(t.id, 0)}>
            Withdraw
          </button>
        )}
      </div>
    </div>
  );
}

function MarketTab({ g, s }: { g: Game; s: State }) {
  const open = s.tenders.filter((t) => t.state === "open");
  const shut = s.tenders.filter((t) => t.state !== "open").slice(-6).reverse();
  const table = [{ name: "You", color: "#1b2236", won: s.stats.tendersWon, you: true }, ...s.rivals.map((r) => ({ name: r.name, color: RIVALS.find((x) => x.name === r.name)?.color ?? "#8a93a8", won: r.won, you: false }))].sort((a, b) => b.won - a.won);
  const live = sim.activeCampaigns(s);
  const hot = s.event ? EVENTS.find((x) => x.kind === s.event!.kind) : undefined;
  return (
    <>
      <div className="wf-kv" style={{ marginTop: 10 }}>
        <div>
          <small>Tenders won</small>
          <b className="num">{s.stats.tendersWon}</b>
        </div>
        <div>
          <small>Reputation</small>
          <b className="num">{Math.round(s.rep)}/100</b>
        </div>
        <div>
          <small>Ads running</small>
          <b className="num">{live.length ? live.map((i) => INDUSTRIES.find((x) => x.id === i)!.icon).join(" ") : "None"}</b>
        </div>
        <div>
          <small>The news</small>
          <b style={{ fontSize: 12.5 }}>{hot ? `${hot.icon} ${hot.name}` : "A quiet market"}</b>
        </div>
      </div>
      <div className="wf-section">Tenders</div>
      <p className="muted" style={{ fontSize: 12.5, margin: "0 0 8px" }}>
        Big customers put runs of shipments out to tender. You and three rivals bid a price; the keenest wins, and a good reputation counts for a few percent. Win, and it&apos;s a contract at your price.
      </p>
      <div className="wf-list">
        {open.map((t) => (
          <TenderCard key={t.id} g={g} s={s} t={t} />
        ))}
        {!open.length && <p className="dim" style={{ fontSize: 12.5, margin: 0 }} data-testid="wf-no-tenders">No tenders open: one comes up every few hours from day two.</p>}
      </div>
      {shut.length > 0 && (
        <>
          <div className="wf-section">Results</div>
          <div className="wf-list">
            {shut.map((t) => (
              <div key={t.id} className="wf-trow" style={{ gridTemplateColumns: "auto 1fr auto" }}>
                <b aria-hidden="true">{ITEMS[t.item].icon}</b>
                <span style={{ minWidth: 0 }}>
                  {t.customer}
                  <span className="sub">
                    {t.winner === "You" ? `You won at ${Math.round((t.winBid ?? 1) * 100)}%` : `${t.winner} won${sim.up(s, "intel") && t.winBid ? ` at ${Math.round(t.winBid * 100)}%` : ""}`}
                    {t.bid !== undefined && t.winner !== "You" ? ` · you bid ${Math.round(t.bid * 100)}%` : ""}
                  </span>
                </span>
                <span className={`wf-pill ${t.state === "won" ? "good" : "grey"}`}>{t.state === "won" ? "Won" : "Lost"}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="wf-section">The league · tenders won</div>
      <div className="wf-list" data-testid="wf-league">
        {table.map((r, i) => (
          <div key={r.name} className="wf-trow" style={{ gridTemplateColumns: "auto auto 1fr auto" }}>
            <b className="num dim">{i + 1}</b>
            <i className="wf-swatch" style={{ background: r.color }} aria-hidden="true" />
            <span>{r.you ? <b>You</b> : r.name}</span>
            <b className="num">{r.won}</b>
          </div>
        ))}
      </div>
      <div className="wf-section">Ad campaigns</div>
      <p className="muted" style={{ fontSize: 12.5, margin: "0 0 8px" }}>
        {money(CAMPAIGN.cost)} for {CAMPAIGN.hours} hours: a quarter more orders come in, and most of the offers are for that trade&apos;s goods.
      </p>
      <div className="wf-list">
        {INDUSTRIES.filter((i) => sim.licensed(s, i.id)).map((ind) => {
          const until = s.campaigns[ind.id as IndustryId] ?? 0;
          const on = until > s.time;
          return (
            <div key={ind.id} className="wf-trow" style={{ gridTemplateColumns: "auto 1fr auto" }}>
              <b aria-hidden="true">{ind.icon}</b>
              <span>
                {ind.name}
                <span className="sub">{on ? `On air for another ${mins(until - s.time)}` : ind.goods.slice(0, 4).map((x) => ITEMS[x].name).join(", ")}</span>
              </span>
              {on ? (
                <span className="wf-pill good">Running</span>
              ) : (
                <button className="wf-btn small primary" disabled={!sim.afford(s, CAMPAIGN.cost)} onClick={() => g.runCampaign(ind.id)} data-testid={`wf-campaign-${ind.id}`}>
                  Run · {short(CAMPAIGN.cost)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ====================================================================== the bank */

/** Cash by the hour: one line, a zero line when it dips below, and a readout under your finger. */
function CashChart({ s }: { s: State }) {
  const data = [...s.cashLog, Math.round(s.cash)];
  const [at, setAt] = useState<number | null>(null);
  const hourNow = Math.floor(s.time / 3600);
  if (data.length < 2) return <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>The chart fills in hour by hour.</p>;
  const lo = Math.min(0, ...data);
  const hi = Math.max(1, ...data);
  const W = 300;
  const H = 100;
  const x = (i: number) => (i / (data.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const line = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const label = (i: number) => {
    if (i === data.length - 1) return "Now";
    const h = hourNow - (data.length - 2 - i);
    return `Day ${Math.floor(h / 24) + 1} ${String(h % 24).padStart(2, "0")}:00`;
  };
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const u = (e.clientX - r.left - 8) / Math.max(1, r.width - 16);
    setAt(Math.max(0, Math.min(data.length - 1, Math.round(u * (data.length - 1)))));
  };
  const i = at ?? data.length - 1;
  return (
    <div className="wf-chart" onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setAt(null)} role="img" aria-label={`Cash over the last ${data.length - 1} hours, from ${money(data[0])} to ${money(data[data.length - 1])}`} data-testid="wf-cash-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={`${line}L${W},${y(lo)}L0,${y(lo)}Z`} fill="rgba(47,111,228,.12)" />
        {lo < 0 && <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="#8a93a8" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
        <path d={line} fill="none" stroke="#2f6fe4" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <line x1={x(i)} x2={x(i)} y1="0" y2={H} stroke="rgba(27,34,54,.25)" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="dot" style={{ left: `calc(8px + (100% - 16px) * ${x(i) / W})`, top: `calc(8px + (100% - 26px) * ${y(data[i]) / H})` }} />
      <span className="lab hi num">{short(hi)}</span>
      <span className="lab lo num">{short(lo)}</span>
      <span className="readout num">
        <b className={data[i] < 0 ? "wf-down" : ""}>{money(data[i])}</b> <span className="dim">{label(i)}</span>
      </span>
    </div>
  );
}

function BankSheet({ g, s }: { g: Game; s: State }) {
  const limit = sim.creditLimit(s);
  const rate = sim.loanRate(s);
  const t = s.today;
  const profit = t.revenue - t.costs;
  const trend = sim.cashTrend(s);
  const part = Math.min(10_000, s.loan);
  return (
    <>
      <div className="wf-bankhead">
        <div className="cash">
          <small>Cash</small>
          <b className={`num ${s.cash < 0 ? "wf-down" : ""}`} data-testid="wf-bank-cash">
            {money(s.cash)}
          </b>
          <span className={`num ${trend > 0 ? "wf-up" : trend < 0 ? "wf-down" : "dim"}`} style={{ fontSize: 12.5, fontWeight: 700 }}>
            {trend > 0 ? "▲ +" : trend < 0 ? "▼ " : ""}
            {money(trend)} this hour
          </span>
        </div>
        <div>
          <small>Net worth</small>
          <b className="num">{money(sim.worth(s))}</b>
        </div>
        <div>
          <small>Loan</small>
          <b className={`num ${s.loan ? "wf-down" : ""}`} data-testid="wf-loan">
            {money(s.loan)}
          </b>
        </div>
      </div>
      {s.cash < 0 && (
        <p className="wf-pill bad" style={{ marginTop: 10, height: "auto", padding: "6px 10px", whiteSpace: "normal" }}>
          You&apos;re overdrawn. Below −$25,000 the bank calls it in and the business goes bankrupt: borrow, or sell something.
        </p>
      )}
      <div className="wf-section">Cash by the hour</div>
      <CashChart s={s} />
      <div className="wf-section">Today so far</div>
      <div className="wf-kv" style={{ marginTop: 0, gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div>
          <small>Money in</small>
          <b className="num wf-up">{money(t.revenue)}</b>
        </div>
        <div>
          <small>Money out</small>
          <b className="num wf-down">{money(-t.costs)}</b>
        </div>
        <div>
          <small>Profit</small>
          <b className={`num ${profit < 0 ? "wf-down" : "wf-up"}`}>{money(profit)}</b>
        </div>
      </div>
      <div className="wf-section">Borrow</div>
      <p className="dim" style={{ fontSize: 12, margin: "0 0 8px" }}>
        The bank lends up to {sim.up(s, "bank") ? "three quarters" : "half"} of what the business is worth: {money(limit)} more right now. Interest is {(rate * 100).toFixed(1)}% a day, taken every hour
        {s.loan ? ` (about ${money(s.loan * rate)} a day on what you owe)` : ""}.
      </p>
      <div className="wf-seg">
        {[10_000, 25_000, 50_000].map((n) => (
          <button key={n} className="wf-btn small" disabled={n > limit} onClick={() => g.borrow(n)} data-testid={`wf-borrow-${n}`}>
            + {short(n)}
          </button>
        ))}
      </div>
      {s.loan > 0 && (
        <>
          <div className="wf-section">Pay back</div>
          <div className="wf-seg">
            <button className="wf-btn small" disabled={s.cash < part} onClick={() => g.repay(part)} data-testid="wf-repay">
              Pay {short(part)}
            </button>
            <button className="wf-btn small primary" disabled={s.cash <= 0} onClick={() => g.repay("all")} data-testid="wf-repay-all">
              {s.cash >= s.loan ? `Pay it all · ${money(s.loan)}` : `Pay what you can · ${money(Math.floor(s.cash))}`}
            </button>
          </div>
        </>
      )}
      <div className="wf-section">Running costs</div>
      <p className="dim" style={{ fontSize: 12, margin: 0 }}>
        Rent {money(siteDef(s.site).rent)}/h · {s.forks.length} forklift drivers {money(s.forks.length * (sim.up(s, "agv") ? 16 : 40))}/h
        {s.ownTrucks.length ? ` · ${s.ownTrucks.length} truck drivers ${money(s.ownTrucks.length * OWN_TRUCK_WAGE)}/h` : ""}
        {sim.managerWages(s) ? ` · managers ${money(sim.managerWages(s))}/h` : ""}
        {s.stores.length ? ` · ${s.stores.length} store${s.stores.length > 1 ? "s" : ""} ${money(s.stores.reduce((a, x) => a + sim.storeRent(x), 0))}/h rent plus staff` : ""}. The Company panel has the full books.
      </p>
    </>
  );
}

/* ====================================================================== the day's report and tips */

function DayReport({ g, s }: { g: Game; s: State }) {
  const r = s.report!;
  return (
    <div className="wf-report wf-glass wf-card" role="dialog" aria-label={`Day ${r.day} report`} data-testid="wf-report">
      <div className="wf-eyebrow">End of day {r.day}</div>
      <h3>{r.profit >= 0 ? "A profitable day" : "A loss-making day"}</h3>
      <div className={`big num ${r.profit < 0 ? "wf-down" : "wf-up"}`}>
        {r.profit >= 0 ? "+" : ""}
        {money(r.profit)}
      </div>
      <div className="wf-kv" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div>
          <small>Money in</small>
          <b className="num">{short(r.revenue)}</b>
        </div>
        <div>
          <small>Money out</small>
          <b className="num">{short(r.costs)}</b>
        </div>
        <div>
          <small>Cash now</small>
          <b className="num">{short(s.cash)}</b>
        </div>
        <div>
          <small>Delivered</small>
          <b className="num">{r.orders}</b>
        </div>
        <div>
          <small>On time</small>
          <b className="num">
            {r.onTime}/{r.onTime + r.late}
          </b>
        </div>
        <div>
          <small>Unloaded</small>
          <b className="num">{r.unloads}</b>
        </div>
        <div>
          <small>Made</small>
          <b className="num">{r.made}</b>
        </div>
        <div>
          <small>Moves</small>
          <b className="num">{r.moves}</b>
        </div>
        <div>
          <small>Reputation</small>
          <b className="num">{Math.round(s.rep)}/100</b>
        </div>
      </div>
      {s.missions.length > 0 && (
        <>
          <div className="wf-section">Today&apos;s missions</div>
          <div className="wf-list" style={{ gap: 4 }}>
            {s.missions.map((m, i) => (
              <div key={i} className="wf-between" style={{ fontSize: 12.5 }}>
                <span>
                  {m.icon} {m.name}
                </span>
                <b className="num">{short(m.reward)}</b>
              </div>
            ))}
          </div>
        </>
      )}
      <button className="wf-btn primary wide" style={{ marginTop: 12 }} onClick={() => g.dismissReport()} data-testid="wf-report-close">
        On to day {r.day + 1}
      </button>
    </div>
  );
}

function TipCard({ g, s }: { g: Game; s: State }) {
  const t = TIPS[s.tip];
  return (
    <aside className="wf-tip wf-glass wf-card" aria-label="Tip" data-testid="wf-tip">
      <span className="ic" aria-hidden="true">
        {t.icon}
      </span>
      <p>{t.text}</p>
      <div className="wf-between">
        <small className="dim">
          Tip {s.tip + 1} of {TIPS.length}
        </small>
        <div className="wf-seg">
          <button className="wf-btn small" onClick={() => g.hideTips()}>
            Hide tips
          </button>
          <button className="wf-btn small primary" onClick={() => g.nextTip()} data-testid="wf-tip-next">
            {s.tip + 1 < TIPS.length ? "Next" : "Done"}
          </button>
        </div>
      </div>
    </aside>
  );
}
