import * as THREE from "three";

/**
 * An instanced crowd for any stand: seated supporters (body + head, two draw
 * calls) who bob along, and stand, jump and throw their arms up on `uCheer`.
 */

export interface CrowdUniforms {
  uTime: { value: number };
  uCheer: { value: number };
}

export interface Seat {
  x: number;
  y: number;
  z: number;
  /** Facing (radians; they face (cos h, sin h)). */
  h: number;
}

export const crowdUniforms = (): CrowdUniforms => ({ uTime: { value: 0 }, uCheer: { value: 0 } });

/** Crowd shader: everyone bobs a little; on a goal they're up, arms in the air, jumping. */
export function crowdMaterial(uniforms: CrowdUniforms, arms: boolean) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: arms });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uCheer = uniforms.uCheer;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\nattribute float aSeed;\n${arms ? "attribute float aArm;\n" : ""}uniform float uTime;\nuniform float uCheer;`)
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
        float ph = uTime * (5.5 + aSeed * 4.0) + aSeed * 40.0;
        float up = uCheer * (0.75 + 0.25 * aSeed);
        ${arms ? "if (aArm > 0.5) transformed.y = mix(transformed.y, 1.9 - transformed.y, clamp(up * (0.7 + 0.3 * sin(ph * 0.5)), 0.0, 1.0));" : ""}
        transformed.y += up * (0.32 + max(0.0, sin(ph)) * 0.22) + sin(uTime * 0.9 + aSeed * 60.0) * 0.012;`,
      );
  };
  return m;
}

/** A seated supporter facing +x: torso, arms (flagged for the cheer), thighs. Head is separate. */
export function personGeometry() {
  const parts: [THREE.BufferGeometry, number, number][] = [
    // geometry, arm flag, shade
    [new THREE.BoxGeometry(0.26, 0.55, 0.42).translate(0, 0.68, 0), 0, 1],
    [new THREE.BoxGeometry(0.1, 0.46, 0.1).translate(0.02, 0.72, 0.26), 1, 0.92],
    [new THREE.BoxGeometry(0.1, 0.46, 0.1).translate(0.02, 0.72, -0.26), 1, 0.92],
    [new THREE.BoxGeometry(0.42, 0.14, 0.34).translate(0.2, 0.42, 0), 0, 0.55],
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const arm: number[] = [];
  for (const [g0, a, s] of parts) {
    const g = g0.toNonIndexed();
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(s, s, s);
      arm.push(a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("aArm", new THREE.Float32BufferAttribute(arm, 1));
  return g;
}


/** Seat everyone, in `shirts` colours with a spread of skin tones. */
export function buildCrowd(seats: Seat[], shirts: string[], high: boolean, uniforms: CrowdUniforms, seed = 12345) {
  let rs = seed;
  const rr = () => ((rs = (rs * 16807) % 2147483647) - 1) / 2147483646;
  const count = seats.length;
  const bodyGeo = personGeometry();
  const headGeo = new THREE.IcosahedronGeometry(0.11, high ? 1 : 0).translate(0.02, 1.07, 0);
  const seedAttr = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  for (let i = 0; i < count; i++) seedAttr.setX(i, rr());
  bodyGeo.setAttribute("aSeed", seedAttr);
  headGeo.setAttribute("aSeed", seedAttr);
  const bodies = new THREE.InstancedMesh(bodyGeo, crowdMaterial(uniforms, true), count);
  const heads = new THREE.InstancedMesh(headGeo, crowdMaterial(uniforms, false), count);
  const skins = ["#f1c9a5", "#e0ac84", "#c68c5d", "#8d5a3b", "#5a3a28", "#f5d6b8"];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const s = seats[i];
    q.setFromAxisAngle(up, -s.h);
    const k = 0.92 + rr() * 0.16;
    sc.set(k, k, k);
    m4.compose(new THREE.Vector3(s.x, s.y, s.z), q, sc);
    bodies.setMatrixAt(i, m4);
    heads.setMatrixAt(i, m4);
    bodies.setColorAt(i, col.set(shirts[Math.floor(rr() * shirts.length)]));
    heads.setColorAt(i, col.set(skins[Math.floor(rr() * skins.length)]));
  }
  bodies.frustumCulled = heads.frustumCulled = false;
  const g = new THREE.Group();
  g.add(bodies, heads);
  return g;
}
