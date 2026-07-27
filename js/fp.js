'use strict';
/* ============================================================
   SEED & SAGE — fp.js
   FPView: a reusable first-person renderer, adapted from the
   UNDERKEEP raycaster. A single DDA column caster drives every
   environment (dungeon, building interior, overworld) through a
   thin per-environment ADAPTER. Indoor adapters cast a ceiling;
   the outdoor adapter sets {outdoor:true} and gets a sky gradient.

   An adapter is a plain object exposing:
     MW, MH            grid size in tiles
     outdoor           bool — sky instead of ceiling
     atlas             {pix:Uint8ClampedArray, TS, NTEX}
     solid(cx,cy)      -> truthy if the cell is a wall
     wallTex(cx,cy,s)  -> atlas tile index for a wall column (s=side)
     floorTex(cx,cy)   -> atlas tile index for the floor
     ceilTex(cx,cy)    -> atlas tile index for the ceiling (indoor)
     glowAt(cx,cy)     -> {amt, col:[r,g,b]} | null  (emissive floor)
     sky(t)            -> [r,g,b] for a sky row, t in 0..1 (outdoor)
     fog               -> {dist, col:[r,g,b]} | null
     light(d)          -> brightness multiplier at distance d
     cam()             -> {x, y, yaw, pitch}  (x,y in TILE units)
     fov               -> half-plane scale (default 0.72)
     sprites()         -> [{x, y, cv, w, h, sx?, sw?, tint?}] world tiles
   ============================================================ */
const FPView = (function(){
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  const hexv=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
  const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

  /* ---- shared texture atlas baker ----
     specs: [{base,dark,light,vein?,brick?,pattern?,accent?}]
     returns {pix, TS, NTEX} — a (TS*NTEX) x TS RGBA image, tiles laid left→right */
  function bakeAtlas(specs, seed){
    const TS=32, NTEX=specs.length;
    const c=document.createElement('canvas'); c.width=TS*NTEX; c.height=TS;
    const g=c.getContext('2d'); const img=g.createImageData(TS*NTEX,TS); const d=img.data;
    const R=mulberry32(seed||99);
    const put=(i,x,y,col)=>{const o=((y*TS*NTEX)+(i*TS+x))*4;d[o]=col[0];d[o+1]=col[1];d[o+2]=col[2];d[o+3]=255;};
    specs.forEach((s,i)=>{
      const b=hexv(s.base), dk=hexv(s.dark), lt=hexv(s.light), vn=s.vein?hexv(s.vein):null,
            ac=s.accent?hexv(s.accent):null;
      for(let y=0;y<TS;y++)for(let x=0;x<TS;x++){
        let n=R()*0.35+(Math.sin(x*0.9+y*0.4)*0.5+0.5)*0.25;
        let col=mix(dk,lt,clamp(n+0.25,0,1));
        const pat=s.pattern||(s.brick?'brick':'rubble');
        if(pat==='brick'){
          const row=Math.floor(y/8), off=(row%2)*8, bx=(x+off)%16, by=y%8;
          if(by===0||bx===0) col=mix(col,dk,0.75);
          if(by===1||bx===1) col=mix(col,lt,0.35);
        }else if(pat==='rubble'){
          const bx=Math.floor(x/6), by=Math.floor(y/6);
          const q=mulberry32(bx*73+by*131+i*17)();
          col=mix(col,b,0.5+q*0.4);
          if(x%6===0||y%6===0) col=mix(col,dk,0.5);
        }else if(pat==='floor'){
          col=mix(mix(dk,lt,R()*0.55+0.2),b,0.45);
        }else if(pat==='grid'){
          col=mix(mix(dk,lt,R()*0.5+0.4),b,0.4);
          if(ac&&(x%8===0||y%8===0)) col=mix(col,ac,0.28);
        }else if(pat==='grass'){
          col=mix(mix(dk,lt,R()*0.5+0.3),b,0.5);
          if((x*7+y*3)%13<2 && ac) col=mix(col,ac,0.35);
        }else if(pat==='flat'){
          col=mix(b, R()<0.5?dk:lt, R()*0.18);
        }
        if(vn){
          const v=Math.sin((x*0.55+y*0.31)+Math.cos(y*0.21)*2.2);
          if(v>0.93) col=mix(col,vn,0.85); else if(v>0.86) col=mix(col,vn,0.35);
        }
        put(i,x,y,col);
      }
    });
    g.putImageData(img,0,0);
    return {pix:img.data, TS, NTEX, canvas:c};
  }

  /* ---- renderer state ---- */
  let cv=null, cx2=null, FPW=256, FPH=160, fpImg=null, fpBuf=null, zbuf=null;
  let mounted=false;

  function mount(canvasEl){
    cv=canvasEl; cx2=cv.getContext('2d'); cx2.imageSmoothingEnabled=false; mounted=true;
  }
  function resize(w,h){
    if(!mounted)return;
    FPH=Math.min(200,Math.max(120,Math.round(h/3)));
    FPW=Math.min(440,Math.round(FPH*(w/h)));
    cv.width=FPW; cv.height=FPH;
    fpImg=cx2.createImageData(FPW,FPH); fpBuf=fpImg.data;
    zbuf=new Float32Array(FPW);
    cx2.imageSmoothingEnabled=false;
  }

  const defLight=d=>0.05+1.25/(1+0.13*d*d);

  function render(A){
    if(!mounted||!fpBuf||!A)return;
    const cam=A.cam(); const px=cam.x, py=cam.y;
    const dirX=Math.cos(cam.yaw), dirY=Math.sin(cam.yaw);
    const fov=A.fov||0.72;
    const planeX=-dirY*fov, planeY=dirX*fov;
    const horizon=(FPH*0.5+(cam.pitch||0))|0;
    const posZ=0.5*FPH;
    const d=fpBuf;
    const AT=A.atlas, TS=AT.TS, AW=TS*AT.NTEX, PIX=AT.pix;
    const MW=A.MW, MH=A.MH;
    const light=A.light||defLight;
    const outdoor=!!A.outdoor;
    const fog=A.fog||null;
    const applyFog=(r,g,b,dist)=>{
      if(!fog)return [r,g,b];
      let f=clamp((dist-(fog.near||0))/(fog.dist||20),0,1); f*=f;
      return [r+(fog.col[0]-r)*f, g+(fog.col[1]-g)*f, b+(fog.col[2]-b)*f];
    };

    for(let x=0;x<FPW;x++){
      const camX=2*x/FPW-1;
      const rdx=dirX+planeX*camX, rdy=dirY+planeY*camX;
      let mapX=px|0, mapY=py|0;
      const ddx=rdx===0?1e30:Math.abs(1/rdx), ddy=rdy===0?1e30:Math.abs(1/rdy);
      let stepX,stepY,sdx,sdy;
      if(rdx<0){stepX=-1;sdx=(px-mapX)*ddx;}else{stepX=1;sdx=(mapX+1-px)*ddx;}
      if(rdy<0){stepY=-1;sdy=(py-mapY)*ddy;}else{stepY=1;sdy=(mapY+1-py)*ddy;}
      let side=0,hit=0,guard=0,cxi=mapX,cyi=mapY;
      const maxGuard=outdoor?(A.drawDist||64):170;
      while(!hit&&guard++<maxGuard){
        if(sdx<sdy){sdx+=ddx;mapX+=stepX;side=0;}else{sdy+=ddy;mapY+=stepY;side=1;}
        if(mapX<0||mapY<0||mapX>=MW||mapY>=MH){hit=2;break;}
        if(A.solid(mapX,mapY)){hit=1;cxi=mapX;cyi=mapY;break;}
      }
      let dist=side===0?(sdx-ddx):(sdy-ddy);
      if(dist<0.02)dist=0.02;
      zbuf[x]=dist;
      let lh=(FPH/dist)|0;
      let y0=horizon-(lh>>1), y1=horizon+(lh>>1);
      if(hit!==1){y0=y1=horizon;}
      const dy0=clamp(y0,0,FPH), dy1=clamp(y1,0,FPH);

      // ---- wall column ----
      if(hit===1){
        const tex=A.wallTex(cxi,cyi,side);
        let wallX=side===0?py+dist*rdy:px+dist*rdx; wallX-=Math.floor(wallX);
        let tx=(wallX*TS)|0;
        if((side===0&&rdx>0)||(side===1&&rdy<0))tx=TS-tx-1;
        let lit=light(dist)*(side===1?0.74:1);
        const stepT=TS/lh, base=tex*TS+tx;
        let texPos=(dy0-horizon+(lh>>1))*stepT;
        for(let y=dy0;y<dy1;y++){
          let ty=texPos|0; if(ty<0)ty=0; else if(ty>=TS)ty=TS-1; texPos+=stepT;
          const s=(ty*AW+base)*4, o=(y*FPW+x)*4;
          let r=PIX[s]*lit, gg=PIX[s+1]*lit, b=PIX[s+2]*lit;
          if(fog){const c2=applyFog(r,gg,b,dist);r=c2[0];gg=c2[1];b=c2[2];}
          d[o]=r>255?255:r; d[o+1]=gg>255?255:gg; d[o+2]=b>255?255:b; d[o+3]=255;
        }
      }

      // ---- floor (below the wall) ----
      for(let y=Math.max(dy1,horizon+1);y<FPH;y++){
        const p=y-horizon, rowD=posZ/p;
        const fxw=px+rowD*rdx, fyw=py+rowD*rdy;
        const fcx=fxw|0, fcy=fyw|0;
        let ftex=A.floorFallback||0, glow=null;
        if(fcx>=0&&fcy>=0&&fcx<MW&&fcy<MH){
          ftex=A.floorTex(fcx,fcy);
          if(A.glowAt)glow=A.glowAt(fcx,fcy);
        }
        const tx=((fxw-fcx)*TS)|0, ty=((fyw-fcy)*TS)|0;
        const s=(ty*AW+ftex*TS+tx)*4, o=(y*FPW+x)*4;
        const lit=light(rowD);
        let r=PIX[s]*lit, gg=PIX[s+1]*lit, b=PIX[s+2]*lit;
        if(glow&&glow.amt){const em=glow.amt*70;r+=em*glow.col[0];gg+=em*glow.col[1];b+=em*glow.col[2];}
        if(fog){const c2=applyFog(r,gg,b,rowD);r=c2[0];gg=c2[1];b=c2[2];}
        d[o]=r>255?255:r; d[o+1]=gg>255?255:gg; d[o+2]=b>255?255:b; d[o+3]=255;
      }

      // ---- ceiling / sky (above the wall) ----
      const topEnd=Math.min(dy0,horizon)-1;
      if(outdoor){
        for(let y=topEnd;y>=0;y--){
          const t=y/Math.max(1,horizon);
          const sc=A.sky?A.sky(clamp(t,0,1)):[20,24,40];
          const o=(y*FPW+x)*4;
          d[o]=sc[0]; d[o+1]=sc[1]; d[o+2]=sc[2]; d[o+3]=255;
        }
      }else{
        for(let y=topEnd;y>=0;y--){
          const p=horizon-y, rowD=posZ/p;
          const fxw=px+rowD*rdx, fyw=py+rowD*rdy;
          const fcx=fxw|0, fcy=fyw|0;
          let ctex=A.ceilTex?(fcx>=0&&fcy>=0&&fcx<MW&&fcy<MH?A.ceilTex(fcx,fcy):A.ceilFallback||0):A.ceilFallback||0;
          const tx=((fxw-fcx)*TS)|0, ty=((fyw-fcy)*TS)|0;
          const s=(ty*AW+ctex*TS+tx)*4, o=(y*FPW+x)*4;
          const lit=light(rowD)*0.55;
          d[o]=PIX[s]*lit; d[o+1]=PIX[s+1]*lit; d[o+2]=PIX[s+2]*lit; d[o+3]=255;
        }
      }
    }

    cx2.putImageData(fpImg,0,0);

    // ---- billboards: per-column drawImage slices, z-tested ----
    const invDet=1/(planeX*dirY-dirX*planeY);
    const list=A.sprites?A.sprites():[];
    const bill=[];
    for(const b of list){
      const sx=b.x-px, sy=b.y-py; const dd=sx*sx+sy*sy;
      const tY=invDet*(-planeY*sx+planeX*sy);
      if(tY<0.2)continue;
      const tX=invDet*(dirY*sx-dirX*sy);
      bill.push({b,tX,tY,dd});
    }
    bill.sort((p,q)=>q.tY-p.tY);
    for(const it of bill){
      const b=it.b, tX=it.tX, tY=it.tY;
      const scr=((FPW/2)*(1+tX/tY))|0;
      const scale=(b.scale||1);
      const hpx=Math.abs((FPH/tY)*0.95*scale);
      const wpx=hpx*(b.w/b.h);
      const feet=horizon+(0.5*FPH)/tY + (b.yOff||0)*(FPH/tY);
      const top=feet-hpx;
      const x0=Math.max(0,Math.floor(scr-wpx/2)), x1=Math.min(FPW-1,Math.ceil(scr+wpx/2));
      const srcW=b.sw||b.cv.width, srcX0=b.sx||0, srcH=b.cv.height;
      const lit=light(tY);
      for(let x=x0;x<=x1;x++){
        if(tY>=zbuf[x])continue;
        const u=((x-(scr-wpx/2))/wpx*srcW)|0;
        if(u<0||u>=srcW)continue;
        cx2.drawImage(b.cv, srcX0+u, 0, 1, srcH, x, top, 1, hpx);
        // distance / backlight dimming to match wall falloff
        const dim=1-clamp(lit,0,1);
        if(dim>0.02){ cx2.globalAlpha=dim*0.85; cx2.fillStyle=b.tint||'#05040a';
          cx2.fillRect(x,top,1,hpx); cx2.globalAlpha=1; }
      }
    }

    if(A.overlay)A.overlay(cx2,FPW,FPH,cam);
  }

  return { mount, resize, render, bakeAtlas,
           get W(){return FPW}, get H(){return FPH}, get canvas(){return cv} };
})();
if(typeof window!=='undefined')window.FPView=FPView;
