import * as THREE from "three";
import type { City } from "../world/city";
import { merge, paint } from "./terrainView";

const CAR_COLOURS = ["#e8e8e2", "#1f1f22", "#8d949b", "#b8231f", "#1f4f9a", "#2f7a3f", "#d9a62b", "#5b3b8a", "#c46a2a", "#4a5a6a", "#ece0c8", "#7a1c2c"];
const LINE_COLOURS = ["#22e5ff", "#ff5a5f", "#ffd166", "#8b5cff", "#4ade80", "#ff8fab"];
const SHIRTS = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71", "#9b59b6", "#ecf0f1", "#34495e", "#e67e22", "#1abc9c", "#ff8fab"];

function vehicle(len: number, wid: number, h: number, kind: "car" | "van" | "pickup" | "bus" | "truck") {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.BoxGeometry(len, h * 0.55, wid).translate(0, 0.35 + h * 0.275, 0);
  paint(body, "#ffffff");
  parts.push(body);
  if (kind === "car") {
    parts.push(paint(new THREE.BoxGeometry(len * 0.55, h * 0.42, wid * 0.88).translate(-len * 0.05, 0.35 + h * 0.55 + h * 0.21, 0), "#ffffff"));
    parts.push(paint(new THREE.BoxGeometry(len * 0.5, h * 0.3, wid * 0.9).translate(-len * 0.05, 0.35 + h * 0.6 + h * 0.15, 0), "#1c2530"));
  } else if (kind === "pickup") {
    parts.push(paint(new THREE.BoxGeometry(len * 0.4, h * 0.45, wid * 0.92).translate(len * 0.12, 0.35 + h * 0.55 + h * 0.22, 0), "#ffffff"));
    parts.push(paint(new THREE.BoxGeometry(len * 0.36, h * 0.3, wid * 0.94).translate(len * 0.12, 0.35 + h * 0.6 + h * 0.15, 0), "#1c2530"));
  } else if (kind === "van") {
    parts.push(paint(new THREE.BoxGeometry(len * 0.92, h * 0.42, wid).translate(-len * 0.03, 0.35 + h * 0.55 + h * 0.21, 0), "#ffffff"));
    parts.push(paint(new THREE.BoxGeometry(len * 0.2, h * 0.3, wid * 1.01).translate(len * 0.33, 0.35 + h * 0.62 + h * 0.15, 0), "#1c2530"));
  } else if (kind === "bus") {
    parts.push(paint(new THREE.BoxGeometry(len, h * 0.45, wid).translate(0, 0.35 + h * 0.55 + h * 0.225, 0), "#ffffff"));
    parts.push(paint(new THREE.BoxGeometry(len * 0.96, h * 0.3, wid * 1.01).translate(0, 0.35 + h * 0.68, 0), "#1c2530"));
  } else {
    parts.push(paint(new THREE.BoxGeometry(len * 0.26, h * 0.5, wid).translate(len * 0.37, 0.35 + h * 0.55 + h * 0.25, 0), "#ffffff"));
    parts.push(paint(new THREE.BoxGeometry(len * 0.7, h * 0.85, wid * 1.02).translate(-len * 0.14, 0.35 + h * 0.5, 0), "#d8d8d2"));
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) parts.push(paint(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 8).rotateX(Math.PI / 2).translate(sx * len * 0.32, 0.36, sz * wid * 0.45), "#151515"));
  // Head and tail lights.
  parts.push(paint(new THREE.BoxGeometry(0.06, 0.18, wid * 0.8).translate(len / 2, 0.35 + h * 0.4, 0), "#fff6d8"));
  parts.push(paint(new THREE.BoxGeometry(0.06, 0.16, wid * 0.8).translate(-len / 2, 0.35 + h * 0.4, 0), "#b3201a"));
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
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 });
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
