'use strict';
/* ============================================================
   SEED & SAGE — scenery.js
   SceneryForge: a small procedural baker for PASSIVE tech props —
   wall panels, wire bundles, pipes, conduits, vents, screens and
   junction boxes. They dress the overworld during tech/cyber eras
   and around cities, fill modern & cyber building interiors, and
   mark cyber-touched pockets of the Understory.
   Bakes each prop to an offscreen <canvas>, anchored bottom-centre.
   ============================================================ */
const SceneryForge = (function(){
 function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
 function hashStr(s){s=String(s);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
 const H=(h,s,l)=>'hsl('+(((h%360)+360)%360).toFixed(0)+','+Math.max(0,Math.min(100,s)).toFixed(0)+'%,'+Math.max(0,Math.min(100,l)).toFixed(0)+'%)';
 const KINDS=['panel','wires','pipes','conduit','vent','screen','junction'];
 // theme tints: cyber reads teal/magenta neon on black; modern reads cool steel/blue
 function tint(theme,rng){
  if(theme==='cyber')return {metal:200,metalLit:22,neon:(rng()<.5?178:308),body:16};
  return {metal:212,metalLit:38,neon:205,body:34};                // modern
 }
 // bake one prop → {canvas, kind, ax, ay} where (ax,ay) is the ground-anchor offset
 function bake(kind, variantSeed, theme){
  const rng=mulberry32(hashStr(kind+'/'+variantSeed+'/'+theme));
  const t=tint(theme||'modern',rng);
  const W=20,Hc=26; const cv=document.createElement('canvas'); cv.width=W; cv.height=Hc;
  const c=cv.getContext('2d'); c.imageSmoothingEnabled=false;
  const metal=H(t.metal,10,t.metalLit), metalD=H(t.metal,12,t.metalLit-14), metalL=H(t.metal,8,t.metalLit+16);
  const neon=H(t.neon,90,60), neonDim=H(t.neon,70,32), body=H(t.metal,14,t.body);
  const cx=W/2;
  // a soft ground shadow footprint baked in
  c.fillStyle='rgba(0,0,0,0.28)';c.beginPath();c.ellipse(cx,Hc-2,6,2.2,0,0,7);c.fill();
  if(kind==='panel'){
   c.fillStyle=metalD;c.fillRect(cx-7,4,14,18);
   c.fillStyle=metal;c.fillRect(cx-6,5,12,16);
   for(let r=0;r<4;r++)for(let q=0;q<3;q++){const on=rng()<0.5; c.fillStyle=on?neon:neonDim;c.fillRect(cx-5+q*4,6+r*4,3,3);}
   c.fillStyle=metalL;c.fillRect(cx-6,5,12,1);
  }else if(kind==='wires'){
   c.strokeStyle=body;c.lineWidth=2;
   for(let k=0;k<4;k++){const ox=cx-6+k*4; c.strokeStyle=k%2?neonDim:H(t.metal,20,26);
    c.beginPath();c.moveTo(ox,4);c.bezierCurveTo(ox+(rng()*6-3),12,ox+(rng()*6-3),16,ox+(rng()*4-2),Hc-3);c.stroke();}
   c.fillStyle=metalD;c.fillRect(cx-7,3,14,3);   // conduit lip they hang from
   c.fillStyle=neon;c.fillRect(cx-6+(rng()*10|0),4,1.4,1.4);
  }else if(kind==='pipes'){
   for(let k=0;k<3;k++){const ox=cx-5+k*5; c.fillStyle=metalD;c.fillRect(ox-1,3,4,Hc-5);
    c.fillStyle=metal;c.fillRect(ox,3,2,Hc-5); c.fillStyle=metalL;c.fillRect(ox,3,1,Hc-5);
    c.fillStyle=metalD;c.fillRect(ox-1,10+((k*3)%6),4,2);}   // joint collars
  }else if(kind==='conduit'){
   c.fillStyle=metalD;c.fillRect(cx-6,6,12,16);
   c.fillStyle=metal;c.fillRect(cx-5,7,10,14);
   for(let r=0;r<5;r++){c.fillStyle=metalD;c.fillRect(cx-5,8+r*3,10,1);}   // ribs
   c.fillStyle=neon;c.fillRect(cx-4,20,8,1.5);
  }else if(kind==='vent'){
   c.fillStyle=metalD;c.fillRect(cx-7,8,14,13);
   c.fillStyle=metal;c.fillRect(cx-6,9,12,11);
   c.fillStyle=metalD;for(let r=0;r<4;r++)c.fillRect(cx-5,10+r*3,12,1.6);   // slats
  }else if(kind==='screen'){
   c.fillStyle=metalD;c.fillRect(cx-1,14,2,Hc-15);          // post
   c.fillStyle=metalD;c.fillRect(cx-7,3,14,12);
   c.fillStyle=H(t.neon,85,14);c.fillRect(cx-6,4,12,10);    // dark glass
   c.fillStyle=neon;for(let k=0;k<3;k++)c.fillRect(cx-5,6+k*3,2+((rng()*8)|0),1.4);   // readout lines
   const go=c.globalCompositeOperation;c.globalCompositeOperation='lighter';c.globalAlpha=0.35;
   c.fillStyle=neon;c.fillRect(cx-6,4,12,10);c.globalAlpha=1;c.globalCompositeOperation=go;
  }else{ // junction box with blinking lamps
   c.fillStyle=metalD;c.fillRect(cx-6,9,12,13);
   c.fillStyle=metal;c.fillRect(cx-5,10,10,11);
   for(let k=0;k<3;k++){c.fillStyle=rng()<0.5?neon:neonDim;c.beginPath();c.arc(cx-3+k*3,13,1.3,0,7);c.fill();}
   c.fillStyle=body;c.fillRect(cx-2,21,4,3);
  }
  return {canvas:cv, kind, ax:W/2, ay:Hc-2};
 }
 return {KINDS, bake, tint};
})();
if(typeof window!=='undefined')window.SceneryForge=SceneryForge;
