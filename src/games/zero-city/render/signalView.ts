import * as THREE from "three";
import { cumulative, sampleAt } from "../core/geom";
import type { City } from "../world/city";
import { halfWidth, LANE, ROAD_TYPES, stopSetback } from "../world/roads";
import { merge, paint } from "./terrainView";

const MAX = 1024;
const LIT = [new THREE.Color("#3dff7a"), new THREE.Color("#ffb020"), new THREE.Color("#ff2a1a")];
const DIM = [new THREE.Color("#0b2414"), new THREE.Color("#2a1d05"), new THREE.Color("#2a0806")];

/** A mast pole with an arm over the lanes and a signal head at its end (local +x across the road, +z with traffic). */
function mast(arm: number) {
  const parts = [
    paint(new THREE.CylinderGeometry(0.13, 0.17, 6.2, 8).translate(0, 3.1, 0), "#3a3f45"),
    paint(new THREE.BoxGeometry(arm, 0.16, 0.16).translate(arm / 2, 5.9, 0), "#3a3f45"),
    // Head: a dark box with a backplate.
    paint(new THREE.BoxGeometry(0.42, 1.2, 0.34).translate(arm - 0.2, 5.15, 0), "#16191d"),
    paint(new THREE.BoxGeometry(0.7, 1.45, 0.05).translate(arm - 0.2, 5.15, 0.19), "#202428"),
    // A push-button box for pedestrians.
    paint(new THREE.BoxGeometry(0.16, 0.24, 0.14).translate(0, 1.1, -0.17), "#d9b02a"),
  ];
  return merge(parts);
}

/** One lamp (instanced three times per head: red on top, amber, green). */
function lamp() {
  return new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12).rotateX(Math.PI / 2);
}

interface Head {
  key: string;
  /** Pole base, arm direction and travel direction. */
  m: THREE.Matrix4;
  arm: number;
}

/** Traffic lights at signalised junctions, lit from the sim's signal states. */
export class SignalView {
  readonly group = new THREE.Group();
  private poles: THREE.InstancedMesh[] = [];
  private lamps: THREE.InstancedMesh;
  private heads = new Map<string, Head>();
  private order: string[] = [];
  private version = -1;
  private keys = "";
  private mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 });
  /** Arm lengths are bucketed so each bucket shares one instanced mesh. */
  private static ARMS = [2.5, 4, 5.5, 7, 8.5, 10];

  constructor(private city: () => City) {
    for (const a of SignalView.ARMS) {
      const m = new THREE.InstancedMesh(mast(a), this.mat, MAX);
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      this.poles.push(m);
      this.group.add(m);
    }
    this.lamps = new THREE.InstancedMesh(lamp(), new THREE.MeshBasicMaterial({ toneMapped: false }), MAX * 3);
    this.lamps.count = 0;
    this.lamps.frustumCulled = false;
    this.lamps.setColorAt(0, new THREE.Color());
    this.group.add(this.lamps);
  }

  /** Where the head for an approach goes. */
  private place(node: number, edge: number): Head | null {
    const c = this.city();
    const e = c.roads.edges.get(edge);
    const n = c.roads.nodes.get(node);
    if (!e || !n) return null;
    const t = ROAD_TYPES[e.type];
    // Just behind the sim's stop line (which is just behind the zebra).
    const set = stopSetback(c.roads.nodeEdges(node), node, e);
    const cum = cumulative(e.pts);
    const L = cum[cum.length - 1];
    const into: 1 | -1 = e.b === node ? 1 : -1;
    const dist = Math.min(L * 0.45, set - 0.3);
    const s = into === 1 ? L - dist : dist;
    const p = sampleAt(e.pts, cum, s);
    const tx = p.tx * into;
    const tz = p.tz * into;
    // Drive side is to the right of travel: n = (-tz, tx).
    const nx = -tz;
    const nz = tx;
    const hw = halfWidth(e);
    const pole = hw - t.sidewalk * 0.45;
    const lanesIn = into === 1 ? e.lanesF : e.lanesB;
    const twoWay = e.lanesF > 0 && e.lanesB > 0;
    const laneMid = twoWay ? t.median / 2 + (lanesIn * LANE) / 2 : 0;
    const wantArm = Math.max(2, pole - laneMid);
    const arm = SignalView.ARMS.reduce((best, a) => (Math.abs(a - wantArm) < Math.abs(best - wantArm) ? a : best));
    const x = p.x + nx * pole;
    const z = p.z + nz * pole;
    const y = c.roadY(edge, s) + 0.15;
    // Local x across the road (towards the centre), y up, z with traffic.
    const ex = new THREE.Vector3(-nx, 0, -nz);
    const ey = new THREE.Vector3(0, 1, 0);
    const ez = new THREE.Vector3(tx, 0, tz);
    const m = new THREE.Matrix4().makeBasis(ex, ey, ez).setPosition(x, y, z);
    return { key: `${node}:${edge}`, m, arm };
  }

  /** New light states from the sim: [node, edge, state] per approach. */
  update(buf: Float32Array, show: boolean) {
    const c = this.city();
    this.group.visible = show;
    if (!show) return;
    let keys = "";
    for (let k = 0; k < buf.length; k += 3) keys += `${buf[k]}:${buf[k + 1]},`;
    if (keys !== this.keys || c.roads.version !== this.version) {
      this.keys = keys;
      this.version = c.roads.version;
      this.heads.clear();
      this.order = [];
      const counts = this.poles.map(() => 0);
      for (let k = 0; k < buf.length && this.order.length < MAX; k += 3) {
        const h = this.place(buf[k], buf[k + 1]);
        if (!h) continue;
        this.heads.set(h.key, h);
        this.order.push(h.key);
        const i = SignalView.ARMS.indexOf(h.arm);
        this.poles[i].setMatrixAt(counts[i]++, h.m);
      }
      this.poles.forEach((p, i) => {
        p.count = counts[i];
        p.instanceMatrix.needsUpdate = true;
      });
    }
    const lm = new THREE.Matrix4();
    const off = new THREE.Matrix4();
    let n = 0;
    for (let k = 0; k < buf.length; k += 3) {
      const h = this.heads.get(`${buf[k]}:${buf[k + 1]}`);
      if (!h) continue;
      const state = buf[k + 2];
      // Red on top, amber, green at the bottom, on the face towards oncoming cars (-z).
      for (let j = 0; j < 3; j++) {
        const lampState = 2 - j;
        off.makeTranslation(h.arm - 0.2, 5.55 - j * 0.38, -0.18);
        lm.multiplyMatrices(h.m, off);
        this.lamps.setMatrixAt(n, lm);
        this.lamps.setColorAt(n, lampState === state ? LIT[lampState] : DIM[lampState]);
        n++;
      }
    }
    this.lamps.count = n;
    this.lamps.instanceMatrix.needsUpdate = true;
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }

  setShadows(on: boolean) {
    for (const p of this.poles) p.castShadow = on;
  }

  dispose() {
    for (const p of this.poles) {
      p.geometry.dispose();
      p.dispose();
    }
    this.mat.dispose();
    this.lamps.geometry.dispose();
    (this.lamps.material as THREE.Material).dispose();
    this.lamps.dispose();
  }
}
