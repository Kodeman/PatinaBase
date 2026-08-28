'use client';

/**
 * The offered times (Match Ceremony, R106 §2) — 2–3 concrete slots, picked by
 * hand in v1; no calendar dependency (calendar-link was rejected: it bounces
 * the client out of Patina at the relationship's most fragile minute).
 * Scheduling rides inside the introduction — one moment, not two.
 *
 * A controlled block: native datetime-local inputs (manual date + time), a
 * fixed 45-minute default duration, add up to three, each removable, and the
 * prototype's count line ("N of 3 offered · offer two or three"). D4: flat
 * hairline rows, zero shadows.
 */

import type { CeremonySlot } from '@patina/supabase';
import { DocumentAction } from '../document-action';

export const SLOT_DURATION_MINUTES = 45;
export const MAX_SLOTS = 3;

/** ISO → the local `YYYY-MM-DDTHH:mm` shape datetime-local wants. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A fresh default: 10:00 AM the day after the latest slot (or tomorrow). */
function nextDefaultStart(existing: CeremonySlot[]): string {
  const base = existing.length
    ? new Date(
        Math.max(...existing.map((s) => new Date(s.starts_at).getTime())),
      )
    : new Date();
  const d = new Date(base);
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

const slotId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function CeremonySlots({
  slots,
  onChange,
}: {
  slots: CeremonySlot[];
  onChange: (slots: CeremonySlot[]) => void;
}) {
  const addSlot = () => {
    if (slots.length >= MAX_SLOTS) return;
    onChange([
      ...slots,
      {
        id: slotId(),
        starts_at: nextDefaultStart(slots),
        duration_minutes: SLOT_DURATION_MINUTES,
      },
    ]);
  };

  const removeSlot = (id: string) => onChange(slots.filter((s) => s.id !== id));

  const editSlot = (id: string, localValue: string) => {
    const parsed = new Date(localValue);
    if (Number.isNaN(parsed.getTime())) return; // ignore a half-typed value
    onChange(
      slots.map((s) =>
        s.id === id ? { ...s, starts_at: parsed.toISOString() } : s,
      ),
    );
  };

  const n = slots.length;

  return (
    <div>
      {slots.map((slot) => (
        <div
          key={slot.id}
          className="mb-2.5 flex items-center gap-3.5 rounded-[3px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-4 py-3"
        >
          <input
            type="datetime-local"
            value={toLocalInputValue(slot.starts_at)}
            onChange={(e) => editSlot(slot.id, e.target.value)}
            aria-label="Offered time"
            className="min-w-0 flex-1 bg-transparent font-heading text-[15.5px] text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          />
          <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
            {slot.duration_minutes} min
          </span>
          {/* A bare glyph that darkens on request (I107) — no plate, no rounded
              chrome; the 44px box stays, invisible, as the target. */}
          <button
            type="button"
            onClick={() => removeSlot(slot.id)}
            aria-label="Remove this time"
            className="da-glyph-btn inline-flex h-11 w-11 shrink-0 items-center justify-center font-mono text-[12px] leading-none"
          >
            ×
          </button>
        </div>
      ))}

      {n < MAX_SLOTS && (
        <DocumentAction
          actionKey="add-ceremony-time"
          surfaceKey="ceremony"
          regionKey="offered-times"
          variant="secondary"
          onClick={addSlot}
        >
          Add a time
        </DocumentAction>
      )}

      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {n} of {MAX_SLOTS} offered ·{' '}
        {n < 2 ? 'offer at least two' : 'offer two or three'}
      </p>
    </div>
  );
}
