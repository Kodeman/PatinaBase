import type { SendAuthority } from "../_shared/send-authority.ts";

export function pulseEmailOptions(input: {
  userId: string;
  pulseId: string;
  recipient: string;
  subject: string;
  html: string;
}) {
  const authority: SendAuthority = { kind: "designer", userId: input.userId };
  return {
    authority,
    to: input.recipient,
    subject: input.subject,
    html: input.html,
    category: "engagement" as const,
    userId: input.userId,
    notificationType: "weekly_pulse",
    templateId: "weekly-pulse",
    ref: { type: "weekly_pulse", id: input.pulseId },
  };
}
