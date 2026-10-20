/**
 * The world map. Two ways to draw the ground: the NextX Engine's 3D relief (relief.ts: the real
 * terrain raised and lit, a sea, clouds, a camera that tilts as you zoom in) or a flat 2D map
 * (painted relief, a cached political layer zoomed out, vector territories zoomed in). Over
 * either, the same interface layer: cities, nation names, armies, fleets and air wings as
 * counters, their paths, battles, sieges and strikes, all placed through `toScreen`.
 */
import { UNITS } from "./data";
import { Relief } from "./relief";
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
  private layerScale = 0.5;
  private layerKey = "";
  private layerAt = -1;
  private labels: { x: number; y: number; size: number; name: string; nation: number }[] = [];
  /** The NextX 3D relief, when it's on (and loaded). */
  relief: Relief | null = null;
  private reliefCanvas: HTMLCanvasElement | null = null;
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
    readonly small: boolean,
  ) {
    this.ctx = canvas.getContext("2d")!;
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
    this.layer = this.makeLayer(0.5);
  }

  private makeLayer(scale: number) {
    this.layerScale = scale;
    this.layerKey = "";
    const c = document.createElement("canvas");
    c.width = Math.round(this.world.w * scale);
    c.height = Math.round(this.world.h * scale);
    return c;
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

  /* ------------------------------------------------------------------ the 3D relief */

  get is3D() {
    return !!this.relief?.ready;
  }

  /** Turn the NextX 3D relief on or off (off: the flat map). */
  setRelief(on: boolean) {
    if (on === !!this.relief) return;
    if (!on) {
      this.relief?.dispose();
      this.relief = null;
      this.reliefCanvas?.remove();
      this.reliefCanvas = null;
      this.layer = this.makeLayer(0.5);
      return;
    }
    try {
      const c = document.createElement("canvas");
      c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
      c.setAttribute("aria-hidden", "true");
      this.canvas.parentElement?.insertBefore(c, this.canvas);
      this.reliefCanvas = c;
      this.layer = this.makeLayer(this.small ? 0.5 : 1);
      this.relief = new Relief(c, this.world, this.layer, this.small);
      this.relief.setSize(this.w, this.h, this.dpr);
      this.relief.load().catch(() => this.setRelief(false));
    } catch {
      this.relief = null;
      this.reliefCanvas?.remove();
      this.reliefCanvas = null;
    }
  }

  dispose() {
    this.setRelief(false);
  }

  /* ------------------------------------------------------------------ the camera */

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = Math.min(dpr, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.relief?.setSize(w, h, dpr);
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
    if (this.is3D) this.relief!.place(c);
  }
  toMap(sx: number, sy: number) {
    if (this.is3D) return this.relief!.unproject(sx, sy);
    return { x: this.cam.x + (sx - this.w / 2) / this.cam.zoom, y: this.cam.y + (sy - this.h / 2) / this.cam.zoom };
  }
  /** A map point (lifted `lift` map px) on screen, with the local scale `k` (screen px per map px). */
  toScreen(x: number, y: number, lift = 0) {
    if (this.is3D) return this.relief!.project(x, y, lift);
    const z = this.cam.zoom;
    return { x: (x - this.cam.x) * z + this.w / 2, y: (y - this.cam.y) * z + this.h / 2 - lift * z, k: z, behind: false };
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
  /** Drag the map under the finger from one screen point to another. */
  pan(fromX: number, fromY: number, toX: number, toY: number) {
    const a = this.toMap(fromX, fromY);
    const b = this.toMap(toX, toY);
    // Near the horizon a pixel is a long way: keep a drag sensible.
    const most = (Math.hypot(toX - fromX, toY - fromY) / this.cam.zoom) * 4 + 1;
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d > most) {
      dx *= most / d;
      dy *= most / d;
    }
    this.cam.x += dx;
    this.cam.y += dy;
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

  /** Redraw the political layer when borders, colours, the map mode (or, in 3D, the selection) change. */
  private refreshLayer(s: State) {
    let h = 0;
    for (const c of s.cities) h = (Math.imul(h, 31) + c.owner + 1) | 0;
    for (const n of s.nations) h = (Math.imul(h, 17) + n.color.length + n.alliance + (n.formed ? 7 : 0)) | 0;
    for (const a of s.alliances) h = (Math.imul(h, 13) + a.members.length) | 0;
    const relief = !!this.relief;
    const key = `${this.mode}|${h}|${s.nations.length}|${this.terrain ? 1 : 0}|${relief ? `${this.selectedCity},${this.highlight}` : ""}`;
    if (key === this.layerKey) return false;
    // Borders shift often in a big war: redraw at most a few times a second.
    if (this.layerKey && this.t - this.layerAt < 0.35 && key.split("|").slice(-1)[0] === this.layerKey.split("|").slice(-1)[0]) return false;
    this.layerKey = key;
    this.layerAt = this.t;
    const g = this.layer.getContext("2d")!;
    const sc = this.layerScale;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.layer.width, this.layer.height);
    g.setTransform(sc, 0, 0, sc, 0, 0);
    if (this.mode !== "terrain") {
      g.globalAlpha = relief ? 0.5 : 0.62;
      s.cities.forEach((c, i) => {
        g.fillStyle = this.fillOf(s, c.owner);
        g.fill(this.shapes[i].path, "evenodd");
      });
      g.globalAlpha = 1;
    }
    this.strokeBorders(g, s, null, 1 / sc, relief);
    if (relief) {
      if (this.highlight >= 0) {
        g.fillStyle = "rgba(255,224,102,.3)";
        g.strokeStyle = "#ffe066";
        g.lineWidth = 2 / sc;
        s.cities.forEach((c, i) => {
          if (c.owner !== this.highlight) return;
          g.fill(this.shapes[i].path, "evenodd");
          g.stroke(this.shapes[i].path);
        });
      }
      if (this.selectedCity >= 0) {
        g.strokeStyle = "#ffe066";
        g.lineWidth = 2.6 / sc;
        g.stroke(this.shapes[this.selectedCity].path);
      }
    }
    this.computeLabels(s);
    return true;
  }

  private strokeBorders(g: CanvasRenderingContext2D, s: State, view: { x0: number; y0: number; x1: number; y1: number } | null, px: number, cities = false) {
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
      const target = e.a === 0 ? coast : s.cities[e.a - 1].owner !== s.cities[e.b - 1].owner ? nationLine : view || cities ? cityLine : null;
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
    if (view || cities) {
      g.strokeStyle = "rgba(255,255,255,.28)";
      g.lineWidth = (cities ? 0.45 : 0.6) * px;
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
    const { ctx } = this;
    const changed = this.refreshLayer(s);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.is3D) {
      if (changed) this.relief!.layerChanged();
      this.relief!.place(this.cam);
      this.relief!.render(this.t);
      ctx.clearRect(0, 0, this.w, this.h);
    } else this.drawFlat(s);
    this.drawOverlay(s, dt);
  }

  /** The flat map: painted relief, then the nations (cached zoomed out, vector zoomed in). */
  private drawFlat(s: State) {
    const { ctx, cam, world } = this;
    const z = cam.zoom;
    ctx.fillStyle = "#16365c";
    ctx.fillRect(0, 0, this.w, this.h);
    const view = { x0: cam.x - this.w / 2 / z, y0: cam.y - this.h / 2 / z, x1: cam.x + this.w / 2 / z, y1: cam.y + this.h / 2 / z };
    ctx.save();
    ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * (this.w / 2 - cam.x * z), this.dpr * (this.h / 2 - cam.y * z));
    if (this.terrain) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.terrain, 0, 0, world.w, world.h);
    }
    if (z < 1.1) ctx.drawImage(this.layer, 0, 0, world.w, world.h);
    else {
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
    if (this.selectedCity >= 0) {
      ctx.strokeStyle = "#ffe066";
      ctx.lineWidth = 2.4 / z;
      ctx.stroke(this.shapes[this.selectedCity].path);
    }
    ctx.restore();
  }

  private onScreen(p: { x: number; y: number; behind: boolean }, m = 30) {
    return !p.behind && p.x > -m && p.y > -m && p.x < this.w + m && p.y < this.h + m;
  }

  /** Everything on top of the ground, in screen space. */
  private drawOverlay(s: State, dt: number) {
    const { ctx } = this;
    this.drawCities(s);
    this.drawPaths(s);
    this.drawArmies(s);
    this.drawStrikes(s);
    if (this.ping) {
      const pg = this.ping;
      pg.t += dt;
      const p = this.toScreen(pg.x, pg.y);
      ctx.strokeStyle = pg.color;
      ctx.globalAlpha = Math.max(0, 1 - pg.t * 1.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 + pg.t * 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (pg.t > 0.7) this.ping = null;
    }
    this.drawLabels(s);
    // The NextX grade: a soft vignette.
    const vg = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.45, this.w / 2, this.h / 2, Math.hypot(this.w, this.h) * 0.62);
    vg.addColorStop(0, "rgba(4,6,18,0)");
    vg.addColorStop(1, "rgba(4,6,18,.32)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.w, this.h);
    if (this.box) {
      const b = this.box;
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.lineWidth = 1;
      ctx.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      ctx.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }
  }

  private drawCities(s: State) {
    const { ctx, world } = this;
    for (const c of s.cities) {
      const wc = world.cities[c.id];
      const p = this.toScreen(wc.x, wc.y);
      if (!this.onScreen(p)) continue;
      const big = wc.pop > 2e6;
      const isCap = s.nations[c.owner].capital === c.id;
      if (p.k < 0.45 && !isCap) continue;
      if (p.k < 0.8 && !isCap && !big) continue;
      const r = (isCap ? 3.6 : big ? 2.8 : 2.2) * Math.max(0.5, Math.min(1.15, p.k / 0.6));
      ctx.fillStyle = isCap ? "#ffd84d" : "#ffffff";
      ctx.strokeStyle = "rgba(15,18,26,.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (isCap) star(ctx, p.x, p.y, r * 1.3, r * 0.55);
      else ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Siege: a ring that fills as the city falls.
      if (c.capture) {
        ctx.strokeStyle = s.nations[c.capture.by].color;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 3.5, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(100, c.capture.progress)) / 100);
        ctx.stroke();
      }
      if (c.build && c.owner === s.player && p.k > 0.9) {
        ctx.fillStyle = "#7fd4ff";
        ctx.beginPath();
        ctx.arc(p.x + r * 1.4, p.y - r * 1.4, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawPaths(s: State) {
    const { ctx } = this;
    ctx.setLineDash([4, 3]);
    for (const a of s.armies) {
      if (a.owner !== s.player || (!a.path.length && !a.order)) continue;
      const sel = this.selected.has(a.id);
      if (!sel && this.cam.zoom < 0.7) continue;
      ctx.strokeStyle = sel ? "rgba(255,240,140,.95)" : "rgba(255,255,255,.45)";
      ctx.lineWidth = sel ? 1.8 : 1.1;
      ctx.beginPath();
      let p = this.toScreen(a.x, a.y);
      ctx.moveTo(p.x, p.y);
      const air = UNITS[a.kind].domain === "air";
      if (air && a.order) {
        p = this.toScreen(a.order.x, a.order.y);
        ctx.lineTo(p.x, p.y);
      }
      for (let k = 0; k < a.path.length; k += 2) {
        p = this.toScreen(a.path[k], a.path[k + 1]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      if (air && a.order && sel) {
        const o = this.toScreen(a.order.x, a.order.y);
        ctx.beginPath();
        ctx.arc(o.x, o.y, 12 * o.k, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  private drawArmies(s: State) {
    const { ctx } = this;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const a of s.armies) {
      const d = UNITS[a.kind];
      if (d.domain === "strike") continue;
      // Aircraft fly above the ground.
      const p = this.toScreen(a.x, a.y, d.domain === "air" ? 4 : 0);
      if (!this.onScreen(p)) continue;
      const n = s.nations[a.owner];
      const mine = a.owner === s.player;
      const sel = this.selected.has(a.id);
      if (p.k < 0.75) {
        if (!mine && unitCount(a) < 2 && p.k < 0.4) continue;
        ctx.fillStyle = n.color;
        ctx.strokeStyle = sel ? "#ffe066" : "rgba(10,12,18,.9)";
        ctx.lineWidth = sel ? 2 : 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (d.domain === "land" ? 2.6 : 2.2) * (mine ? 1.2 : 1), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        continue;
      }
      const w = 26;
      const h = 15;
      const x = p.x - w / 2;
      const y = p.y - h / 2;
      if (a.fighting > 0) {
        ctx.fillStyle = `rgba(255,80,40,${0.35 + 0.25 * Math.sin(this.t * 10)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(10,12,20,.85)";
      roundRect(ctx, x - 1, y - 1, w + 2, h + 2, 4.5);
      ctx.fill();
      ctx.fillStyle = n.color;
      roundRect(ctx, x, y, w, h, 4);
      ctx.fill();
      if (sel || mine) {
        ctx.strokeStyle = sel ? "#ffe066" : "rgba(255,255,255,.85)";
        ctx.lineWidth = sel ? 2.2 : 1;
        roundRect(ctx, x, y, w, h, 4);
        ctx.stroke();
      }
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(d.icon, x + 7.5, p.y + 0.5);
      ctx.fillStyle = "#fff";
      ctx.font = "700 9.5px system-ui, sans-serif";
      ctx.fillText(String(shownCount(a)), x + 19, p.y + 0.5);
      // Strength bar under damaged stacks.
      const frac = unitCount(a) % 1;
      if (frac > 0.05) {
        ctx.fillStyle = "rgba(0,0,0,.6)";
        ctx.fillRect(x, y + h + 1.5, w, 2);
        ctx.fillStyle = frac > 0.5 ? "#55e08a" : "#ffb347";
        ctx.fillRect(x, y + h + 1.5, w * frac, 2);
      }
    }
  }

  private drawStrikes(s: State) {
    const { ctx } = this;
    for (const st of s.strikes) {
      const span = Math.hypot(st.x - st.x0, st.y - st.y0);
      const at = (u: number) => this.toScreen(st.x0 + (st.x - st.x0) * u, st.y0 + (st.y - st.y0) * u, Math.sin(u * Math.PI) * span * 0.25);
      ctx.strokeStyle = st.kind === "nuke" ? "rgba(255,90,60,.9)" : "rgba(255,220,120,.9)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const start = at(0);
      ctx.moveTo(start.x, start.y);
      for (let i = 1; i <= 24 * st.t; i++) {
        const p = at(i / 24);
        ctx.lineTo(p.x, p.y);
      }
      const head = at(st.t);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(head.x, head.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (st.t > 0.92) {
        const hit = this.toScreen(st.x, st.y);
        ctx.fillStyle = st.kind === "nuke" ? "rgba(255,240,200,.85)" : "rgba(255,160,60,.8)";
        ctx.beginPath();
        ctx.arc(hit.x, hit.y, (st.kind === "nuke" ? 18 : 6) * (st.t - 0.9) * 10 * hit.k, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawLabels(s: State) {
    const { ctx, world } = this;
    const z = this.cam.zoom;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    // Nation names, fading out as you zoom in on cities.
    if (z < 2.2) {
      for (const l of this.labels) {
        const p = this.toScreen(l.x, l.y);
        if (!this.onScreen(p, 0)) continue;
        const px = l.size * p.k;
        if (px < 7) continue;
        const size = Math.min(34, px);
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
        const p = this.toScreen(wc.x, wc.y);
        if (!this.onScreen(p, 0)) continue;
        const isCap = s.nations[c.owner].capital === c.id;
        if (p.k < 1.6 && !isCap && wc.pop < 1.5e6) continue;
        if (p.k < 0.8) continue;
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
      const dom = UNITS[a.kind].domain;
      if (dom === "strike") continue;
      const p = this.toScreen(a.x, a.y, dom === "air" ? 4 : 0);
      if (p.behind) continue;
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
      if (p.behind) continue;
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
