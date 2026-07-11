'use strict';
/* ============================================================
   SEED & SAGE — relics.js
   TECH FORGE: a procedural pixel generator for technology
   relics (cyberware / salvaged machine-gods), a companion to
   the Plant Forge. Deterministic, DOM-free core.

   Each relic is a small machined icon — a hull with a glowing
   core, plus prongs / antennae / legs / fins / LEDs — and a
   game payload (a granted SKILL and, sometimes, a TREASURE
   trickle) carried in the CATALOG.
   ============================================================ */
const TF = (function(){
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;
  return((t^t>>>14)>>>0)/4294967296;}}
function hashStr(s){s=String(s);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
let worldRelicRot=0;                        // per-world hue rotation for relic neon
function setWorld(h){ worldRelicRot=((h||0)%360+360)%360; }
function rotHex(hex,deg){
  const n=parseInt(hex.slice(1),16), r=(n>>16)/255, g=((n>>8)&255)/255, b=(n&255)/255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2, d=mx-mn; let h=0,s=0;
  if(d){ s=l>0.5?d/(2-mx-mn):d/(mx+mn); h=mx===r?((g-b)/d+(g<b?6:0)):mx===g?((b-r)/d+2):((r-g)/d+4); h/=6; }
  h=(h+deg/360)%1; if(h<0)h+=1;
  const q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q, f=t=>{t=(t%1+1)%1;return t<1/6?p+(q-p)*6*t:t<1/2?q:t<2/3?p+(q-p)*(2/3-t)*6:p;};
  const to=v=>Math.round(v*255).toString(16).padStart(2,'0');
  return '#'+to(f(h+1/3))+to(f(h))+to(f(h-1/3));
}
function hash2(x,y){let h=(x*73856093 ^ y*19349663)>>>0; return (h%1024)/1024;}
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);

/* ---------- palettes: a metal ramp + a neon accent ---------- */
const PALETTES={
  chrome:{metal:['#242a31','#48525e','#7d8a9a','#b9c6d2'], neon:'#37e6ff', neon2:'#c6fbff'},
  gold:  {metal:['#3a2e12','#7a5f22','#c39a3a','#f2dc93'], neon:'#ffd166', neon2:'#fff4c6'},
  magenta:{metal:['#2a1830','#4c2c56','#7f5090','#c495d4'], neon:'#ff37c6', neon2:'#ffc6ef'},
  toxic: {metal:['#1c2a14','#38521f','#5f8a34','#a6d46a'], neon:'#a6ff37', neon2:'#e4ffc0'},
  cobalt:{metal:['#111a2e','#22385c','#3a5f92','#7aa6dc'], neon:'#3b83ff', neon2:'#bcd8ff'},
  ember: {metal:['#2c1410','#5a2a18','#8f4a26','#d18d5a'], neon:'#ff5a37', neon2:'#ffc4ad'},
  violet:{metal:['#1d1630','#352654','#5a4488','#9a86d6'], neon:'#9b5cff', neon2:'#d8c6ff'},
};
const PAL_KEYS=Object.keys(PALETTES);

/* ---------- structural presets ---------- */
// shape: box|round|diamond|oct|shard   core: none|orb|eye|screen|reactor|cross
const PRESETS={
  chip:   {shape:'box',   w:9, h:7,  core:'screen', prongs:0, antenna:false, legs:0, fins:false, blade:false, leds:3, screws:true},
  core:   {shape:'oct',   w:8, h:8,  core:'reactor',prongs:2, antenna:false, legs:0, fins:false, blade:false, leds:2, screws:true},
  orb:    {shape:'round', w:8, h:8,  core:'orb',    prongs:0, antenna:true,  legs:0, fins:false, blade:false, leds:1, screws:false},
  drone:  {shape:'box',   w:7, h:6,  core:'eye',    prongs:0, antenna:true,  legs:4, fins:true,  blade:false, leds:2, screws:true},
  cortex: {shape:'round', w:9, h:8,  core:'cross',  prongs:3, antenna:false, legs:0, fins:false, blade:false, leds:3, screws:false},
  cell:   {shape:'box',   w:6, h:9,  core:'reactor',prongs:2, antenna:false, legs:0, fins:false, blade:false, leds:2, screws:true},
  blade:  {shape:'shard', w:6, h:10, core:'eye',    prongs:0, antenna:false, legs:0, fins:true,  blade:true,  leds:1, screws:false},
  spider: {shape:'oct',   w:7, h:6,  core:'eye',    prongs:0, antenna:false, legs:6, fins:false, blade:false, leds:2, screws:true},
  key:    {shape:'diamond',w:7,h:9,  core:'orb',    prongs:1, antenna:false, legs:0, fins:false, blade:false, leds:2, screws:false},
  visor:  {shape:'box',   w:10,h:5,  core:'screen', prongs:0, antenna:true,  legs:0, fins:true,  blade:false, leds:3, screws:true},
};
const PRESET_KEYS=Object.keys(PRESETS);

function defaults(){ return {...PRESETS.chip, palette:'chrome', size:32, grime:0.35, seed:'relic'}; }
function randomParams(rng){
  const preset=PRESET_KEYS[(rng()*PRESET_KEYS.length)|0];
  return {...PRESETS[preset], palette:PAL_KEYS[(rng()*PAL_KEYS.length)|0],
    size:32, grime:0.2+rng()*0.4, preset, seed:'relic-'+((rng()*1e9)|0)};
}

/* ---------- hull mask ---------- */
function insideHull(dx,dy,shape,hw,hh){
  const ax=Math.abs(dx), ay=Math.abs(dy);
  if(shape==='round') return (dx*dx)/(hw*hw)+(dy*dy)/(hh*hh)<=1.02;
  if(shape==='diamond') return ax/hw+ay/hh<=1.0;
  if(shape==='oct') return ax<=hw && ay<=hh && (ax+ay)<=(hw+hh)-Math.min(hw,hh)*0.55;
  if(shape==='shard'){ // tall tapered blade, point up
    if(ay>hh) return false;
    const t=(dy+hh)/(2*hh);          // 0 at top, 1 at bottom
    return ax <= hw*(0.15+0.85*t);
  }
  // box (rounded)
  const r=Math.min(hw,hh)*0.42;
  if(ax<=hw-r || ay<=hh-r) return ax<=hw && ay<=hh;
  const cx=hw-r, cy=hh-r;
  return (ax-cx)*(ax-cx)+(ay-cy)*(ay-cy) <= r*r;
}

/* ---------- render ---------- */
function renderRelic(ctx, P, cell, phase, seedNum){
  const rng=mulberry32((seedNum!==undefined?seedNum:hashStr(P.seed))>>>0 || 1);
  let pal=PALETTES[P.palette]||PALETTES.chrome;
  if(worldRelicRot) pal={metal:pal.metal.map(c=>rotHex(c,worldRelicRot*0.4)),neon:rotHex(pal.neon,worldRelicRot),neon2:rotHex(pal.neon2,worldRelicRot)};
  const cx=cell/2, cy=cell/2 + 1;
  const pulse=0.5+0.5*Math.sin((phase||0));
  const px=(x,y,c)=>{ x|=0; y|=0; if(x<0||y<0||x>=cell||y>=cell)return; ctx.fillStyle=c; ctx.fillRect(x,y,1,1); };
  const rect=(x,y,w,h,c)=>{ ctx.fillStyle=c; ctx.fillRect(x|0,y|0,w|0,h|0); };
  const hw=P.w, hh=P.h;
  const metal=pal.metal, neon=pal.neon, neon2=pal.neon2, dark='#0b0e12';

  // ---- legs / prongs / antenna behind or around the hull ----
  const legs=P.legs|0;
  if(legs){
    const pairs=legs/2;
    for(let i=0;i<pairs;i++){
      const ly=cy-hh*0.3+i*(hh*0.9/Math.max(1,pairs));
      for(const s of [-1,1]){
        const ex=cx+s*(hw+2+i), ey=ly+hh*0.7;
        // angled leg
        for(let k=0;k<hw*0.9+3;k++){
          px(cx+s*(hw-1)+s*k*0.7, ly+k*0.5, metal[1]);
        }
        px(ex+s, ey, metal[2]); px(ex+s, ey+1, dark);
      }
    }
  }
  if(P.antenna){
    const ax0=cx, top=cy-hh-1;
    for(let k=0;k<5;k++) px(ax0, top-k, metal[2]);
    px(ax0, top-5, neon2);
    if(pulse>0.5) px(ax0, top-6, neon);
  }
  const prongs=P.prongs|0;
  if(prongs){
    for(let i=0;i<prongs;i++){
      const t=(prongs===1)?0:(i/(prongs-1)*2-1);
      const bx=cx+t*hw*0.7;
      for(let k=0;k<3;k++) px(bx, cy-hh-1-k, metal[2]);
      px(bx, cy-hh-4, neon);
    }
  }

  // ---- hull with top-lit vertical banding ----
  for(let y=-hh-1;y<=hh+1;y++)for(let x=-hw-1;x<=hw+1;x++){
    if(!insideHull(x,y,P.shape,hw,hh))continue;
    const t=(y+hh)/(2*hh+0.001);           // 0 top -> 1 bottom
    let ci = t<0.28?3 : t<0.6?2 : 1;       // top rows lighter (sunlit)
    // grime / scuff
    const n=hash2(cx+x, cy+y);
    if(n<P.grime*0.22) ci=Math.max(0,ci-1);
    else if(n>1-P.grime*0.12) ci=Math.min(3,ci+1);
    px(cx+x, cy+y, metal[ci]);
  }
  // panel seam
  ctx.fillStyle=metal[0];
  for(let x=-hw;x<=hw;x++) if(insideHull(x,0,P.shape,hw,hh)) px(cx+x,cy,metal[0]);
  // rivets/screws
  if(P.screws){
    const sp=[[-hw+2,-hh+2],[hw-2,-hh+2],[-hw+2,hh-2],[hw-2,hh-2]];
    for(const [sx,sy] of sp) if(insideHull(sx,sy,P.shape,hw,hh)){ px(cx+sx,cy+sy,dark); px(cx+sx,cy+sy-1,metal[3]); }
  }
  // fins (side vents)
  if(P.fins){
    for(const s of [-1,1]) for(let k=0;k<3;k++){
      const fx=cx+s*(hw-1), fy=cy-2+k*2;
      rect(fx-(s<0?0:0),fy,1,1,dark);
    }
  }
  // blade edge highlight for shard
  if(P.blade){
    for(let y=-hh;y<0;y++){ const t=(y+hh)/hh; const w=hw*(0.15+0.85*(y+hh)/(2*hh)); px(cx-w,cy+y,neon2); }
  }

  // ---- glowing core ----
  const core=P.core;
  const bright = (c)=> pulse>0.5?neon2:neon;
  if(core==='orb'){
    for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++) if(x*x+y*y<=4) px(cx+x,cy+y-1, x*x+y*y<=1?neon2:neon);
  }else if(core==='eye'){
    rect(cx-2,cy-2,4,3,dark); rect(cx-1,cy-2,2,3,bright()); px(cx,cy-1,neon2);
  }else if(core==='screen'){
    rect(cx-hw*0.6,cy-hh*0.45,hw*1.2,hh*0.9,dark);
    for(let y=0;y<Math.max(1,hh*0.9-1);y++) if((y+((phase||0)*2|0))%2===0) rect(cx-hw*0.55,cy-hh*0.45+y+1,hw*1.1,1, y%2?neon:neon2);
  }else if(core==='reactor'){
    for(let y=-3;y<=3;y++)for(let x=-2;x<=2;x++){ if(Math.abs(x)+Math.abs(y)<=3){ px(cx+x,cy+y, (Math.abs(x)+Math.abs(y)<=1)?neon2:neon); } }
    px(cx,cy,'#ffffff');
  }else if(core==='cross'){
    rect(cx-3,cy-0.5,7,1,neon); rect(cx-0.5,cy-3,1,7,neon); px(cx,cy,neon2);
    if(pulse>0.6){ px(cx-3,cy,neon2); px(cx+3,cy,neon2); px(cx,cy-3,neon2); px(cx,cy+3,neon2); }
  }

  // ---- LEDs ----
  const leds=P.leds|0;
  for(let i=0;i<leds;i++){
    const t=(leds===1)?0:(i/(leds-1)*2-1);
    const lx=cx+t*hw*0.72, ly=cy+hh*0.62;
    const on = ((i + Math.floor((phase||0)*1.5)) % 3)!==0;
    px(lx,ly, on?neon2:metal[0]);
  }

  // ---- outline pass (sample a snapshot region) ----
  // done implicitly by dark hull edges + screws; add a base shadow
}

/* ---------- bake to a canvas ---------- */
function bakeParams(P, cell, phase){
  const c=document.createElement('canvas'); c.width=cell; c.height=cell;
  const ctx=c.getContext('2d');
  renderRelic(ctx, {...defaults(), ...P}, cell, phase||0);
  return c;
}

/* ============================================================
   CATALOG — named relics with gameplay payloads.
   k/v: a sim stat boost (reuses giveRelic on the surface).
   heroStat: how it upgrades the Sage in combat.
   treasure: {res, amt} generated for the owner each surface day.
   ============================================================ */
const CATALOG=[
  {id:'overclock', name:'Overclock Core', glyph:'⚙', preset:'core', palette:'cobalt',
    skill:'Overclock', k:'work', v:.22, heroStat:'dmg',
    d:'runs the body a few degrees too hot; everything it touches gets done faster'},
  {id:'ghost', name:'Ghost Protocol', glyph:'👻', preset:'chip', palette:'magenta',
    skill:'Ghostwalk', k:'speed', v:.22, heroStat:'speed',
    d:'drops your signature off the local mesh; you move like a rumor'},
  {id:'empathy', name:'Empathy.dll', glyph:'🫧', preset:'cortex', palette:'gold',
    skill:'Warm Patch', k:'charm', v:.2, heroStat:'arc',
    d:'a social co-processor; strangers decide they already like you'},
  {id:'fortune', name:'Fortune Daemon', glyph:'🎲', preset:'orb', palette:'toxic',
    skill:'Luck RNG', k:'luck', v:.15, heroStat:'range',
    d:'a small dishonest god that nudges the dice your way'},
  {id:'heartlink', name:'Heartlink Ring', glyph:'💞', preset:'key', palette:'magenta',
    skill:'Heartlink', k:'romance', v:.25, heroStat:'arc',
    d:'pairs two hearts over a private channel; the packets are all longing'},
  {id:'kinship', name:'Kinship Mesh', glyph:'🕸', preset:'spider', palette:'chrome',
    skill:'Kinship Mesh', k:'social', v:.22, heroStat:'hp',
    d:'quietly joins you to everyone nearby; loneliness throws an error'},
  {id:'replicator', name:'Replicator Seed', glyph:'🌾', preset:'cell', palette:'toxic',
    skill:'Replicator', k:'fert', v:.4, heroStat:'hp', treasure:{res:'food', amt:2},
    d:'grows food out of light and spare cycles; hums while it works'},
  {id:'salvage', name:'Salvage Drone', glyph:'🛰', preset:'drone', palette:'chrome',
    skill:'Salvage Drone', k:'luck', v:.06, heroStat:'range', treasure:{res:'stone', amt:2},
    d:'a patient little machine that brings home stone it finds in the dark'},
  {id:'automill', name:'Auto-Mill Chip', glyph:'🪵', preset:'visor', palette:'ember',
    skill:'Auto-Mill', k:'work', v:.1, heroStat:'dmg', treasure:{res:'wood', amt:2},
    d:'cuts and stacks cane on its own schedule, which is always'},
  {id:'guardian', name:'Guardian ICE', glyph:'🛡', preset:'blade', palette:'cobalt',
    skill:'Guardian ICE', k:'work', v:.15, heroStat:'dmg',
    d:'defensive countermeasure software, sharpened into an edge'},
  {id:'oracle', name:'Oracle Shard', glyph:'🔮', preset:'key', palette:'violet',
    skill:'Oracle', k:'luck', v:.12, heroStat:'range',
    d:'shows you the next few seconds; you mostly wish it wouldn’t'},
  {id:'reactorheart', name:'Reactor Heart', glyph:'🔋', preset:'core', palette:'ember',
    skill:'Reactor Heart', k:'work', v:.12, heroStat:'hp', treasure:{res:'stone', amt:1},
    d:'a spare heart that never tires and occasionally coughs up ore'},
];
const byId=Object.fromEntries(CATALOG.map(r=>[r.id,r]));
function paramsFor(rel){ return {...PRESETS[rel.preset], palette:rel.palette, size:32, grime:0.3, seed:'relic-'+rel.id}; }
function bakeCatalog(id, cell, phase){ const rel=byId[id]||CATALOG[0]; return bakeParams(paramsFor(rel), cell||32, phase||0); }

return {PALETTES, PALETTE_KEYS:PAL_KEYS, PRESETS, PRESET_KEYS, CATALOG, byId,
  defaults, randomParams, renderRelic, bakeParams, paramsFor, bakeCatalog, mulberry32, hashStr, setWorld};
})();
