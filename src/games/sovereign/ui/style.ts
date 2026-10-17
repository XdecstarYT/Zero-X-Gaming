/** Sovereign's interface: dark glass over the world map, phone first (side panels on big screens). */
export const css = `
.sv{position:absolute;inset:0;overflow:hidden;container:sv/size;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#eef1f7;-webkit-tap-highlight-color:transparent;background:#0d2440;
  --glass:rgba(16,20,30,.78);--glass2:rgba(26,32,46,.86);--line:rgba(255,255,255,.1);--ink:#eef1f7;--ink2:#a9b1c3;--ink3:#7a8399;--gold:#ffd166;--good:#3ddc84;--bad:#ff5f5f;--warn:#ffb347;--blue:#5aa2ff;--r:16px}
.sv *{box-sizing:border-box}
.sv :where(button){font:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0}
.sv :where(input,select){font:inherit;color:inherit}
.sv canvas.sv-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none}
.sv .num{font-variant-numeric:tabular-nums}
.sv .muted{color:var(--ink2)}
.sv .dim{color:var(--ink3)}
.sv .good{color:var(--good)}
.sv .bad{color:var(--bad)}
.sv .warn{color:var(--warn)}
.sv :focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.sv-glass{background:linear-gradient(160deg,rgba(40,48,66,.82),rgba(14,18,28,.86));border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 18px 40px -18px rgba(0,0,0,.7);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);border-radius:var(--r)}

/* ---- buttons ---- */
.sv-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:0 14px;border-radius:12px;font-weight:650;font-size:13.5px;white-space:nowrap;background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.06));border:1px solid rgba(255,255,255,.14)!important;transition:transform .12s ease,background .12s}
.sv-btn:hover:not(:disabled){background:linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.1))}
.sv-btn:active:not(:disabled){transform:scale(.96)}
.sv-btn:disabled{opacity:.42;cursor:not-allowed}
.sv-btn.gold{background:linear-gradient(180deg,#ffd978,#f0a92b);color:#1b1404;border-color:rgba(255,255,255,.3)!important}
.sv-btn.red{background:linear-gradient(180deg,#ff6b6b,#d43a3a);color:#fff}
.sv-btn.green{background:linear-gradient(180deg,#45d98d,#1f9e5c);color:#062012}
.sv-btn.blue{background:linear-gradient(180deg,#6aaeff,#2f74e0);color:#fff}
.sv-btn.small{min-height:30px;padding:0 10px;font-size:12.5px;border-radius:10px}
.sv-btn.tiny{min-height:26px;padding:0 8px;font-size:12px;border-radius:9px}
.sv-btn.icon{width:38px;padding:0}
.sv-btn.on{background:linear-gradient(180deg,#ffd978,#f0a92b);color:#1b1404}
.sv-btn.wide{width:100%}

/* ---- top bar ---- */
.sv-top{position:absolute;left:8px;right:8px;top:8px;display:flex;align-items:center;gap:6px;z-index:5;pointer-events:none}
@media (pointer: coarse){.sv-top{left:58px}}
@container sv (max-width: 640px){.sv-top{flex-wrap:wrap}.sv-nation b{display:none}.sv-nation{padding:8px}.sv-toasts{top:116px!important}.sv-stats{order:3;flex:1 1 100%}.sv-clock{margin-left:auto}.sv-speed{min-width:26px;height:28px;font-size:11px}.sv-ticker,.sv-inbox,.sv-target{top:112px!important}}
.sv-top>*{pointer-events:auto}
.sv-nation{display:flex;align-items:center;gap:8px;padding:6px 10px 6px 8px;min-width:0}
.sv-swatch{width:18px;height:18px;border-radius:6px;flex:none;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.5)}
.sv-nation b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:22vw}
.sv-stats{display:flex;align-items:center;gap:2px;padding:4px;overflow-x:auto;scrollbar-width:none;min-width:0;flex:1 1 auto}
.sv-stats::-webkit-scrollbar{display:none}
.sv-stat{display:flex;flex-direction:column;align-items:flex-start;padding:2px 8px;border-radius:10px;line-height:1.15;flex:none}
.sv-stat small{font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em}
.sv-stat span{font-size:13.5px;font-weight:700}
.sv-stat i{font-style:normal;font-size:11px}
.sv-clock{display:flex;align-items:center;gap:3px;padding:4px;flex:none}
.sv-clock .date{font-size:12.5px;font-weight:700;padding:0 6px;white-space:nowrap}
.sv-speed{min-width:30px;height:30px;border-radius:9px;font-weight:800;font-size:12px;color:var(--ink2)}
.sv-speed.on{background:var(--gold);color:#1b1404}

/* ---- the dock (tabs) ---- */
.sv-dock{position:absolute;left:50%;bottom:calc(8px + env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;gap:2px;padding:5px;z-index:6}
.sv-tab{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:60px;height:46px;border-radius:12px;font-size:10px;font-weight:650;color:var(--ink2);overflow:hidden}
.sv-tab span{font-size:18px;line-height:1}
.sv-tab.on{background:rgba(255,209,102,.18);color:var(--gold)}
.sv-tab .badge{position:absolute;top:2px;right:6px;font-style:normal;min-width:16px;height:16px;border-radius:8px;background:var(--bad);color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 4px}

/* ---- panels: bottom sheets on phones, a side panel on big screens ---- */
.sv-sheet{position:absolute;left:8px;right:8px;bottom:calc(68px + env(safe-area-inset-bottom));max-height:min(62%,560px);display:flex;flex-direction:column;z-index:7;animation:sv-up .2s ease}
@keyframes sv-up{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}
.sv-sheet-head{display:flex;align-items:center;gap:8px;padding:12px 12px 8px 14px;border-bottom:1px solid var(--line)}
.sv-sheet-head h2{margin:0;font-size:16px;font-weight:800;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sv-sheet-body{overflow:auto;padding:10px 12px 14px;overscroll-behavior:contain}
.sv-x{width:32px;height:32px;border-radius:10px;font-size:18px;color:var(--ink2);flex:none}
.sv-x:hover{background:rgba(255,255,255,.08)}
.sv-seg{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;padding:2px 0 8px}
.sv-seg::-webkit-scrollbar{display:none}
@container sv (min-width: 900px){
  .sv-sheet{left:auto;right:10px;top:64px;bottom:10px;width:400px;max-height:none}
  .sv-dock{left:10px;top:64px;bottom:auto;transform:none;flex-direction:column}
  .sv-unitbar{left:80px!important;transform:none!important}
  .sv-card{left:80px!important;right:auto!important;width:400px;bottom:10px!important;max-height:calc(100% - 80px)!important}
}
@container sv (max-height: 480px){
  .sv-sheet{max-height:calc(100% - 120px)}
  .sv-card{max-height:calc(100% - 120px)!important}
}

/* ---- rows and bits ---- */
.sv-h3{margin:14px 0 6px;font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink3);font-weight:750}
.sv-h3:first-child{margin-top:2px}
.sv-row{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.045);margin-bottom:5px;min-height:42px}
.sv-row.click{cursor:pointer}
.sv-row.click:hover{background:rgba(255,255,255,.09)}
.sv-row .grow{flex:1;min-width:0}
.sv-row .grow b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sv-row .grow small{display:block;font-size:11.5px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sv-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px}
.sv-kv>div{padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.045)}
.sv-kv small{display:block;font-size:10.5px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em}
.sv-kv b{font-size:15px}
.sv-bar{height:7px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden}
.sv-bar>span{display:block;height:100%;border-radius:4px;background:var(--good)}
.sv-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.sv-icon{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;background:rgba(255,255,255,.07);flex:none}
.sv-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;background:rgba(255,255,255,.08)}
.sv-pill.war{background:rgba(255,95,95,.2);color:#ff9a9a}
.sv-pill.ally{background:rgba(90,162,255,.2);color:#9cc6ff}
.sv-pill.pact{background:rgba(61,220,132,.16);color:#8ef0b9}
.sv-range{width:100%;accent-color:var(--gold)}
.sv-search{width:100%;height:38px;border-radius:12px;border:1px solid var(--line);background:rgba(0,0,0,.25);padding:0 12px;margin-bottom:8px}
.sv-note{font-size:12px;color:var(--ink2);line-height:1.45;margin:6px 0}

/* ---- city / nation card ---- */
.sv-card{position:absolute;left:8px;right:8px;bottom:calc(68px + env(safe-area-inset-bottom));max-height:min(60%,560px);display:flex;flex-direction:column;z-index:8;animation:sv-up .18s ease}
.sv-build{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
.sv-bcell{display:flex;align-items:center;gap:8px;padding:8px;border-radius:12px;background:rgba(255,255,255,.05);text-align:left;min-height:52px}
.sv-bcell:hover:not(:disabled){background:rgba(255,255,255,.1)}
.sv-bcell:disabled{opacity:.45}
.sv-bcell b{font-size:12.5px;display:block}
.sv-bcell small{font-size:11px;color:var(--ink2);display:block}
.sv-lv{margin-left:auto;font-size:11px;font-weight:800;color:var(--gold)}

/* ---- unit bar ---- */
.sv-unitbar{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(68px + env(safe-area-inset-bottom));z-index:7;display:flex;flex-direction:column;gap:6px;padding:8px 10px;width:min(560px,calc(100% - 16px))}
.sv-units{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}
.sv-units::-webkit-scrollbar{display:none}
.sv-chip{display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:10px;background:rgba(255,255,255,.08);font-size:12.5px;font-weight:700;flex:none}

/* ---- toasts, inbox ---- */
.sv-toasts{position:absolute;top:62px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;z-index:20;pointer-events:none;width:min(440px,calc(100% - 20px))}
.sv-toast{padding:9px 14px;border-radius:12px;font-size:13px;font-weight:600;animation:sv-up .2s ease}
.sv-toast.good{border-color:rgba(61,220,132,.5)}
.sv-toast.bad{border-color:rgba(255,95,95,.55)}
.sv-inbox{position:absolute;right:8px;top:60px;z-index:9;width:min(330px,calc(100% - 16px));padding:12px}
.sv-ticker{position:absolute;left:8px;top:58px;max-width:min(420px,calc(100% - 16px));z-index:4;padding:6px 10px;font-size:12px;border-radius:12px;pointer-events:none}
@container sv (min-width: 900px){.sv-ticker{left:80px}}
.sv-target{position:absolute;top:60px;left:50%;transform:translateX(-50%);z-index:9;padding:8px 12px;display:flex;align-items:center;gap:10px;font-weight:700;font-size:13px}

/* ---- title and picker ---- */
.sv-title{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;z-index:10;background:radial-gradient(120% 90% at 50% 40%,rgba(5,10,20,.15),rgba(5,10,20,.75))}
.sv-title-card{width:min(520px,100%);padding:22px;text-align:center;max-height:100%;overflow:auto}
.sv-logo{font-size:clamp(34px,9cqw,60px);font-weight:900;letter-spacing:.14em;margin:0;background:linear-gradient(180deg,#fff2c4,#ffc44d 55%,#d98c12);-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1}
.sv-sub{margin:8px 0 16px;color:var(--ink2);font-size:14px}
.sv-title-actions{display:flex;flex-direction:column;gap:8px}
.sv-pick{position:absolute;left:8px;top:8px;bottom:8px;width:min(360px,calc(100% - 16px));display:flex;flex-direction:column;z-index:10}
@container sv (max-width: 700px){.sv-pick{top:auto;height:58%;right:8px;width:auto}}
.sv-pick-list{overflow:auto;padding:0 10px 10px;flex:1}
.sv-over{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:16px}
.sv-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:10;color:var(--ink2)}
.sv-spin{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.15);border-top-color:var(--gold);animation:sv-spin 1s linear infinite}
@keyframes sv-spin{to{transform:rotate(360deg)}}
.sv-attrib{position:absolute;right:8px;bottom:4px;font-size:10px;color:rgba(255,255,255,.55);z-index:3;pointer-events:none}
@container sv (max-width: 899px){.sv-attrib{bottom:calc(60px + env(safe-area-inset-bottom))}}
`;
