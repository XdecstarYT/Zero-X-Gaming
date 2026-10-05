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

/* ---- Liquid glass (root class zc-ui-liquid; zc-refract adds the lens where the browser can) ---- */
.zc-ui-liquid{--zc-glass:rgba(22,28,40,.34);--zc-glass-strong:rgba(16,20,30,.44)}
.zc-ui-liquid .zc-glass,.zc-ui-liquid .zc-glass-dark{
  background:linear-gradient(145deg,rgba(255,255,255,.17),rgba(255,255,255,.05) 38%,rgba(255,255,255,.02) 62%,rgba(255,255,255,.09)),var(--zc-glass);
  border:1px solid rgba(255,255,255,.18);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 -1px 0 rgba(255,255,255,.1),inset 0 0 22px rgba(255,255,255,.05),0 16px 44px -16px rgba(0,0,0,.55),0 2px 6px -2px rgba(0,0,0,.3);
  backdrop-filter:blur(10px) saturate(1.9) brightness(1.06);-webkit-backdrop-filter:blur(10px) saturate(1.9) brightness(1.06);
  isolation:isolate}
.zc-ui-liquid .zc-glass-dark{background:linear-gradient(145deg,rgba(255,255,255,.14),rgba(255,255,255,.03) 45%,rgba(255,255,255,.07)),var(--zc-glass-strong)}
.zc-ui-liquid :is(.zc-glass,.zc-glass-dark):not(.absolute):not(.fixed){position:relative}
/* The rim: a bright edge on the lit side fading round to a faint one. */
.zc-ui-liquid :is(.zc-glass,.zc-glass-dark)::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:1;
  background:linear-gradient(155deg,rgba(255,255,255,.75),rgba(255,255,255,.12) 30%,rgba(255,255,255,0) 55%,rgba(255,255,255,.28) 85%,rgba(255,255,255,.5));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
/* The sheen: a soft highlight that follows the pointer (--mx/--my, set by trackSheen). */
.zc-ui-liquid :is(.zc-glass,.zc-glass-dark)::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;
  background:radial-gradient(90% 70% at var(--mx,22%) var(--my,0%),rgba(255,255,255,.2),rgba(255,255,255,0) 60%);transition:background .25s ease}
.zc-ui-liquid.zc-refract .zc-glass:not(.zc-sheet){backdrop-filter:url(#zc-lg) blur(4px) saturate(1.9) brightness(1.06)}
.zc-ui-liquid.zc-refract .zc-glass-dark{backdrop-filter:url(#zc-lg-bar) blur(3px) saturate(1.9) brightness(1.06)}
.zc-ui-liquid .zc-sheet{backdrop-filter:blur(26px) saturate(1.8) brightness(.95);-webkit-backdrop-filter:blur(26px) saturate(1.8) brightness(.95);--zc-glass:rgba(16,20,30,.55)}
/* Capsule buttons: domed, lit from above, squash a little when pressed. */
.zc-ui-liquid .zc-btn{border-radius:999px;border-color:rgba(255,255,255,.16);
  background:radial-gradient(120% 90% at var(--mx,50%) var(--my,0%),rgba(255,255,255,.2),rgba(255,255,255,0) 70%),linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,.03));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.38),inset 0 -1px 1px rgba(0,0,0,.18),0 4px 14px -8px rgba(0,0,0,.6);
  transition:transform .28s cubic-bezier(.3,1.6,.5,1),background .2s ease,box-shadow .2s ease}
.zc-ui-liquid .zc-btn:hover{transform:translateY(-1px) scale(1.03)}
.zc-ui-liquid .zc-btn:active{transform:scale(.94);transition-duration:.08s}
.zc-ui-liquid .zc-btn[aria-pressed="true"],.zc-ui-liquid .zc-btn.zc-on{
  background:radial-gradient(120% 90% at var(--mx,50%) var(--my,0%),rgba(255,255,255,.55),rgba(255,255,255,0) 60%),linear-gradient(180deg,color-mix(in srgb,var(--zc-accent) 80%,#fff),var(--zc-accent));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 -2px 4px rgba(0,0,0,.12),0 0 0 1px color-mix(in srgb,var(--zc-accent) 60%,transparent),0 8px 22px -8px var(--zc-accent)}
.zc-ui-liquid .zc-pill{box-shadow:inset 0 1px 0 rgba(255,255,255,.45)}
.zc-ui-liquid .zc-row{border-radius:16px}
.zc-ui-liquid .zc-row:hover{background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,.04));box-shadow:inset 0 1px 0 rgba(255,255,255,.25)}
/* Frosted: the original plain blur. Solid: no transparency at all (also the reduce-transparency default). */
.zc-ui-solid{--zc-glass:#141a24;--zc-glass-strong:#0f141c}
.zc-ui-solid .zc-glass,.zc-ui-solid .zc-glass-dark{backdrop-filter:none;-webkit-backdrop-filter:none}
`;
