import * as THREE from "three";
import { FLOOR } from "../world/buildingSpec";
import type { Lot, Service } from "../world/lots";
import type { Look } from "./buildingKit";
import { sideNormal } from "../world/lots";
import type { Building } from "../sim/sim";
import { shared } from "./engine";
import { buildingParts, serviceParts, type Kind, type Part } from "./buildingKit";

/** A box material whose sides get a window grid, with lights that come on at dusk. */
function facadeMaterial(glass: boolean) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: glass ? 0.25 : 0.02 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = shared.uNight;
    sh.uniforms.uGlass = { value: glass ? 1 : 0 };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vZcUV; varying float vZcSide; varying float vZcExt; varying vec3 vZcWorld;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 zcS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vec4 zcW = modelMatrix * instanceMatrix * vec4(position, 1.0);
#else
  vec3 zcS = vec3(1.0);
  vec4 zcW = modelMatrix * vec4(position, 1.0);
#endif
  vec3 zcP = position * zcS;
  vZcSide = abs(normal.y) < 0.5 ? 1.0 : 0.0;
  vZcUV = abs(normal.x) > 0.5 ? vec2(zcP.z, zcP.y + zcS.y * 0.5) : vec2(zcP.x, zcP.y + zcS.y * 0.5);
  vZcExt = abs(normal.x) > 0.5 ? zcS.z : zcS.x;
  vZcWorld = zcW.xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uNight; uniform float uGlass;\nvarying vec2 vZcUV; varying float vZcSide; varying float vZcExt; varying vec3 vZcWorld;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  float zcWin = 0.0;
  float zcLit = 0.0;
  if (vZcSide > 0.5) {
    float winW = uGlass > 0.5 ? 1.6 : 2.7;
    vec2 g = vec2(vZcUV.x / winW, vZcUV.y / ${FLOOR.toFixed(2)});
    vec2 cell = fract(g);
    vec2 id = floor(g);
    float edgeOk = step(0.8, vZcUV.x + vZcExt * 0.5) * step(vZcUV.x, vZcExt * 0.5 - 0.8);
    float wx0 = uGlass > 0.5 ? 0.05 : 0.22;
    float wy0 = uGlass > 0.5 ? 0.1 : 0.3;
    float wy1 = uGlass > 0.5 ? 0.96 : 0.84;
    float inner = step(wx0, cell.x) * step(cell.x, 1.0 - wx0) * step(wy0, cell.y) * step(cell.y, wy1);
    float outer = step(wx0 - 0.07, cell.x) * step(cell.x, 1.07 - wx0) * step(wy0 - 0.08, cell.y) * step(cell.y, wy1 + 0.05);
    zcWin = inner * edgeOk;
    float frame = (outer - inner) * edgeOk * (1.0 - uGlass);
    vec3 glassCol = uGlass > 0.5 ? mix(vec3(0.13, 0.22, 0.32), vec3(0.48, 0.64, 0.78), cell.y) : mix(vec3(0.09, 0.12, 0.17), vec3(0.38, 0.48, 0.6), cell.y * 0.8 + 0.1);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.86, 0.82), frame * 0.85);
    diffuseColor.rgb *= 1.0 - 0.1 * step(cell.y, 0.06) * (1.0 - uGlass);
    diffuseColor.rgb = mix(diffuseColor.rgb, glassCol, zcWin);
    float h = fract(sin(dot(id + floor(vZcWorld.xz * 0.11) * 3.17, vec2(12.9898, 78.233))) * 43758.5453);
    zcLit = zcWin * step(0.42, h) * uNight;
  }`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.16, zcWin);")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.78, 0.48) * zcLit * 1.9;");
  };
  m.customProgramCacheKey = () => (glass ? "zc-glass" : "zc-facade");
  return m;
}

function prismGeometry() {
  // A gable roof: width 1 along x, height 1, depth 1 along z, ridge along z.
  const g = new THREE.BufferGeometry();
  const v = [
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0, 0.5, -0.5,
    0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0, 0.5, 0.5,
    -0.5, -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, -0.5, -0.5, -0.5, 0, 0.5, 0.5, -0.5, -0.5, 0.5,
    0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0, 0.5, 0.5, 0.5, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, -0.5,
  ];
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** A growable InstancedMesh with a free list. */
class Pool {
  mesh: THREE.InstancedMesh;
  private free: number[] = [];
  private used = 0;
  constructor(
    private group: THREE.Group,
    private geo: THREE.BufferGeometry,
    private mat: THREE.Material,
    private cap = 1024,
    private shadow = true,
  ) {
    this.mesh = this.make(cap);
    group.add(this.mesh);
  }
  private make(cap: number) {
    const m = new THREE.InstancedMesh(this.geo, this.mat, cap);
    m.count = 0;
    m.castShadow = this.shadow;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, new THREE.Color());
    return m;
  }
  alloc() {
    if (this.free.length) return this.free.pop()!;
    if (this.used >= this.cap) {
      const next = this.make(this.cap * 2);
      next.instanceMatrix.array.set(this.mesh.instanceMatrix.array);
      if (this.mesh.instanceColor && next.instanceColor) next.instanceColor.array.set(this.mesh.instanceColor.array);
      next.count = this.mesh.count;
      this.group.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = next;
      this.group.add(next);
      this.cap *= 2;
    }
    const i = this.used++;
    this.mesh.count = this.used;
    return i;
  }
  set(i: number, m: THREE.Matrix4, c?: THREE.Color) {
    this.mesh.setMatrixAt(i, m);
    if (c) this.mesh.setColorAt(i, c);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (c && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  release(i: number) {
    this.mesh.setMatrixAt(i, ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.free.push(i);
  }
  setShadow(on: boolean) {
    this.shadow = on;
    this.mesh.castShadow = on;
  }
  dispose() {
    this.mesh.dispose();
  }
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

interface Placed {
  parts: Part[];
  slots: [Kind, number][];
  /** Lot frame. */
  ox: number;
  oy: number;
  oz: number;
  basis: THREE.Matrix4;
  progress: number;
  key: string;
}

/** Every building and civic building in the city, drawn from shared instanced pools. */
export class BuildingView {
  readonly group = new THREE.Group();
  private pools: Record<Kind, Pool>;
  private placed = new Map<number, Placed>();
  private services = new Map<number, Placed>();
  density = 1;
  res: number[] = [0, 0, 0, 0];
  /** The map's building palette (the Riviera DLC maps are whitewashed). */
  look: Look = "base";
  private glowMat: THREE.MeshStandardMaterial;

  constructor(private groundAt: (x: number, z: number) => number) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const std = (o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.02, ...o });
    this.glowMat = new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.4 });
    this.glowMat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = shared.uNight;
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uNight;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance = diffuseColor.rgb * (0.25 + uNight * 1.6);");
    };
    this.pools = {
      facade: new Pool(this.group, box, facadeMaterial(false), 2048),
      glass: new Pool(this.group, box, facadeMaterial(true), 512),
      box: new Pool(this.group, box, std(), 4096),
      metal: new Pool(this.group, box, std({ metalness: 0.45, roughness: 0.5 }), 2048),
      dark: new Pool(this.group, box, std({ roughness: 0.7 }), 1024, false),
      cyl: new Pool(this.group, new THREE.CylinderGeometry(0.5, 0.5, 1, 12), std({ metalness: 0.2, roughness: 0.6 }), 1024),
      cone: new Pool(this.group, new THREE.ConeGeometry(0.5, 1, 12), std(), 512),
      prism: new Pool(this.group, prismGeometry(), std({ roughness: 0.8, flatShading: true, side: THREE.DoubleSide }), 1024),
      crown: new Pool(this.group, new THREE.IcosahedronGeometry(0.5, 1), std({ roughness: 0.9, flatShading: true }), 1024),
      glow: new Pool(this.group, box, this.glowMat, 1024, false),
      solar: new Pool(this.group, box, std({ metalness: 0.6, roughness: 0.25 }), 256),
    };
  }

  private frame(cx: number, cz: number, ang: number, side: number) {
    const tx = Math.cos(ang);
    const tz = Math.sin(ang);
    const [nx, nz] = sideNormal(tx, tz, side);
    // Keep a right-handed basis: flip the frontage axis on the +1 side.
    const X = side === -1 ? new THREE.Vector3(tx, 0, tz) : new THREE.Vector3(-tx, 0, -tz);
    const Z = new THREE.Vector3(nx, 0, nz);
    const basis = new THREE.Matrix4().makeBasis(X, new THREE.Vector3(0, 1, 0), Z);
    return { basis, oy: this.groundAt(cx, cz) };
  }

  private write(p: Placed) {
    const m = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    const k = Math.max(0.02, p.progress);
    const ease = 1 - (1 - k) ** 3;
    for (let i = 0; i < p.parts.length; i++) {
      const part = p.parts[i];
      const [kind, slot] = p.slots[i];
      // While it goes up, everything rises from the ground.
      const y = part.y >= 0 ? part.y * ease : part.y;
      const sy = part.y >= 0 ? part.sy * ease : part.sy;
      e.set(0, part.ry, part.rz ?? 0);
      q.setFromEuler(e);
      local.compose(new THREE.Vector3(part.x, y, part.z), q, new THREE.Vector3(part.sx, Math.max(0.001, sy), part.sz));
      m.copy(p.basis).setPosition(p.ox, p.oy, p.oz).multiply(local);
      col.set(part.c);
      this.pools[kind].set(slot, m, col);
    }
  }

  private place(parts: Part[], cx: number, cz: number, ang: number, side: number, progress: number, key: string, w = 0, d = 0): Placed {
    const f = this.frame(cx, cz, ang, side);
    if (w > 0 && d > 0) {
      // On a slope, stand on the highest corner so the hill never swallows the building,
      // and fill in underneath with a stone plinth down to the lowest.
      const tx = Math.cos(ang);
      const tz = Math.sin(ang);
      const [nx, nz] = sideNormal(tx, tz, side);
      let hi = f.oy;
      let lo = f.oy;
      for (const a of [-0.5, 0.5])
        for (const b of [-0.5, 0.5]) {
          const y = this.groundAt(cx + tx * w * a + nx * d * b, cz + tz * w * a + nz * d * b);
          hi = Math.max(hi, y);
          lo = Math.min(lo, y);
        }
      f.oy = hi;
      const drop = hi - lo;
      if (drop > 0.08) parts = [...parts, { k: "box", x: 0, y: -drop / 2 + 0.04, z: 0, sx: w * 0.94, sy: drop + 0.08, sz: d * 0.94, ry: 0, c: "#8a847a" }];
    }
    const p: Placed = { parts, slots: parts.map((part) => [part.k, this.pools[part.k].alloc()]), ox: cx, oy: f.oy, oz: cz, basis: f.basis, progress, key };
    this.write(p);
    return p;
  }

  private release(p: Placed) {
    for (const [k, i] of p.slots) this.pools[k].release(i);
  }

  /** Sync one lot's building (built, upgraded, going up, or gone). */
  setBuilding(lot: Lot, b: Building | null) {
    const old = this.placed.get(lot.id);
    if (!b) {
      if (old) {
        this.release(old);
        this.placed.delete(lot.id);
      }
      return;
    }
    const key = `${b.tier}:${b.seed}:${lot.zone}:${this.density}`;
    if (old && old.key === key) {
      if (Math.abs(old.progress - b.progress) > 0.001) {
        old.progress = b.progress;
        this.write(old);
      }
      return;
    }
    if (old) this.release(old);
    const { parts } = buildingParts(lot.zone, b.tier, lot.w, lot.d, b.seed, this.density, this.res, this.look);
    this.placed.set(lot.id, this.place(parts, lot.cx, lot.cz, lot.ang, lot.side, b.progress, key, lot.w, lot.d));
  }

  /** Drop buildings whose lots no longer exist. */
  prune(lots: Map<number, Lot>) {
    for (const [id, p] of this.placed)
      if (!lots.has(id)) {
        this.release(p);
        this.placed.delete(id);
      }
  }

  setServices(list: Iterable<Service>) {
    const keep = new Set<number>();
    for (const s of list) {
      keep.add(s.id);
      const key = `${s.kind}:${s.cx.toFixed(1)}:${s.cz.toFixed(1)}:${s.ang.toFixed(3)}`;
      const old = this.services.get(s.id);
      if (old?.key === key) continue;
      if (old) this.release(old);
      this.services.set(s.id, this.place(serviceParts(s.kind, s.w, s.d, s.id * 7919), s.cx, s.cz, s.ang, -1, 1, key));
    }
    for (const [id, p] of this.services)
      if (!keep.has(id)) {
        this.release(p);
        this.services.delete(id);
      }
  }

  clear() {
    for (const p of this.placed.values()) this.release(p);
    for (const p of this.services.values()) this.release(p);
    this.placed.clear();
    this.services.clear();
  }

  setShadows(on: boolean) {
    for (const [k, p] of Object.entries(this.pools)) if (k !== "glow" && k !== "dark") p.setShadow(on);
  }

  /** Re-place everything with a new detail density. */
  setDensity(d: number) {
    this.density = d;
  }

  count() {
    return this.placed.size;
  }

  dispose() {
    for (const p of Object.values(this.pools)) p.dispose();
  }
}
