import * as THREE from "three";

/** Geometry helpers for stadiums: bands swept along a path, ribbons painted on the ground. */

/** A point on the field's edge path with its outward normal. */
export interface Edge {
  x: number;
  z: number;
  nx: number;
  nz: number;
}

/** A surface swept along an edge path: f(s) gives [offset, height] across the band (s 0–1). */
export function band(path: Edge[], rows: number, f: (s: number, e: Edge, i: number) => [number, number], uLen: number, vLen: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let u = 0;
  for (let i = 0; i < path.length; i++) {
    const e = path[i];
    if (i > 0) u += Math.hypot(e.x - path[i - 1].x, e.z - path[i - 1].z);
    for (let j = 0; j <= rows; j++) {
      const s = j / rows;
      const [d, y] = f(s, e, i);
      pos.push(e.x + e.nx * d, y, e.z + e.nz * d);
      uv.push(u / uLen, s * vLen);
    }
  }
  for (let i = 0; i < path.length - 1; i++)
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

/** A flat ribbon on the ground along a polyline. */
export function ribbon(pts: [number, number][], w: number, y = 0.012) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const p = pts[i];
    pos.push(p[0] - dz * w * 0.5, y, p[1] + dx * w * 0.5, p[0] + dz * w * 0.5, y, p[1] - dx * w * 0.5);
    if (i) idx.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, i * 2, i * 2 + 1, (i - 1) * 2 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}


/** A rounded rectangle (half sizes hx × hz, corner radius r), closed, with outward normals. */
export function roundRect(hx: number, hz: number, r: number, perCorner = 8): Edge[] {
  const out: Edge[] = [];
  const corners: [number, number, number][] = [
    [hx - r, hz - r, 0],
    [-(hx - r), hz - r, Math.PI / 2],
    [-(hx - r), -(hz - r), Math.PI],
    [hx - r, -(hz - r), (3 * Math.PI) / 2],
  ];
  for (const [cx, cz, a0] of corners)
    for (let i = 0; i <= perCorner; i++) {
      const a = a0 + (i / perCorner) * (Math.PI / 2);
      out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, nx: Math.cos(a), nz: Math.sin(a) });
    }
  out.push({ ...out[0] });
  return out;
}
