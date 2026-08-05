// Deno tests for trade-rfq-send (Trade Instrument RFQ rail, migration 00424).
// Run: deno test --allow-all --config supabase/functions/deno.json supabase/functions/trade-rfq-send/
//
// Tests ./lib.ts directly — importing ./index.ts would boot Deno.serve
// (po-send / field-login-token / aesthete-ask convention). Covers the pure
// helpers (parse, recipient resolution, scope-snapshot extraction) AND the
// full request/response contract via handleTradeRfqSend with injected deps
// (field-login-token convention: mocked Supabase-shaped deps, no network) —
// auth, the not-found/not-owned 404 collapse, recipient resolution,
// preview-vs-send, and the send-time stamp (including first-send-only
// sentAt and the override-recipient path).

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  type CallerUser,
  extractScopeSections,
  handleTradeRfqSend,
  parseTradeRfqSendBody,
  resolvePartyRecipient,
  type TradeRfqRequestRow,
  type TradeRfqSendDeps,
} from "./lib.ts";

// ─── parseTradeRfqSendBody — payload validation ──────────────────────────────

Deno.test("parseTradeRfqSendBody rejects non-object bodies", () => {
  for (const bad of [null, undefined, 42, "rfq-1", ["rfq-1"]]) {
    const result = parseTradeRfqSendBody(bad);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, "invalid_body");
  }
});

Deno.test("parseTradeRfqSendBody requires rfqRequestId", () => {
  for (const body of [{}, { rfqRequestId: "" }, { rfqRequestId: "   " }, { rfqRequestId: 7 }]) {
    const result = parseTradeRfqSendBody(body);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, "rfqRequestId_required");
  }
});

Deno.test("parseTradeRfqSendBody rejects unknown modes", () => {
  for (const mode of ["emailify", "mark_sent"]) {
    const result = parseTradeRfqSendBody({ rfqRequestId: "rfq-1", mode });
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, "invalid_mode");
  }
});

Deno.test("parseTradeRfqSendBody defaults mode to send", () => {
  const result = parseTradeRfqSendBody({ rfqRequestId: "rfq-1" });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.payload.mode, "send");
    assertEquals(result.payload.recipientEmail, undefined);
  }
});

Deno.test("parseTradeRfqSendBody accepts preview and send", () => {
  for (const mode of ["preview", "send"] as const) {
    const result = parseTradeRfqSendBody({ rfqRequestId: "rfq-1", mode });
    assertEquals(result.ok, true);
    if (result.ok) assertEquals(result.payload.mode, mode);
  }
});

Deno.test("parseTradeRfqSendBody trims id + carries the override recipient", () => {
  const result = parseTradeRfqSendBody({
    rfqRequestId: " rfq-1 ",
    mode: "send",
    recipientEmail: " sub@hewn.test ",
  });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.payload, {
      rfqRequestId: "rfq-1",
      mode: "send",
      recipientEmail: "sub@hewn.test",
    });
  }
});

Deno.test("parseTradeRfqSendBody rejects a malformed recipientEmail override", () => {
  for (const recipientEmail of ["", "   ", "not-an-email", 42]) {
    const result = parseTradeRfqSendBody({ rfqRequestId: "rfq-1", recipientEmail });
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, "invalid_recipient");
  }
});

// ─── resolvePartyRecipient — override → project_parties.email ────────────────

Deno.test("resolvePartyRecipient prefers the explicit override", () => {
  assertEquals(
    resolvePartyRecipient({ email: "sub@hewn.test" }, "override@hewn.test"),
    "override@hewn.test",
  );
});

Deno.test("resolvePartyRecipient falls back to the party's email", () => {
  assertEquals(resolvePartyRecipient({ email: " sub@hewn.test " }), "sub@hewn.test");
});

Deno.test("resolvePartyRecipient returns null when nothing is usable", () => {
  assertEquals(resolvePartyRecipient(null), null);
  assertEquals(resolvePartyRecipient({}), null);
  assertEquals(resolvePartyRecipient({ email: null }), null);
  assertEquals(resolvePartyRecipient({ email: "   " }), null);
});

// ─── extractScopeSections — scope_snapshot jsonb → room prose ────────────────

Deno.test("extractScopeSections reads the sections array, camelCase roomName", () => {
  const sections = extractScopeSections({
    sections: [
      { roomName: "Kitchen", prose: "Custom hood surround." },
      { roomName: "Mudroom", prose: "Built-in bench." },
    ],
  });
  assertEquals(sections, [
    { roomName: "Kitchen", prose: "Custom hood surround." },
    { roomName: "Mudroom", prose: "Built-in bench." },
  ]);
});

Deno.test("extractScopeSections also accepts snake_case room_name", () => {
  const sections = extractScopeSections({
    sections: [{ room_name: "Kitchen", prose: "Custom hood surround." }],
  });
  assertEquals(sections, [{ roomName: "Kitchen", prose: "Custom hood surround." }]);
});

Deno.test("extractScopeSections drops blank-prose entries and null-names entries pass through", () => {
  const sections = extractScopeSections({
    sections: [
      { roomName: "Empty", prose: "   " },
      { prose: "General millwork." },
    ],
  });
  assertEquals(sections, [{ roomName: null, prose: "General millwork." }]);
});

Deno.test("extractScopeSections tolerates an empty/malformed snapshot", () => {
  assertEquals(extractScopeSections({}), []);
  assertEquals(extractScopeSections(null), []);
  assertEquals(extractScopeSections("not an object"), []);
  assertEquals(extractScopeSections({ sections: "not an array" }), []);
  assertEquals(extractScopeSections({ sections: [null, 42, "x"] }), []);
});

// ─── handleTradeRfqSend — full request/response contract (mocked deps) ───────

const DESIGNER: CallerUser = { id: "designer-uuid", email: "designer@patina.dev" };

const BASE_ROW: TradeRfqRequestRow = {
  id: "rfq-1",
  proposalId: "proposal-1",
  partyId: "party-1",
  designerId: "designer-uuid",
  scopeTitle: "Primary suite built-ins",
  partyDisplayName: "Hewn Woodworks",
  party: { email: "sub@hewn.test" },
  message: "Please include your lead time.",
  timeline: "Install by October",
  scopeSnapshot: { sections: [{ roomName: "Kitchen", prose: "Custom hood surround." }] },
  status: "draft",
  sentAt: null,
};

interface DepsCallLog {
  mintTokenCalled: boolean;
  sendEmailCalled: boolean;
  stampSentCalled: boolean;
  stampPatch?: { partyEmail: string; sentAt?: string; status?: "sent" };
  sentEmailOpts?: { to: string; subject: string; html: string; replyTo?: string };
}

function makeDeps(
  overrides: Partial<TradeRfqSendDeps> = {},
  log: Partial<DepsCallLog> = {},
): TradeRfqSendDeps {
  return {
    getCallerUser: () => Promise.resolve(DESIGNER),
    loadRequest: () => Promise.resolve({ ...BASE_ROW }),
    isDesignStudioComember: () => Promise.resolve(true),
    resolveDesignerIdentity: () =>
      Promise.resolve({
        studioName: "Middle West Studio",
        designerName: "Leah Rowe",
        designerEmail: "leah@studio.test",
      }),
    mintToken: () => {
      if (log) (log as DepsCallLog).mintTokenCalled = true;
      return Promise.resolve({ token: "tok_abc123" });
    },
    sendEmail: (opts) => {
      if (log) {
        (log as DepsCallLog).sendEmailCalled = true;
        (log as DepsCallLog).sentEmailOpts = opts;
      }
      return Promise.resolve({ success: true });
    },
    stampSent: (_id, patch) => {
      if (log) {
        (log as DepsCallLog).stampSentCalled = true;
        (log as DepsCallLog).stampPatch = patch;
      }
      return Promise.resolve({});
    },
    clientPortalUrl: "https://client.patina.cloud",
    now: () => "2026-08-05T12:00:00.000Z",
    ...overrides,
  };
}

function req(method: string, headers: Record<string, string> = {}, body?: unknown): Request {
  return new Request("http://localhost/functions/v1/trade-rfq-send", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

Deno.test("OPTIONS → 200 with CORS headers (preflight)", async () => {
  const res = await handleTradeRfqSend(req("OPTIONS"), makeDeps());
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("non-POST → 405", async () => {
  const res = await handleTradeRfqSend(req("GET"), makeDeps());
  assertEquals(res.status, 405);
  assertEquals((await res.json()).error, "method_not_allowed");
});

Deno.test("unparseable body → 400 invalid_body", async () => {
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }),
    makeDeps(),
  );
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "invalid_body");
});

Deno.test("unauthenticated caller → 401", async () => {
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }, { rfqRequestId: "rfq-1", mode: "preview" }),
    makeDeps({ getCallerUser: () => Promise.resolve(null) }),
  );
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "unauthorized");
});

Deno.test("not found → 404 trade_rfq_not_found", async () => {
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }, { rfqRequestId: "rfq-missing", mode: "preview" }),
    makeDeps({ loadRequest: () => Promise.resolve(null) }),
  );
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error, "trade_rfq_not_found");
});

Deno.test("found but caller is not a design-studio comember → SAME 404 (no confirmation)", async () => {
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }, { rfqRequestId: "rfq-1", mode: "preview" }),
    makeDeps({ isDesignStudioComember: () => Promise.resolve(false) }),
  );
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error, "trade_rfq_not_found");
});

Deno.test("preview mode: composes subject/html, never mints/sends/stamps", async () => {
  const log: DepsCallLog = {
    mintTokenCalled: false,
    sendEmailCalled: false,
    stampSentCalled: false,
  };
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }, { rfqRequestId: "rfq-1", mode: "preview" }),
    makeDeps({}, log),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.mode, "preview");
  assertEquals(body.rfqRequestId, "rfq-1");
  assertEquals(body.recipient, "sub@hewn.test");
  assert(typeof body.subject === "string" && body.subject.length > 0);
  assert(typeof body.html === "string" && body.html.length > 0);
  assertFalse(log.mintTokenCalled);
  assertFalse(log.sendEmailCalled);
  assertFalse(log.stampSentCalled);
});

Deno.test("preview mode: recipient may be null (no party email, no override)", async () => {
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }, { rfqRequestId: "rfq-1", mode: "preview" }),
    makeDeps({ loadRequest: () => Promise.resolve({ ...BASE_ROW, party: { email: null } }) }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.recipient, null);
});

Deno.test("send mode, no recipient anywhere → 422 no_recipient", async () => {
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }, { rfqRequestId: "rfq-1", mode: "send" }),
    makeDeps({ loadRequest: () => Promise.resolve({ ...BASE_ROW, party: { email: null } }) }),
  );
  assertEquals(res.status, 422);
  assertEquals((await res.json()).error, "no_recipient");
});

Deno.test("send mode: override recipientEmail wins over the party's email", async () => {
  const log: DepsCallLog = { mintTokenCalled: false, sendEmailCalled: false, stampSentCalled: false };
  const res = await handleTradeRfqSend(
    req(
      "POST",
      { Authorization: "Bearer abc" },
      { rfqRequestId: "rfq-1", mode: "send", recipientEmail: "override@hewn.test" },
    ),
    makeDeps({}, log),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.recipient, "override@hewn.test");
  assertEquals(log.sentEmailOpts?.to, "override@hewn.test");
  assertEquals(log.stampPatch?.partyEmail, "override@hewn.test");
});

Deno.test("send mode: mint failure → 502 mint_failed, never sends or stamps", async () => {
  const log: DepsCallLog = { mintTokenCalled: false, sendEmailCalled: false, stampSentCalled: false };
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }, { rfqRequestId: "rfq-1", mode: "send" }),
    makeDeps({ mintToken: () => Promise.resolve({ error: "no_active_tokens_left" }) }, log),
  );
  assertEquals(res.status, 502);
  assertEquals((await res.json()).error, "mint_failed");
  assertFalse(log.sendEmailCalled);
  assertFalse(log.stampSentCalled);
});

Deno.test("send mode: email builder wires the minted token into the CTA link", async () => {
  const log: DepsCallLog = { mintTokenCalled: false, sendEmailCalled: false, stampSentCalled: false };
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }, { rfqRequestId: "rfq-1", mode: "send" }),
    makeDeps(
      { mintToken: () => Promise.resolve({ token: "tok_unique_9000" }) },
      log,
    ),
  );
  assertEquals(res.status, 200);
  assert(log.sentEmailOpts?.html.includes("https://client.patina.cloud/rfq/tok_unique_9000"));
});

Deno.test("send mode: email send failure (not suppressed) → 502 send_failed, no stamp", async () => {
  const log: DepsCallLog = { mintTokenCalled: false, sendEmailCalled: false, stampSentCalled: false };
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }, { rfqRequestId: "rfq-1", mode: "send" }),
    makeDeps({ sendEmail: () => Promise.resolve({ success: false, error: "provider_down" }) }, log),
  );
  assertEquals(res.status, 502);
  assertEquals((await res.json()).error, "send_failed");
  assertFalse(log.stampSentCalled);
});

Deno.test("send mode: sendEmail throwing → 502 send_failed", async () => {
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }, { rfqRequestId: "rfq-1", mode: "send" }),
    makeDeps({
      sendEmail: () => {
        throw new Error("RESEND_API_KEY missing");
      },
    }),
  );
  assertEquals(res.status, 502);
  assertEquals((await res.json()).error, "send_failed");
});

Deno.test("send mode: suppressed send still stamps, but emailSent is false", async () => {
  const log: DepsCallLog = { mintTokenCalled: false, sendEmailCalled: false, stampSentCalled: false };
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }, { rfqRequestId: "rfq-1", mode: "send" }),
    makeDeps({ sendEmail: () => Promise.resolve({ success: false, suppressed: true }) }, log),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.emailSent, false);
  assert(log.stampSentCalled);
});

Deno.test("send mode: stamp failure → 500 stamp_failed (email already sent)", async () => {
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }, { rfqRequestId: "rfq-1", mode: "send" }),
    makeDeps({ stampSent: () => Promise.resolve({ error: "db unreachable" }) }),
  );
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "stamp_failed");
});

Deno.test("send mode ok, first send: stamps sent_at + party_email, response omits subject/html", async () => {
  const log: DepsCallLog = { mintTokenCalled: false, sendEmailCalled: false, stampSentCalled: false };
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }, { rfqRequestId: "rfq-1", mode: "send" }),
    makeDeps({ loadRequest: () => Promise.resolve({ ...BASE_ROW, sentAt: null }) }, log),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.mode, "send");
  assertEquals(body.recipient, "sub@hewn.test");
  assertEquals(body.emailSent, true);
  assertEquals(body.sentAt, "2026-08-05T12:00:00.000Z");
  assertFalse("subject" in body);
  assertFalse("html" in body);
  assertEquals(log.stampPatch?.sentAt, "2026-08-05T12:00:00.000Z");
  assertEquals(log.stampPatch?.partyEmail, "sub@hewn.test");
  // draft → sent: the one legitimate forward transition.
  assertEquals(log.stampPatch?.status, "sent");
});

Deno.test("send mode ok, resend of a 'sent' ask: sent_at NOT re-stamped, status stays 'sent', response echoes the original sentAt", async () => {
  const log: DepsCallLog = { mintTokenCalled: false, sendEmailCalled: false, stampSentCalled: false };
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }, { rfqRequestId: "rfq-1", mode: "send" }),
    makeDeps(
      { loadRequest: () => Promise.resolve({ ...BASE_ROW, status: "sent", sentAt: "2026-07-01T00:00:00.000Z" }) },
      log,
    ),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.sentAt, "2026-07-01T00:00:00.000Z");
  assertEquals(log.stampPatch?.sentAt, undefined);
  // party_email is still refreshed on a resend — it is the record of where
  // the RFQ was actually delivered, not a one-time draft artifact.
  assertEquals(log.stampPatch?.partyEmail, "sub@hewn.test");
  assertEquals(log.stampPatch?.status, "sent");
});

// ─── Resend never downgrades an answered/closed ask ──────────────────────────

Deno.test("send mode, resend of a 'responded' ask: re-mints + re-emails, but status is NOT downgraded back to 'sent'", async () => {
  const log: DepsCallLog = { mintTokenCalled: false, sendEmailCalled: false, stampSentCalled: false };
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }, { rfqRequestId: "rfq-1", mode: "send" }),
    makeDeps(
      {
        loadRequest: () =>
          Promise.resolve({
            ...BASE_ROW,
            status: "responded",
            sentAt: "2026-07-01T00:00:00.000Z",
          }),
      },
      log,
    ),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.emailSent, true);
  // The resend still happens in full: a fresh token is minted and the party
  // is re-emailed.
  assert(log.mintTokenCalled);
  assert(log.sendEmailCalled);
  assert(log.stampSentCalled);
  // ...but the patch omits status entirely — omitted, not 'responded' —
  // because deps.stampSent's contract is "undefined means leave it alone";
  // the answered state must never be erased back to 'sent'.
  assertEquals(log.stampPatch?.status, undefined);
  // sent_at was already set, so it is not re-stamped either.
  assertEquals(log.stampPatch?.sentAt, undefined);
  // party_email still refreshes — it records where the resend actually went.
  assertEquals(log.stampPatch?.partyEmail, "sub@hewn.test");
});

Deno.test("send mode, resend of a 'closed' ask: re-mints + re-emails, but status is NOT reopened to 'sent'", async () => {
  const log: DepsCallLog = { mintTokenCalled: false, sendEmailCalled: false, stampSentCalled: false };
  const res = await handleTradeRfqSend(
    req("POST", { Authorization: "Bearer abc" }, { rfqRequestId: "rfq-1", mode: "send" }),
    makeDeps(
      {
        loadRequest: () =>
          Promise.resolve({
            ...BASE_ROW,
            status: "closed",
            sentAt: "2026-07-01T00:00:00.000Z",
          }),
      },
      log,
    ),
  );
  assertEquals(res.status, 200);
  assert(log.mintTokenCalled);
  assert(log.sendEmailCalled);
  assertEquals(log.stampPatch?.status, undefined);
});
