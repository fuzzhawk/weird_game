'use strict';
/* ============================================================
   SEED & SAGE — animals.js
   ANIMAL FORGE: a procedural generator for four-legged fauna.
   Every reroll invents a NEW species — a fresh quadruped build
   (body, legs, neck, head, ears, horns, tail, hide, colours) with
   a made-up species name and stats derived from that build, plus a
   temperament driving the AI (prey wander & flee, predators hunt,
   neutrals graze & gore what corners them).

   The sprites are baked here (not through the bipedal Creature
   Forge rig) into the same 8-direction FRAMES structure the shared
   drawCreatureSprite bridge consumes, so they Y-sort and animate
   alongside everything else — but they walk on four legs.
   ============================================================ */
const AF = (function(){
const {mulberry32,hashStr,hsl,shade,Raster,DIRS,rasterToImageData}=CF;
function pick(rng,a){ return a[(rng()*a.length)|0]; }
function rr(rng,lo,hi){ return lo+rng()*(hi-lo); }
function chance(rng,p){ return rng()<p; }

/* ---------- naming: invent a species + an individual ---------- */
const SP_PRE=['thorn','dusk','moss','ember','glimmer','grumble','stag','bram','fen','gloam','snout','tuft','clover','rime','soot','pallid','cinder','hollow','verr','quill','murk','loam','bristle','sable','wisp'];
const SP_SUF=['lope','mane','horn','back','snout','paw','tusk','fluff','hoof','beast','runt','stalker','grazer','prowler','hopper','bounder','gnaw','trot','mander','ling'];
const GIVEN=['Bramble','Ash','Rust','Clover','Fen','Moss','Pip','Sorrel','Cinder','Dusk','Vetch','Bryn','Tansy','Wren','Sedge','Flint','Juniper','Marrow','Quill','Thistle','Hazel','Gorse','Ember','Slate'];
function speciesName(rng){
 let n=pick(rng,SP_PRE)+pick(rng,SP_SUF);
 return n.charAt(0).toUpperCase()+n.slice(1);
}

/* ---------- archetype hints for the six named chips (light bias
   only — each still rerolls into something novel) ---------- */
const KEYS=['deer','rabbit','fowl','boar','fox','wolf'];
const HINTS={
 deer:  {temper:'prey',    legLen:[8,11], neck:[5,8], horn:['antler','antler','none'], tail:['stub','tuft'], hue:[24,40], sat:[26,46], lit:[40,56], build:[0.7,1.0], ears:['long','pointed']},
 rabbit:{temper:'prey',    legLen:[4,6.5],neck:[1,3], horn:['none'],                   tail:['fluff'],       hue:[18,44], sat:[8,26],  lit:[52,80], build:[0.45,0.7],ears:['long','long']},
 fowl:  {temper:'prey',    legLen:[5,7],  neck:[2,4], horn:['none','crest'],           tail:['tuft','fan'],  hue:[0,360], sat:[30,64], lit:[44,64], build:[0.5,0.75],ears:['none','round']},
 boar:  {temper:'neutral', legLen:[4.5,6.5],neck:[2,4],horn:['tusk','straight'],       tail:['stub','whip'], hue:[14,34], sat:[16,36], lit:[22,40], build:[0.9,1.25],ears:['pointed','round']},
 fox:   {temper:'predator',legLen:[6,8.5],neck:[3,5], horn:['none'],                   tail:['fluff','fluff'],hue:[10,28],sat:[54,80], lit:[42,58], build:[0.6,0.85],ears:['pointed']},
 wolf:  {temper:'predator',legLen:[7,10], neck:[3,6], horn:['none'],                   tail:['long','fluff'],hue:[200,265],sat:[5,20], lit:[36,62], build:[0.85,1.2],ears:['pointed']},
};

const EAR_TYPES=['none','round','pointed','long','floppy','fin'];
const HORN_TYPES=['none','none','straight','curved','antler','tusk','crest','pair'];
const TAIL_TYPES=['none','stub','long','fluff','tuft','whip','fan'];
const HIDES=['plain','plain','spots','stripes','patch','dapple'];

/* make(key|null, seed) → a fully-formed animal spec + build params */
function make(key, seed){
 const rng=mulberry32(hashStr('animal-'+seed));
 const h=(key&&HINTS[key])?HINTS[key]:null;
 const temper = h? h.temper : pick(rng,['prey','prey','prey','neutral','predator','predator']);

 // --- body build (everything the quad renderer needs lives in params) ---
 const buildLo = h? h.build[0] : 0.5, buildHi = h? h.build[1] : 1.2;
 const build = rr(rng, buildLo, buildHi);                 // overall bulk 0.45..1.25
 const legLen = h? rr(rng,h.legLen[0],h.legLen[1]) : rr(rng,4,11);
 const neckLen = h? rr(rng,h.neck[0],h.neck[1]) : rr(rng,1.5,8.5);
 const bodyLen = clampN(8+build*11 + rr(rng,-1.5,2.5), 8, 21);
 const bodyWid = clampN(4.5+build*5.5 + rr(rng,-1,1.5), 4, 11.5);
 const bodyHt  = clampN(3.5+build*3.6 + rr(rng,-0.6,1), 3, 7.5);
 const legThick= clampN(1.1+build*1.4 + rr(rng,-0.2,0.4), 1, 2.7);
 const neckRise= clampN(neckLen*rr(rng,0.35,0.95), 0, 8);
 const headSize= clampN(2.8+build*2.2 + rr(rng,-0.4,0.8), 2.6, 5.6);
 const snout   = rr(rng,0,1)<0.82 ? rr(rng,0.6,4.2) : 0;

 const earType = h? pick(rng,h.ears) : pick(rng,EAR_TYPES);
 const earSize = rr(rng,2,4.6);
 let hornType  = h? pick(rng,h.horn) : pick(rng,HORN_TYPES);
 const crest   = hornType==='crest' || (h && key==='fowl' && chance(rng,.6));
 if(hornType==='crest')hornType='none';
 const hornSize= rr(rng,2,6);
 const tailType= h? pick(rng,h.tail) : pick(rng,TAIL_TYPES);
 const tailSize= rr(rng,3,8);
 const hide    = pick(rng,HIDES);

 // --- colours ---
 const hue = h? Math.round(rr(rng,h.hue[0],h.hue[1]))%360 : Math.round(rng()*360);
 const sat = h? Math.round(rr(rng,h.sat[0],h.sat[1])) : Math.round(rr(rng,10,72));
 const lit = h? Math.round(rr(rng,h.lit[0],h.lit[1])) : Math.round(rr(rng,30,70));
 const bellyLit = clampN(lit+rr(rng,10,22),0,92);
 const markHue = chance(rng,.7)? hue : (hue+Math.round(rr(rng,-45,45))+360)%360;

 // --- sprite build params (consumed by AF.bake) ---
 const sizeScale = clampN(0.6 + build*0.5 + rr(rng,-0.05,0.08), 0.58, 1.28);
 const params={
  size:48, walkFrames:6, outline:true,
  bodyLen, bodyWid, bodyHt, legLen, legThick, neckLen, neckRise, headSize, snout,
  earType, earSize, hornType, hornSize, crest, tailType, tailSize, hide,
  stride: clampN(1.6+legLen*0.14,1.6,3.2), bob: 0.6+build*0.4,
  hue, sat, lit, bellyLit, markHue,
  seed:'animal-'+(key||'wild')+'-'+seed,
 };

 // --- stats derived from the build + temperament ---
 const mass = (bodyLen*bodyWid*bodyHt)/210;               // ~0.6..7
 const hpMul = temper==='predator'?1.15: temper==='neutral'?1.35:1.0;
 const hp = Math.max(5, Math.round((6+mass*7+legThick*2)*hpMul));
 const spd = clampN(1.05 + legLen*0.075 - mass*0.06 + (temper==='predator'?0.2:0), 0.85, 2.25);
 const horned = hornType!=='none';
 let dmg=0;
 if(temper==='predator') dmg = Math.max(3, Math.round(3 + mass*1.3 + (horned?2:0)));
 else if(temper==='neutral') dmg = horned? Math.round(4+mass) : Math.round(2+mass*0.6);
 const spec={
  label: speciesName(rng),
  temper, hp, dmg, spd, size: sizeScale*48,
  flee: temper==='prey'? Math.round(rr(rng,6,11)) : 5,
  aggro: temper==='predator'? Math.round(rr(rng,6,11)) : 7,
  bold: temper==='predator' && chance(rng,0.4),
 };
 return { key:key||'wild', spec, params, name:pick(rng,GIVEN), sizeScale };
}
function clampN(v,lo,hi){ return v<lo?lo:v>hi?hi:v; }

/* ============================================================
   QUADRUPED SPRITE RENDERER
   A parametric four-legged rig projected onto a gently pitched
   ground plane, so the beast faces all 8 directions with legs,
   body, neck+head and tail placed and depth-sorted correctly.
   ============================================================ */
const KY=0.60;                        // ground vertical squash (fake 3/4 pitch)

function renderQuad(P, dir, anim, f){
 const S=P.size, g=new Raster(S);
 const D=DIRS[dir]; let fdx=D.fx, fdy=D.fy; const fl=Math.hypot(fdx,fdy)||1; fdx/=fl; fdy/=fl;
 const F=[fdx, fdy*KY], Pp=[-fdy, fdx*KY];           // screen-space facing & perpendicular
 const towardCam = fdy;                               // >0 faces down/toward viewer

 // palette
 const base=hsl(P.hue,P.sat,P.lit), belly=hsl(P.hue,Math.round(P.sat*0.7),P.bellyLit);
 const dark=shade(base,-0.26), hoof=shade(base,-0.5);
 const bone=hsl(38,16,80);
 // markings: a natural darker tone of the hide (optionally nudged toward a second
 // hue for a bit of variety, but kept close so nothing looks painted-on)
 const mark=shade(hsl(P.markHue,Math.min(P.sat,55),Math.max(16,P.lit-22)),-0.05);
 const eyeC={r:20,g:16,b:22};

 const N=(anim==='walk')?(P.walkFrames||6):(anim==='attack'?4:1);
 const ph=(anim==='walk')?(f/N)*Math.PI*2:0;
 const bob=(anim==='walk')?-Math.abs(Math.sin(ph))*P.bob*0.7:0;
 let lunge=0; if(anim==='attack')lunge=[-1.2,-0.3,3,1][f]||0;

 const cx=S*0.5 + F[0]*lunge, gy=S*0.85 + F[1]*lunge;   // footprint centre on the ground
 const hl=P.bodyLen*0.5, hw=P.bodyWid*0.5;
 const bodyH=P.legLen + P.bodyHt*0.5;                    // body centre height above ground
 // key screen points
 const groundPt=(a,b)=>[cx+F[0]*a+Pp[0]*b, gy+F[1]*a+Pp[1]*b];
 const lift=(sx,sy,h)=>[sx, sy-h];
 const bc=lift(cx+ (0), gy+ (0), bodyH-bob);            // body centre
 const shoulder=[cx+F[0]*hl, gy+F[1]*hl - (bodyH-bob)];
 const hip=[cx-F[0]*hl, gy-F[1]*hl*1 - 0 - (bodyH-bob)];
 // recompute hip properly (mirror of shoulder)
 hip[0]=cx-F[0]*hl; hip[1]=gy-F[1]*hl - (bodyH-bob);

 // --- legs: front/back (sgnF ±1) × left/right (sgnW ±1), diagonal trot gait ---
 const legs=[];
 for(const sgnF of [1,-1]) for(const sgnW of [1,-1]){
  const grp=((sgnF>0)===(sgnW>0))?0:Math.PI;             // diagonal pairs in phase
  const s=(anim==='walk')?Math.sin(ph+grp):0;
  const swing=(anim==='walk')?Math.cos(ph+grp)*P.stride:0;
  const up=Math.max(0,s)*P.stride*0.85;
  const foot=groundPt(hl*sgnF*0.98+swing, hw*sgnW*0.96);
  foot[1]-=up;                                            // lift the swinging foot
  const att=[cx+F[0]*hl*sgnF*0.7+Pp[0]*hw*sgnW*0.72,
             gy+F[1]*hl*sgnF*0.7+Pp[1]*hw*sgnW*0.72 - (P.legLen*0.55+P.bodyHt*0.2)];
  legs.push({foot, att, sgnW, sgnF, key: foot[1]});
 }

 // --- tail & head anchor points ---
 const tail=[cx-F[0]*(hl+P.tailSize*0.6), gy-F[1]*(hl+P.tailSize*0.6) - (bodyH-bob)*0.9];
 const headG = groundPt(hl+P.neckLen, 0);
 const head=[headG[0], headG[1]-(bodyH-bob)-P.neckRise];

 const drawLeg=(L,far)=>{
  const col=far?dark:base;
  g.capsule(L.att[0],L.att[1],L.foot[0],L.foot[1],Math.max(0.9,P.legThick*0.55),col,1);
  g.fillEllipse(L.foot[0],L.foot[1],P.legThick*0.6+0.4,P.legThick*0.5+0.3,hoof,1);
 };
 const drawBody=()=>{
  // sausage body from hip to shoulder, plus a belly underswell
  const r=Math.max(2.2,hw*1.0);
  g.capsule(hip[0],hip[1],shoulder[0],shoulder[1],r,base,1);
  g.fillEllipse((hip[0]+shoulder[0])/2,(hip[1]+shoulder[1])/2+r*0.45,hw*0.95,P.bodyHt*0.7+1,belly,2);
  // top highlight
  g.fillEllipse((hip[0]+shoulder[0])/2,(hip[1]+shoulder[1])/2-r*0.5,hw*0.7,P.bodyHt*0.5,shade(base,0.14),1);
  // hide markings
  if(P.hide==='spots'){ for(let i=0;i<5;i++){const q=(i+1)/6; g.fillEllipse(hip[0]+(shoulder[0]-hip[0])*q,(hip[1]+shoulder[1])/2+((i%2)-0.5)*r*0.7,1.1,1.0,mark,1);} }
  else if(P.hide==='stripes'){ for(let i=1;i<5;i++){const q=i/5; const mx=hip[0]+(shoulder[0]-hip[0])*q,my=hip[1]+(shoulder[1]-hip[1])*q; g.capsule(mx-Pp[0]*hw*0.7,my-Pp[1]*hw*0.7,mx+Pp[0]*hw*0.7,my+Pp[1]*hw*0.7,0.6,mark,1);} }
  else if(P.hide==='patch'){ g.fillEllipse(shoulder[0]*0.4+hip[0]*0.6,(hip[1]+shoulder[1])/2,hw*0.5,P.bodyHt*0.55,mark,1); }
  else if(P.hide==='dapple'){ for(let i=0;i<7;i++)g.fillEllipse(hip[0]+(shoulder[0]-hip[0])*((i*0.61)%1),(hip[1]+shoulder[1])/2+((i%3)-1)*r*0.5,0.8,0.8,mark,1); }
 };
 const drawTail=()=>{
  if(P.tailType==='none')return;
  const bx=hip[0],by=hip[1];
  if(P.tailType==='stub'){ g.fillEllipse(tail[0],tail[1],1.5,1.5,base,1); return; }
  const r=P.tailType==='fluff'?1.7:P.tailType==='whip'?0.7:1.0;
  g.capsule(bx,by,tail[0],tail[1],r,base,1);
  if(P.tailType==='fluff')g.fillEllipse(tail[0],tail[1],2.3,2.3,belly,2);
  else if(P.tailType==='tuft')g.fillEllipse(tail[0],tail[1],1.5,1.5,mark,1);
  else if(P.tailType==='fan'){ for(let i=-1;i<=1;i++)g.fillTri(bx,by,tail[0]+i*2,tail[1]-2,tail[0]+i*2,tail[1]+2,belly,2); }
  else g.fillEllipse(tail[0],tail[1],1.1,1.1,mark,1);
 };
 const drawHead=()=>{
  // neck
  g.capsule(shoulder[0],shoulder[1],head[0],head[1],Math.max(1.3,P.headSize*0.42),base,1);
  const hs=P.headSize;
  g.fillEllipse(head[0],head[1],hs*0.62,hs*0.6,base,6);
  // snout out along the facing
  if(P.snout>0){ const mx=head[0]+F[0]*(hs*0.5+P.snout*0.4), my=head[1]+F[1]*(hs*0.5+P.snout*0.4);
   g.capsule(head[0],head[1],mx,my,Math.max(1,hs*0.32),belly,2);
   g.fillEllipse(mx,my,1.1,0.9,hoof,6); }
  // ears
  if(P.earType!=='none'){ for(const side of [-1,1]){
   const ex=head[0]+Pp[0]*hs*0.5*side - F[0]*hs*0.15, ey=head[1]+Pp[1]*hs*0.5*side - hs*0.55;
   if(P.earType==='round')g.fillEllipse(ex,ey,P.earSize*0.4,P.earSize*0.4,base,7);
   else if(P.earType==='long')g.capsule(ex,ey+1,ex+side*0.4,ey-P.earSize*1.3,0.9,base,7);
   else if(P.earType==='floppy')g.capsule(ex,ey,ex+side*P.earSize*0.6,ey+P.earSize*0.5,1.1,belly,7);
   else if(P.earType==='fin')g.fillTri(ex,ey+1,ex,ey-P.earSize,ex+side*P.earSize*0.7,ey,base,7);
   else g.fillTri(ex-1,ey+1,ex+1,ey+1,ex+side*0.5,ey-P.earSize,base,7);   // pointed
  }}
  // horns
  if(P.hornType!=='none'){ const one=P.hornType==='straight'&&false; for(const side of [-1,1]){
   const hx=head[0]+Pp[0]*hs*0.34*side, hy=head[1]-hs*0.4;
   if(P.hornType==='straight')g.capsule(hx,hy,hx+side*0.6,hy-P.hornSize,0.8,bone,8);
   else if(P.hornType==='curved')g.capsule(hx,hy,hx+side*P.hornSize*0.6,hy-P.hornSize*0.7,0.8,bone,8);
   else if(P.hornType==='tusk')g.capsule(head[0]+Pp[0]*hs*0.3*side+F[0]*hs*0.3,head[1]+hs*0.2,head[0]+Pp[0]*hs*0.4*side+F[0]*hs*0.6,head[1]+hs*0.1-P.hornSize*0.5,0.8,bone,8);
   else if(P.hornType==='pair')g.capsule(hx,hy,hx+side*P.hornSize*0.4,hy-P.hornSize,0.7,bone,8);
   else if(P.hornType==='antler'){ g.capsule(hx,hy,hx+side*P.hornSize*0.4,hy-P.hornSize,0.7,bone,8);
     g.capsule(hx+side*P.hornSize*0.2,hy-P.hornSize*0.5,hx+side*P.hornSize*0.75,hy-P.hornSize*0.7,0.6,bone,8);
     g.capsule(hx+side*P.hornSize*0.3,hy-P.hornSize*0.75,hx+side*P.hornSize*0.7,hy-P.hornSize*1.05,0.6,bone,8); }
  }}
  if(P.crest){ for(let i=-1;i<=1;i++)g.fillTri(head[0]+i*1.3,head[1]-hs*0.4,head[0]+i*1.3-1,head[1]-hs*0.4,head[0]+i*1.3,head[1]-hs*0.4-P.hornSize*0.7,mark,8); }
  // eyes (only when the face is toward the camera)
  if(towardCam>-0.35){ for(const side of [-1,1]){
   const ex=head[0]+Pp[0]*hs*0.32*side+F[0]*hs*0.2, ey=head[1]+hs*0.05;
   g.fillEllipse(ex,ey,0.9,0.9,eyeC,11);
  }}
 };

 // ---- depth-sorted paint ----
 const bodyY=(hip[1]+shoulder[1])/2;
 legs.sort((a,b)=>a.key-b.key);                     // far (higher on screen) first
 const farLegs=legs.filter(L=>L.foot[1]<=bodyY+bodyH*0.2);
 const nearLegs=legs.filter(L=>L.foot[1]>bodyY+bodyH*0.2);
 // tail behind body when it sits higher on screen than the body
 const tailFirst = tail[1] < bodyY;
 const headFirst = head[1] < bodyY;                 // head up/away → behind body
 for(const L of farLegs) drawLeg(L,true);
 if(tailFirst) drawTail();
 if(headFirst) drawHead();
 drawBody();
 for(const L of nearLegs) drawLeg(L,false);
 if(!tailFirst) drawTail();
 if(!headFirst) drawHead();

 // ---- outline pass (empty pixel bordering a filled one → dark rim) ----
 if(P.outline){ const snap=g.col.slice(); const out=shade(base,-0.62);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){ const i=y*S+x; if(snap[i])continue;
   const n=(x>0&&snap[i-1])||(x<S-1&&snap[i+1])||(y>0&&snap[i-S])||(y<S-1&&snap[i+S]);
   if(n){ g.col[i]=out; g.tag[i]=18; }
  }
 }
 return g;
}

/* bake a quadruped into the FRAMES structure drawCreatureSprite expects */
function bake(params, drawSize, anims){
 const P={size:48, walkFrames:6, outline:true, ...params};
 const S=P.size, scale=Math.max(1,Math.round((drawSize||48)/S)), box=S*scale;
 let list=anims?anims.slice():['walk','attack'];
 if(!list.includes('walk'))list.unshift('walk');
 const FRAMES={};
 for(const a of list){
  FRAMES[a]=[];
  const n=(a==='walk')?(P.walkFrames||6):(a==='attack'?4:1);
  for(let d=0;d<8;d++){
   const arr=[];
   for(let f=0;f<n;f++){
    const r=renderQuad(P,d,a,f);
    const id=rasterToImageData(r);
    const tmp=document.createElement('canvas');tmp.width=S;tmp.height=S;
    tmp.getContext('2d').putImageData(new ImageData(id.data,S,S),0,0);
    const cv=document.createElement('canvas');cv.width=box;cv.height=box;
    const cc=cv.getContext('2d');cc.imageSmoothingEnabled=false;cc.drawImage(tmp,0,0,box,box);
    arr.push(cv);
   }
   FRAMES[a].push(arr);
  }
 }
 return { FRAMES, params:P, native:S, scale, box, fps:{walk:8,run:11,attack:10,talk:6} };
}

/* ============================================================
   FLYERS — birds & insects that fly above the world, some in flocks.
   A separate generator + top-down flapping-wing sprite renderer; the
   world code (surface.js) floats them over the terrain with a shadow
   and steers flock species with simple boids.
   ============================================================ */
const FLY_PRE=['flit','gleam','dusk','ember','azure','thistle','mote','glint','hush','sable','copper','sun','moon','drift','spark','rime','loam','verd'];
const FLY_BIRD=['wing','finch','lark','crest','plume','swift','jay','pip','warble','tern','starling','martlet'];
const FLY_BUG=['wing','fly','moth','beetle','dart','gnat','hover','flit','chafer','midge','skimmer','lacewing'];
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function flyerName(rng,kind){ return cap(pick(rng,FLY_PRE)+pick(rng,kind==='bird'?FLY_BIRD:FLY_BUG)); }

// makeFlyer(key|null, seed) → an invented flying species (key = 'bird'|'bug' hint)
function makeFlyer(key, seed){
 const rng=mulberry32(hashStr('flyer-'+seed));
 const kind=(key==='bird'||key==='bug')?key:(chance(rng,.55)?'bird':'bug');
 const flock=chance(rng, kind==='bird'?0.72:0.5);
 const size = kind==='bird'? rr(rng,0.42,0.72) : rr(rng,0.3,0.52);
 const params={
  size:48, kind, frames:4, outline:true,
  bodyLen: kind==='bird'? rr(rng,5,9) : rr(rng,4,7),
  bodyWid: kind==='bird'? rr(rng,2.3,3.7) : rr(rng,1.8,3.1),
  wingSpan: kind==='bird'? rr(rng,7,12.5) : rr(rng,5.5,9.5),
  wingShape: kind==='bird'? pick(rng,['pointed','round','long']) : 'bug',
  wingPairs: kind==='bird'?1:2,
  tailType: kind==='bird'? pick(rng,['fan','fork','long','short']) : pick(rng,['none','none','stinger']),
  beak: kind==='bird', antennae: kind==='bug',
  hue: Math.round(rng()*360),
  sat: kind==='bird'? Math.round(rr(rng,46,86)) : Math.round(rr(rng,22,70)),
  lit: kind==='bird'? Math.round(rr(rng,42,64)) : Math.round(rr(rng,32,56)),
  wingLit: Math.round(rr(rng,58,86)),
  accent: Math.round(rng()*360),
  seed:'flyer-'+seed,
 };
 const spec={ label:flyerName(rng,kind), kind, temper: flock?'flock':'flitting', dmg:0,
  spd: kind==='bird'? rr(rng,1.7,2.6) : rr(rng,1.2,2.0),
  elev: kind==='bird'? Math.round(rr(rng,16,30)) : Math.round(rr(rng,10,22)),
  flock };
 return { flyer:true, key:kind, kind, params, name:pick(rng,GIVEN), spec, sizeScale:size };
}

// top-down flapping flyer, oriented to 8 directions (centred in the box; the
// world draws it elevated above its ground shadow)
function renderFlyer(P, dir, frame){
 const S=P.size, g=new Raster(S);
 const D=DIRS[dir]; let fdx=D.fx, fdy=D.fy; const fl=Math.hypot(fdx,fdy)||1; fdx/=fl; fdy/=fl;
 const KY=0.82, F=[fdx,fdy*KY], Pp=[-fdy,fdx*KY];
 const base=hsl(P.hue,P.sat,P.lit), dark=shade(base,-0.3);
 const wingCol = P.kind==='bug'? hsl(P.hue,Math.round(P.sat*0.5),P.wingLit) : shade(base,0.08);
 const wingDark = shade(wingCol,-0.24);
 const beakC=hsl(40,60,58), eyeC={r:20,g:16,b:22}, accent=hsl(P.accent,70,58);
 const cx=S*0.5, cy=S*0.5;
 const N=P.frames||4, ph=(frame/N)*Math.PI*2, flap=Math.sin(ph);
 const bl=P.bodyLen*0.5;
 const nose=[cx+F[0]*bl, cy+F[1]*bl], tail=[cx-F[0]*bl, cy-F[1]*bl];
 const drawWing=(side,pairOff)=>{
  const span=P.wingSpan*(P.kind==='bug'?0.82:1);
  const fold=flap*span*0.42, sweep=-0.22-Math.abs(flap)*0.16;
  const rx=cx+F[0]*pairOff, ry=cy+F[1]*pairOff;
  const tx=rx+Pp[0]*span*side + F[0]*span*sweep;
  const ty=ry+Pp[1]*span*side + F[1]*span*sweep - fold*(P.kind==='bug'?0.5:1);
  if(P.kind==='bug'){ g.fillEllipse((rx+tx)/2,(ry+ty)/2,span*0.32,span*0.19,wingCol,3); }
  else { g.fillTri(rx,ry-1.1,rx,ry+1.1,tx,ty,wingCol,3); g.capsule(rx,ry,tx,ty,0.9,wingDark,3); }
 };
 if(P.wingPairs===2){ drawWing(-1,bl*0.5);drawWing(1,bl*0.5); drawWing(-1,-bl*0.25);drawWing(1,-bl*0.25); }
 else { drawWing(-1,0); drawWing(1,0); }
 if(P.kind==='bug'){
  g.fillEllipse(cx,cy,P.bodyWid*0.5,P.bodyLen*0.52,base,1);
  g.fillEllipse((cx+nose[0])/2,(cy+nose[1])/2,P.bodyWid*0.42,P.bodyWid*0.5,shade(base,-0.1),1);
  g.fillEllipse(nose[0],nose[1],P.bodyWid*0.42,P.bodyWid*0.42,dark,6);
  for(const s of [-1,1]) g.capsule(nose[0],nose[1],nose[0]+F[0]*2.2+Pp[0]*1.6*s,nose[1]+F[1]*2.2+Pp[1]*1.6*s,0.5,dark,7);
  if(P.tailType==='stinger') g.fillTri(tail[0]-0.8,tail[1],tail[0]+0.8,tail[1],tail[0]-F[0]*2.4,tail[1]-F[1]*2.4,accent,5);
 } else {
  g.capsule(tail[0],tail[1],nose[0],nose[1],P.bodyWid*0.5,base,1);
  g.fillEllipse(nose[0],nose[1],P.bodyWid*0.52,P.bodyWid*0.52,base,6);
  if(P.beak) g.fillTri(nose[0]+Pp[0]*0.8,nose[1]+Pp[1]*0.8,nose[0]-Pp[0]*0.8,nose[1]-Pp[1]*0.8,nose[0]+F[0]*2.4,nose[1]+F[1]*2.4,beakC,6);
  g.fillEllipse(nose[0]+Pp[0]*0.9,nose[1]+Pp[1]*0.9,0.7,0.7,eyeC,11);
  const ty=P.tailType, tl=ty==='long'?4.5:2.6;
  if(ty==='fork'){ g.fillTri(tail[0],tail[1],tail[0]-F[0]*tl+Pp[0]*1.6,tail[1]-F[1]*tl+Pp[1]*1.6,tail[0]-F[0]*tl-Pp[0]*1.6,tail[1]-F[1]*tl-Pp[1]*1.6,shade(base,-0.12),5); }
  else if(ty!=='short'){ g.fillTri(tail[0]+Pp[0]*1.7,tail[1]+Pp[1]*1.7,tail[0]-Pp[0]*1.7,tail[1]-Pp[1]*1.7,tail[0]-F[0]*tl,tail[1]-F[1]*tl,shade(base,-0.1),5); }
 }
 if(P.outline){ const snap=g.col.slice(), out=shade(base,-0.6);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){ const i=y*S+x; if(snap[i])continue;
   const n=(x>0&&snap[i-1])||(x<S-1&&snap[i+1])||(y>0&&snap[i-S])||(y<S-1&&snap[i+S]);
   if(n){g.col[i]=out;g.tag[i]=18;} } }
 return g;
}
function bakeFlyer(params, drawSize){
 const P={size:48, frames:4, outline:true, ...params};
 const S=P.size, scale=Math.max(1,Math.round((drawSize||48)/S)), box=S*scale, n=P.frames||4;
 const FRAMES={walk:[]};
 for(let d=0;d<8;d++){ const arr=[];
  for(let f=0;f<n;f++){ const r=renderFlyer(P,d,f); const id=rasterToImageData(r);
   const tmp=document.createElement('canvas');tmp.width=S;tmp.height=S;
   tmp.getContext('2d').putImageData(new ImageData(id.data,S,S),0,0);
   const cv=document.createElement('canvas');cv.width=box;cv.height=box;
   const cc=cv.getContext('2d');cc.imageSmoothingEnabled=false;cc.drawImage(tmp,0,0,box,box);
   arr.push(cv); }
  FRAMES.walk.push(arr);
 }
 return { FRAMES, params:P, native:S, scale, box, fps:{walk:12} };
}

return {KEYS, HINTS, make, bake, pick, speciesName, makeFlyer, bakeFlyer, flyerName};
})();
