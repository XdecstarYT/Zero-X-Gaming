import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { outfitOf, wrapOf } from "./cosmetics";
import { RARITY, WEAPONS, type Item } from "./items";
import type { GameMap } from "./map";
import { activeItem, activeWeapon, DRAW_TIME, type Entity, type World } from "./world";
import { Character } from "./three/character";
import { buildConsumable, buildGun, type GunModel } from "./three/guns";
import { cloudTexture, flashTexture, glowTexture, stormTexture } from "./three/textures";
import { buildTown } from "./three/town";
import { FOV_DEG, zoomFor, type ViewFx, type ViewRenderer } from "./view";
import type { Marker } from "./mode";

/**
 * The realistic three.js view: sunlit town with PBR materials, soft shadows,
 * atmospheric sky and fog, animated characters, a first-person weapon, muzzle
 * flashes, tracers, impact sparks and the storm wall.
 */

const EYE = 1.62;
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
  private chests = new Map<string, { lid: THREE.Group; glow: THREE.Sprite }>();
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
  private flags = new Map<string, { group: THREE.Group; cloth: THREE.Mesh; ring: THREE.Mesh }>();
  private smoke: { sprite: THREE.Sprite; vx: number; vy: number; base: THREE.Vector3; phase: number }[] = [];
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
        color: "#b98cff",
        transparent: true,
        alphaMap: fadeUpTexture(),
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
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
    const built = buildTown(world.map, { shadows: this.quality === "high", detail: this.quality });
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
      const goldM = new THREE.MeshStandardMaterial({ color: "#e0b43c", metalness: 0.9, roughness: 0.3, emissive: "#6b4a00", emissiveIntensity: 0.5 });
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
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glow, color: "#ffcf5a", blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }),
      );
      glow.scale.set(1.6, 1.6, 1);
      glow.position.y = 0.45;
      g.add(base, band, lid, glow);
      this.scene.add(g);
      this.chests.set(c.id, { lid, glow });
    }
  }

  private lootModel(item: Item) {
    const g = new THREE.Group();
    const color = item.type === "weapon" ? RARITY[item.rarity].color : item.kind === "medkit" ? "#f2f2f2" : "#3c9bff";
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
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.18, 2.2, 10, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = 1.1;
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }),
    );
    halo.scale.set(0.9, 0.9, 1);
    halo.position.y = 0.1;
    g.add(beam, halo);
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
    const zoom = zoomFor(w ? WEAPONS[w.kind].zoom : 1, fx.ads);
    const fov = (2 * Math.atan(Math.tan((FOV_DEG * Math.PI) / 360) / zoom) * 180) / Math.PI;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const bobAmt = fx.reduceMotion ? 0 : Math.min(1, me.speed / 3.4) * (1 - fx.ads * 0.8);
    const deadK = me.alive ? 0 : Math.min(1, (t - me.hurtAt) / 0.8);
    this.camera.position.set(me.x, EYE + Math.sin(fx.bob * 2) * 0.035 * bobAmt - deadK * 1.2, me.y);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(-deadK * 0.3, -me.angle - Math.PI / 2, deadK * 0.5 + Math.sin(fx.bob) * 0.004 * bobAmt);

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
      ch.glow.visible = !c.opened;
      if (!c.opened) (ch.glow.material as THREE.SpriteMaterial).opacity = 0.4 + Math.sin(t * 3 + c.x) * 0.15;
    }
    this.syncTracers(world, me, fx, t);
    this.updateStorm(fx, me, t);
    this.updateFlags(fx.markers ?? [], t);
    if (this.war) this.updateBattle(me, t, dt);
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
      if (!e || (!e.alive && t - e.hurtAt > 3)) {
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
      if (!e.alive && t - e.hurtAt > 3) continue;
      let ch = this.characters.get(e.id);
      if (!ch) {
        ch = new Character(e.outfit, e.kind === "human" ? "factory" : ["factory", "woodland", "sandstorm", "carbon"][e.id.length % 4]);
        ch.root.traverse((o) => (o.castShadow = this.quality === "high"));
        this.characters.set(e.id, ch);
        this.scene.add(ch.root);
      }
      ch.setOutfit(e.outfit);
      ch.setItem(activeItem(e));
      ch.root.position.set(e.x, 0, e.y);
      ch.root.rotation.y = -e.angle;
      if (this.quality !== "high") {
        let blob = this.blobs.get(e.id);
        if (!blob) {
          blob = new THREE.Mesh(this.blobGeo, this.blobMat);
          blob.renderOrder = 1;
          this.blobs.set(e.id, blob);
          this.scene.add(blob);
        }
        blob.position.set(e.x, 0.03, e.y);
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
        tag.position.set(e.x, 2.15, e.y);
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

  /** Overcast dusk, haze and drifting battle smoke for the battlefield; clear day for the town. */
  private applyTheme(war: boolean, world: World) {
    this.war = war;
    const u = this.sky.material.uniforms;
    const high = this.quality === "high";
    const fog = this.scene.fog as THREE.Fog;
    for (const s of this.smoke) s.sprite.removeFromParent();
    this.smoke = [];
    if (war) {
      const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 11), THREE.MathUtils.degToRad(250));
      // Low Rayleigh + high turbidity washes the blue out into a grey, smoky overcast.
      u.turbidity.value = 20;
      u.rayleigh.value = 0.35;
      u.mieCoefficient.value = 0.03;
      u.sunPosition.value.copy(dir);
      this.sunOffset = dir.clone().multiplyScalar(70);
      this.sun.color.set("#ffc28a");
      this.sun.intensity = 1.7;
      this.hemi.color.set("#b9b4a8");
      this.hemi.groundColor.set("#4a3e30");
      this.hemi.intensity = 0.85;
      this.fogBase.set("#9d978a");
      fog.color.copy(this.fogBase);
      fog.near = 12;
      fog.far = high ? 95 : 70;
      this.renderer.toneMappingExposure = 0.72;
      (this.clouds.material as THREE.MeshBasicMaterial).color.set("#9a958c");
      const tex = glowTexture();
      const W = world.map.width;
      const H = world.map.height;
      for (let i = 0; i < (high ? 14 : 8); i++) {
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: tex, color: "#8c8579", transparent: true, opacity: 0.22, depthWrite: false }),
        );
        const base = new THREE.Vector3(12 + Math.random() * (W - 24), 1 + Math.random() * 3, 3 + Math.random() * (H - 6));
        sprite.position.copy(base);
        const size = 8 + Math.random() * 10;
        sprite.scale.set(size, size * 0.7, 1);
        this.scene.add(sprite);
        this.smoke.push({ sprite, base, vx: 0.2 + Math.random() * 0.3, vy: 0.15 + Math.random() * 0.2, phase: Math.random() * 30 });
      }
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
    }
  }

  /** Drifting smoke and distant artillery flashes on the horizon. */
  private updateBattle(me: Entity, t: number, dt: number) {
    for (const s of this.smoke) {
      const k = ((t + s.phase) % 30) / 30;
      s.sprite.position.set(s.base.x + k * 30 * s.vx, s.base.y + k * 30 * s.vy, s.base.z);
      (s.sprite.material as THREE.SpriteMaterial).opacity = 0.22 * Math.sin(k * Math.PI);
    }
    if (t >= this.nextShell) {
      this.nextShell = t + 3 + Math.random() * 6;
      const a = Math.random() * Math.PI * 2;
      const flash = this.artillery?.sprite ?? this.takeSprite(this.glow, "#ffb068", THREE.AdditiveBlending);
      flash.position.set(me.x + Math.cos(a) * 140, 4, me.y + Math.sin(a) * 140);
      flash.scale.set(60, 30, 1);
      this.artillery = { sprite: flash, born: t };
    }
    if (this.artillery) {
      const k = (t - this.artillery.born) / 0.6;
      (this.artillery.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - k) * 0.8;
      this.artillery.sprite.visible = k < 1;
    }
    void dt;
  }

  /** Conquest flags: pole, team-coloured cloth that rises with capture, and a ground ring. */
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
          new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.45, depthWrite: false }),
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
    const key = item ? (item.type === "weapon" ? `${item.kind}.${item.rarity}.${this.wrap}` : item.kind) : "";
    if (key !== this.vmKey) {
      this.vmKey = key;
      if (this.vmGun) this.vm.remove(this.vmGun.group);
      if (this.vmItem) this.vm.remove(this.vmItem);
      this.vmGun = null;
      this.vmItem = null;
      if (item?.type === "weapon") {
        this.vmGun = buildGun(item.kind, item.rarity, wrapOf(this.wrap).id);
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
    const reloadK = reloading ? Math.sin(Math.min(1, 1 - (me.reloadUntil - t) / (w ? WEAPONS[w.kind].reload * RARITY[w.rarity].reload : 1)) * Math.PI) : 0;
    const drawK = Math.max(0, 1 - (t - this.drawnAt) / DRAW_TIME);
    const ads = fx.ads;

    if (this.vmGun) {
      const hip = w?.kind === "pistol" ? new THREE.Vector3(0.13, -0.15, -0.42) : new THREE.Vector3(0.17, -0.17, -0.4);
      const aimed = new THREE.Vector3(0, -this.vmGun.sightY, -0.34 + (w?.kind === "pistol" ? -0.1 : 0));
      const pos = hip.lerp(aimed, ads);
      this.vmGun.group.position.set(pos.x + bx + this.sway * 0.4, pos.y + by - reloadK * 0.12 - drawK * 0.25, pos.z + recoil * kick);
      this.vmGun.group.rotation.set(recoil * kick * 2.2 + reloadK * 0.5 - drawK * 0.6, Math.PI / 2 + this.sway, reloadK * 0.6);
      this.vmGun.group.updateMatrix();
      // Arms: from off-screen below toward the grip and forend.
      const grip = this.vmGun.grip.clone().applyMatrix4(this.vmGun.group.matrix);
      const fore = this.vmGun.fore.clone().applyMatrix4(this.vmGun.group.matrix);
      aimArm(this.vmArms[0], new THREE.Vector3(0.26, -0.5, 0.15), grip);
      aimArm(this.vmArms[1], new THREE.Vector3(-0.12, -0.55, 0.1), reloadK > 0.3 ? grip.clone().add(new THREE.Vector3(-0.05, -0.12, 0.05)) : fore);
      this.vmArms[1].visible = true;
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
      const using = !!me.using;
      this.vmItem.position.set(0.2 + bx, -0.2 + by + (using ? 0.08 : 0) - drawK * 0.25, -0.4 + (using ? 0.08 : 0));
      this.vmItem.rotation.set(using ? Math.sin(t * 8) * 0.1 : 0, 0.4, 0);
      aimArm(this.vmArms[0], new THREE.Vector3(0.26, -0.5, 0.15), this.vmItem.position.clone().add(new THREE.Vector3(0, -0.06, 0.02)));
      this.vmArms[1].visible = false;
      this.vmFlash.visible = false;
    }
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
      col *= mix(1.0, 0.78, smoothstep(0.45, 0.85, d));
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
