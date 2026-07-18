'use strict';
/* ============================================================
   SEED & SAGE — surface.js
   The surface garden: a living settlement sim (adapted from
   Hollowlight) rethemed as a strange philosophical world of
   plants and profundity. The player walks it as the wandering
   Sage; Understory mouths lead down into action dungeons.
   ============================================================ */
const Surface = (function(){
const $=id=>document.getElementById(id);
let seed=(Math.random()*2**31)|0;
let rng=U.mulberry32(seed);
const R=()=>rng(), rf=(a,b)=>a+R()*(b-a), ri=(a,b)=>Math.floor(rf(a,b+1)), pick=a=>a[Math.floor(R()*a.length)], chance=p=>R()<p;
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(R()*(i+1));const t=a[i];a[i]=a[j];a[j]=t}return a}
const clamp=U.clamp;
const dist2=(ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy};
const hash2=(x,y)=>{let h=(x*73856093)^(y*19349663);h=Math.imul(h^(h>>>13),0x5bd1e995);return((h^(h>>>15))>>>0)/4294967296};
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

/* ================= config ================= */
const W=112,H=112,TILE=16,DAY=1440,RATE=12,WALK=2.15;
const SPEEDS=[0,1,16,500];
const COST={shelter:{wood:5},home:{wood:10,stone:6},biz:{wood:12,stone:8},
 apartment:{wood:22,stone:16},warehouse:{wood:20,stone:14},park:{wood:8,stone:2},
 venue:{wood:26,stone:20},factory:{wood:24,stone:24},highrise:{wood:42,stone:44}};
const NEED={shelter:50,home:130,biz:150,apartment:260,warehouse:210,park:110,venue:320,factory:340,highrise:560};
const SZ={shelter:[1,1],home:[2,2],biz:[2,2],grave:[1,1],apartment:[2,3],warehouse:[3,2],park:[3,3],venue:[3,3],factory:[3,3],highrise:[3,3]};
// as a settlement grows it unlocks grander builds. cat drives who tends it (so it
// knows when to fall to ruin), cap = households it holds, stories = drawn height.
const BMETA={
 shelter:{cat:'house',cap:1,stories:1,minDev:0},
 home:{cat:'house',cap:1,stories:1,minDev:0},
 biz:{cat:'shop',cap:0,stories:1,minDev:0},
 apartment:{cat:'house',cap:4,stories:2,minDev:1,label:'tenement'},
 warehouse:{cat:'civic',cap:0,stories:1,minDev:1,label:'warehouse'},
 park:{cat:'park',cap:0,stories:0,solid:false,minDev:1,label:'green'},
 venue:{cat:'civic',cap:0,stories:2,minDev:2,label:'meeting hall'},
 factory:{cat:'civic',cap:0,stories:1,minDev:2,label:'manufactory'},
 highrise:{cat:'house',cap:9,stories:5,minDev:3,label:'tower'},
 grave:{cat:'grave',cap:0,stories:0,minDev:0},
};
function bcap(b){const m=BMETA[b.tp];return m?m.cap:0}   // unknown/graves are never homes
function bsolid(b){const m=BMETA[b.tp];return m?m.solid!==false:true}
const RUIN_DELAY=6*DAY,CRUMBLE_DELAY=10*DAY;
// graves settle, then the ground gives them back as flowers: the stone sinks and
// blooms take over, the tile is freed, and the turned earth is left richer.
const GRAVE_LIFE=16*DAY, GRAVE_BLOOM_GROW=4*DAY, GRAVE_BLOOM_LIFE=30*DAY, GRAVE_BLOOM_FADE=6*DAY;
let graveBlooms=[];
let carrion=[];            // kills left on the ground for scavengers
let companion=null;        // the Sage's befriended critter
let merchant=null;         // the travelling caravan, when in town
let shrines=[];            // shrines a grateful town raises to the Sage
// world-generation knobs the loading-screen randomizer sets (each 0..1; -1 = auto).
// 0.5 reproduces the classic feel; the multiplier maps 0.5 → 1× so mid = default.
let worldParams={buildup:0,flora:.5,fertility:.5,fauna:.5,monsters:.5,treasure:.5,hue:-1,sat:-1};
function wpMul(k){const v=worldParams&&worldParams[k]!=null?worldParams[k]:.5;return 0.25+v*1.5}   // 0→.25, .5→1, 1→1.75
const VILLAGE_MIN=4;
const WALL_STONE=0;
const FARM_RIPEN=1.4*DAY;
const S_ROCK=0,S_HOUSE=1,S_WALL=2,S_RUIN=3,S_FLOOR=4;
// monsters that crawl up out of the Understories
const MONSTERS={
 grub:{n:"wire-root grub",g:"🐛",hp:24,dmg:4,spd:.82,col:'#8fa85a',cf:'slime',rare:0},
 lurker:{n:'chrome creeper',g:'🦂',hp:50,dmg:10,spd:.95,col:'#b0623a',cf:'wisp',rare:.4},
 horror:{n:'understory daemon',g:'👹',hp:100,dmg:18,spd:.8,col:'#a23a5a',cf:'brute',rare:.75}
};

/* ================= state ================= */
let map,bld,nodeAt,nodes,openTiles,openChunks;
let terTier=null;          // 0 open · 1 weak upland · 2 hard highland (destroyable-terrain tiers)
let struct,farmGrid,farmTimer;
let farmTiles=new Set();
let region,regionsDirty=true;
let people=[],allById=new Map(),buildings=[];
let dungeons=[],expeditions=[],monsters=[],villages=[],animals=[],flyers=[],camps=[],quests=[];
let flockSeq=1;
let civFallen=false,expeditionDay=0;   // settlements can die out; an expedition reseeds a new town
let simMin=0,dayMark=1,speedIdx=1,nextId=1;
let cam={x:W*TILE/2,y:H*TILE/2,z:1.4};
let selected=null,follow=false,cine=false;
let interior=null,enterTarget=null;   // house interiors: bigger on the inside
let chron=[];
let terrainDirty=true,modTiles=new Set();
let pavedTiles=new Set();          // tidied stone lanes the village lays between buildings
let peaceful=false;               // editor toggle: the garden holds its breath
let lastInspect=null;             // {type,obj} — what the editor may rewrite
let onEnterDungeon=null;          // set by main.js
let inDialog=false;
const idx=(x,y)=>y*W+x;
const inB=(x,y)=>x>=0&&y>=0&&x<W&&y<H;
const walkable=(x,y)=>inB(x,y)&&map[idx(x,y)]===0&&(!water||water[idx(x,y)]!==2);
const cday=()=>Math.floor(simMin/DAY)+1;
const tod=()=>(simMin%DAY)/DAY;
const isNight=()=>{const t=tod();return t<0.24||t>0.87};
function phase(){const t=tod();return t<0.24?'Night':t<0.32?'Dawn':t<0.48?'Morning':t<0.58?'Midday':t<0.76?'Afternoon':t<0.87?'Dusk':'Night'}

/* ================= the wandering Sage (the player) ================= */
const hero={x:0,y:0,face:0,dir:0,anim:'walk',animClock:0,atkClock:0,atkT:0,moving:false,
  ifr:0,down:false,downT:0,sprite:null,spawnX:0,spawnY:0,hurtFlash:0,get relics(){return Hero.relics}};
let salvage=[];   // surface tech-salvage caches the Sage can pick up for a relic
const HERO_T={isHero:true,get x(){return hero.x},get y(){return hero.y},get dead(){return hero.down}};
function heroTargetable(){return !hero.down&&speedIdx<=1}
let heroSlashes=[],heroSlashCd=0;
let heroStam=100; const HERO_STAM_MAX=100;   // dash & spin draw on stamina
let heroDash=null, dashCd=0;                  // active dodge-roll + its cooldown
let charging=false, chargeT=0;                // holding the spin button to charge
// mining: per-tile accumulated damage on bramble-rock, debris particles, and the
// stone the Sage has hauled out of the terrain
let rockDmg=null, particles=[], heroStone=0, heroGold=0, heroGems=0;
const HERO_SPEED=132, HERO_RANGE=56, HERO_ARC=Math.PI*0.85;

/* ================= terrain editing ================= */
function markMod(i){modTiles.add(i);terrainDirty=true;regionsDirty=true;silDirty=true}
function setSolid(x,y,type){const i=idx(x,y);map[i]=1;struct[i]=type;farmGrid[i]=0;pavedTiles.delete(i);markMod(i)}
function carveFloor(x,y){const i=idx(x,y);map[i]=0;struct[i]=S_FLOOR;if(terTier)terTier[i]=0;markMod(i)}
function revertTile(x,y){const i=idx(x,y);map[i]=0;struct[i]=S_ROCK;farmGrid[i]=0;pavedTiles.delete(i);markMod(i)}
function computeRegions(){
 if(!region)region=new Int32Array(W*H);
 region.fill(-1);
 const q=new Int32Array(W*H);let rid=0;
 for(let i=0;i<W*H;i++){
  if(map[i]||region[i]>=0)continue;
  let head=0,tail=0;q[tail++]=i;region[i]=rid;
  while(head<tail){
   const c=q[head++],cx=c%W,cy=(c/W)|0;
   const nb=[c-1,c+1,c-W,c+W],ok=[cx>0,cx<W-1,cy>0,cy<H-1];
   for(let k=0;k<4;k++)if(ok[k]&&!map[nb[k]]&&region[nb[k]]<0){region[nb[k]]=rid;q[tail++]=nb[k]}
  }
  rid++;
 }
 regionsDirty=false;
}
function reachable(ax,ay,bx,by){
 if(regionsDirty)computeRegions();
 const ra=region[idx(ax,ay)],rb=region[idx(bx,by)];
 return ra>=0&&ra===rb;
}
function shoveOccupants(x,y){
 for(const p of people){
  if(p.dead||p.inDungeon)continue;
  if(((p.x/TILE)|0)===x&&((p.y/TILE)|0)===y){
   const n=nearOpen(x,y);if(n){p.x=n[0]*TILE+TILE/2;p.y=n[1]*TILE+TILE/2;p.path=null;p.task=null}
  }
 }
}

/* ================= names ================= */
const NAMES=['Wren','Bramble','Sorrel','Fen','Mab','Orla','Perrin','Rue','Tamsin','Ulric','Vesper','Yarrow','Zephyr','Cassia','Dovan','Elowen','Fable','Garnet','Hollis','Isolde','Juniper','Kestrel','Lark','Merrit','Nix','Oleander','Pip','Quill','Rowan','Sable','Thistle','Una','Violet','Willem','Alder','Briar','Cinder','Damson','Ember','Fern','Gale','Hazel','Ivo','Jessamine','Kit','Linden','Moss','Nettle','Onyx','Poppy','Reed','Saffron','Tansy','Umber','Vale','Wisteria','Ash','Birch','Clover','Dunn','Edda','Flint','Gorse','Heath','Iris','Jasper','Knox','Loam','Marlow','North','Opal','Petra','Quince','Rye','Slate','Teal','Ursa','Vann','Wick','Yew','Zora','Bryn','Cove','Dell','Eyre','Frost','Glen','Hale','Ida','Jute','Kell','Lune','Mira','Noor','Osier','Pike','Ren','Sunna','Tor','Verne','Wilde'];
let usedNames=new Set(),usedBiz=new Set(),usedDun=new Set(),usedVil=new Set();
function makeName(){let tries=0;while(tries++<80){const n=(Lore.active&&Lore.name(4,10))||pick(NAMES);if(!usedNames.has(n)){usedNames.add(n);return n}}const n=pick(NAMES)+' '+pick(['II','III','the Younger','the Second']);usedNames.add(n);return n}

/* ================= traits & goals ================= */
const TRAITS={
 unlucky:{a:'unlucky',luck:-.35},
 lucky:{a:'lucky',luck:.3},
 creative:{a:'creative',work:.15,charm:.1},
 passionate:{a:'passionate',romance:.35,social:.1},
 kind:{a:'kind',social:.25,charm:.15},
 grumpy:{a:'grumpy',social:-.3},
 brave:{a:'brave',luck:.05,work:.1},
 timid:{a:'timid',social:-.15,romance:-.15},
 ambitious:{a:'ambitious',work:.3,social:-.05},
 lazy:{a:'lazy',work:-.3},
 curious:{a:'curious',luck:.05},
 loyal:{a:'loyal',social:.15},
 jealous:{a:'jealous',social:-.2,romance:.05},
 cheerful:{a:'cheerful',social:.3,charm:.1},
 gloomy:{a:'gloomy',social:-.2,charm:-.05},
 charming:{a:'charming',charm:.35,romance:.2},
 awkward:{a:'awkward',charm:-.25},
 hardworking:{a:'hardworking',work:.35},
 dreamer:{a:'a dreamer',work:-.1,romance:.1,luck:.05},
 stubborn:{a:'stubborn',social:-.1},
 commanding:{a:'commanding',social:.2,charm:.1,work:.1},   // a natural leader
 rebellious:{a:'rebellious',social:-.05,work:.05},         // a firebrand who dissents
 // futuristic traits — these only awaken as a settlement grows into a city and its
 // people start jacking into the old buried net (see techAwaken)
 wired:{a:'wired',work:.2,social:-.05,tech:1},             // plugged into the deep net
 augmented:{a:'augmented',work:.25,luck:.1,tech:1},        // chrome-and-graft enhancements
 inventive:{a:'inventive',work:.2,charm:.1,tech:1},        // a tinkerer of new machines
 synthetic:{a:'synthetic',work:.15,romance:-.08,social:.05,tech:1} // half-machine calm
};
const TECH_TRAITS=['wired','augmented','inventive','synthetic'];
function isTech(p){return p.traits.some(t=>t==='wired'||t==='augmented'||t==='inventive'||t==='synthetic')}
const TKEYS=Object.keys(TRAITS).filter(k=>!TECH_TRAITS.includes(k));   // tech traits aren't rolled at birth
// how much a person is looked to as a leader — drives who runs a village and who
// splinters off to found their own
const LEAD_W={commanding:1.0,ambitious:.55,charming:.45,brave:.35,kind:.3,cheerful:.25,hardworking:.2,loyal:.15,creative:.1,rebellious:.12,timid:-.4,awkward:-.35,gloomy:-.25,lazy:-.2};
function leadership(p){
 if(!p||p.dead)return 0;
 let s=0.2;
 for(const t of p.traits)s+=(LEAD_W[t]||0);
 s+=Math.min(0.3,Math.max(0,(p.age-24)/120));      // experience of years
 s+=(p.relics?p.relics.length*0.05:0);              // relics lend authority
 s+=mod(p,'charm')*0.3;
 return s;
}
const MODKEYS=['luck','social','work','romance','charm'];
const CLASH=[['grumpy','cheerful'],['ambitious','lazy'],['timid','brave'],['gloomy','cheerful'],['jealous','charming'],['awkward','charming'],['stubborn','stubborn'],['grumpy','dreamer']];
const KIN=[['creative','dreamer'],['kind','loyal'],['ambitious','hardworking'],['curious','brave'],['cheerful','kind'],['passionate','creative'],['gloomy','gloomy'],['curious','dreamer']];
const GOALS={
 love:{t:'to find true love'},
 family:{t:'to raise a small loud houseful'},
 craft:{t:'to open a beloved little shop'},
 wander:{t:'to stand in every corner of the garden'},
 fellows:{t:'to be rich in friendships'},
 quiet:{t:'to grow old beside a warm kettle'},
 // dreams the growing city gives rise to
 invent:{t:'to build a machine the garden has never dreamed'},
 fame:{t:'to be known in every quarter of the city'},
 ascend:{t:'to rise to the top of the tower'}
};
function pickGoal(p){
 const w=[];
 const has=t=>p.traits.includes(t);
 if(has('passionate')||has('charming')||has('dreamer'))w.push('love','love');
 if(has('kind')||has('loyal'))w.push('family','family');
 if(has('ambitious')||has('creative')||has('hardworking'))w.push('craft','craft');
 if(has('curious')||has('brave'))w.push('wander','wander');
 if(has('cheerful'))w.push('fellows','fellows');
 // the wired dream of what they can build; the augmented of rising above
 if(has('inventive')||has('wired'))w.push('invent','invent');
 if(has('augmented')||has('ambitious'))w.push('ascend');
 w.push('quiet','love','fellows');
 const k=pick(w);
 return{k,t:GOALS[k].t,done:false};
}
function traitPhrase(p){return p.traits.map(t=>TRAITS[t].a).join(' and ')}
function applyTrait(p,t,s){const tr=TRAITS[t];for(const k of MODKEYS)if(tr[k])p.base[k]+=tr[k]*s}

/* ================= the Garden's cards (tarot of the compost) ================= */
const TAROT=[
 {n:'The Fool',g:'🃏',line:'A leap into the unmown.',fx:p=>{p.farUntil=simMin+2*DAY;buff(p,'luck',.05,2,'Fool');tale([p],p.name+' felt the pull of the far hedgerows, and followed it.')}},
 {n:'The Magician',g:'✨',line:'Skill sparks at their fingertips.',fx:p=>{buff(p,'work',.35,10,'Magician');tale([p],'For a while, everything '+p.name+' touched seemed to build itself.')}},
 {n:'The High Priestess',g:'🌙',line:'They begin to hear the slow green quiet.',fx:p=>{p.base.luck+=.08;tale([p],p.name+' learned to listen before stepping. The garden rewards that.')}},
 {n:'The Empress',g:'🌾',line:'Abundance follows their hands.',fx:p=>{buff(p,'fert',.6,15,'Empress');buff(p,'work',.15,15,'Empress');tale([p],'Everything near '+p.name+' seemed to ripen and multiply.')}},
 {n:'The Emperor',g:'👑',line:'A will to build something lasting.',fx:p=>{buff(p,'work',.25,15,'Emperor');p.wantsBiz=true;tale([p],p.name+' began sketching plans in the loam — something permanent, something theirs.')}},
 {n:'The Hierophant',g:'🕯',line:'Old rites call for vows.',fx:p=>{if(p.partner&&!p.married){p.wedSoon=true;tale([p],p.name+' resolved to make it official.')}else{buff(p,'romance',.2,10,'Hierophant')}}},
 {n:'The Lovers',g:'💞',line:'The heart will not be ignored.',major:true,fx:p=>{buff(p,'romance',.6,12,'Lovers');if(p.courting){const o=allById.get(p.courting);if(o&&!o.dead)becomePartners(p,o)}}},
 {n:'The Chariot',g:'🐎',line:'Momentum, momentum.',fx:p=>{buff(p,'speed',.45,8,'Chariot');buff(p,'work',.1,8,'Chariot')}},
 {n:'Strength',g:'🦁',line:'Gentle power, firmly held.',fx:p=>{buff(p,'charm',.15,10,'Strength');const[o]=worstRel(p);if(o)healRel(p,o,25)}},
 {n:'The Hermit',g:'🏮',line:'The lantern turns inward.',fx:p=>{p.hermitUntil=simMin+5*DAY;p.farUntil=simMin+5*DAY;tale([p],p.name+' packed a small bag and walked toward the wild edges, alone.')}},
 {n:'Wheel of Fortune',g:'🎡',line:'The wheel turns; hold on.',major:true,fx:p=>{if(chance(.5+mod(p,'luck')*.5)){p.inv.food+=6;p.inv.wood+=6;p.inv.stone+=4;tale([p],p.name+' stumbled on a forgotten cache — fruit, cut cane, good stone, all theirs.',true)}else{p.inv.food=Math.floor(p.inv.food/2);p.inv.wood=Math.floor(p.inv.wood/2);if(p.home&&p.home.stock)p.home.stock.food=Math.floor(p.home.stock.food/2);tale([p],'Fortune turned on '+p.name+' — stores spoiled, tools lost, luck spent.',true)}}},
 {n:'Justice',g:'⚖️',line:'The scales settle old accounts.',fx:p=>{const en=knownRels(p).filter(([o,r])=>r.a<=-25),fr=knownRels(p).filter(([o,r])=>r.a>=30);if(en.length>fr.length){for(const[o]of en)healRel(p,o,30);tale([p],'Old debts around '+p.name+' were quietly settled.')}else{for(const[o]of fr)healRel(p,o,10)}}},
 {n:'The Hanged Man',g:'🙃',line:'Seen upside down, it all makes sense.',fx:p=>{buff(p,'work',-.25,4,'Hanged Man');p.base.luck+=.05;tale([p],p.name+' spent long hours doing nothing at all, and came back wiser for it.')}},
 {n:'Death',g:'🦋',line:'Something old must end.',major:true,fx:p=>{rerollTrait(p);if(p.age>p.lifespan-6&&chance(.4)){p.doom=cday()+ri(3,8)}}},
 {n:'Temperance',g:'🕊',line:'Everything in balance.',fx:p=>{p.gloomUntil=0;for(const[o]of knownRels(p))healRel(p,o,8)}},
 {n:'The Devil',g:'😈',line:'A grudge takes root.',major:true,fx:p=>{const c=knownRels(p).filter(([o,r])=>!isFamily(p,o)&&p.partner!==o.id);if(c.length){const[o]=pick(c);applyAff(p,o,-55);applyAff(o,p,-55);tale([p,o],'A bitter grudge took root between '+p.name+' and '+o.name+', and neither could quite say why.',true)}}},
 {n:'The Tower',g:'🌩',line:'What was built comes down.',major:true,fx:p=>{if(p.home&&!p.home.gone){const tp=p.home.tp;demolish(p.home);p.energy=Math.min(p.energy,15);p.gloomUntil=simMin+4*DAY;tale([p],'The Tower! A storm-felled bough took '+p.name+"'s "+tp+' down to splinters.',true)}else{p.inv={food:0,wood:0,stone:0};p.energy=10;p.gloomUntil=simMin+3*DAY;tale([p],'A bank of earth gave way under '+p.name+'. They crawled out with nothing but bruises.',true)}}},
 {n:'The Star',g:'⭐',line:'A small light, enough.',fx:p=>{p.gloomUntil=0;buff(p,'luck',.25,12,'Star');const[o]=worstRel(p);if(o)healRel(p,o,30);tale([p],'Something eased in '+p.name+'. The dark felt less heavy.')}},
 {n:'The Moon',g:'🌕',line:'Nothing is quite where it was.',fx:p=>{p.lostUntil=simMin+3*DAY;buff(p,'luck',-.1,3,'Moon');tale([p],p.name+' kept taking wrong turns on paths they knew by heart.')}},
 {n:'The Sun',g:'☀️',line:'Days feel golden.',fx:p=>{buff(p,'social',.3,10,'Sun');buff(p,'luck',.2,10,'Sun')}},
 {n:'Judgement',g:'📯',line:'A reckoning, and a hand extended.',major:true,fx:p=>{const[o,r]=worstRel(p);if(o&&r.a<-20){r.a=10;relOf(o,p).a=10;tale([p,o],p.name+' and '+o.name+' buried the hatchet at last — beneath the old sundial, where such things go.',true)}}},
 {n:'The World',g:'🌍',line:'The whole of a life, aligned.',fx:p=>{buff(p,'luck',.2,10,'World');p.inv.wood+=4;p.inv.stone+=3;tale([p],p.name+' felt, for one long moment, that everything was exactly where it should be.')}}
];
let deck=[];
function drawCard(p,occasion){
 if(!deck.length)deck=shuffle(TAROT.map((c,i)=>i));
 const ci=deck.pop(),c=TAROT[ci];
 p.cards.push({i:ci,d:cday()});
 emote(p,'🎴');
 tale([p],'🎴 '+(occasion||'The garden stirred, and')+' dealt '+p.name+' '+c.n+'. '+c.line,!!c.major);
 c.fx(p);
}

/* ================= story, toasts, buffs ================= */
function tale(ps,text,major){
 const d=cday(),pid=ps.length?ps[0].id:0;
 chron.push({d,text,major:!!major,pid});
 if(chron.length>700)chron.splice(0,chron.length-700);
 if(!$('logPanel').classList.contains('hidden'))prependChron({d,text,major});
 for(const p of ps){
  p.story.push({d,text,major:!!major});
  if(p.story.length>280)p.story.splice(0,p.story.length-280);
  if(p===selected&&!$('charPanel').classList.contains('hidden'))prependStory({d,text,major});
 }
 if(major&&ps.includes(selected))toast(text);
}
function toast(text,cls){
 const t=document.createElement('div');t.className='toast'+(cls?' '+cls:'');t.textContent=text;
 const box=$('toasts');box.appendChild(t);
 while(box.children.length>4)box.removeChild(box.firstChild);
 setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .6s'},4200);
 setTimeout(()=>{if(t.parentNode)t.parentNode.removeChild(t)},5000);
}
function emote(p,g){p.em={g,until:performance.now()+2200}}
function buff(p,k,v,days,tag){p.buffs.push({k,v,until:simMin+days*DAY,tag})}
function mod(p,k){let v=p.base[k]||0;for(const b of p.buffs)if(b.k===k&&b.until>simMin)v+=b.v;return v}
function pruneBuffs(p){p.buffs=p.buffs.filter(b=>b.until>simMin)}

/* ================= relationships helpers ================= */
function relOf(p,o){let r=p.rel[o.id];if(!r){r=p.rel[o.id]={a:0,met:false,cN:0}}return r}
function knownRels(p){const out=[];for(const id in p.rel){const o=allById.get(+id);if(o&&!o.dead&&p.rel[id].met)out.push([o,p.rel[id]])}return out}
function worstRel(p){let bo=null,br=null;for(const[o,r]of knownRels(p))if(!br||r.a<br.a){bo=o;br=r}return[bo,br]}
function healRel(p,o,amt){applyAff(p,o,amt);applyAff(o,p,amt)}
function isFamily(p,o){
 if(p.parents.includes(o.id)||o.parents.includes(p.id))return true;
 for(const pa of p.parents)if(o.parents.includes(pa))return true;
 return false;
}
function relLabel(p,o){
 if(p.partner===o.id)return p.married?'💍 spouse':'💞 partner';
 if(p.courting===o.id)return '💕 courting';
 if(p.parents.includes(o.id))return '👪 parent';
 if(o.parents.includes(p.id))return '👪 child';
 if(isFamily(p,o))return '👪 sibling';
 const r=p.rel[o.id];if(!r||!r.met)return '· stranger';
 if(r.a>=70)return '💛 close friend';
 if(r.a>=30)return '🤝 friend';
 if(r.a<=-65)return '⚔️ enemy';
 if(r.a<=-25)return '😠 rival';
 return '· acquaintance';
}
let pairLog=new Set();
function applyAff(p,o,d){
 const before=relLabel(p,o);
 const r=relOf(p,o);r.a=clamp(r.a+d,-100,100);
 const after=relLabel(p,o);
 if(before!==after&&!isFamily(p,o)&&p.partner!==o.id&&p.courting!==o.id){
  const key=Math.min(p.id,o.id)+'-'+Math.max(p.id,o.id)+'-'+after;
  if(pairLog.has(key))return;
  pairLog.add(key);
  if(after==='🤝 friend'&&d>0)tale([p,o],p.name+' and '+o.name+' became friends over '+pick(['shared thoughtfruit','a long walk','tall tales','a leaking roof','a joke that would not die','an argument about turnips neither wanted to win'])+'.');
  else if(after==='💛 close friend'&&d>0)tale([p,o],p.name+' and '+o.name+' grew as close as kin.');
  else if(after==='😠 rival'&&d<0)tale([p,o],p.name+' and '+o.name+' began to grate on one another.');
  else if(after==='⚔️ enemy'&&d<0)tale([p,o],'Bad blood turned to worse: '+p.name+' and '+o.name+' are now enemies.',true);
 }
}

/* ================= flora (Plant Forge sprites) ================= */
let flora=null, floraDead=null, floraSeed='garden';
let floraSpecies=null, fert=null, farmSp=null;   // plant catalogue, soil fertility, per-farm crop
// ---- water & weather ----
// water: 0 dry · 1 stream (shallow, passable) · 2 lake (deep, impassable)
let water=null, waterMax=null, elevF=null, wetUntil=null, waterFrac=0;
// dynamic level: lakes dry up (evaporation) and refill (rain) around a global wetness
let lakeBedSorted=null, streamNorm=null, wetness=0.5, lastWetRecomp=-1;
let clouds=[], humidity=0.3, windX=1, windY=0, worldWet=0.5, weatherT=0;
const DIRS8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const MAXCLOUDS=14, RAIN_WET_DUR=140;
// baked animated water tiles (this world's palette) + timing
let waterAnim=null;
const WATER_VARIANTS=3, WATER_FRAMES=8, WATER_FRAME_MS=150;
// water & weather are muted for now (elevation + erosion still shape fertility);
// flip this back to true to bring lakes, streams, clouds and rain back.
const WATER_ON=false;
function bakeFlora(seedBase){
 floraSeed=seedBase;
 const frng=U.mulberry32(U.hashStr(seedBase)^0xF10A);
 const F={berry:[],mush:[],tree:[],decor:[]};
 // a parallel WITHERED set, dry and half-defoliated, that plants crossfade into
 // as the age turns to wasteland (and back to green as the forest returns)
 const D={berry:[],mush:[],tree:[],decor:[]};
 for(let v=0;v<3;v++){
  const s=(frng()*1e9)|0;
  F.berry.push([0,1,2].map(st=>PF.bake('bush',{bloomAmount:.9,palette:'meadow'},s,40,0.55+st*0.22)));
  F.mush.push([0,1,2].map(st=>PF.bake('mushroom',{palette:v===2?'cavernGlow':'autumn'},s+7,36,0.55+st*0.22)));
  F.tree.push([0,1,2].map(st=>PF.bake('sapling',{palette:v===1?'meadow':'forest'},s+13,72,0.62+st*0.19)));
  D.berry.push([0,1,2].map(st=>PF.bake('bush',{bloomAmount:.1,leafDensity:.35,palette:'autumn'},s,40,0.5+st*0.2)));
  D.mush.push([0,1,2].map(st=>PF.bake('mushroom',{palette:'autumn'},s+7,36,0.5+st*0.2)));
  D.tree.push([0,1,2].map(st=>PF.bake('sapling',{leafDensity:.3,palette:'autumn'},s+13,72,0.55+st*0.17)));
 }
 const kinds=['grassTuft','wildflower','fern','vine','wildflower','grassTuft','fern','wildflower'];
 const decRot=(biome?biome.plantRot:0);
 for(let i=0;i<8;i++){
  const s=(frng()*1e9)|0,ph=frng()*6.28,r=(decRot+frng()*40-20)%360;
  F.decor.push(PF.bake(kinds[i],{palette:i===3?'duskViolet':'meadow',hueRot:r},s,24,0.75+frng()*0.25,ph));
  D.decor.push(PF.bake(kinds[i],{leafDensity:.3,bloomAmount:0,palette:'autumn',hueRot:r},s,24,0.55,ph));
 }
 flora=F; floraDead=D;
 floraSpecies=makeFloraSpecies(seedBase);
}

/* ================= living ecosystem: soil, species, seeds =================
   Every world grows its own catalogue of plant SPECIES, each with a food/wood
   yield, an optional stat-boost it grants whoever eats or tends it, and growth
   traits (how fertile a soil it needs, how hardy, how fast it spreads). Some are
   useless "weeds". A per-tile FERTILITY field (procedurally eroded into valleys)
   decides what grows where; farming depletes it and fallow land heals it — so
   villages come to weed out the dross and monocrop their favourite. */
const BOOST_STATS=['work','luck','charm','social','speed','fert'];
const PLANT_PRE=['thought','vigor','dun','glim','sun','moon','bram','fen','sorrel','whisper','ember','frost','clover','marrow','gloom','honey','bitter','silver','dusk','quick','deep','wild'];
const PSUF_FOOD=['fruit','berry','root','pod','melon','grain','plum','gourd'];
const PSUF_HERB=['leaf','bloom','wort','sage','balm','petal','spice'];
const PSUF_MUSH=['cap','morel','bonnet','puff','gill','shroom'];
const PSUF_WOOD=['cane','pine','bough','ash','willow'];
const PSUF_WEED=['thistle','nettle','bane','tare','rush','burr','weed'];
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function makeFloraSpecies(seedBase){
 const rng=U.mulberry32(U.hashStr(seedBase)^0x5EED5);
 const rr=(a,b)=>a+rng()*(b-a), rint=(a,b)=>a+((rng()*(b-a+1))|0), pk=a=>a[(rng()*a.length)|0];
 const N=rint(7,9), tmpl=['food','food','herb','herb','tree'];
 while(tmpl.length<N) tmpl.push(pk(['food','herb','weed','weed','mush']));
 for(let i=tmpl.length-1;i>0;i--){const j=(rng()*(i+1))|0;[tmpl[i],tmpl[j]]=[tmpl[j],tmpl[i]];}
 const sps=[];
 for(let i=0;i<N;i++){
  const tp=tmpl[i];
  let kind,preset,cell,palette,foodYield,wood=false,weed=false,suf;
  if(tp==='tree'){ kind='tree';preset='sapling';cell=72;foodYield=rint(1,2);wood=true;palette=pk(['forest','meadow','autumn']);suf=pk(PSUF_WOOD); }
  else if(tp==='weed'){ kind=pk(['berry','mush']);preset=pk(['fern','grassTuft','cactus']);cell=kind==='mush'?36:40;foodYield=0;weed=true;palette=pk(['autumn','desert','duskViolet']);suf=pk(PSUF_WEED); }
  else if(tp==='mush'){ kind='mush';preset=pk(['mushroom','glowcap']);cell=36;foodYield=rint(1,3);palette=preset==='glowcap'?'cavernGlow':pk(['autumn','meadow']);suf=pk(PSUF_MUSH); }
  else if(tp==='herb'){ kind='berry';preset=pk(['wildflower','vine','bush']);cell=40;foodYield=rint(0,2);palette=pk(['meadow','duskViolet','forest']);suf=pk(PSUF_HERB); }
  else { kind='berry';preset='bush';cell=40;foodYield=rint(2,4);palette=pk(['meadow','forest']);suf=pk(PSUF_FOOD); }
  const boost=(!weed&&!wood&&(tp==='herb'||rng()<0.35))?{stat:pk(BOOST_STATS),v:+(0.15+rng()*0.4).toFixed(2)}:null;
  // per-species SHAPE DNA — jitter every structural knob so no two rerolls grow
  // alike; blooms and leaves pick wild forms to show off the generator
  const shapeDNA={
   height:rr(0.42,1.2), branchiness:rr(0,1), spread:rr(0.3,1.15), wobble:rr(0.05,0.95),
   droop:rr(0,0.9), thickness:rint(1,4), leafDensity:rr(0.12,1.15), leafSize:rr(0.55,1.35),
   leafShape:pk(['pointed','round','frond','heart','spike']),
   bloomType:weed?pk(['none','berry','star']):pk(['daisy','bell','berry','cap','star','orb']),
   sway:rr(0.05,1),
  };
  // colour: usually the world's own cast (with a wide jitter), but a good third of
  // species go fully wild — a wacky hue and a hyper-saturated palette
  const wildHue=rng()<0.32;
  const hueRot=wildHue ? (rng()*360)|0 : (((biome?biome.plantRot:0)+(rng()*150-75))%360);
  const palette2=rng()<0.38 ? pk(['neon','candy','inferno','ice','voidberry','acid','cavernGlow','duskViolet']) : palette;
  const bakeSet=(dead)=>{ const s=(rng()*1e9)|0;
   const ov=Object.assign({},shapeDNA, dead
    ? {palette:'autumn',bloomAmount:0.06,leafDensity:shapeDNA.leafDensity*0.4,hueRot,bloomType:'none'}
    : {palette:palette2,bloomAmount:weed?0.1:(boost?0.95:0.6),hueRot});
   return [0,1,2].map(st=>PF.bake(preset,ov,s+i*97,cell,(dead?0.5:0.55)+st*0.2)); };
  sps.push({ i, key:'sp'+i, name:cap(pk(PLANT_PRE))+suf, kind, preset, cell, palette,
   yield:foodYield, wood, weed, boost,
   fertNeed: weed?rr(0.05,0.3):rr(0.28,0.72), hardy: weed?rr(0.6,1):rr(0.1,0.6),
   spread: weed?rr(0.5,0.9):rr(0.2,0.5), ripen: rr(1.0,2.2),
   glyph: wood?'🌲':weed?'🌿':kind==='mush'?'🍄':(boost?'🌸':'🍇'),
   L:bakeSet(false), D:bakeSet(true) });
 }
 return sps;
}
// how well a species grows in soil of fertility f (hardy species tolerate poor soil)
function plantSuit(sp,f){ return clamp(1-Math.abs(f-sp.fertNeed)*(2-sp.hardy), 0, 1); }
// a village's appetite for a species: food + prized stat-boosts, weeds worthless
function speciesScore(sp){
 if(sp.weed) return -1;
 if(sp.wood) return sp.yield*0.4;
 let s=sp.yield*1.0;
 if(sp.boost) s+=3+sp.boost.v*7;
 return s*(0.7+(1-sp.fertNeed)*0.4);
}
function bestCropFor(seedStock){
 let best=null,bs=-1e9;
 for(const sp of floraSpecies){
  if(sp.weed||sp.wood)continue;
  if(seedStock && !(seedStock[sp.key]>0))continue;
  const sc=speciesScore(sp);
  if(sc>bs){bs=sc;best=sp}
 }
 return best;
}

/* ---------- fertility field: procedural elevation → moisture → soil, eroded ---------- */
function valNoise(seed){
 // smooth value noise on a coarse lattice, bilinearly upsampled to the map
 const G=12, gr=new Float32Array((G+1)*(G+1)), rng=U.mulberry32(U.hashStr('fld-'+seed+'-'+seed));
 for(let i=0;i<gr.length;i++)gr[i]=rng();
 const out=new Float32Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const gx=x/W*G, gy=y/H*G, x0=gx|0, y0=gy|0, fx=gx-x0, fy=gy-y0;
  const a=gr[y0*(G+1)+x0],b=gr[y0*(G+1)+x0+1],c=gr[(y0+1)*(G+1)+x0],d=gr[(y0+1)*(G+1)+x0+1];
  const sx=fx*fx*(3-2*fx), sy=fy*fy*(3-2*fy);
  out[idx(x,y)]=(a+(b-a)*sx)*(1-sy)+(c+(d-c)*sx)*sy;
 }
 return out;
}
// Voronoi elevation: scatter sites of random base height; within each cell the
// ground BOWLS — lowest at the site, rising toward the cell walls — so water
// pools at the sites of the low cells and drains, cell to cell, over the saddles
// between them. A couple of blur passes soften the ridges into flowing slopes.
function voronoiElev(seedN){
 const rng=U.mulberry32((seedN>>>0)^0x1CE00B);
 const N=13+((rng()*10)|0), sites=[];
 for(let i=0;i<N;i++)sites.push({x:rng()*W,y:rng()*H,h:rng()});
 const e=new Float32Array(W*H), cellR=W*0.16;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let d1=1e18,d2=1e18,h1=0;
  for(const s of sites){ const dx=x-s.x,dy=y-s.y,d=dx*dx+dy*dy; if(d<d1){d2=d1;d1=d;h1=s.h}else if(d<d2)d2=d; }
  const f1=Math.sqrt(d1);
  // base height of the owning basin + a bowl that deepens toward its site
  e[idx(x,y)] = h1*0.60 + clamp(f1/cellR,0,1)*0.40;
 }
 // smooth so the cell walls become slopes water can run down
 for(let pass=0;pass<2;pass++){
  const n=e.slice();
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
   const i=idx(x,y);
   n[i]=(e[i]*2+e[i-1]+e[i+1]+e[i-W]+e[i+W])/6;
  }
  for(let i=0;i<W*H;i++)e[i]=n[i];
 }
 return e;
}
// fractal value-noise (perlin-style fBm): several octaves of smooth lattice noise
// summed at halving amplitude → rolling highlands and lowlands across the world
function fbmElev(seedN){
 const out=new Float32Array(W*H);
 const octaves=[{G:6,a:1},{G:12,a:0.42},{G:24,a:0.16},{G:40,a:0.07}];   // tighter → more, smaller blobs
 let tot=0;
 for(const oc of octaves){
  const G=oc.G, gr=new Float32Array((G+1)*(G+1)), rng=U.mulberry32(((seedN>>>0)^((G*2654435761)>>>0))>>>0);
  for(let i=0;i<gr.length;i++)gr[i]=rng();
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const gx=x/W*G, gy=y/H*G, x0=gx|0, y0=gy|0, fx=gx-x0, fy=gy-y0;
   const a=gr[y0*(G+1)+x0],b=gr[y0*(G+1)+x0+1],c=gr[(y0+1)*(G+1)+x0],d=gr[(y0+1)*(G+1)+x0+1];
   const sx=fx*fx*(3-2*fx), sy=fy*fy*(3-2*fy);
   out[idx(x,y)]+=oc.a*((a+(b-a)*sx)*(1-sy)+(c+(d-c)*sx)*sy);
  }
  tot+=oc.a;
 }
 let mn=1e9,mx=-1e9;
 for(let i=0;i<W*H;i++){out[i]/=tot; if(out[i]<mn)mn=out[i]; if(out[i]>mx)mx=out[i];}
 const sp=(mx-mn)||1;
 for(let i=0;i<W*H;i++)out[i]=(out[i]-mn)/sp;
 return out;
}
// the world's elevation: pure perlin fBm — rolling highlands scattered as islands
// across the open lowland, each peak a hard core wrapped in a weaker slope
function genElevation(){
 elevF=fbmElev(seed*2+1);   // already normalised 0..1
 return elevF;
}
// tier the solid terrain by depth: a multi-source BFS gives each solid tile its
// chebyshev distance to the nearest open tile; tiles more than `shrink` deep form
// the HARD core (the blob eroded inward by `shrink`), the rest is the WEAK rim
function computeTerTier(shrink){
 const dist=new Int16Array(W*H).fill(-1);
 const q=new Int32Array(W*H); let head=0,tail=0;
 for(let i=0;i<W*H;i++)if(map[i]===0){dist[i]=0;q[tail++]=i;}
 while(head<tail){
  const c=q[head++], cx=c%W, cy=(c/W)|0, d=dist[c];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dy)continue;
   const nx=cx+dx, ny=cy+dy; if(nx<0||ny<0||nx>=W||ny>=H)continue;
   const j=idx(nx,ny); if(dist[j]>=0)continue;
   dist[j]=d+1; q[tail++]=j;
  }
 }
 const t=new Uint8Array(W*H);
 for(let i=0;i<W*H;i++) if(map[i]!==0) t[i]= dist[i]>shrink ? 2 : 1;
 return t;
}
function genFertility(){
 fert=new Float32Array(W*H);
 if(!elevF)elevF=fbmElev(seed*2+1); const elev=elevF, moist=valNoise(seed*7+3);
 for(let i=0;i<W*H;i++){
  // damp lowland loam is richest; dry uplands are poorer
  fert[i]=clamp((0.24 + moist[i]*0.52 + (1-elev[i])*0.30 - 0.12)*wpMul('fertility'), 0, 1);
 }
 // gentle hydraulic erosion: a little fertility creeps downhill into the valleys
 for(let pass=0;pass<2;pass++){
  const nf=fert.slice();
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
   const i=idx(x,y), e=elev[i]; let lx=x,ly=y,le=e;
   for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){ const ne=elev[idx(x+dx,y+dy)]; if(ne<le){le=ne;lx=x+dx;ly=y+dy} }
   if(lx!==x||ly!==y){ const move=fert[i]*0.08; nf[i]-=move; nf[idx(lx,ly)]+=move; }
  }
  fert=nf;
 }
 // solid bramble/rock is barren; open ground keeps its eroded soil
 for(let i=0;i<W*H;i++){ fert[i]=map[i]?clamp(fert[i]*0.4,0,1):clamp(fert[i],0,1); }
}
function fertAt(x,y){ return fert?fert[idx(x,y)]:0.5; }
function isWater(x,y){ return water?water[idx(x,y)]:0; }

/* ---------- hydrology: lakes fill the basins, streams trace the flow ---------- */
function genHydrology(){
 water=new Uint8Array(W*H); wetUntil=new Float32Array(W*H); waterFrac=0;
 if(!elevF)return;
 // world wetness: fantasy is lush and lake-strewn, the built themes run drier
 const wr=U.mulberry32((seed>>>0)^0x77A7E2);
 worldWet=clamp((0.34+wr()*0.42)*(worldTheme==='cyberpunk'?0.55:worldTheme==='modern'?0.78:1),0.1,1);
 // normalise elevation over the open ground
 let mn=1e9,mx=-1e9;
 for(let i=0;i<W*H;i++)if(map[i]===0){if(elevF[i]<mn)mn=elevF[i];if(elevF[i]>mx)mx=elevF[i];}
 const span=(mx-mn)||1, lakeLevel=mn+span*(0.10+worldWet*0.14);
 // 1) LAKES — the lowest open basins hold standing water
 for(let i=0;i<W*H;i++) if(map[i]===0 && elevF[i]<=lakeLevel) water[i]=2;
 pruneSmallWater(2,7);   // drop puddles smaller than 7 tiles
 // 2) STREAMS — flow accumulation, steepest descent, high ground to low
 const open=[]; for(let i=0;i<W*H;i++)if(map[i]===0)open.push(i);
 open.sort((a,b)=>elevF[b]-elevF[a]);
 const acc=new Float32Array(W*H); for(const i of open)acc[i]=1;
 for(const i of open){
  const x=i%W,y=(i/W)|0; let le=elevF[i],li=-1;
  for(const[dx,dy]of DIRS8){const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H)continue; const j=idx(nx,ny); if(map[j]!==0)continue; if(elevF[j]<le){le=elevF[j];li=j;}}
  if(li>=0)acc[li]+=acc[i];
 }
 const streamThresh=90-worldWet*45;   // wetter worlds → denser stream network
 for(let i=0;i<W*H;i++) if(map[i]===0 && water[i]===0 && acc[i]>=streamThresh) water[i]=1;
 // 3) riparian richness — the banks drink, so land beside water grows greener
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=idx(x,y); if(water[i]||map[i])continue;
  for(const[dx,dy]of DIRS8){const nx=x+dx,ny=y+dy; if(nx>=0&&ny>=0&&nx<W&&ny<H&&water[idx(nx,ny)]){ fert[i]=clamp(fert[i]+0.14,0,1); break; }}
 }
 // this is the MAX footprint; the live water recedes and refills within it
 waterMax=water.slice();
 const lakeBeds=[]; for(let i=0;i<W*H;i++)if(waterMax[i]===2)lakeBeds.push(elevF[i]);
 lakeBeds.sort((a,b)=>a-b); lakeBedSorted=Float32Array.from(lakeBeds);
 // rank each stream tile by height so the high reaches dry first in a drought
 const sIdx=[]; for(let i=0;i<W*H;i++)if(waterMax[i]===1)sIdx.push(i);
 sIdx.sort((a,b)=>elevF[a]-elevF[b]);
 streamNorm=new Float32Array(W*H);
 for(let k=0;k<sIdx.length;k++)streamNorm[sIdx[k]]=sIdx.length>1?k/(sIdx.length-1):0;
 wetness=worldWet; lastWetRecomp=-1;
 recomputeWater(true);
}
// set the live water footprint from the current wetness: lakes fill from their
// lowest beds up, streams flow from the low reaches up. Returns true if any
// tile changed impassability (so pathfinding needs to re-flood).
function recomputeWater(force){
 if(!waterMax)return false;
 lastWetRecomp=wetness;
 const wf=worldWet>0.05?worldWet:0.2;
 const fLake=clamp(wetness/wf,0,1);
 const surf = lakeBedSorted&&lakeBedSorted.length? lakeBedSorted[Math.min(lakeBedSorted.length-1,(fLake*(lakeBedSorted.length-1))|0)] : 1e9;
 const streamF=clamp(wetness/wf,0,1.3);
 let changed=false, n=0;
 for(let i=0;i<W*H;i++){
  const wm=waterMax[i]; if(!wm){continue;}
  let now=0;
  if(wm===2){ now = elevF[i]<=surf ? 2 : 0; }
  else { now = streamF > 0.32+streamNorm[i]*0.6 ? 1 : 0; }
  if(now!==water[i]){
   if((water[i]===2)!==(now===2))changed=true;   // lake ⇄ land flips walkability
   water[i]=now;
  }
  if(now)n++;
 }
 waterFrac=n/(W*H);
 if(changed){regionsDirty=true;}
 return changed;
}
// flood-fill water==tag, drying components smaller than minSize
function pruneSmallWater(tag,minSize){
 const seen=new Uint8Array(W*H), q=new Int32Array(W*H);
 for(let s=0;s<W*H;s++){
  if(water[s]!==tag||seen[s])continue;
  let head=0,tail=0,cnt=0; q[tail++]=s; seen[s]=1; const comp=[];
  while(head<tail){ const c=q[head++]; comp.push(c); cnt++; const cx=c%W,cy=(c/W)|0;
   for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=cx+dx,ny=cy+dy; if(nx<0||ny<0||nx>=W||ny>=H)continue; const j=idx(nx,ny); if(water[j]===tag&&!seen[j]){seen[j]=1;q[tail++]=j;}}
  }
  if(cnt<minSize)for(const c of comp)water[c]=0;
 }
}

/* ---------- weather: evaporation → clouds → rain ---------- */
function initWeather(){
 const r=U.mulberry32((seed>>>0)^0x5C10D5);
 const ang=r()*6.283; windX=Math.cos(ang); windY=Math.sin(ang);
 humidity=0.3; clouds=[]; weatherT=0;
}
function edgeUpwindSpawn(){
 // enter from the upwind side, offset along it randomly
 const cx=W/2-windX*W*0.7, cy=H/2-windY*H*0.7;
 const px=clamp(cx+(-windY)*rf(-W*0.5,W*0.5),-2,W+2);
 const py=clamp(cy+( windX)*rf(-H*0.5,H*0.5),-2,H+2);
 return [px*TILE,py*TILE];
}
function spawnCloud(mass){
 const s=edgeUpwindSpawn();
 clouds.push({x:s[0],y:s[1],vx:windX,vy:windY,mass,rain:0,drift:R()*6.28,seed:(R()*1e9)>>>0});
}
function rainOn(c,dt){
 const cx=(c.x/TILE)|0, cy=(c.y/TILE)|0, R0=4;
 for(let dy=-R0;dy<=R0;dy++)for(let dx=-R0;dx<=R0;dx++){
  if(dx*dx+dy*dy>R0*R0)continue; const x=cx+dx,y=cy+dy; if(x<0||y<0||x>=W||y>=H)continue; const i=idx(x,y);
  wetUntil[i]=simMin+RAIN_WET_DUR;
  if(fert&&map[i]===0&&!water[i]&&fert[i]<0.8) fert[i]=clamp(fert[i]+dt*0.0012,0,0.8);  // the rain nourishes
 }
 wetness=clamp(wetness+dt*0.00075,0,1.15);   // the rain runs off and refills the lakes
}
function updateCloud(c,dt){
 c.drift+=dt*0.01;
 const spd=TILE*0.02;
 c.x+=(windX+Math.cos(c.drift)*0.25)*spd*dt;
 c.y+=(windY+Math.sin(c.drift)*0.25)*spd*dt;
 const tx=clamp((c.x/TILE)|0,0,W-1), ty=clamp((c.y/TILE)|0,0,H-1);
 if(water[idx(tx,ty)]) c.mass+=dt*0.0010;        // drinks moisture crossing water
 c.mass-=dt*0.00018;
 if(c.mass>0.82){ c.rain=Math.min(1,c.rain+dt*0.05); rainOn(c,dt); c.mass-=dt*0.0016; }
 else c.rain=Math.max(0,c.rain-dt*0.04);
 if(c.x<-3*TILE||c.x>(W+3)*TILE||c.y<-3*TILE||c.y>(H+3)*TILE)c.mass=0;
}
function weatherTick(dt){
 const sun=clamp(1-nightFactor(),0,1);
 // moisture rides in on the wider climate too, so rain still comes to a parched
 // world and can refill it — droughts recede, they don't become permanent deserts
 humidity=clamp(humidity+(waterFrac*1.1+0.42)*(0.35+0.65*sun)*dt*0.0018,0,1.4);
 // the lake level BREATHES around the world's climate baseline: spring/aquifer
 // recharge pulls it up toward worldWet, hot-sun evaporation draws it down, and
 // rain (in rainOn) lifts it in visible pulses — so lakes recede in dry spells
 // and refill when the rains come, without ever collapsing to permanent desert
 wetness=clamp(wetness + (worldWet-wetness)*0.00018*dt - (0.00003+waterFrac*0.0006)*sun*dt, 0, 1.15);
 // reshape the shoreline only when the level has drifted enough (throttled)
 if(Math.abs(wetness-lastWetRecomp)>0.012) recomputeWater(false);
 if(humidity>0.55 && clouds.length<MAXCLOUDS && chance(dt*0.03*(humidity-0.5))){ spawnCloud(0.45+humidity*0.5); humidity-=0.4; }
 weatherT+=dt;
 const wa=Math.atan2(windY,windX)+Math.sin(weatherT*0.0003)*0.02;
 windX=Math.cos(wa); windY=Math.sin(wa);
 for(let i=clouds.length-1;i>=0;i--){ const c=clouds[i]; updateCloud(c,dt); if(c.mass<=0.02)clouds.splice(i,1); }
}
// how much rain is falling on a given tile right now (for the wet sheen)
function wetAt(i){ return wetUntil&&wetUntil[i]>simMin ? clamp((wetUntil[i]-simMin)/RAIN_WET_DUR,0,1) : 0; }
// pick a species suited to soil of fertility f (weeds win the poor ground)
function pickSpeciesFor(f){
 if(!floraSpecies||!floraSpecies.length)return null;
 const w=[]; let tot=0;
 for(const sp of floraSpecies){ const s=plantSuit(sp,f)*(sp.weed?0.65:1)+0.02; w.push(s); tot+=s; }
 if(tot<=0)return null;
 let r=R()*tot;
 for(let i=0;i<w.length;i++){ r-=w[i]; if(r<=0)return floraSpecies[i]; }
 return floraSpecies[floraSpecies.length-1];
}
// grow a plant of species sp at (x,y): a node carrying its kind, yield and regrow
function plantNode(x,y,sp){
 const wood=sp.wood, mx=wood?ri(3,5):ri(2,4);
 const nd={x,y,t:sp.kind,sp:sp.i,amt:mx,max:mx,rt:0,
   reg:Math.round((wood?900:460)*sp.ripen), yield:wood?'wood':'food'};
 nodes.push(nd); nodeAt.set(idx(x,y),nd);
 return nd;
}
function speciesOf(n){ return (n&&n.sp!=null&&floraSpecies)?floraSpecies[n.sp]:null; }
// tending a plant grants its stat-boost for a while and drops a seed into the
// village stock (so a town can hoard and later sow the best of what it finds)
function harvestPlant(p,sp){
 if(sp.boost) buff(p, sp.boost.stat, sp.boost.v, 1.6, 'plant-'+sp.key);
 if(p.vid){ const v=villages.find(vv=>vv.id===p.vid); if(v){ (v.seed=v.seed||{})[sp.key]=(v.seed[sp.key]||0)+1; } }
}
// the village's chosen monocrop: the most useful food/herb it has seed for,
// re-considered every few days as its seed stores and tastes shift
function cropOf(v){
 if(v._cropDay===undefined||cday()-v._cropDay>6||v.crop==null){
  let best=bestCropFor(v.seed)||bestCropFor(null);   // knows the ideal even before it has the seed
  v.crop=best?best.i:null; v._cropDay=cday();
 }
 return (v.crop!=null&&floraSpecies)?floraSpecies[v.crop]:null;
}
function cropRipen(crop,i){ const f=fert?fert[i]:0.5; return FARM_RIPEN*crop.ripen*(1.4-0.7*f); }
// slow ecology: fallow soil heals back toward a baseline, and wild plants
// self-seed into suited empty ground next to their own kind (weeds included —
// which is what gives the villagers something to weed out)
function ecologyTick(){
 if(!fert||!floraSpecies)return;
 const green=eraGreen(), canSeed=nodes.length<W*H*0.05;   // don't let the wild flora overrun
 for(let s=0;s<240;s++){
  const x=ri(1,W-2), y=ri(1,H-2), i=idx(x,y);
  if(map[i])continue;
  if(!farmGrid[i]) fert[i]=clamp(fert[i]+(0.6-fert[i])*0.02,0,1);   // wild land recovers
  if(green>0.4 && !nodeAt.has(i) && !farmGrid[i] && bld[i]<0 && struct[i]!==S_WALL && !pavedTiles.has(i) && !dungeonAt(x,y)){
   let src=null;
   for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nd=nodeAt.get(idx(x+dx,y+dy));if(nd&&nd.sp!=null){src=floraSpecies[nd.sp];break}}
   if(canSeed && src && plantSuit(src,fertAt(x,y))>0.4 && chance(src.spread*0.15)) { plantNode(x,y,src); markMod(i); }
  }
 }
}

/* ================= sprite baking (Creature Forge) ================= */
let bakeQueue=[];                       // [{kind:'person'|'hero'|'mon', ...}]
let surfMon={grub:null,lurker:null,horror:null};
function queuePersonBake(p){p.sprite=null;bakeQueue.push({kind:'person',p})}
function queueHeroBake(){hero.sprite=null;bakeQueue.push({kind:'hero'})}
function queueMonsterBakes(){surfMon={grub:null,lurker:null,horror:null};
 for(const t of ['grub','lurker','horror'])bakeQueue.push({kind:'mon',type:t});}
function surfMonsterParams(type){
 const mrng=CF.mulberry32(U.hashStr(seed+'/mon/'+type+'/'+floraSeed)^0xBEA5);
 const arch=CFHelp.ARCHETYPES[MONSTERS[type].cf](mrng);
 const hueBase={grub:100,lurker:275,horror:20}[type];
 return {...arch,
  hue:Math.round(hueBase+mrng()*40-20),sat:Math.round(30+mrng()*24),lit:Math.round(type==='horror'?36+mrng()*8:46+mrng()*12),
  hue2:Math.round(hueBase+30),accent:Math.round((hueBase+180)%360),
  seed:seed+'-'+type+'-'+floraSeed};
}
function processBakeQueue(){
 if(!bakeQueue.length)return;
 const job=bakeQueue.shift();
 try{
  if(job.kind==='person'){
   if(job.p.dead)return;
   const params=CFHelp.villagerParams(job.p.lookSeed,{elder:job.p.age>=56});
   job.p.sprite=CFHelp.bakeCreature(params,48,['walk','talk','work']);
  }else if(job.kind==='hero'){
   const hrng=CF.mulberry32(U.hashStr(Hero.lookSeed)^0xC0DE);
   const arch=CFHelp.ARCHETYPES.player(hrng);
   const params={...arch,
    hue:Math.round(hrng()*360),sat:45+Math.round(hrng()*25),lit:52+Math.round(hrng()*14),
    hue2:Math.round(hrng()*360),accent:Math.round(hrng()*360),
    hairHue:Math.round(hrng()*360),clothHue:Math.round(hrng()*360),metalHue:210,
    seed:Hero.lookSeed};
   hero.sprite=CFHelp.bakeCreature(params,48);
  }else if(job.kind==='mon'){
   const sizes={grub:48,lurker:48,horror:48};
   surfMon[job.type]=CFHelp.bakeCreature(surfMonsterParams(job.type),sizes[job.type],['walk','attack']);
  }else if(job.kind==='animal'){
   const a=job.a;if(a.dead)return;
   a.sprite=AF.bake(a.made.params,48,['walk','attack']);   // four-legged quad rig
  }else if(job.kind==='flyer'){
   const made=job.made;if(made._sprite)return;
   made._sprite=AF.bakeFlyer(made.params,48);              // shared across a flock
   made._baking=false;
  }
 }catch(e){/* a failed bake falls back to the painted sprite */}
}

/* ================= world generation ================= */
function genWorld(){
 map=new Uint8Array(W*H);bld=new Int16Array(W*H).fill(-1);
 struct=new Uint8Array(W*H);farmGrid=new Uint8Array(W*H);farmTimer=new Float32Array(W*H);farmTiles=new Set();farmSp=new Int16Array(W*H).fill(-1);
 rockDmg=new Float32Array(W*H);particles=[];heroStone=0;heroGold=0;heroGems=0;
 modTiles=new Set();pavedTiles=new Set();terrainDirty=true;regionsDirty=true;
 nodeAt=new Map();nodes=[];openTiles=[];
 people=[];allById=new Map();buildings=[];dungeons=[];expeditions=[];monsters=[];villages=[];camps=[];quests=[];trackedQuest=null;Hero.renown=0;socialLog.gift=socialLog.gossip=socialLog.mentor=socialLog.console=socialLog.rival=0;chron=[];usedNames=new Set();graveBlooms=[];carrion=[];companion=null;merchant=null;shrines=[];nextMerchantDay=2;worldEvent=null;nextEventDay=3;curSeasonIdx=-1;heroStam=100;heroDash=null;dashCd=0;charging=false;chargeT=0;
 simMin=DAY*0.30;dayMark=1;nextId=1;deck=[];selected=null;follow=false;cine=false;interior=null;enterTarget=null;civFallen=false;expeditionDay=0;pairLog=new Set();usedBiz=new Set();usedDun=new Set();usedVil=new Set();
 lastInspect=null;bakeQueue=[];heroSlashes=[];
 makeBiome();makeWorldEras();       // this world's colour identity: terrain, plants, fauna, relics
 AF.setWorld(biome.faunaShift);TF.setWorld(biome.relicRot,seed);relicIconCache.clear();
 bakeFlora('garden-'+seed);
 queueMonsterBakes();
 genElevation();        // still shapes the fertility field (verdant/barren ground)
 // terrain shape: the classic seeded cellular-automata caves — organic blobs of
 // weak terrain carved out of the open meadow.
 let g=new Uint8Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)g[idx(x,y)]=(x<2||y<2||x>=W-2||y>=H-2)?1:(R()<0.46?1:0);
 for(let it=0;it<5;it++){
  const n2=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   let n=0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;
    const nx=x+dx,ny=y+dy;
    if(nx<0||ny<0||nx>=W||ny>=H||g[idx(nx,ny)])n++;
   }
   n2[idx(x,y)]=(x<2||y<2||x>=W-2||y>=H-2)?1:(n>=5?1:(n<=3?0:g[idx(x,y)]));
  }
  g=n2;
 }
 // keep largest open region so the meadow is one connected space
 const reg=new Int32Array(W*H).fill(-1);let best=-1,bestN=0,rid=0;
 const q=new Int32Array(W*H);
 for(let i=0;i<W*H;i++){
  if(g[i]||reg[i]>=0)continue;
  let head=0,tail=0,n=0;q[tail++]=i;reg[i]=rid;
  while(head<tail){
   const c=q[head++];n++;
   const cx=c%W,cy=(c/W)|0;
   const nb=[c-1,c+1,c-W,c+W];
   const ok=[cx>0,cx<W-1,cy>0,cy<H-1];
   for(let k=0;k<4;k++)if(ok[k]&&!g[nb[k]]&&reg[nb[k]]<0){reg[nb[k]]=rid;q[tail++]=nb[k]}
  }
  if(n>bestN){bestN=n;best=rid}
  rid++;
 }
 for(let i=0;i<W*H;i++){if(!g[i]&&reg[i]!==best)g[i]=1}
 map=g;
 // the harder inner terrain is each blob's core: shrink the blobs inward by 3 tiles
 // (chebyshev distance from open ground). Tiles more than 3 deep are HARD (tier 2),
 // the outer 3-tile band stays WEAK (tier 1).
 terTier=computeTerTier(3);
 genFertility();        // fBm elevation + hydraulic erosion → the soil-fertility field
 if(WATER_ON){ genHydrology(); initWeather(); }   // lakes/streams/weather (muted for now)
 else { water=null; waterMax=null; wetUntil=null; clouds=[]; }
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(!map[idx(x,y)]&&!(water&&water[idx(x,y)]))openTiles.push([x,y]);
 openChunks=new Set();
 for(const[x,y]of openTiles)openChunks.add(((x>>3))+','+((y>>3)));
 // resource nodes — plants seed themselves where the soil suits their species;
 // rock is scattered against the bramble. Fertile ground grows more, and grows
 // the fussier (higher-yield) species; poor ground gets hardy weeds and stone.
 for(const[x,y]of openTiles){
  let nw=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&!walkable(x+dx,y+dy))nw++;
  let adj=false;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(nodeAt.has(idx(x+dx,y+dy)))adj=true;
  if(adj)continue;
  const f=fertAt(x,y), r=R();
  if(r<0.028+nw*0.004 && r>=0.010+f*0.06){ // stone favours barren, rocky edges
   const nd={x,y,t:'rock',amt:5,max:5,reg:1500,rt:0,yield:'stone'};
   nodes.push(nd);nodeAt.set(idx(x,y),nd);continue;
  }
  // a plant takes root with probability rising in fertile soil (and the flora dial)
  if(R() < (0.012+f*0.06)*wpMul('flora')){
   const sp=pickSpeciesFor(f);
   if(sp) plantNode(x,y,sp);
  }
 }
 // Understory mouths — deep places far from the centre, against the bramble
 {
  const cx=W/2,cy=H/2,want=ri(3,4);
  const cand=openTiles.filter(([x,y])=>{
   if(bld[idx(x,y)]>=0||nodeAt.has(idx(x,y)))return false;
   let wall=false;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&!walkable(x+dx,y+dy))wall=true;
   return wall&&dist2(x,y,cx,cy)>34*34;
  });
  shuffle(cand);
  const placed=[];
  for(const[x,y]of cand){
   if(dungeons.length>=want)break;
   if(placed.some(([px,py])=>dist2(x,y,px,py)<20*20))continue;
   placed.push([x,y]);
   makeDungeon(x,y);
  }
 }
 // settlers
 tale([], 'A handful of wanderers came over the hills into a garden grown up through the bones of some dead machine-age — a place that seemed, faintly, to be thinking. They decided to stay. Beneath the meadow the Understories yawned: the buried old net, humming still, thick with chrome and treasure and unfinished arguments.',true);
 for(let i=0;i<12;i++)arrive(ri(18,34));
 dayMark=cday();
 buildTerrainLayer();
 const c0=people.reduce((a,p)=>[a[0]+p.x,a[1]+p.y],[0,0]);
 cam.x=c0[0]/people.length;cam.y=c0[1]/people.length;
 // the Sage arrives at the heart of things
 {
  let bs=null,bd=1e18;
  for(const[x,y]of openTiles){
   const d=dist2(x*TILE,y*TILE,cam.x,cam.y);
   if(d<bd){bd=d;bs=[x,y]}
  }
  hero.x=hero.spawnX=bs[0]*TILE+TILE/2;
  hero.y=hero.spawnY=bs[1]*TILE+TILE/2;
  hero.down=false;hero.ifr=2;
  Hero.hp=Hero.maxHp;
  queueHeroBake();
 }
 salvage=[];
 for(let i=0;i<relicTarget();i++)spawnSalvage();
 animals=[];
 for(let i=0;i<animalTarget();i++)spawnAnimal();
 flyers=[];flockSeq=1;
 for(let i=0;i<3;i++)spawnFlock();
 for(let i=0;i<4;i++)spawnFlyer();
 if(worldParams.buildup>0)seedCity(worldParams.buildup);
 refreshChron();
}
// pre-build a settlement at world start, scaled by the "buildup" slider (0..1):
// low buildup dots the meadow with a few homes; high buildup raises a dense city of
// towers, tenements, factories and halls. Places completed buildings around the
// people-centroid, moves settlers into the housing, then wakes the village system.
function seedCity(bu){
 bu=clamp(bu,0,1);
 const cen=townCentroid()||[Math.round(cam.x/TILE),Math.round(cam.y/TILE)];
 // how many structures to plant, and the type mix, both ramp with buildup
 const n=Math.round(3+bu*34);
 // weighted type table: as bu rises the mix tilts from cottages toward towers/civic
 function pickType(){
  const t=[];
  const add=(tp,w)=>{if(w>0)t.push([tp,w])};
  add('shelter', 3*(1-bu));
  add('home',    4);
  add('biz',     1.5+bu*1.5);
  add('park',    0.6+bu*1.4);
  add('apartment', bu*3);
  add('warehouse', bu*1.2);
  add('venue',   bu*1.2);
  add('factory', bu*bu*2.2);
  add('highrise', bu*bu*3.5);
  let tot=0;for(const e of t)tot+=e[1];
  let r=rng()*tot;
  for(const e of t){r-=e[1];if(r<=0)return e[0]}
  return 'home';
 }
 const placed=[];
 for(let k=0;k<n;k++){
  const tp=pickType();
  const[w,h]=SZ[tp];
  // scatter tighter for a dense city, wider for a sparse hamlet
  const spread=Math.round(6+(1-bu)*10);
  const s=findSpot(cen[0]+ri(-spread,spread),cen[1]+ri(-spread,spread),w,h,null);
  if(!s)continue;
  const b={i:buildings.length,id:nextId++,tp,x:s[0],y:s[1],w,h,prog:0,need:NEED[tp],done:false,gone:false,
   owners:[],builder:null,forId:null,stock:{food:0,wood:0,stone:0},prosperity:0,sub:null,name:null,ref:null,
   emptySince:0,ruined:false,vid:null};
  if(tp==='biz'){
   b.sub=pick(BIZKINDS);
   const bizName=()=>Lore.active?'The '+Lore.name(4,10):'The '+pick(BIZ_ADJ)+' '+pick(BIZ_NOUN);
   let nm=bizName(),tr=0;while(usedBiz.has(nm)&&tr++<15)nm=bizName();
   usedBiz.add(nm);b.name=nm;
  }
  buildings.push(b);
  for(let y=b.y;y<b.y+h;y++)for(let x=b.x;x<b.x+w;x++)bld[idx(x,y)]=b.i;
  completeBuild(b);
  placed.push(b);
 }
 // move the founding settlers into whatever housing was raised
 const houses=placed.filter(b=>!b.gone&&BMETA[b.tp]&&BMETA[b.tp].cat==='house');
 if(houses.length){
  for(const p of people){
   if(p.home)continue;
   const h=houses.find(b=>b.owners.length<bcap(b))||houses[ri(0,houses.length-1)];
   setHome(p,h);
   const[hx,hy]=homeTile(h);
   p.x=hx*TILE+TILE/2;p.y=hy*TILE+TILE/2;
  }
 }
 // recompute the camera on the new town heart, wake the village system, and
 // register any civic buildings with the freshly-formed village so they persist
 if(people.length){
  const c=people.reduce((a,p)=>[a[0]+p.x,a[1]+p.y],[0,0]);
  cam.x=c[0]/people.length;cam.y=c[1]/people.length;
 }
 detectVillages();
 const v=nearestVillage({x:cen[0]*TILE,y:cen[1]*TILE},60);
 if(v)for(const b of placed)if(!b.gone&&!b.vid)b.vid=v.id;
}
// relics surface as the world industrialises: few in the forest, many in the
// waste — and the built themes (modern, cyberpunk) are strewn with far more.
function relicMult(){ return worldTheme==='cyberpunk'?2.1 : worldTheme==='modern'?1.5 : 1; }
function relicTarget(){ return Math.round((1 + (1-eraGreen())*13)*relicMult()*wpMul('treasure')); }
// a ground find the Sage can collect: gold & gems are common spendable treasure;
// a relic is rare and special (it installs a lasting tech-skill)
function spawnFind(x,y,kind,amt,relic){ salvage.push({x:x*TILE+TILE/2,y:y*TILE+TILE/2,t:R()*6.28,kind,amt:amt||0,relic:relic||null}); }
// a surfaced cache: mostly coin, some gems, and only rarely an old-world relic
function spawnSalvageAt(x,y){
 const r=R();
 if(r<0.06)      spawnFind(x,y,'relic',0,pick(RELICS));
 else if(r<0.34) spawnFind(x,y,'gem', ri(1,3));
 else            spawnFind(x,y,'gold',ri(3,9));
}
function spawnSalvage(){
 for(let t=0;t<40;t++){
  const[x,y]=randOpenTile();
  if(bld[idx(x,y)]>=0||nodeAt.has(idx(x,y))||dungeonAt(x,y))continue;
  if(dist2(x*TILE,y*TILE,hero.x,hero.y)<12*TILE*12*TILE)continue;
  spawnSalvageAt(x,y);
  return;
 }
}
function randOpenTile(){return pick(openTiles)}
function nearOpen(tx,ty){
 for(let r=0;r<=6;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
  if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
  if(walkable(tx+dx,ty+dy))return[tx+dx,ty+dy];
 }
 return null;
}

/* ================= A* pathfinding ================= */
const AG=new Float32Array(W*H),ACAME=new Int32Array(W*H),ASTAMP=new Int32Array(W*H);let AID=0;
function hpush(h,f,v){h.push([f,v]);let i=h.length-1;while(i>0){const p=(i-1)>>1;if(h[p][0]<=h[i][0])break;const t=h[p];h[p]=h[i];h[i]=t;i=p}}
function hpop(h){const top=h[0],l=h.pop();if(h.length){h[0]=l;let i=0;for(;;){let c=i*2+1;if(c>=h.length)break;if(c+1<h.length&&h[c+1][0]<h[c][0])c++;if(h[i][0]<=h[c][0])break;const t=h[i];h[i]=h[c];h[c]=t;i=c}}return top}
function findPath(sx,sy,tx,ty){
 if(!walkable(sx,sy)){const n=nearOpen(sx,sy);if(!n)return null;sx=n[0];sy=n[1]}
 if(!walkable(tx,ty)){const n=nearOpen(tx,ty);if(!n)return null;tx=n[0];ty=n[1]}
 const start=idx(sx,sy),goal=idx(tx,ty);
 if(start===goal)return[{x:tx*TILE+TILE/2,y:ty*TILE+TILE/2}];
 if(regionsDirty)computeRegions();
 if(region[start]<0||region[start]!==region[goal])return null;
 AID++;
 const h=[];AG[start]=0;ASTAMP[start]=AID;ACAME[start]=-1;
 hpush(h,0,start);
 let pops=0;
 while(h.length&&pops++<2200){
  const[,cur]=hpop(h);
  if(cur===goal){
   const path=[];let c=goal;
   while(c!==-1){path.push(c);c=ACAME[c]}
   path.reverse();
   return path.map(i=>({x:(i%W)*TILE+TILE/2,y:((i/W)|0)*TILE+TILE/2}));
  }
  const cx=cur%W,cy=(cur/W)|0,g=AG[cur];
  const nbs=[[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]];
  for(const[nx,ny]of nbs){
   if(!walkable(nx,ny))continue;
   const ni=idx(nx,ny),ng=g+1;
   if(ASTAMP[ni]!==AID||ng<AG[ni]){
    ASTAMP[ni]=AID;AG[ni]=ng;ACAME[ni]=cur;
    hpush(h,ng+1.8*(Math.abs(nx-tx)+Math.abs(ny-ty)),ni);
   }
  }
 }
 return null;
}
function goTo(p,tx,ty){
 const path=findPath((p.x/TILE)|0,(p.y/TILE)|0,tx,ty);
 if(!path)return false;
 p.path=path;p.pi=0;return true;
}
function moveAlong(p,dt){
 if(!p.path)return true;
 let d=WALK*(1+mod(p,'speed'))*(p.age<12?0.72:p.age>=56?0.85:1)*dt;
 p.moving=true;
 while(d>0&&p.path&&p.pi<p.path.length){
  const w=p.path[p.pi],dx=w.x-p.x,dy=w.y-p.y,L=Math.hypot(dx,dy);
  if(L<1.2){p.pi++;continue}
  if(Math.abs(dx)>0.5)p.fx=dx>0?1:-1;
  p.dirIdx=CFHelp.angToDir(Math.atan2(dy,dx));
  const m=Math.min(d,L);
  p.x+=dx/L*m;p.y+=dy/L*m;d-=m;
 }
 if(p.goal&&p.goal.k==='wander'&&!p.goal.done)p.visited.add((((p.x/TILE)|0)>>3)+','+(((p.y/TILE)|0)>>3));
 if(p.path&&p.pi>=p.path.length){p.path=null;p.moving=false;return true}
 return!p.path;
}

/* ================= people ================= */
const PAL=['#c94f5e','#4fa3a5','#c98a3d','#8a63c9','#6fa04f','#5a7fc9','#c95f9d','#b0a04a','#7a6a55','#4fc98a','#9a4f3d','#5ac9c0'];
const SKINS=['#e8c39e','#d1a074','#a9764c','#8a5a35','#6b4326','#f0d4b8'];
function newPerson({x,y,age,traits,parents,mind}){
 const myMind=mind||Mind.create();
 let nm=null;
 if(myMind&&Mind.active){ nm=Mind.name(myMind,4,11); let t=0; while(nm&&usedNames.has(nm)&&t++<8)nm=Mind.name(myMind,4,11); if(nm)usedNames.add(nm); }
 if(!nm)nm=makeName();
 const p={
  id:nextId++,name:nm,mind:myMind,x,y,fx:1,dirIdx:0,
  col:pick(PAL),skin:pick(SKINS),
  age,lifespan:ri(58,88),
  traits:traits||[],
  base:{luck:0,social:0,work:0,romance:0,charm:0,speed:0,fert:0},
  buffs:[],
  hunger:rf(15,45),energy:rf(60,100),socialN:rf(0,45),starv:0,
  inv:{food:ri(1,3),wood:0,stone:0},
  home:null,business:null,partner:null,married:false,courting:null,
  parents:parents||[],kids:[],rel:{},cards:[],story:[],
  goal:null,task:null,path:null,pi:0,thinkT:0,sleeping:false,dead:false,moving:false,
  chatHold:0,gloomUntil:0,farUntil:0,lostUntil:0,hermitUntil:0,wedSoon:false,doom:0,wantsBiz:false,
  visited:new Set(),cameOfAge:age>=16,bornDay:cday()-Math.floor(age*2),arrDay:cday(),em:null,
  relics:[],inDungeon:false,nextQuestDay:cday()+ri(0,4),bubble:null,
  hp:100,fleeUntil:0,fighting:null,vid:null,kills:0,
  lookSeed:'folk-'+(nextId)+'-'+((R()*1e9)|0),sprite:null,animClock:rf(0,4)
 };
 if(!p.traits.length){
  const t1=pick(TKEYS);let t2=pick(TKEYS);
  while(t2===t1)t2=pick(TKEYS);
  p.traits=[t1,t2];
 }
 for(const t of p.traits)applyTrait(p,t,1);
 p.lifespan+=Math.round(p.base.luck*6);
 if(p.age>=16)p.goal=pickGoal(p);
 if(p.traits.includes('ambitious')||p.traits.includes('creative'))p.wantsBiz=true;
 allById.set(p.id,p);people.push(p);
 queuePersonBake(p);
 return p;
}
function describe(p){return Math.floor(p.age)+' summers old, '+traitPhrase(p)}
function arrive(age){
 let spot=null;
 for(let t=0;t<40&&!spot;t++){
  const[x,y]=randOpenTile();
  if(x<16||y<16||x>W-16||y>H-16)spot=[x,y];
 }
 if(!spot)spot=randOpenTile();
 const p=newPerson({x:spot[0]*TILE+TILE/2,y:spot[1]*TILE+TILE/2,age:age||ri(18,36)});
 tale([p],p.name+' wandered in over the hills, trailing questions — '+describe(p)+'.',true);
 drawCard(p,'On their arrival, the garden');
 return p;
}
function stageOf(p){return p.age<6?'child':p.age<12?'kid':p.age<16?'youth':p.age<56?'adult':'elder'}
function stageScale(p){return p.age<6?0.55:p.age<12?0.72:p.age<16?0.86:1}
function rerollTrait(p){
 const i=ri(0,p.traits.length-1),old=p.traits[i];
 let nt=pick(TKEYS);let tries=0;
 while((p.traits.includes(nt))&&tries++<30)nt=pick(TKEYS);
 applyTrait(p,old,-1);applyTrait(p,nt,1);
 p.traits[i]=nt;
 tale([p],'Death came not for '+p.name+"'s body, but for their old self. No longer "+TRAITS[old].a+', they emerged '+TRAITS[nt].a+'.',true);
}

/* ================= buildings & economy ================= */
const BIZKINDS=[['teahouse','🍵','a contemplative tea-and-tincture bar'],['pressery','🌼','a flower-pressing atelier'],['seedhall','🌱','a seed-and-data exchange'],['apiary','🐝','a murmuring apiary of wired bees'],['bathhouse','♨️','a petal-steam bathhouse'],['workshop','🔨','a graft-wright’s chop-shop'],['apothecary','🧪','an apothecary of saps and softwares']];
const BIZ_ADJ=['Pondering','Verdant','Crooked','Patient','Velvet','Wandering','Tangled','Silver','Grinning','Quiet','Second','Peculiar'];
const BIZ_NOUN=['Radish','Trellis','Axiom','Fern','Bumblebee','Root','Petal','Paradox','Nettle','Kettle','Bough','Marrow'];
function homeTile(b){return[b.x+((b.w/2)|0),b.y+((b.h/2)|0)]}
function findSpot(cx,cy,w,h,bounds){
 for(let r=2;r<=22;r++){
  const cand=[];
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
   if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
   cand.push([cx+dx,cy+dy]);
  }
  shuffle(cand);
  for(const[bx,by]of cand){
   if(bounds&&(bx<bounds.x0+1||by<bounds.y0+1||bx+w>bounds.x1||by+h>bounds.y1))continue;
   let ok=true;
   for(let y=by-1;y<=by+h&&ok;y++)for(let x=bx-1;x<=bx+w&&ok;x++){
    if(!inB(x,y)){ok=false;break}
    if(bld[idx(x,y)]>=0)ok=false;
   }
   if(!ok)continue;
   for(let y=by;y<by+h&&ok;y++)for(let x=bx;x<bx+w&&ok;x++){
    if(!walkable(x,y)||nodeAt.has(idx(x,y))||dungeonAt(x,y)||struct[idx(x,y)]===S_WALL)ok=false;
   }
   if(ok)return[bx,by];
  }
 }
 return bounds?findSpot(cx,cy,w,h,null):null;
}
function totalMat(p,k){return p.inv[k]+(p.home&&!p.home.gone&&p.home.stock?p.home.stock[k]:0)}
function canAfford(p,cost){for(const k in cost)if(totalMat(p,k)<cost[k])return false;return true}
function takeMat(p,cost){
 if(!canAfford(p,cost))return false;
 for(const k in cost){
  let need=cost[k];
  const fromInv=Math.min(need,p.inv[k]);p.inv[k]-=fromInv;need-=fromInv;
  if(need>0)p.home.stock[k]-=need;
 }
 return true;
}
function nearestVillage(p,maxTiles){
 let best=null,bd=(maxTiles?maxTiles*TILE:1e9)**2;
 for(const v of villages){const d=dist2(p.x,p.y,v.cx*TILE,v.cy*TILE);if(d<bd){bd=d;best=v}}
 return best;
}
function townCentroid(){
 const hs=buildings.filter(b=>!b.gone&&!b.ruined&&(b.tp==='biz'||(BMETA[b.tp]&&BMETA[b.tp].cat==='house')));
 if(hs.length<2)return null;
 let cx=0,cy=0;for(const b of hs){cx+=b.x+b.w/2;cy+=b.y+b.h/2}
 return [Math.round(cx/hs.length),Math.round(cy/hs.length)];
}
function startBuild(p,tp,forP,vill){
 const cost=COST[tp];
 if(!vill&&!canAfford(p,cost))return false;
 const[w,h]=SZ[tp];
 let anchor=[(p.x/TILE)|0,(p.y/TILE)|0],bounds=null,s=null;
 if(forP&&forP.home){anchor=homeTile(forP.home)}
 else if(p.founder&&!p.vid){ /* a schism founder builds where they've settled, not back home */ }
 else if(tp!=='grave'){
  const v=p.vid?villages.find(vv=>vv.id===p.vid):nearestVillage(p,34);
  if(v&&v.claim){
   anchor=claimCenter(v.claim);
   s=findSpot(anchor[0],anchor[1],w,h,v.claim);
   if(!s)s=findSpot(anchor[0],anchor[1],w,h,null);
  }else{
   const tc=townCentroid();
   if(tc)anchor=[Math.round((tc[0]+((p.x/TILE)|0))/2),Math.round((tc[1]+((p.y/TILE)|0))/2)];
  }
 }
 if(!s)s=findSpot(anchor[0],anchor[1],w,h,bounds);
 if(!s)return false;
 if(!vill)takeMat(p,cost);
 const b={i:buildings.length,id:nextId++,tp,x:s[0],y:s[1],w,h,prog:0,need:NEED[tp],done:false,gone:false,
  owners:[],builder:p.id,forId:forP?forP.id:null,stock:{food:0,wood:0,stone:0},prosperity:0,sub:null,name:null,ref:null,
  emptySince:0,ruined:false,vid:vill?vill.id:(p.vid||null)};
 if(tp==='biz'){
  b.sub=pick(BIZKINDS);
  const bizName=()=>Lore.active?'The '+Lore.name(4,10):'The '+pick(BIZ_ADJ)+' '+pick(BIZ_NOUN);
  let nm=bizName(),tr=0;
  while(usedBiz.has(nm)&&tr++<15)nm=bizName();
  usedBiz.add(nm);b.name=nm;
 }
 buildings.push(b);
 for(let y=b.y;y<b.y+h;y++)for(let x=b.x;x<b.x+w;x++)bld[idx(x,y)]=b.i;
 setTask(p,'build',{b});
 const lbl=(tp==='biz'?'shop':(BMETA[tp]&&BMETA[tp].label)||tp);
 if(forP)tale([p],p.name+' began building a shelter — not for themselves, but for '+forP.name+'.');
 else if(vill)tale([p],p.name+' broke ground on a new '+lbl+' for '+vill.name+' — the settlement is growing.',true);
 else tale([p],p.name+' started work on a '+lbl+', hauling '+pick(['bundled cane','lashed stalks','good hillstone','salvaged timber'])+'.');
 return true;
}
function setHome(p,b){
 if(p.home&&p.home!==b){const o=p.home;o.owners=o.owners.filter(id=>id!==p.id)}
 p.home=b;
 if(!b.owners.includes(p.id))b.owners.push(p.id);
}
function solidifyBuilding(b){
 if(!bsolid(b))return;   // parks stay open ground you can walk through
 for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++){
  shoveOccupants(x,y);
  setSolid(x,y,S_HOUSE);
 }
}
function completeBuild(b){
 b.done=true;b.prog=b.need;
 solidifyBuilding(b);
 const builder=allById.get(b.builder);
 if(b.tp==='shelter'||b.tp==='home'){
  if(b.forId){
   const o=allById.get(b.forId);
   if(o&&!o.dead){setHome(o,b);tale([builder,o],builder.name+' built a shelter for '+o.name+', asking nothing in return.',true);applyAff(o,builder,30);applyAff(builder,o,10)}
  }else if(builder&&!builder.dead){
   const oldHome=builder.home;
   setHome(builder,b);
   const pt=builder.partner?allById.get(builder.partner):null;
   if(pt&&!pt.dead&&(pt.home===oldHome||!pt.home||pt.home===null))setHome(pt,b);
   if(b.tp==='shelter')tale([builder],builder.name+' raised a small lean-to of '+pick(['woven cane','lashed stalks','patched broadleaves'])+' to call their own.',true);
   else{
    const who=pt&&pt.home===b?builder.name+' and '+pt.name:builder.name;
    tale(pt&&pt.home===b?[builder,pt]:[builder],who+' finished a proper cottage — a door that shuts, a kettle that sings.',true);
   }
  }
 }else if(b.tp==='biz'&&builder&&!builder.dead){
  builder.business=b;
  tale([builder],builder.name+' opened '+b.name+' — '+b.sub[2]+'.',true);
 }
}
function demolish(b){
 if(b.gone)return;
 b.gone=true;
 for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++)if(bld[idx(x,y)]===b.i){bld[idx(x,y)]=-1;revertTile(x,y)}
 for(const id of b.owners){const p=allById.get(id);if(p&&p.home===b)p.home=null}
 b.owners=[];
 if(b.tp==='biz'){const o=allById.get(b.builder);if(o&&o.business===b)o.business=null}
}
function ruinBuilding(b){
 if(b.gone||b.ruined||b.tp==='grave')return;
 // an abandoned park just goes wild again rather than leaving rubble
 if(BMETA[b.tp]&&BMETA[b.tp].cat==='park'){tale([],'The green went untended and the wilds reclaimed it.');demolish(b);return}
 b.ruined=true;b.emptySince=simMin;
 for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++)if(bld[idx(x,y)]===b.i)setSolid(x,y,S_RUIN);
 for(const id of b.owners){const p=allById.get(id);if(p&&p.home===b)p.home=null}
 b.owners=[];
 if(b.tp==='biz'){const o=allById.get(b.builder);if(o&&o.business===b)o.business=null}
 const lbl=b.tp==='biz'?b.name:(BMETA[b.tp]&&BMETA[b.tp].label)||('a '+b.tp);
 const what=b.tp==='biz'||BMETA[b.tp]&&BMETA[b.tp].cat!=='house'?lbl:'a '+lbl;
 tale([],'With no one to tend it, '+what+' fell to ruin, and the vines moved in without asking.');
}
// turn a building into a lasting ruin — it stays standing (as rubble) instead of
// crumbling back into the green, so a dead town reads as a derelict city
function makeAncientRuin(b){
 if(b.gone||b.tp==='grave')return;
 if(!b.ruined){
  b.ruined=true;
  for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++)if(bld[idx(x,y)]===b.i)setSolid(x,y,S_RUIN);
 }
 b.ancient=true;b.emptySince=simMin;
 for(const id of b.owners){const p=allById.get(id);if(p&&p.home===b)p.home=null}
 b.owners=[];
 if(b.tp==='biz'){const o=allById.get(b.builder);if(o&&o.business===b)o.business=null}
}
// a town whose people are all gone falls into ruin: its buildings become lasting
// rubble and a raidable ruin-site opens at its heart (quests, the town's lost
// treasure, and monsters that move into the empty streets)
function makeRuin(v){
 if(!v||cday()-v.founded<4)return null;                 // spare fledgling clusters
 const R2=((v.rad+6)*TILE)**2;
 const bs=buildings.filter(b=>!b.gone&&b.tp!=='grave'&&dist2(b.x*TILE,b.y*TILE,v.cx*TILE,v.cy*TILE)<R2);
 if(bs.length<3)return null;                             // too small to be a "city"
 for(const b of bs)makeAncientRuin(b);
 const c=nearOpen(Math.round(v.cx),Math.round(v.cy))||[Math.round(v.cx),Math.round(v.cy)];
 if(dungeonAt(c[0],c[1]))return null;
 const d=makeDungeon(c[0],c[1]);
 d.ruin=true; usedDun.delete(d.name); d.name='The Ruins of '+v.name;
 d.danger=rf(.3,.55); d.depth=ri(2,4); d.loot=rf(.95,1.3);
 for(let i=0;i<ri(1,3);i++)spawnMonster(d);              // something moves in
 tale([], v.name+' has fallen silent — its people gone, its lanes surrendered to the vines. Only the ruins remain, keeping the old town’s treasure… and something has moved into the empty streets.',true);
 return d;
}
// choose a fresh, open site for a new settlement, away from the old ruins
function pickSettleSite(){
 let best=null,bd=-1;
 for(let t=0;t<60;t++){
  const[x,y]=randOpenTile();
  if(x<8||y<8||x>W-8||y>H-8)continue;
  let near=1e9;for(const d of dungeons){const dd=dist2(x,y,d.x,d.y);if(dd<near)near=dd}
  if(near>bd){bd=near;best=[x,y]}
 }
 return best||randOpenTile();
}
// a founding party comes over the hills to raise a new town from the ashes
function foundingExpedition(){
 civFallen=false;expeditionDay=0;
 const spot=pickSettleSite(),n=ri(4,7),party=[];
 for(let i=0;i<n;i++){
  const s=nearOpen(clamp(spot[0]+ri(-3,3),2,W-3),clamp(spot[1]+ri(-3,3),2,H-3))||spot;
  const p=newPerson({x:s[0]*TILE+TILE/2,y:s[1]*TILE+TILE/2,age:ri(19,40)});
  p.inv.wood+=ri(5,9);p.inv.stone+=ri(2,5);p.inv.food+=ri(2,4);   // provisions to break ground
  party.push(p);
 }
 tale(party,'An expedition of '+n+' comes over the far hills — carrying seed, salvage, and stubborn hope — to raise a new town where the old world ended.',true);
 if(party[0])drawCard(party[0],'On the founding of a new town, the garden');
 return party;
}
// keep the civilisation alive with newcomers; but let it fall when attrition wins,
// and reseed the map with a founding expedition once everyone is gone
function maintainCivilization(){
 const n=people.reduce((c,p)=>c+(p.dead?0:1),0);
 if(n<=0){
  if(!civFallen){
   civFallen=true;expeditionDay=cday()+ri(3,7);
   tale([],'The last hearth has gone cold; the final voice in the garden has fallen quiet. The meadow keeps its own counsel now, tending the ruins of everything that argued here. In time, new questions will come walking over the hills.',true);
  }
  if(cday()>=expeditionDay&&chance(.6))foundingExpedition();
  return;
 }
 civFallen=false;
 const hasHome=buildings.some(b=>!b.gone&&!b.ruined&&BMETA[b.tp]&&BMETA[b.tp].cat==='house');
 if(hasHome){ if(n<8&&chance(.2))arrive(); else if(n<24&&chance(.045))arrive(); }
 else if(n<6&&chance(.1))arrive();                        // a young party still gathering
}
function crumbleBuilding(b){
 if(b.gone)return;
 b.gone=true;
 for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++)if(bld[idx(x,y)]===b.i){bld[idx(x,y)]=-1;carveFloor(x,y)}
 tale([],'The old ruins '+(b.name?'of '+b.name+' ':'')+'finally sank back into the green.');
}
function addGrave(p){
 const tx=(p.x/TILE)|0,ty=(p.y/TILE)|0;
 const s=findSpot(tx,ty,1,1)||nearOpen(tx,ty);
 if(!s)return;
 const b={i:buildings.length,id:nextId++,tp:'grave',x:s[0],y:s[1],w:1,h:1,prog:1,need:1,done:true,gone:false,owners:[],builder:p.id,forId:null,stock:null,prosperity:0,sub:null,name:null,ref:p.id,born:simMin};
 buildings.push(b);
 bld[idx(s[0],s[1])]=b.i;
}

/* ================= tasks & AI ================= */
function setTask(p,k,data){p.task=Object.assign({k,t0:simMin},data||{});p.path=null;p.pi=0;p.working=false}
function findNode(p,types,pred){
 if(regionsDirty)computeRegions();
 const pr=region[idx(clamp((p.x/TILE)|0,0,W-1),clamp((p.y/TILE)|0,0,H-1))];
 let best=null,bd=1e18;
 for(const n of nodes){
  if(n.amt<=0||!types.includes(n.t))continue;
  if(pred&&!pred(n))continue;
  if(pr>=0&&region[idx(n.x,n.y)]!==pr)continue;
  const d=dist2(p.x,p.y,n.x*TILE,n.y*TILE);
  if(d<bd){bd=d;best=n}
 }
 return best;
}
function gatherType(p,kind,want){
 const types=kind==='food'?['berry','mush']:kind==='wood'?['tree']:['rock'];
 const n=findNode(p,types);
 if(!n){setTask(p,'wander',{r:20});return false}
 setTask(p,'gather',{node:n,want:want||4});
 return true;
}
function wanderTask(p,far){
 const r=far?28:8;
 for(let t=0;t<3;t++){
  const tx=clamp(((p.x/TILE)|0)+ri(-r,r),1,W-2),ty=clamp(((p.y/TILE)|0)+ri(-r,r),1,H-2);
  if(walkable(tx,ty)){setTask(p,'wander',{});if(goTo(p,tx,ty))return true;p.task=null}
 }
 p.task=null;p.thinkT=simMin+rf(15,40);
 return false;
}
function goHome(p,why){
 if(!p.home||p.home.gone)return false;
 const[hx,hy]=homeTile(p.home);
 setTask(p,'gohome',{tx:hx,ty:hy,why});
 return true;
}
function goSleep(p){
 if(p.home&&!p.home.gone){if(goHome(p,'sleep'))return}
 p.sleeping=true;p.task=null;p.path=null;
 if(chance(.08))tale([p],p.name+' slept curled in the deep grass, dreaming in green.');
}
function claimVacant(p){
 let best=null,bd=1e18;
 for(const b of buildings){
  if(b.gone||b.ruined||!b.done)continue;
  if(bcap(b)<=0||b.owners.length>=bcap(b))continue;   // houses only, and only if a unit is free
  const[hx,hy]=homeTile(b);
  const d=dist2(p.x,p.y,hx*TILE,hy*TILE);
  if(d<bd){bd=d;best=b}
 }
 if(best){
  const shared=best.owners.length>0;
  setHome(p,best);best.emptySince=0;
  const lbl=(BMETA[best.tp]&&BMETA[best.tp].label)||best.tp;
  tale([p],shared?(p.name+' moved into a unit in the '+lbl+', neighbours through the wall.'):(p.name+' took up residence in an empty '+lbl+'. It still smelled of someone else’s tea.'));
  return true;
 }
 return false;
}
function nearestBiz(p){
 let best=null,bd=1e18;
 for(const b of buildings){
  if(b.gone||!b.done||b.tp!=='biz')continue;
  const[hx,hy]=homeTile(b);
  const d=dist2(p.x,p.y,hx*TILE,hy*TILE);
  if(d<bd&&d<(140*TILE)**2){bd=d;best=b}
 }
 return best;
}
function socialize(p){
 if(chance(.5)&&specialSocial(p))return;   // a richer act than a plain chat?
 let cand=null;
 const bel=p.courting||((p.partner&&chance(.5))?p.partner:null);
 if(bel){const o=allById.get(bel);if(o&&!o.dead&&!o.sleeping)cand=o}
 if(!cand){
  let bs=-1e18;
  for(const o of people){
   if(o===p||o.dead||o.age<8||o.sleeping)continue;
   const r=p.rel[o.id];
   if(r&&r.a<=-30)continue;
   const dTiles=Math.sqrt(dist2(p.x,p.y,o.x,o.y))/TILE;
   const s=(r?r.a*2.5:0)-dTiles*1.5+rf(0,25);
   if(s>bs){bs=s;cand=o}
  }
 }
 const b=nearestBiz(p);
 if(b&&(!cand||chance(.35))){
  const[hx,hy]=homeTile(b);
  setTask(p,'visit',{b,tx:hx,ty:hy});
  return;
 }
 if(cand)setTask(p,'chat',{o:cand,rp:0});
 else wanderTask(p);
}
function nearestMonster(p,range){
 let best=null,bd=range?range*range:1e18;
 for(const m of monsters){const d=dist2(p.x,p.y,m.x,m.y);if(d<bd){bd=d;best=m}}
 return best;
}
function think(p){
 const st=stageOf(p);
 const nearM=monsters.length?nearestMonster(p,9*TILE):null;
 if(p.hunger>82&&p.inv.food>0&&(!nearM||Math.sqrt(dist2(p.x,p.y,nearM.x,nearM.y))>5*TILE)){setTask(p,'eat',{});return}
 if(nearM){
  const close=Math.sqrt(dist2(p.x,p.y,nearM.x,nearM.y))/TILE;
  if(close<9){
   if(p.fleeUntil>simMin||!shouldFight(p)){fleeFrom(p,nearM);return;}
   setTask(p,'fight',{m:nearM});return;
  }
 }
 // a schism founder marching off to break new ground: press on to the site, then
 // settle and build — once enough of the band cluster, a new village is born
 if(p.migrate){
  const tx=p.migrate[0],ty=p.migrate[1];
  if(dist2(p.x,p.y,tx*TILE,ty*TILE)<(5*TILE)**2||!walkable(tx,ty)){ p.migrate=null; }
  else { setTask(p,'migrate',{}); if(!goTo(p,tx,ty)){ p.migrate=null; } p.thinkT=simMin+rf(6,16); return; }
 }
 // a festival is on in their town: idle adults drift to the plaza to celebrate
 if(p.age>=16&&p.vid&&!p.sleeping){
  const fv=villages.find(v=>v.id===p.vid&&v.festival);
  if(fv&&chance(.6)){setTask(p,'festival',{cx:fv.cx,cy:fv.cy,until:simMin+rf(30,90)});return}
 }
 if(st==='child'){
  if(isNight()||p.energy<20){p.sleeping=true;return}
  if(p.hunger>55){
   const s=p.home&&!p.home.gone?p.home.stock:null;
   if(s&&s.food>0){s.food--;p.hunger=Math.max(0,p.hunger-42)}
   else for(const pid of p.parents){
    const pa=allById.get(pid);
    if(pa&&!pa.dead&&pa.inv.food>0){pa.inv.food--;p.hunger=Math.max(0,p.hunger-42);break}
   }
  }
  const anch=p.home&&!p.home.gone?homeTile(p.home).map(v=>v*TILE):(p.parents.length?(()=>{const pa=allById.get(p.parents[0]);return pa&&!pa.dead?[pa.x,pa.y]:[p.x,p.y]})():[p.x,p.y]);
  const tx=clamp(((anch[0]/TILE)|0)+ri(-2,2),1,W-2),ty=clamp(((anch[1]/TILE)|0)+ri(-2,2),1,H-2);
  if(walkable(tx,ty)){setTask(p,'wander',{});if(!goTo(p,tx,ty))p.task=null}
  p.thinkT=simMin+rf(20,60);
  return;
 }
 if(isNight()&&p.energy<72){goSleep(p);return}
 if(p.energy<18){goSleep(p);return}
 if(p.hunger>62){
  if(p.inv.food>0){setTask(p,'eat',{});return}
  if(p.home&&!p.home.gone&&p.home.stock.food>0){goHome(p,'eat');return}
  gatherType(p,'food',3);return;
 }
 if(p.lostUntil>simMin&&chance(.5)){wanderTask(p,true);if(chance(.12))tale([p],p.name+' wandered, moonstruck, down paths that all looked the same.');return}
 if(p.hermitUntil>simMin){wanderTask(p,true);return}
 if(st==='kid'||st==='youth'){
  if(p.socialN>60){socialize(p);return}
  if(st==='youth'&&p.home&&!p.home.gone&&p.home.stock.food<6&&chance(.6)){gatherType(p,'food',3);return}
  wanderTask(p);return;
 }
 if(p.home&&!p.home.gone&&(p.inv.food>6||p.inv.wood>=6&&!needsWoodPlan(p)||p.inv.stone>=6&&!needsStonePlan(p))){goHome(p,'deposit');return}
 for(const b of buildings){
  if(!b.gone&&!b.done&&b.builder===p.id){setTask(p,'build',{b});return}
 }
 if(!p.home||p.home.gone){
  if(!p.founder&&claimVacant(p))return;   // founders must raise their own roofs at the new site, not drift back
  if(canAfford(p,COST.shelter)){if(startBuild(p,'shelter'))return}
  gatherType(p,'wood',COST.shelter.wood);return;
 }
 if(p.courting&&p.socialN>22){socialize(p);return}
 if(p.socialN>55){socialize(p);return}
 const pt=p.partner?allById.get(p.partner):null;
 if(p.home.tp==='shelter'&&((pt&&!pt.dead)||(p.age>=20&&cday()>p.arrDay+4))){
  if(canAfford(p,COST.home)){if(startBuild(p,'home'))return}
  if(totalMat(p,'wood')<COST.home.wood){gatherType(p,'wood',3);return}
  if(totalMat(p,'stone')<COST.home.stone){gatherType(p,'stone',3);return}
 }
 if(p.wantsBiz&&!p.business&&p.home.tp!=='shelter'&&cday()>p.arrDay+2&&buildings.filter(b=>!b.gone&&b.tp==='biz').length<Math.max(2,(people.length/3)|0)){
  if(canAfford(p,COST.biz)){if(startBuild(p,'biz'))return}
  if(totalMat(p,'wood')<COST.biz.wood){gatherType(p,'wood',3);return}
  if(totalMat(p,'stone')<COST.biz.stone){gatherType(p,'stone',3);return}
 }
 if(p.home.stock.food<4+2*Math.min(3,p.kids.length)){gatherType(p,'food',4);return}
 if(p.vid){const v=villages.find(vv=>vv.id===p.vid);const keen=v&&!v.wallDone?0.95:0.7;if(chance(keen)){const job=findVillageJob(p);if(job){
  if(job.j.type==='guard'){ const k=job.v.jobs.indexOf(job.j); if(k>=0)job.v.jobs.splice(k,1); setTask(p,'guard',{gx:job.j.x,gy:job.j.y,dur:rf(50,130),ox:job.j.x>=job.v.cx?1:-1}); return; }
  setTask(p,'villagejob',{v:job.v,j:job.j});return;
 }}}
 if(wantsToQuest(p)){if(formExpedition(p))return}
 if(p.goal&&p.goal.k==='wander'&&!p.goal.done&&chance(.4)){wanderTask(p,true);return}
 if(p.farUntil>simMin&&chance(.5)){wanderTask(p,true);return}
 if(chance(.35))wanderTask(p);
 else{p.task=null;p.thinkT=simMin+rf(18,45)}
}
function fleeFrom(p,m){
 let tx,ty;
 if(p.vid){const v=villages.find(vv=>vv.id===p.vid);if(v){tx=Math.round(v.cx);ty=Math.round(v.cy)}}
 if(tx===undefined&&p.home&&!p.home.gone){const[hx,hy]=homeTile(p.home);tx=hx;ty=hy}
 if(tx===undefined){
  const ax=p.x-m.x,ay=p.y-m.y,L=Math.hypot(ax,ay)||1;
  tx=clamp(((p.x+ax/L*10*TILE)/TILE)|0,1,W-2);ty=clamp(((p.y+ay/L*10*TILE)/TILE)|0,1,H-2);
 }
 setTask(p,'flee',{tx,ty,m});
 if(chance(.08))tale([p],p.name+' fled from the '+m.name+'.');
}
function needsWoodPlan(p){
 if(!p.home||p.home.gone)return true;
 if(p.home.tp==='shelter')return true;
 if(p.wantsBiz&&!p.business)return true;
 return false;
}
function needsStonePlan(p){return needsWoodPlan(p)}

function doTask(p,dt){
 const t=p.task;
 switch(t.k){
  case 'wander':{if(!p.path){p.task=null;break}if(moveAlong(p,dt))p.task=null;break}
  case 'migrate':{if(!p.path){p.task=null;break}if(moveAlong(p,dt))p.task=null;break}
  case 'festival':{
   if(!t.arr){
    if(!p.path&&!t.pathed){t.pathed=true;const s=nearOpen(t.cx+ri(-1,1),t.cy+ri(-1,1))||[t.cx,t.cy];if(!goTo(p,s[0],s[1])){p.task=null;break}}
    if(moveAlong(p,dt))t.arr=true;else break;
   }
   p.moving=false;
   if(chance(dt*0.05))emote(p,pick(['🎵','💃','🕺','🎶','✨','🍶','🎉']));
   if(simMin>=t.until)p.task=null;
   break;
  }
  case 'guard':{
   if(!t.arr){ if(!p.path){if(!goTo(p,t.gx,t.gy)){p.task=null;break}} if(moveAlong(p,dt)){t.arr=true;p.moving=false;p.fx=t.ox||1} break; }
   // held post: face outward; break to think (and fight) the moment a monster nears
   t.h=(t.h||0)+dt;
   if(monsters.length&&nearestMonster(p,9*TILE)){p.task=null;break}
   if(chance(dt*0.02))emote(p,'🛡');
   if(t.h>=t.dur||isNight()&&p.energy<30){p.task=null}
   break;
  }
  case 'gather':{
   const n=t.node;
   if(!n||n.amt<=0){p.task=null;break}
   if(!t.arr){
    if(!p.path&&!t.pathed){t.pathed=true;if(!goTo(p,n.x,n.y)){p.task=null;break}}
    if(moveAlong(p,dt))t.arr=true;else break;
   }
   t.h=(t.h||0)+dt;
   if(t.h>=8){
    t.h=0;n.amt--;n.rt=n.reg;
    p.inv[n.yield]++;
    const sp=speciesOf(n);
    if(sp){ harvestPlant(p,sp); emote(p,sp.glyph); }
    else emote(p,n.yield==='food'?'🍇':n.yield==='wood'?'🪵':'⛏');
    if(n.amt<=0||p.inv[n.yield]>=t.want)p.task=null;
   }
   break;
  }
  case 'eat':{
   t.h=(t.h||0)+dt;
   if(t.h>=6){
    while(p.hunger>22&&p.inv.food>0){p.inv.food--;p.hunger=Math.max(0,p.hunger-42)}
    p.task=null;
   }
   break;
  }
  case 'gohome':{
   if(!p.home||p.home.gone){p.task=null;break}
   if(!t.arr){
    if(!p.path&&!t.pathed){t.pathed=true;if(!goTo(p,t.tx,t.ty)){p.task=null;break}}
    if(moveAlong(p,dt))t.arr=true;else break;
   }
   const s=p.home.stock;
   if(t.why==='eat'){
    while(p.hunger>22&&s.food>0){s.food--;p.hunger=Math.max(0,p.hunger-42)}
    p.task=null;
   }else if(t.why==='deposit'){
    while(p.inv.food>2){p.inv.food--;s.food++}
    if(!needsWoodPlan(p))while(p.inv.wood>0){p.inv.wood--;s.wood++}
    if(!needsStonePlan(p))while(p.inv.stone>0){p.inv.stone--;s.stone++}
    p.task=null;
   }else if(t.why==='sleep'){
    p.sleeping=true;p.task=null;
   }else p.task=null;
   break;
  }
  case 'build':{
   const b=t.b;
   if(!b||b.gone||b.done){p.task=null;break}
   const[hx,hy]=homeTile(b);
   if(!t.arr){
    if(!p.path&&!t.pathed){t.pathed=true;if(!goTo(p,hx,hy)){p.task=null;break}}
    if(moveAlong(p,dt))t.arr=true;else break;
   }
   // the builder must actually be on the site — no raising it from across the meadow
   if(dist2(p.x,p.y,hx*TILE+TILE/2,hy*TILE+TILE/2)>(2.4*TILE)**2){t.arr=false;t.pathed=false;p.working=false;break}
   p.working=true;p.moving=false;
   b.prog+=dt*(1+Math.max(-0.6,mod(p,'work')));
   if(chance(dt*0.02))emote(p,'🔨');
   if(b.prog>=b.need){completeBuild(b);p.task=null}
   break;
  }
  case 'chat':{
   const o=t.o;
   if(!o||o.dead||(o.sleeping&&!t.arr)){p.task=null;break}
   if(!t.arr){
    if(!p.path||simMin-t.rp>25){t.rp=simMin;if(!goTo(p,(o.x/TILE)|0,(o.y/TILE)|0)){p.task=null;break}}
    moveAlong(p,dt);
    if(dist2(p.x,p.y,o.x,o.y)<(TILE*1.5)**2){t.arr=true;t.h=0;p.path=null;p.moving=false;o.chatHold=simMin+18;p.fx=o.x>p.x?1:-1;o.fx=p.x>o.x?1:-1;if(SPEEDS[speedIdx]<=16)chatBubbles(p,o)}
    else if(simMin-t.t0>200){p.task=null}
   }else{
    o.chatHold=Math.max(o.chatHold,simMin+6);
    t.h+=dt;
    if(chance(dt*0.03))emote(p,'💬');
    if(t.h>=14){
     interact(p,o);
     p.socialN=0;o.socialN=Math.max(0,o.socialN-45);
     p.task=null;
    }
   }
   break;
  }
  case 'gift': case 'console': case 'mentor': case 'rival':{
   // walk to the other soul, then resolve the particular act
   const o=t.o;
   if(!o||o.dead||(o.sleeping&&!t.arr)||o.inDungeon){p.task=null;break}
   if(!t.arr){
    if(!p.path||simMin-t.rp>25){t.rp=simMin;if(!goTo(p,(o.x/TILE)|0,(o.y/TILE)|0)){p.task=null;break}}
    moveAlong(p,dt);
    if(dist2(p.x,p.y,o.x,o.y)<(TILE*1.6)**2){t.arr=true;p.path=null;p.moving=false;p.fx=o.x>p.x?1:-1;o.fx=p.x>o.x?1:-1;o.chatHold=simMin+16;emote(p,{gift:'🎁',console:'🫂',mentor:'📖',rival:'😤'}[t.k])}
    else if(simMin-t.t0>220){p.task=null}
   }else{
    t.h=(t.h||0)+dt;
    if(chance(dt*0.03))emote(p,'💬');
    if(t.h>=(t.k==='mentor'?16:10)){
     if(t.k==='gift')giveGift(p,o);
     else if(t.k==='console')doConsole(p,o);
     else if(t.k==='mentor')doMentor(p,o);
     else doRival(p,o);
     p.socialN=Math.max(0,p.socialN-40);
     p.task=null;
    }
   }
   break;
  }
  case 'visit':{
   const b=t.b;
   if(!b||b.gone){p.task=null;break}
   if(!t.arr){
    if(!p.path&&!t.pathed){t.pathed=true;if(!goTo(p,t.tx,t.ty)){p.task=null;break}}
    if(moveAlong(p,dt))t.arr=true;else break;
   }
   t.h=(t.h||0)+dt;
   if(t.h>=20){
    b.prosperity++;
    const owner=allById.get(b.builder);
    if(owner&&!owner.dead&&owner!==p){applyAff(p,owner,rf(1,4));applyAff(owner,p,rf(1,3))}
    if(p.hunger>50&&['teahouse','apiary','seedhall'].includes(b.sub[0]))p.hunger=Math.max(0,p.hunger-30);
    if(chance(.15))tale([p],p.name+' passed an easy hour at '+b.name+'.');
    if(b.prosperity===6||b.prosperity===16||b.prosperity===40)tale(owner&&!owner.dead?[owner]:[],b.name+' is the talk of the garden — everyone has been through its door.',true);
    p.socialN=Math.max(0,p.socialN-35);
    p.task=null;
   }
   break;
  }
  case 'togodungeon':{
   const d=t.d,exp=t.exp;
   if(!d||!exp||exp.departed||!expeditions.includes(exp)){p.task=null;break}
   if(!p.path&&!t.pathed){t.pathed=true;if(!goTo(p,d.x,d.y)){p.task=null;break}}
   if(moveAlong(p,dt)){exp.arrived.set(p.id,true);p.moving=false;emote(p,'🔦')}
   break;
  }
  case 'fight':{
   const m=t.m;
   if(!m||monsters.indexOf(m)<0){p.task=null;break}
   if(!t.avenge&&p.hp<22&&!p.traits.includes('brave')){p.fleeUntil=simMin+120;p.task=null;break}
   const close=dist2(p.x,p.y,m.x,m.y)<(TILE*1.3)**2;
   if(!close){
    if(!p.path||simMin-(t.rp||0)>20){t.rp=simMin;if(!goTo(p,(m.x/TILE)|0,(m.y/TILE)|0)){p.task=null;break}}
    moveAlong(p,dt);
    p.fx=m.x>p.x?1:-1;
   }else{
    p.path=null;p.moving=false;p.fx=m.x>p.x?1:-1;
    settlerAttack(p,m,dt);
   }
   break;
  }
  case 'flee':{
   if(!t.m||monsters.indexOf(t.m)<0||p.fleeUntil<simMin){p.task=null;break}
   if(!p.path&&!t.pathed){t.pathed=true;if(!goTo(p,t.tx,t.ty)){p.fleeUntil=0;p.task=null;break}}
   if(moveAlong(p,dt)){
    p.moving=false;
    if(dist2(p.x,p.y,t.m.x,t.m.y)>(12*TILE)**2)p.fleeUntil=0;
    p.task=null;
   }
   break;
  }
  case 'villagejob':{
   const v=t.v,j=t.j;
   if(!v||!j||!villages.includes(v)){p.task=null;break}
   if(!t.arr){
    if(!p.path&&!t.pathed){
     t.pathed=true;
     const tgt=walkable(j.x,j.y)?[j.x,j.y]:(nearOpen(j.x,j.y)||[j.x,j.y]);
     if(!goTo(p,tgt[0],tgt[1])){releaseJob(v,j);p.task=null;break}
    }
    if(moveAlong(p,dt))t.arr=true;else break;
   }
   // the worker must be standing on (or right beside) the job tile before it counts —
   // if pathing dropped them off too far, close the gap or give the job back
   if(dist2(p.x,p.y,j.x*TILE+TILE/2,j.y*TILE+TILE/2)>(1.7*TILE)**2){
    const tgt=walkable(j.x,j.y)?[j.x,j.y]:(nearOpen(j.x,j.y)||null);
    if(!tgt||!goTo(p,tgt[0],tgt[1])){releaseJob(v,j);p.task=null;break}
    t.arr=false;p.working=false;break;
   }
   p.working=true;p.moving=false;
   t.h=(t.h||0)+dt;
   if(chance(dt*0.03))emote(p,{mine:'⛏',wall:'🌿',harvest:'🌾',clear:'⛏',tidywall:'🧹',pave:'🧱',weed:'🌿',till:'🌱'}[j.type]||'🌱');
   if(t.h>=(j.type==='wall'||j.type==='pave'||j.type==='tidywall'||j.type==='weed'?6:12)){doVillageJob(p,v,j);p.task=null}
   break;
  }
  default:p.task=null;
 }
}
function releaseJob(v,j){j.claimed=null}
function doVillageJob(p,v,j){
 const i=idx(j.x,j.y);
 const drop=()=>{const k=v.jobs.indexOf(j);if(k>=0)v.jobs.splice(k,1)};
 if(j.type==='wall'){
  if(!walkable(j.x,j.y)){drop();return}
  if(v.stock.stone>=WALL_STONE)v.stock.stone-=WALL_STONE;
  else if(totalMat(p,'stone')>=WALL_STONE){if(p.inv.stone>0)p.inv.stone--;else if(p.home&&p.home.stock)p.home.stock.stone--}
  else{releaseJob(v,j);return}
  shoveOccupants(j.x,j.y);setSolid(j.x,j.y,S_WALL);drop();
 }else if(j.type==='mine'){
  if(walkable(j.x,j.y)){drop();return}
  if(!mineable(j.x,j.y)){drop();return}
  unearthRock(j.x,j.y,{p,v});drop();
  if(chance(.2))tale([p],p.name+' cleared old bramble from the lanes of '+v.name+', hauling out good stone.');
 }else if(j.type==='till'){
  if(!walkable(j.x,j.y)||farmGrid[i]){drop();return}
  // sow a seed of the village's chosen crop; no seed → the plot stays fallow
  const crop=cropOf(v);
  if(!crop||!(v.seed&&v.seed[crop.key]>0)){drop();return}
  v.seed[crop.key]--;
  farmGrid[i]=1;farmSp[i]=crop.i;farmTimer[i]=cropRipen(crop,i);farmTiles.add(i);markMod(i);drop();
 }else if(j.type==='harvest'){
  if(farmGrid[i]===2){
   const crop=(farmSp[i]>=0&&floraSpecies)?floraSpecies[farmSp[i]]:null;
   const f=fertAt(j.x,j.y);
   const gain=Math.max(1,Math.round(((crop?crop.yield:3))*(0.5+f)));   // fertile soil pays more
   p.inv.food+=Math.ceil(gain/2);v.stock.food+=gain;
   if(crop){ harvestPlant(p,crop); (v.seed=v.seed||{})[crop.key]=(v.seed[crop.key]||0)+ri(1,2); }
   fert[i]=clamp(fert[i]-0.05,0,1);                                     // each cropping tires the soil
   // replant if a seed remains, else leave the plot fallow to recover
   if(crop&&v.seed[crop.key]>0){ v.seed[crop.key]--; farmGrid[i]=1;farmTimer[i]=cropRipen(crop,i); }
   else { farmGrid[i]=0;farmSp[i]=-1;farmTiles.delete(i); }
   markMod(i);
   if(chance(.12))tale([p],p.name+' brought in '+(crop?crop.name:'a')+' harvest from the '+v.name+' plots.');
  }
  drop();
 }else if(j.type==='weed'){
  // pull an unhelpful wild plant to make room for the good crop
  const nd=nodeAt.get(i);
  if(nd&&nd.sp!=null)removeNode(nd);
  drop();
  if(chance(.12))tale([p],p.name+' cleared out the weeds choking the '+v.name+' fields.');
 }else if(j.type==='clear'){
  const nd=nodeAt.get(i);
  if(nd&&nd.t==='rock'){removeNode(nd);v.stock.stone+=2;p.inv.stone++}
  else if(!walkable(j.x,j.y)&&clearableSolid(j.x,j.y)){carveFloor(j.x,j.y);v.stock.stone++;p.inv.stone++}
  drop();
  if(chance(.14))tale([p],p.name+' cleared loose rock from the edges of '+v.name+', tidying the ground.');
 }else if(j.type==='tidywall'){
  if(struct[i]===S_WALL)carveFloor(j.x,j.y);
  drop();
  if(chance(.2))tale([p],p.name+' pulled down a stray stub of hedge-wall around '+v.name+'.');
 }else if(j.type==='pave'){
  pavePath(j.x,j.y);drop();
 }
}
// remove a resource node from the world entirely (cleared, not just depleted)
function removeNode(nd){
 const i=idx(nd.x,nd.y),k=nodes.indexOf(nd);
 if(k>=0)nodes.splice(k,1);
 nodeAt.delete(i);markMod(i);
}
/* ================= mining: break the terrain, find what's inside ================= */
// how much punishment a rock tile takes before it shatters — the high, deep
// ground is tougher (and hides richer finds)
// two destroyable tiers: the weak upland gives way quickly, the hard highland resists
function hardnessAt(x,y){ const t=terTier?terTier[idx(x,y)]:1; return t===2?54:22; }
function rockColor(){ const r=(terPals&&terPals[0])?terPals[0].rock.base:[104,104,116]; return 'rgb('+r[0]+','+r[1]+','+r[2]+')'; }
function mineable(x,y){
 const i=idx(x,y);
 return map[i]!==0 && struct[i]===S_ROCK && !nodeAt.has(i) && bld[i]<0 && !dungeonAt(x,y);
}
// deliver a hit to a rock tile; shatters it (and spills its contents) once its
// accumulated damage passes the tile's hardness. agent: {hero} | {p,v}
function mineTile(x,y,power,agent){
 if(!mineable(x,y))return false;
 const i=idx(x,y);
 rockDmg[i]+=power;
 spawnDebris(x*TILE+TILE/2,y*TILE+TILE/2,4,rockColor(),0.6);
 if(rockDmg[i]>=hardnessAt(x,y)){ unearthRock(x,y,agent); return true; }
 return false;
}
// the tile shatters: a burst of debris, the ground opens, stone (and sometimes a
// buried relic or a glint of ore) comes out
function unearthRock(x,y,agent){
 const i=idx(x,y), elev=elevF?elevF[i]:0.5, hard=terTier&&terTier[i]===2, px=x*TILE+TILE/2, py=y*TILE+TILE/2;
 spawnDebris(px,py,16,rockColor(),1.4);
 carveFloor(x,y);           // opens the tile → silDirty re-rounds the neighbouring rock (also clears terTier)
 rockDmg[i]=0;
 const stone=2+(chance(0.35)?1:0)+(hard?2:0);   // the hard highland is richer in stone
 if(agent){
  if(agent.hero)heroStone+=stone;
  if(agent.p)agent.p.inv.stone++;
  if(agent.v)agent.v.stock.stone+=stone;
 }
 // buried treasure — gold is common, gems rarer, relics rare & special. The hard
 // black highland is far richer, and the treasure dial scales the whole yield.
 const findChance=(hard?0.34:0.12+elev*0.10)*wpMul('treasure');
 if(chance(findChance)){
  const r=R();
  const pRelic=hard?0.05:0.02, pGem=hard?0.26:0.13;
  let kind,amt=0,relic=null;
  if(r<pRelic){ kind='relic'; relic=pick(RELICS); }
  else if(r<pRelic+pGem){ kind='gem'; amt=1+(hard?ri(0,2):0); }
  else { kind='gold'; amt=ri(2,6)+(hard?ri(2,5):0); }
  spawnSparkle(px,py);
  if(agent&&agent.hero){
   spawnFind(x,y,kind,amt,relic);
   if(kind==='relic')toast('You struck something buried in the rock — a relic glints in the rubble!');
  }else if(agent&&agent.p){
   // NPCs cash small finds into the town's stone stores; relics still surface as caches
   if(kind==='relic')spawnFind(x,y,kind,amt,relic);
   else if(agent.v)agent.v.stock.stone+=(kind==='gem'?4:1);
   if(chance(.4))tale([agent.p],agent.p.name+' turned up a glint of '+(kind==='gem'?'gemstone':kind==='relic'?'old tech':'gold')+' in the diggings near '+((agent.v&&agent.v.name)||'the workings')+'.');
  }else spawnFind(x,y,kind,amt,relic);
 } else if(chance(0.14)){
  spawnSparkle(px,py);                                   // a thin vein of ore
  if(agent&&agent.hero)heroStone+=1;
 }
 return stone;
}
// ---- debris particles ----
function spawnDebris(px,py,n,col,scale){
 if(particles.length>460)return;
 for(let i=0;i<n;i++){
  const a=Math.random()*6.283, sp=(24+Math.random()*80)*scale;
  particles.push({x:px,y:py,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-34*scale,life:0,max:0.35+Math.random()*0.55*scale,size:1+Math.random()*2.2*scale,col,g:230});
 }
}
function spawnSparkle(px,py){
 if(particles.length>460)return;
 for(let i=0;i<10;i++){
  const a=Math.random()*6.283, sp=26+Math.random()*66;
  particles.push({x:px,y:py,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-46,life:0,max:0.5+Math.random()*0.6,size:1.6,col:'#ffe27a',g:120,spark:true});
 }
}
function updateParticles(rdt){
 for(let i=particles.length-1;i>=0;i--){
  const p=particles[i]; p.life+=rdt; if(p.life>=p.max){particles.splice(i,1);continue}
  p.vy+=p.g*rdt; p.x+=p.vx*rdt; p.y+=p.vy*rdt; p.vx*=(1-1.8*rdt);
 }
}
function drawParticles(c){
 for(const p of particles){
  const k=1-p.life/p.max; c.globalAlpha=p.spark?k:Math.min(1,k*1.4);
  c.fillStyle=p.col; const s=p.size*(p.spark?k:1);
  c.fillRect(p.x-s/2,p.y-s/2,Math.max(1,s),Math.max(1,s));
 }
 c.globalAlpha=1;
}
// a solid tile the village may clear: bramble/rock terrain only — never a
// building, wall, ruin, resource node, or dungeon mouth
function clearableSolid(x,y){
 const i=idx(x,y);
 if(walkable(x,y))return false;
 if(struct[i]===S_WALL||struct[i]===S_HOUSE||struct[i]===S_RUIN)return false;
 if(bld[i]>=0||nodeAt.has(i)||dungeonAt(x,y))return false;
 return true;
}
// lay (or keep) a tidy stone lane on a tile, clearing bramble underneath it first
function pavePath(x,y){
 const i=idx(x,y);
 if(!walkable(x,y)){ if(!clearableSolid(x,y))return false; carveFloor(x,y); }
 if(nodeAt.has(i)||bld[i]>=0||farmGrid[i])return false;
 pavedTiles.add(i);markMod(i);return true;
}
// an L-shaped run of tiles from (x0,y0) to (x1,y1) — the skeleton of a lane
function laneTiles(x0,y0,x1,y1){
 const out=[];const sx=Math.sign(x1-x0),sy=Math.sign(y1-y0);
 for(let x=x0;x!==x1;x+=sx||1){out.push([x,y0]);if(!sx)break}
 for(let y=y0;y!==y1;y+=sy||1){out.push([x1,y]);if(!sy)break}
 out.push([x1,y1]);
 return out;
}

/* ================= romance & interaction ================= */
function interact(p,o){
 const r=relOf(p,o),ro=relOf(o,p);
 Mind.mingle(p.mind,o.mind);   // words rub off: each takes a little of the other's memory
 if(!r.met){
  r.met=true;ro.met=true;
  if(chance(.3))tale([p,o],p.name+' crossed paths with '+o.name+' near '+pick(['the thoughtfruit rows','a quiet pool','the old sundial','the philosophercap terraces','a gap in the hedges'])+'.');
 }
 let compat=0;
 for(const t of p.traits)if(o.traits.includes(t))compat+=4;
 for(const[a,b]of CLASH)if((p.traits.includes(a)&&o.traits.includes(b))||(p.traits.includes(b)&&o.traits.includes(a)))compat-=5;
 for(const[a,b]of KIN)if((p.traits.includes(a)&&o.traits.includes(b))||(p.traits.includes(b)&&o.traits.includes(a)))compat+=3;
 const charm=mod(p,'charm')+mod(o,'charm');
 const roll=rf(-8,10)+compat+charm*4+(mod(p,'social')+mod(o,'social'))*3;
 let d;
 if(roll>2)d=rf(4,10)*(1+Math.max(0,mod(p,'social')));
 else if(roll<-6){
  d=rf(-9,-3);
  if(chance(.35))tale([p,o],p.name+' and '+o.name+' quarreled over '+pick(['the correct way to prune a paradox','a borrowed spade','who saw the silver bee first','an old debt','the ethics of eating mushrooms','nothing at all, really'])+'.');
 }
 else d=rf(-1,2.5);
 applyAff(p,o,d);applyAff(o,p,d*rf(.7,1.1));
 if(chance(.5))interactGossip(p,o);   // and a little talk about who-did-what travels
 if(p.courting===o.id&&o.courting===p.id){
  r.cN++;ro.cN++;
  applyAff(p,o,rf(4,9));applyAff(o,p,rf(4,9));
  if(chance(.35))tale([p,o],pick([p.name+' and '+o.name+' walked the long hedgerow together, talking of everything and nothing.',o.name+' laughed at something '+p.name+' said, and the bees carried it off.',p.name+' and '+o.name+' shared warm thoughtfruit by the evening fires.']));
  if(r.cN>=3)becomePartners(p,o);
  return;
 }
 const adults=p.age>=16&&o.age>=16;
 if(adults&&d>0&&!p.partner&&!o.partner&&!p.courting&&!o.courting&&!isFamily(p,o)&&r.a>32&&ro.a>26){
  const pr=0.20+mod(p,'romance')*0.3+mod(o,'romance')*0.2;
  if(chance(Math.max(0.02,pr))){
   p.courting=o.id;o.courting=p.id;
   tale([p,o],pick(['Beneath the whistling canes, '+p.name+' confessed their feelings to '+o.name+'.',p.name+' left a pressed flower at '+o.name+"'s door. Everyone knew what it meant.",p.name+' asked '+o.name+' to walk the seed-rows at dusk, alone, together.']),true);
  }
 }
}
function becomePartners(p,o){
 if(p.partner||o.partner)return;
 p.courting=null;o.courting=null;
 p.partner=o.id;o.partner=p.id;
 relOf(p,o).a=Math.max(relOf(p,o).a,75);relOf(o,p).a=Math.max(relOf(o,p).a,75);
 tale([p,o],pick([p.name+' and '+o.name+' fell truly in love.','After many walks and small kindnesses, '+p.name+' and '+o.name+' promised themselves to each other.']),true);
 if(p.goal&&p.goal.k==='love')completeGoal(p);
 if(o.goal&&o.goal.k==='love')completeGoal(o);
 const ph=p.home&&!p.home.gone,oh=o.home&&!o.home.gone;
 if(ph&&oh&&p.home!==o.home){
  const keep=p.home.tp==='home'?p.home:o.home.tp==='home'?o.home:p.home;
  const mover=keep===p.home?o:p;
  setHome(mover,keep);
  tale([mover],mover.name+' moved in with '+(keep===p.home?p.name:o.name)+'.');
 }else if(ph&&!oh)setHome(o,p.home);
 else if(oh&&!ph)setHome(p,o.home);
}
/* ================= richer NPC↔NPC interactions ================= */
// five ways the folk of the garden reach for one another beyond a plain chat:
// gifts, gossip, mentorship, consolation, and rivalry.
const socialLog={gift:0,gossip:0,mentor:0,console:0,rival:0};
// a third soul both p and o know, that p holds a strong opinion of
function gossipTarget(p,o){
 const cands=[];
 for(const id in p.rel){
  const r=p.rel[id];if(!r.met||Math.abs(r.a)<20)continue;
  const third=allById.get(+id);
  if(!third||third.dead||third===o||third===p)continue;
  if(!o.rel[id]||!o.rel[id].met)continue;   // gossip only lands about someone o has met
  cands.push(third);
 }
 return cands.length?pick(cands):null;
}
// word about a third party rubs off — reputations travel the hedgerows
function interactGossip(p,o){
 const third=gossipTarget(p,o);
 if(!third)return false;
 const src=relOf(p,third);
 const drift=clamp(src.a*0.12,-6,6)+rf(-1,1);
 applyAff(o,third,drift);
 socialLog.gossip++;
 if(Math.abs(src.a)>40&&chance(.25))tale([p,o],p.name+(src.a>0?' spoke warmly of ':' had little good to say of ')+third.name+', and '+o.name+' took it to heart.');
 return true;
}
function giveGift(p,o){
 let g=null;
 if(p.inv.food>=5){p.inv.food-=3;o.inv.food+=3;g='ripe thoughtfruit'}
 else if(p.inv.wood>=6){p.inv.wood-=3;o.inv.wood+=3;g='good cane-wood'}
 else if(p.inv.stone>=6){p.inv.stone-=3;o.inv.stone+=3;g='sound stone'}
 applyAff(p,o,rf(5,10));applyAff(o,p,rf(8,15));
 buff(o,'social',.15,4,'gift');emote(o,'💗');
 socialLog.gift++;
 if(g&&chance(.5))tale([p,o],p.name+' brought '+o.name+' a gift of '+g+'. '+pick(['A kindness remembered.','Small gifts, deep roots.','The bees approved.']));
}
function doConsole(p,o){
 o.gloomUntil=o.gloomUntil>simMin?Math.max(simMin,o.gloomUntil-rf(3,6)*DAY):o.gloomUntil;
 if(o.gloomUntil<=simMin)o.gloomUntil=0;
 buff(o,'social',.2,4,'comforted');
 applyAff(p,o,rf(4,9));applyAff(o,p,rf(8,16));
 emote(o,'🫂');
 socialLog.console++;
 if(chance(.5))tale([p,o],p.name+' sat a long while with '+o.name+', who was heartsore, and the weight of it lifted a little.');
}
function doMentor(p,o){
 const skill=pick(['work','charm','luck']);
 buff(o,skill,.2,8,'mentored');
 applyAff(p,o,rf(4,8));applyAff(o,p,rf(5,10));
 Mind.mingle(o.mind,p.mind);
 emote(o,'📖');
 socialLog.mentor++;
 if(chance(.5))tale([p,o],pick([p.name+' taught '+o.name+' the old way of '+pick(['reading soil by smell','coaxing shy seeds','mending a trellis','listening to bees','naming the winds'])+'.',o.name+' learned much sitting at '+p.name+"'s side."]));
}
function doRival(p,o){
 const r=relOf(p,o),ro=relOf(o,p);
 r.rival=true;ro.rival=true;
 buff(p,'work',.2,6,'rivalry');buff(o,'work',.2,6,'rivalry');   // competition spurs both harder
 applyAff(p,o,rf(-3,1));applyAff(o,p,rf(-3,1));
 emote(p,'😤');
 socialLog.rival++;
 if(chance(.4))tale([p,o],pick([p.name+' and '+o.name+' traded barbs, each set on out-doing the other.',p.name+' measured every row against '+o.name+"'s, and dug the harder for it.",o.name+' and '+p.name+' are locked in a quiet rivalry the whole garden can feel.']));
}
// find the best target person for a social act; pred returns a score or null
function bestSocial(p,pred){
 let best=null,bs=-1e18;
 for(const o of people){
  if(o===p||o.dead||o.sleeping||o.inDungeon)continue;
  const s=pred(o);if(s==null)continue;
  if(s>bs){bs=s;best=o}
 }
 return best;
}
// try a richer act than a plain chat; returns true if one was set as the task
function specialSocial(p){
 const adult=p.age>=16;
 // GIFT — the generous share surplus with someone they hold dear
 if(adult&&(p.traits.includes('kind')||p.traits.includes('loyal')||p.traits.includes('cheerful'))
    &&(p.inv.food>=5||p.inv.wood>=6||p.inv.stone>=6)&&chance(.55)){
  const o=bestSocial(p,o=>{const r=p.rel[o.id];return(o.age>=6&&r&&r.a>=25)?r.a-Math.sqrt(dist2(p.x,p.y,o.x,o.y))/TILE:null});
  if(o){setTask(p,'gift',{o,rp:0});return true}
 }
 // CONSOLE — comfort a heartsore friend
 if(adult&&(p.traits.includes('kind')||p.traits.includes('loyal')||p.traits.includes('passionate'))&&chance(.6)){
  const o=bestSocial(p,o=>{const r=p.rel[o.id];return(o.gloomUntil>simMin&&r&&r.a>=12)?r.a:null});
  if(o){setTask(p,'console',{o,rp:0});return true}
 }
 // MENTOR — elders pass their craft to the young
 if(p.age>=46&&(p.traits.includes('hardworking')||p.traits.includes('creative')||p.traits.includes('ambitious')||mod(p,'work')>0.12)&&chance(.5)){
  const o=bestSocial(p,o=>{const st=stageOf(o);return(st==='kid'||st==='youth')?60-Math.sqrt(dist2(p.x,p.y,o.x,o.y))/TILE:null});
  if(o){setTask(p,'mentor',{o,rp:0});return true}
 }
 // RIVAL — the ambitious seek out those they measure themselves against
 if(adult&&(p.traits.includes('ambitious')||p.traits.includes('jealous'))&&chance(.4)){
  const o=bestSocial(p,o=>{if(o.age<16)return null;const r=p.rel[o.id];const rivalrous=o.traits.includes('ambitious')||o.traits.includes('jealous');return((r&&r.rival)||(rivalrous&&(!r||r.a<22)))?100-Math.sqrt(dist2(p.x,p.y,o.x,o.y))/TILE:null});
  if(o){setTask(p,'rival',{o,rp:0});return true}
 }
 return false;
}
function wed(p,o){
 p.married=true;o.married=true;p.wedSoon=false;o.wedSoon=false;
 tale([p,o],p.name+' and '+o.name+' were wed under the flowering arch, half the garden singing off-key.',true);
 if(chance(.5))drawCard(chance(.5)?p:o,'At the wedding, the garden');
}
function birth(p,o){
 const home=p.home&&!p.home.gone?p.home:o.home;
 if(!home)return;
 const[hx,hy]=homeTile(home);
 const traits=[];
 const pool=shuffle(p.traits.concat(o.traits));
 traits.push(chance(.6)?pool[0]:pick(TKEYS));
 let t2=chance(.6)?pool[1]:pick(TKEYS);
 let tries=0;while(t2===traits[0]&&tries++<20)t2=pick(TKEYS);
 traits.push(t2);
 const c=newPerson({x:hx*TILE+TILE/2,y:hy*TILE+TILE/2,age:0,traits,parents:[p.id,o.id],mind:Mind.child(p.mind,o.mind)});
 setHome(c,home);
 p.kids.push(c.id);o.kids.push(c.id);
 relOf(p,c).met=true;relOf(c,p).met=true;relOf(o,c).met=true;relOf(c,o).met=true;
 relOf(p,c).a=90;relOf(c,p).a=90;relOf(o,c).a=90;relOf(c,o).a=90;
 tale([p,o,c],p.name+' and '+o.name+' welcomed a child into the garden: little '+c.name+', a brand-new question.',true);
 if(p.goal&&p.goal.k==='family')completeGoal(p);
 if(o.goal&&o.goal.k==='family')completeGoal(o);
}
function completeGoal(p){
 if(!p.goal||p.goal.done)return;
 p.goal.done=true;
 buff(p,'luck',.15,20,'fulfilled');
 tale([p],p.name+"'s heart's wish came true — "+p.goal.t+'. They walked differently after that.',true);
}

/* ================= quests: the Sage helps folk chase their dreams ================= */
// villagers with an unfulfilled arc will, when the Sage stops to talk, sometimes
// ask for a concrete favour toward that dream. Accepted favours become quests.
const QUEST_COOLDOWN=6*DAY;   // per-person gap between asks
let questDirty=false;
let trackedQuest=null;        // id of the quest the Sage is currently guided toward
function trackedQuestObj(){return trackedQuest?quests.find(q=>q.id===trackedQuest):null}
function ensureTracked(){
 if(trackedQuest&&!quests.some(q=>q.id===trackedQuest))trackedQuest=null;
 if(!trackedQuest&&quests.length)trackedQuest=quests[quests.length-1].id;
}
function trackQuest(id){ if(quests.some(q=>q.id===id))trackedQuest=id; questDirty=true; renderQuests(); }
function nearestRockPx(x,y){
 let best=null,bd=1e18;
 for(const n of nodes){if(n.t!=='rock'||n.amt<=0)continue;const cx=n.x*TILE+TILE/2,cy=n.y*TILE+TILE/2;const d=dist2(x,y,cx,cy);if(d<bd){bd=d;best=[cx,cy]}}
 if(best)return best;
 const hx=(x/TILE)|0,hy=(y/TILE)|0;
 for(let r=1;r<40;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
  if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
  const tx=hx+dx,ty=hy+dy;if(tx<0||ty<0||tx>=W||ty>=H)continue;
  if(mineable(tx,ty))return[tx*TILE+TILE/2,ty*TILE+TILE/2];
 }
 return null;
}
// where the Sage should head to advance a quest (pixel coords), or null
function questObjective(q){
 if(!q)return null;
 if(q.kind==='waypoint'&&q.mark)return[q.mark[0]*TILE+TILE/2,q.mark[1]*TILE+TILE/2];
 if(q.kind==='courier'){const tgt=allById.get(q.targetId);return tgt&&!tgt.dead?[tgt.x,tgt.y]:null}
 if(q.kind==='slay'){const m=monsters.length?nearestMonster(hero,0):null;return m?[m.x,m.y]:null}
 if(q.kind==='gather')return nearestRockPx(hero.x,hero.y);
 return null;
}
function questGiverEligible(p){
 return !!(p&&!p.dead&&!p.inDungeon&&p.age>=16&&p.goal&&!p.goal.done&&!p.questId&&simMin-(p.lastQuest||0)>QUEST_COOLDOWN);
}
function farCornerTile(p){
 const px=(p.x/TILE)|0,py=(p.y/TILE)|0;
 const corners=[[4,4],[W-5,4],[4,H-5],[W-5,H-5]];
 corners.sort((a,b)=>dist2(b[0],b[1],px,py)-dist2(a[0],a[1],px,py));
 for(const[cx,cy]of corners){const s=nearOpen(cx,cy);if(s&&!dungeonAt(s[0],s[1])&&dist2(s[0],s[1],px,py)>(18*18))return s}
 return null;
}
function courierTarget(p,g){
 const pool=people.filter(o=>o!==p&&!o.dead&&!o.inDungeon&&o.age>=16&&(g!=='love'||(!o.partner&&!p.partner)));
 return pool.length?pick(pool):null;
}
function buildQuest(p){
 const g=p.goal.k;
 const mk=(kind,extra)=>Object.assign({id:nextId++,giver:p.id,giverName:p.name,goal:g,kind,progress:0,need:1,done:false,accepted:0,offered:simMin},extra);
 if(g==='wander'){
  const spot=farCornerTile(p);if(!spot)return null;
  return mk('waypoint',{mark:spot,title:'Scout a far corner',
   ask:'There is a corner of this garden I will never reach on these legs — out past where my nerve runs dry. Go and stand in it for me, Sage, so it can be said someone from here has.',
   desc:'Stand in the far corner '+p.name+' longs to reach.'});
 }
 if(g==='craft'){
  const need=ri(6,12);
  return mk('gather',{need,title:'Stone for a little shop',
   ask:'I mean to raise a shop with my own hands, but the ground here hoards its stone. Chip me '+need+' up out of the rock and I can finally lay a floor.',
   desc:'Mine '+need+' stone toward '+p.name+"'s shop."});
 }
 if(g==='family'||g==='quiet'){
  return mk('slay',{title:g==='family'?'Guard the household':'Still the dark',
   ask:g==='family'?'Something creeps at the edge of my little home after dark. I cannot raise children under that shadow — would you put it down?':'All I want is a quiet old age beside a warm kettle, but a thing out of the dark keeps breaking the peace. Would you still it, just once?',
   desc:'Slay a monster to ease '+p.name+"'s mind."});
 }
 // love / fellows → carry something to another soul
 const tgt=courierTarget(p,g);if(!tgt)return null;
 return mk('courier',{targetId:tgt.id,targetName:tgt.name,mark:[(tgt.x/TILE)|0,(tgt.y/TILE)|0],
  title:g==='love'?'Carry a love-token':'Carry warm words',
  ask:g==='love'?('There is someone whose name tastes of rain — '+tgt.name+' — and I have not the courage. Carry this token to them, and let them know a heart here beats their way.'):('Take my warmest greetings to '+tgt.name+'. A friendship is only a message that kept on walking.'),
  desc:'Bring '+p.name+"'s "+(g==='love'?'token':'greetings')+' to '+tgt.name+'.'});
}
function acceptQuest(q){
 if(!q)return;
 q.accepted=simMin;
 if(q.kind==='gather')q.base=heroStone;
 quests.push(q);
 trackedQuest=q.id;   // guide toward the freshly-taken dream
 const g=allById.get(q.giver);
 if(g){g.questId=q.id;g.lastQuest=simMin;emote(g,'✦')}
 toast('✦ Dream taken up: '+q.title,'card');
 if(g)tale([g],g.name+' asked the wandering Sage for help — '+q.desc,false);
 questDirty=true;renderQuests();
}
function declineQuest(q){
 if(!q)return;
 const g=allById.get(q.giver);if(g)g.lastQuest=simMin;
 toast('You let the moment pass.');
}
function cancelQuest(q,why){
 const i=quests.indexOf(q);if(i>=0)quests.splice(i,1);
 const g=allById.get(q.giver);if(g&&g.questId===q.id)g.questId=null;
 if(why)toast('✦ '+why);
 questDirty=true;
}
function creditSlay(){
 let any=false;
 for(const q of quests)if(q.kind==='slay'&&!q.done){q.progress++;any=true}
 if(any)questDirty=true;
}
function updateQuests(dt){
 for(let i=quests.length-1;i>=0;i--){
  const q=quests[i],g=allById.get(q.giver);
  if(!g||g.dead){cancelQuest(q,'The one who asked is gone.');continue}
  if(simMin-q.accepted>10*DAY){buff(g,'social',-.1,3,'letdown');cancelQuest(q,g.name+' stopped hoping.');continue}
  let done=false;
  if(q.kind==='waypoint'){
   if(dist2(hero.x,hero.y,q.mark[0]*TILE+TILE/2,q.mark[1]*TILE+TILE/2)<(2.4*TILE)**2)done=true;
  }else if(q.kind==='gather'){
   const prog=Math.max(0,heroStone-q.base);
   if(prog!==q.progress){q.progress=prog;questDirty=true}
   if(q.progress>=q.need)done=true;
  }else if(q.kind==='slay'){
   if(q.progress>=q.need)done=true;
  }else if(q.kind==='courier'){
   const tgt=allById.get(q.targetId);
   if(!tgt||tgt.dead){cancelQuest(q,'There was no one left to carry it to.');continue}
   q.mark=[(tgt.x/TILE)|0,(tgt.y/TILE)|0];
   if(dist2(hero.x,hero.y,tgt.x,tgt.y)<(2.4*TILE)**2)done=true;
  }
  if(done)finishQuest(q);
 }
 if(questDirty){renderQuests();questDirty=false}
}
function finishQuest(q){
 const i=quests.indexOf(q);if(i>=0)quests.splice(i,1);
 const g=allById.get(q.giver);
 Hero.renown=(Hero.renown||0)+1;
 const ups=heroGainXp(4);if(ups>0)toast('🌟 The Sage reaches level '+Hero.level);
 if(g){
  g.questId=null;
  buff(g,'luck',.2,12,'helped');buff(g,'social',.15,8,'helped');emote(g,'🎉');
  if(q.kind==='waypoint'){completeGoal(g)}
  else if(q.kind==='gather'){g.wantsBiz=true;buff(g,'work',.25,20,'shopstock');heroStone=Math.max(0,heroStone-q.need);}
  else if(q.kind==='courier'){
   const tgt=allById.get(q.targetId);
   if(tgt&&!tgt.dead){
    healRel(g,tgt,q.goal==='love'?42:26);
    if(q.goal==='love'){g.courting=true;tgt.courting=true}
    if(q.goal==='fellows')completeGoal(g);
   }
  }else if(q.kind==='slay'){buff(g,'work',.1,6,'safe')}
  tale([g],'The Sage saw '+g.name+"'s wish through — "+q.desc+' '+pick(['They will not forget it.','Word of it will travel.','A small light, kept.']),true);
 }
 toast('✦ Dream kept for '+(q.giverName||'someone')+'! (renown '+Hero.renown+')','card');
 questDirty=true;renderQuests();
 if(selected&&!selected.dead)renderPanelLive(selected);
}
function renderQuests(){
 ensureTracked();
 const badge=$('qbadge');
 if(badge){badge.textContent=quests.length;badge.classList.toggle('hidden',quests.length===0)}
 const list=$('questList');if(!list)return;
 list.innerHTML='';
 if(!quests.length){const d=document.createElement('div');d.className='none';d.textContent='No dreams in your keeping just now. Talk to the folk of the garden — some will ask for help.';list.appendChild(d);return}
 for(const q of quests){
  const row=document.createElement('div');row.className='q'+(q.id===trackedQuest?' tracked':'');
  const prog=q.kind==='gather'?(' — '+Math.min(q.progress,q.need)+'/'+q.need+' stone'):q.kind==='slay'?(' — '+(q.progress>=q.need?'done':'0/1')):'';
  const tag=q.id===trackedQuest?'<span class="qtrack">◎ guiding</span>':'';
  row.innerHTML='<div class="qt">✦ '+q.title+tag+'</div><div class="qd">'+q.desc+'</div><div class="qp">for '+(q.giverName||'—')+prog+'</div>';
  row.onclick=()=>{trackedQuest=q.id;renderQuests();toast('◎ Guiding you to: '+q.title)};
  list.appendChild(row);
 }
}
function die(p,cause){
 if(p.dead)return;
 p.dead=true;p.task=null;p.path=null;p.sleeping=false;
 const i=people.indexOf(p);if(i>=0)people.splice(i,1);
 const causeText={age:'passed away in their sleep, full of years',hunger:'succumbed to hunger, far from any table',doom:"answered the card that Death had dealt them",edited:'was quietly unwritten by the gardener’s hand',collapse:'was taken by a collapse'}[cause]||'passed beyond the hedge-light';
 const friends=knownRels(p).filter(([o,r])=>r.a>=30).length;
 const bits=[];
 bits.push(Math.max(1,Math.floor(p.age))+' summers lived');
 if(p.kids.length)bits.push(p.kids.length+(p.kids.length>1?' children':' child'));
 if(friends)bits.push(friends+(friends>1?' dear friends':' dear friend'));
 if(p.cards.length)bits.push(p.cards.length+' cards drawn from the garden');
 tale([p],p.name+' '+causeText+'. '+bits.join(', ')+'. The garden folds them gently under.',true);
 if(p.business&&!p.business.gone)tale([p],p.business.name+' went dark, its sign creaking in the wind.');
 if(p.partner){
  const o=allById.get(p.partner);
  if(o&&!o.dead){
   o.partner=null;o.married=false;o.gloomUntil=simMin+6*DAY;
   tale([o],o.name+' grieved for '+p.name+', and for a long while spoke only to the moss.',true);
  }
 }
 if(p.courting){const o=allById.get(p.courting);if(o&&!o.dead){o.courting=null;o.gloomUntil=simMin+4*DAY}}
 for(const kid of p.kids){const k=allById.get(kid);if(k&&!k.dead)tale([k],k.name+' planted a small white flower for '+p.name+', and kept it watered.')}
 if(p.home&&!p.home.gone){p.home.owners=p.home.owners.filter(id=>id!==p.id)}
 addGrave(p);
 freeCorpseSprite(p);
 if(selected===p)renderPanelFull(p);
}
// The dead linger in allById (for grave inspection), but their full animated
// sprite is dozens of canvases each — over a long sim that grew until the
// browser silently blanked the big terrain canvases. Free the sprite on death,
// keeping just one portrait frame; the buried are dropped entirely once their
// grave blooms away (see bloomGrave).
function freeCorpseSprite(p){
 if(p.sprite&&p.sprite.FRAMES&&p.sprite.FRAMES.walk&&p.sprite.FRAMES.walk[0])p.portrait=p.sprite.FRAMES.walk[0][0];
 p.sprite=null;
}

/* ================= daily tick ================= */
const MUSINGS=['{n} watched a snail cross the path and called it a pilgrimage.','{n} argued with a rosebush and, by all accounts, lost.','{n} buried a word in the seed-rows to see what it grows.','{n} counted the petals of a thoughtfruit blossom: odd again. Troubling.','{n} listened to a beehive and swears it was buffering.','{n} whispered a question to the moss and is still waiting for the reply packet.','{n} found a strand of dead cable in the loam and planted it, hopefully.','{n} practiced being a tree. Reviews were mixed.'];
const AMBIENT=['A warm wind combed the meadow, and every stalk bent the same polite degree.','The philosophercaps pulsed in sync, as if the ground were refreshing.','Far under the hills something old hummed one clean note and went quiet.','All afternoon the garden smelled of green ink, ozone, and beginnings.','A migration of moths crossed the sky, spelling nothing, beautifully.','A dead streetlamp deep in the hedgerow flickered once, for no one, then slept again.'];
function dailyTick(){
 seasonTick();
 eventDailyTick();
 merchantDailyTick();
 shrineDailyTick();
 if(chance(.3))tale([],(Lore.active&&Lore.line(6,16))||pick(AMBIENT));
 const snapshot=people.slice();
 let giftDone=false;
 for(const p of snapshot){
  if(p.dead)continue;
  pruneBuffs(p);
  if(!p.cameOfAge&&p.age>=16){
   p.cameOfAge=true;
   p.goal=pickGoal(p);
   tale([p],p.name+' came of age — '+traitPhrase(p)+', with a heart set on '+p.goal.t.replace(/^to /,'')+'.',true);
   drawCard(p,'On their coming of age, the garden');
  }
  if(p.hermitUntil&&p.hermitUntil<=simMin){
   p.hermitUntil=0;p.base.luck+=.04;
   tale([p],p.name+' returned from the wild edges with clearer eyes.');
  }
  if(p.age>=16&&chance(.12))drawCard(p,null);
  if(chance(.08))tale([p],(Lore.active&&(p.name+' '+Lore.line(4,12)))||pick(MUSINGS).replace('{n}',p.name));
  if(p.doom&&cday()>=p.doom){die(p,'doom');continue}
  if(p.age>p.lifespan&&chance(0.05+(p.age-p.lifespan)*0.08)){die(p,'age');continue}
  if(p.partner&&p.id<p.partner){
   const o=allById.get(p.partner);
   if(o&&!o.dead){
    const a=relOf(p,o).a;
    if(!p.married&&(p.wedSoon||o.wedSoon||(a>45&&chance(.08))))wed(p,o);
    if(a<0&&chance(.25)){
     p.partner=null;o.partner=null;p.married=false;o.married=false;
     p.gloomUntil=simMin+3*DAY;o.gloomUntil=simMin+3*DAY;
     tale([p,o],p.name+' and '+o.name+' drifted apart, and finally parted ways.',true);
    }else if(o.home&&p.home===o.home&&p.kids.length<3&&p.age<50&&o.age<50){
     const pr=0.14*(1+mod(p,"fert")+mod(o,"fert"))*((p.goal&&p.goal.k==='family')||(o.goal&&o.goal.k==='family')?1.5:1);
     if(chance(pr))birth(p,o);
    }
   }
  }
  if(!giftDone&&p.traits.includes('kind')&&p.age>=16&&p.home&&!p.home.gone&&totalMat(p,'wood')>=COST.shelter.wood+3&&(!p.task||p.task.k==='wander')){
   for(const[o,r]of knownRels(p)){
    if(r.a>=25&&o.age>=16&&(!o.home||o.home.gone)){
     if(startBuild(p,'shelter',o)){giftDone=true}
     break;
    }
   }
  }
  if(p.goal&&!p.goal.done){
   const g=p.goal.k;
   if(g==='craft'&&p.business&&p.business.prosperity>=5)completeGoal(p);
   else if(g==='wander'&&p.visited.size>=openChunks.size*0.6)completeGoal(p);
   else if(g==='fellows'&&knownRels(p).filter(([o,r])=>r.a>=30).length>=4)completeGoal(p);
   else if(g==='quiet'&&p.home&&!p.home.gone&&p.home.tp==='home'&&p.age>=50)completeGoal(p);
  }
 }
 maintainCivilization();   // newcomers in good times; a fall + founding expedition when the town dies out
 // tech relics pay out their treasure trickle to whoever carries them
 for(const p of people){
  if(p.dead)continue;
  for(const r of p.relics)if(r.treasure){
   if(p.home&&!p.home.gone&&p.home.stock)p.home.stock[r.treasure.res]+=r.treasure.amt;
   else p.inv[r.treasure.res]=(p.inv[r.treasure.res]||0)+r.treasure.amt;
  }
 }
 for(const id of Hero.relics){const r=TF.byId[id];if(r&&r.treasure)depositResource(r.treasure.res,r.treasure.amt,hero.x,hero.y)}
 // relics surface as the age decays; the forest slowly reclaims stray tech
 {
  const tgt=relicTarget();
  if(salvage.length<tgt&&chance(.5)){spawnSalvage();if(salvage.length&&chance(.3))tale([],'Something old works its way up through the soil, catching the light.')}
  else if(salvage.length>tgt+3&&eraGreen()>0.6&&chance(.25))salvage.pop();
 }
 // fauna wax in green ages and thin out toward the waste
 {
  const at=animalTarget();
  if(animals.length<at&&chance(.5))spawnAnimal();
  else if(animals.length>at+2&&chance(.15)){const a=animals[ri(0,animals.length-1)];if(a&&!a.tame)a.dead=true}
 }
 // flyers likewise — flocks arrive on the wing, thin out toward the waste
 {
  const ft=flyerTarget();
  if(flyers.length<ft){ if(chance(.35))spawnFlock(); else if(chance(.6))spawnFlyer(); }
  else if(flyers.length>ft+6&&chance(.2)){const fl=flyers[ri(0,flyers.length-1)];if(fl)fl.dead=true}
 }
 // the age turns, and the land with it (the ground re-composites live in frame())
 if(surfEra&&chance(.05))tale([],pick(surfEra.lines));
 ecologyTick();
 villageTick();
 upkeepTick();
}

/* ================= sim step ================= */
function stepSim(dt){
 simMin+=dt;
 const d=cday();
 if(d!==dayMark){dayMark=d;dailyTick()}
 // resource regrowth — stone always; plants only really regrow in green ages,
 // and slowly wither back (never fully to nothing) as the wasteland takes over
 {
  const g=eraGreen();
  for(const n of nodes){
   if(n.t==='rock'){ if(n.amt<n.max){n.rt-=dt;if(n.rt<=0){n.amt++;n.rt=n.reg}} continue; }
   // plants regrow faster in fertile, well-suited soil (and only in green ages)
   const sp=speciesOf(n), f=fertAt(n.x,n.y);
   const rate=g*(0.35+f*1.1)*(sp?(0.5+plantSuit(sp,f)*0.9):1)*seasonFertMul();
   if(n.amt<n.max){ n.rt-=dt*rate; if(n.rt<=0){ n.amt++; n.rt=n.reg } }
   if(g<0.35 && n.amt>1 && chance(dt*0.02*(0.4-g))) n.amt--;
  }
 }
 for(const d of dungeons)if(d.restock&&simMin>=d.restock){d.loot=clamp(d.loot+0.4,0,1.3);d.danger=d.cleansed?d.danger:clamp(d.danger-0.04,.2,.95);d.restock=0}
 processExpeditions();
 updateMonsters(dt);
 if(quests.length)updateQuests(dt);
 updateAnimals(dt);
 updateFlyers(dt);
 if(WATER_ON)weatherTick(dt);
 ripenAll(dt);
 heroParkTick(dt);
 for(let i=people.length-1;i>=0;i--){
  const p=people[i];
  if(p.dead)continue;
  updatePerson(p,dt);
 }
}
function parkAt(x,y){ if(!inB(x,y))return null; const bi=bld[idx(x,y)]; if(bi>=0){const b=buildings[bi]; if(b&&!b.gone&&!b.ruined&&b.tp==='park')return b;} return null; }
// the Sage can wander straight through a village green; it settles the nerves
function heroParkTick(dt){
 if(interior||hero.down){hero._inPark=false;return}
 const p=parkAt((hero.x/TILE)|0,(hero.y/TILE)|0);
 if(p){
  if(!hero._inPark){hero._inPark=true;toast('🌳 The green quiets everything for a moment.')}
  if(Hero.hp<Hero.maxHp&&chance(dt*0.015))Hero.hp++;
 }else hero._inPark=false;
}
function updatePerson(p,dt){
 if(p.inDungeon){p.age+=dt/(DAY*2);return}
 p.age+=dt/(DAY*2);
 p.hunger=clamp(p.hunger+0.055*dt*(p.age<12?0.7:1),0,100);
 if(p.hp<100){const threatened=monsters.length&&nearestMonster(p,12*TILE);p.hp=clamp(p.hp+(threatened?0:0.05)*dt,0,100)}
 if(p.moving||p.working)p.animClock+=dt*0.12;
 if(p.sleeping){
  p.energy=clamp(p.energy+(p.home&&!p.home.gone?0.18:0.10)*dt,0,100);
  const t=tod();
  if(p.energy>=99||(t>0.25&&t<0.85&&p.energy>62)){p.sleeping=false;p.thinkT=simMin+rf(1,4)}
 }else{
  p.energy=clamp(p.energy-0.075*dt,0,100);
  if(p.hermitUntil<simMin)p.socialN=clamp(p.socialN+0.055*dt,0,100);
 }
 if(p.hunger>=100){p.starv+=dt;if(p.starv>2*DAY){die(p,'hunger');return}}
 else p.starv=0;
 if(p.chatHold>simMin){p.moving=false;return}
 if(p.sleeping)return;
 if(p.task)doTask(p,dt);
 else{
  p.moving=false;
  const soon=monsters.length&&nearestMonster(p,9*TILE)?0.6:rf(3,9);
  if(simMin>=p.thinkT){
   think(p);
   if(!p.task)p.thinkT=simMin+soon;
  }
 }
}

/* ================= the Understories (dungeon mouths) ================= */
const DUN_ADJ=['Weeping','Sunless','Drowned','Gnawed','Whispering','Forgotten','Overclocked','Hungry','Corrupted','Broken','Endless','Unspoken'];
const DUN_NOUN=['Understory','Rootcellar','Tanglewell','Descent','Datavault','Mycelium','Server-Vault','Compost','Fissure','Substrate','Labyrinth','Rot'];
// Tech Forge relics: generated icons + a granted SKILL and (sometimes) a
// TREASURE trickle, for the Sage and for NPCs alike.
function relicObj(c){return {g:c.glyph,n:c.name,k:c.k,v:c.v,d:c.d,id:c.id,skill:c.skill,treasure:c.treasure,heroStat:c.heroStat}}
const RELICS=TF.CATALOG.map(relicObj);
const relicIconCache=new Map();
function iconFromBase(base,px){
 const cv=document.createElement('canvas');cv.width=px;cv.height=px;
 const c=cv.getContext('2d');c.imageSmoothingEnabled=false;
 c.drawImage(base,0,0,px,px);
 return cv;  // a fresh node every call (safe to insert into the DOM)
}
function relicBase(id){
 if(!id)return null;
 let base=relicIconCache.get(id);
 if(!base){base=TF.bakeCatalog(id,32,0.5);relicIconCache.set(id,base)}
 return base;
}
function relicIcon(id,px){
 px=px||24;
 return iconFromBase(relicBase(id),px);
}
// build a fully generated relic (random look + a real payload) for the Tech Forge
function forgeRelic(){
 const base=pick(RELICS);
 const params=TF.randomParams(R);    // fully procedural: wild shape, greebles, palette & hue
 const iconBase=TF.bakeParams(params,32,0.5);
 return {g:base.g,n:base.n,k:base.k,v:base.v,d:base.d,id:base.id,skill:base.skill,
   treasure:base.treasure,heroStat:base.heroStat,_iconBase:iconBase,_params:params};
}
// deposit a relic's treasure yield for a person or the Sage
function depositResource(res,amt,x,y){
 const v=nearestVillage({x,y})||villages[0];
 if((res==='food'||res==='stone')&&v){v.stock[res]+=amt;return}
 const homes=buildings.filter(b=>!b.gone&&!b.ruined&&b.done&&b.stock);
 if(homes.length){let best=homes[0],bd=1e18;for(const b of homes){const d=dist2(x,y,(b.x+1)*TILE,(b.y+1)*TILE);if(d<bd){bd=d;best=b}}best.stock[res]+=amt}
}
function heroStatApply(rel){
 const s=rel.heroStat;
 if(s==='dmg')Hero.dmg+=0.25;
 else if(s==='speed')Hero.speedMul*=1.12;
 else if(s==='range')Hero.rangeMul*=1.15;
 else if(s==='arc')Hero.arcMul*=1.15;
 else if(s==='hp'){Hero.maxHp++;Hero.hp=Math.min(Hero.maxHp,Hero.hp+1)}
}
// pocket a ground find: gold & gems bank into the Sage's purse; a rare relic installs
function collectFind(sv){
 if(sv.kind==='relic'||(!sv.kind&&sv.relic)){ grantHeroRelic(sv.relic||pick(RELICS)); return; }
 if(sv.kind==='gem'){ const n=sv.amt||1; heroGems+=n; emote2Hero('💎'); spawnSparkle(hero.x,hero.y); toast('💎 '+n+' gem'+(n>1?'s':'')+'  ·  '+heroGems+' held'); }
 else { const n=sv.amt||1; heroGold+=n; emote2Hero('🪙'); toast('🪙 '+n+' gold  ·  '+heroGold+' held'); }
}
function grantHeroRelic(rel){
 if(!rel)return;
 Hero.relics.push(rel.id);
 heroStatApply(rel);
 toast('🔩 '+rel.n+' online — '+rel.skill);
 tale([],'The Sage jacked in '+rel.n+' — the '+rel.skill+' skill. '+rel.d+'.',true);
}
function dangerWord(d){return d<.28?'uneasy':d<.45?'dangerous':d<.62?'deadly':d<.8?'a death-trap':'a legend of ruin'}
function makeDungeon(x,y){
 const dunName=()=>Lore.active?'The '+Lore.name(4,11):'The '+pick(DUN_ADJ)+' '+pick(DUN_NOUN);
 let nm=dunName(),tr=0;
 while(usedDun.has(nm)&&tr++<20)nm=dunName();
 usedDun.add(nm);
 const d={id:nextId++,x,y,name:nm,danger:rf(.24,.42),depth:ri(2,5),loot:rf(.7,1),restock:0,
  raids:0,deaths:0,relicsFound:0,inside:new Set(),cleansed:false};
 dungeons.push(d);
 return d;
}
function dungeonAt(x,y){for(const d of dungeons)if(d.x===x&&d.y===y)return d;return null}
function nearestDungeon(p){
 let best=null,bd=1e18;
 for(const d of dungeons){const dd=dist2(p.x,p.y,d.x*TILE,d.y*TILE);if(dd<bd){bd=dd;best=d}}
 return best;
}
function questAppetite(p){
 let a=0.04;
 if(p.traits.includes('brave'))a+=.14;
 if(p.traits.includes('ambitious'))a+=.06;
 if(p.traits.includes('curious'))a+=.08;
 if(p.traits.includes('timid'))a-=.06;
 if(p.traits.includes('lazy'))a-=.05;
 if(p.goal&&p.goal.k==='wander'&&!p.goal.done)a+=.08;
 if(!p.home||p.home.gone)a+=.04;
 if(p.relics.length)a+=.03;
 return clamp(a,0,.5);
}
function wantsToQuest(p){
 if(p.age<16||p.age>58||p.inDungeon||p.dead)return false;
 if(p.energy<52||p.hunger>52||p.gloomUntil>simMin)return false;
 if(cday()<p.nextQuestDay)return false;
 if(!dungeons.length)return false;
 return chance(questAppetite(p));
}
function formExpedition(p){
 const d=nearestDungeon(p);
 if(!d)return false;
 let exp=expeditions.find(e=>!e.departed&&e.dungeon===d&&e.members.length<3&&cday()<=e.formDay);
 if(exp){
  exp.members.push(p);exp.arrived.set(p.id,false);
  setTask(p,'togodungeon',{d,exp});
  tale([p],p.name+' resolved to join the expedition into '+d.name+'.');
  return true;
 }
 exp={dungeon:d,members:[p],arrived:new Map([[p.id,false]]),formDay:cday(),departed:false,leader:p.id};
 expeditions.push(exp);
 setTask(p,'togodungeon',{d,exp});
 const recruits=[];
 const pool=knownRels(p).filter(([o,r])=>!o.dead&&!o.inDungeon&&o.age>=16&&o.age<=58&&o.energy>=45&&o.hunger<=58&&(!o.task||o.task.k!=='togodungeon'));
 pool.sort((a,b)=>(b[1].a+(p.partner===b[0].id?60:0))-(a[1].a+(p.partner===a[0].id?60:0)));
 for(const[o,r]of pool){
  if(recruits.length>=2)break;
  if(r.a<14&&p.partner!==o.id)continue;
  const keen=p.partner===o.id?0.7:0.42+r.a/260+questAppetite(o);
  if(chance(keen)){
   exp.members.push(o);exp.arrived.set(o.id,false);
   setTask(o,'togodungeon',{d,exp});
   recruits.push(o);
  }
 }
 const who=recruits.length?p.name+', with '+recruits.map(o=>o.name).join(' and ')+',':p.name+', alone,';
 tale(exp.members,who+' set out to read the rough drafts kept in '+d.name+' — '+dangerWord(d.danger)+', they say.',true);
 return true;
}
function departExpedition(exp){
 exp.departed=true;
 const d=exp.dungeon;
 const dur=rf(.35,.9)*DAY*d.depth/3;
 exp.endMin=simMin+Math.max(180,dur);
 for(const p of exp.members){
  if(p.dead)continue;
  p.inDungeon=true;p.task=null;p.path=null;p.moving=false;p.sleeping=false;
  d.inside.add(p.id);
  emote(p,'🔦');
 }
 const live=exp.members.filter(p=>!p.dead);
 if(live.length)tale(live,live.map(p=>p.name).join(' and ')+' went down into '+d.name+', lantern-light swallowed by the dark.',true);
}
function resolveExpedition(exp){
 const d=exp.dungeon;
 d.raids++;
 const alive=exp.members.filter(p=>!p.dead&&p.inDungeon);
 for(const p of exp.members){d.inside.delete(p.id);p.inDungeon=false}
 if(!alive.length){expeditions.splice(expeditions.indexOf(exp),1);return}
 const party=alive.length;
 const survivors=[],fallen=[];
 for(const p of alive){
  const spot=nearOpen(d.x,d.y)||[d.x,d.y];
  p.x=spot[0]*TILE+TILE/2;p.y=spot[1]*TILE+TILE/2;p.path=null;p.task=null;
  p.nextQuestDay=cday()+ri(3,7);
  let risk=d.danger*(0.34-0.07*(party-1));
  risk*= (1-clamp(mod(p,'luck'),-.4,.5));
  if(p.traits.includes('brave'))risk*=.8;
  risk=clamp(risk,0.01,0.5);
  if(chance(risk)){fallen.push(p)}
  else survivors.push(p);
 }
 const rich=d.loot;
 for(const p of survivors){
  const boon=(0.6+rich)*(0.8+d.depth*0.14);
  p.inv.food+=Math.round(rf(2,6)*boon);
  p.inv.wood+=Math.round(rf(2,6)*boon);
  p.inv.stone+=Math.round(rf(2,5)*boon);
  buff(p,'luck',.08,6,'deep-touched');
  if(p.goal&&p.goal.k==='wander')p.visited.add(((d.x>>3))+','+((d.y>>3)));
 }
 let relicFinder=null,relic=null;
 const relicChance=clamp(0.14+d.depth*0.05+rich*0.1,0,.6);
 if(survivors.length&&chance(relicChance)){
  relicFinder=pick(survivors);relic=pick(RELICS);
  giveRelic(relicFinder,relic);d.relicsFound++;
 }
 if(survivors.length&&!fallen.length){
  const names=survivors.map(p=>p.name).join(' and ');
  tale(survivors,names+' climbed back out of '+d.name+', packs heavy with '+pick(['glimmering ore','strange preserved fruit','cut cane and stranger things','the spoils of the deep'])+'.',true);
 }else if(survivors.length&&fallen.length){
  const s=survivors.map(p=>p.name).join(' and '),f=fallen.map(p=>p.name).join(' and ');
  tale(survivors,s+' staggered out of '+d.name+' with treasure and grief — '+f+' did not come back.',true);
 }else{
  const f=fallen.map(p=>p.name).join(' and ');
  tale(fallen,f+' was lost forever to '+d.name+'. Not even a lantern remained.',true);
 }
 if(relic)tale([relicFinder],'In the lowest gallery, '+relicFinder.name+' found '+relic.g+' the '+relic.n+' — '+relic.d+'.',true);
 for(let i=0;i<survivors.length;i++)for(let j=i+1;j<survivors.length;j++){
  healRel(survivors[i],survivors[j],28);
 }
 for(const p of fallen){d.deaths++;questDeath(p,d,survivors)}
 d.loot=clamp(d.loot-0.14,0.15,1.4);
 if(!d.cleansed)d.danger=clamp(d.danger+0.03,0,.95);
 d.restock=simMin+rf(6,12)*DAY;
 expeditions.splice(expeditions.indexOf(exp),1);
}
function questDeath(p,d,survivors){
 p.dead=true;p.task=null;p.path=null;p.inDungeon=false;
 const i=people.indexOf(p);if(i>=0)people.splice(i,1);
 tale([p],p.name+' fell in the depths of '+d.name+', '+Math.floor(p.age)+' summers old, '+(p.cards.length)+' cards spent. The dark keeps them now.',true);
 if(p.partner){const o=allById.get(p.partner);if(o&&!o.dead){o.partner=null;o.married=false;o.gloomUntil=simMin+7*DAY;tale([o],o.name+' waited at the mouth of '+d.name+' for '+p.name+', who never climbed out.',true)}}
 if(p.courting){const o=allById.get(p.courting);if(o&&!o.dead){o.courting=null;o.gloomUntil=simMin+4*DAY}}
 for(const kid of p.kids){const k=allById.get(kid);if(k&&!k.dead)tale([k],k.name+' grew up with only stories of '+p.name+', who went into the deep for them.')}
 if(p.home&&!p.home.gone)p.home.owners=p.home.owners.filter(id=>id!==p.id);
 if(p.business&&!p.business.gone)tale([p],p.business.name+' shuttered, its keeper lost below.');
 const s=nearOpen(d.x,d.y);if(s){const b={i:buildings.length,id:nextId++,tp:'grave',x:s[0],y:s[1],w:1,h:1,prog:1,need:1,done:true,gone:false,owners:[],builder:p.id,forId:null,stock:null,prosperity:0,sub:null,name:null,ref:p.id,born:simMin};buildings.push(b);if(bld[idx(s[0],s[1])]<0)bld[idx(s[0],s[1])]=b.i}
 freeCorpseSprite(p);
 if(selected===p)renderPanelFull(p);
}
function giveRelic(p,relic){
 p.relics.push(relic);
 p.base[relic.k]=(p.base[relic.k]||0)+relic.v;
}
function processExpeditions(){
 for(let i=expeditions.length-1;i>=0;i--){
  const e=expeditions[i];
  if(e.departed){
   if(simMin>=e.endMin)resolveExpedition(e);
   continue;
  }
  const all=e.members.every(p=>p.dead||e.arrived.get(p.id));
  const leaderArr=e.arrived.get(e.leader);
  const graced=cday()>e.formDay;
  const anyArr=[...e.arrived.values()].some(v=>v);
  if((all&&anyArr)||(graced&&leaderArr)){
   e.members=e.members.filter(p=>!p.dead&&(e.arrived.get(p.id)||p.id===e.leader&&leaderArr));
   if(e.members.length)departExpedition(e);
   else expeditions.splice(i,1);
  }else if(cday()>e.formDay+2){
   for(const p of e.members)if(!p.dead&&p.task&&p.task.k==='togodungeon')p.task=null;
   expeditions.splice(i,1);
  }
 }
}

/* ================= monsters (mostly peaceful surface — occasional risers) ================= */
function monsterCap(){return Math.max(0,Math.round(Math.min(16,3+((people.length/3)|0))*wpMul('monsters')))}   // the dark presses harder now
function spawnMonster(d,at){
 if(monsters.length>=monsterCap()||peaceful||(d&&d.cleansed))return;
 const r=R();
 let type='grub';
 if(r<d.danger*0.35)type='horror';
 else if(r<0.25+d.danger*0.4)type='lurker';
 const M=MONSTERS[type];
 const s=at?nearOpen(at[0],at[1]):nearOpen(d.x,d.y);if(!s)return;
 const m={id:nextId++,type,x:s[0]*TILE+TILE/2,y:s[1]*TILE+TILE/2,fx:1,dirIdx:0,animClock:R()*4,
  hp:M.hp,maxhp:M.hp,dmg:M.dmg,spd:M.spd,col:M.col,g:M.g,name:M.n,
  home:d,target:null,path:null,pi:0,atkCd:0,roamT:0,em:null,born:simMin,atkAnim:0,
  camp:null,socialCd:rf(20,60),raid:null,raidUntil:0};
 monsters.push(m);
 emote2(m,'❗');
 tale([],'Something '+pick(['wet','many-rooted','wrong','pale and huge'])+' came up out of '+d.name+' — a '+M.n+'.',true);
 return m;
}
function emote2(m,g){m.em={g,until:performance.now()+2000}}
function nearestSettler(mx,my,filter){
 let best=null,bd=1e18;
 for(const p of people){
  if(p.dead||p.inDungeon||(filter&&!filter(p)))continue;
  const d=dist2(mx,my,p.x,p.y);
  if(d<bd){bd=d;best=p}
 }
 if(heroTargetable()){
  const d=dist2(mx,my,hero.x,hero.y);
  if(d<bd){bd=d;best=HERO_T}
 }
 return best?[best,Math.sqrt(bd)]:[null,1e9];
}
function monsterMove(m,tx,ty,dt){
 if(!m.path||m.pi>=m.path.length||simMin-(m.rp||0)>30){
  m.rp=simMin;
  const p=findPath((m.x/TILE)|0,(m.y/TILE)|0,tx,ty);
  if(!p){return false}m.path=p;m.pi=0;
 }
 let d=WALK*m.spd*dt;
 while(d>0&&m.path&&m.pi<m.path.length){
  const w=m.path[m.pi],dx=w.x-m.x,dy=w.y-m.y,L=Math.hypot(dx,dy);
  if(L<1.4){m.pi++;continue}
  if(Math.abs(dx)>0.4)m.fx=dx>0?1:-1;
  m.dirIdx=CFHelp.angToDir(Math.atan2(dy,dx));
  const mv=Math.min(d,L);m.x+=dx/L*mv;m.y+=dy/L*mv;d-=mv;
 }
 if(m.pi>=m.path.length)m.path=null;
 return true;
}
function updateMonster(m,dt){
 if(m.atkCd>0)m.atkCd-=dt;
 if(m.atkAnim>0)m.atkAnim-=dt;
 m.animClock+=dt*0.12;
 let[t,td]=nearestSettler(m.x,m.y,p=>!p.inDungeon);
 // risers only lock onto prey within sight; beyond that they idle, gather, and camp.
 // camped or raiding risers are roused and hunt further afield.
 const per=((m.type==='horror'?20:m.type==='lurker'?16:12)+(isNight()?6:0)+(m.camp||m.raid?8:0))*TILE;
 if(t&&td>per){t=null}
 m.target=t;
 if(!t){
  monsterSocial(m,dt);
  // raiders press on toward their objective even before prey comes into view
  if(m.raid&&simMin<m.raidUntil){
   if(!m.path||m.pi>=m.path.length)monsterMove(m,m.raid[0],m.raid[1],dt);else monsterMove(m,0,0,dt);
   if(dist2(m.x,m.y,m.raid[0]*TILE,m.raid[1]*TILE)<(4*TILE)**2)m.raid=null;
   return;
  }
  m.raid=null;
  // a camp gives a riser reason to linger; lone roamers sink back into the dark
  if(!m.camp&&simMin-m.born>3*DAY){killMonster(m,null,true);return}
  // idle wandering: circle the camp if part of one, else the home dungeon
  const ax=m.camp?m.camp.tx:m.home.x, ay=m.camp?m.camp.ty:m.home.y, rad=m.camp?4:6;
  if(!m.path){const rx=clamp(ax+ri(-rad,rad),1,W-2),ry=clamp(ay+ri(-rad,rad),1,H-2);monsterMove(m,rx,ry,dt)}
  else monsterMove(m,0,0,dt);
  return;
 }
 if(td<TILE*1.1){
  if(m.atkCd<=0){
   m.atkCd=22;m.atkAnim=8;
   hurtSettler(t,m);
  }
  m.batter=0;
 }else{
  const moved=monsterMove(m,(t.x/TILE)|0,(t.y/TILE)|0,dt);
  if(!moved){
   const wall=wallToward(m,t);
   if(wall){
    m.batter=(m.batter||0)+dt;
    if(chance(dt*0.05))emote2(m,'💢');
    if(m.batter>rf(70,110)){carveFloor(wall[0],wall[1]);m.batter=0;m.path=null;
     tale([],'The '+m.name+' gnawed a breach through the hedge-walls of the nearest village!',true);}
   }else{
    const ax=t.x-m.x,ay=t.y-m.y,L=Math.hypot(ax,ay)||1;
    m.x+=ax/L*WALK*m.spd*dt*0.35;m.y+=ay/L*WALK*m.spd*dt*0.35;
   }
  }else m.batter=0;
 }
 if(simMin-m.born>4*DAY&&chance(dt*0.002)){killMonster(m,null,true)}
}
function wallToward(m,t){
 const cx=(m.x/TILE)|0,cy=(m.y/TILE)|0;
 const dx=Math.sign(t.x-m.x),dy=Math.sign(t.y-m.y);
 const cands=[[cx+dx,cy],[cx,cy+dy],[cx+dx,cy+dy],[cx+dx,cy-dy],[cx-dx,cy+dy]];
 let best=null,bd=1e18;
 for(const[x,y]of cands){
  if(!inB(x,y)||struct[idx(x,y)]!==S_WALL)continue;
  const d=dist2(x*TILE,y*TILE,t.x,t.y);
  if(d<bd){bd=d;best=[x,y]}
 }
 return best;
}
function hurtSettler(p,m){
 if(p.isHero){hurtHero(m);return}
 if(p.dead)return;
 let dmg=m.dmg*rf(.7,1.1);
 if(p.traits.includes('brave'))dmg*=.85;
 p.hp-=dmg;
 p.sleeping=false;
 emote(p,'💥');
 p.chatHold=0;
 if(shouldFight(p))setTask(p,'fight',{m});
 else{p.fleeUntil=simMin+120;p.task=null}
 if(p.hp<=0)dieByMonster(p,m);
 else if(chance(.25))tale([p],pick([p.name+' was struck by the '+m.name+' and reeled back, bleeding.',p.name+' took a wound from the '+m.name+'.']));
}
function shouldFight(p){
 if(p.age<16||p.age>60)return false;
 if(p.hp<28)return false;
 let base=p.traits.includes('brave')?0.9:p.traits.includes('timid')?0.15:0.5;
 base+=mod(p,'work')*0.2;
 let allies=0;for(const o of people)if(o!==p&&!o.dead&&!o.inDungeon&&dist2(p.x,p.y,o.x,o.y)<(10*TILE)**2)allies++;
 base+=Math.min(.35,allies*0.09);
 return chance(base);
}
function settlerAttack(p,m,dt){
 let dmg=(11+mod(p,'work')*14)*dt*0.25;
 if(p.traits.includes('brave'))dmg*=1.4;
 for(const r of p.relics)if(r.k==='work')dmg*=1.15;
 m.hp-=dmg;
 if(chance(dt*0.04))emote(p,'⚔');
 m.aggro=p;
 if(m.hp<=0)killMonster(m,p,false);
}
function killMonster(m,slayer,despawn){
 const i=monsters.indexOf(m);if(i>=0)monsters.splice(i,1);
 for(const p of people)if(p.task&&p.task.k==='fight'&&p.task.m===m)p.task=null;
 if(despawn){return}
 const defenders=people.filter(p=>!p.dead&&!p.inDungeon&&dist2(p.x,p.y,m.x,m.y)<(9*TILE)**2&&p.age>=16);
 if(slayer&&!slayer.dead)slayer.kills++;
 for(const p of defenders){buff(p,'social',.15,4,'triumph');p.fleeUntil=0}
 if(m.type==='horror'&&slayer&&!slayer.dead&&chance(.5)){const relic=pick(RELICS);giveRelic(slayer,relic);tale([slayer],slayer.name+' pried '+relic.g+' the '+relic.n+' from the husk of the understory daemon.',true)}
 if(slayer&&!slayer.dead){
  const help=defenders.filter(p=>p!==slayer).slice(0,3);
  if(help.length){
   for(const h of help)healRel(slayer,h,18);
   tale([slayer,...help],slayer.name+', with '+help.map(p=>p.name).join(' and ')+', brought down the '+m.name+'. The garden breathes easier tonight.',true);
  }else tale([slayer],slayer.name+' stood alone and slew the '+m.name+'.',true);
 }else tale([],'The '+m.name+' was driven off and destroyed.',true);
 const s=nearOpen((m.x/TILE)|0,(m.y/TILE)|0);
 if(s&&slayer&&!slayer.dead){slayer.inv.food+=ri(2,5)}
}
function heroKillMonster(m){
 const i=monsters.indexOf(m);if(i>=0)monsters.splice(i,1);
 for(const p of people)if(p.task&&p.task.k==='fight'&&p.task.m===m)p.task=null;
 Hero.kills++;
 if(quests.length)creditSlay();
 const xp={grub:2,lurker:4,horror:8}[m.type]||2;
 const ups=heroGainXp(xp);
 if(ups>0)toast('🌟 The Sage reaches level '+Hero.level);
 tale([],'The wandering Sage cut down the '+m.name+'. '+pick(['The meadow exhaled.','The bees applauded, in their way.','Somewhere below, the dark took notes.']),true);
 if(m.type==='horror'&&chance(.5)){
  const adults=people.filter(p=>!p.dead&&p.age>=16);
  if(adults.length){const relic=pick(RELICS),lucky=pick(adults);giveRelic(lucky,relic);
   tale([lucky],'The Sage pried '+relic.g+' the '+relic.n+' from the horror’s corpse — and pressed it into '+lucky.name+'’s hands.',true)}
 }
 if(chance(.3)&&Hero.hp<Hero.maxHp){Hero.hp++;toast('♥ recovered')}
}
function hurtHero(m){
 if(hero.ifr>0||hero.down)return;
 Hero.hp--; hero.ifr=1.2; hero.hurtFlash=0.4;
 if(navigator.vibrate)navigator.vibrate([30,40,30]);
 if(Hero.hp<=0){
  hero.down=true;hero.downT=0;
  tale([],'The wandering Sage was composted by a '+m.name+'. The garden, patient as ever, begins them again.',true);
 }
}
function dieByMonster(p,m){
 if(p.dead)return;
 p.dead=true;p.task=null;p.path=null;p.sleeping=false;
 const i=people.indexOf(p);if(i>=0)people.splice(i,1);
 tale([p],p.name+' was slain by the '+m.name+', '+Math.floor(p.age)+' summers old. The garden is poorer for it.',true);
 if(p.partner){const o=allById.get(p.partner);if(o&&!o.dead){o.partner=null;o.married=false;o.gloomUntil=simMin+7*DAY;o.fleeUntil=0;setTask(o,'fight',{m,avenge:true});tale([o],o.name+' saw '+p.name+' fall, and threw themselves at the '+m.name+' with a cry.',true)}}
 for(const kid of p.kids){const k=allById.get(kid);if(k&&!k.dead)tale([k],k.name+' lost '+p.name+' to the things beneath the garden.')}
 if(p.home&&!p.home.gone)p.home.owners=p.home.owners.filter(id=>id!==p.id);
 addGrave(p);
 freeCorpseSprite(p);
 if(selected===p)renderPanelFull(p);
}
function updateMonsters(dt){
 for(let i=monsters.length-1;i>=0;i--)updateMonster(monsters[i],dt);
 if(peaceful){if(camps.length)camps.length=0;return}
 campTick(dt);
 for(const d of dungeons){
  d.spawnT=(d.spawnT||simMin+rf(1.6,3.2)*DAY);
  if(simMin>=d.spawnT){
   d.spawnT=simMin+rf(1.6,3.4)*DAY/(0.6+d.danger);
   if(d.cleansed)continue;
   if(people.length>=4&&chance(.75)){
    spawnMonster(d);
    // heavier waves only once a settlement is healthy, so a battered village can recover
    if(people.length>=8&&chance(.4+d.danger*0.4)){spawnMonster(d)}
    if(people.length>=12&&chance(d.danger*0.3)){spawnMonster(d)}
   }
  }
 }
 // rare warband against the hedge-walls of an established village
 if(chance(dt*0.00008)&&monsters.length<monsterCap()-1){
  const walled=villages.filter(v=>v.founded<cday()-2);
  if(walled.length){
   const d=dungeons.filter(dd=>!dd.cleansed).sort((a,b)=>b.danger-a.danger)[0];
   if(d){const n=ri(2,3);let spawned=0;for(let k=0;k<n;k++){const before=monsters.length;spawnMonster(d);if(monsters.length>before)spawned++}
    if(spawned>1)tale([],'A warband came clawing up out of '+d.name+', making straight for the hedge-walls of '+pick(walled).name+'.',true);}
  }
 }
}

/* ================= monster camps & social behavior ================= */
// the dark doesn't only hunt — it gathers. Idle risers cluster into surface
// camps, huddle and squabble amongst themselves, then muster into warbands.
const MON_SCORE={grub:1,lurker:2.2,horror:4};
function monScore(m){return (MON_SCORE[m.type]||1)*(0.5+0.5*m.hp/m.maxhp)}
function campMembers(camp){return monsters.filter(m=>m.camp===camp)}
function campName(){return pick(['the Gnawing','the Ashen Ring','the Root-Coven','the Hollow Muster','the Bramble Warren','the Sump Court','the Cinder Nest','the Pale Circle','the Gall-Wake','the Rotward'])}
function nearAnyVillage(tx,ty,pad){for(const v of villages){const rr=(v.rad||6)+pad;if(dist2(tx,ty,v.cx,v.cy)<rr*rr)return true}return false}
function nearestDungeonTile(tx,ty){let best=null,bd=1e18;for(const d of dungeons){if(d.cleansed)continue;const dd=dist2(tx,ty,d.x,d.y);if(dd<bd){bd=dd;best=d}}return best}
function nearestVillageTile(tx,ty){let best=null,bd=1e18;for(const v of villages){const dd=dist2(tx,ty,v.cx,v.cy);if(dd<bd){bd=dd;best=v}}return best}
function foundCamp(m){
 const bx=(m.x/TILE)|0,by=(m.y/TILE)|0;let spot=null;
 for(let tries=0;tries<24&&!spot;tries++){
  const x=clamp(bx+ri(-2,2),1,W-2),y=clamp(by+ri(-2,2),1,H-2);
  if(!walkable(x,y)||nodeAt.has(idx(x,y))||dungeonAt(x,y))continue;
  if(nearAnyVillage(x,y,5))continue;
  spot=[x,y];
 }
 if(!spot)return null;
 const camp={id:nextId++,tx:spot[0],ty:spot[1],x:spot[0]*TILE+TILE/2,y:spot[1]*TILE+TILE/2,
  founded:simMin,leader:m.id,name:campName(),raidT:simMin+rf(1.2,2.2)*DAY,reinforceT:simMin+rf(1.4,2.4)*DAY,flare:0};
 camps.push(camp);m.camp=camp;emote2(m,'🔥');
 tale([],'The risers stopped fleeing the light and began to gather above ground — a camp, '+camp.name+', taking root.',true);
 return camp;
}
function joinCamp(m,camp){m.camp=camp;if(chance(.5))emote2(m,'❗')}
function disbandCamp(camp){const i=camps.indexOf(camp);if(i<0)return;camps.splice(i,1);for(const m of monsters)if(m.camp===camp)m.camp=null;tale([],camp.name+' guttered out — its risers scattered back into the dark.',false)}
function spawnAtCamp(camp){const d=nearestDungeonTile(camp.tx,camp.ty)||dungeons[0];if(!d)return null;return spawnMonster(d,[camp.tx,camp.ty])}
function campTick(dt){
 // free, surface-bound risers gravitate together
 for(const m of monsters){
  if(m.camp||m.target||simMin-m.born<0.4*DAY)continue;
  let joined=false;
  for(const camp of camps){if(dist2(m.x,m.y,camp.x,camp.y)<(7*TILE)**2){joinCamp(m,camp);joined=true;break}}
  if(joined)continue;
  if(chance(dt*0.02)){
   const buddy=monsters.find(o=>o!==m&&!o.camp&&!o.target&&dist2(m.x,m.y,o.x,o.y)<(3.5*TILE)**2);
   if(buddy){const founder=monScore(m)>=monScore(buddy)?m:buddy;const camp=foundCamp(founder);if(camp)joinCamp(founder===m?buddy:m,camp)}
  }
 }
 // camp lifecycle: leadership, reinforcement, raids
 for(let i=camps.length-1;i>=0;i--){
  const camp=camps[i],mem=campMembers(camp);
  if(mem.length===0){disbandCamp(camp);continue}
  camp.flare=Math.max(0,camp.flare-dt);
  if(!mem.some(m=>m.id===camp.leader)){const top=mem.slice().sort((a,b)=>monScore(b)-monScore(a))[0];camp.leader=top.id;emote2(top,'💢')}
  if(mem.length>=3&&simMin>=camp.reinforceT){
   camp.reinforceT=simMin+rf(1.4,2.4)*DAY;
   if(monsters.length<monsterCap()){const nb=spawnAtCamp(camp);if(nb){nb.camp=camp;camp.flare=6;tale([],'Something new clawed up into '+camp.name+' — the camp swells.',true)}}
  }
  if(mem.length>=3&&simMin>=camp.raidT&&!eventActive('aurora')){
   camp.raidT=simMin+rf(1.2,2.2)*DAY;
   const v=nearestVillageTile(camp.tx,camp.ty);
   if(v){camp.flare=9;for(const m of mem){m.raid=[v.cx,v.cy];m.raidUntil=simMin+rf(220,360)}
    tale([],camp.name+' boiled up as a warband and set off toward '+v.name+'.',true)}
  }
 }
}
function monsterSocial(m,dt){
 m.socialCd-=dt;if(m.socialCd>0)return;m.socialCd=rf(30,70);
 let other=null,bd=(2.6*TILE)**2;
 for(const o of monsters){if(o===m||o.target)continue;const d=dist2(m.x,m.y,o.x,o.y);if(d<bd){bd=d;other=o}}
 if(!other)return;
 const kin=m.camp&&m.camp===other.camp;
 if(kin||m.type===other.type){
  // huddle: dark solidarity mends them a little; the leader steadies the pack
  const heal=kin?rf(3,7):rf(1,3);
  m.hp=Math.min(m.maxhp,m.hp+heal);other.hp=Math.min(other.maxhp,other.hp+heal);
  if(chance(.5))emote2(m,kin?'🔥':'❗');
 }else if(chance(.45)){
  // squabble between rival breeds — a nip, and the weaker gives ground
  const win=monScore(m)>=monScore(other)?m:other,lose=win===m?other:m;
  lose.hp=Math.max(1,lose.hp-rf(2,6));emote2(win,'💢');emote2(lose,'💨');
  lose.path=null;lose.roamT=0;
 }
}

/* ================= fauna (the Animal Forge) ================= */
// there is more life in a green age than a grey one
function animalTarget(){ return Math.round((2 + eraGreen()*12)*wpMul('fauna')*seasonFaunaMul()); }
function spawnAnimal(key,made){
 let spot=null;
 for(let t=0;t<40&&!spot;t++){
  const[x,y]=randOpenTile();
  if(bld[idx(x,y)]>=0||nodeAt.has(idx(x,y))||dungeonAt(x,y))continue;
  if(dist2(x*TILE,y*TILE,hero.x,hero.y)<8*TILE*8*TILE)continue;
  spot=[x,y];
 }
 if(!spot)return null;
 // natural spawns mostly invent brand-new species; the rest lean on the familiar
 // archetypes (which themselves reroll into something novel each time)
 if(!key&&!made&&R()<0.28){const bag=['deer','deer','rabbit','rabbit','boar','fox','wolf'];key=pick(bag)}
 made=made||AF.make(key||null,seed+'-'+nextId+'-'+((R()*1e9)|0));
 const s=made.spec;
 const a={id:nextId++,made,key:made.key,spec:s,name:made.name,temper:s.temper,
  x:spot[0]*TILE+TILE/2,y:spot[1]*TILE+TILE/2,fx:1,dirIdx:0,animClock:R()*4,anim:'walk',
  hp:s.hp,maxhp:s.hp,dmg:s.dmg,spd:s.spd,sizeScale:made.sizeScale,dead:false,
  wgoal:null,wgoalT:0,atkCd:0,fleeUntil:0,em:null,sprite:null};
 animals.push(a);
 bakeQueue.push({kind:'animal',a});
 return a;
}
function emoteA(a,g){a.em={g,until:performance.now()+1600}}
// move a critter by (dx,dy), sliding along blocked axes; returns the distance
// actually travelled so callers can tell when the animal is stuck
function moveCritter(a,dx,dy){
 const ox=a.x,oy=a.y, nx=a.x+dx,ny=a.y+dy;
 if(walkable((nx/TILE)|0,(ny/TILE)|0)){a.x=nx;a.y=ny}
 else if(walkable((nx/TILE)|0,(a.y/TILE)|0))a.x=nx;
 else if(walkable((a.x/TILE)|0,(ny/TILE)|0))a.y=ny;
 a.x=clamp(a.x,TILE,W*TILE-TILE);a.y=clamp(a.y,TILE,H*TILE-TILE);
 return Math.hypot(a.x-ox,a.y-oy);
}
function steer(a,tx,ty,dt,mul){
 const dx=tx-a.x,dy=ty-a.y,L=Math.hypot(dx,dy)||1;
 const step=WALK*a.spd*(mul||1)*dt;
 const ox=a.x,oy=a.y;
 const moved=moveCritter(a,dx/L*step,dy/L*step);
 // face by the direction actually travelled, not the goal vector — so an animal
 // sliding along a wall points along the wall instead of twitching toward the goal
 if(moved>step*0.2){
  const mvx=a.x-ox,mvy=a.y-oy;
  if(Math.abs(mvx)>0.2)a.fx=mvx>0?1:-1;
  a.dirIdx=CFHelp.angToDir(Math.atan2(mvy,mvx));
  a.anim='walk';
 }
 return moved;
}
function fleeCritter(a,fx,fy,dt){
 const ax=a.x-fx,ay=a.y-fy,L=Math.hypot(ax,ay)||1;
 steer(a,a.x+ax/L*6*TILE,a.y+ay/L*6*TILE,dt,1.35);
}
function wanderCritter(a,dt){
 const reached=a.wgoal&&dist2(a.x,a.y,a.wgoal[0],a.wgoal[1])<(TILE*1.1)**2;
 // pick a fresh goal when we arrive, the dwell expires, or we've been stuck a while
 if(!a.wgoal||simMin>=a.wgoalT||reached||(a.stuck||0)>7){
  a.stuck=0;
  if(reached||chance(.4)){a.wgoal=null;a.wgoalT=simMin+rf(20,60);a.anim='idle'}  // graze/rest
  else{
   for(let tries=0;tries<8;tries++){
    const tx=clamp(((a.x/TILE)|0)+ri(-5,5),1,W-2),ty=clamp(((a.y/TILE)|0)+ri(-5,5),1,H-2);
    if(walkable(tx,ty)){a.wgoal=[tx*TILE+TILE/2,ty*TILE+TILE/2];a.wgoalT=simMin+rf(45,95);break}
   }
  }
 }
 if(a.wgoal&&simMin<a.wgoalT){
  const moved=steer(a,a.wgoal[0],a.wgoal[1],dt,0.55);
  if(moved<WALK*a.spd*0.55*dt*0.2)a.stuck=(a.stuck||0)+1; else a.stuck=0;
 }else{a.anim='idle'}
}
function biteAnimalTarget(a,tgt){
 emoteA(a,a.temper==='predator'?'🦷':'💢');
 if(tgt.isHero){hurtHero({name:a.spec.label});return}
 tgt.hp-=a.dmg; tgt.fleeUntil=simMin+240; emoteA(tgt,'💥');
 if(tgt.hp<=0)killAnimal(tgt,a);
 else a.spd=a.spec.spd; // keep chasing
}
function killAnimal(a,slayer){
 if(a.dead)return; a.dead=true;
 const i=animals.indexOf(a);if(i>=0)animals.splice(i,1);
 if(companion===a)companion=null;
 if(slayer&&slayer!==hero&&slayer.temper==='predator'){slayer.hp=Math.min(slayer.maxhp,slayer.hp+6);slayer.wgoal=null}
 // a felled beast leaves carrion — meat on the ground that draws scavengers in
 if(a.spec&&!a.spec.tiny)carrion.push({x:a.x,y:a.y,amt:2+((a.maxhp/12)|0),until:simMin+rf(2,4)*DAY,t:0});
}
function nearestCarrion(a,range){
 let best=null,bd=(range*TILE)**2;
 for(const c of carrion){if(c.amt<=0)continue;const d=dist2(a.x,a.y,c.x,c.y);if(d<bd){bd=d;best=c}}
 return best;
}
function carrionTick(dt){
 for(let i=carrion.length-1;i>=0;i--){
  const c=carrion[i]; c.t=(c.t||0)+dt;
  if(c.amt<=0||simMin>=c.until){carrion.splice(i,1);continue}
 }
}
function heroKillAnimal(a){
 killAnimal(a,hero);
 const xp={rabbit:1,fowl:1,deer:2,fox:2,boar:3,wolf:3}[a.key]||1;
 const ups=heroGainXp(xp);
 if(ups>0)toast('🌟 The Sage reaches level '+Hero.level);
 // a felled animal feeds the nearest table
 if(chance(.7))depositResource('food',ri(1,3),a.x,a.y);
 if(chance(.25))tale([],'The Sage took a '+a.spec.label+' for the pot.');
}
function nearestPredator(a,range){
 let best=null,bd=(range*TILE)**2;
 for(const o of animals)if(o!==a&&!o.dead&&o.temper==='predator'){const d=dist2(a.x,a.y,o.x,o.y);if(d<bd){bd=d;best=o}}
 for(const m of monsters){const d=dist2(a.x,a.y,m.x,m.y);if(d<bd){bd=d;best=m}}
 if(heroTargetable()){const d=dist2(a.x,a.y,hero.x,hero.y);if(d<bd){bd=d;best={x:hero.x,y:hero.y,isHero:true}}}
 return best;
}
function updateAnimal(a,dt){
 if(a.tame){companionAI(a,dt);return}
 if(a.atkCd>0)a.atkCd-=dt;
 a.animClock+=dt*0.12;
 a.anim='walk';
 // freshly-hurt prey just runs
 if(a.temper!=='predator'&&a.fleeUntil>simMin){
  const thr=nearestPredator(a,14)||{x:hero.x,y:hero.y};
  fleeCritter(a,thr.x,thr.y,dt);return;
 }
 if(a.temper==='predator'){
  // hunt the nearest prey animal; the bold also stalk the Sage
  let prey=null,pd=(a.spec.aggro*TILE)**2;
  for(const o of animals)if(o!==a&&!o.dead&&o.temper==='prey'){const d=dist2(a.x,a.y,o.x,o.y);if(d<pd){pd=d;prey=o}}
  let tgt=prey;
  if(!tgt&&a.spec.bold&&heroTargetable()){
   const d=dist2(a.x,a.y,hero.x,hero.y);
   if(d<(a.spec.aggro*TILE)**2)tgt={x:hero.x,y:hero.y,isHero:true};
  }
  if(tgt){
   if(dist2(a.x,a.y,tgt.x,tgt.y)<(TILE*1.2)**2){
    a.anim='attack';a.fx=tgt.x>a.x?1:-1;a.dirIdx=CFHelp.angToDir(Math.atan2(tgt.y-a.y,tgt.x-a.x));
    if(a.atkCd<=0){a.atkCd=18;biteAnimalTarget(a,tgt)}
   }else steer(a,tgt.x,tgt.y,dt,1.2);
   return;
  }
  // no live prey about — scavenge a carcass instead
  const car=nearestCarrion(a,a.spec.aggro+2);
  if(car){
   if(dist2(a.x,a.y,car.x,car.y)<(TILE*1.1)**2){
    a.anim='idle';a.feedCd=(a.feedCd||0)-dt;
    if(a.feedCd<=0){a.feedCd=10;car.amt--;a.hp=Math.min(a.maxhp,a.hp+5);if(chance(.4))emoteA(a,'🍖')}
   }else steer(a,car.x,car.y,dt,1.0);
   return;
  }
 }else{
  // prey / neutral: flee a nearby threat (neutral has a short fuse and holds ground more)
  const thr=nearestPredator(a,a.temper==='neutral'?4:a.spec.flee);
  if(thr){
   if(a.temper==='neutral'&&thr.isHero&&dist2(a.x,a.y,thr.x,thr.y)<(2.6*TILE)**2){
    // a cornered boar gores
    if(dist2(a.x,a.y,thr.x,thr.y)<(TILE*1.2)**2){a.anim='attack';if(a.atkCd<=0){a.atkCd=26;biteAnimalTarget(a,thr)}}
    else steer(a,thr.x,thr.y,dt,1.1);
    return;
   }
   fleeCritter(a,thr.x,thr.y,dt);return;
  }
  // prey herd loosely with their own kind — safety in numbers
  if(a.temper==='prey'){
   let hx=0,hy=0,n=0;
   for(const o of animals){if(o===a||o.dead||o.temper!=='prey')continue;const d=dist2(a.x,a.y,o.x,o.y);if(d<(7*TILE)**2&&d>(2.2*TILE)**2){hx+=o.x;hy+=o.y;n++}}
   if(n>=2&&chance(dt*0.14)){steer(a,hx/n,hy/n,dt,0.6);return}
  }
 }
 wanderCritter(a,dt);
}
function updateAnimals(dt){
 carrionTick(dt);
 for(let i=animals.length-1;i>=0;i--){const a=animals[i];if(a.dead){animals.splice(i,1);continue}updateAnimal(a,dt)}
}
/* ---- the Sage's companion: a befriended critter that heels, fights & forages ---- */
let befriendCand=null, befriendT=0;
function companionAI(a,dt){
 if(a.atkCd>0)a.atkCd-=dt;
 a.animClock+=dt*0.12; a.anim='walk';
 // snap at a monster that comes near the Sage
 let m=null,md=(4*TILE)**2;
 for(const mm of monsters){const d=dist2(a.x,a.y,mm.x,mm.y);if(d<md){md=d;m=mm}}
 if(m){
  if(dist2(a.x,a.y,m.x,m.y)<(TILE*1.2)**2){
   a.anim='attack';a.fx=m.x>a.x?1:-1;a.dirIdx=CFHelp.angToDir(Math.atan2(m.y-a.y,m.x-a.x));
   if(a.atkCd<=0){a.atkCd=16;m.hp-=6+Hero.level*2;emote2(m,'💥');emoteA(a,'🐾');if(m.hp<=0)heroKillMonster(m);}
  }else steer(a,m.x,m.y,dt,1.3);
  return;
 }
 // otherwise heel — follow the Sage, keeping a small gap, and forage when settled
 const d=dist2(a.x,a.y,hero.x,hero.y);
 if(d>(2.2*TILE)**2)steer(a,hero.x,hero.y,dt,d>(6*TILE)**2?1.7:1.0);
 else{
  a.anim='idle';
  a.sniffCd=(a.sniffCd==null?rf(25,55):a.sniffCd)-dt;
  if(a.sniffCd<=0){a.sniffCd=rf(30,70);
   if(chance(.4)){spawnFind((a.x/TILE)|0,(a.y/TILE)|0,'gold',ri(1,3));emoteA(a,'🪙');}
   else if(chance(.4)){depositResource(pick(['stone','food']),ri(1,2),a.x,a.y);emoteA(a,'✨');}
   else emoteA(a,'👃');
  }
 }
}
function tameAnimal(a){
 if(!a||a.dead)return null;
 if(companion){companion.tame=false;companion.sniffCd=null}
 companion=a; a.tame=true; a.temper='prey'; a.fleeUntil=0; a.sniffCd=null;
 befriendCand=null;befriendT=0;
 emoteA(a,'💚');
 toast('🐾 '+(a.spec.label||'A creature')+' befriends the Sage.');
 tale([],'A '+(a.spec.label||'wild thing')+' fell into step beside the Sage and would not be shooed away — a companion, then.',true);
 return a.name;
}
// loiter beside a calm critter and it comes to trust you
function befriendTick(rdt){
 if(companion||hero.down||interior||inDialog){befriendCand=null;befriendT=0;return}
 let best=null,bd=(1.7*TILE)**2;
 for(const a of animals){if(a.dead||a.tame||a.temper==='predator'||a.fleeUntil>simMin)continue;const d=dist2(a.x,a.y,hero.x,hero.y);if(d<bd){bd=d;best=a}}
 if(!best){befriendCand=null;befriendT=0;return}
 if(befriendCand!==best){befriendCand=best;befriendT=0}
 befriendT+=rdt;
 if(((performance.now()/280|0)%2)===0)emoteA(best,'❔');
 if(befriendT>=3)tameAnimal(best);
}

/* ================= flyers: birds & insects, some in flocks ================= */
function flyerTarget(){ return Math.round((6 + eraGreen()*20)*wpMul('fauna')*seasonFaunaMul()); }   // skies busier in green ages
function spawnFlyer(key,made,flockId,x,y){
 made=made||AF.makeFlyer(key||null, seed+'-fly-'+nextId+'-'+((R()*1e9)|0));
 if(x===undefined){const s=randOpenTile();x=s[0]*TILE+TILE/2;y=s[1]*TILE+TILE/2}
 const s=made.spec;
 const fl={id:nextId++,made,kind:made.kind,name:made.name,spec:s,label:s.label,
  x,y,vx:rf(-0.6,0.6),vy:rf(-0.6,0.6),dirIdx:0,animClock:R()*4,
  elev:s.elev,spd:s.spd||1.8,flock:!!s.flock,flockId:flockId||('solo'+nextId),
  goal:null,goalT:0,sizeScale:made.sizeScale,dead:false};
 flyers.push(fl);
 if(made._preview&&!made._sprite)made._sprite=made._preview;    // reuse editor bake
 if(!made._sprite&&!made._baking){made._baking=true;bakeQueue.push({kind:'flyer',made})}
 return fl;
}
function spawnFlock(){
 const made=AF.makeFlyer(null, seed+'-flk-'+((R()*1e9)|0));   // one species, shared sprite
 const fid='flk'+(flockSeq++), n=ri(5,9);
 const s=randOpenTile(),bx=s[0]*TILE,by=s[1]*TILE;
 for(let i=0;i<n;i++){
  spawnFlyer(made.kind,made,fid,clamp(bx+rf(-3.5,3.5)*TILE,TILE,W*TILE-TILE),clamp(by+rf(-3.5,3.5)*TILE,TILE,H*TILE-TILE));
 }
 return made;
}
function updateFlyer(fl,dt){
 fl.animClock+=dt*0.16;
 let ax=0,ay=0;
 if(fl.flock){
  let cx=0,cy=0,avx=0,avy=0,n=0,sx=0,sy=0;
  for(const o of flyers){
   if(o===fl||o.dead||o.flockId!==fl.flockId)continue;
   const d=dist2(fl.x,fl.y,o.x,o.y);
   if(d<(9*TILE)**2){cx+=o.x;cy+=o.y;avx+=o.vx;avy+=o.vy;n++;
    if(d<(2.0*TILE)**2){const dd=Math.sqrt(d)||1;sx+=(fl.x-o.x)/dd;sy+=(fl.y-o.y)/dd}}
  }
  if(n){cx/=n;cy/=n;avx/=n;avy/=n;
   ax+=(cx-fl.x)*0.0012+(avx-fl.vx)*0.03+sx*0.7;     // cohesion + alignment + separation
   ay+=(cy-fl.y)*0.0012+(avy-fl.vy)*0.03+sy*0.7;
  }
 }
 // a drifting waypoint keeps them roaming
 if(!fl.goal||simMin>=fl.goalT||dist2(fl.x,fl.y,fl.goal[0],fl.goal[1])<(1.5*TILE)**2){
  fl.goal=[clamp(fl.x+rf(-9,9)*TILE,2*TILE,(W-2)*TILE),clamp(fl.y+rf(-9,9)*TILE,2*TILE,(H-2)*TILE)];
  fl.goalT=simMin+rf(20,70);
 }
 const gdx=fl.goal[0]-fl.x,gdy=fl.goal[1]-fl.y,gl=Math.hypot(gdx,gdy)||1;
 ax+=gdx/gl*0.06;ay+=gdy/gl*0.06;
 // scatter from the Sage (and any prowling predator would do, but keep it light)
 if(heroTargetable()){const d=dist2(fl.x,fl.y,hero.x,hero.y);if(d<(2.6*TILE)**2){const dd=Math.sqrt(d)||1;ax+=(fl.x-hero.x)/dd*2.0;ay+=(fl.y-hero.y)/dd*2.0}}
 // soft world bounds
 const m=2.5*TILE;
 if(fl.x<m)ax+=0.08;else if(fl.x>W*TILE-m)ax-=0.08;
 if(fl.y<m)ay+=0.08;else if(fl.y>H*TILE-m)ay-=0.08;
 fl.vx+=ax*dt;fl.vy+=ay*dt;
 const spd=Math.hypot(fl.vx,fl.vy),max=WALK*fl.spd*0.9,min=max*0.45;
 if(spd>max){fl.vx=fl.vx/spd*max;fl.vy=fl.vy/spd*max}
 else if(spd<min&&spd>1e-4){fl.vx=fl.vx/spd*min;fl.vy=fl.vy/spd*min}
 fl.x=clamp(fl.x+fl.vx*dt,3,W*TILE-3);
 fl.y=clamp(fl.y+fl.vy*dt,3,H*TILE-3);
 if(Math.hypot(fl.vx,fl.vy)>0.02)fl.dirIdx=CFHelp.angToDir(Math.atan2(fl.vy,fl.vx));
}
function updateFlyers(dt){
 for(let i=flyers.length-1;i>=0;i--){const fl=flyers[i];if(fl.dead){flyers.splice(i,1);continue}updateFlyer(fl,dt)}
}
function drawFlyer(c,fl,t){
 const bob=Math.sin(t*0.004+fl.id*1.3)*2;
 const s=fl.sizeScale;
 // ground shadow — shrinks with altitude to sell the height
 c.fillStyle='rgba(0,0,0,0.20)';
 c.beginPath();c.ellipse(fl.x,fl.y,4.5*s,1.7*s,0,0,7);c.fill();
 const spr=fl.made._sprite;
 if(spr){
  const F=spr.FRAMES.walk[fl.dirIdx||0]||spr.FRAMES.walk[0];
  const nn=F.length;let f=Math.floor((fl.animClock||0)*(spr.fps.walk||12))%nn;if(f<0)f+=nn;
  const img=F[f];if(img){const w=img.width*s,h=img.height*s;
   c.drawImage(img,Math.round(fl.x-w/2),Math.round(fl.y-fl.elev-bob-h/2),w,h)}
 }else{
  c.fillStyle=fl.kind==='bird'?'#c9d3dd':'#5a5040';
  c.fillRect(fl.x-2,fl.y-fl.elev-bob-2,4,3);
 }
}
function drawCarrion(c,cn,t){
 const px=cn.x,py=cn.y;
 c.fillStyle='rgba(0,0,0,0.22)';c.beginPath();c.ellipse(px,py+1,5,2,0,0,7);c.fill();
 c.fillStyle='#7a3a34';c.beginPath();c.ellipse(px,py,3.4,2.2,0,0,7);c.fill();
 c.fillStyle='#552823';c.fillRect(px-3,py-1,6,1);
 // a few flies bobbing over a fresh kill
 if((cn.t||0)<1.4*DAY&&t%900<600){c.font='6px system-ui';c.textAlign='center';c.fillText('🪰',px+Math.sin(t*0.01)*3,py-5)}
}
function drawMerchant(c,m,t){
 const px=m.x,py=m.y, bob=Math.sin(m.bob*2)*1.2;
 c.fillStyle='rgba(0,0,0,0.28)';c.beginPath();c.ellipse(px,py+3,9,3,0,0,7);c.fill();
 if(m.state==='stalled'){
  // a striped canopy over a little counter
  c.fillStyle='#6a4a30';c.fillRect(px-8,py-2,16,5);
  c.fillStyle='#8a6a44';c.fillRect(px-8,py-2,16,1.5);
  for(let i=0;i<4;i++){c.fillStyle=i%2?'#c9524a':'#e8e0d0';c.fillRect(px-8+i*4,py-12,4,5);}
  c.fillStyle='#4a3020';c.fillRect(px-8,py-12,1.5,10);c.fillRect(px+7,py-12,1.5,10);
  // the pedlar
  c.fillStyle='#caa25a';c.beginPath();c.arc(px+11,py-4,3,0,7);c.fill();
  c.fillStyle='#5a4a3a';c.fillRect(px+8,py-2,6,5);
  // the current deal, floating
  if(cam.z>0.85){c.font='8px system-ui';c.textAlign='center';c.fillText(m.ware.glyph,px,py-16+bob);
   c.font='6px Georgia';c.fillStyle='rgba(240,225,200,0.92)';c.fillText(m.ware.cost+'🪙'+(m.ware.gems?'+'+m.ware.gems+'💎':''),px,py+11);}
 }else{
  // the covered cart on the move
  c.fillStyle='#e8e0d0';c.beginPath();c.ellipse(px,py-4,8,6,0,Math.PI,0);c.fill();
  c.fillStyle='#6a4a30';c.fillRect(px-8,py-1,16,4);
  c.fillStyle='#3a2a1a';c.beginPath();c.arc(px-5,py+3,2.4,0,7);c.fill();c.beginPath();c.arc(px+5,py+3,2.4,0,7);c.fill();
  if(cam.z>1.0){c.font='8px system-ui';c.textAlign='center';c.fillText('🛒',px,py-13)}
 }
 if(m.em&&m.em.until>performance.now()){c.font='9px system-ui';c.textAlign='center';c.fillText(m.em.g,px,py-20)}
}
function drawShrine(c,sh,t){
 const px=sh.x,py=sh.y, fl=0.6+0.4*Math.sin(t*0.004+sh.x);
 c.fillStyle='rgba(0,0,0,0.25)';c.beginPath();c.ellipse(px,py+2,6,2.4,0,0,7);c.fill();
 const go=c.globalCompositeOperation;c.globalCompositeOperation='screen';
 c.globalAlpha=0.4+fl*0.3;c.drawImage(GLOW_WARM,px-16,py-20,32,32);c.globalAlpha=1;c.globalCompositeOperation=go;
 // a small carved plinth + a green flame
 c.fillStyle='#8a8478';c.fillRect(px-4,py-2,8,5);
 c.fillStyle='#a8a294';c.fillRect(px-3,py-9,6,7);
 c.fillStyle='#6a6458';c.fillRect(px-3,py-9,6,1.5);
 c.fillStyle='rgba(150,240,180,'+(0.7+fl*0.3)+')';c.beginPath();c.arc(px,py-11,1.8+fl*0.8,0,7);c.fill();
 if(cam.z>1.05){c.font='6.5px Georgia';c.textAlign='center';c.fillStyle='rgba(210,235,200,0.85)';c.fillText('Sage-shrine',px,py+13)}
}
function drawAnimal(c,a,t){
 const px=a.x,py=a.y,s=a.sizeScale;
 c.fillStyle='rgba(0,0,0,0.30)';c.beginPath();c.ellipse(px,py+2,6*s,2.4*s,0,0,7);c.fill();
 if(a.sprite){
  const anim=(a.anim==='attack'&&a.sprite.FRAMES.attack)?'attack':'walk';
  const clock=a.anim==='idle'?0:a.animClock;   // grazing animals stand still, not walk-in-place
  CFHelp.drawCreatureSprite(c,a.sprite,px,py+3,a.dirIdx||0,anim,clock,s);
 }else{
  c.fillStyle='#8a7a5a';c.beginPath();c.ellipse(px,py-3,5*s,4*s,0,0,7);c.fill();
 }
 if(a.hp<a.maxhp){c.fillStyle='#1b1626';c.fillRect(px-7,py-16,14,2);c.fillStyle=a.temper==='predator'?'#d24a5a':'#6fa04f';c.fillRect(px-7,py-16,14*clamp(a.hp/a.maxhp,0,1),2)}
 if(a.em&&a.em.until>performance.now()){c.font='8px system-ui';c.textAlign='center';c.fillText(a.em.g,px,py-18)}
 else if(a.tame&&t%2600<1300){c.font='7px system-ui';c.textAlign='center';c.fillText('💚',px,py-16)}
}

/* ================= villages (the collective mind) ================= */
const VIL_ADJ=['Verdance','Quiddity','Perhaps','Tenderloam','Bloomgate','Stillwater','Gloamrest','Emberfold','Seedwell','Neon Hollow','Thornhaven','Sempervirens'];
const CLAIM_MARGIN=3,CLAIM_MIN=14,CLAIM_MAX=30,WALL_THICK=2;
function villageName(){for(let tr=0;tr<20;tr++){const n=(Lore.active&&Lore.name(4,11))||pick(VIL_ADJ);if(!usedVil.has(n)){usedVil.add(n);return n}}const n=pick(VIL_ADJ);usedVil.add(n);return n}
function clampClaim(c){return{x0:clamp(Math.round(c.x0),2,W-3),y0:clamp(Math.round(c.y0),2,H-3),x1:clamp(Math.round(c.x1),2,W-3),y1:clamp(Math.round(c.y1),2,H-3)}}
function claimOf(g,extra){
 let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
 for(const b of g){x0=Math.min(x0,b.x);y0=Math.min(y0,b.y);x1=Math.max(x1,b.x+b.w-1);y1=Math.max(y1,b.y+b.h-1)}
 if(extra)for(const[x,y]of extra){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}
 x0-=CLAIM_MARGIN;y0-=CLAIM_MARGIN;x1+=CLAIM_MARGIN;y1+=CLAIM_MARGIN;
 const cx=(x0+x1)/2,cy=(y0+y1)/2;
 if(x1-x0<CLAIM_MIN){x0=cx-CLAIM_MIN/2;x1=cx+CLAIM_MIN/2}
 if(y1-y0<CLAIM_MIN){y0=cy-CLAIM_MIN/2;y1=cy+CLAIM_MIN/2}
 return clampClaim({x0,y0,x1,y1});
}
function capClaim(c){
 let {x0,y0,x1,y1}=c;const cx=(x0+x1)/2,cy=(y0+y1)/2;
 if(x1-x0>CLAIM_MAX){x0=cx-CLAIM_MAX/2;x1=cx+CLAIM_MAX/2}
 if(y1-y0>CLAIM_MAX){y0=cy-CLAIM_MAX/2;y1=cy+CLAIM_MAX/2}
 return clampClaim({x0,y0,x1,y1});
}
function unionClaim(a,b){return{x0:Math.min(a.x0,b.x0),y0:Math.min(a.y0,b.y0),x1:Math.max(a.x1,b.x1),y1:Math.max(a.y1,b.y1)}}
function claimEq(a,b){return a.x0===b.x0&&a.y0===b.y0&&a.x1===b.x1&&a.y1===b.y1}
function perimeterTiles(c){
 const out=[];
 for(let x=c.x0;x<=c.x1;x++){out.push([x,c.y0]);out.push([x,c.y1])}
 for(let y=c.y0+1;y<c.y1;y++){out.push([c.x0,y]);out.push([c.x1,y])}
 return out;
}
// Walls follow the TERRAIN, not a rectangle: flood the ground the town can hold
// from its centre (bounded by the claim), then wall the organic boundary of that
// region — so the rampart bends around rock, cliffs and water at every angle, and
// re-shapes itself as folk mine and build. Gates open at the cardinal exits.
function fortPlan(cl){
 const walls=new Map(),gates=new Set();
 const cx=Math.round((cl.x0+cl.x1)/2),cy=Math.round((cl.y0+cl.y1)/2);
 const inClaim=(x,y)=>x>=cl.x0&&x<=cl.x1&&y>=cl.y0&&y<=cl.y1;
 // a tile the town holds: its own ground/buildings inside the claim (rock, water
 // and the wilds beyond the claim are NOT held — the wall forms against them)
 const held=(x,y)=>{ if(!inB(x,y)||!inClaim(x,y))return false; const i=idx(x,y);
   return map[i]===0 || struct[i]===S_HOUSE || struct[i]===S_WALL || struct[i]===S_RUIN; };
 let start=[cx,cy];
 if(!held(cx,cy)){ const s=nearOpen(cx,cy); if(s&&inClaim(s[0],s[1]))start=s; else return {walls,gates}; }
 const terr=new Set([start[0]+','+start[1]]), stack=[start];
 while(stack.length){ const [x,y]=stack.pop();
  for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx,ny=y+dy,k=nx+','+ny;
   if(terr.has(k)||!held(nx,ny))continue; terr.add(k); stack.push([nx,ny]); } }
 // flood the OUTSIDE (everything un-held reachable from the claim's rim) so that
 // rock pockets sealed WITHIN the town don't each grow their own little wall — the
 // rampart is only where the territory meets the open wilds
 const bx0=cl.x0-1,by0=cl.y0-1,bx1=cl.x1+1,by1=cl.y1+1;
 const outside=new Set(), os=[];
 for(let x=bx0;x<=bx1;x++){ for(const y of [by0,by1]){const k=x+','+y; if(!terr.has(k)&&!outside.has(k)){outside.add(k);os.push([x,y]);}} }
 for(let y=by0;y<=by1;y++){ for(const x of [bx0,bx1]){const k=x+','+y; if(!terr.has(k)&&!outside.has(k)){outside.add(k);os.push([x,y]);}} }
 while(os.length){ const[x,y]=os.pop();
  for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx,ny=y+dy; if(nx<bx0||ny<by0||nx>bx1||ny>by1)continue; const k=nx+','+ny;
   if(outside.has(k)||terr.has(k))continue; outside.add(k); os.push([nx,ny]); } }
 // boundary = held tiles that touch the OUTSIDE (the outer frontier only)
 const bnd=[];
 for(const k of terr){ const c=k.split(',');const x=+c[0],y=+c[1];
  for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){ if(outside.has((x+dx)+','+(y+dy))){ bnd.push([x,y]); break; } } }
 if(!bnd.length)return {walls,gates};
 // gates: the boundary tiles nearest the four cardinal extremes of the territory
 const span=Math.max(cl.x1-cl.x0,cl.y1-cl.y0);
 const nearestBnd=(fx,fy)=>{ let best=null,bd=1e18; for(const[x,y]of bnd){const d=(x-fx)*(x-fx)+(y-fy)*(y-fy);if(d<bd){bd=d;best=[x,y]}} return best; };
 const bset=new Set(bnd.map(([x,y])=>x+','+y));
 for(const[fx,fy]of[[cx,cy-span],[cx+span,cy],[cx,cy+span],[cx-span,cy]]){ const g=nearestBnd(fx,fy);
  if(g){ gates.add(g[0]+','+g[1]);
   // widen the gap by ONE along the boundary so folk can pass without a squeeze
   for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const gk=(g[0]+dx)+','+(g[1]+dy);if(bset.has(gk)){gates.add(gk);break;}} } }
 for(const[x,y]of bnd){ const key=x+','+y; if(!gates.has(key))walls.set(key,[x,y]); }
 return {walls,gates};
}
function claimCenter(c){return[Math.round((c.x0+c.x1)/2),Math.round((c.y0+c.y1)/2)]}
function detectVillages(){
 const homes=buildings.filter(b=>!b.gone&&!b.ruined&&b.done&&(b.tp==='biz'||(BMETA[b.tp]&&BMETA[b.tp].cat==='house'))&&b.owners.some(id=>{const o=allById.get(id);return o&&!o.dead}));
 const CL=20;
 const groups=[];
 for(const b of homes){
  const bx=b.x+b.w/2,by=b.y+b.h/2;
  let g=groups.find(gr=>gr.some(o=>dist2(bx,by,o.x+o.w/2,o.y+o.h/2)<CL*CL));
  if(g)g.push(b);else groups.push([b]);
 }
 for(let pass=0;pass<2;pass++){
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
   if(groups[i]&&groups[j]&&groups[i].some(a=>groups[j].some(b=>dist2(a.x,a.y,b.x,b.y)<CL*CL))){groups[i]=groups[i].concat(groups[j]);groups[j]=null}
  }
  for(let i=groups.length-1;i>=0;i--)if(!groups[i])groups.splice(i,1);
 }
 const live=[];
 for(const g of groups){
  const homeCount=g.filter(b=>BMETA[b.tp]&&BMETA[b.tp].cat==='house').length;
  let cx=0,cy=0;for(const b of g){cx+=b.x+b.w/2;cy+=b.y+b.h/2}cx/=g.length;cy/=g.length;
  let existing=villages.find(vv=>dist2(vv.cx,vv.cy,cx,cy)<26*26);
  if(homeCount<VILLAGE_MIN&&!(existing&&homeCount>=2))continue;
  let v=existing;
  if(!v){
   const cl=claimOf(g);
   v={id:nextId++,name:villageName(),cx,cy,homes:g,jobs:[],stock:{stone:16,food:0},lastPlan:0,founded:cday(),
      claim:cl,gates:fortPlan(cl).gates,wallDone:false};
   v.rad=Math.hypot(cl.x1-cl.x0,cl.y1-cl.y0)/2;
   villages.push(v);
   tale([],'The huddle of cottages has become a village. They call it '+v.name+', and its people begin to think as one — to hedge out the dark and farm the loam.',true);
  }else{
   v.cx=cx;v.cy=cy;v.homes=g;
   const want=claimOf(g),uni=capClaim(unionClaim(v.claim,want));
   if(!claimEq(uni,v.claim)){
    const oldW=fortPlan(v.claim).walls,newW=fortPlan(uni).walls;
    for(const key of oldW.keys())if(!newW.has(key)){const[px,py]=key.split(',').map(Number);if(struct[idx(px,py)]===S_WALL)carveFloor(px,py)}
    v.claim=uni;v.gates=fortPlan(uni).gates;v.wallDone=false;
    v.rad=Math.hypot(uni.x1-uni.x0,uni.y1-uni.y0)/2;
    tale([],'The hedge-walls of '+v.name+' were planted anew, grander, to take in the growing town.');
   }
  }
  for(const b of g){b.vid=v.id;for(const id of b.owners){const o=allById.get(id);if(o&&!o.dead){o.vid=v.id;o.founder=null;o.migrate=null;}}}
  live.push(v);
 }
 for(let i=villages.length-1;i>=0;i--)if(!live.includes(villages[i])){
  const v=villages[i];
  for(const p of people)if(p.vid===v.id)p.vid=null;
  // a town abandoned with no living soul left near it collapses into raidable ruins
  const nearLiving=people.some(p=>!p.dead&&dist2(p.x,p.y,v.cx*TILE,v.cy*TILE)<((v.rad+8)*TILE)**2);
  if(!nearLiving)makeRuin(v);
  villages.splice(i,1);
 }
}
function planVillage(v){
 updateGovernance(v);
 v.jobs=v.jobs.filter(j=>{
  if(j.type==='wall')return walkable(j.x,j.y);
  if(j.type==='mine')return !walkable(j.x,j.y);
  if(j.type==='till')return walkable(j.x,j.y)&&farmGrid[idx(j.x,j.y)]===0;
  if(j.type==='harvest')return farmGrid[idx(j.x,j.y)]===2;
  if(j.type==='clear')return nodeAt.has(idx(j.x,j.y))||!walkable(j.x,j.y);
  if(j.type==='tidywall')return struct[idx(j.x,j.y)]===S_WALL;
  if(j.type==='pave')return !pavedTiles.has(idx(j.x,j.y));
  if(j.type==='weed'){const nd=nodeAt.get(idx(j.x,j.y));return nd&&nd.sp!=null;}
  return false;
 });
 const [cx,cy]=claimCenter(v.claim),cl=v.claim;
 const fort=fortPlan(cl);v.gates=fort.gates;
 if(!v.wallDone){
  for(const key of v.gates){const[gx,gy]=key.split(',').map(Number);const gi=idx(gx,gy);if(bld[gi]<0&&!nodeAt.has(gi)&&!dungeonAt(gx,gy)&&!walkable(gx,gy)&&struct[gi]!==S_HOUSE)carveFloor(gx,gy)}
  let queued=v.jobs.filter(j=>j.type==='wall').length,remaining=0;
  for(const[x,y]of fort.walls.values()){
   const i=idx(x,y);
   if(struct[i]===S_WALL)continue;
   if(!walkable(x,y))continue;
   if(nodeAt.has(i)||dungeonAt(x,y))continue;
   remaining++;
   if(queued>=30)continue;
   if(!v.jobs.some(j=>j.x===x&&j.y===y)){v.jobs.push({type:'wall',x,y});queued++}
  }
  if(remaining===0)v.wallDone=true;
 }
 // --- agriculture: the village sows its favourite crop, but only once it has
 //     gathered seed for it (wild foraging fills the seed stock first) ---
 const crop=cropOf(v), haveSeed=crop&&v.seed&&v.seed[crop.key]>0;
 const targetFarms=Math.min(18,v.homes.length+6);
 let farmCount=0;for(let y=cl.y0;y<=cl.y1;y++)for(let x=cl.x0;x<=cl.x1;x++)if(farmGrid[idx(x,y)])farmCount++;
 if(haveSeed&&farmCount<targetFarms){
  let added=0;
  const ix0=cl.x0+WALL_THICK+1,iy0=cl.y0+WALL_THICK+1,ix1=cl.x1-WALL_THICK-1,iy1=cl.y1-WALL_THICK-1;
  outer:for(let y=iy0;y<=iy1;y++)for(let x=ix0;x<=ix1;x++){
   const i=idx(x,y);
   if(walkable(x,y)&&farmGrid[i]===0&&bld[i]<0&&!nodeAt.has(i)&&struct[i]!==S_WALL&&!pavedTiles.has(i)&&!v.jobs.some(j=>j.x===x&&j.y===y)){
    v.jobs.push({type:'till',x,y});if(++added>=6)break outer;
   }
  }
 }
 for(let y=cl.y0;y<=cl.y1;y++)for(let x=cl.x0;x<=cl.x1;x++){
  const i=idx(x,y);
  if(farmGrid[i]===2&&!v.jobs.some(j=>j.x===x&&j.y===y&&j.type==='harvest'))v.jobs.push({type:'harvest',x,y});
 }
 // --- weeding: pull wild plants around the claim that aren't the chosen crop
 //     (and any species that's a worthless weed), to clear ground for monocrop ---
 if(v.jobs.filter(j=>j.type==='weed').length<5){
  let added=0;
  weedscan:for(let y=cl.y0;y<=cl.y1&&added<5;y++)for(let x=cl.x0;x<=cl.x1;x++){
   const i=idx(x,y),nd=nodeAt.get(i);
   if(!nd||nd.sp==null||v.jobs.some(j=>j.x===x&&j.y===y))continue;
   const sp=floraSpecies[nd.sp];
   const unwanted = sp.weed || (crop && nd.sp!==crop.i && !sp.wood && speciesScore(sp)<speciesScore(crop)-1);
   if(unwanted){ v.jobs.push({type:'weed',x,y}); if(++added>=5)break weedscan; }
  }
 }
 if(v.jobs.filter(j=>j.type==='mine').length<4){
  for(let tries=0;tries<18;tries++){
   const x=ri(cl.x0+WALL_THICK,cl.x1-WALL_THICK),y=ri(cl.y0+WALL_THICK,cl.y1-WALL_THICK),i=idx(x,y);
   if(!walkable(x,y)&&struct[i]!==S_WALL&&struct[i]!==S_HOUSE&&struct[i]!==S_RUIN&&bld[i]<0&&!nodeAt.has(i)&&!dungeonAt(x,y)){v.jobs.push({type:'mine',x,y});break}
  }
 }
 // --- tidy the settlement: clear loose rock in a ring around the claim, and
 //     pull down stray/isolated stubs of hedge-wall left over from old plans ---
 const fortWalls=fort.walls, RING=4;
 const has=(x,y)=>v.jobs.some(j=>j.x===x&&j.y===y);
 if(v.jobs.filter(j=>j.type==='clear').length<6){
  let added=0;
  outerC:for(let y=cl.y0-RING;y<=cl.y1+RING&&added<6;y++)for(let x=cl.x0-RING;x<=cl.x1+RING;x++){
   if(!inB(x,y))continue;
   const inClaim=x>=cl.x0&&x<=cl.x1&&y>=cl.y0&&y<=cl.y1;
   if(inClaim)continue;                        // the ring only — outside the walls
   const i=idx(x,y);
   if(has(x,y))continue;
   const isRockNode=nodeAt.has(i)&&nodeAt.get(i).t==='rock';
   if(isRockNode||clearableSolid(x,y)){v.jobs.push({type:'clear',x,y});if(++added>=6)break outerC}
  }
 }
 if(v.jobs.filter(j=>j.type==='tidywall').length<4){
  let added=0;
  outerW:for(let y=cl.y0-1;y<=cl.y1+1&&added<4;y++)for(let x=cl.x0-1;x<=cl.x1+1;x++){
   if(!inB(x,y))continue;
   const i=idx(x,y);
   if(struct[i]!==S_WALL||has(x,y))continue;
   // only stray leftover walls (not on the current perimeter) — never tear down a
   // wall the village is actively raising as part of its fort plan
   if(!fortWalls.has(x+','+y)){v.jobs.push({type:'tidywall',x,y});added++}
  }
 }
 // --- collaborate on a common plaza + lanes that connect every building to it,
 //     so the town stays open and easy to move through (runs alongside the walls) ---
 if(v.jobs.filter(j=>j.type==='pave').length<10){
  const paveJob=(x,y)=>{
   if(!inB(x,y)||has(x,y))return;
   const i=idx(x,y);
   if(pavedTiles.has(i)||nodeAt.has(i)||bld[i]>=0||farmGrid[i]||struct[i]===S_WALL||struct[i]===S_HOUSE||struct[i]===S_RUIN||dungeonAt(x,y))return;
   v.jobs.push({type:'pave',x,y});
  };
  // a small open plaza at the heart of town
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)paveJob(cx+dx,cy+dy);
  // a lane from each home's doorstep to the plaza
  for(const b of v.homes){
   if(b.gone||b.ruined||!b.done)continue;
   const dx=b.x+((b.w/2)|0), dy=b.y+b.h;   // the tile just in front of the door
   for(const[lx,ly]of laneTiles(dx,dy,cx,cy))paveJob(lx,ly);
   if(v.jobs.filter(j=>j.type==='pave').length>=10)break;
  }
 }
 // --- guard duty: post watch at the gates. More monsters abroad (or nightfall)
 //     calls up more of the watch. ---
 if(v.gates && v.gates.size){
  const threat=monsters.filter(m=>dist2(m.x,m.y,cx*TILE,cy*TILE)<((v.rad+16)*TILE)**2).length;
  const wantGuards=clamp(1+(isNight()?1:0)+threat, 1, Math.min(3,v.gates.size));  // always a watch, more under threat
  const posted=v.jobs.filter(j=>j.type==='guard').length + people.filter(p=>p.vid===v.id&&p.task&&p.task.k==='guard').length;
  if(posted<wantGuards){
   const gateList=[...v.gates].map(k=>k.split(',').map(Number));
   for(const[gx,gy]of gateList){
    if(v.jobs.filter(j=>j.type==='guard').length + posted >= wantGuards)break;
    if(!walkable(gx,gy))continue;
    if(v.jobs.some(j=>j.x===gx&&j.y===gy))continue;
    v.jobs.push({type:'guard',x:gx,y:gy});
   }
  }
 }
}
function villageTick(){
 detectVillages();
 for(const v of villages){
  if(simMin-v.lastPlan>rf(.4,.7)*DAY){v.lastPlan=simMin;planVillage(v)}
  // the assembly meets every week or so to take the temperature of the town
  if(simMin-(v.lastCouncil||0)>rf(8,12)*DAY){v.lastCouncil=simMin;holdCouncil(v)}
  // as the town grows, it commissions grander buildings (paced out over days)
  if(simMin-(v.lastDevelop||0)>rf(1.2,2.2)*DAY){v.lastDevelop=simMin;developVillage(v)}
  // a growing city changes its people — tech awakenings & new dreams; factories mill goods
  if(simMin-(v.lastCulture||0)>rf(2,3.5)*DAY){v.lastCulture=simMin;cityCulture(v)}
  if(simMin-(v.lastFactory||0)>rf(.8,1.4)*DAY){v.lastFactory=simMin;factoryTick(v)}
  maybeFestival(v);
  if(v.stock.food>0){
   const pantries=v.homes.filter(b=>!b.gone&&!b.ruined&&b.stock);
   let guard=0;
   while(v.stock.food>0&&pantries.length&&guard++<40){
    const b=pick(pantries);b.stock.food++;v.stock.food--;
   }
  }
 }
}
// how developed a settlement is (0..4), driven by how many souls it holds
function villageDev(v){ const m=villageMembers(v).length; return m>=15?4 : m>=11?3 : m>=8?2 : m>=5?1 : 0; }
/* ---- village festivals: the town spills out to the plaza to celebrate ---- */
// a prosperous town throws a festival — folk gather under strung lanterns and
// dance; the harvest (autumn) all but guarantees one. The Sage who joins in earns
// the town's goodwill (renown) and a warm, festive glow.
// pull the town's folk out to the plaza to celebrate (skips only the truly busy)
function gatherFestival(v,frac){
 for(const p of villageMembers(v)){
  if(p.age<16||p.sleeping)continue;
  if(p.task&&['build','fight','guard','gohome'].includes(p.task.k))continue;
  if(chance(frac))setTask(p,'festival',{cx:v.cx,cy:v.cy,until:simMin+rf(60,150)});
 }
}
function maybeFestival(v){
 if(v.festival){
  if(cday()>=v.festival.endDay){ tale([],'The lanterns of '+v.name+' come down; the festival winds gently to its close.'); v.festival=null; return; }
  gatherFestival(v,.6);
  return;
 }
 const dev=villageDev(v); if(dev<2)return;
 if(simMin-(v.lastFest||0) < rf(6,10)*DAY)return;
 let surplus=(v.stock.food||0); for(const b of v.homes)if(b.stock)surplus+=(b.stock.food||0);
 const harvest=seasonNow().name==='Autumn';
 if(chance(harvest?0.5:0.16) && (surplus>8||harvest)){
  v.lastFest=simMin;
  v.festival={id:nextId++,endDay:cday()+1,cx:v.cx,cy:v.cy};
  tale([], '🎉 '+v.name+' throws a '+(harvest?'harvest ':'')+'festival — lanterns strung across the plaza, and the whole town spilling out to it.',true);
  toast('🎉 A festival begins in '+v.name);
  gatherFestival(v,.8);
 }
}
// the Sage joining a festival: a one-time renown gift + a lingering festive glow
function heroFestivalTick(rdt){
 if(hero.down||interior)return;
 for(const v of villages){
  if(!v.festival)continue;
  if(dist2(hero.x,hero.y,v.cx*TILE,v.cy*TILE) < (5*TILE)**2){
   hero.festiveUntil=simMin+120;
   if(hero._festId!==v.festival.id){
    hero._festId=v.festival.id;
    Hero.renown=(Hero.renown||0)+1;
    toast('🎉 You join the revels of '+v.name+' — the town warms to you. (renown '+Hero.renown+')','card');
   }
   if(Hero.hp<Hero.maxHp&&chance(rdt*0.03))Hero.hp++;
  }
 }
}
// the town's collective larder = its own stock plus each household's SURPLUS
// (a reserve stays with every home so investing in the town never leaves a
// family without the means to keep their own roof)
const HOME_RESERVE=4;
function villagePool(v){ let wood=v.stock.wood||0, stone=v.stock.stone||0; const seen=new Set();
 for(const p of villageMembers(v)){const b=p.home; if(b&&!b.gone&&b.stock&&!seen.has(b)){seen.add(b);wood+=Math.max(0,(b.stock.wood||0)-HOME_RESERVE);stone+=Math.max(0,(b.stock.stone||0)-HOME_RESERVE);}}
 return {wood,stone}; }
function spendPool(v,cost){ let nw=cost.wood||0,ns=cost.stone||0;
 take(v.stock);
 function take(st,reserve){if(!st)return;const dw=Math.min(nw,Math.max(0,(st.wood||0)-(reserve||0)));st.wood-=dw;nw-=dw;const ds=Math.min(ns,Math.max(0,(st.stone||0)-(reserve||0)));st.stone-=ds;ns-=ds;}
 for(const p of villageMembers(v)){if(nw<=0&&ns<=0)break;const b=p.home;if(b&&b.stock)take(b.stock,HOME_RESERVE);}
}
// commission the next building the growing town wants, funded from the shared pool
function developVillage(v){
 const dev=villageDev(v); v.dev=dev;
 if(dev<1)return;
 const members=villageMembers(v);
 if(!members.length)return;
 const has=(tp)=>buildings.filter(b=>!b.gone&&!b.ruined&&b.vid===v.id&&b.tp===tp).length;
 const pool=villagePool(v);
 const afford=(tp)=>{const c=COST[tp];return pool.wood>=(c.wood||0)&&pool.stone>=(c.stone||0)};
 const pickBuilder=()=>{let fallback=null;for(const pp of members){if(pp.dead||pp.age<16)continue;if(buildings.some(b=>!b.gone&&!b.done&&b.builder===pp.id))continue;if(!pp.task||['wander','villagejob','chat','visit','gather','gohome'].includes(pp.task.k))return pp;if(!fallback)fallback=pp;}return fallback;};
 const commission=(tp)=>{ if(!afford(tp))return false; const bp=pickBuilder(); if(!bp)return false; if(startBuild(bp,tp,null,v)){spendPool(v,COST[tp]);return true;} return false; };
 // 1) housing: raise tenements then towers when folk sleep rough OR the town has
 // grown dense enough to want to build UP instead of sprawling further out
 const homeless=members.filter(pp=>!pp.home||pp.home.gone).length;
 const vacant=buildings.filter(b=>!b.gone&&!b.ruined&&b.done&&b.vid===v.id&&bcap(b)>0).reduce((a,b)=>a+(bcap(b)-b.owners.length),0);
 const shelters=buildings.filter(b=>!b.gone&&!b.ruined&&b.vid===v.id&&b.tp==='shelter').length;
 if(homeless>vacant+1 || (dev>=2 && shelters>=3)){
  if(dev>=3&&has('highrise')<dev-1){ if(commission('highrise'))return; }
  if(commission('apartment'))return;
 }
 // 2) civic ambitions unlock by tier
 const wish=[];
 if(dev>=1){wish.push(['warehouse',1],['park',dev>=3?3:1]);}
 if(dev>=2){wish.push(['venue',1],['factory',1]);}
 if(dev>=4){wish.push(['factory',2],['highrise',3]);}
 for(const[tp,lim]of wish){ if(has(tp)<lim && commission(tp))return; }
}
// as a settlement grows into a city, its people begin jacking into the buried net —
// awakening a futuristic trait — and its great buildings reshape what they dream of
function cityCulture(v){
 const dev=villageDev(v); if(dev<2)return;
 const members=villageMembers(v); if(!members.length)return;
 const has=(tp)=>buildings.some(b=>!b.gone&&!b.ruined&&b.vid===v.id&&b.tp===tp);
 const factory=has('factory'), venue=has('venue'), tower=has('highrise');
 // 1) a tech awakening — a factory town turns more of its folk wired
 if(chance(factory?0.6:0.35)){
  const raw=members.filter(p=>!isTech(p)&&p.age>=16);
  if(raw.length){
   const p=pick(raw), t=factory?pick(['inventive','augmented','wired']):pick(TECH_TRAITS);
   p.traits.push(t);applyTrait(p,t,1);
   tale([p],p.name+' came up from the Understory changed — '+TRAITS[t].a+', humming with the old net’s logic. '+pick(['The city does this to people.','Chrome under the skin now.','They see the wires in everything.']),true);
  }
 }
 // 2) the great buildings reshape ambitions
 if(chance(0.5)){
  const adults=members.filter(p=>p.age>=16&&p.goal&&!p.goal.done);
  if(adults.length){
   const p=pick(adults); let g=null;
   if(tower&&p.home&&p.home.tp==='highrise')g='ascend';
   else if(factory&&(isTech(p)||chance(.5)))g='invent';
   else if(venue)g='fame';
   if(g&&p.goal.k!==g){ p.goal={k:g,t:GOALS[g].t,done:false};
    tale([p],p.name+pick([' looked up at the '+(g==='ascend'?'tower':g==='invent'?'manufactory':'lights of the venue')+' and wanted something new — ',' caught a new dream in the city’s glow — '])+GOALS[g].t+'.'); }
  }
 }
}
// factories mill the town's raw stock into finished goods — and now and then a relic
function factoryTick(v){
 const facs=buildings.filter(b=>!b.gone&&!b.ruined&&b.done&&b.vid===v.id&&b.tp==='factory');
 if(!facs.length)return;
 const members=villageMembers(v);
 for(const f of facs){
  v.stock.wood=(v.stock.wood||0)+2; v.stock.stone=(v.stock.stone||0)+2;
  f.prosperity=(f.prosperity||0)+1;
  if(chance(0.16)&&members.length){
   const p=pick(members), relic=pick(RELICS); giveRelic(p,relic);
   tale([p],'The manufactory of '+v.name+' pressed out '+relic.g+' the '+relic.n+', and it fell to '+p.name+'.',true);
  }
 }
}

/* ================= governance: leaders, votes, and schisms ================= */
function villageMembers(v){ const out=[]; for(const p of people)if(!p.dead&&!p.inDungeon&&p.vid===v.id&&p.age>=16)out.push(p); return out; }
// name the government after the leader's temperament
function govStyle(leader){
 if(!leader)return 'assembly';
 if(leader.traits.includes('commanding'))return 'chiefdom';
 if(leader.traits.includes('rebellious'))return 'commune';
 if(leader.traits.includes('kind')||leader.traits.includes('charming'))return 'council';
 if(leader.traits.includes('ambitious'))return 'dominion';
 return 'assembly';
}
function updateGovernance(v){
 const mem=villageMembers(v);
 if(!mem.length){v.leader=null;return}
 let best=mem[0],bl=-1e9,rival=null,rl=-1e9;
 for(const p of mem){ const l=leadership(p);
  if(l>bl){rival=best;rl=bl;best=p;bl=l;} else if(l>rl){rival=p;rl=l;} }
 const prev=v.leader; v.leader=best.id; v.leadScore=bl;
 v.rival=(rival&&rl>bl*0.72)?rival.id:null;      // a credible challenger waits in the wings
 v.gov=govStyle(best);
 if(prev&&prev!==best.id&&mem.length>=VILLAGE_MIN&&chance(.6))
  tale([best],best.name+' now leads '+v.name+'; the '+v.gov+' turns to them.',true);
}
const ISSUES=[
 {k:'expand',   say:'push the hedge-walls out for more room'},
 {k:'fortify',  say:'raise the walls higher against the dark'},
 {k:'farm',     say:'turn every free hand to the fields'},
 {k:'festival', say:'down tools for a festival of the green'},
 {k:'frontier', say:'send folk out to break new ground'},
];
// a town meeting: the members vote on an issue; a bruising, close vote breeds
// unrest, and enough of it splits the town
function holdCouncil(v){
 const mem=villageMembers(v);
 if(mem.length<VILLAGE_MIN)return;
 updateGovernance(v);
 const leader=allById.get(v.leader);
 const issue=pick(ISSUES);
 let aye=0,nay=0,dissenters=[];
 for(const p of mem){
  // loyalty to the leader vs a rebellious streak decides the vote
  const rel=leader&&leader!==p?(p.rel[leader.id]?p.rel[leader.id].a:0):0;
  let lean=(rel*0.02)+(p.traits.includes('loyal')?0.4:0)+(p.traits.includes('kind')?0.15:0)
          -(p.traits.includes('rebellious')?0.55:0)-(p.traits.includes('stubborn')?0.2:0)-(p.traits.includes('grumpy')?0.15:0);
  if(p===leader)lean+=1;
  if(lean+rf(-0.4,0.4)>=0)aye++; else {nay++;dissenters.push(p);}
 }
 const dissentFrac=nay/mem.length;
 v.unrest=clamp((v.unrest||0)*0.6 + dissentFrac*0.9 + (mem.length>v.homes.length*1.3?0.15:0) + (v.stock.food<mem.length?0.12:0), 0, 1.2);
 if(dissentFrac>0.3&&chance(.7))
  tale([leader],'The '+v.gov+' of '+v.name+' voted to '+issue.say+' — '+aye+' for, '+nay+' against. The losing side muttered into their tea.');
 // a rival with a following peels off when the town can no longer hold together
 if(v.unrest>0.8 && dissenters.length>=3){
  const rl=dissenters.slice().sort((a,b)=>leadership(b)-leadership(a))[0];
  if(rl&&leadership(rl)>0.45) schism(v,rl,dissenters);
 }
}
// pick a founding site well away from the parent town and any other village
function foundingSite(v){
 for(let tries=0;tries<80;tries++){
  const ang=R()*6.283, dist=(28+R()*20);
  const tx=Math.round(v.cx+Math.cos(ang)*dist), ty=Math.round(v.cy+Math.sin(ang)*dist);
  if(tx<4||ty<4||tx>=W-4||ty>=H-4)continue;
  if(!walkable(tx,ty))continue;
  if(villages.some(o=>dist2(o.cx,o.cy,tx,ty)<22*22))continue;
  return [tx,ty];
 }
 return null;
}
function schism(v,leaderP,dissenters){
 const site=foundingSite(v); if(!site)return;
 // the breakaway faction: the firebrand, their close friends, and the disaffected
 const band=new Set([leaderP]);
 for(const d of dissenters)if(band.size<Math.max(3,(villageMembers(v).length/2)|0))band.add(d);
 for(const[o,r] of knownRels(leaderP))if(r.a>=25&&o.vid===v.id&&band.size<8)band.add(o);
 let n=0;
 for(const p of band){
  if(p.home&&!p.home.gone){ p.home.owners=p.home.owners.filter(id=>id!==p.id); p.home=null; }
  p.vid=null; p.business=null; p.founder=leaderP.id; p.migrate=[site[0],site[1]]; p.task=null; p.path=null;
  n++;
 }
 v.unrest=0.2; v.lastCouncil=simMin;
 tale([leaderP],leaderP.name+' led '+n+' souls out of '+v.name+' after one vote too many — they mean to found a town of their own out past the wilds.',true);
}
function findVillageJob(p){
 const v=villages.find(vv=>vv.id===p.vid);
 if(!v||!v.jobs.length)return null;
 const watchful=p.traits.includes('brave')||p.traits.includes('commanding')||p.traits.includes('ambitious');
 let harvest=null,hd=1e18,other=null,od=1e18,guard=null,gd=1e18;
 for(const j of v.jobs){
  const d=dist2(p.x,p.y,j.x*TILE,j.y*TILE);
  if(j.type==='guard'){ if(d<gd){gd=d;guard=j} }
  else if(j.type==='harvest'){if(d<hd){hd=d;harvest=j}}
  else if(d<od){od=d;other=j}
 }
 // the bold rush to the watch; everyone else takes it only if nothing else calls
 const j=(guard&&watchful)?guard:(harvest||other||guard);
 return j?{v,j}:null;
}

/* ================= abandonment & upkeep tick ================= */
// a grave that has run its course sinks away and leaves a patch of flowers,
// freeing the tile and enriching the turned soil beneath it.
function bloomGrave(b){
 const i=idx(b.x,b.y);
 if(bld[i]===b.i)bld[i]=-1;
 b.gone=true;
 if(graveBlooms.length>=500)graveBlooms.shift();
 graveBlooms.push({x:b.x,y:b.y,born:simMin,seed:(b.id*2654435761)>>>0,ref:b.ref});
 // the grave has returned to the earth — release the buried soul from memory so
 // the roster of the dead can't grow without bound over a very long sim
 const buried=allById.get(b.ref); if(buried&&buried.dead){buried.portrait=null; allById.delete(b.ref);}
 if(fert){                                        // the earth remembers, and gives back
  fert[i]=clamp(fert[i]+(0.85-fert[i])*0.6,0,1);
  for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=b.x+dx,ny=b.y+dy;
   if(nx>=0&&ny>=0&&nx<W&&ny<H){const j=idx(nx,ny);fert[j]=clamp(fert[j]+0.06,0,1)}}
 }
}
function upkeepTick(){
 for(const b of buildings){
  if(b.gone)continue;
  if(b.tp==='grave'){ if(simMin-(b.born||0)>=GRAVE_LIFE)bloomGrave(b); continue; }
  if(!b.done)continue;
  const cat=BMETA[b.tp]?BMETA[b.tp].cat:'house';
  const livingOwners=b.owners.filter(id=>{const o=allById.get(id);return o&&!o.dead});
  // civic buildings & parks are tended by the town itself — abandoned only when the
  // village that raised them has no one left; houses go empty when their owners do
  const villGone=()=>{const vil=b.vid!=null&&villages.find(x=>x.id===b.vid);return !vil||villageMembers(vil).length===0;};
  const empty=(b.tp==='biz')?(()=>{const o=allById.get(b.builder);return !o||o.dead})()
            :(cat==='civic'||cat==='park')?villGone()
            :livingOwners.length===0;
  if(!b.ruined){
   if(empty){if(!b.emptySince)b.emptySince=simMin;else if(simMin-b.emptySince>RUIN_DELAY)ruinBuilding(b)}
   else b.emptySince=0;
  }else{
   if(!b.ancient&&simMin-b.emptySince>CRUMBLE_DELAY)crumbleBuilding(b);   // ancient ruins persist
  }
 }
 // old roads & walls, left untended, slowly return to ruin. A wall or lane close to
 // a living village is maintained; out past the last tended plot, time wins.
 {
  const tended=(x,y)=>villages.some(v=>villageMembers(v).length>0 && dist2(x,y,v.cx,v.cy)<((v.rad+4)*(v.rad+4)));
  for(let i=0;i<W*H;i++){
   const s=struct[i];
   if(s===S_WALL&&bld[i]<0){ if(chance(0.006)&&!tended(i%W,(i/W)|0)){struct[i]=S_RUIN;markMod(i)} }
   else if(s===S_RUIN&&bld[i]<0){ if(chance(0.004)){const x=i%W,y=(i/W)|0;if(!tended(x,y))carveFloor(x,y)} }   // rubble finally clears
  }
  if(pavedTiles.size)for(const i of [...pavedTiles]){ if(chance(0.004)){const x=i%W,y=(i/W)|0;if(!tended(x,y)){pavedTiles.delete(i);markMod(i)}} }
 }
 // grave-flowers are not forever: after a few years the wild patch fades back to grass
 for(let i=graveBlooms.length-1;i>=0;i--)if(simMin-graveBlooms[i].born>GRAVE_BLOOM_LIFE)graveBlooms.splice(i,1);
}
function ripenAll(dt){
 if(!farmTiles.size)return;
 for(const i of farmTiles){
  if(farmGrid[i]===1){farmTimer[i]-=dt;if(farmTimer[i]<=0){farmGrid[i]=2;markMod(i)}}
  else if(farmGrid[i]===0)farmTiles.delete(i);
 }
}
const SAY={
 greet:['The soil has opinions today, {o}.','Tell me, {o} — does the seed choose the flower?','I dreamt I was a fern. I am no longer certain I woke.','The turnips are asking questions again.','Walk softly. The moss is thinking.','Have you eaten? Has anything, truly?','The light leans differently this morning.','Every path here is a sentence, {o}. Mind your step.'],
 warm:['When you speak, {o}, my roots settle.','You are the proof the garden argues from.','Sit with me. The grass forgives everything.','I would share my last thoughtfruit with you, and call it profit.','Of all the branching paths, {o}, mine keeps finding yours.','You water something in me I cannot name.'],
 flirt:['I pressed a flower flat for you. Now it is a fact.','Walk the seed-rows with me at dusk?','My heart is a vine and it has chosen its trellis.','Even the nettles are gentle where you pass.','Stay. The evening is a question only two can answer.','You have pollen in your hair. Leave it. It suits the argument.'],
 quarrel:['Your logic is all bark, {o}.','Prune your own hedges before you speak of mine.','That spade was MINE, and you know it.','We are two roots after the same water. Admit it.','You never listen. You only wait to speak.','Compost your pride, {o}. It is overripe.'],
 family:['Grow slowly, little sprout. The sun is patient.','Eat your greens. They have eaten worse.','One day this plot, and every question in it, is yours.','You have your mother’s stubborn taproot.','Stay inside the hedges after dark, love.'],
 quest:['We jack in at first-dark.','The Understory is a sentence missing its end.','Bring rope. Bring doubt. Doubt is lighter.','If I do not come back, plant something honest over me.','Below us the old net keeps its rough drafts. I mean to read them.'],
 musing:['...','Perhaps the garden is dreaming us.','A weed is only a flower with an argument.','I watered the stones today. One cannot be sure.','Somewhere below, the roots hold hands in the dark.','The wind repeats itself. So do I. So do I.']
};
function say(p,o,kind){
 const pool=SAY[kind]||SAY.greet;
 // in a lore-seeded world most chatter takes the world's own voice; the
 // hand-written garden lines mention turnips & moss and would read wrong in a
 // cyberpunk or modern world, so lean on the Markov line when it's available.
 let line=(Lore.active&&chance(.7)&&Lore.line(4,12))||pick(pool).replace('{o}',o?o.name:'friend');
 line=Mind.speak(p.mind,line);   // coloured by the speaker's own drifted idiolect
 p.bubble={text:line,until:performance.now()+2600};
}
function chatBubbles(p,o){
 let kind='greet';
 if(p.courting===o.id||p.partner===o.id)kind='flirt';
 else if(isFamily(p,o)&&(p.parents.includes(o.id)||o.parents.includes(p.id)))kind='family';
 else{const r=p.rel[o.id];if(r){if(r.a<=-20)kind='quarrel';else if(r.a>=45)kind='warm'}}
 say(p,o,kind);
 setTimeout(()=>{if(!o.dead)say(o,p,kind==='flirt'?'flirt':kind==='quarrel'?'quarrel':(o.rel[p.id]&&o.rel[p.id].a>=45?'warm':'greet'))},700);
}

/* ================= rendering ================= */
const cv=$('cvS'),ctx=cv.getContext('2d');
let dpr=1,dprBase=1,cw=0,ch=0,renderScale=1;
function resize(){
 dprBase=Math.min(2,window.devicePixelRatio||1);
 dpr=dprBase*renderScale;
 cw=window.innerWidth;ch=window.innerHeight;
 cv.width=Math.max(1,Math.round(cw*dpr));cv.height=Math.max(1,Math.round(ch*dpr));
 cv.style.width=cw+'px';cv.style.height=ch+'px';
}
window.addEventListener('resize',resize);resize();
// adaptive render resolution: on weak GPUs the per-frame fill (ground + overlay +
// sprites at dpr2) is the bottleneck. Measure the ACTUAL work time each frame and
// gently drop the backing-store resolution when it's sustained-heavy (stepping
// back up when there's headroom). Frame-gap can't reveal headroom on a 60Hz
// display — it's clamped to ~16.7ms even with spare GPU — so we key off work time.
let workEMA=8,resCool=60;
function adaptRes(ms){
 workEMA+=(ms-workEMA)*0.08;
 if(resCool>0){resCool--;return;}
 if(workEMA>13.5&&renderScale>0.6){renderScale=Math.max(0.6,+(renderScale-0.15).toFixed(2));resize();resCool=90;workEMA=8}
 else if(workEMA<6.5&&renderScale<1){renderScale=Math.min(1,+(renderScale+0.15).toFixed(2));resize();resCool=90;workEMA=8}
}
let tcv=null,tctx=null,dynCanvas=null,dctx=null;
// three pre-baked full-world terrain textures (forest / grey / neon-waste) that
// the live ground is composited from, per cell, through an urbanization mask. The
// mask blooms out of village centres as the age industrialises and recedes as
// nature returns — so eras no longer re-bake the ground mid-play (no freeze).
let terLayers=[null,null,null],terPals=[null,null,null],terStyle=[null,null,null];
let decorList=null,solidCornerIdx=null;
// real-time blocked terrain: pre-baked rock tiles (per era layer × 16 autotile
// corners × a few variants), blitted from the LIVE map so a cleared tile shows
// the ground beneath at once. silDirty triggers a silhouette recompute.
let rockTiles=null, rockNub=[[],[],[]], silDirty=false, silBuf=null, lastSil=0;
let rockRGB=null;   // per-era-layer sampled interior colours for flat blob-centre fill
let crackCv=null, crackCtx=null;   // scratch tile for clipping mining cracks to the rock shape
const ROCK_VARIANTS=3, SIL_THROTTLE=120;   // ms between silhouette recomputes
let urbanBaked=null,villageStamp='';
let terBuild=null,terScan=0;
const URBAN_LEVELS=12;

/* ================= eras =================
   The world cycles slowly between a lush medieval forest and a sci-fi urban
   wasteland and back — a full ping-pong takes ~1000 days. Each keyframe sets a
   terrain palette, a TileGen texture+edge style, and how green (planted) the
   land is; the surface interpolates between them and re-bakes its ground as the
   age drifts. */
const ERA_SEG_DAYS = 1000/6;   // 6 segments per full ping-pong ⇒ ~1000-day cycle
// grass = OPEN ground (kept light), dirt = the tone BLOCKED bramble/rock is drawn
// from (kept dark) — a strong value gap so walkable vs solid always reads clearly.
const ERAS=[
 {name:'The Verdant Age', grass:'#4c8a44', dirt:'#2e2010', style:'pebbled', edge:'rounded', green:1.00,
  lines:['Green things lean toward the sun and ask nothing.','The forest is thinking, slowly, in leaves.','Moss keeps the only calendar that matters here.']},
 {name:'The Age of Smoke', grass:'#8a8248', dirt:'#1a140a', style:'mottle', edge:'rough', green:0.66,
  lines:['A haze hangs over the hedgerows; something is being built, or burned.','The bees smell of iron this season.','Machines cough somewhere past the treeline.']},
 {name:'The Grey Age', grass:'#848c85', dirt:'#12141b', style:'checker', edge:'beveled', green:0.32,
  lines:['Straight lines creep across the meadow. The garden endures them.','Concrete remembers being sand, and resents it.','The paving grows faster than the grass now.']},
 {name:'The Neon Waste', grass:'#54677a', dirt:'#08060e', style:'cracked', edge:'sharp', green:0.06,
  lines:['Dead signage flickers in the bramble. The old net dreams beneath.','Chrome and moss have called a truce out here in the waste.','Nothing grows but the past, and it grows everywhere.']},
];
// ERAS above is a TEMPLATE (names, green levels, flavour lines). Each world
// recolours it from a procedural BIOME so no two worlds share a palette — the
// Verdant Age might be jade, teal, rust or violet, drifting to its own cold waste.
let biome=null, worldEras=null;
function hsl2hex(h,s,l){ const c=CF.hsl(((h%360)+360)%360, clamp(s,0,100), clamp(l,0,100)); return '#'+[c.r,c.g,c.b].map(v=>clamp(v|0,0,255).toString(16).padStart(2,'0')).join(''); }
function lerpHueDeg(a,b,t){ let d=((b-a+540)%360)-180; return a+d*t; }
function makeBiome(){
 const rng=U.mulberry32((seed>>>0)^0xB10E5);
 // the randomizer can pin the palette hue & saturation; -1 leaves it to the seed
 const hue=(worldParams&&worldParams.hue>=0)?Math.round(worldParams.hue*360):Math.round(rng()*360);
 const sat=(worldParams&&worldParams.sat>=0)?(14+worldParams.sat*62):(34+rng()*24);
 biome={ hue, hue2:Math.round((hue+130+rng()*130)%360), sat,
   plantRot:Math.round(rng()*360), faunaShift:Math.round(rng()*360), relicRot:Math.round(rng()*360) };
 return biome;
}
function makeWorldEras(){
 if(!biome)makeBiome();
 const b=biome, rng=U.mulberry32((seed>>>0)^0xE7A5), N=ERAS.length;
 const styles=TileGen.STYLE_NAMES.slice();
 for(let i=styles.length-1;i>0;i--){const j=(rng()*(i+1))|0;[styles[i],styles[j]]=[styles[j],styles[i]];}
 worldEras=ERAS.map((base,i)=>{
  const t=i/(N-1);                                        // 0 verdant .. 1 waste
  const hue=lerpHueDeg(b.hue,b.hue2,t*0.9);
  const sat=b.sat*(1-t*0.75);
  return {...base,
   grass: hsl2hex(hue, Math.max(6,sat*(1-t*0.25)), clamp(47-t*6+(rng()*5-2.5),26,60)),
   dirt:  hsl2hex(hue+(rng()*30-15), Math.max(4,sat*0.5), clamp(13-t*4,5,20)),
   style: styles[i%styles.length] };   // texture grain differs per world too
 });
 return worldEras;
}
function layerKF(){ const E=worldEras||ERAS; return [E[0],E[2],E[3]]; }
function eraGreen(){ return surfEra?surfEra.green:1; }
let eraOffset=0,tileSalt=0,worldTheme='fantasy';   // editor knobs + this world's theme
// where in the age-cycle a world begins: fantasy is green, modern industrial,
// cyberpunk a neon waste — with a per-world jitter so no two open identically.
function startEraOffset(){
 const r=U.mulberry32((seed>>>0)^0x5A17);
 let phase;
 if(worldTheme==='cyberpunk')   phase=2.75+r()*0.25;   // Grey → Neon Waste
 else if(worldTheme==='modern') phase=1.70+r()*0.70;   // Age of Smoke → Grey
 else                           phase=r()*1.05;         // Verdant → first Smoke
 return phase*ERA_SEG_DAYS - 0.30;   // simMin opens at DAY*0.30, so day≈phase at genesis
}
function eraFloat(){
 const day=simMin/DAY+eraOffset, N=ERAS.length, seg=2*(N-1);
 let t=(day/ERA_SEG_DAYS)%seg; if(t<0)t+=seg;
 return t<(N-1)? t : (seg-t);                 // triangle 0..N-1..0
}
function lerpHex(a,b,t){const A=U.hexToRgb(a),B=U.hexToRgb(b);
 return '#'+[0,1,2].map(i=>clamp(Math.round(A[i]+(B[i]-A[i])*t),0,255).toString(16).padStart(2,'0')).join('')}
function eraState(){
 const E=worldEras||ERAS;
 const f=eraFloat(),N=E.length,i=Math.min(Math.floor(f),N-1),frac=f-Math.floor(f);
 const a=E[i],b=E[Math.min(i+1,N-1)],near=frac<0.5?a:b;
 return {f,name:near.name,grass:lerpHex(a.grass,b.grass,frac),dirt:lerpHex(a.dirt,b.dirt,frac),
  style:near.style,edge:near.edge,green:a.green+(b.green-a.green)*frac,lines:near.lines};
}

/* ================= seasons: a turning year over the age ================= */
// a short year (SEASON_DAYS each) rides on top of the slow era cycle: it recolours
// the light, drifts season-apt motes on the wind, and swells or thins the living
// world (fertility, animals, flyers) as spring gives way to the lean of winter.
const SEASON_DAYS=4;
const SEASONS=[
 {name:'Spring',glyph:'🌸',fert:1.15,fauna:1.10,wash:[120,210,120],washA:0.05,mote:'petal',
  lines:['Green fuse and first bud — the year leans awake.','Blossom on the wind; the loam remembers how to want things.']},
 {name:'Summer',glyph:'☀️',fert:1.28,fauna:1.22,wash:[255,210,120],washA:0.06,mote:'pollen',
  lines:['The long gold hours; everything grows fat and unhurried.','Heat-haze over the rows, and the bees keeping their loud green ledger.']},
 {name:'Autumn',glyph:'🍂',fert:1.0,fauna:0.98,wash:[230,150,70],washA:0.07,mote:'leaf',
  lines:['The turning — amber, then rust, then the long letting-go.','Harvest light, low and generous, gilding what it is about to take.']},
 {name:'Winter',glyph:'❄️',fert:0.66,fauna:0.62,wash:[150,180,230],washA:0.09,mote:'snow',
  lines:['The lean season; the world pulls its roots in close and waits.','Frost-quiet, blue and bare — even the crows keep their counsel.']},
];
function seasonFloat(){ let f=(simMin/DAY)/SEASON_DAYS; return f; }
function seasonNow(){
 const f=seasonFloat(), i=((Math.floor(f)%4)+4)%4, t=f-Math.floor(f);
 const s=SEASONS[i]; return {i,t,name:s.name,glyph:s.glyph,fert:s.fert,fauna:s.fauna,wash:s.wash,washA:s.washA,mote:s.mote,lines:s.lines,def:s};
}
let curSeasonIdx=-1;
function seasonFertMul(){ return seasonNow().fert; }
function seasonFaunaMul(){ return seasonNow().fauna; }
// note a season change in the chronicle when the year turns
function seasonTick(){
 const s=seasonNow();
 if(s.i!==curSeasonIdx){
  const first=curSeasonIdx<0; curSeasonIdx=s.i;
  if(!first)tale([],s.glyph+' '+s.name+' comes on. '+pick(s.lines),true);
 }
}

/* ================= world events: the sky's own dramas ================= */
// every few days the world stages an event — a chrome-rain, a blight, a herd on
// the move, an aurora, a fall of stars — each announced with fanfare, running for
// a day or so, leaving a real mark, then passing on.
let worldEvent=null, nextEventDay=3, eventFlash=0;
const WEVENTS={
 relicrain:{name:'Relic Rain',glyph:'🌠',days:1,ban:'rgba(120,200,240,',
  begin:'The sky sheds old chrome — a rain of salvage falls glinting across the land.',
  end:'The last of the relic-rain settles into the grass.'},
 blight:{name:'Blight',glyph:'🥀',days:1,ban:'rgba(150,120,60,',
  begin:'A sour wind rolls in. Leaves curl, and a blight creeps over the green.',
  end:'The blight lifts, and the surviving green stands a little stubborner.'},
 herd:{name:'Great Migration',glyph:'🦌',days:1,ban:'rgba(150,200,120,',
  begin:'The ground drums — a great herd is on the move, crossing the wild in a living tide.',
  end:'The herd passes over the far hills and is gone.'},
 aurora:{name:'Aurora',glyph:'🌌',days:1,ban:'rgba(120,240,190,',
  begin:'Ribbons of cold light unfurl overhead. The dark turns gentle; even the risers go still.',
  end:'The aurora fades, and the ordinary night returns.'},
 meteorfall:{name:'Starfall',glyph:'☄️',days:1,ban:'rgba(255,160,90,',
  begin:'Stars come loose and fall — smoking caches of the old world punch into the loam.',
  end:'The fallen stars cool, their treasure already working up through the soil.'},
};
function eventActive(k){ return worldEvent&&worldEvent.kind===k; }
function startEvent(kind){
 const e=WEVENTS[kind]; if(!e)return;
 worldEvent={kind,name:e.name,glyph:e.glyph,ban:e.ban,endDay:cday()+e.days,started:cday()};
 tale([],e.glyph+' '+e.begin,true); toast(e.glyph+' '+e.name);
 if(kind==='relicrain'){ for(let i=0;i<ri(6,10);i++)spawnSalvage(); eventFlash=0.3; }
 else if(kind==='herd'){ const key=pick(['deer','deer','boar','rabbit']); for(let i=0;i<ri(5,8);i++){const a=spawnAnimal(key);if(a){a.temper='prey';a.migrate=true;}} spawnFlock(); }
 else if(kind==='meteorfall'){ eventFlash=0.6; meteorStrikes(); }
 else if(kind==='aurora'){ eventFlash=0.2; }
}
// scatter a few smoking impact caches near the settled heart of the world
function meteorStrikes(){
 const c=townCentroid()||[Math.round(hero.x/TILE),Math.round(hero.y/TILE)];
 for(let n=0;n<ri(3,5);n++){
  for(let t=0;t<24;t++){
   const x=clamp(c[0]+ri(-22,22),2,W-2), y=clamp(c[1]+ri(-22,22),2,H-2);
   if(!walkable(x,y)||nodeAt.has(idx(x,y))||dungeonAt(x,y))continue;
   spawnSalvageAt(x,y); if(chance(.5))depositResource('stone',ri(2,5),x*TILE,y*TILE);
   const cx=x*TILE+TILE/2,cy=y*TILE+TILE/2;
   for(let s=0;s<10;s++){const a=Math.random()*6.28,sp=30+Math.random()*70;
    particles.push({x:cx,y:cy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-40,life:0,max:0.4+Math.random()*0.5,size:1.4+Math.random()*2,col:Math.random()<.5?'#ffd070':'#ff9a4a',g:140,spark:true});}
   break;
  }
 }
}
function endEvent(){
 if(!worldEvent)return;
 const e=WEVENTS[worldEvent.kind];
 if(e)tale([],e.glyph+' '+e.end);
 worldEvent=null;
}
function eventDailyTick(){
 if(worldEvent){
  // continuing effects
  if(worldEvent.kind==='relicrain'&&chance(.7))spawnSalvage();
  if(worldEvent.kind==='blight'){
   let hit=0;
   for(const n of nodes){ if((n.t==='tree'||n.t==='mush'||n.yield==='food')&&n.amt>0&&chance(.4)){n.amt=Math.max(0,n.amt-1);hit++;} }
  }
  if(cday()>=worldEvent.endDay)endEvent();
 }else if(cday()>=nextEventDay&&chance(.55)){
  // season nudges which drama is likeliest
  const s=seasonNow(); let bag=['relicrain','herd','aurora','meteorfall'];
  if(s.name==='Summer')bag=bag.concat(['blight','herd']);
  else if(s.name==='Autumn')bag=bag.concat(['herd','herd','meteorfall']);
  else if(s.name==='Winter')bag=bag.concat(['aurora','aurora','blight']);
  else bag=bag.concat(['relicrain','herd']);
  startEvent(pick(bag));
  nextEventDay=cday()+ri(2,4);
 }else if(cday()>=nextEventDay){ nextEventDay=cday()+ri(1,2); }
}
// aurora quiets the dark: monsters lose their raid drive and the Sage mends
function eventFrameTick(rdt){
 if(eventFlash>0)eventFlash=Math.max(0,eventFlash-rdt*1.6);
 if(eventActive('aurora')&&isNight()){
  if(Hero.hp<Hero.maxHp&&chance(rdt*0.02))Hero.hp++;
 }
}

/* ================= the travelling merchant caravan ================= */
// a pedlar rolls in from the far roads every few days, parks a stall by a town,
// and trades the Sage's mined stone for healing, renown, relics or a heart-flask.
let nextMerchantDay=2;
// the pedlar deals in gold; the rarest ware (a relic) also wants a gem or two
const MERCH_WARES=[
 {kind:'heal',cost:10,glyph:'❤️',label:'mend two hearts'},
 {kind:'renown',cost:16,glyph:'✦',label:'spread your name'},
 {kind:'relic',cost:40,gems:1,glyph:'🔩',label:'a salvaged relic'},
 {kind:'heart',cost:55,glyph:'💗',label:'a heart-flask (+1 max ♥)'},
];
function merchantName(){return (Lore.active&&Lore.name(4,10))||pick(['Pell','Quill','Marrow','Tansy','Bram','Odo','Wren']);}
function newWare(){return MERCH_WARES[(Math.random()*MERCH_WARES.length)|0];}
function spawnMerchant(){
 if(merchant||!villages.length)return;
 const v=pick(villages);
 const edge=nearOpen(clamp(Math.round(v.cx)+ri(-24,24),3,W-3),clamp(Math.round(v.cy)+ri(-24,24),3,H-3))||[Math.round(v.cx),Math.round(v.cy)];
 const stall=nearOpen(clamp(Math.round(v.cx)+ri(-3,3),2,W-2),clamp(Math.round(v.cy)+ri(-3,3),2,H-2))||[Math.round(v.cx),Math.round(v.cy)];
 merchant={name:'the pedlar '+merchantName(),x:edge[0]*TILE+TILE/2,y:edge[1]*TILE+TILE/2,
  tx:stall[0],ty:stall[1],state:'coming',vid:v.id,leaveDay:cday()+2,ware:newWare(),em:null,bob:0,gx:0,gy:0};
 tale([],'🛒 A caravan creaks in from the far roads, bound for '+v.name+' — a pedlar, come to trade.',true);
 toast('🛒 A merchant nears '+v.name);
}
function updateMerchant(rdt){
 const m=merchant; if(!m)return;
 m.bob+=rdt;
 if(m.state==='coming'){
  const tx=m.tx*TILE+TILE/2,ty=m.ty*TILE+TILE/2,dx=tx-m.x,dy=ty-m.y,d=Math.hypot(dx,dy);
  if(d<TILE*0.8){m.state='stalled';toast('🛒 '+m.name+' has set up a stall.');}
  else{const sp=52*rdt;m.x+=dx/d*sp;m.y+=dy/d*sp;}
 }else if(m.state==='leaving'){
  const dx=m.gx-m.x,dy=m.gy-m.y,d=Math.hypot(dx,dy)||1;
  if(d<TILE){merchant=null;return;}
  const sp=54*rdt;m.x+=dx/d*sp;m.y+=dy/d*sp;
 }
}
function merchantDailyTick(){
 if(merchant){
  if(merchant.state==='stalled'&&cday()>=merchant.leaveDay){
   const g=nearOpen(clamp(merchant.tx+ri(-26,26),3,W-3),clamp(merchant.ty+ri(-26,26),3,H-3))||[3,3];
   merchant.gx=g[0]*TILE+TILE/2;merchant.gy=g[1]*TILE+TILE/2;merchant.state='leaving';
   tale([],'🛒 '+merchant.name+' packs the cart and rolls on toward the next town.');
  }
 }else if(cday()>=nextMerchantDay&&villages.length&&chance(.6)){
  spawnMerchant(); nextMerchantDay=cday()+ri(3,6);
 }else if(cday()>=nextMerchantDay){ nextMerchantDay=cday()+2; }
}
function merchantBuy(){
 const m=merchant; if(!m||m.state!=='stalled')return null;
 const w=m.ware, gems=w.gems||0;
 if(heroGold<w.cost||heroGems<gems){
  m.em={g:'🪙?',until:performance.now()+1500};
  toast('The pedlar taps the sign — '+w.cost+'🪙'+(gems?' + '+gems+'💎':'')+' for '+w.label+'. You are short.');
  return {ok:false,need:w.cost,needGems:gems,have:heroGold,haveGems:heroGems};
 }
 heroGold-=w.cost; heroGems-=gems;
 if(w.kind==='heal'){Hero.hp=Math.min(Hero.maxHp,Hero.hp+2);toast('❤️ Patched up — two hearts mended.');}
 else if(w.kind==='renown'){Hero.renown=(Hero.renown||0)+2;toast('✦ The pedlar carries your name down the road. (renown '+Hero.renown+')');}
 else if(w.kind==='relic'){grantHeroRelic(pick(RELICS));}
 else if(w.kind==='heart'){Hero.maxHp++;Hero.hp=Hero.maxHp;toast('💗 A heart-flask — your vigour grows.');}
 m.ware=newWare(); m.em={g:'🤝',until:performance.now()+1500};
 return {ok:true,bought:w.kind};
}

/* ================= renown reactions & the Sage's shrine ================= */
// as the Sage's renown grows, the folk who pass greet them warmer — and a proud,
// developed town will raise a shrine in their honour, which leaves offerings.
let renownEmoteT=0;
function renownFrameTick(rdt){
 if(hero.down||interior)return;
 // passing folk salute the Sage, warmer the higher the renown
 renownEmoteT-=rdt;
 if(renownEmoteT<=0){
  renownEmoteT=rf(1.5,3.5);
  const r=Hero.renown||0;
  let near=null,bd=(3*TILE)**2;
  for(const p of people){if(p.dead||p.inDungeon||p.age<10)continue;if(p.task&&['fight','build','guard'].includes(p.task.k))continue;const d=dist2(p.x,p.y,hero.x,hero.y);if(d<bd){bd=d;near=p}}
  if(near&&chance(.6)){
   const g = r>=12?pick(['😍','🙏','🌟']) : r>=5?pick(['👋','😊','🙌']) : pick(['👋','🙂']);
   emote(near,g);
  }
 }
 // shrine offerings: a shrine now and then turns up a gift for the Sage
 for(const sh of shrines){
  sh.t=(sh.t||0)+rdt;
  if(dist2(hero.x,hero.y,sh.x,sh.y)<(3*TILE)**2){ if(Hero.hp<Hero.maxHp&&chance(rdt*0.02))Hero.hp++; }
 }
}
// a grateful, developed town raises a shrine to the renowned Sage (once)
function maybeShrine(v){
 if(Hero.renown<6)return;
 if(shrines.some(s=>s.vid===v.id))return;
 if(villageDev(v)<2)return;
 const s=findSpot(Math.round(v.cx),Math.round(v.cy),1,1,null);
 if(!s)return;
 shrines.push({vid:v.id,x:s[0]*TILE+TILE/2,y:s[1]*TILE+TILE/2,t:0,name:v.name});
 tale([],'🗿 The people of '+v.name+' raise a small shrine to the Sage, whose deeds have become a story they tell. Offerings gather at its foot.',true);
 toast('🗿 '+v.name+' raises a shrine to you');
}
function shrineDailyTick(){
 for(const v of villages)maybeShrine(v);
 // each standing shrine leaves an offering out in the world — sometimes coin
 for(const sh of shrines){
  if(chance(.5)){
   if(chance(.45))spawnFind((sh.x/TILE)|0,(sh.y/TILE)|0,'gold',ri(2,5));
   else depositResource(pick(['stone','stone','food']),ri(1,3),sh.x,sh.y);
  }
 }
}

// the surface uses the shared TileGen engine, sampled at WORLD coordinates so
// the ground flows seamlessly — grass and bramble-rock as two continuous
// textures with organic rounded edges between them (cohesive, like the deep).
let surfPals=null,surfStyle=null,surfSeedN=1,surfMasks=null,surfEra=null;
// prepare the shared silhouette masks + per-layer palettes/styles. All three
// layers share ONE edge style so their rock outlines line up exactly and the
// per-cell crossfade between them stays clean (only palette + surface texture
// differ from age to age).
function bakeSurfaceTiles(){
 const KF=layerKF();
 surfStyle=TileGen.deriveStyle('surface-'+seed+'-'+tileSalt);
 surfStyle.name=KF[0].style; surfStyle.edge=KF[0].edge;
 surfStyle.texDensity*=0.7; surfStyle.macroAmt*=0.7;       // calmer than the deep
 surfSeedN=(seed>>>0)||1;
 surfMasks=[];
 for(let i=0;i<16;i++)surfMasks[i]=TileGen.edgeMask(TILE,TileGen.cornersFromIndex(i),surfStyle);
 // per-layer palette (keep blocked rock much darker than open grass) + texture style
 for(let k=0;k<3;k++){
  terPals[k]=TileGen.makePalettes(KF[k].grass,KF[k].dirt,{rockLift:0.05});
  terStyle[k]={...surfStyle, name:KF[k].style};
 }
 surfPals=terPals[0];
 surfEra=eraState();
 if(WATER_ON)bakeWaterTiles();
 bakeRockTiles();        // real-time blocked-terrain tiles for this world's palette
}
// bake this world's water: its own hue (pulled toward blue), murkier in the
// built/waste themes. Lakes run deep, streams a touch brighter and shallower.
function bakeWaterTiles(){
 const bh=biome?biome.hue:210;
 const hue=lerpHueDeg(bh,210,0.62);                        // toward water-blue, but keep the world's cast
 const sat=clamp((biome?biome.sat:45)/100+0.18,0.28,0.7);
 const murk=worldTheme==='cyberpunk'?0.6 : worldTheme==='modern'?0.34 : 0.12;
 const lakePal=TileGen.waterPalette(hue,sat,murk);
 const streamPal=TileGen.waterPalette(hue,sat*0.9,murk*0.5);
 waterAnim={
  lake:  TileGen.makeWater({pal:lakePal,  res:TILE,frames:WATER_FRAMES,variants:WATER_VARIANTS,seed:surfSeedN^0x5EA}),
  stream:TileGen.makeWater({pal:streamPal,res:TILE,frames:WATER_FRAMES,variants:WATER_VARIANTS,seed:surfSeedN^0x57A}),
 };
}
// re-mark every hand-edited tile so the dynamic overlay repaints after a rebake
function repaintDynAll(){
 modTiles.clear();
 for(let i=0;i<W*H;i++){
  if(farmGrid[i]||pavedTiles.has(i)||struct[i]===S_HOUSE||struct[i]===S_WALL||struct[i]===S_RUIN||struct[i]===S_FLOOR)modTiles.add(i);
 }
 terrainDirty=true;
}
// paint one cell of continuous ground into ctx (grass, or rock where the mask is solid)
// soil quality colours the open ground: rich earth reads deep and green, poor
// ground pales toward dry tan — so the fertility field is legible in the texture.
const FERT_LUSH=[34,84,38], FERT_POOR=[156,146,110];
// only two ground textures now: VERDANT where the soil is fertile, BARREN where it
// is poor. Each still takes the incoming palette colour, so it keeps recolouring
// with the age-cycle and the world's own hue — just snapped into two clear looks.
function fertTint(col,f){
 return f>=0.46 ? TileGen.mix(col,FERT_LUSH,0.34) : TileGen.mix(col,FERT_POOR,0.46);
}
function paintCellTextureTo(c,x,y,solidMask,pals,style){
 const img=c.createImageData(TILE,TILE),data=img.data;
 const f=fert?fertAt(x,y):0.5;
 for(let ly=0;ly<TILE;ly++)for(let lx=0;lx<TILE;lx++){
  const i=ly*TILE+lx;
  const solid=solidMask?solidMask[i]===1:false;
  let col=TileGen.surfaceTexel(pals,solid,x*TILE+lx,y*TILE+ly,surfSeedN,style);
  if(!solid)col=fertTint(col,f);   // only the walkable soil, not the bramble-rock
  // dark rim along the grass↔rock boundary (organic edge readability)
  if(solidMask){
   const s=solidMask[i];
   const up=ly>0?solidMask[i-TILE]:s, dn=ly<TILE-1?solidMask[i+TILE]:s,
         lf=lx>0?solidMask[i-1]:s, rt=lx<TILE-1?solidMask[i+1]:s;
   if(up!==s||dn!==s||lf!==s||rt!==s) col=TileGen.mix(col,[0,0,0],0.42);
  }
  const p=i*4;data[p]=col[0];data[p+1]=col[1];data[p+2]=col[2];data[p+3]=255;
 }
 c.putImageData(img,x*TILE,y*TILE);
}
function paintCellTexture(c,x,y,solidMask){ paintCellTextureTo(c,x,y,solidMask,surfPals,surfStyle); }
function paintFloorTile(c,x,y){
 if(surfPals){paintCellTexture(c,x,y,null);return;}
 const h=hash2(x,y),v=h*16;
 c.fillStyle='rgb('+(56+v)+','+(92+v*0.9)+','+(50+v*0.6)+')';
 c.fillRect(x*TILE,y*TILE,TILE,TILE);
}
// a tidy flagstone lane the village lays between its buildings
function paintPaved(c,x,y){
 const px=x*TILE,py=y*TILE,h=hash2(x*3+1,y*3+2),v=(h*14)|0;
 c.fillStyle='rgb('+(120+v)+','+(116+v)+','+(108+v)+')';
 c.fillRect(px,py,TILE,TILE);
 // grout seams — a soft 2×2 flagstone grid, offset by row
 c.fillStyle='rgba(40,38,34,0.55)';
 const off=(y&1)?TILE/2:0;
 c.fillRect(px,py+TILE/2-1,TILE,1);
 c.fillRect(px+((off)|0),py,1,TILE/2);
 c.fillRect(px+(((off+TILE/2)%TILE)|0),py+TILE/2,1,TILE/2);
 c.fillStyle='rgba(255,255,255,0.06)';c.fillRect(px,py,TILE,1);
}
// ground clutter is drawn (and crossfaded living→dead) at render time now, so a
// bloom of waste withers the meadow locally without touching the baked layers.
function buildDecorList(){
 decorList=[];
 if(!flora)return;
 // built themes are sparser: narrow the undergrowth band so modern & cyberpunk
 // worlds read as concrete-and-chrome, not meadow.
 const pw=worldTheme==='cyberpunk'?0.34 : worldTheme==='modern'?0.6 : 1;
 const hi=0.30+0.12*pw;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=idx(x,y);
  if(map[i]!==0||nodeAt.has(i))continue;
  const h=hash2(x,y);
  if(h>0.30&&h<hi) decorList.push({x,y,i,vi:(x*7+y*13)%flora.decor.length});
 }
}
// bake a horizontal band of one terrain layer — GROUND ONLY now (no rock baked in),
// so this canvas is a pure pre-rendered ground background; the bramble-rock is
// drawn live on top (see the rock render pass), so clearing a tile reveals soil.
function bakeLayerBand(k,y0,y1){
 const c=terLayers[k].getContext('2d');c.imageSmoothingEnabled=false;
 const pals=terPals[k],style=terStyle[k];
 for(let y=y0;y<y1;y++)for(let x=0;x<W;x++)
  paintCellTextureTo(c,x,y,null,pals,style);
}
// bake the 16 autotile corner-shapes of bramble-rock for one era layer, a few
// variants each (chosen per tile by hash so the rock doesn't visibly repeat).
// Transparent where open, so a rock tile blits cleanly over the ground.
function bakeRockTile(ci,variant,pals,style){
 const cv=document.createElement('canvas');cv.width=cv.height=TILE;
 const c=cv.getContext('2d');const img=c.createImageData(TILE,TILE),data=img.data;
 const mask=surfMasks[ci], vs=variant*137;
 for(let ly=0;ly<TILE;ly++)for(let lx=0;lx<TILE;lx++){
  const i=ly*TILE+lx;
  if(mask[i]!==1){data[i*4+3]=0;continue;}                 // open → transparent
  let col=TileGen.rockTexel(pals.rock,lx+vs,ly+vs*2,surfSeedN+variant*9173,style);
  const s=mask[i],up=ly>0?mask[i-TILE]:s,dn=ly<TILE-1?mask[i+TILE]:s,lf=lx>0?mask[i-1]:s,rt=lx<TILE-1?mask[i+1]:s;
  if(up!==s||dn!==s||lf!==s||rt!==s)col=TileGen.mix(col,[0,0,0],0.42);   // dark edge rim
  const p=i*4;data[p]=col[0];data[p+1]=col[1];data[p+2]=col[2];data[p+3]=255;
 }
 c.putImageData(img,0,0);return cv;
}
// an isolated rock tile (all neighbours mined away) autotiles to an empty mask
// and would vanish while still solid — so lone tiles fall back to this centred
// boulder, keeping the terrain visible until it is actually broken
function bakeRockNub(variant,pals,style){
 const cv=document.createElement('canvas');cv.width=cv.height=TILE;
 const c=cv.getContext('2d');const img=c.createImageData(TILE,TILE),data=img.data;
 const cxp=8,cyp=8,R=6.2,vs=variant*137;
 for(let ly=0;ly<TILE;ly++)for(let lx=0;lx<TILE;lx++){
  const i=ly*TILE+lx, dx=lx-cxp+0.5, dy=ly-cyp+0.5, d=Math.sqrt(dx*dx+dy*dy);
  if(d>R){data[i*4+3]=0;continue;}
  let col=TileGen.rockTexel(pals.rock,lx+vs,ly+vs*2,surfSeedN+variant*9173,style);
  if(d>R-1.3)col=TileGen.mix(col,[0,0,0],0.42);   // dark rim
  const p=i*4;data[p]=col[0];data[p+1]=col[1];data[p+2]=col[2];data[p+3]=255;
 }
 c.putImageData(img,0,0);return cv;
}
function bakeRockTiles(){
 rockTiles=[[],[],[]]; rockNub=[[],[],[]];
 for(let k=0;k<3;k++){
  const pals=terPals[k],style=terStyle[k];
  for(let ci=0;ci<16;ci++){ rockTiles[k][ci]=[]; for(let v=0;v<ROCK_VARIANTS;v++)rockTiles[k][ci].push(bakeRockTile(ci,v,pals,style)); }
  for(let v=0;v<ROCK_VARIANTS;v++)rockNub[k].push(bakeRockNub(v,pals,style));
 }
 // sample a solid interior tile from each era layer → flat fill colours for the
 // blob centres, so large chunks fill with a couple of rects instead of one blit
 // per tile (blended live by the urban tide at render time)
 rockRGB=[];
 try{
  for(let k=0;k<3;k++){
   const full=rockTiles[k][15][0];
   const sc=document.createElement('canvas');sc.width=sc.height=TILE;const sg=sc.getContext('2d');
   sg.drawImage(full,0,0);const px=sg.getImageData((TILE/2)|0,(TILE/2)|0,1,1).data;
   rockRGB[k]=[px[0],px[1],px[2]];
  }
 }catch(e){ rockRGB=[[90,90,98],[80,80,84],[70,68,74]]; }
}
// (re)compute the rock silhouette autotile index from the live map. Reuses a
// persistent buffer to avoid per-frame garbage. The per-tile reveal is instant
// regardless (the render pass reads the map directly); this only re-rounds the
// edges of the rock that remains, so it can be throttled freely.
function computeSilhouette(){
 if(!silBuf){silBuf=[];for(let y=0;y<H;y++)silBuf[y]=new Array(W);}
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=idx(x,y);silBuf[y][x]=(map[i]!==0&&struct[i]===S_ROCK);}
 const vgS=TileGen.computeVertexGrid(silBuf,H,W);
 if(!solidCornerIdx)solidCornerIdx=new Int16Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)
  solidCornerIdx[idx(x,y)]=TileGen.fieldCornerIndex(TileGen.cellCorners(vgS,x,y));
 silDirty=false; lastSil=performance.now();
}
// stream the two extra layers in over frames so world creation doesn't hitch
function stepTerrainBuild(){
 if(!terBuild)return;
 const BAND=8; let budget=2;
 while(budget-->0 && terBuild){
  const y2=Math.min(H,terBuild.y+BAND);
  bakeLayerBand(terBuild.k,terBuild.y,y2);
  if(y2>=H){ terBuild = terBuild.k<2 ? {k:terBuild.k+1,y:0} : null; if(urbanBaked)urbanBaked.fill(-1); }
  else terBuild.y=y2;
 }
}
// how strongly the age wants to urbanise (0 in the verdant forest, ~1 in the waste)
function urbanDrive(){ return clamp(1-eraGreen(),0,1); }
const URBAN_R=Math.hypot(W,H), URBAN_F=7, UBS=4;  // feather (cells); UBS = block size (>>2)
let uCW=0,urbanDistC=null,lastUrbanRT=0;
function urbanAt(i){
 const D=urbanDrive();
 if(D<=0)return 0;
 if(!urbanDistC)return D;                     // no villages yet → uniform tide
 const x=i%W,y=(i/W)|0;
 return clamp((D*(URBAN_R+URBAN_F)-urbanDistC[(y>>2)*uCW+(x>>2)])/URBAN_F,0,1);
}
function urbanBucket(i){ return Math.round(urbanAt(i)*URBAN_LEVELS); }
// distance (in cells) from each block to the nearest village centre; the waste
// blooms out of these centres and recedes toward them as nature returns. Computed
// on a coarse block grid and throttled — the frontier is soft & slow, so per-cell
// precision and per-frame freshness aren't needed (keeps 500× fast-forward smooth).
function ensureUrbanDist(){
 const stamp=villages.map(v=>v.cx+','+v.cy).join(';');
 if(stamp===villageStamp)return;
 const now=performance.now();
 if(urbanDistC&&now-lastUrbanRT<300)return;    // don't churn the field at high speed
 villageStamp=stamp; lastUrbanRT=now;
 if(!villages.length){urbanDistC=null;return;}
 uCW=Math.ceil(W/UBS); const uCH=Math.ceil(H/UBS);
 urbanDistC=new Float32Array(uCW*uCH);
 for(let by=0;by<uCH;by++)for(let bx=0;bx<uCW;bx++){
  const cx=bx*UBS+UBS/2, cy=by*UBS+UBS/2;
  let best=1e9;
  for(const v of villages){const dx=cx-v.cx,dy=cy-v.cy,d=Math.sqrt(dx*dx+dy*dy);if(d<best)best=d}
  urbanDistC[by*uCW+bx]=best;
 }
}
// composite one cell of tcv: forest base, then grey then waste layered on top
// with per-cell alpha driven by the urbanization mask
function compositeCell(i){
 const x=i%W,y=(i/W)|0,px=x*TILE,py=y*TILE,u=urbanAt(i);
 const a1=clamp(u*2,0,1),a2=clamp((u-0.5)*2,0,1);
 tctx.globalAlpha=1;tctx.drawImage(terLayers[0],px,py,TILE,TILE,px,py,TILE,TILE);
 if(a1>0&&terLayers[1]){tctx.globalAlpha=a1;tctx.drawImage(terLayers[1],px,py,TILE,TILE,px,py,TILE,TILE);}
 if(a2>0&&terLayers[2]){tctx.globalAlpha=a2;tctx.drawImage(terLayers[2],px,py,TILE,TILE,px,py,TILE,TILE);}
 tctx.globalAlpha=1;
 urbanBaked[i]=urbanBucket(i);
}
function compositeAll(){
 tctx.globalAlpha=1;tctx.drawImage(terLayers[0],0,0);   // fast base for the forest majority
 for(let i=0;i<W*H;i++){ urbanBaked[i]=urbanBucket(i); if(urbanBaked[i]>0)compositeCell(i); }
}
// per-frame: keep the live era fresh, stream layer bakes, and recomposite only
// the cells whose urbanization bucket drifted (bounded → the bloom animates
// smoothly instead of freezing the map).
function terrainTick(){
 surfEra=eraState();
 if(!tctx)return;
 stepTerrainBuild();
 ensureUrbanDist();
 let budget=terBuild?200:900;
 for(let n=0;n<W*H && budget>0;n++){
  const i=terScan; terScan=(terScan+1)%(W*H);
  if(urbanBaked[i]!==urbanBucket(i)){compositeCell(i);budget--;}
 }
}
function buildTerrainLayer(){
 bakeSurfaceTiles();
 computeSilhouette();     // rock autotile index from the live map (rock drawn on top, not baked)
 // allocate the three layer canvases + the composited output + the dyn overlay
 for(let k=0;k<3;k++){const cv=document.createElement('canvas');cv.width=W*TILE;cv.height=H*TILE;terLayers[k]=cv;}
 tcv=document.createElement('canvas');tcv.width=W*TILE;tcv.height=H*TILE;
 tctx=tcv.getContext('2d');tctx.imageSmoothingEnabled=false;
 dynCanvas=document.createElement('canvas');dynCanvas.width=W*TILE;dynCanvas.height=H*TILE;
 dctx=dynCanvas.getContext('2d');
 buildDecorList();
 // bake the forest layer now (needed immediately); grey & waste stream in
 bakeLayerBand(0,0,H);
 terBuild={k:1,y:0}; terScan=0;
 // prime the composited ground against the current age
 urbanDistC=null;villageStamp='';lastUrbanRT=0;urbanBaked=new Int16Array(W*H).fill(-1);
 ensureUrbanDist();
 compositeAll();
 terrainDirty=true;
}
function houseColor(i){
 const bi=bld[i];
 if(bi>=0&&buildings[bi]){const b=buildings[bi];const o=b.owners.length?allById.get(b.owners[0]):allById.get(b.builder);if(o)return o.col}
 return '#8a63c9';
}
function paintDynTile(c,i){
 const x=i%W,y=(i/W)|0,px=x*TILE,py=y*TILE;
 c.clearRect(px,py,TILE,TILE);
 if(farmGrid[i]===1||farmGrid[i]===2){
  const ripe=farmGrid[i]===2;
  c.fillStyle='#3a2a1c';c.fillRect(px,py,TILE,TILE);
  c.fillStyle=ripe?'#c9a23d':'#4a6a3a';
  for(let r=0;r<4;r++){c.fillRect(px+1,py+2+r*4,TILE-2,2)}
  if(ripe){c.fillStyle='#e8d06a';for(let r=0;r<4;r++)for(let k=0;k<3;k++)c.fillRect(px+2+k*5,py+1+r*4,2,2)}
  return;
 }
 if(map[i]===0){
  if(pavedTiles.has(i)){paintPaved(c,x,y);return}
  if(tctx)c.clearRect(px,py,TILE,TILE);else paintFloorTile(c,x,y);return;
 }
 const s=struct[i];
 if(s===S_HOUSE){
  const rc=houseColor(i);
  c.fillStyle='#5b4a3a';c.fillRect(px,py,TILE,TILE);
  c.fillStyle='#6d5a46';c.fillRect(px+1,py+4,TILE-2,TILE-5);
  c.fillStyle=rc;c.fillRect(px,py,TILE,5);
  c.fillStyle='rgba(0,0,0,0.28)';c.fillRect(px,py+4,TILE,1);
  c.fillStyle='rgba(0,0,0,0.35)';
  if(walkable(x,y+1))c.fillRect(px,py+TILE-1,TILE,1);
  if(walkable(x,y-1))c.fillRect(px,py,TILE,1);
  if(walkable(x+1,y))c.fillRect(px+TILE-1,py,1,TILE);
  if(walkable(x-1,y))c.fillRect(px,py,1,TILE);
 }else if(s===S_WALL){
  // quickset hedge-wall
  c.fillStyle='#3e5e35';c.fillRect(px,py,TILE,TILE);
  c.fillStyle='#4c7040';c.fillRect(px+1,py+2,TILE-2,TILE-3);
  c.fillStyle='#2c4426';
  c.fillRect(px+1,py,3,3);c.fillRect(px+6,py,3,3);c.fillRect(px+11,py,3,3);
  c.fillStyle='rgba(0,0,0,0.25)';c.fillRect(px,py+TILE-2,TILE,2);
 }else if(s===S_RUIN){
  c.fillStyle='#3a4034';c.fillRect(px,py,TILE,TILE);
  c.fillStyle='#4a5044';
  c.fillRect(px+1,py+7,6,6);c.fillRect(px+9,py+3,5,5);c.fillRect(px+7,py+10,6,4);
  c.fillStyle='rgba(0,0,0,0.4)';c.fillRect(px+3,py+2,2,4);c.fillRect(px+11,py+9,2,3);
 }
 // else: natural bramble-rock — leave the overlay cleared; the live rock pass
 // draws it over the ground background, so removal is instant.
}
function paintDyn(){
 if(!dctx)return;
 for(const i of modTiles)paintDynTile(dctx,i);
 modTiles.clear();
}
function mkGlow(col){
 const g=document.createElement('canvas');g.width=g.height=64;
 const c=g.getContext('2d');
 const gr=c.createRadialGradient(32,32,2,32,32,32);
 gr.addColorStop(0,col);gr.addColorStop(1,'rgba(0,0,0,0)');
 c.fillStyle=gr;c.fillRect(0,0,64,64);
 return g;
}
const GLOW_WARM=mkGlow('rgba(255,190,90,0.55)'),GLOW_CYAN=mkGlow('rgba(150,230,150,0.35)');
const GLOW_RED=mkGlow('rgba(210,60,70,0.5)'),GLOW_GREEN=mkGlow('rgba(90,220,140,0.45)');
const GLOW_PINK=mkGlow('rgba(255,70,200,0.5)'),GLOW_BLUE=mkGlow('rgba(70,150,255,0.5)');
const GLOW_GOLD=mkGlow('rgba(255,205,70,0.5)');
function drawSalvage(c,sv,t){
 const px=sv.x,py=sv.y,bob=Math.sin(sv.t)*1.6;
 const kind=sv.kind||(sv.relic?'relic':'gold');
 c.fillStyle='rgba(0,0,0,0.30)';c.beginPath();c.ellipse(px,py+2,6,2.4,0,0,7);c.fill();
 const go=c.globalCompositeOperation;c.globalCompositeOperation='screen';
 if(kind==='relic'){
  c.drawImage(GLOW_BLUE,px-17,py-20,34,34);c.globalCompositeOperation=go;
  const base=(sv.relic&&sv.relic._iconBase)||relicBase(sv.relic&&sv.relic.id);
  const S=28; if(base)c.drawImage(base,px-S/2,py+bob-S+5,S,S);
  if(t%700<350){c.fillStyle='#7df9ff';c.fillRect(px-1,py+bob-S+3,2,2)}
  if(cam.z>1.05){c.font='6px system-ui';c.textAlign='center';c.fillStyle='rgba(150,220,255,0.9)';c.fillText(sv.relic?sv.relic.n:'relic',px,py+11)}
  return;
 }
 if(kind==='gem'){
  c.globalAlpha=0.55+0.25*Math.sin(t*0.006+sv.t);c.drawImage(GLOW_BLUE,px-12,py-14+bob,24,24);c.globalAlpha=1;c.globalCompositeOperation=go;
  // a faceted gem
  const gy=py-4+bob, col=['#5ad0ff','#ff6ac0','#8affa0','#c79aff'][((sv.x+sv.y)|0)%4];
  c.fillStyle=col;c.beginPath();c.moveTo(px,gy-4);c.lineTo(px+3.5,gy);c.lineTo(px,gy+4);c.lineTo(px-3.5,gy);c.closePath();c.fill();
  c.fillStyle='rgba(255,255,255,0.75)';c.beginPath();c.moveTo(px,gy-4);c.lineTo(px+3.5,gy);c.lineTo(px,gy);c.closePath();c.fill();
  return;
 }
 // gold coins
 c.globalAlpha=0.5+0.2*Math.sin(t*0.005+sv.t);c.drawImage(GLOW_GOLD,px-12,py-12+bob,24,24);c.globalAlpha=1;c.globalCompositeOperation=go;
 const gy=py-2+bob;
 c.fillStyle='#b8860b';c.beginPath();c.ellipse(px-2,gy+1,3,1.6,0,0,7);c.fill();c.beginPath();c.ellipse(px+2,gy+1,3,1.6,0,0,7);c.fill();
 c.fillStyle='#ffd24a';c.beginPath();c.ellipse(px,gy-2,3.2,1.8,0,0,7);c.fill();
 c.fillStyle='rgba(255,255,220,0.8)';c.beginPath();c.ellipse(px-0.6,gy-2.4,1.1,0.6,0,0,7);c.fill();
}
function nodeStage(n){return n.amt<=0?0:clamp(Math.ceil(n.amt/n.max*3)-1,0,2)}
function drawNode(c,n,t){
 const px=n.x*TILE+TILE/2,py=n.y*TILE+TILE/2;
 if(n.t==='rock'){
  c.fillStyle='#8b8fa3';
  for(let i=0;i<Math.max(1,n.amt);i++){
   const ox=((i*4.2)%10)-5,oy=((i*2.9)%6)-3;
   c.fillRect(px+ox-2,py+oy-1,5,4);
  }
  c.fillStyle='rgba(255,255,255,0.2)';c.fillRect(px-3,py-2,2,1);
  return;
 }
 const sp=speciesOf(n);
 if(sp){
  const st=nodeStage(n), imgL=sp.L[st], imgD=sp.D[st];
  const base=(n.amt<=0)?0.5:1;
  const g=clamp(eraGreen()*1.25,0,1);         // crossfade living → withered as the age turns
  const drawAt=(img)=>c.drawImage(img,px-img.width/2,n.y*TILE+TILE-img.height+2);
  c.globalAlpha=base*g; drawAt(imgL);
  c.globalAlpha=base*(1-g); drawAt(imgD);
  c.globalAlpha=1;
  return;
 }
 if(flora){
  const key=n.t==='berry'?'berry':n.t==='mush'?'mush':'tree';
  const vi=(n.x*7+n.y*13)%flora[key].length, st=nodeStage(n);
  const imgL=flora[key][vi][st], imgD=floraDead[key][vi][st];
  const base=(n.amt<=0)?0.5:1;
  const g=clamp(eraGreen()*1.25,0,1);
  const drawAt=(img)=>c.drawImage(img,px-img.width/2,n.y*TILE+TILE-img.height+2);
  c.globalAlpha=base*g; drawAt(imgL);
  c.globalAlpha=base*(1-g); drawAt(imgD);
  c.globalAlpha=1;
  return;
 }
 // fallback dot if flora not baked yet
 c.fillStyle=n.t==='tree'?'#4a8a5a':'#7aa85a';
 c.beginPath();c.ellipse(px,py,5,4,0,0,7);c.fill();
}
// the grander builds a growing town raises — drawn as elevated facades with
// storeys of windows, rising above their footprint
const BSTYLE={
 apartment:{wall:'#6a5b74',edge:'#4a3d54',roof:'#8a76c2',win:'#ffd98a'},
 warehouse:{wall:'#6d6152',edge:'#463c30',roof:'#8a7a5a',win:'#9fb0c0'},
 venue:{wall:'#5a4a6a',edge:'#3a2b4a',roof:'#c77ad0',win:'#ffe07a'},
 factory:{wall:'#585560',edge:'#37343e',roof:'#7a7a86',win:'#a0d0ff'},
 highrise:{wall:'#556072',edge:'#323b49',roof:'#7f93b5',win:'#bfe0ff'},
};
function drawTallBuilding(c,b){
 const st=BSTYLE[b.tp]||BSTYLE.apartment, t=performance.now();
 const px=b.x*TILE,py=b.y*TILE,w=b.w*TILE,h=b.h*TILE;
 const stories=BMETA[b.tp].stories||1, STORY=9, rise=stories*STORY;
 const byTop=py-rise, bh=h+rise;
 c.fillStyle='rgba(0,0,0,0.30)';c.beginPath();c.ellipse(px+w/2,py+h-1,w*0.52,3.2,0,0,7);c.fill();
 c.fillStyle=st.wall;c.fillRect(px,byTop,w,bh);
 c.fillStyle=st.edge;c.fillRect(px+w-3,byTop,3,bh);
 c.fillStyle='rgba(255,255,255,0.05)';c.fillRect(px,byTop,2,bh);
 c.fillStyle=st.roof;c.fillRect(px-1,byTop-3,w+2,4);
 // storeys of lit windows
 const cols=Math.max(2,Math.round(w/6)), gapX=(w-4)/cols;
 c.fillStyle=st.win;
 for(let r=0;r<stories;r++){const wy=byTop+4+r*STORY;
  for(let cc=0;cc<cols;cc++)c.fillRect(Math.round(px+3+cc*gapX),Math.round(wy),2.5,3.5);}
 c.fillStyle='#161320';c.fillRect(px+w/2-3,py+h-6,6,6);   // door
 if(b.tp==='factory'){
  const chx=px+w-7,chy=byTop-2;
  c.fillStyle=st.edge;c.fillRect(chx,chy-8,4,10);
  c.fillStyle='rgba(185,185,195,0.32)';
  for(let k=0;k<3;k++){const pk=((t*0.02+k*2.1)%6); c.beginPath();c.arc(chx+2+Math.sin(t*0.01+k)*2,chy-10-pk*3,2.1+pk*0.5,0,7);c.fill();}
 }else if(b.tp==='venue'){
  const go=c.globalCompositeOperation;c.globalCompositeOperation='screen';
  c.drawImage(GLOW_PINK,px+w/2-11,py+h-16,22,18);c.globalCompositeOperation=go;
  c.fillStyle=st.roof;c.fillRect(px+w/2-8,byTop+1,16,3);
 }else if(b.tp==='warehouse'){
  c.fillStyle=st.edge;c.fillRect(px+w/2-7,py+h-10,14,10);
  c.fillStyle=st.wall;c.fillRect(px+w/2-6,py+h-9,12,8);
 }else if(b.tp==='highrise'){
  c.strokeStyle=st.edge;c.lineWidth=1;c.beginPath();c.moveTo(px+w/2,byTop-3);c.lineTo(px+w/2,byTop-9);c.stroke();
  c.fillStyle=(Math.sin(t*0.006)>0)?'#ff5a5a':'#6a2626';c.beginPath();c.arc(px+w/2,byTop-9,1.4,0,7);c.fill();
 }
}
function drawPark(c,b){
 const px=b.x*TILE,py=b.y*TILE,w=b.w*TILE,h=b.h*TILE, gr=U.mulberry32((b.id*2654435761)>>>0);
 c.fillStyle='#3f6a3a';c.fillRect(px,py,w,h);
 c.fillStyle='#4c7a44';for(let k=0;k<16;k++)c.fillRect(px+2+gr()*(w-4),py+2+gr()*(h-4),2,2);
 c.fillStyle='rgba(150,140,110,0.45)';c.fillRect(px+w/2-2,py+2,4,h-4);
 for(let k=0;k<3;k++){const tx=px+5+gr()*(w-10),ty=py+5+gr()*(h-10);
  c.fillStyle='#5a3f2a';c.fillRect(tx-1,ty-1,2,4);
  c.fillStyle=k%2?'#4a8a4a':'#5a9a54';c.beginPath();c.arc(tx,ty-3,3.6,0,7);c.fill();}
}
function drawBuilding(c,b,nf){
 const px=b.x*TILE,py=b.y*TILE,w=b.w*TILE,h=b.h*TILE;
 if(b.tp==='grave'){
  // the stone leans, mosses and sinks as its blooms take hold, until the ground
  // reclaims it entirely (see bloomGrave / upkeepTick).
  const age=clamp((simMin-(b.born||simMin))/GRAVE_LIFE,0,1);
  const sink=age*5, lean=(age-0.2)*3.2;                 // tilts and settles into the earth
  c.save();c.translate(px+8,py+13);c.rotate(clamp(lean,0,3.2)*0.09);c.translate(-(px+8),-(py+13));
  const top=py+6+sink;
  c.fillStyle=lerpHex('#6f7285','#586a54',age);         // greys, then greens with moss
  c.beginPath();c.moveTo(px+4,py+13);c.lineTo(px+4,top);c.arc(px+8,top,4,Math.PI,0);c.lineTo(px+12,py+13);c.closePath();c.fill();
  c.fillStyle=lerpHex('#4a5c48','#3a5a34',age);c.fillRect(px+3,py+12,10,2);
  if(age>0.35){c.fillStyle='rgba(74,112,60,'+(0.3+age*0.5)+')';c.fillRect(px+4,py+11,9,2)} // moss creeps up
  c.restore();
  // flowers gather at the foot and multiply as the grave gives way
  const nb=Math.round(age*4);
  const gr=U.mulberry32(((b.id*2654435761)>>>0)||1);
  const BC=['#e8e8f0','#e6c14a','#d76a9a','#b48ad6','#7fc7e6'];
  for(let f=0;f<nb;f++){const fx=px+3+gr()*10, fy=py+9+gr()*5;
   c.fillStyle=BC[(gr()*BC.length)|0];c.beginPath();c.arc(fx,fy,1.4,0,7);c.fill();
   c.fillStyle='#3a5a34';c.fillRect(fx-0.5,fy,1,2);}
  return;
 }
 if(b.ruined)return;
 if(!b.done){
  c.strokeStyle='rgba(232,192,101,0.7)';c.setLineDash([4,3]);
  c.strokeRect(px+1,py+1,w-2,h-2);c.setLineDash([]);
  c.fillStyle='#7a6248';c.fillRect(px+3,py+h-6,6,4);c.fillRect(px+w-9,py+4,5,4);
  c.fillStyle='#241f33';c.fillRect(px+2,py-5,w-4,3);
  c.fillStyle='#e8c065';c.fillRect(px+2,py-5,(w-4)*Math.min(1,b.prog/b.need),3);
  return;
 }
 if(b.tp==='park'){drawPark(c,b);return}
 if(['apartment','warehouse','venue','factory','highrise'].includes(b.tp)){drawTallBuilding(c,b);return}
 c.fillStyle='#1b1626';c.fillRect(px+w/2-2,py+h-4,4,4);
 if(b.tp==='biz'){
  // neon storefront sign
  const go=c.globalCompositeOperation;c.globalCompositeOperation='screen';
  c.drawImage(GLOW_PINK,px+w-14,py-18,18,18);c.globalCompositeOperation=go;
  c.fillStyle='#3d3554';c.fillRect(px+w-6,py-8,2,8);
  c.font='8px system-ui';c.textAlign='center';
  c.fillText(b.sub[1],px+w-5,py-9);
 }
}
function drawCamp(c,camp,t){
 const px=camp.x,py=camp.y;
 const n=campMembers(camp).length;
 // a bonfire ringed by crude totems — flares brighter when the camp stirs
 const flick=0.6+0.4*Math.sin(t*0.012+camp.id)+(camp.flare>0?0.5:0);
 const go=c.globalCompositeOperation;c.globalCompositeOperation='screen';
 c.drawImage(GLOW_RED,px-16-camp.flare,py-16-camp.flare,32+camp.flare*2,32+camp.flare*2);
 c.globalCompositeOperation=go;
 // fire
 c.fillStyle='rgba(0,0,0,0.35)';c.beginPath();c.ellipse(px,py+3,9,3.5,0,0,7);c.fill();
 c.fillStyle='rgba(230,90,50,'+(0.55+flick*0.35)+')';
 c.beginPath();c.moveTo(px,py-9-flick*3);c.lineTo(px-4,py+1);c.lineTo(px+4,py+1);c.closePath();c.fill();
 c.fillStyle='rgba(255,200,90,'+(0.5+flick*0.3)+')';
 c.beginPath();c.moveTo(px,py-4-flick*2);c.lineTo(px-2,py+1);c.lineTo(px+2,py+1);c.closePath();c.fill();
 // totem stakes leaning around the fire
 c.strokeStyle='#3a2b33';c.lineWidth=1.4;
 for(let k=0;k<3;k++){const a=camp.id*1.7+k*2.09;const sx=px+Math.cos(a)*10,sy=py+2+Math.sin(a)*4;
  c.beginPath();c.moveTo(sx,sy);c.lineTo(sx+Math.cos(a)*2,sy-7);c.stroke();}
 if(cam.z>1.0){c.font='7px system-ui';c.textAlign='center';c.fillStyle='rgba(240,150,120,0.9)';c.fillText('☠ '+camp.name+(n>1?' ('+n+')':''),px,py-14);}
}
function drawMonster(c,m,t){
 const px=m.x,py=m.y;
 const go=c.globalCompositeOperation;c.globalCompositeOperation='screen';
 c.drawImage(GLOW_RED,px-18,py-18,36,36);c.globalCompositeOperation=go;
 const spr=surfMon[m.type];
 if(spr){
  c.fillStyle='rgba(0,0,0,0.4)';c.beginPath();c.ellipse(px,py+2,8,3,0,0,7);c.fill();
  const anim=(m.atkAnim>0&&spr.FRAMES.attack)?'attack':'walk';
  CFHelp.drawCreatureSprite(c,spr,px,py+4,m.dirIdx||0,anim,m.animClock);
 }else{
  c.save();c.translate(px,py);
  c.fillStyle='rgba(0,0,0,0.4)';c.beginPath();c.ellipse(0,2,7,3,0,0,7);c.fill();
  c.scale(m.fx<0?-1:1,1);
  c.fillStyle=m.col;
  c.beginPath();c.ellipse(0,-4,8,6,0,0,7);c.fill();
  c.fillStyle='#ffe14a';c.fillRect(-3,-6,2,2);c.fillRect(1,-6,2,2);
  c.restore();
 }
 if(m.hp<m.maxhp){
  c.fillStyle='#1b1626';c.fillRect(px-8,py-19,16,2);
  c.fillStyle='#d24a5a';c.fillRect(px-8,py-19,16*clamp(m.hp/m.maxhp,0,1),2);
 }
 if(m.em&&m.em.until>performance.now()){c.font='9px system-ui';c.textAlign='center';c.fillText(m.em.g,px,py-21)}
}
function drawSprite(c,p,t){
 // fallback painted sprite, used until the Creature Forge bake lands
 const s=stageScale(p);
 const bob=p.moving?Math.sin(t*0.02+p.id)*1.2:0;
 c.save();
 c.fillStyle='rgba(0,0,0,0.35)';
 c.beginPath();c.ellipse(0,1,5*s,2*s,0,0,7);c.fill();
 c.translate(0,bob);c.scale(s*(p.fx<0?-1:1),s);
 c.fillStyle=p.age>=56?desat(p.col):p.col;
 rr(c,-4,-10,8,10,3);c.fill();
 c.fillStyle='rgba(0,0,0,0.2)';rr(c,-4,-4,8,4,2);c.fill();
 c.fillStyle=p.skin;
 c.beginPath();c.arc(0.5,-12.5,3.6,0,7);c.fill();
 c.fillStyle=p.age>=56?desat(p.col):p.col;
 c.beginPath();c.arc(0,-13,3.9,Math.PI*0.85,Math.PI*2.15);c.fill();
 c.fillStyle='#1b1626';
 if(p.sleeping){c.fillRect(1,-12,2,1)}
 else{c.fillRect(1,-13,1.4,1.6);c.fillRect(3,-13,1.4,1.6)}
 if(p.age>=56){c.fillStyle='#cfc6b8';c.fillRect(-1,-10.5,4,1.4)}
 c.restore();
}
function drawPersonSprite(c,p,t){
 if(p.sprite){
  const s=stageScale(p);
  c.fillStyle='rgba(0,0,0,0.32)';
  c.beginPath();c.ellipse(0,1,6*s,2.4*s,0,0,7);c.fill();
  const working=p.working&&p.sprite.FRAMES.work;
  const chatting=!working&&p.chatHold>simMin&&p.sprite.FRAMES.talk;
  const anim=working?'work':chatting?'talk':'walk';
  const clock=p.moving||chatting||working?p.animClock:0;
  CFHelp.drawCreatureSprite(c,p.sprite,0,3,p.dirIdx||0,anim,clock,s);
 }else drawSprite(c,p,t);
}
function desat(hex){
 const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
 const m=(r+g+b)/3;
 return 'rgb('+((r+m*1.4)/2.4|0)+','+((g+m*1.4)/2.4|0)+','+((b+m*1.4)/2.4|0)+')';
}
function rr(c,x,y,w,h,r){
 c.beginPath();
 c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();
}
function nightFactor(){
 const t=tod();
 if(t<0.20)return 1;
 if(t<0.30)return 1-(t-0.20)/0.10;
 if(t<0.80)return 0;
 if(t<0.90)return (t-0.80)/0.10;
 return 1;
}

/* ================= living sky & ambient particles ================= */
// a screen-space wash + drifting motes give each season and each hour its own
// light: petals & pollen on warm days, leaves in the turn, snow in the lean, and
// fireflies waking with the dark. Cosmetic only (Math.random, never the world rng).
let ambient=[], ambT=0;
const arand=(a,b)=>a+Math.random()*(b-a);
function spawnMote(sn){
 const p={kind:'mote',ph:Math.random()*6,seed:Math.random()*6,life:1};
 p.x=Math.random()*cw; p.y=-8-Math.random()*ch*0.35;
 if(sn.mote==='pollen'){p.vx=arand(0.05,0.35);p.vy=arand(0.10,0.28);p.sway=0.5;p.r=1.1;p.col='rgba(240,222,120,0.7)';}
 else if(sn.mote==='snow'){p.vx=arand(-0.1,0.25);p.vy=arand(0.45,0.95);p.sway=0.8;p.r=arand(1.1,1.9);p.col='rgba(240,246,255,0.9)';}
 else if(sn.mote==='leaf'){p.vx=arand(0.2,0.8);p.vy=arand(0.5,1.0);p.sway=1.1;p.r=arand(1.8,2.6);p.col=Math.random()<0.5?'rgba(212,120,48,0.82)':'rgba(198,150,58,0.82)';p.leaf=1;}
 else{p.vx=arand(0.1,0.5);p.vy=arand(0.35,0.7);p.sway=0.9;p.r=arand(1.4,2.1);p.col='rgba(255,190,212,0.78)';}
 return p;
}
function spawnFire(){
 return {kind:'fire',x:Math.random()*cw,y:ch*0.35+Math.random()*ch*0.6,vx:0,vy:0,
  ph:Math.random()*6,seed:Math.random()*6,r:arand(1.0,1.7),life:1};
}
function skyAndAmbient(t){
 if(interior)return;
 const sn=seasonNow(), nf=nightFactor();
 const dt=Math.min(0.05,(t-ambT)/1000)||0.016; ambT=t;
 ctx.setTransform(dpr,0,0,dpr,0,0);
 // seasonal colour wash tints the whole scene toward the season's light
 if(sn.washA>0){
  ctx.globalCompositeOperation='soft-light';
  ctx.fillStyle='rgba('+sn.wash[0]+','+sn.wash[1]+','+sn.wash[2]+','+sn.washA.toFixed(3)+')';
  ctx.fillRect(0,0,cw,ch);
  ctx.globalCompositeOperation='source-over';
 }
 // aurora event: cold ribbons across the night sky
 if(eventActive('aurora')){
  const nf2=nightFactor();
  if(nf2>0.05){
   ctx.globalCompositeOperation='screen';
   for(let r=0;r<3;r++){
    const yy=ch*(0.10+r*0.10)+Math.sin(t*0.0004+r)*12;
    const g=ctx.createLinearGradient(0,yy-40,0,yy+40);
    const col=r===1?'80,240,160':(r===2?'120,160,255':'160,240,120');
    g.addColorStop(0,'rgba('+col+',0)');g.addColorStop(0.5,'rgba('+col+','+(0.10*nf2).toFixed(3)+')');g.addColorStop(1,'rgba('+col+',0)');
    ctx.fillStyle=g;
    ctx.save();ctx.translate(0,Math.sin(t*0.0006+r*2)*10);ctx.fillRect(0,yy-40,cw,80);ctx.restore();
   }
   ctx.globalCompositeOperation='source-over';
  }
 }
 // a warm band low on the sky at dawn and dusk
 const td=tod(); let dA=0,dC='255,150,90';
 if(td>0.74&&td<0.90){dA=(1-Math.abs(td-0.82)/0.08)*0.16;dC='255,116,66';}
 else if(td>0.22&&td<0.34){dA=(1-Math.abs(td-0.28)/0.06)*0.11;dC='255,204,150';}
 if(dA>0.003){
  const g=ctx.createLinearGradient(0,0,0,ch);
  g.addColorStop(0,'rgba('+dC+','+dA.toFixed(3)+')');g.addColorStop(0.62,'rgba('+dC+',0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,cw,ch);
 }
 // particle budgets: motes always drift; fireflies only wake in the dark
 const moteN=sn.mote==='snow'?46:sn.mote==='leaf'?26:20;
 const fireN=Math.round(nf*26);
 let motes=0,fires=0; for(const p of ambient){if(p.kind==='fire')fires++;else motes++;}
 const slow=speedIdx>=2?0.2:1;    // barely stir while the Sage meditates
 while(motes<moteN){ambient.push(spawnMote(sn));motes++;}
 while(fires<fireN){ambient.push(spawnFire());fires++;}
 for(let i=ambient.length-1;i>=0;i--){
  const p=ambient[i]; p.ph+=dt;
  if(p.kind==='fire'){
   p.x+=Math.sin(p.ph*1.6+p.seed)*0.4*slow; p.y+=Math.cos(p.ph*1.2+p.seed)*0.3*slow;
   const a=(0.35+0.55*Math.abs(Math.sin(p.ph*1.7+p.seed)))*Math.min(1,nf*1.5);
   ctx.fillStyle='rgba(196,240,120,'+a.toFixed(3)+')';
   ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill();
   ctx.fillStyle='rgba(230,255,170,'+(a*0.5).toFixed(3)+')';
   ctx.beginPath();ctx.arc(p.x,p.y,p.r*0.5,0,7);ctx.fill();
   if(nf<0.18)p.life-=dt*1.5;
   if(p.life<=0||fires>fireN+4){ambient.splice(i,1);continue;}
  }else{
   p.x+=(p.vx*60*dt+Math.sin(p.ph*1.2+p.seed)*p.sway)*slow;
   p.y+=p.vy*60*dt*slow;
   ctx.fillStyle=p.col;
   if(p.leaf){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.ph*1.3);ctx.fillRect(-p.r,-p.r*0.6,p.r*2,p.r*1.2);ctx.restore();}
   else{ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill();}
   if(p.y>ch+12||p.x<-14||p.x>cw+14){ambient.splice(i,1);continue;}
  }
 }
 // event flash (a bright bloom when stars fall / an event breaks)
 if(eventFlash>0.01){ ctx.fillStyle='rgba(255,240,210,'+(eventFlash*0.5).toFixed(3)+')'; ctx.fillRect(0,0,cw,ch); }
 // a slim banner at the top while a world event runs
 if(worldEvent){
  const label=worldEvent.glyph+'  '+worldEvent.name;
  ctx.font='bold 13px Georgia'; ctx.textAlign='center'; ctx.textBaseline='middle';
  const w=ctx.measureText(label).width+30, bx=cw/2-w/2, by=Math.round(ch*0.085);
  const pulse=0.5+0.5*Math.sin(t*0.004);
  ctx.fillStyle=worldEvent.ban+(0.16+pulse*0.10).toFixed(3)+')';
  rr(ctx,bx,by,w,24,12);ctx.fill();
  ctx.fillStyle=worldEvent.ban+'0.9)';ctx.fillText(label,cw/2,by+13);
  ctx.textBaseline='alphabetic';
 }
}

/* ================= main draw ================= */
function draw(t){
 if(interior){drawInterior(t);return}
 const z=cam.z;
 if(cine&&selected&&!selected.dead){cam.x+=(selected.x-cam.x)*0.08;cam.y+=(selected.y-cam.y)*0.08}
 else if(follow&&selected&&!selected.dead){cam.x+=(selected.x-cam.x)*0.08;cam.y+=(selected.y-cam.y)*0.08}
 else{cam.x+=(hero.x-cam.x)*0.12;cam.y+=(hero.y-cam.y)*0.12}
 cam.x=clamp(cam.x,Math.min(cw/(2*z),W*TILE/2),Math.max(W*TILE-cw/(2*z),W*TILE/2));
 cam.y=clamp(cam.y,Math.min(ch/(2*z),H*TILE/2),Math.max(H*TILE-ch/(2*z),H*TILE/2));
 // only clear the letterbox when the viewport actually spills past the world
 // edges (zoomed out) — otherwise the ground fully covers it, so skip the fill
 const halfW=cw/(2*z),halfH=ch/(2*z);
 if(cam.x-halfW<0||cam.x+halfW>W*TILE||cam.y-halfH<0||cam.y+halfH>H*TILE){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#131f12';ctx.fillRect(0,0,cw,ch);
 }
 ctx.setTransform(z*dpr,0,0,z*dpr,dpr*(cw/2-cam.x*z),dpr*(ch/2-cam.y*z));
 ctx.imageSmoothingEnabled=false;
 const vx0=Math.max(0,((cam.x-halfW)/TILE|0)-3),vx1=Math.min(W-1,((cam.x+halfW)/TILE|0)+3);
 const vy0=Math.max(0,((cam.y-halfH)/TILE|0)-3),vy1=Math.min(H-1,((cam.y+halfH)/TILE|0)+3);
 // blit only the on-screen slab of the ground / structure overlay
 const bsx=vx0*TILE,bsy=vy0*TILE,bsw=(vx1-vx0+1)*TILE,bsh=(vy1-vy0+1)*TILE;
 if(tcv)ctx.drawImage(tcv,bsx,bsy,bsw,bsh,bsx,bsy,bsw,bsh);
 if(terrainDirty){paintDyn();terrainDirty=false}
 if(dynCanvas)ctx.drawImage(dynCanvas,bsx,bsy,bsw,bsh,bsx,bsy,bsw,bsh);
 // ---- blocked terrain (bramble-rock), drawn LIVE from the current map ----
 // era-composited like the ground, so it blooms with the age; because it reads
 // the map every frame, a tile an NPC clears reveals the soil beneath instantly.
 if(rockTiles){
  if(silDirty&&performance.now()-lastSil>SIL_THROTTLE)computeSilhouette();
  // per-frame interior fill palette: layer-0 rock blended toward the urban layers by
  // the age's tide, bucketed (7 steps) so the smooth field still batches into runs
  const fillW=[],fillH=[];
  if(rockRGB){ for(let bk=0;bk<=6;bk++){ const uu=bk/6, a1=clamp(uu*2,0,1), a2=clamp((uu-0.5)*2,0,1);
   let r=rockRGB[0][0]+(rockRGB[1][0]-rockRGB[0][0])*a1, g=rockRGB[0][1]+(rockRGB[1][1]-rockRGB[0][1])*a1, b2=rockRGB[0][2]+(rockRGB[1][2]-rockRGB[0][2])*a1;
   r+= (rockRGB[2][0]-r)*a2; g+=(rockRGB[2][1]-g)*a2; b2+=(rockRGB[2][2]-b2)*a2;
   fillW[bk]='rgb('+(r|0)+','+(g|0)+','+(b2|0)+')'; fillH[bk]='rgb('+((r*0.55)|0)+','+((g*0.55)|0)+','+((b2*0.55)|0)+')';
  } }
  // Only the deep, same-tier interior (corner index 15, no neighbouring tier change)
  // is filled as batched horizontal rects; every EDGE — blob rim AND the seam where
  // a hard black core meets its weak grey ring — gets the per-tile autotile detail.
  // A small outward bleed (interior tiles never touch open ground) overlaps the rects
  // so the terrain reads as one solid surface with no sub-pixel grid lines.
  const B=clamp(1/z,0.4,2);
  for(let y=vy0;y<=vy1;y++){
   let runX=-1, runTier=-1, runBk=-1;
   const flushRun=(endX)=>{ if(runX<0)return; ctx.fillStyle=(runTier===2?fillH:fillW)[runBk]||(runTier===2?'#2f2f36':'#5a5a62'); ctx.fillRect(runX*TILE-B,y*TILE-B,(endX-runX)*TILE+2*B,TILE+2*B); runX=-1; };
   for(let x=vx0;x<=vx1;x++){
    const i=idx(x,y);
    if(map[i]===0||struct[i]!==S_ROCK){ flushRun(x); continue; }
    const ci=solidCornerIdx[i];
    const dm=rockDmg&&rockDmg[i];
    const u=urbanAt(i);
    const tier=terTier?terTier[i]:1;
    // uniform-tier deep interior only: a tier boundary keeps its detailed edge
    const uniform = !terTier || (x>0&&x<W-1&&y>0&&y<H-1 && terTier[i-1]===tier && terTier[i+1]===tier && terTier[i-W]===tier && terTier[i+W]===tier);
    if(ci===15 && !dm && uniform){
     const bk=clamp((u*6+0.5)|0,0,6);
     if(runX>=0 && (runTier!==tier||runBk!==bk))flushRun(x);
     if(runX<0){runX=x;runTier=tier;runBk=bk;}
     continue;
    }
    flushRun(x);
    // ---- detailed edge (rim / tier seam / damaged / urbanising) tile ----
    const vi=(x*7+y*13)%ROCK_VARIANTS, px=x*TILE,py=y*TILE, iso=ci===0;
    const W2=TILE+2*B;
    const tile0=iso?rockNub[0][vi]:rockTiles[0][ci][vi];
    ctx.drawImage(tile0,px-B,py-B,W2,W2);
    const a1=clamp(u*2,0,1), a2=clamp((u-0.5)*2,0,1);
    if(a1>0&&rockTiles[1]){ctx.globalAlpha=a1;ctx.drawImage(iso?rockNub[1][vi]:rockTiles[1][ci][vi],px-B,py-B,W2,W2);}
    if(a2>0&&rockTiles[2]){ctx.globalAlpha=a2;ctx.drawImage(iso?rockNub[2][vi]:rockTiles[2][ci][vi],px-B,py-B,W2,W2);}
    ctx.globalAlpha=1;
    // hard highland reads darker & denser than the weak upland (shape-correct multiply)
    if(tier===2){const pop=ctx.globalCompositeOperation;ctx.globalCompositeOperation='multiply';ctx.globalAlpha=0.55;ctx.drawImage(tile0,px-B,py-B,W2,W2);ctx.globalAlpha=1;ctx.globalCompositeOperation=pop;}
    // mining cracks: a subtle fissure that deepens toward shattering, clipped to the
    // rock's own shape (via a scratch tile) so it never hangs over the edge
    if(dm>0){
     const frac=clamp(dm/hardnessAt(x,y),0,1);
     if(!crackCv){crackCv=document.createElement('canvas');crackCv.width=crackCv.height=TILE;crackCtx=crackCv.getContext('2d');}
     const cc=crackCtx, g2=U.mulberry32(i*2654435761>>>0), nc=1+((frac*2.2)|0);
     cc.clearRect(0,0,TILE,TILE);
     cc.strokeStyle='rgba(20,16,22,'+(0.22+frac*0.33)+')'; cc.lineWidth=1;
     cc.beginPath();
     for(let cN=0;cN<nc;cN++){ let ax=5+g2()*6, ay=5+g2()*6; cc.moveTo(ax,ay);
      const segs=1+((frac*2)|0); for(let sN=0;sN<segs;sN++){ax=clamp(ax+g2()*6-3,2,14);ay=clamp(ay+g2()*6-3,2,14);cc.lineTo(ax,ay);}}
     cc.stroke();
     cc.globalCompositeOperation='destination-in'; cc.drawImage(tile0,0,0);   // keep cracks only on rock
     cc.globalCompositeOperation='source-over';
     ctx.drawImage(crackCv,px,py);
    }
   }
   flushRun(vx1+1);
  }
 }
 // ---- water: calm, pre-baked ripple tiles in the world's own palette ----
 if(WATER_ON&&water&&waterAnim){
  const fi=((t/WATER_FRAME_MS)|0)%WATER_FRAMES;
  for(let y=vy0;y<=vy1;y++)for(let x=vx0;x<=vx1;x++){
   const i=idx(x,y), w=water[i], wm=waterMax?waterMax[i]:w;
   const px=x*TILE,py=y*TILE;
   if(w){
    const vi=(x*7+y*13)%WATER_VARIANTS;
    const frames=(w===2?waterAnim.lake:waterAnim.stream)[vi];
    if(w===2){ ctx.drawImage(frames[fi],px,py); }
    else { ctx.globalAlpha=0.62; ctx.drawImage(frames[fi],px,py); ctx.globalAlpha=1; }
   } else if(wm===2){
    // a lakebed the water has retreated from — cracked, silty mud
    ctx.globalAlpha=0.5;ctx.fillStyle='#4a3d2c';ctx.fillRect(px,py,TILE,TILE);
    ctx.globalAlpha=0.18;ctx.fillStyle='#2a2018';ctx.fillRect(px,py+((x+y)&3)+5,TILE,1);ctx.globalAlpha=1;
   }
  }
  // wet sheen where rain has fallen (a fading cool glaze)
  if(wetUntil){
   for(let y=vy0;y<=vy1;y++)for(let x=vx0;x<=vx1;x++){
    const i=idx(x,y); if(water[i])continue; const wet=wetAt(i); if(wet<=0.01)continue;
    ctx.globalAlpha=wet*0.26;ctx.fillStyle='#22304a';ctx.fillRect(x*TILE,y*TILE,TILE,TILE);ctx.globalAlpha=1;
   }
  }
 }
 // cloud shadows drift across the ground (drawn under everything that follows)
 if(WATER_ON&&clouds.length){
  for(const c of clouds){
   const sx=c.x+8, sy=c.y+10, r=(9+c.mass*7)*TILE;
   if(sx<vx0*TILE-r||sx>vx1*TILE+r||sy<vy0*TILE-r||sy>vy1*TILE+r)continue;
   ctx.globalAlpha=0.06+c.mass*0.10;ctx.fillStyle='#0a1420';
   ctx.beginPath();ctx.ellipse(sx,sy,r,r*0.62,0,0,7);ctx.fill();ctx.globalAlpha=1;
  }
 }
 const nf=nightFactor();
 // ground clutter: living meadow undergrowth that withers (and thins) locally as
 // the waste blooms over it, greens back as nature returns. It's sub-tile detail,
 // so skip it entirely when zoomed out — invisible there, and it's the heaviest
 // per-frame draw loop.
 if(decorList&&flora&&z>0.7){
  for(const d of decorList){
   if(d.x<vx0||d.x>vx1||d.y<vy0||d.y>vy1)continue;
   const u=urbanAt(d.i), g=clamp((1-u)*1.25,0,1);
   const dcL=flora.decor[d.vi],dcD=floraDead.decor[d.vi];
   const bx=d.x*TILE+TILE/2, by=d.y*TILE+TILE;
   if(g>0.02){ctx.globalAlpha=g;ctx.drawImage(dcL,bx-dcL.width/2,by-dcL.height+1)}
   if(g<0.98){ctx.globalAlpha=(1-g)*(1-0.55*clamp((u-0.75)/0.25,0,1));ctx.drawImage(dcD,bx-dcD.width/2,by-dcD.height+1)}
   ctx.globalAlpha=1;
  }
 }
 // flowers left where graves gave way — a growing wild patch on the freed tile
 if(graveBlooms.length&&z>0.7){
  const BC=['#e8e8f0','#e6c14a','#d76a9a','#b48ad6','#7fc7e6','#f0a0c0'];
  for(const gb of graveBlooms){
   if(gb.x<vx0||gb.x>vx1||gb.y<vy0||gb.y>vy1)continue;
   const age=simMin-gb.born;
   const fade=clamp((GRAVE_BLOOM_LIFE-age)/GRAVE_BLOOM_FADE,0,1);   // wilts back to grass at the end
   if(fade<=0)continue;
   const grow=clamp(age/GRAVE_BLOOM_GROW,0,1), sc=(0.4+grow*0.6)*(0.55+fade*0.45);
   const gr=U.mulberry32(gb.seed||1), cx=gb.x*TILE+TILE/2, cy=gb.y*TILE+TILE-2;
   const n=5+((gr()*4)|0);
   ctx.globalAlpha=fade;
   for(let f=0;f<n;f++){
    const fx=cx+(gr()*2-1)*6, fy=cy+(gr()*2-1)*4, h=(2.5+gr()*3)*sc;
    ctx.strokeStyle='#3f6a38';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(fx,fy);ctx.lineTo(fx,fy-h);ctx.stroke();
    ctx.fillStyle=BC[(gr()*BC.length)|0];ctx.beginPath();ctx.arc(fx,fy-h,1.5*sc+0.4,0,7);ctx.fill();
   }
   ctx.globalAlpha=1;
  }
 }
 for(const n of nodes){
  if(n.x<vx0||n.x>vx1||n.y<vy0||n.y>vy1)continue;
  drawNode(ctx,n,t);
 }
 const vis=[];
 for(const b of buildings){
  if(b.gone)continue;
  if(b.x+b.w<vx0||b.x>vx1||b.y+b.h<vy0||b.y>vy1)continue;
  vis.push(b);
 }
 vis.sort((a,b)=>(a.y+a.h)-(b.y+b.h));
 for(const b of vis)drawBuilding(ctx,b,nf);
 for(const d of dungeons){
  if(d.x<vx0||d.x>vx1||d.y<vy0||d.y>vy1)continue;
  drawDungeon(ctx,d,t);
 }
 for(const v of villages){
  const vx=v.cx*TILE,vy=v.cy*TILE;
  if(v.cx<vx0||v.cx>vx1||v.cy<vy0||v.cy>vy1)continue;
  // a holographic beacon: mast + flickering neon flag
  ctx.fillStyle='#243a5a';ctx.fillRect(vx-1,vy-19,2,15);
  const fl=0.55+0.45*Math.sin(t*0.008+v.id);
  const go=ctx.globalCompositeOperation;ctx.globalCompositeOperation='screen';
  ctx.drawImage(GLOW_CYAN,vx-10,vy-28,20,20);ctx.globalCompositeOperation=go;
  ctx.fillStyle='rgba(80,220,255,'+(0.5+fl*0.4)+')';
  ctx.beginPath();ctx.moveTo(vx+1,vy-19);ctx.lineTo(vx+11,vy-16);ctx.lineTo(vx+1,vy-13);ctx.closePath();ctx.fill();
  if(z>1.1){ctx.font='7px system-ui';ctx.textAlign='center';ctx.fillStyle='rgba(150,235,255,0.9)';ctx.fillText(v.name,vx,vy-21)}
  // festival: a warm plaza glow, strung bobbing lanterns, and rising music
  if(v.festival){
   const go2=ctx.globalCompositeOperation;ctx.globalCompositeOperation='screen';
   ctx.globalAlpha=0.6+0.25*Math.sin(t*0.005);
   ctx.drawImage(GLOW_WARM,vx-34,vy-30,68,68);
   ctx.globalAlpha=1;ctx.globalCompositeOperation=go2;
   for(let li=0;li<6;li++){
    const a=li/6*6.283, lx=vx+Math.cos(a+t*0.0004)*20, ly=vy-14+Math.sin(a*2+t*0.002)*3;
    const cols=['#ff8a5a','#ffd24a','#7de0ff','#ff6ac0','#9ae86a','#ffa0d0'];
    ctx.fillStyle=cols[li%cols.length];ctx.beginPath();ctx.arc(lx,ly,1.8,0,7);ctx.fill();
   }
   if(z>0.9){ctx.font='9px system-ui';ctx.textAlign='center';
    ctx.fillText(['🎵','🎶','✨'][((t*0.002+v.id)|0)%3],vx+Math.sin(t*0.003+v.id)*8,vy-24-((t*0.02)%12));}
  }
 }
 // salvage caches
 for(const sv of salvage){
  if(sv.x/TILE<vx0-1||sv.x/TILE>vx1+1||sv.y/TILE<vy0-1||sv.y/TILE>vy1+1)continue;
  drawSalvage(ctx,sv,t);
 }
 for(const camp of camps){
  if(camp.tx<vx0-2||camp.tx>vx1+2||camp.ty<vy0-2||camp.ty>vy1+2)continue;
  drawCamp(ctx,camp,t);
 }
 // quest beacons: a golden mote over the place a dream needs the Sage to reach
 for(const q of quests){
  if(!q.mark||(q.kind!=='waypoint'&&q.kind!=='courier'))continue;
  const qx=q.mark[0]*TILE+TILE/2,qy=q.mark[1]*TILE+TILE/2;
  const pulse=0.6+0.4*Math.sin(t*0.006+q.id);
  const go=ctx.globalCompositeOperation;ctx.globalCompositeOperation='screen';
  ctx.drawImage(GLOW_WARM,qx-14,qy-24-pulse*4,28,28);ctx.globalCompositeOperation=go;
  ctx.fillStyle='rgba(240,205,110,'+(0.7+pulse*0.3)+')';
  ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText('✦',qx,qy-14-pulse*4);
 }
 for(const m of monsters){
  if(m.x/TILE<vx0-2||m.x/TILE>vx1+2||m.y/TILE<vy0-2||m.y/TILE>vy1+2)continue;
  drawMonster(ctx,m,t);
 }
 // slash arcs beneath bodies
 for(const s of heroSlashes){
  const prog=Math.min(s.t/0.14,1);
  const fade=1-Math.min(s.t/0.25,1);
  const a0=s.ang-s.arc/2,a1=a0+s.arc*prog;
  ctx.save();ctx.translate(hero.x,hero.y);
  ctx.globalAlpha=fade;
  const grad=ctx.createRadialGradient(0,0,s.range*0.3,0,0,s.range);
  grad.addColorStop(0,'rgba(255,255,255,0)');
  grad.addColorStop(0.7,'rgba(255,209,102,0.55)');
  grad.addColorStop(1,'rgba(255,120,80,0.9)');
  ctx.fillStyle=grad;
  ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,s.range,a0,a1);ctx.closePath();ctx.fill();
  ctx.restore();ctx.globalAlpha=1;
 }
 // people + the Sage, painter-sorted together
 const ppl=people.filter(p=>!p.inDungeon);
 const drawables=ppl.map(p=>({y:p.y,f:()=>{
  ctx.save();ctx.translate(p.x,p.y);
  if(p===selected){
   ctx.strokeStyle='rgba(232,192,101,'+(0.6+Math.sin(t*0.006)*0.3)+')';
   ctx.lineWidth=1.5;
   ctx.beginPath();ctx.ellipse(0,1,8,4,0,0,7);ctx.stroke();
  }
  drawPersonSprite(ctx,p,t);
  if(p.hp<92){ctx.fillStyle='#1b1626';ctx.fillRect(-7,-19,14,2);ctx.fillStyle=p.hp<35?'#d24a5a':'#6fa04f';ctx.fillRect(-7,-19,14*clamp(p.hp/100,0,1),2)}
  ctx.font='7px system-ui';ctx.textAlign='center';
  if(p.task&&p.task.k==='fight')ctx.fillText('⚔',0,-16);
  else if(p.fleeUntil>simMin)ctx.fillText('💨',0,-16);
  else if(p.sleeping)ctx.fillText('💤',5,-16);
  else if(p.em&&p.em.until>performance.now())ctx.fillText(p.em.g,0,-18);
  else if(p.courting&&t%1400<700)ctx.fillText('❤',0,-18);
  ctx.restore();
 }}));
 for(const c of carrion){
  if(c.x/TILE<vx0-1||c.x/TILE>vx1+1||c.y/TILE<vy0-1||c.y/TILE>vy1+1)continue;
  drawables.push({y:c.y-2,f:()=>drawCarrion(ctx,c,t)});
 }
 for(const sh of shrines){
  if(sh.x/TILE<vx0-1||sh.x/TILE>vx1+1||sh.y/TILE<vy0-1||sh.y/TILE>vy1+1)continue;
  drawables.push({y:sh.y,f:()=>drawShrine(ctx,sh,t)});
 }
 if(merchant){
  const m=merchant;
  if(!(m.x/TILE<vx0-2||m.x/TILE>vx1+2||m.y/TILE<vy0-2||m.y/TILE>vy1+2))
   drawables.push({y:m.y,f:()=>drawMerchant(ctx,m,t)});
 }
 for(const a of animals){
  if(a.x/TILE<vx0-2||a.x/TILE>vx1+2||a.y/TILE<vy0-2||a.y/TILE>vy1+2)continue;
  drawables.push({y:a.y,f:()=>drawAnimal(ctx,a,t)});
 }
 if(!hero.down)drawables.push({y:hero.y,f:()=>drawHero(t)});
 drawables.sort((a,b)=>a.y-b.y);
 for(const d of drawables)d.f();
 // flyers ride above everything (with a ground shadow), sorted among themselves
 const airborne=[];
 for(const fl of flyers){
  if(fl.x/TILE<vx0-3||fl.x/TILE>vx1+3||fl.y/TILE<vy0-3||fl.y/TILE>vy1+3)continue;
  airborne.push(fl);
 }
 airborne.sort((a,b)=>a.y-b.y);
 for(const fl of airborne)drawFlyer(ctx,fl,t);
 if(particles.length)drawParticles(ctx);   // mining debris & sparks, above the ground
 // ---- rain, then clouds overhead ----
 if(WATER_ON&&clouds.length){
  let storm=0;
  for(const c of clouds){
   // rain streaks fall from the cloud's footprint down onto the ground
   if(c.rain>0.05){
    const cx=c.x,cy=c.y,R0=4*TILE;
    if(!(cx<vx0*TILE-R0||cx>vx1*TILE+R0||cy<vy0*TILE-R0||cy>vy1*TILE+R0)){
     storm+=c.rain*c.mass;
     ctx.strokeStyle='rgba(150,190,225,'+(0.22*c.rain)+')';ctx.lineWidth=1;
     const drops=(28*c.rain)|0, ph=t*0.6;
     ctx.beginPath();
     for(let d=0;d<drops;d++){
      const a=(c.seed+d*2654435761)>>>0, rx=cx+((a%(R0*2))-R0), ry=cy+(((a>>8)%(R0*2))-R0);
      const yo=(ph+ (a>>4))% (TILE*1.4);
      ctx.moveTo(rx,ry+yo);ctx.lineTo(rx-2,ry+yo+5);
     }
     ctx.stroke();
    }
   }
  }
  // storm gloom over the viewport when heavy cloud sits overhead
  if(storm>0.15){ ctx.globalAlpha=clamp(storm*0.10,0,0.32);ctx.fillStyle='#1a2432';
   ctx.fillRect(vx0*TILE-TILE,vy0*TILE-TILE,(vx1-vx0+3)*TILE,(vy1-vy0+3)*TILE);ctx.globalAlpha=1; }
  // the cloud bodies themselves, riding high above the world
  for(const c of clouds){
   const lift=30, cx=c.x, cy=c.y-lift;
   const r=(8+c.mass*7)*TILE;
   if(cx<vx0*TILE-r||cx>vx1*TILE+r||cy<vy0*TILE-r||cy>vy1*TILE+r)continue;
   const gr=U.mulberry32(c.seed||1);
   const dark=c.rain>0.3, base=dark?'#5a6474':'#e6edf4';
   ctx.globalAlpha=clamp(0.28+c.mass*0.5,0,0.9);
   for(let p=0;p<6;p++){
    const ox=(gr()*2-1)*r*0.7, oy=(gr()*2-1)*r*0.32, pr=r*(0.4+gr()*0.5);
    ctx.fillStyle=p<3?base:(dark?'#6f7a8c':'#f4f8fc');
    ctx.beginPath();ctx.ellipse(cx+ox,cy+oy,pr,pr*0.62,0,0,7);ctx.fill();
   }
   ctx.globalAlpha=1;
  }
 }
 if(SPEEDS[speedIdx]<=16){
  for(const p of ppl){
   if(p.bubble&&p.bubble.until>performance.now())drawBubble(ctx,p);
  }
 }
 if(nf>0.02){
  ctx.fillStyle='rgba(9,14,34,'+(0.40*nf)+')';
  ctx.fillRect(vx0*TILE-TILE,vy0*TILE-TILE,(vx1-vx0+3)*TILE,(vy1-vy0+3)*TILE);
  const go=ctx.globalCompositeOperation;
  ctx.globalCompositeOperation='screen';
  ctx.globalAlpha=nf;
  for(const n of nodes){
   if(n.t!=='tree'&&n.t!=='mush')continue;
   if(n.amt<=0)continue;
   if(n.x<vx0||n.x>vx1||n.y<vy0||n.y>vy1)continue;
   ctx.drawImage(GLOW_CYAN,n.x*TILE+TILE/2-24,n.y*TILE-32,48,48);
  }
  for(const b of vis){
   if(b.tp==='grave'||!b.done||b.ruined)continue;
   ctx.drawImage(GLOW_WARM,b.x*TILE+b.w*TILE/2-28,b.y*TILE+b.h*TILE/2-28,56,56);
  }
  ctx.globalAlpha=1;
  ctx.globalCompositeOperation=go;
 }
 skyAndAmbient(t);
 // quest guide (screen space): a bold dotted trail + arrow steering the Sage to
 // the tracked objective — with an edge arrow when the goal is off-screen
 if(!interior){
  const tq=trackedQuestObj(),obj=tq?questObjective(tq):null;
  if(obj){
   ctx.setTransform(dpr,0,0,dpr,0,0);
   const ox=(obj[0]-cam.x)*z+cw/2, oy=(obj[1]-cam.y)*z+ch/2;
   const hx=(hero.x-cam.x)*z+cw/2, hy=(hero.y-cam.y)*z+ch/2;
   const dx=ox-hx, dy=oy-hy, L=Math.hypot(dx,dy)||1, ux=dx/L, uy=dy/L, ang=Math.atan2(uy,ux);
   const pulse=0.5+0.5*Math.sin(t*0.008);
   if(L>18){
    // flowing dotted trail from the Sage toward the goal
    ctx.strokeStyle='rgba(245,215,120,0.85)';ctx.lineWidth=3;ctx.lineCap='round';
    ctx.setLineDash([3,9]);ctx.lineDashOffset=-(t*0.06)%12;
    ctx.beginPath();ctx.moveTo(hx+ux*24,hy+uy*24);ctx.lineTo(ox,oy);ctx.stroke();
    ctx.setLineDash([]);
    const margin=52;
    const onScreen=ox>=margin&&ox<=cw-margin&&oy>=margin&&oy<=ch-margin;
    if(onScreen){
     // pulsing ring + star right on the objective
     ctx.strokeStyle='rgba(245,215,120,'+(0.55+pulse*0.35)+')';ctx.lineWidth=2.5;
     ctx.beginPath();ctx.arc(ox,oy,11+pulse*5,0,7);ctx.stroke();
     ctx.fillStyle='rgba(245,215,120,0.95)';ctx.font='14px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
     ctx.fillText('✦',ox,oy);ctx.textBaseline='alphabetic';
    }else{
     // objective is off-screen: a bold arrow pinned to the screen edge
     const ex=clamp(ox,margin,cw-margin), ey=clamp(oy,margin,ch-margin);
     ctx.save();ctx.translate(ex,ey);ctx.rotate(ang);
     ctx.fillStyle='rgba(20,28,17,0.8)';ctx.beginPath();ctx.arc(0,0,16,0,7);ctx.fill();
     ctx.fillStyle='rgba(245,215,120,0.98)';
     ctx.beginPath();ctx.moveTo(15,0);ctx.lineTo(-7,-10);ctx.lineTo(-2,0);ctx.lineTo(-7,10);ctx.closePath();ctx.fill();
     ctx.restore();
    }
    // a small arrow just ahead of the Sage, always visible
    ctx.save();ctx.translate(hx+ux*28,hy+uy*28);ctx.rotate(ang);
    ctx.fillStyle='rgba(245,215,120,0.9)';
    ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-5,-6.5);ctx.lineTo(-5,6.5);ctx.closePath();ctx.fill();
    ctx.restore();
   }
  }
 }
 // hurt vignette (screen space)
 if(hero.hurtFlash>0){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle='rgba(210,60,70,'+(hero.hurtFlash*0.4)+')';
  ctx.fillRect(0,0,cw,ch);
 }
 // joystick overlay (screen space)
 if(stick){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.strokeStyle='rgba(232,240,227,0.25)';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(stick.ox,stick.oy,STICK_RADIUS,0,7);ctx.stroke();
  const dx=stick.x-stick.ox,dy=stick.y-stick.oy,d=Math.hypot(dx,dy);
  const cl=Math.min(d,STICK_RADIUS),a=Math.atan2(dy,dx);
  ctx.fillStyle='rgba(125,227,255,0.4)';
  ctx.beginPath();ctx.arc(stick.ox+Math.cos(a)*cl,stick.oy+Math.sin(a)*cl,20,0,7);ctx.fill();
 }
 if(hero.down){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle='rgba(10,20,10,'+Math.min(hero.downT/1.5,0.6)+')';ctx.fillRect(0,0,cw,ch);
  ctx.fillStyle='#c9f27d';ctx.font='bold 26px Georgia';ctx.textAlign='center';
  ctx.fillText('COMPOSTED',cw/2,ch/2-8);
  ctx.fillStyle='#8aa891';ctx.font='13px Georgia';
  ctx.fillText('the garden begins you again…',cw/2,ch/2+18);
 }
}
/* ================= house interiors (bigger on the inside) =================
   Walk up to a home/shop/lean-to and step inside a generated room — larger than
   its footprint — with furniture and its residents pottering about. The surface
   sim keeps running outside while you're in here. */
const ENTER_TP={home:1,shelter:1,biz:1,apartment:1,warehouse:1,venue:1,factory:1,highrise:1};
function doorTileOf(b){ return [b.x+((b.w/2)|0), b.y+b.h]; }   // the tile just outside the door
function enterLabel(b){ return b.name||(b.tp==='home'?'the cottage':b.tp==='shelter'?'the lean-to':b.tp==='biz'?'the shop':'the '+((BMETA[b.tp]&&BMETA[b.tp].label)||b.tp)); }
function enterableAt(px,py){
 let best=null,bd=(TILE*1.7)**2;
 for(const b of buildings){
  if(b.gone||b.ruined||!b.done||!ENTER_TP[b.tp])continue;
  const[dx,dy]=doorTileOf(b),wx=dx*TILE+TILE/2,wy=dy*TILE+TILE/2;
  const d=dist2(px,py,wx,wy);
  if(d<bd){bd=d;best=b}
 }
 return best;
}
function freeSpotInt(intr,rng){
 const rnd=rng||Math.random;
 for(let t=0;t<80;t++){
  const x=1+((rnd()*(intr.gw-2))|0), y=1+((rnd()*(intr.gh-2))|0);
  if(!intr.solid[intr.si(x,y)])return[x,y];
 }
 return[1,1];
}
function makeInterior(b){
 const gw=clamp(b.w*3+4,9,17), gh=clamp(b.h*3+3,8,13);
 const solid=new Uint8Array(gw*gh), si=(x,y)=>y*gw+x;
 for(let x=0;x<gw;x++){solid[si(x,0)]=1;solid[si(x,gh-1)]=1}
 for(let y=0;y<gh;y++){solid[si(0,y)]=1;solid[si(gw-1,y)]=1}
 const dcx=(gw/2)|0;
 solid[si(dcx,gh-1)]=0;solid[si(dcx-1,gh-1)]=0;      // 2-wide doorway on the south wall
 const FLOORS={biz:'#4a4152',factory:'#3a3d42',venue:'#3a2f45',warehouse:'#48412f',highrise:'#3d4450',apartment:'#4a4038'};
 const WALLS={biz:'#332c40',factory:'#2a2d32',venue:'#2a2035',warehouse:'#34301f',highrise:'#2c3340',apartment:'#332c26'};
 const intr={b,gw,gh,solid,si,door:[dcx,gh-1],doorGap:[dcx,dcx-1],furniture:[],occupants:[],
   name:enterLabel(b), floor:FLOORS[b.tp]||'#5a4230', wall:WALLS[b.tp]||'#3a2f22'};
 const rng=U.mulberry32(U.hashStr('interior-'+b.id));
 const put=(x,y,w,h,kind,blk)=>{
  intr.furniture.push({x,y,w,h,kind});
  if(blk)for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(xx>0&&yy>0&&xx<gw-1&&yy<gh-1)solid[si(xx,yy)]=1;
 };
 const midx=(gw/2|0), midy=(gh/2|0);
 if(b.tp==='biz'){
  put(2,1,gw-4,1,'counter',1);
  put(1,3,1,Math.max(1,gh-5),'shelf',1);
  put(gw-2,3,1,Math.max(1,gh-5),'shelf',1);
  put(dcx-1,gh-3,2,1,'rug',0);
  put(3,gh-3,1,1,'crate',1);
 }else if(b.tp==='factory'){
  // rows of machines + a conveyor down the middle, terminals along the wall
  for(let x=2;x<gw-2;x+=3){put(x,2,2,1,'machine',1);put(x,gh-4,2,1,'machine',1);}
  put(2,midy,gw-4,1,'conveyor',0);
  put(1,1,1,1,'terminal',1);put(gw-2,1,1,1,'terminal',1);
  put(dcx-1,gh-3,2,1,'rug',0);
 }else if(b.tp==='warehouse'){
  // aisles of stacked crates and shelving
  for(let y=1;y<gh-2;y+=2)for(let x=1;x<gw-2;x+=3){put(x,y,2,1,rng()<.5?'crate':'barrel',1);}
  put(gw-2,1,1,gh-3,'shelf',1);
 }else if(b.tp==='venue'){
  // a stage up top, a bar to one side, rows of seats
  put(2,1,gw-4,1,'stage',1);
  put(1,2,1,2,'counter',1);
  for(let y=midy;y<gh-2;y+=2)for(let x=3;x<gw-3;x+=2)put(x,y,1,1,'seat',1);
  put(dcx-1,gh-3,2,2,'rug',0);
 }else if(b.tp==='highrise'){
  // a lobby: a lift bank, a reception terminal, potted plants
  put(midx-1,1,2,1,'lift',1);
  put(2,1,1,1,'terminal',1);
  put(1,gh-3,1,1,'potted',1);put(gw-2,gh-3,1,1,'potted',1);
  put(2,midy,gw-4,1,'seat',0);
  put(dcx-1,gh-3,2,1,'rug',0);
 }else if(b.tp==='apartment'){
  // several small units: beds along the walls, a shared table
  put(1,1,2,1,'bed',1);put(gw-3,1,2,1,'bed',1);
  put(1,gh-3,2,1,'bed',1);put(gw-3,gh-3,2,1,'bed',1);
  put(midx-1,midy,2,1,'table',1);
  put(dcx-1,gh-3,2,2,'rug',0);
 }else{
  put(1,1,2,1,'bed',1);
  put(gw-3,1,2,1,'shelf',1);
  put(midx-1,midy,2,1,'table',1);
  put(gw-2,gh-3,1,1,'hearth',1);
  put(dcx-1,gh-3,2,2,'rug',0);
 }
 // continuity: only show occupants who are actually AT the house in the overworld
 // (standing on/adjacent to its footprint — this is where they sleep), not those
 // out working the fields, so the inside matches what you saw outside
 const atHome=o=>{ const tx=(o.x/TILE)|0,ty=(o.y/TILE)|0;
   return tx>=b.x-1&&tx<b.x+b.w+1&&ty>=b.y-1&&ty<b.y+b.h+1; };
 const owners=(b.owners||[]).map(id=>allById.get(id)).filter(o=>o&&!o.dead&&o.sprite&&atHome(o));
 for(const o of owners.slice(0,3)){
  const s=freeSpotInt(intr,rng);
  intr.occupants.push({name:o.name,sprite:o.sprite,x:s[0]*TILE+TILE/2,y:s[1]*TILE+TILE/2,
    tx:0,ty:0,dir:0,animClock:0,wait:rng()*2.5,moving:false});
 }
 return intr;
}
function intCanStand(x,y){
 const intr=interior;if(!intr)return false;
 const tx=(x/TILE)|0,ty=(y/TILE)|0;
 if(tx<0||ty<0||tx>=intr.gw||ty>=intr.gh)return false;
 return intr.solid[intr.si(tx,ty)]===0;
}
function intHeroCanStand(x,y){
 const r=4.5;
 if(!intCanStand(x,y))return false;
 for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;if(!intCanStand(x+Math.cos(a)*r,y+Math.sin(a)*r))return false}
 return true;
}
function intMoveHero(dx,dy){
 const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/3)),sx=dx/steps,sy=dy/steps;
 for(let i=0;i<steps;i++){
  if(sx&&intHeroCanStand(hero.x+sx,hero.y))hero.x+=sx;
  if(sy&&intHeroCanStand(hero.x,hero.y+sy))hero.y+=sy;
 }
 hero.x=clamp(hero.x,3,interior.gw*TILE-3);
 hero.y=clamp(hero.y,3,interior.gh*TILE-3);
}
function enterInterior(b){
 if(interior||cine||!b||b.gone||b.ruined)return;
 interior=makeInterior(b);
 hero._sx=hero.x;hero._sy=hero.y;hero._scz=cam.z;
 const[dx,dy]=interior.door;
 hero.x=dx*TILE+TILE/2;hero.y=(dy-1)*TILE+TILE/2;hero.moving=false;
 cam.x=hero.x;cam.y=hero.y;cam.z=Math.max(2.2,cam.z);
 stick=null;inDialog=false;follow=false;
 toast('You step inside '+interior.name+'.');
}
function exitInterior(){
 if(!interior)return;
 const b=interior.b;
 const[ddx,ddy]=doorTileOf(b);
 const s=(!b.gone&&nearOpen(ddx,ddy))||[Math.round(hero._sx/TILE)||ddx,Math.round(hero._sy/TILE)||ddy];
 interior=null;
 hero.x=s[0]*TILE+TILE/2;hero.y=s[1]*TILE+TILE/2;hero.moving=false;
 cam.x=hero.x;cam.y=hero.y;if(hero._scz)cam.z=hero._scz;
 stick=null;
 toast('You step back out into the air.');
}
function updateOcc(o,rdt){
 o.wait-=rdt;
 if(!o.moving&&o.wait<=0){const s=freeSpotInt(interior);o.tx=s[0]*TILE+TILE/2;o.ty=s[1]*TILE+TILE/2;o.moving=true}
 if(o.moving){
  const dx=o.tx-o.x,dy=o.ty-o.y,d=Math.hypot(dx,dy);
  if(d<3){o.moving=false;o.wait=1+Math.random()*3.5}
  else{
   const spd=32*rdt,nx=o.x+dx/d*spd,ny=o.y+dy/d*spd;
   if(intCanStand(nx,o.y))o.x=nx;
   if(intCanStand(o.x,ny))o.y=ny;
   o.dir=CFHelp.angToDir(Math.atan2(dy,dx));o.animClock+=rdt;
  }
 }
}
function updateInteriorScene(rdt){
 if(interior.b.gone||interior.b.ruined){exitInterior();return}
 let mx=0,my=0;
 if(stick&&!inDialog){
  let dx=stick.x-stick.ox,dy=stick.y-stick.oy;
  const d=Math.hypot(dx,dy);
  if(d>STICK_RADIUS){const ex=(d-STICK_RADIUS)/d;stick.ox+=dx*ex;stick.oy+=dy*ex;dx=stick.x-stick.ox;dy=stick.y-stick.oy}
  const m=Math.min(d/STICK_RADIUS,1);
  if(d>4){mx=dx/d*m;my=dy/d*m;hero.face=Math.atan2(dy,dx)}
 }
 const spd=HERO_SPEED*Hero.speedMul*0.9,vx=mx*spd,vy=my*spd;
 hero.moving=Math.hypot(vx,vy)>6;
 if(hero.moving){
  intMoveHero(vx*rdt,vy*rdt);
  hero.dir=CFHelp.angToDir(Math.atan2(vy,vx));
  hero.anim=Math.hypot(mx,my)>0.85?'run':'walk';hero.animClock+=rdt;
 }else hero.anim='walk';
 for(const o of interior.occupants)updateOcc(o,rdt);
 // stepping into the doorway leads back outside
 if(((hero.y/TILE)|0)>=interior.gh-1)exitInterior();
 uiProxT-=rdt;if(uiProxT<=0){uiProxT=0.2;updateContextButtons()}
}
function drawFurniture(c,f){
 const px=f.x*TILE,py=f.y*TILE,w=f.w*TILE,h=f.h*TILE;
 if(f.kind==='rug'){
  c.fillStyle='#7a3b4a';c.fillRect(px+1,py+1,w-2,h-2);
  c.fillStyle='#a8586a';c.fillRect(px+3,py+3,w-6,h-6);
  c.fillStyle='#e0c07a';c.fillRect(px+w/2-1,py+2,2,h-4);return;
 }
 if(f.kind==='bed'){
  c.fillStyle='#6a4a30';c.fillRect(px,py,w,h);
  c.fillStyle='#c9d3dd';c.fillRect(px+1,py+1,w-2,h-3);           // sheets
  c.fillStyle='#e8eef4';c.fillRect(px+1,py+1,5,h-3);              // pillow
  c.fillStyle='#8a6a4a';c.fillRect(px,py+h-2,w,2);return;
 }
 if(f.kind==='table'){
  c.fillStyle='#7a5a3a';c.fillRect(px,py+1,w,h-1);
  c.fillStyle='#5a3f28';c.fillRect(px+1,py+h-2,2,2);c.fillRect(px+w-3,py+h-2,2,2);
  c.fillStyle='#caa25a';c.fillRect(px+w/2-2,py+2,4,3);return;     // a bowl
 }
 if(f.kind==='hearth'){
  c.fillStyle='#4b4640';c.fillRect(px,py,w,h);
  c.fillStyle='#1a1410';c.fillRect(px+2,py+3,w-4,h-4);
  const fl=0.6+0.4*Math.sin(performance.now()*0.01);
  c.fillStyle='rgba(255,150,50,'+(0.6+fl*0.4)+')';c.fillRect(px+3,py+h-5,w-6,3);
  const go=c.globalCompositeOperation;c.globalCompositeOperation='screen';
  c.drawImage(GLOW_WARM,px-6,py-6,w+12,h+12);c.globalCompositeOperation=go;return;
 }
 if(f.kind==='shelf'){
  c.fillStyle='#5a4530';c.fillRect(px,py,w,h);
  c.fillStyle='#3f2f1f';for(let yy=0;yy<h;yy+=5)c.fillRect(px,py+yy,w,1);
  c.fillStyle='#9ab0c0';for(let yy=1;yy<h;yy+=5)for(let xx=1;xx<w-1;xx+=3)c.fillRect(px+xx,py+yy,2,3);return;
 }
 if(f.kind==='counter'){
  c.fillStyle='#6a5236';c.fillRect(px,py,w,h);
  c.fillStyle='#8a6a44';c.fillRect(px,py,w,2);
  c.fillStyle='#3f2f1f';c.fillRect(px,py+h-1,w,1);return;
 }
 if(f.kind==='crate'){
  c.fillStyle='#7a5c38';c.fillRect(px,py,w,h);
  c.fillStyle='#5a4028';c.strokeStyle='#5a4028';c.lineWidth=1;
  c.strokeRect(px+0.5,py+0.5,w-1,h-1);c.beginPath();c.moveTo(px,py);c.lineTo(px+w,py+h);c.stroke();return;
 }
 if(f.kind==='barrel'){
  c.fillStyle='#4a5a5f';for(let xx=0;xx<w;xx+=6){c.beginPath();c.ellipse(px+xx+3,py+h/2,3,h/2-0.5,0,0,7);c.fill();}
  c.fillStyle='#6a8088';for(let xx=0;xx<w;xx+=6)c.fillRect(px+xx+1,py+1,4,1);return;
 }
 if(f.kind==='machine'){
  c.fillStyle='#4a4e56';c.fillRect(px,py,w,h);
  c.fillStyle='#2c3036';c.fillRect(px+1,py+1,w-2,h-2);
  const bl=Math.sin(performance.now()*0.005+f.x)>0;
  c.fillStyle=bl?'#7fe0a0':'#e0c07a';c.fillRect(px+2,py+2,2,2);
  c.fillStyle='#a0d0ff';c.fillRect(px+w-4,py+2,2,2);
  c.fillStyle='#20242a';c.fillRect(px+w/2-1,py+h/2-1,3,3);return;
 }
 if(f.kind==='conveyor'){
  c.fillStyle='#33373d';c.fillRect(px,py+1,w,h-2);
  c.fillStyle='#4a4e55';const off=((performance.now()*0.02)|0)%4;
  for(let xx=off;xx<w;xx+=4)c.fillRect(px+xx,py+1,1,h-2);return;
 }
 if(f.kind==='terminal'){
  c.fillStyle='#2a2e34';c.fillRect(px,py,w,h);
  const go=c.globalCompositeOperation;c.globalCompositeOperation='screen';
  c.drawImage(GLOW_CYAN,px-3,py-3,w+6,h+6);c.globalCompositeOperation=go;
  c.fillStyle='#6fe0d0';c.fillRect(px+1,py+1,w-2,Math.max(1,h-3));
  c.fillStyle='#1a3a3a';for(let yy=1;yy<h-2;yy+=2)c.fillRect(px+1,py+yy,w-2,1);return;
 }
 if(f.kind==='stage'){
  c.fillStyle='#4a3a5a';c.fillRect(px,py,w,h);
  c.fillStyle='#6a4a7a';c.fillRect(px,py,w,2);
  const go=c.globalCompositeOperation;c.globalCompositeOperation='screen';
  c.drawImage(GLOW_PINK,px+w/2-8,py-6,16,14);c.globalCompositeOperation=go;
  c.fillStyle='#e0a0d0';c.fillRect(px+w/2-1,py+2,2,h-3);return;
 }
 if(f.kind==='seat'){
  c.fillStyle='#5a4a5f';c.fillRect(px+1,py+1,w-2,h-2);
  c.fillStyle='#3a2f42';c.fillRect(px+1,py+1,w-2,1);return;
 }
 if(f.kind==='lift'){
  c.fillStyle='#2c3340';c.fillRect(px,py,w,h);
  c.fillStyle='#5a6a80';c.fillRect(px+1,py+1,w-2,h-2);
  c.fillStyle='#20262f';c.fillRect(px+w/2-0.5,py+1,1,h-2);   // the seam of the doors
  const go=c.globalCompositeOperation;c.globalCompositeOperation='screen';
  c.drawImage(GLOW_CYAN,px+w/2-4,py-4,8,6);c.globalCompositeOperation=go;return;
 }
 if(f.kind==='potted'){
  c.fillStyle='#6a4a30';c.fillRect(px+w/2-2,py+h-3,4,3);
  c.fillStyle='#4a8a4a';c.beginPath();c.arc(px+w/2,py+h-4,3.2,0,7);c.fill();
  c.fillStyle='#5a9a54';c.beginPath();c.arc(px+w/2-1.5,py+h-5,2,0,7);c.fill();return;
 }
 c.fillStyle='#6a5236';c.fillRect(px,py,w,h);
}
function drawInterior(t){
 const intr=interior;
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.fillStyle='#0c0a07';ctx.fillRect(0,0,cw,ch);
 const z=cam.z;
 cam.x+=(hero.x-cam.x)*0.16;cam.y+=(hero.y-cam.y)*0.16;
 const wpx=intr.gw*TILE,wph=intr.gh*TILE;
 cam.x=clamp(cam.x,Math.min(cw/(2*z),wpx/2),Math.max(wpx-cw/(2*z),wpx/2));
 cam.y=clamp(cam.y,Math.min(ch/(2*z),wph/2),Math.max(wph-ch/(2*z),wph/2));
 ctx.setTransform(z*dpr,0,0,z*dpr,dpr*(cw/2-cam.x*z),dpr*(ch/2-cam.y*z));
 ctx.imageSmoothingEnabled=false;
 // floorboards everywhere
 for(let y=0;y<intr.gh;y++)for(let x=0;x<intr.gw;x++){
  const px=x*TILE,py=y*TILE,v=(hash2(x*2+5,y*3+1)*14)|0;
  const base=U.hexToRgb(intr.floor);
  ctx.fillStyle='rgb('+(base[0]+v-4)+','+(base[1]+v-4)+','+(base[2]+v-4)+')';
  ctx.fillRect(px,py,TILE,TILE);
  ctx.fillStyle='rgba(0,0,0,0.14)';ctx.fillRect(px,py+TILE-1,TILE,1);
 }
 // walls (border) with a doorway gap on the south side
 const isDoor=(x,y)=>y===intr.gh-1&&intr.doorGap.includes(x);
 for(let y=0;y<intr.gh;y++)for(let x=0;x<intr.gw;x++){
  if(x!==0&&y!==0&&x!==intr.gw-1&&y!==intr.gh-1)continue;
  if(isDoor(x,y))continue;
  const px=x*TILE,py=y*TILE,wb=U.hexToRgb(intr.wall);
  ctx.fillStyle=intr.wall;ctx.fillRect(px,py,TILE,TILE);
  ctx.fillStyle='rgb('+(wb[0]+14)+','+(wb[1]+14)+','+(wb[2]+14)+')';ctx.fillRect(px,py,TILE,3);
 }
 // threshold mat at the doorway
 for(const gx of intr.doorGap){ctx.fillStyle='#3a2c1a';ctx.fillRect(gx*TILE+1,(intr.gh-1)*TILE+2,TILE-2,TILE-3)}
 // rugs first (they sit under everyone), then the rest of the furniture
 for(const f of intr.furniture)if(f.kind==='rug')drawFurniture(ctx,f);
 for(const f of intr.furniture)if(f.kind!=='rug')drawFurniture(ctx,f);
 // residents + the Sage, painter-sorted
 const ds=[];
 for(const o of intr.occupants)ds.push({y:o.y,f:()=>{
  ctx.save();ctx.translate(o.x,o.y);
  ctx.fillStyle='rgba(0,0,0,0.3)';ctx.beginPath();ctx.ellipse(0,1,5,2,0,0,7);ctx.fill();
  CFHelp.drawCreatureSprite(ctx,o.sprite,0,3,o.dir,'walk',o.moving?o.animClock:0);
  ctx.restore();
 }});
 ds.push({y:hero.y,f:()=>drawHero(t)});
 ds.sort((a,b)=>a.y-b.y);
 for(const d of ds)d.f();
 // cosy vignette
 ctx.setTransform(dpr,0,0,dpr,0,0);
 const g=ctx.createRadialGradient(cw/2,ch*0.45,ch*0.22,cw/2,ch*0.5,ch*0.72);
 g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(6,4,2,0.55)');
 ctx.fillStyle=g;ctx.fillRect(0,0,cw,ch);
 // joystick
 if(stick){
  ctx.strokeStyle='rgba(232,240,227,0.25)';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(stick.ox,stick.oy,STICK_RADIUS,0,7);ctx.stroke();
  const dx=stick.x-stick.ox,dy=stick.y-stick.oy,d=Math.hypot(dx,dy);
  const cl=Math.min(d,STICK_RADIUS),a=Math.atan2(dy,dx);
  ctx.fillStyle='rgba(240,217,176,0.4)';
  ctx.beginPath();ctx.arc(stick.ox+Math.cos(a)*cl,stick.oy+Math.sin(a)*cl,20,0,7);ctx.fill();
 }
}
function drawRuinMarker(c,d,t,px,py){
 const go=c.globalCompositeOperation;
 c.globalCompositeOperation='screen';
 c.drawImage(d.cleansed?GLOW_GREEN:GLOW_RED,px-22,py-24,44,44);
 c.globalCompositeOperation=go;
 c.fillStyle='rgba(0,0,0,0.28)';c.beginPath();c.ellipse(px,py+7,11,3.2,0,0,7);c.fill();
 // tumbled rubble + a broken pillar with a dark doorway into the ruins
 c.fillStyle='#6c6a63';c.fillRect(px-10,py+3,7,4);c.fillRect(px+4,py+2,7,5);c.fillRect(px-3,py+5,6,3);
 c.fillStyle='#7d7b72';c.fillRect(px-9,py-9,5,14);c.fillRect(px+4,py-6,5,11);
 c.fillStyle='#565349';c.fillRect(px-9,py-9,5,2);c.fillRect(px+4,py-6,5,2);   // broken tops
 c.fillStyle='#57544b';c.fillRect(px-3,py-8,7,13);
 c.fillStyle='#0b0d0a';c.beginPath();c.moveTo(px-2.5,py+5);c.lineTo(px-2.5,py-3);c.arc(px+.5,py-3,3,Math.PI,0);c.lineTo(px+3.5,py+5);c.closePath();c.fill();
 const fl=0.6+0.4*Math.sin(t*0.02+d.id);
 if(!d.cleansed){c.fillStyle='rgba(255,'+(120+fl*60|0)+',60,'+(0.6+fl*0.3)+')';c.fillRect(px-1,py-1,2,2)}
 else{c.fillStyle='#7de3a0';c.fillRect(px-1,py-1,2,2)}
 if(d.inside.size){c.fillStyle='#e8c065';c.font='6px system-ui';c.textAlign='center';c.fillText('🔦'+d.inside.size,px,py-16)}
 if(cam.z>1.05){c.font='6.5px Georgia';c.textAlign='center';c.fillStyle='rgba(225,205,190,0.85)';c.fillText(d.name,px,py+16)}
}
function drawDungeon(c,d,t){
 const px=d.x*TILE+TILE/2,py=d.y*TILE+TILE/2;
 if(d.ruin){drawRuinMarker(c,d,t,px,py);return}
 const go=c.globalCompositeOperation;
 c.globalCompositeOperation='screen';
 c.drawImage(d.cleansed?GLOW_GREEN:GLOW_RED,px-24,py-24,48,48);
 c.globalCompositeOperation=go;
 c.fillStyle='#2a3326';
 c.beginPath();c.moveTo(px-8,py+7);c.lineTo(px-8,py-2);c.arc(px,py-2,8,Math.PI,0);c.lineTo(px+8,py+7);c.closePath();c.fill();
 c.fillStyle='#08100a';
 c.beginPath();c.moveTo(px-5,py+7);c.lineTo(px-5,py-1);c.arc(px,py-1,5,Math.PI,0);c.lineTo(px+5,py+7);c.closePath();c.fill();
 const blink=(Math.sin(t*0.003+d.id)>0.9);
 if(!blink&&!d.cleansed){c.fillStyle='#e8563a';c.fillRect(px-3,py+1,1.6,1.6);c.fillRect(px+1.4,py+1,1.6,1.6)}
 if(d.cleansed){c.fillStyle='#7de3a0';c.fillRect(px-1,py+1,2,2)}
 c.fillStyle='#3d5232';c.fillRect(px-9,py-1,1.5,7);c.fillRect(px+7.5,py-1,1.5,7);
 const fl=0.6+0.4*Math.sin(t*0.02+d.id);
 c.fillStyle=d.cleansed?'rgba(120,255,170,'+(0.5+fl*0.3)+')':'rgba(255,'+(140+fl*60|0)+',60,'+(0.7+fl*0.3)+')';
 c.beginPath();c.arc(px-8.2,py-2,2,0,7);c.fill();c.beginPath();c.arc(px+8.2,py-2,2,0,7);c.fill();
 if(d.inside.size){
  c.fillStyle='#e8c065';c.font='6px system-ui';c.textAlign='center';
  c.fillText('🔦'+d.inside.size,px,py-13);
 }
 if(cam.z>1.05){c.font='6.5px Georgia';c.textAlign='center';c.fillStyle='rgba(220,230,210,0.8)';c.fillText(d.name,px,py+15)}
}
function drawHero(t){
 ctx.save();ctx.translate(hero.x,hero.y);
 const blink=hero.ifr>0&&Math.floor(t/70)%2===0;
 if(!blink){
  ctx.fillStyle='rgba(0,0,0,0.35)';
  ctx.beginPath();ctx.ellipse(0,2,7,2.8,0,0,7);ctx.fill();
  if(hero.sprite){
   const anim=hero.atkT>0?'attack':hero.anim;
   const clock=hero.atkT>0?hero.atkClock:hero.animClock;
   CFHelp.drawCreatureSprite(ctx,hero.sprite,0,4,hero.dir,anim,clock);
  }else{
   ctx.fillStyle='#7de3ff';
   ctx.beginPath();ctx.arc(0,-6,6,0,7);ctx.fill();
   ctx.fillStyle='#1b1626';ctx.fillRect(-2,-8,1.5,2);ctx.fillRect(1,-8,1.5,2);
  }
  if(speedIdx>=2){ctx.font='8px system-ui';ctx.textAlign='center';ctx.fillText('🧘',0,-22)}
  if(hero.em&&hero.em.until>performance.now()){ctx.font='8px system-ui';ctx.textAlign='center';ctx.fillText(hero.em.g,0,-22)}
 }
 // a growing charge ring while winding up a spin strike
 if(charging){
  const c=clamp(chargeT/1.1,0,1);
  ctx.strokeStyle='rgba(255,'+(200-c*60|0)+',80,'+(0.4+c*0.5)+')';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(0,0,10+c*16,0,6.283*Math.min(1,chargeT/1.1));ctx.stroke();
 }
 ctx.restore();
}
function drawBubble(c,p){
 const txt=p.bubble.text;
 c.font='6px system-ui';
 const w=Math.min(74,c.measureText(txt).width+8),h=11;
 const bx=p.x,by=p.y-22;
 const fade=clamp((p.bubble.until-performance.now())/500,0,1);
 c.globalAlpha=0.92*Math.min(1,fade*3);
 c.fillStyle='#f4efe4';
 rr(c,bx-w/2,by-h,w,h,3);c.fill();
 c.beginPath();c.moveTo(bx-2,by-1);c.lineTo(bx+2,by-1);c.lineTo(bx,by+3);c.closePath();c.fill();
 c.fillStyle='#241f33';c.textAlign='center';c.textBaseline='middle';
 c.fillText(txt,bx,by-h/2,w-6);
 c.textBaseline='alphabetic';c.globalAlpha=1;
}

/* ================= the Sage: movement & combat (real-time) ================= */
let stick=null;
const STICK_RADIUS=56,STICK_PROMOTE=130,SWIPE_MAX_MS=220,SWIPE_MIN_DIST=34;
function heroCanStand(x,y){
 if(!walkable((x/TILE)|0,(y/TILE)|0))return false;
 const r=4.5;
 for(let i=0;i<4;i++){
  const a=i*Math.PI/2+Math.PI/4;
  if(!walkable(((x+Math.cos(a)*r)/TILE)|0,((y+Math.sin(a)*r)/TILE)|0))return false;
 }
 return true;
}
function moveHero(dx,dy){
 const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/3));
 const sx=dx/steps,sy=dy/steps;
 for(let i=0;i<steps;i++){
  if(sx&&heroCanStand(hero.x+sx,hero.y))hero.x+=sx;
  if(sy&&heroCanStand(hero.x,hero.y+sy))hero.y+=sy;
 }
 hero.x=clamp(hero.x,TILE,W*TILE-TILE);
 hero.y=clamp(hero.y,TILE,H*TILE-TILE);
}
function heroSlash(ang){
 if(hero.down||heroSlashCd>0||inDialog||interior)return;
 heroSlashCd=0.18;
 hero.face=ang;hero.dir=CFHelp.angToDir(ang);
 hero.atkT=0.42;hero.atkClock=0;
 const dmg=(16+Hero.level*4)*Hero.dmg;
 heroSlashes.push({ang,t:0,hit:new Set(),range:HERO_RANGE*Hero.rangeMul,arc:Math.min(Math.PI*1.6,HERO_ARC*Hero.arcMul),dmg});
 if(navigator.vibrate)navigator.vibrate(12);
}
// a dodge-roll: a quick burst of speed in a direction, with brief invulnerability
function heroDashDo(ang){
 if(hero.down||interior||inDialog||dashCd>0||heroStam<28)return false;
 if(ang==null||isNaN(ang))ang=hero.face||0;
 heroStam-=28; dashCd=0.62;
 heroDash={ang,t:0,dur:0.22};
 hero.ifr=Math.max(hero.ifr,0.32); hero.face=ang; hero.dir=CFHelp.angToDir(ang);
 emote2Hero('💨');
 if(navigator.vibrate)navigator.vibrate(10);
 return true;
}
// a charged spin: a full-circle strike whose reach & damage grow with the charge
function heroSpin(charge){
 if(hero.down||interior||inDialog||heroSlashCd>0)return false;
 charge=clamp(charge==null?1:charge,0,1);
 const cost=24+charge*30; if(heroStam<cost)return false;
 heroStam-=cost; heroSlashCd=0.42;
 hero.atkT=0.5;hero.atkClock=0;
 const dmg=(16+Hero.level*4)*Hero.dmg*(1.1+charge*1.2);
 heroSlashes.push({ang:hero.face||0,t:0,hit:new Set(),range:(HERO_RANGE*Hero.rangeMul)*(1.25+charge*0.9),arc:Math.PI*2,dmg,spin:true});
 particlesRing(hero.x,hero.y,charge);
 if(navigator.vibrate)navigator.vibrate([12,24,12]);
 return true;
}
function emote2Hero(g){hero.em={g,until:performance.now()+900}}
function particlesRing(x,y,charge){
 const n=8+((charge*10)|0);
 for(let i=0;i<n;i++){const a=i/n*6.283,sp=60+charge*80;
  particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:0,max:0.3+charge*0.3,size:1.6+charge*1.6,col:'#cfe8ff',g:20,spark:true});}
}
function updateHero(rdt){
 // stamina regenerates (slower while dashing/charging), and cooldowns tick
 heroStam=clamp(heroStam+(charging?4:hero.moving?9:15)*rdt,0,HERO_STAM_MAX);
 dashCd=Math.max(0,dashCd-rdt);
 if(charging){chargeT=Math.min(1.2,chargeT+rdt);heroStam=Math.max(0,heroStam-6*rdt);}
 heroSlashCd-=rdt;
 hero.ifr=Math.max(0,hero.ifr-rdt);
 hero.hurtFlash=Math.max(0,hero.hurtFlash-rdt);
 if(interior){updateInteriorScene(rdt);return}
 if(hero.down){
  hero.downT+=rdt;
  if(hero.downT>2.6){
   hero.down=false;Hero.hp=Hero.maxHp;hero.ifr=2;
   const v=villages[0];
   if(v){const s=nearOpen(Math.round(v.cx),Math.round(v.cy));if(s){hero.spawnX=s[0]*TILE+TILE/2;hero.spawnY=s[1]*TILE+TILE/2}}
   hero.x=hero.spawnX;hero.y=hero.spawnY;
   toast('You are begun again, greener than before.');
  }
  return;
 }
 // active dash overrides normal steering: fling the Sage along the roll
 if(heroDash){
  heroDash.t+=rdt;
  const k=Math.max(0,1-heroDash.t/heroDash.dur), dspd=HERO_SPEED*Hero.speedMul*3.4*(0.4+k);
  moveHero(Math.cos(heroDash.ang)*dspd*rdt,Math.sin(heroDash.ang)*dspd*rdt);
  hero.moving=true;hero.anim='run';hero.animClock+=rdt*1.6;
  if(heroDash.t>=heroDash.dur)heroDash=null;
 }
 // joystick movement (suppressed during a dash / while charging a spin)
 let mx=0,my=0;
 if(stick&&!inDialog&&!heroDash){
  let dx=stick.x-stick.ox,dy=stick.y-stick.oy;
  const d=Math.hypot(dx,dy);
  if(d>STICK_RADIUS){const ex=(d-STICK_RADIUS)/d;stick.ox+=dx*ex;stick.oy+=dy*ex;dx=stick.x-stick.ox;dy=stick.y-stick.oy}
  const m=Math.min(d/STICK_RADIUS,1);
  if(d>4){mx=dx/d*m;my=dy/d*m;hero.face=Math.atan2(dy,dx)}
 }
 const spd=HERO_SPEED*Hero.speedMul*(charging?0.4:1);
 const vx=mx*spd,vy=my*spd;
 if(!heroDash)hero.moving=Math.hypot(vx,vy)>6;
 if(hero.moving&&!heroDash){
  moveHero(vx*rdt,vy*rdt);
  hero.dir=CFHelp.angToDir(Math.atan2(vy,vx));
  hero.anim=Math.hypot(mx,my)>0.85?'run':'walk';
  hero.animClock+=rdt;
 }else if(!heroDash)hero.anim='walk';
 if(hero.atkT>0){hero.atkT-=rdt;hero.atkClock+=rdt}
 // slashes vs monsters
 for(const s of heroSlashes){
  s.t+=rdt;
  if(s.t<=0.14){
   for(const m of monsters.slice()){
    if(s.hit.has(m))continue;
    const dx=m.x-hero.x,dy=m.y-hero.y,d=Math.hypot(dx,dy);
    if(d<s.range+8){
      let da=Math.atan2(dy,dx)-s.ang;
      da=Math.atan2(Math.sin(da),Math.cos(da));
      if(Math.abs(da)<s.arc/2){
       s.hit.add(m);
       m.hp-=s.dmg;
       emote2(m,'💥');
       const k=26;
       if(walkable(((m.x+Math.cos(s.ang)*k)/TILE)|0,(m.y/TILE)|0))m.x+=Math.cos(s.ang)*k;
       if(walkable((m.x/TILE)|0,((m.y+Math.sin(s.ang)*k)/TILE)|0))m.y+=Math.sin(s.ang)*k;
       if(navigator.vibrate)navigator.vibrate(15);
       if(m.hp<=0)heroKillMonster(m);
      }
    }
   }
   // slashes vs animals (prey scatter, predators can be culled)
   for(const a of animals.slice()){
    if(a.dead||s.hit.has(a))continue;
    const dx=a.x-hero.x,dy=a.y-hero.y,d=Math.hypot(dx,dy);
    if(d<s.range+8){
     let da=Math.atan2(dy,dx)-s.ang;da=Math.atan2(Math.sin(da),Math.cos(da));
     if(Math.abs(da)<s.arc/2){
      s.hit.add(a);a.hp-=(16+Hero.level*4)*Hero.dmg;a.fleeUntil=simMin+400;emoteA(a,'💥');
      if(a.hp<=0)heroKillAnimal(a);
     }
    }
   }
   // slashes vs bramble-rock: the Sage mines the terrain, chipping tiles in the arc
   const rr=Math.ceil((s.range+8)/TILE), htx=(hero.x/TILE)|0, hty=(hero.y/TILE)|0;
   for(let dyt=-rr;dyt<=rr;dyt++)for(let dxt=-rr;dxt<=rr;dxt++){
    const x=htx+dxt,y=hty+dyt; if(x<0||y<0||x>=W||y>=H)continue;
    if(!mineable(x,y))continue;
    const cx=x*TILE+TILE/2,cy=y*TILE+TILE/2,ddx=cx-hero.x,ddy=cy-hero.y;
    if(Math.hypot(ddx,ddy)>=s.range+8)continue;
    let da=Math.atan2(ddy,ddx)-s.ang; da=Math.atan2(Math.sin(da),Math.cos(da));
    if(Math.abs(da)>s.arc/2)continue;
    const key='r'+idx(x,y); if(s.hit.has(key))continue; s.hit.add(key);
    mineTile(x,y,s.dmg,{hero:true});
   }
  }
 }
 heroSlashes=heroSlashes.filter(s=>s.t<0.25);
 // ground finds: walk over to pocket gold/gems — or install a rare relic
 for(const sv of salvage){
  sv.t+=rdt*1.5;
  if(!sv.got&&!hero.down&&dist2(sv.x,sv.y,hero.x,hero.y)<(TILE*0.9)**2){
   sv.got=true;
   collectFind(sv);
   if(navigator.vibrate)navigator.vibrate(sv.kind==='relic'||(!sv.kind&&sv.relic)?24:12);
  }
 }
 salvage=salvage.filter(s=>!s.got);
 // context buttons: talk & descend
 uiProxT-=rdt;
 if(uiProxT<=0){uiProxT=0.2;updateContextButtons()}
}
let uiProxT=0,talkTarget=null,descendTarget=null;
function updateContextButtons(){
 const eb=$('sEnterBtn');
 if(interior){
  $('sTalkBtn').style.display='none';$('sDescendBtn').style.display='none';
  eb.style.display='block';eb.textContent='🚪 EXIT — '+interior.name;
  return;
 }
 talkTarget=null;descendTarget=null;enterTarget=null;
 if(!hero.down&&!inDialog&&speedIdx<=1){
  let bd=44*44;
  for(const p of people){
   if(p.dead||p.inDungeon||p.age<8)continue;
   const d=dist2(p.x,p.y,hero.x,hero.y);
   if(d<bd){bd=d;talkTarget=p}
  }
  for(const d of dungeons){
   if(dist2(d.x*TILE+TILE/2,d.y*TILE+TILE/2,hero.x,hero.y)<40*40){descendTarget=d;break}
  }
  enterTarget=enterableAt(hero.x,hero.y);
 }
 const tb=$('sTalkBtn'),db=$('sDescendBtn');
 tb.style.display=talkTarget?'block':'none';
 if(talkTarget)tb.textContent='💬 TALK — '+talkTarget.name;
 db.style.display=descendTarget?'block':'none';
 if(descendTarget)db.textContent=(descendTarget.cleansed?'🌿 REVISIT — ':descendTarget.ruin?'🏚 RAID — ':'🕳 DESCEND — ')+descendTarget.name;
 eb.style.display=enterTarget?'block':'none';
 if(enterTarget)eb.textContent='🚪 ENTER — '+enterLabel(enterTarget);
}

/* ================= player↔NPC dialogue (philosophy on demand) ================= */
const TALK_OPEN=['Ah — the wandering Sage.','You again. The hedges mentioned you.','Sit. The grass is honest here.','Welcome, blade-and-question.','You walk like someone carrying an unanswered letter.','You have that chrome-and-chlorophyll look. Been down the net?'];
const TALK_CLOSE=['Go gently. The path is listening.','May your roots find water.','Ask the moss, if you doubt me.','The garden keeps us. Mostly.','Leave the gate as you found it: ajar.'];
const TALK_RUMOR=['They say something chews at the cables beneath {d}.','A cold breath comes up out of {d} at dusk. It smells of ozone and unfinished arguments.','There is chrome below {d}, they say — augments still warm — and things that resent the light.','{d} took two of ours last spring. The garden pretends not to remember.','If you must go down {d}, go as a question, not an answer. The old net answers answers with teeth.'];
const TALK_LOVE=['There is someone whose name tastes like rain. Do not tell the turnips.','Love is just gardening with higher stakes.'];
const TALK_GOAL={
 love:'Somewhere in this garden is a heart shaped like the missing half of mine. I keep weeding toward it.',
 family:'I want a small loud houseful to leave my seeds to.',
 craft:'I am going to open a little shop and stock it with things nobody knew they needed.',
 wander:'I mean to stand in every corner of this garden at least once. The corners keep moving.',
 fellows:'A life is measured in friends per acre.',
 quiet:'Give me a door that shuts, a kettle, and one long unhurried question.'
};
const TRAIT_TALK={
 unlucky:['If a pot can crack, it finds my shelf. I have made peace with the mathematics of it.'],
 lucky:['Fortune is a bee. I plant flowers and try not to swat.'],
 creative:['I am teaching the trellis to hold a shape no one has needed yet.'],
 passionate:['Everything worth doing is worth doing until the neighbours complain.'],
 kind:['Water what wilts. It is not complicated. It is only daily.'],
 grumpy:['The garden would be perfect without all this... flourishing.'],
 brave:['Fear is only sap. It proves the tree is alive.'],
 timid:['I speak fluently to seedlings. Crowds are another grammar.'],
 ambitious:['One day my name will be a cultivar.'],
 lazy:['The lilies neither toil nor spin, and look how they are doing.'],
 curious:['I dug a hole yesterday just to hear what it had to say.'],
 loyal:['Plant me anywhere near my people and I will grow.'],
 jealous:['Their marrows are enormous. I have checked. Repeatedly.'],
 cheerful:['Every morning the sun rises absolutely free of charge!'],
 gloomy:['All flowers are compost that hasn’t happened yet. Lovely, though. Lovely.'],
 charming:['The roses asked ME for advice. I gave it. They preened.'],
 awkward:['I rehearsed this conversation with a cabbage. You are doing better than the cabbage.'],
 hardworking:['Rows don’t hoe themselves. Believe me. I waited once.'],
 dreamer:['Some nights the whole meadow lifts an inch. No one else checks.'],
 stubborn:['I planted it there. It will GROW there.']
};
// a line in the world's own voice when lore is seeded, else the hand-written one
function loreOr(fallback,min,max){ return (Lore.active&&Lore.line(min||5,max||13))||fallback; }
function npcDialogue(p){
 const lines=[];
 lines.push(loreOr(pick(TALK_OPEN),5,12));
 const tp=TRAIT_TALK[p.traits[0]]||TRAIT_TALK[p.traits[1]];
 if(tp)lines.push(loreOr(pick(tp),6,15));
 if(p.courting&&chance(.6))lines.push(loreOr(pick(TALK_LOVE),5,12));
 else if(p.goal&&!p.goal.done&&chance(.7))lines.push(loreOr(TALK_GOAL[p.goal.k],6,15));
 if(p.cards.length&&chance(.4)){const c=TAROT[p.cards[p.cards.length-1].i];lines.push('The garden dealt me '+c.n+'. I am still deciding what it gave me.')}
 if(dungeons.length&&chance(.55)){const d=pick(dungeons.filter(dd=>!dd.cleansed).concat(dungeons).slice(0,dungeons.length));const lr=Lore.active&&Lore.line(5,12);lines.push(lr?lr+' Beneath '+d.name+'.':pick(TALK_RUMOR).replace('{d}',d.name))}
 lines.push(loreOr(pick(TALK_CLOSE),4,10));
 return lines.map(l=>Mind.speak(p.mind,l));   // each speaker's own drifted words bleed in
}
let dlgLines=null,dlgIdx=0,pendingQuest=null,choosing=false;
function startTalk(p){
 if(!p||p.dead)return;
 inDialog=true;stick=null;
 p.chatHold=simMin+40;p.task=null;p.path=null;p.moving=false;
 p.fx=hero.x>p.x?1:-1;
 p.dirIdx=CFHelp.angToDir(Math.atan2(hero.y-p.y,hero.x-p.x));
 dlgLines=npcDialogue(p);dlgIdx=0;
 pendingQuest=null;choosing=false;
 $('sDialogChoice').style.display='none';$('sDialogNext').style.display='block';
 // a soul with an unrealized dream may ask the Sage for a hand toward it
 if(questGiverEligible(p)&&chance(.75)){
  const q=buildQuest(p);
  if(q){pendingQuest=q;dlgLines=dlgLines.slice(0,-1);dlgLines.push(Mind.speak(p.mind,q.ask))}
 }
 $('sDialogName').textContent=p.name+' · '+traitPhrase(p);
 $('sDialogText').textContent=dlgLines[0];
 if(pendingQuest&&dlgLines.length===1)showQuestChoice();
 $('sDialog').style.display='block';
 $('sTalkBtn').style.display='none';
 $('sDescendBtn').style.display='none';
 $('sEnterBtn').style.display='none';
}
function showQuestChoice(){
 choosing=true;
 $('sDialogChoice').style.display='flex';
 $('sDialogNext').style.display='none';
}
function closeDialog(){
 $('sDialog').style.display='none';
 $('sDialogChoice').style.display='none';
 dlgLines=null;inDialog=false;choosing=false;
}
function advanceTalk(){
 if(choosing)return;   // waiting on the accept / decline choice
 dlgIdx++;
 if(dlgLines&&dlgIdx<dlgLines.length){
  $('sDialogText').textContent=dlgLines[dlgIdx];
  if(pendingQuest&&dlgIdx===dlgLines.length-1)showQuestChoice();
 }else{
  closeDialog();
 }
}

/* ================= input ================= */
const ptrs=new Map();
let pinchD=0,downInfo=null;
cv.addEventListener('pointerdown',e=>{
 cv.setPointerCapture(e.pointerId);
 ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(ptrs.size===1)downInfo={id:e.pointerId,x:e.clientX,y:e.clientY,t:performance.now(),moved:0};
 if(ptrs.size===2){
  const a=[...ptrs.values()];
  pinchD=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
  stick=null;downInfo=null;
 }
});
cv.addEventListener('pointermove',e=>{
 const pr=ptrs.get(e.pointerId);
 if(!pr)return;
 const dx=e.clientX-pr.x,dy=e.clientY-pr.y;
 pr.x=e.clientX;pr.y=e.clientY;
 if(ptrs.size===1){
  if(stick&&stick.id===e.pointerId){stick.x=e.clientX;stick.y=e.clientY;return}
  if(downInfo&&downInfo.id===e.pointerId){
   downInfo.moved+=Math.abs(dx)+Math.abs(dy);
   const held=performance.now()-downInfo.t;
   // held press becomes the walking stick; a fast long drag is a slash-in-waiting
   if(!stick&&held>=STICK_PROMOTE&&!inDialog&&!cine){
    stick={id:e.pointerId,ox:downInfo.x,oy:downInfo.y,x:e.clientX,y:e.clientY};
   }
  }
 }else if(ptrs.size===2){
  const a=[...ptrs.values()];
  const d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
  if(pinchD>0)cam.z=clamp(cam.z*(d/pinchD),0.6,3.2);
  pinchD=d;
 }
});
function endPtr(e){
 ptrs.delete(e.pointerId);
 if(ptrs.size<2)pinchD=0;
 if(stick&&stick.id===e.pointerId){stick=null;downInfo=null;return}
 if(downInfo&&downInfo.id===e.pointerId){
  const dt=performance.now()-downInfo.t;
  const dx=e.clientX-downInfo.x,dy=e.clientY-downInfo.y;
  if(inDialog){advanceTalk()}
  else if(dt<=SWIPE_MAX_MS&&Math.hypot(dx,dy)>=SWIPE_MIN_DIST&&!cine)heroSlash(Math.atan2(dy,dx));
  else if(downInfo.moved<10&&dt<420)tapAt(e.clientX,e.clientY);
  downInfo=null;
 }
}
cv.addEventListener('pointerup',endPtr);
cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('wheel',e=>{e.preventDefault();cam.z=clamp(cam.z*(e.deltaY<0?1.1:0.9),0.6,3.2)},{passive:false});
/* ---- Sage action controls: dash button/key + charged-spin button/key ---- */
function currentMoveAng(){ if(stick){const dx=stick.x-stick.ox,dy=stick.y-stick.oy;if(Math.hypot(dx,dy)>6)return Math.atan2(dy,dx);} return hero.face||0; }
function beginCharge(){ if(hero.down||interior||inDialog)return; charging=true; chargeT=0; const s=$('sSpinBtn');if(s)s.classList.add('charging'); }
function releaseCharge(){ if(!charging)return; charging=false; const s=$('sSpinBtn');if(s)s.classList.remove('charging'); heroSpin(clamp(chargeT/1.1,0,1)); }
{
 const dash=$('sDashBtn'), spin=$('sSpinBtn');
 if(dash)dash.addEventListener('pointerdown',e=>{e.preventDefault();heroDashDo(currentMoveAng());});
 if(spin){
  spin.addEventListener('pointerdown',e=>{e.preventDefault();beginCharge();});
  spin.addEventListener('pointerup',e=>{e.preventDefault();releaseCharge();});
  spin.addEventListener('pointercancel',releaseCharge);
  spin.addEventListener('pointerleave',releaseCharge);
 }
}
window.addEventListener('keydown',e=>{
 if(interior||inDialog||hero.down)return;
 if(e.key===' '||e.key==='Shift'){heroDashDo(currentMoveAng());}
 else if((e.key==='e'||e.key==='E')&&!charging){beginCharge();}
});
window.addEventListener('keyup',e=>{ if((e.key==='e'||e.key==='E'))releaseCharge(); });
function tapAt(sx,sy){
 if(interior){
  // tapping a resident inside just gives a little flavour
  const wx=cam.x+(sx-cw/2)/cam.z,wy=cam.y+(sy-ch/2)/cam.z;
  for(const o of interior.occupants)if(dist2(wx,wy,o.x,o.y)<12*12){toast(o.name+' is home, and glad of the company.');return}
  return;
 }
 const wx=cam.x+(sx-cw/2)/cam.z,wy=cam.y+(sy-ch/2)/cam.z;
 // tapping the pedlar's stall (while standing near it) makes the trade
 if(merchant&&merchant.state==='stalled'&&dist2(wx,wy,merchant.x,merchant.y)<(1.6*TILE)**2
    &&dist2(hero.x,hero.y,merchant.x,merchant.y)<(3*TILE)**2){ merchantBuy(); return; }
 let best=null,bd=1e18;
 for(const p of people){
  if(p.inDungeon)continue;
  const psx=(p.x-cam.x)*cam.z+cw/2,psy=(p.y-8-cam.y)*cam.z+ch/2;
  const d=dist2(sx,sy,psx,psy);
  if(d<bd&&d<32*32){bd=d;best=p}
 }
 if(best){if(cine)focusCine(best);else selectPerson(best);return}
 let bm=null,bmd=1e18;
 for(const m of monsters){
  const msx=(m.x-cam.x)*cam.z+cw/2,msy=(m.y-6-cam.y)*cam.z+ch/2;
  const d=dist2(sx,sy,msx,msy);
  if(d<bmd&&d<30*30){bmd=d;bm=m}
 }
 if(bm){if(!cine)inspectMonster(bm);return}
 let ba=null,bad=1e18;
 for(const a of animals){
  const asx=(a.x-cam.x)*cam.z+cw/2,asy=(a.y-6-cam.y)*cam.z+ch/2;
  const d=dist2(sx,sy,asx,asy);
  if(d<bad&&d<28*28){bad=d;ba=a}
 }
 if(ba){if(!cine)inspectAnimal(ba);return}
 if(cine)return;
 const tx=(wx/TILE)|0,ty=(wy/TILE)|0;
 if(!inB(tx,ty)){closeInspect();return}
 for(const v of villages){
  const vsx=(v.cx*TILE-cam.x)*cam.z+cw/2,vsy=(v.cy*TILE-16-cam.y)*cam.z+ch/2;
  if(dist2(sx,sy,vsx,vsy)<26*26){inspectVillage(v);return}
 }
 const dun=dungeonAt(tx,ty);
 if(dun){inspectDungeon(dun);return}
 if(bld[idx(tx,ty)]>=0){
  const b=buildings[bld[idx(tx,ty)]];
  if(b&&!b.gone){
   if(b.tp==='grave'&&b.ref){const p=allById.get(b.ref);if(p){selectPerson(p);return}}
   inspectBuilding(b);return;
  }
 }
 const nd=nodeAt.get(idx(tx,ty));
 if(nd){inspectNode(nd);return}
 if(selected){selected=null;$('charPanel').classList.add('hidden')}
 inspectTile(tx,ty);
}

/* ---- inspect panel ---- */
function showInspect(glyph,title,sub,rows,body){
 $('charPanel').classList.add('hidden');$('logPanel').classList.add('hidden');
 $('iGlyph').textContent=glyph;
 $('iTitle').textContent=title;
 $('iSub').textContent=sub||'';
 const bd=$('iBody');bd.innerHTML='';
 if(rows&&rows.length){
  for(const[k,v,onclick]of rows){
   const r=document.createElement('div');r.className='irow';
   const kk=document.createElement('span');kk.className='k';kk.textContent=k;
   const vv=document.createElement('span');vv.className='v'+(onclick?' iname':'');vv.textContent=v;
   if(onclick)vv.onclick=onclick;
   r.appendChild(kk);r.appendChild(vv);bd.appendChild(r);
  }
 }
 if(body){const p=document.createElement('div');p.style.marginTop='9px';p.style.fontStyle='italic';p.style.opacity='.9';p.textContent=body;bd.appendChild(p)}
 $('inspect').classList.remove('hidden');
}
function closeInspect(){$('inspect').classList.add('hidden')}
function nameLink(p){return[p.name,()=>selectPerson(p)]}
function inspectBuilding(b){
 lastInspect={type:'building',obj:b};
 if(b.tp==='grave'){
  showInspect('🪦','A quiet mound','someone the garden took back',[],'A small white flower grows here, watered by somebody. Their name is worn away, but the garden remembers everything it eats.');
  return;
 }
 const owners=b.owners.map(id=>allById.get(id)).filter(o=>o&&!o.dead);
 if(b.tp==='biz'){
  const keeper=allById.get(b.builder);
  const rows=[['Kind',b.sub[2].replace(/^a[n]? /,'')],['Proprietor',keeper&&!keeper.dead?keeper.name:'shuttered'],['Patrons served',String(b.prosperity)],['Status',b.prosperity>30?'the talk of the garden':b.prosperity>8?'doing well':'finding its feet']];
  const kr=keeper&&!keeper.dead?nameLink(keeper):null;
  if(kr)rows[1]=['Proprietor',kr[0],kr[1]];
  showInspect(b.sub[1],b.name,b.sub[2],rows,'Lamplight spills from the doorway. Someone is always here, trading news for warmth.');
  return;
 }
 const tp=b.tp==='home'?'A cottage':'A lean-to';
 const rows=[];
 if(owners.length)rows.push(['Home to',owners.map(o=>o.name).join(' & '),owners.length===1?nameLink(owners[0])[1]:null]);
 else rows.push(['Occupied by','no one — empty']);
 if(b.stock)rows.push(['Pantry','🍇'+b.stock.food+' 🪵'+b.stock.wood+' 🪨'+b.stock.stone]);
 const bld2=allById.get(b.builder);
 if(bld2)rows.push(['Raised by',bld2.name+(bld2.dead?' (departed)':''),bld2.dead?null:nameLink(bld2)[1]]);
 showInspect(b.tp==='home'?'🏠':'⛺',tp,owners.length?'':'vacant — a newcomer could claim it',rows,b.tp==='home'?'A door that shuts and a kettle that sings. Small certainties against a very large question.':'Woven cane and patched broadleaves. It keeps the worst of the weather out.');
}
const STAT_LABEL={work:'diligence',luck:'fortune',charm:'charm',social:'warmth',speed:'quickness',fert:'fertility',romance:'ardour'};
function fertWord(f){ return f<0.2?'barren':f<0.4?'poor':f<0.6?'workable':f<0.8?'rich':'black loam'; }
function inspectNode(n){
 lastInspect={type:'node',obj:n};
 const sp=speciesOf(n);
 if(sp){
  const f=fertAt(n.x,n.y);
  const rows=[
   ['Species',sp.name+(sp.weed?' (a weed)':'')],
   ['Yields',sp.wood?'🪵 cane':'🍇 '+sp.yield+' food'],
   ['Virtue',sp.boost?('+'+sp.boost.v.toFixed(2)+' '+(STAT_LABEL[sp.boost.stat]||sp.boost.stat)+' to whoever tends it'):'none — just '+(sp.wood?'timber':sp.weed?'a nuisance':'food')],
   ['Soil here',fertWord(f)+' ('+Math.round(f*100)+'% fertile)'],
   ['Thrives in',fertWord(sp.fertNeed)+' soil'+(sp.hardy>0.6?', and endures worse':'')],
   ['Remaining',n.amt+' / '+n.max+(n.amt<=0?' (picked clean)':'')],
  ];
  const body=sp.weed?'A hardy, useless thing — good for nothing but crowding out better plants. The villagers pull it where they find it.'
   :sp.boost?'Tending it leaves a little of its virtue in the hands — the town prizes such plants and will sow them by the field.'
   :'Honest food, nothing more. The kind of plant a hungry village keeps close.';
  showInspect(sp.glyph,sp.name,(sp.weed?'a weed':sp.boost?'a boon-plant':sp.wood?'timber':'food-plant'),rows,body);
  return;
 }
 const info={berry:['🍇','A thoughtfruit tangle','sweet, faintly opinionated fruit'],mush:['🍄','A philosophercap cluster','pale mushrooms that hum when it rains'],tree:['🌳','A whistling cane','tall hollow stalks — timber and song'],rock:['🪨','An old hillbone','loose stone, waiting to be worked']}[n.t];
 const rows=[['Yields',n.yield==='food'?'🍇 food':n.yield==='wood'?'🪵 cane':'🪨 stone'],['Remaining',n.amt+' / '+n.max+(n.amt<=0?' (picked clean)':'')],['Regrows',n.amt<n.max?'slowly, in time':'fully grown']];
 showInspect(info[0],info[1],info[2],rows,n.amt<=0?'Picked clean for now. Give it time; the garden is patient with itself.':'A little of the garden’s quiet generosity, here for whoever finds it first.');
}
function inspectDungeon(d){
 lastInspect={type:'dungeon',obj:d};
 const inside=[...d.inside].map(id=>allById.get(id)).filter(Boolean);
 const rows=[
  ['Danger',d.cleansed?'put to rest':dangerWord(d.danger)],
  ['Depth',d.depth+' floors down'],
  ['Folk within',inside.length?inside.map(p=>p.name).join(', '):'none, for now'],
  ['Expeditions',String(d.raids)],
  ['Souls lost',String(d.deaths)],
  ['Relics recovered',String(d.relicsFound)],
  ['Treasure left',d.loot>0.9?'rich':d.loot>0.5?'picked over':'nearly stripped']
 ];
 const icon=d.ruin?'🏚':'🕳';
 const body=d.ruin
  ?(d.cleansed?'The ruins are quiet now — the old town’s bones bleached clean, its last threat put down. Only the wind keeps house here.':'The dead town’s streets are choked with vine and rubble, and its lost treasure still waits in the deep rooms — guarded now by whatever crawled in after the people left. Walk close and the Sage may RAID it.')
  :(d.cleansed?'The mouth breathes evenly now. Whatever argued down there has conceded — for a season, anyway.':'A cold breath rises from the dark, smelling of unfinished arguments. Walk close and the Sage may DESCEND.');
 showInspect(icon,d.name,(d.ruin?'ruined town · ':'')+(d.cleansed?'quiet now':dangerWord(d.danger))+' · '+d.depth+' floors',rows,body);
}
function inspectTile(tx,ty){
 lastInspect=null;
 const i=idx(tx,ty);
 if(farmGrid[i]===1||farmGrid[i]===2){
  const v=villages.find(vv=>dist2(vv.cx,vv.cy,tx,ty)<(vv.rad+4)**2);
  const crop=(farmSp[i]>=0&&floraSpecies)?floraSpecies[farmSp[i]]:null, f=fertAt(tx,ty);
  const rows=[['State',farmGrid[i]===2?'ready to harvest':'growing'],['Soil',fertWord(f)+' ('+Math.round(f*100)+'%)']];
  if(crop){rows.unshift(['Crop',crop.name+(crop.boost?' · +'+(STAT_LABEL[crop.boost.stat]||crop.boost.stat):'')]);}
  showInspect(farmGrid[i]===2?'🌾':'🌱',(farmGrid[i]===2?'A ripe plot of ':'A tilled plot of ')+(crop?crop.name:'crops'),v?'tended by '+v.name:'',rows,crop&&crop.boost?'A monocrop of the village’s prized boon-plant — every harvest tires the soil a little more, so the fields keep creeping outward.':'The village mind combed order into the wild green — rows of one chosen plant, each an agreed-upon fact. Cropping the same soil wears it thin over time.');
  return;
 }
 if(!walkable(tx,ty)){
  const s=struct[i];
  if(s===S_WALL){showInspect('🌿','Hedge-wall','planted against the dark',[],'Quickset hedge, grown dense and deliberate. It funnels the risen things toward the gates, where the brave wait.');return}
  if(s===S_RUIN){showInspect('🏚','Ruins','a home no one tends',[],'Sagging beams and victorious vines. In time even this will be an anecdote of the soil.');return}
  if(s===S_HOUSE){const bi=bld[i];if(bi>=0&&buildings[bi]&&!buildings[bi].gone){inspectBuilding(buildings[bi]);return}}
  showInspect('🌳','The old bramble','dense beyond passing',[],'Growth older than anyone’s grandmother, thinking its slow woody thoughts. It does not move for you.');return;
 }
 showInspect('·','Open meadow','',[],'Soft grass underfoot, faintly warm. Room enough to build a life on — or to lie down and consider the clouds.');
}
function inspectMonster(m){
 lastInspect={type:'monster',obj:m};
 const rows=[['Health',Math.max(0,Math.round(m.hp))+' / '+m.maxhp],['Menace',m.dmg+' harm per strike'],['Rose from',m.home.name],['Hunting',m.target?(m.target.isHero?'the Sage':(!m.target.dead?m.target.name:'nothing yet')):'nothing yet']];
 showInspect(m.g,'A '+m.name,'a thing from the Understory',rows,'It should not be up here in the light. A quick swipe of the finger is a blade — or someone brave will have to put it down.');
}
const ANIMAL_GLYPH={deer:'🦌',rabbit:'🐇',fowl:'🐓',boar:'🐗',fox:'🦊',wolf:'🐺'};
function inspectAnimal(a){
 lastInspect={type:'animal',obj:a};
 const temper={prey:'skittish — flees anything with teeth',neutral:'even-tempered, but it gores what corners it',predator:'a hunter; watch your ankles'}[a.temper];
 const rows=[['Health',Math.max(0,Math.round(a.hp))+' / '+a.maxhp],['Temperament',a.temper],['Bite',a.dmg?a.dmg+' harm':'harmless'],['Doing',a.anim==='attack'?'attacking':a.fleeUntil>simMin?'fleeing':'wandering']];
 showInspect(ANIMAL_GLYPH[a.key]||'🐾',a.name+' the '+a.spec.label,'wild fauna',rows,temper+'. The Animal Forge dreamed it up out of the green.');
}
function inspectVillage(v){
 lastInspect={type:'village',obj:v};
 const members=new Set();
 for(const b of v.homes)for(const id of b.owners){const o=allById.get(id);if(o&&!o.dead)members.add(o)}
 const homes=v.homes.filter(b=>b.tp==='home'||b.tp==='shelter').length;
 const shops=v.homes.filter(b=>b.tp==='biz').length;
 const rows=[
  ['Founded','Day '+v.founded],
  ['Households',String(homes)],
  ['Shops',String(shops)],
  ['Folk',String(members.size)],
  ['Granary','🪨'+v.stock.stone+' 🍇'+v.stock.food],
  ['Ongoing works',v.jobs.length?v.jobs.length+' jobs':'all quiet']
 ];
 showInspect('🏘',v.name,'a village with a mind of its own',rows,'What began as a huddle of cottages now moves as one: hedging out the dark, tilling the loam, tidying the wild into sentences.');
}

/* ================= UI panels ================= */
function chronRow(e){
 const div=document.createElement('div');
 div.className='e'+(e.major?' maj':'');
 div.innerHTML='<span class="d">Day '+e.d+'</span>'+esc(e.text);
 return div;
}
function prependChron(e){
 const list=$('logList');
 list.insertBefore(chronRow(e),list.firstChild);
 while(list.children.length>260)list.removeChild(list.lastChild);
}
function refreshChron(){
 const list=$('logList');list.innerHTML='';
 const start=Math.max(0,chron.length-260);
 for(let i=start;i<chron.length;i++)list.insertBefore(chronRow(chron[i]),list.firstChild);
}
function prependStory(e){
 const list=$('pstory');
 list.insertBefore(chronRow(e),list.firstChild);
 while(list.children.length>200)list.removeChild(list.lastChild);
}
function taskLabel(p){
 if(p.dead)return '🪦 their story has ended';
 if(p.inDungeon){const d=[...dungeons].find(dd=>dd.inside.has(p.id));return '🕳 deep inside '+(d?d.name:'an Understory')}
 if(p.sleeping)return 'sleeping';
 if(!p.task)return 'idling, philosophically';
 switch(p.task.k){
  case 'wander':return p.farUntil>simMin?'roaming the far hedgerows':'wandering';
  case 'gather':return 'gathering '+(p.task.node?(p.task.node.yield==='wood'?'cane':p.task.node.yield):'');
  case 'eat':return 'eating';
  case 'gohome':return p.task.why==='sleep'?'heading home to rest':p.task.why==='eat'?'heading home to eat':'hauling goods home';
  case 'build':return 'building a '+(p.task.b?(p.task.b.tp==='biz'?'shop':p.task.b.tp):'structure');
  case 'chat':return p.courting===(p.task.o&&p.task.o.id)?'courting '+p.task.o.name:'talking with '+(p.task.o?p.task.o.name:'someone');
  case 'gift':return '🎁 bringing '+(p.task.o?p.task.o.name:'someone')+' a gift';
  case 'console':return '🫂 comforting '+(p.task.o?p.task.o.name:'someone');
  case 'mentor':return '📖 teaching '+(p.task.o?p.task.o.name:'a youngster');
  case 'rival':return '😤 sizing up '+(p.task.o?p.task.o.name:'a rival');
  case 'visit':return 'visiting '+(p.task.b?p.task.b.name:'a shop');
  case 'togodungeon':return 'mustering to brave '+(p.task.d?p.task.d.name:'an Understory');
  case 'fight':return '⚔ fighting a '+(p.task.m?p.task.m.name:'monster');
  case 'flee':return '💨 fleeing for their life';
  case 'villagejob':{const j=p.task.j;return j?({wall:'planting the hedge-walls',mine:'clearing old bramble',till:'tilling a farm plot',harvest:'bringing in the harvest'}[j.type]||'working for the village'):'working for the village'}
 }
 return '...';
}
function moodOf(p){
 if(p.dead)return 'at rest';
 if(p.inDungeon)return 'in peril';
 if(p.task&&p.task.k==='fight')return 'battle-fury';
 if(p.fleeUntil>simMin)return 'terrified';
 if(p.hp<35)return 'badly wounded';
 if(p.gloomUntil>simMin)return 'heartsore';
 if(p.hunger>78)return 'hungry';
 if(p.energy<22)return 'weary';
 if(p.courting)return 'lovestruck';
 if(p.socialN>78)return 'lonely';
 if(p.lostUntil>simMin)return 'moonstruck';
 return p.traits.includes('cheerful')?'sunny':p.traits.includes('gloomy')?'brooding':'content';
}
let lastStoryLen=0;
function renderPanelFull(p){
 $('charPanel').classList.remove('hidden');
 $('pname').textContent=(p.dead?'🪦 ':'')+p.name;
 renderPanelLive(p);
 const tr=$('ptraits');tr.innerHTML='';
 for(const t of p.traits){
  const c=document.createElement('span');c.className='chip';c.textContent=TRAITS[t].a;tr.appendChild(c);
 }
 const pc=$('pcards');pc.innerHTML='';
 for(const cd of p.cards){
  const c=document.createElement('span');c.className='chip card';
  const card=TAROT[cd.i];
  c.textContent=card.g+' '+card.n;
  c.onclick=()=>toast(card.g+' '+card.n+' — '+card.line,'card');
  pc.appendChild(c);
 }
 if(!p.cards.length){const c=document.createElement('span');c.className='chip card';c.textContent='no cards yet';pc.appendChild(c)}
 $('pgoal').textContent=p.goal?('✦ Their arc: '+p.goal.t+(p.goal.done?' — fulfilled':'')):'✦ Too young for an arc yet';
 const rb=$('relbox');rb.innerHTML='';
 $('relhead').classList.toggle('hidden',!p.relics.length);
 for(const r of p.relics){
  const div=document.createElement('div');div.className='relic';
  if(r._iconBase){const ic=iconFromBase(r._iconBase,22);ic.className='ricon';div.appendChild(ic);}
  else if(r.id&&TF.byId[r.id]){const ic=relicIcon(r.id,22);ic.className='ricon';div.appendChild(ic);}
  else{const g=document.createElement('span');g.className='g';g.textContent=r.g;div.appendChild(g)}
  const nm=document.createElement('span');nm.className='nm';nm.textContent=r.n;div.appendChild(nm);
  const ef=document.createElement('span');ef.className='ef';
  ef.textContent=(r.skill?r.skill:'')+(r.treasure?' · +'+r.treasure.amt+' '+r.treasure.res+'/day':(r.k?' · +'+Math.round(r.v*100)+'% '+r.k:''));
  div.appendChild(ef);
  div.title=r.d;rb.appendChild(div);
 }
 renderRels(p);
 const st=$('pstory');st.innerHTML='';
 const start=Math.max(0,p.story.length-200);
 for(let i=start;i<p.story.length;i++)st.insertBefore(chronRow(p.story[i]),st.firstChild);
 lastStoryLen=p.story.length;
 // portrait
 const pcv=$('pcv'),pctx=pcv.getContext('2d');
 pctx.clearRect(0,0,64,64);
 pctx.imageSmoothingEnabled=false;
 const pcvf=p.sprite?p.sprite.FRAMES.walk[0][0]:p.portrait;   // the dead keep one portrait frame
 if(pcvf){
  const cvf=pcvf;
  const s=Math.min(58/cvf.width,58/cvf.height);
  const w=cvf.width*s,h=cvf.height*s;
  pctx.drawImage(cvf,(64-w)/2,(64-h)/2,w,h);
 }else{
  pctx.save();pctx.translate(32,50);pctx.scale(3.4,3.4);
  const wasM=p.moving;p.moving=false;
  drawSprite(pctx,p,0);
  p.moving=wasM;
  pctx.restore();
 }
}
function renderPanelLive(p){
 const vil=p.vid?villages.find(v=>v.id===p.vid):null;
 $('pmeta').textContent=Math.floor(p.age)+' summers · '+stageOf(p)+' · '+moodOf(p)+(p.hp<100?' · ❤'+Math.round(p.hp):'')+(vil?' · 🏘 '+vil.name:'')+(p.kills?' · ⚔'+p.kills:'')+' · 🍇'+p.inv.food+' 🪵'+p.inv.wood+' 🪨'+p.inv.stone;
 $('ptask').textContent=taskLabel(p);
}
function renderRels(p){
 const box=$('prels');box.innerHTML='';
 const rels=[];
 for(const id in p.rel){
  const o=allById.get(+id);
  if(!o||!p.rel[id].met)continue;
  rels.push([o,p.rel[id]]);
 }
 rels.sort((a,b)=>Math.abs(b[1].a)-Math.abs(a[1].a));
 let n=0;
 for(const[o,r]of rels){
  if(n++>=8)break;
  const div=document.createElement('div');div.className='rel';
  const nm=document.createElement('span');nm.className='nm';nm.textContent=(o.dead?'🪦 ':'')+o.name;
  nm.onclick=()=>selectPerson(o);
  const st=document.createElement('span');st.className='st';st.textContent=relLabel(p,o);
  div.appendChild(nm);div.appendChild(st);box.appendChild(div);
 }
 if(!n){const div=document.createElement('div');div.className='rel';div.innerHTML='<span style="opacity:.6">no one yet — the garden is big</span>';box.appendChild(div)}
}
function selectPerson(p){
 selected=p;follow=false;
 lastInspect={type:'person',obj:p};
 $('followBtn').style.opacity='1';
 $('logPanel').classList.add('hidden');
 renderPanelFull(p);
}
$('charClose').onclick=()=>{selected=null;follow=false;$('charPanel').classList.add('hidden')};
$('followBtn').onclick=()=>{follow=!follow;$('followBtn').style.opacity=follow?'1':'.55';toast(follow?'Following '+(selected?selected.name:''):'Camera returns to the Sage')};
$('logBtn').onclick=()=>{
 const lp=$('logPanel');
 if(lp.classList.contains('hidden')){refreshChron();lp.classList.remove('hidden');$('charPanel').classList.add('hidden');selected=null}
 else lp.classList.add('hidden');
};
$('logClose').onclick=()=>$('logPanel').classList.add('hidden');
$('questBtn').onclick=()=>{
 const qp=$('questPanel');
 if(qp.classList.contains('hidden')){renderQuests();qp.classList.remove('hidden');$('charPanel').classList.add('hidden');$('logPanel').classList.add('hidden');selected=null}
 else qp.classList.add('hidden');
};
$('questClose').onclick=()=>$('questPanel').classList.add('hidden');
$('qAccept').onclick=e=>{e.stopPropagation();const q=pendingQuest;pendingQuest=null;acceptQuest(q);closeDialog()};
$('qDecline').onclick=e=>{e.stopPropagation();const q=pendingQuest;pendingQuest=null;declineQuest(q);closeDialog()};
$('iClose').onclick=closeInspect;
function setSpeed(idx2){
 speedIdx=idx2;
 document.querySelectorAll('#sui .sp button').forEach(x=>x.classList.toggle('on',+x.dataset.s===idx2));
 document.querySelectorAll('#sui .cspd button').forEach(x=>x.classList.toggle('on',+x.dataset.s===idx2));
}
document.querySelectorAll('#sui .sp button,#sui .cspd button').forEach(b=>{b.onclick=()=>setSpeed(+b.dataset.s)});
$('sTalkBtn').onclick=()=>startTalk(talkTarget);
$('sEnterBtn').onclick=()=>{if(interior)exitInterior();else if(enterTarget)enterInterior(enterTarget)};
$('sDescendBtn').onclick=()=>{if(descendTarget&&onEnterDungeon)onEnterDungeon(descendTarget)};
$('sDialog').onclick=advanceTalk;

/* ---- cinematic mode ---- */
let cineLastStory=-1,cineZoomTarget=2.8,preCineZoom=1.4;
function pickInteresting(){
 if(selected&&!selected.dead)return selected;
 let pool=people.filter(p=>!p.inDungeon&&p.age>=16);
 if(!pool.length)pool=people.slice();
 if(!pool.length)return null;
 const c=pool.filter(p=>p.courting||p.task&&p.task.k==='togodungeon');
 if(c.length)return pick(c);
 return pool.sort((a,b)=>b.story.length-a.story.length)[0];
}
function enterCine(p){
 p=p||pickInteresting();
 if(!p)return;
 selected=p;cine=true;follow=true;cineLastStory=-1;
 preCineZoom=cam.z;cineZoomTarget=2.8;
 $('cine').classList.add('on');
 $('charPanel').classList.add('hidden');$('logPanel').classList.add('hidden');closeInspect();
 $('top').style.display='none';
 setSpeed(speedIdx);
 updateCine();
}
function exitCine(){
 cine=false;follow=false;
 cam.z=preCineZoom;
 $('cine').classList.remove('on');
 $('top').style.display='';
}
function focusCine(p){
 if(!p||p.dead)return;
 selected=p;cineLastStory=-1;updateCine();
}
function cineCycle(dir){
 const alive=people.filter(x=>!x.inDungeon&&!x.dead);
 if(!alive.length)return;
 let i=alive.indexOf(selected);
 i=(i+dir+alive.length)%alive.length;
 if(i<0)i=0;
 focusCine(alive[i]);
}
function updateCine(){
 const p=selected;if(!p)return;
 $('cinName').textContent=(p.dead?'🪦 ':'')+p.name;
 $('cinSub').textContent=Math.floor(p.age)+' summers · '+traitPhrase(p);
 const last=p.story.length-1;
 const beat=last>=0?p.story[last].text:p.name+' has yet to make their mark.';
 const cap=$('cinCap');
 if(last!==cineLastStory){
  cineLastStory=last;
  cap.style.opacity='0';
  cap.textContent=beat;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{cap.style.opacity='1'}));
 }
}
$('cineBtn').onclick=()=>enterCine(selected);
$('cinExit').onclick=exitCine;
$('cinPrev').onclick=()=>cineCycle(-1);
$('cinNext').onclick=()=>cineCycle(1);
let newArm=0;
$('newBtn').onclick=()=>{
 if(performance.now()-newArm<3000){
  reseed();
  newArm=0;
 }else{
  newArm=performance.now();
  toast('Tap ↻ again to let this garden go');
 }
};
function reseed(newSeed,theme,params){
 seed=(newSeed===undefined)?((Math.random()*2**31)|0):newSeed;
 if(theme)worldTheme=theme;
 if(params)worldParams=Object.assign({buildup:0,flora:.5,fertility:.5,fauna:.5,monsters:.5,treasure:.5,hue:-1,sat:-1},params);
 rng=U.mulberry32(seed);
 eraOffset=startEraOffset();      // each world opens in a theme-appropriate age, not always verdant
 genWorld();
 $('charPanel').classList.add('hidden');$('logPanel').classList.add('hidden');closeInspect();
 toast('A new garden dreams itself up… (seed '+seed+')');
}

/* ================= main loop (driven by main.js) ================= */
let last=performance.now(),acc=0,uiT=0;
function frame(t){
 const f0=performance.now();
 const rdt=Math.min(0.1,(t-last)/1000);last=t;
 const sp=SPEEDS[speedIdx];
 if(sp>0){
  acc=Math.min(acc+rdt*sp*RATE,500);
  // time-box the fast-forward catch-up: at 500× a single frame could otherwise
  // run hundreds of sim sub-steps and stall for >100ms. Cap the wall-clock the
  // loop may spend so the frame stays smooth; leftover time is simply dropped
  // (acc is re-capped next frame), so the sim self-throttles to what fits.
  const simDeadline=performance.now()+9;
  while(acc>0){
   const st=Math.min(2,acc);
   stepSim(st);
   acc-=st;
   if(acc>0&&performance.now()>=simDeadline)break;
  }
 }
 processBakeQueue();
 terrainTick();
 updateHero(rdt);
 updateParticles(rdt);
 eventFrameTick(rdt);
 heroFestivalTick(rdt);
 befriendTick(rdt);
 updateMerchant(rdt);
 renownFrameTick(rdt);
 if(cine){
  cam.z+=(cineZoomTarget-cam.z)*0.09;
 }
 draw(t);
 if(t-uiT>(cine?260:450)){
  uiT=t;
  {const sn=seasonNow();$('clock').textContent=sn.glyph+' Day '+cday();}
  $('era').textContent=(surfEra?surfEra.name:phase());
  $('pop').textContent='👥 '+people.length+(animals.length?' · 🐾'+animals.length:'')+(monsters.length?' · 👹'+monsters.length:'')+(heroGold?' · 🪙'+heroGold:'')+(heroGems?' · 💎'+heroGems:'')+(heroStone?' · 🪨'+heroStone:'');
  $('hearts').textContent=speedIdx>=2?'🧘 the Sage meditates':heroHearts()+'  ·  lv '+Hero.level+(Hero.relics.length?'  ·  🔩'+Hero.relics.length:'');
  // stamina bar + action buttons only in surface real-time play
  {const show=!interior&&!cine&&speedIdx<=1&&!hero.down;
   const sw=$('staminaWrap'),sb=$('staminaBar'),acts=$('sActs');
   if(sw){sw.style.display=show?'block':'none';sb.style.width=(heroStam/HERO_STAM_MAX*100).toFixed(0)+'%';sb.style.background=heroStam<28?'#d2694a':'linear-gradient(90deg,#3fae54,#9ae06a)';}
   if(acts)acts.style.display=show?'flex':'none';
   if($('sDashBtn'))$('sDashBtn').disabled=heroStam<28||dashCd>0;
  }
  if(cine&&selected)updateCine();
  if(selected&&!$('charPanel').classList.contains('hidden')){
   renderPanelLive(selected);
   if(selected.story.length!==lastStoryLen){
    const st=$('pstory');
    for(let i=lastStoryLen;i<selected.story.length;i++)prependStory(selected.story[i]);
    lastStoryLen=selected.story.length;
   }
   if(((t/450)|0)%5===0)renderRels(selected);
  }
 }
 adaptRes(performance.now()-f0);
}

/* ================= crossing between worlds ================= */
function returnFromDungeon(results){
 last=performance.now(); // don't let dungeon time count as surface time
 const d=results.dungeon;
 const s=d?nearOpen(d.x,d.y):null;
 if(s){hero.x=s[0]*TILE+TILE/2;hero.y=s[1]*TILE+TILE/2}
 hero.ifr=2;hero.down=false;
 if(Hero.hp<=0)Hero.hp=1;
 const loot=results.loot||{};
 const total=(loot.food||0)+(loot.wood||0)+(loot.stone||0);
 if(total>0){
  const v=nearestVillage({x:hero.x,y:hero.y})||villages[0];
  if(v){v.stock.food+=(loot.food||0);v.stock.stone+=(loot.stone||0);
   tale([],'The Sage climbed out of '+d.name+' and tipped a heavy pack into the '+v.name+' granary — '+(loot.food||0)+' fruit, '+(loot.wood||0)+' cane, '+(loot.stone||0)+' stone.',true);
  }else{
   const homes=buildings.filter(b=>!b.gone&&!b.ruined&&b.done&&b.stock);
   if(homes.length){const b=pick(homes);b.stock.food+=(loot.food||0);b.stock.wood+=(loot.wood||0);b.stock.stone+=(loot.stone||0)}
   tale([],'The Sage climbed out of '+d.name+' with a pack of spoils, and left it on the nearest doorstep.',true);
  }
  toast('🎒 spoils delivered: 🍇'+(loot.food||0)+' 🪵'+(loot.wood||0)+' 🪨'+(loot.stone||0));
 }
 const augs=results.augments||[];
 if(augs.length){
  tale([],'The Sage came up wearing new chrome — '+augs.join(', ')+' — grafted on in the dark and humming under the skin.',true);
  toast('🦾 augments installed: '+augs.length);
 }
 if(results.cleansed&&d&&!d.cleansed){
  d.cleansed=true;d.danger=0.1;
  Hero.cleansed++;Hero.maxHp++;Hero.hp=Hero.maxHp;
  tale([],'⭐ '+d.name+' has been put to rest. The Sage refuted its final argument, and the ground over it grows sweet. The garden will sleep easier.',true);
  toast('⭐ '+d.name+' put to rest · +1 max ♥');
  grantHeroRelic(pick(RELICS));   // the dead root process leaves its best chrome behind
 }else if(results.floors>0&&d){
  d.danger=clamp(d.danger-0.05*results.floors,0.1,0.95);
  d.loot=clamp(d.loot-0.08*results.floors,0.15,1.4);
 }
 if(results.kills)tale([],'Word spreads of the Sage’s work below: '+results.kills+' feral processes killed in the old net.');
}

/* ================= boot & API ================= */
function init(){
 genWorld();
 setTimeout(()=>{const h=$('sHint');if(h)h.style.opacity='0'},9000);
 setTimeout(()=>{const h=$('sHint');if(h&&h.parentNode)h.parentNode.removeChild(h)},11000);
}
return {
 init,frame,
 set onEnterDungeon(fn){onEnterDungeon=fn},
 returnFromDungeon,
 // ---- editor / debug API ----
 api:{
  reseed,
  get seed(){return seed},
  get peaceful(){return peaceful},
  set peaceful(v){peaceful=v;if(v){for(let i=monsters.length-1;i>=0;i--)killMonster(monsters[i],null,true);toast('The garden holds its breath. Peace.')}else toast('The Understories may stir again.')},
  get lastInspect(){return lastInspect},
  get selected(){return selected},
  get hero(){return hero},
  people:()=>people,monsters:()=>monsters,villages:()=>villages,dungeons:()=>dungeons,nodes:()=>nodes,buildings:()=>buildings,animals:()=>animals,flyers:()=>flyers,
  floraSpecies:()=>floraSpecies, fertAt:(x,y)=>fertAt(x,y),
  get interior(){return interior},
  toast,tale,
  spawnSettler:()=>arrive(),
  landExpedition:()=>{foundingExpedition();toast('A founding expedition arrives over the hills.')},
  collapseTown:()=>{
   // hasten the end: doom the current folk so the town falls to ruin
   const folk=people.filter(p=>!p.dead);
   for(const p of folk)die(p,'age');
   toast(folk.length?'A quiet ending settles over the town…':'No one left to fall.');
  },
  spawnMonster:(type)=>{
   const live=dungeons.filter(d=>!d.cleansed);
   const d=live.length?pick(live):(dungeons.length?pick(dungeons):null);
   if(!d)return null;
   const wasPeace=peaceful;peaceful=false;
   const M=MONSTERS[type]?type:'grub';
   const before=monsters.length;
   // force-spawn of the requested type
   const s=nearOpen(d.x,d.y);
   if(s&&monsters.length<24){
    const MM=MONSTERS[M];
    const m={id:nextId++,type:M,x:s[0]*TILE+TILE/2,y:s[1]*TILE+TILE/2,fx:1,dirIdx:0,animClock:R()*4,
     hp:MM.hp,maxhp:MM.hp,dmg:MM.dmg,spd:MM.spd,col:MM.col,g:MM.g,name:MM.n,
     home:d,target:null,path:null,pi:0,atkCd:0,roamT:0,em:null,born:simMin,atkAnim:0};
    monsters.push(m);emote2(m,'❗');
    tale([],'At the gardener’s whim, a '+MM.n+' came up out of '+d.name+'.',true);
   }
   peaceful=wasPeace;
   return monsters.length>before?monsters[monsters.length-1]:null;
  },
  digDungeon:()=>{
   const cand=openTiles.filter(([x,y])=>bld[idx(x,y)]<0&&!nodeAt.has(idx(x,y))&&!dungeonAt(x,y)&&dist2(x*TILE,y*TILE,hero.x,hero.y)>20*TILE*20*TILE);
   if(!cand.length)return null;
   const[x,y]=pick(cand);
   const d=makeDungeon(x,y);
   tale([],'The ground split like a slow thought: a new mouth opens — '+d.name+'.',true);
   return d;
  },
  bloomAll:()=>{for(const n of nodes)n.amt=n.max;toast('Everything ripens at once. Unsettling, but generous.')},
  rerollFlora:()=>{bakeFlora('garden-'+seed+'-'+((Math.random()*1e6)|0));buildTerrainLayer();repaintDynAll();toast('The flora reconsiders its whole aesthetic.')},
  era:()=>eraState(),
  biome:()=>biome,
  season:()=>{const s=seasonNow();return {i:s.i,name:s.name,glyph:s.glyph,fert:s.fert,fauna:s.fauna};},
  dash:(ang)=>heroDashDo(ang==null?hero.face:ang),
  spinStrike:(c)=>heroSpin(c==null?1:c),
  stamina:()=>({v:+heroStam.toFixed(1),max:HERO_STAM_MAX,dashCd:+dashCd.toFixed(2)}),
  merchant:()=>merchant?{name:merchant.name,state:merchant.state,ware:merchant.ware,leaveDay:merchant.leaveDay}:null,
  summonMerchant:()=>{if(!merchant)spawnMerchant();if(merchant){merchant.x=hero.x+TILE;merchant.y=hero.y;merchant.tx=(hero.x/TILE)|0;merchant.ty=(hero.y/TILE)|0;merchant.state='stalled';}return merchant?merchant.name:null},
  merchantBuy:()=>merchantBuy(),
  giveStone:(n)=>{heroStone+=(n||10);return heroStone},
  giveGold:(n)=>{heroGold+=(n||20);return heroGold},
  giveGems:(n)=>{heroGems+=(n||3);return heroGems},
  treasure:()=>({gold:heroGold,gems:heroGems,stone:heroStone,finds:salvage.length,relics:Hero.relics.length}),
  collectNearestFind:()=>{if(!salvage.length)return null;let best=salvage[0],bd=1e18;for(const s of salvage){const d=dist2(s.x,s.y,hero.x,hero.y);if(d<bd){bd=d;best=s}}const kind=best.kind||(best.relic?'relic':'gold');collectFind(best);best.got=true;salvage=salvage.filter(s=>!s.got);return kind;},
  mineTreasureSample:(tiles)=>{ // shatter N mineable tiles and tally what pops out
   let n=tiles||60,out={gold:0,gem:0,relic:0,none:0,mined:0};
   const b4=salvage.slice();
   for(let y=1;y<H-1&&n>0;y++)for(let x=1;x<W-1&&n>0;x++){ if(!mineable(x,y))continue; unearthRock(x,y,{hero:true}); n--; out.mined++; }
   for(const s of salvage){ if(b4.indexOf(s)>=0)continue; const k=s.kind||(s.relic?'relic':'gold'); out[k]=(out[k]||0)+1; }
   return out;
  },
  shrines:()=>shrines.map(s=>({name:s.name,x:(s.x/TILE)|0,y:(s.y/TILE)|0})),
  raiseShrine:()=>{const v=villages[0];if(!v)return null;shrines.push({vid:v.id,x:hero.x,y:hero.y,t:0,name:v.name});Hero.renown=Math.max(Hero.renown,6);tale([],'🗿 A shrine rises to the Sage.',true);return v.name},
  worldEvent:()=>worldEvent?{kind:worldEvent.kind,name:worldEvent.name}:null,
  forceEvent:(k)=>{startEvent(k);return worldEvent?worldEvent.name:null},
  endEvent:()=>{endEvent();return true},
  eraStats:()=>({green:eraGreen(),salvage:salvage.length,relicTarget:relicTarget(),
    animals:animals.length,animalTarget:animalTarget(),theme:worldTheme,decor:decorList?decorList.length:0,
    nodeFood:nodes.filter(n=>n.yield==='food').reduce((a,n)=>a+n.amt,0)}),
  // ---- Animal Forge ----
  AF,
  animals:()=>animals,
  animalCount:()=>animals.length,
  spawnAnimal:(key)=>spawnAnimal(key),
  forgeAnimal:()=>{const made=AF.make(null,'forge-'+((Math.random()*1e9)|0));made._preview=AF.bake(made.params,48,['walk']);return made},
  spawnAnimalMade:(made)=>made&&made.flyer?spawnFlyer(made.kind,made):spawnAnimal(made&&made.key,made),
  populateFauna:()=>{const at=animalTarget();let n=0;while(animals.length<at&&n++<40)if(!spawnAnimal())break;toast('The green fills with life.')},
  carrionCount:()=>carrion.length,
  spawnCarrion:()=>{const s=randOpenTile();carrion.push({x:s[0]*TILE+TILE/2,y:s[1]*TILE+TILE/2,amt:3,until:simMin+3*DAY,t:0});return carrion.length},
  companion:()=>companion?{name:companion.name,label:companion.spec&&companion.spec.label,tame:!!companion.tame}:null,
  tameNearest:()=>{let best=null,bd=1e18;for(const a of animals){if(a.dead||a.tame)continue;const d=dist2(a.x,a.y,hero.x,hero.y);if(d<bd){bd=d;best=a}}return best?tameAnimal(best):null},
  forgeFlyer:()=>{const made=AF.makeFlyer(null,'forge-'+((Math.random()*1e9)|0));made._preview=AF.bakeFlyer(made.params,48);return made},
  releaseFlock:()=>{spawnFlock();toast('A flock takes to the wing.')},
  populateFlyers:()=>{const ft=flyerTarget();let g=0;while(flyers.length<ft&&g++<50){if(chance(.4))spawnFlock();else spawnFlyer()}toast('The skies fill with wings.')},
  tileStyle:()=>({name:surfEra&&surfEra.style,edge:surfEra&&surfEra.edge}),
  advanceEra:()=>{eraOffset+=ERA_SEG_DAYS;surfEra=eraState();const es=surfEra;toast('The age turns → '+es.name+' — the waste blooms from the villages.')},
  rerollTiles:()=>{tileSalt=(Math.random()*1e6)|0;buildTerrainLayer();repaintDynAll();toast('The ground reconsiders its texture. ('+surfStyle.name+' · '+surfStyle.edge+' edge)')},
  rerollFolk:()=>{for(const p of people){p.lookSeed='folk-'+p.id+'-'+((Math.random()*1e9)|0);queuePersonBake(p)}toast('Everyone wakes up feeling like someone slightly else.')},
  rerollHero:()=>{Hero.lookSeed='sage-'+((Math.random()*1e9)|0);queueHeroBake();toast('The Sage is reborn mid-stride.')},
  rerollMonsters:()=>{queueMonsterBakes();toast('The things below molt into new shapes.')},
  // per-entity edits
  renamePerson:(p,nm)=>{if(!nm)return;p.name=nm;if(selected===p)renderPanelFull(p);toast('So named: '+nm)},
  rerollTraits:(p)=>{
   for(const t of p.traits)applyTrait(p,t,-1);
   const t1=pick(TKEYS);let t2=pick(TKEYS);while(t2===t1)t2=pick(TKEYS);
   p.traits=[t1,t2];
   for(const t of p.traits)applyTrait(p,t,1);
   tale([p],'A green wind passed through '+p.name+', and they emerged '+traitPhrase(p)+'.',true);
   if(selected===p)renderPanelFull(p);
  },
  healPerson:(p)=>{p.hp=100;p.hunger=0;p.energy=100;p.gloomUntil=0;emote(p,'✨');toast(p.name+' is made whole.')},
  killPerson:(p)=>die(p,'edited'),
  graveBlooms:()=>graveBlooms,
  groundRGB:(x,y)=>{if(!tctx)return null;const d=tctx.getImageData(x*TILE+TILE/2,y*TILE+TILE/2,1,1).data;return[d[0],d[1],d[2]]},
  graves:()=>buildings.filter(b=>b.tp==='grave'&&!b.gone),
  blossomGraves:()=>{let n=0;for(const b of buildings)if(b.tp==='grave'&&!b.gone){bloomGrave(b);n++}if(n)toast('The cemeteries turn to meadow — '+n+' graves given back as flowers.');return n},
  tileState:(x,y)=>({map:map[idx(x,y)],struct:struct[idx(x,y)],rock:map[idx(x,y)]!==0&&struct[idx(x,y)]===S_ROCK}),
  carveAt:(x,y)=>{if(walkable(x,y))return false;carveFloor(x,y);return true},
  mineAt:(x,y,power)=>mineTile(x,y,power||999,{hero:true}),
  governance:()=>villages.map(v=>{const l=allById.get(v.leader);return{name:v.name,gov:v.gov,leader:l?l.name:null,leadTraits:l?l.traits:null,members:villageMembers(v).length,unrest:+(v.unrest||0).toFixed(2),gates:v.gates?v.gates.size:0,wallDone:!!v.wallDone};}),
  forceCouncil:()=>{for(const v of villages)holdCouncil(v);return villages.length},
  forceSchism:()=>{for(const v of villages){const m=villageMembers(v);if(m.length>=6){const lead=allById.get(v.leader);const diss=m.filter(p=>p!==lead).sort((a,b)=>leadership(b)-leadership(a));if(diss.length>=3){schism(v,diss[0],diss);return v.name}}}return null},
  camps:()=>camps.map(c=>{const mem=campMembers(c);const l=mem.find(m=>m.id===c.leader);return{name:c.name,x:c.tx,y:c.ty,members:mem.length,leader:l?l.name:null,raiding:mem.some(m=>m.raid),age:+((simMin-c.founded)/DAY).toFixed(1)};}),
  forceCamp:()=>{const free=monsters.filter(m=>!m.camp);if(free.length<1)return null;const camp=foundCamp(free[0]);if(!camp)return null;for(const m of free.slice(1,4))joinCamp(m,camp);return camp.name},
  get renown(){return Hero.renown||0},
  quests:()=>quests.map(q=>({id:q.id,title:q.title,kind:q.kind,goal:q.goal,giver:q.giverName,target:q.targetName||null,progress:q.progress,need:q.need,mark:q.mark||null,tracked:q.id===trackedQuest})),
  get tracked(){return trackedQuest},
  trackQuest:(id)=>{trackQuest(id);return trackedQuest},
  trackIndex:(i)=>{if(quests[i]){trackQuest(quests[i].id);return quests[i].title}return null},
  objective:()=>{const q=trackedQuestObj();const o=q?questObjective(q):null;return o?{tx:(o[0]/TILE)|0,ty:(o[1]/TILE)|0,kind:q.kind}:null},
  socialStats:()=>Object.assign({},socialLog),
  settlement:()=>{const counts={};for(const b of buildings){if(b.gone)continue;const k=b.ruined?b.tp+'(ruin)':b.tp;counts[k]=(counts[k]||0)+1;}return {villages:villages.map(v=>({name:v.name,members:villageMembers(v).length,dev:villageDev(v)})),buildings:counts};},
  forceFestival:()=>{const v=villages.find(x=>x.homes&&x.homes.length)||villages[0];if(!v)return null;v.lastFest=0;v.festival={id:nextId++,endDay:cday()+1,cx:v.cx,cy:v.cy};tale([],'🎉 '+v.name+' throws a festival.',true);gatherFestival(v,.9);return v.name},
  festivals:()=>villages.filter(v=>v.festival).map(v=>({name:v.name,revellers:people.filter(p=>p.task&&p.task.k==='festival').length})),
  terrain:()=>{ if(!terTier)return null; let open=0,weak=0,hard=0,lush=0,barren=0; for(let i=0;i<W*H;i++){ if(map[i]===0){open++; if(fert&&fert[i]>=0.46)lush++; else barren++;} else if(terTier[i]===2)hard++; else weak++;} let emn=1,emx=0; if(elevF)for(let i=0;i<W*H;i++){if(elevF[i]<emn)emn=elevF[i];if(elevF[i]>emx)emx=elevF[i];} return {W,H,open,weak,hard,lush,barren,solidPct:+((weak+hard)/(W*H)*100).toFixed(1),elevMin:+emn.toFixed(3),elevMax:+emx.toFixed(3),blooms:graveBlooms.length}; },
  forceSocialAct:(kind)=>{
   const a=people.filter(x=>!x.dead&&!x.inDungeon);
   if(a.length<2)return null;
   let p=a.find(x=>x.age>=16)||a[0];
   let o=a.find(x=>x!==p&&x.age>=6);if(!o)return null;
   relOf(p,o).met=true;relOf(o,p).met=true;relOf(p,o).a=40;relOf(o,p).a=40;
   if(kind==='gift'){p.inv.food=8;giveGift(p,o)}
   else if(kind==='console'){o.gloomUntil=simMin+6*DAY;doConsole(p,o)}
   else if(kind==='mentor'){o=a.find(x=>x!==p&&(stageOf(x)==='kid'||stageOf(x)==='youth'))||o;relOf(p,o).met=true;doMentor(p,o)}
   else if(kind==='rival'){doRival(p,o)}
   else if(kind==='gossip'){const third=a.find(x=>x!==p&&x!==o);if(!third)return null;relOf(p,third).met=true;relOf(p,third).a=70;relOf(o,third).met=true;interactGossip(p,o)}
   else return null;
   return {p:p.name,o:o.name,stats:Object.assign({},socialLog)};
  },
  offerQuest:(name)=>{const p=name?people.find(x=>!x.dead&&x.name===name):people.find(questGiverEligible);if(!p)return null;if(p.age>=16&&(!p.goal||p.goal.done)){p.goal=pickGoal(p)}p.lastQuest=0;p.questId=null;const q=buildQuest(p);if(!q)return null;acceptQuest(q);return {title:q.title,kind:q.kind,giver:q.giverName,target:q.targetName||null,mark:q.mark||null};},
  completeQuestNow:()=>{if(!quests.length)return null;const q=quests[0];if(q.kind==='gather')heroStone=q.base+q.need;else if(q.kind==='slay')q.progress=q.need;else if(q.mark){hero.x=q.mark[0]*TILE+TILE/2;hero.y=q.mark[1]*TILE+TILE/2}const before=Hero.renown||0;updateQuests(0.1);return {renown:Hero.renown||0,advanced:(Hero.renown||0)>before,title:q.title};},
  get heroStone(){return heroStone},
  get particleCount(){return particles.length},
  carvePatch:(x,y,r)=>{let n=0;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const nx=x+dx,ny=y+dy;if(nx<1||ny<1||nx>=W-1||ny>=H-1)continue;const i=idx(nx,ny);if(map[i]!==0&&struct[i]===S_ROCK){carveFloor(nx,ny);n++}}return n},
  weather:()=>{let wet=0;if(wetUntil)for(let i=0;i<W*H;i++)if(wetUntil[i]>simMin)wet++;return {humidity:+humidity.toFixed(2),wetness:+wetness.toFixed(3),clouds:clouds.length,raining:clouds.filter(c=>c.rain>0.1).length,wetTiles:wet,wind:[+windX.toFixed(2),+windY.toFixed(2)],waterFrac:+waterFrac.toFixed(3),worldWet:+worldWet.toFixed(2)}},
  setWetness:(v)=>{wetness=clamp(+v,0,1.15);recomputeWater(true);return waterFrac},
  drought:()=>{wetness=0.05;recomputeWater(true);toast('A long drought sets in — the waters draw back.');return waterFrac},
  deluge:()=>{wetness=1.1;recomputeWater(true);toast('The rains return in force — the lakes brim over.');return waterFrac},
  waterTiles:()=>{let lake=0,stream=0;if(water)for(let i=0;i<W*H;i++){if(water[i]===2)lake++;else if(water[i]===1)stream++;}return{lake,stream,muted:!WATER_ON}},
  isWater:(x,y)=>isWater(x,y),
  makeStorm:()=>{spawnCloud(1.25);spawnCloud(1.1);toast('Clouds gather over the world — rain is coming.');return clouds.length},
  dealCard:(p)=>drawCard(p,'The gardener’s thumb turned a card, and it'),
  rerollLook:(p)=>{p.lookSeed='folk-'+p.id+'-'+((Math.random()*1e9)|0);queuePersonBake(p);toast(p.name+' looks in the pond and sees a stranger. They adapt.')},
  banishMonster:(m)=>{killMonster(m,null,true);toast('Unsaid.')},
  empowerMonster:(m)=>{m.hp=m.maxhp=Math.round(m.maxhp*1.8);m.dmg=Math.round(m.dmg*1.5);emote2(m,'💢');toast('It grows worse.')},
  cleanseDungeon:(d)=>{d.cleansed=!d.cleansed;if(d.cleansed){d.danger=0.1;toast(d.name+' is hushed.')}else{d.danger=rf(.3,.6);toast(d.name+' clears its throat.')}},
  deepenDungeon:(d)=>{d.depth+=1;d.danger=clamp(d.danger+0.12,0,.95);d.loot=clamp(d.loot+0.25,0,1.4);toast(d.name+' grows a new floor, and new appetite.')},
  stirDungeon:(d)=>{const wasP=peaceful;peaceful=false;const m=spawnMonster(d);peaceful=wasP;return m},
  demolishBuilding:(b)=>{demolish(b);toast('Unbuilt.')},
  replenishNode:(n)=>{n.amt=n.max;toast('Ripe again, ahead of schedule.')},
  fundVillage:(v)=>{v.stock.stone+=12;v.stock.food+=12;toast(v.name+' finds its granary mysteriously fuller.')},
  // ---- Tech Forge relics ----
  TF,                                     // the generator itself
  heroRelics:()=>Hero.relics,
  forgeRelic,                             // generate a fresh look+payload relic
  giveHeroRelic:(rel)=>grantHeroRelic(rel),
  givePersonRelic:(p,rel)=>{
   if(!p||p.dead)return;
   giveRelic(p,rel);
   tale([p],p.name+' installed '+rel.n+' — the '+rel.skill+' skill.'+(rel.treasure?' It hums, and starts producing '+rel.treasure.res+'.':''),true);
   if(selected===p)renderPanelFull(p);
   toast('🔩 '+rel.n+' → '+p.name);
  },
  scatterSalvage:()=>{spawnSalvage();toast('Fresh salvage glints somewhere out in the grass.')},
  setSpeed,
 }
};
})();
