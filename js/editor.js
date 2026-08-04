'use strict';
/* ============================================================
   SEED & SAGE — editor.js
   The Gardener's Bench: a pull-down drawer for randomizing the
   world and editing individual entities. Tap anything on the
   surface (a person, monster, Understory, shop, plant, village)
   and its edit tools appear here.
   ============================================================ */
const Editor = (function(){
const $=id=>document.getElementById(id);
let open=false, pollT=null;
const A=()=>Surface.api;

function setOpen(v){
  open=v;
  $('edPanel').classList.toggle('open',v);
  $('edScrim').classList.toggle('open',v);
  if(v){refresh();pollT=setInterval(refresh,700)}
  else if(pollT){clearInterval(pollT);pollT=null}
}
function btn(label,fn,cls){
  const b=document.createElement('button');
  b.className='fb'+(cls?' '+cls:'');
  b.textContent=label;
  b.onclick=fn;
  return b;
}
function row(...btns){
  const d=document.createElement('div');d.className='btnrow';
  for(const b of btns)d.appendChild(b);
  return d;
}
let forgePreview=null;
function drawForgePreview(){
  const cv=$('edForgeCanvas'); if(!cv||!forgePreview) return;
  const c=cv.getContext('2d'); c.imageSmoothingEnabled=false; c.clearRect(0,0,cv.width,cv.height);
  if(forgePreview._params){
    const tmp=A().TF.bakeParams(forgePreview._params,32,performance.now()*0.004);
    c.drawImage(tmp,0,0,cv.width,cv.height);
  }else if(forgePreview._iconBase){
    c.drawImage(forgePreview._iconBase,0,0,cv.width,cv.height);
  }
  $('edForgeName').textContent=forgePreview.n;
  $('edForgeSkill').textContent='skill: '+forgePreview.skill+(forgePreview.treasure?' · +'+forgePreview.treasure.amt+' '+forgePreview.treasure.res+'/day':'');
  $('edForgeDesc').textContent=forgePreview.d;
}
function reforge(){ forgePreview=A().forgeRelic(); drawForgePreview(); }
let animalPreview=null;
function drawAnimalPreview(){
  const cv=$('edAnimalCanvas'); if(!cv||!animalPreview||!animalPreview._preview) return;
  const c=cv.getContext('2d'); c.imageSmoothingEnabled=false; c.clearRect(0,0,cv.width,cv.height);
  const F=animalPreview._preview.FRAMES.walk[0], n=F.length;
  const img=F[Math.floor(performance.now()*0.006)%n];
  const s=(animalPreview.sizeScale||1)*(animalPreview.flyer?2.3:1.05), w=img.width*s, h=img.height*s;
  c.drawImage(img,(cv.width-w)/2,(cv.height-h)/2,w,h);
  $('edAnimalName').textContent=animalPreview.name+' the '+animalPreview.spec.label;
  if(animalPreview.flyer)
    $('edAnimalTemper').textContent=(animalPreview.kind==='bird'?'🐦 bird':'🦋 insect')+(animalPreview.spec.flock?' · flocks together':' · solitary');
  else
    $('edAnimalTemper').textContent=animalPreview.spec.temper+(animalPreview.spec.dmg?' · bite '+animalPreview.spec.dmg:' · harmless');
}
function reforgeAnimal(){ animalPreview=A().forgeAnimal(); drawAnimalPreview(); }
function reforgeFlyer(){ animalPreview=A().forgeFlyer(); drawAnimalPreview(); }
function refresh(){
  if(!open)return;
  const era=A().era?A().era():null, ts=A().tileStyle?A().tileStyle():null;
  // world line
  $('edWorldNote').innerHTML='seed '+A().seed+' · '+A().people().length+' folk · '
    +A().monsters().length+' risen · '+A().dungeons().length+' understories · '
    +A().villages().length+' villages'+(A().peaceful?' · ☮ peace held':'')
    +' · 🔩'+A().heroRelics().length+' sage augments'
    +(era?'<br><b style="color:#a0e08f">'+era.name+'</b> ('+Math.round(era.green*100)+'% green)'
      +(ts?' · tiles: '+ts.name+' / '+ts.edge+' edge':''):'');
  $('edPeaceBtn').textContent=A().peaceful?'☮ Peace: ON':'☮ Peace: off';
  drawForgePreview();
  drawAnimalPreview();
  renderSelected();
}
function renderSelected(){
  const box=$('edSelected');
  const li=A().lastInspect;
  box.innerHTML='';
  const title=document.createElement('div');title.className='grpTitle';
  if(!li){
    title.textContent='Selected — tap anything out in the garden first';
    box.appendChild(title);
    return;
  }
  if(li.type==='person'){
    const p=li.obj;
    title.textContent='Selected · '+(p.dead?'🪦 ':'')+p.name+' ('+p.traits.join(', ')+')';
    box.appendChild(title);
    if(!p.dead){
      box.appendChild(row(
        btn('✏ Rename',()=>{const nm=prompt('A new name for '+p.name+':',p.name);if(nm)A().renamePerson(p,nm.trim())}),
        btn('🎲 Reroll traits',()=>A().rerollTraits(p)),
        btn('👤 Reroll look',()=>A().rerollLook(p))
      ));
      box.appendChild(row(
        btn('✨ Make whole',()=>A().healPerson(p)),
        btn('🎴 Deal a card',()=>A().dealCard(p)),
        btn('🥀 Unwrite',()=>{if(confirm('Quietly unwrite '+p.name+'?'))A().killPerson(p)},'warn')
      ));
    }
  }else if(li.type==='monster'){
    const m=li.obj;
    title.textContent='Selected · a '+m.name+' ('+Math.max(0,Math.round(m.hp))+' hp)';
    box.appendChild(title);
    box.appendChild(row(
      btn('🕊 Banish',()=>A().banishMonster(m)),
      btn('💢 Make worse',()=>A().empowerMonster(m),'warn')
    ));
  }else if(li.type==='dungeon'){
    const d=li.obj;
    title.textContent='Selected · '+d.name+' ('+d.depth+' floors'+(d.cleansed?', at rest':'')+')';
    box.appendChild(title);
    box.appendChild(row(
      btn(d.cleansed?'🌑 Rouse it':'🌿 Hush it',()=>A().cleanseDungeon(d)),
      btn('⬇ Deepen',()=>A().deepenDungeon(d)),
      btn('👹 Stir now',()=>A().stirDungeon(d),'warn')
    ));
  }else if(li.type==='building'){
    const b=li.obj;
    title.textContent='Selected · '+(b.name||('a '+b.tp));
    box.appendChild(title);
    if(b.tp!=='grave')box.appendChild(row(btn('🏚 Unbuild',()=>{if(confirm('Unbuild this '+(b.name||b.tp)+'?'))A().demolishBuilding(b)},'warn')));
  }else if(li.type==='node'){
    const n=li.obj;
    title.textContent='Selected · a '+({berry:'thoughtfruit tangle',mush:'philosophercap cluster',tree:'whistling cane',rock:'hillbone'}[n.t]||n.t);
    box.appendChild(title);
    box.appendChild(row(btn('🌱 Replenish',()=>A().replenishNode(n))));
  }else if(li.type==='village'){
    const v=li.obj;
    title.textContent='Selected · '+v.name;
    box.appendChild(title);
    box.appendChild(row(btn('🎁 Fill granary',()=>A().fundVillage(v))));
  }
}
function init(){
  {const eb=$('edBtn'); if(eb)eb.onclick=()=>setOpen(!open);}   // opened from the HUD sim menu now
  $('edClose').onclick=()=>setOpen(false);
  $('edScrim').onclick=()=>setOpen(false);
  // --- world group ---
  const wg=$('edWorldBtns');
  wg.appendChild(row(
    btn('🎲 New world',()=>{if(confirm('Dream up an entirely new garden? The current one lets go.'))A().reseed()},'big')
  ));
  const seedline=document.createElement('div');seedline.className='seedline';
  const inp=document.createElement('input');inp.id='edSeedInput';inp.placeholder='world seed (number)';inp.inputMode='numeric';
  const setb=btn('Set',()=>{const v=parseInt(inp.value.trim(),10);if(!isNaN(v))A().reseed(v)});
  setb.style.flex='0 0 auto';setb.style.minWidth='70px';
  seedline.appendChild(inp);seedline.appendChild(setb);
  wg.appendChild(seedline);
  const pb=btn('☮ Peace: off',()=>{A().peaceful=!A().peaceful;refresh()});
  pb.id='edPeaceBtn';
  wg.appendChild(row(pb,btn('🌸 Ripen everything',()=>A().bloomAll())));
  wg.appendChild(row(
    btn('⏳ Turn the age',()=>{A().advanceEra();refresh()}),
    btn('🎨 Reroll ground',()=>{A().rerollTiles();refresh()})
  ));
  // --- spawn group ---
  $('edSpawnBtns').appendChild(row(
    btn('🚶 A wanderer arrives',()=>A().spawnSettler()),
    btn('🕳 Open an Understory',()=>A().digDungeon())
  ));
  $('edSpawnBtns').appendChild(row(
    btn('⛺ Land an expedition',()=>A().landExpedition()),
    btn('☠ Doom the town',()=>{if(confirm('Let this town die out? Its cities fall to ruin.'))A().collapseTown()},'warn')
  ));
  $('edSpawnBtns').appendChild(row(
    btn('🐛 Root grub',()=>A().spawnMonster('grub'),'warn'),
    btn('🦂 Pale creeper',()=>A().spawnMonster('lurker'),'warn'),
    btn('👹 Horror',()=>A().spawnMonster('horror'),'warn')
  ));
  // --- looks group ---
  $('edLookBtns').appendChild(row(
    btn('🧙 Reroll the Sage',()=>A().rerollHero()),
    btn('👥 Reroll all folk',()=>A().rerollFolk())
  ));
  $('edLookBtns').appendChild(row(
    btn('🌿 Reroll flora',()=>A().rerollFlora()),
    btn('👾 Reroll monsters',()=>A().rerollMonsters())
  ));
  // --- Tech Forge group ---
  forgePreview=A().forgeRelic();
  $('edForgeBtns').appendChild(row(
    btn('🎲 Reforge',()=>reforge(),'big')
  ));
  $('edForgeBtns').appendChild(row(
    btn('🦾 Install on Sage',()=>{A().giveHeroRelic(forgePreview);reforge()}),
    btn('🧑 Give to selected',()=>{
      const p=A().selected;
      if(!p||p.dead){A().toast('Tap a living villager first.');return}
      A().givePersonRelic(p,forgePreview);reforge();
    })
  ));
  $('edForgeBtns').appendChild(row(
    btn('📡 Scatter salvage in the world',()=>A().scatterSalvage())
  ));
  drawForgePreview();
  // --- Animal Forge group ---
  animalPreview=A().forgeAnimal();
  $('edAnimalBtns').appendChild(row(
    btn('🎲 Reforge',()=>reforgeAnimal(),'big')
  ));
  $('edAnimalBtns').appendChild(row(
    btn('🐾 Release into the world',()=>{A().spawnAnimalMade(animalPreview);animalPreview.flyer?reforgeFlyer():reforgeAnimal()}),
    btn('🌿 Populate fauna',()=>A().populateFauna())
  ));
  $('edAnimalBtns').appendChild(row(
    btn('🐦 Forge a flyer',()=>reforgeFlyer()),
    btn('🕊 Release a flock',()=>A().releaseFlock()),
    btn('🦋 Fill the skies',()=>A().populateFlyers())
  ));
  const glyphs={deer:'🦌',rabbit:'🐇',fowl:'🐓',boar:'🐗',fox:'🦊',wolf:'🐺'};
  const sp=$('edAnimalSpecies'); const chips=[];
  for(const k of A().AF.KEYS) chips.push(btn((glyphs[k]||'🐾')+' '+k,()=>A().spawnAnimal(k)));
  sp.appendChild(row(...chips));
  drawAnimalPreview();
  buildSpaceForge();
}

/* ================= SPACE FORGE =================
   Tweak the procedural generation of enclosed spaces — buildings and
   dungeons alike — and watch the layout redraw live. */
const SF={mode:'rooms',W:44,H:32,roomCount:7,roomMin:4,roomMax:10,hallWidth:2,
          caveFill:0.56,caveSteps:4,structMix:0.6,mat:'brick',floorMat:'plank',
          mat2:'cutstone',natural:false,seed:1234};
let sfSpace=null;
function sfSlider(label,key,min,max,step,fmt){
  const wrap=document.createElement('div');
  wrap.style.cssText='display:flex;align-items:center;gap:8px;margin:3px 0';
  const l=document.createElement('span');
  l.style.cssText='flex:0 0 96px;font-size:10.5px;color:#8fa885';
  const val=()=>fmt?fmt(SF[key]):SF[key];
  l.textContent=label+' '+val();
  const inp=document.createElement('input');
  inp.type='range';inp.min=min;inp.max=max;inp.step=step;inp.value=SF[key];
  inp.style.cssText='flex:1;height:5px;border-radius:99px;background:#243021;-webkit-appearance:none;appearance:none;outline:none';
  inp.oninput=()=>{SF[key]=+inp.value;l.textContent=label+' '+val();sfRender();};
  wrap.appendChild(l);wrap.appendChild(inp);
  return wrap;
}
function sfSelect(label,key,opts){
  const wrap=document.createElement('div');
  wrap.style.cssText='display:flex;align-items:center;gap:8px;margin:3px 0';
  const l=document.createElement('span');
  l.style.cssText='flex:0 0 96px;font-size:10.5px;color:#8fa885';l.textContent=label;
  const sel=document.createElement('select');
  sel.style.cssText='flex:1;background:#0c150a;border:1.5px solid #2c4a23;color:#a0e08f;border-radius:6px;padding:4px 6px;font-size:11px';
  for(const o of opts){const op=document.createElement('option');op.value=o;op.textContent=o;sel.appendChild(op);}
  sel.value=SF[key]; sel.onchange=()=>{SF[key]=sel.value;sfRender();};
  wrap.appendChild(l);wrap.appendChild(sel);
  return wrap;
}
function sfRender(){
  const cv=$('edSpaceCv'); if(!cv||typeof Interior==='undefined')return;
  const g=cv.getContext('2d'); g.imageSmoothingEnabled=false;
  g.fillStyle='#0c150a'; g.fillRect(0,0,cv.width,cv.height);
  try{
    sfSpace=Interior.generate({mode:SF.mode,W:SF.W|0,H:SF.H|0,res:8,seed:SF.seed|0,
      roomCount:SF.roomCount|0,roomMin:SF.roomMin|0,roomMax:SF.roomMax|0,hallWidth:SF.hallWidth|0,
      caveFill:SF.caveFill,caveSteps:SF.caveSteps|0,structMix:SF.structMix,
      mat:SF.mat,mat2:SF.mat2,floorMat:SF.floorMat,natural:SF.mode==='cave',
      edge:SF.mode==='cave'?'rough':'beveled'});
    const bg=sfSpace.bake();
    const s=Math.min(cv.width/bg.width,cv.height/bg.height);
    g.drawImage(bg,0,0,bg.width,bg.height,
      ((cv.width-bg.width*s)/2)|0,((cv.height-bg.height*s)/2)|0,(bg.width*s)|0,(bg.height*s)|0);
    let wall=0; for(let i=0;i<sfSpace.W*sfSpace.H;i++) if(sfSpace.solid[i])wall++;
    const inf=$('edSpaceInfo');
    if(inf) inf.innerHTML='<b style="color:#a0e08f">'+SF.mode+'</b><br>'+
      SF.W+'×'+SF.H+' tiles<br>rooms: '+sfSpace.rooms.length+
      '<br>open: '+sfSpace.openCells().length+'<br>wall: '+Math.round(wall/(sfSpace.W*sfSpace.H)*100)+'%'+
      '<br>walls: '+SF.mat+'<br>floors: '+(SF.floorMat||SF.mat);
  }catch(e){ g.fillStyle='#d66'; g.font='10px monospace'; g.fillText('gen error: '+e.message,6,16); }
}
function buildSpaceForge(){
  const host=$('edSpaceCtl'); if(!host||typeof Interior==='undefined')return;
  const mats=(typeof StructForge!=='undefined')?StructForge.PRESETS:['cutstone'];
  host.appendChild(row(
    btn('🏛 Rooms',()=>{SF.mode='rooms';sfRender()}),
    btn('🕳 Cave',()=>{SF.mode='cave';sfRender()}),
    btn('🎲 Reseed',()=>{SF.seed=(Math.random()*1e6)|0;sfRender()})
  ));
  host.appendChild(sfSlider('Width','W',18,64,1));
  host.appendChild(sfSlider('Height','H',14,48,1));
  host.appendChild(sfSlider('Rooms','roomCount',1,14,1));
  host.appendChild(sfSlider('Room min','roomMin',3,9,1));
  host.appendChild(sfSlider('Room max','roomMax',4,16,1));
  host.appendChild(sfSlider('Hall width','hallWidth',1,4,1));
  host.appendChild(sfSlider('Cave fill','caveFill',0.40,0.68,0.005,v=>v.toFixed(3)));
  host.appendChild(sfSlider('Cave smooth','caveSteps',1,6,1));
  host.appendChild(sfSlider('Built mix','structMix',0,1,0.05,v=>v.toFixed(2)));
  host.appendChild(sfSelect('Wall stuff','mat',mats));
  host.appendChild(sfSelect('Floor stuff','floorMat',mats));
  host.appendChild(sfSelect('Accent stuff','mat2',mats));
  host.appendChild(row(
    btn('🏠 Raise a building here',()=>{ if(A().forgeBuildingHere){ const r=A().forgeBuildingHere(SF); setOpen(false);
        if(r&&r.ok===false)alert(r.why||'no room for it here'); } },'big')
  ));
  sfRender();
}
return {init,setOpen,get open(){return open},get spaceParams(){return SF},sfRender};
})();
