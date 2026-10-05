import * as THREE from "three";
import { ROAD_Z, ROLES } from "../data";
import type { Crate, Person, Vehicle } from "../sim";

const SKIN = ["#f1c7a5", "#d9a37c", "#a8714f", "#7a4b2f", "#f5d6bd", "#c68b62"];
const HAIR = ["#2b1d14", "#5a3a22", "#a0703b", "#d9b36a", "#1b1b1b", "#7a7a7a"];
const CASUAL = ["#ef4444", "#f59e0b", "#84cc16", "#06b6d4", "#8b5cf6", "#ec4899", "#64748b", "#14b8a6"];
const GOWN = "#a5c8e8";

const matCache = new Map<string, THREE.MeshStandardMaterial>();
const m = (c: string, glow = 0) => {
  const k = `${c}:${glow}`;
  let x = matCache.get(k);
  if (!x) {
    x = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, emissive: glow ? new THREE.Color(c) : undefined, emissiveIntensity: glow });
    matCache.set(k, x);
  }
  return x;
};

const G = {
  leg: new THREE.BoxGeometry(0.13, 0.48, 0.14).translate(0, -0.24, 0),
  torso: new THREE.BoxGeometry(0.38, 0.5, 0.22),
  coat: new THREE.BoxGeometry(0.42, 0.72, 0.25),
  arm: new THREE.BoxGeometry(0.1, 0.46, 0.11).translate(0, -0.23, 0),
  head: new THREE.SphereGeometry(0.15, 14, 10),
  hair: new THREE.SphereGeometry(0.155, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  hat: new THREE.CylinderGeometry(0.17, 0.19, 0.12, 14),
  crate: new THREE.BoxGeometry(0.5, 0.4, 0.4),
  mop: new THREE.CylinderGeometry(0.015, 0.015, 1.1, 6),
  mopHead: new THREE.BoxGeometry(0.3, 0.04, 0.12),
  dot: new THREE.SphereGeometry(0.07, 8, 6),
};

interface Rig {
  g: THREE.Group;
  body: THREE.Group;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  crate: THREE.Mesh;
  mop: THREE.Group;
  dot: THREE.Mesh | null;
  torso: THREE.Mesh;
  key: string;
  phase: number;
}

/** What a person wears: role uniform, a gown once admitted, street clothes otherwise. */
function outfit(p: Person) {
  if (p.kind === "staff") {
    const role = p.role!;
    const c = ROLES[role].color;
    if (role === "doctor") return { top: "#f8fafc", legs: "#334155", coat: true, hat: null };
    if (role === "nurse") return { top: c, legs: c, coat: false, hat: null };
    if (role === "surgeon") return { top: c, legs: c, coat: false, hat: "#15803d" };
    if (role === "workman") return { top: "#f97316", legs: "#1e3a8a", coat: false, hat: "#facc15" };
    if (role === "janitor") return { top: "#64748b", legs: "#475569", coat: false, hat: null };
    if (role === "receptionist") return { top: c, legs: "#1f2937", coat: false, hat: null };
    return { top: c, legs: "#1f2937", coat: true, hat: null };
  }
  const gown = p.ambulance || p.state === "inStep" || p.pose === "lie";
  return { top: gown ? GOWN : CASUAL[p.id % CASUAL.length], legs: gown ? GOWN : ["#1e3a8a", "#374151", "#78350f"][p.id % 3], coat: false, hat: null };
}

function build(p: Person): Rig {
  const o = outfit(p);
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const legMat = m(o.legs);
  const legL = new THREE.Mesh(G.leg, legMat);
  const legR = new THREE.Mesh(G.leg, legMat);
  legL.position.set(-0.1, 0.5, 0);
  legR.position.set(0.1, 0.5, 0);
  const torso = new THREE.Mesh(o.coat ? G.coat : G.torso, m(o.top));
  torso.position.y = o.coat ? 0.78 : 0.76;
  const skin = m(SKIN[p.id % SKIN.length]);
  const armL = new THREE.Mesh(G.arm, o.coat ? m(o.top) : skin);
  const armR = new THREE.Mesh(G.arm, o.coat ? m(o.top) : skin);
  armL.position.set(-0.25, 0.98, 0);
  armR.position.set(0.25, 0.98, 0);
  const head = new THREE.Mesh(G.head, skin);
  head.position.y = 1.18;
  const hair = new THREE.Mesh(o.hat ? G.hat : G.hair, m(o.hat ?? HAIR[(p.id * 7) % HAIR.length]));
  hair.position.y = o.hat ? 1.3 : 1.2;
  const crate = new THREE.Mesh(G.crate, m("#b7895a"));
  crate.position.set(0, 0.95, 0.3);
  crate.visible = false;
  const mop = new THREE.Group();
  const stick = new THREE.Mesh(G.mop, m("#a16207"));
  stick.rotation.x = 0.5;
  stick.position.set(0, 0.6, 0.3);
  const mh = new THREE.Mesh(G.mopHead, m("#e5e7eb"));
  mh.position.set(0, 0.06, 0.55);
  mop.add(stick, mh);
  mop.position.x = 0.25;
  mop.visible = false;
  body.add(legL, legR, torso, armL, armR, head, hair, crate, mop);
  for (const c of [legL, legR, torso, armL, armR, head]) c.castShadow = true;
  let dot: THREE.Mesh | null = null;
  if (p.kind === "patient") {
    dot = new THREE.Mesh(G.dot, new THREE.MeshBasicMaterial({ color: "#22c55e" }));
    dot.position.y = 1.55;
    g.add(dot);
  }
  return { g, body, legL, legR, armL, armR, crate, mop, dot, torso, key: `${o.top}:${o.legs}`, phase: (p.id * 1.7) % 6.28 };
}

/** People, crates and the vehicles on the street. */
export class AgentView {
  group = new THREE.Group();
  private rigs = new Map<number, Rig>();
  private crates: THREE.InstancedMesh;
  private vehicles = new Map<number, { g: THREE.Group; lights: THREE.Mesh[] }>();
  selected = -1;
  private ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#22e5ff", transparent: true, opacity: 0.9, depthWrite: false }));

  constructor() {
    this.crates = new THREE.InstancedMesh(G.crate, m("#b7895a"), 512);
    this.crates.castShadow = true;
    this.crates.count = 0;
    this.ring.visible = false;
    this.group.add(this.crates, this.ring);
  }

  update(people: Map<number, Person>, crates: Map<number, Crate>, vehicles: Vehicle[], t: number, night: number) {
    for (const [id, r] of this.rigs)
      if (!people.has(id)) {
        this.group.remove(r.g);
        this.rigs.delete(id);
      }
    for (const p of people.values()) {
      let r = this.rigs.get(p.id);
      const want = outfit(p);
      if (r && r.key !== `${want.top}:${want.legs}`) {
        this.group.remove(r.g);
        r = undefined;
      }
      if (!r) {
        r = build(p);
        this.rigs.set(p.id, r);
        this.group.add(r.g);
      }
      this.pose(r, p, t);
    }
    // Crates waiting on the ground.
    const mx = new THREE.Matrix4();
    let n = 0;
    for (const c of crates.values()) {
      if (c.carriedBy || n >= 512) continue;
      mx.makeRotationY((c.id * 1.3) % 1.2).setPosition(c.x, 0.2, c.z);
      this.crates.setMatrixAt(n++, mx);
    }
    this.crates.count = n;
    this.crates.instanceMatrix.needsUpdate = true;
    this.updateVehicles(vehicles, t, night);
    const sel = this.rigs.get(this.selected);
    this.ring.visible = !!sel;
    if (sel) this.ring.position.set(sel.g.position.x, 0.06, sel.g.position.z);
  }

  private pose(r: Rig, p: Person, t: number) {
    const g = r.g;
    const at = p.at;
    g.position.set(at ? at.x : p.x, 0, at ? at.z : p.z);
    g.rotation.set(0, p.heading, 0);
    r.body.position.set(0, 0, 0);
    r.body.rotation.set(0, 0, 0);
    r.legL.rotation.set(0, 0, 0);
    r.legR.rotation.set(0, 0, 0);
    r.armL.rotation.set(0, 0, 0);
    r.armR.rotation.set(0, 0, 0);
    r.crate.visible = !!p.carrying;
    r.mop.visible = p.pose === "clean";
    const k = t * 9 + r.phase;
    switch (p.pose) {
      case "walk":
      case "carry": {
        const s = Math.sin(k) * 0.55;
        r.legL.rotation.x = s;
        r.legR.rotation.x = -s;
        r.body.position.y = Math.abs(Math.cos(k)) * 0.04;
        if (p.carrying) {
          r.armL.rotation.x = r.armR.rotation.x = -1.1;
        } else {
          r.armL.rotation.x = -s * 0.8;
          r.armR.rotation.x = s * 0.8;
        }
        break;
      }
      case "sit":
        r.body.position.y = -0.05;
        r.legL.rotation.x = r.legR.rotation.x = -1.45;
        r.legL.position.y = r.legR.position.y = 0.5;
        r.armL.rotation.x = r.armR.rotation.x = -0.5;
        break;
      case "lie":
      case "dead":
        r.body.rotation.x = -Math.PI / 2;
        r.body.position.set(0, p.pose === "dead" ? 0.15 : 0.82, -0.6);
        g.rotation.y = p.heading;
        break;
      case "clean":
        r.armL.rotation.x = r.armR.rotation.x = -0.6 + Math.sin(k * 0.6) * 0.25;
        r.mop.rotation.y = Math.sin(k * 0.6) * 0.5;
        break;
      case "work":
        r.armR.rotation.x = -1.2 + Math.sin(k * 1.3) * 0.5;
        r.armL.rotation.x = -0.8;
        break;
    }
    // Lying people line up with the bed under them.
    if ((p.pose === "lie" || p.pose === "dead") && at) g.rotation.y = 0;
    if (r.dot) {
      const h = p.health;
      (r.dot.material as THREE.MeshBasicMaterial).color.set(p.pose === "dead" ? "#475569" : h > 60 ? "#22c55e" : h > 30 ? "#facc15" : "#ef4444");
      r.dot.position.set(0, p.pose === "lie" ? 1.35 : p.pose === "sit" ? 1.45 : 1.55, 0);
      r.dot.visible = p.state !== "leaving";
    }
  }

  private updateVehicles(vs: Vehicle[], t: number, night: number) {
    for (const [id, v] of this.vehicles)
      if (!vs.some((x) => x.id === id)) {
        this.group.remove(v.g);
        this.vehicles.delete(id);
      }
    for (const v of vs) {
      let e = this.vehicles.get(v.id);
      if (!e) {
        e = v.kind === "truck" ? truck() : ambulance();
        this.vehicles.set(v.id, e);
        this.group.add(e.g);
      }
      e.g.position.set(v.x, 0, ROAD_Z + 1.6);
      const flash = v.kind === "ambulance" && v.state !== "out";
      e.lights.forEach((l, i) => {
        const on = flash ? Math.sin(t * 14 + i * Math.PI) > 0 : v.kind === "truck" && night > 0.3;
        l.visible = on || v.kind === "truck";
        (l.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 2.4 : 0.1;
      });
    }
  }

  /** Nearest person to a ground point (for clicking). */
  pick(x: number, z: number, people: Map<number, Person>) {
    let best = -1;
    let bd = 0.7;
    for (const p of people.values()) {
      const px = p.at ? p.at.x : p.x;
      const pz = p.at ? p.at.z : p.z;
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) {
        bd = d;
        best = p.id;
      }
    }
    return best;
  }
}

function wheels(g: THREE.Group, len: number) {
  const geo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 14).rotateX(Math.PI / 2);
  for (const x of [-len * 0.32, len * 0.32])
    for (const z of [-0.85, 0.85]) {
      const w = new THREE.Mesh(geo, m("#111827"));
      w.position.set(x, 0.35, z);
      g.add(w);
    }
}

function truck() {
  const g = new THREE.Group();
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 1.9), m("#e5e7eb"));
  cargo.position.set(-0.7, 1.45, 0);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.85), m("#2563eb"));
  cab.position.set(1.85, 1.15, 0);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 1.6), m("#93c5fd"));
  win.position.set(2.56, 1.5, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.62, 0.3, 1.92), m("#f97316"));
  stripe.position.set(-0.7, 1.2, 0);
  for (const x of [cargo, cab, stripe]) x.castShadow = true;
  g.add(cargo, cab, win, stripe);
  wheels(g, 4.6);
  const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.3), m("#fef9c3", 2));
  l1.position.set(2.57, 0.7, 0.6);
  const l2 = l1.clone();
  l2.position.z = -0.6;
  g.add(l1, l2);
  return { g, lights: [l1, l2] };
}

function ambulance() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.9, 1.9), m("#f8fafc"));
  body.position.set(-0.4, 1.3, 0);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 1.85), m("#f8fafc"));
  cab.position.set(1.85, 1.05, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.62, 0.25, 1.94), m("#dc2626"));
  stripe.position.set(0.2, 1.0, 0);
  const crossA = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 1.95), m("#dc2626"));
  crossA.position.set(-0.6, 1.75, 0);
  const crossB = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 1.95), m("#dc2626"));
  crossB.position.set(-0.6, 1.75, 0);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 1.6), m("#93c5fd"));
  win.position.set(2.46, 1.3, 0);
  for (const x of [body, cab]) x.castShadow = true;
  g.add(body, cab, stripe, crossA, crossB, win);
  wheels(g, 4.4);
  // Each light gets its own material so they can flash out of step.
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.5), m("#3b82f6", 2).clone());
  blue.position.set(1.6, 1.82, 0.45);
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.5), m("#ef4444", 2).clone());
  red.position.set(1.6, 1.82, -0.45);
  g.add(blue, red);
  return { g, lights: [blue, red] };
}
