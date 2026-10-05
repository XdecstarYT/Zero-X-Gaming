import { TICK_HZ } from "../config";
import { Sim, type SimSave, type SimSettings, type SimWorld } from "./sim";

export type ToSim =
  | { t: "init"; world: SimWorld; save: SimSave | null; settings: SimSettings }
  | { t: "world"; world: SimWorld }
  | { t: "speed"; v: number }
  | { t: "settings"; s: SimSettings }
  | { t: "save"; id: number }
  | { t: "route"; id: number; car: number }
  | { t: "lv"; id: number }
  | { t: "demolish"; lots: number[] }
  | { t: "ignite"; lot: number }
  | { t: "stop" };

export type FromSim =
  | {
      t: "tick";
      minutes: number;
      stats: Sim["stats"];
      notices: Sim["notices"];
      changed: ReturnType<Sim["drainChanges"]>["changed"];
      removed: number[];
      cars: Float32Array;
      peds: Float32Array;
      fires: [number, number, number][];
      events: Sim["events"];
    }
  | { t: "saved"; id: number; save: SimSave }
  | { t: "route"; id: number; route: ReturnType<Sim["routeOf"]> }
  | { t: "lv"; id: number; lv: [number, number][]; cover: [number, number][] };

/** The simulation loop, shared by the Web Worker and the main-thread fallback. */
export function createRunner(post: (m: FromSim, transfer?: Transferable[]) => void) {
  const sim = new Sim();
  let speed = 1;
  let last = Date.now();
  let started = false;
  const timer = setInterval(() => {
    if (!started) return;
    const now = Date.now();
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    sim.step(dt, speed);
    const ch = sim.drainChanges();
    const cars = sim.carBuffer();
    const peds = sim.pedBuffer();
    post({ t: "tick", minutes: sim.minutes, stats: sim.stats, notices: sim.notices, changed: ch.changed, removed: ch.removed, cars, peds, fires: sim.fireList(), events: sim.drainEvents() }, [cars.buffer, peds.buffer]);
  }, 1000 / TICK_HZ);
  return {
    handle(m: ToSim) {
      switch (m.t) {
        case "init":
          sim.load(m.save);
          sim.settings = m.settings;
          sim.setWorld(m.world);
          started = true;
          last = Date.now();
          break;
        case "world":
          sim.setWorld(m.world);
          break;
        case "speed":
          speed = m.v;
          break;
        case "settings":
          sim.settings = m.s;
          break;
        case "save":
          post({ t: "saved", id: m.id, save: sim.save() });
          break;
        case "route":
          post({ t: "route", id: m.id, route: sim.routeOf(m.car) });
          break;
        case "lv":
          post({ t: "lv", id: m.id, lv: [...sim.landValues()], cover: [...sim.coverage()] });
          break;
        case "demolish":
          sim.demolish(m.lots);
          break;
        case "ignite":
          sim.ignite(m.lot);
          break;
        case "stop":
          clearInterval(timer);
          break;
      }
    },
    dispose() {
      clearInterval(timer);
    },
  };
}
