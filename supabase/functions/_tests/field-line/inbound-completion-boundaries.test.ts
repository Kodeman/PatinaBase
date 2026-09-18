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
for(const order of [["a","b"],["b","a"]]) Deno.test(`completed ${order[0]} never rebinds over newer ${order[1]} even without stamp`,async()=>{
 const {h,id,effects}=selectionFixture();const a=await ask(h,"SMfirst");failStamp(h);
 await processInbound(input(h,order[0]==="a"?"1":"2","SMfirstDigit"),deps(h,blocker(id("task-"+order[0]))));
 assertEquals(effects.length,1);assert(a.origin.parsed_intent.selection_intent,"injected stamp failure must leave provenance");
 h.advanceTo(new Date(h.clock.getTime()+5*3600000));const b=await ask(h,"SMsecond");
 const before=structuredClone(h.fake._data.sms_conversations[0]);const wires=h.provider.requests.length;
 const retry=await processInbound(a.params,deps(h));assertEquals(retry.disposition,"already_completed");
 await dispatchInboundReplies(a.params,a.result,deps(h));
 const q=await recoverSmsSelection(h.fake,{kind:"project_choice",inboundMessageId:a.origin.id,phone:h.recipient,messageId:a.row.id},deps(h));
 assertEquals(await bindInboundSelection(h.fake,a.origin.id,q.selection!,a.row.id),true);
 assertEquals(h.fake._data.sms_conversations[0],before,"all completion gates leave newer chooser byte-for-byte unchanged");
 assertEquals(h.provider.requests.length,wires,"completed origin sends no new question");
 assertEquals((await processInbound(input(h,order[0]==="a"?"1":"2","SMfirstDigit"),deps(h))).disposition,"already_completed");
 await processInbound(input(h,order[1]==="a"?"1":"2","SMsecondDigit"),deps(h,blocker(id("task-"+order[1]))));
 assertEquals(effects.length,2);assertEquals(effects[1].p_sms_message_id,b.origin.id);
});
Deno.test("applied=false historical unbound completion suppresses before choice media or parser",async()=>{
 const {h,effects}=selectionFixture();const a=await ask(h,"SMnoteOrigin");
 a.origin.applied_effect={applied:false,effect_type:"note",summary_text:"private original"};a.origin.party_id=null;a.origin.project_id=null;
 const before=structuredClone(h.fake._data.sms_conversations[0]);
 const r=await processInbound({...input(h,"1","SMcompletedDigit"),NumMedia:"1",MediaUrl0:"https://media.invalid/private",MediaContentType0:"image/jpeg"},deps(h));
 assertEquals(r.disposition,"already_completed");assertEquals(r.replies,undefined);assertEquals(effects.length,0);
 assertEquals(h.fake._data.sms_conversations[0].state_context,before.state_context,"completion precedes CAS");
 assertEquals(h.provider.requests.length,1,"no media fetch or additional wire");
});
for(const corrupt of ["missing","wrong-conversation","outbound","empty-sid","malformed-result","receipt-error","malformed-receipt","source-read-error"]) Deno.test(`completion authority ${corrupt} stays unknown`,async()=>{
 const {h}=selectionFixture();const a=await ask(h,"SMread");const rpc=h.fake.rpc;
 if(corrupt==="missing")h.fake._data.sms_messages=h.fake._data.sms_messages.filter(m=>m.id!==a.origin.id);
 if(corrupt==="wrong-conversation")a.origin.conversation_id="missing";
 if(corrupt==="outbound")a.origin.direction="outbound";
 if(corrupt==="empty-sid")a.origin.twilio_sid=" ";
 if(corrupt==="malformed-result")a.origin.applied_effect={summary_text:"not a completion"};
 if(corrupt==="receipt-error")h.fake.rpc=async(n,args)=>n==="sms_prompt_receipt"?{data:null,error:{message:"read failed"}}:rpc(n,args);
 if(corrupt==="malformed-receipt")h.fake.rpc=async(n,args)=>n==="sms_prompt_receipt"?{data:{status:"replayed"},error:null}:rpc(n,args);
 if(corrupt==="source-read-error") {const from=h.fake.from.bind(h.fake);h.fake.from=(table)=>{const q=from(table);if(table==="sms_messages")q.maybeSingle=async()=>({data:null,error:{message:"unreadable"}});return q;};}
 const before=structuredClone(h.fake._data.sms_conversations[0].state_context);
 assertEquals((await inboundCompletion(h.fake,a.origin.id,h.sender,h.recipient)).status,"unknown");
 const result=await dispatchInboundReplies(a.params,a.result,deps(h));assertEquals(result.status,503);
 assertEquals(h.fake._data.sms_conversations[0].state_context,before);assertEquals(h.provider.requests.length,1);
});
for (const thrown of [false,true]) Deno.test(`digit pointer ${thrown?"thrown":"returned"} failure stops before CAS media and effect; retry never guesses newer origin`,async()=>{
 const {h,effects}=selectionFixture();await ask(h,"SMpointerA");const from=h.fake.from.bind(h.fake);let fail=true;
 h.fake.from=(table)=>{const q=from(table),update=q.update.bind(q);q.update=(patch)=>{
  if(fail&&table==="sms_messages"&&patch.parsed_intent?.selection_intent?.messageId){if(thrown)throw Error("pointer unavailable");q.eq=()=>q;q.select=()=>q;q.then=(resolve)=>Promise.resolve({data:null,error:{message:"pointer not saved"}}).then(resolve);return q;}
  return update(patch);
 };return q;};
 const digit={...input(h,"1","SMpointerDigit"),NumMedia:"1",MediaUrl0:"https://media.invalid/private",MediaContentType0:"image/jpeg"};
 assertEquals((await processInbound(digit,deps(h))).status,503);assertEquals(effects.length,0);
 assertEquals(h.fake._data.sms_conversations[0].state,"awaiting_project_choice");assertEquals(h.provider.requests.length,1);
 fail=false;await ask(h,"SMpointerB");const before=structuredClone(h.fake._data.sms_conversations[0]);
 assertEquals((await processInbound(digit,deps(h))).status,503,"retained unstamped digit requires original-origin/operator recovery");
 assertEquals(h.fake._data.sms_conversations[0],before);assertEquals(effects.length,0);
});
Deno.test("unknown raw response resumes same digit original behind a newer chooser",async()=>{
 const {h,id,effects}=selectionFixture();const a=await ask(h,"SMunknownA","original A blocked");const rpc=h.fake.rpc;let unknown=true;
 h.fake.rpc=async(n,args)=>n==="apply_field_effect"&&unknown?{data:null,error:{code:"40003",message:"completion unknown"}}:rpc(n,args);
 const digit=input(h,"1","SMunknownDigit");const r=await processInbound(digit,deps(h,blocker(id("task-a"))));
 assertEquals(r.status,503);assertEquals(r.replies,undefined);assertEquals(effects.length,0);
 const pointer=h.fake._data.sms_messages.find(m=>m.twilio_sid===digit.MessageSid)!.parsed_intent as any;
 assertEquals(pointer.selection_intent.inboundMessageId,a.origin.id);
 h.advanceTo(new Date(h.clock.getTime()+5*3600000));await ask(h,"SMunknownB");const before=structuredClone(h.fake._data.sms_conversations[0]);unknown=false;
 let parsedBody="";const result=await processInbound(digit,deps(h,async(i:any)=>{parsedBody=i.body;return blocker(id("task-a"))();}));
 assertEquals(result.disposition,"applied");assertEquals(parsedBody,"original A blocked");
 assertEquals(effects[0].p_sms_message_id,a.origin.id,"same SID follows its durable original pointer");
 assertEquals(h.fake._data.sms_conversations[0].state_context,before.state_context,"resume cannot overwrite newer chooser");
 assertEquals((await processInbound(digit,deps(h))).disposition,"already_completed");assertEquals(effects.length,1);
});
Deno.test("raw committed lost response reconciles quietly without fresh stamps touches or notifications",async()=>{
 const {h,id,effects,touches}=selectionFixture();const a=await ask(h,"SMlostA");const rpc=h.fake.rpc;
 h.fake.rpc=async(n,args)=>{const r=await rpc(n,args);if(n==="apply_field_effect")throw Error("lost committed response");return r;};
 const invocations=h.fake._invocations.length;
 const r=await processInbound(input(h,"1","SMlostDigit"),deps(h,blocker(id("task-a"))));
 assertEquals(r.disposition,"already_completed");assertEquals(r.replies,undefined);assertEquals(effects.length,1);assertEquals(touches.length,0);
 assertEquals(h.fake._invocations.length,invocations,"no fresh blocker notification on replay");assert(a.origin.parsed_intent.selection_intent,"replay leaves original metadata alone");
});
Deno.test("SQL replay sentinel and atomic already_completed skip new target followups",async()=>{
 const {h,id,effects,touches}=selectionFixture();await ask(h,"SMsentinel");const rpc=h.fake.rpc;
 h.fake.rpc=async(n,args)=>n==="apply_field_effect"?{data:{applied:true,_sms_replayed:true,summary_text:"private old result"},error:null}:rpc(n,args);
 const r=await processInbound(input(h,"1","SMsentinelDigit"),deps(h,blocker(id("task-a"))));assertEquals(r.disposition,"already_completed");assertEquals(r.replies,undefined);assertEquals(effects.length,0);assertEquals(touches.length,0);
 const f=inboundFixture();f.prompt();const frpc=f.h.fake.rpc;
 f.h.fake.rpc=async(n,args)=>n==="sms_apply_prompt"?{data:{status:"already_completed"},error:null}:frpc(n,args);
 const result=await processInbound(input(f.h,"HERE 17","SMatomicReplay"),deps(f.h));
 assertEquals(result.disposition,"already_completed");assertEquals(result.replies,undefined);assertEquals(f.touches.length,0);assertEquals(f.h.fake._data.sms_prompts[0].answered_at,null);
});
Deno.test("raw read failure after lost response stays retryable then reconciles original result",async()=>{
 const {h,id,effects}=selectionFixture();const a=await ask(h,"SMambiguous");const rpc=h.fake.rpc;let lost=true, committed=false;
 h.fake.rpc=async(n,args)=>{if(n==="sms_prompt_receipt"&&lost&&committed)return {data:null,error:{message:"read lost"}};const r=await rpc(n,args);if(n==="apply_field_effect"&&lost){committed=true;return {data:null,error:{code:"40003"}};}return r;};
 const digit=input(h,"1","SMambiguousDigit");const first=await processInbound(digit,deps(h,blocker(id("task-a"))));
 assertEquals(first.status,503);assertEquals(first.replies,undefined);assertEquals(effects.length,1);assertEquals((await processInbound(digit,deps(h))).status,503);
 lost=false;assertEquals((await processInbound(digit,deps(h))).disposition,"already_completed");assertEquals(effects.length,1);assert(a.origin.applied_effect);
});

Deno.test("known raw rollback reports unsaved then same digit retries original once",async()=>{
 const {h,id,effects}=selectionFixture();const a=await ask(h,"SMrollbackA");const rpc=h.fake.rpc;let fail=true;
 h.fake.rpc=async(n,args)=>n==="apply_field_effect"&&fail?{data:null,error:{code:"23514",message:"rolled back"}}:rpc(n,args);
 const digit=input(h,"1","SMrollbackDigit");const failed=await processInbound(digit,deps(h,blocker(id("task-a"))));
 assertEquals(failed.disposition,"effect_failed");assertEquals(effects.length,0);assertEquals(a.origin.applied_effect,undefined);
 fail=false;const saved=await processInbound(digit,deps(h,blocker(id("task-a"))));
 assertEquals(saved.disposition,"applied");assertEquals(effects.length,1);assertEquals(effects[0].p_sms_message_id,a.origin.id);
 assertEquals((await processInbound(digit,deps(h))).disposition,"already_completed");assertEquals(effects.length,1);
});

for (const gate of ["dispatcher","binder"]) Deno.test(`completed origin direct ${gate} cannot touch newer chooser`,async()=>{
 const {h}=selectionFixture();const a=await ask(h,"SMdirectA");
 a.origin.applied_effect={applied:true,effect_type:"flag_blocker"};
 h.advanceTo(new Date(h.clock.getTime()+5*3600000));await ask(h,"SMdirectB");
 const before=structuredClone(h.fake._data.sms_conversations[0]),wires=h.provider.requests.length;
 if(gate==="dispatcher")assertEquals((await dispatchInboundReplies(a.params,a.result,deps(h))).disposition,"already_completed","completed dispatcher skips sending and rebinding");
 else {
  const q=await recoverSmsSelection(h.fake,{kind:"project_choice",inboundMessageId:a.origin.id,phone:h.recipient,messageId:a.row.id},deps(h));
  assertEquals(await bindInboundSelection(h.fake,a.origin.id,q.selection!,a.row.id),true);
 }
 assertEquals(h.fake._data.sms_conversations[0],before,"completed binder leaves newer chooser byte-for-byte unchanged");
 assertEquals(h.provider.requests.length,wires,"completed dispatcher performs no additional wire");
});

Deno.test("completed chooser origin cannot fetch digit media",async()=>{
 const {h,id}=selectionFixture();const a=await ask(h,"SMmediaCompleted");a.origin.applied_effect={applied:false,effect_type:"note"};
 let mediaFetches=0;
 const d={...deps(h,blocker(id("task-a"))),fetchImpl:async()=>{mediaFetches++;return new Response("",{status:404});}};
 await processInbound({...input(h,"1","SMmediaDigit"),NumMedia:"1",MediaUrl0:"https://media.invalid/synthetic",MediaContentType0:"image/jpeg"},d);
 assertEquals(mediaFetches,0,"completed origin performs no media fetch");
});
