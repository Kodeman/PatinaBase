(function(root){
'use strict';
const shared={months:36,activationLag:2,orderStartMonth:7,fulfillmentLag:2,collectionLag:1,subscription:299,setupFee:995,takeRate:0.08,aov:4000,laborRate:45,hostingPerMaker:12,designerSupportHours:0.25,designerAcquisitionCost:100,orderSupportHours:1,orderReserveRate:0.005,platformBillingRate:0.03,initialBuild:60000};
const scenarios={
 downside:{...shared,contacts:[30,45,60],qualifiedRate:0.20,pilotRate:0.30,paidRate:0.35,activationRate:0.80,makerChurn:0.03,onboardingHours:14,pilotHours:4,makerSupportHours:3,contactCost:35,newDesigners:[4,6,8],designerChurn:0.05,projectsPerDesigner:0.30,categoryFit:0.35,projectWin:0.35,ordersPerProject:1,sellerOrdersCapacity:0.3,fulfillmentRate:0.75,eligibleAttribution:0.60,fixedMonthly:[20000,25000,35000]},
 base:{...shared,contacts:[60,100,160],qualifiedRate:0.25,pilotRate:0.40,paidRate:0.50,activationRate:0.90,makerChurn:0.015,onboardingHours:8,pilotHours:3,makerSupportHours:1.5,contactCost:28,newDesigners:[8,14,22],designerChurn:0.03,projectsPerDesigner:0.40,categoryFit:0.50,projectWin:0.50,ordersPerProject:1.1,sellerOrdersCapacity:0.4,fulfillmentRate:0.85,eligibleAttribution:0.75,fixedMonthly:[20000,25000,35000]},
 upside:{...shared,contacts:[100,180,300],qualifiedRate:0.30,pilotRate:0.50,paidRate:0.60,activationRate:0.95,makerChurn:0.008,onboardingHours:5,pilotHours:2,makerSupportHours:0.75,contactCost:22,newDesigners:[15,30,50],designerChurn:0.02,projectsPerDesigner:0.55,categoryFit:0.60,projectWin:0.60,ordersPerProject:1.2,sellerOrdersCapacity:0.6,fulfillmentRate:0.92,eligibleAttribution:0.90,fixedMonthly:[25000,35000,50000]}
};
function simulate(input){
 const a={...input};let activeMakers=0,activeDesigners=0,cumulative=-a.initialBuild,cumulativeCash=-a.initialBuild,peakFunding=a.initialBuild;const activationQueue=Array(a.months+a.activationLag+1).fill(0);const rows=[],fulfillmentQueue=Array(a.months+a.fulfillmentLag+2).fill(0),cashQueue=Array(a.months+a.collectionLag+2).fill(0);
 for(let month=1;month<=a.months;month++){
  const year=Math.floor((month-1)/12),contacts=a.contacts[year],qualified=contacts*a.qualifiedRate,pilots=qualified*a.pilotRate,newPaid=pilots*a.paidRate;
  activationQueue[month+a.activationLag]+=newPaid*a.activationRate;
  const activations=activationQueue[month],churnedMakers=activeMakers*a.makerChurn;
  activeMakers=activeMakers-churnedMakers+activations;
  const churnedDesigners=activeDesigners*a.designerChurn,newDesigners=month>=3?a.newDesigners[year]:0;
  activeDesigners=activeDesigners-churnedDesigners+newDesigners;
  const demandOrders=activeDesigners*a.projectsPerDesigner*a.categoryFit*a.projectWin*a.ordersPerProject;
  const supplyOrders=activeMakers*a.sellerOrdersCapacity;
  const acceptedOrders=month>=a.orderStartMonth?Math.min(demandOrders,supplyOrders):0;
  fulfillmentQueue[month+a.fulfillmentLag]+=acceptedOrders;
  const orders=fulfillmentQueue[month]*a.fulfillmentRate;
  const gmv=orders*a.aov,subscriptionRevenue=activeMakers*a.subscription,setupRevenue=activations*a.setupFee,eligibleGMV=gmv*a.eligibleAttribution,transactionRevenue=eligibleGMV*a.takeRate,revenue=subscriptionRevenue+setupRevenue+transactionRevenue;
  const makerSupport=activeMakers*(a.makerSupportHours*a.laborRate+a.hostingPerMaker),onboarding=activations*a.onboardingHours*a.laborRate,acquisition=contacts*a.contactCost+pilots*a.pilotHours*a.laborRate,designerAcquisition=newDesigners*a.designerAcquisitionCost,designerSupport=activeDesigners*a.designerSupportHours*a.laborRate,orderCosts=acceptedOrders*a.orderSupportHours*a.laborRate+gmv*a.orderReserveRate,billingCosts=revenue*a.platformBillingRate;
  const variableCosts=makerSupport+onboarding+designerSupport+orderCosts+billingCosts;
  const fixed=a.fixedMonthly[year],operating=revenue-variableCosts-acquisition-designerAcquisition-fixed;
  const serviceHours=activeMakers*a.makerSupportHours+activations*a.onboardingHours+pilots*a.pilotHours+activeDesigners*a.designerSupportHours+acceptedOrders*a.orderSupportHours;
  cashQueue[month+a.collectionLag]+=transactionRevenue;
  const cashCollections=subscriptionRevenue+setupRevenue+cashQueue[month],cashMovement=operating-transactionRevenue+cashQueue[month];
  cumulative+=operating;cumulativeCash+=cashMovement;peakFunding=Math.max(peakFunding,-cumulativeCash);
  rows.push({month,year:year+1,contacts,qualified,pilots,newPaid,activations,churnedMakers,activeMakers,newDesigners,churnedDesigners,activeDesigners,demandOrders,supplyOrders,acceptedOrders,orders,gmv,eligibleGMV,subscriptionRevenue,setupRevenue,transactionRevenue,revenue,makerSupport,onboarding,acquisition,designerAcquisition,designerSupport,orderCosts,billingCosts,variableCosts,fixed,serviceHours,operating,cumulative,cashCollections,cashMovement,cumulativeCash});
 }
 const annual=[1,2,3].map(year=>{const rs=rows.filter(r=>r.year===year);const total=key=>rs.reduce((s,r)=>s+r[key],0);return {year,endMakers:rs.at(-1).activeMakers,endDesigners:rs.at(-1).activeDesigners,contacts:total('contacts'),activations:total('activations'),orders:total('orders'),gmv:total('gmv'),eligibleGMV:total('eligibleGMV'),subscriptionRevenue:total('subscriptionRevenue'),setupRevenue:total('setupRevenue'),transactionRevenue:total('transactionRevenue'),revenue:total('revenue'),variableCosts:total('variableCosts'),acquisition:total('acquisition'),designerAcquisition:total('designerAcquisition'),fixed:total('fixed'),operating:total('operating'),endCumulative:rs.at(-1).cumulative,endCash:rs.at(-1).cumulativeCash,cashMovement:total('cashMovement')}});
 const firstPositive=rows.find(r=>r.operating>=0)?.month||null;
 const sustainedPositive=rows.find((r,i)=>r.operating>=0&&rows.slice(i).every(x=>x.operating>=0))?.month||null;
 const cumulativePositive=rows.find(r=>r.cumulativeCash>=0)?.month||null;
 const matureContribution=a.subscription*(1-a.platformBillingRate)-a.makerSupportHours*a.laborRate-a.hostingPerMaker;
 const cac=(a.contactCost+a.qualifiedRate*a.pilotRate*a.pilotHours*a.laborRate)/(a.qualifiedRate*a.pilotRate*a.paidRate*a.activationRate);
 const setupContribution=a.setupFee*(1-a.platformBillingRate)-a.onboardingHours*a.laborRate;
 return {assumptions:a,rows,annual,peakFunding,firstPositive,sustainedPositive,cumulativePositive,endCumulative:cumulative,endCash:cumulativeCash,annualRetention:(1-a.makerChurn)**12,matureContribution,cac,setupContribution,subscriptionPayback:cac/matureContribution};
}
function sellerROI(a={}){
 const x={subscription:299,setupFee:995,setupMonths:12,makerSetupHours:8,quotes:30,minutesSaved:30,hourValue:45,realization:0.5,upkeepHours:1.5,eligibleOrders:0.18,incrementality:0.60,aov:4000,incrementalMargin:0.30,takeRate:0.08,...a};
 const capacityValue=x.quotes*x.minutesSaved/60*x.hourValue,realizedSavings=capacityValue*x.realization,incrementalOrders=x.eligibleOrders*x.incrementality,orderContribution=x.aov*(incrementalOrders*x.incrementalMargin-x.eligibleOrders*x.takeRate),monthlyCost=x.subscription+(x.setupFee+x.makerSetupHours*x.hourValue)/x.setupMonths+x.upkeepHours*x.hourValue,net=realizedSavings+orderContribution-monthlyCost;
 const netOrderMargin=x.incrementality*x.incrementalMargin-x.takeRate;
 const neededOrders=netOrderMargin>0?Math.max(0,(monthlyCost-realizedSavings)/(x.aov*netOrderMargin)):null;
 const laborHours=x.realization>0?monthlyCost/(x.hourValue*x.realization):null;
 return {assumptions:x,capacityValue,realizedSavings,incrementalOrders,orderContribution,monthlyCost,net,neededOrders,laborHours};
}
root.PatinaModel={scenarios,simulate,sellerROI};
if(typeof module!=='undefined')module.exports=root.PatinaModel;
})(typeof globalThis!=='undefined'?globalThis:this);
