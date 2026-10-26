import * as THREE from "three";
import { USES } from "../data";
import type { Pts } from "../geom";
import type { State } from "../state";
import type { Pol } from "../poltypes";
import { offsetLine } from "./roadmesh";

/**
 * What the planner draws on the map: districts tinted by use with a bold outline, the selected
 * one brighter; a road being drawn; a rectangle being dragged and the streets a pattern would lay
 * in it; a yellow volume for a proposed building; and the outline of whatever's selected.
 */

function fillMat(col: string, opacity: number) {
  return new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
}

/** A polygon on the ground as a flat mesh. */
function polyMesh(poly: Pts, mat: THREE.Material, y: number) {
  const shape = new THREE.Shape();
  for (let i = 0; i < poly.length; i += 2) {
    if (i === 0) shape.moveTo(poly[i], -poly[i + 1]);
    else shape.lineTo(poly[i], -poly[i + 1]);
  }
  const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = y;
  m.renderOrder = 2;
  return m;
}

/** A thick line along a polyline (closed if asked), as a ribbon. */
function band(p: Pts, w: number, mat: THREE.Material, y: number, closed = false) {
  const pts = closed ? [...p, p[0], p[1]] : p;
  const A = offsetLine(pts, -w / 2);
  const B = offsetLine(pts, w / 2);
  const pos: number[] = [];
  for (let i = 2; i < pts.length; i += 2) {
    const a0 = [A[i - 2], y, A[i - 1]];
    const a1 = [A[i], y, A[i + 1]];
    const b0 = [B[i - 2], y, B[i - 1]];
    const b1 = [B[i], y, B[i + 1]];
    pos.push(...b0, ...b1, ...a1, ...b0, ...a1, ...a0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 3;
  return m;
}

export interface Ghost {
  x: number;
  z: number;
  ux: number;
  uz: number;
  hw: number;
  hd: number;
  h: number;
  color?: string;
}

export class Overlay {
  readonly group = new THREE.Group();
  private zones = new THREE.Group();
  private draftG = new THREE.Group();
  private ghostG = new THREE.Group();
  private selG = new THREE.Group();
  private elecG = new THREE.Group();
  private elecKey = "";
  private key = "";
  private time = 0;

  constructor() {
    this.group.add(this.zones, this.draftG, this.ghostG, this.selG, this.elecG);
  }

  private clear(g: THREE.Group) {
    for (const c of [...g.children]) {
      g.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat && !(mat as THREE.Material & { shared?: boolean }).shared) mat.dispose();
    }
  }

  /** Show the districts (all of them when zoning, or just the highlighted one). */
  districts(s: State, show: boolean, highlight: number) {
    const key = `${show}|${highlight}|${s.zrev}|${s.districts.length}`;
    if (key === this.key) return;
    this.key = key;
    this.clear(this.zones);
    if (!show && highlight < 0) return;
    for (const d of s.districts) {
      if (!d) continue;
      const hi = d.id === highlight;
      if (!show && !hi) continue;
      const col = USES[d.use].color;
      this.zones.add(polyMesh(d.poly, fillMat(col, hi ? 0.32 : 0.16), 0.35 + (hi ? 0.05 : 0)));
      this.zones.add(band(d.poly, hi ? 4 : 2.2, fillMat(hi ? "#ffffff" : col, hi ? 0.95 : 0.8), 0.45, true));
    }
  }

  /** The electorates, each tinted by who's ahead there (or null to hide them). */
  electorates(p: Pol | null, selected: number) {
    const lead = (e: Pol["electorates"][number]) => e.support.indexOf(Math.max(...e.support));
    const key = p ? `${p.redraws ?? 1}|${selected}|${p.electorates.map((e) => `${e.holder}${lead(e)}`).join(",")}|${p.night ? 1 : 0}` : "";
    if (key === this.elecKey) return;
    this.elecKey = key;
    this.clear(this.elecG);
    if (!p) return;
    for (const e of p.electorates) {
      const who = p.night || !p.campaign ? e.holder : lead(e);
      const col = p.parties[who]?.color ?? "#888888";
      const sel = e.id === selected;
      this.elecG.add(polyMesh(e.poly, fillMat(col, sel ? 0.34 : 0.2), 0.32));
      this.elecG.add(band(e.poly, sel ? 7 : 4, fillMat(sel ? "#ffffff" : col, 0.9), 0.5, true));
      if (e.id === p.seat) this.elecG.add(band(e.poly, 2, fillMat("#ffd166", 0.95), 0.55, true));
    }
  }

  /** A road being drawn: blue if it can be built, red if not. */
  draftRoad(pts: Pts | null, width: number, ok: boolean) {
    this.clear(this.draftG);
    if (!pts || pts.length < 4) return;
    this.draftG.add(band(pts, width, fillMat(ok ? "#58b7ff" : "#ff5a4f", 0.55), 0.5));
    this.draftG.add(band(pts, 0.8, fillMat("#ffffff", 0.9), 0.55));
  }

  /** A rectangle being dragged, and the streets a pattern would lay in it. */
  draftArea(poly: Pts | null, col: string, lines: Pts[] = []) {
    this.clear(this.draftG);
    if (!poly) return;
    this.draftG.add(polyMesh(poly, fillMat(col, 0.22), 0.4));
    this.draftG.add(band(poly, 3, fillMat(col, 0.95), 0.5, true));
    for (const l of lines) this.draftG.add(band(l, 6, fillMat("#ffffff", 0.75), 0.55));
  }

  /** A proposed building as a glowing volume (or none). */
  ghost(g: Ghost | null) {
    this.clear(this.ghostG);
    if (!g) return;
    const geo = new THREE.BoxGeometry(g.hw * 2, g.h, g.hd * 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: g.color ?? "#f5b52e", transparent: true, opacity: 0.55, depthWrite: false }));
    m.position.set(g.x, g.h / 2 + 0.05, g.z);
    m.rotation.y = -Math.atan2(g.uz, g.ux);
    m.renderOrder = 4;
    this.ghostG.add(m);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: "#fff3c4" }));
    edges.position.copy(m.position);
    edges.rotation.copy(m.rotation);
    this.ghostG.add(edges);
  }

  /** Outline something selected: a footprint box of a given height. */
  select(g: Ghost | null) {
    this.clear(this.selG);
    if (!g) return;
    const geo = new THREE.BoxGeometry(g.hw * 2 + 0.6, g.h + 0.4, g.hd * 2 + 0.6);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: g.color ?? "#7dffb0" }));
    edges.position.set(g.x, g.h / 2, g.z);
    edges.rotation.y = -Math.atan2(g.uz, g.ux);
    geo.dispose();
    this.selG.add(edges);
    const ring = polyMesh(rectPts(g.x, g.z, g.ux, g.uz, g.hw + 2, g.hd + 2), fillMat(g.color ?? "#7dffb0", 0.25), 0.3);
    this.selG.add(ring);
  }

  update(dt: number) {
    this.time += dt;
    const k = 0.45 + Math.sin(this.time * 3) * 0.12;
    for (const c of this.ghostG.children) {
      const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (m.transparent && m.opacity > 0.3) m.opacity = k;
    }
  }

  dispose() {
    for (const g of [this.zones, this.draftG, this.ghostG, this.selG, this.elecG]) this.clear(g);
  }
}

export function rectPts(x: number, z: number, ux: number, uz: number, hw: number, hd: number): Pts {
  const vx = -uz;
  const vz = ux;
  const out: Pts = [];
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push(x + ux * hw * a + vx * hd * b, z + uz * hw * a + vz * hd * b);
  return out;
}
