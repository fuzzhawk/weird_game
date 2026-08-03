'use strict';
/* ============================================================
   SEED & SAGE — creator.js
   The FORGE YOUR KIND screen: shown before the world generator.
   The player designs their creature (from the Creature Forge
   template + the expanded parts), picks starting traits and
   abilities, and the world is later peopled with variations of it.
   Stores the choice on window.PLAYER_KIND.
   ============================================================ */
const Creator = (function(){
  const $=id=>document.getElementById(id);
  let params=null, traits=[], abilities=[], onDone=null;
  let pvRAF=null, pvDir=0, spr=null, sprKey='', lastT=0, autoT=0;

  // starting abilities → hero perks (applied in surface.applyPlayerKind)
  const ABIL={
    swift:{n:'Swift',d:'quicker afoot'},
    tough:{n:'Tough',d:'+2 hearts'},
    fierce:{n:'Fierce',d:'harder hits'},
    reach:{n:'Long Reach',d:'wider strike'},
    lucky:{n:'Lucky',d:'better finds'},
    hardy:{n:'Hardy',d:'faster stamina'},
  };
  const PARTS=[['earType','Ears'],['hornType','Horns'],['hairType','Hair'],['tailType','Tail'],['cloth','Garment'],['tex','Skin']];
  const TRAIT_KEYS=['brave','kind','creative','curious','ambitious','hardworking','charming','cheerful','loyal','lucky','commanding','dreamer','passionate','grumpy','stubborn','rebellious'];
  const MAXTRAITS=3, MAXABIL=2;

  function optsFor(k){ const s=CF.SCHEMA.find(s=>s.k===k); return s?s.opts:[]; }
  function baseParams(name){ return {...CF.defaultParams(), ...(CF.PRESETS[name]||{}), size:48, seed:'kin-'+name+'-'+((Math.random()*1e5)|0)}; }

  function build(){
    if($('forge')) return;
    const st=document.createElement('style');
    st.textContent=`
    #forge{position:fixed;inset:0;z-index:130;overflow-y:auto;background:radial-gradient(120% 90% at 50% -10%,#20182c,#0c0a12 70%);color:#e8e2d5;font-family:system-ui,-apple-system,sans-serif}
    #forge .fwrap{max-width:560px;margin:0 auto;padding:calc(18px + env(safe-area-inset-top)) 16px 40px}
    #forge h1{font-size:22px;letter-spacing:.03em;margin:0 0 2px;text-align:center;color:#e7d9ff}
    #forge .sub{font-size:12px;color:#a99fc0;text-align:center;margin:0 0 14px}
    #forge .fsec{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8b7f9c;margin:16px 0 7px}
    #fpvWrap{display:flex;justify-content:center;margin:6px 0 4px}
    #fpv{width:180px;height:180px;image-rendering:pixelated;background:linear-gradient(#241d33,#161020);border:1px solid #362a4c;border-radius:14px}
    #forge .chips{display:flex;flex-wrap:wrap;gap:6px}
    #forge .chip{background:linear-gradient(#3a3049,#241d2e);border:1px solid #120e19;color:#cdbfe0;font-size:12px;letter-spacing:.02em;padding:8px 11px;border-radius:9px;cursor:pointer;line-height:1}
    #forge .chip:active{transform:translateY(1px)}
    #forge .chip.on{background:linear-gradient(#4a2f6a,#2e1c46);color:#e7d0ff;border-color:#7a4fb0;box-shadow:inset 0 1px 0 #8a5fc0}
    #forge .chip small{display:block;color:#9a8fb0;font-size:9.5px;letter-spacing:0;margin-top:2px}
    #forge .prow{display:flex;align-items:center;gap:8px;margin:5px 0}
    #forge .prow label{flex:0 0 74px;font-size:11.5px;color:#a99fc0}
    #forge select{flex:1;background:#191322;border:1px solid #3c2f52;border-radius:8px;color:#dcd2ef;padding:7px 8px;font-size:12.5px}
    #forge input[type=range]{flex:1;-webkit-appearance:none;appearance:none;height:6px;border-radius:99px;background:#2a2038;outline:none}
    #forge input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#c9a6ff;border:2px solid #1a1226;cursor:pointer}
    #fHue{background:linear-gradient(90deg,#e05a5a,#e0c85a,#5ae06a,#5ac8e0,#6a5ae0,#e05ad0,#e05a5a)}
    #forge .frow{display:flex;gap:8px}
    #forge .btn{background:linear-gradient(#3a3049,#241d2e);border:1px solid #120e19;color:#cdbfe0;font-size:12.5px;letter-spacing:.06em;padding:11px;border-radius:10px;cursor:pointer;flex:1}
    #fEnter{width:100%;margin-top:18px;background:linear-gradient(#4a2f6a,#2e1c46);border:2px solid #7a4fb0;color:#f0e2ff;font-size:15px;font-weight:700;letter-spacing:.06em;padding:14px;border-radius:11px;cursor:pointer}
    #fEnter:active{transform:translateY(1px)}
    #forge .hint{font-size:10.5px;color:#8b7f9c;margin-top:4px}
    `;
    document.head.appendChild(st);
    const d=document.createElement('div'); d.id='forge';
    d.innerHTML=`<div class="fwrap">
      <h1>Forge your kind</h1>
      <div class="sub">Design the folk who will people your world.</div>
      <div id="fpvWrap"><canvas id="fpv" width="90" height="90"></canvas></div>
      <div class="frow"><button class="btn" id="fRand">🎲 Surprise me</button><button class="btn" id="fSpin">↻ Turn</button></div>
      <div class="fsec">Kind</div><div class="chips" id="fPresets"></div>
      <div class="fsec">Form</div><div id="fParts"></div>
      <div class="prow"><label>Hue</label><input type="range" id="fHue" min="0" max="360" step="1"></div>
      <div class="prow"><label>Vividness</label><input type="range" id="fSat" min="0" max="100" step="1"></div>
      <div class="prow"><label>Build</label><input type="range" id="fSize" min="5.5" max="9.5" step="0.5"></div>
      <div class="fsec">Nature — pick up to ${MAXTRAITS}</div><div class="chips" id="fTraits"></div>
      <div class="fsec">Gift — pick up to ${MAXABIL}</div><div class="chips" id="fAbil"></div>
      <button id="fEnter">Shape your world →</button>
      <div class="hint">Your kind carries into the world: the hero is one of them, and the first village is filled with their variations.</div>
    </div>`;
    document.body.appendChild(d);

    // presets
    const pc=$('fPresets');
    for(const name of Object.keys(CF.PRESETS)){ const b=document.createElement('button');
      b.className='chip'; b.textContent=name; b.dataset.preset=name;
      b.onclick=()=>setPreset(name); pc.appendChild(b); }
    // part selects
    const pp=$('fParts');
    for(const [k,label] of PARTS){ const row=document.createElement('div'); row.className='prow';
      const l=document.createElement('label'); l.textContent=label;
      const sel=document.createElement('select'); sel.id='fpart_'+k;
      for(const o of optsFor(k)){ const opt=document.createElement('option'); opt.value=o; opt.textContent=o; sel.appendChild(opt); }
      sel.onchange=()=>{ params[k]=sel.value; rebuild(); };
      row.appendChild(l); row.appendChild(sel); pp.appendChild(row); }
    // traits
    const tc=$('fTraits');
    for(const t of TRAIT_KEYS){ const b=document.createElement('button'); b.className='chip'; b.textContent=t;
      b.onclick=()=>toggleTrait(t,b); tc.appendChild(b); }
    // abilities
    const ac=$('fAbil');
    for(const k in ABIL){ const b=document.createElement('button'); b.className='chip';
      b.innerHTML=ABIL[k].n+'<small>'+ABIL[k].d+'</small>'; b.dataset.abil=k;
      b.onclick=()=>toggleAbil(k,b); ac.appendChild(b); }
    // sliders
    $('fHue').oninput=()=>{ params.hue=+$('fHue').value; rebuild(); };
    $('fSat').oninput=()=>{ params.sat=+$('fSat').value; rebuild(); };
    $('fSize').oninput=()=>{ params.bodyH=+$('fSize').value; rebuild(); };
    $('fRand').onclick=randomize;
    $('fSpin').onclick=()=>{ pvDir=(pvDir+1)%8; };
    $('fEnter').onclick=enter;
  }

  function syncControls(){
    for(const [k] of PARTS){ const sel=$('fpart_'+k); if(sel)sel.value=params[k]; }
    $('fHue').value=params.hue; $('fSat').value=params.sat; $('fSize').value=params.bodyH;
    for(const b of $('fPresets').children) b.classList.toggle('on', b.dataset.preset===params._preset);
  }
  function setPreset(name){ params=baseParams(name); params._preset=name; rebuild(); syncControls(); }
  function randomize(){
    const KEEP=new Set(['size','scale','outline','walkFrames','_preset']);
    const COLOR=new Set(['hue','hue2','sat','lit','accent','hairHue','clothHue','metalHue']);
    for(const s of CF.SCHEMA){ if(KEEP.has(s.k))continue;
      if(s.t==='r') params[s.k]=+(s.min+(Math.random()*Math.round((s.max-s.min)/s.st)|0)*s.st).toFixed(2);
      else if(s.t==='sel'){ if(s.opts.includes('none')&&Math.random()<.35)params[s.k]='none'; else params[s.k]=s.opts[Math.random()*s.opts.length|0]; }
      else params[s.k]=Math.random()<.4; }
    params.seed='kin-'+((Math.random()*1e6)|0); rebuild(); syncControls();
  }
  function toggleTrait(t,b){ const i=traits.indexOf(t);
    if(i>=0){ traits.splice(i,1); b.classList.remove('on'); }
    else if(traits.length<MAXTRAITS){ traits.push(t); b.classList.add('on'); } }
  function toggleAbil(k,b){ const i=abilities.indexOf(k);
    if(i>=0){ abilities.splice(i,1); b.classList.remove('on'); }
    else if(abilities.length<MAXABIL){ abilities.push(k); b.classList.add('on'); } }

  function rebuild(){ sprKey=''; }   // force re-bake on next preview frame

  function drawPreview(){
    const cv=$('fpv'); if(!cv||!params)return; const g=cv.getContext('2d'); g.imageSmoothingEnabled=false;
    const key=JSON.stringify(params);
    if(key!==sprKey){ try{ spr=CFHelp.bakeCreature({...params,size:64},64); sprKey=key; }catch(e){ spr=null; } }
    g.clearRect(0,0,cv.width,cv.height);
    if(!spr)return;
    const F=spr.FRAMES.walk[pvDir]||spr.FRAMES.walk[0]; const fr=F[(autoT*7|0)%F.length];
    g.drawImage(fr, (cv.width-fr.width)/2|0, (cv.height-fr.height)/2|0);
  }
  function loop(t){ pvRAF=requestAnimationFrame(loop);
    const dt=Math.min(0.05,(t-(lastT||t))/1000); lastT=t; autoT+=dt;
    if(autoT-((autoT/1.4|0)*1.4)<dt) pvDir=(pvDir+1)%8;   // auto-rotate ~every 1.4s
    drawPreview(); }

  function show(){ build(); const f=$('forge'); if(f)f.style.display='block';
    if(!pvRAF){ lastT=0; pvRAF=requestAnimationFrame(loop); } }
  function hide(){ const f=$('forge'); if(f)f.style.display='none'; if(pvRAF){cancelAnimationFrame(pvRAF);pvRAF=null;} }

  function enter(){
    window.PLAYER_KIND={ params:{...params}, traits:traits.slice(), abilities:abilities.slice() };
    delete window.PLAYER_KIND.params._preset;
    hide(); if(onDone)onDone();
  }
  function boot(done){ onDone=done; traits=[]; abilities=[]; show(); setPreset('Villager'); }

  return { boot, show, hide, get kind(){return window.PLAYER_KIND||null;} };
})();
if(typeof window!=='undefined')window.Creator=Creator;
