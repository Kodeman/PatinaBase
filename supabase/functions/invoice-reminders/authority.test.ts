import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { invoiceReminderAuthority } from "./authority.ts";

Deno.test("automatic invoice reminder uses the invoice studio schedule authority", () => {
  assertEquals(invoiceReminderAuthority("studio-1"), {
    kind: "studio_schedule",
    studioId: "studio-1",
    outboundKind: "invoice_reminder",
  });
});
