import { useEffect, useRef } from "react";
import * as G from "../sim";

const SKIN = ["#f1d0b5", "#e0b08e", "#c58c62", "#a26a43", "#7a4b2e", "#f6dcc8"];
const HAIR = ["#2b2118", "#5a3a22", "#a8722f", "#d9b25a", "#8a8a8a", "#ece6dc", "#b2462c", "#1d1d1d"];

export function looks(face: number) {
  return { skin: SKIN[face % SKIN.length], hair: HAIR[Math.floor(face / 7) % HAIR.length], long: Math.floor(face / 53) % 3 === 0, glasses: Math.floor(face / 101) % 5 === 0 };
}

/** A small head-and-shoulders portrait. */
export function Portrait({ s, p, size = 28 }: { s: G.GameState; p: G.Politician | undefined; size?: number }) {
  if (!p) return <span style={{ width: size, height: size, display: "inline-block" }} />;
  const l = looks(p.face);
  const col = G.party(s, p.party).color;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden style={{ flex: "none", borderRadius: 6, background: "#cfcfcf" }}>
      <path d="M4 32c1-8 6-11 12-11s11 3 12 11z" fill="#2d3340" />
      <path d="M14 21l2 7 2-7z" fill={col} />
      {l.long && <rect x="8" y="9" width="16" height="15" rx="6" fill={l.hair} />}
      <circle cx="16" cy="13" r="7" fill={l.skin} />
      <path d={l.long ? "M9 12c0-6 14-6 14 0c-2-3-12-3-14 0z" : "M9 12c0-6 14-7 14 0c-3-3-11-3-14 0z"} fill={l.hair} />
      {l.glasses && <path d="M10.5 13h4m3 0h4" stroke="#222" strokeWidth="1.4" />}
    </svg>
  );
}

interface Props {
  s: G.GameState;
  house: "house" | "senate";
  /** How each member voted, if a vote is being shown. */
  votes: Record<number, number> | null;
}

/** The chamber: rows of desks in a horseshoe, every member at their seat, the Speaker in front. */
export function Chamber({ s, house, votes }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = cv.getBoundingClientRect();
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width;
    const H = rect.height;
    // Floor.
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#d9d9d9");
    bg.addColorStop(1, "#efefef");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // Seat everyone by party, left to right round the horseshoe (closest parties together).
    const members = (house === "house" ? s.house : s.senate).map((id) => G.pol(s, id)!).filter(Boolean);
    const order = [...G.ids(s)].sort((a, b) => G.party(s, a).pos.e - G.party(s, b).pos.e);
    members.sort((a, b) => order.indexOf(a.party) - order.indexOf(b.party) || a.id - b.id);
    const rows = Math.max(3, Math.min(9, Math.round(Math.sqrt(members.length / 11))));
    const cx = W / 2;
    const cy = H * 0.9;
    // Fit the outer row inside the canvas (the seats sit on an ellipse 1.5 wide by 0.78 tall).
    const outer = 150 + (rows - 1) * 62;
    const scale = Math.min((W / 2 - 24) / (outer * 1.5), (cy - 50) / (outer * 0.78), members.length > 150 ? 1.4 : 1.8);
    const r0 = 150 * scale;
    const gap = 62 * scale;
    // Seats per row in proportion to its length.
    const lens = Array.from({ length: rows }, (_, k) => r0 + k * gap);
    const tot = lens.reduce((a, b) => a + b, 0);
    let left = members.length;
    const per = lens.map((l, k) => {
      const n = k === rows - 1 ? left : Math.round((members.length * l) / tot);
      left -= n;
      return n;
    });
    const seats: { x: number; y: number; a: number; m: G.Politician }[] = [];
    let mi = 0;
    // Fill seats angle by angle across all rows so each party gets a wedge.
    const slots: { k: number; j: number; a: number }[] = [];
    per.forEach((n, k) => {
      for (let j = 0; j < n; j++) slots.push({ k, j, a: Math.PI * (0.06 + (0.88 * (j + 0.5)) / n) });
    });
    slots.sort((p, q) => q.a - p.a);
    for (const sl of slots) {
      const m = members[mi++];
      if (!m) break;
      const rr = lens[sl.k];
      seats.push({ x: cx + Math.cos(sl.a) * rr * 1.5, y: cy - Math.sin(sl.a) * rr * 0.78, a: sl.a, m });
    }
    // Back rows first.
    seats.sort((p, q) => p.y - q.y);
    for (const st of seats) {
      const k = scale * 1.05;
      const l = looks(st.m.face);
      const v = votes ? votes[st.m.id] : undefined;
      // The member: body, tie in party colour, head.
      g.fillStyle = "#2d3340";
      g.beginPath();
      g.ellipse(st.x, st.y - 10 * k, 9 * k, 10 * k, 0, Math.PI, 0);
      g.fill();
      g.fillStyle = G.party(s, st.m.party).color;
      g.fillRect(st.x - 1.6 * k, st.y - 18 * k, 3.2 * k, 9 * k);
      if (l.long) {
        g.fillStyle = l.hair;
        g.beginPath();
        g.ellipse(st.x, st.y - 24 * k, 7.5 * k, 8.5 * k, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = l.skin;
      g.beginPath();
      g.arc(st.x, st.y - 26 * k, 6.2 * k, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = l.hair;
      g.beginPath();
      g.arc(st.x, st.y - 28 * k, 6.4 * k, Math.PI * 1.05, Math.PI * 1.95);
      g.fill();
      if (st.m.you) {
        g.strokeStyle = "#f5b335";
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(st.x, st.y - 26 * k, 9 * k, 0, Math.PI * 2);
        g.stroke();
      }
      // The desk in front, with a paper (or the vote card).
      g.fillStyle = "#fbfbfb";
      g.strokeStyle = "#c9c9c9";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(st.x - 13 * k, st.y - 6 * k);
      g.lineTo(st.x + 13 * k, st.y - 6 * k);
      g.lineTo(st.x + 15 * k, st.y + 6 * k);
      g.lineTo(st.x - 15 * k, st.y + 6 * k);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = "#e6e6e6";
      g.fillRect(st.x - 15 * k, st.y + 6 * k, 30 * k, 6 * k);
      if (v !== undefined) {
        g.fillStyle = v > 0 ? "#3f9b4a" : v < 0 ? "#c0392b" : "#9e9e9e";
        g.fillRect(st.x - 4 * k, st.y - 4 * k, 8 * k, 7 * k);
      } else {
        g.strokeStyle = "#8a8a8a";
        g.strokeRect(st.x - 3 * k, st.y - 3 * k, 6 * k, 5 * k);
      }
    }
    // The Speaker's bench.
    const bw = 220 * scale;
    g.fillStyle = "#4a4a4a";
    for (let i = 0; i < 4; i++) {
      const x = cx - bw / 2 + (i + 0.5) * (bw / 4);
      g.fillStyle = "#2d3340";
      g.beginPath();
      g.ellipse(x, cy - 2 * scale, 10 * scale, 11 * scale, 0, Math.PI, 0);
      g.fill();
      const l = looks(9000 + i * 37);
      g.fillStyle = l.skin;
      g.beginPath();
      g.arc(x, cy - 18 * scale, 7 * scale, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = l.hair;
      g.beginPath();
      g.arc(x, cy - 20 * scale, 7.2 * scale, Math.PI * 1.05, Math.PI * 1.95);
      g.fill();
    }
    g.fillStyle = "#f7f7f7";
    g.strokeStyle = "#c5c5c5";
    g.fillRect(cx - bw / 2 - 10, cy + 2 * scale, bw + 20, 22 * scale);
    g.strokeRect(cx - bw / 2 - 10, cy + 2 * scale, bw + 20, 22 * scale);
  });
  return <canvas ref={ref} data-testid="yg-chamber" style={{ background: "#e6e6e6" }} />;
}
