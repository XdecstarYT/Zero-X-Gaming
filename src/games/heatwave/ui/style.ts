/** Heatwave's styles (scoped under .hw). Sunset colours; phone first, sideways or upright. */
export const css = `
.hw{position:absolute;inset:0;overflow:hidden;background:#0b0d16;color:#fff;font-family:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;container-type:size;container-name:hw;-webkit-user-select:none;user-select:none;touch-action:none}
.hw *{box-sizing:border-box}
.hw button{font:inherit;color:inherit;cursor:pointer}
.hw-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none}
.hw-btn{border:0;border-radius:999px;padding:10px 20px;font-weight:800;letter-spacing:.02em;background:rgba(255,255,255,.12);color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);transition:transform .12s,filter .12s}
.hw-btn:hover{filter:brightness(1.12)}
.hw-btn:active{transform:scale(.97)}
.hw-btn:disabled{opacity:.6;filter:saturate(.5);cursor:progress}
.hw-credit{margin:8px 0 0;font-size:11px;opacity:.7}
.hw-loading{display:grid;gap:6px;margin:14px 0 6px}
.hw-loading-bar{height:8px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden}
.hw-loading-bar span{display:block;height:100%;background:linear-gradient(90deg,#ff4fa3,#ff8a3d);transition:width .2s}
.hw-loading small{font-size:12px;opacity:.85}
.hw-credit a{color:inherit;text-decoration:underline}
.hw-btn:focus-visible,.hw button:focus-visible{outline:2px solid #ffd23f;outline-offset:2px}
.hw-btn.primary{background:linear-gradient(135deg,#ff4fa3,#ff8a3d);box-shadow:0 8px 24px -8px rgba(255,79,163,.7)}
.hw-btn.ghost{background:transparent}
.hw-btn.small{padding:7px 14px;font-size:13px}
.hw-btn:disabled{opacity:.45;cursor:not-allowed}

/* ---- title ---- */
.hw-title{position:absolute;inset:0;display:grid;place-items:center;padding:16px;overflow:auto;background:radial-gradient(120% 90% at 50% 110%,#ff8a3d 0%,#ff4fa3 28%,#5b2a86 55%,#120d2a 85%)}
.hw-sun{position:absolute;left:50%;top:58%;width:min(70vmin,560px);aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:repeating-linear-gradient(180deg,#ffd23f 0 14px,transparent 14px 22px),linear-gradient(#ffd23f,#ff4fa3);-webkit-mask:linear-gradient(#000 0 55%,transparent 55%) , repeating-linear-gradient(180deg,#000 0 12px,transparent 12px 20px);mask:linear-gradient(#000 0 40%,rgba(0,0,0,.9) 40%);opacity:.55;filter:blur(.3px)}
.hw-title-card{position:relative;width:min(640px,100%);text-align:center;padding:22px 18px;border-radius:28px;background:rgba(14,10,30,.55);backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),0 30px 80px -30px rgba(0,0,0,.8)}
.hw-kicker{margin:0;font-size:11px;font-weight:800;letter-spacing:.3em;text-transform:uppercase;color:#ffd9ec}
.hw-logo{margin:6px 0 4px;font-size:clamp(46px,12vw,92px);line-height:.9;font-weight:900;font-style:italic;letter-spacing:-.02em;background:linear-gradient(180deg,#fff6c9,#ffd23f 40%,#ff8a3d 70%,#ff4fa3);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 4px 0 rgba(90,20,80,.6))}
.hw-logo span{background:linear-gradient(180deg,#bff7ff,#3fd0c9 50%,#2f7bff);-webkit-background-clip:text;background-clip:text}
.hw-tag{margin:0 0 14px;font-weight:700;color:#ffe8f3}
.hw-leads{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 14px;text-align:left}
.hw-lead{padding:10px 12px;border-radius:16px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.hw-lead b{display:block;font-size:14px}
.hw-lead.nina b{color:#ff8fc4}
.hw-lead.dex b{color:#7fe3ff}
.hw-lead small{display:block;font-size:11.5px;line-height:1.35;color:rgba(255,255,255,.75);margin-top:3px}
.hw-title-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.hw-quality{display:flex;gap:4px;justify-content:center;align-items:center;margin-top:12px;font-size:12px;flex-wrap:wrap}
.hw-quality span{color:rgba(255,255,255,.7);margin-right:4px}
.hw-quality button,.hw-seg button{border:0;padding:6px 11px;border-radius:999px;background:rgba(255,255,255,.08);font-weight:700;font-size:12px}
.hw-quality button.on,.hw-seg button.on{background:#ffd23f;color:#1b1430}
.hw-help{margin:14px 0 0;padding:0 0 0 18px;text-align:left;font-size:13px;line-height:1.45;color:rgba(255,255,255,.85)}
.hw-help li{margin:4px 0}

/* ---- HUD ---- */
/* Above the touch layer, so its chips and the minimap take taps; everything else falls through to the sticks. */
.hw-hud{position:absolute;inset:0;z-index:5;pointer-events:none;text-shadow:0 2px 3px rgba(0,0,0,.65),0 0 1px #000}
.hw-hud button{pointer-events:auto}
.hw-tl{position:absolute;left:14px;top:12px;display:flex;flex-direction:column;align-items:flex-start;gap:6px;max-width:46%}
[data-immersive] .hw-tl{left:max(66px,calc(env(safe-area-inset-left) + 58px))}
.hw-where b{display:block;font-size:17px;font-weight:900;letter-spacing:.01em}
.hw-where small{font-size:12px;font-weight:700;opacity:.85}
.hw-chip{border:0;display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;background:rgba(10,12,22,.5);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);font-size:12px;font-weight:800;text-shadow:none;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.hw-chip.radio{color:#ffd9ec}
.hw-dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#aaa}
.hw-dot.nina{background:#ff4fa3}
.hw-dot.dex{background:#3fd0c9}
.hw-tr{position:absolute;right:14px;top:10px;display:flex;flex-direction:column;align-items:flex-end;gap:3px}
.hw-money{font-size:30px;font-weight:900;color:#7dffa8;letter-spacing:.01em;font-variant-numeric:tabular-nums}
.hw-stars{display:flex;gap:2px;font-size:22px;line-height:1}
.hw-stars span{color:rgba(255,255,255,.18);text-shadow:none;-webkit-text-stroke:1px rgba(0,0,0,.4)}
.hw-stars span.on{color:#fff;text-shadow:0 0 6px rgba(255,255,255,.6)}
.hw-stars.search span.on{animation:hw-flash .6s steps(2) infinite}
@keyframes hw-flash{50%{color:rgba(255,255,255,.25)}}
.hw-weapon{display:flex;align-items:center;gap:8px;margin-top:2px;padding:6px 12px 6px 8px;border-radius:14px;background:rgba(10,12,22,.42);text-shadow:none}
.hw-weapon .ic{font-size:22px}
.hw-weapon b{display:block;font-size:13px}
.hw-weapon small{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;color:#ffd23f}
.hw-bl{position:absolute;left:14px;bottom:14px;display:flex;flex-direction:column;gap:5px;align-items:flex-start}
.hw-mini{border:0;padding:0;width:190px;height:190px;border-radius:50%;overflow:hidden;background:#1c5f7a;box-shadow:0 0 0 3px rgba(10,12,22,.7),0 10px 30px -10px rgba(0,0,0,.7)}
.hw-mini canvas{width:100%;height:100%;display:block}
.hw-bars{display:grid;grid-template-columns:1fr 1fr;gap:4px;width:190px}
.hw-bars i{display:block;height:7px;border-radius:4px;background:#3ddc84;box-shadow:0 0 0 2px rgba(10,12,22,.6)}
.hw-bars i.ar{background:#4b8fd6}
.hw-speed{position:absolute;left:200px;bottom:16px;display:flex;flex-direction:column;align-items:flex-start;min-width:84px}
.hw-speed b{font-size:34px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums}
.hw-speed small{font-size:11px;font-weight:800;opacity:.8}
.hw-speed i{display:block;margin-top:4px;height:4px;width:80px;border-radius:2px;background:#ffd23f}
.hw-speed i.low{background:#ff5a5f}
.hw-bottom{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);width:min(680px,calc(100% - 440px));display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.hw-line{margin:0;font-size:16px;font-weight:700;line-height:1.35}
.hw-line b{color:#ffd23f}
.hw-line b.nina{color:#ff8fc4}
.hw-line b.dex{color:#7fe3ff}
.hw-obj{margin:0;font-size:15px;font-weight:800;padding:6px 14px;border-radius:12px;background:rgba(10,12,22,.45);text-shadow:none}
.hw-prompt{margin:0;font-size:14px;font-weight:800;padding:6px 14px;border-radius:12px;background:rgba(10,12,22,.42);text-shadow:none}
.hw-prompt.dim{opacity:.8;font-weight:700}
.hw-toasts{position:absolute;left:50%;top:12px;transform:translateX(-50%);display:flex;flex-direction:column;gap:5px;align-items:center;max-width:min(520px,60%)}
.hw-toast{padding:7px 14px;border-radius:999px;background:rgba(10,12,22,.62);text-shadow:none;font-size:13.5px;font-weight:800;animation:hw-in .25s ease both;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.hw-toast.good{color:#7dffa8}
.hw-toast.bad{color:#ff8a8a}
.hw-toast.money{color:#ffd23f}
@keyframes hw-in{from{opacity:0;transform:translateY(-6px)}}
.hw-cross{position:absolute;left:50%;top:50%;width:18px;height:18px;transform:translate(-50%,-50%);border-radius:50%;box-shadow:0 0 0 2px rgba(255,255,255,.85),0 0 0 3px rgba(0,0,0,.35)}
.hw-cross::after{content:"";position:absolute;left:50%;top:50%;width:3px;height:3px;transform:translate(-50%,-50%);background:#fff;border-radius:50%}
.hw-banner{position:absolute;left:0;right:0;top:34%;text-align:center;pointer-events:none;animation:hw-banner .5s ease both;text-shadow:0 3px 0 rgba(0,0,0,.5),0 0 22px rgba(0,0,0,.5)}
.hw-banner h3{margin:0;font-size:clamp(32px,7cqw,64px);font-weight:900;font-style:italic;letter-spacing:.02em;text-transform:uppercase}
.hw-banner p{margin:4px 0 0;font-size:17px;font-weight:800}
.hw-banner.pass h3{color:#ffd23f}
.hw-banner.fail h3,.hw-banner.hospitalised h3{color:#ff4a4a}
.hw-banner.arrested h3{color:#5aa0ff}
.hw-banner.mission h3{color:#fff;font-size:clamp(28px,5.5cqw,48px)}
.hw-banner.mission p{color:#ffd9ec}
@keyframes hw-banner{from{opacity:0;transform:scale(1.15)}}

/* ---- touch ---- */
.hw-touchlayer{position:absolute;inset:0;z-index:4}
.hw-stick{position:absolute;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 2px rgba(255,255,255,.25);pointer-events:none}
.hw-stick i{position:absolute;left:35px;top:35px;width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,.4);box-shadow:0 4px 12px rgba(0,0,0,.35)}
.hw-tpad{position:absolute;right:14px;bottom:14px;display:grid;grid-template-columns:repeat(3,auto);grid-template-rows:repeat(3,auto);gap:8px;align-items:end;justify-items:end}
.hw-touchlayer.flip .hw-tpad{right:auto;left:14px}
.hw-tb{border:0;border-radius:50%;width:56px;height:56px;background:rgba(10,12,22,.45);box-shadow:inset 0 0 0 2px rgba(255,255,255,.3);font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.02em;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);touch-action:none}
.hw-tb.on{background:rgba(255,210,63,.5)}
.hw-tb.big{width:86px;height:86px;grid-column:3;grid-row:2 / span 2;font-size:15px}
.hw-tb.mid{width:66px;height:66px;grid-column:2;grid-row:3}
.hw-tb.fire{background:rgba(255,74,74,.45)}
.hw-tb.gas{background:rgba(61,220,132,.42)}
.hw-tb.brake{background:rgba(255,90,95,.42)}
.hw-tb.exit{background:rgba(63,208,201,.42)}

/* ---- phone ---- */
.hw-phone-wrap,.hw-shop-wrap{position:absolute;inset:0;z-index:10;display:grid;place-items:center;padding:12px;background:rgba(6,6,16,.35);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}
.hw-phone{width:min(560px,100%);height:min(720px,100%);display:flex;flex-direction:column;border-radius:34px;padding:10px;background:#0f1020;box-shadow:inset 0 0 0 2px rgba(255,255,255,.12),0 40px 90px -30px rgba(0,0,0,.9);animation:hw-up .25s ease both}
@keyframes hw-up{from{transform:translateY(30px);opacity:0}}
.hw-phone header,.hw-shop header{display:flex;align-items:center;gap:10px;padding:6px 10px 10px}
.hw-phone header span{flex:1;font-size:12px;font-weight:700;opacity:.75;text-align:center}
.hw-x{border:0;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.1);font-weight:900}
.hw-screen{flex:1;min-height:0;border-radius:24px;overflow:hidden;background:linear-gradient(160deg,#1a1236,#0f1a2c);display:flex;flex-direction:column}
.hw-apps{display:flex;justify-content:space-around;padding:8px 2px 2px}
.hw-apps button{border:0;background:none;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;font-weight:800;opacity:.65;padding:4px 6px;border-radius:12px}
.hw-apps button span{font-size:20px}
.hw-apps button.on{opacity:1;background:rgba(255,255,255,.08)}
.hw-map{position:relative;flex:1;min-height:0;display:flex;flex-direction:column}
.hw-map canvas{flex:1;width:100%;min-height:0;display:block;touch-action:none;cursor:crosshair}
.hw-map-tools{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;gap:6px}
.hw-map-tools button{border:0;width:36px;height:36px;border-radius:12px;background:rgba(10,12,22,.75);font-weight:900;font-size:18px}
.hw-legend{margin:0;padding:8px 12px;font-size:11px;font-weight:700;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;background:rgba(0,0,0,.35)}
.hw-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:-6px}
.hw-legend i.y{background:#ffd23f}.hw-legend i.g{background:#3ddc84}.hw-legend i.o{background:#ff6a3d}.hw-legend i.v{background:#c58bff}.hw-legend i.t{background:#3fd0c9}.hw-legend i.p{background:#ff4fa3}
.hw-list{flex:1;min-height:0;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.hw-list h4{margin:8px 2px 0;font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#ffd9ec}
.hw-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:rgba(255,255,255,.06)}
.hw-row .t{flex:1;min-width:0}
.hw-row .t b{display:block;font-size:14px}
.hw-row .t small{display:block;font-size:12px;opacity:.75;line-height:1.35;margin-top:2px}
.hw-row .ic{font-size:22px}
.hw-row.done{opacity:.6}
.hw-row.next{box-shadow:inset 0 0 0 2px #ffd23f}
.hw-row.locked{opacity:.4}
.hw-card{padding:14px;border-radius:18px;background:rgba(255,255,255,.07)}
.hw-card small{display:block;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;opacity:.7}
.hw-card b{display:block;font-size:16px;margin-top:2px}
.hw-card p{margin:6px 0 0;font-size:13px;line-height:1.4;opacity:.85}
.hw-card.now{box-shadow:inset 0 0 0 2px #ffd23f}
.hw-card.lead.nina{background:linear-gradient(135deg,rgba(255,79,163,.22),rgba(255,255,255,.05))}
.hw-card.lead.dex{background:linear-gradient(135deg,rgba(63,208,201,.22),rgba(255,255,255,.05))}
.hw-card.lead.me{box-shadow:inset 0 0 0 2px rgba(255,255,255,.5)}
.hw-card .perk{font-weight:700;color:#ffd23f;opacity:1}
.hw-card .hw-btn{margin-top:10px}
.hw-stats{margin:0;display:grid;gap:2px}
.hw-stats div{display:flex;justify-content:space-between;gap:12px;padding:8px 4px;border-bottom:1px solid rgba(255,255,255,.07);font-size:13.5px}
.hw-stats dt{opacity:.75}
.hw-stats dd{margin:0;font-weight:800;font-variant-numeric:tabular-nums}
.hw-set{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 4px;font-size:13.5px;font-weight:700;flex-wrap:wrap}
.hw-set input[type=range]{flex:1;max-width:220px;accent-color:#ff4fa3}
.hw-set.end{justify-content:flex-start;gap:8px;margin-top:8px}
.hw-seg{display:flex;gap:4px;flex-wrap:wrap}
.hw-shop{width:min(480px,100%);max-height:100%;display:flex;flex-direction:column;border-radius:26px;background:rgba(16,14,34,.92);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),0 30px 80px -30px rgba(0,0,0,.9);animation:hw-up .2s ease both;overflow:hidden}
.hw-shop header span{flex:1}
.hw-shop header b{display:block;font-size:18px}
.hw-shop header small{font-size:13px;font-weight:800;color:#7dffa8}
.hw-swatch{width:30px;height:30px;border-radius:9px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}
.hw-note{margin:0;font-size:13px;line-height:1.4;opacity:.85}
.hw-paints{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
.hw-paints button{border:0;aspect-ratio:1;border-radius:12px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.3)}

/* ---- small screens (phones), sideways or upright ---- */
@container hw (max-width:900px), (max-height:520px){
  .hw-mini{width:118px;height:118px}
  .hw-bars{width:118px}
  .hw-speed{left:130px;bottom:12px}
  .hw-speed b{font-size:26px}
  .hw-money{font-size:22px}
  .hw-stars{font-size:16px}
  .hw-where b{font-size:13px}
  .hw-where small{font-size:11px}
  .hw-weapon{padding:4px 9px 4px 6px}
  .hw-weapon .ic{font-size:17px}
  .hw-weapon b,.hw-weapon small{font-size:11.5px}
  .hw-bottom{width:calc(100% - 300px);bottom:10px}
  .hw-touch .hw-bottom{bottom:auto;top:56px}
  .hw-line{font-size:13px}
  .hw-obj,.hw-prompt{font-size:12.5px;padding:5px 10px}
  .hw-toasts{top:auto;bottom:46%;max-width:70%}
  .hw-long{display:none}
  .hw-leads{grid-template-columns:1fr}
}
@container hw (max-height:420px){
  .hw-mini{width:96px;height:96px}
  .hw-bars{width:96px}
  .hw-speed{left:106px}
  .hw-tb{width:50px;height:50px;font-size:11px}
  .hw-tb.big{width:74px;height:74px}
  .hw-tb.mid{width:58px;height:58px}
  .hw-phone{height:100%;border-radius:24px}
  .hw-title-card{padding:14px}
  .hw-logo{font-size:48px}
  .hw-leads{display:none}
}
@media (prefers-reduced-motion:reduce){.hw *{animation:none!important;transition:none!important}}
`;
