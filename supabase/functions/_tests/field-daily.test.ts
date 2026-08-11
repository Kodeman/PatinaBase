// Deno test for the field-daily digest cron core.
// Run: deno test --no-check -A supabase/functions/_tests/field-daily.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildDigestMenu,
  runFieldDaily,
  shouldSendDeliveryConfirm,
  type DigestItem,
} from "../field-daily/core.ts";
import type { SendPartySmsInput } from "../_shared/sms.ts";
import { createFakeSupabase } from "./fake-supabase.ts";

const TODAY = "2026-07-08";

Deno.test("buildDigestMenu numbers items with due labels", () => {
  const items: DigestItem[] = [
    { id: "t1", kind: "task", title: "Install vanity", project_id: "p1", due: TODAY },
    { id: "c1", kind: "coordination", title: "Confirm grout", project_id: "p1", due: null },
    { id: "t2", kind: "task", title: "Set tile", project_id: "p1", due: "2026-07-01" },
  ];
  const { menuText, entries } = buildDigestMenu(items, TODAY);
  assertEquals(entries.length, 3);
  assertEquals(entries[0], { n: 1, kind: "task", id: "t1", project_id: "p1" });
  assert(menuText.includes("1) Install vanity (due today)"));
  assert(menuText.includes("2) Confirm grout"));
  assert(menuText.includes("3) Set tile (overdue)"));
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
  const conv = (fake._data.sms_conversations ?? [])[0] as { state_context: { menu: unknown[] } };
  assert(conv, "a conversation should exist");
  assertEquals((conv.state_context.menu as unknown[]).length, 1);
});

Deno.test("runFieldDaily skips a party with nothing to say", async () => {
  const fake = createFakeSupabase({
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
      project_parties: [
        { id: "recv1", phone_e164: "+15550002222", project_id: "proj1", party_kind: "receiver", sms_consent_status: "granted", display_name: "Rex" },
      ],
      project_tasks: [],
      client_decisions: [],
      delivery_events: [
        { event_id: "ev2", project_id: "proj1", vendor_name: "RH", event_date: TODAY, event_type: "delivery_expected" },
      ],
      sms_conversations: [
        { id: "conv1", twilio_number: "+15559990000", phone_e164: "+15550002222", active_project_id: "proj1", party_id: "recv1", state: "idle", state_context: { delivery_confirms_sent: alreadySent } },
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
  const conv = (fresh._data.sms_conversations ?? [])[0] as { state_context: { delivery_confirms_sent: string[] } };
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
