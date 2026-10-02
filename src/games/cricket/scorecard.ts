import { el } from "../sports-kit/ui";
import { ROPE, type Innings } from "./sim";
import type { Team } from "./teams";

/**
 * The full scorecard for an innings, the way the papers print it: every
 * batter (how out, runs, balls, fours, sixes, strike rate), extras and the
 * total, the bowling figures, and the wagon wheel of every scoring shot.
 */
export function scorecard(inn: Innings, bat: Team, bowl: Team, overs: (balls: number) => string) {
  const th = (t: string, left = false) => el("th", `px-1 py-0.5 font-semibold text-white/50 ${left ? "text-left" : "text-right"}`, t);
  const td = (t: string | number, cls = "") => el("td", `px-1 py-0.5 text-right tabular-nums ${cls}`, String(t));
  const batRows = inn.cards.map((c, i) => {
    const p = bat.players[i];
    const batted = c.balls > 0 || !!c.out || i === inn.striker || i === inn.nonStriker;
    if (!batted) return null;
    const how = c.out ?? "not out";
    return el(
      "tr",
      c.out ? "" : "text-[#facc15]",
      el("td", "py-0.5 pr-1 text-left", el("span", "font-semibold", p.name), el("span", "block text-[10px] text-white/50", how)),
      td(c.runs, "font-black"),
      td(c.balls),
      td(c.fours),
      td(c.sixes),
      td(c.balls ? ((c.runs / c.balls) * 100).toFixed(0) : "–", "text-white/60"),
    );
  });
  const dnb = inn.cards
    .map((c, i) => (c.balls > 0 || c.out || i === inn.striker || i === inn.nonStriker ? null : bat.players[i].name.split(" ").slice(-1)[0]))
    .filter(Boolean);
  const batting = el(
    "table",
    "w-full text-xs",
    el("thead", "", el("tr", "", th("Batter", true), th("R"), th("B"), th("4s"), th("6s"), th("SR"))),
    el("tbody", "", ...batRows.filter((r): r is HTMLTableRowElement => !!r)),
  );
  const bowlRows = [...inn.bowl.entries()]
    .filter(([, b]) => b.balls > 0 || b.runs > 0)
    .map(([i, b]) => el("tr", "", el("td", "py-0.5 pr-1 text-left font-semibold", bowl.players[i].name), td(overs(b.balls)), td(b.runs), td(b.wkts, "font-black"), td(b.balls ? ((b.runs / b.balls) * 6).toFixed(1) : "–", "text-white/60")));
  const bowling = el("table", "w-full text-xs", el("thead", "", el("tr", "", th("Bowler", true), th("O"), th("R"), th("W"), th("Econ"))), el("tbody", "", ...bowlRows));
  const wrap = el(
    "div",
    "grid gap-3 text-left sm:grid-cols-[1fr_9rem]",
    el(
      "div",
      "min-w-0",
      batting,
      el("p", "mt-1 text-[11px] text-white/60", `Extras ${inn.extras} · Total ${inn.runs}/${inn.wkts} (${overs(inn.balls)} ov)${dnb.length ? ` · Did not bat: ${dnb.join(", ")}` : ""}`),
      el("div", "mt-2", bowling),
    ),
    el("div", "flex flex-col items-center gap-1", wagonWheel(inn, bat), el("p", "text-[10px] uppercase tracking-wider text-white/50", "Wagon wheel")),
  );
  wrap.setAttribute("data-testid", "cricket-scorecard");
  return wrap;
}

/** Every scoring shot from the bat: ones and twos white, fours blue, sixes purple. */
export function wagonWheel(inn: Innings, bat: Team, size = 144) {
  const c = el("canvas", "rounded-full");
  c.width = c.height = size * 2;
  c.style.width = c.style.height = `${size}px`;
  c.setAttribute("aria-label", `Wagon wheel: ${inn.shots.length} scoring shots`);
  c.setAttribute("role", "img");
  const g = c.getContext("2d");
  if (!g) return c;
  const R = size - 6;
  const cx = size;
  const cy = size;
  g.fillStyle = "#1f5f2c";
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, R * 0.45, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#c9b27a";
  g.fillRect(cx - 4, cy - 24, 8, 48);
  // The bat end at the bottom of the pitch strip; up the screen is toward the bowler.
  const ox = cx;
  const oy = cy + 18;
  for (const s of inn.shots) {
    const nx = s.x / ROPE.rx;
    const nz = (s.z - ROPE.cz) / ROPE.rz;
    const k = Math.min(1.05, Math.hypot(nx, nz)) / Math.max(1e-6, Math.hypot(nx, nz));
    // Off side (−x) to the left, as the broadcast shows it.
    const px = cx + nx * k * R;
    const py = cy - nz * k * R;
    g.strokeStyle = s.runs === 6 ? "#c084fc" : s.runs === 4 ? "#38bdf8" : "rgba(255,255,255,0.8)";
    g.lineWidth = s.runs >= 4 ? 3 : 2;
    g.beginPath();
    g.moveTo(ox, oy);
    g.lineTo(px, py);
    g.stroke();
  }
  g.fillStyle = bat.shirt;
  g.beginPath();
  g.arc(ox, oy, 5, 0, Math.PI * 2);
  g.fill();
  return c;
}
