'use client';

/**
 * PaymentPill — shared by the Procurement By Vendor and By Status views.
 *
 * Renders a compact pill describing the payment state on a purchase order
 * (or a single po_payments milestone). Color tokens match the PRD `.pay-pill`
 * CSS (slide 06–07):
 *
 *   pending          → champagne tint  (#C4A57B family)
 *   due              → terracotta tint (#D4A090 family)
 *   paid             → olive/sage tint (#A8B5A0 family)
 *   patina_handled   → clay tint (visually distinct champagne treatment
 *                       used when is_patina_catalog === true)
 *
 * Text content:
 *   - Short form (default): just the state label ("Pending", "Due", "Paid",
 *     "Patina handled").
 *   - Long form (optional `amount` + `dueDate` + `kind` / `label`):
 *       "Deposit $3,400 paid Apr 8"  / "Balance $3,400 due May 12"
 *
 * Why portal-local instead of @patina/design-system: the Badge primitive in
 * the design system is generic; payment pills use brand-specific RGBA tints
 * keyed to procurement semantics, and they are only used inside the
 * procurement workspace.
 */

import type { CSSProperties } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export type PaymentPillState = 'pending' | 'due' | 'paid' | 'patina_handled';

export interface PaymentPillProps {
  /** Payment state — drives color and default label. */
  state: PaymentPillState;
  /** Amount in cents (optional). Renders as `$3,400` in the long form. */
  amount?: number | null;
  /** Due / paid date (ISO string or null). Used in long form. */
  dueDate?: string | null;
  /**
   * Kind label prefix for the long form ("Deposit", "Balance", "Milestone").
   * Required if you want long-form text — without it the pill renders the
   * state label only.
   */
  kind?: string;
  /**
   * Explicit label override. If provided, replaces all generated text. Use
   * this for special cases like `"50/50 terms"` or `"Balance due before ship"`.
   */
  label?: string;
  /** Optional className for layout adjustments. */
  className?: string;
  /** Optional inline style overrides (e.g., to pin font-size in dense rows). */
  style?: CSSProperties;
}

// ─── Color tokens ───────────────────────────────────────────────────────────

interface PillStyle {
  bg: string;
  text: string;
  stateLabel: string;
}

const STATE_STYLES: Record<PaymentPillState, PillStyle> = {
  pending: {
    // PRD .pay-pill.pending — rgba(196,165,123,0.08), text var(--cl)
    // We bump to 0.15 alpha for legibility against patina off-white backgrounds.
    bg: 'rgba(196,165,123,0.15)',
    text: 'var(--color-clay)',
    stateLabel: 'Pending',
  },
  due: {
    // PRD .pay-pill.due — rgba(212,160,144,0.12), text var(--te)
    bg: 'rgba(212,160,144,0.18)',
    text: 'var(--color-terracotta)',
    stateLabel: 'Due',
  },
  paid: {
    // PRD .pay-pill.paid — rgba(168,181,160,0.12), text var(--sa)
    bg: 'rgba(168,181,160,0.18)',
    text: 'var(--color-sage)',
    stateLabel: 'Paid',
  },
  patina_handled: {
    // PRD slide 07 — clay tint, clay text, label "Patina handled"
    bg: 'rgba(196,165,123,0.20)',
    text: 'var(--color-clay)',
    stateLabel: 'Patina handled',
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildPillText(props: PaymentPillProps): string {
  const { state, amount, dueDate, kind, label } = props;
  if (label) return label;

  const styles = STATE_STYLES[state];

  // patina_handled is always the same label in short form
  if (state === 'patina_handled') return styles.stateLabel;

  // No kind = short form
  if (!kind) return styles.stateLabel;

  // Long form: "{kind} {amount?} {state-verb} {date?}"
  const verb = state === 'paid' ? 'paid' : state === 'due' ? 'due' : '';
  const parts: string[] = [kind];
  if (typeof amount === 'number') parts.push(formatDollars(amount));
  if (verb) parts.push(verb);
  if (dueDate) parts.push(formatDate(dueDate));

  // Fall back to short form if all we have is the kind label
  const text = parts.join(' ').trim();
  return text === kind ? `${kind} · ${styles.stateLabel}` : text;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PaymentPill(props: PaymentPillProps) {
  const { state, className, style } = props;
  const styles = STATE_STYLES[state];
  const text = buildPillText(props);

  return (
    <span
      className={[
        'inline-flex items-center rounded-[3px] px-2 py-0.5',
        'font-mono uppercase',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        backgroundColor: styles.bg,
        color: styles.text,
        fontFamily: 'var(--font-meta)',
        fontSize: '0.58rem',
        letterSpacing: '0.05em',
        fontWeight: 600,
        ...style,
      }}
    >
      {text}
    </span>
  );
}

export default PaymentPill;
