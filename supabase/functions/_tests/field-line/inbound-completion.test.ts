import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { processInbound } from "../../sms-inbound/pipeline.ts";
import { dispatchInboundReplies } from "../../sms-inbound/index.ts";
import { inboundFixture, selectionFixture } from "./inbound-fixture.ts";
const deps=(h:any,parseFn:any=async()=>{throw Error("unexpected parser")})=>({supabase:h.fake,now:h.clock,getEnv:h.env,fetchImpl:h.provider.fetch,parseFn});
const input=(h:any,Body:string,MessageSid:string)=>({From:h.recipient,To:h.sender,Body,MessageSid,NumMedia:"0"});
const ambiguous=async()=>({intent:"mark_done",target_ref:null,new_date:null,note:"done",confidence:0.7});
Deno.test("R2 creation failure offers no affirmative code and makes no business write",async()=>{
 const {h,effects}=inboundFixture(); const rpc=h.fake.rpc; h.fake.rpc=async(name,args)=>name==="sms_create_prompt"?{data:null,error:{code:"23514",message:"proposal persistence refused"}}:rpc(name,args);
 const result=await processInbound(input(h,"mantel delayed","SMcreatefail"),deps(h,async()=>({intent:"report_delay",target_ref:{kind:"task",id:"task-a"},new_date:"2026-11-04",note:"original",confidence:0.65})));
 assertEquals(effects.length,0); assertEquals(h.fake._data.sms_prompts?.length??0,0);
 assert(!JSON.stringify(result).match(/Reply YES \d/),"failed creation must never offer a code");
});
Deno.test("R2 creation persists exact payload before confirmation without applying early",async()=>{
 const {h,effects}=inboundFixture(); const rpc=h.fake.rpc; let created:any;
 h.fake.rpc=async(name,args)=>{const r=await rpc(name,args);if(name==="sms_create_prompt")created=structuredClone(args);return r;};
 const result=await processInbound(input(h,"mantel delayed","SMcreateok"),deps(h,async()=>({intent:"report_delay",target_ref:{kind:"task",id:"task-a"},new_date:"2026-11-04",note:"original",confidence:0.65})));
 assertEquals(result.disposition,"clarify");assertEquals(effects.length,0,"no effect before affirmation");
 assertEquals(created.p_proposed_effect,{type:"report_delay",target:{kind:"task",id:"task-a"},note:"original",new_date:"2026-11-04"});
 assertEquals(created.p_subject_id,"task-a");assertEquals(created.p_party_id,"party-a");assertEquals(created.p_project_id,"project-a");assertEquals(created.p_version,1);
 assertEquals(h.fake._data.sms_prompts[0].proposed_effect,created.p_proposed_effect,"payload durable before code offered");
});
Deno.test("resolved older chooser origin retry cannot replay after a newer chooser is resolved",async()=>{
 const {h,id,effects}=selectionFixture(new Date("2026-11-01T14:00:00Z"));
 async function ask(body:string,sid:string){const p=input(h,body,sid);const r=await processInbound(p,deps(h,ambiguous));assertEquals(r.disposition,"project_chooser");const d=await dispatchInboundReplies(p,r,deps(h));assertEquals(d.status,200);const q=h.fake._data.sms_messages.find((x:any)=>x.template_key==="sms_selection"&&x.recipe.selection.inboundMessageId===r.messageId)!;assert(q);q.twilio_status="delivered";return p;}
 async function choose(n:string,sid:string,target:string){const r=await processInbound(input(h,n,sid),deps(h,async()=>({intent:"flag_blocker",target_ref:{kind:"task",id:id(target)},new_date:null,note:"blocked",confidence:0.95})));assertEquals(r.disposition,"applied");}
 const first=await ask("mantel blocked","SMA-origin");await choose("1","SMA-choice","task-a");assertEquals(effects.length,1);
 h.advanceTo(new Date("2026-11-01T19:00:00Z"));await ask("tile blocked","SMB-origin");await choose("2","SMB-choice","task-b");assertEquals(effects.length,2);
 const before=structuredClone(h.fake._data.sms_conversations[0]);
 const retry=await dispatchInboundReplies(first,await processInbound(first,deps(h)),deps(h));
 const conv=h.fake._data.sms_conversations[0];console.log("older-origin retry",JSON.stringify({retry,before,after:conv,wires:h.provider.requests.length}));
 const replay=await processInbound(input(h,"1","SMlate-choice"),deps(h,async()=>({intent:"flag_blocker",target_ref:{kind:"task",id:id("task-a")},new_date:null,note:"blocked",confidence:0.95})));
 console.log("older-origin replay",JSON.stringify({replay,effects}));
 assertEquals(effects.length,2,"old resolved origin must not replay its stashed business write");
 assertEquals(conv.state,"idle","old resolved origin must not reopen chooser");
});
Deno.test("post-effect attribution failure cannot revive resolved older chooser on retry",async()=>{
 const {h,id,effects}=selectionFixture(new Date("2026-11-01T14:00:00Z"));
 const rpc=h.fake.rpc;h.fake.rpc=async(name,args)=>{const result=await rpc(name,args);if(name==="apply_field_effect"&&!result.error){const m=h.fake._data.sms_messages.find(x=>x.id===args.p_sms_message_id);m.applied_effect={...result.data,applied:true};}return result;};
 async function ask(body:string,sid:string){const p=input(h,body,sid);const r=await processInbound(p,deps(h,ambiguous));assertEquals(r.disposition,"project_chooser");const d=await dispatchInboundReplies(p,r,deps(h));assertEquals(d.status,200);const q=h.fake._data.sms_messages.find((x:any)=>x.template_key==="sms_selection"&&x.recipe.selection.inboundMessageId===r.messageId)!;assert(q);q.twilio_status="delivered";return p;}
 async function choose(n:string,sid:string,target:string){const r=await processInbound(input(h,n,sid),deps(h,async()=>({intent:"flag_blocker",target_ref:{kind:"task",id:id(target)},new_date:null,note:"blocked",confidence:0.95})));assertEquals(r.disposition,"applied");}
 const first=await ask("mantel blocked","SMA-origin");
 const from=h.fake.from.bind(h.fake);let failStamp=true;h.fake.from=(table)=>{const q=from(table);const update=q.update.bind(q);q.update=(patch)=>{if(failStamp&&table==="sms_messages"&&patch.parsed_intent?.path==="llm"){failStamp=false;q.eq=()=>q;q.then=(resolve)=>Promise.resolve({data:null,error:{message:"post-effect attribution write lost"}}).then(resolve);return q;}return update(patch);};return q;};
 await choose("1","SMA-choice","task-a");assertEquals(effects.length,1);
 h.advanceTo(new Date("2026-11-01T19:00:00Z"));await ask("tile blocked","SMB-origin");await choose("2","SMB-choice","task-b");assertEquals(effects.length,2);
 const before=structuredClone(h.fake._data.sms_conversations[0]);
 const retry=await dispatchInboundReplies(first,await processInbound(first,deps(h)),deps(h));
 const conv=h.fake._data.sms_conversations[0];console.log("older-origin retry",JSON.stringify({retry,before,after:conv,wires:h.provider.requests.length}));
 const replay=await processInbound(input(h,"1","SMlate-choice"),deps(h,async()=>({intent:"flag_blocker",target_ref:{kind:"task",id:id("task-a")},new_date:null,note:"blocked",confidence:0.95})));
 console.log("older-origin replay",JSON.stringify({replay,effects}));
 assertEquals(effects.length,2,"old resolved origin must not replay its stashed business write");
 assertEquals(conv.state,"idle","old resolved origin must not reopen chooser");
});
