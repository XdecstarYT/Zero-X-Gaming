import * as THREE from "three";
import { setTextureDetail } from "../neon-siege/three/textures";
import { BONES, buildPed, posePed, type PedModel, type Pose as PedPose } from "../code-3/people3d";
import { SportsPipeline, canvasTexture, noise2 } from "../sports-kit/pipeline";
import type { Detail, TimeOfDay } from "../sports-kit/look";
import { buildCrowd, crowdUniforms, type Seat } from "../sports-kit/crowd";
import { band, type Edge } from "../sports-kit/geo";
import { adTexture, blobTexture, glowTexture, lampTexture, seatTexture } from "../aussie-rules/textures";
import { BALL_R, CREASE, CricketSim, KINDS, PITCH, ROPE, STUMP_H, type Batter, type Fielder, type SimEvent } from "./sim";
import type { Team } from "./teams";

export type CricketCam = "broadcast" | "batter";

const HAND_R = BONES.indexOf("handR");
const SHIN_L = BONES.indexOf("shinL");
const SHIN_R = BONES.indexOf("shinR");
const HEAD = BONES.indexOf("head");
const CZ = ROPE.cz;
const skins = ["#f1c9a5", "#e0ac84", "#c68c5d", "#8d5a3b", "#5a3a28"];

/** The rope's ellipse as an edge path (outward normals), offset `d` metres out. */
function ellipsePath(n: number, d = 0): Edge[] {
  const out: Edge[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * ROPE.rx;
    const z = Math.sin(a) * ROPE.rz;
    let nx = Math.cos(a) / ROPE.rx;
    let nz = Math.sin(a) / ROPE.rz;
    const l = Math.hypot(nx, nz);
    nx /= l;
    nz /= l;
    out.push({ x: x + nx * d, z: CZ + z + nz * d, nx, nz });
  }
  return out;
}

/** Ground: mowing stripes across the square, the apron, a little wear. */
function groundTexture(res: number) {
  const n = noise2(24, 7);
  return canvasTexture(res, res, (g) => {
    const img = g.createImageData(res, res);
    const S = 200 / res;
    for (let j = 0; j < res; j++)
      for (let i = 0; i < res; i++) {
        const x = (i - res / 2) * S;
        const z = (j - res / 2) * S + CZ;
        const inside = Math.hypot(x / ROPE.rx, (z - CZ) / ROPE.rz) < 1.02;
        const stripe = Math.floor((z + 200) / 7) % 2 === 0 ? 1 : 0;
        const k = n(i / res, j / res);
        let r = 70 + k * 18;
        let gg = 128 + k * 30 + (inside ? stripe * 16 : -10);
        let b = 52 + k * 10;
        if (!inside) {
          r = 58 + k * 10;
          gg = 104 + k * 14;
          b = 46;
        }
        const o = (j * res + i) * 4;
        img.data[o] = r;
        img.data[o + 1] = gg;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    g.putImageData(img, 0, 0);
  });
}

/** The pitch: rolled, straw-coloured, worn at both ends, with the creases painted on. */
function pitchTexture() {
  const W = 128;
  const H = 1024;
  const n = noise2(16, 3);
  return canvasTexture(W, H, (g) => {
    const img = g.createImageData(W, H);
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const z = (j / H) * 24.4 - 2.14;
        const wear = Math.max(0, 1 - Math.min(Math.abs(z - 1.2), Math.abs(z - (PITCH - 1.2))) / 3) * (1 - Math.abs(i / W - 0.5) * 1.4);
        const k = n(i / W, j / H);
        const o = (j * W + i) * 4;
        img.data[o] = 186 + k * 26 - wear * 30;
        img.data[o + 1] = 168 + k * 22 - wear * 36;
        img.data[o + 2] = 112 + k * 16 - wear * 34;
        img.data[o + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    // Creases: bowling crease through the stumps, popping crease 1.22 m in front, return creases.
    const zy = (z: number) => ((z + 2.14) / 24.4) * H;
    const xx = (x: number) => ((x + 1.6) / 3.2) * W;
    g.fillStyle = "rgba(255,255,255,0.92)";
    for (const [stumps, dir] of [
      [0, 1],
      [PITCH, -1],
    ] as const) {
      g.fillRect(xx(-1.32), zy(stumps) - 1, xx(1.32) - xx(-1.32), 2.5);
      g.fillRect(0, zy(stumps + dir * CREASE) - 1.2, W, 2.6);
      for (const x of [-1.32, 1.32]) {
        const a = zy(stumps - dir * 1.22);
        const b = zy(stumps + dir * CREASE);
        g.fillRect(xx(x) - 1, Math.min(a, b), 2.5, Math.abs(b - a));
      }
    }
  });
}

/** A set of stumps and bails. */
function stumpSet(dark: boolean) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: dark ? "#e9e2cf" : "#f1ead6", roughness: 0.5 });
  const led = new THREE.MeshStandardMaterial({ color: "#e11d48", emissive: "#e11d48", emissiveIntensity: 0, roughness: 0.4 });
  const stumps: THREE.Mesh[] = [];
  for (const x of [-0.095, 0, 0.095]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, STUMP_H, 10).translate(0, STUMP_H / 2, 0), wood);
    s.position.x = x;
    s.castShadow = true;
    stumps.push(s);
    g.add(s);
  }
  const bails: THREE.Mesh[] = [];
  for (const x of [-0.0475, 0.0475]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 6).rotateZ(Math.PI / 2), led);
    b.position.set(x, STUMP_H + 0.01, 0);
    bails.push(b);
    g.add(b);
  }
  return { g, stumps, bails, led };
}

function cricketBat() {
  const g = new THREE.Group();
  const willow = new THREE.MeshStandardMaterial({ color: "#e3c48f", roughness: 0.55 });
  const grip = new THREE.MeshStandardMaterial({ color: "#1f2937", roughness: 0.9 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.017, 0.3, 8), grip);
  handle.position.y = -0.05;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.56, 0.05), willow);
  blade.position.set(0, -0.48, 0.005);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.03), willow);
  spine.position.set(0, -0.46, -0.03);
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.12), new THREE.MeshStandardMaterial({ color: "#22d3ee", roughness: 0.6 }));
  sticker.position.set(0, -0.36, 0.031);
  g.add(handle, blade, spine, sticker);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

interface Body {
  model: PedModel;
  step: number;
  bat?: THREE.Group;
}

/**
 * Boundary Blitz's view: an oval with mown stripes, the pitch and stumps,
 * a ring of stands with a crowd, sight screens, floodlights at night, the
 * players with bats, pads and helmets, the white ball with its tracer, the
 * aim arrow, the bowling target and a broadcast camera that follows the hit.
 */
export class CricketView {
  readonly pipe: SportsPipeline;
  private sim: CricketSim;
  private crowd = crowdUniforms();
  private cheer = 0;
  private fielders: Body[] = [];
  private batters: Body[] = [];
  private umpires: Body[] = [];
  private ends: ReturnType<typeof stumpSet>[] = [];
  private ball: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private trail: THREE.Line;
  private trailPts: Float32Array;
  private trailN = 0;
  private aimArrow: THREE.Mesh;
  private target: THREE.Mesh;
  private time = 0;
  private camPos = new THREE.Vector3(0.3, 7.4, PITCH + 31);
  private camLook = new THREE.Vector3(0, 1, 2);
  private fov = 22;
  private shake = 0;
  private boardCanvas: HTMLCanvasElement;
  private boardTex: THREE.CanvasTexture;
  private boardKey = "";
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private bowlTeamKey = "";
  private teams: [Team, Team];
  private lod: "high" | "low";
  private stumpFly = [0, 0];

  constructor(host: HTMLElement, sim: CricketSim, detail: Detail, tod: TimeOfDay) {
    this.sim = sim;
    this.teams = sim.teams;
    const high = detail !== "low";
    this.lod = high ? "high" : "low";
    setTextureDetail(high ? "high" : "low");
    this.pipe = new SportsPipeline(host, detail, tod, { fov: 22, shadowSpan: 50, far: 3000 });
    const { scene } = this.pipe;

    // ------------------------------------------------------------- ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2).translate(0, 0, CZ), new THREE.MeshStandardMaterial({ map: groundTexture(high ? 1024 : 512), roughness: 0.92 }));
    ground.receiveShadow = true;
    scene.add(ground);
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 24.4).rotateX(-Math.PI / 2).translate(0, 0.006, PITCH / 2), new THREE.MeshStandardMaterial({ map: pitchTexture(), roughness: 0.85 }));
    pitch.receiveShadow = true;
    scene.add(pitch);
    // The 30-yard circle: white discs.
    const dot = new THREE.CircleGeometry(0.22, 10).rotateX(-Math.PI / 2);
    const dotMat = new THREE.MeshBasicMaterial({ color: "#f8fafc" });
    const ring = new THREE.InstancedMesh(dot, dotMat, 72);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      m4.makeTranslation(Math.cos(a) * 27.4, 0.01, CZ + Math.sin(a) * 33);
      ring.setMatrixAt(i, m4);
    }
    scene.add(ring);
    // The rope.
    const ropePts = ellipsePath(160).map((e) => new THREE.Vector3(e.x, 0.06, e.z));
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePts, true), 320, 0.07, 6, true), new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.6 })));
    // LED boards just behind it.
    const ads = adTexture();
    ads.repeat.set(10, 1);
    const boards = ellipsePath(160, 4);
    scene.add(new THREE.Mesh(band(boards, 1, (s) => [0, s * 0.95], 28, 1), new THREE.MeshStandardMaterial({ map: ads, emissiveMap: ads, emissive: "#ffffff", emissiveIntensity: tod === "day" ? 0.35 : 1.1, roughness: 0.5, side: THREE.DoubleSide })));
    // Sight screens behind both ends.
    const screenMat = new THREE.MeshStandardMaterial({ color: tod === "night" ? "#0b0f18" : "#f4f4f2", roughness: 0.8 });
    for (const z of [CZ - ROPE.rz - 7, CZ + ROPE.rz + 7]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 0.4).translate(0, 3.5, 0), screenMat);
      s.position.z = z;
      s.castShadow = true;
      scene.add(s);
    }

    // ------------------------------------------------------------- stands
    const seats = seatTexture("#1e3a5f", high ? 0.75 : 0.6);
    seats.repeat.set(30, 3);
    const tiers = [
      { d0: 9, d1: 32, y0: 1.5, y1: 13 },
      { d0: 34, d1: 52, y0: 16, y1: 28 },
    ];
    const standPath = ellipsePath(120);
    const dark = new THREE.MeshStandardMaterial({ color: "#23262c", roughness: 0.85, side: THREE.DoubleSide });
    for (const t of tiers) {
      scene.add(new THREE.Mesh(band(standPath, 2, (s) => [t.d0 + (t.d1 - t.d0) * s, t.y0 + (t.y1 - t.y0) * s], 14, 3), new THREE.MeshStandardMaterial({ map: seats, roughness: 0.85, side: THREE.DoubleSide })));
      scene.add(new THREE.Mesh(band(standPath, 1, (s) => [t.d1, t.y1 + s * 3], 8, 1), dark));
    }
    scene.add(new THREE.Mesh(band(standPath, 1, (s) => [7, s * 1.5], 8, 1), dark));
    scene.add(new THREE.Mesh(band(standPath, 1, (s) => [32 + s * 2, 13 + s * 3], 8, 1), dark));
    const roof = new THREE.Mesh(band(standPath, 1, (s) => [38 + s * 18, 36 + s * 2], 10, 1), new THREE.MeshStandardMaterial({ color: "#3a3e45", roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }));
    scene.add(roof);
    // The crowd.
    const occupancy = detail === "ultra" ? 0.5 : detail === "high" ? 0.28 : 0.07;
    const crowdSeats: Seat[] = [];
    let rs = 99;
    const rr = () => ((rs = (rs * 16807) % 2147483647) - 1) / 2147483646;
    for (const t of tiers) {
      const rows = Math.floor(Math.hypot(t.d1 - t.d0, t.y1 - t.y0) / 0.9);
      for (let j = 0; j < rows; j++) {
        const s = (j + 0.6) / rows;
        const d = t.d0 + (t.d1 - t.d0) * s;
        const y = t.y0 + (t.y1 - t.y0) * s;
        for (let i = 0; i < standPath.length - 1; i++) {
          const a = standPath[i];
          const b = standPath[i + 1];
          const ax = a.x + a.nx * d;
          const az = a.z + a.nz * d;
          const bx = b.x + b.nx * d;
          const bz = b.z + b.nz * d;
          const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 0.6));
          for (let k = 0; k < n; k++) {
            if (rr() > occupancy) continue;
            const f = (k + rr() * 0.2) / n;
            const x = ax + (bx - ax) * f;
            const z = az + (bz - az) * f;
            crowdSeats.push({ x, y: y - 0.1, z, h: Math.atan2(CZ - z, -x) });
          }
        }
      }
    }
    scene.add(buildCrowd(crowdSeats, [this.teams[0].shirt, this.teams[1].shirt, this.teams[0].trim, this.teams[1].trim, "#ffffff", "#15171d", "#3a4250", "#6b7280", "#f2f2f2"], high, this.crowd, 41));

    // ------------------------------------------------------- floodlights
    const towers: THREE.Vector3[] = [];
    const towerMat = new THREE.MeshStandardMaterial({ color: "#9aa1aa", roughness: 0.5, metalness: 0.6 });
    const lamp = lampTexture();
    const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: "#fff6e0", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: tod === "night" ? 0.9 : tod === "twilight" ? 0.4 : 0 });
    for (const a of [0.55, 2.59, 3.69, 5.73, 1.57, 4.71]) {
      const x = Math.cos(a) * (ROPE.rx + 48);
      const z = CZ + Math.sin(a) * (ROPE.rz + 48);
      const h = 58;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.6, h, 8), towerMat);
      t.position.set(x, h / 2, z);
      scene.add(t);
      const head = new THREE.Group();
      head.position.set(x, h + 3, z);
      head.lookAt(0, 0, CZ);
      const lm = new THREE.MeshStandardMaterial({ map: lamp, emissiveMap: lamp, emissive: "#fff8e8", emissiveIntensity: tod === "day" ? 0.15 : 4, roughness: 0.5 });
      head.add(new THREE.Mesh(new THREE.BoxGeometry(14, 7, 1), [towerMat, towerMat, towerMat, towerMat, lm, towerMat]));
      scene.add(head);
      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(26, 26, 1);
      glow.position.copy(head.position);
      scene.add(glow);
      towers.push(new THREE.Vector3(x, h + 3, z));
    }
    this.pipe.lights(towers, { fog: 0.0009, sunDir: new THREE.Vector3(0.5, 0.75, -0.3) });

    // ------------------------------------------------------- scoreboard
    this.boardCanvas = document.createElement("canvas");
    this.boardCanvas.width = 1024;
    this.boardCanvas.height = 448;
    this.boardTex = new THREE.CanvasTexture(this.boardCanvas);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(32, 14), new THREE.MeshStandardMaterial({ map: this.boardTex, emissiveMap: this.boardTex, emissive: "#ffffff", emissiveIntensity: 0.9, roughness: 0.6 }));
    const bx = -(ROPE.rx + 30);
    board.position.set(bx, 34, CZ + 10);
    board.lookAt(0, 20, CZ);
    scene.add(board);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(33.5, 15.5, 1), dark);
    frame.position.copy(board.position).add(new THREE.Vector3(-0.7, 0, 0));
    frame.rotation.copy(board.rotation);
    scene.add(frame);

    // -------------------------------------------------------------- pitch
    for (const z of [0, PITCH]) {
      const s = stumpSet(tod === "night");
      s.g.position.z = z;
      scene.add(s.g);
      this.ends.push(s);
    }
    const ballMat = new THREE.MeshStandardMaterial({
      map: canvasTexture(128, 64, (g) => {
        g.fillStyle = "#f6f5f0";
        g.fillRect(0, 0, 128, 64);
        g.fillStyle = "#3a3a3a";
        g.fillRect(0, 30, 128, 4);
      }),
      roughness: 0.4,
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 1.5, 16, 12), ballMat);
    this.ball.castShadow = true;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#fffbe6", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    glow.scale.setScalar(0.32);
    this.ball.add(glow);
    scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
    scene.add(this.ballShadow);
    this.trailPts = new Float32Array(300 * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(this.trailPts, 3));
    tg.setDrawRange(0, 0);
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: "#fde047", transparent: true, opacity: 0.8, toneMapped: false }));
    this.trail.frustumCulled = false;
    scene.add(this.trail);
    // Aim arrow and bowling target.
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(-0.35, 0);
    arrowShape.lineTo(0.35, 0);
    arrowShape.lineTo(0.35, 11);
    arrowShape.lineTo(1.1, 11);
    arrowShape.lineTo(0, 14);
    arrowShape.lineTo(-1.1, 11);
    arrowShape.lineTo(-0.35, 11);
    this.aimArrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#facc15", transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    this.aimArrow.position.set(0.2, 0.03, 1.8);
    scene.add(this.aimArrow);
    this.target = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.26, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#22d3ee", transparent: true, opacity: 0.9, depthWrite: false }));
    this.target.position.y = 0.02;
    scene.add(this.target);

    // ------------------------------------------------------------ people
    this.buildBatters();
    this.buildFielders();
    for (let i = 0; i < 2; i++) {
      const m = buildPed({ skin: skins[(i * 3 + 1) % 5], shirt: "#f4f4f2", pants: "#1f2937", seed: 300 + i, lod: this.lod, outfit: { female: false, top: "long", bottom: "trousers", hat: "cap", backpack: false, officer: false, beard: i === 0 }, hatColor: "#f4f4f2", shoes: "#111111" });
      m.group.traverse((o) => (o.castShadow = true));
      scene.add(m.group);
      this.umpires.push({ model: m, step: 0 });
    }
    this.drawBoard();
  }

  get canvas() {
    return this.pipe.canvas;
  }
  setResolution(k: number) {
    this.pipe.setResolution(k);
  }

  private kitFor(team: Team, seed: number, number: number, keeper = false) {
    const m = buildPed({
      skin: skins[seed % skins.length],
      shirt: team.shirt,
      pants: team.shirt,
      seed,
      lod: this.lod,
      outfit: { female: false, top: "tee", bottom: "trousers", hat: keeper ? "none" : "cap", backpack: false, officer: false, beard: seed % 4 === 0 },
      accent: team.trim,
      shoes: "#f4f4f2",
      hatColor: team.shirt,
      number,
      numberColor: team.trim,
    });
    m.group.traverse((o) => (o.castShadow = true));
    return m;
  }

  /** Pads, helmet and a bat on a batter. */
  private kitUp(m: PedModel, team: Team) {
    const padMat = new THREE.MeshStandardMaterial({ color: "#f4f4f2", roughness: 0.7 });
    for (const b of [SHIN_L, SHIN_R]) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.5, 0.17), padMat);
      pad.position.set(0, -0.2, 0.02);
      pad.castShadow = true;
      m.bones[b].add(pad);
    }
    const helmet = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: team.shirt, roughness: 0.35, metalness: 0.2 }));
    shell.position.y = 0.1;
    const grille = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.008, 4, 16, Math.PI), new THREE.MeshStandardMaterial({ color: "#9ca3af", metalness: 0.7, roughness: 0.3 }));
    grille.rotation.set(0, Math.PI / 2, Math.PI / 2);
    grille.position.set(0.08, 0.02, 0);
    helmet.add(shell, grille);
    m.bones[HEAD].add(helmet);
    const bat = cricketBat();
    m.bones[HAND_R].add(bat);
    return bat;
  }

  private buildBatters() {
    for (const b of this.batters) this.pipe.scene.remove(b.model.group);
    this.batters = [];
    const team = this.sim.batTeam;
    for (let i = 0; i < 2; i++) {
      const idx = i === 0 ? this.sim.inn.striker : this.sim.inn.nonStriker;
      const m = this.kitFor(team, 40 + idx * 7 + this.sim.inn.bat * 100, idx + 1);
      const bat = this.kitUp(m, team);
      this.pipe.scene.add(m.group);
      this.batters.push({ model: m, step: 0, bat });
    }
  }

  private buildFielders() {
    for (const f of this.fielders) this.pipe.scene.remove(f.model.group);
    this.fielders = [];
    const team = this.sim.bowlTeam;
    for (const f of this.sim.fielders) {
      const m = this.kitFor(team, 140 + f.p * 11 + (1 - this.sim.inn.bat) * 100, f.p + 1, f.role === "keeper");
      if (f.role === "keeper") {
        // Keeping gloves and pads.
        const padMat = new THREE.MeshStandardMaterial({ color: "#f4f4f2", roughness: 0.7 });
        for (const b of [SHIN_L, SHIN_R]) {
          const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.46, 0.16), padMat);
          pad.position.set(0, -0.2, 0.02);
          m.bones[b].add(pad);
        }
      }
      this.pipe.scene.add(m.group);
      this.fielders.push({ model: m, step: 0 });
    }
    this.bowlTeamKey = `${this.sim.cur}`;
  }

  /** The big screen: score, overs, this over, the batters and the bowler. */
  drawBoard() {
    const s = this.sim;
    const inn = s.inn;
    const key = `${s.cur}|${inn.runs}|${inn.wkts}|${inn.balls}|${inn.over.join(",")}|${s.phase}`;
    if (key === this.boardKey) return;
    this.boardKey = key;
    const g = this.boardCanvas.getContext("2d")!;
    g.fillStyle = "#05070c";
    g.fillRect(0, 0, 1024, 448);
    g.fillStyle = s.batTeam.shirt;
    g.fillRect(0, 0, 1024, 96);
    g.fillStyle = "#ffffff";
    g.font = "900 60px Arial Black, Arial";
    g.textBaseline = "middle";
    g.fillText(`${s.batTeam.short}  ${inn.runs}/${inn.wkts}`, 30, 50);
    g.textAlign = "right";
    g.font = "700 46px Arial";
    g.fillText(`${s.overs()} ov`, 994, 50);
    g.textAlign = "left";
    g.font = "700 40px Arial";
    const st = inn.cards[inn.striker];
    const ns = inn.cards[inn.nonStriker];
    const name = (i: number) => s.batTeam.players[i].name.split(" ")[1].toUpperCase();
    g.fillStyle = "#e5e7eb";
    g.fillText(`${name(inn.striker)}*  ${st.runs} (${st.balls})`, 30, 150);
    g.fillText(`${name(inn.nonStriker)}  ${ns.runs} (${ns.balls})`, 30, 205);
    const bc = inn.bowl.get(inn.bowler);
    g.fillStyle = "#94a3b8";
    g.fillText(`${s.bowler.name.split(" ")[1].toUpperCase()}  ${bc ? `${bc.wkts}-${bc.runs} (${s.overs(bc.balls)})` : ""}`, 30, 260);
    g.fillStyle = "#facc15";
    g.font = "900 44px Arial";
    g.fillText(inn.over.join("  ") || "–", 30, 330);
    if (s.target) {
      g.fillStyle = "#22d3ee";
      g.font = "700 38px Arial";
      const need = s.target - inn.runs;
      const left = s.ballsPerInnings - inn.balls;
      g.fillText(need > 0 ? `NEED ${need} FROM ${left}` : "TARGET REACHED", 30, 400);
    }
    this.boardTex.needsUpdate = true;
  }

  onEvent(e: SimEvent) {
    switch (e.kind) {
      case "six":
        this.cheer = 1;
        this.shake = 0.3;
        break;
      case "four":
        this.cheer = 0.8;
        break;
      case "out":
        this.cheer = 0.9;
        break;
      case "stumps":
        this.stumpFly[0] = 1;
        this.shake = 0.15;
        break;
      case "hit":
        this.trailN = 0;
        break;
      case "release":
        this.trailN = 0;
        break;
    }
  }

  /** Ground point under a screen position (normalised device coordinates). */
  groundAt(nx: number, ny: number) {
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.pipe.camera);
    const hit = this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  render(dt: number, cam: CricketCam, ui: { aim: number; target: { x: number; z: number } | null; shot: "ground" | "loft" | "defend" }) {
    const s = this.sim;
    this.time += dt;
    if (this.bowlTeamKey !== `${s.cur}`) {
      this.buildFielders();
      this.buildBatters();
    }
    // People.
    s.fielders.forEach((f, i) => {
      const b = this.fielders[i];
      if (b) this.pose(b, f, dt);
    });
    s.batters.forEach((bt, i) => {
      const b = this.batters[i];
      if (b) this.poseBatter(b, bt, dt, i === 0);
    });
    s.umpires.forEach((u, i) => {
      const b = this.umpires[i];
      if (!b) return;
      b.model.group.position.set(u.x, 0, u.z);
      b.model.group.rotation.y = -(i === 0 ? -Math.PI / 2 : Math.PI);
      const pose: PedPose = u.pose === "out" ? "point" : u.pose === "six" ? "celebrate" : u.pose === "four" || u.pose === "wide" ? "direct" : "stand";
      posePed(b.model, pose, 0, 0, this.time, dt, 0.5);
    });
    // Stumps.
    this.ends.forEach((end, i) => {
      const k = Math.max(s.broken[i], this.stumpFly[i]);
      end.led.emissiveIntensity = k > 0.05 ? 3 : 0;
      end.bails.forEach((b, j) => {
        b.position.y = STUMP_H + 0.01 + k * (0.5 + j * 0.2) * Math.sin(Math.min(1, k) * Math.PI * 0.5);
        b.position.z = (i === 0 ? -1 : 1) * k * 0.6;
        b.rotation.x = k * 6;
      });
      end.stumps.forEach((st, j) => (st.rotation.x = (i === 0 ? -1 : 1) * k * (j === 1 ? 0.35 : 0.2)));
    });
    this.stumpFly[0] = Math.max(0, this.stumpFly[0] - dt * 0.2);
    // Ball and trail.
    this.ball.visible = s.ballVisible;
    this.ball.position.set(s.ball.x, s.ball.y, s.ball.z);
    this.ball.rotation.x += dt * 30;
    this.ballShadow.visible = s.ballVisible;
    this.ballShadow.position.set(s.ball.x, 0.012, s.ball.z);
    if (s.ballVisible && (s.phase === "delivery" || s.phase === "live")) {
      if (this.trailN < 300) {
        this.trailPts.set([s.ball.x, s.ball.y, s.ball.z], this.trailN * 3);
        this.trailN++;
      }
    } else if (s.phase === "plan") this.trailN = 0;
    this.trail.geometry.setDrawRange(0, this.trailN);
    (this.trail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.trail.visible = s.phase === "live" || s.phase === "dead";
    // Aim arrow and target.
    this.aimArrow.visible = s.humanBats && (s.phase === "plan" || s.phase === "runup" || s.phase === "delivery");
    this.aimArrow.rotation.y = (ui.aim * Math.PI) / 180;
    (this.aimArrow.material as THREE.MeshBasicMaterial).color.set(ui.shot === "loft" ? "#f97316" : ui.shot === "defend" ? "#60a5fa" : "#facc15");
    this.target.visible = !!ui.target && s.humanBowls && (s.phase === "plan" || s.phase === "runup");
    if (ui.target) this.target.position.set(ui.target.x, 0.02, ui.target.z);
    // Crowd.
    this.cheer = Math.max(0, this.cheer - dt * 0.35);
    this.crowd.uTime.value = this.time;
    this.crowd.uCheer.value = this.cheer;
    this.camera(dt, cam);
    this.drawBoard();
    this.pipe.follow(s.ball.x * 0.5, Math.max(0, Math.min(PITCH, s.ball.z)));
    this.pipe.render();
  }

  private camera(dt: number, cam: CricketCam) {
    const s = this.sim;
    const c = this.pipe.camera;
    const wantPos = new THREE.Vector3();
    const wantLook = new THREE.Vector3();
    let fov = 22;
    if (s.phase === "live" || (s.phase === "dead" && s.lastShot && s.lastShot.type !== "miss")) {
      // Follow the hit: high behind the bowler's arm, looking at the ball.
      const b = s.ball;
      const far = Math.hypot(b.x, b.z - PITCH / 2);
      wantPos.set(b.x * 0.25, 14 + far * 0.25, PITCH + 38 - Math.max(0, b.z - PITCH) * 0.2);
      wantLook.set(b.x, Math.max(0.5, b.y * 0.6), b.z);
      fov = 30 + Math.min(18, far * 0.25);
    } else if (cam === "batter" && !s.humanBowls) {
      wantPos.set(0.5, 1.75, -3.6);
      wantLook.set(-0.1, 0.9, PITCH);
      fov = 46;
    } else {
      wantPos.set(0.3, 7.4, PITCH + 31);
      wantLook.set(0, 0.6, 1.2);
      fov = 21;
    }
    const k = Math.min(1, dt * (s.phase === "live" ? 3 : 4));
    this.camPos.lerp(wantPos, k);
    this.camLook.lerp(wantLook, Math.min(1, dt * 6));
    this.fov += (fov - this.fov) * k;
    this.shake = Math.max(0, this.shake - dt);
    c.position.copy(this.camPos).add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0));
    c.fov = this.fov;
    c.updateProjectionMatrix();
    c.lookAt(this.camLook);
  }

  private pose(b: Body, f: Fielder, dt: number) {
    const g = b.model.group;
    g.position.set(f.x, 0, f.z);
    // Fielders watch the batter unless they're running somewhere.
    const face = f.speed > 0.3 || f.pose === "throw" ? f.heading : Math.atan2(-f.x, (f.role === "bowler" ? 0 : 1.5) - f.z);
    g.rotation.y = -(Math.PI / 2 - face);
    b.step += dt * Math.max(0.5, f.speed) * 1.4;
    const map: Record<string, PedPose> = { stand: "stand", run: "walk", crouch: "crouch", keeper: "catcher", catch: "mark", dive: "dive", throw: "throw", bowl: "bowl", celebrate: "celebrate" };
    let pose = map[f.pose] ?? "stand";
    if (f.role === "keeper" && f.pose === "keeper" && this.sim.phase !== "runup" && this.sim.phase !== "delivery") pose = "stand";
    if (f.role === "field" && f.pose === "crouch" && this.sim.phase !== "runup" && this.sim.phase !== "delivery") pose = "stand";
    posePed(b.model, pose, b.step, f.pose === "run" ? f.speed : 0, this.time, dt, f.act);
  }

  private poseBatter(b: Body, bt: Batter, dt: number, striker: boolean) {
    const g = b.model.group;
    g.position.set(bt.x, 0, bt.z);
    if (bt.pose === "run") {
      // Running: toward whichever end they're heading.
      const dir = striker ? (bt.z < PITCH / 2 ? 1 : -1) : bt.z > PITCH / 2 ? -1 : 1;
      g.rotation.y = -(Math.PI / 2 - (dir > 0 ? 0 : Math.PI));
      b.step += dt * 9;
      posePed(b.model, "walk", b.step, 6.5, this.time, dt);
      return;
    }
    if (!striker) {
      g.rotation.y = -(Math.PI / 2);
      posePed(b.model, "stand", 0, 0, this.time, dt);
      return;
    }
    g.rotation.y = -Math.PI;
    let pose: PedPose = "creaseStance";
    if (bt.pose === "shot") pose = bt.shot === "defend" ? "block" : bt.shot === "pull" || bt.shot === "cut" ? "swing" : "drive";
    else if (bt.pose === "out") pose = "stand";
    posePed(b.model, pose, 0, 0, this.time, dt, bt.act);
  }

  /** Delivery speed readout for the HUD. */
  static kindName(k: keyof typeof KINDS) {
    return KINDS[k].name;
  }

  destroy() {
    this.pipe.destroy();
  }
}
