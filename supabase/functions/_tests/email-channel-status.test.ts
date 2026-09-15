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

interface ChannelRow {
  id: string;
  owner_type: string;
  owner_id: string;
  organization_id?: string | null;
  value: string;
  status: string;
  channel_kind: string;
  status_at?: string | null;
}

interface Recorded {
  logs: Array<Record<string, unknown>>;
  updates: Array<Record<string, unknown>>;
  rpcs: Array<{ name: string; args: Record<string, unknown> }>;
  lookups: Array<Record<string, string>>;
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
          select() {
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
              data: rows.filter((r) =>
                r.value === value && kinds.includes(r.channel_kind)
              ),
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
  return { logs: [], updates: [], rpcs: [], lookups: [] };
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

Deno.test("an account holder's letter is untouched by the channel path", async () => {
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
  assertEquals(prepared.channel, undefined);
  const body = JSON.parse(prepared.request.body) as {
    headers: Record<string, string>;
  };
  assertEquals(body.headers["List-Unsubscribe"], undefined);
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
