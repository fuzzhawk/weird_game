'use strict';
/* ============================================================
   SEED & SAGE — main.js
   Mode switching between the surface garden and the
   Understory dungeons, plus the single animation loop.
   ============================================================ */
(function(){
let mode='surface';
const sui=document.getElementById('sui');
const dui=document.getElementById('dui');

function showSurface(){
  mode='surface';
  dui.classList.add('hidden');
  sui.classList.remove('hidden');
}
function showDungeon(){
  mode='dungeon';
  sui.classList.add('hidden');
  dui.classList.remove('hidden');
  Editor.setOpen(false);
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

Surface.init();
Editor.init();

function loop(t){
  if(mode==='surface')Surface.frame(t);
  else Dungeon.frame(t);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// hooks for tinkering & automated smoke tests
window.GameDebug={
  Surface, Dungeon, Hero, Editor,
  get mode(){return mode},
  descendFirst(){
    const d=Surface.api.dungeons()[0];
    if(d)Surface.onEnterDungeon?d:null;
    if(d){showDungeon();Dungeon.enter({name:d.name,danger:d.danger,depth:d.depth,id:d.id,ref:d},(r)=>{showSurface();Surface.returnFromDungeon(r)})}
    return d;
  },
  surfaceExit(){ if(Dungeon.active)Dungeon.exit(); },
};
})();
