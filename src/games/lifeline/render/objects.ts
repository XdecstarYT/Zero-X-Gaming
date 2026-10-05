import * as THREE from "three";
import type { ObjectId } from "../data";
import { footprint, type Obj } from "../world";

const mats = new Map<string, THREE.Material>();
/** Shared materials by colour (and finish). */
function mat(color: string, o: { rough?: number; metal?: number; glow?: number } = {}) {
  const k = `${color}:${o.rough ?? 0.7}:${o.metal ?? 0}:${o.glow ?? 0}`;
  let m = mats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, emissive: o.glow ? new THREE.Color(color) : undefined, emissiveIntensity: o.glow ?? 0 });
    mats.set(k, m);
  }
  return m;
}
export const GHOST_OK = new THREE.MeshBasicMaterial({ color: "#38bdf8", transparent: true, opacity: 0.45, depthWrite: false });
export const GHOST_BAD = new THREE.MeshBasicMaterial({ color: "#f87171", transparent: true, opacity: 0.45, depthWrite: false });

const WHITE = "#f4f6f8";
const STEEL = "#9ca3af";
const DARK = "#334155";
const WOOD = "#b98a5a";
const TEAL = "#2dd4bf";
const SCREEN = "#7dd3fc";

type B = (g: THREE.Group) => void;

function box(g: THREE.Group, w: number, h: number, d: number, color: string | THREE.Material, x = 0, y = 0, z = 0, opts?: Parameters<typeof mat>[1]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === "string" ? mat(color, opts) : color);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
function cyl(g: THREE.Group, r: number, h: number, color: string, x = 0, y = 0, z = 0, opts?: Parameters<typeof mat>[1], r2 = r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, 16), mat(color, opts));
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  g.add(m);
  return m;
}
function sphere(g: THREE.Group, r: number, color: string, x = 0, y = 0, z = 0, opts?: Parameters<typeof mat>[1]) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}
const legs = (g: THREE.Group, w: number, d: number, h: number, color = STEEL, t = 0.05) => {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, t, h, t, color, sx * (w / 2 - t), 0, sz * (d / 2 - t), { metal: 0.5, rough: 0.4 });
};

/**
 * Models face +z (the side people use them from), centred on their footprint
 * (w along x, d along z, before rotation).
 */
const BUILDERS: Record<ObjectId, B> = {
  receptionDesk: (g) => {
    box(g, 2.9, 1.0, 0.75, WHITE, 0, 0, 0.05);
    box(g, 2.9, 0.08, 0.95, WOOD, 0, 1.0, 0.05);
    box(g, 2.6, 0.12, 0.02, TEAL, 0, 0.55, 0.43, { glow: 0.6 });
    box(g, 0.5, 0.32, 0.05, DARK, -0.6, 1.08, -0.15);
    box(g, 0.46, 0.27, 0.01, SCREEN, -0.6, 1.1, -0.12, { glow: 0.5 });
  },
  chair: (g) => {
    box(g, 0.46, 0.06, 0.46, "#1f2937", 0, 0.44, 0);
    box(g, 0.46, 0.5, 0.06, "#1f2937", 0, 0.5, -0.2);
    cyl(g, 0.03, 0.44, STEEL, 0, 0, 0, { metal: 0.6 });
    cyl(g, 0.22, 0.03, STEEL, 0, 0, 0, { metal: 0.6 });
  },
  seats: (g) => {
    box(g, 2.9, 0.06, 0.12, STEEL, 0, 0.3, 0, { metal: 0.6, rough: 0.3 });
    for (const x of [-1, 0, 1]) {
      box(g, 0.86, 0.08, 0.5, "#3b82f6", x, 0.42, 0.02);
      box(g, 0.86, 0.5, 0.07, "#3b82f6", x, 0.5, -0.22);
    }
    for (const x of [-1.4, 1.4]) box(g, 0.06, 0.42, 0.45, STEEL, x, 0, 0, { metal: 0.6 });
  },
  desk: (g) => {
    box(g, 1.8, 0.05, 0.8, WOOD, 0, 0.72, 0);
    legs(g, 1.8, 0.8, 0.72, DARK);
    box(g, 0.5, 0.32, 0.04, DARK, 0.3, 0.77, -0.2);
    box(g, 0.46, 0.27, 0.01, SCREEN, 0.3, 0.8, -0.175, { glow: 0.5 });
    box(g, 0.3, 0.02, 0.22, "#fefce8", -0.4, 0.77, 0.1);
  },
  examBed: (g) => {
    box(g, 1.85, 0.5, 0.7, STEEL, 0, 0.12, 0, { metal: 0.4 });
    box(g, 1.9, 0.12, 0.75, "#93c5fd", 0, 0.62, 0, { rough: 0.5 });
    box(g, 1.6, 0.01, 0.55, "#ffffff", 0.1, 0.745, 0);
    box(g, 0.35, 0.1, 0.55, "#dbeafe", -0.75, 0.74, 0);
    box(g, 1.7, 0.12, 0.6, DARK, 0, 0, 0);
  },
  bed: (g) => {
    box(g, 0.9, 0.42, 1.9, STEEL, 0, 0.12, 0, { metal: 0.5 });
    box(g, 0.92, 0.16, 1.9, WHITE, 0, 0.54, 0);
    box(g, 0.94, 0.06, 1.25, TEAL, 0, 0.7, 0.3);
    box(g, 0.6, 0.12, 0.35, "#ffffff", 0, 0.7, -0.7);
    box(g, 0.94, 0.8, 0.06, "#cbd5e1", 0, 0.3, -0.95);
    box(g, 0.94, 0.45, 0.06, "#cbd5e1", 0, 0.3, 0.95);
    for (const sx of [-0.4, 0.4]) for (const sz of [-0.85, 0.85]) cyl(g, 0.06, 0.12, DARK, sx, 0, sz);
  },
  monitor: (g) => {
    cyl(g, 0.25, 0.04, DARK);
    cyl(g, 0.03, 1.3, STEEL, 0, 0, 0, { metal: 0.6 });
    box(g, 0.45, 0.34, 0.08, DARK, 0, 1.3, 0);
    box(g, 0.4, 0.28, 0.01, "#22c55e", 0, 1.33, 0.045, { glow: 0.9 });
  },
  opTable: (g) => {
    cyl(g, 0.22, 0.75, STEEL, 0, 0, 0, { metal: 0.7, rough: 0.3 });
    box(g, 0.7, 0.1, 1.95, "#0f766e", 0, 0.75, 0, { rough: 0.4 });
    box(g, 0.72, 0.03, 1.9, "#99f6e4", 0, 0.85, 0);
    box(g, 0.5, 0.2, 0.5, DARK, 0, 0, 0);
  },
  surgicalLight: (g) => {
    cyl(g, 0.22, 0.05, DARK);
    cyl(g, 0.04, 2.1, STEEL, 0, 0, 0, { metal: 0.6 });
    box(g, 0.06, 0.06, 0.9, STEEL, 0, 2.05, -0.45, { metal: 0.6 });
    cyl(g, 0.4, 0.14, WHITE, 0, 1.85, -0.85, { rough: 0.3 }, 0.32);
    cyl(g, 0.3, 0.02, "#fffbe6", 0, 1.84, -0.85, { glow: 1.6 });
  },
  anesthesia: (g) => {
    box(g, 0.7, 1.0, 0.6, "#e2e8f0", 0, 0.1, 0);
    legs(g, 0.6, 0.5, 0.1, DARK, 0.06);
    box(g, 0.4, 0.3, 0.05, DARK, 0, 1.15, 0.1);
    box(g, 0.36, 0.25, 0.01, "#38bdf8", 0, 1.17, 0.13, { glow: 0.8 });
    for (const [x, c] of [
      [-0.2, "#22c55e"],
      [0.2, "#3b82f6"],
    ] as const)
      cyl(g, 0.07, 0.5, c, x, 1.1, -0.2);
  },
  xray: (g) => {
    box(g, 1.9, 0.75, 0.75, "#e5e7eb", 0, 0, 0.3);
    box(g, 1.9, 0.08, 0.8, "#cbd5e1", 0, 0.75, 0.3);
    box(g, 0.4, 2.2, 0.4, "#d1d5db", -0.75, 0, -0.6);
    box(g, 0.25, 0.25, 1.3, "#d1d5db", -0.75, 1.9, -0.05);
    box(g, 0.7, 0.2, 0.7, "#94a3b8", -0.75, 1.55, 0.35);
    box(g, 0.5, 0.02, 0.5, "#a5f3fc", -0.75, 1.53, 0.35, { glow: 0.7 });
  },
  leadScreen: (g) => {
    box(g, 0.9, 1.8, 0.12, "#64748b", 0, 0.12, 0);
    box(g, 0.45, 0.35, 0.13, "#bae6fd", 0, 1.2, 0, { rough: 0.1 });
    for (const x of [-0.35, 0.35]) cyl(g, 0.06, 0.12, DARK, x, 0, 0);
  },
  pharmacyCounter: (g) => {
    box(g, 1.9, 1.0, 0.7, WHITE, 0, 0, 0);
    box(g, 1.95, 0.06, 0.8, "#bae6fd", 0, 1.0, 0, { rough: 0.1 });
    box(g, 1.7, 0.1, 0.02, "#22c55e", 0, 0.6, 0.36, { glow: 0.5 });
    for (const [x, c] of [
      [-0.5, "#fca5a5"],
      [-0.2, "#fde68a"],
      [0.4, "#a7f3d0"],
    ] as const)
      box(g, 0.14, 0.12, 0.1, c, x, 1.06, -0.1);
  },
  medCabinet: (g) => {
    box(g, 0.85, 1.9, 0.5, WHITE, 0, 0, 0);
    box(g, 0.02, 1.7, 0.02, "#cbd5e1", 0, 0.1, 0.26);
    box(g, 0.24, 0.07, 0.02, "#16a34a", 0, 1.5, 0.26, { glow: 0.6 });
    box(g, 0.07, 0.24, 0.02, "#16a34a", 0, 1.42, 0.26, { glow: 0.6 });
  },
  traumaBed: (g) => {
    box(g, 0.85, 0.5, 1.9, STEEL, 0, 0.1, 0, { metal: 0.5 });
    box(g, 0.9, 0.14, 1.9, "#fee2e2", 0, 0.6, 0);
    const back = box(g, 0.9, 0.1, 0.8, "#fecaca", 0, 0.75, -0.5);
    back.rotation.x = -0.5;
    box(g, 0.92, 0.1, 0.04, "#ef4444", 0, 0.45, 0.96, { glow: 0.3 });
    box(g, 0.92, 0.1, 0.04, "#ef4444", 0, 0.45, -0.96, { glow: 0.3 });
  },
  defib: (g) => {
    box(g, 0.6, 0.9, 0.5, "#dc2626", 0, 0.1, 0);
    legs(g, 0.5, 0.4, 0.1, DARK, 0.05);
    box(g, 0.45, 0.25, 0.3, "#fbbf24", 0, 1.0, 0);
    box(g, 0.3, 0.15, 0.01, "#22c55e", 0, 1.08, 0.16, { glow: 0.9 });
  },
  sofa: (g) => {
    box(g, 1.9, 0.4, 0.8, "#b45309", 0, 0.05, 0);
    for (const x of [-0.45, 0.45]) box(g, 0.88, 0.14, 0.62, "#d97706", x, 0.45, 0.06);
    box(g, 1.9, 0.5, 0.18, "#b45309", 0, 0.45, -0.32);
    for (const x of [-0.9, 0.9]) box(g, 0.14, 0.3, 0.8, "#92400e", x, 0.45, 0);
  },
  coffee: (g) => {
    box(g, 0.6, 0.8, 0.5, WOOD, 0, 0, 0);
    box(g, 0.4, 0.5, 0.35, DARK, 0, 0.8, -0.03);
    box(g, 0.1, 0.06, 0.01, "#f97316", 0.1, 1.15, 0.15, { glow: 1 });
    cyl(g, 0.05, 0.1, "#ffffff", -0.08, 0.84, 0.1);
  },
  vending: (g) => {
    box(g, 0.9, 1.95, 0.75, "#1d4ed8", 0, 0, 0);
    box(g, 0.6, 1.4, 0.02, "#bfdbfe", -0.1, 0.35, 0.38, { glow: 0.7 });
    box(g, 0.16, 0.5, 0.02, DARK, 0.33, 0.9, 0.38);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) box(g, 0.12, 0.12, 0.02, ["#ef4444", "#facc15", "#22c55e"][c], -0.3 + c * 0.2, 0.5 + r * 0.32, 0.39);
  },
  table: (g) => {
    cyl(g, 0.4, 0.04, "#f5f5f4", 0, 0.72, 0, { rough: 0.4 });
    cyl(g, 0.04, 0.72, DARK);
    cyl(g, 0.22, 0.03, DARK);
  },
  toilet: (g) => {
    cyl(g, 0.2, 0.42, "#ffffff", 0, 0, 0.05, { rough: 0.2 }, 0.16);
    cyl(g, 0.21, 0.04, "#e5e7eb", 0, 0.42, 0.05, { rough: 0.2 });
    box(g, 0.4, 0.4, 0.16, "#ffffff", 0, 0.4, -0.3, { rough: 0.2 });
  },
  sink: (g) => {
    cyl(g, 0.08, 0.75, "#ffffff", 0, 0, -0.05, { rough: 0.2 });
    box(g, 0.55, 0.15, 0.42, "#ffffff", 0, 0.75, 0, { rough: 0.2 });
    cyl(g, 0.02, 0.18, STEEL, 0, 0.88, -0.15, { metal: 0.8, rough: 0.2 });
    box(g, 0.5, 0.6, 0.03, "#cbd5e1", 0, 1.15, -0.45, { metal: 0.6, rough: 0.05 });
  },
  lockers: (g) => {
    for (const x of [-0.65, -0.2, 0.25, 0.7]) {
      box(g, 0.42, 1.9, 0.5, "#64748b", x, 0, 0, { metal: 0.3 });
      box(g, 0.05, 0.12, 0.02, "#e2e8f0", x + 0.12, 1.0, 0.26);
    }
  },
  generator: (g) => {
    box(g, 1.9, 0.15, 1.9, DARK, 0, 0, 0);
    box(g, 1.7, 1.3, 1.5, "#facc15", 0, 0.15, 0, { metal: 0.2 });
    box(g, 1.2, 0.5, 0.02, "#1f2937", 0, 0.6, 0.76);
    cyl(g, 0.1, 1.0, "#6b7280", 0.6, 1.45, -0.4, { metal: 0.5 });
    box(g, 0.3, 0.12, 0.02, "#22c55e", -0.5, 1.15, 0.76, { glow: 1 });
  },
  plant: (g) => {
    cyl(g, 0.2, 0.4, "#9a3412", 0, 0, 0, {}, 0.15);
    sphere(g, 0.3, "#16a34a", 0, 0.65, 0);
    sphere(g, 0.22, "#22c55e", 0.12, 0.85, 0.05);
    sphere(g, 0.2, "#15803d", -0.12, 0.8, -0.05);
  },
  tv: (g) => {
    box(g, 0.7, 0.55, 0.45, WOOD, 0, 0, 0);
    box(g, 0.95, 0.55, 0.06, "#111827", 0, 0.75, -0.05);
    box(g, 0.88, 0.48, 0.01, "#60a5fa", 0, 0.785, -0.015, { glow: 0.9 });
    cyl(g, 0.03, 0.2, DARK, 0, 0.55, -0.05);
  },
  bench: (g) => {
    for (const z of [-0.12, 0.05, 0.22]) box(g, 1.8, 0.05, 0.13, WOOD, 0, 0.42, z);
    box(g, 1.8, 0.35, 0.05, WOOD, 0, 0.55, -0.25);
    for (const x of [-0.75, 0.75]) box(g, 0.06, 0.45, 0.5, "#1f2937", x, 0, 0);
  },
  tree: (g) => {
    cyl(g, 0.12, 1.4, "#6b4a2f", 0, 0, 0, {}, 0.16);
    sphere(g, 0.75, "#3f7f2f", 0, 1.9, 0, { rough: 1 });
    sphere(g, 0.5, "#4c8f33", 0.3, 2.3, 0.1, { rough: 1 });
  },
  filing: (g) => {
    box(g, 0.5, 1.3, 0.6, "#94a3b8", 0, 0, 0, { metal: 0.3 });
    for (const y of [0.15, 0.55, 0.95]) box(g, 0.44, 0.34, 0.02, "#cbd5e1", 0, y, 0.31);
  },
};

/** Build the model for an object (or its blueprint). */
export function makeObject(kind: ObjectId, ghost?: THREE.Material) {
  const g = new THREE.Group();
  BUILDERS[kind](g);
  if (ghost)
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = ghost;
        m.castShadow = false;
      }
    });
  return g;
}

/** Place a model on the grid: centred on its (rotated) footprint, facing its front. */
export function placeModel(g: THREE.Object3D, o: Pick<Obj, "kind" | "x" | "z" | "rot">) {
  const f = footprint(o.kind, o.rot);
  g.position.set(o.x + f.w / 2, 0.03, o.z + f.d / 2);
  g.rotation.y = -o.rot * (Math.PI / 2);
}

/** Keeps a model per object in the world, swapping blueprints for the real thing when built. */
export class ObjectView {
  group = new THREE.Group();
  private models = new Map<number, { g: THREE.Group; built: boolean }>();

  sync(objects: Map<number, Obj>) {
    for (const [id, m] of this.models)
      if (!objects.has(id)) {
        this.group.remove(m.g);
        this.models.delete(id);
      }
    for (const o of objects.values()) {
      const m = this.models.get(o.id);
      if (m && m.built === o.built) continue;
      if (m) this.group.remove(m.g);
      const g = makeObject(o.kind, o.built ? undefined : GHOST_OK);
      placeModel(g, o);
      g.userData.obj = o.id;
      this.group.add(g);
      this.models.set(o.id, { g, built: o.built });
    }
  }
}
