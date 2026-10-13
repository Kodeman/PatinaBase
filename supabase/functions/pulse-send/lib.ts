import type { SendAuthority } from "../_shared/send-authority.ts";

export function pulseEmailOptions(input: {
  senderUserId: string;
  recipientUserId: string | null;
  pulseId: string;
  recipient: string;
  subject: string;
  html: string;
  organizationId: string | null;
}) {
  const authority: SendAuthority = { kind: "designer", userId: input.senderUserId };
  return {
    authority,
    organizationId: input.organizationId,
    to: input.recipient,
    subject: input.subject,
    html: input.html,
    category: "engagement" as const,
    userId: input.recipientUserId ?? undefined,
    notificationType: "weekly_pulse",
    templateId: "weekly-pulse",
    ref: { type: "weekly_pulse", id: input.pulseId },
  };
}
