/**
 * Trade Agreement guest page — token format gate, the frozen DTO
 * resolve_trade_agreement_link() returns, and the small readers that turn its
 * eight essentials into sentences.
 *
 * mint_trade_agreement_token mints the raw token the way trade_rfq_tokens,
 * field_link_tokens and document_shares do: 32 random bytes → 64-char
 * lowercase hex, only sha256(token) stored. The shape is identical to an RFQ
 * or field token, and the pattern below is deliberately its OWN literal
 * rather than an import from rfq/[token]/types.ts — a separate credential
 * gets a separate gate, so neither can be widened by an edit meant for the
 * other.
 */

export const TRADE_AGREEMENT_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** Cheap format gate — rejects an obviously malformed token before any DB round-trip. */
export function isLikelyTradeAgreementToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && TRADE_AGREEMENT_TOKEN_PATTERN.test(token);
}

/** The only two states a resolvable link can be in (R16). */
export type TradeAgreementLinkState = 'sent' | 'signed';

export interface TradeAgreementSchedule {
  startOn: string | null;
  durationDays: number | null;
  sequencing: string | null;
}

export interface TradeAgreementSignatureReceipt {
  signedName: string;
  signedAt: string | null;
}

/**
 * The exact narrow JSONB DTO resolve_trade_agreement_link() returns.
 *
 * What is NOT here is the point (R13). No client price, no GMP, no contract
 * sum, no schedule of values, no draw amount; no other sub's price and no
 * count of them; no bid ledger in any form; no client name, no household, and
 * no PROJECT NAME — studios name projects after the people who live in them,
 * so a project name hands the sub the client's surname under an innocent key
 * (00424:576-600 says exactly this and the reasoning carries verbatim). The
 * page renders only the keys typed here, pinned in page.test.tsx.
 */
export interface TradeAgreementLinkDTO {
  studioName: string | null;
  agreementTitle: string | null;
  contactDisplayName: string | null;
  scope: string;
  priceCents: number;
  currency: string;
  schedule: TradeAgreementSchedule | null;
  retainageBps: number;
  payWhenPaidDays: number | null;
  insuranceCertificateRequired: boolean;
  lienWaiverPolicy: string;
  state: TradeAgreementLinkState;
  existingSignature: TradeAgreementSignatureReceipt | null;
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "12 October 2026" — the way a signature is dated on this portal's paper.
 *
 * A bare `YYYY-MM-DD` (the schedule's start, a DATE column) is a calendar day,
 * not an instant: `new Date('2026-10-12')` is UTC midnight, which prints as
 * the 11th anywhere west of Greenwich. It is read as local date parts instead,
 * so a start date never slides a day. A full timestamp (a signature's own
 * `signed_at`) is an instant and is formatted as one.
 */
export function formatLongDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const calendar = CALENDAR_DATE.exec(value);
  const parsed = calendar
    ? new Date(Number(calendar[1]), Number(calendar[2]) - 1, Number(calendar[3]))
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

/**
 * "$38,000" whole, "$38,000.50" when there are cents. A trade price is agreed
 * to the cent, so the cents are printed whenever they exist and suppressed
 * when they do not — never rounded away.
 */
export function formatMoney(cents: number, currency = 'USD'): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

/** "5%" · "2.5%" — basis points as the percentage a person reads. */
export function formatBps(bps: number): string {
  const percent = bps / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2).replace(/0$/, '')}%`;
}

/** The schedule line: a start, a length, or both — and the sequencing prose beside it. */
export function scheduleLine(schedule: TradeAgreementSchedule | null): string | null {
  if (!schedule) return null;
  const parts: string[] = [];
  const start = formatLongDate(schedule.startOn);
  if (start) parts.push(`Starts ${start}`);
  if (typeof schedule.durationDays === 'number' && schedule.durationDays > 0) {
    parts.push(`${schedule.durationDays} ${schedule.durationDays === 1 ? 'day' : 'days'} on site`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Retainage, said as a hold-back rather than a deduction. */
export function retainageLine(bps: number): string {
  if (!bps) return 'Nothing is held back from your payments.';
  return `${formatBps(bps)} of each payment is held back until the work is complete.`;
}

/** Pay-when-paid, including the honest reading of no such condition at all. */
export function paymentLine(days: number | null): string {
  if (days === null || days === undefined) {
    return 'Your payment is not held for the studio being paid.';
  }
  if (days === 0) {
    return 'The studio pays you as soon as it is paid for this work.';
  }
  return `The studio pays you within ${days} ${days === 1 ? 'day' : 'days'} of being paid for this work.`;
}

export function insuranceLine(required: boolean): string {
  return required
    ? 'A certificate of insurance is required before you start.'
    : 'No certificate of insurance is required for this work.';
}

/**
 * Lien waivers, in sentences. A policy key this page does not know is never
 * printed raw — a database value is not copy — so an unknown key falls back to
 * the plain sentence that is true of every policy.
 */
const LIEN_WAIVER_LINES: Record<string, string> = {
  conditional_then_unconditional:
    'A conditional waiver with each payment request, an unconditional one once that payment clears.',
  unconditional_on_final: 'An unconditional waiver with the final payment.',
  none: 'No lien waiver is asked of you.',
};

export function lienWaiverLine(policy: string): string {
  return (
    LIEN_WAIVER_LINES[policy] ?? 'Lien waivers are exchanged as your studio sets out with each payment.'
  );
}
