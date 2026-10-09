import { useEffect, useRef, useState } from "react";
import type { PartyId } from "../data";
import { MAP_H, MAP_W, type Country } from "../map";
import * as G from "../sim";
import type { MapMode } from "../game";

const K = 3;
const LAND = [216, 216, 216];
const COUNTED = [46, 157, 59];
const PASTEL = ["#f4c7c3", "#c8d8f5", "#d5ecd0", "#f8e3b7", "#e2d0f2", "#cdeee9", "#f6d1e4", "#e9e4c9", "#d2dcef", "#f0d5c0", "#dfe9c4", "#cfd3f7", "#f7dcd0", "#d8efe0", "#ece0f5", "#f3ecc2"];

const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** Labels upscaled K times, and which upscaled pixels are county or state borders. */
interface Raster {
  lab: Int16Array;
  edge: Uint8Array;
  w: number;
  h: number;
}
const rasters = new Map<string, Raster>();
function raster(c: Country): Raster {
  let r = rasters.get(c.key);
  if (r) return r;
  const w = MAP_W * K;
  const h = MAP_H * K;
  const lab = new Int16Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) lab[y * w + x] = c.labels[((y / K) | 0) * MAP_W + ((x / K) | 0)];
  const edge = new Uint8Array(w * h);
  for (let y = 0; y < h - 1; y++)
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      const a = lab[i];
      if (a < 0) continue;
      const b = lab[i + 1];
      const d = lab[i + w];
      if ((b >= 0 && b !== a) || (d >= 0 && d !== a)) {
        const sa = c.sections[a].state;
        const st = (b >= 0 && c.sections[b].state !== sa) || (d >= 0 && c.sections[d].state !== sa);
        edge[i] = st ? 2 : 1;
      } else if (b < 0 || d < 0) edge[i] = 3;
    }
  r = { lab, edge, w, h };
  rasters.set(c.key, r);
  return r;
}

export interface MapProps {
  s: G.GameState;
  mode: MapMode;
  selected: number | null;
  onSelect: (state: number) => void;
  /** Election count 0–1 (or null when no count is running). */
  count: number | null;
}

/** Colour per county for the current mode (or the election count). */
function colours(props: MapProps): number[][] {
  const { s, mode, count } = props;
  const c = G.country(s);
  const P = G.partyDefs(s).length;
  const pal = G.partyDefs(s).map((p) => rgb(p.color));
  const e = s.election;
  if (e && count !== null) {
    const n = e.order.length;
    const out = c.sections.map(() => LAND);
    // First the counties report (green), then the results come up in the same order.
    const greenUpTo = Math.floor(Math.min(1, count / 0.45) * n);
    const colourUpTo = Math.floor(Math.max(0, (count - 0.45) / 0.55) * n);
    for (let k = 0; k < greenUpTo; k++) out[e.order[k]] = COUNTED;
    for (let k = 0; k < colourUpTo; k++) {
      const id = e.order[k];
      let w = 0;
      let second = 0;
      for (let i = 1; i < P; i++) if (e.shares[id * P + i] > e.shares[id * P + w]) w = i;
      for (let i = 0; i < P; i++) if (i !== w && e.shares[id * P + i] > second) second = e.shares[id * P + i];
      const margin = e.shares[id * P + w] - second;
      out[id] = mix([248, 248, 248], pal[w], Math.min(1, 0.35 + margin * 2.2));
    }
    return out;
  }
  if (mode === "states") return c.sections.map((sec) => rgb(PASTEL[sec.state % PASTEL.length]).map((v, i) => (props.selected === sec.state ? Math.round(v * 0.82) : v + 0 * i)));
  if (mode === "support") {
    const me = G.pidx(s, s.party);
    return c.sections.map((sec) => {
      const sh = G.sharesIn(s, sec.id)[me];
      return mix([250, 250, 250], pal[me].every((v) => v > 230) ? [70, 70, 70] : pal[me], Math.min(1, sh * 2.4));
    });
  }
  return c.sections.map((sec) => {
    const sh = G.sharesIn(s, sec.id);
    let w = 0;
    sh.forEach((v, i) => (v > sh[w] ? (w = i) : 0));
    const second = Math.max(...sh.filter((_, i) => i !== w));
    return mix([245, 245, 245], pal[w], Math.min(1, 0.3 + (sh[w] - second) * 2.2));
  });
}

export function MapView(props: MapProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const off = useRef<HTMLCanvasElement | null>(null);
  const view = useRef({ x: 0, y: 0, z: 1, fitted: false });
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; sec: number } | null>(null);
  const [, setTick] = useState(0);
  const c = G.country(props.s);

  // Paint the counties into the offscreen map whenever the colours change.
  const key = `${props.mode}|${props.selected}|${props.count === null ? "x" : Math.round(props.count * 200)}|${props.s.week}|${props.s.election ? 1 : 0}`;
  const painted = useRef("");
  const paint = () => {
    if (painted.current === key && off.current) return;
    painted.current = key;
    const r = raster(c);
    let cv = off.current;
    if (!cv) {
      cv = document.createElement("canvas");
      cv.width = r.w;
      cv.height = r.h;
      off.current = cv;
    }
    const g = cv.getContext("2d")!;
    const img = g.createImageData(r.w, r.h);
    const d = new Uint32Array(img.data.buffer);
    const cols = colours(props).map((v) => (255 << 24) | (v[2] << 16) | (v[1] << 8) | v[0]);
    const white = (255 << 24) | (250 << 16) | (250 << 8) | 250;
    const stateLine = (255 << 24) | (90 << 16) | (90 << 8) | 90;
    const coast = (255 << 24) | (60 << 16) | (60 << 8) | 60;
    for (let i = 0; i < r.lab.length; i++) {
      const l = r.lab[i];
      if (l < 0) {
        d[i] = 0;
        continue;
      }
      const e = r.edge[i];
      d[i] = e === 0 ? cols[l] : e === 1 ? white : e === 2 ? stateLine : coast;
    }
    g.putImageData(img, 0, 0);
  };

  // Draw the map with pan and zoom, and the state names (repainting the counties if they changed).
  useEffect(() => {
    paint();
    const cv = ref.current;
    const src = off.current;
    if (!cv || !src) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(rect.width * dpr));
    cv.height = Math.max(1, Math.round(rect.height * dpr));
    const v = view.current;
    if (!v.fitted && rect.width > 10) {
      // Fit the land (not the whole sea) into the view.
      let x0 = MAP_W, y0 = MAP_H, x1 = 0, y1 = 0;
      for (let i = 0; i < c.labels.length; i++) {
        if (c.labels[i] < 0) continue;
        const x = i % MAP_W, y = (i / MAP_W) | 0;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      if (x1 <= x0) [x0, y0, x1, y1] = [0, 0, MAP_W, MAP_H];
      const bw = x1 - x0 + 24, bh = y1 - y0 + 24;
      v.z = Math.min(rect.width / bw, rect.height / bh) * 0.92;
      v.x = rect.width / 2 - ((x0 + x1) / 2) * v.z;
      v.y = rect.height / 2 - ((y0 + y1) / 2) * v.z;
      v.fitted = true;
    }
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The sea: a lighter shelf near the coast is drawn as a soft glow under the land.
    g.fillStyle = "#3b8fe0";
    g.fillRect(0, 0, rect.width, rect.height);
    g.imageSmoothingEnabled = true;
    g.save();
    g.shadowColor = "#7fc1f5";
    g.shadowBlur = 18;
    g.drawImage(src, v.x, v.y, MAP_W * v.z, MAP_H * v.z);
    g.restore();
    // State names (and the capital).
    if (props.count === null) {
      g.textAlign = "center";
      g.font = `900 ${Math.max(9, Math.min(15, v.z * 4))}px system-ui, sans-serif`;
      for (const st of c.states) {
        const x = v.x + st.cx * v.z;
        const y = v.y + st.cy * v.z;
        g.fillStyle = "#ffffffcc";
        g.fillText(st.name.toUpperCase(), x + 1, y + 1);
        g.fillStyle = props.selected === st.id ? "#111" : "#444";
        g.fillText(st.name.toUpperCase(), x, y);
      }
      const cap = c.sections[c.capital];
      g.fillStyle = "#c62828";
      g.beginPath();
      g.arc(v.x + cap.cx * v.z, v.y + cap.cy * v.z + 8, 3.5, 0, Math.PI * 2);
      g.fill();
    }
  });

  const at = (cx: number, cy: number) => {
    const v = view.current;
    const x = Math.floor((cx - v.x) / v.z);
    const y = Math.floor((cy - v.y) / v.z);
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return -1;
    return c.labels[y * MAP_W + x];
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const sec = hover && hover.sec >= 0 ? c.sections[hover.sec] : null;
  const shares = sec ? G.sharesIn(props.s, sec.id) : null;
  return (
    <>
      <canvas
        ref={ref}
        data-testid="yg-map"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { ...local(e), moved: false };
        }}
        onPointerMove={(e) => {
          const p = local(e);
          const d = drag.current;
          if (d) {
            if (Math.hypot(p.x - d.x, p.y - d.y) > 3) d.moved = true;
            if (d.moved) {
              view.current.x += p.x - d.x;
              view.current.y += p.y - d.y;
              d.x = p.x;
              d.y = p.y;
              setTick((t) => t + 1);
            }
          }
          setHover({ ...p, sec: at(p.x, p.y) });
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) {
            const p = local(e);
            const id = at(p.x, p.y);
            if (id >= 0) props.onSelect(c.sections[id].state);
          }
        }}
        onPointerLeave={() => setHover(null)}
        onWheel={(e) => {
          const p = local(e);
          const v = view.current;
          const k = Math.exp(-e.deltaY * 0.0015);
          const z = Math.min(12, Math.max(0.6, v.z * k));
          v.x = p.x - ((p.x - v.x) * z) / v.z;
          v.y = p.y - ((p.y - v.y) * z) / v.z;
          v.z = z;
          setTick((t) => t + 1);
        }}
      />
      {sec && shares && props.count === null && (
        <div style={{ position: "absolute", left: hover!.x + 14, top: hover!.y + 10, pointerEvents: "none", background: "#4a4a4aee", color: "#fff", borderRadius: 7, padding: "5px 8px", fontWeight: 800, fontSize: 11.5, minWidth: 150 }}>
          <div>
            {sec.town} {sec.city ? "🏙️" : ""}
          </div>
          <div style={{ opacity: 0.75, fontWeight: 700 }}>
            {c.states[sec.state].name} · {(sec.pop / 1000).toFixed(0)}k people
          </div>
          {(G.ids(props.s).map((id, i) => [id, shares[i]]) as [PartyId, number][])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([id, v]) => (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span className="yg-sw" style={{ background: G.party(props.s, id).color }} />
                {G.party(props.s, id).short} <span style={{ marginLeft: "auto" }}>{Math.round(v * 100)}%</span>
              </div>
            ))}
        </div>
      )}
      {props.count === null && props.mode === "politics" && (
        <div className="yg-legend">
          {G.partyDefs(props.s).filter((p) => !p.noRun).map((p) => (
            <span key={p.id} style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <span className="yg-sw" style={{ background: p.color }} /> {p.short}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
