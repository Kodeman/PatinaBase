import type { SendAuthority } from "../_shared/send-authority.ts";

export function invoiceReminderAuthority(studioId: string): SendAuthority {
  return {
    kind: "studio_schedule",
    studioId,
    outboundKind: "invoice_reminder",
  };
}
