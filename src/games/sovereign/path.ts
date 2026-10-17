/**
 * Paths over the city grid (A*): armies walk through land they may enter (their own, allies',
 * enemies' and where they have access) and ship across the sea; fleets keep to the water and
 * put in at friendly ports.
 */
import type { State } from "./state";
import type { World } from "./world";

export type Mode = "land" | "sea";

let cityCell: Int32Array | null = null;
let cityCellWorld: World | null = null;
/** The city whose point is in each grid cell (ports, for fleets), or -1. */
function cityCells(world: World) {
  if (cityCell && cityCellWorld === world) return cityCell;
  const g = world.grid;
  cityCell = new Int32Array(g.w * g.h).fill(-1);
  for (const c of world.cities) cityCell[Math.floor(c.y / g.cell) * g.w + Math.floor(c.x / g.cell)] = c.id;
  cityCellWorld = world;
  return cityCell;
}

let open: Int32Array;
let score: Float64Array;
let came: Int32Array;
let gCost: Float64Array;
let stamp: Int32Array;
let run = 0;

/** Who you may walk through: yourself, allies, overlord and subjects, access, and anyone you're at war with. */
export function passable(s: State, n: number, atWarWith: (a: number, b: number) => boolean) {
  const ok = new Uint8Array(s.nations.length);
  const me = s.nations[n];
  ok[n] = 1;
  for (const o of s.nations) {
    if (o.id === n || !o.alive) continue;
    if ((me.alliance >= 0 && o.alliance === me.alliance) || o.overlord === n || me.overlord === o.id || me.access.includes(o.id) || atWarWith(n, o.id)) ok[o.id] = 1;
  }
  return ok;
}

/**
 * A path from (x0,y0) to (x1,y1) as waypoints [x,y,...] in map px, or null if there's no way.
 * `ok` marks nations whose land may be entered.
 */
export function findPath(s: State, world: World, x0: number, y0: number, x1: number, y1: number, mode: Mode, ok: Uint8Array, maxSteps = 260000): number[] | null {
  const g = world.grid;
  const W = g.w;
  const H = g.h;
  const size = W * H;
  if (!stamp || stamp.length !== size) {
    open = new Int32Array(size);
    score = new Float64Array(size);
    came = new Int32Array(size);
    gCost = new Float64Array(size);
    stamp = new Int32Array(size);
    run = 0;
  }
  run++;
  const cc = cityCells(world);
  const sx = Math.max(0, Math.min(W - 1, Math.floor(x0 / g.cell)));
  const sy = Math.max(0, Math.min(H - 1, Math.floor(y0 / g.cell)));
  const tx = Math.max(0, Math.min(W - 1, Math.floor(x1 / g.cell)));
  const ty = Math.max(0, Math.min(H - 1, Math.floor(y1 / g.cell)));
  const start = sy * W + sx;
  const goal = ty * W + tx;
  const cost = (i: number) => {
    if (i === start) return 1;
    const v = g.data[i];
    if (mode === "land") {
      if (!v) return 3.2;
      return ok[s.cities[v - 1].owner] ? 1 : -1;
    }
    if (!v) return 1;
    const c = cc[i];
    return c >= 0 && ok[s.cities[c].owner] ? 1.5 : -1;
  };
  if (cost(goal) < 0) return null;
  // Binary heap of cells by f = g + h.
  let heap = 0;
  const push = (i: number, f: number) => {
    score[i] = f;
    let k = heap++;
    open[k] = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (score[open[p]] <= f) break;
      open[k] = open[p];
      open[p] = i;
      k = p;
    }
  };
  const pop = () => {
    const top = open[0];
    const last = open[--heap];
    let k = 0;
    const f = score[last];
    for (;;) {
      const l = k * 2 + 1;
      if (l >= heap) break;
      const r = l + 1;
      const m = r < heap && score[open[r]] < score[open[l]] ? r : l;
      if (score[open[m]] >= f) break;
      open[k] = open[m];
      k = m;
    }
    open[k] = last;
    return top;
  };
  const h = (i: number) => {
    const dx = Math.abs((i % W) - tx);
    const dy = Math.abs(((i / W) | 0) - ty);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  stamp[start] = run;
  gCost[start] = 0;
  came[start] = -1;
  push(start, h(start));
  // stamp: run = seen, -run = closed.
  let steps = 0;
  let found = false;
  while (heap > 0 && steps++ < maxSteps) {
    const i = pop();
    if (stamp[i] === -run) continue;
    stamp[i] = -run;
    if (i === goal) {
      found = true;
      break;
    }
    const x = i % W;
    const y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (stamp[j] === -run) continue;
        const c = cost(j);
        if (c < 0) continue;
        // No squeezing diagonally between two blocked cells.
        if (dx && dy && (cost(y * W + nx) < 0 || cost(ny * W + x) < 0)) continue;
        const ng = gCost[i] + c * (dx && dy ? 1.414 : 1);
        if (stamp[j] === run && ng >= gCost[j]) continue;
        stamp[j] = run;
        gCost[j] = ng;
        came[j] = i;
        push(j, ng + h(j));
      }
  }
  if (!found) return null;
  // Walk back, keeping only the turns.
  const cells: number[] = [];
  for (let i = goal; i !== -1; i = came[i]) cells.push(i);
  cells.reverse();
  const out: number[] = [];
  let pdx = 99;
  let pdy = 99;
  for (let k = 1; k < cells.length; k++) {
    const a = cells[k - 1];
    const b = cells[k];
    const dx = (b % W) - (a % W);
    const dy = ((b / W) | 0) - ((a / W) | 0);
    if ((dx !== pdx || dy !== pdy) && k > 1) out.push(((a % W) + 0.5) * g.cell, (((a / W) | 0) + 0.5) * g.cell);
    pdx = dx;
    pdy = dy;
  }
  out.push(x1, y1);
  return out;
}
