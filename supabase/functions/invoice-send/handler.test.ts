import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createInvoiceSendHandler } from "./handler.ts";

// deno-lint-ignore-file no-explicit-any

const CALLER_JWT = "Bearer designer-jwt";

interface World {
  invoice: Record<string, any>;
  canManage: boolean;
  capabilityError: string | null;
  issueError: string | null;
  /** The SQLSTATE issue_invoice refused with; empty, as supabase-js reports a lost request. */
  issueErrorCode: string;
  /** The issue commits (status 'sent'), then its reply is lost to a transport error. */
  issueReplyLost: boolean;
  /** Reading the invoice back after the issue fails with this message. */
  rereadError: string | null;
  /** Another writer's change that commits just before the issue locks the row. */
  movedFirst: Record<string, unknown> | null;
  profile: { full_name: string | null; email: string | null } | null;
  /** The preferred-profile read fails with this message. */
  profileError: string | null;
  designerClients: Array<Record<string, string | null>>;
  sendFails: boolean;
  /** Every outward call, in order: `caller:<rpc>` runs as the caller's JWT, `admin:<rpc>` as the service role. */
  calls: string[];
  callerAuthorizations: string[];
  sentTo: string[];
}

function draftWorld(overrides: Partial<World> = {}): World {
  return {
    invoice: {
      id: "inv-1",
      designer_id: "designer-1",
      client_id: null,
      project_id: "project-1",
      studio_id: "studio-1",
      title: "Deposit",
      invoice_number: null,
      status: "draft",
      total_cents: 120000,
      amount_paid_cents: 0,
      currency: "usd",
      due_date: null,
      sent_at: null,
      project: { id: "project-1", name: "Reyes house", client_id: "client-1" },
      client: null,
      designer: {
        id: "designer-1",
        full_name: "Leah Park",
        business_name: null,
        email: "leah@example.com",
      },
    },
    canManage: true,
    capabilityError: null,
    issueError: null,
    issueErrorCode: "",
    issueReplyLost: false,
    rereadError: null,
    movedFirst: null,
    profile: null,
    profileError: null,
    designerClients: [],
    sendFails: false,
    calls: [],
    callerAuthorizations: [],
    sentTo: [],
    ...overrides,
  };
}

const withRecipient = [
  {
    designer_id: "designer-1",
    client_id: "client-1",
    client_email: "elena@example.com",
    client_name: "Elena Reyes",
    updated_at: "2026-09-30T10:00:00Z",
    created_at: "2026-09-30T10:00:00Z",
    id: "dc-1",
  },
];

const noEmail = [{ ...withRecipient[0], client_email: null }];

function chain(rows: Array<Record<string, string | null>>, error: string | null = null) {
  let found = [...rows];
  const query: any = {
    select: () => query,
    eq(column: string, value: string) {
      found = found.filter((row) => row[column] === value);
      return query;
    },
    order: () => query,
    limit: () => query,
    maybeSingle: () =>
      Promise.resolve(error ? { data: null, error: { message: error } } : { data: found[0] ?? null, error: null }),
  };
  return query;
}

function handlerFor(world: World) {
  const admin = {
    rpc(name: string) {
      world.calls.push(`admin:${name}`);
      if (name === "invoice_letter_must_hold") return Promise.resolve({ data: false, error: null });
      if (name === "resolve_studio_identity") return Promise.resolve({ data: [], error: null });
      if (name === "issue_invoice") {
        return Promise.resolve({ data: null, error: { message: "permission denied" } });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from(table: string) {
      if (table === "invoices") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve(
                  world.rereadError && world.calls.includes("caller:issue_invoice")
                    ? { data: null, error: { message: world.rereadError } }
                    : { data: structuredClone(world.invoice), error: null },
                ),
            }),
          }),
          update: () => ({
            eq: () => ({
              is: () => {
                world.calls.push("admin:stamp_sent_at");
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }
      if (table === "profiles") {
        return chain(world.profile ? [world.profile as Record<string, string | null>] : [], world.profileError);
      }
      if (table === "designer_clients") return chain(world.designerClients);
      throw new Error(`unexpected table ${table}`);
    },
  };

  return createInvoiceSendHandler({
    getCallerUser: (authorization) =>
      Promise.resolve(authorization === CALLER_JWT ? { id: "designer-1" } : null),
    callerClient(authorization) {
      return {
        rpc(name: string, args: Record<string, unknown>) {
          world.calls.push(`caller:${name}`);
          world.callerAuthorizations.push(authorization);
          if (name === "can_manage_invoice") {
            return Promise.resolve(
              world.capabilityError
                ? { data: null, error: { message: world.capabilityError } }
                : { data: world.canManage, error: null },
            );
          }
          if (name === "issue_invoice") {
            assertEquals(args.p_invoice_id, world.invoice.id);
            if (world.movedFirst) Object.assign(world.invoice, world.movedFirst);
            if (world.issueError) {
              return Promise.resolve({
                data: null,
                error: { message: world.issueError, code: world.issueErrorCode },
              });
            }
            if (world.invoice.status !== "draft") {
              return Promise.resolve({ data: null, error: { message: "Invoice is not a draft" } });
            }
            Object.assign(world.invoice, {
              status: "sent",
              invoice_number: "INV-1071",
              sent_at: "2026-10-17T12:00:00Z",
            });
            if (world.issueReplyLost) {
              return Promise.resolve({ data: null, error: { message: "TypeError: Failed to fetch" } });
            }
            const { project: _p, client: _c, designer: _d, ...row } = world.invoice;
            return Promise.resolve({ data: structuredClone(row), error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
    admin,
    sendCompliantEmail(_admin, options) {
      world.calls.push("send");
      world.sentTo.push(options.to);
      return Promise.resolve(
        world.sendFails
          ? { success: false, error: "provider down" }
          : { success: true, id: "provider-1", logId: "log-1" },
      );
    },
    notifyClientAttention: () => Promise.resolve({ ok: true }),
    clientPortalUrl: "https://client.example.test",
  });
}

async function post(world: World, body: Record<string, unknown>, authorization: string | null = CALLER_JWT) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authorization) headers.Authorization = authorization;
  const res = await handlerFor(world)(
    new Request("http://localhost/invoice-send", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

Deno.test("issue-first: a draft with no address anywhere is 422 no_recipient, still a draft, and never issued", async () => {
  const world = draftWorld({ designerClients: noEmail });
  const { status, body } = await post(world, { invoiceId: "inv-1", issue: true });

  assertEquals(status, 422);
  assertEquals(body.error, "no_recipient");
  assertEquals(world.invoice.status, "draft");
  assertEquals(world.calls.filter((call) => call.endsWith(":issue_invoice")), []);
  assertEquals(world.sentTo, []);
});

Deno.test("issue-first: a draft with an address is issued as the caller, then sent to that same address", async () => {
  const world = draftWorld({ designerClients: withRecipient });
  const { status, body } = await post(world, { invoiceId: "inv-1", issue: true });

  assertEquals(status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.issued, true);
  assertEquals(body.invoiceNumber, "INV-1071");
  assertEquals(body.recipient, "elena@example.com");
  assertEquals(world.invoice.status, "sent");
  assertEquals(world.sentTo, ["elena@example.com"]);
  // The issue ran on the caller's JWT, after the capability check and before the letter.
  const issueAt = world.calls.indexOf("caller:issue_invoice");
  assert(issueAt > world.calls.indexOf("caller:can_manage_invoice"));
  assert(issueAt < world.calls.indexOf("send"));
  assertEquals(world.calls.includes("admin:issue_invoice"), false);
  assertEquals(world.callerAuthorizations, [CALLER_JWT, CALLER_JWT]);
});

Deno.test("issue-first: a refused issue is 409 issue_failed and nothing is sent", async () => {
  const world = draftWorld({
    designerClients: withRecipient,
    issueError: "Invoice has no lines",
    issueErrorCode: "P0001",
  });
  const { status, body } = await post(world, { invoiceId: "inv-1", issue: true });

  assertEquals(status, 409);
  assertEquals(body.error, "issue_failed");
  assertEquals(body.detail, "Invoice has no lines");
  assertEquals(world.sentTo, []);
});

// SQ-1272 F1 — an issue error is not proof nothing issued: the reply may be
// lost after the commit. The invoice is read back, and only a draft is
// issue_failed. Issued, no letter goes (it may be another send's issue, which
// sent its own), so the client is never written to twice.
Deno.test("issue-first: an issue that commits and loses its reply reads back issued — issued_unsent, its number, no letter", async () => {
  const world = draftWorld({ designerClients: withRecipient, issueReplyLost: true });
  const { status, body } = await post(world, { invoiceId: "inv-1", issue: true });

  assertEquals(status, 409);
  assertEquals(body.error, "issued_unsent");
  assertEquals(body.issued, true);
  assertEquals(body.invoiceNumber, "INV-1071");
  assertEquals(world.invoice.status, "sent");
  assertEquals(world.sentTo, []);
});

Deno.test("issue-first: an issue error whose read-back fails is 503 issue_unknown, never issue_failed, nothing sent", async () => {
  const world = draftWorld({
    designerClients: withRecipient,
    issueError: "TypeError: Failed to fetch",
    rereadError: "connection reset",
  });
  const { status, body } = await post(world, { invoiceId: "inv-1", issue: true });

  assertEquals(status, 503);
  assertEquals(body.error, "issue_unknown");
  assertEquals("issued" in body, false);
  assertEquals(world.sentTo, []);
});

// SQ-1282 F2 — a lost reply with the invoice still a draft on the re-read:
// the issue may commit after that read, so the outcome is unknown.
Deno.test("issue-first: a lost issue reply that reads back a draft is 503 issue_unknown, never issue_failed, nothing sent", async () => {
  const world = draftWorld({ designerClients: withRecipient, issueError: "TypeError: Failed to fetch" });
  const { status, body } = await post(world, { invoiceId: "inv-1", issue: true });

  assertEquals(world.invoice.status, "draft");
  assertEquals(status, 503);
  assertEquals(body.error, "issue_unknown");
  assertEquals("issued" in body, false);
  assertEquals(world.sentTo, []);
});

// SQ-1286 F2 — a failed issue reads back issued_unsent only as `sent`, the
// status issue_invoice leaves; `issued: true` is the folio's "Resend to retry".
Deno.test("issue-first: a draft voided before the issue reads back void — 409 invoice_void, never issued, nothing sent", async () => {
  const world = draftWorld({ designerClients: withRecipient, movedFirst: { status: "void" } });
  const { status, body } = await post(world, { invoiceId: "inv-1", issue: true });

  assertEquals(world.calls.includes("caller:issue_invoice"), true);
  assertEquals(status, 409);
  assertEquals(body.error, "invoice_void");
  assertEquals(body.detail, "A voided invoice cannot be sent.");
  assertEquals("issued" in body, false);
  assertEquals(world.calls.includes("send"), false);
  assertEquals(world.sentTo, []);
});

// SQ-1289 F1 — a stale draft folio sent after a void: the first read finds it
// void, and that answers invoice_void, never "already issued".
Deno.test("issue-first: a draft already void on the first read is 409 invoice_void, never issued, nothing sent", async () => {
  const world = draftWorld({ designerClients: withRecipient });
  world.invoice.status = "void";
  const { status, body } = await post(world, { invoiceId: "inv-1", issue: true });

  assertEquals(status, 409);
  assertEquals(body.error, "invoice_void");
  assertEquals(body.detail, "A voided invoice cannot be sent.");
  assertEquals("issued" in body, false);
  assertEquals(world.calls.includes("caller:issue_invoice"), false);
  assertEquals(world.calls.includes("send"), false);
  assertEquals(world.sentTo, []);
});

for (const [paid, amountPaid] of [["paid", 120000], ["partially_paid", 40000]] as const) {
  Deno.test(`issue-first: a draft issued and ${paid} elsewhere reads back ${paid} — 409 invoice_not_draft, never issued_unsent, nothing sent`, async () => {
    const world = draftWorld({
      designerClients: withRecipient,
      movedFirst: { status: paid, invoice_number: "INV-1070", amount_paid_cents: amountPaid },
    });
    const { status, body } = await post(world, { invoiceId: "inv-1", issue: true });

    assertEquals(world.calls.includes("caller:issue_invoice"), true);
    assertEquals(status, 409);
    assertEquals(body.error, "invoice_not_draft");
    assertEquals(body.detail, "This invoice was already issued.");
    assertEquals("issued" in body, false);
    assertEquals(world.calls.includes("send"), false);
    assertEquals(world.sentTo, []);
  });
}

Deno.test("issue-first: a send that fails after the issue says the invoice was issued, and its number", async () => {
  const world = draftWorld({ designerClients: withRecipient, sendFails: true });
  const { status, body } = await post(world, { invoiceId: "inv-1", issue: true });

  assertEquals(status, 502);
  assertEquals(body.error, "send_failed");
  assertEquals(body.issued, true);
  assertEquals(body.invoiceNumber, "INV-1071");
  assertEquals(world.invoice.status, "sent");
});

Deno.test("issue-first only issues a draft: an issued invoice is 409 invoice_not_draft, never issued again", async () => {
  const world = draftWorld({ designerClients: withRecipient });
  Object.assign(world.invoice, { status: "sent", invoice_number: "INV-1070" });
  const { status, body } = await post(world, { invoiceId: "inv-1", issue: true });

  assertEquals(status, 409);
  assertEquals(body.error, "invoice_not_draft");
  assertEquals(world.calls.includes("caller:issue_invoice"), false);
  assertEquals(world.sentTo, []);
});

Deno.test("issue-first never rides a reminder", async () => {
  const world = draftWorld({ designerClients: withRecipient });
  const { status, body } = await post(world, { invoiceId: "inv-1", issue: true, type: "reminder" });

  assertEquals(status, 400);
  assertEquals(body.error, "invalid_body");
  assertEquals(world.invoice.status, "draft");
  assertEquals(world.calls, []);
});

Deno.test("unchanged: an issued invoice sends as before, with no issue and no issued field", async () => {
  const world = draftWorld({ designerClients: withRecipient });
  Object.assign(world.invoice, { status: "sent", invoice_number: "INV-1070", sent_at: "2026-10-01T00:00:00Z" });
  const { status, body } = await post(world, { invoiceId: "inv-1" });

  assertEquals(status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.recipient, "elena@example.com");
  assertEquals("issued" in body, false);
  assertEquals(world.calls.includes("caller:issue_invoice"), false);
  assertEquals(world.sentTo, ["elena@example.com"]);
});

Deno.test("unchanged: a draft without issue is still 409 invoice_not_issued", async () => {
  const world = draftWorld({ designerClients: withRecipient });
  const { status, body } = await post(world, { invoiceId: "inv-1" });

  assertEquals(status, 409);
  assertEquals(body.error, "invoice_not_issued");
  assertEquals(world.invoice.status, "draft");
  assertEquals(world.calls.includes("caller:issue_invoice"), false);
  assertEquals(world.sentTo, []);
});

for (const issue of [true, false]) {
  const mode = issue ? "issue-first" : "send";
  Deno.test(`unchanged authorization (${mode}): no Authorization header and an unconfirmed caller are 401`, async () => {
    for (const authorization of [null, "Bearer someone-else"]) {
      const world = draftWorld({ designerClients: withRecipient });
      const { status, body } = await post(world, { invoiceId: "inv-1", issue }, authorization);
      assertEquals(status, 401);
      assertEquals(body.error, "unauthorized");
      assertEquals(world.calls, []);
      assertEquals(world.invoice.status, "draft");
    }
  });

  Deno.test(`unchanged authorization (${mode}): a caller who cannot manage the invoice gets 404, nothing issued or sent`, async () => {
    const world = draftWorld({ designerClients: withRecipient, canManage: false });
    const { status, body } = await post(world, { invoiceId: "inv-1", issue });
    assertEquals(status, 404);
    assertEquals(body.error, "invoice_not_found");
    assertEquals(world.calls, ["caller:can_manage_invoice"]);
    assertEquals(world.invoice.status, "draft");
  });

  Deno.test(`unchanged authorization (${mode}): a failed capability check is 500 authorization_failed`, async () => {
    const world = draftWorld({ designerClients: withRecipient, capabilityError: "boom" });
    const { status, body } = await post(world, { invoiceId: "inv-1", issue });
    assertEquals(status, 500);
    assertEquals(body.error, "authorization_failed");
    assertEquals(world.calls, ["caller:can_manage_invoice"]);
    assertEquals(world.invoice.status, "draft");
  });
}

// SQ-1262 F5 — the preferred address is the signed-up client's profile. A
// failed read of it is an unknown address, not an absent one: it never falls
// back to the household row (an older address may still stand there), and
// nothing issues or sends.
Deno.test("issue-first: a failed preferred-profile read is 500 lookup_failed, never issued, never sent to the fallback", async () => {
  const world = draftWorld({ designerClients: withRecipient, profileError: "connection reset" });
  const { status, body } = await post(world, { invoiceId: "inv-1", issue: true });

  assertEquals(status, 500);
  assertEquals(body.error, "lookup_failed");
  assertEquals("issued" in body, false);
  assertEquals(world.invoice.status, "draft");
  assertEquals(world.calls.filter((call) => call.endsWith(":issue_invoice")), []);
  assertEquals(world.sentTo, []);
});

Deno.test("send: a failed preferred-profile read is 500 lookup_failed and mails nothing to the fallback", async () => {
  const world = draftWorld({ designerClients: withRecipient, profileError: "connection reset" });
  Object.assign(world.invoice, { status: "sent", invoice_number: "INV-1070", sent_at: "2026-10-01T00:00:00Z" });
  const { status, body } = await post(world, { invoiceId: "inv-1" });

  assertEquals(status, 500);
  assertEquals(body.error, "lookup_failed");
  assertEquals(world.sentTo, []);
});

Deno.test("issue-first: a profile read that answers with no address still falls back to the household's", async () => {
  const world = draftWorld({
    designerClients: withRecipient,
    profile: { id: "client-1", full_name: "Elena Reyes", email: null } as World["profile"],
  });
  const { status, body } = await post(world, { invoiceId: "inv-1", issue: true });

  assertEquals(status, 200);
  assertEquals(body.issued, true);
  assertEquals(world.sentTo, ["elena@example.com"]);
});
