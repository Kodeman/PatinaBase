'use client';

/**
 * Held for release (C-32, D1-12, R-PB2): a studio setting, off by default.
 * When on, an order at or over the amount — or every order — waits on its
 * paper for an owner or admin seat (System B, R-PB6) to release it. Other
 * seats read the setting and cannot change it; the server refuses a change
 * from anyone else (set_studio_release_gate, 00710).
 */

import { useEffect, useState } from 'react';
import { useSetStudioReleaseGate, useStudioReleaseGate } from '@patina/supabase';

const LABEL =
  'mb-1 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]';
const HELP = 'mt-1 text-[11px] leading-relaxed text-[var(--color-aged-oak)]';
const INPUT =
  'min-h-11 w-28 rounded-md border border-[var(--color-pearl)] bg-white px-2 text-[13px] text-[var(--color-charcoal)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]';

const dollars = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));

/** "2,500" or "$2500.00" → cents; null when it isn't a positive amount. */
function amountToCents(input: string): number | null {
  const n = Number(input.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** The sentence the setting reads as, for any seat. */
export function releaseGateSentence(
  thresholdCents: number | null | undefined,
  everyOrder: boolean | null | undefined,
): string {
  if (everyOrder) return 'Every order waits for an owner or admin to release it.';
  if (thresholdCents != null) {
    return `Orders over ${dollars(thresholdCents)} wait for an owner or admin to release them.`;
  }
  return 'Off. Orders go to the vendor when they are sent.';
}

export function StudioReleaseGateCard({
  studioId,
  canManage,
}: {
  studioId: string;
  canManage: boolean;
}) {
  const { data: gate, isLoading } = useStudioReleaseGate(studioId);
  const setGate = useSetStudioReleaseGate();
  const threshold = gate?.release_threshold_cents ?? null;
  const everyOrder = gate?.require_release_per_order ?? false;

  const [on, setOn] = useState(false);
  const [amount, setAmount] = useState('');
  const [perOrder, setPerOrder] = useState(false);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setOn(threshold != null || everyOrder);
    setAmount(threshold != null ? String(threshold / 100) : '');
    setPerOrder(everyOrder);
  }, [threshold, everyOrder]);

  if (!canManage) {
    return (
      <div className="mb-6 border-t border-[var(--color-pearl)] pt-5">
        <dl className="max-w-md" data-release-gate-readonly>
          <dt className={`${LABEL} mb-3`}>Held for release</dt>
          <dd className="text-[13px] text-[var(--color-charcoal)]">
            {isLoading ? '—' : releaseGateSentence(threshold, everyOrder)}
          </dd>
          <dd className={HELP}>Owners and admins change this.</dd>
        </dl>
      </div>
    );
  }

  const save = () => {
    const cents = on ? amountToCents(amount) : null;
    if (on && !perOrder && cents == null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setGate.mutate({
      organizationId: studioId,
      thresholdCents: on ? cents : null,
      requireReleasePerOrder: on && perOrder,
    });
  };

  return (
    <div className="mb-6 border-t border-[var(--color-pearl)] pt-5">
      <fieldset disabled={isLoading || setGate.isPending} data-release-gate>
        <legend className={`${LABEL} mb-3`}>Held for release</legend>
        <p className={`${HELP} mb-3 mt-0`}>
          A hire drafts the order; an owner or admin releases it before it goes to the vendor.
        </p>
        <div className="space-y-2">
          <label className="flex min-h-11 items-center gap-2 text-[13px] text-[var(--color-charcoal)]">
            <input
              type="radio"
              name="studio-release-gate"
              checked={!on}
              onChange={() => setOn(false)}
            />
            Off
          </label>
          <label className="flex min-h-11 flex-wrap items-center gap-2 text-[13px] text-[var(--color-charcoal)]">
            <input
              type="radio"
              name="studio-release-gate"
              checked={on}
              onChange={() => setOn(true)}
            />
            Orders over
            <span className="inline-flex items-center gap-1">
              $
              <input
                type="text"
                inputMode="decimal"
                aria-label="Release threshold in dollars"
                aria-invalid={invalid || undefined}
                className={INPUT}
                value={amount}
                onFocus={() => setOn(true)}
                onChange={(e) => {
                  setOn(true);
                  setAmount(e.target.value);
                }}
                placeholder="2,500"
              />
            </span>
            wait for an owner or admin to release them.
          </label>
          {on && (
            <label className="flex min-h-11 items-center gap-2 pl-6 text-[13px] text-[var(--color-charcoal)]">
              <input
                type="checkbox"
                checked={perOrder}
                onChange={(e) => setPerOrder(e.target.checked)}
              />
              Every order waits, whatever its total
            </label>
          )}
        </div>
        <button
          type="button"
          onClick={save}
          className="mt-3 inline-flex min-h-11 items-center rounded-md border border-[var(--color-pearl)] px-3 text-[13px] text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
        >
          Save
        </button>
        {invalid && (
          <p role="alert" className="mt-2 text-[12px] text-[var(--color-terracotta-ink)]">
            Name an amount, or let every order wait.
          </p>
        )}
        {setGate.isError && (
          <p role="alert" className="mt-2 text-[12px] text-[var(--color-terracotta-ink)]">
            Could not change the release setting. Only an owner or admin can change it.
          </p>
        )}
      </fieldset>
    </div>
  );
}
