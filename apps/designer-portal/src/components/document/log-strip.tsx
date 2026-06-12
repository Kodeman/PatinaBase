'use client';

/**
 * The log-offer strip (spec v1.2 §9, D10): a stopped timer offering its
 * elapsed time — editable up or down, never auto-trimmed. Rides above the
 * Studio Drawer and survives navigation (the offer lives in the provider).
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
  isAdjusted,
} from '@/lib/document/time-derivation';

export function LogStrip() {
  const { offer, logOffer, discardOffer } = useDocumentTime();
  const [minutes, setMinutes] = useState('');
  const [activity, setActivity] = useState('design');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!offer) return;
    setMinutes(String(offer.suggestedMinutes));
    setActivity('design');
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
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [offer, discardOffer]);

  if (!offer) return null;

  const parsed = parseInt(minutes, 10);
  const valid = Number.isFinite(parsed) && parsed >= 1;
  const adjusted = valid && isAdjusted(offer, parsed);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await logOffer(parsed, activity);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      aria-label="Log time offer"
      className="fixed inset-x-0 bottom-[42px] z-50 flex flex-wrap items-center justify-center gap-2.5 border-t border-[rgba(196,165,123,0.4)] bg-[#332e29] px-4 py-2"
    >
      <p className="text-[12px] text-[rgba(250,247,242,0.8)]">
        <strong className="font-medium text-[var(--color-pearl)]">{offer.projectName}</strong> was
        in hand for{' '}
        <strong className="font-medium text-[var(--color-pearl)]">
          {fmtMinutes(offer.suggestedMinutes)}
        </strong>{' '}
        — log
      </p>
      <input
        type="number"
        min={1}
        aria-label="Minutes to log"
        className="w-[72px] rounded-[4px] border border-[rgba(250,247,242,0.2)] bg-transparent px-2 py-1 text-[12px] text-[var(--color-off-white)] focus:border-[var(--color-clay)] focus:outline-none"
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
        }}
      />
      <select
        aria-label="Activity"
        className="rounded-[4px] border border-[rgba(250,247,242,0.2)] bg-transparent px-2 py-1 text-[12px] text-[var(--color-off-white)] focus:border-[var(--color-clay)] focus:outline-none [&_option]:bg-[var(--color-charcoal)]"
        value={activity}
        onChange={(e) => setActivity(e.target.value)}
      >
        {ACTIVITIES.map((a) => (
          <option key={a.key} value={a.key}>
            {a.label}
          </option>
        ))}
      </select>
      {adjusted && (
        <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[rgba(250,247,242,0.45)]">
          adjusted from {fmtMinutes(offer.suggestedMinutes)}
        </span>
      )}
      {/* D10: idle is annotated, never trimmed — the designer decides if the
          quiet minutes were work. */}
      {idleAnnotation(offer.idleSeconds) && (
        <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[rgba(250,247,242,0.45)]">
          {idleAnnotation(offer.idleSeconds)}
        </span>
      )}
      <button
        type="button"
        disabled={!valid || busy}
        onClick={() => void submit()}
        className="rounded-[4px] border border-[var(--color-clay)] bg-[var(--color-clay)] px-3 py-1 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        Log
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void discardOffer()}
        className="rounded-[4px] border border-[rgba(250,247,242,0.25)] px-3 py-1 text-[12px] text-[rgba(250,247,242,0.75)] hover:border-[var(--color-clay)]"
      >
        Discard
      </button>
    </div>
  );
}
