/** Groundwork's interface: dark liquid glass over the site with a hi-vis orange accent, phone first (bottom sheets), side panels on big screens. */
export const css = `
.gw{position:absolute;inset:0;overflow:hidden;container:gw/size;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#f3f2ef;-webkit-tap-highlight-color:transparent;background:#a9b9c4;
  --ink:#f3f2ef;--ink2:#bdb9b1;--ink3:#8a867e;--line:rgba(255,255,255,.1);--orange:#ff8a1f;--orange2:#e0660a;--gold:#ffcf5a;--bad:#ff6a5f;--good:#3fcf7f;--r:18px}
.gw *{box-sizing:border-box}
.gw :where(button){font:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0}
.gw :where(input){font:inherit;color:inherit}
.gw canvas.gw-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none}
.gw .num{font-variant-numeric:tabular-nums}
.gw .muted{color:var(--ink2)}
.gw .dim{color:var(--ink3)}
.gw .good{color:var(--good)}
.gw .bad{color:var(--bad)}
.gw .gold{color:var(--gold)}
.gw :focus-visible{outline:2px solid var(--orange);outline-offset:2px}
.gw-glass{position:relative;isolation:isolate;background:linear-gradient(165deg,rgba(40,38,34,.8),rgba(16,15,13,.88));border:1px solid rgba(255,255,255,.13);box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 18px 44px -18px rgba(0,0,0,.65);backdrop-filter:blur(16px) saturate(1.4);-webkit-backdrop-filter:blur(16px) saturate(1.4);border-radius:var(--r)}
.gw-glass::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;background:radial-gradient(80% 60% at var(--mx,20%) var(--my,0%),rgba(255,255,255,.13),rgba(255,255,255,0) 60%)}
.gw-refract .gw-glass:not(.gw-dock):not(.gw-bar){backdrop-filter:url(#gw-lg) blur(10px) saturate(1.4)}
.gw-refract .gw-dock,.gw-refract .gw-bar{backdrop-filter:url(#gw-lg-bar) blur(9px) saturate(1.4)}

/* buttons */
.gw-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:38px;padding:0 15px;border-radius:999px;font-weight:650;font-size:14px;white-space:nowrap;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14)!important;transition:transform .12s ease,background .12s}
.gw-btn:hover:not(:disabled){background:rgba(255,255,255,.17)}
.gw-btn:active:not(:disabled){transform:scale(.96)}
.gw-btn:disabled{opacity:.4;cursor:not-allowed}
.gw-btn.white{background:#f6f5f2;color:#151412}
.gw-btn.white:hover:not(:disabled){background:#fff}
.gw-btn.orange{background:linear-gradient(180deg,#ffa24a,#f07512);color:#2a1300}
.gw-btn.red{background:rgba(255,106,95,.18);color:#ffb3ad}
.gw-btn.small{min-height:32px;padding:0 12px;font-size:13px}
.gw-btn.wide{width:100%}
.gw-btn.icon{width:38px;padding:0;font-size:17px}
.gw-chip{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 12px;border-radius:12px;font-size:13px;font-weight:600;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1)!important;color:var(--ink2);white-space:nowrap;flex:none}
.gw-chip.on{background:#f6f5f2;color:#151412;border-color:#fff!important}
.gw-chip:disabled{opacity:.38}
.gw-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.gw-scroll{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
.gw-scroll::-webkit-scrollbar{display:none}

/* top bar */
.gw-top{position:absolute;left:8px;right:8px;top:calc(8px + env(safe-area-inset-top));display:flex;align-items:flex-start;gap:6px;z-index:5;pointer-events:none}
.gw-top>*{pointer-events:auto}
@media (pointer: coarse){.gw-top{left:58px}}
.gw-bar{display:flex;align-items:center;gap:2px;padding:4px;min-width:0}
.gw-site{display:flex;flex-direction:column;padding:2px 10px 2px 8px;line-height:1.1;min-width:0;text-align:left}
.gw-site b{font-size:14px;white-space:nowrap}
.gw-site small{font-size:10.5px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px}
.gw-stats{flex:1 1 auto;overflow-x:auto;scrollbar-width:none}
.gw-stats::-webkit-scrollbar{display:none}
.gw-stat{display:flex;flex-direction:column;padding:2px 9px;line-height:1.15;flex:none}
.gw-stat small{font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em}
.gw-stat span{font-size:14px;font-weight:700}
.gw-tools{flex:none}
@container gw (max-width: 640px){.gw-top{flex-wrap:wrap}.gw-stats{order:3;flex:1 1 100%}.gw-tools{margin-left:auto}}

/* the dock */
.gw-dock{position:absolute;left:50%;bottom:calc(8px + env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;gap:2px;padding:5px;z-index:6;max-width:calc(100% - 16px);overflow-x:auto;scrollbar-width:none}
.gw-dock::-webkit-scrollbar{display:none}
.gw-tool{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:56px;height:50px;padding:0 4px;border-radius:13px;font-size:10.5px;font-weight:650;color:var(--ink2);flex:none}
.gw-tool span{font-size:19px;line-height:1}
.gw-tool.on{background:#f6f5f2;color:#151412}

/* options above the dock */
.gw-opts{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(72px + env(safe-area-inset-bottom));width:min(600px,calc(100% - 16px));padding:10px 12px;z-index:6;display:flex;flex-direction:column;gap:8px}
.gw-opts h4{margin:0;font-size:11.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.08em}
.gw-hint{font-size:12.5px;color:var(--ink2);line-height:1.35}
.gw-hint b{color:var(--ink)}
.gw-hint.bad{color:#ffb3ad}
.gw-mat{display:flex;flex-direction:column;align-items:center;gap:3px;width:66px;padding:5px 2px;border-radius:12px;font-size:10.5px;font-weight:600;color:var(--ink2);border:1.5px solid transparent!important;flex:none;line-height:1.1;text-align:center}
.gw-mat i{display:block;width:44px;height:30px;border-radius:7px;box-shadow:inset 0 -3px 0 rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.25)}
.gw-mat.on{border-color:#f6f5f2!important;color:var(--ink);background:rgba(255,255,255,.07)}
.gw-sw{width:30px;height:30px;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(0,0,0,.25);flex:none}
.gw-sw.on{box-shadow:0 0 0 2px #151412,0 0 0 4px #f6f5f2}
.gw-step{display:flex;align-items:center;gap:8px;font-size:13px}
.gw-step button{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.1);font-size:18px;font-weight:700}
.gw-step b{min-width:74px;text-align:center}
.gw-quote{display:flex;align-items:center;gap:10px;justify-content:space-between;font-size:13px;flex-wrap:wrap}
.gw-quote b{font-size:16px}

/* side buttons: lift the work plane, focus */
.gw-side{position:absolute;right:8px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:6px;z-index:5;padding:5px}
.gw-side button{width:40px;height:40px;border-radius:12px;font-size:16px;font-weight:700;color:var(--ink2)}
.gw-side button:hover{background:rgba(255,255,255,.1)}
@container gw (max-width: 640px){.gw-side{top:calc(124px + env(safe-area-inset-top));transform:none;flex-direction:row;padding:3px}.gw-side button{width:36px;height:36px}.gw-sw{width:27px;height:27px}.gw-mat{width:60px}.gw-mat i{width:40px;height:26px}}

/* panels */
.gw-panel{position:absolute;left:8px;right:8px;bottom:calc(72px + env(safe-area-inset-bottom));max-height:min(66%,660px);display:flex;flex-direction:column;z-index:7;overflow:hidden}
@container gw (min-width: 820px){.gw-panel{left:auto;right:12px;top:70px;bottom:84px;width:400px;max-height:none}}
.gw-panel.center{left:50%!important;right:auto!important;top:50%!important;bottom:auto!important;transform:translate(-50%,-50%);width:min(560px,calc(100% - 16px))!important;max-height:calc(100% - 24px)!important}
.gw-panel-h{flex:none;display:flex;align-items:center;gap:10px;padding:14px 14px 8px}
.gw-panel-h .ic{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;background:rgba(255,255,255,.95);flex:none;color:#151412}
.gw-panel-h h3{margin:0;font-size:17px;line-height:1.15}
.gw-panel-h p{margin:2px 0 0;font-size:12px;color:var(--ink3)}
.gw-panel-h .x{margin-left:auto;width:32px;height:32px;border-radius:10px;font-size:18px;color:var(--ink2);flex:none}
.gw-body{overflow-y:auto;padding:4px 14px 14px;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain}
.gw-sec h5{margin:0 0 6px;font-size:11.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.07em}
.gw-sec p{margin:0 0 6px;font-size:13px;line-height:1.45;color:var(--ink2)}
.gw-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:6px}
.gw-tile{padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.07)}
.gw-tile b{display:block;font-size:17px;line-height:1.1}
.gw-tile small{font-size:11px;color:var(--ink3)}
.gw-kv{display:grid;grid-template-columns:1fr auto;gap:4px 12px;font-size:13px}
.gw-kv span:nth-child(odd){color:var(--ink2)}
.gw-check{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.05);font-size:13px;line-height:1.3}
.gw-check .ok{flex:none;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;background:rgba(255,255,255,.1);color:var(--ink3)}
.gw-check.yes .ok{background:var(--good);color:#04220f}
.gw-check small{display:block;color:var(--ink3);font-size:11.5px;margin-top:1px}
.gw-check .bar{height:5px;border-radius:5px;background:rgba(255,255,255,.1);margin-top:5px;overflow:hidden}
.gw-check .bar i{display:block;height:100%;background:var(--orange)}
.gw-note{padding:9px 11px;border-radius:12px;font-size:12.5px;line-height:1.4;background:rgba(255,255,255,.06)}
.gw-note.no{background:rgba(255,106,95,.12);color:#ffc3be}
.gw-note.yes{background:rgba(63,207,127,.12);color:#bff0d3}
.gw-actions{display:flex;gap:8px;align-items:center}
.gw-actions .grow{flex:1}
.gw-stars{color:var(--gold);letter-spacing:2px;font-size:24px}
.gw-job{display:flex;gap:12px;align-items:center;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)!important;text-align:left;width:100%}
.gw-job:disabled{opacity:.42}
.gw-job .ic{font-size:26px;flex:none}
.gw-job b{display:block;font-size:14px}
.gw-job small{display:block;font-size:11.5px;color:var(--ink3);line-height:1.3}
.gw-job .st{margin-left:auto;color:var(--gold);font-size:13px;flex:none;letter-spacing:1px}
.gw-log h4{margin:0 0 2px;font-size:15px}
.gw-log ul{margin:6px 0 0;padding-left:18px;font-size:13px;line-height:1.45;color:var(--ink2)}
.gw-keys{display:grid;grid-template-columns:auto 1fr;gap:5px 12px;font-size:12.5px;color:var(--ink2)}
.gw-keys kbd{font:inherit;font-weight:700;color:var(--ink);background:rgba(255,255,255,.1);border-radius:6px;padding:1px 6px;white-space:nowrap}

/* toasts */
.gw-toasts{position:absolute;left:8px;top:calc(64px + env(safe-area-inset-top));display:flex;flex-direction:column;gap:6px;z-index:8;width:min(380px,calc(100% - 16px));pointer-events:none}
@container gw (max-width: 640px){.gw-toasts{top:calc(112px + env(safe-area-inset-top))}}
.gw-toast{pointer-events:auto;padding:10px 12px;font-size:13px;line-height:1.35;border-left:4px solid var(--ink3)!important;animation:gwIn .25s ease}
.gw-toast.good{border-left-color:var(--good)!important}
.gw-toast.bad{border-left-color:var(--bad)!important}
.gw-toast.tip{border-left-color:var(--orange)!important}
@keyframes gwIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}

/* the title */
.gw-title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:24px 20px calc(32px + env(safe-area-inset-bottom));z-index:9;background:linear-gradient(180deg,rgba(14,12,10,0) 32%,rgba(14,12,10,.76) 100%)}
.gw-logo{font-size:clamp(46px,11cqw,104px);font-weight:900;letter-spacing:.04em;line-height:.9;margin:6px 0 0;color:#fff;text-transform:uppercase;filter:drop-shadow(0 6px 24px rgba(0,0,0,.45))}
.gw-logo span{background:linear-gradient(120deg,#ffb35c,#ff7a1a);-webkit-background-clip:text;background-clip:text;color:transparent}
.gw-tag{margin:10px 0 18px;font-size:15px;color:#efe9e1;text-align:center;max-width:440px;text-shadow:0 2px 8px rgba(0,0,0,.5);line-height:1.4}
.gw-menu{display:flex;flex-direction:column;gap:8px;width:min(330px,100%)}
.gw-title-panel{position:absolute;inset:0;z-index:11;background:rgba(10,9,8,.35)}
.gw-loading{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:14px 18px;z-index:10;text-align:center;font-size:13px;min-width:220px}
.gw-prog{height:6px;border-radius:9px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:8px}
.gw-prog i{display:block;height:100%;width:40%;background:var(--orange);animation:gwLoad 1.2s ease-in-out infinite alternate}
@keyframes gwLoad{from{transform:translateX(-60%)}to{transform:translateX(210%)}}
.gw-confirm{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(72px + env(safe-area-inset-bottom));width:min(480px,calc(100% - 16px));padding:12px 14px;z-index:7;display:flex;flex-direction:column;gap:8px}
.gw-tape{position:absolute;left:50%;top:calc(70px + env(safe-area-inset-top));transform:translateX(-50%);padding:6px 14px;z-index:6;font-size:15px;font-weight:800;background:#ffd23a!important;color:#1d1600;border-radius:999px;box-shadow:0 8px 20px -8px rgba(0,0,0,.5)}

/* the office */
.gw-office{position:absolute;inset:0;z-index:9;display:flex;align-items:stretch;justify-content:center;padding:calc(10px + env(safe-area-inset-top)) 10px calc(10px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(14,12,10,.2),rgba(14,12,10,.55))}
.gw-desk{width:min(720px,100%);display:flex;flex-direction:column;overflow:hidden}
.gw-desk-h{display:flex;align-items:center;gap:10px;padding:12px 14px 6px}
.gw-desk-h h2{margin:0;font-size:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gw-desk-h p{margin:2px 0 0;font-size:12px}
.gw-ledger{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:4px 14px 8px}
.gw-ledger div{padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.06)}
.gw-ledger small{display:block;font-size:10.5px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em}
.gw-ledger b{font-size:18px}
.gw-tabs{display:flex;gap:16px;padding:0 14px;border-bottom:1px solid var(--line);overflow-x:auto;scrollbar-width:none;flex:none}
.gw-tabs::-webkit-scrollbar{display:none}
.gw-tabs button{flex:none;padding:8px 0;font-size:13.5px;font-weight:650;color:var(--ink3);border-bottom:2px solid transparent!important;white-space:nowrap}
.gw-tabs button.on{color:var(--ink);border-bottom-color:var(--orange)!important}
.gw-count{font-style:normal;margin-left:5px;display:inline-flex;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--orange);color:#2a1300;font-size:10.5px;font-weight:800;align-items:center;justify-content:center}
.gw-desk-body{flex:1;overflow-y:auto;padding:12px 14px 16px;display:flex;flex-direction:column;gap:14px;overscroll-behavior:contain}
.gw-found{display:flex;flex-direction:column;gap:12px;padding:0 0 16px}
.gw-found>p,.gw-found>label,.gw-found>button{margin:0 14px}
.gw-found>button{width:auto}
.gw-field{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--ink2)}
.gw-input{min-height:40px;padding:0 12px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);font-size:15px;color:var(--ink)}
.gw-list{display:flex;flex-direction:column;gap:8px}
.gw-card{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}
.gw-card p{margin:0;font-size:12.5px;line-height:1.4;color:var(--ink2)}
.gw-card-h{display:flex;gap:10px;align-items:center}
.gw-card-h .ic{font-size:24px;flex:none}
.gw-card-h b{display:block;font-size:14.5px}
.gw-card-h small{display:block;font-size:11.5px;color:var(--ink3)}
.gw-person{display:flex;gap:10px;align-items:center;padding:9px 11px;border-radius:12px;background:rgba(255,255,255,.05)}
.gw-person .ic{font-size:22px;flex:none}
.gw-person>span:nth-child(2){flex:1;min-width:0}
.gw-person b{display:block;font-size:13.5px}
.gw-person small{display:block;font-size:11.5px;color:var(--ink3);line-height:1.3}
.gw-slider{display:flex;flex-direction:column;gap:4px;font-size:13px}
.gw-slider input{width:100%;accent-color:var(--orange)}
.gw-chance{position:relative;flex:1;height:26px;border-radius:9px;background:rgba(255,255,255,.08);overflow:hidden;display:flex;align-items:center}
.gw-chance i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,rgba(255,138,31,.45),rgba(63,207,127,.55))}
.gw-chance span{position:relative;padding:0 10px;font-size:12px;font-weight:700}
.gw-spark{width:100%;height:56px;display:block}
.gw-log-list{display:flex;flex-direction:column;gap:4px}
.gw-logline{font-size:12.5px;line-height:1.35;padding:6px 9px;border-radius:10px;background:rgba(255,255,255,.04);border-left:3px solid var(--ink3)}
.gw-logline small{display:block;font-size:10.5px;color:var(--ink3)}
.gw-logline.good{border-left-color:var(--good)}
.gw-logline.bad{border-left-color:var(--bad)}
.gw-logline.money{border-left-color:var(--gold)}
.gw-logline.tip{border-left-color:var(--orange)}
@container gw (max-width: 520px){.gw-ledger b{font-size:15px}.gw-office{padding-left:6px;padding-right:6px}}
`;
