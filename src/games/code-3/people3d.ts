import * as THREE from "three";
import { mergeGeometries as mergeRaw } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Code 3's people: one skinned mesh per person (a single draw call), built from
 * lathed limbs and a lathed torso whose vertices near the knees, elbows and
 * waist are weighted across two bones, so joints bend smoothly. Clothing is
 * vertex colour by "slot" (skin, top, bottom, shoes, hair...), with outfits
 * adding layers: jackets, hoodies, suits, skirts, backpacks, the patrol
 * uniform with vest, duty belt and cap.
 *
 * Model frame: +x forward (the face), +y up, +z to the person's right.
 * Bones swing limbs forward with +z rotation, raise the left arm / leg
 * outward with +x (the right with -x), twist with y.
 */

// ------------------------------------------------------------------ bones

export const BONES = ["root", "hips", "spine", "chest", "neck", "head", "armL", "foreL", "handL", "armR", "foreR", "handR", "thighL", "shinL", "footL", "thighR", "shinR", "footR"] as const;
export type BoneName = (typeof BONES)[number];
const B = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;
const PARENT: Record<BoneName, BoneName | null> = {
  root: null,
  hips: "root",
  spine: "hips",
  chest: "spine",
  neck: "chest",
  head: "neck",
  armL: "chest",
  foreL: "armL",
  handL: "foreL",
  armR: "chest",
  foreR: "armR",
  handR: "foreR",
  thighL: "hips",
  shinL: "thighL",
  footL: "shinL",
  thighR: "hips",
  shinR: "thighR",
  footR: "shinR",
};
/** Joint positions in the rest pose (model space). */
const JOINT: Record<BoneName, [number, number, number]> = {
  root: [0, 0, 0],
  hips: [0, 0.95, 0],
  spine: [0, 1.06, 0],
  chest: [0, 1.24, 0],
  neck: [0, 1.58, 0],
  head: [0, 1.66, 0],
  armL: [0, 1.5, -0.205],
  foreL: [0, 1.21, -0.215],
  handL: [0, 0.94, -0.215],
  armR: [0, 1.5, 0.205],
  foreR: [0, 1.21, 0.215],
  handR: [0, 0.94, 0.215],
  thighL: [0, 0.92, -0.095],
  shinL: [0, 0.5, -0.095],
  footL: [0, 0.08, -0.095],
  thighR: [0, 0.92, 0.095],
  shinR: [0, 0.5, 0.095],
  footR: [0, 0.08, 0.095],
};

// ------------------------------------------------------------------ slots

const SLOT = { skin: 0, top: 1, bottom: 2, shoes: 3, hair: 4, eyes: 5, lips: 6, accent: 7, belt: 8, metal: 9, white: 10, hat: 11, vest: 12, sole: 13 } as const;
type Slot = keyof typeof SLOT;

export type Top = "tee" | "long" | "tank" | "jacket" | "hoodie" | "suit" | "uniform";
export type Bottom = "trousers" | "shorts" | "skirt";
export type Hair = "short" | "long" | "ponytail" | "buzz" | "bald";

export interface Outfit {
  female: boolean;
  top: Top;
  bottom: Bottom;
  hair: Hair;
  beard: boolean;
  hat: "none" | "cap" | "beanie" | "police";
  backpack: boolean;
  officer: boolean;
}

export interface Colors {
  skin: string;
  top: string;
  bottom: string;
  shoes?: string;
  hair?: string;
  accent?: string;
  hat?: string;
}

// ------------------------------------------------------------ geometry kit

interface Part {
  geo: THREE.BufferGeometry;
  /** Per-vertex [boneA, boneB, weightA]. */
  bind: (y: number, x: number, z: number) => [number, number, number];
  slot: (y: number, x: number, z: number) => Slot;
}

/** Segment scale for the current build (Low detail uses fewer). */
let SEGK = 1;
const sg = (n: number) => Math.max(4, Math.round(n * SEGK));

function lathe(profile: [number, number][], seg = 10) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    sg(seg),
  ).toNonIndexed();
}

const rigid = (bone: BoneName) => () => [B[bone], B[bone], 1] as [number, number, number];
const flat = (slot: Slot) => () => slot;

/** Blend two bones across a band of heights (lo → b, hi → a). */
function band(a: BoneName, b: BoneName, lo: number, hi: number) {
  return (y: number): [number, number, number] => {
    if (y >= hi) return [B[a], B[b], 1];
    if (y <= lo) return [B[b], B[a], 1];
    const t = (y - lo) / (hi - lo);
    return [B[a], B[b], t];
  };
}

function buildTemplate(o: Outfit, lod: "high" | "low") {
  SEGK = lod === "low" ? 0.55 : 1;
  const fine = lod === "high";
  const parts: Part[] = [];
  const add = (geo: THREE.BufferGeometry, bind: Part["bind"], slot: Part["slot"]) => parts.push({ geo: geo.index ? geo.toNonIndexed() : geo, bind, slot });
  const F = o.female;

  // Legs: hip to ankle, blended at the knee.
  const legProfile: [number, number][] = [
    [0, 0.065],
    [0.037, 0.07],
    [0.042, 0.12],
    [0.05, 0.22],
    [0.06, 0.33],
    [0.061, 0.4],
    [0.053, 0.48],
    [0.056, 0.53],
    [0.066, 0.6],
    [F ? 0.08 : 0.078, 0.72],
    [F ? 0.09 : 0.087, 0.84],
    [F ? 0.094 : 0.09, 0.93],
    [0.082, 0.99],
    [0, 1.02],
  ];
  for (const side of [-1, 1]) {
    const thigh = side < 0 ? "thighL" : "thighR";
    const shin = side < 0 ? "shinL" : "shinR";
    const foot = side < 0 ? "footL" : "footR";
    const z = side * (F ? 0.09 : 0.095);
    const knee = band(thigh, shin, 0.44, 0.57);
    const legSlot = (y: number): Slot => (o.bottom === "skirt" ? (y > 0.62 ? "bottom" : "skin") : o.bottom === "shorts" ? (y > 0.56 ? "bottom" : "skin") : "bottom");
    add(lathe(legProfile).translate(0, 0, z), knee, legSlot);
    // Shoe: upper and sole, toe forward.
    add(new RoundedBoxGeometry(0.25, 0.085, 0.1, 2, 0.03).translate(0.055, 0.05, z), rigid(foot), flat("shoes"));
    add(new THREE.BoxGeometry(0.255, 0.022, 0.098).translate(0.057, 0.011, z), rigid(foot), flat("sole"));
  }

  // Torso: pelvis to neck (elliptical: wider than deep), blended at waist and ribs.
  const torsoProfile: [number, number][] = F
    ? [
        [0, 0.84],
        [0.085, 0.86],
        [0.13, 0.92],
        [0.132, 0.98],
        [0.112, 1.05],
        [0.098, 1.1],
        [0.103, 1.18],
        [0.112, 1.28],
        [0.115, 1.38],
        [0.112, 1.46],
        [0.1, 1.51],
        [0.075, 1.56],
        [0.045, 1.6],
        [0, 1.61],
      ]
    : [
        [0, 0.84],
        [0.08, 0.86],
        [0.12, 0.92],
        [0.124, 0.98],
        [0.117, 1.05],
        [0.112, 1.1],
        [0.118, 1.18],
        [0.128, 1.28],
        [0.133, 1.37],
        [0.13, 1.45],
        [0.118, 1.51],
        [0.085, 1.56],
        [0.048, 1.6],
        [0, 1.61],
      ];
  const torso = lathe(torsoProfile, 14).scale(o.officer || o.top === "jacket" || o.top === "suit" ? 1.02 : 0.96, 1, 1.42);
  const waist = band("spine", "hips", 1.0, 1.1);
  const ribs = band("chest", "spine", 1.16, 1.28);
  const torsoBind = (y: number) => (y > 1.13 ? ribs(y) : waist(y));
  const tuck = o.top === "tank" || o.top === "tee" ? 1.0 : 0.98;
  add(torso, torsoBind, (y) => (y < tuck ? "bottom" : "top"));
  // Shoulders (a capsule across the top of the chest) and deltoids.
  const shoulderSlot: Slot = o.top === "tank" ? "skin" : "top";
  add(new THREE.CapsuleGeometry(F ? 0.062 : 0.07, F ? 0.25 : 0.28, 3, 10).rotateX(Math.PI / 2).scale(0.85, 1, 1).translate(0, 1.49, 0), rigid("chest"), flat(shoulderSlot));
  if (F) for (const side of [-1, 1]) add(new THREE.SphereGeometry(0.058, 10, 8).scale(0.9, 0.85, 1).translate(0.075, 1.36, side * 0.07), rigid("chest"), flat("top"));
  for (const side of [-1, 1]) add(new THREE.SphereGeometry(F ? 0.055 : 0.063, 10, 8).translate(0, 1.485, side * 0.2), rigid(side < 0 ? "armL" : "armR"), flat(shoulderSlot));

  // Arms: shoulder to wrist, blended at the elbow; hands with a thumb.
  const armProfile: [number, number][] = [
    [0, 0.93],
    [0.03, 0.935],
    [0.035, 0.97],
    [0.039, 1.05],
    [0.044, 1.12],
    [0.041, 1.19],
    [0.045, 1.25],
    [F ? 0.047 : 0.053, 1.33],
    [F ? 0.05 : 0.057, 1.41],
    [F ? 0.052 : 0.059, 1.47],
    [0.052, 1.52],
    [0, 1.545],
  ];
  const sleeve = (y: number): Slot => {
    if (o.top === "tank") return "skin";
    if (o.top === "tee") return y > 1.33 ? "top" : "skin";
    if (o.officer && o.top === "uniform") return y > 1.32 ? "top" : "skin";
    return y > 0.97 ? "top" : "skin";
  };
  for (const side of [-1, 1]) {
    const arm = side < 0 ? "armL" : "armR";
    const fore = side < 0 ? "foreL" : "foreR";
    const hand = side < 0 ? "handL" : "handR";
    const z = side * (F ? 0.2 : 0.215);
    add(lathe(armProfile, 9).translate(0, 0, z), band(arm, fore, 1.15, 1.27), sleeve);
    add(new RoundedBoxGeometry(0.075, 0.1, 0.034, 2, 0.015).translate(0.005, 0.875, z), rigid(hand), flat("skin"));
    if (fine) add(new THREE.CapsuleGeometry(0.014, 0.035, 2, 6).rotateX(side * 0.5).translate(0.035, 0.9, z - side * 0.018), rigid(hand), flat("skin"));
  }

  // Neck and head.
  add(new THREE.CylinderGeometry(0.046, 0.052, 0.13, 10).translate(0.005, 1.62, 0), rigid("neck"), flat("skin"));
  add(new THREE.SphereGeometry(0.103, sg(16), sg(12)).scale(1.03, 1.16, 0.9).translate(-0.005, 1.748, 0), rigid("head"), flat("skin"));
  add(new RoundedBoxGeometry(0.1, 0.075, F ? 0.1 : 0.115, 2, 0.03).translate(0.032, 1.678, 0), rigid("head"), flat("skin"));
  add(new RoundedBoxGeometry(0.035, 0.045, 0.024, 1, 0.01).rotateZ(-0.25).translate(0.105, 1.733, 0), rigid("head"), flat("skin"));
  for (const side of [-1, 1]) {
    if (fine) {
      add(new THREE.SphereGeometry(0.027, 8, 6).scale(0.6, 1, 0.35).translate(-0.008, 1.742, side * 0.096), rigid("head"), flat("skin"));
      add(new THREE.SphereGeometry(0.016, 8, 6).scale(0.5, 0.8, 1).translate(0.088, 1.765, side * 0.036), rigid("head"), flat("white"));
      add(new THREE.BoxGeometry(0.012, 0.009, 0.036).rotateX(side * 0.15).translate(0.097, 1.789, side * 0.037), rigid("head"), flat("hair"));
    }
    add(new THREE.SphereGeometry(0.0085, 6, 5).translate(0.095, 1.765, side * 0.036), rigid("head"), flat("eyes"));
  }
  if (fine) add(new THREE.BoxGeometry(0.012, 0.012, 0.04).translate(0.1, 1.694, 0), rigid("head"), flat("lips"));
  if (o.beard) add(new RoundedBoxGeometry(0.105, 0.07, 0.122, 2, 0.03).translate(0.032, 1.672, 0), rigid("head"), flat("hair"));
  // Hair.
  const cap = (r: number, cover: number) => new THREE.SphereGeometry(r, sg(16), sg(10), 0, Math.PI * 2, 0, Math.PI * cover).scale(1.04, 1.12, 0.95).rotateZ(0.2).translate(-0.012, 1.752, 0);
  if (o.hair === "short") add(cap(0.111, 0.52), rigid("head"), flat("hair"));
  if (o.hair === "buzz") add(cap(0.107, 0.44), rigid("head"), flat("hair"));
  if (o.hair === "long" || o.hair === "ponytail") add(cap(0.112, 0.55), rigid("head"), flat("hair"));
  if (o.hair === "long") add(new THREE.CylinderGeometry(0.1, 0.085, 0.26, 12, 1, true, Math.PI * 0.55, Math.PI * 0.9).translate(-0.015, 1.64, 0), rigid("head"), flat("hair"));
  if (o.hair === "ponytail") {
    add(new THREE.SphereGeometry(0.035, 8, 6).translate(-0.118, 1.77, 0), rigid("head"), flat("hair"));
    add(new THREE.CapsuleGeometry(0.028, 0.14, 2, 6).translate(-0.13, 1.68, 0), rigid("head"), flat("hair"));
  }
  // Hats.
  if (o.hat === "cap" || o.hat === "police") {
    add(new THREE.CylinderGeometry(0.108, 0.113, 0.075, 16).translate(-0.005, 1.832, 0), rigid("head"), flat("hat"));
    add(new THREE.CylinderGeometry(o.hat === "police" ? 0.128 : 0.11, 0.108, 0.02, 16).translate(-0.005, 1.875, 0), rigid("head"), flat("hat"));
    add(new THREE.BoxGeometry(0.1, 0.012, 0.17).rotateZ(-0.12).translate(0.11, 1.805, 0), rigid("head"), flat(o.hat === "police" ? "belt" : "hat"));
    if (o.hat === "police") add(new THREE.BoxGeometry(0.01, 0.03, 0.026).translate(0.113, 1.845, 0), rigid("head"), flat("metal"));
  }
  if (o.hat === "beanie") add(new THREE.SphereGeometry(0.117, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1.02, 1.05, 0.96).translate(-0.01, 1.76, 0), rigid("head"), flat("hat"));

  // Outfit layers.
  if (o.top === "jacket" || o.top === "suit") {
    // Open front showing the shirt beneath; a collar.
    add(new THREE.BoxGeometry(0.02, 0.3, 0.09).translate(0.128, 1.36, 0), rigid("chest"), flat(o.top === "suit" ? "white" : "accent"));
    add(new THREE.TorusGeometry(0.06, 0.018, 6, 14, Math.PI * 1.4).rotateX(Math.PI / 2).rotateY(Math.PI * 0.3).translate(0.01, 1.575, 0), rigid("chest"), flat("top"));
    if (o.top === "suit") add(new THREE.BoxGeometry(0.012, 0.24, 0.035).translate(0.14, 1.37, 0), rigid("chest"), flat("accent"));
  }
  if (o.top === "hoodie") {
    add(new THREE.TorusGeometry(0.085, 0.035, 6, 12).rotateY(Math.PI / 2).rotateZ(0.5).translate(-0.06, 1.6, 0), rigid("chest"), flat("top"));
    add(new THREE.BoxGeometry(0.02, 0.1, 0.2).translate(0.125, 1.1, 0), rigid("spine"), flat("accent"));
  }
  if (o.bottom === "skirt") add(new THREE.CylinderGeometry(0.14, 0.2, 0.4, 14, 1, true).scale(1, 1, 1.25).translate(0, 0.8, 0), rigid("hips"), flat("bottom"));
  if (o.backpack) add(new RoundedBoxGeometry(0.13, 0.32, 0.27, 2, 0.04).translate(-0.19, 1.3, 0), rigid("chest"), flat("accent"));
  if (o.officer) {
    // Ballistic vest, duty belt with holster and pouches, radio, shoulder mic, badge.
    add(lathe([[0, 1.07], [0.125, 1.08], [0.135, 1.2], [0.142, 1.34], [0.138, 1.46], [0.1, 1.5], [0, 1.51]], 14).scale(1.02, 1, 1.4), ribs, flat("vest"));
    add(new THREE.CylinderGeometry(0.131, 0.131, 0.065, 14, 1, true).scale(1, 1, 1.4).translate(0, 1.0, 0), rigid("hips"), flat("belt"));
    add(new RoundedBoxGeometry(0.1, 0.19, 0.055, 2, 0.02).translate(0.0, 0.93, 0.2), rigid("hips"), flat("belt"));
    add(new RoundedBoxGeometry(0.05, 0.07, 0.1, 1, 0.01).translate(0.125, 1.0, -0.08), rigid("hips"), flat("belt"));
    add(new RoundedBoxGeometry(0.05, 0.1, 0.045, 1, 0.01).translate(0.14, 1.36, -0.09), rigid("chest"), flat("belt"));
    add(new RoundedBoxGeometry(0.03, 0.05, 0.035, 1, 0.01).translate(0.08, 1.52, -0.13), rigid("chest"), flat("belt"));
    add(new THREE.BoxGeometry(0.012, 0.05, 0.04).translate(0.146, 1.4, 0.075), rigid("chest"), flat("metal"));
  }

  // Merge into one skinned geometry.
  const geos: THREE.BufferGeometry[] = [];
  const slots: number[] = [];
  for (const p of parts) {
    const g = p.geo;
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const si = new Uint16Array(pos.count * 4);
    const sw = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const [a, b, w] = p.bind(y, x, z);
      si[i * 4] = a;
      si[i * 4 + 1] = b;
      sw[i * 4] = w;
      sw[i * 4 + 1] = 1 - w;
      slots.push(SLOT[p.slot(y, x, z)]);
    }
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
    geos.push(g);
  }
  const geo = mergeRaw(geos);
  if (!geo) throw new Error("Code 3: couldn't merge person");
  return { geo, slots: Uint8Array.from(slots) };
}

const templates = new Map<string, { geo: THREE.BufferGeometry; slots: Uint8Array }>();
function template(o: Outfit, lod: "high" | "low") {
  const key = JSON.stringify(o) + lod;
  let t = templates.get(key);
  if (!t) {
    t = buildTemplate(o, lod);
    templates.set(key, t);
  }
  return t;
}

let sharedMat: THREE.MeshStandardMaterial | null = null;
function material() {
  sharedMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
  return sharedMat;
}

let vestText: THREE.Texture | null = null;
function policeText() {
  if (vestText) return vestText;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f2f2f2";
  g.font = "bold 50px Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("POLICE", 128, 34);
  vestText = new THREE.CanvasTexture(c);
  vestText.colorSpace = THREE.SRGBColorSpace;
  return vestText;
}

// ------------------------------------------------------------------ model

export type Pose =
  | "walk"
  | "stand"
  | "talk"
  | "handsup"
  | "kneel"
  | "prone"
  | "cuffed"
  | "cuffedKneel"
  | "down"
  | "dead"
  | "tased"
  | "aim"
  | "fight"
  | "radio"
  | "drive"
  | "panic"
  | "phone"
  | "point"
  | "search";

export interface PedModel {
  group: THREE.Group;
  mesh: THREE.SkinnedMesh;
  bones: THREE.Bone[];
  gun: THREE.Mesh;
  taser: THREE.Mesh;
  /** Pose blending state. */
  anim: { pose: Pose | ""; blend: number; from: Float32Array; cur: Float32Array; t: number };
}

const N = BONES.length;
/** Pose vector: 3 Euler angles per bone, then the root offset (x, y, z). */
const LEN = N * 3 + 3;

const gunGeo = (() => {
  const g = mergeRaw([
    new THREE.BoxGeometry(0.032, 0.18, 0.028).translate(0.035, -0.12, 0),
    new THREE.BoxGeometry(0.1, 0.034, 0.028).rotateZ(-0.25).translate(-0.01, -0.06, 0),
    new THREE.BoxGeometry(0.03, 0.035, 0.02).translate(0.0, -0.1, 0),
  ]);
  return g!;
})();

export interface PedLook {
  skin: string;
  shirt: string;
  pants: string;
  officer?: boolean;
  hair?: string;
  /** Deterministic variety seed (outfit, hair, build). */
  seed?: number;
  /** Legacy: long hair. */
  long?: boolean;
  /** Mesh detail (Low halves the segments and drops tiny face parts). */
  lod?: "high" | "low";
}

const SHOES = ["#1b1a18", "#3a2a1e", "#e8e6e1", "#2b2f36", "#5a4030"];
const ACCENT = ["#e8e4dc", "#b8322a", "#2a4a7a", "#3a3a3a", "#c9a24a", "#2f5a3a"];
const HATS = ["#1b1b1b", "#2a3a5a", "#7a1f24", "#4a4a4a", "#c9b27a"];

/** Pick an outfit for a civilian from a seed. */
export function outfitFor(seed: number, officer = false): Outfit {
  if (officer) return { female: seed % 5 === 0, top: "uniform", bottom: "trousers", hair: "short", beard: false, hat: seed % 3 === 0 ? "none" : "police", backpack: false, officer: true };
  const r = (k: number) => ((Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const female = r(1) < 0.45;
  const tops: Top[] = ["tee", "tee", "long", "jacket", "hoodie", "suit", "tank"];
  const top = tops[Math.floor(r(2) * tops.length)];
  const bottom: Bottom = female && r(3) < 0.35 ? "skirt" : r(3) > 0.82 ? "shorts" : "trousers";
  const hairs: Hair[] = female ? ["long", "long", "ponytail", "short"] : ["short", "short", "buzz", "bald", "short"];
  const hair = hairs[Math.floor(r(4) * hairs.length)];
  const hat = r(5) < 0.12 ? "cap" : r(5) < 0.2 ? "beanie" : "none";
  return { female, top, bottom, hair, beard: !female && r(6) < 0.3, hat, backpack: r(7) < 0.15, officer: false };
}

export function buildPed(look: PedLook): PedModel {
  const seed = look.seed ?? (look.skin.charCodeAt(2) * 31 + look.shirt.charCodeAt(3) * 7 + look.pants.charCodeAt(4));
  const o = outfitFor(seed, !!look.officer);
  if (look.long && !o.officer) o.hair = "long";
  const t = template(o, look.lod ?? "high");
  // Share positions / normals / skinning; each person gets its own colours.
  const geo = new THREE.BufferGeometry();
  for (const k of ["position", "normal", "skinIndex", "skinWeight"]) geo.setAttribute(k, t.geo.getAttribute(k));
  const pick = (a: string[], k: number) => a[Math.abs(Math.floor(seed * 7 + k * 13)) % a.length];
  const palette: Record<number, THREE.Color> = {
    [SLOT.skin]: new THREE.Color(look.skin),
    [SLOT.top]: new THREE.Color(look.officer ? "#1f2b44" : look.shirt),
    [SLOT.bottom]: new THREE.Color(look.officer ? "#1a2233" : look.pants),
    [SLOT.shoes]: new THREE.Color(look.officer ? "#0e0e0e" : pick(SHOES, 1)),
    [SLOT.hair]: new THREE.Color(look.hair ?? "#2a1d14"),
    [SLOT.eyes]: new THREE.Color("#1a1410"),
    [SLOT.lips]: new THREE.Color(look.skin).multiplyScalar(0.72).lerp(new THREE.Color("#8a3a3a"), 0.25),
    [SLOT.accent]: new THREE.Color(pick(ACCENT, 2)),
    [SLOT.belt]: new THREE.Color("#101010"),
    [SLOT.metal]: new THREE.Color("#d9b44a"),
    [SLOT.white]: new THREE.Color("#ecebe6"),
    [SLOT.hat]: new THREE.Color(o.hat === "police" ? "#141c2e" : pick(HATS, 3)),
    [SLOT.vest]: new THREE.Color("#1b1e24"),
    [SLOT.sole]: new THREE.Color(pick(SHOES, 1) === "#e8e6e1" ? "#f4f4f2" : "#141414"),
  };
  const col = new Float32Array(t.slots.length * 3);
  for (let i = 0; i < t.slots.length; i++) {
    const c = palette[t.slots[i]];
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.SkinnedMesh(geo, material());
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const bones = BONES.map((name) => {
    const b = new THREE.Bone();
    b.name = name;
    return b;
  });
  BONES.forEach((name, i) => {
    const p = PARENT[name];
    const j = JOINT[name];
    if (p) {
      const pj = JOINT[p];
      bones[i].position.set(j[0] - pj[0], j[1] - pj[1], j[2] - pj[2]);
      bones[B[p]].add(bones[i]);
    } else bones[i].position.set(...j);
  });
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  const group = new THREE.Group();
  group.add(mesh);
  // Build variety: height and bulk.
  const hk = 0.94 + (((seed * 0.618) % 1) + 1) % 1 * 0.12 - (o.female ? 0.05 : 0);
  mesh.scale.set(1, hk, 1 + (o.female ? -0.04 : 0.03));
  // Weapons ride in the right hand.
  const gun = new THREE.Mesh(gunGeo, new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.4, metalness: 0.6 }));
  const taser = new THREE.Mesh(gunGeo, new THREE.MeshStandardMaterial({ color: "#e5c52e", roughness: 0.5 }));
  gun.visible = taser.visible = false;
  bones[B.handR].add(gun, taser);
  if (o.officer) {
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.085), new THREE.MeshBasicMaterial({ map: policeText(), transparent: true, depthWrite: false }));
    back.position.set(-0.162, 0.2, 0);
    back.rotation.y = -Math.PI / 2;
    bones[B.chest].add(back);
  }
  return { group, mesh, bones, gun, taser, anim: { pose: "", blend: 1, from: new Float32Array(LEN), cur: new Float32Array(LEN), t: 0 } };
}

// ------------------------------------------------------------------ poses

class PoseVec {
  v = new Float32Array(LEN);
  set(b: BoneName, x: number, y: number, z: number) {
    const i = B[b] * 3;
    this.v[i] = x;
    this.v[i + 1] = y;
    this.v[i + 2] = z;
    return this;
  }
  add(b: BoneName, x: number, y: number, z: number) {
    const i = B[b] * 3;
    this.v[i] += x;
    this.v[i + 1] += y;
    this.v[i + 2] += z;
    return this;
  }
  root(x: number, y: number, z: number) {
    this.v[N * 3] = x;
    this.v[N * 3 + 1] = y;
    this.v[N * 3 + 2] = z;
    return this;
  }
}

const THIGH = 0.42;

/** Locomotion: walk → run by speed, idle breathing and weight shift when still. */
function locomotion(p: PoseVec, step: number, speed: number, t: number) {
  const run = Math.max(0, Math.min(1, (speed - 2.2) / 2.8));
  const walk = Math.min(1, speed / 1.3);
  const A = walk * (0.4 + run * 0.38);
  const K = walk * (0.55 + run * 1.05);
  const phi = step * 2.2;
  for (const side of [0, 1]) {
    const ps = phi + side * Math.PI;
    const hip = A * Math.sin(ps) + run * 0.12;
    const knee = -(0.06 * walk + K * Math.max(0, Math.cos(ps)) ** 1.3) - run * 0.15;
    const [thigh, shin, foot] = side === 0 ? (["thighL", "shinL", "footL"] as const) : (["thighR", "shinR", "footR"] as const);
    p.set(thigh, side === 0 ? 0.03 : -0.03, 0, hip);
    p.set(shin, 0, 0, knee);
    p.set(foot, 0, 0, Math.max(-0.5, Math.min(0.35, -(hip + knee) * 0.55 - 0.05 * Math.sin(ps))));
    const [arm, fore] = side === 0 ? (["armL", "foreL"] as const) : (["armR", "foreR"] as const);
    p.set(arm, side === 0 ? 0.07 : -0.07, 0, -A * (0.85 - run * 0.1) * Math.sin(ps) + run * 0.1);
    p.set(fore, 0, side === 0 ? -0.1 : 0.1, 0.18 + walk * 0.12 + run * 1.15 + 0.12 * Math.max(0, -Math.sin(ps)) * walk);
  }
  p.set("spine", 0, A * 0.28 * Math.sin(phi), -run * 0.08);
  p.set("hips", 0, -A * 0.18 * Math.sin(phi), 0);
  p.set("chest", 0, 0, -run * 0.1 - 0.02 + Math.sin(t * 1.8) * 0.012 * (1 - walk));
  p.set("head", 0, Math.sin(t * 0.37) * 0.25 * (1 - walk), run * 0.12);
  const bob = -(0.03 * walk + 0.03 * run) * Math.abs(Math.sin(phi)) + run * 0.02 * Math.abs(Math.cos(phi));
  // Idle weight shift.
  const shift = (1 - walk) * Math.sin(t * 0.5) * 0.02;
  p.root(0, bob, shift);
  p.add("hips", (1 - walk) * Math.sin(t * 0.5) * 0.03, 0, 0);
}

function kneelLegs(p: PoseVec) {
  const drop = -(0.92 - (0.07 + THIGH));
  p.root(0, drop, 0);
  p.set("thighL", 0.08, 0, 0.05).set("thighR", -0.08, 0, 0.05);
  p.set("shinL", 0, 0, -Math.PI / 2).set("shinR", 0, 0, -Math.PI / 2);
  p.set("footL", 0, 0, -Math.PI / 2 + 0.2).set("footR", 0, 0, -Math.PI / 2 + 0.2);
}

function cuffArms(p: PoseVec) {
  p.set("armL", -0.32, 0.3, -0.5).set("armR", 0.32, -0.3, -0.5);
  p.set("foreL", 0, 0, 0.75).set("foreR", 0, 0, 0.75);
  p.set("handL", 0.3, 0, 0).set("handR", -0.3, 0, 0);
}

function lying(p: PoseVec, faceDown: boolean) {
  p.set("root", 0, 0, faceDown ? -Math.PI / 2 : Math.PI / 2);
  // Keep the body centred on the person's position (the root pivots at the feet).
  p.root(faceDown ? -0.88 : 0.88, faceDown ? 0.13 : 0.11, 0);
}

function target(pose: Pose, step: number, speed: number, t: number, seed: number) {
  const p = new PoseVec();
  switch (pose) {
    case "walk":
    case "stand":
      locomotion(p, step, pose === "stand" ? 0 : speed, t + seed);
      break;
    case "talk": {
      locomotion(p, 0, 0, t + seed);
      const g = t * 2.1 + seed;
      p.set("armR", -0.15, 0.2, 0.45 + Math.sin(g) * 0.25).set("foreR", 0, 0.4, 1.2 + Math.sin(g * 1.4) * 0.35);
      p.set("armL", 0.12, -0.1, 0.18 + Math.sin(g * 0.7) * 0.12).set("foreL", 0, -0.3, 0.8 + Math.sin(g * 1.1) * 0.2);
      p.set("head", 0.03 * Math.sin(g * 0.5), 0.12 * Math.sin(g * 0.3), 0.06 * Math.sin(g * 1.7));
      break;
    }
    case "handsup":
      locomotion(p, 0, 0, t + seed);
      p.set("armL", 0.45, 0.15, 2.75).set("armR", -0.45, -0.15, 2.75);
      p.set("foreL", 0, 0, 0.35).set("foreR", 0, 0, 0.35);
      p.set("head", 0, 0, 0.08);
      break;
    case "kneel":
      kneelLegs(p);
      p.set("armL", 1.1, 0.2, 2.3).set("armR", -1.1, -0.2, 2.3);
      p.set("foreL", 0, 0, 2.4).set("foreR", 0, 0, 2.4);
      p.set("head", 0, 0, -0.18);
      p.set("chest", 0, 0, 0.03 + Math.sin(t * 1.6) * 0.012);
      break;
    case "cuffed":
      locomotion(p, step, speed * 0.8, t + seed);
      cuffArms(p);
      p.set("head", 0, 0, -0.15);
      break;
    case "cuffedKneel":
      kneelLegs(p);
      cuffArms(p);
      p.set("head", 0, 0, -0.2);
      break;
    case "prone":
      lying(p, true);
      p.set("armL", 1.45, 0, 0.35).set("armR", -1.45, 0, 0.35);
      p.set("foreL", 0, 0, 0.25).set("foreR", 0, 0, 0.25);
      p.set("thighL", 0.14, 0, 0).set("thighR", -0.14, 0, 0);
      p.set("footL", 0, 0, -0.9).set("footR", 0, 0, -0.9);
      p.set("head", 0, 1.1, 0.25);
      break;
    case "down":
    case "dead":
    case "tased": {
      lying(p, false);
      if (pose === "tased") {
        // Locked-up muscles: limbs rigid, trembling.
        const j = () => (Math.sin(t * 61 + Math.random() * 6) * 0.06);
        p.set("armL", 0.25 + j(), 0, 0.2 + j()).set("armR", -0.25 + j(), 0, 0.2 + j());
        p.set("foreL", 0, 0, 1.2 + j()).set("foreR", 0, 0, 1.2 + j());
        p.set("thighL", j(), 0, j()).set("thighR", j(), 0, j());
        p.set("head", j(), 0, -0.3 + j());
        p.set("chest", 0, 0, j());
      } else {
        const d = pose === "dead" ? 1 : 0.6;
        p.set("armL", 0.9 * d, 0.2, 0.3).set("armR", -0.5 * d, -0.3, 0.8 * d);
        p.set("foreL", 0, 0, 0.4).set("foreR", 0, 0, 0.9 * d);
        p.set("thighL", 0.18, 0, 0.35 * d).set("shinL", 0, 0, -0.7 * d);
        p.set("thighR", -0.12, 0, 0).set("footR", 0, -0.4, 0);
        p.set("head", 0, pose === "dead" ? 0.9 : 0.4 + Math.sin(t * 0.8) * 0.2, 0);
        if (pose === "down") p.add("chest", 0, 0, Math.sin(t * 2.4) * 0.025);
      }
      break;
    }
    case "aim":
      locomotion(p, step, speed, t + seed);
      // Two-handed isosceles stance: right arm locked out, left hand cupping it.
      p.set("armR", 0.28, 0, 1.5).set("foreR", 0, 0, 0.04).set("handR", 0, 0, -0.05);
      p.set("armL", -0.62, 0.1, 1.42).set("foreL", 0, 0.3, 0.42).set("handL", 0, 0, -0.1);
      p.set("chest", 0, -0.08, -0.06).set("head", 0, 0.05, -0.06);
      if (speed < 0.3) p.set("thighL", 0.05, 0, 0.18).set("shinL", 0, 0, -0.2).set("thighR", -0.05, 0, -0.1).set("shinR", 0, 0, -0.12);
      break;
    case "fight": {
      locomotion(p, step, speed, t + seed);
      p.set("thighL", 0.1, 0, 0.2).set("shinL", 0, 0, -0.3).set("thighR", -0.1, 0, -0.1).set("shinR", 0, 0, -0.3);
      p.root(0, -0.05 + Math.abs(Math.sin(t * 4)) * 0.03, 0);
      const cyc = (t * 1.4 + seed) % 2;
      const jabL = cyc < 0.18;
      const jabR = cyc > 1 && cyc < 1.18;
      p.set("armL", -0.25, 0, jabL ? 1.5 : 0.95).set("foreL", 0, 0, jabL ? 0.1 : 2.0);
      p.set("armR", 0.25, 0, jabR ? 1.5 : 0.85).set("foreR", 0, 0, jabR ? 0.1 : 2.1);
      p.set("chest", 0, jabR ? -0.35 : jabL ? 0.25 : 0, -0.12).set("head", 0, 0, -0.1);
      break;
    }
    case "radio":
      locomotion(p, step, speed, t + seed);
      p.set("armL", -0.35, 0.3, 0.55).set("foreL", 0, 0.5, 2.35);
      p.set("head", 0.18, -0.35, -0.08);
      break;
    case "phone":
      locomotion(p, step, speed, t + seed);
      p.set("armR", 0.35, -0.35, 0.3).set("foreR", 0, -0.5, 2.55);
      p.set("head", -0.1, 0.1, -0.05);
      break;
    case "point":
      locomotion(p, 0, 0, t + seed);
      p.set("armR", 0.15, 0, 1.45).set("foreR", 0, 0, 0.05);
      break;
    case "search":
      locomotion(p, 0, 0, t + seed);
      p.set("chest", 0, 0, -0.32).set("spine", 0, 0, -0.15);
      p.set("armL", 0.2, 0, 0.9 + Math.sin(t * 3) * 0.2).set("foreL", 0, 0, 0.6);
      p.set("armR", -0.2, 0, 0.9 + Math.cos(t * 3) * 0.2).set("foreR", 0, 0, 0.6);
      p.set("thighL", 0, 0, 0.2).set("shinL", 0, 0, -0.35).set("thighR", 0, 0, 0.2).set("shinR", 0, 0, -0.35);
      p.root(0, -0.07, 0);
      break;
    case "panic": {
      locomotion(p, step, speed, t + seed);
      const f = Math.sin(step * 2.2);
      p.set("armL", 0.6, 0, 2.3 + f * 0.4).set("foreL", 0, 0, 1.0 + f * 0.4);
      p.set("armR", -0.6, 0, 2.3 - f * 0.4).set("foreR", 0, 0, 1.0 - f * 0.4);
      break;
    }
    case "drive":
      p.root(0, -0.44, 0);
      p.set("thighL", 0.08, 0, Math.PI / 2).set("thighR", -0.08, 0, Math.PI / 2);
      p.set("shinL", 0, 0, -Math.PI / 2).set("shinR", 0, 0, -Math.PI / 2);
      p.set("armL", 0.1, 0, 1.0).set("armR", -0.1, 0, 1.0).set("foreL", 0, 0, 0.9).set("foreR", 0, 0, 0.9);
      break;
  }
  return p.v;
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * Animate a person. `step` is the walk-cycle phase (metres walked), `speed` in
 * m/s, `t` a clock for idles; switching pose blends over a quarter second.
 */
export function posePed(m: PedModel, pose: Pose, step: number, speed: number, t = 0, dt = 1 / 30) {
  const a = m.anim;
  const seed = m.mesh.id * 0.37;
  const tgt = target(pose, step, speed, t, seed);
  const fam = (q: Pose | "") => (q === "walk" || q === "stand" ? "move" : q);
  if (a.pose !== pose) {
    if (a.pose && fam(a.pose) !== fam(pose)) {
      a.from.set(a.cur);
      a.blend = 0;
    }
    a.pose = pose;
  }
  a.blend = Math.min(1, a.blend + dt / 0.28);
  const k = smooth(a.blend);
  for (let i = 0; i < LEN; i++) a.cur[i] = k >= 1 ? tgt[i] : a.from[i] + (tgt[i] - a.from[i]) * k;
  const c = a.cur;
  for (let b = 0; b < N; b++) m.bones[b].rotation.set(c[b * 3], c[b * 3 + 1], c[b * 3 + 2]);
  const r = m.bones[0];
  r.position.set(c[N * 3], c[N * 3 + 1], c[N * 3 + 2]);
}
