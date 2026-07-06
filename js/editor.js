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
function refresh(){
  if(!open)return;
  // world line
  $('edWorldNote').textContent='seed '+A().seed+' · '+A().people().length+' folk · '
    +A().monsters().length+' risen · '+A().dungeons().length+' understories · '
    +A().villages().length+' villages'+(A().peaceful?' · ☮ peace held':'')
    +' · 🔩'+A().heroRelics().length+' sage augments';
  $('edPeaceBtn').textContent=A().peaceful?'☮ Peace: ON':'☮ Peace: off';
  drawForgePreview();
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
  $('edBtn').onclick=()=>setOpen(!open);
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
  // --- spawn group ---
  $('edSpawnBtns').appendChild(row(
    btn('🚶 A wanderer arrives',()=>A().spawnSettler()),
    btn('🕳 Open an Understory',()=>A().digDungeon())
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
}
return {init,setOpen,get open(){return open}};
})();
