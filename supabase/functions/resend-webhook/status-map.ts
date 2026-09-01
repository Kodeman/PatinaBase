// resend-webhook — the pure event→status mapping, extracted so it can be
// tested without booting index.ts's `serve()`.

/**
 * notification_log status each handled Resend event maps to. Events absent
 * here are logged and ignored by the handler.
 *
 * 'complained' and 'sent' were added to the notification_status enum by
 * migration 00552.
 */
export const RESEND_EVENT_STATUS: Record<string, string> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

/**
 * Statuses an email.delivered event may overwrite. 'opened' and 'clicked' are
 * deliberately absent: both already prove delivery, and Resend does not
 * guarantee event ordering, so a late delivered event must not walk an
 * engagement state backwards.
 *
 * 'failed' IS upgradeable: send-email.ts writes it for an AMBIGUOUS send (a
 * timeout, transport error, or unreadable 2xx), where Resend may well have
 * accepted the message. A delivered webhook for that row is authoritative
 * evidence the send landed, so it corrects the pessimistic guess.
 */
export const DELIVERY_UPGRADE_FROM_STATUSES = [
  "queued",
  "sending",
  "sent",
  "unconfirmed",
  "failed",
] as const;

/**
 * Resend bounce types that are permanent. A hard bounce suppresses the
 * recipient on the first event; soft bounces stay on the rolling threshold.
 */
export function isHardBounce(bounceType?: string): boolean {
  return bounceType === "hard" || bounceType === "permanent";
}
