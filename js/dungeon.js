'use strict';
/* ============================================================
   SEED & SAGE — dungeon.js
   The Understories: murky action-RPG floors (adapted from
   GROVE & BLADE). Each surface dungeon mouth opens onto a
   chain of floors; each floor has a Keeper with a task, a way
   up, and — once the Keeper is satisfied — a way further down.
   Refute the heart of the final floor to put the whole
   Understory to rest.
   ============================================================ */
const Dungeon = (function(){
const $=id=>document.getElementById(id);
const cvs=document.getElementById('cvD'), ctx=cvs.getContext('2d');
let W=0,H=0,DPR=1;
function resizeCvs(){ DPR=Math.min(devicePixelRatio||1,2); W=innerWidth; H=innerHeight;
  cvs.width=W*DPR; cvs.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); ctx.imageSmoothingEnabled=false; }
addEventListener('resize',resizeCvs); resizeCvs();

let active=false;

/* ============================================================
   TERRAIN ENGINE (field-based seamless tiles)
   ============================================================ */
function mulberry32(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const hashSeed=U.hashStr;
function hash2(x,y,seed){
  let h = Math.sin(x*127.1 + y*311.7 + seed*74.7) * 43758.5453;
  return h - Math.floor(h);
}
function valueNoise2D(x,y,seed){
  const xi=Math.floor(x), yi=Math.floor(y);
  const xf=x-xi, yf=y-yi;
  const sm = t => t*t*(3-2*t);
  const u=sm(xf), v=sm(yf);
  const a=hash2(xi,yi,seed), b=hash2(xi+1,yi,seed), c=hash2(xi,yi+1,seed), d=hash2(xi+1,yi+1,seed);
  return a*(1-u)*(1-v) + b*u*(1-v) + c*(1-u)*v + d*u*v;
}
const hexToRgb=U.hexToRgb, rgbToHsl=U.rgbToHsl, hslToHex=U.hslToHex;
const shade=U.shadeHex;
const diskCache = {};
// Every floor derives its own murky tileset from the floor seed: dim, damp,
// half-lit hues — the surface garden's palette drowned a few fathoms down.
function applyWorldPalette(seedStr){
  const rng = mulberry32(hashSeed(seedStr)^0xC0FFEE);
  T.seed = 1000 + Math.floor(rng()*900000);
  // BORROW THE SURFACE: the Understory now renders in the very same ground & rock
  // palette + texture style as the world above, so it's drawn by the same graphics
  // (was: its own dim, "drowned meadow" palette derived per floor).
  const skin = (typeof Surface!=='undefined' && Surface.skin) ? Surface.skin() : null;
  if(skin && skin.grass && skin.dirt){
    T.grassColor = skin.grass;
    T.dirtColor  = skin.dirt;
    T.style = TileGen.deriveStyle(skin.styleSeed || seedStr);
    T.borrowedSkin = true;
    renderTileset();
    return;
  }
  const hue = rng();
  const grassS = 0.16+rng()*0.22, grassL = 0.20+rng()*0.11;   // drowned meadow
  T.grassColor = hslToHex(hue, grassS, grassL);
  const dHue = (hue + 0.45 + rng()*0.1) % 1;
  T.dirtColor = hslToHex(dHue, 0.30+rng()*0.18, 0.05+rng()*0.05); // black water
  // each floor gets its own TEXTURE STYLE (grain/density/treatment/edge), not
  // just a new hue — so regenerated floors read as genuinely different places
  T.style = TileGen.deriveStyle(seedStr);
  T.borrowedSkin = false;
  renderTileset();
}
function diskOffsets(r){
  if(diskCache[r]) return diskCache[r];
  const offs=[]; const r2=r*r;
  for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++) if(dx*dx+dy*dy<=r2) offs.push([dx,dy]);
  diskCache[r]=offs;
  return offs;
}
function generateCAField(rows, cols, fillProb, steps, rng){
  const rnd = rng || Math.random;
  let field = Array.from({length:rows},()=>Array.from({length:cols},()=> rnd()<fillProb));
  for(let s=0;s<steps;s++){
    const next = Array.from({length:rows},()=>Array(cols).fill(false));
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      let count=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(dx===0&&dy===0) continue;
        const ny=y+dy, nx=x+dx;
        if(ny<0||ny>=rows||nx<0||nx>=cols||field[ny][nx]) count++;
      }
      next[y][x] = count>=5;
    }
    field = next;
  }
  return field;
}
function computeVertexGrid(field, rows, cols){
  const get = (y,x) => (y<0||y>=rows||x<0||x>=cols) ? false : field[y][x];
  const vg = Array.from({length:rows+1},()=>Array(cols+1).fill(false));
  for(let vy=0; vy<=rows; vy++){
    for(let vx=0; vx<=cols; vx++){
      const nw=get(vy-1,vx-1), ne=get(vy-1,vx), sw=get(vy,vx-1), se=get(vy,vx);
      const count = (nw?1:0)+(ne?1:0)+(sw?1:0)+(se?1:0);
      vg[vy][vx] = count>=3;
    }
  }
  return vg;
}
function cellCorners(vg, x, y){
  return { NW: vg[y][x], NE: vg[y][x+1], SW: vg[y+1][x], SE: vg[y+1][x+1] };
}
function fieldCornerIndex(c){ return (c.NW?8:0)|(c.NE?4:0)|(c.SW?2:0)|(c.SE?1:0); }
function fieldCornersFromIndex(i){ return { NW:!!(i&8), NE:!!(i&4), SW:!!(i&2), SE:!!(i&1) }; }
function sampleQuadrant(px, py, res, corners){
  const left = px < res/2, top = py < res/2;
  return (top ? (left?corners.NW:corners.NE) : (left?corners.SW:corners.SE)) ? 1 : 0;
}
function roundedFieldMask(res, corners, radius){
  const base = new Uint8Array(res*res);
  for(let y=0;y<res;y++)for(let x=0;x<res;x++) base[y*res+x] = sampleQuadrant(x,y,res,corners);
  if(radius<=0) return base;
  const offs = diskOffsets(radius);
  const sampleArr = (arr,x,y) => (x>=0&&x<res&&y>=0&&y<res) ? arr[y*res+x] : sampleQuadrant(x,y,res,corners);
  function erodeArr(arr){
    const out=new Uint8Array(res*res);
    for(let y=0;y<res;y++)for(let x=0;x<res;x++){
      let all=1;
      for(const [dx,dy] of offs){ if(!sampleArr(arr,x+dx,y+dy)){ all=0; break; } }
      out[y*res+x]=all;
    }
    return out;
  }
  function dilateArr(arr){
    const out=new Uint8Array(res*res);
    for(let y=0;y<res;y++)for(let x=0;x<res;x++){
      let any=0;
      for(const [dx,dy] of offs){ if(sampleArr(arr,x+dx,y+dy)){ any=1; break; } }
      out[y*res+x]=any;
    }
    return out;
  }
  let m = dilateArr(erodeArr(base));
  m = erodeArr(dilateArr(m));
  return m;
}

/* ---------- tileset build ---------- */
const T = {
  res: 24, roundRadius: 2, texScale: 6, texDensity: 0.40,
  grassColor: '#2e4a30', dirtColor: '#0a1512', seed: 1337,
};
const NUM_VARIANTS = 6;
function palette(){
  const g=T.grassColor, d=T.dirtColor;
  return {
    grassBase: hexToRgb(g), grassLight: shade(g,0.22), grassDark: shade(g,-0.32),
    dirtBase: hexToRgb(d),  dirtLight: shade(d,0.24),  dirtDark: shade(d,-0.42),
  };
}
function highPalette(){
  const g=shade(T.grassColor, 0.20), d=T.dirtColor;
  const gh='#'+g.map(v=>v.toString(16).padStart(2,'0')).join('');
  return {
    grassBase: g, grassLight: shade(gh,0.20), grassDark: shade(gh,-0.22),
    dirtBase: hexToRgb(d), dirtLight: shade(d,0.24), dirtDark: shade(d,-0.42),
  };
}
function rockPalette(){
  const [dr,dg,db]=hexToRgb(T.dirtColor); const [dh,ds,dl]=rgbToHsl(dr,dg,db);
  const [gr,gg,gb]=hexToRgb(T.grassColor); const [gh]=rgbToHsl(gr,gg,gb);
  const hue = dh + (((gh-dh+1.5)%1)-0.5)*0.15;
  const base=hslToHex((hue+1)%1, Math.max(0.08, ds*0.55), Math.min(0.44, dl+0.18));
  return { base:hexToRgb(base), dark:shade(base,-0.30), light:shade(base,0.20), deep:shade(base,-0.5) };
}
function buildTileCanvas(res, mask, seed, pal){
  pal = pal || palette();
  const canvas = document.createElement('canvas');
  canvas.width=res; canvas.height=res;
  const c = canvas.getContext('2d');
  const img = c.createImageData(res,res);
  for(let y=0;y<res;y++)for(let x=0;x<res;x++){
    const idx=y*res+x;
    const g = mask[idx];
    let col = g ? pal.grassBase : pal.dirtBase;
    const n = valueNoise2D(x/T.texScale + seed*0.13, y/T.texScale + seed*0.071, seed);
    if(n < T.texDensity*0.5) col = g ? pal.grassDark : pal.dirtDark;
    else if(n > 1-T.texDensity*0.5) col = g ? pal.grassLight : pal.dirtLight;
    const p=idx*4;
    img.data[p]=col[0]; img.data[p+1]=col[1]; img.data[p+2]=col[2]; img.data[p+3]=255;
  }
  c.putImageData(img,0,0);
  return canvas;
}
function buildCliffMaskTile(res, mask, seed){
  const rp=rockPalette();
  const canvas=document.createElement('canvas'); canvas.width=res; canvas.height=res;
  const c=canvas.getContext('2d');
  const img=c.createImageData(res,res);
  for(let y=0;y<res;y++)for(let x=0;x<res;x++){
    const idx=y*res+x, p=idx*4;
    if(!mask[idx]) continue;
    let col=rp.base;
    const n=valueNoise2D(x/T.texScale + seed*0.13, y/T.texScale + seed*0.071, seed);
    if(n < T.texDensity*0.5) col=rp.dark; else if(n > 1-T.texDensity*0.5) col=rp.light;
    img.data[p]=col[0]; img.data[p+1]=col[1]; img.data[p+2]=col[2]; img.data[p+3]=255;
  }
  c.putImageData(img,0,0);
  return canvas;
}
const fieldTiles = Array.from({length:16},(_,i)=>({ variants:[], seedOffset:i*7919+500000 }));
const highTiles  = Array.from({length:16},(_,i)=>({ variants:[], seedOffset:i*7919+900000 }));
const cliffTiles = Array.from({length:16},()=>[]);
const collMasks = new Array(16);
function renderTileset(){
  const lowPal=palette(), hiPal=highPalette(), rockPal=rockPalette();
  const style=T.style||(T.style=TileGen.deriveStyle('floor-'+T.seed));
  for(let i=0;i<16;i++){
    const corners = fieldCornersFromIndex(i);
    // edge MODE now comes from the floor's derived style (rounded/sharp/beveled/rough)
    const mask = TileGen.edgeMask(T.res, corners, style);
    collMasks[i] = mask;
    const base = T.seed + fieldTiles[i].seedOffset;
    fieldTiles[i].variants = [];
    highTiles[i].variants = [];
    cliffTiles[i] = [];
    for(let v=0;v<NUM_VARIANTS;v++){
      fieldTiles[i].variants.push(TileGen.paintTile(T.res, mask, base+v*104729, lowPal, style));
      highTiles[i].variants.push(TileGen.paintTile(T.res, mask, base+v*104729+333, hiPal, style));
      cliffTiles[i].push(TileGen.paintCliff(T.res, mask, base+v*104729+4000, rockPal, style));
    }
  }
}

/* ---------- palette matching for the cast ---------- */
function groveHues(){
  const [gr,gg,gb]=hexToRgb(T.grassColor); const [gh]=rgbToHsl(gr,gg,gb);
  const [dr,dg,db]=hexToRgb(T.dirtColor);  const [dh]=rgbToHsl(dr,dg,db);
  return { grass: gh*360, dirt: dh*360 };
}
function monsterPalette(rng, kind){
  const {grass, dirt} = groveHues();
  const leanByKind = {
    slime: [ -25, 25, 40 ],
    wisp:  [ 150, 170, 200 ],
    brute: [ 20, 45, -35 ],
    boss:  [ 160, 180, 200 ],
  };
  const opts = leanByKind[kind] || [ -30, 30, 45 ];
  const off = opts[(rng()*opts.length)|0] + (rng()*14-7);
  const hue = ((grass+off)%360+360)%360;
  const satBase = kind==='slime'?26: kind==='brute'?40: kind==='wisp'?34: 52;
  const litBase = kind==='brute'?40: kind==='boss'?52: kind==='wisp'?58: 50;
  return {
    hue: Math.round(hue),
    sat: Math.round(satBase + rng()*18),
    lit: Math.round(litBase + rng()*12),
    hue2: Math.round(((hue + (rng()<.5?24:-24))%360+360)%360),
    accent: Math.round((dirt + 180 + rng()*30)%360),
    hairHue: Math.round(hue),
    clothHue: Math.round(((dirt+40)%360)),
    metalHue: Math.round(((grass+200)%360)),
  };
}
function playerPalette(rng){
  const {grass} = groveHues();
  const hue = ((grass+180 + (rng()*40-20))%360+360)%360;
  return {
    hue: Math.round(hue), sat: 55+Math.round(rng()*20), lit: 56+Math.round(rng()*10),
    hue2: Math.round(((hue+30)%360)), accent: Math.round(((grass+90)%360)),
    hairHue: Math.round(((hue+20)%360)), clothHue: Math.round(hue),
    metalHue: 210,
  };
}
let CREATURES = null;
function generateCreatures(seedStr){
  const drawSizes = { slime:48, wisp:48, brute:48, boss:96, player:48 };
  const out = {};
  for(const kind of ['player','slime','wisp','brute','boss']){
    // the player's SHAPE follows the Hero between worlds; only the colours
    // re-derive per floor so the Sage always pops out of the murk
    const structRng = kind==='player'
      ? CF.mulberry32(hashSeed(Hero.lookSeed)^0xC0DE)
      : CF.mulberry32(hashSeed(seedStr+'/'+kind)^0xC0DE);
    const colRng = CF.mulberry32(hashSeed(seedStr+'/'+kind+'/col')^0x9A11);
    const struct = CFHelp.ARCHETYPES[kind](structRng);
    const cols = kind==='player' ? playerPalette(colRng) : monsterPalette(colRng, kind);
    const params = { ...struct, ...cols, seed: seedStr+'-'+kind };
    out[kind] = CFHelp.bakeCreature(params, drawSizes[kind]);
    out[kind].kind = kind;
  }
  CREATURES = out;
  return out;
}

/* ============================================================
   AUDIO — tiny WebAudio synth
   ============================================================ */
let AC=null;
function audio(){ if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } return AC; }
function blip(freq, dur, type, vol, slide){
  const ac=audio(); if(!ac||ac.state==='suspended') return;
  const o=ac.createOscillator(), g=ac.createGain();
  o.type=type||'square'; o.frequency.setValueAtTime(freq,ac.currentTime);
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*slide),ac.currentTime+dur);
  g.gain.setValueAtTime(vol||0.08,ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+dur);
  o.connect(g); g.connect(ac.destination);
  o.start(); o.stop(ac.currentTime+dur);
}
const SFX = {
  slash(){ blip(900,0.09,'sawtooth',0.05,0.3); },
  hit(){ blip(220,0.08,'square',0.09,0.5); },
  kill(){ blip(330,0.15,'square',0.08,0.4); },
  hurt(){ blip(110,0.25,'sawtooth',0.12,0.6); },
  pickup(){ blip(660,0.1,'sine',0.09,1.6); setTimeout(()=>blip(990,0.12,'sine',0.08,1.3),70); },
  level(){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>blip(f,0.2,'triangle',0.09),i*80)); },
  quest(){ [392,523,659].forEach((f,i)=>setTimeout(()=>blip(f,0.25,'sine',0.09),i*110)); },
};
document.addEventListener('touchstart',()=>{ const ac=audio(); if(ac&&ac.state==='suspended') ac.resume(); },{once:true});
document.addEventListener('mousedown',()=>{ const ac=audio(); if(ac&&ac.state==='suspended') ac.resume(); },{once:true});

/* ============================================================
   WORLD GENERATION (72×72 cells)
   ============================================================ */
const ROWS=72, COLS=72, RES=T.res;
const WORLD_W=COLS*RES, WORLD_H=ROWS*RES;
let field, vgrid, tileMap, variantMap, trees=[];
let blockGrid=new Uint8Array(ROWS*COLS);
const FACE_ROWS=2;
let highCellArr=new Uint8Array(ROWS*COLS);
let faceCellArr=new Uint8Array(ROWS*COLS);
let faceTopArr =new Uint8Array(ROWS*COLS);
let faceBaseArr=new Uint8Array(ROWS*COLS);
let faceSideArr=new Uint8Array(ROWS*COLS);
let faceHArr=new Int8Array(ROWS*COLS);
let faceIdxArr=new Uint8Array(ROWS*COLS);
let structures=[];
function rgbStr(a){ return 'rgb('+a[0]+','+a[1]+','+a[2]+')'; }

const BuildingGfx = {
  render(s, rng){
    const wpx=s.w*RES, hpx=s.h*RES;
    const cv=document.createElement('canvas'); cv.width=wpx; cv.height=hpx;
    const c=cv.getContext('2d');
    const [dr,dg,db]=hexToRgb(T.dirtColor);
    const [hh]=rgbToHsl(dr,dg,db);
    const wallHex = hslToHex(hh, 0.10+rng()*0.10, 0.34+rng()*0.10);
    const wall=hexToRgb(wallHex), wallD=shade(wallHex,-0.35), wallL=shade(wallHex,0.16);
    const roofHex = hslToHex((hh+0.45+rng()*0.1)%1, 0.30+rng()*0.15, 0.20+rng()*0.08);
    const roof=hexToRgb(roofHex), roofD=shade(roofHex,-0.3), roofL=shade(roofHex,0.2);
    const roofH = Math.min(s.rise, Math.floor(hpx*0.42));
    c.fillStyle=rgbStr(roof); c.fillRect(0,0,wpx,roofH);
    c.fillStyle=rgbStr(roofL); c.fillRect(0,0,wpx,2);
    for(let y=4;y<roofH-2;y+=4){
      c.fillStyle=rgbStr(roofD);
      for(let x=((y/4)%2)*3; x<wpx; x+=6) c.fillRect(x,y,4,1);
    }
    c.fillStyle=rgbStr(roofD); c.fillRect(0,roofH-2,wpx,2);
    c.fillStyle=rgbStr(wall); c.fillRect(0,roofH,wpx,hpx-roofH);
    for(let y=roofH;y<hpx;y++)for(let x=0;x<wpx;x++){
      const n=rng();
      if(n<0.05){ c.fillStyle=rgbStr(wallD); c.fillRect(x,y,1,1); }
      else if(n>0.97){ c.fillStyle=rgbStr(wallL); c.fillRect(x,y,1,1); }
    }
    c.fillStyle=rgbStr(wallD);
    for(let y=roofH+6;y<hpx;y+=7) c.fillRect(0,y,wpx,1);
    const winW=6, winH=7;
    const cols=Math.max(1, Math.floor((wpx-8)/14));
    const doorX=Math.floor(wpx/2)-4;
    for(let i=0;i<cols;i++){
      const x=6+i*Math.floor((wpx-12)/Math.max(1,cols-1||1));
      const wx2=Math.min(x, wpx-winW-4);
      for(let row=0; row<Math.max(1,Math.floor((hpx-roofH-16)/16)); row++){
        const y=roofH+5+row*16;
        if(y+winH>hpx-13) continue;
        if(Math.abs(wx2-doorX)<9 && y+winH>hpx-26) continue;
        c.fillStyle=rgbStr(wallD); c.fillRect(wx2-1,y-1,winW+2,winH+2);
        c.fillStyle=rng()<0.4?'#b7ffd9':'#232a33'; c.fillRect(wx2,y,winW,winH); // cold spore-light
        c.fillStyle='rgba(0,0,0,0.35)'; c.fillRect(wx2,y+winH/2,winW,1); c.fillRect(wx2+winW/2,y,1,winH);
      }
    }
    c.fillStyle=rgbStr(wallD); c.fillRect(doorX-1,hpx-14,10,14);
    c.fillStyle='#101a14'; c.fillRect(doorX,hpx-13,8,13);
    c.fillStyle='#b7ffd9'; c.fillRect(doorX+6,hpx-8,1,2);
    c.fillStyle='rgba(0,0,0,0.45)';
    c.fillRect(0,0,1,hpx); c.fillRect(wpx-1,0,1,hpx); c.fillRect(0,hpx-1,wpx,1);
    return cv;
  }
};

function buildTerraces(rng){
  highCellArr=new Uint8Array(ROWS*COLS);
  faceCellArr=new Uint8Array(ROWS*COLS);
  faceTopArr =new Uint8Array(ROWS*COLS);
  faceBaseArr=new Uint8Array(ROWS*COLS);
  faceSideArr=new Uint8Array(ROWS*COLS);
  faceHArr   =new Int8Array(ROWS*COLS);
  const isGrass=(x,y)=> x>=0&&x<COLS&&y>=0&&y<ROWS&&tileMap[y][x]===15;
  let high = Array.from({length:ROWS},()=>Array(COLS).fill(false));
  function tryStampShelf(minW){
    const lo=Math.max(minW,6);
    const w=lo+((rng()*(14-lo))|0);
    const ph=3+((rng()*3)|0);
    const fh=1+((rng()*4)|0);
    const LAND=3;
    const cx=2+((rng()*(COLS-w-4))|0);
    const ey=ph+2+((rng()*(ROWS-ph-fh-LAND-6))|0);
    for(let y=ey-ph+1;y<=ey;y++) for(let x=cx;x<cx+w;x++) if(!isGrass(x,y)||high[y][x]) return false;
    for(let k=1;k<=fh;k++) for(let x=cx;x<cx+w;x++) if(!isGrass(x,ey+k)) return false;
    for(let k=1;k<=LAND;k++){ let land=0; for(let x=cx;x<cx+w;x++) if(isGrass(x,ey+fh+k)) land++;
      if(land < w-1) return false; }
    for(let y=ey-ph+1;y<=ey;y++) for(let x=cx;x<cx+w;x++) high[y][x]=true;
    for(let x=cx;x<cx+w;x++) faceHArr[ey*COLS+x]=fh;
    for(let x=cx;x<cx+w;x++) if(rng()<0.55 && isGrass(x,ey-ph)) high[ey-ph][x]=true;
    for(let y=ey-ph+1;y<=ey-1;y++){
      if(rng()<0.5 && isGrass(cx-1,y)) high[y][cx-1]=true;
      if(rng()<0.5 && isGrass(cx+w,y)) high[y][cx+w]=true;
    }
    return true;
  }
  const targetShelves=3+((rng()*3)|0);
  let made=0;
  for(let n=0;n<targetShelves*60 && made<targetShelves;n++) if(tryStampShelf(6)) made++;
  for(let n=0;n<700 && made<2;n++) if(tryStampShelf(4)) made++;
  const isEdge=(x,y)=> high[y] && high[y][x] && y+1<ROWS && !high[y+1][x] && tileMap[y+1][x]===15;
  const lowGrass=(x,y)=> y>=0&&y<ROWS && tileMap[y][x]===15 && !(high[y]&&high[y][x]);
  const plateauH=(x,ey)=>{ let h=0; while(ey-h>=0 && high[ey-h] && high[ey-h][x]) h++; return h; };
  function carveCliff(x0,x1,ey){
    const Wd=x1-x0+1;
    const fh=Math.max(1, faceHArr[ey*COLS+x0]||FACE_ROWS);
    let armSteps=Math.min(3,(Wd-2)>>1); if(armSteps<1) armSteps=1;
    const cLo=x0+armSteps, cHi=x1-armSteps;
    for(let cx=x0;cx<=x1;cx++){
      let depth=fh;
      if(cx>cLo && cx<cHi && lowGrass(cx,ey+fh+1)) depth=fh+1;
      for(let k=1;k<=depth;k++){ const fy=ey+k; if(fy>=ROWS||!lowGrass(cx,fy)) break; faceCellArr[fy*COLS+cx]=1; }
    }
    for(let s=0;s<armSteps;s++){
      const raise=armSteps-1-s;
      for(const [cx,side] of [[x0+s,1],[x1-s,2]]){
        if(cx<0||cx>=COLS) continue;
        const r=Math.min(raise, Math.max(0, plateauH(cx,ey)-2));
        faceCellArr[ey*COLS+cx]=1; faceSideArr[ey*COLS+cx]=side;
        for(let up=1; up<=r; up++){ const fy=ey-up; if(!(high[fy]&&high[fy][cx])) break;
          faceCellArr[fy*COLS+cx]=1; faceSideArr[fy*COLS+cx]=side; }
      }
    }
  }
  for(let y=0;y<ROWS-1;y++){
    let x=0;
    while(x<COLS){
      if(!isEdge(x,y)){ x++; continue; }
      let x1=x; while(x1+1<COLS && isEdge(x1+1,y)) x1++;
      if(x1-x+1>=4) carveCliff(x,x1,y);
      x=x1+1;
    }
  }
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++) if(high[y][x]) highCellArr[y*COLS+x]=1;
  for(let i=0;i<ROWS*COLS;i++) if(faceCellArr[i]) highCellArr[i]=0;
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    const i=y*COLS+x; if(!faceCellArr[i]) continue;
    if(y>0 && highCellArr[(y-1)*COLS+x]) faceTopArr[i]=1;
    if(y+1>=ROWS || !faceCellArr[(y+1)*COLS+x]) faceBaseArr[i]=1;
  }
  faceIdxArr=new Uint8Array(ROWS*COLS);
  const fget=(x,y)=> x>=0&&x<COLS&&y>=0&&y<ROWS && faceCellArr[y*COLS+x];
  const vrock=(vx,vy)=>{ let c=0; if(fget(vx-1,vy-1))c++; if(fget(vx,vy-1))c++; if(fget(vx-1,vy))c++; if(fget(vx,vy))c++; return c>=2; };
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    if(!faceCellArr[y*COLS+x]) continue;
    const NW=vrock(x,y), NE=vrock(x+1,y), SW=vrock(x,y+1), SE=vrock(x+1,y+1);
    faceIdxArr[y*COLS+x]=(NW?8:0)|(NE?4:0)|(SW?2:0)|(SE?1:0);
  }
}
function largestInteriorRegion(){
  const seen = Array.from({length:ROWS},()=>Array(COLS).fill(false));
  const openCell=(x,y)=> tileMap[y][x]===15 && !blockGrid[y*COLS+x] && !faceCellArr[y*COLS+x];
  let best=null;
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    if(!openCell(x,y)||seen[y][x]) continue;
    const cells=[], stack=[[y,x]]; seen[y][x]=true;
    while(stack.length){
      const [cy,cx]=stack.pop(); cells.push([cy,cx]);
      for(const [ny,nx] of [[cy-1,cx],[cy+1,cx],[cy,cx-1],[cy,cx+1]]){
        if(ny<0||ny>=ROWS||nx<0||nx>=COLS||seen[ny][nx]||!openCell(nx,ny)) continue;
        seen[ny][nx]=true; stack.push([ny,nx]);
      }
    }
    if(!best||cells.length>best.length) best=cells;
  }
  return best||[];
}
let mainRegion=[], regionSet=new Set();
function placeStructures(rng){
  blockGrid=new Uint8Array(ROWS*COLS);
  structures=[];
  const lowOpen=(x,y)=> tileMap[y][x]===15 && !faceCellArr[y*COLS+x] && !highCellArr[y*COLS+x] && !blockGrid[y*COLS+x];
  const nB=2+((rng()*3)|0);
  for(let n=0;n<nB;n++){
    for(let tries=0;tries<80;tries++){
      const w=3+((rng()*3)|0), h=3+((rng()*2)|0);
      const cx=1+((rng()*(COLS-w-2))|0), cy=1+((rng()*(ROWS-h-2))|0);
      let ok=true;
      for(let y=cy-1;y<=cy+h&&ok;y++)for(let x=cx-1;x<=cx+w&&ok;x++)
        if(!lowOpen(x,y)) ok=false;
      if(!ok) continue;
      for(let y=cy;y<cy+h;y++)for(let x=cx;x<cx+w;x++) blockGrid[y*COLS+x]=1;
      const s={kind:'building',cx,cy,w,h,rise:24+((rng()*10)|0)};
      s.canvas=BuildingGfx.render(s, mulberry32((rng()*1e9)|0));
      structures.push(s);
      break;
    }
  }
}
function genWorld(seedStr){
  const rng = mulberry32(hashSeed(seedStr));
  blockGrid=new Uint8Array(ROWS*COLS); structures=[];
  highCellArr=new Uint8Array(ROWS*COLS); faceCellArr=new Uint8Array(ROWS*COLS);
  faceTopArr=new Uint8Array(ROWS*COLS); faceBaseArr=new Uint8Array(ROWS*COLS);
  faceSideArr=new Uint8Array(ROWS*COLS); faceHArr=new Int8Array(ROWS*COLS);
  faceIdxArr=new Uint8Array(ROWS*COLS);
  let best=null;
  for(let attempt=0; attempt<40; attempt++){
    field = generateCAField(ROWS, COLS, 0.62, 4, rng);
    vgrid = computeVertexGrid(field, ROWS, COLS);
    tileMap = Array.from({length:ROWS},()=>Array(COLS).fill(0));
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++) tileMap[y][x]=fieldCornerIndex(cellCorners(vgrid,x,y));
    mainRegion = largestInteriorRegion();
    if(!best || mainRegion.length>best.region.length)
      best={field, vgrid, tileMap, region:mainRegion};
    if(mainRegion.length >= ROWS*COLS*0.34) break;
  }
  field=best.field; vgrid=best.vgrid; tileMap=best.tileMap;
  buildTerraces(rng);
  // no dwellings in the Understory — nobody lives down here, only the dark
  // and what it hoards. (structures stay empty; terraces still shape the maze.)
  blockGrid=new Uint8Array(ROWS*COLS); structures=[];
  mainRegion = largestInteriorRegion();
  regionSet = new Set(mainRegion.map(([y,x])=>y*COLS+x));
  variantMap = tileMap.map(row=>row.map(()=>Math.floor(rng()*NUM_VARIANTS)));
  trees=[];
  for(const [y,x] of mainRegion){
    if(!highCellArr[y*COLS+x] && rng()<0.055) trees.push({x:(x+0.5)*RES, y:(y+0.5)*RES, r:6, wob:rng()*6.28});
  }
}
function walkable(px,py){
  if(px<0||py<0||px>=WORLD_W||py>=WORLD_H) return false;
  const cx=(px/RES)|0, cy=(py/RES)|0;
  const ci=cy*COLS+cx;
  if(blockGrid[ci]) return false;
  if(faceCellArr[ci]) return false;
  const m=collMasks[tileMap[cy][cx]];
  return m[((py-cy*RES)|0)*RES + ((px-cx*RES)|0)]===1;
}
function collR(ent){ return Math.min(ent.r*0.7, 11); }
function canStand(x,y,r){
  if(!walkable(x,y)) return false;
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    if(!walkable(x+Math.cos(a)*r, y+Math.sin(a)*r)) return false;
  }
  return true;
}
function isPathableCell(cx,cy){
  return cx>=0&&cx<COLS&&cy>=0&&cy<ROWS&&tileMap[cy][cx]===15&&!blockGrid[cy*COLS+cx]&&!faceCellArr[cy*COLS+cx];
}
function nearestPathable(cx,cy){
  if(isPathableCell(cx,cy)) return [cy,cx];
  for(let r=1;r<=4;r++)
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)
      if(Math.max(Math.abs(dx),Math.abs(dy))===r && isPathableCell(cx+dx,cy+dy)) return [cy+dy,cx+dx];
  return null;
}
function bfsPath(sx, sy, tx, ty){
  const s=nearestPathable(sx,sy), t=nearestPathable(tx,ty);
  if(!s||!t) return null;
  [sy,sx]=s; [ty,tx]=t;
  if(sx===tx&&sy===ty) return [[sy,sx]];
  const prev = new Int32Array(ROWS*COLS).fill(-1);
  const start = sy*COLS+sx, goal = ty*COLS+tx;
  prev[start] = start;
  const q = [start];
  for(let qi=0; qi<q.length; qi++){
    const cur = q[qi];
    if(cur===goal) break;
    const cy=(cur/COLS)|0, cx=cur%COLS;
    for(const [ny,nx] of [[cy-1,cx],[cy+1,cx],[cy,cx-1],[cy,cx+1]]){
      if(!isPathableCell(nx,ny)) continue;
      const n = ny*COLS+nx;
      if(prev[n]!==-1) continue;
      prev[n]=cur; q.push(n);
    }
  }
  if(prev[goal]===-1) return null;
  const path=[]; let cur=goal;
  while(cur!==start){ path.push([(cur/COLS)|0, cur%COLS]); cur=prev[cur]; }
  path.push([sy,sx]);
  path.reverse();
  return path;
}
function pathFromPlayer(px,py){
  return bfsPath(Math.floor(player.x/RES), Math.floor(player.y/RES),
                 Math.floor(px/RES), Math.floor(py/RES));
}
function randRegionCell(rng, minDistPx, fromX, fromY){
  for(let i=0;i<400;i++){
    const [y,x] = mainRegion[Math.floor((rng?rng():Math.random())*mainRegion.length)];
    const px=(x+0.5)*RES, py=(y+0.5)*RES;
    if(minDistPx && Math.hypot(px-fromX,py-fromY)<minDistPx) continue;
    return {x:px,y:py};
  }
  const [y,x]=mainRegion[0]; return {x:(x+0.5)*RES,y:(y+0.5)*RES};
}

/* ============================================================
   GAME STATE
   ============================================================ */
const player = {
  x:0, y:0, r:8, hp:5, maxHp:5, face:0, ifr:0,
  lunge:0, lx:0, ly:0,
  level:1, xp:0, kills:0,
  dmg:1, rangeMul:1, arcMul:1, speedMul:1,
  falling:null,
  dir:0, anim:'walk', animClock:0, atkClock:0, atkT:0,
};
function xpNeed(){ return 5 + (player.level-1)*4; }

let enemies=[], particles=[], slashes=[], floaters=[], drops=[], blooms=[], treasures=[];
let npcs=[], boss=null;
let combo=0, comboT=0, shake=0, hitstop=0, spawnT=2.5, dead=false, deadT=0;
let questPath=null, pathTimer=0;
let camX=0, camY=0, camCx=0, camCy=0;
let camZ=1.25, camZTarget=1.25;               // zoomable camera, like the overworld
const ZMIN=0.8, ZMAX=2.8;
function dclamp(v,a,b){ return v<a?a:v>b?b:v; }
// centre on the player, honouring the zoom level, and derive the view's top-left
function updateCamera(instant){
  camZ += (camZTarget-camZ)*(instant?1:0.12);
  const halfW=W/(2*camZ), halfH=H/(2*camZ);
  camCx = dclamp(player.x, Math.min(halfW,WORLD_W/2), Math.max(WORLD_W-halfW,WORLD_W/2));
  camCy = dclamp(player.y, Math.min(halfH,WORLD_H/2), Math.max(WORLD_H-halfH,WORLD_H/2));
  camX = camCx-halfW; camY = camCy-halfH;
}
const buffs = { rage:0, swift:0, wide:0 };
let dialogQueue=null, dialogIdx=0, dialogDone=null, gamePaused=false;
// the Understory no longer runs its own quest/Keeper — the OBJECTIVE is set by the
// overworld campaign (via dInfo.ref.storyObjective) and the crawl is linear:
// descend floor by floor, then put the heart at the bottom to rest.
let dInfo=null;              // the surface dungeon we entered {name,danger,depth,id,ref}
let exitCb=null;
let floorIdx=0;
let worldSeed='under';
let portalDown=null, portalUp=null;
let portalCd=0;
let lootBag={food:0,wood:0,stone:0}, totalKills=0, cleansedRun=false;
let keeperName='THE OLD ROOT';
let tilesetReady=false;

function isFinalFloor(){ return dInfo && floorIdx>=dInfo.depth-1; }
function dangerMul(){ return 1 + (dInfo?dInfo.danger:0.3)*0.8 + floorIdx*0.18; }

/* ---------- chrome augments (cyberware pulled from the deep) ---------- */
let augmentsGot=[];   // names of augments claimed this run, for the exit summary
const AUGMENTS=[
  {n:'Reflex Coprocessor',g:'⚡',fx(){player.speedMul*=1.12},d:'+12% speed'},
  {n:'Myomer Filament',   g:'💪',fx(){player.dmg+=0.3},       d:'+blade damage'},
  {n:'Servo Elbow',       g:'🦾',fx(){player.rangeMul*=1.18}, d:'+reach'},
  {n:'Fractal Edge',      g:'🌀',fx(){player.arcMul*=1.2},    d:'+wider arc'},
  {n:'Subdermal Weave',   g:'🛡',fx(){player.maxHp++;player.hp=Math.min(player.maxHp,player.hp+1)}, d:'+1 heart'},
];
function grantAugment(x,y){
  const a=AUGMENTS[(Math.random()*AUGMENTS.length)|0];
  a.fx(); augmentsGot.push(a.n);
  floater(x,y-16,a.g+' '+a.n,'#7de3ff'); floater(x,y+2,a.d,'#c9f27d');
  burst(x,y,'#7de3ff',24,230); SFX.level(); updHud();
}
/* ---------- scattered treasure caches ---------- */
function spawnTreasures(){
  treasures=[];
  const rng=mulberry32(hashSeed(worldSeed)^0x7EA51);
  const n = 7 + floorIdx*2 + Math.round((dInfo?dInfo.danger:0.3)*6);
  for(let i=0;i<n;i++){
    let s=null;
    for(let tries=0;tries<80;tries++){
      s=randRegionCell(rng, RES*4, player.x, player.y);
      if(pathFromPlayer(s.x, s.y)) break;
    }
    if(!s) continue;
    const chrome = rng()<0.26;   // ~a quarter hold a chrome augment
    treasures.push({x:s.x, y:s.y, t:Math.random()*6.28, chrome, got:false});
  }
}

/* ---------- keepers & their murky philosophies ---------- */
const KEEPER_NAMES=['THE DEAD ROUTER','MOTHER LICHEN','NULL-9','BROTHER MULCH','SISTER SPORE','THE UNBLINKING BULB','GHOST-IN-THE-FERN','THE PATIENT MARROW'];
const SCRIPTS={
  cull:{
    intro:[
      'So. Another surface-thought comes down to be debugged.',
      'This floor is running feral subroutines — corrupted processes that grew teeth and forgot their purpose.',
      'Terminate EIGHT of them. Pruning, too, is a kind of philosophy.',
    ],
    mid:'The corrupted still spawn. {n} more processes must be killed.',
    done:[
      'Quieter. You argue well with that blade of yours.',
      'Take this patch — may your heart hold one more wound. ♥',
    ],
    reward(){ player.maxHp++; player.hp=player.maxHp; },
  },
  blooms:{
    intro:[
      'Light grows down here, where it should not. It hums. It is learning to want.',
      'Harvest FIVE datha-blooms before they finish compiling their thought.',
      'Do not read what scrolls across them on the way back.',
    ],
    mid:'The datha-blooms glow where the dark runs deepest. {n} remain. Do not read them.',
    done:[
      'Jack them in here. Yes. They will stop broadcasting soon.',
      'Your blade will sweep wider now. Consider, later, why that pleases you.',
    ],
    reward(){ player.rangeMul*=1.25; player.arcMul*=1.15; },
  },
  boss:{
    intro:[
      'Every floor of the old net has a root process. This one’s is large, and angry, and nearly awake.',
      'Find the heart of this dark and refute it — hard-kill it at the core.',
      'Follow the skull. All arguments end the same way.',
    ],
    mid:'It waits in the far murk, spinning up. Follow the skull on your compass.',
    done:[
      'Refuted. The floor forgets it ever believed. Its chrome is yours.',
      'You are becoming quite the counter-example.',
    ],
    reward(){ player.dmg+=0.25; },
  },
};
const FINAL_DONE=[
  'The last word here was yours. The Understory closes its port.',
  'Go up, gardener. Tell the surface it may keep on dreaming — for now.',
];
const IDLE_LINES=[
  'The dark and I have reached a handshake. You may pass.',
  'Go up, or go down. Standing still is how roots — and deadlocks — happen.',
  'I run nothing, and everything executes anyway. Troubling.',
];

// a dungeon carries a QUEST only when the overworld quest system scripts one
// (dInfo.ref.storyObjective). A free-roam descent has no quest at all — just a
// raid: explore, fight, loot, leave.
function hasObjective(){ return !!(dInfo && dInfo.ref && dInfo.ref.storyObjective && dInfo.ref.storyObjective.label); }
function objTitle(){ return (hasObjective() && dInfo.ref.storyObjective.label) || ''; }
function questLabel(){
  if(!hasObjective()){
    // no assigned quest — only navigation
    return isFinalFloor() ? '◎ The deepest floor · ▲ take the way up to leave'
                          : '▼ Raid the dark · ▲ way up to leave';
  }
  if(isFinalFloor()){
    if(cleansedRun) return '⭐ '+objTitle()+' — take the way up ▲';
    if(boss)        return '☠ '+objTitle()+' — face the heart below';
    return '☠ Face the heart of '+(dInfo?dInfo.name:'the dark');
  }
  return '▼ '+objTitle()+' — descend to the deepest floor';
}
function openDialog(name, lines, onDone){
  $('dDialogName').textContent=name;
  dialogQueue=lines; dialogIdx=0; dialogDone=onDone||null; gamePaused=true;
  $('dDialogText').textContent=lines[0];
  $('dDialog').style.display='block';
  $('dTalkBtn').style.display='none';
}
function advanceDialog(){
  dialogIdx++;
  if(dialogQueue&&dialogIdx<dialogQueue.length){
    $('dDialogText').textContent=dialogQueue[dialogIdx];
  } else {
    $('dDialog').style.display='none';
    dialogQueue=null; gamePaused=false;
    if(dialogDone){ const f=dialogDone; dialogDone=null; f(); }
  }
}
// the Keeper/quest-giver is gone — this is now a dead stub kept only so the old
// button wiring resolves; it does nothing.
function talkToKeeper(){}

/* ---------- floor setup ---------- */
function pickQuestVariant(){
  if(isFinalFloor())return 'boss';
  const rng=mulberry32(hashSeed(worldSeed+'/quest'));
  const pool=['cull','cull','blooms','blooms','boss'];
  return pool[(rng()*pool.length)|0];
}
function startFloor(){
  applyWorldPalette(worldSeed);
  generateCreatures(worldSeed);
  genWorld(worldSeed);
  enemies=[]; drops=[]; particles=[]; slashes=[]; floaters=[]; blooms=[]; boss=null;
  combo=0; questPath=null; pathTimer=0; dead=false; deadT=0;
  npcs=[];   // no Keeper — the objective is set by the overworld
  const rng = mulberry32(hashSeed(worldSeed)^0xBEEF);
  let cx=0, cy=0;
  for(const [y,x] of mainRegion){ cx+=x; cy+=y; }
  cx/=mainRegion.length; cy/=mainRegion.length;
  let bestD=Infinity, bestCell=mainRegion[0];
  for(const [y,x] of mainRegion){
    const d=Math.hypot(x-cx,y-cy);
    if(d<bestD){ bestD=d; bestCell=[y,x]; }
  }
  player.x=(bestCell[1]+0.5)*RES; player.y=(bestCell[0]+0.5)*RES;
  player.falling=null; player.lunge=0;
  // the way UP sits near the spawn — you can always retreat to the surface
  let us;
  for(let i=0;i<200;i++){
    us=randRegionCell(rng, RES*3, player.x, player.y);
    if(Math.hypot(us.x-player.x,us.y-player.y)<RES*7 && pathFromPlayer(us.x,us.y)) break;
  }
  portalUp={x:us.x,y:us.y,t:Math.random()*6.28};
  portalDown=null;
  trees = trees.filter(t=>Math.hypot(t.x-portalUp.x,t.y-portalUp.y)>RES*1.5 && Math.hypot(t.x-player.x,t.y-player.y)>RES*1.5);
  // A SCRIPTED dungeon has an objective: the heart (boss) waits on the deepest
  // floor. A free-roam raid has NO quest at all — no heart, just a way deeper on
  // every floor (and the way up to leave whenever).
  if(hasObjective() && isFinalFloor()) spawnBoss();
  else if(!isFinalFloor()) spawnPortalDown(true);
  // (free-roam final floor: no boss, no way down — it's simply the bottom)
  spawnTreasures();
  portalCd=1.5;
  spawnT=2.5;
  player.ifr=1.5;
  floater(player.x,player.y-24,floorName(),'#b08fff');
  if(floorIdx===0 && hasObjective()) floater(player.x,player.y-40,objTitle().toUpperCase(),'#e8c065');
  updHud();
}
function spawnPortalDown(quiet){
  let ps;
  for(let i=0;i<200;i++){
    ps = randRegionCell(null, RES*10, player.x, player.y);
    if(pathFromPlayer(ps.x, ps.y)) break;
  }
  portalDown={x:ps.x, y:ps.y, t:Math.random()*6.28};
  trees = trees.filter(t=>Math.hypot(t.x-portalDown.x,t.y-portalDown.y)>RES*1.5);
  if(!quiet)floater(player.x,player.y-30,'THE WAY DOWN OPENS','#b08fff');
}
function floorName(){ return (dInfo?dInfo.name.toUpperCase():'THE UNDERSTORY')+' · FLOOR '+(floorIdx+1)+'/'+(dInfo?dInfo.depth:1); }
function descendFloor(){
  floorIdx++;
  worldSeed = baseSeed()+'-f'+floorIdx;
  startFloor();
  shake=10;
  burst(player.x,player.y,'#b08fff',30,260);
  SFX.quest();
  navigator.vibrate&&navigator.vibrate([20,30,50]);
}
function baseSeed(){ return 'under-'+(dInfo?dInfo.id:'0')+'-'+(dInfo?dInfo.name:''); }
function spawnBlooms(){
  blooms=[];
  const rng=mulberry32(hashSeed(worldSeed)^0xF00D);
  for(let i=0;i<5;i++){
    let s;
    for(let tries=0;tries<200;tries++){
      s=randRegionCell(rng, RES*6, player.x, player.y);
      if(pathFromPlayer(s.x, s.y)) break;
    }
    blooms.push({x:s.x,y:s.y,t:Math.random()*6.28});
  }
}
function spawnBoss(){
  let s;
  for(let tries=0;tries<200;tries++){
    s=randRegionCell(null, RES*14, player.x, player.y);
    if(pathFromPlayer(s.x, s.y)) break;
  }
  const hp=Math.round(16*dangerMul());
  boss={ x:s.x, y:s.y, r:22, hp, maxHp:hp, spd:60, kx:0, ky:0, flash:0, wob:0,
    charge:0, chargeCd:3, isBoss:true };
  enemies.push(boss);
}

/* ============================================================
   INPUT — ambiguous-touch gesture system
   ============================================================ */
const SWIPE_MAX_MS=220, SWIPE_MIN_DIST=34, STICK_PROMOTE=130, STICK_RADIUS=56;
let stick=null;
const pending=new Map();
const touchPts=new Map();   // all active touches, for pinch-zoom detection
let pinch=null;
function pinchDist(){ const a=[...touchPts.values()]; return a.length>=2?Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y):0; }
cvs.addEventListener('touchstart',e=>{
  if(!active)return;
  e.preventDefault();
  if(dialogQueue){ advanceDialog(); return; }
  for(const t of e.changedTouches){
    touchPts.set(t.identifier,{x:t.clientX,y:t.clientY});
    pending.set(t.identifier,{x0:t.clientX,y0:t.clientY,x:t.clientX,y:t.clientY,t0:performance.now()});
  }
  if(touchPts.size>=2){ pinch={d0:pinchDist(),z0:camZTarget}; stick=null; pending.clear(); }   // two fingers → zoom, not move/slash
},{passive:false});
cvs.addEventListener('touchmove',e=>{
  if(!active)return;
  e.preventDefault();
  for(const t of e.changedTouches){ const tp=touchPts.get(t.identifier); if(tp){ tp.x=t.clientX; tp.y=t.clientY; } }
  if(pinch&&touchPts.size>=2){ const d=pinchDist(); if(d>0&&pinch.d0>0) camZTarget=dclamp(pinch.z0*d/pinch.d0,ZMIN,ZMAX); return; }
  for(const t of e.changedTouches){
    if(stick&&stick.id===t.identifier){ stick.x=t.clientX; stick.y=t.clientY; continue; }
    const pd=pending.get(t.identifier);
    if(pd){ pd.x=t.clientX; pd.y=t.clientY; }
  }
},{passive:false});
function endTouch(t){
  touchPts.delete(t.identifier);
  if(touchPts.size<2) pinch=null;
  if(stick&&stick.id===t.identifier){ stick=null; return; }
  const pd=pending.get(t.identifier);
  if(!pd) return;
  pending.delete(t.identifier);
  if(pinch) return;                     // don't fire a slash out of a pinch gesture
  const dx=pd.x-pd.x0, dy=pd.y-pd.y0;
  if(performance.now()-pd.t0<=SWIPE_MAX_MS && Math.hypot(dx,dy)>=SWIPE_MIN_DIST)
    doSlash(Math.atan2(dy,dx));
}
cvs.addEventListener('touchend',e=>{ if(!active)return; e.preventDefault(); for(const t of e.changedTouches) endTouch(t); },{passive:false});
cvs.addEventListener('touchcancel',e=>{ for(const t of e.changedTouches){ touchPts.delete(t.identifier); pending.delete(t.identifier); if(stick&&stick.id===t.identifier) stick=null; } if(touchPts.size<2) pinch=null; });
cvs.addEventListener('wheel',e=>{ if(!active)return; e.preventDefault(); camZTarget=dclamp(camZTarget*(e.deltaY<0?1.1:0.9),ZMIN,ZMAX); },{passive:false});
let mDown=null;
cvs.addEventListener('mousedown',e=>{
  if(!active)return;
  if(dialogQueue){ advanceDialog(); return; }
  mDown={x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,t0:performance.now()};
});
cvs.addEventListener('mousemove',e=>{ if(!mDown)return; mDown.x=e.clientX; mDown.y=e.clientY;
  if(stick&&stick.id==='m'){stick.x=e.clientX;stick.y=e.clientY;} });
cvs.addEventListener('mouseup',e=>{ if(!mDown)return;
  if(stick&&stick.id==='m'){stick=null;mDown=null;return;}
  const dx=e.clientX-mDown.x0,dy=e.clientY-mDown.y0;
  if(performance.now()-mDown.t0<=SWIPE_MAX_MS && Math.hypot(dx,dy)>=SWIPE_MIN_DIST) doSlash(Math.atan2(dy,dx));
  mDown=null; });
function promotePending(){
  const now=performance.now();
  for(const [id,pd] of pending){
    if(now-pd.t0>=STICK_PROMOTE){
      pending.delete(id);
      if(!stick) stick={id, ox:pd.x0, oy:pd.y0, x:pd.x, y:pd.y};
    }
  }
  if(mDown&&!stick&&performance.now()-mDown.t0>=STICK_PROMOTE)
    stick={id:'m', ox:mDown.x0, oy:mDown.y0, x:mDown.x, y:mDown.y};
}
$('dTalkBtn').addEventListener('click', talkToKeeper);
$('dDialog').addEventListener('click', advanceDialog);
$('dLeaveBtn').addEventListener('click', ()=>{ if(active) exitDungeon(); });

/* ============================================================
   COMBAT
   ============================================================ */
const PLAYER_SPEED=175, BASE_RANGE=68, BASE_ARC=Math.PI*0.85, SLASH_TIME=0.14, SLASH_CD=0.16, DASH_PUSH=110;
let slashCd=0;
function slashRange(){ return BASE_RANGE*player.rangeMul*(buffs.wide>0?1.3:1); }
function slashArc(){ return Math.min(Math.PI*1.7, BASE_ARC*player.arcMul*(buffs.wide>0?1.25:1)); }
function slashDmg(){ return (player.dmg + Math.floor((player.level-1)/3)) * (buffs.rage>0?2:1); }
function doSlash(ang){
  if(dead||gamePaused||slashCd>0) return;
  slashCd=SLASH_CD;
  player.face=ang;
  player.anim='attack'; player.atkClock=0; player.atkT=SLASH_TIME*3;
  player.lunge=1; player.lx=Math.cos(ang); player.ly=Math.sin(ang);
  slashes.push({ang,t:0,hit:new Set(),range:slashRange(),arc:slashArc(),dmg:slashDmg()});
  SFX.slash();
  navigator.vibrate&&navigator.vibrate(12);
}
function startFall(hx, hy, fromX){
  let ly=hy+1;
  while(ly<ROWS && faceCellArr[ly*COLS+hx]) ly++;
  let land=null;
  search:
  for(let dy=0;dy<=3;dy++){
    for(let off=0; off<=2; off++){
      for(const c of [hx+off, hx-off]){
        if(c<0||c>=COLS) continue;
        const lx=(c+0.5)*RES, lyy=(ly+dy+0.5)*RES;
        if(canStand(lx,lyy,collR(player))){ land={x:lx,y:lyy}; break search; }
      }
    }
  }
  if(!land){ const p=nearestPathable(hx, ly); if(p) land={x:(p[1]+0.5)*RES, y:(p[0]+0.5)*RES}; else return; }
  player.falling={ t:0, dur:0.5, x0:player.x, y0:player.y, x1:land.x, y1:land.y };
  player.lunge=0;
  SFX.slash();
  navigator.vibrate&&navigator.vibrate(12);
}
function burst(x,y,col,n,spd){  for(let i=0;i<n;i++){ const a=Math.random()*6.28, s=spd*(0.3+Math.random());
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:0.35+Math.random()*0.3,t:0,col,r:2+Math.random()*3}); }
}
function floater(x,y,txt,col){ floaters.push({x,y,txt,col,t:0}); }

function spawnEnemy(){
  for(let i=0;i<40;i++){
    const a=Math.random()*6.28;
    const d=Math.max(W,H)*0.62 + Math.random()*140;
    const x=player.x+Math.cos(a)*d, y=player.y+Math.sin(a)*d;
    const cx=Math.floor(x/RES), cy=Math.floor(y/RES);
    if(!regionSet.has(cy*COLS+cx)) continue;
    if(!canStand(x,y,11)) continue;
    const roll=Math.random();
    const dm=dangerMul();
    if(roll<0.18){
      enemies.push({x,y,r:15,hp:Math.round(3*dm),big:true,spd:(55+Math.random()*20+player.level*2)*Math.min(dm,1.4),kx:0,ky:0,flash:0,wob:Math.random()*6.28});
    } else if(roll<0.42){
      enemies.push({x,y,r:7,hp:1,wisp:true,spd:(120+Math.random()*30+player.level*3)*Math.min(dm,1.3),kx:0,ky:0,flash:0,wob:Math.random()*6.28});
    } else {
      enemies.push({x,y,r:10,hp:Math.round(1*dm),spd:(75+Math.random()*25+player.level*3)*Math.min(dm,1.3),kx:0,ky:0,flash:0,wob:Math.random()*6.28});
    }
    return;
  }
}
function dropLoot(x,y,fromBig){
  // the Understory hoards; a kill spills more than it used to
  const r=Math.random();
  if(r<0.20 && player.hp<player.maxHp) drops.push({x,y,kind:'heart',t:0});
  else if(r<0.62) drops.push({x,y,kind:'gem',t:0});
  else if(r<0.62+(fromBig?0.34:0.12)){
    const kinds=['rage','swift','wide'];
    drops.push({x,y,kind:kinds[Math.floor(Math.random()*3)],t:0});
  }
  // a second gem from the fat ones
  if(fromBig && Math.random()<0.6) drops.push({x:x+Math.random()*10-5,y:y+Math.random()*10-5,kind:'gem',t:0});
}
function gainXp(n){
  player.xp+=n;
  while(player.xp>=xpNeed()){
    player.xp-=xpNeed(); player.level++;
    if(player.level%2===0) player.maxHp++;
    player.hp=Math.min(player.maxHp,player.hp+1);
    SFX.level();
    const lf=$('dLevelFlash');
    lf.textContent='LEVEL '+player.level;
    lf.style.opacity=1; setTimeout(()=>lf.style.opacity=0,900);
    burst(player.x,player.y,'#7de3ff',26,240);
  }
  updHud();
}
function onKill(e){
  player.kills++; totalKills++; combo++; comboT=2.4;
  // every unsaid thing leaves something worth carrying up
  const spoil=Math.random();
  if(spoil<0.4)lootBag.food+=e.big||e.isBoss?2:1;
  else if(spoil<0.7)lootBag.wood+=e.big||e.isBoss?2:1;
  else lootBag.stone+=e.big||e.isBoss?2:1;
  burst(e.x,e.y,e.isBoss?'#ff5d8f':'#c9f27d',e.isBoss?46:16,e.isBoss?340:240);
  floater(e.x,e.y,combo>1?combo+'x':'+'+(e.big||e.isBoss?3:1),combo>3?'#ff5d8f':'#ffd166');
  gainXp(e.isBoss?20:(e.big?3:1));
  dropLoot(e.x,e.y,e.big);
  SFX.kill();
  if(e.isBoss){
    boss=null;
    floater(e.x,e.y-20,'THE HEART IS REFUTED','#ff5d8f');
    shake=18;
    // the heart always spits out chrome — and a heap of salvage
    grantAugment(e.x,e.y);
    lootBag.stone+=4; lootBag.food+=3; lootBag.wood+=3;
    for(let i=0;i<4;i++) drops.push({x:e.x+Math.random()*24-12,y:e.y+Math.random()*24-12,kind:'gem',t:0});
    // the deepest heart put to rest CLEANSES the run — the overworld objective is met
    if(isFinalFloor()){ cleansedRun=true; floater(player.x,player.y-30,objTitle().toUpperCase()+' — TAKE THE WAY UP ▲','#7de3a0'); SFX.quest(); SFX.level(); }
  }
  updHud();
}

/* ---------- movement with terrain collision ---------- */
function tryAxis(ent, dx, dy, r){
  if(canStand(ent.x+dx, ent.y+dy, r)){ ent.x+=dx; ent.y+=dy; return true; }
  const mag=Math.abs(dx||dy);
  for(const off of [mag, -mag, mag*2, -mag*2]){
    if(dx!==0 && canStand(ent.x+dx, ent.y+off*0.8, r)){ ent.x+=dx; ent.y+=off*0.8; return true; }
    if(dy!==0 && canStand(ent.x+off*0.8, ent.y+dy, r)){ ent.x+=off*0.8; ent.y+=dy; return true; }
  }
  return false;
}
function moveWithCollision(ent, dx, dy){
  const r=collR(ent);
  const steps=Math.max(1, Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/3));
  const sx=dx/steps, sy=dy/steps;
  for(let i=0;i<steps;i++){
    if(sx!==0) tryAxis(ent, sx, 0, r);
    if(sy!==0) tryAxis(ent, 0, sy, r);
  }
  ent.x=Math.max(ent.r,Math.min(WORLD_W-ent.r,ent.x));
  ent.y=Math.max(ent.r,Math.min(WORLD_H-ent.r,ent.y));
}
function tryNudge(ent, dx, dy){
  if(canStand(ent.x+dx, ent.y+dy, collR(ent))){ ent.x+=dx; ent.y+=dy; return true; }
  return false;
}

/* ---------- enemy perception & navigation ---------- */
function hasLOS(x0,y0,x1,y1){
  const d=Math.hypot(x1-x0,y1-y0), n=Math.ceil(d/8);
  for(let i=1;i<n;i++){
    const t=i/n;
    if(!walkable(x0+(x1-x0)*t, y0+(y1-y0)*t)) return false;
  }
  return true;
}
let flowDist=null, flowTimer=0;
function computeFlow(){
  flowDist=new Int32Array(ROWS*COLS).fill(-1);
  const s=nearestPathable((player.x/RES)|0,(player.y/RES)|0);
  if(!s) return;
  const q=[s[0]*COLS+s[1]];
  flowDist[q[0]]=0;
  for(let qi=0; qi<q.length; qi++){
    const cur=q[qi], cy=(cur/COLS)|0, cx=cur%COLS, nd=flowDist[cur]+1;
    for(const [ny,nx] of [[cy-1,cx],[cy+1,cx],[cy,cx-1],[cy,cx+1]]){
      if(!isPathableCell(nx,ny)) continue;
      const n=ny*COLS+nx;
      if(flowDist[n]!==-1) continue;
      flowDist[n]=nd; q.push(n);
    }
  }
}
function flowDir(px,py){
  if(!flowDist) return null;
  const c=nearestPathable((px/RES)|0,(py/RES)|0);
  if(!c) return null;
  let bd=flowDist[c[0]*COLS+c[1]];
  if(bd<0) return null;
  let best=null;
  for(const [ny,nx] of [[c[0]-1,c[1]],[c[0]+1,c[1]],[c[0],c[1]-1],[c[0],c[1]+1]]){
    if(!isPathableCell(nx,ny)) continue;
    const dv=flowDist[ny*COLS+nx];
    if(dv>=0 && dv<bd){ bd=dv; best=[ny,nx]; }
  }
  if(!best) return null;
  const tx=(best[1]+0.5)*RES, ty=(best[0]+0.5)*RES;
  const d=Math.hypot(tx-px,ty-py)||1;
  return [(tx-px)/d,(ty-py)/d];
}
function wallRepel(e){
  const probe=collR(e)+9;
  let rx=0, ry=0;
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    if(!walkable(e.x+Math.cos(a)*probe, e.y+Math.sin(a)*probe)){ rx-=Math.cos(a); ry-=Math.sin(a); }
  }
  return [rx,ry];
}
function pickPatrolPath(e){
  const c=nearestPathable((e.x/RES)|0,(e.y/RES)|0);
  if(!c) return null;
  for(let t=0;t<12;t++){
    const [ry,rx]=mainRegion[(Math.random()*mainRegion.length)|0];
    const md=Math.abs(rx-c[1])+Math.abs(ry-c[0]);
    if(md<6||md>40) continue;
    const p=bfsPath(c[1],c[0],rx,ry);
    if(p) return p;
  }
  return null;
}

/* ============================================================
   UPDATE
   ============================================================ */
function update(dt){
  slashCd-=dt;
  if(comboT>0){ comboT-=dt; if(comboT<=0){combo=0; updHud();} }
  shake*=Math.pow(0.001,dt);
  for(const k in buffs){ if(buffs[k]>0){ buffs[k]-=dt; if(buffs[k]<=0) updBuffs(); } }
  if(dead){ deadT+=dt; if(deadT>2.4) respawn(); return; }

  // --- player ---
  if(player.falling){
    const fa=player.falling; fa.t+=dt;
    const e=Math.min(fa.t/fa.dur,1);
    player.x=fa.x0+(fa.x1-fa.x0)*e;
    player.y=fa.y0+(fa.y1-fa.y0)*(e*e);
    player.ifr=Math.max(player.ifr,0.3);
    if(e>=1){
      player.x=fa.x1; player.y=fa.y1; player.falling=null;
      player.ifr=Math.max(player.ifr,0.7);
      burst(player.x,player.y+6,'#cbb89a',16,150);
      shake=Math.max(shake,7); SFX.hurt();
      navigator.vibrate&&navigator.vibrate(30);
    }
    updateCamera();
    return;
  }
  let mx=0,my=0;
  if(stick){
    let dx=stick.x-stick.ox, dy=stick.y-stick.oy;
    const d=Math.hypot(dx,dy);
    if(d>STICK_RADIUS){ const ex=(d-STICK_RADIUS)/d; stick.ox+=dx*ex; stick.oy+=dy*ex; dx=stick.x-stick.ox; dy=stick.y-stick.oy; }
    const m=Math.min(d/STICK_RADIUS,1);
    if(d>4){ mx=dx/d*m; my=dy/d*m; player.face=Math.atan2(dy,dx); }
  }
  if(my>0.25 && !player.falling){
    const pcx=(player.x/RES)|0, pcy=(player.y/RES)|0;
    if(highCellArr[pcy*COLS+pcx] && faceCellArr[(pcy+1)*COLS+pcx]){ startFall(pcx, pcy, player.x); }
  }
  if(player.falling) return;
  const spd=PLAYER_SPEED*player.speedMul*(buffs.swift>0?1.45:1);
  let vx=mx*spd, vy=my*spd;
  if(player.lunge>0){ vx+=player.lx*DASH_PUSH*player.lunge*8; vy+=player.ly*DASH_PUSH*player.lunge*8; player.lunge-=dt*7; }
  moveWithCollision(player, vx*dt, vy*dt);
  player.ifr-=dt;
  const moving = Math.hypot(vx,vy) > 6;
  if(moving) player.dir = CFHelp.angToDir(Math.atan2(vy,vx));
  if(player.atkT>0){ player.atkT-=dt; player.atkClock+=dt; player.anim='attack'; }
  else if(moving){ const running = Math.hypot(vx,vy) > spd*0.85; player.anim = running?'run':'walk'; player.animClock+=dt; }
  else { player.anim='walk'; }

  // --- camera ---
  updateCamera();

  // --- spawning ---
  spawnT-=dt;
  const cap = 8 + Math.min(10,player.level) + floorIdx*2 + (cleansedRun?4:0);
  if(spawnT<=0 && enemies.length<cap){
    spawnEnemy();
    spawnT=Math.max(0.6, 2.2-player.level*0.08-floorIdx*0.1);
  }

  // --- slashes ---
  for(const s of slashes){
    s.t+=dt;
    if(s.t/SLASH_TIME<=1){
      for(const e of enemies){
        if(s.hit.has(e)) continue;
        const dx=e.x-player.x, dy=e.y-player.y, d=Math.hypot(dx,dy);
        if(d<s.range+e.r){
          let da=Math.atan2(dy,dx)-s.ang;
          da=Math.atan2(Math.sin(da),Math.cos(da));
          if(Math.abs(da)<s.arc/2){
            s.hit.add(e);
            e.hp-=s.dmg; e.flash=0.12;
            const k=(e.isBoss?300:(e.big?520:820))*(buffs.rage>0?1.4:1);
            e.kx=Math.cos(s.ang)*k; e.ky=Math.sin(s.ang)*k;
            hitstop=Math.max(hitstop,0.055); shake=Math.max(shake,e.big||e.isBoss?9:6);
            burst(e.x,e.y,e.isBoss?'#ff5d8f':'#ffd166',10,180);
            SFX.hit();
            navigator.vibrate&&navigator.vibrate(20);
            if(e.hp<=0){ e.dead=true; onKill(e); }
          }
        }
      }
    }
  }
  slashes=slashes.filter(s=>s.t<SLASH_TIME*1.8);

  // --- enemies ---
  flowTimer-=dt;
  if(flowTimer<=0){ flowTimer=0.35; computeFlow(); }
  for(const e of enemies){
    e.flash-=dt; e.wob+=dt*6;
    const dx=player.x-e.x, dy=player.y-e.y, d=Math.hypot(dx,dy)||1;
    const aggroR = e.isBoss?420:(e.wisp?300:(e.big?240:260));
    const los = d<aggroR*1.4 && hasLOS(e.x,e.y,player.x,player.y);
    if(e.state===undefined){ e.state='patrol'; e.idle=Math.random()*1.5; }
    if(e.state!=='chase' && ((d<aggroR && los) || e.flash>0)){ e.state='chase'; e.lost=0; }
    if(e.state==='chase'){
      if(d>aggroR*1.8 && !los){
        e.lost=(e.lost||0)+dt;
        if(e.lost>3){ e.state='patrol'; e.path=null; e.idle=0.5; }
      } else e.lost=0;
    }
    let ux=0, uy=0, espd=e.spd;
    if(e.state==='patrol'){
      espd=e.spd*0.45;
      if(e.idle>0){ e.idle-=dt; }
      else{
        if(!e.path||e.pi>=e.path.length){
          e.path=pickPatrolPath(e); e.pi=0;
          if(!e.path) e.idle=1.2;
        }
        if(e.path&&e.pi<e.path.length){
          const [cy,cx]=e.path[e.pi];
          const tx=(cx+0.5)*RES, ty=(cy+0.5)*RES;
          const pd=Math.hypot(tx-e.x,ty-e.y);
          if(pd<10){ e.pi++; if(e.pi>=e.path.length){ e.path=null; e.idle=0.8+Math.random()*1.8; } }
          else{ ux=(tx-e.x)/pd; uy=(ty-e.y)/pd; }
        }
      }
    } else {
      if(los && d<210){
        ux=dx/d; uy=dy/d;
        if(e.wisp){
          e.dartT=(e.dartT??(1+Math.random()*2))-dt;
          if(e.dartT<=0){ e.dart=0.5; e.dartT=2+Math.random()*1.5; }
          if(e.dart>0){ e.dart-=dt; espd=e.spd*1.7; }
          else if(d<150){
            const side = e.side ?? (e.side=Math.random()<0.5?1:-1);
            ux=(dx/d)*0.25-(dy/d)*side; uy=(dy/d)*0.25+(dx/d)*side;
            const m=Math.hypot(ux,uy)||1; ux/=m; uy/=m;
            espd=e.spd*0.9;
          }
        } else if(e.big&&!e.isBoss){
          e.bCd=(e.bCd??2)-dt;
          if(e.bCd<=0&&d<130){ e.bCharge=0.45; e.bCd=2.5+Math.random(); }
          if(e.bCharge>0){ e.bCharge-=dt; espd=235; }
          else espd=e.spd*0.85;
        }
        if(e.isBoss){
          e.chargeCd-=dt;
          if(e.chargeCd<=0 && d<340){ e.charge=0.9; e.chargeCd=3.5+Math.random()*1.5; SFX.hurt(); }
          if(e.charge>0){ e.charge-=dt; espd=260; }
        }
      } else {
        const dir=flowDir(e.x,e.y);
        if(dir){ ux=dir[0]; uy=dir[1]; }
        else { ux=dx/d; uy=dy/d; }
      }
    }
    const [rx,ry]=wallRepel(e);
    const emvx=(ux*espd+rx*55+e.kx), emvy=(uy*espd+ry*55+e.ky);
    moveWithCollision(e, emvx*dt, emvy*dt);
    if(Math.hypot(emvx,emvy) > 8){ e.dir = CFHelp.angToDir(Math.atan2(emvy,emvx)); }
    if(e.dir===undefined) e.dir=0;
    const nearP = d < e.r+player.r+14;
    if(nearP && e.state==='chase'){ e.anim='attack'; e.animClock=(e.animClock||0)+dt; }
    else if(Math.hypot(emvx,emvy) > espd*0.9 && espd>90){ e.anim='run'; e.animClock=(e.animClock||0)+dt; }
    else if(Math.hypot(emvx,emvy) > 8){ e.anim='walk'; e.animClock=(e.animClock||0)+dt; }
    else { e.anim='walk'; e.animClock=(e.animClock||0)+dt*0.4; }
    e.kx*=Math.pow(0.008,dt); e.ky*=Math.pow(0.008,dt);
    if(player.ifr<=0 && d<e.r+player.r){
      player.hp--; player.ifr=1.0; shake=12; hitstop=0.08;
      burst(player.x,player.y,'#7de3ff',14,220);
      SFX.hurt();
      navigator.vibrate&&navigator.vibrate([30,40,30]);
      updHud();
      if(player.hp<=0){ dead=true; deadT=0; burst(player.x,player.y,'#7de3ff',40,320); }
    }
    {
      const dx2=e.x-player.x, dy2=e.y-player.y;
      const d2=Math.hypot(dx2,dy2)||0.001, minD=e.r+player.r;
      if(d2<minD){
        const push=minD-d2, ux2=dx2/d2, uy2=dy2/d2;
        const moved=tryNudge(e, ux2*push*0.75, uy2*push*0.75);
        tryNudge(player, -ux2*push*0.25, -uy2*push*0.25);
        if(!moved) tryNudge(player, -ux2*push*0.5, -uy2*push*0.5);
      }
    }
  }
  for(let i=0;i<enemies.length;i++)for(let j=i+1;j<enemies.length;j++){
    const a=enemies[i], b=enemies[j];
    const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy)||0.001;
    const minD=(a.r+b.r)*0.9;
    if(d<minD){
      const push=(minD-d)/2, ux=dx/d, uy=dy/d;
      tryNudge(a, -ux*push, -uy*push);
      tryNudge(b,  ux*push,  uy*push);
    }
  }
  enemies=enemies.filter(e=>!e.dead);

  // --- drops / blooms / NPC proximity ---
  for(const dr of drops){
    dr.t+=dt;
    if(Math.hypot(dr.x-player.x,dr.y-player.y)<player.r+12){
      dr.got=true; SFX.pickup();
      if(dr.kind==='heart'){ player.hp=Math.min(player.maxHp,player.hp+1); floater(dr.x,dr.y,'+♥','#ff8fa3'); }
      else if(dr.kind==='gem'){ gainXp(2); floater(dr.x,dr.y,'+2xp','#7de3ff'); }
      else { buffs[dr.kind]=10; floater(dr.x,dr.y,dr.kind.toUpperCase()+'!','#ffd166'); updBuffs(); }
      updHud();
    }
  }
  drops=drops.filter(d=>!d.got && d.t<25);
  // --- treasure caches ---
  for(const tr of treasures){
    tr.t+=dt*1.5;
    if(!tr.got && Math.hypot(tr.x-player.x,tr.y-player.y)<player.r+14){
      tr.got=true; SFX.pickup();
      if(tr.chrome){
        grantAugment(tr.x,tr.y);
      }else{
        const haul=2+Math.floor(Math.random()*4);
        const k=['food','wood','stone'][(Math.random()*3)|0];
        lootBag[k]+=haul; gainXp(3);
        burst(tr.x,tr.y,'#ffd166',16,200);
        floater(tr.x,tr.y,'+'+haul+' salvage','#ffd166');
        if(Math.random()<0.4) drops.push({x:tr.x,y:tr.y,kind:'gem',t:0});
      }
      updHud();
    }
  }
  treasures=treasures.filter(t=>!t.got);
  $('dTalkBtn').style.display='none';   // no Keeper to talk to any more

  // --- portals ---
  portalCd-=dt;
  if(portalUp){
    portalUp.t+=dt;
    if(portalCd<=0 && Math.hypot(portalUp.x-player.x,portalUp.y-player.y)<player.r+14){
      exitDungeon();
      return;
    }
  }
  if(portalDown){
    portalDown.t+=dt;
    if(portalCd<=0 && Math.hypot(portalDown.x-player.x,portalDown.y-player.y)<player.r+14){
      descendFloor();
      return;
    }
  }

  // --- route to current objective ---
  pathTimer-=dt;
  if(pathTimer<=0){
    pathTimer=0.5;
    const tgt=compassTarget();
    questPath = tgt ? pathFromPlayer(tgt.x,tgt.y) : null;
  }

  // --- particles / floaters ---
  for(const p of particles){ p.t+=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=0.92; p.vy*=0.92; }
  particles=particles.filter(p=>p.t<p.life);
  for(const f of floaters){ f.t+=dt; f.y-=40*dt; }
  floaters=floaters.filter(f=>f.t<0.9);
}

function respawn(){
  dead=false; player.hp=player.maxHp; player.ifr=2;
  enemies=enemies.filter(e=>e.isBoss);
  combo=0;
  // begin again at the way up (your line of retreat to the surface)
  const anchor = portalUp || {x:player.x,y:player.y};
  const spots=[[anchor.x+RES,anchor.y],[anchor.x-RES,anchor.y],[anchor.x,anchor.y+RES],[anchor.x,anchor.y-RES],[anchor.x,anchor.y]];
  for(const [sx,sy] of spots){
    if(canStand(sx,sy,collR(player))){ player.x=sx; player.y=sy; break; }
  }
  updHud();
}

/* ============================================================
   HUD
   ============================================================ */
function updHud(){
  $('dHp').textContent='♥'.repeat(Math.max(0,player.hp))+'·'.repeat(Math.max(0,player.maxHp-player.hp));
  $('dXpline').textContent=`LV ${player.level}  xp ${player.xp}/${xpNeed()}`;
  $('dScore').innerHTML='KILLS '+player.kills+'<br><span style="font-size:11px;color:#b08fff;">'+floorName()+'</span><br><span style="font-size:10px;color:#8aa891;">🎒 '+lootBag.food+'🍇 '+lootBag.wood+'🪵 '+lootBag.stone+'🪨</span>';
  $('dQuestBox').textContent=questLabel();
  const c=$('dCombo');
  c.textContent=combo>1?combo+'x':''; c.style.opacity=combo>1?1:0;
}
function updBuffs(){
  const el=$('dBuffs');
  const names={rage:'⚔ RAGE',swift:'≫ SWIFT',wide:'◠ WIDE'};
  el.innerHTML=Object.keys(buffs).filter(k=>buffs[k]>0)
    .map(k=>`<div class="buff">${names[k]} ${Math.ceil(buffs[k])}s</div>`).join('');
}
setInterval(()=>{if(active)updBuffs()},500);

/* ============================================================
   RENDER
   ============================================================ */
// draw calls run under a world-space camera transform now, so world→screen is
// the identity here (the transform applies the pan + zoom)
function wx(x){ return x; }
function wy(y){ return y; }
function drawTerrain(){
  const vw=W/camZ, vh=H/camZ;
  const startCol=Math.max(0,Math.floor(camX/RES)), endCol=Math.min(COLS,Math.ceil((camX+vw)/RES)+1);
  const startRow=Math.max(0,Math.floor(camY/RES)), endRow=Math.min(ROWS,Math.ceil((camY+vh)/RES)+1);
  for(let y=startRow;y<endRow;y++)for(let x=startCol;x<endCol;x++){
    const idx=y*COLS+x, dx=x*RES, dy=y*RES;
    const vsel=variantMap[y][x];
    if(faceCellArr[idx]){
      const lt=fieldTiles[15]; ctx.drawImage(lt.variants[vsel%lt.variants.length], dx, dy, RES+1, RES+1);
      const ct=cliffTiles[faceIdxArr[idx]]; ctx.drawImage(ct[vsel%ct.length], dx, dy, RES+1, RES+1);
    } else if(highCellArr[idx]){
      const t=highTiles[tileMap[y][x]]; ctx.drawImage(t.variants[vsel%t.variants.length], dx, dy, RES+1, RES+1);
    } else {
      const t=fieldTiles[tileMap[y][x]]; ctx.drawImage(t.variants[vsel%t.variants.length], dx, dy, RES+1, RES+1);
    }
  }
  for(let y=startRow;y<endRow;y++)for(let x=startCol;x<endCol;x++){
    const idx=y*COLS+x, px=x*RES, py=y*RES;
    if(faceTopArr[idx]){ ctx.fillStyle='rgba(0,0,0,0.20)'; ctx.fillRect(px, py, RES+1, 5); }
    if(faceCellArr[idx] && !faceTopArr[idx]){ ctx.fillStyle='rgba(0,0,0,0.08)'; ctx.fillRect(px, py, RES+1, RES+1); }
    if(faceBaseArr[idx]){ ctx.fillStyle='rgba(0,0,0,0.16)'; ctx.fillRect(px, py+RES, RES+1, 5); }
  }
}
/* ---------- per-tile atmospheric lighting ---------- */
let lightCv=null,lightCtx=null,lightImg=null,lbuf=null,lightBorrowed=null;
function initLight(){
  lightCv=document.createElement('canvas'); lightCv.width=COLS; lightCv.height=ROWS;
  lightCtx=lightCv.getContext('2d'); lightImg=lightCtx.createImageData(COLS,ROWS);
  lbuf=new Float32Array(COLS*ROWS);
  const d=lightImg.data;
  // the SHADOW colour: when the Understory borrows the surface skin its shadows are
  // a soft cool dusk (so the bright green tiles read like a sunless grove), not the
  // old near-black "drowned" murk
  const tint = T.borrowedSkin ? [14,20,24] : [4,8,16];
  for(let i=0;i<COLS*ROWS;i++){ const p=i*4; d[p]=tint[0]; d[p+1]=tint[1]; d[p+2]=tint[2]; }
  lightBorrowed=!!T.borrowedSkin;
}
function addLight(wx0,wy0,r,inten){
  const cxp=wx0/RES, cyp=wy0/RES, rc=r/RES, r2=rc*rc;
  const x0=Math.max(0,Math.floor(cxp-rc)), x1=Math.min(COLS-1,Math.ceil(cxp+rc));
  const y0=Math.max(0,Math.floor(cyp-rc)), y1=Math.min(ROWS-1,Math.ceil(cyp+rc));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const dx=x+0.5-cxp, dy=y+0.5-cyp, d2=dx*dx+dy*dy;
    if(d2>r2) continue;
    const f=1-Math.sqrt(d2)/rc; lbuf[y*COLS+x]+=inten*f*f;
  }
}
// darkness overlay carved by light sources — the Sage's lantern, glowing foes,
// treasure, blooms and portals — for pools of light in the murk
function drawLighting(){
  const borrowed=!!T.borrowedSkin;
  if(!lightImg || lightBorrowed!==borrowed) initLight();   // re-tint if the skin mode changed
  // A surface-skinned Understory is lit like a shaded grove: a moody-but-readable
  // ambient with warm pools of light around the Sage & the glowing things, and a
  // soft dusk at the edges — deep enough to feel underground, bright enough to show
  // off the surface tiles. (A non-borrowed floor keeps the old near-dark murk.)
  const amb = borrowed ? (0.40 - Math.min(0.10, floorIdx*0.025)) : (0.13 - Math.min(0.06, floorIdx*0.012));
  lbuf.fill(amb<0.04?0.04:amb);
  addLight(player.x, player.y, (borrowed?9.5:8.5)*RES, borrowed?1.3:1.35);   // the Sage's lantern
  for(const e of enemies){
    if(e.dead) continue;
    if(e.wisp) addLight(e.x,e.y,3.4*RES,0.75);
    else if(e.isBoss) addLight(e.x,e.y,4.6*RES,0.9);
    else if(e.flash>0) addLight(e.x,e.y,2.4*RES,0.6);      // a struck foe flares
  }
  for(const tr of treasures){ if(!tr.got) addLight(tr.x,tr.y,3*RES,0.6); }
  for(const b of blooms){ if(!b.got) addLight(b.x,b.y,2.6*RES,0.5); }
  if(portalDown) addLight(portalDown.x,portalDown.y,3.2*RES,0.55);
  if(portalUp) addLight(portalUp.x,portalUp.y,2.6*RES,0.45);
  for(const n of npcs) addLight(n.x,n.y,3*RES,0.5);        // the Keeper keeps a light
  for(const s of structures){ const sx=(s.cx+s.w/2)*RES, sy=(s.cy+s.h/2)*RES; addLight(sx,sy,3.2*RES,0.45); }
  const maxDark = borrowed ? 0.78 : 0.9, data=lightImg.data;
  for(let i=0;i<COLS*ROWS;i++){ let dk=1-lbuf[i]; if(dk<0)dk=0; else if(dk>maxDark)dk=maxDark; data[i*4+3]=(dk*255)|0; }
  lightCtx.putImageData(lightImg,0,0);
  const sm=ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled=true;
  ctx.drawImage(lightCv,0,0,COLS,ROWS,0,0,WORLD_W,WORLD_H);   // soft-scaled over the world
  // a warm bloom from the lantern (a little stronger in the sunless grove)
  const g=ctx.createRadialGradient(player.x,player.y,4,player.x,player.y,7*RES);
  g.addColorStop(0,T.borrowedSkin?'rgba(255,220,160,0.16)':'rgba(255,214,150,0.10)'); g.addColorStop(1,'rgba(255,214,150,0)');
  const go=ctx.globalCompositeOperation; ctx.globalCompositeOperation='lighter';
  ctx.fillStyle=g; ctx.fillRect(player.x-7*RES,player.y-7*RES,14*RES,14*RES);
  ctx.globalCompositeOperation=go;
  ctx.imageSmoothingEnabled=sm;
}
function drawTree(t){
  const px=wx(t.x), py=wy(t.y);
  const sway=Math.sin(t.wob+performance.now()/900)*1.5;
  ctx.fillStyle='rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(px,py+7,9,3.5,0,0,6.28); ctx.fill();
  ctx.fillStyle='#2a2018'; ctx.fillRect(px-2,py-4,4,11);
  const pal=palette();
  ctx.fillStyle=`rgb(${pal.grassDark.join(',')})`;
  ctx.beginPath(); ctx.arc(px+sway*0.5,py-10,10,0,6.28); ctx.fill();
  ctx.fillStyle=`rgb(${pal.grassBase.join(',')})`;
  ctx.beginPath(); ctx.arc(px-2+sway,py-12,7,0,6.28); ctx.fill();
}
let keeperSprite=null;
function ensureKeeperSprite(){
  if(keeperSprite && keeperSprite._seed===worldSeed) return keeperSprite;
  const {grass}=groveHues();
  const params={ ...CF.defaultParams(), ...CF.PRESETS.Villager, size:48,
    cloth:'robe', hairType:'long', hairHue:110, earType:'round',
    hue:Math.round(((grass+200)%360)), sat:20, lit:56, hue2:44,
    clothHue:Math.round(((grass+30)%360)), seed:worldSeed+'-keeper', walkFrames:6, outline:true };
  keeperSprite=CFHelp.bakeCreature(params, 46); keeperSprite._seed=worldSeed;
  return keeperSprite;
}
function drawNpc(n){
  const px=wx(n.x), py=wy(n.y)+Math.sin(n.bob)*1.5;
  ctx.fillStyle='rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(px,wy(n.y)+9,9,3.5,0,0,6.28); ctx.fill();
  const spr=ensureKeeperSprite();
  if(spr){ CFHelp.drawCreatureSprite(ctx, spr, px, wy(n.y)+Math.sin(n.bob)*1.5, 0, 'talk', n.bob*0.4); }
  else {
    ctx.fillStyle='#8a6f3f';
    ctx.beginPath(); ctx.moveTo(px-8,py+9); ctx.lineTo(px,py-8); ctx.lineTo(px+8,py+9); ctx.closePath(); ctx.fill();
  }
}
function enemySprite(e){
  if(!CREATURES) return null;
  const k = e.isBoss ? 'boss' : (e.big ? 'brute' : (e.wisp ? 'wisp' : 'slime'));
  return CREATURES[k];
}
function drawEnemy(e){
  const spr = enemySprite(e);
  const px=wx(e.x), py=wy(e.y)+Math.sin(e.wob)*2;
  ctx.fillStyle='rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(px,wy(e.y)+e.r*0.8,e.r*0.95,e.r*0.34,0,0,6.28); ctx.fill();
  if(!spr){
    ctx.save();
    let col = e.isBoss?'#a63a5f':(e.big?'#c04a7e':(e.wisp?'#5fb0d0':'#8f4ac0'));
    if(e.flash>0) col='#ffffff';
    ctx.fillStyle=col; ctx.beginPath(); ctx.arc(px,py,e.r,0,6.28); ctx.fill();
    ctx.restore();
  } else {
    const dir = (e.dir===undefined)?0:e.dir;
    const anim = e.anim || 'walk';
    CFHelp.drawCreatureSprite(ctx, spr, px, py, dir, anim, e.animClock||0);
    if(e.flash>0){
      const F=spr.FRAMES[anim]||spr.FRAMES.walk; const frames=F[dir]||F[0];
      const n=frames.length, fps=spr.fps[anim]||9, f=Math.floor((e.animClock||0)*fps)%n;
      const cv=frames[f];
      ctx.save(); ctx.globalAlpha=Math.min(1,e.flash*6); ctx.globalCompositeOperation='lighter';
      ctx.drawImage(cv, Math.round(px-cv.width/2), Math.round(py-cv.height*0.86));
      ctx.restore();
    }
  }
  if(e.isBoss){
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(px-30,py-e.r-30,60,7);
    ctx.fillStyle='#ff5d8f'; ctx.fillRect(px-30,py-e.r-30,60*Math.max(0,e.hp/e.maxHp),7);
  }
}
function drawDrop(d){
  const px=wx(d.x), py=wy(d.y)+Math.sin(d.t*4)*3;
  ctx.font='16px Courier New'; ctx.textAlign='center';
  const glyph={heart:'♥',gem:'◆',rage:'⚔',swift:'≫',wide:'◠'}[d.kind];
  const col={heart:'#ff8fa3',gem:'#7de3ff',rage:'#ffd166',swift:'#c9f27d',wide:'#e8b0ff'}[d.kind];
  ctx.shadowColor=col; ctx.shadowBlur=8;
  ctx.fillStyle=col; ctx.fillText(glyph,px,py+5);
  ctx.shadowBlur=0;
}
function drawBloom(b){
  if(b.got) return;
  const px=wx(b.x), py=wy(b.y);
  const pulse=1+Math.sin(b.t)*0.15;
  ctx.save(); ctx.translate(px,py); ctx.scale(pulse,pulse);
  ctx.shadowColor='#e8b0ff'; ctx.shadowBlur=14;
  ctx.fillStyle='#e8b0ff';
  for(let i=0;i<5;i++){
    const a=i/5*6.28+b.t*0.3;
    ctx.beginPath(); ctx.arc(Math.cos(a)*5,Math.sin(a)*5,3.4,0,6.28); ctx.fill();
  }
  ctx.fillStyle='#ffd166';
  ctx.beginPath(); ctx.arc(0,0,3,0,6.28); ctx.fill();
  ctx.restore();
}
function drawTreasure(tr){
  if(tr.got) return;
  const px=wx(tr.x), py=wy(tr.y);
  if(px<-30||px>W+30||py<-30||py>H+30) return;
  const bob=Math.sin(tr.t)*2;
  const col=tr.chrome?'#7de3ff':'#ffd166';
  ctx.save(); ctx.translate(px,py+bob);
  ctx.shadowColor=col; ctx.shadowBlur=12;
  if(tr.chrome){
    // a chrome augment cache: rotating cyber-diamond
    ctx.rotate(tr.t*0.6);
    ctx.fillStyle='#0a1520'; ctx.strokeStyle=col; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(5,0); ctx.lineTo(0,6); ctx.lineTo(-5,0); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur=0; ctx.fillStyle=col;
    ctx.beginPath(); ctx.arc(0,0,1.6,0,6.28); ctx.fill();
  }else{
    // a salvage crate
    ctx.fillStyle='#3a2c18'; ctx.fillRect(-5,-4,10,8);
    ctx.fillStyle='#5a4423'; ctx.fillRect(-5,-4,10,2);
    ctx.shadowBlur=0;
    ctx.fillStyle=col; ctx.fillRect(-1,-4,2,8); ctx.fillRect(-5,-1,10,2);
  }
  ctx.restore();
}
function drawPlayerChar(time){
  const blink=player.ifr>0&&Math.floor(time*14)%2===0;
  if(blink) return;
  const px=wx(player.x), py=wy(player.y);
  ctx.fillStyle='rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(px,py+8,9,3.2,0,0,6.28); ctx.fill();
  const spr = CREATURES && CREATURES.player;
  if(!spr){
    ctx.save(); ctx.translate(px,py); ctx.rotate(player.face);
    ctx.fillStyle=buffs.rage>0?'#ffdd88':'#7de3ff';
    ctx.beginPath(); ctx.arc(0,0,player.r,0,6.28); ctx.fill();
    ctx.restore(); return;
  }
  if(buffs.rage>0){ ctx.save(); ctx.shadowColor='#ffd166'; ctx.shadowBlur=16;
    ctx.fillStyle='rgba(255,209,102,0.001)'; ctx.beginPath(); ctx.arc(px,py-6,spr.box*0.3,0,6.28); ctx.fill(); ctx.restore(); }
  CFHelp.drawCreatureSprite(ctx, spr, px, py, player.dir||0, player.anim||'walk', (player.anim==='attack'?player.atkClock:player.animClock)||0);
}
function drawPortal(p,up){
  if(!p) return;
  const px=wx(p.x), py=wy(p.y);
  if(px<-60||px>W+60||py<-60||py>H+60) return;
  const col=up?'#7de3a0':'#b08fff';
  ctx.save(); ctx.translate(px,py);
  const pulse=1+Math.sin(p.t*2)*0.08;
  ctx.shadowColor=col; ctx.shadowBlur=20;
  for(let i=0;i<3;i++){
    const r=(14-i*3.5)*pulse;
    ctx.strokeStyle=up?`rgba(125,227,160,${0.9-i*0.22})`:`rgba(176,143,255,${0.9-i*0.22})`;
    ctx.lineWidth=2.5;
    ctx.beginPath();
    ctx.arc(0,0,r, p.t*(1.4+i*0.7), p.t*(1.4+i*0.7)+4.6);
    ctx.stroke();
  }
  ctx.shadowBlur=0;
  ctx.fillStyle=up?'rgba(215,255,230,0.9)':'rgba(230,215,255,0.9)';
  ctx.beginPath(); ctx.arc(0,0,3.5*pulse,0,6.28); ctx.fill();
  for(let i=0;i<4;i++){
    const a=p.t*0.8+i*1.57, r=18+Math.sin(p.t*3+i)*4;
    ctx.globalAlpha=0.5;
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.arc(Math.cos(a)*r,Math.sin(a)*r,1.6,0,6.28); ctx.fill();
  }
  ctx.globalAlpha=0.9;
  ctx.fillStyle=col; ctx.font='9px Courier New'; ctx.textAlign='center';
  ctx.fillText(up?'▲ SURFACE':'▼ DEEPER',0,26);
  ctx.restore(); ctx.globalAlpha=1;
}
function compassTarget(){
  if(!hasObjective()) return null;   // free-roam raid → no guide arrow, explore freely
  // the overworld objective, floor by floor: on the deepest floor point at the heart
  // (then the way up once it's put to rest); above it, point at the way down
  if(isFinalFloor()){
    if(boss) return {x:boss.x,y:boss.y,g:'☠'};
    if(cleansedRun&&portalUp) return {x:portalUp.x,y:portalUp.y,g:'▲'};
    return null;
  }
  if(portalDown) return {x:portalDown.x,y:portalDown.y,g:'▼'};
  return null;
}
function drawCompass(){
  const t=compassTarget();
  if(!t) return;
  const d=Math.hypot(t.x-player.x, t.y-player.y);
  if(d<130) return;
  let ax=t.x, ay=t.y;
  if(questPath && questPath.length>1){
    const wp=questPath[Math.min(6, questPath.length-1)];
    ax=(wp[1]+0.5)*RES; ay=(wp[0]+0.5)*RES;
    ctx.save();
    for(let i=2;i<Math.min(questPath.length,16);i+=2){
      const [cy,cx]=questPath[i];
      ctx.globalAlpha=0.35*(1-i/16);
      ctx.fillStyle='#ffd166';
      ctx.beginPath(); ctx.arc(wx((cx+0.5)*RES),wy((cy+0.5)*RES),2.5,0,6.28); ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha=1;
  }
  const a=Math.atan2(ay-player.y, ax-player.x);
  const px=wx(player.x)+Math.cos(a)*52, py=wy(player.y)+Math.sin(a)*52;
  ctx.save(); ctx.translate(px,py);
  ctx.globalAlpha=0.85;
  ctx.rotate(a);
  ctx.fillStyle='#ffd166';
  ctx.beginPath(); ctx.moveTo(9,0); ctx.lineTo(-4,-6); ctx.lineTo(-4,6); ctx.closePath(); ctx.fill();
  ctx.rotate(-a);
  ctx.font='12px Courier New'; ctx.textAlign='center';
  ctx.fillText(t.g,0,-10);
  ctx.restore();
  ctx.globalAlpha=1;
}
function drawStructureGroundDecor(s){
  const x=Math.floor(s.cx*RES-camX), footBottom=Math.floor((s.cy+s.h)*RES-camY);
  const wpx=s.w*RES;
  if(x>W+80||footBottom>H+80||x+wpx<-80||footBottom<-160) return;
  ctx.save();
  ctx.globalAlpha=0.15; ctx.fillStyle='#000';
  ctx.beginPath();
  ctx.ellipse(x+wpx/2+10, footBottom+6, wpx*0.55, 9+s.canvas.height*0.05, 0,0,6.28);
  ctx.fill();
  ctx.restore();
}
function drawStructure(s){
  const x=Math.floor(s.cx*RES-camX);
  const top=Math.floor(s.cy*RES-camY);
  const footBottom=Math.floor((s.cy+s.h)*RES-camY);
  if(x>W||top>H||x+s.canvas.width<0||top+s.canvas.height<0) return;
  ctx.fillStyle='rgba(0,0,0,0.26)';
  ctx.beginPath();
  ctx.ellipse(x+s.canvas.width/2, footBottom, s.canvas.width*0.5, 4, 0, 0, 6.28);
  ctx.fill();
  ctx.drawImage(s.canvas, x, top);
}
function drawFallingPlayer(time){
  const fa=player.falling; if(!fa) return;
  const e=Math.min(fa.t/fa.dur,1);
  const px=wx(player.x), py=wy(player.y);
  const hop=Math.sin(Math.min(1,e*1.3)*Math.PI)*-10;
  const sc=1+0.3*Math.min(1,e*1.5);
  const sx=wx(fa.x1), sy=wy(fa.y1);
  ctx.fillStyle='rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(sx, sy+6, 7*e+2, 3*e+1, 0,0,6.28); ctx.fill();
  ctx.strokeStyle='rgba(125,227,255,0.3)'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(px,py+hop); ctx.lineTo(px,py+hop-16); ctx.stroke();
  ctx.save();
  ctx.translate(px,py+hop);
  ctx.scale(1/Math.sqrt(sc), sc);
  const spr = CREATURES && CREATURES.player;
  if(spr){
    const F=spr.FRAMES.walk[0]; const cv=F[0];
    ctx.drawImage(cv, Math.round(-cv.width/2), Math.round(-cv.height*0.86));
  } else {
    ctx.fillStyle=buffs.rage>0?'#ffdd88':'#7de3ff';
    ctx.beginPath(); ctx.arc(0,0,player.r,0,6.28); ctx.fill();
  }
  ctx.restore();
}
function draw(time){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.fillStyle='#050a08'; ctx.fillRect(0,0,W,H);
  // world-space camera transform: pan + zoom (+ screen-space shake)
  const sx=shake>0.3?(Math.random()-0.5)*shake:0, sy=shake>0.3?(Math.random()-0.5)*shake:0;
  ctx.setTransform(camZ*DPR,0,0,camZ*DPR, DPR*(sx-camX*camZ), DPR*(sy-camY*camZ));
  ctx.imageSmoothingEnabled=false;
  drawTerrain();
  for(const s of structures) drawStructureGroundDecor(s);
  for(const s of slashes){
    const p=Math.min(s.t/SLASH_TIME,1);
    const fade=1-Math.min(s.t/(SLASH_TIME*1.8),1);
    const a0=s.ang-s.arc/2, a1=a0+s.arc*p;
    ctx.save(); ctx.translate(wx(player.x),wy(player.y));
    ctx.globalAlpha=fade;
    const grad=ctx.createRadialGradient(0,0,s.range*0.3,0,0,s.range);
    grad.addColorStop(0,'rgba(255,255,255,0)');
    grad.addColorStop(0.7,buffs.rage>0?'rgba(255,120,80,0.6)':'rgba(255,209,102,0.55)');
    grad.addColorStop(1,'rgba(255,120,80,0.9)');
    ctx.fillStyle=grad;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,s.range,a0,a1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,'+(0.9*fade)+')'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(0,0,s.range-4,a1-0.25,a1); ctx.stroke();
    ctx.restore();
  }
  drawPortal(portalUp,true);
  drawPortal(portalDown,false);
  for(const tr of treasures) drawTreasure(tr);
  for(const b of blooms) drawBloom(b);
  for(const d of drops) drawDrop(d);
  const sprites=[];
  for(const s of structures) sprites.push({y:(s.cy+s.h)*RES, f:()=>drawStructure(s)});
  for(const t of trees) if(Math.abs(t.x-player.x)<W && Math.abs(t.y-player.y)<H) sprites.push({y:t.y,f:()=>drawTree(t)});
  for(const n of npcs) sprites.push({y:n.y,f:()=>drawNpc(n)});
  for(const e of enemies) sprites.push({y:e.y,f:()=>drawEnemy(e)});
  if(!dead && !player.falling) sprites.push({y:player.y,f:()=>drawPlayerChar(time)});
  sprites.sort((a,b)=>a.y-b.y);
  for(const s of sprites) s.f();
  if(!dead && player.falling) drawFallingPlayer(time);
  for(const p of particles){
    ctx.globalAlpha=1-p.t/p.life;
    ctx.fillStyle=p.col;
    ctx.fillRect(wx(p.x)-p.r/2,wy(p.y)-p.r/2,p.r,p.r);
  }
  ctx.globalAlpha=1;
  drawLighting();                       // atmospheric per-tile darkness over the scene
  ctx.font='bold 16px Courier New'; ctx.textAlign='center';
  for(const f of floaters){
    ctx.globalAlpha=1-f.t/0.9; ctx.fillStyle=f.col;
    ctx.fillText(f.txt,wx(f.x),wy(f.y));
  }
  ctx.globalAlpha=1;
  drawCompass();
  ctx.setTransform(DPR,0,0,DPR,0,0);    // back to screen space for the UI
  if(stick){
    ctx.strokeStyle='rgba(232,240,227,0.25)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(stick.ox,stick.oy,STICK_RADIUS,0,6.28); ctx.stroke();
    const dx=stick.x-stick.ox, dy=stick.y-stick.oy, d=Math.hypot(dx,dy);
    const cl=Math.min(d,STICK_RADIUS), a=Math.atan2(dy,dx);
    ctx.fillStyle='rgba(125,227,255,0.4)';
    ctx.beginPath(); ctx.arc(stick.ox+Math.cos(a)*cl,stick.oy+Math.sin(a)*cl,20,0,6.28); ctx.fill();
  }
  if(dead){
    ctx.fillStyle='rgba(4,18,12,'+Math.min(deadT,0.7)+')'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#ff5d8f'; ctx.font='bold 32px Courier New'; ctx.textAlign='center';
    ctx.fillText('FELLED',W/2,H/2-10);
    ctx.fillStyle='#7a967a'; ctx.font='15px Courier New';
    ctx.fillText('the dark gathers you up…',W/2,H/2+22);
  }
}

/* ============================================================
   ENTER / EXIT / FRAME (driven by main.js)
   ============================================================ */
function syncFromHero(){
  player.maxHp=Hero.maxHp; player.hp=Math.max(1,Hero.hp);
  player.level=Hero.level; player.xp=Hero.xp; player.kills=Hero.kills;
  player.dmg=Hero.dmg; player.rangeMul=Hero.rangeMul; player.arcMul=Hero.arcMul; player.speedMul=Hero.speedMul;
}
function syncToHero(){
  Hero.maxHp=player.maxHp; Hero.hp=Math.max(1,player.hp);
  Hero.level=player.level; Hero.xp=player.xp; Hero.kills=player.kills;
  Hero.dmg=player.dmg; Hero.rangeMul=player.rangeMul; Hero.arcMul=player.arcMul; Hero.speedMul=player.speedMul;
}
function enter(info, onExit){
  dInfo=info; exitCb=onExit; active=true;
  floorIdx=0; lootBag={food:0,wood:0,stone:0}; totalKills=0; cleansedRun=false;
  augmentsGot=[]; treasures=[];
  stick=null; pending.clear(); mDown=null; touchPts.clear(); pinch=null;
  camZ=camZTarget=1.25;
  worldSeed=baseSeed()+'-f0';
  resizeCvs();
  syncFromHero();
  tilesetReady=true;
  startFloor();
  updateCamera(true);
  last=performance.now();
  $('dHint').style.opacity=1;
  setTimeout(()=>{ $('dHint').style.opacity=0; },8000);
}
function exitDungeon(){
  if(!active)return;
  active=false;
  syncToHero();
  gamePaused=false; dialogQueue=null;
  $('dDialog').style.display='none';
  $('dTalkBtn').style.display='none';
  const results={dungeon:dInfo?dInfo.ref:null, loot:lootBag, kills:totalKills, cleansed:cleansedRun, floors:floorIdx+1, augments:augmentsGot.slice()};
  const cb=exitCb; exitCb=null;
  if(cb)cb(results);
}
let last=performance.now();
function frame(now){
  if(!active)return;
  let dt=Math.min((now-last)/1000,0.05); last=now;
  promotePending();
  if(hitstop>0){ hitstop-=dt; dt*=0.12; }
  if(!gamePaused) update(dt);
  if(active) draw(now/1000);
}
return {
  enter, frame, exit:exitDungeon,
  get active(){return active},
  // small debug/cheat surface — used by smoke tests and the curious
  debug:{
    get state(){return {floorIdx,cleansedRun,objective:objTitle(),final:isFinalFloor(),hasDown:!!portalDown,hasBoss:!!boss,keeper:false}},
    get skin(){return {borrowed:!!T.borrowedSkin, grass:T.grassColor, dirt:T.dirtColor}},
    get zoom(){return camZ}, set zoom(z){camZTarget=dclamp(z,ZMIN,ZMAX)},
    completeTask(){   // clear the objective: slay the heart on the deepest floor, else cleanse
      if(boss){boss.hp=0;boss.dead=true;onKill(boss);}
      else if(isFinalFloor()){cleansedRun=true;}
      else if(portalDown){descendFloor();}
      SFX.quest();updHud();
    },
    advance(){advanceDialog()},
    goDown(){if(portalDown)descendFloor()},
  },
};
})();
