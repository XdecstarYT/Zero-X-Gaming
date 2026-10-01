import * as THREE from "three";
import { setTextureDetail } from "../neon-siege/three/textures";
import { BONES, buildPed, posePed, type PedModel, type Pose } from "../code-3/people3d";
import { SportsPipeline, canvasTexture } from "../sports-kit/pipeline";
import type { Detail, TimeOfDay } from "../sports-kit/look";
import { blobTexture, glowTexture } from "../aussie-rules/textures";
import { buildPark, drawBoard, type Park } from "./park";
import { DerbySim, fenceAt, MOUND, PITCHES, ROUNDS, SWING_LAG, ZONE, type DerbyEvent } from "./sim";

export type DerbyCam = "batter" | "broadcast";

const HAND_R = BONES.indexOf("handR");
const HAND_L = BONES.indexOf("handL");
const DEG = Math.PI / 180;
/** Your club's colours: the Zero X All-Stars. */
export const ALL_STARS = { name: "Zero X All-Stars", shirt: "#13284d", accent: "#d61f3a", pants: "#e9e7e1" };

interface Body {
  model: PedModel;
  x: number;
  z: number;
  h: number;
  speed: number;
  step: number;
  home: [number, number];
}

/** Bat keyframes through the swing: [act, yaw (deg, 180 = toward the catcher), elevation (deg)]. */
const BAT_KEYS: [number, number, number][] = [
  [0, 182, 58],
  [0.3, 196, 46],
  [0.45, 92, -6],
  [0.62, 2, 8],
  [1, -112, 38],
];

function batAt(act: number): [number, number] {
  for (let i = 1; i < BAT_KEYS.length; i++) {
    const [a1, y1, e1] = BAT_KEYS[i];
    const [a0, y0, e0] = BAT_KEYS[i - 1];
    if (act <= a1) {
      const k = (act - a0) / (a1 - a0);
      const s = k * k * (3 - 2 * k);
      return [y0 + (y1 - y0) * s, e0 + (e1 - e0) * s];
    }
  }
  const l = BAT_KEYS[BAT_KEYS.length - 1];
  return [l[1], l[2]];
}

/** Ball texture: white leather, red double stitching. */
function ballTexture() {
  return canvasTexture(256, 128, (g) => {
    g.fillStyle = "#f3f1ea";
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = "#c0262d";
    g.lineWidth = 3;
    for (const off of [-5, 5]) {
      g.beginPath();
      for (let x = 0; x <= 256; x += 4) {
        const y = 64 + Math.sin((x / 256) * Math.PI * 4) * 34 + off;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

/**
 * Diamond Derby's view: the ballpark through the shared Sports+ pipeline, the
 * hitter, pitcher, catcher and outfield shaggers, the bat swung by keyframes
 * from the hitter's hands, the ball with a tracer, the plate coverage
 * indicator, fireworks, and a camera that cuts from the batter's box to the
 * flight of the ball.
 */
export class DerbyView {
  readonly pipe: SportsPipeline;
  private park: Park;
  private batter: Body;
  private pitcher: Body;
  private catcher: Body;
  private shaggers: Body[] = [];
  private bat: THREE.Mesh;
  private ball: THREE.Mesh;
  private ballGlow: THREE.Sprite;
  private ballShadow: THREE.Mesh;
  private trail: THREE.Line;
  private trailPts: Float32Array;
  private trailN = 0;
  private pci: THREE.Group;
  private pciRing: THREE.Mesh;
  private zone: THREE.LineLoop;
  private marker: THREE.Mesh;
  private fireworks: THREE.Points;
  private fw: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; r: number; g: number; b: number }[] = [];
  private time = 0;
  private cheer = 0;
  private swingT = -1;
  private camPos = new THREE.Vector3(-9.4, 4.1, 0.55);
  private camLook = new THREE.Vector3(12, 0.9, 0);
  private fov = 30;
  private boardKey = "";
  private last = "Welcome to the Derby";
  private pitchLine = "";
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private ray = new THREE.Raycaster();
  private landing: THREE.Vector3 | null = null;
  showAim = true;

  constructor(
    host: HTMLElement,
    private sim: DerbySim,
    detail: Detail,
    tod: TimeOfDay,
    private names: { you: string },
  ) {
    const high = detail !== "low";
    setTextureDetail(high ? "high" : "low");
    this.pipe = new SportsPipeline(host, detail, tod, { fov: 30, shadowSpan: 45, far: 3000 });
    const { scene } = this.pipe;
    this.park = buildPark(detail, [ALL_STARS.shirt, ALL_STARS.accent, "#0f766e", "#7c2d12"]);
    scene.add(this.park.group);
    this.pipe.lights(this.park.towers, { fog: 0.0009 });
    const lit = tod !== "day";
    for (const m of this.park.lampMats) m.emissiveIntensity = lit ? 4 : 0.15;
    (this.park.glows[0].material as THREE.SpriteMaterial).opacity = tod === "night" ? 0.9 : tod === "twilight" ? 0.45 : 0;
    this.park.windows.emissive.set(tod === "night" ? "#ffe9b0" : tod === "twilight" ? "#8a7a58" : "#000000");
    this.park.windows.emissiveIntensity = tod === "night" ? 0.55 : 0.3;

    const lod = high ? "high" : "low";
    const kit = (seed: number, shirt: string, pants: string, skin: string, num?: number): PedModel =>
      buildPed({
        skin,
        shirt,
        pants,
        seed,
        lod,
        outfit: { female: false, top: "tee", bottom: "trousers", socks: true, hat: "cap", backpack: false, officer: false, beard: seed % 3 === 0 },
        accent: ALL_STARS.accent,
        shoes: "#151515",
        hatColor: shirt,
        number: num,
        numberColor: "#ffffff",
      });
    const body = (model: PedModel, x: number, z: number, h: number): Body => {
      scene.add(model.group);
      model.group.traverse((o) => (o.castShadow = true));
      return { model, x, z, h, speed: 0, step: 0, home: [x, z] };
    };
    this.batter = body(kit(11, ALL_STARS.shirt, ALL_STARS.pants, "#c68c5d", 27), -0.15, -0.82, Math.PI / 2);
    this.pitcher = body(kit(23, "#1f2937", "#9ca3af", "#e0ac84", 51), MOUND, 0, Math.PI);
    this.catcher = body(kit(37, "#111827", "#374151", "#8d5a3b"), -1.0, 0.05, 0);
    for (const [x, z, i] of [
      [92, -44, 1],
      [112, 2, 2],
      [92, 46, 3],
    ]) this.shaggers.push(body(kit(60 + i * 7, i === 2 ? ALL_STARS.accent : "#334155", "#6b7280", ["#f1c9a5", "#8d5a3b", "#c68c5d"][i - 1]), x, z, Math.PI));

    // The bat: ash, a dark barrel tip, a knob.
    const batGeo = new THREE.LatheGeometry(
      [
        [0.0, 0],
        [0.026, 0.0],
        [0.026, 0.012],
        [0.013, 0.03],
        [0.012, 0.32],
        [0.022, 0.55],
        [0.032, 0.72],
        [0.033, 0.84],
        [0.02, 0.86],
        [0, 0.861],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      high ? 20 : 10,
    );
    this.bat = new THREE.Mesh(batGeo, new THREE.MeshStandardMaterial({ color: "#c79a5b", roughness: 0.35, metalness: 0.0 }));
    this.bat.castShadow = true;
    scene.add(this.bat);

    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.0366, 20, 14), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.55 }));
    this.ball.castShadow = true;
    scene.add(this.ball);
    this.ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#fff3c4", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
    this.ballGlow.scale.setScalar(0.25);
    this.ball.add(this.ballGlow);
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    scene.add(this.ballShadow);

    // The tracer: the ball's flight drawn in the air.
    this.trailPts = new Float32Array(400 * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(this.trailPts, 3));
    tg.setDrawRange(0, 0);
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: "#ffd84a", transparent: true, opacity: 0.85, toneMapped: false }));
    this.trail.frustumCulled = false;
    scene.add(this.trail);

    // The plate coverage indicator and the strike zone, drawn at the front of the plate.
    const aimMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthTest: false, toneMapped: false, side: THREE.DoubleSide });
    const r = sim.level.pci + 0.037;
    this.pciRing = new THREE.Mesh(new THREE.RingGeometry(r - 0.014, r, 48).rotateY(Math.PI / 2), aimMat);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 16).rotateY(Math.PI / 2), aimMat);
    const cross = new THREE.Mesh(new THREE.RingGeometry(r * 0.45 - 0.006, r * 0.45, 32).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.4, depthTest: false, toneMapped: false, side: THREE.DoubleSide }));
    this.pci = new THREE.Group();
    this.pci.add(this.pciRing, dot, cross);
    this.pci.renderOrder = 10;
    this.pci.traverse((o) => (o.renderOrder = 10));
    scene.add(this.pci);
    const zg = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.2, ZONE.lo, -ZONE.half),
      new THREE.Vector3(0.2, ZONE.hi, -ZONE.half),
      new THREE.Vector3(0.2, ZONE.hi, ZONE.half),
      new THREE.Vector3(0.2, ZONE.lo, ZONE.half),
    ]);
    this.zone = new THREE.LineLoop(zg, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, depthTest: false, toneMapped: false }));
    this.zone.renderOrder = 9;
    scene.add(this.zone);
    this.marker = new THREE.Mesh(new THREE.CircleGeometry(0.037, 20).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffd84a", transparent: true, opacity: 0, depthTest: false, toneMapped: false, side: THREE.DoubleSide }));
    this.marker.renderOrder = 11;
    scene.add(this.marker);

    // Fireworks over centre field for home runs.
    const fp = new Float32Array(900 * 3);
    const fc = new Float32Array(900 * 3);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(fp, 3));
    fg.setAttribute("color", new THREE.BufferAttribute(fc, 3));
    fg.setDrawRange(0, 0);
    this.fireworks = new THREE.Points(fg, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    this.fireworks.frustumCulled = false;
    scene.add(this.fireworks);
    this.updateBoard();
  }

  get canvas() {
    return this.pipe.canvas;
  }
  get camera() {
    return this.pipe.camera;
  }
  setResolution(k: number) {
    this.pipe.setResolution(k);
  }

  /** Where a point on the screen (normalised −1..1) meets the plate's plane: the aim (z, y). */
  aimFromScreen(nx: number, ny: number): { z: number; y: number } | null {
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.pipe.camera);
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    if (Math.abs(d.x) < 1e-4) return null;
    const t = (0.2 - o.x) / d.x;
    if (t <= 0) return null;
    return { z: o.z + d.z * t, y: o.y + d.y * t };
  }

  onEvent(e: DerbyEvent) {
    const s = this.sim;
    switch (e.kind) {
      case "pitch":
        this.pitchLine = `${e.mph} mph ${PITCHES[e.type].name}`;
        this.trailN = 0;
        this.trail.geometry.setDrawRange(0, 0);
        this.landing = null;
        this.swingT = -1;
        (this.marker.material as THREE.MeshBasicMaterial).opacity = 0;
        break;
      case "swing":
        this.swingT = 0;
        break;
      case "contact":
        this.cheer = Math.max(this.cheer, Math.min(0.6, (e.ev - 85) / 40));
        break;
      case "homer":
        this.cheer = 1;
        this.last = `${e.moonshot ? "Moonshot" : "Home run"}! ${e.dist} ft · ${e.ev} mph · ${e.la}°`;
        this.launchFireworks(e.moonshot ? 5 : 3);
        break;
      case "take":
        this.last = e.strike ? "Called strike" : "Ball, taken";
        this.showMarker();
        break;
      case "miss":
        this.last = `Swing and a miss (${e.why})`;
        this.showMarker();
        break;
      case "out":
        if (e.why !== "Called strike" && e.why !== "Swing and a miss") this.last = `${e.why} · ${s.hit ? `${s.hit.dist} ft` : ""}`;
        break;
      case "round":
        this.last = e.won ? `${ROUNDS[e.round]} won, ${e.you}–${e.them}` : `Out in the ${ROUNDS[e.round].toLowerCase()}, ${e.you}–${e.them}`;
        this.cheer = e.won ? 0.8 : 0.2;
        break;
      case "over":
        if (e.champion) this.launchFireworks(8);
        break;
      default:
        break;
    }
    this.updateBoard();
  }

  private showMarker() {
    const p = this.sim.pitch;
    if (!p) return;
    this.marker.position.set(0.21, p.plate.y, p.plate.z);
    (this.marker.material as THREE.MeshBasicMaterial).opacity = 0.9;
  }

  private launchFireworks(bursts: number) {
    const cols = [
      [1, 0.85, 0.3],
      [1, 0.3, 0.35],
      [0.4, 0.8, 1],
      [1, 1, 1],
      [0.6, 1, 0.5],
    ];
    for (let b = 0; b < bursts; b++) {
      const x = fenceAt(0) + 40 + Math.random() * 40;
      const z = (Math.random() - 0.5) * 120;
      const y = 45 + Math.random() * 35;
      const c = cols[Math.floor(Math.random() * cols.length)];
      const delay = b * 0.35;
      for (let i = 0; i < 160 && this.fw.length < 900; i++) {
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const sp = 16 + Math.random() * 6;
        const k = Math.sqrt(1 - u * u);
        this.fw.push({ x, y, z, vx: k * Math.cos(a) * sp, vy: u * sp, vz: k * Math.sin(a) * sp, life: 2.6 + delay, r: c[0], g: c[1], b: c[2] });
      }
    }
  }

  private updateBoard() {
    const s = this.sim;
    const key = `${s.round}|${s.hrs}|${s.outs}|${this.last}|${this.pitchLine}`;
    if (key === this.boardKey) return;
    this.boardKey = key;
    drawBoard(this.park.board.canvas, {
      title: ROUNDS[Math.min(s.round, ROUNDS.length - 1)],
      you: this.names.you,
      youHr: s.hrs,
      them: s.opponent.name.replace(/".*" /, ""),
      themHr: s.opponent.hrs,
      outs: s.outs,
      last: this.last,
      pitch: this.pitchLine || "Pitching: coach Hal Brennan",
    });
    this.park.board.texture.needsUpdate = true;
  }

  private place(b: Body, pose: Pose, dt: number, act = 0) {
    const g = b.model.group;
    g.position.set(b.x, b === this.pitcher ? 0.25 : 0, b.z);
    g.rotation.y = -b.h;
    posePed(b.model, pose, b.step, b.speed, this.time, dt, act);
  }

  render(dt: number, cam: DerbyCam) {
    const s = this.sim;
    this.time += dt;
    const p = s.pitch;
    const h = s.hit;

    // ----------------------------------------------------------- people
    // Batter: the stance, then the swing (contact SWING_LAG after the press), then the finish.
    let swingAct = 0;
    if (this.swingT >= 0) {
      this.swingT += dt;
      const t = this.swingT;
      swingAct = t < SWING_LAG ? (t / SWING_LAG) * 0.45 : Math.min(1, 0.45 + ((t - SWING_LAG) / 0.45) * 0.55);
    }
    if (s.phase === "ready" || s.phase === "intro" || s.phase === "roundEnd" || s.phase === "over") this.swingT = -1;
    this.place(this.batter, this.swingT >= 0 ? "swing" : "batStance", dt, swingAct);
    // Pitcher: the wind-up and delivery; release lines up with the sim's.
    let pAct = 0;
    if (s.phase === "windup") pAct = (s.phaseT / 0.85) * 0.55;
    else if (s.phase === "pitch" && p) pAct = 0.55 + Math.min(1, p.t / 0.6) * 0.45;
    else if (s.phase === "result") pAct = 1;
    this.place(this.pitcher, s.phase === "windup" || s.phase === "pitch" || (s.phase === "result" && s.phaseT < 0.6) ? "pitch" : "stand", dt, pAct);
    this.place(this.catcher, "catcher", dt);
    // Shaggers: jog to a ball that stays in the park, then wander home.
    for (const b of this.shaggers) {
      let tx = b.home[0];
      let tz = b.home[1];
      if (this.landing && !h?.hr) {
        const d = Math.hypot(this.landing.x - b.x, this.landing.z - b.z);
        const nearest = this.shaggers.every((o) => Math.hypot(this.landing!.x - o.x, this.landing!.z - o.z) >= d);
        if (nearest && this.landing.x > 30) {
          tx = this.landing.x;
          tz = this.landing.z;
        }
      }
      const dx = tx - b.x;
      const dz = tz - b.z;
      const d = Math.hypot(dx, dz);
      const want = d > 1.5 ? Math.min(6.5, d) : 0;
      b.speed += (want - b.speed) * Math.min(1, dt * 3);
      if (d > 0.2 && b.speed > 0.1) {
        b.x += (dx / d) * b.speed * dt;
        b.z += (dz / d) * b.speed * dt;
        b.h = Math.atan2(dz, dx);
      } else b.h += (Math.atan2(-b.z, -b.x) - b.h) * Math.min(1, dt * 2);
      b.step += b.speed * dt;
      this.place(b, b.speed > 0.3 ? "walk" : "stand", dt);
    }
    this.batter.model.group.updateMatrixWorld(true);

    // -------------------------------------------------------------- bat
    const hands = this.batter.model.bones[HAND_R].getWorldPosition(this.tmp);
    const handsL = this.batter.model.bones[HAND_L].getWorldPosition(this.tmp2);
    hands.lerp(handsL, 0.5);
    const [yaw, elev] = batAt(this.swingT >= 0 ? swingAct : 0);
    const dir = new THREE.Vector3(Math.cos(yaw * DEG) * Math.cos(elev * DEG), Math.sin(elev * DEG), Math.sin(yaw * DEG) * Math.cos(elev * DEG));
    this.bat.quaternion.setFromUnitVectors(this.up, dir);
    this.bat.position.copy(hands).addScaledVector(dir, -0.09);

    // ------------------------------------------------------------- ball
    let bx = 0;
    let by = -5;
    let bz = 0;
    if (s.phase === "windup" || s.phase === "ready") {
      const hand = this.pitcher.model.bones[HAND_R].getWorldPosition(this.tmp2);
      [bx, by, bz] = [hand.x, hand.y, hand.z];
      if (s.phase === "ready") by = -5;
    } else if (h) {
      [bx, by, bz] = [h.x, h.y, h.z];
      if (this.trailN < 400 && !h.landed) {
        this.trailPts.set([h.x, h.y, h.z], this.trailN * 3);
        this.trailN++;
        this.trail.geometry.setDrawRange(0, this.trailN);
        (this.trail.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      }
      if (h.landed && !this.landing) this.landing = new THREE.Vector3(h.x, 0, h.z);
    } else if (p) {
      if (s.phase === "result" && p.x <= 0.25) {
        // Into the catcher's mitt.
        const mitt = this.catcher.model.bones[HAND_L].getWorldPosition(this.tmp2);
        [bx, by, bz] = [mitt.x + 0.08, mitt.y, mitt.z];
      } else [bx, by, bz] = [p.x, p.y, p.z];
    }
    this.ball.position.set(bx, by, bz);
    this.ball.visible = by > -1;
    this.ballShadow.visible = this.ball.visible && by < 40;
    this.ballShadow.position.set(bx, 0.02, bz);
    this.ballShadow.scale.setScalar(0.25 + by * 0.02);
    (this.trail.material as THREE.LineBasicMaterial).opacity = h ? 0.85 : Math.max(0, (this.trail.material as THREE.LineBasicMaterial).opacity - dt);

    // -------------------------------------------------------------- aim
    const aiming = this.showAim && (s.phase === "ready" || s.phase === "windup" || s.phase === "pitch" || (s.phase === "result" && !h));
    this.pci.visible = this.zone.visible = aiming;
    this.pci.position.set(0.2, s.aim.y, s.aim.z);
    const near = p && s.phase === "pitch" ? Math.max(0, 1 - Math.abs(p.plate.t - p.t - SWING_LAG) / 0.25) : 0;
    (this.pciRing.material as THREE.MeshBasicMaterial).color.setRGB(1, 1 - near * 0.15, 1 - near * 0.75);
    this.marker.visible = s.phase === "result" && !h;

    // --------------------------------------------------------- fireworks
    const fpos = this.fireworks.geometry.getAttribute("position") as THREE.BufferAttribute;
    const fcol = this.fireworks.geometry.getAttribute("color") as THREE.BufferAttribute;
    let n = 0;
    this.fw = this.fw.filter((f) => (f.life -= dt) > 0);
    for (const f of this.fw) {
      if (f.life < 2.6) {
        f.vy -= 6 * dt;
        f.vx *= 1 - dt * 0.9;
        f.vy *= 1 - dt * 0.9;
        f.vz *= 1 - dt * 0.9;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.z += f.vz * dt;
      }
      const k = f.life < 2.6 ? Math.min(1, f.life / 1.2) * 2.4 : 0;
      fpos.setXYZ(n, f.x, f.y, f.z);
      fcol.setXYZ(n, f.r * k, f.g * k, f.b * k);
      n++;
    }
    fpos.needsUpdate = fcol.needsUpdate = true;
    this.fireworks.geometry.setDrawRange(0, n);

    // ------------------------------------------------------------ crowd
    this.cheer = Math.max(0, this.cheer - dt * 0.18);
    this.park.crowd.uTime.value = this.time;
    this.park.crowd.uCheer.value = this.cheer;
    this.updateBoard();

    // ----------------------------------------------------------- camera
    this.camera_(dt, cam);
    const focus = h && !h.landed ? h : { x: 0, z: 0 };
    this.pipe.follow(Math.min(focus.x, 60), focus.z * 0.5);
    this.pipe.render();
  }

  private camera_(dt: number, mode: DerbyCam) {
    const s = this.sim;
    const h = s.hit;
    const c = this.pipe.camera;
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    let fov: number;
    let snap = false;
    if (s.phase === "intro" || s.phase === "roundEnd" || s.phase === "over") {
      // A slow drone pass over the park.
      const a = this.time * 0.07 + 2.6;
      pos = new THREE.Vector3(45 + Math.cos(a) * 95, 42, Math.sin(a) * 95);
      look = new THREE.Vector3(45, 2, 0);
      fov = 42;
      snap = s.phaseT < 0.05;
    } else if (h && h.t > 0.12) {
      // Follow the flight from behind the plate, zooming with the distance.
      const d = Math.hypot(h.x, h.z);
      pos = new THREE.Vector3(-14 - d * 0.04, 5 + Math.min(18, h.y * 0.25), h.z * 0.12);
      // Keep the field in the frame: look between the ball and the grass under it.
      look = h.landed && this.landing ? this.landing.clone().setY(2) : new THREE.Vector3(h.x, h.y * 0.55, h.z);
      const dist = pos.distanceTo(look);
      fov = Math.max(14, Math.min(40, (2 * Math.atan((22 + h.y * 0.6) / dist)) / DEG));
    } else if (mode === "broadcast") {
      // The classic centre-field camera, long lens over the pitcher's shoulder.
      pos = new THREE.Vector3(128, 9.5, -4.2);
      look = new THREE.Vector3(0, 1.1, -0.15);
      fov = 3.6;
      snap = true;
    } else {
      pos = new THREE.Vector3(-9.4, 4.1, 0.55);
      look = new THREE.Vector3(12, 0.35, 0);
      fov = 27;
      snap = this.camPos.distanceTo(pos) > 30;
    }
    const k = snap ? 1 : Math.min(1, dt * 3.2);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, snap ? 1 : Math.min(1, dt * 6));
    this.fov += (fov - this.fov) * (snap ? 1 : Math.min(1, dt * 2.5));
    c.position.copy(this.camPos);
    c.lookAt(this.camLook);
    if (Math.abs(c.fov - this.fov) > 0.01) {
      c.fov = this.fov;
      c.updateProjectionMatrix();
    }
    // The ball is tiny: draw it larger the further it is from the lens.
    const bd = c.position.distanceTo(this.ball.position);
    const visible = (2 * Math.tan((c.fov * DEG) / 2) * bd) / 700;
    this.ball.scale.setScalar(Math.max(1, visible / 0.0366));
    this.ballGlow.visible = !!this.sim.hit && !this.sim.hit.landed;
  }

  destroy() {
    this.pipe.destroy();
  }
}
