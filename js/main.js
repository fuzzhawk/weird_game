'use strict';
/* ============================================================
   SEED & SAGE — main.js
   World-select boot, mode switching between the surface garden
   and the Understory dungeons, plus the single animation loop.
   ============================================================ */
(function(){
let mode='surface', running=false;
const sui=document.getElementById('sui');
const dui=document.getElementById('dui');

function showSurface(){
  mode='surface';
  dui.classList.add('hidden');
  sui.classList.remove('hidden');
}
function showDungeon(){
  mode='dungeon';
  if(Surface.fp)Surface.fp.set(false);     // leave overworld first-person behind
  sui.classList.add('hidden');
  dui.classList.remove('hidden');
  Editor.setOpen(false);
}

/* ============================================================
   FIRST-PERSON CONTROLS — one input layer over whichever scene is
   active. Drag to look, WASD / arrows (or a left-thumb stick) to
   move along the gaze, tap or space to strike.
   ============================================================ */
function activeFP(){
  const m=(mode==='dungeon')?Dungeon.fp:Surface.fp;
  return (m&&m.active)?m:null;
}
const fpKeys=new Set();
const MOVEK=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'];
addEventListener('keydown',e=>{
  const k=(e.key||'').toLowerCase();
  if(MOVEK.includes(k)){ if(activeFP()){ fpKeys.add(k); e.preventDefault(); } }
  else if((k===' '||k==='enter')){ const fp=activeFP(); if(fp){ fp.strike(); e.preventDefault(); } }
});
addEventListener('keyup',e=>fpKeys.delete((e.key||'').toLowerCase()));
(function bindFPPointer(){
  const cvFP=document.getElementById('cvFP'); if(!cvFP)return;
  let lookPtr=null, tap=null;
  window.__fpMove=null;
  cvFP.addEventListener('pointerdown',e=>{
    if(!activeFP())return; try{cvFP.setPointerCapture(e.pointerId);}catch(_){}
    if(e.clientX<innerWidth*0.4 && !window.__fpMove){ window.__fpMove={id:e.pointerId,ox:e.clientX,oy:e.clientY,x:e.clientX,y:e.clientY}; }
    else { lookPtr={id:e.pointerId,x:e.clientX,y:e.clientY}; tap={t:performance.now(),moved:0}; }
    e.preventDefault();
  });
  cvFP.addEventListener('pointermove',e=>{
    const fp=activeFP(); if(!fp)return;
    if(lookPtr&&e.pointerId===lookPtr.id){ const dx=e.clientX-lookPtr.x, dy=e.clientY-lookPtr.y;
      lookPtr.x=e.clientX; lookPtr.y=e.clientY; fp.look(dx*0.005,-dy*0.55); if(tap)tap.moved+=Math.abs(dx)+Math.abs(dy); }
    const mv=window.__fpMove; if(mv&&e.pointerId===mv.id){ mv.x=e.clientX; mv.y=e.clientY; }
  });
  const end=e=>{
    if(lookPtr&&e.pointerId===lookPtr.id){ if(tap&&tap.moved<7&&performance.now()-tap.t<300){ const fp=activeFP(); if(fp)fp.strike(); } lookPtr=null; tap=null; }
    const mv=window.__fpMove; if(mv&&e.pointerId===mv.id) window.__fpMove=null;
  };
  cvFP.addEventListener('pointerup',end);
  cvFP.addEventListener('pointercancel',end);
  const sb=document.getElementById('fpStrike');
  if(sb)sb.addEventListener('pointerdown',e=>{ const fp=activeFP(); if(fp){fp.strike(); e.preventDefault(); e.stopPropagation();} });
})();
// fade the control hint a few seconds after first entering first person
let fpHintTimer=null;
function fpHintPoke(){ const h=document.getElementById('fpHint'); if(!h)return;
  h.classList.remove('gone'); clearTimeout(fpHintTimer);
  fpHintTimer=setTimeout(()=>h.classList.add('gone'),4200); }
window.fpHintPoke=fpHintPoke;
let fpLastT=0;
function applyFPInput(t){
  const fp=activeFP(); if(!fp){ fpLastT=t; return; }
  const dt=Math.min(0.05,(t-fpLastT)/1000)||0.016; fpLastT=t;
  let fwd=0,strafe=0;
  if(fpKeys.has('w')||fpKeys.has('arrowup'))fwd+=1;
  if(fpKeys.has('s')||fpKeys.has('arrowdown'))fwd-=1;
  if(fpKeys.has('d')||fpKeys.has('arrowright'))strafe+=1;
  if(fpKeys.has('a')||fpKeys.has('arrowleft'))strafe-=1;
  const mv=window.__fpMove;
  if(mv){ const R=46; fwd+=Math.max(-1,Math.min(1,-(mv.y-mv.oy)/R)); strafe+=Math.max(-1,Math.min(1,(mv.x-mv.ox)/R)); }
  if(fwd||strafe){ const L=Math.hypot(fwd,strafe)||1; fp.step(fwd/L,strafe/L,dt); }
}

Surface.onEnterDungeon=(dun)=>{
  showDungeon();
  Dungeon.enter(
    {name:dun.name, danger:dun.danger, depth:dun.depth, id:dun.id, ref:dun},
    (results)=>{
      showSurface();
      Surface.returnFromDungeon(results);
    }
  );
};

// a stray exception inside a frame must never kill the animation loop (that would
// freeze the game): catch it, log it, and keep the frames coming.
let loopErrs=0;
function loop(t){
  try{
    applyFPInput(t);
    if(mode==='surface')Surface.frame(t);
    else Dungeon.frame(t);
  }catch(e){
    if(loopErrs++<20)console.error('frame error (recovered):',e&&e.stack||e);
  }
  requestAnimationFrame(loop);
}

// dream up the chosen world and start (the loading screen has already trained Lore)
function enterWorld(cfg){
  Surface.api.reseed(cfg?cfg.seed:undefined, cfg?cfg.theme:undefined, cfg?cfg.params:undefined);
  showSurface();
  // age the world through a long history before handing the player the reins,
  // unless a caller explicitly opts out (e.g. automated tests: {warmup:false})
  if(!cfg||cfg.warmup!==false)Surface.api.beginWarmup();
  if(!running){ running=true; requestAnimationFrame(loop); }
}

Editor.init();
Worlds.boot(enterWorld);

// hooks for tinkering & automated smoke tests
window.GameDebug={
  Surface, Dungeon, Hero, Editor, Worlds, Lore, Mind,
  get mode(){return mode},
  enterWorld,                       // GameDebug.enterWorld({seed,theme}) skips the picker
  descendFirst(){
    const d=Surface.api.dungeons()[0];
    if(d){showDungeon();Dungeon.enter({name:d.name,danger:d.danger,depth:d.depth,id:d.id,ref:d},(r)=>{showSurface();Surface.returnFromDungeon(r)})}
    return d;
  },
  surfaceExit(){ if(Dungeon.active)Dungeon.exit(); },
};
})();
