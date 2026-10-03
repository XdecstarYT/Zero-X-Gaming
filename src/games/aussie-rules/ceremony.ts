import { button, el } from "../sports-kit/ui";
import type { Club } from "./clubs";

/**
 * The premiership presentation after a Grand Final: fireworks and ticker tape
 * in the winners' colours, the cup, the flag, the Grand Final Medal for the
 * best on ground and every premiership player called up for a medal. If you
 * lost, you watch the other mob get theirs.
 */

export interface CeremonyOptions {
  year: number;
  winner: Club;
  loser: Club;
  /** Final scores, winner first, as "12.10 (82)". */
  scores: [string, string];
  /** Points at each break, winner first. */
  quarters?: [number, number][];
  /** Best on ground. */
  medal?: { name: string; line: string };
  /** The premiership side. */
  team: string[];
  /** Did you win it? */
  ours: boolean;
  /** "Coached by …", or a captain. */
  byline?: string;
  /** Margin in points (for the headline). */
  margin: number;
  onDone: () => void;
}

const CUP = (a: string, b: string) => `
<svg viewBox="0 0 120 150" class="h-full w-full drop-shadow-[0_0_24px_rgba(250,204,21,0.6)]" aria-hidden="true">
  <defs><linearGradient id="cupg" x1="0" x2="1"><stop offset="0" stop-color="#8a6512"/><stop offset=".45" stop-color="#fde68a"/><stop offset="1" stop-color="#a16207"/></linearGradient></defs>
  <path d="M30 18h60c0 34-10 52-30 56-20-4-30-22-30-56z" fill="url(#cupg)"/>
  <path d="M30 26c-14 0-18 8-16 16 3 10 12 13 20 13M90 26c14 0 18 8 16 16-3 10-12 13-20 13" fill="none" stroke="url(#cupg)" stroke-width="6"/>
  <rect x="54" y="72" width="12" height="28" fill="url(#cupg)"/>
  <path d="M36 100h48l6 18H30z" fill="url(#cupg)"/>
  <rect x="26" y="118" width="68" height="12" rx="2" fill="#5b4310"/>
  <path d="M44 74 34 140l12-6 6 10 6-60z" fill="${a}"/><path d="M76 74l10 66-12-6-6 10-6-60z" fill="${b}"/>
</svg>`;

const MEDAL = `<svg viewBox="0 0 40 52" class="h-12 w-10" aria-hidden="true"><path d="M10 0h8l4 16h-8zM22 0h8l-4 16h-8z" fill="#b91c1c"/><circle cx="20" cy="34" r="16" fill="#facc15" stroke="#a16207" stroke-width="3"/><path d="M20 24l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#a16207"/></svg>`;

export function premiershipCeremony(host: HTMLElement, o: CeremonyOptions) {
  const w = o.winner;
  const overlay = el("div", "absolute inset-0 z-30 overflow-hidden bg-black text-white");
  overlay.setAttribute("data-testid", "footy-ceremony");
  overlay.style.background = `radial-gradient(circle at 50% 30%, ${w.guernsey} 0, #05070c 70%)`;
  const canvas = el("canvas", "pointer-events-none absolute inset-0 h-full w-full");
  overlay.append(canvas);
  const scroll = el("div", "relative flex h-full flex-col items-center gap-3 overflow-auto p-4 pb-10 text-center");
  overlay.append(scroll);

  const rise = (n: HTMLElement, delay: number) => {
    n.style.opacity = "0";
    n.animate([{ opacity: 0, transform: "translateY(18px) scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: 700, delay, fill: "forwards", easing: "cubic-bezier(.2,.8,.2,1)" });
    return n;
  };
  const kicker = el("p", "text-[11px] font-bold uppercase tracking-[0.5em] text-[#facc15]", `${o.year} Grand Final`);
  const title = el("p", "font-display text-5xl font-black uppercase italic leading-none tracking-tight sm:text-7xl", o.ours ? "PREMIERS!" : "Runners-up");
  title.style.textShadow = `0 4px 0 ${w.hoop}, 0 0 40px ${w.guernsey}`;
  const club = el("p", "font-display text-2xl font-black uppercase sm:text-3xl", o.ours ? `${w.name}` : `${w.name} win the flag`);
  const cup = el("div", "h-40 w-32 sm:h-52 sm:w-40");
  cup.innerHTML = CUP(w.guernsey, w.hoop);
  cup.animate([{ transform: "translateY(0) rotate(-2deg)" }, { transform: "translateY(-8px) rotate(2deg)" }], { duration: 1600, iterations: Infinity, direction: "alternate", easing: "ease-in-out" });
  const flag = el("div", "w-full max-w-md rounded-md px-3 py-2 font-display text-lg font-black uppercase tracking-[0.2em]", `${w.short} · ${o.year} PREMIERS`);
  flag.style.background = `repeating-linear-gradient(90deg, ${w.guernsey} 0 18%, ${w.hoop} 18% 22%)`;
  flag.style.color = "#ffffff";
  flag.style.textShadow = "0 2px 0 #000, 0 0 8px #000";
  flag.animate([{ transform: "skewY(-2deg)" }, { transform: "skewY(2deg)" }], { duration: 900, iterations: Infinity, direction: "alternate", easing: "ease-in-out" });
  const score = el(
    "div",
    "w-full max-w-md rounded-xl border border-white/15 bg-black/50 p-3 text-sm",
    el("div", "flex justify-between font-bold", el("span", "", w.name), el("span", "tabular-nums", o.scores[0])),
    el("div", "flex justify-between text-white/70", el("span", "", o.loser.name), el("span", "tabular-nums", o.scores[1])),
    ...(o.quarters?.length
      ? [
          el(
            "div",
            "mt-2 grid grid-cols-4 gap-1 text-[11px] text-white/60",
            ...o.quarters.map((q, i) => el("div", "rounded bg-white/5 py-0.5", el("p", "uppercase tracking-wider", ["QT", "HT", "3QT", "FT"][i]), el("p", "tabular-nums text-white", `${q[0]}–${q[1]}`))),
          ),
        ]
      : []),
    el("p", "mt-2 text-xs text-[#facc15]", o.margin === 0 ? "Level at the siren: they go again." : `By ${o.margin} point${o.margin === 1 ? "" : "s"}${o.margin <= 6 ? ": an all-time classic" : o.margin >= 60 ? ": a demolition" : ""}`),
  );
  const medal = o.medal
    ? el(
        "div",
        "flex w-full max-w-md items-center gap-3 rounded-xl border border-[#facc15]/50 bg-[#facc15]/10 p-3 text-left",
        Object.assign(el("div", "shrink-0"), { innerHTML: MEDAL }),
        el("div", "min-w-0", el("p", "text-[10px] font-bold uppercase tracking-[0.3em] text-[#facc15]", "Grand Final Medal · best on ground"), el("p", "truncate font-display text-xl font-black uppercase", o.medal.name), el("p", "text-xs text-white/70", o.medal.line)),
      )
    : el("span");
  medal.setAttribute("data-testid", "footy-gf-medal");
  const team = el(
    "div",
    "w-full max-w-md rounded-xl border border-white/10 bg-black/40 p-3 text-left",
    el("p", "mb-1 text-[10px] font-bold uppercase tracking-[0.3em] text-white/60", "The premiership team · medals presented"),
    el("ol", "grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs", ...o.team.map((n, i) => rise(el("li", "truncate", `🏅 ${n}`), 2600 + i * 90))),
  );
  const line = el("p", "max-w-md text-sm italic text-white/80", o.ours ? `“${o.byline ? `${o.byline}. ` : ""}Up there with the best days of our lives.” The players carry the cup on a lap of honour while the club song booms around the ground.` : `The siren goes and your players sink to the turf. ${w.name} climb the dais. You'll be back.`);
  const done = button("Continue", "mt-2 rounded-md bg-[#facc15] px-8 py-3 font-display font-black uppercase tracking-[0.2em] text-black hover:brightness-110", () => {
    cancelAnimationFrame(raf);
    overlay.remove();
    o.onDone();
  });
  done.setAttribute("data-testid", "footy-ceremony-done");
  scroll.append(rise(kicker, 100), rise(title, 300), rise(club, 600), rise(cup, 900), rise(flag, 1200), rise(score, 1500), rise(medal, 1900), rise(team, 2300), rise(line, 2600), done);
  host.append(overlay);

  // Ticker tape and fireworks.
  const g = canvas.getContext("2d");
  const cols = [w.guernsey, w.hoop, "#ffffff", "#facc15"];
  const paper = Array.from({ length: o.ours ? 220 : 90 }, () => ({ x: Math.random(), y: -Math.random(), vx: (Math.random() - 0.5) * 0.04, vy: 0.05 + Math.random() * 0.09, r: Math.random() * 6, s: 4 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)] }));
  type Spark = { x: number; y: number; vx: number; vy: number; life: number; c: string };
  const sparks: Spark[] = [];
  let next = 0;
  let last = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    if (!overlay.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const W = (canvas.width = canvas.clientWidth);
    const H = (canvas.height = canvas.clientHeight);
    if (g && W && H) {
      g.clearRect(0, 0, W, H);
      next -= dt;
      if (next <= 0 && o.ours) {
        next = 0.5 + Math.random() * 0.7;
        const cx = 0.15 + Math.random() * 0.7;
        const cy = 0.12 + Math.random() * 0.3;
        const c = cols[Math.floor(Math.random() * cols.length)];
        for (let i = 0; i < 60; i++) {
          const a = (i / 60) * Math.PI * 2;
          const sp = 0.12 + Math.random() * 0.18;
          sparks.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.4, c });
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= dt;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        s.vy += 0.08 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        g.globalAlpha = Math.min(1, s.life);
        g.fillStyle = s.c;
        g.fillRect(s.x * W, s.y * H, 3, 3);
      }
      g.globalAlpha = 1;
      for (const p of paper) {
        p.y += p.vy * dt;
        p.x += p.vx * dt + Math.sin(now / 600 + p.r) * 0.0006;
        p.r += dt * 4;
        if (p.y > 1.05) {
          p.y = -0.05;
          p.x = Math.random();
        }
        g.save();
        g.translate(p.x * W, p.y * H);
        g.rotate(p.r);
        g.fillStyle = p.c;
        g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        g.restore();
      }
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return overlay;
}
