import * as THREE from "three";
import type { City } from "../world/city";
import { merge, paint } from "./terrainView";

const CAR_COLOURS = ["#e8e8e2", "#1f1f22", "#8d949b", "#b8231f", "#1f4f9a", "#2f7a3f", "#d9a62b", "#5b3b8a", "#c46a2a", "#4a5a6a", "#ece0c8", "#7a1c2c"];
const LINE_COLOURS = ["#22e5ff", "#ff5a5f", "#ffd166", "#8b5cff", "#4ade80", "#ff8fab"];
const SHIRTS = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71", "#9b59b6", "#ecf0f1", "#34495e", "#e67e22", "#1abc9c", "#ff8fab"];

/** A side profile (x along the car, y up) extruded across its width, with softened edges. */
function slab(profile: [number, number][], width: number, color: string, bevel = 0.05) {
  const sh = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.01, width - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  paint(g, color);
  return g;
}

const GLASS = "#1b232c";
const TRIM = "#2a2c30";

function wheels(len: number, wid: number, r: number, axles: number[]) {
  const out: THREE.BufferGeometry[] = [];
  for (const ax of axles)
    for (const sz of [-1, 1]) {
      out.push(paint(new THREE.CylinderGeometry(r, r, 0.24, 12).rotateX(Math.PI / 2).translate(ax * len, r, sz * (wid / 2 - 0.1)), "#141414"));
      out.push(paint(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.26, 10).rotateX(Math.PI / 2).translate(ax * len, r, sz * (wid / 2 - 0.09)), "#9a9ea3"));
    }
  return out;
}

function lights(len: number, wid: number, y: number) {
  return [
    paint(new THREE.BoxGeometry(0.05, 0.16, wid * 0.22).translate(len / 2 + 0.01, y, wid * 0.3), "#fff6d8"),
    paint(new THREE.BoxGeometry(0.05, 0.16, wid * 0.22).translate(len / 2 + 0.01, y, -wid * 0.3), "#fff6d8"),
    paint(new THREE.BoxGeometry(0.05, 0.14, wid * 0.24).translate(-len / 2 - 0.01, y + 0.04, wid * 0.3), "#b3201a"),
    paint(new THREE.BoxGeometry(0.05, 0.14, wid * 0.24).translate(-len / 2 - 0.01, y + 0.04, -wid * 0.3), "#b3201a"),
  ];
}

/** Low-poly but properly shaped vehicles: bodies, glasshouses, wheels and lights (white parts take the paint colour). */
function vehicle(len: number, wid: number, h: number, kind: "car" | "van" | "pickup" | "bus" | "truck") {
  const L = len / 2;
  const parts: THREE.BufferGeometry[] = [];
  if (kind === "car") {
    parts.push(slab([[-L, 0.32], [L, 0.32], [L, 0.72], [L - 0.25, 0.86], [L * 0.28, 0.93], [-L * 0.62, 0.96], [-L, 0.9]], wid, "#ffffff", 0.08));
    parts.push(slab([[L * 0.3, 0.9], [L * 0.04, h], [-L * 0.46, h], [-L * 0.7, 0.93]], wid * 0.86, GLASS, 0.04));
    parts.push(slab([[L * 0.05, h - 0.06], [L * 0.05, h + 0.02], [-L * 0.45, h + 0.02], [-L * 0.45, h - 0.06]], wid * 0.88, "#ffffff", 0.03));
    parts.push(...wheels(len, wid, 0.34, [0.31, -0.31]), ...lights(len, wid, 0.68));
  } else if (kind === "pickup") {
    parts.push(slab([[-L, 0.38], [L, 0.38], [L, 0.8], [L - 0.25, 0.95], [L * 0.38, 1.0], [-L, 1.0]], wid, "#ffffff", 0.07));
    parts.push(slab([[L * 0.38, 0.97], [L * 0.2, h], [-L * 0.2, h], [-L * 0.2, 0.97]], wid * 0.9, GLASS, 0.04));
    parts.push(slab([[L * 0.2, h - 0.05], [L * 0.2, h + 0.03], [-L * 0.2, h + 0.03], [-L * 0.2, h - 0.05]], wid * 0.92, "#ffffff", 0.03));
    parts.push(paint(new THREE.BoxGeometry(L * 0.78, 0.08, wid * 0.86).translate(-L * 0.6, 0.98, 0), TRIM));
    parts.push(...wheels(len, wid, 0.4, [0.32, -0.3]), ...lights(len, wid, 0.75));
  } else if (kind === "van") {
    parts.push(slab([[-L, 0.38], [L, 0.38], [L, 0.95], [L - 0.5, h * 0.62], [L - 0.85, h], [-L, h]], wid, "#ffffff", 0.1));
    parts.push(slab([[L - 0.05, 1.0], [L - 0.5, h * 0.6], [L - 0.86, h * 0.95], [L - 0.86, 1.0]], wid * 1.01, GLASS, 0.02));
    parts.push(paint(new THREE.BoxGeometry(len * 0.45, 0.45, wid * 1.01).translate(L * 0.05, h * 0.72, 0), GLASS));
    parts.push(...wheels(len, wid, 0.38, [0.33, -0.32]), ...lights(len, wid, 0.8));
  } else if (kind === "bus") {
    parts.push(slab([[-L, 0.35], [L, 0.35], [L, h - 0.15], [L - 0.15, h], [-L, h]], wid, "#ffffff", 0.12));
    parts.push(paint(new THREE.BoxGeometry(len * 0.92, h * 0.34, wid * 1.01).translate(-0.1, h * 0.62, 0), GLASS));
    parts.push(paint(new THREE.BoxGeometry(0.05, h * 0.5, wid * 0.86).translate(L + 0.03, h * 0.6, 0), GLASS));
    parts.push(paint(new THREE.BoxGeometry(len * 0.3, 0.3, wid * 0.6).translate(-L * 0.3, h + 0.12, 0), "#d8d8d2"));
    parts.push(...wheels(len, wid, 0.48, [0.36, -0.3]), ...lights(len, wid, 0.75));
  } else {
    // Truck: a cab and a box body.
    parts.push(slab([[L * 0.42, 0.45], [L, 0.45], [L, h * 0.78], [L - 0.2, h * 0.85], [L * 0.42, h * 0.85]], wid, "#ffffff", 0.1));
    parts.push(slab([[L - 0.04, h * 0.5], [L - 0.2, h * 0.8], [L * 0.6, h * 0.8], [L * 0.6, h * 0.5]], wid * 1.01, GLASS, 0.02));
    parts.push(paint(new THREE.BoxGeometry(len * 0.68, h * 0.86, wid * 1.02).translate(-L * 0.3, 0.45 + h * 0.43, 0), "#d8d8d2"));
    parts.push(paint(new THREE.BoxGeometry(len, 0.18, wid * 0.7).translate(0, 0.5, 0), TRIM));
    parts.push(...wheels(len, wid, 0.48, [0.33, -0.2, -0.35]), ...lights(len, wid, 0.85));
  }
  return merge(parts);
}

function person() {
  return merge([
    paint(new THREE.BoxGeometry(0.34, 0.85, 0.22).translate(0, 0.43, 0), "#2c3440"),
    paint(new THREE.BoxGeometry(0.44, 0.62, 0.26).translate(0, 1.16, 0), "#ffffff"),
    paint(new THREE.SphereGeometry(0.15, 8, 6).translate(0, 1.6, 0), "#d9a77f"),
  ]);
}

/** Interpolated, instanced cars, buses and people. */
export class AgentView {
  readonly group = new THREE.Group();
  private vehicles: THREE.InstancedMesh[];
  private people: THREE.InstancedMesh;
  private prevCars = new Map<number, number>();
  private curCars: Float32Array = new Float32Array(0);
  private prevCarBuf: Float32Array = new Float32Array(0);
  private prevPeds = new Map<number, number>();
  private curPeds: Float32Array = new Float32Array(0);
  private prevPedBuf: Float32Array = new Float32Array(0);
  private arrived = 0;
  private interval = 100;
  /** Instance → agent id, per vehicle type. */
  private ids: number[][] = [[], [], [], [], []];
  selected = -1;
  private mtx = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private Y = new THREE.Vector3(0, 1, 0);

  constructor(private city: () => City) {
    // Glossy paint with a clear coat: it picks up the sky and the sun like real cars do.
    const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 1.1 });
    const geos = [vehicle(4.5, 1.85, 1.45, "car"), vehicle(5.1, 2.0, 2.1, "van"), vehicle(5.3, 1.95, 1.7, "pickup"), vehicle(11.5, 2.6, 2.9, "bus"), vehicle(8.4, 2.5, 3.1, "truck")];
    this.vehicles = geos.map((g, i) => {
      const m = new THREE.InstancedMesh(g, mat, i === 3 ? 256 : 2048);
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color());
      m.userData.vehicle = i;
      this.group.add(m);
      return m;
    });
    this.people = new THREE.InstancedMesh(person(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), 2048);
    this.people.count = 0;
    this.people.frustumCulled = false;
    this.people.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.people.setColorAt(0, new THREE.Color());
    this.group.add(this.people);
  }

  /** A new simulation tick arrived. */
  push(cars: Float32Array, peds: Float32Array, now: number) {
    this.interval = this.arrived ? Math.min(300, Math.max(40, now - this.arrived)) : 100;
    this.arrived = now;
    this.prevCarBuf = this.curCars;
    this.prevCars = indexBy(this.curCars, 8);
    this.curCars = cars;
    this.prevPedBuf = this.curPeds;
    this.prevPeds = indexBy(this.curPeds, 7);
    this.curPeds = peds;
  }

  private y(ref: number, s: number) {
    const c = this.city();
    if (ref > 0) return c.roadY(ref, s);
    const n = c.roads.nodes.get(-ref);
    return n ? c.nodeY(-ref) : 0;
  }

  update(now: number, showCars: boolean, showPeds: boolean) {
    const a = Math.min(1, (now - this.arrived) / this.interval);
    for (const ids of this.ids) ids.length = 0;
    const counts = [0, 0, 0, 0, 0];
    const col = new THREE.Color();
    const c = this.curCars;
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    if (showCars) {
      for (let k = 0; k < c.length; k += 8) {
        const id = c[k];
        let x = c[k + 1];
        let z = c[k + 2];
        let ang = c[k + 3];
        const p = this.prevCars.get(id);
        if (p !== undefined) {
          const pb = this.prevCarBuf;
          x = pb[p + 1] + (x - pb[p + 1]) * a;
          z = pb[p + 2] + (z - pb[p + 2]) * a;
          let d = ang - pb[p + 3];
          d = Math.atan2(Math.sin(d), Math.cos(d));
          ang = pb[p + 3] + d * a;
        }
        const type = c[k + 4];
        const m = this.vehicles[type];
        if (!m || counts[type] >= m.instanceMatrix.count) continue;
        const i = counts[type]++;
        this.q.setFromAxisAngle(this.Y, -ang);
        pos.set(x, this.y(c[k + 6], c[k + 7]), z);
        this.mtx.compose(pos, this.q, scale);
        m.setMatrixAt(i, this.mtx);
        col.set(type === 3 ? LINE_COLOURS[(c[k + 5] - 12 + 600) % 6] : CAR_COLOURS[c[k + 5] % CAR_COLOURS.length]);
        if (id === this.selected) col.lerp(new THREE.Color("#4ade80"), 0.6);
        m.setColorAt(i, col);
        this.ids[type].push(id);
      }
    }
    this.vehicles.forEach((m, t) => {
      m.count = counts[t];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
    let n = 0;
    const pp = this.curPeds;
    if (showPeds) {
      for (let k = 0; k < pp.length && n < this.people.instanceMatrix.count; k += 7) {
        const id = pp[k];
        let x = pp[k + 1];
        let z = pp[k + 2];
        const p = this.prevPeds.get(id);
        if (p !== undefined) {
          const pb = this.prevPedBuf;
          x = pb[p + 1] + (x - pb[p + 1]) * a;
          z = pb[p + 2] + (z - pb[p + 2]) * a;
        }
        const ref = pp[k + 5];
        let y = ref > 0 ? this.y(ref, pp[k + 6]) + 0.18 : this.y(ref, 0) + 0.03;
        y += Math.abs(Math.sin(now * 0.012 + id)) * 0.05;
        this.q.setFromAxisAngle(this.Y, -pp[k + 3]);
        pos.set(x, y, z);
        this.mtx.compose(pos, this.q, scale);
        this.people.setMatrixAt(n, this.mtx);
        col.set(SHIRTS[pp[k + 4] % SHIRTS.length]);
        this.people.setColorAt(n, col);
        n++;
      }
    }
    this.people.count = n;
    this.people.instanceMatrix.needsUpdate = true;
    if (this.people.instanceColor) this.people.instanceColor.needsUpdate = true;
  }

  /** Which vehicle is under the ray, if any. */
  pick(ray: THREE.Raycaster) {
    const hits = ray.intersectObjects(this.vehicles, false);
    for (const h of hits) {
      const type = (h.object as THREE.InstancedMesh).userData.vehicle as number;
      if (h.instanceId !== undefined) return this.ids[type][h.instanceId];
    }
    return -1;
  }

  /** Position of an agent (to follow it). */
  where(id: number) {
    const c = this.curCars;
    for (let k = 0; k < c.length; k += 8) if (c[k] === id) return new THREE.Vector3(c[k + 1], this.y(c[k + 6], c[k + 7]), c[k + 2]);
    return null;
  }

  setShadows(on: boolean) {
    for (const m of this.vehicles) m.castShadow = on;
  }

  dispose() {
    for (const m of this.vehicles) {
      m.geometry.dispose();
      m.dispose();
    }
    this.people.geometry.dispose();
    this.people.dispose();
  }
}

function indexBy(buf: Float32Array, stride: number) {
  const m = new Map<number, number>();
  for (let k = 0; k < buf.length; k += stride) m.set(buf[k], k);
  return m;
}
