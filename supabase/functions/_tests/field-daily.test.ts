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

  const card = sent.find((s) => s.templateKey === "sms_site_card");
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

  const ask = sent.find((s) => s.templateKey === "sms_day_of");
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
