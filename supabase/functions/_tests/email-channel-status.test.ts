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

interface ChannelRow {
  id: string;
  owner_type: string;
  owner_id: string;
  value: string;
  status: string;
  channel_kind: string;
  status_at?: string | null;
}

interface Recorded {
  logs: Array<Record<string, unknown>>;
  updates: Array<Record<string, unknown>>;
  rpcs: Array<{ name: string; args: Record<string, unknown> }>;
}

/** The narrow surface send-email.ts touches, with the channel table in it. */
function emailClient(rows: ChannelRow[], recorded: Recorded) {
  return {
    from(table: string) {
      if (table === "studio_contact_channels") {
        let value = "";
        let kinds: string[] = [];
        const q = {
          select() {
            return q;
          },
          eq(_col: string, v: string) {
            value = v;
            return q;
          },
          in(_col: string, vals: string[]) {
            kinds = vals;
            return q;
          },
          then(resolve: (r: { data: unknown; error: unknown }) => unknown) {
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
  return { logs: [], updates: [], rpcs: [] };
}

const liveRow: ChannelRow = {
  id: CHANNEL_ID,
  owner_type: "person",
  owner_id: OWNER_ID,
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
  });
  assertEquals(result.suppressed, true);
  assertEquals(recorded.logs.length, 1);
  assertEquals(recorded.logs[0].status, "suppressed");
  assertEquals(recorded.logs[0].ref_type, "studio_contact_channel");
  assertEquals(recorded.rpcs.filter((r) => r.name === "record_touch").length, 0);
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
