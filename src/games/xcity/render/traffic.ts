import * as THREE from "three";
import { ROADS } from "../data";
import { pointAt } from "../geom";
import type { REdge, State } from "../state";
import { bikeGeometry, carGeometry, personGeometry, tramSection, vehicleMaterial } from "./kit";

/**
 * Life on the streets: cars driving on the right, bikes in the bike lanes, people on the
 * footpaths, and trams running their lines end to end, stopping at the stops. Numbers follow the
 * city: how many households there are and how they get about.
 */

interface Mover {
  e: number;
  dir: 1 | -1;
  s: number;
  v: number;
  /** Sideways offset from the centreline, to the right of travel. */
  off: number;
  kind: "car" | "bike" | "walk";
}

interface Tram {
  route: number;
  s: number;
  dir: 1 | -1;
  wait: number;
  secs: THREE.Mesh[];
}

interface Route {
  pts: number[];
  len: number;
  stops: number[];
}

const CAR_COLS = ["#f2f2f2", "#1d2026", "#8b9096", "#7a1d1d", "#1d3f7a", "#2f5a3a", "#c9b27a", "#b8c4cf", "#3a3a44", "#d0662b", "#e8e4d8", "#5a6470"];

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const pos = new THREE.Vector3();
const scl = new THREE.Vector3(1, 1, 1);

export class Traffic {
  readonly group = new THREE.Group();
  private cars: THREE.InstancedMesh;
  private bikes: THREE.InstancedMesh;
  private people: THREE.InstancedMesh;
  private movers: Mover[] = [];
  private trams: Tram[] = [];
  private routes: Route[] = [];
  private edges: REdge[] = [];
  private bikeEdges: REdge[] = [];
  private walkEdges: REdge[] = [];
  private sig = "";
  private tramGeo = [tramSection(false), tramSection(true)];
  private max: { car: number; bike: number; walk: number };

  constructor(quality: "low" | "medium" | "high") {
    this.max = quality === "low" ? { car: 160, bike: 40, walk: 80 } : quality === "medium" ? { car: 360, bike: 90, walk: 200 } : { car: 700, bike: 160, walk: 420 };
    this.cars = new THREE.InstancedMesh(carGeometry(), vehicleMaterial, this.max.car);
    this.bikes = new THREE.InstancedMesh(bikeGeometry(), vehicleMaterial, this.max.bike);
    this.people = new THREE.InstancedMesh(personGeometry(), vehicleMaterial, this.max.walk);
    for (const im of [this.cars, this.bikes, this.people]) {
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = quality === "high";
      this.group.add(im);
    }
    for (let i = 0; i < this.max.car; i++) this.cars.setColorAt(i, new THREE.Color(CAR_COLS[i % CAR_COLS.length]));
    const shirts = ["#d24a3a", "#3a6fd2", "#f2f2f2", "#2a2a2a", "#e0b020", "#3a9a5a", "#9a4ad2"];
    for (let i = 0; i < this.max.walk; i++) this.people.setColorAt(i, new THREE.Color(shirts[i % shirts.length]));
    for (let i = 0; i < this.max.bike; i++) this.bikes.setColorAt(i, new THREE.Color(shirts[(i * 3) % shirts.length]));
  }

  /** Pick up a changed network (call when the roads change). */
  sync(s: State) {
    const sig = s.edges.map((e) => (e ? `${e.id}${e.kind[0]}${e.bike ? "b" : ""}${e.tram ? "t" : ""}${e.conn ? "" : "x"}` : "")).join(",");
    if (sig === this.sig) return;
    this.sig = sig;
    this.edges = s.edges.filter((e): e is REdge => !!e && e.conn);
    this.bikeEdges = this.edges.filter((e) => e.bike);
    this.walkEdges = this.edges.filter((e) => e.kind !== "lane");
    // Drop movers on roads that are gone.
    this.movers = this.movers.filter((m) => {
      const e = s.edges[m.e];
      return e && e.conn && (m.kind !== "bike" || e.bike);
    });
    this.buildRoutes(s);
  }

  private pickEdge(list: REdge[]) {
    let total = 0;
    for (const e of list) total += e.len;
    let r = Math.random() * total;
    for (const e of list) {
      r -= e.len;
      if (r <= 0) return e;
    }
    return list[list.length - 1];
  }

  private spawn(kind: Mover["kind"]) {
    const list = kind === "car" ? this.edges : kind === "bike" ? this.bikeEdges : this.walkEdges;
    if (!list.length) return;
    const e = this.pickEdge(list);
    const R = ROADS[e.kind];
    const dir = Math.random() < 0.5 ? 1 : -1;
    let off = 0;
    let v = 0;
    if (kind === "car") {
      off = e.kind === "lane" ? 1.5 : e.kind === "street" ? 1.75 : Math.random() < 0.5 ? 2.6 : 6.1;
      v = R.speed * (0.8 + Math.random() * 0.35);
    } else if (kind === "bike") {
      off = R.carriage - 1.1;
      v = 5 + Math.random() * 1.5;
    } else {
      off = (R.half - 1.4) * (Math.random() < 0.5 ? 1 : -1) * dir;
      v = 1.2 + Math.random() * 0.4;
    }
    this.movers.push({ e: e.id, dir, s: Math.random() * e.len, v, off, kind });
  }

  /** Tram lines: each connected run of tram tracks becomes a line, end to end. */
  private buildRoutes(s: State) {
    for (const t of this.trams) for (const m of t.secs) this.group.remove(m);
    this.trams = [];
    this.routes = [];
    const tramEdges = s.edges.filter((e): e is REdge => !!e && e.tram);
    const seen = new Set<number>();
    const adj = (nid: number) => (s.nodes[nid]?.edges ?? []).map((id) => s.edges[id]!).filter((e) => e.tram);
    for (const e0 of tramEdges) {
      if (seen.has(e0.id)) continue;
      // Collect the component, then walk from one end to the far end.
      const comp = new Set<number>();
      const st = [e0.a];
      const nodes = new Set<number>([e0.a]);
      while (st.length) {
        const n = st.pop()!;
        for (const e of adj(n)) {
          comp.add(e.id);
          seen.add(e.id);
          const o = e.a === n ? e.b : e.a;
          if (!nodes.has(o)) {
            nodes.add(o);
            st.push(o);
          }
        }
      }
      const far = (from: number) => {
        const dist = new Map<number, number>([[from, 0]]);
        const prev = new Map<number, number>();
        const qq = [from];
        while (qq.length) {
          const n = qq.shift()!;
          for (const e of adj(n)) {
            const o = e.a === n ? e.b : e.a;
            if (dist.has(o)) continue;
            dist.set(o, dist.get(n)! + e.len);
            prev.set(o, e.id);
            qq.push(o);
          }
        }
        let best = from;
        for (const [n, d] of dist) if (d > dist.get(best)!) best = n;
        return { best, prev };
      };
      const a = far(e0.a).best;
      const { best: b, prev } = far(a);
      // Rebuild the path from b back to a.
      const path: number[] = [];
      let n = b;
      while (n !== a && prev.has(n)) {
        const eid = prev.get(n)!;
        path.unshift(eid);
        const e = s.edges[eid]!;
        n = e.a === n ? e.b : e.a;
      }
      const pts: number[] = [];
      let at = a;
      const stops: number[] = [0];
      let len = 0;
      for (const eid of path) {
        const e = s.edges[eid]!;
        const forward = e.a === at;
        const p = forward ? e.pts : rev(e.pts);
        for (let i = pts.length ? 2 : 0; i < p.length; i += 2) pts.push(p[i], p[i + 1]);
        len += e.len;
        stops.push(len);
        at = forward ? e.b : e.a;
      }
      if (len < 150) continue;
      const route = this.routes.length;
      this.routes.push({ pts, len, stops: stops.filter((x, i) => i === 0 || x - stops[i - 1] > 200 || i === stops.length - 1) });
      const count = Math.max(1, Math.min(6, Math.floor(len / 650)));
      for (let k = 0; k < count; k++) {
        const secs = [0, 1, 2].map((i) => {
          const m = new THREE.Mesh(this.tramGeo[i === 1 ? 1 : 0], vehicleMaterial);
          m.castShadow = true;
          this.group.add(m);
          return m;
        });
        this.trams.push({ route, s: (len * k) / count, dir: k % 2 ? -1 : 1, wait: 0, secs });
      }
    }
  }

  update(s: State, dt: number, cong: number) {
    // Keep the numbers in step with the city.
    const hh = s.households;
    const want = {
      car: Math.min(this.max.car, Math.round(20 + hh * s.modes.car * 0.07)),
      bike: this.bikeEdges.length ? Math.min(this.max.bike, Math.round(4 + hh * s.modes.bike * 0.12)) : 0,
      walk: Math.min(this.max.walk, Math.round(10 + hh * (s.modes.walk + s.modes.transit * 0.5) * 0.12)),
    };
    const have = { car: 0, bike: 0, walk: 0 };
    for (const m of this.movers) have[m.kind]++;
    for (const k of ["car", "bike", "walk"] as const) {
      for (let i = have[k]; i < want[k]; i += 1) {
        this.spawn(k);
        if (i - have[k] > 6) break;
      }
      if (have[k] > want[k] + 10) {
        const idx = this.movers.findIndex((m) => m.kind === k);
        if (idx >= 0) this.movers.splice(idx, 1);
      }
    }
    const slow = 1 / (1 + cong * 1.6);
    const counts = { car: 0, bike: 0, walk: 0 };
    for (const m of this.movers) {
      let e = s.edges[m.e];
      if (!e) continue;
      m.s += m.v * dt * m.dir * (m.kind === "car" ? slow : 1);
      if (m.s < 0 || m.s > e.len) {
        // At a junction: carry on down another road (back the way we came only at a dead end).
        const nid = m.s > e.len ? e.b : e.a;
        const node = s.nodes[nid];
        const opts = (node?.edges ?? []).map((id) => s.edges[id]!).filter((x) => x && x.conn && x.id !== e!.id && (m.kind !== "bike" || x.bike) && (m.kind !== "walk" || x.kind !== "lane"));
        const next = opts.length ? opts[Math.floor(Math.random() * opts.length)] : e;
        if (next === e) {
          m.dir = (m.dir * -1) as 1 | -1;
          m.s = Math.max(0, Math.min(e.len, m.s));
          if (m.kind === "walk") m.off = -m.off;
        } else {
          const atStart = next.a === nid;
          m.e = next.id;
          m.dir = atStart ? 1 : -1;
          m.s = atStart ? 0 : next.len;
          if (m.kind === "car" && next.kind !== e.kind) m.off = next.kind === "lane" ? 1.5 : next.kind === "street" ? 1.75 : 2.6;
          if (m.kind === "car") m.v = ROADS[next.kind].speed * (0.8 + Math.random() * 0.35);
          if (m.kind === "walk") m.off = Math.sign(m.off || 1) * (ROADS[next.kind].half - 1.4);
          if (m.kind === "bike") m.off = ROADS[next.kind].carriage - 1.1;
        }
        e = s.edges[m.e]!;
      }
      const p = pointAt(e.pts, m.s);
      const tx = p.dx * m.dir;
      const tz = p.dz * m.dir;
      // Right of travel is (-tz, tx).
      const off = m.kind === "walk" ? m.off * m.dir : m.off;
      pos.set(p.x - tz * off, m.kind === "walk" ? 0.17 : 0.1, p.z + tx * off);
      q.setFromAxisAngle(up, -Math.atan2(tz, tx));
      m4.compose(pos, q, scl);
      const im = m.kind === "car" ? this.cars : m.kind === "bike" ? this.bikes : this.people;
      const i = counts[m.kind]++;
      if (i < im.instanceMatrix.count) im.setMatrixAt(i, m4);
    }
    this.cars.count = Math.min(counts.car, this.max.car);
    this.bikes.count = Math.min(counts.bike, this.max.bike);
    this.people.count = Math.min(counts.walk, this.max.walk);
    for (const im of [this.cars, this.bikes, this.people]) im.instanceMatrix.needsUpdate = true;
    // Trams.
    for (const t of this.trams) {
      const r = this.routes[t.route];
      if (!r) continue;
      if (t.wait > 0) t.wait -= dt;
      else {
        const before = t.s;
        t.s += 11 * dt * t.dir;
        for (const st of r.stops)
          if ((before - st) * (t.s - st) <= 0 && Math.abs(before - st) > 0.01) {
            t.s = st;
            t.wait = 7;
          }
        if (t.s >= r.len || t.s <= 0) {
          t.s = Math.max(0, Math.min(r.len, t.s));
          t.dir = (t.dir * -1) as 1 | -1;
          t.wait = 10;
        }
      }
      const L = 10.6;
      for (let k = 0; k < 3; k++) {
        const c = t.s - t.dir * (k - 1) * L;
        const a = pointAt(r.pts, Math.max(0, Math.min(r.len, c + 4)));
        const b = pointAt(r.pts, Math.max(0, Math.min(r.len, c - 4)));
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        const l = Math.hypot(dx, dz) || 1;
        const tx = (dx / l) * t.dir;
        const tz = (dz / l) * t.dir;
        const off = 2.6;
        const m = t.secs[k];
        m.position.set((a.x + b.x) / 2 - tz * off, 0.1, (a.z + b.z) / 2 + tx * off);
        m.rotation.y = -Math.atan2(tz, tx);
      }
    }
  }

  dispose() {
    for (const im of [this.cars, this.bikes, this.people]) {
      im.geometry.dispose();
      im.dispose();
    }
    for (const g of this.tramGeo) g.dispose();
  }
}

function rev(p: number[]) {
  const out: number[] = [];
  for (let i = p.length - 2; i >= 0; i -= 2) out.push(p[i], p[i + 1]);
  return out;
}
