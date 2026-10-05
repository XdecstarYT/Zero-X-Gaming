import type { FromSim, ToSim } from "./runner";
import type { SimSave, SimSettings, SimWorld } from "./sim";

/**
 * The main thread's handle on the simulation: a Web Worker when the browser
 * allows it, otherwise the same loop on the main thread.
 */
export class SimHost {
  private worker: Worker | null = null;
  private local: { handle: (m: ToSim) => void; dispose: () => void } | null = null;
  private waiting = new Map<number, (v: unknown) => void>();
  private nextId = 1;
  readonly threaded: boolean;

  constructor(private onTick: (m: Extract<FromSim, { t: "tick" }>) => void) {
    let w: Worker | null = null;
    try {
      w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<FromSim>) => this.receive(e.data);
      w.onerror = (e) => {
        e.preventDefault();
        this.fallback();
      };
    } catch {
      w = null;
    }
    this.worker = w;
    this.threaded = !!w;
    if (!w) this.fallback();
  }

  private pendingInit: ToSim | null = null;

  private fallback() {
    if (this.local) return;
    this.worker?.terminate();
    this.worker = null;
    void import("./runner").then(({ createRunner }) => {
      this.local = createRunner((m) => this.receive(m));
      if (this.pendingInit) this.local.handle(this.pendingInit);
      for (const m of this.queue) this.local.handle(m);
      this.queue = [];
    });
  }

  private queue: ToSim[] = [];

  private send(m: ToSim) {
    if (m.t === "init") this.pendingInit = m;
    if (this.worker) this.worker.postMessage(m);
    else if (this.local) this.local.handle(m);
    else if (m.t !== "init") this.queue.push(m);
  }

  private receive(m: FromSim) {
    if (m.t === "tick") this.onTick(m);
    else {
      const cb = this.waiting.get(m.id);
      if (cb) {
        this.waiting.delete(m.id);
        cb(m);
      }
    }
  }

  private ask<T>(m: (id: number) => ToSim): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve) => {
      this.waiting.set(id, resolve as (v: unknown) => void);
      this.send(m(id));
      setTimeout(() => {
        if (this.waiting.delete(id)) resolve(null as T);
      }, 3000);
    });
  }

  init(world: SimWorld, save: SimSave | null, settings: SimSettings) {
    this.send({ t: "init", world, save, settings });
  }
  setWorld(world: SimWorld) {
    this.send({ t: "world", world });
  }
  setSpeed(v: number) {
    this.send({ t: "speed", v });
  }
  setSettings(s: SimSettings) {
    this.send({ t: "settings", s });
  }
  demolish(lots: number[]) {
    this.send({ t: "demolish", lots });
  }
  async save(): Promise<SimSave | null> {
    const r = await this.ask<Extract<FromSim, { t: "saved" }> | null>((id) => ({ t: "save", id }));
    return r?.save ?? null;
  }
  async route(car: number) {
    const r = await this.ask<Extract<FromSim, { t: "route" }> | null>((id) => ({ t: "route", id, car }));
    return r?.route ?? null;
  }
  async landValues() {
    return (await this.landData()).lv;
  }
  /** Land value and service coverage per lot (for the info views). */
  async landData() {
    const r = await this.ask<Extract<FromSim, { t: "lv" }> | null>((id) => ({ t: "lv", id }));
    return { lv: new Map(r?.lv ?? []), cover: new Map(r?.cover ?? []) };
  }
  ignite(lot: number) {
    this.send({ t: "ignite", lot });
  }
  dispose() {
    this.send({ t: "stop" });
    this.worker?.terminate();
    this.local?.dispose();
  }
}
