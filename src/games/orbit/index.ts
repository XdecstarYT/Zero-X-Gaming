import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { clearSurface, createSurface, type Surface } from "../engine/canvas";
import { ScoreEmitter } from "../engine/emitter";
import { Sound } from "../engine/audio";
import { createRng } from "../engine/rng";
import { createOrbit, H, multiplier, PROBE_R, score, SHARD_R, SPAWN_SHIELD_S, step, W, type OrbitState } from "./logic";

const STAR_COUNT = 90;

class Orbit implements GameModule {
  readonly slug = "orbit";
  private surface!: Surface;
  private opts!: GameInitOptions;
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private sound!: Sound;
  private state: OrbitState = createOrbit();
  private keys = new Set<string>();
  private pointers = new Map<number, { x: number; y: number }>();
  private steerPointer: number | null = null;
  private stars: { x: number; y: number; a: number }[] = [];
  private trail: { x: number; y: number }[] = [];
  private ended = false;
  private touch = false;

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.surface = createSurface(opts.root, W, H, "Orbit. Steer with left and right arrows, Space to boost.");
    this.sound = new Sound(opts.settings.sound, opts.settings.volume);
    this.touch = window.matchMedia("(pointer: coarse)").matches;
    const rng = createRng(7);
    this.stars = Array.from({ length: STAR_COUNT }, () => ({
      x: rng.range(0, W),
      y: rng.range(0, H),
      a: rng.range(0.2, 0.8),
    }));
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
    );
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    const c = this.surface.canvas;
    c.addEventListener("pointerdown", this.onPointerDown);
    c.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    this.render();
  }

  start() {
    this.state = createOrbit();
    this.trail = [];
    this.keys.clear();
    this.ended = false;
    this.loop.start();
  }

  pause() {
    this.loop.pause();
    this.keys.clear();
    this.pointers.clear();
    this.steerPointer = null;
  }

  resume() {
    if (!this.ended) this.loop.resume();
  }

  destroy() {
    this.loop.pause();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.surface.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.surface.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.surface.destroy();
    this.sound.destroy();
    this.emitter.clear();
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);

  private isControl(code: string) {
    const k = this.opts.settings.keybindings;
    return ["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "Space", k.left, k.right, k.jump].includes(code);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.loop.isRunning || !this.isControl(e.code)) return;
    e.preventDefault();
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent) => {
    if (!this.loop.isRunning) return;
    e.preventDefault();
    this.pointers.set(e.pointerId, this.surface.toLogical(e.clientX, e.clientY));
    if (this.steerPointer === null) this.steerPointer = e.pointerId;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, this.surface.toLogical(e.clientX, e.clientY));
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.steerPointer === e.pointerId) this.steerPointer = this.pointers.keys().next().value ?? null;
  };

  private input() {
    const k = this.opts.settings.keybindings;
    const left = this.keys.has("ArrowLeft") || this.keys.has("KeyA") || this.keys.has(k.left);
    const right = this.keys.has("ArrowRight") || this.keys.has("KeyD") || this.keys.has(k.right);
    let targetHeading: number | null = null;
    const steer = this.steerPointer !== null ? this.pointers.get(this.steerPointer) : undefined;
    if (steer) targetHeading = Math.atan2(steer.y - this.state.probe.y, steer.x - this.state.probe.x);
    return {
      turn: (right ? 1 : 0) - (left ? 1 : 0),
      targetHeading,
      boost: this.keys.has("Space") || this.keys.has(k.jump) || this.pointers.size >= 2,
    };
  }

  private update(dt: number) {
    const events = step(this.state, dt, this.input());
    for (const ev of events) {
      if (ev === "shard") this.sound.play("point");
      else if (ev === "combo") this.sound.play("bonus");
      else if (ev === "hit") this.sound.play("hit");
    }
    if (!this.opts.settings.reduceMotion) {
      this.trail.push({ x: this.state.probe.x, y: this.state.probe.y });
      if (this.trail.length > 24) this.trail.shift();
    }
    this.emitter.progress(score(this.state), performance.now());
    if (this.state.dead && !this.ended) {
      this.ended = true;
      this.loop.pause();
      this.render();
      this.emitter.emit({ kind: "final", score: score(this.state), durationMs: Math.round(this.loop.activeMs) });
    }
  }

  private render() {
    const { ctx } = this.surface;
    const s = this.state;
    clearSurface(this.surface, "#05060b");
    ctx.fillStyle = "#070914";
    ctx.fillRect(0, 0, W, H);
    for (const st of this.stars) {
      ctx.fillStyle = `rgba(255,255,255,${st.a})`;
      ctx.fillRect(st.x, st.y, 1.5, 1.5);
    }

    // Planets with gravity halos
    for (const p of s.planets) {
      const halo = ctx.createRadialGradient(p.x, p.y, p.r, p.x, p.y, p.r * 4);
      halo.addColorStop(0, "rgba(61,255,162,0.18)");
      halo.addColorStop(1, "rgba(61,255,162,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1b3a33";
      ctx.strokeStyle = "#3dffa2";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Shards
    for (const sh of s.shards) {
      ctx.save();
      ctx.translate(sh.x, sh.y);
      ctx.rotate(this.opts.settings.reduceMotion ? 0 : s.t * 2);
      ctx.fillStyle = "#ffcb3d";
      ctx.shadowColor = "#ffcb3d";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, -SHARD_R);
      ctx.lineTo(SHARD_R * 0.7, 0);
      ctx.lineTo(0, SHARD_R);
      ctx.lineTo(-SHARD_R * 0.7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Debris
    ctx.fillStyle = "#3a1830";
    ctx.strokeStyle = "#ff2bd6";
    ctx.lineWidth = 2;
    for (const d of s.debris) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const rr = d.r * (i % 2 ? 0.8 : 1);
        if (i === 0) ctx.moveTo(d.x + Math.cos(a) * rr, d.y + Math.sin(a) * rr);
        else ctx.lineTo(d.x + Math.cos(a) * rr, d.y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Trail + probe
    this.trail.forEach((t, i) => {
      ctx.fillStyle = `rgba(34,229,255,${(i / this.trail.length) * 0.4})`;
      ctx.fillRect(t.x - 2, t.y - 2, 4, 4);
    });
    const p = s.probe;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.heading);
    ctx.fillStyle = s.dead ? "#ff4d6d" : "#22e5ff";
    ctx.shadowColor = "#22e5ff";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(PROBE_R + 5, 0);
    ctx.lineTo(-PROBE_R, PROBE_R * 0.8);
    ctx.lineTo(-PROBE_R * 0.5, 0);
    ctx.lineTo(-PROBE_R, -PROBE_R * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (s.t < SPAWN_SHIELD_S) {
      ctx.strokeStyle = `rgba(34,229,255,${0.3 + 0.4 * (1 - s.t / SPAWN_SHIELD_S)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PROBE_R + 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    // HUD
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = "700 26px Orbitron, system-ui, sans-serif";
    ctx.fillStyle = "#eef1ff";
    ctx.fillText(String(score(s)), 24, 20);
    const m = multiplier(s);
    ctx.textAlign = "right";
    ctx.fillStyle = m > 1 ? "#ffcb3d" : "#7c85a6";
    ctx.fillText(`x${m}`, W - 24, 20);
    ctx.fillStyle = "#1b2038";
    ctx.fillRect(W - 144, 56, 120, 8);
    ctx.fillStyle = "#8b5cff";
    ctx.fillRect(W - 144, 56, 120 * s.boost, 8);
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = "#a2aac6";
    ctx.fillText("BOOST", W - 24, 68);
    if (s.t < 4) {
      ctx.textAlign = "center";
      ctx.font = "600 16px system-ui, sans-serif";
      ctx.fillStyle = "#a2aac6";
      ctx.fillText(
        this.touch
          ? "Drag to steer · second finger to boost · grab shards, avoid debris"
          : "← → steer · Space boost · grab shards, avoid debris and planets",
        W / 2,
        H - 40,
      );
    }
  }
}

const factory: GameFactory = () => new Orbit();
export default factory;
