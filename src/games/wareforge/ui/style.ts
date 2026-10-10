/** WareForge's interface: bright NextX liquid glass over a pastel 3D yard, phone first. */
export const css = `
.wf{position:absolute;inset:0;overflow:hidden;container:wf/size;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1b2236;-webkit-tap-highlight-color:transparent;
  --r:20px;--g:rgba(255,255,255,.62);--ink:#1b2236;--ink2:#5b6478;--ink3:#8a93a8;--blue:#2f6fe4;--line:rgba(27,34,54,.08);--good:#16a36b;--warn:#e08a00;--bad:#e5484d;--violet:#7c5cf0}
.wf *{box-sizing:border-box}
.wf button{font:inherit;color:inherit;cursor:pointer;border:0;background:none}
.wf canvas.wf-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none}
.wf .num{font-variant-numeric:tabular-nums}
.wf .muted{color:var(--ink2)}
.wf .dim{color:var(--ink3)}

/* ---- liquid glass ---- */
.wf-glass{position:relative;isolation:isolate;border-radius:var(--r);
  background:linear-gradient(150deg,rgba(255,255,255,.75),rgba(255,255,255,.45) 45%,rgba(255,255,255,.58)),var(--g);
  border:1px solid rgba(255,255,255,.75);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.95),inset 0 -1px 0 rgba(255,255,255,.35),0 20px 50px -22px rgba(40,52,110,.45),0 2px 10px -3px rgba(40,52,110,.18);
  backdrop-filter:blur(18px) saturate(1.8);-webkit-backdrop-filter:blur(18px) saturate(1.8)}
.wf-glass::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;
  background:radial-gradient(90% 70% at var(--mx,20%) var(--my,0%),rgba(255,255,255,.75),rgba(255,255,255,0) 60%)}
.wf-refract .wf-glass:not(.wf-sheet):not(.wf-capsule){backdrop-filter:url(#wf-lg) blur(8px) saturate(1.8);}
.wf-refract .wf-capsule{backdrop-filter:url(#wf-lg-bar) blur(7px) saturate(1.8)}
.wf-capsule{border-radius:999px}

/* ---- buttons ---- */
.wf-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:0 14px;border-radius:999px;font-weight:650;font-size:13.5px;white-space:nowrap;
  background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(240,243,252,.85));border:1px solid rgba(27,34,54,.08)!important;box-shadow:0 1px 2px rgba(27,34,54,.08),inset 0 1px 0 #fff;transition:transform .15s ease,box-shadow .15s ease,background .15s}
.wf-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 16px -8px rgba(47,111,228,.5),inset 0 1px 0 #fff}
.wf-btn:active:not(:disabled){transform:scale(.96)}
.wf-btn:disabled{opacity:.45;cursor:not-allowed}
.wf-btn.primary{background:linear-gradient(180deg,#4b86f5,#2a62d8);color:#fff;border-color:rgba(255,255,255,.3)!important;box-shadow:0 8px 18px -8px rgba(47,111,228,.8),inset 0 1px 0 rgba(255,255,255,.35)}
.wf-btn.bad{background:linear-gradient(180deg,#f06c70,#d83d43);color:#fff}
.wf-btn.good{background:linear-gradient(180deg,#2fc488,#159a63);color:#fff}
.wf-btn.small{min-height:30px;padding:0 11px;font-size:12.5px}
.wf-btn.icon{width:40px;padding:0}
.wf-btn.icon.small{width:30px}
.wf-btn.on{background:linear-gradient(180deg,#e8efff,#d6e2ff);color:var(--blue);border-color:rgba(47,111,228,.35)!important}
.wf-btn.wide{width:100%}
.wf :focus-visible{outline:2px solid var(--blue);outline-offset:2px}

/* ---- top bar ---- */
.wf-top{position:absolute;left:12px;right:12px;top:10px;display:flex;align-items:center;gap:8px;padding:6px 8px 6px 10px;z-index:6;min-height:52px}
.wf-brand{display:flex;align-items:center;gap:8px;font-weight:800;letter-spacing:-.01em;font-size:16px;flex:none}
.wf-brand svg{width:30px;height:30px;flex:none}
.wf-search{flex:1;min-width:0;position:relative;max-width:420px}
.wf-search input{width:100%;height:38px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.7);padding:0 14px 0 36px;font:inherit;font-size:13.5px;color:var(--ink);outline:none}
.wf-search input:focus{border-color:rgba(47,111,228,.45);box-shadow:0 0 0 3px rgba(47,111,228,.15)}
.wf-search .ic{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--ink3);pointer-events:none}
.wf-search-inline{display:none;margin-bottom:12px}
.wf-search-inline .wf-hits{position:relative;top:6px}
.wf-hits{position:absolute;left:0;right:0;top:44px;padding:6px;max-height:50vh;overflow:auto;z-index:9}
.wf-hit{display:flex;flex-direction:column;align-items:flex-start;width:100%;padding:8px 10px;border-radius:12px;text-align:left}
.wf-hit:hover,.wf-hit:focus-visible{background:rgba(47,111,228,.08)}
.wf-chip{display:flex;align-items:center;gap:10px;padding:5px 12px 5px 6px;border-radius:999px;background:rgba(255,255,255,.7);border:1px solid var(--line);flex:none;min-width:0}
.wf-chip .ico{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(180deg,#5b8ff7,#2f6fe4);color:#fff;font-size:14px;flex:none}
.wf-chip b{font-size:13px;display:block;line-height:1.15;white-space:nowrap}
.wf-chip small{font-size:11.5px;color:var(--ink2);white-space:nowrap}
.wf-live{display:flex;align-items:center;gap:6px;font-weight:700;font-size:13px;padding:0 4px;flex:none}
.wf-live i{width:8px;height:8px;border-radius:50%;background:var(--good);box-shadow:0 0 0 4px rgba(22,163,107,.18);animation:wf-pulse 1.6s ease infinite}
.wf-live.held i{background:var(--warn);box-shadow:0 0 0 4px rgba(224,138,0,.18);animation:none}
@keyframes wf-pulse{50%{box-shadow:0 0 0 7px rgba(22,163,107,0)}}
.wf-speeds{display:flex;gap:2px;padding:3px;border-radius:999px;background:rgba(27,34,54,.05);flex:none}
.wf-speeds button{min-width:30px;height:28px;border-radius:999px;font-size:12px;font-weight:700;color:var(--ink2)}
.wf-speeds button.on{background:#fff;color:var(--blue);box-shadow:0 1px 3px rgba(27,34,54,.15)}
.wf-bell{position:relative}
.wf-kpitoggle{display:none!important}
/* Full window: the platform's pause button sits at the top bar's left end. */
[data-immersive] .wf-top{padding-left:58px}
[data-immersive] .wf-brand svg{display:none}
.wf-bell em{position:absolute;top:2px;right:2px;min-width:16px;height:16px;border-radius:8px;background:var(--bad);color:#fff;font-size:10px;font-style:normal;font-weight:800;display:grid;place-items:center;padding:0 4px}
.wf-me{display:flex;align-items:center;gap:8px;flex:none}
.wf-me .av{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#ffcf8a,#f08a5d);display:grid;place-items:center;font-weight:800;color:#fff;font-size:13px}
.wf-me b{font-size:13px;display:block;line-height:1.1}
.wf-me small{font-size:11.5px;color:var(--ink2)}
.wf-spacer{flex:1}

/* ---- KPI tiles ---- */
.wf-kpis{position:absolute;left:12px;top:72px;display:flex;gap:8px;z-index:4;max-width:calc(100% - 24px);overflow-x:auto;scrollbar-width:none;padding-bottom:4px}
.wf-kpis::-webkit-scrollbar{display:none}
.wf-kpi{padding:10px 14px;min-width:150px;flex:none;--r:16px}
.wf-kpi .k{font-size:11.5px;color:var(--ink2);font-weight:600;display:flex;align-items:center;gap:6px}
.wf-kpi .k i{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;font-style:normal;font-size:12px;background:rgba(47,111,228,.1);color:var(--blue)}
.wf-kpi .v{font-size:22px;font-weight:800;letter-spacing:-.02em;margin-top:4px;display:flex;align-items:baseline;gap:6px}
.wf-kpi .v small{font-size:12px;font-weight:600;color:var(--ink2)}
.wf-kpi .d{font-size:11.5px;color:var(--ink2);margin-top:1px}
.wf-up{color:var(--good)!important}
.wf-down{color:var(--bad)!important}

/* ---- cards ---- */
.wf-card{padding:14px;--r:20px}
.wf-card h3{margin:0;font-size:15px;font-weight:800;letter-spacing:-.01em}
.wf-eyebrow{font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
.wf-row{display:flex;align-items:center;gap:8px}
.wf-between{display:flex;align-items:center;justify-content:space-between;gap:8px}
.wf-kv{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-top:10px}
.wf-kv div{min-width:0}
.wf-kv small{display:block;font-size:11px;color:var(--ink3);font-weight:600}
.wf-kv b{display:block;font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wf-pill{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:999px;font-size:11.5px;font-weight:700;background:rgba(47,111,228,.1);color:var(--blue);white-space:nowrap}
.wf-pill.good{background:rgba(22,163,107,.12);color:var(--good)}
.wf-pill.warn{background:rgba(224,138,0,.13);color:#b36d00}
.wf-pill.bad{background:rgba(229,72,77,.12);color:var(--bad)}
.wf-pill.grey{background:rgba(27,34,54,.06);color:var(--ink2)}
.wf-pill.violet{background:rgba(124,92,240,.12);color:var(--violet)}
.wf-bar{height:6px;border-radius:3px;background:rgba(27,34,54,.08);overflow:hidden}
.wf-bar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#5b8ff7,#2f6fe4)}
.wf-sep{height:1px;background:var(--line);margin:10px 0}
.wf-x{position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;color:var(--ink2);background:rgba(27,34,54,.05)}
.wf-x:hover{background:rgba(27,34,54,.1)}

/* ---- inspector ---- */
.wf-insp{position:absolute;right:12px;top:72px;width:320px;max-height:calc(100% - 300px);overflow:auto;z-index:5;animation:wf-in .25s ease both}
@keyframes wf-in{from{opacity:0;transform:translateY(8px) scale(.98)}}
.wf-insp .title{font-size:18px;font-weight:800;margin-top:2px;padding-right:30px}
.wf-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.wf-palchip{display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:10px;background:rgba(27,34,54,.04);font-size:12px;font-weight:600}
.wf-palchip:hover{background:rgba(47,111,228,.1)}
.wf-palchip i{width:12px;height:12px;border-radius:3px;display:block}

/* ---- tracking ---- */
.wf-track{position:absolute;left:12px;bottom:12px;width:min(420px,calc(50% - 18px));z-index:4}
.wf-steps{display:flex;align-items:flex-start;margin:12px 0 10px}
.wf-step{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;font-size:10.5px;font-weight:700;color:var(--ink3);text-align:center;line-height:1.15}
.wf-step::before{content:"";position:absolute;top:11px;left:-50%;right:50%;height:3px;background:rgba(27,34,54,.1);z-index:0}
.wf-step:first-child::before{display:none}
.wf-step b{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:#fff;border:2px solid rgba(27,34,54,.15);z-index:1;font-size:11px}
.wf-step.done{color:var(--ink)}
.wf-step.done b{background:var(--blue);border-color:var(--blue);color:#fff}
.wf-step.done::before{background:var(--blue)}
.wf-step.now{color:var(--blue)}
.wf-step.now b{border-color:var(--blue);color:var(--blue);box-shadow:0 0 0 4px rgba(47,111,228,.15)}
.wf-step.now::before{background:linear-gradient(90deg,var(--blue),rgba(27,34,54,.1))}
.wf-ship{display:flex;align-items:center;gap:10px;padding:10px;border-radius:14px;background:rgba(255,255,255,.65);border:1px solid var(--line)}
.wf-ship .truck{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:rgba(47,111,228,.1);font-size:18px;flex:none}

/* ---- table ---- */
.wf-table{position:absolute;right:12px;bottom:12px;width:min(440px,calc(50% - 18px));z-index:4;padding:10px}
.wf-tabs{display:flex;gap:4px;padding:3px;border-radius:999px;background:rgba(27,34,54,.05)}
.wf-tabs button{flex:1;height:30px;border-radius:999px;font-size:12.5px;font-weight:700;color:var(--ink2)}
.wf-tabs button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(27,34,54,.15)}
.wf-rows{margin-top:6px;max-height:190px;overflow:auto}
.wf-trow{display:grid;grid-template-columns:76px 1fr auto;gap:8px;align-items:center;width:100%;padding:8px 6px;border-radius:12px;text-align:left;font-size:12.5px}
.wf-trow:hover{background:rgba(47,111,228,.07)}
.wf-trow+.wf-trow{border-top:1px solid var(--line)}
.wf-trow b{font-weight:800}
.wf-trow .sub{display:block;font-size:11px;color:var(--ink3);font-weight:600}

/* ---- dock ---- */
.wf-dock{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:flex;gap:2px;padding:5px;z-index:6}
.wf-dock button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:54px;height:50px;border-radius:16px;font-size:10.5px;font-weight:700;color:var(--ink2);position:relative}
.wf-dock button span{font-size:18px;line-height:1}
.wf-dock button.on{background:rgba(47,111,228,.12);color:var(--blue)}
.wf-dock button:hover{background:rgba(27,34,54,.05)}
.wf-dock em{position:absolute;top:3px;right:6px;min-width:16px;height:16px;border-radius:8px;background:var(--bad);color:#fff;font-size:10px;font-style:normal;font-weight:800;display:grid;place-items:center;padding:0 4px}

/* ---- sheets ---- */
.wf-sheet{position:absolute;left:50%;bottom:76px;transform:translateX(-50%);width:min(560px,calc(100% - 24px));max-height:min(64vh,620px);display:flex;flex-direction:column;z-index:7;animation:wf-in .25s ease both;--g:rgba(255,255,255,.8);
  backdrop-filter:blur(26px) saturate(1.8);-webkit-backdrop-filter:blur(26px) saturate(1.8)}
.wf-sheet>header{padding:14px 16px 8px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.wf-sheet>header h2{margin:0;font-size:18px;font-weight:800;letter-spacing:-.01em}
.wf-sheet .body{padding:4px 16px 16px;overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.wf-list{display:flex;flex-direction:column;gap:8px}
.wf-item{padding:12px;border-radius:16px;background:rgba(255,255,255,.7);border:1px solid var(--line)}
.wf-item h4{margin:0;font-size:14px;font-weight:800}
.wf-item p{margin:4px 0 0;font-size:12.5px;color:var(--ink2);line-height:1.4}
.wf-grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.wf-tile{padding:12px;border-radius:16px;background:rgba(255,255,255,.75);border:1px solid var(--line);text-align:left;display:flex;flex-direction:column;gap:4px;transition:transform .15s,box-shadow .15s}
.wf-tile:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 10px 24px -14px rgba(47,111,228,.6)}
.wf-tile.on{border-color:var(--blue);box-shadow:0 0 0 2px rgba(47,111,228,.25)}
.wf-tile:disabled{opacity:.5}
.wf-tile .big{font-size:24px}
.wf-tile b{font-size:13.5px}
.wf-tile small{font-size:11.5px;color:var(--ink2);line-height:1.35}
.wf-seg{display:flex;gap:4px;flex-wrap:wrap}
.wf-section{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3);margin:14px 0 6px}
.wf-stepper{display:inline-flex;align-items:center;gap:4px}
.wf-stepper output{min-width:24px;text-align:center;font-weight:800}

/* ---- toasts and banners ---- */
.wf-event{position:absolute;left:50%;top:72px;transform:translateX(-50%);z-index:5;display:flex;align-items:center;gap:8px;padding:6px 8px 6px 14px;font-size:13px;max-width:min(720px,calc(100% - 24px));animation:wf-in .3s ease both}
.wf-event .muted{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.wf-toast{position:absolute;left:50%;top:76px;transform:translateX(-50%);z-index:20;padding:10px 16px;font-weight:700;font-size:13.5px;animation:wf-toast 2.6s ease both;pointer-events:none;max-width:calc(100% - 24px);text-align:center}
.wf-toast.bad{color:var(--bad)}
.wf-toast.good{color:#0e8a57}
@keyframes wf-toast{0%{opacity:0;transform:translate(-50%,-8px)}10%,80%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-6px)}}
.wf-toolbar{position:absolute;left:50%;bottom:76px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:6px 6px 6px 14px;z-index:7;font-size:13px;font-weight:700;white-space:nowrap}

/* ---- title ---- */
.wf-title{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:20px 16px calc(24px + env(safe-area-inset-bottom));overflow:auto;
  background:linear-gradient(180deg,rgba(232,235,246,0) 30%,rgba(232,235,246,.7) 70%,rgba(232,235,246,.92))}
.wf-hero{text-align:center;margin-bottom:14px;margin-top:auto}
.wf-hero .logo{display:inline-flex;align-items:center;gap:12px;font-size:clamp(34px,8vw,64px);font-weight:900;letter-spacing:-.035em;line-height:1}
.wf-hero .logo svg{width:clamp(44px,9vw,72px);height:auto}
.wf-hero p{margin:8px auto 0;max-width:520px;color:var(--ink2);font-size:15px;line-height:1.45}
.wf-sites{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;width:min(1180px,100%)}
.wf-site{padding:14px;text-align:left;display:flex;flex-direction:column;gap:6px}
.wf-site h3{margin:0;font-size:16px}
.wf-site p{margin:0;font-size:12.5px;color:var(--ink2);line-height:1.4;flex:1}
.wf-titlebar{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;justify-content:center}
.wf-powered{margin-top:14px}
.wf-over{position:absolute;inset:0;z-index:12;display:grid;place-items:center;padding:16px;background:rgba(232,235,246,.5);backdrop-filter:blur(4px)}
.wf-over .wf-card{max-width:420px;width:100%;text-align:center}

/* ---- small frames (the page's game frame, tablets) ---- */
.wf-inline{position:static!important;width:auto!important;display:block!important;max-height:none!important;padding:0!important;background:none!important;border:0!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;animation:none!important}
.wf-inline::before{display:none}
.wf-dock .site{display:none}
@container wf (min-width:1181px) and (min-height:721px){
  .wf-event{top:182px}
}
@container wf (max-width:1180px) or (max-height:720px){
  .wf-event{top:150px}
  .wf-track,.wf-table{display:none}
  .wf-dock .site{display:flex}
  .wf-kpi{min-width:132px;padding:8px 12px}
  .wf-kpi .v{font-size:18px}
  .wf-me{display:none}
  .wf-insp{max-height:calc(100% - 150px)}
}
@container wf (max-height:560px){
  .wf-kpis{display:none}
  .wf-insp{top:66px;max-height:calc(100% - 140px)}
  .wf-sheet{max-height:calc(100% - 140px)}
}
/* ---- phone ---- */
@container wf (max-width:820px){
  .wf-top{left:8px;right:8px;top:calc(8px + env(safe-area-inset-top));padding:5px 6px 5px 8px;min-height:48px;gap:6px}
  [data-immersive] .wf-top{padding-left:56px}
  .wf-kpitoggle{display:inline-flex!important}
  .wf-brand span,.wf-me,.wf-chip small{display:none}
  .wf-search{max-width:none}
  .wf-chip{padding:4px 8px 4px 4px}
  .wf-chip .ico{width:26px;height:26px}
  /* One slim row of figures: icon and value, the label for screen readers only. */
  .wf-kpis{left:8px;top:calc(62px + env(safe-area-inset-top));max-width:calc(100% - 16px);gap:6px;padding-bottom:2px}
  .wf-kpi{min-width:0;padding:5px 10px 5px 6px;display:flex;align-items:center;gap:6px;--r:999px}
  .wf-kpi .k span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
  .wf-kpi .k i{width:22px;height:22px}
  .wf-kpi .v{font-size:14px;margin:0;gap:4px}
  .wf-kpi .v small{font-size:11px}
  .wf-kpi .d{display:none}
  .wf-track,.wf-table{display:none}
  .wf-dock{left:8px;right:8px;transform:none;bottom:calc(8px + env(safe-area-inset-bottom));justify-content:space-between;overflow-x:auto;scrollbar-width:none}
  .wf-dock button{min-width:48px;flex:1}
  .wf-sheet{left:0;right:0;bottom:0;transform:none;width:100%;max-height:72vh;border-radius:24px 24px 0 0;padding-bottom:env(safe-area-inset-bottom)}
  .wf-insp{left:8px;right:8px;top:auto;bottom:calc(76px + env(safe-area-inset-bottom));width:auto;max-height:46vh}
  .wf-toolbar{bottom:calc(76px + env(safe-area-inset-bottom))}
  .wf-sites{grid-template-columns:1fr}
  .wf-title{padding-top:calc(64px + env(safe-area-inset-top))}
  .wf-site{padding:12px;gap:4px}
  .wf-site p{font-size:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .wf-hero .logo{font-size:30px}
  .wf-hero p{font-size:13.5px}
  .wf-toast{top:calc(64px + env(safe-area-inset-top))}
  .wf-event{top:calc(64px + env(safe-area-inset-top));font-size:12px}
  .wf-kpis ~ .wf-toast,.wf-kpis ~ .wf-event{top:calc(104px + env(safe-area-inset-top))}
  .wf-event .muted{display:none}
}
@container wf (max-width:520px){
  .wf-chip{display:none}
  .wf-top .wf-search{display:none}
  .wf-search-inline{display:block}
  .wf-speeds button{min-width:26px}
}
@media (prefers-reduced-motion:reduce){.wf *{animation:none!important;transition:none!important}}
`;
