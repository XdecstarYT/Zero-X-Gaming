import * as THREE from "three";
import { mergeGeometries as mergeRaw } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Prop } from "../world";

/**
 * Model kit: street props built from simple shapes with vertex colours (merged into each city
 * chunk), palm fronds and leaves on alpha cards, and the vehicles the shared car kit doesn't have
 * (a sports bike, a speedboat, an airboat, the police helicopter) plus the guns in people's hands.
 */

export function merge(list: THREE.BufferGeometry[]) {
  const g = mergeRaw(list.map((x) => (x.index ? x.toNonIndexed() : x)));
  if (!g) throw new Error("Heatwave: couldn't merge geometry");
  return g;
}

/** Give a geometry one flat vertex colour. */
export function paint(g: THREE.BufferGeometry, color: string | THREE.Color, jitter = 0) {
  const c = typeof color === "string" ? new THREE.Color(color) : color;
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = jitter ? 1 + (Math.sin(i * 12.9898) * 0.5) * jitter : 1;
    a[i * 3] = c.r * k;
    a[i * 3 + 1] = c.g * k;
    a[i * 3 + 2] = c.b * k;
  }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

export function box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  if (ry) g.rotateY(ry);
  g.translate(x, y + h / 2, z);
  return paint(g, color);
}

export function cyl(r0: number, r1: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 8) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg).toNonIndexed();
  g.translate(x, y + h / 2, z);
  return paint(g, color);
}

/** One template per prop kind: solid (vertex-coloured), leaves (alpha cards), lamp glows. */
export interface PropTemplate {
  solid: THREE.BufferGeometry[];
  /** Palm fronds (frond texture). */
  fronds: THREE.BufferGeometry[];
  /** Broadleaf cards (leaf cluster texture). */
  leaves: THREE.BufferGeometry[];
  /** Pool water. */
  water: THREE.BufferGeometry[];
  /** Lamp head positions (local). */
  glows: [number, number, number][];
}

const empty = (): PropTemplate => ({ solid: [], fronds: [], leaves: [], water: [], glows: [] });

function frond(len: number, droop: number) {
  const g = new THREE.PlaneGeometry(len, 1.15, 6, 1).toNonIndexed();
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + len / 2;
    const t = x / len;
    // Lie flat, rise then droop along the length; a little V across.
    p.setXYZ(i, x, t * 1.1 - t * t * droop + Math.abs(p.getY(i)) * 0.25, p.getY(i));
  }
  g.computeVertexNormals();
  return g;
}

function cross(size: number, y: number, n = 3) {
  const list: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(size, size).toNonIndexed();
    g.rotateY((i / n) * Math.PI);
    g.translate(0, y, 0);
    list.push(g);
  }
  // A flat one on top so it's not see-through from above.
  const top = new THREE.PlaneGeometry(size * 0.9, size * 0.9).toNonIndexed();
  top.rotateX(-Math.PI / 2);
  top.translate(0, y + size * 0.12, 0);
  list.push(top);
  return list;
}

const cache = new Map<string, PropTemplate>();

export function propTemplate(kind: Prop["kind"], s = 1, color = "#ffffff"): PropTemplate {
  const key = `${kind}:${s}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const t = empty();
  switch (kind) {
    case "palm": {
      // A curving trunk with rings, a crown of fronds and coconuts.
      const H = 7.5;
      const segs = 7;
      let x = 0;
      for (let i = 0; i < segs; i++) {
        const y0 = (i / segs) * H;
        const lean = Math.pow(i / segs, 1.6) * 0.9;
        const g = cyl(0.24 - i * 0.012, 0.22 - i * 0.012, H / segs + 0.05, i % 2 ? "#8a6d4a" : "#7a5e3e", 0, 0, 0, 7);
        g.translate(lean, y0, 0);
        t.solid.push(g);
        x = lean;
      }
      for (let k = 0; k < 3; k++) t.solid.push(paint(new THREE.SphereGeometry(0.16, 6, 5).toNonIndexed().translate(x + Math.cos(k * 2.1) * 0.25, H - 0.3, Math.sin(k * 2.1) * 0.25), "#5a4520"));
      for (let k = 0; k < 9; k++) {
        const f = frond(3.6 + (k % 3) * 0.4, 2.2 + (k % 2) * 0.6);
        f.rotateZ(0.15);
        f.rotateY((k / 9) * Math.PI * 2 + (k % 2) * 0.2);
        f.translate(x, H - 0.1, 0);
        t.fronds.push(f);
      }
      break;
    }
    case "tree": {
      t.solid.push(cyl(0.28, 0.2, 3.2, "#5a4632"));
      for (const g of cross(5.2, 4.6, 3)) t.leaves.push(g);
      t.solid.push(paint(new THREE.IcosahedronGeometry(1.9, 1).toNonIndexed().translate(0, 4.4, 0), "#3e5f2a", 0.15));
      break;
    }
    case "mangrove": {
      for (let k = 0; k < 6; k++) {
        const g = cyl(0.06, 0.05, 1.6, "#4a3c2a", 0, 0, 0, 5);
        g.rotateZ(0.5);
        g.rotateY((k / 6) * Math.PI * 2);
        g.translate(Math.cos((k / 6) * Math.PI * 2) * 0.5, 0, Math.sin((k / 6) * Math.PI * 2) * 0.5);
        t.solid.push(g);
      }
      t.solid.push(cyl(0.18, 0.14, 2.6, "#4a3c2a", 0, 0.8));
      t.solid.push(paint(new THREE.IcosahedronGeometry(1.8, 1).toNonIndexed().scale(1.2, 0.75, 1.2).translate(0, 3.6, 0), "#2f4a24", 0.2));
      for (const g of cross(4.4, 3.6, 2)) t.leaves.push(g);
      break;
    }
    case "lamp": {
      t.solid.push(cyl(0.12, 0.08, 7.6, "#3a3f47"));
      t.solid.push(box(2.4, 0.12, 0.12, "#3a3f47", 1.1, 7.45));
      t.solid.push(box(0.7, 0.18, 0.34, "#2b2f36", 2.2, 7.35));
      t.glows.push([2.2, 7.2, 0]);
      break;
    }
    case "bench":
      t.solid.push(box(1.8, 0.08, 0.5, "#8a6a48", 0, 0.45), box(1.8, 0.5, 0.06, "#8a6a48", 0, 0.5, -0.24), box(0.06, 0.45, 0.45, "#3a3f47", -0.8), box(0.06, 0.45, 0.45, "#3a3f47", 0.8));
      break;
    case "hydrant":
      t.solid.push(cyl(0.16, 0.14, 0.7, "#c8102e"), paint(new THREE.SphereGeometry(0.15, 8, 6).toNonIndexed().translate(0, 0.72, 0), "#c8102e"), box(0.45, 0.1, 0.1, "#c8102e", 0, 0.4));
      break;
    case "busstop":
      t.solid.push(box(4, 0.1, 1.6, "#2b2f36", 0, 2.6), box(4, 2.2, 0.06, "#9fc7d6", 0, 0.3, -0.75), box(0.1, 2.6, 0.1, "#2b2f36", -1.9, 0, -0.75), box(0.1, 2.6, 0.1, "#2b2f36", 1.9, 0, -0.75), box(2.6, 0.08, 0.45, "#8a6a48", 0, 0.45, -0.45), box(1.2, 1.8, 0.1, "#f2b134", 2.3, 0.4, -0.2));
      break;
    case "umbrella": {
      t.solid.push(cyl(0.03, 0.03, 2.3, "#e8e8e6"));
      const cone = paint(new THREE.ConeGeometry(1.4, 0.5, 10, 1, true).toNonIndexed().translate(0, 2.35, 0), color);
      t.solid.push(cone);
      // A towel under it.
      t.solid.push(box(0.8, 0.02, 1.8, color === "#f6f1e7" ? "#4b8fd6" : "#f6f1e7", 1.2, 0, 0));
      break;
    }
    case "lifeguard": {
      for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) t.solid.push(box(0.16, 2.2, 0.16, "#e8e2d0", x, 0, z));
      t.solid.push(box(2.8, 0.15, 2.8, "#e8e2d0", 0, 2.2), box(2.4, 1.8, 2.4, color, 0, 2.35), box(3, 0.2, 3, "#f6f1e7", 0, 4.15), box(1, 0.08, 3.4, "#e8e2d0", 2.6, 1.1, 0, 0));
      t.solid.push(box(2.4, 0.9, 0.05, "#2b2f36", 0, 3.1, -1.21));
      break;
    }
    case "volley":
      t.solid.push(cyl(0.05, 0.05, 2.5, "#e8e8e6", 0, 0, -4.5), cyl(0.05, 0.05, 2.5, "#e8e8e6", 0, 0, 4.5), box(0.03, 0.9, 9, "#f6f1e7", 0, 1.55));
      break;
    case "container": {
      for (let k = 0; k < s; k++) t.solid.push(box(2.44, 2.59, 12.2, color, 0, k * 2.6, 0));
      break;
    }
    case "crane": {
      const c = "#d4ac0d";
      for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) t.solid.push(box(0.9, 34, 0.9, c, x, 0, z));
      t.solid.push(box(14, 1.4, 1.4, c, 0, 30, -6), box(14, 1.4, 1.4, c, 0, 30, 6), box(1.4, 1.4, 14, c, -6, 30, 0), box(1.4, 1.4, 14, c, 6, 30, 0));
      // The boom out over the water (south), the back stay inland, the cab.
      t.solid.push(box(3, 2, 62, c, 0, 34, 16), box(5, 4, 5, "#2b2f36", 0, 30, 20), box(0.5, 10, 0.5, c, -1.3, 35, -6), box(0.5, 10, 0.5, c, 1.3, 35, -6));
      break;
    }
    case "pump":
      t.solid.push(box(1, 1.6, 0.6, "#e8e8e6"), box(1.04, 0.35, 0.64, "#e14b6a", 0, 1.25), box(0.5, 0.4, 0.05, "#1c1f24", 0, 0.9, 0.31));
      break;
    case "canopy":
      t.solid.push(box(16, 0.8, 10, "#e8e8e6", 0, 5.2), box(16.1, 0.3, 10.1, "#e14b6a", 0, 5.2));
      for (const dx of [-5, 5]) t.solid.push(box(0.5, 5.2, 0.5, "#cfd3d8", dx, 0, 0));
      t.glows.push([-4, 5, 0], [4, 5, 0]);
      break;
    case "pool": {
      const w = 4 * s;
      const l = 8 * s;
      t.solid.push(box(w + 1.2, 0.12, l + 1.2, "#e9e2d0", 0, 0.0), box(w + 3, 0.04, l + 3, "#d8cfbf", 0, -0.02));
      const g = new THREE.PlaneGeometry(w, l).toNonIndexed();
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0.14, 0);
      t.water.push(paint(g, "#ffffff"));
      break;
    }
    case "yacht": {
      const L = 16 * s;
      const hull = new THREE.CylinderGeometry(1.8 * s, 1.2 * s, L, 10, 1).toNonIndexed();
      hull.rotateZ(Math.PI / 2);
      hull.scale(1, 0.55, 1);
      hull.translate(0, 0.6, 0);
      t.solid.push(paint(hull, "#f6f6f2"));
      t.solid.push(box(L * 0.45, 1.6 * s, 2.4 * s, "#f6f6f2", -L * 0.05, 1.2), box(L * 0.3, 1.2 * s, 2.0 * s, "#1c2a44", -L * 0.08, 2.8), box(L * 0.2, 0.1, 2.6 * s, "#8a6a48", L * 0.3, 1.25));
      break;
    }
    case "billboard":
      t.solid.push(box(0.4, 8, 0.4, "#3a3f47", -3, 0, 0), box(0.4, 8, 0.4, "#3a3f47", 3, 0, 0), box(10.4, 5.4, 0.3, "#2b2f36", 0, 6, -0.25));
      break;
    case "fountain":
      t.solid.push(cyl(4.6 * s, 4.6 * s, 0.6, "#d8cfbf", 0, 0, 0, 20), cyl(0.5, 0.7, 2.2, "#d8cfbf"), cyl(1.4, 1.4, 0.2, "#d8cfbf", 0, 1.6, 0, 12));
      {
        const g = new THREE.CircleGeometry(4.2 * s, 20).toNonIndexed();
        g.rotateX(-Math.PI / 2);
        g.translate(0, 0.5, 0);
        t.water.push(paint(g, "#ffffff"));
      }
      break;
    case "dumpster":
      t.solid.push(box(1.8, 1.2, 1, "#2f5a3a"), box(1.9, 0.1, 1.1, "#244a2e", 0, 1.2));
      break;
    case "planter":
      t.solid.push(box(1.2, 0.6, 1.2, "#cfc6b5"), paint(new THREE.IcosahedronGeometry(0.6, 0).toNonIndexed().translate(0, 1, 0), "#3e6a2a"));
      break;
    case "fence":
      t.solid.push(box(4, 1.2, 0.06, "#9aa3b1"));
      break;
  }
  cache.set(key, t);
  return t;
}

/* ------------------------------------------------------------------ vehicles the kit doesn't have */

export interface CustomVehicle {
  group: THREE.Group;
  paint: THREE.MeshStandardMaterial;
  wheels: THREE.Object3D[];
  rotor?: THREE.Object3D;
  tail?: THREE.Object3D;
  fan?: THREE.Object3D;
  spot?: THREE.Mesh;
  heads: THREE.Mesh[];
}

const dark = new THREE.MeshStandardMaterial({ color: "#16181c", roughness: 0.6, metalness: 0.3 });
const chrome = new THREE.MeshStandardMaterial({ color: "#c9ced6", roughness: 0.2, metalness: 0.9 });
const glass = new THREE.MeshStandardMaterial({ color: "#1d2a36", roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.75 });
const white = new THREE.MeshStandardMaterial({ color: "#f2f2ee", roughness: 0.35 });
const lamp = new THREE.MeshStandardMaterial({ color: "#fff6dd", emissive: "#fff2c8", emissiveIntensity: 1.2 });

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

/** A sports bike: along +x, seat at about 0.85 m. */
export function buildBike(color: string): CustomVehicle {
  const g = new THREE.Group();
  const p = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.4 });
  const wheel = () => {
    const w = new THREE.Group();
    const tyre = mesh(new THREE.TorusGeometry(0.3, 0.09, 8, 18), dark);
    w.add(tyre);
    w.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12).rotateX(Math.PI / 2), chrome));
    return w;
  };
  const fw = wheel();
  fw.position.set(0.72, 0.38, 0);
  const rw = wheel();
  rw.position.set(-0.68, 0.38, 0);
  g.add(fw, rw);
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.42, 0.34), p, 0, 0.72, 0));
  g.add(mesh(new THREE.BoxGeometry(0.55, 0.32, 0.4), p, 0.5, 0.92, 0).rotateZ(-0.35));
  g.add(mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), dark, -0.25, 0.98, 0));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), p, -0.6, 0.9, 0).rotateZ(0.25));
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75), chrome, 0.62, 0.92, 0).rotateZ(0.35));
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.04, 0.7), dark, 0.68, 1.15, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6).rotateZ(Math.PI / 2), chrome, -0.5, 0.5, 0.18));
  const head = mesh(new THREE.BoxGeometry(0.08, 0.1, 0.16), lamp, 0.82, 1.0, 0);
  g.add(head);
  return { group: g, paint: p, wheels: [fw, rw], heads: [head] };
}

/** A speedboat: deep-V hull, a windscreen, an outboard. Along +x, sits at the waterline. */
export function buildBoat(color: string, air = false): CustomVehicle {
  const g = new THREE.Group();
  const p = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.1 });
  const L = air ? 4.6 : 7;
  const W = air ? 2.2 : 2.4;
  // Hull: a tapered box with a pointed bow.
  const shape = new THREE.Shape();
  shape.moveTo(-L / 2, -W / 2);
  shape.lineTo(L / 2 - 1.6, -W / 2);
  shape.quadraticCurveTo(L / 2, -W * 0.15, L / 2, 0);
  shape.quadraticCurveTo(L / 2, W * 0.15, L / 2 - 1.6, W / 2);
  shape.lineTo(-L / 2, W / 2);
  shape.lineTo(-L / 2, -W / 2);
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: air ? 0.6 : 1.0, bevelEnabled: false });
  hullGeo.rotateX(-Math.PI / 2);
  const hull = mesh(hullGeo, air ? new THREE.MeshStandardMaterial({ color: "#5b6b4a", roughness: 0.6 }) : white, 0, -0.35, 0);
  g.add(hull);
  g.add(mesh(new THREE.BoxGeometry(L * 0.9, 0.12, W * 0.92), p, -0.2, air ? 0.3 : 0.68, 0));
  if (air) {
    // A big fan in a cage at the back, a raised seat.
    const cage = mesh(new THREE.TorusGeometry(1.0, 0.05, 6, 20).rotateY(Math.PI / 2), chrome, -1.8, 1.4, 0);
    g.add(cage);
    const fan = new THREE.Group();
    fan.position.set(-1.75, 1.4, 0);
    for (let k = 0; k < 2; k++) fan.add(mesh(new THREE.BoxGeometry(0.05, 1.8, 0.16).rotateX((k * Math.PI) / 2), dark));
    g.add(fan);
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.9, 0.6), dark, -0.8, 0.6, 0));
    return { group: g, paint: p, wheels: [], fan, heads: [] };
  }
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.5, W * 0.8).rotateZ(0.5), glass, 0.9, 0.95, 0));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.4, 0.9), white, -0.3, 0.8, -0.4), mesh(new THREE.BoxGeometry(0.9, 0.4, 0.9), white, -0.3, 0.8, 0.45));
  g.add(mesh(new THREE.BoxGeometry(0.4, 1.0, 0.4), dark, -L / 2 - 0.1, 0.1, 0));
  const head = mesh(new THREE.BoxGeometry(0.1, 0.1, 0.2), lamp, L / 2 - 0.4, 0.8, 0);
  g.add(head);
  return { group: g, paint: p, wheels: [], heads: [head] };
}

/** The police helicopter: a body, tail boom, skids, rotors and a searchlight. Along +x. */
export function buildHeli(): CustomVehicle {
  const g = new THREE.Group();
  const p = new THREE.MeshStandardMaterial({ color: "#1b2a44", roughness: 0.35, metalness: 0.3 });
  const body = mesh(new THREE.SphereGeometry(1.4, 16, 12).scale(1.6, 1, 1), p, 0, 1.4, 0);
  g.add(body);
  g.add(mesh(new THREE.SphereGeometry(1.1, 12, 10).scale(1.3, 0.85, 0.95), glass, 1.1, 1.55, 0));
  g.add(mesh(new THREE.BoxGeometry(5.5, 0.45, 0.4), p, -3.6, 1.7, 0));
  g.add(mesh(new THREE.BoxGeometry(0.9, 1.2, 0.12), p, -6.2, 2.2, 0));
  g.add(mesh(new THREE.BoxGeometry(3.2, 0.1, 0.4), white, 0.1, 1.95, 0.0));
  for (const z of [-0.95, 0.95]) {
    g.add(mesh(new THREE.BoxGeometry(3.4, 0.08, 0.1), dark, 0, 0.12, z));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), dark, 0.8, 0.45, z), mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), dark, -0.8, 0.45, z));
  }
  const rotor = new THREE.Group();
  rotor.position.set(0, 2.75, 0);
  for (let k = 0; k < 4; k++) rotor.add(mesh(new THREE.BoxGeometry(10.5, 0.05, 0.32).rotateY((k * Math.PI) / 4), dark));
  rotor.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4), dark));
  g.add(rotor);
  const tail = new THREE.Group();
  tail.position.set(-6.2, 2.2, 0.2);
  for (let k = 0; k < 2; k++) tail.add(mesh(new THREE.BoxGeometry(0.06, 1.6, 0.16).rotateX((k * Math.PI) / 2), dark));
  g.add(tail);
  // A searchlight cone, seen at night.
  const coneGeo = new THREE.ConeGeometry(9, 42, 24, 1, true);
  coneGeo.translate(0, -21, 0);
  const spot = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: "#fff6d8", transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  spot.position.set(1.6, 0.6, 0);
  spot.visible = false;
  g.add(spot);
  // Police markings.
  g.add(mesh(new THREE.BoxGeometry(2.2, 0.3, 0.02), white, -0.4, 1.3, 1.36), mesh(new THREE.BoxGeometry(2.2, 0.3, 0.02), white, -0.4, 1.3, -1.36));
  return { group: g, paint: p, wheels: [], rotor, tail, spot, heads: [] };
}

/* ------------------------------------------------------------------ guns in hand */

const gunMat = new THREE.MeshStandardMaterial({ color: "#1b1c1f", roughness: 0.45, metalness: 0.7 });
const woodMat = new THREE.MeshStandardMaterial({ color: "#6b4a2e", roughness: 0.7 });

/** A weapon model to hang off a hand bone (pointing down the forearm, along −y). */
export function weaponModel(kind: "smg" | "shotgun" | "rifle" | "bat" | "grenade") {
  const g = new THREE.Group();
  switch (kind) {
    case "smg":
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.42, 0.07), gunMat, 0, -0.18, 0.02), mesh(new THREE.BoxGeometry(0.04, 0.16, 0.05), gunMat, 0, -0.06, 0.08));
      break;
    case "shotgun":
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.9, 0.06), gunMat, 0, -0.32, 0.02), mesh(new THREE.BoxGeometry(0.06, 0.3, 0.08), woodMat, 0, 0.1, 0.03));
      break;
    case "rifle":
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.85, 0.07), gunMat, 0, -0.28, 0.02), mesh(new THREE.BoxGeometry(0.05, 0.16, 0.1), gunMat, 0, -0.08, 0.08), mesh(new THREE.BoxGeometry(0.06, 0.26, 0.08), gunMat, 0, 0.14, 0.03));
      break;
    case "bat":
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.022, 0.85, 8), woodMat, 0, -0.38, 0));
      break;
    case "grenade":
      g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: "#3d4530", roughness: 0.6 }), 0, -0.06, 0));
      break;
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}
