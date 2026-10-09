/**
 * YourGov's look: Liquid Glass over a photoreal country. Every control floats on the view as
 * a translucent, refracting pane (a lens at the rim where the browser can), with a highlight
 * that follows the pointer, capsule buttons and Apple-style segmented controls.
 */
export const css = `
.yg{--g:rgba(24,28,40,.36);--g2:rgba(16,20,30,.58);--line:rgba(255,255,255,.16);--text:#f5f7fb;--muted:rgba(245,247,251,.64);--faint:rgba(245,247,251,.4);
  --accent:#0a84ff;--good:#30d158;--bad:#ff453a;--warn:#ffd60a;--gold:#f5b335;--r:24px;--rs:14px;
  position:absolute;inset:0;overflow:hidden;container-type:size;color:var(--text);background:#0b1220;
  font:13.5px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Inter","Segoe UI",Roboto,system-ui,sans-serif;-webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none}
.yg *{box-sizing:border-box}
.yg :where(button){font:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0}
.yg :where(button:disabled){cursor:not-allowed;opacity:.42}
.yg :focus-visible{outline:2.5px solid var(--accent);outline-offset:2px}
.yg h1,.yg h2,.yg p{margin:0}
.yg .grow{flex:1;min-width:0}
.yg .r{margin-left:auto;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
.yg .muted,.yg-muted{color:var(--muted)}
.yg-faint{color:var(--faint)}
.yg .small{font-size:11.5px}
.yg-center{display:grid;place-items:center}
.yg-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* ---- the 3D view and its labels ---- */
.yg-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none}
.yg-flat{position:absolute;inset:0;background:#3b8fe0}.yg-flat.light{background:#e6e6e6}
.yg-flat canvas{position:absolute;inset:0;width:100%;height:100%}
.yg-vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 90% at 50% 45%,transparent 60%,rgba(4,8,16,.35))}
.yg-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.yg-ml{position:absolute;left:0;top:0;white-space:nowrap;will-change:transform;pointer-events:none;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.75),0 0 10px rgba(0,0,0,.45)}
.yg-ml.state{font-weight:800;font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.92;transition:color .2s,font-size .2s}
.yg-ml.state.on{color:#ffe58a;font-size:12.5px;opacity:1}
.yg-ml.city{display:flex;align-items:center;gap:5px;font-weight:650;font-size:11px;transition:opacity .25s}
.yg-ml.city i{width:6px;height:6px;border-radius:50%;background:#fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.55)}
.yg-ml.city.capital i{width:8px;height:8px;background:#ffd60a;box-shadow:0 0 0 2px rgba(0,0,0,.6),0 0 0 4px rgba(255,214,10,.35)}

/* ---- liquid glass ---- */
.yg-glass{position:relative;isolation:isolate;border-radius:var(--r);
  background:linear-gradient(145deg,rgba(255,255,255,.18),rgba(255,255,255,.05) 38%,rgba(255,255,255,.02) 62%,rgba(255,255,255,.1)),var(--g);
  border:1px solid rgba(255,255,255,.18);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 -1px 0 rgba(255,255,255,.1),inset 0 0 24px rgba(255,255,255,.05),0 18px 50px -18px rgba(0,0,0,.6),0 2px 8px -2px rgba(0,0,0,.35);
  backdrop-filter:blur(16px) saturate(1.9) brightness(1.05);-webkit-backdrop-filter:blur(16px) saturate(1.9) brightness(1.05)}
.yg-glass::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:1;
  background:linear-gradient(155deg,rgba(255,255,255,.8),rgba(255,255,255,.14) 30%,rgba(255,255,255,0) 55%,rgba(255,255,255,.3) 85%,rgba(255,255,255,.55));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.yg-glass::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;
  background:radial-gradient(90% 70% at var(--mx,22%) var(--my,0%),rgba(255,255,255,.22),rgba(255,255,255,0) 60%);transition:background .25s ease}
.yg-refract .yg-glass:not(.yg-capsule):not(.yg-sheet):not(.yg-modal){backdrop-filter:url(#yg-lg) blur(6px) saturate(1.9) brightness(1.05)}
.yg-refract .yg-capsule{backdrop-filter:url(#yg-lg-bar) blur(5px) saturate(1.9) brightness(1.05)}
.yg-capsule{border-radius:999px}
.yg-sheet,.yg-modal{--g:rgba(18,22,32,.5);backdrop-filter:blur(30px) saturate(1.8) brightness(.95);-webkit-backdrop-filter:blur(30px) saturate(1.8) brightness(.95)}

/* ---- buttons and controls ---- */
.yg-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:0 14px;border-radius:999px;font-weight:650;white-space:nowrap;
  border:1px solid rgba(255,255,255,.16);
  background:radial-gradient(120% 90% at var(--mx,50%) var(--my,0%),rgba(255,255,255,.2),rgba(255,255,255,0) 70%),linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.04));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.4),inset 0 -1px 1px rgba(0,0,0,.18),0 4px 14px -8px rgba(0,0,0,.6);
  transition:transform .28s cubic-bezier(.3,1.6,.5,1),background .2s,box-shadow .2s}
.yg-btn:hover:not(:disabled){transform:translateY(-1px) scale(1.02)}
.yg-btn:active:not(:disabled){transform:scale(.96)}
.yg-btn.primary{background:radial-gradient(120% 90% at var(--mx,50%) var(--my,0%),rgba(255,255,255,.35),rgba(255,255,255,0) 70%),linear-gradient(180deg,#3d9bff,#0a6fe0);border-color:rgba(255,255,255,.3);color:#fff}
.yg-btn.bad{background:linear-gradient(180deg,rgba(255,69,58,.85),rgba(200,40,32,.85));color:#fff}
.yg-btn.wide{width:100%}
.yg-btn.big{min-height:46px;font-size:15px}
.yg-btn.small{min-height:30px;padding:0 11px;font-size:12.5px}
.yg-btn.icon{width:40px;min-height:40px;padding:0}
.yg-btn.icon.small{width:32px;min-height:32px}
.yg-btn.icon.tiny{width:22px;min-height:22px;border-radius:50%}
button.yg-glass.yg-btn.icon{border-radius:50%;width:44px;min-height:44px}
.yg-seg{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:rgba(0,0,0,.28);box-shadow:inset 0 1px 2px rgba(0,0,0,.35)}
.yg-seg.wrap{flex-wrap:wrap;border-radius:16px}
.yg-seg button{min-height:30px;padding:0 12px;border-radius:999px;font-weight:650;font-size:12.5px;color:var(--muted);display:inline-flex;align-items:center;gap:5px;transition:background .25s,color .25s,box-shadow .25s}
.yg-seg button:hover{color:var(--text)}
.yg-seg button[aria-checked=true]{background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(235,238,245,.9));color:#11151d;box-shadow:0 2px 8px -2px rgba(0,0,0,.5),inset 0 1px 0 #fff}
.yg-input{width:100%;min-height:38px;padding:8px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.28);color:var(--text);font:inherit;box-shadow:inset 0 1px 3px rgba(0,0,0,.35);user-select:text;-webkit-user-select:text;resize:vertical}
.yg-input:focus{outline:none;border-color:rgba(10,132,255,.8);box-shadow:0 0 0 3px rgba(10,132,255,.3)}
.yg-input.search{margin:8px 0 2px}
select.yg-input option{background:#151a24;color:#fff}
.yg-range{width:100%;accent-color:var(--accent)}
.yg-switch{display:flex;align-items:center;gap:10px;cursor:pointer}
.yg-switch input{position:absolute;opacity:0;pointer-events:none}
.yg-switch i{flex:none;width:44px;height:26px;border-radius:999px;background:rgba(255,255,255,.18);position:relative;transition:background .25s;box-shadow:inset 0 1px 3px rgba(0,0,0,.4)}
.yg-switch i::after{content:"";position:absolute;left:2px;top:2px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.4);transition:transform .3s cubic-bezier(.3,1.5,.5,1)}
.yg-switch input:checked+i{background:var(--good)}
.yg-switch input:checked+i::after{transform:translateX(18px)}
.yg-switch input:focus-visible+i{outline:2.5px solid var(--accent);outline-offset:2px}
.yg-switch small{display:block;color:var(--muted);font-weight:500;font-size:11.5px}

/* ---- top bar ---- */
.yg-top{position:absolute;left:12px;right:12px;top:12px;display:flex;align-items:center;gap:8px;pointer-events:none;z-index:4}
.yg-top>*{pointer-events:auto}
.yg-brand{display:flex;align-items:center;gap:9px;height:44px;padding:0 16px 0 12px;font-weight:750;letter-spacing:.01em}
.yg-stats{display:flex;align-items:center;height:44px;padding:0 8px;gap:2px;min-width:0;overflow:hidden}
.yg-stat{display:flex;align-items:center;gap:5px;padding:0 9px;height:32px;border-radius:999px;white-space:nowrap}
.yg-stat b{font-weight:750;font-variant-numeric:tabular-nums}
.yg-stat small{color:var(--muted);font-size:11px}
.yg-stat svg{color:rgba(245,247,251,.75)}
.yg-modes{height:44px;display:flex;align-items:center;padding:0 4px}

/* ---- the dock and sheets ---- */
.yg-dock{position:absolute;left:12px;top:68px;display:flex;flex-direction:column;gap:3px;padding:6px;border-radius:26px;z-index:3;max-height:calc(100% - 140px);overflow:auto;scrollbar-width:none}
.yg-dock-btn{position:relative;display:grid;place-items:center;width:42px;height:42px;flex:none;border-radius:50%;color:rgba(245,247,251,.85);transition:background .2s,color .2s,transform .25s cubic-bezier(.3,1.6,.5,1)}
.yg-dock-btn:hover:not(:disabled){background:rgba(255,255,255,.12);transform:scale(1.06)}
.yg-dock-btn[aria-pressed=true]{background:linear-gradient(180deg,#fff,#e9edf5);color:#10141c;box-shadow:0 4px 12px -4px rgba(0,0,0,.6)}
.yg-badge{position:absolute;top:6px;right:6px;width:9px;height:9px;border-radius:50%;background:var(--bad);box-shadow:0 0 0 2px rgba(20,24,34,.8)}
.yg-sheet{position:absolute;left:72px;top:68px;bottom:80px;width:min(380px,calc(100% - 84px));display:flex;flex-direction:column;z-index:3;animation:yg-in .32s cubic-bezier(.2,1.2,.4,1) both}
.yg-sheet-head{display:flex;align-items:center;gap:8px;padding:14px 12px 8px 16px}
.yg-sheet-title{flex:1;min-width:0}
.yg-sheet-title h2{font-size:19px;font-weight:750;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.yg-eyebrow{font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.yg-sheet-body{flex:1;min-height:0;overflow:auto;padding:4px 14px 16px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent}
@keyframes yg-in{from{opacity:0;transform:translateX(-14px) scale(.98)}}
.yg-label{margin:14px 4px 6px;font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.yg-group{margin-top:2px}
.yg-group-box{border-radius:var(--rs);background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);overflow:hidden;margin-top:6px}
.yg-group>.yg-label+.yg-group-box{margin-top:0}
.yg-row{display:flex;align-items:center;gap:9px;width:100%;min-height:42px;padding:8px 12px;text-align:left;font-weight:550}
.yg-group-box>.yg-row+.yg-row{box-shadow:inset 0 1px 0 rgba(255,255,255,.07)}
.yg-row.btn{transition:background .15s}
.yg-row.btn:hover{background:rgba(255,255,255,.08)}
.yg-row.on{background:rgba(10,132,255,.28)}
.yg-row.done .grow{color:var(--muted);text-decoration:line-through}
.yg-row.danger{color:#ff6b61}
.yg-sheet-body>.yg-row,.yg-modal-body>.yg-row{border-radius:var(--rs);background:rgba(255,255,255,.06);margin-top:8px}
.yg-sw{display:inline-block;width:12px;height:12px;border-radius:4px;flex:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.3),0 0 0 1px rgba(255,255,255,.15)}
.yg-dot{flex:none;width:9px;height:9px;border-radius:50%;background:var(--muted)}
.yg-dot.good{background:var(--good)}.yg-dot.bad{background:var(--bad)}.yg-dot.warn{background:var(--warn)}.yg-dot.info{background:#64d2ff}
.yg-check{flex:none;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.4)}
.yg-check.on{background:var(--good);box-shadow:none;color:#05210f}
.yg-bar{flex:1;height:7px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden;min-width:30px}
.yg-bar>i{display:block;height:100%;border-radius:999px}
.yg-tag{display:inline-flex;align-items:center;margin-left:6px;padding:1px 8px;border-radius:999px;font-size:10.5px;font-weight:700;background:rgba(255,255,255,.14);color:var(--text);white-space:nowrap}
.yg-tag.good{background:rgba(48,209,88,.25);color:#7dffa0}.yg-tag.bad{background:rgba(255,69,58,.25);color:#ff9d96}.yg-tag.warn{background:rgba(255,214,10,.22);color:#ffe066}.yg-tag.accent{background:rgba(10,132,255,.3);color:#9cc9ff}
.yg-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 9px 2px 6px;border-radius:999px;background:rgba(255,255,255,.1);font-size:11px;font-weight:700}
.yg-chip i{width:9px;height:9px;border-radius:50%;background:var(--c)}
.yg-chips{display:flex;flex-wrap:wrap;gap:6px}
.yg-empty{margin:18px 4px;color:var(--muted)}
.yg-lede{margin:2px 4px 6px;color:var(--muted)}
.yg-note{margin:10px 4px;font-weight:600}.yg-note.warn{color:#ffe066}
.yg-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0 4px}
.yg-tile-stat{padding:9px 10px;border-radius:var(--rs);background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);min-width:0}
.yg-tile-stat span{display:block;font-size:10.5px;color:var(--muted);font-weight:600;white-space:nowrap}
.yg-tile-stat b{display:block;font-size:16px;font-weight:750;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.yg-profile{display:flex;align-items:center;gap:12px;padding:6px 4px}
.yg-profile b{display:block;font-size:16px}
.yg-profile span{display:block}
.yg-cta{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border-radius:18px;text-align:left;margin-top:4px;
  background:linear-gradient(135deg,rgba(10,132,255,.45),rgba(94,92,230,.38));box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 8px 24px -12px rgba(10,132,255,.8);transition:transform .25s cubic-bezier(.3,1.6,.5,1)}
.yg-cta:hover:not(:disabled){transform:translateY(-1px)}
.yg-cta b{display:block;font-size:14px}.yg-cta small{display:block;color:rgba(255,255,255,.75)}
.yg-cta>span:nth-child(2){flex:1}
.yg-cta-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:rgba(255,255,255,.2)}
.yg-optrow{padding:10px 12px}
.yg-group-box>.yg-optrow+.yg-optrow{box-shadow:inset 0 1px 0 rgba(255,255,255,.07)}
.yg-optrow.on{background:rgba(48,209,88,.1)}
.yg-optrow-main{display:flex;align-items:center;gap:8px}
.yg-backline{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.yg-billcard{display:flex;align-items:center;gap:12px;padding:10px 12px;margin-top:4px;border-radius:var(--rs);background:rgba(255,255,255,.07)}
.yg-billcard b{display:block;font-size:14.5px}
.yg-split{display:flex;height:10px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.1);margin:0 2px 8px}
.yg-split i.good{background:var(--good)}.yg-split i.bad{background:var(--bad)}.yg-split i.muted{background:rgba(255,255,255,.45)}
.yg-votes{display:grid;gap:6px}
.yg-vote{display:flex;align-items:center;justify-content:space-between;min-height:44px;padding:0 16px;border-radius:14px;font-weight:700;background:rgba(255,255,255,.1);box-shadow:inset 0 1px 0 rgba(255,255,255,.2);transition:transform .25s cubic-bezier(.3,1.6,.5,1),box-shadow .2s}
.yg-vote.good{background:linear-gradient(180deg,rgba(48,209,88,.6),rgba(30,160,60,.55))}
.yg-vote.bad{background:linear-gradient(180deg,rgba(255,69,58,.6),rgba(200,40,32,.55))}
.yg-vote.chosen{box-shadow:0 0 0 3px #fff,0 8px 20px -8px rgba(0,0,0,.7)}
.yg-vote:hover:not(:disabled){transform:scale(1.015)}
.yg-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px}
.yg-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;aspect-ratio:1;border-radius:16px;background:rgba(255,255,255,.08);box-shadow:inset 0 1px 0 rgba(255,255,255,.15);transition:transform .25s cubic-bezier(.3,1.6,.5,1),background .2s;padding:4px}
.yg-tile:hover:not(:disabled){background:rgba(255,255,255,.16);transform:translateY(-2px)}
.yg-tile[aria-pressed=true]{background:linear-gradient(180deg,rgba(10,132,255,.6),rgba(10,100,220,.55));box-shadow:0 0 0 2px rgba(255,255,255,.7)}
.yg-tile:disabled{opacity:.3}
.yg-tile-ico{font-size:22px;line-height:1}
.yg-tile-name{font-size:9.5px;font-weight:650;text-align:center;line-height:1.1;color:var(--muted);max-width:100%;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.yg-tile[aria-pressed=true] .yg-tile-name{color:#fff}
.yg-evcard{margin-top:10px;padding:12px;border-radius:18px;background:rgba(255,255,255,.07);display:grid;gap:8px}
.yg-evcard b{font-size:15px}
.yg-hemi{display:grid;place-items:center;margin:8px 0 2px}
.yg-partycard{margin-top:8px;padding:10px 12px;border-radius:16px;background:rgba(255,255,255,.07);box-shadow:inset 3px 0 0 var(--c)}
.yg-partycard.mine{background:rgba(255,255,255,.12)}
.yg-partycard-top,.yg-partycard-mid,.yg-partycard-rel{display:flex;align-items:center;gap:8px}
.yg-partycard-mid,.yg-partycard-rel{margin-top:6px;color:var(--muted)}
.yg-news{margin-top:8px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.07);box-shadow:inset 3px 0 0 rgba(255,255,255,.3)}
.yg-news.good{box-shadow:inset 3px 0 0 var(--good)}.yg-news.bad{box-shadow:inset 3px 0 0 var(--bad)}
.yg-news p{font-weight:600;margin-top:2px}

/* ---- charts ---- */
.yg-chart{margin-top:8px;padding:10px 10px 6px;border-radius:16px;background:rgba(0,0,0,.18)}
.yg-legend-row{display:flex;flex-wrap:wrap;gap:4px 10px;margin-bottom:6px}
.yg-legend-item{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);font-weight:600}
.yg-legend-item i{width:10px;height:3px;border-radius:2px}
.yg-legend-item b{color:var(--text);font-variant-numeric:tabular-nums}
.yg-chart-note{text-align:right;font-size:10.5px;color:var(--faint)}
.yg-trend{margin-top:8px;padding:8px 10px 4px;border-radius:14px;background:rgba(0,0,0,.18)}
.yg-trend-head{display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);font-weight:600}
.yg-trend-head b{color:var(--text);font-variant-numeric:tabular-nums}

/* ---- missions, the state pill, tooltips ---- */
.yg-missions{position:absolute;right:12px;top:68px;width:min(280px,34%);padding:6px 6px 8px;border-radius:20px;z-index:2}
.yg-missions-head{display:flex;align-items:center;gap:7px;width:100%;padding:6px 8px;font-weight:700;font-size:12.5px}
.yg-mission{display:flex;align-items:flex-start;gap:8px;padding:5px 8px;font-size:12px;font-weight:550}
.yg-mission .yg-dot{margin-top:4px}
.yg-mission.done .grow{color:var(--muted)}
.yg-statepill{position:absolute;left:50%;top:68px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:36px;padding:0 6px 0 12px;font-weight:700;z-index:2}
.yg-tip{position:absolute;z-index:6;pointer-events:none;display:grid;gap:3px;min-width:180px;padding:9px 12px;border-radius:14px;font-size:12px}
.yg-tip b{font-size:13px}
.yg-tip-row{display:flex;align-items:center;gap:6px}
.yg-tip-row i{width:8px;height:8px;border-radius:50%}
.yg-tip-row b{margin-left:auto;font-size:12px}
.yg-loading{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:10px;padding:12px 18px;border-radius:999px;font-weight:650;z-index:2}
.yg-spin{width:16px;height:16px;border-radius:50%;border:2.5px solid rgba(255,255,255,.25);border-top-color:#fff;animation:yg-spin .8s linear infinite}
@keyframes yg-spin{to{transform:rotate(360deg)}}
.yg-toasts{position:absolute;left:50%;top:68px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;z-index:7;pointer-events:none;width:min(520px,70%)}
.yg-toast{display:flex;align-items:center;gap:9px;padding:9px 16px;border-radius:999px;font-weight:650;animation:yg-drop .38s cubic-bezier(.2,1.4,.4,1) both;max-width:100%}
@keyframes yg-drop{from{opacity:0;transform:translateY(-12px) scale(.96)}}

/* ---- bottom bar ---- */
.yg-bottom{position:absolute;left:12px;right:68px;bottom:12px;display:flex;align-items:center;gap:8px;z-index:4;pointer-events:none}
.yg-bottom>*{pointer-events:auto}
.yg-viewswitch{display:flex;align-items:center;gap:6px;height:48px;padding:0 6px}
.yg-timebar{flex:1;min-width:0;display:flex;align-items:center;gap:10px;height:48px;padding:0 8px 0 14px}
.yg-date{font-weight:750;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:14px}
.yg-timeline{position:relative;flex:1;height:30px;border-radius:999px;background:rgba(0,0,0,.25);box-shadow:inset 0 1px 3px rgba(0,0,0,.35);overflow:hidden;min-width:60px}
.yg-tick{position:absolute;top:9px;bottom:9px;width:1px;background:rgba(255,255,255,.14)}
.yg-tick.year{top:4px;bottom:4px;background:rgba(255,255,255,.5)}
.yg-mark{position:absolute;top:4px;width:22px;height:22px;margin-left:-11px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.88);color:#151a24;box-shadow:0 2px 6px rgba(0,0,0,.45)}
.yg-mark.accent{background:var(--accent);color:#fff}.yg-mark.warn{background:var(--warn)}
.yg-endturn{display:flex;align-items:center;gap:8px;height:48px;padding:0 20px 0 16px;border-radius:999px;font-weight:750;font-size:14px;color:#fff;
  background:radial-gradient(120% 90% at var(--mx,50%) var(--my,0%),rgba(255,255,255,.38),rgba(255,255,255,0) 70%),linear-gradient(180deg,#3d9bff,#0a6fe0);
  border:1px solid rgba(255,255,255,.3);box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 10px 28px -10px rgba(10,132,255,.9);transition:transform .28s cubic-bezier(.3,1.6,.5,1)}
.yg-endturn:hover:not(:disabled){transform:translateY(-1px) scale(1.03)}
.yg-endturn:active:not(:disabled){transform:scale(.95)}
.yg-endturn svg{animation:yg-tip 6s ease-in-out infinite}
@keyframes yg-tip{0%,80%{transform:none}90%{transform:rotate(180deg)}100%{transform:rotate(180deg)}}

/* ---- election night ---- */
.yg-election{position:absolute;right:12px;top:68px;bottom:80px;width:min(340px,48%);padding:16px;display:flex;flex-direction:column;gap:8px;overflow:auto;z-index:3;animation:yg-in .35s ease-out both}
.yg-election h2{font-size:21px;font-weight:780}
.yg-progress{height:6px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden;flex:none}
.yg-progress i{display:block;height:100%;background:linear-gradient(90deg,#30d158,#64d2ff);border-radius:999px}
.yg-results{display:grid;gap:5px}
.yg-result{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:12px;background:rgba(255,255,255,.06);font-weight:650;font-size:12.5px}
.yg-result.mine{background:rgba(255,255,255,.14)}
.yg-result .name{width:26px}
.yg-result .pc{width:46px;text-align:right;font-variant-numeric:tabular-nums}
.yg-result .seats{width:58px;text-align:right;font-variant-numeric:tabular-nums}
.yg-result em{font-style:normal;font-size:10.5px;margin-left:3px}.yg-result em.up{color:#7dffa0}.yg-result em.down{color:#ff9d96}
.yg-winner{padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.08);box-shadow:inset 3px 0 0 var(--c);display:grid}
.yg-winner b{font-size:15px}
.yg-winner.mine{background:linear-gradient(135deg,rgba(255,214,10,.25),rgba(255,255,255,.08))}

/* ---- modals (law studio, game over) ---- */
.yg-modal-back{position:absolute;inset:0;z-index:10;display:grid;place-items:center;padding:16px;background:rgba(4,8,16,.35);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);animation:yg-fade .25s ease both}
@keyframes yg-fade{from{opacity:0}}
.yg-modal{width:min(820px,100%);max-height:100%;display:flex;flex-direction:column;animation:yg-pop .35s cubic-bezier(.2,1.3,.4,1) both}
.yg-modal.small{width:min(440px,100%)}
@keyframes yg-pop{from{opacity:0;transform:scale(.95) translateY(8px)}}
.yg-modal-head{display:flex;align-items:center;gap:10px;padding:16px 16px 8px 20px}
.yg-modal-head>div{flex:1}
.yg-modal-head h2{font-size:21px;font-weight:780}
.yg-modal-body{flex:1;min-height:0;overflow:auto;padding:4px 20px 12px}
.yg-modal-foot{display:flex;align-items:center;gap:8px;padding:12px 16px 16px 20px;box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
.yg-modal-foot>p{flex:1;font-size:12px}
.yg-err{color:#ff8a80;font-weight:650}
.yg-studio{display:grid;grid-template-columns:1fr 1.25fr;gap:18px}
.yg-col{display:grid;gap:12px;align-content:start;min-width:0}
.yg-field{display:grid;gap:6px}
.yg-field>span{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.yg-opt{border-radius:16px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);padding:8px}
.yg-opt.open{background:rgba(255,255,255,.1)}
.yg-opt-head{display:flex;align-items:center;gap:6px}
.yg-opt-head .yg-input{min-height:34px}
.yg-force{display:inline-flex;align-items:center;padding:0 10px;min-height:30px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap;cursor:pointer;background:rgba(255,255,255,.1);color:var(--muted)}
.yg-force input{position:absolute;opacity:0;pointer-events:none}
.yg-force.on{background:rgba(48,209,88,.3);color:#b4ffc8}
.yg-force:focus-within{outline:2px solid var(--accent)}
.yg-opt-body{display:grid;grid-template-columns:132px 1fr;gap:12px;margin-top:8px;align-items:start}
.yg-pad{width:132px;height:132px;touch-action:none;cursor:crosshair;border-radius:12px}
.yg-fx{display:grid;gap:4px}
.yg-fx-row{display:grid;gap:0}
.yg-fx-row span{display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);font-weight:600}
.yg-fx-row b{color:var(--text);font-variant-numeric:tabular-nums}
.yg-fx-row b.up{color:#7dffa0}.yg-fx-row b.down{color:#ff9d96}
.yg-fx-row input{accent-color:var(--accent);width:100%}
.yg-backers{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:6px;font-size:11px;color:var(--muted)}

/* ---- title ---- */
.yg-title{position:absolute;inset:0;display:grid;place-items:center;padding:16px}
.yg-title-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(4,8,16,.55),rgba(4,8,16,.1) 60%),linear-gradient(0deg,rgba(4,8,16,.45),transparent 40%);pointer-events:none}
.yg-title-card{position:relative;width:min(560px,100%);max-height:100%;overflow:auto;padding:22px;border-radius:30px;animation:yg-pop .5s cubic-bezier(.2,1.3,.4,1) both;--g:rgba(18,22,32,.42)}
.yg-title-head{display:flex;align-items:center;gap:14px}
.yg-title-head h1{font-size:34px;font-weight:800;letter-spacing:-.025em;line-height:1}
.yg-title-head p{color:var(--muted);margin-top:4px;font-weight:550}
.yg-parties{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.yg-partypick{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:9px;align-items:center;text-align:left;padding:9px 11px;border-radius:16px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);transition:transform .25s cubic-bezier(.3,1.6,.5,1),background .2s,box-shadow .2s}
.yg-partypick i{grid-row:span 2;width:16px;height:16px;border-radius:50%;background:var(--c);box-shadow:0 0 0 2px rgba(0,0,0,.25)}
.yg-partypick small{color:var(--muted);font-size:11px}
.yg-partypick:hover{transform:translateY(-1px);background:rgba(255,255,255,.12)}
.yg-partypick.on{background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 2px var(--c),0 8px 22px -12px var(--c)}
.yg-title-blurb{margin:12px 2px 14px}

/* ---- small stages ---- */
@container (max-width:980px){.yg-stat small{display:none}.yg-stat.opt2{display:none}}
@container (max-width:860px){.yg-stat.opt{display:none}.yg-brand-name{display:none}.yg-missions{display:none}}
@container (max-width:720px){
  .yg-modes{position:absolute;right:0;top:52px}
  .yg-sheet{left:64px;width:calc(100% - 76px)}
  .yg-dock{padding:4px}.yg-dock-btn{width:38px;height:38px}
  .yg-studio{grid-template-columns:1fr}
  .yg-election{left:12px;width:auto}
  .yg-endturn span{display:none}.yg-endturn{padding:0 14px}
}
@container (max-height:520px){.yg-dock{gap:0;padding:4px}.yg-dock-btn{width:36px;height:36px}.yg-sheet{top:62px;bottom:70px}.yg-bottom{bottom:8px}.yg-viewswitch,.yg-timebar,.yg-endturn{height:42px}}
@media (prefers-reduced-motion:reduce){.yg *,.yg *::before,.yg *::after{animation-duration:0s!important;transition:none!important}}
`;
