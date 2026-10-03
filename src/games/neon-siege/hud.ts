import { CONSUMABLES, RARITY, SLOTS, weaponDef, type Item } from "./items";
import { GROUND, SOLID, type GameMap } from "./map";
import type { Banner, Marker, ModeController, ScoreRow } from "./mode";
import type { StormState } from "./storm";
import { MAX_SHIELD, activeWeapon, type Entity, type World } from "./world";

/**
 * The Neon Siege HUD, in DOM so it stays crisp at any resolution, works with
 * both renderers, and is readable by assistive tech. Updated every frame but
 * only touches the DOM when something changed.
 */

export interface KillFeedItem {
  text: string;
  at: number;
  mine: boolean;
}

export interface HudFrame {
  mode: ModeController;
  world: World;
  me: Entity;
  killFeed: KillFeedItem[];
  pings: { x: number; y: number; at: number }[];
  hitMarkerAt: number;
  /** Nearby interactable, e.g. "Open chest" / "Pick up Rare Assault Rifle". */
  prompt: string | null;
  promptColor: string | null;
  ads: number;
  showBoard: boolean;
  ended: boolean;
}

const ICONS: Record<string, string> = {
  pistol: "M8 7h28v6H23l-2 9h-7l2-9H8z",
  smg: "M4 7h40v6H31l-2 9h-6l1-9h-5l-1 7h-5l1-7H4z",
  ar: "M2 8h52v5H39l-3 9h-6l2-9h-9l-2 6h-5l1-6H11l-5 5H2z",
  shotgun: "M2 9h58v4H29l-3 3H15l-9 5H2z",
  sniper: "M2 10h60v3H35l-3 2H19l-11 6H2zM25 4h16v4H25z",
  dmr: "M2 9h54v4H36l-2 6h-6l1-6H19l-10 6H2zM24 4h12v4H24z",
  lmg: "M2 7h58v6H40l-2 3h-8v5h-10v-5h-3l-2 6h-6l1-6H8l-4 4H2z",
  medkit: "M18 4h28v18H18zM29 8h6v4h4v4h-4v4h-6v-4h-4v-4h4z",
  shield: "M28 2h8v4h3l4 5v11H21V11l4-5h3z",
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", style = "") {
  const node = document.createElement(tag);
  node.className = className;
  if (style) node.style.cssText = style;
  return node;
}

function icon(kind: string, color: string) {
  return `<svg viewBox="0 0 64 24" width="100%" height="100%" aria-hidden="true"><path d="${ICONS[kind]}" fill="${color}" fill-rule="evenodd"/></svg>`;
}

/** Top-down minimap base image: grass, roads, floors, buildings, trees. */
export function paintMapImage(map: GameMap, scale = 2) {
  const c = document.createElement("canvas");
  c.width = map.width * scale;
  c.height = map.height * scale;
  const g = c.getContext("2d")!;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      const cell = map.cells[i];
      const gr = map.ground[i];
      const soil = map.front?.soil;
      let color =
        gr === GROUND.road
          ? "#5d6166"
          : gr === GROUND.floor
            ? "#9c8b73"
            : gr === GROUND.trench
              ? "#2e271f"
              : gr === GROUND.duck
                ? "#7a6446"
                : gr === GROUND.dirt || gr === GROUND.sand || gr === GROUND.snow
                  ? (soil ?? "#8a7552")
                  : (map.front?.soil2 ?? "#5f7d3f");
      if (cell === SOLID.brick) color = "#8f4a36";
      else if (cell === SOLID.concrete) color = "#a3a39d";
      else if (cell === SOLID.perimeter) color = "#3b3d3a";
      else if (cell === SOLID.tree) color = "#2f4f24";
      else if (cell === SOLID.rock) color = "#7d7a72";
      else if (cell === SOLID.crate) color = "#8a6a3e";
      else if (cell === SOLID.fence) color = "#6b5640";
      else if (cell === SOLID.sandbag) color = "#9a8a62";
      else if (cell === SOLID.water) color = "#4f6068";
      else if (cell === SOLID.wire) color = "#4a4540";
      else if (cell === SOLID.shrub) color = "#6b7442";
      g.fillStyle = color;
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  return c;
}

export class SiegeHud {
  readonly root: HTMLDivElement;
  private status = el("div", "rounded-md bg-black/45 px-2.5 py-1 text-right font-display text-[11px] font-bold tracking-wider sm:text-xs");
  private stormLine = el("div", "mt-1 rounded bg-black/45 px-2 py-0.5 text-[10px] font-semibold sm:text-[11px]");
  private detailLine = el("div", "mt-1 whitespace-pre-line rounded bg-black/45 px-2 py-0.5 text-[10px] font-semibold sm:text-[11px]");
  private dot = el("div", "absolute top-1/2 left-1/2 hidden h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80", "box-shadow:0 0 2px rgba(0,0,0,.9)");
  private feed = el("div", "mt-1.5 flex flex-col items-end gap-0.5 text-[10px] font-semibold sm:text-[11px]");
  private mini = el("canvas", "block rounded-md border border-white/25 bg-black/40");
  private miniCtx: CanvasRenderingContext2D;
  private mapImage: HTMLCanvasElement | null = null;
  private mapFor: GameMap | null = null;
  private mapDug = 0;
  private bars = el("div", "flex w-[min(19rem,62vw)] flex-col gap-1");
  private shieldFill = el("div", "h-full bg-[#3c9bff] transition-[width] duration-150");
  private hpFill = el("div", "h-full bg-[#4fd26b] transition-[width] duration-150");
  private shieldText = el("span", "absolute inset-0 grid place-items-center text-[10px] font-bold");
  private hpText = el("span", "absolute inset-0 grid place-items-center text-[10px] font-bold");
  private slots: HTMLButtonElement[] = [];
  private slotKeys: string[] = [];
  private ammo = el("div", "min-h-5 font-display text-sm font-bold tabular-nums sm:text-base");
  private promptBox = el(
    "button",
    "pointer-events-auto hidden rounded-md border border-white/25 bg-black/60 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm",
  );
  private progress = el("div", "absolute top-[58%] left-1/2 hidden w-28 -translate-x-1/2 text-center text-[10px] font-semibold");
  private progressFill = el("div", "h-full bg-white/90");
  private progressLabel = el("div", "mb-0.5");
  private cross = el("div", "absolute top-1/2 left-1/2 h-0 w-0");
  private crossBars: HTMLDivElement[] = [];
  private hitMarker = el("div", "absolute top-1/2 left-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 opacity-0");
  private scope = el("div", "absolute inset-0 hidden");
  private bannerBox = el("div", "absolute top-[24%] left-1/2 w-[90%] -translate-x-1/2 text-center");
  private bannerText = el("p", "font-display text-2xl font-black tracking-wider sm:text-4xl");
  private bannerSub = el("p", "mt-1 text-xs font-semibold text-white/80 sm:text-sm");
  private board = el("div", "absolute top-[14%] left-1/2 hidden w-72 -translate-x-1/2 rounded-lg bg-black/80 p-3 text-xs");
  private hurt = el("div", "absolute inset-0 opacity-0");
  private stormTint = el("div", "absolute inset-0 opacity-0 transition-opacity duration-500");
  private gasTint = el("div", "absolute inset-0 opacity-0 transition-opacity duration-700");
  private maskView = el("div", "absolute inset-0 opacity-0");
  private maskGlass = el("div", "absolute inset-0 opacity-0");
  private last = new Map<string, string>();
  private miniAcc = 0;

  constructor(
    host: HTMLElement,
    private opts: { coarse: boolean; onSlot: (i: number) => void; onInteract: () => void },
  ) {
    this.root = el(
      "div",
      "pointer-events-none absolute inset-0 select-none overflow-hidden text-white",
      "text-shadow:0 1px 2px rgba(0,0,0,.8);padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)",
    );
    this.root.setAttribute("aria-hidden", "true");
    this.miniCtx = this.mini.getContext("2d")!;
    this.mini.width = 144;
    this.mini.height = 144;
    this.mini.style.cssText = "width:min(22vmin,8.5rem);height:min(22vmin,8.5rem)";

    this.hurt.style.background = "radial-gradient(ellipse at center, rgba(180,0,0,0) 45%, rgba(170,0,0,.55) 100%)";
    this.stormTint.style.background = "radial-gradient(ellipse at center, rgba(120,60,200,.25) 20%, rgba(90,30,170,.6) 100%)";

    // Crosshair: four ticks that spread with weapon inaccuracy.
    for (let i = 0; i < 4; i++) {
      const b = el("div", "absolute bg-white", "box-shadow:0 0 2px rgba(0,0,0,.9)");
      this.crossBars.push(b);
      this.cross.appendChild(b);
    }
    this.hitMarker.innerHTML =
      '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M3 3l6 6M21 3l-6 6M3 21l6-6M21 21l-6-6" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>';
    this.scope.style.background =
      "radial-gradient(circle at center, transparent 0, transparent min(34vh,34vw), rgba(0,0,0,.94) calc(min(34vh,34vw) + 2px))";
    this.scope.innerHTML =
      '<div style="position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(0,0,0,.85)"></div><div style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:rgba(0,0,0,.85)"></div>';

    const top = el("div", "absolute top-2 right-2 left-2 flex items-start justify-between gap-2");
    const topLeft = el("div", "flex flex-col items-start");
    this.detailLine.hidden = true;
    topLeft.append(this.mini, this.stormLine, this.detailLine);
    const topRight = el("div", "flex max-w-[45%] flex-col items-end");
    topRight.append(this.status, this.feed);
    top.append(topLeft, topRight);

    const barRow = (fill: HTMLDivElement, text: HTMLSpanElement) => {
      const bar = el("div", "relative h-3.5 overflow-hidden rounded-sm border border-black/40 bg-black/50 sm:h-4");
      bar.append(fill, text);
      return bar;
    };
    this.bars.append(barRow(this.shieldFill, this.shieldText), barRow(this.hpFill, this.hpText));

    const hotbar = el("div", "flex gap-1");
    for (let i = 0; i < SLOTS; i++) {
      const b = el(
        "button",
        "pointer-events-auto relative grid h-11 w-12 place-items-center rounded-md border-2 border-white/20 bg-black/45 p-1 sm:h-12 sm:w-14",
      );
      b.type = "button";
      b.tabIndex = -1;
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.opts.onSlot(i);
      });
      this.slots.push(b);
      this.slotKeys.push("");
      hotbar.appendChild(b);
    }
    this.promptBox.type = "button";
    this.promptBox.tabIndex = -1;
    this.promptBox.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.opts.onInteract();
    });
    const bottom = el("div", "absolute bottom-2 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5");
    bottom.append(this.promptBox, this.ammo, this.bars, hotbar);

    const track = el("div", "h-1 overflow-hidden rounded bg-black/50");
    track.appendChild(this.progressFill);
    this.progress.append(this.progressLabel, track);
    this.bannerBox.append(this.bannerText, this.bannerSub);

    // Trenches: the view through a gas mask's eyepieces, and the green of gas.
    this.gasTint.style.background = "radial-gradient(ellipse at center, rgba(170,180,90,.18) 10%, rgba(140,150,60,.55) 100%)";
    // The facepiece: dark rubber with two round eyepieces cut out (even-odd), soft-edged.
    this.maskView.innerHTML =
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true">' +
      '<defs><filter id="zx-mask-blur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.6"/></filter></defs>' +
      '<path fill="#0b0d0a" fill-rule="evenodd" filter="url(#zx-mask-blur)" d="M-10 -10H110V110H-10Z M18 47a16 27 0 1 0 32 0a16 27 0 1 0 -32 0Z M50 47a16 27 0 1 0 32 0a16 27 0 1 0 -32 0Z"/>' +
      '<g fill="none" stroke="#2b2f27" stroke-width="2.2"><ellipse cx="34" cy="47" rx="16" ry="27"/><ellipse cx="66" cy="47" rx="16" ry="27"/></g>' +
      "</svg>";
    this.maskGlass.style.background =
      "radial-gradient(ellipse 16% 27% at 34% 47%, rgba(120,140,120,.04) 55%, rgba(200,220,200,.2) 100%), radial-gradient(ellipse 16% 27% at 66% 47%, rgba(120,140,120,.04) 55%, rgba(200,220,200,.2) 100%)";
    this.root.append(this.stormTint, this.gasTint, this.maskGlass, this.maskView, this.hurt, this.scope, this.cross, this.dot, this.hitMarker, this.progress, top, bottom, this.bannerBox, this.board);
    host.appendChild(this.root);
  }

  destroy() {
    this.root.remove();
  }

  private set(key: string, value: string, apply: () => void) {
    if (this.last.get(key) === value) return;
    this.last.set(key, value);
    apply();
  }

  update(f: HudFrame, dt: number) {
    const { world, me, mode } = f;
    const t = world.time;

    // Status + storm
    const st = mode.status();
    const statusText = `${st.primary}  ·  ${st.kills} ${st.kills === 1 ? "KILL" : "KILLS"}`;
    this.set("status", statusText, () => (this.status.textContent = statusText));
    const storm = st.storm ?? "";
    this.set("storm", storm + st.stormUrgent, () => {
      this.stormLine.textContent = storm;
      this.stormLine.hidden = !storm;
      this.stormLine.style.color = st.stormUrgent ? "#d7b4ff" : "#ffffff";
    });
    const detail = st.detail ?? "";
    this.set("detail", detail, () => {
      this.detailLine.textContent = detail;
      this.detailLine.hidden = !detail;
    });

    // Kill feed
    const feed = f.killFeed.filter((k) => t - k.at < 6).slice(-4);
    const feedKey = feed.map((k) => k.text + k.at).join("|");
    this.set("feed", feedKey, () => {
      this.feed.replaceChildren(
        ...feed.map((k) => {
          const row = el("div", `rounded bg-black/45 px-1.5 py-0.5 ${k.mine ? "text-[#ffb321]" : "text-white/90"}`);
          row.textContent = k.text;
          return row;
        }),
      );
    });

    // Health / shield
    const hp = Math.ceil(me.hp);
    const sh = Math.ceil(me.shield);
    this.set("hp", `${hp}`, () => {
      this.hpFill.style.width = `${(100 * me.hp) / me.maxHp}%`;
      this.hpFill.style.background = me.hp > 30 ? "#4fd26b" : "#e5484d";
      this.hpText.textContent = `${hp}`;
    });
    this.set("sh", `${sh}`, () => {
      this.shieldFill.style.width = `${(100 * me.shield) / MAX_SHIELD}%`;
      this.shieldText.textContent = `${sh}`;
    });

    // Hotbar
    for (let i = 0; i < SLOTS; i++) {
      const it = me.inventory[i];
      const key = `${slotKey(it)}|${i === me.active}`;
      if (this.slotKeys[i] === key) continue;
      this.slotKeys[i] = key;
      const b = this.slots[i];
      const active = i === me.active;
      b.style.borderColor = active ? "#ffffff" : "rgba(255,255,255,.2)";
      b.style.transform = active ? "translateY(-4px)" : "";
      if (!it) {
        b.innerHTML = `<span class="text-[10px] text-white/40">${i + 1}</span>`;
        b.style.background = "rgba(0,0,0,.45)";
        b.setAttribute("aria-label", `Slot ${i + 1}: empty`);
        continue;
      }
      const color = it.type === "weapon" ? RARITY[it.rarity].color : it.kind === "medkit" ? "#e9edf2" : "#3c9bff";
      b.style.background = `linear-gradient(180deg, ${color}55, ${color}22)`;
      const count = it.type === "consumable" ? `<span class="absolute right-1 bottom-0 text-[10px] font-bold">${it.count}</span>` : "";
      b.innerHTML = `${icon(it.kind, "#f4f6f8")}${count}`;
      b.setAttribute("aria-label", `Slot ${i + 1}: ${it.type === "weapon" ? weaponDef(it).name : CONSUMABLES[it.kind].name}`);
    }

    // Ammo / reload / use progress
    const w = activeWeapon(me);
    const reloading = me.reloadUntil > t;
    const ammoText = !me.alive ? "" : w ? (reloading ? "RELOADING" : `${w.ammo} / ${weaponDef(w).mag}`) : "";
    this.set("ammo", ammoText, () => {
      this.ammo.textContent = ammoText;
      this.ammo.style.color = w && w.ammo === 0 ? "#ffb321" : "#ffffff";
    });
    const busy = reloading ? "Reloading" : me.using ? (me.inventory[me.using.slot]?.kind === "medkit" ? "Med Kit" : "Shield Potion") : "";
    if (busy) {
      const total = reloading && w ? (weaponDef(w).reload * RARITY[w.rarity].reload) : me.using ? CONSUMABLES[me.inventory[me.using.slot]?.kind === "medkit" ? "medkit" : "shield"].useTime : 1;
      const left = reloading ? me.reloadUntil - t : me.using!.until - t;
      this.progress.classList.remove("hidden");
      this.progressLabel.textContent = busy;
      this.progressFill.style.width = `${Math.min(100, (1 - left / total) * 100)}%`;
    } else {
      const task = me.alive ? mode.task?.() : null;
      if (task) {
        this.progress.classList.remove("hidden");
        this.progressLabel.textContent = task.label;
        this.progressFill.style.width = `${Math.min(100, task.k * 100)}%`;
      } else this.progress.classList.add("hidden");
    }

    // Interact prompt
    const promptText = f.prompt && me.alive ? (this.opts.coarse ? f.prompt : `[E]  ${f.prompt}`) : "";
    this.set("prompt", promptText + f.promptColor, () => {
      this.promptBox.textContent = promptText;
      this.promptBox.classList.toggle("hidden", !promptText);
      this.promptBox.style.borderColor = f.promptColor ?? "rgba(255,255,255,.25)";
    });

    // Crosshair (spread) / scope
    const scoped = !!w && w.kind === "sniper" && f.ads > 0.85 && me.alive;
    this.scope.classList.toggle("hidden", !scoped);
    const def = w ? weaponDef(w) : null;
    const spread = def ? def.spread + (def.adsSpread - def.spread) * f.ads : 0.03;
    const recoil = Math.max(0, 1 - (t - me.firedAt) / 0.15);
    const gap = Math.round(4 + spread * 180 + recoil * 5);
    // Realism modes: no spread crosshair, just a small dot (aim down sights to shoot straight).
    const dotOnly = !!mode.realism;
    const crossKey = `${gap}|${scoped || !me.alive || !w}|${dotOnly}`;
    this.set("cross", crossKey, () => {
      this.dot.classList.toggle("hidden", !dotOnly || scoped || !me.alive || f.ads > 0.5);
      this.cross.style.display = dotOnly || scoped || !me.alive || !w ? "none" : "";
      const len = 7;
      const [u, r, d, l] = this.crossBars;
      u.style.cssText += `;width:2px;height:${len}px;left:-1px;top:${-gap - len}px`;
      d.style.cssText += `;width:2px;height:${len}px;left:-1px;top:${gap}px`;
      l.style.cssText += `;height:2px;width:${len}px;top:-1px;left:${-gap - len}px`;
      r.style.cssText += `;height:2px;width:${len}px;top:-1px;left:${gap}px`;
    });
    const hm = Math.max(0, 1 - (t - f.hitMarkerAt) / 0.25);
    this.hitMarker.style.opacity = hm.toFixed(2);

    // Damage + storm vignettes
    const hurtK = Math.max(0, 1 - (t - me.hurtAt) / 0.6);
    this.hurt.style.opacity = (me.alive ? hurtK * (me.lastAttacker === "storm" ? 0.4 : 1) : 0.6).toFixed(2);
    const inStorm = !!mode.storm && Math.hypot(me.x - mode.storm.current.x, me.y - mode.storm.current.y) > mode.storm.current.r;
    this.stormTint.style.opacity = inStorm && me.alive ? "1" : "0";
    const scr = me.alive ? mode.screen?.() : null;
    const mk = scr?.mask ?? 0;
    this.maskView.style.opacity = String(mk);
    this.maskGlass.style.opacity = String(mk);
    this.gasTint.style.opacity = String(Math.min(0.9, (scr?.gas ?? 0) * (mk >= 1 ? 0.35 : 0.9)));

    // Banner
    const banner: Banner | null = f.ended && !mode.isOver() ? { text: "ELIMINATED", color: "#ff4d6d" } : mode.banner();
    const bKey = banner ? banner.text + (banner.sub ?? "") : "";
    this.set("banner", bKey, () => {
      this.bannerBox.hidden = !banner;
      this.bannerText.textContent = banner?.text ?? "";
      this.bannerText.style.color = banner?.color ?? "#ffffff";
      this.bannerSub.textContent = banner?.sub ?? "";
    });

    // Scoreboard
    const rows = mode.scoreboard(f.showBoard);
    this.renderBoard(rows);

    // Minimap (~15 Hz)
    this.miniAcc += dt;
    if (this.miniAcc >= 1 / 15) {
      this.miniAcc = 0;
      this.drawMinimap(world, me, mode.storm, f.pings, mode.markers?.() ?? []);
    }
  }

  private renderBoard(rows: ScoreRow[] | null) {
    const key = rows ? rows.map((r) => `${r.name}${r.kills}${r.deaths}`).join("|") : "";
    this.set("board", key, () => {
      this.board.classList.toggle("hidden", !rows);
      if (!rows) return;
      const head = el("div", "mb-1.5 flex justify-between font-display text-[10px] tracking-wider text-white/60");
      head.innerHTML = "<span>PLAYER</span><span>K / D</span>";
      this.board.replaceChildren(
        head,
        ...rows.map((r) => {
          const row = el("div", `flex justify-between py-0.5 ${r.me ? "text-[#ffb321]" : ""}`);
          const n = el("span");
          n.textContent = r.name;
          const s = el("span", "tabular-nums");
          s.textContent = `${r.kills} / ${r.deaths}`;
          row.append(n, s);
          return row;
        }),
      );
    });
  }

  private drawMinimap(
    world: World,
    me: Entity,
    storm: StormState | null,
    pings: { x: number; y: number; at: number }[],
    markers: Marker[] = [],
  ) {
    const g = this.miniCtx;
    const map = world.map;
    // Non-square maps (battlefields) keep their aspect ratio.
    const aspect = map.height / map.width;
    if (this.mini.height !== Math.round(144 * aspect)) {
      this.mini.height = Math.round(144 * aspect);
      this.mini.style.height = `calc(min(22vmin,8.5rem) * ${aspect})`;
    }
    if (this.mapFor !== map || (map.dug?.length ?? 0) !== this.mapDug) {
      this.mapImage = paintMapImage(map, 2);
      this.mapFor = map;
      this.mapDug = map.dug?.length ?? 0;
    }
    const s = 144 / map.width;
    const mh = map.height * s;
    g.clearRect(0, 0, 144, mh);
    g.drawImage(this.mapImage!, 0, 0, 144, mh);
    for (const m of markers) {
      if (m.kind === "crate") {
        g.fillStyle = m.color;
        g.strokeStyle = "rgba(0,0,0,.8)";
        g.lineWidth = 1;
        g.fillRect(m.x * s - 2.5, m.y * s - 2.5, 5, 5);
        g.strokeRect(m.x * s - 2.5, m.y * s - 2.5, 5, 5);
        continue;
      }
      if (m.kind === "enemy") {
        g.fillStyle = m.color;
        g.strokeStyle = "rgba(0,0,0,.85)";
        g.lineWidth = 1;
        g.beginPath();
        g.arc(m.x * s, m.y * s, 2.4, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        continue;
      }
      if (m.kind === "mg") {
        g.fillStyle = m.color;
        g.strokeStyle = "rgba(0,0,0,.85)";
        g.lineWidth = 1;
        g.save();
        g.translate(m.x * s, m.y * s);
        g.rotate(m.a ?? 0);
        g.fillRect(-1.5, -1.5, 6, 3);
        g.strokeRect(-1.5, -1.5, 6, 3);
        g.restore();
        continue;
      }
      if (m.kind === "wounded") {
        g.fillStyle = "#ff3b30";
        g.fillRect(m.x * s - 3, m.y * s - 1, 6, 2);
        g.fillRect(m.x * s - 1, m.y * s - 3, 2, 6);
        continue;
      }
      if (m.kind === "ally") {
        g.fillStyle = m.color;
        g.beginPath();
        g.arc(m.x * s, m.y * s, 2.2, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      if (m.r) {
        g.strokeStyle = m.color;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(m.x * s, m.y * s, m.r * s, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = m.color;
      g.font = "bold 10px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.strokeStyle = "rgba(0,0,0,.8)";
      g.lineWidth = 3;
      if (m.label) {
        g.strokeText(m.label, m.x * s, m.y * s);
        g.fillText(m.label, m.x * s, m.y * s);
      }
    }
    // Opened chests stay; unopened ones glint.
    g.fillStyle = "#f2c230";
    for (const c of world.chests) if (!c.opened) g.fillRect(c.x * s - 1.5, c.y * s - 1.5, 3, 3);
    if (storm) {
      g.save();
      g.beginPath();
      g.rect(0, 0, 144, mh);
      g.arc(storm.current.x * s, storm.current.y * s, storm.current.r * s, 0, Math.PI * 2, true);
      g.fillStyle = "rgba(110,50,200,.45)";
      g.fill("evenodd");
      g.restore();
      g.strokeStyle = "rgba(255,255,255,.9)";
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(storm.to.x * s, storm.to.y * s, storm.to.r * s, 0, Math.PI * 2);
      g.stroke();
    }
    for (const p of pings) {
      const k = 1 - (world.time - p.at) / 1.2;
      if (k <= 0) continue;
      g.fillStyle = `rgba(255,70,70,${k})`;
      g.beginPath();
      g.arc(p.x * s, p.y * s, 2.5, 0, Math.PI * 2);
      g.fill();
    }
    // Player arrow
    g.save();
    g.translate(me.x * s, me.y * s);
    g.rotate(me.angle);
    g.fillStyle = "#ffffff";
    g.strokeStyle = "#000000";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(6, 0);
    g.lineTo(-4, -4);
    g.lineTo(-2, 0);
    g.lineTo(-4, 4);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}

function slotKey(it: Item | null) {
  if (!it) return "-";
  return it.type === "weapon" ? `${it.kind}.${it.rarity}` : `${it.kind}.${it.count}`;
}
