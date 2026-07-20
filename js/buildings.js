'use strict';
/* ============================================================
   SEED & SAGE — buildings.js
   BUILDING FORGE: a small procedural generator that pre-bakes
   the little surface builds (lean-tos, houses, shops) into
   sprites — the way the Creature Forge bakes NPCs. Every world
   rolls its own architecture (roof shape, wall material, colour
   family), and each building varies within that world style.
   DOM-lite: baking draws to an offscreen <canvas>.
   ============================================================ */
const BuildingForge = (function(){
 function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
 function hashStr(s){s=String(s);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
 const clamp=(v,a,b)=>v<a?a:v>b?b:v;
 const pick=(rng,a)=>a[(rng()*a.length)|0];
 const H=(h,s,l)=>'hsl('+(((h%360)+360)%360).toFixed(0)+','+clamp(s,0,100).toFixed(0)+'%,'+clamp(l,0,100).toFixed(0)+'%)';

 // ---- per-world architecture: one coherent look shared by every build ----
 const WALL_MATS=['plaster','timber','stone','adobe','panel'];
 const ROOF_SHAPES=['gable','hip','peaked','flat'];
 function worldStyle(seedStr){
  const rng=mulberry32(hashStr('bldg/'+seedStr));
  const wallMat=pick(rng,WALL_MATS);
  // a roof colour family + one or two favoured roof silhouettes this world tends toward
  const roofHue=(rng()*360)|0;
  const shapes=ROOF_SHAPES.slice().sort(()=>rng()-0.5).slice(0,1+((rng()*2)|0));
  const wallHue=(rng()*360)|0;
  return {
   wallMat, roofHue,
   roofSat:34+rng()*30, roofLit:36+rng()*14,
   wallHue, wallSat:(wallMat==='stone'||wallMat==='adobe')?10+rng()*16:16+rng()*22,
   wallLit:(wallMat==='timber')?34+rng()*8:54+rng()*12,
   accentHue:(roofHue+120+rng()*120)|0,       // door / awning / trim pop
   roofShapes:shapes,
   thatch:rng()<0.35,                          // some worlds thatch instead of shingle
   seedStr,
  };
 }

 // ---- a single building's recipe within the world style ----
 function recipe(type, variantSeed, ws){
  const rng=mulberry32(hashStr(type+'/'+variantSeed+'/'+ws.seedStr));
  const shelter=type==='shelter', biz=type==='biz';
  const shape = shelter ? 'lean' : pick(rng,ws.roofShapes);
  const storeys = shelter?1:(type==='home'? (rng()<0.35?2:1) : 1);
  return {
   type, shape, storeys,
   wallHue:ws.wallHue+(rng()*16-8), wallSat:ws.wallSat, wallLit:ws.wallLit+(rng()*8-4),
   wallMat: shelter?'timber':ws.wallMat,
   roofHue:ws.roofHue+(rng()*20-10), roofSat:ws.roofSat, roofLit:ws.roofLit+(rng()*8-4),
   accentHue:ws.accentHue+(rng()*24-12),
   thatch: shelter?true:ws.thatch,
   chimney: !shelter && rng()<0.6,
   chimneySide: rng()<0.5?-1:1,
   windowsLit: rng()<0.7,
   awning: biz && rng()<0.85,
   winRows: storeys,
   jitter: rng,          // reuse for fine grain
  };
 }

 // ---- raster the recipe to an offscreen canvas ----
 // returns {canvas, dx, dy}: draw canvas at (buildingPx+dx, buildingPy+dy)
 function bake(type, wTiles, hTiles, variantSeed, ws, TILE){
  const rc=recipe(type, variantSeed, ws);
  const rng=rc.jitter;
  const fw=wTiles*TILE, foot=hTiles*TILE;
  const roofRise = rc.shape==='flat' ? Math.round(TILE*0.55)
                 : rc.shape==='lean' ? Math.round(TILE*0.85)
                 : Math.round(TILE*(rc.shape==='peaked'?1.5:1.15));
  const over=3;                       // roof overhang past the walls
  const wallTop=roofRise;             // walls start below the roof band
  const cw=fw+over*2, ch=roofRise+foot+2;
  const cv=document.createElement('canvas'); cv.width=cw; cv.height=ch;
  const c=cv.getContext('2d');
  const ox=over;                      // wall left inside the canvas
  const wallBot=wallTop+foot;

  // ---------- walls ----------
  const wBase=H(rc.wallHue,rc.wallSat,rc.wallLit);
  const wDark=H(rc.wallHue,rc.wallSat,rc.wallLit-14);
  const wLite=H(rc.wallHue,rc.wallSat,Math.min(92,rc.wallLit+12));
  const g=c.createLinearGradient(ox,wallTop,ox+fw,wallBot);
  g.addColorStop(0,wLite);g.addColorStop(1,wBase);
  c.fillStyle=g;c.fillRect(ox,wallTop,fw,foot);
  // material texture
  c.save();c.beginPath();c.rect(ox,wallTop,fw,foot);c.clip();
  if(rc.wallMat==='timber'){
   c.fillStyle=wDark;for(let x=ox+2;x<ox+fw;x+=4)c.fillRect(x,wallTop,1,foot);        // vertical planks
   c.fillStyle=H(rc.wallHue,rc.wallSat,rc.wallLit-6);for(let y=wallTop+3;y<wallBot;y+=6)c.fillRect(ox,y,fw,1);
  }else if(rc.wallMat==='stone'){
   c.fillStyle='rgba(0,0,0,0.14)';
   for(let y=wallTop+2;y<wallBot;y+=5)for(let x=ox+((((y/5)|0)%2)?0:3);x<ox+fw;x+=6){c.fillRect(x,y,5,4);}
   c.fillStyle='rgba(255,255,255,0.05)';for(let y=wallTop+2;y<wallBot;y+=5)c.fillRect(ox,y,fw,1);
  }else if(rc.wallMat==='panel'){
   c.fillStyle='rgba(0,0,0,0.10)';for(let x=ox+6;x<ox+fw;x+=8)c.fillRect(x,wallTop,1,foot);
   c.fillStyle='rgba(255,255,255,0.06)';c.fillRect(ox,wallTop+2,fw,1);
  }else if(rc.wallMat==='adobe'){
   c.fillStyle='rgba(0,0,0,0.08)';for(let k=0;k<foot*0.3;k++)c.fillRect(ox+rng()*fw,wallTop+rng()*foot,2,1);
  }else{ // plaster: soft mottle
   c.fillStyle='rgba(0,0,0,0.06)';for(let k=0;k<fw*0.25;k++)c.fillRect(ox+rng()*fw,wallTop+rng()*foot,1,1);
  }
  c.restore();
  // corner posts + plinth (a little architectural framing)
  c.fillStyle=wDark;c.fillRect(ox,wallTop,2,foot);c.fillRect(ox+fw-2,wallTop,2,foot);
  c.fillStyle='rgba(0,0,0,0.30)';c.fillRect(ox,wallBot-2,fw,2);

  // ---------- windows ----------
  const lit=H(48+rc.accentHue*0+38,60,rc.windowsLit?72:30);
  const winCol=rc.windowsLit?H(46,70,72):H(220,25,26);
  const cols=Math.max(1,Math.round(fw/12));
  const rows=clamp(rc.winRows,1,2);
  const wgap=fw/(cols+1);
  for(let r=0;r<rows;r++){
   const wy=wallTop+6+r*Math.max(9,(foot-10)/rows);
   if(wy>wallBot-7)continue;
   for(let cc=0;cc<cols;cc++){
    const wx=Math.round(ox+wgap*(cc+1)-2.5);
    c.fillStyle=H(rc.wallHue,rc.wallSat,rc.wallLit-20);c.fillRect(wx-1,wy-1,7,7);   // frame
    const on=rc.windowsLit && (((hashStr(variantSeed+':'+r+':'+cc))%5)>1);
    c.fillStyle=on?winCol:H(220,22,24);c.fillRect(wx,wy,5,5);
    c.fillStyle='rgba(255,255,255,0.35)';c.fillRect(wx,wy,5,1);c.fillRect(wx+2,wy,1,5);   // muntins/glint
   }
  }
  // ---------- door ----------
  const dw=Math.min(8,Math.max(5,(fw*0.22)|0)), dh=Math.min(foot-3,11);
  const dx0=Math.round(ox+fw/2-dw/2), dy0=wallBot-dh;
  c.fillStyle=H(rc.accentHue,40,26);c.fillRect(dx0-1,dy0-1,dw+2,dh+1);
  c.fillStyle=H(rc.accentHue,44,34);c.fillRect(dx0,dy0,dw,dh);
  c.fillStyle=H(rc.accentHue,50,60);c.fillRect(dx0+dw-2,dy0+dh*0.45,1.4,1.4);            // handle

  // ---------- shop awning + sign ----------
  if(rc.awning){
   const aw=Math.min(fw-4,dw+10), ax=Math.round(ox+fw/2-aw/2), ay=dy0-3;
   for(let s=0;s<aw;s+=4){c.fillStyle=((s/4)|0)%2?H(rc.accentHue,60,52):H(rc.accentHue,20,90);c.fillRect(ax+s,ay,4,3);}
   c.fillStyle='rgba(0,0,0,0.25)';c.fillRect(ax,ay+3,aw,1);
  }

  // ---------- roof ----------
  const rBase=H(rc.roofHue,rc.roofSat,rc.roofLit);
  const rDark=H(rc.roofHue,rc.roofSat,rc.roofLit-14);
  const rLite=H(rc.roofHue,rc.roofSat,Math.min(88,rc.roofLit+14));
  c.lineJoin='round';
  const L=ox-over, Rr=ox+fw+over;
  if(rc.shape==='flat'){
   c.fillStyle=rBase;c.fillRect(L,wallTop-2,Rr-L,roofRise+2);           // parapet slab
   c.fillStyle=rDark;c.fillRect(L,wallTop-2,Rr-L,2);
   c.fillStyle=rLite;c.fillRect(L,wallTop+roofRise-2,Rr-L,2);
  }else if(rc.shape==='lean'){
   // single slope from high-left to low-right (a lean-to)
   c.fillStyle=rBase;c.beginPath();c.moveTo(L,wallTop);c.lineTo(Rr,wallTop+roofRise*0.55);c.lineTo(Rr,wallTop+roofRise*0.55+3);c.lineTo(L,wallTop+3);c.closePath();c.fill();
   c.fillStyle=rLite;c.beginPath();c.moveTo(L,wallTop);c.lineTo(Rr,wallTop+roofRise*0.55);c.lineTo(Rr,wallTop+roofRise*0.55-1.5);c.lineTo(L,wallTop-1.5);c.closePath();c.fill();
  }else if(rc.shape==='hip'){
   const peakY=wallTop-roofRise+2, inl=fw*0.22;
   c.fillStyle=rBase;c.beginPath();c.moveTo(L,wallTop+2);c.lineTo(ox+inl,peakY);c.lineTo(ox+fw-inl,peakY);c.lineTo(Rr,wallTop+2);c.closePath();c.fill();
   c.fillStyle=rDark;c.beginPath();c.moveTo(ox+inl,peakY);c.lineTo(ox+fw-inl,peakY);c.lineTo(ox+fw-inl,peakY+2);c.lineTo(ox+inl,peakY+2);c.closePath();c.fill();
  }else{ // gable / peaked — a triangular ridge
   const peakY=wallTop-roofRise+2;
   c.fillStyle=rBase;c.beginPath();c.moveTo(L,wallTop+2);c.lineTo((L+Rr)/2,peakY);c.lineTo(Rr,wallTop+2);c.closePath();c.fill();
   c.fillStyle=rLite;c.beginPath();c.moveTo(L,wallTop+2);c.lineTo((L+Rr)/2,peakY);c.lineTo((L+Rr)/2,peakY+2);c.lineTo(L,wallTop+4);c.closePath();c.fill();   // lit left pitch
   c.fillStyle=rDark;c.beginPath();c.moveTo(Rr,wallTop+2);c.lineTo((L+Rr)/2,peakY);c.lineTo((L+Rr)/2,peakY+2);c.lineTo(Rr,wallTop+4);c.closePath();c.fill();   // shaded right pitch
  }
  // thatch/shingle grain on sloped roofs
  if(rc.shape!=='flat'&&rc.shape!=='lean'){
   c.save();c.beginPath();c.moveTo(L,wallTop+2);c.lineTo((L+Rr)/2,wallTop-roofRise+2);c.lineTo(Rr,wallTop+2);c.closePath();c.clip();
   c.strokeStyle=rc.thatch?'rgba(80,60,30,0.30)':'rgba(0,0,0,0.16)';c.lineWidth=1;
   for(let y=wallTop;y>wallTop-roofRise;y-=3){c.beginPath();c.moveTo(L,y);c.lineTo(Rr,y);c.stroke();}
   c.restore();
  }
  // ---------- chimney ----------
  if(rc.chimney){
   const chx=Math.round(ox+fw*(rc.chimneySide<0?0.24:0.72)), chw=4, chy=wallTop-roofRise*0.5;
   c.fillStyle=H(rc.wallHue,rc.wallSat+8,rc.wallLit-24);c.fillRect(chx,chy,chw,roofRise*0.5+4);
   c.fillStyle=H(rc.wallHue,rc.wallSat+8,rc.wallLit-14);c.fillRect(chx-1,chy-1,chw+2,2);
  }
  return {canvas:cv, dx:-over, dy:-roofRise};
 }

 return {worldStyle, recipe, bake};
})();
if(typeof window!=='undefined')window.BuildingForge=BuildingForge;
