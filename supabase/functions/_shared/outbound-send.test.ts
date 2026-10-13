import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { finalizeOutboundDraft, sendOutboundDraft } from "./outbound-send.ts";
import { renderEmail } from "./outbound-kinds/review_request.ts";
import { outboundKinds } from "./outbound-kinds/index.ts";
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

// ── Delivery finalization (00782, SQ-905 F11; 00785, F19/F20/F21) ────────────
// The rpc handlers model the 00775/00780/00782/00784/00785 draft lifecycle; the
// SQL guards themselves are proven in supabase/tests/outbound/.
type Row = Record<string, unknown>;
const DESIGNER = { kind: "designer", userId: "designer-1" } as const;
const SITE_REQUEST_ID = "site-request-1";

function draftRow(id: string, overrides: Row = {}): Row {
  return {
    id, organization_id: "org-alpha", project_id: "proj1", kind: "site_request_due", channel: "push",
    recipient_kind: "trade", to_contact_id: null, to_client_id: null, to_party_id: null, to_address: null,
    subject: "Site request due", body: "The tile sample is due tomorrow.", payload: { user_id: "trade-user-1" },
    ref_type: "site_request", ref_id: SITE_REQUEST_ID, status: "awaiting_review", sent_by: null,
    claimed_at: null, message_id: null, delivered_at: null, delivery_message_id: null,
    send_attempted_at: null, finalizing_at: null, after_send_done_at: null, last_send_outcome: null, ...overrides,
  };
}

const STALE_MS = 10 * 60 * 1000;
const stale = (iso: unknown) => typeof iso === "string" && Date.parse(iso) < Date.now() - STALE_MS;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString();

function draftDb(
  drafts: Row[],
  tables: Record<string, Row[]> = {},
  opts: { markFailures?: number; recordFailures?: number } = {},
) {
  const calls: string[] = [];
  let markFailures = opts.markFailures ?? 0;
  let recordFailures = opts.recordFailures ?? 0;
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
      const staleSending = draft.status === "sending" && stale(draft.claimed_at);
      if (staleSending && draft.send_attempted_at) {
        // 00785: an attempt with no answer goes back to review marked unknown.
        Object.assign(draft, {
          status: "awaiting_review", claimed_at: null, sent_by: null, send_attempted_at: null, last_send_outcome: "unknown",
        });
        return { data: structuredClone(draft), error: null };
      }
      if (draft.status !== "awaiting_review" && !staleSending) {
        return { data: null, error: { message: `claim_outbound_draft_for_send: draft is ${draft.status} or has a fresh claim` } };
      }
      Object.assign(draft, { status: "sending", claimed_at: new Date().toISOString() });
      return { data: structuredClone(draft), error: null };
    },
    record_outbound_draft_send_attempt: ({ p_id }) => {
      calls.push("record_outbound_draft_send_attempt");
      const draft = row(p_id)!;
      if (draft.status !== "sending" || draft.delivered_at || draft.send_attempted_at) {
        return { data: null, error: { message: `record_outbound_draft_send_attempt: draft is ${draft.status} and cannot start a provider attempt` } };
      }
      draft.send_attempted_at = new Date().toISOString();
      return { data: structuredClone(draft), error: null };
    },
    record_outbound_draft_delivery: ({ p_id, p_message_id }) => {
      calls.push("record_outbound_draft_delivery");
      if (recordFailures > 0) {
        recordFailures--;
        return { data: null, error: { message: "record_outbound_draft_delivery: connection reset" } };
      }
      const draft = row(p_id)!;
      if (!draft.delivered_at) {
        if (draft.status !== "sending") {
          return { data: null, error: { message: `record_outbound_draft_delivery: draft is ${draft.status}, not sending` } };
        }
        Object.assign(draft, {
          delivered_at: new Date().toISOString(), delivery_message_id: p_message_id ?? null, last_send_outcome: null,
        });
      }
      return { data: structuredClone(draft), error: null };
    },
    record_outbound_draft_send_rejected: ({ p_id }) => {
      calls.push("record_outbound_draft_send_rejected");
      const draft = row(p_id)!;
      if (draft.status !== "sending" || draft.delivered_at || !draft.send_attempted_at) {
        return { data: null, error: { message: `record_outbound_draft_send_rejected: draft is ${draft.status} and has no open provider attempt` } };
      }
      Object.assign(draft, {
        status: "awaiting_review", claimed_at: null, sent_by: null, send_attempted_at: null, last_send_outcome: "rejected",
      });
      return { data: structuredClone(draft), error: null };
    },
    release_outbound_draft_claim: ({ p_id }) => {
      calls.push("release_outbound_draft_claim");
      const draft = row(p_id)!;
      if (draft.delivered_at) {
        return { data: null, error: { message: "release_outbound_draft_claim: draft was already delivered; finalize it" } };
      }
      if (draft.send_attempted_at) {
        return { data: null, error: { message: "release_outbound_draft_claim: draft was already attempted; finalize it" } };
      }
      Object.assign(draft, { status: "awaiting_review", claimed_at: null, sent_by: null });
      return { data: structuredClone(draft), error: null };
    },
    claim_outbound_draft_finalize: ({ p_id }) => {
      calls.push("claim_outbound_draft_finalize");
      const draft = row(p_id)!;
      if (draft.status === "sent") return { data: structuredClone(draft), error: null };
      if (draft.status !== "sending" || !draft.delivered_at) {
        return { data: null, error: { message: `claim_outbound_draft_finalize: draft is ${draft.status} and was not delivered` } };
      }
      if (draft.finalizing_at && !stale(draft.finalizing_at)) {
        return { data: null, error: { message: "claim_outbound_draft_finalize: draft is already being finalized" } };
      }
      draft.finalizing_at = new Date().toISOString();
      return { data: structuredClone(draft), error: null };
    },
    record_outbound_draft_after_send: ({ p_id, p_finalizing_at }) => {
      calls.push("record_outbound_draft_after_send");
      const draft = row(p_id)!;
      if (draft.status !== "sending" || draft.finalizing_at !== p_finalizing_at) {
        return { data: null, error: { message: `record_outbound_draft_after_send: draft is ${draft.status} and the caller does not hold its finalize claim` } };
      }
      draft.after_send_done_at ??= new Date().toISOString();
      return { data: structuredClone(draft), error: null };
    },
    release_outbound_draft_finalize: ({ p_id, p_finalizing_at }) => {
      calls.push("release_outbound_draft_finalize");
      const draft = row(p_id)!;
      const released = draft.status === "sending" && draft.finalizing_at === p_finalizing_at;
      if (released) draft.finalizing_at = null;
      return { data: released, error: null };
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

/**
 * Stubs fetch (the push provider is apns-send) and counts every request. An
 * Error reply makes the request throw after it went out (an unknown outcome).
 */
async function withProvider<T>(
  fn: (requests: string[]) => Promise<T>,
  reply: Row | Error = { sent: 1, failed: 0, message_id: "apns-1" },
  status = 200,
): Promise<T> {
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    requests.push(input instanceof Request ? input.url : String(input));
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve(new Response(JSON.stringify(reply), { status }));
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

    assert(db.row("draft-mark")?.after_send_done_at, "the hook's run is recorded before the mark");

    const retry = await sendOutboundDraft(db.client, "draft-mark", DESIGNER);
    assertEquals(retry, { id: "draft-mark", ok: true, messageId: "apns-1" });
    assertEquals(requests.length, 1, "exactly one provider call across the send and its retry");
    assertEquals(db.row("draft-mark")?.status, "sent");
    assertEquals(db.row("draft-mark")?.message_id, "apns-1");
    assertEquals(db.calls, [
      "claim_outbound_draft_for_send", "record_outbound_draft_send_attempt", "record_outbound_draft_delivery",
      "claim_outbound_draft_finalize", "record_outbound_draft_after_send", "mark_outbound_draft_sent",
      "release_outbound_draft_finalize",
      // F19: the retry skips the hook and only re-attempts the mark.
      "claim_outbound_draft_for_send", "claim_outbound_draft_finalize", "mark_outbound_draft_sent",
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
    assertEquals(db.calls, [
      "claim_outbound_draft_for_send", "record_outbound_draft_send_attempt", "record_outbound_draft_delivery",
      "claim_outbound_draft_finalize", "release_outbound_draft_finalize",
    ]);
    assertEquals(db.row("draft-hook")?.finalizing_at, null, "a failed finalizer hands its claim back");

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
    assertEquals(db.calls, ["claim_outbound_draft_finalize"]);
  });
});


/** A fixed-offset zone whose local hour right now passes the test, so the SMS send window is deterministic. */
function zoneWhereHour(test: (hour: number) => boolean): string {
  return Array.from({ length: 25 }, (_, i) => i - 12).map((n) => `Etc/GMT${n >= 0 ? "+" : ""}${n}`).find((tz) =>
    test(Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date())))
  )!;
}

/** Runs fn with FIELD_TZ inside (8am–8pm) or outside the SMS send window, then restores it. */
async function withSendWindow<T>(open: boolean, fn: () => Promise<T>): Promise<T> {
  const saved = Deno.env.get("FIELD_TZ");
  Deno.env.set("FIELD_TZ", zoneWhereHour((hour) => open ? hour >= 9 && hour < 19 : hour < 7));
  try {
    return await fn();
  } finally {
    if (saved === undefined) Deno.env.delete("FIELD_TZ");
    else Deno.env.set("FIELD_TZ", saved);
  }
}

/** Runs fn with sms.ts in dry-run mode against a consenting party, then restores the env. */
async function withSmsParty<T>(smsMessages: Row[], fn: (db: ReturnType<typeof draftDb>, requests: string[]) => Promise<T>) {
  const env = { SMS_DEV_MODE: "dry_run", TWILIO_FROM_NUMBER: "+15550000000" };
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, Deno.env.get(key)]));
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  try {
    return await withProvider((requests) => {
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
        sms_messages: smsMessages,
      });
      return fn(db, requests);
    });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

const smsRow = (overrides: Row): Row => ({
  id: "sms-1", direction: "outbound", party_id: "p1", project_id: "proj1", template_key: null,
  dedupe_key: "outbound-draft-draft-sms", ...overrides,
});

Deno.test("an accepted SMS duplicate_send_claim is recorded as delivered and finalizes without a second text", async () => {
  // The live send row an earlier attempt of this draft wrote, which the provider accepted.
  await withSendWindow(true, () => withSmsParty([smsRow({ twilio_status: "dry_run", twilio_sid: "dev-1" })], async (db, requests) => {
    const result = await sendOutboundDraft(db.client, "draft-sms", DESIGNER);
    assertEquals(result, { id: "draft-sms", ok: true, messageId: undefined });
    assertEquals(db.row("draft-sms")?.status, "sent");
    assert(db.row("draft-sms")?.delivered_at, "the duplicate claim is recorded as the delivery");
    assertEquals(db.calls.includes("release_outbound_draft_claim"), false);
    assertEquals(db.fake._data.sms_messages.length, 1, "no second send row");
    assertEquals(requests.length, 0, "Twilio is never called");
  }));
});

Deno.test("a duplicate_send_claim on an SMS row with no provider sid is in flight: not ok, nothing recorded (F16)", async () => {
  for (const twilio_status of ["claimed", "queued", "deferred"]) {
    await withSendWindow(true, () => withSmsParty([
      // An earlier text the carrier failed: it holds a sid, but it freed the claim.
      smsRow({ id: "sms-0", twilio_status: "failed", twilio_sid: "SM-failed" }),
      smsRow({ twilio_status, twilio_sid: null }),
    ], async (db, requests) => {
      const result = await sendOutboundDraft(db.client, "draft-sms", DESIGNER);
      assertEquals(result, { id: "draft-sms", ok: false, error: "send_in_progress" }, `${twilio_status} row`);
      assertEquals(db.calls, ["claim_outbound_draft_for_send"], "no delivery, finalize, mark or release");
      assertEquals(db.row("draft-sms")?.delivered_at, null);
      assertEquals(db.row("draft-sms")?.status, "sending", "the in-flight send is not handed back to review");
      assertEquals(db.fake._data.sms_messages.length, 2, "no second send row");
      assertEquals(requests.length, 0, "Twilio is never called");
    }));
  }
});

Deno.test("quiet-hours SMS for site_request_due is not delivered, queues nothing and makes no provider call (F20)", async () => {
  await withSendWindow(false, () => withSmsParty([], async (db, requests) => {
    assertEquals(db.row("draft-sms")?.kind, "site_request_due");
    const result = await sendOutboundDraft(db.client, "draft-sms", {
      kind: "studio_schedule", studioId: "org-alpha", outboundKind: "site_request_due",
    });
    assertEquals(result, { id: "draft-sms", ok: false, error: "not_sendable_until_send_window" });
    assertEquals(db.row("draft-sms")?.status, "awaiting_review", "the draft goes back to review");
    assertEquals(db.row("draft-sms")?.delivered_at, null);
    assertEquals(db.fake._data.sms_messages.length, 0, "no deferred send row is queued inside sms.ts");
    assertEquals(requests.length, 0, "Twilio is never called");
    assertEquals(db.calls, ["claim_outbound_draft_for_send", "release_outbound_draft_claim"]);
    assertEquals(db.fake._data.site_requests[0].due_reminder_sent_at, null, "no afterSend");
  }));
});

Deno.test("an in-window SMS for site_request_due still sends, records the acceptance and finalizes (F20)", async () => {
  await withSendWindow(true, () => withSmsParty([], async (db, requests) => {
    const result = await sendOutboundDraft(db.client, "draft-sms", {
      kind: "studio_schedule", studioId: "org-alpha", outboundKind: "site_request_due",
    });
    assertEquals(result.ok, true, JSON.stringify(result));
    assertEquals(db.row("draft-sms")?.status, "sent");
    assert(db.row("draft-sms")?.delivered_at, "the provider acceptance is the delivery");
    const sent = db.fake._data.sms_messages.filter((row) => row.dedupe_key === "outbound-draft-draft-sms");
    assertEquals(sent.length, 1, "one send row");
    assert(String(sent[0].twilio_sid ?? "").startsWith("dev-"), "the dry-run provider sid is on the row");
    assertEquals(requests.length, 0, "dry run never calls Twilio over the network");
    assert(db.fake._data.site_requests[0].due_reminder_sent_at, "afterSend ran");
  }));
});

Deno.test("a push whose acceptance never came back is released marked unknown after the stale window, never auto-sent (F15/F21)", async () => {
  await withProvider(async (requests) => {
    const db = draftDb([draftRow("draft-unknown")]);
    const first = await sendOutboundDraft(db.client, "draft-unknown", DESIGNER);
    assertEquals(first, { id: "draft-unknown", ok: false, error: "send_outcome_unknown" });
    assertEquals(requests.length, 1);
    assert(db.row("draft-unknown")?.send_attempted_at, "the attempt is durable before APNs is called");
    assertEquals(db.row("draft-unknown")?.status, "sending", "an unknown outcome is not released while its claim is fresh");
    assertEquals(db.calls, ["claim_outbound_draft_for_send", "record_outbound_draft_send_attempt"]);

    db.row("draft-unknown")!.claimed_at = minutesAgo(11);
    const reclaim = await sendOutboundDraft(db.client, "draft-unknown", DESIGNER);
    assertEquals(reclaim, { id: "draft-unknown", ok: false, error: "send_outcome_unknown" });
    assertEquals(requests.length, 1, "the stale reclaim never pushes again");
    assertEquals(db.row("draft-unknown")?.status, "awaiting_review", "the studio decides whether to send it again");
    assertEquals(db.row("draft-unknown")?.last_send_outcome, "unknown");
    assertEquals(db.row("draft-unknown")?.send_attempted_at, null);
    assertEquals(db.row("draft-unknown")?.delivered_at, null, "an attempt is never delivery");
    assertEquals(db.fake._data.site_requests[0].due_reminder_sent_at, null, "no afterSend for an unknown outcome");

    const scheduled = await sendOutboundDraft(db.client, "draft-unknown", {
      kind: "studio_schedule", studioId: "org-alpha", outboundKind: "site_request_due",
    });
    assertEquals(scheduled, { id: "draft-unknown", ok: false, error: "send_outcome_unknown" });
    assertEquals(requests.length, 1, "automation never re-sends an unknown outcome");
    assertEquals(db.row("draft-unknown")?.status, "awaiting_review");
    assertEquals(db.calls.includes("claim_outbound_draft_finalize"), false, "never finalized or marked sent");
    assertEquals(db.calls.includes("mark_outbound_draft_sent"), false);
  }, new TypeError("error sending request: connection reset"));
});

Deno.test("a failed delivery record after an accepted push is an unknown outcome, never promoted to delivered (F15)", async () => {
  await withProvider(async (requests) => {
    const db = draftDb([draftRow("draft-receipt")], {}, { recordFailures: 1 });
    const first = await sendOutboundDraft(db.client, "draft-receipt", DESIGNER);
    assertEquals(first.ok, false);
    assertEquals(db.row("draft-receipt")?.delivered_at, null);
    assertEquals(db.row("draft-receipt")?.status, "sending");

    db.row("draft-receipt")!.claimed_at = minutesAgo(11);
    assertEquals(await finalizeOutboundDraft(db.client, "draft-receipt", DESIGNER), {
      id: "draft-receipt", ok: false, error: "not_delivered",
    });
    const reclaim = await sendOutboundDraft(db.client, "draft-receipt", DESIGNER);
    assertEquals(reclaim, { id: "draft-receipt", ok: false, error: "send_outcome_unknown" });
    assertEquals(requests.length, 1, "exactly one APNs call");
    assertEquals(db.row("draft-receipt")?.status, "awaiting_review");
    assertEquals(db.row("draft-receipt")?.last_send_outcome, "unknown");
    assertEquals(db.row("draft-receipt")?.delivered_at, null);

    // The studio sends it again: a fresh attempt that the provider accepts.
    const resent = await sendOutboundDraft(db.client, "draft-receipt", DESIGNER);
    assertEquals(resent, { id: "draft-receipt", ok: true, messageId: "apns-1" });
    assertEquals(requests.length, 2);
    assertEquals(db.row("draft-receipt")?.status, "sent");
    assertEquals(db.row("draft-receipt")?.last_send_outcome, null, "a recorded delivery clears the marker");
  });
});

Deno.test("a push APNs rejects is a failure: not ok, the attempt is cleared and the draft goes back to review (F21)", async () => {
  for (const [reply, error] of [
    [{ sent: 0, failed: 1, error: "push_failed" }, "push_failed"],
    [{ sent: 0, failed: 1, failures: [{ token: "t", status: 400, reason: "BadDeviceToken" }] }, "push_not_accepted"],
    [{ sent: 0, skipped: "no_tokens" }, "no_tokens"],
    [{ skipped: "apns_not_configured" }, "apns_not_configured"],
  ] as Array<[Row, string]>) {
    await withProvider(async (requests) => {
      const db = draftDb([draftRow("draft-rejected")]);
      const first = await sendOutboundDraft(db.client, "draft-rejected", DESIGNER);
      assertEquals(first, { id: "draft-rejected", ok: false, error }, JSON.stringify(reply));
      assertEquals(requests.length, 1);
      assertEquals(db.row("draft-rejected")?.status, "awaiting_review");
      assertEquals(db.row("draft-rejected")?.send_attempted_at, null, "the rejected attempt is cleared");
      assertEquals(db.row("draft-rejected")?.last_send_outcome, "rejected");
      assertEquals(db.row("draft-rejected")?.delivered_at, null);
      assertEquals(db.calls, [
        "claim_outbound_draft_for_send", "record_outbound_draft_send_attempt", "record_outbound_draft_send_rejected",
      ]);
      assertEquals(db.fake._data.site_requests[0].due_reminder_sent_at, null, "no afterSend for a rejection");
    }, reply);
  }
});

Deno.test("an apns-send 4xx is a rejection; a 5xx or unreadable answer is an unknown outcome", async () => {
  await withProvider(async () => {
    const db = draftDb([draftRow("draft-403")]);
    assertEquals(await sendOutboundDraft(db.client, "draft-403", DESIGNER), { id: "draft-403", ok: false, error: "refused_unlabelled" });
    assertEquals(db.row("draft-403")?.status, "awaiting_review");
    assertEquals(db.row("draft-403")?.last_send_outcome, "rejected");
  }, { error: "refused_unlabelled" }, 403);
  // apns-send answers 500 {error} when it throws, which can be after APNs took the push.
  await withProvider(async () => {
    const db = draftDb([draftRow("draft-500")]);
    assertEquals(await sendOutboundDraft(db.client, "draft-500", DESIGNER), { id: "draft-500", ok: false, error: "send_outcome_unknown" });
    assertEquals(db.row("draft-500")?.status, "sending");
    assert(db.row("draft-500")?.send_attempted_at, "the attempt stays recorded");
  }, { error: "notification_log update failed" }, 500);
  const original = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("upstream timeout", { status: 504 }))) as typeof fetch;
  try {
    const db = draftDb([draftRow("draft-504")]);
    assertEquals(await sendOutboundDraft(db.client, "draft-504", DESIGNER), { id: "draft-504", ok: false, error: "send_outcome_unknown" });
    assertEquals(db.row("draft-504")?.status, "sending");
    assert(db.row("draft-504")?.send_attempted_at, "the attempt stays recorded");
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("two concurrent finalizers run afterSend exactly once", async () => {
  const original = outboundKinds.site_request_due;
  let hookRuns = 0;
  outboundKinds.site_request_due = {
    ...original,
    afterSend: async (context) => {
      hookRuns++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      await original.afterSend!(context);
    },
  };
  try {
    await withProvider(async (requests) => {
      const db = draftDb([draftRow("draft-race", {
        status: "sending", claimed_at: minutesAgo(1), delivered_at: minutesAgo(1), delivery_message_id: "apns-1",
      })]);
      const results = await Promise.all([
        finalizeOutboundDraft(db.client, "draft-race", DESIGNER),
        finalizeOutboundDraft(db.client, "draft-race", DESIGNER),
      ]);
      assertEquals(hookRuns, 1, "only the finalize claim's winner runs the hook");
      assertEquals(results.map((r) => r.ok).sort(), [false, true]);
      assertEquals(results.find((r) => !r.ok), { id: "draft-race", ok: false, error: "finalize_in_progress" });
      assertEquals(db.calls.filter((name) => name === "mark_outbound_draft_sent").length, 1);
      assertEquals(db.row("draft-race")?.status, "sent");

      assertEquals(await finalizeOutboundDraft(db.client, "draft-race", DESIGNER), {
        id: "draft-race", ok: true, messageId: "apns-1",
      });
      assertEquals(hookRuns, 1, "a finalize of a sent draft runs nothing");
      assertEquals(requests.length, 0);
    });
  } finally {
    outboundKinds.site_request_due = original;
  }
});

// SQ-905 R3 reviewer probes, ported verbatim (verification/SQ-905/r3-probes.test.ts:406-408).
Deno.test("R3 rejected push must not become successfully sent on stale retry",async()=>{await withProvider(async(requests)=>{const db=draftDb([draftRow("rejected")]);assertEquals((await sendOutboundDraft(db.client,"rejected",DESIGNER)).ok,false);db.row("rejected")!.claimed_at=minutesAgo(11);const retry=await sendOutboundDraft(db.client,"rejected",DESIGNER);console.log("REJECTED_PUSH",JSON.stringify({retry,row:db.row("rejected"),requests:requests.length}));assertEquals(retry.ok,false,"an explicitly rejected push is not delivery");},{sent:0,failed:1,error:"push_failed"})});
Deno.test("R3 invoice finalization retry must not emit attention twice",async()=>{const db=draftDb([draftRow("invoice",{kind:"invoice_reminder",channel:"email",status:"sending",claimed_at:minutesAgo(1),delivered_at:minutesAgo(1),payload:{step:0,client_user_id:"client-1"},ref_id:"inv-1"})],{invoices:[{id:"inv-1",reminder_count:0}]},{markFailures:1});const rpc=db.fake.rpc.bind(db.fake);let attention=0;db.fake.rpc=((name:string,args:Record<string,unknown>)=>{if(name==="notify_client_attention")attention++;return rpc(name,args)}) as typeof db.fake.rpc;await finalizeOutboundDraft(db.client,"invoice",DESIGNER);await finalizeOutboundDraft(db.client,"invoice",DESIGNER);console.log("INVOICE_ATTENTION_CALLS",attention);assertEquals(attention,1,"retry must not enqueue a second client push");});
Deno.test("R3 newly deferred site request SMS must not finalize before provider acceptance",async()=>{const saved=Deno.env.get("FIELD_TZ");const zone=Array.from({length:25},(_,i)=>i-12).map(n=>"Etc/GMT"+(n>=0?"+":"")+n).find(tz=>{try{return Number(new Intl.DateTimeFormat("en-US",{timeZone:tz,hour:"numeric",hourCycle:"h23"}).format(new Date()))<7}catch{return false}})!;Deno.env.set("FIELD_TZ",zone);try{await withSmsParty([],async(db,requests)=>{const result=await sendOutboundDraft(db.client,"draft-sms",DESIGNER);console.log("DEFERRED_SMS",JSON.stringify({result,draft:db.row("draft-sms"),sms:db.fake._data.sms_messages,requests:requests.length}));assertEquals(result.ok,false,"quiet-hours queue is not provider acceptance");});}finally{if(saved===undefined)Deno.env.delete("FIELD_TZ");else Deno.env.set("FIELD_TZ",saved)}});
