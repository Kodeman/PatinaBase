// Deno tests for trade-agreement-send (Wave 3, P14/R16 — the Trade Agreement).
// Run: deno test --allow-all --config supabase/functions/deno.json supabase/functions/trade-agreement-send/
//
// Tests ./lib.ts directly — importing ./index.ts would boot Deno.serve
// (trade-rfq-send / po-send / field-login-token convention). Covers the pure
// helpers (parse, recipient resolution) AND the full request/response contract
// via handleTradeAgreementSend with injected deps (mocked Supabase-shaped
// deps, no network) — auth, the not-found/not-a-member 404 collapse, recipient
// resolution, preview-vs-send, the send-time stamp, and the state ratchet that
// keeps a signed agreement signed.

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  type CallerUser,
  handleTradeAgreementSend,
  parseTradeAgreementSendBody,
  resolveContactRecipient,
  type TradeAgreementRow,
  type TradeAgreementSendDeps,
} from "./lib.ts";

// ─── parseTradeAgreementSendBody — payload validation ────────────────────────

Deno.test("parseTradeAgreementSendBody rejects non-object bodies", () => {
  for (const bad of [null, undefined, 42, "agreement-1", ["agreement-1"]]) {
    const result = parseTradeAgreementSendBody(bad);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, "invalid_body");
  }
});

Deno.test("parseTradeAgreementSendBody requires agreementId", () => {
  for (
    const body of [{}, { agreementId: "" }, { agreementId: "   " }, {
      agreementId: 7,
    }]
  ) {
    const result = parseTradeAgreementSendBody(body);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, "agreementId_required");
  }
});

Deno.test("parseTradeAgreementSendBody rejects unknown modes", () => {
  for (const mode of ["emailify", "mark_sent", "sign"]) {
    const result = parseTradeAgreementSendBody({
      agreementId: "agreement-1",
      mode,
    });
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, "invalid_mode");
  }
});

Deno.test("parseTradeAgreementSendBody defaults mode to send", () => {
  const result = parseTradeAgreementSendBody({ agreementId: "agreement-1" });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.payload.mode, "send");
    assertEquals(result.payload.recipientEmail, undefined);
  }
});

Deno.test("parseTradeAgreementSendBody accepts preview and send", () => {
  for (const mode of ["preview", "send"] as const) {
    const result = parseTradeAgreementSendBody({
      agreementId: "agreement-1",
      mode,
    });
    assertEquals(result.ok, true);
    if (result.ok) assertEquals(result.payload.mode, mode);
  }
});

Deno.test("parseTradeAgreementSendBody trims the id + carries the override recipient", () => {
  const result = parseTradeAgreementSendBody({
    agreementId: " agreement-1 ",
    mode: "send",
    recipientEmail: " sub@hewn.test ",
  });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.payload, {
      agreementId: "agreement-1",
      mode: "send",
      recipientEmail: "sub@hewn.test",
    });
  }
});

Deno.test("parseTradeAgreementSendBody rejects a malformed recipientEmail override", () => {
  for (const recipientEmail of ["", "   ", "not-an-email", 42]) {
    const result = parseTradeAgreementSendBody({
      agreementId: "agreement-1",
      recipientEmail,
    });
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, "invalid_recipient");
  }
});

// ─── resolveContactRecipient — override → contact_email ──────────────────────

Deno.test("resolveContactRecipient prefers the explicit override", () => {
  assertEquals(
    resolveContactRecipient("sub@hewn.test", "override@hewn.test"),
    "override@hewn.test",
  );
});

Deno.test("resolveContactRecipient falls back to the snapshotted contact email", () => {
  assertEquals(resolveContactRecipient(" sub@hewn.test "), "sub@hewn.test");
});

Deno.test("resolveContactRecipient returns null when nothing is usable", () => {
  assertEquals(resolveContactRecipient(null), null);
  assertEquals(resolveContactRecipient(undefined), null);
  assertEquals(resolveContactRecipient("   "), null);
  assertEquals(resolveContactRecipient("   ", "  "), null);
});

// ─── handleTradeAgreementSend — full contract (mocked deps) ──────────────────

const MEMBER: CallerUser = { id: "member-uuid", email: "leah@studio.test" };

const BASE_ROW: TradeAgreementRow = {
  id: "agreement-1",
  studioId: "studio-1",
  title: "Cabinetry & millwork",
  scope: "Fabricate and install the kitchen and mudroom cabinetry.",
  priceCents: 3_800_000,
  currency: "USD",
  schedule: { startOn: "2026-10-05", durationDays: 21, sequencing: null },
  retainageBps: 500,
  payWhenPaidDays: 7,
  insuranceCertificateRequired: true,
  lienWaiverPolicy: "conditional_then_unconditional",
  contactId: "contact-1",
  contactDisplayName: "Hewn Woodworks",
  contactEmail: "sub@hewn.test",
  createdBy: "member-uuid",
  state: "draft",
  sentAt: null,
};

interface DepsCallLog {
  mintTokenCalled: boolean;
  sendEmailCalled: boolean;
  stampSentCalled: boolean;
  stampPatch?: { contactEmail: string; sentAt?: string; state?: "sent" };
  sentEmailOpts?: {
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
    metadata: Record<string, unknown>;
  };
  studioIdentityArgs?: { studioId: string; createdBy: string | null };
}

function makeDeps(
  overrides: Partial<TradeAgreementSendDeps> = {},
  log: Partial<DepsCallLog> = {},
): TradeAgreementSendDeps {
  return {
    getCallerUser: () => Promise.resolve(MEMBER),
    loadAgreement: () => Promise.resolve({ ...BASE_ROW }),
    isActiveStudioMember: () => Promise.resolve(true),
    resolveStudioIdentity: (studioId, createdBy) => {
      (log as DepsCallLog).studioIdentityArgs = { studioId, createdBy };
      return Promise.resolve({
        studioName: "Middle West Studio",
        designerName: "Leah Rowe",
        designerEmail: "leah@studio.test",
      });
    },
    mintToken: () => {
      (log as DepsCallLog).mintTokenCalled = true;
      return Promise.resolve({ token: "tok_abc123" });
    },
    sendEmail: (opts) => {
      (log as DepsCallLog).sendEmailCalled = true;
      (log as DepsCallLog).sentEmailOpts = opts;
      return Promise.resolve({ success: true });
    },
    stampSent: (_id, patch) => {
      (log as DepsCallLog).stampSentCalled = true;
      (log as DepsCallLog).stampPatch = patch;
      return Promise.resolve({});
    },
    clientPortalUrl: "https://client.patina.cloud",
    now: () => "2026-09-07T12:00:00.000Z",
    ...overrides,
  };
}

function freshLog(): DepsCallLog {
  return {
    mintTokenCalled: false,
    sendEmailCalled: false,
    stampSentCalled: false,
  };
}

function req(
  method: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Request {
  return new Request("http://localhost/functions/v1/trade-agreement-send", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

Deno.test("OPTIONS → 200 with CORS headers (preflight)", async () => {
  const res = await handleTradeAgreementSend(req("OPTIONS"), makeDeps());
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("non-POST → 405", async () => {
  const res = await handleTradeAgreementSend(req("GET"), makeDeps());
  assertEquals(res.status, 405);
  assertEquals((await res.json()).error, "method_not_allowed");
});

Deno.test("unparseable body → 400 invalid_body", async () => {
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }),
    makeDeps(),
  );
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "invalid_body");
});

Deno.test("body parse errors surface as their own 400 codes", async () => {
  const cases: Array<[unknown, string]> = [
    [{}, "agreementId_required"],
    [{ agreementId: "agreement-1", mode: "shred" }, "invalid_mode"],
    [
      { agreementId: "agreement-1", recipientEmail: "nope" },
      "invalid_recipient",
    ],
  ];
  for (const [body, expected] of cases) {
    const res = await handleTradeAgreementSend(
      req("POST", { Authorization: "Bearer abc" }, body),
      makeDeps(),
    );
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, expected);
  }
});

Deno.test("unauthenticated caller → 401", async () => {
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "preview",
    }),
    makeDeps({ getCallerUser: () => Promise.resolve(null) }),
  );
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "unauthorized");
});

Deno.test("not found → 404 trade_agreement_not_found", async () => {
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-missing",
      mode: "preview",
    }),
    makeDeps({ loadAgreement: () => Promise.resolve(null) }),
  );
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error, "trade_agreement_not_found");
});

Deno.test("found but caller is not an active studio member → SAME 404, no leak", async () => {
  const log = freshLog();
  const missing = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "send",
    }),
    makeDeps({ loadAgreement: () => Promise.resolve(null) }, log),
  );
  const foreign = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "send",
    }),
    makeDeps({ isActiveStudioMember: () => Promise.resolve(false) }, log),
  );
  assertEquals(missing.status, foreign.status);
  assertEquals(await missing.json(), await foreign.json());
  assertEquals(foreign.status, 404);
  // A foreign caller mints nothing and mails nothing.
  assertFalse(log.mintTokenCalled);
  assertFalse(log.sendEmailCalled);
  assertFalse(log.stampSentCalled);
});

Deno.test("preview mode: composes subject/html, never mints/sends/stamps", async () => {
  const log = freshLog();
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "preview",
    }),
    makeDeps({}, log),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.mode, "preview");
  assertEquals(body.agreementId, "agreement-1");
  assertEquals(body.recipient, "sub@hewn.test");
  assert(typeof body.subject === "string" && body.subject.length > 0);
  assert(typeof body.html === "string" && body.html.length > 0);
  // The placeholder CTA is inert — a preview never hands out a live link.
  assert(body.html.includes("https://client.patina.cloud/trade/preview"));
  assertFalse(log.mintTokenCalled);
  assertFalse(log.sendEmailCalled);
  assertFalse(log.stampSentCalled);
});

Deno.test("preview mode: recipient may be null (no contact email, no override)", async () => {
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "preview",
    }),
    makeDeps({
      loadAgreement: () =>
        Promise.resolve({ ...BASE_ROW, contactEmail: null }),
    }),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).recipient, null);
});

Deno.test("send mode, no recipient anywhere → 422 no_recipient", async () => {
  const log = freshLog();
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "send",
    }),
    makeDeps(
      {
        loadAgreement: () =>
          Promise.resolve({ ...BASE_ROW, contactEmail: null }),
      },
      log,
    ),
  );
  assertEquals(res.status, 422);
  assertEquals((await res.json()).error, "no_recipient");
  assertFalse(log.mintTokenCalled);
  assertFalse(log.stampSentCalled);
});

Deno.test("send mode: override recipientEmail wins over the stored contact email", async () => {
  const log = freshLog();
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "send",
      recipientEmail: "override@hewn.test",
    }),
    makeDeps({}, log),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).recipient, "override@hewn.test");
  assertEquals(log.sentEmailOpts?.to, "override@hewn.test");
  assertEquals(log.stampPatch?.contactEmail, "override@hewn.test");
});

Deno.test("send mode: mint failure → 502 mint_failed, never sends or stamps", async () => {
  const log = freshLog();
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "send",
    }),
    makeDeps(
      { mintToken: () => Promise.resolve({ error: "no_token" }) },
      log,
    ),
  );
  assertEquals(res.status, 502);
  assertEquals((await res.json()).error, "mint_failed");
  assertFalse(log.sendEmailCalled);
  assertFalse(log.stampSentCalled);
});

Deno.test("send mode: exactly one token is minted, and it is the one in the link", async () => {
  const log = freshLog();
  let mints = 0;
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "send",
    }),
    makeDeps(
      {
        mintToken: () => {
          mints += 1;
          log.mintTokenCalled = true;
          return Promise.resolve({ token: "tok_unique_9000" });
        },
      },
      log,
    ),
  );
  assertEquals(res.status, 200);
  assertEquals(mints, 1);
  assert(
    log.sentEmailOpts?.html.includes(
      "https://client.patina.cloud/trade/tok_unique_9000",
    ),
  );
  // The live link is never echoed back into the JSON response.
  const body = await res.json();
  assertFalse("subject" in body);
  assertFalse("html" in body);
  assertEquals(JSON.stringify(body).includes("tok_unique_9000"), false);
});

Deno.test("send mode: the letter goes through the injected chokepoint, reply-to the studio", async () => {
  const log = freshLog();
  await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "send",
    }),
    makeDeps({}, log),
  );
  assert(log.sendEmailCalled);
  assertEquals(log.sentEmailOpts?.replyTo, "leah@studio.test");
  assertEquals(log.sentEmailOpts?.metadata, {
    trade_agreement_id: "agreement-1",
    contact_id: "contact-1",
  });
  // The studio identity is resolved from the agreement's own studio and its
  // author — never from a project (R13).
  assertEquals(log.studioIdentityArgs, {
    studioId: "studio-1",
    createdBy: "member-uuid",
  });
});

Deno.test("send mode: email send failure (not suppressed) → 502 send_failed, no stamp", async () => {
  const log = freshLog();
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "send",
    }),
    makeDeps(
      {
        sendEmail: () =>
          Promise.resolve({ success: false, error: "provider_down" }),
      },
      log,
    ),
  );
  assertEquals(res.status, 502);
  assertEquals((await res.json()).error, "send_failed");
  assertFalse(log.stampSentCalled);
});

Deno.test("send mode: sendEmail throwing → 502 send_failed", async () => {
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "send",
    }),
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
  const log = freshLog();
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "send",
    }),
    makeDeps(
      { sendEmail: () => Promise.resolve({ success: false, suppressed: true }) },
      log,
    ),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).emailSent, false);
  assert(log.stampSentCalled);
});

Deno.test("send mode: stamp failure → 500 stamp_failed (the email already went)", async () => {
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "send",
    }),
    makeDeps({ stampSent: () => Promise.resolve({ error: "db unreachable" }) }),
  );
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "stamp_failed");
});

Deno.test("send mode, first send: stamps sent_at + contact_email and moves draft → sent", async () => {
  const log = freshLog();
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "send",
    }),
    makeDeps(
      { loadAgreement: () => Promise.resolve({ ...BASE_ROW, sentAt: null }) },
      log,
    ),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.mode, "send");
  assertEquals(body.recipient, "sub@hewn.test");
  assertEquals(body.emailSent, true);
  assertEquals(body.sentAt, "2026-09-07T12:00:00.000Z");
  assertEquals(body.state, "sent");
  assertEquals(log.stampPatch?.sentAt, "2026-09-07T12:00:00.000Z");
  assertEquals(log.stampPatch?.contactEmail, "sub@hewn.test");
  assertEquals(log.stampPatch?.state, "sent");
});

Deno.test("send mode, resend of a 'sent' agreement: sent_at is NOT re-stamped", async () => {
  const log = freshLog();
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "send",
    }),
    makeDeps(
      {
        loadAgreement: () =>
          Promise.resolve({
            ...BASE_ROW,
            state: "sent",
            sentAt: "2026-09-01T00:00:00.000Z",
          }),
      },
      log,
    ),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).sentAt, "2026-09-01T00:00:00.000Z");
  assertEquals(log.stampPatch?.sentAt, undefined);
  // contact_email still refreshes — it records where the resend actually went.
  assertEquals(log.stampPatch?.contactEmail, "sub@hewn.test");
  assertEquals(log.stampPatch?.state, "sent");
});

// ─── The state ratchet: a signed agreement stays signed ──────────────────────

Deno.test("send mode, resend of a 'signed' agreement: re-mints + re-emails, never downgrades state", async () => {
  const log = freshLog();
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "send",
    }),
    makeDeps(
      {
        loadAgreement: () =>
          Promise.resolve({
            ...BASE_ROW,
            state: "signed",
            sentAt: "2026-09-01T00:00:00.000Z",
          }),
      },
      log,
    ),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.emailSent, true);
  // The resend still happens in full — the sub lost the email and asked again.
  assert(log.mintTokenCalled);
  assert(log.sendEmailCalled);
  assert(log.stampSentCalled);
  // ...but the patch omits state entirely — omitted, not 'signed' — because
  // deps.stampSent's contract is "undefined means leave it alone"; a signed
  // agreement is superseded by a new one, never re-opened by an email.
  assertEquals(log.stampPatch?.state, undefined);
  assertEquals(log.stampPatch?.sentAt, undefined);
  assertEquals(body.state, "signed");
  // And the letter reads as a receipt, not a second ask.
  assert(log.sentEmailOpts?.subject.startsWith("Your signed Trade Agreement"));
  assert(log.sentEmailOpts?.html.includes("Open your agreement"));
});

Deno.test("send mode, resend of a 'void' agreement: state is not revived to 'sent'", async () => {
  const log = freshLog();
  const res = await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "send",
    }),
    makeDeps(
      {
        loadAgreement: () =>
          Promise.resolve({
            ...BASE_ROW,
            state: "void",
            sentAt: "2026-09-01T00:00:00.000Z",
          }),
      },
      log,
    ),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).state, "void");
  assertEquals(log.stampPatch?.state, undefined);
});

// ─── The sub's letter never carries the client's side (R13) ──────────────────

Deno.test("nothing outside TradeAgreementRow can reach the letter", async () => {
  const log = freshLog();
  // A row carrying fields the DTO does not declare — the shape a careless
  // widening of loadAgreement's select would produce.
  const leaky = {
    ...BASE_ROW,
    projectName: "Halvorsen kitchen and mudroom",
    clientName: "Dana Halvorsen",
    gmpCents: 8_413_400,
    scheduleOfValues: [{ label: "Cabinetry", cents: 4_484_000 }],
  } as unknown as TradeAgreementRow;
  await handleTradeAgreementSend(
    req("POST", { Authorization: "Bearer abc" }, {
      agreementId: "agreement-1",
      mode: "send",
    }),
    makeDeps({ loadAgreement: () => Promise.resolve(leaky) }, log),
  );
  const letter = `${log.sentEmailOpts?.subject} ${log.sentEmailOpts?.html}`;
  for (
    const forbidden of [
      "Halvorsen",
      "Dana",
      "8413400",
      "84,134",
      "4,484",
      "Cabinetry & millwork schedule",
    ]
  ) {
    assertEquals(
      letter.includes(forbidden),
      false,
      `expected no "${forbidden}" in the sub's letter`,
    );
  }
  // Their own price is there, and it is the only figure.
  assert(letter.includes("$38,000.00"));
  assertEquals((letter.match(/\$[\d,]+(?:\.\d{2})?/g) ?? []).length, 1);
});
