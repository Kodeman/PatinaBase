// CRM-12 — email channel status, suppression and unsubscribe for people with
// no Patina account.
//
// Two halves, both pure enough to drive with a fake client:
//   · the SEND gate (_shared/send-email.ts): a dead or unsubscribed channel
//     refuses the letter, a live one earns List-Unsubscribe headers, a
//     deliverability ref on the notification_log row, and an out touch.
//   · the WEBHOOK write-back (resend-webhook/channel-status.ts): a bounce or a
//     complaint lands on every row carrying the address, worst-first.
//
//   deno test --allow-all --config supabase/functions/deno.json \
//     supabase/functions/_tests/email-channel-status.test.ts

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  channelRefusesSend,
  prepareCompliantEmail,
  resolveContactChannel,
  sendCompliantEmail,
} from "../_shared/send-email.ts";
import {
  applyChannelStatus,
  channelStatusForEvent,
  type ChannelStatusClient,
  isSuppressingStatus,
  type ProfileSuppressionClient,
  suppressProfilesForAddress,
} from "../resend-webhook/channel-status.ts";

Deno.env.set("UNSUBSCRIBE_TOKEN_SECRET", "test-secret-for-channel-tokens");
Deno.env.set("RESEND_API_KEY", "re_test");

const CHANNEL_ID = "44444444-4444-4444-8444-444444444444";
const OWNER_ID = "55555555-5555-4555-8555-555555555555";
/** The studio the letter is FROM, and a second studio carrying the same
 *  address on its own card — the ordinary case D-6 is built on (B-2). */
const STUDIO_A = "11111111-1111-4111-8111-111111111111";
const STUDIO_B = "22222222-2222-4222-8222-222222222222";
const B_CHANNEL_ID = "66666666-6666-4666-8666-666666666666";
const B_OWNER_ID = "77777777-7777-4777-8777-777777777777";

/**
 * The fixture shape, which is NOT the wire shape.
 *
 * `studio_contact_channels` has NO `organization_id` column — the studio hangs
 * off the OWNING CARD (`owner_id -> studio_contacts.organization_id`), which is
 * also how 00593's RLS reads it. An earlier version of this double carried a
 * flat `organization_id` that the real table does not have, so 15 green tests
 * sat on top of a query that raised 42703 against the real database on every
 * call (W4 r2 BLOCKING W4R2-1). The double now projects the fixture into the
 * shape PostgREST actually answers with, and `CHANNEL_COLUMNS` below pins the
 * real column list so a flat select can never go green again.
 */
interface ChannelRow {
  id: string;
  owner_type: string;
  owner_id: string;
  /** Fixture convenience: projected onto the embedded card by the double. */
  organization_id?: string | null;
  value: string;
  status: string;
  channel_kind: string;
  status_at?: string | null;
}

/** Every column `\d public.studio_contact_channels` actually has (00593). */
const CHANNEL_COLUMNS = new Set([
  "id",
  "owner_type",
  "owner_id",
  "channel_kind",
  "value",
  "label",
  "sms_capable",
  "verified",
  "verified_at",
  "preferred",
  "status",
  "status_at",
  "created_by",
  "created_at",
  "updated_at",
]);

interface Recorded {
  logs: Array<Record<string, unknown>>;
  updates: Array<Record<string, unknown>>;
  rpcs: Array<{ name: string; args: Record<string, unknown> }>;
  lookups: Array<Record<string, string>>;
  /** Every `select(...)` string the resolver sent to the channel table. */
  selects: string[];
}

/** The narrow surface send-email.ts touches, with the channel table in it. */
function emailClient(rows: ChannelRow[], recorded: Recorded) {
  return {
    from(table: string) {
      if (table === "studio_contact_channels") {
        let value = "";
        let kinds: string[] = [];
        // Every eq() is recorded by COLUMN: the lookup is scoped by address and
        // the resolver must never be able to narrow it by tenant (B-2 keeps the
        // address-wide verdict).
        const eqs: Record<string, string> = {};
        const q = {
          select(cols?: string) {
            if (cols) recorded.selects.push(cols);
            return q;
          },
          eq(col: string, v: string) {
            eqs[col] = v;
            if (col === "value") value = v;
            return q;
          },
          in(_col: string, vals: string[]) {
            kinds = vals;
            return q;
          },
          then(resolve: (r: { data: unknown; error: unknown }) => unknown) {
            recorded.lookups.push({ ...eqs });
            return Promise.resolve(resolve({
              data: rows
                .filter((r) =>
                  r.value === value && kinds.includes(r.channel_kind)
                )
                // The wire shape: the studio arrives on the EMBEDDED card, not
                // as a column of this table (W4 r2 BLOCKING W4R2-1).
                .map(({ organization_id, ...rest }) => ({
                  ...rest,
                  studio_contacts: {
                    organization_id: organization_id ?? null,
                  },
                })),
              error: null,
            }));
          },
        };
        return q;
      }
      // notification_log and profiles
      return {
        insert(payload: Record<string, unknown>) {
          recorded.logs.push(payload);
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: { id: "log-1" }, error: null });
                },
              };
            },
            then(resolve: (r: { data: unknown; error: unknown }) => unknown) {
              return Promise.resolve(resolve({ data: null, error: null }));
            },
          };
        },
        update(payload: Record<string, unknown>) {
          recorded.updates.push(payload);
          return {
            eq() {
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        select() {
          const q = {
            eq: () => q,
            in: () => q,
            gte: () => Promise.resolve({ count: 0, error: null }),
            maybeSingle: () =>
              Promise.resolve({ data: { email_suppressed: false }, error: null }),
          };
          return q;
        },
      };
    },
    rpc(name: string, args: Record<string, unknown>) {
      recorded.rpcs.push({ name, args });
      return Promise.resolve({ data: null, error: null });
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

function blank(): Recorded {
  return { logs: [], updates: [], rpcs: [], lookups: [], selects: [] };
}

const liveRow: ChannelRow = {
  id: CHANNEL_ID,
  owner_type: "person",
  owner_id: OWNER_ID,
  organization_id: STUDIO_A,
  value: "dana@kowalskitile.test",
  status: "active",
  channel_kind: "email",
};

/** Studio B's own card for the same address — normal, and the reason the
 *  uniqueness index is per owner rather than per tenant. */
const otherStudioRow: ChannelRow = {
  id: B_CHANNEL_ID,
  owner_type: "company",
  owner_id: B_OWNER_ID,
  organization_id: STUDIO_B,
  value: "dana@kowalskitile.test",
  status: "active",
  channel_kind: "email",
};

Deno.test("the channel lookup names only columns the real table has, and takes the studio from the owning card", async () => {
  const recorded = blank();
  const client = emailClient([liveRow], recorded);
  const resolved = await resolveContactChannel(
    client,
    "dana@kowalskitile.test",
    STUDIO_A,
  );
  // The studio arrived through the embed, not a column of this table.
  assertEquals(resolved?.studioRow?.id, CHANNEL_ID);
  assertEquals(recorded.selects.length, 1);
  const parts = recorded.selects[0].split(",").map((p) => p.trim());
  const embeds = parts.filter((p) => p.includes("("));
  const plain = parts.filter((p) => !p.includes("("));
  for (const col of plain) {
    assert(
      CHANNEL_COLUMNS.has(col),
      `studio_contact_channels has no column "${col}" — this select would ` +
        `raise 42703 against the real database (W4 r2 BLOCKING W4R2-1)`,
    );
  }
  assertEquals(embeds, ["studio_contacts!inner(organization_id)"]);
});

Deno.test("an address on no card at all still resolves to null, not a throw", async () => {
  const recorded = blank();
  const client = emailClient([], recorded);
  assertEquals(
    await resolveContactChannel(client, "nobody@example.test", STUDIO_A),
    null,
  );
});

Deno.test("worst status wins when one address sits on several cards", async () => {
  const recorded = blank();
  const client = emailClient([
    liveRow,
    { ...liveRow, id: "other", status: "dead" },
  ], recorded);
  const resolved = await resolveContactChannel(client, "Dana@KowalskiTile.test");
  assertEquals(resolved?.status, "dead");
});

Deno.test("a dead address refuses the letter, and an unsubscribed one does too", async () => {
  for (const status of ["dead", "unsubscribed"]) {
    const recorded = blank();
    const client = emailClient([{ ...liveRow, status }], recorded);
    const prepared = await prepareCompliantEmail(client, {
      to: "dana@kowalskitile.test",
      subject: "Your certificate lapses Friday",
      html: "<p>hello</p>",
      category: "transactional",
    });
    assertEquals(prepared.state, "suppressed");
    if (prepared.state === "suppressed") {
      assertEquals(prepared.reason, `channel_${status}`);
      assertEquals(prepared.channel?.id, CHANNEL_ID);
    }
  }
});

Deno.test("a soft-bounced address still sends — one bounce is not a dead mailbox", async () => {
  const recorded = blank();
  const client = emailClient([{ ...liveRow, status: "bounced" }], recorded);
  const prepared = await prepareCompliantEmail(client, {
    to: "dana@kowalskitile.test",
    subject: "s",
    html: "<p>h</p>",
    category: "transactional",
  });
  assertEquals(prepared.state, "ready");
  assertEquals(channelRefusesSend("bounced"), false);
});

Deno.test("a channel letter carries List-Unsubscribe with a channel subject, in every category", async () => {
  const recorded = blank();
  const client = emailClient([liveRow], recorded);
  const prepared = await prepareCompliantEmail(client, {
    to: "dana@kowalskitile.test",
    subject: "s",
    html: "<p>h</p>",
    // Transactional: the account path adds no header here, but an address with
    // no account has no other door out.
    category: "transactional",
  });
  assert(prepared.state === "ready");
  const body = JSON.parse(prepared.request.body) as {
    headers: Record<string, string>;
  };
  assertEquals(body.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  const url = body.headers["List-Unsubscribe"].replace(/^<|>$/g, "");
  assert(url.includes("/api/unsubscribe?token="));
  const token = decodeURIComponent(new URL(url).searchParams.get("token")!);
  const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  assertEquals(claims.sub, `channel:${CHANNEL_ID}`);
  assertEquals(claims.purpose, "unsubscribe");
});

Deno.test("an account holder's letter files no channel RECORD — no ref, no channel unsubscribe door", async () => {
  const recorded = blank();
  const client = emailClient([liveRow], recorded);
  const prepared = await prepareCompliantEmail(client, {
    to: "dana@kowalskitile.test",
    subject: "s",
    html: "<p>h</p>",
    category: "transactional",
    userId: "a0000000-0000-0000-0000-000000000004",
  });
  assert(prepared.state === "ready");
  // The record is the account's: no deliverability ref, no out touch, and the
  // account's own /preferences door rather than the channel's.
  assertEquals(prepared.channel, undefined);
  const body = JSON.parse(prepared.request.body) as {
    headers: Record<string, string>;
  };
  assertEquals(body.headers["List-Unsubscribe"], undefined);
});

// ── W4 r3 MAJOR-1: the GATE asks the address, account or no account ─────────

Deno.test("a dead address does NOT send to an account holder whose profile is unsuppressed", async () => {
  for (const status of ["dead", "unsubscribed"]) {
    const recorded = blank();
    // The fake's profiles read answers { email_suppressed: false } — exactly
    // the state handleBounce leaves behind when the bounce arrived on an
    // account-less letter (notification_log.user_id NULL).
    const client = emailClient([{ ...liveRow, status }], recorded);
    const prepared = await prepareCompliantEmail(client, {
      to: "dana@kowalskitile.test",
      subject: "Invoice 0002",
      html: "<p>h</p>",
      category: "transactional",
      userId: "a0000000-0000-0000-0000-000000000004",
      organizationId: STUDIO_A,
    });
    assertEquals(prepared.state, "suppressed");
    if (prepared.state === "suppressed") {
      assertEquals(prepared.reason, `channel_${status}`);
    }
  }
});

Deno.test("the widened gate still asks the address ONCE per letter, and still address-wide", async () => {
  const recorded = blank();
  const client = emailClient([liveRow], recorded);
  await prepareCompliantEmail(client, {
    to: "dana@kowalskitile.test",
    subject: "s",
    html: "<p>h</p>",
    category: "transactional",
    userId: "a0000000-0000-0000-0000-000000000004",
    organizationId: STUDIO_A,
  });
  assertEquals(recorded.lookups.length, 1);
  assertEquals(recorded.lookups[0].organization_id, undefined);
});

Deno.test("the channel letter's log row carries the deliverability ref, and the send writes one out touch", async () => {
  const recorded = blank();
  const client = emailClient([liveRow], recorded);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify({ id: "resend-1" }), { status: 200 }),
    );
  try {
    const result = await sendCompliantEmail(client, {
      to: "dana@kowalskitile.test",
      subject: "s",
      html: "<p>h</p>",
      category: "transactional",
      notificationType: "compliance_chase",
      organizationId: STUDIO_A,
    });
    assertEquals(result.success, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Without the ref this row is never written at all (shouldLog is
  // userId || ref), and resend-webhook could never match the bounce.
  assertEquals(recorded.logs.length, 1);
  assertEquals(recorded.logs[0].user_id, null);
  assertEquals(recorded.logs[0].ref_type, "studio_contact_channel");
  assertEquals(recorded.logs[0].ref_id, CHANNEL_ID);
  assertEquals(recorded.logs[0].recipient, "dana@kowalskitile.test");

  const touches = recorded.rpcs.filter((r) => r.name === "record_touch");
  assertEquals(touches.length, 1);
  assertEquals(touches[0].args.p_subject_type, "person");
  assertEquals(touches[0].args.p_subject_id, OWNER_ID);
  assertEquals(touches[0].args.p_channel_kind, "email");
  assertEquals(touches[0].args.p_direction, "out");
});

Deno.test("a refused letter writes a suppressed log row with the same ref", async () => {
  const recorded = blank();
  const client = emailClient([{ ...liveRow, status: "dead" }], recorded);
  const result = await sendCompliantEmail(client, {
    to: "dana@kowalskitile.test",
    subject: "s",
    html: "<p>h</p>",
    category: "transactional",
    organizationId: STUDIO_A,
  });
  assertEquals(result.suppressed, true);
  assertEquals(recorded.logs.length, 1);
  assertEquals(recorded.logs[0].status, "suppressed");
  assertEquals(recorded.logs[0].ref_type, "studio_contact_channel");
  assertEquals(recorded.rpcs.filter((r) => r.name === "record_touch").length, 0);
});

// ── B-2: the touch is filed in the studio that SENT the letter ──────────────

Deno.test("the out touch names the sending studio's own card, never another studio's copy of the address", async () => {
  const recorded = blank();
  // Studio B holds the WORSE row, which is what the address-wide reduce
  // returns — and what the touch used to be filed against.
  const client = emailClient(
    [liveRow, { ...otherStudioRow, status: "bounced" }],
    recorded,
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(new Response(JSON.stringify({ id: "resend-2" }), { status: 200 }));
  try {
    await sendCompliantEmail(client, {
      to: "dana@kowalskitile.test",
      subject: "s",
      html: "<p>h</p>",
      category: "transactional",
      organizationId: STUDIO_A,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const touches = recorded.rpcs.filter((r) => r.name === "record_touch");
  assertEquals(touches.length, 1);
  assertEquals(touches[0].args.p_subject_type, "person");
  assertEquals(touches[0].args.p_subject_id, OWNER_ID);
  assertEquals(recorded.logs[0].ref_id, CHANNEL_ID);
});

Deno.test("the STATUS verdict stays address-wide (D-6) even when the sending studio's own row is live", async () => {
  const recorded = blank();
  const client = emailClient(
    [liveRow, { ...otherStudioRow, status: "dead" }],
    recorded,
  );
  const prepared = await prepareCompliantEmail(client, {
    to: "dana@kowalskitile.test",
    subject: "s",
    html: "<p>h</p>",
    category: "transactional",
    organizationId: STUDIO_A,
  });
  assertEquals(prepared.state, "suppressed");
  if (prepared.state === "suppressed") assertEquals(prepared.reason, "channel_dead");
  // The lookup is by address alone: a dead mailbox is dead for everyone.
  for (const lookup of recorded.lookups) {
    assertEquals(lookup.organization_id, undefined);
  }
});

Deno.test("a letter that names no studio files no touch and no channel ref", async () => {
  const recorded = blank();
  const client = emailClient([liveRow], recorded);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(new Response(JSON.stringify({ id: "resend-3" }), { status: 200 }));
  try {
    await sendCompliantEmail(client, {
      to: "dana@kowalskitile.test",
      subject: "s",
      html: "<p>h</p>",
      category: "transactional",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assertEquals(recorded.rpcs.filter((r) => r.name === "record_touch").length, 0);
  assertEquals(recorded.logs.length, 0);
});

Deno.test("a studio that carries no row for the address files nothing either", async () => {
  const recorded = blank();
  const client = emailClient([otherStudioRow], recorded);
  const resolved = await resolveContactChannel(
    client,
    "dana@kowalskitile.test",
    STUDIO_A,
  );
  assertEquals(resolved?.status, "active");
  assertEquals(resolved?.studioRow, null);
});

// ── the webhook half ────────────────────────────────────────────────────────

Deno.test("an event maps to the status the address deserves", () => {
  assertEquals(channelStatusForEvent("email.bounced", true), "dead");
  assertEquals(channelStatusForEvent("email.bounced", false), "bounced");
  assertEquals(channelStatusForEvent("email.complained", false), "unsubscribed");
  assertEquals(channelStatusForEvent("email.delivered", false), null);
});

function webhookClient(rows: Array<{ id: string; status: string }>, writes: {
  ids?: string[];
  values?: Record<string, unknown>;
}) {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq() {
              return {
                in() {
                  return Promise.resolve({ data: rows, error: null });
                },
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          writes.values = values;
          return {
            in(_col: string, ids: string[]) {
              writes.ids = ids;
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  } as unknown as ChannelStatusClient;
}

Deno.test("a hard bounce kills every row on the address, and never walks a worse one back", async () => {
  const writes: { ids?: string[]; values?: Record<string, unknown> } = {};
  const client = webhookClient([
    { id: "a", status: "active" },
    { id: "b", status: "bounced" },
    { id: "c", status: "dead" },
  ], writes);
  const written = await applyChannelStatus(
    client,
    "Dana@KowalskiTile.test",
    "dead",
    "2026-09-15T00:00:00.000Z",
  );
  assertEquals(written, 2);
  assertEquals(writes.ids, ["a", "b"]);
  assertEquals(writes.values, {
    status: "dead",
    status_at: "2026-09-15T00:00:00.000Z",
  });
});

Deno.test("a soft bounce leaves an unsubscribed row alone", async () => {
  const writes: { ids?: string[]; values?: Record<string, unknown> } = {};
  const client = webhookClient([
    { id: "a", status: "unsubscribed" },
  ], writes);
  assertEquals(await applyChannelStatus(client, "x@y.test", "bounced"), 0);
  assertEquals(writes.ids, undefined);
});

Deno.test("no address means no write at all", async () => {
  const writes: { ids?: string[]; values?: Record<string, unknown> } = {};
  const client = webhookClient([{ id: "a", status: "active" }], writes);
  assertEquals(await applyChannelStatus(client, null, "dead"), 0);
  assertEquals(await applyChannelStatus(client, "   ", "dead"), 0);
});

// ---------------------------------------------------------------------------
// THE SECOND LEDGER (W4 r13 MAJOR-1).
//
// campaign-dispatch posts straight to Resend's batch endpoint and picks its
// audience from profiles.email_suppressed alone — it never asks the channel
// gate. A killing verdict must therefore land on BOTH books from the one
// event, or that rail keeps mailing a mailbox the channel ledger calls dead.
// ---------------------------------------------------------------------------

function profileClient(
  writes: { values?: Record<string, unknown>; match?: [string, unknown] },
  error: { message: string } | null = null,
) {
  return {
    from(_table: string) {
      return {
        update(values: Record<string, unknown>) {
          writes.values = values;
          return {
            eq(col: string, val: unknown) {
              writes.match = [col, val];
              return Promise.resolve({ data: null, error });
            },
          };
        },
      };
    },
  } as unknown as ProfileSuppressionClient;
}

Deno.test("a killing verdict suppresses the profile on the address, normalised", async () => {
  const writes: { values?: Record<string, unknown>; match?: [string, unknown] } = {};
  assertEquals(
    await suppressProfilesForAddress(
      profileClient(writes),
      "  Dana@KowalskiTile.test ",
      "2026-09-15T00:00:00.000Z",
    ),
    true,
  );
  assertEquals(writes.values, {
    email_suppressed: true,
    email_suppressed_at: "2026-09-15T00:00:00.000Z",
  });
  // `eq` on the 00593-normalised value — never `ilike`, which would read the
  // `_` and `%` an ordinary address carries as wildcards.
  assertEquals(writes.match, ["email", "dana@kowalskitile.test"]);
});

Deno.test("only 'dead' and 'unsubscribed' are killing verdicts", () => {
  assertEquals(isSuppressingStatus("dead"), true);
  assertEquals(isSuppressingStatus("unsubscribed"), true);
  assertEquals(isSuppressingStatus("bounced"), false);
  assertEquals(isSuppressingStatus("active"), false);
});

Deno.test("no address means no profile write at all", async () => {
  const writes: { values?: Record<string, unknown>; match?: [string, unknown] } = {};
  assertEquals(await suppressProfilesForAddress(profileClient(writes), null), false);
  assertEquals(await suppressProfilesForAddress(profileClient(writes), "   "), false);
  assertEquals(writes.values, undefined);
});

Deno.test("a failed profile write is warned about, never thrown", async () => {
  const writes: { values?: Record<string, unknown>; match?: [string, unknown] } = {};
  assertEquals(
    await suppressProfilesForAddress(
      profileClient(writes, { message: "permission denied" }),
      "dana@kowalskitile.test",
    ),
    false,
  );
  assertEquals(writes.match, ["email", "dana@kowalskitile.test"]);
});
