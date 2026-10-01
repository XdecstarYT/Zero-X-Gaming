import * as THREE from "three";
import { grassTexture } from "../neon-siege/three/textures";
import { A, ARC, B, BEHIND_HALF, CENTRE_SQUARE, GOAL_HALF, GOAL_SQUARE, GOAL_X, type Club } from "./sim";
import { buildCrowd, type CrowdUniforms } from "../sports-kit/crowd";
import { adTexture, glowTexture, grassDetail, groundTexture, GROUND_X, GROUND_Z, lampTexture, netTexture, screenCanvas, seatTexture } from "./textures";

/**
 * The ground: a mown oval with its markings, goal and behind posts with pads,
 * netting, the LED fence, a two-tier bowl of stands under a cantilevered roof,
 * an instanced crowd that rises and cheers, six light towers and two screens.
 */

export type { Detail } from "../sports-kit/look";
import type { Detail } from "../sports-kit/look";

export interface Stadium {
  group: THREE.Group;
  crowd: CrowdUniforms;
  ads: THREE.Texture;
  screen: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture };
  lampMats: THREE.MeshStandardMaterial[];
  glows: THREE.Sprite[];
  /** Light tower heads (for the floodlight rig). */
  towers: THREE.Vector3[];
  ground: THREE.MeshStandardMaterial;
  ledMats: THREE.MeshStandardMaterial[];
}

/** A point on the ring `d` metres outside the boundary ellipse at angle θ. */
const ring = (t: number, d: number): [number, number] => [(A + d) * Math.cos(t), (B + d) * Math.sin(t)];

/** A grid surface around the bowl: f(θ, s) for s in 0–1 across the band. */
function bowlBand(segs: number, rows: number, f: (t: number, s: number) => THREE.Vector3, uLen: number, vLen: number, t0 = 0, t1 = Math.PI * 2) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // Arc length along the middle of the band for u.
  let u = 0;
  let prev = f(t0, 0.5);
  for (let i = 0; i <= segs; i++) {
    const t = t0 + ((t1 - t0) * i) / segs;
    const mid = f(t, 0.5);
    u += mid.distanceTo(prev);
    prev = mid;
    for (let j = 0; j <= rows; j++) {
      const s = j / rows;
      const p = f(t, s);
      pos.push(p.x, p.y, p.z);
      uv.push(u / uLen, (s * vLen) / 1);
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j;
      const b = a + rows + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A flat white ribbon along a polyline on the grass. */
function ribbon(pts: [number, number][], w: number, closed = false) {
  const pos: number[] = [];
  const idx: number[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0];
    let dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    pos.push(p[0] - dz * w * 0.5, 0.012, p[1] + dx * w * 0.5, p[0] + dz * w * 0.5, 0.012, p[1] - dx * w * 0.5);
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    const b = ((i + 1) % n) * 2;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

function circle(cx: number, cz: number, r: number, n = 64): [number, number][] {
  return Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cz + Math.sin((i / n) * Math.PI * 2) * r]);
}

/** Every line on the oval. */
function markings() {
  const geos: THREE.BufferGeometry[] = [];
  const W = 0.14;
  // Boundary, flat across the goal face.
  const bound: [number, number][] = [];
  for (let i = 0; i < 360; i++) {
    const t = (i / 360) * Math.PI * 2;
    let x = A * Math.cos(t);
    const z = B * Math.sin(t);
    if (Math.abs(z) < BEHIND_HALF) x = Math.sign(x) * Math.min(Math.abs(x), GOAL_X);
    bound.push([x, z]);
  }
  geos.push(ribbon(bound, W, true));
  // Centre square, circles and the line through them.
  const c = CENTRE_SQUARE;
  geos.push(ribbon([[-c, -c], [c, -c], [c, c], [-c, c]], W, true));
  geos.push(ribbon(circle(0, 0, 5), W, true), ribbon(circle(0, 0, 1.5, 32), W, true), ribbon([[0, -5], [0, 5]], W));
  for (const sx of [-1, 1]) {
    // Goal square.
    geos.push(ribbon([[sx * GOAL_X, -GOAL_HALF], [sx * (GOAL_X - GOAL_SQUARE), -GOAL_HALF], [sx * (GOAL_X - GOAL_SQUARE), GOAL_HALF], [sx * GOAL_X, GOAL_HALF]], W));
    // 50 m arc, clipped to the oval.
    const arc: [number, number][] = [];
    for (let i = 0; i <= 120; i++) {
      const t = Math.PI / 2 + (i / 120) * Math.PI;
      const x = sx * GOAL_X + Math.cos(t) * ARC * sx;
      const z = Math.sin(t) * ARC;
      if ((x / A) ** 2 + (z / B) ** 2 < 0.999) arc.push([x, z]);
    }
    geos.push(ribbon(arc, W));
  }
  return geos;
}

/** Merge geometries (all indexed, same attributes). */
function merge(list: THREE.BufferGeometry[]) {
  let vtx = 0;
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (const g of list) {
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + vtx);
    vtx += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

interface Tier {
  d0: number;
  d1: number;
  y0: number;
  y1: number;
}
const LOWER: Tier = { d0: 11, d1: 42, y0: 2.2, y1: 16 };
const UPPER: Tier = { d0: 45, d1: 68, y0: 20.5, y1: 37 };

export function buildStadium(detail: Detail, home: Club, away: Club): Stadium {
  const group = new THREE.Group();
  const high = detail !== "low";
  const segs = high ? 220 : 110;
  const uniforms = { uTime: { value: 0 }, uCheer: { value: 0 } };

  // ------------------------------------------------------------- the oval
  const groundTex = groundTexture(high ? 2048 : 1024);
  const gt = grassTexture(256);
  const normal = gt.normal!;
  normal.repeat.set((GROUND_X * 2) / 3, (GROUND_Z * 2) / 3);
  const ground = new THREE.MeshStandardMaterial({ map: groundTex, normalMap: normal, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.93, metalness: 0 });
  if (high) {
    const det = grassDetail(256);
    ground.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: det };
      sh.uniforms.detailScale = { value: new THREE.Vector2((GROUND_X * 2) / 1.6, (GROUND_Z * 2) / 1.6) };
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D detailMap;\nuniform vec2 detailScale;")
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          vec3 d1 = texture2D(detailMap, vMapUv * detailScale).rgb * 2.0;
          vec3 d2 = texture2D(detailMap, vMapUv * detailScale * 4.7 + 0.37).rgb * 2.0;
          diffuseColor.rgb *= mix(vec3(1.0), d1, 0.55) * mix(vec3(1.0), d2, 0.4);`,
        );
    };
  }
  const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_X * 2, GROUND_Z * 2).rotateX(-Math.PI / 2), ground);
  groundMesh.receiveShadow = true;
  group.add(groundMesh);
  // Concourse floor out to the stands.
  const apron = new THREE.Mesh(
    bowlBand(segs, 1, (t, s) => {
      const [x, z] = ring(t, 6 + s * 8);
      return new THREE.Vector3(x, -0.02, z);
    }, 6, 1),
    new THREE.MeshStandardMaterial({ color: "#3d4a3a", roughness: 0.95 }),
  );
  apron.receiveShadow = true;
  group.add(apron);

  const lineMat = new THREE.MeshStandardMaterial({ color: "#f6f6f2", roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const lines = new THREE.Mesh(merge(markings()), lineMat);
  lines.receiveShadow = true;
  group.add(lines);

  // ------------------------------------------------------- posts & nets
  const postMat = new THREE.MeshStandardMaterial({ color: "#f4f4f4", roughness: 0.45 });
  const padA = new THREE.MeshStandardMaterial({ color: home.guernsey, roughness: 0.7 });
  const padB = new THREE.MeshStandardMaterial({ color: "#f2f2f2", roughness: 0.7 });
  const netMat = new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.8 });
  (netMat.map as THREE.Texture).repeat.set(48, 22);
  for (const sx of [-1, 1]) {
    for (const [z, goal] of [[-BEHIND_HALF, false], [-GOAL_HALF, true], [GOAL_HALF, true], [BEHIND_HALF, false]] as [number, boolean][]) {
      const h = goal ? 15 : 8.5;
      const r = goal ? 0.2 : 0.16;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h, 16), postMat);
      post.position.set(sx * GOAL_X, h / 2, z);
      post.castShadow = true;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.24, r + 0.24, 2.4, 20), goal ? padA : padB);
      pad.position.set(sx * GOAL_X, 1.2, z);
      pad.castShadow = true;
      group.add(post, pad);
    }
    const net = new THREE.Mesh(new THREE.PlaneGeometry(36, 16), netMat);
    net.position.set(sx * (GOAL_X + 10), 9, 0);
    net.rotation.y = Math.PI / 2;
    const poleMat = new THREE.MeshStandardMaterial({ color: "#2b2e33", roughness: 0.6, metalness: 0.5 });
    group.add(net);
    for (const z of [-18, 18]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 17, 8), poleMat);
      pole.position.set(sx * (GOAL_X + 10), 8.5, z);
      group.add(pole);
    }
  }

  // --------------------------------------------------------- LED fence
  const ads = adTexture();
  ads.repeat.set(4, 1);
  const led = new THREE.MeshStandardMaterial({ map: ads, emissiveMap: ads, emissive: "#ffffff", emissiveIntensity: 0.55, roughness: 0.4, side: THREE.DoubleSide });
  const fence = new THREE.Mesh(
    bowlBand(segs, 1, (t, s) => {
      const [x, z] = ring(t, 7);
      return new THREE.Vector3(x, s * 0.95, z);
    }, 120, 1),
    led,
  );
  group.add(fence);
  const fenceBack = new THREE.Mesh(
    bowlBand(segs, 1, (t, s) => {
      const [x, z] = ring(t, 7.35);
      return new THREE.Vector3(x, s * 0.95, z);
    }, 8, 1),
    new THREE.MeshStandardMaterial({ color: "#20242a", roughness: 0.8 }),
  );
  group.add(fenceBack);

  // ------------------------------------------------------------ stands
  const concrete = new THREE.MeshStandardMaterial({ color: "#8d8c86", roughness: 0.92 });
  const dark = new THREE.MeshStandardMaterial({ color: "#2a2d33", roughness: 0.85, side: THREE.DoubleSide });
  const lowerSeats = seatTexture("#1e3a7a", 0.82);
  const upperSeats = seatTexture("#7a1f2a", 0.78);
  const tierMesh = (tier: Tier, tex: THREE.Texture) => {
    const rake = Math.hypot(tier.d1 - tier.d0, tier.y1 - tier.y0);
    const g = bowlBand(segs, 2, (t, s) => {
      const [x, z] = ring(t, tier.d0 + (tier.d1 - tier.d0) * s);
      return new THREE.Vector3(x, tier.y0 + (tier.y1 - tier.y0) * s, z);
    }, 16, rake / 6.8);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    return m;
  };
  group.add(tierMesh(LOWER, lowerSeats), tierMesh(UPPER, upperSeats));
  const wall = (d: number, y0: number, y1: number, mat: THREE.Material, uLen = 8) =>
    new THREE.Mesh(
      bowlBand(segs, 1, (t, s) => {
        const [x, z] = ring(t, d);
        return new THREE.Vector3(x, y0 + (y1 - y0) * s, z);
      }, uLen, 1),
      mat,
    );
  group.add(wall(LOWER.d0, 0, LOWER.y0, concrete));
  group.add(wall(LOWER.d1, LOWER.y1, LOWER.y1 + 2.5, dark));
  // Upper-tier fascia: a second LED ribbon.
  const ads2 = adTexture();
  ads2.repeat.set(5, 1);
  const led2 = new THREE.MeshStandardMaterial({ map: ads2, emissiveMap: ads2, emissive: "#ffffff", emissiveIntensity: 0.6, roughness: 0.4, side: THREE.DoubleSide });
  group.add(wall(UPPER.d0 - 0.2, UPPER.y0 - 2.6, UPPER.y0, led2, 120));
  // Concourse floor between the tiers and the back wall.
  group.add(
    new THREE.Mesh(
      bowlBand(segs, 1, (t, s) => {
        const [x, z] = ring(t, LOWER.d1 + s * (UPPER.d0 - LOWER.d1));
        return new THREE.Vector3(x, LOWER.y1 + 2.5, z);
      }, 8, 1),
      dark,
    ),
  );
  group.add(wall(UPPER.d1, UPPER.y1, 46, dark));
  // The roof: cantilevered, dark underside with a light strip at the lip.
  const roofMat = new THREE.MeshStandardMaterial({ color: "#3a3e45", roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });
  const roof = new THREE.Mesh(
    bowlBand(segs, 2, (t, s) => {
      const [x, z] = ring(t, 36 + s * 34);
      return new THREE.Vector3(x, 45.5 + s * 1.2, z);
    }, 10, 1),
    roofMat,
  );
  roof.castShadow = high;
  group.add(roof);
  const lipMat = new THREE.MeshStandardMaterial({ color: "#d9dde3", emissive: "#fff6df", emissiveIntensity: 0, roughness: 0.5 });
  group.add(wall(36, 44.6, 45.5, lipMat));

  // ------------------------------------------------------------- crowd
  const occupancy = detail === "ultra" ? 0.5 : detail === "high" ? 0.3 : 0.07;
  const seats: { x: number; y: number; z: number; h: number }[] = [];
  let rs = 12345;
  const rr = () => ((rs = (rs * 16807) % 2147483647) - 1) / 2147483646;
  for (const tier of [LOWER, UPPER]) {
    const rake = Math.hypot(tier.d1 - tier.d0, tier.y1 - tier.y0);
    const rows = Math.floor(rake / 0.85);
    for (let j = 0; j < rows; j++) {
      const s = (j + 0.6) / rows;
      const d = tier.d0 + (tier.d1 - tier.d0) * s;
      const y = tier.y0 + (tier.y1 - tier.y0) * s;
      // Seats around this row: ~0.55 m apart.
      const perim = Math.PI * (3 * (A + B + 2 * d) - Math.sqrt((3 * (A + d) + B + d) * (A + d + 3 * (B + d))));
      const n = Math.floor(perim / 0.55);
      for (let i = 0; i < n; i++) {
        if (rr() > occupancy) continue;
        const t = ((i + rr() * 0.2) / n) * Math.PI * 2;
        const [x, z] = ring(t, d);
        // Leave the screens' sections.
        if (tier === UPPER && Math.abs(z) < 20) continue;
        seats.push({ x, y: y - 0.1, z, h: Math.atan2(-z * 0.8, -x) });
      }
    }
  }
  const shirts = [home.guernsey, home.hoop, away.guernsey, away.hoop, "#ffffff", "#15171d", "#3a4250", "#6b7280", "#1e3a5f", "#7c2d12", "#d6d3d1", home.guernsey, away.guernsey];
  group.add(buildCrowd(seats, shirts, high, uniforms));

  // -------------------------------------------------------- light towers
  const towerMat = new THREE.MeshStandardMaterial({ color: "#9aa1aa", roughness: 0.5, metalness: 0.6 });
  const lamp = lampTexture();
  const lampMats: THREE.MeshStandardMaterial[] = [];
  const glows: THREE.Sprite[] = [];
  const towers: THREE.Vector3[] = [];
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: "#fff6e0", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  for (const t of [0.5, Math.PI / 2, Math.PI - 0.5, Math.PI + 0.5, -Math.PI / 2, -0.5]) {
    const [x, z] = ring(t, 78);
    const h = 82;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.8, h, 8), towerMat);
    tower.position.set(x, h / 2, z);
    group.add(tower);
    const head = new THREE.Group();
    head.position.set(x, h + 3, z);
    head.lookAt(0, 0, 0);
    const lm = new THREE.MeshStandardMaterial({ map: lamp, emissiveMap: lamp, emissive: "#fff8e8", emissiveIntensity: 0.2, roughness: 0.5 });
    lampMats.push(lm);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(18, 9, 1.2), [towerMat, towerMat, towerMat, towerMat, lm, towerMat]);
    head.add(panel);
    group.add(head);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(60, 60, 1);
    const toC = new THREE.Vector3(-x, -h, -z).normalize();
    glow.position.set(x, h + 3, z).addScaledVector(toC, 2);
    glows.push(glow);
    group.add(glow);
    towers.push(new THREE.Vector3(x, h + 3, z));
  }

  // -------------------------------------------------------------- screens
  const sc2 = screenCanvas();
  const screenTex = new THREE.CanvasTexture(sc2);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshStandardMaterial({ map: screenTex, emissiveMap: screenTex, emissive: "#ffffff", emissiveIntensity: 0.9, roughness: 0.3 });
  const frameMat = new THREE.MeshStandardMaterial({ color: "#16181c", roughness: 0.7 });
  for (const sx of [-1, 1]) {
    const scr = new THREE.Group();
    const [x] = ring(sx > 0 ? 0 : Math.PI, 48);
    scr.position.set(x, 28.5, 0);
    scr.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(33, 12.4), screenMat);
    face.position.z = 0.65;
    scr.add(new THREE.Mesh(new THREE.BoxGeometry(35, 14.4, 1.2), frameMat), face);
    group.add(scr);
  }

  return {
    group,
    crowd: uniforms,
    ads,
    screen: { canvas: sc2, texture: screenTex },
    lampMats: [...lampMats, lipMat],
    glows,
    towers,
    ground,
    ledMats: [led, led2, screenMat],
  };
}
