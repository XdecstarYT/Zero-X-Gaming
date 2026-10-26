/** XCity's interface: dark liquid glass over the city with a planning-green accent, phone first (bottom sheets), side panels on big screens. */
export const css = `
.xc{position:absolute;inset:0;overflow:hidden;container:xc/size;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#f1f4f2;-webkit-tap-highlight-color:transparent;background:#9fb4c4;
  --ink:#f1f4f2;--ink2:#b3bcb7;--ink3:#7f8a85;--line:rgba(255,255,255,.1);--green:#34c77b;--green2:#1f9d5c;--gold:#ffcf5a;--bad:#ff6a5f;--warn:#ffb347;--blue:#5fb7ff;--r:18px}
.xc *{box-sizing:border-box}
.xc :where(button){font:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0}
.xc :where(input){font:inherit;color:inherit}
.xc canvas.xc-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none}
.xc .num{font-variant-numeric:tabular-nums}
.xc .muted{color:var(--ink2)}
.xc .dim{color:var(--ink3)}
.xc .good{color:var(--green)}
.xc .bad{color:var(--bad)}
.xc .warn{color:var(--warn)}
.xc .gold{color:var(--gold)}
.xc :focus-visible{outline:2px solid var(--green);outline-offset:2px}
.xc-glass{position:relative;isolation:isolate;background:linear-gradient(165deg,rgba(34,40,38,.8),rgba(14,17,16,.88));border:1px solid rgba(255,255,255,.13);box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 18px 44px -18px rgba(0,0,0,.65);backdrop-filter:blur(16px) saturate(1.4);-webkit-backdrop-filter:blur(16px) saturate(1.4);border-radius:var(--r)}
.xc-glass::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;background:radial-gradient(80% 60% at var(--mx,20%) var(--my,0%),rgba(255,255,255,.13),rgba(255,255,255,0) 60%)}
.xc-refract .xc-glass:not(.xc-dock):not(.xc-bar){backdrop-filter:url(#xc-lg) blur(10px) saturate(1.4)}
.xc-refract .xc-dock,.xc-refract .xc-bar{backdrop-filter:url(#xc-lg-bar) blur(9px) saturate(1.4)}

/* buttons */
.xc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:38px;padding:0 15px;border-radius:999px;font-weight:650;font-size:14px;white-space:nowrap;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14)!important;transition:transform .12s ease,background .12s}
.xc-btn:hover:not(:disabled){background:rgba(255,255,255,.17)}
.xc-btn:active:not(:disabled){transform:scale(.96)}
.xc-btn:disabled{opacity:.4;cursor:not-allowed}
.xc-btn.white{background:#f6f7f5;color:#121513}
.xc-btn.white:hover:not(:disabled){background:#fff}
.xc-btn.green{background:linear-gradient(180deg,#4ad98d,#22a862);color:#06210f}
.xc-btn.blue{background:linear-gradient(180deg,#7cc8ff,#3a95e6);color:#06203a}
.xc-btn.red{background:rgba(255,106,95,.18);color:#ffb3ad}
.xc-btn.small{min-height:32px;padding:0 12px;font-size:13px}
.xc-btn.tiny{min-height:28px;padding:0 10px;font-size:12px}
.xc-btn.wide{width:100%}
.xc-btn.icon{width:38px;padding:0}
.xc-chip{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 12px;border-radius:12px;font-size:13px;font-weight:600;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1)!important;color:var(--ink2);white-space:nowrap}
.xc-chip.on{background:#f6f7f5;color:#121513;border-color:#fff!important}
.xc-chip:disabled{opacity:.38}
.xc-row{display:flex;gap:6px;flex-wrap:wrap}
.xc-scroll{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
.xc-scroll::-webkit-scrollbar{display:none}

/* top bar */
.xc-top{position:absolute;left:8px;right:8px;top:calc(8px + env(safe-area-inset-top));display:flex;align-items:flex-start;gap:6px;z-index:5;pointer-events:none}
.xc-top>*{pointer-events:auto}
@media (pointer: coarse){.xc-top{left:58px}}
.xc-bar{display:flex;align-items:center;gap:2px;padding:4px;min-width:0}
.xc-city{display:flex;flex-direction:column;padding:2px 10px 2px 8px;line-height:1.1;min-width:0}
.xc-city b{font-size:14px;white-space:nowrap;letter-spacing:.02em}
.xc-city small{font-size:10.5px;color:var(--ink3);white-space:nowrap}
.xc-stats{flex:1 1 auto;overflow-x:auto;scrollbar-width:none}
.xc-stats::-webkit-scrollbar{display:none}
.xc-stat{display:flex;flex-direction:column;padding:2px 9px;border-radius:12px;line-height:1.15;flex:none;text-align:left}
.xc-stat small{font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em}
.xc-stat span{font-size:14px;font-weight:700}
.xc-stat i{font-style:normal;font-size:11px;margin-left:3px}
.xc-clock{flex:none}
.xc-clock .date{font-size:12.5px;font-weight:700;padding:0 8px;white-space:nowrap}
.xc-speed{min-width:32px;height:32px;border-radius:10px;font-weight:800;font-size:12px;color:var(--ink2)}
.xc-speed.on{background:#f6f7f5;color:#121513}
.xc-polbar{flex:none}
@container xc (max-width: 700px){.xc-top{flex-wrap:wrap}.xc-stats{order:3;flex:1 1 100%}.xc-clock{margin-left:auto}.xc-city small{display:none}.xc-polbar{order:2;flex:1 1 100%}.xc-polbar .xc-polchip{flex:1}}

/* demand meter (Homes · Wanted) */
.xc-want{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink2)}
.xc-meter{position:relative;width:64px;height:6px;border-radius:9px;background:rgba(255,255,255,.12);overflow:hidden}
.xc-meter i{position:absolute;inset:0 auto 0 0;border-radius:9px;background:var(--green)}

/* the dock */
.xc-dock{position:absolute;left:50%;bottom:calc(8px + env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;gap:2px;padding:5px;z-index:6;max-width:calc(100% - 16px);overflow-x:auto;scrollbar-width:none}
.xc-dock::-webkit-scrollbar{display:none}
.xc-tool{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:58px;height:50px;padding:0 4px;border-radius:13px;font-size:10.5px;font-weight:650;color:var(--ink2);flex:none}
.xc-tool span{font-size:19px;line-height:1}
.xc-tool.on{background:#f6f7f5;color:#121513}
.xc-badge{position:absolute;top:3px;right:6px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--bad);color:#fff;font-size:10.5px;font-weight:800;display:flex;align-items:center;justify-content:center}

/* tool options, above the dock */
.xc-opts{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(72px + env(safe-area-inset-bottom));width:min(560px,calc(100% - 16px));padding:10px 12px;z-index:6;display:flex;flex-direction:column;gap:8px}
.xc-opts h4{margin:0;font-size:12px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.08em}
.xc-hint{font-size:12.5px;color:var(--ink2);line-height:1.35}
.xc-quote{display:flex;align-items:center;gap:8px;justify-content:space-between;font-size:13px}

/* panels: bottom sheets on phones, a side panel on wide screens */
.xc-panel{position:absolute;left:8px;right:8px;bottom:calc(72px + env(safe-area-inset-bottom));max-height:min(64%,640px);display:flex;flex-direction:column;z-index:7;overflow:hidden}
@container xc (min-width: 820px){.xc-panel{left:auto;right:12px;top:70px;bottom:84px;width:400px;max-height:none}}
.xc-panel-h{flex:none;display:flex;align-items:center;gap:10px;padding:14px 14px 8px}
.xc-panel-h .ic{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;background:rgba(255,255,255,.95);flex:none}
.xc-panel-h h3{margin:0;font-size:17px;line-height:1.15}
.xc-panel-h p{margin:2px 0 0;font-size:12px;color:var(--ink3)}
.xc-panel-h .x{margin-left:auto;width:32px;height:32px;border-radius:10px;font-size:18px;color:var(--ink2);flex:none}
.xc-body{overflow-y:auto;padding:4px 14px 14px;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain}
.xc-tabs{display:flex;gap:16px;padding:0 14px;border-bottom:1px solid var(--line);flex:none;overflow-x:auto;scrollbar-width:none}
.xc-tabs::-webkit-scrollbar{display:none}
.xc-tabs button{flex:none;white-space:nowrap}
.xc-tabs button{padding:8px 0;font-size:13.5px;font-weight:650;color:var(--ink3);border-bottom:2px solid transparent!important}
.xc-tabs button.on{color:var(--ink);border-bottom-color:var(--ink)!important}
.xc-sec h5{margin:0 0 6px;font-size:11.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.07em}
.xc-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:6px}
.xc-tile{padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.07)}
.xc-tile b{display:block;font-size:17px;line-height:1.1}
.xc-tile small{font-size:11px;color:var(--ink3)}
.xc-kv{display:grid;grid-template-columns:1fr auto;gap:4px 12px;font-size:13px}
.xc-kv span:nth-child(odd){color:var(--ink2)}
.xc-note{display:flex;gap:8px;align-items:flex-start;padding:9px 11px;border-radius:12px;font-size:12.5px;line-height:1.35;background:rgba(255,255,255,.06)}
.xc-note.no{background:rgba(255,106,95,.12);color:#ffc3be}
.xc-note.yes{background:rgba(52,199,123,.12);color:#b7f0cf}
.xc-actions{display:flex;gap:8px;align-items:center}
.xc-actions .grow{flex:1}

/* the height slider with its picture */
.xc-height{display:flex;gap:10px;align-items:stretch;border-radius:14px;background:#cfe6f5;overflow:hidden;min-height:150px}
.xc-height .rail{display:flex;flex-direction:column;justify-content:space-between;padding:10px 0 10px 10px}
.xc-height .stop{width:22px;height:22px;border-radius:50%;background:#242a27;border:3px solid #cfe6f5!important;box-shadow:0 0 0 1.5px #242a27}
.xc-height .stop.on{background:#fff;box-shadow:0 0 0 3px var(--green2)}
.xc-height .stop:disabled{opacity:.35}
.xc-height svg{flex:1;display:block}
.xc-height .lbl{position:absolute;top:50%;transform:translateY(-50%);padding:4px 10px;border-radius:999px;background:#242a27;color:#fff;font-size:12px;font-weight:650}

/* pattern cards */
.xc-pats{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.xc-pat{display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 2px;border-radius:12px;font-size:11px;font-weight:600;color:var(--ink2);border:1.5px solid transparent!important}
.xc-pat svg{width:100%;max-width:58px;aspect-ratio:1;border-radius:9px}
.xc-pat.on{border-color:#f6f7f5!important;color:var(--ink);background:rgba(255,255,255,.06)}

/* the designer */
.xc-storeys{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.xc-sty{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:84px;padding:6px 0;border-radius:12px;background:rgba(255,255,255,.05);font-size:11.5px;color:var(--ink2);border:1.5px solid transparent!important}
.xc-sty.on{border-color:#f6f7f5!important;color:var(--ink)}
.xc-sty i{display:block;width:16px;background:linear-gradient(180deg,#e9edf0,#aeb6bc);border-radius:2px 2px 0 0;background-image:repeating-linear-gradient(180deg,transparent 0 3px,rgba(40,50,60,.35) 3px 4px),linear-gradient(180deg,#e9edf0,#aeb6bc)}
.xc-step{display:flex;align-items:center;gap:10px;font-size:13.5px}
.xc-step button{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.1);font-size:18px;font-weight:700}
.xc-swatches{display:flex;gap:8px;flex-wrap:wrap}
.xc-sw{width:30px;height:30px;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(0,0,0,.25)}
.xc-sw.on{box-shadow:0 0 0 2px #121513,0 0 0 4px #f6f7f5}
.xc-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13.5px}
.xc-switch{width:44px;height:26px;border-radius:999px;background:rgba(255,255,255,.18);position:relative;flex:none}
.xc-switch::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .15s}
.xc-switch.on{background:var(--green)}
.xc-switch.on::after{transform:translateX(18px)}
.xc-cost{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.xc-cost .clout{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:999px;background:var(--gold);color:#2a1d00;font-weight:800;font-size:12.5px}
.xc-stars{color:var(--gold);letter-spacing:1px}

/* toasts (applications get a card with Review) */
.xc-toasts{position:absolute;left:8px;top:calc(64px + env(safe-area-inset-top));display:flex;flex-direction:column;gap:6px;z-index:8;width:min(360px,calc(100% - 16px));pointer-events:none}
@container xc (max-width: 700px){.xc-toasts{top:calc(112px + env(safe-area-inset-top))}}
@container xc (max-width: 700px){.xc-toasts.pol{top:calc(178px + env(safe-area-inset-top))}}
.xc-toast{pointer-events:auto;padding:10px 12px;font-size:13px;line-height:1.35;border-left:4px solid var(--ink3)!important;animation:xcIn .25s ease}
.xc-toast.good{border-left-color:var(--green)!important}
.xc-toast.bad{border-left-color:var(--bad)!important}
.xc-toast.tip{border-left-color:var(--gold)!important}
.xc-app{pointer-events:auto;padding:12px 14px;border-left:4px solid var(--gold)!important;animation:xcIn .25s ease}
.xc-app .k{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--gold);font-weight:650}
.xc-app h4{margin:4px 0 0;font-size:17px}
.xc-app p{margin:2px 0 8px;font-size:12.5px;color:var(--ink2)}
@keyframes xcIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}

/* the agenda */
.xc-agenda-card{padding:12px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:8px}
.xc-agenda-card .by{font-size:11.5px;color:var(--ink3);display:flex;justify-content:space-between;gap:8px}
.xc-agenda-card h4{margin:0;font-size:16px}
.xc-agenda-card .what{font-size:12.5px;color:var(--ink2)}
.xc-terms{display:grid;grid-template-columns:1fr 1fr;gap:6px}

/* charts */
.xc-spark{width:100%;height:56px;display:block}
.xc-bars{display:flex;height:12px;border-radius:7px;overflow:hidden;gap:2px}
.xc-bars i{display:block;height:100%}
.xc-legend{display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--ink2)}
.xc-legend b{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:4px;vertical-align:-1px}

/* the title */
.xc-title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:24px 20px calc(36px + env(safe-area-inset-bottom));z-index:9;background:linear-gradient(180deg,rgba(10,14,12,0) 30%,rgba(10,14,12,.72) 100%)}
.xc-logo{font-size:clamp(54px,14cqw,112px);font-weight:900;letter-spacing:.08em;line-height:.9;margin:6px 0 0;background:linear-gradient(180deg,#fff,#d7f2e2);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 6px 24px rgba(0,0,0,.45))}
.xc-logo span{background:linear-gradient(120deg,#4ad98d,#22e5ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.xc-tag{margin:10px 0 18px;font-size:15px;color:#e6efe9;text-align:center;max-width:420px;text-shadow:0 2px 8px rgba(0,0,0,.5)}
.xc-title .xc-actions{flex-wrap:wrap;justify-content:center}
.xc-loading{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:14px 18px;z-index:10;text-align:center;font-size:13px;min-width:220px}
.xc-prog{height:6px;border-radius:9px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:8px}
.xc-prog i{display:block;height:100%;background:var(--green)}
.xc-confirm{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(72px + env(safe-area-inset-bottom));width:min(460px,calc(100% - 16px));padding:12px 14px;z-index:7;display:flex;flex-direction:column;gap:8px}
.xc-attrib{position:absolute;right:8px;bottom:2px;font-size:9.5px;color:rgba(255,255,255,.55);z-index:1;pointer-events:none}

/* politics, menus and setup */
.xc-center{left:50%!important;right:auto!important;top:50%!important;bottom:auto!important;transform:translate(-50%,-50%);width:min(560px,calc(100% - 16px))!important;max-height:calc(100% - 24px)!important}
.xc-setup,.xc-night{position:absolute;inset:0;z-index:12;background:rgba(8,12,10,.45)}
.xc-night{background:rgba(6,8,12,.72)}
.xc-night .xc-center{top:calc(12px + env(safe-area-inset-top))!important;bottom:calc(12px + env(safe-area-inset-bottom))!important;transform:translateX(-50%);max-height:none!important}
.xc-setup .xc-center{top:calc(10px + env(safe-area-inset-top))!important;bottom:calc(10px + env(safe-area-inset-bottom))!important;transform:translateX(-50%);max-height:none!important}
.xc-title-panel{position:absolute;inset:0;z-index:11}
.xc-input{width:100%;min-height:38px;padding:0 12px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);font-size:14px}
.xc-presets{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
.xc-preset{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.05);border:1.5px solid transparent;text-align:left}
.xc-preset b{font-size:13px}
.xc-preset small{font-size:11px;color:var(--ink3);line-height:1.3}
.xc-preset.on{background:rgba(255,255,255,.12)}
.xc-slider{display:flex;flex-direction:column;gap:2px;margin-bottom:8px}
.xc-slider .t{font-size:13px;font-weight:650}
.xc-slider input{width:100%;accent-color:var(--green)}
.xc-slider .ends{display:flex;justify-content:space-between;font-size:11px;color:var(--ink3)}
.xc-slider .ends i{font-style:normal}
.xc-preview{display:flex;gap:12px;align-items:center;padding:10px 12px;border-radius:14px;border:2px solid;background:rgba(255,255,255,.04)}
.xc-elec{display:flex;flex-direction:column;gap:5px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.05);border:1.5px solid transparent!important;text-align:left}
.xc-elec.on{border-color:#f6f7f5!important;background:rgba(255,255,255,.1)}
.xc-elec .n{font-size:13.5px;font-weight:700}
.xc-elec .n small{font-weight:500;font-size:11.5px}
.xc-elec .l{display:flex;align-items:center;gap:5px;font-size:12px}
.xc-promise{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)!important;font-size:13px}
.xc-promise:disabled{opacity:.45}
.xc-group{display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)}
.xc-seatbars{display:flex;flex-direction:column;gap:6px}
.xc-seatbars .row{display:grid;grid-template-columns:72px 1fr 28px;align-items:center;gap:8px;font-size:13px}
.xc-seatbars .bar{height:14px;border-radius:8px;background:rgba(255,255,255,.08);overflow:hidden}
.xc-seatbars .bar i{display:block;height:100%;transition:width .5s ease}
.xc-result{display:flex;flex-direction:column;gap:1px;padding:7px 10px;border-radius:10px;background:rgba(255,255,255,.05);border-left:4px solid;font-size:13px;animation:xcIn .3s ease}
.xc-result span{display:flex;align-items:center;gap:6px}
.xc-polchip{display:flex;align-items:center;gap:6px;padding:2px 10px;font-size:12.5px;font-weight:700;white-space:nowrap}
.xc-menu{display:flex;flex-direction:column;gap:8px;width:min(320px,100%)}
`;
