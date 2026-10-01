import * as THREE from "three";
import { SportsPipeline, canvasTexture, noise2 } from "../sports-kit/pipeline";
import type { Detail } from "../sports-kit/look";
import { BUILDINGS, DEPLOY, GRID, TROOPS, type BuildingType, type TroopType } from "./data";
import type { Battle, Projectile, Unit } from "./battle";

/**
 * Clanforge's view: a sunlit valley seen from a high three-quarter angle,
 * hand-built low-poly buildings for every type and level, troops that march,
 * swing and breathe fire, real projectiles, explosions and rubble, health
 * bars, build timers, collector bubbles, the placement ghost and the deploy
 * zone. Pan with a drag, zoom with the wheel or a pinch.
 */

export interface ShownBuilding {
  id: number;
  type: BuildingType;
  level: number;
  x: number;
  y: number;
  busy?: boolean;
  destroyed?: boolean;
  /** 0–1, for health bars (battle). */
  hp?: number;
  aim?: number;
  fired?: number;
  /** Collector ready to collect (bubble). */
  ready?: "gold" | "mana" | null;
}

const C = GRID / 2;
const toWorld = (x: number, y: number) => new THREE.Vector3(x - C, 0, y - C);

const mat = (() => {
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  return (color: string, o: { rough?: number; metal?: number; emissive?: string; ei?: number } = {}) => {
    const k = `${color}|${o.rough ?? 0.8}|${o.metal ?? 0}|${o.emissive ?? ""}|${o.ei ?? 0}`;
    let m = cache.get(k);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, emissive: o.emissive ?? "#000000", emissiveIntensity: o.ei ?? 0 });
      cache.set(k, m);
    }
    return m;
  };
})();

function box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, o?: Parameters<typeof mat>[1]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o));
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function cyl(rt: number, rb: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 12, o?: Parameters<typeof mat>[1]) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, o));
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function cone(r: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 4) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color));
  m.position.set(x, y + h / 2, z);
  if (seg === 4) m.rotation.y = Math.PI / 4;
  m.castShadow = true;
  return m;
}
function sphere(r: number, color: string, x = 0, y = 0, z = 0, o?: Parameters<typeof mat>[1]) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(color, o));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Stone, then dressed stone, then dark granite, then gold-trimmed: what a level looks like. */
const STONE = ["#9a8f7f", "#a8a29a", "#8c8f96", "#6b7280", "#5b6170", "#4b5160"];
const TRIM = ["#7c5a3a", "#7c5a3a", "#94a3b8", "#cbd5e1", "#e7c35a", "#f5d77a"];
const ROOF = ["#b4472f", "#b4472f", "#9a3412", "#1e40af", "#7c3aed", "#111827"];

/** A building's model at a level; `turret` is the part that turns to aim. */
export function buildingModel(type: BuildingType, level: number): THREE.Group {
  const g = new THREE.Group();
  const L = Math.max(1, level);
  const s = BUILDINGS[type].size;
  const stone = STONE[Math.min(L, 6) - 1];
  const trim = TRIM[Math.min(L, 6) - 1];
  const roof = ROOF[Math.min(L, 6) - 1];
  const turret = new THREE.Group();
  turret.name = "turret";
  const pad = box(s - 0.25, 0.12, s - 0.25, "#6b5b45", 0, 0, 0);
  pad.castShadow = false;
  if (type !== "wall") g.add(pad);
  switch (type) {
    case "keep": {
      g.add(box(3.4, 1.3, 3.4, stone, 0, 0.1));
      g.add(box(2.4, 1.9 + L * 0.15, 2.4, stone, 0, 1.4));
      for (const [x, z] of [
        [-1.5, -1.5],
        [1.5, -1.5],
        [-1.5, 1.5],
        [1.5, 1.5],
      ]) {
        g.add(cyl(0.45, 0.5, 2.0 + L * 0.2, stone, x, 0.1, z, 10));
        g.add(cone(0.6, 0.9, roof, x, 2.1 + L * 0.2, z, 8));
      }
      g.add(cone(1.9, 1.4 + L * 0.1, roof, 0, 3.3 + L * 0.15));
      g.add(box(0.7, 0.9, 0.12, trim, 0, 0.1, 1.72));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshStandardMaterial({ color: "#c81e1e", side: THREE.DoubleSide }));
      flag.position.set(0.35, 5.3 + L * 0.2, 0);
      g.add(cyl(0.03, 0.03, 1.2, "#3f2a17", 0, 4.4 + L * 0.2, 0, 6), flag);
      flag.name = "flag";
      break;
    }
    case "goldMine":
      g.add(box(2.2, 0.5, 2.2, "#6b4f2e", 0, 0.1));
      g.add(box(0.2, 1.8, 0.2, "#7c5a3a", -0.9, 0.1, -0.9), box(0.2, 1.8, 0.2, "#7c5a3a", 0.9, 0.1, -0.9), box(2.1, 0.2, 0.25, "#7c5a3a", 0, 1.8, -0.9));
      for (let i = 0; i < 4 + L; i++) g.add(sphere(0.22 + (i % 3) * 0.05, "#f4c430", -0.4 + (i % 3) * 0.35, 0.75 + Math.floor(i / 3) * 0.2, 0.3 - (i % 2) * 0.4, { metal: 0.6, rough: 0.35 }));
      g.add(box(0.8, 0.45, 0.55, "#5b4636", 0.7, 0.6, 0.7));
      turret.add(cyl(0.12, 0.12, 1.4, "#3f2a17", 0, 0, 0, 6));
      turret.position.set(0, 1.9, -0.9);
      turret.rotation.z = Math.PI / 2;
      g.add(turret);
      break;
    case "manaWell":
      g.add(cyl(1.1, 1.2, 0.9, stone, 0, 0.1, 0, 14));
      g.add(cyl(0.95, 0.95, 0.1, "#a855f7", 0, 0.92, 0, 14, { emissive: "#9333ea", ei: 1.2, rough: 0.2 }));
      g.add(box(0.15, 1.6, 0.15, "#7c5a3a", -1.0, 0.9), box(0.15, 1.6, 0.15, "#7c5a3a", 1.0, 0.9), box(2.2, 0.15, 0.15, "#7c5a3a", 0, 2.4));
      g.add(cone(1.4, 0.7, roof, 0, 2.5, 0, 4));
      turret.add(cyl(0.05, 0.05, 1.0, "#94a3b8", 0, -0.5, 0, 6));
      turret.position.set(0, 2.4, 0);
      g.add(turret);
      break;
    case "goldVault":
      g.add(box(2.4, 1.3 + L * 0.1, 2.0, "#7c5a3a", 0, 0.1));
      g.add(box(2.5, 0.15, 2.1, trim, 0, 0.5, 0, { metal: 0.6 }), box(2.5, 0.15, 2.1, trim, 0, 1.1 + L * 0.1, 0, { metal: 0.6 }));
      for (let i = 0; i < 3 + L; i++) g.add(sphere(0.2, "#f4c430", -0.8 + i * 0.35, 1.5 + L * 0.1, (i % 2) * 0.3 - 0.15, { metal: 0.6, rough: 0.35 }));
      break;
    case "manaVat": {
      g.add(cyl(1.0, 1.1, 0.4, stone, 0, 0.1, 0, 12));
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.4 + L * 0.12, 16), new THREE.MeshStandardMaterial({ color: "#c084fc", emissive: "#7e22ce", emissiveIntensity: 0.8, roughness: 0.15, transparent: true, opacity: 0.85 }));
      glass.position.y = 0.5 + (1.4 + L * 0.12) / 2;
      glass.castShadow = true;
      g.add(glass);
      g.add(cyl(0.9, 0.9, 0.12, trim, 0, 0.9, 0, 16, { metal: 0.6 }), cyl(0.9, 0.9, 0.12, trim, 0, 1.6 + L * 0.1, 0, 16, { metal: 0.6 }));
      break;
    }
    case "barracks":
      g.add(box(2.4, 1.2, 2.0, "#8b6a46", 0, 0.1));
      g.add(cone(1.9, 1.0, roof, 0, 1.3, 0, 4));
      g.add(cyl(0.35, 0.35, 0.08, "#c81e1e", 0, 0.5, 1.02, 12).rotateX(Math.PI / 2));
      for (let i = 0; i < L; i++) g.add(box(0.15, 0.6, 0.05, trim, -1.0 + i * 0.25, 0.9, 1.03));
      break;
    case "camp":
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const log = cyl(0.12, 0.12, 0.9, "#6b4f2e", Math.cos(a) * 1.6, 0.1, Math.sin(a) * 1.6, 6);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = -a;
        g.add(log);
      }
      g.add(cyl(0.35, 0.45, 0.2, "#3f2a17", 0, 0.1, 0, 8));
      g.add(sphere(0.3, "#fb923c", 0, 0.45, 0, { emissive: "#f97316", ei: 2 }));
      for (let i = 0; i < Math.min(4, 1 + L); i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        g.add(cone(0.55, 0.9, i % 2 ? "#e7d8b5" : "#c9b48a", Math.cos(a) * 1.1, 0.1, Math.sin(a) * 1.1, 6));
      }
      break;
    case "builderHut":
      g.add(box(1.4, 0.9, 1.3, "#a0784e", 0, 0.1));
      g.add(cone(1.1, 0.7, "#b4472f", 0, 1.0, 0, 4));
      g.add(box(0.12, 0.5, 0.5, "#94a3b8", 0.8, 0.1, 0.4, { metal: 0.6 }));
      break;
    case "clanHall":
      g.add(box(2.4, 1.6, 2.4, stone, 0, 0.1));
      g.add(cone(1.9, 1.1, "#1e40af", 0, 1.7, 0, 4));
      for (const x of [-0.6, 0.6]) {
        const banner = box(0.45, 1.0, 0.06, "#2563eb", x, 0.6, 1.23);
        g.add(banner, box(0.45, 0.12, 0.08, trim, x, 1.5, 1.23));
      }
      break;
    case "cannon": {
      g.add(cyl(1.1, 1.2, 0.5, stone, 0, 0.1, 0, 10));
      const barrel = cyl(0.22 + L * 0.02, 0.28 + L * 0.02, 1.5 + L * 0.08, L >= 4 ? "#1f2937" : "#374151", 0, 0, 0, 12, { metal: 0.7, rough: 0.35 });
      barrel.rotation.z = -Math.PI / 2;
      barrel.position.set(0.6, 0.45, 0);
      turret.add(box(0.8, 0.35, 0.9, "#7c5a3a", 0, 0.05), barrel);
      turret.position.y = 0.6;
      g.add(turret);
      break;
    }
    case "archerTower": {
      const h = 2.6 + L * 0.2;
      for (const [x, z] of [
        [-0.8, -0.8],
        [0.8, -0.8],
        [-0.8, 0.8],
        [0.8, 0.8],
      ])
        g.add(box(0.22, h, 0.22, L >= 3 ? stone : "#7c5a3a", x, 0.1, z));
      g.add(box(2.0, 0.2, 2.0, "#7c5a3a", 0, h + 0.1));
      g.add(cone(1.5, 0.8, roof, 0, h + 1.3, 0, 4));
      for (const [x, z] of [
        [-0.85, 0],
        [0.85, 0],
        [0, -0.85],
        [0, 0.85],
      ])
        g.add(box(x ? 0.12 : 1.8, 0.45, z ? 0.12 : 1.8, "#8b6a46", x, h + 0.3, z));
      const archer = new THREE.Group();
      archer.add(cyl(0.16, 0.2, 0.55, "#3fa34d", 0, 0, 0, 8), sphere(0.15, "#f1c9a5", 0, 0.7, 0));
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 4, 10, Math.PI), mat("#5b3a1e"));
      bow.position.set(0.25, 0.4, 0);
      bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
      archer.add(bow);
      turret.add(archer);
      turret.position.y = h + 0.3;
      g.add(turret);
      break;
    }
    case "mortar": {
      g.add(cyl(1.15, 1.25, 0.7, stone, 0, 0.1, 0, 10));
      const tube = cyl(0.45, 0.55, 0.9, "#1f2937", 0, 0, 0, 12, { metal: 0.6, rough: 0.4 });
      tube.rotation.z = -0.5;
      tube.position.set(0.15, 0.25, 0);
      turret.add(tube);
      turret.position.y = 0.8;
      g.add(turret);
      break;
    }
    case "spire": {
      g.add(cyl(0.9, 1.1, 0.5, stone, 0, 0.1, 0, 6));
      g.add(cyl(0.25, 0.5, 2.8 + L * 0.2, "#475569", 0, 0.6, 0, 6, { metal: 0.4 }));
      const orb = sphere(0.45, "#67e8f9", 0, 0, 0, { emissive: "#22d3ee", ei: 2.2, rough: 0.1 });
      turret.add(orb);
      turret.position.y = 3.9 + L * 0.2;
      g.add(turret);
      break;
    }
    case "airLance": {
      g.add(cyl(1.0, 1.15, 0.6, stone, 0, 0.1, 0, 8));
      for (const s2 of [-1, 1]) {
        const arm = box(0.25, 1.6, 0.25, "#1e3a8a", s2 * 0.35, 0.1, 0);
        arm.rotation.z = s2 * -0.25;
        turret.add(arm);
      }
      turret.add(cone(0.18, 0.6, "#e5e7eb", 0, 1.5, 0, 6));
      turret.position.y = 0.7;
      g.add(turret);
      break;
    }
    case "wall": {
      const colors = ["#8b6a46", "#9a948a", "#7b8190", "#5f6676", "#c8a64a"];
      g.add(box(0.96, 1.0 + L * 0.06, 0.96, colors[Math.min(L, 5) - 1], 0, 0, 0, { metal: L >= 5 ? 0.5 : 0 }));
      g.add(box(1.0, 0.12, 1.0, L >= 4 ? "#d1d5db" : "#6b5b45", 0, 1.0 + L * 0.06));
      break;
    }
  }
  // Level pips on the base (level 2+).
  if (type !== "wall" && L >= 2) for (let i = 0; i < Math.min(L, 6); i++) g.add(box(0.14, 0.08, 0.14, "#facc15", -s / 2 + 0.35 + i * 0.22, 0.12, s / 2 - 0.3, { emissive: "#facc15", ei: 0.4 }));
  return g;
}

function scaffold(size: number) {
  const g = new THREE.Group();
  const s = size / 2 - 0.15;
  for (const [x, z] of [
    [-s, -s],
    [s, -s],
    [-s, s],
    [s, s],
  ])
    g.add(box(0.08, 2.4, 0.08, "#c8a26a", x, 0.1, z));
  g.add(box(size - 0.2, 0.06, 0.08, "#c8a26a", 0, 1.3, -s), box(size - 0.2, 0.06, 0.08, "#c8a26a", 0, 1.3, s), box(0.08, 0.06, size - 0.2, "#c8a26a", -s, 1.3, 0), box(0.08, 0.06, size - 0.2, "#c8a26a", s, 1.3, 0));
  return g;
}

function rubble(size: number) {
  const g = new THREE.Group();
  for (let i = 0; i < size * 3; i++) {
    const r = box(0.3 + Math.random() * 0.5, 0.2 + Math.random() * 0.3, 0.3 + Math.random() * 0.5, Math.random() < 0.5 ? "#57534e" : "#78716c", (Math.random() - 0.5) * (size - 0.6), 0, (Math.random() - 0.5) * (size - 0.6));
    r.rotation.y = Math.random() * 3;
    g.add(r);
  }
  return g;
}

/** A troop's model. */
export function troopModel(type: TroopType): THREE.Group {
  const d = TROOPS[type];
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = "body";
  g.add(body);
  if (type === "drake") {
    const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1).scale(1.6, 0.9, 0.9), mat("#b91c1c"));
    torso.castShadow = true;
    const head = sphere(0.35, "#dc2626", 1.1, 0.25, 0);
    const tail = cone(0.25, 1.4, "#991b1b", -1.2, -0.2, 0, 6);
    tail.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.6, 0, s * 1.6), new THREE.Vector3(0.6, 0, s * 1.2)]), new THREE.MeshStandardMaterial({ color: "#7f1d1d", side: THREE.DoubleSide }));
      wing.geometry.computeVertexNormals();
      wing.name = s > 0 ? "wingR" : "wingL";
      wing.position.y = 0.3;
      body.add(wing);
    }
    body.add(torso, head, tail);
    return g;
  }
  const k = type === "brute" ? 1.7 : type === "raider" ? 0.85 : 1;
  const legs = cyl(0.13 * k, 0.15 * k, 0.35 * k, "#3f2a17", 0, 0, 0, 6);
  const torso = cyl(0.2 * k, 0.24 * k, 0.45 * k, d.color, 0, 0.32 * k, 0, 8);
  const head = sphere(0.17 * k, type === "raider" ? "#4ade80" : "#f1c9a5", 0, 0.95 * k, 0);
  body.add(legs, torso, head);
  if (type === "brawler") body.add(cyl(0.05, 0.09, 0.6, "#6b4f2e", 0.25, 0.4, 0, 6));
  if (type === "ranger") body.add(cone(0.2, 0.25, "#166534", 0, 1.05, 0, 8));
  if (type === "raider") body.add(cone(0.2, 0.3, "#5b21b6", 0, 1.0 * k, 0, 8));
  if (type === "brute") body.add(box(0.7, 0.18, 0.5, "#78350f", 0, 0.7 * k, 0));
  if (type === "sapper") body.add(cyl(0.18, 0.18, 0.35, "#7c2d12", 0.25, 0.45, 0, 8), sphere(0.06, "#fde047", 0.25, 0.85, 0, { emissive: "#fde047", ei: 3 }));
  return g;
}

export class ClanView {
  readonly pipe: SportsPipeline;
  private buildings = new Map<number, { g: THREE.Group; key: string; model: THREE.Group; turret?: THREE.Object3D; extra: THREE.Group; bar: THREE.Group }>();
  private units = new Map<number, { g: THREE.Group; type: TroopType; bar: THREE.Group }>();
  private shots = new Map<number, THREE.Object3D>();
  private fx: { m: THREE.Mesh; t: number; dur: number; grow: number }[] = [];
  private grid: THREE.LineSegments;
  private deployZone: THREE.Mesh;
  private deployTex: THREE.CanvasTexture | null = null;
  private ghost: THREE.Group | null = null;
  private ghostKey = "";
  private select: THREE.Mesh;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** Camera: the point it looks at, and how far back. */
  focus = new THREE.Vector3(0, 0, 0);
  distance = 42;
  private time = 0;
  private barGeo = new THREE.PlaneGeometry(1, 0.14);

  constructor(host: HTMLElement, detail: Detail) {
    this.pipe = new SportsPipeline(host, detail, "day", { fov: 30, shadowSpan: 36, far: 1500 });
    const { scene } = this.pipe;
    this.pipe.lights([], { sunDir: new THREE.Vector3(0.55, 0.8, 0.35), fog: 0.004 });
    this.pipe.key.intensity = 2.4;
    // The valley floor.
    const n = noise2(16, 5);
    const grass = canvasTexture(
      512,
      512,
      (g) => {
        const img = g.createImageData(512, 512);
        for (let i = 0; i < 512 * 512; i++) {
          const x = i % 512;
          const y = Math.floor(i / 512);
          const k = n(x / 512, y / 512);
          const r = Math.random();
          img.data[i * 4] = 84 + k * 30 + r * 14;
          img.data[i * 4 + 1] = 140 + k * 40 + r * 18;
          img.data[i * 4 + 2] = 54 + k * 14 + r * 8;
          img.data[i * 4 + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      },
      true,
    );
    grass.repeat.set(14, 14);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }));
    ground.receiveShadow = true;
    scene.add(ground);
    // The village's own ground: a slightly lighter, trimmed square.
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(GRID, GRID).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#8dbf5a", roughness: 0.95, transparent: true, opacity: 0.35 }));
    yard.position.y = 0.01;
    yard.receiveShadow = true;
    scene.add(yard);
    // Grid for building.
    const pts: number[] = [];
    for (let i = 0; i <= GRID; i++) {
      pts.push(i - C, 0.03, -C, i - C, 0.03, C, -C, 0.03, i - C, C, 0.03, i - C);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.18 }));
    this.grid.visible = false;
    scene.add(this.grid);
    // The deploy zone overlay (battle): red where you can't drop troops.
    const W = GRID + DEPLOY * 2;
    this.deployZone = new THREE.Mesh(new THREE.PlaneGeometry(W, W).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.32, depthWrite: false }));
    this.deployZone.position.y = 0.04;
    this.deployZone.visible = false;
    scene.add(this.deployZone);
    // Trees and rocks round the edge of the valley.
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < (detail === "low" ? 80 : 180); i++) {
      const a = rnd() * Math.PI * 2;
      const r = 30 + rnd() * 45;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x) < C + DEPLOY + 2 && Math.abs(z) < C + DEPLOY + 2) continue;
      const t = new THREE.Group();
      if (rnd() < 0.8) {
        const h = 1.6 + rnd() * 1.8;
        t.add(cyl(0.18, 0.25, h * 0.4, "#6b4f2e", 0, 0, 0, 6), cone(0.9 + rnd() * 0.5, h, rnd() < 0.5 ? "#2f6b3a" : "#3f7d3a", 0, h * 0.3, 0, 7));
      } else t.add(sphere(0.6 + rnd() * 0.8, "#8a8a85", 0, 0.3, 0));
      t.position.set(x, 0, z);
      scene.add(t);
    }
    this.select = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#facc15", transparent: true, opacity: 0.9, depthWrite: false }));
    this.select.visible = false;
    scene.add(this.select);
    this.placeCamera(1);
  }

  get canvas() {
    return this.pipe.canvas;
  }
  setResolution(k: number) {
    this.pipe.setResolution(k);
  }

  // ------------------------------------------------------------ camera

  private placeCamera(k: number) {
    const c = this.pipe.camera;
    const yaw = Math.PI / 4;
    const pitch = 0.95;
    const want = new THREE.Vector3(this.focus.x + Math.cos(yaw) * Math.cos(pitch) * this.distance, Math.sin(pitch) * this.distance, this.focus.z + Math.sin(yaw) * Math.cos(pitch) * this.distance);
    c.position.lerp(want, k);
    c.lookAt(this.focus);
  }

  /** Drag the map by screen pixels. */
  pan(dxPx: number, dyPx: number, heightPx: number) {
    const scale = (this.distance * 0.55) / Math.max(200, heightPx);
    // Screen right / up in world terms for the fixed yaw.
    const right = new THREE.Vector3(Math.cos(Math.PI / 4 + Math.PI / 2), 0, Math.sin(Math.PI / 4 + Math.PI / 2));
    const up = new THREE.Vector3(-Math.cos(Math.PI / 4), 0, -Math.sin(Math.PI / 4));
    this.focus.addScaledVector(right, -dxPx * scale).addScaledVector(up, dyPx * scale);
    const lim = C + DEPLOY + 4;
    this.focus.x = Math.max(-lim, Math.min(lim, this.focus.x));
    this.focus.z = Math.max(-lim, Math.min(lim, this.focus.z));
  }

  zoom(f: number) {
    this.distance = Math.max(16, Math.min(85, this.distance * f));
  }

  /** Tile coordinates (floats) under a screen position (normalised device coordinates). */
  tileAt(nx: number, ny: number) {
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.pipe.camera);
    const hit = this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
    return hit ? { x: hit.x + C, y: hit.z + C } : null;
  }

  // ---------------------------------------------------------- buildings

  showGrid(on: boolean) {
    this.grid.visible = on;
  }

  /** Mirror a list of buildings (village or battle). */
  syncBuildings(list: ShownBuilding[], selected = -1) {
    const seen = new Set<number>();
    for (const b of list) {
      seen.add(b.id);
      const key = `${b.type}|${b.level}|${b.busy ? 1 : 0}|${b.destroyed ? 1 : 0}|${b.x},${b.y}`;
      let e = this.buildings.get(b.id);
      if (!e || e.key !== key) {
        if (e) this.pipe.scene.remove(e.g);
        const g = new THREE.Group();
        const size = BUILDINGS[b.type].size;
        const model = b.destroyed ? rubble(size) : buildingModel(b.type, b.level || 1);
        g.add(model);
        if (b.busy && !b.destroyed) g.add(scaffold(size));
        const extra = new THREE.Group();
        g.add(extra);
        const bar = this.makeBar("#22c55e");
        bar.position.y = b.type === "wall" ? 1.6 : 3.4;
        bar.visible = false;
        g.add(bar);
        const p = toWorld(b.x + size / 2, b.y + size / 2);
        g.position.copy(p);
        this.pipe.scene.add(g);
        e = { g, key, model, turret: model.getObjectByName("turret") ?? undefined, extra, bar };
        this.buildings.set(b.id, e);
        if (b.destroyed) this.boom(b.x + size / 2, b.y + size / 2, size * 0.7, "#a8a29e");
      }
      if (e.turret && b.aim !== undefined) {
        // Models face +x; world +x is tile +x, world +z is tile +y.
        e.turret.rotation.y = -b.aim;
        if (b.type === "cannon" && (b.fired ?? 9) < 0.15) e.turret.position.x = -0.15 * (1 - (b.fired ?? 0) / 0.15);
        else if (b.type === "cannon") e.turret.position.x = 0;
      }
      if (e.turret && (b.type === "goldMine" || b.type === "manaWell") && !b.busy) e.turret.rotation.y += 0.02;
      if (b.type === "spire" && e.turret) e.turret.position.y = 3.9 + (b.level || 1) * 0.2 + Math.sin(this.time * 2) * 0.1;
      const flag = e.model.getObjectByName("flag");
      if (flag) flag.rotation.y = Math.sin(this.time * 3) * 0.3;
      // Health bar when damaged.
      e.bar.visible = b.hp !== undefined && b.hp < 0.999 && !b.destroyed;
      if (e.bar.visible) this.setBar(e.bar, b.hp ?? 1);
      // Collector bubble.
      const wantBubble = b.ready ?? null;
      if ((e.extra.userData.bubble ?? null) !== wantBubble) {
        e.extra.clear();
        e.extra.userData.bubble = wantBubble;
        if (wantBubble) {
          const bub = sphere(0.45, wantBubble === "gold" ? "#facc15" : "#c084fc", 0, 3.2, 0, { emissive: wantBubble === "gold" ? "#ca8a04" : "#9333ea", ei: 1 });
          e.extra.add(bub);
        }
      }
      if (e.extra.children[0]) e.extra.children[0].position.y = 3.2 + Math.sin(this.time * 3 + b.id) * 0.15;
    }
    for (const [id, e] of this.buildings)
      if (!seen.has(id)) {
        this.pipe.scene.remove(e.g);
        this.buildings.delete(id);
      }
    const sel = list.find((b) => b.id === selected);
    this.select.visible = !!sel;
    if (sel) {
      const size = BUILDINGS[sel.type].size;
      this.select.position.copy(toWorld(sel.x + size / 2, sel.y + size / 2)).setY(0.06);
      this.select.scale.setScalar(size * 0.75);
    }
  }

  /** The placement ghost: green if it fits, red if not. */
  setGhost(g: { type: BuildingType; x: number; y: number; ok: boolean } | null) {
    if (!g) {
      if (this.ghost) this.pipe.scene.remove(this.ghost);
      this.ghost = null;
      this.ghostKey = "";
      return;
    }
    if (this.ghostKey !== g.type) {
      if (this.ghost) this.pipe.scene.remove(this.ghost);
      this.ghost = buildingModel(g.type, 1);
      this.ghost.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.material = new THREE.MeshBasicMaterial({ color: "#4ade80", transparent: true, opacity: 0.55 });
          m.castShadow = false;
        }
      });
      this.ghostKey = g.type;
      this.pipe.scene.add(this.ghost);
    }
    const size = BUILDINGS[g.type].size;
    this.ghost!.position.copy(toWorld(g.x + size / 2, g.y + size / 2));
    this.ghost!.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) (m.material as THREE.MeshBasicMaterial).color.set(g.ok ? "#4ade80" : "#ef4444");
    });
  }

  /** Battle: show where troops can't go. */
  showDeployZone(b: Battle | null) {
    this.deployZone.visible = !!b;
    if (!b) return;
    const W = GRID + DEPLOY * 2;
    const draw = (g: CanvasRenderingContext2D) => {
      g.clearRect(0, 0, W * 4, W * 4);
      g.fillStyle = "rgba(239,68,68,0.9)";
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (!b.canDeploy(x - DEPLOY, y - DEPLOY)) g.fillRect(x * 4, y * 4, 4, 4);
    };
    if (!this.deployTex) {
      this.deployTex = canvasTexture(W * 4, W * 4, draw);
      this.deployTex.magFilter = THREE.NearestFilter;
      (this.deployZone.material as THREE.MeshBasicMaterial).map = this.deployTex;
      (this.deployZone.material as THREE.MeshBasicMaterial).needsUpdate = true;
    } else {
      draw((this.deployTex.image as HTMLCanvasElement).getContext("2d")!);
      this.deployTex.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------- troops

  syncUnits(list: Unit[], dt: number) {
    const seen = new Set<number>();
    for (const u of list) {
      seen.add(u.id);
      let e = this.units.get(u.id);
      if (!e) {
        const g = troopModel(u.type);
        const bar = this.makeBar(u.clan ? "#60a5fa" : "#4ade80");
        bar.position.y = u.type === "drake" ? 1.3 : u.type === "brute" ? 2.2 : 1.5;
        bar.scale.set(0.6, 1, 1);
        g.add(bar);
        g.traverse((o) => (o.castShadow = true));
        this.pipe.scene.add(g);
        e = { g, type: u.type, bar };
        this.units.set(u.id, e);
      }
      const g = e.g;
      const p = toWorld(u.x, u.y);
      const body = g.getObjectByName("body")!;
      if (u.dead) {
        // Down and fading.
        body.rotation.z = Math.min(Math.PI / 2, body.rotation.z + dt * 6);
        g.position.y = u.flying ? Math.max(0, g.position.y - dt * 6) : 0;
        e.bar.visible = false;
        continue;
      }
      g.position.set(p.x, u.flying ? 3 + Math.sin(this.time * 3 + u.id) * 0.2 : 0, p.z);
      g.rotation.y = -u.heading;
      const walking = u.hit > 0.4;
      body.position.y = walking && !u.flying ? Math.abs(Math.sin(this.time * 10 + u.id)) * 0.12 : 0;
      // Attack lunge.
      body.position.x = u.hit < 0.2 ? Math.sin((u.hit / 0.2) * Math.PI) * 0.25 : 0;
      const wl = body.getObjectByName("wingL");
      const wr = body.getObjectByName("wingR");
      if (wl && wr) {
        wl.rotation.x = Math.sin(this.time * 8) * 0.5;
        wr.rotation.x = -Math.sin(this.time * 8) * 0.5;
      }
      e.bar.visible = u.hp < u.maxHp;
      if (e.bar.visible) this.setBar(e.bar, u.hp / u.maxHp);
    }
    for (const [id, e] of this.units)
      if (!seen.has(id)) {
        this.pipe.scene.remove(e.g);
        this.units.delete(id);
      }
  }

  syncProjectiles(list: Projectile[]) {
    const seen = new Set<number>();
    for (const p of list) {
      seen.add(p.id);
      let m = this.shots.get(p.id);
      if (!m) {
        m =
          p.kind === "ball" || p.kind === "shell"
            ? sphere(p.kind === "shell" ? 0.3 : 0.18, "#111827")
            : p.kind === "fire"
              ? sphere(0.35, "#fb923c", 0, 0, 0, { emissive: "#f97316", ei: 3 })
              : p.kind === "bolt" || p.kind === "zap"
                ? sphere(0.18, "#67e8f9", 0, 0, 0, { emissive: "#22d3ee", ei: 3 })
                : new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 4).rotateZ(Math.PI / 2), mat("#5b3a1e"));
        this.pipe.scene.add(m);
        this.shots.set(p.id, m);
      }
      const k = Math.min(1, p.t / p.dur);
      const w = toWorld(p.x, p.y);
      // Height: arcs for shells, straight lines otherwise.
      const endZ = p.unit >= 0 ? (p.air ? 3 : 0.6) : 0.6;
      const y = p.kind === "shell" ? 1.6 + Math.sin(k * Math.PI) * 9 : p.z + (endZ - p.z) * k;
      m.position.set(w.x, y, w.z);
      m.rotation.y = -Math.atan2(p.ty - p.sy, p.tx - p.sx);
    }
    for (const [id, m] of this.shots)
      if (!seen.has(id)) {
        this.pipe.scene.remove(m);
        this.shots.delete(id);
      }
  }

  /** An explosion ring and flash at tile (x, y). */
  boom(x: number, y: number, r: number, color = "#fb923c") {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.copy(toWorld(x, y)).setY(0.15);
    this.pipe.scene.add(m);
    this.fx.push({ m, t: 0, dur: 0.5, grow: r * 2 });
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshBasicMaterial({ color: "#d6d3d1", transparent: true, opacity: 0.7, depthWrite: false }));
    puff.position.copy(toWorld(x, y)).setY(0.8);
    this.pipe.scene.add(puff);
    this.fx.push({ m: puff, t: 0, dur: 0.9, grow: r * 1.6 });
  }

  // ------------------------------------------------------------- frames

  private makeBar(color: string) {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(this.barGeo, new THREE.MeshBasicMaterial({ color: "#111827", depthTest: false }));
    const fg = new THREE.Mesh(this.barGeo, new THREE.MeshBasicMaterial({ color, depthTest: false }));
    fg.name = "fill";
    fg.position.z = 0.001;
    bg.renderOrder = 20;
    fg.renderOrder = 21;
    g.add(bg, fg);
    g.scale.set(1.4, 1, 1);
    return g;
  }

  private setBar(bar: THREE.Group, k: number) {
    const fill = bar.getObjectByName("fill") as THREE.Mesh;
    fill.scale.x = Math.max(0.001, k);
    fill.position.x = -(1 - k) / 2;
    (fill.material as THREE.MeshBasicMaterial).color.set(k > 0.5 ? (fill.material as THREE.MeshBasicMaterial).color : k > 0.25 ? "#f59e0b" : "#ef4444");
  }

  render(dt: number) {
    this.time += dt;
    this.placeCamera(Math.min(1, dt * 10));
    // Bars face the camera.
    const q = this.pipe.camera.quaternion;
    for (const e of this.buildings.values()) if (e.bar.visible) e.bar.quaternion.copy(q);
    for (const e of this.units.values()) if (e.bar.visible) e.bar.quaternion.copy(e.g.quaternion.clone().invert().multiply(q));
    this.fx = this.fx.filter((f) => {
      f.t += dt;
      const k = f.t / f.dur;
      f.m.scale.setScalar(1 + k * f.grow);
      (f.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) {
        this.pipe.scene.remove(f.m);
        return false;
      }
      return true;
    });
    this.pipe.follow(this.focus.x, this.focus.z);
    this.pipe.render();
  }

  /** Forget the battle's troops and shots (back to the village). */
  clearBattle() {
    this.syncUnits([], 0);
    this.syncProjectiles([]);
    this.showDeployZone(null);
  }

  destroy() {
    this.pipe.destroy();
  }
}
