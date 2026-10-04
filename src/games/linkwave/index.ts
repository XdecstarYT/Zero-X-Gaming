import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { ScoreEmitter } from "../engine/emitter";
import { clearSurface, createSurface, type Surface } from "../engine/canvas";
import { at, COLS, commit, extend, isLoop, linkSize, MIN_LINK, newGame, ROWS, START_TIME, tick, type Game, type Pos } from "./logic";

/**
 * Linkwave, the ZLink+ exclusive: a neon link puzzle against the clock.
 * Drag (or use the arrows and Space) through neighbouring nodes of one
 * colour; let go to clear them. Loops clear a whole colour.
 */

const W = 600;
const H = 920;
const CELL = 86;
const BX = (W - COLS * CELL) / 2;
const BY = 190;
const PALETTE = ["#22e5ff", "#ff2bd6", "#8b5cff", "#ffcb3d", "#3dffa2"];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}
interface Floater {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

const centre = (p: Pos) => ({ x: BX + p.c * CELL + CELL / 2, y: BY + p.r * CELL + CELL / 2 });

class Linkwave implements GameModule {
  readonly slug = "linkwave";
  private opts!: GameInitOptions;
  private surface!: Surface;
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private g: Game = newGame(1);
  private chain: Pos[] = [];
  private dragging = false;
  private pointer: { x: number; y: number } | null = null;
  private cursor: Pos = { c: 2, r: 4 };
  private keyLinking = false;
  /** Drawn height of each node (by id), so they fall rather than jump. */
  private drawY = new Map<number, number>();
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private shake = 0;
  private flash = 0;
  private finished = false;
  private time = 0;
  private ac: AudioContext | null = null;

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.surface = createSurface(opts.root, W, H, "Linkwave board");
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
    );
    const c = this.surface.canvas;
    c.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("keydown", this.onKey);
    (window as unknown as Record<string, unknown>).__linkwave = {
      state: () => ({ score: this.g.score, time: this.g.time, combo: this.g.combo, links: this.g.links, loops: this.g.loops, over: this.g.over, board: this.g.board.cells.map((col) => col.map((x) => x.color)) }),
      /** Play a link along these cells (tests). */
      link: (path: Pos[]) => {
        this.chain = path.reduce((ch, p) => extend(this.g.board, ch, p), [] as Pos[]);
        this.release();
      },
      /** Run the clock down (tests). */
      setTime: (t: number) => (this.g.time = t),
    };
  }

  start() {
    this.g = newGame(Math.floor(Math.random() * 1e9));
    this.chain = [];
    this.drawY.clear();
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) this.drawY.set(this.g.board.cells[c][r].id, BY - (ROWS - r) * CELL - c * 30);
    this.particles = [];
    this.floaters = [{ x: W / 2, y: BY + ROWS * CELL * 0.45, text: "LINK!", life: 1.2, color: "#ffffff" }];
    this.finished = false;
    this.loop.start();
    this.surface.canvas.focus({ preventScroll: true });
  }

  pause() {
    this.loop.pause();
    this.dragging = false;
  }

  resume() {
    if (!this.finished) this.loop.resume();
  }

  destroy() {
    this.loop.pause();
    const c = this.surface.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("keydown", this.onKey);
    this.surface.destroy();
    this.emitter.clear();
    void this.ac?.close();
    delete (window as unknown as Record<string, unknown>).__linkwave;
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);

  // ----------------------------------------------------------------- input

  private cellAt(x: number, y: number): Pos | null {
    const c = Math.floor((x - BX) / CELL);
    const r = Math.floor((y - BY) / CELL);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    // Only count the middle of a cell, so diagonal drags don't skip.
    const cx = BX + c * CELL + CELL / 2;
    const cy = BY + r * CELL + CELL / 2;
    return Math.hypot(x - cx, y - cy) < CELL * 0.42 ? { c, r } : null;
  }

  private onDown = (e: PointerEvent) => {
    if (this.g.over || !this.loop.isRunning) return;
    const p = this.surface.toLogical(e.clientX, e.clientY);
    const cell = this.cellAt(p.x, p.y);
    if (!cell) return;
    this.dragging = true;
    this.pointer = p;
    this.chain = [cell];
    this.blip(0);
    this.surface.canvas.setPointerCapture?.(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const p = this.surface.toLogical(e.clientX, e.clientY);
    this.pointer = p;
    const cell = this.cellAt(p.x, p.y);
    if (cell) this.step(cell);
  };

  private onUp = () => {
    if (!this.dragging) return;
    this.dragging = false;
    this.pointer = null;
    this.release();
  };

  private step(cell: Pos) {
    const before = this.chain.length;
    this.chain = extend(this.g.board, this.chain, cell);
    if (this.chain.length !== before) this.blip(this.chain.length - 1, isLoop(this.chain));
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.loop.isRunning || this.g.over) return;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
    const m = moves[e.code];
    if (m) {
      e.preventDefault();
      this.cursor = { c: Math.max(0, Math.min(COLS - 1, this.cursor.c + m[0])), r: Math.max(0, Math.min(ROWS - 1, this.cursor.r + m[1])) };
      if (this.keyLinking) this.step(this.cursor);
    } else if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      if (!this.keyLinking) {
        this.keyLinking = true;
        this.chain = [this.cursor];
        this.blip(0);
      } else {
        this.keyLinking = false;
        this.release();
      }
    } else if (e.code === "Backspace") {
      this.keyLinking = false;
      this.chain = [];
    }
  }

  private release() {
    const chain = this.chain;
    this.chain = [];
    if (linkSize(chain) < MIN_LINK) return;
    const color = PALETTE[at(this.g.board, chain[0]).color];
    // Remember where everything was drawn before the board changes.
    const r = commit(this.g, chain);
    if (!r) return;
    for (const p of r.cleared) {
      const { x, y } = centre(p);
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 120 + Math.random() * 260;
        this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.4, color });
      }
    }
    // New nodes start above the board; survivors fall from where they were.
    const seen = new Set<number>();
    for (let c = 0; c < COLS; c++) {
      let fresh = 0;
      for (let rr = ROWS - 1; rr >= 0; rr--) {
        const cell = this.g.board.cells[c][rr];
        seen.add(cell.id);
        if (!this.drawY.has(cell.id)) this.drawY.set(cell.id, BY - (++fresh) * CELL);
      }
    }
    for (const id of [...this.drawY.keys()]) if (!seen.has(id)) this.drawY.delete(id);
    const end = centre(chain[chain.length - 1]);
    this.floaters.push({ x: end.x, y: end.y, text: `+${r.points.toLocaleString()}${r.combo > 1 ? ` ×${r.combo}` : ""}`, life: 1.1, color });
    if (r.loop) {
      this.floaters.push({ x: W / 2, y: BY + ROWS * CELL * 0.4, text: "LOOP! +3s", life: 1.4, color: "#ffffff" });
      this.shake = 0.35;
      this.flash = 0.5;
    } else if (r.bonus) this.floaters.push({ x: W / 2, y: BY - 30, text: `+${r.bonus}s`, life: 1, color: "#3dffa2" });
    if (r.made) this.floaters.push({ x: end.x, y: end.y - 40, text: r.made.kind === "pulse" ? "PULSE" : "PRISM", life: 1.2, color: "#ffffff" });
    this.chime(r.loop, r.cleared.length);
  }

  // ------------------------------------------------------------------ loop

  private update(dt: number) {
    this.time += dt;
    tick(this.g, dt);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 500 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.y -= 40 * dt;
      f.life -= dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt * 2);
    // Nodes fall to where they belong.
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++) {
        const cell = this.g.board.cells[c][r];
        const want = BY + r * CELL;
        const y = this.drawY.get(cell.id) ?? want;
        this.drawY.set(cell.id, y < want ? Math.min(want, y + Math.max(300, (want - y) * 9) * dt) : want);
      }
    this.emitter.progress(this.g.score, performance.now());
    if (this.g.over && !this.finished) {
      this.finished = true;
      this.chain = [];
      this.dragging = false;
      this.keyLinking = false;
      this.chime(true, 30);
      // Let the last frame draw, then hand the score to the platform.
      window.setTimeout(() => {
        this.loop.pause();
        this.emitter.emit({ kind: "final", score: this.g.score, durationMs: Math.max(1000, this.loop.activeMs) });
      }, 400);
    }
  }

  private render() {
    const s = this.surface;
    const ctx = s.ctx;
    clearSurface(s, "#05060b");
    ctx.save();
    if (this.shake && !this.opts.settings.reduceMotion) ctx.translate((Math.random() - 0.5) * 12 * this.shake, (Math.random() - 0.5) * 12 * this.shake);
    // Backdrop: a deep gradient and a faint grid.
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b0d1f");
    bg.addColorStop(1, "#140a24");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(139,92,255,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    this.hud(ctx);
    // The board's frame.
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    roundRect(ctx, BX - 10, BY - 10, COLS * CELL + 20, ROWS * CELL + 20, 22);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.rect(BX - 10, BY - 10, COLS * CELL + 20, ROWS * CELL + 20);
    ctx.clip();
    // The link being drawn.
    if (this.chain.length) {
      const col = PALETTE[at(this.g.board, this.chain[0]).color];
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const [w, a] of [
        [22, 0.18],
        [10, 0.9],
      ] as const) {
        ctx.strokeStyle = col;
        ctx.globalAlpha = a;
        ctx.lineWidth = w;
        ctx.beginPath();
        this.chain.forEach((p, i) => {
          const { x, y } = centre(p);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        if (this.pointer && this.dragging) ctx.lineTo(this.pointer.x, this.pointer.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const inChain = new Set(this.chain.map((p) => `${p.c},${p.r}`));
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++) {
        const cell = this.g.board.cells[c][r];
        const y = (this.drawY.get(cell.id) ?? BY + r * CELL) + CELL / 2;
        const x = BX + c * CELL + CELL / 2;
        const col = PALETTE[cell.color];
        const lit = inChain.has(`${c},${r}`);
        const pulse = 1 + Math.sin(this.time * 4 + c + r) * 0.04;
        const rad = (lit ? 25 : 21) * pulse;
        ctx.shadowColor = col;
        ctx.shadowBlur = lit ? 30 : 14;
        ctx.fillStyle = col;
        if (cell.kind === "node") {
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = "rgba(255,255,255,0.45)";
          ctx.beginPath();
          ctx.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.32, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell.kind === "pulse") {
          ctx.lineWidth = 5;
          ctx.strokeStyle = col;
          ctx.beginPath();
          ctx.arc(x, y, rad + 4 + Math.sin(this.time * 6) * 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y, rad * 0.6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(this.time * 1.5);
          ctx.beginPath();
          ctx.moveTo(0, -rad - 6);
          ctx.lineTo(rad + 6, 0);
          ctx.lineTo(0, rad + 6);
          ctx.lineTo(-rad - 6, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#ffffff";
          ctx.font = "900 26px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("+", x, y + 1);
        }
        ctx.shadowBlur = 0;
      }
    ctx.restore();
    // Keyboard cursor.
    if (this.keyLinking || document.activeElement === this.surface.canvas) {
      const { x, y } = centre(this.cursor);
      ctx.strokeStyle = this.keyLinking ? "#ffffff" : "rgba(255,255,255,0.45)";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      roundRect(ctx, x - CELL / 2 + 4, y - CELL / 2 + 4, CELL - 8, CELL - 8, 14);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 1.5);
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 16;
      ctx.font = `900 ${f.text.length > 8 ? 30 : 38}px Arial`;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    if (this.flash) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.25})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.g.over) {
      ctx.fillStyle = "rgba(5,6,11,0.6)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 64px Arial";
      ctx.fillText("TIME", W / 2, H / 2);
    }
    ctx.restore();
  }

  private hud(ctx: CanvasRenderingContext2D) {
    const g = this.g;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#8b5cff";
    ctx.font = "900 18px Arial";
    ctx.fillText("ZLINK+ EXCLUSIVE", 40, 52);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 46px Arial";
    ctx.fillText("LINKWAVE", 40, 100);
    ctx.textAlign = "right";
    ctx.font = "900 44px Arial";
    ctx.fillText(g.score.toLocaleString(), W - 40, 100);
    ctx.font = "700 16px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(g.combo > 1 ? `COMBO ×${g.combo}` : `${g.links} LINKS · ${g.loops} LOOPS`, W - 40, 52);
    // The clock.
    const k = Math.min(1, g.time / START_TIME);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    roundRect(ctx, 40, 130, W - 80, 14, 7);
    ctx.fill();
    const tg = ctx.createLinearGradient(40, 0, W - 40, 0);
    tg.addColorStop(0, g.time < 10 ? "#ff4d6d" : "#22e5ff");
    tg.addColorStop(1, g.time < 10 ? "#ff2bd6" : "#8b5cff");
    ctx.fillStyle = tg;
    roundRect(ctx, 40, 130, Math.max(14, (W - 80) * k), 14, 7);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = g.time < 10 ? "#ff4d6d" : "#ffffff";
    ctx.font = "800 15px Arial";
    ctx.fillText(`${Math.ceil(g.time)}s`, W / 2, 170);
    // Hint along the bottom.
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "600 15px Arial";
    ctx.fillText("Drag through matching nodes · close a loop to clear a colour", W / 2, BY + ROWS * CELL + 44);
  }

  // ----------------------------------------------------------------- sound

  private audio() {
    if (!this.opts.settings.sound) return null;
    try {
      return (this.ac ??= new AudioContext());
    } catch {
      return null;
    }
  }

  /** A note per node, climbing a pentatonic scale. */
  private blip(i: number, loop = false) {
    const ac = this.audio();
    if (!ac) return;
    const scale = [0, 2, 4, 7, 9];
    const n = scale[i % 5] + Math.floor(i / 5) * 12;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = loop ? "square" : "triangle";
    o.frequency.value = 440 * 2 ** (n / 12);
    g.gain.setValueAtTime(0.06 * this.opts.settings.volume, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.18);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.2);
  }

  private chime(big: boolean, n: number) {
    const ac = this.audio();
    if (!ac) return;
    const notes = big ? [523, 659, 784, 1047, 1319] : [659, 988];
    notes.forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = f * (1 + Math.min(n, 20) * 0.005);
      const t = ac.currentTime + i * 0.06;
      g.gain.setValueAtTime(0.07 * this.opts.settings.volume, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + 0.4);
    });
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const factory: GameFactory = () => new Linkwave();
export default factory;
