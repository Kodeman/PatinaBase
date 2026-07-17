/// <reference lib="deno.ns" />
// ^ see catalog-normalizer.test.ts / apns-send.test.ts for why this reference
// is needed against the monorepo root tsconfig.json.
//
// fulfillment-notify (S4, spec §6) — the review-critical leak test plus the
// draft/send orchestration, edit-diff stamping, and push-skip path. Pure
// helpers + fake-supabase (_tests/fake-supabase.ts) — no live stack, no
// network. Run:
//   deno test --no-check -A supabase/functions/_tests/fulfillment-notify.test.ts

import { assert, assertEquals, assertMatch, assertStrictEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  CLIENT_NOTIFICATION_TRANSITIONS,
  type ClientNotificationTransition,
  type ClientSafeOrderProjection,
  renderClientNoteTemplate,
} from "../_shared/fulfillment-templates.ts";
import { draftClientNote, sendClientNote, type NotifyDeps } from "../fulfillment-notify/core.ts";
import { createFakeSupabase } from "./fake-supabase.ts";

// ── The leak guard: every vendor name in the seed data (S0 I2/seed files —
// supabase/seed/vendors.sql, fulfillment-vendor-profiles.sql), the PO number
// pattern (00353 fulfillment_confirm_split), and a cost-figure pattern. ─────
const FORBIDDEN_VENDOR_NAMES = [
  "Room & Board",
  "Mitchell Gold + Bob Williams",
  "Lee Industries",
  "Holly Hunt",
  "Blu Dot",
  "Article",
];
const PO_NUMBER_PATTERN = /\bPO-\d/;
const COST_PATTERN = /\$\s?\d/;

interface ScanTarget {
  label: string;
  text: string;
}

/** Scans every target for every forbidden pattern; returns the (empty, when
 *  clean) list of matches for assertion + reporting. */
function scanForLeaks(targets: ScanTarget[]): string[] {
  const hits: string[] = [];
  for (const { label, text } of targets) {
    for (const name of FORBIDDEN_VENDOR_NAMES) {
      if (text.includes(name)) hits.push(`${label}: contains vendor name "${name}"`);
    }
    if (PO_NUMBER_PATTERN.test(text)) hits.push(`${label}: matches PO number pattern`);
    if (COST_PATTERN.test(text)) hits.push(`${label}: matches cost-figure pattern`);
  }
  return hits;
}

// Fixture item names lifted verbatim from the seeded 5-vendor order's product
// catalog (supabase/seed/fulfillment-catalog-dev.sql comments: order 1's five
// lines) — these are the REAL names that would flow into `items` at draft
// time, so this is not a synthetic fixture that happens to avoid the danger.
const ORDER_1_ITEMS = [
  { name: "Heirloom Oak Dining Table", qty: 1 },
  { name: "Walnut Credenza", qty: 1 },
  { name: "Live-Edge Coffee Table", qty: 1 },
  { name: "Velvet Club Chair", qty: 1 },
  { name: "Marble Side Table", qty: 1 },
];

const BASE_PROJECTION: ClientSafeOrderProjection = {
  orderNumber: 1,
  clientName: "Priya Anand",
  items: ORDER_1_ITEMS,
  eta: "2026-08-14",
};

Deno.test("leak test — every rendered template is free of vendor names, PO numbers, and cost figures", () => {
  const targets: ScanTarget[] = [];
  const scannedTransitions: ClientNotificationTransition[] = [];

  for (const transition of CLIENT_NOTIFICATION_TRANSITIONS) {
    const projection: ClientSafeOrderProjection = {
      ...BASE_PROJECTION,
      previousEta: transition === "eta_change" ? "2026-08-01" : undefined,
      shippingMode: transition === "shipped" ? "ltl" : undefined,
      exceptionNote:
        transition === "eta_change"
          ? "One of the items in your order needs a bit more time to finish — we'll keep you posted."
          : undefined,
    };
    const rendered = renderClientNoteTemplate(transition, projection);
    scannedTransitions.push(transition);
    targets.push(
      { label: `${transition}.subject`, text: rendered.subject },
      { label: `${transition}.html`, text: rendered.html },
      { label: `${transition}.text`, text: rendered.text },
      { label: `${transition}.pushTitle`, text: rendered.pushTitle },
      { label: `${transition}.pushBody`, text: rendered.pushBody },
    );
  }

  console.log(
    "[leak test] scanned",
    targets.length,
    "fields across",
    scannedTransitions.length,
    "transitions:",
    scannedTransitions.join(", "),
  );
  const hits = scanForLeaks(targets);
  assertEquals(hits, [], `Leak test found forbidden content: ${JSON.stringify(hits, null, 2)}`);
});

Deno.test("leak test — the draft/send orchestration's persisted bodies are also clean", async () => {
  const notifications: Array<Record<string, unknown>> = [];
  let nextId = 1;

  const fake = createFakeSupabase(
    {
      fulfillment_orders: [
        {
          id: "order-1",
          order_no: 1,
          client_name: "Priya Anand",
          client_email: "priya@example.com",
          client_profile_id: "profile-1",
        },
      ],
    },
    {
      fulfillment_record_client_note: (args) => {
        if (args.p_note_id == null) {
          const id = `note-${nextId++}`;
          notifications.push({
            id,
            order_id: args.p_order_id,
            transition: args.p_transition,
            channel: args.p_channel,
            template_key: args.p_template_key,
            drafted_body: args.p_drafted_body,
            sent_body: null,
          });
          return { data: id, error: null };
        }
        const row = notifications.find((n) => n.id === args.p_note_id);
        if (row) {
          row.sent_body = args.p_sent_body;
          row.edit_diff = args.p_edit_diff;
          row.skipped_reason = args.p_skipped_reason;
        }
        return { data: args.p_note_id, error: null };
      },
    },
  );
  // The rpc handler above tracks rows in its own `notifications` array (so it
  // can update-by-id like the real dual-phase RPC does); alias the fake
  // store's table to that SAME array (not a clone) so
  // .from('fulfillment_client_notifications').eq('id', ...) finds what the
  // rpc handler wrote.
  fake._data.fulfillment_client_notifications = notifications;

  const deps: NotifyDeps = {
    supabase: fake as unknown as NotifyDeps["supabase"],
    sendEmail: async () => ({ success: true, id: "resend-1" }),
    sendPush: async () => ({ sent: 1 }),
  };

  for (const transition of CLIENT_NOTIFICATION_TRANSITIONS) {
    const draft = await draftClientNote(deps, {
      order_id: "order-1",
      transition,
      context: {
        items: ORDER_1_ITEMS,
        eta: "2026-08-14",
        previousEta: transition === "eta_change" ? "2026-08-01" : undefined,
        shippingMode: transition === "shipped" ? "white_glove" : undefined,
        exceptionNote: transition === "eta_change" ? "A component needs additional finishing time." : undefined,
      },
    });
    await sendClientNote(deps, { notification_id: draft.note_id });
  }

  const targets: ScanTarget[] = notifications.flatMap((n, i) => [
    { label: `notification[${i}].drafted_body`, text: String(n.drafted_body ?? "") },
    { label: `notification[${i}].sent_body`, text: String(n.sent_body ?? "") },
  ]);
  console.log("[leak test] scanned", targets.length, "persisted body fields across", notifications.length, "notification rows (email + push per transition)");
  const hits = scanForLeaks(targets);
  assertEquals(hits, [], `Leak test found forbidden content in persisted bodies: ${JSON.stringify(hits, null, 2)}`);
  // Sanity: both channels actually got persisted (5 transitions x 2 channels).
  assertEquals(notifications.length, CLIENT_NOTIFICATION_TRANSITIONS.length * 2);
});

Deno.test("freight inspection-guidance paragraph: present for ltl/white_glove, absent for parcel", () => {
  const snippet = "inspect every item closely";
  const ltl = renderClientNoteTemplate("shipped", { ...BASE_PROJECTION, shippingMode: "ltl" });
  const wg = renderClientNoteTemplate("shipped", { ...BASE_PROJECTION, shippingMode: "white_glove" });
  const parcel = renderClientNoteTemplate("shipped", { ...BASE_PROJECTION, shippingMode: "parcel" });
  const none = renderClientNoteTemplate("shipped", { ...BASE_PROJECTION, shippingMode: undefined });

  assert(ltl.html.includes(snippet), "ltl shipment should carry the inspection paragraph");
  assert(wg.html.includes(snippet), "white_glove shipment should carry the inspection paragraph");
  assert(!parcel.html.includes(snippet), "parcel shipment must NOT carry the inspection paragraph");
  assert(!none.html.includes(snippet), "no shipping mode must NOT carry the inspection paragraph");
});

Deno.test("template render samples — one per transition (subject + templateKey)", () => {
  // Not an assertion beyond structural shape — this test exists so `deno test`
  // output (captured for the ship report) prints one line per transition.
  for (const transition of CLIENT_NOTIFICATION_TRANSITIONS) {
    const rendered = renderClientNoteTemplate(transition, {
      ...BASE_PROJECTION,
      shippingMode: transition === "shipped" ? "ltl" : undefined,
      previousEta: transition === "eta_change" ? "2026-08-01" : undefined,
    });
    assertEquals(rendered.templateKey, `client_note.${transition}.v1`);
    assert(rendered.subject.length > 0);
    assert(rendered.html.includes("Priya"));
    console.log(`[sample] ${transition} :: ${rendered.templateKey} :: "${rendered.subject}" :: push="${rendered.pushTitle} — ${rendered.pushBody}"`);
  }
});

Deno.test("edit-diff stamping: unedited send carries no edit_diff, edited send carries {original, sent}", async () => {
  const notifications: Array<Record<string, unknown>> = [];
  let nextId = 1;
  const fake = createFakeSupabase(
    {
      fulfillment_orders: [
        { id: "order-2", order_no: 2, client_name: "Sam Okafor", client_email: "sam@example.com", client_profile_id: "profile-2" },
      ],
    },
    {
      fulfillment_record_client_note: (args) => {
        if (args.p_note_id == null) {
          const id = `note-${nextId++}`;
          notifications.push({ id, channel: args.p_channel, drafted_body: args.p_drafted_body, transition: args.p_transition, order_id: args.p_order_id, template_key: args.p_template_key });
          return { data: id, error: null };
        }
        const row = notifications.find((n) => n.id === args.p_note_id);
        if (row) Object.assign(row, { sent_body: args.p_sent_body, edit_diff: args.p_edit_diff, skipped_reason: args.p_skipped_reason });
        return { data: args.p_note_id, error: null };
      },
    },
  );
  fake._data.fulfillment_client_notifications = notifications;
  const deps: NotifyDeps = {
    supabase: fake as unknown as NotifyDeps["supabase"],
    sendEmail: async () => ({ success: true, id: "resend-x" }),
    sendPush: async () => ({ sent: 1 }),
  };

  const draft1 = await draftClientNote(deps, {
    order_id: "order-2",
    transition: "confirmed",
    context: { items: ORDER_1_ITEMS, eta: "2026-08-14" },
  });
  const unedited = await sendClientNote(deps, { notification_id: draft1.note_id });
  assertStrictEquals(unedited.edited, false);
  const emailRow1 = notifications.find((n) => n.id === draft1.note_id)!;
  assertStrictEquals(emailRow1.edit_diff, null);

  const draft2 = await draftClientNote(deps, {
    order_id: "order-2",
    transition: "confirmed",
    context: { items: ORDER_1_ITEMS, eta: "2026-08-14" },
  });
  const editedBody = "A hand-edited note to Sam.";
  const edited = await sendClientNote(deps, { notification_id: draft2.note_id, edited_body: editedBody });
  assertStrictEquals(edited.edited, true);
  const emailRow2 = notifications.find((n) => n.id === draft2.note_id)!;
  assertEquals(emailRow2.edit_diff, { original: draft2.drafted_body, sent: editedBody });
  assertEquals(emailRow2.sent_body, editedBody);
});

Deno.test("push-skip path: apns_not_configured writes a push row with that skipped_reason (never throws)", async () => {
  const notifications: Array<Record<string, unknown>> = [];
  let nextId = 1;
  const fake = createFakeSupabase(
    {
      fulfillment_orders: [
        { id: "order-3", order_no: 3, client_name: "Dana Lin", client_email: "dana@example.com", client_profile_id: "profile-3" },
      ],
    },
    {
      fulfillment_record_client_note: (args) => {
        if (args.p_note_id == null) {
          const id = `note-${nextId++}`;
          notifications.push({
            id,
            order_id: args.p_order_id,
            transition: args.p_transition,
            channel: args.p_channel,
            template_key: args.p_template_key,
            drafted_body: args.p_drafted_body,
          });
          return { data: id, error: null };
        }
        const row = notifications.find((n) => n.id === args.p_note_id);
        if (row) Object.assign(row, { sent_body: args.p_sent_body, skipped_reason: args.p_skipped_reason });
        return { data: args.p_note_id, error: null };
      },
    },
  );
  fake._data.fulfillment_client_notifications = notifications;
  const deps: NotifyDeps = {
    supabase: fake as unknown as NotifyDeps["supabase"],
    sendEmail: async () => ({ success: true, id: "resend-y" }),
    // Mirrors apns-send/index.ts's real behavior when APNS_* secrets are unset.
    sendPush: async () => ({ skipped: "apns_not_configured" }),
  };

  const draft = await draftClientNote(deps, {
    order_id: "order-3",
    transition: "shipped",
    context: { items: ORDER_1_ITEMS, eta: "2026-08-14", shippingMode: "parcel" },
  });
  const result = await sendClientNote(deps, { notification_id: draft.note_id });

  assertStrictEquals(result.push.skipped_reason, "apns_not_configured");
  assertStrictEquals(result.email.success, true);
  const pushRow = notifications.find((n) => n.channel === "push")!;
  assertEquals(pushRow.skipped_reason, "apns_not_configured");
});

Deno.test("no client_profile_id: push leg skips with no_client_profile, email still sends", async () => {
  const notifications: Array<Record<string, unknown>> = [];
  let nextId = 1;
  const fake = createFakeSupabase(
    {
      fulfillment_orders: [
        { id: "order-4", order_no: 4, client_name: "Jo Park", client_email: "jo@example.com", client_profile_id: null },
      ],
    },
    {
      fulfillment_record_client_note: (args) => {
        if (args.p_note_id == null) {
          const id = `note-${nextId++}`;
          notifications.push({
            id,
            order_id: args.p_order_id,
            transition: args.p_transition,
            channel: args.p_channel,
            template_key: args.p_template_key,
            drafted_body: args.p_drafted_body,
          });
          return { data: id, error: null };
        }
        const row = notifications.find((n) => n.id === args.p_note_id);
        if (row) Object.assign(row, { skipped_reason: args.p_skipped_reason });
        return { data: args.p_note_id, error: null };
      },
    },
  );
  fake._data.fulfillment_client_notifications = notifications;
  let pushCalled = false;
  const deps: NotifyDeps = {
    supabase: fake as unknown as NotifyDeps["supabase"],
    sendEmail: async () => ({ success: true, id: "resend-z" }),
    sendPush: async () => {
      pushCalled = true;
      return { sent: 1 };
    },
  };

  const draft = await draftClientNote(deps, {
    order_id: "order-4",
    transition: "delivered",
    context: { items: ORDER_1_ITEMS },
  });
  const result = await sendClientNote(deps, { notification_id: draft.note_id });

  assertStrictEquals(pushCalled, false, "sendPush must not be called with no client_profile_id");
  assertStrictEquals(result.push.skipped_reason, "no_client_profile");
});

Deno.test("send() rejects a non-email notification_id (push is dispatched automatically, never sent directly)", async () => {
  const fake = createFakeSupabase(
    { fulfillment_orders: [{ id: "order-5", order_no: 5, client_name: "X", client_email: "x@example.com", client_profile_id: null }] },
    {
      fulfillment_record_client_note: () => ({ data: "irrelevant", error: null }),
    },
  );
  // Pre-seed a push-channel row directly in the fake store.
  (fake as unknown as { _data: Record<string, unknown[]> })._data.fulfillment_client_notifications = [
    { id: "push-note-1", order_id: "order-5", transition: "confirmed", channel: "push", template_key: "client_note.confirmed.v1", drafted_body: "push body" },
  ];
  const deps: NotifyDeps = {
    supabase: fake as unknown as NotifyDeps["supabase"],
    sendEmail: async () => ({ success: true }),
    sendPush: async () => ({ sent: 1 }),
  };

  let threw = false;
  try {
    await sendClientNote(deps, { notification_id: "push-note-1" });
  } catch (err) {
    threw = true;
    assertMatch(String(err), /EMAIL draft/);
  }
  assert(threw, "sendClientNote must reject a push-channel notification_id");
});
