/**
 * Flags as layers: stripes, crosses, saltires, triangles, discs, stars, crescents, polygons. Each
 * country's flag is a short recipe (simplified where the real one has a detailed emblem); the
 * flag editor edits the same layers, and historical flags are alternative recipes.
 *
 * Recipe syntax: "@ratio;" then layers separated by ";", each "kind:args". Colours are hex;
 * positions and sizes are fractions of the flag (x of its width, y and sizes of its height).
 */

export type Layer =
  | { k: "bg"; c: string }
  | { k: "h" | "v"; c: string[]; w: number[] }
  | { k: "x"; c: string; x: number; y: number; t: number }
  | { k: "p"; c: string; x: number; y: number; lx: number; ly: number; t: number }
  | { k: "sx"; c: string; t: number }
  | { k: "t"; c: string; w: number }
  | { k: "d"; c: string; x: number; y: number; r: number }
  | { k: "hd"; c: string; x: number; y: number; r: number }
  | { k: "ring"; c: string; x: number; y: number; r: number; t: number }
  | { k: "e"; c: string; x: number; y: number; rx: number; ry: number }
  | { k: "s"; c: string; x: number; y: number; r: number; n: number }
  | { k: "c"; c: string; bg: string; x: number; y: number; r: number; ox: number; oy: number; ri: number }
  | { k: "r"; c: string; x: number; y: number; w: number; h: number }
  | { k: "poly"; c: string; pts: number[] }
  | { k: "dg" | "dg2"; c: string; c2: string }
  | { k: "bd" | "bd2"; c: string; t: number }
  | { k: "uj"; x: number; y: number; w: number; h: number }
  | { k: "zz"; c: string; w: number; n: number }
  | { k: "sg"; c: string; x: number; y: number; w: number; h: number; rows: number; cols: number }
  | { k: "sa"; c: string; x: number; y: number; R: number; r: number; n: number }
  | { k: "ml"; c: string; x: number; y: number; r: number }
  | { k: "sun"; c: string; x: number; y: number; n: number };

export interface Flag {
  ratio: number;
  layers: Layer[];
}

const num = (s: string | undefined, d = 0) => (s === undefined || s === "" ? d : parseFloat(s));

/** Read a recipe into layers. */
export function parseFlag(src: string): Flag {
  let ratio = 1.5;
  const layers: Layer[] = [];
  for (const part of src.split(";")) {
    const p = part.trim();
    if (!p) continue;
    if (p.startsWith("@")) {
      ratio = parseFloat(p.slice(1)) || 1.5;
      continue;
    }
    const i = p.indexOf(":");
    const k = p.slice(0, i);
    const a = p.slice(i + 1).split(",");
    switch (k) {
      case "bg":
        layers.push({ k, c: a[0] });
        break;
      case "h":
      case "v": {
        const c: string[] = [];
        const w: number[] = [];
        for (const s of a) {
          const [col, wt] = s.split("/");
          c.push(col);
          w.push(wt ? parseFloat(wt) : 1);
        }
        layers.push({ k, c, w });
        break;
      }
      case "x":
        layers.push({ k, c: a[0], x: num(a[1], 0.36), y: num(a[2], 0.5), t: num(a[3], 0.2) });
        break;
      case "p":
        layers.push({ k, c: a[0], x: num(a[1], 0.5), y: num(a[2], 0.5), lx: num(a[3], 0.5), ly: num(a[4], 0.5), t: num(a[5], 0.2) });
        break;
      case "sx":
        layers.push({ k, c: a[0], t: num(a[1], 0.15) });
        break;
      case "t":
        layers.push({ k, c: a[0], w: num(a[1], 0.4) });
        break;
      case "d":
      case "hd":
        layers.push({ k, c: a[0], x: num(a[1], 0.5), y: num(a[2], 0.5), r: num(a[3], 0.25) });
        break;
      case "ring":
        layers.push({ k, c: a[0], x: num(a[1], 0.5), y: num(a[2], 0.5), r: num(a[3], 0.2), t: num(a[4], 0.03) });
        break;
      case "e":
        layers.push({ k, c: a[0], x: num(a[1], 0.5), y: num(a[2], 0.5), rx: num(a[3], 0.15), ry: num(a[4], 0.25) });
        break;
      case "s":
        layers.push({ k, c: a[0], x: num(a[1], 0.5), y: num(a[2], 0.5), r: num(a[3], 0.2), n: num(a[4], 5) });
        break;
      case "c":
        layers.push({ k, c: a[0], bg: a[1], x: num(a[2], 0.5), y: num(a[3], 0.5), r: num(a[4], 0.25), ox: num(a[5], 0.25), oy: num(a[6], 0), ri: num(a[7], 0.8) });
        break;
      case "r":
        layers.push({ k, c: a[0], x: num(a[1]), y: num(a[2]), w: num(a[3], 1), h: num(a[4], 1) });
        break;
      case "poly":
        layers.push({ k, c: a[0], pts: a.slice(1).map((s) => parseFloat(s)) });
        break;
      case "dg":
      case "dg2":
        layers.push({ k, c: a[0], c2: a[1] });
        break;
      case "bd":
      case "bd2":
        layers.push({ k, c: a[0], t: num(a[1], 0.2) });
        break;
      case "uj":
        layers.push({ k, x: num(a[0]), y: num(a[1]), w: num(a[2], 1), h: num(a[3], 1) });
        break;
      case "zz":
        layers.push({ k, c: a[0], w: num(a[1], 0.3), n: num(a[2], 5) });
        break;
      case "sg":
        layers.push({ k, c: a[0], x: num(a[1]), y: num(a[2]), w: num(a[3], 0.4), h: num(a[4], 0.5), rows: num(a[5], 5), cols: num(a[6], 6) });
        break;
      case "sa":
        layers.push({ k, c: a[0], x: num(a[1], 0.5), y: num(a[2], 0.5), R: num(a[3], 0.3), r: num(a[4], 0.04), n: num(a[5], 12) });
        break;
      case "ml":
        layers.push({ k, c: a[0], x: num(a[1], 0.5), y: num(a[2], 0.5), r: num(a[3], 0.3) });
        break;
      case "sun":
        layers.push({ k, c: a[0], x: num(a[1], 0.5), y: num(a[2], 0.5), n: num(a[3], 8) });
        break;
    }
  }
  return { ratio, layers };
}

/** Write layers back as a recipe (for saving an edited flag). */
export function flagRecipe(f: Flag): string {
  const r = (n: number) => +n.toFixed(3);
  const out = [`@${r(f.ratio)}`];
  for (const l of f.layers) {
    switch (l.k) {
      case "bg":
        out.push(`bg:${l.c}`);
        break;
      case "h":
      case "v":
        out.push(`${l.k}:${l.c.map((c, i) => (l.w[i] === 1 ? c : `${c}/${r(l.w[i])}`)).join(",")}`);
        break;
      case "x":
        out.push(`x:${l.c},${r(l.x)},${r(l.y)},${r(l.t)}`);
        break;
      case "p":
        out.push(`p:${l.c},${r(l.x)},${r(l.y)},${r(l.lx)},${r(l.ly)},${r(l.t)}`);
        break;
      case "sx":
        out.push(`sx:${l.c},${r(l.t)}`);
        break;
      case "t":
        out.push(`t:${l.c},${r(l.w)}`);
        break;
      case "d":
      case "hd":
        out.push(`${l.k}:${l.c},${r(l.x)},${r(l.y)},${r(l.r)}`);
        break;
      case "ring":
        out.push(`ring:${l.c},${r(l.x)},${r(l.y)},${r(l.r)},${r(l.t)}`);
        break;
      case "e":
        out.push(`e:${l.c},${r(l.x)},${r(l.y)},${r(l.rx)},${r(l.ry)}`);
        break;
      case "s":
        out.push(`s:${l.c},${r(l.x)},${r(l.y)},${r(l.r)},${l.n}`);
        break;
      case "c":
        out.push(`c:${l.c},${l.bg},${r(l.x)},${r(l.y)},${r(l.r)},${r(l.ox)},${r(l.oy)},${r(l.ri)}`);
        break;
      case "r":
        out.push(`r:${l.c},${r(l.x)},${r(l.y)},${r(l.w)},${r(l.h)}`);
        break;
      case "poly":
        out.push(`poly:${l.c},${l.pts.map(r).join(",")}`);
        break;
      case "dg":
      case "dg2":
        out.push(`${l.k}:${l.c},${l.c2}`);
        break;
      case "bd":
      case "bd2":
        out.push(`${l.k}:${l.c},${r(l.t)}`);
        break;
      case "uj":
        out.push(`uj:${r(l.x)},${r(l.y)},${r(l.w)},${r(l.h)}`);
        break;
      case "zz":
        out.push(`zz:${l.c},${r(l.w)},${l.n}`);
        break;
      case "sg":
        out.push(`sg:${l.c},${r(l.x)},${r(l.y)},${r(l.w)},${r(l.h)},${l.rows},${l.cols}`);
        break;
      case "sa":
        out.push(`sa:${l.c},${r(l.x)},${r(l.y)},${r(l.R)},${r(l.r)},${l.n}`);
        break;
      case "ml":
        out.push(`ml:${l.c},${r(l.x)},${r(l.y)},${r(l.r)}`);
        break;
      case "sun":
        out.push(`sun:${l.c},${r(l.x)},${r(l.y)},${l.n}`);
        break;
    }
  }
  return out.join(";");
}

const H = 100;
function starPts(cx: number, cy: number, r: number, n: number, inner = n > 8 ? 0.7 : 0.4) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return pts.join(" ");
}
const MAPLE = "M0,-1 l.09,.18 l.13,-.05 l-.04,.29 l.18,-.16 l.04,.1 l.17,-.04 l-.05,.18 l.08,.04 l-.29,.24 l.04,.09 l-.3,-.04 l.01,.32 h-.12 l.01,-.32 l-.3,.04 l.04,-.09 l-.29,-.24 l.08,-.04 l-.05,-.18 l.17,.04 l.04,-.1 l.18,.16 l-.04,-.29 l.13,.05 z";

/** Draw a flag as an SVG string. */
export function flagSvg(f: Flag): string {
  const W = H * f.ratio;
  const X = (x: number) => (x * W).toFixed(2);
  const Y = (y: number) => (y * H).toFixed(2);
  const R = (r: number) => (r * H).toFixed(2);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${H}" preserveAspectRatio="none"><defs><clipPath id="u"><rect width="60" height="30"/></clipPath><clipPath id="t"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath></defs>`;
  for (const l of f.layers) {
    switch (l.k) {
      case "bg":
        s += `<rect width="${W}" height="${H}" fill="${l.c}"/>`;
        break;
      case "h":
      case "v": {
        const tot = l.w.reduce((a, b) => a + b, 0);
        let o = 0;
        l.c.forEach((c, i) => {
          const sz = (l.w[i] / tot) * (l.k === "h" ? H : W);
          s += l.k === "h" ? `<rect y="${o.toFixed(2)}" width="${W}" height="${(sz + 0.3).toFixed(2)}" fill="${c}"/>` : `<rect x="${o.toFixed(2)}" width="${(sz + 0.3).toFixed(2)}" height="${H}" fill="${c}"/>`;
          o += sz;
        });
        break;
      }
      case "x": {
        const t = l.t * H;
        s += `<rect x="${(l.x * W - t / 2).toFixed(2)}" width="${t.toFixed(2)}" height="${H}" fill="${l.c}"/><rect y="${(l.y * H - t / 2).toFixed(2)}" width="${W}" height="${t.toFixed(2)}" fill="${l.c}"/>`;
        break;
      }
      case "p": {
        const t = l.t * H;
        s += `<rect x="${((l.x - l.lx) * W).toFixed(2)}" y="${(l.y * H - t / 2).toFixed(2)}" width="${(l.lx * 2 * W).toFixed(2)}" height="${t.toFixed(2)}" fill="${l.c}"/><rect x="${(l.x * W - t / 2).toFixed(2)}" y="${((l.y - l.ly) * H).toFixed(2)}" width="${t.toFixed(2)}" height="${(l.ly * 2 * H).toFixed(2)}" fill="${l.c}"/>`;
        break;
      }
      case "sx":
        s += `<path d="M0,0L${W},${H}M${W},0L0,${H}" stroke="${l.c}" stroke-width="${R(l.t)}"/>`;
        break;
      case "t":
        s += `<path d="M0,0L${X(l.w)},${H / 2}L0,${H}z" fill="${l.c}"/>`;
        break;
      case "d":
        s += `<circle cx="${X(l.x)}" cy="${Y(l.y)}" r="${R(l.r)}" fill="${l.c}"/>`;
        break;
      case "hd":
        s += `<path d="M${(l.x * W - l.r * H).toFixed(2)},${Y(l.y)}a${R(l.r)},${R(l.r)} 0 0,0 ${R(l.r * 2)},0z" fill="${l.c}"/>`;
        break;
      case "ring":
        s += `<circle cx="${X(l.x)}" cy="${Y(l.y)}" r="${R(l.r)}" fill="none" stroke="${l.c}" stroke-width="${R(l.t)}"/>`;
        break;
      case "e":
        s += `<ellipse cx="${X(l.x)}" cy="${Y(l.y)}" rx="${R(l.rx)}" ry="${R(l.ry)}" fill="${l.c}"/>`;
        break;
      case "s":
        s += `<polygon points="${starPts(l.x * W, l.y * H, l.r * H, l.n)}" fill="${l.c}"/>`;
        break;
      case "c":
        s += `<circle cx="${X(l.x)}" cy="${Y(l.y)}" r="${R(l.r)}" fill="${l.c}"/><circle cx="${(l.x * W + l.ox * l.r * H).toFixed(2)}" cy="${(l.y * H + l.oy * l.r * H).toFixed(2)}" r="${R(l.r * l.ri)}" fill="${l.bg}"/>`;
        break;
      case "r":
        s += `<rect x="${X(l.x)}" y="${Y(l.y)}" width="${X(l.w)}" height="${Y(l.h)}" fill="${l.c}"/>`;
        break;
      case "poly": {
        const pts: string[] = [];
        for (let i = 0; i + 1 < l.pts.length; i += 2) pts.push(`${X(l.pts[i])},${Y(l.pts[i + 1])}`);
        s += `<polygon points="${pts.join(" ")}" fill="${l.c}"/>`;
        break;
      }
      case "dg":
        s += `<rect width="${W}" height="${H}" fill="${l.c2}"/><path d="M0,0H${W}L0,${H}z" fill="${l.c}"/>`;
        break;
      case "dg2":
        s += `<rect width="${W}" height="${H}" fill="${l.c2}"/><path d="M0,0H${W}V${H}z" fill="${l.c}"/>`;
        break;
      case "bd":
        s += `<path d="M0,${H}L${W},0" stroke="${l.c}" stroke-width="${R(l.t)}"/>`;
        break;
      case "bd2":
        s += `<path d="M0,0L${W},${H}" stroke="${l.c}" stroke-width="${R(l.t)}"/>`;
        break;
      case "uj":
        s += `<g transform="translate(${X(l.x)},${Y(l.y)}) scale(${((l.w * W) / 60).toFixed(4)},${((l.h * H) / 30).toFixed(4)})" clip-path="url(#u)"><rect width="60" height="30" fill="#012169"/><path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0L60,30M60,0L0,30" clip-path="url(#t)" stroke="#C8102E" stroke-width="4"/><path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></g>`;
        break;
      case "zz": {
        let d = `M0,0H${X(l.w * 0.75)}`;
        const step = H / l.n;
        for (let i = 0; i < l.n; i++) d += `L${X(l.w)},${(i * step + step / 2).toFixed(2)}L${X(l.w * 0.75)},${((i + 1) * step).toFixed(2)}`;
        s += `<path d="${d}H0z" fill="${l.c}"/>`;
        break;
      }
      case "sg":
        for (let r = 0; r < l.rows; r++)
          for (let c = 0; c < l.cols - (r % 2); c++) {
            const cx = (l.x + ((c + 0.5 + (r % 2) * 0.5) / l.cols) * l.w) * W;
            const cy = (l.y + ((r + 0.5) / l.rows) * l.h) * H;
            s += `<polygon points="${starPts(cx, cy, ((l.h * H) / l.rows) * 0.38, 5)}" fill="${l.c}"/>`;
          }
        break;
      case "sa":
        for (let i = 0; i < l.n; i++) {
          const a = (i / l.n) * Math.PI * 2 - Math.PI / 2;
          s += `<polygon points="${starPts(l.x * W + Math.cos(a) * l.R * H, l.y * H + Math.sin(a) * l.R * H, l.r * H, 5)}" fill="${l.c}"/>`;
        }
        break;
      case "ml":
        s += `<path d="${MAPLE}" fill="${l.c}" transform="translate(${X(l.x)},${(l.y * H + l.r * H * 0.15).toFixed(2)}) scale(${R(l.r)})"/>`;
        break;
      case "sun": {
        const cx = l.x * W;
        const cy = l.y * H;
        for (let i = 0; i < l.n; i++) {
          const a = (i / l.n) * Math.PI * 2;
          const a1 = a - 0.12;
          const a2 = a + 0.12;
          const far = W * 1.2;
          s += `<polygon points="${cx},${cy} ${(cx + Math.cos(a1) * far).toFixed(1)},${(cy + Math.sin(a1) * far).toFixed(1)} ${(cx + Math.cos(a2) * far).toFixed(1)},${(cy + Math.sin(a2) * far).toFixed(1)}" fill="${l.c}"/>`;
        }
        break;
      }
    }
  }
  return s + "</svg>";
}

export const flagUrl = (f: Flag) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(flagSvg(f))}`;

const alt = (n: number, a: string, b: string) => Array.from({ length: n }, (_, i) => (i % 2 ? b : a)).join(",");

/** Every country's flag. */
export const FLAGS: Record<string, string> = {
  ZWE: "@2;h:#006400,#ffd200,#d40000,#000,#d40000,#ffd200,#006400;t:#fff,.42;s:#d40000,.11,.5,.12",
  ZMB: "bg:#198a00;r:#de2010,.67,.38,.11,.62;r:#000,.78,.38,.11,.62;r:#ef7d00,.89,.38,.11,.62;d:#ef7d00,.83,.2,.08",
  YEM: "h:#ce1126,#fff,#000",
  VNM: "bg:#da251d;s:#ff0,.5,.5,.3",
  VEN: "h:#fc0,#00247d,#cf142b;s:#fff,.38,.45,.035;s:#fff,.42,.4,.035;s:#fff,.47,.37,.035;s:#fff,.53,.37,.035;s:#fff,.58,.4,.035;s:#fff,.62,.45,.035",
  VUT: "@1.67;h:#d21034,#009543;t:#000,.42;r:#fdce12,.4,.47,.6,.06",
  UZB: "@2;h:#0099b5/31,#ce1126/1,#fff/30,#ce1126/1,#1eb53a/31;c:#fff,#0099b5,.09,.17,.1",
  URY: `h:${alt(9, "#fff", "#0038a8")};r:#fff,0,0,.375,.556;d:#fcd116,.19,.28,.12`,
  USA: `@1.9;h:${alt(13, "#b22234", "#fff")};r:#3c3b6e,0,0,.4,.538;sg:#fff,0,0,.4,.538,9,11`,
  GBR: "@2;uj:0,0,1,1",
  ARE: "@2;h:#00732f,#fff,#000;r:#ff0000,0,0,.25,1",
  UKR: "h:#0057b7,#ffd700",
  UGA: "h:#000,#fcdc04,#d90000,#000,#fcdc04,#d90000;d:#fff,.5,.5,.18",
  TKM: "bg:#00843d;r:#d22630,.12,0,.12,1;c:#fff,#00843d,.36,.22,.1",
  TUR: "bg:#e30a17;c:#fff,#e30a17,.33,.5,.25,.25,0,.8;s:#fff,.5,.5,.09",
  TUN: "bg:#e70013;d:#fff,.5,.5,.25;c:#e70013,#fff,.5,.5,.19,.25,0,.8;s:#e70013,.54,.5,.08",
  TTO: "@1.67;bg:#ce1126;bd2:#fff,.4;bd2:#000,.28",
  TGO: "@1.62;h:#006a4e,#ffce00,#006a4e,#ffce00,#006a4e;r:#d21034,0,0,.37,.6;s:#fff,.18,.3,.15",
  TLS: "@2;bg:#dc241f;t:#ffc726,.5;t:#000,.33;s:#fff,.11,.5,.1",
  THA: "h:#a51931/1,#f4f5f8/1,#2d2a4a/2,#f4f5f8/1,#a51931/1",
  TZA: "dg:#1eb53a,#00a3dd;bd:#fcd116,.34;bd:#000,.24",
  TJK: "@2;h:#cc0000/2,#fff/3,#006600/2;s:#f8c300,.5,.5,.1",
  TWN: "bg:#fe0000;r:#000095,0,0,.5,.5;s:#fff,.25,.25,.18,12;d:#000095,.25,.25,.1;d:#fff,.25,.25,.085",
  SYR: "h:#007a3d,#fff,#000;s:#ce1126,.32,.5,.08;s:#ce1126,.5,.5,.08;s:#ce1126,.68,.5,.08",
  CHE: "@1;bg:#d52b1e;p:#fff,.5,.5,.31,.31,.2",
  SWE: "@1.6;bg:#006aa7;x:#fecc00,.375,.5,.2",
  SWZ: "h:#3e5eb9/3,#ffd900/1,#b10c0c/6,#ffd900/1,#3e5eb9/3;e:#fff,.5,.5,.2,.12;hd:#000,.5,.5,.12",
  SUR: "h:#377e3f/2,#fff/1,#b40a2d/4,#fff/1,#377e3f/2;s:#ecc81d,.5,.5,.16",
  SSD: "@2;h:#000/6,#fff/1,#da121a/6,#fff/1,#078930/6;t:#0f47af,.36;s:#fcdd09,.11,.5,.1",
  SDN: "@2;h:#d21034,#fff,#000;t:#007229,.33",
  LKA: "@2;bg:#ffbe29;r:#00534e,.04,.06,.12,.88;r:#eb7400,.17,.06,.12,.88;r:#8d2029,.33,.06,.63,.88",
  ESP: "h:#aa151b/1,#f1bf00/2,#aa151b/1;r:#aa151b,.26,.37,.1,.26;r:#c8b100,.26,.37,.05,.13",
  KOR: "bg:#fff;d:#cd2e3a,.5,.5,.25;hd:#0047a0,.5,.5,.25;r:#000,.12,.14,.14,.07;r:#000,.74,.14,.14,.07;r:#000,.12,.79,.14,.07;r:#000,.74,.79,.14,.07",
  ZAF: "h:#e03c31,#001489;poly:#fff,0,0,.2,0,.52,.38,1,.38,1,.62,.52,.62,.2,1,0,1;poly:#007749,0,.07,.12,0,.5,.43,1,.43,1,.57,.5,.57,.12,1,0,.93;t:#ffb612,.36;t:#000,.3",
  SOM: "bg:#4189dd;s:#fff,.5,.5,.25",
  SOL: "@2;h:#009639,#fff,#de2010;s:#000,.5,.5,.1",
  SLB: "@2;dg:#0051ba,#215b33;bd:#fcd116,.08;s:#fff,.1,.15,.05;s:#fff,.25,.15,.05;s:#fff,.1,.4,.05;s:#fff,.25,.4,.05;s:#fff,.175,.27,.05",
  SVK: "h:#fff,#0b4ea2,#ee1c25;r:#fff,.18,.22,.22,.52;r:#ee1c25,.2,.24,.18,.46;p:#fff,.29,.44,.06,.16,.05",
  SVN: "@2;h:#fff,#005da4,#ed1c24;r:#005da4,.2,.15,.13,.3",
  SGP: "h:#ef3340,#fff;c:#fff,#ef3340,.17,.25,.15,.3,0,.85;s:#fff,.3,.15,.03;s:#fff,.36,.22,.03;s:#fff,.34,.32,.03;s:#fff,.26,.32,.03;s:#fff,.24,.22,.03",
  SLE: "h:#1eb53a,#fff,#0072c6",
  SRB: "h:#c6363c,#0c4076,#fff;r:#c6363c,.24,.25,.13,.45;r:#fff,.27,.3,.07,.3",
  SEN: "v:#00853f,#fdef42,#e31b23;s:#00853f,.5,.5,.13",
  SAU: "bg:#006c35;r:#fff,.25,.28,.5,.05;r:#fff,.22,.38,.56,.05;r:#fff,.2,.64,.6,.04",
  STP: "@2;h:#12ad2b/2,#ffce00/3,#12ad2b/2;t:#d21034,.3;s:#000,.45,.5,.08;s:#000,.68,.5,.08",
  WSM: "@2;bg:#ce1126;r:#002b7f,0,0,.5,.5;s:#fff,.25,.12,.06;s:#fff,.17,.25,.06;s:#fff,.33,.22,.05;s:#fff,.25,.38,.06;s:#fff,.3,.3,.03",
  RWA: "h:#00a1de/2,#fad201/1,#20603d/1;s:#fad201,.83,.22,.12,24;d:#fad201,.83,.22,.06",
  RUS: "h:#fff,#0039a6,#d52b1e",
  ROU: "v:#002b7f,#fcd116,#ce1126",
  QAT: "@2.55;bg:#8a1538;zz:#fff,.36,9",
  PRT: "v:#006600/2,#ff0000/3;d:#ffcc00,.4,.5,.18;d:#ff0000,.4,.5,.12;r:#fff,.37,.42,.06,.16",
  POL: "@1.6;h:#fff,#dc143c",
  PHL: "@2;h:#0038a8,#ce1126;t:#fff,.43;s:#fcd116,.14,.5,.1,8;s:#fcd116,.05,.12,.04;s:#fcd116,.05,.88,.04;s:#fcd116,.36,.5,.04",
  PER: "v:#d91023,#fff,#d91023",
  PRY: "@1.82;h:#d52b1e,#fff,#0038a8;ring:#000,.5,.5,.1,.01;s:#fcd116,.5,.5,.04",
  PNG: "@1.33;dg2:#ce1126,#000;s:#fff,.2,.6,.05;s:#fff,.28,.74,.05;s:#fff,.16,.78,.05;s:#fff,.24,.88,.05;e:#fcd116,.68,.3,.12,.08",
  PAN: "r:#fff,0,0,.5,.5;r:#d21034,.5,0,.5,.5;r:#005293,0,.5,.5,.5;r:#fff,.5,.5,.5,.5;s:#005293,.25,.25,.1;s:#d21034,.75,.75,.1",
  PAK: "bg:#01411c;r:#fff,0,0,.25,1;c:#fff,#01411c,.62,.5,.24,.25,-.18,.85;s:#fff,.7,.36,.08",
  OMN: "@2;h:#fff,#db161b,#008000;r:#db161b,0,0,.25,1",
  NOR: "@1.375;bg:#ba0c2f;x:#fff,.36,.5,.25;x:#00205b,.36,.5,.125",
  PRK: "@2;h:#024fa2/6,#fff/1,#ed1c27/15,#fff/1,#024fa2/6;d:#fff,.35,.5,.17;s:#ed1c27,.35,.5,.16",
  NGA: "@2;v:#008751,#fff,#008751",
  NER: "@1.17;h:#e05206,#fff,#0db02b;d:#e05206,.5,.5,.12",
  NIC: "@1.67;h:#0067c6,#fff,#0067c6;poly:#c8a000,.5,.38,.56,.6,.44,.6",
  NZL: "@2;bg:#00247d;uj:0,0,.5,.5;s:#cc142b,.75,.22,.06;s:#cc142b,.86,.43,.06;s:#cc142b,.68,.5,.06;s:#cc142b,.75,.8,.07",
  NLD: "h:#ae1c28,#fff,#21468b",
  NPL: "@.82;poly:#003893,0,0,.98,.48,.42,.48,1,1,0,1;poly:#dc143c,.04,.06,.88,.45,.32,.45,.88,.96,.04,.96;d:#fff,.3,.75,.1;s:#fff,.3,.33,.08,12",
  NAM: "dg:#003580,#009543;bd:#fff,.36;bd:#d21034,.26;s:#ffce00,.17,.22,.12,12",
  MOZ: "h:#007168/5,#fff/1,#000/5,#fff/1,#fce100/5;t:#d21034,.45;s:#fce100,.15,.5,.11",
  MAR: "bg:#c1272d;s:#006233,.5,.5,.25",
  ESH: "@2;h:#000,#fff,#007a3d;t:#c4111b,.33;c:#c4111b,#fff,.5,.5,.12,.25,0,.8;s:#c4111b,.54,.5,.06",
  MNE: "@2;bg:#d3ae3b;r:#c40308,.03,.05,.94,.9;d:#d3ae3b,.5,.5,.22",
  MNG: "@2;v:#c4272f,#015197,#c4272f;r:#f9cf02,.13,.22,.07,.56",
  MDA: "@2;v:#0046ae,#ffd200,#cc092f;r:#b07e2f,.45,.33,.1,.34",
  MEX: "@1.75;v:#006847,#fff,#ce1126;d:#8c5a2b,.5,.5,.12;hd:#006847,.5,.56,.1",
  MUS: "h:#ea2839,#1a206d,#ffd500,#00a551",
  MRT: "bg:#00a95c;r:#d01c1f,0,0,1,.15;r:#d01c1f,0,.85,1,.15;c:#ffd700,#00a95c,.5,.48,.24,0,-.22,.85;s:#ffd700,.5,.36,.08",
  MLT: "v:#fff,#cf142b;r:#999,.06,.06,.08,.14",
  MLI: "v:#14b53a,#fcd116,#ce1126",
  MDV: "bg:#d21034;r:#007e3a,.25,.25,.5,.5;c:#fff,#007e3a,.52,.5,.17,.3,0,.85",
  MYS: `@2;h:${alt(14, "#cc0001", "#fff")};r:#010066,0,0,.5,.571;c:#fc0,#010066,.15,.285,.2,.25,0,.82;s:#fc0,.34,.285,.14,14`,
  MWI: "h:#000,#ce1126,#339e35;s:#ce1126,.5,.21,.14,31;hd:#ce1126,.5,.33,.14",
  MDG: "h:#fc3d32,#007e3a;r:#fff,0,0,.33,1",
  MKD: "@2;bg:#d20000;sun:#ffe600,.5,.5,8;d:#ffe600,.5,.5,.16",
  LUX: "@1.67;h:#ed2939,#fff,#00a1de",
  LTU: "@1.67;h:#fdb913,#006a44,#c1272d",
  LBY: "@2;h:#e70013/1,#000/2,#239e46/1;c:#fff,#000,.47,.5,.14,.3,0,.82;s:#fff,.56,.5,.06",
  LBR: `@1.9;h:${alt(11, "#bf0a30", "#fff")};r:#002868,0,0,.35,.4545;s:#fff,.175,.227,.13`,
  LSO: "h:#00209f/3,#fff/4,#009543/3;poly:#000,.5,.36,.58,.6,.42,.6",
  LBN: "h:#ed1c24/1,#fff/2,#ed1c24/1;poly:#00a651,.5,.28,.62,.62,.38,.62",
  LVA: "@2;h:#9e3039/2,#fff/1,#9e3039/2",
  LAO: "h:#ce1126/1,#002868/2,#ce1126/1;d:#fff,.5,.5,.2",
  KGZ: "@1.67;bg:#e8112d;s:#ffef00,.5,.5,.3,40;d:#e8112d,.5,.5,.16;d:#ffef00,.5,.5,.13",
  KWT: "@2;h:#007a3d,#fff,#ce1126;poly:#000,0,0,.25,.333,.25,.667,0,1",
  KOS: "@1.4;bg:#244aa5;poly:#d0a650,.4,.42,.55,.36,.62,.5,.56,.7,.42,.68;s:#fff,.3,.28,.04;s:#fff,.38,.22,.04;s:#fff,.46,.19,.04;s:#fff,.54,.19,.04;s:#fff,.62,.22,.04;s:#fff,.7,.28,.04",
  KEN: "h:#000/6,#fff/1,#bb0000/6,#fff/1,#006600/6;e:#000,.5,.5,.12,.34;e:#bb0000,.5,.5,.08,.3",
  KAZ: "@2;bg:#00afca;s:#fec50c,.5,.45,.17,32;d:#00afca,.5,.45,.11;d:#fec50c,.5,.45,.1;r:#fec50c,.05,.05,.04,.9",
  JPN: "bg:#fff;d:#bc002d,.5,.5,.3",
  JAM: "@2;bg:#009b3a;poly:#000,0,0,.5,.5,0,1;poly:#000,1,0,.5,.5,1,1;sx:#fed100,.14",
  ITA: "v:#009246,#fff,#ce2b37",
  ISR: "@1.375;bg:#fff;r:#0038b8,0,.1,1,.15;r:#0038b8,0,.75,1,.15;s:#0038b8,.5,.5,.18,6;s:#fff,.5,.5,.13,6",
  IRL: "@2;v:#169b62,#fff,#ff883e",
  IRQ: "h:#ce1126,#fff,#000;r:#007a3d,.3,.44,.4,.12",
  IRN: "@1.75;h:#239f40,#fff,#da0000;d:#da0000,.5,.5,.11;d:#fff,.5,.5,.06",
  IDN: "h:#ff0000,#fff",
  IND: "h:#ff9933,#fff,#138808;ring:#000080,.5,.5,.13,.02;d:#000080,.5,.5,.03",
  ISL: "@1.39;bg:#02529c;x:#fff,.36,.5,.25;x:#dc1e35,.36,.5,.125",
  HUN: "@2;h:#ce2939,#fff,#477050",
  HND: "@2;h:#0073cf,#fff,#0073cf;s:#0073cf,.5,.5,.05;s:#0073cf,.42,.43,.04;s:#0073cf,.58,.43,.04;s:#0073cf,.42,.57,.04;s:#0073cf,.58,.57,.04",
  HTI: "@1.67;h:#00209f,#d21034;r:#fff,.39,.34,.22,.32;d:#016a16,.5,.5,.08",
  GUY: "@1.67;bg:#009e49;poly:#fff,0,0,1,.5,0,1;poly:#fcd116,0,.05,.92,.5,0,.95;poly:#000,0,0,.5,.5,0,1;poly:#ce1126,0,.06,.44,.5,0,.94",
  GNB: "@2;h:#fcd116,#009e49;r:#ce1126,0,0,.33,1;s:#000,.167,.5,.14",
  GIN: "v:#ce1126,#fcd116,#009460",
  GTM: "@1.6;v:#4997d0,#fff,#4997d0;ring:#6c8e3a,.5,.5,.12,.03;d:#e8d8a8,.5,.5,.08",
  GRC: `h:${alt(9, "#0d5eaf", "#fff")};r:#0d5eaf,0,0,.37,.556;p:#fff,.185,.278,.185,.278,.111`,
  GHA: "h:#ce1126,#fcd116,#006b3f;s:#000,.5,.5,.16",
  DEU: "@1.67;h:#000,#dd0000,#ffce00",
  GEO: "bg:#fff;p:#ff0000,.5,.5,.5,.5,.2;p:#ff0000,.17,.2,.04,.07,.04;p:#ff0000,.83,.2,.04,.07,.04;p:#ff0000,.17,.8,.04,.07,.04;p:#ff0000,.83,.8,.04,.07,.04",
  GMB: "h:#ce1126/6,#fff/1,#0c1c8c/4,#fff/1,#3a7728/6",
  GAB: "@1.33;h:#009e60,#fcd116,#3a75c4",
  FRA: "v:#002395,#fff,#ed2939",
  FIN: "@1.64;bg:#fff;x:#002f6c,.36,.5,.27",
  FJI: "@2;bg:#68bfe5;uj:0,0,.5,.5;r:#fff,.64,.28,.16,.42;r:#ce1126,.64,.28,.16,.1",
  ETH: "@2;h:#078930,#fcdd09,#da121a;d:#0f47af,.5,.5,.24;s:#fcdd09,.5,.5,.17",
  EST: "@1.57;h:#0072ce,#000,#fff",
  ERI: "@2;h:#12ad2b,#4189dd;poly:#ea0437,0,0,1,.5,0,1;ring:#ffc726,.24,.5,.15,.03",
  GNQ: "h:#3e9a00,#fff,#e32118;t:#0073ce,.2;r:#bbb,.46,.4,.08,.2",
  SLV: "@1.69;h:#0047ab,#fff,#0047ab;ring:#ffcc00,.5,.5,.1,.02;poly:#1b6d2e,.5,.44,.54,.54,.46,.54",
  EGY: "h:#ce1126,#fff,#000;r:#c09300,.46,.4,.08,.2",
  ECU: "h:#ffdd00/2,#034ea2/1,#ed1c24/1;e:#8b5a2b,.5,.5,.1,.13",
  DOM: "@1.6;r:#002d62,0,0,.5,.5;r:#ce1126,.5,0,.5,.5;r:#ce1126,0,.5,.5,.5;r:#002d62,.5,.5,.5,.5;p:#fff,.5,.5,.5,.5,.18;r:#2e7d32,.47,.45,.06,.1",
  DJI: "@1.5;h:#6ab2e7,#12ad2b;t:#fff,.45;s:#d7141a,.15,.5,.09",
  DNK: "@1.32;bg:#c8102e;x:#fff,.36,.5,.14",
  CZE: "h:#fff,#d7141a;t:#11457e,.5",
  CYN: "bg:#fff;r:#e30a17,0,.1,1,.1;r:#e30a17,0,.8,1,.1;c:#e30a17,#fff,.45,.5,.15,.25,0,.8;s:#e30a17,.55,.5,.06",
  CYP: "bg:#fff;poly:#d57800,.3,.5,.45,.32,.72,.28,.68,.4,.5,.52;r:#4e5b31,.4,.66,.2,.04",
  CUB: "@2;h:#002a8f,#fff,#002a8f,#fff,#002a8f;t:#cf142b,.43;s:#fff,.14,.5,.12",
  HRV: "@2;h:#ff0000,#fff,#171796;r:#ff0000,.43,.3,.14,.34;r:#fff,.465,.33,.035,.07;r:#fff,.535,.33,.035,.07;r:#fff,.5,.4,.035,.07;r:#fff,.465,.47,.035,.07;r:#fff,.535,.47,.035,.07",
  CIV: "v:#f77f00,#fff,#009e60",
  CRI: "@1.67;h:#002b7f/1,#fff/1,#ce1126/2,#fff/1,#002b7f/1",
  COD: "@1.33;bg:#007fff;bd:#f7d618,.36;bd:#ce1021,.26;s:#f7d618,.14,.2,.13",
  COG: "dg:#009543,#dc241f;bd:#fbde4a,.32",
  COM: "@1.67;h:#ffc61e,#fff,#ce1126,#3a75c4;t:#3d8e33,.4;c:#fff,#3d8e33,.12,.5,.15,.3,0,.85",
  COL: "h:#fcd116/2,#003893/1,#ce1126/1",
  CHN: "bg:#ee1c25;s:#ff0,.167,.25,.15;s:#ff0,.33,.1,.05;s:#ff0,.4,.2,.05;s:#ff0,.4,.35,.05;s:#ff0,.33,.45,.05",
  CHL: "h:#fff,#d52b1e;r:#0039a6,0,0,.333,.5;s:#fff,.167,.25,.14",
  TCD: "v:#002664,#fecb00,#c60c30",
  CAF: "@1.67;h:#003082,#fff,#289728,#ffce00;r:#d21034,.4375,0,.125,1;s:#ffce00,.1,.12,.09",
  CPV: "@1.7;h:#003893/6,#fff/1,#cf2027/1,#fff/1,#003893/3;sa:#f7d116,.38,.62,.17,.03,10",
  CAN: "@2;v:#d80621/1,#fff/2,#d80621/1;ml:#d80621,.5,.5,.36",
  CMR: "v:#007a5e,#ce1126,#fcd116;s:#fcd116,.5,.5,.13",
  KHM: "@1.56;h:#032ea1/1,#e00025/2,#032ea1/1;poly:#fff,.36,.62,.36,.48,.42,.44,.47,.3,.5,.24,.53,.3,.58,.44,.64,.48,.64,.62",
  MMR: "h:#fecb00,#34b233,#ea2839;s:#fff,.5,.56,.32",
  BDI: "@1.67;bg:#ce1126;poly:#1eb53a,0,0,.5,.5,0,1;poly:#1eb53a,1,0,.5,.5,1,1;sx:#fff,.15;d:#fff,.5,.5,.22;s:#ce1126,.5,.4,.05,6;s:#ce1126,.44,.56,.05,6;s:#ce1126,.56,.56,.05,6",
  BFA: "h:#ef2b2d,#009e49;s:#fcd116,.5,.5,.16",
  BGR: "@1.67;h:#fff,#00966e,#d62612",
  BRN: "@2;bg:#f7e017;bd2:#fff,.22;bd2:#000,.12;d:#cf1126,.5,.5,.16;c:#f7e017,#cf1126,.5,.5,.09,0,-.3,.8",
  BRA: "@1.43;bg:#009c3b;poly:#ffdf00,.5,.08,.92,.5,.5,.92,.08,.5;d:#002776,.5,.5,.24;r:#fff,.3,.46,.4,.04",
  BWA: "h:#75aadb/9,#fff/1,#000/4,#fff/1,#75aadb/9",
  BIH: "@2;bg:#002395;poly:#fecb00,.27,0,.73,0,.73,1;s:#fff,.2,.06,.05;s:#fff,.28,.2,.05;s:#fff,.36,.34,.05;s:#fff,.44,.48,.05;s:#fff,.52,.62,.05;s:#fff,.6,.76,.05;s:#fff,.68,.9,.05",
  BOL: "@1.47;h:#d52b1e,#f9e300,#007934",
  BTN: "dg2:#ffd520,#ff4e12;e:#fff,.5,.5,.25,.12",
  BEN: "h:#fcd116,#e8112d;r:#008751,0,0,.4,1",
  BLZ: "@1.67;h:#ce1126/1,#003f87/8,#ce1126/1;d:#fff,.5,.5,.27;ring:#2e7d32,.5,.5,.25,.03",
  BEL: "@1.15;v:#000,#fdda24,#ef3340",
  BLR: "@2;h:#c8313e/2,#4aa657/1;r:#fff,0,0,.11,1;r:#c8313e,.035,0,.04,1",
  BRB: "v:#00267f,#ffc726,#00267f;poly:#000,.47,.75,.47,.42,.42,.3,.47,.36,.5,.22,.53,.36,.58,.3,.53,.42,.53,.75",
  BGD: "@1.67;bg:#006a4e;d:#f42a41,.45,.5,.3",
  BHR: "@1.67;bg:#ce1126;zz:#fff,.3,5",
  BHS: "@2;h:#00abc9,#fae042,#00abc9;t:#000,.43",
  AZE: "@2;h:#0092bc,#e4002b,#00af66;c:#fff,#e4002b,.46,.5,.13,.25,0,.8;s:#fff,.55,.5,.06,8",
  AUT: "h:#ed2939,#fff,#ed2939",
  AUS: "@2;bg:#00008b;uj:0,0,.5,.5;s:#fff,.25,.75,.11,7;s:#fff,.75,.84,.055,7;s:#fff,.64,.45,.055,7;s:#fff,.75,.16,.055,7;s:#fff,.86,.38,.055,7;s:#fff,.81,.53,.03",
  ARM: "@2;h:#d90012,#0033a0,#f2a800",
  ARG: "@1.6;h:#74acdf,#fff,#74acdf;s:#f6b40e,.5,.5,.13,32;d:#f6b40e,.5,.5,.08",
  AGO: "h:#cc092f,#000;ring:#ffcb00,.5,.5,.16,.04;s:#ffcb00,.56,.4,.05",
  AND: "@1.43;v:#10069f,#fedf00,#d50032;r:#c7b37f,.44,.36,.12,.28",
  DZA: "v:#006633,#fff;c:#d21034,#fff,.52,.5,.25,.25,0,.8;s:#d21034,.6,.5,.1",
  ALB: "@1.4;bg:#e41e20;poly:#000,.5,.2,.6,.3,.76,.22,.7,.46,.6,.5,.62,.8,.5,.68,.38,.8,.4,.5,.3,.46,.24,.22,.4,.3",
  AFG: "bg:#fff;r:#000,.22,.36,.56,.08;r:#000,.27,.52,.46,.06",
};

/** Historical flags a country can switch to. */
export const HISTORICAL: Record<string, [string, string][]> = {
  RUS: [["Soviet Union (1955)", "@2;bg:#cc0000;s:#ffd700,.12,.12,.06;r:#ffd700,.08,.22,.08,.04"], ["Russian Empire (1858)", "h:#000,#ffd700,#fff"]],
  DEU: [["German Empire (1871)", "h:#000,#fff,#dd0000"], ["Weimar Republic (1919)", "@1.67;h:#000,#dd0000,#ffce00"]],
  FRA: [["Kingdom of France", "bg:#fff;r:#c8a200,.45,.4,.1,.2"], ["Free France (1940)", "v:#002395,#fff,#ed2939;p:#ed2939,.5,.45,.04,.15,.04"]],
  GBR: [["Great Britain (1606)", "@2;bg:#012169;sx:#fff,.2;x:#fff,.5,.5,.32;x:#c8102e,.5,.5,.2"], ["England", "bg:#fff;x:#ce1124,.5,.5,.2"]],
  ESP: [["Second Republic (1931)", "h:#c60b1e,#ffc400,#6c2b8f"], ["Kingdom (1785)", "h:#aa151b/1,#f1bf00/2,#aa151b/1"]],
  PRT: [["Kingdom of Portugal (1830)", "v:#0033a0,#fff;d:#c8a200,.5,.5,.15"]],
  ITA: [["Kingdom of Italy (1861)", "v:#009246,#fff,#ce2b37;r:#ce2b37,.44,.38,.12,.24;p:#fff,.5,.5,.05,.1,.04"]],
  AFG: [["Islamic Republic (2013)", "v:#000,#be0000,#009900;ring:#fff,.5,.5,.15,.02"]],
  IRN: [["Imperial State (1964)", "@1.75;h:#239f40,#fff,#da0000;d:#f2c200,.5,.5,.09"]],
  SYR: [["Ba'athist Syria (1980)", "h:#ce1126,#fff,#000;s:#007a3d,.38,.5,.08;s:#007a3d,.62,.5,.08"]],
  LBY: [["Jamahiriya (1977)", "@2;bg:#009a00"]],
  ZAF: [["Union of South Africa (1928)", "h:#ff7f00,#fff,#00247d"]],
  CAN: [["Canadian Red Ensign (1957)", "@2;bg:#c8102e;uj:0,0,.5,.5;r:#fff,.7,.35,.1,.25"]],
  BLR: [["White-red-white", "@2;h:#fff,#c8313e,#fff"]],
  GEO: [["Democratic Republic (1918)", "bg:#8b0000;r:#000,0,0,.4,.14;r:#fff,0,.14,.4,.14"]],
  MMR: [["Union of Burma (1974)", "@1.8;bg:#e00;r:#0033a0,0,0,.5,.5;ring:#fff,.25,.25,.12,.03"]],
  VNM: [["Republic of Vietnam (1955)", "bg:#ffcd00;r:#da251d,0,.38,1,.06;r:#da251d,0,.47,1,.06;r:#da251d,0,.56,1,.06"]],
  CHN: [["Republic of China (1928)", "bg:#fe0000;r:#000095,0,0,.5,.5;s:#fff,.25,.25,.18,12;d:#000095,.25,.25,.1;d:#fff,.25,.25,.085"]],
  EGY: [["Kingdom of Egypt (1922)", "bg:#006c35;c:#fff,#006c35,.45,.5,.25,.25,0,.8;s:#fff,.55,.4,.05;s:#fff,.6,.5,.05;s:#fff,.55,.6,.05"]],
  USA: [["Thirteen colonies (1777)", `@1.9;h:${alt(13, "#b22234", "#fff")};r:#3c3b6e,0,0,.4,.538;sa:#fff,.2,.27,.18,.04,13`]],
  JPN: [["Plain white (peace)", "bg:#fff;ring:#bc002d,.5,.5,.3,.02"]],
  IND: [["Indian Empire Star", "@2;bg:#c8102e;uj:0,0,.5,.5;s:#c8a200,.75,.5,.15"]],
};

/** A flag for a country that has no recipe (a new state, say): a tricolour from its name. */
export function madeUpFlag(name: string): string {
  let h = 7;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pal = ["#b22234", "#1f4fa8", "#f4f4f4", "#138808", "#f1bf00", "#111111", "#ff9933", "#6a2c91", "#00a3dd", "#d52b1e"];
  const a = pal[h % pal.length];
  let b = pal[(h >>> 5) % pal.length];
  if (b === a) b = pal[(h + 3) % pal.length];
  let c = pal[(h >>> 10) % pal.length];
  if (c === b || c === a) c = "#f4f4f4" === a || "#f4f4f4" === b ? "#111111" : "#f4f4f4";
  return (h >>> 15) % 2 ? `v:${a},${b},${c}` : `h:${a},${b},${c};s:${c === "#f4f4f4" ? a : "#f4f4f4"},.2,.25,.12`;
}
