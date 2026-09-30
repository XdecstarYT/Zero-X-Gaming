import { createSurface, clearSurface, type Surface } from "../engine/canvas";
import { outfitOf } from "./cosmetics";
import { RARITY, WEAPONS } from "./items";
import { castRay, SOLID } from "./map";
import { activeWeapon, type Entity, type World } from "./world";
import { FOV_DEG, zoomFor, type ViewFx, type ViewRenderer } from "./view";

/**
 * Canvas 2D raycaster: the fallback view when WebGL isn't available.
 * Same world, same HUD; flat-shaded but with the realistic palette.
 */

export const VIEW_W = 640;
export const VIEW_H = 360;
const COLUMNS = 320;
const COL_W = VIEW_W / COLUMNS;

const WALL_RGB: Record<number, [number, number, number]> = {
  [SOLID.concrete]: [150, 150, 146],
  [SOLID.brick]: [146, 74, 52],
  [SOLID.perimeter]: [96, 98, 94],
  [SOLID.tree]: [52, 84, 40],
  [SOLID.crate]: [140, 104, 62],
  [SOLID.rock]: [118, 114, 106],
  [SOLID.fence]: [120, 96, 70],
};

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class CanvasView implements ViewRenderer {
  readonly kind = "2d" as const;
  private surface: Surface;

  constructor(root: HTMLElement) {
    this.surface = createSurface(root, VIEW_W, VIEW_H, "Neon Siege first-person view");
  }

  get canvas() {
    return this.surface.canvas;
  }

  destroy() {
    this.surface.destroy();
  }

  render(world: World, me: Entity, fx: ViewFx) {
    const ctx = this.surface.ctx;
    clearSurface(this.surface, "#101418");
    const W = VIEW_W;
    const H = VIEW_H;
    const horizon = H / 2;
    const w = activeWeapon(me);
    const zoom = zoomFor(w ? WEAPONS[w.kind].zoom : 1, fx.ads);
    const tanHalf = Math.tan((FOV_DEG * Math.PI) / 360) / zoom;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();

    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#5f8fc4");
    sky.addColorStop(1, "#c9dbe8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon);
    const ground = ctx.createLinearGradient(0, horizon, 0, H);
    ground.addColorStop(0, "#7d8a62");
    ground.addColorStop(1, "#4d6334");
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, W, H - horizon);

    const zbuf = new Float32Array(COLUMNS);
    for (let i = 0; i < COLUMNS; i++) {
      const camX = (2 * (i + 0.5)) / COLUMNS - 1;
      const rayA = me.angle + Math.atan(camX * tanHalf);
      const hit = castRay(world.map, me.x, me.y, rayA);
      const perp = Math.max(0.05, hit.dist * Math.cos(rayA - me.angle));
      zbuf[i] = perp;
      const lineH = Math.min(H * 6, H / (perp * tanHalf * 1.5));
      const top = horizon - lineH / 2;
      const [r, g, b] = WALL_RGB[hit.wall] ?? WALL_RGB[SOLID.concrete];
      const fog = Math.min(1, perp / 60);
      const light = (hit.side ? 0.78 : 1) * (0.85 + 0.15 * Math.sin(hit.u * Math.PI));
      const mix = (c: number, f: number) => (c * light * (1 - fog) + f * fog) | 0;
      ctx.fillStyle = `rgb(${mix(r, 190)},${mix(g, 205)},${mix(b, 215)})`;
      ctx.fillRect(i * COL_W, top, COL_W + 0.5, lineH);
    }

    // Sprites: loot, chests and fighters, far to near.
    type Sprite = { x: number; y: number; draw: (sx: number, h: number, feet: number, perp: number) => void };
    const sprites: Sprite[] = [];
    for (const c of world.chests)
      if (!c.opened)
        sprites.push({
          x: c.x,
          y: c.y,
          draw: (sx, h, feet) => {
            ctx.fillStyle = "#8a5a22";
            ctx.fillRect(sx - h * 0.22, feet - h * 0.3, h * 0.44, h * 0.3);
            ctx.fillStyle = "#e0b43c";
            ctx.fillRect(sx - h * 0.22, feet - h * 0.3, h * 0.44, h * 0.05);
          },
        });
    for (const l of world.loot.values())
      sprites.push({
        x: l.x,
        y: l.y,
        draw: (sx, h, feet) => {
          const color = l.item.type === "weapon" ? RARITY[l.item.rarity].color : l.item.kind === "medkit" ? "#e8e8e8" : "#3c9bff";
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(sx - h * 0.02, feet - h * 0.5, h * 0.04, h * 0.5);
          ctx.globalAlpha = 1;
          ctx.fillRect(sx - h * 0.14, feet - h * 0.08, h * 0.28, h * 0.07);
        },
      });
    for (const e of world.entities.values()) {
      if (e.id === me.id || (!e.alive && world.time - e.hurtAt > 1.5)) continue;
      const o = outfitOf(e.outfit);
      sprites.push({
        x: e.x,
        y: e.y,
        draw: (sx, h, feet, perp) => {
          const bw = h * 0.36;
          const hurt = world.time - e.hurtAt < 0.08;
          if (!e.alive) {
            ctx.globalAlpha = Math.max(0, 1 - (world.time - e.hurtAt) / 1.5);
            ctx.fillStyle = o.top;
            ctx.fillRect(sx - bw, feet - h * 0.06, bw * 2, h * 0.06);
            ctx.globalAlpha = 1;
            return;
          }
          ctx.fillStyle = o.bottom;
          ctx.fillRect(sx - bw * 0.42, feet - h * 0.46, bw * 0.36, h * 0.46);
          ctx.fillRect(sx + bw * 0.06, feet - h * 0.46, bw * 0.36, h * 0.46);
          ctx.fillStyle = hurt ? "#ffffff" : o.top;
          ctx.fillRect(sx - bw / 2, feet - h * 0.82, bw, h * 0.38);
          ctx.fillStyle = o.accent;
          ctx.fillRect(sx - bw / 2, feet - h * 0.5, bw, h * 0.05);
          ctx.fillStyle = o.skin;
          ctx.beginPath();
          ctx.arc(sx, feet - h * 0.9, bw * 0.3, 0, Math.PI * 2);
          ctx.fill();
          if (o.headgear !== "none") {
            ctx.fillStyle = o.headColor;
            ctx.beginPath();
            ctx.arc(sx, feet - h * 0.92, bw * 0.32, Math.PI, 0);
            ctx.fill();
          }
          if (world.time - e.firedAt < 0.05) {
            ctx.fillStyle = "#ffd27a";
            ctx.beginPath();
            ctx.arc(sx + bw * 0.6, feet - h * 0.64, bw * 0.2, 0, Math.PI * 2);
            ctx.fill();
          }
          if (fx.showNames && perp < 14) {
            ctx.font = "600 10px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.fillStyle = "#ffffff";
            ctx.fillText(e.name, sx, feet - h * 1.05);
          }
        },
      });
    }
    const placed = sprites
      .map((s) => {
        const dx = s.x - me.x;
        const dy = s.y - me.y;
        const rel = wrap(Math.atan2(dy, dx) - me.angle);
        const dist = Math.hypot(dx, dy);
        return { s, rel, perp: dist * Math.cos(rel), dist };
      })
      .filter((p) => p.perp > 0.2 && Math.abs(Math.tan(p.rel)) < tanHalf * 1.3)
      .sort((a, b) => b.dist - a.dist);
    for (const p of placed) {
      const sx = (W / 2) * (1 + Math.tan(p.rel) / tanHalf);
      const h = H / (p.perp * tanHalf * 1.5);
      const col = Math.round(sx / COL_W);
      if (col >= 0 && col < COLUMNS && zbuf[col] < p.perp) continue;
      p.s.draw(sx, h * 0.9, horizon + h / 2, p.perp);
    }

    // Tracers (projected endpoints).
    const project = (x: number, y: number) => {
      const rel = wrap(Math.atan2(y - me.y, x - me.x) - me.angle);
      const d = Math.max(0.3, Math.hypot(x - me.x, y - me.y) * Math.cos(rel));
      return { x: (W / 2) * (1 + Math.tan(rel) / tanHalf), y: horizon + H / (d * tanHalf * 1.5) / 8, ok: Math.cos(rel) > 0.1 };
    };
    for (const t of fx.tracers) {
      const k = 1 - (world.time - t.at) / 0.12;
      if (k <= 0) continue;
      const a = t.shooter === me.id ? { x: W * 0.62, y: H * 0.78, ok: true } : project(t.fromX, t.fromY);
      const b = project(t.toX, t.toY);
      if (!a.ok || !b.ok) continue;
      ctx.strokeStyle = `rgba(255,226,160,${0.7 * k})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Viewmodel.
    if (me.alive && w && fx.ads < 0.9) {
      const recoil = Math.max(0, 1 - (world.time - me.firedAt) / 0.09);
      const bob = fx.reduceMotion ? 0 : Math.sin(fx.bob) * 4;
      const reloading = me.reloadUntil > world.time ? 50 : 0;
      const x = W * (0.64 - 0.14 * fx.ads) + bob;
      const y = H - 64 + Math.abs(bob) + recoil * 8 + reloading;
      const len = w.kind === "sniper" ? 150 : w.kind === "pistol" ? 60 : w.kind === "smg" ? 90 : 120;
      ctx.fillStyle = "#2a2c2f";
      ctx.beginPath();
      ctx.moveTo(x - 20, H + 4);
      ctx.lineTo(x, y + 18);
      ctx.lineTo(x + len * 0.5, y);
      ctx.lineTo(x + len * 0.5 + 10, y + 12);
      ctx.lineTo(x + 40, H + 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = RARITY[w.rarity].color;
      ctx.fillRect(x + 14, y + 16, 26, 3);
      if (recoil > 0.55) {
        ctx.fillStyle = "rgba(255,210,120,0.9)";
        ctx.beginPath();
        ctx.arc(x + len * 0.5 + 6, y + 2, 12 * recoil, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
