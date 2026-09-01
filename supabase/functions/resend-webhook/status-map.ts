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
 * 'failed' is listed as upgradeable, but is currently UNREACHABLE by this
 * path, and the entry is future-proofing rather than a live correction:
 * send-email.ts writes 'failed' for an AMBIGUOUS send (a timeout, transport
 * error, non-2xx, or unreadable 2xx) where Resend may well have accepted the
 * message — but in every one of those branches `sendPreparedResendRequest`
 * returns no message id (`PreparedResendResult` carries `id` only on
 * `state: "delivered"`), so the row is written with `provider_id` NULL. This
 * webhook matches rows by `provider_id = event.data.email_id`, so an
 * ambiguous row can never be found, and such rows cannot be auto-corrected
 * today — they need a reconciliation pass keyed on something else (e.g. the
 * idempotency key) to be fixed. Keeping 'failed' here is harmless and makes
 * the upgrade work the moment an id does become available on that branch.
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
