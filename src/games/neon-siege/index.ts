import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { ScoreEmitter } from "../engine/emitter";
import type { Difficulty } from "./bots";
import { OUTFITS } from "./cosmetics";
import { SiegeHud, type KillFeedItem } from "./hud";
import { itemLabel, RARITY, SLOTS, weaponDef } from "./items";
import { readGraphics, readLoadout, writeGraphics, type Graphics } from "./loadout";
import { RoyaleController, type ModeController } from "./mode";
import { CanvasView } from "./render";
import type { MatchStats, PlayerInput } from "./royale";
import { showResults, type MatchReward } from "./results";
import { SiegeAudio } from "./sfx";
import type { Tracer, ViewFx, ViewRenderer } from "./view";
import { activeWeapon, nearestChest, nearestLoot } from "./world";

const MOUSE_SENS = 0.0022;
const KEY_TURN = 2.6;
const TOUCH_LOOK_SENS = 0.008;
const STICK_RADIUS = 52;
const END_DELAY_S = 2.2;
const WEAPON_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"];

/** DOM helper used for the menu and touch controls. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", ...children: (Node | string)[]) {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...children);
  return node;
}

const BTN =
  "rounded-md border border-border-strong bg-surface-2 px-4 py-2 text-sm font-semibold text-text hover:border-cyan focus-visible:outline-2 focus-visible:outline-cyan disabled:opacity-50";

/** Hook for online play; the online module registers itself here. */
export type OnlineMenuBuilder = (ctx: {
  playerName: string;
  outfit: string;
  start: (controller: ModeController) => void;
  container: HTMLElement;
}) => void;

/**
 * Lets another game (Trenches) reuse this shell: renderer, HUD, input, audio,
 * results screen. It supplies its own slug and menu.
 */
export interface ShellConfig {
  slug: string;
  /** Replaces the Neon Siege menu. May return a cleanup (called on destroy). */
  menu?: (ctx: {
    container: HTMLElement;
    playerName: string;
    coarse: boolean;
    /** The shared graphics-quality picker, to place in the custom menu. */
    graphics: HTMLElement;
    start: (controller: ModeController) => void;
  }) => void | (() => void);
  /** Records a finished battle for this game's progression (season XP, medals). */
  onMatchEnd?: (mode: ModeController) => Promise<MatchReward | null> | null;
  /** False: skip the results screen (the host app shows its own). */
  results?: boolean;
}

/** Called when a match ends with stats (season XP / challenges / coins). */
export type MatchEndHook = (stats: MatchStats, info: { won: boolean; ranked: boolean }) => Promise<MatchReward | null>;
/** Tells the menu how many ranked matches were played (Cash Cup every third). */
export type MatchesPlayedLoader = () => Promise<number>;

export class NeonSiege implements GameModule {
  get slug() {
    return this.config.slug;
  }
  private menuCleanup: (() => void) | null = null;
  private opts!: GameInitOptions;
  private host!: HTMLDivElement;
  private view: ViewRenderer | null = null;
  private viewFor: Graphics | null = null;
  private viewKind: Graphics = "high";
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private audio!: SiegeAudio;
  private menu!: HTMLDivElement;
  private hud: SiegeHud | null = null;
  private touchLayer: HTMLDivElement | null = null;
  /** Screen-reader mirror of the HUD (also handy for tests). */
  private srHud!: HTMLDivElement;
  private srHudAcc = 0;
  private mode: ModeController | null = null;
  private difficulty: Difficulty = "normal";
  private ended = false;
  /** Seconds left on the end beat before the run is reported (frame time, not world time). */
  private endIn = 0;
  private coarse = false;
  private destroyed = false;

  // Input state
  private keys = new Set<string>();
  private turnAccum = 0;
  private mouseDown = false;
  private rightDown = false;
  private aimToggle = false;
  private reloadPressed = false;
  private interactPressed = false;
  private crouchPressed = false;
  private pronePressed = false;
  private touchDig = false;
  private throwPressed = false;
  private supportPressed: PlayerInput["support"] = null;
  private meleePressed = false;
  private maskPressed = false;
  /** Camera shake from nearby explosions (0..1, decays). */
  private shake = 0;
  private slotPressed: number | null = null;
  private touchFire = false;
  private stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  private look: { id: number; x: number } | null = null;
  private fireLook: { id: number; x: number } | null = null;
  private stickKnob: HTMLDivElement | null = null;

  // Presentation state
  private tracers: Tracer[] = [];
  private killFeed: KillFeedItem[] = [];
  private pings: { x: number; y: number; at: number }[] = [];
  private hitMarkerAt = -10;
  private bob = 0;
  private ads = 0;
  private lastHp = 100;

  private cashCupNext = false;

  constructor(
    private onlineMenu?: OnlineMenuBuilder,
    private onMatchEnd?: MatchEndHook,
    private loadMatchesPlayed?: MatchesPlayedLoader,
    private config: ShellConfig = { slug: "neon-siege" },
  ) {}

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.viewKind = readGraphics(this.coarse);
    this.host = el("div", "absolute inset-0 bg-[#101418]");
    this.host.style.touchAction = "none";
    opts.root.appendChild(this.host);
    this.audio = new SiegeAudio(opts.settings.sound, opts.settings.volume);
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
      1000 / 60,
    );
    this.menu = el("div", "absolute inset-0 z-10 flex overflow-auto bg-bg/90 p-3 pb-14 text-center");
    opts.root.appendChild(this.menu);
    this.srHud = el("div", "sr-only");
    this.srHud.dataset.testid = "siege-hud";
    this.srHud.setAttribute("role", "status");
    this.srHud.setAttribute("aria-live", "off");
    opts.root.appendChild(this.srHud);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearInput);
    this.host.addEventListener("mousedown", this.onMouseDown);
    this.host.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    this.host.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    document.addEventListener("pointerlockchange", this.onLockChange);
    this.host.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  start() {
    this.loop.pause();
    this.mode?.destroy();
    this.mode = null;
    this.ended = false;
    this.killFeed = [];
    this.pings = [];
    this.tracers = [];
    this.clearInput();
    this.showMenu();
  }

  pause() {
    this.loop.pause();
    this.clearInput();
    if (document.pointerLockElement === this.host) document.exitPointerLock();
  }

  resume() {
    if (!this.mode || this.ended) return;
    this.lockPointer();
    this.loop.resume();
  }

  destroy() {
    this.destroyed = true;
    this.loop.pause();
    this.mode?.destroy();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearInput);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    if (document.pointerLockElement === this.host) document.exitPointerLock();
    this.menuCleanup?.();
    this.menu.remove();
    this.srHud.remove();
    this.touchLayer?.remove();
    this.hud?.destroy();
    this.view?.destroy();
    this.host.remove();
    this.audio.destroy();
    this.emitter.clear();
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);

  // ------------------------------------------------------------------ menu

  private showMenu() {
    this.menu.hidden = false;
    this.touchLayer?.remove();
    this.touchLayer = null;
    this.hud?.destroy();
    this.hud = null;
    const loadout = readLoadout();
    // Warm the 3D chunk while the player picks a mode.
    if (this.viewKind !== "2d") void import("./render3d").catch(() => {});

    const pressedGroup = <T extends string>(
      values: readonly T[],
      current: T,
      label: (v: T) => string,
      onPick: (v: T) => void,
    ) => {
      const buttons = values.map((v) => {
        const b = el("button", `${BTN} px-3 capitalize`, label(v));
        b.type = "button";
        b.dataset.value = v;
        b.addEventListener("click", () => {
          onPick(v);
          buttons.forEach((x) => {
            const on = x.dataset.value === v;
            x.setAttribute("aria-pressed", String(on));
            x.classList.toggle("!border-cyan", on);
            x.classList.toggle("!text-cyan", on);
          });
        });
        const on = v === current;
        b.setAttribute("aria-pressed", String(on));
        if (on) b.classList.add("!border-cyan", "!text-cyan");
        return b;
      });
      return buttons;
    };

    const diffButtons = pressedGroup(
      ["easy", "normal", "hard"] as const,
      this.difficulty,
      (d) => d,
      (d) => (this.difficulty = d),
    );
    const fast = new URLSearchParams(window.location.search).get("siege") === "quick";
    // Cash Cup status: every third ranked match. Filled in once progress loads.
    const cup = el("div", "w-full rounded-md border border-[#f2c230]/40 bg-[#f2c230]/10 px-3 py-2 text-xs text-muted");
    cup.dataset.testid = "cash-cup";
    cup.hidden = true;
    this.cashCupNext = false;
    if (this.loadMatchesPlayed && !fast) {
      void this.loadMatchesPlayed()
        .then((played) => {
          const until = (3 - ((played + 1) % 3)) % 3;
          this.cashCupNext = until === 0;
          cup.hidden = false;
          if (this.cashCupNext) {
            cup.replaceChildren(
              el("strong", "font-display text-sm text-[#f2c230]", "CASH CUP NEXT! "),
              "Finish 1st / 2nd / 3rd for 50 / 20 / 5 ZX Cash. Cash Cups are played on Hard.",
            );
            diffButtons.forEach((b) => {
              b.disabled = true;
              const on = b.dataset.value === "hard";
              b.setAttribute("aria-pressed", String(on));
              b.classList.toggle("!border-cyan", on);
              b.classList.toggle("!text-cyan", on);
            });
          } else {
            cup.textContent = `Cash Cup in ${until} match${until === 1 ? "" : "es"}: every third match pays ZX Cash to the top 3.`;
          }
        })
        .catch(() => {});
    }
    const gfxButtons = pressedGroup(
      ["high", "low", "2d"] as const,
      this.viewKind,
      (g) => (g === "2d" ? "Classic 2D" : g === "high" ? "High" : "Low"),
      (g) => {
        this.viewKind = g;
        writeGraphics(g);
      },
    );
    if (this.config.menu) {
      // Custom menu (e.g. Trenches). Built once; it keeps its own state (lobbies) between battles.
      if (!this.menuCleanup) {
        const box = el("div", "m-auto flex w-full flex-col items-center gap-3");
        this.menu.replaceChildren(box);
        this.menuCleanup =
          this.config.menu({
            container: box,
            playerName: this.opts.playerName ?? "Guest",
            coarse: this.coarse,
            graphics: el("div", "flex flex-wrap items-center justify-center gap-2 text-xs text-muted", el("span", "", "Graphics:"), ...gfxButtons),
            start: (c) => void this.startMode(c),
          }) ?? (() => {});
      }
      return;
    }
    const deploy = el(
      "button",
      "rounded-md bg-[#ffb321] px-6 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-[#1b1406] hover:brightness-110",
      "Drop in",
    );
    deploy.type = "button";
    deploy.addEventListener("click", () => {
      const cashCup = this.cashCupNext && !fast;
      void this.startMode(
        new RoyaleController(cashCup ? "hard" : this.difficulty, Date.now(), {
          outfit: loadout.outfit,
          name: this.opts.playerName ?? "You",
          stormScale: fast ? 12 : 1,
          cashCup,
        }),
      );
    });

    const online = el("div", "flex w-full max-w-md flex-col items-center gap-2");
    if (this.onlineMenu) {
      this.onlineMenu({
        playerName: this.opts.playerName ?? "Guest",
        outfit: loadout.outfit,
        start: (c) => void this.startMode(c),
        container: online,
      });
    }

    const controls = this.coarse
      ? "Left thumb: move · Right thumb: look · FIRE (drag to aim) · AIM · tap hotbar to switch · tap the prompt to loot"
      : "WASD move · Mouse look (click to lock) · Click fire · Right-click aim · E loot / open · 1–5 or wheel switch · R reload · Tab scores";

    const outfitName = OUTFITS[loadout.outfit]?.name ?? "Recruit";
    const locker = el(
      "a",
      "text-xs font-semibold text-cyan underline-offset-2 hover:underline",
      `Outfit: ${outfitName} · Change in Locker`,
    );
    locker.setAttribute("href", "/locker");

    this.menu.replaceChildren(
      el(
        "div",
        "m-auto flex w-full flex-col items-center gap-3",
        el("p", "font-display text-2xl font-black uppercase tracking-[0.2em] text-text sm:text-4xl", "Neon Siege"),
        el("p", "-mt-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#ffb321]", "Season 1 · Ground Zero"),
        el(
          "section",
          "flex w-full max-w-md flex-col items-center gap-2 rounded-lg border border-border bg-surface/80 p-3",
          el("h3", "text-xs font-semibold uppercase tracking-[0.2em] text-cyan", "Battle Royale · Solo"),
          el(
            "p",
            "text-xs text-muted",
            "16 fighters, one town, a closing storm. Loot, survive, win. Ranked + season XP.",
          ),
          cup,
          Object.assign(el("a", "text-xs font-bold text-[#10b981] underline-offset-2 hover:underline", "Want a bigger purse? Cash Cup tournaments: 55 fighters, 250 ZX Cash for the win →"), { href: "/cash-cup" }),
          el("div", "flex gap-2", ...diffButtons),
          deploy,
          locker,
        ),
        online,
        el(
          "div",
          "flex flex-wrap items-center justify-center gap-2 text-xs text-muted",
          el("span", "", "Graphics:"),
          ...gfxButtons,
        ),
        el("p", "max-w-md text-[11px] text-subtle", controls),
      ),
    );
    deploy.focus({ preventScroll: true });
  }

  /** Create (or swap) the view renderer for the chosen graphics setting. */
  private async ensureView() {
    const want = this.viewKind;
    if (this.view && this.viewFor === want) return;
    this.view?.destroy();
    this.view = null;
    this.viewFor = want;
    if (want !== "2d") {
      try {
        const { ThreeView } = await import("./render3d");
        if (this.destroyed) return;
        this.view = new ThreeView(this.host, { quality: want, wrap: readLoadout().wrap });
        return;
      } catch (e) {
        // No WebGL (or it failed to start): fall back to the 2D raycaster.
        console.warn("Neon Siege: 3D view unavailable, using 2D", e);
      }
    }
    this.view = new CanvasView(this.host);
  }

  private async startMode(controller: ModeController) {
    this.mode = controller;
    // Test hook (?siege=shot): the running mode, for scripts.
    if (new URLSearchParams(window.location.search).get("siege") === "shot") (window as unknown as { __siegeMode?: ModeController }).__siegeMode = controller;
    this.ended = false;
    this.killFeed = [];
    this.pings = [];
    this.tracers = [];
    this.menu.hidden = true;
    this.lastHp = controller.me.hp;
    this.srHudAcc = 0.5; // announce the match state on the very first tick
    await this.ensureView();
    if (this.destroyed || this.mode !== controller) return;
    this.hud?.destroy();
    this.hud = new SiegeHud(this.opts.root, {
      coarse: this.coarse,
      onSlot: (i) => (this.slotPressed = i),
      onInteract: () => (this.interactPressed = true),
    });
    if (this.coarse) this.buildTouchControls();
    this.lockPointer();
    this.loop.start();
    this.view?.canvas.focus({ preventScroll: true });
  }

  private lockPointer() {
    if (this.coarse) return;
    try {
      const p = this.host.requestPointerLock?.() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      // Pointer lock unavailable: keyboard turning + click-to-fire still work.
    }
  }

  private buildTouchControls() {
    const round = (label: string, cls: string) => {
      const b = el(
        "button",
        `pointer-events-auto absolute grid place-items-center rounded-full border-2 font-display font-bold text-white backdrop-blur-sm ${cls}`,
        label,
      );
      b.type = "button";
      b.tabIndex = -1;
      return b;
    };
    // Fire: hold to shoot; drag while holding to keep aiming (thumb never has to leave it).
    const fire = round(
      "FIRE",
      "right-[4%] bottom-[30%] h-20 w-20 border-white/60 bg-white/15 text-xs active:bg-white/35",
    );
    fire.setAttribute("aria-label", "Fire");
    fire.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.touchFire = true;
      this.fireLook = { id: e.pointerId, x: e.clientX };
      fire.setPointerCapture?.(e.pointerId);
    });
    const stopFire = (e: PointerEvent) => {
      if (this.fireLook?.id !== e.pointerId) return;
      this.touchFire = false;
      this.fireLook = null;
    };
    fire.addEventListener("pointerup", stopFire);
    fire.addEventListener("pointercancel", stopFire);
    // Mirror fire button on the left for two-thumb shooting.
    const fireL = round(
      "FIRE",
      "left-[4%] top-[34%] h-14 w-14 border-white/40 bg-white/10 text-[10px] active:bg-white/35",
    );
    fireL.setAttribute("aria-label", "Fire (left)");
    fireL.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.touchFire = true;
    });
    const stopL = () => (this.touchFire = !!this.fireLook);
    fireL.addEventListener("pointerup", stopL);
    fireL.addEventListener("pointercancel", stopL);
    const aim = round("AIM", "right-[4%] bottom-[calc(30%+6rem)] h-14 w-14 border-white/40 bg-white/10 text-[10px]");
    aim.setAttribute("aria-label", "Aim down sights");
    aim.setAttribute("aria-pressed", "false");
    aim.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.aimToggle = !this.aimToggle;
      aim.setAttribute("aria-pressed", String(this.aimToggle));
      aim.style.background = this.aimToggle ? "rgba(255,179,33,.45)" : "";
    });
    const reload = round("R", "right-[calc(4%+5.75rem)] bottom-[30%] h-12 w-12 border-white/40 bg-white/10 text-xs");
    reload.setAttribute("aria-label", "Reload");
    reload.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.reloadPressed = true;
    });
    this.stickKnob = el(
      "div",
      "absolute hidden h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30 bg-white/5",
    ) as HTMLDivElement;
    const knob = el(
      "div",
      "absolute top-1/2 left-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40",
    );
    this.stickKnob.appendChild(knob);
    const extra: HTMLElement[] = [];
    if (this.mode?.realism) {
      // Stance toggles and a hold-to-dig button (Trenches).
      const small = "h-11 w-11 border-white/40 bg-white/10 text-[9px]";
      const crouch = round("CRCH", `right-[calc(4%+5.5rem)] bottom-[calc(30%+4rem)] ${small}`);
      crouch.setAttribute("aria-label", "Crouch");
      crouch.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.crouchPressed = true;
      });
      const prone = round("PRONE", `right-[calc(4%+9rem)] bottom-[calc(30%+1rem)] ${small}`);
      prone.setAttribute("aria-label", "Go prone");
      prone.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.pronePressed = true;
      });
      const dig = round("DIG", `right-[calc(4%+9rem)] bottom-[calc(30%+4.5rem)] ${small}`);
      dig.setAttribute("aria-label", "Dig (hold)");
      dig.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.touchDig = true;
      });
      const stopDig = () => (this.touchDig = false);
      dig.addEventListener("pointerup", stopDig);
      dig.addEventListener("pointercancel", stopDig);
      dig.addEventListener("pointerleave", stopDig);
      const nade = round("NADE", `right-[calc(4%+5.5rem)] bottom-[calc(30%+7.5rem)] ${small}`);
      nade.setAttribute("aria-label", "Throw grenade");
      nade.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.throwPressed = true;
      });
      // Support calls: artillery on the aim point, a supply drop, a recon flare.
      const support = (label: string, aria: string, kind: NonNullable<PlayerInput["support"]>, pos: string) => {
        const b = round(label, `${pos} ${small}`);
        b.setAttribute("aria-label", aria);
        b.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.supportPressed = kind;
        });
        return b;
      };
      extra.push(
        crouch,
        prone,
        dig,
        nade,
        support("ARTY", "Call artillery", "artillery", "right-[calc(4%+12.5rem)] bottom-[calc(30%+4.5rem)]"),
        support("SUP", "Call a supply drop", "supply", "right-[calc(4%+12.5rem)] bottom-[calc(30%+1rem)]"),
        support("RCN", "Fire a recon flare", "recon", "right-[calc(4%+9rem)] bottom-[calc(30%+8rem)]"),
        support("GAS", "Call gas shells", "gas", "right-[calc(4%+12.5rem)] bottom-[calc(30%+8rem)]"),
      );
      const press = (label: string, aria: string, pos: string, on: () => void) => {
        const b = round(label, `${pos} ${small}`);
        b.setAttribute("aria-label", aria);
        b.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          on();
        });
        return b;
      };
      extra.push(
        press("BAYO", "Bayonet", "right-[calc(4%+2rem)] bottom-[calc(30%+7.5rem)]", () => (this.meleePressed = true)),
        press("MASK", "Gas mask on / off", "right-[calc(4%+16rem)] bottom-[calc(30%+4.5rem)]", () => (this.maskPressed = true)),
      );
    }
    this.touchLayer = el("div", "pointer-events-none absolute inset-0 z-[5]", this.stickKnob, fire, fireL, aim, reload, ...extra);
    this.opts.root.appendChild(this.touchLayer);
  }

  // ----------------------------------------------------------------- input

  private clearInput = () => {
    this.keys.clear();
    this.mouseDown = false;
    this.rightDown = false;
    this.touchFire = false;
    this.touchDig = false;
    this.stick = null;
    this.look = null;
    this.fireLook = null;
    this.turnAccum = 0;
    if (this.stickKnob) this.stickKnob.classList.add("hidden");
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.loop.isRunning) return;
    const k = this.opts.settings.keybindings;
    const handled = [
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyE",
      "KeyR",
      "KeyF",
      "KeyZ",
      "KeyC",
      "KeyX",
      "KeyG",
      "KeyQ",
      ...(this.mode?.realism ? ["KeyB", "KeyN", "KeyT", "KeyV", "KeyH", "KeyM"] : []),
      "ShiftLeft",
      "ShiftRight",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Space",
      "Tab",
      ...WEAPON_KEYS,
      k.left,
      k.right,
      k.jump,
    ];
    if (!handled.includes(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === "KeyR") this.reloadPressed = true;
    if (e.code === "KeyE") this.interactPressed = true;
    if (e.code === "KeyC") this.crouchPressed = true;
    if (e.code === "KeyX") this.pronePressed = true;
    if (e.code === "KeyQ") this.throwPressed = true;
    if (e.code === "KeyB") this.supportPressed = "artillery";
    if (e.code === "KeyN") this.supportPressed = "supply";
    if (e.code === "KeyT") this.supportPressed = "recon";
    if (e.code === "KeyH") this.supportPressed = "gas";
    if (e.code === "KeyV") this.meleePressed = true;
    if (e.code === "KeyM") this.maskPressed = true;
    const slot = WEAPON_KEYS.indexOf(e.code);
    if (slot >= 0) this.slotPressed = slot;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.loop.isRunning || this.coarse) return;
    if (e.button === 0) {
      if (document.pointerLockElement !== this.host) this.lockPointer();
      this.mouseDown = true;
    } else if (e.button === 2) this.rightDown = true;
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 2) this.rightDown = false;
    else this.mouseDown = false;
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.loop.isRunning || !this.mode) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    this.slotPressed = (this.mode.me.active + dir + SLOTS) % SLOTS;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.loop.isRunning || document.pointerLockElement !== this.host) return;
    this.turnAccum += e.movementX * MOUSE_SENS * this.lookScale();
  };

  /** Slower look while zoomed in. */
  private lookScale() {
    const w = this.mode ? activeWeapon(this.mode.me) : null;
    return 1 / (1 + ((w ? weaponDef(w).zoom : 1) - 1) * this.ads);
  }

  private onLockChange = () => {
    // Esc releases pointer lock without a keydown reaching the page: treat that as "pause".
    if (document.pointerLockElement !== this.host && this.loop.isRunning && !this.ended && !this.coarse) {
      this.opts.requestPause?.();
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    if (!this.loop.isRunning || e.pointerType === "mouse") return;
    e.preventDefault();
    const rect = this.host.getBoundingClientRect();
    const leftSide = e.clientX - rect.left < rect.width * 0.45;
    if (leftSide && !this.stick) {
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      if (this.stickKnob) {
        this.stickKnob.classList.remove("hidden");
        this.stickKnob.style.left = `${e.clientX - rect.left}px`;
        this.stickKnob.style.top = `${e.clientY - rect.top}px`;
      }
    } else if (!this.look) this.look = { id: e.pointerId, x: e.clientX };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.stick?.id === e.pointerId) {
      this.stick.x = e.clientX;
      this.stick.y = e.clientY;
      const knob = this.stickKnob?.firstElementChild as HTMLElement | null;
      if (knob) {
        const dx = Math.max(-STICK_RADIUS, Math.min(STICK_RADIUS, e.clientX - this.stick.ox));
        const dy = Math.max(-STICK_RADIUS, Math.min(STICK_RADIUS, e.clientY - this.stick.oy));
        knob.style.transform = `translate(calc(-50% + ${dx * 0.6}px), calc(-50% + ${dy * 0.6}px))`;
      }
    } else if (this.look?.id === e.pointerId) {
      this.turnAccum += (e.clientX - this.look.x) * TOUCH_LOOK_SENS * this.lookScale();
      this.look.x = e.clientX;
    } else if (this.fireLook?.id === e.pointerId) {
      this.turnAccum += (e.clientX - this.fireLook.x) * TOUCH_LOOK_SENS * this.lookScale();
      this.fireLook.x = e.clientX;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.stick?.id === e.pointerId) {
      this.stick = null;
      this.stickKnob?.classList.add("hidden");
    }
    if (this.look?.id === e.pointerId) this.look = null;
    if (this.fireLook?.id === e.pointerId) {
      this.fireLook = null;
      this.touchFire = false;
    }
  };

  private readInput(dt: number): PlayerInput {
    const k = this.opts.settings.keybindings;
    const has = (...codes: string[]) => codes.some((c) => this.keys.has(c));
    let forward = (has("KeyW", "ArrowUp") ? 1 : 0) - (has("KeyS", "ArrowDown") ? 1 : 0);
    let strafe = (has("KeyD") ? 1 : 0) - (has("KeyA") ? 1 : 0);
    const keyTurn = (has("ArrowRight", k.right) ? 1 : 0) - (has("ArrowLeft", k.left) ? 1 : 0);
    if (this.stick) {
      const dx = (this.stick.x - this.stick.ox) / STICK_RADIUS;
      const dy = (this.stick.y - this.stick.oy) / STICK_RADIUS;
      forward = Math.max(-1, Math.min(1, -dy));
      strafe = Math.max(-1, Math.min(1, dx));
    }
    const turn = this.turnAccum + keyTurn * KEY_TURN * dt * this.lookScale();
    this.turnAccum = 0;
    const realism = !!this.mode?.realism;
    // A fully pushed stick sprints on touch.
    const stickSprint = !!this.stick && forward > 0.92;
    const input: PlayerInput = {
      forward,
      strafe,
      turn,
      fire: this.mouseDown || this.touchFire || has("Space", "KeyF", k.jump),
      reload: this.reloadPressed,
      aim: this.rightDown || this.aimToggle || has("KeyZ") || (!realism && has("ShiftLeft")),
      interact: this.interactPressed,
      slot: this.slotPressed,
      sprint: realism && (has("ShiftLeft", "ShiftRight") || stickSprint),
      crouch: this.crouchPressed,
      prone: this.pronePressed,
      dig: has("KeyG") || this.touchDig,
      throw: this.throwPressed,
      support: realism ? this.supportPressed : null,
      melee: realism && this.meleePressed,
      mask: realism && this.maskPressed,
    };
    if (this.maskPressed) this.audio.cue("mask");
    this.meleePressed = false;
    this.maskPressed = false;
    this.throwPressed = false;
    this.supportPressed = null;
    this.reloadPressed = false;
    this.interactPressed = false;
    this.crouchPressed = false;
    this.pronePressed = false;
    if (this.slotPressed !== null) this.aimToggle = false;
    this.slotPressed = null;
    if (forward || strafe) this.bob += dt * 9;
    return input;
  }

  // ------------------------------------------------------------ simulation

  private update(dt: number) {
    const mode = this.mode;
    if (!mode) return;
    const me = mode.me;
    const hadWeapon = activeWeapon(me);
    const ammoBefore = hadWeapon?.ammo ?? 0;
    const input = this.readInput(dt);
    const events = mode.step(dt, input);
    const t = mode.world.time;
    if (input.fire && hadWeapon && ammoBefore === 0 && me.reloadUntil <= t) this.audio.cue("empty");
    for (const ev of events) {
      switch (ev.type) {
        case "shot": {
          const mine = ev.shooter === me.id;
          this.tracers.push({ ...ev, at: t, hit: ev.hit !== null });
          if (mine) this.audio.shot(ev.weapon);
          else {
            const d = Math.hypot(ev.fromX - me.x, ev.fromY - me.y);
            const rel = Math.atan2(ev.fromY - me.y, ev.fromX - me.x) - me.angle;
            this.audio.shot(ev.weapon, d, Math.sin(rel));
            if (d < 40) this.pings.push({ x: ev.fromX, y: ev.fromY, at: t });
          }
          break;
        }
        case "damage":
          if (ev.attacker === me.id) {
            this.hitMarkerAt = t;
            this.audio.cue(ev.shield ? "shieldHit" : "hitmarker");
          } else if (ev.target === me.id) this.audio.cue(ev.attacker === "storm" ? "storm" : "hurt");
          break;
        case "kill": {
          const text =
            ev.weapon === "storm"
              ? `${mode.nameOf(ev.victim)} was lost to the storm`
              : ev.weapon === "artillery"
                ? `${mode.nameOf(ev.victim)} was caught by artillery`
                : ev.weapon === "gas"
                  ? `${mode.nameOf(ev.victim)} was gassed`
                  : `${mode.nameOf(ev.killer)}  ${ev.weapon === "grenade" ? "💥" : ev.weapon === "bayonet" ? "🗡" : "✕"}  ${mode.nameOf(ev.victim)}`;
          this.killFeed = [
            ...this.killFeed.slice(-6),
            { text, at: t, mine: ev.killer === me.id || ev.victim === me.id },
          ];
          if (ev.killer === me.id) this.audio.cue("elim");
          break;
        }
        case "reload":
          if (ev.id === me.id) this.audio.cue("reload");
          break;
        case "pickup":
          if (ev.id === me.id) this.audio.cue("pickup");
          break;
        case "chest": {
          const c = mode.world.chests.find((x) => x.id === ev.id);
          if (ev.by === me.id || (c && Math.hypot(c.x - me.x, c.y - me.y) < 10)) this.audio.cue("chest");
          break;
        }
        case "heal":
          if (ev.id === me.id) this.audio.cue("heal");
          break;
        case "melee":
          if (ev.id === me.id || ev.hit) this.audio.cue("stab");
          break;
        case "gas": {
          const d = Math.hypot(ev.x - me.x, ev.y - me.y);
          if (d < 60) this.audio.cue("gasAlarm");
          break;
        }
        case "revive":
          if (ev.id === me.id || ev.by === me.id) this.audio.cue("revive");
          break;
        case "blast": {
          const d = Math.hypot(ev.x - me.x, ev.y - me.y);
          const rel = Math.atan2(ev.y - me.y, ev.x - me.x) - me.angle;
          this.audio.boom(d, Math.sin(rel), ev.big);
          this.shake = Math.max(this.shake, Math.max(0, 1 - d / (ev.big ? 40 : 18)));
          break;
        }
        case "incoming": {
          const d = Math.hypot(ev.x - me.x, ev.y - me.y);
          if (d < 70) this.audio.whistle(Math.sin(Math.atan2(ev.y - me.y, ev.x - me.x) - me.angle));
          break;
        }
      }
    }
    this.tracers = this.tracers.filter((tr) => t - tr.at < 0.25);
    // The battlefield rumbles: distant artillery every few seconds.
    if (mode.world.map.theme === "battlefield" && Math.random() < dt / 5)
      this.audio.shot(Math.random() < 0.5 ? "sniper" : "shotgun", 60 + Math.random() * 40, Math.random() * 2 - 1);
    this.pings = this.pings.filter((p) => t - p.at < 1.2);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const wantAds = me.aiming ? 1 : 0;
    this.ads += (wantAds - this.ads) * Math.min(1, dt * 12);
    this.lastHp = me.hp;

    this.srHudAcc += dt;
    if (this.srHudAcc >= 0.5) {
      this.srHudAcc = 0;
      const st = mode.status();
      const banner = mode.banner();
      const w = activeWeapon(me);
      const fighters = [...mode.world.entities.values()].map((e) => e.name).join(", ");
      this.srHud.textContent = `${st.primary}. ${st.kills} kills. ${st.storm ?? ""}. ${st.detail ? `${st.detail}. ` : ""}${banner ? `${banner.text}. ` : ""}${Math.ceil(me.hp)} health, ${Math.ceil(me.shield)} shield. ${w ? `${itemLabel(w)}, ${w.ammo} ammo.` : ""} Fighters: ${fighters}.`;
    }
    this.emitter.progress(mode.score(), performance.now());

    const over = mode.isOver() || (!me.alive && mode.storm !== null);
    if (over && !this.ended) {
      this.ended = true;
      this.endIn = END_DELAY_S;
    }
    if (this.ended) this.endIn -= dt;
    if (this.ended && this.endIn <= 0 && this.loop.isRunning) this.finish(mode);
  }

  private finish(mode: ModeController) {
    this.loop.pause();
    if (document.pointerLockElement === this.host) document.exitPointerLock();
    this.touchLayer?.remove();
    this.touchLayer = null;
    const stats = mode.stats();
    const score = mode.score();
    const durationMs = Math.round(this.loop.activeMs);
    const reward = this.config.onMatchEnd
      ? this.config.onMatchEnd(mode)
      : stats && mode.ranked && this.onMatchEnd
        ? this.onMatchEnd(stats, { won: mode.won(), ranked: true })
        : null;
    if (this.config.results === false) {
      this.emitter.emit({ kind: "final", score, durationMs, ranked: mode.ranked });
      return;
    }
    // Results screen first; the platform's game-over (score submit) follows on Continue.
    void showResults(this.opts.root, {
      stats,
      won: mode.won(),
      ranked: mode.ranked,
      reward,
      reduceMotion: this.opts.settings.reduceMotion,
      score,
      title: mode.resultTitle?.(),
      lines: mode.resultLines?.(),
    }).then(() => {
      if (this.destroyed) return;
      // Lobby games go back to their lobby instead of ending the run.
      if (mode.afterResults?.()) {
        mode.destroy();
        this.mode = null;
        this.ended = false;
        this.hud?.destroy();
        this.hud = null;
        this.showMenu();
        return;
      }
      this.emitter.emit({ kind: "final", score, durationMs, ranked: mode.ranked });
    });
  }

  private promptFor() {
    const mode = this.mode!;
    const me = mode.me;
    if (!me.alive) return { text: null, color: null };
    const special = mode.prompt?.();
    if (special) return { text: special, color: "#ffb321" };
    const chest = nearestChest(mode.world, me);
    if (chest) return { text: "Open chest", color: "#f2c230" };
    const drop = nearestLoot(mode.world, me);
    if (!drop) return { text: null, color: null };
    const color = drop.item.type === "weapon" ? RARITY[drop.item.rarity].color : null;
    return { text: `Pick up ${itemLabel(drop.item)}`, color };
  }

  private render() {
    const mode = this.mode;
    if (!mode || !this.view) return;
    const fx: ViewFx = {
      tracers: this.tracers,
      bob: this.bob,
      reduceMotion: this.opts.settings.reduceMotion,
      showNames: mode.showNames,
      storm: mode.storm?.current ?? null,
      ads: this.ads,
      markers: mode.markers?.().filter((m) => m.kind === "flag" || m.kind === "mg"),
      tagColor: mode.tagColor ? (id) => mode.tagColor!(id) : undefined,
      effects: mode.effects?.(),
      shake: this.opts.settings.reduceMotion ? 0 : this.shake,
    };
    this.view.render(mode.world, mode.me, fx);
    const prompt = this.promptFor();
    this.hud?.update(
      {
        mode,
        world: mode.world,
        me: mode.me,
        killFeed: this.killFeed,
        pings: this.pings,
        hitMarkerAt: this.hitMarkerAt,
        prompt: prompt.text,
        promptColor: prompt.color,
        ads: this.ads,
        showBoard: this.keys.has("Tab") || this.ended,
        ended: this.ended,
      },
      1 / 60,
    );
  }
}

let onlineBuilder: OnlineMenuBuilder | undefined;
let matchEndHook: MatchEndHook | undefined;
let matchesPlayedLoader: MatchesPlayedLoader | undefined;
/** Called by the online module (same chunk) to add the "Online match" menu section. */
export function registerOnlineMenu(builder: OnlineMenuBuilder) {
  onlineBuilder = builder;
}
/** Called by the season module to receive match stats and report progress for Cash Cups. */
export function registerMatchEnd(hook: MatchEndHook, loader?: MatchesPlayedLoader) {
  matchEndHook = hook;
  matchesPlayedLoader = loader;
}

const factory: GameFactory = () => new NeonSiege(onlineBuilder, matchEndHook, matchesPlayedLoader);
export default factory;
