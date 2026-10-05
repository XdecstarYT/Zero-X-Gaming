/**
 * Every colour, radius and font the UI and the 3D world use. The accent is
 * Zero X's brand cyan; swap ACCENT to restyle the whole game.
 */
export const ACCENT = "#22e5ff";
export const ACCENT_INK = "#03141a";

export const theme = {
  accent: ACCENT,
  accentInk: ACCENT_INK,
  danger: "#ff5a5f",
  on: "#34d399",
  off: "#f87171",
  text: "#f4f7fb",
  muted: "rgba(244,247,251,.62)",
  glass: "rgba(14,18,26,.62)",
  glassStrong: "rgba(10,13,20,.82)",
  border: "rgba(255,255,255,.14)",
  radius: "18px",
  radiusSm: "12px",
  font: "var(--font-montserrat), 'Montserrat', 'Inter', system-ui, sans-serif",
  zone: { R: "#4ade80", C: "#60a5fa", I: "#facc15", M: "#c084fc" } as Record<string, string>,
  /** Land value overlay: a colour-blind-safe sequential ramp (low → high). */
  ramp: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
};

/** World palette. */
export const world = {
  grass: "#5fa83a",
  grassDry: "#8fae4a",
  sand: "#d8c48d",
  rock: "#8c8173",
  snow: "#eef2f5",
  waterShallow: "#3fb3c9",
  waterDeep: "#13506e",
  asphalt: "#2b2d31",
  asphaltWorn: "#3a3c40",
  sidewalk: "#b9b4aa",
  curb: "#d6d2c8",
  lineWhite: "#f3f3ee",
  lineYellow: "#f2c230",
  busLane: "#a8392c",
  brick: ["#a3412f", "#8f3a2a", "#b04a35", "#7f3326"],
  cream: ["#e8dcc0", "#ddd2b6", "#efe6d0"],
  grey: ["#9aa1a8", "#b4b8bb", "#7e858c"],
  glass: "#6f93b0",
  roofDark: "#3b3b3e",
  roofTile: ["#7a3b2e", "#5b5f66", "#6d4a3a"],
  metal: ["#9fa7ad", "#7f8a91", "#b9c0c4"],
  trees: ["#3f7f2f", "#4c8f33", "#2f6a2a", "#5a9a3a"],
  trunk: "#6b4a2f",
};

/** Scoped stylesheet for the game's UI (injected once, under .zc). */
export const css = `
.zc{--zc-accent:${theme.accent};--zc-ink:${theme.accentInk};--zc-glass:${theme.glass};--zc-glass-strong:${theme.glassStrong};--zc-border:${theme.border};--zc-r:${theme.radius};--zc-rs:${theme.radiusSm};--zc-on:${theme.on};--zc-off:${theme.off};--zc-danger:${theme.danger};--zc-text:${theme.text};--zc-muted:${theme.muted};--zc-scale:1;
  font-family:${theme.font};color:var(--zc-text);font-size:calc(14px * var(--zc-scale));-webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none}
.zc *{box-sizing:border-box}
.zc-glass{background:var(--zc-glass);backdrop-filter:blur(18px) saturate(1.3);-webkit-backdrop-filter:blur(18px) saturate(1.3);border:1px solid var(--zc-border);border-radius:var(--zc-r);box-shadow:0 18px 50px -20px rgba(0,0,0,.6)}
.zc-glass-dark{background:var(--zc-glass-strong);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid var(--zc-border);border-radius:var(--zc-r)}
.zc-label{font-size:.72em;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
.zc-h{font-weight:900;letter-spacing:-.01em}
.zc-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5em;min-height:44px;min-width:44px;padding:0 1em;border-radius:var(--zc-rs);border:1px solid var(--zc-border);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-weight:700;cursor:pointer;transition:transform .15s ease,background .15s ease,box-shadow .15s ease}
.zc-btn:hover{transform:translateY(-1px);background:rgba(255,255,255,.12)}
.zc-btn:active{transform:translateY(0)}
.zc-btn[aria-pressed="true"],.zc-btn.zc-on{background:var(--zc-accent);color:var(--zc-ink);border-color:transparent}
.zc-btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
.zc-accent{background:var(--zc-accent);color:var(--zc-ink)}
.zc-danger{color:var(--zc-danger)}
.zc :focus-visible{outline:3px solid var(--zc-accent);outline-offset:2px}
.zc-row{display:flex;align-items:center;gap:.9em;width:100%;min-height:52px;padding:.55em .9em;border-radius:var(--zc-rs);background:transparent;border:0;color:inherit;font:inherit;text-align:start;cursor:pointer;transition:background .15s ease,transform .15s ease}
.zc-row:hover{background:rgba(255,255,255,.08);transform:translateY(-1px)}
.zc-in{animation:zc-in .2s ease-out both}
.zc-slide{animation:zc-slide .2s ease-out both}
@keyframes zc-in{from{opacity:0}}
@keyframes zc-slide{from{opacity:0;transform:translateY(10px)}}
.zc-pill{display:inline-flex;align-items:center;gap:.35em;border-radius:999px;padding:.15em .6em;font-size:.68em;font-weight:900;letter-spacing:.12em}
.zc-scroll{overflow:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent}
.zc-tile{transform-box:fill-box;transform-origin:center}
.zc-mark .zc-t0{animation:zc-t0 2.4s cubic-bezier(.6,0,.3,1) infinite}
.zc-mark .zc-t1{animation:zc-t1 2.4s cubic-bezier(.6,0,.3,1) infinite}
.zc-mark .zc-t2{animation:zc-t2 2.4s cubic-bezier(.6,0,.3,1) infinite}
.zc-mark .zc-t3{animation:zc-t3 2.4s cubic-bezier(.6,0,.3,1) infinite}
@keyframes zc-t0{0%,15%{transform:none}35%,60%{transform:translate(110%,0) rotate(90deg)}80%,100%{transform:none}}
@keyframes zc-t1{0%,15%{transform:none}35%,60%{transform:translate(0,110%) rotate(-12deg)}80%,100%{transform:none}}
@keyframes zc-t2{0%,15%{transform:none}35%,60%{transform:translate(0,-110%) rotate(12deg)}80%,100%{transform:none}}
@keyframes zc-t3{0%,15%{transform:none}35%,60%{transform:translate(-110%,0) rotate(-90deg)}80%,100%{transform:none}}
.zc-ring{animation:zc-ring 1.2s ease-out infinite}
@keyframes zc-ring{from{transform:scale(.6);opacity:1}to{transform:scale(1.6);opacity:0}}
.zc-toast{animation:zc-slide .25s ease-out both}
.zc-reduce *, .zc-reduce *::before, .zc-reduce *::after{animation-duration:0s!important;animation-iteration-count:1!important;transition:none!important}
.zc input[type=range]{accent-color:var(--zc-accent);width:100%;min-height:32px}
.zc select{background:rgba(255,255,255,.08);color:inherit;border:1px solid var(--zc-border);border-radius:var(--zc-rs);min-height:40px;padding:0 .6em;font:inherit;font-weight:700}
.zc select option{background:#111722;color:#fff}
`;
