// deno-lint-ignore-file no-import-prefix

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseQuotaDecision,
  quotaRpcArgsForVerifiedCaller,
  rateLimitBody,
} from "./quota.ts";

Deno.test("quota response accepts the durable allowed shape", () => {
  assertEquals(
    parseQuotaDecision({
      allowed: true,
      reason: null,
      limit: { ten_minutes: 10, day: 100 },
      remaining: { ten_minutes: 8, day: 98 },
      retry_after_seconds: 0,
      reset_at: "2026-08-04T00:00:00.000Z",
    }),
    {
      allowed: true,
      limit: { ten_minutes: 10, day: 100 },
      remaining: { ten_minutes: 8, day: 98 },
      retry_after_seconds: 0,
      reset_at: "2026-08-04T00:00:00.000Z",
    },
  );
});

Deno.test("quota response emits a structured retryable 429 body", () => {
  const decision = parseQuotaDecision({
    allowed: false,
    reason: "ten_minute_limit",
    limit: 10,
    remaining: 0,
    retry_after_seconds: 37,
    reset_at: "2026-08-03T15:00:37.000Z",
  });
  if (!decision || decision.allowed) throw new Error("expected denial");

  assertEquals(rateLimitBody(decision), {
    error: "url_unfurl_rate_limited",
    code: "url_unfurl_rate_limited",
    rate_limit: {
      reason: "ten_minute_limit",
      limit: 10,
      remaining: 0,
      retry_after_seconds: 37,
      reset_at: "2026-08-03T15:00:37.000Z",
    },
  });
});

Deno.test("quota response fails closed on malformed RPC data", () => {
  const malformed = [
    null,
    {},
    { allowed: true },
    {
      allowed: false,
      reason: "unknown_limit",
      limit: 10,
      remaining: 0,
      retry_after_seconds: 1,
      reset_at: "2026-08-03T15:00:01.000Z",
    },
    {
      allowed: false,
      reason: "daily_limit",
      limit: 100,
      remaining: 0,
      retry_after_seconds: 0,
      reset_at: "not-a-date",
    },
  ];
  for (const value of malformed) assertEquals(parseQuotaDecision(value), null);
});

Deno.test("quota RPC arguments use only the verified caller id", () => {
  const verifiedCallerId = "11111111-1111-4111-8111-111111111111";
  const untrustedBody = {
    user_id: "22222222-2222-4222-8222-222222222222",
    userId: "33333333-3333-4333-8333-333333333333",
  };
  assertEquals(quotaRpcArgsForVerifiedCaller(verifiedCallerId), {
    p_user_id: verifiedCallerId,
  });
  assertEquals(
    Object.values(quotaRpcArgsForVerifiedCaller(verifiedCallerId)).includes(
      untrustedBody.user_id,
    ),
    false,
  );
});
