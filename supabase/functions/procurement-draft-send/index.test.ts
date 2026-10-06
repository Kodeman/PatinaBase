// Deno tests for procurement-draft-send (00706, US-16 C-28).
// Run: deno test --allow-all --config supabase/functions/deno.json supabase/functions/procurement-draft-send/
//
// Tests ./lib.ts with injected deps — importing ./index.ts would boot Deno.serve.
// loadDraftAsCaller stands in for the RLS-scoped select: a co-member reads the
// row, an outsider reads null.

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  draftBodyHtml,
  handleProcurementDraftSend,
  type ProcurementDraft,
  type ProcurementDraftSendDeps,
  type SendEmailInput,
} from "./lib.ts";

const MEMBER = { id: "member-1", email: "leah@studio.test" };
const OUTSIDER = { id: "outsider-1", email: "someone@else.test" };

function draft(overrides: Partial<ProcurementDraft> = {}): ProcurementDraft {
  return {
    id: "draft-1",
    organizationId: "org-1",
    projectId: "project-1",
    kind: "ack_discrepancy_reply",
    toEmail: "orders@maker.test",
    subject: "PO 1042: acknowledgment differences",
    body: "Hello,\n\nYour ack lists Walnut 04.\nOur PO says Walnut 07 Smoke.\n\nThank you,\nLeah",
    status: "awaiting_review",
    ...overrides,
  };
}

function harness(opts: {
  caller?: typeof MEMBER | null;
  rows?: Record<string, ProcurementDraft>;
  /** Callers who can read the rows (RLS). */
  readers?: string[];
  send?: (input: SendEmailInput) => Promise<{ success: boolean; id?: string; error?: string; suppressed?: boolean }>;
  markError?: string;
}) {
  const sends: SendEmailInput[] = [];
  const marks: Array<{ draftId: string; sentBy: string; messageId: string | null }> = [];
  const claims: string[] = [];
  const releases: string[] = [];
  const caller = opts.caller === undefined ? MEMBER : opts.caller;
  const readers = opts.readers ?? [MEMBER.id];
  const rows = opts.rows ?? {};
  const deps: ProcurementDraftSendDeps = {
    getCallerUser: () => Promise.resolve(caller),
    loadDraftAsCaller: (_req, id) =>
      Promise.resolve(caller && readers.includes(caller.id) && rows[id] ? { ...rows[id] } : null),
    // claim_procurement_draft_for_send: one row lock, so one claim wins.
    claimForSend: (_req, id) => {
      const row = rows[id];
      if (!caller || !readers.includes(caller.id) || !row) return Promise.resolve({ ok: false, reason: "not_found" });
      if (row.status !== "awaiting_review") return Promise.resolve({ ok: false, reason: "conflict", status: row.status });
      row.status = "sending";
      claims.push(id);
      return Promise.resolve({ ok: true, draft: { ...row } });
    },
    releaseClaim: (_req, id) => {
      releases.push(id);
      if (rows[id]) rows[id].status = "awaiting_review";
      return Promise.resolve({});
    },
    sendEmail: (input) => {
      sends.push(input);
      return opts.send ? opts.send(input) : Promise.resolve({ success: true, id: "msg-123" });
    },
    markSent: (draftId, sentBy, messageId) => {
      marks.push({ draftId, sentBy, messageId });
      return Promise.resolve(opts.markError ? { error: opts.markError } : {});
    },
  };
  return { deps, sends, marks, claims, releases, rows };
}

function post(body: unknown): Request {
  return new Request("http://localhost/procurement-draft-send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer caller-jwt" },
    body: JSON.stringify(body),
  });
}

Deno.test("a co-member sends the stored draft and it is marked sent with the provider message id", async () => {
  const { deps, sends, marks } = harness({ rows: { "draft-1": draft() } });
  const res = await handleProcurementDraftSend(post({ draftId: "draft-1" }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, draftId: "draft-1", messageId: "msg-123" });

  assertEquals(sends.length, 1);
  assertEquals(sends[0].to, "orders@maker.test");
  assertEquals(sends[0].subject, "PO 1042: acknowledgment differences");
  assertEquals(sends[0].text, draft().body);
  assertEquals(sends[0].replyTo, MEMBER.email);
  assertEquals(sends[0].organizationId, "org-1");
  assertStringIncludes(sends[0].html, "Your ack lists Walnut 04.<br>Our PO says Walnut 07 Smoke.");

  assertEquals(marks, [{ draftId: "draft-1", sentBy: MEMBER.id, messageId: "msg-123" }]);
});

Deno.test("the send claims the draft first and sends only what it claimed", async () => {
  const h = harness({ rows: { "draft-1": draft() } });
  const res = await handleProcurementDraftSend(post({ draftId: "draft-1" }), h.deps);
  assertEquals(res.status, 200);
  assertEquals(h.claims, ["draft-1"]);
  assertEquals(h.releases, []);
  assertEquals(h.rows["draft-1"].status, "sending");
});

Deno.test("two concurrent sends of one draft: one claim wins, the other is 409 and sends nothing", async () => {
  const h = harness({ rows: { "draft-1": draft() } });
  const [a, b] = await Promise.all([
    handleProcurementDraftSend(post({ draftId: "draft-1" }), h.deps),
    handleProcurementDraftSend(post({ draftId: "draft-1" }), h.deps),
  ]);
  assertEquals([a.status, b.status].sort(), [200, 409]);
  const loser = a.status === 409 ? a : b;
  assertEquals((await loser.json()).error, "draft_not_awaiting_review");
  assertEquals(h.sends.length, 1);
  assertEquals(h.marks.length, 1);
  assertEquals(h.claims, ["draft-1"]);
});

Deno.test("a claim lost after the read is 409 with the claimed status, and nothing sends", async () => {
  // The read saw awaiting_review; another request claimed it before this one.
  const h = harness({ rows: { "draft-1": draft({ status: "sending" }) } });
  const deps = { ...h.deps, loadDraftAsCaller: () => Promise.resolve(draft()) };
  const res = await handleProcurementDraftSend(post({ draftId: "draft-1" }), deps);
  assertEquals(res.status, 409);
  assertEquals(await res.json(), { error: "draft_not_awaiting_review", status: "sending" });
  assertEquals(h.sends.length + h.marks.length + h.releases.length, 0);
});

Deno.test("a claim that fails for another reason is 500 claim_failed and nothing sends", async () => {
  const h = harness({ rows: { "draft-1": draft() } });
  const deps = {
    ...h.deps,
    claimForSend: () => Promise.resolve({ ok: false as const, reason: "error" as const, detail: "db down" }),
  };
  const res = await handleProcurementDraftSend(post({ draftId: "draft-1" }), deps);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "claim_failed");
  assertEquals(h.sends.length + h.marks.length, 0);
});

Deno.test("an outsider gets the same 404 as a missing draft, and nothing sends", async () => {
  const { deps, sends, marks } = harness({ caller: OUTSIDER, rows: { "draft-1": draft() } });
  const res = await handleProcurementDraftSend(post({ draftId: "draft-1" }), deps);
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error, "draft_not_found");

  const missing = harness({ rows: {} });
  const res2 = await handleProcurementDraftSend(post({ draftId: "nope" }), missing.deps);
  assertEquals(res2.status, 404);
  assertEquals((await res2.json()).error, "draft_not_found");

  assertEquals(sends.length + marks.length + missing.sends.length, 0);
});

Deno.test("a sent draft cannot be resent", async () => {
  const { deps, sends, marks } = harness({ rows: { "draft-1": draft({ status: "sent" }) } });
  const res = await handleProcurementDraftSend(post({ draftId: "draft-1" }), deps);
  assertEquals(res.status, 409);
  assertEquals(await res.json(), { error: "draft_not_awaiting_review", status: "sent" });
  assertEquals(sends.length + marks.length, 0);
});

Deno.test("a discarded draft cannot be sent", async () => {
  const { deps, sends, marks } = harness({ rows: { "draft-1": draft({ status: "discarded" }) } });
  const res = await handleProcurementDraftSend(post({ draftId: "draft-1" }), deps);
  assertEquals(res.status, 409);
  assertEquals(await res.json(), { error: "draft_not_awaiting_review", status: "discarded" });
  assertEquals(sends.length + marks.length, 0);
});

Deno.test("no caller is 401 and nothing is read or sent", async () => {
  const { deps, sends } = harness({ caller: null, rows: { "draft-1": draft() } });
  const res = await handleProcurementDraftSend(post({ draftId: "draft-1" }), deps);
  assertEquals(res.status, 401);
  assertEquals(sends.length, 0);
});

Deno.test("a draft with no recipient is 422 and never sends", async () => {
  const { deps, sends, marks } = harness({ rows: { "draft-1": draft({ toEmail: null }) } });
  const res = await handleProcurementDraftSend(post({ draftId: "draft-1" }), deps);
  assertEquals(res.status, 422);
  assertEquals((await res.json()).error, "no_recipient");
  assertEquals(sends.length + marks.length, 0);
});

Deno.test("a failed, thrown or suppressed send releases the claim back to awaiting review", async () => {
  const failed = harness({
    rows: { "draft-1": draft() },
    send: () => Promise.resolve({ success: false, error: "provider down" }),
  });
  const res = await handleProcurementDraftSend(post({ draftId: "draft-1" }), failed.deps);
  assertEquals(res.status, 502);
  assertEquals(failed.marks.length, 0);
  assertEquals(failed.releases, ["draft-1"]);
  assertEquals(failed.rows["draft-1"].status, "awaiting_review");

  const thrown = harness({
    rows: { "draft-1": draft() },
    send: () => Promise.reject(new Error("socket hang up")),
  });
  const res1 = await handleProcurementDraftSend(post({ draftId: "draft-1" }), thrown.deps);
  assertEquals(res1.status, 502);
  assertEquals(thrown.releases, ["draft-1"]);
  assertEquals(thrown.rows["draft-1"].status, "awaiting_review");

  const suppressed = harness({
    rows: { "draft-1": draft() },
    send: () => Promise.resolve({ success: false, suppressed: true, error: "bounced" }),
  });
  const res2 = await handleProcurementDraftSend(post({ draftId: "draft-1" }), suppressed.deps);
  assertEquals(res2.status, 422);
  assertEquals((await res2.json()).error, "recipient_suppressed");
  assertEquals(suppressed.marks.length, 0);
  assertEquals(suppressed.releases, ["draft-1"]);
  assertEquals(suppressed.rows["draft-1"].status, "awaiting_review");
});

Deno.test("a stamp failure after the provider accepted says the email went and keeps the claim", async () => {
  const h = harness({ rows: { "draft-1": draft() }, markError: "already sent" });
  const res = await handleProcurementDraftSend(post({ draftId: "draft-1" }), h.deps);
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "mark_sent_failed");
  assertEquals(body.emailSent, true);
  // It went: putting it back would let it be sent twice.
  assertEquals(h.releases, []);
  assertEquals(h.rows["draft-1"].status, "sending");
});

Deno.test("method and body guards", async () => {
  const { deps } = harness({ rows: {} });
  assertEquals((await handleProcurementDraftSend(new Request("http://x", { method: "GET" }), deps)).status, 405);
  assertEquals((await handleProcurementDraftSend(new Request("http://x", { method: "OPTIONS" }), deps)).status, 200);
  assertEquals((await handleProcurementDraftSend(post({}), deps)).status, 400);
  assertEquals((await handleProcurementDraftSend(post(["draft-1"]), deps)).status, 400);
});

Deno.test("draftBodyHtml escapes the reviewed text", () => {
  const html = draftBodyHtml("<b>Hi</b> & bye");
  assertStringIncludes(html, "&lt;b&gt;Hi&lt;/b&gt; &amp; bye");
});
