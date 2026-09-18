// Rebound SQ-72 independent.test.ts; SQ-73 approval c_mu7e0fdw_da6f01 moves
// the first preservation assertion before B consumption and adds its positive result.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { processInbound, inboundCompletion, bindInboundSelection } from "../../sms-inbound/pipeline.ts";
import { dispatchInboundReplies } from "../../sms-inbound/index.ts";
import { recoverSmsSelection } from "../../_shared/sms.ts";
import { selectionFixture, inboundFixture } from "./inbound-fixture.ts";
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
 h.fake.from=(table:string)=>{const q=from(table), update=q.update.bind(q);q.update=(patch:any)=>{
  update(patch);
  if(once&&table==="sms_conversations"&&predicate(patch)) {once=false;const then=q.then.bind(q);q.then=async(resolve:any,reject:any)=>{entered();await released;return then(resolve,reject);};}
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
 const before=structuredClone(h.fake._data.sms_conversations[0].state_context);
 gate.release();await old;
 assertEquals(h.fake._data.sms_conversations[0].state_context,before,"delayed completed-A binder must preserve B manifest and pending origin");
 const fresh=await processInbound(input(h,"2","SMraceDigitB"),deps(h,blocker(id("task-b"))));
 assertEquals(fresh.disposition,"applied");
 assertEquals(effects.length,2);
 assertEquals(effects[1].p_sms_message_id,br.messageId,"second effect belongs to B origin");
});
Deno.test("delayed original digit CAS cannot consume newer delivered chooser",async()=>{
 const {h,id,effects}=selectionFixture();const a=await ask(h,"SMcasA");
 const gate=pauseUpdate(h,(p:any)=>p.state==="idle");
 const pick=processInbound(input(h,"1","SMcasDigitA"),deps(h,blocker(id("task-a"))));await gate.reached;
 const b=await ask(h,"SMcasB");const before=structuredClone(h.fake._data.sms_conversations[0].state_context);
 gate.release();await pick;
 assertEquals(h.fake._data.sms_conversations[0].state_context,before,"old-A CAS must not delete B manifest and pending origin");
});
for(const mutation of ["string-applied","array-result","wrong-sender","wrong-recipient"]) Deno.test("independent unknown authority "+mutation,async()=>{
 const {h}=selectionFixture();const a=await ask(h,"SMunknown-"+mutation);
 if(mutation==="string-applied")a.origin.applied_effect={applied:"false"};
 if(mutation==="array-result")a.origin.applied_effect=[];
 const sender=mutation==="wrong-sender"?"+15558880000":h.sender;
 const recipient=mutation==="wrong-recipient"?"+15558881111":h.recipient;
 assertEquals((await inboundCompletion(h.fake,a.origin.id,sender,recipient)).status,"unknown");
});
