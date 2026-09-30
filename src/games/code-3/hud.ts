import { HALF_ROAD, HALF_STREET, nearestNode, route, nodePos, SIZE, SPEED_LIMIT, type City } from "./city";
import { fullName } from "./people";
import type { Code3Sim, Option } from "./sim";
import { speedOf } from "./vehicles";

/**
 * The Code 3 heads-up display (DOM over the 3D view): minimap with GPS route,
 * dispatch radio, the callout card, speed / radar / lights, the action menu
 * for the person in front of you, the MDT (Tab) and a screen-reader mirror.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", ...children: (Node | string)[]) {
  const n = document.createElement(tag);
  n.className = className;
  n.append(...children);
  return n;
}

const MPH = 2.23694;
const MAP_PX = 1.6;

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
  void HALF_STREET;
  return c;
}

export class Code3Hud {
  readonly root: HTMLDivElement;
  private map: HTMLCanvasElement;
  private mapImg: HTMLCanvasElement;
  private clock = el("div", "font-display text-lg font-black tabular-nums");
  private score = el("div", "text-xs font-bold");
  private status = el("div", "text-[11px] text-white/80");
  private radio = el("div", "flex flex-col gap-0.5");
  private offer = el("div", "pointer-events-auto hidden w-[min(92vw,26rem)] rounded-lg border-2 border-[#ffd21f] bg-black/80 p-3 text-left shadow-xl");
  private speed = el("div", "font-display text-3xl font-black tabular-nums leading-none");
  private lights = el("div", "text-[10px] font-bold uppercase tracking-wider");
  private radar = el("div", "text-[11px] font-bold tabular-nums");
  private health = el("div", "h-1.5 w-28 overflow-hidden rounded bg-white/15");
  private healthBar = el("div", "h-full bg-[#4ade80]");
  private weapon = el("div", "text-[11px] font-bold uppercase tracking-wider");
  private prompt = el("div", "rounded bg-black/65 px-3 py-1 text-sm font-semibold");
  private speech = el("div", "hidden max-w-[min(92vw,30rem)] rounded-lg bg-white/95 px-3 py-2 text-sm text-[#111]");
  private menu = el("div", "pointer-events-auto flex max-h-[40vh] w-[min(92vw,24rem)] flex-col gap-1 overflow-auto");
  private mdt = el("div", "pointer-events-auto absolute inset-x-3 top-3 bottom-3 z-20 hidden overflow-auto rounded-xl border-2 border-[#3b82f6] bg-[#0b1220]/95 p-4 font-mono text-[12px] text-[#cfe3ff] sm:inset-x-[12%]");
  private crosshair = el("div", "pointer-events-none absolute top-1/2 left-1/2 hidden h-5 w-5 -translate-x-1/2 -translate-y-1/2");
  private hurt = el("div", "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300");
  private toast = el("div", "pointer-events-none absolute top-[22%] left-1/2 -translate-x-1/2 text-center font-display text-2xl font-black uppercase tracking-wider opacity-0 transition-opacity duration-300 [text-shadow:0_2px_8px_#000]");
  readonly sr = el("div", "sr-only");
  private menuSig = "";
  private radioSig = "";
  private mdtSig = "";
  private toastUntil = 0;
  onChoose: (i: number) => void = () => {};
  onAccept: (yes: boolean) => void = () => {};

  constructor(
    host: HTMLElement,
    private sim: Code3Sim,
    private coarse: boolean,
  ) {
    this.root = el("div", "pointer-events-none absolute inset-0 z-[4] select-none text-white [text-shadow:0_1px_2px_rgba(0,0,0,.9)]");
    this.mapImg = paintMap(sim.city);
    this.map = el("canvas", "block rounded-full border-2 border-white/30 bg-black/40");
    this.map.width = this.map.height = 180;
    this.map.style.width = this.map.style.height = "min(34vmin, 11rem)";
    this.health.append(this.healthBar);
    this.crosshair.innerHTML =
      '<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="2" fill="white"/><path d="M10 0v6M10 14v6M0 10h6M14 10h6" stroke="white" stroke-width="1.5"/></svg>';
    this.hurt.style.background = "radial-gradient(circle, transparent 50%, rgba(200,0,0,.55))";
    this.sr.dataset.testid = "code3-hud";
    this.sr.setAttribute("role", "status");
    this.sr.setAttribute("aria-live", "off");

    const topLeft = el("div", "absolute top-2 left-2 flex flex-col items-start gap-1", this.map);
    const topRight = el(
      "div",
      "absolute top-2 right-14 flex flex-col items-end gap-0.5 rounded-lg bg-black/45 px-3 py-1.5",
      this.clock,
      this.score,
      this.status,
    );
    const bottomRight = el(
      "div",
      "absolute right-3 bottom-14 flex flex-col items-end gap-1 rounded-lg bg-black/45 px-3 py-2",
      this.speed,
      el("div", "text-[10px] font-bold text-white/60", "MPH"),
      this.lights,
      this.radar,
      this.weapon,
      this.health,
    );
    const bottomLeft = el("div", `absolute left-2 ${coarse ? "top-[calc(min(34vmin,11rem)+1rem)]" : "bottom-3"} max-w-[min(60vw,28rem)] text-[11px] leading-tight`, this.radio);
    const center = el(
      "div",
      `absolute inset-x-0 ${coarse ? "bottom-[38%]" : "bottom-20"} flex flex-col items-center gap-2`,
      this.speech,
      this.menu,
      this.prompt,
    );
    const top = el("div", "absolute inset-x-0 top-2 flex justify-center", this.offer);
    this.root.append(topLeft, topRight, bottomRight, bottomLeft, center, top, this.crosshair, this.hurt, this.toast, this.mdt);
    host.append(this.root, this.sr);
  }

  destroy() {
    this.root.remove();
    this.sr.remove();
  }

  toggleMdt(force?: boolean) {
    const show = force ?? this.mdt.classList.contains("hidden");
    this.mdt.classList.toggle("hidden", !show);
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

  update(aiming: boolean, camYaw: number, opts: Option[]) {
    const sim = this.sim;
    const pl = sim.player;
    const u = sim.unit;
    this.clock.textContent = sim.clockText();
    this.score.textContent = `SCORE ${sim.stats.score}`;
    this.status.textContent = `Calls ${sim.stats.calls} · Arrests ${sim.stats.arrests} · Tickets ${sim.stats.citations}`;
    const mph = Math.round(Math.abs(speedOf(u)) * MPH);
    this.speed.textContent = pl.inCar ? String(mph) : "--";
    this.lights.textContent = u.siren ? "● LIGHTS + SIREN" : u.lights ? "● LIGHTS" : "LIGHTS OFF";
    this.lights.style.color = u.lights ? (Math.floor(performance.now() / 250) % 2 ? "#ff4757" : "#4d7cff") : "rgba(255,255,255,.55)";
    if (sim.radar && pl.inCar) {
      const r = Math.round(sim.radar.speed * MPH);
      this.radar.textContent = `RADAR ${r} MPH`;
      this.radar.style.color = sim.radar.speed > SPEED_LIMIT + 2.2 ? "#ff6b6b" : "#9be7a1";
    } else this.radar.textContent = "";
    this.weapon.textContent = pl.inCar ? "" : `${pl.weapon === "taser" ? "TASER" : "SIDEARM"} · X to switch`;
    this.healthBar.style.width = `${pl.hp}%`;
    this.healthBar.style.background = pl.hp < 35 ? "#ef4444" : "#4ade80";
    this.hurt.style.opacity = sim.time - pl.hurtAt < 0.6 ? "1" : pl.hp < 35 ? "0.5" : "0";
    this.crosshair.classList.toggle("hidden", pl.inCar || !aiming);
    if (performance.now() > this.toastUntil) this.toast.style.opacity = "0";

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

    // Prompt.
    const active = sim.activeCall();
    let prompt = "";
    const near = Math.hypot(u.x - pl.x, u.z - pl.z) < 3.4;
    if (sim.over) prompt = "";
    else if (pl.inCar && Math.abs(speedOf(u)) < 3) prompt = this.coarse ? "Tap EXIT to get out" : "[E] Exit vehicle";
    else if (!pl.inCar && near && !pl.escort) prompt = this.coarse ? "Tap ENTER to get in" : "[E] Enter vehicle";
    if (sim.stopCar && pl.inCar && !opts.length) prompt = "Traffic stop: pull in behind, stop and get out";
    if (active && !prompt) prompt = `${active.title}: ${Math.round(sim.distToOfficer(active.x, active.z))} m`;
    this.prompt.textContent = prompt;
    this.prompt.classList.toggle("hidden", !prompt);

    // Speech bubble.
    const sp = sim.speech && sim.time - sim.speech.at < 6 ? sim.speech : null;
    this.speech.classList.toggle("hidden", !sp);
    if (sp) this.speech.replaceChildren(el("strong", "", `${sp.who}: `), `"${sp.text}"`);

    // Action menu.
    const sig = opts.map((o) => o.id + o.label).join("|");
    if (sig !== this.menuSig) {
      this.menuSig = sig;
      this.menu.replaceChildren(
        ...opts.slice(0, 9).map((o, i) => {
          const b = el(
            "button",
            "flex items-center gap-2 rounded-md bg-black/75 px-3 py-1.5 text-left text-sm font-semibold hover:bg-[#1d4ed8]/80 focus-visible:outline-2 focus-visible:outline-[#ffd21f]",
            el("span", "grid h-5 w-5 shrink-0 place-items-center rounded bg-white/15 text-[11px] font-black", String(i + 1)),
            o.label,
          );
          b.type = "button";
          b.dataset.option = o.id;
          b.addEventListener("click", () => this.onChoose(i));
          return b;
        }),
      );
    }

    // Radio.
    const lines = sim.log.slice(-6);
    const rsig = `${sim.log.length}:${lines.at(-1)?.t}`;
    if (rsig !== this.radioSig) {
      this.radioSig = rsig;
      const color: Record<string, string> = { radio: "#9cc2ff", info: "#e5e7eb", good: "#86efac", bad: "#fca5a5", speech: "#fde68a" };
      this.radio.replaceChildren(...lines.map((l) => el("p", "rounded bg-black/55 px-2 py-0.5", Object.assign(el("span", ""), { textContent: l.text, style: `color:${color[l.kind]}` }))));
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
    const scale = 1.25; // screen px per metre
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
    // Station.
    const st = to(sim.city.station.x, sim.city.station.z);
    g.fillStyle = "#3b82f6";
    g.font = "bold 11px system-ui";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("★", st.x, st.y);
    // Cars of interest and people.
    const flash = Math.floor(performance.now() / 250) % 2 === 0;
    for (const c of sim.cars) {
      if (c === sim.unit) continue;
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
      const custody = p.state === "cuffed" || p.state === "escort" || p.state === "handsup";
      if (!threat && !custody && p.role !== "suspect") continue;
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
    const sig = `${sim.mdt.length}:${sim.mdt[0]?.at}:${k?.id}:${k?.violations.size}:${k?.offences.size}:${k?.pc.size}:${call?.state}:${sim.stats.score}`;
    if (sig === this.mdtSig) return;
    this.mdtSig = sig;
    const section = (title: string, ...body: (Node | string)[]) =>
      el("section", "mb-3 rounded border border-[#1e3a8a] bg-black/30 p-2", el("h3", "mb-1 text-[11px] font-bold tracking-[0.2em] text-[#60a5fa]", title), ...body);
    const p = k ? sim.ped(k.ped) : undefined;
    this.mdt.replaceChildren(
      el("div", "mb-3 flex items-center justify-between", el("p", "text-sm font-bold text-white", "BAYVIEW PD · MOBILE DATA TERMINAL"), el("p", "", `UNIT 1-ADAM-12 · ${sim.clockText()} · Tab to close`)),
      section(
        "CURRENT CALL",
        call ? el("p", "", `${call.title} · ${call.where} · ${call.state.toUpperCase()}`) : el("p", "text-white/50", "No active call. Patrol, run traffic, stay visible."),
      ),
      section(
        "CURRENT CONTACT",
        k && p
          ? el(
              "div",
              "",
              el("p", "", `${k.idShown ? fullName(p.person) : "Unidentified"} · reason: ${k.reason}${k.resolved ? ` · ${k.resolved.toUpperCase()}` : ""}`),
              el("p", "text-[#fde68a]", `Violations: ${[...k.violations].join(", ") || "none known"}`),
              el("p", "text-[#fca5a5]", `Offences: ${[...k.offences].join(", ") || "none known"}`),
              el("p", "text-white/70", `Probable cause: ${[...k.pc].filter((x) => x !== "consent").join(", ") || "none"}${k.pc.has("consent") ? " · consent given" : ""}${k.refused ? " · consent REFUSED" : ""}`),
            )
          : el("p", "text-white/50", "No contact."),
      ),
      section(
        "QUERIES",
        ...(sim.mdt.length
          ? sim.mdt.map((m) => el("div", `mb-1 ${m.flag ? "text-[#fca5a5]" : ""}`, el("p", "font-bold", m.title), ...m.lines.map((l) => el("p", "pl-2", l))))
          : [el("p", "text-white/50", "Run a plate or a name from a stop.")]),
      ),
      section(
        "SHIFT",
        el("p", "", `Score ${sim.stats.score} · Calls ${sim.stats.calls} · Stops ${sim.stats.stops} · Arrests ${sim.stats.arrests} · Citations ${sim.stats.citations} · Pursuits ${sim.stats.pursuits} · Booked ${sim.stats.booked}`),
        ...sim.stats.report.slice(-8).map((r) => el("p", r.points >= 0 ? "text-[#86efac]" : "text-[#fca5a5]", `${r.points > 0 ? "+" : ""}${r.points} ${r.text}`)),
      ),
    );
  }
}
