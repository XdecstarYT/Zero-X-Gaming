import * as THREE from "three";
import { WATER_Y, type Landmark } from "../world";
import { merge, paint } from "./models";
import { FacadeSheet, type Look } from "./sheet";
import { moonFace, neonSign } from "./textures";

/**
 * The landmark extras the real footprints can't give: the station's copper dome and clocks, the
 * Arts Centre's lattice spire, the cathedral's three spires, the observation wheel, the Bolte's
 * twin pylons, the MCG's light towers, the fun park's grinning gate and the pier kiosk. The real
 * buildings come from the map; these stand on (or beside) them.
 *
 * Each is built round its centre with local x along its street, from the roof it stands on, then
 * turned by `rot`. Walls with windows go through the facade shader; the rest are vertex-coloured.
 */

export interface LandmarkMats {
  facade: THREE.Material;
  solid: THREE.Material;
  lit: THREE.Material;
}

export interface LandmarkModel {
  group: THREE.Group;
  /** Parts that turn slowly (the wheels), round their own z axis. */
  spin: THREE.Object3D[];
  /** Signs and screens, brightened at night. */
  signs: THREE.MeshBasicMaterial[];
}

type V3 = [number, number, number];
const C = (s: string) => new THREE.Color(s);

/** Face → turn about y that brings local +z round to it (0 east, 1 south, 2 west, 3 north). */
export const faceTurn = (face: number) => [Math.PI / 2, 0, -Math.PI / 2, Math.PI][face];

/* ------------------------------------------------------------------------------ shapes */

function tris(pos: number[], color: string | THREE.Color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return paint(g, color);
}

function bx(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  if (ry) g.rotateY(ry);
  g.translate(x, y + h / 2, z);
  return paint(g, color);
}

function cy(r0: number, r1: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 12, open = false) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, open).toNonIndexed();
  g.translate(x, y + h / 2, z);
  return paint(g, color);
}

function dome(r: number, color: string, x: number, y: number, z: number, squash = 1, seg = 16) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(4, seg / 2), 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
  g.scale(1, squash, 1);
  g.translate(x, y, z);
  return paint(g, color);
}

/** A spire: a pyramid (4 sides) or a cone. */
function spire(r: number, h: number, color: string, x: number, y: number, z: number, seg = 4) {
  const g = new THREE.ConeGeometry(r, h, seg).toNonIndexed();
  if (seg === 4) g.rotateY(Math.PI / 4);
  g.translate(x, y + h / 2, z);
  return paint(g, color);
}

/** A rod from a to b. */
function rod(a: V3, b: V3, r: number, color: string, seg = 5) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true).toNonIndexed();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return paint(g, color);
}

/** A gabled roof over a rectangle, ridge along x (or z), with its gable ends. */
function gable(x0: number, z0: number, x1: number, z1: number, y: number, rise: number, color: string, alongX = x1 - x0 >= z1 - z0, eave = 0.5) {
  x0 -= eave;
  x1 += eave;
  z0 -= eave;
  z1 += eave;
  const p: number[] = [];
  const t = (a: V3, b: V3, c: V3) => p.push(...a, ...b, ...c);
  if (alongX) {
    const zm = (z0 + z1) / 2;
    const r0: V3 = [x0, y + rise, zm];
    const r1: V3 = [x1, y + rise, zm];
    t([x0, y, z1], [x1, y, z1], r1);
    t([x0, y, z1], r1, r0);
    t([x1, y, z0], [x0, y, z0], r0);
    t([x1, y, z0], r0, r1);
    t([x0, y, z0], [x0, y, z1], r0);
    t([x1, y, z1], [x1, y, z0], r1);
  } else {
    const xm = (x0 + x1) / 2;
    const r0: V3 = [xm, y + rise, z0];
    const r1: V3 = [xm, y + rise, z1];
    t([x1, y, z1], [x1, y, z0], r0);
    t([x1, y, z1], r0, r1);
    t([x0, y, z0], [x0, y, z1], r1);
    t([x0, y, z0], r1, r0);
    t([x1, y, z0], [x0, y, z0], r0);
    t([x0, y, z1], [x1, y, z1], r1);
  }
  return tris(p, color);
}

/** Give any geometry the facade shader's inputs. */
function facadeGeo(g: THREE.BufferGeometry, look: Look, color: THREE.Color) {
  const ng = g.index ? g.toNonIndexed() : g;
  const n = ng.attributes.position.count;
  const col = new Float32Array(n * 3);
  const fac = new Float32Array(n * 4);
  const acc = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    col.set([color.r, color.g, color.b], i * 3);
    fac.set([look.type, look.floor, look.gf, look.seed], i * 4);
    acc.set([look.accent.r, look.accent.g, look.accent.b, look.shop ? 1 : 0], i * 4);
  }
  ng.setAttribute("color", new THREE.BufferAttribute(col, 3));
  ng.setAttribute("aFac", new THREE.BufferAttribute(fac, 4));
  ng.setAttribute("aAcc", new THREE.BufferAttribute(acc, 4));
  if (!ng.attributes.uv) ng.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return ng;
}

/* ------------------------------------------------------------------------------ the builder */

class Kit {
  fs = new FacadeSheet();
  fac: THREE.BufferGeometry[] = [];
  solid: THREE.BufferGeometry[] = [];
  lit: THREE.BufferGeometry[] = [];
  spinSolid: THREE.BufferGeometry[] = [];
  spinLit: THREE.BufferGeometry[] = [];
  spinAt: V3 | null = null;
  extra: THREE.Object3D[] = [];
  signs: THREE.MeshBasicMaterial[] = [];
  wall = C("#cccccc");
  private n = 0;
  constructor(private seed: number) {}

  /** Set the facade for the walls that follow. */
  look(type: number, color: string, accent: string, floor = 3.6, gf = 0, shop = false) {
    this.fs.look = { type, floor, gf, seed: (this.seed + this.n++ * 0.137) % 1, accent: C(accent), shop };
    this.wall = C(color);
  }
  /** A block of walls (and a roof) in the current facade. */
  block(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, top = true) {
    this.fs.walls(x0, z0, x1, z1, y0, y1, this.wall);
    if (top) this.fs.flat(x0, z0, x1, z1, y1, this.wall.clone().multiplyScalar(0.62));
  }
  /** Any shape in the current facade. */
  shape(g: THREE.BufferGeometry) {
    this.fac.push(facadeGeo(g, this.fs.look, this.wall));
  }
  s(...g: THREE.BufferGeometry[]) {
    this.solid.push(...g);
  }
  l(...g: THREE.BufferGeometry[]) {
    this.lit.push(...g);
  }
  /** A picture on a plane (a sign, a screen, a face), facing +z at (x, y, z). */
  picture(tex: THREE.Texture, w: number, h: number, x: number, y: number, z: number, ry = 0, basic = true) {
    const mat = basic ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    if (basic) this.signs.push(mat as THREE.MeshBasicMaterial);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.extra.push(m);
  }
}

/* ------------------------------------------------------------------------------ the landmarks */

const COPPER = "#5f8a76";
const WHITE = "#eef0f0";


function stationDome(k: Kit, y: number) {
  // The drum, the copper dome and its lantern over the corner entrance; a ring of clocks below.
  const ochre = "#d9a04a";
  const brick = "#a8452e";
  k.s(cy(9.5, 9.5, 7, ochre, 0, y, 0, 16), cy(10.2, 10.2, 0.8, brick, 0, y + 7, 0, 16));
  k.s(dome(9.6, COPPER, 0, y + 7.8, 0, 1.05, 20), cy(1.4, 1, 4, ochre, 0, y + 17.6, 0, 8), dome(1.6, COPPER, 0, y + 21.6, 0, 1.4, 8));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const c = new THREE.CircleGeometry(1.1, 14).toNonIndexed();
    c.rotateY(Math.PI / 2 - a);
    c.translate(Math.cos(a) * 9.55, y + 3.6, Math.sin(a) * 9.55);
    k.l(paint(c, "#fff6dc"));
  }
  k.l(cy(10.25, 10.25, 0.12, "#ffe2a0", 0, y + 7.84, 0, 32, true));
}

function artsSpire(k: Kit, y0: number, top: number) {
  // Twelve white legs from a wide base to a needle, hooped with lights.
  const s = Math.max(0.5, (top - y0) / 136);
  const path: [number, number][] = [[18, 0], [8, 28 * s], [3, 84 * s], [0, 104 * s]].map(([r, y]) => [r, y0 + y]);
  const at = (y: number) => {
    for (let i = 0; i < path.length - 1; i++) {
      const [r0, ya] = path[i];
      const [r1, yb] = path[i + 1];
      if (y <= yb) return r0 + ((r1 - r0) * (y - ya)) / (yb - ya);
    }
    return 0;
  };
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    for (let i = 0; i < path.length - 1; i++) {
      const [r0, ya] = path[i];
      const [r1, yb] = path[i + 1];
      k.s(rod([Math.cos(ang) * r0, ya, Math.sin(ang) * r0], [Math.cos(ang) * r1, yb, Math.sin(ang) * r1], i === 0 ? 0.35 : 0.25, WHITE, 4));
    }
  }
  const yTop = path[path.length - 1][1];
  for (let y = y0 + 4; y < yTop - 4; y += y < y0 + 30 ? 5 : 8) {
    const ring = new THREE.TorusGeometry(at(y), 0.14, 4, 32).toNonIndexed();
    ring.rotateX(Math.PI / 2);
    ring.translate(0, y, 0);
    k.l(paint(ring, "#a8c6ff"));
  }
  k.s(cy(0.35, 0.08, Math.max(8, top - yTop), WHITE, 0, yTop, 0, 6));
}

function cathedral(k: Kit, ld: number, base: number) {
  // Two towers at the Swanston St end and a taller one over the crossing, each with its spire.
  const stone = "#b19a7a";
  const roof = Math.max(base, 18);
  for (const sz of [-1, 1]) {
    k.look(2, stone, "#6f5f4a", 8, 0);
    k.block(-ld + 6, sz * 7 - 3.6, -ld + 13.2, sz * 7 + 3.6, 0, roof + 12);
    k.s(spire(4.4, 34, "#8f8270", -ld + 9.6, roof + 12, sz * 7, 8));
    for (const [px, pz] of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]]) k.s(spire(0.7, 6, "#8f8270", -ld + 9.6 + px, roof + 12, sz * 7 + pz, 4));
  }
  k.look(2, stone, "#6f5f4a", 8, 0);
  k.block(-1, -5, 9, 5, roof - 2, roof + 18);
  k.s(spire(5.6, 50, "#8f8270", 4, roof + 18, 0, 8));
  const rose = new THREE.CircleGeometry(2.6, 16).toNonIndexed();
  rose.rotateY(-Math.PI / 2);
  rose.translate(-ld + 5.9, roof - 4, 0);
  k.l(paint(rose, "#d6a64a"));
}

function boltePylons(k: Kit, deck: number) {
  // Twin pylons standing either side of the freeway, high over the harbour mouth, and the
  // crossbeam under the deck.
  for (const side of [-1, 1]) {
    const x = side * 17;
    const g = new THREE.CylinderGeometry(2.4, 4.4, 140 - WATER_Y, 4).toNonIndexed();
    g.rotateY(Math.PI / 4);
    g.translate(x, WATER_Y + (140 - WATER_Y) / 2, 0);
    k.s(paint(g, "#a4a9ae"));
    k.l(bx(0.5, 0.5, 0.5, "#ff3a2a", x, 140.5, 0));
  }
  k.s(bx(38, 2.4, 4, "#a4a9ae", 0, deck - 3, 0));
}

function mcgLights(k: Kit, R: number, H: number) {
  // Six light towers round the bowl leaning in, their lamp banks lit.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * (R + 3);
    const z = Math.sin(a) * (R + 3);
    k.s(cy(1.3, 0.8, H, "#c9cdd2", x, 0, z, 8));
    const bank = new THREE.BoxGeometry(9, 5, 0.8).toNonIndexed();
    bank.rotateX(0.5);
    bank.rotateY(-a - Math.PI / 2);
    bank.translate(x * 0.97, H + 2, z * 0.97);
    k.l(paint(bank, "#fffbe8"));
  }
}

function lunaGate(k: Kit) {
  // A cream block with a huge grinning face (the way in is through its mouth), striped towers.
  k.look(4, "#f0e2b0", "#d7352b", 60, 0);
  k.block(-11, -5, 11, 5, 0, 18);
  k.picture(moonFace(), 16, 16, 0, 9.5, 5.05, 0, false);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) k.s(bx(5, 4.4, 5, i % 2 ? "#d7352b" : "#f6e7b0", sx * 13.5, i * 4.4, 0));
    k.s(dome(3, "#d7352b", sx * 13.5, 26.4, 0, 1.4, 10), cy(0.08, 0.06, 4, "#ffffff", sx * 13.5, 30.4, 0, 4));
    for (let y = 2; y < 26; y += 2) k.l(bx(0.25, 0.25, 0.25, "#ffe08a", sx * 13.5 + sx * 2.6, y, 2.6));
  }
  k.picture(neonSign("JUST FOR FUN", "#ffd23f"), 18, 3.2, 0, 20, 5.1);
}

function wheel(k: Kit) {
  // The A-frame legs to the hub; the rim, spokes and capsules turn.
  const H = 66;
  const R = 54;
  k.spinAt = [0, H, 0];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.s(rod([sx * 15, 0, sz * 8], [sx * 1.5, H, sz * 2.4], 1.1, WHITE, 8));
  k.s(bx(34, 1.2, 18, "#c9cdd2", 0, 0, 0), bx(14, 10, 10, "#3a4650", 0, 0, 0));
  const hub = new THREE.CylinderGeometry(2.6, 2.6, 6, 16).toNonIndexed();
  hub.rotateX(Math.PI / 2);
  k.spinSolid.push(paint(hub, WHITE));
  for (const z of [-2.2, 2.2]) {
    const rim = new THREE.TorusGeometry(R, 0.7, 6, 96).toNonIndexed();
    rim.translate(0, 0, z);
    k.spinSolid.push(paint(rim, WHITE));
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      k.spinSolid.push(rod([Math.cos(a) * 2.4, Math.sin(a) * 2.4, z * 1.2], [Math.cos(a) * R, Math.sin(a) * R, z], 0.12, "#dfe3e6", 4));
    }
  }
  for (let i = 0; i < 21; i++) {
    const a = (i / 21) * Math.PI * 2;
    const g = new THREE.CapsuleGeometry(1.6, 3.4, 4, 10).toNonIndexed();
    g.rotateZ(Math.PI / 2);
    g.translate(Math.cos(a) * (R + 2.4), Math.sin(a) * (R + 2.4), 0);
    k.spinSolid.push(paint(g, "#9fc4dc"));
  }
  const led = new THREE.TorusGeometry(R + 0.9, 0.22, 4, 120).toNonIndexed();
  k.spinLit.push(paint(led, "#d8f0ff"));
}

function kiosk(k: Kit) {
  k.look(4, "#efe5cf", "#2f5a3a", 5, 0);
  k.block(-7.5, -10.5, 7.5, 10.5, 0, 5, false);
  k.s(gable(-7.5, -10.5, 7.5, 10.5, 5, 3, "#a33a2a", false, 0.6));
  for (const [x, z] of [[-7.5, -10.5], [7.5, -10.5], [-7.5, 10.5], [7.5, 10.5]]) k.s(cy(1.6, 1.6, 7, "#efe5cf", x, 0, z, 10), dome(1.8, "#3f6f4f", x, 7, z, 1.3, 10));
  k.s(cy(1.2, 1.2, 3, "#efe5cf", 0, 7, 0, 8), dome(1.4, "#3f6f4f", 0, 10, 0, 1.4, 8));
}

/* ------------------------------------------------------------------------------ assembly */

export function buildLandmark(l: Landmark, mats: LandmarkMats): LandmarkModel {
  const k = new Kit((Math.abs(l.x * 0.013 + l.z * 0.007) % 1) + 0.1);
  switch (l.kind) {
    case "dome":
      stationDome(k, Math.max(l.base, 14));
      break;
    case "spire":
      artsSpire(k, Math.max(l.base, 20), l.h);
      break;
    case "cathedral":
      cathedral(k, Math.max(l.hw, l.hd), l.base);
      break;
    case "wheel":
      wheel(k);
      break;
    case "bolte":
      boltePylons(k, 8.2);
      break;
    case "mcglights":
      mcgLights(k, l.hw, l.h);
      break;
    case "lunagate":
      lunaGate(k);
      break;
    case "kiosk":
      kiosk(k);
      break;
  }
  const group = new THREE.Group();
  group.name = `landmark-${l.kind}`;
  group.position.set(l.x, 0, l.z);
  group.rotation.y = l.rot;
  const add = (to: THREE.Object3D, list: THREE.BufferGeometry[], mat: THREE.Material, shadow: boolean) => {
    if (!list.length) return;
    const m = new THREE.Mesh(merge(list), mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    to.add(m);
  };
  if (!k.fs.empty) k.fac.push(k.fs.geometry());
  add(group, k.fac, mats.facade, true);
  add(group, k.solid, mats.solid, true);
  add(group, k.lit, mats.lit, false);
  for (const o of k.extra) group.add(o);
  const spin: THREE.Object3D[] = [];
  if (k.spinAt) {
    const s = new THREE.Group();
    s.position.set(...k.spinAt);
    add(s, k.spinSolid, mats.solid, true);
    add(s, k.spinLit, mats.lit, false);
    group.add(s);
    spin.push(s);
  }
  group.updateMatrixWorld(true);
  return { group, spin, signs: k.signs };
}
