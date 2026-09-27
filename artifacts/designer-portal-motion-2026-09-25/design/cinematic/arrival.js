/* arrival v3 (SQ-333): "the sentence finds its place", one engine for the Desk and every Document.
   A review prototype of proposed rulings R-DM18..R-DM36 (contract: SQ-333 "ARRIVAL v3 MERGED CONTRACT"), not doctrine.
   Load it in <head>, after arrival.css and before the page body: the gate below runs before the first paint.
   A page declares only its Briefing inputs (<script type="application/json" id="briefing">) and data-part marks:
     headline · act · act2 · f1 f2 f3 (canonical facts) · job (Desk name) · warn (Desk past-due line) · name · stage ·
     settle (the state word) · head (focus for a terminal verb) · crown (the current Strata Mark) · place
   Everything else, selection included, happens here. If this file fails to load, the page is simply the resting page. */
(function(w){
'use strict';
var d=w.document,root=d.documentElement;
var DAY=864e5,VISIT=30*60e3,FONT_WAIT=1500;
var WD=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var MO=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ---------- 0. the gate: decided before the first paint; the tokens are spent here, once ---------- */
var A=w.ARR={play:false,kbd:false,why:'',at:0};
(function(){
  var page=root.getAttribute('data-arrival'),s=w.location.search,nav='',now=Date.now(),last=null,tok=null;
  try{A.at=w.performance.now();}catch(e){}
  try{var ss=w.sessionStorage;last=ss.getItem('pl-visit');tok=ss.getItem('pl-arrive');ss.removeItem('pl-arrive');ss.setItem('pl-visit',String(now));}catch(e){}
  try{nav=w.performance.getEntriesByType('navigation')[0].type;}catch(e){}
  if(!page)A.why='no page';
  else if(/[?&]arrive=0(&|$)/.test(s))A.why='arrive=0';
  else if(w.location.hash)A.why='hash';                      /* she chose the spot: #rec and every deep link */
  else if(nav==='back_forward')A.why='history';              /* Back and Forward restore; they never perform */
  else if(page==='desk'&&last&&now-(+last)<VISIT)A.why='same visit'; /* the put-down, and any Desk within 30 minutes */
  else{A.play=true;A.kbd=tok==='kbd';root.classList.add('arr-pre');A.safety=w.setTimeout(function(){root.classList.remove('arr-pre');},FONT_WAIT+200);}
})();

/* ---------- 1. selection: SQ-330 §2 rules R1-R8, the Desk rule and the §4 since forms, as a pure function ---------- */
function day(s){var p=String(s).split('-');return Date.UTC(+p[0],+p[1]-1,+p[2]);}
function fmt(t){var x=new Date(t);return MO[x.getUTCMonth()]+' '+x.getUTCDate();}
function weekday(t){return WD[new Date(t).getUTCDay()];}
function lc(s){return s.charAt(0).toLowerCase()+s.slice(1);}
function stop(s){return s.replace(/[.;,:]+$/,'');}
function plural(n){return n+(n===1?' day':' days');}
function words(s){return String(s||'').split(/\s+/).filter(function(x){return /[\w\d]/.test(x);}).length;}
/* R2's second key: the need's rank within a custody band (after R143's band order) */
var NEED_RANK=['overdue_decision','finish_approval','client_approval','essentials','proposal_draft','order_send','delivery_window','sample','install_date','care_note'];
var KIND_ORDER=['decision','message','invoice','sms','pulse'];
var EXCLUDED=['hours','workshop_note'];
function overdue(n,today){return n.dueOn&&day(n.dueOn)<today?Math.round((today-day(n.dueOn))/DAY):0;}
function band(n,today,viewer){
  if(n.owner==='client')return 2;
  if(n.owner==='maker')return 3;
  if(n.who&&n.who!==viewer)return 4;          /* a teammate's pen is named, never "Your pen" (R-DM20 A) */
  return overdue(n,today)?0:1;
}
function rank(k){var i=NEED_RANK.indexOf(k);return i<0?99:i;}
function oldest(n){return n.dueOn?day(n.dueOn):n.since?day(n.since):Infinity;}
function cmpNeed(today,viewer,sections){
  return function(a,b){
    return band(a,today,viewer)-band(b,today,viewer)||rank(a.kind)-rank(b.kind)||oldest(a)-oldest(b)||
      (a.kind<b.kind?-1:a.kind>b.kind?1:0)||sec(a)-sec(b);
  };
  function sec(n){var i=(sections||[]).indexOf(n.section);return i<0?99:i;} /* R8: section order, brief through care */
}
function due(n,today){
  var od=overdue(n,today);
  if(od)return 'overdue '+plural(od);
  if(!n.dueOn)return '';
  return day(n.dueOn)===today?'due today':'due '+fmt(day(n.dueOn));
}
/* F3: the custody word plus the due date or how long (R143 D6) */
function custody(n,today,viewer,odInF3){
  var od=overdue(n,today),tail=odInF3&&od?', overdue '+plural(od):'',x;
  if(n.owner==='client')x='Waiting on '+n.who+(n.ask?' to '+n.ask:'')+tail;
  else if(n.owner==='maker')x='With the maker; promised by '+(n.dueOn?(day(n.dueOn)===today?'today':fmt(day(n.dueOn))):'no date')+tail;
  else{
    var dd=due(n,today);
    x=(n.who&&n.who!==viewer?'With '+n.who:'Your pen')+(dd?', '+dd:'')+(n.ball?'; '+n.ball:'');
  }
  return x+'.';
}
function anchorWord(a,today){
  var n=Math.round((today-day(a))/DAY);
  return n<=0?'earlier today':n===1?'yesterday':n<7?weekday(day(a)):fmt(day(a));
}
/* F2 (§4): the newest change since her last open that bears on the headline need, else the newest by kind order */
function sinceLine(since,today,viewer,head){
  since=since||{};
  if(!since.anchor)return 'New to you: '+stop(since.first||'opened by the studio')+'.';
  var a=day(since.anchor),cs=(since.changes||[]).filter(function(c){return day(c.at)>=a&&c.by!==viewer&&EXCLUDED.indexOf(c.kind)<0;});
  function newer(x,y){return day(y.at)-day(x.at)||(x.text<y.text?-1:x.text>y.text?1:0);}
  var on=head?cs.filter(function(c){return c.need===head.kind;}).sort(newer):[];
  var pick=on[0]||cs.slice().sort(function(x,y){var k=KIND_ORDER.indexOf(x.kind)-KIND_ORDER.indexOf(y.kind);return k||newer(x,y);})[0];
  var w0=anchorWord(since.anchor,today);
  if(!pick)return 'Nothing new since '+w0+'.';
  return 'Since '+w0+': '+stop(pick.text)+'.';
}
function headlineOf(n,today){
  var od=overdue(n,today),h=n.line;
  if(!od)return {text:h,odInF3:false};
  var x='Overdue '+plural(od)+': '+lc(h);
  return words(x)>8?{text:h,odInF3:true}:{text:x,odInF3:false};
}
var DOORWAY=/^(review|open|read|see|plan|draft|continue|follow up|inspect|resolve)\b/i;
function select(inputs,today,viewer){
  inputs=inputs||{};
  today=day(today||inputs.today);viewer=viewer||inputs.viewer;
  var card={kind:inputs.kind||'document',rule:'',place:'',headline:'',facts:[],act:null,act2:null,need:null,warn:-1};
  if(card.kind==='desk')return desk(inputs,today,viewer,card);
  var job=inputs.job||{},needs=(inputs.needs||[]).slice().sort(cmpNeed(today,viewer,inputs.sections));
  card.place=job.name+' · '+job.stage;
  var pos=inputs.position,f1=pos&&pos.text&&pos.fidelity!=='band'?pos.text:'No dates fixed yet.';
  if(job.paused){
    card.rule='R1';card.headline='Paused since '+fmt(day(job.paused))+'.';
    card.facts=['Stopped in '+job.stage+'.',sinceLine(inputs.since,today,viewer,null),'At rest.'];
    return card;
  }
  var h=needs[0];
  if(h){
    var hl=headlineOf(h,today);
    card.rule=overdue(h,today)?'R5':'R2';card.need=h;card.headline=hl.text;
    var f3=h.namesCustody?(needs[1]?needs[1].line:'Nothing else is yours.'):custody(h,today,viewer,hl.odInF3);
    card.facts=[f1,sinceLine(inputs.since,today,viewer,h),f3];
    card.act=h.act||null;
    var two=needs.filter(function(n){return n!==h&&band(n,today,viewer)<=1&&n.act;})[0];
    card.act2=two?two.act:null;
    return card;
  }
  var m=inputs.milestone;
  if(m&&m.fidelity==='exact'){card.rule='R3';card.headline=m.label+' starts '+fmt(day(m.date))+'; nothing needs you.';}
  else if(m){card.rule='R3';card.headline=job.stage+' under way; nothing needs you.';}
  else{card.rule='R4';card.headline='Nothing needs your hand.';}
  card.facts=[f1,sinceLine(inputs.since,today,viewer,null),'At rest'+(inputs.rest?'; '+stop(inputs.rest):'')+'.'];
  return card;
}
/* The Desk (studio-wide): every non-paused job's headline need ranked by R2, ties on the job name (R143 D7) */
function desk(inputs,today,viewer,card){
  card.place=inputs.studio+' · '+weekday(today)+', '+fmt(today);
  var heads=[];
  (inputs.jobs||[]).forEach(function(j){
    if(j.paused)return;
    var n=(j.needs||[]).slice().sort(cmpNeed(today,viewer,inputs.sections))[0];
    if(n)heads.push({job:j,need:n});
  });
  var c=cmpNeed(today,viewer,inputs.sections);
  heads.sort(function(a,b){return c(a.need,b.need)||(a.job.name<b.job.name?-1:a.job.name>b.job.name?1:0);});
  function brief(x){
    var od=overdue(x.need,today),b=x.need.brief||lc(stop(x.need.line));
    return x.job.name+': '+b+(od?' overdue '+plural(od):'')+'.';
  }
  var since=sinceLine(inputs.since,today,viewer,null);
  if(!heads.length){
    card.rule='R4';card.headline='Nothing needs your hand today.';
    var ms=(inputs.jobs||[]).filter(function(j){return j.milestone&&j.milestone.fidelity==='exact';})
      .sort(function(a,b){return day(a.milestone.date)-day(b.milestone.date)||(a.name<b.name?-1:1);});
    card.facts=ms.slice(0,2).map(function(j){return j.name+': '+lc(stop(j.milestone.text||j.milestone.label+' set for '+fmt(day(j.milestone.date))))+'.';});
    return card;
  }
  var top=heads[0];
  card.rule='Desk';card.need=top.need;card.job=top.job.name;
  var hl=headlineOf(top.need,today);
  card.headline=overdue(top.need,today)?brief(top):top.job.name+': '+lc(hl.text); /* past due: the brief form, one colon */
  card.headJob=top.job.name;card.headLine=top.need.line;
  card.facts=heads.slice(1,3).map(brief).concat([since]);
  heads.slice(1,3).forEach(function(x,i){if(overdue(x.need,today)&&card.warn<0)card.warn=i;}); /* readable from frame 0 */
  card.act=top.need.act||null;
  return card;
}
/* the one polite message at compose end: the card in slot order, then the instruction (SQ-330 §7) */
function message(card){
  var s=[card.place.replace(/ · /g,', ')+'.',card.headline].concat(card.facts);
  s.push(card.act?'Tab to '+card.act+', or press any key to open the page.':'Press any key to open the page.');
  return s.join(' ');
}
var Arrival=w.Arrival={select:select,message:message,words:words,DOORWAY:DOORWAY,day:day,A:A};

/* ---------- 2. the score (ms at Slow 1; SQ-331 §2-§11) ---------- */
var C={X:[.16,1,.3,1],O:[0,0,.58,1],Q:[.42,0,.58,1],EXIT:[.4,0,1,1],IO:[.65,0,.35,1],YL:[.45,0,.25,1],DRAW:[.55,0,.1,1]};
var S={crown:[0,560],place:[80,640],slug:[0,560],day:[120,560],job:[240,560],H:[360,960],F:[900,1020,1140],fD:600,
  act:[1260,480],rule:[1380,420],act2:[1440,360],CE:1800,hold:10000,cue:1500,cueIn:600,freeze:200,
  exit:240,exitStep:40,cueOut:160,skipOut:120,lineDone:180,lineFade:160,hand:60,lag:60,dMin:880,dMax:1100,warnD:1100,
  lead:120,dissolve:120,T0:520,span:1480,pT0:440,pSpan:1160,rise:720,stem:640,typeLag:80,row:50,actRule:120,
  cap:12,pCap:8,settle:400,last:2000,thin:160,
  rmLine:150,rmStag:100,rmCueIn:200,rmPart:200,rmSpan:400};
function cb(c){return 'cubic-bezier('+c.join(',')+')';}
/* the curve's progress at time fraction x (for the corridor, measured before the hand-off, never during it) */
function curve(c,x){
  if(x<=0)return 0;if(x>=1)return 1;
  function b(p1,p2,t){var u=1-t;return 3*u*u*t*p1+3*u*t*t*p2+t*t*t;}
  var lo=0,hi=1,t=x;
  for(var i=0;i<40;i++){t=(lo+hi)/2;if(b(c[0],c[2],t)<x)lo=t;else hi=t;}
  return b(c[1],c[3],t);
}
var K=null,st=null,wired=false,wait=null,press=null,own=false,swallow=false,quiet=false,status=null;
var BOX=null; /* the Briefing inputs and the card chosen from them, read once at boot */
function $(s,c){return (c||d).querySelector(s);}
function $$(s,c){return [].slice.call((c||d).querySelectorAll(s));}
function ms(n){return n*(K?K.slow:1);}
function num(v){v=parseFloat(v);return isNaN(v)?0:v;}
function r2(v){return Math.round(v*100)/100;}
function px(v){return r2(v)+'px';}
function tfx(x,s){return 'translate('+r2(x)+'px,0px) scale('+s+')';}
function mk(tag,cls,text){var e=d.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function rendered(el){return !!el&&el.getClientRects().length>0;}
function part(name){return $$('[data-part~="'+name+'"]').filter(rendered)[0]||null;}
function parts(name){return $$('[data-part~="'+name+'"]').filter(rendered);}
function box(el){var r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,w:r.right-r.left,h:r.bottom-r.top};}
/* the written text, not the empty width of its paragraph: one rect per line */
function ink(el){
  var rg=d.createRange();rg.selectNodeContents(el);
  var ls=[].slice.call(rg.getClientRects()).filter(function(r){return r.right>r.left;});
  if(!ls.length)return null;
  var lines=[];ls.forEach(function(r){var l=lines.filter(function(x){return Math.abs(x.top-r.top)<2;})[0];if(l){l.left=Math.min(l.left,r.left);l.right=Math.max(l.right,r.right);l.bottom=Math.max(l.bottom,r.bottom);}else lines.push({left:r.left,right:r.right,top:r.top,bottom:r.bottom});});
  var g={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity,lines:lines};
  lines.forEach(function(r){g.left=Math.min(g.left,r.left);g.right=Math.max(g.right,r.right);g.top=Math.min(g.top,r.top);g.bottom=Math.max(g.bottom,r.bottom);});
  g.w=g.right-g.left;g.h=g.bottom-g.top;g.cx=g.left+g.w/2;g.cy=g.top+g.h/2;return g;
}
function hit(a,b,e){e=e||0;return a.left<b.right+e&&a.right>b.left-e&&a.top<b.bottom+e&&a.bottom>b.top-e;}
/* usable viewport: safe areas and the visible review strip excluded */
function view(){
  var p=d.body.appendChild(mk('div','arr-safe')),cs=getComputedStyle(p),vw=root.clientWidth||w.innerWidth,vh=w.innerHeight,mc=$('.mc'),mh=0;
  d.body.removeChild(p);
  if(mc&&!mc.hidden){var m=mc.getBoundingClientRect();if(m.bottom>m.top)mh=vh-m.top;}
  var v={vw:vw,vh:vh,top:num(cs.paddingTop),left:num(cs.paddingLeft),right:vw-num(cs.paddingRight),bottom:vh-Math.max(num(cs.paddingBottom),mh)};
  v.H=v.bottom-v.top;v.W=v.right-v.left;v.phone=vw<=760;v.portrait=vh>vw;return v;
}
/* Work in progress is never covered: a Sheet, an open record, a dirty note, a selection or a working control holds the page. */
function busy(){
  if(K.sheet.openId()||K.overlay>0||K.unsaved())return true;
  var s=w.getSelection();if(s&&!s.isCollapsed)return true;
  if($$('[data-record]').some(rendered))return true;
  var a=d.activeElement;
  return !!(a&&a!==d.body&&!(a.closest&&a.closest('.mc,[data-arr-replay]')));
}
/* the one reading position, chosen before frame 0: the need's element on the SQ-321 reading line */
function readingY(v,H,A){
  var y0=w.scrollY||0,max=Math.max(0,(root.scrollHeight||0)-w.innerHeight),h=box(H),a=A?box(A):h,y;
  if(BOX.card.kind==='desk'){var t=box(part('job')||H);y=(t.top>=v.top&&a.bottom<=v.bottom)?y0:y0+a.bottom-v.bottom;}
  else{
    var sp=$('.spine'),bar=v.phone&&sp?box(sp).h:0;
    y=y0+h.top-(v.top+bar+(v.phone?160:Math.min(240,Math.max(160,.28*v.H))));
  }
  return Math.min(max,Math.max(0,Math.round(y)));
}

/* ---------- 3. the card: built from the chosen Briefing on the page's own type, placed once before frame 0 ---------- */
function build(card){
  var L={},layer=mk('div','arr-card');layer.setAttribute('aria-hidden','true');layer.setAttribute('data-arr','');
  function add(k,e){L[k]=e;layer.appendChild(e);return e;}
  if(card.kind==='desk'){
    var pl=card.place.split(' · ');
    add('slug',mk('p','arr-slug',pl[0]));add('day',mk('p','arr-day',pl.slice(1).join(' · ')));
    if(card.headJob&&part('job'))add('job',mk('p','arr-job',card.headJob));
  }else{
    var cr=part('crown');
    if(cr){var c=cr.cloneNode(true);c.setAttribute('class',('arr-crown '+(cr.getAttribute('class')||'').replace(/\bsm\b/,'')).trim());c.removeAttribute('data-part');add('crown',c);}
    add('place',mk('p','arr-place',card.place));
  }
  card.facts.forEach(function(f,i){
    var e=mk('p',card.kind!=='desk'&&i===0?'arr-f1':'arr-f',f);
    if(i===card.warn)e.className+=' arr-warn';
    add('f'+(i+1),e);
  });
  add('cue',mk('p','arr-cue',w.matchMedia('(pointer: coarse)').matches?'Tap or scroll to open the page':'Click, scroll or press any key to open the page'));
  add('line',mk('span','arr-line'));
  return {layer:layer,L:L};
}
/* The composition (SQ-331 §1): the 56/44/34 ladder with step-down fit, so every Document arrives; H's x-height midline on
   the optical centre; the card centred at 761 and up, flush-left on the 16px gutter below. Pure measurement: no writes. */
function plan(card,v,H,A,A2,L,skip,flat){
  var F=box(H),G=ink(H)||{left:F.left,right:F.right,top:F.top,bottom:F.bottom,w:F.w,h:F.h,cx:F.left+F.w/2,cy:F.top+F.h/2,lines:[F]};
  var fs=num(getComputedStyle(H).fontSize)||34,s=1,widest=Math.max.apply(null,G.lines.map(function(l){return l.right-l.left;}));
  if(!v.phone&&!flat)(v.vw>=1024?[56,44]:[44]).some(function(z){var k=z/fs;if(widest*k<=640&&G.lines.length<=2){s=k;return true;}return false;});
  var gp=v.phone?{crown:8,place:24,job:8,day:4,H:12,f1:6,f2:4,act:24,cue:24}:{crown:12,place:32,job:8,day:4,H:16,f1:8,f2:4,act:32,cue:40};
  var m={},hH=G.h*s,mid=v.top+(v.portrait?.40:.44)*v.H,hTop=mid-hH/2,hBot=hTop+hH;
  function sz(k){var b=box(L[k]);return {w:b.w,h:b.h};}
  function at(k,top){if(L[k]){m[k]={top:top,w:sz(k).w,h:sz(k).h};return m[k];}return null;}
  var up=hTop;
  if(card.kind==='desk'){
    if(L.job){at('job',0);m.job.top=up-gp.job-m.job.h;up=m.job.top;}
    at('day',0);m.day.top=up-gp.place-m.day.h;at('slug',0);m.slug.top=m.day.top-gp.day-m.slug.h;
  }else{
    at('place',0);m.place.top=up-gp.place-m.place.h;
    if(L.crown){at('crown',0);m.crown.top=m.place.top-gp.crown-m.crown.h;}
  }
  var y=hBot+gp.H;
  ['f1','f2','f3'].forEach(function(k,i){var x=at(k,y);if(x)y=x.top+x.h+(i===0?gp.f1:gp.f2);});
  y+=(m.f3||m.f2||m.f1?gp.act-gp.f2:0);
  var B=A?box(A):null,B2=A2?box(A2):null,aTop=y,a2Top=y;
  if(B){y=aTop+B.h;if(B2&&v.phone){a2Top=y+4;y=a2Top+B2.h;}}
  y+=B?gp.cue:0;
  at('cue',y);at('line',y+m.cue.h+8);
  /* fit: clear of Skip and the bottom; never "no arrival" (R-DM25 A); the headline keeps the top */
  var sk=box(skip),cx=v.left+v.W/2,gx=v.left+16,cueL=v.phone?gx:cx-m.cue.w/2,cueR=cueL+m.cue.w;
  var limit=(cueR>sk.left-8&&m.line.top+1>sk.top-8)||v.phone?Math.min(v.bottom-16,sk.top-8):v.bottom-16;
  var tops=Object.keys(m).map(function(k){return m[k].top;}).concat([hTop]),top=Math.min.apply(null,tops),bot=m.line.top+1;
  var lift=Math.max(0,bot-limit);lift=Math.min(lift,Math.max(0,top-(v.top+16)));
  Object.keys(m).forEach(function(k){m[k].top-=lift;});hTop-=lift;hBot-=lift;aTop-=lift;a2Top-=lift;
  Object.keys(m).forEach(function(k){m[k].left=v.phone?gx:(k==='line'?cx-60:cx-m[k].w/2);});
  var dot=/\.$/.test((H.textContent||'').trim())&&!v.phone?.064*fs*s:0;
  var Lc=v.phone?gx:cx-G.w*s/2-dot;
  /* H: ink left on its first baseline is the origin, so the first letter travels a clean path */
  var ox=G.left,oy=G.lines[0].top+.78*(G.lines[0].bottom-G.lines[0].top);
  var p={v:v,s:s,G:G,F:F,fs:fs,m:m,hTop:hTop,Lc:Lc,origin:[ox-F.left,oy-F.top],hx:Lc-G.left,hy:hTop-oy-s*(G.top-oy),carriers:[]};
  var pair=B?B.w+(B2&&!v.phone?20+B2.w:0):0,aLeft=v.phone?gx-2:cx-pair/2;
  if(B)p.act={el:A,x:aLeft-B.left,y:aTop-B.top,r0:{left:aLeft,top:aTop,right:aLeft+B.w,bottom:aTop+B.h},r1:B};
  if(B2){var l2=v.phone?gx-2:aLeft+B.w+20;p.act2={el:A2,x:l2-B2.left,y:a2Top-B2.top,r0:{left:l2,top:a2Top,right:l2+B2.w,bottom:a2Top+B2.h},r1:B2};}
  var dist=Math.hypot(Lc+G.w*s/2-G.cx,hTop+hH/2-G.cy);
  p.d=Math.round(Math.min(S.dMax,Math.max(S.dMin,700+1.25*dist)));
  p.carriers.push({r0:{left:Lc,top:hTop,right:Lc+G.w*s,bottom:hBot},r1:G,t:S.hand,d:p.d});
  if(p.act)p.carriers.push({r0:p.act.r0,r1:B,t:S.hand+S.lag,d:p.d});
  if(p.act2)p.carriers.push({r0:p.act2.r0,r1:B2,t:S.hand+2*S.lag,d:p.d});
  /* the doubles that ride home with the sentence: F1 (Document), the job name and the past-due line (Desk) */
  p.rides=[];
  function ride(k,canon,warn){
    var c=canon&&ink(canon);if(!c||!m[k])return;
    var r0={left:m[k].left,top:m[k].top,right:m[k].left+m[k].w,bottom:m[k].top+m[k].h};
    var q={k:k,canon:canon,dx:c.left-r0.left,dy:c.top-r0.top,d:warn?S.warnD:p.d,warn:!!warn};
    p.rides.push(q);p.carriers.push({r0:r0,r1:{left:c.left,top:c.top,right:c.left+(r0.right-r0.left),bottom:c.top+(r0.bottom-r0.top)},t:S.hand,d:q.d});
  }
  if(card.kind==='desk'){ride('job',part('job'));if(card.warn>=0)ride('f'+(card.warn+1),part('warn'),true);}
  else ride('f1',part('f1'));
  return p;
}

/* ---------- 4. the page's own parts: found, typed and timed before frame 0 (no layout reads after t0) ---------- */
var CTRL='a[href],button,input,textarea,select,summary,label,[role="button"],[tabindex]:not([tabindex="-1"]),[data-open-record],[data-sheet-open]';
function bw(cs,sd){return cs['border'+sd+'Style']!=='none'&&num(cs['border'+sd+'Width'])>0?num(cs['border'+sd+'Width']):0;}
function list(el){return /^(OL|UL|DL)$/.test(el.tagName)||el.getAttribute('role')==='list';}
function pinned(el){for(var a=el;a&&a!==d.body;a=a.parentElement){var p=getComputedStyle(a).position;if(p==='fixed'||p==='sticky')return true;}return false;}
/* R5: a part is in the first view only when it meets the viewport AND every clipping container above it, on both axes */
function seen(el,v){
  var r=box(el);
  if(!(r.w>0&&r.h>0&&r.right>0&&r.left<v.vw&&r.bottom>0&&r.top<v.vh))return false;
  for(var a=el.parentElement;a&&a!==d.body&&a!==root;a=a.parentElement){
    var cs=getComputedStyle(a);
    if((cs.overflowX!=='visible'||cs.overflowY!=='visible')&&!hit(r,box(a)))return false;
  }
  return true;
}
/* the nearest-point metric to the landed sentence (dx weighted .75: the page reads down its column) */
function near(r,G){
  var dx=Math.max(0,G.left-r.right,r.left-G.right),dy=Math.max(0,G.top-r.bottom,r.top-G.bottom);
  return Math.sqrt(.5625*dx*dx+dy*dy);
}
/* Walk the page: containers that hold a kept element, or tall multi-part containers, are opened; everything else in the first
   view is one unit. Below the fold is final from frame 0. */
function collect(keep,v){
  var units=[],through=[];
  (function walk(el){
    [].slice.call(el.children).forEach(function(c){
      if(c.hidden||keep.indexOf(c)>=0||c.matches('script,style,template,.mc,[data-arr]')||!rendered(c))return;
      if(keep.some(function(k){return c.contains(k);})){through.push(c);walk(c);return;}
      if(!seen(c,v))return;
      if(c.children.length>1&&!list(c)&&box(c).h>.3*v.vh){through.push(c);walk(c);return;}
      units.push(c);
    });
  })(d.body);
  return {units:units,through:through.filter(function(t){return seen(t,v);})};
}
/* One rule overlay per drawn border: the border goes transparent for the arrival and a hairline draws in its place,
   projected from the focus (SQ-331 §5 DRAW). Overlays live in document coordinates, or fixed for pinned parts. */
function rules(el,cs,sides,fx,v){
  var r=box(el),out=[],fix=pinned(el),y0=fix?0:w.scrollY||0,x0=fix?0:w.scrollX||0;
  sides.forEach(function(sd){
    var wd=bw(cs,sd),col=cs['border'+sd+'Color'],e=mk('span','arr-rule'),o={el:e,side:sd,fix:fix,prop:'border'+sd+'Color'};
    if(sd==='Top'||sd==='Bottom'){
      var t=sd==='Top'?r.top:r.bottom-wd,ox=Math.min(r.w,Math.max(0,fx-r.left));
      e.style.cssText='left:'+px(r.left+x0)+';top:'+px(t+y0)+';width:'+px(r.w)+';height:'+px(wd)+';background:'+col+';transform-origin:'+px(ox)+' 50%';
      o.r={left:r.left,right:r.right,top:t,bottom:t+wd};
    }else{
      e.style.cssText='left:'+px(r.left+x0)+';top:'+px(r.top+y0)+';width:'+px(wd)+';height:'+px(r.h)+';background:'+col+';transform-origin:50% 0;transform:scaleY(0)';
      o.r={left:r.left,right:r.left+wd,top:r.top,bottom:r.bottom};
    }
    out.push(o);
  });
  return out;
}
/* A unit: its type (RISE, act, list, stem), its drawn rules, its children and their offsets inside the unit. */
function unit(el,G,v,rm){
  var cs=getComputedStyle(el),r=box(el),u={el:el,r:r,d:near(r,G),rules:[],kids:[],inline:cs.display==='inline',kind:'rise',off:0};
  var par=el.parentElement?box(el.parentElement):r;
  u.origin=px(Math.min(0,par.left-r.left))+' 100%'; /* RISE grows from the column's left edge */
  var h=['Top','Bottom'].filter(function(sd){return bw(cs,sd)>0;}),stem=bw(cs,'Left')>0&&el.children.length>0;
  if(!u.inline&&(h.length||stem))u.rules=rules(el,cs,h.concat(stem?['Left']:[]),Math.min(r.right,Math.max(r.left,G.cx)),v);
  if(el.matches('.act')&&$('.rule',el)){u.kind='act';u.rule=$('.rule',el);}
  else if(stem){
    u.kind='stem';
    [].slice.call(el.children).filter(rendered).forEach(function(k){var b=box(k);u.kids.push({el:k,off:Math.round(S.stem*Math.abs(b.top-r.top)/Math.max(1,r.h)),stem:true});});
  }else if(list(el)||(h.length&&el.children.length>1)){
    u.kind='list';
    [].slice.call(el.children).filter(rendered).forEach(function(k,i){var b=box(k);u.kids.push({el:k,off:S.typeLag+S.row*i,origin:px(Math.min(0,par.left-b.left))+' 100%'});});
  }
  if(u.kind==='rise'&&u.rules.length)u.off=S.typeLag; /* lines 80ms before type */
  u.dur=rm?S.rmPart:Math.max(S.rise+u.off,u.kids.reduce(function(m,k){return Math.max(m,k.off+S.rise);},0),u.rules.length?S.stem:0);
  return u;
}
/* where a carrier is at ms t of Act 3 (x on IO, y on YL), for the corridor */
function at3(c,t){
  var k=(t-c.t)/c.d,px_=curve(C.IO,k),py=curve(C.YL,k);
  return {left:c.r0.left+(c.r1.left-c.r0.left)*px_,right:c.r0.right+(c.r1.right-c.r0.right)*px_,
    top:c.r0.top+(c.r1.top-c.r0.top)*py,bottom:c.r0.bottom+(c.r1.bottom-c.r0.bottom)*py};
}
/* the carrier corridor: no part begins while any carrier's remaining path still crosses it (24 samples, 4px inflate) */
function clear(r,carriers){
  var t=0;
  carriers.forEach(function(c){
    for(var i=0;i<=24;i++){var ts=c.t+c.d*i/24;if(hit(at3(c,ts),r,4))t=Math.max(t,i<24?c.t+c.d*(i+1)/24:c.t+c.d);}
  });
  return Math.ceil(t);
}
/* The field: t = 520 + 1480·u^1.25 on the nearest-point metric, then the corridor, then the cap (12 desktop, 8 phone).
   Reduced motion: 0-400, fades only, no corridor (nothing travels). Every onset is at or before 2000. */
function field(units,carriers,v,rm){
  var dmax=units.reduce(function(m,u){return Math.max(m,u.d);},1),cap=v.phone?S.pCap:S.cap;
  units.forEach(function(u){
    var k=Math.pow(u.d/dmax,1.25);
    u.base=Math.round(rm?S.rmSpan*k:S.T0+S.span*k);
    u.t=rm?u.base:Math.max(u.base,clear(u.r,carriers));
  });
  units.sort(function(a,b){return a.t-b.t||a.d-b.d;});
  var done=[];
  units.forEach(function(u){
    for(;;){
      var live=done.filter(function(x){return x.t<=u.t&&x.t+x.dur>u.t;});
      if(live.length<cap)break;
      u.t=Math.min.apply(null,live.map(function(x){return x.t+x.dur;}));
    }
    u.t=Math.min(u.t,rm?S.rmSpan:S.last);
    u.kids.forEach(function(k){k.t=Math.min(u.t+k.off,rm?S.rmSpan:S.last);});
    done.push(u);
  });
  return units;
}

/* ---------- 5. Act 1 (compose) and Act 2 (hold) ---------- */
S.draw=560;
var GONE=[{opacity:1,visibility:'visible'},{opacity:0,visibility:'hidden'}],last=null;
function run(el,kf,t,dur,e){var a=el.animate(kf,{delay:ms(t),duration:ms(dur),easing:e,fill:'both'});st.anims.push(a);return a;}
function later(fn,t){st.timers.push(setTimeout(fn,ms(t)));}
function put(el,prop,val){st.saved.push([el,prop,el.style[prop]]);el.style[prop]=val;}
function cssVar(n){return getComputedStyle(root).getPropertyValue(n).trim();}
function current(){ /* phone: the current stage stays in view in the sideways spine */
  var sp=$('.spine'),cur=sp&&$('[aria-current]',sp);
  if(!cur||!(sp.scrollWidth>sp.clientWidth))return;
  var a=cur.getBoundingClientRect(),b=sp.getBoundingClientRect();
  if(a.right>b.right-16)sp.scrollLeft+=a.right-b.right+16;else if(a.left<b.left+16)sp.scrollLeft-=b.left+16-a.left;
}
function start(o){
  finish();
  o=o||{};
  if(!BOX||!K)return false;
  var card=BOX.card,H=part('headline');
  if(!H||busy())return false;
  var A1=card.act?part('act'):null,A2=card.act2?part('act2'):null,rm=!!o.rm||K.rm(),v=view(),y=readingY(v,H,A1);
  if(Math.abs((w.scrollY||0)-y)>.5)w.scrollTo(0,y); /* one pre-paint position; zero scroll writes after t0 */
  current();
  var s=st={o:o,rm:rm,card:card,H:H,A:A1,A2:A2,v:v,y:w.scrollY||0,phase:'compose',anims:[],saved:[],nodes:[],timers:[],comp:[],carry:[],ua:[],cc:[],
    kbd:!!o.kbd,raf:0,g0:0,last:0,gaps:[],thin:false,actAt:Infinity,left:0,at:0,pz:{focus:false,hidden:false},paused:false,holdT:0,cue:[],adv:0,
    faint:cssVar('--text-faint')};
  status.textContent='';
  var skip=mk('button','arr-skip','Skip arrival'),hint=mk('p','arr-vh','Skip goes straight to the page; any key opens it.');
  skip.type='button';skip.setAttribute('data-arr','');skip.setAttribute('aria-describedby','arr-hint');hint.id='arr-hint';hint.setAttribute('data-arr','');
  skip.addEventListener('click',function(){finish(true);});
  d.body.appendChild(hint);d.body.appendChild(skip);s.nodes.push(hint,skip);s.skip=skip;
  var b=build(card),L=s.L=b.L,layer=s.layer=b.layer;d.body.appendChild(layer);s.nodes.push(layer);
  var keep=[H,A1,A2],canon=[];
  ['name','stage','job','warn','f1'].concat(rm?['f2','f3']:[]).forEach(function(n){parts(n).forEach(function(el){if(keep.indexOf(el)<0){keep.push(el);canon.push(el);}});});
  keep=keep.filter(Boolean);
  var p=s.p=null,G;
  if(rm){
    Object.keys(L).forEach(function(k){if(k!=='cue')L[k].hidden=true;});
    var an=box(A1||H);
    L.cue.style.left=px(an.left);L.cue.style.top=px(an.bottom+24+s.y);L.cue.style.opacity="0";
    G=ink(H)||box(H);
  }else{
    var flat=!!o.flat||K.arrScale0,warnEl=card.warn>=0?L['f'+(card.warn+1)]:null;
    p=s.p=plan(card,v,H,A1,A2,L,skip,flat);G=p.G;
    Object.keys(p.m).forEach(function(k){var m=p.m[k];L[k].style.left=px(m.left);L[k].style.top=px(m.top+s.y);if(L[k]!==warnEl)L[k].style.opacity='0';});
    s.lineCol=getComputedStyle(L.line).backgroundColor;
  }
  /* the page's parts in the first view: covered now, assembled in Act 3 */
  var c=collect(keep,v),units=c.units.map(function(el){return unit(el,G,v,rm);});
  c.through.forEach(function(el){var u=unit(el,G,v,rm);if(u.rules.length){u.kind='rules';u.kids=[];u.off=0;u.dur=rm?S.rmPart:S.stem;units.push(u);}});
  s.units=field(units,p?p.carriers:[],v,rm);
  var rl=mk('div','arr-rules'),rf=mk('div','arr-rules-fix');rl.setAttribute('data-arr','');rf.setAttribute('data-arr','');
  s.units.forEach(function(u){
    u.rules.forEach(function(o){put(u.el,o.prop,'transparent');if(rm){o.el.style.transform='none';o.el.style.opacity='0';}(o.fix?rf:rl).appendChild(o.el);});
    if(u.kind==='rules')return;
    if(u.kids.length)u.kids.forEach(function(k){put(k.el,'opacity','0');});else put(u.el,'opacity','0');
  });
  d.body.appendChild(rl);d.body.appendChild(rf);s.nodes.push(rl,rf);
  s.settle=parts('settle').map(function(el){return {el:el,col:getComputedStyle(el).color};});
  s.canon=canon;
  if(!rm)canon.forEach(function(el){put(el,'opacity','0');});
  s.sched={page:root.getAttribute('data-arrival'),rm:rm,phone:v.phone,cap:v.phone?S.pCap:S.cap,d:p?p.d:0,s:p?p.s:1,
    carriers:p?p.carriers:[],units:s.units.map(function(u){return {t:u.t,base:u.base,d:u.d,dur:u.dur,kind:u.kind,r:u.r,kids:u.kids.map(function(k){return k.t;}),el:u.el};})};
  root.classList.add('arr-on');root.classList.remove('arr-pre');
  [A1,A2].forEach(function(a){if(a)put(a,'pointerEvents','auto');}); /* the one live target while the rest takes no hits */
  if(!rm)stage(s,p,H,A1,A2);
  s.t0=performance.now();
  compose(s);
  guard();
  last=s;
  return true;
}
/* the carriers, placed on the card: x (and scale) on transform, y on the independent translate property */
function stage(s,p,H,A1,A2){
  put(H,'transformOrigin',px(p.origin[0])+' '+px(p.origin[1]));put(H,'translate','0px '+px(p.hy));put(H,'transform',tfx(p.hx,p.s));put(H,'willChange','transform');
  if(p.act){put(A1,'translate','0px '+px(p.act.y));put(A1,'transform',tfx(p.act.x,1));}
  if(p.act2){put(A2,'translate','0px '+px(p.act2.y));put(A2,'transform',tfx(p.act2.x,1));}
}
function grow(el,t,dur,phone){el.style.transformOrigin=phone?'0 50%':'50% 50%';return run(el,[{opacity:0,transform:'scale(.94)'},{opacity:1,transform:'scale(1)'}],t,dur,cb(C.X));}
function draw(el,t,dur){return run(el,[{transform:'scaleX(0)',transformOrigin:'0 50%'},{transform:'scaleX(1)',transformOrigin:'0 50%'}],t,dur,cb(C.DRAW));}
/* Act 1: the card composes line by line, each growing from the back; the past-due line is readable from frame 0 */
function compose(s){
  var L=s.L,p=s.p,ph=s.v.phone,c=s.comp,end;
  if(s.rm){
    var seq=['name','stage','job','headline','f1','f2','f3','act','act2'].map(function(n){return n==='headline'?s.H:n==='act'?s.A:n==='act2'?s.A2:part(n);})
      .filter(function(el,i,a){return el&&a.indexOf(el)===i;});
    seq.forEach(function(el,i){if(el===s.A)s.actAt=s.t0+ms(i*S.rmStag);c.push(run(el,[{opacity:0},{opacity:1}],i*S.rmStag,S.rmLine,cb(C.Q)));});
    end=(seq.length-1)*S.rmStag+S.rmLine;
  }else{
    ['crown','place','slug','day','job'].forEach(function(k){if(L[k])c.push(grow(L[k],S[k][0],S[k][1],ph));});
    var blur=!ph;
    c.push(s.cc[0]=run(s.H,[{opacity:0,transform:tfx(p.hx,p.s*.94),filter:blur?'blur(6px)':'none'},{opacity:1,transform:tfx(p.hx,p.s),filter:blur?'blur(0px)':'none'}],S.H[0],S.H[1],cb(C.X)));
    ['f1','f2','f3'].forEach(function(k,i){if(L[k]&&i!==s.card.warn)c.push(grow(L[k],S.F[i],S.fD,ph));});
    if(p.act){
      s.actAt=s.t0+ms(S.act[0]); /* hit-testable once it shows */
      c.push(s.cc[1]=run(s.A,[{opacity:0,transform:tfx(p.act.x,.94)},{opacity:1,transform:tfx(p.act.x,1)}],S.act[0],S.act[1],cb(C.X)));
      var r=$('.rule',s.A);if(r)c.push(s.cc[2]=draw(r,S.rule[0],S.rule[1]));
    }
    if(p.act2)c.push(s.cc[3]=run(s.A2,[{opacity:0,transform:tfx(p.act2.x,.94)},{opacity:1,transform:tfx(p.act2.x,1)}],S.act2[0],S.act2[1],cb(C.X)));
    end=S.CE;
  }
  later(hold,end);
}
function inCard(el){var s=st;return !!(s&&el&&(el===s.A||el===s.A2||el===s.skip||(s.A&&s.A.contains(el))||(s.A2&&s.A2.contains(el))));}
/* Act 2: still, waiting for her. The one polite message; the cue at +1.5s; one 120px hairline over what is left of the 10s.
   Focus in the card or a hidden page pauses it; a page already hidden when the hold starts starts paused (R9c, R9d). */
function hold(){
  var s=st;
  if(!s||s.phase!=='compose')return;
  s.phase='hold';stopGuard();
  status.textContent=message(s.card);
  s.cue=[run(s.L.cue,[{opacity:0},{opacity:1}],S.cue,s.rm?S.rmCueIn:S.cueIn,cb(s.rm?C.Q:C.X))];
  if(!s.rm)s.cue.push(s.line=run(s.L.line,[{transform:'scaleX(0)'},{transform:'scaleX(1)'}],S.cue,S.hold-S.cue,'linear'));
  s.left=ms(S.hold);s.at=performance.now();s.paused=false;
  s.pz.hidden=!!(d.visibilityState&&d.visibilityState!=='visible');
  s.pz.focus=inCard(d.activeElement);
  if(s.pz.hidden||s.pz.focus){s.paused=true;s.cue.forEach(function(a){a.pause();});freeze(true);}
  else s.holdT=setTimeout(function(){advance('timer');},s.left);
}
function sync(){
  var s=st;
  if(!s||s.phase!=='hold')return;
  var want=s.pz.focus||s.pz.hidden;
  if(want&&!s.paused){
    clearTimeout(s.holdT);s.left=Math.max(0,s.left-(performance.now()-s.at));s.paused=true;
    s.cue.forEach(function(a){if(a.playState==='running')a.pause();});freeze(true);
  }else if(!want&&s.paused){
    s.paused=false;s.at=performance.now();s.holdT=setTimeout(function(){advance('timer');},s.left);
    s.cue.forEach(function(a){if(a.playState==='paused')a.play();});freeze(false);
  }
}
/* the hairline holds and cools to text-faint over 200ms while she is on the card */
function freeze(on){
  var s=st;if(!s||s.rm||!s.L.line)return;
  if(s.frz){s.frz.cancel();s.frz=null;}
  if(on)s.frz=run(s.L.line,[{backgroundColor:s.lineCol},{backgroundColor:s.faint}],0,S.freeze,cb(C.Q));
}

/* ---------- 6. Act 3: the hand-off and the assembly. Input never cancels it; nothing here reads layout. ---------- */
/* One advance, exactly once (R9a): from Act 1 it completes the card at once, from Act 2 it opens the page. */
function advance(src){
  var s=st;
  if(!s||s.phase==='assemble')return false;
  if(s.phase==='compose'){s.cut=true;s.comp.forEach(function(a){try{a.finish();}catch(e){}});}
  return assemble(src);
}
function flight(el,x,s0,y,t,dd){
  st.carry.push(run(el,[{transform:tfx(x,s0)},{transform:tfx(0,1)}],t,dd,cb(C.IO)),run(el,[{translate:'0px '+px(y)},{translate:'0px 0px'}],t,dd,cb(C.YL)));
}
function assemble(src){
  var s=st;
  if(!s||s.phase==='assemble')return false; /* re-entry guard */
  clearTimeout(s.holdT);s.timers.forEach(clearTimeout);s.timers=[];stopGuard();
  s.phase='assemble';s.adv++;s.src=src||'';
  root.classList.add('arr-asm');
  var rm=s.rm,p=s.p,L=s.L,end=0;
  if(d.activeElement===s.skip)calm(s.A||part('head')||d.body); /* Skip is gone by Act 3; focus never falls with it */
  run(s.skip,GONE,0,S.skipOut,cb(C.Q));
  if(s.frz){s.frz.cancel();s.frz=null;}
  if(!rm){
    /* the carriers: arc home, x on IO and y on YL, duration by distance; each act follows the sentence by 60ms */
    s.cc.forEach(function(a){a.cancel();}); /* the carriers leave from where the card holds them */
    flight(s.H,p.hx,p.s,p.hy,S.hand,p.d);end=S.hand+p.d;
    if(p.act){flight(s.A,p.act.x,1,p.act.y,S.hand+S.lag,p.d);end=Math.max(end,S.hand+S.lag+p.d);}
    if(p.act2){flight(s.A2,p.act2.x,1,p.act2.y,S.hand+2*S.lag,p.d);end=Math.max(end,S.hand+2*S.lag+p.d);}
    later(land,end);
    /* the doubles ride home translate-only; the canonical line prints 120ms before landing and the double dissolves into it.
       The past-due line hands off in one frame at landing: the only visible warning never fades. */
    p.rides.forEach(function(q){
      var el=L[q.k],T=S.hand+q.d;
      run(el,[{transform:'translate(0px,0px)'},{transform:'translate('+px(q.dx)+',0px)'}],S.hand,q.d,cb(C.IO));
      run(el,[{translate:'0px 0px'},{translate:'0px '+px(q.dy)}],S.hand,q.d,cb(C.YL));
      if(q.warn){run(q.canon,[{opacity:0},{opacity:1}],T,1,'linear');run(el,[{opacity:1},{opacity:0}],T,1,'linear');}
      else{run(q.canon,[{opacity:0},{opacity:1}],T-S.lead,1,'linear');run(el,[{opacity:1},{opacity:0}],T-S.lead,S.dissolve,cb(C.Q));}
      end=Math.max(end,T);
    });
    /* the context exits backward, last line first, 40ms apart */
    var rides=p.rides.map(function(q){return q.k;});
    ['f3','f2','f1','job','day','slug','place','crown'].filter(function(k){return L[k]&&rides.indexOf(k)<0;}).forEach(function(k,i){
      run(L[k],[{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.96)'}],i*S.exitStep,S.exit,cb(C.EXIT));end=Math.max(end,i*S.exitStep+S.exit);
    });
    var pr=0;
    if(s.line){var ct=s.line.currentTime||0;pr=Math.max(0,Math.min(1,(ct-ms(S.cue))/ms(S.hold-S.cue)));s.line.cancel();}
    run(L.line,[{transform:'scaleX('+r2(pr)+')',opacity:1},{transform:'scaleX(1)',opacity:1}],0,S.lineDone,cb(C.Q));
    run(L.line,[{opacity:1},{opacity:0}],S.lineDone,S.lineFade,cb(C.Q));
    s.canon.forEach(function(el){if(el.matches('[data-part~="name"],[data-part~="stage"]'))run(el,[{opacity:0},{opacity:1}],0,1,'linear');});
  }
  run(L.cue,[{opacity:1},{opacity:0}],0,S.cueOut,cb(C.Q));
  /* the page assembles from its own parts: nearest the landed sentence first, each growing from the back */
  var now=performance.now(),fe=0;
  function part3(el,kf,t,dur,e){var a=run(el,kf,t,dur,e);s.ua.push({a:a,el:el,at:now+ms(t)});fe=Math.max(fe,t+dur);return a;}
  var FADE=[{opacity:0,transform:'none'},{opacity:1,transform:'none'}],X=cb(C.X);
  s.units.forEach(function(u){
    u.rules.forEach(function(o){
      if(rm)part3(o.el,FADE,u.t,S.rmPart,cb(C.Q));
      else if(o.side==='Left')part3(o.el,[{transform:'scaleY(0)'},{transform:'scaleY(1)'}],u.t,S.stem,cb(C.DRAW));
      else part3(o.el,[{transform:'scaleX(0)'},{transform:'scaleX(1)'}],u.t,S.draw,cb(C.DRAW));
    });
    if(u.kind==="rules")return;
    if(rm){
      if(u.kids.length)u.kids.forEach(function(k){part3(k.el,[{opacity:0},{opacity:1}],k.t,S.rmPart,cb(C.Q));});
      else part3(u.el,[{opacity:0},{opacity:1}],u.t,S.rmPart,cb(C.Q));
    }else if(u.kind==='stem'){
      u.kids.forEach(function(k){part3(k.el,[{opacity:0,transform:'translate(-6px,0px)'},{opacity:1,transform:'translate(0px,0px)'}],k.t,S.rise,X);});
    }else if(u.kind==='list'){
      u.kids.forEach(function(k){k.el.style.transformOrigin=k.origin;part3(k.el,[{opacity:0,transform:'translate(0px,6px) scale(.96)'},{opacity:1,transform:'translate(0px,0px) scale(1)'}],k.t,S.rise,X);});
    }else{
      if(u.inline)part3(u.el,[{opacity:0},{opacity:1}],u.t+u.off,S.rise,X);
      else{put(u.el,'transformOrigin',u.origin);part3(u.el,[{opacity:0,transform:'translate(0px,6px) scale(.96)'},{opacity:1,transform:'translate(0px,0px) scale(1)'}],u.t+u.off,S.rise,X);}
      if(u.kind==='act')part3(u.rule,[{transform:'scaleX(0)',transformOrigin:'0 50%'},{transform:'scaleX(1)',transformOrigin:'0 50%'}],u.t+S.actRule,S.rule[1],cb(C.DRAW));
    }
  });
  /* the closing clay settle at field end: the state word warms from faint to its own colour */
  var sEnd=fe;
  s.settle.forEach(function(x){run(x.el,[{color:s.faint},{color:x.col}],fe,S.settle,cb(C.Q));sEnd=fe+S.settle;});
  end=Math.max(end,sEnd,S.cueOut,S.skipOut);
  s.sched.fieldEnd=fe;s.sched.rest=end;s.sched.advanced=s.adv;
  later(function(){finish(true);},end);
  guard();
  return true;
}
function land(){
  var s=st;if(!s)return;
  s.landed=true;
  [s.H,s.A,s.A2].forEach(function(el){if(el){el.style.transform='';el.style.translate='';el.style.transformOrigin='';el.style.willChange='';}});
  s.carry.forEach(function(a){a.cancel();});
}
/* ---------- 7. the frame watch and the guard ladder (R-DM26 A): Act 1 trips to the hold; the first Act 3 trip thins the
   assembly to fades; the second snaps to rest. The hold is never watched. ---------- */
function guard(){var s=st;if(!s)return;s.g0=performance.now();s.last=0;s.gaps=[];if(s.raf)cancelAnimationFrame(s.raf);s.raf=requestAnimationFrame(tick);}
function stopGuard(){if(st&&st.raf){cancelAnimationFrame(st.raf);st.raf=0;}}
function tick(now){
  var s=st;if(!s)return;
  s.raf=0;
  if(s.phase==='hold')return;
  var g=now-(s.last||s.g0),n=s.gaps.push(g);
  if((n<=3&&g>50)||g>100||(n>1&&g>34&&s.gaps[n-2]>34)){trip();return;}
  s.last=now;s.raf=requestAnimationFrame(tick);
}
function trip(){
  var s=st;if(!s)return;
  s.trips=(s.trips||0)+1;
  if(s.phase==='compose'){s.comp.forEach(function(a){try{a.finish();}catch(e){}});hold();return;}
  if(!s.thin){s.thin=true;thin();guard();return;}
  finish(true);
}
function thin(){
  var s=st,now=performance.now();
  s.ua.forEach(function(x){
    if(x.at<=now)return;
    x.a.cancel();
    s.anims.push(x.el.animate([{opacity:0,transform:'none'},{opacity:1,transform:'none'}],{delay:x.at-now,duration:ms(S.thin),easing:'linear',fill:'both'}));
  });
}
/* One idempotent finish: the resting frame now, nothing pending. It never saves, sends, resets, opens or closes her work. */
function finish(normal){
  var s=st;if(!s)return;
  st=null;
  clearTimeout(s.holdT);s.timers.forEach(clearTimeout);if(s.raf)cancelAnimationFrame(s.raf);
  var held=d.activeElement===s.skip;
  s.anims.forEach(function(a){a.cancel();});
  for(var i=s.saved.length-1;i>=0;i--)s.saved[i][0].style[s.saved[i][1]]=s.saved[i][2];
  [s.H,s.A,s.A2].forEach(function(el){if(el){el.style.translate='';}});
  s.units.forEach(function(u){u.kids.forEach(function(k){k.el.style.transformOrigin='';});});
  s.nodes.forEach(function(n){if(n.parentNode)n.parentNode.removeChild(n);});
  root.classList.remove('arr-on','arr-asm','arr-pre');
  s.sched.finished=normal===true?'rest':'cut';
  var a=d.activeElement,free=!a||a===d.body||held;
  if(held||(normal===true&&s.kbd&&free)){var to=landing(s);if(to)calm(to);} /* landing focus is not an address */
}
/* a doorway verb takes focus on the act; a terminal verb, or no act, on the section heading (SQ-330 §5) */
function landing(s){return s.A&&DOORWAY.test(s.card.act||'')?s.A:part('head')||s.A||null;}
function calm(el){quiet=true;try{el.focus({preventScroll:true});}finally{quiet=false;}}

/* ---------- 8. input (O1). Acts 1-2: any advancing input opens the page; Skip alone goes to rest; a completed activation of
   the act acts on it directly, exactly once. Act 3: input never cancels; scrolling scrolls; a control snaps to rest first. ---------- */
var LONE=/^(Shift|Control|Alt|Meta|CapsLock|Fn|FnLock|Hyper|Super|OS|AltGraph)$/;
var SCROLL=/^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|PageUp|PageDown|Home|End| |Spacebar)$/;
function halt(){if(wait)wait(false,true);} /* input during the font wait ends it for good: the resting page, no later start */
function cut(){halt();finish();}
function early(){return st&&st.phase!=='assemble';}
function focusables(){var s=st;return [s.A&&performance.now()>=s.actAt?s.A:null,s.A2&&performance.now()>=s.actAt?s.A2:null,s.skip].filter(Boolean);}
function activate(el){finish();own=true;try{el.click();}finally{own=false;}} /* the act she chose, exactly once, no assembly first */
function onKey(e){
  if(wait){halt();if(e.key==='Escape'){e.preventDefault();e.stopPropagation();}return;}
  if(!st)return;
  var s=st,a=d.activeElement;
  if(early()){
    if(e.key==='Tab'){ /* focus moves within the card: act, second act, Skip */
      e.preventDefault();e.stopPropagation();
      var f=focusables(),i=f.indexOf(a);
      calm(f[(i<0?(e.shiftKey?f.length-1:0):(i+(e.shiftKey?f.length-1:1)))%f.length]);
      s.pz.focus=true;sync();return;
    }
    if(LONE.test(e.key))return;
    if(e.key==='Enter'||e.key===' '||e.key==='Spacebar'){
      if(a===s.A||a===s.A2){e.preventDefault();e.stopPropagation();activate(a);return;}
      if(a===s.skip){e.preventDefault();e.stopPropagation();finish(true);return;}
    }
    if(SCROLL.test(e.key)||e.key==='Enter'||e.key==='Escape')e.preventDefault(); /* they open the page rather than scroll it away */
    if(e.key==='Escape')e.stopPropagation(); /* never also the put-down */
    s.kbd=true;advance('key');return;
  }
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();} /* Act 3: Escape is swallowed; other keys act natively */
}
function control(t){return t&&t.closest&&t.closest(CTRL);}
function onDown(e){
  if(wait){halt();swallow=true;return;}
  if(!st)return;
  var s=st,t=e.target,ours=t.closest&&t.closest('.mc,[data-arr-replay],.arr-skip');
  if(ours)return;
  var act=[s.A,s.A2].filter(function(x){return x&&x.contains(t);})[0];
  if(act&&!(e.button>0)&&performance.now()>=s.actAt){ /* a press on the real act: it acts on release over it */
    press={id:e.pointerId,r:act.getBoundingClientRect(),act:act,y:w.scrollY||0};swallow=true;return;
  }
  if(early()){s.kbd=false;swallow=true;advance('pointer');return;}
  if(control(t)&&!(s.layer&&s.layer.contains(t)))finish(); /* Act 3: a control snaps to rest, then acts natively, once */
}
function onUp(e){
  var p=press;press=null;
  if(swallow)setTimeout(function(){swallow=false;},0);
  if(!p||e.pointerId!==p.id)return;
  var r=p.r,x=e.clientX,y=e.clientY;
  if(!(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)){if(early()){st.kbd=false;advance('pointer');}return;}
  finish();
  own=true; /* the press's own completed activation, carrying her modifier keys */
  try{p.act.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:w,detail:1,button:0,clientX:x,clientY:y,ctrlKey:e.ctrlKey,metaKey:e.metaKey,shiftKey:e.shiftKey,altKey:e.altKey}));}
  finally{own=false;}
}
function onClick(e){
  if(own)return;
  if(swallow){swallow=false;e.preventDefault();e.stopPropagation();return;}
  if(!st)return;
  var t=e.target;
  if(t.closest&&t.closest('.mc,[data-arr-replay],.arr-skip'))return;
  if(early()&&(t===st.A||t===st.A2||(st.A&&st.A.contains(t)))){finish();return;} /* assistive activation without a press is honoured */
  if(!early()&&control(t))finish();
}
function onTouch(){if(wait)return cut();if(early()){st.kbd=false;advance('touch');}} /* a swipe advances; its scroll never finishes */
function onWheel(){press=null;if(wait)return cut();if(early()){st.kbd=false;advance('wheel');}}
function onScroll(){
  if(press&&Math.abs((w.scrollY||0)-press.y)>.5)press=null;
  if(!st||Math.abs((w.scrollY||0)-st.y)<=.5)return;
  if(early())advance('scroll'); /* Act 3 scrolls natively while the parts keep assembling */
}
function onFocus(e){
  if(quiet){e.stopPropagation();return;}
  if(!st)return;
  if(inCard(e.target)){st.pz.focus=true;sync();return;}
  if(e.target===w||e.target===d)return;
  if(early())advance('focus');else finish();
}
function onBlurIn(){var s=st;if(!s)return;setTimeout(function(){if(st===s){s.pz.focus=inCard(d.activeElement);sync();}},0);}
/* a width change re-lays the page: rest. A height-only change (the phone's toolbar during a scroll) is not input and changes nothing. */
function onResize(){if(st&&Math.abs((root.clientWidth||w.innerWidth)-st.v.vw)>1)finish();}
function wire(){
  if(wired)return;
  wired=true;
  root.addEventListener('keydown',onKey,true);
  root.addEventListener('pointerdown',onDown,true);
  root.addEventListener('click',onClick,true);
  root.addEventListener('pointerup',onUp,true);
  root.addEventListener('pointercancel',function(){press=null;swallow=false;},true);
  root.addEventListener('pointermove',function(e){if(st)e.stopPropagation();},true); /* assembly under a still pointer never addresses a line */
  root.addEventListener('focusin',onFocus,true);
  root.addEventListener('focusout',onBlurIn,true);
  root.addEventListener('wheel',onWheel,{capture:true,passive:true});
  root.addEventListener('touchstart',onTouch,{capture:true,passive:true});
  d.addEventListener('selectionchange',function(){var s=st&&w.getSelection();if(s&&!s.isCollapsed)finish();});
  w.addEventListener('scroll',onScroll,{passive:true});
  w.addEventListener('resize',onResize);
  if(w.visualViewport)w.visualViewport.addEventListener('resize',onResize);
  w.addEventListener('pagehide',cut);w.addEventListener('beforeprint',cut);
  w.addEventListener('pageshow',function(e){if(e.persisted)finish();});
  d.addEventListener('visibilitychange',function(){
    var s=st;if(!s)return;
    var hidden=!!(d.visibilityState&&d.visibilityState!=='visible');
    if(s.phase==='hold'){s.pz.hidden=hidden;sync();}
    else if(hidden)finish();
  });
  var osRM=w.matchMedia('(prefers-reduced-motion: reduce)');
  if(osRM.addEventListener)osRM.addEventListener('change',cut);
  var rm=$('#mc-rm'),tr=$('#mc-tr');
  if(rm)rm.addEventListener('change',cut);
  if(tr){tr.checked=K.arrScale0;tr.addEventListener('change',function(){K.arrScale0=tr.checked;});}
  $$('[data-arr-replay]').forEach(function(b){b.addEventListener('click',replay);});
}
/* ---------- 9. boot (O2): bare paper for at most 1,500ms while the card's faces load; input cancels to the resting page ---------- */
var FACES=['500 34px "Playfair Display"','500 20px "Playfair Display"','400 16px Inter','400 14px Inter','400 11px "DM Mono"','500 11px "DM Mono"'];
function faces(){return Promise.all(FACES.map(function(f){return d.fonts.load(f);}));}
function pre(budget,sim,go,no){
  var to=0,done=false;
  root.classList.add('arr-pre');
  wait=function(ok,skip){if(done)return;done=true;wait=null;clearTimeout(to);if(ok)go();else no(skip);};
  to=setTimeout(function(){if(wait)wait(false);},Math.max(0,budget));
  (sim?new Promise(function(r){setTimeout(r,sim);}):faces()).then(function(){if(wait)wait(true);},function(){if(wait)wait(false);});
}
function boot(k,decline){
  K=k;
  if(!status){status=mk('div','arr-vh');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('data-arr','');d.body.appendChild(status);}
  var el=d.getElementById('briefing');
  try{var inputs=JSON.parse(el.textContent);BOX={inputs:inputs,card:select(inputs,inputs.today,inputs.viewer)};}catch(err){BOX=null;}
  K.arrScale0=/[?&]scale=0(&|$)/.test(w.location.search);
  wire();clearTimeout(A.safety);
  function no(skip){root.classList.remove("arr-pre");if(decline&&!skip)decline();} /* a declined arrival lets the page make its own entry move */
  function go(){var ok=false;try{ok=start({kbd:A.kbd});}catch(err){try{finish();}catch(e){}}if(!ok)no();}
  if(!BOX||!A.play||(d.visibilityState&&d.visibilityState!=='visible'))return no();
  if(!d.fonts||!d.fonts.load)return no();
  var spent=0;try{spent=w.performance.now()-A.at;}catch(e){}
  pre(FONT_WAIT-spent,0,go,no);
}
/* Review only: from the resting start, as if she had just arrived. Keyboard activation earns the landing focus.
   Replay reduced, without scale and cold are one-shot: that replay only, nothing kept. Cold replays the O2 wait. */
function replay(e){
  var kbd=!!(e&&e.detail===0),b=e&&e.target&&e.target.closest?e.target.closest('[data-arr-replay]'):null,m=b?b.getAttribute('data-arr-replay'):'',a;
  halt();finish();
  a=d.activeElement;if(a&&a.closest&&a.closest('[data-arr-replay]')&&a.blur)a.blur();
  var o={kbd:kbd,replay:true,rm:m==='rm',flat:m==='translate'};
  if(m==='cold'){pre(FONT_WAIT,700,function(){if(!start(o))root.classList.remove('arr-pre');},function(){root.classList.remove('arr-pre');});return true;}
  return start(o);
}
Arrival.boot=function(k,decline){
  k.arrival={boot:function(){},replay:replay,finish:function(){finish();},running:function(){return !!st;},phase:function(){return st?st.phase:wait?'wait':null;},
    card:function(){return BOX&&BOX.card;},schedule:function(){return last&&last.sched;},advances:function(){return last?last.adv:0;},S:S,C:C};
  boot(k,decline);
};
Arrival.message=message;
})(window);
