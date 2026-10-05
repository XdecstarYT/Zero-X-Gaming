import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { ADMINS, CONDITIONS, FLOORS, GRANT_ORDER, GRANTS, OBJECTS, ROLES, ROOMS, STEP_ROOM, type FloorId, type ObjectCat, type ObjectId, type Role, type RoomId } from "../data";
import { OBJECT_LIST, STAFF_ROLES, type Game } from "../game";
import type { HudState, Tool } from "../store";

const Ctx = createContext<Game | null>(null);
const useGame = () => useContext(Ctx)!;
function useHud<T>(sel: (s: HudState) => T): T {
  return useStore(useGame().store, sel);
}
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
function clock(minutes: number) {
  const day = Math.floor(minutes / 1440) + 1;
  const m = Math.floor(minutes % 1440);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return { day, time: `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}` };
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Reputation ${value.toFixed(1)} of 5`} data-testid="ll-rep">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <svg key={i} width="16" height="16" viewBox="0 0 24 24" aria-hidden>
            <defs>
              <linearGradient id={`ll-s${i}`}>
                <stop offset={fill} stopColor="#fbbf24" />
                <stop offset={fill} stopColor="rgba(255,255,255,.25)" />
              </linearGradient>
            </defs>
            <path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" fill={`url(#ll-s${i})`} />
          </svg>
        );
      })}
    </span>
  );
}

// ---------------------------------------------------------------- menu

function Menu() {
  const g = useGame();
  const hasSave = useHud((s) => s.hasSave);
  const [help, setHelp] = useState(false);
  return (
    <div className="absolute inset-0 flex items-center justify-start p-4 sm:p-8" data-testid="ll-menu">
      <div className="ll-glass ll-in flex w-full max-w-sm flex-col gap-2 p-5">
        <div className="mb-2 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: "linear-gradient(140deg,#5eead4,#0f766e)" }} aria-hidden>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#04201c" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12h4l2-5 4 10 2-5h8" />
            </svg>
          </span>
          <div>
            <h1 className="ll-h text-[1.9em] leading-none">Lifeline</h1>
            <p className="text-[.85em] opacity-75">Build a hospital. Save lives.</p>
          </div>
        </div>
        {hasSave && (
          <button type="button" className="ll-btn ll-on min-h-[52px] font-black" onClick={() => (g.sound.unlock(), g.continueGame())} data-testid="ll-continue">
            Continue
          </button>
        )}
        <button type="button" className={`ll-btn min-h-[52px] ${hasSave ? "" : "ll-on"}`} onClick={() => (g.sound.unlock(), g.newGame("empty"))} data-testid="ll-new">
          New hospital (empty plot)
        </button>
        <button type="button" className="ll-btn min-h-[52px]" onClick={() => (g.sound.unlock(), g.newGame("starter"))} data-testid="ll-starter">
          Start with a small hospital
        </button>
        <button type="button" className="ll-btn" onClick={() => setHelp((h) => !h)} aria-expanded={help}>
          How to play
        </button>
        {help && <HelpText />}
      </div>
    </div>
  );
}

function HelpText() {
  return (
    <ol className="ll-scroll flex max-h-[42vh] list-decimal flex-col gap-1.5 ps-5 text-[.88em] opacity-90">
      <li>Lay a <b>foundation</b> (it gets walls round the edge), then add <b>doors</b>. Workmen build everything from materials the truck drops off, so paint a <b>Deliveries</b> zone by the road.</li>
      <li>Paint <b>rooms</b> and furnish them: a reception (desk + chair), a waiting room (seats) and a consulting room (desk, chair, couch) open the doors.</li>
      <li>Hire a <b>receptionist</b> and a <b>doctor</b>. Patients check in, wait, get diagnosed and treated, pay and go home.</li>
      <li>Some need more: a <b>pharmacy</b>, a <b>ward</b>, <b>radiology</b> (needs a generator), an <b>emergency room</b> for ambulances, an <b>operating theatre</b> (needs a chief of medicine).</li>
      <li>Keep staff rested (a <b>staff room</b>), floors clean (<b>janitors</b>) or infections spread, and the books balanced. Grants pay for milestones.</li>
      <li>Lives saved is your score: bank it from Reports whenever you like.</li>
    </ol>
  );
}

// ---------------------------------------------------------------- top bar

function TopBar() {
  const g = useGame();
  const cash = useHud((s) => s.cash);
  const minutes = useHud((s) => s.minutes);
  const speed = useHud((s) => s.speed);
  const rep = useHud((s) => s.rep);
  const treated = useHud((s) => s.stats?.treated ?? 0);
  const patients = useHud((s) => s.patients);
  const events = useHud((s) => s.events);
  const panel = useHud((s) => s.panel);
  const { day, time } = clock(minutes);
  return (
    <div className="pointer-events-none flex flex-wrap items-start justify-between gap-2">
      <div className="pointer-events-auto flex flex-wrap items-center gap-2">
        <div className="ll-glass flex items-center gap-1 p-1">
          <button type="button" className="ll-btn px-0" onClick={() => g.toMenu()} aria-label="Save and go to the menu" data-testid="ll-menu-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <span className="px-2 font-black tabular-nums" data-testid="ll-clock">
            Day {day} · {time}
          </span>
          {[0, 1, 2, 4].map((v) => (
            <button key={v} type="button" aria-pressed={speed === v} className="ll-btn px-0 text-[.85em] font-black" onClick={() => g.setSpeed(v)} aria-label={v ? `Speed ${v}×` : "Pause"} data-testid={`ll-speed-${v}`}>
              {v ? `${v}×` : "❚❚"}
            </button>
          ))}
        </div>
        {events.map((e) => (
          <span key={e} className="ll-pill" style={{ background: "#fbbf24", color: "#2a1d00" }}>
            {e}
          </span>
        ))}
      </div>
      <div className="pointer-events-auto ms-auto flex flex-wrap items-center justify-end gap-2">
        <span className="ll-glass flex min-h-[44px] items-center gap-2 px-4 font-black tabular-nums" style={{ color: cash < 0 ? "var(--ll-bad)" : undefined }} data-testid="ll-cash">
          {money(cash)}
        </span>
        <span className="ll-glass flex min-h-[44px] items-center gap-2 px-3">
          <Stars value={rep} />
        </span>
        <span className="ll-glass flex min-h-[44px] items-center gap-2 px-3 font-black" title="Lives saved (your score)" data-testid="ll-score">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#fb7185" aria-hidden>
            <path d="M12 21s-7.5-4.6-9.5-9.2C1 8.3 3.3 5 6.6 5c2 0 3.6 1.1 4.4 2.6C11.8 6.1 13.4 5 15.4 5c3.3 0 5.6 3.3 4.1 6.8C19.5 16.4 12 21 12 21z" />
          </svg>
          <span className="tabular-nums">{treated}</span>
          <span className="text-[.75em] opacity-70">· {patients} in</span>
        </span>
        {(["staff", "grants", "reports", "help"] as const).map((p) => (
          <button key={p} type="button" aria-pressed={panel === p} className="ll-btn" onClick={() => g.openPanel(p)} data-testid={`ll-panel-${p}`}>
            {p === "staff" ? "Staff" : p === "grants" ? "Grants" : p === "reports" ? "Reports" : "?"}
          </button>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------- build bar

function Toolbar() {
  const g = useGame();
  const cat = useHud((s) => s.category);
  const tool = useHud((s) => s.tool);
  const cutaway = useHud((s) => s.cutaway);
  const rooms = useHud((s) => s.rooms);
  const items: { id: NonNullable<HudState["category"]>; label: string }[] = [
    { id: "build", label: "Build" },
    { id: "rooms", label: "Rooms" },
    { id: "objects", label: "Objects" },
    { id: "staff", label: "Hire" },
  ];
  return (
    <nav className="ll-glass ll-scroll pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto p-1" aria-label="Build" data-testid="ll-toolbar">
      {items.map((i) => (
        <button key={i.id} type="button" aria-pressed={cat === i.id} className="ll-btn shrink-0" onClick={() => g.openCategory(i.id)} data-testid={`ll-cat-${i.id}`}>
          {i.label}
        </button>
      ))}
      <button type="button" aria-pressed={tool?.kind === "demolish"} className="ll-btn ll-danger shrink-0" onClick={() => g.setTool(tool?.kind === "demolish" ? null : { kind: "demolish" })} data-testid="ll-demolish">
        Demolish
      </button>
      <span className="mx-1 h-8 w-px shrink-0 bg-white/15" />
      <button type="button" aria-pressed={!cutaway} className="ll-btn shrink-0" onClick={() => g.toggleCutaway()} title="Full-height walls (C)">
        Walls
      </button>
      <button type="button" aria-pressed={rooms} className="ll-btn shrink-0" onClick={() => g.toggleRooms()}>
        Zones
      </button>
    </nav>
  );
}

function ToolCard({ on, onClick, title, sub, swatch, testId, disabled }: { on: boolean; onClick: () => void; title: string; sub?: string; swatch?: string; testId?: string; disabled?: boolean }) {
  return (
    <button type="button" aria-pressed={on} className="ll-card min-w-[150px] max-w-[260px] shrink-0" style={{ width: "auto" }} onClick={onClick} data-testid={testId} disabled={disabled}>
      {swatch && <span className="h-6 w-6 shrink-0 rounded-lg border border-white/20" style={{ background: swatch }} aria-hidden />}
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-bold">{title}</span>
        {sub && <span className="truncate text-[.75em] opacity-70">{sub}</span>}
      </span>
    </button>
  );
}

function same(a: Tool | null, b: Tool) {
  return !!a && JSON.stringify({ ...a, rot: 0 }) === JSON.stringify({ ...b, rot: 0 });
}

function Tray() {
  const g = useGame();
  const cat = useHud((s) => s.category);
  const tool = useHud((s) => s.tool);
  const unlocked = useHud((s) => s.unlocked);
  const [floor, setFloor] = useState<FloorId>("lino");
  const [objCat, setObjCat] = useState<ObjectCat>("medical");
  if (!cat) return null;
  const pick = (t: Tool) => g.setTool(same(tool, t) ? null : t);
  return (
    <div className="ll-glass ll-in pointer-events-auto flex max-w-full flex-col gap-2 p-2" data-testid={`ll-tray-${cat}`}>
      {cat === "build" && (
        <>
          <div className="ll-scroll flex gap-1 overflow-x-auto">
            <ToolCard on={tool?.kind === "foundation"} onClick={() => pick({ kind: "foundation", floor })} title="Foundation" sub="Floor + walls round it" swatch={FLOORS[floor].color} testId="ll-t-foundation" />
            <ToolCard on={tool?.kind === "wall"} onClick={() => pick({ kind: "wall" })} title="Wall" sub="$18 a metre" swatch="#f1efe9" testId="ll-t-wall" />
            <ToolCard on={tool?.kind === "door"} onClick={() => pick({ kind: "door" })} title="Door" sub="$80, in a wall" swatch="#5fb3c9" testId="ll-t-door" />
            <ToolCard on={tool?.kind === "floor"} onClick={() => pick({ kind: "floor", floor })} title="Floor" sub={`${FLOORS[floor].name} · $${FLOORS[floor].cost}/m²`} swatch={FLOORS[floor].color} testId="ll-t-floor" />
          </div>
          <div className="ll-scroll flex gap-1 overflow-x-auto" role="radiogroup" aria-label="Floor type">
            {(Object.keys(FLOORS) as FloorId[]).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={floor === f}
                className={`ll-btn shrink-0 text-[.82em] ${floor === f ? "ll-on" : ""}`}
                onClick={() => {
                  setFloor(f);
                  if (tool?.kind === "foundation" || tool?.kind === "floor") g.setTool({ ...tool, floor: f });
                }}
              >
                <span className="h-3.5 w-3.5 rounded" style={{ background: FLOORS[f].color }} aria-hidden />
                {FLOORS[f].name}
              </button>
            ))}
          </div>
        </>
      )}
      {cat === "rooms" && (
        <div className="ll-scroll flex gap-1 overflow-x-auto">
          {(Object.keys(ROOMS) as RoomId[]).map((r) => {
            const def = ROOMS[r];
            const locked = !unlocked[r];
            return (
              <ToolCard
                key={r}
                on={tool?.kind === "room" && tool.room === r}
                onClick={() => pick({ kind: "room", room: r })}
                title={def.name}
                sub={locked ? `Needs a ${ROLES[def.unlock!].name.toLowerCase()}` : `${def.min} m² · ${Object.keys(def.needs).map((k) => OBJECTS[k as ObjectId].name.toLowerCase()).join(", ") || "any space"}`}
                swatch={def.color}
                testId={`ll-r-${r}`}
              />
            );
          })}
          <ToolCard on={tool?.kind === "room" && tool.room === null} onClick={() => pick({ kind: "room", room: null })} title="Erase zones" swatch="#334155" testId="ll-r-erase" />
        </div>
      )}
      {cat === "objects" && (
        <>
          <div className="flex gap-1" role="tablist">
            {(["medical", "furniture", "facilities", "outdoor"] as ObjectCat[]).map((c) => (
              <button key={c} type="button" role="tab" aria-selected={objCat === c} className={`ll-btn text-[.82em] capitalize ${objCat === c ? "ll-on" : ""}`} onClick={() => setObjCat(c)} data-testid={`ll-oc-${c}`}>
                {c}
              </button>
            ))}
            {tool?.kind === "object" && (
              <button type="button" className="ll-btn ms-auto text-[.82em]" onClick={() => g.rotateTool()} data-testid="ll-rotate">
                Rotate (R)
              </button>
            )}
          </div>
          <div className="ll-scroll flex gap-1 overflow-x-auto">
            {OBJECT_LIST.filter((k) => OBJECTS[k].cat === objCat).map((k) => (
              <ToolCard
                key={k}
                on={tool?.kind === "object" && tool.obj === k}
                onClick={() => pick({ kind: "object", obj: k, rot: tool?.kind === "object" ? tool.rot : 0 })}
                title={OBJECTS[k].name}
                sub={`${money(OBJECTS[k].cost)}${OBJECTS[k].power ? ` · ${OBJECTS[k].power! > 0 ? `${OBJECTS[k].power}⚡` : `+${-OBJECTS[k].power!}⚡`}` : ""}`}
                testId={`ll-o-${k}`}
              />
            ))}
          </div>
        </>
      )}
      {cat === "staff" && (
        <div className="ll-scroll flex gap-1 overflow-x-auto">
          {STAFF_ROLES.map((r) => (
            <ToolCard key={r} on={false} onClick={() => g.hire(r)} title={`Hire ${ROLES[r].name.toLowerCase()}`} sub={unlocked[r] ? `${money(ROLES[r].wage)} a day` : `Needs a ${ROLES[ROLES[r].unlock!].name.toLowerCase()}`} swatch={ROLES[r].color} testId={`ll-hire-${r}`} disabled={!unlocked[r]} />
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ panels

function Panel({ title, children, testId }: { title: string; children: ReactNode; testId: string }) {
  const g = useGame();
  return (
    <section className="ll-glass ll-in pointer-events-auto absolute end-2 top-[calc(var(--ll-top,3.5rem)+.5rem)] flex max-h-[calc(100%-var(--ll-top,3.5rem)-6.5rem)] w-[min(94%,400px)] flex-col" aria-label={title} data-testid={testId}>
      <div className="flex items-center gap-2 p-3 pb-1">
        <h2 className="ll-h flex-1 text-[1.15em]">{title}</h2>
        <button type="button" className="ll-btn px-0" onClick={() => g.openPanel(null)} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="ll-scroll min-h-0 flex-1 p-3 pt-1">{children}</div>
    </section>
  );
}

function StaffPanel() {
  const g = useGame();
  const staff = useHud((s) => s.staff);
  const unlocked = useHud((s) => s.unlocked);
  const loan = useHud((s) => s.loan);
  return (
    <Panel title="Staff" testId="ll-staff">
      <h3 className="ll-label mb-1 opacity-70">Hire</h3>
      <div className="grid grid-cols-2 gap-1">
        {STAFF_ROLES.map((r) => (
          <button key={r} type="button" className="ll-card" onClick={() => g.hire(r)} disabled={!unlocked[r]} data-testid={`ll-hire2-${r}`}>
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: ROLES[r].color }} aria-hidden />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-bold">{ROLES[r].name}</span>
              <span className="text-[.75em] opacity-70">{unlocked[r] ? `${money(ROLES[r].wage)}/day` : "Locked"}</span>
            </span>
          </button>
        ))}
      </div>
      <h3 className="ll-label mb-1 mt-4 opacity-70">Bureaucracy</h3>
      <p className="mb-2 text-[.8em] opacity-70">Administrators each need an office (desk, chair, filing cabinet). Once at their desk, they unlock more.</p>
      <div className="flex flex-col gap-1">
        {ADMINS.map((r) => {
          const hired = staff.find((s) => s.role === r);
          return (
            <div key={r} className="ll-card cursor-default" data-testid={`ll-admin-${r}`}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-bold">
                  {ROLES[r].name} {hired && <span className="ll-pill" style={{ background: hired.onDuty ? "var(--ll-good)" : "var(--ll-warn)", color: "#111" }}>{hired.onDuty ? "At work" : "No office"}</span>}
                </span>
                <span className="text-[.75em] opacity-70">{ROLES[r].admin!.unlocks}</span>
              </span>
              {!hired && (
                <button type="button" className="ll-btn shrink-0 text-[.85em]" onClick={() => g.hire(r)} disabled={!unlocked[r]} data-testid={`ll-hire-admin-${r}`}>
                  {unlocked[r] ? money(ROLES[r].wage) : "Locked"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {staff.some((s) => s.role === "accountant" && s.onDuty) && (
        <button type="button" className="ll-btn mt-2 w-full" onClick={() => g.loan()} disabled={loan > 0}>
          {loan > 0 ? `Loan: ${money(loan)} left to repay` : "Take a $25,000 bank loan"}
        </button>
      )}
      <h3 className="ll-label mb-1 mt-4 opacity-70">On the payroll ({staff.length})</h3>
      <ul className="flex flex-col gap-1">
        {staff.map((s) => (
          <li key={s.id} className="flex items-center gap-2 rounded-xl bg-white/5 p-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: ROLES[s.role].color }} aria-hidden />
            <button type="button" className="min-w-0 flex-1 text-start" onClick={() => g.store.setState({ selected: { kind: "person", id: s.id } })}>
              <span className="block truncate font-semibold">{s.name}</span>
              <span className="block text-[.75em] opacity-70">
                {ROLES[s.role].name} · {s.onDuty ? "on duty" : s.state === "rest" ? "resting" : "between jobs"}
              </span>
            </button>
            <span className="ll-bar w-14" title={`Energy ${Math.round(s.energy)}%`}>
              <i style={{ width: `${s.energy}%`, background: s.energy < 20 ? "var(--ll-bad)" : "var(--ll-accent)" }} />
            </span>
            <button type="button" className="ll-btn ll-danger min-h-[34px] px-2 text-[.75em]" onClick={() => g.fire(s.id)} aria-label={`Fire ${s.name}`}>
              Fire
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function GrantsPanel() {
  const grants = useHud((s) => s.grants);
  return (
    <Panel title="Grants" testId="ll-grants">
      <p className="mb-2 text-[.82em] opacity-70">The health authority pays for milestones. Hire a hospital director to see more than the first two.</p>
      <ul className="flex flex-col gap-1">
        {GRANT_ORDER.map((id) => {
          const st = grants[id];
          const g = GRANTS[id];
          return (
            <li key={id} className="rounded-xl bg-white/5 p-2" style={{ opacity: st ? 1 : 0.5 }} data-testid={`ll-grant-${id}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{g.name}</span>
                <span className="ll-pill" style={{ background: st === "done" ? "var(--ll-good)" : st ? "rgba(255,255,255,.15)" : "transparent", color: st === "done" ? "#052e16" : undefined }}>
                  {st === "done" ? "Paid" : st ? money(g.reward) : "Locked"}
                </span>
              </div>
              <p className="text-[.8em] opacity-75">{g.desc}</p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function ReportsPanel() {
  const g = useGame();
  const stats = useHud((s) => s.stats);
  const hygiene = useHud((s) => s.hygiene);
  const power = useHud((s) => s.power);
  const rep = useHud((s) => s.rep);
  if (!stats) return null;
  const days = [...stats.history, { ...stats.today }].slice(-10);
  const nets = days.map((d) => d.income - d.expense);
  const max = Math.max(1000, ...nets.map(Math.abs));
  const row = (k: string, v: ReactNode) => (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="opacity-80">{k}</span>
      <span className="font-bold tabular-nums">{v}</span>
    </div>
  );
  return (
    <Panel title="Reports" testId="ll-reports">
      <figure className="m-0 mb-3">
        <figcaption className="ll-label mb-1 opacity-70">Balance by day</figcaption>
        <svg viewBox="0 0 300 90" className="h-[90px] w-full" role="img" aria-label={`Daily balance: ${nets.map((n) => money(n)).join(", ")}`}>
          <line x1="0" x2="300" y1="45" y2="45" stroke="rgba(255,255,255,.25)" />
          {nets.map((n, i) => {
            const w = 300 / Math.max(10, nets.length);
            const h = (Math.abs(n) / max) * 40;
            return (
              <rect key={i} x={i * w + 3} width={w - 6} y={n >= 0 ? 45 - h : 45} height={Math.max(1, h)} rx="3" fill={n >= 0 ? "#2dd4bf" : "#fb7185"}>
                <title>{`Day ${days[i].day}: ${money(n)}`}</title>
              </rect>
            );
          })}
        </svg>
      </figure>
      {row("Lives saved", stats.treated)}
      {row("Deaths", stats.deaths)}
      {row("Gave up and left", stats.left)}
      {row("Hospital infections", stats.infections)}
      {row("Operations", stats.ops)}
      {row("X-rays", stats.scans)}
      {row("Emergency cases", stats.er)}
      {row("Reputation", `${rep.toFixed(1)} / 5`)}
      {row("Hygiene", `${Math.round(hygiene * 100)}%`)}
      {row("Power", `${power.demand} / ${power.supply}`)}
      {row("Income (all time)", money(stats.income))}
      {row("Spending (all time)", money(stats.expense))}
      <button type="button" className="ll-btn ll-on mt-3 w-full min-h-[50px] font-black" onClick={() => g.bank()} data-testid="ll-bank">
        Bank {stats.treated} lives saved as my score
      </button>
    </Panel>
  );
}

function Notices() {
  const notices = useHud((s) => s.notices);
  const panel = useHud((s) => s.panel);
  const [open, setOpen] = useState(true);
  if (!notices.length || panel) return null;
  return (
    <section className="ll-glass pointer-events-auto absolute end-2 top-[calc(var(--ll-top,3.5rem)+.5rem)] w-[min(80%,320px)] p-2" aria-label="Alerts" data-testid="ll-notices">
      <button type="button" className="flex w-full items-center justify-between px-1 font-bold" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>Alerts ({notices.length})</span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <ul className="mt-1 flex flex-col gap-1 text-[.82em]">
          {notices.map((n, i) => (
            <li key={i} className="flex gap-2 rounded-lg bg-white/5 p-1.5">
              <span aria-hidden style={{ color: n.kind === "warn" ? "var(--ll-warn)" : "var(--ll-accent)" }}>
                {n.kind === "warn" ? "▲" : "●"}
              </span>
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Inspector() {
  const g = useGame();
  const sel = useHud((s) => s.selected);
  useHud((s) => s.minutes);
  if (!sel) return null;
  const s = g.sim;
  let body: ReactNode = null;
  if (sel.kind === "person") {
    const p = s.people.get(sel.id);
    if (!p) return null;
    if (p.kind === "patient") {
      const cond = CONDITIONS[p.cond!];
      body = (
        <>
          <p className="font-black">{p.name}</p>
          <p className="text-[.85em] opacity-80">
            {cond.name}
            {p.ambulance ? " · by ambulance" : ""}
          </p>
          <ol className="my-2 flex flex-wrap gap-1">
            {cond.path.map((st, i) => (
              <li key={i} className="ll-pill" style={{ background: i < p.step ? "var(--ll-good)" : i === p.step ? "var(--ll-accent)" : "rgba(255,255,255,.12)", color: i <= p.step ? "#052e16" : undefined }}>
                {ROOMS[STEP_ROOM[st]].name}
              </li>
            ))}
          </ol>
          <Meter label="Health" v={p.health} />
          <Meter label="Hunger" v={p.hunger} bad />
          <Meter label="Bladder" v={p.bladder} bad />
          <p className="mt-1 text-[.8em] opacity-70">Waiting {Math.round(p.waited)} min · {p.state === "inStep" ? "being treated" : p.state === "waitStep" ? "waiting" : p.state}</p>
        </>
      );
    } else {
      const room = p.room ? s.roomByKey(p.room) : null;
      body = (
        <>
          <p className="font-black">{p.name}</p>
          <p className="text-[.85em] opacity-80">
            {ROLES[p.role!].name}
            {room ? ` · ${ROOMS[room.type].name}` : ""}
          </p>
          <Meter label="Energy" v={p.energy} />
          <p className="mt-1 text-[.8em] opacity-70">{ROLES[p.role!].desc}</p>
          <button type="button" className="ll-btn ll-danger mt-2" onClick={() => g.fire(p.id)}>
            Fire
          </button>
        </>
      );
    }
  } else {
    const r = s.world.rooms.find((x) => x.id === sel.id);
    if (!r) return null;
    const def = ROOMS[r.type];
    body = (
      <>
        <p className="font-black">{def.name}</p>
        <p className="text-[.85em] opacity-80">{def.desc}</p>
        <p className="mt-1">
          <span className="ll-pill" style={{ background: r.valid ? "var(--ll-good)" : "var(--ll-warn)", color: "#111" }}>
            {r.valid ? (s.staffed(r) ? "Working" : "Needs staff") : "Not working yet"}
          </span>
        </p>
        {r.issues.length > 0 && (
          <ul className="mt-2 list-disc ps-5 text-[.85em]">
            {r.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
        {def.staff && <p className="mt-2 text-[.8em] opacity-70">Staffed by: {def.staff.map((x: Role) => ROLES[x].name.toLowerCase()).join(" and ")}</p>}
      </>
    );
  }
  return (
    <section className="ll-glass ll-in pointer-events-auto absolute start-2 top-[calc(var(--ll-top,3.5rem)+.5rem)] w-[min(80%,280px)] p-3" data-testid="ll-inspector">
      <button type="button" className="ll-btn absolute end-2 top-2 min-h-[32px] min-w-[32px] px-0" onClick={() => g.store.setState({ selected: null })} aria-label="Close">
        ✕
      </button>
      {body}
    </section>
  );
}

function Meter({ label, v, bad }: { label: string; v: number; bad?: boolean }) {
  const pct = Math.max(0, Math.min(100, v));
  const worse = bad ? pct > 70 : pct < 30;
  return (
    <div className="mt-1 flex items-center gap-2 text-[.82em]">
      <span className="w-[5em] opacity-80">{label}</span>
      <span className="ll-bar flex-1">
        <i style={{ width: `${pct}%`, background: worse ? "var(--ll-bad)" : "var(--ll-accent)" }} />
      </span>
      <span className="w-8 text-end tabular-nums">{Math.round(pct)}</span>
    </div>
  );
}

function Toasts() {
  const toasts = useHud((s) => s.toasts);
  return (
    <div className="pointer-events-none absolute bottom-[8.5rem] start-2 flex max-w-[min(90%,360px)] flex-col gap-1" aria-live="polite">
      {toasts.map((t) => (
        <p key={t.id} className="ll-glass ll-in px-3 py-2 text-[.86em] font-semibold" style={{ borderColor: t.kind === "good" ? "var(--ll-good)" : t.kind === "bad" ? "var(--ll-bad)" : undefined }}>
          {t.text}
        </p>
      ))}
    </div>
  );
}

function Cursor() {
  const c = useHud((s) => s.cursor);
  if (!c) return null;
  return (
    <div className="ll-glass pointer-events-none absolute whitespace-nowrap rounded-full px-3 py-1 text-[.82em] font-black" style={{ left: c.x + 16, top: c.y - 30, color: c.bad ? "var(--ll-bad)" : undefined }} data-testid="ll-cursor">
      {c.text}
    </div>
  );
}

function Hud() {
  const panel = useHud((s) => s.panel);
  const root = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const r = row.current;
    if (!r || !root.current) return;
    const ro = new ResizeObserver(() => root.current?.style.setProperty("--ll-top", `${r.offsetHeight + 8}px`));
    ro.observe(r);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={root} className="pointer-events-none absolute inset-0" data-testid="ll-hud">
      <div ref={row} className="pointer-events-none absolute inset-x-2 top-2">
        <TopBar />
      </div>
      <Notices />
      <Inspector />
      {panel === "staff" && <StaffPanel />}
      {panel === "grants" && <GrantsPanel />}
      {panel === "reports" && <ReportsPanel />}
      {panel === "help" && (
        <PanelHelp />
      )}
      <Toasts />
      <Cursor />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-2">
        <Tray />
        <Toolbar />
      </div>
    </div>
  );
}

function PanelHelp() {
  return (
    <Panel title="How to play" testId="ll-help">
      <HelpText />
      <p className="mt-3 text-[.8em] opacity-70">Drag to pan, right-drag or Q/E to turn, wheel to zoom. R rotates an object, C toggles full walls, Space pauses, Esc puts the tool down.</p>
    </Panel>
  );
}

export function App({ game }: { game: Game }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (host.current) game.mount(host.current);
  }, [game]);
  return (
    <Ctx.Provider value={game}>
      <Root host={host} />
    </Ctx.Provider>
  );
}

function Root({ host }: { host: React.RefObject<HTMLDivElement | null> }) {
  const screen = useHud((s) => s.screen);
  return (
    <div className="ll absolute inset-0 overflow-hidden bg-[#0b1220]" data-testid="lifeline">
      <div ref={host} className="absolute inset-0" />
      {screen === "menu" ? <Menu /> : <Hud />}
    </div>
  );
}
