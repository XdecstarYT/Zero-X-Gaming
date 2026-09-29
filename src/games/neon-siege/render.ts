import { castRay, wallAt } from "./map";
import { isReloading, MAG_SIZE, type Entity, type World } from "./world";

export const VIEW_W = 640;
export const VIEW_H = 360;
const COLUMNS = 320;
const COL_W = VIEW_W / COLUMNS;
export const FOV = (70 * Math.PI) / 180;
const TAN_HALF = Math.tan(FOV / 2);

const WALL_RGB: Record<number, [number, number, number]> = {
  1: [34, 229, 255],
  2: [255, 43, 214],
  3: [139, 92, 255],
};

export interface KillFeedItem {
  killer: string;
  victim: string;
  at: number;
  mine: boolean;
}

export interface HudState {
  topLeft: string[];
  banner: { text: string; sub?: string; color?: string } | null;
  killFeed: KillFeedItem[];
  /** Recent shots from enemies, shown as radar pings on the minimap. */
  pings: { x: number; y: number; at: number }[];
  hitMarkerAt: number;
  showNames: boolean;
  bob: number;
  reduceMotion: boolean;
  scoreboard: { name: string; kills: number; deaths: number; me: boolean }[] | null;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function renderView(ctx: CanvasRenderingContext2D, world: World, me: Entity, hud: HudState) {
  const t = world.time;
  const W = VIEW_W;
  const H = VIEW_H;
  const horizon = H / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();

  // Sky & floor
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#05060b");
  sky.addColorStop(1, "#1a1240");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);
  const floor = ctx.createLinearGradient(0, horizon, 0, H);
  floor.addColorStop(0, "#0d1a2a");
  floor.addColorStop(1, "#05060b");
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, W, H - horizon);
  // Faux floor grid lines at fixed distances
  ctx.strokeStyle = "rgba(34,229,255,0.12)";
  ctx.lineWidth = 1;
  for (let d = 1; d <= 12; d++) {
    const y = horizon + H / (2 * d);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Walls
  const zbuf = new Float32Array(COLUMNS);
  for (let i = 0; i < COLUMNS; i++) {
    const camX = (2 * (i + 0.5)) / COLUMNS - 1;
    const rayA = me.angle + Math.atan(camX * TAN_HALF);
    const hit = castRay(world.map, me.x, me.y, rayA);
    const perp = Math.max(0.05, hit.dist * Math.cos(rayA - me.angle));
    zbuf[i] = perp;
    const lineH = Math.min(H * 4, H / perp);
    const top = horizon - lineH / 2;
    const [r, g, b] = WALL_RGB[hit.wall] ?? WALL_RGB[1];
    const light = Math.max(0.12, Math.min(1, 1.6 / (1 + perp * 0.35))) * (hit.side ? 0.72 : 1);
    const edge = hit.u < 0.04 || hit.u > 0.96;
    const base = 0.22 * light;
    ctx.fillStyle = `rgb(${(r * base) | 0},${(g * base) | 0},${(b * base) | 0})`;
    ctx.fillRect(i * COL_W, top, COL_W + 0.5, lineH);
    ctx.fillStyle = `rgba(${r},${g},${b},${(edge ? 0.9 : 0.75) * light})`;
    const rim = Math.max(1, lineH * 0.02);
    ctx.fillRect(i * COL_W, top, COL_W + 0.5, rim);
    ctx.fillRect(i * COL_W, top + lineH - rim, COL_W + 0.5, rim);
    if (edge) {
      ctx.fillStyle = `rgba(${r},${g},${b},${0.55 * light})`;
      ctx.fillRect(i * COL_W, top, COL_W + 0.5, lineH);
    }
  }

  // Sprites (other entities), far to near
  const sprites = [...world.entities.values()]
    .filter((e) => e.id !== me.id && (e.alive || t - e.hurtAt < 1.5))
    .map((e) => {
      const dx = e.x - me.x;
      const dy = e.y - me.y;
      const rel = wrap(Math.atan2(dy, dx) - me.angle);
      const dist = Math.hypot(dx, dy);
      return { e, rel, dist, perp: dist * Math.cos(rel) };
    })
    .filter((s) => s.perp > 0.2 && Math.abs(s.rel) < FOV / 2 + 0.3)
    .sort((a, b) => b.dist - a.dist);

  for (const s of sprites) drawSprite(ctx, s.e, s.rel, s.perp, zbuf, t, me, hud.showNames);

  drawWeapon(ctx, me, t, hud);
  drawCrosshair(ctx, t, hud.hitMarkerAt);
  drawDamage(ctx, world, me);
  drawHud(ctx, world, me, hud);
  ctx.restore();
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  rel: number,
  perp: number,
  zbuf: Float32Array,
  t: number,
  me: Entity,
  showNames: boolean,
) {
  const W = VIEW_W;
  const H = VIEW_H;
  const screenX = (W / 2) * (1 + Math.tan(rel) / TAN_HALF);
  const h = H / perp;
  const w = h * 0.42;
  const left = screenX - w / 2;
  const c0 = Math.max(0, Math.floor(left / COL_W));
  const c1 = Math.min(COLUMNS - 1, Math.ceil((left + w) / COL_W));
  if (c1 < c0) return;

  // Clip to columns where the sprite is in front of the wall.
  ctx.save();
  ctx.beginPath();
  let any = false;
  for (let c = c0; c <= c1; c++) {
    if (zbuf[c] > perp) {
      ctx.rect(c * COL_W, 0, COL_W + 0.5, H);
      any = true;
    }
  }
  if (!any) {
    ctx.restore();
    return;
  }
  ctx.clip();

  const feet = H / 2 + h / 2;
  const hurt = t - e.hurtAt < 0.1;
  const enemy = e.team !== me.team;
  const color = enemy ? (e.kind === "bot" ? "#ff2bd6" : "#ff9d2b") : "#22e5ff";
  const fade = e.alive ? 1 : Math.max(0, 1 - (t - e.hurtAt) / 1.5);
  ctx.globalAlpha = fade;

  if (!e.alive) {
    ctx.fillStyle = color;
    ctx.fillRect(screenX - w * 0.6, feet - h * 0.08, w * 1.2, h * 0.08);
  } else {
    // Legs, torso, head, visor
    ctx.fillStyle = hurt ? "#ffffff" : "#1b2038";
    ctx.fillRect(screenX - w * 0.28, feet - h * 0.42, w * 0.22, h * 0.42);
    ctx.fillRect(screenX + w * 0.06, feet - h * 0.42, w * 0.22, h * 0.42);
    const torso = ctx.createLinearGradient(0, feet - h * 0.8, 0, feet - h * 0.4);
    torso.addColorStop(0, hurt ? "#ffffff" : color);
    torso.addColorStop(1, hurt ? "#ffffff" : "#1b2038");
    ctx.fillStyle = torso;
    ctx.fillRect(screenX - w * 0.4, feet - h * 0.8, w * 0.8, h * 0.42);
    ctx.fillStyle = hurt ? "#ffffff" : "#131729";
    ctx.beginPath();
    ctx.arc(screenX, feet - h * 0.88, w * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillRect(screenX - w * 0.2, feet - h * 0.9, w * 0.4, Math.max(1, h * 0.03));
    ctx.shadowBlur = 0;
    // Muzzle flash
    if (t - e.firedAt < 0.06) {
      ctx.fillStyle = "#ffcb3d";
      ctx.beginPath();
      ctx.arc(screenX + w * 0.45, feet - h * 0.62, w * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // Name tag / health bar (only when visible and close enough)
  if (e.alive && perp < 12 && zbuf[Math.min(COLUMNS - 1, Math.max(0, Math.round(screenX / COL_W)))] > perp) {
    const y = feet - h * 1.05;
    if (showNames) {
      ctx.font = "600 10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = enemy ? "#ffd1f4" : "#c9f8ff";
      ctx.fillText(e.name, screenX, y - 6);
    }
    if (e.hp < e.maxHp) {
      const bw = Math.max(18, w * 0.8);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(screenX - bw / 2, y, bw, 3);
      ctx.fillStyle = enemy ? "#ff4d6d" : "#3dffa2";
      ctx.fillRect(screenX - bw / 2, y, (bw * e.hp) / e.maxHp, 3);
    }
  }
}

function drawWeapon(ctx: CanvasRenderingContext2D, me: Entity, t: number, hud: HudState) {
  if (!me.alive) return;
  const W = VIEW_W;
  const H = VIEW_H;
  const recoil = Math.max(0, 1 - (t - me.firedAt) / 0.08);
  const bob = hud.reduceMotion ? 0 : Math.sin(hud.bob) * 4;
  const reloading = me.reloadUntil > t;
  const dip = reloading ? 40 : 0;
  const x = W * 0.62 + bob;
  const y = H - 70 + Math.abs(bob) + recoil * 8 + dip;
  ctx.fillStyle = "#131729";
  ctx.strokeStyle = "#22e5ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 30, H + 5);
  ctx.lineTo(x - 10, y + 20);
  ctx.lineTo(x + 50, y);
  ctx.lineTo(x + 70, y + 12);
  ctx.lineTo(x + 40, H + 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ff2bd6";
  ctx.fillRect(x + 20, y + 14, 26, 4);
  if (recoil > 0.5) {
    ctx.fillStyle = "rgba(255,203,61,0.9)";
    ctx.beginPath();
    ctx.arc(x + 58, y + 2, 12 * recoil, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCrosshair(ctx: CanvasRenderingContext2D, t: number, hitAt: number) {
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;
  ctx.strokeStyle = "rgba(238,241,255,0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy);
  ctx.lineTo(cx - 3, cy);
  ctx.moveTo(cx + 3, cy);
  ctx.lineTo(cx + 8, cy);
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx, cy - 3);
  ctx.moveTo(cx, cy + 3);
  ctx.lineTo(cx, cy + 8);
  ctx.stroke();
  if (t - hitAt < 0.15) {
    ctx.strokeStyle = "#ff4d6d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 10);
    ctx.lineTo(cx - 5, cy - 5);
    ctx.moveTo(cx + 10, cy - 10);
    ctx.lineTo(cx + 5, cy - 5);
    ctx.moveTo(cx - 10, cy + 10);
    ctx.lineTo(cx - 5, cy + 5);
    ctx.moveTo(cx + 10, cy + 10);
    ctx.lineTo(cx + 5, cy + 5);
    ctx.stroke();
  }
}

function drawDamage(ctx: CanvasRenderingContext2D, world: World, me: Entity) {
  const k = 1 - (world.time - me.hurtAt) / 0.6;
  if (k <= 0) return;
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.7);
  g.addColorStop(0, "rgba(255,0,40,0)");
  g.addColorStop(1, `rgba(255,0,40,${0.45 * k})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Direction of the attacker
  const a = me.lastAttacker ? world.entities.get(me.lastAttacker) : null;
  if (a) {
    const rel = wrap(Math.atan2(a.y - me.y, a.x - me.x) - me.angle) - Math.PI / 2;
    ctx.strokeStyle = `rgba(255,77,109,${k})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(VIEW_W / 2, VIEW_H / 2, 60, rel - 0.35, rel + 0.35);
    ctx.stroke();
  }
}

function drawHud(ctx: CanvasRenderingContext2D, world: World, me: Entity, hud: HudState) {
  const W = VIEW_W;
  const H = VIEW_H;
  const t = world.time;
  ctx.textBaseline = "top";

  // Top-left info
  ctx.textAlign = "left";
  ctx.font = "700 14px Orbitron, system-ui, sans-serif";
  hud.topLeft.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? "#eef1ff" : "#a2aac6";
    ctx.fillText(line, 12, 10 + i * 18);
  });

  // Health
  ctx.fillStyle = "rgba(5,6,11,0.6)";
  ctx.fillRect(10, H - 34, 150, 24);
  ctx.fillStyle = me.hp > 30 ? "#3dffa2" : "#ff4d6d";
  ctx.fillRect(14, H - 30, (142 * me.hp) / me.maxHp, 16);
  ctx.fillStyle = "#05060b";
  ctx.font = "800 12px Orbitron, system-ui, sans-serif";
  ctx.fillText(`${Math.ceil(me.hp)} HP`, 18, H - 28);

  // Ammo
  ctx.textAlign = "right";
  ctx.font = "800 20px Orbitron, system-ui, sans-serif";
  ctx.fillStyle = me.ammo === 0 || isReloading(world, me) ? "#ffcb3d" : "#eef1ff";
  // Sits above the platform's pause button (bottom-right corner).
  ctx.fillText(isReloading(world, me) ? "RELOAD" : `${me.ammo}/${MAG_SIZE}`, W - 14, H - 62);

  // Kill feed
  ctx.font = "600 11px system-ui, sans-serif";
  hud.killFeed
    .filter((k) => t - k.at < 5)
    .slice(-4)
    .forEach((k, i) => {
      ctx.fillStyle = k.mine ? "#ffcb3d" : "#a2aac6";
      ctx.fillText(`${k.killer} ✕ ${k.victim}`, W - 100, 12 + i * 15);
    });

  drawMinimap(ctx, world, me, hud);

  if (hud.banner) {
    ctx.textAlign = "center";
    ctx.font = "900 28px Orbitron, system-ui, sans-serif";
    ctx.fillStyle = hud.banner.color ?? "#eef1ff";
    ctx.fillText(hud.banner.text, W / 2, H * 0.28);
    if (hud.banner.sub) {
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.fillStyle = "#a2aac6";
      ctx.fillText(hud.banner.sub, W / 2, H * 0.28 + 36);
    }
  }

  if (hud.scoreboard) {
    const rows = hud.scoreboard;
    const bw = 280;
    const bx = (W - bw) / 2;
    const by = 60;
    ctx.fillStyle = "rgba(5,6,11,0.85)";
    ctx.fillRect(bx, by, bw, 30 + rows.length * 18);
    ctx.font = "700 11px Orbitron, system-ui, sans-serif";
    ctx.fillStyle = "#a2aac6";
    ctx.textAlign = "left";
    ctx.fillText("PLAYER", bx + 12, by + 10);
    ctx.textAlign = "right";
    ctx.fillText("K / D", bx + bw - 12, by + 10);
    ctx.font = "600 12px system-ui, sans-serif";
    rows.forEach((r, i) => {
      ctx.fillStyle = r.me ? "#22e5ff" : "#eef1ff";
      ctx.textAlign = "left";
      ctx.fillText(r.name, bx + 12, by + 30 + i * 18);
      ctx.textAlign = "right";
      ctx.fillText(`${r.kills} / ${r.deaths}`, bx + bw - 12, by + 30 + i * 18);
    });
  }
}

function drawMinimap(ctx: CanvasRenderingContext2D, world: World, me: Entity, hud: HudState) {
  const s = 3;
  const mw = world.map.width * s;
  const x0 = VIEW_W - mw - 10;
  const y0 = 76;
  ctx.fillStyle = "rgba(5,6,11,0.55)";
  ctx.fillRect(x0 - 2, y0 - 2, mw + 4, world.map.height * s + 4);
  ctx.fillStyle = "rgba(34,229,255,0.35)";
  for (let y = 0; y < world.map.height; y++)
    for (let x = 0; x < world.map.width; x++) if (wallAt(world.map, x, y)) ctx.fillRect(x0 + x * s, y0 + y * s, s, s);
  // Enemy pings: only enemies that recently fired (fair radar)
  for (const p of hud.pings) {
    const k = 1 - (world.time - p.at) / 1.2;
    if (k <= 0) continue;
    ctx.fillStyle = `rgba(255,43,214,${k})`;
    ctx.fillRect(x0 + p.x * s - 2, y0 + p.y * s - 2, 4, 4);
  }
  ctx.fillStyle = "#eef1ff";
  ctx.beginPath();
  ctx.arc(x0 + me.x * s, y0 + me.y * s, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#eef1ff";
  ctx.beginPath();
  ctx.moveTo(x0 + me.x * s, y0 + me.y * s);
  ctx.lineTo(x0 + (me.x + Math.cos(me.angle) * 2) * s, y0 + (me.y + Math.sin(me.angle) * 2) * s);
  ctx.stroke();
}
