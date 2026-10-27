import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Trees that hold up close: a trunk that forks into tapering limbs and twigs, and a crown of
 * leaf cards (each a painted cluster of leaves, cut out by its alpha) gathered round the twig
 * tips, lit as if the crown were one soft ball (each card's normal points out from the middle
 * of the crown) so it shades from bright on top to dark underneath like real foliage. The
 * leaves stir in the wind. Pines are whorls of drooping needle sprays up a straight stem.
 */

let seed = 1;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function leafTexture(kind: "leaf" | "needle") {
  const N = 256;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, N, N);
  seed = kind === "leaf" ? 7 : 11;
  if (kind === "leaf") {
    // A spray of small leaves, darker inside the cluster.
    for (let i = 0; i < 150; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * N * 0.42;
      const x = N / 2 + Math.cos(a) * r;
      const y = N / 2 + Math.sin(a) * r;
      const l = 12 + rnd() * 12;
      const shade = 0.55 + (r / (N * 0.42)) * 0.35 + rnd() * 0.15;
      const h = 85 + rnd() * 30;
      g.save();
      g.translate(x, y);
      g.rotate(rnd() * Math.PI * 2);
      g.fillStyle = `hsl(${h} ${38 + rnd() * 22}% ${Math.round(16 + shade * 22)}%)`;
      g.beginPath();
      g.ellipse(0, 0, l, l * 0.42, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(20,30,10,.35)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(-l, 0);
      g.lineTo(l, 0);
      g.stroke();
      g.restore();
    }
  } else {
    // A drooping spray of needles off a central twig.
    g.strokeStyle = "#3b2c1f";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(N * 0.5, N * 0.04);
    g.lineTo(N * 0.5, N * 0.96);
    g.stroke();
    for (let i = 0; i < 260; i++) {
      const t = rnd();
      const y = N * (0.06 + t * 0.9);
      const side = rnd() < 0.5 ? -1 : 1;
      const len = (18 + rnd() * 40) * (1 - t * 0.45);
      g.strokeStyle = `hsl(${120 + rnd() * 30} ${30 + rnd() * 20}% ${12 + rnd() * 16}%)`;
      g.lineWidth = 1.6 + rnd() * 1.2;
      g.beginPath();
      g.moveTo(N / 2, y);
      g.lineTo(N / 2 + side * len, y + len * (0.4 + rnd() * 0.4));
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function barkTexture() {
  const W = 128;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#5a4a3c";
  g.fillRect(0, 0, W, H);
  seed = 5;
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W;
    const w = 2 + rnd() * 6;
    const y = rnd() * H;
    const h = 30 + rnd() * 140;
    const l = rnd() < 0.5 ? 18 + rnd() * 10 : 36 + rnd() * 14;
    g.fillStyle = `hsl(28 ${12 + rnd() * 14}% ${l}%)`;
    g.globalAlpha = 0.55;
    g.fillRect(x, y, w, h);
    g.fillRect(x - W, y, w, h);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

let mats: { bark: THREE.MeshStandardMaterial; leaf: THREE.MeshStandardMaterial; needle: THREE.MeshStandardMaterial; time: { value: number } } | null = null;

function swaying(m: THREE.MeshStandardMaterial, time: { value: number }) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vec4 gwW = modelMatrix * vec4(transformed, 1.0);
      float gwH = max(0.0, transformed.y - 1.5);
      float gwS = sin(uTime * 1.3 + gwW.x * 0.35 + gwW.z * 0.27) + 0.4 * sin(uTime * 3.1 + gwW.y * 2.0 + gwW.x);
      transformed.x += gwS * 0.012 * gwH;
      transformed.z += gwS * 0.008 * gwH;`,
    );
  };
}

export function treeMaterials() {
  if (mats) return mats;
  const time = { value: 0 };
  const bark = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.95, color: "#ffffff" });
  const leaf = new THREE.MeshStandardMaterial({ map: leafTexture("leaf"), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.78, vertexColors: true, envMapIntensity: 0.6 });
  const needle = new THREE.MeshStandardMaterial({ map: leafTexture("needle"), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true, envMapIntensity: 0.5 });
  swaying(leaf, time);
  swaying(needle, time);
  mats = { bark, leaf, needle, time };
  return mats;
}

/** A tapered limb from a to b. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, 7, 1, true);
  g.translate(0, len / 2, 0);
  // Bark runs along the limb, and wraps round it once or twice.
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(r0 * 14)), uv.getY(i) * len * 0.9);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/** A leaf card: a quad facing a random way, its normal from the crown's middle. */
function card(out: { pos: number[]; nor: number[]; uv: number[]; col: number[]; idx: number[] }, at: THREE.Vector3, size: number, centre: THREE.Vector3, tint: [number, number, number], droop = 0) {
  const n = new THREE.Vector3(rnd() - 0.5, rnd() - 0.2, rnd() - 0.5).normalize();
  const u = new THREE.Vector3().crossVectors(n, Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
  const v = new THREE.Vector3().crossVectors(u, n).normalize();
  if (droop) v.lerp(new THREE.Vector3(0, -1, 0), droop).normalize();
  const shade = at.clone().sub(centre).normalize();
  const base = out.pos.length / 3;
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const k = 0.82 + rnd() * 0.3;
  for (const [cu, cv] of corners) {
    const p = at.clone().addScaledVector(u, (cu * size) / 2).addScaledVector(v, (cv * size) / 2);
    out.pos.push(p.x, p.y, p.z);
    out.nor.push(shade.x, shade.y, shade.z);
    out.uv.push((cu + 1) / 2, (cv + 1) / 2);
    out.col.push(tint[0] * k, tint[1] * k, tint[2] * k);
  }
  out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function cardsGeometry(out: { pos: number[]; nor: number[]; uv: number[]; col: number[]; idx: number[] }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(out.nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(out.uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(out.col, 3));
  g.setIndex(out.idx);
  return g;
}

export type TreeKind = "oak" | "gum" | "pine";

/** A tree, about 6–10 m (scale it), as a group of a trunk and a crown. */
export function makeTree(kind: TreeKind, s: number, quality: "low" | "medium" | "high") {
  const M = treeMaterials();
  seed = 1000 + Math.floor(s * 997);
  const wood: THREE.BufferGeometry[] = [];
  const leaves = { pos: [] as number[], nor: [] as number[], uv: [] as number[], col: [] as number[], idx: [] as number[] };
  const dense = quality === "high" ? 1 : quality === "medium" ? 0.7 : 0.45;
  const group = new THREE.Group();
  if (kind === "pine") {
    const h = 9;
    wood.push(limb(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0, h, 0), 0.22, 0.03));
    const centre = new THREE.Vector3(0, h * 0.45, 0);
    for (let y = 1.6; y < h; y += 0.45) {
      const t = (y - 1.6) / (h - 1.6);
      const reach = (1 - t) * 2.6 + 0.35;
      const n = Math.round(6 + (1 - t) * 4);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + y * 1.7;
        const dir = new THREE.Vector3(Math.cos(a), -0.25, Math.sin(a));
        const tip = new THREE.Vector3(0, y, 0).addScaledVector(dir, reach);
        if (reach > 0.8) wood.push(limb(new THREE.Vector3(0, y, 0), tip, 0.035, 0.01));
        const sprays = Math.max(1, Math.round(reach * 3 * dense));
        for (let k = 0; k < sprays; k++) {
          const at = new THREE.Vector3(0, y, 0).lerp(tip, 0.35 + (k / sprays) * 0.65).add(new THREE.Vector3((rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.3));
          card(leaves, at, 0.9 + rnd() * 0.5, centre, [0.85, 0.95, 0.85], 0.4);
        }
      }
    }
    const crown = new THREE.Mesh(cardsGeometry(leaves), M.needle);
    crown.castShadow = crown.receiveShadow = true;
    group.add(crown);
  } else {
    const gum = kind === "gum";
    const tips: THREE.Vector3[] = [];
    const grow = (a: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
      const b = a.clone().addScaledVector(dir, len);
      wood.push(limb(a, b, r, r * (depth >= 3 ? 0.35 : 0.68)));
      if (depth >= (gum ? 3 : 4)) {
        tips.push(b);
        return;
      }
      const kids = depth === 0 ? (gum ? 3 : 4) : 2 + (rnd() < 0.5 ? 1 : 0);
      for (let i = 0; i < kids; i++) {
        const spread = (gum ? 0.45 : 0.62) + rnd() * 0.3;
        const a2 = rnd() * Math.PI * 2;
        const side = new THREE.Vector3(Math.cos(a2), 0, Math.sin(a2));
        const nd = dir.clone().multiplyScalar(Math.cos(spread)).addScaledVector(side, Math.sin(spread)).normalize();
        nd.y = Math.max(nd.y, gum ? 0.35 : 0.05);
        nd.normalize();
        grow(b, nd, len * (0.62 + rnd() * 0.18), r * 0.62, depth + 1);
      }
    };
    const trunkH = gum ? 3.4 : 2.3;
    grow(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3((rnd() - 0.5) * 0.12, 1, (rnd() - 0.5) * 0.12).normalize(), trunkH, gum ? 0.2 : 0.26, 0);
    const centre = tips.reduce((c, t) => c.add(t), new THREE.Vector3()).multiplyScalar(1 / tips.length);
    centre.y -= 0.6;
    const per = Math.round((gum ? 16 : 22) * dense);
    const spread = gum ? 0.75 : 1.0;
    const tint: [number, number, number] = gum ? [0.78, 0.86, 0.8] : [0.95, 1, 0.9];
    for (const t of tips)
      for (let i = 0; i < per; i++) {
        const at = t.clone().add(new THREE.Vector3((rnd() - 0.5) * 2 * spread, (rnd() - 0.4) * 1.4 * spread, (rnd() - 0.5) * 2 * spread));
        card(leaves, at, (gum ? 0.85 : 1.0) + rnd() * 0.5, centre, tint, gum ? 0.35 : 0);
      }
    const crown = new THREE.Mesh(cardsGeometry(leaves), M.leaf);
    crown.castShadow = crown.receiveShadow = true;
    group.add(crown);
  }
  const trunk = new THREE.Mesh(mergeGeometries(wood)!, M.bark);
  trunk.castShadow = trunk.receiveShadow = true;
  group.add(trunk);
  group.scale.setScalar(s);
  return group;
}

/** Keep the leaves moving. */
export function windTime(t: number) {
  if (mats) mats.time.value = t;
}
