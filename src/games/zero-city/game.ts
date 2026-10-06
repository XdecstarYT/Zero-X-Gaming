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
import { FireView } from "./render/fireView";
import { OverlayView, rampColor } from "./render/overlayView";
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
import * as Pol from "./politics/politics";
import * as Parl from "./politics/parliament";
import * as Mandate from "./politics/mandate";
import type { AppPage, DistrictView, GameMode, HallTab } from "./store";
import type { Lot, ServiceKind } from "./world/lots";
import { DLC_LANDMARKS, LANDMARK_UNLOCK, LANDMARKS, landmarkState, isLandmark, MILESTONES, milestoneAt, milestoneProgress, type Landmark } from "./world/milestones";
import type { RoadTypeId } from "./world/roads";
import { cumulative } from "./core/geom";
import { formatNumber } from "./i18n";
import { MAPS, mapById } from "./world/maps";

export const ACHIEVEMENTS = ["first-road", "first-zone", "pop-1000", "pop-5000", "pop-10000", "hours-10", "all-maps", "reelected", "landslide"] as const;
export const ACH_LABEL: Record<(typeof ACHIEVEMENTS)[number], StringKey> = {
  "first-road": "a.firstRoad",
  "first-zone": "a.firstZone",
  "pop-1000": "a.pop1k",
  "pop-5000": "a.pop5k",
  "pop-10000": "a.pop10k",
  "hours-10": "a.hours10",
  "all-maps": "a.allMaps",
  reelected: "a.reelected",
  landslide: "a.landslide",
};

/** Views of one city in the scene. */
class WorldViews {
  terrain: TerrainView;
  trees = new TreeView();
  roads: RoadView;
  buildings: BuildingView;
  agents: AgentView;
  overlays: OverlayView;
  fires = new FireView();
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
    this.buildings.look = city.map.look ?? "base";
    this.agents = new AgentView(() => this.city);
    this.overlays = new OverlayView(() => this.city);
    this.group.add(this.terrain.group, this.trees.group, this.roads.group, this.buildings.group, this.agents.group, this.overlays.group, this.fires.group);
  }

  dispose() {
    this.terrain.dispose();
    this.trees.dispose();
    this.roads.dispose();
    this.buildings.dispose();
    this.agents.dispose();
    this.overlays.dispose();
    this.fires.dispose();
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
  /** Mayor mode's politics (null in Sandbox). */
  politics: Pol.PoliticsState | null = null;
  private roadKm = { version: -1, km: 0 };
  private speedBeforeElection = 1;
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
  /** Road condition and roadworks per edge, from the sim. */
  private roadStates = new Map<number, { c: number; works: number }>();
  /** Lot → services reaching it (bit mask from the sim), for the info views. */
  private cover = new Map<number, number>();
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
    void this.refreshDlc();
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
    for (const b of buildings) {
      const lot = city.lots.lots.get(b.lot);
      if (lot) city.clearTreesOnLot(lot);
    }
    this.views.trees.rebuild(city.trees, city.treeAlive, (x, z) => city.terrain.surfaceAt(x, z), this.settings.shadows !== "off");
    this.views.roads.roadState = (id) => this.roadStates.get(id);
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

  async newCity(mapId: string, name: string, mode: GameMode = "sandbox") {
    // Riviera maps need the DLC.
    if (MAPS.find((m) => m.id === mapId)?.dlc && !this.store.getState().dlc.owned) {
      this.openDlc();
      return;
    }
    const set = this.store.setState;
    const label = this.t("loadingMap", { map: this.t(`map.${mapId}` as StringKey) });
    set({ screen: "loading", overlay: null, loading: { label, progress: 0.1, tip: 1 + Math.floor(Math.random() * 6) } });
    await frame();
    const city = new City(mapId, name || this.t(`map.${mapId}` as StringKey));
    set({ loading: { label, progress: 0.55, tip: this.store.getState().loading.tip } });
    await frame();
    this.slot = `city-${city.created}`;
    this.enterCity(city, null, null, mode, null);
    set({ loading: { label, progress: 1, tip: this.store.getState().loading.tip } });
    await wait(250);
    set({ screen: "game" });
    this.platform.track("new_city", { map: mapId, mode });
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
    this.enterCity(city, json.sim, json.camera ?? null, json.mode ?? "sandbox", json.politics);
    set({ loading: { label, progress: 1, tip: this.store.getState().loading.tip } });
    await wait(200);
    set({ screen: "game" });
    this.platform.track("load_city", { map: json.mapId });
  }

  private enterCity(city: City, simSave: SimSave | null, camera: CityJSON["camera"] | null, mode: GameMode, politics: unknown) {
    this.mode = "game";
    this.city = city;
    const minutes = simSave?.minutes ?? 8 * 60;
    this.politics = mode === "mayor" ? (politics ? Pol.normalisePolitics(politics as Partial<Pol.PoliticsState>, minutes) : Pol.newPolitics((city.created % 1_000_003) + 1, minutes)) : null;
    // An ousted mayor's city carries on as a sandbox.
    const live = mode === "mayor" && this.politics?.status !== "ousted" ? "mayor" : mode;
    this.store.setState({ mode: live, hall: null, app: null, bill: null, election: null, politics: null });
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
    return { traffic: s.traffic, peds: s.pedestrians, trafficDensity: s.trafficDensity, pedDensity: s.pedDensity, fires: s.fires !== false, policy: this.mayor ? Pol.simPolicy(this.politics!) : undefined };
  }

  async quitToMenu() {
    await this.save();
    this.sim?.dispose();
    this.sim = null;
    this.politics = null;
    this.tools.reset();
    this.store.setState({ tab: null, overlay: null, inspect: null, vehicle: null, mode: "sandbox", politics: null, hall: null, app: null, bill: null, election: null, saves: await this.platform.listSaves() });
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
    if (this.politics) {
      json.mode = "mayor";
      json.politics = this.politics;
    }
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
      if (lot) {
        v.buildings.setBuilding(lot, b);
        // Trees on the plot make way for the building.
        if (!prev) city.clearTreesOnLot(lot);
      }
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
    if (m.roads) this.takeRoads(m.roads);
    v.fires.set(
      m.fires,
      (id) => city.lots.lots.get(id),
      (id) => Math.min(42, 3 + (this.buildings.get(id)?.tier ?? 1) * 5),
      (x, z) => city.terrain.surfaceAt(x, z),
    );
    for (const e of m.events) {
      const bad = e.key !== "ev.fireOut";
      this.toast(this.t(e.key as StringKey, e.vars), undefined);
      if (bad) this.audio.error();
      else this.audio.chime();
    }
    this.checkAchievements(m.stats.population);
    this.checkMilestones(m.stats.population);
  }

  /** The best population so far names the city, pays a grant (Mayor) and unlocks landmarks. */
  private checkMilestones(pop: number) {
    const city = this.city;
    if (!city) return;
    const before = milestoneAt(city.bestPop);
    if (pop > city.bestPop) city.bestPop = pop;
    const now = milestoneAt(city.bestPop);
    if (now > before) {
      for (let i = before + 1; i <= now; i++) {
        const ms = MILESTONES[i];
        const unlocks = LANDMARKS.filter((k) => LANDMARK_UNLOCK[k] === i).map((k) => this.t(`svc.${k}` as StringKey));
        this.toast(this.t("ms.reached", { name: this.t(`ms.${ms.id}` as StringKey) }), [this.politics && ms.grant ? this.t("ms.grant", { money: this.money(ms.grant) }) : "", unlocks.length ? this.t("ms.unlocks", { list: unlocks.join(", ") }) : ""].filter(Boolean).join(" · ") || undefined, "achievement");
        if (this.politics && ms.grant) {
          this.politics.cash += ms.grant;
          this.publishPolitics();
        }
      }
      this.audio.chime();
    }
    this.publishCityProgress();
  }

  /** Milestone and landmark states for the HUD. */
  publishCityProgress() {
    const city = this.city;
    if (!city) return;
    const built = new Set<string>([...city.lots.services.values()].map((s) => s.kind));
    const owned = this.store.getState().dlc.owned;
    const landmarks = Object.fromEntries([...LANDMARKS, ...DLC_LANDMARKS].map((k) => [k, landmarkState(k, city.bestPop, built, owned)])) as Record<Landmark, "locked" | "built" | "ready" | "dlc">;
    const cur = this.store.getState();
    const i = milestoneAt(city.bestPop);
    const progress = Math.round(milestoneProgress(city.bestPop) * 100) / 100;
    if (cur.milestone.i !== i || cur.milestone.progress !== progress || [...LANDMARKS, ...DLC_LANDMARKS].some((k) => cur.landmarks[k] !== landmarks[k])) this.store.setState({ milestone: { i, progress }, landmarks });
  }

  // ------------------------------------------------------------------ DLC

  /** Ask the platform whether the Riviera DLC is owned. */
  async refreshDlc() {
    let owned = false;
    try {
      owned = await this.platform.dlcOwned();
    } catch {
      owned = false;
    }
    this.store.setState((s) => ({ dlc: { ...s.dlc, owned } }));
    this.publishCityProgress();
    return owned;
  }

  openDlc() {
    this.audio.tick();
    this.store.setState((s) => ({ overlay: "dlc", overlayFrom: s.overlay === "dlc" ? s.overlayFrom : s.overlay, dlc: { ...s.dlc, error: null } }));
  }

  /** Buy the Riviera DLC (50 ZX Cash on Zero X). */
  async buyDlc() {
    if (this.store.getState().dlc.busy) return;
    this.store.setState((s) => ({ dlc: { ...s.dlc, busy: true, error: null } }));
    const r = await this.platform.buyDlc();
    const owned = r.ok || (await this.platform.dlcOwned().catch(() => false));
    this.store.setState({ dlc: { owned, busy: false, error: owned ? null : (r.error ?? "") } });
    if (owned) {
      this.audio.chime();
      this.toast(this.t("dlc.thanks"), undefined, "achievement");
      this.publishCityProgress();
      this.platform.track("dlc_buy", { id: "riviera" });
    } else this.audio.error();
  }

  /** Can this civic building go up now? Landmarks are one each, once unlocked. */
  canBuildService(kind: ServiceKind) {
    if (!isLandmark(kind)) return true;
    const st = this.store.getState().landmarks[kind];
    if (st === "ready") return true;
    if (st === "dlc") {
      this.openDlc();
      return false;
    }
    this.audio.error();
    this.toast(this.t(st === "built" ? "lm.built" : "lm.locked", { name: this.t(`svc.${kind}` as StringKey), ms: this.t(`ms.${MILESTONES[LANDMARK_UNLOCK[kind]].id}` as StringKey) }));
    return false;
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
    this.publishCityProgress();
  }

  async refreshLandValues() {
    if (!this.sim) return;
    const d = await this.sim.landData();
    this.lv = d.lv;
    this.cover = d.cover;
    this.overlayDirty = true;
  }

  /** New road states: redraw the roads whose look changed (worn further, works on or off). */
  private takeRoads(list: [number, number, number][]) {
    const look = (r: { c: number; works: number } | undefined) => (!r ? 0 : r.works > 0 ? 9 : r.c >= 0.75 ? 0 : r.c >= 0.5 ? 1 : r.c >= 0.3 ? 2 : 3);
    const redraw = new Set<number>();
    for (const [id, c, works] of list) {
      const before = look(this.roadStates.get(id));
      const r = { c, works };
      this.roadStates.set(id, r);
      if (look(r) !== before) redraw.add(id);
    }
    if (redraw.size && this.views && this.city) {
      for (const id of redraw) if (!this.city.roads.edges.has(id)) redraw.delete(id);
      this.views.roads.sync({ edges: redraw, removedEdges: new Set(), nodes: new Set() });
    }
    if (this.store.getState().tab === "land" && this.store.getState().landView === "roads") this.showRoadRibbons();
  }

  /** The road condition view: every road coloured from green (new) to red (broken), works in orange. */
  private showRoadRibbons() {
    const city = this.city;
    if (!city || !this.views) return;
    const on = this.store.getState().tab === "land" && this.store.getState().landView === "roads";
    if (!on) return this.views.overlays.setRibbons(null);
    const list = [...city.roads.edges.values()].map((e) => {
      const r = this.roadStates.get(e.id);
      const color = r && r.works > 0 ? "#ff8a1f" : rampColor(r ? r.c : 1);
      return { pts: e.pts, ys: (s: number) => city.roadY(e.id, s), color };
    });
    this.views.overlays.setRibbons(list);
  }

  /** Order roadworks on these roads (the Repair tool). Mayor mode pays a contractor by the metre. */
  repairRoads(ids: number[]) {
    const city = this.city;
    if (!city || !this.sim) return 0;
    const todo = ids.filter((id) => {
      const r = this.roadStates.get(id);
      return city.roads.edges.has(id) && !(r && (r.works > 0 || r.c > 0.97));
    });
    if (!todo.length) return 0;
    const cost = todo.reduce((n, id) => n + this.repairCost(id), 0);
    if (!this.canAfford(cost)) return 0;
    this.sim.repair(todo);
    this.charge(cost);
    for (const id of todo) this.roadStates.set(id, { c: this.roadStates.get(id)?.c ?? 1, works: 1 });
    this.views?.roads.sync({ edges: new Set(todo), removedEdges: new Set(), nodes: new Set() });
    this.audio.thud();
    return todo.length;
  }

  /** What resurfacing a road costs: per metre, less with a depot (and the transport minister's skill). */
  repairCost(id: number) {
    const e = this.city?.roads.edges.get(id);
    if (!e || !this.mayor) return 0;
    const L = cumulative(e.pts)[e.pts.length / 2 - 1];
    const depot = [...(this.city?.lots.services.values() ?? [])].some((s) => s.kind === "depot");
    return Math.round(L * (depot ? 5 : 9) * Pol.repairDiscount(this.politics!));
  }

  roadCondition(id: number) {
    return this.roadStates.get(id);
  }

  /** The Land tab's colour for a lot, by the chosen view. */
  private landColor(l: Lot) {
    const view = this.store.getState().landView;
    const m = this.cover.get(l.id) ?? 0;
    if (view === "pollution") return m & 32 ? "#e8553d" : "#3fbf7f";
    if (view === "fire") return m & 2 ? "#3fbf7f" : "#f5a524";
    if (view === "roads") return rampColor(this.roadStates.get(l.edge)?.c ?? 1);
    if (view === "services") {
      let n = 0;
      for (const bit of [1, 2, 4, 8, 16]) if (m & bit) n++;
      return rampColor(n / 5);
    }
    return rampColor(this.lv.get(l.id) ?? 0.3);
  }

  setLandView(view: "value" | "services" | "pollution" | "fire" | "roads") {
    this.store.setState({ landView: view });
    this.audio.tick();
    this.showRoadRibbons();
    void this.refreshLandValues();
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
        this.views.overlays.rebuildLots((l) => (this.buildings.get(l.id)?.progress ?? 0) >= 1, (l) => this.landColor(l));
      }
    }
    this.views.agents.update(now, s.traffic, s.pedestrians);
    this.views.overlays.setLook(st.tab === "zoning" || (st.tab === "bulldoze" && st.bulldozeMode === "zones"), this.engine.night);
    this.views.overlays.update(now / 1000);
    this.views.fires.update(now / 1000, this.engine.night);
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
      if (this.mayor && this.lastTick) this.politicsTick(this.lastTick.minutes, this.lastTick.stats);
      if (this.lastTick) this.onPopulation?.(this.lastTick.stats.population);
      if (now > this.autosaveAt) {
        this.autosaveAt = now + AUTOSAVE_MS;
        void this.save(true).then(() => this.toast(this.t("autosaved")));
      }
    }
  };

  // ------------------------------------------------------------ Mayor mode

  get mayor() {
    return !!this.politics && this.politics.status === "office" && this.store.getState().mode === "mayor";
  }

  money(n: number) {
    return `$${formatNumber(this.store.getState().lang, Math.round(n))}`;
  }

  /** Construction cost of a road along `pts` (bridges over water cost three times as much). */
  roadCost(pts: number[], type: RoadTypeId) {
    const city = this.city;
    if (!city || pts.length < 4) return 0;
    const cum = cumulative(pts);
    const L = cum[cum.length - 1];
    let wet = 0;
    const n = Math.max(2, Math.ceil(L / 8));
    for (let i = 0; i <= n; i++) {
      const s = (L * i) / n;
      let k = 1;
      while (k < cum.length - 1 && cum[k] < s) k++;
      const t = cum[k] > cum[k - 1] ? (s - cum[k - 1]) / (cum[k] - cum[k - 1]) : 0;
      const x = pts[(k - 1) * 2] + (pts[k * 2] - pts[(k - 1) * 2]) * t;
      const z = pts[(k - 1) * 2 + 1] + (pts[k * 2 + 1] - pts[(k - 1) * 2 + 1]) * t;
      if (city.terrain.isWater(x, z)) wet++;
    }
    const wetShare = wet / (n + 1);
    return Math.round(L * Pol.ROAD_COST[type] * (1 + 2 * wetShare));
  }

  serviceCost(kind: ServiceKind) {
    return this.mayor ? Pol.SERVICE_COST[kind].build : 0;
  }

  /** Can the city pay for this? In Sandbox, always. Says so (and buzzes) when it can't, unless quiet. */
  canAfford(cost: number, quiet = false) {
    if (!this.mayor || cost <= 0) return true;
    if (Pol.canAfford(this.politics!, cost)) return true;
    if (!quiet) {
      this.audio.error();
      this.toast(this.t("cantAfford"), this.money(cost));
    }
    return false;
  }

  /** Pay for construction (after the action is recorded for undo). */
  charge(cost: number) {
    if (!this.mayor || cost <= 0 || !this.city) return;
    this.politics!.cash -= cost;
    this.city.spent += cost;
    this.publishPolitics();
  }

  /** Undo/redo moved the city's spending: give the difference back (or take it). */
  private refund(before: number) {
    if (!this.politics || !this.city) return;
    this.politics.cash += before - this.city.spent;
    this.publishPolitics();
  }

  private facts(): Pol.CityFacts {
    const city = this.city!;
    if (this.roadKm.version !== city.version) {
      let m = 0;
      for (const e of city.roads.edges.values()) {
        const c = cumulative(e.pts);
        m += c[c.length - 1];
      }
      this.roadKm = { version: city.version, km: m / 1000 };
    }
    const services: Partial<Record<ServiceKind, number>> = {};
    for (const sv of city.lots.services.values()) services[sv.kind] = (services[sv.kind] ?? 0) + 1;
    let residents = 0;
    let cJobs = 0;
    let iJobs = 0;
    for (const b of this.buildings.values()) {
      if (b.progress < 1) continue;
      residents += b.residents;
      if (b.zone === "I") iJobs += b.workers;
      else cJobs += b.workers;
    }
    return { roadKm: this.roadKm.km, services, lines: city.lines.length, residents, cJobs, iJobs };
  }

  private politicsTick(minutes: number, stats: NonNullable<typeof this.lastTick>["stats"]) {
    const p = this.politics!;
    const policyBefore = JSON.stringify(Pol.simPolicy(p));
    const events = Pol.advance(p, minutes, stats, this.facts());
    for (const e of events) {
      if (e.t === "dilemma") {
        this.toast(this.t("n.decision"), this.t(`d.${e.id}.t` as StringKey));
        this.audio.chime();
      } else if (e.t === "campaign") this.toast(this.t("n.campaign"), this.t("campaignOn", { name: e.challenger }));
      else if (e.t === "broke") this.toast(this.t("treasury"), this.t("broke", { n: this.money(Pol.CREDIT) }));
      else if (e.t === "election") {
        // The chamber is chosen district by district.
        const d = Mandate.electDistricts(p, e.result, stats);
        const r = Parl.afterElection(p, e.result, stats, d.seats);
        Mandate.afterVote(p, d.results, minutes);
        this.electionNight(r);
      }
    }
    for (const e of Parl.parlHour(p, minutes, stats)) {
      if (e.t === "partnerLeft") {
        this.toast(this.t("pa.left", { party: this.t(`party.${e.party}` as StringKey) }));
        this.audio.error();
        Mandate.report(p, { m: minutes, k: "nw.left", v: { party: e.party }, tone: -1 });
      } else if (e.t === "scandal") {
        this.toast(this.t("pa.scandal", { name: e.name, ministry: this.t(`min.${e.ministry}` as StringKey) }));
        this.audio.chime();
        Mandate.report(p, { m: minutes, k: "nw.scandal", v: { name: e.name, ministry: e.ministry }, tone: -1 });
      }
    }
    for (const e of Mandate.mandateHour(p, minutes, stats, () => this.lotPoints())) {
      if (e.t === "defected") {
        this.toast(this.t("md.defected", { name: e.name, party: this.t(`party.${e.party}` as StringKey) }), e.seat ? this.t("md.seatLost") : undefined);
        this.audio.error();
      } else if (e.t === "noConfidence") {
        this.toast(this.t(e.passed ? "md.ncLost" : "md.ncWon", { n: e.against }));
        if (e.passed) this.audio.error();
        else this.audio.chime();
      } else if (e.t === "pollLead") this.toast(this.t("md.pollLead", { party: this.t(`party.${e.party}` as StringKey) }));
      else if (e.t === "redistricted") this.toast(this.t("md.mapDrawn", { n: e.n }));
    }
    if (JSON.stringify(Pol.simPolicy(p)) !== policyBefore) this.sim?.setSettings(this.simSettings());
    this.publishPolitics(stats);
  }

  /** Push a snapshot of the politics to the HUD. */
  publishPolitics(stats = this.lastTick?.stats) {
    const p = this.politics;
    if (!p || !this.city) return;
    const f = this.facts();
    const st = stats ?? null;
    const shares = st ? Pol.shares(st) : { workers: 0.2, business: 0.2, families: 0.2, greens: 0.2, seniors: 0.2 };
    const l = Pol.ledger(p, f);
    const minutes = this.lastTick?.minutes ?? this.store.getState().minutes;
    this.store.setState({
      politics: {
        cash: p.cash,
        net: Pol.net(l),
        ledger: l,
        taxes: { ...p.taxes },
        policies: [...p.policies],
        approval: { ...p.approval },
        shares,
        overall: Pol.overall(p.approval, shares),
        term: p.term,
        termLeft: Math.max(0, p.termStart + Pol.TERM_MINUTES - minutes),
        council: [...p.council],
        polls: p.polls,
        dilemma: p.dilemma,
        promise: p.promise,
        promiseKept: st ? Pol.promiseKept(p, st, f) : null,
        challenger: p.challenger,
        status: p.status,
        townHallReady: minutes - p.townHallAt >= 24 * 60,
        parl: {
          seats: { ...p.parl.seats },
          coalition: [...p.parl.coalition],
          relations: { ...p.parl.relations },
          capital: p.parl.capital,
          gov: Parl.govSeats(p),
          ministers: { ...p.parl.ministers },
          pool: [...p.parl.pool],
          draft: p.parl.bill ? { ...p.parl.bill, lobbied: [...p.parl.bill.lobbied], forecast: Parl.forecast(p, p.parl.bill.law, p.parl.bill.enable, p.parl.bill.lobbied) } : null,
          failed: p.parl.failed,
          canReferendum: !!p.parl.failed && p.parl.referendum !== p.term && p.parl.capital >= Parl.COST.referendum,
          demands: { ...p.parl.demands },
          campaign: { ...p.parl.campaign, rallies: [...p.parl.campaign.rallies], open: Parl.campaignOpen(p) },
          scandal: p.parl.scandal,
        },
        m: this.mandateView(st),
      },
    });
  }

  /** The Mandate app's snapshot. */
  private mandateView(st: NonNullable<typeof this.lastTick>["stats"] | null): import("./store").MandateView {
    const p = this.politics!;
    const m = p.m;
    const proj = Mandate.projection(p);
    const projected: Record<Pol.PartyId, number> = { civic: 0, labour: 0, enterprise: 0, green: 0, heritage: 0 };
    for (const r of proj) for (const x of Pol.PARTIES) projected[x] += r.seats[x];
    const districts: DistrictView[] = m.districts.map((d) => {
      const ds = m.dstats.find((x) => x.id === d.id);
      const r = proj.find((x) => x.id === d.id)!;
      return {
        ...d,
        pop: ds?.pop ?? 0,
        lots: ds?.lots ?? 0,
        mix: ds ? { ...ds.mix } : { workers: 0.2, business: 0.2, families: 0.2, greens: 0.2, seniors: 0.2 },
        share: r.share,
        projected: r.seats,
        winner: r.winner,
        effort: m.effort[d.id] ?? 0,
        office: m.offices.includes(d.id),
        ads: m.ads[d.id] ?? 0,
        workers: m.roster.filter((x) => x.district === d.id).map((x) => x.id),
      };
    });
    const bill = p.parl.bill;
    const fc = bill ? Parl.forecast(p, bill.law, bill.enable, bill.lobbied) : null;
    const yes = fc ? (Object.fromEntries(fc.votes.map((v) => [v.party, v.yes])) as Record<Pol.PartyId, number>) : null;
    const minutes = this.lastTick?.minutes ?? this.store.getState().minutes;
    return {
      platform: [...m.platform] as Mandate.Position,
      position: Mandate.governmentPosition(p),
      funds: m.funds,
      fundsNet: Mandate.fundsPerDay(p),
      members: Math.round(m.members),
      hq: { ...m.hq },
      roster: m.roster.map((x) => ({ ...x, minister: Pol.MINISTRIES.find((k) => p.parl.ministers[k]?.id === x.id + Mandate.ROSTER_ID) ?? null })),
      mps: m.mps.map((x) => ({ ...x })),
      districts,
      projected: m.districts.length ? projected : { ...p.parl.seats },
      poll: st ? Mandate.cityPoll(p, st) : { civic: 0.4, labour: 0.2, enterprise: 0.2, green: 0.1, heritage: 0.1 },
      polls: m.partyPolls,
      news: m.news,
      whip: m.whip,
      rebels: bill ? Mandate.rebels(p, bill.law, bill.enable).map((x) => x.id) : [],
      votes: bill && yes ? Mandate.memberVotes(p, bill.law, bill.enable, yes) : null,
      confidence: m.confidence,
      lastResults: m.lastResults,
      conferenceReady: m.conference !== p.term,
      galaReady: minutes - m.galaAt >= 24 * 60,
    };
  }

  /** Every plot as the electoral map sees it: where it is, how many live or work there, its zone. */
  private lotPoints(): Mandate.LotPoint[] {
    const out: Mandate.LotPoint[] = [];
    for (const l of this.city!.lots.lots.values()) {
      const b = this.buildings.get(l.id);
      out.push({ x: l.cx, z: l.cz, pop: b && b.progress >= 1 ? b.residents + b.workers : 0, zone: l.zone, tier: b?.tier ?? 1 });
    }
    return out;
  }

  /** The city for the Mandate map: roads as polylines, plots with their district. */
  mandateMap() {
    const city = this.city;
    const p = this.politics;
    if (!city || !p) return null;
    const roads: number[][] = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const e of city.roads.edges.values()) {
      roads.push(e.pts);
      for (let i = 0; i < e.pts.length; i += 2) {
        minX = Math.min(minX, e.pts[i]);
        maxX = Math.max(maxX, e.pts[i]);
        minZ = Math.min(minZ, e.pts[i + 1]);
        maxZ = Math.max(maxZ, e.pts[i + 1]);
      }
    }
    const lots: number[] = [];
    for (const l of city.lots.lots.values()) {
      const b = this.buildings.get(l.id);
      lots.push(l.cx, l.cz, p.m.districts.length ? Mandate.districtOf(p.m.districts, l.cx, l.cz) : -1, b && b.progress >= 1 ? 1 : 0);
    }
    return { roads, lots, bounds: { minX, maxX, minZ, maxZ } };
  }

  // ------------------------------------------------------------ the Mandate app

  openApp(page: AppPage | null) {
    if (page && !this.mayor) return;
    this.store.setState({ app: page, hall: null, statsOpen: false, noticesOpen: false, inspect: null });
    this.audio.tick();
  }
  recruit() {
    const r = this.parl((p) => Mandate.recruit(p));
    if (r) this.toast(this.t("md.recruited", { name: r.name }));
  }
  train(id: number, skill: "charisma" | "competence") {
    this.parl((p) => Mandate.train(p, id, skill));
  }
  expel(id: number) {
    this.parl((p) => Mandate.expel(p, id));
  }
  assignPolitician(id: number, district: number) {
    this.parl((p) => Mandate.assign(p, id, district));
  }
  upgradeHq(h: Mandate.Hq) {
    this.parl((p) => Mandate.upgrade(p, h));
  }
  canvass(district: number) {
    this.parl((p) => Mandate.canvass(p, district));
  }
  openOffice(district: number) {
    this.parl((p) => Mandate.openOffice(p, district));
  }
  districtAd(district: number) {
    this.parl((p) => Mandate.districtAd(p, district));
  }
  gala() {
    const minutes = this.lastTick?.minutes ?? this.store.getState().minutes;
    const n = this.parl((p) => Mandate.gala(p, minutes), (x) => x > 0);
    if (n) this.toast(this.t("md.galaRaised", { money: this.money(n) }));
  }
  conference(platform: Mandate.Position) {
    const minutes = this.lastTick?.minutes ?? this.store.getState().minutes;
    if (this.parl((p) => Mandate.conference(p, platform))) Mandate.report(this.politics!, { m: minutes, k: "nw.conference", tone: 1 });
    this.publishPolitics();
  }
  whip() {
    this.parl((p) => Mandate.whip(p));
  }
  appointOwn(ministry: Pol.Ministry, id: number) {
    this.parl((p) => Mandate.appointOwn(p, ministry, id, p.parl.ministers[ministry] ? Parl.COST.reshuffle : Parl.COST.appoint));
  }

  // ------------------------------------------------------------ parliament

  /** Run a parliament action, then refresh the sim (laws change it) and the HUD. */
  private parl<T>(fn: (p: Pol.PoliticsState) => T, ok: (r: T) => boolean = (r) => !!r) {
    if (!this.mayor) return null;
    const before = JSON.stringify(Pol.simPolicy(this.politics!));
    const r = fn(this.politics!);
    if (ok(r)) this.audio.click();
    else this.audio.error();
    if (JSON.stringify(Pol.simPolicy(this.politics!)) !== before) this.sim?.setSettings(this.simSettings());
    this.publishPolitics();
    return r;
  }

  draftBill(id: Pol.PolicyId, enable: boolean) {
    this.store.setState({ bill: null });
    this.parl((p) => (Parl.draftBill(p, id, enable), true));
  }
  cancelBill() {
    this.parl((p) => ((p.parl.bill = null), true));
  }
  lobby(party: Pol.PartyId) {
    this.parl((p) => Parl.lobby(p, party));
  }
  callVote() {
    const v = this.parl((p) => Parl.callVote(p), (r) => !!r?.passed);
    if (!v) return;
    Mandate.report(this.politics!, { m: this.store.getState().minutes, k: v.passed ? "nw.passed" : "nw.failed", v: { law: v.law, yes: v.yes, no: v.no }, tone: v.passed ? 1 : -1 });
    this.publishPolitics();
    this.store.setState({ bill: v });
    if (v.passed) this.audio.chime();
    this.platform.track("bill", { policy: v.law, enable: v.enable, passed: v.passed });
  }
  referendum() {
    const st = this.lastTick?.stats;
    if (!st) return;
    const r = this.parl((p) => Parl.referendum(p, st), (x) => !!x?.passed);
    if (!r) return;
    Mandate.report(this.politics!, { m: this.store.getState().minutes, k: r.passed ? "nw.refWon" : "nw.refLost", v: { law: r.law, n: Math.round(r.support * 100) }, tone: r.passed ? 1 : -1 });
    this.publishPolitics();
    this.store.setState({ bill: { law: r.law, enable: r.enable, passed: r.passed, yes: Math.round(r.support * 100), no: 100 - Math.round(r.support * 100), votes: [], referendum: true, support: r.support } });
    if (r.passed) this.audio.chime();
  }
  invite(party: Pol.PartyId) {
    const r = this.parl((p) => Parl.invite(p, party), (x) => !!x?.yes);
    if (r) this.toast(this.t(r.yes ? "pa.joined" : "pa.refused", { party: this.t(`party.${party}` as StringKey) }));
    if (r?.yes) {
      Mandate.report(this.politics!, { m: this.store.getState().minutes, k: "nw.joined", v: { party }, tone: 1 });
      this.publishPolitics();
    }
  }
  dropPartner(party: Pol.PartyId) {
    this.parl((p) => Parl.dropPartner(p, party));
  }
  appoint(ministry: Pol.Ministry, id: number) {
    this.parl((p) => Parl.appoint(p, ministry, id));
  }
  dismissMinister(ministry: Pol.Ministry) {
    this.parl((p) => Parl.dismiss(p, ministry));
  }
  resolveScandal(sack: boolean) {
    this.parl((p) => Parl.resolveScandal(p, sack));
  }
  rally(f: Pol.Faction) {
    this.parl((p) => Parl.rally(p, f));
  }
  adBlitz() {
    this.parl((p) => Parl.adBlitz(p));
  }
  debate() {
    const won = this.parl((p) => Parl.debate(p), (x) => x === true);
    if (won !== null && won !== undefined) this.toast(this.t(won ? "pa.debateWon" : "pa.debateLost"));
  }

  openHall(tab: HallTab | null) {
    this.store.setState({ hall: tab, app: null, bill: null, statsOpen: false, noticesOpen: false });
    this.audio.tick();
  }

  setTax(zone: keyof Pol.Taxes, rate: number) {
    if (!this.mayor) return;
    Pol.setTax(this.politics!, zone, rate);
    this.sim?.setSettings(this.simSettings());
    this.publishPolitics();
  }

  /** Put a law (or its repeal) before the chamber: it goes to the floor, where you can lobby before the vote. */
  proposePolicy(id: Pol.PolicyId, enable: boolean) {
    this.draftBill(id, enable);
  }

  decide(pick: "a" | "b") {
    if (!this.mayor) return;
    const c = Pol.decide(this.politics!, pick);
    if (!c) return;
    if (c.policy) this.sim?.setSettings(this.simSettings());
    this.audio.click();
    this.publishPolitics();
  }

  townHall() {
    if (!this.mayor) return;
    const minutes = this.lastTick?.minutes ?? this.store.getState().minutes;
    if (Pol.townHall(this.politics!, minutes)) {
      this.toast(this.t("townHallDone"));
      this.audio.chime();
    } else this.audio.error();
    this.publishPolitics();
  }

  promise(id: Pol.PromiseId) {
    if (!this.mayor || !this.city) return;
    const parks = [...this.city.lots.services.values()].filter((s) => s.kind === "park").length;
    if (Pol.makePromise(this.politics!, id, this.lastTick?.stats.population ?? 0, parks)) this.audio.click();
    this.publishPolitics();
  }

  private electionNight(result: Pol.ElectionResult) {
    this.speedBeforeElection = this.store.getState().speed || 1;
    this.sim?.setSpeed(0);
    this.store.setState({ election: result, speed: 0, hall: null, tab: null });
    this.tools.reset();
    if (result.won) {
      this.audio.chime();
      void this.achieve("reelected");
      if (result.share >= 0.65) void this.achieve("landslide");
    } else this.audio.error();
    this.platform.track("election", { won: result.won, share: Math.round(result.share * 100) });
    void this.save(true);
  }

  /** Close election night: a winner starts the next term; a loser keeps building in Sandbox. */
  afterElection() {
    const won = this.store.getState().election?.won;
    this.store.setState({ election: null });
    if (!won) this.store.setState({ mode: "sandbox", app: null });
    this.sim?.setSettings(this.simSettings());
    this.setSpeed(this.speedBeforeElection);
    this.publishPolitics();
  }

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
      this.showRoadRibbons();
    }
    this.tools.onTab(next);
    this.audio.tick();
  }

  tabByKey(n: number) {
    const tab = TABS[n - 1];
    if (tab) this.selectTab(tab);
  }

  undo() {
    const spent = this.city?.spent ?? 0;
    if (this.city?.undo()) {
      this.refund(spent);
      this.views?.roads.rebuildAll();
      this.views?.overlays.rebuildStops();
      this.worldChanged();
      this.audio.click();
    }
  }

  redo() {
    const spent = this.city?.spent ?? 0;
    if (this.city?.redo()) {
      this.refund(spent);
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
      gameMode: st.mode,
      cash: this.politics ? Math.round(this.politics.cash) : null,
      spent: this.city?.spent ?? 0,
      policies: this.politics?.policies ?? [],
      term: this.politics?.term ?? 0,
      bestPop: this.city?.bestPop ?? 0,
      milestone: this.store.getState().milestone.i,
      fires: this.lastTick?.fires.length ?? 0,
      tourists: this.lastTick?.stats.tourists ?? 0,
      services: [...(this.city?.lots.services.values() ?? [])].map((s) => s.kind),
      roadCondition: this.lastTick?.stats.roadCondition ?? 1,
      roadworks: this.lastTick?.stats.roadworks ?? 0,
      dlc: this.store.getState().dlc.owned,
      look: this.city?.map.look ?? "base",
      parl: this.politics ? { seats: this.politics.parl.seats, coalition: this.politics.parl.coalition, capital: this.politics.parl.capital } : null,
      mandate: this.politics ? { districts: this.politics.m.districts.length, funds: Math.round(this.politics.m.funds), roster: this.politics.m.roster.length, news: this.politics.m.news.length, hq: { ...this.politics.m.hq } } : null,
    };
  }

  /** Test hook: set a burning building going (the first finished one, or a given lot). */
  debugFire(lot?: number) {
    const id = lot ?? [...this.buildings.values()].find((b) => b.progress >= 1)?.lot;
    if (id === undefined) return false;
    this.sim?.ignite(id);
    return true;
  }

  /** Test hook: age every road to this condition. */
  debugWear(c: number) {
    this.sim?.wear(c);
  }

  /** Test hook: pretend the city has reached a population (milestones and landmarks). */
  debugBestPop(pop: number) {
    if (!this.city) return;
    this.checkMilestones(pop);
  }

  /** Test hook: bring the next dilemma or the election forward to the next game hour. */
  debugPolitics(what: "dilemma" | "election") {
    const p = this.politics;
    if (!p) return;
    const now = this.lastTick?.minutes ?? this.store.getState().minutes;
    if (what === "dilemma") {
      p.dilemma = null;
      p.nextDilemma = now;
    } else p.termStart = now - Pol.TERM_MINUTES + 30;
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
