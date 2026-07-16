/**
 * The Discovery fold's schedule line (Arrival Arc R106 §5 / build-plan 2.5,
 * scene 04 of `match-ceremony-prototype.html`). Pure derivation + formatting
 * only — no data fetching, no React. `discovery-schedule-line.tsx` reads a
 * `CeremonyForRelationship` (from `@patina/supabase`) and calls into here.
 */

import type { CeremonyOfferedSlot } from '@patina/supabase';

export type CeremonyScheduleState =
  | { kind: 'none' }
  | { kind: 'picked'; startsAt: string }
  | { kind: 'offered-fresh'; slots: CeremonyOfferedSlot[] }
  | { kind: 'offered-stale'; slots: CeremonyOfferedSlot[] };

/** A minimal ceremony shape — matches `CeremonyForRelationship`'s schedule-
 *  relevant fields without importing the whole hook module into test code. */
export interface CeremonyScheduleInput {
  state: 'draft' | 'sent' | 'picked';
  offered_slots: CeremonyOfferedSlot[] | null;
  picked_slot_starts_at: string | null;
}

const isFuture = (iso: string, now: Date): boolean => {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t > now.getTime();
};

/** True when at least one offered slot is still in the future. */
export function offeredSlotsAreFresh(
  slots: CeremonyOfferedSlot[] | null | undefined,
  now: Date = new Date(),
): boolean {
  return (slots ?? []).some((s) => isFuture(s.starts_at, now));
}

/**
 * Selects which of the fold's four schedule states applies:
 *   - no ceremony (or an un-sent draft) → 'none' — render nothing new.
 *   - state='picked' → 'picked', carrying the booked time.
 *   - state='sent' with ≥1 future slot → 'offered-fresh'.
 *   - state='sent' with all slots past (or an empty offer) → 'offered-stale'.
 */
export function deriveCeremonyScheduleState(
  ceremony: CeremonyScheduleInput | null | undefined,
  now: Date = new Date(),
): CeremonyScheduleState {
  if (!ceremony) return { kind: 'none' };

  if (ceremony.state === 'picked') {
    // Defensive: a 'picked' ceremony should always carry the booked time
    // (client_pick stamps it in the same transaction that flips state) —
    // treat a missing timestamp as an un-renderable fact rather than throw.
    if (!ceremony.picked_slot_starts_at) return { kind: 'none' };
    return { kind: 'picked', startsAt: ceremony.picked_slot_starts_at };
  }

  if (ceremony.state === 'sent') {
    const slots = ceremony.offered_slots ?? [];
    if (slots.length === 0) return { kind: 'none' };
    return offeredSlotsAreFresh(slots, now)
      ? { kind: 'offered-fresh', slots }
      : { kind: 'offered-stale', slots };
  }

  // 'draft' — never sent. useCeremonyForRelationship already filters these
  // out server-side; this branch is a defensive no-op, not a reachable path.
  return { kind: 'none' };
}

/** "Elena Vasquez" → "Elena"; a quiet fallback for an empty/odd name. */
export function firstNameOf(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return 'them';
  return trimmed.split(/\s+/)[0]!;
}

/** "Thu, Jul 23 · 2:00 PM" in the given IANA timezone (falls back to the
 *  viewer's local timezone when the ceremony carries none — defensive only;
 *  `ceremony_complete` always stamps a timezone on send). Built from
 *  `formatToParts` rather than the formatted string + regex, so the house
 *  " · " divider never depends on a locale's punctuation choices. */
export function fmtCeremonySlot(iso: string, timezone: string | null | undefined): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone || undefined,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')}, ${get('month')} ${get('day')} · ${get('hour')}:${get('minute')} ${get('dayPeriod')}`;
}
