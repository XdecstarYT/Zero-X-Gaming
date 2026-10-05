import type { ReactNode } from "react";
import { formatClock, type StringKey } from "../i18n";
import { ACHIEVEMENTS, ACH_LABEL } from "../game";
import type { DrawMode, MoveMode, Tab, TerrainMode, ZoneMode, BulldozeMode } from "../store";
import { TABS } from "../store";
import { theme } from "../theme";
import { SERVICE_KINDS, type ServiceKind, type Zone } from "../world/lots";
import { GROUPS, ROAD_TYPES, type RoadTypeId } from "../world/roads";
import { Segmented, Stepper } from "./common";
import { useGame, useNum, useT, useUI } from "./hooks";
import { Icon } from "./Icons";
import { rampColor } from "../render/overlayView";
import { VEHICLES } from "../sim/sim";

const TAB_ICON: Record<Tab, string> = { roads: "roads", zoning: "zoning", transit: "transit", terrain: "terrain", build: "build", move: "move", land: "land", bulldoze: "bulldoze" };

export function Hud() {
  const tab = useUI((s) => s.tab);
  return (
    <div className="@container pointer-events-none absolute inset-0 z-10" data-testid="zc-hud">
      <TopStart />
      <TopEnd />
      <StatsPanel />
      <NoticesPanel />
      <Inspector />
      <VehicleCard />
      <CursorLabel />
      <Toasts />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {tab === "zoning" && <ZoneButtons />}
        <Hint />
        {tab && <ContextBar tab={tab} />}
        <Toolbar />
      </div>
    </div>
  );
}

function TopStart() {
  const g = useGame();
  const t = useT();
  const lang = useUI((s) => s.lang);
  const minutes = useUI((s) => s.minutes);
  const speed = useUI((s) => s.speed);
  const canUndo = useUI((s) => s.canUndo);
  const canRedo = useUI((s) => s.canRedo);
  return (
    <div className="pointer-events-auto absolute start-2 top-2 flex flex-wrap items-center gap-2 sm:start-3 sm:top-3">
      <div className="zc-glass-dark flex items-center gap-1 rounded-full p-1">
        <button
          type="button"
          className="zc-btn rounded-full border-0 bg-transparent"
          aria-label={t("menu")}
          onClick={() => {
            g.sim?.setSpeed(0);
            g.store.setState({ overlay: "pause" });
            g.audio.tick();
          }}
          data-testid="zc-menu-btn"
        >
          <Icon name="menu" size={20} />
        </button>
        <span className="min-w-[5.4em] px-2 text-center font-black tabular-nums" data-testid="zc-clock" aria-live="off">
          {formatClock(lang, minutes)}
        </span>
        {[0, 1, 2, 3].map((v) => (
          <button key={v} type="button" aria-pressed={speed === v} className={`zc-btn rounded-full border-0 px-2 ${speed === v ? "zc-on" : "bg-transparent"}`} onClick={() => g.setSpeed(v)} aria-label={v === 0 ? t("pause") : `${v}×`} data-testid={`zc-speed-${v}`}>
            {v === 0 ? <Icon name="pause" size={16} /> : <span className="font-black">{v}×</span>}
          </button>
        ))}
      </div>
      <div className="zc-glass-dark flex items-center gap-1 rounded-full p-1">
        <button type="button" className="zc-btn rounded-full border-0 bg-transparent" disabled={!canUndo} onClick={() => g.undo()} aria-label={t("undo")} data-testid="zc-undo">
          <Icon name="undo" size={18} />
        </button>
        <button type="button" className="zc-btn rounded-full border-0 bg-transparent" disabled={!canRedo} onClick={() => g.redo()} aria-label={t("redo")} data-testid="zc-redo">
          <Icon name="redo" size={18} />
        </button>
      </div>
    </div>
  );
}

function TopEnd() {
  const g = useGame();
  const t = useT();
  const num = useNum();
  const stats = useUI((s) => s.stats);
  const notices = useUI((s) => s.notices);
  return (
    <div className="pointer-events-auto absolute end-2 top-2 flex flex-wrap items-center justify-end gap-2 sm:end-3 sm:top-3">
      <span className="zc-glass-dark flex min-h-[44px] items-center gap-2 rounded-full px-4 font-black" aria-label={t("unlimited")}>
        <Icon name="money" size={18} style={{ color: theme.on }} />
        <span className="zc-label">{t("unlimited")}</span>
      </span>
      <button type="button" className="zc-glass-dark zc-btn rounded-full px-4 font-black" onClick={() => g.store.setState((s) => ({ statsOpen: !s.statsOpen, noticesOpen: false }))} aria-label={t("population")} data-testid="zc-pop">
        <Icon name="people" size={18} />
        <span className="tabular-nums" data-testid="zc-pop-value">
          {num(stats?.population ?? 0)}
        </span>
      </button>
      <button type="button" className="zc-glass-dark zc-btn rounded-full px-3 font-black" onClick={() => g.store.setState((s) => ({ noticesOpen: !s.noticesOpen, statsOpen: false }))} aria-label={`${t("staff")}: ${stats?.staff ?? 0}, ${t("notifications")}: ${notices.length}`} data-testid="zc-staff">
        <Icon name="staff" size={18} />
        <span className="tabular-nums">{num(stats?.staff ?? 0)}</span>
        {notices.length > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full px-1 text-[0.75em]" style={{ background: "#f5b942", color: "#2a1d00" }}>
            {notices.length}
          </span>
        )}
      </button>
    </div>
  );
}

function Toolbar() {
  const g = useGame();
  const t = useT();
  const tab = useUI((s) => s.tab);
  return (
    <nav className="zc-glass-dark pointer-events-auto flex max-w-full gap-1 overflow-x-auto p-1 zc-scroll" aria-label="Tools" data-testid="zc-toolbar">
      {TABS.map((id, i) => {
        const on = tab === id;
        const red = id === "bulldoze";
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => g.selectTab(id)}
            className="flex min-h-[52px] min-w-[58px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[var(--zc-rs)] px-2 transition-transform hover:-translate-y-0.5"
            style={{ background: on ? (red ? theme.danger : theme.accent) : "transparent", color: on ? (red ? "#fff" : theme.accentInk) : red ? theme.danger : undefined }}
            data-testid={`zc-tab-${id}`}
            title={`${t(`tab.${id}` as StringKey)} (${i + 1})`}
          >
            <Icon name={TAB_ICON[id]} size={20} />
            <span className="zc-label text-[0.62em]">{t(`tab.${id}` as StringKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Hint() {
  const t = useT();
  const tab = useUI((s) => s.tab);
  const draw = useUI((s) => s.drawMode);
  const zm = useUI((s) => s.zoneMode);
  const tm = useUI((s) => s.transitMode);
  const hint = useUI((s) => s.hint);
  let key: StringKey | null = hint;
  if (tab === "roads") key = `hint.${draw}` as StringKey;
  if (tab === "zoning") key = zm === "line" ? "hint.zoneLine" : zm === "area" ? "hint.zoneArea" : "hint.zoneSingle";
  if (tab === "transit") key = tm === "line" ? "hint.busLine" : tm === "stop" ? "hint.busStop" : "railSoon";
  if (!key) return null;
  return (
    <p className="zc-glass-dark rounded-full px-4 py-1.5 text-[0.85em] font-semibold" data-testid="zc-hint">
      {t(key)}
    </p>
  );
}

function ContextBar({ tab }: { tab: Tab }) {
  return (
    <div className="zc-glass-dark zc-slide pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 p-1.5" data-testid={`zc-ctx-${tab}`}>
      {tab === "roads" && <RoadsBar />}
      {tab === "zoning" && <ZoningBar />}
      {tab === "transit" && <TransitBar />}
      {tab === "terrain" && <TerrainBar />}
      {tab === "build" && <BuildBar />}
      {tab === "move" && <MoveBar />}
      {tab === "land" && <LandBar />}
      {tab === "bulldoze" && <BulldozeBar />}
    </div>
  );
}

/** A tool option. `iconOnly` hides the label (kept as the accessible name and tooltip) until the stage is wide. */
function Chip({ on, onClick, icon, label, testId, danger, iconOnly }: { on: boolean; onClick: () => void; icon?: string; label: string; testId?: string; danger?: boolean; iconOnly?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`zc-btn zc-label min-h-[44px] shrink-0 px-3 text-[0.68em] tracking-[0.1em] ${on ? "zc-on" : ""}`}
      style={danger ? (on ? { background: theme.danger, color: "#fff" } : { color: theme.danger, borderColor: theme.danger }) : undefined}
      data-testid={testId}
    >
      {icon && <Icon name={icon} size={16} />}
      <span className={iconOnly && icon ? "hidden @5xl:inline" : undefined}>{label}</span>
    </button>
  );
}

/** One row of chips that scrolls sideways instead of wrapping, so the bar stays short. */
function Row({ children }: { children: ReactNode }) {
  return <div className="zc-scroll flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto">{children}</div>;
}

function RoadsBar() {
  const g = useGame();
  const t = useT();
  const type = useUI((s) => s.roadType);
  const mode = useUI((s) => s.drawMode);
  const group = GROUPS.find((gr) => gr.types.includes(type))!;
  const modes: DrawMode[] = ["straight", "curve", "scurve", "freeform", "roundabout", "lanes", "oneway", "upgrade"];
  const set = (p: Partial<{ roadType: RoadTypeId; drawMode: DrawMode }>) => {
    g.tools.reset();
    g.store.setState(p);
    g.audio.tick();
  };
  return (
    <div className="flex max-w-full flex-col items-center gap-1">
      <Row>
        {GROUPS.map((gr) => (
          <Chip key={gr.id} on={gr.id === group.id} label={t(gr.label)} onClick={() => set({ roadType: gr.types[0] })} testId={`zc-group-${gr.id}`} />
        ))}
        <span className="mx-1 w-px shrink-0 self-stretch bg-white/15" />
        {group.types.map((id) => (
          <Chip key={id} on={id === type} label={`${t(ROAD_TYPES[id].label)} · ${ROAD_TYPES[id].speed}`} onClick={() => set({ roadType: id })} testId={`zc-rt-${id}`} />
        ))}
      </Row>
      <Row>
        {modes.map((m) => (
          <Chip key={m} on={m === mode} icon={m} iconOnly label={t(`dm.${m}` as StringKey)} onClick={() => set({ drawMode: m })} testId={`zc-dm-${m}`} />
        ))}
      </Row>
    </div>
  );
}

function ZoningBar() {
  const g = useGame();
  const t = useT();
  const st = {
    m: useUI((s) => s.zoneMode),
    d: useUI((s) => s.depth),
    w: useUI((s) => s.width),
    mixed: useUI((s) => s.mixed),
    mirror: useUI((s) => s.mirror),
    erase: useUI((s) => s.erase),
  };
  const set = (p: Partial<{ zoneMode: ZoneMode; depth: number; width: number; mixed: boolean; mirror: boolean; erase: boolean }>) => {
    g.tools.reset();
    g.store.setState(p);
    g.audio.tick();
  };
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Segmented
        label="Mode"
        value={st.m}
        onChange={(m) => set({ zoneMode: m })}
        options={(["line", "area", "single"] as ZoneMode[]).map((m) => ({ id: m, label: t(`zm.${m}` as StringKey) }))}
        testId="zc-zm"
      />
      <Stepper label={t("depth")} value={st.d} min={1} max={5} onChange={(v) => set({ depth: v })} testId="zc-depth" />
      <Stepper label={t("width")} value={st.w} min={1} max={5} onChange={(v) => set({ width: v })} testId="zc-width" />
      <Segmented
        label={t("size")}
        value={st.mixed ? "mixed" : "fixed"}
        onChange={(v) => set({ mixed: v === "mixed" })}
        options={[
          { id: "mixed", label: t("size.mixed") },
          { id: "fixed", label: t("size.fixed") },
        ]}
      />
      <Chip on={st.mirror} icon="mirror" label={t("mirror")} onClick={() => set({ mirror: !st.mirror })} testId="zc-mirror" />
      <Chip on={st.erase} icon="erase" label={t("erase")} onClick={() => set({ erase: !st.erase })} testId="zc-erase" danger />
    </div>
  );
}

function ZoneButtons() {
  const g = useGame();
  const t = useT();
  const zone = useUI((s) => s.zone);
  const erase = useUI((s) => s.erase);
  const icons: Record<Zone, string> = { R: "house", C: "tower", I: "factory", M: "mixed" };
  return (
    <div className="pointer-events-auto absolute bottom-[calc(100%+0.25rem)] start-2 flex flex-col gap-1 sm:start-3" role="radiogroup" aria-label={t("tab.zoning")}>
      {(["R", "C", "I", "M"] as Zone[]).map((z) => (
        <button
          key={z}
          type="button"
          role="radio"
          aria-checked={zone === z && !erase}
          title={t(`zone.${z}` as StringKey)}
          aria-label={t(`zone.${z}` as StringKey)}
          onClick={() => {
            g.store.setState({ zone: z, erase: false });
            g.audio.tick();
          }}
          className="zc-glass-dark grid h-12 w-12 place-items-center rounded-[var(--zc-rs)] transition-transform hover:-translate-y-0.5"
          style={{ background: zone === z && !erase ? theme.zone[z] : undefined, color: zone === z && !erase ? "#0b0f14" : theme.zone[z], border: `2px solid ${theme.zone[z]}` }}
          data-testid={`zc-zone-${z}`}
        >
          <Icon name={icons[z]} size={22} />
        </button>
      ))}
    </div>
  );
}

function TransitBar() {
  const g = useGame();
  const t = useT();
  const mode = useUI((s) => s.transitMode);
  const lines = useUI((s) => s.lines);
  const draft = useUI((s) => s.lineDraft);
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      <Chip on={mode === "stop"} icon="stop" label={t("busStop")} onClick={() => (g.tools.reset(), g.store.setState({ transitMode: "stop" }))} testId="zc-tr-stop" />
      <Chip on={mode === "line"} icon="bus" label={`${t("busLine")}${draft.length ? ` (${draft.length})` : ""}`} onClick={() => (g.tools.reset(), g.store.setState({ transitMode: "line" }))} testId="zc-tr-line" />
      <button type="button" className="zc-btn zc-label min-h-[44px] text-[0.7em] opacity-50" disabled title={t("railSoon")}>
        <Icon name="rail" size={16} />
        {t("rail")} · {t("comingSoon")}
      </button>
      {lines.length > 0 && <span className="mx-1 w-px self-stretch bg-white/15" />}
      {lines.map((l) => (
        <span key={l.id} className="flex items-center gap-1 rounded-full bg-white/8 py-1 ps-3 pe-1 text-[0.8em] font-bold">
          <span className="h-3 w-3 rounded-full" style={{ background: ["#22e5ff", "#ff5a5f", "#ffd166", "#8b5cff", "#4ade80", "#ff8fab"][l.color % 6] }} />
          {l.stops}
          <button type="button" className="zc-btn min-h-[32px] min-w-[32px] rounded-full border-0 px-0" aria-label={t("deleteLine")} onClick={() => (g.city?.removeLine(l.id), g.worldChanged())}>
            <Icon name="close" size={14} />
          </button>
        </span>
      ))}
    </div>
  );
}

function TerrainBar() {
  const g = useGame();
  const t = useT();
  const mode = useUI((s) => s.terrainMode);
  const brush = useUI((s) => s.brush);
  const modes: [TerrainMode, string][] = [
    ["raise", "raise"],
    ["lower", "lower"],
    ["smooth", "smooth"],
    ["water", "water"],
    ["trees", "tree"],
    ["clear", "axe"],
  ];
  return (
    <div className="flex max-w-full flex-nowrap items-center justify-center gap-1">
      {modes.map(([m, icon]) => (
        <Chip key={m} on={mode === m} icon={icon} label={t(`tt.${m}` as StringKey)} onClick={() => g.store.setState({ terrainMode: m })} iconOnly testId={`zc-tt-${m}`} />
      ))}
      <label className="ms-2 flex items-center gap-2">
        <span className="zc-label text-[0.7em] opacity-70">{t("brush")}</span>
        <input type="range" min={10} max={90} step={5} value={brush} onChange={(e) => g.store.setState({ brush: Number(e.target.value) })} className="w-28" aria-label={t("brush")} />
      </label>
    </div>
  );
}

function BuildBar() {
  const g = useGame();
  const t = useT();
  const svc = useUI((s) => s.service);
  const icons: Record<ServiceKind, string> = { police: "police", fire: "fire", clinic: "clinic", school: "school", power: "power", water: "watertower", park: "park" };
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {SERVICE_KINDS.map((k) => (
        <Chip key={k} on={svc === k} icon={icons[k]} label={t(`svc.${k}` as StringKey)} onClick={() => g.store.setState({ service: k })} iconOnly testId={`zc-svc-${k}`} />
      ))}
    </div>
  );
}

function MoveBar() {
  const g = useGame();
  const t = useT();
  const mode = useUI((s) => s.moveMode);
  const modes: [MoveMode, string][] = [
    ["select", "select"],
    ["move", "move"],
    ["rotate", "rotate"],
    ["copy", "copy"],
    ["delete", "trash"],
  ];
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {modes.map(([m, icon]) => (
        <Chip key={m} on={mode === m} icon={icon} label={t(`mv.${m}` as StringKey)} onClick={() => g.store.setState({ moveMode: m })} iconOnly testId={`zc-mv-${m}`} danger={m === "delete"} />
      ))}
    </div>
  );
}

function LandBar() {
  const t = useT();
  return (
    <div className="flex items-center gap-3 px-2">
      <span className="zc-label text-[0.7em]">{t("landValue")}</span>
      <span className="text-[0.8em] opacity-75">{t("lvLow")}</span>
      <span className="h-3 w-40 rounded-full" style={{ background: `linear-gradient(90deg, ${theme.ramp.join(",")})` }} aria-hidden />
      <span className="text-[0.8em] opacity-75">{t("lvHigh")}</span>
    </div>
  );
}

function BulldozeBar() {
  const g = useGame();
  const t = useT();
  const mode = useUI((s) => s.bulldozeMode);
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {(["all", "roads", "buildings", "zones"] as BulldozeMode[]).map((m) => (
        <Chip key={m} on={mode === m} label={t(`bd.${m}` as StringKey)} onClick={() => g.store.setState({ bulldozeMode: m })} testId={`zc-bd-${m}`} danger />
      ))}
    </div>
  );
}

function Bar({ label, v, color }: { label: string; v: number; color: string }) {
  const pct = Math.round(Math.abs(v) * 50);
  return (
    <div className="flex items-center gap-2 text-[0.85em]">
      <span className="w-[7.5em] font-semibold">{label}</span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="absolute inset-y-0 start-1/2 w-px bg-white/30" />
        <div className="absolute inset-y-0 rounded-full" style={{ background: color, width: `${pct}%`, insetInlineStart: v >= 0 ? "50%" : `${50 - pct}%` }} />
      </div>
    </div>
  );
}

function StatsPanel() {
  const g = useGame();
  const t = useT();
  const num = useNum();
  const open = useUI((s) => s.statsOpen);
  const stats = useUI((s) => s.stats);
  const play = useUI((s) => s.playSeconds);
  const lang = useUI((s) => s.lang);
  const posted = useUI((s) => s.posted);
  const got = useUI((s) => s.achievements);
  if (!open || !stats) return null;
  const rows: [StringKey, string][] = [
    ["population", num(stats.population)],
    ["workers", num(stats.workers)],
    ["unemployed", num(stats.unemployed)],
    ["jobs", num(stats.jobs)],
    ["buildingsCount", num(stats.buildings)],
    ["vehicles", num(stats.cars)],
    ["pedestriansCount", num(stats.peds)],
    ["congestion", `${Math.round(stats.congestion * 100)}%`],
  ];
  const h = Math.floor(play / 3600);
  const m = Math.floor((play % 3600) / 60);
  return (
    <section className="zc-glass zc-slide pointer-events-auto absolute end-2 top-16 w-[min(92vw,340px)] p-4 sm:end-3" aria-label={t("statsTitle")} data-testid="zc-stats">
      <div className="flex items-center">
        <h3 className="zc-h flex-1 text-[1.15em]">{t("statsTitle")}</h3>
        <button type="button" className="zc-btn border-0 bg-transparent px-0" onClick={() => g.store.setState({ statsOpen: false })} aria-label={t("close")}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <p className="zc-label mt-2 opacity-70">{t("demand")}</p>
      <div className="mt-1 flex flex-col gap-1.5">
        <Bar label={t("zone.R")} v={stats.demand.R} color={theme.zone.R} />
        <Bar label={t("zone.C")} v={stats.demand.C} color={theme.zone.C} />
        <Bar label={t("zone.I")} v={stats.demand.I} color={theme.zone.I} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.88em]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="opacity-70">{t(k)}</dt>
            <dd className="text-end font-bold tabular-nums">{v}</dd>
          </div>
        ))}
        <dt className="opacity-70">{t("playTime")}</dt>
        <dd className="text-end font-bold tabular-nums">{t("hoursMinutes", { h, m })}</dd>
      </dl>
      <p className="zc-label mt-3 opacity-70">{t("achievements")}</p>
      <ul className="mt-1 flex flex-wrap gap-1">
        {ACHIEVEMENTS.map((a) => (
          <li key={a} className="zc-pill" style={got.includes(a) ? { background: "var(--zc-accent)", color: "var(--zc-ink)" } : { background: "rgba(255,255,255,.08)", opacity: 0.6 }}>
            {got.includes(a) ? "✓ " : ""}
            {t(ACH_LABEL[a])}
          </li>
        ))}
      </ul>
      <button type="button" className="zc-btn zc-on mt-3 w-full" onClick={() => void g.postScore()} data-testid="zc-post">
        {posted === "posted" ? t("posted") : t("postScore")}
      </button>
      {posted === "signed-out" && <p className="mt-1 text-[0.8em] opacity-75">{t("signInToPost")}</p>}
      <span className="sr-only">{lang}</span>
    </section>
  );
}

function NoticesPanel() {
  const g = useGame();
  const t = useT();
  const open = useUI((s) => s.noticesOpen);
  const notices = useUI((s) => s.notices);
  if (!open) return null;
  return (
    <section className="zc-glass zc-slide pointer-events-auto absolute end-2 top-16 w-[min(92vw,340px)] p-4 sm:end-3" aria-label={t("notifications")} data-testid="zc-notices">
      <div className="flex items-center">
        <h3 className="zc-h flex-1 text-[1.15em]">{t("notifications")}</h3>
        <button type="button" className="zc-btn border-0 bg-transparent px-0" onClick={() => g.store.setState({ noticesOpen: false })} aria-label={t("close")}>
          <Icon name="close" size={16} />
        </button>
      </div>
      {notices.length === 0 ? (
        <p className="mt-2 opacity-75">{t("noNotices")}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {notices.map((n, i) => (
            <li key={i} className="flex gap-2 rounded-[10px] bg-white/6 p-2 text-[0.9em]">
              <Icon name="bell" size={16} className="mt-0.5 shrink-0" style={{ color: "#f5b942" }} />
              <span>{t(n.key as StringKey, n.vars)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Inspector() {
  const g = useGame();
  const t = useT();
  const num = useNum();
  const ins = useUI((s) => s.inspect);
  if (!ins) return null;
  return (
    <section className="zc-glass zc-slide pointer-events-auto absolute start-2 top-20 w-[min(86vw,280px)] p-4 sm:start-3" aria-label={t("inspector")} data-testid="zc-inspector">
      <div className="flex items-center">
        <h3 className="zc-h flex-1 text-[1.05em]">{ins.kind === "service" ? t(`svc.${ins.service}` as StringKey) : t(`zone.${ins.zone}` as StringKey)}</h3>
        <button type="button" className="zc-btn border-0 bg-transparent px-0" onClick={() => g.store.setState({ inspect: null })} aria-label={t("close")}>
          <Icon name="close" size={16} />
        </button>
      </div>
      {ins.kind === "lot" && (
        <dl className="mt-2 grid grid-cols-2 gap-y-1 text-[0.88em]">
          <dt className="opacity-70">{t("tier", { n: "" }).trim()}</dt>
          <dd className="text-end font-bold">{ins.tier ? t("tier", { n: ins.tier }) : "—"}</dd>
          <dt className="opacity-70">{t("residents")}</dt>
          <dd className="text-end font-bold tabular-nums">{num(ins.residents ?? 0)}</dd>
          <dt className="opacity-70">{t("jobs")}</dt>
          <dd className="text-end font-bold tabular-nums">{num(ins.jobs ?? 0)}</dd>
          <dt className="opacity-70">{t("landValue")}</dt>
          <dd className="flex items-center justify-end gap-2 font-bold">
            <span className="h-3 w-3 rounded-full" style={{ background: rampColor(ins.lv ?? 0.3) }} />
            {Math.round((ins.lv ?? 0.3) * 100)}
          </dd>
        </dl>
      )}
    </section>
  );
}

function VehicleCard() {
  const g = useGame();
  const t = useT();
  const v = useUI((s) => s.vehicle);
  if (!v) return null;
  const kind: Record<string, StringKey> = { home: "headingHome", work: "headingWork", deliver: "delivering", visit: "headingWork", bus: "onRoute" };
  return (
    <section className="zc-glass zc-slide pointer-events-auto absolute start-1/2 top-16 flex -translate-x-1/2 items-center gap-3 px-4 py-2" data-testid="zc-vehicle" aria-live="polite">
      <Icon name={v.type === 3 ? "bus" : "car"} size={22} style={{ color: "#4ade80" }} />
      <div>
        <p className="font-black">{t(`v.${VEHICLES[v.type]}` as StringKey)}</p>
        <p className="text-[0.85em] opacity-80">
          {t(kind[v.kind] ?? "onRoute")} · {v.road}
        </p>
      </div>
      <button type="button" className="zc-btn border-0 bg-transparent px-0" onClick={() => g.clearVehicle()} aria-label={t("close")}>
        <Icon name="close" size={16} />
      </button>
    </section>
  );
}

function CursorLabel() {
  const c = useUI((s) => s.cursorLabel);
  const tab = useUI((s) => s.tab);
  if (!c || !tab) return null;
  return (
    <div className="zc-glass-dark pointer-events-none absolute rounded-full px-3 py-1 text-[0.85em] font-black" style={{ left: c.x + 14, top: c.y - 34, color: c.bad ? theme.danger : undefined }} data-testid="zc-cursor-label">
      {c.text}
    </div>
  );
}

function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div className="pointer-events-none absolute end-2 top-20 flex flex-col items-end gap-2 sm:end-3" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="zc-glass zc-toast px-4 py-2" style={t.kind === "achievement" ? { borderColor: theme.accent } : undefined}>
          <p className="font-black" style={t.kind === "achievement" ? { color: theme.accent } : undefined}>
            {t.kind === "achievement" ? "★ " : ""}
            {t.title}
          </p>
          {t.body && <p className="text-[0.88em] opacity-85">{t.body}</p>}
        </div>
      ))}
    </div>
  );
}
