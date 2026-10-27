(() => {
 'use strict';
 const storageKey = 'patina-room-proof-round2-v1';
 const views = new Map();
 const items = [
  {id:'chair',number:'01',name:'Oak lounge chair',maker:'Northline Workshop',material:'White oak / natural linen',retail:2480,cost:1736,lead:'8 weeks',dimensions:'29 × 32 × 31 in',image:'assets/chair-proof.png'},
  {id:'table',number:'02',name:'Walnut coffee table',maker:'Northline Workshop',material:'Solid walnut / clear oil',retail:1680,cost:1176,lead:'6 weeks',dimensions:'48 × 26 × 15 in',image:'assets/room.png'},
  {id:'sofa',number:'03',name:'Linen sofa',maker:'Fieldwork Upholstery',material:'Natural linen / feather blend',retail:4860,cost:3402,lead:'10 weeks',dimensions:'84 × 36 × 30 in',image:'assets/room.png'},
  {id:'lamp',number:'04',name:'Bronze floor lamp',maker:'Common Metalworks',material:'Bronze / linen shade',retail:740,cost:518,lead:'4 weeks',dimensions:'18 × 18 × 61 in',image:'assets/room.png'}
 ];
 const initial = () => ({selectedPiece:'chair',pinned:['chair','table','sofa'],quantities:{chair:2,table:1,sofa:1,lamp:1},studioFinish:'light',clientFinish:null,budget:15000,clientDeposit:6000,designApproved:false,purchaseAuthorized:false,poDraft:false,core:{},sourcing:{},studio:{},hours:[{id:'time-1',date:'2026-10-20',description:'Room direction and material study',minutes:150,rate:150,billable:true,invoiced:false},{id:'time-2',date:'2026-10-21',description:'Workshop coordination',minutes:60,rate:150,billable:true,invoiced:false},{id:'time-3',date:'2026-10-21',description:'Site notes',minutes:30,rate:null,billable:true,invoiced:false}],invoiceDraft:null,activity:[]});
 const state = initial();
 let storageAvailable = true;
 try { const saved=JSON.parse(localStorage.getItem(storageKey)||'null'); if(saved&&typeof saved==='object'&&!Array.isArray(saved)){Object.assign(state,saved);for(const key of ['core','sourcing','studio'])if(!state[key]||typeof state[key]!=='object'||Array.isArray(state[key]))state[key]={};state.pinned=Array.isArray(state.pinned)?state.pinned.filter(id=>items.some(p=>p.id===id)):initial().pinned;state.quantities={...initial().quantities,...state.quantities};if(!Array.isArray(state.hours))state.hours=initial().hours;if(!Array.isArray(state.activity))state.activity=[];} } catch {storageAvailable=false;}
 let current = 'desk';
 const tour = [
  ['desk','Studio overview','Begin with the work that needs your attention.'],
  ['project','Room & brief','Read the room, its brief, and the evidence behind it.'],
  ['engagement','Services agreement','Keep the engagement and its terms distinct from furnishings.'],
  ['library','Resource library','Find a piece and add its configuration to the project.'],
  ['piece','Piece proof','Set the material intention and inspect the specification.'],
  ['approvals','Client approvals','Issue a versioned question with the right reviewers.'],
  ['schedule','Project flow','See the consequences of a date change before applying it.'],
  ['accounts','Financials & accounts','Separate budget, authority, invoices, and payments.'],
  ['orders','Purchase orders','Prepare the order while its release holds remain visible.'],
  ['specbook','Spec book','Carry the shared specification into a printable document.'],
  ['people','Studio contacts','Find the person, their project seat, and the conversation.'],
  ['hours','Timesheets','Record work and turn eligible time into an invoice draft.'],
  ['inbox','Studio inbox','Return from a message or event to the work it belongs to.']
 ];
 const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number.isFinite(Number(value))?Number(value):0);
 const signature = () => JSON.stringify(state.pinned.slice().sort().map(id=>{const c=state.sourcing.configurations?.[id]||{};return[id,Number(state.quantities[id])||1,id==='chair'?state.studioFinish:(c.finish||'light'),!!c.com,c.comNote||'',c.customBrief||''];}));
 const persist = () => {try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{storageAvailable=false;}};
 const selected = () => items.filter(item=>state.pinned.includes(item.id)).map(item=>({...item,qty:Number(state.quantities[item.id])||1,quantity:Number(state.quantities[item.id])||1}));
 const totals = () => {const chosen=selected();const retail=chosen.reduce((n,p)=>n+p.retail*p.qty,0),cost=chosen.reduce((n,p)=>n+p.cost*p.qty,0),freight=chosen.length?600:0,tax=Math.round(retail*.055*100)/100;return {retail,cost,freight,tax,total:retail+freight+tax};};
 const link = (view,params={}) => {const url=new URL('mockup.html',location.href);url.searchParams.set('view',view);for(const[k,v]of Object.entries(params))url.searchParams.set(k,String(v));return url.href;};
 function feedback(message){const el=document.querySelector('#app-feedback');if(el){el.hidden=!message;requestAnimationFrame(()=>{el.textContent=message;});}}
 function focusKey(){const el=document.activeElement;if(!el||!el.closest('#view-root'))return null;if(el.id)return '#'+CSS.escape(el.id);const attr=[...el.attributes].find(a=>a.name.startsWith('data-'));if(attr)return `[${attr.name}="${CSS.escape(attr.value)}"]`;if(el.name)return `${el.form?.id?'#'+CSS.escape(el.form.id)+' ':''}[name="${CSS.escape(el.name)}"]${['radio','checkbox','submit'].includes(el.type)&&el.hasAttribute('value')?`[value="${CSS.escape(el.value)}"]`:''}`;if(el.form?.id)return '#'+CSS.escape(el.form.id)+' '+el.tagName.toLowerCase();return null;}
 function context(){return{root:document.getElementById('view-root'),state,items,selected,totals,money,escape,link,go,refresh:render,feedback,update(fn){const focus=focusKey(),before=signature(),wasApproved=state.designApproved;fn(state);if(!wasApproved&&state.designApproved){state.approvedSignature=signature();state.core.changedSinceApproval=false;}else if(wasApproved&&signature()!==before){state.designApproved=false;state.purchaseAuthorized=false;state.core.changedSinceApproval=true;}persist();render();if(focus)document.querySelector(focus)?.focus({preventScroll:true});}};}
 function render(){
  const view=views.get(current);if(!view)return;
  const root=document.getElementById('view-root'),status=document.getElementById('app-feedback')||document.createElement('p');root.innerHTML=view.render(context());
  window.RoundTwo?.transform(context(),current);
  status.id='app-feedback';status.className='inline-status';status.setAttribute('role','status');status.hidden=true;status.textContent='';
  const head=root.querySelector('.view-head');if(head)head.after(status);else root.prepend(status);
  document.body.dataset.view=current;document.title=`${view.title} — Patina Room Proof`;
  const navigation=document.querySelector('.project-navigation');navigation.hidden=!['project','piece','approvals','schedule','accounts','specbook','engagement','hours'].includes(current);
  document.querySelectorAll('[data-go]').forEach(a=>{if(a.dataset.go===current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const index=tour.findIndex(v=>v[0]===current);document.getElementById('tour-select').value=current;document.getElementById('tour-count').textContent=`${index+1} / ${tour.length}`;document.getElementById('tour-purpose').textContent=tour[index]?.[2]||'';
  document.getElementById('tour-previous').disabled=index<=0;document.getElementById('tour-next').disabled=index>=tour.length-1;
  if(view.bind)view.bind(context());
  window.RoundTwo?.bind(context(),current);
  if(!storageAvailable)feedback('Browser storage is unavailable. This example works during the current visit.');
 }
 function go(view,params={}){if(!views.has(view))return;const changed=current!==view;if(params.house)state.selectedHouse=params.house;if(params.task==='receiving')state.sourcing.orderPage='receiving';if(params.task==='entry')state.studio.timeEntryOpen=true;if(params.person)state.studio.person=params.person;if(params.piece&&items.some(i=>i.id===params.piece))state.selectedPiece=params.piece;current=view;const target=link(view,params);if(location.href!==target)history[window.self===window.top?'pushState':'replaceState']({},'',target);persist();render();document.querySelectorAll('details[open]').forEach(d=>{if(d.closest('.app-masthead')||d.closest('.global-nav'))d.open=false;});if(changed){window.scrollTo({top:0,behavior:'instant'});document.querySelector('#view-root h1')?.focus({preventScroll:true});document.getElementById('route-announcement').textContent=views.get(view).title;}}
 function readRoute(){const params=new URLSearchParams(location.search);current=views.has(params.get('view'))?params.get('view'):'desk';if(params.get('house'))state.selectedHouse=params.get('house');if(params.get('task')==='receiving')state.sourcing.orderPage='receiving';if(params.get('task')==='entry')state.studio.timeEntryOpen=true;const person=params.get('person');if(person)state.studio.person=person;const piece=params.get('piece');if(items.some(i=>i.id===piece))state.selectedPiece=piece;}
 function search(){const query=document.getElementById('surface-search').value.trim().toLowerCase();document.getElementById('search-results').innerHTML=tour.filter(v=>(v[1]+' '+v[2]).toLowerCase().includes(query)).map(v=>`<a href="${escape(link(v[0]))}" data-go="${v[0]}">${v[1]}<span>${v[2]}</span></a>`).join('')||'<p>No matching place. Try “orders” or “approvals”.</p>';}
 function start(){
  document.getElementById('tour-select').innerHTML=tour.map(v=>`<option value="${v[0]}">${v[1]}</option>`).join('');
  document.addEventListener('click',event=>{const a=event.target.closest('[data-go]');if(!a||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();go(a.dataset.go,{...(a.dataset.piece?{piece:a.dataset.piece}:{}),...(a.dataset.person?{person:a.dataset.person}:{}),...(a.dataset.house?{house:a.dataset.house}:{}),...(a.dataset.task?{task:a.dataset.task}:{})});});
  document.getElementById('tour-select').addEventListener('change',e=>go(e.target.value));
  document.getElementById('tour-next').addEventListener('click',()=>go(tour[tour.findIndex(v=>v[0]===current)+1]?.[0]));
  document.getElementById('tour-previous').addEventListener('click',()=>go(tour[tour.findIndex(v=>v[0]===current)-1]?.[0]));
  document.getElementById('reset-example').addEventListener('click',()=>{Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,initial());persist();render();feedback('The example is reset. All local sample decisions and drafts have been cleared.');});
  document.getElementById('surface-search').addEventListener('input',search);search();
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.getElementById('find-surface').open=true;document.getElementById('surface-search').focus();}if(e.key==='Escape')document.querySelectorAll('.app-masthead details').forEach(d=>d.open=false);});
  window.addEventListener('popstate',()=>{readRoute();render();document.querySelector('#view-root h1')?.focus({preventScroll:true});});
  window.addEventListener('storage',event=>{if(event.key!==storageKey||!event.newValue)return;try{const saved=JSON.parse(event.newValue);if(saved&&Array.isArray(saved.pinned)&&saved.core&&saved.sourcing&&saved.studio){Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,initial(),saved);render();}}catch{}});
  readRoute();render();
 }
 window.RoomProof={get(id){return views.get(id);},register(id,view){views.set(id,view);},start};
})();
