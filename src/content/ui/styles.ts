// All overlay CSS lives here and is injected into the closed shadow root.
export const CSS = `
:host{all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;display:block}
*,*::before,*::after{box-sizing:border-box}
.layer{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:2147483647;
  font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#1f2933;
  text-align:left;letter-spacing:normal;-webkit-text-size-adjust:100%}
.layer>*{pointer-events:auto}
.layer>.hl,.layer>.dim,.layer>.ask-frame{pointer-events:none}
button,input,select{font:inherit;color:inherit}
button{cursor:pointer}
button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #1d6fb8;outline-offset:2px}
[hidden]{display:none!important}

/* Tusk */
button.tusk{position:fixed;z-index:1;width:72px;height:72px;padding:0;border:0;background:none;cursor:grab;touch-action:none;
  transition:left .6s ease-in-out,top .6s ease-in-out;-webkit-tap-highlight-color:transparent;user-select:none}
button.tusk.dragging{transition:none;cursor:grabbing}
button.tusk .flip{width:100%;height:100%;transition:transform .2s}
button.tusk .flip.left{transform:scaleX(-1)}
button.tusk .breathe{width:100%;height:100%;transform-origin:50% 90%;animation:breathe 4.5s ease-in-out infinite}
button.tusk svg{width:100%;height:100%;display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.25))}
button.tusk .pose-point{display:none}
button.tusk.pointing .pose-rest{display:none}
button.tusk.pointing .pose-point{display:block}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.045,1.03)}}

/* Bubbles */
.bubble,.listen{position:fixed;z-index:2;background:#fff;border:2px solid #99bbbb;border-radius:18px;padding:12px 16px;
  max-width:min(320px,calc(100vw - 24px));max-height:45vh;overflow:auto;font-size:17px;line-height:1.45;
  box-shadow:0 4px 14px rgba(0,0,0,.18);transition:left .6s ease-in-out,top .6s ease-in-out}
.bubble .txt{white-space:pre-wrap;overflow-wrap:anywhere}
.bubble .btns{display:flex;gap:10px;margin-top:10px}
.listen{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.listen{z-index:3;gap:10px;max-width:min(360px,calc(100vw - 16px))}
.listen .ltitle{font-size:18px;font-weight:700;color:#1f2933}
.listen.paused .wave{opacity:.25}
.lctl{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:10px}
.switch{display:inline-flex;align-items:center;gap:10px;min-height:52px;padding:6px 14px;border:2px solid #99bbbb;border-radius:999px;
  background:#fff;color:#1f2933;font:inherit;font-size:16px;cursor:pointer}
.switch:focus-visible,.btn.stop:focus-visible{outline:3px solid #ffb703;outline-offset:2px}
.switch:disabled{opacity:.5;cursor:default}
.sw-label{font-weight:600}
.sw-track{position:relative;display:inline-block;width:54px;height:30px;border-radius:15px;background:#2f9e6d;transition:background .15s}
.sw-knob{position:absolute;top:3px;left:27px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .15s}
.switch.off .sw-track{background:#9aa5b1}
.switch.off .sw-knob{left:3px}
.sw-state{min-width:2.5em;text-align:left;font-weight:700}
.btn.stop{display:inline-flex;align-items:center;gap:10px;min-height:52px;padding:6px 18px;border:0;border-radius:999px;
  background:#b42318;color:#fff;font:inherit;font-size:16px;font-weight:700;cursor:pointer}
.btn.stop:disabled{opacity:.5;cursor:default}
.stop-icon{display:inline-block;width:14px;height:14px;border-radius:2px;background:#fff}
.listen .hint{font-size:14px;color:#52606d}
.wave{display:flex;align-items:center;gap:5px;height:44px}
.wave i{display:block;width:7px;height:8px;border-radius:4px;background:#2f9e6d;transition:height .12s}

/* Buttons */
.btn{min-height:48px;min-width:80px;padding:8px 20px;border-radius:24px;border:2px solid #99bbbb;background:#fff;font-size:17px;font-weight:600}
.btn.yes{background:#2f9e6d;border-color:#2f9e6d;color:#fff}
.btn.no{background:#fff;border-color:#8795a1;color:#323f4b}
.btn:disabled{opacity:.55;cursor:default}
.btn.chosen{opacity:1;outline:3px solid #1f2933}

/* Panels */
.panel{position:fixed;z-index:2;background:#fff;border:2px solid #99bbbb;border-radius:20px;box-shadow:0 8px 28px rgba(0,0,0,.28);
  display:flex;flex-direction:column;overflow:hidden;min-width:0}
.head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px 10px 16px;background:#eef3f6;border-bottom:1px solid #d3dde3}
.head h2{margin:0;font-size:20px;font-weight:700}
.head-right{display:flex;align-items:center;gap:8px}
.head-btn{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:6px 14px;border:2px solid #99bbbb;border-radius:22px;
  background:#fff;color:#1f2933;font:inherit;font-size:16px;font-weight:600;cursor:pointer}
.head-btn:focus-visible{outline:3px solid #ffb703;outline-offset:2px}
.x{width:48px;height:48px;border-radius:50%;border:0;background:#fff;font-size:22px;line-height:1}
.list{flex:1;overflow-y:auto;overflow-x:hidden;padding:12px;display:flex;flex-direction:column;gap:10px;min-height:80px}
.msg{max-width:88%;padding:10px 14px;border-radius:18px;font-size:17px;white-space:pre-wrap;overflow-wrap:anywhere}
.msg.user{align-self:flex-end;background:#d9f2e4;border-bottom-right-radius:6px}
.msg.tusk{align-self:flex-start;background:#eceff2;border-bottom-left-radius:6px}
.chip{align-self:flex-start;max-width:96%;padding:4px 12px;border:1.5px dashed #9aa8b4;border-radius:14px;font-size:14px;color:#52606d;overflow-wrap:anywhere}
.chip .ic{margin-right:6px}
.notice{align-self:stretch;background:#fff4d6;border:1px solid #f0d58a;border-radius:12px;padding:10px 14px;font-size:16px;overflow-wrap:anywhere}
.q{align-self:stretch;background:#f3f8fb;border:2px solid #99bbbb;border-radius:16px;padding:12px}
.q .qt{font-size:17px;font-weight:600;overflow-wrap:anywhere}
.q .btns{display:flex;gap:10px;margin-top:10px;flex-wrap:wrap}
.q .res{margin-top:8px;font-size:14px;color:#52606d}
.think{align-self:flex-start;color:#52606d;font-size:15px;padding:4px 8px}
.compose{display:flex;gap:8px;padding:10px 8px;border-top:1px solid #d3dde3;align-items:center}
.compose input{flex:1;min-width:0;height:52px;border-radius:26px;border:2px solid #99bbbb;padding:0 14px;font-size:18px;background:#fff}
.compose .send{min-width:76px}
.mic{width:52px;height:52px;border-radius:50%;border:2px solid #99bbbb;background:#fff;font-size:24px;flex:none;padding:0}
.mic.on{background:#2f9e6d;border-color:#2f9e6d}
.foot{padding:6px 14px 10px;font-size:13px;color:#52606d;text-align:center}

/* Settings */
.set{padding:10px 14px 12px;display:flex;flex-direction:column;gap:8px;overflow-y:auto}
.set label.f{display:flex;flex-direction:column;gap:4px;font-weight:600}
.set select{height:44px;border-radius:12px;border:2px solid #99bbbb;padding:0 10px;font-size:17px;background:#fff}
.modes{display:flex;flex-direction:column;gap:8px}
.modecard{text-align:left;border:2px solid #c3d0d8;border-radius:14px;background:#fff;padding:8px 12px;min-height:48px;line-height:1.35}
.modecard[aria-checked="true"]{border-color:#2f9e6d;background:#eaf7f0}
.modecard b{display:block;font-size:17px}
.modecard span{font-size:14px;color:#52606d}
.toggle{display:flex;align-items:center;gap:12px;min-height:44px;font-weight:600}
.toggle input{width:28px;height:28px;flex:none}
.act{min-height:44px;border-radius:14px;border:2px solid #c3d0d8;background:#fff;font-size:16px;padding:8px 12px;text-align:left}

/* Target marks */
.hl,.ask-frame{position:fixed;border-radius:10px;border:4px solid #ffb703;box-shadow:0 0 0 4px rgba(255,183,3,.35);animation:pulse 1.6s ease-in-out infinite}
.ask-frame{border-color:#f97316;box-shadow:0 0 0 4px rgba(249,115,22,.35)}
.dim{position:fixed;border-radius:14px;box-shadow:0 0 0 200vmax rgba(0,0,0,.55)}
@keyframes pulse{0%,100%{box-shadow:0 0 0 3px rgba(255,183,3,.45)}50%{box-shadow:0 0 0 10px rgba(255,183,3,.12)}}

@media (prefers-reduced-motion:reduce){
  button.tusk,.bubble,.listen,.sw-track,.sw-knob{transition:none}
  button.tusk .breathe,.hl,.ask-frame{animation:none}
  .wave i{transition:none}
}
`;
