import * as THREE from "three";
import { buildCar, type CarModel } from "../../code-3/models";
import { BONES, buildPed, posePed, type PedModel, type Pose } from "../../code-3/people3d";
import { VEHICLES, WEAPONS, type WeaponId } from "../data";
import { fwdSpeed, speedOf, type Car, type Ped, type State } from "../state";
import { segAt, WATER_Y } from "../world";
import { buildBike, buildBoat, buildHeli, weaponModel, type CustomVehicle } from "./models";
import type { Quality } from "./city";
import { buildTram, poseTram, type TramModel } from "./tram";

/**
 * People and vehicles, drawn from the simulation each frame: articulated people (the shared
 * people kit) walking, running, aiming, fighting, fleeing, lying on beach towels, swimming and
 * sitting at the wheel; cars from the shared car kit (plus our own bike, boats and helicopter)
 * with turning wheels, body roll, lamps, sirens, smoke, fire and blackened wrecks; skid marks.
 */

interface PedView {
  m: PedModel;
  key: string;
  step: number;
  guns: Partial<Record<WeaponId, THREE.Object3D>>;
  shadow?: boolean;
}

interface CarView {
  key: string;
  group: THREE.Group;
  kit?: CarModel;
  custom?: CustomVehicle;
  tram?: TramModel;
  wheel: number;
  driver?: PedModel;
  driverKey?: string;
  wrecked: boolean;
  shadow?: boolean;
  /** Small parts (plates, trim, lamps, rims) dropped when the car is far off. */
  fine: THREE.Object3D[];
  near?: boolean;
  sign?: THREE.Mesh;
}

const HAND = BONES.indexOf("handR");
const KERB = 0.16;

const smokeMat = new THREE.SpriteMaterial({ color: "#3a3a3a", transparent: true, opacity: 0.55, depthWrite: false });
const fireMat = new THREE.SpriteMaterial({ color: "#ff8a2a", transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });

/** Additive see-through bits (lamp glows, the headlight pool) never cast a shadow. */
function castsNone(o: THREE.Object3D) {
  const m = (o as THREE.Mesh).material as THREE.Material | undefined;
  return !m || (m.transparent && m.blending === THREE.AdditiveBlending);
}

/** A lamp glow: an unlit one isn't drawn at all. */
function glowOn(gl: THREE.Sprite, opacity: number) {
  (gl.material as THREE.SpriteMaterial).opacity = opacity;
  gl.visible = opacity > 0;
}

/** Roof heights of the shared car bodies (m), for seating the driver under them. */
const ROOF: Record<string, number> = { sedan: 1.46, cruiser: 1.49, slicktop: 1.47, suv: 1.86, interceptor: 1.8, van: 2.28, transport: 2.45, ambulance: 2.67, pickup: 1.85, sports: 1.1, pursuit: 1.15 };

export class Actors {
  private peds = new Map<number, PedView>();
  private cars = new Map<number, CarView>();
  private skids: THREE.InstancedMesh;
  private skidN = 0;
  private skidAt = new Map<number, number>();
  private smoke: THREE.Sprite[] = [];
  private smokeI = 0;
  private t = 0;

  constructor(
    private scene: THREE.Scene,
    private quality: Quality,
    puff: THREE.Texture,
  ) {
    smokeMat.map = puff;
    fireMat.map = puff;
    const skidGeo = new THREE.PlaneGeometry(0.6, 0.24).rotateX(-Math.PI / 2);
    this.skids = new THREE.InstancedMesh(skidGeo, new THREE.MeshBasicMaterial({ color: "#151515", transparent: true, opacity: 0.4, depthWrite: false }), 600);
    this.skids.count = 0;
    this.skids.frustumCulled = false;
    this.skids.renderOrder = 1;
    scene.add(this.skids);
    for (let i = 0; i < 48; i++) {
      const sp = new THREE.Sprite(smokeMat);
      sp.visible = false;
      sp.userData.t = 9;
      scene.add(sp);
      this.smoke.push(sp);
    }
  }

  /** The player's model (for the camera to frame and the UI to pose). */
  pedModel(id: number) {
    return this.peds.get(id)?.m;
  }

  sync(s: State, camX: number, camZ: number, dt: number, night: number) {
    this.t += dt;
    const far = this.quality === "low" ? 85 : this.quality === "medium" ? 115 : 150;
    const lowQ = this.quality === "low";
    // People.
    const live = new Set<number>();
    for (const p of s.peds) {
      if (p.car >= 0) continue;
      const d = Math.hypot(p.x - camX, p.z - camZ);
      if (d > far && p.id !== s.player) continue;
      live.add(p.id);
      let v = this.peds.get(p.id);
      const key = lookKey(p);
      if (!v || v.key !== key) {
        if (v) this.scene.remove(v.m.group);
        v = { m: this.makePed(p), key, step: 0, guns: {} };
        this.peds.set(p.id, v);
        this.scene.add(v.m.group);
      }
      this.posePed(s, p, v, dt);
      // Only the people near the camera cast shadows.
      const sh = !lowQ && d < 45;
      if (v.shadow !== sh) {
        v.shadow = sh;
        v.m.group.traverse((o) => ((o as THREE.Mesh).castShadow = sh));
      }
    }
    for (const [id, v] of this.peds)
      if (!live.has(id)) {
        this.scene.remove(v.m.group);
        this.peds.delete(id);
      }
    // Vehicles.
    const liveC = new Set<number>();
    for (const c of s.cars) {
      const d = Math.hypot(c.x - camX, c.z - camZ);
      if (d > (VEHICLES[c.kind].air ? 900 : far + 90) && !c.seats.includes(s.player)) continue;
      liveC.add(c.id);
      let v = this.cars.get(c.id);
      const key = `${c.kind}:${c.color}`;
      if (!v || v.key !== key) {
        if (v) this.scene.remove(v.group);
        v = this.makeCar(c, key);
        this.cars.set(c.id, v);
        this.scene.add(v.group);
      }
      this.poseCar(s, c, v, d, dt, night);
      const near = d < 50 || c.seats.includes(s.player);
      if (v.near !== near) {
        v.near = near;
        for (const o of v.fine) o.visible = near;
      }
      const sh = !lowQ && d < 80;
      if (v.shadow !== sh) {
        v.shadow = sh;
        v.group.traverse((o) => ((o as THREE.Mesh).castShadow = sh && !castsNone(o)));
      }
    }
    for (const [id, v] of this.cars)
      if (!liveC.has(id)) {
        this.scene.remove(v.group);
        this.cars.delete(id);
      }
    // Smoke drifts up and fades.
    for (const sp of this.smoke) {
      if (!sp.visible) continue;
      sp.userData.t += dt;
      const k = sp.userData.t / sp.userData.life;
      if (k >= 1) {
        sp.visible = false;
        continue;
      }
      sp.position.y += dt * (sp.material === fireMat ? 2.2 : 1.4);
      sp.scale.setScalar(sp.userData.s * (0.6 + k * 1.8));
      sp.material.opacity = (sp.material === fireMat ? 0.9 : 0.5) * (1 - k);
    }
  }

  private makePed(p: Ped): PedModel {
    const L = p.look;
    const outfit: Record<string, unknown> = {};
    if (L.female !== undefined) outfit.female = L.female;
    if (L.top) outfit.top = L.top;
    if (L.bottom) outfit.bottom = L.bottom;
    if (L.hairStyle) outfit.hair = L.hairStyle;
    if (L.hat) outfit.hat = L.hat;
    if (L.beard !== undefined) outfit.beard = L.beard;
    if (p.role === "cop") outfit.hat = p.look.seed % 3 === 0 ? "none" : "police";
    const m = buildPed({ skin: L.skin, shirt: L.shirt, pants: L.pants, hair: L.hair, seed: L.seed, lod: this.quality === "low" && p.role !== "player" ? "low" : "high", officer: p.role === "cop", outfit: outfit as never });
    m.group.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    // A fixed sphere round the body (any pose fits) so people off screen aren't drawn.
    m.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.7);
    m.mesh.frustumCulled = true;
    return m;
  }

  private posePed(s: State, p: Ped, v: PedView, dt: number) {
    const g = v.m.group;
    const sp = Math.hypot(p.vx, p.vz);
    v.step += sp * dt;
    let y = p.y;
    if (p.swim) y = WATER_Y - 1.05 + Math.sin(this.t * 2 + p.id) * 0.05;
    else if (y < 0.05 && p.state !== "dead") y += onWalk(s, p.x, p.z) ? KERB : 0.02;
    else if (p.state === "dead") y += onWalk(s, p.x, p.z) ? KERB : 0.02;
    g.position.set(p.x, y, p.z);
    g.rotation.set(0, -p.h, 0);
    const w = WEAPONS[p.weapon];
    let pose: Pose = "walk";
    let act = 0;
    const isPl = p.role === "player";
    if (p.state === "dead") pose = "dead";
    else if (p.state === "down") pose = "down";
    else if (p.swim) pose = "prone";
    else if (isPl && s.down?.kind === "arrested") pose = "cuffed";
    else if (p.cuffT > 0.3) pose = "handsup";
    else if (p.ai.mode === "cower") pose = "handsup";
    else if (p.ai.mode === "flee") pose = "panic";
    else if (p.ai.mode === "beach" && p.ai.side === 2 && sp < 0.2) pose = "sleep";
    else if (w.melee && p.fireT > 0) {
      pose = p.weapon === "bat" ? "swing" : "fight";
      act = 0.6;
    } else if (w.thrown && p.fireT > 0) {
      pose = "throw";
      act = 0.7;
    } else if (p.aiming && !w.melee) pose = "aim";
    else if (p.ai.mode === "fight" && w.melee) pose = "fight";
    posePed(v.m, pose, v.step, sp, this.t, dt, act);
    // Guns in hand.
    const armed = !w.melee || p.weapon === "bat";
    const showGun = armed && p.state === "ok" && !p.swim && (p.aiming || p.fireT > 0 || p.ai.mode === "fight" || p.ai.mode === "cop" || p.weapon === "bat" || (isPl && !w.thrown));
    v.m.gun.visible = showGun && p.weapon === "pistol";
    v.m.taser.visible = false;
    for (const k of ["smg", "shotgun", "rifle", "bat", "grenade"] as const) {
      const want = showGun && p.weapon === k;
      let o = v.guns[k];
      if (want && !o) {
        o = weaponModel(k);
        v.m.bones[HAND].add(o);
        v.guns[k] = o;
      }
      if (o) o.visible = want;
    }
  }

  private makeCar(c: Car, key: string): CarView {
    const spec = VEHICLES[c.kind];
    const group = new THREE.Group();
    const v: CarView = { key, group, wheel: 0, wrecked: false, fine: [] };
    if (spec.body === "tram") {
      v.tram = buildTram(c.kind === "wtram" ? "wtram" : "tram", c.tram?.route ?? 0);
      group.add(v.tram.group);
      return v;
    }
    if (spec.body === "bike") v.custom = buildBike(c.color);
    else if (spec.body === "boat") v.custom = buildBoat(c.color);
    else if (spec.body === "airboat") v.custom = buildBoat(c.color, true);
    else if (spec.body === "heli") v.custom = buildHeli();
    if (v.custom) group.add(v.custom.group);
    else {
      v.kit = buildCar(spec.body as never, c.color, c.plate, this.quality === "low" ? "low" : "high", !spec.police && spec.body !== "ambulance");
      v.kit.group.scale.setScalar(spec.scale);
      group.add(v.kit.group);
      v.kit.group.traverse((o) => ((o as THREE.Mesh).castShadow = this.quality !== "low" && !castsNone(o)));
      const kit = v.kit;
      kit.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh === kit.beam || mesh.material === kit.red || mesh.material === kit.blue) return;
        if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
        if (mesh.geometry.boundingSphere!.radius < 0.3) v.fine.push(mesh);
      });
      if (spec.police && spec.body !== "transport" && spec.body !== "ambulance") victoriaLivery(kit);
      if (c.kind === "taxi") {
        v.sign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.9), new THREE.MeshStandardMaterial({ color: "#ffe066", emissive: "#ffcc33", emissiveIntensity: 0.8 }));
        v.sign.position.set(-0.3, 1.62, 0);
        group.add(v.sign);
      }
    }
    return v;
  }

  private poseCar(s: State, c: Car, v: CarView, d: number, dt: number, night: number) {
    const spec = VEHICLES[c.kind];
    const g = v.group;
    if (v.tram) {
      // The sections are placed in the world along the rails.
      g.position.set(0, 0, 0);
      g.rotation.set(0, 0, 0);
      poseTram(s, c, v.tram, night);
      return;
    }
    const vf = fwdSpeed(c);
    const sp = speedOf(c);
    g.position.set(c.x, c.y + (spec.water ? 0.25 : 0), c.z);
    // Roll in turns, dip under braking; bikes lean; boats rise at speed.
    const lat = -c.steer * vf;
    if (spec.body === "bike") g.rotation.set(Math.max(-0.6, Math.min(0.6, lat * 0.025)), -c.h, 0, "YXZ");
    else if (spec.water) g.rotation.set(Math.sin(this.t * 1.7 + c.id) * 0.03 + lat * 0.004, -c.h, Math.min(0.12, sp * 0.006) + Math.sin(this.t * 2.1 + c.id) * 0.02, "YXZ");
    else if (spec.air) {
      g.rotation.set(Math.max(-0.25, Math.min(0.25, -(c.vz * Math.cos(c.h) - c.vx * Math.sin(c.h)) * 0.01)), -c.h, Math.max(-0.2, Math.min(0.2, -vf * 0.008)), "YXZ");
    } else g.rotation.set(Math.max(-0.05, Math.min(0.05, lat * 0.0022)), -c.h, c.brake && sp > 2 ? -0.018 : c.throttle > 0.5 && sp < 12 ? 0.012 : 0, "YXZ");
    v.wheel += (vf * dt) / 0.34;
    const steer = -c.steer;
    if (v.kit) {
      const m = v.kit;
      m.wheels.forEach((w, i) => {
        w.rotation.y = i < 2 ? steer : 0;
        (w.children[0] as THREE.Object3D).rotation.z = -v.wheel;
      });
      const lit = night > 0.15 || s.weather.rain > 0.5;
      m.tail.emissiveIntensity = c.brake ? 3 : lit ? 1 : 0.2;
      (m.heads.material as THREE.MeshStandardMaterial).emissiveIntensity = lit && c.hp > 0 ? 2.6 : 0.3;
      (m.reverse.material as THREE.MeshStandardMaterial).emissiveIntensity = vf < -0.5 ? 2 : 0;
      for (const gl of m.headGlow) glowOn(gl, lit && !c.wrecked ? 0.75 : 0);
      for (const gl of m.tailGlow) glowOn(gl, c.brake ? 0.9 : lit ? 0.4 : 0);
      (m.beam.material as THREE.MeshBasicMaterial).opacity = night * 0.5;
      m.beam.visible = lit && !c.wrecked && d < 120;
      const blink = Math.floor(this.t * 2.6) % 2 === 0;
      m.amberL.emissiveIntensity = c.alarm > 0 && blink ? 5 : 0.1;
      m.amberR.emissiveIntensity = c.alarm > 0 && blink ? 5 : 0.1;
      if (m.red && m.blue) {
        const phase = Math.floor(this.t * 8) % 4;
        const on = c.siren && !c.wrecked;
        const r = on && phase < 2;
        const b = on && phase >= 2;
        m.red.emissiveIntensity = r ? 8 : on ? 0.4 : 0;
        m.blue.emissiveIntensity = b ? 8 : on ? 0.4 : 0;
        for (const gl of m.redGlow ?? []) glowOn(gl, r ? 1 : 0);
        for (const gl of m.blueGlow ?? []) glowOn(gl, b ? 1 : 0);
      }
    }
    if (v.custom) {
      const cv = v.custom;
      for (const w of cv.wheels) w.rotation.z = -v.wheel;
      if (cv.wheels[0]) cv.wheels[0].rotation.y = steer * 0.6;
      if (cv.rotor) cv.rotor.rotation.y += dt * 38;
      if (cv.tail) cv.tail.rotation.z += dt * 50;
      if (cv.fan) cv.fan.rotation.x += dt * (c.seats[0] >= 0 ? 40 : 0);
      if (cv.spot) cv.spot.visible = night > 0.3 && !c.wrecked;
      for (const h of cv.heads) (h.material as THREE.MeshStandardMaterial).emissiveIntensity = night > 0.15 ? 2.5 : 0.3;
    }
    // Who's at the wheel (seen through the glass, close by).
    const drv = s.peds.find((p) => p.id === c.seats[0]);
    const showDriver = drv && d < (this.quality === "low" ? 35 : 70) && !c.wrecked;
    if (showDriver) {
      const k = lookKey(drv);
      if (!v.driver || v.driverKey !== k) {
        if (v.driver) g.remove(v.driver.group);
        v.driver = this.makePed(drv);
        v.driverKey = k;
        g.add(v.driver.group);
      }
      const dm = v.driver;
      dm.group.visible = true;
      const bike = spec.body === "bike";
      const boat = spec.water;
      // Seated so the head clears the roof line (a coupe sits you low, a van high).
      const seatY = bike ? 0.55 : boat ? 0.35 : Math.max(-0.3, Math.min(0.6, (ROOF[spec.body] ?? 1.46) * spec.scale - 1.42));
      dm.group.position.set(bike ? -0.15 : boat ? -0.6 : spec.len * -0.02, seatY, bike ? 0 : spec.wid * 0.22);
      dm.group.rotation.set(0, 0, 0);
      posePed(dm, bike ? "sit" : boat ? "stand" : "sit", 0, 0, this.t, dt);
      if (spec.air) dm.group.visible = false;
    } else if (v.driver) v.driver.group.visible = false;
    // Wrecks go black.
    if (c.wrecked && !v.wrecked) {
      v.wrecked = true;
      g.traverse((o) => {
        const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (!mm || !("color" in mm)) return;
        const cl = mm.clone();
        cl.color.lerp(new THREE.Color("#141414"), 0.85);
        if ("emissiveIntensity" in cl) cl.emissiveIntensity = 0;
        (o as THREE.Mesh).material = cl;
      });
    }
    // Smoke from a damaged engine, flames when it's burning.
    const max = spec.hp;
    const smoking = !c.wrecked && c.hp < max * 0.3 && !spec.air;
    const burning = c.burn >= 0 || (c.wrecked && (this.t + c.id) % 1 < 0.4 && false);
    if ((smoking || burning || (c.wrecked && d < 80)) && d < 120 && Math.random() < dt * (burning ? 16 : c.wrecked ? 2 : 6)) {
      const fx = Math.cos(c.h);
      const fz = Math.sin(c.h);
      this.puff(c.x + fx * spec.len * 0.32, c.y + 1.1, c.z + fz * spec.len * 0.32, burning ? 1.4 : 1, burning && Math.random() < 0.6);
    }
    // Skid marks when sliding or braking hard.
    if (!spec.water && !spec.air && d < 100) {
      const rx = -Math.sin(c.h);
      const rz = Math.cos(c.h);
      const side = Math.abs(c.vx * rx + c.vz * rz);
      if (side > 2.4 || (c.brake && Math.abs(vf) > 11)) {
        const last = this.skidAt.get(c.id) ?? 0;
        if (this.t - last > 0.04) {
          this.skidAt.set(c.id, this.t);
          const fx = Math.cos(c.h);
          const fz = Math.sin(c.h);
          const m4 = new THREE.Matrix4();
          for (const sd of spec.body === "bike" ? [0] : [-1, 1]) {
            const x = c.x - fx * spec.len * 0.3 + rx * sd * (spec.wid / 2 - 0.2);
            const z = c.z - fz * spec.len * 0.3 + rz * sd * (spec.wid / 2 - 0.2);
            m4.compose(new THREE.Vector3(x, 0.05, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(c.vz, c.vx)), new THREE.Vector3(1, 1, 1));
            this.skids.setMatrixAt(this.skidN % 600, m4);
            this.skidN++;
          }
          this.skids.count = Math.min(600, this.skidN);
          this.skids.instanceMatrix.needsUpdate = true;
        }
      }
    }
  }

  puff(x: number, y: number, z: number, s = 1, fire = false) {
    const sp = this.smoke[this.smokeI++ % this.smoke.length];
    sp.material = fire ? fireMat : smokeMat;
    sp.position.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6);
    sp.userData.t = 0;
    sp.userData.life = fire ? 0.7 : 2.2;
    sp.userData.s = s * (fire ? 1.2 : 1.6);
    sp.visible = true;
  }

  dispose() {
    for (const v of this.peds.values()) this.scene.remove(v.m.group);
    for (const v of this.cars.values()) this.scene.remove(v.group);
    this.scene.remove(this.skids);
    for (const sp of this.smoke) this.scene.remove(sp);
  }
}

let checker: THREE.MeshStandardMaterial | null = null;

/** Repaint a police car the Victoria way: white, with a blue-and-white chequered band down each side. */
function victoriaLivery(kit: CarModel) {
  const bodyMesh = kit.group.children[0] as THREE.Mesh;
  (bodyMesh.material as THREE.MeshStandardMaterial).color.set("#f2f4f6");
  if (!checker) {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 16;
    const g = c.getContext("2d")!;
    for (let i = 0; i < 16; i++)
      for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 ? "#ffffff" : "#16358a";
        g.fillRect(i * 8, j * 8, 8, 8);
      }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    checker = new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  bodyMesh.geometry.computeBoundingBox();
  const bb = bodyMesh.geometry.boundingBox!;
  const len = (bb.max.x - bb.min.x) * 0.86;
  const y = bb.min.y + (bb.max.y - bb.min.y) * 0.5;
  for (const side of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.2), checker);
    band.position.set((bb.max.x + bb.min.x) / 2, y, side * (bb.max.z + 0.004));
    if (side < 0) band.rotation.y = Math.PI;
    kit.group.add(band);
  }
}

function lookKey(p: Ped) {
  const L = p.look;
  return `${L.seed}:${L.skin}:${L.shirt}:${L.pants}:${L.top ?? ""}:${L.bottom ?? ""}:${L.hat ?? ""}:${p.role === "cop"}`;
}

/** Standing on a sidewalk (raised kerb height)? */
function onWalk(s: State, x: number, z: number) {
  const seg = segAt(s.city, x, z, 4.5);
  if (!seg) return false;
  const A = s.city.roads.nodes[seg.a];
  const off = Math.abs((x - A.x) * seg.dz - (z - A.z) * seg.dx);
  return off > seg.half;
}
