/**
 * Delivery states that represent a real notification attempt and may therefore
 * contribute an item to a user's digest. `unconfirmed` is terminal but remains
 * eligible: the provider accepted an attempt whose final delivery could not be
 * verified. Suppressed, bounced, and failed rows never become digest content.
 */
export const DIGEST_ELIGIBLE_NOTIFICATION_STATUSES = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "queued",
  "sending",
  "unconfirmed",
] as const;

/**
 * Notification types that should NOT appear in a digest. Transactional
 * emails are always sent immediately and contain time-critical content.
 */
export const DIGEST_EXCLUDED_TYPES = new Set([
  "account_verification",
  "password_reset",
  "security_alert",
  "order_confirmation",
  "payment_receipt",
  "client_confirmation",
  // In-app messages already have their own coalescing channel.
  "in_app_message",
  "in_app_message_mention",
  // Hour-tracking nudges (HT-34 / D-R3-01): these write one quiet
  // `notification_log` row for the in-app bell only — no push, no email,
  // no badge. Without this exclusion the digest's collection query (which
  // has no `channel` filter) would fold them into a "weekly_inspiration"
  // email, which HT-34 forbids by name.
  "time_entry_running_long",
  "time_weekly_unlogged_reminder",
]);
