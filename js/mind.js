'use strict';
/* ============================================================
   SEED & SAGE — mind.js
   A secondary, MUTATING Markov-memory carried per-NPC.

   The world's Lore is a fixed cultural substrate. Each person is
   born with a small personal LEXICON sampled from it (or inherited,
   blended, from their parents). That lexicon drifts:

     • coin()   breaks the remembered words into little chunks and
                recombines them into brand-new coined words
     • mingle() when two people talk, each absorbs a few words/chunks
                of the OTHER's memory and coins something from the mix
     • child()  a newborn's memory is a blend of both parents', plus a
                couple of fresh coinages — so children's NAMES carry a
                recognisable but mutated echo of their parents
     • speak()  swaps a word or two of a line for the speaker's own
                idiolect, so everyone's dialogue drifts personally

   Oldest memories fade (the lexicon is bounded), so a village's
   vocabulary slowly evolves as people meet, pair, and pass on.
   ============================================================ */
const Mind = (function(){
 let rng=Math.random, baseWords=[], active=false;
 const STOP=new Set('the a an and or but of to in on at by for with as is are was were be been it its he she they them his her their this that these those from into out up down so not no if then than too very can will would could should do does did has have had you we me my your our us who what when where why how all any some one two here there now still every only own over under about'.split(' '));

 function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
 const pk=a=>a[(rng()*a.length)|0];
 function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
 function sample(arr,n){ const a=arr.slice(),out=[]; n=Math.min(n,a.length); for(let i=0;i<n;i++){ out.push(a.splice((rng()*a.length)|0,1)[0]); } return out; }
 // break a word into syllable-ish chunks (split just after a vowel-run, before
 // the next consonant) so recombined coinages stay pronounceable
 const isVowel=ch=>/[aeiouyàâäéèêëîïôöûü]/.test(ch);
 function chunksOf(w){
  const out=[]; let cur='';
  for(let i=0;i<w.length;i++){
   cur+=w[i];
   if(isVowel(w[i]) && i+1<w.length && !isVowel(w[i+1]) && cur.length>=2){ out.push(cur); cur=''; }
  }
  if(cur){ if(out.length&&cur.length<2)out[out.length-1]+=cur; else out.push(cur); }
  return out.filter(c=>c.length>=2);
 }

 function seedWorld(text, seedNum){
  rng=mulberry32(((seedNum>>>0)^0x9E3779B9)||0xC0FFEE);
  const seen=new Set(), ws=[];
  for(const w of (String(text).toLowerCase().match(/[a-zà-ÿ][a-zà-ÿ'-]*/g)||[])){
   if(w.length>=3&&w.length<=13&&!STOP.has(w)&&!seen.has(w)){ seen.add(w); ws.push(w); }
  }
  baseWords=ws;
  active=baseWords.length>6;
  return active;
 }

 // a fresh mind: a personal slice of the world's substrate
 function create(){
  if(!active)return null;
  return { w:sample(baseWords, 12+((rng()*6)|0)), v:0, _c:null, _cv:-1 };
 }

 function addWord(m,w){ if(!w||w.length<3||m.w.indexOf(w)>=0)return; m.w.push(w); if(m.w.length>26)m.w.shift(); m.v++; }

 // recombine chunks of a few remembered words into a new coined word
 function coin(m){
  if(!m||m.w.length<2)return null;
  const pool=[]; for(const w of sample(m.w,Math.min(5,m.w.length)))for(const c of chunksOf(w))pool.push(c);
  if(pool.length<2)return null;
  let out=''; const n=2+(rng()<.4?1:0);
  for(let i=0;i<n;i++)out+=pk(pool);
  out=out.slice(0,10).replace(/['-]+$/,'');
  if(out.length<3)return null;
  addWord(m,out); return out;
 }

 // two minds meet: each takes something of the other and coins from the blend
 function absorb(self,other){
  if(!other.w.length)return;
  if(rng()<.5){ addWord(self, pk(other.w)); }
  else { const pool=[]; for(const w of sample(other.w,Math.min(4,other.w.length)))for(const c of chunksOf(w))pool.push(c); if(pool.length>=2)addWord(self,(pk(pool)+pk(pool)).slice(0,10)); }
 }
 function mingle(a,b){ if(!a||!b)return; absorb(a,b); absorb(b,a); if(rng()<.5)coin(a); if(rng()<.5)coin(b); }

 // a newborn's memory: a blend of both parents', plus fresh coinages
 function child(a,b){
  if(!active)return create();
  const src=[]; if(a&&a.w)src.push(...a.w); if(b&&b.w)src.push(...b.w);
  const base=src.length? sample(src, Math.min(16, 8+((rng()*6)|0))) : sample(baseWords,12);
  const m={ w:base, v:0, _c:null, _cv:-1 };
  coin(m); coin(m);
  return m;
 }

 function buildC(m){
  if(m._cv===m.v&&m._c)return m._c;
  const model={},starts=[];
  for(const w of m.w){ const s='^^'+w+'$'; starts.push(w.slice(0,2)); for(let i=2;i<s.length;i++){ const k=s.slice(i-2,i); (model[k]=model[k]||[]).push(s[i]); } }
  m._c={model,starts}; m._cv=m.v; return m._c;
 }
 // a name in this mind's own drifted voice
 function name(m,minL,maxL){
  if(!m||!m.w.length)return null;
  minL=minL||4; maxL=maxL||11;
  const {model,starts}=buildC(m);
  if(!starts.length)return null;
  for(let a=0;a<16;a++){
   let s='^^'+pk(starts), out=s.slice(2);
   for(let i=0;i<14;i++){ const nx=model[s.slice(-2)]; if(!nx)break; const ch=pk(nx); if(ch==='$')break; out+=ch; s+=ch; }
   out=out.replace(/['-]+$/,'');
   if(out.length>=minL&&out.length<=maxL&&!STOP.has(out))return cap(out);
  }
  return cap(pk(m.w));
 }

 // swap a word or two of a line for this mind's idiolect
 function speak(m,line){
  if(!m||!line||!m.w.length)return line;
  const toks=line.split(/(\s+)/);
  let want=1+(rng()<.35?1:0), done=0;
  for(let i=0;i<toks.length&&done<want;i++){
   const core=toks[i].replace(/[^a-zà-ÿ]/gi,'');
   if(core.length>=4&&!STOP.has(core.toLowerCase())&&rng()<.5){
    let rep=pk(m.w); if(/^[A-Z]/.test(core))rep=cap(rep);
    toks[i]=toks[i].replace(core,rep); done++;
   }
  }
  return toks.join('');
 }

 return { seedWorld, create, child, coin, mingle, name, speak,
  get active(){return active} };
})();
