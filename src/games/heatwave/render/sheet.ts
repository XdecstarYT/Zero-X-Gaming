import * as THREE from "three";

/**
 * Geometry builders. A Sheet collects flat quads (walls, floors, roads) with a colour per vertex;
 * a FacadeSheet also carries the facade shader's inputs (type, storey height, ground floor, seed,
 * trim colour and shopfront flag) so many buildings merge into one mesh and one draw call.
 */
export class Sheet {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  protected pushVert(v: number[], t: number[], n: number[], col: THREE.Color) {
    this.pos.push(v[0], v[1], v[2]);
    this.uv.push(t[0], t[1]);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(col.r, col.g, col.b);
  }
  quad(a: number[], b: number[], c: number[], d: number[], uv: number[][], n: number[], col: THREE.Color) {
    for (const [v, t] of [[a, uv[0]], [b, uv[1]], [c, uv[2]], [a, uv[0]], [c, uv[2]], [d, uv[3]]] as [number[], number[]][]) this.pushVert(v, t, n, col);
  }
  tri(a: number[], b: number[], c: number[], n: number[], col: THREE.Color) {
    for (const v of [a, b, c]) this.pushVert(v, [v[0], v[2]], n, col);
  }
  /** A vertical wall from a to b (outside on the left-to-right view), y0..y1. */
  wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, u1: number, v0: number, v1: number, n: number[], col: THREE.Color) {
    this.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [[0, v0], [u1, v0], [u1, v1], [0, v1]], n, col);
  }
  /** A flat rectangle (x0..x1, z0..z1) at height y, facing up, UVs in metres / tile. */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, col: THREE.Color, tile = 1) {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [[x0 / tile, z1 / tile], [x1 / tile, z1 / tile], [x1 / tile, z0 / tile], [x0 / tile, z0 / tile]], [0, 1, 0], col);
  }
  /** Four walls of a box from y0 to y1 (no top). */
  walls(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, col: THREE.Color) {
    this.wall(x1, z0, x0, z0, y0, y1, 1, 0, 1, [0, 0, -1], col);
    this.wall(x1, z1, x1, z0, y0, y1, 1, 0, 1, [1, 0, 0], col);
    this.wall(x0, z1, x1, z1, y0, y1, 1, 0, 1, [0, 0, 1], col);
    this.wall(x0, z0, x0, z1, y0, y1, 1, 0, 1, [-1, 0, 0], col);
  }
  get empty() {
    return this.pos.length === 0;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

export interface Look {
  type: number;
  floor: number;
  gf: number;
  seed: number;
  accent: THREE.Color;
  shop: boolean;
}

export class FacadeSheet extends Sheet {
  fac: number[] = [];
  acc: number[] = [];
  look: Look = { type: 1, floor: 3.6, gf: 4, seed: 0, accent: new THREE.Color("#333333"), shop: false };
  protected pushVert(v: number[], t: number[], n: number[], col: THREE.Color) {
    super.pushVert(v, t, n, col);
    const L = this.look;
    this.fac.push(L.type, L.floor, L.gf, L.seed);
    this.acc.push(L.accent.r, L.accent.g, L.accent.b, L.shop ? 1 : 0);
  }
  geometry() {
    const g = super.geometry();
    g.setAttribute("aFac", new THREE.Float32BufferAttribute(this.fac, 4));
    g.setAttribute("aAcc", new THREE.Float32BufferAttribute(this.acc, 4));
    return g;
  }
}
