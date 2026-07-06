'use strict';
/* ============================================================
   SEED & SAGE — core.js
   Shared utilities + the persistent Hero that walks between
   the surface garden and the Understory dungeons.
   ============================================================ */
const U = (function(){
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  function hashStr(s){s=String(s);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
  const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
  function hexToRgb(hex){const n=parseInt(hex.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255]}
  function rgbToHsl(r,g,b){
    r/=255;g/=255;b/=255;
    const max=Math.max(r,g,b),min=Math.min(r,g,b);
    let h,s,l=(max+min)/2;
    if(max===min){h=s=0}
    else{
      const d=max-min;
      s=l>0.5?d/(2-max-min):d/(max+min);
      switch(max){
        case r:h=(g-b)/d+(g<b?6:0);break;
        case g:h=(b-r)/d+2;break;
        default:h=(r-g)/d+4;
      }
      h/=6;
    }
    return[h,s,l];
  }
  function hslToRgb(h,s,l){
    let r,g,b;
    if(s===0){r=g=b=l}
    else{
      const hue2rgb=(p,q,t)=>{
        if(t<0)t+=1;if(t>1)t-=1;
        if(t<1/6)return p+(q-p)*6*t;
        if(t<1/2)return q;
        if(t<2/3)return p+(q-p)*(2/3-t)*6;
        return p;
      };
      const q=l<0.5?l*(1+s):l+s-l*s;
      const p=2*l-q;
      r=hue2rgb(p,q,h+1/3);g=hue2rgb(p,q,h);b=hue2rgb(p,q,h-1/3);
    }
    return[Math.round(r*255),Math.round(g*255),Math.round(b*255)];
  }
  function hslToHex(h,s,l){
    const[r,g,b]=hslToRgb(h,s,l);
    return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  }
  // shade a hex colour, returning an [r,g,b] triple (positive = lighter)
  function shadeHex(hex,amt){
    const[r,g,b]=hexToRgb(hex);
    let[h,s,l]=rgbToHsl(r,g,b);
    if(amt>=0){l=l+(1-l)*amt;s=s*(1-Math.min(0.85,amt*1.4))}
    else{l=l*(1+amt);s=s*(1+amt*0.2)}
    l=clamp(l,0,1);s=clamp(s,0,1);
    return hslToRgb(h,s,l);
  }
  return {mulberry32,hashStr,clamp,hexToRgb,rgbToHsl,hslToRgb,hslToHex,shadeHex};
})();

/* ---------- the Hero: one body, two worlds ----------
   Hearts, level and blade upgrades persist across the surface
   garden and every Understory floor.                          */
const Hero = {
  hp:5, maxHp:5,
  level:1, xp:0, kills:0,
  dmg:1, rangeMul:1, arcMul:1, speedMul:1,
  cleansed:0,                                    // dungeons put to rest
  relics:[],                                     // tech-relic ids installed (skills that persist)
  lookSeed:'sage-'+((Math.random()*1e9)|0),      // body shape seed (recolours per biome)
};
function heroXpNeed(){ return 5+(Hero.level-1)*4; }
// returns the number of level-ups gained (caller does its own fanfare)
function heroGainXp(n){
  Hero.xp+=n;
  let ups=0;
  while(Hero.xp>=heroXpNeed()){
    Hero.xp-=heroXpNeed(); Hero.level++; ups++;
    if(Hero.level%2===0) Hero.maxHp++;
    Hero.hp=Math.min(Hero.maxHp,Hero.hp+1);
  }
  return ups;
}
function heroHearts(){
  return '♥'.repeat(Math.max(0,Hero.hp))+'·'.repeat(Math.max(0,Hero.maxHp-Hero.hp));
}
