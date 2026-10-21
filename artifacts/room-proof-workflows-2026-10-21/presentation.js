(() => {
 'use strict';
 const views = [
 ['desk','Studio overview','Start with today’s work, inquiries and the projects that need attention.'],
 ['project','Room & brief','The visual center of the project, with its brief and evidence close at hand.'],
 ['engagement','Services agreement','An engagement has its own terms, readiness and issued client edition.'],
 ['library','Resource library','Search the shelves and add a piece to the shared project.'],
 ['piece','Piece proof','Inspect a piece’s configuration, specification, maker and pricing.'],
 ['approvals','Client approvals','Read the edition, the reviewers, the question and the decision.'],
 ['schedule','Project flow','See a date change’s effects before applying it to the project.'],
 ['accounts','Financials & accounts','Keep budget, authority, obligations, invoices and receipts distinct.'],
 ['orders','Purchase orders','Prepare a held draft or follow the separate receiving example.'],
 ['specbook','Spec book','Read and print the shared specification without studio cost or private notes.'],
 ['people','Studio contacts','Find a person, their role and their correspondence in one record.'],
 ['hours','Timesheets','Turn eligible recorded work into a traceable invoice draft.'],
 ['inbox','Studio inbox','Read correspondence and activity, then return to the source.']
 ];
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const picker=document.getElementById('screen-picker');
 picker.innerHTML=views.map((v,i)=>`<button type="button" data-preview="${v[0]}" aria-pressed="${v[0]==='project'}"><span>${String(i+1).padStart(2,'0')}</span>${v[1]}</button>`).join('');
 picker.addEventListener('click',e=>{const button=e.target.closest('button[data-preview]');if(!button)return;const index=views.findIndex(v=>v[0]===button.dataset.preview),view=views[index];picker.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.getElementById('portal-preview').src=`mockup.html?view=${view[0]}`;document.getElementById('preview-index').textContent=`${String(index+1).padStart(2,'0')} / ${view[1]}`;document.getElementById('preview-purpose').textContent=view[2];for(const id of ['preview-open','mobile-preview-open'])document.getElementById(id).href=`mockup.html?view=${view[0]}`;document.getElementById('mobile-preview-open').textContent=`Open ${view[1]} ↗`;});
 function scale(){const wrap=document.getElementById('preview-window'),frame=document.getElementById('portal-preview');if(!wrap.clientWidth)return;const ratio=wrap.clientWidth/1440;frame.style.transform=`scale(${ratio})`;wrap.style.height=`${1120*ratio}px`;}
 new ResizeObserver(scale).observe(document.getElementById('preview-window'));scale();
 function map(){const q=document.getElementById('map-search').value.trim().toLowerCase(),scope=document.getElementById('map-filter').value;const rows=window.PatinaMap.filter(r=>(scope==='all'||r[4]===scope)&&r.join(' ').toLowerCase().includes(q));document.getElementById('map-count').textContent=`${rows.length} of ${window.PatinaMap.length} capability groups`;document.getElementById('map-list').innerHTML=rows.map(r=>`<article class="map-row"><div><span class="eyebrow">${escape(r[8])}</span><h3>${escape(r[0])}</h3><p>${escape(r[1])}</p></div><div class="map-new"><a href="mockup.html?view=${r[2]}">${r[4]==='interactive'?'Try':'See proposed home'}: ${views.find(v=>v[0]===r[2])[1]} ↗</a><p>${escape(r[3])}</p></div><div class="map-depth"><span class="depth-badge ${r[4]}">${r[4]==='interactive'?'Interactive example':'Mapped, not mocked'}</span><p>${escape(r[5])}</p><a href="https://github.com/Kodeman/PatinaBase/blob/98c6baa69/apps/designer-portal/src/${encodeURI(r[6])}#L${r[7]}" target="_blank" rel="noopener">Source reference ↗</a></div></article>`).join('')||'<p class="empty-map">No matching workflow. Try a broader term or choose all capabilities.</p>';}
 document.getElementById('map-search').addEventListener('input',map);document.getElementById('map-filter').addEventListener('change',map);map();
 const form=document.getElementById('review-form'),key='patina-room-proof-review-v1',status=document.getElementById('notes-status');
 try{const notes=JSON.parse(localStorage.getItem(key)||'{}');for(const name of ['room','pace','trust'])if(typeof notes[name]==='string')form.elements[name].value=notes[name];}catch{}
 function notes(){return Object.fromEntries(new FormData(form));}
 form.addEventListener('submit',e=>{e.preventDefault();try{localStorage.setItem(key,JSON.stringify(notes()));status.textContent='Review notes saved in this browser. Nothing was sent.';}catch{status.textContent='This browser cannot save notes. Use Download review notes to keep a copy.';}});
 document.getElementById('download-notes').addEventListener('click',()=>{const n=notes(),text=`# Patina — Room Proof, in practice\nFounding team review\n\n## The room and the work\n${n.room||'(No note)'}\n\n## The designer’s pace\n${n.pace||'(No note)'}\n\n## Trust and detail\n${n.trust||'(No note)'}\n`;const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='patina-room-proof-review.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Review notes downloaded. Nothing was sent.';});
})();
