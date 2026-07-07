'use strict';
/* ============================================================
   SEED & SAGE — animals.js
   ANIMAL FORGE: procedural fauna to populate the surface world.
   Each species is a Creature-Forge "beast" recipe (snout, ears,
   horns, tail, fur) plus a temperament that drives a very simple
   AI — wander / graze, flee threats, or (for predators) hunt.

   Sprites are baked through the shared CFHelp bridge so they walk
   in 8 directions and Y-sort with everything else.
   ============================================================ */
const AF = (function(){
const hashStr=U.hashStr;
function pick(rng,a){ return a[(rng()*a.length)|0]; }

// temper: 'prey' (flees), 'neutral' (grazes, will gore what corners it),
//         'predator' (hunts prey; the bold ones will take a swipe at the Sage)
const SPECIES={
 deer:  {label:'deer',   temper:'prey',     hp:16, dmg:0, spd:1.55, size:46, flee:8,
   base:{...CF.PRESETS.Beast, snout:2.5, earType:'long', earSize:3, hornType:'antler', hornSize:4,
     tailType:'stub', bodyW:3.5, bodyH:6, legLen:7, legThick:1.4, tex:'fur', texAmt:.45, spots:false,
     headSize:-0.3, headRound:.72}, hue:[26,40], sat:[28,44], lit:[42,56]},
 rabbit:{label:'rabbit', temper:'prey',     hp:8,  dmg:0, spd:2.0,  size:34, flee:10,
   base:{...CF.PRESETS.Beast, snout:1, earType:'long', earSize:4.5, hornType:'none',
     tailType:'fluff', tailSize:4, bodyW:3.2, bodyH:4.4, legLen:6, tex:'fur', texAmt:.35, spots:false,
     headSize:-0.4, headRound:.8}, hue:[20,42], sat:[8,24], lit:[54,78]},
 fowl:  {label:'fowl',   temper:'prey',     hp:6,  dmg:0, spd:1.45, size:36, flee:9,
   base:{...CF.PRESETS.Beast, snout:1.5, earType:'none', hornType:'none', crest:true,
     tailType:'spike', tailSize:5, bodyW:3.2, bodyH:4.6, legLen:6.5, armLen:4, tex:'smooth', spots:false,
     headSize:-0.3, headRound:.85, shoes:false}, hue:[0,360], sat:[30,62], lit:[44,62]},
 boar:  {label:'boar',   temper:'neutral',  hp:28, dmg:7, spd:1.15, size:46, flee:5,
   base:{...CF.PRESETS.Beast, snout:3, earType:'pointed', earSize:2.5, hornType:'straight', hornSize:2.5,
     tailType:'stub', bodyW:4.6, bodyH:6, legLen:5.5, legThick:1.9, tex:'fur', texAmt:.6, spots:false,
     headSize:0, headRound:.72}, hue:[16,34], sat:[16,34], lit:[24,40]},
 fox:   {label:'fox',    temper:'predator', hp:16, dmg:4, spd:1.75, size:42, aggro:8, bold:false,
   base:{...CF.PRESETS.Beast, snout:2.5, earType:'pointed', earSize:3.5, hornType:'none',
     tailType:'fluff', tailSize:7, bodyW:3.4, bodyH:5.4, legLen:6, tex:'fur', texAmt:.5, spots:false,
     headSize:-0.2, headRound:.72}, hue:[12,26], sat:[55,78], lit:[44,58]},
 wolf:  {label:'wolf',   temper:'predator', hp:34, dmg:9, spd:1.45, size:46, aggro:10, bold:true,
   base:{...CF.PRESETS.Beast, snout:3, earType:'pointed', earSize:3, hornType:'none',
     tailType:'long', tailSize:6, bodyW:4, bodyH:6.5, legLen:6.5, legThick:1.7, tex:'fur', texAmt:.6, spots:false,
     headSize:0, headRound:.72}, hue:[200,262], sat:[6,18], lit:[38,62]},
};
const KEYS=Object.keys(SPECIES);
const NAMES={
 deer:['Doe','Stag','Fawn','Bramble'], rabbit:['Hare','Kit','Bun','Clover'],
 fowl:['Cluck','Peck','Quill','Pip'], boar:['Tusk','Sow','Grunt','Bristle'],
 fox:['Rust','Vixen','Ember','Sly'], wolf:['Grey','Fang','Shadow','Ash'],
};

// make(key|null, seed) → {key, spec, params, name, sizeScale}
function make(key, seed){
 const rng=CF.mulberry32(hashStr('animal-'+seed));
 const k=(key&&SPECIES[key])?key:pick(rng,KEYS);
 const s=SPECIES[k];
 const hue=Math.round(s.hue[0]+rng()*(s.hue[1]-s.hue[0]));
 const sat=Math.round(s.sat[0]+rng()*(s.sat[1]-s.sat[0]));
 const lit=Math.round(s.lit[0]+rng()*(s.lit[1]-s.lit[0]));
 const params={...s.base, size:48, walkFrames:4, outline:true,
   hue, sat, lit, hue2:hue, accent:(hue+180)%360, hairHue:hue, seed:'animal-'+k+'-'+seed};
 return {key:k, spec:s, params, name:pick(rng,NAMES[k]||['beast']), sizeScale:s.size/48};
}
return {SPECIES, KEYS, NAMES, make, pick};
})();
