'use client';

/**
 * The single mobile-first form on the trade RFQ guest page: a number and an
 * optional note, submitted through the use-server action in ./actions.ts.
 * Kept as its own client component so the page shell stays a server
 * component, exactly like the field guest page's field-actions.tsx rows.
 *
 * Every end state is deliberately narrow — an amount, a date, a plain
 * sentence — never a scope price, never another party's number.
 */

import { useState, useTransition } from 'react';
import { Button, Textarea } from '@patina/design-system';
import { submitRfqResponse } from './actions';
import { formatLongDate, formatMoney, type TradeRfqLinkExistingResponse } from './types';

const dollarsToCents = (value: string): number => {
  // An empty/blank field is "nothing entered," not "zero" — Number('') is 0
  // (finite), which would otherwise sail past the isFinite guard below and
  // silently submit a $0 number.
  if (!value.trim()) return NaN;
  const parsed = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : NaN;
};

const centsToDollars = (cents: number): string => (cents > 0 ? String(cents / 100) : '');

type Outcome =
  | { kind: 'saved' | 'replayed'; amountCents: number; respondedAt: string | null }
  | { kind: 'bid_locked' }
  | { kind: 'bid_window_closed' };

export function RfqResponseForm({
  token,
  existingResponse,
}: {
  token: string;
  existingResponse: TradeRfqLinkExistingResponse | null;
}) {
  const [amount, setAmount] = useState(centsToDollars(existingResponse?.amountCents ?? 0));
  const [note, setNote] = useState(existingResponse?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    const amountCents = dollarsToCents(amount);
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      setError('Enter what you’d charge for this work.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitRfqResponse(token, {
        amountCents,
        note: note.trim() || null,
      });
      if (result.status === 'invalid') {
        setError('That could not be sent — refresh the page and try again.');
        return;
      }
      setOutcome(
        result.status === 'saved' || result.status === 'replayed'
          ? {
              kind: result.status,
              amountCents: result.amountCents,
              respondedAt: result.respondedAt,
            }
          : { kind: result.status },
      );
    });
  };

  if (outcome?.kind === 'saved' || outcome?.kind === 'replayed') {
    const date = formatLongDate(outcome.respondedAt);
    return (
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-6 text-center">
        <p className="type-item-name">Your number is in.</p>
        <p className="type-body-small mt-2 text-[var(--text-muted)]">
          {formatMoney(outcome.amountCents)}
          {date ? ` · ${date}` : ''}
        </p>
        <p className="type-body-small mt-3 text-[var(--text-muted)]">
          Your designer will follow up if this one is selected.
        </p>
      </div>
    );
  }

  if (outcome?.kind === 'bid_locked') {
    // bid_locked fires when THIS party's own number was the one selected —
    // the reply must read as a win, never as a rejection or a "someone else
    // got it" brush-off.
    return (
      <p className="type-body rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-8 text-center">
        Your number was chosen — the studio will be in touch. This link is closed to changes.
      </p>
    );
  }

  if (outcome?.kind === 'bid_window_closed') {
    return (
      <p className="type-body rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-8 text-center">
        This request is closed — the work has been awarded.
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-4"
    >
      <label className="type-body-small block text-[var(--text-muted)]">
        Your number
        <input
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="4,150"
          aria-label="Your number"
          className="mt-1 min-h-[44px] w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-base text-[var(--text-primary)]"
        />
      </label>
      <label className="type-body-small block text-[var(--text-muted)]">
        Note (optional)
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="Anything your designer should know"
          className="mt-1 text-base"
        />
      </label>
      {error && (
        <p role="alert" className="type-body-small text-[var(--color-terracotta)]">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="min-h-[44px] w-full" disabled={isPending}>
        {isPending ? 'Sending…' : existingResponse ? 'Update your number' : 'Send your number'}
      </Button>
    </form>
  );
}
