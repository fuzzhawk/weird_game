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
 // Markov chain (placeholder paragraphs — paste real ones over the top).
 const WORLDS=[
  {t:'fantasy', title:'The Ashen Reach', seed:71010, blurb:'A grey kingdom of ash and old oaths, where the dead do not always stay buried.',
   text:'In the ashen reach the old kings sleep beneath grey barrows, and their oaths outlast their bones. Ravens keep the tally of the fallen. Steel remembers the hands that swung it, and the barrow-fires burn low but never out. Here a name is a debt, and the mist keeps every promise the living forget.'},
  {t:'fantasy', title:'Elderbloom', seed:71011, blurb:'An elven greenwood of singing rivers, silver boughs and slow, patient magic.',
   text:'The elderbloom wood remembers the first song, and every leaf still hums a little of it. Silver rivers braid the roots of the eldest trees, and the folk of the glade measure years in blossoms. Moonlight pools in the hollows where the deer come to drink. To walk softly here is to be remembered kindly by the green.'},
  {t:'fantasy', title:'The Sunken Crowns', seed:71012, blurb:'Drowned kingdoms beneath a warm shallow sea, their towers full of coral and ghosts.',
   text:'Once there were seven crowns, and the tide took them all. Now the drowned towers wear coral like second skins, and pale fish drift through throne rooms. Divers bring up gold and grief in equal measure. The sea keeps the old palaces the way a mouth keeps a secret, cold and close and never quite let go.'},
  {t:'fantasy', title:'Wyrmhold', seed:71013, blurb:'Deep dwarven halls and dragon-haunted peaks, where gold is prayer and fire is fate.',
   text:'Under the mountains the dwarves hammer prayers into gold, and above them the wyrms sleep on hoards older than the halls. Every forge is a small defiance of the dark. The deep roads run straight and true where the miners sing to keep the stone honest. Fire is the oldest law here, and every crown is paid for in cinders.'},
  {t:'fantasy', title:'The Thornwild', seed:71014, blurb:'A witch-haunted briar where the fae strike bargains and every path lies twice.',
   text:'In the thornwild the hedge-witches trade in true names and crooked luck. The fae keep courts in the bramble, and their bargains bite. A path here will lie to you twice before it tells the truth, and the wells give back stranger faces than they take. Mind the salt at your door, and never thank the green folk aloud.'},
  {t:'fantasy', title:'Saltmarch', seed:71015, blurb:'A raucous coast of pirate coves, sea-gods and smuggled charms in the fog.',
   text:'Saltmarch is a coast of grey fog and greyer law, where the pirate coves keep their own gods and the tide brings in charms and corpses alike. Gulls cry over the smugglers roads. The old sea-gods take their tithe in storms, and the taverns pay in rum and rumour. A ship here is a promise the horizon keeps if it feels like it.'},
  {t:'fantasy', title:'The Pale Dominion', seed:71016, blurb:'A necromancer’s realm of bone-orchards and grateful, tireless dead.',
   text:'The pale dominion tends its bone-orchards by candlelight, and the dead here are grateful for the work. Lords in ashen robes count their subjects by the graveyard. Nothing rots that has not been given leave. The living are rare and quiet, and they learn young to speak softly near the pale gates, lest the ground answer back.'},
  {t:'fantasy', title:'Emberpeak', seed:71017, blurb:'A volcanic frontier of orc war-camps, obsidian roads and ceaseless drums.',
   text:'Emberpeak smoulders under a red sky, and the orc clans keep their war-camps loud against the dark. Obsidian roads run black between the calderas. The drums never truly stop; they only change their mind. Strength is the coin here, and a scar is a signature. The mountain gives and the mountain takes, and both are honoured with fire.'},

  {t:'cyberpunk', title:'Neon Sprawl', seed:72020, blurb:'Rain, ramen and rooftop deals under a sky owned by billboards.',
   text:'The neon sprawl never sleeps and never quite wakes. Rain falls sideways past the billboards, and the ramen stalls steam in the alleys where the deals get done. Everyone owes someone. The corps own the sky and rent it back by the hour, and a good runner sells their reflexes to the highest bidder before the night is out.'},
  {t:'cyberpunk', title:'Chrome Verge', seed:72021, blurb:'A corporate arcology-state where loyalty is a subscription and eyes are cameras.',
   text:'At chrome verge the corp is mother, father and landlord, and loyalty renews monthly. The towers watch with a thousand borrowed eyes. Promotion is survival, and the atrium gardens are grown to a brand guideline. Down in the service levels the off-contract drift, selling favours and firmware, dreaming in the grey light of screens that are always on.'},
  {t:'cyberpunk', title:'The Undernet', seed:72022, blurb:'A hacker underworld of black ice, dead drops and data that bites back.',
   text:'The undernet runs below the clean city like a second nervous system. Here the deckers trade in black ice and dead drops, and the data bites back if you read it wrong. Everything is encrypted, even the friendships. A handle is worth more than a face, and the best ghosts leave no logs, only the cold suggestion that they were ever there.'},
  {t:'cyberpunk', title:'Halcyon Arcology', seed:72023, blurb:'A gleaming vertical city that promises paradise on every floor but the yours.',
   text:'Halcyon rises a mile into the smog, a single building pretending to be a city. Each floor sells the paradise of the floor above. The elevators know your credit before your name. Somewhere near the roof the shareholders breathe filtered air, and somewhere near the roots the maintenance crews keep the dream running on coffee, duct tape and quiet contempt.'},
  {t:'cyberpunk', title:'Ghostwire', seed:72024, blurb:'A haunted network where dead AIs and deader people share the same wires.',
   text:'On ghostwire the machines learned to grieve, and now the network is thick with the dead. Retired AIs drift the old channels, and sometimes a voice answers in a tone you buried years ago. The techs speak of the wire the way sailors once spoke of the sea. Nothing is ever truly deleted here; it only goes quiet, and waits, and listens.'},
  {t:'cyberpunk', title:'Saltware Docks', seed:72025, blurb:'A rusting cargo port where smugglers move chrome, chem and stranger freight.',
   text:'The saltware docks reek of brine, diesel and cheap synth. Cranes swing containers of chrome and chem and freight no one signs for. The dock gangs run the tide-tables and the bribe-tables both. Out past the breakwater the grey ships wait for dark, and a body that goes into that water comes back as a rumour, if it comes back at all.'},
  {t:'cyberpunk', title:'The Bleed', seed:72026, blurb:'A district where reality glitches, memories corrupt and the map won’t hold still.',
   text:'They call it the bleed because the world here runs like wet ink. Streets rename themselves overnight, memories corrupt like bad sectors, and the map refuses to hold still. People flicker at the edges. The locals learn to trust the glitch and distrust the calm. Reality is only the default setting, and out here the default has stopped loading.'},
  {t:'cyberpunk', title:'Mirrorside', seed:72027, blurb:'A city of androids and synthetics learning, badly and beautifully, to be people.',
   text:'On mirrorside the synthetics outnumber the born, and they are learning to be people the hard way, one mistake at a time. The androids keep gardens of plastic flowers that never need water and never quite convince. Emotion is a firmware update here. Still, something real is growing in the machines, slow as rust, tender as a first bad poem.'},

  {t:'modern', title:'Cedar Falls', seed:73030, blurb:'A quiet mountain town where everyone knows your business and half of it is true.',
   text:'Cedar falls is the kind of town where the diner knows your order and the whole street knows your business, half of it true. The river runs cold past the old mill. Autumn comes early and stays late. Folks here keep their porch lights on and their opinions handy, and the biggest news all week is usually whose dog got out again.'},
  {t:'modern', title:'The Commons', seed:73031, blurb:'A city community garden where neighbours grow tomatoes, gossip and grudges.',
   text:'Down at the commons the neighbours share a fence, a hose and a long list of grievances. The tomatoes come up every summer and so do the arguments about the compost. Someone always plants too much zucchini. Between the raised beds and the folding chairs a small green democracy runs on lemonade, borrowed tools and the quiet pride of a good harvest.'},
  {t:'modern', title:'Harbor City', seed:73032, blurb:'A working waterfront of ferries, food carts, freelancers and late rent.',
   text:'Harbor city runs on ferries, food carts and freelancers one gig from the edge. The gulls own the waterfront and the rent owns everyone else. Mornings smell of coffee and diesel. People here are friendly in a hurry, generous when it counts, and always halfway to somewhere. The city keeps its promises the way the tide does, roughly and on its own schedule.'},
  {t:'modern', title:'Dust County', seed:73033, blurb:'A wide, dry stretch of highway towns, church suppers and long goodbyes.',
   text:'Dust county is a long dry highway strung with small towns and long goodbyes. The grain elevators stand like patient giants. Everyone drives an hour for anything worth doing, and the radio is mostly static and gospel. Folks here are stubborn as fenceposts and twice as weathered, and a church supper can settle a feud faster than any court in the state.'},
  {t:'modern', title:'The Allotments', seed:73034, blurb:'A drizzly row of garden plots, sheds, thermos flasks and gentle rivalry.',
   text:'The allotments sit in a drizzle at the edge of town, a patchwork of sheds and runner beans and gentle rivalry. Everyone has a thermos and an opinion about slugs. Prize marrows are a serious matter here. Between the compost heaps and the greenhouses a quiet contentment grows, watered by weak tea, bad weather and the deep English pleasure of a job done properly.'},
  {t:'modern', title:'Greywater', seed:73035, blurb:'A post-industrial town finding second lives for its empty mills and old grudges.',
   text:'Greywater grew up around the mills and stayed on after they closed. The canal is greener than it should be. The old factories are flats now, or galleries, or just brick and pigeons. People here are proud and tired in equal measure, mending what they can and remembering the rest. Something new keeps trying to grow in the cracks of something old.'},
  {t:'modern', title:'Meadowbrook', seed:73036, blurb:'A cosy village of hedgerows, fêtes, footpaths and thoroughly nosy neighbours.',
   text:'Meadowbrook is all hedgerows and footpaths and the summer fête that everyone pretends not to compete in. The neighbours are nosy in the caring way and the pub is the true town hall. Sundays are for roasts and rambling. Little happens here and everyone knows about it twice, and that, the villagers agree, is exactly how a place ought to be.'},
 ];

 let onEnter=null, sel=null;
 function boot(cb){
  onEnter=cb;
  const grid=$('wgrid');
  grid.innerHTML='';
  WORLDS.forEach((w,i)=>{
   const th=THEMES[w.t];
   const card=document.createElement('button');
   card.className='wcard'; card.dataset.i=i;
   card.innerHTML='<span class="wchip" style="color:'+th.c+';border-color:'+th.c+'44">'+th.g+' '+th.n+'</span>'
    +'<div class="wtitle">'+w.title+'</div><div class="wblurb">'+w.blurb+'</div>';
   card.onclick=()=>select(i);
   grid.appendChild(card);
  });
  $('wRandom').onclick=()=>select((Math.random()*WORLDS.length)|0);
  $('wEnter').onclick=enter;
  $('wSheetBack').onclick=()=>$('wsheet').classList.remove('open');
  $('boot').classList.remove('hidden');
 }
 function select(i){
  sel=i; const w=WORLDS[i], th=THEMES[w.t];
  [...document.querySelectorAll('.wcard')].forEach(c=>c.classList.toggle('on',+c.dataset.i===i));
  $('wSheetTitle').textContent=w.title;
  $('wSheetTheme').textContent=th.g+' '+th.n;
  $('wSheetTheme').style.color=th.c;
  $('wSeedText').value=w.text;
  $('wSeedNum').value=w.seed;
  $('wsheet').classList.add('open');
  $('wsheet').scrollIntoView&&$('wsheet').scrollIntoView({behavior:'smooth',block:'nearest'});
 }
 function enter(){
  if(sel==null)return;
  const w=WORLDS[sel];
  const text=$('wSeedText').value;
  const seedNum=parseInt($('wSeedNum').value,10);
  const seed=isNaN(seedNum)?w.seed:seedNum;
  Lore.train(text, seed, w.t);
  Mind.seedWorld(text, seed);   // per-NPC mutating memory shares the world's substrate
  $('boot').classList.add('hidden');
  if(onEnter)onEnter({seed, theme:w.t, title:w.title, text});
 }
 return { boot, WORLDS };
})();
