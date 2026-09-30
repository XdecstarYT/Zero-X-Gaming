import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRng } from "../../engine/rng";
import { GROUND, SOLID, type Building, type GameMap } from "../map";
import {
  asphaltTexture,
  barkTexture,
  brickTexture,
  concreteTexture,
  crateTexture,
  dirtTexture,
  grassBladesTexture,
  grassTexture,
  leafClusterTexture,
  pineSprayTexture,
  roofTexture,
  setTextureDetail,
  stoneTexture,
  woodFloorTexture,
  type TexSet,
} from "./textures";

/**
 * Builds the static 3D town from the game map. Grid cells are 1 m; world
 * (x, y) maps to three.js (x, z). Everything static is merged per material,
 * so the whole town is a couple of dozen draw calls.
 */

export const FLOOR_H = 3;
const BRICK_TILE_H = 0.6;

type Bucket = { mat: THREE.Material; geos: THREE.BufferGeometry[]; shadow: boolean };

class Batcher {
  private buckets = new Map<string, Bucket>();
  add(key: string, mat: THREE.Material, geo: THREE.BufferGeometry, m: THREE.Matrix4, color?: THREE.Color, shadow = true) {
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { mat, geos: [], shadow }));
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    if (color) {
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = color.r;
        arr[i * 3 + 1] = color.g;
        arr[i * 3 + 2] = color.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    }
    b.geos.push(g);
  }
  flush(parent: THREE.Object3D, shadows: boolean) {
    for (const b of this.buckets.values()) {
      if (!b.geos.length) continue;
      const merged = mergeGeometries(b.geos, false);
      b.geos.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = shadows && b.shadow;
      mesh.receiveShadow = shadows;
      parent.add(mesh);
    }
    this.buckets.clear();
  }
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const P = new THREE.Vector3();
const E = new THREE.Euler();
function mat4(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) {
  E.set(rx, ry, rz);
  Q.setFromEuler(E);
  return M.compose(P.set(x, y, z), Q, S.set(sx, sy, sz));
}

function std(t: TexSet | null, opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    map: t?.map ?? null,
    normalMap: t?.normal ?? null,
    normalScale: new THREE.Vector2(1, 1),
    roughness: 0.9,
    metalness: 0,
    ...opts,
  });
}

/** Box with UVs in metres (u along the face width, v up), so tiled textures keep real scale. */
function metricBox(w: number, h: number, d: number, tileW = 1, tileH = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i));
    const ny = Math.abs(n.getY(i));
    const fw = ny > 0.5 ? w : nx > 0.5 ? d : w;
    const fh = ny > 0.5 ? d : h;
    uv.setXY(i, (uv.getX(i) * fw) / tileW, (uv.getY(i) * fh) / tileH);
  }
  return g;
}

/** Displace a geometry's vertices with smooth-ish noise for organic shapes (rocks, foliage). */
function lumpy(geo: THREE.BufferGeometry, seed: number, amount: number) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const rng = createRng(seed);
  const a = rng.range(0, 6.28);
  const b = rng.range(0, 6.28);
  const cache = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let k = cache.get(key);
    if (k === undefined) {
      k = 1 + amount * (Math.sin(x * 3.1 + a) * Math.cos(z * 2.7 + b) * 0.6 + Math.sin(y * 4.3 + a + b) * 0.4);
      cache.set(key, k);
    }
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

export interface TownOptions {
  shadows: boolean;
  detail: "high" | "low";
}

export function buildTown(map: GameMap, opts: TownOptions) {
  const root = new THREE.Group();
  const batch = new Batcher();
  const rng = createRng(map.width * 131 + map.height);
  const W = map.width;
  const H = map.height;
  const cx = W / 2;
  const cz = H / 2;
  const cell = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? SOLID.perimeter : map.cells[y * W + x]);
  const ground = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? GROUND.grass : map.ground[y * W + x]);

  // ------------------------------------------------------------ materials
  setTextureDetail(opts.detail);
  const tex = {
    grass: grassTexture(),
    asphalt: asphaltTexture(),
    dirt: dirtTexture(),
    concrete: concreteTexture(),
    brick: brickTexture(),
    wood: woodFloorTexture(),
    crate: crateTexture(),
    bark: barkTexture(),
    roof: roofTexture(),
    stone: stoneTexture(),
  };
  const mats = {
    grass: std(tex.grass, { roughness: 1 }),
    asphalt: std(tex.asphalt, { roughness: 0.95 }),
    dirt: std(tex.dirt),
    wood: std(tex.wood, { roughness: 0.7 }),
    concrete: std(tex.concrete),
    brick: std(tex.brick),
    perimeter: std(tex.concrete, { color: "#b9b6ad" }),
    trim: std(null, { color: "#d8d4c8", roughness: 0.8 }),
    ceiling: std(null, { color: "#e7e2d6", roughness: 1 }),
    roof: std(tex.roof, { roughness: 0.8 }),
    flatRoof: std(tex.concrete, { color: "#8d8a84" }),
    glass: new THREE.MeshStandardMaterial({ color: "#6f8ea6", roughness: 0.08, metalness: 0.9, envMapIntensity: 1.4 }),
    frame: std(null, { color: "#d9d4c7", roughness: 0.7 }),
    door: std(null, { color: "#5a3b24", roughness: 0.7 }),
    crate: std(tex.crate, { roughness: 0.85 }),
    bark: std(tex.bark),
    leaves: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false }),
    leafCards: new THREE.MeshStandardMaterial({
      map: leafClusterTexture(opts.detail === "high" ? 256 : 128),
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      vertexColors: true,
      roughness: 0.85,
    }),
    pineCards: new THREE.MeshStandardMaterial({
      map: pineSprayTexture(opts.detail === "high" ? 256 : 128),
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      vertexColors: true,
      roughness: 0.9,
    }),
    sidewalk: std(tex.concrete, { color: "#c9c6bf" }),
    curb: std(tex.concrete, { color: "#a9a69f" }),
    plinth: std(tex.concrete, { color: "#77736c" }),
    lampPole: new THREE.MeshStandardMaterial({ color: "#3a3d40", metalness: 0.7, roughness: 0.45 }),
    lampGlass: new THREE.MeshStandardMaterial({ color: "#fff4d6", emissive: "#ffe2a8", emissiveIntensity: 0.6, roughness: 0.2 }),
    rock: std(tex.stone, { vertexColors: true }),
    fence: std(null, { color: "#7a5c3e", roughness: 0.9 }),
    paint: std(null, { color: "#e9e4d0", roughness: 0.7 }),
    hill: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
  };
  const tile = (t: TexSet, rx: number, ry = rx) => {
    for (const x of [t.map, t.bump, t.normal]) x?.repeat.set(rx, ry);
  };
  tile(tex.grass, 1 / 3);
  tile(tex.asphalt, 1 / 4);
  tile(tex.dirt, 1 / 3);
  tile(tex.wood, 1 / 2);

  // --------------------------------------------------------------- ground
  // One big grass field (the town plus the surrounding countryside).
  const field = new THREE.PlaneGeometry(700, 700);
  const fuv = field.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * 700, fuv.getY(i) * 700);
  const grassMesh = new THREE.Mesh(field, mats.grass);
  grassMesh.rotation.x = -Math.PI / 2;
  grassMesh.position.set(cx, 0, cz);
  grassMesh.receiveShadow = opts.shadows;
  root.add(grassMesh);

  // Road / floor / dirt tiles as metric-UV quads just above the grass.
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.rotateX(-Math.PI / 2);
  const quadAt = (x: number, y: number) => {
    const q = quad.clone();
    q.translate(x + 0.5, 0, y + 0.5);
    const uv = q.attributes.uv as THREE.BufferAttribute;
    const pos = q.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), -pos.getZ(i));
    return q;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const g = ground(x, y);
      if (g === GROUND.road) batch.add("road", mats.asphalt, quadAt(x, y), mat4(0, 0.012, 0), undefined, false);
      else if (g === GROUND.floor) batch.add("floor", mats.wood, quadAt(x, y), mat4(0, 0.02, 0), undefined, false);
      else if (g === GROUND.dirt) batch.add("dirt", mats.dirt, quadAt(x, y), mat4(0, 0.008, 0), undefined, false);
    }
  // Sidewalks (with a curb on the road side) and street lamps along every road.
  const slab = metricBox(1, 0.06, 1, 1.5, 1.5);
  const curbV = metricBox(0.14, 0.13, 1);
  const curbH = metricBox(1, 0.13, 0.14);
  const nb: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (ground(x, y) === GROUND.road || ground(x, y) === GROUND.floor || cell(x, y) !== 0) continue;
      const roadSides = nb.filter(([dx, dy]) => ground(x + dx, y + dy) === GROUND.road);
      if (!roadSides.length) continue;
      batch.add("sidewalk", mats.sidewalk, slab, mat4(x + 0.5, 0.03, y + 0.5), undefined, false);
      for (const [dx, dy] of roadSides)
        batch.add(
          "curb",
          mats.curb,
          dx ? curbV : curbH,
          mat4(x + 0.5 + dx * 0.43, 0.065, y + 0.5 + dy * 0.43),
          undefined,
          false,
        );
      if ((x * 7 + y * 13) % 17 === 0) {
        const [dx, dy] = roadSides[0];
        const px = x + 0.5 - dx * 0.25;
        const pz = y + 0.5 - dy * 0.25;
        batch.add("lampPole", mats.lampPole, new THREE.CylinderGeometry(0.045, 0.07, 4.6, 8), mat4(px, 2.3, pz));
        const armLen = 1.1;
        const ang = Math.atan2(dy, dx);
        batch.add(
          "lampPole",
          mats.lampPole,
          new THREE.BoxGeometry(armLen, 0.06, 0.06),
          mat4(px + Math.cos(ang) * armLen * 0.5, 4.55, pz + Math.sin(ang) * armLen * 0.5, 1, 1, 1, -ang),
        );
        batch.add(
          "lampGlass",
          mats.lampGlass,
          new THREE.BoxGeometry(0.42, 0.1, 0.22),
          mat4(px + Math.cos(ang) * armLen, 4.48, pz + Math.sin(ang) * armLen, 1, 1, 1, -ang),
          undefined,
          false,
        );
      }
    }

  // Centre-line dashes on straight road bands (2 or 4 cells wide), skipping junctions.
  const dash = new THREE.BoxGeometry(0.9, 0.01, 0.12);
  const isRoad = (a: number, b: number) => ground(a, b) === GROUND.road;
  const band = (get: (d: number) => boolean) => (get(-1) && get(0) && !get(-2) && !get(1)) || (get(-2) && get(-1) && get(0) && get(1) && !get(-3) && !get(2));
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      // East-west road: centre line at z = y, dash along x.
      if (x % 3 === 0 && band((d) => isRoad(x, y + d)) && band((d) => isRoad(x + 1, y + d)) && !isRoad(x, y - 5) && !isRoad(x, y + 4))
        batch.add("paint", mats.paint, dash, mat4(x + 0.5, 0.02, y), undefined, false);
      // North-south road: centre line at x = x, dash along z.
      if (y % 3 === 0 && band((d) => isRoad(x + d, y)) && band((d) => isRoad(x + d, y + 1)) && !isRoad(x - 5, y) && !isRoad(x + 4, y))
        batch.add("paint", mats.paint, dash, mat4(x, 0.02, y + 0.5, 1, 1, 1, Math.PI / 2), undefined, false);
    }

  // ------------------------------------------------------------- buildings
  const owner = new Int16Array(W * H).fill(-1);
  map.buildings.forEach((b, i) => {
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) owner[y * W + x] = i;
  });
  const heightAt = (x: number, y: number) => {
    const o = owner[y * W + x];
    return o >= 0 ? map.buildings[o].floors * FLOOR_H : FLOOR_H;
  };
  const wallGeo = new Map<string, THREE.BufferGeometry>();
  const wallBox = (h: number, tileH: number) => {
    const k = `${h}:${tileH}`;
    let g = wallGeo.get(k);
    if (!g) wallGeo.set(k, (g = metricBox(1, h, 1, 1, tileH)));
    return g;
  };

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = cell(x, y);
      if (!c) continue;
      const px = x + 0.5;
      const pz = y + 0.5;
      const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      switch (c) {
        case SOLID.brick: {
          const h = heightAt(x, y);
          batch.add("brick", mats.brick, wallBox(h, BRICK_TILE_H), mat4(px, h / 2, pz));
          break;
        }
        case SOLID.concrete: {
          const h = heightAt(x, y);
          batch.add("concrete", mats.concrete, wallBox(h, 1.5), mat4(px, h / 2, pz));
          break;
        }
        case SOLID.perimeter: {
          batch.add("perimeter", mats.perimeter, wallBox(2.6, 1.3), mat4(px, 1.3, pz));
          break;
        }
        case SOLID.crate: {
          const stack = hash % 3 === 0 ? 2 : 1;
          for (let s = 0; s < stack; s++)
            batch.add("crate", mats.crate, wallBox(0.98, 1), mat4(px, 0.49 + s * 0.98, pz, 1, 1, 1, s ? 0.2 : (hash % 7) * 0.02));
          break;
        }
        case SOLID.rock: {
          const g = lumpy(new THREE.IcosahedronGeometry(0.72, 1), hash, 0.22);
          const tint = 0.8 + (hash % 20) / 60;
          batch.add("rock", mats.rock, g, mat4(px, 0.35, pz, 1.1, 0.8 + (hash % 5) * 0.08, 1.05, hash % 6), new THREE.Color().setRGB(tint, tint, tint * 0.97, THREE.SRGBColorSpace));
          break;
        }
        case SOLID.tree:
          addTree(batch, mats, px, pz, hash, opts.detail);
          break;
        case SOLID.fence: {
          const horiz = cell(x - 1, y) === SOLID.fence || cell(x + 1, y) === SOLID.fence;
          const ry = horiz ? 0 : Math.PI / 2;
          batch.add("fence", mats.fence, wallBox(1.1, 1), mat4(px, 0.55, pz, 0.1, 1, 0.1));
          for (const hy of [0.35, 0.8]) batch.add("fence", mats.fence, wallBox(0.08, 1), mat4(px, hy, pz, 1, 1, 0.05, ry));
          break;
        }
      }
    }

  for (const b of map.buildings) addBuilding(batch, mats, b, cell, ground, rng);

  // Countryside beyond the wall: tree belt + distant hills (hazy in the fog).
  for (let i = 0; i < (opts.detail === "high" ? 520 : 260); i++) {
    const a = rng.next() * Math.PI * 2;
    const r = rng.range(W * 0.72, W * 1.25);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (x > -1.5 && x < W + 1.5 && z > -1.5 && z < H + 1.5) continue;
    addTree(batch, mats, x, z, (rng.next() * 1e9) >>> 0, opts.detail, true);
  }
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const r = rng.range(170, 260);
    const s = rng.range(40, 90);
    const g = lumpy(new THREE.IcosahedronGeometry(1, 2), i * 7 + 3, 0.18);
    const col = new THREE.Color().setHSL(0.27 + rng.range(-0.04, 0.03), 0.25, 0.28 + rng.range(0, 0.08), THREE.SRGBColorSpace);
    batch.add("hill", mats.hill, g, mat4(cx + Math.cos(a) * r, -s * 0.35, cz + Math.sin(a) * r, s * 1.6, s * rng.range(0.45, 0.75), s * 1.3), col, false);
  }

  batch.flush(root, opts.shadows);
  const time = { value: 0 };
  root.add(buildGrass(map, opts.detail, time));
  return { root, time };
}

const cardGeo = new THREE.PlaneGeometry(1, 1);

/**
 * Trees built SpeedTree-style from alpha-tested foliage cards (leaf clusters or
 * pine sprays) around a trunk, plus a dark inner mass so canopies read solid.
 */
function addTree(
  batch: Batcher,
  mats: Record<string, THREE.Material>,
  x: number,
  z: number,
  hash: number,
  detail: "high" | "low",
  far = false,
) {
  const rng = createRng(hash);
  const pine = hash % 3 !== 0;
  const scale = 0.85 + (hash % 13) / 30;
  const hue = 0.25 + ((hash >> 4) % 10) / 160;
  const lod = far ? 0.35 : detail === "high" ? 1 : 0.6;
  if (pine) {
    const height = 7.5 * scale;
    batch.add("bark", mats.bark, new THREE.CylinderGeometry(0.07, 0.24, height, 8), mat4(x, height / 2, z));
    const tiers = Math.max(3, Math.round(7 * lod));
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const r = (1.9 - t * 1.55) * scale;
      const top = 1.6 * scale + t * (height - 1.9 * scale) + 0.4;
      const cards = far ? 2 : detail === "high" ? 5 : 4;
      const col = new THREE.Color().setHSL(hue + 0.06, 0.25, 0.8 + rng.range(-0.08, 0.06) + t * 0.05, THREE.SRGBColorSpace);
      for (let k = 0; k < cards; k++) {
        const ry = (k / cards) * Math.PI + rng.range(0, 0.6);
        const tilt = far ? 0 : rng.range(-0.28, 0.28);
        batch.add("pineCards", mats.pineCards, cardGeo, mat4(x, top - r * 0.5, z, r * 2.1, r * 1.05, 1, ry, tilt), col, true);
      }
    }
    if (!far)
      batch.add(
        "leaves",
        mats.leaves,
        lumpy(new THREE.ConeGeometry(0.75 * scale, height * 0.62, 8, 1), hash, 0.06),
        mat4(x, 1.9 * scale + height * 0.31, z),
        new THREE.Color().setHSL(hue + 0.06, 0.4, 0.2, THREE.SRGBColorSpace),
      );
  } else {
    const trunkH = 2.8 * scale;
    batch.add("bark", mats.bark, new THREE.CylinderGeometry(0.13, 0.24, trunkH, 8), mat4(x, trunkH / 2, z));
    if (!far)
      for (let b = 0; b < 3; b++) {
        const a = b * 2.1 + rng.next();
        batch.add(
          "bark",
          mats.bark,
          new THREE.CylinderGeometry(0.05, 0.09, 1.5 * scale, 6),
          mat4(x + Math.cos(a) * 0.35, trunkH + 0.45, z + Math.sin(a) * 0.35, 1, 1, 1, -a, 0, 0.6),
        );
      }
    const R = 2.0 * scale;
    const cy = trunkH + R * 0.7;
    batch.add(
      "leaves",
      mats.leaves,
      lumpy(new THREE.IcosahedronGeometry(R * 0.72, 1), hash, 0.2),
      mat4(x, cy, z, 1, 0.82, 1),
      new THREE.Color().setHSL(hue, 0.4, 0.2, THREE.SRGBColorSpace),
    );
    const cards = Math.round(38 * lod);
    for (let i = 0; i < cards; i++) {
      // Random point in the canopy ellipsoid, biased to the surface.
      const u = rng.next() * Math.PI * 2;
      const v = Math.acos(rng.range(-0.7, 1));
      const rr = R * (0.55 + 0.45 * Math.sqrt(rng.next()));
      const px = x + Math.sin(v) * Math.cos(u) * rr;
      const py = cy + Math.cos(v) * rr * 0.8;
      const pz = z + Math.sin(v) * Math.sin(u) * rr;
      const size = rng.range(1.2, 1.8) * scale;
      const top = (py - cy) / R;
      const col = new THREE.Color().setHSL(hue + rng.range(-0.02, 0.02), 0.3, 0.8 + top * 0.1 + rng.range(-0.1, 0.06), THREE.SRGBColorSpace);
      batch.add(
        "leafCards",
        mats.leafCards,
        cardGeo,
        mat4(px, py, pz, size, size, 1, rng.next() * Math.PI * 2, rng.range(-0.9, 0.9), rng.range(-0.5, 0.5)),
        col,
        true,
      );
    }
  }
}

/** Wind-swayed grass tufts scattered over open grass (High / Low detail). */
function buildGrass(map: GameMap, detail: "high" | "low", time: { value: number }) {
  const W = map.width;
  const H = map.height;
  const count = detail === "high" ? 26000 : 7000;
  const a = new THREE.PlaneGeometry(0.7, 0.5);
  a.translate(0, 0.25, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const c = a.clone().rotateY(Math.PI / 4);
  const geo = mergeGeometries([a, b, c])!;
  // Point normals up so both faces light like the ground (no dark backsides).
  const n = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  const mat = new THREE.MeshStandardMaterial({
    map: grassBladesTexture(detail === "high" ? 128 : 64),
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = `uniform float uTime;\n${sh.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       vec4 wp0 = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
       float sway = sin(uTime * 1.8 + wp0.x * 0.35 + wp0.z * 0.25) * 0.5 + sin(uTime * 3.1 + wp0.z * 0.9) * 0.2;
       transformed.x += sway * 0.12 * position.y;
       transformed.z += sway * 0.06 * position.y;`,
    );
  };
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const rng = createRng(77);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  let placed = 0;
  for (let tries = 0; tries < count * 4 && placed < count; tries++) {
    const x = rng.range(1, W - 1);
    const y = rng.range(1, H - 1);
    const i = Math.floor(y) * W + Math.floor(x);
    if (map.cells[i] !== 0 || (map.ground[i] !== GROUND.grass && !(map.ground[i] === GROUND.dirt && rng.next() < 0.2))) continue;
    const s = rng.range(0.7, 1.35);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.next() * Math.PI);
    m.compose(new THREE.Vector3(x, 0, y), q, new THREE.Vector3(s, s * rng.range(0.8, 1.3), s));
    mesh.setMatrixAt(placed, m);
    col.setHSL(0.24 + rng.range(-0.03, 0.03), 0.35, rng.range(0.42, 0.62), THREE.SRGBColorSpace);
    mesh.setColorAt(placed, col);
    placed++;
  }
  mesh.count = placed;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

function addBuilding(
  batch: Batcher,
  mats: Record<string, THREE.Material>,
  b: Building,
  cell: (x: number, y: number) => number,
  ground: (x: number, y: number) => number,
  rng: ReturnType<typeof createRng>,
) {
  const H = b.floors * FLOOR_H;
  const wallMat = b.material === "brick" ? SOLID.brick : SOLID.concrete;
  const cx = b.x + b.w / 2;
  const cz = b.y + b.h / 2;

  // Ceiling over the interior (seen from inside).
  batch.add("ceiling", mats.ceiling, new THREE.BoxGeometry(b.w - 1, 0.18, b.h - 1), mat4(cx, FLOOR_H + 0.09, cz), undefined, false);
  if (b.floors > 1) batch.add("trim", mats.trim, new THREE.BoxGeometry(b.w + 0.12, 0.16, b.h + 0.12), mat4(cx, FLOOR_H + 0.1, cz));

  // Roof.
  if (b.material === "concrete") {
    batch.add("flatRoof", mats.flatRoof, new THREE.BoxGeometry(b.w + 0.3, 0.25, b.h + 0.3), mat4(cx, H + 0.12, cz));
    const pw = 0.18;
    const ph = 0.5;
    batch.add("trim", mats.trim, new THREE.BoxGeometry(b.w + 0.3, ph, pw), mat4(cx, H + 0.25 + ph / 2, b.y - 0.15 + pw / 2));
    batch.add("trim", mats.trim, new THREE.BoxGeometry(b.w + 0.3, ph, pw), mat4(cx, H + 0.25 + ph / 2, b.y + b.h + 0.15 - pw / 2));
    batch.add("trim", mats.trim, new THREE.BoxGeometry(pw, ph, b.h + 0.3), mat4(b.x - 0.15 + pw / 2, H + 0.25 + ph / 2, cz));
    batch.add("trim", mats.trim, new THREE.BoxGeometry(pw, ph, b.h + 0.3), mat4(b.x + b.w + 0.15 - pw / 2, H + 0.25 + ph / 2, cz));
    // Rooftop AC unit
    batch.add("trim", mats.trim, new THREE.BoxGeometry(1.2, 0.8, 0.9), mat4(cx + rng.range(-1, 1), H + 0.65, cz + rng.range(-1, 1)));
  } else {
    const alongX = b.w >= b.h;
    const span = (alongX ? b.h : b.w) + 0.7;
    const len = (alongX ? b.w : b.h) + 0.7;
    const pitch = Math.min(2.2, span * 0.3);
    const shape = new THREE.Shape();
    shape.moveTo(-span / 2, 0);
    shape.lineTo(span / 2, 0);
    shape.lineTo(0, pitch);
    shape.closePath();
    const roof = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
    roof.translate(0, 0, -len / 2);
    // Metric UVs on the slopes for the tile texture.
    const uv = roof.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
    batch.add("roof", mats.roof, roof, mat4(cx, H, cz, 1, 1, 1, alongX ? Math.PI / 2 : 0));
    // Gable ends in wall material.
    const gable = new THREE.ShapeGeometry(shape);
    for (const side of [-1, 1]) {
      const off = ((alongX ? b.w : b.h) / 2) * side;
      batch.add(
        wallMat === SOLID.brick ? "brick" : "concrete",
        wallMat === SOLID.brick ? mats.brick : mats.concrete,
        gable,
        mat4(alongX ? cx + off : cx, H, alongX ? cz : cz + off, 0.98, 1, 1, alongX ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? 0 : Math.PI),
      );
    }
    if (rng.next() < 0.5)
      batch.add("brick", mats.brick, metricBox(0.6, 1.8, 0.6, 1, BRICK_TILE_H), mat4(cx + (alongX ? b.w * 0.25 : 0.6), H + pitch * 0.6, cz + (alongX ? 0.5 : b.h * 0.25)));
  }

  // Doors (lintel above the opening) and windows (glass + frame on outer faces).
  const perimeter: [number, number][] = [];
  for (let x = b.x; x < b.x + b.w; x++) perimeter.push([x, b.y], [x, b.y + b.h - 1]);
  for (let y = b.y + 1; y < b.y + b.h - 1; y++) perimeter.push([b.x, y], [b.x + b.w - 1, y]);
  const wallKey = b.material === "brick" ? "brick" : "concrete";
  const wallM = b.material === "brick" ? mats.brick : mats.concrete;
  for (const [x, y] of perimeter) {
    const c = cell(x, y);
    const px = x + 0.5;
    const pz = y + 0.5;
    if (c === 0) {
      const lh = H - 2.3;
      batch.add(wallKey, wallM, metricBox(1, lh, 1, 1, b.material === "brick" ? BRICK_TILE_H : 1.5), mat4(px, 2.3 + lh / 2, pz));
      batch.add("frame", mats.frame, new THREE.BoxGeometry(1.02, 0.08, 1.02), mat4(px, 2.3, pz), undefined, false);
      continue;
    }
    if (c !== wallMat) continue;
    // Outward faces: neighbours outside the building footprint that are open ground.
    const faces: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dx, dy] of faces) {
      const nx = x + dx;
      const ny = y + dy;
      const inside = nx >= b.x && nx < b.x + b.w && ny >= b.y && ny < b.y + b.h;
      if (inside || cell(nx, ny) !== 0 || ground(nx, ny) === GROUND.floor) continue;
      // Concrete plinth along the base of the wall.
      batch.add(
        "plinth",
        mats.plinth,
        new THREE.BoxGeometry(dx ? 0.08 : 1, 0.42, dx ? 1 : 0.08),
        mat4(px + dx * 0.53, 0.21, pz + dy * 0.53),
        undefined,
        false,
      );
      if ((x + y) % 3 !== 0) continue;
      for (let f = 0; f < b.floors; f++) {
        const wy = f * FLOOR_H + 1.55;
        const ox = px + dx * 0.505;
        const oz = pz + dy * 0.505;
        const ry = dx !== 0 ? Math.PI / 2 : 0;
        batch.add("glass", mats.glass, new THREE.BoxGeometry(0.72, 1.0, 0.02), mat4(ox, wy, oz, 1, 1, 1, ry), undefined, false);
        batch.add("frame", mats.frame, new THREE.BoxGeometry(0.86, 0.08, 0.06), mat4(ox, wy + 0.54, oz, 1, 1, 1, ry), undefined, false);
        batch.add("frame", mats.frame, new THREE.BoxGeometry(0.9, 0.07, 0.12), mat4(px + dx * 0.53, wy - 0.54, pz + dy * 0.53, 1, 1, 1, ry), undefined, false);
        batch.add("frame", mats.frame, new THREE.BoxGeometry(0.06, 1.0, 0.06), mat4(ox + (dx ? 0 : 0.4), wy, oz + (dx ? 0.4 : 0), 1, 1, 1, ry), undefined, false);
        batch.add("frame", mats.frame, new THREE.BoxGeometry(0.06, 1.0, 0.06), mat4(ox - (dx ? 0 : 0.4), wy, oz - (dx ? 0.4 : 0), 1, 1, 1, ry), undefined, false);
      }
    }
  }
}
