import { el } from "../sports-kit/ui";
import { holeName } from "./course";
import type { LieMap } from "./render";
import { LIES, stableford, yardage, type GolfEvent, type GolfSim } from "./sim";

const fmtPar = (n: number) => (n === 0 ? "E" : n > 0 ? `+${n}` : String(n));
const m = (v: number) => `${Math.round(v)} m`;

/**
 * Fairway's graphics: the hole card (hole, par, length, shot, to the pin and
 * your total), the yardage-book minimap with the line and landing spot, wind,
 * the club and lie, the three-press swing meter, calls and the scorecard.
 */
export class FairwayHud {
  private root: HTMLDivElement;
  private hole: HTMLParagraphElement;
  private holeSub: HTMLParagraphElement;
  private shot: HTMLParagraphElement;
  private total: HTMLParagraphElement;
  private map: HTMLCanvasElement;
  private mapBase: HTMLCanvasElement | null = null;
  private mapFor = -1;
  private mapT = { s: 1, ox: 0, oy: 0, x0: 0, z0: 0, res: 1 };
  private windArrow: HTMLSpanElement;
  private windText: HTMLSpanElement;
  private club: HTMLParagraphElement;
  private clubSub: HTMLParagraphElement;
  private meter: HTMLDivElement;
  private fill: HTMLDivElement;
  private mark: HTMLDivElement;
  private powerTick: HTMLDivElement;
  private call: HTMLDivElement;
  private callText: HTMLParagraphElement;
  private callSub: HTMLParagraphElement;
  private callT = 0;
  private chip: HTMLParagraphElement;
  private chipT = 0;
  private card: HTMLDivElement;
  private cardShown = false;
  private live: HTMLDivElement;
  private bottom: HTMLDivElement;

  constructor(
    host: HTMLElement,
    private sim: GolfSim,
    coarse: boolean,
    private lieMap: () => LieMap | null,
  ) {
    this.root = el("div", "pointer-events-none absolute inset-0 z-[5] select-none font-sans text-white");
    this.hole = el("p", "font-display text-lg font-black uppercase leading-tight");
    this.holeSub = el("p", "text-[11px] text-white/70");
    this.shot = el("p", "mt-1 text-[13px] font-semibold");
    this.total = el("p", "text-[12px] text-white/80");
    const bug = el(
      "div",
      "absolute left-[max(0.5rem,env(safe-area-inset-left))] top-[max(0.5rem,env(safe-area-inset-top))] w-56 rounded-md border border-white/15 bg-black/65 px-3 py-2 shadow-lg backdrop-blur-sm",
      el("p", "text-[10px] font-bold uppercase tracking-[0.3em] text-[#facc15]", "Fairway"),
      this.hole,
      this.holeSub,
      this.shot,
      this.total,
    );
    bug.setAttribute("data-testid", "golf-hole");

    this.map = el("canvas", "block rounded border border-white/15 bg-black/50");
    this.map.width = coarse ? 84 : 110;
    this.map.height = coarse ? 150 : 200;
    this.map.style.width = `${this.map.width}px`;
    this.map.style.height = `${this.map.height}px`;
    this.windArrow = el("span", "inline-block text-lg leading-none text-[#7dd3fc] transition-transform", "↑");
    this.windText = el("span", "text-[11px] font-bold tabular-nums");
    const right = el(
      "div",
      "absolute right-[max(0.5rem,env(safe-area-inset-right))] top-14 flex flex-col items-end gap-1",
      this.map,
      el("div", "flex items-center gap-1.5 rounded bg-black/65 px-2 py-1", el("span", "text-[10px] uppercase tracking-wider text-white/60", "Wind"), this.windArrow, this.windText),
    );

    this.club = el("p", "font-display text-base font-black uppercase");
    this.clubSub = el("p", "text-[11px] text-white/70");
    this.fill = el("div", "absolute inset-y-0 left-0 bg-gradient-to-r from-[#22c55e] via-[#facc15] to-[#ef4444] opacity-80");
    this.mark = el("div", "absolute -top-1 -bottom-1 w-1 -translate-x-1/2 rounded bg-white shadow");
    this.powerTick = el("div", "absolute -top-1.5 -bottom-1.5 w-0.5 -translate-x-1/2 bg-[#facc15] opacity-0");
    const snap = el("div", "absolute -top-1.5 -bottom-1.5 w-0.5 bg-white/90");
    snap.style.left = `${(0.15 / 1.25) * 100}%`;
    const full = el("div", "absolute inset-y-0 w-px bg-white/50");
    full.style.left = `${(1.15 / 1.25) * 100}%`;
    this.meter = el("div", "relative h-4 w-full overflow-visible rounded-full border border-white/30 bg-black/60", el("div", "absolute inset-0 overflow-hidden rounded-full", this.fill), snap, full, this.powerTick, this.mark);
    this.meter.setAttribute("data-testid", "golf-meter");
    const clubBox = el("div", "flex items-baseline justify-between gap-2", el("div", "", this.club, this.clubSub));
    clubBox.setAttribute("data-testid", "golf-club");
    this.bottom = el(
      "div",
      `absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 w-[min(26rem,calc(100%-1rem))] -translate-x-1/2 rounded-lg border border-white/15 bg-black/65 px-3 py-2 backdrop-blur-sm ${coarse ? "mb-24" : ""}`,
      clubBox,
      el("div", "mt-2", this.meter),
      el("p", "mt-1 text-center text-[10px] text-white/50", coarse ? "Tap SWING to start, again for power, again on the white line" : "Space: start · power · stop on the white line · A/D aim · W/S club"),
    );

    this.callText = el("p", "font-display text-4xl font-black uppercase italic drop-shadow-lg sm:text-6xl");
    this.callSub = el("p", "mt-1 text-sm font-semibold text-white/85");
    this.call = el("div", "absolute inset-x-0 top-[28%] text-center opacity-0 transition-opacity duration-300", this.callText, this.callSub);
    this.call.setAttribute("data-testid", "golf-call");
    this.chip = el("p", "absolute left-1/2 top-[max(0.5rem,env(safe-area-inset-top))] -translate-x-1/2 rounded bg-black/70 px-3 py-1 text-xs font-semibold opacity-0 transition-opacity");
    this.chip.setAttribute("data-testid", "golf-shot");
    this.card = el("div", "absolute inset-0 hidden place-items-center bg-black/55 p-3");
    this.card.setAttribute("data-testid", "golf-card");
    this.live = el("div", "sr-only");
    this.live.setAttribute("aria-live", "polite");
    this.root.append(bug, right, this.bottom, this.call, this.chip, this.card, this.live);
    host.appendChild(this.root);
  }

  private say(text: string, sub = "", secs = 2.6) {
    this.callText.textContent = text;
    this.callSub.textContent = sub;
    this.call.style.opacity = "1";
    this.callT = secs;
    this.live.textContent = `${text}. ${sub}`;
  }
  private note(text: string, secs = 4) {
    this.chip.textContent = text;
    this.chip.style.opacity = "1";
    this.chipT = secs;
  }

  onEvent(e: GolfEvent) {
    const sim = this.sim;
    switch (e.kind) {
      case "hole":
        this.say(`Hole ${e.n}`, `Par ${e.par} · ${e.length} m · ${holeName(sim.opts.course, sim.hole.n - 1)}`, 3);
        break;
      case "rest":
        if (e.lie !== "water" && e.lie !== "ob") this.note(sim.putting || e.carry < 1 ? `${LIES[e.lie].name} · ${e.toPin < 10 ? e.toPin.toFixed(1) : Math.round(e.toPin)} m left` : `Carry ${e.carry} m · Total ${e.total} m · ${LIES[e.lie].name}`);
        break;
      case "penalty":
        this.say("Penalty", e.why, 3);
        break;
      case "lip":
        this.note("Lipped out!", 2);
        break;
      case "tree":
        this.note("Off the trees", 2);
        break;
      case "holed":
        this.say(e.call, e.call === "Picked up" ? "Ten shots: pick it up and move on." : `${e.strokes} ${e.strokes === 1 ? "shot" : "shots"} on a par ${e.par}${e.length > 2 ? ` · holed from ${e.length} m` : ""}`, 3);
        break;
      case "ctp":
        this.say(e.dist === 0 ? "Hole in one!" : Number.isFinite(e.dist) ? `${e.dist.toFixed(1)} m` : "No score", `Ball ${e.ball} of ${sim.ctpBalls} · +${e.points}`, 2.5);
        break;
      case "over":
        this.say(sim.opts.mode === "ctp" ? "Challenge over" : e.won ? "Champion!" : "Round over", "", 3);
        break;
      default:
        break;
    }
  }

  update(dt: number) {
    const sim = this.sim;
    const h = sim.hole;
    this.hole.textContent = `Hole ${h.n} · Par ${h.par}`;
    this.holeSub.textContent = `${Math.round(h.length)} m · ${holeName(sim.opts.course, h.n - 1)}`;
    const d = sim.toPin;
    this.shot.textContent = sim.opts.mode === "ctp" ? `Ball ${Math.min(sim.ctpBalls, sim.ctp.length + 1)} of ${sim.ctpBalls} · ${d < 10 ? d.toFixed(1) : Math.round(d)} m to pin` : `Shot ${sim.strokes + 1} · ${d < 10 ? d.toFixed(1) : Math.round(d)} m to pin`;
    if (sim.opts.mode === "ctp") {
      const best = sim.ctp.filter((c) => Number.isFinite(c.dist)).sort((a, b) => a.dist - b.dist)[0];
      this.total.textContent = `Best ${best ? `${best.dist.toFixed(1)} m` : "–"} · ${sim.score()} pts`;
    } else {
      const pos = sim.position();
      const tied = sim.field.filter((p) => !p.you && sim.toPar(p) === sim.toPar()).length > 0;
      this.total.textContent = `Total ${fmtPar(sim.toPar())} · ${tied ? "T" : ""}${pos} of ${sim.field.length} · ${sim.points()} pts`;
    }
    // Club and lie.
    const club = sim.clubDef;
    this.club.textContent = club.putter ? `Putter · ${sim.puttMax} m stroke` : `${club.name} · ${m(yardage(club).carry * (sim.lie === "bunker" ? (club.wedge ? 0.8 : 0.55) : LIES[sim.lie].dist))}`;
    this.clubSub.textContent = `Lie: ${LIES[sim.lie].name}${sim.lie === "rough" || sim.lie === "deep" || sim.lie === "bunker" ? " (costs distance)" : ""}`;
    // Meter: -0.15 … 1.1 across the bar.
    const mt = sim.meter;
    const pos = (v: number) => `${((v + 0.15) / 1.25) * 100}%`;
    const showing = sim.phase === "swing" || sim.phase === "aim";
    this.meter.style.opacity = showing ? "1" : "0.4";
    this.mark.style.left = pos(mt.stage ? mt.value : 0);
    this.fill.style.width = pos(mt.stage === 1 ? mt.value : mt.stage >= 2 ? mt.power : 0);
    this.powerTick.style.left = pos(mt.power);
    this.powerTick.style.opacity = mt.stage >= 2 ? "1" : "0";
    this.bottom.style.opacity = sim.phase === "card" || sim.phase === "over" || sim.phase === "holed" ? "0" : "1";
    // Wind, relative to where you're aiming.
    const w = sim.wind;
    const ws = Math.hypot(w.x, w.z);
    const rel = Math.atan2(w.x, w.z) - sim.aim;
    this.windArrow.style.transform = `rotate(${(-rel * 180) / Math.PI + 0}deg)`;
    this.windText.textContent = `${Math.round(ws * 3.6)} km/h`;
    this.drawMap();
    // Calls.
    if (this.callT > 0) {
      this.callT -= dt;
      if (this.callT <= 0) this.call.style.opacity = "0";
    }
    if (this.chipT > 0) {
      this.chipT -= dt;
      if (this.chipT <= 0) this.chip.style.opacity = "0";
    }
    const cardOn = sim.phase === "card";
    if (cardOn !== this.cardShown) {
      this.cardShown = cardOn;
      this.card.style.display = cardOn ? "grid" : "none";
      if (cardOn) this.buildCard();
    }
  }

  private drawMap() {
    const sim = this.sim;
    const lm = this.lieMap();
    if (!lm) return;
    const W = this.map.width;
    const H = this.map.height;
    if (this.mapFor !== sim.holeIdx || !this.mapBase) {
      this.mapFor = sim.holeIdx;
      const base = document.createElement("canvas");
      base.width = W;
      base.height = H;
      const g = base.getContext("2d")!;
      const cw = lm.canvas.width;
      const ch = lm.canvas.height;
      const s = Math.min(W / cw, H / ch);
      const ox = (W - cw * s) / 2;
      const oy = (H - ch * s) / 2;
      g.fillStyle = "#1a2a14";
      g.fillRect(0, 0, W, H);
      g.save();
      // Tee at the bottom, as you see it from behind the ball: +z runs up and +x to the left.
      g.translate(W - ox, H - oy);
      g.scale(-s, -s);
      g.drawImage(lm.canvas, 0, 0);
      g.restore();
      this.mapBase = base;
      this.mapT = { s, ox, oy, x0: lm.x0, z0: lm.z0, res: lm.res };
    }
    const g = this.map.getContext("2d")!;
    g.drawImage(this.mapBase, 0, 0);
    const t = this.mapT;
    const px = (x: number) => W - (t.ox + ((x - t.x0) / t.res) * t.s);
    const py = (z: number) => H - (t.oy + ((z - t.z0) / t.res) * t.s);
    const h = sim.hole;
    const b = sim.ball.p;
    const pv = sim.preview();
    // Line and landing spot.
    g.strokeStyle = "rgba(255,255,255,0.85)";
    g.setLineDash([3, 3]);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(px(b.x), py(b.z));
    g.lineTo(px(pv.x), py(pv.z));
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.arc(px(pv.x), py(pv.z), 3.5, 0, Math.PI * 2);
    g.stroke();
    // Pin.
    g.fillStyle = "#facc15";
    g.beginPath();
    g.arc(px(h.pin.x), py(h.pin.z), 2.5, 0, Math.PI * 2);
    g.fill();
    // Ball.
    g.fillStyle = "#ffffff";
    g.strokeStyle = "#000000";
    g.beginPath();
    g.arc(px(b.x), py(b.z), 2.8, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }

  private buildCard() {
    const sim = this.sim;
    const holes = sim.holes;
    const me = sim.field[0];
    const cell = (t: string | number, cls = "") => el("td", `px-1.5 py-0.5 text-center tabular-nums ${cls}`, String(t));
    const row = (label: string, vals: (string | number)[], cls = "") => el("tr", cls, el("th", "px-1.5 py-0.5 text-left font-semibold", label), ...vals.map((v) => cell(v)));
    const scores = holes.map((_, i) => me.card[i] ?? "");
    const table = el(
      "table",
      "w-full text-xs",
      el("tbody", "", row("Hole", holes.map((hh) => hh.n), "text-white/60"), row("Par", holes.map((hh) => hh.par), "text-white/60"), row("You", scores, "font-black"), row("Pts", holes.map((hh, i) => (me.card[i] === undefined ? "" : stableford(me.card[i], hh.par))), "text-[#facc15]")),
    );
    const board = el(
      "ol",
      "mt-3 grid gap-0.5 text-sm",
      ...sim
        .standings()
        .slice(0, 8)
        .map((p, i) => el("li", `flex justify-between rounded px-2 py-0.5 ${p.you ? "bg-[#facc15]/20 font-black" : ""}`, el("span", "", `${i + 1}. ${p.you ? "You" : p.name}`), el("span", "tabular-nums", fmtPar(sim.toPar(p))))),
    );
    const last = me.card.length;
    this.card.replaceChildren(
      el(
        "div",
        "pointer-events-auto w-full max-w-md overflow-x-auto rounded-xl border border-white/15 bg-[#0b1410]/95 p-4",
        el("p", "text-[11px] font-bold uppercase tracking-[0.3em] text-[#facc15]", `After ${last} ${last === 1 ? "hole" : "holes"}`),
        el("p", "font-display text-2xl font-black uppercase", `${fmtPar(sim.toPar())} · ${sim.points()} points`),
        el("div", "mt-2 overflow-x-auto", table),
        board,
        el("p", "mt-3 text-center text-xs text-white/60", last >= holes.length ? "Press Space or tap to finish" : "Press Space or tap for the next hole"),
      ),
    );
  }

  destroy() {
    this.root.remove();
  }
}
