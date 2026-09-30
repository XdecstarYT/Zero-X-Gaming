import { HALF_ROAD, locationOf, nearestNode, route, nodePos, SIZE, SPEED_LIMIT, type City } from "./city";
import { fullName } from "./people";
import type { Call, Code3Sim, Option, OptionGroup } from "./sim";
import { speedOf } from "./vehicles";

/**
 * The Code 3 heads-up display (DOM over the 3D view): minimap with GPS route,
 * a compass and location bar, the active-call card, dispatch radio, the
 * callout offer, a speedometer dial (or health / stamina on foot), the action
 * panel grouped by kind (commands, talk, checks, enforcement, custody, scene,
 * unit) with icons, a score feed, the tabbed MDT (Tab) and a screen-reader mirror.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", ...children: (Node | string)[]) {
  const n = document.createElement(tag);
  n.className = className;
  n.append(...children);
  return n;
}

function svg(markup: string, cls = "h-3.5 w-3.5") {
  const s = document.createElement("span");
  s.className = `inline-grid shrink-0 place-items-center ${cls}`;
  s.innerHTML = markup;
  return s;
}

const MPH = 2.23694;
const MAP_PX = 1.6;

const GROUPS: Record<OptionGroup, { label: string; color: string; icon: string }> = {
  command: { label: "Commands", color: "#fb923c", icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 12V5a1.5 1.5 0 013 0v6-8a1.5 1.5 0 013 0v8-6a1.5 1.5 0 013 0v7-4a1.5 1.5 0 013 0v7c0 4-3 7-7 7h-1c-3 0-4.5-1.5-6-4l-2.5-4a1.5 1.5 0 012.5-1.6L8 15z"/></svg>' },
  talk: { label: "Talk", color: "#60a5fa", icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a2 2 0 012 2v9a2 2 0 01-2 2H9l-5 4v-4a2 2 0 01-2-2V6a2 2 0 012-2z"/></svg>' },
  check: { label: "Checks", color: "#a78bfa", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/></svg>' },
  enforce: { label: "Enforce", color: "#facc15", icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h9l5 5v15H6z" opacity=".35"/><path d="M8 9h8v2H8zm0 4h8v2H8zm0 4h5v2H8z"/></svg>' },
  custody: { label: "Custody", color: "#f87171", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="7" cy="14" r="4.5"/><circle cx="17" cy="14" r="4.5"/><path d="M11 9.5l2 0"/></svg>' },
  scene: { label: "Scene", color: "#fdba74", icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 3h4l5 16H5z"/><path d="M3 19h18v2H3z"/></svg>' },
  unit: { label: "Unit", color: "#34d399", icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 11l2-5h10l2 5h1a1 1 0 011 1v5h-2a2 2 0 01-4 0H9a2 2 0 01-4 0H3v-5a1 1 0 011-1zm3-3l-1 3h10l-1-3z"/><rect x="9" y="3" width="6" height="2" rx="1"/></svg>' },
};

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function paintMap(city: City) {
  const c = document.createElement("canvas");
  const S = Math.ceil(SIZE * MAP_PX);
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1b2430";
  g.fillRect(0, 0, S, S);
  const colors: Record<string, string> = {
    downtown: "#2c3644",
    midtown: "#28323e",
    suburbs: "#22362a",
    park: "#1f4127",
    industrial: "#2e2f33",
    station: "#1e2c4a",
  };
  for (const b of city.blocks) {
    g.fillStyle = colors[b.district];
    g.fillRect(b.x0 * MAP_PX, b.z0 * MAP_PX, (b.x1 - b.x0) * MAP_PX, (b.z1 - b.z0) * MAP_PX);
  }
  g.fillStyle = "#3d4b5c";
  for (const b of city.buildings) g.fillRect((b.x - b.hw) * MAP_PX, (b.z - b.hd) * MAP_PX, b.hw * 2 * MAP_PX, b.hd * 2 * MAP_PX);
  g.fillStyle = "#8390a0";
  for (const L of city.lines) {
    g.fillRect((L - HALF_ROAD) * MAP_PX, 0, HALF_ROAD * 2 * MAP_PX, S);
    g.fillRect(0, (L - HALF_ROAD) * MAP_PX, S, HALF_ROAD * 2 * MAP_PX);
  }
  return c;
}

/** What to do next on a call, in a line. */
function callHint(sim: Code3Sim, call: Call) {
  if (call.state === "enroute") return call.code === 3 ? "Lights and siren: respond Code 3" : "Respond: lights only, obey the lights";
  switch (call.kind) {
    case "collision":
      return "Check the drivers, cite or arrest, then call a tow";
    case "abandoned":
      return call.plateRun ? "Tag it and call a tow truck" : "Walk up and run the plate";
    case "fugitive":
      return "Find the subject from the description; ID and run them";
    case "noise":
      return "Talk to the resident: warn or cite";
    case "assist":
      return "Help 2-Adam-7: control and arrest the subjects";
    case "vandalism":
      return "Detain the tagger";
    case "roadrage":
      return "Separate the drivers; arrest the aggressor";
    case "domestic":
      return "Take statements; arrest the aggressor";
    case "stolen":
    case "dui":
    case "hitrun":
      return "Find the vehicle and pull it over";
    case "pursuit":
    case "race":
      return "Stop the vehicle: PIT, spikes, roadblock";
    default:
      return sim.peds.some((p) => call.suspects.includes(p.id) && p.state === "flee") ? "Suspect running: chase and tackle" : "Deal with the suspects";
  }
}

export class Code3Hud {
  readonly root: HTMLDivElement;
  private map: HTMLCanvasElement;
  private mapImg: HTMLCanvasElement;
  private clock = el("div", "font-display text-lg font-black tabular-nums leading-none");
  private score = el("div", "text-xs font-bold");
  private status = el("div", "text-[11px] text-white/80");
  private paperwork = el("div", "hidden rounded bg-[#1d4ed8]/70 px-1.5 text-[10px] font-bold uppercase tracking-wider");
  private radio = el("div", "flex flex-col gap-0.5");
  private offer = el("div", "pointer-events-auto hidden w-[min(92vw,26rem)] rounded-lg border-2 border-[#ffd21f] bg-black/80 p-3 text-left shadow-xl");
  // Compass and location.
  private compassStrip = el("div", "absolute top-0 left-0 h-full");
  private compassMark = el("div", "absolute top-0 hidden h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent border-t-[#ffd21f]");
  private place = el("div", "text-[11px] font-bold leading-tight");
  private district = el("div", "text-[9px] font-bold uppercase tracking-[0.2em] text-white/60");
  // Speedometer / on-foot panel.
  private dial = el("div", "relative");
  private needle!: SVGLineElement;
  private speed = el("div", "font-display text-2xl font-black tabular-nums leading-none");
  private lampR = el("span", "h-2.5 w-2.5 rounded-full bg-[#ff4757]/25");
  private lampB = el("span", "h-2.5 w-2.5 rounded-full bg-[#4d7cff]/25");
  private lights = el("div", "text-[9px] font-bold uppercase tracking-wider text-white/60");
  private radar = el("div", "text-[10px] font-bold tabular-nums");
  private carPanel = el("div", "flex flex-col items-center");
  private footPanel = el("div", "hidden flex-col items-end gap-1");
  private health = el("div", "h-1.5 w-28 overflow-hidden rounded bg-white/15");
  private healthBar = el("div", "h-full bg-[#4ade80]");
  private stamina = el("div", "h-1 w-28 overflow-hidden rounded bg-white/15");
  private staminaBar = el("div", "h-full bg-[#93c5fd]");
  private weapon = el("div", "text-[11px] font-bold uppercase tracking-wider");
  // Call card.
  private callCard = el("div", "hidden w-[min(44vw,15rem)] rounded-lg border-l-4 bg-black/60 px-2 py-1.5");
  private prompt = el("div", "rounded bg-black/65 px-3 py-1 text-sm font-semibold");
  private speech = el("div", "hidden max-w-[min(92vw,30rem)] rounded-lg bg-white/95 px-3 py-2 text-sm text-[#111] shadow-lg");
  private menu = el("div", "pointer-events-auto flex max-h-[52vh] w-[min(92vw,22rem)] flex-col gap-1 overflow-auto");
  private mdt = el("div", "pointer-events-auto absolute inset-0 z-20 hidden flex-col overflow-hidden border-[#3b82f6] bg-[#0b1220]/95 font-mono text-[12px] text-[#cfe3ff] sm:inset-x-[10%] sm:inset-y-3 sm:rounded-xl sm:border-2");
  private mdtTabs = el("div", "flex shrink-0 gap-1 overflow-x-auto border-b border-[#1e3a8a] px-3 pt-2");
  private mdtBody = el("div", "min-h-0 flex-1 overflow-auto p-3");
  private mdtTab: "call" | "person" | "queries" | "reports" | "shift" = "call";
  private pursuit = el("div", "hidden rounded bg-[#7f1d1d]/80 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider");
  private feedBox = el("div", "pointer-events-none flex flex-col items-end gap-1");
  /** Minimap scale (screen px per metre); tap the map or press M to zoom. */
  private zoom = 1.25;
  private crosshair = el("div", "pointer-events-none absolute top-1/2 left-1/2 hidden h-5 w-5 -translate-x-1/2 -translate-y-1/2");
  private hurt = el("div", "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300");
  private toast = el("div", "pointer-events-none absolute top-[24%] left-1/2 -translate-x-1/2 text-center font-display text-2xl font-black uppercase tracking-wider opacity-0 transition-opacity duration-300 [text-shadow:0_2px_8px_#000]");
  readonly sr = el("div", "sr-only");
  private menuSig = "";
  private radioSig = "";
  private mdtSig = "";
  private callSig = "";
  private toastUntil = 0;
  onChoose: (i: number) => void = () => {};
  onChooseId: (id: string) => void = () => {};
  onAccept: (yes: boolean) => void = () => {};

  constructor(
    host: HTMLElement,
    private sim: Code3Sim,
    private coarse: boolean,
  ) {
    this.root = el("div", "pointer-events-none absolute z-[4] select-none text-white [text-shadow:0_1px_2px_rgba(0,0,0,.9)] [-webkit-touch-callout:none]");
    // Keep clear of notches and home bars.
    this.root.style.inset = "env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
    this.mapImg = paintMap(sim.city);
    this.map = el("canvas", "block rounded-full border-2 border-white/30 bg-black/40 shadow-lg");
    this.map.width = this.map.height = 180;
    this.map.style.width = this.map.style.height = coarse ? "min(26vmin, 8rem)" : "min(32vmin, 10.5rem)";
    this.map.classList.add("pointer-events-auto", "cursor-pointer");
    this.map.title = "Zoom the map";
    this.map.addEventListener("click", () => this.cycleZoom());
    this.health.append(this.healthBar);
    this.stamina.append(this.staminaBar);
    this.crosshair.innerHTML =
      '<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="2" fill="white"/><path d="M10 0v6M10 14v6M0 10h6M14 10h6" stroke="white" stroke-width="1.5"/></svg>';
    this.hurt.style.background = "radial-gradient(circle, transparent 50%, rgba(200,0,0,.55))";
    this.sr.dataset.testid = "code3-hud";
    this.sr.setAttribute("role", "status");
    this.sr.setAttribute("aria-live", "off");

    // Compass: ticks every 15°, cardinal letters every 45°, a waypoint marker.
    const PX = 1.4;
    for (let d = -360; d <= 720; d += 15) {
      const major = d % 45 === 0;
      const x = d * PX;
      const tick = el("div", `absolute bottom-0 w-px ${major ? "h-2.5 bg-white/80" : "h-1.5 bg-white/40"}`);
      tick.style.left = `${x}px`;
      this.compassStrip.append(tick);
      if (major) {
        const lab = COMPASS[(((d / 45) % 8) + 8) % 8];
        const t = el("div", `absolute top-0 -translate-x-1/2 text-[10px] font-black ${lab === "N" ? "text-[#ff6b6b]" : "text-white"}`, lab);
        t.style.left = `${x}px`;
        this.compassStrip.append(t);
      }
    }
    this.compassStrip.dataset.px = String(PX);
    const compass = el(
      "div",
      "relative h-6 w-[min(56vw,15rem)] overflow-hidden rounded-t-md bg-black/45 [mask-image:linear-gradient(90deg,transparent,#000_18%,#000_82%,transparent)]",
      this.compassStrip,
      this.compassMark,
      el("div", "absolute bottom-0 left-1/2 h-1.5 w-0.5 -translate-x-1/2 bg-white"),
    );
    const location = el("div", "flex w-[min(56vw,15rem)] flex-col items-center rounded-b-md bg-black/45 px-2 pb-1", this.place, this.district);
    // Phones: the top centre belongs to the pause button, so the location moves under the clock.
    const top = coarse
      ? el("div", "absolute inset-x-0 top-[3.2rem] flex flex-col items-center gap-1.5", this.offer)
      : el("div", "absolute inset-x-0 top-2 flex flex-col items-center gap-1.5", el("div", "flex flex-col items-center", compass, location), this.offer);
    if (coarse) {
      this.place.className = "max-w-[34vw] truncate text-[10px] font-bold leading-tight";
      this.district.className = "text-[8px] font-bold uppercase tracking-[0.2em] text-white/60";
    }

    // Speedometer: 0–120 mph over a 270° arc.
    const ticks: string[] = [];
    for (let v = 0; v <= 120; v += 10) {
      const a = ((225 - (v / 120) * 270) * Math.PI) / 180;
      const r0 = v % 20 === 0 ? 38 : 41;
      ticks.push(`<line x1="${50 + Math.cos(a) * r0}" y1="${50 - Math.sin(a) * r0}" x2="${50 + Math.cos(a) * 45}" y2="${50 - Math.sin(a) * 45}" stroke="${v > 80 ? "#ff6b6b" : "#fff"}" stroke-width="${v % 20 === 0 ? 2 : 1}" />`);
      if (v % 20 === 0) ticks.push(`<text x="${50 + Math.cos(a) * 30}" y="${52.5 - Math.sin(a) * 30}" fill="#fff" fill-opacity=".75" font-size="7" font-weight="700" text-anchor="middle">${v}</text>`);
    }
    const limitA = ((225 - ((SPEED_LIMIT * MPH) / 120) * 270) * Math.PI) / 180;
    this.dial.innerHTML = `<svg viewBox="0 0 100 100" class="h-full w-full"><circle cx="50" cy="50" r="48" fill="rgba(0,0,0,.55)" stroke="rgba(255,255,255,.2)" stroke-width="1.5"/>${ticks.join("")}<circle cx="${50 + Math.cos(limitA) * 45}" cy="${50 - Math.sin(limitA) * 45}" r="2.2" fill="#ffd21f"/><line id="needle" x1="50" y1="50" x2="50" y2="12" stroke="#ff3b3b" stroke-width="2.4" stroke-linecap="round"/><circle cx="50" cy="50" r="4" fill="#ddd"/></svg>`;
    this.dial.style.width = this.dial.style.height = coarse ? "5rem" : "7.5rem";
    this.needle = this.dial.querySelector("#needle") as unknown as SVGLineElement;
    this.needle.removeAttribute("id");
    const readout = el("div", "absolute inset-x-0 bottom-[16%] flex flex-col items-center", this.speed, el("div", "text-[8px] font-bold tracking-wider text-white/60", "MPH"));
    this.dial.append(readout);
    this.carPanel.append(this.dial, el("div", "mt-0.5 flex items-center gap-1.5", this.lampR, this.lights, this.lampB), this.radar);
    this.footPanel.append(this.weapon, this.health, this.stamina);
    const gauge = el("div", `absolute right-2 ${coarse ? "top-[4.6rem]" : "bottom-14"} flex flex-col items-end rounded-xl bg-black/35 p-1.5`, this.carPanel, this.footPanel);

    const radioBox = el("div", `leading-tight ${coarse ? "max-w-[40vw] text-[10px]" : "absolute bottom-3 left-2 max-w-[min(50vw,26rem)] text-[11px]"}`, this.radio);
    // Phones stack the left column (map, call, radio) so nothing overlaps.
    const topLeft = el("div", "absolute top-2 left-2 flex flex-col items-start gap-1.5", this.map, this.pursuit, this.callCard, ...(coarse ? [radioBox] : []));
    const topRight = el(
      "div",
      `absolute top-2 ${coarse ? "right-3" : "right-14"} flex flex-col items-end gap-1`,
      el("div", "flex flex-col items-end gap-0.5 rounded-lg bg-black/45 px-3 py-1.5", this.clock, this.score, ...(coarse ? [this.place] : [this.status]), this.paperwork),
      this.feedBox,
    );
    const bottomLeft = coarse ? el("div", "hidden") : radioBox;
    // Desktop: the action panel sits right of centre, clear of the view ahead;
    // on phones it sits high in the middle, clear of both thumbs.
    if (coarse) this.menu.className = "pointer-events-auto flex max-h-[44vh] w-[min(60vw,24rem)] flex-col gap-1 overflow-auto";
    const actions = el("div", coarse ? "absolute inset-x-0 top-[17%] flex justify-center" : "absolute top-[22%] right-3 flex justify-end", this.menu);
    const center = el("div", `absolute inset-x-0 ${coarse ? "bottom-[40%]" : "bottom-16"} flex flex-col items-center gap-2`, this.speech, this.prompt);
    this.mdt.append(this.mdtTabs, this.mdtBody);
    this.root.append(topLeft, topRight, gauge, bottomLeft, actions, center, top, this.crosshair, this.hurt, this.toast, this.mdt);
    host.append(this.root, this.sr);
  }

  destroy() {
    this.root.remove();
    this.sr.remove();
  }

  cycleZoom() {
    this.zoom = this.zoom === 1.25 ? 0.7 : this.zoom === 0.7 ? 2.2 : 1.25;
  }

  toggleMdt(force?: boolean) {
    const show = force ?? this.mdt.classList.contains("hidden");
    this.mdt.classList.toggle("hidden", !show);
    this.mdt.classList.toggle("flex", show);
    this.mdtSig = "";
    return show;
  }
  get mdtOpen() {
    return !this.mdt.classList.contains("hidden");
  }

  flash(text: string, color: string) {
    this.toast.textContent = text;
    this.toast.style.color = color;
    this.toast.style.opacity = "1";
    this.toastUntil = performance.now() + 1800;
  }

  /** A line in the score feed (top right), fading after a few seconds. */
  feed(points: number, text: string) {
    const good = points >= 0;
    const item = el(
      "div",
      `flex max-w-[min(60vw,20rem)] items-center gap-1.5 rounded-md border-l-4 bg-black/65 px-2 py-0.5 text-[11px] font-semibold transition-all duration-500 ${good ? "border-[#4ade80]" : "border-[#f87171]"}`,
      el("span", `font-black tabular-nums ${good ? "text-[#86efac]" : "text-[#fca5a5]"}`, `${good ? "+" : ""}${points}`),
      el("span", "truncate", text),
    );
    this.feedBox.prepend(item);
    while (this.feedBox.children.length > 4) this.feedBox.lastElementChild?.remove();
    setTimeout(() => {
      item.style.opacity = "0";
      item.style.transform = "translateX(12px)";
    }, 3200);
    setTimeout(() => item.remove(), 3800);
  }

  update(aiming: boolean, camYaw: number, opts: Option[]) {
    const sim = this.sim;
    const pl = sim.player;
    const u = sim.unit;
    const now = performance.now();
    this.clock.textContent = sim.clockText();
    this.score.textContent = `SCORE ${sim.stats.score}`;
    this.status.textContent = `Calls ${sim.stats.calls} · Arrests ${sim.stats.arrests} · Tickets ${sim.stats.citations}`;
    const pending = sim.reports.filter((r) => !r.filed).length;
    this.paperwork.classList.toggle("hidden", !pending);
    this.paperwork.textContent = `${pending} report${pending > 1 ? "s" : ""} to file · MDT`;

    // Compass (bearing: 0 = north) and where we are.
    const heading = pl.inCar ? u.h : camYaw;
    const bearing = ((((heading * 180) / Math.PI + 90) % 360) + 360) % 360;
    const px = Number(this.compassStrip.dataset.px);
    const w = this.compassStrip.parentElement?.clientWidth ?? 240;
    this.compassStrip.style.transform = `translateX(${w / 2 - bearing * px}px)`;
    const wp = sim.waypoint();
    const o = sim.officer;
    if (wp) {
      const b = ((((Math.atan2(wp.z - o.z, wp.x - o.x) * 180) / Math.PI + 90) % 360) + 360) % 360;
      let rel = b - bearing;
      if (rel > 180) rel -= 360;
      if (rel < -180) rel += 360;
      const x = w / 2 + Math.max(-w / 2 + 6, Math.min(w / 2 - 6, rel * px));
      this.compassMark.style.left = `${x}px`;
    }
    this.compassMark.classList.toggle("hidden", !wp);
    const loc = locationOf(sim.city, o.x, o.z);
    this.place.textContent = loc.cross ? `${loc.street} · near ${loc.cross}` : loc.street;
    this.district.textContent = loc.district;

    // Speed / lights / radar, or health and stamina on foot.
    const v = Math.abs(speedOf(u));
    const mph = Math.round(v * MPH);
    this.carPanel.classList.toggle("hidden", !pl.inCar);
    this.footPanel.classList.toggle("hidden", pl.inCar);
    this.footPanel.classList.toggle("flex", !pl.inCar);
    this.speed.textContent = pl.inCar ? String(mph) : "--";
    this.speed.style.color = v > SPEED_LIMIT + 2.2 ? "#ffb3b3" : "#fff";
    this.needle.style.transformOrigin = "50px 50px";
    this.needle.style.transform = `rotate(${-135 + Math.min(1, mph / 120) * 270}deg)`;
    const blink = Math.floor(now / 180) % 2 === 0;
    this.lampR.style.background = u.lights && blink ? "#ff4757" : "rgba(255,71,87,.2)";
    this.lampB.style.background = u.lights && !blink ? "#4d7cff" : "rgba(77,124,255,.2)";
    this.lights.textContent = u.siren ? `Siren · ${sim.sirenTone}` : u.lights ? "Lights" : "Lights off";
    const flee = sim.cars.find((c) => c.ai?.mode === "flee");
    this.pursuit.classList.toggle("hidden", !flee);
    if (flee) this.pursuit.textContent = `Pursuit · ${Math.round(sim.distToOfficer(flee.x, flee.z))} m · ${Math.round(Math.abs(speedOf(flee)) * MPH)} mph${sim.air ? " · Air-1 overhead" : ""}`;
    if (sim.radar && pl.inCar) {
      const r = Math.round(sim.radar.speed * MPH);
      this.radar.textContent = `RADAR ${r} MPH`;
      this.radar.style.color = sim.radar.speed > SPEED_LIMIT + 2.2 ? "#ff6b6b" : "#9be7a1";
    } else this.radar.textContent = "";
    this.weapon.textContent = pl.inCar ? "" : this.coarse ? (pl.weapon === "taser" ? "TASER" : "SIDEARM") : `${pl.weapon === "taser" ? "TASER" : "SIDEARM"} · X to switch`;
    this.weapon.style.color = pl.weapon === "taser" ? "#fde047" : "#fff";
    this.healthBar.style.width = `${pl.hp}%`;
    this.healthBar.style.background = pl.hp < 35 ? "#ef4444" : "#4ade80";
    this.staminaBar.style.width = `${Math.round(pl.stamina * 100)}%`;
    this.hurt.style.opacity = sim.time - pl.hurtAt < 0.6 ? "1" : pl.hp < 35 ? "0.5" : "0";
    this.crosshair.classList.toggle("hidden", pl.inCar || !aiming);
    if (now > this.toastUntil) this.toast.style.opacity = "0";

    // Callout offer.
    const call = sim.offeredCall();
    this.offer.classList.toggle("hidden", !call);
    if (call && this.offer.dataset.id !== call.id) {
      this.offer.dataset.id = call.id;
      const yes = el("button", "rounded bg-[#ffd21f] px-3 py-1.5 text-xs font-black uppercase text-black", this.coarse ? "Respond" : "[Y] Respond");
      const no = el("button", "rounded border border-white/40 px-3 py-1.5 text-xs font-bold uppercase", this.coarse ? "Decline" : "[N] Decline");
      yes.type = no.type = "button";
      yes.addEventListener("click", () => this.onAccept(true));
      no.addEventListener("click", () => this.onAccept(false));
      this.offer.replaceChildren(
        el("p", "text-[10px] font-bold uppercase tracking-[0.25em] text-[#ffd21f]", `Dispatch · Code ${call.code}`),
        el("p", "font-display text-lg font-black uppercase leading-tight", call.title),
        el("p", "text-xs text-white/80", call.where),
        el("p", "mt-1 text-xs text-white/70", call.note),
        el("div", "mt-2 flex gap-2", yes, no),
      );
    }

    // Active call card.
    const active = sim.activeCall();
    this.callCard.classList.toggle("hidden", !active);
    if (active) {
      const dist = Math.round(sim.distToOfficer(active.x, active.z));
      const sig = `${active.id}:${active.state}:${dist}:${active.plateRun}`;
      if (sig !== this.callSig) {
        this.callSig = sig;
        this.callCard.style.borderColor = active.code === 3 ? "#ef4444" : "#f59e0b";
        this.callCard.replaceChildren(
          el("p", "text-[9px] font-bold uppercase tracking-[0.2em] text-white/60", `Code ${active.code} · ${active.state === "enroute" ? `${dist} m` : "on scene"}`),
          el("p", "text-[12px] font-black leading-tight", active.title),
          ...(this.coarse ? [] : [el("p", "text-[10px] leading-tight text-[#fde68a]", callHint(sim, active))]),
        );
      }
    }

    // Prompt.
    let prompt = "";
    const near = Math.hypot(u.x - pl.x, u.z - pl.z) < 3.4;
    if (sim.over) prompt = "";
    else if (pl.inCar && Math.abs(speedOf(u)) < 3) prompt = this.coarse ? "Tap EXIT to get out" : "[E] Exit vehicle";
    else if (!pl.inCar && near && !pl.escort) prompt = this.coarse ? "Tap ENTER to get in" : "[E] Enter vehicle";
    if (sim.stopCar && pl.inCar && !opts.length) prompt = "Traffic stop: pull in behind, stop and get out";
    this.prompt.textContent = prompt;
    this.prompt.classList.toggle("hidden", !prompt);

    // Speech bubble.
    const sp = sim.speech && sim.time - sim.speech.at < 6 ? sim.speech : null;
    this.speech.classList.toggle("hidden", !sp);
    if (sp) this.speech.replaceChildren(el("strong", "", `${sp.who}: `), `"${sp.text}"`);

    // Action panel, grouped with icons; numbers are the 1–9 keys.
    const sig = opts.map((o) => o.id + o.label).join("|");
    if (sig !== this.menuSig) {
      this.menuSig = sig;
      const rows: Node[] = [];
      let last: OptionGroup | "" = "";
      opts.slice(0, 9).forEach((o, i) => {
        const g = GROUPS[o.group ?? "unit"];
        if (o.group !== last) {
          last = o.group ?? "unit";
          const head = el("div", "mt-1 flex items-center gap-1 px-1 text-[9px] font-black uppercase tracking-[0.2em] first:mt-0", svg(g.icon, "h-3 w-3"), g.label);
          head.style.color = g.color;
          rows.push(head);
        }
        const icon = svg(g.icon, "h-4 w-4");
        icon.style.color = g.color;
        const b = el(
          "button",
          `flex items-center gap-2 rounded-md border-l-[3px] bg-black/75 px-2.5 text-left font-semibold backdrop-blur-sm hover:bg-[#1d4ed8]/80 focus-visible:outline-2 focus-visible:outline-[#ffd21f] ${this.coarse ? "min-h-11 py-2 text-[13px] active:bg-[#1d4ed8]" : "py-1.5 text-[13px]"}`,
          el("span", "grid h-5 w-5 shrink-0 place-items-center rounded bg-white/15 text-[11px] font-black", String(i + 1)),
          icon,
          el("span", "leading-snug", o.label),
        );
        b.style.borderColor = g.color;
        b.type = "button";
        b.dataset.option = o.id;
        b.addEventListener("click", () => this.onChoose(i));
        rows.push(b);
      });
      this.menu.replaceChildren(...rows);
    }

    // Radio.
    const lines = sim.log.slice(this.coarse ? -3 : -6);
    // Phones: the action list takes priority over the radio.
    this.radio.classList.toggle("hidden", this.coarse && opts.length > 0);
    const rsig = `${sim.log.length}:${lines.at(-1)?.t}`;
    if (rsig !== this.radioSig) {
      this.radioSig = rsig;
      const color: Record<string, string> = { radio: "#9cc2ff", info: "#e5e7eb", good: "#86efac", bad: "#fca5a5", speech: "#fde68a" };
      this.radio.replaceChildren(
        ...lines.map((l, i) => {
          const p = el("p", "rounded bg-black/55 px-2 py-0.5", Object.assign(el("span", ""), { textContent: l.text, style: `color:${color[l.kind]}` }));
          p.style.opacity = String(0.55 + (i / Math.max(1, lines.length - 1)) * 0.45);
          return p;
        }),
      );
    }

    this.drawMap(camYaw);
    this.updateMdt();

    const offerText = call ? ` · OFFER: ${call.title}` : "";
    const activeText = active ? ` · CALL: ${active.title} (${active.state})` : "";
    this.sr.textContent = `${pl.inCar ? `IN UNIT ${mph} MPH` : "ON FOOT"} · ${sim.clockText()} · SCORE ${sim.stats.score} · ${u.siren ? "SIREN" : u.lights ? "LIGHTS" : "LIGHTS OFF"}${offerText}${activeText}${opts.length ? ` · ACTIONS: ${opts.map((o) => o.label).join(" / ")}` : ""}${sim.over ? ` · SHIFT OVER: ${sim.over.reason}` : ""}`;
  }

  private drawMap(camYaw: number) {
    const sim = this.sim;
    const g = this.map.getContext("2d")!;
    const S = 180;
    const o = sim.officer;
    const heading = sim.player.inCar ? sim.unit.h : camYaw;
    const scale = this.zoom; // screen px per metre
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = "#101620";
    g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    // Rotate so "forward" is up.
    g.rotate(-heading - Math.PI / 2);
    g.scale(scale / MAP_PX, scale / MAP_PX);
    g.translate(-o.x * MAP_PX, -o.z * MAP_PX);
    g.drawImage(this.mapImg, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // World → map helper.
    const cos = Math.cos(-heading - Math.PI / 2);
    const sin = Math.sin(-heading - Math.PI / 2);
    const to = (x: number, z: number) => {
      const dx = (x - o.x) * scale;
      const dz = (z - o.z) * scale;
      return { x: S / 2 + dx * cos - dz * sin, y: S / 2 + dx * sin + dz * cos };
    };
    // GPS route.
    const wp = sim.waypoint();
    if (wp) {
      const path = route(nearestNode(o.x, o.z), nearestNode(wp.x, wp.z));
      g.strokeStyle = "#c084fc";
      g.lineWidth = 4;
      g.lineJoin = "round";
      g.beginPath();
      const a = to(o.x, o.z);
      g.moveTo(a.x, a.y);
      for (const n of path) {
        const p = nodePos(n);
        const q = to(p.x, p.z);
        g.lineTo(q.x, q.y);
      }
      const e = to(wp.x, wp.z);
      g.lineTo(e.x, e.y);
      g.stroke();
      const blip = (x: number, y: number) => {
        g.fillStyle = "#ffd21f";
        g.beginPath();
        g.arc(x, y, 6, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#000";
        g.lineWidth = 1.5;
        g.stroke();
      };
      // Clamp the blip to the rim when it's off the map.
      const dx = e.x - S / 2;
      const dy = e.y - S / 2;
      const d = Math.hypot(dx, dy);
      if (d > S / 2 - 8) blip(S / 2 + (dx / d) * (S / 2 - 8), S / 2 + (dy / d) * (S / 2 - 8));
      else blip(e.x, e.y);
    }
    // North marker on the rim.
    const nx = S / 2 + Math.sin(heading + Math.PI / 2) * (S / 2 - 9);
    const ny = S / 2 - Math.cos(heading + Math.PI / 2) * (S / 2 - 9);
    g.fillStyle = "#ff6b6b";
    g.font = "bold 12px system-ui";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("N", nx, ny);
    // Station.
    const st = to(sim.city.station.x, sim.city.station.z);
    g.fillStyle = "#3b82f6";
    g.font = "bold 11px system-ui";
    g.fillText("★", st.x, st.y);
    // Cars of interest and people.
    const flash = Math.floor(performance.now() / 250) % 2 === 0;
    // Checkpoint, roadblock, cones.
    for (const d of sim.deploy) {
      const q = to(d.x, d.z);
      g.fillStyle = d.kind === "checkpoint" ? "#38bdf8" : d.kind === "roadblock" ? "#f97316" : "#fb923c";
      g.fillRect(q.x - 4, q.y - 4, 8, 8);
    }
    if (sim.air) {
      const q = to(sim.air.x, sim.air.z);
      g.strokeStyle = "#e2e8f0";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(q.x, q.y, 7, 0, Math.PI * 2);
      g.stroke();
    }
    for (const c of sim.cars) {
      if (c === sim.unit) continue;
      if (sim.flagged.has(c.id) && c.ai?.mode !== "flee") {
        const q = to(c.x, c.z);
        g.fillStyle = flash ? "#facc15" : "#ef4444";
        g.beginPath();
        g.arc(q.x, q.y, 4, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      const fleeing = c.ai?.mode === "flee";
      const police = c.spec.police;
      if (!fleeing && !police && c.id !== sim.stopCar) continue;
      const p = to(c.x, c.z);
      g.fillStyle = fleeing ? (flash ? "#ef4444" : "#7f1d1d") : police ? (flash ? "#3b82f6" : "#ef4444") : "#f59e0b";
      g.beginPath();
      g.arc(p.x, p.y, 4, 0, Math.PI * 2);
      g.fill();
    }
    for (const p of sim.peds) {
      const threat = p.state === "flee" || p.state === "attack";
      const custody = p.state === "cuffed" || p.state === "escort" || p.state === "handsup" || p.state === "kneel" || p.state === "prone";
      if (!threat && !custody && p.role !== "suspect" && p.state !== "fight" && p.state !== "cross") continue;
      if (p.state === "gone" || p.state === "driving" || p.state === "incar" || p.state === "dead") continue;
      const q = to(p.x, p.z);
      g.fillStyle = threat ? "#ef4444" : custody ? "#a3e635" : "#fb923c";
      g.beginPath();
      g.arc(q.x, q.y, 3, 0, Math.PI * 2);
      g.fill();
    }
    // Player arrow (always pointing up).
    g.fillStyle = "#ffffff";
    g.strokeStyle = "#000";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(S / 2, S / 2 - 8);
    g.lineTo(S / 2 + 6, S / 2 + 6);
    g.lineTo(S / 2, S / 2 + 3);
    g.lineTo(S / 2 - 6, S / 2 + 6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  private updateMdt() {
    if (!this.mdtOpen) return;
    const sim = this.sim;
    const k = sim.contacts.filter((c) => !c.resolved).at(-1) ?? sim.contacts.at(-1);
    const call = sim.activeCall();
    const parked = sim.player.inCar && Math.abs(speedOf(sim.unit)) < 1;
    const sig = `${this.mdtTab}:${sim.mdt.length}:${sim.mdt[0]?.at}:${k?.id}:${k?.violations.size}:${k?.offences.size}:${k?.pc.size}:${call?.state}:${sim.stats.score}:${sim.reports.length}:${sim.reports.filter((r) => r.filed).length}:${parked}`;
    if (sig === this.mdtSig) return;
    this.mdtSig = sig;
    const pending = sim.reports.filter((r) => !r.filed).length;
    const tabs: [typeof this.mdtTab, string][] = [
      ["call", "Call"],
      ["person", "Contact"],
      ["queries", "Queries"],
      ["reports", pending ? `Reports (${pending})` : "Reports"],
      ["shift", "Shift"],
    ];
    this.mdtTabs.replaceChildren(
      el("p", "mr-2 hidden self-center text-[11px] font-bold whitespace-nowrap text-white sm:block", "BAYVIEW PD · MDT"),
      ...tabs.map(([id, label]) => {
        const b = el("button", `shrink-0 rounded-t px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${this.mdtTab === id ? "bg-[#1e3a8a] text-white" : "text-[#93c5fd] hover:bg-white/10"}`, label);
        b.type = "button";
        b.addEventListener("click", () => {
          this.mdtTab = id;
          this.mdtSig = "";
          this.updateMdt();
        });
        return b;
      }),
      el("p", "ml-auto hidden self-center text-[10px] whitespace-nowrap text-white/50 lg:block", `1-ADAM-12 · ${sim.clockText()} · Tab closes`),
    );
    const section = (title: string, ...body: (Node | string)[]) =>
      el("section", "mb-3 rounded border border-[#1e3a8a] bg-black/30 p-2", el("h3", "mb-1 text-[11px] font-bold tracking-[0.2em] text-[#60a5fa]", title), ...body);
    const p = k ? sim.ped(k.ped) : undefined;
    let body: Node[] = [];
    if (this.mdtTab === "call") {
      body = [
        section(
          "CURRENT CALL",
          ...(call
            ? [
                el("p", "text-white", `${call.title} · Code ${call.code}`),
                el("p", "", `${call.where} · ${call.state.toUpperCase()}`),
                el("p", "text-white/70", call.note),
                el("p", "mt-1 text-[#fde68a]", `Next: ${callHint(sim, call)}`),
              ]
            : [el("p", "text-white/50", "No active call. Patrol, run traffic, stay visible.")]),
        ),
        section(
          "RECENT CALLS",
          ...(sim.calls.length
            ? sim.calls
                .slice(-6)
                .reverse()
                .map((c) => el("p", c.state === "done" ? "text-[#86efac]" : c.state === "failed" ? "text-[#fca5a5]" : "text-white/60", `${c.title} · ${c.state.toUpperCase()}`))
            : [el("p", "text-white/50", "None yet.")]),
        ),
      ];
    } else if (this.mdtTab === "person") {
      body = [
        section(
          "CURRENT CONTACT",
          k && p
            ? el(
                "div",
                "",
                el("p", "", `${k.idShown ? fullName(p.person) : "Unidentified"} · reason: ${k.reason}${k.resolved ? ` · ${k.resolved.toUpperCase()}` : ""}${k.felony ? " · FELONY STOP" : ""}`),
                el("p", "text-[#fde68a]", `Violations: ${[...k.violations].join(", ") || "none known"}`),
                el("p", "text-[#fca5a5]", `Offences: ${[...k.offences].join(", ") || "none known"}`),
                el("p", "text-white/70", `Probable cause: ${[...k.pc].filter((x) => x !== "consent" && x !== "k9-done").join(", ") || "none"}${k.pc.has("consent") ? " · consent given" : ""}${k.refused ? " · consent REFUSED" : ""}`),
                el("p", "text-white/70", `Searched: ${k.searched ? (k.tainted ? "yes (unlawful)" : "yes") : "no"} · Miranda: ${k.miranda ? "read" : "not read"}`),
              )
            : el("p", "text-white/50", "No contact."),
        ),
      ];
    } else if (this.mdtTab === "queries") {
      body = [
        section(
          "QUERIES",
          ...(sim.mdt.length
            ? sim.mdt.map((m) => el("div", `mb-1 ${m.flag ? "text-[#fca5a5]" : ""}`, el("p", "font-bold", m.title), ...m.lines.map((l) => el("p", "pl-2", l))))
            : [el("p", "text-white/50", "Run a plate or a name from a stop.")]),
        ),
      ];
    } else if (this.mdtTab === "reports") {
      body = [
        section(
          "PAPERWORK",
          el("p", "mb-2 text-white/60", parked ? "Parked: file your reports now (+ points). Unfiled reports cost points at end of watch." : "Park the unit to file reports."),
          ...(sim.reports.length
            ? [...sim.reports].reverse().map((r) => {
                const file = el("button", `rounded px-2 py-0.5 text-[11px] font-bold uppercase ${r.filed ? "bg-white/10 text-white/40" : parked ? "bg-[#2563eb] text-white" : "bg-white/10 text-white/50"}`, r.filed ? "Filed" : "File");
                file.type = "button";
                (file as HTMLButtonElement).disabled = r.filed || !parked;
                file.addEventListener("click", () => this.onChooseId(`report:${r.id}`));
                return el(
                  "div",
                  "mb-2 flex items-start justify-between gap-2 rounded bg-black/30 p-1.5",
                  el("div", "", el("p", `font-bold ${r.kind === "force" ? "text-[#fca5a5]" : "text-white"}`, r.title), ...r.lines.map((l) => el("p", "pl-2 text-white/70", l))),
                  file,
                );
              })
            : [el("p", "text-white/50", "Nothing to file yet.")]),
        ),
      ];
    } else {
      body = [
        section(
          "SHIFT",
          el("p", "", `Score ${sim.stats.score} · Calls ${sim.stats.calls} · Stops ${sim.stats.stops} · Arrests ${sim.stats.arrests} · Citations ${sim.stats.citations} · Pursuits ${sim.stats.pursuits} · Booked ${sim.stats.booked} · Grade ${sim.grade()}`),
          ...sim.stats.report.slice(-12).map((r) => el("p", r.points >= 0 ? "text-[#86efac]" : "text-[#fca5a5]", `${r.points > 0 ? "+" : ""}${r.points} ${r.text}`)),
        ),
      ];
    }
    this.mdtBody.replaceChildren(...body);
  }
}
