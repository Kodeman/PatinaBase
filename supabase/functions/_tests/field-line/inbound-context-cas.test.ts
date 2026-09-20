// Rebound SQ-72 independent.test.ts; SQ-73 approval c_mu7e0fdw_da6f01 moves
// the first preservation assertion before B consumption and adds its positive result.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { processInbound, inboundCompletion, bindInboundSelection } from "../../sms-inbound/pipeline.ts";
import { dispatchInboundReplies } from "../../sms-inbound/index.ts";
import { recoverSmsSelection } from "../../_shared/sms.ts";
import { selectionFixture, inboundFixture } from "./inbound-fixture.ts";
import { asClient } from "../fake-supabase.ts";
const deps=(h:any,parseFn:any=async()=>{assert(false,"completed origin must not invoke parser");})=>({supabase:h.fake,now:h.clock,getEnv:h.env,fetchImpl:h.provider.fetch,parseFn});
const input=(h:any,Body:string,MessageSid:string)=>({From:h.recipient,To:h.sender,Body,MessageSid,NumMedia:"0"});
const ambiguous=async()=>({intent:"mark_done",target_ref:null,new_date:null,note:"done",confidence:0.7});
const blocker=(id:string)=>async()=>({intent:"flag_blocker",target_ref:{kind:"task",id},new_date:null,note:"blocked",confidence:0.95});
async function ask(h:any,sid:string,body="original blocked") {
 const params=input(h,body,sid), result=await processInbound(params,deps(h,ambiguous));
 assertEquals(result.disposition,"project_chooser");
 assertEquals((await dispatchInboundReplies(params,result,deps(h))).status,200);
 const row=h.fake._data.sms_messages.find((m:any)=>m.recipe?.selection?.inboundMessageId===result.messageId)!;
 row.twilio_status="delivered";
 return {params,result,row,origin:h.fake._data.sms_messages.find((m:any)=>m.id===result.messageId)!};
}
function failStamp(h:any) {
 const from=h.fake.from.bind(h.fake);let enabled=true;
 h.fake.from=(table:string)=>{const q=from(table),update=q.update.bind(q);q.update=(patch:any)=>{
  if(enabled&&table==="sms_messages"&&patch.parsed_intent?.path==="llm"){
   enabled=false;q.eq=()=>q;q.then=(resolve:any)=>Promise.resolve({data:null,error:{message:"postcommit stamp unavailable"}}).then(resolve);return q;
  }return update(patch);
 };return q;};
}

function pauseUpdate(h:any, predicate:any) {
 let entered!:()=>void, release!:()=>void;
 const reached=new Promise<void>(r=>entered=r), released=new Promise<void>(r=>release=r);
 const from=h.fake.from.bind(h.fake); let once=true;
 h.fake.from=(table:string)=>{const q=from(table), update=q.update.bind(q), del=q.delete.bind(q);
 const wait=()=>{const then=q.then.bind(q);q.then=async(resolve:any,reject:any)=>{entered();await released;return then(resolve,reject);};};
 q.delete=()=>{del();if(once&&table==="sms_conversation_context"&&predicate({state:"idle"})){once=false;wait();}return q;};
 q.update=(patch:any)=>{
  update(patch);
  if(once&&table==="sms_conversation_context"&&predicate(patch)) {once=false;const then=q.then.bind(q);q.then=async(resolve:any,reject:any)=>{entered();await released;return then(resolve,reject);};}
  return q;
 };return q;};
 return {reached,release};
}
Deno.test("delayed origin binder cannot replace newer delivered chooser after origin completes",async()=>{
 const {h,id,effects}=selectionFixture();const a=await ask(h,"SMraceA");
 const gate=pauseUpdate(h,(p:any)=>p.state==="awaiting_project_choice");
 const old=dispatchInboundReplies(a.params,a.result,deps(h));await gate.reached;
 const bp=input(h,"new B blocked","SMraceB");const br=await processInbound(bp,deps(h,ambiguous));assertEquals(br.disposition,"project_chooser");
 await processInbound(input(h,"1","SMraceDigitA"),deps(h,blocker(id("task-a"))));assertEquals(effects.length,1);
 assertEquals((await dispatchInboundReplies(bp,br,deps(h))).status,200);h.fake._data.sms_messages.find((m:any)=>m.recipe?.selection?.inboundMessageId===br.messageId)!.twilio_status="delivered";
 const before=structuredClone(h.fake._data.sms_conversation_context.find((c:any)=>c.project_id===null)!.state_context);
 gate.release();await old;
 assertEquals(h.fake._data.sms_conversation_context.find((c:any)=>c.project_id===null)!.state_context,before,"delayed completed-A binder must preserve B manifest and pending origin");
 const fresh=await processInbound(input(h,"2","SMraceDigitB"),deps(h,blocker(id("task-b"))));
 assertEquals(fresh.disposition,"applied");
 assertEquals(effects.length,2);
 assertEquals(effects[1].p_sms_message_id,br.messageId,"second effect belongs to B origin");
});
Deno.test("delayed original digit CAS cannot consume newer delivered chooser",async()=>{
 const {h,id,effects}=selectionFixture();const a=await ask(h,"SMcasA");
 const gate=pauseUpdate(h,(p:any)=>p.state==="idle");
 const pick=processInbound(input(h,"1","SMcasDigitA"),deps(h,blocker(id("task-a"))));await gate.reached;
 const b=await ask(h,"SMcasB");const before=structuredClone(h.fake._data.sms_conversation_context.find((c:any)=>c.project_id===null)!.state_context);
 gate.release();await pick;
 assertEquals(h.fake._data.sms_conversation_context.find((c:any)=>c.project_id===null)!.state_context,before,"old-A CAS must not delete B manifest and pending origin");
});
for(const mutation of ["string-applied","array-result","wrong-sender","wrong-recipient"]) Deno.test("independent unknown authority "+mutation,async()=>{
 const {h}=selectionFixture();const a=await ask(h,"SMunknown-"+mutation);
 if(mutation==="string-applied")a.origin.applied_effect={applied:"false"};
 if(mutation==="array-result")a.origin.applied_effect=[];
 const sender=mutation==="wrong-sender"?"+15558880000":h.sender;
 const recipient=mutation==="wrong-recipient"?"+15558881111":h.recipient;
 assertEquals((await inboundCompletion(asClient(h.fake),a.origin.id,sender,recipient)).status,"unknown");
});

Deno.test("binder must not replace B when A completes before context snapshot acquisition",async()=>{
 const {h,id,effects}=selectionFixture();const a=await ask(h,"SMreadA");
 const from=h.fake.from.bind(h.fake);let once=true,entered!:()=>void,release!:()=>void;
 const reached=new Promise<void>(r=>entered=r),released=new Promise<void>(r=>release=r);
 h.fake.from=(table:string)=>{const q=from(table),select=q.select.bind(q);q.select=(...args:any[])=>{
   select(...args);if(once&&table==="sms_conversation_context"){once=false;const single=q.maybeSingle.bind(q);q.maybeSingle=async()=>{entered();await released;return single();};}return q;};return q;};
 const old=bindInboundSelection(h.fake as never,a.origin.id,{manifest:a.row.recipe.selection,usable:true,deliveryStatus:"delivered"},a.row.id);
 await reached;
 const bp=input(h,"new B blocked","SMreadB"),br=await processInbound(bp,deps(h,ambiguous));
 assertEquals(br.disposition,"project_chooser");
 await processInbound(input(h,"1","SMreadDigitA"),deps(h,blocker(id("task-a"))));assertEquals(effects.length,1);
 assertEquals((await dispatchInboundReplies(bp,br,deps(h))).status,200);
 h.fake._data.sms_messages.find((m:any)=>m.recipe?.selection?.inboundMessageId===br.messageId)!.twilio_status="delivered";
 const before=structuredClone(h.fake._data.sms_conversation_context.find((c:any)=>c.project_id===null)!.state_context);
 release();await old;
 const after=h.fake._data.sms_conversation_context.find((c:any)=>c.project_id===null)!.state_context;
 const fresh=await processInbound(input(h,"2","SMreadDigitB"),deps(h,blocker(id("task-b"))));
 console.log(JSON.stringify({before,after,fresh,effects:effects.length}));
 assertEquals(after,before,"completed A binder preserves newer B across pre-snapshot overlap");
 assertEquals(fresh.disposition,"applied","fresh B digit applies B, never silently completes A");
});


Deno.test("pending own binder is idempotent but older unresolved binder preserves newer source",async()=>{
 const {h}=selectionFixture();const a=await ask(h,"SMpendingA");
 const question={manifest:a.row.recipe.selection,usable:true,deliveryStatus:"delivered"} as any;
 const before=structuredClone(h.fake._data.sms_conversation_context);
 assertEquals(await bindInboundSelection(h.fake as never,a.origin.id,question,a.row.id),true);
 assertEquals(h.fake._data.sms_conversation_context,before,"pending own source rebind is idempotent");
 await ask(h,"SMpendingB");const fresh=structuredClone(h.fake._data.sms_conversation_context);
 assertEquals(await bindInboundSelection(h.fake as never,a.origin.id,question,a.row.id),true);
 assertEquals(h.fake._data.sms_conversation_context,fresh,"older unresolved source cannot overwrite newer B");
});
