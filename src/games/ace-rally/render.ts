import * as THREE from "three";
import { setTextureDetail } from "../neon-siege/three/textures";
import { BONES, buildPed, posePed, type PedModel, type Pose } from "../code-3/people3d";
import { SportsPipeline, canvasTexture } from "../sports-kit/pipeline";
import type { Detail, TimeOfDay } from "../sports-kit/look";
import { blobTexture } from "../aussie-rules/textures";
import { buildCourt, drawBoard, type Court } from "./court";
import { HALF_L, sideOf, TennisSim, type TennisEvent } from "./sim";
import type { Side } from "./score";

export type TennisCam = "broadcast" | "player";

const HAND_R = BONES.indexOf("handR");
const DEG = Math.PI / 180;

export interface Kit {
  shirt: string;
  pants: string;
  accent: string;
  skin: string;
  hair: string;
  female: boolean;
}

/** Kits for each draw: you (near side) and your opponent. */
export const KITS: Record<"men" | "women", [Kit, Kit]> = {
  men: [
    { shirt: "#f8fafc", pants: "#1e293b", accent: "#15803d", skin: "#c68c5d", hair: "#1a1410", female: false },
    { shirt: "#1d4ed8", pants: "#f8fafc", accent: "#facc15", skin: "#e0ac84", hair: "#4a3020", female: false },
  ],
  women: [
    { shirt: "#f8fafc", pants: "#15803d", accent: "#15803d", skin: "#8d5a3b", hair: "#1a1410", female: true },
    { shirt: "#be185d", pants: "#f8fafc", accent: "#fde68a", skin: "#f1c9a5", hair: "#b08a58", female: true },
  ],
};

/** Felt: optic yellow with the white seam. */
function ballTexture() {
  return canvasTexture(128, 64, (g) => {
    g.fillStyle = "#d8ea3a";
    g.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 600; i++) {
      g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,200,0.25)" : "rgba(90,110,0,0.18)";
      g.fillRect(Math.random() * 128, Math.random() * 64, 1, 1);
    }
    g.strokeStyle = "rgba(250,250,240,0.95)";
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x <= 128; x += 2) {
      const y = 32 + Math.sin((x / 128) * Math.PI * 2) * 18;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  });
}

/** A racket: grip, throat, an oval head with strings, held along the hand's −y. */
function buildRacket(frame: string) {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: frame, roughness: 0.35, metalness: 0.2 });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.016, 0.2, 8), new THREE.MeshStandardMaterial({ color: "#f3f3f0", roughness: 0.8 }));
  grip.position.y = -0.04;
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.16, 6), frameMat);
  throat.position.y = -0.21;
  // The head: a torus squashed to an oval, in the y–z plane (the face looks along x).
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.011, 6, 28).scale(0.78, 1, 1).rotateY(Math.PI / 2), frameMat);
  head.position.y = -0.42;
  const strings = new THREE.Mesh(
    new THREE.CircleGeometry(0.13, 24).scale(0.78, 1, 1).rotateY(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: "#f0f0e8", transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  strings.position.y = -0.42;
  g.add(grip, throat, head, strings);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

interface Body {
  model: PedModel;
  t: number;
  step: number;
}

/**
 * Ace Rally's view: Centre Court through the shared pipeline, both players
 * with rackets in hand (forehands, backhands, serves and smashes timed to the
 * ball), the chair umpire and ball kids, a felt ball with its shadow and
 * clay marks, and a broadcast or behind-the-player camera.
 */
export class TennisView {
  readonly pipe: SportsPipeline;
  private court: Court;
  private bodies: [Body, Body];
  private extras: { model: PedModel; pose: Pose; x: number; z: number; h: number; y: number }[] = [];
  private ball: THREE.Mesh;
  private shadow: THREE.Mesh;
  private time = 0;
  private cheer = 0;
  private camPos = new THREE.Vector3(-HALF_L - 13, 9.5, 0);
  private camLook = new THREE.Vector3(1, 0.3, 0);
  private fov = 36;
  private boardKey = "";
  private lastSpeed = "";
  private markN = 0;
  private winner: Side | -1 = -1;
  private m4 = new THREE.Matrix4();

  constructor(
    host: HTMLElement,
    private sim: TennisSim,
    detail: Detail,
    tod: TimeOfDay,
    kits: [Kit, Kit],
  ) {
    const high = detail !== "low";
    setTextureDetail(high ? "high" : "low");
    this.pipe = new SportsPipeline(host, detail, tod, { fov: 36, shadowSpan: 22, far: 1500 });
    const { scene } = this.pipe;
    this.court = buildCourt(detail, sim.surface, [kits[0].shirt, kits[1].shirt, kits[0].accent]);
    scene.add(this.court.group);
    this.pipe.lights(this.court.towers, { fog: 0.0012 });
    const lit = tod !== "day";
    for (const m of this.court.lampMats) m.emissiveIntensity = lit ? 3.5 : 0.15;
    (this.court.glows[0].material as THREE.SpriteMaterial).opacity = tod === "night" ? 0.7 : tod === "twilight" ? 0.35 : 0;

    const lod = high ? "high" : "low";
    const player = (k: Kit, seed: number, frame: string): Body => {
      const model = buildPed({
        skin: k.skin,
        shirt: k.shirt,
        pants: k.pants,
        hair: k.hair,
        seed,
        lod,
        outfit: { female: k.female, top: "tee", bottom: k.female ? "skirt" : "shorts", socks: true, hat: k.female ? "none" : seed % 2 ? "cap" : "none", backpack: false, officer: false, hair: k.female ? "ponytail" : "short", beard: false },
        accent: k.accent,
        shoes: "#f4f4f2",
        hatColor: "#f4f4f2",
      });
      model.bones[HAND_R].add(buildRacket(frame));
      model.group.traverse((o) => (o.castShadow = true));
      scene.add(model.group);
      return { model, t: Math.random() * 5, step: 0 };
    };
    this.bodies = [player(kits[0], 17, "#111827"), player(kits[1], 29, "#b91c1c")];
    // The chair umpire, seated; ball kids at the net posts and the back corners.
    const official = (seed: number, shirt: string, pants: string, pose: Pose, x: number, z: number, h: number, y = 0) => {
      const model = buildPed({ skin: ["#e0ac84", "#8d5a3b", "#f1c9a5", "#c68c5d"][seed % 4], shirt, pants, seed, lod: "low", outfit: { female: seed % 2 === 0, top: "tee", bottom: "shorts", socks: true, hat: "none", backpack: false, officer: false } });
      model.group.traverse((o) => (o.castShadow = true));
      scene.add(model.group);
      this.extras.push({ model, pose, x, z, h, y });
    };
    official(3, "#1e3a5f", "#d6d3d1", "drive", 0, -(6.4 + 1.25), Math.PI / 2, 1.95);
    official(4, "#0f766e", "#0f172a", "kneel", 0.6, 7.3, -Math.PI / 2);
    official(5, "#0f766e", "#0f172a", "kneel", -0.6, -7.6, Math.PI / 2);
    official(6, "#0f766e", "#0f172a", "stand", HALF_L + 5.4, 8.2, Math.PI + 0.5);
    official(7, "#0f766e", "#0f172a", "stand", -HALF_L - 5.4, -8.2, 0.5);

    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.033, 18, 12), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.9, emissive: "#3a4200", emissiveIntensity: 0.25 }));
    this.ball.castShadow = true;
    scene.add(this.ball);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    scene.add(this.shadow);
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

  onEvent(e: TennisEvent) {
    switch (e.kind) {
      case "hit":
        if (e.shot === "serve") this.lastSpeed = `${e.kmh} km/h serve`;
        break;
      case "bounce": {
        // Leave a mark (clay keeps them).
        const i = this.markN++ % 24;
        this.m4.makeRotationY(Math.atan2(this.sim.ball.vz, this.sim.ball.vx) * -1).setPosition(e.x, 0.004, e.z);
        this.court.marks.setMatrixAt(i, this.m4);
        this.court.marks.count = Math.min(24, this.markN);
        this.court.marks.instanceMatrix.needsUpdate = true;
        break;
      }
      case "point":
        this.winner = e.winner;
        this.cheer = Math.min(1, 0.35 + e.rally * 0.06 + (e.why === "ace" || e.why === "winner" ? 0.25 : 0));
        break;
      case "game":
        this.cheer = Math.max(this.cheer, 0.6);
        break;
      case "set":
      case "over":
        this.cheer = 1;
        break;
      default:
        break;
    }
  }

  private updateBoard() {
    const s = this.sim;
    const sc = s.score;
    const pts = sc.calls();
    const key = `${sc.line(0)}|${pts.join()}|${sc.server}|${this.lastSpeed}`;
    if (key === this.boardKey) return;
    this.boardKey = key;
    drawBoard(this.court.board.canvas, {
      names: [s.names[0], s.names[1].split(" ").slice(-1)[0]],
      sets: sc.sets.map((x) => [String(x[0]), String(x[1])]),
      games: sc.format === "tiebreak" ? [sc.points[0], sc.points[1]] : sc.games,
      points: sc.format === "tiebreak" ? ["", ""] : pts,
      server: sc.server,
      title: "Zero X Open · Centre Court",
      speed: this.lastSpeed,
    });
    this.court.board.texture.needsUpdate = true;
  }

  render(dt: number, cam: TennisCam) {
    const s = this.sim;
    this.time += dt;
    const b = s.ball;

    for (const p of [0, 1] as Side[]) {
      const body = this.bodies[p];
      const pl = s.players[p];
      const g = body.model.group;
      g.position.set(pl.x, 0, pl.z);
      // Face the net; turn a little toward the ball.
      const face = p === 0 ? 0 : Math.PI;
      const toBall = Math.atan2(b.z - pl.z, (b.x - pl.x) * -sideOf(p)) * 0.25 * (p === 0 ? 1 : -1);
      g.rotation.y = -(face + (s.ballLive ? toBall : 0));
      const speed = Math.hypot(pl.vx, pl.vz);
      body.step += speed * dt * 1.15;
      body.t += dt;
      let pose: Pose = "tennisReady";
      let act = 0;
      if ((s.phase === "toss" || (pl.swing?.kind === "serve" && pl.swing.t < 0.8)) && s.server === p) {
        pose = "serve";
        act = s.phase === "toss" ? Math.min(0.6, (s.tossT / 0.52) * 0.58) : Math.min(1, 0.6 + ((pl.swing?.t ?? 0.3) - 0.3) * 0.9);
      } else if (pl.swing && pl.swing.kind === "smash") {
        pose = "serve";
        act = Math.min(1, 0.6 + (pl.swing.t - 0.3) * 0.9);
      } else if (pl.swing) {
        pose = pl.swing.fore ? "forehand" : "backhand";
        act = Math.min(1, 0.45 + (pl.swing.t - 0.3) * 1.2);
      } else if (s.ballLive && s.last !== p && Math.sign(b.vx) === sideOf(p)) {
        // The ball is coming: take the racket back as it arrives.
        const ttc = Math.abs((pl.x - b.x) / (b.vx || 1));
        if (ttc < 0.55) {
          pose = (b.z - pl.z) * (p === 0 ? 1 : -1) >= 0 ? "forehand" : "backhand";
          act = 0.42 * (1 - ttc / 0.55);
        }
      } else if (s.phase === "serve" && s.server === p) pose = "stand";
      else if (s.phase === "dead" && this.winner === p && s.phaseT > 0.4) pose = s.phaseT < 1.6 ? "celebrate" : "stand";
      else if (s.phase === "changeover" || s.phase === "over") pose = s.phase === "over" && this.winner === p ? "celebrate" : "stand";
      posePed(body.model, pose, body.step, speed, body.t, dt, act);
    }
    for (const x of this.extras) {
      x.model.group.position.set(x.x, x.y, x.z);
      x.model.group.rotation.y = -x.h;
      posePed(x.model, x.pose, 0, 0, this.time, dt);
    }

    // The ball (and the server's ball before the toss).
    let [bx, by, bz] = [b.x, b.y, b.z];
    if (s.phase === "serve") {
      const hand = new THREE.Vector3();
      this.bodies[s.server].model.group.updateMatrixWorld(true);
      this.bodies[s.server].model.bones[BONES.indexOf("handL")].getWorldPosition(hand);
      [bx, by, bz] = [hand.x, hand.y - 0.05, hand.z];
    }
    this.ball.visible = by > -0.5;
    this.ball.position.set(bx, by, bz);
    this.ball.rotation.x += dt * 30 * b.spin;
    this.shadow.visible = this.ball.visible && by < 12;
    this.shadow.position.set(bx, 0.01, bz);
    this.shadow.scale.setScalar(0.12 + by * 0.04);

    this.cheer = Math.max(0, this.cheer - dt * 0.3);
    this.court.crowd.uTime.value = this.time;
    this.court.crowd.uCheer.value = this.cheer;
    this.updateBoard();
    this.camera_(dt, cam);
    this.pipe.follow(0, 0);
    this.pipe.render();
  }

  private camera_(dt: number, mode: TennisCam) {
    const s = this.sim;
    const c = this.pipe.camera;
    const me = s.players[0];
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    let fov: number;
    let snap = false;
    if (s.phase === "intro" || s.phase === "changeover" || (s.phase === "over" && s.phaseT > 1)) {
      const a = this.time * 0.08 + 0.6;
      pos = new THREE.Vector3(Math.cos(a) * 40, 20, Math.sin(a) * 32);
      look = new THREE.Vector3(0, 0, 0);
      fov = 40;
      snap = s.phaseT < 0.05;
    } else if (s.phase === "dead" && this.winner >= 0 && s.phaseT > 0.9) {
      // Push in on the player who won the point.
      const win = this.winner as Side;
      const w = s.players[win];
      const sd = sideOf(win);
      pos = new THREE.Vector3(w.x - sd * 7, 2.6, w.z * 0.6 + 2.5);
      look = new THREE.Vector3(w.x, 1.2, w.z);
      fov = 30;
    } else if (mode === "player") {
      pos = new THREE.Vector3(me.x - 6.2, 3.1, me.z * 0.7);
      look = new THREE.Vector3(me.x + 12, 0.6, me.z * 0.4);
      fov = 50;
    } else {
      // Broadcast: high behind the near baseline, drifting with the play.
      pos = new THREE.Vector3(-HALF_L - 14.5, 10, me.z * 0.18);
      look = new THREE.Vector3(1.5, -0.2, me.z * 0.12);
      fov = 34;
    }
    const k = snap ? 1 : Math.min(1, dt * 2.6);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, snap ? 1 : Math.min(1, dt * 4));
    this.fov += (fov - this.fov) * (snap ? 1 : Math.min(1, dt * 2.5));
    c.position.copy(this.camPos);
    c.lookAt(this.camLook);
    if (Math.abs(c.fov - this.fov) > 0.01) {
      c.fov = this.fov;
      c.updateProjectionMatrix();
    }
    const bd = c.position.distanceTo(this.ball.position);
    this.ball.scale.setScalar(Math.max(1, Math.min(2.6, (2 * Math.tan((c.fov * DEG) / 2) * bd) / 600 / 0.033)));
  }

  destroy() {
    this.pipe.destroy();
  }
}
