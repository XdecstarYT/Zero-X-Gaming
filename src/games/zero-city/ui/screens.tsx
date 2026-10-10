/* eslint-disable @next/next/no-img-element -- thumbnails are small data URLs made in the browser */
import { useEffect, useMemo, useState } from "react";
import { VERSION } from "../config";
import { formatAgo, formatPlaytime, LANGS, type StringKey } from "../i18n";
import { applyPreset, changeSetting, sameSettings, type Preset, type Settings, type Shadows, type Glass } from "../settings";
import { UPDATE_LOG } from "../updates";
import { MAPS, drawThumbnail, generateTerrain, type MapDef } from "../world/maps";
import { Segmented, Sheet, Skyline, Slider, Toggle } from "./common";
import { useGame, useNum, useT, useUI } from "./hooks";
import { Icon } from "./Icons";
import { Logo, Mark } from "./Mark";
import type { GameMode } from "../store";
import { ZERO_CITY_DLC_PRICE } from "@/lib/economy";
import { PoweredBy } from "@/nextx/PoweredBy";

// ---------------------------------------------------------------- loading

export function LoadingScreen() {
  const t = useT();
  const loading = useUI((s) => s.loading);
  const tipKey = `tip${loading.tip}` as StringKey;
  return (
    <div className="absolute inset-0 z-40 overflow-hidden bg-[#2a2c55]" data-testid="zc-loading" role="status" aria-live="polite">
      <Skyline />
      <div className="absolute inset-0 bg-black/25" />
      <div className="relative flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
        <Mark size={96} animated />
        <div>
          <p className="zc-label opacity-80">{t("loading")}</p>
          <p className="zc-h mt-1 text-[1.5em]">{loading.label}</p>
        </div>
        <div className="h-2 w-[min(80vw,360px)] overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuenow={Math.round(loading.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.round(loading.progress * 100)}%`, background: "var(--zc-accent)" }} />
        </div>
        <p className="max-w-md text-[0.95em] opacity-85">{t(tipKey)}</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- menu

export function MainMenu() {
  const g = useGame();
  const t = useT();
  const num = useNum();
  const lang = useUI((s) => s.lang);
  const saves = useUI((s) => s.saves);
  const dlcOwned = useUI((s) => s.dlc.owned);
  const last = saves[0];
  const latest = UPDATE_LOG[0];
  const open = (o: "settings" | "load" | "log" | "credits") => {
    g.audio.unlock();
    g.audio.tick();
    g.store.setState({ overlay: o, overlayFrom: null });
  };
  const hint = saves.length === 0 ? t("savesNone") : saves.length === 1 ? t("savesOne") : t("savesMany", { n: saves.length });
  return (
    <div className="absolute inset-0 z-20 overflow-auto" data-testid="zc-menu">
      <div className="pointer-events-none absolute inset-0" style={{ backdropFilter: "blur(5px) brightness(.88)", WebkitBackdropFilter: "blur(5px) brightness(.88)" }} />
      <div className="relative flex min-h-full flex-col gap-6 p-4 sm:p-8">
        <div className="flex flex-wrap items-center gap-4">
          <Logo size={46} />
          <PoweredBy />
        </div>
        <div className="flex flex-1 flex-col items-start gap-5 lg:flex-row lg:items-center">
          <nav className="zc-glass zc-slide w-full max-w-[440px] p-3" aria-label={t("menu")}>
            {last && (
              <button
                type="button"
                className="mb-2 flex w-full items-center gap-3 rounded-[var(--zc-rs)] p-2 text-start transition-transform hover:-translate-y-0.5"
                style={{ background: "var(--zc-accent)", color: "var(--zc-ink)" }}
                onClick={() => {
                  g.audio.unlock();
                  void g.loadSlot(last.slot);
                }}
                data-testid="zc-continue"
              >
                <div className="h-[64px] w-[104px] shrink-0 overflow-hidden rounded-[10px] bg-black/30">
                  {last.thumbnail && <img src={last.thumbnail} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="zc-label opacity-80">{t("continue")}</div>
                  <div className="zc-h truncate text-[1.2em]">{last.name}</div>
                  <div className="truncate text-[0.82em] font-semibold opacity-80">{t("peopleLine", { pop: num(last.population), time: formatPlaytime(lang, last.playtimeSeconds), ago: formatAgo(lang, last.updatedAt) })}</div>
                </div>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--zc-ink)] text-[var(--zc-accent)]">
                  <Icon name="play" size={20} />
                </span>
              </button>
            )}
            <MenuRow icon="plus" title={t("newCity")} hint={t("pickMap")} onClick={() => g.store.setState({ screen: "maps" })} testId="zc-new" />
            <MenuRow icon="folder" title={t("loadCity")} hint={hint} onClick={() => open("load")} testId="zc-load" />
            <MenuRow icon="sun" title={t("dlc.name")} pill={dlcOwned ? t("dlc.owned") : t("dlc.price", { n: ZERO_CITY_DLC_PRICE })} onClick={() => g.openDlc()} testId="zc-dlc" />
            <div className="my-2 h-px bg-white/10" />
            <MenuRow icon="gear" title={t("settings")} onClick={() => open("settings")} testId="zc-settings" />
            <MenuRow icon="log" title={t("updateLog")} pill={t("newPill", { v: VERSION })} onClick={() => open("log")} testId="zc-log" />
            <MenuRow icon="star" title={t("credits")} onClick={() => open("credits")} testId="zc-credits" />
            <div className="mt-2 flex items-center gap-2 px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-[var(--zc-on)]" />
              <span className="zc-label opacity-70" data-testid="zc-build">
                {t("build", { v: VERSION })}
              </span>
            </div>
          </nav>
          {latest && (
            <aside className="zc-glass zc-slide w-full max-w-[340px] p-5" aria-label={t("latestUpdate")}>
              <p className="zc-label" style={{ color: "var(--zc-accent)" }}>
                {t("latestUpdate")}
              </p>
              <p className="zc-h mt-1 text-[1.15em]">{t(latest.title)}</p>
              <p className="mt-2 line-clamp-4 text-[0.92em] opacity-80">{t(latest.body)}</p>
              <button type="button" className="mt-3 font-bold underline-offset-4 hover:underline" style={{ color: "var(--zc-accent)" }} onClick={() => open("log")}>
                {t("readUpdateLog")} →
              </button>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuRow({ icon, title, hint, pill, onClick, testId }: { icon: string; title: string; hint?: string; pill?: string; onClick: () => void; testId?: string }) {
  const g = useGame();
  return (
    <button
      type="button"
      className="zc-row"
      onClick={() => {
        g.audio.unlock();
        g.audio.tick();
        onClick();
      }}
      data-testid={testId}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-white/8">
        <Icon name={icon} size={20} />
      </span>
      <span className="flex-1 text-[1.05em] font-bold">{title}</span>
      {pill && (
        <span className="zc-pill" style={{ background: "var(--zc-accent)", color: "var(--zc-ink)" }}>
          {pill}
        </span>
      )}
      {hint && <span className="text-[0.85em] opacity-60">{hint}</span>}
    </button>
  );
}

// -------------------------------------------------------------- map select

const thumbCache = new Map<string, string>();
function useThumb(def: MapDef, size: number) {
  const key = `${def.id}:${size}`;
  const [src, setSrc] = useState(() => thumbCache.get(key) ?? "");
  useEffect(() => {
    if (thumbCache.has(key)) return;
    let live = true;
    const id = setTimeout(() => {
      const url = drawThumbnail(generateTerrain(def), size).toDataURL();
      thumbCache.set(key, url);
      if (live) setSrc(url);
    }, 10);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [def, key, size]);
  return src;
}

export function MapSelect() {
  const g = useGame();
  const t = useT();
  const num = useNum();
  const bests = useUI((s) => s.bests);
  const [tab, setTab] = useState<"default" | "custom">("default");
  const [sel, setSel] = useState(MAPS[0].id);
  const def = MAPS.find((m) => m.id === sel)!;
  const [name, setName] = useState("");
  const newMode = useUI((s) => s.newMode);
  const dlcOwned = useUI((s) => s.dlc.owned);
  const locked = !!def.dlc && !dlcOwned;
  const big = useThumb(def, 320);
  const levels: StringKey[] = ["level.0", "level.1", "level.2"];
  const res: [StringKey, string][] = [
    ["water", "#3fa9f5"],
    ["wood", "#4caf50"],
    ["farmland", "#e0b84a"],
    ["oil", "#8b5cff"],
  ];
  return (
    <div className="absolute inset-0 z-20 overflow-auto" data-testid="zc-maps">
      <div className="pointer-events-none absolute inset-0" style={{ backdropFilter: "blur(8px) brightness(.8)", WebkitBackdropFilter: "blur(8px) brightness(.8)" }} />
      <div className="relative mx-auto flex min-h-full max-w-7xl flex-col gap-4 p-3 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="zc-btn" onClick={() => g.store.setState({ screen: "menu" })} aria-label={t("back")} data-testid="zc-maps-back">
            <Icon name="undo" size={18} />
          </button>
          <h2 className="zc-h flex-1 text-[1.6em] tracking-[0.12em]">{t("selectMap")}</h2>
          <Segmented
            label={t("selectMap")}
            value={tab}
            onChange={setTab}
            options={[
              { id: "default", label: t("defaultMaps") },
              { id: "custom", label: t("customMaps") },
            ]}
            testId="zc-maptabs"
          />
        </div>
        {tab === "custom" ? (
          <div className="zc-glass grid flex-1 place-items-center p-10 text-center" data-testid="zc-custom-soon">
            <div>
              <Icon name="land" size={48} className="mx-auto opacity-70" />
              <p className="zc-h mt-3 text-[1.4em]">{t("comingSoon")}</p>
              <p className="mt-1 opacity-75">{t("customMapsBody")}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4 lg:flex-row">
            <div className="grid flex-1 grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {MAPS.map((m) => (
                <MapCard key={m.id} def={m} selected={m.id === sel} onClick={() => setSel(m.id)} />
              ))}
            </div>
            <aside className="zc-glass flex w-full flex-col gap-3 p-4 lg:w-[340px]" data-testid="zc-map-detail">
              <div className="aspect-square w-full overflow-hidden rounded-[var(--zc-rs)] bg-black/30">{big && <img src={big} alt="" className="h-full w-full object-cover" />}</div>
              <div className="flex items-center gap-2">
                <h3 className="zc-h flex-1 text-[1.35em]">{t(`map.${def.id}` as StringKey)}</h3>
                <span className="zc-pill bg-white/12">{t(def.tag)}</span>
                {def.dlc && (
                  <span className="zc-pill" style={{ background: "var(--zc-accent)", color: "var(--zc-ink)" }}>
                    {t("dlc.short")}
                  </span>
                )}
              </div>
              <p className="text-[0.92em] opacity-80">{t(`desc.${def.id}` as StringKey)}</p>
              <p className="text-[0.9em]">
                <span className="zc-label opacity-70">{t("relief")}: </span>
                <span className="font-bold">{t(def.relief)}</span>
              </p>
              {bests[def.id] ? <p className="text-[0.85em] opacity-75">{t("yourBest", { pop: num(bests[def.id]) })}</p> : null}
              <div>
                <p className="zc-label mb-2 opacity-70">{t("naturalResources")}</p>
                {res.map(([k, c], i) => (
                  <div key={k} className="mb-1.5 flex items-center gap-2 text-[0.88em]">
                    <span className="w-[6.5em] font-semibold">{t(k)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full" style={{ width: `${((def.res[i] + 1) / 3) * 100}%`, background: c }} />
                    </div>
                    <span className="w-[4.5em] text-end opacity-80">{t(levels[def.res[i]])}</span>
                  </div>
                ))}
              </div>
              <label className="flex flex-col gap-1">
                <span className="zc-label opacity-70">{t("cityName")}</span>
                <input
                  value={name}
                  maxLength={32}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t(`map.${def.id}` as StringKey)}
                  className="min-h-[44px] rounded-[var(--zc-rs)] border border-white/15 bg-black/30 px-3 font-semibold outline-none focus:border-[var(--zc-accent)]"
                  data-testid="zc-cityname"
                />
              </label>
              <div className="flex flex-col gap-1">
                <span className="zc-label opacity-70">{t("mode")}</span>
                <Segmented<GameMode>
                  label={t("mode")}
                  value={newMode}
                  onChange={(m) => g.store.setState({ newMode: m })}
                  options={[
                    { id: "sandbox", label: t("mode.sandbox") },
                    { id: "mayor", label: t("mode.mayor") },
                  ]}
                  testId="zc-mode"
                />
                <p className="text-[0.82em] opacity-75" data-testid="zc-mode-desc">
                  {newMode === "mayor" ? t("mode.mayorDesc") : t("mode.sandboxDesc")}
                </p>
              </div>
              <button
                type="button"
                className="zc-btn zc-on mt-1 min-h-[52px] text-[1.1em] font-black uppercase tracking-[0.15em]"
                onClick={() => {
                  g.audio.unlock();
                  g.audio.click();
                  if (locked) g.openDlc();
                  else void g.newCity(def.id, name.trim(), newMode);
                }}
                data-testid="zc-start"
              >
                {locked ? t("dlc.unlockN", { n: ZERO_CITY_DLC_PRICE }) : t("start")}
              </button>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function MapCard({ def, selected, onClick }: { def: MapDef; selected: boolean; onClick: () => void }) {
  const t = useT();
  const owned = useUI((s) => s.dlc.owned);
  const src = useThumb(def, 160);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="zc-glass relative overflow-hidden p-2 text-start transition-transform hover:-translate-y-0.5"
      style={{ outline: selected ? "3px solid var(--zc-accent)" : undefined, outlineOffset: -1 }}
      data-testid={`zc-map-${def.id}`}
    >
      <div className="aspect-square overflow-hidden rounded-[10px] bg-black/30">{src && <img src={src} alt="" className="h-full w-full object-cover" />}</div>
      <p className="mt-1.5 truncate text-[0.9em] font-bold">{t(`map.${def.id}` as StringKey)}</p>
      {def.dlc && (
        <span className="zc-pill absolute start-3 top-3 text-[0.7em]" style={{ background: "var(--zc-accent)", color: "var(--zc-ink)" }} data-testid={`zc-dlcbadge-${def.id}`}>
          {owned ? t("dlc.short") : `🔒 ${t("dlc.short")}`}
        </span>
      )}
      {selected && (
        <span className="absolute end-3 top-3 grid h-7 w-7 place-items-center rounded-full" style={{ background: "var(--zc-accent)", color: "var(--zc-ink)" }}>
          <Icon name="check" size={16} />
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------- settings

export function SettingsSheet() {
  const g = useGame();
  const t = useT();
  const saved = useUI((s) => s.settings);
  const draft = useUI((s) => s.draft);
  const dirty = !sameSettings(saved, draft);
  // Live: every change shows straight away; Apply keeps it, Revert goes back.
  const edit = (next: Settings) => {
    g.store.setState({ draft: next });
    g.applySettings(next);
    g.store.setState({ settings: saved, lang: next.language });
  };
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => edit(changeSetting(draft, k, v));
  const close = () => {
    if (dirty) revert();
    back();
  };
  const back = () => g.store.setState((s) => ({ overlay: s.overlayFrom, overlayFrom: null }));
  const apply = () => {
    g.applySettings(draft);
    g.store.setState({ settings: draft, draft });
    void g.platform.setSettings(draft);
    g.audio.click();
  };
  const revert = () => {
    g.applySettings(saved);
    g.store.setState({ draft: saved });
  };
  const presets: Preset[] = ["low", "medium", "high", "ultra", "custom"];
  return (
    <Sheet
      title={t("settings")}
      onClose={close}
      wide
      chip={
        dirty ? (
          <div className="flex items-center gap-2">
            <span className="zc-pill" style={{ background: "#f5b942", color: "#2a1d00" }} data-testid="zc-unsaved">
              {t("unsaved")}
            </span>
            <button type="button" className="zc-btn" onClick={revert} data-testid="zc-revert">
              {t("revert")}
            </button>
            <button type="button" className="zc-btn zc-on" onClick={apply} data-testid="zc-apply">
              {t("apply")}
            </button>
          </div>
        ) : null
      }
    >
      <div className="grid gap-6 lg:grid-cols-2" data-testid="zc-settings-sheet">
        <section className="flex flex-col gap-2">
          <h3 className="zc-label opacity-70">{t("graphics")}</h3>
          <Segmented label={t("preset")} value={draft.preset} onChange={(p) => edit(applyPreset(draft, p))} options={presets.map((p) => ({ id: p, label: t(`preset.${p}` as StringKey) }))} testId="zc-preset" />
          <label className="flex min-h-[44px] items-center justify-between gap-3">
            <span className="font-semibold">{t("shadows")}</span>
            <select value={draft.shadows} onChange={(e) => set("shadows", e.target.value as Shadows)} data-testid="zc-shadows">
              {(["off", "soft", "sharp"] as Shadows[]).map((s) => (
                <option key={s} value={s}>
                  {t(`shadows.${s}` as StringKey)}
                </option>
              ))}
            </select>
          </label>
          <Slider label={t("renderScale")} value={draft.renderScale} min={50} onChange={(v) => set("renderScale", v)} testId="zc-renderscale" />
          <Slider label={t("viewDistance")} value={draft.viewDistance} min={20} onChange={(v) => set("viewDistance", v)} />
          <Slider label={t("buildingDensity")} value={draft.buildingDensity} min={20} onChange={(v) => set("buildingDensity", v)} />
          <Slider label={t("pedDensity")} value={draft.pedDensity} min={10} onChange={(v) => set("pedDensity", v)} />
          <Slider label={t("trafficDensity")} value={draft.trafficDensity} min={10} onChange={(v) => set("trafficDensity", v)} />
          <Toggle label={t("aa")} on={draft.aa} onChange={(v) => set("aa", v)} testId="zc-aa" />
          <Toggle label={t("ao")} on={draft.ao} onChange={(v) => set("ao", v)} />
          <Toggle label={t("bloom")} on={draft.bloom} onChange={(v) => set("bloom", v)} />
          <Toggle label={t("dof")} on={draft.dof} onChange={(v) => set("dof", v)} testId="zc-dof" />
          <Toggle label={t("pedestrians")} on={draft.pedestrians} onChange={(v) => set("pedestrians", v)} />
          <Toggle label={t("firesSetting")} on={draft.fires !== false} onChange={(v) => set("fires", v)} />
          <Toggle label={t("traffic")} on={draft.traffic} onChange={(v) => set("traffic", v)} />
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="zc-label opacity-70">{t("language")}</h3>
          <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label={t("language")} data-testid="zc-langs">
            {LANGS.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={draft.language === l.id} lang={l.id} dir={l.rtl ? "rtl" : "ltr"} className={`zc-row min-h-[44px] ${draft.language === l.id ? "bg-white/10" : ""}`} onClick={() => set("language", l.id)} data-testid={`zc-lang-${l.id}`}>
                <span className="flex-1 font-bold">{l.table.langName}</span>
                {draft.language === l.id && (
                  <span className="zc-pill" style={{ background: "var(--zc-accent)", color: "var(--zc-ink)" }}>
                    {t("set")}
                  </span>
                )}
              </button>
            ))}
          </div>
          <h3 className="zc-label mt-4 opacity-70">{t("audio")}</h3>
          <Slider label={t("master")} value={draft.master} onChange={(v) => set("master", v)} />
          <Slider label={t("music")} value={draft.music} onChange={(v) => set("music", v)} />
          <Slider label={t("effects")} value={draft.effects} onChange={(v) => set("effects", v)} />
          <h3 className="zc-label mt-4 opacity-70">{t("accessibility")}</h3>
          <Toggle label={t("reducedMotion")} on={draft.reducedMotion} onChange={(v) => set("reducedMotion", v)} />
          <Toggle label={t("colorBlind")} on={draft.colorBlind} onChange={(v) => set("colorBlind", v)} />
          <Slider label={t("textSize")} value={draft.textScale} min={80} max={150} onChange={(v) => set("textScale", v)} />
          <span className="mt-2 font-semibold">{t("glass")}</span>
          <Segmented<Glass> label={t("glass")} value={draft.glass} onChange={(v) => set("glass", v)} options={(["liquid", "frosted", "solid"] as Glass[]).map((id) => ({ id, label: t(`glass.${id}` as StringKey) }))} testId="zc-glass" />
        </section>
      </div>
    </Sheet>
  );
}

// -------------------------------------------------------------- load city

export function LoadSheet() {
  const g = useGame();
  const t = useT();
  const num = useNum();
  const lang = useUI((s) => s.lang);
  const saves = useUI((s) => s.saves);
  const [confirm, setConfirm] = useState<string | null>(null);
  const back = () => g.store.setState((s) => ({ overlay: s.overlayFrom, overlayFrom: null }));
  return (
    <Sheet title={t("loadCity")} onClose={back}>
      {saves.length === 0 ? (
        <p className="opacity-75" data-testid="zc-nosaves">
          {t("noSaves")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="zc-saves">
          {saves.map((s) => (
            <li key={s.slot} className="flex items-center gap-3 rounded-[var(--zc-rs)] border border-white/10 bg-white/5 p-2">
              <div className="h-[60px] w-[100px] shrink-0 overflow-hidden rounded-[10px] bg-black/30">{s.thumbnail && <img src={s.thumbnail} alt="" className="h-full w-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <p className="zc-h truncate text-[1.1em]">{s.name}</p>
                <p className="truncate text-[0.85em] opacity-75">
                  {t(`map.${s.mapId}` as StringKey)} · {t("peopleLine", { pop: num(s.population), time: formatPlaytime(lang, s.playtimeSeconds), ago: formatAgo(lang, s.updatedAt) })}
                </p>
              </div>
              {confirm === s.slot ? (
                <div className="flex gap-1">
                  <button type="button" className="zc-btn" onClick={() => setConfirm(null)}>
                    {t("cancel")}
                  </button>
                  <button
                    type="button"
                    className="zc-btn zc-danger"
                    onClick={() => {
                      void g.deleteSlot(s.slot);
                      setConfirm(null);
                    }}
                  >
                    {t("delete")}
                  </button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <button type="button" className="zc-btn" aria-label={t("confirmDelete", { name: s.name })} onClick={() => setConfirm(s.slot)}>
                    <Icon name="trash" size={18} />
                  </button>
                  <button
                    type="button"
                    className="zc-btn zc-on"
                    onClick={() => {
                      g.audio.unlock();
                      void (g.mode === "game" ? g.save(true).then(() => g.loadSlot(s.slot)) : g.loadSlot(s.slot));
                    }}
                    data-testid="zc-play-save"
                  >
                    {t("play")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

export function LogSheet() {
  const g = useGame();
  const t = useT();
  return (
    <Sheet title={t("updateLog")} onClose={() => g.store.setState((s) => ({ overlay: s.overlayFrom, overlayFrom: null }))}>
      <ol className="flex flex-col gap-4" data-testid="zc-updatelog">
        {UPDATE_LOG.map((u) => (
          <li key={u.v} className="rounded-[var(--zc-rs)] border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2">
              <span className="zc-pill" style={{ background: "var(--zc-accent)", color: "var(--zc-ink)" }}>
                {u.v}
              </span>
              <span className="text-[0.85em] opacity-60">{u.date}</span>
            </div>
            <p className="zc-h mt-2 text-[1.15em]">{t(u.title)}</p>
            <p className="mt-1 opacity-80">{t(u.body)}</p>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

export function DlcSheet() {
  const g = useGame();
  const t = useT();
  const dlc = useUI((s) => s.dlc);
  const close = () => g.store.setState((s) => ({ overlay: s.overlayFrom, overlayFrom: null }));
  const maps = MAPS.filter((m) => m.dlc);
  const features: [string, StringKey, StringKey][] = [
    ["land", "dlc.f.maps", "dlc.f.mapsB"],
    ["marina", "dlc.f.landmarks", "dlc.f.landmarksB"],
    ["resort", "dlc.f.look", "dlc.f.lookB"],
    ["star", "dlc.f.tourism", "dlc.f.tourismB"],
  ];
  return (
    <Sheet title={t("dlc.name")} onClose={close} chip={dlc.owned ? <span className="zc-pill bg-[var(--zc-on)] text-[var(--zc-ink)]">{t("dlc.owned")}</span> : undefined}>
      <div className="flex flex-col gap-4" data-testid="zc-dlcsheet">
        <div className="relative overflow-hidden rounded-[var(--zc-rs)] p-5" style={{ background: "linear-gradient(135deg,#ff9a5a 0%,#ff5e7e 45%,#2fb7d6 100%)", color: "#14121c" }}>
          <p className="zc-label opacity-80">{t("dlc.kicker")}</p>
          <p className="zc-h mt-1 text-[1.8em] leading-tight">{t("dlc.name")}</p>
          <p className="mt-2 max-w-lg font-semibold">{t("dlc.pitch")}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {maps.map((m) => (
            <DlcMap key={m.id} def={m} />
          ))}
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {features.map(([icon, title, body]) => (
            <li key={title} className="flex gap-3 rounded-[var(--zc-rs)] border border-white/10 bg-white/5 p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-white/8">
                <Icon name={icon} size={20} />
              </span>
              <span>
                <span className="block font-bold">{t(title)}</span>
                <span className="block text-[0.88em] opacity-75">{t(body)}</span>
              </span>
            </li>
          ))}
        </ul>
        {dlc.error !== null && (
          <p className="rounded-[var(--zc-rs)] p-3 font-semibold" style={{ background: "color-mix(in srgb, var(--zc-off) 20%, transparent)" }} role="alert" data-testid="zc-dlc-error">
            {dlc.error || t("dlc.failed")}
          </p>
        )}
        {dlc.owned ? (
          <button type="button" className="zc-btn zc-on min-h-[52px] font-black uppercase tracking-[0.12em]" onClick={() => g.store.setState({ overlay: null, overlayFrom: null, screen: g.store.getState().screen === "game" ? "game" : "maps" })} data-testid="zc-dlc-play">
            {t("dlc.play")}
          </button>
        ) : (
          <button type="button" className="zc-btn zc-on min-h-[52px] font-black uppercase tracking-[0.12em]" disabled={dlc.busy} onClick={() => void g.buyDlc()} data-testid="zc-dlc-buy">
            {dlc.busy ? t("dlc.buying") : t("dlc.buyN", { n: ZERO_CITY_DLC_PRICE })}
          </button>
        )}
        <p className="text-center text-[0.8em] opacity-60">{t("dlc.fine")}</p>
      </div>
    </Sheet>
  );
}

function DlcMap({ def }: { def: MapDef }) {
  const t = useT();
  const src = useThumb(def, 160);
  return (
    <div className="overflow-hidden rounded-[var(--zc-rs)] border border-white/10 bg-black/20 p-1.5">
      <div className="aspect-square overflow-hidden rounded-[8px] bg-black/30">{src && <img src={src} alt="" className="h-full w-full object-cover" />}</div>
      <p className="mt-1 truncate text-[0.82em] font-bold">{t(`map.${def.id}` as StringKey)}</p>
    </div>
  );
}

export function CreditsSheet() {
  const g = useGame();
  const t = useT();
  return (
    <Sheet title={t("creditsTitle")} onClose={() => g.store.setState((s) => ({ overlay: s.overlayFrom, overlayFrom: null }))}>
      <div className="flex flex-col items-center gap-4 py-6 text-center" data-testid="zc-creditsheet">
        <Logo size={56} />
        <p className="max-w-md opacity-85">{t("creditsBody")}</p>
        <p className="opacity-70">{t("creditsTech")}</p>
        <p className="zc-h text-[1.1em]" style={{ color: "var(--zc-accent)" }}>
          {t("creditsThanks")}
        </p>
      </div>
    </Sheet>
  );
}

export function PauseMenu() {
  const g = useGame();
  const t = useT();
  const saving = useUI((s) => s.saving);
  const resume = () => {
    g.store.setState({ overlay: null });
    g.setSpeed(g.store.getState().speed || 1);
  };
  const items = useMemo(
    () => [
      { icon: "play", label: t("resume"), act: resume, id: "zc-resume" },
      { icon: "save", label: saving === "saving" ? t("saving") : saving === "saved" ? t("saved") : t("save"), act: () => void g.save(), id: "zc-save" },
      { icon: "folder", label: t("load"), act: () => g.store.setState({ overlay: "load", overlayFrom: "pause" }), id: "zc-pause-load" },
      { icon: "gear", label: t("settings"), act: () => g.store.setState({ overlay: "settings", overlayFrom: "pause" }), id: "zc-pause-settings" },
      { icon: "exit", label: t("quitToMenu"), act: () => void g.quitToMenu(), id: "zc-quit" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saving, t],
  );
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/40 p-4 zc-in" role="dialog" aria-modal="true" aria-label={t("paused")} data-testid="zc-pause">
      <div className="zc-glass zc-slide w-full max-w-[340px] p-3">
        <p className="zc-h px-3 py-2 text-[1.4em]">{t("paused")}</p>
        {items.map((i) => (
          <button key={i.id} type="button" className="zc-row" onClick={i.act} data-testid={i.id}>
            <Icon name={i.icon} size={20} />
            <span className="font-bold">{i.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
