import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reminderStampDisposition } from "./logic.ts";

const BASE = {
  inAppOk: true,
  emailSent: false,
  emailSkipped: true,
  reason: "already_sent",
} as const;

Deno.test("delivered Stage-2 log reconciles the reminder stamp", () => {
  assertEquals(
    reminderStampDisposition({
      stage2EvidenceCoherent: true,
      recipientEmail: "lead@example.test",
      delivery: { ...BASE, existingLogStatus: "delivered" },
    }),
    "terminal_log_reconciled",
  );
});

for (const status of ["queued", "sending"] as const) {
  Deno.test(`${status} Stage-2 log remains in flight and unstamped`, () => {
    assertEquals(
      reminderStampDisposition({
        stage2EvidenceCoherent: true,
        recipientEmail: "lead@example.test",
        delivery: { ...BASE, existingLogStatus: status },
      }),
      null,
    );
  });
}

Deno.test("incoherent Stage-2 evidence cannot reconcile a terminal log", () => {
  assertEquals(
    reminderStampDisposition({
      stage2EvidenceCoherent: false,
      recipientEmail: "lead@example.test",
      delivery: { ...BASE, existingLogStatus: "opened" },
    }),
    null,
  );
});

Deno.test("suppressed and bounced logs are terminal handled dispositions", () => {
  for (const existingLogStatus of ["suppressed", "bounced"] as const) {
    assertEquals(
      reminderStampDisposition({
        stage2EvidenceCoherent: true,
        recipientEmail: "lead@example.test",
        delivery: { ...BASE, existingLogStatus },
      }),
      "terminal_log_reconciled",
    );
  }
});

Deno.test("failed delivery remains retryable and unstamped", () => {
  assertEquals(
    reminderStampDisposition({
      stage2EvidenceCoherent: true,
      recipientEmail: "lead@example.test",
      delivery: {
        inAppOk: true,
        emailSent: false,
        emailSkipped: true,
        reason: "send_failed",
      },
    }),
    null,
  );
});
