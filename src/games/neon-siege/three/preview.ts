import * as THREE from "three";
import { makeWeapon } from "../items";
import { Character } from "./character";

/**
 * Turntable preview of a character in an outfit holding a wrapped rifle,
 * for the Locker. Drag to spin. Pauses rendering when offscreen.
 */
export interface Preview {
  setOutfit(id: string): void;
  setWrap(id: string): void;
  destroy(): void;
}

export function createPreview(host: HTMLElement, opts: { reduceMotion?: boolean } = {}): Preview {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.25, 4.6);
  camera.lookAt(0, 0.95, 0);

  scene.add(new THREE.HemisphereLight("#dfe8ff", "#3a3228", 1.1));
  const key = new THREE.DirectionalLight("#fff1dc", 2.6);
  key.position.set(2.5, 4, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#9fc4ff", 1.6);
  rim.position.set(-3, 2.5, -3);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.3, 48),
    new THREE.MeshStandardMaterial({ color: "#2a2d33", roughness: 0.8, transparent: true, opacity: 0.85 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  let wrap = "factory";
  const character = new Character("recruit", wrap);
  character.setItem(makeWeapon("ar", "legendary"));
  character.root.traverse((o) => (o.castShadow = true));
  scene.add(character.root);

  let yaw = -Math.PI / 2 + 0.5; // three-quarter view, facing the camera
  let drag: { x: number; yaw: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, yaw };
    canvas.style.cursor = "grabbing";
  });
  const up = () => {
    drag = null;
    canvas.style.cursor = "grab";
  };
  window.addEventListener("pointerup", up);
  const move = (e: PointerEvent) => {
    if (drag) yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
  };
  window.addEventListener("pointermove", move);

  const resize = () => {
    const r = host.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = Math.max(1, r.width) / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  let visible = true;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(host);

  let raf = 0;
  let last = performance.now();
  let t = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible) return;
    t += dt;
    if (!drag && !opts.reduceMotion) yaw += dt * 0.35;
    character.root.rotation.y = yaw;
    character.update({ speed: 0, aiming: false, firedAgo: 9, hurtAgo: 9, alive: true, deadAgo: 0, using: false }, dt);
    // Idle breathing
    character.root.position.y = opts.reduceMotion ? 0 : Math.sin(t * 1.6) * 0.004;
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    setOutfit(id) {
      character.setOutfit(id);
      character.root.traverse((o) => (o.castShadow = true));
    },
    setWrap(id) {
      if (id === wrap) return;
      wrap = id;
      character.setWrap(id);
      character.setItem(makeWeapon("ar", "legendary"));
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointermove", move);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
