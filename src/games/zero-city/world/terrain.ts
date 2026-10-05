import { CELL, CELLS, CHUNK, WATER_LEVEL } from "../config";

/**
 * The heightfield: (CELLS + 1)² vertex heights in metres, CELL metres apart,
 * with the origin at the map's corner. Below WATER_LEVEL is water. Edits mark
 * 64 × 64-cell chunks dirty so the renderer can rebuild just those.
 */
export class Terrain {
  readonly n = CELLS + 1;
  readonly h: Float32Array;
  readonly dirty = new Set<number>();
  /** Vertices shaped by road grading (drawn as verge grass, not bare rock). */
  readonly graded: Uint8Array;
  /** Bumped on every edit (renderers compare it). */
  version = 0;

  constructor(h?: Float32Array) {
    this.h = h ?? new Float32Array(this.n * this.n);
    this.graded = new Uint8Array(this.n * this.n);
  }

  at(i: number, j: number) {
    i = i < 0 ? 0 : i > CELLS ? CELLS : i;
    j = j < 0 ? 0 : j > CELLS ? CELLS : j;
    return this.h[j * this.n + i];
  }

  /** Bilinear height at world (x, z). */
  heightAt(x: number, z: number) {
    const fx = x / CELL;
    const fz = z / CELL;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const a = this.at(i, j);
    const b = this.at(i + 1, j);
    const c = this.at(i, j + 1);
    const d = this.at(i + 1, j + 1);
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  /** Ground height, never below the water surface (what sits on top of it). */
  surfaceAt(x: number, z: number) {
    return Math.max(WATER_LEVEL, this.heightAt(x, z));
  }

  isWater(x: number, z: number) {
    return this.heightAt(x, z) < WATER_LEVEL + 0.3;
  }

  /** Steepest rise over one cell, in metres per metre. */
  slopeAt(x: number, z: number) {
    const e = CELL;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  set(i: number, j: number, v: number) {
    if (i < 0 || j < 0 || i > CELLS || j > CELLS) return;
    this.h[j * this.n + i] = v;
    this.markDirty(i, j);
  }

  markDirty(i: number, j: number) {
    const per = CELLS / CHUNK;
    // A vertex on a chunk border belongs to both neighbours.
    for (const di of [0, -1])
      for (const dj of [0, -1]) {
        const ci = Math.floor((i + di) / CHUNK);
        const cj = Math.floor((j + dj) / CHUNK);
        if (ci >= 0 && cj >= 0 && ci < per && cj < per) this.dirty.add(cj * per + ci);
      }
    this.version++;
  }

  /** Apply fn to every vertex within radius r (metres) of (x, z); fn gets the falloff weight 0–1. */
  brush(x: number, z: number, r: number, fn: (h: number, w: number, i: number, j: number) => number) {
    const i0 = Math.max(0, Math.floor((x - r) / CELL));
    const i1 = Math.min(CELLS, Math.ceil((x + r) / CELL));
    const j0 = Math.max(0, Math.floor((z - r) / CELL));
    const j1 = Math.min(CELLS, Math.ceil((z + r) / CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i * CELL - x, j * CELL - z);
        if (d > r) continue;
        const w = 0.5 + 0.5 * Math.cos((d / r) * Math.PI);
        this.set(i, j, fn(this.h[j * this.n + i], w, i, j));
      }
  }
}
