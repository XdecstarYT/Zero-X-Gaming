import * as THREE from "three";
import { theme } from "../theme";
import type { City } from "../world/city";
import type { Lot } from "../world/lots";
import { chevronTexture } from "./textures";
import { merge, paint } from "./terrainView";

/** Lot tints, the land value map, previews, the route arrow, the selection ring, the brush and bus stops. */
export class OverlayView {
  readonly group = new THREE.Group();
  readonly ghosts = new THREE.Group();
  private zones: THREE.InstancedMesh | null = null;
  private route: THREE.Mesh | null = null;
  private routeTex = chevronTexture();
  private ring: THREE.Mesh;
  private brush: THREE.Line;
  private stops: THREE.InstancedMesh | null = null;
  private lotIds: number[] = [];
  /** "zones" shows unbuilt zoned lots; "land" colours every lot by land value. */
  mode: "zones" | "land" | "off" = "zones";
  ringTarget: THREE.Vector3 | null = null;
  ringSize = 8;
  reduceMotion = false;

  constructor(private city: () => City) {
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.9, depthTest: false }));
    this.ring.renderOrder = 10;
    this.ring.visible = false;
    const pts = Array.from({ length: 65 }, (_, i) => new THREE.Vector3(Math.cos((i / 64) * Math.PI * 2), 0, Math.sin((i / 64) * Math.PI * 2)));
    this.brush = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: theme.accent, depthTest: false, transparent: true }));
    this.brush.visible = false;
    this.brush.renderOrder = 10;
    this.routeTex.repeat.set(1, 1);
    this.group.add(this.ring, this.brush, this.ghosts);
  }

  /** Rebuild the lot quads (zone tints or land value). */
  rebuildLots(built: (lot: Lot) => boolean, lv: Map<number, number>) {
    if (this.zones) {
      this.group.remove(this.zones);
      this.zones.dispose();
      this.zones = null;
    }
    this.lotIds = [];
    if (this.mode === "off") return;
    const c = this.city();
    const lots = [...c.lots.lots.values()].filter((l) => this.mode === "land" || !built(l));
    if (!lots.length) return;
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: this.mode === "land" ? 0.62 : 0.4, depthWrite: false }), lots.length);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    lots.forEach((l, i) => {
      const y = Math.max(c.terrain.surfaceAt(l.cx, l.cz), ...corners(l).map((p) => c.terrain.surfaceAt(p.x, p.z))) + (this.mode === "land" ? 0.35 : 0.25);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -l.ang);
      mtx.compose(new THREE.Vector3(l.cx, y, l.cz), q, new THREE.Vector3(l.w - 0.4, 1, l.d - 0.4));
      m.setMatrixAt(i, mtx);
      if (this.mode === "land") col.set(rampColor(lv.get(l.id) ?? 0.3));
      else col.set(theme.zone[l.zone]);
      m.setColorAt(i, col);
      this.lotIds.push(l.id);
    });
    m.renderOrder = 4;
    this.zones = m;
    this.group.add(m);
  }

  /** The lot under a ray (for the inspector). */
  pickLot(ray: THREE.Raycaster) {
    if (!this.zones) return -1;
    const h = ray.intersectObject(this.zones, false)[0];
    return h?.instanceId !== undefined ? this.lotIds[h.instanceId] : -1;
  }

  setRoute(pts: number[] | null, ys?: number[]) {
    if (this.route) {
      this.group.remove(this.route);
      this.route.geometry.dispose();
      (this.route.material as THREE.Material).dispose();
      this.route = null;
    }
    if (!pts || pts.length < 4) return;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let s = 0;
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const j = Math.min(n - 1, i + 1);
      const k = Math.max(0, i - 1);
      let tx = pts[j * 2] - pts[k * 2];
      let tz = pts[j * 2 + 1] - pts[k * 2 + 1];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      if (i > 0) s += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
      const y = (ys?.[i] ?? 0) + 0.45;
      const w = 1.4;
      pos.push(pts[i * 2] - tz * w, y, pts[i * 2 + 1] + tx * w, pts[i * 2] + tz * w, y, pts[i * 2 + 1] - tx * w);
      uv.push(0, s / 3, 1, s / 3);
      if (i < n - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: "#4ade80", map: this.routeTex, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 6;
    this.route = m;
    this.group.add(m);
  }

  setBrush(at: THREE.Vector3 | null, r: number) {
    this.brush.visible = !!at;
    if (!at) return;
    this.brush.position.copy(at).setY(at.y + 0.6);
    this.brush.scale.setScalar(r);
  }

  /** Bus stops: a shelter with a coloured sign. */
  rebuildStops() {
    if (this.stops) {
      this.group.remove(this.stops);
      this.stops.dispose();
      this.stops = null;
    }
    const c = this.city();
    if (!c.stops.length) return;
    const g = merge([
      paint(new THREE.BoxGeometry(3, 0.1, 1.4).translate(0, 2.4, 0), "#2b2f36"),
      paint(new THREE.BoxGeometry(3, 2.3, 0.08).translate(0, 1.2, 0.65), "#9fc6dd"),
      paint(new THREE.BoxGeometry(0.1, 2.4, 1.4).translate(-1.45, 1.2, 0), "#2b2f36"),
      paint(new THREE.BoxGeometry(2.6, 0.4, 0.5).translate(0, 0.45, 0.4), "#6b4a2f"),
      paint(new THREE.CylinderGeometry(0.05, 0.05, 3, 6).translate(2, 1.5, -0.3), "#8a8f96"),
      paint(new THREE.BoxGeometry(0.7, 0.7, 0.06).translate(2, 3.1, -0.3), "#ffffff"),
    ]);
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), c.stops.length);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    c.stops.forEach((st, i) => {
      const e = c.roads.edges.get(st.edge);
      const y = e ? c.roadY(st.edge, st.s) + 0.18 : c.terrain.surfaceAt(st.x, st.z);
      const p = c.sidePoint(st.edge, st.s, st.side, -1.3) ?? { x: st.x, z: st.z };
      const p2 = c.sidePoint(st.edge, st.s + 1, st.side, -1.3) ?? { x: p.x + 1, z: p.z };
      const ang = Math.atan2(p2.z - p.z, p2.x - p.x);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang + (st.side > 0 ? Math.PI : 0));
      mtx.compose(new THREE.Vector3(p.x, y, p.z), q, new THREE.Vector3(1, 1, 1));
      m.setMatrixAt(i, mtx);
      const line = c.lines.find((l) => l.stops.includes(st.id));
      col.set(line ? ["#22e5ff", "#ff5a5f", "#ffd166", "#8b5cff", "#4ade80", "#ff8fab"][line.color % 6] : "#ffffff");
      m.setColorAt(i, col);
    });
    m.castShadow = true;
    this.stops = m;
    this.group.add(m);
  }

  update(time: number) {
    this.routeTex.offset.y = -time * 1.6;
    if (this.ringTarget) {
      this.ring.visible = true;
      const k = this.reduceMotion ? 1 : 1 + 0.12 * Math.sin(time * 6);
      this.ring.position.copy(this.ringTarget).setY(this.ringTarget.y + 0.5);
      this.ring.scale.setScalar(this.ringSize * k);
    } else this.ring.visible = false;
  }

  clearGhosts() {
    for (const o of [...this.ghosts.children]) {
      this.ghosts.remove(o);
      o.traverse((x) => {
        const m = x as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | undefined;
        mat?.dispose();
      });
    }
  }

  dispose() {
    this.clearGhosts();
    this.zones?.dispose();
    this.stops?.dispose();
  }
}

function corners(l: Lot) {
  const c = Math.cos(l.ang);
  const s = Math.sin(l.ang);
  return [
    [-l.w / 2, -l.d / 2],
    [l.w / 2, -l.d / 2],
    [l.w / 2, l.d / 2],
    [-l.w / 2, l.d / 2],
  ].map(([u, v]) => ({ x: l.cx + u * c - v * s, z: l.cz + u * s + v * c }));
}

/** Land value 0–1 on the colour-blind-safe ramp. */
export function rampColor(v: number) {
  const r = theme.ramp;
  const x = Math.min(0.999, Math.max(0, v)) * (r.length - 1);
  const i = Math.floor(x);
  return new THREE.Color(r[i]).lerp(new THREE.Color(r[i + 1]), x - i).getStyle();
}
