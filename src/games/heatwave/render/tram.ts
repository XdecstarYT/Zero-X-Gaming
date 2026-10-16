import * as THREE from "three";
import { at, tracksFor } from "../trams";
import type { Car, State } from "../state";
import { TRAMS } from "../world";
import { box, cyl, merge } from "./models";
import { shopSign } from "./textures";

/**
 * Melbourne's trams. The modern E-class: three articulated sections in white with lime and teal,
 * a dark window band, doors, a pantograph up to the wire and an amber destination sign. The City
 * Circle's W-class: one body in maroon and gold with a clerestory roof and a trolley pole. Each
 * section follows the rails on its own, so the tram bends round the corners.
 */

export interface TramModel {
  group: THREE.Group;
  sections: THREE.Group[];
  len: number;
  heads: THREE.MeshBasicMaterial;
}

const glass = new THREE.MeshStandardMaterial({ color: "#151b20", roughness: 0.05, metalness: 0.7 });
const body = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.15 });
const signCache = new Map<string, THREE.MeshBasicMaterial>();

function sign(route: number) {
  const r = TRAMS[route];
  let m = signCache.get(r.id);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: shopSign(`${r.num}  ${r.name.split("–").pop()!.trim()}`, "#0d0d0d", "#ffb21a"), toneMapped: false });
    signCache.set(r.id, m);
  }
  return m;
}

/** One section, front toward +x, centred, sitting on the rails. */
function eSection(L: number, front: boolean, back: boolean, panto: boolean, route: number, heads: THREE.MeshBasicMaterial) {
  const g = new THREE.Group();
  const W = 2.65;
  const parts: THREE.BufferGeometry[] = [
    // Skirt and bogie shroud, the white body, the roof.
    box(L - 0.2, 0.5, W - 0.1, "#2b2f33", 0, 0.12, 0),
    box(L, 2.55, W, "#eceeed", 0, 0.55, 0),
    box(L - 0.3, 0.32, W - 0.35, "#d9dcdc", 0, 3.1, 0),
    // Lime along the bottom, teal round the doors.
    box(L + 0.01, 0.28, W + 0.02, "#78be20", 0, 0.62, 0),
  ];
  for (const s of [-1, 1]) for (const dx of L > 9 ? [-L * 0.22, L * 0.22] : [0]) parts.push(box(1.35, 2.1, 0.04, "#00a7a0", dx, 0.75, s * (W / 2 + 0.01)));
  // Roof gear: air-con pods, and the pantograph on the middle section.
  parts.push(box(2.4, 0.4, 1.6, "#c9cdd0", -L * 0.2, 3.42, 0));
  if (panto) {
    parts.push(box(1.6, 0.25, 1.2, "#3a3f44", 0, 3.42, 0));
    const arm = (a: number[], b: number[]) => {
      const va = new THREE.Vector3(...a);
      const vb = new THREE.Vector3(...b);
      const d = vb.clone().sub(va);
      const c = new THREE.CylinderGeometry(0.04, 0.04, d.length(), 4).toNonIndexed();
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
      c.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      return c;
    };
    for (const s of [-0.4, 0.4]) parts.push(colour(arm([-0.6, 3.65, s], [0.5, 4.6, s * 0.6]), "#2b2f33"), colour(arm([0.5, 4.6, s * 0.6], [-0.1, 5.55, 0]), "#2b2f33"));
    parts.push(box(0.2, 0.06, 1.7, "#2b2f33", -0.1, 5.52, 0));
  }
  if (front) parts.push(box(0.5, 2.3, W - 0.2, "#eceeed", L / 2 + 0.2, 0.55, 0), box(0.3, 0.32, W - 0.4, "#78be20", L / 2 + 0.3, 0.62, 0));
  if (back) parts.push(box(0.5, 2.3, W - 0.2, "#eceeed", -L / 2 - 0.2, 0.55, 0));
  g.add(new THREE.Mesh(merge(parts), body));
  // The window band and windscreens.
  const win = new THREE.Mesh(new THREE.BoxGeometry(L - 0.5, 1.15, W + 0.02).translate(0, 2.05, 0), glass);
  g.add(win);
  for (const [on, x] of [[front, L / 2 + 0.46], [back, -L / 2 - 0.46]] as [boolean, number][]) {
    if (!on) continue;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, W - 0.5).translate(x, 2.0, 0), glass));
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), sign(route));
    d.position.set(x + Math.sign(x) * 0.04, 2.95, 0);
    d.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(d);
    for (const s of [-0.95, 0.95]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.34).translate(x + Math.sign(x) * 0.02, 0.95, s), heads);
      g.add(h);
    }
  }
  return g;
}

function colour(g: THREE.BufferGeometry, c: string) {
  const col = new THREE.Color(c);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}

function wSection(route: number, heads: THREE.MeshBasicMaterial) {
  const g = new THREE.Group();
  const L = 14.2;
  const W = 2.7;
  const maroon = "#6e1a26";
  const gold = "#c9a24a";
  const parts: THREE.BufferGeometry[] = [
    box(L - 2, 0.6, W - 0.3, "#1c1c1c", 0, 0.1, 0),
    box(L, 1.25, W, maroon, 0, 0.65, 0),
    box(L + 0.01, 0.12, W + 0.02, gold, 0, 1.75, 0),
    box(L - 0.2, 0.3, W - 0.1, maroon, 0, 2.95, 0),
    // The clerestory roof.
    box(L - 0.4, 0.22, W - 0.2, "#4a2a20", 0, 3.25, 0),
    box(L - 3, 0.3, 1.2, "#3a2a22", 0, 3.47, 0),
    // Bumpers, steps, the trolley pole to the wire.
    box(0.3, 0.3, W - 0.6, "#1c1c1c", L / 2 + 0.1, 0.5, 0),
    box(0.3, 0.3, W - 0.6, "#1c1c1c", -L / 2 - 0.1, 0.5, 0),
    cyl(0.12, 0.12, 0.3, "#1c1c1c", -2, 3.47, 0, 6),
  ];
  const pole = new THREE.CylinderGeometry(0.035, 0.035, 5.2, 4).toNonIndexed();
  pole.rotateZ(Math.PI / 2 - 0.42);
  pole.translate(-2 + 2.38, 3.6 + 1.05, 0);
  parts.push(colour(pole, "#1c1c1c"));
  g.add(new THREE.Mesh(merge(parts), body));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(L - 0.3, 1.05, W + 0.02).translate(0, 2.0, 0), glass));
  for (const x of [L / 2 + 0.01, -L / 2 - 0.01]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.28), sign(route));
    d.position.set(x, 3.05, 0);
    d.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(d);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6).translate(x, 1.3, 0), heads));
  }
  return g;
}

export function buildTram(kind: "tram" | "wtram", route: number): TramModel {
  const group = new THREE.Group();
  const heads = new THREE.MeshBasicMaterial({ color: "#fff4d8", toneMapped: false });
  let sections: THREE.Group[];
  let len: number;
  if (kind === "wtram") {
    sections = [wSection(route, heads)];
    len = 14.5;
  } else {
    const L = 10.6;
    sections = [eSection(L, true, false, false, route, heads), eSection(L, false, false, true, route, heads), eSection(L, false, true, false, route, heads)];
    len = 33;
  }
  for (const s of sections) {
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    group.add(s);
  }
  return { group, sections, len, heads };
}

/** Lay the sections along the rails round the tram's middle. */
export function poseTram(s: State, c: Car, m: TramModel, night: number) {
  const tr = c.tram;
  if (!tr) return;
  const t = tracksFor(s.city)[tr.route * 2 + tr.dir];
  const n = m.sections.length;
  const Ls = m.len / n;
  for (let k = 0; k < n; k++) {
    const d = tr.s + m.len / 2 - Ls * (k + 0.5);
    const a = at(t, d + Ls * 0.42);
    const b = at(t, d - Ls * 0.42);
    const sec = m.sections[k];
    sec.position.set((a.x + b.x) / 2, 0.03, (a.z + b.z) / 2);
    sec.rotation.set(0, -Math.atan2(a.z - b.z, a.x - b.x), 0);
  }
  m.heads.color.setScalar(0.6 + night * 1.8);
}
