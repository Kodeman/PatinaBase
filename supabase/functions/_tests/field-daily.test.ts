// Deno test for the field-daily digest cron core.
// Run: deno test --no-check -A supabase/functions/_tests/field-daily.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildDigestMenu,
  DIGEST_MENU_MAX_SEPTETS,
  runFieldDaily,
  shouldSendDeliveryConfirm,
  type DigestItem,
} from "../field-daily/core.ts";
import type { SendPartySmsInput } from "../_shared/sms.ts";
import { createFakeSupabase as baseFakeSupabase } from "./fake-supabase.ts";
function createFakeSupabase(...args: Parameters<typeof baseFakeSupabase>) {
  const fake = baseFakeSupabase(...args);
  const rpc = fake.rpc;
  let code = 20;
  fake.rpc = async (name, params = {}) => {
    if (name === "sms_is_suppressed") return { data: false, error: null };
    if (name === "sms_create_prompt") {
      const row = { id: crypto.randomUUID(), short_code: String(code++), party_id: params.p_party_id, project_id: params.p_project_id,
        subject_id: params.p_subject_id, kind: params.p_kind, version: params.p_version, sender_number: params.p_sender_number,
        recipient_phone: params.p_recipient_phone, expires_at: params.p_expires_at, answered_at: null };
      (fake._data.sms_prompts ??= []).push(row);
      return { data: [row], error: null };
    }
    return rpc(name, params);
  };
  return fake;
}

const TODAY = "2026-07-08";

const THREE_ITEMS: DigestItem[] = [
  { id: "t1", kind: "task", title: "Install vanity", project_id: "p1", due: TODAY },
  { id: "c1", kind: "coordination", title: "Confirm grout", project_id: "p1", due: null },
  { id: "t2", kind: "task", title: "Set tile", project_id: "p1", due: "2026-07-01" },
];

function septets(text: string): number {
  let n = 0;
  for (const ch of text) n += "^{}\\[~]|€".includes(ch) ? 2 : 1;
  return n;
}

Deno.test("buildDigestMenu numbers items with due labels", () => {
  // Room for all three, so this still reads the numbering and the labels.
  const { menuText, entries } = buildDigestMenu(THREE_ITEMS, TODAY, 1000);
  assertEquals(entries.length, 3);
  assertEquals(entries[0], { n: 1, kind: "task", id: "t1", project_id: "p1" });
  assert(menuText.includes("1) Install vanity (due today)"));
  assert(menuText.includes("2) Confirm grout"));
  assert(menuText.includes("3) Set tile (overdue)"));
});

Deno.test("buildDigestMenu drops what will not fit and says how many", () => {
  // 68 septets of menu against the 42 the digest body can pay for (S8).
  const { menuText, entries } = buildDigestMenu(THREE_ITEMS, TODAY);
  assert(
    septets(menuText) <= DIGEST_MENU_MAX_SEPTETS,
    `the menu is ${septets(menuText)} septets: "${menuText}"`,
  );
  assertEquals(menuText, "1) Install vanity (due today) +2 more");
  // The entries are the lines they were shown, so "2" cannot mean an item
  // that never appeared in the text.
  assertEquals(entries.length, 1);
  assertEquals(entries[0], { n: 1, kind: "task", id: "t1", project_id: "p1" });
});

Deno.test("buildDigestMenu truncates a first item too long for the budget", () => {
  const { menuText, entries } = buildDigestMenu(
    [{ id: "t1", kind: "task", title: "I".repeat(40), project_id: "p1", due: TODAY }],
    TODAY,
  );
  assertEquals(septets(menuText), DIGEST_MENU_MAX_SEPTETS);
  assertEquals(menuText, `1) ${"I".repeat(24)}... (due today)`);
  assert(!menuText.includes("…"), "an ellipsis character would force UCS-2");
  assertEquals(entries.length, 1);
});

Deno.test("buildDigestMenu is empty for no items (skip signal)", () => {
  const { menuText, entries } = buildDigestMenu([], TODAY);
  assertEquals(entries.length, 0);
  assertEquals(menuText, "");
});

Deno.test("shouldSendDeliveryConfirm dedupes on sent event ids", () => {
  assert(!shouldSendDeliveryConfirm("ev1", ["ev1"]));
  assert(shouldSendDeliveryConfirm("ev2", ["ev1"]));
  assert(shouldSendDeliveryConfirm("ev1", null));
  assert(shouldSendDeliveryConfirm("ev1", undefined));
});

Deno.test("runFieldDaily composes + persists the menu and sends one digest", async () => {
  const fake = createFakeSupabase({
    // The consent is the RECORD's (R-AY): the seat word beside it is read by
    // nothing, here or in the send gate this cron stands in front of.
    projects: [{ id: "proj1", studio_id: "org1", designer_id: "designer1" }],
    studio_channel_consent: [{
      organization_id: "org1",
      channel_kind: "sms",
      channel_value: "+15550001111",
      status: "granted",
    }],
    project_parties: [
      { id: "pty1", phone_e164: "+15550001111", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted", display_name: "Sal" },
    ],
    project_tasks: [
      { id: "task1", title: "Install vanity", due_date: TODAY, project_id: "proj1", owner_party_id: "pty1", status: "todo" },
    ],
    client_decisions: [],
    delivery_events: [],
    sms_conversations: [],
  });

  const sent: SendPartySmsInput[] = [];
  const summary = await runFieldDaily(fake as never, {
    getEnv: (k) => (k === "TWILIO_FROM_NUMBER" ? "+15559990000" : undefined),
    now: new Date(`${TODAY}T17:00:00Z`),
    sendFn: (_s, input) => { sent.push(input); return Promise.resolve({ sent: true }); },
    flushFn: () => Promise.resolve({ flushed: 0, skipped: 0 }),
  });

  assertEquals(summary.digests_sent, 1);
  assertEquals(sent.length, 1);
  assertEquals(sent[0].templateKey, "sms_daily_digest");
  assert(String(sent[0].vars?.menu).includes("1) Install vanity"));

  // The numbered menu is persisted on the conversation for inbound resolution.
  const conv = (fake._data.sms_conversation_context ?? [])[0] as { state_context: { menu: unknown[] } };
  assert(conv, "a conversation should exist");
  assertEquals((conv.state_context.menu as unknown[]).length, 1);
});

Deno.test("runFieldDaily skips a party with nothing to say", async () => {
  const fake = createFakeSupabase({
    projects: [{ id: "proj1", studio_id: "org1", designer_id: "designer1" }],
    studio_channel_consent: [{
      organization_id: "org1",
      channel_kind: "sms",
      channel_value: "+15550001111",
      status: "granted",
    }],
    project_parties: [
      { id: "pty1", phone_e164: "+15550001111", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted", display_name: "Sal" },
    ],
    project_tasks: [],
    client_decisions: [],
    delivery_events: [],
    sms_conversations: [],
  });
  let sends = 0;
  const summary = await runFieldDaily(fake as never, {
    getEnv: (k) => (k === "TWILIO_FROM_NUMBER" ? "+15559990000" : undefined),
    now: new Date(`${TODAY}T17:00:00Z`),
    sendFn: () => { sends++; return Promise.resolve({ sent: true }); },
    flushFn: () => Promise.resolve({ flushed: 0, skipped: 0 }),
  });
  assertEquals(summary.digests_sent, 0);
  assertEquals(summary.parties_skipped, 1);
  assertEquals(sends, 0);
});

Deno.test("runFieldDaily sends a delivery confirm once, then dedupes", async () => {
  function scenario(alreadySent: string[]) {
    return createFakeSupabase({
      projects: [{ id: "proj1", studio_id: "org1", designer_id: "designer1" }],
      studio_channel_consent: [{
        organization_id: "org1",
        channel_kind: "sms",
        channel_value: "+15550002222",
        status: "granted",
      }],
      project_parties: [
        { id: "recv1", phone_e164: "+15550002222", project_id: "proj1", party_kind: "receiver", sms_consent_status: "granted", display_name: "Rex" },
      ],
      project_tasks: [],
      client_decisions: [],
      delivery_events: [
        { event_id: "ev2", project_id: "proj1", vendor_name: "RH", event_date: TODAY, event_type: "delivery_expected" },
      ],
      sms_conversation_context: [{ conversation_id: "conv1", project_id: "proj1", party_id: "recv1", state: "idle",
        state_context: { delivery_confirms_sent: alreadySent }, paused_until: null, backfilled_at: null }],
      sms_conversations: [
        { id: "conv1", twilio_number: "+15559990000", phone_e164: "+15550002222", active_project_id: "proj1", party_id: "recv1", state: "idle" },
      ],
    });
  }

  // Fresh event → sends + records the event id.
  const fresh = scenario(["ev1"]);
  let deliverySends = 0;
  const s1 = await runFieldDaily(fresh as never, {
    getEnv: (k) => (k === "TWILIO_FROM_NUMBER" ? "+15559990000" : undefined),
    now: new Date(`${TODAY}T17:00:00Z`),
    sendFn: (_s, input) => { if (input.templateKey === "sms_delivery_confirm") deliverySends++; return Promise.resolve({ sent: true }); },
    flushFn: () => Promise.resolve({ flushed: 0, skipped: 0 }),
  });
  assertEquals(s1.delivery_confirms_sent, 1);
  assertEquals(deliverySends, 1);
  const conv = (fresh._data.sms_conversation_context ?? [])[0] as { state_context: { delivery_confirms_sent: string[] } };
  assert(conv.state_context.delivery_confirms_sent.includes("ev2"));

  // Already-sent event → no send.
  const dup = scenario(["ev2"]);
  let dupSends = 0;
  const s2 = await runFieldDaily(dup as never, {
    getEnv: (k) => (k === "TWILIO_FROM_NUMBER" ? "+15559990000" : undefined),
    now: new Date(`${TODAY}T17:00:00Z`),
    sendFn: (_s, input) => { if (input.templateKey === "sms_delivery_confirm") dupSends++; return Promise.resolve({ sent: true }); },
    flushFn: () => Promise.resolve({ flushed: 0, skipped: 0 }),
  });
  assertEquals(s2.delivery_confirms_sent, 0);
  assertEquals(dupSends, 0);
});

Deno.test("runFieldDaily keys the digest conversation on SMS_CONVERSATION_NUMBER when TWILIO_FROM_NUMBER is an MG… Messaging Service SID", async () => {
  const fake = createFakeSupabase({
    projects: [{ id: "proj1", studio_id: "org1", designer_id: "designer1" }],
    studio_channel_consent: [{
      organization_id: "org1",
      channel_kind: "sms",
      channel_value: "+15550001111",
      status: "granted",
    }],
    project_parties: [
      { id: "pty1", phone_e164: "+15550001111", project_id: "proj1", party_kind: "sub", sms_consent_status: "granted", display_name: "Sal" },
    ],
    project_tasks: [
      { id: "task1", title: "Install vanity", due_date: TODAY, project_id: "proj1", owner_party_id: "pty1", status: "todo" },
    ],
    client_decisions: [],
    delivery_events: [],
    sms_conversations: [],
  });

  const sent: SendPartySmsInput[] = [];
  const summary = await runFieldDaily(fake as never, {
    getEnv: (k) => {
      if (k === "TWILIO_FROM_NUMBER") return "MG0123456789abcdef";
      if (k === "SMS_CONVERSATION_NUMBER") return "+15551230000";
      return undefined;
    },
    now: new Date(`${TODAY}T17:00:00Z`),
    sendFn: (_s, input) => { sent.push(input); return Promise.resolve({ sent: true }); },
    flushFn: () => Promise.resolve({ flushed: 0, skipped: 0 }),
  });

  assertEquals(summary.digests_sent, 1);
  assertEquals(sent.length, 1);
  const conv = (fake._data.sms_conversations ?? [])[0] as { twilio_number: string };
  assert(conv, "a conversation should exist");
  assertEquals(
    conv.twilio_number,
    "+15551230000",
    "conversation keyed on the physical override, not the MG SID",
  );
});

// ── close-out r3 MAJOR-2: the digest reads the RECORD, not the frozen seat ───
//
// Both recipient selects used to carry `.eq("sms_consent_status", "granted")`
// on project_parties — the column 00594 froze. Nothing writes a seat to
// 'granted' any more, so the cron's recipient set could only ever contain
// pre-fold rows and the daily digest went dead for every consent recorded
// after the freeze. The gate is now channelConsentVerdict — the same function
// sendPartySms asks — plus the legacy seat leg sendPartySms still honours.

/** A studio, a project under it, and a consent record for one number. */
function consentScenario(opts: {
  seatStatus: string;
  record?: { status: string; refusal_unanswered?: boolean };
  partyKind?: string;
  withTask?: boolean;
  deliveryEvent?: boolean;
}) {
  return createFakeSupabase({
    organizations: [{ id: "org1", type: "design_studio", status: "active" }],
    projects: [{ id: "proj1", studio_id: "org1", designer_id: "designer1" }],
    project_parties: [
      {
        id: "pty1",
        phone_e164: "+15550001111",
        project_id: "proj1",
        party_kind: opts.partyKind ?? "sub",
        sms_consent_status: opts.seatStatus,
        display_name: "Sal",
      },
    ],
    studio_channel_consent: opts.record
      ? [{
        organization_id: "org1",
        channel_kind: "sms",
        channel_value: "+15550001111",
        status: opts.record.status,
        refusal_unanswered: opts.record.refusal_unanswered ?? false,
      }]
      : [],
    project_tasks: opts.withTask === false ? [] : [
      { id: "task1", title: "Install vanity", due_date: TODAY, project_id: "proj1", owner_party_id: "pty1", status: "todo" },
    ],
    client_decisions: [],
    delivery_events: opts.deliveryEvent
      ? [{ event_id: "ev9", project_id: "proj1", vendor_name: "RH", event_date: TODAY, event_type: "delivery_expected" }]
      : [],
    sms_conversations: [],
  });
}

function runWith(fake: unknown, sent: SendPartySmsInput[]) {
  return runFieldDaily(fake as never, {
    getEnv: (k) => (k === "TWILIO_FROM_NUMBER" ? "+15559990000" : undefined),
    now: new Date(`${TODAY}T17:00:00Z`),
    sendFn: (_s, input) => { sent.push(input); return Promise.resolve({ sent: true }); },
    flushFn: () => Promise.resolve({ flushed: 0, skipped: 0 }),
  });
}

Deno.test("runFieldDaily digests a party the RECORD granted while the frozen seat still says pending (close-out r3 MAJOR-2)", async () => {
  const sent: SendPartySmsInput[] = [];
  const summary = await runWith(
    consentScenario({ seatStatus: "pending", record: { status: "granted" } }),
    sent,
  );
  assertEquals(summary.digests_sent, 1);
  assertEquals(sent.length, 1);
  assertEquals(sent[0].templateKey, "sms_daily_digest");
});

Deno.test("runFieldDaily texts nobody when the record refuses, whatever the frozen seat says", async () => {
  const sent: SendPartySmsInput[] = [];
  const summary = await runWith(
    consentScenario({ seatStatus: "granted", record: { status: "opted_out" } }),
    sent,
  );
  assertEquals(summary.digests_sent, 0);
  assertEquals(sent.length, 0);
  assertEquals(summary.parties_skipped, 1);
});

Deno.test("runFieldDaily texts nobody when a standing refusal is unanswered under a granted record", async () => {
  const sent: SendPartySmsInput[] = [];
  const summary = await runWith(
    consentScenario({
      seatStatus: "granted",
      record: { status: "granted", refusal_unanswered: true },
    }),
    sent,
  );
  assertEquals(summary.digests_sent, 0);
  assertEquals(sent.length, 0);
});

Deno.test("runFieldDaily texts nobody the studio never asked — no record, and a seat nobody moved", async () => {
  const sent: SendPartySmsInput[] = [];
  const summary = await runWith(
    consentScenario({ seatStatus: "not_asked" }),
    sent,
  );
  assertEquals(summary.digests_sent, 0);
  assertEquals(sent.length, 0);
  assertEquals(summary.parties_skipped, 1);
});

// R-AW: there is no such population as "a granted seat with no record". 00594's
// fold folded every seat into a record inside the same migration, and the
// freeze stopped the seats carrying news afterwards — so a pair with no record
// was never asked, and not_asked refuses. This test used to assert the opposite
// (the pre-fold seat kept its digest, PR-x's fail-closed second check); it now
// asserts the leg's removal, and the skip is counted so an empty run says why.
Deno.test("runFieldDaily does not digest a frozen granted seat the record knows nothing about (R-AW)", async () => {
  const sent: SendPartySmsInput[] = [];
  const summary = await runWith(
    consentScenario({ seatStatus: "granted" }),
    sent,
  );
  assertEquals(summary.digests_sent, 0);
  assertEquals(sent.length, 0);
  assertEquals(summary.parties_skipped, 1);
});

Deno.test("runFieldDaily's delivery confirm follows the same record (MAJOR-2's second filter)", async () => {
  const sent: SendPartySmsInput[] = [];
  const granted = await runWith(
    consentScenario({
      seatStatus: "pending",
      record: { status: "granted" },
      partyKind: "receiver",
      withTask: false,
      deliveryEvent: true,
    }),
    sent,
  );
  assertEquals(granted.delivery_confirms_sent, 1);
  assertEquals(sent.filter((s) => s.templateKey === "sms_delivery_confirm").length, 1);

  const refusedSent: SendPartySmsInput[] = [];
  const refused = await runWith(
    consentScenario({
      seatStatus: "granted",
      record: { status: "opted_out" },
      partyKind: "receiver",
      withTask: false,
      deliveryEvent: true,
    }),
    refusedSent,
  );
  assertEquals(refused.delivery_confirms_sent, 0);
  assertEquals(refusedSent.length, 0);
});

import { inboundFixture } from "./field-line/inbound-fixture.ts";
import { processInbound } from "../sms-inbound/pipeline.ts";
Deno.test("daily refs fit the canonical 306-septet wire budget and retry without allocating again", async () => {
  const { h } = inboundFixture();
  const rpc = h.fake.rpc;
  h.fake.rpc = async (name, args) => {
    if (name === "create_field_link") return { data: [{ id: "link-fixture", token: "a".repeat(64) }], error: null };
    const result = await rpc(name, args);
    if (name === "sms_create_prompt") {
      const row = h.fake._data.sms_prompts.at(-1)!;
      row.short_code = String(100 + h.fake._data.sms_prompts.length);
      return { data: [{ id: row.id, short_code: row.short_code }], error: null };
    }
    return result;
  };
  h.fake._data.organizations = [{id:"studio-a", name:"[".repeat(12)}, {id:"studio-b", name:"[".repeat(12)}];
  h.fake._data.profiles.forEach(p => p.full_name = "[".repeat(12));
  h.fake._data.projects.forEach(p => p.name = "^".repeat(12));
  h.fake._data.project_tasks.forEach(t => t.title = "{".repeat(80));
  const deps = { now: h.clock, getEnv: (key:string) => key === "CLIENT_PORTAL_URL" ? "https://" + "p".repeat(14) + ".test" : h.env(key), fetchImpl: h.provider.fetch };
  const result = await runFieldDaily(h.fake as never, deps);
  assertEquals(result.digests_sent, 2, "phase zero does not gate the existing digest");
  assertEquals(h.fake._data.sms_prompts?.length ?? 0, 2, "visible digest items each receive an immutable prompt");
  assertEquals(h.fake._data.sms_conversations.length, 1, "one shared transport thread");
  assertEquals(h.fake._data.sms_conversation_context.length, 2, "separate project menus");
  for (const context of h.fake._data.sms_conversation_context) {
    assertEquals(context.backfilled_at, null);
    assertEquals((context.state_context as any).menu[0].project_id, context.project_id);
  }
  for (const request of h.provider.requests) {
    const body = new URLSearchParams(String(request.init?.body)).get("Body")!;
    assert(/Ref 10[12]/.test(body), "three-digit refs remain visible"); assert(body.startsWith("[".repeat(12)));
    assertEquals(septets(body), 306, `maximum names/link/menu: ${septets(body)} septets; ${body}`);
  }
  for (const row of h.fake._data.sms_messages.filter(m => m.direction === "outbound")) {
    assert(septets((row.recipe as any).params.menu) <= 42);
    assert(!JSON.stringify(row.recipe).includes("a".repeat(64)), "durable params contain no minted credential");
  }
  const menus = structuredClone(h.fake._data.sms_conversation_context);
  h.fake._data.project_tasks.forEach(t => { t.id += "-new"; t.title = "Replacement task"; });
  await runFieldDaily(h.fake as never, deps);
  assertEquals(h.fake._data.sms_conversation_context, menus, "retry cannot replace the already-sent numbered menu");
  assertEquals(h.fake._data.sms_prompts.length, 2, "same-day retry reuses immutable refs");
  assertEquals(h.provider.requests.length, 2, "same logical digest is not sent twice");
});

Deno.test("daily suppression and paused contexts do not allocate prompts, while unpaused B still digests", async () => {
  const { h } = inboundFixture();
  h.fake._data.sms_conversations = [{id:"conv", twilio_number:h.sender, phone_e164:h.recipient}];
  h.fake._data.sms_conversation_context = [{conversation_id:"conv", project_id:"project-a", party_id:"party-a", state:"idle", state_context:{}, paused_until:"2026-11-02T14:00:00Z", backfilled_at:null}];
  const sent: SendPartySmsInput[] = [];
  const deps = {now:h.clock, getEnv:h.env, sendFn:async (_s:any, input:SendPartySmsInput) => {sent.push(input);return {sent:true};}, flushFn:async()=>({flushed:0,skipped:0})};
  await runFieldDaily(h.fake as never, deps);
  assertEquals(sent.map(s=>s.partyId), ["party-b"]);
  assertEquals(h.fake._data.sms_prompts.map(p=>p.project_id), ["project-b"]);
  h.fake._data.sms_suppressions = [{sender_number:h.sender,recipient_phone:h.recipient,lifted_at:null}];
  sent.length=0; await runFieldDaily(h.fake as never, deps);
  assertEquals(sent.length,0);assertEquals(h.fake._data.sms_prompts.length,1, "suppression precedes allocation");
});

Deno.test("daily delivery PO prompt supplies Ref and no proposed effect", async () => {
  const { h } = inboundFixture();
  h.fake._data.project_tasks=[];
  h.fake._data.project_parties[0].party_kind="receiver";
  h.fake._data.delivery_events=[{event_id:"po-a",project_id:"project-a",vendor_name:"Maker",event_date:"2026-11-02",event_type:"delivery_expected"}];
  const sent: SendPartySmsInput[]=[];
  await runFieldDaily(h.fake as never,{now:h.clock,getEnv:h.env,sendFn:async(_s,input)=>{sent.push(input);return {sent:true};},flushFn:async()=>({flushed:0,skipped:0})});
  assertEquals(sent.length,1); assertEquals(h.fake._data.sms_prompts?.length ?? 0, 1, "delivery allocates its immutable PO reference");
  assertEquals(sent[0].vars?.ref,h.fake._data.sms_prompts[0].short_code);
  assertEquals(h.fake._data.sms_prompts[0].subject_id,"po-a");assertEquals(h.fake._data.sms_prompts[0].proposed_effect,null);
  assertEquals(sent[0].automationPhase,0,"existing delivery automation remains phase zero");
});

Deno.test("deferred daily recipe keeps its numbered menu until dispatch despite changed tasks", async () => {
  const { h } = inboundFixture(undefined, new Date("2026-11-02T04:00:00Z"));
  const deps = { now:h.clock, getEnv:h.env, fetchImpl:h.provider.fetch };
  const first = await runFieldDaily(h.fake as never, deps);
  assertEquals(first.digests_sent, 2);
  assertEquals(h.provider.requests.length, 0, "quiet hours queue, never send");
  const rows = h.fake._data.sms_messages.filter(m => m.template_key === "sms_daily_digest");
  assertEquals(rows.length, 2); assert(rows.every(m => m.twilio_status === "deferred"));
  const menus = structuredClone(h.fake._data.sms_conversation_context);
  const recipes = rows.map(m => structuredClone(m.recipe));
  h.fake._data.project_tasks.forEach(t => { t.id += "-replacement"; t.title = "Changed while waiting"; });
  await runFieldDaily(h.fake as never, deps);
  assertEquals(h.fake._data.sms_conversation_context, menus, "deferred retry cannot rewrite numbered targets");
  assertEquals(rows.map(m => m.recipe), recipes);
  await runFieldDaily(h.fake as never, { ...deps, now: new Date("2026-11-02T14:00:00Z") });
  assertEquals(h.provider.requests.length, 2, "each deferred recipe dispatches exactly once");
  for (let i=0; i<2; i++) {
    const body = new URLSearchParams(String(h.provider.requests[i].init?.body)).get("Body")!;
    assert(body.includes((recipes[i] as any).params.menu), "wire uses the original queued menu");
  }
  assertEquals(h.fake._data.sms_prompts?.length ?? 0, 2, "visible digest items each receive an immutable prompt");
});

Deno.test("concurrent daily runs mint exactly one prompt for the same visible digest item",async()=>{
 const {h}=inboundFixture();h.fake._data.project_parties=h.fake._data.project_parties.filter((p:any)=>p.id==="party-a");
 h.fake._data.project_tasks=[{id:"task-a",owner_party_id:"party-a",project_id:"project-a",title:"Work",status:"todo",due_date:null}];
 h.fake._data.client_decisions=[];h.fake._data.delivery_events=[];
 const rpc=h.fake.rpc;let arrivals=0,release!:()=>void,entered!:()=>void;const both=new Promise<void>(r=>release=r),reached=new Promise<void>(r=>entered=r);
 h.fake.rpc=async(name:string,args:any)=>{if(name==="sms_create_prompt"&&++arrivals===1){entered();await both;}return rpc(name,args);};
 const sent:any[]=[];const d={now:h.clock,getEnv:h.env,fetchImpl:h.provider.fetch,sendFn:async(_s:any,i:any)=>{sent.push(i);return {sent:true};},flushFn:async()=>({flushed:0,skipped:0})};
 const first=runFieldDaily(h.fake as never,d);await reached;
 const loser=await runFieldDaily(h.fake as never,d);const loserSends=sent.length;release();
 const results=[await first,loser];
 console.log(JSON.stringify({results,sent,prompts:h.fake._data.sms_prompts}));
 assertEquals(sent.length,1,"one context CAS winner sends the digest");
 assertEquals(h.fake._data.sms_prompts.length,1,"one visible digest item must not create an invisible second open Ref");
 assertEquals(loserSends,0,"live-lease loser sends nothing");assertEquals(loser.digests_sent,0);
});

function singleDigestFixture() {
  const {h} = inboundFixture();
  h.fake._data.project_parties = h.fake._data.project_parties.filter(p => p.id === "party-a");
  h.fake._data.project_tasks = [{id:"task-a",owner_party_id:"party-a",project_id:"project-a",title:"Work",status:"todo",due_date:null}];
  h.fake._data.client_decisions=[]; h.fake._data.delivery_events=[];
  return h;
}
for (const minted of [false,true]) Deno.test("expired unrendered digest recovers " + (minted ? "existing" : "missing") + " ref after crash",async()=>{
  const h=singleDigestFixture(),day=h.clock.toISOString().slice(0,10);
  h.fake._data.sms_conversations=[{id:"conv",twilio_number:h.sender,phone_e164:h.recipient}];
  const item={id:"task-a",kind:"task",title:"Work",project_id:"project-a",due:null};
  h.fake._data.sms_conversation_context=[{conversation_id:"conv",project_id:"project-a",party_id:"party-a",state:"idle",backfilled_at:null,paused_until:null,state_context:{
    digest_day:day,digest_menu_text:null,digest_items:[item],digest_claim:{run_id:"dead-run",claimed_at:new Date(h.clock.getTime()-180000).toISOString(),lease_until:new Date(h.clock.getTime()-60000).toISOString()}}}];
  if(minted) await h.fake.rpc("sms_create_prompt",{p_party_id:"party-a",p_project_id:"project-a",p_subject_id:"task-a",p_kind:"mark_done",p_version:Number(day.replaceAll("-","")),p_sender_number:h.sender,p_recipient_phone:h.recipient,p_expires_at:new Date(h.clock.getTime()+86400000).toISOString(),p_proposed_effect:null});
  const rpc=h.fake.rpc;let creates=0;
  h.fake.rpc=async(n,a)=>{if(n==="sms_create_prompt")creates++;return rpc(n,a);};
  h.fake._data.project_tasks[0].id="changed-after-claim";
  const deps={now:h.clock,getEnv:h.env,fetchImpl:h.provider.fetch};
  await runFieldDaily(h.fake as never,deps);await runFieldDaily(h.fake as never,deps);
  assertEquals(creates,minted?0:1,"crash recovery mints only missing refs");
  assertEquals(h.fake._data.sms_prompts.length,1);
  assertEquals(h.fake._data.sms_prompts[0].subject_id,"task-a","claim freezes item identity before mint");
  assertEquals(h.provider.requests.length,1,"recovered digest sends once");
});
Deno.test("handled pre-mint failure releases own digest claim for immediate retry",async()=>{
  const h=singleDigestFixture(),rpc=h.fake.rpc;let fail=true;
  h.fake.rpc=async(n,a)=>{if(n==="sms_create_prompt"&&fail){fail=false;return {data:null,error:{message:"unavailable"}};}return rpc(n,a);};
  const deps={now:h.clock,getEnv:h.env,fetchImpl:h.provider.fetch};
  const first=await runFieldDaily(h.fake as never,deps);
  assertEquals(first.digests_sent,0);assertEquals(h.fake._data.sms_prompts.length,0);
  assertEquals((h.fake._data.sms_conversation_context[0].state_context as any).digest_claim,undefined,"failed mint releases own token");
  await runFieldDaily(h.fake as never,deps);
  assertEquals(h.fake._data.sms_prompts.length,1);assertEquals(h.provider.requests.length,1);
});
Deno.test("late mint stays open and recovery adopts it after claim ownership changes",async()=>{
  const h=singleDigestFixture(),rpc=h.fake.rpc;let first=true;
  h.fake.rpc=async(n,a)=>{
    if(n==="sms_create_prompt"&&first){first=false;
      const ctx=h.fake._data.sms_conversation_context[0].state_context as any;
      ctx.digest_claim={run_id:"recovery-winner",claimed_at:h.clock.toISOString(),lease_until:new Date(h.clock.getTime()+120000).toISOString()};
    }
    return rpc(n,a);
  };
  const result=await runFieldDaily(h.fake as never,{now:h.clock,getEnv:h.env,fetchImpl:h.provider.fetch});
  assertEquals(result.digests_sent,0);assertEquals(h.provider.requests.length,0);
  assertEquals(h.fake._data.sms_prompts.filter(p=>p.answered_at==null).length,1,"lost owner's newly minted ref stays open");
  assertEquals((h.fake._data.sms_conversation_context[0].state_context as any).digest_claim.run_id,"recovery-winner","loser never releases winner's token");
  const minted=h.fake._data.sms_prompts[0];
  const recovery=await runFieldDaily(h.fake as never,{now:new Date(h.clock.getTime()+180000),getEnv:h.env,fetchImpl:h.provider.fetch});
  assertEquals(recovery.digests_sent,1);
  assertEquals(h.fake._data.sms_prompts.length,1,"recovery adopts the late mint without creating another ref");
  assertEquals(minted.answered_at,null);
  const wire=new URLSearchParams(String(h.provider.requests[0].init?.body)).get("Body")!;
  assert(wire.includes("Ref "+minted.short_code),"recovery advertises the late owner's open ref");
});

// SQ-79 recovery orderings, unchanged. After removing the closure, the second
// context read is the existing pre-render-save ownership check, not prompt cleanup.
const deps=(h:any,parseFn:any=async()=>{assert(false,"completed origin must not invoke parser");})=>({supabase:h.fake,now:h.clock,getEnv:h.env,fetchImpl:h.provider.fetch,parseFn});
const input=(h:any,Body:string,MessageSid:string)=>({From:h.recipient,To:h.sender,Body,MessageSid,NumMedia:"0"});
for(const phase of ["pre-mint","rpc-response","post-mint-owner-read"]) Deno.test("recovery keeps advertised ref open: "+phase,async()=>{
 const {h}=inboundFixture(); h.fake._data.project_parties=h.fake._data.project_parties.filter((p:any)=>p.id==="party-a");
 h.fake._data.project_tasks=[{id:"task-a",owner_party_id:"party-a",project_id:"project-a",title:"Work",status:"todo",due_date:null}];
 h.fake._data.client_decisions=[];h.fake._data.delivery_events=[];
 const rpc=h.fake.rpc;let once=true,entered!:()=>void,release!:()=>void;
 const reached=new Promise<void>(r=>entered=r),released=new Promise<void>(r=>release=r);
 h.fake.rpc=async(name:string,args:any)=>{if(phase==="pre-mint"&&name==="sms_create_prompt"&&once){once=false;entered();await released;}const result=await rpc(name,args);if(phase==="rpc-response"&&name==="sms_create_prompt"&&once){once=false;entered();await released;}return result;};

 const from=h.fake.from.bind(h.fake);let checks=0;
 if(phase==="post-mint-owner-read") h.fake.from=(table:string)=>{const q=from(table),select=q.select.bind(q);q.select=(...args:any[])=>{select(...args);if(table==="sms_conversation_context"&&args[0]==="state_context"&&++checks===2){const single=q.maybeSingle.bind(q);q.maybeSingle=async()=>{entered();await released;return single();};}return q;};return q;};
 const d={now:h.clock,getEnv:h.env,fetchImpl:h.provider.fetch,flushFn:async()=>({flushed:0,skipped:0})};
 const old=runFieldDaily(h.fake as never,d);await reached;
 const recovery=await runFieldDaily(h.fake as never,{...d,now:new Date(h.clock.getTime()+180000)});
 assertEquals(recovery.digests_sent,1);assertEquals(h.fake._data.sms_prompts.length,1,"recovery reuses committed old-owner prompt");
 const advertised=h.fake._data.sms_prompts[0];assertEquals(h.provider.requests.length,1);const wire=new URLSearchParams(String(h.provider.requests[0].init?.body)).get("Body")!;assert(wire.includes("Ref "+advertised.short_code));
 release();await old;
 const closedAtBeforeReply=advertised.answered_at;const reply=await processInbound(input(h,"DONE "+advertised.short_code,"SMrecoveryReply"),deps(h));console.log(JSON.stringify({phase,wire,reply,prompts:h.fake._data.sms_prompts}));
 assertEquals(closedAtBeforeReply,null,"the one advertised recovery Ref must remain OPEN after old owner finishes");
});

// ── Site visits: the card the evening before, the ask the morning of ────────

const VISIT = "2026-11-01";
/** 6:00pm CDT the evening before — the hour the card is due. */
const EVENING = new Date("2026-10-31T23:00:00.000Z");
/** 8:00am CST on the visit day, after the fall-back. */
const MORNING = new Date("2026-11-01T14:00:00.000Z");

function visitWorld() {
  return createFakeSupabase({
    projects: [{
      id: "proj1",
      studio_id: "org1",
      designer_id: "designer1",
      name: "Ash House",
      site_address: "1421 Williamson St, Madison",
    }],
    studio_channel_consent: [{
      organization_id: "org1",
      channel_kind: "sms",
      channel_value: "+15550001111",
      status: "granted",
    }],
    project_parties: [{
      id: "pty1",
      phone_e164: "+15550001111",
      project_id: "proj1",
      party_kind: "sub",
      sms_consent_status: "granted",
      display_name: "Sal",
      on_site_from: VISIT,
      on_site_to: VISIT,
    }],
    project_tasks: [{
      id: "task1",
      title: "Install vanity",
      due_date: VISIT,
      project_id: "proj1",
      owner_party_id: "pty1",
      status: "todo",
    }],
    project_site_access_cards: [{
      project_id: "proj1",
      site_hours: "7-11am",
      site_notes: "Gate is on Ash St, park inside",
      emergency_lines: ["608-555-0134"],
    }],
    comms_threads: [{
      id: "thread1",
      project_id: "proj1",
      kind: "project",
      created_by: "designer1",
      created_at: "2026-09-01T00:00:00.000Z",
    }],
    comms_messages: [],
    client_decisions: [],
    delivery_events: [],
    sms_conversations: [],
  });
}

function visitRun(
  fake: ReturnType<typeof visitWorld>,
  now: Date,
  sent: SendPartySmsInput[],
  env: Record<string, string> = { FIELD_LINE_PHASE: "1" },
) {
  return runFieldDaily(fake as never, {
    getEnv: (k) =>
      ({ TWILIO_FROM_NUMBER: "+15559990000", ...env } as Record<string, string>)[k],
    now,
    sendFn: (_s, input) => { sent.push(input); return Promise.resolve({ sent: true }); },
    flushFn: () => Promise.resolve({ flushed: 0, skipped: 0 }),
  });
}

function promptsOfKind(fake: ReturnType<typeof visitWorld>, kind: string) {
  return (fake._data.sms_prompts ?? []).filter((p) => p.kind === kind);
}

Deno.test("P4: one site card the evening before, bound to that visit's own task", async () => {
  const fake = visitWorld();
  const sent: SendPartySmsInput[] = [];
  const summary = await visitRun(fake, EVENING, sent);

  assertEquals(summary.site_cards_sent, 1);
  assertEquals(summary.day_of_sent, 0, "the morning ask is not due at 6pm");
  assertEquals(summary.crew_posts, 0, "and nobody is on the way yet");

  const card = sent.find((s): s is OrdinarySmsInput => s.templateKey === "sms_site_card");
  assert(card, `a site card was sent: ${JSON.stringify(sent.map((s) => s.templateKey))}`);
  assertEquals(card!.automationPhase, 1, "a new automation declares its phase");
  assertEquals(card!.cadenceClass, "event", "and pays for a slot of the daily cadence");
  assertEquals(card!.dedupeKey, `field-site_card:pty1:${VISIT}`);
  assertEquals(card!.partyId, "pty1");
  assertEquals(card!.vars?.site_address, "1421 Williamson St, Madison");
  assertEquals(card!.vars?.visit_window, "7-11am");
  assertEquals(card!.vars?.access_note, "Gate is on Ash St, park inside");
  assertEquals(card!.vars?.contact, "608-555-0134");
  assertEquals(card!.vars?.visit_day, "Nov 1");

  const prompts = promptsOfKind(fake, "site_card");
  assertEquals(prompts.length, 1);
  assertEquals(prompts[0].subject_id, "task1", "the work they are coming to do");
  assertEquals(prompts[0].version, 20261101, "and the day it is for, frozen");
  // ONE OPEN TRADE PROMPT: the card's question closes exactly when the morning
  // ask takes it over — 7:30am CST, which is 13:30Z and not 12:30Z. A fixed
  // offset would expire it an hour into the visit.
  assertEquals(prompts[0].expires_at, "2026-11-01T13:30:00.000Z");
});

Deno.test("P4: the morning ask, the crew-on-the-way POST, and no homeowner text", async () => {
  const fake = visitWorld();
  const sent: SendPartySmsInput[] = [];
  const summary = await visitRun(fake, MORNING, sent);

  assertEquals(summary.day_of_sent, 1);
  assertEquals(summary.site_cards_sent, 0, "5pm has not come round again");
  assertEquals(summary.crew_posts, 1);

  const ask = sent.find((s): s is OrdinarySmsInput => s.templateKey === "sms_day_of");
  assert(ask, `the morning ask was sent: ${JSON.stringify(sent.map((s) => s.templateKey))}`);
  assertEquals(ask!.automationPhase, 1);
  assertEquals(ask!.cadenceClass, "event");
  assertEquals(ask!.dedupeKey, `field-day_of:pty1:${VISIT}`);
  assertEquals(ask!.vars?.visit_day, undefined, "the morning does not say 'tomorrow'");
  assertEquals(ask!.vars?.access_note, undefined);
  assertEquals(ask!.vars?.contact, "608-555-0134");

  const prompts = promptsOfKind(fake, "day_of");
  assertEquals(prompts.length, 1);
  assertEquals(prompts[0].subject_id, "task1");
  assertEquals(prompts[0].version, 20261101);
  assertEquals(prompts[0].expires_at, "2026-11-02T13:30:00.000Z", "open until the next morning");

  // The client's copy of this fact is a PORTAL POST on the project's own thread.
  // No text goes to a homeowner: this loop only ever texts field parties.
  const posts = fake._data.comms_messages ?? [];
  assertEquals(posts.length, 1);
  assertEquals(posts[0].thread_id, "thread1");
  assertEquals(posts[0].system, true);
  assertEquals(posts[0].sender_id, null, "a cron is not a person");
  assertEquals(posts[0].body, "Crew on the way for Nov 1.");
  assertEquals(
    sent.filter((s) => String(s.templateKey).includes("crew")).length,
    0,
    "and nothing about it is texted",
  );
});

Deno.test("P4: a second run reuses the same ref and posts nothing twice", async () => {
  // Two ticks an hour apart, or a retry after a failure: one visit still has one
  // question and one thread post.
  const fake = visitWorld();
  const sent: SendPartySmsInput[] = [];
  await visitRun(fake, MORNING, sent);
  const firstId = promptsOfKind(fake, "day_of")[0].id;
  const again = await visitRun(fake, new Date("2026-11-01T15:00:00.000Z"), sent);

  assertEquals(promptsOfKind(fake, "day_of").length, 1, "the same open ref, not a second");
  assertEquals(promptsOfKind(fake, "day_of")[0].id, firstId);
  assertEquals(again.crew_posts, 0, "the day was already claimed");
  assertEquals((fake._data.comms_messages ?? []).length, 1);
});

Deno.test("P4: phase 0 schedules no cards, mints no refs and posts nothing", async () => {
  // The whole loop is behind the server's phase gate (contract S7), asked BEFORE
  // a ref is allocated: a phase-0 server must not burn 00639's reservations on
  // cards it will never send.
  const fake = visitWorld();
  const sent: SendPartySmsInput[] = [];
  const summary = await visitRun(fake, EVENING, sent, {});

  assertEquals(summary.site_cards_sent, 0);
  assertEquals(summary.day_of_sent, 0);
  assertEquals(summary.crew_posts, 0);
  assertEquals(promptsOfKind(fake, "site_card").length, 0);
  assertEquals(promptsOfKind(fake, "day_of").length, 0);
  assertEquals((fake._data.comms_messages ?? []).length, 0);
  assertEquals(
    sent.filter((s) => ["sms_site_card", "sms_day_of"].includes(String(s.templateKey))).length,
    0,
  );
  assert(summary.digests_sent >= 0, "the phase-0 digest is untouched by any of this");
});

Deno.test("P4: no open task due that day means nothing to report against, so no card", async () => {
  // A reply has to report arrival, a delay or a problem AGAINST something, and
  // 00639 binds that subject at issuance. A visit with no work on it is not a
  // question the rail knows how to ask.
  const fake = visitWorld();
  (fake._data.project_tasks as Array<{ status: string }>)[0].status = "done";
  const sent: SendPartySmsInput[] = [];
  const summary = await visitRun(fake, EVENING, sent);
  assertEquals(summary.site_cards_sent, 0);
  assertEquals(promptsOfKind(fake, "site_card").length, 0);
});

import {
  localDayInTimezone,
  localMinutesInTimezone,
} from "../_shared/sms.ts";
import {
  DAY_OF_LOCAL_MINUTES,
  SITE_CARD_LOCAL_MINUTES,
} from "../field-daily/core.ts";

// ── The two scheduled ticks (00648) ─────────────────────────────────────────
// 00648 schedules this function twice a day — '0 14 * * *' and '5 23 * * *' —
// because the site card's floor is 17:00 LOCAL and the single 14:00 UTC job
// of 00432 is 08:00 or 09:00 local and never reaches it. These tests run
// core.ts on the exact instants those two expressions produce, in BOTH
// daylight-saving states of the zone the rail names its hours in, and on the
// hourly tick 00648 rejected.

/** The zone FIELD_TZ names by default; the tests read the clock through it. */
const SCHEDULE_TZ = "America/Chicago";
/** The instant '0 14 * * *' fires on, on a given UTC date. */
const morningTick = (day: string) => new Date(`${day}T14:00:00.000Z`);
/** The instant '5 23 * * *' fires on, on a given UTC date. */
const eveningTick = (day: string) => new Date(`${day}T23:05:00.000Z`);
/** Quiet hours, the compliance floor every send is held to (08:00–20:00). */
const QUIET_OPEN = 8 * 60;
const QUIET_CLOSE = 20 * 60;

/**
 * One visit day, in each of the two offsets America/Chicago takes. A fixed UTC
 * hour is a different local hour in each, which is the whole reason a fixed
 * hour had to be chosen rather than assumed.
 */
const DST_STATES = [
  { label: "CDT, UTC-5", visit: "2026-07-15", eveningBefore: "2026-07-14", askDueAtUtc: "2026-07-15T12:30:00.000Z" },
  { label: "CST, UTC-6", visit: "2026-12-02", eveningBefore: "2026-12-01", askDueAtUtc: "2026-12-02T13:30:00.000Z" },
];

/** visitWorld(), but for a visit day the caller names. */
function visitWorldOn(visit: string) {
  return createFakeSupabase({
    projects: [{
      id: "proj1",
      studio_id: "org1",
      designer_id: "designer1",
      name: "Ash House",
      site_address: "1421 Williamson St, Madison",
    }],
    studio_channel_consent: [{
      organization_id: "org1",
      channel_kind: "sms",
      channel_value: "+15550001111",
      status: "granted",
    }],
    project_parties: [{
      id: "pty1",
      phone_e164: "+15550001111",
      project_id: "proj1",
      party_kind: "sub",
      sms_consent_status: "granted",
      display_name: "Sal",
      on_site_from: visit,
      on_site_to: visit,
    }],
    project_tasks: [{
      id: "task1",
      title: "Install vanity",
      due_date: visit,
      project_id: "proj1",
      owner_party_id: "pty1",
      status: "todo",
    }],
    project_site_access_cards: [{
      project_id: "proj1",
      site_hours: "7-11am",
      site_notes: "Gate is on Ash St, park inside",
      emergency_lines: ["608-555-0134"],
    }],
    comms_threads: [{
      id: "thread1",
      project_id: "proj1",
      kind: "project",
      created_by: "designer1",
      created_at: "2026-09-01T00:00:00.000Z",
    }],
    comms_messages: [],
    client_decisions: [],
    delivery_events: [],
    sms_conversations: [],
  });
}

for (const state of DST_STATES) {
  Deno.test(`00648: the 23:05 UTC tick issues the site card once (${state.label})`, async () => {
    const at = eveningTick(state.eveningBefore);
    // The expression has to clear the card's floor without running past the
    // hour a crew may be texted at all — in THIS offset, not on average.
    const localMinutes = localMinutesInTimezone(at, SCHEDULE_TZ);
    assert(
      localMinutes >= SITE_CARD_LOCAL_MINUTES,
      `${at.toISOString()} is ${localMinutes} local minutes, short of the 17:00 floor`,
    );
    assert(localMinutes <= QUIET_CLOSE, "and still inside quiet hours, so it goes tonight");
    assertEquals(localDayInTimezone(at, SCHEDULE_TZ), state.eveningBefore, "the evening before");

    const fake = visitWorldOn(state.visit);
    const sent: SendPartySmsInput[] = [];
    const summary = await visitRun(fake, at, sent);

    assertEquals(summary.site_cards_sent, 1);
    assertEquals(summary.day_of_sent, 0, "nobody is on site tonight");
    const cards = sent.filter((s) => s.templateKey === "sms_site_card");
    assertEquals(cards.length, 1);
    assertEquals(cards[0].dedupeKey, `field-site_card:pty1:${state.visit}`);
    const prompts = promptsOfKind(fake, "site_card");
    assertEquals(prompts.length, 1);
    assertEquals(prompts[0].version, Number(state.visit.replaceAll("-", "")));
    // The card's question closes when the morning takes it over: 07:30 in the
    // visit day's OWN offset, which is a different UTC instant in each state.
    assertEquals(prompts[0].expires_at, state.askDueAtUtc);
  });

  Deno.test(`00648: the 14:00 UTC tick issues the day-of ask once (${state.label})`, async () => {
    const at = morningTick(state.visit);
    const localMinutes = localMinutesInTimezone(at, SCHEDULE_TZ);
    assert(localMinutes >= DAY_OF_LOCAL_MINUTES, "past the 07:30 floor");
    assert(
      localMinutes >= QUIET_OPEN && localMinutes <= QUIET_CLOSE,
      "and inside quiet hours, so the morning job needs no change",
    );
    assertEquals(localDayInTimezone(at, SCHEDULE_TZ), state.visit, "the morning of");

    const fake = visitWorldOn(state.visit);
    const sent: SendPartySmsInput[] = [];
    const summary = await visitRun(fake, at, sent);

    assertEquals(summary.day_of_sent, 1);
    assertEquals(summary.site_cards_sent, 0, "five o'clock is eight hours off");
    const asks = sent.filter((s) => s.templateKey === "sms_day_of");
    assertEquals(asks.length, 1);
    assertEquals(asks[0].dedupeKey, `field-day_of:pty1:${state.visit}`);
    assertEquals(promptsOfKind(fake, "day_of").length, 1);
    assertEquals(summary.crew_posts, 1, "and the project thread hears it once");
  });

  Deno.test(`00648: both scheduled ticks over one visit, each card once (${state.label})`, async () => {
    // The evening job and the morning job are the same function on the same
    // rows. Walking the pair end to end is what says the second tick does not
    // repeat the first: one card, one ask, one thread post, four prompts never.
    const fake = visitWorldOn(state.visit);
    const sent: SendPartySmsInput[] = [];
    await visitRun(fake, eveningTick(state.eveningBefore), sent);
    await visitRun(fake, morningTick(state.visit), sent);

    assertEquals(promptsOfKind(fake, "site_card").length, 1);
    assertEquals(promptsOfKind(fake, "day_of").length, 1);
    assertEquals((fake._data.comms_messages ?? []).length, 1);
    assertEquals(sent.filter((s) => s.templateKey === "sms_site_card").length, 1);
    assertEquals(sent.filter((s) => s.templateKey === "sms_day_of").length, 1);
  });
}

/**
 * The same party, with an open task to digest and its site visit far enough out
 * that no card is due on any tick below. What is under test here is the
 * phase-0 digest both of 00648's jobs re-enter.
 */
const digestWorld = () => visitWorldOn("2099-01-01");

Deno.test("00648: the morning and evening ticks of one day share one digest claim", async () => {
  // Both of 00648's jobs run the WHOLE function, so the evening tick re-enters
  // the phase-0 digest the morning already sent. It is the dedupe key that
  // stops a second menu, and the two ticks are on the same UTC date, so the
  // key they compute is the same one — the unique send claim on dedupe_key
  // (_shared/sms.ts:1746) refuses the second before it reaches a provider.
  const day = "2026-07-15";
  const fake = digestWorld();
  const sent: SendPartySmsInput[] = [];
  await visitRun(fake, morningTick(day), sent);
  await visitRun(fake, eveningTick(day), sent);

  assertEquals(sent.length, 2, "the function ran twice and composed twice");
  assertEquals(sent[0].templateKey, "sms_daily_digest");
  assertEquals(sent[1].templateKey, "sms_daily_digest");
  assertEquals(sent[0].dedupeKey, `field-daily:pty1:${day}`);
  assertEquals(sent[1].dedupeKey, sent[0].dedupeKey, "one logical send, so one claim");
  assertEquals(sent[1].vars?.menu, sent[0].vars?.menu, "and the frozen menu, not a new one");
  assertEquals(promptsOfKind(fake, "mark_done").length, 1, "no second short code either");
});

Deno.test("00648: an hourly tick issues a SECOND daily digest in the same local evening", async () => {
  // This is why 00648 is a second job at a fixed hour and not an hourly
  // 'field-daily'. The digest's only suppression is keyed on the UTC date
  // (core.ts:400, :554), and the UTC date turns over at 19:00 CDT / 18:00 CST
  // — still the same local evening, still inside quiet hours. The 00:05 UTC
  // tick of an hourly schedule therefore computes a FRESH key for a local day
  // that has already had its menu, and mints a fresh short code to go with it.
  const day = "2026-07-15";
  const fake = digestWorld();
  const sent: SendPartySmsInput[] = [];
  await visitRun(fake, eveningTick(day), sent);
  const hourlyOnly = new Date("2026-07-16T00:05:00.000Z");

  assertEquals(
    localDayInTimezone(hourlyOnly, SCHEDULE_TZ),
    localDayInTimezone(eveningTick(day), SCHEDULE_TZ),
    "the same local day as the tick before it",
  );
  const localMinutes = localMinutesInTimezone(hourlyOnly, SCHEDULE_TZ);
  assert(
    localMinutes >= QUIET_OPEN && localMinutes <= QUIET_CLOSE,
    "inside quiet hours, so this one would be delivered, not held",
  );

  await visitRun(fake, hourlyOnly, sent);
  assertEquals(sent.length, 2);
  assertEquals(sent[1].templateKey, "sms_daily_digest");
  assert(
    sent[1].dedupeKey !== sent[0].dedupeKey,
    `an hourly tick reuses the claim: ${sent[0].dedupeKey} vs ${sent[1].dedupeKey}`,
  );
  assertEquals(sent[1].dedupeKey, "field-daily:pty1:2026-07-16");
  assertEquals(
    promptsOfKind(fake, "mark_done").length,
    2,
    "and burns a second 90-day short code on the same task",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// The homeowner's picks: one ask a day, one nudge, then quiet (US-3 P24)
// ═══════════════════════════════════════════════════════════════════════════

/** 8:00am CST, the day the first list is presented. */
const CLIENT_DAY = new Date("2026-11-01T14:00:00.000Z");
const CLIENT_LOCAL_DAY = "2026-11-01";
const CLIENT_ENV = { FIELD_LINE_PHASE: "2", FIELD_LINE_CAMPAIGN_APPROVED: "1" };

function clientDayWorld(extra: Record<string, unknown[]> = {}) {
  return createFakeSupabase({
    projects: [{
      id: "proj1",
      studio_id: "org1",
      designer_id: "designer1",
      name: "Ash House",
    }],
    organizations: [{ id: "org1", name: "Field & Form", type: "design_studio" }],
    organization_members: [{ organization_id: "org1", user_id: "designer1", status: "active" }],
    studio_channel_consent: [{
      organization_id: "org1",
      channel_kind: "sms",
      channel_value: "+15550002222",
      status: "pending",
      refusal_unanswered: false,
      source: "kickoff_checkbox",
      evidence: "Kickoff consent box ticked in Patina.",
      recorded_at: "2026-10-01T00:00:00.000Z",
      recorded_by: "designer1",
      disclosure_version: "field-sms-v1",
    }],
    project_parties: [{
      id: "client1",
      phone_e164: "+15550002222",
      project_id: "proj1",
      party_kind: "client",
      display_name: "Adaeze",
    }],
    client_invitations: [{
      id: "inv1",
      project_id: "proj1",
      phone: "+15550002222",
      designer_client_id: "household1",
      revoked_at: null,
      superseded_by: null,
      sent_at: "2026-10-01T00:00:00.000Z",
    }],
    project_rooms: [{ id: "room1", project_id: "proj1", name: "Living room" }],
    client_decisions: [{
      id: "dec1",
      project_id: "proj1",
      designer_client_id: "household1",
      coordination_kind: "selection",
      court: "client",
      status: "pending",
      approval_contract: null,
      title: "Living room sofa",
      room_id: "room1",
      created_at: "2026-10-02T00:00:00.000Z",
    }],
    client_decision_options: [
      { id: "opt1", decision_id: "dec1", is_recommended: true, sort_order: 1 },
      { id: "opt2", decision_id: "dec1", is_recommended: false, sort_order: 2 },
    ],
    client_decision_batches: [],
    client_links: [],
    sms_prompts: [],
    project_tasks: [],
    delivery_events: [],
    sms_conversations: [],
    ...(extra as Record<string, Array<Record<string, unknown>>>),
  });
}

function clientRun(
  fake: ReturnType<typeof clientDayWorld>,
  now: Date,
  sent: Array<Record<string, unknown>>,
  opts: { env?: Record<string, string>; refuse?: boolean } = {},
) {
  return runFieldDaily(fake as never, {
    getEnv: (k) =>
      ({ TWILIO_FROM_NUMBER: "+15559990000", ...CLIENT_ENV, ...(opts.env ?? {}) } as Record<string, string>)[k],
    now,
    sendFn: () => Promise.resolve({ sent: true }),
    clientSendFn: (_s, input) => {
      sent.push(input as unknown as Record<string, unknown>);
      return Promise.resolve(opts.refuse ? { sent: false, status: "failed", reason: "campaign_not_approved" } : { sent: true });
    },
    flushFn: () => Promise.resolve({ flushed: 0, skipped: 0 }),
  });
}

function batches(fake: ReturnType<typeof clientDayWorld>) {
  return (fake._data.client_decision_batches ?? []) as Array<Record<string, unknown>>;
}

Deno.test("P24: one list of picks, presented once, with the reference she answers it with", async () => {
  const fake = clientDayWorld();
  const sent: Array<Record<string, unknown>> = [];
  const summary = await clientRun(fake, CLIENT_DAY, sent);

  assertEquals(summary.client_batches_sent, 1);
  assertEquals(summary.client_reminders_sent, 0);
  assertEquals(sent.length, 1);
  const ask = sent[0];
  assertEquals(ask.templateKey, "sms_selection_ready");
  assertEquals(ask.partyId, "client1");
  assertEquals(ask.clientInvitationId, "inv1", "the letter the capability is minted from");
  const vars = ask.vars as Record<string, unknown>;
  assertEquals(vars.picks, "1 pick");
  assertEquals(vars.room, "Living room", "the room she can picture, not a uuid");
  assertEquals(vars.studio_name, "Field & Form");
  assertEquals(vars.link, undefined, "the link is minted at dispatch, never here (S6)");

  const rows = batches(fake);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].party_id, "client1");
  assertEquals(rows[0].decision_ids, ["dec1"]);
  assertEquals(rows[0].version, 1);
  assertEquals(rows[0].presented_local_day, CLIENT_LOCAL_DAY, "the SENDER's local day, in FIELD_TZ");
  assertEquals(rows[0].closed_at ?? null, null);
  assertEquals(rows[0].reminder_sent_at ?? null, null);
  const snapshot = rows[0].presented_snapshot as Record<string, unknown>;
  assertEquals(snapshot.room_id, "room1");
  assertEquals((snapshot.decisions as Array<Record<string, unknown>>)[0].option_id, "opt1",
    "what she was shown is written down");

  const prompts = (fake._data.sms_prompts ?? []).filter((row) => row.kind === "selection_batch");
  assertEquals(prompts.length, 1, "one reference");
  assertEquals(prompts[0].subject_id, rows[0].id, "and it names the batch");
  assertEquals(prompts[0].version, 1, "at the version she was shown");
  assertEquals(vars.ref, prompts[0].short_code, "the text prints that reference");
});

Deno.test("P24: a second tick the same day says nothing at all", async () => {
  const fake = clientDayWorld();
  const first: Array<Record<string, unknown>> = [];
  await clientRun(fake, CLIENT_DAY, first);
  const second: Array<Record<string, unknown>> = [];
  const summary = await clientRun(fake, new Date(CLIENT_DAY.getTime() + 6 * 3600 * 1000), second);
  assertEquals(second.length, 0, "she is not asked twice in a day");
  assertEquals(summary.client_batches_sent, 0);
  assertEquals(summary.client_reminders_sent, 0, "and a nudge is not due for three days");
  assertEquals(batches(fake).length, 1, "and no second list was opened");
});

Deno.test("P24: an answered list still spends the day", async () => {
  // The one-open-per-day index cannot see a batch she has already answered, so
  // the day is spent by the presented_local_day read instead — or a homeowner who
  // answers at 9am is asked again at noon.
  const fake = clientDayWorld();
  const sent: Array<Record<string, unknown>> = [];
  await clientRun(fake, CLIENT_DAY, sent);
  batches(fake)[0].closed_at = "2026-11-01T15:00:00.000Z";
  fake._data.client_decisions.push({
    id: "dec2",
    project_id: "proj1",
    designer_client_id: "household1",
    coordination_kind: "selection",
    court: "client",
    status: "pending",
    approval_contract: null,
    title: "Rug",
    room_id: "room1",
    created_at: "2026-10-03T00:00:00.000Z",
  });
  fake._data.client_decision_options.push({ id: "opt3", decision_id: "dec2", is_recommended: true, sort_order: 1 });
  const later: Array<Record<string, unknown>> = [];
  const summary = await clientRun(fake, new Date(CLIENT_DAY.getTime() + 4 * 3600 * 1000), later);
  assertEquals(later.length, 0, "the day is spent");
  assertEquals(summary.client_batches_sent, 0);
  assertEquals(batches(fake).length, 1);
});

Deno.test("P24: the nudge comes once at three days, and then there is silence", async () => {
  const fake = clientDayWorld();
  const sent: Array<Record<string, unknown>> = [];
  await clientRun(fake, CLIENT_DAY, sent);
  const batch = batches(fake)[0];
  const ref = (fake._data.sms_prompts ?? []).find((row) => row.kind === "selection_batch")!;

  // Day two: nothing.
  const dayTwo: Array<Record<string, unknown>> = [];
  await clientRun(fake, new Date(CLIENT_DAY.getTime() + 24 * 3600 * 1000), dayTwo);
  assertEquals(dayTwo.length, 0, "a day later is not three days later");

  // Day four: one nudge, on the reference she already has.
  const nudgeAt = new Date(CLIENT_DAY.getTime() + 73 * 3600 * 1000);
  const nudge: Array<Record<string, unknown>> = [];
  const summary = await clientRun(fake, nudgeAt, nudge);
  assertEquals(summary.client_reminders_sent, 1);
  assertEquals(nudge.length, 1);
  assertEquals(nudge[0].templateKey, "sms_selection_ready");
  assertEquals(nudge[0].dedupeKey, `client-batch-reminder:${batch.id}`);
  assertEquals((nudge[0].vars as Record<string, unknown>).ref, ref.short_code,
    "the nudge points at the reference she was given, not a new one");
  assertEquals(
    (fake._data.sms_prompts ?? []).filter((row) => row.kind === "selection_batch").length,
    1,
    "and no second reference is minted for it",
  );
  assert(batch.reminder_sent_at, "the nudge is spent");
  assertEquals(batches(fake).length, 1, "no new list is opened either");

  // And then nothing, ever, for this batch — including the tick that lets the
  // spent list go (SQ-111 LOW-2: closing it is not an occasion for a text).
  for (const days of [5, 8]) {
    const after: Array<Record<string, unknown>> = [];
    const quiet = await clientRun(fake, new Date(CLIENT_DAY.getTime() + days * 24 * 3600 * 1000), after);
    assertEquals(after.length, 0, `day ${days}: the rail has stopped talking`);
    assertEquals(quiet.client_reminders_sent, 0);
    assertEquals(quiet.client_batches_sent, 0);
  }
});

Deno.test("P24: a list that moved earns no nudge", async () => {
  // Her reference is pinned to the version she was shown. Nudging her about a
  // list that has since changed would only earn her a stale_version refusal.
  const fake = clientDayWorld();
  const sent: Array<Record<string, unknown>> = [];
  await clientRun(fake, CLIENT_DAY, sent);
  batches(fake)[0].version = 2;
  const nudge: Array<Record<string, unknown>> = [];
  const summary = await clientRun(fake, new Date(CLIENT_DAY.getTime() + 73 * 3600 * 1000), nudge);
  assertEquals(nudge.length, 0, "nothing is sent");
  assertEquals(summary.client_reminders_sent, 0);
  assertEquals(batches(fake)[0].reminder_sent_at ?? null, null, "and the nudge is still unspent");
});

Deno.test("P24: below phase 2 the homeowner's rail writes nothing at all", async () => {
  for (const phase of ["", "0", "1"]) {
    const fake = clientDayWorld();
    const sent: Array<Record<string, unknown>> = [];
    const summary = await clientRun(fake, CLIENT_DAY, sent, { env: { FIELD_LINE_PHASE: phase } });
    assertEquals(sent.length, 0, `phase "${phase}" sends nothing`);
    assertEquals(summary.client_batches_sent, 0);
    assertEquals(batches(fake).length, 0, `phase "${phase}" opens no batch`);
    assertEquals(
      (fake._data.sms_prompts ?? []).length,
      0,
      `phase "${phase}" burns no short code on silence`,
    );
  }
});

Deno.test("P24: a refused send leaves no list and no reference behind", async () => {
  // A batch standing behind a text that never went would silence her for the
  // day and then nudge her about a list she was never sent.
  const fake = clientDayWorld();
  const sent: Array<Record<string, unknown>> = [];
  const summary = await clientRun(fake, CLIENT_DAY, sent, { refuse: true });
  assertEquals(sent.length, 1, "it was attempted");
  assertEquals(summary.client_batches_sent, 0);
  assertEquals(batches(fake).length, 0, "and the list was taken back");
  assertEquals(
    (fake._data.sms_prompts ?? []).filter((row) => row.kind === "selection_batch").length,
    0,
    "with its reference",
  );
});

Deno.test("P24: only picks apply_client_effect would apply are ever batched", async () => {
  // One batch, one household, one room, and every decision in it answerable —
  // because the refusal on the other side is whole-batch (contract P14).
  const fake = clientDayWorld();
  const rows = fake._data.client_decisions;
  const options = fake._data.client_decision_options;
  const add = (id: string, decision: Record<string, unknown>, recommended = 1) => {
    rows.push({
      id,
      project_id: "proj1",
      designer_client_id: "household1",
      coordination_kind: "selection",
      court: "client",
      status: "pending",
      approval_contract: null,
      title: id,
      room_id: "room1",
      created_at: `2026-10-1${rows.length}T00:00:00.000Z`,
      ...decision,
    });
    for (let i = 0; i < recommended; i++) {
      options.push({ id: `${id}-opt${i}`, decision_id: id, is_recommended: true, sort_order: i + 1 });
    }
  };
  add("other-household", { designer_client_id: "household2" });
  add("designer-court", { court: "designer" });
  add("not-a-selection", { coordination_kind: "question" });
  add("contract", { approval_contract: "gate-1" });
  add("already-answered", { status: "responded" });
  add("two-recommended", {}, 2);
  add("no-recommended", {}, 0);
  add("other-room", { room_id: "room2" });

  const sent: Array<Record<string, unknown>> = [];
  await clientRun(fake, CLIENT_DAY, sent);
  assertEquals(sent.length, 1);
  assertEquals(batches(fake)[0].decision_ids, ["dec1"], "one room, one household, one answerable pick");
});

Deno.test("P24: a homeowner with no live letter is not texted", async () => {
  for (const broken of [{ revoked_at: "2026-10-30T00:00:00.000Z" }, { superseded_by: "inv2" }]) {
    const fake = clientDayWorld();
    Object.assign(fake._data.client_invitations[0], broken);
    const sent: Array<Record<string, unknown>> = [];
    await clientRun(fake, CLIENT_DAY, sent);
    assertEquals(sent.length, 0, `${JSON.stringify(broken)}: nothing is sent`);
    assertEquals(batches(fake).length, 0, "and no list is opened against a dead letter");
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// The delivery window, put to her as a choice (US-3 P23/P24)
// ═══════════════════════════════════════════════════════════════════════════
// The windows themselves are not this cron's invention and not this cron's to
// write: field_delivery_reports.proposed_date/proposed_window is where a window
// is PROPOSED (00641), keyed by the same (subject_kind, subject_id) pair her
// answer is recorded against in delivery_availability (00651). Two distinct
// proposals on one delivery are the A and B her card prints; C is "neither".

/** The delivery she is asked about: one subject, with a name she can picture. */
const DELIVERY_SUBJECT = "task-delivery";

/** Her capability, in the shape create_client_link mints one (00650). */
const CLIENT_CAPABILITY = {
  id: "cl1",
  invitation_id: "inv1",
  project_id: "proj1",
  party_id: "client1",
  token_hash: "f".repeat(64),
  status: "active",
  expires_at: "2027-02-01T00:00:00.000Z",
  created_at: "2026-10-01T00:00:00.000Z",
  scope: {
    project_id: "proj1",
    party_id: "client1",
    invitation_id: "inv1",
    actions: ["open_letter", "approve_selection", "select_window"],
  },
};

/** A window the field proposed on the delivery, as apply_field_effect writes it. */
function report(overrides: Record<string, unknown> = {}) {
  return {
    project_id: "proj1",
    party_id: "recv1",
    subject_kind: "task",
    subject_id: DELIVERY_SUBJECT,
    proposed_date: "2026-11-03",
    proposed_window: "2-4",
    availability_at: "2026-11-01T12:00:00.000Z",
    ...overrides,
  };
}

const SECOND_WINDOW = { party_id: "gc1", proposed_date: "2026-11-05", proposed_window: "morning" };

function windowWorld(
  reports: Array<Record<string, unknown>>,
  extra: Record<string, unknown[]> = {},
) {
  return clientDayWorld({
    project_tasks: [{
      id: DELIVERY_SUBJECT,
      project_id: "proj1",
      title: "Living room sofa",
      status: "todo",
      owner_party_id: null,
      due_date: null,
    }],
    client_links: [CLIENT_CAPABILITY],
    field_delivery_reports: reports,
    delivery_availability: [],
    ...extra,
  });
}

function windowPrompts(fake: ReturnType<typeof clientDayWorld>) {
  return (fake._data.sms_prompts ?? []).filter((row) => row.kind === "window_pick");
}

Deno.test("P23: one delivery card, A and B in the studio's own words", async () => {
  const fake = windowWorld([report(), report(SECOND_WINDOW)]);
  const sent: Array<Record<string, unknown>> = [];
  const summary = await clientRun(fake, CLIENT_DAY, sent);

  assertEquals(summary.client_window_picks_sent, 1);
  // The delivery is asked first: her picks keep until tomorrow, the truck does not.
  assertEquals(sent.map((s) => s.templateKey), ["sms_window_pick", "sms_selection_ready"]);
  const card = sent[0];
  assertEquals(card.partyId, "client1");
  assertEquals(card.projectId, "proj1");
  assertEquals(
    card.clientInvitationId,
    undefined,
    "the card carries no {{link}}, so nothing is minted for it",
  );
  const vars = card.vars as Record<string, unknown>;
  assertEquals(vars.studio_name, "Field & Form", "studio name first (P24)");
  assertEquals(vars.item_title, "Living room sofa", "what is arriving, not a uuid");
  assertEquals(vars.option_a, "Nov 3 2-4", "the nearer window is A");
  assertEquals(vars.option_b, "Nov 5 morning");

  const prompts = windowPrompts(fake);
  assertEquals(prompts.length, 1, "one reference");
  assertEquals(prompts[0].subject_id, DELIVERY_SUBJECT, "and it names the delivery");
  assertEquals(prompts[0].version, 20261101, "frozen at the sender's local day");
  assertEquals(vars.ref, prompts[0].short_code, "the card prints that reference");
  assertEquals(card.dedupeKey, `client-window:${prompts[0].id}`);
  assertEquals(
    prompts[0].expires_at,
    "2026-11-06T06:00:00.000Z",
    "answerable until the end of the later window's local day, and no longer",
  );
  assertEquals(
    fake._data.delivery_availability,
    [],
    "asking records nothing: only her reply writes availability (P23)",
  );
});

Deno.test("P23: one open card per delivery, however often the cron runs", async () => {
  const fake = windowWorld([report(), report(SECOND_WINDOW)]);
  const first: Array<Record<string, unknown>> = [];
  await clientRun(fake, CLIENT_DAY, first);
  const minted = windowPrompts(fake)[0];

  for (const hours of [6, 30, 54]) {
    const later: Array<Record<string, unknown>> = [];
    const summary = await clientRun(fake, new Date(CLIENT_DAY.getTime() + hours * 3600 * 1000), later);
    assertEquals(summary.client_window_picks_sent, 0, `+${hours}h: she is asked once`);
    assertEquals(
      later.filter((s) => s.templateKey === "sms_window_pick").length,
      0,
      `+${hours}h: nothing more went out about this delivery`,
    );
    assertEquals(windowPrompts(fake).length, 1, `+${hours}h: no second short code is burned`);
    assertEquals(windowPrompts(fake)[0].id, minted.id, `+${hours}h: the same reference stands`);
  }
});

Deno.test("P23: a delivery with no two windows on the record is not asked about", async () => {
  const cases: Array<[string, Array<Record<string, unknown>>]> = [
    ["nothing proposed at all", []],
    ["one window is not a choice", [report()]],
    ["a visit with no proposal", [report({ proposed_date: null, proposed_window: null })]],
    ["the same words twice", [report(), report({ party_id: "gc1" })]],
    ["both days already behind her", [
      report({ proposed_date: "2026-10-20" }),
      report({ party_id: "gc1", proposed_date: "2026-10-22", proposed_window: "morning" }),
    ]],
    ["two windows, but on two different deliveries", [
      report(),
      report({ party_id: "gc1", subject_id: "task-other", proposed_date: "2026-11-05", proposed_window: "morning" }),
    ]],
    ["a subject this cron cannot name", [
      report({ subject_id: "gone" }),
      report({ party_id: "gc1", subject_id: "gone", proposed_date: "2026-11-05", proposed_window: "morning" }),
    ]],
  ];
  for (const [label, reports] of cases) {
    const fake = windowWorld(reports);
    const sent: Array<Record<string, unknown>> = [];
    const summary = await clientRun(fake, CLIENT_DAY, sent);
    assertEquals(summary.client_window_picks_sent, 0, label);
    assertEquals(
      sent.filter((s) => s.templateKey === "sms_window_pick").length,
      0,
      `${label}: nothing went out`,
    );
    assertEquals(windowPrompts(fake).length, 0, `${label}: and no short code was burned on silence`);
  }
});

Deno.test("P23: a delivery she has already answered is not asked again", async () => {
  // Her reference expires; the availability row does not. Without reading it a
  // passed expiry would ask her the same question a second time.
  const fake = windowWorld([report(), report(SECOND_WINDOW)], {
    delivery_availability: [{
      id: "avail1",
      project_id: "proj1",
      party_id: "client1",
      subject_kind: "delivery",
      subject_id: DELIVERY_SUBJECT,
      option: "A",
      window_label: "Nov 3 2-4",
      source_sid: "SMher",
    }],
  });
  const sent: Array<Record<string, unknown>> = [];
  const summary = await clientRun(fake, CLIENT_DAY, sent);
  assertEquals(summary.client_window_picks_sent, 0);
  assertEquals(sent.filter((s) => s.templateKey === "sms_window_pick").length, 0);
  assertEquals(windowPrompts(fake).length, 0);
});

Deno.test("P23: no live capability, no question (contract P14)", async () => {
  // This card mints nothing at dispatch, so a reply it invited would be refused
  // with no_capability — which is a card that does nothing.
  const cases: Array<[string, unknown[]]> = [
    ["no capability at all", []],
    ["revoked", [{ ...CLIENT_CAPABILITY, status: "revoked" }]],
    ["expired", [{ ...CLIENT_CAPABILITY, expires_at: "2026-10-15T00:00:00.000Z" }]],
    ["a scope that cannot answer this", [{
      ...CLIENT_CAPABILITY,
      scope: { ...CLIENT_CAPABILITY.scope, actions: ["open_letter"] },
    }]],
    ["a scope that speaks for another house", [{
      ...CLIENT_CAPABILITY,
      scope: { ...CLIENT_CAPABILITY.scope, project_id: "proj2" },
    }]],
  ];
  for (const [label, links] of cases) {
    const fake = windowWorld([report(), report(SECOND_WINDOW)], { client_links: links });
    const sent: Array<Record<string, unknown>> = [];
    const summary = await clientRun(fake, CLIENT_DAY, sent);
    assertEquals(summary.client_window_picks_sent, 0, label);
    assertEquals(windowPrompts(fake).length, 0, `${label}: and no reference is left standing`);
  }
});

Deno.test("P23: a refused card leaves no reference behind", async () => {
  const fake = windowWorld([report(), report(SECOND_WINDOW)]);
  const sent: Array<Record<string, unknown>> = [];
  const summary = await clientRun(fake, CLIENT_DAY, sent, { refuse: true });
  assertEquals(sent[0].templateKey, "sms_window_pick", "it was attempted");
  assertEquals(summary.client_window_picks_sent, 0);
  assertEquals(
    windowPrompts(fake).length,
    0,
    "and the reference was taken back, so no later tick thinks she was asked",
  );
});

Deno.test("P23: below phase 2 the delivery card writes nothing at all", async () => {
  for (const phase of ["", "0", "1"]) {
    const fake = windowWorld([report(), report(SECOND_WINDOW)]);
    const sent: Array<Record<string, unknown>> = [];
    const summary = await clientRun(fake, CLIENT_DAY, sent, { env: { FIELD_LINE_PHASE: phase } });
    assertEquals(sent.length, 0, `phase "${phase}" sends nothing`);
    assertEquals(summary.client_window_picks_sent, 0);
    assertEquals(windowPrompts(fake).length, 0, `phase "${phase}" burns no short code`);
    assertEquals(
      (fake._data.sms_conversations ?? []).length,
      0,
      `phase "${phase}" does not even open a thread`,
    );
  }
});

Deno.test("P23: her window card and the crew's delivery confirm stay two questions", async () => {
  // The reply half is SQ-18's and stays there: she answers A/B/C and
  // apply_client_effect writes availability; the receiver's "it is here" is the
  // trade rail's own sms_delivery_confirm. Issuing her card touches neither.
  const fake = windowWorld([report(), report(SECOND_WINDOW)], {
    project_parties: [
      { id: "client1", phone_e164: "+15550002222", project_id: "proj1", party_kind: "client", display_name: "Adaeze" },
      { id: "recv1", phone_e164: "+15550003333", project_id: "proj1", party_kind: "receiver", display_name: "Dock" },
    ],
    studio_channel_consent: [
      {
        organization_id: "org1", channel_kind: "sms", channel_value: "+15550002222",
        status: "pending", refusal_unanswered: false, source: "kickoff_checkbox",
        evidence: "Kickoff consent box ticked in Patina.", recorded_at: "2026-10-01T00:00:00.000Z",
        recorded_by: "designer1", disclosure_version: "field-sms-v1",
      },
      {
        organization_id: "org1", channel_kind: "sms", channel_value: "+15550003333",
        status: "granted", refusal_unanswered: false, source: "verbal",
        evidence: "Said yes at the walkthrough.", recorded_at: "2026-10-01T00:00:00.000Z",
        recorded_by: "designer1", disclosure_version: "field-sms-v1",
      },
    ],
    delivery_events: [{
      event_id: "po1", project_id: "proj1", vendor_name: "Ash Mill",
      event_date: "2026-11-02", event_type: "delivery_expected",
    }],
  });
  const trade: Array<Record<string, unknown>> = [];
  const client: Array<Record<string, unknown>> = [];
  const summary = await runFieldDaily(fake as never, {
    getEnv: (k) => ({ TWILIO_FROM_NUMBER: "+15559990000", ...CLIENT_ENV } as Record<string, string>)[k],
    now: CLIENT_DAY,
    sendFn: (_s, input) => {
      trade.push(input as unknown as Record<string, unknown>);
      return Promise.resolve({ sent: true });
    },
    clientSendFn: (_s, input) => {
      client.push(input as unknown as Record<string, unknown>);
      return Promise.resolve({ sent: true });
    },
    flushFn: () => Promise.resolve({ flushed: 0, skipped: 0 }),
  });

  assertEquals(summary.delivery_confirms_sent, 1);
  assertEquals(summary.client_window_picks_sent, 1);
  const confirm = trade.find((t) => t.templateKey === "sms_delivery_confirm")!;
  assertEquals(confirm.partyId, "recv1", "the receiver confirms the goods, as she never does");
  assertEquals(client.map((c) => c.templateKey), ["sms_window_pick", "sms_selection_ready"]);
  const prompts = (fake._data.sms_prompts ?? []);
  assertEquals(
    prompts.filter((p) => p.kind === "confirm_delivery").map((p) => p.party_id),
    ["recv1"],
  );
  assertEquals(windowPrompts(fake).map((p) => p.party_id), ["client1"]);
  assertEquals(fake._data.delivery_availability, [], "and nothing was recorded on her behalf");
});

// ── SQ-111 LOW-2: a spent list is let go, so the rail is not silenced ────────

Deno.test("P24: a spent, unanswerable list is closed once, and those picks come back", async () => {
  const fake = clientDayWorld();
  const sent: Array<Record<string, unknown>> = [];
  await clientRun(fake, CLIENT_DAY, sent);
  const batch = batches(fake)[0];
  const ask = (fake._data.sms_prompts ?? []).find((row) => row.kind === "selection_batch")!;

  // The nudge at three days, then her reference runs out unanswered.
  await clientRun(fake, new Date(CLIENT_DAY.getTime() + 73 * 3600 * 1000), []);
  assert(batch.reminder_sent_at, "the nudge is spent");
  assertEquals(batch.closed_at ?? null, null, "and while she can still answer, the list stands");

  const expired = new Date(Date.parse(String(ask.expires_at)) + 3600 * 1000);
  const closing = await clientRun(fake, expired, []);
  assertEquals(closing.client_batches_closed, 1);
  assertEquals(closing.client_batches_sent, 0, "closing it is not an occasion for a text");
  assertEquals(batch.closed_at, expired.toISOString());

  // Closed once, not once per tick — and the picks she never answered are free
  // again, on the next tick after the one that let the old list go.
  const fresh: Array<Record<string, unknown>> = [];
  const again = await clientRun(fake, new Date(expired.getTime() + 3600 * 1000), fresh);
  assertEquals(again.client_batches_closed, 0, "the spent list is closed once, not once a tick");
  assertEquals(again.client_batches_sent, 1, "and she is asked again, on a new list");
  assertEquals(fresh.length, 1);
  assertEquals(batches(fake).length, 2);
  assertEquals(batches(fake)[1].decision_ids, ["dec1"], "the picks she never answered");
  assertEquals(batches(fake)[1].version, 1, "at a fresh generation of its own");
});

Deno.test("P24: a list she answered is not closed twice, and one she can still answer is left alone", async () => {
  const fake = clientDayWorld();
  await clientRun(fake, CLIENT_DAY, []);
  const batch = batches(fake)[0];
  const ask = (fake._data.sms_prompts ?? []).find((row) => row.kind === "selection_batch")!;

  // She answered: apply_client_effect closed the batch and stamped the prompt.
  ask.answered_at = "2026-11-02T15:00:00.000Z";
  batch.closed_at = "2026-11-02T15:00:00.000Z";
  const answered = await clientRun(fake, new Date(CLIENT_DAY.getTime() + 8 * 24 * 3600 * 1000), []);
  assertEquals(answered.client_batches_closed, 0, "an answered list is already closed");
  assertEquals(batch.closed_at, "2026-11-02T15:00:00.000Z", "and its own timestamp stands");

  // A nudged list whose reference is still live is still hers to answer.
  const live = clientDayWorld();
  await clientRun(live, CLIENT_DAY, []);
  await clientRun(live, new Date(CLIENT_DAY.getTime() + 73 * 3600 * 1000), []);
  const still = await clientRun(live, new Date(CLIENT_DAY.getTime() + 96 * 3600 * 1000), []);
  assertEquals(still.client_batches_closed, 0);
  assertEquals(batches(live)[0].closed_at ?? null, null);
});

// ── SQ-111 LOW-4: an ineligible seat leaves no rows at all ──────────────────

Deno.test("P24: a client seat with no live letter leaves no thread behind", async () => {
  for (
    const broken of [
      { revoked_at: "2026-10-30T00:00:00.000Z" },
      { superseded_by: "inv2" },
      { phone: "+15550009999" },
    ]
  ) {
    const fake = windowWorld([report(), report(SECOND_WINDOW)]);
    Object.assign(fake._data.client_invitations[0], broken);
    const sent: Array<Record<string, unknown>> = [];
    const summary = await clientRun(fake, CLIENT_DAY, sent);
    assertEquals(sent.length, 0, `${JSON.stringify(broken)}: nothing is sent`);
    assertEquals(summary.client_window_picks_sent, 0);
    assertEquals(
      (fake._data.sms_conversations ?? []).length,
      0,
      `${JSON.stringify(broken)}: and no conversation row is created for her`,
    );
    assertEquals((fake._data.sms_conversation_context ?? []).length, 0);
    assertEquals((fake._data.sms_prompts ?? []).length, 0);
  }
});
