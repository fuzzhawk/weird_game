'use strict';
/* ============================================================
   SEED & SAGE — tiles.js
   TileGen: the shared terrain tile generator (field-based
   seamless autotiling + procedural surface texture), used by
   BOTH the Understory dungeons and the surface garden.

   The old dungeon engine varied only HUE and a noise seed
   between floors, so every world read as the same speckle in
   a new colour. TileGen instead derives a whole TEXTURE STYLE
   per world — grain, density, a surface treatment (speckle /
   mottle / striate / cracked / woven), macro blotching, and
   edge roundness — so regenerations actually look different.
   ============================================================ */
const TileGen = (function(){
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;
  return((t^t>>>14)>>>0)/4294967296;}}
const hashStr=U.hashStr, hexToRgb=U.hexToRgb, rgbToHsl=U.rgbToHsl, hslToHex=U.hslToHex, shade=U.shadeHex;
const clamp=U.clamp;

/* ---------- integer-lattice value noise (varies cleanly with seed) ---------- */
function ihash(x,y,seed){
  let h = Math.imul((x|0)*374761393 + (y|0)*668265263 ^ (seed|0)*1274126177, 1|0);
  h = Math.imul(h ^ (h>>>13), 1274126177);
  h ^= h>>>16;
  return (h>>>0)/4294967296;
}
function vnoise(x,y,seed){
  const xi=Math.floor(x), yi=Math.floor(y);
  const xf=x-xi, yf=y-yi;
  const sm=t=>t*t*(3-2*t);
  const u=sm(xf), v=sm(yf);
  const a=ihash(xi,yi,seed), b=ihash(xi+1,yi,seed), c=ihash(xi,yi+1,seed), d=ihash(xi+1,yi+1,seed);
  return a*(1-u)*(1-v)+b*u*(1-v)+c*(1-u)*v+d*u*v;
}
function mix(a,b,t){ return [Math.round(a[0]+(b[0]-a[0])*t),Math.round(a[1]+(b[1]-a[1])*t),Math.round(a[2]+(b[2]-a[2])*t)]; }

/* ---------- autotile geometry ---------- */
const diskCache={};
function diskOffsets(r){ if(diskCache[r])return diskCache[r];
  const offs=[]; const r2=r*r;
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++) if(dx*dx+dy*dy<=r2) offs.push([dx,dy]);
  return diskCache[r]=offs; }
function cornersFromIndex(i){ return {NW:!!(i&8),NE:!!(i&4),SW:!!(i&2),SE:!!(i&1)}; }
function cornerIndex(c){ return (c.NW?8:0)|(c.NE?4:0)|(c.SW?2:0)|(c.SE?1:0); }
function cellCorners(vg,x,y){ return {NW:vg[y][x],NE:vg[y][x+1],SW:vg[y+1][x],SE:vg[y+1][x+1]}; }
function fieldCornerIndex(c){ return cornerIndex(c); }
function computeVertexGrid(field, rows, cols){
  const get=(y,x)=> (y<0||y>=rows||x<0||x>=cols)?false:field[y][x];
  const vg=Array.from({length:rows+1},()=>Array(cols+1).fill(false));
  for(let vy=0;vy<=rows;vy++)for(let vx=0;vx<=cols;vx++){
    const n=(get(vy-1,vx-1)?1:0)+(get(vy-1,vx)?1:0)+(get(vy,vx-1)?1:0)+(get(vy,vx)?1:0);
    vg[vy][vx]=n>=3;
  }
  return vg;
}
function generateCAField(rows, cols, fillProb, steps, rng){
  const rnd=rng||Math.random;
  let field=Array.from({length:rows},()=>Array.from({length:cols},()=>rnd()<fillProb));
  for(let s=0;s<steps;s++){
    const next=Array.from({length:rows},()=>Array(cols).fill(false));
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      let c=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue;
        const ny=y+dy,nx=x+dx;
        if(ny<0||ny>=rows||nx<0||nx>=cols||field[ny][nx])c++; }
      next[y][x]=c>=5;
    }
    field=next;
  }
  return field;
}
function sampleQuadrant(px,py,res,c){
  const left=px<res/2, top=py<res/2;
  return (top?(left?c.NW:c.NE):(left?c.SW:c.SE))?1:0;
}
const diamCache={};
function diamondOffsets(r){ if(diamCache[r])return diamCache[r];
  const offs=[]; for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++) if(Math.abs(dx)+Math.abs(dy)<=r) offs.push([dx,dy]);
  return diamCache[r]=offs; }
function morphMask(res, corners, offs){
  const base=new Uint8Array(res*res);
  for(let y=0;y<res;y++)for(let x=0;x<res;x++) base[y*res+x]=sampleQuadrant(x,y,res,corners);
  const samp=(arr,x,y)=>(x>=0&&x<res&&y>=0&&y<res)?arr[y*res+x]:sampleQuadrant(x,y,res,corners);
  const erode=arr=>{const o=new Uint8Array(res*res);
    for(let y=0;y<res;y++)for(let x=0;x<res;x++){let a=1;for(const[dx,dy]of offs){if(!samp(arr,x+dx,y+dy)){a=0;break}}o[y*res+x]=a}return o;};
  const dil=arr=>{const o=new Uint8Array(res*res);
    for(let y=0;y<res;y++)for(let x=0;x<res;x++){let a=0;for(const[dx,dy]of offs){if(samp(arr,x+dx,y+dy)){a=1;break}}o[y*res+x]=a}return o;};
  let m=dil(erode(base)); m=erode(dil(m)); return m;
}
// original rounded (organic disk) edge — kept for back-compat callers
function roundedFieldMask(res, corners, radius){
  if(radius<=0){ const b=new Uint8Array(res*res);
    for(let y=0;y<res;y++)for(let x=0;x<res;x++) b[y*res+x]=sampleQuadrant(x,y,res,corners); return b; }
  return morphMask(res, corners, diskOffsets(radius));
}
const EDGE_NAMES=['rounded','sharp','beveled','rough'];
// build a mask honouring the style's EDGE MODE:
//   sharp    — hard blocky corners (no smoothing)
//   rounded  — organic disk-rounded (forest)
//   beveled  — 45° chamfered corners via a diamond kernel (masonry/urban)
//   rough    — rounded then noise-jittered along the boundary (rubble/wasteland)
function edgeMask(res, corners, style){
  const mode=(style&&style.edge)||'rounded', r=(style&&style.roundRadius)||2;
  if(mode==='sharp'){ const b=new Uint8Array(res*res);
    for(let y=0;y<res;y++)for(let x=0;x<res;x++) b[y*res+x]=sampleQuadrant(x,y,res,corners); return b; }
  let m = (mode==='beveled') ? morphMask(res, corners, diamondOffsets(r))
                             : morphMask(res, corners, diskOffsets(Math.max(1, mode==='rough'?r-1:r)));
  if(mode==='rough'){
    const seed=(style.grainSeed||0)|0, out=new Uint8Array(m);
    for(let y=0;y<res;y++)for(let x=0;x<res;x++){
      const i=y*res+x, v=m[i];
      // only jitter boundary pixels (a 4-neighbour differs)
      const edge=(x>0&&m[i-1]!==v)||(x<res-1&&m[i+1]!==v)||(y>0&&m[i-res]!==v)||(y<res-1&&m[i+res]!==v);
      if(edge && ihash(x,y,seed^0x5AB1E)<0.4) out[i]=v?0:1;
    }
    return out;
  }
  return m;
}

/* ---------- palettes from a grass + dirt hex ---------- */
function makePalettes(grassHex, dirtHex, opts){
  opts=opts||{};
  const rockLift = (opts.rockLift!==undefined)?opts.rockLift:0.18;  // how far rock is lifted above the dirt tone
  const low={ grassBase:hexToRgb(grassHex), grassLight:shade(grassHex,0.22), grassDark:shade(grassHex,-0.32),
              dirtBase:hexToRgb(dirtHex),  dirtLight:shade(dirtHex,0.24),  dirtDark:shade(dirtHex,-0.42) };
  const gh2=shade(grassHex,0.20); const ghHex='#'+gh2.map(v=>v.toString(16).padStart(2,'0')).join('');
  const high={ grassBase:gh2, grassLight:shade(ghHex,0.20), grassDark:shade(ghHex,-0.22),
               dirtBase:hexToRgb(dirtHex), dirtLight:shade(dirtHex,0.24), dirtDark:shade(dirtHex,-0.42) };
  const [dr,dg,db]=hexToRgb(dirtHex); const [dhh,ds,dl]=rgbToHsl(dr,dg,db);
  const [gr,gg,gb]=hexToRgb(grassHex); const [gh]=rgbToHsl(gr,gg,gb);
  const hue=dhh+(((gh-dhh+1.5)%1)-0.5)*0.15;
  const rockBase=hslToHex((hue+1)%1, Math.max(0.08,ds*0.55), Math.min(0.44,dl+rockLift));
  const rock={ base:hexToRgb(rockBase), dark:shade(rockBase,-0.30), light:shade(rockBase,0.20), deep:shade(rockBase,-0.5) };
  return {low, high, rock};
}

/* ---------- STYLE: the per-world texture personality ---------- */
const STYLE_NAMES=['speckle','mottle','striate','cracked','woven','pebbled','checker','gradient','dither'];
function deriveStyle(seedStr){
  const rng=mulberry32(hashStr(String(seedStr))^0x7A11E5);
  return {
    name: STYLE_NAMES[(rng()*STYLE_NAMES.length)|0],
    edge: EDGE_NAMES[(rng()*EDGE_NAMES.length)|0],
    texScale: 3.0 + rng()*7.0,          // grain size
    texDensity: 0.26 + rng()*0.42,      // how much light/dark detail
    macroScale: 7.0 + rng()*16.0,       // big soft blotches
    macroAmt: 0.18 + rng()*0.3,         // blotch strength
    sx: 0.4 + rng()*0.9, sy: 0.4 + rng()*0.9,   // striation direction
    roundRadius: 1 + ((rng()*3)|0),     // 1..3 edge roundness
    grainSeed: (rng()*1e6)|0,
  };
}

/* ---------- the textured tile ---------- */
function detail(name, x, y, seed, ts, td, sx, sy){
  // returns -1 (dark), 0 (base), 1 (light)
  const n=vnoise(x/ts+seed*0.013, y/ts+seed*0.017, seed);
  if(name==='speckle'){ return n<td*0.5?-1 : n>1-td*0.5?1 : 0; }
  if(name==='pebbled'){ const b=vnoise(x/(ts*1.6)+seed*0.02, y/(ts*1.6)+seed*0.03, seed^0x33);
    return b<0.30?-1 : b>0.74?1 : (n>0.86?1:0); }
  if(name==='mottle'){ const b=vnoise(x/(ts*2.0)+seed*0.023, y/(ts*2.0)+seed*0.017, seed^0x55);
    return b<0.38?-1 : b>0.72?1 : 0; }
  if(name==='striate'){ const s=(Math.sin((x*sx+y*sy)/Math.max(1.2,ts)*3.14159 + n*2.2)+1)/2;
    return s<td*0.55?-1 : s>1-td*0.4?1 : 0; }
  if(name==='woven'){ const a=Math.sin(x/Math.max(1.4,ts)*3.14159*1.2), b=Math.sin(y/Math.max(1.4,ts)*3.14159*1.2);
    const w=(a*b+1)/2; return w<td*0.5?-1 : w>1-td*0.5?1 : (n<0.14?-1:0); }
  if(name==='cracked'){ const w=vnoise(x/ts*1.25+seed*0.03+n*0.8, y/ts*1.25+seed*0.02, seed^0xAB);
    if(Math.abs(w-0.5)<0.055*(0.6+td)) return -1;
    return n>1-td*0.4?1:0; }
  if(name==='checker'){ const cs=Math.max(2,Math.round(ts)); const on=((Math.floor(x/cs)+Math.floor(y/cs))&1);
    // tiled plaza slabs: alternating cells with a dark grout line + noise flecks
    if((x%cs===0)||(y%cs===0)) return -1;
    return on ? (n>0.82?1:0) : (n<0.2?-1:0); }
  if(name==='gradient'){ const gg=vnoise(x/(ts*3)+seed*0.05, y/(ts*3)+seed*0.03, seed^0x77);
    return gg<0.42-td*0.2?-1 : gg>0.58+td*0.2?1 : 0; }
  if(name==='dither'){ const b=(x+ (y&1))&1; // ordered 1px dither over noise thresholds
    if(n<td*0.5) return b?-1:0; if(n>1-td*0.5) return b?1:0; return 0; }
  return 0;
}
function paintTile(res, mask, seed, pal, style){
  const cv=document.createElement('canvas'); cv.width=res; cv.height=res;
  const c=cv.getContext('2d'); const img=c.createImageData(res,res);
  const st=style, ts=st.texScale, td=st.texDensity, ms=st.macroScale, gs=st.grainSeed;
  for(let y=0;y<res;y++)for(let x=0;x<res;x++){
    const idx=y*res+x, g=mask[idx];
    const base=g?pal.grassBase:pal.dirtBase, light=g?pal.grassLight:pal.dirtLight, dark=g?pal.grassDark:pal.dirtDark;
    let col=base;
    const d=detail(st.name, x, y, seed+gs, ts, td, st.sx, st.sy);
    if(d<0) col=dark; else if(d>0) col=light;
    // macro blotch: shift whole regions lighter/darker so tiles aren't flat
    const macro=vnoise(x/ms+seed*0.019, y/ms+seed*0.011, (seed^0x9E37)|0);
    if(macro<0.5-st.macroAmt) col=mix(col,dark,0.4);
    else if(macro>0.5+st.macroAmt) col=mix(col,light,0.32);
    const p=idx*4; img.data[p]=col[0]; img.data[p+1]=col[1]; img.data[p+2]=col[2]; img.data[p+3]=255;
  }
  c.putImageData(img,0,0); return cv;
}
// rock overlay: rock speckle where mask=1, transparent elsewhere
function paintCliff(res, mask, seed, rock, style){
  const cv=document.createElement('canvas'); cv.width=res; cv.height=res;
  const c=cv.getContext('2d'); const img=c.createImageData(res,res);
  const st=style, ts=st.texScale, td=st.texDensity, gs=st.grainSeed;
  for(let y=0;y<res;y++)for(let x=0;x<res;x++){
    const idx=y*res+x; if(!mask[idx])continue;
    let col=rock.base;
    const d=detail(st.name, x, y, seed+gs+911, ts, td, st.sx, st.sy);
    if(d<0)col=rock.dark; else if(d>0)col=rock.light;
    const macro=vnoise(x/st.macroScale+seed*0.02, y/st.macroScale+seed*0.03, (seed^0x1234)|0);
    if(macro<0.34)col=mix(col,rock.deep,0.4); else if(macro>0.72)col=mix(col,rock.light,0.3);
    const p=idx*4; img.data[p]=col[0]; img.data[p+1]=col[1]; img.data[p+2]=col[2]; img.data[p+3]=255;
  }
  c.putImageData(img,0,0); return cv;
}

/* ---------- CONTINUOUS (world-coordinate) sampling ----------
   For large open areas (the surface), sampling the texture at WORLD
   coordinates makes the ground flow seamlessly across tiles instead of
   restarting inside every 16px cell. The autotile rounded masks are then
   used only to decide grass-vs-rock per pixel, giving the same organic
   edges as the dungeon but with a cohesive, un-patchy surface. */
function fieldTexel(pal, isGrass, x, y, seed, st){
  const ts=st.texScale, td=st.texDensity, gs=st.grainSeed;
  const base=isGrass?pal.grassBase:pal.dirtBase, light=isGrass?pal.grassLight:pal.dirtLight, dark=isGrass?pal.grassDark:pal.dirtDark;
  let col=base;
  const d=detail(st.name, x, y, seed+gs, ts, td, st.sx, st.sy);
  if(d<0)col=dark; else if(d>0)col=light;
  const macro=vnoise(x/st.macroScale+seed*0.019, y/st.macroScale+seed*0.011, (seed^0x9E37)|0);
  if(macro<0.5-st.macroAmt)col=mix(col,dark,0.40); else if(macro>0.5+st.macroAmt)col=mix(col,light,0.32);
  return col;
}
function rockTexel(rock, x, y, seed, st){
  const ts=st.texScale, td=st.texDensity, gs=st.grainSeed;
  let col=rock.base;
  const d=detail(st.name, x, y, seed+gs+911, ts, td, st.sx, st.sy);
  if(d<0)col=rock.dark; else if(d>0)col=rock.light;
  const macro=vnoise(x/st.macroScale+seed*0.02, y/st.macroScale+seed*0.03, (seed^0x1234)|0);
  if(macro<0.34)col=mix(col,rock.deep,0.40); else if(macro>0.72)col=mix(col,rock.light,0.3);
  return col;
}
function surfaceTexel(pals, solid, x, y, seed, st){
  return solid ? rockTexel(pals.rock, x, y, seed, st) : fieldTexel(pals.low, true, x, y, seed, st);
}

/* ---------- build a whole 16-corner tileset ---------- */
function makeTileset(opts){
  const res=opts.res||24, variants=opts.variants||5;
  const seed=(opts.seed>>>0)||1337;
  const style=opts.style||deriveStyle('ts-'+seed);
  const pals=makePalettes(opts.grassHex, opts.dirtHex);
  const field=[], high=[], cliff=[], coll=new Array(16);
  for(let i=0;i<16;i++){
    const mask=edgeMask(res, cornersFromIndex(i), style);
    coll[i]=mask;
    field[i]=[]; high[i]=[]; cliff[i]=[];
    const base=seed + i*7919 + 500000;
    for(let v=0;v<variants;v++){
      field[i].push(paintTile(res, mask, base+v*104729, pals.low, style));
      high[i].push(paintTile(res, mask, base+v*104729+333, pals.high, style));
      cliff[i].push(paintCliff(res, mask, base+v*104729+4000, pals.rock, style));
    }
  }
  return {res, variants, field, high, cliff, coll, style, pals, grassHex:opts.grassHex, dirtHex:opts.dirtHex};
}

/* ---------- WATER: a per-world water palette + animated ripple tiles ----------
   The water takes the world's own hue (pulled toward blue by the caller) so a
   jade world's ponds read teal, a rust world's read murky bronze, etc. Frames
   loop seamlessly (phase 0..2π) for a calm, non-flickering undulation. */
function waterPalette(hueDeg, sat, murk){
  const h=(((hueDeg%360)+360)%360)/360;
  sat=clamp(sat!==undefined?sat:0.5,0.12,0.85); murk=clamp(murk||0,0,1);
  const s=sat*(1-murk*0.45);
  return {
    deep:  hexToRgb(hslToHex(h,          s,      0.15+murk*0.05)),
    mid:   hexToRgb(hslToHex(h,          s*0.95, 0.30)),
    light: hexToRgb(hslToHex((h+0.02)%1, s*0.80, 0.47)),
    foam:  hexToRgb(hslToHex((h+0.03)%1, s*0.45, 0.83)),
  };
}
function makeWater(opts){
  const res=opts.res||16, frames=opts.frames||8, variants=opts.variants||3;
  const pal=opts.pal, seed=(opts.seed>>>0)||99;
  const out=[];
  for(let v=0;v<variants;v++){
    const list=[];
    for(let f=0;f<frames;f++){
      const cv=document.createElement('canvas'); cv.width=res; cv.height=res;
      const c=cv.getContext('2d'); const img=c.createImageData(res,res), d=img.data;
      const ph=f/frames*Math.PI*2;
      for(let y=0;y<res;y++)for(let x=0;x<res;x++){
        const n=vnoise(x/7+v*4.3, y/7+v*2.1, seed+v*13);
        const w1=Math.sin((x*0.42+y*0.28)+ph+n*1.6);
        const w2=Math.sin((x*0.22-y*0.36)-ph*0.8+n*1.2);
        const lit=(w1*0.5+w2*0.5)*0.5+0.5;
        let col;
        if(lit>0.86)      col=pal.foam;
        else if(lit>0.62) col=mix(pal.light,pal.foam,(lit-0.62)/0.24);
        else if(lit>0.36) col=mix(pal.mid,pal.light,(lit-0.36)/0.26);
        else              col=mix(pal.deep,pal.mid,lit/0.36);
        const p=(y*res+x)*4; d[p]=col[0]; d[p+1]=col[1]; d[p+2]=col[2]; d[p+3]=255;
      }
      c.putImageData(img,0,0); list.push(cv);
    }
    out.push(list);
  }
  return out;   // out[variant][frame] → res×res canvas
}

return {
  mulberry32, vnoise, ihash, mix,
  diskOffsets, cornersFromIndex, cornerIndex, cellCorners, fieldCornerIndex,
  computeVertexGrid, generateCAField, sampleQuadrant, roundedFieldMask, edgeMask,
  makePalettes, deriveStyle, STYLE_NAMES, EDGE_NAMES, paintTile, paintCliff, makeTileset,
  fieldTexel, rockTexel, surfaceTexel, waterPalette, makeWater,
};
})();
