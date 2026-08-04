'use strict';
/* ============================================================
   SEED & SAGE — interior.js
   The UNIFIED INTERIOR ENGINE. One tile engine powers every
   enclosed space: building interiors AND the Understory dungeons.

   It is modelled on the overworld map:
     · a tile grid with a per-cell material,
     · corner-smoothed autotiling (TileGen.edgeMask over a vertex
       grid) so structural tiles blend into natural ground exactly
       like the overworld's rock does,
     · structural tiles baked by StructForge, natural ground baked
       by TileGen.

   Two generators share it:
     'rooms' — carve rooms out of a solid canvas, join with halls
     'cave'  — cellular-automata cavern, with some structural rooms

   Collision samples the SAME per-pixel corner masks that are drawn,
   so what blocks you is exactly what you can see.
   ============================================================ */
const Interior = (function(){
  const T=TileGen, S=StructForge;

  const DEF={
    mode:'rooms', W:48, H:36, res:16, seed:1,
    roomCount:7, roomMin:5, roomMax:12, hallWidth:2, loops:2,
    caveFill:0.50, caveSteps:5, structMix:0.35,
    mat:'cutstone', mat2:'plank', natural:false,
    floorMat:null, floorMat2:null,      // floors may be a different stuff than walls
    grassHex:'#4a7a3a', dirtHex:'#6a563a',
    edge:'beveled', roundRadius:2, border:1,
  };
  const NATURAL=0;   // material 0 is always the natural ground

  function cfg(o){ return Object.assign({},DEF,o||{}); }

  /* ================= generation ================= */
  function carveRect(g,W,H,x0,y0,w,h,val){
    for(let y=Math.max(0,y0);y<Math.min(H,y0+h);y++)
      for(let x=Math.max(0,x0);x<Math.min(W,x0+w);x++) g[y*W+x]=val;
  }
  // an L-shaped hall of the given width, from a to b
  function carveHall(g,W,H,ax,ay,bx,by,wd,mark){
    const half=Math.max(0,(wd-1)>>1), ext=wd-1-half;
    const hx=(x0,x1,y)=>{ for(let x=Math.min(x0,x1);x<=Math.max(x0,x1);x++)
      for(let d=-half;d<=ext;d++){ const yy=y+d; if(x>=0&&x<W&&yy>=0&&yy<H){ g[yy*W+x]=0; if(mark)mark(x,yy); } } };
    const vy=(y0,y1,x)=>{ for(let y=Math.min(y0,y1);y<=Math.max(y0,y1);y++)
      for(let d=-half;d<=ext;d++){ const xx=x+d; if(xx>=0&&xx<W&&y>=0&&y<H){ g[y*W+xx]=0; if(mark)mark(xx,y); } } };
    if(Math.random()<0.5){ hx(ax,bx,ay); vy(ay,by,bx); } else { vy(ay,by,ax); hx(ax,bx,by); }
  }

  function genRooms(o,rng){
    const {W,H}=o, solid=new Uint8Array(W*H).fill(1), mat=new Uint8Array(W*H);
    const rooms=[], tries=o.roomCount*40;
    const b=Math.max(1,o.border);
    for(let t=0;t<tries&&rooms.length<o.roomCount;t++){
      const w=o.roomMin+((rng()*(o.roomMax-o.roomMin+1))|0);
      const h=o.roomMin+((rng()*(o.roomMax-o.roomMin+1))|0);
      const x=b+1+((rng()*Math.max(1,W-w-b*2-2))|0), y=b+1+((rng()*Math.max(1,H-h-b*2-2))|0);
      if(x+w>=W-b||y+h>=H-b) continue;
      let clash=false;
      for(const r of rooms) if(x<r.x+r.w+1&&x+w+1>r.x&&y<r.y+r.h+1&&y+h+1>r.y){clash=true;break;}
      if(clash) continue;
      // rooms alternate between the two structural materials; some read natural
      const useNat=o.natural&&rng()<(1-o.structMix);
      const m=useNat?NATURAL:(rng()<0.72?1:2);
      const r={x,y,w,h,cx:(x+w/2)|0,cy:(y+h/2)|0,mat:m};
      rooms.push(r);
      carveRect(solid,W,H,x,y,w,h,0);
      for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++) mat[yy*W+xx]=m;
    }
    // chain every room, then a few extra loops so the space isn't a pure tree
    const hallMat=o.natural?NATURAL:1;
    for(let i=1;i<rooms.length;i++){
      const a=rooms[i-1], c=rooms[i];
      carveHall(solid,W,H,a.cx,a.cy,c.cx,c.cy,o.hallWidth,(x,y)=>{mat[y*W+x]=hallMat;});
    }
    for(let k=0;k<o.loops&&rooms.length>2;k++){
      const a=rooms[(rng()*rooms.length)|0], c=rooms[(rng()*rooms.length)|0];
      if(a!==c) carveHall(solid,W,H,a.cx,a.cy,c.cx,c.cy,o.hallWidth,(x,y)=>{mat[y*W+x]=hallMat;});
    }
    return {solid,mat,rooms};
  }

  function genCave(o,rng){
    const {W,H}=o;
    const field=T.generateCAField(H,W,o.caveFill,o.caveSteps,rng);
    const solid=new Uint8Array(W*H), mat=new Uint8Array(W*H);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++) solid[y*W+x]=field[y][x]?1:0;
    // seal the rim
    for(let x=0;x<W;x++){ solid[x]=1; solid[(H-1)*W+x]=1; }
    for(let y=0;y<H;y++){ solid[y*W]=1; solid[y*W+W-1]=1; }
    // keep only the largest cavern so nothing is stranded
    const seen=new Uint8Array(W*H); let best=null;
    for(let i=0;i<W*H;i++){
      if(solid[i]||seen[i])continue;
      const cells=[], st=[i]; seen[i]=1;
      while(st.length){ const c=st.pop(); cells.push(c);
        const cx=c%W, cy=(c/W)|0;
        for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){ const nx=cx+dx,ny=cy+dy;
          if(nx<0||ny<0||nx>=W||ny>=H)continue; const ni=ny*W+nx;
          if(solid[ni]||seen[ni])continue; seen[ni]=1; st.push(ni); } }
      if(!best||cells.length>best.length) best=cells;
    }
    if(best){ const keep=new Uint8Array(W*H); for(const c of best)keep[c]=1;
      for(let i=0;i<W*H;i++) if(!solid[i]&&!keep[i]) solid[i]=1; }
    // stamp a few built rooms into the rock — ruins in the deep
    const rooms=[]; const nStruct=Math.max(0,Math.round(o.structMix*5));
    for(let t=0,made=0;t<nStruct*30&&made<nStruct;t++){
      const w=o.roomMin+((rng()*5)|0), h=o.roomMin+((rng()*4)|0);
      const x=2+((rng()*Math.max(1,W-w-4))|0), y=2+((rng()*Math.max(1,H-h-4))|0);
      let clash=false;
      for(const r of rooms) if(x<r.x+r.w+2&&x+w+2>r.x&&y<r.y+r.h+2&&y+h+2>r.y){clash=true;break;}
      if(clash) continue;
      const m=rng()<0.7?1:2;
      const r={x,y,w,h,cx:(x+w/2)|0,cy:(y+h/2)|0,mat:m,built:true};
      rooms.push(r); made++;
      carveRect(solid,W,H,x,y,w,h,0);
      for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++) mat[yy*W+xx]=m;
      // a doorway out of each built room, so it always joins the cavern
      carveHall(solid,W,H,r.cx,r.cy,clampi(r.cx+((rng()*13)|0)-6,2,W-3),clampi(r.cy+((rng()*13)|0)-6,2,H-3),
        Math.max(1,o.hallWidth-1),(x2,y2)=>{ if(mat[y2*W+x2]===NATURAL)mat[y2*W+x2]=NATURAL; });
    }
    return {solid,mat,rooms};
  }
  const clampi=(v,a,b)=>v<a?a:v>b?b:v;

  /* ================= tilesets ================= */
  function buildTilesets(o){
    const res=o.res, style={edge:o.edge,roundRadius:o.roundRadius,grainSeed:o.seed};
    const sets={};
    // 0 — natural ground + rock, from the world's own palette
    const pals=T.makePalettes(o.grassHex,o.dirtHex);
    const nStyle=T.deriveStyle('int-'+o.seed);
    nStyle.edge=o.natural?'rounded':o.edge; nStyle.roundRadius=o.roundRadius;
    const nf=[],nw=[],ncoll=new Array(16);
    for(let i=0;i<16;i++){
      // the index describes the OPEN corners; the wall is what's left, so a
      // wall tile is only ever carved INWARD and never eats open floor
      const open=T.edgeMask(res,T.cornersFromIndex(i),nStyle);
      const inv=new Uint8Array(res*res); for(let k=0;k<inv.length;k++) inv[k]=open[k]?0:1;
      ncoll[i]=inv; nf[i]=[]; nw[i]=[];
      for(let v=0;v<2;v++){
        nf[i].push(T.paintTile(res,open,o.seed+i*7919+v*104729,pals.low,nStyle));
        nw[i].push(T.paintCliff(res,inv,o.seed+i*7919+v*104729+4000,pals.rock,nStyle));
      }
    }
    sets[NATURAL]={res,variants:2,floor:nf,wall:nw,coll:ncoll,natural:true};
    // 1,2 — the structural slots. Walls and floors may be different stuff
    // (brick walls over plank boards), which is what makes a room legible.
    const slot=(wallName,floorName,sd)=>{
      const wset=S.makeTileset({res,variants:2,seed:sd,name:wallName,edge:o.edge,roundRadius:o.roundRadius,invertWall:true});
      if(!floorName||floorName===wallName) return wset;
      const fset=S.makeTileset({res,variants:2,seed:sd^0x3C,name:floorName,edge:o.edge,roundRadius:o.roundRadius,invertWall:true});
      return {res,variants:2,name:wallName,floorName,pal:fset.pal,wpal:wset.wpal,
              floor:fset.floor, wall:wset.wall, coll:wset.coll};
    };
    sets[1]=slot(o.mat, o.floorMat, o.seed^0x51);
    sets[2]=slot(o.mat2,o.floorMat2,o.seed^0xA2);
    return sets;
  }

  /* ================= the space ================= */
  function generate(opts){
    const o=cfg(opts);
    const rng=T.mulberry32((o.seed>>>0)||1);
    const gen=(o.mode==='cave')?genCave(o,rng):genRooms(o,rng);
    const {W,H,res}=o;
    const solid=gen.solid, mat=gen.mat, rooms=gen.rooms;

    // ---- give the WALLS a material too ----
    // A wall adopts the material of the floor it faces, so a brick room is
    // ringed by brick and reads clearly against its floor. Walls with nothing
    // built beside them stay natural rock (the living stone of a cavern).
    {
      const wm=new Uint8Array(W*H);
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const i=y*W+x; if(!solid[i])continue;
        let best=NATURAL, bestN=0; const tally={};
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H)continue;
          const ni=ny*W+nx; if(solid[ni])continue;
          const m=mat[ni]; tally[m]=(tally[m]||0)+1;
          if(tally[m]>bestN){bestN=tally[m];best=m;}
        }
        // in a built space the shell is masonry even where it faces nothing
        if(!bestN) best=o.natural?NATURAL:1;
        wm[i]=best;
      }
      for(let i=0;i<W*H;i++) if(solid[i]) mat[i]=wm[i];
    }

    // The vertex grid is computed over the OPEN field: a vertex is "open" when
    // the floor dominates its four cells. The wall is then the complement, so
    // walls round inward at their corners and open floor stays walkable —
    // this is what keeps collision and the drawn image in exact agreement.
    const openField=Array.from({length:H},(_,y)=>Array.from({length:W},(_,x)=>!solid[y*W+x]));
    const openVG=T.computeVertexGrid(openField,H,W);
    const sets=buildTilesets(o);
    const variantMap=new Uint8Array(W*H);
    for(let i=0;i<W*H;i++) variantMap[i]=(rng()*2)|0;

    // Per-cell corner index driving the wall overlay.
    //   · an OPEN cell is always index 15 — nothing is drawn over it and
    //     nothing can block it, so a carved floor is *always* walkable.
    //   · a SOLID cell rounds only where open space presses against it, so
    //     smoothing eats into the wall and never into the room.
    // That asymmetry is what keeps the drawn image and collision in lockstep.
    const wallIdx=new Uint8Array(W*H);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=y*W+x;
      if(!solid[i]){ wallIdx[i]=15; continue; }
      let idx=T.cornerIndex(T.cellCorners(openVG,x,y));
      if(idx===15) idx=0;          // a thin wall must not vanish entirely
      wallIdx[i]=idx;
    }

    // per-material corner index for the FLOOR, so a brick room's edge
    // corner-smooths into the dirt around it just like overworld rock
    const matVG={}, floorIdx=new Uint8Array(W*H);
    const usedMats=new Set(); for(let i=0;i<W*H;i++) usedMats.add(mat[i]);
    for(const m of usedMats){
      if(m===NATURAL)continue;
      const f=Array.from({length:H},(_,y)=>Array.from({length:W},(_,x)=>mat[y*W+x]===m));
      matVG[m]=T.computeVertexGrid(f,H,W);
    }
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=y*W+x, m=mat[i];
      floorIdx[i]=(m===NATURAL)?15:T.cornerIndex(T.cellCorners(matVG[m],x,y));
    }

    function bake(){
      const cv=document.createElement('canvas'); cv.width=W*res; cv.height=H*res;
      const c=cv.getContext('2d'); c.imageSmoothingEnabled=false;
      // 1. natural ground everywhere (the bed the whole space sits on)
      const nat=sets[NATURAL];
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const v=variantMap[y*W+x]%nat.variants;
        c.drawImage(nat.floor[15][v], x*res, y*res);
      }
      // 2. structural floors, corner-smoothed into it
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const i=y*W+x, m=mat[i]; if(m===NATURAL)continue;
        const set=sets[m]; if(!set)continue;
        const idx=floorIdx[i]; if(!idx)continue;
        c.drawImage(set.floor[idx][variantMap[i]%set.variants], x*res, y*res);
      }
      // 3. wall overlay — structural where the cell has a material, living
      //    rock where it doesn't. idx 15 means "all open", so nothing to draw.
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const i=y*W+x, idx=wallIdx[i];
        if(idx===15)continue;
        const m=mat[i]!==NATURAL?mat[i]:NATURAL;
        const set=sets[m]||sets[NATURAL];
        c.drawImage(set.wall[idx][variantMap[i]%set.variants], x*res, y*res);
      }
      // 4. a soft contact shadow under every wall so it reads raised
      c.save(); c.globalAlpha=0.30; c.fillStyle='#000';
      for(let y=0;y<H-1;y++)for(let x=0;x<W;x++){
        if(solid[y*W+x]&&!solid[(y+1)*W+x]) c.fillRect(x*res,(y+1)*res,res,Math.max(2,res*0.18));
      }
      c.restore();
      return cv;
    }

    // ---- collision: sample the SAME per-pixel wall mask that was drawn ----
    function blockedAt(px,py){
      if(px<0||py<0||px>=W*res||py>=H*res) return true;
      const cx=(px/res)|0, cy=(py/res)|0, i=cy*W+cx;
      const idx=wallIdx[i];
      if(idx===15) return false;          // fully open cell
      if(idx===0)  return true;           // fully solid cell
      const set=sets[mat[i]!==NATURAL?mat[i]:NATURAL]||sets[NATURAL];
      const m=set.coll[idx];              // coll is the inverted (wall) mask
      return !!m[(((py-cy*res)|0)*res)+((px-cx*res)|0)];
    }
    function canStand(px,py,r){
      if(blockedAt(px,py))return false;
      r=r||0; if(!r)return true;
      for(let k=0;k<8;k++){ const a=k*Math.PI/4;
        if(blockedAt(px+Math.cos(a)*r,py+Math.sin(a)*r))return false; }
      return true;
    }
    function openCells(){ const out=[];
      for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++) if(!solid[y*W+x]) out.push([x,y]);
      return out; }
    function spawnPoint(){
      if(rooms.length){ const r=rooms[0]; return [(r.cx+0.5)*res,(r.cy+0.5)*res]; }
      const o2=openCells(); if(!o2.length) return [res*1.5,res*1.5];
      const c=o2[(o2.length/2)|0]; return [(c[0]+0.5)*res,(c[1]+0.5)*res];
    }
    // is this cell open floor with room to stand? (for placing things)
    function freeCell(rngF){
      const cells=openCells(); const rr=rngF||Math.random;
      for(let t=0;t<200;t++){ const c=cells[(rr()*cells.length)|0];
        if(!c)break;
        if(canStand((c[0]+0.5)*res,(c[1]+0.5)*res,res*0.34)) return c; }
      return cells[0]||[1,1];
    }

    return { W,H,res, opts:o, solid, mat, rooms, wallIdx, floorIdx, sets,
             bake, blockedAt, canStand, openCells, spawnPoint, freeCell,
             get pxW(){return W*res}, get pxH(){return H*res},
             isSolid:(x,y)=>(x<0||y<0||x>=W||y>=H)?1:solid[y*W+x] };
  }

  return { generate, DEF, NATURAL, MATERIALS:S.PRESETS };
})();
if(typeof window!=='undefined')window.Interior=Interior;
