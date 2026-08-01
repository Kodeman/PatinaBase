import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildResendRequestHeaders } from "./send-email.ts";

Deno.test("buildResendRequestHeaders forwards one stable provider idempotency key", () => {
  assertEquals(
    buildResendRequestHeaders(
      "test-key",
      "proposal-send/11111111-1111-4111-8111-111111111111/2026-07-31T12:00:00Z",
    ),
    {
      "Content-Type": "application/json",
      Authorization: "Bearer test-key",
      "Idempotency-Key":
        "proposal-send/11111111-1111-4111-8111-111111111111/2026-07-31T12:00:00Z",
    },
  );
});

Deno.test("buildResendRequestHeaders omits the provider key when none is supplied", () => {
  assertEquals(buildResendRequestHeaders("test-key"), {
    "Content-Type": "application/json",
    Authorization: "Bearer test-key",
  });
});
