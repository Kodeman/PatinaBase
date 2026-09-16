// Deno test for the resend-webhook event handler.
// Run: deno test --allow-all --config supabase/functions/deno.json \
//        supabase/functions/resend-webhook/index.test.ts
//
// index.ts calls serve() at module scope, so handleResendEvent is exported for
// this file; importing the module starts a listener that Deno tears down with
// the test process, and the handler itself is driven against a stubbed client.

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleResendEvent,
  isTimestampWithinWindow,
  timingSafeEqual,
} from "./index.ts";

// No PostHog key ⇒ both emit helpers are no-ops, so nothing leaves the process.
Deno.env.delete("POSTHOG_API_KEY");

interface Recorded {
  table: string;
  patch: Record<string, unknown>;
  /** Statuses the update was gated on, when it was gated at all. */
  guard?: string[];
  /** The column and value the update was keyed on, when it was keyed at all. */
  match?: [string, unknown];
}

function stubClient(
  logRow: Record<string, unknown> | null,
  bounceCount = 0,
  /** Typed email channels carrying the event's address (CRM-12). */
  channelRows: Array<{ id: string; status: string }> = [],
) {
  const updates: Recorded[] = [];

  function chain(table: string, patch?: Record<string, unknown>) {
    const node = {
      select: () => node,
      eq: (column: string, value: unknown) => {
        if (patch) {
          updates[updates.length - 1].match = [column, value];
        }
        return node;
      },
      in: (_column: string, values: string[]) => {
        if (patch) {
          updates[updates.length - 1].guard = values;
        }
        return node;
      },
      gte: () => Promise.resolve({ count: bounceCount, error: null }),
      single: () => Promise.resolve({ data: logRow, error: null }),
      maybeSingle: () => Promise.resolve({ data: logRow, error: null }),
      update: (next: Record<string, unknown>) => {
        updates.push({ table, patch: next });
        return chain(table, next);
      },
      then: (resolve: (v: unknown) => void) =>
        resolve({
          data: !patch && table === "studio_contact_channels"
            ? channelRows
            : null,
          error: null,
        }),
    };
    return node;
  }

  const client = {
    from: (table: string) => chain(table),
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
  return { client, updates };
}

const LOG_ROW = {
  id: "log-1",
  user_id: "10000000-0000-4000-8000-000000000001",
  status: "sent",
  type: "invoice_sent",
  template_id: "invoice-sent",
  metadata: {},
};

function logUpdates(updates: Recorded[]): Recorded[] {
  return updates.filter((u) => u.table === "notification_log");
}

Deno.test("an email_id with no notification_log row is reported unmatched", async () => {
  const { client, updates } = stubClient(null);
  const outcome = await handleResendEvent(client as never, {
    type: "email.delivered",
    data: { email_id: "missing" },
  });
  assertEquals(outcome, { matched: false });
  assertEquals(updates.length, 0);
});

// W4 r2 MAJOR-3. B-2 narrowed the notification_log ref to the SENDING studio's
// own card, so a letter from po-send / quote-request-send / trade-rfq-send /
// trade-agreement-send (none of which pass an explicit ref) writes NO log row
// when that studio's book does not carry the address. The letter's attribution
// is gone; the address's deliverability must not be. D-6: a dead mailbox is
// dead for everyone, whoever's letter found out.
Deno.test("an UNMATCHED hard bounce still kills the address on every card", async () => {
  const { client, updates } = stubClient(null, 0, [
    { id: "chan-a", status: "active" },
    { id: "chan-b", status: "active" },
  ]);
  const outcome = await handleResendEvent(client as never, {
    type: "email.bounced",
    data: {
      email_id: "untracked",
      to: ["dana@kowalskitile.test"],
      bounce: { type: "Permanent" },
    },
  });
  // Still unmatched: no log row exists to stamp.
  assertEquals(outcome, { matched: false });
  const channelWrites = updates.filter(
    (u) => u.table === "studio_contact_channels",
  );
  assertEquals(channelWrites.length, 1);
  assertEquals(channelWrites[0].patch.status, "dead");
  assert(typeof channelWrites[0].patch.status_at === "string");
  assertEquals(channelWrites[0].guard, ["chan-a", "chan-b"]);
  // Nothing was written to notification_log — there was no row.
  assertEquals(logUpdates(updates).length, 0);
});

Deno.test("an UNMATCHED complaint unsubscribes the address", async () => {
  const { client, updates } = stubClient(null, 0, [
    { id: "chan-a", status: "active" },
  ]);
  await handleResendEvent(client as never, {
    type: "email.complained",
    data: { email_id: "untracked", to: ["dana@kowalskitile.test"] },
  });
  const channelWrites = updates.filter(
    (u) => u.table === "studio_contact_channels",
  );
  assertEquals(channelWrites.length, 1);
  assertEquals(channelWrites[0].patch.status, "unsubscribed");
});

Deno.test("an UNMATCHED event that is neither a bounce nor a complaint writes nothing", async () => {
  const { client, updates } = stubClient(null, 0, [
    { id: "chan-a", status: "active" },
  ]);
  await handleResendEvent(client as never, {
    type: "email.opened",
    data: { email_id: "untracked", to: ["dana@kowalskitile.test"] },
  });
  assertEquals(updates.length, 0);
});

Deno.test("email.sent records the event without touching status", async () => {
  const { client, updates } = stubClient(LOG_ROW);
  await handleResendEvent(client as never, {
    type: "email.sent",
    data: { email_id: "re_1" },
  });
  const [first] = logUpdates(updates);
  assertEquals(first.patch.last_event, "sent");
  assert(typeof first.patch.last_event_at === "string");
  assertFalse("status" in first.patch);
});

Deno.test("email.delivery_delayed stamps delayed_at and leaves status alone", async () => {
  const { client, updates } = stubClient(LOG_ROW);
  await handleResendEvent(client as never, {
    type: "email.delivery_delayed",
    data: { email_id: "re_1" },
  });
  const [first] = logUpdates(updates);
  assertEquals(first.patch.last_event, "delivery_delayed");
  assert(typeof first.patch.delayed_at === "string");
  assertFalse("status" in first.patch);
});

Deno.test("email.delivered promotes status under guard and stamps delivered_at unguarded", async () => {
  const { client, updates } = stubClient(LOG_ROW);
  await handleResendEvent(client as never, {
    type: "email.delivered",
    data: { email_id: "re_1", created_at: "2026-09-11T10:00:00.000Z" },
  });
  const [guarded, unguarded] = logUpdates(updates);

  assertEquals(guarded.patch.status, "delivered");
  assertEquals(guarded.patch.sent_at, "2026-09-11T10:00:00.000Z");
  // An engagement state is never walked back to 'delivered'.
  assertEquals(guarded.guard, [
    "queued",
    "sending",
    "sent",
    "unconfirmed",
    "failed",
  ]);

  assertEquals(unguarded.patch.delivered_at, "2026-09-11T10:00:00.000Z");
  assertEquals(unguarded.patch.last_event, "delivered");
  assertEquals(unguarded.guard, undefined);
});

Deno.test("email.bounced reads the bounce sub-object Resend actually sends", async () => {
  const { client, updates } = stubClient(LOG_ROW);
  await handleResendEvent(client as never, {
    type: "email.bounced",
    data: {
      email_id: "re_1",
      bounce: {
        type: "Permanent",
        subType: "Suppressed",
        message: "The recipient's address is on the suppression list.",
      },
    },
  });
  const [first] = logUpdates(updates);
  assertEquals(first.patch.status, "bounced");
  assertEquals(first.patch.bounce_type, "Permanent");
  assertEquals(
    first.patch.bounce_reason,
    "The recipient's address is on the suppression list.",
  );
  assertEquals(first.patch.error, "Bounce: Permanent");
  assertEquals(first.patch.last_event, "bounced");
  assert(typeof first.patch.bounced_at === "string");
});

Deno.test("a legacy flat bounce_type still resolves, and subType stands in for a missing message", async () => {
  const { client, updates } = stubClient(LOG_ROW);
  await handleResendEvent(client as never, {
    type: "email.bounced",
    data: {
      email_id: "re_1",
      bounce_type: "hard",
      bounce: { subType: "MessageRejected" },
    },
  });
  const [first] = logUpdates(updates);
  assertEquals(first.patch.bounce_type, "hard");
  assertEquals(first.patch.bounce_reason, "MessageRejected");
});

Deno.test("a hard bounce suppresses the profile on the first event", async () => {
  const { client, updates } = stubClient(LOG_ROW);
  await handleResendEvent(client as never, {
    type: "email.bounced",
    data: { email_id: "re_1", bounce: { type: "Permanent" } },
  });
  const profileUpdate = updates.find((u) => u.table === "profiles");
  assertEquals(profileUpdate?.patch.email_suppressed, true);
  assert(typeof profileUpdate?.patch.email_suppressed_at === "string");
});

Deno.test("a lone soft bounce records the bounce and suppresses nobody", async () => {
  const { client, updates } = stubClient(LOG_ROW, 1);
  await handleResendEvent(client as never, {
    type: "email.bounced",
    data: { email_id: "re_1", bounce: { type: "Transient" } },
  });
  const [first] = logUpdates(updates);
  assertEquals(first.patch.status, "bounced");
  assertEquals(first.patch.bounce_type, "Transient");
  assertEquals(updates.find((u) => u.table === "profiles"), undefined);
});

Deno.test("a bounce on a row with no user_id and no address never touches profiles", async () => {
  const { client, updates } = stubClient({ ...LOG_ROW, user_id: null });
  const outcome = await handleResendEvent(client as never, {
    type: "email.bounced",
    data: { email_id: "re_1", bounce: { type: "Permanent" } },
  });
  assertEquals(outcome, { matched: true });
  const [first] = logUpdates(updates);
  assertEquals(first.patch.status, "bounced");
  assertEquals(updates.find((u) => u.table === "profiles"), undefined);
});

// W4 r13 MAJOR-1. campaign-dispatch picks its audience from
// profiles.email_suppressed and never asks the channel gate, so a killing
// verdict that lands only on studio_contact_channels leaves that one rail
// mailing a dead mailbox. Both ledgers are written from the same event, by
// ADDRESS, on every path — including the two the by-id writes cannot reach.
Deno.test("an UNMATCHED hard bounce suppresses every profile carrying the address", async () => {
  const { client, updates } = stubClient(null, 0, [
    { id: "chan-a", status: "active" },
  ]);
  await handleResendEvent(client as never, {
    type: "email.bounced",
    data: {
      email_id: "untracked",
      to: ["Dana@Kowalskitile.test"],
      bounce: { type: "Permanent" },
    },
  });
  const profileWrites = updates.filter((u) => u.table === "profiles");
  assertEquals(profileWrites.length, 1);
  assertEquals(profileWrites[0].patch.email_suppressed, true);
  assert(typeof profileWrites[0].patch.email_suppressed_at === "string");
  // Keyed on the address as 00593 stores it — lower, trimmed — and on `email`,
  // never on a wildcard read.
  assertEquals(profileWrites[0].match, ["email", "dana@kowalskitile.test"]);
});

Deno.test("an UNMATCHED complaint suppresses every profile carrying the address", async () => {
  const { client, updates } = stubClient(null, 0, [
    { id: "chan-a", status: "active" },
  ]);
  await handleResendEvent(client as never, {
    type: "email.complained",
    data: { email_id: "untracked", to: ["dana@kowalskitile.test"] },
  });
  const profileWrites = updates.filter((u) => u.table === "profiles");
  assertEquals(profileWrites.length, 1);
  assertEquals(profileWrites[0].patch.email_suppressed, true);
});

Deno.test("an UNMATCHED soft bounce suppresses nobody", async () => {
  const { client, updates } = stubClient(null, 0, [
    { id: "chan-a", status: "active" },
  ]);
  await handleResendEvent(client as never, {
    type: "email.bounced",
    data: {
      email_id: "untracked",
      to: ["dana@kowalskitile.test"],
      bounce: { type: "Transient" },
    },
  });
  const channelWrites = updates.filter(
    (u) => u.table === "studio_contact_channels",
  );
  assertEquals(channelWrites[0].patch.status, "bounced");
  assertEquals(updates.find((u) => u.table === "profiles"), undefined);
});

Deno.test("a hard bounce on a logged row with no user_id still suppresses by address", async () => {
  const { client, updates } = stubClient(
    { ...LOG_ROW, user_id: null, recipient: "dana@kowalskitile.test" },
    0,
    [{ id: "chan-a", status: "active" }],
  );
  const outcome = await handleResendEvent(client as never, {
    type: "email.bounced",
    data: { email_id: "re_1", bounce: { type: "Permanent" } },
  });
  assertEquals(outcome, { matched: true });
  const profileWrites = updates.filter((u) => u.table === "profiles");
  assertEquals(profileWrites.length, 1);
  assertEquals(profileWrites[0].patch.email_suppressed, true);
});

Deno.test("engagement events keep writing their own timestamps and the trail", async () => {
  for (
    const [type, column, status] of [
      ["email.opened", "opened_at", "opened"],
      ["email.clicked", "clicked_at", "clicked"],
    ] as const
  ) {
    const { client, updates } = stubClient(LOG_ROW);
    await handleResendEvent(client as never, { type, data: { email_id: "re_1" } });
    const [first] = logUpdates(updates);
    assertEquals(first.patch.status, status);
    assert(typeof first.patch[column] === "string");
    assertEquals(first.patch.last_event, status);
  }
});

Deno.test("a complaint suppresses the profile and records the trail", async () => {
  const { client, updates } = stubClient(LOG_ROW);
  await handleResendEvent(client as never, {
    type: "email.complained",
    data: { email_id: "re_1" },
  });
  const [first] = logUpdates(updates);
  assertEquals(first.patch.status, "complained");
  assertEquals(first.patch.last_event, "complained");

  const profileUpdate = updates.find((u) => u.table === "profiles");
  assertEquals(profileUpdate?.patch.email_suppressed, true);
  assertEquals(profileUpdate?.patch.email_complaint, true);
});

Deno.test("an unhandled event type writes nothing to notification_log", async () => {
  const { client, updates } = stubClient(LOG_ROW);
  const outcome = await handleResendEvent(client as never, {
    type: "email.scheduled",
    data: { email_id: "re_1" },
  });
  assertEquals(outcome, { matched: true });
  assertEquals(logUpdates(updates).length, 0);
});


Deno.test("a signature older than the replay window is refused", () => {
  const now = 1_800_000_000_000;
  const seconds = now / 1000;
  assertEquals(isTimestampWithinWindow(String(seconds), now), true);
  assertEquals(isTimestampWithinWindow(String(seconds - 299), now), true);
  assertEquals(isTimestampWithinWindow(String(seconds + 299), now), true);
  // Older than five minutes, and further into the future than five minutes.
  assertEquals(isTimestampWithinWindow(String(seconds - 301), now), false);
  assertEquals(isTimestampWithinWindow(String(seconds + 301), now), false);
  // Absent or unparseable is not a timestamp at all.
  assertEquals(isTimestampWithinWindow(null, now), false);
  assertEquals(isTimestampWithinWindow("", now), false);
  assertEquals(isTimestampWithinWindow("not-a-number", now), false);
});

Deno.test("signature comparison is byte-wise over equal-length inputs", () => {
  assertEquals(timingSafeEqual("abc123", "abc123"), true);
  assertEquals(timingSafeEqual("abc123", "abc124"), false);
  // A prefix must not pass, and a length difference short-circuits to false.
  assertEquals(timingSafeEqual("abc", "abc123"), false);
  assertEquals(timingSafeEqual("", ""), true);
  assertEquals(timingSafeEqual("", "a"), false);
});
