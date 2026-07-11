'use strict';
/* ============================================================
   SEED & SAGE — plants.js
   PLANT FORGE core (deterministic procedural pixel flora),
   plus a small baking helper that turns a preset + seed into
   a ready-to-draw canvas for the surface garden.
   ============================================================ */
const PF = (function(){
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;
  return((t^t>>>14)>>>0)/4294967296;}}
function clamp(v,a,b){return v<a?a:(v>b?b:v);}
function hash2(x,y){let h=(x*73856093 ^ y*19349663)>>>0; return (h%1024)/1024;}

const PALETTES={
  meadow:{stem:['#3c6b2f','#4f8a3d','#66a84e'],
    leaf:['#2e5d27','#49913a','#63b44c','#8ad168'],
    blooms:[['#f4f2e8','#f5c542'],['#f2a0c0','#d94f70'],['#f5c542','#c97b1e']]},
  forest:{stem:['#5a3d26','#7a5433','#4f8a3d'],
    leaf:['#1e4620','#2e6b30','#3f8f42','#5ab55e'],
    blooms:[['#e8e6df','#caa84a'],['#c94f4f','#8f2f2f']]},
  autumn:{stem:['#4a3320','#6b4a2b','#8a6236'],
    leaf:['#8a4b1f','#b8641f','#d98a2b','#e8b13f'],
    blooms:[['#c93b3b','#7e1f1f'],['#d98a2b','#8a4b1f']]},
  desert:{stem:['#4f7a4a','#6b9c62','#8fbf85'],
    leaf:['#c9d18a','#e0e6a8','#f2f2d0','#ffffff'],
    blooms:[['#f2a0c0','#d94f70'],['#f5c542','#c97b1e']]},
  cavernGlow:{stem:['#1d2b3a','#27455a','#2f5f6e'],
    leaf:['#1fd1c1','#4ef0dd','#9ffcf0','#d0fff8'],
    blooms:[['#c96bff','#7a2ff0'],['#4ef0dd','#1fa4d1']],glow:'rgba(120,240,255,0.22)'},
  oceanKelp:{stem:['#0f3d3a','#175a52','#1f776a'],
    leaf:['#2a9d8f','#43c3ae','#6fe3cd','#a8f5e6'],
    blooms:[['#f5c542','#c97b1e']]},
  duskViolet:{stem:['#3a2f4a','#4d3f66','#5f5180'],
    leaf:['#5a4a8a','#7a63b8','#9c86d6','#c8b8f0'],
    blooms:[['#f2d0ff','#b86bd9'],['#ffd166','#c97b1e']],glow:'rgba(200,160,255,0.18)'},
};

const PRESETS={
  wildflower:{stems:1,height:0.72,branchiness:0.25,spread:0.5,wobble:0.35,droop:0.05,
    thickness:1,leafDensity:0.5,leafSize:0.9,leafShape:'pointed',
    bloomType:'daisy',bloomAmount:1,sway:0.5,palette:'meadow'},
  grassTuft:{stems:5,height:0.5,branchiness:0.1,spread:0.55,wobble:0.4,droop:0.25,
    thickness:1,leafDensity:0.15,leafSize:0.6,leafShape:'pointed',
    bloomType:'none',bloomAmount:0,sway:0.7,palette:'meadow'},
  bush:{stems:3,height:0.55,branchiness:0.95,spread:0.75,wobble:0.4,droop:0.1,
    thickness:2,leafDensity:1,leafSize:0.75,leafShape:'round',
    bloomType:'berry',bloomAmount:0.35,sway:0.25,palette:'forest'},
  fern:{stems:4,height:0.62,branchiness:0.1,spread:0.5,wobble:0.2,droop:0.8,
    thickness:1,leafDensity:1,leafSize:0.8,leafShape:'frond',
    bloomType:'none',bloomAmount:0,sway:0.45,palette:'forest'},
  sapling:{stems:1,height:1,branchiness:0.6,spread:0.6,wobble:0.3,droop:0.1,
    thickness:3,leafDensity:0.85,leafSize:0.85,leafShape:'round',
    bloomType:'none',bloomAmount:0,sway:0.3,palette:'forest'},
  mushroom:{stems:2,height:0.42,branchiness:0,spread:0.5,wobble:0.25,droop:0,
    thickness:3,leafDensity:0,leafSize:0.5,leafShape:'none',
    bloomType:'cap',bloomAmount:1,sway:0.15,palette:'autumn'},
  cactus:{stems:1,height:0.8,branchiness:0.45,spread:0.95,wobble:0.05,droop:0,
    thickness:4,leafDensity:0.7,leafSize:0.6,leafShape:'spike',
    bloomType:'daisy',bloomAmount:0.2,sway:0.05,palette:'desert'},
  vine:{stems:1,height:1,branchiness:0.5,spread:0.55,wobble:0.85,droop:0.55,
    thickness:1,leafDensity:0.8,leafSize:0.9,leafShape:'heart',
    bloomType:'bell',bloomAmount:0.35,sway:0.65,palette:'meadow'},
  glowcap:{stems:3,height:0.5,branchiness:0.1,spread:0.6,wobble:0.3,droop:0.1,
    thickness:2,leafDensity:0.25,leafSize:0.6,leafShape:'spike',
    bloomType:'cap',bloomAmount:1,sway:0.2,palette:'cavernGlow'},
  kelp:{stems:3,height:1,branchiness:0.15,spread:0.35,wobble:0.9,droop:0.3,
    thickness:1,leafDensity:0.9,leafSize:1.1,leafShape:'pointed',
    bloomType:'none',bloomAmount:0,sway:1,palette:'oceanKelp'}
};

/* ---------- build ---------- */
function buildPlant(params,seed){
  const rng=mulberry32((seed>>>0)||1);
  const segments=[],leaves=[],blooms=[];
  const maxDepth=4;

  function grow(parent,tOn,relAngle,length,thick,depth,lean,spawn,baseOff){
    const i=segments.length;
    segments.push({parent,tOn,relAngle,length,thick,depth,lean,
      spawn:clamp(spawn,0,0.68),phase:rng()*6.283,tip:true,baseOff:baseOff||0});
    if(depth<maxDepth&&length>0.055){
      if(depth===0||rng()<0.85){ // continuation
        const wob=(rng()-0.5)*params.wobble*0.9
          + params.droop*0.17*(lean>=0?1:-1)*Math.min(depth+1,3)*0.55;
        segments[i].tip=false;
        grow(i,1,wob,length*0.72,Math.max(1,thick*0.78),depth+1,lean,
          spawn+0.12+rng()*0.08,0);
      }
      const nb=Math.floor(params.branchiness*2.4*rng()+params.branchiness*0.85);
      for(let b=0;b<nb;b++){
        const side=rng()<0.5?-1:1;
        grow(i,0.35+rng()*0.6,side*(params.spread*0.9+rng()*0.4),
          length*(0.5+rng()*0.25),Math.max(1,thick*0.62),depth+1,side,
          spawn+0.15+rng()*0.15,0);
      }
    }
    return i;
  }

  const n=params.stems|0;
  for(let s=0;s<n;s++){
    const off=(s-(n-1)/2)*0.06;
    const ang=(s-(n-1)/2)*params.spread*0.3+(rng()-0.5)*params.wobble*0.4;
    grow(-1,0,ang,0.34*params.height*(0.85+rng()*0.3),
      params.thickness,0,(s-(n-1)/2)||(rng()<0.5?-1:1),0,off);
  }

  for(let i=0;i<segments.length;i++){
    const sg=segments[i];
    if(sg.depth<1) continue;
    const count=Math.round(params.leafDensity*sg.length*26*(0.7+rng()*0.6));
    for(let k=0;k<count;k++){
      leaves.push({seg:i,t:0.2+rng()*0.75,side:rng()<0.5?-1:1,
        size:(0.7+rng()*0.6)*params.leafSize,
        spawn:clamp(sg.spawn+0.08+rng()*0.3,0,0.72),phase:rng()*6.283});
    }
    if(sg.tip&&rng()<params.bloomAmount){
      blooms.push({seg:i,size:0.8+rng()*0.5,spawn:0.72,phase:rng()*6.283,
        ci:Math.floor(rng()*8)});
    }
  }

  const plant={segments,leaves,blooms,seed};
  const P=poseSegments(plant,1,0,params);
  let minY=0,maxAbsX=0.03;
  for(const p of P){
    const ex=p.x+Math.cos(p.a)*p.len, ey=p.y+Math.sin(p.a)*p.len;
    if(ey<minY)minY=ey;
    maxAbsX=Math.max(maxAbsX,Math.abs(p.x),Math.abs(ex));
  }
  const h=Math.max(0.05,-minY)+params.leafSize*0.12;
  const w=maxAbsX+params.leafSize*0.1;
  plant.fit=Math.min(1.35,0.86/h,0.45/w);
  return plant;
}

/* ---------- pose ---------- */
function poseSegments(plant,growth,phase,params){
  const segs=plant.segments,P=new Array(segs.length);
  const scale=0.55+0.45*growth;
  for(let i=0;i<segs.length;i++){
    const s=segs[i];
    const gf=s.spawn<=0?1:clamp((growth-s.spawn)/0.3,0,1);
    let bx,by,pa;
    if(s.parent<0){bx=s.baseOff;by=0;pa=-Math.PI/2;}
    else{const pp=P[s.parent];
      bx=pp.x+Math.cos(pp.a)*pp.len*s.tOn;
      by=pp.y+Math.sin(pp.a)*pp.len*s.tOn;pa=pp.a;}
    const sw=params.sway*Math.sin(phase+s.phase*0.35+s.depth*0.7)*(0.05+s.depth*0.055);
    P[i]={x:bx,y:by,a:pa+s.relAngle+sw,len:s.length*gf*scale,g:gf};
  }
  return P;
}

/* ---------- rasterize ---------- */
function px(ctx,x,y,c){ctx.fillStyle=c;ctx.fillRect(x|0,y|0,1,1);}
function blob(ctx,cx,cy,r,ramp){
  const R=Math.max(1,Math.round(r));
  for(let y=-R;y<=R;y++)for(let x=-R;x<=R;x++){
    if(x*x+y*y>R*R+R*0.4)continue;
    const h=hash2((cx|0)+x,(cy|0)+y);
    let ci=1+((x- y)>0?1:0); if(h<0.22)ci=0; else if(h>0.9)ci=ramp.length-1;
    px(ctx,cx+x,cy+y,ramp[clamp(ci,0,ramp.length-1)]);
  }
}

// rotate a hex colour's hue by `deg` (keeps sat/lightness) — used to give each
// world its own plant palette without redesigning every ramp
function rotHex(hex,deg){
  const n=parseInt(hex.slice(1),16), r=(n>>16)/255, g=((n>>8)&255)/255, b=(n&255)/255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2, d=mx-mn;
  let h=0, s=0;
  if(d){ s=l>0.5?d/(2-mx-mn):d/(mx+mn);
    h=mx===r?((g-b)/d+(g<b?6:0)):mx===g?((b-r)/d+2):((r-g)/d+4); h/=6; }
  h=(h+deg/360)%1; if(h<0)h+=1;
  const q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
  const f=t=>{t=(t%1+1)%1; return t<1/6?p+(q-p)*6*t:t<1/2?q:t<2/3?p+(q-p)*(2/3-t)*6:p;};
  const to=v=>Math.round(v*255).toString(16).padStart(2,'0');
  return '#'+to(f(h+1/3))+to(f(h))+to(f(h-1/3));
}
function rotPal(pal,deg){ return {stem:pal.stem.map(c=>rotHex(c,deg)), leaf:pal.leaf.map(c=>rotHex(c,deg)),
  blooms:pal.blooms.map(pr=>pr.map(c=>rotHex(c,deg))), glow:pal.glow}; }
function renderPlant(ctx,plant,opts){
  const {cell,growth,phase,params}=opts;
  let pal=PALETTES[params.palette]||PALETTES.meadow;
  if(params.hueRot) pal=rotPal(pal,params.hueRot);
  const P=poseSegments(plant,growth,phase,params);
  const eff=cell*plant.fit, cx=cell/2, base=cell-2, tScale=cell/48;

  for(let i=0;i<plant.segments.length;i++){
    const s=plant.segments[i],p=P[i];
    if(p.len<=0)continue;
    const x0=cx+p.x*eff,y0=base+p.y*eff;
    const dx=Math.cos(p.a),dy=Math.sin(p.a);
    const L=p.len*eff, steps=Math.max(1,Math.round(L*2));
    const col=pal.stem[clamp(s.depth,0,pal.stem.length-1)];
    for(let st=0;st<=steps;st++){
      const f=st/steps, X=x0+dx*L*f, Y=y0+dy*L*f;
      let t=Math.max(1,Math.round(s.thick*tScale*(0.75+0.25*p.g)*(1-0.25*f)));
      const h=hash2(X|0,Y|0);
      ctx.fillStyle=h<0.15?pal.stem[Math.max(0,clamp(s.depth,0,pal.stem.length-1)-1)]:col;
      ctx.fillRect((X-t/2)|0,(Y-t/2)|0,t,t);
    }
  }

  const shape=params.leafShape;
  if(shape!=='none'){
    for(const lf of plant.leaves){
      const p=P[lf.seg];
      if(p.g<=0||growth<lf.spawn)continue;
      const sz=lf.size*clamp((growth-lf.spawn)/0.3,0,1);
      if(sz<=0.05)continue;
      const X=cx+(p.x+Math.cos(p.a)*p.len*lf.t)*eff;
      const Y=base+(p.y+Math.sin(p.a)*p.len*lf.t)*eff;
      const flut=params.sway*0.3*Math.sin(phase*2+lf.phase);
      const ang=p.a+lf.side*(1.05+flut)+flut*0.5;
      drawLeaf(ctx,X,Y,ang,sz,shape,pal.leaf,cell);
    }
  }

  const btype=params.bloomType;
  if(btype!=='none'){
    for(const b of plant.blooms){
      const p=P[b.seg];
      if(p.g<=0)continue;
      const X=cx+(p.x+Math.cos(p.a)*p.len)*eff;
      const Y=base+(p.y+Math.sin(p.a)*p.len)*eff;
      const cols=pal.blooms[b.ci%pal.blooms.length];
      if(growth<b.spawn){
        if(growth>b.spawn-0.18) px(ctx,X,Y-1,cols[1]); // bud
        continue;
      }
      const sz=b.size*clamp((growth-b.spawn)/0.22,0,1);
      if(pal.glow){
        ctx.fillStyle=pal.glow;
        const R=Math.round(3*sz*cell/48)+2;
        ctx.fillRect((X-R)|0,(Y-R)|0,R*2,R*2);
      }
      drawBloom(ctx,X,Y,sz,btype,cols,cell,b.phase);
    }
  }
}

function drawLeaf(ctx,X,Y,ang,sz,shape,ramp,cell){
  const k=cell/48;
  const dx=Math.cos(ang),dy=Math.sin(ang);
  if(shape==='round'){
    const r=Math.max(1,sz*3.2*k);
    blob(ctx,X+dx*r,Y+dy*r,r,ramp);
  }else if(shape==='heart'){
    const r=Math.max(1,sz*2.2*k);
    blob(ctx,X+dx*r*1.4-dy*r*0.7,Y+dy*r*1.4+dx*r*0.7,r,ramp);
    blob(ctx,X+dx*r*1.4+dy*r*0.7,Y+dy*r*1.4-dx*r*0.7,r,ramp);
    px(ctx,X+dx*r*2.6,Y+dy*r*2.6,ramp[1]);
  }else if(shape==='pointed'){
    const L=Math.max(2,sz*7*k);
    for(let s=0;s<=L;s++){
      const w=Math.max(0,Math.round((1-s/L)*sz*1.6*k));
      const X2=X+dx*s,Y2=Y+dy*s;
      for(let o=-w;o<=w;o++){
        const h=hash2((X2|0)+o,Y2|0);
        px(ctx,X2-dy*o,Y2+dx*o,ramp[h<0.25?0:(h>0.85?3:1+(o>0?1:0))]);
      }
    }
  }else if(shape==='frond'){
    const L=Math.max(3,sz*8*k);
    for(let s=0;s<=L;s++){
      const X2=X+dx*s,Y2=Y+dy*s;
      px(ctx,X2,Y2,ramp[1]);
      if(s%2===0){
        const pw=Math.max(1,Math.round((1-s/L)*sz*2.6*k));
        for(let o=1;o<=pw;o++){
          px(ctx,X2-dy*o,Y2+dx*o,ramp[2]);
          px(ctx,X2+dy*o,Y2-dx*o,ramp[2]);
        }
      }
    }
  }else if(shape==='spike'){
    const L=Math.max(1,sz*3*k);
    for(let s=0;s<=L;s++) px(ctx,X+dx*s,Y+dy*s,ramp[ramp.length-1]);
  }
}

function drawBloom(ctx,X,Y,sz,type,cols,cell,ph){
  const k=cell/48;
  if(type==='daisy'){
    const r=Math.max(1,Math.round(sz*2.4*k));
    for(let i=0;i<6;i++){
      const a=ph+i*Math.PI/3;
      const pxr=Math.max(1,Math.round(r*0.8));
      const bx=X+Math.cos(a)*r, by=Y+Math.sin(a)*r;
      ctx.fillStyle=cols[0];
      ctx.fillRect((bx-pxr/2)|0,(by-pxr/2)|0,pxr,pxr);
    }
    ctx.fillStyle=cols[1];
    const c=Math.max(1,Math.round(r*0.9));
    ctx.fillRect((X-c/2)|0,(Y-c/2)|0,c,c);
  }else if(type==='bell'){
    const w=Math.max(2,Math.round(sz*2.6*k)),h=Math.max(2,Math.round(sz*3*k));
    ctx.fillStyle=cols[0];
    ctx.fillRect((X-w/2)|0,Y|0,w,h);
    ctx.fillStyle=cols[1];
    ctx.fillRect((X-w/2)|0,(Y+h-1)|0,w,1);
  }else if(type==='berry'){
    const n=2+Math.round(sz*1.5);
    for(let i=0;i<n;i++){
      const a=ph+i*2.1;
      const r=Math.max(1,Math.round(sz*1.2*k));
      const bx=X+Math.cos(a)*r*1.6, by=Y+Math.sin(a)*r*1.2;
      ctx.fillStyle=i%2?cols[1]:cols[0];
      ctx.fillRect((bx-r/2)|0,(by-r/2)|0,r,r);
      px(ctx,bx-r/2,by-r/2,'#ffffff');
    }
  }else if(type==='cap'){
    const R=Math.max(2,Math.round((3.2+sz*3.4)*k));
    for(let dx=-R;dx<=R;dx++){
      const hh=Math.round(Math.sqrt(Math.max(0,1-(dx/R)*(dx/R)))*R*0.62);
      for(let y=0;y<=hh;y++){
        const h=hash2((X|0)+dx,(Y|0)-y);
        ctx.fillStyle=h>0.88?cols[1]:cols[0];
        ctx.fillRect((X+dx)|0,(Y-2-y)|0,1,1);
      }
    }
    ctx.fillStyle=cols[1];
    ctx.fillRect((X-R+1)|0,(Y-2)|0,R*2-1,1);
  }
}

/* ---------- baking helper ---------- */
// preset name (or params object) + overrides + seed -> a canvas, feet at bottom-centre
function bake(presetOrParams, overrides, seed, cell, growth, phase){
  const base = typeof presetOrParams==='string' ? PRESETS[presetOrParams] : presetOrParams;
  const params = Object.assign({}, base, overrides||{});
  const cv=document.createElement('canvas'); cv.width=cell; cv.height=cell;
  const c=cv.getContext('2d');
  const plant=buildPlant(params,(seed>>>0)||1);
  renderPlant(c,plant,{cell,growth:(growth===undefined?1:growth),phase:phase||0,params});
  return cv;
}

return {PALETTES,PRESETS,buildPlant,renderPlant,poseSegments,bake};
})();
