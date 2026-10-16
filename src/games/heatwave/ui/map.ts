import { VEHICLES } from "../data";
import { missionStart, nextStory, TOKENS } from "../missions";
import { isCop } from "../police";
import { player, playerCar, playerPos, type State } from "../state";
import { tracksFor } from "../trams";
import { G } from "../mapdata";
import { BOUNDS, districtAt, districtLabels, groundClass, type City, type Poi } from "../world";

/**
 * The map of Melbourne, painted once onto a canvas from the real map (water, parks, sand, piers,
 * roads, building footprints and tram lines), then drawn as the turning minimap and the phone's full map,
 * with blips on top: you, the mission marker, shops, safehouses, the police, the GPS route.
 */

export const MAP = BOUNDS;
/** Metres a pixel: the ground raster's own cell, so the canvas stays phone-sized. */
const PX = 4;

let base: HTMLCanvasElement | null = null;

export function baseMap(city: City) {
  if (base) return base;
  const W = Math.round((MAP.x1 - MAP.x0) / PX);
  const H = Math.round((MAP.z1 - MAP.z0) / PX);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const img = g.createImageData(W, H);
  const CLS: Record<number, [number, number, number]> = {
    [G.land]: [214, 210, 200],
    [G.grass]: [158, 204, 134],
    [G.sand]: [238, 222, 176],
    [G.sport]: [136, 196, 118],
    [G.paved]: [204, 202, 198],
    [G.ballast]: [186, 178, 168],
    [G.deck]: [178, 143, 104],
  };
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const c0 = groundClass(MAP.x0 + (i + 0.5) * PX, MAP.z0 + (j + 0.5) * PX);
      let col = CLS[c0] ?? CLS[G.land];
      if (c0 >= G.water) {
        const k = Math.min(1, (c0 - G.water) / 6);
        col = [Math.round(84 - k * 50), Math.round(160 - k * 66), Math.round(180 - k * 46)];
      } else if (c0 === G.land && districtAt(MAP.x0 + i * PX, MAP.z0 + j * PX) === "cbd") col = [200, 198, 196];
      const o = (j * W + i) * 4;
      img.data[o] = col[0];
      img.data[o + 1] = col[1];
      img.data[o + 2] = col[2];
      img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const X = (x: number) => (x - MAP.x0) / PX;
  const Z = (z: number) => (z - MAP.z0) / PX;
  // Roads: a casing, then the road.
  const { nodes, segs } = city.roads;
  g.lineCap = "round";
  for (const pass of [0, 1]) {
    for (const s of segs) {
      const A = nodes[s.a];
      const B = nodes[s.b];
      g.strokeStyle = pass ? (s.cls === "boulevard" ? "#fff2c8" : s.cls === "avenue" ? "#ffffff" : s.cls === "lane" ? "#e8e6e0" : "#f6f6f4") : "rgba(60,60,70,0.4)";
      g.lineWidth = Math.max(1, (s.half * 2 + (pass ? 0 : 2.5)) / PX);
      g.beginPath();
      g.moveTo(X(A.x), Z(A.z));
      g.lineTo(X(B.x), Z(B.z));
      g.stroke();
    }
  }
  // Buildings: their real footprints, darker the taller.
  for (const b of city.buildings) {
    const t = Math.min(1, b.h / 120);
    g.fillStyle = `rgba(${Math.round(150 - t * 70)},${Math.round(148 - t * 68)},${Math.round(150 - t * 60)},0.85)`;
    g.beginPath();
    const r = b.ring;
    for (let k = 0; k < r.length; k += 2) (k ? g.lineTo : g.moveTo).call(g, X(r[k]), Z(r[k + 1]));
    g.closePath();
    g.fill();
  }
  // Tram lines: thin green rails down the middle of their roads.
  g.strokeStyle = "rgba(50,140,60,0.8)";
  g.lineWidth = 1;
  for (const t of tracksFor(city)) {
    if (t.dir) continue;
    g.beginPath();
    for (let i = 0; i < t.x.length; i += 3) (i ? g.lineTo : g.moveTo).call(g, X(t.x[i]), Z(t.z[i]));
    g.stroke();
  }
  base = c;
  return c;
}

export interface Blip {
  x: number;
  z: number;
  kind: "goal" | "story" | "shop" | "gun" | "clothes" | "spray" | "home" | "cop" | "heli" | "enemy" | "target" | "waypoint" | "race" | "chop" | "token" | "hospital";
  label?: string;
}

const POI_BLIP: Partial<Record<Poi["kind"], Blip["kind"]>> = {
  gunshop: "gun",
  clothes: "clothes",
  respray: "spray",
  chopshop: "chop",
  hospital: "hospital",
};

/** Everything worth a dot on the map. */
export function blips(s: State, gps: { x: number; z: number }[] | null) {
  void gps;
  const out: Blip[] = [];
  for (const p of s.city.pois) {
    const k = POI_BLIP[p.kind];
    if (k) out.push({ x: p.x, z: p.z, kind: k, label: p.name });
    if (p.kind === "safehouse") out.push({ x: p.x, z: p.z, kind: "home", label: p.name });
  }
  const r = s.story.run;
  if (r?.goal) out.push({ x: r.goal.x, z: r.goal.z, kind: "goal", label: r.text });
  else if (!r) {
    const m = nextStory(s);
    if (m) {
      const st = missionStart(s, m);
      out.push({ x: st.x, z: st.z, kind: "story", label: `${m.name} (${m.lead === "nina" ? "Nina" : "Dex"})` });
    }
  }
  if (r) {
    for (const p of s.peds) if (p.tag.startsWith(`${r.id}:`) && p.state !== "dead" && p.role !== "partner" && (p.hostile || p.role === "gang")) out.push({ x: p.x, z: p.z, kind: "enemy" });
    for (const c of s.cars) if (c.tag.startsWith(`${r.id}:`) && !c.wrecked && c.seats[0] >= 0 && !c.seats.includes(s.player)) out.push({ x: c.x, z: c.z, kind: "target" });
  }
  if (s.wanted.level > 0) {
    for (const c of s.cars) if ((c.ai.mode === "police" || c.ai.mode === "swat") && !c.wrecked) out.push({ x: c.x, z: c.z, kind: VEHICLES[c.kind].air ? "heli" : "cop" });
    for (const p of s.peds) if (isCop(p) && p.car < 0 && p.state === "ok" && p.ai.mode === "cop") out.push({ x: p.x, z: p.z, kind: "cop" });
  }
  if (s.waypoint) out.push({ x: s.waypoint.x, z: s.waypoint.z, kind: "waypoint" });
  return out;
}

const BLIP_COLOR: Record<Blip["kind"], string> = {
  goal: "#ffd23f",
  story: "#ffd23f",
  shop: "#ffffff",
  gun: "#ff6a3d",
  clothes: "#c58bff",
  spray: "#3fd0c9",
  home: "#3ddc84",
  cop: "#2f7bff",
  heli: "#2f7bff",
  enemy: "#ff3b3b",
  target: "#ff3b3b",
  waypoint: "#ff4fa3",
  race: "#ffd23f",
  chop: "#f2b134",
  token: "#ffcc33",
  hospital: "#ff5a5f",
};

const BLIP_GLYPH: Partial<Record<Blip["kind"], string>> = {
  gun: "G",
  clothes: "T",
  spray: "S",
  home: "⌂",
  chop: "$",
  hospital: "+",
  story: "!",
};

export function drawBlip(g: CanvasRenderingContext2D, x: number, y: number, b: Blip, scale = 1, flash = 0) {
  const col = BLIP_COLOR[b.kind];
  g.save();
  g.translate(x, y);
  if (b.kind === "cop" || b.kind === "heli") {
    g.fillStyle = flash > 0.5 ? "#ff3b3b" : "#2f7bff";
    g.beginPath();
    g.arc(0, 0, (b.kind === "heli" ? 5 : 3.6) * scale, 0, Math.PI * 2);
    g.fill();
  } else if (b.kind === "enemy" || b.kind === "target") {
    g.fillStyle = col;
    g.strokeStyle = "rgba(0,0,0,0.6)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(0, 0, (b.kind === "target" ? 5 : 3.6) * scale, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else {
    const glyph = BLIP_GLYPH[b.kind];
    const r = (glyph ? 8 : 6) * scale;
    g.fillStyle = "rgba(10,12,20,0.75)";
    g.beginPath();
    g.arc(0, 0, r + 1.5 * scale, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    if (glyph) {
      g.fillStyle = "#121420";
      g.font = `900 ${Math.round(11 * scale)}px Arial, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(glyph, 0, 0.5 * scale);
    }
  }
  g.restore();
}

/** The player's arrow. */
export function drawPlayer(g: CanvasRenderingContext2D, x: number, y: number, rot: number, scale = 1) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = "#ffffff";
  g.strokeStyle = "#121420";
  g.lineWidth = 2 * scale;
  g.beginPath();
  g.moveTo(0, -9 * scale);
  g.lineTo(6.5 * scale, 7 * scale);
  g.lineTo(0, 3.5 * scale);
  g.lineTo(-6.5 * scale, 7 * scale);
  g.closePath();
  g.stroke();
  g.fill();
  g.restore();
}

/**
 * Draw the minimap: the map turned so your view's heading is up, centred on you.
 * `size` is the canvas's CSS size; `range` metres from the centre to the edge.
 */
export function drawMinimap(g: CanvasRenderingContext2D, s: State, size: number, dpr: number, yaw: number, gps: { x: number; z: number }[] | null, t: number) {
  const W = size * dpr;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, W);
  const pos = playerPos(s);
  const car = playerCar(s);
  const sp = car ? Math.hypot(car.vx, car.vz) : 0;
  const range = 140 + Math.min(120, sp * 4);
  const k = W / 2 / range;
  const map = baseMap(s.city);
  g.save();
  g.translate(W / 2, W / 2);
  // Heading up: rotate the world by −(yaw + 90°).
  const rot = -(yaw + Math.PI / 2);
  g.rotate(rot);
  g.scale(k * PX, k * PX);
  g.translate(-(pos.x - MAP.x0) / PX, -(pos.z - MAP.z0) / PX);
  g.imageSmoothingEnabled = true;
  g.drawImage(map, 0, 0);
  g.restore();
  // GPS route.
  const to = (x: number, z: number) => {
    const dx = (x - pos.x) * k;
    const dz = (z - pos.z) * k;
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    return [W / 2 + dx * c - dz * sn, W / 2 + dx * sn + dz * c];
  };
  if (gps && gps.length > 1) {
    g.strokeStyle = "#ff4fa3";
    g.lineWidth = 4 * dpr;
    g.lineJoin = "round";
    g.beginPath();
    gps.forEach((p, i) => {
      const [x, y] = to(p.x, p.z);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
  }
  // Blips (far ones pinned to the edge for goals).
  const flash = (t * 2.5) % 1;
  for (const b of blips(s, gps)) {
    let [x, y] = to(b.x, b.z);
    const dx = x - W / 2;
    const dy = y - W / 2;
    const d = Math.hypot(dx, dy);
    const edge = W / 2 - 10 * dpr;
    if (d > edge) {
      if (b.kind !== "goal" && b.kind !== "story" && b.kind !== "waypoint") continue;
      x = W / 2 + (dx / d) * edge;
      y = W / 2 + (dy / d) * edge;
    }
    drawBlip(g, x, y, b, dpr * 0.85, flash);
  }
  // Tokens you're near.
  for (let i = 0; i < TOKENS.length; i++) {
    if (s.story.tokens.includes(i)) continue;
    const tk = TOKENS[i];
    if (Math.hypot(tk.x - pos.x, tk.z - pos.z) > 60) continue;
    const [x, y] = to(tk.x, tk.z);
    drawBlip(g, x, y, { x: 0, z: 0, kind: "token" }, dpr * 0.6);
  }
  const p = player(s);
  const heading = car ? car.h : p.h;
  drawPlayer(g, W / 2, W / 2, heading - yaw, dpr);
}

/** The full map (phone): fitted, panned and zoomed; returns the transform for taps. */
export function drawFullMap(g: CanvasRenderingContext2D, s: State, w: number, h: number, view: { cx: number; cz: number; zoom: number }, gps: { x: number; z: number }[] | null, t: number) {
  const map = baseMap(s.city);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = "#1c5f7a";
  g.fillRect(0, 0, w, h);
  const k = view.zoom;
  const to = (x: number, z: number) => [w / 2 + (x - view.cx) * k, h / 2 + (z - view.cz) * k];
  const [ox, oy] = to(MAP.x0, MAP.z0);
  g.imageSmoothingEnabled = true;
  g.drawImage(map, ox, oy, map.width * PX * k, map.height * PX * k);
  if (gps && gps.length > 1) {
    g.strokeStyle = "#ff4fa3";
    g.lineWidth = 4;
    g.lineJoin = "round";
    g.beginPath();
    gps.forEach((p, i) => {
      const [x, y] = to(p.x, p.z);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
  }
  const flash = (t * 2.5) % 1;
  const sc = Math.max(0.8, Math.min(1.4, k * 2));
  for (const b of blips(s, gps)) {
    const [x, y] = to(b.x, b.z);
    drawBlip(g, x, y, b, sc, flash);
  }
  for (let i = 0; i < TOKENS.length; i++) {
    if (!s.story.tokens.includes(i)) continue;
    const [x, y] = to(TOKENS[i].x, TOKENS[i].z);
    drawBlip(g, x, y, { x: 0, z: 0, kind: "token" }, sc * 0.6);
  }
  const pos = playerPos(s);
  const [px, py] = to(pos.x, pos.z);
  drawPlayer(g, px, py, pos.h + Math.PI / 2, 1.2);
  // District names.
  if (k < 1.2) {
    g.font = "800 12px Arial, sans-serif";
    g.textAlign = "center";
    g.fillStyle = "rgba(20,24,36,0.55)";
    for (const d of districtLabels()) {
      const [x2, y2] = to(d.x, d.z);
      g.fillText(d.name.toUpperCase(), x2, y2);
    }
  }
}

export const toWorld = (sx: number, sy: number, w: number, h: number, view: { cx: number; cz: number; zoom: number }) => ({ x: view.cx + (sx - w / 2) / view.zoom, z: view.cz + (sy - h / 2) / view.zoom });
