/**
 * Proposal-watch derivation — the pure view-model behind the "With the client"
 * watch view (the Proposal section's treatment once a proposal is out the door),
 * and behind SP3's send-wall state line, which opens BOTH walls (this one and
 * the design-services status block) so neither can be silent.
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

/** One line in "the record" — the per-open log. For an 'opened' line,
 *  `minutes`/`sectionLabel` carry that session's reading time + most-dwelt
 *  section (R71 Phase 4); undefined when the session recorded no section views. */
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
  lastNudgedAt?: string | null;
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
  /** When the client was last nudged (gentle reminder), and whether a nudge can
   *  be sent right now — only while in the client's hands and past the cooldown. */
  lastNudgedAt: string | null;
  canNudge: boolean;
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
const CLAY_INK = 'var(--color-clay-ink)';
const SAGE = 'var(--color-sage)';
const GOLDEN = 'var(--color-golden-hour)';
const TERRACOTTA = 'var(--color-terracotta)';
const TERRACOTTA_INK = 'var(--color-terracotta-ink)';
const MUTED = 'var(--text-muted)';

/**
 * Days a viewed-but-unsigned proposal sits before it reads as "aging". Mirrors
 * the Desk's HESITATION_UNSIGNED_DAYS (desk-derivation.ts) so the document and
 * the Desk agree on when a proposal stops being "fresh".
 */
export const AWAITING_AGED_DAYS = 2;

/** A proposal can be nudged at most once per this many days — a reminder, never
 *  a pester. Kept in lockstep with the cooldown in 00231 nudge_proposal. */
export const NUDGE_COOLDOWN_DAYS = 3;

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
      return { label: 'SENT', color: CLAY, ink: CLAY_INK };
    case 'viewed':
      // Opened and sitting too long without a signature → promote to AWAITING.
      return aged ? { label: 'AWAITING', color: GOLDEN } : { label: 'VIEWED', color: SAGE };
    case 'accepted':
      return { label: 'SIGNED', color: SAGE };
    case 'declined':
      return { label: 'DECLINED', color: TERRACOTTA, ink: TERRACOTTA_INK };
    case 'expired':
      return { label: 'EXPIRED', color: MUTED };
    case 'revised':
      return { label: 'REVISED', color: MUTED };
    default:
      return { label: String(status).toUpperCase(), color: MUTED };
  }
}

/**
 * Build the per-open log. `events` arrive newest-first (created_at desc); we
 * keep that order and append the "dispatched" entry as the oldest line.
 *
 * R71 Phase 4 — per-section attention: each open is enriched with the reading
 * minutes + the most-dwelt section of THAT viewing session, by windowing the
 * section_viewed events between consecutive opens. A section_view belongs to the
 * most recent open at/before its time, so for opens[i] the session runs from its
 * timestamp up to the next NEWER open (opens[i-1], since the array is desc).
 */
function buildRecord(sentAt: string | null, events: ProposalEngagementEvent[]): WatchRecordEntry[] {
  const opens = events.filter((e) => e.event_type === 'opened'); // newest-first
  const sections = events.filter((e) => e.event_type === 'section_viewed' && e.section_type);
  const ms = (iso: string) => new Date(iso).getTime();

  const record: WatchRecordEntry[] = opens.map((o, i) => {
    const start = ms(o.created_at);
    const end = i === 0 ? Infinity : ms(opens[i - 1].created_at);
    const inWindow = sections.filter((s) => {
      const t = ms(s.created_at);
      return t >= start && t < end;
    });

    let minutes: number | undefined;
    let sectionLabelText: string | undefined;
    if (inWindow.length) {
      const totalSec = inWindow.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
      if (totalSec > 0) minutes = Math.max(1, Math.round(totalSec / 60));
      // The section they dwelt on most this session.
      const byType = new Map<string, number>();
      for (const s of inWindow) {
        byType.set(s.section_type!, (byType.get(s.section_type!) ?? 0) + (s.duration_seconds ?? 0));
      }
      const top = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > 0) sectionLabelText = sectionLabel(top[0]) ?? undefined;
    }
    return { at: o.created_at, kind: 'opened' as const, minutes, sectionLabel: sectionLabelText };
  });

  if (sentAt) record.push({ at: sentAt, kind: 'dispatched' });
  return record;
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

  // A nudge is offered only while the proposal is in the client's hands
  // (sent/viewed) and the cooldown since the last nudge has lapsed.
  const lastNudgedAt = input.lastNudgedAt ?? null;
  const nudgeable = status === 'sent' || status === 'viewed';
  const sinceNudge = lastNudgedAt ? daysBetween(lastNudgedAt, now) : null;
  const canNudge = nudgeable && (sinceNudge === null || sinceNudge >= NUDGE_COOLDOWN_DAYS);

  return {
    status,
    stamp: deriveStamp(status, isAwaitingAged),
    awaitingClient,
    settled,
    terminal,
    sentAt,
    acceptedAt: input.acceptedAt ?? null,
    lastNudgedAt,
    canNudge,
    openedCount,
    lastOpenedAt,
    readingSeconds,
    mostReadSectionLabel,
    awaitingDays,
    isAwaitingAged,
    record: buildRecord(sentAt, events ?? []),
  };
}

/* ── SP3: the send-wall state line ─────────────────────────────────────────
   Between the send and the seal the wall always says where the agreement
   stands and what can be done about it. The decision is here, not in the
   component, because it turns on three sources that disagree with each other
   in ways only a table can keep straight: the proposal's own status, the
   design-services rail's `commercial_state`, and whether the document was
   handed over on paper at all. ─────────────────────────────────────────── */

/** The only verb the wall offers today. Resend/preview live in the block
 *  below it; revise is retired for legacy proposals (I91 contract). */
export type SendWallVerb = 'nudge';

export interface SendWallInput {
  watch: ProposalWatchModel;
  /** `proposals.commercial_state` (00412/00414) — null on a legacy proposal.
   *  Load-bearing: a client's signature on a design services agreement moves
   *  THIS column while `proposals.status` stays 'sent'. */
  commercialState: string | null;
  /** `proposals.issued_on_paper` (00477) — handed over, never dispatched. */
  issuedOnPaper: boolean;
}

export interface SendWallLine {
  /** "Sent 3 days ago" · "Sent Jun 12" · "Issued on paper". */
  sentText: string;
  /** Exactly one of `verb` / `stateWord` is non-null: the line either offers
   *  an act or names a state, never both and never neither. */
  verb: SendWallVerb | null;
  stateWord: string | null;
}

/** Commercial states whose block below states the whole story — the line
 *  stands down rather than printing a second, thinner version of it.
 *  ('expired' is deliberately absent: 00414 removed it from the check
 *  constraint, so no row can carry it.) */
const SEND_WALL_STOOD_DOWN_STATES = ['executed', 'declined', 'superseded'];

/** Beyond this the relative phrase stops helping and the wall states the day. */
const SENT_PHRASE_CEILING_DAYS = 30;

const fmtShortDay = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(iso),
  );

/**
 * Whole CALENDAR days between two instants in the viewer's own zone — not
 * 24-hour buckets. Something sent at 11pm is "yesterday" at 1am, which is how
 * a person reads a date; `daysBetween` above answers a different question (how
 * long has this SAT) and is right to floor elapsed time instead.
 */
function calendarDaysBetween(earlierIso: string, now: Date): number | null {
  const then = new Date(earlierIso);
  if (Number.isNaN(then.getTime())) return null;
  const thenMidnight = new Date(
    then.getFullYear(),
    then.getMonth(),
    then.getDate(),
  ).getTime();
  const nowMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return Math.round((nowMidnight - thenMidnight) / DAY_MS);
}

function sentText(
  sentAt: string | null,
  issuedOnPaper: boolean,
  now: Date,
): string {
  // 00477's paper door issues without sending, so sent_at is legitimately null.
  if (!sentAt) return issuedOnPaper ? 'Issued on paper' : 'Sent';
  const days = calendarDaysBetween(sentAt, now);
  if (days === null || days < 0 || days > SENT_PHRASE_CEILING_DAYS) {
    return `Sent ${fmtShortDay(sentAt)}`;
  }
  if (days === 0) return 'Sent today';
  if (days === 1) return 'Sent yesterday';
  return `Sent ${days} days ago`;
}

/**
 * Where the document stands, in the wall's own words. `deriveSendWallLine`
 * calls this whenever it has no verb to offer — and the renderer calls it for
 * the one case the derivation cannot see: a table head has hoisted the nudge,
 * so the line has lost its verb without the state behind it changing. Without
 * it the wall read "Sent 5 days ago" and stopped, over an action row with no
 * action.
 */
export function sendWallStateWord(
  watch: ProposalWatchModel,
  commercialState: string | null,
): string {
  if (commercialState === 'client_signed') return 'awaiting countersign';
  if (watch.status === 'declined') return 'declined by the client';
  if (watch.status === 'expired') return 'expired unsigned';
  if (watch.status === 'revised') return 'superseded by a newer version';
  if (watch.lastNudgedAt) return `nudged ${fmtShortDay(watch.lastNudgedAt)}`;
  return 'awaiting the client’s signature';
}

/**
 * The send wall's one line. Null means the wall stands down — a draft has no
 * wall yet, a seal speaks for itself, and an executed or terminal commercial
 * edition is stated in full by the block below.
 */
export function deriveSendWallLine(
  { watch, commercialState, issuedOnPaper }: SendWallInput,
  now: Date,
): SendWallLine | null {
  if (watch.settled) return null;
  if (!watch.awaitingClient && !watch.terminal) return null;
  if (commercialState && SEND_WALL_STOOD_DOWN_STATES.includes(commercialState)) {
    return null;
  }

  const countersignPending = commercialState === 'client_signed';
  // A paper-issued agreement is NEVER nudged: nudge_proposal (00231) would
  // accept it, burn the three-day cooldown and dispatch a reminder email —
  // to a household that may have no address on file and was never emailed in
  // the first place. The record would then read "Issued on paper — nudged
  // Aug 15": a reminder permanently logged that went nowhere.
  const verb: SendWallVerb | null =
    watch.canNudge && !countersignPending && !issuedOnPaper ? 'nudge' : null;

  const stateWord = verb ? null : sendWallStateWord(watch, commercialState);

  return {
    sentText: sentText(watch.sentAt, issuedOnPaper, now),
    verb,
    stateWord,
  };
}
