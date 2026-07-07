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
const COST={shelter:{wood:5},home:{wood:10,stone:6},biz:{wood:12,stone:8}};
const NEED={shelter:50,home:130,biz:150};
const SZ={shelter:[1,1],home:[2,2],biz:[2,2],grave:[1,1]};
const RUIN_DELAY=6*DAY,CRUMBLE_DELAY=10*DAY;
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
let struct,farmGrid,farmTimer;
let farmTiles=new Set();
let region,regionsDirty=true;
let people=[],allById=new Map(),buildings=[];
let dungeons=[],expeditions=[],monsters=[],villages=[];
let simMin=0,dayMark=1,speedIdx=1,nextId=1;
let cam={x:W*TILE/2,y:H*TILE/2,z:1.4};
let selected=null,follow=false,cine=false;
let chron=[];
let terrainDirty=true,modTiles=new Set();
let peaceful=false;               // editor toggle: the garden holds its breath
let lastInspect=null;             // {type,obj} — what the editor may rewrite
let onEnterDungeon=null;          // set by main.js
let inDialog=false;
const idx=(x,y)=>y*W+x;
const inB=(x,y)=>x>=0&&y>=0&&x<W&&y<H;
const walkable=(x,y)=>inB(x,y)&&map[idx(x,y)]===0;
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
const HERO_SPEED=132, HERO_RANGE=56, HERO_ARC=Math.PI*0.85;

/* ================= terrain editing ================= */
function markMod(i){modTiles.add(i);terrainDirty=true;regionsDirty=true}
function setSolid(x,y,type){const i=idx(x,y);map[i]=1;struct[i]=type;farmGrid[i]=0;markMod(i)}
function carveFloor(x,y){const i=idx(x,y);map[i]=0;struct[i]=S_FLOOR;markMod(i)}
function revertTile(x,y){const i=idx(x,y);map[i]=0;struct[i]=S_ROCK;farmGrid[i]=0;markMod(i)}
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
function makeName(){let tries=0;while(tries++<80){const n=pick(NAMES);if(!usedNames.has(n)){usedNames.add(n);return n}}const n=pick(NAMES)+' '+pick(['II','III','the Younger','the Second']);usedNames.add(n);return n}

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
 stubborn:{a:'stubborn',social:-.1}
};
const TKEYS=Object.keys(TRAITS);
const MODKEYS=['luck','social','work','romance','charm'];
const CLASH=[['grumpy','cheerful'],['ambitious','lazy'],['timid','brave'],['gloomy','cheerful'],['jealous','charming'],['awkward','charming'],['stubborn','stubborn'],['grumpy','dreamer']];
const KIN=[['creative','dreamer'],['kind','loyal'],['ambitious','hardworking'],['curious','brave'],['cheerful','kind'],['passionate','creative'],['gloomy','gloomy'],['curious','dreamer']];
const GOALS={
 love:{t:'to find true love'},
 family:{t:'to raise a small loud houseful'},
 craft:{t:'to open a beloved little shop'},
 wander:{t:'to stand in every corner of the garden'},
 fellows:{t:'to be rich in friendships'},
 quiet:{t:'to grow old beside a warm kettle'}
};
function pickGoal(p){
 const w=[];
 const has=t=>p.traits.includes(t);
 if(has('passionate')||has('charming')||has('dreamer'))w.push('love','love');
 if(has('kind')||has('loyal'))w.push('family','family');
 if(has('ambitious')||has('creative')||has('hardworking'))w.push('craft','craft');
 if(has('curious')||has('brave'))w.push('wander','wander');
 if(has('cheerful'))w.push('fellows','fellows');
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
 toast(c.g+' '+c.n+' — '+p.name,'card');
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
let flora=null, floraSeed='garden';
function bakeFlora(seedBase){
 floraSeed=seedBase;
 const frng=U.mulberry32(U.hashStr(seedBase)^0xF10A);
 const F={berry:[],mush:[],tree:[],decor:[]};
 for(let v=0;v<3;v++){
  const s=(frng()*1e9)|0;
  F.berry.push([0,1,2].map(st=>PF.bake('bush',{bloomAmount:.9,palette:'meadow'},s,40,0.55+st*0.22)));
  F.mush.push([0,1,2].map(st=>PF.bake('mushroom',{palette:v===2?'cavernGlow':'autumn'},s+7,36,0.55+st*0.22)));
  F.tree.push([0,1,2].map(st=>PF.bake('sapling',{palette:v===1?'meadow':'forest'},s+13,72,0.62+st*0.19)));
 }
 const kinds=['grassTuft','wildflower','fern','vine','wildflower','grassTuft','fern','wildflower'];
 for(let i=0;i<8;i++){
  F.decor.push(PF.bake(kinds[i],{palette:i===3?'duskViolet':'meadow'},(frng()*1e9)|0,24,0.75+frng()*0.25,frng()*6.28));
 }
 flora=F;
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
   job.p.sprite=CFHelp.bakeCreature(params,48,['walk','talk']);
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
  }
 }catch(e){/* a failed bake falls back to the painted sprite */}
}

/* ================= world generation ================= */
function genWorld(){
 map=new Uint8Array(W*H);bld=new Int16Array(W*H).fill(-1);
 struct=new Uint8Array(W*H);farmGrid=new Uint8Array(W*H);farmTimer=new Float32Array(W*H);farmTiles=new Set();
 modTiles=new Set();terrainDirty=true;regionsDirty=true;
 nodeAt=new Map();nodes=[];openTiles=[];
 people=[];allById=new Map();buildings=[];dungeons=[];expeditions=[];monsters=[];villages=[];chron=[];usedNames=new Set();
 simMin=DAY*0.30;dayMark=1;nextId=1;deck=[];selected=null;follow=false;cine=false;pairLog=new Set();usedBiz=new Set();usedDun=new Set();usedVil=new Set();
 lastInspect=null;bakeQueue=[];heroSlashes=[];
 bakeFlora('garden-'+seed);
 queueMonsterBakes();
 // cellular automata: open meadow carved out of the old bramble
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
 // keep largest region
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
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(!map[idx(x,y)])openTiles.push([x,y]);
 openChunks=new Set();
 for(const[x,y]of openTiles)openChunks.add(((x>>3))+','+((y>>3)));
 // resource nodes
 const REG={berry:520,mush:430,tree:950,rock:1500};
 const YLD={berry:'food',mush:'food',tree:'wood',rock:'stone'};
 const AMT={berry:4,mush:3,tree:5,rock:5};
 for(const[x,y]of openTiles){
  let nw=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&!walkable(x+dx,y+dy))nw++;
  let adj=false;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(nodeAt.has(idx(x+dx,y+dy)))adj=true;
  if(adj)continue;
  const r=R();let t=null;
  if(r<0.008+nw*0.003)t='tree';
  else if(r<0.017+nw*0.005)t='berry';
  else if(r<0.024+nw*0.006)t='mush';
  else if(r<0.030+nw*0.004)t='rock';
  if(t){
   const nd={x,y,t,amt:AMT[t],max:AMT[t],reg:REG[t],rt:0,yield:YLD[t]};
   nodes.push(nd);nodeAt.set(idx(x,y),nd);
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
 for(let i=0;i<9;i++)spawnSalvage();
 refreshChron();
}
function spawnSalvage(){
 for(let t=0;t<40;t++){
  const[x,y]=randOpenTile();
  if(bld[idx(x,y)]>=0||nodeAt.has(idx(x,y))||dungeonAt(x,y))continue;
  if(dist2(x*TILE,y*TILE,hero.x,hero.y)<12*TILE*12*TILE)continue;
  salvage.push({x:x*TILE+TILE/2,y:y*TILE+TILE/2,t:R()*6.28,relic:pick(RELICS)});
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
function newPerson({x,y,age,traits,parents}){
 const p={
  id:nextId++,name:makeName(),x,y,fx:1,dirIdx:0,
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
 const hs=buildings.filter(b=>!b.gone&&!b.ruined&&(b.tp==='home'||b.tp==='shelter'||b.tp==='biz'));
 if(hs.length<2)return null;
 let cx=0,cy=0;for(const b of hs){cx+=b.x+b.w/2;cy+=b.y+b.h/2}
 return [Math.round(cx/hs.length),Math.round(cy/hs.length)];
}
function startBuild(p,tp,forP){
 const cost=COST[tp];
 if(!canAfford(p,cost))return false;
 const[w,h]=SZ[tp];
 let anchor=[(p.x/TILE)|0,(p.y/TILE)|0],bounds=null,s=null;
 if(forP&&forP.home){anchor=homeTile(forP.home)}
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
 takeMat(p,cost);
 const b={i:buildings.length,id:nextId++,tp,x:s[0],y:s[1],w,h,prog:0,need:NEED[tp],done:false,gone:false,
  owners:[],builder:p.id,forId:forP?forP.id:null,stock:{food:0,wood:0,stone:0},prosperity:0,sub:null,name:null,ref:null,
  emptySince:0,ruined:false,vid:null};
 if(tp==='biz'){
  b.sub=pick(BIZKINDS);
  let nm='The '+pick(BIZ_ADJ)+' '+pick(BIZ_NOUN),tr=0;
  while(usedBiz.has(nm)&&tr++<15)nm='The '+pick(BIZ_ADJ)+' '+pick(BIZ_NOUN);
  usedBiz.add(nm);b.name=nm;
 }
 buildings.push(b);
 for(let y=b.y;y<b.y+h;y++)for(let x=b.x;x<b.x+w;x++)bld[idx(x,y)]=b.i;
 setTask(p,'build',{b});
 if(forP)tale([p],p.name+' began building a shelter — not for themselves, but for '+forP.name+'.');
 else tale([p],p.name+' started work on a '+(tp==='biz'?'shop':tp)+', hauling '+pick(['bundled cane','lashed stalks','good hillstone','salvaged timber'])+'.');
 return true;
}
function setHome(p,b){
 if(p.home&&p.home!==b){const o=p.home;o.owners=o.owners.filter(id=>id!==p.id)}
 p.home=b;
 if(!b.owners.includes(p.id))b.owners.push(p.id);
}
function solidifyBuilding(b){
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
 b.ruined=true;b.emptySince=simMin;
 for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++)if(bld[idx(x,y)]===b.i)setSolid(x,y,S_RUIN);
 for(const id of b.owners){const p=allById.get(id);if(p&&p.home===b)p.home=null}
 b.owners=[];
 if(b.tp==='biz'){const o=allById.get(b.builder);if(o&&o.business===b)o.business=null}
 const what=b.tp==='biz'?b.name:'a '+b.tp;
 tale([],'With no one to tend it, '+what+' fell to ruin, and the vines moved in without asking.');
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
 const b={i:buildings.length,id:nextId++,tp:'grave',x:s[0],y:s[1],w:1,h:1,prog:1,need:1,done:true,gone:false,owners:[],builder:p.id,forId:null,stock:null,prosperity:0,sub:null,name:null,ref:p.id};
 buildings.push(b);
 bld[idx(s[0],s[1])]=b.i;
}

/* ================= tasks & AI ================= */
function setTask(p,k,data){p.task=Object.assign({k,t0:simMin},data||{});p.path=null;p.pi=0}
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
  if(b.gone||b.ruined||!b.done||b.tp==='biz'||b.tp==='grave'||b.owners.length)continue;
  const[hx,hy]=homeTile(b);
  const d=dist2(p.x,p.y,hx*TILE,hy*TILE);
  if(d<bd){bd=d;best=b}
 }
 if(best){
  setHome(p,best);best.emptySince=0;
  tale([p],p.name+' took up residence in an empty '+best.tp+'. It still smelled of someone else’s tea.');
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
  if(claimVacant(p))return;
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
 if(p.vid){const v=villages.find(vv=>vv.id===p.vid);const keen=v&&!v.wallDone?0.95:0.7;if(chance(keen)){const job=findVillageJob(p);if(job){setTask(p,'villagejob',{v:job.v,j:job.j});return}}}
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
    emote(p,n.yield==='food'?'🍇':n.yield==='wood'?'🪵':'⛏');
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
   if(!t.arr){
    if(!p.path&&!t.pathed){t.pathed=true;const[hx,hy]=homeTile(b);if(!goTo(p,hx,hy)){p.task=null;break}}
    if(moveAlong(p,dt))t.arr=true;else break;
   }
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
   t.h=(t.h||0)+dt;
   if(chance(dt*0.03))emote(p,j.type==='mine'?'⛏':j.type==='wall'?'🌿':j.type==='harvest'?'🌾':'🌱');
   if(t.h>=(j.type==='wall'?6:12)){doVillageJob(p,v,j);p.task=null}
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
  carveFloor(j.x,j.y);v.stock.stone+=2;p.inv.stone++;drop();
  if(chance(.2))tale([p],p.name+' cleared old bramble from the lanes of '+v.name+', hauling out good stone.');
 }else if(j.type==='till'){
  if(!walkable(j.x,j.y)||farmGrid[i]){drop();return}
  farmGrid[i]=1;farmTimer[i]=FARM_RIPEN;farmTiles.add(i);markMod(i);drop();
 }else if(j.type==='harvest'){
  if(farmGrid[i]===2){farmGrid[i]=1;farmTimer[i]=FARM_RIPEN;farmTiles.add(i);markMod(i);
   p.inv.food+=ri(2,4);v.stock.food+=ri(3,6);
   if(chance(.12))tale([p],p.name+' brought in a good harvest from the '+v.name+' plots.');
  }
  drop();
 }
}

/* ================= romance & interaction ================= */
function interact(p,o){
 const r=relOf(p,o),ro=relOf(o,p);
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
 const c=newPerson({x:hx*TILE+TILE/2,y:hy*TILE+TILE/2,age:0,traits,parents:[p.id,o.id]});
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
 if(selected===p)renderPanelFull(p);
}

/* ================= daily tick ================= */
const MUSINGS=['{n} watched a snail cross the path and called it a pilgrimage.','{n} argued with a rosebush and, by all accounts, lost.','{n} buried a word in the seed-rows to see what it grows.','{n} counted the petals of a thoughtfruit blossom: odd again. Troubling.','{n} listened to a beehive and swears it was buffering.','{n} whispered a question to the moss and is still waiting for the reply packet.','{n} found a strand of dead cable in the loam and planted it, hopefully.','{n} practiced being a tree. Reviews were mixed.'];
const AMBIENT=['A warm wind combed the meadow, and every stalk bent the same polite degree.','The philosophercaps pulsed in sync, as if the ground were refreshing.','Far under the hills something old hummed one clean note and went quiet.','All afternoon the garden smelled of green ink, ozone, and beginnings.','A migration of moths crossed the sky, spelling nothing, beautifully.','A dead streetlamp deep in the hedgerow flickered once, for no one, then slept again.'];
function dailyTick(){
 if(chance(.3))tale([],pick(AMBIENT));
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
  if(chance(.08))tale([p],pick(MUSINGS).replace('{n}',p.name));
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
 if(people.length<10&&chance(.4))arrive();
 else if(people.length<26&&chance(.08))arrive();
 // tech relics pay out their treasure trickle to whoever carries them
 for(const p of people){
  if(p.dead)continue;
  for(const r of p.relics)if(r.treasure){
   if(p.home&&!p.home.gone&&p.home.stock)p.home.stock[r.treasure.res]+=r.treasure.amt;
   else p.inv[r.treasure.res]=(p.inv[r.treasure.res]||0)+r.treasure.amt;
  }
 }
 for(const id of Hero.relics){const r=TF.byId[id];if(r&&r.treasure)depositResource(r.treasure.res,r.treasure.amt,hero.x,hero.y)}
 // the garden keeps seeding fresh salvage for the Sage to find
 if(salvage.length<9&&chance(.35))spawnSalvage();
 // the age turns, and the land with it
 eraRebuildCheck();
 if(surfEra&&chance(.05))tale([],pick(surfEra.lines));
 villageTick();
 upkeepTick();
}

/* ================= sim step ================= */
function stepSim(dt){
 simMin+=dt;
 const d=cday();
 if(d!==dayMark){dayMark=d;dailyTick()}
 for(const n of nodes){
  if(n.amt<n.max){n.rt-=dt;if(n.rt<=0){n.amt++;n.rt=n.reg}}
 }
 for(const d of dungeons)if(d.restock&&simMin>=d.restock){d.loot=clamp(d.loot+0.4,0,1.3);d.danger=d.cleansed?d.danger:clamp(d.danger-0.04,.2,.95);d.restock=0}
 processExpeditions();
 updateMonsters(dt);
 ripenAll(dt);
 for(let i=people.length-1;i>=0;i--){
  const p=people[i];
  if(p.dead)continue;
  updatePerson(p,dt);
 }
}
function updatePerson(p,dt){
 if(p.inDungeon){p.age+=dt/(DAY*2);return}
 p.age+=dt/(DAY*2);
 p.hunger=clamp(p.hunger+0.055*dt*(p.age<12?0.7:1),0,100);
 if(p.hp<100){const threatened=monsters.length&&nearestMonster(p,12*TILE);p.hp=clamp(p.hp+(threatened?0:0.05)*dt,0,100)}
 if(p.moving)p.animClock+=dt*0.12;
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
 const preset=pick(TF.PRESET_KEYS),palette=pick(TF.PALETTE_KEYS);
 const params={...TF.PRESETS[preset],palette,size:32,grime:0.2+R()*0.4,seed:'relic-'+((R()*1e9)|0)};
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
function grantHeroRelic(rel){
 if(!rel)return;
 Hero.relics.push(rel.id);
 heroStatApply(rel);
 toast('🔩 '+rel.n+' online — '+rel.skill);
 tale([],'The Sage jacked in '+rel.n+' — the '+rel.skill+' skill. '+rel.d+'.',true);
}
function dangerWord(d){return d<.28?'uneasy':d<.45?'dangerous':d<.62?'deadly':d<.8?'a death-trap':'a legend of ruin'}
function makeDungeon(x,y){
 let nm='The '+pick(DUN_ADJ)+' '+pick(DUN_NOUN),tr=0;
 while(usedDun.has(nm)&&tr++<20)nm='The '+pick(DUN_ADJ)+' '+pick(DUN_NOUN);
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
 const s=nearOpen(d.x,d.y);if(s){const b={i:buildings.length,id:nextId++,tp:'grave',x:s[0],y:s[1],w:1,h:1,prog:1,need:1,done:true,gone:false,owners:[],builder:p.id,forId:null,stock:null,prosperity:0,sub:null,name:null,ref:p.id};buildings.push(b);if(bld[idx(s[0],s[1])]<0)bld[idx(s[0],s[1])]=b.i}
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
function monsterCap(){return Math.min(8,2+((people.length/4)|0))}
function spawnMonster(d){
 if(monsters.length>=monsterCap()||peaceful||(d&&d.cleansed))return;
 const r=R();
 let type='grub';
 if(r<d.danger*0.35)type='horror';
 else if(r<0.25+d.danger*0.4)type='lurker';
 const M=MONSTERS[type];
 const s=nearOpen(d.x,d.y);if(!s)return;
 const m={id:nextId++,type,x:s[0]*TILE+TILE/2,y:s[1]*TILE+TILE/2,fx:1,dirIdx:0,animClock:R()*4,
  hp:M.hp,maxhp:M.hp,dmg:M.dmg,spd:M.spd,col:M.col,g:M.g,name:M.n,
  home:d,target:null,path:null,pi:0,atkCd:0,roamT:0,em:null,born:simMin,atkAnim:0};
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
 const[t,td]=nearestSettler(m.x,m.y,p=>!p.inDungeon);
 m.target=t;
 if(!t){
  if(simMin-m.born>3*DAY){killMonster(m,null,true);return}
  if(!m.path){const rx=clamp(m.home.x+ri(-6,6),1,W-2),ry=clamp(m.home.y+ri(-6,6),1,H-2);monsterMove(m,rx,ry,dt)}
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
 if(selected===p)renderPanelFull(p);
}
function updateMonsters(dt){
 for(let i=monsters.length-1;i>=0;i--)updateMonster(monsters[i],dt);
 if(peaceful)return;
 for(const d of dungeons){
  d.spawnT=(d.spawnT||simMin+rf(2.5,5)*DAY);
  if(simMin>=d.spawnT){
   d.spawnT=simMin+rf(2.8,5.5)*DAY/(0.6+d.danger);
   if(d.cleansed)continue;
   if(people.length>=6&&chance(.5)){
    spawnMonster(d);
    if(chance(.2+d.danger*0.35)){spawnMonster(d)}
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

/* ================= villages (the collective mind) ================= */
const VIL_ADJ=['Verdance','Quiddity','Perhaps','Tenderloam','Bloomgate','Stillwater','Gloamrest','Emberfold','Seedwell','Neon Hollow','Thornhaven','Sempervirens'];
const CLAIM_MARGIN=3,CLAIM_MIN=14,CLAIM_MAX=30,WALL_THICK=2;
function villageName(){let n=pick(VIL_ADJ),tr=0;while(usedVil.has(n)&&tr++<15)n=pick(VIL_ADJ);usedVil.add(n);return n}
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
function fortPlan(cl){
 const walls=new Map(),gates=new Set();
 const mx=Math.round((cl.x0+cl.x1)/2),my=Math.round((cl.y0+cl.y1)/2);
 for(let k=0;k<WALL_THICK;k++){
  gates.add(mx+','+(cl.y0+k));gates.add(mx+','+(cl.y1-k));
  gates.add((cl.x0+k)+','+my);gates.add((cl.x1-k)+','+my);
 }
 for(let k=0;k<WALL_THICK;k++){
  const c={x0:cl.x0+k,y0:cl.y0+k,x1:cl.x1-k,y1:cl.y1-k};
  if(c.x1-c.x0<3||c.y1-c.y0<3)break;
  for(const[x,y]of perimeterTiles(c)){const key=x+','+y;if(!gates.has(key))walls.set(key,[x,y])}
 }
 return {walls,gates};
}
function claimCenter(c){return[Math.round((c.x0+c.x1)/2),Math.round((c.y0+c.y1)/2)]}
function detectVillages(){
 const homes=buildings.filter(b=>!b.gone&&!b.ruined&&b.done&&(b.tp==='home'||b.tp==='biz'||b.tp==='shelter')&&b.owners.some(id=>{const o=allById.get(id);return o&&!o.dead}));
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
  const homeCount=g.filter(b=>b.tp==='home'||b.tp==='shelter').length;
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
  for(const b of g){b.vid=v.id;for(const id of b.owners){const o=allById.get(id);if(o&&!o.dead)o.vid=v.id}}
  live.push(v);
 }
 for(let i=villages.length-1;i>=0;i--)if(!live.includes(villages[i])){
  for(const p of people)if(p.vid===villages[i].id)p.vid=null;
  villages.splice(i,1);
 }
}
function planVillage(v){
 v.jobs=v.jobs.filter(j=>{
  if(j.type==='wall')return walkable(j.x,j.y);
  if(j.type==='mine')return !walkable(j.x,j.y);
  if(j.type==='till')return walkable(j.x,j.y)&&farmGrid[idx(j.x,j.y)]===0;
  if(j.type==='harvest')return farmGrid[idx(j.x,j.y)]===2;
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
 const targetFarms=Math.min(18,v.homes.length+6);
 let farmCount=0;for(let y=cl.y0;y<=cl.y1;y++)for(let x=cl.x0;x<=cl.x1;x++)if(farmGrid[idx(x,y)])farmCount++;
 if(farmCount<targetFarms){
  let added=0;
  const ix0=cl.x0+WALL_THICK+1,iy0=cl.y0+WALL_THICK+1,ix1=cl.x1-WALL_THICK-1,iy1=cl.y1-WALL_THICK-1;
  outer:for(let y=iy0;y<=iy1;y++)for(let x=ix0;x<=ix1;x++){
   const i=idx(x,y);
   if(walkable(x,y)&&farmGrid[i]===0&&bld[i]<0&&!nodeAt.has(i)&&struct[i]!==S_WALL&&!v.jobs.some(j=>j.x===x&&j.y===y)){
    v.jobs.push({type:'till',x,y});if(++added>=6)break outer;
   }
  }
 }
 for(let y=cl.y0;y<=cl.y1;y++)for(let x=cl.x0;x<=cl.x1;x++){
  const i=idx(x,y);
  if(farmGrid[i]===2&&!v.jobs.some(j=>j.x===x&&j.y===y&&j.type==='harvest'))v.jobs.push({type:'harvest',x,y});
 }
 if(v.jobs.filter(j=>j.type==='mine').length<4){
  for(let tries=0;tries<18;tries++){
   const x=ri(cl.x0+WALL_THICK,cl.x1-WALL_THICK),y=ri(cl.y0+WALL_THICK,cl.y1-WALL_THICK),i=idx(x,y);
   if(!walkable(x,y)&&struct[i]!==S_WALL&&struct[i]!==S_HOUSE&&struct[i]!==S_RUIN&&bld[i]<0&&!nodeAt.has(i)&&!dungeonAt(x,y)){v.jobs.push({type:'mine',x,y});break}
  }
 }
}
function villageTick(){
 detectVillages();
 for(const v of villages){
  if(simMin-v.lastPlan>rf(.4,.7)*DAY){v.lastPlan=simMin;planVillage(v)}
  if(v.stock.food>0){
   const pantries=v.homes.filter(b=>!b.gone&&!b.ruined&&b.stock);
   let guard=0;
   while(v.stock.food>0&&pantries.length&&guard++<40){
    const b=pick(pantries);b.stock.food++;v.stock.food--;
   }
  }
 }
}
function findVillageJob(p){
 const v=villages.find(vv=>vv.id===p.vid);
 if(!v||!v.jobs.length)return null;
 let harvest=null,hd=1e18,other=null,od=1e18;
 for(const j of v.jobs){
  const d=dist2(p.x,p.y,j.x*TILE,j.y*TILE);
  if(j.type==='harvest'){if(d<hd){hd=d;harvest=j}}
  else if(d<od){od=d;other=j}
 }
 const j=harvest||other;
 return j?{v,j}:null;
}

/* ================= abandonment & upkeep tick ================= */
function upkeepTick(){
 for(const b of buildings){
  if(b.gone||b.tp==='grave')continue;
  if(!b.done)continue;
  const livingOwners=b.owners.filter(id=>{const o=allById.get(id);return o&&!o.dead});
  const proprietorGone=b.tp==='biz'&&(()=>{const o=allById.get(b.builder);return !o||o.dead})();
  const empty=(b.tp==='biz')?proprietorGone:livingOwners.length===0;
  if(!b.ruined){
   if(empty){if(!b.emptySince)b.emptySince=simMin;else if(simMin-b.emptySince>RUIN_DELAY)ruinBuilding(b)}
   else b.emptySince=0;
  }else{
   if(simMin-b.emptySince>CRUMBLE_DELAY)crumbleBuilding(b);
  }
 }
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
 let line=pick(pool).replace('{o}',o?o.name:'friend');
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
let dpr=1,cw=0,ch=0;
function resize(){
 dpr=Math.min(2,window.devicePixelRatio||1);
 cw=window.innerWidth;ch=window.innerHeight;
 cv.width=cw*dpr;cv.height=ch*dpr;
 cv.style.width=cw+'px';cv.style.height=ch+'px';
}
window.addEventListener('resize',resize);resize();
let tcv=null,dynCanvas=null,dctx=null;

/* ================= eras =================
   The world cycles slowly between a lush medieval forest and a sci-fi urban
   wasteland and back — a full ping-pong takes ~1000 days. Each keyframe sets a
   terrain palette, a TileGen texture+edge style, and how green (planted) the
   land is; the surface interpolates between them and re-bakes its ground as the
   age drifts. */
const ERA_SEG_DAYS = 1000/6;   // 6 segments per full ping-pong ⇒ ~1000-day cycle
const ERAS=[
 {name:'The Verdant Age', grass:'#3f7a3a', dirt:'#3a2a18', style:'pebbled', edge:'rounded', green:1.00,
  lines:['Green things lean toward the sun and ask nothing.','The forest is thinking, slowly, in leaves.','Moss keeps the only calendar that matters here.']},
 {name:'The Age of Smoke', grass:'#6a6636', dirt:'#2a2216', style:'mottle', edge:'rough', green:0.66,
  lines:['A haze hangs over the hedgerows; something is being built, or burned.','The bees smell of iron this season.','Machines cough somewhere past the treeline.']},
 {name:'The Grey Age', grass:'#5c6360', dirt:'#20232a', style:'checker', edge:'beveled', green:0.32,
  lines:['Straight lines creep across the meadow. The garden endures them.','Concrete remembers being sand, and resents it.','The paving grows faster than the grass now.']},
 {name:'The Neon Waste', grass:'#3c4a56', dirt:'#12101a', style:'cracked', edge:'sharp', green:0.06,
  lines:['Dead signage flickers in the bramble. The old net dreams beneath.','Chrome and moss have called a truce out here in the waste.','Nothing grows but the past, and it grows everywhere.']},
];
let eraOffset=0,tileSalt=0;   // editor knobs: shift the age / reroll the grain
function eraFloat(){
 const day=simMin/DAY+eraOffset, N=ERAS.length, seg=2*(N-1);
 let t=(day/ERA_SEG_DAYS)%seg; if(t<0)t+=seg;
 return t<(N-1)? t : (seg-t);                 // triangle 0..N-1..0
}
function lerpHex(a,b,t){const A=U.hexToRgb(a),B=U.hexToRgb(b);
 return '#'+[0,1,2].map(i=>clamp(Math.round(A[i]+(B[i]-A[i])*t),0,255).toString(16).padStart(2,'0')).join('')}
function eraState(){
 const f=eraFloat(),N=ERAS.length,i=Math.min(Math.floor(f),N-1),frac=f-Math.floor(f);
 const a=ERAS[i],b=ERAS[Math.min(i+1,N-1)],near=frac<0.5?a:b;
 return {f,name:near.name,grass:lerpHex(a.grass,b.grass,frac),dirt:lerpHex(a.dirt,b.dirt,frac),
  style:near.style,edge:near.edge,green:a.green+(b.green-a.green)*frac,lines:near.lines};
}

// the surface uses the shared TileGen engine, sampled at WORLD coordinates so
// the ground flows seamlessly — grass and bramble-rock as two continuous
// textures with organic rounded edges between them (cohesive, like the deep).
let surfPals=null,surfStyle=null,surfSeedN=1,surfMasks=null,surfEra=null;
function bakeSurfaceTiles(){
 const es=eraState();surfEra=es;
 surfStyle=TileGen.deriveStyle('surface-'+seed+'-'+tileSalt);
 surfStyle.name=es.style; surfStyle.edge=es.edge;         // era decides look
 surfStyle.texDensity*=0.7; surfStyle.macroAmt*=0.7;       // calmer than the deep
 surfPals=TileGen.makePalettes(es.grass,es.dirt);
 surfSeedN=(seed>>>0)||1;
 surfMasks=[];
 for(let i=0;i<16;i++)surfMasks[i]=TileGen.edgeMask(TILE,TileGen.cornersFromIndex(i),surfStyle);
}
// re-mark every hand-edited tile so the dynamic overlay repaints after a rebake
function repaintDynAll(){
 modTiles.clear();
 for(let i=0;i<W*H;i++){
  if(farmGrid[i]||struct[i]===S_HOUSE||struct[i]===S_WALL||struct[i]===S_RUIN||struct[i]===S_FLOOR)modTiles.add(i);
 }
 terrainDirty=true;
}
// re-bake the ground when the age has drifted (throttled so fast-forward stays smooth)
let lastEraBucket=-999,lastEraRebuildRT=0;
function eraRebuildCheck(){
 const bucket=Math.round(eraFloat()*8);
 if(bucket===lastEraBucket)return;
 const now=performance.now();
 if(now-lastEraRebuildRT<2500)return;
 lastEraBucket=bucket;lastEraRebuildRT=now;
 buildTerrainLayer();
 repaintDynAll();
}
// paint one cell's worth of continuous ground into ctx (grass, or rock where the mask is solid)
function paintCellTexture(c,x,y,solidMask){
 const img=c.createImageData(TILE,TILE),data=img.data;
 for(let ly=0;ly<TILE;ly++)for(let lx=0;lx<TILE;lx++){
  const solid=solidMask?solidMask[ly*TILE+lx]===1:false;
  const col=TileGen.surfaceTexel(surfPals,solid,x*TILE+lx,y*TILE+ly,surfSeedN,surfStyle);
  const p=(ly*TILE+lx)*4;data[p]=col[0];data[p+1]=col[1];data[p+2]=col[2];data[p+3]=255;
 }
 c.putImageData(img,x*TILE,y*TILE);
}
function paintFloorTile(c,x,y){
 if(surfPals){paintCellTexture(c,x,y,null);return;}
 const h=hash2(x,y),v=h*16;
 c.fillStyle='rgb('+(56+v)+','+(92+v*0.9)+','+(50+v*0.6)+')';
 c.fillRect(x*TILE,y*TILE,TILE,TILE);
}
function buildTerrainLayer(){
 bakeSurfaceTiles();
 tcv=document.createElement('canvas');
 tcv.width=W*TILE;tcv.height=H*TILE;
 const c=tcv.getContext('2d');c.imageSmoothingEnabled=false;
 // rock field = solid cells; its rounded per-cell mask carves the organic edge
 const solidF=[];
 for(let y=0;y<H;y++){solidF[y]=[];for(let x=0;x<W;x++)solidF[y][x]=!walkable(x,y)}
 const vgS=TileGen.computeVertexGrid(solidF,H,W);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const si=TileGen.fieldCornerIndex(TileGen.cellCorners(vgS,x,y));
  paintCellTexture(c,x,y,surfMasks[si]);
 }
 // Plant Forge meadow decor, thinning out as the age turns to wasteland
 const green=surfEra?surfEra.green:1;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  if(map[idx(x,y)]!==0)continue;
  const h=hash2(x,y);
  if(flora&&h>0.30&&h<0.30+0.10*green&&!nodeAt.has(idx(x,y))){
   const dvi=(x*7+y*13)%flora.decor.length;
   const dc=flora.decor[dvi];
   c.drawImage(dc,x*TILE+TILE/2-dc.width/2,y*TILE+TILE-dc.height+1);
  }
 }
 dynCanvas=document.createElement('canvas');
 dynCanvas.width=W*TILE;dynCanvas.height=H*TILE;
 dctx=dynCanvas.getContext('2d');
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
 if(map[i]===0){paintFloorTile(c,x,y);return}
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
 }else{
  paintFloorTile(c,x,y);
 }
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
function drawSalvage(c,sv,t){
 const px=sv.x,py=sv.y,bob=Math.sin(sv.t)*1.6;
 // ground shadow + neon halo, then the actual generated relic sprite at plant-level detail
 c.fillStyle='rgba(0,0,0,0.30)';c.beginPath();c.ellipse(px,py+2,7,2.6,0,0,7);c.fill();
 const go=c.globalCompositeOperation;c.globalCompositeOperation='screen';
 c.drawImage(GLOW_BLUE,px-17,py-20,34,34);c.globalCompositeOperation=go;
 const base=(sv.relic&&sv.relic._iconBase)||relicBase(sv.relic&&sv.relic.id);
 const S=28;
 if(base)c.drawImage(base,px-S/2,py+bob-S+5,S,S);
 // a blinking beacon pip above it
 if(t%900<450){c.fillStyle='#7df9ff';c.fillRect(px-1,py+bob-S+3,2,2)}
 if(cam.z>1.05){c.font='6px system-ui';c.textAlign='center';c.fillStyle='rgba(150,220,255,0.85)';c.fillText(sv.relic?sv.relic.n:'salvage',px,py+11)}
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
 if(flora){
  const bank=flora[n.t==='berry'?'berry':n.t==='mush'?'mush':'tree'];
  const vset=bank[(n.x*7+n.y*13)%bank.length];
  const img=vset[nodeStage(n)];
  if(n.amt<=0)c.globalAlpha=0.45;
  c.drawImage(img,px-img.width/2,n.y*TILE+TILE-img.height+2);
  c.globalAlpha=1;
  return;
 }
 // fallback dot if flora not baked yet
 c.fillStyle=n.t==='tree'?'#4a8a5a':'#7aa85a';
 c.beginPath();c.ellipse(px,py,5,4,0,0,7);c.fill();
}
function drawBuilding(c,b,nf){
 const px=b.x*TILE,py=b.y*TILE,w=b.w*TILE,h=b.h*TILE;
 if(b.tp==='grave'){
  c.fillStyle='#6f7285';
  c.beginPath();c.moveTo(px+4,py+13);c.lineTo(px+4,py+6);c.arc(px+8,py+6,4,Math.PI,0);c.lineTo(px+12,py+13);c.closePath();c.fill();
  c.fillStyle='#4a5c48';c.fillRect(px+3,py+12,10,2);
  c.fillStyle='#e8e8f0';c.fillRect(px+7,py+3,2,2); // the small white flower
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
  const chatting=p.chatHold>simMin&&p.sprite.FRAMES.talk;
  const anim=chatting?'talk':'walk';
  const clock=p.moving||chatting?p.animClock:0;
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

/* ================= main draw ================= */
function draw(t){
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.fillStyle='#131f12';ctx.fillRect(0,0,cw,ch);
 const z=cam.z;
 if(cine&&selected&&!selected.dead){cam.x+=(selected.x-cam.x)*0.08;cam.y+=(selected.y-cam.y)*0.08}
 else if(follow&&selected&&!selected.dead){cam.x+=(selected.x-cam.x)*0.08;cam.y+=(selected.y-cam.y)*0.08}
 else{cam.x+=(hero.x-cam.x)*0.12;cam.y+=(hero.y-cam.y)*0.12}
 cam.x=clamp(cam.x,Math.min(cw/(2*z),W*TILE/2),Math.max(W*TILE-cw/(2*z),W*TILE/2));
 cam.y=clamp(cam.y,Math.min(ch/(2*z),H*TILE/2),Math.max(H*TILE-ch/(2*z),H*TILE/2));
 ctx.setTransform(z*dpr,0,0,z*dpr,dpr*(cw/2-cam.x*z),dpr*(ch/2-cam.y*z));
 ctx.imageSmoothingEnabled=false;
 if(tcv)ctx.drawImage(tcv,0,0);
 if(terrainDirty){paintDyn();terrainDirty=false}
 if(dynCanvas)ctx.drawImage(dynCanvas,0,0);
 const vx0=Math.max(0,((cam.x-cw/(2*z))/TILE|0)-3),vx1=Math.min(W-1,((cam.x+cw/(2*z))/TILE|0)+3);
 const vy0=Math.max(0,((cam.y-ch/(2*z))/TILE|0)-3),vy1=Math.min(H-1,((cam.y+ch/(2*z))/TILE|0)+3);
 const nf=nightFactor();
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
 }
 // salvage caches
 for(const sv of salvage){
  if(sv.x/TILE<vx0-1||sv.x/TILE>vx1+1||sv.y/TILE<vy0-1||sv.y/TILE>vy1+1)continue;
  drawSalvage(ctx,sv,t);
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
 if(!hero.down)drawables.push({y:hero.y,f:()=>drawHero(t)});
 drawables.sort((a,b)=>a.y-b.y);
 for(const d of drawables)d.f();
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
function drawDungeon(c,d,t){
 const px=d.x*TILE+TILE/2,py=d.y*TILE+TILE/2;
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
 if(hero.down||heroSlashCd>0||inDialog)return;
 heroSlashCd=0.18;
 hero.face=ang;hero.dir=CFHelp.angToDir(ang);
 hero.atkT=0.42;hero.atkClock=0;
 const dmg=(16+Hero.level*4)*Hero.dmg;
 heroSlashes.push({ang,t:0,hit:new Set(),range:HERO_RANGE*Hero.rangeMul,arc:Math.min(Math.PI*1.6,HERO_ARC*Hero.arcMul),dmg});
 if(navigator.vibrate)navigator.vibrate(12);
}
function updateHero(rdt){
 heroSlashCd-=rdt;
 hero.ifr=Math.max(0,hero.ifr-rdt);
 hero.hurtFlash=Math.max(0,hero.hurtFlash-rdt);
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
 // joystick movement
 let mx=0,my=0;
 if(stick&&!inDialog){
  let dx=stick.x-stick.ox,dy=stick.y-stick.oy;
  const d=Math.hypot(dx,dy);
  if(d>STICK_RADIUS){const ex=(d-STICK_RADIUS)/d;stick.ox+=dx*ex;stick.oy+=dy*ex;dx=stick.x-stick.ox;dy=stick.y-stick.oy}
  const m=Math.min(d/STICK_RADIUS,1);
  if(d>4){mx=dx/d*m;my=dy/d*m;hero.face=Math.atan2(dy,dx)}
 }
 const spd=HERO_SPEED*Hero.speedMul;
 const vx=mx*spd,vy=my*spd;
 hero.moving=Math.hypot(vx,vy)>6;
 if(hero.moving){
  moveHero(vx*rdt,vy*rdt);
  hero.dir=CFHelp.angToDir(Math.atan2(vy,vx));
  hero.anim=Math.hypot(mx,my)>0.85?'run':'walk';
  hero.animClock+=rdt;
 }else hero.anim='walk';
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
  }
 }
 heroSlashes=heroSlashes.filter(s=>s.t<0.25);
 // salvage caches: walk over to install a tech relic
 for(const sv of salvage){
  sv.t+=rdt*1.5;
  if(!sv.got&&!hero.down&&dist2(sv.x,sv.y,hero.x,hero.y)<(TILE*0.9)**2){
   sv.got=true;
   grantHeroRelic(sv.relic);
   if(navigator.vibrate)navigator.vibrate(20);
  }
 }
 salvage=salvage.filter(s=>!s.got);
 // context buttons: talk & descend
 uiProxT-=rdt;
 if(uiProxT<=0){uiProxT=0.2;updateContextButtons()}
}
let uiProxT=0,talkTarget=null,descendTarget=null;
function updateContextButtons(){
 talkTarget=null;descendTarget=null;
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
 }
 const tb=$('sTalkBtn'),db=$('sDescendBtn');
 tb.style.display=talkTarget?'block':'none';
 if(talkTarget)tb.textContent='💬 TALK — '+talkTarget.name;
 db.style.display=descendTarget?'block':'none';
 if(descendTarget)db.textContent=(descendTarget.cleansed?'🌿 REVISIT — ':'🕳 DESCEND — ')+descendTarget.name;
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
function npcDialogue(p){
 const lines=[];
 lines.push(pick(TALK_OPEN));
 const tp=TRAIT_TALK[p.traits[0]]||TRAIT_TALK[p.traits[1]];
 if(tp)lines.push(pick(tp));
 if(p.courting&&chance(.6))lines.push(pick(TALK_LOVE));
 else if(p.goal&&!p.goal.done&&chance(.7))lines.push(TALK_GOAL[p.goal.k]);
 if(p.cards.length&&chance(.4)){const c=TAROT[p.cards[p.cards.length-1].i];lines.push('The garden dealt me '+c.n+'. I am still deciding what it gave me.')}
 if(dungeons.length&&chance(.55)){const d=pick(dungeons.filter(dd=>!dd.cleansed).concat(dungeons).slice(0,dungeons.length));lines.push(pick(TALK_RUMOR).replace('{d}',d.name))}
 lines.push(pick(TALK_CLOSE));
 return lines;
}
let dlgLines=null,dlgIdx=0;
function startTalk(p){
 if(!p||p.dead)return;
 inDialog=true;stick=null;
 p.chatHold=simMin+40;p.task=null;p.path=null;p.moving=false;
 p.fx=hero.x>p.x?1:-1;
 p.dirIdx=CFHelp.angToDir(Math.atan2(hero.y-p.y,hero.x-p.x));
 dlgLines=npcDialogue(p);dlgIdx=0;
 $('sDialogName').textContent=p.name+' · '+traitPhrase(p);
 $('sDialogText').textContent=dlgLines[0];
 $('sDialog').style.display='block';
 $('sTalkBtn').style.display='none';
 $('sDescendBtn').style.display='none';
}
function advanceTalk(){
 dlgIdx++;
 if(dlgLines&&dlgIdx<dlgLines.length){
  $('sDialogText').textContent=dlgLines[dlgIdx];
 }else{
  $('sDialog').style.display='none';
  dlgLines=null;inDialog=false;
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
function tapAt(sx,sy){
 const wx=cam.x+(sx-cw/2)/cam.z,wy=cam.y+(sy-ch/2)/cam.z;
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
function inspectNode(n){
 lastInspect={type:'node',obj:n};
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
 showInspect('🕳',d.name,(d.cleansed?'quiet now':dangerWord(d.danger))+' · '+d.depth+' floors',rows,d.cleansed?'The mouth breathes evenly now. Whatever argued down there has conceded — for a season, anyway.':'A cold breath rises from the dark, smelling of unfinished arguments. Walk close and the Sage may DESCEND.');
}
function inspectTile(tx,ty){
 lastInspect=null;
 const i=idx(tx,ty);
 if(farmGrid[i]===1||farmGrid[i]===2){
  const v=villages.find(vv=>dist2(vv.cx,vv.cy,tx,ty)<(vv.rad+4)**2);
  showInspect(farmGrid[i]===2?'🌾':'🌱',farmGrid[i]===2?'A ripe farm plot':'A tilled farm plot',v?'tended by '+v.name:'',[['State',farmGrid[i]===2?'ready to harvest':'growing']],'The village mind combed order into the wild green — rows of pale grain, each one an agreed-upon fact.');
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
 if(p.sprite){
  const cvf=p.sprite.FRAMES.walk[0][0];
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
$('iClose').onclick=closeInspect;
function setSpeed(idx2){
 speedIdx=idx2;
 document.querySelectorAll('#sui .sp button').forEach(x=>x.classList.toggle('on',+x.dataset.s===idx2));
 document.querySelectorAll('#sui .cspd button').forEach(x=>x.classList.toggle('on',+x.dataset.s===idx2));
}
document.querySelectorAll('#sui .sp button,#sui .cspd button').forEach(b=>{b.onclick=()=>setSpeed(+b.dataset.s)});
$('sTalkBtn').onclick=()=>startTalk(talkTarget);
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
function reseed(newSeed){
 seed=(newSeed===undefined)?((Math.random()*2**31)|0):newSeed;
 rng=U.mulberry32(seed);
 genWorld();
 $('charPanel').classList.add('hidden');$('logPanel').classList.add('hidden');closeInspect();
 toast('A new garden dreams itself up… (seed '+seed+')');
}

/* ================= main loop (driven by main.js) ================= */
let last=performance.now(),acc=0,uiT=0;
function frame(t){
 const rdt=Math.min(0.1,(t-last)/1000);last=t;
 const sp=SPEEDS[speedIdx];
 if(sp>0){
  acc=Math.min(acc+rdt*sp*RATE,500);
  while(acc>0){
   const st=Math.min(2,acc);
   stepSim(st);
   acc-=st;
  }
 }
 processBakeQueue();
 updateHero(rdt);
 if(cine){
  cam.z+=(cineZoomTarget-cam.z)*0.09;
 }
 draw(t);
 if(t-uiT>(cine?260:450)){
  uiT=t;
  $('clock').textContent='Day '+cday()+' · '+(surfEra?surfEra.name:phase());
  $('pop').textContent='👥 '+people.length+(monsters.length?' · 👹'+monsters.length:'');
  $('hearts').textContent=speedIdx>=2?'🧘 the Sage meditates':heroHearts()+'  ·  lv '+Hero.level+(Hero.relics.length?'  ·  🔩'+Hero.relics.length:'');
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
  people:()=>people,monsters:()=>monsters,villages:()=>villages,dungeons:()=>dungeons,nodes:()=>nodes,
  toast,tale,
  spawnSettler:()=>arrive(),
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
  tileStyle:()=>({name:surfStyle&&surfStyle.name,edge:surfStyle&&surfStyle.edge}),
  advanceEra:()=>{eraOffset+=ERA_SEG_DAYS;lastEraBucket=-999;buildTerrainLayer();repaintDynAll();const es=eraState();toast('The age turns → '+es.name)},
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
