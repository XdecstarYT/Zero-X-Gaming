"use client";

import { useMemo, useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/**
 * NextX Engine · Liquid Glass. Surfaces bend what's behind them at their rims like a thick lens (an SVG
 * displacement filter used as a backdrop filter, Chromium only), split the colours a touch at
 * the edge, and catch a highlight that follows the pointer. Elsewhere the same rim, sheen and
 * tint sit over a plain blur.
 */

/** Displacement map for a rounded rectangle: red/green hold the inward normal at the rim (128 = none). */
function lensMap(w: number, h: number, r: number, band: number) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - w / 2;
      const py = y + 0.5 - h / 2;
      const qx = Math.abs(px) - (w / 2 - r);
      const qy = Math.abs(py) - (h / 2 - r);
      let d: number;
      let nx: number;
      let ny: number;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy) || 1;
        d = l - r;
        nx = qx / l;
        ny = qy / l;
      } else if (qx > qy) {
        d = qx - r;
        nx = 1;
        ny = 0;
      } else {
        d = qy - r;
        nx = 0;
        ny = 1;
      }
      nx *= Math.sign(px) || 1;
      ny *= Math.sign(py) || 1;
      const t = Math.min(1, Math.max(0, 1 + d / band));
      const k = 1 - Math.sqrt(1 - t * t);
      const i = (y * w + x) * 4;
      out[i] = 128 - nx * k * 127;
      out[i + 1] = 128 - ny * k * 127;
      out[i + 2] = 128;
      out[i + 3] = 255;
    }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return "";
  g.putImageData(new ImageData(out as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  return c.toDataURL();
}

/** Can this browser use SVG filters as backdrop filters? (Chromium today.) */
export function canRefract() {
  if (typeof navigator === "undefined" || typeof CSS === "undefined") return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands ?? [];
  const chromium = brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand)) || (/Chrome\//.test(navigator.userAgent) && !/Firefox|FxiOS/.test(navigator.userAgent));
  return chromium && CSS.supports("backdrop-filter", "blur(1px)");
}

function Lens({ id, href, scale }: { id: string; href: string; scale: number }) {
  const pass = (ch: "r" | "g" | "b", s: number) => {
    const m = { r: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", g: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", b: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" }[ch];
    return [
      <feDisplacementMap key={`${ch}d`} in="SourceGraphic" in2="map" scale={s} xChannelSelector="R" yChannelSelector="G" result={`${ch}0`} />,
      <feColorMatrix key={`${ch}m`} in={`${ch}0`} type="matrix" values={m} result={ch} />,
    ];
  };
  return (
    <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feImage href={href} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
      {pass("r", scale)}
      {pass("g", scale * 1.08)}
      {pass("b", scale * 1.16)}
      <feBlend in="r" in2="g" mode="screen" result="rg" />
      <feBlend in="rg" in2="b" mode="screen" />
    </filter>
  );
}

/** The lens filters: `#<prefix>-lg` for sheets and cards, `#<prefix>-lg-bar` for capsules. */
export function GlassDefs({ prefix = "nx" }: { prefix?: string }) {
  // The lens maps are drawn on a canvas: in the browser only (nothing to refract on the server).
  const client = useSyncExternalStore(noSubscribe, () => true, () => false);
  const maps = useMemo(() => (client ? { panel: lensMap(200, 200, 26, 30), bar: lensMap(480, 64, 32, 20) } : null), [client]);
  if (!maps) return null;
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
      <defs>
        <Lens id={`${prefix}-lg`} href={maps.panel} scale={28} />
        <Lens id={`${prefix}-lg-bar`} href={maps.bar} scale={18} />
      </defs>
    </svg>
  );
}

/** Moves each glass surface's highlight toward the pointer (--mx/--my on the surface under it). */
export function trackSheen(root: HTMLElement, selector = ".nx-glass, .nx-btn") {
  let last: HTMLElement | null = null;
  const move = (e: PointerEvent) => {
    const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(selector);
    if (last && last !== el) {
      last.style.removeProperty("--mx");
      last.style.removeProperty("--my");
    }
    last = el ?? null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  };
  root.addEventListener("pointermove", move, { passive: true });
  return () => root.removeEventListener("pointermove", move);
}
