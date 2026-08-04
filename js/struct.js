'use strict';
/* ============================================================
   SEED & SAGE — struct.js
   StructForge: a procedural baker for STRUCTURAL tiles — the built
   stuff a space is made of: brick, cut stone, plank, eroded concrete,
   tile, metal plate, marble, adobe, bone, crystal…

   Each material is a pure texel algorithm (mortar courses, plank
   grain + knots, fBm veining, ordered dithering, erosion/spall) so a
   tile is generated, never drawn by hand. Tilesets are baked against
   TileGen's edgeMask so structural tiles corner-smooth into the
   natural ground exactly like the overworld's rock does.
   ============================================================ */
const StructForge = (function(){
  const T=TileGen;
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  const mix=T.mix, vnoise=T.vnoise, ihash=T.ihash;

  function hsl(h,s,l){
    h=((h%360)+360)%360/360; s=clamp(s,0,1); l=clamp(l,0,1);
    if(s===0){const v=Math.round(l*255);return [v,v,v];}
    const q=l<.5?l*(1+s):l+s-l*s, p=2*l-q;
    const f=t=>{t=(t+1)%1;return t<1/6?p+(q-p)*6*t:t<.5?q:t<2/3?p+(q-p)*(2/3-t)*6:p;};
    return [Math.round(f(h+1/3)*255),Math.round(f(h)*255),Math.round(f(h-1/3)*255)];
  }
  // fBm — stacked value noise, for veins / erosion / blotching
  function fbm(x,y,seed,oct){ let a=.5,f=1,s=0,n=0; oct=oct||3;
    for(let i=0;i<oct;i++){ s+=a*vnoise(x*f,y*f,seed+i*131); n+=a; a*=.5; f*=2; }
    return s/n; }
  // ordered 4x4 Bayer dither — crisp pixel shading without banding
  const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
  const bayer=(x,y)=>BAYER[((y&3)<<2)|(x&3)]/16;

  /* ---------- the material catalogue ----------
     hue/sat/lit give each preset its default tone; callers may tint. */
  const MATS={
    brick:    {n:'Brick',        hue: 14, sat:.42, lit:.42, solidLit:.38},
    cutstone: {n:'Cut stone',    hue: 40, sat:.10, lit:.52, solidLit:.46},
    roughstone:{n:'Rough stone', hue: 30, sat:.09, lit:.44, solidLit:.40},
    plank:    {n:'Wood plank',   hue: 28, sat:.38, lit:.44, solidLit:.40},
    timber:   {n:'Timber frame', hue: 24, sat:.34, lit:.36, solidLit:.33},
    concrete: {n:'Eroded concrete',hue:210,sat:.05, lit:.50, solidLit:.45},
    tile:     {n:'Ceramic tile', hue:186, sat:.30, lit:.55, solidLit:.48},
    metal:    {n:'Metal plate',  hue:205, sat:.12, lit:.48, solidLit:.44},
    marble:   {n:'Marble',       hue: 45, sat:.08, lit:.68, solidLit:.60},
    adobe:    {n:'Adobe',        hue: 26, sat:.36, lit:.58, solidLit:.52},
    bone:     {n:'Bone',         hue: 44, sat:.18, lit:.72, solidLit:.64},
    crystal:  {n:'Crystal',      hue:280, sat:.42, lit:.52, solidLit:.46},
    rustplate:{n:'Rusted plate', hue: 20, sat:.44, lit:.40, solidLit:.36},
    thatch:   {n:'Thatch',       hue: 46, sat:.44, lit:.50, solidLit:.44},
  };
  const PRESETS=Object.keys(MATS);

  function palette(name, opts){
    const M=MATS[name]||MATS.cutstone; opts=opts||{};
    const hue=(opts.hue!==undefined?opts.hue:M.hue), sat=(opts.sat!==undefined?opts.sat:M.sat);
    const lit=(opts.lit!==undefined?opts.lit:M.lit);
    return {
      name, hue, sat, lit,
      base:  hsl(hue, sat,        lit),
      light: hsl(hue, sat*0.85,   clamp(lit+0.13,0,.95)),
      dark:  hsl(hue, sat*1.05,   clamp(lit-0.13,0.03,1)),
      deep:  hsl(hue, sat*1.1,    clamp(lit-0.26,0.02,1)),
      grout: hsl(hue, sat*0.7,    clamp(lit-0.32,0.02,1)),
      accent:hsl((hue+180)%360, Math.min(.7,sat+.2), clamp(lit+0.18,0,.95)),
    };
  }

  /* ---------- texel algorithms ----------
     (x,y) are pixel coords inside the tile grid (continuous across the
     map, so patterns run unbroken from tile to tile). */
  function texel(name, x, y, seed, P, wall){
    const p=P||palette(name);
    const n=vnoise(x*0.9+seed*0.013, y*0.9+seed*0.017, seed);
    switch(name){
      case 'brick': {
        const bh=4, bw=8, row=Math.floor(y/bh), off=(row&1)*(bw>>1);
        const bx=(((x+off)%bw)+bw)%bw, by=((y%bh)+bh)%bh;
        if(by===0||bx===0) return p.grout;                       // mortar course
        const id=ihash(Math.floor((x+off)/bw), row, seed);        // per-brick tone
        let c=mix(p.base, id<.5?p.dark:p.light, Math.abs(id-.5)*0.7);
        if(by===1||bx===1) c=mix(c,p.light,0.22);                 // lit top-left bevel
        if(bayer(x,y)<n*0.22) c=mix(c,p.deep,0.3);                // dithered grit
        return c;
      }
      case 'cutstone': {
        const bs=8, gx=((x%bs)+bs)%bs, gy=((y%bs)+bs)%bs;
        if(gx===0||gy===0) return p.grout;
        const id=ihash(Math.floor(x/bs),Math.floor(y/bs),seed);
        let c=mix(p.base, id<.5?p.dark:p.light, Math.abs(id-.5)*0.5);
        if(gx===1||gy===1) c=mix(c,p.light,0.26);
        if(gx===bs-1||gy===bs-1) c=mix(c,p.deep,0.20);
        return n>0.88?mix(c,p.light,0.2):c;
      }
      case 'roughstone': {
        const b=fbm(x*0.16,y*0.16,seed,3);
        let c = b<0.36?p.dark : b>0.66?p.light : p.base;
        const seam=fbm(x*0.09+3,y*0.09,seed^0x55,2);
        if(Math.abs(seam-0.5)<0.045) c=p.grout;                    // irregular joints
        if(bayer(x,y)<0.18 && n<0.4) c=mix(c,p.deep,0.35);
        return c;
      }
      case 'plank': {
        const pw=6, py=((y%pw)+pw)%pw, row=Math.floor(y/pw);
        if(py===0) return p.grout;                                 // plank gap
        const grain=vnoise(x*0.5, y*3.2+row*17+seed*0.02, seed);    // long grain
        let c = grain<0.36?p.dark : grain>0.70?p.light : p.base;
        const kx=((x+row*13)%37);                                  // knots
        if(kx<3 && py>1 && py<pw-1){ const kd=Math.hypot(kx-1.2,py-pw/2);
          if(kd<1.7) c=mix(p.deep,p.dark,kd/1.7); }
        if(py===1) c=mix(c,p.light,0.18);
        return c;
      }
      case 'timber': {
        const cell=12, gx=((x%cell)+cell)%cell, gy=((y%cell)+cell)%cell;
        const beam=(gx<3||gy<3);
        if(beam){ const grain=vnoise(x*0.4,y*2.4,seed);
          let c=grain<0.4?p.deep:grain>0.7?p.dark:mix(p.dark,p.base,.5);
          if(gx===0||gy===0) c=mix(c,p.deep,0.4);
          return c; }
        const w=fbm(x*0.2,y*0.2,seed^0x9,2);                       // wattle infill
        return w<0.42?mix(p.base,p.dark,.5):w>0.66?p.light:p.base;
      }
      case 'concrete': {
        const b=fbm(x*0.12,y*0.12,seed,4);
        let c = b<0.44?mix(p.base,p.dark,.55) : b>0.62?p.light : p.base;
        if(bayer(x,y) < 0.30+b*0.2) c=mix(c,p.dark,0.16);          // dither grain
        const crack=fbm(x*0.07+11,y*0.07,seed^0xC2,3);
        if(Math.abs(crack-0.5)<0.028) c=mix(p.deep,c,0.25);        // hairline cracks
        const spall=vnoise(x*0.22,y*0.22,seed^0x5A);               // eroded pits
        if(spall<0.10) c=mix(p.deep,p.dark,0.5);
        const pour=Math.floor(y/16); if(((y%16)+16)%16===0) c=mix(c,p.grout,0.5);
        return c;
      }
      case 'tile': {
        const ts=4, gx=((x%ts)+ts)%ts, gy=((y%ts)+ts)%ts;
        if(gx===0||gy===0) return p.grout;
        const id=ihash(Math.floor(x/ts),Math.floor(y/ts),seed);
        const alt=((Math.floor(x/ts)+Math.floor(y/ts))&1);
        let c = alt?mix(p.base,p.light,.35):p.base;
        if(id<0.14) c=mix(c,p.accent,0.35);                        // the odd feature tile
        if(gx===1&&gy===1) c=mix(c,p.light,0.4);                   // glaze glint
        return c;
      }
      case 'metal': {
        const cell=10, gx=((x%cell)+cell)%cell, gy=((y%cell)+cell)%cell;
        if(gx===0||gy===0) return p.deep;                          // panel seams
        let c=p.base;
        const brush=vnoise(x*0.25,y*1.9,seed);                     // brushed grain
        c = brush<0.42?mix(p.base,p.dark,.5) : brush>0.68?p.light : p.base;
        if((gx===2||gx===cell-2)&&(gy===2||gy===cell-2)) c=p.light; // rivets
        if(bayer(x,y)<0.12) c=mix(c,p.light,0.25);
        return c;
      }
      case 'marble': {
        const t=fbm(x*0.06,y*0.06,seed,4);
        const vein=Math.abs(fbm(x*0.05+t*1.4, y*0.05, seed^0x1B, 3)-0.5);
        let c = t>0.56?p.light:p.base;
        if(vein<0.035) c=mix(p.dark,c,0.25);                       // dark veining
        else if(vein<0.06) c=mix(p.dark,c,0.7);
        if(bayer(x,y)<0.06) c=mix(c,p.light,0.3);
        return c;
      }
      case 'adobe': {
        const b=fbm(x*0.14,y*0.14,seed,3);
        let c = b<0.42?mix(p.base,p.dark,.45) : b>0.66?p.light : p.base;
        const straw=ihash(x*3,y*7,seed^0x57);                      // straw flecks
        if(straw<0.03) c=mix(p.light,p.accent,0.25);
        if(bayer(x,y)<0.2 && b<0.5) c=mix(c,p.dark,0.2);
        const course=((y%14)+14)%14; if(course===0) c=mix(c,p.grout,0.4);
        return c;
      }
      case 'bone': {
        const b=fbm(x*0.13,y*0.13,seed,3);
        let c = b<0.40?mix(p.base,p.dark,.4) : b>0.68?p.light : p.base;
        const pit=vnoise(x*0.4,y*0.4,seed^0xB0);                   // porous pitting
        if(pit<0.13) c=mix(c,p.deep,0.45);
        const grain=Math.sin((x*0.7+y*0.3)+fbm(x*.1,y*.1,seed,2)*4);
        if(grain>0.95) c=mix(c,p.light,0.35);
        return c;
      }
      case 'crystal': {
        const fx=Math.floor(x/7), fy=Math.floor(y/7);              // faceted cells
        const id=ihash(fx,fy,seed);
        const gx=((x%7)+7)%7, gy=((y%7)+7)%7;
        let c = id<.33?p.dark : id<.66?p.base : p.light;
        if(gx===0||gy===0||gx+gy===6) c=mix(p.light,p.accent,0.4); // bright facet edges
        const glow=vnoise(x*0.2,y*0.2,seed^0xC5);
        if(glow>0.86) c=mix(c,p.accent,0.4);
        return c;
      }
      case 'rustplate': {
        const cell=11, gx=((x%cell)+cell)%cell, gy=((y%cell)+cell)%cell;
        if(gx===0||gy===0) return p.deep;
        const rust=fbm(x*0.17,y*0.17,seed^0x2E,3);
        let c = rust>0.60?mix(p.base,p.accent,0.15) : rust<0.38?p.dark : p.base;
        if(rust>0.74) c=mix(c,p.light,0.3);                        // bloomed rust
        if(bayer(x,y)<rust*0.3) c=mix(c,p.deep,0.28);
        if((gx===2||gx===cell-2)&&(gy===2||gy===cell-2)) c=mix(p.light,c,0.4);
        return c;
      }
      case 'thatch': {
        const row=Math.floor(y/3);
        const s=vnoise(x*0.7+row*23, y*0.35, seed);                // straw bundles
        let c = s<0.36?p.dark : s>0.68?p.light : p.base;
        if(((y%3)+3)%3===0) c=mix(c,p.deep,0.35);                  // bundle shadow line
        if(ihash(x,y,seed^0x7A)<0.05) c=mix(c,p.light,0.4);
        return c;
      }
    }
    return p.base;
  }

  /* ---------- bake one 16-corner tileset ----------
     mode 'floor' fills the whole tile; mode 'wall' paints only where the
     corner mask is set (an overlay, exactly like TileGen.paintCliff), so
     structural walls corner-smooth into whatever floor lies beneath. */
  function paint(res, mask, seed, name, pal, mode, style){
    const cv=document.createElement('canvas'); cv.width=res; cv.height=res;
    const c=cv.getContext('2d'); const img=c.createImageData(res,res);
    const wall=(mode==='wall');
    const ox=(seed%97)*res, oy=((seed/97)|0)%89*res;   // keep patterns varied per variant
    for(let y=0;y<res;y++)for(let x=0;x<res;x++){
      const i=y*res+x;
      if(wall && !mask[i]) continue;                    // transparent outside the mask
      const col=texel(name, x+ox, y+oy, seed, pal, wall);
      let c2=col;
      if(wall){
        // lip the top edge so a wall reads as raised above the floor
        if(y<2 || (y>0&&!mask[i-res])) c2=mix(col,pal.light,0.34);
        if(y>res-3 || (y<res-1&&!mask[i+res])) c2=mix(col,pal.deep,0.30);
      }
      const p=i*4; img.data[p]=c2[0]; img.data[p+1]=c2[1]; img.data[p+2]=c2[2]; img.data[p+3]=255;
    }
    c.putImageData(img,0,0); return cv;
  }

  function makeTileset(opts){
    const res=opts.res||24, variants=opts.variants||3;
    const name=opts.name||'cutstone';
    const seed=(opts.seed>>>0)||4242;
    const style=opts.style||{edge:opts.edge||'beveled',roundRadius:opts.roundRadius||2,grainSeed:seed};
    const pal=opts.pal||palette(name,opts);
    // walls are cut from a DARKER, cooler palette than the floor of the same
    // material, so a brick wall reads clearly against a brick floor
    const wpal=palette(name,{hue:pal.hue-6,sat:Math.min(1,pal.sat*1.12),
      lit:Math.max(0.06,pal.lit-(opts.wallDrop!==undefined?opts.wallDrop:0.17))});
    const floor=[], wall=[], coll=new Array(16);
    for(let i=0;i<16;i++){
      const mask=T.edgeMask(res, T.cornersFromIndex(i), style);
      // when the index describes OPEN corners, the wall is the complement —
      // so wall tiles are carved inward and never spill onto open floor
      let wmask=mask;
      if(opts.invertWall){ wmask=new Uint8Array(res*res);
        for(let k=0;k<wmask.length;k++) wmask[k]=mask[k]?0:1; }
      coll[i]=wmask; floor[i]=[]; wall[i]=[];
      const base=seed+i*7919;
      for(let v=0;v<variants;v++){
        floor[i].push(paint(res, mask, base+v*104729, name, pal, 'floor', style));
        wall[i].push(paint(res, wmask, base+v*104729+555, name, wpal, 'wall', style));
      }
    }
    return {res, variants, name, pal, wpal, style, floor, wall, coll};
  }

  // a flat swatch (no corner mask) — handy for editor previews & UI chips
  function swatch(name, size, seed, opts){
    size=size||48; seed=(seed>>>0)||7;
    const pal=palette(name,opts||{});
    const cv=document.createElement('canvas'); cv.width=size; cv.height=size;
    const c=cv.getContext('2d'); const img=c.createImageData(size,size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const col=texel(name,x,y,seed,pal,false), p=(y*size+x)*4;
      img.data[p]=col[0];img.data[p+1]=col[1];img.data[p+2]=col[2];img.data[p+3]=255;
    }
    c.putImageData(img,0,0); return cv;
  }

  return { PRESETS, MATS, palette, texel, paint, makeTileset, swatch, fbm, bayer };
})();
if(typeof window!=='undefined')window.StructForge=StructForge;
