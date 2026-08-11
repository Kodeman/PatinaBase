import type {
  DecisionEmailLogStatus,
  DeliverDecisionNotificationResult,
} from "../_shared/decision-notify.ts";

export type ReminderStampDisposition =
  | "email_sent"
  | "in_app_only"
  | "terminal_log_reconciled";

const TERMINAL_HANDLED_EMAIL_STATUSES = new Set<DecisionEmailLogStatus>([
  "delivered",
  "opened",
  "clicked",
  // Suppression is a final compliance disposition and bounce is a final
  // provider disposition. Neither should be resent blindly by the cron.
  "suppressed",
  "bounced",
]);

/**
 * Decide whether decision-reminders may stamp reminder_sent_at.
 *
 * Reconciliation is Stage-2-only because its checked service RPC revalidates
 * the exact frozen lead and immutable artifact before mutating the parent.
 * Queued/sending attempts remain unstamped while failed attempts stay
 * retryable through the delivery chokepoint.
 */
export function reminderStampDisposition(args: {
  stage2EvidenceCoherent: boolean;
  recipientEmail: string | null;
  delivery: DeliverDecisionNotificationResult;
}): ReminderStampDisposition | null {
  const { delivery } = args;
  if (delivery.emailSent) return "email_sent";
  if (
    delivery.inAppOk &&
    (!args.recipientEmail || delivery.reason === "cadence_digest")
  ) {
    return "in_app_only";
  }
  if (
    args.stage2EvidenceCoherent &&
    delivery.reason === "already_sent" &&
    delivery.existingLogStatus &&
    TERMINAL_HANDLED_EMAIL_STATUSES.has(delivery.existingLogStatus)
  ) {
    return "terminal_log_reconciled";
  }
  return null;
}
