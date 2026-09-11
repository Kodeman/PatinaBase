'use client';

/**
 * The delivery word — what became of an email, printed inline beside the thing
 * it was about (00591).
 *
 * `mode="attention"` is the row register: a ledger row says nothing at all
 * while the mail is behaving, and speaks only when the designer has to act.
 * `mode="all"` is the folio register, where the reader came to ask.
 *
 * No pill, no dot, no fill, no ✓ — the attention register is the terracotta
 * ink the Invoice folio's failed note already uses, and nothing else.
 */

import type { ReactNode } from 'react';
import type { EmailDelivery } from '@patina/supabase';
import { deliveryWord, isAttentionState } from '@/lib/delivery-ui';

export function DeliveryWord({
  delivery,
  recipient = null,
  mode = 'all',
  action,
  className = '',
}: {
  delivery: EmailDelivery | null | undefined;
  /** Fallback address when the log row carries none. */
  recipient?: string | null;
  mode?: 'all' | 'attention';
  /** A remedy, printed after an en-space. */
  action?: ReactNode;
  className?: string;
}) {
  if (!delivery) return null;
  if (mode === 'attention' && !isAttentionState(delivery.state)) return null;

  const word = deliveryWord(delivery, recipient);
  if (!word) return null;

  const attention = word.register === 'attention';

  // The live region is the word itself. `action` is a standing remedy, not
  // news, so it sits outside — an announced link would re-read on every poll.
  const span = (
    <span
      {...(attention ? { role: 'status' } : {})}
      data-testid="delivery-word"
      title={word.detail}
      className={`text-[11px] ${
        attention
          ? 'text-[var(--color-terracotta-ink)]'
          : 'text-[var(--text-muted)]'
      }`}
    >
      {word.text}
    </span>
  );

  if (!action) {
    return className ? <span className={className}>{span}</span> : span;
  }

  return (
    <span className={className}>
      {span}
      {/* A real en-space, as the docblock says — not a word space. */}
      {'\u2002'}
      {action}
    </span>
  );
}
