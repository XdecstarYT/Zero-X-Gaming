import type { GameFactory, GameInitOptions, GameModule } from "../types";
import { GameLoop } from "../engine/loop";
import { clearSurface, createSurface, type Surface } from "../engine/canvas";
import { ScoreEmitter } from "../engine/emitter";
import { Sound } from "../engine/audio";
import { createDash, GROUND_Y, H, multiplier, PLAYER_SIZE, PLAYER_X, score, step, W, type DashState } from "./logic";

const CYAN = "#22e5ff";
const MAGENTA = "#ff2bd6";
const VIOLET = "#8b5cff";
const JUMP_CODES = new Set(["Space", "ArrowUp", "KeyW"]);

class ZeroDash implements GameModule {
  readonly slug = "zero-dash";
  private surface!: Surface;
  private opts!: GameInitOptions;
  private loop!: GameLoop;
  private state: DashState = createDash();
  private emitter = new ScoreEmitter();
  private sound!: Sound;
  private pressed = false;
  private held = false;
  private trail: number[] = [];
  private flash = 0;
  private ended = false;

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.surface = createSurface(opts.root, W, H, "Zero Dash game. Press Space or tap to jump.");
    this.sound = new Sound(opts.settings.sound, opts.settings.volume);
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
    );
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.surface.canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    this.render();
  }

  start() {
    this.state = createDash();
    this.trail = [];
    this.ended = false;
    this.pressed = this.held = false;
    this.loop.start();
  }

  pause() {
    this.loop.pause();
    this.held = false;
  }

  resume() {
    if (!this.ended) this.loop.resume();
  }

  destroy() {
    this.loop.pause();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.surface.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.surface.destroy();
    this.sound.destroy();
    this.emitter.clear();
  }

  onScore = (l: Parameters<GameModule["onScore"]>[0]) => this.emitter.on(l);

  private isJumpKey(code: string) {
    return JUMP_CODES.has(code) || code === this.opts.settings.keybindings.jump;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.loop.isRunning || !this.isJumpKey(e.code)) return;
    e.preventDefault();
    if (!e.repeat) this.pressed = true;
    this.held = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (this.isJumpKey(e.code)) this.held = false;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (!this.loop.isRunning) return;
    e.preventDefault();
    this.pressed = true;
    this.held = true;
  };

  private onPointerUp = () => {
    this.held = false;
  };

  private update(dt: number) {
    const events = step(this.state, dt, { pressed: this.pressed, held: this.held });
    this.pressed = false;
    for (const ev of events) {
      if (ev === "jump") this.sound.play("jump");
      else if (ev === "land") this.sound.play("land");
      else if (ev === "clear") this.sound.play("point");
      else if (ev === "perfect") {
        this.sound.play("bonus");
        this.flash = 1;
      } else if (ev === "hit") this.sound.play("hit");
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    if (!this.opts.settings.reduceMotion) {
      this.trail.push(this.state.y);
      if (this.trail.length > 10) this.trail.shift();
    }
    const now = performance.now();
    this.emitter.progress(score(this.state), now);
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

    // Sky glow
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, "#0a0c18");
    sky.addColorStop(1, "#1a1240");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND_Y);

    // Perspective floor grid, scrolling with distance.
    ctx.fillStyle = "#070814";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.strokeStyle = "rgba(34,229,255,0.28)";
    ctx.lineWidth = 1;
    const vanishX = W / 2;
    const offset = (s.distance * 0.6) % 80;
    for (let i = -12; i <= 12; i++) {
      const x = vanishX + i * 80 - offset;
      ctx.beginPath();
      ctx.moveTo(vanishX + (x - vanishX) * 0.25, GROUND_Y);
      ctx.lineTo(x + (x - vanishX) * 1.5, H);
      ctx.stroke();
    }
    for (const t of [0.12, 0.3, 0.55, 0.85]) {
      const y = GROUND_Y + (H - GROUND_Y) * t;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 2;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();

    // Obstacles
    ctx.shadowColor = MAGENTA;
    for (const o of s.obstacles) {
      ctx.fillStyle = "rgba(255,43,214,0.18)";
      ctx.fillRect(o.x, GROUND_Y - o.h, o.w, o.h);
      ctx.strokeStyle = MAGENTA;
      ctx.strokeRect(o.x + 1, GROUND_Y - o.h + 1, o.w - 2, o.h - 2);
    }

    // Trail + player
    ctx.shadowBlur = 0;
    this.trail.forEach((y, i) => {
      ctx.fillStyle = `rgba(139,92,255,${(i / this.trail.length) * 0.35})`;
      const x = PLAYER_X - (this.trail.length - i) * 7;
      ctx.fillRect(x, y + 6, PLAYER_SIZE - 12, PLAYER_SIZE - 12);
    });
    ctx.shadowColor = s.dead ? MAGENTA : VIOLET;
    ctx.shadowBlur = 18;
    ctx.fillStyle = s.dead ? MAGENTA : VIOLET;
    ctx.fillRect(PLAYER_X, s.y, PLAYER_SIZE, PLAYER_SIZE);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 3;
    ctx.strokeRect(PLAYER_X + 1.5, s.y + 1.5, PLAYER_SIZE - 3, PLAYER_SIZE - 3);

    // HUD
    ctx.font = "700 28px Orbitron, system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#eef1ff";
    ctx.textAlign = "left";
    ctx.fillText(String(score(s)).padStart(5, "0"), 28, 24);
    const m = multiplier(s);
    ctx.textAlign = "right";
    ctx.fillStyle = m > 1 ? MAGENTA : "#7c85a6";
    ctx.globalAlpha = 0.6 + this.flash * 0.4;
    ctx.fillText(`x${m}`, W - 28, 24);
    ctx.globalAlpha = 1;
    if (s.distance < 400) {
      ctx.textAlign = "center";
      ctx.font = "600 18px system-ui, sans-serif";
      ctx.fillStyle = "#a2aac6";
      ctx.fillText("Tap / Space to jump · hold for higher · jump late for combos", W / 2, 90);
    }
  }
}

const factory: GameFactory = () => new ZeroDash();
export default factory;
