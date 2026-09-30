import { wallAt, type GameMap } from "./map";

/** Minimal binary min-heap keyed by f-score. */
class Heap {
  private k: number[] = [];
  private f: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, score: number) {
    this.k.push(key);
    this.f.push(score);
    let i = this.k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[p] <= this.f[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.k[0];
    const lastK = this.k.pop()!;
    const lastF = this.f.pop()!;
    if (this.k.length) {
      this.k[0] = lastK;
      this.f[0] = lastF;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.k.length && this.f[l] < this.f[m]) m = l;
        if (r < this.k.length && this.f[r] < this.f[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.k[a], this.k[b]] = [this.k[b], this.k[a]];
    [this.f[a], this.f[b]] = [this.f[b], this.f[a]];
  }
}

/**
 * A* on the arena grid, 8-directional without cutting wall corners.
 * Returns cell-centre waypoints from (but excluding) the start to the goal,
 * or null when the goal is unreachable within `maxNodes` expansions.
 */
export function findPath(
  map: GameMap,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  maxNodes = Math.max(6000, (map.width * map.height) >> 1),
): { x: number; y: number }[] | null {
  const start = { x: Math.floor(sx), y: Math.floor(sy) };
  const goal = { x: Math.floor(gx), y: Math.floor(gy) };
  if (wallAt(map, goal.x, goal.y) !== 0) return null;
  if (start.x === goal.x && start.y === goal.y) return [];

  const W = map.width;
  const N = W * map.height;
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const startK = start.y * W + start.x;
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - goal.x);
    const dy = Math.abs(y - goal.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  g[startK] = 0;
  const open = new Heap();
  open.push(startK, h(start.x, start.y));

  let expanded = 0;
  while (open.size && expanded < maxNodes) {
    const k = open.pop();
    if (closed[k]) continue;
    closed[k] = 1;
    expanded++;
    const cx = k % W;
    const cy = (k - cx) / W;
    if (cx === goal.x && cy === goal.y) {
      const path: { x: number; y: number }[] = [];
      let cur = k;
      while (cur !== startK) {
        const x = cur % W;
        path.push({ x: x + 0.5, y: (cur - x) / W + 0.5 });
        cur = came[cur];
      }
      return path.reverse();
    }
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (wallAt(map, nx, ny) !== 0) continue;
        if (dx && dy && (wallAt(map, cx + dx, cy) !== 0 || wallAt(map, cx, cy + dy) !== 0)) continue;
        const nk = ny * W + nx;
        if (closed[nk]) continue;
        const ng = g[k] + (dx && dy ? Math.SQRT2 : 1);
        if (ng < g[nk]) {
          g[nk] = ng;
          came[nk] = k;
          open.push(nk, ng + h(nx, ny));
        }
      }
  }
  return null;
}
