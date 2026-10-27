/* Fictional design records, independent from purchasing authority. */
JobSeed.design = {
  current: 'C',
  shared: {},
  issueDrafts: [],
  tasks: [],
  revisionRequest: false,
  fieldDraft: '',
  responseDrafts: {},
  followupEffects: {},
  revisionFrom: null,
  issueForm: {purpose:'pricing',recipient:'sam',plan:true,elevation:true,note:''},
  observations: [{id:'OBS-07',by:'Sam Ortiz',role:'Carpentry',at:'22 Oct, 09:40',sheet:'A-201',revision:'B',body:'The outlet projects behind the console. Please confirm the depth and outlet clearance before we fabricate.',media:'site-observation.svg',status:'Awaiting studio review',response:''}]
};
window.DesignSeed = {
  revisions: {
    B: {date:'14 Oct',depth:'18″',purpose:'Earlier coordination study',change:'Original console depth. The client has since asked for a shallower piece.'},
    C: {date:'21 Oct',depth:'16″ maximum',purpose:'Current studio study',change:'Reduced depth follows Nora’s request. Outlet clearance and recess still need a field measurement.'},
    D: {date:'22 Oct',depth:'15″ proposed',purpose:'New studio study',change:'Draft revision in response to a site observation. Clearance still needs verification; this has not been approved or issued.'}
  },
  parties: {
    sam:{name:'Sam Ortiz',company:'Northline Carpentry',role:'Carpenter',scope:'TS-04 · North-wall console'},
    ana:{name:'Ana Cruz',company:'Cruz General Contracting',role:'General contractor',scope:'Site coordination'}
  },
  priorIssue: {id:'IS-02',date:'14 Oct',purpose:'Information',recipient:'Sam Ortiz',prints:[{sheet:'A-101',rev:'B'},{sheet:'A-201',rev:'B'}],status:'Previously issued · fictional fixture'}
};
