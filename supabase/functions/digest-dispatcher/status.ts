/**
 * Delivery states that represent a real notification attempt and may therefore
 * contribute an item to a user's digest. `unconfirmed` is terminal but remains
 * eligible: the provider accepted an attempt whose final delivery could not be
 * verified. Suppressed, bounced, and failed rows never become digest content.
 */
export const DIGEST_ELIGIBLE_NOTIFICATION_STATUSES = [
  "delivered",
  "opened",
  "clicked",
  "queued",
  "sending",
  "unconfirmed",
] as const;
