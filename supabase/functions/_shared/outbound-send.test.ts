import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { finalizeOutboundDraft, sendOutboundDraft } from "./outbound-send.ts";
import { renderEmail } from "./outbound-kinds/review_request.ts";
import type { OutboundDraft } from "./outbound-send.ts";
import { createFakeSupabase } from "../_tests/fake-supabase.ts";

function fakeAdmin(results: Array<{ data?: unknown; error?: { message: string } | null }>) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      rpc: async (name: string) => {
        calls.push(name);
        return results.shift() ?? { data: null, error: null };
      },
    } as never,
  };
}

Deno.test("review request renderEmail preserves edits and structured delivery fields", async () => {
  const draft = {
    id: "draft-3", organization_id: "studio-1", project_id: "project-1", kind: "review_request",
    channel: "email", recipient_kind: "client", to_contact_id: null, to_client_id: "client-1",
    to_party_id: null, to_address: "client@example.com", subject: "Edited subject", body: "Edited message body",
    payload: {
      doorstep_url: "https://client.example.com/project/project-1/doorstep",
      project_name: "Lake House", designer_given_name: "Ari", studio_name: "North Studio",
      cobrand_studio_name: "North Studio", studio_logo_url: "https://example.com/logo.png",
      signature_city: "Portland", designer_email: "ari@example.com", client_user_id: "client-profile-1",
    }, ref_type: "project", ref_id: "project-1", status: "sending", sent_by: null,
  } as OutboundDraft;
  const rendered = await renderEmail({ admin: {} as never, draft });
  assertEquals(rendered.html.includes("Edited message body"), true);
  assertEquals(rendered.html.includes("Share Your Experience"), true);
  assertEquals(rendered.html.includes("Portland"), true);
  assertEquals(rendered.replyTo, "ari@example.com");
  assertEquals(rendered.userId, "client-profile-1");
  assertEquals(rendered.from, Deno.env.get("RESEND_FROM") ?? "hello@patina.cloud");
});

Deno.test("sendOutboundDraft maps terminal claim statuses to not_sendable", async () => {
  for (const status of ["expired", "superseded", "discarded"]) {
    const admin = fakeAdmin([{ data: null, error: { message: `claim_outbound_draft_for_send: draft is ${status}` } }]);
    assertEquals(await sendOutboundDraft(admin.client, "draft-1", { kind: "designer", userId: "user-1" }), {
      id: "draft-1", ok: false, error: "not_sendable",
    });
    assertEquals(admin.calls, ["claim_outbound_draft_for_send"]);
  }
});

Deno.test("sendOutboundDraft releases a claim when the claimed row is invalid", async () => {
  const admin = fakeAdmin([
    { data: { id: "draft-2", status: "sending", channel: "email", to_address: null, subject: "Hello" }, error: null },
    { data: null, error: null },
  ]);
  const result = await sendOutboundDraft(admin.client, "draft-2", { kind: "designer", userId: "user-1" });
  assertEquals(result.ok, false);
  assertEquals(admin.calls, ["claim_outbound_draft_for_send", "release_outbound_draft_claim"]);
});

// ── Delivery finalization (00782, SQ-905 F11) ────────────────────────────────
// The rpc handlers model the 00775/00780/00782 draft lifecycle; the SQL guards
// themselves are proven in supabase/tests/outbound/outbound_delivery_finalization_test.sql.
type Row = Record<string, unknown>;
const DESIGNER = { kind: "designer", userId: "designer-1" } as const;
const SITE_REQUEST_ID = "site-request-1";

function draftRow(id: string, overrides: Row = {}): Row {
  return {
    id, organization_id: "org-alpha", project_id: "proj1", kind: "site_request_due", channel: "push",
    recipient_kind: "trade", to_contact_id: null, to_client_id: null, to_party_id: null, to_address: null,
    subject: "Site request due", body: "The tile sample is due tomorrow.", payload: { user_id: "trade-user-1" },
    ref_type: "site_request", ref_id: SITE_REQUEST_ID, status: "awaiting_review", sent_by: null,
    claimed_at: null, message_id: null, delivered_at: null, delivery_message_id: null, ...overrides,
  };
}

function draftDb(drafts: Row[], tables: Record<string, Row[]> = {}, opts: { markFailures?: number } = {}) {
  const calls: string[] = [];
  let markFailures = opts.markFailures ?? 0;
  const row = (id: unknown) => (fake._data.outbound_drafts ?? []).find((r) => r.id === id);
  const fake = createFakeSupabase({
    outbound_drafts: drafts,
    site_requests: [{ id: SITE_REQUEST_ID, due_reminder_sent_at: null }],
    ...tables,
  }, {
    claim_outbound_draft_for_send: ({ p_id }) => {
      calls.push("claim_outbound_draft_for_send");
      const draft = row(p_id);
      if (!draft) return { data: null, error: { message: "claim_outbound_draft_for_send: draft not found or access denied" } };
      if (draft.delivered_at) {
        return { data: null, error: { message: "claim_outbound_draft_for_send: draft was already delivered; finalize it" } };
      }
      if (draft.status !== "awaiting_review") {
        return { data: null, error: { message: `claim_outbound_draft_for_send: draft is ${draft.status} or has a fresh claim` } };
      }
      Object.assign(draft, { status: "sending", claimed_at: new Date().toISOString() });
      return { data: structuredClone(draft), error: null };
    },
    record_outbound_draft_delivery: ({ p_id, p_message_id }) => {
      calls.push("record_outbound_draft_delivery");
      const draft = row(p_id)!;
      if (!draft.delivered_at) {
        if (draft.status !== "sending") {
          return { data: null, error: { message: `record_outbound_draft_delivery: draft is ${draft.status}, not sending` } };
        }
        Object.assign(draft, { delivered_at: new Date().toISOString(), delivery_message_id: p_message_id ?? null });
      }
      return { data: structuredClone(draft), error: null };
    },
    release_outbound_draft_claim: ({ p_id }) => {
      calls.push("release_outbound_draft_claim");
      const draft = row(p_id)!;
      if (draft.delivered_at) {
        return { data: null, error: { message: "release_outbound_draft_claim: draft was already delivered; finalize it" } };
      }
      Object.assign(draft, { status: "awaiting_review", claimed_at: null, sent_by: null });
      return { data: structuredClone(draft), error: null };
    },
    mark_outbound_draft_sent: ({ p_id, p_sent_by, p_message_id }) => {
      calls.push("mark_outbound_draft_sent");
      if (markFailures > 0) {
        markFailures--;
        return { data: null, error: { message: "mark_outbound_draft_sent: connection reset" } };
      }
      const draft = row(p_id)!;
      if (draft.status !== "sending") {
        return { data: null, error: { message: `mark_outbound_draft_sent: draft is ${draft.status}, not sending` } };
      }
      Object.assign(draft, { status: "sent", sent_by: p_sent_by, message_id: p_message_id, claimed_at: null });
      return { data: structuredClone(draft), error: null };
    },
  });
  return { fake, client: fake as never, calls, row };
}

/** Stubs fetch (the push provider is apns-send) and counts every request. */
async function withProvider<T>(fn: (requests: string[]) => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    requests.push(input instanceof Request ? input.url : String(input));
    return Promise.resolve(new Response(JSON.stringify({ sent: 1, failed: 0, message_id: "apns-1" }), { status: 200 }));
  }) as typeof fetch;
  try {
    return await fn(requests);
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test("a mark that fails once never resends: the retry finalizes with one provider call and ends sent", async () => {
  await withProvider(async (requests) => {
    const db = draftDb([draftRow("draft-mark")], {}, { markFailures: 1 });
    const first = await sendOutboundDraft(db.client, "draft-mark", DESIGNER);
    assertEquals(first.ok, false);
    assertEquals(db.row("draft-mark")?.status, "sending", "a delivered draft is not released to review");
    assert(db.row("draft-mark")?.delivered_at, "the delivery is recorded before any hook runs");
    assertEquals(db.calls.includes("release_outbound_draft_claim"), false);

    const retry = await sendOutboundDraft(db.client, "draft-mark", DESIGNER);
    assertEquals(retry, { id: "draft-mark", ok: true, messageId: "apns-1" });
    assertEquals(requests.length, 1, "exactly one provider call across the send and its retry");
    assertEquals(db.row("draft-mark")?.status, "sent");
    assertEquals(db.row("draft-mark")?.message_id, "apns-1");
    assertEquals(db.calls, [
      "claim_outbound_draft_for_send", "record_outbound_draft_delivery", "mark_outbound_draft_sent",
      "claim_outbound_draft_for_send", "mark_outbound_draft_sent",
    ]);
  });
});

Deno.test("an afterSend that fails never resends, and finalize completes the delivered draft", async () => {
  await withProvider(async (requests) => {
    const db = draftDb([draftRow("draft-hook")]);
    db.fake._failUpdateIds!.add(SITE_REQUEST_ID);
    const first = await sendOutboundDraft(db.client, "draft-hook", DESIGNER);
    assertEquals(first.ok, false);
    assertEquals(db.row("draft-hook")?.status, "sending", "a delivered draft is not released to review");
    assertEquals(db.row("draft-hook")?.delivery_message_id, "apns-1");
    assertEquals(db.calls, ["claim_outbound_draft_for_send", "record_outbound_draft_delivery"]);

    db.fake._failUpdateIds!.delete(SITE_REQUEST_ID);
    const finalized = await finalizeOutboundDraft(db.client, "draft-hook", DESIGNER);
    assertEquals(finalized, { id: "draft-hook", ok: true, messageId: "apns-1" });
    assertEquals(requests.length, 1, "finalize never calls the provider");
    assertEquals(db.row("draft-hook")?.status, "sent");
    assert(db.fake._data.site_requests[0].due_reminder_sent_at, "the kind's afterSend ran on finalize");
  });
});

Deno.test("finalize mode refuses a draft the provider never accepted", async () => {
  await withProvider(async (requests) => {
    const db = draftDb([draftRow("draft-open")]);
    assertEquals(await finalizeOutboundDraft(db.client, "draft-open", DESIGNER), {
      id: "draft-open", ok: false, error: "not_delivered",
    });
    assertEquals(requests.length, 0);
    assertEquals(db.row("draft-open")?.status, "awaiting_review");
    assertEquals(db.calls, []);
  });
});

Deno.test("an SMS duplicate_send_claim is recorded as delivered and finalizes without a second text", async () => {
  const env = { SMS_DEV_MODE: "dry_run", TWILIO_FROM_NUMBER: "+15550000000" };
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, Deno.env.get(key)]));
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  try {
    await withProvider(async (requests) => {
      const db = draftDb([draftRow("draft-sms", { channel: "sms", to_party_id: "p1", payload: {} })], {
        projects: [{ id: "proj1", studio_id: "org-alpha" }],
        studio_channel_consent: [{
          organization_id: "org-alpha", channel_kind: "sms", channel_value: "+15551230001", status: "granted",
        }],
        project_parties: [{
          id: "p1", phone_e164: "+15551230001", project_id: "proj1", display_name: "Sal Sub",
          sms_consent_status: "granted", sms_consent_source: "verbal",
          sms_consent_evidence: "Recorded during the project kickoff meeting",
          sms_consent_recorded_at: "2026-07-08T18:00:00Z", sms_consent_disclosure_version: "field-sms-v1",
        }],
        // The live send row an earlier attempt of this draft already wrote.
        sms_messages: [{
          id: "sms-1", direction: "outbound", party_id: "p1", project_id: "proj1", template_key: null,
          dedupe_key: "outbound-draft-draft-sms", twilio_status: "dry_run", twilio_sid: "dev-1",
        }],
      });
      const result = await sendOutboundDraft(db.client, "draft-sms", DESIGNER);
      assertEquals(result, { id: "draft-sms", ok: true, messageId: undefined });
      assertEquals(db.row("draft-sms")?.status, "sent");
      assert(db.row("draft-sms")?.delivered_at, "the duplicate claim is recorded as the delivery");
      assertEquals(db.calls.includes("release_outbound_draft_claim"), false);
      assertEquals(db.fake._data.sms_messages.length, 1, "no second send row");
      assertEquals(requests.length, 0, "Twilio is never called");
    });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
