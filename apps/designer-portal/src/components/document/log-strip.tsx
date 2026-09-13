'use client';

/**
 * The log-offer strip (spec v1.2 §9, D10): a stopped timer offering its
 * elapsed time — editable up or down, never auto-trimmed. It replaces the
 * mobile bar; at desktop widths it rides above the Studio Drawer. The offer
 * survives navigation because its state lives in the provider.
 * Esc = discard, FIRST in the §3 priority order (before sheets and
 * put-down) — handled here on capture so nothing beneath sees the key.
 *
 * The entry is already written when the strip appears (crash-safe): "Log"
 * persists the adjustment + activity, "Discard" deletes the entry.
 */

import { useEffect, useState } from 'react';
import { useDocumentTime } from '@/hooks/document-time-provider';
import {
  ACTIVITIES,
  fmtMinutes,
  idleAnnotation,
  IDLE_THRESHOLD_SECONDS,
  isAdjusted,
} from '@/lib/document/time-derivation';
import { documentEvents } from '@/lib/analytics/document-events';
import { DocumentAction } from './document-action';
import { BillablePill, RateReadout, RateRoleMark } from './time-capture';
import type { TimeRateRole, TimeRateSource } from '@patina/supabase';

const SURFACE_KEY = 'time';
const REGION_KEY = 'log-offer';

export function LogStrip() {
  const { offer, offerOwnsEdge, logOffer, discardOffer } = useDocumentTime();
  const [minutes, setMinutes] = useState('');
  // HT-24 — the activity starts UNSET. The old default silently attributed
  // every timer-caught hour to 'design' the moment the strip was touched, so
  // "what the work was" was never empty and never true either.
  const [activity, setActivity] = useState('');
  const [billable, setBillable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!offer) return;
    setMinutes(String(offer.suggestedMinutes));
    setActivity('');
    // HT-11 — seeded from the answer the SERVER stored on the row, not from a
    // default. The pill can change it; nothing guesses it.
    setBillable(offer.billable);
  }, [offer]);

  useEffect(() => {
    if (!offer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      void discardOffer();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () =>
      window.removeEventListener('keydown', onKey, { capture: true });
  }, [offer, discardOffer]);

  // A chained-out entry is already saved. Keep its adjustment offer in the
  // provider, but do not lay an unrelated project's controls over the document
  // currently in hand — it can surface again once no other project is held
  // (for example, back at the Desk). D-B54: the rule is the PROVIDER's now,
  // and `MobileBar` yields the edge on the same boolean, so the strip refusing
  // an offer can never again leave the thumb edge unowned.
  if (!offer || !offerOwnsEdge) return null;

  const parsed = parseInt(minutes, 10);
  const valid = Number.isFinite(parsed) && parsed >= 1;
  const adjusted = valid && isAdjusted(offer, parsed);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await logOffer(parsed, activity || null, billable);
      // R21 week-one watch: strip engagement (logged, adjusted?, idle?).
      documentEvents.logStripActed({
        action: 'log',
        adjusted,
        had_idle: offer.idleSeconds >= IDLE_THRESHOLD_SECONDS,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      role="region"
      aria-label="Log time offer"
      data-mobile-edge-owner="log-offer"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-clay)] bg-[var(--color-charcoal)] px-3 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2 min-[1180px]:bottom-[60px] min-[1180px]:bg-[var(--bg-warm)] min-[1180px]:px-4 min-[1180px]:py-2"
    >
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-2 min-[1180px]:flex-row min-[1180px]:flex-wrap min-[1180px]:items-center min-[1180px]:justify-center min-[1180px]:gap-2.5">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p
            role="status"
            className="min-w-0 truncate text-[14px] text-[rgba(250,247,242,0.78)] min-[1180px]:text-[var(--text-body)]"
          >
            <strong className="font-medium text-[var(--color-pearl)] min-[1180px]:text-[var(--text-primary)]">
              {offer.projectName}
            </strong>{' '}
            · {fmtMinutes(offer.suggestedMinutes)} in hand
          </p>
          <span className="shrink-0 font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-clay)] min-[1180px]:hidden">
            {idleAnnotation(offer.idleSeconds) ??
              (adjusted
                ? `Was ${fmtMinutes(offer.suggestedMinutes)}`
                : 'Log time')}
          </span>
        </div>

        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto_auto] items-center gap-1.5 min-[1180px]:contents">
          <input
            type="number"
            min={1}
            aria-label="Minutes to log"
            className="min-h-11 w-[72px] rounded-[4px] border border-[rgba(250,247,242,0.22)] bg-[rgba(250,247,242,0.06)] px-2 text-[16px] text-[var(--color-pearl)] focus:border-[var(--color-clay)] focus:outline-none min-[1180px]:border-[var(--border-default)] min-[1180px]:bg-[var(--bg-surface)] min-[1180px]:text-[16px] min-[1180px]:text-[var(--text-primary)]"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
          <select
            aria-label="Activity"
            className="min-h-11 min-w-0 rounded-[4px] border border-[rgba(250,247,242,0.22)] bg-[rgba(250,247,242,0.06)] px-2 text-[16px] text-[var(--color-pearl)] focus:border-[var(--color-clay)] focus:outline-none min-[1180px]:border-[var(--border-default)] min-[1180px]:bg-[var(--bg-surface)] min-[1180px]:text-[16px] min-[1180px]:text-[var(--text-primary)]"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
          >
            {/* HT-24 — honest, and never required. */}
            <option value="">activity not set</option>
            {ACTIVITIES.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
          <DocumentAction
            actionKey="log-time-offer"
            surfaceKey="time"
            regionKey="log-offer"
            variant="primary"
            disabled={!valid || busy}
            loading={busy}
            loadingLabel="Logging…"
            onClick={() => void submit()}
            className="min-h-11 max-[1179px]:!text-[var(--color-off-white)]"
          >
            Log
          </DocumentAction>
          <DocumentAction
            actionKey="discard-time-offer"
            surfaceKey="time"
            regionKey="log-offer"
            variant="tertiary"
            disabled={busy}
            onClick={() => {
              documentEvents.logStripActed({
                action: 'discard',
                adjusted: false,
                had_idle: offer.idleSeconds >= IDLE_THRESHOLD_SECONDS,
              });
              void discardOffer();
            }}
            className="min-h-11 max-[1179px]:!text-[rgba(250,247,242,0.72)]"
          >
            Discard
          </DocumentAction>
        </div>

        {/* HT-11/HT-12/HT-26 — the billable answer, what priced the hour, and
            (only for a member who holds more than one) which of her roles did.
            All three arrive already answered: the zero-tap path stays zero. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <BillablePill
            value={billable}
            onChange={setBillable}
            disabled={busy}
            surfaceKey={SURFACE_KEY}
            regionKey={REGION_KEY}
          />
          <RateReadout
            entry={{
              hourly_rate_cents: offer.hourlyRateCents,
              rate_source: offer.rateSource as TimeRateSource | null,
              rate_role: offer.rateRole as TimeRateRole | null,
              billable,
              rated_amount_cents: offer.ratedAmountCents,
            }}
          />
          <RateRoleMark
            projectId={offer.projectId}
            role={(offer.rateRole as TimeRateRole | null) ?? null}
          />
        </div>

        {adjusted && (
          <span className="hidden font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--text-muted)] min-[1180px]:inline">
            adjusted from {fmtMinutes(offer.suggestedMinutes)}
          </span>
        )}
        {/* D10: idle is annotated, never trimmed — the designer decides if the
            quiet minutes were work. */}
        {idleAnnotation(offer.idleSeconds) && (
          <span className="hidden font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--text-muted)] min-[1180px]:inline">
            {idleAnnotation(offer.idleSeconds)}
          </span>
        )}
      </div>
    </section>
  );
}
