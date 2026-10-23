(() => {
  'use strict';
  const RP = window.RoomProof;
  const projects = [
    {id:'mendota',name:'Lake Mendota House',room:'Living room',person:'Nora & Evan Ellis',stage:'Design review',next:'Nora’s decision',date:'28 Oct',image:'room.png',note:'A quiet room by the water. Oak, linen and an uninterrupted view.'},
    {id:'oak',name:'Oak Street Apartment',room:'Sitting room',person:'Maya Chen',stage:'In transit',next:'Receive the linen sofa',date:'10 Nov',image:'studio-room.jpg',note:'A city apartment with generous seating and a warm, collected feel.'},
    {id:'ridge',name:'Ridge House',room:'Dining room',person:'Oliver & Mae Reed',stage:'Material study',next:'Review the walnut sample',date:'23 Oct',swatches:true,note:'Walnut, woven seats and a table for the whole family.'},
    {id:'june',name:'June Cottage',room:'Guest room',person:'June Patel',stage:'Room planning',next:'Confirm the room measurements',date:'26 Oct',drawing:true,note:'A small guest room with room to breathe. A writing desk beside the window.'},
    {id:'monroe',name:'Monroe Townhouse',room:'Library',person:'Alex Brooks',stage:'Brief agreed',next:'Review the first room study',date:'29 Oct',drawing:true,note:'A room for reading, music and the books collected over a lifetime.'},
    {id:'cedar',name:'Cedar House',room:'Entrance',person:'Clara James',stage:'Material study',next:'Review the stone and oak',date:'30 Oct',swatches:true,note:'A welcoming entrance with a generous bench and a place for everyday things.'}
  ];
  const qs = (ctx,s) => ctx.root.querySelector(s);
  const qa = (ctx,s) => [...ctx.root.querySelectorAll(s)];
  function plan(p) { return `<svg viewBox="0 0 440 260" role="img" aria-label="Illustrative ${p.room.toLowerCase()} planning study"><path d="M54 220V42H382V220H218M148 220H54M148 220V154A66 66 0 0 1 214 220"/><path d="M126 38H292M126 48H292"/><rect x="${p.id==='june'?240:85}" y="76" width="110" height="80"/><path d="M240 95H350M260 76V156"/><rect x="83" y="80" width="65" height="42"/><circle cx="270" cy="187" r="22"/><path d="M54 242H382M54 237V247M382 237V247"/><text x="220" y="254" text-anchor="middle">Room study / not measured</text></svg>`; }
  const art = p => p.swatches ? `<div class="round-materials ${p.id}" role="img" aria-label="Illustrative ${p.id==='ridge'?'walnut and woven linen':'oak and stone'} material study"><span class="material-wood"></span><span class="material-fabric"></span><span class="material-caption">${p.id==='ridge'?'Walnut / linen':'Oak / limestone'}</span></div>` : p.drawing ? `<div class="round-plan ${p.id}">${plan(p)}</div>` : `<img src="assets/${p.image}" alt="${p.room} direction reference for ${p.name}">`;
  const projectLink = (ctx,p) => ctx.link(p.id==='mendota'?'project':'portfolio',p.id==='mendota'?{}:{house:p.id});
  function standing(ctx,{specimen=false,approved=ctx.state.designApproved,authorized=ctx.state.purchaseAuthorized,released=false,action=true,label='Current standing'}={}) {
    const changed = !specimen && ctx.state.core?.changedSinceApproval;
    return `<section class="round-standing" aria-label="${label}"><h3>${label}</h3><dl>
      <div><dt><span class="state-mark ${approved?'agreed':'open'}" aria-hidden="true"></span>Design</dt><dd>${approved?'Current edition approved':changed?'Changed since approval':'Review needed'}</dd></div>
      <div><dt><span class="state-mark ${authorized?'agreed':'held'}" aria-hidden="true"></span>Purchase authority</dt><dd>${authorized?'Recorded for this scope':'Not recorded'}</dd></div>
      <div><dt><span class="state-mark received" aria-hidden="true"></span>Money received</dt><dd>${ctx.money(ctx.state.clientDeposit)}<small>${released?'Allocation recorded in this specimen':'Held on the project'}</small></dd></div>
      </dl><div class="release-result"><strong>${released?'Order released':'Order release held'}</strong><p>${released?'Sent to the maker. Acceptance and delivery remain separate records.':`Still open: ${[!approved?'design review':'',!authorized?'purchase authority':'','deposit allocation'].filter(Boolean).join(', ')}.`}</p></div>
      ${specimen||!action?'':`<a class="text-button" href="${ctx.link(approved?'orders':'approvals')}" data-go="${approved?'orders':'approvals'}">${approved?'Review order holds':'Open the design review'} <span aria-hidden="true">↗</span></a>`}
    </section>`;
  }
  function portfolioDesk(ctx) {
    const status = ctx.state.designApproved ? 'Approved edition' : ctx.state.core?.changedSinceApproval ? 'Review changed selection' : 'Prepare Nora’s design review';
    return `<section class="round-projects" aria-labelledby="projects-title"><div class="round-section-head"><h2 id="projects-title">The rooms in hand</h2><span>6 projects</span></div><div class="round-contact-sheet">${projects.map((p,i)=>`<a class="round-project-card ${i===0?'featured':''}" href="${projectLink(ctx,p)}" data-go="${p.id==='mendota'?'project':'portfolio'}" ${p.id==='mendota'?'':`data-house="${p.id}"`}><figure>${art(p)}<figcaption>${p.room}${p.id==='mendota'?'':' / illustrative'}</figcaption></figure><div class="round-project-caption"><h3>${p.name}</h3><p>${p.id==='mendota'?(ctx.state.designApproved?'Design agreed':p.stage):p.stage}<span>${p.date}</span></p></div></a>`).join('')}</div></section>
    <section class="round-desk-actions" aria-labelledby="desk-today"><div class="round-section-head"><h2 id="desk-today">Next on your desk</h2><span>Wednesday, 21 Oct</span></div>
    <article class="round-task"><p>Lake Mendota House <time>28 Oct</time></p><h3>${status}</h3><div class="round-task-meta">${ctx.state.designApproved?'Purchasing remains held':'Leah → Nora Ellis'}</div><a href="${ctx.link('approvals')}" data-go="approvals">${ctx.state.designApproved?'Read the decision':'Prepare the review'} ↗</a></article>
    <article class="round-task"><p>Oak Street Apartment <time>10 Nov</time></p><h3>Receive the linen sofa</h3><div class="round-task-meta">Cedar Receiving · PO-021</div><a href="${ctx.link('orders',{task:'receiving'})}" data-go="orders" data-task="receiving">Open receiving record ↗</a></article>
    <article class="round-task"><p>Lake Mendota House <time>Today</time></p><h3>Price the unbilled time</h3><div class="round-task-meta">${ctx.state.hours.filter(h=>h.rate===null&&!h.invoiced).reduce((n,h)=>n+h.minutes,0)} minutes awaiting a rate · Leah</div><a href="${ctx.link('hours')}" data-go="hours">Review time & billing ↗</a></article>
    <article class="round-task"><p>Lake Mendota House <time>${ctx.state.studio.followupLater?'22 Oct':'Today'}</time></p><h3>Confirm the oak samples</h3><div class="round-task-meta">Leah → Sam at Northline</div><div class="studio-link-row"><button type="button" class="text-button" data-contact="northline">Open maker record ↗</button><button type="button" class="text-button" id="defer-followup">${ctx.state.studio.followupLater?'Bring back today':'Hold for tomorrow'}</button></div></article>
    <div class="round-desk-note"><p>“The grain, the linen and the view should feel at ease with one another.”</p><span>Leah’s note for Lake Mendota</span></div></section>`;
  }
  RP.register('portfolio', {
    title:'Project overview',family:'studio',
    render(ctx) {
      const p=projects.find(p=>p.id===ctx.state.selectedHouse&&p.id!=='mendota')||projects[1];
      return `<header class="view-head"><div><p class="eyebrow">${p.person} / ${p.room}</p><h1 tabindex="-1">${p.name}</h1></div><p class="lede">${p.note}</p></header><div class="round-portfolio"><figure>${art(p)}<figcaption>Illustrative project overview · reference imagery</figcaption></figure><aside class="round-portfolio-margin"><p class="annotation">${p.room}</p><h2>${p.stage}</h2><p>${p.next}</p><dl class="core-facts"><div><dt>Next date</dt><dd>${p.date} 2026</dd></div><div><dt>Studio lead</dt><dd>Leah Hartwell</dd></div></dl>${p.id==='oak'?`<a class="button" href="${ctx.link('orders',{task:'receiving'})}" data-go="orders" data-task="receiving">Inspect the sofa’s arrival</a>`:''}<div class="round-specimen-note"><strong>Overview study</strong><p>This additional project shows navigation and working context. Its design, money and approval records are not simulated.</p></div><a class="text-button" href="${ctx.link('desk')}" data-go="desk">Back to the studio desk</a></aside></div>`;
    }
  });
  RP.register('states', {
    title:'Decision states',family:'review',
    render(ctx) {
      return `<header class="view-head"><div><p class="eyebrow">Design review / static specimens</p><h1 tabindex="-1">The facts stay separate.</h1></div><p class="lede">Compare the same margin across different conditions. These examples do not change the working project.</p></header><div class="round-state-gallery">${[
        {label:'Review needed',approved:false,authorized:false},
        {label:'Approved, still held',approved:true,authorized:false},
        {label:'Authorized, still held',approved:true,authorized:true},
        {label:'Released to the maker',approved:true,authorized:true,released:true}
      ].map((s,i)=>`<article><p class="round-specimen-label">${i<2?'Specimen: reachable workflow state':'Specimen: not a working state'}</p>${standing(ctx,{...s,specimen:true})}<p class="small quiet">${i===0?'An issued revision is ready for the named reviewers.':i===1?'The current prototype reaches this state through the approval flow. A deposit does not supply authority.':i===2?'Authority is recorded, but funds have not been allocated to the order. No authority action is implemented here.':'This example assumes the applicable release checks have cleared. It is not the live state of Mendota’s order.'}</p></article>`).join('')}</div><p class="round-state-note">The release outcome depends on the order’s applicable checks. The independent facts above do not represent a required chronological sequence.</p><a class="button secondary" data-go="project" href="${ctx.link('project')}">Return to the working room</a>`;
    }
  });
  function rename(ctx,selector,text) { const el=qs(ctx,selector);if(el)el.textContent=text; }
  function explanation(ctx,selector) {qa(ctx,selector).forEach(el=>el.classList.add('round-explanation'));}
  function transform(ctx,view) {
    document.body.dataset.embedded=window.self!==window.top?'true':'false';
    document.body.dataset.explanations=new URLSearchParams(location.search).get('explanations')==='full'?'full':'concise';
    if(view==='desk') {
      rename(ctx,'.view-head .lede','Six projects in hand. A clear place for the work that moves them forward.');
      const grid=qs(ctx,'.studio-desk-grid');grid.className='round-desk-grid';grid.innerHTML=portfolioDesk(ctx);
      const pending=ctx.state.hours.some(h=>h.rate===null&&!h.invoiced);
      const tasks=qa(ctx,'.round-task');
      ['2026-10-28','2026-11-10','2026-10-21',ctx.state.studio.followupLater?'2026-10-22':'2026-10-21'].forEach((date,i)=>tasks[i].dataset.due=date);
      if(!pending)tasks[2].querySelector('h3').textContent='Review time & billing';
      tasks[1].querySelector('.round-task-meta').textContent='Jo Chen · Cedar Receiving · PO-021';
      const note=qs(ctx,'.round-desk-note');
      projects.slice(2).forEach(p=>note.insertAdjacentHTML('beforebegin',`<article class="round-task" data-due="2026-10-${p.date.split(' ')[0]}"><p>${p.name}<time>${p.date}</time></p><h3>${p.next}</h3><div class="round-task-meta">Leah → ${p.person} · illustrative</div><a href="${projectLink(ctx,p)}" data-go="portfolio" data-house="${p.id}">Open overview study ↗</a></article>`));
      qa(ctx,'.round-task').sort((a,b)=>a.dataset.due.localeCompare(b.dataset.due)).forEach(task=>note.before(task));
    }
    if(view==='project' && qs(ctx,'.core-room-margin')) {
      const margin=qs(ctx,'.core-room-margin');
      qs(ctx,'.core-room-margin>.status')?.remove();
      const quote=qs(ctx,'.core-room-margin blockquote');const byline=quote?.nextElementSibling;
      const note=document.createElement('details');note.className='round-authored-note';note.open=window.innerWidth>760;note.innerHTML='<summary>Leah’s note on the direction</summary>';if(quote)note.append(quote);byline?.remove();
      qs(ctx,'.core-room-margin .core-facts')?.remove();
      const button=qs(ctx,'.core-room-margin>.button');button.classList.add('secondary');
      button.insertAdjacentHTML('beforebegin',`<a class="button round-mobile-review" href="${ctx.link('approvals')}" data-go="approvals">${ctx.state.designApproved?'Read the design decision':'Open the design review'}</a><p class="round-piece-state"><span class="state-mark ${ctx.state.designApproved?'agreed':'open'}" aria-hidden="true"></span>${!ctx.state.pinned.includes(ctx.state.selectedPiece)?'Reference only':ctx.state.designApproved?'In the approved edition':ctx.state.core.changedSinceApproval?'Changed selection · review needed':'Design review needed'}</p>`);
      qs(ctx,'.round-mobile-review').before(qs(ctx,'.round-piece-state'));
      margin.insertAdjacentHTML('beforeend',standing(ctx));margin.append(note);
      explanation(ctx,'.core-after-action,.core-room-bottom>div:last-child>p:not(.annotation)');
      qa(ctx,'.core-pin').forEach(pin=>{
        const included=ctx.state.pinned.includes(pin.dataset.corePiece),state=!included?'reference':ctx.state.designApproved?'agreed':'open';
        pin.dataset.state=state;pin.setAttribute('aria-label',pin.getAttribute('aria-label')+': '+(state==='reference'?'reference only':state==='agreed'?'in approved edition':'review needed'));
      });
      qa(ctx,'.core-object-index button').forEach(button=>{const id=button.dataset.corePiece,included=ctx.state.pinned.includes(id);button.querySelector('small').textContent=!included?'Reference only':`${ctx.state.quantities[id]||1} selected · ${ctx.state.designApproved?'Edition approved':ctx.state.core.changedSinceApproval?'Review changes':'Review needed'}`;});
      qs(ctx,'.core-room-plate figcaption').innerHTML='<span>Room direction · illustrative</span><span class="round-pin-legend"><i class="state-mark open"></i> Review <i class="state-mark agreed"></i> Approved <i class="state-mark reference"></i> Reference</span>';
    }
    if(view==='approvals' && qs(ctx,'#core-approval-create')) {
      const form=qs(ctx,'#core-approval-create'),spread=form.parentElement,side=qs(ctx,'.core-approval-side');
      const issued=[...(ctx.state.core.plans||[])].reverse().find(p=>p.state==='issued');
      spread.classList.add('round-approval-layout');
      const plate=document.createElement('article');plate.className='round-issued-plate';
      plate.innerHTML=issued?`<div class="round-issued-heading"><div><p>Issued drawing set</p><h2>${ctx.escape(issued.title)}</h2></div><span>Rev ${String.fromCharCode(64+issued.version)}</span></div><img src="assets/room.png" alt="Illustrative room reference accompanying the issued revision"><p class="round-issued-caption">Issued ${ctx.escape(issued.date)} · room image is a direction reference</p><h3>Pieces in this edition</h3><div class="round-issued-list">${(issued.snapshot?.pieces||[]).map(p=>`<div><span>${p.quantity} × ${ctx.escape(p.name)}</span><span>${ctx.escape(p.material)}</span></div>`).join('')}</div><p class="small quiet">This is the issued specification snapshot, even if the working selection has changed. The room image is illustrative and does not certify a finish.</p><button type="button" class="text-button" data-open-plans>Read the issued drawing record ↗</button>`:'<h2>No issued revision</h2><p>Issue the drawing set before creating a request.</p><button type="button" class="text-button" data-open-plans>Open drawing sets</button>';
      const request=document.createElement('div');request.className='round-request-margin';request.append(form,side);spread.replaceChildren(plate,request);
      rename(ctx,'.view-head h1','Review an exact edition.');rename(ctx,'#core-approval-create>.annotation','Draft approval request');
    }
    if(view==='accounts') {
      rename(ctx,'.view-head h1','Lake Mendota account');rename(ctx,'.view-head .eyebrow','Furnishings & design services / Owner view');rename(ctx,'.view-head .lede','Budget, permission and money, each in its own record.');
      rename(ctx,'#financial-reading','Project financials');
      const margin=qs(ctx,'.studio-money-margin');if(margin){qs(ctx,'.studio-money-margin>.margin-note')?.remove();margin.insertAdjacentHTML('afterbegin',standing(ctx));}
      
      const purchaseText=qa(ctx,'.studio-money-rung p')[2];if(purchaseText){purchaseText.classList.add('round-authority-explanation');purchaseText.dataset.full=purchaseText.textContent;if(document.body.dataset.explanations==='concise')purchaseText.textContent='No client purchase authority recorded.';}
      rename(ctx,'#buys-title','Receipts & small purchases');
    }
    if(view==='orders') {
      rename(ctx,'.view-head h1',ctx.state.sourcing.orderPage==='receiving'?'Receiving':'Purchase orders');rename(ctx,'.view-head .eyebrow',ctx.state.sourcing.orderPage==='receiving'?'Oak Street Apartment / PO-021':'All studio projects / Purchase book');
      rename(ctx,'.view-head .lede',ctx.state.sourcing.orderPage==='receiving'?'Inspect the arrival. Keep its condition with the order.':'Two commitments, each with its next step.');
      rename(ctx,'.source-register-intro h2','Order register');rename(ctx,'.source-order-paper>h2','Northline order');
      const order=qs(ctx,'.source-order-paper');if(order){order.insertAdjacentHTML('afterbegin',`<div class="round-order-outcome"><span class="state-mark held" aria-hidden="true"></span><div><strong>Release held</strong><span>${ctx.state.designApproved?'Purchase authority and deposit allocation required':'Design review, purchase authority and deposit allocation required'}</span></div><a href="#release-checks">View checks</a></div>`);
        const stale=qa(ctx,'.source-order-paper p.status.wait').some(p=>p.textContent.includes('differs from the current specification'));
        qs(ctx,'.round-order-outcome>div').insertAdjacentHTML('beforeend',`<p class="round-next-owner">${stale?'Leah · refresh the saved draft before review':ctx.state.designApproved?'Leah · resolve purchasing authority and deposit allocation':'Leah · prepare the design review for Nora'}</p>${stale?'<p class="round-stale">Saved draft out of date</p>':''}`);
        const holds=qs(ctx,'.source-holds');holds.previousElementSibling?.remove();holds.outerHTML=`<div id="release-checks">${standing(ctx,{action:false})}</div>`;qs(ctx,'.source-link-stack a').textContent='Review the design decision';}
      explanation(ctx,'.source-register-foot');
      if(qs(ctx,'.source-receiving')) {document.body.dataset.task='receiving';rename(ctx,'.source-receiving h2',ctx.state.sourcing.inspection?'Receipt recorded':'Linen sofa');qs(ctx,'.source-receiving>.paper>.quiet')?.classList.add('round-explanation');}
    }
    if(view==='hours') {
      rename(ctx,'.view-head h1','Time & billing');rename(ctx,'.view-head .eyebrow','Lake Mendota House / Time ledger');rename(ctx,'.view-head .lede','Leah’s project time, with its billing state.');
      qs(ctx,'#draft-time-invoice')?.classList.add('secondary');qs(ctx,'#time-form button[type=submit]')?.classList.remove('secondary');
      const entry=qs(ctx,'.studio-time-entry');entry.id='record-time';entry.open=window.innerWidth<=760||!!ctx.state.studio.timeEntryOpen;
      const heading=qs(ctx,'.view-head');heading.insertAdjacentHTML('beforeend','<button class="button round-record-time" type="button" data-record-time>Record time</button>');
      const paper=qs(ctx,'.studio-time-paper');paper.prepend(entry);
      qa(ctx,'.studio-time-table tbody tr').forEach(row=>[...row.children].forEach((cell,i)=>cell.dataset.label=['Work','Time','Rate','Billing'][i]));
      rename(ctx,'.studio-hours-margin>h2','Ready to bill');
    }
  }
  function bind(ctx,view) {
    const scoped=['project','piece','engagement','approvals','schedule','accounts','hours','specbook'].includes(view);
    document.querySelectorAll('[data-project-only]').forEach(el=>el.hidden=!scoped);
    const projectSelect=document.getElementById('project-switch');const receiving=view==='orders'&&ctx.state.sourcing.orderPage==='receiving';projectSelect.value=view==='portfolio'?(ctx.state.selectedHouse||'oak'):receiving?'oak':scoped?'mendota':'studio';
    const roomLink=document.querySelector('.mobile-dock [data-home-room]');const house=view==='portfolio'?(ctx.state.selectedHouse||'oak'):receiving?'oak':'mendota';roomLink.dataset.go=house==='mendota'?'project':'portfolio';if(house==='mendota')delete roomLink.dataset.house;else roomLink.dataset.house=house;roomLink.href=house==='mendota'?ctx.link('project'):ctx.link('portfolio',{house});roomLink.textContent=house==='mendota'?'Room':'Project';
    document.querySelector('.mobile-dock [data-go=hours]').textContent=receiving||view==='portfolio'?'Mendota time':'Time';
    const booksSummary=document.querySelector('#studio-books summary');if(['orders','accounts','hours'].includes(view))booksSummary.setAttribute('aria-current','page');else booksSummary.removeAttribute('aria-current');
    projectSelect.onchange=()=>{const id=projectSelect.value;ctx.go(id==='studio'?'desk':id==='mendota'?'project':'portfolio',id==='studio'||id==='mendota'?{}:{house:id});};
    const section=document.getElementById('project-section');section.value=view;section.onchange=()=>ctx.go(section.value);
    const inboxCount=document.querySelector('.inbox-count');const count=['ellis','northline','receiving'].filter(id=>!(ctx.state.studio.inboxRead||[]).includes(id)).length;inboxCount.textContent=count;inboxCount.setAttribute('aria-label',`${count} unread conversations`);
    if(view!=='orders')delete document.body.dataset.task;
    qs(ctx,'[data-record-time]')?.addEventListener('click',()=>{const entry=qs(ctx,'.studio-time-entry');entry.open=true;ctx.state.studio.timeEntryOpen=true;entry.scrollIntoView({behavior:'instant',block:'start'});entry.querySelector('input').focus({preventScroll:true});});
  }
  window.RoundTwo={transform,bind};
})();
