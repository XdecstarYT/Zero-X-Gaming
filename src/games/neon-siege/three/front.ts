import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRng } from "../../engine/rng";
import { GROUND, SOLID, type GameMap } from "../map";
import {
  barkTexture,
  brickTexture,
  concreteTexture,
  crateTexture,
  grassBladesTexture,
  leafClusterTexture,
  setTextureDetail,
  soilTexture,
  stoneTexture,
  woodFloorTexture,
} from "./textures";
import {
  addBuilding,
  addDeadTree,
  Batcher,
  BRICK_TILE_H,
  coilGeo,
  FLOOR_H,
  lumpy,
  mat4,
  metricBox,
  sackGeo,
  std,
  type TownOptions,
} from "./town";

/**
 * Trenches battlefields in 3D. The ground is built in 32 m chunks so that a
 * dug cell only rebuilds its chunk: open ground is a tinted soil surface,
 * trench cells are real pits (TRENCH_DEPTH deep) with earth walls, timber
 * revetments and duckboards, sandbags on the lip facing the enemy and spoil
 * heaps along freshly dug ones. Props, ruins, wire, craters, water, the sea
 * (Gallipoli) and the countryside beyond are static.
 */

export const TRENCH_DEPTH = 1.35;
const CHUNK = 32;
/** Vertex-colour gain over the theme tone (the soil texture itself averages ~0.3 linear). */
const SOIL_MEAN = 0.85;

export interface FrontScene {
  root: THREE.Group;
  time: { value: number };
  /** Terrain height under a world position (0 on the surface, -TRENCH_DEPTH in a trench). */
  floorAt(x: number, y: number): number;
  /** A cell was dug: rebuild the chunks around it. */
  dig(cell: number): void;
}

/** Simple geometry accumulator (non-indexed quads with normals, UVs and colours). */
class Geo {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  /** Quad a→b→c→d, counter-clockwise seen from the front. */
  quad(p: number[][], n: number[], uv: number[][], c: number[][]) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uv[i][0], uv[i][1]);
      this.col.push(c[i][0], c[i][1], c[i][2]);
    }
  }
  build() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const lin = (hex: string, k = 1) => {
  const c = new THREE.Color(hex);
  return [c.r * k, c.g * k, c.b * k];
};

export function buildFront(map: GameMap, opts: TownOptions): FrontScene {
  const theme = map.front!;
  const W = map.width;
  const H = map.height;
  const root = new THREE.Group();
  const rng = createRng(W * 7919 + H);
  const cell = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? SOLID.perimeter : map.cells[y * W + x]);
  const ground = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? GROUND.dirt : map.ground[y * W + x]);
  const isTrench = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && map.ground[y * W + x] === GROUND.trench;
  const dugSet = new Set(map.dug ?? []);
  // Trenches that came with the map are revetted with timber; dug ones are raw earth.
  const revetted = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (map.ground[i] === GROUND.trench && !dugSet.has(i)) revetted[i] = 1;
  const covered = new Set(map.decor?.covered ?? []);

  // ------------------------------------------------------------ materials
  setTextureDetail(opts.detail);
  const soil = soilTexture();
  for (const t of [soil.map, soil.bump, soil.normal]) t?.repeat.set(1 / 3, 1 / 3);
  const wood = woodFloorTexture();
  for (const t of [wood.map, wood.bump, wood.normal]) t?.repeat.set(1 / 2, 1 / 2);
  const tex = { brick: brickTexture(), concrete: concreteTexture(), crate: crateTexture(), bark: barkTexture(), stone: stoneTexture() };
  const mats = {
    surface: std(soil, { vertexColors: true, roughness: theme.weather === "rain" ? 0.55 : 0.95 }),
    earth: std(soil, { vertexColors: true, roughness: 0.9 }),
    duck: std(wood, { color: "#8a7152", roughness: 0.85 }),
    revet: std(wood, { color: "#6b563d", roughness: 0.9 }),
    floor: std(wood, { color: "#8c7a60", roughness: 0.8 }),
    post: std(null, { color: "#4f3d2a", roughness: 0.9 }),
    sandbag: new THREE.MeshStandardMaterial({ color: "#a38f68", roughness: 0.95, vertexColors: true }),
    wire: new THREE.MeshStandardMaterial({ color: "#3a3632", roughness: 0.5, metalness: 0.7 }),
    fence: std(null, { color: "#5e4a36", roughness: 0.9 }),
    berm: std(soil, { color: new THREE.Color(theme.soil2).multiplyScalar(1.15), roughness: 1 }),
    crater: new THREE.MeshStandardMaterial({ color: "#2f2820", roughness: 0.7, transparent: true, opacity: 0.8, depthWrite: false }),
    water: new THREE.MeshStandardMaterial({ color: "#4b4f45", roughness: 0.06, metalness: 0.4, transparent: true, opacity: 0.92 }),
    sea: new THREE.MeshStandardMaterial({ color: "#2d6a86", roughness: 0.12, metalness: 0.3 }),
    hull: std(null, { color: "#4a4038", roughness: 0.8 }),
    shrub: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    leafCards: new THREE.MeshStandardMaterial({
      map: leafClusterTexture(opts.detail === "high" ? 256 : 128),
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      vertexColors: true,
      roughness: 0.9,
    }),
    rock: std(tex.stone, { vertexColors: true }),
    crate: std(tex.crate, { roughness: 0.85 }),
    bark: std(tex.bark),
    brick: std(tex.brick),
    concrete: std(tex.concrete),
    perimeter: std(tex.concrete, { color: "#b9b6ad" }),
    trim: std(null, { color: "#a9a498", roughness: 0.85 }),
    ceiling: std(null, { color: "#9c978c", roughness: 1 }),
    roof: std(null, { color: "#6d5a48", roughness: 0.8 }),
    flatRoof: std(tex.concrete, { color: "#8d8a84" }),
    glass: std(null, { color: "#3a3f44", roughness: 0.3 }),
    frame: std(null, { color: "#5e4a36", roughness: 0.8 }),
    door: std(null, { color: "#4a3422", roughness: 0.8 }),
    plinth: std(tex.concrete, { color: "#77736c" }),
    hill: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
  };

  // Surface colour per vertex: average of the surrounding cells' ground tones, with a little noise.
  const tone = (g: number) => {
    switch (g) {
      case GROUND.grass:
        return theme.soil2;
      case GROUND.road:
        return "#77706a";
      case GROUND.duck:
        return theme.earth;
      default:
        return theme.soil;
    }
  };
  const toneCache = new Map<string, number[]>();
  const toneLin = (hex: string) => {
    let c = toneCache.get(hex);
    if (!c) toneCache.set(hex, (c = lin(hex, 1 / SOIL_MEAN)));
    return c;
  };
  const noise = (x: number, y: number) => {
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return h - Math.floor(h);
  };
  const vW = W + 1;
  const vcol = new Float32Array(vW * (H + 1) * 3);
  const recolour = (x0: number, y0: number, x1: number, y1: number) => {
    for (let vy = Math.max(0, y0); vy <= Math.min(H, y1); vy++)
      for (let vx = Math.max(0, x0); vx <= Math.min(W, x1); vx++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (const [dx, dy] of [
          [-1, -1],
          [0, -1],
          [-1, 0],
          [0, 0],
        ]) {
          const cx = vx + dx;
          const cy = vy + dy;
          if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
          const c = toneLin(tone(map.ground[cy * W + cx]));
          r += c[0];
          g += c[1];
          b += c[2];
          n++;
        }
        const k = (0.9 + noise(vx, vy) * 0.2) / Math.max(1, n);
        const i = (vy * vW + vx) * 3;
        vcol[i] = r * k;
        vcol[i + 1] = g * k;
        vcol[i + 2] = b * k;
      }
  };
  recolour(0, 0, W, H);
  const vc = (x: number, y: number) => {
    const i = (y * vW + x) * 3;
    return [vcol[i], vcol[i + 1], vcol[i + 2]];
  };
  const earthC = toneLin(theme.earth);
  const earthDark = earthC.map((v) => v * 0.7);

  // ---------------------------------------------------------------- chunks
  const D = TRENCH_DEPTH;
  const cw = Math.ceil(W / CHUNK);
  const ch = Math.ceil(H / CHUNK);
  const chunks: (THREE.Group | null)[] = Array.from({ length: cw * ch }, () => null);
  const enemySign = (x: number) => (x < W / 2 ? 1 : -1);

  const buildChunk = (ci: number) => {
    const old = chunks[ci];
    if (old) {
      old.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      old.removeFromParent();
    }
    const gx0 = (ci % cw) * CHUNK;
    const gy0 = Math.floor(ci / cw) * CHUNK;
    const surface = new Geo();
    const earth = new Geo();
    const duck = new Geo();
    const revet = new Geo();
    const floor = new Geo();
    const batch = new Batcher();
    const white = [1, 1, 1];
    for (let y = gy0; y < Math.min(H, gy0 + CHUNK); y++)
      for (let x = gx0; x < Math.min(W, gx0 + CHUNK); x++) {
        const i = y * W + x;
        const g = map.ground[i];
        if (g !== GROUND.trench) {
          const target = g === GROUND.floor ? floor : surface;
          const cols = g === GROUND.floor ? [white, white, white, white] : [vc(x, y), vc(x, y + 1), vc(x + 1, y + 1), vc(x + 1, y)];
          target.quad(
            [
              [x, 0, y],
              [x, 0, y + 1],
              [x + 1, 0, y + 1],
              [x + 1, 0, y],
            ],
            [0, 1, 0],
            [
              [x, -y],
              [x, -y - 1],
              [x + 1, -y - 1],
              [x + 1, -y],
            ],
            cols,
          );
          if (g === GROUND.duck) addDuckboard(batch, x, y, 0.03, horizontalRun(x, y, GROUND.duck));
          continue;
        }
        // Trench: floor + walls where the neighbour is solid ground.
        const rev = revetted[i] === 1;
        (rev ? duck : earth).quad(
          [
            [x, -D, y],
            [x, -D, y + 1],
            [x + 1, -D, y + 1],
            [x + 1, -D, y],
          ],
          [0, 1, 0],
          [
            [x, -y],
            [x, -y - 1],
            [x + 1, -y - 1],
            [x + 1, -y],
          ],
          [earthDark, earthDark, earthDark, earthDark],
        );
        const sides: [number, number, number, number, number, number, number, number][] = [
          // dx, dy, x0, z0, x1, z1, nx, nz
          [1, 0, x + 1, y, x + 1, y + 1, -1, 0],
          [-1, 0, x, y + 1, x, y, 1, 0],
          [0, 1, x + 1, y + 1, x, y + 1, 0, -1],
          [0, -1, x, y, x + 1, y, 0, 1],
        ];
        for (const [dx, dy, x0, z0, x1, z1, nx, nz] of sides) {
          if (isTrench(x + dx, y + dy)) continue;
          const u0 = x0 + z0;
          const u1 = x1 + z1;
          earth.quad(
            [
              [x0, -D, z0],
              [x1, -D, z1],
              [x1, 0, z1],
              [x0, 0, z0],
            ],
            [nx, 0, nz],
            [
              [u0, -D],
              [u1, -D],
              [u1, 0],
              [u0, 0],
            ],
            [earthDark, earthDark, earthC, earthC],
          );
          if (rev) {
            const o = 0.03;
            revet.quad(
              [
                [x0 + nx * o, -D, z0 + nz * o],
                [x1 + nx * o, -D, z1 + nz * o],
                [x1 + nx * o, -0.12, z1 + nz * o],
                [x0 + nx * o, -0.12, z0 + nz * o],
              ],
              [nx, 0, nz],
              [
                [u0 * 0.5, 0],
                [u1 * 0.5, 0],
                [u1 * 0.5, 0.6],
                [u0 * 0.5, 0.6],
              ],
              [white, white, white, white],
            );
            // A stake holding the revetment.
            if ((x + y) % 2 === 0) batch.add("post", mats.post, postGeo, mat4(x0 + nx * 0.08, -D / 2, z0 + nz * 0.08));
          }
          // The lip: sandbags facing the enemy on revetted trenches, spoil elsewhere.
          const lipX = x + dx + 0.5 - dx * 0.3;
          const lipZ = y + dy + 0.5 - dy * 0.3;
          if (cell(x + dx, y + dy) !== 0) continue;
          const h = ((x * 73856093) ^ (y * 19349663) ^ (dx * 7 + dy * 13)) >>> 0;
          if (rev && dx === enemySign(x)) {
            const r2 = createRng(h);
            for (let row = 0; row < 2; row++)
              for (let k = 0; k < 2; k++) {
                const off = (k - 0.5) * 0.5 + (row ? 0.25 : 0) - 0.12;
                const tint = 0.85 + r2.next() * 0.25;
                batch.add(
                  "sandbag",
                  mats.sandbag,
                  sackGeo,
                  mat4(lipX, 0.1 + row * 0.2, lipZ + off, 1, 1, 1, Math.PI / 2 + r2.range(-0.12, 0.12)),
                  new THREE.Color().setRGB(tint, tint * 0.97, tint * 0.9, THREE.SRGBColorSpace),
                );
              }
          } else {
            const g2 = spoil[h % spoil.length];
            batch.add("spoil", mats.berm, g2, mat4(lipX, 0, lipZ, dx ? 0.32 : 0.6, 0.16 + (h % 5) * 0.025, dx ? 0.6 : 0.32, (h % 7) * 0.2), undefined, false);
          }
        }
        if (covered.has(i)) batch.add("revetRoof", mats.revet, roofGeo, mat4(x + 0.5, -0.06, y + 0.5, 1, 1, 1, ((x + y) % 2) * 0.05));
        if (rev && (x * 3 + y) % 11 === 0) batch.add("post", mats.post, stepGeo, mat4(x + 0.5 + enemySign(x) * 0.3, -D + 0.2, y + 0.5));
      }
    const group = new THREE.Group();
    const add = (geo: Geo, mat: THREE.Material, cast: boolean) => {
      const g = geo.build();
      if (!g) return;
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = opts.shadows;
      m.castShadow = opts.shadows && cast;
      group.add(m);
    };
    add(surface, mats.surface, true);
    add(earth, mats.earth, true);
    add(duck, mats.duck, false);
    add(revet, mats.revet, false);
    add(floor, mats.floor, false);
    batch.flush(group, opts.shadows);
    chunks[ci] = group;
    root.add(group);
  };

  function horizontalRun(x: number, y: number, g: number) {
    return ground(x - 1, y) === g || ground(x + 1, y) === g;
  }
  function addDuckboard(batch: Batcher, x: number, y: number, yy: number, alongX: boolean) {
    batch.add("duckboard", mats.duck, duckGeo, mat4(x + 0.5, yy, y + 0.5, 1, 1, 1, alongX ? Math.PI / 2 : 0), undefined, false);
  }

  for (let i = 0; i < chunks.length; i++) buildChunk(i);

  // ------------------------------------------------------------ static set
  const batch = new Batcher();
  const wallBox = (h: number, tileH: number) => metricBox(1, h, 1, 1, tileH);
  const brickWalls = new Map<number, THREE.BufferGeometry>();
  const owner = new Int16Array(W * H).fill(-1);
  map.buildings.forEach((b, i) => {
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (x >= 0 && y >= 0 && x < W && y < H) owner[y * W + x] = i;
  });
  const seaWest = theme.sea === "west";
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = cell(x, y);
      if (!c) continue;
      const px = x + 0.5;
      const pz = y + 0.5;
      const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      switch (c) {
        case SOLID.perimeter: {
          if (seaWest && x === 0) break;
          const g = lumpy(new THREE.IcosahedronGeometry(1, 1), hash, 0.25);
          batch.add("berm", mats.berm, g, mat4(px, 0.3, pz, 1.2, 1.4 + (hash % 5) * 0.12, 1.2, hash % 7));
          break;
        }
        case SOLID.brick: {
          const o = owner[y * W + x];
          const full = o >= 0 ? map.buildings[o].floors * FLOOR_H : FLOOR_H;
          // Shelled walls: jagged heights.
          const h = Math.max(0.9, Math.round(full * (0.35 + ((hash >> 3) % 7) / 10) * 4) / 4);
          let g = brickWalls.get(h);
          if (!g) brickWalls.set(h, (g = wallBox(h, BRICK_TILE_H)));
          batch.add("brick", mats.brick, g, mat4(px, h / 2, pz));
          break;
        }
        case SOLID.concrete: {
          const o = owner[y * W + x];
          const h = o >= 0 ? map.buildings[o].floors * FLOOR_H * 0.8 : FLOOR_H * 0.8;
          batch.add("concrete", mats.concrete, wallBox(h, 1.5), mat4(px, h / 2, pz));
          break;
        }
        case SOLID.sandbag: {
          const horiz = cell(x - 1, y) === SOLID.sandbag || cell(x + 1, y) === SOLID.sandbag;
          const r2 = createRng(hash);
          for (let row = 0; row < 5; row++)
            for (let i = 0; i < 2; i++) {
              const off = (i - 0.5) * 0.5 + (row % 2 ? 0.25 : 0) - 0.12;
              const tint = 0.85 + r2.next() * 0.25;
              batch.add(
                "sandbag",
                mats.sandbag,
                sackGeo,
                mat4(px + (horiz ? off : r2.range(-0.05, 0.05)), 0.12 + row * 0.22, pz + (horiz ? r2.range(-0.05, 0.05) : off), 1, 1, 1, (horiz ? 0 : Math.PI / 2) + r2.range(-0.12, 0.12)),
                new THREE.Color().setRGB(tint, tint * 0.97, tint * 0.9, THREE.SRGBColorSpace),
              );
            }
          break;
        }
        case SOLID.wire: {
          const horiz = cell(x - 1, y) === SOLID.wire || cell(x + 1, y) === SOLID.wire;
          for (const k of [-0.35, 0.35]) {
            const ox = horiz ? k : 0;
            const oz = horiz ? 0 : k;
            batch.add("stake", mats.fence, wallBox(1.2, 1), mat4(px + ox, 0.5, pz + oz, 0.06, 1, 0.06, 0, 0, 0.45));
            batch.add("stake", mats.fence, wallBox(1.2, 1), mat4(px + ox, 0.5, pz + oz, 0.06, 1, 0.06, 0, 0, -0.45));
          }
          for (let k = 0; k < 3; k++)
            batch.add(
              "wire",
              mats.wire,
              coilGeo,
              mat4(px + (horiz ? (k - 1) * 0.33 : 0), 0.42, pz + (horiz ? 0 : (k - 1) * 0.33), 1, 1, 1, horiz ? Math.PI / 2 : 0, 0.15 * k),
              undefined,
              false,
            );
          break;
        }
        case SOLID.water:
          batch.add("water", mats.water, waterQuad, mat4(px, 0.035, pz), undefined, false);
          break;
        case SOLID.shrub: {
          const r2 = createRng(hash);
          const hue = 0.17 + r2.range(-0.03, 0.03);
          for (let k = 0; k < 3; k++) {
            const s = r2.range(0.35, 0.6);
            batch.add(
              "shrub",
              mats.shrub,
              lumpy(new THREE.IcosahedronGeometry(1, 1), hash + k, 0.3),
              mat4(px + r2.range(-0.3, 0.3), s * 0.55, pz + r2.range(-0.3, 0.3), s, s * 0.75, s, r2.next() * 6),
              new THREE.Color().setHSL(hue, 0.28, 0.22 + r2.range(0, 0.08), THREE.SRGBColorSpace),
            );
          }
          for (let k = 0; k < 4; k++)
            batch.add(
              "leafCards",
              mats.leafCards,
              cardGeo,
              mat4(px + r2.range(-0.35, 0.35), r2.range(0.3, 0.6), pz + r2.range(-0.35, 0.35), 0.9, 0.7, 1, r2.next() * Math.PI, r2.range(-0.4, 0.4)),
              new THREE.Color().setHSL(hue, 0.25, 0.55 + r2.range(-0.08, 0.06), THREE.SRGBColorSpace),
            );
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
          addDeadTree(batch, mats, px, pz, hash);
          break;
      }
    }
  for (const b of map.buildings) addBuilding(batch, mats, b, cell, ground, rng, true);

  // Shell craters (and the flooded ones).
  (map.decor?.craters ?? []).forEach((c, i) => {
    batch.add("crater", mats.crater, new THREE.CircleGeometry(c.r, 18).rotateX(-Math.PI / 2), mat4(c.x, 0.015 + (i % 50) * 0.0002, c.y), undefined, false);
    batch.add("craterRim", mats.berm, lumpy(new THREE.TorusGeometry(c.r, c.r * 0.22, 5, 16).rotateX(Math.PI / 2), i, 0.2), mat4(c.x, 0.02, c.y, 1, 0.35, 1), undefined, false);
    if (c.water) batch.add("water", mats.water, new THREE.CircleGeometry(c.r * 0.78, 18).rotateX(-Math.PI / 2), mat4(c.x, 0.04, c.y), undefined, false);
  });

  // ------------------------------------------------------------ beyond the map
  const soilC = new THREE.Color(theme.soil);
  const outer = (x0: number, z0: number, x1: number, z1: number) => {
    const g = new Geo();
    const c = [soilC.r / SOIL_MEAN, soilC.g / SOIL_MEAN, soilC.b / SOIL_MEAN];
    g.quad(
      [
        [x0, -0.01, z0],
        [x0, -0.01, z1],
        [x1, -0.01, z1],
        [x1, -0.01, z0],
      ],
      [0, 1, 0],
      [
        [x0, -z0],
        [x0, -z1],
        [x1, -z1],
        [x1, -z0],
      ],
      [c, c, c, c],
    );
    const m = new THREE.Mesh(g.build()!, mats.surface);
    m.receiveShadow = opts.shadows;
    root.add(m);
  };
  const R = 420;
  const westEdge = seaWest ? -28 : -R;
  outer(westEdge, -R, W + R, 0);
  outer(westEdge, H, W + R, H + R);
  outer(westEdge, 0, 0, H);
  outer(W, 0, W + R, H);
  if (seaWest) {
    // Beach sloping into the Aegean, with landing boats offshore.
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(R, H + 2 * R).rotateX(-Math.PI / 2), mats.sea);
    sea.position.set(westEdge - R / 2, -0.25, H / 2);
    root.add(sea);
    for (let i = 0; i < 9; i++) {
      const bx = westEdge - rng.range(18, 140);
      const bz = rng.range(-40, H + 40);
      const hull = new THREE.BoxGeometry(6, 1.1, 2).translate(0, 0.2, 0);
      batch.add("hull", mats.hull, hull, mat4(bx, -0.1, bz, 1, 1, 1, rng.range(-0.5, 0.5)));
      if (i % 3 === 0) batch.add("hull", mats.hull, new THREE.BoxGeometry(18, 4, 4), mat4(bx - 80, 1.5, bz, 1, 1, 1, rng.range(-0.2, 0.2)));
    }
  }
  for (let i = 0; i < (opts.detail === "high" ? 160 : 80); i++) {
    const a = rng.next() * Math.PI * 2;
    const r = rng.range(Math.max(W, H) * 0.6, Math.max(W, H) * 1.2);
    const x = W / 2 + Math.cos(a) * r;
    const z = H / 2 + Math.sin(a) * r;
    if (x > -3 && x < W + 3 && z > -3 && z < H + 3) continue;
    if (seaWest && x < westEdge) continue;
    addDeadTree(batch, mats, x, z, (rng.next() * 1e9) >>> 0);
  }
  const hillHue = new THREE.Color(theme.soil).getHSL({ h: 0, s: 0, l: 0 });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const x = W / 2 + Math.cos(a) * rng.range(200, 300);
    if (seaWest && x < -60) continue;
    const r = rng.range(200, 300);
    const s = rng.range(40, 90);
    const g = lumpy(new THREE.IcosahedronGeometry(1, 2), i * 7 + 3, 0.18);
    const col = new THREE.Color().setHSL(hillHue.h + rng.range(-0.02, 0.02), hillHue.s * 0.6, Math.min(0.85, hillHue.l * 0.55 + rng.range(0, 0.06)), THREE.SRGBColorSpace);
    batch.add("hill", mats.hill, g, mat4(W / 2 + Math.cos(a) * r, -s * 0.35, H / 2 + Math.sin(a) * r, s * 1.6, s * rng.range(0.45, 0.75), s * 1.3), col, false);
  }

  batch.flush(root, opts.shadows);
  const time = { value: 0 };
  const tufts = theme.grass > 0 ? buildTufts(map, opts.detail, time, theme.grass, theme.grassColor) : null;
  if (tufts) root.add(tufts.mesh);

  return {
    root,
    time,
    floorAt(x, y) {
      return isTrench(Math.floor(x), Math.floor(y)) ? -D : 0;
    },
    dig(i) {
      const x = i % W;
      const y = Math.floor(i / W);
      recolour(x - 1, y - 1, x + 2, y + 2);
      const hit = new Set<number>();
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        hit.add(Math.floor(ny / CHUNK) * cw + Math.floor(nx / CHUNK));
      }
      for (const ci of hit) buildChunk(ci);
      tufts?.clear(i);
    },
  };
}

const cardGeo = new THREE.PlaneGeometry(1, 1);
const postGeo = new THREE.BoxGeometry(0.1, TRENCH_DEPTH + 0.1, 0.1);
/** A fire step: a low plank bench along the parapet side. */
const stepGeo = new THREE.BoxGeometry(0.35, 0.4, 0.9);
const roofGeo = (() => {
  const g: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) g.push(new THREE.BoxGeometry(0.16, 0.08, 1.2).translate(-0.4 + k * 0.2, 0, 0));
  return mergeGeometries(g)!;
})();
const duckGeo = (() => {
  const g: THREE.BufferGeometry[] = [new THREE.BoxGeometry(0.06, 0.05, 1).translate(-0.22, 0, 0), new THREE.BoxGeometry(0.06, 0.05, 1).translate(0.22, 0, 0)];
  for (let k = 0; k < 6; k++) g.push(new THREE.BoxGeometry(0.56, 0.03, 0.09).translate(0, 0.035, -0.42 + k * 0.17));
  return mergeGeometries(g)!;
})();
const waterQuad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const spoil = [0, 1, 2, 3].map((k) => lumpy(new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 40 + k, 0.25));

/** Sparse dry grass tufts over open ground, swaying in the wind. */
function buildTufts(map: GameMap, detail: "high" | "low", time: { value: number }, density: number, color: string) {
  const W = map.width;
  const H = map.height;
  const count = Math.round(W * H * density * (detail === "high" ? 0.3 : 0.12));
  const a = new THREE.PlaneGeometry(0.6, 0.45);
  a.translate(0, 0.22, 0);
  const geo = mergeGeometries([a, a.clone().rotateY(Math.PI / 2), a.clone().rotateY(Math.PI / 4)])!;
  const n = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  const mat = new THREE.MeshStandardMaterial({ map: grassBladesTexture(detail === "high" ? 128 : 64), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
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
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  const rng = createRng(91);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const base = new THREE.Color(color);
  const col = new THREE.Color();
  const cellOf = new Int32Array(Math.max(1, count));
  let placed = 0;
  for (let tries = 0; tries < count * 3 && placed < count; tries++) {
    const x = rng.range(1, W - 1);
    const y = rng.range(1, H - 1);
    const i = Math.floor(y) * W + Math.floor(x);
    const g = map.ground[i];
    if (map.cells[i] !== 0 || g === GROUND.trench || g === GROUND.floor || g === GROUND.duck) continue;
    const s = rng.range(0.6, 1.3);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.next() * Math.PI);
    m.compose(new THREE.Vector3(x, 0, y), q, new THREE.Vector3(s, s * rng.range(0.8, 1.3), s));
    mesh.setMatrixAt(placed, m);
    col.copy(base).offsetHSL(rng.range(-0.02, 0.02), 0, rng.range(-0.08, 0.08));
    mesh.setColorAt(placed, col);
    cellOf[placed] = i;
    placed++;
  }
  mesh.count = placed;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    mesh,
    /** Hide the tufts on a cell that was dug out. */
    clear(cell: number) {
      let hit = false;
      for (let k = 0; k < placed; k++)
        if (cellOf[k] === cell) {
          mesh.setMatrixAt(k, zero);
          hit = true;
        }
      if (hit) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
