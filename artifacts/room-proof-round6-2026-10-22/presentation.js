(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const text = (id, value) => { $(id).textContent = value; };
  let selectedPath = 'full';
  let selectedStage = 0;
  const foldCopy = {
    consultation: ['Open the advice record', 'Session record / draft', 'Question: how can the living room feel calmer while retaining the inherited chairs? Advice: test the revised layout; confirm the north-wall measurement before any fitted work. Follow-up promised: a written summary. Buying and site supervision are outside this sample engagement.'],
    design: ['Open the design delivery', 'Delivered edition 02 / example', 'Includes the agreed layout, finish direction, recommendation list, dated buying links and fit assumptions. Client buys and arranges installation. A substitute is recorded as a new decision; it does not inherit the original selection’s approval. Support through 5 November is a fictional agreed term.'],
    full: ['Open FF&E working detail', '36 living-room lines / retained depth', 'Keep sourcing, specification, pricing, per-line client decisions, purchasing, acknowledgements and receiving available in the dense sheet. Add buying owner and the next unmet condition. The existing round-five working prototype remains unchanged.'],
    renovation: ['Open the issue record', 'Joinery set / held edition', 'Sam holds A-201/B for information. Studio current A-201/C has not been issued to Sam. OBS-07 identifies an outlet conflict. Site verification and any consequential scope, cost and timing decisions precede the next drawing issue or fabrication go-ahead. The issue record retains exact prints and recipients.']
  };
  const stageOrder = () => selectedPath === 'consultation' ? [0,1,2,3,6,7] : selectedPath === 'design' ? [0,1,2,3,4,6,5,7] : [0,1,2,3,4,5,6,7];
  const stageLabel = i => {
    const labels = selectedPath === 'consultation' ? ['Lead & fit','Book the session','Prepare','Advise','Confirm notes','Client acts','Deliver advice','Later / optional'] : selectedPath === 'design' ? ['Lead & fit','Working agreement','Discover','Develop & revise','Select edition','Client implements','Deliver design','Support & closure'] : R6.stages;
    return labels[i];
  };
  function renderStageButtons(){
    const buttons = stageOrder().map((i,position) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.stage = i;
      b.setAttribute('aria-pressed', String(i === selectedStage)); b.setAttribute('aria-controls', 'stage-detail');
      const n = document.createElement('span'); n.textContent = position + 1; n.setAttribute('aria-hidden','true');
      b.append(n, document.createTextNode(stageLabel(i))); return b;
    });
    $('stage-buttons').replaceChildren(...buttons);
  }
  function renderStage(announce) {
    const step = R6.paths[selectedPath].steps[selectedStage];
    text('stage-number', stageOrder().indexOf(selectedStage) + 1); text('stage-label', stageLabel(selectedStage));
    text('stage-title', step[0]); text('stage-owner', 'People involved: ' + step[1]);
    text('stage-input', step[2]); text('stage-output', step[3]); text('stage-paper', step[4]);
    document.querySelectorAll('[data-stage]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.stage) === selectedStage)));
    if (announce) text('journey-announcement', R6.paths[selectedPath].label + ': ' + stageLabel(selectedStage) + '. ' + step[0]);
  }
  function renderPath(announce) {
    const p = R6.paths[selectedPath], s = p.slip;
    if(!stageOrder().includes(selectedStage)) selectedStage = 0;
    document.querySelectorAll('[data-path]').forEach(b => {b.setAttribute('aria-pressed', String(b.dataset.path === selectedPath)); b.setAttribute('aria-controls', 'workflow-reading paper-reading');});
    text('path-title', p.label); text('path-summary', p.summary); text('path-end', p.end);
    text('path-evidence', p.source);
    $('path-sources').replaceChildren(...p.sources.map(([name,url]) => { const a = document.createElement('a'); a.textContent = name; a.href = url; a.target = '_blank'; a.rel = 'noopener'; return a; }));
    text('paper-exclusions', {consultation:'Purchasing, formal design package and site supervision.',design:'Studio purchasing and trade / installation supervision.',full:'Work beyond the agreed rooms and scopes; changes require agreement.',renovation:'Unappointed architecture, engineering, building and contract-administration services.'}[selectedPath]);
    ['name','service','promise','who','terms','finish','title','body','caption','note','next'].forEach(k => text('paper-'+k, s[k]));
    $('paper-chapters').replaceChildren(...s.chapters.map(([title,state]) => {const li = document.createElement('li'); li.textContent = title; const span = document.createElement('span'); span.textContent = state; li.append(span); return li;}));
    const img = $('paper-image');
    img.src = selectedPath === 'renovation' ? 'assets/north-elevation.svg' : selectedPath === 'consultation' ? 'assets/room-survey.svg' : 'assets/room.jpg';
    img.alt = selectedPath === 'renovation' ? 'Illustrative north-wall elevation, not a construction document' : selectedPath === 'consultation' ? 'Illustrative room survey, not measured site evidence' : 'Reused living-room concept illustrating this paper arrangement, not an installed project';
    document.querySelector('.evidence-plates').hidden = selectedPath === 'consultation';
    if (selectedPath === 'consultation') text('paper-caption', 'Illustrative room reference / not a measured survey');
    const f = foldCopy[selectedPath];
    $('working-fold').querySelector('summary').textContent = f[0]; text('fold-title', f[1]); text('fold-body', f[2]);
    renderStageButtons();
    renderStage(announce);
  }
  document.querySelectorAll('[data-path]').forEach(b => b.addEventListener('click', () => {selectedPath = b.dataset.path; renderPath(false); if(b.closest('#paper')) text('paper-announcement', 'Paper example: ' + R6.paths[selectedPath].label + '. ' + R6.paths[selectedPath].slip.service); else text('journey-announcement', 'Workflow example: ' + R6.paths[selectedPath].label + '. ' + stageLabel(selectedStage));}));
  $('stage-buttons').addEventListener('click', e => {const b = e.target.closest('[data-stage]'); if (b) {selectedStage = Number(b.dataset.stage); renderStage(true);}});
  renderPath(false);
  const form = $('review-form'), key = 'patina-room-proof-round6-review-v1';
  const labels = {priority:'Which service or studio should Patina make feel native first?',missing:'What did the simulated review get wrong or miss about your designers’ actual work?',ownership:'Does the mixed job make responsibility and the next act clear?',completion:'What must be true before a designer can call their service complete?','next-round':'Which proposed adaptation should we explore in depth next?'};
  function readForm(){const d = Object.fromEntries(new FormData(form)); return {verdict:d.verdict || '',...Object.fromEntries(Object.keys(labels).map(k=>[k,d[k]||'']))};}
  try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); if(saved && typeof saved === 'object'){for(const [k,v] of Object.entries(saved)){if(typeof v !== 'string')continue; if(k==='verdict'){Array.from(form.elements.verdict).forEach(r=>{r.checked=r.value===v;});}else if(Object.hasOwn(labels,k)){form.elements.namedItem(k).value=v;}}text('save-status','Review notes restored from this browser.');}} catch {text('save-status','Browser storage unavailable; download your notes before leaving.');}
  let clearArmed = false;
  function resetClear(){clearArmed=false; text('clear-notes','Clear these notes');}
  form.addEventListener('input',()=>{resetClear();try{localStorage.setItem(key,JSON.stringify(readForm()));text('save-status','Saved in this browser.');}catch{text('save-status','Could not save locally. Download your notes before leaving.');}});
  form.addEventListener('submit',e=>e.preventDefault());
  $('download-notes').addEventListener('click',()=>{
    const d=readForm(); const date = new Date().toLocaleDateString('en-CA');
    let md='# Room proof round six review notes\n\nDate: '+date+'\n\nOverall: '+(d.verdict||'Not selected')+'\n\n';
    Object.entries(labels).forEach(([k,label],i)=>{md+='## '+(i+1)+' '+label+'\n\n'+(d[k].trim()||'_No notes._')+'\n\n';});
    md+='Context: This round used simulated design perspectives, published practice examples and source inspection. It is not a record of practitioner interviews.\n';
    const url=URL.createObjectURL(new Blob([md],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='patina-room-proof-round6-review.md';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);text('save-status','Review download prepared; notes remain in this browser.');
  });
  $('clear-notes').addEventListener('click',()=>{if(!clearArmed){clearArmed=true;text('clear-notes','Confirm clear');text('save-status','Click Confirm clear to remove only round-six review notes.');return;}form.reset();try{localStorage.removeItem(key);text('save-status','Round-six review notes cleared.');}catch{text('save-status','Form cleared; browser storage could not be updated.');}resetClear();});
  let scrollTick = false;
  function updateIndex(){
    const sections = Array.from(document.querySelectorAll('main>section[id]'));
    const current = sections.filter(s => s.getBoundingClientRect().top <= 180).pop() || sections[0];
    document.querySelectorAll('.index a').forEach(a => {if(a.hash === '#' + current.id) a.setAttribute('aria-current','location'); else a.removeAttribute('aria-current');});
    scrollTick = false;
  }
  addEventListener('scroll',()=>{if(!scrollTick){scrollTick=true;requestAnimationFrame(updateIndex);}},{passive:true});
  addEventListener('resize', updateIndex);
  updateIndex();
})();
