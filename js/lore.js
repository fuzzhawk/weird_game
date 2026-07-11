'use strict';
/* ============================================================
   SEED & SAGE — lore.js
   A crude Markov-chain text generator, trained per-world on a
   seed-text paragraph. Two models are built from the same text:
     • a CHARACTER model (order-2) → plausible names / place-words
       in the style of the seed text
     • a WORD model (order-1) → short flavour lines
   Everything is seeded so a given (text, seed) is reproducible.
   Paste any paragraph as the seed text and the whole world's
   names and mutterings take on its voice.
   ============================================================ */
const Lore = (function(){
 let active=false, theme='', rng=null;
 let cModel=null, cStarts=null, wModel=null, wStarts=null, wEnds=null, vocab=null;

 // common function-words: kept OUT of the character (name) model so names read
 // as names — "Barrow", "Raveres" — instead of "The", "And", "Of".
 const STOP=new Set('the a an and or but of to in on at by for with as is are was were be been it its it\'s he she they them his her their this that these those from into out up down so not no if then than too very can will would could should do does did has have had i you we me my your our us who what when where why how all any some one two here there now still every only own over under out about'.split(' '));
 function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
 function words(t){ return (String(t).toLowerCase().match(/[a-zà-ÿ][a-zà-ÿ'-]*/g)||[]); }
 const pk=a=>a[(rng()*a.length)|0];

 function train(text, seedNum, th){
  theme=th||'';
  rng=mulberry32((seedNum>>>0)||0x5EED);
  text=(text&&String(text).trim().length>20)?String(text):'The quiet ones keep old names and older roads. Something waits under the world, patient as roots.';
  // ---- character model (names) ----
  const ws=words(text).filter(w=>w.length>=3&&w.length<=14&&!STOP.has(w));
  cModel={}; cStarts=[]; vocab=[];
  for(const w of ws){
   const s='^^'+w+'$';
   cStarts.push(w.slice(0,2));
   if(w.length>=4&&w.length<=11)vocab.push(w);
   for(let i=2;i<s.length;i++){ const k=s.slice(i-2,i),c=s[i]; (cModel[k]=cModel[k]||[]).push(c); }
  }
  // ---- word model (lines) ----
  wModel={}; wStarts=[]; wEnds=new Set();
  for(const sent of String(text).split(/[.!?\n]+/)){
   const sw=words(sent);
   if(sw.length<2)continue;
   wStarts.push(sw[0]); wEnds.add(sw[sw.length-1]);
   for(let i=0;i<sw.length-1;i++){ (wModel[sw[i]]=wModel[sw[i]]||[]).push(sw[i+1]); }
  }
  active = cStarts.length>6;
  return active;
 }
 function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

 // a plausible name/place-word in the seed text's style
 function name(minL,maxL){
  if(!active)return null;
  minL=minL||3; maxL=maxL||11;
  for(let attempt=0;attempt<16;attempt++){
   let s='^^'+pk(cStarts), out=s.slice(2);
   for(let i=0;i<14;i++){ const nx=cModel[s.slice(-2)]; if(!nx)break; const c=pk(nx); if(c==='$')break; out+=c; s+=c; }
   out=out.replace(/['-]+$/,'');
   if(out.length>=minL&&out.length<=maxL&&!STOP.has(out))return cap(out);
  }
  return cap(pk(vocab.length?vocab:['thing']));
 }
 // a short flavour line built from the seed text's own words
 function line(min,max){
  if(!active||!wStarts.length)return null;
  min=min||6; max=max||16;
  let w=pk(wStarts), out=[w];
  const target=min+((rng()*(max-min))|0);
  for(let i=0;i<max+4;i++){
   const nx=wModel[w]; if(!nx)break;
   w=pk(nx); out.push(w);
   if(out.length>=min&&wEnds.has(w))break;
   if(out.length>=max)break;
  }
  return cap(out.join(' '))+'.';
 }
 // a couple of words joined (for a two-part place/shop name)
 function phrase(n){ n=n||2; const p=[]; for(let i=0;i<n;i++)p.push(name(3,9)); return p.join(' '); }

 return { train, name, line, phrase,
  get active(){return active}, get theme(){return theme}, set(v){active=!!v&&!!cStarts} };
})();
