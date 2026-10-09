/**
 * Flags as small SVGs (simplified, drawn here): Avalon's, the twelve real countries', and a
 * tricolour made up for a custom country from its name. Used as images in the UI and painted
 * onto the chamber's flags in 3D.
 */

const UNION = `<clipPath id="t"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath><path d="M0,0v30h60v-30z" fill="#012169"/><path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0L60,30M60,0L0,30" clip-path="url(#t)" stroke="#C8102E" stroke-width="4"/><path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/>`;

/** A seven-pointed star (Australia's Commonwealth Star), centre and radius. */
function star7(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="#fff"/>`;
}

function usFlag() {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 100"><rect width="190" height="100" fill="#fff"/>`;
  for (let i = 0; i < 13; i += 2) s += `<rect y="${(i * 100) / 13}" width="190" height="${100 / 13}" fill="#B22234"/>`;
  s += `<rect width="76" height="${(7 * 100) / 13}" fill="#3C3B6E"/>`;
  for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) s += `<circle cx="${6.3 + c * 12.6 + (r % 2 ? 6.3 : 0)}" cy="${5.4 + r * 5.4}" r="1.9" fill="#fff"/>`;
  return s + "</svg>";
}

const MAPLE = "M75,10 l7,14 l10,-4 l-3,22 l14,-12 l3,8 l13,-3 l-4,14 l6,3 l-22,18 l3,7 l-23,-3 l1,24 h-10 l1,-24 l-23,3 l3,-7 l-22,-18 l6,-3 l-4,-14 l13,3 l3,-8 l14,12 l-3,-22 l10,4 z";

export const FLAGS: Record<string, string> = {
  avalon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 20"><rect width="29" height="20" fill="#24408e"/><rect y="7" width="29" height="6" fill="#f4f4f4"/><circle cx="14.5" cy="10" r="3.4" fill="#d6a520"/></svg>`,
  us: usFlag(),
  gb: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30">${UNION}</svg>`,
  ca: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 75"><rect width="150" height="75" fill="#fff"/><rect width="37.5" height="75" fill="#D80621"/><rect x="112.5" width="37.5" height="75" fill="#D80621"/><path d="${MAPLE}" fill="#D80621" transform="translate(0,-4) scale(1)"/></svg>`,
  au: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><rect width="120" height="60" fill="#00008B"/><g transform="scale(1)">${UNION}</g>${star7(30, 45, 7)}${star7(90, 48, 3.4)}${star7(78, 28, 3.4)}${star7(90, 10, 3.4)}${star7(103, 24, 3.4)}${star7(96, 33, 2)}</svg>`,
  de: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 3"><rect width="5" height="1" fill="#000"/><rect y="1" width="5" height="1" fill="#DD0000"/><rect y="2" width="5" height="1" fill="#FFCE00"/></svg>`,
  fr: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2"><rect width="1" height="2" fill="#002395"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#ED2939"/></svg>`,
  es: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 500"><rect width="750" height="500" fill="#AA151B"/><rect y="125" width="750" height="250" fill="#F1BF00"/><g transform="translate(250,250)"><rect x="-38" y="-52" width="76" height="92" rx="14" fill="#AA151B" stroke="#8a5a00" stroke-width="5"/><rect x="-38" y="-52" width="38" height="46" fill="#c8b100" opacity=".5"/><rect x="-62" y="-50" width="12" height="96" fill="#ddd" stroke="#8a5a00" stroke-width="3"/><rect x="50" y="-50" width="12" height="96" fill="#ddd" stroke="#8a5a00" stroke-width="3"/><path d="M-30,-58 q30,-26 60,0z" fill="#c8b100"/></g></svg>`,
  it: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2"><rect width="1" height="2" fill="#009246"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#CE2B37"/></svg>`,
  jp: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600"><rect width="900" height="600" fill="#fff"/><circle cx="450" cy="300" r="180" fill="#BC002D"/></svg>`,
  in: (() => {
    let spokes = "";
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      spokes += `<line x1="450" y1="300" x2="${(450 + Math.cos(a) * 88).toFixed(1)}" y2="${(300 + Math.sin(a) * 88).toFixed(1)}" stroke="#000080" stroke-width="4"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600"><rect width="900" height="200" fill="#FF9933"/><rect y="200" width="900" height="200" fill="#fff"/><rect y="400" width="900" height="200" fill="#138808"/><circle cx="450" cy="300" r="92" fill="none" stroke="#000080" stroke-width="8"/>${spokes}<circle cx="450" cy="300" r="16" fill="#000080"/></svg>`;
  })(),
  br: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 504"><rect width="720" height="504" fill="#009C3B"/><path d="M360,46 L674,252 L360,458 L46,252z" fill="#FFDF00"/><circle cx="360" cy="252" r="124" fill="#002776"/><path d="M240,226 q120,-36 240,40 l-6,22 q-120,-74 -232,-38z" fill="#fff"/></svg>`,
  mx: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 4"><rect width="7" height="4" fill="#fff"/><rect width="2.333" height="4" fill="#006847"/><rect x="4.667" width="2.333" height="4" fill="#CE1126"/><ellipse cx="3.5" cy="2" rx=".62" ry=".55" fill="#8a5a2b"/><path d="M2.95,2.35 q.55,.45 1.1,0" stroke="#006847" stroke-width=".12" fill="none"/></svg>`,
};

/** A flag for a custom country: three bands in colours picked from its name (and an emblem). */
export function madeUpFlag(name: string, colors: string[] = []) {
  let h = 7;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const palette = ["#b22234", "#1f4fa8", "#f4f4f4", "#138808", "#f1bf00", "#111111", "#ff9933", "#6a2c91", "#00a3dd", "#d52b1e"];
  const pick = (k: number) => colors[k] ?? palette[(h >>> (k * 5)) % palette.length];
  const a = pick(0);
  let b = pick(1);
  if (b === a) b = "#f4f4f4";
  const c = pick(2) === b ? a : pick(2);
  const vertical = h % 2 === 0;
  const bands = vertical
    ? `<rect width="1" height="2" fill="${a}"/><rect x="1" width="1" height="2" fill="${b}"/><rect x="2" width="1" height="2" fill="${c}"/>`
    : `<rect width="3" height=".667" fill="${a}"/><rect y=".667" width="3" height=".667" fill="${b}"/><rect y="1.333" width="3" height=".667" fill="${c}"/>`;
  const emblem = h % 3 === 0 ? `<circle cx="1.5" cy="1" r=".28" fill="#d6a520" stroke="rgba(0,0,0,.25)" stroke-width=".03"/>` : h % 3 === 1 ? `<polygon points="1.5,.68 1.58,.92 1.83,.92 1.63,1.07 1.7,1.31 1.5,1.16 1.3,1.31 1.37,1.07 1.17,.92 1.42,.92" fill="#ffd60a"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2">${bands}${emblem}</svg>`;
}

/** The flag's SVG markup for a scenario. */
export const flagSvg = (code: string | undefined, name = "", colors?: string[]) => (code && FLAGS[code]) || madeUpFlag(name, colors);
/** As a data URL, for an <img> or the 3D flags. */
export const flagUrl = (code: string | undefined, name = "", colors?: string[]) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(flagSvg(code, name, colors))}`;
