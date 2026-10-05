import { useState } from "react";

/**
 * Liquid glass: panels bend what's behind them at their rims like a thick lens, split the
 * colours slightly at the edge, and catch a highlight that follows the pointer.
 *
 * The bending is an SVG displacement filter used as a `backdrop-filter`, which only
 * Chromium supports; other browsers get the same rim, sheen and tint over a plain blur.
 */

/**
 * A displacement map for a rounded rectangle `w`×`h` px with corner radius `r` and a bevel
 * `band` px wide: red and green hold the inward normal (128 = no shift), strongest at the rim.
 */
export function displacementMap(w: number, h: number, r: number, band: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // Signed distance to the rounded rectangle (negative inside) and its gradient.
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
      // 0 in the flat middle, rising to 1 at the rim along a circular bevel.
      const t = Math.min(1, Math.max(0, 1 + d / band));
      const k = 1 - Math.sqrt(1 - t * t);
      const i = (y * w + x) * 4;
      out[i] = 128 - nx * k * 127;
      out[i + 1] = 128 - ny * k * 127;
      out[i + 2] = 128;
      out[i + 3] = 255;
    }
  return out;
}

function mapUrl(w: number, h: number, r: number, band: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(new ImageData(displacementMap(w, h, r, band) as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  return c.toDataURL();
}

/** Can this browser run SVG filters as backdrop filters? (Chromium only, today.) */
export function canRefract() {
  if (typeof navigator === "undefined" || typeof CSS === "undefined") return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands ?? [];
  const chromium = brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand)) || (/Chrome\//.test(navigator.userAgent) && !/Firefox|FxiOS/.test(navigator.userAgent));
  return chromium && CSS.supports("backdrop-filter", "blur(1px)");
}

/** One lens filter: three displacement passes (red, green, blue at slightly different strengths) screened together. */
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

/** The SVG filters liquid glass refers to (`#zc-lg` for panels, `#zc-lg-bar` for bars and buttons). */
export function GlassDefs() {
  // Generated once (the game only renders on the client); a panel is roughly square, a bar a long capsule.
  const [maps] = useState(() => ({ panel: mapUrl(192, 192, 22, 26), bar: mapUrl(480, 64, 32, 20) }));
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
      <defs>
        <Lens id="zc-lg" href={maps.panel} scale={26} />
        <Lens id="zc-lg-bar" href={maps.bar} scale={18} />
      </defs>
    </svg>
  );
}

/** Moves each glass surface's highlight toward the pointer (sets --mx/--my on the surface under it). */
export function trackSheen(root: HTMLElement) {
  let last: HTMLElement | null = null;
  const move = (e: PointerEvent) => {
    const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(".zc-glass, .zc-glass-dark, .zc-btn");
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
