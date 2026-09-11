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
}

function stubClient(
  logRow: Record<string, unknown> | null,
  bounceCount = 0,
) {
  const updates: Recorded[] = [];

  function chain(table: string, patch?: Record<string, unknown>) {
    const node = {
      select: () => node,
      eq: () => node,
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
        resolve({ data: null, error: null }),
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

Deno.test("a bounce on a row with no user_id never touches profiles", async () => {
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
