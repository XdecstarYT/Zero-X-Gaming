import * as THREE from "three";
import { WATER_Y, type Landmark } from "../world";
import { merge, paint } from "./models";
import { FacadeSheet, type Look } from "./sheet";
import { bigScreen, moonFace, neonSign } from "./textures";

/**
 * Melbourne's landmarks, modelled: the station with its dome and clocks, the square's shards, the
 * cathedral's spires, the gold-crowned and black-and-gold towers, the Arts Centre spire, the
 * casino and its riverside hotel, two stadiums, the observation wheel, the twin pylons and the
 * cable-stayed bridge, the war memorial, the domed exhibition hall, Parliament's colonnade, the
 * market sheds, the fun park's grinning gate and its scenic railway, the seaside theatre, the pier
 * kiosk, a ferry at Station Pier, the station with the wavy roof and the river boathouses.
 *
 * Each is built facing +z (its front) round its centre, then turned to face its street. Walls that
 * should have windows go through the facade shader; the rest are vertex-coloured shapes.
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

/** A disc of ground made of a grid (so it can carry stripes), squircle-mapped. */
function disc(r: number, y: number, n: number, colorAt: (x: number, z: number) => THREE.Color, sx = 1, sz = 1) {
  const g = new THREE.PlaneGeometry(2, 2, n, n).rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i);
    const v = p.getZ(i);
    p.setXYZ(i, u * Math.sqrt(1 - (v * v) / 2) * r * sx, y, v * Math.sqrt(1 - (u * u) / 2) * r * sz);
  }
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  const q = ng.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(q.count * 3);
  // Colour per triangle (from its centre), so stripes stay crisp.
  for (let i = 0; i < q.count; i += 3) {
    const cx = (q.getX(i) + q.getX(i + 1) + q.getX(i + 2)) / 3;
    const cz = (q.getZ(i) + q.getZ(i + 1) + q.getZ(i + 2)) / 3;
    const c = colorAt(cx, cz);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  ng.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return ng;
}

/** A deck or girder swept along z through (z, y) samples: top, sides and underside. */
function loft(samples: [number, number][], halfW: number, thick: number, color: string, x = 0) {
  const p: number[] = [];
  const q = (a: V3, b: V3, c: V3, d: V3) => p.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < samples.length - 1; i++) {
    const [za, ya] = samples[i];
    const [zb, yb] = samples[i + 1];
    const L = x - halfW;
    const R = x + halfW;
    q([L, ya, za], [L, yb, zb], [R, yb, zb], [R, ya, za]);
    q([R, ya - thick, za], [R, yb - thick, zb], [L, yb - thick, zb], [L, ya - thick, za]);
    q([L, ya - thick, za], [L, yb - thick, zb], [L, yb, zb], [L, ya, za]);
    q([R, ya, za], [R, yb, zb], [R, yb - thick, zb], [R, ya - thick, za]);
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

const SLATE = "#4a5058";
const COPPER = "#5f8a76";
const WHITE = "#eef0f0";
const STEEL = "#9aa0a6";

function flinders(k: Kit, lw: number, ld: number) {
  // The long ochre front on Flinders St, with red-brick banding.
  const front = ld - 16;
  k.look(2, "#d9a04a", "#a8452e", 4.6, 5);
  k.block(-lw, front, lw, ld, 0, 14);
  k.s(bx(lw * 2 + 0.6, 0.8, 16.6, "#a8452e", 0, 14, (front + ld) / 2));
  // The dome over the main entrance, on its drum.
  const dx = lw - 13;
  k.s(cy(9.5, 9.5, 6, "#d9a04a", dx, 14.8, ld - 8, 8), cy(10.2, 10.2, 0.8, "#a8452e", dx, 20.6, ld - 8, 8));
  k.s(dome(9.6, COPPER, dx, 21.4, ld - 8, 1.05, 18), cy(1.4, 1, 4, "#d9a04a", dx, 31, ld - 8, 8), dome(1.6, COPPER, dx, 35, ld - 8, 1.4, 8));
  // The great arch and the row of clocks under it.
  k.s(bx(11, 8, 0.6, "#2a2420", dx, 0, ld + 0.1));
  const arch = new THREE.CircleGeometry(5.5, 16, 0, Math.PI).toNonIndexed();
  arch.translate(dx, 8, ld + 0.42);
  k.s(paint(arch, "#2a2420"), bx(13, 1.2, 1, "#a8452e", dx, 13.4, ld + 0.3));
  for (let i = 0; i < 7; i++) {
    const c = new THREE.CircleGeometry(0.45, 12).toNonIndexed();
    c.translate(dx - 4.2 + i * 1.4, 6.6, ld + 0.45);
    k.l(paint(c, "#fff6dc"));
  }
  // The clock tower at the other end.
  const tx = -lw + 7;
  k.look(2, "#d9a04a", "#a8452e", 5, 5);
  k.block(tx - 4, ld - 12, tx + 4, ld - 4, 14, 32);
  k.s(dome(4.4, COPPER, tx, 32, ld - 8, 1.2, 12));
  for (const [ox, oz, ry] of [[0, 4.05, 0], [4.05, 0, Math.PI / 2], [0, -4.05, Math.PI], [-4.05, 0, -Math.PI / 2]] as V3[]) {
    const c = new THREE.CircleGeometry(1.6, 16).toNonIndexed();
    c.rotateY(ry);
    c.translate(tx + ox, 27, ld - 8 + oz);
    k.l(paint(c, "#fff6dc"));
  }
  // Strings of lights along the roofline (lit at night).
  k.l(bx(lw * 2, 0.12, 0.12, "#ffe2a0", 0, 14.85, ld + 0.35));
  // Platforms behind: long canopies on posts.
  for (let z = front - 6; z > -ld + 2; z -= 11) {
    k.s(gable(-lw + 2, z - 3.5, lw - 2, z + 3.5, 5, 1.2, "#8b9095", true, 0));
    for (let x = -lw + 6; x < lw - 2; x += 12) k.s(cy(0.18, 0.18, 5, "#3f4a52", x, 0, z, 6));
    k.s(bx(lw * 2 - 4, 0.9, 4, "#9a948a", 0, 0, z));
  }
}

function fedSquare(k: Kit, lw: number, ld: number) {
  // The plaza: ochre sandstone paving.
  k.s(bx(lw * 2, 0.25, ld * 2, "#c4925a", 0, 0, 0));
  // Shard buildings: a pinwheel of sandstone, zinc and glass triangles.
  const PAL = ["#c9ac7a", "#8d9599", "#3e4c55", "#a9aaa6", "#b48e5f"];
  const shard = (x0: number, z0: number, x1: number, z1: number, h0: number, h1: number, seed: number) => {
    const p: number[] = [];
    const cols: THREE.Color[] = [];
    const cell = 3.2;
    const face = (ax: number, az: number, bx2: number, bz: number, ha: number, hb: number) => {
      const len = Math.hypot(bx2 - ax, bz - az);
      const nu = Math.max(1, Math.round(len / cell));
      for (let i = 0; i < nu; i++) {
        const t0 = i / nu;
        const t1 = (i + 1) / nu;
        const xa = ax + (bx2 - ax) * t0;
        const za = az + (bz - az) * t0;
        const xb = ax + (bx2 - ax) * t1;
        const zb = az + (bz - az) * t1;
        const ya = ha + (hb - ha) * t0;
        const yb = ha + (hb - ha) * t1;
        const nv = Math.max(1, Math.round(Math.max(ya, yb) / cell));
        for (let j = 0; j < nv; j++) {
          const y0a = (ya * j) / nv;
          const y1a = (ya * (j + 1)) / nv;
          const y0b = (yb * j) / nv;
          const y1b = (yb * (j + 1)) / nv;
          p.push(xa, y0a, za, xb, y0b, zb, xb, y1b, zb, xa, y0a, za, xb, y1b, zb, xa, y1a, za);
          const h = Math.abs(Math.sin(i * 12.9898 + j * 78.233 + seed) * 43758.5453) % 1;
          const h2 = Math.abs(Math.sin(i * 39.3468 + j * 11.135 + seed) * 24634.6345) % 1;
          cols.push(C(PAL[Math.floor(h * PAL.length)]), C(PAL[Math.floor(h2 * PAL.length)]));
        }
      }
    };
    face(x1, z0, x0, z0, h1, h0);
    face(x1, z1, x1, z0, h1, h1);
    face(x0, z1, x1, z1, h0, h1);
    face(x0, z0, x0, z1, h0, h0);
    // A sloping roof.
    p.push(x0, h0, z0, x0, h0, z1, x1, h1, z1, x0, h0, z0, x1, h1, z1, x1, h1, z0);
    cols.push(C("#7f878b"), C("#7f878b"));
    const g = tris(p, "#ffffff");
    const col = g.attributes.color as THREE.BufferAttribute;
    for (let t = 0; t < cols.length; t++) for (let v = 0; v < 3; v++) col.setXYZ(t * 3 + v, cols[t].r, cols[t].g, cols[t].b);
    k.s(g);
  };
  shard(-lw, -ld, -6, -6, 14, 19, 1);
  shard(4, -ld, lw, -2, 17, 12, 2);
  shard(lw - 16, 2, lw, ld - 8, 22, 9, 3);
  // The glass atrium.
  k.look(0, "#33424c", "#47545c", 3.6, 0);
  k.block(-lw, -4, -lw + 16, ld - 6, 0, 15);
  // The big screen on its frame.
  k.s(bx(12, 7.6, 0.6, "#1c1f24", -8, 3.4, 4));
  k.picture(bigScreen(), 11, 6.2, -8, 7.2, 4.35);
}

function cathedral(k: Kit, lw: number, ld: number) {
  const stone = "#b19a7a";
  k.look(2, stone, "#6f5f4a", 9, 0);
  // Nave (long, along z) and transepts (across).
  k.block(-8, -ld + 2, 8, ld - 10, 0, 18, false);
  k.s(gable(-8, -ld + 2, 8, ld - 10, 18, 8, SLATE, false));
  k.block(-lw, -10, lw, 2, 0, 16, false);
  k.s(gable(-lw, -10, lw, 2, 16, 7, SLATE, true));
  // Two west towers and their spires; a taller one over the crossing.
  for (const sx of [-1, 1]) {
    k.look(2, stone, "#6f5f4a", 8, 0);
    k.block(sx * 7 - 3.6, ld - 13, sx * 7 + 3.6, ld - 5.8, 0, 32);
    k.s(spire(4.4, 34, "#8f8270", sx * 7, 32, ld - 9.4, 8));
    for (const [px, pz] of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]]) k.s(spire(0.7, 6, "#8f8270", sx * 7 + px, 32, ld - 9.4 + pz, 4));
  }
  k.look(2, stone, "#6f5f4a", 8, 0);
  k.block(-5, -9, 5, 1, 16, 38);
  k.s(spire(5.6, 50, "#8f8270", 0, 38, -4, 8));
  // The great window over the west door.
  k.s(bx(7, 9, 0.4, "#2b3644", 0, 8, ld - 4.9));
  const rose = new THREE.CircleGeometry(2.6, 16).toNonIndexed();
  rose.translate(0, 21, ld - 5.6);
  k.l(paint(rose, "#d6a64a"));
}

function aurum(k: Kit, lw: number) {
  const gold = 0.84;
  const h = 297;
  k.look(0, "#202a3a", "#2a3850", 3.2, 6);
  k.block(-lw, -lw, lw, lw, 0, h * gold, false);
  k.look(0, "#c9a24a", "#c9a24a", 3.2, 0);
  k.block(-lw, -lw, lw, lw, h * gold, h);
  // The red stripe down its face; the gold edges; the sloping crown and mast.
  k.s(bx(2.4, h * 0.6, 0.6, "#b8202a", lw * 0.45, h * 0.24, lw + 0.3));
  for (const [x, z] of [[-lw, -lw], [lw, -lw], [-lw, lw], [lw, lw]]) k.s(bx(1, h * gold, 1, "#c9a24a", x, 0, z));
  k.s(bx(lw * 1.4, 10, lw * 1.4, "#c9a24a", 0, h, 0), bx(lw * 0.7, 8, lw * 0.7, "#b8913f", 0, h + 10, 0), cy(0.5, 0.3, 26, "#c9cdd2", 0, h + 18, 0, 6));
  k.l(bx(lw * 2 + 0.4, 0.4, lw * 2 + 0.4, "#ffd27a", 0, h * gold, 0));
}

function tower108(k: Kit, lw: number) {
  const h = 316;
  const burst = 0.68;
  k.look(0, "#1a1d24", "#20242c", 3.3, 7);
  k.block(-lw, -lw, lw, lw, 0, h * burst, false);
  // The gold starburst, cantilevered out.
  k.look(0, "#b8913f", "#b8913f", 3.3, 0);
  k.block(-lw * 1.3, -lw * 1.3, lw * 1.3, lw * 1.3, h * burst, h * burst + 16);
  for (let a = 0; a < 8; a++) {
    const g = new THREE.BoxGeometry(lw * 2.9, 1, 1.2).toNonIndexed();
    g.rotateY((a / 8) * Math.PI);
    g.translate(0, h * burst + 16.5, 0);
    k.s(paint(g, "#d4ad55"));
  }
  k.look(0, "#1a1d24", "#20242c", 3.3, 0);
  k.block(-lw * 0.88, -lw * 0.88, lw * 0.88, lw * 0.88, h * burst + 16, h);
  k.s(bx(lw * 1.2, 6, lw * 1.2, "#22262e", 0, h, 0));
  k.l(bx(lw * 2.62, 0.4, lw * 2.62, "#ffcf6a", 0, h * burst + 16, 0), bx(lw * 1.8, 0.3, lw * 1.8, "#ffcf6a", 0, h, 0));
}

function arts(k: Kit, lw: number, ld: number) {
  // Theatres below, a bluestone drum, and the lattice spire on top.
  k.look(7, "#6f6a63", "#3a3a3a", 60, 0);
  k.block(-lw, -ld, lw, -6, 0, 14);
  k.shape(new THREE.CylinderGeometry(19, 20, 26, 28, 1).translate(0, 13, 8));
  k.s(cy(19.5, 19.5, 0.8, "#c9c4b8", 0, 26, 8, 28));
  const path: [number, number][] = [[22, 26], [9, 54], [3.2, 112], [0, 132]];
  const at = (y: number) => {
    for (let i = 0; i < path.length - 1; i++) {
      const [r0, y0] = path[i];
      const [r1, y1] = path[i + 1];
      if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
    return 0;
  };
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    for (let i = 0; i < path.length - 1; i++) {
      const [r0, y0] = path[i];
      const [r1, y1] = path[i + 1];
      k.s(rod([Math.cos(ang) * r0, y0, 8 + Math.sin(ang) * r0], [Math.cos(ang) * r1, y1, 8 + Math.sin(ang) * r1], i === 0 ? 0.35 : 0.25, WHITE, 4));
    }
  }
  for (let y = 30; y < 126; y += y < 56 ? 5 : 8) {
    const r = at(y);
    const ring = new THREE.TorusGeometry(r, 0.14, 4, 32).toNonIndexed();
    ring.rotateX(Math.PI / 2);
    ring.translate(0, y, 8);
    k.l(paint(ring, "#a8c6ff"));
  }
  k.s(cy(0.35, 0.08, 30, WHITE, 0, 132, 8, 6));
}

function casino(k: Kit, lw: number, ld: number) {
  // The long podium on the river, glass to the water, a gold band at night.
  k.look(0, "#2e3440", "#384150", 4.2, 6, true);
  k.block(-lw, -ld, lw, ld, 0, 16);
  k.look(1, "#bdb8ae", "#8a8680", 4, 0);
  k.block(-lw + 10, -ld + 4, lw - 60, ld - 14, 16, 30);
  k.l(bx(lw * 2 + 0.4, 0.5, 0.4, "#ffcf6a", 0, 12.6, ld + 0.2));
  // The hotel tower: an elliptical glass column.
  k.look(0, "#4f6272", "#5a6c7c", 3.3, 0);
  const t = new THREE.CylinderGeometry(1, 1, 150, 32, 1).scale(24, 1, 13).translate(lw - 30, 75 + 16, -8);
  k.shape(t);
  const cap = new THREE.CylinderGeometry(1, 1, 3, 32).scale(25, 1, 14).translate(lw - 30, 167.5, -8).toNonIndexed();
  k.s(paint(cap, "#cfd3d8"));
}

function bowl(k: Kit, R: number, H: number, open: boolean, band: string) {
  // The outer wall: concourse levels in shadow, white ribs, a coloured band under the roof.
  k.s(cy(R, R, H, "#dfe2e4", 0, 0, 0, 64, true));
  k.s(cy(R + 0.3, R + 0.3, 3, band, 0, H - 9, 0, 64, true));
  for (const y of [4, 11.5, 19]) k.s(cy(R + 0.15, R + 0.15, 3.4, "#3b4047", 0, y, 0, 64, true));
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    k.s(bx(1.1, H - 9, 0.7, "#eef0f1", Math.cos(a) * (R + 0.4), 0, Math.sin(a) * (R + 0.4), -a + Math.PI / 2));
  }
  if (!open) {
    // A closed roof, slightly domed, with ribs.
    k.s(dome(R, "#cdd2d8", 0, H, 0, 0.12, 48));
    for (let a = 0; a < 8; a++) {
      const g = new THREE.BoxGeometry(R * 2, 0.8, 1.2).toNonIndexed();
      g.rotateY((a / 8) * Math.PI);
      g.translate(0, H + R * 0.06, 0);
      k.s(paint(g, "#aab0b6"));
    }
    return;
  }
  // The stands: tiers falling to the field, seats in bands with aisles.
  const Rf = R - 40;
  const pts: THREE.Vector2[] = [];
  const prof: [number, number][] = [[R - 1, H - 6], [R - 18, H - 18], [R - 21, H - 19], [R - 36, 5], [Rf, 1.6], [Rf - 0.5, 0.2]];
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, y0] = prof[i];
    const [r1, y1] = prof[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(r1 - r0, y1 - y0) / 1.3));
    for (let j = 0; j < n; j++) pts.push(new THREE.Vector2(r0 + ((r1 - r0) * j) / n, y0 + ((y1 - y0) * j) / n));
  }
  pts.push(new THREE.Vector2(prof[prof.length - 1][0], prof[prof.length - 1][1]));
  const lathe = new THREE.LatheGeometry(pts, 72).toNonIndexed();
  lathe.computeVertexNormals();
  const p = lathe.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const seat = C("#3d4a5c");
  const seat2 = C("#a8862e");
  const aisle = C("#c9cbcc");
  for (let i = 0; i < p.count; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const a = Math.atan2((p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3, (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3);
    const sector = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 36);
    const c = Math.floor(y / 1.3) % 7 === 0 || (((a + Math.PI) / (Math.PI * 2)) * 36) % 1 < 0.08 ? aisle : sector % 9 === 0 ? seat2 : seat;
    for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], (i + v) * 3);
  }
  lathe.setAttribute("color", new THREE.BufferAttribute(col, 3));
  if (!lathe.attributes.uv) lathe.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  k.s(lathe);
  // The roof ring, cantilevered over the upper deck.
  k.s(cy(R + 1, R - 30, 3, "#eef0f1", 0, H - 2, 0, 64, true));
  // The field: mown stripes, the square in the middle, the boundary rope.
  const g1 = C("#3f8c3a");
  const g2 = C("#4d9c45");
  const sq = C("#c7b07a");
  k.s(disc(Rf, 0.12, 40, (x, z) => (Math.abs(x) < 1.6 && Math.abs(z) < 11 ? sq : Math.floor((x + 200) / 6) % 2 ? g1 : g2)));
  const rope = new THREE.RingGeometry(Rf - 3.2, Rf - 2.8, 72).rotateX(-Math.PI / 2).translate(0, 0.16, 0).toNonIndexed();
  k.s(paint(rope, "#f4f4f2"));
  // Six light towers leaning in, their lamp banks lit.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * (R + 3);
    const z = Math.sin(a) * (R + 3);
    k.s(cy(1.3, 0.8, 74, "#c9cdd2", x, 0, z, 8));
    const bank = new THREE.BoxGeometry(9, 5, 0.8).toNonIndexed();
    bank.rotateX(0.5);
    bank.rotateY(-a - Math.PI / 2);
    bank.translate(x * 0.97, 76, z * 0.97);
    k.l(paint(bank, "#fffbe8"));
  }
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

function bolte(k: Kit) {
  // Twin pylons standing either side of the deck, high over the harbour mouth.
  const span: [number, number][] = [];
  for (let z = -90; z <= 150; z += 20) span.push([z, 24]);
  k.s(loft(span, 14, 2.4, STEEL));
  for (const side of [-1, 1]) {
    k.s(loft(span.map(([z, y]) => [z, y + 1.1]), 0.25, 1.1, "#c9cdd2", side * 13.8));
    const x = side * 17;
    const g = new THREE.CylinderGeometry(2.4, 4.4, 140, 4).toNonIndexed();
    g.rotateY(Math.PI / 4);
    g.translate(x, 70, 0);
    k.s(paint(g, "#a4a9ae"));
    k.l(bx(0.5, 0.5, 0.5, "#ff3a2a", x, 140.5, 0));
  }
  k.s(bx(38, 3, 4, "#a4a9ae", 0, 20, 0));
  for (let z = -80; z <= 140; z += 40) k.s(cy(2.2, 2.2, 22 - WATER_Y, "#9ea3a8", -6, WATER_Y, z, 10), cy(2.2, 2.2, 22 - WATER_Y, "#9ea3a8", 6, WATER_Y, z, 10));
}

function westGate(k: Kit) {
  // A long steel box girder at height, two tower pairs, fans of stays.
  const profile: [number, number][] = [];
  for (let z = -230; z <= 250; z += 10) {
    const t = Math.min(1, Math.max(0, (Math.abs(z - 20) - 120) / 110));
    profile.push([z, 52 - t * t * 30]);
  }
  k.s(loft(profile, 15, 4, "#a7adb3"));
  for (const side of [-1, 1]) k.s(loft(profile.map(([z, y]) => [z, y + 1]), 0.2, 1, "#c9cdd2", side * 14.8));
  for (const tz of [-52, 92]) {
    for (const side of [-1, 1]) {
      k.s(cy(1.6, 1.2, 102, "#cfd3d8", side * 9, 0, tz, 8));
      for (let i = 1; i <= 7; i++) {
        for (const dir of [-1, 1]) k.s(rod([side * 9, 100 - i * 1.2, tz], [side * 12, 53, tz + dir * i * 13], 0.12, "#e4e7ea", 3));
      }
    }
    k.s(bx(20, 2, 2.4, "#cfd3d8", 0, 98, tz));
    k.l(bx(0.6, 0.6, 0.6, "#ff3a2a", -9, 102.4, tz), bx(0.6, 0.6, 0.6, "#ff3a2a", 9, 102.4, tz));
  }
  for (let z = -220; z <= 240; z += 40) {
    if (Math.abs(z - 20) < 80) continue;
    const y = profile[Math.round((z + 230) / 10)][1];
    k.s(cy(2.4, 2.4, y - 4 - WATER_Y, "#b0b4b8", -6, WATER_Y, z, 8), cy(2.4, 2.4, y - 4 - WATER_Y, "#b0b4b8", 6, WATER_Y, z, 8));
  }
  // A row of deck lamps (they read as a necklace at night).
  for (const [z, y] of profile) if (Math.round(z) % 20 === 0) k.l(bx(0.3, 0.3, 0.3, "#ffd9a0", 0, y + 0.4, z));
}

function shrine(k: Kit) {
  const stone = "#aaa59a";
  // Terraces, the great block, porticos front and back, the stepped roof and its crown.
  k.s(bx(68, 2.5, 68, "#9a958a", 0, 0, 0), bx(58, 2.5, 58, "#a29d92", 0, 2.5, 0), bx(48, 2, 48, "#a8a398", 0, 5, 0));
  k.look(2, stone, "#7a756a", 60, 0);
  k.block(-18, -18, 18, 18, 7, 23, false);
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 8; i++) k.s(cy(0.9, 0.8, 12, "#b9b4a8", -14 + i * 4, 7, sz * 22, 12));
    k.s(bx(34, 2.4, 7, "#b0aba0", 0, 19, sz * 21.5));
    k.s(gable(-17, sz * 21.5 - 3.5, 17, sz * 21.5 + 3.5, 21.4, 5, "#a8a398", true, 0.3));
  }
  for (let i = 0; i < 4; i++) k.s(bx(36 - i * 6, 2, 36 - i * 6, i % 2 ? "#a29d92" : "#99948a", 0, 23 + i * 2, 0));
  k.s(cy(4, 4, 4, stone, 0, 31, 0, 12), dome(4.2, "#99948a", 0, 35, 0, 0.8, 12));
}

function exhibition(k: Kit) {
  const body = "#d9c19a";
  k.look(4, body, "#8e3b2b", 8, 0);
  k.block(-38, -10, 38, 10, 0, 16, false);
  k.s(gable(-38, -10, 38, 10, 16, 6, SLATE, true));
  k.block(-12, -24, 12, 24, 0, 16, false);
  k.s(gable(-12, -24, 12, 24, 16, 6, SLATE, false));
  for (const sx of [-1, 1]) {
    k.look(4, body, "#8e3b2b", 6, 0);
    k.block(sx * 10 - 2.6, 21, sx * 10 + 2.6, 26, 0, 26);
    k.s(dome(2.8, "#b0523a", sx * 10, 26, 23.5, 1.3, 10));
  }
  // The dome: a drum, the terracotta dome, its lantern and flagpole.
  k.s(cy(10.5, 10.5, 10, body, 0, 16, 0, 16), cy(11, 11, 1, "#8e3b2b", 0, 25.6, 0, 16));
  k.s(dome(10.4, "#b0523a", 0, 26.4, 0, 1.3, 20), cy(2.2, 2, 6, body, 0, 39.5, 0, 8), dome(2.4, "#b0523a", 0, 45.5, 0, 1.4, 8), cy(0.1, 0.08, 8, "#e0e0e0", 0, 48.6, 0, 4));
}

function parliament(k: Kit, lw: number, ld: number) {
  const stone = "#c9b58e";
  k.look(2, stone, "#7a6a50", 6, 6);
  k.block(-lw, -ld, lw, ld - 16, 0, 22);
  // The steps, the colonnade, the entablature and the attic.
  for (let i = 0; i < 4; i++) k.s(bx(60 - i * 2, 1.2, 14 - i * 2.4, "#b8a684", 0, i * 1.2, ld - 6 + i * 1.2 - 2.4));
  for (let i = 0; i < 13; i++) k.s(cy(1.15, 1, 15.5, "#d6c6a2", -24 + i * 4, 4.8, ld - 7.5, 12));
  k.s(bx(54, 3, 9, "#cdbb96", 0, 20.3, ld - 8.5), bx(50, 2.2, 7, "#c4b18a", 0, 23.3, ld - 8.5));
  for (let x = -lw + 2; x < lw - 1; x += 3) k.s(bx(0.5, 1.2, 0.5, "#d6c6a2", x, 22, ld - 16.2));
}

function market(k: Kit, lw: number, ld: number) {
  // Long sheds on green posts under corrugated gables, stalls beneath; a brick shop row on the front.
  const STALL = ["#d8402e", "#2f6db0", "#f2b134", "#3f8a4a", "#e6e1d4", "#8a4fb0"];
  let n = 0;
  for (let z = -ld + 6; z < ld - 14; z += 14) {
    k.s(gable(-lw + 1, z - 5.5, lw - 1, z + 5.5, 6.4, 2.4, "#a0a6aa", true, 0.4));
    for (let x = -lw + 2; x <= lw - 2; x += 7) for (const sz of [-1, 1]) k.s(cy(0.16, 0.16, 6.4, "#2f5a3a", x, 0, z + sz * 5, 6));
    for (let x = -lw + 5; x < lw - 4; x += 9.5) {
      k.s(bx(4.2, 1.1, 2.4, STALL[n++ % STALL.length], x, 0, z - 2), bx(4.2, 0.1, 3, STALL[(n * 7) % STALL.length], x, 2.4, z - 2.2));
    }
  }
  k.look(3, "#a4573e", "#e9dfc8", 4, 4.4, true);
  k.block(-lw, ld - 9, lw, ld, 0, 9);
}

function funPark(k: Kit, l: Landmark, lw: number, ld: number, ry: number) {
  const local = (wx: number, wz: number): [number, number] => {
    const dx = wx - l.x;
    const dz = wz - l.z;
    return [dx * Math.cos(ry) - dz * Math.sin(ry), dx * Math.sin(ry) + dz * Math.cos(ry)];
  };
  // The gate: a cream block with a huge grinning face, the way in through its mouth; striped towers.
  const gz = ld - 6;
  k.look(4, "#f0e2b0", "#d7352b", 60, 0);
  k.block(-11, gz - 5, 11, gz + 5, 0, 18);
  k.picture(moonFace(), 16, 16, 0, 9.5, gz + 5.05, 0, false);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) k.s(bx(5, 4.4, 5, i % 2 ? "#d7352b" : "#f6e7b0", sx * 13.5, i * 4.4, gz));
    k.s(dome(3, "#d7352b", sx * 13.5, 26.4, gz, 1.4, 10), cy(0.08, 0.06, 4, "#ffffff", sx * 13.5, 30.4, gz, 4));
    for (let y = 2; y < 26; y += 2) k.l(bx(0.25, 0.25, 0.25, "#ffe08a", sx * 13.5 + sx * 2.6, y, gz + 2.6));
  }
  k.picture(neonSign("JUST FOR FUN", "#ffd23f"), 18, 3.2, 0, 20, gz + 5.1);
  // The scenic railway: a timber trestle round the edge, rising and falling.
  const ins = 5;
  const a = lw - ins;
  const z0 = -ld + ins;
  const z1 = ld - 16 - ins;
  const edges: [number, number, number, number][] = [
    [-a, z0, a, z0],
    [a, z0, a, z1],
    [a, z1, -a, z1],
    [-a, z1, -a, z0],
  ];
  const L = edges.reduce((t, [x0, zz0, x1, zz1]) => t + Math.hypot(x1 - x0, zz1 - zz0), 0);
  const along = (s: number): [number, number] => {
    for (const [x0, zz0, x1, zz1] of edges) {
      const len = Math.hypot(x1 - x0, zz1 - zz0);
      if (s <= len) return [x0 + ((x1 - x0) * s) / len, zz0 + ((zz1 - zz0) * s) / len];
      s -= len;
    }
    return [-a, z0];
  };
  let prev: V3 | null = null;
  for (let s = 0; s <= L; s += 4) {
    const [x, z] = along(s);
    const y = 7 + 4.5 * Math.sin((s / L) * Math.PI * 6) + 2 * Math.sin(s / 7.3);
    k.s(bx(0.35, y, 0.35, "#efe9da", x, 0, z));
    if (s % 8 === 0) k.s(rod([x - 0.2, 0, z], [x + 0.2, y, z], 0.08, "#e2dccb", 3));
    const p: V3 = [x, y, z];
    if (prev) k.s(rod(prev, p, 0.45, "#8a3a2a", 4));
    prev = p;
  }
  // A small wheel and a carousel where the rides stand.
  const parts = l.parts ?? [];
  if (parts[1]) {
    const [x, z] = local(parts[1].x, parts[1].z);
    for (const sz of [-1, 1]) k.s(rod([x - 7, 0, z + sz * 3], [x, 16, z + sz * 1], 0.4, WHITE, 6), rod([x + 7, 0, z + sz * 3], [x, 16, z + sz * 1], 0.4, WHITE, 6));
    const rim = new THREE.TorusGeometry(12, 0.35, 5, 48).toNonIndexed();
    rim.translate(x, 16, z);
    k.s(paint(rim, "#d7352b"));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.s(rod([x, 16, z], [x + Math.cos(a) * 12, 16 + Math.sin(a) * 12, z], 0.1, WHITE, 3), bx(1.6, 1.6, 1.6, ["#f2b134", "#3fa7a0", "#e14b6a"][i % 3], x + Math.cos(a) * 12, 15 + Math.sin(a) * 12, z));
    }
    const led = new THREE.TorusGeometry(12.4, 0.12, 4, 64).toNonIndexed();
    led.translate(x, 16, z);
    k.l(paint(led, "#ffe08a"));
  }
  if (parts[2]) {
    const [x, z] = local(parts[2].x, parts[2].z);
    k.s(cy(10, 10, 0.8, "#e6d8b0", x, 0, z, 20));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      k.s(cy(0.18, 0.18, 5.4, "#d4b04a", x + Math.cos(a) * 9.2, 0.8, z + Math.sin(a) * 9.2, 6));
    }
    k.s(spire(10.6, 6, "#d7352b", x, 6.2, z, 16), cy(1, 1, 4, "#f6e7b0", x, 0.8, z, 10));
    k.l(cy(10.2, 10.2, 0.3, "#ffe08a", x, 6, z, 32, true));
  }
}

function theatre(k: Kit, lw: number, ld: number) {
  const body = "#e3cfae";
  k.look(4, body, "#3d6f86", 6, 0);
  k.block(-lw, -ld, lw, ld - 10, 0, 20);
  k.look(4, body, "#3d6f86", 5, 5);
  k.block(-20, ld - 10, 20, ld, 0, 24);
  for (const sx of [-1, 1]) {
    k.block(sx * 16 - 3, ld - 9, sx * 16 + 3, ld + 0.6, 24, 31);
    k.s(spire(4.4, 4, "#3d6f86", sx * 16, 31, ld - 4.2, 4));
  }
  k.picture(neonSign("PALACE", "#ff4fa3"), 22, 5.2, 0, 17, ld + 0.2);
  k.l(bx(40, 0.2, 0.2, "#ffd9a0", 0, 24.1, ld + 0.15));
}

function kiosk(k: Kit) {
  k.look(4, "#efe5cf", "#2f5a3a", 5, 0);
  k.block(-7.5, -10.5, 7.5, 10.5, 0, 5, false);
  k.s(gable(-7.5, -10.5, 7.5, 10.5, 5, 3, "#a33a2a", false, 0.6));
  for (const [x, z] of [[-7.5, -10.5], [7.5, -10.5], [-7.5, 10.5], [7.5, 10.5]]) k.s(cy(1.6, 1.6, 7, "#efe5cf", x, 0, z, 10), dome(1.8, "#3f6f4f", x, 7, z, 1.3, 10));
  k.s(cy(1.2, 1.2, 3, "#efe5cf", 0, 7, 0, 8), dome(1.4, "#3f6f4f", 0, 10, 0, 1.4, 8));
}

function ferry(k: Kit) {
  // Hull: pointed at the bow (+z), from below the waterline up to the main deck.
  const sh = new THREE.Shape();
  sh.moveTo(-16, 120);
  sh.lineTo(16, 120);
  sh.lineTo(16, -70);
  sh.quadraticCurveTo(14, -112, 0, -122);
  sh.quadraticCurveTo(-14, -112, -16, -70);
  sh.closePath();
  const hull = new THREE.ExtrudeGeometry(sh, { depth: 18, bevelEnabled: false, curveSegments: 8 });
  // Shape y → −z; extrusion → +y.
  hull.rotateX(-Math.PI / 2);
  hull.translate(0, WATER_Y - 6, 0);
  k.s(paint(hull, "#1d2a44"));
  k.s(bx(32.4, 1.6, 190, "#c8202a", 0, WATER_Y + 1, 25));
  // Decks of cabins, the bridge, the funnel, lifeboats.
  k.look(4, "#f4f4f2", "#2a3a52", 2.9, 0);
  k.block(-14, -100, 14, 100, 12, 34);
  k.block(-12, -80, 12, 60, 34, 42);
  k.look(0, "#2a3a52", "#2a3a52", 3, 0);
  k.block(-15.5, -92, 15.5, -82, 34, 44);
  k.s(bx(7, 12, 12, "#c8202a", 0, 42, 30), bx(7.2, 2, 12.2, "#1c1f24", 0, 54, 30));
  for (let z = -70; z < 80; z += 13) for (const sx of [-1, 1]) k.s(bx(1.8, 1.8, 7, "#f28a1a", sx * 14.8, 24, z));
}

function southernCross(k: Kit, lw: number, ld: number) {
  // The wavy roof: a field of soft domes over the concourse.
  const nx = 36;
  const nz = 72;
  const g = new THREE.PlaneGeometry(lw * 2, ld * 2, nx, nz).rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const u = Math.abs(Math.sin(((x + lw) / (lw * 2)) * Math.PI * 3));
    const v = Math.abs(Math.sin(((z + ld) / (ld * 2)) * Math.PI * 6));
    p.setY(i, 15 + 6 * Math.pow(u * v, 0.8));
  }
  const roof = g.toNonIndexed();
  roof.computeVertexNormals();
  const q = roof.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(q.count * 3);
  const w = C("#e9ecee");
  const vent = C("#c9b25a");
  for (let i = 0; i < q.count; i++) {
    const c = q.getY(i) > 20.4 ? vent : w;
    col.set([c.r, c.g, c.b], i * 3);
  }
  roof.setAttribute("color", new THREE.BufferAttribute(col, 3));
  k.s(roof);
  for (let x = -lw + 8; x < lw - 4; x += 24) for (let z = -ld + 12; z < ld - 6; z += 32) k.s(cy(0.6, 0.6, 15, "#c9cdd2", x, 0, z, 8), spire(3, 3, "#c9cdd2", x, 13, z, 4));
  // Glass walls round the concourse.
  k.look(0, "#3a4550", "#46525c", 4, 0);
  k.block(-lw, -ld, lw, ld, 0, 12, false);
  // Platforms and their trains.
  for (let x = -lw + 8; x < lw - 6; x += 10) {
    k.s(bx(4, 1, ld * 1.7, "#9a948a", x, 0, 0));
    if ((x / 10) % 2 < 1) k.s(bx(3, 3.6, 60, "#c8ccd2", x + 4.6, 0.4, -20), bx(3.02, 0.6, 60.02, "#c8202a", x + 4.6, 2.2, -20));
  }
}

function boatsheds(k: Kit, lw: number, ld: number) {
  const LOOKS: [number, string, string][] = [
    [5, "#e9e1cc", "#2f5a3a"],
    [3, "#8c3b2e", "#e9dfc8"],
    [5, "#3f5f4a", "#f4f1ea"],
    [3, "#a85a3a", "#e9dfc8"],
    [5, "#d8c8a0", "#2a4a7a"],
  ];
  for (let i = 0; i < 5; i++) {
    const x = -lw + 8 + i * 16;
    const [type, color, accent] = LOOKS[i];
    k.look(type, color, accent, 3.8, 4.2, true);
    k.block(x - 7, -ld + 1, x + 7, ld - 1, 0, 8, false);
    k.s(gable(x - 7, -ld + 1, x + 7, ld - 1, 8, 3, i % 2 ? "#5a6168" : "#7b3a2e", false, 0.5));
  }
  k.s(bx(lw * 2 - 6, 0.4, 7, "#8a6a4a", 0, -0.35, ld + 4));
}

/* ------------------------------------------------------------------------------ assembly */

export function buildLandmark(l: Landmark, mats: LandmarkMats): LandmarkModel {
  const ry = faceTurn(l.face);
  // Local half-extents: x across the front, z front to back.
  const turned = l.face === 0 || l.face === 2;
  const lw = turned ? l.hd : l.hw;
  const ld = turned ? l.hw : l.hd;
  const k = new Kit((Math.abs(l.x * 0.013 + l.z * 0.007) % 1) + 0.1);
  switch (l.kind) {
    case "flinders":
      flinders(k, lw, ld);
      break;
    case "fedsquare":
      fedSquare(k, lw, ld);
      break;
    case "cathedral":
      cathedral(k, lw, ld);
      break;
    case "aurum":
      aurum(k, lw);
      break;
    case "tower108":
      tower108(k, lw);
      break;
    case "arts":
      arts(k, lw, ld);
      break;
    case "casino":
      casino(k, lw, ld);
      break;
    case "mcg":
      bowl(k, lw, l.h, true, "#1f3a6e");
      break;
    case "stadium":
      bowl(k, lw, l.h, false, "#2b5fa8");
      break;
    case "wheel":
      wheel(k);
      break;
    case "bolte":
      bolte(k);
      break;
    case "westgate":
      westGate(k);
      break;
    case "shrine":
      shrine(k);
      break;
    case "exhibition":
      exhibition(k);
      break;
    case "parliament":
      parliament(k, lw, ld);
      break;
    case "market":
      market(k, lw, ld);
      break;
    case "funpark":
      funPark(k, l, lw, ld, ry);
      break;
    case "theatre":
      theatre(k, lw, ld);
      break;
    case "kiosk":
      kiosk(k);
      break;
    case "cruiseship":
      ferry(k);
      break;
    case "southerncross":
      southernCross(k, lw, ld);
      break;
    case "boatshed":
      boatsheds(k, lw, ld);
      break;
  }
  const group = new THREE.Group();
  group.name = `landmark-${l.kind}`;
  group.position.set(l.x, 0, l.z);
  group.rotation.y = ry;
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
