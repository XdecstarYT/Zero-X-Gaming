import { wallAt, type GameMap } from "./map";

/**
 * A* on the arena grid, 8-directional without cutting wall corners.
 * Returns cell-centre waypoints from (but excluding) the start to the goal,
 * or null when the goal is unreachable.
 */
export function findPath(
  map: GameMap,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  maxNodes = 2000,
): { x: number; y: number }[] | null {
  const start = { x: Math.floor(sx), y: Math.floor(sy) };
  const goal = { x: Math.floor(gx), y: Math.floor(gy) };
  if (wallAt(map, goal.x, goal.y) !== 0) return null;
  if (start.x === goal.x && start.y === goal.y) return [];

  const W = map.width;
  const key = (x: number, y: number) => y * W + x;
  const g = new Map<number, number>([[key(start.x, start.y), 0]]);
  const came = new Map<number, number>();
  const open: { k: number; f: number }[] = [{ k: key(start.x, start.y), f: 0 }];
  const closed = new Set<number>();
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - goal.x);
    const dy = Math.abs(y - goal.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };

  let expanded = 0;
  while (open.length && expanded < maxNodes) {
    // Small maps: a linear scan for the best node is fast and simpler than a heap.
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const { k } = open.splice(bi, 1)[0];
    if (closed.has(k)) continue;
    closed.add(k);
    expanded++;
    const cx = k % W;
    const cy = (k - cx) / W;
    if (cx === goal.x && cy === goal.y) {
      const path: { x: number; y: number }[] = [];
      let cur = k;
      while (cur !== key(start.x, start.y)) {
        const x = cur % W;
        path.push({ x: x + 0.5, y: (cur - x) / W + 0.5 });
        cur = came.get(cur)!;
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
        const nk = key(nx, ny);
        if (closed.has(nk)) continue;
        const ng = g.get(k)! + (dx && dy ? Math.SQRT2 : 1);
        if (ng < (g.get(nk) ?? Infinity)) {
          g.set(nk, ng);
          came.set(nk, k);
          open.push({ k: nk, f: ng + h(nx, ny) });
        }
      }
  }
  return null;
}
