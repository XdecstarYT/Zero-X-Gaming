import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FacadeSheet, Sheet } from "@/games/heatwave/render/sheet";

/**
 * XCity's building blocks: helpers that add oriented boxes, gable roofs and any three.js geometry
 * to merged sheets, the shared materials, and the models that move or repeat (trees, cars, bikes,
 * trams, cranes, scaffolding).
 */

export { FacadeSheet, Sheet };

const tmpC = new THREE.Color();

/** Walls (and optionally a top) of a box turned to the axis (ux, uz), centred at (x, z). */
export function obox(sh: Sheet, x: number, z: number, ux: number, uz: number, hw: number, hd: number, y0: number, y1: number, col: THREE.Color, top = true, topCol?: THREE.Color, topSheet: Sheet = sh) {
  const vx = -uz;
  const vz = ux;
  const c = (a: number, b: number) => [x + ux * hw * a + vx * hd * b, z + uz * hw * a + vz * hd * b];
  const P = [c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)];
  // Outward normals: -v, +u, +v, -u.
  const N = [
    [-vx, 0, -vz],
    [ux, 0, uz],
    [vx, 0, vz],
    [-ux, 0, -uz],
  ];
  const lens = [hw * 2, hd * 2, hw * 2, hd * 2];
  for (let i = 0; i < 4; i++) {
    const a = P[i];
    const b = P[(i + 1) % 4];
    // Wind so the face points outward.
    sh.wall(b[0], b[1], a[0], a[1], y0, y1, lens[i], 0, y1 - y0, N[i], col);
  }
  if (top) {
    const tc = topCol ?? col;
    topSheet.quad([P[3][0], y1, P[3][1]], [P[2][0], y1, P[2][1]], [P[1][0], y1, P[1][1]], [P[0][0], y1, P[0][1]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0], tc);
  }
}

/** A flat oriented rectangle facing up. */
export function oflat(sh: Sheet, x: number, z: number, ux: number, uz: number, hw: number, hd: number, y: number, col: THREE.Color) {
  const vx = -uz;
  const vz = ux;
  const c = (a: number, b: number) => [x + ux * hw * a + vx * hd * b, y, z + uz * hw * a + vz * hd * b];
  sh.quad(c(-1, 1), c(1, 1), c(1, -1), c(-1, -1), [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0], col);
}

/** A gable roof over an oriented footprint, ridge along u. Gable ends are walls (they get the facade). */
export function gable(roof: Sheet, wall: Sheet, x: number, z: number, ux: number, uz: number, hw: number, hd: number, y: number, rise: number, roofCol: THREE.Color, wallCol: THREE.Color, eave = 0.45) {
  const vx = -uz;
  const vz = ux;
  const p = (a: number, b: number, h: number, ea = 0) => [x + ux * (hw + ea) * a + vx * (hd + eave) * b, h, z + uz * (hw + ea) * a + vz * (hd + eave) * b];
  const ridge = (a: number) => [x + ux * (hw + eave * 0.6) * a, y + rise, z + uz * (hw + eave * 0.6) * a];
  const slope = Math.hypot(rise, hd + eave);
  const ny = (hd + eave) / slope;
  const nh = rise / slope;
  // Two slopes.
  roof.quad(p(-1, 1, y - 0.15, eave * 0.6), p(1, 1, y - 0.15, eave * 0.6), ridge(1), ridge(-1), [[0, 0], [1, 0], [1, 1], [0, 1]], [vx * nh, ny, vz * nh], roofCol);
  roof.quad(p(1, -1, y - 0.15, eave * 0.6), p(-1, -1, y - 0.15, eave * 0.6), ridge(-1), ridge(1), [[0, 0], [1, 0], [1, 1], [0, 1]], [-vx * nh, ny, -vz * nh], roofCol);
  // Gable triangles.
  for (const a of [-1, 1]) {
    const q = (b: number) => [x + ux * hw * a + vx * hd * b, y, z + uz * hw * a + vz * hd * b];
    const top = [x + ux * hw * a, y + rise, z + uz * hw * a];
    const n = [ux * a, 0, uz * a];
    if (a > 0) wall.tri(q(1), q(-1), top, n, wallCol);
    else wall.tri(q(-1), q(1), top, n, wallCol);
  }
}

/** Add any geometry (moved and turned) to a sheet, painted one colour. */
export function addGeo(sh: Sheet, g: THREE.BufferGeometry, col: THREE.Color, m?: THREE.Matrix4) {
  const geo = g.index ? g.toNonIndexed() : g;
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    if (m) {
      v.applyMatrix4(m);
      n.applyMatrix3(nm!).normalize();
    }
    sh.pos.push(v.x, v.y, v.z);
    sh.nor.push(n.x, n.y, n.z);
    sh.uv.push(v.x, v.z);
    sh.col.push(col.r, col.g, col.b);
  }
  if (geo !== g) geo.dispose();
}

const mtx = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);

/** A matrix placing something at (x, y, z), turned to face along (ux, uz), scaled. */
export function place(x: number, y: number, z: number, ux = 1, uz = 0, sx = 1, sy = 1, sz = 1) {
  q.setFromAxisAngle(up, -Math.atan2(uz, ux));
  return mtx.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)).clone();
}

export const unitBox = new THREE.BoxGeometry(1, 1, 1);
export const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);

export function color(hex: string, k = 1) {
  return new THREE.Color(hex).multiplyScalar(k);
}

/* ------------------------------------------------------------------ materials */

/** Value noise in GLSL (hash, 3D noise), shared by the roof and foliage shaders. */
const NOISE_GLSL = `
float xcHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float xcNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(xcHash(i), xcHash(i + vec3(1,0,0)), f.x), mix(xcHash(i + vec3(0,1,0)), xcHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(xcHash(i + vec3(0,0,1)), xcHash(i + vec3(1,0,1)), f.x), mix(xcHash(i + vec3(0,1,1)), xcHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`;

/** World position (and world normal) into the fragment shader, instanced or not. */
function worldVaryings(sh: { vertexShader: string; fragmentShader: string }, normal = false) {
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", `#include <common>\nvarying vec3 vXW;${normal ? "\nvarying vec3 vXN;" : ""}`)
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vec4 xcW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
      xcW = instanceMatrix * xcW;
      #endif
      vXW = (modelMatrix * xcW).xyz;${normal ? "\n      vXN = normalize(mat3(modelMatrix) * objectNormal);" : ""}`,
    );
  sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vXW;${normal ? "\nvarying vec3 vXN;" : ""}\n${NOISE_GLSL}`);
}

/**
 * Roofs, with their covering drawn per pixel in world space: on pitched roofs, courses of tiles
 * or shingles (each a slightly different shade, with the shadow line under each course); on flat
 * roofs, membrane sheets with seams, gravel speckle and weathering.
 */
function roofMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02 });
  m.onBeforeCompile = (sh) => {
    worldVaryings(sh, true);
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec3 w = vXW;
      float stain = xcNoise(w * 0.18) * 0.6 + xcNoise(w * 0.7) * 0.4;
      if (vXN.y > 0.97) {
        float seam = 1.0 - smoothstep(0.0, 0.02, abs(fract((w.x + w.z * 0.13) / 2.6) - 0.5) - 0.48);
        float speck = xcNoise(w * 7.0);
        diffuseColor.rgb *= (0.86 + speck * 0.18) * (1.0 - seam * 0.06) * (0.86 + stain * 0.22);
      } else if (vXN.y > 0.2) {
        float row = w.y * 4.4;
        float fr = fract(row);
        float along = (w.x + w.z) * 3.1 + floor(row) * 0.5;
        float tile = xcHash(vec3(floor(along), floor(row), 3.0));
        float gap = smoothstep(0.0, 0.07, fract(along)) * smoothstep(1.0, 0.93, fract(along));
        diffuseColor.rgb *= (0.7 + 0.3 * smoothstep(0.0, 0.16, fr)) * (0.88 + tile * 0.2) * (0.9 + 0.1 * gap) * (0.9 + stain * 0.15);
      }`,
    );
  };
  m.customProgramCacheKey = () => "xc-roof";
  return m;
}

/** Leaves: the crown's vertex shading, broken up into clumps of foliage by world-space noise. */
function foliageMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    worldVaryings(sh);
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float lf = xcNoise(vXW * 1.7) * 0.6 + xcNoise(vXW * 4.3) * 0.4;
      diffuseColor.rgb *= 0.74 + lf * 0.46;`,
    );
  };
  m.customProgramCacheKey = () => "xc-foliage";
  return m;
}

export const MATS = {
  props: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, side: THREE.DoubleSide }),
  roof: roofMaterial(),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};

/* ------------------------------------------------------------------ trees */

function jitter(g: THREE.BufferGeometry, k: number, seed: number) {
  const p = g.getAttribute("position");
  let a = seed;
  for (let i = 0; i < p.count; i++) {
    a = (a * 9301 + 49297) % 233280;
    const r = 1 + ((a / 233280) * 2 - 1) * k;
    p.setXYZ(i, p.getX(i) * r, p.getY(i) * r, p.getZ(i) * r);
  }
  g.computeVertexNormals();
  return g;
}

function paintGeo(g: THREE.BufferGeometry, hex: string, jitterK = 0) {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.getAttribute("position").count;
  const c = new Float32Array(n * 3);
  const base = new THREE.Color(hex);
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (Math.random() - 0.5) * jitterK;
    for (let j = 0; j < 3 && i + j < n; j++) {
      c[(i + j) * 3] = base.r * k;
      c[(i + j) * 3 + 1] = base.g * k;
      c[(i + j) * 3 + 2] = base.b * k;
    }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return geo;
}

function mergeAll(list: THREE.BufferGeometry[]) {
  let n = 0;
  for (const g of list) n += g.getAttribute("position").count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    const c = g.getAttribute("position").count;
    pos.set(g.getAttribute("position").array as Float32Array, o * 3);
    nor.set(g.getAttribute("normal").array as Float32Array, o * 3);
    col.set(g.getAttribute("color").array as Float32Array, o * 3);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return out;
}

export type TreeKind = "round" | "tall" | "pine" | "fruit";

/**
 * Shade a crown the way light falls on a tree: darker underneath and inside, brighter on top and
 * on the outside, with a little variation from leaf to leaf.
 */
function shadeCrown(g: THREE.BufferGeometry, hex: string, y0: number, y1: number, cx = 0, cz = 0) {
  const geo = g.index ? g.toNonIndexed() : g;
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const c = new Float32Array(pos.count * 3);
  const base = new THREE.Color(hex);
  let a = 7;
  for (let i = 0; i < pos.count; i++) {
    const h = Math.max(0, Math.min(1, (pos.getY(i) - y0) / Math.max(0.01, y1 - y0)));
    const ox = pos.getX(i) - cx;
    const oz = pos.getZ(i) - cz;
    const out = (ox * nor.getX(i) + oz * nor.getZ(i)) / (Math.hypot(ox, oz) || 1);
    a = (a * 9301 + 49297) % 233280;
    const k = (0.52 + 0.48 * h) * (0.86 + 0.14 * Math.max(0, out)) * (0.9 + nor.getY(i) * 0.1) * (0.92 + (a / 233280) * 0.16);
    c[i * 3] = base.r * k;
    c[i * 3 + 1] = base.g * k;
    c[i * 3 + 2] = base.b * k;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return geo;
}

/** A clump of foliage: a lumpy ball. */
const lump = (r: number, x: number, y: number, z: number, seed: number, sy = 1, detail = 0) => jitter(welded(new THREE.IcosahedronGeometry(r, detail)).scale(1, sy, 1), detail ? 0.18 : 0.12, seed).translate(x, y, z);

/** Weld a shape's shared corners so it can be dented without tearing (and shades smoothly). */
function welded(g: THREE.BufferGeometry) {
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const out = mergeVertices(g, 1e-4);
  g.dispose();
  return out;
}

/** A tree about 1 unit tall per metre of scale: a trunk (with a couple of limbs) and a crown of clumps. */
export function treeGeometry(kind: TreeKind): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bark = kind === "pine" ? "#4a3a2e" : "#5a4636";
  const trunkH = kind === "fruit" ? 1.1 : kind === "pine" ? 1.6 : kind === "tall" ? 2.4 : 2.6;
  parts.push(paintGeo(new THREE.CylinderGeometry(kind === "pine" ? 0.14 : 0.12, kind === "pine" ? 0.22 : 0.2, trunkH + 0.6, 6).translate(0, (trunkH + 0.6) / 2, 0), bark, 0.15));
  if (kind === "pine") {
    // Tiers of drooping boughs, narrowing to a spire.
    const tiers: [number, number, number][] = [[2.3, 2.6, 2.4], [1.85, 2.4, 3.9], [1.4, 2.2, 5.3], [0.9, 2.0, 6.6], [0.45, 1.5, 7.7]];
    tiers.forEach(([r, h, y], k) => parts.push(shadeCrown(jitter(welded(new THREE.ConeGeometry(r, h, 7, 1, true)), 0.1, 13 + k).translate(0, y, 0), "#2c4b31", 1.2, 8.5)));
  } else if (kind === "tall") {
    // A columnar tree (poplar): clumps stacked up a narrow crown.
    const ls = [lump(1.35, 0, 3.4, 0, 3, 1.25, 1), lump(1.25, 0.25, 4.9, -0.2, 5, 1.3), lump(1.05, -0.2, 6.3, 0.15, 7, 1.3), lump(0.75, 0.1, 7.5, 0, 11, 1.2)];
    for (const l of ls) parts.push(shadeCrown(l, "#4e7535", 2.2, 8.3));
  } else if (kind === "fruit") {
    const ls = [lump(1.25, 0, 2.1, 0, 7, 0.85), lump(0.85, 0.75, 2.4, 0.35, 9), lump(0.8, -0.65, 2.3, -0.45, 13)];
    for (const l of ls) parts.push(shadeCrown(l, "#5a8235", 1.0, 3.3));
  } else {
    // A broadleaf: limbs reaching out to a wide crown of clumps.
    for (const [ax, az] of [[0.7, 0.3], [-0.5, -0.6]]) parts.push(paintGeo(new THREE.CylinderGeometry(0.06, 0.1, 2, 4, 1, true).rotateZ(-ax * 0.8).rotateX(az * 0.8).translate(ax * 0.6, trunkH + 0.6, az * 0.6), bark));
    const ls = [
      lump(2.1, 0, trunkH + 2.0, 0, 5, 0.85, 1),
      lump(1.55, 1.45, trunkH + 1.6, 0.4, 9),
      lump(1.5, -1.35, trunkH + 1.7, -0.5, 11),
      lump(1.45, 0.3, trunkH + 1.5, 1.4, 15),
      lump(1.4, -0.4, trunkH + 1.6, -1.45, 17),
      lump(1.35, 0.4, trunkH + 3.1, 0.2, 19),
    ];
    for (const l of ls) parts.push(shadeCrown(l, "#4a7231", trunkH + 0.3, trunkH + 4.4));
  }
  return mergeAll(parts);
}

export const treeMaterial = foliageMaterial();

/* ------------------------------------------------------------------ vehicles */

/** A small car, 4.4 m long along +x, body white (tinted per instance), dark glass, black wheels. */
export function carGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.BoxGeometry(4.3, 0.62, 1.78).translate(0, 0.52, 0);
  parts.push(paintGeo(body, "#f2f2f2"));
  const cabin = new THREE.BoxGeometry(2.3, 0.56, 1.6).translate(-0.15, 1.1, 0);
  // Taper the cabin's top for a windscreen.
  const p = cabin.getAttribute("position");
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 1.2) p.setX(i, p.getX(i) * 0.78 - 0.1);
  cabin.computeVertexNormals();
  parts.push(paintGeo(cabin, "#2a3540"));
  for (const [x, z] of [[1.35, 0.8], [-1.35, 0.8], [1.35, -0.8], [-1.35, -0.8]]) parts.push(paintGeo(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 8).rotateX(Math.PI / 2).translate(x, 0.33, z), "#151515"));
  parts.push(paintGeo(new THREE.BoxGeometry(0.06, 0.16, 1.4).translate(2.16, 0.62, 0), "#fff6d0"));
  parts.push(paintGeo(new THREE.BoxGeometry(0.06, 0.14, 1.5).translate(-2.16, 0.64, 0), "#b01818"));
  return mergeAll(parts);
}

/** A bike with a rider, along +x. */
export function bikeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [0.55, -0.55]) parts.push(paintGeo(new THREE.TorusGeometry(0.33, 0.04, 4, 10).translate(x, 0.35, 0), "#1a1a1a"));
  parts.push(paintGeo(new THREE.BoxGeometry(1.1, 0.06, 0.06).translate(0, 0.6, 0), "#d03a2a"));
  parts.push(paintGeo(new THREE.BoxGeometry(0.28, 0.65, 0.34).translate(-0.1, 1.15, 0), "#ffffff"));
  parts.push(paintGeo(new THREE.SphereGeometry(0.13, 6, 5).translate(0, 1.6, 0), "#e0b090"));
  parts.push(paintGeo(new THREE.BoxGeometry(0.16, 0.6, 0.28).translate(0.05, 0.62, 0), "#2b3550"));
  return mergeAll(parts);
}

/** A person, about 1.75 m, for the footpaths. */
export function personGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paintGeo(new THREE.CylinderGeometry(0.17, 0.2, 0.75, 6).translate(0, 1.15, 0), "#ffffff"));
  parts.push(paintGeo(new THREE.CylinderGeometry(0.15, 0.12, 0.8, 6).translate(0, 0.4, 0), "#39445a"));
  parts.push(paintGeo(new THREE.SphereGeometry(0.13, 6, 5).translate(0, 1.66, 0), "#d9a77e"));
  return mergeAll(parts);
}

export const vehicleMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.35 });

/** One tram section, 10.5 m along +x: white with a red band, dark windows, a pantograph on the middle one. */
export function tramSection(middle: boolean): THREE.BufferGeometry {
  const L = 10.4;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paintGeo(new THREE.BoxGeometry(L, 2.7, 2.6).translate(0, 1.75, 0), "#f4f2ee"));
  parts.push(paintGeo(new THREE.BoxGeometry(L + 0.02, 0.36, 2.62).translate(0, 0.62, 0), "#c8382c"));
  parts.push(paintGeo(new THREE.BoxGeometry(L - 1, 1.0, 2.64).translate(0, 2.2, 0), "#1b232b"));
  parts.push(paintGeo(new THREE.BoxGeometry(L - 0.4, 0.3, 2.3).translate(0, 3.2, 0), "#d9d6d0"));
  parts.push(paintGeo(new THREE.BoxGeometry(L * 0.5, 0.06, 2.62).translate(0, 3.05, 0), "#c8382c"));
  if (middle) {
    parts.push(paintGeo(new THREE.BoxGeometry(0.08, 1.3, 0.08).rotateZ(0.5).translate(0, 3.9, 0), "#333333"));
    parts.push(paintGeo(new THREE.BoxGeometry(0.08, 0.06, 1.6).translate(0.3, 4.5, 0), "#333333"));
  }
  return mergeAll(parts);
}

/* ------------------------------------------------------------------ construction */

/** A tower crane: mast, jib and counter-jib, a cab, a counterweight and a hook. Red, as cranes are. */
export function craneGeometry(h: number, jib: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const red = "#c42d22";
  parts.push(paintGeo(new THREE.BoxGeometry(1.6, h, 1.6).translate(0, h / 2, 0), red));
  // Lattice hint: darker bands up the mast.
  for (let y = 4; y < h; y += 6) parts.push(paintGeo(new THREE.BoxGeometry(1.7, 0.25, 1.7).translate(0, y, 0), "#7d1c15"));
  parts.push(paintGeo(new THREE.BoxGeometry(jib, 1.1, 1.0).translate(jib / 2 - 2, h + 0.6, 0), red));
  parts.push(paintGeo(new THREE.BoxGeometry(jib * 0.32, 0.9, 1.0).translate(-jib * 0.16 - 2, h + 0.6, 0), red));
  parts.push(paintGeo(new THREE.BoxGeometry(2.4, 1.8, 1.8).translate(-jib * 0.28 - 2, h - 0.1, 0), "#6c6c6c"));
  parts.push(paintGeo(new THREE.BoxGeometry(1.6, 1.6, 1.5).translate(0.4, h - 0.6, 1.4), "#e8e2d0"));
  parts.push(paintGeo(new THREE.BoxGeometry(0.5, 3.4, 0.5).translate(0, h + 2.4, 0), red));
  const hookX = jib * 0.62;
  parts.push(paintGeo(new THREE.BoxGeometry(0.06, h * 0.45, 0.06).translate(hookX, h - h * 0.225, 0), "#222222"));
  parts.push(paintGeo(new THREE.BoxGeometry(0.6, 0.5, 0.6).translate(hookX, h * 0.55, 0), "#e0b020"));
  return mergeAll(parts);
}

let scaffoldTex: THREE.CanvasTexture | null = null;

/** Scaffolding: a grid of poles and boards with netting, see-through between. */
export function scaffoldMaterial() {
  if (!scaffoldTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, 64, 64);
    g.fillStyle = "rgba(220,225,230,0.18)";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#c9ccd0";
    g.fillRect(0, 0, 64, 5);
    g.fillRect(0, 0, 4, 64);
    g.fillStyle = "#a07b46";
    g.fillRect(0, 26, 64, 4);
    scaffoldTex = new THREE.CanvasTexture(c);
    scaffoldTex.wrapS = scaffoldTex.wrapT = THREE.RepeatWrapping;
    scaffoldTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshStandardMaterial({ map: scaffoldTex, transparent: true, depthWrite: false, roughness: 0.9, side: THREE.DoubleSide });
}

export function tint(hex: string, k: number) {
  return tmpC.set(hex).multiplyScalar(k).clone();
}
