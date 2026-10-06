/** YourGov's look: a flat grey desk of panels around the map, like a government terminal. */
export const css = `
.yg{position:absolute;inset:0;display:flex;flex-direction:column;background:#c9c9c9;color:#2b2b2b;font:13px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;user-select:none;-webkit-user-select:none;overflow:hidden}
.yg *{box-sizing:border-box}
.yg :where(button){font:inherit;color:inherit;cursor:pointer;border:0;background:none}
.yg :where(button:disabled){cursor:not-allowed;opacity:.45}
.yg-top{display:flex;align-items:center;gap:6px;height:38px;padding:0 8px;background:#4a4a4a;color:#fff;flex:none;box-shadow:0 2px 0 #3a3a3a}
.yg-stat{display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:#5b5b5b;font-weight:800;font-size:12px;white-space:nowrap}
.yg-stat b{font-weight:900}
.yg-iconbtn{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:#646464;color:#fff;font-size:15px}
.yg-iconbtn:hover{background:#737373}
.yg-iconbtn[aria-pressed=true]{background:#e7e7e7;color:#2b2b2b}
.yg-main{position:relative;flex:1;min-height:0;display:flex}
.yg-rail{display:flex;flex-direction:column;gap:4px;padding:6px 4px;background:#5a5a5a;flex:none}
.yg-rail .yg-iconbtn{width:38px;height:38px;font-size:18px;position:relative}
.yg-dot{position:absolute;top:3px;right:3px;width:9px;height:9px;border-radius:50%;background:#f5b335;box-shadow:0 0 0 2px #5a5a5a}
.yg-panel{width:min(330px,42vw);flex:none;display:flex;flex-direction:column;background:#ececec;border-right:2px solid #9e9e9e;min-height:0}
.yg-ph{display:flex;align-items:center;gap:8px;padding:6px 8px;background:#6a6a6a;color:#fff;font-weight:900;font-size:12.5px;letter-spacing:.02em}
.yg-ph .yg-x{margin-left:auto;width:22px;height:22px;border-radius:5px;background:#8a8a8a;color:#fff;font-weight:900}
.yg-pb{flex:1;min-height:0;overflow:auto;padding:6px}
.yg-row{display:flex;align-items:center;gap:8px;min-height:30px;padding:4px 8px;margin-bottom:3px;border-radius:6px;background:#dcdcdc;font-weight:700}
.yg-row.btn{width:100%;text-align:left}
.yg-row.btn:hover{background:#d0d0d0}
.yg-row.on{background:#5b5b5b;color:#fff}
.yg-row .r{margin-left:auto;font-weight:900;white-space:nowrap}
.yg-label{font-size:10.5px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#6d6d6d;margin:8px 4px 4px}
.yg-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:0 12px;border-radius:7px;background:#5f5f5f;color:#fff;font-weight:900}
.yg-btn:hover{background:#6e6e6e}
.yg-btn.go{background:#3f8f46}
.yg-btn.go:hover{background:#4aa352}
.yg-btn.no{background:#b0413a}
.yg-btn.wide{width:100%}
.yg-bar{height:7px;border-radius:4px;background:#c4c4c4;overflow:hidden}
.yg-bar>i{display:block;height:100%}
.yg-view{position:relative;flex:1;min-width:0;background:#3b8fe0;overflow:hidden}
.yg-view canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.yg-missions{position:absolute;right:10px;top:10px;max-width:260px;display:flex;flex-direction:column;gap:3px;pointer-events:none}
.yg-mission{display:flex;gap:6px;align-items:flex-start;font-weight:800;font-size:11.5px;color:#2b2b2b;text-shadow:0 1px 0 #ffffffaa}
.yg-mission i{flex:none;width:12px;height:12px;margin-top:1px;border-radius:50%;background:#e9b52f;box-shadow:inset 0 0 0 2px #c58f12}
.yg-mission.done i{background:#4caf50;box-shadow:inset 0 0 0 2px #2e7d32}
.yg-mission.failed i{background:#d9534f;box-shadow:inset 0 0 0 2px #a33}
.yg-endturn{position:absolute;right:10px;bottom:10px;display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:10px;background:#5b5b5b;color:#fff;font-weight:900;box-shadow:0 3px 0 #3e3e3e}
.yg-endturn:hover{background:#6a6a6a}
.yg-bottom{display:flex;align-items:center;gap:6px;height:52px;padding:0 60px 0 8px;background:#8d8d8d;flex:none;box-shadow:0 -2px 0 #777}
.yg-date{display:flex;align-items:center;gap:4px;padding:4px 10px;border-radius:7px;background:#5b5b5b;color:#fff;font-weight:900}
.yg-timeline{position:relative;flex:1;height:30px;border-radius:7px;background:#a8a8a8;overflow:hidden;min-width:0}
.yg-tick{position:absolute;top:0;bottom:0;width:1px;background:#8f8f8f}
.yg-mark{position:absolute;top:4px;width:20px;height:20px;margin-left:-10px;border-radius:5px;display:grid;place-items:center;font-size:12px;background:#f2f2f2;box-shadow:0 1px 0 #777}
.yg-hourglass{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:#555;color:#fff;font-size:22px;box-shadow:0 3px 0 #333,inset 0 0 0 3px #777}
.yg-hourglass:hover{background:#666}
.yg-toast{position:absolute;left:50%;bottom:62px;transform:translateX(-50%);padding:7px 14px;border-radius:8px;background:#4a4a4a;color:#fff;font-weight:800;box-shadow:0 4px 14px #0004;max-width:80%;text-align:center;z-index:5}
.yg-toast.good{background:#3f8f46}.yg-toast.bad{background:#b0413a}
.yg-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
.yg-tile{display:grid;place-items:center;aspect-ratio:1;border-radius:8px;background:#5f5f5f;font-size:22px}
.yg-tile:hover{background:#6f6f6f}.yg-tile[aria-pressed=true]{background:#e9e9e9;box-shadow:inset 0 0 0 2px #5f5f5f}
.yg-tile:disabled{opacity:.35}
.yg-chip{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;background:#cfcfcf;font-size:11px;font-weight:900}
.yg-sw{display:inline-block;width:12px;height:12px;border-radius:3px;box-shadow:inset 0 0 0 1px #0003;flex:none}
.yg-title{position:absolute;inset:0;display:grid;place-items:center;background:radial-gradient(circle at 50% 30%,#d9d9d9,#a7a7a7)}
.yg-card{width:min(560px,92%);max-height:92%;overflow:auto;border-radius:14px;background:#ececec;box-shadow:0 10px 40px #0005}
.yg-card h1{margin:0;font-size:34px;font-weight:950;letter-spacing:-.02em}
.yg-mapctl{position:absolute;left:10px;bottom:10px;display:flex;gap:4px}
.yg-legend{position:absolute;left:10px;top:10px;display:flex;flex-direction:column;gap:2px;padding:6px 8px;border-radius:8px;background:#ffffffd0;font-weight:800;font-size:11px}
@media (max-width:700px){.yg-panel{position:absolute;left:46px;top:0;bottom:0;z-index:4;width:min(330px,calc(100% - 46px))}.yg-missions{display:none}.yg-stat.opt{display:none}}
`;
