import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CELL, CELLS, CHUNK, WATER_LEVEL, WORLD } from "../config";
import { hash } from "../core/rng";
import { world as W } from "../theme";
import type { Terrain } from "../world/terrain";
import { shared } from "./engine";

const per = CELLS / CHUNK;

function groundColor(h: number, slope: number, n: number, out: THREE.Color) {
  if (h < WATER_LEVEL - 0.2) {
    const d = Math.min(1, (WATER_LEVEL - h) / 10);
    return out.set(W.sand).lerp(new THREE.Color("#2c5a5a"), 0.35 + d * 0.5);
  }
  if (h < WATER_LEVEL + 1.4) return out.set(W.sand).offsetHSL(0, 0, (n - 0.5) * 0.06);
  if (h > 82) return out.set(W.snow);
  if (slope > 0.75) return out.set(W.rock).offsetHSL(0, 0, (n - 0.5) * 0.08);
  out.set(W.grass).lerp(new THREE.Color(W.grassDry), Math.min(1, slope * 0.9 + n * 0.35));
  if (h > 45) out.lerp(new THREE.Color(W.rock), Math.min(1, (h - 45) / 40));
  return out.offsetHSL(0, 0, (n - 0.5) * 0.05);
}

/** A tiling detail texture so the grass doesn't look flat up close. */
function detailTexture() {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  const img = g.createImageData(s, s);
  for (let i = 0; i < s * s; i++) {
    const v = 214 + Math.floor((hash(i % s, Math.floor(i / s)) - 0.5) * 70);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function waterNormals() {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  const img = g.createImageData(s, s);
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const a = Math.sin((x / s) * Math.PI * 4 + Math.sin((y / s) * Math.PI * 6)) * 0.5 + Math.sin(((x + y) / s) * Math.PI * 6) * 0.3;
      const b = Math.cos((y / s) * Math.PI * 4 + Math.sin((x / s) * Math.PI * 2)) * 0.5;
      const k = (y * s + x) * 4;
      img.data[k] = 128 + a * 40;
      img.data[k + 1] = 128 + b * 40;
      img.data[k + 2] = 255;
      img.data[k + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Terrain chunks (built and dropped with the camera), the water and the skirt beyond the map. */
export class TerrainView {
  readonly group = new THREE.Group();
  private chunks = new Map<number, THREE.Mesh>();
  private mat: THREE.MeshStandardMaterial;
  private water: THREE.Mesh;
  private skirt: THREE.Mesh | null = null;
  private waterTex: THREE.Texture;
  private lastVersion = -1;

  constructor(private terrain: Terrain) {
    const detail = detailTexture();
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, map: detail, envMapIntensity: 0.55 });
    // Natural ground: broad patches of lusher and drier grass, and finer mottling, in world space
    // so the land never shows a repeating tile.
    this.mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vZcW;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvZcW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying vec3 vZcW;
float zcH(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float zcN(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(zcH(i), zcH(i + vec2(1.0, 0.0)), f.x), mix(zcH(i + vec2(0.0, 1.0)), zcH(i + vec2(1.0, 1.0)), f.x), f.y); }`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
  {
    vec2 w = vZcW.xz;
    float big = zcN(w / 190.0) * 0.6 + zcN(w / 70.0) * 0.4;
    float mid = zcN(w / 17.0);
    float fine = zcN(w / 3.1);
    // Only green-ish ground gets the grass treatment (sand, rock and snow stay as they are).
    float green = smoothstep(0.02, 0.08, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
    vec3 lush = diffuseColor.rgb * vec3(0.82, 0.95, 0.78);
    vec3 dry = mix(diffuseColor.rgb, vec3(0.55, 0.52, 0.32), 0.45);
    vec3 g = mix(lush, dry, smoothstep(0.35, 0.8, big));
    g *= 0.9 + mid * 0.14 + fine * 0.06;
    diffuseColor.rgb = mix(diffuseColor.rgb, g, green);
  }`,
        );
    };
    this.waterTex = waterNormals();
    this.waterTex.repeat.set(220, 220);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD * 4, WORLD * 4).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: W.waterShallow, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.84, normalMap: this.waterTex, normalScale: new THREE.Vector2(0.35, 0.35), depthWrite: false }),
    );
    water.position.set(WORLD / 2, WATER_LEVEL, WORLD / 2);
    water.renderOrder = 2;
    water.receiveShadow = true;
    this.water = water;
    this.group.add(water);
    this.buildSkirt();
  }

  /** Land beyond the edges: the border heights carried outward and faded into the haze. */
  private buildSkirt() {
    const t = this.terrain;
    const ring: THREE.Vector3[] = [];
    const step = 4;
    for (let i = 0; i < CELLS; i += step) ring.push(new THREE.Vector3(i * CELL, t.at(i, 0), 0));
    for (let j = 0; j < CELLS; j += step) ring.push(new THREE.Vector3(WORLD, t.at(CELLS, j), j * CELL));
    for (let i = CELLS; i > 0; i -= step) ring.push(new THREE.Vector3(i * CELL, t.at(i, CELLS), WORLD));
    for (let j = CELLS; j > 0; j -= step) ring.push(new THREE.Vector3(0, t.at(0, j), j * CELL));
    const landShare = ring.filter((p) => p.y > WATER_LEVEL).length / ring.length;
    const farY = landShare > 0.5 ? ring.filter((p) => p.y > 0).reduce((s, p) => s + p.y, 0) / Math.max(1, ring.filter((p) => p.y > 0).length) : -14;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const c = new THREE.Color();
    const centre = new THREE.Vector3(WORLD / 2, 0, WORLD / 2);
    for (let k = 0; k < ring.length; k++) {
      const p = ring[k];
      const out = p.clone().sub(centre).setY(0).normalize();
      for (const [d, y] of [
        [0, p.y],
        [260, p.y * 0.6 + farY * 0.4],
        [2600, farY],
      ] as const) {
        pos.push(p.x + out.x * d, y, p.z + out.z * d);
        groundColor(y, 0.1, 0.5, c);
        col.push(c.r, c.g, c.b);
      }
    }
    const n = ring.length;
    for (let k = 0; k < n; k++) {
      const a = k * 3;
      const b = ((k + 1) % n) * 3;
      for (let r = 0; r < 2; r++) idx.push(a + r, b + r, a + r + 1, b + r, b + r + 1, a + r + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.skirt = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
    this.skirt.receiveShadow = true;
    this.group.add(this.skirt);
  }

  private buildChunk(ci: number, cj: number) {
    const t = this.terrain;
    const n = CHUNK + 1;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    const c = new THREE.Color();
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const gi = ci * CHUNK + i;
        const gj = cj * CHUNK + j;
        const k = j * n + i;
        const h = t.at(gi, gj);
        const x = gi * CELL;
        const z = gj * CELL;
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        let slope = Math.hypot(t.at(gi + 1, gj) - t.at(gi - 1, gj), t.at(gi, gj + 1) - t.at(gi, gj - 1)) / (2 * CELL);
        // Road cuttings and embankments are grassed over, not bare rock.
        if (gi >= 0 && gj >= 0 && gi <= CELLS && gj <= CELLS && t.graded[gj * t.n + gi]) slope = Math.min(slope, 0.5);
        groundColor(h, slope, hash(gi, gj), c);
        col[k * 3] = c.r;
        col[k * 3 + 1] = c.g;
        col[k * 3 + 2] = c.b;
        uv[k * 2] = x / 24;
        uv[k * 2 + 1] = z / 24;
      }
    const idx: number[] = [];
    for (let j = 0; j < CHUNK; j++)
      for (let i = 0; i < CHUNK; i++) {
        const a = j * n + i;
        idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.mat);
    m.receiveShadow = true;
    m.castShadow = true;
    m.userData.chunk = cj * per + ci;
    return m;
  }

  /** Keep the chunks near the camera built, drop the far ones, rebuild edited ones (a few per frame). */
  update(cx: number, cz: number, range: number, time: number) {
    this.waterTex.offset.set(time * 0.004, time * 0.0025);
    shared.uTime.value = time;
    const t = this.terrain;
    let budget = 3;
    if (t.version !== this.lastVersion) {
      for (const id of [...t.dirty]) {
        if (budget <= 0) break;
        const old = this.chunks.get(id);
        if (old) {
          old.geometry.dispose();
          this.group.remove(old);
          this.chunks.delete(id);
        }
        t.dirty.delete(id);
        budget--;
      }
      if (t.dirty.size === 0) this.lastVersion = t.version;
    }
    const size = CHUNK * CELL;
    for (let cj = 0; cj < per; cj++)
      for (let ci = 0; ci < per; ci++) {
        const id = cj * per + ci;
        const mx = (ci + 0.5) * size;
        const mz = (cj + 0.5) * size;
        const d = Math.hypot(mx - cx, mz - cz) - size * 0.71;
        const have = this.chunks.get(id);
        if (d < range && !have && budget-- > 0) {
          const m = this.buildChunk(ci, cj);
          this.chunks.set(id, m);
          this.group.add(m);
        } else if (have && d > range * 1.5) {
          have.geometry.dispose();
          this.group.remove(have);
          this.chunks.delete(id);
        }
      }
  }

  /** Build every chunk now (map load). */
  buildAll() {
    for (let cj = 0; cj < per; cj++)
      for (let ci = 0; ci < per; ci++) {
        const id = cj * per + ci;
        if (this.chunks.has(id)) continue;
        const m = this.buildChunk(ci, cj);
        this.chunks.set(id, m);
        this.group.add(m);
      }
    this.terrain.dirty.clear();
    this.lastVersion = this.terrain.version;
  }

  pickables() {
    return [...this.chunks.values()];
  }

  dispose() {
    for (const m of this.chunks.values()) m.geometry.dispose();
    this.chunks.clear();
    this.mat.map?.dispose();
    this.mat.dispose();
    this.waterTex.dispose();
    this.skirt?.geometry.dispose();
  }
}

/**
 * The material all trees share: a gentle sway in the wind (the top moves, the base stays put,
 * each tree on its own beat) and a leafy dappling so crowns read as foliage, not facets.
 */
export function foliageMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, envMapIntensity: 0.4 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec3 vZcLeaf;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
  vZcLeaf = position * 2.3;
#ifdef USE_INSTANCING
  float zcPh = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.11;
  float zcSw = max(0.0, transformed.y - 1.5) * 0.018;
  transformed.x += sin(uTime * 1.3 + zcPh) * zcSw;
  transformed.z += cos(uTime * 1.1 + zcPh * 1.3) * zcSw * 0.7;
  vZcLeaf += instanceMatrix[3].xyz * 0.7;
#endif`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vZcLeaf;
float zcL(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n = dot(i, vec3(1.0, 57.0, 113.0));
  vec4 a = fract(sin(vec4(n, n + 1.0, n + 57.0, n + 58.0)) * 43758.5453);
  vec4 b = fract(sin(vec4(n + 113.0, n + 114.0, n + 170.0, n + 171.0)) * 43758.5453);
  vec4 m = mix(a, b, f.z);
  vec2 q = mix(m.xy, m.zw, f.y);
  return mix(q.x, q.y, f.x); }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    // Leaves only (green-dominant colours), not trunks.
    float leaf = smoothstep(0.0, 0.06, diffuseColor.g - diffuseColor.r);
    float d = zcL(vZcLeaf) * 0.6 + zcL(vZcLeaf * 2.7) * 0.4;
    diffuseColor.rgb *= mix(1.0, 0.72 + d * 0.5, leaf);
  }`,
      );
  };
  return mat;
}

/** Instanced trees: pines and broadleaf, with a little colour variety. */
export class TreeView {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];

  constructor() {}

  /** Bend a sphere-ish crown into an organic clump, darker underneath and inside. */
  private static crown(r: number, cx: number, cy: number, cz: number, color: string, seed: number, squash = 1) {
    // Welded, so the displaced crown shades smoothly instead of in facets.
    const raw = new THREE.IcosahedronGeometry(r, 2);
    raw.deleteAttribute("normal");
    raw.deleteAttribute("uv");
    const g = mergeVertices(raw);
    const pos = g.attributes.position;
    const base = new THREE.Color(color);
    const col = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const d = v.clone().normalize();
      const n = Math.sin(d.x * 5.1 + seed) * Math.sin(d.y * 4.3 + seed * 2) * Math.sin(d.z * 4.7 + seed * 3);
      const k = 1 + n * 0.22;
      v.set(d.x * r * k, d.y * r * k * squash, d.z * r * k);
      pos.setXYZ(i, v.x + cx, v.y + cy, v.z + cz);
      // Light from above: the underside of the crown is in its own shade.
      const shade = 0.62 + 0.38 * (d.y * 0.5 + 0.5) + n * 0.05;
      col[i * 3] = base.r * shade;
      col[i * 3 + 1] = base.g * shade;
      col[i * 3 + 2] = base.b * shade;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  static pineGeometry() {
    const parts: THREE.BufferGeometry[] = [];
    const trunk = new THREE.CylinderGeometry(0.2, 0.32, 3, 7).translate(0, 1.5, 0);
    paint(trunk, "#5a4130");
    parts.push(trunk);
    const tiers: [number, number, number][] = [
      [1.6, 3.0, 3.4],
      [3.3, 2.5, 3.2],
      [5.0, 2.0, 3.0],
      [6.6, 1.45, 2.6],
      [8.0, 0.9, 2.2],
    ];
    tiers.forEach(([y, r, h], k) => {
      const c = new THREE.ConeGeometry(r, h, 10, 2).translate(0, y + h / 2 - 0.3, 0);
      const pos = c.attributes.position;
      const col = new Float32Array(pos.count * 3);
      const base = new THREE.Color("#2f5a2c");
      for (let i = 0; i < pos.count; i++) {
        // A ragged hem on each tier and a little lean.
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const yy = pos.getY(i);
        const a = Math.atan2(z, x);
        const rim = 1 + Math.sin(a * 5 + k * 1.7) * 0.08;
        pos.setXYZ(i, x * rim, yy - (Math.abs(Math.sin(a * 5 + k)) * 0.25 * (1 - (yy - y) / h)), z * rim);
        const shade = 0.6 + 0.4 * ((yy - y) / h + 0.3) + k * 0.03;
        col[i * 3] = base.r * shade;
        col[i * 3 + 1] = base.g * shade;
        col[i * 3 + 2] = base.b * shade;
      }
      c.setAttribute("color", new THREE.BufferAttribute(col, 3));
      c.computeVertexNormals();
      parts.push(c);
    });
    return merge(parts);
  }

  static broadGeometry() {
    const trunk = new THREE.CylinderGeometry(0.22, 0.36, 3.4, 7).translate(0, 1.7, 0);
    paint(trunk, "#5e4632");
    const branch = new THREE.CylinderGeometry(0.1, 0.16, 2, 5).rotateZ(0.7).translate(0.7, 3.6, 0);
    paint(branch, "#5e4632");
    const leaf = "#4d7f34";
    return merge([
      trunk,
      branch,
      TreeView.crown(2.5, 0, 5.0, 0, leaf, 1),
      TreeView.crown(1.9, 1.5, 5.6, 0.6, "#558a38", 2),
      TreeView.crown(1.8, -1.3, 5.3, -0.7, "#47772f", 3),
      TreeView.crown(1.5, 0.2, 6.8, -0.4, "#5a9139", 4),
    ]);
  }

  /** A tall, narrow poplar-like tree. */
  static columnGeometry() {
    const trunk = new THREE.CylinderGeometry(0.16, 0.26, 2.4, 6).translate(0, 1.2, 0);
    paint(trunk, "#5e4632");
    return merge([trunk, TreeView.crown(1.6, 0, 5.4, 0, "#4f8a36", 5, 2.4), TreeView.crown(1.1, 0.4, 7.6, 0.2, "#5b9640", 6, 1.8)]);
  }

  rebuild(trees: Float32Array, alive: Uint8Array, groundAt: (x: number, z: number) => number, shadows: boolean) {
    for (const m of this.meshes) {
      this.group.remove(m);
      m.dispose();
    }
    this.meshes = [];
    const geos = [TreeView.pineGeometry(), TreeView.broadGeometry(), TreeView.columnGeometry()];
    const kind = (v: number, x: number, z: number) => (v % 2 === 0 ? 0 : hash(x * 0.37, z * 0.73) < 0.22 ? 2 : 1);
    const counts = [0, 0, 0];
    for (let i = 0; i < alive.length; i++) if (alive[i]) counts[kind(trees[i * 4 + 3], trees[i * 4], trees[i * 4 + 1])]++;
    const mat = foliageMaterial();
    const meshes = geos.map((g, k) => {
      const m = new THREE.InstancedMesh(g, mat, Math.max(1, counts[k]));
      m.castShadow = shadows;
      m.receiveShadow = true;
      m.count = 0;
      return m;
    });
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    const white = new THREE.Color("#ffffff");
    for (let i = 0; i < alive.length; i++) {
      if (!alive[i]) continue;
      const x = trees[i * 4];
      const z = trees[i * 4 + 1];
      const s = trees[i * 4 + 2];
      const v = trees[i * 4 + 3];
      const m = meshes[kind(v, x, z)];
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(x, z) * Math.PI * 2);
      const k = s * 1.45;
      mtx.compose(new THREE.Vector3(x, groundAt(x, z) - 0.2, z), q, new THREE.Vector3(k, k * (0.85 + hash(z, x) * 0.35), k));
      m.setMatrixAt(m.count, mtx);
      // Each tree a little different: some greener, some yellower, some darker.
      c.copy(white).lerp(new THREE.Color(W.trees[v % W.trees.length]).multiplyScalar(1.6), 0.18).offsetHSL((hash(x) - 0.5) * 0.05, 0, (hash(z) - 0.5) * 0.12);
      m.setColorAt(m.count, c);
      m.count++;
    }
    for (const m of meshes) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
      this.group.add(m);
    }
    this.meshes = meshes;
  }

  setShadows(on: boolean) {
    for (const m of this.meshes) m.castShadow = on;
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.dispose();
    }
  }
}

/** Give a geometry a flat vertex colour. */
export function paint(g: THREE.BufferGeometry, color: string) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Merge non-indexed copies of geometries that share position/normal/color. */
export function merge(parts: THREE.BufferGeometry[]) {
  const geos = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array as Float32Array, o * 3);
    else col.fill(1, o * 3, (o + g.attributes.position.count) * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
