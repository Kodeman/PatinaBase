'use strict';
const $=id=>document.getElementById(id);
const slides=[...document.querySelectorAll('.slide')];
let current=0,selectedScenario='base';
const currency=(v,compact=false)=>{const n=Math.abs(v),sign=v<0?'−':'';return sign+(compact&&n>=1e6?'$'+(n/1e6).toFixed(2)+'m':compact&&n>=1000?'$'+Math.round(n/1000).toLocaleString()+'k':'$'+Math.round(n).toLocaleString('en-US'));};
function showSlide(index,updateHash=true){
 const transfer=slides[current].contains(document.activeElement);current=Math.max(0,Math.min(slides.length-1,index));
 slides.forEach((s,i)=>{s.classList.toggle('active',i===current);s.setAttribute('aria-hidden',String(i!==current));});
 $('counter').textContent=String(current+1).padStart(2,'0')+' / '+slides.length;$('chapter').textContent=slides[current].dataset.chapter;$('notesText').textContent=slides[current].dataset.note;$('previous').disabled=current===0;$('next').disabled=current===slides.length-1;
 $('announcement').textContent='Slide '+(current+1)+': '+slides[current].dataset.title;
 if(updateHash)history.replaceState(null,'','#slide-'+(current+1));
 if(transfer){slides[current].setAttribute('tabindex','-1');slides[current].focus({preventScroll:true});}window.scrollTo(0,0);
}
function fromHash(){const match=location.hash.match(/^#slide-(\d+)$/);showSlide(match?Number(match[1])-1:0,false);}
function toggleNotes(force){const open=typeof force==='boolean'?force:$('notes').hidden;$('notes').hidden=!open;$('notesButton').setAttribute('aria-expanded',String(open));}
function toggleOverview(force){const open=typeof force==='boolean'?force:$('overview').hidden;$('overview').hidden=!open;$('overviewButton').setAttribute('aria-expanded',String(open));$('deck').inert=open;document.querySelector('.top').inert=open;document.querySelector('.footer').inert=open;$('notes').inert=open;if(open)$('closeOverview').focus();else $('overviewButton').focus();}
slides.forEach((s,i)=>{const b=document.createElement('button'),n=document.createElement('span');n.className='label';n.textContent=String(i+1).padStart(2,'0')+' / '+s.dataset.chapter;b.append(n,document.createTextNode(s.dataset.title));b.onclick=()=>{showSlide(i);toggleOverview(false);};$('overviewGrid').append(b);});
$('previous').onclick=()=>showSlide(current-1);$('next').onclick=()=>showSlide(current+1);$('notesButton').onclick=()=>toggleNotes();$('closeNotes').onclick=()=>{toggleNotes(false);$('notesButton').focus();};$('overviewButton').onclick=()=>toggleOverview();$('closeOverview').onclick=()=>toggleOverview(false);$('overview').onclick=e=>{if(e.target===$('overview'))toggleOverview(false);};$('printButton').onclick=()=>window.print();
window.addEventListener('hashchange',fromHash);
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){if(!$('overview').hidden)toggleOverview(false);else if(!$('notes').hidden){toggleNotes(false);$('notesButton').focus();}return;}
 if(!$('overview').hidden){if(e.key==='Tab'){const fs=[...$('overview').querySelectorAll('button')];if(e.shiftKey&&document.activeElement===fs[0]){e.preventDefault();fs.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===fs.at(-1)){e.preventDefault();fs[0].focus();}}return;}
 if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;
 if(['ArrowRight','PageDown','ArrowLeft','PageUp','Home','End'].includes(e.key)){e.preventDefault();showSlide(e.key==='Home'?0:e.key==='End'?slides.length-1:current+(['ArrowRight','PageDown'].includes(e.key)?1:-1));}
 if(e.key.toLowerCase()==='n')toggleNotes();if(e.key.toLowerCase()==='o')toggleOverview();
});
function roi(){
 const a={quotes:+$('roiQuotes').value,minutesSaved:+$('roiMinutes').value,realization:+$('roiRealization').value/100,eligibleOrders:+$('roiOrders').value,incrementality:+$('roiIncrementality').value/100,incrementalMargin:+$('roiMargin').value/100,subscription:+$('roiPrice').value};const r=PatinaModel.sellerROI(a);
 $('roiQuotesOut').textContent=a.quotes;$('roiMinutesOut').textContent=a.minutesSaved+' min';$('roiRealizationOut').textContent=Math.round(a.realization*100)+'%';$('roiOrdersOut').textContent=a.eligibleOrders.toFixed(2);$('roiIncrementalityOut').textContent=Math.round(a.incrementality*100)+'%';$('roiMarginOut').textContent=Math.round(a.incrementalMargin*100)+'%';$('roiPriceOut').textContent=currency(a.subscription);
 $('roiCapacity').textContent=currency(r.capacityValue);$('roiSavings').textContent=currency(r.realizedSavings);$('roiOrderValue').textContent=currency(r.orderContribution);$('roiCost').textContent=currency(r.monthlyCost);$('roiNet').textContent=currency(r.net);
 $('roiNeeded').textContent=r.neededOrders===null?'At this incrementality and margin, eligible orders do not add positive contribution after the fee.':r.neededOrders===0?'Documented cost removal covers the modeled burden without new orders.':'Needs '+r.neededOrders.toFixed(2)+' eligible completed orders/month at the assumed incrementality.';
}
['roiQuotes','roiMinutes','roiRealization','roiOrders','roiIncrementality','roiMargin','roiPrice'].forEach(id=>$(id).addEventListener('input',roi));roi();
function drawCash(m){
 const data=[{month:0,cumulativeCash:-m.assumptions.initialBuild},...m.rows],vals=data.map(r=>r.cumulativeCash);let low=Math.min(0,...vals),high=Math.max(0,...vals);const pad=(high-low||1)*.12;low-=pad;high+=pad;
 const left=63,right=625,top=20,bottom=265,x=v=>left+v/36*(right-left),y=v=>bottom-(v-low)/(high-low)*(bottom-top);let svg='';
 for(let i=0;i<=4;i++){const v=low+(high-low)*i/4;svg+=`<line class="axis" x1="${left}" y1="${y(v)}" x2="${right}" y2="${y(v)}"/><text x="${left-9}" y="${y(v)+4}" text-anchor="end">${currency(v,true)}</text>`;}
 svg+=`<line class="zero" x1="${left}" y1="${y(0)}" x2="${right}" y2="${y(0)}"/>`;
 for(const v of [0,12,24,36])svg+=`<text x="${x(v)}" y="291" text-anchor="middle">Month ${v}</text>`;
 const points=data.map(r=>x(r.month).toFixed(2)+','+y(r.cumulativeCash).toFixed(2)).join(' ');svg+=`<polyline class="series" points="${points}" stroke="${selectedScenario==='upside'?'#536b5a':'#995242'}"/>`;
 $('cashChart').innerHTML=svg;$('cashChart').setAttribute('aria-label',selectedScenario+' scenario: cumulative modeled cash balance; peak deficit '+currency(m.peakFunding)+', ending balance '+currency(m.endCash));
}
function scenario(name){selectedScenario=name;const m=PatinaModel.simulate(PatinaModel.scenarios[name]);document.querySelectorAll('[data-scenario]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scenario===name)));drawCash(m);$('scenarioRevenue').textContent=currency(m.annual[2].revenue);$('scenarioOperating').textContent=currency(m.annual[2].operating);$('scenarioFunding').textContent=currency(m.peakFunding);$('scenarioBreakEven').textContent=m.sustainedPositive?'Month '+m.sustainedPositive:'Not reached by month 36';$('scenarioRecovery').textContent=m.cumulativePositive?'Month '+m.cumulativePositive:'Not reached by month 36';$('scenarioCaption').textContent=name==='upside'?'Requires faster acquisition, lower churn and less service simultaneously. These are success conditions to prove.':name==='downside'?'Mechanical continuation after failed gates. The pilot should stop spend before this outcome unfolds.':'Even with $299 pricing and improving adoption, the base case has no operating break-even within the horizon.';}
document.querySelectorAll('[data-scenario]').forEach(b=>b.onclick=()=>scenario(b.dataset.scenario));scenario('base');
const baseline=PatinaModel.scenarios.base;
const sensitivities=[['Base case',{}],['Software only; no marketplace demand cost',{takeRate:0,orderStartMonth:99,newDesigners:[0,0,0]}],['Subscription $149',{subscription:149}],['Subscription $399',{subscription:399}],['Maker support 3h/month',{makerSupportHours:3}],['Maker churn 3%/month',{makerChurn:.03}],['Designer additions halved',{newDesigners:baseline.newDesigners.map(v=>v/2)}],['Maker contacts +50%',{contacts:baseline.contacts.map(v=>v*1.5)}]];
const sensitivityRows=sensitivities.map(([name,patch])=>{const m=PatinaModel.simulate({...baseline,...patch});return `<tr><td>${name}</td><td class="numeric">${currency(m.annual[2].operating)}</td><td class="numeric">${currency(m.peakFunding)}</td></tr>`;}).join('');
$('sensitivityTable').innerHTML='<table class="matrix"><thead><tr><th>One changed assumption</th><th>Year 3 operating result</th><th>Peak modeled cash deficit</th></tr></thead><tbody>'+sensitivityRows+'</tbody></table>';
const fields=['decisionOffer','decisionDisproof','decisionOwner'],storageKey='patina-marketplace-v2-decision';
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved&&typeof saved==='object')fields.forEach(id=>{if(typeof saved[id]==='string')$(id).value=saved[id];});}catch{}
function save(){try{localStorage.setItem(storageKey,JSON.stringify(Object.fromEntries(fields.map(id=>[id,$(id).value]))));$('saveStatus').textContent='Saved in this browser';}catch{$('saveStatus').textContent='Export to keep a copy';}}
fields.forEach(id=>$(id).addEventListener('input',save));
$('exportDecision').onclick=()=>{const m=PatinaModel.simulate(PatinaModel.scenarios[selectedScenario]);const body='Patina — Maker commerce decision\nResearch version 2 / October 13, 2026\n\nFirst offer\n'+$('decisionOffer').value+'\n\nDisproof\n'+$('decisionDisproof').value+'\n\nOwner, spend, review\n'+$('decisionOwner').value+'\n\nSelected scenario: '+selectedScenario+'\nYear 3 revenue: '+currency(m.annual[2].revenue)+'\nYear 3 operating result: '+currency(m.annual[2].operating)+'\nPeak modeled cash deficit: '+currency(m.peakFunding)+'\n\nScenario assumptions (unvalidated)\n'+JSON.stringify(m.assumptions,null,2)+'\n';const u=URL.createObjectURL(new Blob([body],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download='patina-maker-commerce-decision.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);$('saveStatus').textContent='Decision exported';};
window.addEventListener('beforeprint',()=>{document.querySelectorAll('.print-value').forEach(x=>x.remove());fields.forEach(id=>{const t=document.createElement('div');t.className='print-value';t.textContent=$(id).value||'Not recorded';$(id).after(t);});});
fromHash();
