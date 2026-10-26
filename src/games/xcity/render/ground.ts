import * as THREE from "three";
import { LOT_D, LOT_W, MAP_HALF, type Crop } from "../data";
import { rng } from "../geom";
import type { Building, District, State } from "../state";

/**
 * The ground: one painted texture over the whole map (patchwork fields and orchards on the
 * farms, lawns, parks, backyards, paving and building sites), with fine grain over it up close;
 * countryside to the horizon beyond the map with hills on the skyline; and the river.
 */

function canvas(w: number, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

/** Fine grain (multiplied over the ground): one tile is 6 m. */
export function grainTexture() {
  const N = 256;
  const { c, g } = canvas(N);
  const R = rng(21);
  g.fillStyle = "#d4d4d4";
  g.fillRect(0, 0, N, N);
  for (let i = 0; i < 9000; i++) {
    const v = Math.floor(160 + R() * 95);
    g.fillStyle = `rgba(${v},${v},${v},${0.3 + R() * 0.4})`;
    g.fillRect(R() * N, R() * N, 1 + R() * 2.5, 1 + R() * 2.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Smooth tileable noise (a few octaves of value noise), for variation over hundreds of metres. */
export function macroTexture() {
  const N = 256;
  const { c, g } = canvas(N);
  const img = g.createImageData(N, N);
  const R = rng(63);
  const v = new Float32Array(N * N);
  for (const [cells, amp] of [[4, 0.5], [8, 0.27], [16, 0.15], [32, 0.08]] as [number, number][]) {
    const lat = Array.from({ length: cells * cells }, () => R());
    const at = (i: number, j: number) => lat[((j + cells) % cells) * cells + ((i + cells) % cells)];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * cells;
        const fy = (y / N) * cells;
        const i = Math.floor(fx);
        const j = Math.floor(fy);
        const sx = (fx - i) * (fx - i) * (3 - 2 * (fx - i));
        const sy = (fy - j) * (fy - j) * (3 - 2 * (fy - j));
        const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
        const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
        v[y * N + x] += (a + (b - a) * sy) * amp;
      }
  }
  for (let k = 0; k < N * N; k++) {
    const q = Math.max(0, Math.min(255, Math.round(v[k] * 255)));
    img.data[k * 4] = img.data[k * 4 + 1] = img.data[k * 4 + 2] = q;
    img.data[k * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Soft ripples for the river: a tileable normal map. */
export function rippleTexture() {
  const N = 256;
  const { c, g } = canvas(N);
  const img = g.createImageData(N, N);
  const h = new Float32Array(N * N);
  const R = rng(41);
  const waves = Array.from({ length: 14 }, () => ({ kx: Math.round((R() - 0.5) * 12), ky: Math.round((R() - 0.5) * 12), a: 0.2 + R() * 0.8, p: R() * 6.28 }));
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v = 0;
      for (const w of waves) v += Math.sin(((x * w.kx + y * w.ky) / N) * Math.PI * 2 + w.p) * w.a;
      h[y * N + x] = v;
    }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x + N - 1) % N)];
      const dy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
      const l = Math.hypot(dx * 0.5, dy * 0.5, 1);
      const i = (y * N + x) * 4;
      img.data[i] = ((-dx * 0.5) / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy * 0.5) / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const CROPS: Record<Crop, string[][]> = {
  // [base, row] pairs for each field.
  wheat: [["#c9b45c", "#b7a14b"], ["#d8c378", "#c8b162"], ["#b9a64e", "#a8953f"], ["#8fa356", "#7f9349"], ["#a08c5e", "#8f7c50"]],
  corn: [["#6c8e3a", "#5d7e31"], ["#7c9b41", "#6c8a38"], ["#93a24c", "#83923f"], ["#9c8b5c", "#8b7b4e"]],
  pasture: [["#86a957", "#7c9e4f"], ["#7a9e4b", "#729545"], ["#93b162", "#88a659"], ["#8aa356", "#80984e"]],
  orchard: [["#7d8a4a", "#6d6a45"], ["#86924f", "#706b47"]],
};

export const GROUND_BASE = "#748a48";

/** Paint the whole map's ground onto a canvas (N pixels across MAP_HALF*2 metres). */
export class GroundPainter {
  readonly c: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  private k: number;

  constructor(readonly N: number) {
    const { c, g } = canvas(N);
    this.c = c;
    this.g = g;
    this.k = N / (MAP_HALF * 2);
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.tex.generateMipmaps = true;
  }

  private X = (x: number) => (x + MAP_HALF) * this.k;
  private Z = (z: number) => (z + MAP_HALF) * this.k;

  private path(poly: number[]) {
    const g = this.g;
    g.beginPath();
    for (let i = 0; i < poly.length; i += 2) {
      if (i === 0) g.moveTo(this.X(poly[i]), this.Z(poly[i + 1]));
      else g.lineTo(this.X(poly[i]), this.Z(poly[i + 1]));
    }
    g.closePath();
  }

  /** An oriented rectangle (centre, axis along, half sizes). */
  private orect(x: number, z: number, ux: number, uz: number, hw: number, hd: number) {
    const vx = -uz;
    const vz = ux;
    const p = [];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) p.push(x + ux * hw * a + vx * hd * b, z + uz * hw * a + vz * hd * b);
    this.path(p);
  }

  paint(s: State) {
    const g = this.g;
    const N = this.N;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = GROUND_BASE;
    g.fillRect(0, 0, N, N);
    // Meadow blotches.
    const R = rng(s.seed + 5);
    for (let i = 0; i < 260; i++) {
      const x = R() * N;
      const y = R() * N;
      const r = (20 + R() * 90) * this.k;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const c = R() < 0.4 ? "rgba(84,110,52,0.35)" : R() < 0.7 ? "rgba(140,146,84,0.3)" : "rgba(120,112,72,0.22)";
      gr.addColorStop(0, c);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (const d of s.districts) if (d) this.district(s, d);
    // Riverbanks: a muddy, reedy fringe.
    g.lineCap = "round";
    g.lineJoin = "round";
    for (const [col, extra] of [["#5f6f3e", 26], ["#6a6446", 12], ["#4f5440", 5]] as [string, number][]) {
      g.strokeStyle = col;
      g.lineWidth = (s.riverHalf * 2 + extra) * this.k;
      g.beginPath();
      for (let i = 0; i < s.river.length; i += 2) {
        if (i === 0) g.moveTo(this.X(s.river[i]), this.Z(s.river[i + 1]));
        else g.lineTo(this.X(s.river[i]), this.Z(s.river[i + 1]));
      }
      g.stroke();
    }
    for (const l of s.lots) {
      if (!l) continue;
      const b = l.bld >= 0 ? s.buildings[l.bld] : null;
      this.lot(s, l.x, l.z, l.ux, l.uz, l.side, b, l.district >= 0 ? s.districts[l.district] : null);
    }
    this.tex.needsUpdate = true;
  }

  private district(s: State, d: District) {
    const g = this.g;
    g.save();
    this.path(d.poly);
    g.clip();
    if (d.use === "farms") this.fields(d);
    else if (d.use === "parks") {
      g.fillStyle = "#5f8c3d";
      g.fill();
      // Mowing stripes.
      g.globalAlpha = 0.1;
      g.fillStyle = "#8db862";
      const step = 6 * this.k;
      for (let y = 0; y < this.N; y += step * 2) g.fillRect(0, y, this.N, step);
      g.globalAlpha = 1;
    } else {
      g.fillStyle = "#71894a";
      g.fill();
    }
    g.restore();
  }

  /** Patchwork fields: a grid of plots in the district, each its own crop, rows ploughed one way or the other. */
  private fields(d: District) {
    const g = this.g;
    const crop = d.crop ?? "wheat";
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < d.poly.length; i += 2) {
      x0 = Math.min(x0, d.poly[i]);
      x1 = Math.max(x1, d.poly[i]);
      z0 = Math.min(z0, d.poly[i + 1]);
      z1 = Math.max(z1, d.poly[i + 1]);
    }
    const R = rng(d.id * 977 + 3);
    const fw = crop === "orchard" ? 140 : 190;
    const fd = crop === "orchard" ? 120 : 150;
    for (let x = Math.floor(x0 / fw) * fw; x < x1; x += fw)
      for (let z = Math.floor(z0 / fd) * fd; z < z1; z += fd) {
        const pal = CROPS[crop][Math.floor(R() * CROPS[crop].length)];
        const X0 = this.X(x);
        const Z0 = this.Z(z);
        const W = fw * this.k;
        const D = fd * this.k;
        g.fillStyle = pal[0];
        g.fillRect(X0, Z0, W, D);
        // Rows.
        g.fillStyle = pal[1];
        const across = R() < 0.5;
        const rowW = (crop === "orchard" ? 6 : crop === "pasture" ? 0 : 3.2) * this.k;
        if (rowW > 0) {
          if (across) for (let y = 0; y < D; y += rowW * 2) g.fillRect(X0, Z0 + y, W, rowW);
          else for (let y = 0; y < W; y += rowW * 2) g.fillRect(X0 + y, Z0, rowW, D);
        } else {
          // Pasture: soft clumps.
          for (let i = 0; i < 18; i++) {
            g.globalAlpha = 0.35;
            g.beginPath();
            g.arc(X0 + R() * W, Z0 + R() * D, (4 + R() * 10) * this.k, 0, 6.28);
            g.fill();
          }
          g.globalAlpha = 1;
        }
        // A hedgerow round the plot.
        g.strokeStyle = "rgba(62,88,40,0.75)";
        g.lineWidth = Math.max(1, 2.2 * this.k);
        g.strokeRect(X0, Z0, W, D);
      }
  }

  private lot(_s: State, x: number, z: number, ux: number, uz: number, side: number, b: Building | null, d: District | null) {
    const g = this.g;
    const use = d?.use;
    if (!b) {
      if (!d || use === "farms" || use === "parks") return;
      // A vacant plot in town: rough grass with a worn edge.
      g.fillStyle = "#858f58";
      this.orect(x, z, ux, uz, LOT_W / 2 - 0.4, LOT_D / 2 - 0.4);
      g.fill();
      return;
    }
    const f = { x: uz * side, z: -ux * side };
    if (!b.done) {
      g.fillStyle = "#8b7454";
      this.orect(x, z, ux, uz, LOT_W / 2 - 0.2, LOT_D / 2 - 0.2);
      g.fill();
      return;
    }
    if (b.use === "farm") {
      // A farmyard: gravel and a vegetable patch.
      g.fillStyle = "#9a8f74";
      this.orect(x, z, ux, uz, LOT_W / 2 - 0.3, LOT_D / 2 - 0.3);
      g.fill();
      return;
    }
    if (b.use === "civic") {
      if (b.civic === "park") {
        g.fillStyle = "#5c8c3c";
        this.orect(x, z, ux, uz, LOT_W / 2, LOT_D / 2);
        g.fill();
        g.strokeStyle = "#cdbf9e";
        g.lineWidth = 2.2 * this.k;
        g.beginPath();
        g.moveTo(this.X(x - f.x * 14), this.Z(z - f.z * 14));
        g.lineTo(this.X(x + f.x * 14), this.Z(z + f.z * 14));
        g.stroke();
      } else if (b.civic === "plaza") {
        g.fillStyle = "#cdc4b4";
        this.orect(x, z, ux, uz, LOT_W / 2, LOT_D / 2);
        g.fill();
      } else if (b.civic === "school") {
        // A playing field behind.
        g.fillStyle = "#5e9440";
        this.orect(x, z, ux, uz, LOT_W / 2, LOT_D / 2);
        g.fill();
      } else {
        g.fillStyle = "#b9b4aa";
        this.orect(x, z, ux, uz, LOT_W / 2, LOT_D / 2);
        g.fill();
      }
      return;
    }
    if (b.form === "house" || b.form === "townhouse") {
      // Lawn, with a driveway down one side for a house.
      g.fillStyle = b.form === "house" ? "#628a3e" : "#678a42";
      this.orect(x, z, ux, uz, LOT_W / 2 - 0.3, LOT_D / 2 - 0.3);
      g.fill();
      if (b.form === "house") {
        g.fillStyle = "#a9a59b";
        this.orect(x + ux * (LOT_W / 2 - 2) + f.x * 6, z + uz * (LOT_W / 2 - 2) + f.z * 6, ux, uz, 1.4, 10);
        g.fill();
        g.fillStyle = "#c9c2b0";
        this.orect(x + f.x * 11, z + f.z * 11, ux, uz, 0.6, 4);
        g.fill();
      }
      return;
    }
    // Apartments, shops, offices, workshops: paved, with a car park behind if they must have one.
    const paved = b.form === "workshop" ? "#8e8b85" : b.use === "shops" || b.use === "mixed" ? "#b3aea4" : "#a7a39a";
    g.fillStyle = paved;
    this.orect(x, z, ux, uz, LOT_W / 2, LOT_D / 2);
    g.fill();
    if (b.parking === 2 && b.storeys <= 7) {
      g.fillStyle = "#56585c";
      this.orect(x - f.x * 11, z - f.z * 11, ux, uz, LOT_W / 2 - 0.5, 4.6);
      g.fill();
      g.strokeStyle = "rgba(240,240,240,0.7)";
      g.lineWidth = Math.max(0.5, 0.2 * this.k);
      for (let i = -3; i <= 3; i++) {
        const cx = x - f.x * 11 + ux * i * 2.4;
        const cz = z - f.z * 11 + uz * i * 2.4;
        g.beginPath();
        g.moveTo(this.X(cx - f.x * 4), this.Z(cz - f.z * 4));
        g.lineTo(this.X(cx + f.x * 4), this.Z(cz + f.z * 4));
        g.stroke();
      }
    } else if (b.form !== "workshop") {
      // A strip of garden behind.
      g.fillStyle = "#62873f";
      this.orect(x - f.x * 12, z - f.z * 12, ux, uz, LOT_W / 2 - 0.6, 3.4);
      g.fill();
    }
  }
}

/** The ground material: the painted map, fine grain up close. */
export function groundMaterial(map: THREE.Texture, grain: THREE.Texture, macro: THREE.Texture) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.96, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tGrain = { value: grain };
    sh.uniforms.tMacro = { value: macro };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vGW;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D tGrain;\nuniform sampler2D tMacro;\nvarying vec3 vGW;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float gr = texture2D(tGrain, vGW.xz / 6.0).r * 0.6 + texture2D(tGrain, vGW.xz / 37.0).r * 0.4;
        float fade = clamp(length(vGW - cameraPosition) / 900.0, 0.0, 1.0);
        diffuseColor.rgb *= mix(0.72 + gr * 0.45, 1.0, fade);
        // Over hundreds of metres, grass is never one colour: drier patches, lusher hollows.
        float m1 = texture2D(tMacro, vGW.xz / 420.0).r;
        float m2 = texture2D(tMacro, vGW.xz / 97.0 + 0.31).r;
        float veg = smoothstep(0.0, 0.06, diffuseColor.g - max(diffuseColor.r, diffuseColor.b) * 0.92);
        vec3 tintV = mix(vec3(0.9, 0.98, 0.86), vec3(1.1, 1.03, 0.8), smoothstep(0.3, 0.7, m1));
        diffuseColor.rgb *= mix(vec3(1.0), tintV * (0.88 + m2 * 0.24), veg);
        diffuseColor.rgb *= 0.94 + m2 * 0.1;`,
      );
  };
  m.customProgramCacheKey = () => "xc-ground";
  return m;
}

/** Countryside beyond the map: tiled patchwork that fades into the haze. */
export function countryTexture() {
  const N = 1024;
  const { c, g } = canvas(N);
  const R = rng(77);
  g.fillStyle = GROUND_BASE;
  g.fillRect(0, 0, N, N);
  const crops = [...CROPS.wheat, ...CROPS.corn, ...CROPS.pasture];
  for (let y = 0; y < N; y += 48)
    for (let x = 0; x < N; x += 60) {
      const p = crops[Math.floor(R() * crops.length)];
      g.fillStyle = p[0];
      g.fillRect(x, y, 60, 48);
      g.fillStyle = p[1];
      if (R() < 0.5) for (let k = 0; k < 48; k += 4) g.fillRect(x, y + k, 60, 2);
      else for (let k = 0; k < 60; k += 4) g.fillRect(x + k, y, 2, 48);
      g.strokeStyle = "rgba(62,88,40,0.7)";
      g.lineWidth = 1.5;
      g.strokeRect(x, y, 60, 48);
    }
  // Woods.
  for (let i = 0; i < 40; i++) {
    g.fillStyle = "rgba(52,84,40,0.85)";
    g.beginPath();
    g.ellipse(R() * N, R() * N, 10 + R() * 30, 8 + R() * 20, R() * 3, 0, 6.28);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Low blue hills round the horizon. */
export function hillRing(radius: number) {
  const seg = 96;
  const pos: number[] = [];
  const col: number[] = [];
  const R = rng(9);
  const hs: number[] = [];
  for (let i = 0; i <= seg; i++) hs.push(i === seg ? hs[0] : 180 + R() * 520 + Math.sin(i * 0.7) * 120);
  const near = new THREE.Color("#7f957a");
  const far = new THREE.Color("#a8b9c4");
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a: number, r: number, h: number) => [Math.cos(a) * r, h, Math.sin(a) * r];
    const quad = [p(a0, radius, -20), p(a1, radius, -20), p(a1, radius * 1.08, hs[i + 1]), p(a0, radius * 1.08, hs[i])];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      pos.push(...quad[k]);
      const c = quad[k][1] > 0 ? far : near;
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, side: THREE.DoubleSide }));
}

/** The river: a ribbon along its centreline, a little below the banks. */
export function riverMesh(s: State, normal: THREE.Texture) {
  const p = s.river;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let acc = 0;
  for (let i = 0; i < p.length; i += 2) {
    const a = i > 0 ? i - 2 : i;
    const b = i < p.length - 2 ? i + 2 : i;
    const dx = p[b] - p[a];
    const dz = p[b + 1] - p[a + 1];
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    if (i > 0) acc += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    const w = s.riverHalf + 2;
    pos.push(p[i] + nx * w, 0.3, p[i + 1] + nz * w, p[i] - nx * w, 0.3, p[i + 1] - nz * w);
    uv.push(acc / 30, 0, acc / 30, (w * 2) / 30);
    if (i > 0) {
      const k = i - 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Make sure it faces up.
  const n = g.getAttribute("normal");
  if (n.getY(0) < 0) {
    g.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]]));
    g.computeVertexNormals();
  }
  // Deep, slightly green-brown river water that mirrors the sky; drawn just above the banks.
  const m = new THREE.MeshStandardMaterial({
    color: "#284346",
    roughness: 0.07,
    metalness: 0.05,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.5, 0.5),
    envMapIntensity: 1.5,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  normal.repeat.set(1, 1);
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}
