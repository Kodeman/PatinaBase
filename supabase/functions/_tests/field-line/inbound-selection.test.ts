import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { processInbound } from "../../sms-inbound/pipeline.ts";
import { dispatchInboundReplies } from "../../sms-inbound/index.ts";
import { selectionFixture as inboundFixture } from "./inbound-fixture.ts";
const deps = (h: any, parseFn: any = async () => { throw Error("unexpected parser"); }) => ({supabase:h.fake,now:h.clock,getEnv:h.env,fetchImpl:h.provider.fetch,parseFn});
const inbound = (h: any, Body: string, MessageSid = "SMprobe") => ({From:h.recipient,To:h.sender,Body,MessageSid,NumMedia:"0"});
const proposal = (id: string, date: string) => async () => ({intent:"report_delay",target_ref:{kind:"task",id},new_date:date,note:`original ${id}`,confidence:0.65});
Deno.test("R4 first ambiguous ref clarification is actually delivered to consenting handset", async () => {
 const {h,prompt}=inboundFixture(); prompt(); prompt({id:"prompt-b",project_id:"project-b",party_id:"party-b",subject_id:"task-b",short_code:"18"});
 const params=inbound(h,"HERE"); const result=await processInbound(params,deps(h)); assertEquals(result.disposition,"ref_clarify");
 const sent=await dispatchInboundReplies(params,result,deps(h));
 assertEquals(h.provider.requests.length,1,"first ref clarification must reach handset, not silently fail consent attribution");
});

Deno.test("R4 ordinary multi-project chooser still reaches handset", async () => {
 const {h}=inboundFixture(); const params=inbound(h,"finished the job");
 const result=await processInbound(params,deps(h,async()=>({intent:"mark_done",target_ref:null,new_date:null,note:"done",confidence:0.7})));
 assertEquals(result.disposition,"project_chooser");
 const sent=await dispatchInboundReplies(params,result,deps(h));
 assertEquals(h.provider.requests.length,1,"project chooser must be visible before the trade can answer");
});

const chooserParse = async () => ({intent:"mark_done",target_ref:null,new_date:null,note:"done",confidence:0.7});
async function ask(h: any, sid = "SMselection") {
 const params = inbound(h,"finished the job",sid);
 const result = await processInbound(params,deps(h,chooserParse));
 return {params,result,sent:await dispatchInboundReplies(params,result,deps(h))};
}
const question = (h: any) => {
 const row=h.fake._data.sms_messages.find((r: any)=>r.template_key==="sms_selection");
 assert(row, "durable selection question must exist before recovery");return row;
};
Deno.test("selection filters before numbering and consumes only delivered manifest IDs", async()=>{
 const {h,id,effects}=inboundFixture();h.fake._data.studio_channel_consent[0].status="opted_out";
 const {sent}=await ask(h);assertEquals(sent.disposition,"selection_pending");
 const q=question(h);assertEquals(q.party_id,null);assertEquals(q.project_id,null);
 assertEquals(q.recipe.selection.options,[{partyId:id("party-b"),projectId:id("project-b"),number:1}]);
 assert(!q.body.includes("Studio A"));
 assertEquals(q.recipe.params,{});assert(!q.body.includes("finished the job"),"caller prose never enters the shared question");
 const conv=h.fake._data.sms_conversations[0];
 conv.state_context.chooser=[{n:1,party_id:id("party-a"),project_id:id("project-a")}];
 const pending=await processInbound(inbound(h,"1","SMnotAsked"),deps(h));
 assertEquals(pending.disposition,"selection_pending");assertEquals(effects.length,0);
 q.twilio_status="delivered";
 const chosen=await processInbound(inbound(h,"1","SMdeliveredChoice"),deps(h,async()=>({intent:"note",target_ref:null,new_date:null,note:"done",confidence:0.99})));
 assertEquals(chosen.disposition,"applied");assertEquals(effects[0].p_party_id,id("party-b"),"handset chooser array never supplies authority");
});
Deno.test("duplicate origin recovers the same queued question and original numbering without another wire",async()=>{
 const {h}=inboundFixture();const {params,result}=await ask(h);const q=question(h);const manifest=structuredClone(q.recipe.selection);
 const retry=await processInbound(params,deps(h));assertEquals(retry.disposition,"selection_recovery");
 retry.selection!.options.reverse();
 const recovered=await dispatchInboundReplies(params,retry,deps(h));
 assertEquals(recovered.disposition,"selection_pending");assertEquals(h.provider.requests.length,1);
 assertEquals(question(h).id,q.id);assertEquals(question(h).recipe.selection,manifest);
 assertEquals(result.selection?.kind,"project_choice");
});
Deno.test("metadata write failure recovers actual sent row on retry without resending",async()=>{
 const {h}=inboundFixture();const from=h.fake.from.bind(h.fake);let fail=true;
 h.fake.from=(table)=>{const query=from(table);const update=query.update.bind(query);query.update=(patch)=>{
   if(fail&&table==="sms_conversations"&&patch.state==="awaiting_project_choice"){
     const result={data:null,error:{message:"metadata unavailable"}};
     query.select=()=>query;query.eq=()=>query;query.then=(resolve)=>Promise.resolve(result).then(resolve);return query;
   }return update(patch);
 };return query;};
 const {params,sent}=await ask(h);assertEquals(sent.status,503);const row=question(h);assert(row);
 assert(h.fake._data.sms_conversations[0].state !== "awaiting_project_choice", "failed metadata write cannot mark the chooser asked");
 fail=false;row.twilio_status="sent";
 const retry=await dispatchInboundReplies(params,await processInbound(params,deps(h)),deps(h));
 assertEquals(retry.status,200);assertEquals(h.provider.requests.length,1);
 assertEquals(h.fake._data.sms_conversations[0].state_context.selection.messageId,row.id);
});
Deno.test("unreadable selection recovery is retryable and cannot authorize a new send",async()=>{
 const {h}=inboundFixture();const {params}=await ask(h);const from=h.fake.from.bind(h.fake);
 h.fake.from=(table)=>{const query=from(table);const single=query.maybeSingle.bind(query);query.maybeSingle=()=>table==="sms_messages"
   ?Promise.resolve({data:null,error:{message:"read unavailable"}}):single();return query;};
 const retry=await processInbound(params,deps(h));assertEquals(retry.status,503);assertEquals(h.provider.requests.length,1);
});
Deno.test("deferred chooser is not asked and flush keeps the same binding",async()=>{
 const {h,effects}=inboundFixture(new Date("2026-11-01T06:30:00Z"));const {params}=await ask(h);
 const row=question(h);assertEquals(row.twilio_status,"deferred");assertEquals(h.provider.requests.length,0);
 assertEquals((await processInbound(inbound(h,"1","SMnightChoice"),deps(h))).disposition,"selection_pending");assertEquals(effects.length,0);
 h.advanceTo(new Date("2026-11-01T14:00:00Z"));await h.flush();assertEquals(question(h).id,row.id);
 const retry=await dispatchInboundReplies(params,await processInbound(params,deps(h)),deps(h));
 assertEquals(retry.disposition,"selection_pending","provider queued after flush is still not asked");assertEquals(h.provider.requests.length,1);
});
Deno.test("withdrawn authorization and terminal selection never revive after START or origin retry",async()=>{
 const {h,effects}=inboundFixture();const {params}=await ask(h);const row=question(h);row.twilio_status="delivered";
 h.fake._data.studio_channel_consent[1].status="opted_out";
 assertEquals((await processInbound(inbound(h,"1","SMrevokedChoice"),deps(h))).status,503);assertEquals(effects.length,0);
 row.twilio_status="suppressed";
 await processInbound(inbound(h,"START","SMresume"),deps(h));
 const retry=await dispatchInboundReplies(params,await processInbound(params,deps(h)),deps(h));
 assertEquals(retry.status,503);assertEquals(h.provider.requests.length,1);assertEquals(question(h).id,row.id);assertEquals(effects.length,0);
});

Deno.test("claimed selection cannot be consumed or inferred queued on origin retry",async()=>{
 const {h,effects}=inboundFixture();const {params}=await ask(h);const row=question(h);
 row.twilio_status="claimed";row.twilio_sid=null;
 const choice=inbound(h,"1","SMclaimedChoice");
 assertEquals((await processInbound(choice,deps(h))).status,503);
 assertEquals((await processInbound(choice,deps(h))).status,503,"failed recovery must retry rather than dedupe to success");
 const retry=await dispatchInboundReplies(params,await processInbound(params,deps(h)),deps(h));
 assertEquals(retry.status,503);assertEquals(effects.length,0);assertEquals(h.provider.requests.length,1);
});
