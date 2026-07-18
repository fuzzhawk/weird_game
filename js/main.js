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

function loop(t){
  if(mode==='surface')Surface.frame(t);
  else Dungeon.frame(t);
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
