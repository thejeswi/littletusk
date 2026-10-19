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
button.tusk .breathe{width:100%;height:100%}
button.tusk svg{width:100%;height:100%;display:block;overflow:visible;filter:drop-shadow(0 2px 3px rgba(0,0,0,.25))}
button.tusk .pose-point{display:none}
button.tusk.pointing .pose-rest{display:none}
button.tusk.pointing .pose-point{display:block}

/* Tusk's moods: the SVG is built from parts; the mood class (m-*) on the button picks the moves */
:where(button.tusk) svg *{transform-box:fill-box}
:where(button.tusk) .body{transform-origin:50% 90%}
:where(button.tusk) .earL{transform-origin:90% 40%}:where(button.tusk) .earR{transform-origin:10% 40%}
:where(button.tusk) .trunk{transform-origin:50% 0%}:where(button.tusk) .eyes{transform-origin:50% 50%}
:where(button.tusk) .dots,:where(button.tusk) .rings,:where(button.tusk) .spark{opacity:0}
:where(button.tusk) .eyes{animation:blink 5s infinite}
.m-idle .body{animation:breathe 4s ease-in-out infinite}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
@keyframes blink{0%,93%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}

.m-hello .body{animation:hop .7s ease-out 2}
.m-hello .earL{animation:flapL .35s ease-in-out 4}.m-hello .earR{animation:flapR .35s ease-in-out 4}
@keyframes hop{0%,100%{transform:translateY(0)}40%{transform:translateY(-14px)}70%{transform:translateY(2px)}}
@keyframes flapL{50%{transform:rotate(-18deg)}}@keyframes flapR{50%{transform:rotate(18deg)}}

.m-listening .earL{transform:rotate(-14deg) scale(1.08);transition:transform .4s}
.m-listening .earR{transform:rotate(14deg) scale(1.08);transition:transform .4s}
.m-listening .body{animation:tilt 2.4s ease-in-out infinite}
.m-listening .rings{opacity:1}.m-listening .rings path{animation:ring 1.4s ease-out infinite}
.m-listening .rings path:nth-child(2){animation-delay:.45s}
@keyframes tilt{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(-1deg)}}
@keyframes ring{0%{opacity:0;transform:translateX(10px)}40%{opacity:1}100%{opacity:0;transform:translateX(-4px)}}

.m-thinking .eyes{transform:translateY(-3px);animation:none}
.m-thinking .trunk{animation:curl 1.6s ease-in-out infinite}
.m-thinking .dots{opacity:1}.m-thinking .dots circle{animation:dot 1.2s ease-in-out infinite}
.m-thinking .dots circle:nth-child(2){animation-delay:.2s}.m-thinking .dots circle:nth-child(3){animation-delay:.4s}
@keyframes curl{0%,100%{transform:rotate(0)}50%{transform:rotate(-14deg)}}
@keyframes dot{0%,100%{transform:translateY(0);opacity:.4}50%{transform:translateY(-6px);opacity:1}}

.m-speaking .trunk{animation:sway .45s ease-in-out infinite}
.m-speaking .cheek{animation:glow .9s ease-in-out infinite}
.m-speaking .rings{opacity:1}.m-speaking .rings path{animation:ring .9s ease-out infinite}
@keyframes sway{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(6deg)}}
@keyframes glow{50%{opacity:1}}

.m-done .body{animation:hop .6s ease-out 3}
.m-done .earL{animation:flapL .3s ease-in-out 6}.m-done .earR{animation:flapR .3s ease-in-out 6}
.m-done .spark{opacity:1;animation:spark 1.6s ease-out 2}
@keyframes spark{0%{transform:scale(.4);opacity:0}30%{opacity:1}100%{transform:scale(1.3);opacity:0}}

.m-sorry .body{transform:translateY(6px) rotate(-5deg);transition:transform .6s}
.m-sorry .earL{transform:rotate(16deg);transition:transform .6s}.m-sorry .earR{transform:rotate(-16deg);transition:transform .6s}
.m-sorry .eyes{transform:translateY(2px) scaleY(.6);animation:none}

/* walking over to point: a soft bob while gliding (set only during the move) */
.walking .body{animation:step .32s ease-in-out infinite}
@keyframes step{50%{transform:translateY(-4px) rotate(2deg)}}

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

/* E1: the microphone badge on Tusk. 30 px visible, 48 px to click or tap. */
button.talk{position:fixed;z-index:3;width:48px;height:48px;padding:0;border:0;background:transparent;cursor:pointer;
  /* only a 44 px circle around the visible dot is clickable, so Tusk's body behind it stays clickable too */
  clip-path:circle(22px at calc(100% - 19px) calc(100% - 19px))}
button.talk .dot{position:absolute;right:4px;bottom:4px;display:grid;place-items:center;width:30px;height:30px;border-radius:50%;
  background:#fff;border:2px solid #2f9e6d;color:#1f2933;font-size:14px;line-height:1;box-shadow:0 2px 6px rgba(0,0,0,.25)}
button.talk.on .dot{background:#b42318;border-color:#b42318;color:#fff;box-shadow:0 0 0 6px rgba(180,35,24,.18)}
button.talk:focus-visible{outline:none}
button.talk:focus-visible .dot{outline:3px solid #ffb703;outline-offset:3px}

/* F1: captions of a spoken conversation. */
.caps{position:fixed;z-index:2;width:min(260px,calc(100vw - 24px));background:#fff;border:2px solid #99bbbb;border-radius:16px;
  padding:10px 12px;font-size:15px;line-height:1.4;box-shadow:0 4px 14px rgba(0,0,0,.18);
  transition:left .6s ease-in-out,top .6s ease-in-out}
.caps .cap-line{overflow-wrap:anywhere;margin-bottom:4px}
.caps .who{font-weight:700}
.caps .cap-status{color:#52606d;margin-top:6px}
.caps .bar{height:8px;border-radius:4px;background:#e3e8ec;overflow:hidden;margin:7px 0 2px}
.caps .bar i{display:block;height:100%;width:40%;background:#2f9e6d}
.caps .bar.indeterminate i{animation:bar 1.2s ease-in-out infinite}
.caps .cap-actions{margin-top:8px}
.caps .btn.stop{min-height:44px;font-size:15px}
@keyframes bar{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}

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
.head-right{display:flex;align-items:center;gap:8px;margin-left:auto}
.head-btn{white-space:nowrap}
@media (max-width:480px){
  .head{flex-wrap:wrap}
  .head h2{flex:1}
  .head-right{order:3;flex-basis:100%;margin-left:0}
  .head-right .head-btn{flex:1;justify-content:center}
}
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
.compose-frame{flex:1;min-width:0;height:128px;border:0;background:transparent;color-scheme:normal}
.mic{width:52px;height:52px;border-radius:50%;border:2px solid #99bbbb;background:#fff;font-size:24px;flex:none;padding:0}
.mic.on{background:#2f9e6d;border-color:#2f9e6d}
.foot{padding:6px 14px 10px;font-size:13px;color:#52606d;text-align:center}

/* Settings */
.set{padding:10px 14px 12px;display:flex;flex-direction:column;gap:6px;overflow-y:auto}
.set label.f{display:flex;flex-direction:column;gap:4px;font-weight:600}
.set select{height:44px;border-radius:12px;border:2px solid #99bbbb;padding:0 10px;font-size:17px;background:#fff}
.modes{display:flex;flex-direction:column;gap:8px}
.modecard{text-align:left;border:2px solid #c3d0d8;border-radius:14px;background:#fff;padding:8px 12px;min-height:48px;line-height:1.35}
.modecard[aria-checked="true"]{border-color:#2f9e6d;background:#eaf7f0}
.modecard b{display:block;font-size:17px}
.modecard span{font-size:14px;color:#52606d}
.toggle{display:flex;align-items:center;gap:12px;min-height:44px;font-weight:600}
.toggle input{width:28px;height:28px;flex:none}
.speak-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.speak-row .act{min-height:44px;padding:4px 14px;font-size:16px;border-radius:22px;border:2px solid #99bbbb;background:#fff;font-weight:600}
.voice-line{margin:2px 0 6px;font-size:15px;line-height:1.35}
.voice-line.ok{color:#1a7f4b;font-weight:600}
.voice-line.warn{color:#b42318;font-weight:600}
.act{min-height:44px;border-radius:14px;border:2px solid #c3d0d8;background:#fff;font-size:16px;padding:8px 12px;text-align:left}

/* Target marks */
.hl,.ask-frame{position:fixed;border-radius:10px;border:4px solid #ffb703;box-shadow:0 0 0 4px rgba(255,183,3,.35);animation:pulse 1.6s ease-in-out infinite}
.ask-frame{border-color:#f97316;box-shadow:0 0 0 4px rgba(249,115,22,.35)}
.dim{position:fixed;border-radius:14px;box-shadow:0 0 0 200vmax rgba(0,0,0,.55)}
@keyframes pulse{0%,100%{box-shadow:0 0 0 3px rgba(255,183,3,.45)}50%{box-shadow:0 0 0 10px rgba(255,183,3,.12)}}

@media (prefers-reduced-motion:reduce){
  button.tusk,.bubble,.listen,.sw-track,.sw-knob{transition:none}
  .hl,.ask-frame{animation:none}
  button.tusk svg *{animation:none!important;transition:none!important}
  .wave i{transition:none}
}
`;
