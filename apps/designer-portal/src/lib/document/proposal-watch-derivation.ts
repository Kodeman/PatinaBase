/**
 * Proposal-watch derivation — the pure view-model behind the "With the client"
 * watch view (the Proposal section's treatment once a proposal is out the door).
 *
 * Mirrors desk-derivation.ts: React-free, DOM-free, unit-testable. It folds the
 * proposal row + the engagement aggregate (useProposalEngagementStats) + the raw
 * engagement events into a single model the component renders verbatim — so all
 * the "is it sent / opened / how many times / how long has it sat" logic lives in
 * one tested place and the JSX stays dumb.
 *
 * Type-only imports from @patina/supabase keep this file off the help-system →
 * @portabletext ESM trap that bites component-importing suites (it compiles away).
 */

import type { ProposalEngagementEvent, ProposalEngagementStats } from '@patina/supabase';

/** The proposal lifecycle as the watch view reads it (proposals.status). */
export type WatchStatus =
  | 'sent'
  | 'viewed'
  | 'revised'
  | 'expired'
  | 'declined'
  | 'accepted';

/** An ink stamp spec (Stamp component props). */
export interface WatchStamp {
  label: string;
  color: string;
  ink?: string;
}

/** One line in "the record" — the per-open log. `minutes`/`sectionLabel` are
 *  filled by Phase 4 (per-section attention); Phase 1 leaves them undefined. */
export interface WatchRecordEntry {
  at: string; // ISO timestamp
  kind: 'dispatched' | 'opened';
  minutes?: number;
  sectionLabel?: string;
}

/** Minimal slice of the proposal row the watch needs. */
export interface ProposalWatchInput {
  status: string | null | undefined;
  sentAt?: string | null;
  viewedAt?: string | null;
  acceptedAt?: string | null;
  version?: number | null;
}

export interface ProposalWatchModel {
  status: WatchStatus;
  stamp: WatchStamp;
  /** Parked here until the client advances it (sent / viewed / revised). */
  awaitingClient: boolean;
  /** Advanced — the client signed (collapse to a one-line seal). */
  settled: boolean;
  /** Terminal but re-enterable (expired / declined). */
  terminal: boolean;
  sentAt: string | null;
  acceptedAt: string | null;
  openedCount: number;
  lastOpenedAt: string | null;
  readingSeconds: number;
  mostReadSectionLabel: string | null;
  /** Whole days the proposal has sat on the relevant clock (since the open if
   *  opened, else since dispatch); null when there's no clock yet. */
  awaitingDays: number | null;
  /** It's been sitting long enough to read as "aging" (matches the Desk). */
  isAwaitingAged: boolean;
  /** Newest-first; the oldest entry is always "dispatched". */
  record: WatchRecordEntry[];
}

// Brand tokens — the same state hues the Desk stamps use (globals.css).
const CLAY = 'var(--color-clay)';
const SAGE = 'var(--color-sage)';
const GOLDEN = 'var(--color-golden-hour)';
const TERRACOTTA = 'var(--color-terracotta)';
const MUTED = 'var(--text-muted)';

/**
 * Days a viewed-but-unsigned proposal sits before it reads as "aging". Mirrors
 * the Desk's HESITATION_UNSIGNED_DAYS (desk-derivation.ts) so the document and
 * the Desk agree on when a proposal stops being "fresh".
 */
export const AWAITING_AGED_DAYS = 2;

const DAY_MS = 86_400_000;

const daysBetween = (earlierIso: string, now: Date) =>
  Math.floor((now.getTime() - new Date(earlierIso).getTime()) / DAY_MS);

// Human labels for the recorded section_type vocabulary (ProposalSection['type']
// — vision | concept | space_plan | selections | investment | timeline | terms).
const SECTION_LABELS: Record<string, string> = {
  vision: 'Vision',
  concept: 'Concept',
  space_plan: 'Space plan',
  selections: 'Selections',
  investment: 'Investment',
  timeline: 'Timeline',
  terms: 'Terms',
};

/** Map a recorded section_type to a human label; unknown types are humanized
 *  (underscores → spaces) rather than dropped. */
export function sectionLabel(sectionType: string | null | undefined): string | null {
  if (!sectionType) return null;
  return SECTION_LABELS[sectionType] ?? sectionType.replace(/_/g, ' ');
}

function deriveStamp(status: WatchStatus, aged: boolean): WatchStamp {
  switch (status) {
    case 'sent':
      return { label: 'SENT', color: CLAY };
    case 'viewed':
      // Opened and sitting too long without a signature → promote to AWAITING.
      return aged ? { label: 'AWAITING', color: GOLDEN } : { label: 'VIEWED', color: SAGE };
    case 'accepted':
      return { label: 'SIGNED', color: SAGE };
    case 'declined':
      return { label: 'DECLINED', color: TERRACOTTA };
    case 'expired':
      return { label: 'EXPIRED', color: MUTED };
    case 'revised':
      return { label: 'REVISED', color: MUTED };
    default:
      return { label: String(status).toUpperCase(), color: MUTED };
  }
}

/** Build the per-open log. `events` arrive newest-first (created_at desc); we
 *  keep that order and append the "dispatched" entry as the oldest line. */
function buildRecord(sentAt: string | null, events: ProposalEngagementEvent[]): WatchRecordEntry[] {
  const opens: WatchRecordEntry[] = events
    .filter((e) => e.event_type === 'opened')
    .map((e) => ({ at: e.created_at, kind: 'opened' as const }));
  if (sentAt) opens.push({ at: sentAt, kind: 'dispatched' });
  return opens;
}

/**
 * Fold the proposal + its engagement into the watch model. `now` is injected for
 * deterministic tests (the same shape desk-derivation uses).
 */
export function deriveProposalWatch(
  input: ProposalWatchInput,
  stats: ProposalEngagementStats | null | undefined,
  events: ProposalEngagementEvent[] | null | undefined,
  now: Date,
): ProposalWatchModel {
  const status = (input.status ?? 'sent') as WatchStatus;
  const sentAt = input.sentAt ?? null;
  const viewedAt = input.viewedAt ?? null;

  const openedCount = stats?.timesOpened ?? 0;
  const lastOpenedAt = stats?.lastOpenedAt ?? null;
  const readingSeconds = stats?.totalReadingSeconds ?? 0;
  const mostReadSectionLabel = sectionLabel(stats?.mostViewedSection);

  // The clock for "how long has this sat": once opened, since the (first) open;
  // otherwise since it was dispatched.
  const clockIso = status === 'viewed' ? viewedAt ?? sentAt : sentAt;
  const awaitingDays = clockIso ? daysBetween(clockIso, now) : null;

  const awaitingClient = status === 'sent' || status === 'viewed' || status === 'revised';
  const settled = status === 'accepted';
  const terminal = status === 'expired' || status === 'declined';

  const isAwaitingAged =
    (status === 'sent' || status === 'viewed') &&
    awaitingDays !== null &&
    awaitingDays >= AWAITING_AGED_DAYS;

  return {
    status,
    stamp: deriveStamp(status, isAwaitingAged),
    awaitingClient,
    settled,
    terminal,
    sentAt,
    acceptedAt: input.acceptedAt ?? null,
    openedCount,
    lastOpenedAt,
    readingSeconds,
    mostReadSectionLabel,
    awaitingDays,
    isAwaitingAged,
    record: buildRecord(sentAt, events ?? []),
  };
}
