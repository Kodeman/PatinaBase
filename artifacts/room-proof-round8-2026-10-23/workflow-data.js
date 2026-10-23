(() => {
  'use strict';
  const signature = x => JSON.stringify([x.room,x.location,x.name,x.qty,x.unit,x.client,x.maker,x.product,x.finish,x.material,x.color,x.width,x.depth,x.height,x.dimensionUnit,x.lead,x.com,x.comYards,x.comShip,x.comStatus]);
  const snapshot = x => ({id:x.id,name:x.name,room:x.room,location:x.location,qty:x.qty,unit:x.unit,unitClient:x.client,maker:x.maker,product:x.product,finish:x.finish,material:x.material,color:x.color,width:x.width,depth:x.depth,height:x.height,dimensionUnit:x.dimensionUnit,lead:x.lead,com:x.com,comYards:x.comYards,comShip:x.comShip,comStatus:x.comStatus,signature:signature(x)});
  const lines=JobSeed.lines, get=id=>lines.find(x=>x.id===id);
  get('LR-03').material='Walnut';get('LR-03').finish='Oiled walnut';get('LR-06').material='Travertine';get('LR-06').finish='Honed stone';get('BR-03').material='Brass';get('BR-03').finish='Aged bronze';
  const prior=lines.filter(x=>x.stage==='released').map(snapshot);
  const current=['LR-01','LR-02','LR-03','LR-04','LR-06','LR-36'].map(id=>snapshot(get(id)));
  const replies={};prior.forEach(x=>replies[x.id]={outcome:'approved',note:'',by:'Nora · sample client',at:'14 October'});
  JobSeed.reviews=[{id:'IR-02',date:'14 October',items:prior,responses:replies},{id:'IR-03',date:'21 October',items:current,responses:{'LR-01':{outcome:'approved',note:'The oak feels right.',by:'Nora · sample client',at:'21 October'},'LR-06':{outcome:'approved',note:'',by:'Nora · sample client',at:'21 October'},'LR-02':{outcome:'discuss',note:'Can we see the linen cutting in the room?',by:'Nora · sample client',at:'21 October'},'LR-36':{outcome:'changes',note:'Please keep the console under 16 inches deep.',by:'Nora · sample client',at:'21 October'}}}];
  JobSeed.activeReview='IR-03';
  JobSeed.purchaseFacts={};lines.filter(x=>x.stage==='released').forEach(x=>JobSeed.purchaseFacts[x.id]={authorized:true,funded:x.id!=='LR-24',terms:true,authority:'PA—01 · signed sample'});
  const order=(id,lineId,maker,ref,eta)=>({id,maker,status:ref?'Acknowledged':'Sent',created:'16 October',shipTo:'White Glove receiving warehouse · Madison (sample)',terms:'50% deposit / balance before shipment',items:[{...snapshot(get(lineId)),unitTrade:get(lineId).trade}],ack:ref?{status:'matching',reference:ref,eta,note:'Sample acknowledgment on file'}:null,receipts:[],dispatchAt:'16 October'});
  JobSeed.orders=[order('PO-01','LR-05','Woven House','WH-8124','2027-01-28'),order('PO-02','BR-01','Northline',null,null)];
  JobSeed.purchases=[];
  window.FlowData={signature,snapshot};
})();
