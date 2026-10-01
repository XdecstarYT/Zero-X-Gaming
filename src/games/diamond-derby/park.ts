import * as THREE from "three";
import { grassTexture } from "../neon-siege/three/textures";
import { buildCrowd, crowdUniforms, type CrowdUniforms, type Seat } from "../sports-kit/crowd";
import type { Detail } from "../sports-kit/look";
import { canvasTexture, noise2 } from "../sports-kit/pipeline";
import { band, ribbon, type Edge } from "../sports-kit/geo";
import { adTexture, glowTexture, grassDetail, lampTexture, seatTexture } from "../aussie-rules/textures";
import { BASE, fenceAt, FT, MOUND, wallAt } from "./sim";

/**
 * The ballpark: a diamond-cut field (mown checkerboard, the infield dirt arc,
 * mound, cut-outs, chalk), an outfield wall with distance markers and foul
 * poles, outfield bleachers around a batter's eye, a two-tier grandstand
 * wrapping home plate behind LED boards, light towers, a scoreboard and a
 * skyline beyond the fence.
 */

export interface Park {
  group: THREE.Group;
  crowd: CrowdUniforms;
  lampMats: THREE.MeshStandardMaterial[];
  glows: THREE.Sprite[];
  towers: THREE.Vector3[];
  board: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture };
  ledMats: THREE.MeshStandardMaterial[];
  windows: THREE.MeshStandardMaterial;
}

const Q = Math.PI / 4;
/** Foul territory: the side walls run 18 m outside the lines, round the plate. */
const SIDE = 18;
const FIRST = new THREE.Vector2(BASE * Math.SQRT1_2, BASE * Math.SQRT1_2);
const SECOND = new THREE.Vector2(BASE * Math.SQRT2, 0);
const THIRD = new THREE.Vector2(BASE * Math.SQRT1_2, -BASE * Math.SQRT1_2);

/** The fair-territory fence from the left-field pole to the right (radial normals). */
function fencePath(segs: number, inset = 0, from = -Q, to = Q): Edge[] {
  const out: Edge[] = [];
  for (let i = 0; i <= segs; i++) {
    const phi = from + ((to - from) * i) / segs;
    const r = fenceAt(Math.max(-Q, Math.min(Q, phi))) - inset;
    out.push({ x: Math.cos(phi) * r, z: Math.sin(phi) * r, nx: Math.cos(phi), nz: Math.sin(phi) });
  }
  return out;
}

/** The foul-territory wall: down the right-field side, round the plate, up the left. */
function grandstandPath(segs: number, inset = 0): Edge[] {
  const out: Edge[] = [];
  const d = SIDE - inset;
  const L = fenceAt(Q);
  const n = Math.max(4, Math.floor(segs * 0.35));
  // Right side: along the first-base line, outward normal (−0.707, 0.707).
  for (let i = 0; i <= n; i++) {
    const s = L * (1 - i / n);
    out.push({ x: s * Math.SQRT1_2 - d * Math.SQRT1_2, z: s * Math.SQRT1_2 + d * Math.SQRT1_2, nx: -Math.SQRT1_2, nz: Math.SQRT1_2 });
  }
  // Behind the plate.
  const m = Math.max(6, Math.floor(segs * 0.3));
  for (let i = 1; i < m; i++) {
    const a = (3 * Math.PI) / 4 + (i / m) * (Math.PI / 2);
    out.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, nx: Math.cos(a), nz: Math.sin(a) });
  }
  // Left side, back out to the pole.
  for (let i = 0; i <= n; i++) {
    const s = (L * i) / n;
    out.push({ x: s * Math.SQRT1_2 - d * Math.SQRT1_2, z: -s * Math.SQRT1_2 - d * Math.SQRT1_2, nx: -Math.SQRT1_2, nz: -Math.SQRT1_2 });
  }
  return out;
}

// ------------------------------------------------------------------- field

const X0 = -40;
const Z0 = -95;
const SPAN = 190;

/** The playing surface painted in world metres: grass, dirt, chalk. */
function fieldTexture(res: number) {
  return canvasTexture(res, res, (g) => {
    const k = res / SPAN;
    g.setTransform(k, 0, 0, k, -X0 * k, -Z0 * k);
    const DIRT = "#9a6a45";
    const TRACK = "#84593c";
    // Everything outside the walls: the warning-track dirt.
    g.fillStyle = TRACK;
    g.fillRect(X0, Z0, SPAN, SPAN);
    const loop = (inset: number) => {
      const pts = [...fencePath(80, inset), ...grandstandPath(80, inset)];
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z)));
      g.closePath();
    };
    // Grass inside the warning track, mown in a checkerboard.
    g.save();
    loop(4.6);
    g.fillStyle = "#3d7a2c";
    g.fill();
    g.clip();
    g.save();
    g.rotate(Q);
    for (let i = -40; i < 40; i++)
      for (let j = -40; j < 40; j++) {
        g.fillStyle = (i + j) % 2 ? "rgba(255,255,230,0.075)" : "rgba(0,20,0,0.07)";
        g.fillRect(i * 6.1, j * 6.1, 6.1, 6.1);
      }
    g.restore();
    // Infield dirt: the 95 ft arc around the rubber, just past the lines.
    g.save();
    g.beginPath();
    g.moveTo(-2, 0);
    g.lineTo(Math.cos(Q + 0.07) * 70, Math.sin(Q + 0.07) * 70);
    g.lineTo(Math.cos(-Q - 0.07) * 70, Math.sin(-Q - 0.07) * 70);
    g.closePath();
    g.clip();
    g.fillStyle = DIRT;
    g.beginPath();
    g.arc(MOUND, 0, 95 * FT, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // The infield grass square, inside the base paths.
    g.fillStyle = "#3f7e2e";
    g.beginPath();
    const ins = 0.95;
    g.moveTo(ins * 1.2, 0);
    g.lineTo(FIRST.x, FIRST.y - ins * 1.4);
    g.lineTo(SECOND.x - ins * 1.4, 0);
    g.lineTo(THIRD.x, THIRD.y + ins * 1.4);
    g.closePath();
    g.fill();
    g.save();
    g.clip();
    g.rotate(Q);
    for (let i = 0; i < 8; i++)
      for (let j = -8; j < 8; j++) {
        g.fillStyle = (i + j) % 2 ? "rgba(255,255,230,0.07)" : "rgba(0,20,0,0.06)";
        g.fillRect(i * 3.43, j * 3.43, 3.43, 3.43);
      }
    g.restore();
    g.restore();
    // Dirt: the mound, home plate circle, cut-outs at the bases, the run to first.
    g.fillStyle = DIRT;
    for (const [x, z, r] of [
      [MOUND, 0, 2.74],
      [0, 0, 3.96],
      [FIRST.x, FIRST.y, 3.2],
      [THIRD.x, THIRD.y, 3.2],
      [SECOND.x, 0, 3.2],
    ] as [number, number, number][]) {
      g.beginPath();
      g.arc(x, z, r, 0, Math.PI * 2);
      g.fill();
    }
    // Grain and footprints in the dirt, clay darker round the plate.
    const n = noise2(24, 9);
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 9000; i++) {
      const x = 40 * rnd() - 2;
      const z = 60 * rnd() - 30;
      if (Math.hypot(x - MOUND, z) > 95 * FT) continue;
      g.fillStyle = n(x / 60, z / 60) > 0.5 ? "rgba(60,30,10,0.12)" : "rgba(255,220,170,0.1)";
      g.fillRect(x, z, 0.08 + rnd() * 0.2, 0.08 + rnd() * 0.2);
    }
    const clay = g.createRadialGradient(0, 0, 0.5, 0, 0, 3.9);
    clay.addColorStop(0, "rgba(80,40,20,0.35)");
    clay.addColorStop(1, "rgba(80,40,20,0)");
    g.fillStyle = clay;
    g.beginPath();
    g.arc(0, 0, 3.9, 0, Math.PI * 2);
    g.fill();
    // Chalk: batter's boxes and the catcher's box.
    g.strokeStyle = "rgba(250,250,245,0.9)";
    g.lineWidth = 0.08;
    for (const side of [-1, 1]) g.strokeRect(-0.95, side > 0 ? 0.37 : -0.37 - 1.22, 1.83, 1.22);
    g.beginPath();
    g.moveTo(-1.0, -0.55);
    g.lineTo(-3.0, -0.55);
    g.lineTo(-3.0, 0.55);
    g.lineTo(-1.0, 0.55);
    g.stroke();
    // A worn arc where the infielders stand.
    g.strokeStyle = "rgba(0,0,0,0.05)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(MOUND, 0, 95 * FT - 3, -1.1, 1.1);
    g.stroke();
  });
}

/** Distance marker on the wall: "400" in yellow. */
function markerTexture(text: string) {
  return canvasTexture(256, 128, (g) => {
    g.clearRect(0, 0, 256, 128);
    g.fillStyle = "#f5d33b";
    g.font = "900 100px Arial Black, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 128, 70);
  });
}

/** Wall padding: dark green with a faint panel seam. */
function paddingTexture() {
  const t = canvasTexture(256, 64, (g) => {
    g.fillStyle = "#1d4a33";
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = "rgba(0,0,0,0.25)";
    for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 2, 64);
    g.fillStyle = "#f5d33b";
    g.fillRect(0, 0, 256, 4);
  }, true);
  return t;
}

/** City windows for the skyline (lit at night). */
function windowTexture() {
  let s = 31;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = "#2a2f38";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 16; x++) {
        g.fillStyle = rnd() < 0.16 ? `rgba(255,${200 + Math.floor(rnd() * 40)},140,0.85)` : "rgba(40,48,60,0.6)";
        g.fillRect(x * 16 + 3, y * 8 + 2, 10, 4);
      }
  }, true);
}

export function buildPark(detail: Detail, teamShirts: string[]): Park {
  const group = new THREE.Group();
  const high = detail !== "low";
  const segs = high ? 160 : 80;
  const crowd = crowdUniforms();

  // The concourse and everything beyond the stands.
  const outside = new THREE.Mesh(new THREE.CircleGeometry(600, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#3b3e43", roughness: 0.95 }));
  outside.position.y = -0.06;
  outside.receiveShadow = true;
  group.add(outside);

  // ------------------------------------------------------------- field
  const map = fieldTexture(high ? 4096 : 2048);
  const gt = grassTexture(256);
  const normal = gt.normal!;
  normal.repeat.set(SPAN / 3, SPAN / 3);
  const ground = new THREE.MeshStandardMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.93 });
  if (high) {
    const det = grassDetail(256);
    ground.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: det };
      sh.uniforms.detailScale = { value: new THREE.Vector2(SPAN / 1.6, SPAN / 1.6) };
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D detailMap;\nuniform vec2 detailScale;")
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          vec3 d1 = texture2D(detailMap, vMapUv * detailScale).rgb * 2.0;
          vec3 d2 = texture2D(detailMap, vMapUv * detailScale * 4.7 + 0.37).rgb * 2.0;
          diffuseColor.rgb *= mix(vec3(1.0), d1, 0.5) * mix(vec3(1.0), d2, 0.35);`,
        );
    };
  }
  const field = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, SPAN).rotateX(-Math.PI / 2).translate(X0 + SPAN / 2, 0, Z0 + SPAN / 2), ground);
  field.receiveShadow = true;
  group.add(field);

  // Chalk foul lines (geometry: crisp at any distance).
  const chalk = new THREE.MeshStandardMaterial({ color: "#f7f7f2", roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const L = fenceAt(Q);
  for (const sz of [-1, 1]) group.add(new THREE.Mesh(ribbon([[0.3, sz * 0.3], [L * Math.SQRT1_2, sz * L * Math.SQRT1_2]], 0.1), chalk));

  // The mound, the rubber, the plate and the bases.
  const dirt = new THREE.MeshStandardMaterial({ color: "#a06e48", roughness: 1 });
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.74, 0.25, 40), dirt);
  mound.position.set(MOUND, 0.12, 0);
  mound.receiveShadow = true;
  const white = new THREE.MeshStandardMaterial({ color: "#f4f4ef", roughness: 0.6 });
  const rubber = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.61), white);
  rubber.position.set(MOUND, 0.26, 0);
  const plateShape = new THREE.Shape();
  // Home plate: 17 in across the front, pointed at the catcher.
  plateShape.moveTo(0.215, -0.215);
  plateShape.lineTo(0.215, 0.215);
  plateShape.lineTo(0, 0.215);
  plateShape.lineTo(-0.215, 0);
  plateShape.lineTo(0, -0.215);
  plateShape.closePath();
  const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(plateShape, { depth: 0.02, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.02, 0), white);
  group.add(mound, rubber, plate);
  for (const b of [FIRST, SECOND, THIRD]) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.38), white);
    bag.position.set(b.x, 0.04, b.y);
    bag.rotation.y = Q;
    bag.castShadow = bag.receiveShadow = true;
    group.add(bag);
  }

  // ------------------------------------------------------- outfield wall
  const pad = paddingTexture();
  const padMat = new THREE.MeshStandardMaterial({ map: pad, roughness: 0.9 });
  const fence = fencePath(segs);
  const wall = new THREE.Mesh(
    band(fence, 1, (s, e) => [0, s * wallAt(Math.atan2(e.z, e.x))], 8, 1),
    padMat,
  );
  wall.receiveShadow = true;
  group.add(wall);
  const wallTop = new THREE.Mesh(
    band(fence, 1, (s, e) => [s * 0.6, wallAt(Math.atan2(e.z, e.x))], 8, 1),
    new THREE.MeshStandardMaterial({ color: "#163a28", roughness: 0.85 }),
  );
  group.add(wallTop);
  // Distance markers.
  for (const phi of [-Q, -Q / 2, 0, Q / 2, Q]) {
    const r = fenceAt(phi);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: markerTexture(String(Math.round(r / FT))), transparent: true, toneMapped: false }));
    m.position.set(Math.cos(phi) * (r - 0.05), wallAt(phi) * 0.55, Math.sin(phi) * (r - 0.05));
    m.rotation.y = -phi - Math.PI / 2;
    group.add(m);
  }
  // Foul poles with their screens.
  const yellow = new THREE.MeshStandardMaterial({ color: "#f2cf2c", roughness: 0.5, emissive: "#3a3000" });
  for (const sz of [-1, 1]) {
    const x = L * Math.SQRT1_2;
    const z = sz * L * Math.SQRT1_2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 28, 10), yellow);
    pole.position.set(x, 14, z);
    pole.castShadow = true;
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 18), new THREE.MeshStandardMaterial({ color: "#f2cf2c", transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    fin.position.set(x - 0.6 * Math.SQRT1_2, 17, z + sz * 0.6 * Math.SQRT1_2);
    fin.rotation.y = sz * Q;
    group.add(pole, fin);
  }

  // ---------------------------------------------- side walls & LED boards
  const stand = grandstandPath(segs);
  const ads = adTexture();
  const standLen = stand.reduce((a, e, i) => a + (i ? Math.hypot(e.x - stand[i - 1].x, e.z - stand[i - 1].z) : 0), 0);
  ads.repeat.set(standLen / 60, 1);
  const led = new THREE.MeshStandardMaterial({ map: ads, emissiveMap: ads, emissive: "#ffffff", emissiveIntensity: 0.5, roughness: 0.4 });
  group.add(new THREE.Mesh(band(stand, 1, (s) => [0, s * 1.3], standLen, 1), led));
  // Backstop netting behind the plate.
  const net = new THREE.MeshBasicMaterial({ color: "#20242a", transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
  const backstop = stand.filter((e) => Math.atan2(e.z, e.x) > 2.1 || Math.atan2(e.z, e.x) < -2.1);
  group.add(new THREE.Mesh(band(backstop, 1, (s) => [0, 1.3 + s * 7], 4, 1), net));

  // ------------------------------------------------------------- stands
  const concrete = new THREE.MeshStandardMaterial({ color: "#8a8983", roughness: 0.92, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: "#272a30", roughness: 0.85, side: THREE.DoubleSide });
  const seatsLower = seatTexture("#1d3f7a", 0.8);
  const seatsUpper = seatTexture("#1d3f7a", 0.75);
  const seatsBleach = seatTexture("#2e5a3a", 0.8);
  const tier = (path: Edge[], d0: number, d1: number, y0: number, y1: number, tex: THREE.Texture) => {
    const rake = Math.hypot(d1 - d0, y1 - y0);
    const m = new THREE.Mesh(band(path, 2, (s) => [d0 + (d1 - d0) * s, y0 + (y1 - y0) * s], 16, rake / 6.8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    return m;
  };
  const LOWER = { d0: 1.5, d1: 30, y0: 1.6, y1: 14 };
  const UPPER = { d0: 34, d1: 52, y0: 19, y1: 32 };
  group.add(tier(stand, LOWER.d0, LOWER.d1, LOWER.y0, LOWER.y1, seatsLower), tier(stand, UPPER.d0, UPPER.d1, UPPER.y0, UPPER.y1, seatsUpper));
  group.add(new THREE.Mesh(band(stand, 1, (s) => [LOWER.d1, LOWER.y1 + s * 2.5], 8, 1), dark));
  group.add(new THREE.Mesh(band(stand, 1, (s) => [LOWER.d1 + s * (UPPER.d0 - LOWER.d1), LOWER.y1 + 2.5], 8, 1), dark));
  const ads2 = adTexture();
  ads2.repeat.set(standLen / 40, 1);
  const led2 = new THREE.MeshStandardMaterial({ map: ads2, emissiveMap: ads2, emissive: "#ffffff", emissiveIntensity: 0.55, roughness: 0.4 });
  group.add(new THREE.Mesh(band(stand, 1, (s) => [UPPER.d0 - 0.2, UPPER.y0 - 2.4 + s * 2.4], 120, 1), led2));
  group.add(new THREE.Mesh(band(stand, 1, (s) => [UPPER.d1, UPPER.y1 + s * 9], 8, 1), dark));
  const roof = new THREE.Mesh(band(stand, 2, (s) => [26 + s * 28, 40 + s * 1.5], 10, 1), new THREE.MeshStandardMaterial({ color: "#3a3e45", roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }));
  roof.castShadow = high;
  group.add(roof);
  group.add(new THREE.Mesh(band(stand, 1, (s) => [0, s * LOWER.y0], 8, 1), concrete));

  // Outfield bleachers (not in front of the batter's eye).
  const EYE = 0.13;
  const BLEACH = { d0: 1.5, d1: 26, y0: 4.2, y1: 15 };
  for (const [a, b] of [
    [-Q - 0.02, -EYE],
    [EYE, Q + 0.02],
  ]) {
    const path = fencePath(Math.floor(segs / 2), 0, a, b);
    group.add(tier(path, BLEACH.d0, BLEACH.d1, BLEACH.y0, BLEACH.y1, seatsBleach));
    group.add(new THREE.Mesh(band(path, 1, (s) => [0.6 + s * 0.9, wallAt(0) * 0.7 + s * (BLEACH.y0 - wallAt(0) * 0.7)], 8, 1), concrete));
    group.add(new THREE.Mesh(band(path, 1, (s) => [BLEACH.d1, BLEACH.y1 + s * 3], 8, 1), dark));
  }
  // The batter's eye: a dark slab so the hitter can see the ball.
  const eye = new THREE.Mesh(new THREE.BoxGeometry(4, 10, 34), new THREE.MeshStandardMaterial({ color: "#1d3a2a", roughness: 1 }));
  eye.position.set(fenceAt(0) + 6, 5, 0);
  group.add(eye);

  // -------------------------------------------------------------- crowd
  const occupancy = detail === "ultra" ? 0.55 : detail === "high" ? 0.32 : 0.08;
  const seats: Seat[] = [];
  let rs = 2024;
  const rr = () => ((rs = (rs * 16807) % 2147483647) - 1) / 2147483646;
  const seat = (path: Edge[], t: { d0: number; d1: number; y0: number; y1: number }) => {
    const rake = Math.hypot(t.d1 - t.d0, t.y1 - t.y0);
    const rows = Math.floor(rake / 0.85);
    for (let j = 0; j < rows; j++) {
      const s = (j + 0.6) / rows;
      const d = t.d0 + (t.d1 - t.d0) * s;
      const y = t.y0 + (t.y1 - t.y0) * s;
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        const ax = a.x + a.nx * d;
        const az = a.z + a.nz * d;
        const bx = b.x + b.nx * d;
        const bz = b.z + b.nz * d;
        const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 0.55));
        // The good seats behind the plate are always full.
        const full = Math.abs(Math.atan2(a.z, a.x)) > 2.15 ? Math.min(1, occupancy * 2.6) : occupancy;
        for (let k = 0; k < n; k++) {
          if (rr() > full) continue;
          const f = (k + rr() * 0.2) / n;
          const x = ax + (bx - ax) * f;
          const z = az + (bz - az) * f;
          seats.push({ x, y: y - 0.1, z, h: Math.atan2(-z, 30 - x) });
        }
      }
    }
  };
  seat(stand, LOWER);
  seat(stand, UPPER);
  for (const [a, b] of [
    [-Q - 0.02, -EYE],
    [EYE, Q + 0.02],
  ])
    seat(fencePath(Math.floor(segs / 2), 0, a, b), BLEACH);
  group.add(buildCrowd(seats, [...teamShirts, "#ffffff", "#15171d", "#3a4250", "#6b7280", "#1e3a5f", "#7c2d12", "#d6d3d1", "#b91c1c", "#f2f2f2"], high, crowd, 77));

  // -------------------------------------------------------- light towers
  const towerMat = new THREE.MeshStandardMaterial({ color: "#9aa1aa", roughness: 0.5, metalness: 0.6 });
  const lamp = lampTexture();
  const lampMats: THREE.MeshStandardMaterial[] = [];
  const glows: THREE.Sprite[] = [];
  const towers: THREE.Vector3[] = [];
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: "#fff6e0", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  for (const [phi, r, h] of [
    [-0.55, 155, 48],
    [0.55, 155, 48],
    [-1.25, 80, 52],
    [1.25, 80, 52],
    [-2.2, 62, 54],
    [2.2, 62, 54],
  ]) {
    const x = Math.cos(phi) * r;
    const z = Math.sin(phi) * r;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.4, h, 8), towerMat);
    t.position.set(x, h / 2, z);
    group.add(t);
    const head = new THREE.Group();
    head.position.set(x, h + 3, z);
    head.lookAt(40, 0, 0);
    const lm = new THREE.MeshStandardMaterial({ map: lamp, emissiveMap: lamp, emissive: "#fff8e8", emissiveIntensity: 0.2, roughness: 0.5 });
    lampMats.push(lm);
    head.add(new THREE.Mesh(new THREE.BoxGeometry(14, 7, 1), [towerMat, towerMat, towerMat, towerMat, lm, towerMat]));
    group.add(head);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(24, 24, 1);
    glow.position.set(x, h + 3, z).add(new THREE.Vector3(40 - x, -h, -z).normalize().multiplyScalar(2));
    glows.push(glow);
    group.add(glow);
    towers.push(new THREE.Vector3(x, h + 3, z));
  }

  // ----------------------------------------------------------- scoreboard
  const boardCanvas = document.createElement("canvas");
  boardCanvas.width = 1024;
  boardCanvas.height = 512;
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, emissiveMap: boardTex, emissive: "#ffffff", emissiveIntensity: 0.9, roughness: 0.3 });
  const board = new THREE.Group();
  const bphi = 0.42;
  const br = fenceAt(bphi) + 34;
  board.position.set(Math.cos(bphi) * br, 26, Math.sin(bphi) * br);
  board.lookAt(0, 20, 0);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(30, 15), boardMat);
  face.position.z = 0.7;
  board.add(new THREE.Mesh(new THREE.BoxGeometry(32, 17, 1.2), new THREE.MeshStandardMaterial({ color: "#15171b", roughness: 0.7 })), face);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(2, 18, 2), towerMat);
  legs.position.set(0, -17, 0);
  board.add(legs);
  group.add(board);

  // -------------------------------------------------------------- skyline
  const windows = new THREE.MeshStandardMaterial({ map: windowTexture(), emissiveMap: null, color: "#9aa3b2", roughness: 0.8 });
  const winTex = windows.map!;
  windows.emissiveMap = winTex;
  windows.emissive.set("#000000");
  let ss = 99;
  const sr = () => ((ss = (ss * 16807) % 2147483647) - 1) / 2147483646;
  const towersGeo: THREE.BufferGeometry[] = [];
  for (let i = 0; i < (high ? 46 : 22); i++) {
    const phi = -1.1 + sr() * 2.2;
    const r = 380 + sr() * 260;
    const w = 18 + sr() * 26;
    const h = 25 + sr() * sr() * 110;
    const g = new THREE.BoxGeometry(w, h, w * (0.6 + sr() * 0.6));
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w / 20), uv.getY(k) * (h / 40));
    g.rotateY(-phi).translate(Math.cos(phi) * r, h / 2 - 1, Math.sin(phi) * r);
    towersGeo.push(g);
  }
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  for (const g of towersGeo) group.add(new THREE.Mesh(g, windows));

  return { group, crowd, lampMats, glows, towers, board: { canvas: boardCanvas, texture: boardTex }, ledMats: [led, led2, boardMat], windows };
}

/** Repaint the scoreboard. */
export function drawBoard(c: HTMLCanvasElement, lines: { title: string; you: string; youHr: number; them: string; themHr: number; outs: number; last: string; pitch: string }) {
  const g = c.getContext("2d")!;
  g.fillStyle = "#07090d";
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = "#0e1a2c";
  g.fillRect(0, 0, 1024, 92);
  g.fillStyle = "#f5d33b";
  g.font = "900 54px Arial Black, Arial, sans-serif";
  g.textBaseline = "middle";
  g.textAlign = "center";
  g.fillText(`DIAMOND DERBY · ${lines.title.toUpperCase()}`, 512, 48, 980);
  g.textAlign = "left";
  g.font = "800 58px Arial, sans-serif";
  g.fillStyle = "#ffffff";
  g.fillText(lines.you.toUpperCase(), 40, 160, 760);
  g.fillText(lines.them.toUpperCase(), 40, 250, 760);
  g.textAlign = "right";
  g.fillStyle = "#f5d33b";
  g.font = "900 82px Arial Black, Arial, sans-serif";
  g.fillText(String(lines.youHr), 984, 160);
  g.fillText(String(lines.themHr), 984, 250);
  g.textAlign = "left";
  g.font = "700 40px Arial, sans-serif";
  g.fillStyle = "#9fb3c8";
  g.fillText("OUTS", 40, 330);
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i < lines.outs ? "#ef4444" : "#1f2937";
    g.beginPath();
    g.arc(190 + i * 52, 330, 18, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#ffffff";
  g.font = "800 50px Arial, sans-serif";
  g.fillText(lines.last.toUpperCase(), 40, 410, 944);
  g.fillStyle = "#9fb3c8";
  g.font = "700 38px Arial, sans-serif";
  g.fillText(lines.pitch.toUpperCase(), 40, 470, 944);
  // LED pixel grid.
  g.fillStyle = "rgba(0,0,0,0.25)";
  for (let x = 0; x < 1024; x += 4) g.fillRect(x, 0, 1, 512);
  for (let y = 0; y < 512; y += 4) g.fillRect(0, y, 1024, 1);
}
