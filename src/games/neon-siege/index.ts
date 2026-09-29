import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { clearSurface, createSurface, type Surface } from "../engine/canvas";
import { ScoreEmitter } from "../engine/emitter";
import { Sound } from "../engine/audio";
import type { Difficulty } from "./bots";
import { SoloController, type ModeController } from "./mode";
import { renderView, VIEW_H, VIEW_W, type HudState, type KillFeedItem } from "./render";
import type { PlayerInput } from "./solo";

const MOUSE_SENS = 0.0022;
const KEY_TURN = 2.6;
const TOUCH_LOOK_SENS = 0.009;
const STICK_RADIUS = 48;
const END_DELAY_S = 1.4;

/** DOM helper used for the menu and touch controls. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", ...children: (Node | string)[]) {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...children);
  return node;
}

const BTN =
  "rounded-md border border-border-strong bg-surface-2 px-4 py-2 text-sm font-semibold text-text hover:border-cyan focus-visible:outline-2 focus-visible:outline-cyan disabled:opacity-50";

/** Hook for online play; the online module registers itself here (keeps solo-only bundles small). */
export type OnlineMenuBuilder = (ctx: {
  playerName: string;
  start: (controller: ModeController) => void;
  container: HTMLElement;
}) => void;

export class NeonSiege implements GameModule {
  readonly slug = "neon-siege";
  private opts!: GameInitOptions;
  private surface!: Surface;
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private sound!: Sound;
  private menu!: HTMLDivElement;
  private touchLayer: HTMLDivElement | null = null;
  /** Screen-reader mirror of the canvas HUD (also handy for tests). */
  private srHud!: HTMLDivElement;
  private srHudAcc = 0;
  private mode: ModeController | null = null;
  private difficulty: Difficulty = "normal";
  private ended = false;
  /** Seconds left on the "ELIMINATED" beat before the run is reported (frame time, not world time). */
  private endIn = 0;
  private coarse = false;

  // Input state
  private keys = new Set<string>();
  private turnAccum = 0;
  private mouseDown = false;
  private reloadPressed = false;
  private touchFire = false;
  private stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  private look: { id: number; x: number } | null = null;

  // HUD state
  private hud: HudState = {
    topLeft: [],
    banner: null,
    killFeed: [],
    pings: [],
    hitMarkerAt: -1,
    showNames: false,
    bob: 0,
    reduceMotion: false,
    scoreboard: null,
  };

  constructor(private onlineMenu?: OnlineMenuBuilder) {}

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.hud.reduceMotion = opts.settings.reduceMotion;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.surface = createSurface(opts.root, VIEW_W, VIEW_H, "Neon Siege first-person arena");
    this.sound = new Sound(opts.settings.sound, opts.settings.volume);
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
      1000 / 60,
    );
    this.menu = el(
      "div",
      // Scrollable; the inner wrapper's auto margins centre it when it fits (justify-center would clip the top).
      "absolute inset-0 flex overflow-auto bg-bg/90 p-3 pb-14 text-center",
    );
    opts.root.appendChild(this.menu);
    this.srHud = el("div", "sr-only");
    this.srHud.dataset.testid = "siege-hud";
    this.srHud.setAttribute("role", "status");
    this.srHud.setAttribute("aria-live", "off");
    opts.root.appendChild(this.srHud);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearInput);
    const c = this.surface.canvas;
    c.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    c.addEventListener("pointerdown", this.onPointerDown);
    c.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    document.addEventListener("pointerlockchange", this.onLockChange);
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    this.renderIdle();
  }

  start() {
    this.loop.pause();
    this.mode?.destroy();
    this.mode = null;
    this.ended = false;
    this.hud.killFeed = [];
    this.hud.pings = [];
    this.clearInput();
    this.showMenu();
  }

  pause() {
    this.loop.pause();
    this.clearInput();
    if (document.pointerLockElement === this.surface.canvas) document.exitPointerLock();
  }

  resume() {
    if (!this.mode || this.ended) return;
    this.lockPointer();
    this.loop.resume();
  }

  destroy() {
    this.loop.pause();
    this.mode?.destroy();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearInput);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    if (document.pointerLockElement === this.surface.canvas) document.exitPointerLock();
    this.menu.remove();
    this.srHud.remove();
    this.touchLayer?.remove();
    this.surface.destroy();
    this.sound.destroy();
    this.emitter.clear();
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);

  // ------------------------------------------------------------------ menu

  private showMenu() {
    this.menu.hidden = false;
    this.touchLayer?.remove();
    this.touchLayer = null;
    const diffButtons = (["easy", "normal", "hard"] as const).map((d) => {
      const b = el("button", `${BTN} capitalize`, d);
      b.type = "button";
      b.setAttribute("aria-pressed", String(d === this.difficulty));
      b.dataset.difficulty = d;
      b.addEventListener("click", () => {
        this.difficulty = d;
        diffButtons.forEach((x) => {
          const on = x.dataset.difficulty === d;
          x.setAttribute("aria-pressed", String(on));
          x.classList.toggle("!border-cyan", on);
          x.classList.toggle("!text-cyan", on);
        });
      });
      if (d === this.difficulty) b.classList.add("!border-cyan", "!text-cyan");
      return b;
    });
    const deploy = el(
      "button",
      "rounded-md bg-cyan px-6 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-bg hover:shadow-glow-cyan",
      "Deploy vs bots",
    );
    deploy.type = "button";
    deploy.addEventListener("click", () => this.startMode(new SoloController(this.difficulty)));

    const online = el("div", "flex w-full max-w-md flex-col items-center gap-2");
    if (this.onlineMenu) {
      this.onlineMenu({
        playerName: this.opts.playerName ?? "Guest",
        start: (c) => this.startMode(c),
        container: online,
      });
    }

    const controls = this.coarse
      ? "Left thumb: move · Right thumb: look · FIRE / RELOAD buttons"
      : "WASD move · Mouse look (click to lock) · Click fire · R reload · ←/→ turn, Space fire (keyboard only)";

    this.menu.replaceChildren(
      el(
        "div",
        "m-auto flex w-full flex-col items-center gap-3",
        el("p", "font-display text-2xl font-black uppercase tracking-[0.2em] text-magenta sm:text-4xl", "Neon Siege"),
        el(
          "section",
          "flex w-full max-w-md flex-col items-center gap-2 rounded-lg border border-border bg-surface/80 p-3",
          el("h3", "text-xs font-semibold uppercase tracking-[0.2em] text-cyan", "Solo · Siege mode"),
          el("p", "text-xs text-muted", "Survive waves of AI drones. Ranked on the leaderboard."),
          el("div", "flex gap-2", ...diffButtons),
          deploy,
        ),
        online,
        el("p", "max-w-md text-[11px] text-subtle", controls),
      ),
    );
    deploy.focus({ preventScroll: true });
  }

  private startMode(controller: ModeController) {
    this.mode = controller;
    this.ended = false;
    this.menu.hidden = true;
    this.hud.showNames = controller.showNames;
    if (this.coarse) this.buildTouchControls();
    this.lockPointer();
    this.loop.start();
    this.surface.canvas.focus({ preventScroll: true });
  }

  private lockPointer() {
    if (this.coarse) return;
    try {
      const p = this.surface.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      // Pointer lock unavailable: keyboard turning + click-to-fire still work.
    }
  }

  private buildTouchControls() {
    const fire = el(
      "button",
      "pointer-events-auto absolute right-4 bottom-[34%] grid h-16 w-16 place-items-center rounded-full border-2 border-magenta bg-magenta/25 font-display text-xs font-bold text-text active:bg-magenta/60",
      "FIRE",
    );
    fire.type = "button";
    fire.setAttribute("aria-label", "Fire");
    const reload = el(
      "button",
      "pointer-events-auto absolute right-24 bottom-[40%] grid h-11 w-11 place-items-center rounded-full border border-border-strong bg-surface/70 text-[10px] font-bold text-text",
      "R",
    );
    reload.type = "button";
    reload.setAttribute("aria-label", "Reload");
    fire.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.touchFire = true;
    });
    const stop = () => (this.touchFire = false);
    fire.addEventListener("pointerup", stop);
    fire.addEventListener("pointerleave", stop);
    fire.addEventListener("pointercancel", stop);
    reload.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.reloadPressed = true;
    });
    this.touchLayer = el("div", "pointer-events-none absolute inset-0", fire, reload);
    this.opts.root.appendChild(this.touchLayer);
  }

  // ----------------------------------------------------------------- input

  private clearInput = () => {
    this.keys.clear();
    this.mouseDown = false;
    this.touchFire = false;
    this.stick = null;
    this.look = null;
    this.turnAccum = 0;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.loop.isRunning) return;
    const k = this.opts.settings.keybindings;
    const handled = [
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyQ",
      "KeyE",
      "KeyR",
      "KeyF",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Space",
      "Tab",
      k.left,
      k.right,
      k.jump,
    ];
    if (!handled.includes(e.code)) return;
    e.preventDefault();
    this.keys.add(e.code);
    if (e.code === "KeyR") this.reloadPressed = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.loop.isRunning || this.coarse) return;
    if (e.button === 0) {
      if (document.pointerLockElement !== this.surface.canvas) this.lockPointer();
      this.mouseDown = true;
    }
  };

  private onMouseUp = () => {
    this.mouseDown = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.loop.isRunning || document.pointerLockElement !== this.surface.canvas) return;
    this.turnAccum += e.movementX * MOUSE_SENS;
  };

  private onLockChange = () => {
    // Esc releases pointer lock without a keydown reaching the page: treat that as "pause".
    if (document.pointerLockElement !== this.surface.canvas && this.loop.isRunning && !this.ended && !this.coarse) {
      this.opts.requestPause?.();
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    if (!this.loop.isRunning || e.pointerType === "mouse") return;
    e.preventDefault();
    const rect = this.surface.canvas.getBoundingClientRect();
    const leftSide = e.clientX - rect.left < rect.width * 0.45;
    if (leftSide && !this.stick)
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    else if (!this.look) this.look = { id: e.pointerId, x: e.clientX };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.stick?.id === e.pointerId) {
      this.stick.x = e.clientX;
      this.stick.y = e.clientY;
    } else if (this.look?.id === e.pointerId) {
      this.turnAccum += (e.clientX - this.look.x) * TOUCH_LOOK_SENS;
      this.look.x = e.clientX;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.stick?.id === e.pointerId) this.stick = null;
    if (this.look?.id === e.pointerId) this.look = null;
  };

  private readInput(dt: number): PlayerInput {
    const k = this.opts.settings.keybindings;
    const has = (...codes: string[]) => codes.some((c) => this.keys.has(c));
    let forward = (has("KeyW", "ArrowUp") ? 1 : 0) - (has("KeyS", "ArrowDown") ? 1 : 0);
    let strafe = (has("KeyD") ? 1 : 0) - (has("KeyA") ? 1 : 0);
    const keyTurn = (has("ArrowRight", "KeyE", k.right) ? 1 : 0) - (has("ArrowLeft", "KeyQ", k.left) ? 1 : 0);
    if (this.stick) {
      const dx = (this.stick.x - this.stick.ox) / STICK_RADIUS;
      const dy = (this.stick.y - this.stick.oy) / STICK_RADIUS;
      forward = Math.max(-1, Math.min(1, -dy));
      strafe = Math.max(-1, Math.min(1, dx));
    }
    const turn = this.turnAccum + keyTurn * KEY_TURN * dt;
    this.turnAccum = 0;
    const input: PlayerInput = {
      forward,
      strafe,
      turn,
      fire: this.mouseDown || this.touchFire || has("Space", "KeyF", k.jump),
      reload: this.reloadPressed,
    };
    this.reloadPressed = false;
    if (forward || strafe) this.hud.bob += dt * 10;
    return input;
  }

  // ------------------------------------------------------------ simulation

  private update(dt: number) {
    const mode = this.mode;
    if (!mode) return;
    const me = mode.me;
    const events = mode.step(dt, this.readInput(dt));
    const t = mode.world.time;
    for (const ev of events) {
      if (ev.type === "shot") {
        if (ev.shooter === me.id) this.sound.play("select");
        else {
          const d = Math.hypot(ev.fromX - me.x, ev.fromY - me.y);
          if (d < 12) this.sound.play("land");
          this.hud.pings.push({ x: ev.fromX, y: ev.fromY, at: t });
        }
      } else if (ev.type === "damage") {
        if (ev.attacker === me.id) {
          this.hud.hitMarkerAt = t;
          this.sound.play("point");
        } else if (ev.target === me.id) this.sound.play("wrong");
      } else if (ev.type === "kill") {
        const item: KillFeedItem = {
          killer: mode.nameOf(ev.killer),
          victim: mode.nameOf(ev.victim),
          at: t,
          mine: ev.killer === me.id || ev.victim === me.id,
        };
        this.hud.killFeed = [...this.hud.killFeed.slice(-6), item];
        if (ev.killer === me.id) this.sound.play("bonus");
        if (ev.victim === me.id) this.sound.play("hit");
      } else if (ev.type === "wave" && ev.cleared) this.sound.play("bonus");
    }
    this.hud.pings = this.hud.pings.filter((p) => t - p.at < 1.2);
    this.srHudAcc += dt;
    if (this.srHudAcc >= 0.5) {
      this.srHudAcc = 0;
      const banner = mode.banner();
      const fighters = [...mode.world.entities.values()].map((e) => e.name).join(", ");
      this.srHud.textContent = `${mode.topLeft().join(". ")}. ${banner ? `${banner.text}. ` : ""}${Math.ceil(me.hp)} health, ${me.ammo} ammo. Fighters: ${fighters}.`;
    }
    this.emitter.progress(mode.score(), performance.now());

    if (mode.isOver() && !this.ended) {
      this.ended = true;
      this.endIn = END_DELAY_S;
    }
    if (this.ended) this.endIn -= dt;
    if (this.ended && this.endIn <= 0 && this.loop.isRunning) {
      this.loop.pause();
      if (document.pointerLockElement === this.surface.canvas) document.exitPointerLock();
      this.touchLayer?.remove();
      this.touchLayer = null;
      this.emitter.emit({
        kind: "final",
        score: mode.score(),
        durationMs: Math.round(this.loop.activeMs),
        ranked: mode.ranked,
      });
    }
  }

  private render() {
    const mode = this.mode;
    if (!mode) return this.renderIdle();
    clearSurface(this.surface, "#05060b");
    const showBoard = this.keys.has("Tab") || this.ended;
    this.hud.topLeft = mode.topLeft();
    this.hud.banner = this.ended ? { text: "ELIMINATED", color: "#ff4d6d" } : mode.banner();
    this.hud.scoreboard = mode.scoreboard(showBoard);
    renderView(this.surface.ctx, mode.world, mode.me, this.hud);
  }

  private renderIdle() {
    clearSurface(this.surface, "#05060b");
  }
}

let onlineBuilder: OnlineMenuBuilder | undefined;
/** Called by the online module (same chunk) to add the "Online match" menu section. */
export function registerOnlineMenu(builder: OnlineMenuBuilder) {
  onlineBuilder = builder;
}

const factory: GameFactory = () => new NeonSiege(onlineBuilder);
export default factory;
