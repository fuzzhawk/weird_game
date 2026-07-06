'use strict';
/* ============================================================
   SEED & SAGE — forge.js
   CREATURE FORGE sprite engine (DOM-free core, namespaced CF)
   + CFHelp: shared baking/drawing bridge used by BOTH the
   surface garden (NPCs, hero, surfacing monsters) and the
   Understory dungeons (full cast).
   ============================================================ */
const CF = (function(){
// ---------- RNG & noise ----------
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hashStr(s){s=String(s);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function hash2(x,y,s){const v=Math.sin(x*127.1+y*311.7+s*74.77)*43758.5453;return v-Math.floor(v)}

// ---------- color ----------
function hsl(h,s,l){h=((h%360)+360)%360/360;s=Math.max(0,Math.min(100,s))/100;l=Math.max(0,Math.min(100,l))/100;
  if(s===0){const v=Math.round(l*255);return{r:v,g:v,b:v}}
  const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;
  const f=t=>{t=((t%1)+1)%1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p};
  return{r:Math.round(f(h+1/3)*255),g:Math.round(f(h)*255),b:Math.round(f(h-1/3)*255)}}
function shade(c,f){if(f>=0)return{r:Math.round(c.r+(255-c.r)*f),g:Math.round(c.g+(255-c.g)*f),b:Math.round(c.b+(255-c.b)*f)};
  const t=1+f;return{r:Math.round(c.r*t),g:Math.round(c.g*t),b:Math.round(c.b*t)}}

// ---------- tags ----------
const T={NONE:0,SKIN:1,SKIN2:2,ARM:3,LEG:4,TAIL:5,HEAD:6,EAR:7,HORN:8,ARMOR:9,CLOTH:10,FACE:11,HAND:12,FOOT:13,WEAPON:14,DECOR:15,CAPE:16,HAIR:17,OUT:18};
const SKIN_TAGS=[T.SKIN,T.SKIN2,T.ARM,T.LEG,T.TAIL,T.HEAD,T.EAR,T.HAND,T.FOOT];
const isSkin=t=>SKIN_TAGS.indexOf(t)>=0;

// ---------- raster ----------
class Raster{
  constructor(S){this.S=S;this.col=new Array(S*S).fill(null);this.tag=new Uint8Array(S*S)}
  in(x,y){return x>=0&&y>=0&&x<this.S&&y<this.S}
  set(x,y,c,t){x|=0;y|=0;if(x>=0&&y>=0&&x<this.S&&y<this.S){const i=y*this.S+x;this.col[i]=c;this.tag[i]=t}}
  fillEllipse(cx,cy,rx,ry,c,t){rx=Math.max(rx,.5);ry=Math.max(ry,.5);
    for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++)for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++){
      const dx=(x+.5-cx)/rx,dy=(y+.5-cy)/ry;if(dx*dx+dy*dy<=1)this.set(x,y,c,t)}}
  fillRect(x0,y0,w,h,c,t){x0=Math.round(x0);y0=Math.round(y0);
    for(let y=y0;y<y0+Math.max(1,Math.round(h));y++)for(let x=x0;x<x0+Math.max(1,Math.round(w));x++)this.set(x,y,c,t)}
  fillTri(x0,y0,x1,y1,x2,y2,c,t){
    const minx=Math.floor(Math.min(x0,x1,x2)),maxx=Math.ceil(Math.max(x0,x1,x2));
    const miny=Math.floor(Math.min(y0,y1,y2)),maxy=Math.ceil(Math.max(y0,y1,y2));
    for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){const px=x+.5,py=y+.5;
      const s1=(x1-x0)*(py-y0)-(y1-y0)*(px-x0);
      const s2=(x2-x1)*(py-y1)-(y2-y1)*(px-x1);
      const s3=(x0-x2)*(py-y2)-(y0-y2)*(px-x2);
      const neg=s1<0||s2<0||s3<0,pos=s1>0||s2>0||s3>0;
      if(!(neg&&pos))this.set(x,y,c,t)}}
  capsule(x0,y0,x1,y1,r,c,t){const d=Math.hypot(x1-x0,y1-y0),n=Math.max(1,Math.ceil(d*2));
    for(let i=0;i<=n;i++){const q=i/n;this.fillEllipse(x0+(x1-x0)*q,y0+(y1-y0)*q,r,r,c,t)}}
  // vertical tapered blob: wTop/wBot are half-widths, round 0..1 squares->ellipse caps
  blobV(cx,top,h,wTop,wBot,round,c,t,roundTop){h=Math.max(1,Math.round(h));
    if(roundTop===undefined)roundTop=round;
    for(let yy=0;yy<h;yy++){const q=h<=1?.5:yy/(h-1);
      let half=wTop+(wBot-wTop)*q;
      const e=Math.sqrt(Math.max(0,1-Math.pow(2*q-1,2)));
      const r=q<.5?roundTop:round;
      half*=(1-r)+r*e;half=Math.max(half,.4);
      const y=Math.round(top)+yy;
      for(let x=Math.round(cx-half);x<=Math.round(cx+half);x++)this.set(x,y,c,t)}}
}

// ---------- cellular automata (with symmetry) ----------
function makeCA(w,h,fill,steps,sym,rng){
  let g=new Uint8Array(w*h);
  for(let i=0;i<g.length;i++)g[i]=rng()<fill?1:0;
  const mirror=()=>{if(sym==='none')return;
    for(let y=0;y<h;y++)for(let x=0;x<(w>>1);x++)g[y*w+(w-1-x)]=g[y*w+x];
    if(sym==='radial')for(let y=0;y<(h>>1);y++)for(let x=0;x<w;x++)g[(h-1-y)*w+x]=g[y*w+x];};
  mirror();
  for(let s=0;s<steps;s++){const n=new Uint8Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){let cnt=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;
        const xx=x+dx,yy=y+dy;
        if(xx<0||yy<0||xx>=w||yy>=h)cnt++;else cnt+=g[yy*w+xx];}
      n[y*w+x]=(cnt>4||(cnt===4&&g[y*w+x]))?1:0;}
    g=n;mirror();}
  return{w,h,g,at(x,y){x=Math.max(0,Math.min(w-1,x|0));y=Math.max(0,Math.min(h-1,y|0));return g[y*w+x]}};
}

// ---------- directions & animations ----------
const DIRS=[
  {n:'S', fx: 0,fy: 1},{n:'SW',fx:-1,fy: 1},{n:'W', fx:-1,fy: 0},{n:'NW',fx:-1,fy:-1},
  {n:'N', fx: 0,fy:-1},{n:'NE',fx: 1,fy:-1},{n:'E', fx: 1,fy: 0},{n:'SE',fx: 1,fy: 1}];
const ANIM_NAMES=['walk','run','attack','talk'];
function animFrames(P,a){return(a==='walk'||a==='run')?P.walkFrames:(a==='attack'?4:3)}

// ---------- parameter schema ----------
const SCHEMA=[
  {k:'size',g:'Global',l:'Sprite size',t:'sel',opts:[32,48,64],d:48,num:true},
  {k:'hue',g:'Global',l:'Body hue',t:'r',min:0,max:360,st:1,d:25},
  {k:'sat',g:'Global',l:'Body saturation',t:'r',min:0,max:100,st:1,d:38},
  {k:'lit',g:'Global',l:'Body lightness',t:'r',min:22,max:78,st:1,d:70},
  {k:'hue2',g:'Global',l:'Belly / paw hue',t:'r',min:0,max:360,st:1,d:30},
  {k:'accent',g:'Global',l:'Accent hue',t:'r',min:0,max:360,st:1,d:322},
  {k:'outline',g:'Global',l:'Outline',t:'c',d:true},
  {k:'headSize',g:'Head',l:'Head size',t:'r',min:-1.5,max:1.25,st:.01,d:.5},
  {k:'headRound',g:'Head',l:'Roundness',t:'r',min:.6,max:1,st:.01,d:.8},
  {k:'headTurn',g:'Head',l:'Turn shift',t:'r',min:0,max:4,st:.5,d:2},
  {k:'snout',g:'Head',l:'Snout length',t:'r',min:0,max:4,st:.5,d:0},
  {k:'earType',g:'Head',l:'Ears',t:'sel',opts:['none','round','pointed','long','fin'],d:'none'},
  {k:'earSize',g:'Head',l:'Ear size',t:'r',min:1,max:4.5,st:.5,d:3},
  {k:'hornType',g:'Head',l:'Horns',t:'sel',opts:['none','straight','curved','antler','single'],d:'none'},
  {k:'hornSize',g:'Head',l:'Horn size',t:'r',min:1.5,max:6,st:.5,d:4},
  {k:'crest',g:'Head',l:'Crest / mohawk',t:'c',d:false},
  {k:'hairType',g:'Head',l:'Hair',t:'sel',opts:['none','tuft','spiky','wild','swept','mohawk','curly','topknot','ponytail','bowl','long'],d:'bowl'},
  {k:'hairHue',g:'Head',l:'Hair hue',t:'r',min:0,max:360,st:1,d:25},
  {k:'bodyW',g:'Body',l:'Width',t:'r',min:2,max:5.25,st:.25,d:4},
  {k:'bodyH',g:'Body',l:'Height',t:'r',min:4.5,max:9.5,st:.5,d:8},
  {k:'taper',g:'Body',l:'Taper (pear ↔ buff)',t:'r',min:-.35,max:-.15,st:.05,d:-.25},
  {k:'bodyRound',g:'Body',l:'Roundness',t:'r',min:.35,max:.75,st:.01,d:.5},
  {k:'belly',g:'Body',l:'Belly patch',t:'c',d:true},
  {k:'armLen',g:'Arms',l:'Length',t:'r',min:4,max:5.5,st:.5,d:4.5},
  {k:'armThick',g:'Arms',l:'Thickness',t:'r',min:1.2,max:1.6,st:.1,d:1.4},
  {k:'handSize',g:'Arms',l:'Hand size',t:'r',min:1.3,max:1.8,st:.1,d:1.5},
  {k:'armSpread',g:'Arms',l:'Shoulder spread',t:'r',min:0,max:1,st:.25,d:.5},
  {k:'legLen',g:'Legs',l:'Length',t:'r',min:6,max:7,st:.5,d:6.5},
  {k:'legThick',g:'Legs',l:'Thickness',t:'r',min:1.4,max:2,st:.1,d:1.7},
  {k:'stance',g:'Legs',l:'Stance width',t:'r',min:1.5,max:2.5,st:.25,d:2.25},
  {k:'footSize',g:'Legs',l:'Foot size',t:'r',min:1.8,max:2.4,st:.1,d:2.1},
  {k:'shoes',g:'Legs',l:'Shoes',t:'c',d:true},
  {k:'tailType',g:'Tail',l:'Type',t:'sel',opts:['none','stub','long','spike','fluff'],d:'none'},
  {k:'tailSize',g:'Tail',l:'Size',t:'r',min:4,max:7,st:.5,d:6},
  {k:'helmet',g:'Armor',l:'Helmet',t:'sel',opts:['none','cap','full'],d:'none'},
  {k:'chest',g:'Armor',l:'Chestplate',t:'sel',opts:['none','half','full'],d:'none'},
  {k:'pauldrons',g:'Armor',l:'Pauldrons',t:'c',d:false},
  {k:'boots',g:'Armor',l:'Boots',t:'c',d:false},
  {k:'gauntlets',g:'Armor',l:'Gauntlets',t:'c',d:false},
  {k:'metalHue',g:'Armor',l:'Metal hue',t:'r',min:0,max:360,st:1,d:215},
  {k:'metalLit',g:'Armor',l:'Metal lightness',t:'r',min:25,max:75,st:1,d:56},
  {k:'cloth',g:'Clothing',l:'Garment',t:'sel',opts:['none','shirt','tunic','robe'],d:'tunic'},
  {k:'clothHue',g:'Clothing',l:'Cloth hue',t:'r',min:0,max:360,st:1,d:12},
  {k:'belt',g:'Clothing',l:'Belt',t:'c',d:false},
  {k:'caFill',g:'Pattern (CA)',l:'CA seed density',t:'r',min:.3,max:.62,st:.01,d:.46},
  {k:'caSteps',g:'Pattern (CA)',l:'CA smoothing',t:'r',min:0,max:5,st:1,d:2},
  {k:'caSym',g:'Pattern (CA)',l:'Symmetry',t:'sel',opts:['vertical','radial','none'],d:'vertical'},
  {k:'caScale',g:'Pattern (CA)',l:'Pattern scale',t:'r',min:6,max:24,st:1,d:12},
  {k:'spots',g:'Pattern (CA)',l:'CA spots / markings',t:'c',d:false},
  {k:'stripes',g:'Pattern (CA)',l:'Stripes',t:'c',d:false},
  {k:'tex',g:'Texture',l:'Surface',t:'sel',opts:['smooth','dither','scales','fur'],d:'smooth'},
  {k:'texAmt',g:'Texture',l:'Amount',t:'r',min:0,max:1,st:.05,d:.5},
  {k:'spikes',g:'Decorations',l:'Spikes',t:'sel',opts:['none','back','shoulders','both'],d:'none'},
  {k:'walkFrames',g:'Animation',l:'Walk frames',t:'sel',opts:[4,6],d:6,num:true},
  {k:'bobAmt',g:'Animation',l:'Walk bob',t:'r',min:0,max:2,st:.5,d:1},
  {k:'stride',g:'Animation',l:'Stride',t:'r',min:1,max:2.5,st:.25,d:2},
  {k:'swing',g:'Animation',l:'Arm swing',t:'r',min:0,max:3,st:.25,d:1.5},
  {k:'attackStyle',g:'Animation',l:'Attack style',t:'sel',opts:['slash','stab','cast','claw'],d:'slash'},
  {k:'scale',g:'Export',l:'Export scale',t:'sel',opts:[1,2,3,4],d:2,num:true},
];
function defaultParams(){const P={seed:'sprout'};for(const s of SCHEMA)P[s.k]=s.d;return P}

// ---------- prepare shared context (colors + CA grids, stable across frames) ----------
function prepare(P){
  const seed=hashStr(P.seed);
  const rngA=mulberry32(seed^0xA11CE),rngS=mulberry32(seed^0x5EED5);
  const cs=P.caScale|0;
  return{
    seed,
    skin:hsl(P.hue,P.sat,P.lit),
    skinD:shade(hsl(P.hue,P.sat,P.lit),-.22),
    skin2:hsl(P.hue2,Math.min(70,P.sat+8),Math.min(82,P.lit+18)),
    accent:hsl(P.accent,82,62),
    accentD:hsl(P.accent,70,40),
    metal:hsl(P.metalHue,14,P.metalLit),
    metalD:hsl(P.metalHue,18,Math.max(15,P.metalLit-24)),
    cloth:hsl(P.clothHue,48,42),
    clothD:hsl(P.clothHue,50,28),
    bone:hsl(46,26,82),
    hair:hsl(P.hairHue,55,38),
    shoe:hsl(20,32,27),
    hairD:hsl(P.hairHue,55,26),
    dark:{r:26,g:24,b:30},
    white:{r:243,g:245,b:240},
    steel:{r:206,g:214,b:228},
    steelD:{r:120,g:128,b:148},
    wood:{r:112,g:80,b:52},
    out:hsl(P.hue,34,10),
    caArmor:makeCA(cs,cs,P.caFill,P.caSteps,P.caSym,rngA),
    caSpots:makeCA(cs,cs,Math.min(.58,P.caFill),Math.max(1,P.caSteps),P.caSym,rngS),
  };
}

// ---------- the renderer ----------
function renderFrame(P,C,dirIdx,anim,fi){
  const D=DIRS[dirIdx],fx=D.fx,fy=D.fy,diag=fx!==0&&fy!==0;
  const S=P.size,u=S/48,cx=S/2;
  const g=new Raster(S);
  const TWO=Math.PI*2;

  // ----- pose -----
  let bob=0,ox=0,oy=0,mouth=0,headDy=0;
  let legAdx=0,legAdy=0,legBdx=0,legBdy=0;
  let armAdx=0,armAdy=0,armBdx=0,armBdy=0;
  let atkPhase=-1,gesture=0,leanX=0;
  if(anim==='walk'){
    const N=animFrames(P,'walk'),tt=fi/N,s=Math.sin(tt*TWO),c=Math.cos(tt*TWO);
    bob=Math.round(-Math.abs(s)*P.bobAmt*u);
    if(fx!==0){
      legAdx=s*P.stride*.7*u;legBdx=-s*P.stride*.7*u;
      legAdy=-Math.max(0,c)*2.1*u;legBdy=-Math.max(0,-c)*2.1*u;
      armAdx=-s*P.swing*u;armBdx=s*P.swing*u;
    }else{
      legAdy=-Math.max(0,s)*2.1*u;legBdy=-Math.max(0,-s)*2.1*u;
      armAdy=-Math.max(0,-s)*P.swing*.7*u;armBdy=-Math.max(0,s)*P.swing*.7*u;
    }
  }else if(anim==='run'){
    const N=animFrames(P,'run'),tt=fi/N,ss=Math.sin(tt*TWO),cc=Math.cos(tt*TWO);
    bob=Math.round(-Math.abs(ss)*(P.bobAmt+1.2)*u-.4*u);
    leanX=(fx!==0)?fx*1.7*u*(diag?.7:1):0;
    const strideR=P.stride*1.75,swingR=(P.swing+.6)*1.5;
    if(fx!==0){
      legAdx=ss*strideR*u;legBdx=-ss*strideR*u;
      legAdy=-Math.max(0,cc)*3.3*u;legBdy=-Math.max(0,-cc)*3.3*u;
      armAdx=-ss*swingR*u;armBdx=ss*swingR*u;
      armAdy=-Math.abs(ss)*1*u;armBdy=-Math.abs(ss)*1*u;
    }else{
      legAdy=-Math.max(0,ss)*3.3*u;legBdy=-Math.max(0,-ss)*3.3*u;
      armAdy=-Math.max(0,-ss)*swingR*.8*u;armBdy=-Math.max(0,ss)*swingR*.8*u;
    }
  }else if(anim==='attack'){
    atkPhase=fi;
    const mag=[-1.2,-.4,3,1][fi]*u;
    ox=Math.round(fx*mag*(diag?.75:1));
    oy=Math.round(fy*mag*(diag?.75:1)*.6);
    bob=[0,-1,1,0][fi]*u;
  }else if(anim==='talk'){
    headDy=[0,-1,0][fi]*u;mouth=[0,2,1][fi];gesture=[0,2,3][fi];
  }

  // ----- geometry -----
  const groundY=Math.round(S*.93);
  const legLen=P.legLen*u,hipY=Math.round(groundY-legLen)+oy;
  const sideK=1-.3*Math.abs(fx)*(fy===0?1:.5);
  const bodyH=P.bodyH*u,wMid=P.bodyW*u*sideK;
  const wTop=wMid*(1-P.taper*.35),wBot=wMid*(1+P.taper*.35);
  const bodyTop=hipY-bodyH+2*u+bob;
  const bcx=cx+ox+(fy===0?fx*.8*u:0)+leanX;
  const shoulderY=bodyTop+bodyH*.22;
  const hrX=(4.25+P.headSize)*u,hrY=hrX*1.18;
  const headCx=Math.round(bcx+fx*P.headTurn*u*(diag?.7:(fy===0?.35:1)));
  const headCy=bodyTop+1.2*u-hrY+headDy;
  const headTopY=headCy-hrY;
  const dirX=fx*(diag?.75:1),dirY=fy*(diag?.75:1);

  // legs
  const stanceEff=Math.max(1,P.stance*u*(1-.55*Math.abs(fx)));
  const legBaseX=bcx-leanX;
  const legs=[{x:legBaseX-stanceEff,dx:legAdx,dy:legAdy},{x:legBaseX+stanceEff,dx:legBdx,dy:legBdy}];

  // arms
  const shX=wTop*.85+P.armSpread*u;
  const nearIsB=fx>=0;
  const arms=[
    {sx:bcx-(fx!==0?fx*1.2*u:shX),sy:shoulderY,dx:armAdx,dy:armAdy,near:fx!==0?(fx<0):false},
    {sx:bcx+(fx!==0?fx*1.2*u:shX),sy:shoulderY,dx:armBdx,dy:armBdy,near:fx!==0?(fx>0):true}];
  let weapon=null;
  for(const a of arms){
    a.hx=a.sx+a.dx;a.hy=a.sy+P.armLen*u+a.dy;
    const acting=(a===arms[1])===nearIsB;
    if(atkPhase>=0&&acting){
      const ext=P.armLen*u+1.5*u;
      const poses=[
        {hx:a.sx-dirX*2.5*u,hy:a.sy+1.5*u},
        {hx:a.sx+dirX*.8*u, hy:a.sy-P.armLen*.75*u},
        {hx:a.sx+dirX*ext,  hy:a.sy+dirY*ext*.8+(fy===0?1*u:0)},
        {hx:a.sx+dirX*ext*.5,hy:a.sy+P.armLen*.6*u}];
      a.hx=poses[atkPhase].hx;a.hy=poses[atkPhase].hy;
      let bd;
      if(P.attackStyle==='slash')bd=[[-dirX*.4,-1],[dirX*.3,-1],[dirX,dirY*.8-(fy===0?0:0)],[dirX*.8,.7]][atkPhase];
      else if(P.attackStyle==='stab')bd=[[dirX,dirY*.8],[dirX,dirY*.8],[dirX,dirY*.8],[dirX,dirY*.8]][atkPhase];
      else bd=[[0,-1],[0,-1],[0,-1],[0,-1]][atkPhase];
      let bl=Math.hypot(bd[0],bd[1]);if(bl<1e-6){bd=[0,-1];bl=1}
      weapon={hx:a.hx,hy:a.hy,ux:bd[0]/bl,uy:bd[1]/bl,phase:atkPhase};
    }
    if(anim==='talk'&&acting&&gesture>0){a.hx=a.sx+(fx===0?1:fx)*1.5*u;a.hy=a.sy+P.armLen*u-gesture*1.3*u}
  }

  // tail vector
  let tailPts=null;
  if(P.tailType!=='none'){
    const ts=P.tailSize*u;
    let ax,ay,vx,vy;
    if(fy>0){ax=bcx+(fx===0?1:-fx)*wBot*.9;ay=bodyTop+bodyH*.7;vx=(fx===0?.7:-fx*.9);vy=-.6}
    else if(fy<0){ax=bcx+ (fx===0?0:-fx*wBot*.3);ay=bodyTop+bodyH*.72;vx=(fx===0?.18:-fx*.4);vy=.85}
    else{ax=bcx-fx*wBot*.85;ay=bodyTop+bodyH*.68;vx=-fx;vy=-.4}
    const vl=Math.hypot(vx,vy);vx/=vl;vy/=vl;
    const wag=(anim==='walk')?Math.sin(fi/animFrames(P,'walk')*TWO)*1.4*u:(anim==='talk'?(fi-1)*u:0);
    tailPts={ax,ay,vx,vy,ts,wag};
  }

  // ----- palette shortcuts -----
  const K=C;const skin=K.skin,skin2=K.skin2;
  const farTint=c=>shade(c,-.14);

  // ----- part painters -----
  const drawTail=()=>{if(!tailPts)return;const t=tailPts,ty=P.tailType;
    const px=t.vy,py=-t.vx;
    if(ty==='stub'){g.fillEllipse(t.ax+t.vx*2*u,t.ay+t.vy*2*u,t.ts*.35+.5,t.ts*.35+.5,skin,T.TAIL);return}
    const segs=3,pts=[[t.ax,t.ay]];
    for(let i=1;i<=segs;i++){const q=i/segs,curl=q*q*t.wag;
      pts.push([t.ax+t.vx*t.ts*q+px*curl,t.ay+t.vy*t.ts*q*.9+py*curl])}
    for(let i=0;i<segs;i++){const r=(ty==='fluff'?1.6:1.1)*u*(1-.18*i)+.3;
      g.capsule(pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1],r,skin,T.TAIL)}
    const tip=pts[segs];
    if(ty==='spike')g.fillTri(tip[0]-1.4*u,tip[1]+1,tip[0]+1.4*u,tip[1]+1,tip[0]+t.vx*3*u,tip[1]+t.vy*3*u,K.accentD,T.TAIL);
    else if(ty==='fluff')g.fillEllipse(tip[0],tip[1],2.2*u,2.2*u,skin2,T.TAIL);
    else g.fillEllipse(tip[0],tip[1],1.1*u,1.1*u,skin2,T.TAIL);
  };
  const drawLeg=(L,i)=>{
    const footX=L.x+L.dx,footY=groundY+L.dy;
    const col=(fx!==0&&i===(fx>0?0:1))?farTint(skin):skin;
    g.capsule(L.x,hipY,footX,footY-1*u,Math.max(.8,P.legThick*u*.62),col,T.LEG);
    const fcol=P.shoes?K.shoe:skin2,ftag=P.shoes?T.CLOTH:T.FOOT;
    g.fillEllipse(footX+fx*P.footSize*u*.5,footY-P.footSize*u*.35,P.footSize*u*.7+.4,P.footSize*u*.5+.3,
      (fx!==0&&i===(fx>0?0:1))?farTint(fcol):fcol,ftag);
    if(P.boots){
      const midY=(hipY+footY)/2+ (footY-hipY)*.15;
      g.capsule(L.x+(L.dx*.5),midY,footX,footY-1*u,Math.max(.9,P.legThick*u*.68),K.metalD,T.ARMOR);
      g.fillEllipse(footX+fx*P.footSize*u*.5,footY-P.footSize*u*.35,P.footSize*u*.75+.4,P.footSize*u*.55+.3,K.metal,T.ARMOR);
    }
  };
  const drawBody=()=>{
    g.blobV(bcx,bodyTop,bodyH,wTop,wBot,P.bodyRound,skin,T.SKIN,P.bodyRound*.35);
    if(P.belly&&fy>=0)
      g.blobV(bcx+fx*wMid*.28,bodyTop+bodyH*.32,bodyH*.62,wBot*.45,wBot*.55,.85,skin2,T.SKIN2);
  };
  const drawCloth=()=>{
    const sway=(anim==='walk')?legAdx*.4:0;
    if(P.cloth==='shirt'){
      g.blobV(bcx+sway*.2,bodyTop+1*u,(bodyTop+bodyH*.62+2*u)-(bodyTop+1*u),wTop*1.03,wMid*1.02,P.bodyRound,K.cloth,T.CLOTH,P.bodyRound*.35);
    }else if(P.cloth==='tunic'){
      g.blobV(bcx+sway*.3,bodyTop+bodyH*.4+2*u,(hipY+2.5*u)-(bodyTop+bodyH*.4),wMid*1.02,wBot*1.02,.12,K.cloth,T.CLOTH,.05);
    }else if(P.cloth==='robe'){
      g.blobV(bcx+sway,bodyTop+bodyH*.3,(groundY-1*u)-(bodyTop+bodyH*.3),wMid*1.02,wBot*1.15,.15,K.cloth,T.CLOTH);
    }
    if(P.chest!=='none'){
      const frac=P.chest==='full'?.92:.52;
      g.blobV(bcx,bodyTop-1,bodyH*frac,wTop*1.06,(P.chest==='full'?wBot:wMid)*1.0,P.bodyRound*.9,K.metal,T.ARMOR);
    }
    if(P.belt){
      const by=bodyTop+bodyH*.62+2*u;
      g.fillRect(bcx-wBot*1.02,by,wBot*2.04+1,Math.max(1,1.1*u),K.clothD,T.CLOTH);
      if(fy>=0)g.set(bcx+fx*1.5*u,by,K.accent,T.CLOTH);
    }
  };
  const drawSpikesBack=()=>{
    if(P.spikes!=='back'&&P.spikes!=='both')return;
    const col=shade(K.accentD,-.05);
    if(fx!==0){for(let i=0;i<3;i++){
      const sx=bcx-fx*(i*2.4*u-1*u),sy=bodyTop+.6*u+i*.9*u;
      g.fillTri(sx-1.3*u,sy+1.5*u,sx+1.3*u,sy+1.5*u,sx-fx*.8*u,sy-2.6*u,col,T.DECOR)}}
    else{for(let i=-1;i<=1;i++){
      const sx=bcx+i*wTop*.55,sy=bodyTop+.5*u;
      g.fillTri(sx-1.2*u,sy+1.4*u,sx+1.2*u,sy+1.4*u,sx,sy-2.4*u,col,T.DECOR)}}
  };
  const drawPauldrons=()=>{if(!P.pauldrons)return;
    for(const i of[-1,1]){const sx=bcx+(fx!==0?fx*i*1.8*u:i*shX),vis=fx===0||i===1;
      g.fillEllipse(fx!==0?bcx+i*2*u:sx,shoulderY-.8*u,2.1*u,1.7*u,vis?K.metal:farTint(K.metal),T.ARMOR)}
    if(P.spikes==='shoulders'||P.spikes==='both')for(const i of[-1,1]){
      const sx=fx!==0?bcx+i*2*u:bcx+i*shX;
      g.fillTri(sx-1*u,shoulderY-1.2*u,sx+1*u,shoulderY-1.2*u,sx+i*1.4*u,shoulderY-4.2*u,K.steelD,T.DECOR)}
  };
  const drawArm=a=>{
    let col=a.near?skin:farTint(skin);
    g.capsule(a.sx,a.sy,a.hx,a.hy,Math.max(.7,P.armThick*u*.55),col,T.ARM);
    const hc=P.gauntlets?K.metal:(a.near?skin2:farTint(skin2));
    g.fillEllipse(a.hx,a.hy,P.handSize*u*.6+.3,P.handSize*u*.6+.3,hc,P.gauntlets?T.ARMOR:T.HAND);
  };
  const drawEars=()=>{if(P.earType==='none')return;const es=P.earSize*u;
    for(const i of[-1,1]){
      const ex=headCx+i*hrX*.62+fx*1.2*u,ey=headTopY+1.2*u;
      const col=(fx!==0&&i===-fx)?farTint(skin):skin;
      if(P.earType==='round'){g.fillEllipse(ex,ey-es*.25,es*.55+.5,es*.55+.5,col,T.EAR);
        if(fy>=0)g.fillEllipse(ex,ey-es*.2,es*.26,es*.26,skin2,T.EAR)}
      else if(P.earType==='pointed')g.fillTri(ex-es*.5,ey+1.6*u,ex+es*.5,ey+1.6*u,ex+i*es*.3,ey-es,col,T.EAR);
      else if(P.earType==='long'){g.capsule(ex,ey+1,ex+i*es*.35,ey-es*1.5,Math.max(.8,.9*u),col,T.EAR);
        g.fillEllipse(ex+i*es*.35,ey-es*1.5,1*u,1.2*u,col,T.EAR)}
      else if(P.earType==='fin')g.fillTri(ex,ey+2*u,ex,ey-1.2*u,ex+i*es,ey+.6*u,col,T.EAR);
    }};
  const drawHorns=()=>{if(P.hornType==='none')return;const hs=P.hornSize*u;
    const one=P.hornType==='single';
    for(const i of(one?[0]:[-1,1])){
      const hx=headCx+i*hrX*.45+fx*1*u,hy=headTopY+1.2*u;
      if(P.hornType==='straight'||one)g.capsule(hx,hy,hx+i*hs*.3,hy-hs,Math.max(.7,.85*u),K.bone,T.HORN);
      else if(P.hornType==='curved'){g.capsule(hx,hy,hx+i*hs*.55,hy-hs*.6,Math.max(.7,.9*u),K.bone,T.HORN);
        g.capsule(hx+i*hs*.55,hy-hs*.6,hx+i*hs*.2,hy-hs*1.15,Math.max(.6,.6*u),K.bone,T.HORN)}
      else if(P.hornType==='antler'){g.capsule(hx,hy,hx+i*hs*.25,hy-hs,Math.max(.6,.7*u),K.bone,T.HORN);
        g.capsule(hx+i*hs*.12,hy-hs*.5,hx+i*hs*.65,hy-hs*.75,Math.max(.5,.55*u),K.bone,T.HORN)}
    }};
  const drawCrest=()=>{if(!P.crest)return;const col=K.accent;
    if(fx!==0){for(let i=0;i<3;i++){const sx=headCx-fx*(i*2.2*u-2*u),sy=headTopY+1*u;
      g.fillTri(sx-1.1*u,sy+1.5*u,sx+1.1*u,sy+1.5*u,sx-fx*.6*u,sy-(3.4-i*.7)*u,col,T.HAIR)}}
    else{g.fillTri(headCx-1.2*u,headTopY+1.6*u,headCx+1.2*u,headTopY+1.6*u,headCx,headTopY-3.2*u,col,T.HAIR);
      if(fy<0)g.fillRect(headCx-.6*u,headTopY+1*u,1.2*u,hrY*1.2,K.accentD,T.HAIR)}
  };
  const drawHair=()=>{
    if(P.hairType==='none'||P.helmet!=='none')return;
    const hc=K.hair,hcD=K.hairD,ht=P.hairType;
    if(ht==='tuft'){g.fillEllipse(headCx+fx*1*u,headTopY+.4*u,hrX*.45,2*u,hc,T.HAIR);return}
    const hoff0=fx*(fy===0?.75:.9)*u;
    if(ht==='mohawk'){
      g.fillRect(headCx+hoff0-1.6*u,headTopY-1.5*u,3.2*u,2.5*u,hcD,T.HAIR);
      for(let i=-2;i<=2;i++){const sx=headCx+hoff0+i*1.1*u,sy=headTopY-1*u,lift=(4-Math.abs(i)*.6)*u;
        g.fillTri(sx-1*u,sy+1.6*u,sx+1*u,sy+1.6*u,sx-fx*.5*u,sy-lift,hc,T.HAIR)}
      return}
    const capH=hrY*(ht==='spiky'?.9:1.05);
    const hoff=fx*(fy===0?.75:.9)*u;const capW=hrX*(fy===0?1.15:1.5);
    g.blobV(headCx+hoff,headTopY-2*u,capH+1*u,capW,capW*.77,P.headRound*.9,hc,T.HAIR);
    if(fy<0)g.blobV(headCx+hoff,headTopY-2*u,hrY*2,hrX*1.45,hrX*1.05,P.headRound,hc,T.HAIR);
    if(fy>=0)for(const i of[-1,1])g.fillRect(headCx+i*hrX*.72+fx*1*u+(i<0?-2*u:0),headTopY-2*u+capH-1*u,Math.max(1,2*u),4.5*u,hc,T.HAIR);
    if(fy>=0)for(let i=-2;i<=2;i+=2){
      const jx=headCx+fx*hrX*.25+i*hrX*.36;
      g.fillRect(jx,headTopY-1*u+capH,Math.max(1,.9*u),Math.max(1,1*u),hc,T.HAIR)}
    if(ht==='spiky')for(let i=-1;i<=1;i++){
      const sx=headCx+hoff+i*hrX*.7,sy=headTopY-1*u;
      g.fillTri(sx-1.4*u,sy+1.8*u,sx+1.4*u,sy+1.8*u,sx+i*2*u,sy-4*u,hc,T.HAIR)}
    else if(ht==='wild'){
      const n=5;for(let i=0;i<n;i++){const t=(i/(n-1))*2-1;
        const sx=headCx+hoff+t*hrX*.8,sy=headTopY-1*u;
        const lift=(4.5-Math.abs(t)*1.5)*u, back=-fx*Math.abs(t)*1.2*u;
        g.fillTri(sx-1.5*u,sy+1.8*u,sx+1.5*u,sy+1.8*u,sx+t*1.6*u+back,sy-lift,hc,T.HAIR)}
    }else if(ht==='swept'){
      const dir=(fx!==0?fx:1);
      for(let i=0;i<5;i++){const q=i/4;
        const bx=headCx+hoff-dir*hrX*.7+dir*q*hrX*1.5;
        const by=headTopY-2*u+capH-1*u+Math.sin(q*Math.PI)*-1.5*u;
        g.fillRect(bx,by,Math.max(1,1.4*u),Math.max(1,2.4*u),hc,T.HAIR)}
      g.fillEllipse(headCx+hoff+dir*hrX*.4,headTopY-1*u,hrX*.5,1.6*u,hcD,T.HAIR);
    }else if(ht==='topknot'){
      g.fillRect(headCx+hoff-.7*u,headTopY-3*u,1.4*u,2.5*u,hcD,T.HAIR);
      g.fillEllipse(headCx+hoff,headTopY-3.4*u,2.1*u,2*u,hc,T.HAIR);
    }else if(ht==='curly'){
      for(let i=-2;i<=2;i++){const cx2=headCx+hoff+i*hrX*.42;
        g.fillEllipse(cx2,headTopY-1.6*u,1.5*u,1.5*u,hc,T.HAIR);
        g.fillEllipse(cx2+hrX*.2,headTopY-.2*u,1.3*u,1.3*u,hcD,T.HAIR)}
      if(fy>=0)for(const i of[-1,1])g.fillEllipse(headCx+i*hrX*.8+fx*u,headTopY+hrY*.4,1.4*u,1.6*u,hcD,T.HAIR);
    }else if(ht==='ponytail'){
      const px=headCx-fx*hrX*.55,py=headTopY+hrY*.35;
      g.blobV(px,py,hrY*1.9+2*u,1.7*u,1.1*u,.3,hcD,T.HAIR);
      g.fillEllipse(px,py,1.4*u,1.3*u,hc,T.HAIR);
    }else if(ht==='long'){for(const i of[-1,1])
      g.blobV(headCx+i*hrX*1.05,headTopY+hrY*.4,hrY*1.7+2*u,1.4*u,1*u,.3,hcD,T.HAIR);
      if(fy<0)g.blobV(headCx,headTopY+hrY,hrY*1.5,hrX*.85,hrX*.55,.3,hcD,T.HAIR)}
  };
  const drawHead=()=>{
    g.blobV(headCx,headTopY,hrY*2,hrX,hrX*.78,P.headRound,skin,T.HEAD);
    if(P.snout>0){
      if(fy>0&&fx===0)g.fillEllipse(headCx,headCy+hrY*.38,P.snout*.5*u+1,P.snout*.35*u+.7,skin2,T.HEAD);
      else if(fx!==0){
        g.fillEllipse(headCx+fx*(hrX*.68+P.snout*.4*u),headCy+hrY*.15,P.snout*.55*u+.8,P.snout*.4*u+.8,skin,T.HEAD);
      }
    }
    if(P.helmet!=='none'){
      const frac=P.helmet==='full'?2:1.05;
      g.blobV(headCx,headTopY-1,hrY*frac,hrX*1.07,hrX*(P.helmet==='full'?1.07:.95),P.headRound,K.metal,T.ARMOR);
      if(P.helmet==='cap')g.fillRect(headCx-hrX*1.05,headTopY-1+hrY*1.02,hrX*2.1,Math.max(1,1*u),K.metalD,T.ARMOR);
    }
  };
  const drawWeapon=()=>{
    if(!weapon||atkPhase<0)return;const w=weapon,st=P.attackStyle;
    if(st==='claw'){
      if(atkPhase===2){for(let i=-1;i<=1;i++){
        const px=w.hx+dirX*2.5*u+w.uy*i*1.6*u,py=w.hy+dirY*2*u-w.ux*i*1.6*u;
        g.capsule(px,py,px+dirX*3*u,py+dirY*2.4*u,.5,K.white,T.WEAPON)}}
      return}
    if(st==='cast'){
      g.capsule(w.hx,w.hy+2*u,w.hx,w.hy-6*u,Math.max(.6,.7*u),K.wood,T.WEAPON);
      g.fillEllipse(w.hx,w.hy-6.5*u,1.3*u,1.3*u,K.accent,T.WEAPON);
      if(atkPhase>=1){const r=(atkPhase)*2.2*u,pxc=bcx+dirX*(wMid+4*u),pyc=shoulderY+dirY*4*u;
        for(let i=0;i<5;i++){const an=i/5*TWO+atkPhase;
          g.set(pxc+Math.cos(an)*r,pyc+Math.sin(an)*r*.7,i%2?K.accent:K.white,T.WEAPON)}
        if(atkPhase===2)g.fillEllipse(pxc,pyc,1.5*u,1.2*u,K.accent,T.WEAPON)}
      return}
    const wl=(st==='stab'?9:7)*u,r=st==='stab'?.55*u:.7*u;
    const tipx=w.hx+w.ux*wl,tipy=w.hy+w.uy*wl;
    g.capsule(w.hx+w.ux*1.5*u,w.hy+w.uy*1.5*u,tipx,tipy,Math.max(.5,r),K.steel,T.WEAPON);
    g.set(tipx,tipy,K.white,T.WEAPON);
    g.capsule(w.hx+w.ux*1.2*u-w.uy*1.2*u,w.hy+w.uy*1.2*u+w.ux*1.2*u,
              w.hx+w.ux*1.2*u+w.uy*1.2*u,w.hy+w.uy*1.2*u-w.ux*1.2*u,.5,K.steelD,T.WEAPON);
    if(atkPhase===2&&st==='slash'){
      for(let i=-1;i<=1;i++)g.set(w.hx+w.ux*wl*.7+w.uy*i*2.2*u,w.hy+w.uy*wl*.7-w.ux*i*2.2*u,K.white,T.WEAPON)}
  };

  // ----- draw order -----
  const far=arms[fx>=0?0:1],near=arms[fx>=0?1:0];
  const weaponBehind=fy<0;
  if(weaponBehind)drawWeapon();
  if(fy>=0)drawTail();
  if(fx!==0)drawArm(far);
  drawLeg(legs[0],0);drawLeg(legs[1],1);
  drawBody();drawCloth();drawSpikesBack();drawPauldrons();
  if(fy<0)drawTail();
  if(fx!==0)drawArm(near);else{drawArm(arms[0]);drawArm(arms[1])}
  drawEars();drawHorns();drawCrest();
  drawHead();drawHair();
  if(!weaponBehind)drawWeapon();

  // ----- texture pass -----
  if(P.tex!=='smooth'&&P.texAmt>0){
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){const i=y*S+x,t=g.tag[i];
      if(!g.col[i]||!isSkin(t))continue;let f=0;
      if(P.tex==='dither'){if(((x+y)&1)&&x>cx)f=-.1*P.texAmt*2}
      else if(P.tex==='scales'){if((x+(y>>1))%3===0&&y%2===0)f=-.13*P.texAmt*2}
      else if(P.tex==='fur'){const n=hash2(x,y,C.seed%1000);if(n<.16)f=-.12*P.texAmt*2;else if(n>.92)f=.08*P.texAmt*2}
      if(f)g.col[i]=shade(g.col[i],f);}
  }
  // stripes
  if(P.stripes){for(let y=0;y<S;y++)for(let x=0;x<S;x++){const i=y*S+x;
    if(!g.col[i]||!isSkin(g.tag[i]))continue;
    if(Math.floor((y+((x*7)%3))/2)%3===0)g.col[i]=shade(g.col[i],-.2)}}
  // CA spots (skin markings)
  if(P.spots){const ca=C.caSpots;
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){const i=y*S+x;
      if(!g.col[i]||!isSkin(g.tag[i]))continue;
      if(ca.at(x/S*ca.w,y/S*ca.h))g.col[i]=shade({r:(g.col[i].r+C.skinD.r)>>1,g:(g.col[i].g+C.skinD.g)>>1,b:(g.col[i].b+C.skinD.b)>>1},-.08)}}
  // CA engraving on armor + cloth trim
  {const ca=C.caArmor;
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){const i=y*S+x;
      if(!g.col[i])continue;const t=g.tag[i];
      if(t===T.ARMOR){if(ca.at(x/S*ca.w,y/S*ca.h))g.col[i]=shade(g.col[i],-.2)}
      else if(t===T.CLOTH){if(ca.at(x/S*ca.w,y/S*ca.h))g.col[i]=shade(g.col[i],-.12)}}}

  // ----- shading pass (top-lit, left-lit) -----
  {const tg=g.tag.slice(),cl=g.col.slice();
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){const i=y*S+x;
      if(!cl[i]||tg[i]===T.FACE)continue;let f=0;
      const up=y>0?tg[i-S]:0,dn=y<S-1?tg[i+S]:0,lf=x>0?tg[i-1]:0;
      const cu=y>0?cl[i-S]:null,cd=y<S-1?cl[i+S]:null,cle=x>0?cl[i-1]:null;
      if(!cu||up!==tg[i])f+=.13;
      else if(!cd||dn!==tg[i])f-=.15;
      if(!cle||lf!==tg[i])f+=.05;
      if(f)g.col[i]=shade(cl[i],f);}}

  // ----- outline pass -----
  if(P.outline){const snap=g.col.slice();
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){const i=y*S+x;
      if(snap[i])continue;
      const n=(x>0&&snap[i-1])||(x<S-1&&snap[i+1])||(y>0&&snap[i-S])||(y<S-1&&snap[i+S]);
      if(n){g.col[i]=C.out;g.tag[i]=T.OUT}}}

  return g;
}

const ANIM_FPS={walk:9,run:13,attack:10,talk:6};
function sheetMeta(P){
  let col=0;const animations={};
  for(const a of ANIM_NAMES){const fr=animFrames(P,a);
    animations[a]={startCol:col,frames:fr,fps:ANIM_FPS[a]||8};col+=fr;}
  return{frameSize:P.size,exportScale:P.scale,rows:DIRS.map(d=>d.n),
    animations,totalCols:col,
    note:'row = direction (S,SW,W,NW,N,NE,E,SE clockwise), col = animation frame'};
}
const PRESETS={
  Villager:{earType:'round',earSize:2.5,hornType:'none',tailType:'none',snout:0,cloth:'shirt',belt:true,
    chest:'none',helmet:'none',pauldrons:false,boots:false,gauntlets:false,
    tex:'smooth',spikes:'none',spots:false,stripes:false,crest:false,attackStyle:'stab',bodyW:4,taper:-.2,legLen:6,armLen:4.5,hairType:'bowl',hairHue:28},
  Hero:{earType:'round',earSize:2,hornType:'none',tailType:'none',snout:0,cloth:'tunic',belt:true,chest:'half',
    pauldrons:true,boots:true,gauntlets:false,helmet:'none',tex:'smooth',
    spikes:'none',spots:false,crest:true,attackStyle:'slash',bodyW:4.25,legLen:7,armLen:5,crest:false,hairType:'wild',hairHue:8},
  Knight:{chest:'full',helmet:'full',pauldrons:true,boots:true,gauntlets:true,cloth:'none',belt:true,
    earType:'none',hornType:'none',tailType:'none',snout:0,crest:false,spikes:'shoulders',spots:false,
    attackStyle:'slash',bodyW:4.5,taper:-.3,legLen:6.5,armLen:5,hairType:'none',caSym:'vertical'},
  Beast:{snout:3.5,earType:'pointed',earSize:4,tailType:'fluff',tailSize:7,tex:'fur',texAmt:.7,spots:true,
    hornType:'none',cloth:'none',belt:false,chest:'none',helmet:'none',pauldrons:false,boots:false,
    gauntlets:false,attackStyle:'claw',bodyW:4.5,taper:-.15,legLen:6,armLen:4,crest:false,spikes:'none',hairType:'none',headSize:.6,cloth:'none',shoes:false,hue:105,lit:48},
  Imp:{hornType:'curved',hornSize:5.5,tailType:'spike',tailSize:7,earType:'fin',earSize:4,
    spikes:'back',cloth:'none',chest:'none',helmet:'none',pauldrons:false,boots:false,gauntlets:false,
    belt:false,spots:false,stripes:true,tex:'dither',texAmt:.5,attackStyle:'cast',hue:280,hue2:250,accent:130,
    lit:44,bodyW:3.75,taper:-.2,legLen:6,armLen:4.5,crest:false,snout:1.5,hairType:'none',cloth:'none',shoes:false},
};

function rasterToImageData(r){
  const S=r.S, data=new Uint8ClampedArray(S*S*4);
  for(let i=0;i<S*S;i++){const col=r.col[i];if(!col)continue;
    data[i*4]=col.r;data[i*4+1]=col.g;data[i*4+2]=col.b;data[i*4+3]=255;}
  return {data,S};
}
return {mulberry32,hashStr,hsl,shade,makeCA,Raster,DIRS,ANIM_NAMES,animFrames,SCHEMA,defaultParams,prepare,renderFrame,sheetMeta,T,PRESETS,rasterToImageData};
})();

/* ============================================================
   CFHelp — bridge from Creature Forge params to baked,
   Y-sortable, 8-direction animated game sprites.
   ============================================================ */
const CFHelp = (function(){
  const hashSeed = U.hashStr;
  function pick(rng,arr){ return arr[(rng()*arr.length)|0]; }

  // Map an atan2 angle (screen space, +x right, +y down) to a CF direction row.
  function angToDir(ang){
    let a = ang % (Math.PI*2); if(a<0) a+=Math.PI*2;
    const sector = Math.round(a/(Math.PI/4)) % 8; // 0=E,1=SE,2=S,3=SW,4=W,5=NW,6=N,7=NE
    const MAP = [6,7,0,1,2,3,4,5];                // -> CF row indices
    return MAP[sector];
  }

  // Bake a creature: FRAMES[anim][dir][frame] = canvas.
  // `anims` (optional) limits which animations are baked — 'walk' is always
  // included so every consumer has a safe fallback.
  function bakeCreature(params, drawSize, anims){
    const P = {...CF.defaultParams(), ...params};
    const C = CF.prepare(P);
    const S = P.size;
    const scale = Math.max(1, Math.round(drawSize / S));
    const box = S*scale;
    let list = anims ? anims.slice() : CF.ANIM_NAMES.slice();
    if(!list.includes('walk')) list.unshift('walk');
    const FRAMES = {};
    for(const a of list){
      FRAMES[a] = [];
      for(let d=0; d<8; d++){
        const arr=[];
        const n = CF.animFrames(P, a);
        for(let f=0; f<n; f++){
          const r = CF.renderFrame(P, C, d, a, f);
          const id = CF.rasterToImageData(r);
          const tmp = document.createElement('canvas'); tmp.width=S; tmp.height=S;
          const tc = tmp.getContext('2d');
          tc.putImageData(new ImageData(id.data, S, S), 0, 0);
          const cv = document.createElement('canvas'); cv.width=box; cv.height=box;
          const cc = cv.getContext('2d'); cc.imageSmoothingEnabled=false;
          cc.drawImage(tmp, 0, 0, box, box);
          arr.push(cv);
        }
        FRAMES[a].push(arr);
      }
    }
    return { FRAMES, params:P, native:S, scale, box, fps:{walk:9,run:13,attack:11,talk:6} };
  }

  // draw a baked creature with its feet anchored at (x,y); optional extra scale
  function drawCreatureSprite(ctx, sprite, x, y, dirIdx, anim, animClock, extraScale){
    let F = sprite.FRAMES[anim];
    if(!F) F = sprite.FRAMES.walk;
    const frames = F[dirIdx|0] || F[0];
    const n = frames.length;
    const fps = sprite.fps[anim] || 9;
    let f = Math.floor((animClock||0)*fps) % n; if(f<0) f+=n; if(!(f>=0)) f=0;
    const cv = frames[f];
    if(!cv) return;
    const s = extraScale||1;
    const w = cv.width*s, h = cv.height*s;
    ctx.drawImage(cv, Math.round(x - w/2), Math.round(y - h*0.86), w, h);
  }

  /* ---------- archetype recipes (structure only; colours layered on) ---------- */
  const ARCHETYPES = {
    player: (rng)=>{
      const heroish = rng()<0.5 ? CF.PRESETS.Hero : CF.PRESETS.Villager;
      return { size:48, ...heroish,
        cloth: pick(rng,['tunic','shirt','robe']),
        hairType: pick(rng,['wild','swept','topknot','ponytail','bowl','spiky','long']),
        chest: pick(rng,['none','half']),
        pauldrons: rng()<0.5, boots: rng()<0.5, belt:true,
        attackStyle: pick(rng,['slash','stab']),
        tailType:'none', hornType:'none', earType: pick(rng,['none','round']),
        walkFrames:6, outline:true,
      };
    },
    slime: (rng)=>({ size:32,
      bodyW:4.5, bodyH:5.5, taper:-.15, bodyRound:.72, headSize:-0.6, headRound:.95,
      earType:'none', hornType:'none', tailType: pick(rng,['none','stub']),
      armLen:4, legLen:6, legThick:1.6, footSize:2.0,
      cloth:'none', shoes:false, chest:'none', helmet:'none', hairType:'none',
      tex: pick(rng,['smooth','dither']), texAmt:.5, spots: rng()<0.5,
      snout:0, attackStyle:'stab', walkFrames:4, outline:true, belt:false, belly:true,
    }),
    wisp: (rng)=>({ size:32,
      bodyW:2.6, bodyH:6.5, taper:-.2, bodyRound:.6, headSize:-0.2, headRound:.85,
      earType: pick(rng,['fin','pointed']), earSize:3.5, hornType:'none',
      tailType: pick(rng,['spike','long','fluff']), tailSize:6,
      armLen:5, legLen:6.5, legThick:1.4,
      cloth:'none', shoes:false, chest:'none', helmet:'none', hairType:'none',
      tex:'dither', texAmt:.6, stripes: rng()<0.5, spikes: pick(rng,['none','back']),
      snout: rng()<0.5?1.5:0, attackStyle:'cast', walkFrames:6, outline:true, belt:false,
    }),
    brute: (rng)=>({ size:48,
      bodyW:5.0, bodyH:8, taper:-.15, bodyRound:.55, headSize:0.6, headRound:.8,
      earType: pick(rng,['round','pointed']), earSize:3,
      hornType: pick(rng,['straight','curved','antler']), hornSize:4.5,
      tailType: pick(rng,['fluff','long','none']), tailSize:6,
      armLen:4.5, armThick:1.6, handSize:1.8, legLen:6, legThick:2.0, stance:2.5, footSize:2.4,
      cloth:'none', shoes:false, chest: pick(rng,['none','half']), helmet:'none',
      hairType:'none', tex: pick(rng,['fur','scales']), texAmt:.7, spots: rng()<0.5,
      spikes: pick(rng,['none','shoulders','back']), snout: pick(rng,[0,2,3.5]),
      attackStyle: pick(rng,['claw','slash']), walkFrames:6, outline:true, belt:false,
    }),
    boss: (rng)=>({ size:64,
      bodyW:5.25, bodyH:9, taper:-.15, bodyRound:.5, headSize:0.8, headRound:.78,
      earType: pick(rng,['pointed','fin']), earSize:4,
      hornType: pick(rng,['curved','antler','straight']), hornSize:6,
      tailType: pick(rng,['spike','fluff','long']), tailSize:7,
      armLen:5, armThick:1.6, handSize:1.8, legLen:6.5, legThick:2.0, stance:2.5, footSize:2.4,
      cloth:'none', shoes:false, chest: pick(rng,['half','full']), helmet: pick(rng,['none','cap','full']),
      pauldrons:true, hairType:'none', tex: pick(rng,['fur','scales','dither']), texAmt:.8,
      spots: rng()<0.5, stripes: rng()<0.5, spikes: pick(rng,['back','shoulders','both']),
      crest: rng()<0.5, snout: pick(rng,[0,2,3.5]),
      attackStyle: pick(rng,['slash','claw','cast']), walkFrames:6, outline:true, belt:false,
    }),
  };

  // a surface villager: soft colours, everyday clothes, human-ish proportions
  function villagerParams(lookSeed, opts){
    opts = opts||{};
    const rng = CF.mulberry32(hashSeed(lookSeed)^0xF01C);
    const P = { ...CF.PRESETS.Villager, size:32, walkFrames:4, outline:true, seed:lookSeed };
    P.cloth = pick(rng,['shirt','tunic','tunic','robe']);
    P.hairType = pick(rng,['bowl','swept','curly','ponytail','topknot','long','tuft','spiky']);
    P.hairHue = Math.round(rng()*360);
    P.clothHue = Math.round(rng()*360);
    P.hue = 18+Math.round(rng()*30);          // warm skin family
    P.sat = 26+Math.round(rng()*26);
    P.lit = 42+Math.round(rng()*30);
    P.hue2 = P.hue+8;
    P.accent = Math.round(rng()*360);
    P.belt = rng()<0.6;
    P.bodyW = 3.5+rng()*1.2;
    P.headSize = 0.3+rng()*0.7;
    if(opts.elder){ P.hairHue=40; P.hairType=pick(rng,['long','bowl','tuft','topknot']); P.cloth='robe'; }
    return P;
  }
  return {angToDir, bakeCreature, drawCreatureSprite, ARCHETYPES, villagerParams, pick};
})();
