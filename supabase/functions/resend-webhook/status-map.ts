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
 * The `last_event` label written for each event this webhook handles — every
 * one of them, including the two that deliberately change no status.
 *
 * 'email.sent' is Resend's own accept confirmation and must never downgrade a
 * row that has already reached 'delivered'/'opened'/'clicked'.
 * 'email.delivery_delayed' is a transient retry notice, not an outcome: the
 * message may still land, so the status stays where it was and only
 * `delayed_at` records that a retry happened.
 */
export const RESEND_EVENT_LAST_EVENT: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

/** The `last_event` label for an event type, or null when it is unhandled. */
export function lastEventName(eventType: string): string | null {
  return RESEND_EVENT_LAST_EVENT[eventType] ?? null;
}

/**
 * Resend bounce types that are permanent. A hard bounce suppresses the
 * recipient on the first event; soft bounces stay on the rolling threshold.
 *
 * Resend's own payload capitalises the value ("Permanent" / "Transient"), so
 * the comparison folds case — the pre-00591 handler read a `bounce_type` key
 * that the provider never sends, and so never once saw a hard bounce.
 */
export function isHardBounce(bounceType?: string | null): boolean {
  const value = (bounceType ?? "").trim().toLowerCase();
  return value === "hard" || value === "permanent";
}

/** The bounce sub-object Resend sends on `email.bounced` (docs: webhooks/emails/bounced). */
interface ResendBounceData {
  bounce?: { type?: string; subType?: string; message?: string };
  /** Never sent by Resend; read for anything replaying a legacy payload. */
  bounce_type?: string;
  [key: string]: unknown;
}

/** "Permanent" / "Transient" — `data.bounce.type`, else a legacy flat key. */
export function resolveBounceType(data: ResendBounceData): string | null {
  return data.bounce?.type ?? data.bounce_type ?? null;
}

/** The receiving server's own words: `data.bounce.message`, else its subType. */
export function resolveBounceReason(data: ResendBounceData): string | null {
  return data.bounce?.message ?? data.bounce?.subType ?? null;
}
