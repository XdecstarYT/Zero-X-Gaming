import * as THREE from "three";
import { makeWeapon } from "../items";
import { Character } from "./character";
import { buildGun } from "./guns";

/**
 * Studio "product shots" of cosmetics, rendered once each by a single shared
 * offscreen WebGL renderer and returned as PNG data URLs. Renders are queued
 * one at a time with a pause between them, so pages stay responsive.
 */

const SIZE = 256;
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

function setup() {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#e6eeff", "#3a3228", 1.2));
  const key = new THREE.DirectionalLight("#fff1dc", 2.8);
  key.position.set(2.5, 3.5, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#9fc4ff", 2.2);
  rim.position.set(-3, 2, -2.5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight("#ffd9b0", 0.6);
  fill.position.set(-2, 0.5, 3);
  scene.add(fill);
  return renderer;
}

const idle = () => new Promise<void>((r) => setTimeout(r, 30));

function shoot(kind: "outfit" | "wrap", item: string): string {
  const r = setup();
  let subject: THREE.Object3D;
  const camera = new THREE.PerspectiveCamera(kind === "outfit" ? 26 : 30, 1, 0.05, 20);
  if (kind === "outfit") {
    const ch = new Character(item, "factory");
    ch.setItem(makeWeapon("ar", "legendary"));
    ch.root.rotation.y = -Math.PI / 2 + 0.5;
    ch.update({ speed: 0, aiming: false, firedAgo: 9, hurtAgo: 9, alive: true, deadAgo: 0, using: false }, 0.016);
    subject = ch.root;
    camera.position.set(0.25, 1.05, 4.3);
    camera.lookAt(0, 0.93, 0);
  } else {
    const gun = buildGun("ar", "legendary", item).group;
    gun.rotation.set(0.05, 0.45, 0.14);
    subject = new THREE.Group().add(gun);
    camera.position.set(0.1, 0.12, 1.55);
    camera.lookAt(0.1, 0, 0);
  }
  scene.add(subject);
  r.render(scene, camera);
  const url = r.domElement.toDataURL("image/png");
  scene.remove(subject);
  return url;
}

/** A transparent PNG data URL of the item. Cached; renders are serialised. */
export function renderThumb(kind: "outfit" | "wrap", item: string): Promise<string> {
  const key = `${kind}:${item}`;
  let p = cache.get(key);
  if (!p) {
    p = queue.then(idle).then(() => shoot(kind, item));
    queue = p.catch(() => {});
    cache.set(key, p);
  }
  return p;
}
