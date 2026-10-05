import * as THREE from "three";
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
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, map: detail });
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
        const slope = Math.hypot(t.at(gi + 1, gj) - t.at(gi - 1, gj), t.at(gi, gj + 1) - t.at(gi, gj - 1)) / (2 * CELL);
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

/** Instanced trees: pines and broadleaf, with a little colour variety. */
export class TreeView {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];

  constructor() {}

  static pineGeometry() {
    const parts: THREE.BufferGeometry[] = [];
    const trunk = new THREE.CylinderGeometry(0.22, 0.3, 2.4, 6).translate(0, 1.2, 0);
    paint(trunk, W.trunk);
    parts.push(trunk);
    for (const [y, r, h] of [
      [2.4, 2.6, 4.2],
      [4.6, 2.0, 3.6],
      [6.6, 1.3, 3.0],
    ]) {
      const c = new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2 - 0.4, 0);
      paint(c, "#ffffff");
      parts.push(c);
    }
    return merge(parts);
  }

  static broadGeometry() {
    const trunk = new THREE.CylinderGeometry(0.25, 0.35, 3, 6).translate(0, 1.5, 0);
    paint(trunk, W.trunk);
    const crown = new THREE.IcosahedronGeometry(2.6, 1).translate(0, 4.6, 0);
    const crown2 = new THREE.IcosahedronGeometry(1.8, 1).translate(1.2, 5.4, 0.6);
    paint(crown, "#ffffff");
    paint(crown2, "#ffffff");
    return merge([trunk, crown, crown2]);
  }

  rebuild(trees: Float32Array, alive: Uint8Array, groundAt: (x: number, z: number) => number, shadows: boolean) {
    for (const m of this.meshes) {
      this.group.remove(m);
      m.dispose();
    }
    this.meshes = [];
    const geos = [TreeView.pineGeometry(), TreeView.broadGeometry()];
    const counts = [0, 0];
    for (let i = 0; i < alive.length; i++) if (alive[i]) counts[trees[i * 4 + 3] % 2]++;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, emissive: new THREE.Color("#1d3315"), emissiveIntensity: 0.35 });
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
    for (let i = 0; i < alive.length; i++) {
      if (!alive[i]) continue;
      const x = trees[i * 4];
      const z = trees[i * 4 + 1];
      const s = trees[i * 4 + 2];
      const v = trees[i * 4 + 3];
      const m = meshes[v % 2];
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(x, z) * Math.PI * 2);
      const k = s * 1.45;
      mtx.compose(new THREE.Vector3(x, groundAt(x, z) - 0.2, z), q, new THREE.Vector3(k, k * (0.85 + hash(z, x) * 0.35), k));
      m.setMatrixAt(m.count, mtx);
      c.set(W.trees[v % W.trees.length]).offsetHSL((hash(x) - 0.5) * 0.04, 0, (hash(z) - 0.5) * 0.08);
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
