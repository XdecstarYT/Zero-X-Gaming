import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { setTextureDetail } from "../neon-siege/three/textures";
import { GRADE_SHADER, nightDome, physicalSky, type TimeOfDay } from "../sports-kit/look";
import { BONES, buildPed, posePed, type PedModel, type Pose } from "../code-3/people3d";
import { buildStadium, type Detail, type Stadium } from "./stadium";
import { A, B, FootySim, GOAL_X, points, type Official, type Player, type SimEvent } from "./sim";
import { ballTexture, blobTexture, ringTexture } from "./textures";

export type { TimeOfDay } from "../sports-kit/look";
export type CamMode = "tv" | "follow";

const HAND_L = BONES.indexOf("handL");
const HAND_R = BONES.indexOf("handR");
const SKINS = ["#f1c9a5", "#e8b896", "#d9a07a", "#c68c5d", "#a8714a", "#8d5a3b", "#6b4430", "#4f3222"];
const HAIRS = ["#2a1d14", "#1a1410", "#4a3020", "#7a5a38", "#b08a58", "#d9b98a", "#3a2a20"];

interface Body {
  model: PedModel;
  t: number;
}

/** One frame of the match, kept for instant replays. */
interface Snap {
  t: number;
  players: Player[];
  ball: FootySim["ball"];
  umpire: Official;
  goalUmps: [Official, Official];
  tackle: FootySim["tackle"];
  stoppage: FootySim["stoppage"];
  human: number;
}

export interface ViewOptions {
  /** Rain: a slick, darker ground, overcast light and falling rain. */
  wet?: boolean;
  /** Watching, not playing (Live Sports): no markers for "your" player. */
  spectator?: boolean;
  /** Instant replays of goals: seconds of build-up shown, and the playback speed. */
  replay?: { window: number; speed: number } | false;
}

export class FootyView {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.3, 2500);
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;
  private stadium: Stadium;
  private players: Body[] = [];
  private officials: Body[] = [];
  private ball: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private you: THREE.Mesh;
  private youArrow: THREE.Mesh;
  private drop: THREE.Mesh;
  private target: THREE.Mesh;
  private ray = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private arc: THREE.Line;
  private key = new THREE.DirectionalLight("#fff4e0", 2.6);
  private fills: THREE.DirectionalLight[] = [];
  private hemi = new THREE.HemisphereLight("#cfe2ff", "#3a4a2a", 1.0);
  private focus = new THREE.Vector3();
  private camPos = new THREE.Vector3(0, 30, -90);
  private camLook = new THREE.Vector3();
  private cheer = 0;
  private time = 0;
  private resScale = 1;
  private ro: ResizeObserver;
  private screenKey = "";
  private headline = "";
  private headlineT = 0;
  private cutTo = 0;
  private lastScorer = -1;
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private qYaw = new THREE.Quaternion();
  private qSpin = new THREE.Quaternion();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly xAxis = new THREE.Vector3(1, 0, 0);
  private ballRoll = 0;

  // Instant replay.
  private history: Snap[] = [];
  private lastRec = -1;
  private replayQ: { at: number; goalT: number; side: number } | null = null;
  private replayFrames: Snap[] | null = null;
  private replayT = 0;
  private replayI = 0;
  private replaySide = 1;
  replaying = false;
  // Weather and the premiership cup.
  private rain: THREE.LineSegments | null = null;
  private cup: THREE.Group | null = null;
  private confetti: THREE.Points | null = null;
  private confettiV: Float32Array | null = null;
  private celebrateTeam = -1;

  constructor(
    private host: HTMLElement,
    private sim: FootySim,
    private detail: Detail,
    private tod: TimeOfDay,
    private opts: ViewOptions = {},
  ) {
    const high = detail !== "low";
    this.renderer = new THREE.WebGLRenderer({ antialias: !high, powerPreference: "high-performance", stencil: false });
    this.renderer.setPixelRatio(this.baseRatio());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "absolute inset-0 h-full w-full";
    this.canvas.tabIndex = 0;
    host.appendChild(this.canvas);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    setTextureDetail(high ? "high" : "low");

    // The ground and stands.
    this.stadium = buildStadium(detail, sim.clubs[0], sim.clubs[1]);
    this.scene.add(this.stadium.group);

    // Players: guernsey, shorts, socks in the hoop colour, numbers on the back.
    for (const p of sim.players) {
      const club = sim.clubs[p.team];
      const seed = p.id * 7919 + 13;
      const model = buildPed({
        skin: SKINS[(seed >> 3) % SKINS.length],
        shirt: club.guernsey,
        pants: club.shorts,
        hair: HAIRS[(seed >> 5) % HAIRS.length],
        seed,
        lod: high ? "high" : "low",
        outfit: { female: false, top: "guernsey", bottom: "shorts", socks: true, hat: "none", backpack: false, officer: false },
        accent: club.hoop,
        shoes: "#121212",
        number: p.number,
        numberColor: club.number,
      });
      model.group.scale.setScalar(1.05);
      this.scene.add(model.group);
      this.players.push({ model, t: Math.random() * 10 });
    }
    // Officials: the field umpire in fluoro, goal umpires in white coats and hats.
    const ump = buildPed({ skin: "#e0ac84", shirt: "#c6f03a", pants: "#111318", seed: 991, lod: high ? "high" : "low", outfit: { female: false, top: "tee", bottom: "shorts", socks: true, hat: "none", backpack: false, officer: false, hair: "short", beard: false }, accent: "#111318", shoes: "#111" });
    this.scene.add(ump.group);
    this.officials.push({ model: ump, t: 0 });
    for (const s of [3, 5]) {
      const g = buildPed({ skin: SKINS[s], shirt: "#f4f4f2", pants: "#f4f4f2", seed: 400 + s, lod: "low", outfit: { female: false, top: "long", bottom: "trousers", hat: "cap", backpack: false, officer: false }, hatColor: "#f4f4f2", shoes: "#f0f0f0" });
      this.scene.add(g.group);
      this.officials.push({ model: g, t: 0 });
    }

    // The ball: a prolate red leather spheroid.
    const bg = new THREE.SphereGeometry(0.145, 32, 18).rotateZ(Math.PI / 2).scale(1, 0.63, 0.63);
    this.ball = new THREE.Mesh(bg, new THREE.MeshPhysicalMaterial({ map: ballTexture(), roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.45 }));
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    const blob = blobTexture();
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    this.scene.add(this.ballShadow);
    // Your player: a ring and an arrow; the drop zone; the kick arc.
    const ring = ringTexture();
    this.you = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ring, color: sim.clubs[0].hoop, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }));
    this.youArrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 3).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: sim.clubs[0].hoop }));
    this.drop = new THREE.Mesh(new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ring, color: "#ffffff", transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }));
    this.arc = new THREE.Line(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(300), 3)), new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.75, depthWrite: false }));
    this.arc.frustumCulled = false;
    this.target = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ring, color: "#facc15", transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }));
    this.target.visible = false;
    this.scene.add(this.you, this.youArrow, this.drop, this.arc, this.target);

    this.setupLighting(high);

    if (high) {
      const r = host.getBoundingClientRect();
      const w = Math.max(1, r.width);
      const h = Math.max(1, r.height);
      const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.setPixelRatio(this.postRatio());
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      if (detail === "ultra") {
        const ao = new GTAOPass(this.scene, this.camera, w, h);
        ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1 });
        ao.blendIntensity = 0.8;
        this.composer.addPass(ao);
      }
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), tod === "night" ? 0.55 : 0.3, 0.5, tod === "night" ? 0.86 : 0.92);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      this.composer.addPass(new SMAAPass());
      this.grade = new ShaderPass(GRADE_SHADER);
      this.grade.uniforms.warm.value = tod === "twilight" ? 1 : 0;
      this.composer.addPass(this.grade);
    }
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.drawScreen(true);
    if (opts.wet) this.makeWet(high);
    if (opts.spectator) this.you.visible = this.youArrow.visible = false;
  }

  /** Rain: overcast light, a slick ground that catches the reflections, and the rain itself. */
  private makeWet(high: boolean) {
    this.key.intensity *= 0.55;
    this.hemi.intensity *= 0.8;
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.density *= 2.6;
      if (this.tod === "day") fog.color.set("#7c8692");
    }
    this.scene.environmentIntensity *= 1.6;
    const g = this.stadium.ground;
    g.roughness = 0.42;
    g.color.multiplyScalar(0.8);
    const n = high ? 2600 : 900;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 70;
      const y = Math.random() * 32;
      const z = (Math.random() - 0.5) * 70;
      pos.set([x, y, z, x + 0.06, y + 0.55, z + 0.02], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#d4dde8", transparent: true, opacity: this.tod === "night" ? 0.42 : 0.3, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  private stepRain(dt: number) {
    const r = this.rain;
    if (!r) return;
    const a = r.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    const c = this.camera.position;
    const fall = 17 * dt;
    for (let i = 0; i < arr.length; i += 6) {
      let y = arr[i + 1] - fall;
      let x = arr[i] - fall * 0.1;
      let z = arr[i + 2];
      if (y < 0) y += 32;
      // Keep the drops in a 70 m box round the camera.
      if (x - c.x > 35) x -= 70;
      else if (x - c.x < -35) x += 70;
      if (z - c.z > 35) z -= 70;
      else if (z - c.z < -35) z += 70;
      arr[i] = x;
      arr[i + 1] = y;
      arr[i + 2] = z;
      arr[i + 3] = x + 0.06;
      arr[i + 4] = y + 0.55;
      arr[i + 5] = z + 0.02;
    }
    a.needsUpdate = true;
  }

  // ------------------------------------------------------- instant replay

  private record() {
    const sim = this.sim;
    if (this.opts.replay === false || this.replaying || sim.time - this.lastRec < 1 / 30) return;
    this.lastRec = sim.time;
    this.history.push({
      t: sim.time,
      players: sim.players.map((p) => ({ ...p, act: p.act ? { ...p.act } : null })),
      ball: { ...sim.ball },
      umpire: { ...sim.umpire },
      goalUmps: [{ ...sim.goalUmps[0] }, { ...sim.goalUmps[1] }],
      tackle: sim.tackle ? { ...sim.tackle } : null,
      stoppage: sim.stoppage ? { ...sim.stoppage } : null,
      human: sim.human,
    });
    if (this.history.length > 300) this.history.splice(0, this.history.length - 300);
  }

  /** The ground point under a screen position (normalised device coordinates). */
  groundAt(nx: number, ny: number): { x: number; z: number } | null {
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const hit = this.ray.ray.intersectPlane(this.groundPlane, this.tmp);
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  /** Replay the last few seconds now (test hook). */
  replayNow() {
    this.replayQ = { at: this.time, goalT: this.sim.time, side: this.sim.ball.x > 0 ? 1 : -1 };
  }

  /** Stop any replay (and drop a queued one). */
  cancelReplay() {
    this.replaying = false;
    this.replayQ = null;
    this.replayFrames = null;
  }

  /** A frame of the replay: between two snapshots, interpolated. */
  private ghost(a: Snap, b: Snap, k: number) {
    const lerp = (x: number, y: number) => x + (y - x) * k;
    const lerpA = (x: number, y: number) => x + Math.atan2(Math.sin(y - x), Math.cos(y - x)) * k;
    const players = a.players.map((p, i) => {
      const q = b.players[i];
      return { ...p, x: lerp(p.x, q.x), y: lerp(p.y, q.y), z: lerp(p.z, q.z), h: lerpA(p.h, q.h), step: lerp(p.step, q.step), speed: lerp(p.speed, q.speed), act: p.act && q.act && p.act.kind === q.act.kind ? { ...p.act, t: lerp(p.act.t, q.act.t) } : p.act };
    });
    const ball = { ...a.ball, x: lerp(a.ball.x, b.ball.x), y: lerp(a.ball.y, b.ball.y), z: lerp(a.ball.z, b.ball.z), spin: lerp(a.ball.spin, b.ball.spin) };
    const real = this.sim;
    return {
      players,
      ball,
      umpire: a.umpire,
      goalUmps: a.goalUmps,
      tackle: a.tackle,
      stoppage: a.stoppage,
      human: a.human,
      phase: "play",
      landing: null,
      set: null,
      clubs: real.clubs,
      score: real.score,
      quarter: real.quarter,
      clock: real.clock,
      time: a.t,
      get you() {
        return players[a.human];
      },
    } as unknown as FootySim;
  }

  /** Play the replay; false when it's over. */
  private renderReplay(dt: number) {
    const frames = this.replayFrames;
    if (!frames) return false;
    const speed = this.opts.replay ? this.opts.replay.speed : 0.5;
    this.replayT += dt * speed;
    const t = frames[0].t + this.replayT;
    while (this.replayI < frames.length - 2 && frames[this.replayI + 1].t <= t) this.replayI++;
    const a = frames[this.replayI];
    const b = frames[Math.min(frames.length - 1, this.replayI + 1)];
    if (t >= frames[frames.length - 1].t) {
      this.cancelReplay();
      this.cutTo = 1;
      return false;
    }
    const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    const real = this.sim;
    this.sim = this.ghost(a, b, k);
    const sim = this.sim;
    sim.players.forEach((p, i) => this.updatePlayer(p, this.players[i], dt * speed));
    this.updateOfficial(sim.umpire, this.officials[0], dt * speed);
    this.updateOfficial(sim.goalUmps[0], this.officials[1], dt * speed);
    this.updateOfficial(sim.goalUmps[1], this.officials[2], dt * speed);
    this.updateBall(dt * speed);
    // Behind the goals, low, looking back up the ground at the ball.
    const bl = sim.ball;
    const want = this.tmp.set(this.replaySide * (GOAL_X + 6), 2.6, Math.max(-1.8, Math.min(1.8, bl.z * 0.2)));
    const look = this.tmp2.set(bl.x, Math.max(1, bl.y * 0.8), bl.z);
    this.camPos.lerp(want, this.replayT < 0.05 ? 1 : 1 - Math.exp(-dt * 2));
    this.camLook.lerp(look, this.replayT < 0.05 ? 1 : 1 - Math.exp(-dt * 6));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    const dist = this.camPos.distanceTo(this.camLook);
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(6, 9 + bl.y * 0.4) / dist));
    this.camera.fov += (Math.min(45, fov) - this.camera.fov) * Math.min(1, dt * 3);
    this.camera.updateProjectionMatrix();
    this.sim = real;
    this.focus.set(bl.x, 0, bl.z);
    this.you.visible = this.youArrow.visible = this.drop.visible = this.arc.visible = false;
    return true;
  }

  // -------------------------------------------------------- the premiers

  /** The siren in a Grand Final: confetti, and the captain holds up the cup. */
  celebrate(team: 0 | 1) {
    if (this.cup) return;
    this.celebrateTeam = team;
    const gold = new THREE.MeshStandardMaterial({ color: "#f0cc62", metalness: 0.85, roughness: 0.25, emissive: "#6b4a0a", emissiveIntensity: 0.6 });
    const cup = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          [0.0, 0],
          [0.12, 0],
          [0.12, 0.03],
          [0.04, 0.08],
          [0.035, 0.22],
          [0.09, 0.28],
          [0.16, 0.42],
          [0.17, 0.55],
          [0.15, 0.58],
        ].map(([r, y]) => new THREE.Vector2(r, y)),
        32,
      ),
      gold,
    );
    cup.add(body);
    for (const s of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 8, 20, Math.PI * 1.2), gold);
      handle.position.set(0, 0.44, s * 0.17);
      handle.rotation.set(0, Math.PI / 2, s > 0 ? -0.6 : Math.PI + 0.6);
      cup.add(handle);
    }
    const ribbonMat = new THREE.MeshStandardMaterial({ color: this.sim.clubs[team].guernsey, roughness: 0.6, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const rb = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.4), ribbonMat);
      rb.position.set(0, 0.3, s * 0.2);
      cup.add(rb);
    }
    cup.traverse((o) => (o.castShadow = true));
    cup.scale.setScalar(1.35);
    this.cup = cup;
    this.scene.add(cup);
    const n = 2400;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.confettiV = new Float32Array(n * 3);
    const club = this.sim.clubs[team];
    const palette = [club.guernsey, club.hoop, "#ffffff", club.guernsey].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      pos.set([(Math.random() - 0.5) * 70, 6 + Math.random() * 40, (Math.random() - 0.5) * 60], i * 3);
      const c = palette[i % palette.length];
      col.set([c.r, c.g, c.b], i * 3);
      this.confettiV.set([(Math.random() - 0.5) * 1.5, -1.2 - Math.random() * 1.6, (Math.random() - 0.5) * 1.5], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.confetti = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.32, vertexColors: true }));
    this.confetti.frustumCulled = false;
    this.scene.add(this.confetti);
    this.cheer = 1;
  }

  /** The captain: the winning side's player nearest the centre. */
  private captain() {
    const team = this.celebrateTeam;
    let best = this.sim.players.find((p) => p.team === team)!;
    for (const p of this.sim.players) if (p.team === team && Math.hypot(p.x, p.z) < Math.hypot(best.x, best.z)) best = p;
    return best;
  }

  private stepCelebration(dt: number) {
    if (!this.cup || !this.confetti || !this.confettiV) return;
    this.cheer = Math.max(this.cheer, 0.9);
    const cap = this.captain();
    const body = this.players[cap.id].model;
    body.group.updateMatrixWorld(true);
    const l = body.bones[HAND_L].getWorldPosition(this.tmp);
    const r = body.bones[HAND_R].getWorldPosition(this.tmp2);
    this.cup.position.copy(l).add(r).multiplyScalar(0.5);
    this.cup.position.y += 0.02;
    this.cup.rotation.y = -cap.h + Math.PI / 2;
    const a = this.confetti.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    const v = this.confettiV;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += (v[i] + Math.sin(this.time * 2 + i) * 0.6) * dt;
      arr[i + 1] += v[i + 1] * dt;
      arr[i + 2] += (v[i + 2] + Math.cos(this.time * 1.7 + i) * 0.6) * dt;
      if (arr[i + 1] < 0.02) arr[i + 1] = 0.02;
    }
    a.needsUpdate = true;
  }

  private baseRatio() {
    return Math.min(window.devicePixelRatio || 1, this.detail === "ultra" ? 2 : this.detail === "high" ? 1.5 : 1.25);
  }
  private postRatio() {
    return this.baseRatio() * this.resScale;
  }

  /** Render-resolution scale (1 = full), for adaptive performance. */
  setResolution(k: number) {
    this.resScale = k;
    this.renderer.setPixelRatio(this.baseRatio() * k);
    this.composer?.setPixelRatio(this.postRatio());
    this.resize();
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    if (this.grade) (this.grade.uniforms.texel.value as THREE.Vector2).set(1 / (w * this.postRatio()), 1 / (h * this.postRatio()));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------- lighting

  private setupLighting(high: boolean) {
    const tod = this.tod;
    const key = this.key;
    key.castShadow = true;
    key.shadow.mapSize.set(high ? 4096 : 1024, high ? 4096 : 1024);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -48;
    sc.right = sc.top = 48;
    sc.near = 1;
    sc.far = 400;
    key.shadow.bias = -0.0003;
    key.shadow.radius = 2;
    key.shadow.normalBias = 0.025;
    this.scene.add(key, key.target, this.hemi);

    const skyScene = new THREE.Scene();
    let sunDir = new THREE.Vector3(0.45, 0.72, 0.52).normalize();
    if (tod === "night") {
      const dome = nightDome();
      this.scene.add(dome);
      skyScene.add(dome.clone());
      // Floodlit: a high key light plus soft fills from the other towers.
      sunDir = new THREE.Vector3(0.22, 1, 0.3).normalize();
      key.color.set("#f3f5ff");
      key.intensity = 2.3;
      this.hemi.color.set("#4b5a7a");
      this.hemi.groundColor.set("#1c2414");
      this.hemi.intensity = 0.45;
      this.renderer.toneMappingExposure = 1.05;
      this.scene.fog = new THREE.FogExp2("#0b0d14", 0.0011);
      // Stars.
      const sp = new Float32Array(1500 * 3);
      for (let i = 0; i < 1500; i++) {
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(850);
        sp.set([v.x, v.y, v.z], i * 3);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
      this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffffff", size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.6, fog: false })));
    } else {
      const sky = physicalSky();
      sky.scale.setScalar(1500);
      const u = (sky.material as THREE.ShaderMaterial).uniforms;
      if (tod === "twilight") sunDir = new THREE.Vector3(-0.8, 0.09, 0.45).normalize();
      (u.sunPosition.value as THREE.Vector3).copy(sunDir);
      u.turbidity.value = tod === "twilight" ? 4.5 : 2.4;
      u.rayleigh.value = tod === "twilight" ? 2.8 : 1.4;
      u.mieCoefficient.value = 0.005;
      u.mieDirectionalG.value = 0.82;
      u.cloudCoverage.value = high ? (tod === "twilight" ? 0.45 : 0.3) : 0;
      u.cloudDensity.value = 0.5;
      u.cloudElevation.value = 0.55;
      u.skyGain.value = tod === "twilight" ? 0.1 : 0.075;
      this.scene.add(sky);
      const envSky = new THREE.Mesh(sky.geometry, sky.material);
      envSky.scale.setScalar(100);
      skyScene.add(envSky);
      key.color.set(tod === "twilight" ? "#ffb878" : "#fff3dc");
      key.intensity = tod === "twilight" ? 2.1 : 2.9;
      this.hemi.color.set(tod === "twilight" ? "#9fb0d8" : "#cfe2ff");
      this.hemi.groundColor.set("#3a4a2a");
      this.hemi.intensity = tod === "twilight" ? 1.0 : 1.15;
      this.renderer.toneMappingExposure = tod === "twilight" ? 1.25 : 0.95;
      this.scene.fog = new THREE.FogExp2(tod === "twilight" ? "#b89a8a" : "#c8d8ea", 0.0006);
    }
    key.userData.dir = sunDir;
    // Floodlights: on at night and twilight.
    const lit = tod !== "day";
    if (lit) {
      for (const t of this.stadium.towers.slice(0, 4)) {
        const f = new THREE.DirectionalLight("#fff6e6", tod === "night" ? 0.55 : 0.35);
        f.position.copy(t);
        f.target.position.set(0, 0, 0);
        this.scene.add(f, f.target);
        this.fills.push(f);
      }
    }
    for (const m of this.stadium.lampMats) m.emissiveIntensity = lit ? 4 : 0.15;
    (this.stadium.glows[0].material as THREE.SpriteMaterial).opacity = tod === "night" ? 0.9 : tod === "twilight" ? 0.5 : 0;
    for (const m of this.stadium.ledMats) m.emissiveIntensity = tod === "night" ? 0.7 : tod === "twilight" ? 0.6 : 0.45;
    // Reflections from the sky.
    skyScene.add(new THREE.Mesh(new THREE.CircleGeometry(90, 24).rotateX(-Math.PI / 2).translate(0, -4, 0), new THREE.MeshBasicMaterial({ color: tod === "night" ? "#0c120a" : "#2c3b22" })));
    this.envRT = this.pmrem.fromScene(skyScene, 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = tod === "night" ? 0.25 : 0.6;
  }

  // --------------------------------------------------------------- events

  onEvent(e: SimEvent) {
    const sim = this.sim;
    if (e.kind === "goal") {
      this.cheer = Math.max(this.cheer, e.team === 0 ? 1 : 0.55);
      this.lastScorer = e.by;
      const p = sim.players[e.by];
      this.headline = p ? `GOAL · ${p.name.toUpperCase()} ${Math.round(e.dist)}m` : "GOAL";
      this.headlineT = 6;
      this.cutTo = 0;
      if (this.opts.replay !== false) this.replayQ = { at: this.time + 1.5, goalT: sim.time, side: sim.ball.x > 0 ? 1 : -1 };
    } else if (e.kind === "behind") {
      this.cheer = Math.max(this.cheer, 0.25);
      this.headline = e.rushed ? "RUSHED BEHIND" : e.post ? "HIT THE POST" : "BEHIND";
      this.headlineT = 4;
    } else if (e.kind === "mark") {
      this.cheer = Math.max(this.cheer, e.screamer ? 0.85 : e.contested ? 0.4 : 0.15);
      if (e.screamer) {
        this.headline = `SCREAMER · ${sim.players[e.id].name.toUpperCase()}`;
        this.headlineT = 4;
      }
    } else if (e.kind === "tackle") this.cheer = Math.max(this.cheer, 0.3);
    else if (e.kind === "cut") this.cutTo = 1;
  }

  // ---------------------------------------------------------------- frame

  render(dt: number, mode: CamMode) {
    this.time += dt;
    this.record();
    this.stepRain(dt);
    if (this.replayQ && this.time >= this.replayQ.at && !this.replaying) {
      const q = this.replayQ;
      this.replayQ = null;
      const w = this.opts.replay ? this.opts.replay.window : 3.2;
      const frames = this.history.filter((f) => f.t >= q.goalT - w && f.t <= q.goalT + 0.35);
      if (frames.length > 10) {
        this.replayFrames = frames;
        this.replayT = 0;
        this.replayI = 0;
        this.replaySide = q.side;
        this.replaying = true;
      }
    }
    if (this.replaying && this.renderReplay(dt)) {
      this.cheer = Math.max(0, this.cheer - dt * 0.05);
      this.stadium.crowd.uTime.value = this.time;
      this.stadium.crowd.uCheer.value = this.cheer;
      this.updateShadow();
      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
      return;
    }
    const sim = this.sim;
    this.cheer = Math.max(0, this.cheer - dt * 0.16);
    this.headlineT = Math.max(0, this.headlineT - dt);
    const st = this.stadium;
    st.crowd.uTime.value = this.time;
    st.crowd.uCheer.value = this.cheer;
    st.ads.offset.x = (st.ads.offset.x + dt * 0.02) % 1;

    sim.players.forEach((p, i) => this.updatePlayer(p, this.players[i], dt));
    this.updateOfficial(sim.umpire, this.officials[0], dt);
    this.updateOfficial(sim.goalUmps[0], this.officials[1], dt);
    this.updateOfficial(sim.goalUmps[1], this.officials[2], dt);
    this.updateBall(dt);
    this.updateMarkers();
    this.updateCamera(dt, mode);
    this.stepCelebration(dt);
    this.updateShadow();
    this.drawScreen();

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private poseOf(p: Player): [Pose, number] {
    const sim = this.sim;
    if (this.celebrateTeam >= 0 && p.team === this.celebrateTeam) return [this.cup && p.id === this.captain().id ? "trophy" : "celebrate", 0];
    if (p.down > 0) return ["down", 0];
    if (sim.tackle?.on === p.id) return ["crouch", 0];
    if (p.act) {
      const k = Math.min(1, p.act.t / p.act.dur);
      switch (p.act.kind) {
        case "kick":
          return ["kick", k];
        case "handball":
          return ["handball", k];
        case "mark":
          return ["mark", k];
        case "tackle":
          return ["tackle", k];
        case "bounce":
          return ["bounce", k];
        case "ruck":
        case "spoil":
          return ["ruck", k];
      }
    }
    if (p.y > 0.05) return ["mark", 0.4];
    if (p.celebrate > 0) return ["celebrate", 0];
    const holder = sim.ball.state === "held" && sim.ball.holder === p.id;
    if (holder) return [p.speed > 0.6 ? "carry" : "setshot", 0];
    const s = sim.stoppage;
    if (s && p.speed < 0.8 && Math.hypot(p.x - s.x, p.z - s.z) < 7) return ["crouch", 0];
    return ["walk", 0];
  }

  private updatePlayer(p: Player, b: Body, dt: number) {
    const [pose, act] = this.poseOf(p);
    const g = b.model.group;
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = -p.h;
    b.t += dt;
    posePed(b.model, pose, p.step, p.speed, b.t, dt, act);
  }

  private updateOfficial(o: Official, b: Body, dt: number) {
    const g = b.model.group;
    g.position.set(o.x, 0, o.z);
    g.rotation.y = -o.h;
    b.t += dt;
    let pose: Pose = "walk";
    let act = 0;
    if (o.signal === "bounce") {
      pose = "umpBounce";
      act = 1 - o.signalT / 0.7;
    } else if (o.signal === "goal") pose = "umpGoal";
    else if (o.signal === "behind" || o.signal === "free") pose = "point";
    posePed(b.model, pose, o.step, o.speed, b.t, dt, act);
  }

  private updateBall(dt: number) {
    const sim = this.sim;
    const b = sim.ball;
    const m = this.ball;
    if (b.state === "held") {
      const p = sim.players[b.holder];
      const body = this.players[b.holder].model;
      body.group.updateMatrixWorld(true);
      const [pose] = this.poseOf(p);
      const l = body.bones[HAND_L].getWorldPosition(this.tmp);
      if (pose === "carry" || pose === "handball" || pose === "bounce") {
        m.position.copy(l);
        if (pose === "bounce") m.position.y = Math.max(0.12, l.y - Math.sin(Math.min(1, (p.act?.t ?? 0) / 0.45) * Math.PI) * 0.8);
      } else {
        const r = body.bones[HAND_R].getWorldPosition(this.tmp2);
        m.position.copy(l).add(r).multiplyScalar(0.5);
      }
      this.qYaw.setFromAxisAngle(this.yAxis, -p.h);
      this.qSpin.setFromAxisAngle(this.zAxis, pose === "carry" ? 0.5 : 0.25);
      m.quaternion.copy(this.qYaw).multiply(this.qSpin);
    } else {
      m.position.set(b.x, Math.max(0.09, b.y), b.z);
      const hs = Math.hypot(b.vx, b.vz);
      if (b.state === "ground" || (b.y < 0.15 && Math.abs(b.vy) < 0.5)) {
        this.ballRoll += hs * dt * 6;
        if (hs > 0.1) this.qYaw.setFromAxisAngle(this.yAxis, -Math.atan2(b.vz, b.vx));
        this.qSpin.setFromAxisAngle(this.xAxis, this.ballRoll);
        m.quaternion.copy(this.qYaw).multiply(this.qSpin);
      } else {
        // End over end (a drop punt's backspin), or spiralling (a torpedo), along the line of flight.
        if (hs > 0.5) this.qYaw.setFromAxisAngle(this.yAxis, -Math.atan2(b.vz, b.vx));
        this.qSpin.setFromAxisAngle(b.kick?.style === "torpedo" ? this.xAxis : this.zAxis, b.spin);
        m.quaternion.copy(this.qYaw).multiply(this.qSpin);
      }
    }
    // Easier to follow from the broadcast camera: grow a little with distance.
    const d = this.camera.position.distanceTo(m.position);
    m.scale.setScalar(Math.max(1, Math.min(2.1, d / 38)));
    m.visible = b.state !== "dead" || this.sim.phase === "bounce" || this.sim.phase === "stoppage";
    if (b.state === "dead" && m.visible) {
      const u = sim.players.length ? sim.umpire : null;
      if (u) m.position.set(u.x + Math.cos(u.h) * 0.35, 1.2, u.z + Math.sin(u.h) * 0.35);
    }
    const h = m.position.y;
    this.ballShadow.position.set(m.position.x, 0.03, m.position.z);
    const s = 0.5 + h * 0.08;
    this.ballShadow.scale.set(s, 1, s);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 0.8 - h * 0.035);
    this.ballShadow.visible = m.visible;
  }

  private updateMarkers() {
    const sim = this.sim;
    const you = sim.you;
    this.you.position.set(you.x, 0.04, you.z);
    this.you.rotation.y = this.time * 0.8;
    this.youArrow.position.set(you.x, 2.55 + you.y + Math.sin(this.time * 4) * 0.08, you.z);
    this.youArrow.rotation.y = this.time * 2;
    const show = sim.phase !== "goal" && sim.phase !== "break" && sim.phase !== "over" && !this.opts.spectator;
    this.you.visible = this.youArrow.visible = show;
    const land = sim.ball.state === "air" && sim.landing && !sim.ball.ruck ? sim.landing : null;
    this.drop.visible = !!land && show;
    // Where your kick's going: a teammate (gold) or open ground / the goals (white).
    const plan = sim.kickPlan;
    this.target.visible = !!plan && !this.opts.spectator;
    if (plan) {
      this.target.position.set(plan.x, 0.06, plan.z);
      (this.target.material as THREE.MeshBasicMaterial).color.set(plan.target >= 0 ? "#facc15" : plan.shot ? "#4ade80" : "#ffffff");
      const k = 1 + Math.sin(this.time * 8) * 0.06;
      this.target.scale.set(k, 1, k);
    }
    if (land) {
      this.drop.position.set(land.x, 0.05, land.z);
      const k = 1 + Math.sin(this.time * 6) * 0.08;
      this.drop.scale.set(k, 1, k);
    }
    const pts = sim.aimPreview(30);
    this.arc.visible = !!pts;
    (this.arc.material as THREE.LineBasicMaterial).color.set(sim.kickStyle === "torpedo" ? "#7dd3fc" : sim.kickStyle === "snap" ? "#f9a8d4" : "#ffffff");
    if (pts) {
      const attr = this.arc.geometry.getAttribute("position") as THREE.BufferAttribute;
      const n = Math.min(100, pts.length);
      for (let i = 0; i < n; i++) attr.setXYZ(i, pts[i][0], pts[i][1], pts[i][2]);
      attr.needsUpdate = true;
      this.arc.geometry.setDrawRange(0, n);
    }
  }

  private updateCamera(dt: number, mode: CamMode) {
    const sim = this.sim;
    const b = sim.ball;
    // Focus: the ball (where it's going, if it's in the air), eased.
    const fx = b.state === "air" && sim.landing ? b.x * 0.55 + sim.landing.x * 0.45 : b.state === "held" ? b.x + b.vx * 0.4 : b.x;
    const fz = b.state === "air" && sim.landing ? b.z * 0.55 + sim.landing.z * 0.45 : b.state === "held" ? b.z + b.vz * 0.4 : b.z;
    const k = this.cutTo > 0 ? 1 : 1 - Math.exp(-dt * 2.6);
    this.focus.x += (fx - this.focus.x) * k;
    this.focus.z += (fz - this.focus.z) * k;
    this.focus.y = 0;
    const want = this.tmp;
    const look = this.tmp2;
    const you = sim.you;
    const set = sim.set;
    const scorer = sim.phase === "goal" && this.lastScorer >= 0 ? sim.players[this.lastScorer] : null;
    let fov = 30;
    if (this.cup) {
      // The premiers: a slow orbit round the captain and the cup.
      const cap = this.captain();
      const a = this.time * 0.25;
      want.set(cap.x + Math.cos(a) * 7.5, 2.6, cap.z + Math.sin(a) * 7.5);
      look.set(cap.x, 2.2, cap.z);
      fov = 40;
    } else if (scorer && sim.phaseT > 1.2) {
      // Celebration: a slow orbit around the goal kicker.
      const a = this.time * 0.35;
      want.set(scorer.x + Math.cos(a) * 7, 2.1, scorer.z + Math.sin(a) * 7);
      look.set(scorer.x, 1.3, scorer.z);
      fov = 34;
    } else if (sim.phase === "bounce" && sim.quarter === 1 && sim.time < 3.2) {
      // Opening crane shot over the centre square.
      const t = sim.time / 3.2;
      const a = -Math.PI / 2 + (1 - t) * 1.1;
      want.set(Math.cos(a) * (40 + 60 * (1 - t)), 10 + 50 * (1 - t), Math.sin(a) * (40 + 60 * (1 - t)));
      look.set(0, 1, 0);
      fov = 40;
    } else if (set && set.id === sim.human && sim.phase === "set" && set.kind !== "kickin") {
      // Set shot: over the kicker's shoulder, down the line.
      const p = sim.players[set.id];
      const ca = Math.cos(set.aim);
      const sa = Math.sin(set.aim);
      want.set(p.x - ca * 5.5 - sa * 0.9, 2.3, p.z - sa * 5.5 + ca * 0.9);
      look.set(p.x + ca * 40, 3, p.z + sa * 40);
      fov = 42;
    } else if (mode === "follow") {
      // Behind your player, facing the goal you're kicking to.
      const d = sim.dir(0);
      want.set(you.x - d * 15, 7.5, you.z * 0.92);
      look.set(you.x + d * 14, 1, you.z * 0.85 + (this.focus.z - you.z) * 0.3);
      fov = 46;
    } else {
      // Broadcast: high on the wing, tracking along the ground.
      const tx = Math.max(-A, Math.min(A, this.focus.x * 0.82));
      const ang = -Math.acos(Math.max(-0.98, Math.min(0.98, tx / (A + 22))));
      want.set((A + 22) * Math.cos(ang), 27, (B + 22) * Math.sin(ang));
      look.copy(this.focus);
      look.y = 1;
      const dist = want.distanceTo(look);
      // Telephoto, like the real thing: about 40 m of ground across the frame.
      const wide = b.state === "air" ? 12.5 : sim.phase === "set" ? 11 : 9;
      fov = THREE.MathUtils.radToDeg(2 * Math.atan(wide / dist));
    }
    if (this.cutTo > 0) {
      this.camPos.copy(want);
      this.camLook.copy(look);
      this.cutTo = 0;
    } else {
      const kp = 1 - Math.exp(-dt * 3.2);
      this.camPos.lerp(want, kp);
      this.camLook.lerp(look, 1 - Math.exp(-dt * 5));
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    const f = this.camera.fov + (fov - this.camera.fov) * (1 - Math.exp(-dt * 3));
    if (Math.abs(f - this.camera.fov) > 0.01) {
      this.camera.fov = f;
      this.camera.updateProjectionMatrix();
    }
  }

  /** The key light's shadow follows the play (texel-snapped so it doesn't shimmer). */
  private updateShadow() {
    const key = this.key;
    const dir = key.userData.dir as THREE.Vector3;
    const c = this.focus;
    const texel = 96 / key.shadow.mapSize.x;
    const sx = Math.round(c.x / texel) * texel;
    const sz = Math.round(c.z / texel) * texel;
    key.target.position.set(sx, 0, sz);
    key.position.set(sx + dir.x * 150, dir.y * 150, sz + dir.z * 150);
    key.target.updateMatrixWorld();
  }

  /** The big screens: clubs, score, quarter and clock, and the latest headline. */
  private drawScreen(force = false) {
    const sim = this.sim;
    const clock = Math.ceil(sim.clock);
    const key = `${sim.score[0].goals}.${sim.score[0].behinds}|${sim.score[1].goals}.${sim.score[1].behinds}|${sim.quarter}|${clock}|${this.headlineT > 0 ? this.headline : ""}`;
    if (!force && key === this.screenKey) return;
    this.screenKey = key;
    const c = this.stadium.screen.canvas;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 384);
    grad.addColorStop(0, "#0b1222");
    grad.addColorStop(1, "#05070d");
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 384);
    g.textBaseline = "middle";
    const row = (club: (typeof sim.clubs)[0], s: (typeof sim.score)[0], y: number) => {
      g.fillStyle = club.guernsey;
      g.fillRect(28, y - 52, 26, 104);
      g.fillStyle = club.hoop;
      g.fillRect(28, y - 10, 26, 20);
      g.fillStyle = "#ffffff";
      g.font = "900 64px Arial Black, Arial, sans-serif";
      g.textAlign = "left";
      g.fillText(club.name.toUpperCase(), 76, y, 560);
      g.textAlign = "right";
      g.font = "700 50px Arial, sans-serif";
      g.fillStyle = "#cbd5e1";
      g.fillText(`${s.goals}.${s.behinds}`, 820, y);
      g.font = "900 78px Arial Black, Arial, sans-serif";
      g.fillStyle = "#facc15";
      g.fillText(String(points(s)), 996, y);
    };
    row(sim.clubs[0], sim.score[0], 82);
    row(sim.clubs[1], sim.score[1], 206);
    g.fillStyle = "#1e293b";
    g.fillRect(0, 290, 1024, 94);
    g.fillStyle = "#ffffff";
    g.font = "800 48px Arial, sans-serif";
    g.textAlign = "left";
    const m = Math.floor(clock / 60);
    const sec = String(clock % 60).padStart(2, "0");
    g.fillText(this.headlineT > 0 ? this.headline : `QUARTER ${sim.quarter}`, 28, 338, 700);
    g.textAlign = "right";
    g.fillText(`${m}:${sec}`, 996, 338);
    this.stadium.screen.texture.needsUpdate = true;
  }

  destroy() {
    this.ro.disconnect();
    this.composer?.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    this.renderer.dispose();
    this.canvas.remove();
  }
}
