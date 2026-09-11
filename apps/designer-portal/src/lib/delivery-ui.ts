import type { EmailDelivery, EmailDeliveryState } from '@patina/supabase';

/**
 * The one word a studio reads about an email it sent (00591).
 *
 * The grammar is the letter line's (people/directory/client-letter-line.tsx):
 * dated prose, never an absence ("hasn't opened it yet"), never a duration
 * ("3 days ago"), never a pill or a dot. `delayed` is the single line that
 * says a thing is still happening, because the provider IS still retrying —
 * that is an event, not a wait we invented.
 */

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'June',
  'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec',
];

/**
 * "8 Sept" — the letter line's own shorthand, re-cut here rather than imported
 * from it: client-letter-line.tsx renders <DeliveryWord/>, which reads this
 * module, so importing its formatter back would close a cycle.
 */
function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

/**
 * `failed` is deliberately absent: the send never left Patina, so the word
 * would describe an ambiguity as a fact. deliveryWord returns null for it.
 */
const ATTENTION: ReadonlySet<EmailDeliveryState> = new Set<EmailDeliveryState>([
  'delayed',
  'bounced',
  'complained',
  'suppressed',
]);

/** The states a designer has to do something about. */
export function isAttentionState(state: EmailDeliveryState): boolean {
  return ATTENTION.has(state);
}

export interface DeliveryWordCopy {
  text: string;
  register: 'quiet' | 'attention';
  /** The provider's own reason, for a title — never the printed line. */
  detail?: string;
}

export function deliveryWord(
  delivery: EmailDelivery | null | undefined,
  recipient?: string | null,
): DeliveryWordCopy | null {
  if (!delivery) return null;
  const known = delivery.recipient ?? recipient ?? null;
  const who = known ?? 'them';
  const when = shortDate(
    delivery.deliveredAt ?? delivery.lastEventAt ?? delivery.sentAt ?? delivery.createdAt,
  );
  // An attention line is dated from the event that caused it, not from the
  // delivery that never happened.
  const trouble = shortDate(
    delivery.bouncedAt ??
      delivery.delayedAt ??
      delivery.lastEventAt ??
      delivery.sentAt ??
      delivery.createdAt,
  );
  const dated = (head: string) => (trouble ? `${head} ${trouble}` : head);

  switch (delivery.state) {
    case 'sending':
      return { text: 'Sending', register: 'quiet' };
    case 'sent':
      return { text: `Sent ${when}`.trim(), register: 'quiet' };
    case 'delivered':
      return { text: `Delivered ${when}`.trim(), register: 'quiet' };
    case 'opened':
      return { text: `Opened ${when}`.trim(), register: 'quiet' };
    case 'delayed':
      return {
        text: `${dated('Delayed')} — still trying ${who}`,
        register: 'attention',
      };
    case 'bounced':
      return {
        text: `${dated('Bounced')} — didn't reach ${who}`,
        register: 'attention',
        detail: delivery.bounceReason ?? delivery.bounceType ?? undefined,
      };
    case 'complained':
      return {
        text: known
          ? `${dated('Marked as spam')} by ${known}`
          : dated('Marked as spam'),
        register: 'attention',
      };
    // A send that never left Patina is ambiguous — it may yet have gone out —
    // so the surface says nothing rather than reporting "Didn't send".
    case 'failed':
      return null;
    case 'suppressed':
      return {
        text: known
          ? `${dated('Not sent')} — ${known} opted out`
          : `${dated('Not sent')} — opted out`,
        register: 'attention',
      };
    default:
      return null;
  }
}

/**
 * The nudge's own failure line. A suppressed address is a settled fact about
 * the recipient, so it is named rather than offered as something to retry.
 */
export function nudgeFailureNote(
  emailSuppressed: boolean,
  clientEmail: string | null,
): string {
  return emailSuppressed
    ? `Not sent — ${clientEmail ?? 'this client'}’s address is suppressed after a bounce or complaint.`
    : 'Nudge recorded, but the email couldn’t be sent — follow up directly.';
}
