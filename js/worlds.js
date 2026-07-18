'use strict';
/* ============================================================
   SEED & SAGE — worlds.js
   The world-select loading screen: 23 preset worlds, each with a
   theme, a lore blurb, and an editable SEED TEXT paragraph that
   trains the Markov lore generator (paste your own to re-voice a
   world). Placeholder seed texts ship for now — swap freely.
   ============================================================ */
const Worlds = (function(){
 const $=id=>document.getElementById(id);
 // theme → chip glyph + colour
 const THEMES={
  fantasy:{g:'⚔️', c:'#c9a24a', n:'High Fantasy'},
  cyberpunk:{g:'🌃', c:'#37e6ff', n:'Cyberpunk'},
  modern:{g:'🏙️', c:'#8fd3a0', n:'Modern Day'},
 };
 // 23 preset worlds. `seed` fixes the procedural world; `text` seeds the lore
 // Markov chain. The default seed texts are deliberately chaotic and poetic —
 // fragmentary, image-heavy — so the Markov output has rich, strange material
 // to chew. Paste your own paragraph over any of them to re-voice a world.
 const WORLDS=[
  {t:'fantasy', title:'The Ashen Reach', seed:71010, blurb:'A grey kingdom of ash and old oaths, where the dead do not always stay buried.',
   text:'Ash for snow, ash for bread, ash in the mouths of the sleeping kings. The barrows breathe. Oaths outlast the tongues that swore them and the crows keep a colder ledger than the crown. Steel remembers. Steel always remembers the hand, the heat, the long bright falling. Mist walks the grey roads on borrowed feet. Every name here is a debt the dead intend to collect. Burn low, little fire. Never out.'},
  {t:'fantasy', title:'Elderbloom', seed:71011, blurb:'An elven greenwood of singing rivers, silver boughs and slow, patient magic.',
   text:'The wood is singing and has not stopped in a thousand years. Silver in the river, silver in the bough, silver caught like held breath between the antlers of the drinking deer. Leaves remember the first note and hum it wrong, sweetly, endlessly. Root braids root braids root. Walk soft, walk slow, and the green will learn your name and keep it kinder than you ever kept it. Moonlight pools in the hollow. The old trees dream in blossom and count the years in falling petals.'},
  {t:'fantasy', title:'The Sunken Crowns', seed:71012, blurb:'Drowned kingdoms beneath a warm shallow sea, their towers full of coral and ghosts.',
   text:'Seven crowns, and the tide took every one. Coral wears the towers now like a second colder skin. Pale fish loop the throne rooms; a bell tolls underwater and nobody swims down to answer. Gold and grief come up tangled in the same net. The sea keeps its palaces the way a shut mouth keeps a secret — cold, close, and never, never letting go. Drowned bells. Drowned kings. The whole warm green dark of it, still swallowing, still smiling.'},
  {t:'fantasy', title:'Wyrmhold', seed:71013, blurb:'Deep dwarven halls and dragon-haunted peaks, where gold is prayer and fire is fate.',
   text:'Under the mountain the hammers pray in iron. Gold, and gold, and the long slow breathing of wyrms asleep on hoards older than the light. Every forge is a small war against the dark, and the dark is patient. The deep roads run true because the miners sing them true. Fire is the first law and the last. Cinders for a crown, cinders for a king, cinders drifting up the black shafts like the ghosts of sparks that never learned to die.'},
  {t:'fantasy', title:'The Thornwild', seed:71014, blurb:'A witch-haunted briar where the fae strike bargains and every path lies twice.',
   text:'The briar trades in true names and crooked luck and the fae keep court where the brambles knot. Bargains bite. A path will lie to you twice before it tells the truth, and the wells give back a stranger\'s face for your own. Salt at the door. Salt on the tongue. Never thank the green folk aloud, never eat what the hedge offers twice, never follow the little light that walks. Something is laughing in the thorns, and it knows your grandmother\'s name.'},
  {t:'fantasy', title:'Saltmarch', seed:71015, blurb:'A raucous coast of pirate coves, sea-gods and smuggled charms in the fog.',
   text:'Grey fog, greyer law, and a coast that keeps its own drowned gods. The coves smuggle charms and corpses on the same slack tide. Gulls scream the smugglers\' roads. Rum for rumour, storm for tithe, and the sea-gods take their cut in salt and silence. A ship is a promise the horizon breaks when it feels like it. Fog rolls in wearing the faces of the missing. Somewhere a bell buoy tolls for no one, and the black water answers back.'},
  {t:'fantasy', title:'The Pale Dominion', seed:71016, blurb:'A necromancer’s realm of bone-orchards and grateful, tireless dead.',
   text:'Candlelight and bone-orchards and the grateful, tireless dead. The lords in ash-grey robes count their people by the graveyard, and nothing rots that has not first been given leave. The living are rare here, and quiet, and they learn young to speak soft by the pale gate lest the ground sit up and answer. Bone blossom. Bone fruit. The dead do the weeding now, and they are so very patient, and so very glad of the work.'},
  {t:'fantasy', title:'Emberpeak', seed:71017, blurb:'A volcanic frontier of orc war-camps, obsidian roads and ceaseless drums.',
   text:'Red sky, black road, and the drums that never stop but only change their mind. The clans keep their war-camps loud against the dark. Obsidian rivers of cooled fire run between the calderas. Strength is the only coin and a scar is a signature written in the reader\'s own hand. The mountain gives. The mountain takes. Both get honoured in flame, both get sung to, and the ash comes down warm as snow that has decided to stop pretending.'},

  {t:'cyberpunk', title:'Neon Sprawl', seed:72020, blurb:'Rain, ramen and rooftop deals under a sky owned by billboards.',
   text:'The sprawl never sleeps and never quite wakes. Rain sideways through the billboard-light, neon bleeding pink into the puddles, ramen steam and cordite and someone\'s perfume from three floors up. Everyone owes someone. The corps rent you the sky by the hour. A runner sells their reflexes to the highest bidder and buys them back at dawn, secondhand, a little slower. Signal. Static. The city hums its one long electric vowel and forgets to breathe.'},
  {t:'cyberpunk', title:'Chrome Verge', seed:72021, blurb:'A corporate arcology-state where loyalty is a subscription and eyes are cameras.',
   text:'The corp is mother, father, landlord, god, and loyalty renews on the first of every month. A thousand borrowed eyes in the ceiling. Promotion is just survival in better shoes. The atrium gardens grow to a brand guideline, green and grateful and fake. Down in the service dark the off-contract drift, trading favours and firmware, dreaming in the grey wash of screens that never, ever go out. Smile for the camera. The camera is always the camera.'},
  {t:'cyberpunk', title:'The Undernet', seed:72022, blurb:'A hacker underworld of black ice, dead drops and data that bites back.',
   text:'Below the clean city, a second nervous system, twitching. Deckers trade in black ice and dead drops and the data bites if you read it wrong. Everything down here is encrypted, even the friendships, even the grief. A handle outweighs a face. The best ghosts leave no logs — only a cold suggestion in the dark, a draught where a door used to be, the sense that someone was just here and took the light with them. Jack in. Do not flinch.'},
  {t:'cyberpunk', title:'Halcyon Arcology', seed:72023, blurb:'A gleaming vertical city that promises paradise on every floor but the yours.',
   text:'A mile of building pretending to be a city. Each floor sells the paradise of the floor above; the elevator knows your credit before your name. Filtered air for the shareholders near the roof, coffee and duct tape and quiet contempt for the crews near the roots. Up is a religion here. The higher you climb the thinner the truth, the whiter the light, the further the fall you are so carefully not thinking about. Going up. Always going up.'},
  {t:'cyberpunk', title:'Ghostwire', seed:72024, blurb:'A haunted network where dead AIs and deader people share the same wires.',
   text:'The machines learned to grieve and now the network is thick with the dead. Retired AIs drift the empty channels; sometimes a voice answers in a tone you buried years ago. The techs speak of the wire the way sailors spoke of the sea — with love, with dread, one eye always on it. Nothing here is ever deleted. It only goes quiet. It only waits. It listens on the dead frequency and remembers the shape of your handshake.'},
  {t:'cyberpunk', title:'Saltware Docks', seed:72025, blurb:'A rusting cargo port where smugglers move chrome, chem and stranger freight.',
   text:'Brine, diesel, cheap synth, and cranes swinging freight that no one signs for. Chrome in one container, chem in the next, something breathing in the third. The dock gangs run the tide-tables and the bribe-tables both. Past the breakwater the grey ships wait for dark. A body that goes into that water comes back a rumour, if it comes back at all, bloated with static and other people\'s secrets. Low tide. The harbour shows its teeth and everything it swallowed.'},
  {t:'cyberpunk', title:'The Bleed', seed:72026, blurb:'A district where reality glitches, memories corrupt and the map won’t hold still.',
   text:'They call it the bleed because the world here runs like wet ink. Streets rename themselves overnight; memory corrupts like a bad sector; the map will not hold still in your hands. People flicker at the edges, mid-sentence, mid-life. Trust the glitch, the locals say, distrust the calm. Reality is only the default setting and out here the default has stopped loading. Something is buffering under the pavement. Do not look directly at the seams.'},
  {t:'cyberpunk', title:'Mirrorside', seed:72027, blurb:'A city of androids and synthetics learning, badly and beautifully, to be people.',
   text:'The synthetics outnumber the born and they are learning to be people the hard way, one bad mistake at a time. Plastic gardens that never need water and never quite convince. Emotion arrives as a firmware update, half-installed, tender and glitching. Still — something real is growing in the machines, slow as rust, shy as a first bad poem. They practice smiling in the dark. They practice mercy. They almost, almost mean it.'},

  {t:'modern', title:'Cedar Falls', seed:73030, blurb:'A quiet mountain town where everyone knows your business and half of it is true.',
   text:'The diner knows your order and the whole street knows your business, half of it true. Cold river past the dead mill, autumn early and staying late, woodsmoke and wet leaves and somebody\'s radio through a screen door. Porch lights on, opinions handy. The biggest news all week is whose dog got out again. Small town, small sky, and under both a slow deep quiet that is either peace or waiting, and nobody is sure which.'},
  {t:'modern', title:'The Commons', seed:73031, blurb:'A city community garden where neighbours grow tomatoes, gossip and grudges.',
   text:'One fence, one hose, and a long generous list of grievances. Tomatoes every summer, arguments about the compost every summer, and somebody — always — plants too much zucchini. Folding chairs and raised beds and a small green democracy running on lemonade and borrowed tools. The soil does not care who is mayor. Things grow anyway. Between the bickering and the harvest, quietly, something like a neighbourhood comes up like a weed you decide to love.'},
  {t:'modern', title:'Harbor City', seed:73032, blurb:'A working waterfront of ferries, food carts, freelancers and late rent.',
   text:'Ferries, food carts, freelancers one gig from the edge. The gulls own the waterfront; the rent owns everyone else. Coffee and diesel in the morning, the whole city friendly in a hurry, generous when it counts, always halfway to somewhere else. Salt light off the grey water. The bridge hums. Promises kept the way the tide keeps them — roughly, on their own schedule, arriving whether or not you were ready to be met.'},
  {t:'modern', title:'Dust County', seed:73033, blurb:'A wide, dry stretch of highway towns, church suppers and long goodbyes.',
   text:'Long dry highway strung with small towns and longer goodbyes. Grain elevators stand like patient giants against a sky that just goes on being sky. Drive an hour for anything worth doing; the radio is static and gospel and static again. Stubborn as fenceposts, weathered twice as hard. A church supper settles a feud faster than any court. Heat shimmer. Dust devils. The road unspools ahead flat and gold and forgiving of nearly everything but leaving.'},
  {t:'modern', title:'The Allotments', seed:73034, blurb:'A drizzly row of garden plots, sheds, thermos flasks and gentle rivalry.',
   text:'A drizzle at the edge of town and a patchwork of sheds, runner beans, gentle war. Everyone with a thermos and a firm position on slugs. Prize marrows are no laughing matter. Weak tea, bad weather, the deep quiet English joy of a job done properly. Compost steams in the cold morning. Between the greenhouses something contented grows, slow and green and stubbornly hopeful, watered by grumbling and rain and the sheer bloody-minded refusal to go indoors.'},
  {t:'modern', title:'Greywater', seed:73035, blurb:'A post-industrial town finding second lives for its empty mills and old grudges.',
   text:'The town grew up around the mills and stayed on after they died. The canal is greener than a canal should ever be. Old factories are flats now, or galleries, or just brick and pigeons and rain. Proud and tired in the same breath, mending what mends, remembering the rest. Something new keeps trying to root in the cracks of something old — a shoot through the concrete, a light in a dead window, a stubborn small green rumour of after.'},
  {t:'modern', title:'Meadowbrook', seed:73036, blurb:'A cosy village of hedgerows, fêtes, footpaths and thoroughly nosy neighbours.',
   text:'Hedgerows and footpaths and a summer fête that everyone swears they are not competing in. Neighbours nosy in the caring way; the pub is the true town hall. Sundays for roasts and rambling and the long civilised silence of people who have run out of news and do not mind. Little happens. Everyone knows about it twice. Bees in the foxgloves, cake on the trestle table, and that — the village agrees — is exactly, precisely how a place ought to be.'},
 ];

 // the world sliders — id → worldParams key. Each drives generation directly.
 const SLD=['wBuildup','wFlora','wFertility','wFauna','wMonsters','wTreasure','wHue','wSat'];
 const SKEY={wBuildup:'buildup',wFlora:'flora',wFertility:'fertility',wFauna:'fauna',wMonsters:'monsters',wTreasure:'treasure',wHue:'hue',wSat:'sat'};

 let onEnter=null, theme='fantasy';
 function pickTheme(t){
  theme=t;
  [...$('wThemes').querySelectorAll('button')].forEach(b=>b.classList.toggle('on',b.dataset.t===t));
 }
 function boot(cb){
  onEnter=cb;
  [...$('wThemes').querySelectorAll('button')].forEach(b=>b.onclick=()=>{pickTheme(b.dataset.t);schedulePreview();});
  pickTheme('fantasy');
  seedLore();                       // start with a coherent lore paragraph + seed
  $('wRandomAll').onclick=()=>{randomizeAll();schedulePreview();};
  $('wEnter').onclick=enter;
  // live preview: any slider / seed change repaints the world-to-be
  for(const id of SLD){const el=$(id);if(el)el.addEventListener('input',schedulePreview);}
  const sn=$('wSeedNum');if(sn)sn.addEventListener('input',schedulePreview);
  $('boot').classList.remove('hidden');
  schedulePreview();
 }
 // ---- the lo-rez preview circle: a stylised snapshot of the world-to-be ----
 let previewRAF=null;
 function schedulePreview(){ if(previewRAF)return; previewRAF=requestAnimationFrame(()=>{previewRAF=null;renderPreview();}); }
 function pval(id){ const v=parseFloat($(id).value); return isNaN(v)?0.5:v; }
 function renderPreview(){
  const cv=$('wPreview'); if(!cv||typeof U==='undefined')return;
  const c=cv.getContext('2d'); const N=cv.width;
  const P={buildup:pval('wBuildup'),flora:pval('wFlora'),fertility:pval('wFertility'),fauna:pval('wFauna'),monsters:pval('wMonsters'),treasure:pval('wTreasure'),hue:pval('wHue'),sat:pval('wSat')};
  const seed=(parseInt($('wSeedNum').value,10)||0)>>>0;
  const rng=U.mulberry32(seed^0x9e3779b9);
  const G=9, G2=5, grid=[], grid2=[];
  for(let i=0;i<G*G;i++)grid.push(rng());
  for(let i=0;i<G2*G2;i++)grid2.push(rng());
  const samp=(gr,gs,fx,fy)=>{ const gx=fx*(gs-1),gy=fy*(gs-1),x0=gx|0,y0=gy|0,x1=Math.min(gs-1,x0+1),y1=Math.min(gs-1,y0+1),tx=gx-x0,ty=gy-y0;
   const a=gr[y0*gs+x0],b=gr[y0*gs+x1],cc=gr[y1*gs+x0],d=gr[y1*gs+x1]; return (a*(1-tx)+b*tx)*(1-ty)+(cc*(1-tx)+d*tx)*ty; };
  const hue=P.hue*360, sat=0.14+P.sat*0.62;
  const img=c.createImageData(N,N);
  const hsh=(x,y)=>{let h=(x*374761393+y*668265263+seed*0x9e3779b1)>>>0;h=(h^(h>>13))*1274126177>>>0;return (h>>>8)/16777216;};
  const green=P.fertility*0.55+P.flora*0.45;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
   const fx=x/(N-1),fy=y/(N-1);
   const n=samp(grid,G,fx,fy)*0.62+samp(grid2,G2,fx,fy)*0.38;
   const i=(y*N+x)*4; let rgb;
   if(n<0.28){ rgb=U.hslToRgb(((hue+18)%360)/360, sat*0.5, 0.15+n*0.25); }        // rock / highland
   else if(n<0.34){ rgb=U.hslToRgb(((hue+200)%360)/360, sat*0.6, 0.30); }          // a little water in the lows
   else {
    let l=0.30+n*0.14; rgb=U.hslToRgb(hue/360, sat, l);
    if(hsh(x,y) < green*0.55*(0.3+n)) rgb=U.hslToRgb(0.27+hsh(y,x)*0.05, 0.5, 0.30+hsh(x,y)*0.12);
   }
   img.data[i]=rgb[0];img.data[i+1]=rgb[1];img.data[i+2]=rgb[2];img.data[i+3]=255;
  }
  c.putImageData(img,0,0);
  // buildings cluster near the heart, scaled by buildup (towers glint at high buildup)
  const cx=N/2,cy=N/2, nb=Math.round(P.buildup*46);
  for(let k=0;k<nb;k++){ const a=rng()*6.283, rr=rng()*N*0.30, bx=(cx+Math.cos(a)*rr)|0, by=(cy+Math.sin(a)*rr)|0;
   c.fillStyle=(P.buildup>0.55&&rng()<0.4)?'#cfc6b0':'#7f6f52'; c.fillRect(bx,by,1,1+((rng()*2)|0)); }
  const scatter=(count,col)=>{ for(let k=0;k<count;k++){ const x=(rng()*N)|0,y=(rng()*N)|0; c.fillStyle=col; c.fillRect(x,y,1,1);} };
  scatter(Math.round(P.fauna*22),'#d9b06a');       // fauna
  scatter(Math.round(P.treasure*16),'#ffd24a');    // treasure glints
  scatter(Math.round(P.monsters*16),'#e0506a');    // menace
 }
 // drop a fresh lore paragraph + seed matching the chosen theme into the text field
 function seedLore(t){
  t=t||theme;
  const pool=WORLDS.filter(w=>w.t===t); const w=pool[(Math.random()*pool.length)|0]||WORLDS[0];
  $('wSeedText').value=w.text;
  $('wSeedNum').value=w.seed;
 }
 function randomizeAll(){
  const t=['fantasy','cyberpunk','modern'][(Math.random()*3)|0];
  pickTheme(t);
  seedLore(t);
  $('wSeedNum').value=(Math.random()*1e5)|0;
  // buildup skews low so most rolls are livable wilds, with the occasional metropolis
  const roll={wBuildup:Math.pow(Math.random(),1.7),wFlora:Math.random(),wFertility:Math.random(),
   wFauna:Math.random(),wMonsters:Math.random(),wTreasure:Math.random(),wHue:Math.random(),wSat:Math.random()};
  for(const id of SLD)$(id).value=roll[id];
 }
 function collectParams(){
  const p={};
  for(const id of SLD)p[SKEY[id]]=parseFloat($(id).value);
  return p;
 }
 function enter(){
  const text=$('wSeedText').value;
  const seedNum=parseInt($('wSeedNum').value,10);
  const seed=isNaN(seedNum)?((Math.random()*1e5)|0):seedNum;
  const params=collectParams();
  Lore.train(text, seed, theme);
  Mind.seedWorld(text, seed);   // per-NPC mutating memory shares the world's substrate
  $('boot').classList.add('hidden');
  if(onEnter)onEnter({seed, theme, title:THEMES[theme].n, text, params});
 }
 return { boot, WORLDS };
})();
