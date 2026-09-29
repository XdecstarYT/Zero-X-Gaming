import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { clearSurface, createSurface, type Surface } from "../engine/canvas";
import { ScoreEmitter } from "../engine/emitter";
import { Sound } from "../engine/audio";
import { applyMove, createLock, idx, ROUND_SECONDS, SIZE, tick, type LockState, type Move } from "./logic";

const W = 960;
const H = 540;
const CELL = 76;
const BOARD = CELL * SIZE;
const X0 = (W - BOARD) / 2;
const Y0 = (H - BOARD) / 2;
const SWIPE_PX = 22;

/** Colour + distinct shape per tile, so colour is never the only cue. */
const TILES = [
  { color: "#22e5ff", shape: "circle" },
  { color: "#ff2bd6", shape: "square" },
  { color: "#ffcb3d", shape: "triangle" },
  { color: "#3dffa2", shape: "diamond" },
  { color: "#8b5cff", shape: "cross" },
] as const;

interface Pop {
  i: number;
  t: number;
  color: string;
}

class GridLock implements GameModule {
  readonly slug = "grid-lock";
  private surface!: Surface;
  private opts!: GameInitOptions;
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private sound!: Sound;
  private state: LockState = createLock();
  private cursor = { r: 2, c: 2 };
  private pops: Pop[] = [];
  private missFlash = 0;
  private banner: { text: string; t: number } | null = null;
  private drag: { x: number; y: number; r: number; c: number; id: number } | null = null;
  private ended = false;

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.surface = createSurface(
      opts.root,
      W,
      H,
      "Grid Lock puzzle board. Use arrow keys to move, Shift plus arrow to slide.",
    );
    this.sound = new Sound(opts.settings.sound, opts.settings.volume);
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
      1000 / 60,
    );
    window.addEventListener("keydown", this.onKey);
    const c = this.surface.canvas;
    c.addEventListener("pointerdown", this.onPointerDown);
    c.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.render();
  }

  start() {
    this.state = createLock();
    this.pops = [];
    this.banner = null;
    this.ended = false;
    this.loop.start();
  }

  pause() {
    this.loop.pause();
    this.drag = null;
  }

  resume() {
    if (!this.ended) this.loop.resume();
  }

  destroy() {
    this.loop.pause();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.surface.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.surface.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.surface.destroy();
    this.sound.destroy();
    this.emitter.clear();
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);

  private doMove(move: Move) {
    const res = applyMove(this.state, move);
    if (res.cleared === 0) {
      this.sound.play("wrong");
      this.missFlash = 1;
      this.banner = { text: `Overload −${3}s`, t: 1 };
    } else {
      this.sound.play(res.cascades > 1 ? "bonus" : "point");
      for (const i of res.firstWave) this.pops.push({ i, t: 1, color: "#ffffff" });
      if (res.cascades > 1) this.banner = { text: `Cascade x${res.cascades}!`, t: 1 };
    }
    this.emitter.progress(this.state.score, performance.now(), 0);
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.loop.isRunning) return;
    const { keybindings } = this.opts.settings;
    const dirs: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      KeyW: [-1, 0],
      ArrowDown: [1, 0],
      KeyS: [1, 0],
      ArrowLeft: [0, -1],
      KeyA: [0, -1],
      ArrowRight: [0, 1],
      KeyD: [0, 1],
      [keybindings.left]: [0, -1],
      [keybindings.right]: [0, 1],
    };
    const d = dirs[e.code];
    if (!d) return;
    e.preventDefault();
    const [dr, dc] = d;
    if (e.shiftKey) {
      if (dc !== 0) this.doMove({ axis: "row", index: this.cursor.r, dir: dc as 1 | -1 });
      else this.doMove({ axis: "col", index: this.cursor.c, dir: dr as 1 | -1 });
      // Keep the cursor on the tile that moved.
      this.cursor = { r: (this.cursor.r + (dc === 0 ? dr : 0) + SIZE) % SIZE, c: (this.cursor.c + dc + SIZE) % SIZE };
    } else {
      this.cursor = {
        r: Math.min(SIZE - 1, Math.max(0, this.cursor.r + dr)),
        c: Math.min(SIZE - 1, Math.max(0, this.cursor.c + dc)),
      };
      this.sound.play("select");
    }
  };

  private cellAt(x: number, y: number) {
    const c = Math.floor((x - X0) / CELL);
    const r = Math.floor((y - Y0) / CELL);
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE ? { r, c } : null;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.loop.isRunning) return;
    const p = this.surface.toLogical(e.clientX, e.clientY);
    const cell = this.cellAt(p.x, p.y);
    if (!cell) return;
    e.preventDefault();
    this.cursor = cell;
    this.drag = { x: p.x, y: p.y, ...cell, id: e.pointerId };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id || !this.loop.isRunning) return;
    const p = this.surface.toLogical(e.clientX, e.clientY);
    const dx = p.x - this.drag.x;
    const dy = p.y - this.drag.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    if (Math.abs(dx) > Math.abs(dy)) this.doMove({ axis: "row", index: this.drag.r, dir: dx > 0 ? 1 : -1 });
    else this.doMove({ axis: "col", index: this.drag.c, dir: dy > 0 ? 1 : -1 });
    this.drag = null;
  };

  private onPointerUp = () => {
    this.drag = null;
  };

  private update(dt: number) {
    tick(this.state, dt);
    this.pops = this.pops.map((p) => ({ ...p, t: p.t - dt * 3 })).filter((p) => p.t > 0);
    this.missFlash = Math.max(0, this.missFlash - dt * 2.5);
    if (this.banner) {
      this.banner.t -= dt * 0.9;
      if (this.banner.t <= 0) this.banner = null;
    }
    if (this.state.over && !this.ended) {
      this.ended = true;
      this.loop.pause();
      this.sound.play("hit");
      this.render();
      this.emitter.emit({ kind: "final", score: this.state.score, durationMs: Math.round(this.loop.activeMs) });
    }
  }

  private drawTile(x: number, y: number, v: number, alpha = 1) {
    const { ctx } = this.surface;
    const t = TILES[v];
    const cx = x + CELL / 2;
    const cy = y + CELL / 2;
    const r = CELL * 0.3;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#131729";
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 4, CELL - 8, CELL - 8, 10);
    ctx.fill();
    ctx.fillStyle = t.color;
    ctx.strokeStyle = t.color;
    ctx.shadowColor = t.color;
    ctx.shadowBlur = this.opts.settings.reduceMotion ? 0 : 10;
    ctx.beginPath();
    switch (t.shape) {
      case "circle":
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        break;
      case "square":
        ctx.rect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7);
        break;
      case "triangle":
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r, cy + r * 0.8);
        ctx.lineTo(cx - r, cy + r * 0.8);
        ctx.closePath();
        break;
      case "diamond":
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r, cy);
        ctx.closePath();
        break;
      case "cross":
        ctx.rect(cx - r, cy - r * 0.32, r * 2, r * 0.64);
        ctx.rect(cx - r * 0.32, cy - r, r * 0.64, r * 2);
        break;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  private render() {
    const { ctx } = this.surface;
    const s = this.state;
    clearSurface(this.surface, "#05060b");

    // Board frame
    ctx.fillStyle = "#0c0f1c";
    ctx.strokeStyle = this.missFlash > 0 ? `rgba(255,77,109,${0.4 + this.missFlash * 0.6})` : "#262c4a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(X0 - 12, Y0 - 12, BOARD + 24, BOARD + 24, 16);
    ctx.fill();
    ctx.stroke();

    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) this.drawTile(X0 + c * CELL, Y0 + r * CELL, s.board[idx(r, c)]);

    for (const p of this.pops) {
      const r = Math.floor(p.i / SIZE);
      const c = p.i % SIZE;
      ctx.strokeStyle = `rgba(255,255,255,${p.t})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(X0 + c * CELL + CELL / 2, Y0 + r * CELL + CELL / 2, CELL * (0.5 - p.t * 0.2), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cursor
    ctx.strokeStyle = "#eef1ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(X0 + this.cursor.c * CELL + 2, Y0 + this.cursor.r * CELL + 2, CELL - 4, CELL - 4, 12);
    ctx.stroke();

    // HUD: score (left), time (right)
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = "#a2aac6";
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillText("SCORE", 36, 48);
    ctx.fillStyle = "#eef1ff";
    ctx.font = "700 34px Orbitron, system-ui, sans-serif";
    ctx.fillText(String(s.score), 36, 68);
    ctx.fillStyle = "#a2aac6";
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillText(`MOVES ${s.moves}`, 36, 118);
    ctx.fillText(`BEST CASCADE x${Math.max(1, s.bestCascade)}`, 36, 140);

    const tx = X0 + BOARD + 44;
    ctx.fillText("CIRCUIT", tx, 48);
    const frac = s.timeLeft / ROUND_SECONDS;
    ctx.fillStyle = "#1b2038";
    ctx.fillRect(tx, 72, 150, 14);
    ctx.fillStyle = frac < 0.2 ? "#ff4d6d" : "#22e5ff";
    ctx.fillRect(tx, 72, 150 * Math.min(1, frac), 14);
    ctx.fillStyle = "#eef1ff";
    ctx.font = "700 26px Orbitron, system-ui, sans-serif";
    ctx.fillText(`${Math.ceil(s.timeLeft)}s`, tx, 96);

    ctx.font = "500 13px system-ui, sans-serif";
    ctx.fillStyle = "#7c85a6";
    const help = ["Swipe a row/column", "or Shift + arrows", "Line up 3+ to clear", "Misses cost 3s"];
    help.forEach((line, i) => ctx.fillText(line, tx, 400 + i * 20));

    if (this.banner) {
      ctx.globalAlpha = Math.min(1, this.banner.t * 2);
      ctx.textAlign = "center";
      ctx.font = "800 30px Orbitron, system-ui, sans-serif";
      ctx.fillStyle = this.banner.text.startsWith("Overload") ? "#ff4d6d" : "#ffcb3d";
      ctx.fillText(this.banner.text, W / 2, 6);
      ctx.globalAlpha = 1;
    }
  }
}

const factory: GameFactory = () => new GridLock();
export default factory;
