/**
 * Desk data hook — reads the `document_state` view (00188) and derives the
 * two Desk populations. Portal-local like use-time-tracking.ts.
 *
 * 60s refetch = the Desk "re-sorts in the background" (D2) without any
 * push/toast machinery. The view is not in the generated database.types.ts
 * yet, so the client is cast like the other portal hooks.
 *
 * R28: the same fetch reads `delivery_events` (00150) and classifies
 * schedule conflicts client-side (the Wave 2.1 precedent) — collisions rise
 * as need lines, drift rides the in-motion chips. One derivation cycle: the
 * next 60s tick re-reads both sources together.
 *
 * Arrival Arc Phase 0 (DECISIONS.md I64): a token-refresh failure makes the
 * client go sessionless — `document_state` then returns HTTP 200 with ZERO
 * rows, no error. Left unguarded, `partitionDesk([])` reads as a legitimate
 * quiet desk, indistinguishable from a truly empty one. The fix stack lives
 * here: `placeholderData: keepPreviousData` so a background refetch never
 * flashes an empty desk over good data; a suspicious-empty guard that
 * verifies the session before trusting a 0-row read and throws when the
 * session is invalid (surfacing the truth — an auth-degraded read — as an
 * error, which desk/page.tsx now has a coherent whole-desk state for); and a
 * fire-and-forget zero-row telemetry breadcrumb when a 0-row read follows a
 * non-zero cached result, for the week-one watch.
 */

import { useRef } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { createBrowserClient, type Invoice } from '@patina/supabase';
import {
  partitionDesk,
  type DeskFolder,
  type DocumentStateRow,
  type MotionChip,
  type NeedLine,
} from '@/lib/document/desk-derivation';
import { buildDeskConflicts } from '@/lib/document/desk-conflicts';
import {
  buildDeskSchedule,
  type DeskMilestoneRow,
  type DeskPhaseRow,
  type DeskProposalRow,
} from '@/lib/document/desk-schedule';
import { buildDeskReceivables } from '@/lib/document/desk-receivables';
import {
  buildDeskFlaggedLines,
  type FlaggedLineRow,
} from '@/lib/document/desk-flagged-lines';
import {
  buildDeskCeremoniesByLead,
  buildDeskCeremoniesByDesignerClient,
  type CeremonyRow,
} from '@/lib/document/desk-ceremonies';
import { documentEvents } from '@/lib/analytics/document-events';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

export interface DeskData {
  folders: DeskFolder[];
  chips: MotionChip[];
  /** Engagement ids this composition actually derived a need for — see
   *  partitionDesk. Presence here is what makes a "no need" answer sayable.
   *  A plain object so React Query's replaceEqualDeep can structurally share it
   *  across the 60s tick (it does not recurse into Sets). */
  composed: Record<string, true>;
}

/**
 * One sentinel each, and they mean different things: `undefined` = the Desk has
 * not answered for this document, so the caller derives locally; `null` = this
 * composition looked at the engagement and found no need. deriveDocumentGuide
 * reads the pair the same way, so a genuine "no need" is honored instead of
 * being re-derived from the row.
 *
 * Absence from `folders` alone is NOT an answer — the Desk's cache is shared
 * with the CommandBar and is hot on every document route, so a document the
 * composition never covered (archived, outside this read, a different studio's)
 * would otherwise read as need-free. Only `composed` membership licenses `null`.
 */
export function selectOperationalNeedForDocument(
  data: DeskData | undefined,
  engagementId: string | null | undefined,
): NeedLine | null | undefined {
  if (!data || !engagementId) return undefined;
  if (data.composed[engagementId] !== true) return undefined;
  return data.folders.find((folder) => folder.row.engagement_id === engagementId)?.need ?? null;
}

/** Conflict window: today → +120d covers any configured install horizon. */
const CONFLICT_WINDOW_DAYS = 120;

/**
 * Caps on the desk-wide schedule reads (risk R1). Sized with headroom over any
 * plausible studio: the single composing designer on prod carries 59 chained
 * phases across 14 projects. A read that comes back FULL is treated as no
 * answer at all rather than a partial one — see the truncation branch below.
 */
export const DESK_PHASE_LIMIT = 2000;
const DESK_MILESTONE_LIMIT = 500;
const DESK_PROPOSAL_LIMIT = 500;

/** Flatten the item_feedback→proposal_items→proposals embed into the flagged-row
 *  shape buildDeskFlaggedLines reads. Tolerant of PostgREST returning a to-one
 *  embed as either an object or a single-element array. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenFlaggedRows(rows: any): FlaggedLineRow[] {
  if (!Array.isArray(rows)) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const one = (v: any) => (Array.isArray(v) ? v[0] : v);
  return rows
    .map((r) => {
      const pi = one(r?.proposal_items);
      const proposal = one(pi?.proposals);
      return {
        proposalId: pi?.proposal_id as string,
        proposalTitle: (proposal?.title ?? null) as string | null,
      };
    })
    .filter((r) => !!r.proposalId);
}

/** B4: the board-pin equivalent — item_feedback→proposal_board_items→
 *  proposal_boards→proposals. Folds into the SAME FlaggedLineRow shape, so a
 *  board flag and a line flag on one proposal sum into one Desk folder. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenBoardFlaggedRows(rows: any): FlaggedLineRow[] {
  if (!Array.isArray(rows)) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const one = (v: any) => (Array.isArray(v) ? v[0] : v);
  return rows
    .map((r) => {
      const pbi = one(r?.proposal_board_items);
      const pb = one(pbi?.proposal_boards);
      const proposal = one(pb?.proposals);
      return {
        proposalId: pb?.proposal_id as string,
        proposalTitle: (proposal?.title ?? null) as string | null,
      };
    })
    .filter((r) => !!r.proposalId);
}

export function useDeskEngagements(options: { enabled?: boolean } = {}) {
  // Arrival Arc Phase 0 (I64): tracks the last successfully computed Desk so
  // the zero-row breadcrumb can tell "went quiet after real work" apart from
  // "was already quiet" — a fresh mount has nothing to compare against, so it
  // never breadcrumbs on first load. Lives outside TanStack's own cache
  // because the queryFn needs it read-and-write on every call, synchronously.
  const previousResultRef = useRef<DeskData | null>(null);

  return useQuery<DeskData>({
    queryKey: ['document-state', 'desk'],
    enabled: options.enabled ?? true,
    refetchInterval: 60_000,
    // A background refetch (the 60s tick) never flashes an empty desk over
    // good data while the request is in flight — the prior result stays on
    // screen until the new one resolves (or errors, see the guard below).
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const supabase = getSupabase();
      const today = new Date().toISOString().slice(0, 10);
      const horizon = new Date(Date.now() + CONFLICT_WINDOW_DAYS * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const [
        { data, error },
        { data: events, error: eventsError },
        { data: invoices, error: invoicesError },
        { data: flaggedFeedback, error: flaggedError },
        { data: boardFlagged, error: boardFlaggedError },
        { data: ceremonies, error: ceremoniesError },
        { data: deskPhases, error: deskPhasesError },
        { data: deskMilestones, error: deskMilestonesError },
        { data: deskProjectStarts, error: deskProjectStartsError },
        { data: deskProposals, error: deskProposalsError },
      ] = await Promise.all([
        supabase.from('document_state').select('*').order('updated_at', { ascending: false }),
        supabase
          .from('delivery_events')
          .select('*')
          .gte('event_date', today)
          .lte('event_date', horizon),
        // R36: open receivables for the overdue → Desk need line. Just the
        // columns the classifier needs (RLS scopes to the designer's invoices).
        supabase
          .from('invoices')
          .select(
            'id, project_id, status, due_date, total_cents, amount_paid_cents, invoice_number, ar_last_chased_at',
          )
          .in('status', ['sent', 'partially_paid']),
        // C4: unresolved per-line client rejections → the "N lines flagged" need.
        // RLS scopes item_feedback to the designer's own proposals; the inner
        // join carries the proposal id + title for the need line. (Same join the
        // proposal-feedback hook uses, so the relationship names are proven.)
        supabase
          .from('item_feedback')
          .select('proposal_items!inner(proposal_id, proposals!inner(title))')
          .eq('verdict', 'rejected')
          .is('resolved_at', null),
        // B4: unresolved board-PIN rejections → the same "N lines flagged" need.
        // proposal_board_items → proposal_boards → proposals(title). Project-owned
        // boards (proposal_id NULL) never carry verdicts, so the inner join to
        // proposals scopes this to proposal-stage boards automatically.
        supabase
          .from('item_feedback')
          .select('proposal_board_items!inner(proposal_boards!inner(proposal_id, proposals!inner(title)))')
          .eq('verdict', 'rejected')
          .is('resolved_at', null),
        // R106 (the Arrival Arc): the designer's own match_ceremonies rows —
        // the parked-card need (draft, keyed by lead_id) and the in-motion
        // chip states (sent/picked, keyed by designer_client_id). RLS already
        // scopes this to the designer's own rows (match_ceremonies_designer_all);
        // a flag-off designer simply has none, so this feed is empty and every
        // ceremony-derived branch downstream never fires.
        supabase
          .from('match_ceremonies')
          .select(
            'id, lead_id, designer_client_id, state, intro_text, offered_slots, offered_at, picked_slot_starts_at, timezone, thread_id, created_at',
          ),
        // R108: the schedule feed. Chain columns only, never `*` — this read is
        // desk-wide (R1 perf). It cannot filter on the project ids the
        // document_state read returns, because that read is in this same batch;
        // RLS already scopes project_phases to the designer's own projects.
        supabase
          .from('project_phases')
          .select(
            'id, project_id, name, phase_key, status, sort_order, lane, duration_days, duration_weeks, follows_phase_id, anchor_date, start_date, target_end_date',
          )
          .order('project_id')
          .limit(DESK_PHASE_LIMIT),
        // schedule_milestones has no project_id of its own — every milestone
        // hangs off a phase, so the phase id carries the grouping key.
        supabase
          .from('schedule_milestones')
          .select('id, phase_id, name, kind, offset_days, anchor_date, status, sort_order')
          .order('phase_id')
          .limit(DESK_MILESTONE_LIMIT),
        // R100's forward-compute origin, per project. Without it an unanchored
        // chain can only ever resolve as legacy dates, never as a Frame.
        supabase.from('projects').select('id, start_date').limit(DESK_PHASE_LIMIT),
        // R109/R110 (00475): live schedule proposals, newest first. Bounded and
        // ordered like every other desk read; it degrades on its own — a failed
        // proposals read leaves the need silent, never invents one.
        supabase
          .from('schedule_proposals')
          .select('id, project_id, source_event')
          .eq('state', 'proposed')
          .order('created_at', { ascending: false })
          .limit(DESK_PROPOSAL_LIMIT),
      ]);
      if (error) throw error;
      const rows = (data ?? []) as DocumentStateRow[];

      // I64 suspicious-empty guard: a 0-row document_state read is exactly
      // what an auth-degraded (token-refresh-failed) request looks like —
      // Postgres/PostgREST returns HTTP 200 with no rows and RLS admits
      // nothing, not an error. Verify the session before trusting a 0-row
      // read as a genuinely quiet desk.
      if (rows.length === 0) {
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionValid = !!sessionData?.session;
        const previous = previousResultRef.current;
        const previousWasNonEmpty =
          !!previous && (previous.folders.length > 0 || previous.chips.length > 0);

        if (!sessionValid) {
          // No session to back up an empty read — surface this as an error
          // (the truth: an auth-degraded read) instead of a false-empty Desk.
          // desk/page.tsx's whole-desk error state is what catches this.
          throw new Error(
            'desk_session_degraded: document_state returned 0 rows with no valid session',
          );
        }

        // Session is valid — 0 rows really is a quiet desk. Still, if the
        // designer's last cached read had work in it, that transition is
        // worth a breadcrumb for the week-one watch (fire-and-forget, never
        // blocks the render either way).
        if (previousWasNonEmpty) {
          documentEvents.deskZeroRowRead({
            previous_folder_count: previous!.folders.length,
            previous_chip_count: previous!.chips.length,
            session_valid: sessionValid,
          });
        }
      }

      const now = new Date();
      // The Desk never dies on a side feed — conflicts/receivables/flags stay quiet.
      const conflicts = eventsError ? undefined : buildDeskConflicts(events ?? []);
      const receivables = invoicesError
        ? undefined
        : buildDeskReceivables((invoices ?? []) as Invoice[], now);
      // Line flags + board-pin flags fold together by proposal_id (one folder,
      // summed count). Each source degrades to [] on its own error.
      const flaggedLines =
        flaggedError && boardFlaggedError
          ? undefined
          : buildDeskFlaggedLines([
              ...(flaggedError ? [] : flattenFlaggedRows(flaggedFeedback)),
              ...(boardFlaggedError ? [] : flattenBoardFlaggedRows(boardFlagged)),
            ]);
      // R106: the ceremonies feed degrades the same way — a query error never
      // takes the whole Desk down, it just means no ceremony-derived need/chip
      // fires this read (identical in effect to the flag-off path).
      const ceremonyRows = ceremoniesError ? [] : ((ceremonies ?? []) as CeremonyRow[]);
      const ceremoniesByLeadId = ceremoniesError ? undefined : buildDeskCeremoniesByLead(ceremonyRows);
      const ceremoniesByDesignerClientId = ceremoniesError
        ? undefined
        : buildDeskCeremoniesByDesignerClient(ceremonyRows);
      // R108: the schedule reads degrade independently and together — a phases
      // error leaves the map undefined, which partitionDesk reads as
      // "unanswered", never as "this project has no schedule". Milestones or
      // start dates alone failing still resolves every chain, only less
      // precisely.
      //
      // Truncation is the dangerous case, not the error case: a capped phase
      // read silently drops whole projects, and a project missing from a
      // PRESENT map reads as "no phases" — i.e. the desk would invent a
      // "Name the phases for this project" need for a fully-composed schedule.
      // A full page is therefore treated as no answer at all.
      const phaseRows = (deskPhases ?? []) as DeskPhaseRow[];
      const phasesTruncated = phaseRows.length >= DESK_PHASE_LIMIT;
      const schedules =
        deskPhasesError || phasesTruncated
          ? undefined
          : buildDeskSchedule(
              phaseRows,
              deskMilestonesError ? [] : ((deskMilestones ?? []) as DeskMilestoneRow[]),
              today,
              deskProjectStartsError
                ? undefined
                : new Map(
                    ((deskProjectStarts ?? []) as Array<{ id: string; start_date: string | null }>).map(
                      (p) => [p.id, p.start_date ?? null],
                    ),
                  ),
              deskProposalsError ? [] : ((deskProposals ?? []) as DeskProposalRow[]),
            );

      const result = partitionDesk(
        rows,
        now,
        conflicts,
        receivables,
        flaggedLines,
        ceremoniesByLeadId,
        ceremoniesByDesignerClientId,
        schedules,
      );
      previousResultRef.current = result;
      return result;
    },
  });
}
