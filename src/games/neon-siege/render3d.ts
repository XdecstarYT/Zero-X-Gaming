import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { outfitOf, wrapOf } from "./cosmetics";
import { RARITY, weaponDef, type Item } from "./items";
import type { GameMap } from "./map";
import { activeItem, activeWeapon, DRAW_TIME, type Entity, type World } from "./world";
import { Character } from "./three/character";
import { buildConsumable, buildGun, type GunModel } from "./three/guns";
import { buildFront, type FrontScene } from "./three/front";
import { buildMillsBomb, buildSpade, buildVickers } from "./three/guns";
import { cloudTexture, flashTexture, glowTexture, puffTexture, stormTexture } from "./three/textures";
import { buildTown } from "./three/town";
import { FOV_DEG, zoomFor, type ViewFx, type ViewRenderer } from "./view";
import type { Marker } from "./mode";

/** Seconds the fallen stay on the ground (Trenches medics can revive them meanwhile). */
const BODY_SECONDS = 11;

/**
 * The realistic three.js view: sunlit town with PBR materials, soft shadows,
 * atmospheric sky and fog, animated characters, a first-person weapon, muzzle
 * flashes, tracers, impact sparks and the storm wall.
 */

const EYE = 1.62;
/** Eye height per stance: standing, crouched, prone. */
const STANCE_EYE = [EYE, 1.0, 0.36];
const TRACER_LIFE = 0.09;
const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(145));
const SUN_OFFSET = SUN_DIR.clone().multiplyScalar(70);

export interface ThreeViewOptions {
  quality: "high" | "low";
  wrap: string;
}

interface Fx {
  sprite: THREE.Sprite;
  until: number;
  born: number;
  grow: number;
}

export class ThreeView implements ViewRenderer {
  readonly kind = "3d" as const;
  readonly quality: "high" | "low";
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV_DEG, 16 / 9, 0.05, 1500);
  private vmScene = new THREE.Scene();
  private vmCamera = new THREE.PerspectiveCamera(55, 16 / 9, 0.01, 10);
  private sun = new THREE.DirectionalLight("#fff0d8", 2.8);
  private flashLight = new THREE.PointLight("#ffc46b", 0, 9, 2);
  private ro: ResizeObserver;
  private map: GameMap | null = null;
  private town: THREE.Group | null = null;
  private wind: { value: number } = { value: 0 };
  private composer: EffectComposer | null = null;
  private clouds: THREE.Mesh;
  private blobs = new Map<string, THREE.Mesh>();
  private blobGeo = new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2);
  private blobMat: THREE.MeshBasicMaterial;
  private characters = new Map<string, Character>();
  private nameTags = new Map<string, THREE.Sprite>();
  private loot = new Map<string, THREE.Group>();
  private chests = new Map<string, { lid: THREE.Group }>();
  private tracers: { mesh: THREE.Mesh; until: number }[] = [];
  private tracerPool: THREE.Mesh[] = [];
  private fx: Fx[] = [];
  private fxPool: THREE.Sprite[] = [];
  private seenTracers = new WeakSet<object>();
  private storm: THREE.Mesh;
  private stormTex: THREE.Texture;
  private fogBase = new THREE.Color("#c3d3df");
  private sky!: Sky;
  private hemi!: THREE.HemisphereLight;
  private sunOffset = SUN_OFFSET.clone();
  private war = false;
  /** Trenches: the chunked battlefield (trench pits, digging). */
  private front: FrontScene | null = null;
  private dugSeen = 0;
  /** Smoothed camera / character heights (stepping into a trench, changing stance). */
  private eyeY = EYE;
  private charY = new Map<string, number>();
  /** Viewmodel animation state: sprint lowering, the hand props for throwing and digging. */
  private sprintK = 0;
  private vmBomb: THREE.Group | null = null;
  private vmSpade: THREE.Group | null = null;
  /** Trenches explosives: grenades in flight, dirt sprays and scorch marks. */
  private nades = new Map<string, THREE.Mesh>();
  private nadeGeo = new THREE.CapsuleGeometry(0.045, 0.07, 3, 8);
  private nadeMat = new THREE.MeshStandardMaterial({ color: "#3d4630", roughness: 0.6, metalness: 0.3 });
  private seenBlasts = new Set<string>();
  private dirt: { pts: THREE.Points; vel: Float32Array; born: number; floor: number }[] = [];
  private scorches: THREE.Mesh[] = [];
  private scorchMat = new THREE.MeshBasicMaterial({ color: "#1c1712", transparent: true, opacity: 0.7, depthWrite: false });
  private weather: { obj: THREE.Points | THREE.LineSegments; pos: Float32Array; kind: "rain" | "snow" | "dust" } | null = null;
  private flags = new Map<string, { group: THREE.Group; cloth: THREE.Mesh; ring: THREE.Mesh }>();
  /** Trenches: emplaced Vickers guns and drifting gas. */
  private guns = new Map<string, THREE.Group>();
  private gas = new Map<string, THREE.Sprite[]>();
  private puff: THREE.Texture | null = null;
  private crates = new Map<string, THREE.Group>();
  private artillery: { sprite: THREE.Sprite; born: number } | null = null;
  private nextShell = 4;
  private fogStorm = new THREE.Color("#5b3a8f");
  private glow = glowTexture();
  private flashTex = flashTexture();
  private wrap: string;
  // Viewmodel
  private vm = new THREE.Group();
  private vmGun: GunModel | null = null;
  private vmItem: THREE.Group | null = null;
  private vmKey = "";
  private vmArms: THREE.Mesh[] = [];
  private vmArmMat = new THREE.MeshStandardMaterial({ color: "#555", roughness: 0.85 });
  private vmGloveMat = new THREE.MeshStandardMaterial({ color: "#333", roughness: 0.7 });
  private vmFlash: THREE.Sprite;
  private lastAngle = 0;
  private sway = 0;
  private drawnAt = -10;
  private lastActive = -1;
  private lastTime = 0;

  constructor(host: HTMLElement, opts: ThreeViewOptions) {
    this.quality = opts.quality;
    this.wrap = opts.wrap;
    const high = opts.quality === "high";
    this.renderer = new THREE.WebGLRenderer({ antialias: high, powerPreference: "high-performance", stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.62;
    this.renderer.shadowMap.enabled = high;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;
    this.canvas = this.renderer.domElement;
    this.canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none";
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "Neon Siege first-person view");
    this.canvas.tabIndex = -1;
    host.appendChild(this.canvas);
    const resize = () => {
      const r = host.getBoundingClientRect();
      const w = Math.max(1, r.width);
      const h = Math.max(1, r.height);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.vmCamera.aspect = w / h;
      this.vmCamera.updateProjectionMatrix();
      this.composer?.setSize(w, h);
    };
    resize();
    this.ro = new ResizeObserver(resize);
    this.ro.observe(host);

    // Sky, sun, ambient.
    const sky = new Sky();
    this.sky = sky;
    sky.scale.setScalar(1200);
    const u = sky.material.uniforms;
    u.turbidity.value = 5;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.82;
    const sunDir = SUN_DIR;
    u.sunPosition.value.copy(sunDir);
    this.scene.add(sky);
    // Image-based ambient light from the sky (subtle reflections on glass/metal).
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(sky.clone());
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environmentIntensity = 0.18;
    pmrem.dispose();

    this.hemi = new THREE.HemisphereLight("#cfe3ff", "#4d5a37", 0.7);
    this.scene.add(this.hemi);
    this.sun.position.copy(sunDir).multiplyScalar(60);
    this.sun.castShadow = high;
    if (high) {
      this.sun.shadow.mapSize.set(4096, 4096);
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -30;
      c.right = c.top = 30;
      c.near = 1;
      c.far = 160;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.03;
    }
    this.scene.add(this.sun, this.sun.target, this.flashLight);
    this.scene.fog = new THREE.Fog(this.fogBase.clone(), high ? 40 : 28, high ? 150 : 90);

    // Drifting cumulus layer on a dome that follows the camera.
    const cloudTex = cloudTexture(high ? 1024 : 512, high ? 256 : 128);
    cloudTex.repeat.set(3, 1);
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(900, 48, 12, 0, Math.PI * 2, 0, Math.PI / 2.15),
      new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.clouds.renderOrder = -1;
    this.scene.add(this.clouds);

    // Soft contact shadows under fighters when real shadows are off (Low).
    this.blobMat = new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.32, depthWrite: false, map: glowTexture() });

    // High: ambient occlusion, a filmic grade, SMAA.
    if (high) {
      const r = host.getBoundingClientRect();
      const w = Math.max(1, r.width);
      const h = Math.max(1, r.height);
      const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const ao = new GTAOPass(this.scene, this.camera, w, h);
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1 });
      ao.blendIntensity = 0.9;
      this.composer.addPass(ao);
      this.composer.addPass(new OutputPass());
      this.composer.addPass(new ShaderPass(GRADE_SHADER));
      this.composer.addPass(new SMAAPass());
    }

    // Storm wall.
    this.stormTex = stormTexture();
    this.stormTex.repeat.set(8, 1);
    this.storm = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 96, 1, true),
      new THREE.MeshBasicMaterial({
        map: this.stormTex,
        color: "#6f5a92",
        transparent: true,
        alphaMap: fadeUpTexture(),
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.storm.visible = false;
    this.scene.add(this.storm);

    // Viewmodel scene has its own light rig so the gun reads well anywhere.
    this.vmScene.add(new THREE.HemisphereLight("#dfeaff", "#5b5040", 0.9));
    const key = new THREE.DirectionalLight("#fff2e0", 1.8);
    key.position.set(1, 2, 1.5);
    this.vmScene.add(key);
    this.vmScene.environment = this.scene.environment;
    this.vmScene.environmentIntensity = 0.22;
    this.vmScene.add(this.vm);
    for (let i = 0; i < 2; i++) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 1, 4, 10), this.vmArmMat);
      const glove = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.1), this.vmGloveMat);
      arm.add(glove);
      glove.position.y = 0.5;
      this.vmArms.push(arm);
      this.vm.add(arm);
    }
    this.vmFlash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.flashTex, color: "#ffd9a0", blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    this.vmFlash.visible = false;
    this.vmScene.add(this.vmFlash);
  }

  destroy() {
    this.ro.disconnect();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  // ------------------------------------------------------------ building

  private buildWorld(world: World) {
    if (this.town) this.scene.remove(this.town);
    this.map = world.map;
    const opts = { shadows: this.quality === "high", detail: this.quality } as const;
    for (const sc of this.scorches) {
      sc.geometry.dispose();
      sc.removeFromParent();
    }
    this.scorches = [];
    this.front = world.map.front ? buildFront(world.map, opts) : null;
    const built = this.front ?? buildTown(world.map, opts);
    this.dugSeen = world.map.dug?.length ?? 0;
    this.charY.clear();
    this.town = built.root;
    this.wind = built.time;
    this.scene.add(this.town);
    this.applyTheme(world.map.theme === "battlefield", world);
    for (const g of this.loot.values()) this.scene.remove(g);
    this.loot.clear();
    for (const c of this.chests.values()) this.scene.remove(c.lid.parent!);
    this.chests.clear();
    for (const c of world.chests) {
      const g = new THREE.Group();
      g.position.set(c.x, 0, c.y);
      g.rotation.y = ((c.x * 7 + c.y * 3) % 4) * (Math.PI / 2);
      const woodM = new THREE.MeshStandardMaterial({ color: "#6b4424", roughness: 0.7 });
      const goldM = new THREE.MeshStandardMaterial({ color: "#e0b43c", metalness: 0.9, roughness: 0.3, emissive: "#6b4a00", emissiveIntensity: 0.15 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.38, 0.45), woodM);
      base.position.y = 0.19;
      base.castShadow = true;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.47), goldM);
      band.position.y = 0.33;
      const lid = new THREE.Group();
      lid.position.set(0, 0.38, -0.225);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.7, 12, 1, false, 0, Math.PI), woodM);
      top.rotation.z = Math.PI / 2;
      top.position.z = 0.225;
      top.castShadow = true;
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.04), goldM);
      lock.position.set(0, 0.02, 0.46);
      lid.add(top, lock);
      g.add(base, band, lid);
      this.scene.add(g);
      this.chests.set(c.id, { lid });
    }
  }

  private lootModel(item: Item) {
    const g = new THREE.Group();
    const model = new THREE.Group();
    if (item.type === "weapon") {
      const gun = buildGun(item.kind, item.rarity, "factory");
      gun.group.scale.setScalar(1.25);
      model.add(gun.group);
    } else {
      const c = buildConsumable(item.kind);
      c.scale.setScalar(1.6);
      model.add(c);
    }
    model.position.y = 0.45;
    model.name = "model";
    g.add(model);
    return g;
  }

  // ---------------------------------------------------------------- frame

  render(world: World, me: Entity, fx: ViewFx) {
    if (world.map !== this.map) this.buildWorld(world);
    const t = world.time;
    const dt = Math.max(0, Math.min(0.1, t - this.lastTime));
    this.lastTime = t;

    // Camera
    const w = activeWeapon(me);
    const zoom = zoomFor(w ? weaponDef(w).zoom : 1, fx.ads);
    const fov = (2 * Math.atan(Math.tan((FOV_DEG * Math.PI) / 360) / zoom) * 180) / Math.PI;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const bobAmt = fx.reduceMotion ? 0 : Math.min(1, me.speed / 3.4) * (1 - fx.ads * 0.8);
    const deadK = me.alive ? 0 : Math.min(1, (t - me.hurtAt) / 0.8);
    const dug = world.map.dug;
    if (this.front && dug) while (this.dugSeen < dug.length) this.front.dig(dug[this.dugSeen++]);
    // Eye height follows the terrain (down into trenches) and stance.
    const floor = this.front?.floorAt(me.x, me.y) ?? 0;
    // On an emplaced gun you stand on the fire step, eyes over the parapet.
    const eyeTarget = floor + STANCE_EYE[me.stance ?? 0] + (me.mounted ? 0.75 : 0);
    this.eyeY += (eyeTarget - this.eyeY) * Math.min(1, dt * 9);
    this.camera.position.set(me.x, this.eyeY + Math.sin(fx.bob * 2) * 0.035 * bobAmt - deadK * Math.min(1.2, this.eyeY - floor - 0.25), me.y);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(-deadK * 0.3, -me.angle - Math.PI / 2, deadK * 0.5 + Math.sin(fx.bob) * 0.004 * bobAmt);
    const shake = fx.shake ?? 0;
    if (shake > 0.01) {
      this.camera.position.x += (Math.random() - 0.5) * 0.14 * shake;
      this.camera.position.y += (Math.random() - 0.5) * 0.1 * shake;
      this.camera.rotation.z += (Math.random() - 0.5) * 0.03 * shake;
    }

    // Sun shadow follows the player.
    const sd = this.sunOffset;
    this.sun.position.set(me.x + sd.x, sd.y, me.y + sd.z);
    this.sun.target.position.set(me.x, 0, me.y);

    this.syncCharacters(world, me, fx, dt);
    this.syncLoot(world, t);
    for (const c of world.chests) {
      const ch = this.chests.get(c.id);
      if (!ch) continue;
      ch.lid.rotation.x += ((c.opened ? -1.9 : 0) - ch.lid.rotation.x) * Math.min(1, dt * 8);
    }
    this.syncTracers(world, me, fx, t);
    this.updateStorm(fx, me, t);
    this.updateFlags(fx.markers ?? [], t);
    this.updateGuns(fx.markers ?? []);
    this.updateGas(fx, t, dt);
    if (this.war) this.updateBattle(me, t);
    this.updateWeather(dt);
    this.updateExplosives(fx, t, dt);
    this.updateViewmodel(world, me, fx, t, dt);

    this.wind.value = t;
    this.clouds.position.set(me.x, -40, me.y);
    this.clouds.rotation.y = t * 0.002;

    this.renderer.clear();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    if (this.vm.visible) {
      this.renderer.clearDepth();
      this.renderer.render(this.vmScene, this.vmCamera);
    }
  }

  private syncCharacters(world: World, me: Entity, fx: ViewFx, dt: number) {
    const t = world.time;
    for (const [id, ch] of this.characters) {
      const e = world.entities.get(id);
      if (!e || (!e.alive && t - e.hurtAt > BODY_SECONDS)) {
        ch.dispose();
        this.characters.delete(id);
        this.nameTags.get(id)?.removeFromParent();
        this.nameTags.delete(id);
        this.blobs.get(id)?.removeFromParent();
        this.blobs.delete(id);
      }
    }
    for (const e of world.entities.values()) {
      if (e.id === me.id) continue;
      if (!e.alive && t - e.hurtAt > BODY_SECONDS) continue;
      let ch = this.characters.get(e.id);
      if (!ch) {
        ch = new Character(e.outfit, e.kind === "human" ? "factory" : ["factory", "woodland", "sandstorm", "carbon"][e.id.length % 4]);
        ch.root.traverse((o) => (o.castShadow = this.quality === "high"));
        this.characters.set(e.id, ch);
        this.scene.add(ch.root);
      }
      ch.setOutfit(e.outfit);
      ch.setItem(activeItem(e));
      ch.setMask((e.masked ?? 0) > 0.5 && e.alive);
      const fy = this.front?.floorAt(e.x, e.y) ?? 0;
      const cy = (this.charY.get(e.id) ?? fy) + (fy - (this.charY.get(e.id) ?? fy)) * Math.min(1, dt * 9);
      this.charY.set(e.id, cy);
      ch.root.position.set(e.x, cy, e.y);
      ch.root.rotation.y = -e.angle;
      if (this.quality !== "high") {
        let blob = this.blobs.get(e.id);
        if (!blob) {
          blob = new THREE.Mesh(this.blobGeo, this.blobMat);
          blob.renderOrder = 1;
          this.blobs.set(e.id, blob);
          this.scene.add(blob);
        }
        blob.position.set(e.x, cy + 0.03, e.y);
        blob.visible = e.alive;
      }
      ch.update(
        {
          speed: e.speed,
          aiming: e.aiming,
          firedAgo: t - e.firedAt,
          hurtAgo: t - e.hurtAt,
          alive: e.alive,
          deadAgo: t - e.hurtAt,
          using: !!e.using,
          stance: e.stance ?? 0,
        },
        dt,
      );
      if (fx.showNames) {
        const color = fx.tagColor?.(e.id) ?? "#ffffff";
        let tag = this.nameTags.get(e.id);
        if (!tag || tag.userData.color !== color || tag.userData.name !== e.name) {
          tag?.removeFromParent();
          tag = nameSprite(e.name, color);
          this.nameTags.set(e.id, tag);
          this.scene.add(tag);
        }
        tag.position.set(e.x, cy + [2.15, 1.55, 0.75][e.stance ?? 0], e.y);
        // Team games: teammates always tagged, enemies only up close.
        const enemy = e.team !== me.team;
        tag.visible = e.alive && (!fx.tagColor || !enemy || Math.hypot(e.x - me.x, e.y - me.y) < 14);
      }
    }
  }

  private syncLoot(world: World, t: number) {
    for (const [id, g] of this.loot) {
      if (!world.loot.has(id)) {
        this.scene.remove(g);
        this.loot.delete(id);
      }
    }
    for (const drop of world.loot.values()) {
      let g = this.loot.get(drop.id);
      if (!g) {
        g = this.lootModel(drop.item);
        g.position.set(drop.x, 0, drop.y);
        this.loot.set(drop.id, g);
        this.scene.add(g);
      }
      const model = g.getObjectByName("model")!;
      model.rotation.y = t * 1.2 + drop.x;
      model.position.y = 0.42 + Math.sin(t * 2 + drop.y) * 0.05;
    }
  }

  private takeSprite(tex: THREE.Texture, color: string, blending: THREE.Blending) {
    const s =
      this.fxPool.pop() ??
      new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    const m = s.material as THREE.SpriteMaterial;
    m.map = tex;
    m.color.set(color);
    m.blending = blending;
    m.opacity = 1;
    m.needsUpdate = true;
    s.visible = true;
    this.scene.add(s);
    return s;
  }

  private syncTracers(world: World, me: Entity, fx: ViewFx, t: number) {
    const muzzle = new THREE.Vector3();
    for (const tr of fx.tracers) {
      if (this.seenTracers.has(tr)) continue;
      this.seenTracers.add(tr);
      const mine = tr.shooter === me.id;
      if (mine) {
        // From the viewmodel muzzle, projected into the world.
        muzzle.set(0.18, -0.12, -0.6).applyQuaternion(this.camera.quaternion).add(this.camera.position);
      } else {
        const ch = this.characters.get(tr.shooter);
        if (ch) ch.muzzleWorld(muzzle);
        else muzzle.set(tr.fromX, 1.4, tr.fromY);
        // Third-person muzzle flash
        const f = this.takeSprite(this.flashTex, "#ffd9a0", THREE.AdditiveBlending);
        f.position.copy(muzzle);
        const s = tr.weapon === "shotgun" || tr.weapon === "sniper" ? 0.9 : 0.6;
        f.scale.set(s, s, 1);
        f.material.rotation = Math.random() * Math.PI;
        this.fx.push({ sprite: f, born: t, until: t + 0.05, grow: 0 });
      }
      const end = new THREE.Vector3(tr.toX, tr.hit ? 1.25 : 0.9 + Math.random() * 1.1, tr.toY);
      // Tracer streak (not every bullet, like real tracer rounds).
      if (mine || Math.random() < 0.6) {
        const mesh =
          this.tracerPool.pop() ??
          new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshBasicMaterial({ color: "#ffe6a8", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
          );
        const len = muzzle.distanceTo(end);
        mesh.position.copy(muzzle).lerp(end, 0.5);
        mesh.lookAt(end);
        mesh.scale.set(0.012, 0.012, len);
        mesh.visible = true;
        this.scene.add(mesh);
        this.tracers.push({ mesh, until: t + TRACER_LIFE });
      }
      // Impact: bright sparks on a hit, a dust puff on walls/ground.
      const imp = this.takeSprite(this.glow, tr.hit ? "#ffcf7a" : "#b8ad98", tr.hit ? THREE.AdditiveBlending : THREE.NormalBlending);
      imp.position.copy(end);
      imp.scale.set(0.25, 0.25, 1);
      this.fx.push({ sprite: imp, born: t, until: t + (tr.hit ? 0.12 : 0.35), grow: tr.hit ? 1.5 : 1.8 });
      if (mine || muzzle.distanceTo(this.camera.position) < 12) {
        this.flashLight.position.copy(muzzle);
        this.flashLight.intensity = mine ? 6 : 3;
      }
    }
    this.flashLight.intensity *= 0.6;
    this.tracers = this.tracers.filter((tr) => {
      if (t < tr.until) {
        (tr.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * ((tr.until - t) / TRACER_LIFE);
        return true;
      }
      tr.mesh.visible = false;
      this.scene.remove(tr.mesh);
      this.tracerPool.push(tr.mesh);
      return false;
    });
    this.fx = this.fx.filter((f) => {
      if (t < f.until) {
        const k = (t - f.born) / (f.until - f.born);
        (f.sprite.material as THREE.SpriteMaterial).opacity = 1 - k;
        if (f.grow) f.sprite.scale.setScalar(0.25 + k * f.grow * 0.4);
        return true;
      }
      f.sprite.visible = false;
      this.scene.remove(f.sprite);
      this.fxPool.push(f.sprite);
      return false;
    });
  }

  /** Grenades in flight; each new blast gets a flash, a light pulse, a dirt spray and a scorch mark. */
  private updateExplosives(fx: ViewFx, t: number, dt: number) {
    const e = fx.effects;
    const live = new Set<string>();
    for (const p of e?.projectiles ?? []) {
      live.add(p.id);
      let m = this.nades.get(p.id);
      if (!m) {
        m = new THREE.Mesh(this.nadeGeo, this.nadeMat);
        m.castShadow = this.quality === "high";
        this.nades.set(p.id, m);
        this.scene.add(m);
      }
      m.position.set(p.x, p.z + 0.06, p.y);
      m.rotation.x += dt * 9;
    }
    for (const [id, m] of this.nades)
      if (!live.has(id)) {
        m.removeFromParent();
        this.nades.delete(id);
      }

    for (const b of e?.blasts ?? []) {
      if (this.seenBlasts.has(b.id) || t - b.at > 0.5) continue;
      this.seenBlasts.add(b.id);
      if (this.seenBlasts.size > 300) this.seenBlasts = new Set([...this.seenBlasts].slice(-100));
      const floor = this.front?.floorAt(b.x, b.y) ?? 0;
      const flash = this.takeSprite(this.glow, b.big ? "#ffc27a" : "#ffd9a0", THREE.AdditiveBlending);
      flash.position.set(b.x, floor + (b.big ? 1.6 : 0.8), b.y);
      this.fx.push({ sprite: flash, born: t, until: t + (b.big ? 0.55 : 0.4), grow: b.big ? 40 : 18 });
      this.flashLight.position.set(b.x, floor + 1.2, b.y);
      this.flashLight.intensity = b.big ? 40 : 18;
      // Dirt thrown up by the blast.
      const n = b.big ? 90 : 50;
      const pos = new Float32Array(n * 3);
      const vel = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const out = (b.big ? 3 : 2) + Math.random() * (b.big ? 6 : 4);
        pos.set([b.x, floor + 0.2, b.y], i * 3);
        vel.set([Math.cos(a) * out, (b.big ? 7 : 5) + Math.random() * (b.big ? 9 : 5), Math.sin(a) * out], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ color: this.map?.front?.earth ?? "#5a4a38", size: b.big ? 0.22 : 0.14, transparent: true, opacity: 1 }),
      );
      pts.frustumCulled = false;
      this.scene.add(pts);
      this.dirt.push({ pts, vel, born: t, floor });
      // A scorch mark that stays for the rest of the battle (oldest fade out first).
      const scorch = new THREE.Mesh(new THREE.CircleGeometry(b.big ? 2.4 : 1.2, 16).rotateX(-Math.PI / 2), this.scorchMat);
      scorch.position.set(b.x, floor + 0.03 + (this.scorches.length % 20) * 0.0005, b.y);
      this.scene.add(scorch);
      this.scorches.push(scorch);
      if (this.scorches.length > 40) {
        const old = this.scorches.shift()!;
        old.geometry.dispose();
        old.removeFromParent();
      }
    }

    this.dirt = this.dirt.filter((d) => {
      const age = t - d.born;
      const mat = d.pts.material as THREE.PointsMaterial;
      if (age > 1.8) {
        d.pts.geometry.dispose();
        mat.dispose();
        d.pts.removeFromParent();
        return false;
      }
      const pos = d.pts.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        d.vel[i + 1] -= 9.8 * dt;
        arr[i] += d.vel[i] * dt;
        arr[i + 1] = Math.max(d.floor, arr[i + 1] + d.vel[i + 1] * dt);
        arr[i + 2] += d.vel[i + 2] * dt;
      }
      pos.needsUpdate = true;
      mat.opacity = Math.min(1, (1.8 - age) / 0.6);
      return true;
    });
  }

  /** Each Trenches front brings its own sky, light, haze and weather; the town is a clear day. */
  private applyTheme(war: boolean, world: World) {
    this.war = war;
    const u = this.sky.material.uniforms;
    const high = this.quality === "high";
    const fog = this.scene.fog as THREE.Fog;
    this.setWeather("none");
    const th = world.map.front;
    if (war && th) {
      const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - th.sky.elevation), THREE.MathUtils.degToRad(th.sky.azimuth));
      u.turbidity.value = th.sky.turbidity;
      u.rayleigh.value = th.sky.rayleigh;
      u.mieCoefficient.value = th.sky.mie;
      u.sunPosition.value.copy(dir);
      this.sunOffset = dir.clone().multiplyScalar(70);
      this.sun.color.set(th.sun.color);
      this.sun.intensity = th.sun.intensity;
      this.hemi.color.set(th.hemi.sky);
      this.hemi.groundColor.set(th.hemi.ground);
      this.hemi.intensity = th.hemi.intensity;
      this.fogBase.set(th.fog.color);
      fog.color.copy(this.fogBase);
      fog.near = th.fog.near;
      fog.far = high ? th.fog.far : th.fog.far * 0.8;
      this.renderer.toneMappingExposure = th.exposure;
      (this.clouds.material as THREE.MeshBasicMaterial).color.set(th.clouds);
      if (th.weather !== "none") this.setWeather(th.weather);
    } else {
      u.turbidity.value = 5;
      u.rayleigh.value = 1.4;
      u.mieCoefficient.value = 0.004;
      u.sunPosition.value.copy(SUN_DIR);
      this.sunOffset = SUN_OFFSET.clone();
      this.sun.color.set("#fff0d8");
      this.sun.intensity = 2.8;
      this.hemi.color.set("#cfe3ff");
      this.hemi.groundColor.set("#4d5a37");
      this.hemi.intensity = 0.7;
      this.fogBase.set("#c3d3df");
      fog.near = high ? 40 : 28;
      fog.far = high ? 150 : 90;
      this.renderer.toneMappingExposure = 0.62;
      (this.clouds.material as THREE.MeshBasicMaterial).color.set("#ffffff");
    }
  }

  /** Rain streaks, snowflakes or dust motes in a box that travels with the camera. */
  private setWeather(kind: "none" | "rain" | "snow" | "dust") {
    if (this.weather) {
      this.weather.obj.removeFromParent();
      this.weather.obj.geometry.dispose();
      (this.weather.obj.material as THREE.Material).dispose();
      this.weather = null;
    }
    if (kind === "none") return;
    const high = this.quality === "high";
    const n = kind === "rain" ? (high ? 2200 : 1100) : kind === "snow" ? (high ? 2400 : 1200) : 400;
    const per = kind === "rain" ? 2 : 1;
    const pos = new Float32Array(n * per * 3);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 40;
      const y = Math.random() * 18;
      const z = (Math.random() - 0.5) * 40;
      for (let k = 0; k < per; k++) pos.set([x, y + k * 0.45, z], (i * per + k) * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const obj =
      kind === "rain"
        ? new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#b4bcc6", transparent: true, opacity: 0.32, depthWrite: false }))
        : new THREE.Points(
            geo,
            new THREE.PointsMaterial({
              color: kind === "snow" ? "#ffffff" : "#e8dcc0",
              size: kind === "snow" ? 0.07 : 0.035,
              transparent: true,
              opacity: kind === "snow" ? 0.9 : 0.45,
              depthWrite: false,
            }),
          );
    obj.frustumCulled = false;
    this.scene.add(obj);
    this.weather = { obj, pos, kind };
  }

  private updateWeather(dt: number) {
    const w = this.weather;
    if (!w) return;
    const cam = this.camera.position;
    const per = w.kind === "rain" ? 2 : 1;
    const fall = w.kind === "rain" ? 20 : w.kind === "snow" ? 1.3 : 0.1;
    const drift = w.kind === "rain" ? 1.5 : w.kind === "snow" ? 0.6 : 0.8;
    const t = performance.now() / 1000;
    const p = w.pos;
    for (let i = 0; i < p.length; i += per * 3) {
      let x = p[i] + drift * dt + (w.kind === "snow" ? Math.sin(t + i) * 0.3 * dt : 0);
      let y = p[i + 1] - fall * dt;
      let z = p[i + 2] + (w.kind === "dust" ? Math.sin(t * 0.5 + i) * 0.2 * dt : 0);
      // Wrap around the camera so the box always surrounds the viewer.
      const rx = x - (cam.x - w.obj.position.x);
      const rz = z - (cam.z - w.obj.position.z);
      if (rx < -20) x += 40;
      else if (rx > 20) x -= 40;
      if (rz < -20) z += 40;
      else if (rz > 20) z -= 40;
      if (y < cam.y - 4) y += 18;
      if (w.kind === "dust" && y > cam.y + 10) y -= 14;
      for (let k = 0; k < per; k++) {
        p[i + k * 3] = x + (k ? drift * 0.03 : 0);
        p[i + k * 3 + 1] = y + k * 0.45;
        p[i + k * 3 + 2] = z;
      }
    }
    (w.obj.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Distant artillery flashes on the horizon. */
  private updateBattle(me: Entity, t: number) {
    if (t >= this.nextShell) {
      this.nextShell = t + 3 + Math.random() * 6;
      const a = Math.random() * Math.PI * 2;
      const flash = this.artillery?.sprite ?? this.takeSprite(this.glow, "#ffb068", THREE.AdditiveBlending);
      flash.position.set(me.x + Math.cos(a) * 140, 4, me.y + Math.sin(a) * 140);
      flash.scale.set(26, 10, 1);
      this.artillery = { sprite: flash, born: t };
    }
    if (this.artillery) {
      const k = (t - this.artillery.born) / 0.6;
      (this.artillery.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - k) * 0.35;
      this.artillery.sprite.visible = k < 1;
    }
  }

  /** Conquest flags: pole, team-coloured cloth that rises with capture, and a ground ring. */
  /** Emplaced Vickers guns on their tripods (hidden while someone's manning it: they hold it). */
  private updateGuns(markers: Marker[]) {
    const live = new Set<string>();
    for (const m of markers) {
      if (m.kind !== "mg") continue;
      live.add(m.id);
      let g = this.guns.get(m.id);
      if (!g) {
        g = buildVickers(true).group;
        g.traverse((o) => (o.castShadow = this.quality === "high"));
        this.guns.set(m.id, g);
        this.scene.add(g);
      }
      const floor = this.front?.floorAt(m.x, m.y) ?? 0;
      g.position.set(m.x, floor + 1.05, m.y);
      g.rotation.y = -(m.a ?? 0);
      g.visible = m.label !== "manned";
    }
    for (const [id, g] of this.guns)
      if (!live.has(id)) {
        g.removeFromParent();
        this.guns.delete(id);
      }
  }

  /** Poison gas: a cluster of soft yellow-green puffs per cloud, rolling low over the ground. */
  private updateGas(fx: ViewFx, t: number, dt: number) {
    const clouds = fx.effects?.clouds ?? [];
    const live = new Set<string>();
    if (!this.puff) this.puff = puffTexture();
    for (const c of clouds) {
      live.add(c.id);
      let puffs = this.gas.get(c.id);
      if (!puffs) {
        puffs = [];
        const n = this.quality === "high" ? 16 : 9;
        for (let i = 0; i < n; i++) {
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puff, color: i % 3 ? "#b9c27a" : "#cfd08f", transparent: true, depthWrite: false, opacity: 0, fog: true }));
          s.userData = { a: (i / n) * Math.PI * 2 + Math.random(), d: Math.sqrt(Math.random()), h: 0.4 + Math.random() * 1.4, spin: (Math.random() - 0.5) * 0.4, ph: Math.random() * 10 };
          this.scene.add(s);
          puffs.push(s);
        }
        this.gas.set(c.id, puffs);
      }
      for (const s of puffs) {
        const u = s.userData as { a: number; d: number; h: number; spin: number; ph: number };
        u.a += u.spin * dt * 0.2;
        const rr = c.r * u.d * 0.85;
        const floor = this.front?.floorAt(c.x + Math.cos(u.a) * rr, c.y + Math.sin(u.a) * rr) ?? 0;
        s.position.set(c.x + Math.cos(u.a) * rr, floor + u.h + Math.sin(t * 0.5 + u.ph) * 0.15, c.y + Math.sin(u.a) * rr);
        const size = 3 + c.r * 0.55;
        s.scale.set(size, size * 0.6, 1);
        (s.material as THREE.SpriteMaterial).opacity = 0.32 * c.k;
        (s.material as THREE.SpriteMaterial).rotation = u.ph + t * u.spin * 0.1;
      }
    }
    for (const [id, puffs] of this.gas)
      if (!live.has(id)) {
        for (const s of puffs) {
          (s.material as THREE.SpriteMaterial).dispose();
          s.removeFromParent();
        }
        this.gas.delete(id);
      }
  }

  private updateFlags(markers: Marker[], t: number) {
    const live = new Set<string>();
    for (const m of markers) {
      if (m.kind !== "flag") continue;
      live.add(m.id);
      let f = this.flags.get(m.id);
      if (!f) {
        const group = new THREE.Group();
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.07, 7, 8),
          new THREE.MeshStandardMaterial({ color: "#5a4a38", roughness: 0.8 }),
        );
        pole.position.y = 3.5;
        pole.castShadow = true;
        const cloth = new THREE.Mesh(
          new THREE.PlaneGeometry(1.8, 1.1, 8, 1).translate(0.9, 0, 0),
          new THREE.MeshStandardMaterial({ color: "#ffffff", side: THREE.DoubleSide, roughness: 0.9 }),
        );
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(Math.max(0.2, (m.r ?? 3) - 0.15), m.r ?? 3, 64).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.22, depthWrite: false }),
        );
        ring.position.y = 0.04;
        group.add(pole, cloth, ring);
        this.scene.add(group);
        f = { group, cloth, ring };
        this.flags.set(m.id, f);
      }
      f.group.position.set(m.x, 0, m.y);
      const color = m.color.slice(0, 7);
      (f.cloth.material as THREE.MeshStandardMaterial).color.set(color);
      (f.ring.material as THREE.MeshBasicMaterial).color.set(color);
      f.cloth.position.y = 1.4 + (m.raise ?? 0) * 5;
      f.cloth.rotation.y = Math.sin(t * 1.3 + m.x) * 0.25;
    }
    for (const [id, f] of this.flags)
      if (!live.has(id)) {
        f.group.removeFromParent();
        this.flags.delete(id);
      }
    this.updateCrates(markers, t);
  }

  /** Supply crates: a wooden ammo box with rope handles, a parachute canopy and a green smoke marker. */
  private updateCrates(markers: Marker[], t: number) {
    const live = new Set<string>();
    for (const m of markers) {
      if (m.kind !== "crate") continue;
      live.add(m.id);
      let c = this.crates.get(m.id);
      if (!c) {
        c = new THREE.Group();
        const wood = new THREE.MeshStandardMaterial({ color: "#6b4f2a", roughness: 0.85 });
        const band = new THREE.MeshStandardMaterial({ color: "#3a3a36", roughness: 0.5, metalness: 0.6 });
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.7), wood);
        box.position.y = 0.3;
        box.castShadow = this.quality === "high";
        c.add(box);
        for (const x of [-0.4, 0.4]) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.72), band);
          b.position.set(x, 0.3, 0);
          c.add(b);
        }
        const lid = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.05, 0.72), wood);
        lid.position.y = 0.62;
        c.add(lid);
        // Canopy draped over the back of the crate.
        const canopy = new THREE.Mesh(
          new THREE.SphereGeometry(0.9, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4),
          new THREE.MeshStandardMaterial({ color: "#d9d0b8", roughness: 1, side: THREE.DoubleSide }),
        );
        canopy.scale.set(1, 0.35, 1);
        canopy.position.set(-0.9, 0.05, 0.3);
        canopy.rotation.z = 0.5;
        c.add(canopy);
        const smoke = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: this.glow, color: "#7dffb0", transparent: true, depthWrite: false, opacity: 0.3 }),
        );
        smoke.scale.set(1.2, 3, 1);
        c.add(smoke);
        c.userData.smoke = smoke;
        this.scene.add(c);
        this.crates.set(m.id, c);
      }
      c.position.set(m.x, this.front?.floorAt(m.x, m.y) ?? 0, m.y);
      const smoke = c.userData.smoke as THREE.Sprite;
      smoke.position.y = 1.8 + Math.sin(t * 1.7) * 0.15;
    }
    for (const [id, c] of this.crates)
      if (!live.has(id)) {
        c.removeFromParent();
        this.crates.delete(id);
      }
  }

  private updateStorm(fx: ViewFx, me: Entity, t: number) {
    const fog = this.scene.fog as THREE.Fog;
    if (!fx.storm) {
      this.storm.visible = false;
      fog.color.copy(this.fogBase);
      return;
    }
    const c = fx.storm;
    // At the start the eye covers the whole map: show the wall once it's on the island.
    this.storm.visible = c.r < Math.hypot(this.map?.width ?? 72, this.map?.height ?? 72) * 0.48;
    this.storm.position.set(c.x, 30, c.y);
    this.storm.scale.set(c.r, 60, c.r);
    this.stormTex.offset.x = (t * 0.01) % 1;
    this.stormTex.offset.y = (t * 0.05) % 1;
    const inside = Math.hypot(me.x - c.x, me.y - c.y) <= c.r;
    fog.color.lerp(inside ? this.fogBase : this.fogStorm, 0.08);
    const high = this.quality === "high";
    fog.near += ((inside ? (high ? 40 : 28) : 4) - fog.near) * 0.08;
    fog.far += ((inside ? (high ? 150 : 90) : 26) - fog.far) * 0.08;
  }

  // ------------------------------------------------------------ viewmodel

  private updateViewmodel(world: World, me: Entity, fx: ViewFx, t: number, dt: number) {
    const item = activeItem(me);
    const w = activeWeapon(me);
    const scoped = !!w && w.kind === "sniper" && fx.ads > 0.85;
    this.vm.visible = me.alive && !!item && !scoped;
    if (!this.vm.visible) {
      this.vmFlash.visible = false;
      return;
    }
    const o = outfitOf(me.outfit);
    this.vmArmMat.color.set(o.top);
    this.vmGloveMat.color.set(o.accent);

    if (me.active !== this.lastActive) {
      this.lastActive = me.active;
      this.drawnAt = t;
    }
    const key = item ? (item.type === "weapon" ? `${item.kind}.${item.rarity}.${this.wrap}.${item.era ?? ""}` : item.kind) : "";
    if (key !== this.vmKey) {
      this.vmKey = key;
      if (this.vmGun) this.vm.remove(this.vmGun.group);
      if (this.vmItem) this.vm.remove(this.vmItem);
      this.vmGun = null;
      this.vmItem = null;
      if (item?.type === "weapon") {
        this.vmGun = buildGun(item.kind, item.rarity, wrapOf(this.wrap).id, item.era);
        this.vmGun.group.rotation.y = Math.PI / 2; // barrel forward (-Z)
        this.vm.add(this.vmGun.group);
      } else if (item) {
        this.vmItem = buildConsumable(item.kind);
        this.vm.add(this.vmItem);
      }
    }

    // Sway from turning, bob from walking, recoil, reload dip, draw raise.
    const turn = Math.atan2(Math.sin(me.angle - this.lastAngle), Math.cos(me.angle - this.lastAngle));
    this.lastAngle = me.angle;
    this.sway += (Math.max(-0.08, Math.min(0.08, -turn * 0.6)) - this.sway) * Math.min(1, dt * 10);
    const bobAmt = fx.reduceMotion ? 0 : Math.min(1, me.speed / 3.4) * (1 - fx.ads * 0.85);
    const bx = Math.sin(fx.bob) * 0.012 * bobAmt;
    const by = -Math.abs(Math.cos(fx.bob)) * 0.01 * bobAmt;
    const recoil = Math.max(0, 1 - (t - me.firedAt) / (w?.kind === "sniper" || w?.kind === "shotgun" ? 0.25 : 0.09));
    const kick = w ? (w.kind === "sniper" ? 0.09 : w.kind === "shotgun" ? 0.08 : w.kind === "pistol" ? 0.035 : 0.025) : 0;
    const reloading = me.reloadUntil > t;
    const reloadK = reloading ? Math.sin(Math.min(1, 1 - (me.reloadUntil - t) / (w ? weaponDef(w).reload * RARITY[w.rarity].reload : 1)) * Math.PI) : 0;
    const drawK = Math.max(0, 1 - (t - this.drawnAt) / DRAW_TIME);
    const ads = fx.ads;

    // Sprinting (moving fast, not aiming) lowers and cants the weapon.
    const sprinting = me.speed > 4.3 && ads < 0.2 && !reloading;
    this.sprintK += ((sprinting ? 1 : 0) - this.sprintK) * Math.min(1, dt * 8);
    const sk = fx.reduceMotion ? 0 : this.sprintK;
    // Breathing: a slow figure-eight, calmer when aiming.
    const breathe = fx.reduceMotion ? 0 : 1 - ads * 0.75;
    const brx = Math.sin(t * 1.3) * 0.004 * breathe;
    const bry = Math.sin(t * 2.6) * 0.003 * breathe;
    // Throwing a grenade / digging take the gun out of the way.
    const throwAgo = t - (me.thrownAt ?? -10);
    const throwing = throwAgo < 0.7;
    const digging = !!me.digging;
    const away = Math.max(throwing ? Math.sin(Math.min(1, throwAgo / 0.7) * Math.PI) : 0, digging ? 1 : 0);
    // Bayonet thrust: the rifle lunges forward and comes back.
    const stabAgo = t - (me.meleeAt ?? -10);
    const stab = stabAgo < 0.38 ? Math.sin((stabAgo / 0.38) * Math.PI) : 0;

    // Bolt-action / pump cycling after each shot (Great War rifles and the trench gun).
    const def = w ? weaponDef(w) : null;
    const cycles = !!w && !def?.auto && (w.kind === "ar" || w.kind === "sniper" || w.kind === "shotgun") && def!.interval > 0.6;
    const cycleAgo = t - me.firedAt;
    const cycleK = cycles && cycleAgo > 0.12 && cycleAgo < def!.interval * 0.9 ? Math.sin(((cycleAgo - 0.12) / (def!.interval * 0.9 - 0.12)) * Math.PI) : 0;
    const reloadP = reloading && w ? Math.min(1, 1 - (me.reloadUntil - t) / (weaponDef(w).reload * RARITY[w.rarity].reload)) : 0;

    if (this.vmGun) {
      // The emplaced Vickers sits out in front on its tripod, low in the frame.
      const mg = w?.era === "mg";
      const hip = mg ? new THREE.Vector3(0.02, -0.24, -0.72) : w?.kind === "pistol" ? new THREE.Vector3(0.13, -0.15, -0.42) : new THREE.Vector3(0.17, -0.17, -0.4);
      const aimed = mg ? new THREE.Vector3(0, -this.vmGun.sightY - 0.03, -0.66) : new THREE.Vector3(0, -this.vmGun.sightY, -0.34 + (w?.kind === "pistol" ? -0.1 : 0));
      const pos = hip.lerp(aimed, ads);
      this.vmGun.group.position.set(
        pos.x + bx + brx + this.sway * 0.4 - sk * 0.04 + cycleK * 0.015,
        pos.y + by + bry - reloadK * 0.12 - drawK * 0.25 - sk * 0.09 - away * 0.45 - cycleK * 0.02,
        pos.z + recoil * kick + sk * 0.05 - stab * 0.32,
      );
      this.vmGun.group.rotation.set(
        recoil * kick * 2.2 + reloadK * 0.5 - drawK * 0.6 - sk * 0.35 - away * 0.8,
        Math.PI / 2 + this.sway + sk * 0.55,
        reloadK * 0.6 + cycleK * 0.35,
      );
      this.vmGun.group.visible = away < 0.95;
      this.vmGun.group.updateMatrix();
      // Arms: from off-screen below toward the grip and forend; the right hand works the
      // bolt / the left hand the pump; reloads drop the left hand to the magazine.
      const grip = this.vmGun.grip.clone().applyMatrix4(this.vmGun.group.matrix);
      const fore = this.vmGun.fore.clone().applyMatrix4(this.vmGun.group.matrix);
      const bolt = new THREE.Vector3(-0.1, 0.03, 0.06).applyMatrix4(this.vmGun.group.matrix);
      const pump = this.vmGun.fore.clone().add(new THREE.Vector3(-0.1 * cycleK, 0, 0)).applyMatrix4(this.vmGun.group.matrix);
      const magWell = new THREE.Vector3(0.0, -0.1, 0).applyMatrix4(this.vmGun.group.matrix);
      const topLoad = new THREE.Vector3(-0.06, 0.08, 0).applyMatrix4(this.vmGun.group.matrix);
      const pumpGun = w?.kind === "shotgun";
      const rightHand = cycleK > 0.05 && !pumpGun ? grip.clone().lerp(bolt, Math.min(1, cycleK * 1.6)) : grip;
      let leftHand = pumpGun && cycleK > 0 ? pump : fore;
      if (reloading) {
        // 0–0.35 down to the pouch, 0.35–0.75 to the gun (magazine / stripper clip), then back.
        const offscreen = new THREE.Vector3(-0.2, -0.6, 0.0);
        if (reloadP < 0.35) leftHand = fore.clone().lerp(offscreen, reloadP / 0.35);
        else if (reloadP < 0.75) leftHand = offscreen.clone().lerp(w?.era ? topLoad : magWell, Math.min(1, (reloadP - 0.35) / 0.2));
        else leftHand = (w?.era ? topLoad : magWell).clone().lerp(fore, (reloadP - 0.75) / 0.25);
      }
      aimArm(this.vmArms[0], new THREE.Vector3(0.26, -0.5, 0.15), rightHand);
      aimArm(this.vmArms[1], new THREE.Vector3(-0.12, -0.55, 0.1), leftHand);
      this.vmArms[0].visible = this.vmGun.group.visible;
      this.vmArms[1].visible = this.vmGun.group.visible;
      // Muzzle flash
      const flashing = t - me.firedAt < 0.045;
      this.vmFlash.visible = flashing;
      if (flashing) {
        this.vmGun.muzzle.getWorldPosition(this.vmFlash.position);
        const s = w?.kind === "shotgun" || w?.kind === "sniper" ? 0.32 : 0.2;
        this.vmFlash.scale.set(s, s, 1);
        this.vmFlash.material.rotation = Math.random() * Math.PI;
      }
    } else if (this.vmItem) {
      this.vmItem.visible = away < 0.5;
      const using = !!me.using;
      this.vmItem.position.set(0.2 + bx, -0.2 + by + (using ? 0.08 : 0) - drawK * 0.25, -0.4 + (using ? 0.08 : 0));
      this.vmItem.rotation.set(using ? Math.sin(t * 8) * 0.1 : 0, 0.4, 0);
      aimArm(this.vmArms[0], new THREE.Vector3(0.26, -0.5, 0.15), this.vmItem.position.clone().add(new THREE.Vector3(0, -0.06, 0.02)));
      this.vmArms[1].visible = false;
      this.vmFlash.visible = false;
    }

    // Mills bomb in the right hand, swung overarm and released.
    if (throwing) {
      this.vmBomb ??= buildMillsBomb();
      if (!this.vmBomb.parent) this.vm.add(this.vmBomb);
      const k = Math.min(1, throwAgo / 0.7);
      const back = new THREE.Vector3(0.22, 0.05, -0.1);
      const out = new THREE.Vector3(0.05, 0.1, -0.9);
      const p = k < 0.45 ? new THREE.Vector3(0.2, -0.25, -0.35).lerp(back, k / 0.45) : back.clone().lerp(out, (k - 0.45) / 0.55);
      this.vmBomb.position.copy(p);
      this.vmBomb.rotation.set(k * 6, 0, k * 2);
      this.vmBomb.visible = k < 0.8;
      aimArm(this.vmArms[0], new THREE.Vector3(0.26, -0.5, 0.15), p);
      this.vmArms[0].visible = true;
    } else if (this.vmBomb) this.vmBomb.visible = false;

    // Entrenching tool: repeated stabs into the ground ahead.
    if (digging) {
      this.vmSpade ??= buildSpade();
      if (!this.vmSpade.parent) this.vm.add(this.vmSpade);
      const stab = fx.reduceMotion ? 0.5 : (Math.sin(t * 7) + 1) / 2;
      this.vmSpade.visible = true;
      this.vmSpade.position.set(0.05, -0.28 - stab * 0.12, -0.45 - stab * 0.1);
      this.vmSpade.rotation.set(0, Math.PI / 2, -1.0 - stab * 0.35);
      this.vmSpade.updateMatrix();
      const hi = new THREE.Vector3(-0.2, 0, 0).applyMatrix4(this.vmSpade.matrix);
      const lo = new THREE.Vector3(0.05, 0, 0).applyMatrix4(this.vmSpade.matrix);
      aimArm(this.vmArms[0], new THREE.Vector3(0.26, -0.5, 0.15), hi);
      aimArm(this.vmArms[1], new THREE.Vector3(-0.12, -0.55, 0.1), lo);
      this.vmArms[0].visible = true;
      this.vmArms[1].visible = true;
    } else if (this.vmSpade) this.vmSpade.visible = false;
  }
}

function aimArm(arm: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  arm.position.copy(from).addScaledVector(dir, 0.5);
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  arm.scale.set(1, len, 1);
  const glove = arm.children[0];
  glove.scale.set(1, 1 / Math.max(0.01, len), 1);
}

/** Final display-space grade: a touch of contrast and warmth, and a soft vignette. */
const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.06);
      col = (col - 0.5) * 1.05 + 0.5;
      col *= vec3(1.02, 1.0, 0.97);
      float d = distance(vUv, vec2(0.5));
      col *= mix(1.0, 0.9, smoothstep(0.5, 0.9, d));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

/** Opaque at the bottom, fading out toward the top (storm wall). */
function fadeUpTexture() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#000");
  grad.addColorStop(0.55, "#666");
  grad.addColorStop(1, "#fff");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

function nameSprite(name: string, color = "#ffffff") {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 48;
  const g = c.getContext("2d")!;
  g.font = "600 26px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "rgba(0,0,0,.45)";
  const w = Math.min(250, g.measureText(name).width + 20);
  g.fillRect(128 - w / 2, 4, w, 40);
  g.fillStyle = color;
  g.fillText(name, 128, 25);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(1.3, 0.24, 1);
  s.userData = { color, name };
  return s;
}
