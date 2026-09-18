import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { processInbound } from "../../sms-inbound/pipeline.ts";
import { dispatchInboundReplies } from "../../sms-inbound/index.ts";
import { inboundFixture } from "./inbound-fixture.ts";
const deps = (h: any, parseFn: any = async () => { throw Error("unexpected parser"); }) => ({supabase:h.fake,now:h.clock,getEnv:h.env,fetchImpl:h.provider.fetch,parseFn});
const inbound = (h: any, Body: string, MessageSid = "SMprobe") => ({From:h.recipient,To:h.sender,Body,MessageSid,NumMedia:"0"});
const proposal = (id: string, date: string) => async () => ({intent:"report_delay",target_ref:{kind:"task",id},new_date:date,note:`original ${id}`,confidence:0.65});
Deno.test("R1 older medium confirmation retains original date after another proposal", async () => {
 const {h,prompt,effects}=inboundFixture();
 prompt({id:"unrelated-a",kind:"optin",subject_id:null});
 prompt({id:"unrelated-b",kind:"optin",subject_id:null,short_code:"18",party_id:"party-b",project_id:"project-b"});
 const a=await processInbound(inbound(h,"mantel delayed","SMa"),deps(h,proposal("task-a","2026-11-04")));
 const first=h.fake._data.sms_prompts.at(-1)!;
 const b=await processInbound(inbound(h,"tile delayed","SMb"),deps(h,proposal("task-b","2026-11-06")));
 assertEquals(a.disposition,"clarify"); assertEquals(b.disposition,"clarify");
 const result=await processInbound(inbound(h,`YES ${first.short_code}`,"SMconfirmOld"),deps(h));
 assertEquals((effects[0].p_effect as any).new_date,"2026-11-04","original Ref proposal date must survive later proposal");
});
Deno.test("R2 failed handset context write cannot change the persisted proposal", async () => {
 const {h,effects}=inboundFixture(); const from=h.fake.from.bind(h.fake);
 h.fake.from=((table:string)=>{const q:any=from(table);const update=q.update.bind(q);q.update=(p:any)=>{if(table==="sms_conversation_context" && p.state==="awaiting_confirmation") {q.then=(f:any)=>Promise.resolve({data:null,error:{message:"context write failed"}}).then(f);return q;}return update(p);};return q;}) as any;
 const p=await processInbound(inbound(h,"mantel delayed","SMproposal"),deps(h,proposal("task-a","2026-11-04")));
 const prompt=h.fake._data.sms_prompts[0];
 const result=await processInbound(inbound(h,`YES ${prompt.short_code}`,"SMconfirm"),deps(h));
 assertEquals(p.disposition,"clarify");
 assertEquals(result.disposition,"ref_applied");
 assertEquals(effects.length,1,"the complete proposal persisted with the prompt, independently of handset context");
 assertEquals((effects[0].p_effect as any).new_date,"2026-11-04","failed context write must not lose the original date");
 assertEquals((effects[0].p_effect as any).note,"original task-a");
});
Deno.test("R3 simultaneous distinct SIDs consume one ref at most once", async () => {
 const {h,prompt,effects}=inboundFixture(); prompt({kind:"flag_blocker"});
 const results=await Promise.all([processInbound(inbound(h,"YES 17","SMraceA"),deps(h)),processInbound(inbound(h,"YES 17","SMraceB"),deps(h))]);
 assertEquals(effects.length,1,"one immutable prompt must not apply twice");
});
Deno.test("control same SID consumes ref once", async () => {
 const {h,prompt,effects}=inboundFixture();prompt();
 await Promise.all([processInbound(inbound(h,"HERE 17"),deps(h)),processInbound(inbound(h,"HERE 17"),deps(h))]);assertEquals(effects.length,1);
});
Deno.test("control failed receipt creates owned review without wire fallback", async () => {
 const {h,prompt}=inboundFixture();prompt(); const p=inbound(h,"HERE 17");
 const result=await processInbound(p,deps(h));h.provider.setOutcome({kind:"fail",code:30007});
 const dispatched=await dispatchInboundReplies(p,result,deps(h));assertEquals(dispatched.status,200);assert(!dispatched.twiml.includes("<Message>"));assertEquals(h.fake._data.sms_messages[0].owner_user_id,"studio-a");
});

Deno.test("R5 notification HTTP success without saved notification is not a handoff", async () => {
 const {h,prompt,effects}=inboundFixture(); prompt({kind:"report_condition"});
 // Exact error-success response shape from notification-dispatch/index.ts:202-209.
 h.fake.functions.invoke=async()=>({data:{success:true,channel:"in_app"},error:null});
 const result=await processInbound(inbound(h,"DAMAGED 17"),deps(h,async()=>({intent:"report_condition",target_ref:null,new_date:null,note:"damaged",condition:{ok:false,note:"damaged"},confidence:0.95})));
 assertEquals(result.status,503,"missing notification persistence must not produce a successful handoff receipt");
});

Deno.test("atomic committed effect reconciles a lost RPC response without applying twice", async () => {
 const {h,prompt,effects}=inboundFixture(); prompt(); const rpc=h.fake.rpc;
 h.fake.rpc=async(name,args)=>{const result=await rpc(name,args);if(name==="sms_apply_prompt")throw Error("response lost after commit");return result;};
 const params=inbound(h,"HERE 17","SMlostResponse");
 const result=await processInbound(params,deps(h));
 assertEquals(result.disposition,"ref_applied");assertEquals(result.effectApplied,true);
 assertEquals((await processInbound(params,deps(h))).disposition,"ref_applied");
 assertEquals(effects.length,1,"stored receipt recovers the committed effect exactly once");
});
Deno.test("atomic optin reconciles a lost response and grants only its pending record", async () => {
 const {h,prompt}=inboundFixture(); prompt({kind:"optin",subject_id:null});
 h.fake._data.studio_channel_consent.forEach(r=>r.status="pending"); const rpc=h.fake.rpc;
 h.fake.rpc=async(name,args)=>{const result=await rpc(name,args);if(name==="sms_grant_optin_prompt")throw Error("response lost after grant");return result;};
 const params=inbound(h,"YES 17","SMlostGrant");
 assertEquals((await processInbound(params,deps(h))).disposition,"granted");
 assertEquals((await processInbound(params,deps(h))).disposition,"granted");
 assertEquals(h.fake._data.studio_channel_consent.map(r=>r.status),["granted","pending"]);
 assertEquals(h.fake._data.sms_prompts[0].consumed_sid,params.MessageSid);
});
Deno.test("unreadable receipt remains retryable and later reconciles even after prompt expiry", async () => {
 const {h,prompt,effects}=inboundFixture();prompt();const rpc=h.fake.rpc;let unavailable=true;
 h.fake.rpc=async(name,args)=>{
  if(name==="sms_prompt_receipt"&&unavailable)return {data:null,error:{message:"receipt unavailable"}};
  const result=await rpc(name,args);if(name==="sms_apply_prompt"&&unavailable)throw Error("lost response");return result;
 };
 const params=inbound(h,"HERE 17","SMreceiptRead");
 const first=await processInbound(params,deps(h));assertEquals(first.status,503);
 const second=await processInbound(params,deps(h));assertEquals(second.status,503);
 assertEquals(second.disposition,"receipt_unreadable");
 assertEquals(h.fake._data.sms_messages[0].twilio_sid,params.MessageSid);
 unavailable=false;h.advanceTo(new Date("2026-11-03T14:00:00Z"));
 assertEquals((await processInbound(params,deps(h))).disposition,"ref_applied");
 assertEquals(effects.length,1,"receipt beats expiry and ordinary duplicate shortcut");
});
Deno.test("unknown precommit response retries the same persisted inbound identity", async () => {
 const {h,prompt,effects}=inboundFixture();prompt();const rpc=h.fake.rpc;let unavailable=true;
 h.fake.rpc=async(name,args)=>{if(name==="sms_apply_prompt"&&unavailable)throw Error("transport failed before write");return rpc(name,args);};
 const params=inbound(h,"HERE 17","SMbeforeCommit");
 assertEquals((await processInbound(params,deps(h))).status,503);
 const id=h.fake._data.sms_messages[0].id;unavailable=false;
 assertEquals((await processInbound(params,deps(h))).disposition,"ref_applied");
 assertEquals(effects.length,1);assertEquals(effects[0].p_sms_message_id,id);
 assertEquals(h.fake._data.sms_messages.filter(r=>r.twilio_sid===params.MessageSid).length,1);
});
Deno.test("note applied=false is successful atomic consumption and stored receipt replay", async () => {
 const {h,prompt}=inboundFixture();prompt({kind:"note"});const rpc=h.fake.rpc;let applies=0;
 h.fake.rpc=async(name,args)=>{if(name==="apply_field_effect"){applies++;return {data:{applied:false,effect_type:"note",summary_text:"private note"},error:null};}return rpc(name,args);};
 const params=inbound(h,"YES 17","SMnote");const result=await processInbound(params,deps(h));
 assertEquals(result.effectApplied,true);assertEquals(result.replies?.[0].message,"Your note was saved.");
 assertEquals((await processInbound(params,deps(h))).effectApplied,true);assertEquals(applies,1);
 assertEquals((h.fake._data.sms_prompts[0].consumption_result as any).result.applied,false);
});
Deno.test("conflicting proposal verb cannot replace its payload or consume its receipt", async () => {
 const {h,prompt,effects}=inboundFixture();prompt({kind:"report_delay",proposed_effect:{type:"report_delay",target:{kind:"task",id:"task-a"},new_date:"2026-11-04",note:"original"}});
 assertEquals((await processInbound(inbound(h,"DONE 17"),deps(h))).disposition,"needs_review");
 assertEquals(effects.length,0);assertEquals(h.fake._data.sms_prompts[0].answered_at,null);
});

Deno.test("SQL completion-unknown preserves SID without a false not-saved receipt", async () => {
 const {h,prompt,effects}=inboundFixture();prompt();const rpc=h.fake.rpc;
 h.fake.rpc=async(name,args)=>name==="sms_apply_prompt" ? {data:null,error:{code:"40003",message:"statement completion unknown"}} : rpc(name,args);
 const params=inbound(h,"HERE 17","SMcompletionUnknown");
 const result=await processInbound(params,deps(h));
 assertEquals(result.status,503);assertEquals(result.disposition,"prompt_commit_unknown");
 assertEquals(h.fake._data.sms_messages[0].twilio_sid,params.MessageSid);
 assertEquals(result.replies,undefined,"ambiguous SQLSTATE cannot claim the write did not save");assertEquals(effects.length,0);
});
