/**
 * The world map on a 2D canvas: painted relief, nations in their colours with crisp borders,
 * cities, nation names, armies, fleets and air wings as counters, their paths, battles, sieges
 * and strikes. Zoomed out it draws a cached political layer; zoomed in, vector territories.
 */
import { UNITS } from "./data";
import { shownCount, unitCount, type Army, type State } from "./state";
import type { World } from "./world";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface CityShape {
  path: Path2D;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const LAYER_SCALE = 0.5;

export class MapView {
  readonly ctx: CanvasRenderingContext2D;
  cam: Camera = { x: 2048, y: 900, zoom: 0.3 };
  w = 1;
  h = 1;
  dpr = 1;
  private terrain: HTMLImageElement | null = null;
  private shapes: CityShape[] = [];
  private edgeBox: Float32Array;
  private layer: HTMLCanvasElement;
  private layerKey = "";
  private labels: { x: number; y: number; size: number; name: string; nation: number }[] = [];
  selected = new Set<number>();
  selectedCity = -1;
  /** A nation outlined in gold (the country picker). */
  highlight = -1;
  /** A drag box being drawn (screen px). */
  box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** A tap ripple to show where an order went. */
  ping: { x: number; y: number; t: number; color: string } | null = null;
  mode: "political" | "terrain" | "alliances" = "political";
  t = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly world: World,
    small: boolean,
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    const img = new Image();
    img.decoding = "async";
    img.src = small ? "/sovereign/terrain-s.webp" : "/sovereign/terrain.webp";
    img.onload = () => {
      this.terrain = img;
      this.layerKey = "";
    };
    this.buildShapes();
    this.edgeBox = new Float32Array(world.edges.length * 4);
    world.edges.forEach((e, i) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let k = 0; k < e.pts.length; k += 2) {
        x0 = Math.min(x0, e.pts[k]);
        x1 = Math.max(x1, e.pts[k]);
        y0 = Math.min(y0, e.pts[k + 1]);
        y1 = Math.max(y1, e.pts[k + 1]);
      }
      this.edgeBox.set([x0, y0, x1, y1], i * 4);
    });
    this.layer = document.createElement("canvas");
    this.layer.width = Math.round(world.w * LAYER_SCALE);
    this.layer.height = Math.round(world.h * LAYER_SCALE);
  }

  /** Chain each city's border edges into closed rings (holes and islands fill even-odd). */
  private buildShapes() {
    const { world } = this;
    const byCity: number[][] = world.cities.map(() => []);
    world.edges.forEach((e, i) => {
      if (e.a > 0) byCity[e.a - 1].push(i);
      if (e.b > 0 && e.b !== e.a) byCity[e.b - 1].push(i);
    });
    const key = (x: number, y: number) => `${x},${y}`;
    this.shapes = world.cities.map((_, ci) => {
      const path = new Path2D();
      const list = byCity[ci];
      const used = new Set<number>();
      const ends = new Map<string, number[]>();
      for (const ei of list) {
        const p = world.edges[ei].pts;
        for (const k of [key(p[0], p[1]), key(p[p.length - 2], p[p.length - 1])]) {
          let l = ends.get(k);
          if (!l) ends.set(k, (l = []));
          l.push(ei);
        }
      }
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const start of list) {
        if (used.has(start)) continue;
        used.add(start);
        let p = world.edges[start].pts;
        path.moveTo(p[0], p[1]);
        for (let k = 2; k < p.length; k += 2) path.lineTo(p[k], p[k + 1]);
        let ex = p[p.length - 2];
        let ey = p[p.length - 1];
        const sx = p[0];
        const sy = p[1];
        for (let guard = 0; guard < 4000 && (ex !== sx || ey !== sy); guard++) {
          const next = (ends.get(key(ex, ey)) ?? []).find((j) => !used.has(j));
          if (next === undefined) break;
          used.add(next);
          p = world.edges[next].pts;
          const fwd = p[0] === ex && p[1] === ey;
          if (fwd) for (let k = 2; k < p.length; k += 2) path.lineTo(p[k], p[k + 1]);
          else for (let k = p.length - 4; k >= 0; k -= 2) path.lineTo(p[k], p[k + 1]);
          ex = fwd ? p[p.length - 2] : p[0];
          ey = fwd ? p[p.length - 1] : p[1];
        }
        path.closePath();
      }
      for (const ei of list) {
        const p = world.edges[ei].pts;
        for (let k = 0; k < p.length; k += 2) {
          x0 = Math.min(x0, p[k]);
          x1 = Math.max(x1, p[k]);
          y0 = Math.min(y0, p[k + 1]);
          y1 = Math.max(y1, p[k + 1]);
        }
      }
      return { path, x0, y0, x1, y1 };
    });
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = Math.min(dpr, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.clampCam();
  }

  get minZoom() {
    return Math.max(this.w / this.world.w, this.h / this.world.h);
  }
  clampCam() {
    const c = this.cam;
    c.zoom = Math.max(this.minZoom, Math.min(14, c.zoom));
    const hw = this.w / 2 / c.zoom;
    const hh = this.h / 2 / c.zoom;
    c.x = Math.max(hw, Math.min(this.world.w - hw, c.x));
    c.y = Math.max(hh, Math.min(this.world.h - hh, c.y));
  }
  toMap(sx: number, sy: number) {
    return { x: this.cam.x + (sx - this.w / 2) / this.cam.zoom, y: this.cam.y + (sy - this.h / 2) / this.cam.zoom };
  }
  toScreen(x: number, y: number) {
    return { x: (x - this.cam.x) * this.cam.zoom + this.w / 2, y: (y - this.cam.y) * this.cam.zoom + this.h / 2 };
  }
  zoomAt(sx: number, sy: number, k: number) {
    const before = this.toMap(sx, sy);
    this.cam.zoom *= k;
    this.clampCam();
    const after = this.toMap(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCam();
  }
  /** Fly the camera to a spot (and zoom, if asked). */
  focus(x: number, y: number, zoom?: number) {
    this.cam.x = x;
    this.cam.y = y;
    if (zoom) this.cam.zoom = zoom;
    this.clampCam();
  }

  /* ------------------------------------------------------------------ colours */

  private fillOf(s: State, owner: number) {
    const n = s.nations[owner];
    if (this.mode === "alliances") {
      const al = s.alliances.find((a) => a.id === n.alliance);
      if (al) return al.color;
      if (n.overlord >= 0) return s.nations[n.overlord].color;
      return "#9aa1ad";
    }
    return n.color;
  }

  /** Rebuild the zoomed-out layer when borders or the map mode change. */
  private refreshLayer(s: State) {
    let h = 0;
    for (const c of s.cities) h = (Math.imul(h, 31) + c.owner + 1) | 0;
    for (const n of s.nations) h = (Math.imul(h, 17) + n.color.length + n.alliance + (n.formed ? 7 : 0)) | 0;
    for (const a of s.alliances) h = (Math.imul(h, 13) + a.members.length) | 0;
    const key = `${this.mode}|${h}|${s.nations.length}|${this.terrain ? 1 : 0}`;
    if (key === this.layerKey) return;
    this.layerKey = key;
    const g = this.layer.getContext("2d")!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.layer.width, this.layer.height);
    g.setTransform(LAYER_SCALE, 0, 0, LAYER_SCALE, 0, 0);
    if (this.mode !== "terrain") {
      g.globalAlpha = 0.62;
      s.cities.forEach((c, i) => {
        g.fillStyle = this.fillOf(s, c.owner);
        g.fill(this.shapes[i].path, "evenodd");
      });
      g.globalAlpha = 1;
    }
    this.strokeBorders(g, s, null, 1 / LAYER_SCALE);
    this.computeLabels(s);
  }

  private strokeBorders(g: CanvasRenderingContext2D, s: State, view: { x0: number; y0: number; x1: number; y1: number } | null, px: number) {
    const { world } = this;
    const nationLine = new Path2D();
    const cityLine = new Path2D();
    const coast = new Path2D();
    for (let i = 0; i < world.edges.length; i++) {
      if (view) {
        const b = i * 4;
        if (this.edgeBox[b + 2] < view.x0 || this.edgeBox[b] > view.x1 || this.edgeBox[b + 3] < view.y0 || this.edgeBox[b + 1] > view.y1) continue;
      }
      const e = world.edges[i];
      const target = e.a === 0 ? coast : s.cities[e.a - 1].owner !== s.cities[e.b - 1].owner ? nationLine : view ? cityLine : null;
      if (!target) continue;
      const p = e.pts;
      target.moveTo(p[0], p[1]);
      for (let k = 2; k < p.length; k += 2) target.lineTo(p[k], p[k + 1]);
    }
    g.lineJoin = "round";
    g.lineCap = "round";
    g.strokeStyle = "rgba(30,36,48,.45)";
    g.lineWidth = 0.7 * px;
    g.stroke(coast);
    if (view) {
      g.strokeStyle = "rgba(255,255,255,.28)";
      g.lineWidth = 0.6 * px;
      g.stroke(cityLine);
    }
    g.strokeStyle = "rgba(18,20,28,.8)";
    g.lineWidth = 1.3 * px;
    g.stroke(nationLine);
  }

  /** Nation names, sized by their land, at the middle of what they hold. */
  private computeLabels(s: State) {
    const acc = new Map<number, { x: number; y: number; a: number; big: number; bx: number; by: number }>();
    s.cities.forEach((c) => {
      const wc = this.world.cities[c.id];
      const a = wc.area + 4;
      let o = acc.get(c.owner);
      if (!o) acc.set(c.owner, (o = { x: 0, y: 0, a: 0, big: 0, bx: wc.x, by: wc.y }));
      o.x += wc.x * a;
      o.y += wc.y * a;
      o.a += a;
      if (a > o.big) {
        o.big = a;
        o.bx = wc.x;
        o.by = wc.y;
      }
    });
    this.labels = [];
    for (const [n, o] of acc) {
      let x = o.x / o.a;
      let y = o.y / o.a;
      // Scattered empires: name them where most of the land is.
      const ci = this.cityNear(x, y);
      if (ci < 0 || s.cities[ci].owner !== n) {
        x = o.bx;
        y = o.by;
      }
      this.labels.push({ x, y, size: Math.max(4, Math.min(60, Math.sqrt(o.a) * 0.22)), name: s.nations[n].name, nation: n });
    }
  }

  private cityNear(x: number, y: number) {
    const g = this.world.grid;
    const gx = Math.max(0, Math.min(g.w - 1, Math.floor(x / g.cell)));
    const gy = Math.max(0, Math.min(g.h - 1, Math.floor(y / g.cell)));
    return g.data[gy * g.w + gx] - 1;
  }

  /* ------------------------------------------------------------------ drawing */

  draw(s: State, dt: number) {
    this.t += dt;
    const { ctx, cam, world } = this;
    const z = cam.zoom;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#16365c";
    ctx.fillRect(0, 0, this.w, this.h);
    const view = { x0: cam.x - this.w / 2 / z, y0: cam.y - this.h / 2 / z, x1: cam.x + this.w / 2 / z, y1: cam.y + this.h / 2 / z };
    // Map space.
    ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * (this.w / 2 - cam.x * z), this.dpr * (this.h / 2 - cam.y * z));
    if (this.terrain) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.terrain, 0, 0, world.w, world.h);
    }
    this.refreshLayer(s);
    const near = z >= 1.1;
    if (!near) {
      ctx.drawImage(this.layer, 0, 0, world.w, world.h);
    } else {
      if (this.mode !== "terrain") {
        ctx.globalAlpha = 0.55;
        s.cities.forEach((c, i) => {
          const sh = this.shapes[i];
          if (sh.x1 < view.x0 || sh.x0 > view.x1 || sh.y1 < view.y0 || sh.y0 > view.y1) return;
          ctx.fillStyle = this.fillOf(s, c.owner);
          ctx.fill(sh.path, "evenodd");
        });
        ctx.globalAlpha = 1;
      }
      this.strokeBorders(ctx, s, view, 1 / z);
    }
    if (this.highlight >= 0) {
      ctx.fillStyle = "rgba(255,224,102,.28)";
      ctx.strokeStyle = "#ffe066";
      ctx.lineWidth = 2 / z;
      s.cities.forEach((c, i) => {
        if (c.owner !== this.highlight) return;
        ctx.fill(this.shapes[i].path, "evenodd");
        ctx.stroke(this.shapes[i].path);
      });
    }
    // The selected city glows.
    if (this.selectedCity >= 0) {
      ctx.strokeStyle = "#ffe066";
      ctx.lineWidth = 2.4 / z;
      ctx.stroke(this.shapes[this.selectedCity].path);
    }
    this.drawCities(s, view);
    this.drawPaths(s);
    this.drawArmies(s, view);
    this.drawStrikes(s);
    if (this.ping) {
      const p = this.ping;
      p.t += dt;
      const r = (6 + p.t * 30) / z;
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - p.t * 1.6);
      ctx.lineWidth = 2 / z;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (p.t > 0.7) this.ping = null;
    }
    // Screen space: names on top.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawLabels(s, view);
    if (this.box) {
      const b = this.box;
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.lineWidth = 1;
      ctx.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      ctx.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }
  }

  private drawCities(s: State, view: { x0: number; y0: number; x1: number; y1: number }) {
    const { ctx, world } = this;
    const z = this.cam.zoom;
    for (const c of s.cities) {
      const wc = world.cities[c.id];
      if (wc.x < view.x0 - 5 || wc.x > view.x1 + 5 || wc.y < view.y0 - 5 || wc.y > view.y1 + 5) continue;
      const big = wc.pop > 2e6;
      const isCap = s.nations[c.owner].capital === c.id;
      if (z < 0.45 && !isCap) continue;
      if (z < 0.8 && !isCap && !big) continue;
      const r = (isCap ? 3.4 : big ? 2.6 : 2) / Math.max(0.6, z * 0.9);
      ctx.fillStyle = isCap ? "#ffd84d" : "#ffffff";
      ctx.strokeStyle = "rgba(15,18,26,.9)";
      ctx.lineWidth = 1 / z;
      ctx.beginPath();
      if (isCap) star(ctx, wc.x, wc.y, r * 1.3, r * 0.55);
      else ctx.arc(wc.x, wc.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Siege: a ring that fills as the city falls.
      if (c.capture) {
        ctx.strokeStyle = s.nations[c.capture.by].color;
        ctx.lineWidth = 2.4 / z;
        ctx.beginPath();
        ctx.arc(wc.x, wc.y, r + 3 / z, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(100, c.capture.progress)) / 100);
        ctx.stroke();
      }
      if (c.build && c.owner === s.player && z > 0.9) {
        ctx.fillStyle = "#7fd4ff";
        ctx.beginPath();
        ctx.arc(wc.x + r * 1.4, wc.y - r * 1.4, 1.6 / z, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawPaths(s: State) {
    const { ctx } = this;
    const z = this.cam.zoom;
    ctx.setLineDash([4 / z, 3 / z]);
    for (const a of s.armies) {
      if (a.owner !== s.player || (!a.path.length && !a.order)) continue;
      const sel = this.selected.has(a.id);
      if (!sel && z < 0.7) continue;
      ctx.strokeStyle = sel ? "rgba(255,240,140,.95)" : "rgba(255,255,255,.45)";
      ctx.lineWidth = (sel ? 1.8 : 1.1) / z;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      if (UNITS[a.kind].domain === "air" && a.order) ctx.lineTo(a.order.x, a.order.y);
      for (let k = 0; k < a.path.length; k += 2) ctx.lineTo(a.path[k], a.path[k + 1]);
      ctx.stroke();
      if (UNITS[a.kind].domain === "air" && a.order && sel) {
        ctx.beginPath();
        ctx.arc(a.order.x, a.order.y, 12, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  private drawArmies(s: State, view: { x0: number; y0: number; x1: number; y1: number }) {
    const { ctx } = this;
    const z = this.cam.zoom;
    const full = z >= 0.75;
    // Counters keep a steady size on screen.
    const k = 1 / z;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const a of s.armies) {
      const d = UNITS[a.kind];
      if (d.domain === "strike") continue;
      if (a.x < view.x0 - 10 || a.x > view.x1 + 10 || a.y < view.y0 - 10 || a.y > view.y1 + 10) continue;
      const n = s.nations[a.owner];
      const mine = a.owner === s.player;
      const sel = this.selected.has(a.id);
      if (!full) {
        if (!mine && unitCount(a) < 2 && z < 0.4) continue;
        ctx.fillStyle = n.color;
        ctx.strokeStyle = sel ? "#ffe066" : "rgba(10,12,18,.9)";
        ctx.lineWidth = (sel ? 2 : 1) * k;
        ctx.beginPath();
        ctx.arc(a.x, a.y, (d.domain === "land" ? 2.6 : 2.2) * k * (mine ? 1.2 : 1), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        continue;
      }
      const w = 26 * k;
      const h = 15 * k;
      const x = a.x - w / 2;
      const y = a.y - h / 2;
      if (a.fighting > 0) {
        ctx.fillStyle = `rgba(255,80,40,${0.35 + 0.25 * Math.sin(this.t * 10)})`;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 15 * k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(10,12,20,.85)";
      roundRect(ctx, x - 1 * k, y - 1 * k, w + 2 * k, h + 2 * k, 4.5 * k);
      ctx.fill();
      ctx.fillStyle = n.color;
      roundRect(ctx, x, y, w, h, 4 * k);
      ctx.fill();
      if (sel || mine) {
        ctx.strokeStyle = sel ? "#ffe066" : "rgba(255,255,255,.85)";
        ctx.lineWidth = (sel ? 2.2 : 1) * k;
        roundRect(ctx, x, y, w, h, 4 * k);
        ctx.stroke();
      }
      ctx.font = `${10 * k}px system-ui, sans-serif`;
      ctx.fillText(d.icon, x + 7.5 * k, a.y + 0.5 * k);
      ctx.fillStyle = "#fff";
      ctx.font = `700 ${9.5 * k}px system-ui, sans-serif`;
      ctx.fillText(String(shownCount(a)), x + 19 * k, a.y + 0.5 * k);
      // Strength bar under damaged stacks.
      const frac = unitCount(a) % 1;
      if (frac > 0.05) {
        ctx.fillStyle = "rgba(0,0,0,.6)";
        ctx.fillRect(x, y + h + 1.5 * k, w, 2 * k);
        ctx.fillStyle = frac > 0.5 ? "#55e08a" : "#ffb347";
        ctx.fillRect(x, y + h + 1.5 * k, w * frac, 2 * k);
      }
    }
  }

  private drawStrikes(s: State) {
    const { ctx } = this;
    const z = this.cam.zoom;
    for (const st of s.strikes) {
      const t = st.t;
      const x = st.x0 + (st.x - st.x0) * t;
      const y = st.y0 + (st.y - st.y0) * t - Math.sin(t * Math.PI) * Math.hypot(st.x - st.x0, st.y - st.y0) * 0.25;
      ctx.strokeStyle = st.kind === "nuke" ? "rgba(255,90,60,.9)" : "rgba(255,220,120,.9)";
      ctx.lineWidth = 1.5 / z;
      ctx.beginPath();
      ctx.moveTo(st.x0, st.y0);
      const steps = 16;
      for (let i = 1; i <= steps * t; i++) {
        const u = i / steps;
        ctx.lineTo(st.x0 + (st.x - st.x0) * u, st.y0 + (st.y - st.y0) * u - Math.sin(u * Math.PI) * Math.hypot(st.x - st.x0, st.y - st.y0) * 0.25);
      }
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, 2.5 / z, 0, Math.PI * 2);
      ctx.fill();
      if (t > 0.92) {
        ctx.fillStyle = st.kind === "nuke" ? "rgba(255,240,200,.85)" : "rgba(255,160,60,.8)";
        ctx.beginPath();
        ctx.arc(st.x, st.y, (st.kind === "nuke" ? 18 : 6) * (t - 0.9) * 10, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawLabels(s: State, view: { x0: number; y0: number; x1: number; y1: number }) {
    const { ctx, world } = this;
    const z = this.cam.zoom;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    // Nation names, fading out as you zoom in on cities.
    if (z < 2.2) {
      for (const l of this.labels) {
        if (l.x < view.x0 || l.x > view.x1 || l.y < view.y0 || l.y > view.y1) continue;
        const px = l.size * z;
        if (px < 7) continue;
        const size = Math.min(34, px);
        const p = this.toScreen(l.x, l.y);
        ctx.font = `800 ${size}px system-ui, sans-serif`;
        ctx.globalAlpha = z > 1.4 ? Math.max(0, (2.2 - z) / 0.8) : 1;
        ctx.strokeStyle = "rgba(10,12,20,.55)";
        ctx.lineWidth = Math.max(2, size / 6);
        const name = size < 11 ? l.name.toUpperCase().slice(0, 14) : l.name.toUpperCase();
        ctx.strokeText(name, p.x, p.y);
        ctx.fillStyle = l.nation === s.player ? "#fff4b8" : "rgba(255,255,255,.92)";
        ctx.fillText(name, p.x, p.y);
      }
      ctx.globalAlpha = 1;
    }
    // City names.
    if (z >= 0.9) {
      ctx.font = `600 ${z > 2 ? 12.5 : 11}px system-ui, sans-serif`;
      for (const c of s.cities) {
        const wc = world.cities[c.id];
        if (wc.x < view.x0 || wc.x > view.x1 || wc.y < view.y0 || wc.y > view.y1) continue;
        const isCap = s.nations[c.owner].capital === c.id;
        if (z < 1.6 && !isCap && wc.pop < 1.5e6) continue;
        const p = this.toScreen(wc.x, wc.y);
        ctx.strokeStyle = "rgba(10,12,20,.75)";
        ctx.lineWidth = 3;
        ctx.strokeText(wc.name, p.x, p.y + 12);
        ctx.fillStyle = "#fff";
        ctx.fillText(wc.name, p.x, p.y + 12);
      }
    }
  }

  /* ------------------------------------------------------------------ picking */

  /** Armies under a screen point (nearest first). */
  armiesAt(s: State, sx: number, sy: number, r = 18) {
    const out: { a: Army; d: number }[] = [];
    for (const a of s.armies) {
      if (UNITS[a.kind].domain === "strike") continue;
      const p = this.toScreen(a.x, a.y);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d <= r) out.push({ a, d });
    }
    return out.sort((x, y) => x.d - y.d).map((x) => x.a);
  }
  /** A city whose dot is under a screen point, or the city whose land it is. */
  cityAt(sx: number, sy: number) {
    let best = -1;
    let bd = 14;
    for (const c of this.world.cities) {
      const p = this.toScreen(c.x, c.y);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < bd) {
        bd = d;
        best = c.id;
      }
    }
    if (best >= 0) return best;
    const m = this.toMap(sx, sy);
    return this.cityNear(m.x, m.y);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, r: number) {
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r : R;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}
