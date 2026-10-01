import * as THREE from "three";
import { grassTexture } from "../neon-siege/three/textures";
import { buildCrowd, crowdUniforms, type CrowdUniforms, type Seat } from "../sports-kit/crowd";
import { band, ribbon, roundRect } from "../sports-kit/geo";
import type { Detail } from "../sports-kit/look";
import { canvasTexture, noise2 } from "../sports-kit/pipeline";
import { adTexture, glowTexture, grassDetail, lampTexture, seatTexture } from "../aussie-rules/textures";
import { DOUBLES, HALF_L, netHeight, SERVICE, SINGLES, type Surface } from "./sim";

/**
 * Centre Court: the surface (acrylic hard court, crushed-brick clay or
 * striped grass worn at the baselines), every line, the net with its cord,
 * strap and posts, the umpire's chair, sponsor boards round the run-off, a
 * two-tier bowl with a crowd, light rigs, a scoreboard and an open roof.
 */

export interface Court {
  group: THREE.Group;
  crowd: CrowdUniforms;
  lampMats: THREE.MeshStandardMaterial[];
  glows: THREE.Sprite[];
  towers: THREE.Vector3[];
  board: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture };
  ledMats: THREE.MeshStandardMaterial[];
  /** Ball marks (clay keeps them). */
  marks: THREE.InstancedMesh;
}

/** Run-off: the painted area round the lines. */
export const RUN_X = HALF_L + 6.6;
export const RUN_Z = DOUBLES + 4.2;

const COLORS: Record<Surface, { court: string; outer: string }> = {
  hard: { court: "#2f5f9e", outer: "#3c7a52" },
  clay: { court: "#b85a33", outer: "#b25530" },
  grass: { court: "#4f8f3a", outer: "#4a8a37" },
};

function surfaceTexture(surface: Surface, res: number) {
  const W = RUN_X * 2;
  const H = RUN_Z * 2;
  const ry = Math.round((res * H) / W);
  return canvasTexture(res, ry, (g) => {
    const k = res / W;
    g.setTransform(k, 0, 0, k, RUN_X * k, RUN_Z * k);
    const c = COLORS[surface];
    g.fillStyle = c.outer;
    g.fillRect(-RUN_X, -RUN_Z, W, H);
    g.fillStyle = c.court;
    g.fillRect(-HALF_L - 0.05, -DOUBLES - 0.05, HALF_L * 2 + 0.1, DOUBLES * 2 + 0.1);
    const n = noise2(32, surface === "clay" ? 4 : 8);
    let s = 3;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    if (surface === "grass") {
      // Mown stripes across the court, worn brown at the baselines and the service T.
      for (let i = -12; i < 12; i++) {
        g.fillStyle = i % 2 ? "rgba(255,255,220,0.07)" : "rgba(0,30,0,0.07)";
        g.fillRect(i * 1.6, -RUN_Z, 1.6, H);
      }
      for (const sx of [-1, 1]) {
        const grad = g.createRadialGradient(sx * (HALF_L + 0.6), 0, 0.2, sx * (HALF_L + 0.6), 0, 3.6);
        grad.addColorStop(0, "rgba(140,110,60,0.85)");
        grad.addColorStop(0.6, "rgba(140,110,60,0.35)");
        grad.addColorStop(1, "rgba(140,110,60,0)");
        g.fillStyle = grad;
        g.fillRect(sx * (HALF_L + 0.6) - 4, -4, 8, 8);
      }
    }
    // Grain: brick dust drifts on clay, sheen on acrylic, blades on grass.
    for (let i = 0; i < (surface === "clay" ? 14000 : 6000); i++) {
      const x = (rnd() - 0.5) * W;
      const z = (rnd() - 0.5) * H;
      const v = n(x / W + 0.5, z / H + 0.5);
      g.fillStyle = surface === "clay" ? (v > 0.5 ? "rgba(255,190,140,0.12)" : "rgba(90,30,10,0.1)") : v > 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";
      g.fillRect(x, z, 0.05 + rnd() * 0.12, 0.05 + rnd() * 0.12);
    }
    if (surface === "clay") {
      // Sweep marks: arcs from the drag mats.
      g.strokeStyle = "rgba(90,35,15,0.08)";
      g.lineWidth = 0.05;
      for (let i = 0; i < 40; i++) {
        g.beginPath();
        g.arc((rnd() - 0.5) * W, (rnd() - 0.5) * H, 2 + rnd() * 4, 0, Math.PI * (0.3 + rnd() * 0.5));
        g.stroke();
      }
    }
  });
}

/** The net: a fine dark mesh. */
function netTexture() {
  return canvasTexture(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = "rgba(20,22,26,0.9)";
    g.lineWidth = 3;
    g.strokeRect(0, 0, 64, 64);
  }, true);
}

export function buildCourt(detail: Detail, surface: Surface, shirts: string[]): Court {
  const group = new THREE.Group();
  const high = detail !== "low";
  const crowd = crowdUniforms();

  // Concourse floor beyond everything.
  const floor = new THREE.Mesh(new THREE.CircleGeometry(400, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#3b3e43", roughness: 0.95 }));
  floor.position.y = -0.05;
  floor.receiveShadow = true;
  group.add(floor);

  // ------------------------------------------------------------ surface
  const map = surfaceTexture(surface, high ? 2048 : 1024);
  const mat = new THREE.MeshStandardMaterial({ map, roughness: surface === "hard" ? 0.62 : 0.95 });
  if (surface === "grass") {
    const gt = grassTexture(256);
    const normal = gt.normal!;
    normal.repeat.set(RUN_X / 1.5, RUN_Z / 1.5);
    mat.normalMap = normal;
    mat.normalScale.set(0.5, 0.5);
    if (high) {
      const det = grassDetail(256);
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.detailMap = { value: det };
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform sampler2D detailMap;")
          .replace("#include <map_fragment>", "#include <map_fragment>\nvec3 d1 = texture2D(detailMap, vMapUv * vec2(28.0, 16.0)).rgb * 2.0;\ndiffuseColor.rgb *= mix(vec3(1.0), d1, 0.45);");
      };
    }
  }
  const court = new THREE.Mesh(new THREE.PlaneGeometry(RUN_X * 2, RUN_Z * 2).rotateX(-Math.PI / 2), mat);
  court.receiveShadow = true;
  group.add(court);

  // Lines: 5 cm, baselines 10 cm.
  const lineMat = new THREE.MeshStandardMaterial({ color: "#e9e9e4", roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const L = HALF_L;
  const lines: THREE.BufferGeometry[] = [];
  for (const sz of [-1, 1]) {
    lines.push(ribbon([[-L, sz * (DOUBLES - 0.025)], [L, sz * (DOUBLES - 0.025)]], 0.05));
    lines.push(ribbon([[-L, sz * (SINGLES - 0.025)], [L, sz * (SINGLES - 0.025)]], 0.05));
  }
  for (const sx of [-1, 1]) {
    lines.push(ribbon([[sx * (L - 0.05), -DOUBLES], [sx * (L - 0.05), DOUBLES]], 0.1));
    lines.push(ribbon([[sx * SERVICE, -SINGLES], [sx * SERVICE, SINGLES]], 0.05));
    lines.push(ribbon([[sx * (L - 0.1), 0], [sx * (L - 0.25), 0]], 0.05));
  }
  lines.push(ribbon([[-SERVICE, 0], [SERVICE, 0]], 0.05));
  for (const g of lines) {
    const m = new THREE.Mesh(g, lineMat);
    m.receiveShadow = true;
    group.add(m);
  }

  // ---------------------------------------------------------------- net
  const postZ = DOUBLES + 0.914;
  const net = netTexture();
  net.repeat.set((postZ * 2) / 0.045, 1.07 / 0.045);
  const netGeo = new THREE.PlaneGeometry(postZ * 2, 1, 48, 1).rotateY(Math.PI / 2);
  const np = netGeo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < np.count; i++) {
    const z = np.getZ(i);
    np.setY(i, np.getY(i) > 0 ? netHeight(z) - 0.05 : 0.02);
  }
  netGeo.computeVertexNormals();
  group.add(new THREE.Mesh(netGeo, new THREE.MeshStandardMaterial({ map: net, alphaMap: net, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, roughness: 0.9, color: "#15171a" })));
  const tapePts: THREE.Vector3[] = [];
  for (let i = 0; i <= 48; i++) {
    const z = -postZ + (i / 48) * postZ * 2;
    tapePts.push(new THREE.Vector3(0, netHeight(z) - 0.025, z));
  }
  const white = new THREE.MeshStandardMaterial({ color: "#f4f4f0", roughness: 0.55 });
  const tape = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tapePts), 48, 0.028, 6), white);
  tape.castShadow = true;
  group.add(tape);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.9, 0.05), white);
  strap.position.set(0, 0.45, 0);
  group.add(strap);
  const postMat = new THREE.MeshStandardMaterial({ color: "#1f3d2c", roughness: 0.45, metalness: 0.4 });
  for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.12, 12), postMat);
    post.position.set(0, 0.56, sz * postZ);
    post.castShadow = true;
    group.add(post);
  }

  // ------------------------------------------------- umpire's chair, boards
  const chairMat = new THREE.MeshStandardMaterial({ color: "#1f3d2c", roughness: 0.6 });
  const chair = new THREE.Group();
  for (const [x, z] of [
    [-0.35, -0.35],
    [0.35, -0.35],
    [-0.35, 0.35],
    [0.35, 0.35],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.9, 0.06), chairMat);
    leg.position.set(x, 0.95, z);
    chair.add(leg);
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.9), chairMat);
  seat.position.y = 1.9;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.08), chairMat);
  back.position.set(0, 2.3, -0.44);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.06), chairMat);
  desk.position.set(0, 2.1, 0.48);
  chair.add(seat, back, desk);
  chair.position.set(0, 0, -(postZ + 1.1));
  chair.traverse((o) => (o.castShadow = true));
  group.add(chair);

  const ads = adTexture();
  const ring = roundRect(RUN_X, RUN_Z, 1.2, 4);
  const ringLen = ring.reduce((a, e, i) => a + (i ? Math.hypot(e.x - ring[i - 1].x, e.z - ring[i - 1].z) : 0), 0);
  ads.repeat.set(ringLen / 40, 1);
  const led = new THREE.MeshStandardMaterial({ map: ads, emissiveMap: ads, emissive: "#ffffff", emissiveIntensity: 0.45, roughness: 0.5 });
  group.add(new THREE.Mesh(band(ring, 1, (s) => [0, s * 1.0], ringLen, 1), led));

  // ------------------------------------------------------------- stands
  const bowl = roundRect(RUN_X + 1.5, RUN_Z + 1.5, 6, high ? 10 : 5);
  const dark = new THREE.MeshStandardMaterial({ color: "#26292f", roughness: 0.85, side: THREE.DoubleSide });
  const seatsLow = seatTexture(surface === "grass" ? "#1d4a2e" : "#1e2f5a", 0.85);
  const seatsUp = seatTexture(surface === "grass" ? "#3b2a52" : "#1e2f5a", 0.8);
  const tier = (d0: number, d1: number, y0: number, y1: number, tex: THREE.Texture) => {
    const rake = Math.hypot(d1 - d0, y1 - y0);
    const m = new THREE.Mesh(band(bowl, 2, (s) => [d0 + (d1 - d0) * s, y0 + (y1 - y0) * s], 16, rake / 6.8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    return m;
  };
  const LOW = { d0: 0, d1: 16, y0: 1.4, y1: 10 };
  const UP = { d0: 19, d1: 31, y0: 13.5, y1: 22.5 };
  group.add(tier(LOW.d0, LOW.d1, LOW.y0, LOW.y1, seatsLow), tier(UP.d0, UP.d1, UP.y0, UP.y1, seatsUp));
  group.add(new THREE.Mesh(band(bowl, 1, (s) => [0, s * LOW.y0], 8, 1), dark));
  group.add(new THREE.Mesh(band(bowl, 1, (s) => [LOW.d1, LOW.y1 + s * 2], 8, 1), dark));
  group.add(new THREE.Mesh(band(bowl, 1, (s) => [LOW.d1 + s * (UP.d0 - LOW.d1), LOW.y1 + 2], 8, 1), dark));
  const ads2 = adTexture();
  ads2.repeat.set(4, 1);
  const led2 = new THREE.MeshStandardMaterial({ map: ads2, emissiveMap: ads2, emissive: "#ffffff", emissiveIntensity: 0.5, roughness: 0.4 });
  group.add(new THREE.Mesh(band(bowl, 1, (s) => [UP.d0 - 0.2, UP.y0 - 2 + s * 2], 120, 1), led2));
  group.add(new THREE.Mesh(band(bowl, 1, (s) => [UP.d1, UP.y1 + s * 7], 8, 1), dark));
  // The open roof: a cantilevered ring with a lit fascia.
  const roof = new THREE.Mesh(band(bowl, 2, (s) => [14 + s * 19, 28 + s * 1.5], 10, 1), new THREE.MeshStandardMaterial({ color: "#d5d9de", roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
  roof.castShadow = high;
  group.add(roof);
  const fasciaMat = new THREE.MeshStandardMaterial({ color: "#e8ebef", emissive: "#fff6df", emissiveIntensity: 0, roughness: 0.5 });
  group.add(new THREE.Mesh(band(bowl, 1, (s) => [14, 27 + s * 1.2], 8, 1), fasciaMat));

  // -------------------------------------------------------------- crowd
  const occupancy = detail === "ultra" ? 0.8 : detail === "high" ? 0.5 : 0.12;
  const seats: Seat[] = [];
  let rs = 4242;
  const rr = () => ((rs = (rs * 16807) % 2147483647) - 1) / 2147483646;
  for (const t of [LOW, UP]) {
    const rake = Math.hypot(t.d1 - t.d0, t.y1 - t.y0);
    const rows = Math.floor(rake / 0.85);
    for (let j = 0; j < rows; j++) {
      const s = (j + 0.6) / rows;
      const d = t.d0 + (t.d1 - t.d0) * s;
      const y = t.y0 + (t.y1 - t.y0) * s;
      for (let i = 0; i < bowl.length - 1; i++) {
        const a = bowl[i];
        const b = bowl[i + 1];
        const ax = a.x + a.nx * d;
        const az = a.z + a.nz * d;
        const bx = b.x + b.nx * d;
        const bz = b.z + b.nz * d;
        const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 0.55));
        for (let k = 0; k < n; k++) {
          if (rr() > occupancy) continue;
          const f = (k + rr() * 0.2) / n;
          const x = ax + (bx - ax) * f;
          const z = az + (bz - az) * f;
          // The scoreboard end's upper tier is the screen.
          if (t === UP && x > RUN_X && Math.abs(z) < 9) continue;
          seats.push({ x, y: y - 0.1, z, h: Math.atan2(-z * 0.6, -x) });
        }
      }
    }
  }
  group.add(buildCrowd(seats, [...shirts, "#ffffff", "#f5f5f4", "#15171d", "#3a4250", "#d6d3d1", "#1e3a5f", "#fde68a", "#e2e8f0", "#7c2d12"], high, crowd, 909));

  // ------------------------------------------------------- lights, board
  const lamp = lampTexture();
  const lampMats: THREE.MeshStandardMaterial[] = [];
  const glows: THREE.Sprite[] = [];
  const towers: THREE.Vector3[] = [];
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: "#fff6e0", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  // Light rigs hung under the roof ring.
  for (const [x, z] of [
    [-26, -20],
    [26, -20],
    [-26, 20],
    [26, 20],
    [0, -24],
    [0, 24],
  ]) {
    const head = new THREE.Group();
    head.position.set(x, 27, z);
    head.lookAt(0, 0, 0);
    const lm = new THREE.MeshStandardMaterial({ map: lamp, emissiveMap: lamp, emissive: "#fff8e8", emissiveIntensity: 0.2, roughness: 0.5 });
    lampMats.push(lm);
    head.add(new THREE.Mesh(new THREE.BoxGeometry(8, 3, 0.8), [dark, dark, dark, dark, lm, dark]));
    group.add(head);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(16, 16, 1);
    glow.position.set(x, 27, z).multiplyScalar(0.97);
    glows.push(glow);
    group.add(glow);
    towers.push(new THREE.Vector3(x, 27, z));
  }
  lampMats.push(fasciaMat);

  const boardCanvas = document.createElement("canvas");
  boardCanvas.width = 1024;
  boardCanvas.height = 384;
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, emissiveMap: boardTex, emissive: "#ffffff", emissiveIntensity: 0.9, roughness: 0.3 });
  const board = new THREE.Group();
  board.position.set(RUN_X + 1.5 + UP.d0 + 4, UP.y0 + 5.5, 0);
  board.rotation.y = -Math.PI / 2;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(17, 6.4), boardMat);
  face.position.z = 0.55;
  board.add(new THREE.Mesh(new THREE.BoxGeometry(18, 7.4, 1), new THREE.MeshStandardMaterial({ color: "#15171b", roughness: 0.7 })), face);
  group.add(board);

  // Ball marks on clay (instanced ellipses, recycled).
  const marks = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.06, 16).scale(1.6, 1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: surface === "clay" ? "#7a3218" : "#ffffff", transparent: true, opacity: surface === "clay" ? 0.6 : 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    24,
  );
  marks.count = 0;
  marks.frustumCulled = false;
  group.add(marks);

  return { group, crowd, lampMats, glows, towers, board: { canvas: boardCanvas, texture: boardTex }, ledMats: [led, led2, boardMat], marks };
}

/** Repaint the scoreboard: names, sets, games, points, the server's dot. */
export function drawBoard(c: HTMLCanvasElement, d: { names: [string, string]; sets: string[][]; games: [number, number]; points: [string, string]; server: 0 | 1; title: string; speed: string }) {
  const g = c.getContext("2d")!;
  g.fillStyle = "#06120c";
  g.fillRect(0, 0, 1024, 384);
  g.fillStyle = "#0e2a1c";
  g.fillRect(0, 0, 1024, 70);
  g.fillStyle = "#e9d48a";
  g.font = "900 42px Arial Black, Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(d.title.toUpperCase(), 512, 38, 980);
  for (const p of [0, 1] as const) {
    const y = 130 + p * 100;
    g.textAlign = "left";
    g.fillStyle = "#ffffff";
    g.font = "800 50px Arial, sans-serif";
    g.fillText(d.names[p].toUpperCase(), 70, y, 470);
    if (d.server === p) {
      g.fillStyle = "#d9f99d";
      g.beginPath();
      g.arc(40, y, 12, 0, Math.PI * 2);
      g.fill();
    }
    g.textAlign = "center";
    g.font = "800 54px Arial, sans-serif";
    d.sets.forEach((s, i) => {
      g.fillStyle = "#9fb3a8";
      g.fillText(s[p], 600 + i * 70, y);
    });
    g.fillStyle = "#ffffff";
    g.fillText(String(d.games[p]), 600 + d.sets.length * 70, y);
    g.fillStyle = "#facc15";
    g.font = "900 58px Arial Black, Arial, sans-serif";
    g.fillText(d.points[p], 940, y);
  }
  g.fillStyle = "#9fb3a8";
  g.font = "700 34px Arial, sans-serif";
  g.textAlign = "center";
  g.fillText(d.speed, 512, 340, 980);
  g.fillStyle = "rgba(0,0,0,0.25)";
  for (let x = 0; x < 1024; x += 4) g.fillRect(x, 0, 1, 384);
  for (let y = 0; y < 384; y += 4) g.fillRect(0, y, 1024, 1);
}
