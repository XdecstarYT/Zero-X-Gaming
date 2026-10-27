import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { treeGeometry, treeMaterial } from "@/games/xcity/render/kit";
import { SITE } from "../data";
import { box as pieceBox, type State } from "../model";
import { groundMaterial, localMaterial, type Mats } from "./materials";

/**
 * Everything round the build: the lawn (worn to soil wherever you build), the street with its
 * kerbs, footpath and nature strip, a timber paling fence, the houses next door, trees, grass
 * that sways, and the site itself: pallets of bricks, a sand pile, a cement mixer, a wheelbarrow,
 * a skip, a portaloo and the ute.
 */

const STREET_Z = SITE + 5.5;

export interface SiteView {
  group: THREE.Group;
  update(s: State): void;
  frame(t: number): void;
}

function bx(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, cast = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast;
  o.receiveShadow = true;
  return o;
}

/** A merged mesh from many boxes, all one material. */
function boxes(list: THREE.BufferGeometry[], m: THREE.Material, cast = true) {
  return mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))!, m, cast);
}

/** The worn-ground mask: soil wherever something's built on the ground (and round it). */
class Wear {
  readonly c = document.createElement("canvas");
  readonly tex: THREE.CanvasTexture;
  readonly size = 48;
  private g: CanvasRenderingContext2D;
  constructor() {
    this.c.width = this.c.height = 384;
    this.g = this.c.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.NoColorSpace;
    this.paint(null);
  }
  paint(s: State | null) {
    const g = this.g;
    const N = this.c.width;
    const k = N / this.size;
    g.fillStyle = "#000";
    g.fillRect(0, 0, N, N);
    // A worn path from the street to the stacks of materials.
    g.globalAlpha = 0.55;
    g.fillStyle = "#fff";
    g.filter = "blur(6px)";
    const P = (x: number, z: number) => [(x + this.size / 2) * k, (z + this.size / 2) * k] as const;
    const [px, pz] = P(9.6, 9.5);
    g.fillRect(px - 1.6 * k, pz - 2 * k, 3.2 * k, 9 * k);
    if (s) {
      g.globalAlpha = 0.9;
      for (const p of s.pieces) {
        const b = pieceBox(p);
        if (b.y0 > 0.4) continue;
        const [x0, z0] = P(b.x0 - 0.7, b.z0 - 0.7);
        const [x1, z1] = P(b.x1 + 0.7, b.z1 + 0.7);
        g.fillRect(x0, z0, x1 - x0, z1 - z0);
      }
    }
    g.filter = "none";
    g.globalAlpha = 1;
    this.tex.needsUpdate = true;
  }
}

/** Grass: clumps of blades, swaying a little, cleared from wherever something stands. */
class Grass {
  readonly mesh: THREE.InstancedMesh;
  private spots: { x: number; z: number; s: number; a: number }[] = [];
  private mat: THREE.MeshStandardMaterial;
  private uTime = { value: 0 };
  constructor(count: number) {
    const blades: THREE.BufferGeometry[] = [];
    const R = rng(7);
    for (let i = 0; i < 7; i++) {
      const h = 0.07 + R() * 0.08;
      const w = 0.012 + R() * 0.008;
      const a = R() * Math.PI;
      const lean = (R() - 0.5) * 0.06;
      const g = new THREE.BufferGeometry();
      const ox = (R() - 0.5) * 0.08;
      const oz = (R() - 0.5) * 0.08;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const v = [-w * c + ox, 0, -w * s + oz, w * c + ox, 0, w * s + oz, ox + lean, h, oz + lean * 0.5];
      g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
      const shade = 0.75 + R() * 0.5;
      g.setAttribute("color", new THREE.Float32BufferAttribute([0.08 * shade, 0.14 * shade, 0.035 * shade, 0.08 * shade, 0.14 * shade, 0.035 * shade, 0.28 * shade, 0.4 * shade, 0.12 * shade], 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
      blades.push(g);
    }
    const geo = mergeGeometries(blades)!;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    const ut = this.uTime;
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = ut;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 gp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 1.7 + gp.x * 0.6 + gp.z * 0.4) * 0.5 + sin(uTime * 2.9 + gp.x * 1.3) * 0.25;
        transformed.x += sway * 0.025 * position.y / 0.15;
        transformed.z += sway * 0.012 * position.y / 0.15;`,
      );
    };
    this.mesh = new THREE.InstancedMesh(geo, this.mat, count);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    const R2 = rng(11);
    for (let i = 0; i < count; i++) {
      // Most of it on the plot, the rest out to the fences and along the nature strip.
      let x: number;
      let z: number;
      if (i % 9 === 8) {
        x = (R2() - 0.5) * 40;
        z = SITE + 1.6 + R2() * 2.6;
      } else {
        x = (R2() - 0.5) * (SITE * 2 - 0.4);
        z = (R2() - 0.5) * (SITE * 2 - 0.4);
      }
      this.spots.push({ x, z, s: 0.7 + R2() * 0.7, a: R2() * 6.28 });
    }
    this.update(null);
  }
  update(s: State | null) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const blocked: { x0: number; z0: number; x1: number; z1: number }[] = [];
    if (s) for (const p of s.pieces) {
      const b = pieceBox(p);
      if (b.y0 < 0.3) blocked.push({ x0: b.x0 - 0.25, z0: b.z0 - 0.25, x1: b.x1 + 0.25, z1: b.z1 + 0.25 });
    }
    // Where the site gear stands, and the worn path.
    blocked.push({ x0: 7.4, z0: 4.6, x1: 13.6, z1: 13.6 }, { x0: 8.0, z0: 13.6, x1: 11.2, z1: 16 });
    this.spots.forEach((p, i) => {
      const hide = blocked.some((b) => p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1);
      q.setFromAxisAngle(up, p.a);
      sc.setScalar(hide ? 0 : p.s);
      m.compose(v.set(p.x, 0, p.z), q, sc);
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  frame(t: number) {
    this.uTime.value = t;
  }
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** The timber paling fence round three sides. */
function fence(M: Mats) {
  const pal: THREE.BufferGeometry[] = [];
  const frame: THREE.BufferGeometry[] = [];
  const R = rng(3);
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const ux = (x1 - x0) / L;
    const uz = (z1 - z0) / L;
    const nP = Math.round(L / 2.4);
    for (let i = 0; i <= nP; i++) {
      const t = (i / nP) * L;
      frame.push(bx(0.1, 2.0, 0.1, x0 + ux * t, -0.1, z0 + uz * t));
    }
    for (const y of [0.3, 1.5]) {
      const g = new THREE.BoxGeometry(L, 0.09, 0.045).translate(0, y, 0);
      g.rotateY(-Math.atan2(uz, ux));
      g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      frame.push(g);
    }
    const n = Math.floor(L / 0.16);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) * (L / n);
      const h = 1.8 + (R() - 0.5) * 0.02;
      const g = new THREE.BoxGeometry(0.145, h, 0.016).translate(0, h / 2 + 0.02, 0);
      // The top of each paling cut to a point.
      const p = g.getAttribute("position");
      for (let k = 0; k < p.count; k++) if (p.getY(k) > h - 0.01 + 0.02) p.setY(k, p.getY(k) - (Math.abs(p.getX(k)) > 0.05 ? 0.03 : 0));
      g.rotateY(-Math.atan2(uz, ux));
      g.translate(x0 + ux * t + uz * 0.04, 0, z0 + uz * t - ux * 0.04);
      pal.push(g);
    }
  };
  run(-SITE, -SITE, SITE, -SITE);
  run(-SITE, -SITE, -SITE, SITE);
  run(SITE, -SITE, SITE, SITE);
  const weathered = localMaterial(M.pbr.timber, { scale: 1.2, normalScale: 0.9, fixed: true, color: "#9a8d7a", env: 0.4 });
  const g = new THREE.Group();
  g.add(boxes(pal, weathered), boxes(frame, weathered));
  return g;
}

/** A house next door: brick walls, a tiled roof, windows and a door. */
function neighbour(M: Mats, x: number, z: number, w: number, d: number, rot: number, cream: boolean) {
  const g = new THREE.Group();
  const wallH = 2.7;
  const walls = localMaterial(cream ? M.pbr.brickworkCream : M.pbr.brickwork, { scale: 2.25, normalScale: 0.8, fixed: true, env: 0.5 });
  // Map the brickwork texture in metres: one tile 2.25 m wide, 1.2 m high.
  const wallMesh = mesh(new THREE.BoxGeometry(w, wallH, d).translate(0, wallH / 2, 0), walls);
  wallMesh.material = localMaterial(cream ? M.pbr.brickworkCream : M.pbr.brickwork, {
    scale: 1,
    normalScale: 0.8,
    fixed: true,
    env: 0.5,
    extra: (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace("vec2 gUV = gwUV();", "vec2 gUV = gwUV() / vec2(2.25, 1.2);");
    },
  });
  g.add(wallMesh);
  // A hipped-ish gable roof.
  const rise = d * 0.32;
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - 0.45, 0);
  shape.lineTo(d / 2 + 0.45, 0);
  shape.lineTo(0, rise + 0.3);
  shape.closePath();
  const roofG = new THREE.ExtrudeGeometry(shape, { depth: w + 0.6, bevelEnabled: false });
  roofG.translate(0, 0, -(w + 0.6) / 2);
  roofG.rotateY(Math.PI / 2);
  roofG.translate(0, wallH - 0.15, 0);
  const roofMat = localMaterial(M.pbr.tile, { scale: 0.3, normalScale: 1, fixed: true, color: cream ? "#58595c" : "#9a5136", roughness: 0.9 });
  g.add(mesh(roofG, roofMat));
  // Windows and a door, inset.
  const glass = new THREE.MeshStandardMaterial({ color: "#2a3238", roughness: 0.08, metalness: 0.4, envMapIntensity: 1.6 });
  const trim = new THREE.MeshStandardMaterial({ color: "#efeee9", roughness: 0.5 });
  const wins: THREE.BufferGeometry[] = [];
  const trims: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1])
    for (const side of [-1, 1]) {
      const wx = sx * w * 0.25;
      wins.push(bx(1.2, 1.2, 0.04, wx, 0.95, side * (d / 2 + 0.005)));
      trims.push(bx(1.32, 0.06, 0.1, wx, 0.9, side * (d / 2 + 0.02)));
    }
  trims.push(bx(0.95, 2.1, 0.06, 0, 0, d / 2 + 0.01));
  g.add(boxes(wins, glass, false), boxes(trims, trim));
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  return g;
}

/** A pallet of bricks: 400-odd on a timber pallet. */
function brickPallet(M: Mats, color: string) {
  const g = new THREE.Group();
  const slats: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) slats.push(bx(1.1, 0.025, 0.1, 0, 0.12, -0.5 + i * 0.167));
  for (const z of [-0.5, 0, 0.5]) slats.push(bx(1.1, 0.1, 0.1, 0, 0.02, z));
  g.add(boxes(slats, localMaterial(M.pbr.timber, { scale: 1, fixed: true, color: "#b89a70" })));
  const bricks: THREE.BufferGeometry[] = [];
  const R = rng(color.length * 13);
  for (let layer = 0; layer < 9; layer++)
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 10; j++) {
        const along = layer % 2 === 0;
        const x = along ? -0.39 + i * 0.226 : -0.48 + j * 0.107;
        const z = along ? -0.48 + j * 0.107 : -0.39 + i * 0.226;
        bricks.push(along ? bx(0.215, 0.065, 0.1025, x + (R() - 0.5) * 0.004, 0.145 + layer * 0.067, z) : bx(0.1025, 0.065, 0.215, x, 0.145 + layer * 0.067, z));
      }
  const bm = localMaterial(M.pbr.brick, { scale: 0.55, normalScale: 1.1, fixed: true, color });
  g.add(boxes(bricks, bm));
  // The strapping.
  const strap = new THREE.MeshStandardMaterial({ color: "#2c3440", roughness: 0.5 });
  g.add(boxes([bx(0.02, 0.62, 1.0, -0.2, 0.14, 0), bx(0.02, 0.62, 1.0, 0.2, 0.14, 0)], strap, false));
  return g;
}

/** A cement mixer: an orange drum on its stand. */
function mixer() {
  const g = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: "#d9661f", roughness: 0.45, metalness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: "#3d4044", roughness: 0.5, metalness: 0.6 });
  const prof: THREE.Vector2[] = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.28, 0.02), new THREE.Vector2(0.34, 0.25), new THREE.Vector2(0.3, 0.5), new THREE.Vector2(0.2, 0.68), new THREE.Vector2(0.2, 0.72)];
  const drum = mesh(new THREE.LatheGeometry(prof, 28), orange);
  drum.geometry.computeVertexNormals();
  (drum.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  drum.rotation.z = -0.75;
  drum.position.set(0, 0.75, 0);
  g.add(drum);
  g.add(boxes([bx(0.06, 0.8, 0.06, -0.3, 0, -0.25), bx(0.06, 0.8, 0.06, -0.3, 0, 0.25), bx(0.06, 0.06, 0.6, -0.3, 0.7, 0), bx(0.9, 0.05, 0.05, 0, 0.18, 0)], steel));
  for (const z of [-0.3, 0.3]) {
    const w = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 18).rotateX(Math.PI / 2).translate(0.35, 0.17, z), new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.8 }));
    g.add(w);
  }
  g.add(mesh(new THREE.TorusGeometry(0.3, 0.012, 6, 32).rotateY(Math.PI / 2).translate(-0.12, 0.85, 0), steel));
  return g;
}

/** A wheelbarrow, tipped up on its wheel. */
function wheelbarrow() {
  const g = new THREE.Group();
  const tray = new THREE.MeshStandardMaterial({ color: "#2f6b3a", roughness: 0.45, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: "#555a5f", roughness: 0.45, metalness: 0.7 });
  const t = new THREE.CylinderGeometry(0.42, 0.3, 0.3, 4, 1, true).rotateY(Math.PI / 4).scale(1.1, 1, 0.75).translate(0, 0.5, 0);
  g.add(mesh(t, new THREE.MeshStandardMaterial({ color: "#2f6b3a", roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide })));
  g.add(mesh(new THREE.BoxGeometry(0.6, 0.02, 0.38).translate(0, 0.36, 0), tray));
  for (const z of [-0.22, 0.22]) g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.4, 8).rotateZ(Math.PI / 2 - 0.25).translate(-0.15, 0.45, z), steel));
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.09, 16).rotateX(Math.PI / 2).translate(0.55, 0.18, 0), new THREE.MeshStandardMaterial({ color: "#161616", roughness: 0.85 })));
  return g;
}

/** A skip bin. */
function skip() {
  const g = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: "#e0a91c", roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide });
  const s = new THREE.CylinderGeometry(1.75, 1.35, 1.1, 4, 1, true).rotateY(Math.PI / 4).scale(1.0, 1, 0.55).translate(0, 0.55, 0);
  g.add(mesh(s, yellow));
  g.add(mesh(new THREE.BoxGeometry(1.9, 0.05, 1.05).translate(0, 0.02, 0), yellow));
  const ribs: THREE.BufferGeometry[] = [];
  for (let i = -2; i <= 2; i++) ribs.push(bx(0.08, 1.1, 0.08, i * 0.52, 0, 0.78));
  g.add(boxes(ribs, yellow));
  // Rubble in it.
  const rub: THREE.BufferGeometry[] = [];
  const R = rng(5);
  for (let i = 0; i < 26; i++) rub.push(new THREE.DodecahedronGeometry(0.1 + R() * 0.12, 0).translate((R() - 0.5) * 2.2, 0.55 + R() * 0.35, (R() - 0.5) * 1.0));
  g.add(boxes(rub, new THREE.MeshStandardMaterial({ color: "#8c6f5e", roughness: 0.95 })));
  return g;
}

/** A portable toilet. */
function portaloo() {
  const g = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: "#2a5ea8", roughness: 0.55 });
  const white = new THREE.MeshStandardMaterial({ color: "#e9ece9", roughness: 0.5 });
  g.add(mesh(new THREE.BoxGeometry(1.1, 2.2, 1.15).translate(0, 1.1, 0), blue));
  g.add(mesh(new THREE.CylinderGeometry(0.72, 0.78, 0.12, 4).rotateY(Math.PI / 4).scale(1, 1, 1.05).translate(0, 2.26, 0), white));
  g.add(mesh(new THREE.BoxGeometry(0.8, 1.9, 0.03).translate(0, 1.05, 0.59), new THREE.MeshStandardMaterial({ color: "#244f8f", roughness: 0.55 })));
  return g;
}

/** A sand pile with a shovel stuck in it. */
function sandPile(M: Mats) {
  const g = new THREE.Group();
  const cone = new THREE.ConeGeometry(1.25, 0.8, 28, 6);
  const p = cone.getAttribute("position");
  const R = rng(9);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = 1 + (R() - 0.5) * 0.08 * (1 - Math.abs(y) * 0.8);
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  cone.computeVertexNormals();
  cone.translate(0, 0.4, 0);
  g.add(mesh(cone, localMaterial(M.pbr.soil, { scale: 1.2, fixed: true, color: "#e7c48c" })));
  const steel = new THREE.MeshStandardMaterial({ color: "#6f7377", roughness: 0.35, metalness: 0.8 });
  const handle = mesh(new THREE.CylinderGeometry(0.018, 0.02, 1.1, 8).translate(0, 0.55, 0), new THREE.MeshStandardMaterial({ color: "#a9835a", roughness: 0.6 }));
  const blade = mesh(new THREE.BoxGeometry(0.22, 0.28, 0.01).translate(0, -0.12, 0), steel);
  const shovel = new THREE.Group();
  shovel.add(handle, blade);
  shovel.position.set(0.3, 0.55, 0.2);
  shovel.rotation.set(0.3, 0, -0.35);
  g.add(shovel);
  return g;
}

/** A ute, parked on the street. */
function ute(color: string) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.12 });
  const black = new THREE.MeshStandardMaterial({ color: "#151617", roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: "#1d252c", roughness: 0.05, metalness: 0.5, envMapIntensity: 1.8 });
  g.add(mesh(new RoundBody(4.9, 0.75, 1.82).translate(0, 0.45, 0), paint));
  const cab = new THREE.BoxGeometry(1.75, 0.72, 1.72);
  const cp = cab.getAttribute("position");
  for (let i = 0; i < cp.count; i++) if (cp.getY(i) > 0) cp.setX(i, cp.getX(i) * 0.82 + (cp.getX(i) > 0 ? -0.1 : 0.05));
  cab.computeVertexNormals();
  g.add(mesh(cab.translate(0.75, 1.55, 0), glass));
  g.add(mesh(new THREE.BoxGeometry(1.5, 0.06, 1.66).translate(0.7, 1.92, 0), paint));
  // The tray.
  g.add(mesh(new THREE.BoxGeometry(2.2, 0.4, 1.86).translate(-1.35, 1.32, 0), new THREE.MeshStandardMaterial({ color: "#8f9396", roughness: 0.5, metalness: 0.7 })));
  for (const x of [1.55, -1.55])
    for (const z of [-0.85, 0.85]) g.add(mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 20).rotateX(Math.PI / 2).translate(x, 0.38, z), black));
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.18, 1.5).translate(2.46, 0.75, 0), new THREE.MeshStandardMaterial({ color: "#fff8e0", emissive: "#555040", roughness: 0.2 })));
  return g;
}

/** A box with its edges rounded a little (a car body). */
class RoundBody extends THREE.BoxGeometry {
  constructor(w: number, h: number, d: number) {
    super(w, h, d, 6, 2, 3);
    const p = this.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / (w / 2);
      const z = p.getZ(i) / (d / 2);
      const y = p.getY(i) / (h / 2);
      const k = 1 - 0.06 * x * x * x * x - 0.03 * z * z * z * z;
      p.setX(i, p.getX(i) * (1 - 0.02 * y * y));
      p.setZ(i, p.getZ(i) * k);
    }
    this.computeVertexNormals();
  }
}

/** The site board on the front of the plot. */
function siteSign() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4f1e8";
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#d9661f";
  g.fillRect(0, 0, 512, 70);
  g.fillStyle = "#fff";
  g.font = "bold 44px system-ui, sans-serif";
  g.fillText("GROUNDWORK", 24, 52);
  g.fillStyle = "#1d2125";
  g.font = "bold 30px system-ui, sans-serif";
  g.fillText("Builders & bricklayers", 24, 120);
  g.font = "24px system-ui, sans-serif";
  g.fillText("Site entry: hard hats and boots", 24, 168);
  g.fillText("Deliveries via the driveway", 24, 204);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  const board = mesh(new THREE.BoxGeometry(1.6, 0.8, 0.03), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
  board.position.set(0, 1.4, 0);
  grp.add(board);
  for (const x of [-0.7, 0.7]) grp.add(mesh(new THREE.BoxGeometry(0.07, 1.8, 0.07).translate(x, 0.9, -0.04), new THREE.MeshStandardMaterial({ color: "#7d6448", roughness: 0.8 })));
  return grp;
}

export function buildSite(M: Mats, quality: "low" | "medium" | "high"): SiteView {
  const group = new THREE.Group();
  const wear = new Wear();
  // The ground: lawn everywhere, worn to soil where you build.
  const ground = mesh(new THREE.PlaneGeometry(260, 260, 1, 1).rotateX(-Math.PI / 2), groundMaterial(M.pbr.grass, 4, { worn: { pbr: M.pbr.soil, scale: 3, mask: wear.tex, size: wear.size } }), false);
  group.add(ground);
  // The street: footpath, nature strip, kerbs, the road, and the far side.
  const path = localMaterial(M.pbr.concrete, { scale: 1.5, fixed: true, color: "#cfcbc2" });
  const kerb = localMaterial(M.pbr.concrete, { scale: 1, fixed: true, color: "#bdb9b0" });
  const road = groundMaterial(M.pbr.asphalt, 5);
  group.add(mesh(bx(200, 0.03, 1.5, 0, 0, SITE + 0.9), path, false));
  group.add(mesh(bx(200, 0.03, 1.5, 0, 0, STREET_Z + 10.8), path, false));
  const r = mesh(new THREE.PlaneGeometry(200, 7.6).rotateX(-Math.PI / 2).translate(0, 0.015, STREET_Z + 3.8), road, false);
  group.add(r);
  group.add(boxes([bx(200, 0.15, 0.3, 0, -0.03, STREET_Z - 0.15), bx(200, 0.15, 0.3, 0, -0.03, STREET_Z + 7.75)], kerb, false));
  // The driveway crossover and the plot's driveway.
  group.add(mesh(bx(3.2, 0.04, STREET_Z - SITE + 1.4, 9.6, 0, (SITE + STREET_Z) / 2 - 0.4), path, false));
  group.add(mesh(new THREE.PlaneGeometry(3.2, 9).rotateX(-Math.PI / 2).translate(9.6, 0.012, SITE - 4.5), groundMaterial(M.pbr.gravel, 1.6), false));
  // Lane markings.
  const marks: THREE.BufferGeometry[] = [];
  for (let x = -96; x < 96; x += 6) marks.push(bx(3, 0.004, 0.12, x, 0.02, STREET_Z + 3.8));
  group.add(boxes(marks, new THREE.MeshStandardMaterial({ color: "#e9e6dc", roughness: 0.7 }), false));
  group.add(fence(M));
  group.add(neighbour(M, -24.5, -2, 10, 8, 0, false));
  group.add(neighbour(M, 24.5, 1, 11, 8.5, Math.PI, true));
  group.add(neighbour(M, -12, STREET_Z + 21, 12, 9, Math.PI / 2, true));
  group.add(neighbour(M, 8, STREET_Z + 21, 10, 8, Math.PI / 2, false));
  // Trees: in the back corners, next door, and along the nature strip.
  const tm = treeMaterial;
  const trees: [number, number, number, "round" | "tall" | "pine"][] = [
    [-12.5, -12.5, 2.1, "round"],
    [12.8, -11.8, 1.8, "round"],
    [-12.8, 6, 1.4, "pine"],
    [-30, -10, 2.4, "round"],
    [31, -8, 2.2, "round"],
    [-8, SITE + 3.2, 1.3, "tall"],
    [4, SITE + 3.2, 1.35, "tall"],
    [16, SITE + 3.2, 1.3, "tall"],
    [-20, SITE + 3.2, 1.3, "tall"],
    [-26, 14, 1.9, "pine"],
    [27, 13, 2.0, "round"],
  ];
  for (const [x, z, k, kind] of trees) {
    const t = new THREE.Mesh(treeGeometry(kind), tm);
    t.position.set(x, 0, z);
    t.scale.setScalar(k);
    t.rotation.y = x * 0.7;
    t.castShadow = true;
    t.receiveShadow = true;
    group.add(t);
  }
  // The site gear, by the driveway.
  const pallets: [number, number, string][] = [
    [8.4, 10.4, "#9a4b37"],
    [8.4, 11.7, "#9a4b37"],
    [12.6, 10.6, "#c49a62"],
  ];
  for (const [x, z, c] of pallets) {
    const p = brickPallet(M, c);
    p.position.set(x, 0, z);
    group.add(p);
  }
  const sand = sandPile(M);
  sand.position.set(12.2, 0, 7.4);
  group.add(sand);
  const mx = mixer();
  mx.position.set(10.6, 0, 6.4);
  mx.rotation.y = 0.6;
  group.add(mx);
  const wb = wheelbarrow();
  wb.position.set(8.2, 0, 7.2);
  wb.rotation.y = 2.2;
  group.add(wb);
  const sk = skip();
  sk.position.set(12.4, 0, 12.6);
  sk.rotation.y = Math.PI / 2;
  group.add(sk);
  const loo = portaloo();
  loo.position.set(13.7, 0, 4.2);
  loo.rotation.y = -Math.PI / 2;
  group.add(loo);
  const sign = siteSign();
  sign.position.set(5.6, 0, SITE - 0.25);
  group.add(sign);
  // Tubs and buckets.
  const black = new THREE.MeshStandardMaterial({ color: "#1d1f21", roughness: 0.7 });
  const tub = mesh(new THREE.CylinderGeometry(0.33, 0.27, 0.28, 20, 1, true).translate(0, 0.14, 0), new THREE.MeshStandardMaterial({ color: "#1d1f21", roughness: 0.7, side: THREE.DoubleSide }));
  tub.position.set(9.9, 0, 8.4);
  group.add(tub);
  const mortarIn = mesh(new THREE.CircleGeometry(0.3, 20).rotateX(-Math.PI / 2).translate(0, 0.2, 0), localMaterial(M.pbr.mortar, { scale: 0.3, fixed: true, color: "#bdb7aa" }), false);
  mortarIn.position.copy(tub.position);
  group.add(mortarIn);
  const bucket = mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.3, 16).translate(0, 0.15, 0), black);
  bucket.position.set(10.4, 0, 8.9);
  group.add(bucket);
  const u = ute("#e9ebee");
  u.position.set(15.5, 0.03, STREET_Z + 1.25);
  group.add(u);
  const grass = quality === "low" ? null : new Grass(quality === "high" ? 150_000 : 60_000);
  if (grass) group.add(grass.mesh);
  let lastRev = -1;
  return {
    group,
    update(s) {
      if (s.rev === lastRev) return;
      lastRev = s.rev;
      wear.paint(s);
      grass?.update(s);
    },
    frame(t) {
      grass?.frame(t);
    },
  };
}
