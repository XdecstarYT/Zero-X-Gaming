import * as THREE from "three";
import { AUTOSAVE_MS, GAME_MINUTES_PER_SECOND, VERSION, WATER_LEVEL } from "./config";
import { Audio } from "./audio";
import { demoCity } from "./demo";
import { translate, type StringKey } from "./i18n";
import type { CitySave, Player, Signals, ZeroXPlatform } from "./platform/zeroxAdapter";
import { AgentView } from "./render/agentView";
import { BuildingView } from "./render/buildingView";
import { CameraRig } from "./render/camera";
import { Engine } from "./render/engine";
import { OverlayView } from "./render/overlayView";
import { RoadView } from "./render/roadView";
import { TerrainView, TreeView } from "./render/terrainView";
import { decodeSave, encodeSave } from "./save";
import { applyPreset, type Settings } from "./settings";
import { SimHost } from "./sim/host";
import type { FromSim } from "./sim/runner";
import type { Building, SimSave } from "./sim/sim";
import type { Store, Tab } from "./store";
import { TABS } from "./store";
import { Tools } from "./tools";
import { ALL_MAP_IDS, City, type CityJSON } from "./world/city";
import { MAPS, mapById } from "./world/maps";

export const ACHIEVEMENTS = ["first-road", "first-zone", "pop-1000", "pop-5000", "pop-10000", "hours-10", "all-maps"] as const;
export const ACH_LABEL: Record<(typeof ACHIEVEMENTS)[number], StringKey> = {
  "first-road": "a.firstRoad",
  "first-zone": "a.firstZone",
  "pop-1000": "a.pop1k",
  "pop-5000": "a.pop5k",
  "pop-10000": "a.pop10k",
  "hours-10": "a.hours10",
  "all-maps": "a.allMaps",
};

/** Views of one city in the scene. */
class WorldViews {
  terrain: TerrainView;
  trees = new TreeView();
  roads: RoadView;
  buildings: BuildingView;
  agents: AgentView;
  overlays: OverlayView;
  group = new THREE.Group();

  constructor(
    public city: City,
    shadows: boolean,
  ) {
    this.terrain = new TerrainView(city.terrain);
    this.roads = new RoadView(() => this.city);
    this.roads.shadows = shadows;
    this.buildings = new BuildingView((x, z) => this.city.terrain.surfaceAt(x, z));
    this.buildings.res = city.map.res;
    this.agents = new AgentView(() => this.city);
    this.overlays = new OverlayView(() => this.city);
    this.group.add(this.terrain.group, this.trees.group, this.roads.group, this.buildings.group, this.agents.group, this.overlays.group);
  }

  dispose() {
    this.terrain.dispose();
    this.trees.dispose();
    this.roads.dispose();
    this.buildings.dispose();
    this.agents.dispose();
    this.overlays.dispose();
  }
}

export interface GameOptions {
  store: Store;
  platform: ZeroXPlatform;
  signals: Signals;
  coarse: boolean;
  /** Platform volume settings (sound on/off, 0–1). */
  site: { sound: boolean; volume: number };
  /** Live population for the platform (its pause screen shows it). */
  onPopulation?: (n: number) => void;
}

export class Game {
  readonly store: Store;
  readonly platform: ZeroXPlatform;
  readonly audio = new Audio();
  engine: Engine | null = null;
  rig: CameraRig | null = null;
  views: WorldViews | null = null;
  city: City | null = null;
  sim: SimHost | null = null;
  tools: Tools;
  host: HTMLElement | null = null;
  mode: "menu" | "game" = "menu";
  slot = "";
  buildings = new Map<number, Building>();
  private demo: ReturnType<typeof demoCity> | null = null;
  private raf = 0;
  private last = performance.now();
  private paused = false;
  private lastTick: Extract<FromSim, { t: "tick" }> | null = null;
  private lastTickAt = 0;
  private hudAcc = 0;
  private autosaveAt = 0;
  private worldDirty = false;
  private worldTimer = 0;
  private overlayDirty = true;
  private overlayAt = 0;
  private lv = new Map<number, number>();
  private thudAt = 0;
  private visited: string[] = [];
  private sessionStart = performance.now();
  private disposers: (() => void)[] = [];
  readonly coarse: boolean;
  private site: { sound: boolean; volume: number };
  private onPopulation?: (n: number) => void;

  constructor(o: GameOptions) {
    this.onPopulation = o.onPopulation;
    this.store = o.store;
    this.platform = o.platform;
    this.coarse = o.coarse;
    this.site = o.site;
    this.tools = new Tools(this);
    this.disposers.push(o.signals.onPause(() => this.pause()), o.signals.onResume(() => this.resume()));
  }

  t(key: StringKey, vars?: Record<string, string | number>) {
    return translate(this.store.getState().lang, key, vars);
  }

  get settings() {
    return this.store.getState().settings;
  }

  // ------------------------------------------------------------ lifecycle

  /** The React tree hands over the element the canvas lives in. */
  mount(host: HTMLElement) {
    if (this.host === host) return;
    this.host = host;
    try {
      this.engine = new Engine(host);
    } catch (e) {
      console.warn("Zero City: WebGL unavailable", e);
      return;
    }
    this.engine.apply(this.settings);
    this.rig = new CameraRig(this.engine.camera, () => (this.city ?? this.demo?.city)?.terrain ?? null);
    this.rig.smooth = !this.settings.reducedMotion;
    const canvas = this.engine.renderer.domElement;
    const ro = new ResizeObserver(() => this.engine?.resize());
    ro.observe(host);
    this.disposers.push(() => ro.disconnect());
    this.disposers.push(this.tools.attach(canvas));
    const vis = () => {
      if (document.hidden) this.pause();
      else if (!this.platformPaused) this.resume();
    };
    document.addEventListener("visibilitychange", vis);
    this.disposers.push(() => document.removeEventListener("visibilitychange", vis));
    this.loop();
  }

  private platformPaused = false;

  /** Boot: loading screen, then the menu with its city backdrop. */
  async start() {
    const set = this.store.setState;
    set({ screen: "loading", loading: { label: this.t("loadingCity"), progress: 0.05, tip: 1 + Math.floor(Math.random() * 6) } });
    const [player, saves, achievements, bests, visited] = await Promise.all([
      this.platform.getPlayer(),
      this.platform.listSaves(),
      this.platform.getAchievements(),
      this.platform.getBests("population"),
      this.loadVisited(),
    ]);
    this.visited = visited;
    set({ player, saves, achievements, bests, loading: { ...this.store.getState().loading, progress: 0.25 } });
    await frame();
    if (!this.demo) this.demo = demoCity();
    set({ loading: { ...this.store.getState().loading, progress: 0.7 } });
    await frame();
    this.showMenuBackdrop();
    set({ loading: { ...this.store.getState().loading, progress: 1 } });
    await wait(350);
    set({ screen: "menu", overlay: null });
    this.platform.track("menu");
  }

  private async loadVisited() {
    const { idbGet } = await import("./platform/idb");
    const p = await this.platform.getPlayer();
    return (await idbGet<string[]>("kv", `${p.id}/visited`)) ?? [];
  }

  private async saveVisited() {
    const { idbSet } = await import("./platform/idb");
    const p = await this.platform.getPlayer();
    await idbSet("kv", `${p.id}/visited`, this.visited);
  }

  private setViews(city: City, buildings: Building[]) {
    if (!this.engine) return;
    if (this.views) {
      this.engine.scene.remove(this.views.group);
      this.views.dispose();
    }
    this.views = new WorldViews(city, this.settings.shadows !== "off");
    this.views.buildings.setDensity(this.settings.buildingDensity / 100);
    this.views.terrain.buildAll();
    this.views.trees.rebuild(city.trees, city.treeAlive, (x, z) => city.terrain.surfaceAt(x, z), this.settings.shadows !== "off");
    this.views.roads.rebuildAll();
    for (const b of buildings) {
      const lot = city.lots.lots.get(b.lot);
      if (lot) this.views.buildings.setBuilding(lot, b);
    }
    this.views.buildings.setServices(city.lots.services.values());
    this.views.overlays.reduceMotion = this.settings.reducedMotion;
    this.views.overlays.rebuildStops();
    city.takeChanges();
    this.engine.scene.add(this.views.group);
  }

  private showMenuBackdrop() {
    if (!this.demo || !this.engine || !this.rig) return;
    this.mode = "menu";
    this.city = null;
    this.setViews(this.demo.city, this.demo.buildings);
    this.views!.overlays.mode = "off";
    this.rig.set({ x: this.demo.centre.x, z: this.demo.centre.z, dist: 820, yaw: 0.6, pitch: 0.55 }, true);
    this.rig.orbit = Infinity;
  }

  // ---------------------------------------------------------- new / load

  async newCity(mapId: string, name: string) {
    const set = this.store.setState;
    const label = this.t("loadingMap", { map: this.t(`map.${mapId}` as StringKey) });
    set({ screen: "loading", overlay: null, loading: { label, progress: 0.1, tip: 1 + Math.floor(Math.random() * 6) } });
    await frame();
    const city = new City(mapId, name || this.t(`map.${mapId}` as StringKey));
    set({ loading: { label, progress: 0.55, tip: this.store.getState().loading.tip } });
    await frame();
    this.slot = `city-${city.created}`;
    this.enterCity(city, null, null);
    set({ loading: { label, progress: 1, tip: this.store.getState().loading.tip } });
    await wait(250);
    set({ screen: "game" });
    this.platform.track("new_city", { map: mapId });
    void this.save(true);
  }

  async loadSlot(slot: string) {
    const set = this.store.setState;
    const save = await this.platform.loadCity(slot);
    if (!save) return;
    const label = this.t("loadingMap", { map: save.summary.name });
    set({ screen: "loading", overlay: null, loading: { label, progress: 0.1, tip: 1 + Math.floor(Math.random() * 6) } });
    await frame();
    let json: CityJSON;
    try {
      json = await decodeSave(save);
    } catch (e) {
      console.warn("Zero City: couldn't read save", e);
      set({ screen: "menu" });
      return;
    }
    set({ loading: { label, progress: 0.4, tip: this.store.getState().loading.tip } });
    await frame();
    const city = new City(json.mapId, json.name, json);
    set({ loading: { label, progress: 0.8, tip: this.store.getState().loading.tip } });
    await frame();
    this.slot = slot;
    this.enterCity(city, json.sim, json.camera ?? null);
    set({ loading: { label, progress: 1, tip: this.store.getState().loading.tip } });
    await wait(200);
    set({ screen: "game" });
    this.platform.track("load_city", { map: json.mapId });
  }

  private enterCity(city: City, simSave: SimSave | null, camera: CityJSON["camera"] | null) {
    this.mode = "game";
    this.city = city;
    this.buildings.clear();
    for (const b of simSave?.buildings ?? []) this.buildings.set(b.lot, b);
    this.setViews(city, [...this.buildings.values()]);
    this.views!.overlays.mode = "zones";
    this.overlayDirty = true;
    this.sim?.dispose();
    this.sim = new SimHost((m) => this.onTick(m));
    this.sim.init(city.toSim(), simSave, this.simSettings());
    this.sim.setSpeed(this.store.getState().speed);
    this.lastTick = null;
    const gate = [...city.roads.nodes.values()].find((n) => n.gate);
    const end = gate ? city.roads.nodeEdges(gate.id)[0] : null;
    const target = end ? { x: end.pts[end.pts.length - 2], z: end.pts[end.pts.length - 1] } : { x: 1024, z: 1024 };
    this.rig!.orbit = 0;
    this.rig!.set(camera ?? { x: target.x, z: target.z, dist: 360, yaw: Math.PI * 0.25, pitch: 0.95 }, true);
    this.autosaveAt = performance.now() + AUTOSAVE_MS;
    this.sessionStart = performance.now();
    this.store.setState({
      cityName: city.name,
      mapId: city.map.id,
      minutes: simSave?.minutes ?? 8 * 60,
      playSeconds: city.playSeconds,
      tab: null,
      inspect: null,
      vehicle: null,
      statsOpen: false,
      noticesOpen: false,
      canUndo: false,
      canRedo: false,
      lines: city.lines.map((l) => ({ id: l.id, stops: l.stops.length, color: l.color })),
      posted: "idle",
    });
    if (!this.visited.includes(city.map.id)) {
      this.visited.push(city.map.id);
      void this.saveVisited();
    }
    if (ALL_MAP_IDS.every((id) => this.visited.includes(id))) void this.achieve("all-maps");
  }

  private simSettings() {
    const s = this.settings;
    return { traffic: s.traffic, peds: s.pedestrians, trafficDensity: s.trafficDensity, pedDensity: s.pedDensity };
  }

  async quitToMenu() {
    await this.save();
    this.sim?.dispose();
    this.sim = null;
    this.tools.reset();
    this.store.setState({ tab: null, overlay: null, inspect: null, vehicle: null, saves: await this.platform.listSaves() });
    this.showMenuBackdrop();
    this.store.setState({ screen: "menu" });
  }

  // ----------------------------------------------------------------- saves

  async save(quiet = false) {
    const city = this.city;
    if (!city || !this.sim || this.mode !== "game") return;
    if (!quiet) this.store.setState({ saving: "saving" });
    const simSave = await this.sim.save();
    city.playSeconds = this.store.getState().playSeconds;
    const pop = this.lastTick?.stats.population ?? 0;
    const json = city.toJSON(simSave, this.rig?.state, this.visited);
    const summary = {
      slot: this.slot,
      name: city.name,
      mapId: city.map.id,
      population: pop,
      playtimeSeconds: Math.floor(city.playSeconds),
      updatedAt: Date.now(),
      thumbnail: this.engine?.snapshot() ?? undefined,
    };
    let data: CitySave;
    try {
      data = await encodeSave(json, summary);
      await this.platform.saveCity(this.slot, data);
    } catch (e) {
      console.warn("Zero City: save failed", e);
      this.store.setState({ saving: "idle" });
      return;
    }
    this.store.setState({ saving: quiet ? this.store.getState().saving : "saved", saves: await this.platform.listSaves() });
    if (!quiet) setTimeout(() => this.store.setState({ saving: "idle" }), 1800);
    if (pop > 0) {
      const out = await this.platform.submitScore("population", city.map.id, pop);
      if (out === "posted") this.store.setState({ posted: "posted" });
      this.store.setState({ bests: await this.platform.getBests("population") });
      void this.platform.submitScore("playtime", city.map.id, Math.floor(city.playSeconds));
    }
  }

  /** The Stats panel's button: post now. */
  async postScore() {
    const pop = this.lastTick?.stats.population ?? 0;
    if (!this.city || pop <= 0) return;
    const out = await this.platform.submitScore("population", this.city.map.id, pop, { force: true });
    this.store.setState({ posted: out === "posted" ? "posted" : out === "signed-out" ? "signed-out" : out === "local" ? "idle" : "failed" });
  }

  async deleteSlot(slot: string) {
    await this.platform.deleteCity(slot);
    this.store.setState({ saves: await this.platform.listSaves() });
  }

  // ------------------------------------------------------------ the sim

  private onTick(m: Extract<FromSim, { t: "tick" }>) {
    const now = performance.now();
    this.lastTick = m;
    this.lastTickAt = now;
    const v = this.views;
    const city = this.city;
    if (!v || !city) return;
    let finished = false;
    for (const b of m.changed) {
      const prev = this.buildings.get(b.lot);
      if (b.progress >= 1 && (!prev || prev.progress < 1)) finished = true;
      if (!prev || prev.progress < 1 !== b.progress < 1 || prev.tier !== b.tier) this.overlayDirty = true;
      this.buildings.set(b.lot, b);
      const lot = city.lots.lots.get(b.lot);
      if (lot) v.buildings.setBuilding(lot, b);
    }
    for (const id of m.removed) {
      this.buildings.delete(id);
      const lot = city.lots.lots.get(id);
      if (lot) v.buildings.setBuilding(lot, null);
      this.overlayDirty = true;
    }
    if (finished && now - this.thudAt > 450) {
      this.thudAt = now;
      this.audio.thud();
    }
    v.agents.push(m.cars, m.peds, now);
    this.checkAchievements(m.stats.population);
  }

  setSpeed(v: number) {
    this.store.setState({ speed: v });
    this.sim?.setSpeed(this.paused ? 0 : v);
    this.audio.tick();
  }

  /** The world changed (roads, zones, buildings): tell the sim soon. */
  worldChanged() {
    this.worldDirty = true;
    this.overlayDirty = true;
  }

  private flushWorld(now: number) {
    if (!this.worldDirty || !this.city || !this.sim || now < this.worldTimer) return;
    this.worldDirty = false;
    this.worldTimer = now + 150;
    this.sim.setWorld(this.city.toSim());
    // Buildings on lots that are gone.
    for (const id of [...this.buildings.keys()]) if (!this.city.lots.lots.has(id)) this.buildings.delete(id);
    this.views?.buildings.prune(this.city.lots.lots);
    this.store.setState({ canUndo: this.city.canUndo(), canRedo: this.city.canRedo(), lines: this.city.lines.map((l) => ({ id: l.id, stops: l.stops.length, color: l.color })) });
  }

  async refreshLandValues() {
    if (!this.sim) return;
    this.lv = await this.sim.landValues();
    this.overlayDirty = true;
  }

  landValue(lot: number) {
    return this.lv.get(lot) ?? 0.3;
  }

  // ---------------------------------------------------------- achievements

  async achieve(id: (typeof ACHIEVEMENTS)[number]) {
    const fresh = await this.platform.unlockAchievement(id);
    if (!fresh) return;
    this.store.setState({ achievements: await this.platform.getAchievements() });
    this.toast(this.t("achievementUnlocked"), this.t(ACH_LABEL[id]), "achievement");
    this.audio.chime();
    this.platform.track("achievement", { id });
  }

  private checkAchievements(pop: number) {
    const got = this.store.getState().achievements;
    if (pop >= 1000 && !got.includes("pop-1000")) void this.achieve("pop-1000");
    if (pop >= 5000 && !got.includes("pop-5000")) void this.achieve("pop-5000");
    if (pop >= 10000 && !got.includes("pop-10000")) void this.achieve("pop-10000");
    if (this.store.getState().playSeconds >= 36000 && !got.includes("hours-10")) void this.achieve("hours-10");
  }

  toast(title: string, body?: string, kind: "info" | "achievement" = "info") {
    const id = Math.random();
    this.store.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, title, body, kind }] }));
    setTimeout(() => this.store.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
  }

  // -------------------------------------------------------------- settings

  applySettings(s: Settings) {
    const prev = this.settings;
    this.store.setState({ settings: s, lang: s.language });
    this.engine?.apply(s);
    if (this.rig) this.rig.smooth = !s.reducedMotion;
    const shadows = s.shadows !== "off";
    if (this.views) {
      this.views.roads.setShadows(shadows);
      this.views.trees.setShadows(shadows);
      this.views.buildings.setShadows(shadows);
      this.views.agents.setShadows(shadows);
      this.views.overlays.reduceMotion = s.reducedMotion;
      if (prev.buildingDensity !== s.buildingDensity) {
        this.views.buildings.setDensity(s.buildingDensity / 100);
        const city = this.city ?? this.demo?.city;
        const list = this.city ? [...this.buildings.values()] : (this.demo?.buildings ?? []);
        if (city) for (const b of list) {
          const lot = city.lots.lots.get(b.lot);
          if (lot) this.views.buildings.setBuilding(lot, b);
        }
      }
    }
    this.sim?.setSettings(this.simSettings());
    this.audio.setLevels({ master: s.master, music: s.music, effects: s.effects });
  }

  setSite(site: { sound: boolean; volume: number }) {
    this.site = site;
    this.audio.setEnabled(site.sound);
    this.audio.setLevels({ site: site.volume });
  }

  // ------------------------------------------------------------- pausing

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.platformPaused = true;
    this.sim?.setSpeed(0);
    this.audio.suspend();
    if (this.mode === "game") void this.save(true);
  }

  resume() {
    this.platformPaused = false;
    if (!this.paused) return;
    this.paused = false;
    this.sim?.setSpeed(this.store.getState().speed);
    this.audio.resume();
    this.last = performance.now();
  }

  // ----------------------------------------------------------- the frame

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.paused || !this.engine || !this.rig || !this.views) return;
    const st = this.store.getState();
    this.rig.update(dt);
    this.engine.focus.copy(this.rig.target);
    // Game clock between ticks.
    let minutes = st.minutes;
    if (this.mode === "game" && this.lastTick) {
      const ahead = Math.min(0.2, (now - this.lastTickAt) / 1000) * st.speed * GAME_MINUTES_PER_SECOND;
      minutes = this.lastTick.minutes + ahead;
    }
    this.engine.setTime(this.mode === "menu" ? 17.75 * 60 : minutes);
    const s = st.settings;
    const range = 700 + 2100 * (s.viewDistance / 100);
    this.views.terrain.update(this.rig.target.x, this.rig.target.z, range * 0.9, now / 1000);
    const city = this.city;
    if (city) {
      const ch = city.takeChanges();
      if (ch.edges.size || ch.removedEdges.size || ch.nodes.size) {
        this.views.roads.sync(ch);
        this.worldChanged();
      }
      if (ch.lots) this.worldChanged();
      if (ch.services) {
        this.views.buildings.setServices(city.lots.services.values());
        this.worldChanged();
      }
      if (ch.trees) this.views.trees.rebuild(city.trees, city.treeAlive, (x, z) => city.terrain.surfaceAt(x, z), s.shadows !== "off");
      if (ch.transit) {
        this.views.overlays.rebuildStops();
        this.worldChanged();
      }
      this.flushWorld(now);
      if (this.overlayDirty && now > this.overlayAt) {
        this.overlayDirty = false;
        this.overlayAt = now + 400;
        this.views.overlays.rebuildLots((l) => (this.buildings.get(l.id)?.progress ?? 0) >= 1, this.lv);
      }
    }
    this.views.agents.update(now, s.traffic, s.pedestrians);
    this.views.overlays.update(now / 1000);
    this.views.roads.update(this.rig.dist);
    this.tools.frame(now);
    this.audio.update(this.rig.height(), this.lastTick?.stats.cars ?? 0, this.mode === "game");
    this.engine.render(this.rig.dist);
    // HUD at 4 Hz.
    this.hudAcc += dt;
    if (this.mode === "game" && this.hudAcc > 0.25) {
      const play = st.playSeconds + this.hudAcc * (st.speed > 0 ? 1 : 1);
      this.hudAcc = 0;
      this.store.setState({ minutes, stats: this.lastTick?.stats ?? st.stats, notices: this.lastTick?.notices ?? st.notices, playSeconds: play });
      if (this.lastTick) this.onPopulation?.(this.lastTick.stats.population);
      if (now > this.autosaveAt) {
        this.autosaveAt = now + AUTOSAVE_MS;
        void this.save(true).then(() => this.toast(this.t("autosaved")));
      }
    }
  };

  /** Session length for score posting (ms of active play this session). */
  sessionMs() {
    return Math.max(1000, performance.now() - this.sessionStart);
  }

  selectTab(tab: Tab | null) {
    const cur = this.store.getState().tab;
    const next = cur === tab ? null : tab;
    this.tools.reset();
    this.store.setState({ tab: next, inspect: null, hint: null, lineDraft: [] });
    if (this.views) {
      this.views.overlays.mode = next === "land" ? "land" : "zones";
      this.overlayDirty = true;
      if (next === "land") void this.refreshLandValues();
    }
    this.tools.onTab(next);
    this.audio.tick();
  }

  tabByKey(n: number) {
    const tab = TABS[n - 1];
    if (tab) this.selectTab(tab);
  }

  undo() {
    if (this.city?.undo()) {
      this.views?.roads.rebuildAll();
      this.views?.overlays.rebuildStops();
      this.worldChanged();
      this.audio.click();
    }
  }

  redo() {
    if (this.city?.redo()) {
      this.views?.roads.rebuildAll();
      this.views?.overlays.rebuildStops();
      this.worldChanged();
      this.audio.click();
    }
  }

  async selectVehicle(id: number) {
    if (!this.sim || !this.views) return;
    this.views.agents.selected = id;
    const r = await this.sim.route(id);
    if (!r) {
      this.clearVehicle();
      return;
    }
    const city = this.city!;
    const ys: number[] = [];
    for (let i = 0; i < r.pts.length / 2; i++) {
      const ref = r.refs[i * 2];
      const s = r.refs[i * 2 + 1];
      ys.push(ref > 0 ? city.roadY(ref, s) : ref < 0 ? city.nodeY(-ref) : city.terrain.surfaceAt(r.pts[i * 2], r.pts[i * 2 + 1]));
    }
    this.views.overlays.setRoute(r.pts, ys);
    this.store.setState({ vehicle: { id, type: r.type, kind: r.kind, road: r.road }, inspect: null });
  }

  clearVehicle() {
    if (this.views) {
      this.views.agents.selected = -1;
      this.views.overlays.setRoute(null);
    }
    this.store.setState({ vehicle: null });
  }

  /** Ground point under a screen position (ray-marched against the heightfield). */
  groundAt(clientX: number, clientY: number) {
    if (!this.engine) return null;
    const city = this.city ?? this.demo?.city;
    if (!city) return null;
    const rect = this.engine.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.engine.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    let t0 = 0;
    let step = 4;
    for (let t = 0; t < 6000; t += step) {
      const x = o.x + d.x * t;
      const y = o.y + d.y * t;
      const z = o.z + d.z * t;
      if (y <= Math.max(WATER_LEVEL, city.terrain.heightAt(x, z))) {
        let lo = t0;
        let hi = t;
        for (let k = 0; k < 18; k++) {
          const mid = (lo + hi) / 2;
          const yy = o.y + d.y * mid;
          if (yy <= Math.max(WATER_LEVEL, city.terrain.heightAt(o.x + d.x * mid, o.z + d.z * mid))) hi = mid;
          else lo = mid;
        }
        return new THREE.Vector3(o.x + d.x * hi, o.y + d.y * hi, o.z + d.z * hi);
      }
      t0 = t;
      step = Math.min(24, 4 + t * 0.01);
    }
    return null;
  }

  raycaster(clientX: number, clientY: number) {
    const rect = this.engine!.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.engine!.camera);
    return ray;
  }

  /** Screen position of a world point (for labels). */
  toScreen(p: THREE.Vector3) {
    if (!this.engine) return null;
    const v = p.clone().project(this.engine.camera);
    const rect = this.engine.renderer.domElement.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height };
  }

  /** Test hook: page coordinates of a world point. */
  screenOf(x: number, z: number) {
    const city = this.city ?? this.demo?.city;
    if (!this.engine || !city) return null;
    const s = this.toScreen(new THREE.Vector3(x, city.terrain.surfaceAt(x, z), z));
    const r = this.engine.renderer.domElement.getBoundingClientRect();
    return s ? { x: s.x + r.left, y: s.y + r.top } : null;
  }

  /** Test hook: switch graphics preset. */
  quality(p: "low" | "medium" | "high" | "ultra") {
    const s = applyPreset(this.settings, p);
    this.applySettings(s);
    this.store.setState({ draft: s });
  }

  /** Test hook: put the camera somewhere. */
  look(x: number, z: number, dist = 200, pitch = 0.9, yaw = Math.PI * 0.25) {
    this.rig?.set({ x, z, dist, yaw, pitch }, true);
  }

  /** Test hook: the end of the highway in. */
  gateEnd() {
    const city = this.city;
    if (!city) return null;
    const gate = [...city.roads.nodes.values()].find((n) => n.gate);
    const e = gate ? city.roads.nodeEdges(gate.id)[0] : null;
    if (!e) return null;
    const far = e.a === gate!.id ? { x: e.pts[e.pts.length - 2], z: e.pts[e.pts.length - 1] } : { x: e.pts[0], z: e.pts[1] };
    return { x: far.x, z: far.z, dx: Math.sign(far.x - gate!.x), dz: Math.sign(far.z - gate!.z) };
  }

  /** Test and showcase hook: a quick look at the state. */
  debugState() {
    const st = this.store.getState();
    return {
      screen: st.screen,
      mode: this.mode,
      population: st.stats?.population ?? 0,
      buildings: this.buildings.size,
      roads: this.city?.roads.edges.size ?? 0,
      lots: this.city?.lots.lots.size ?? 0,
      cars: st.stats?.cars ?? 0,
      peds: st.stats?.peds ?? 0,
      minutes: st.minutes,
      threaded: this.sim?.threaded ?? false,
      version: VERSION,
      maps: MAPS.length,
    };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    if (this.mode === "game") void this.save(true);
    for (const d of this.disposers) d();
    this.sim?.dispose();
    this.views?.dispose();
    this.engine?.dispose();
    this.audio.dispose();
  }

  mapDef(id: string) {
    return mapById(id);
  }

  player(): Player | null {
    return this.store.getState().player;
  }
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
