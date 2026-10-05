/** Scoped UI styles for Lifeline (injected once, under .ll). Glass panels with a lit rim. */
export const ACCENT = "#2dd4bf";

export const css = `
.ll{--ll-accent:${ACCENT};--ll-ink:#04201c;--ll-text:#f4f7fb;--ll-bad:#fb7185;--ll-good:#4ade80;--ll-warn:#fbbf24;
  font-family:var(--font-montserrat),'Montserrat','Inter',system-ui,sans-serif;color:var(--ll-text);font-size:14px;-webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none}
.ll *{box-sizing:border-box}
.ll-glass{isolation:isolate;border-radius:18px;border:1px solid rgba(255,255,255,.18);
  background:linear-gradient(150deg,rgba(255,255,255,.16),rgba(255,255,255,.04) 40%,rgba(255,255,255,.08)),rgba(12,18,28,.5);
  backdrop-filter:blur(14px) saturate(1.7);-webkit-backdrop-filter:blur(14px) saturate(1.7);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.45),inset 0 -1px 0 rgba(255,255,255,.08),0 16px 40px -16px rgba(0,0,0,.6)}
.ll-glass:not(.absolute){position:relative}
.ll-glass::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;
  background:linear-gradient(155deg,rgba(255,255,255,.7),rgba(255,255,255,.1) 30%,rgba(255,255,255,0) 55%,rgba(255,255,255,.3));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.ll-btn{display:inline-flex;align-items:center;justify-content:center;gap:.45em;min-height:44px;min-width:44px;padding:0 1em;border-radius:999px;border:1px solid rgba(255,255,255,.16);
  background:linear-gradient(180deg,rgba(255,255,255,.13),rgba(255,255,255,.03));color:inherit;font:inherit;font-weight:700;cursor:pointer;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 4px 12px -8px rgba(0,0,0,.6);transition:transform .25s cubic-bezier(.3,1.6,.5,1),background .15s}
.ll-btn:hover{transform:translateY(-1px)}
.ll-btn:active{transform:scale(.95)}
.ll-btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
.ll-btn[aria-pressed="true"],.ll-btn.ll-on{background:linear-gradient(180deg,#7ff0df,var(--ll-accent));color:var(--ll-ink);border-color:transparent;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 6px 18px -8px var(--ll-accent)}
.ll-btn.ll-danger{color:var(--ll-bad);border-color:rgba(251,113,133,.5)}
.ll-label{font-size:.7em;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
.ll-h{font-weight:900;letter-spacing:-.01em}
.ll-scroll{overflow:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent}
.ll-card{display:flex;gap:.6em;align-items:center;width:100%;min-height:52px;padding:.5em .7em;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.05);color:inherit;font:inherit;text-align:start;cursor:pointer;transition:background .15s,transform .15s}
.ll-card:hover{background:rgba(255,255,255,.1);transform:translateY(-1px)}
.ll-card[aria-pressed="true"]{background:rgba(45,212,191,.18);border-color:var(--ll-accent)}
.ll-card:disabled{opacity:.5;cursor:not-allowed;transform:none}
.ll-pill{display:inline-flex;align-items:center;gap:.3em;border-radius:999px;padding:.1em .55em;font-size:.72em;font-weight:900}
.ll-in{animation:ll-in .2s ease-out both}
@keyframes ll-in{from{opacity:0;transform:translateY(8px)}}
.ll :focus-visible{outline:3px solid var(--ll-accent);outline-offset:2px}
.ll-bar{height:7px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden}
.ll-bar>i{display:block;height:100%;border-radius:999px}
`;
