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
  RETURN_BY_LEAD_DAYS,
  type DeskClaimWindowSignal,
  type DeskPaymentSignal,
  type DeskQuoteSignal,
  type DeskExceptionSignal,
  type DeskReturnSignal,
  type DeskDraftSignal,
  type DeskFolder,
  type DocumentStateRow,
  type MotionChip,
  type NeedLine,
} from '@/lib/document/desk-derivation';
import { buildDeskConflicts } from '@/lib/document/desk-conflicts';
import {
  buildDeskProposalSignals,
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
  /** Every live (non-archived) document this composition saw, in read order.
   *  `folders` and `chips` are derived subsets — a document with neither a
   *  need nor a motion is in neither, and `chips` is capped — so anything
   *  counting the studio's live work reads this instead. */
  live: DocumentStateRow[];
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

/**
 * The same answer, read whole: every need this composition derived for the
 * document, in priority order. Identical sentinel discipline to the single-need
 * reader above — `undefined` = this composition never covered the engagement,
 * so the caller has no answer; `[]` = it did, and there are no needs.
 */
export function selectOperationalNeedsForDocument(
  data: DeskData | undefined,
  engagementId: string | null | undefined,
): NeedLine[] | undefined {
  if (!data || !engagementId) return undefined;
  if (data.composed[engagementId] !== true) return undefined;
  return (
    data.folders.find((folder) => folder.row.engagement_id === engagementId)
      ?.needs ?? []
  );
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
/** C-20: claim_window_closing notices are written once per (PO, recipient)
 *  and never deleted, so the read looks back a bounded stretch. */
const DESK_CLAIM_NOTICE_LIMIT = 200;
const DESK_CLAIM_NOTICE_DAYS = 60;
/** C-22: due and failed payment notices, read only while their payment row is
 *  still open (pending or due) — a covered row drops out of the read itself,
 *  so no lookback window is needed. */
const DESK_PAYMENT_NOTICE_LIMIT = 200;
const PAYMENT_NOTICE_KINDS = ['deposit_due', 'balance_due', 'milestone_due', 'payment_failed'];

/**
 * C-22: the due / failed payment notices folded to one signal per
 * (notice, payment row), keyed by project_id. Each notice is addressed to the
 * PO's creator and the project lead, and co-members can read a colleague's
 * (00700), so the fold dedupes. The derivation decides which lane each row
 * belongs to and whether it still stands.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDeskPayments(notices: any): Map<string, DeskPaymentSignal[]> | undefined {
  if (!Array.isArray(notices)) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const one = (v: any) => (Array.isArray(v) ? v[0] : v);
  const seen = new Set<string>();
  const map = new Map<string, DeskPaymentSignal[]>();
  for (const notice of notices) {
    const po = one(notice?.purchase_order);
    const payment = one(notice?.payment);
    if (!po?.id || !po.project_id || !payment?.id) continue;
    const kind: DeskPaymentSignal['notice'] = notice.kind === 'payment_failed' ? 'failed' : 'due';
    const key = `${kind}:${payment.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    map.set(po.project_id, [
      ...(map.get(po.project_id) ?? []),
      {
        notice: kind,
        purchaseOrderId: po.id,
        poPaymentId: payment.id,
        poLabel: po.po_number ?? po.vendor_po_number ?? po.sidemark ?? 'A purchase order',
        vendorName: one(po.vendor)?.name ?? null,
        paymentKind: String(payment.kind ?? ''),
        state: String(payment.state ?? ''),
        dueDate: payment.due_date ?? null,
        amountCents: typeof payment.amount_cents === 'number' ? payment.amount_cents : null,
        isPatinaCatalog: Boolean(po.is_patina_catalog),
        onStripeRail: Boolean(
          payment.stripe_checkout_session_id || payment.stripe_payment_intent_id,
        ),
      },
    ]);
  }
  return map;
}

/** C-25: live purchases whose return window is near. The read takes a day of
 *  slack each side (UTC vs local dates); returnWindowOpen decides exactly. */
const DESK_RETURN_LIMIT = 200;

/**
 * C-25: live studio purchases with a return-by date, folded to one signal per
 * purchase and keyed by project_id. Studio overhead (no project) has no
 * engagement to rise on, so the read already excludes it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDeskReturns(rows: any): Map<string, DeskReturnSignal[]> | undefined {
  if (!Array.isArray(rows)) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const one = (v: any) => (Array.isArray(v) ? v[0] : v);
  const map = new Map<string, DeskReturnSignal[]>();
  for (const row of rows) {
    if (!row?.id || !row.project_id || !row.return_by) continue;
    const item = one(row.ffe_item);
    map.set(row.project_id, [
      ...(map.get(row.project_id) ?? []),
      {
        purchaseId: row.id,
        label: row.description?.trim() || row.payee_name,
        payeeName: row.payee_name,
        returnBy: row.return_by,
        itemStatus: item?.status ?? null,
        received: (item?.received_quantity ?? 0) > 0,
      },
    ]);
  }
  return map;
}

/** C-28: the drafts read's cap — letters awaiting review are few. */
const DESK_DRAFT_LIMIT = 200;

/**
 * C-28: procurement drafts awaiting review, keyed by project_id. A studio-level
 * draft (no project) has no engagement to rise on, so it is dropped here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDeskDrafts(rows: any): Map<string, DeskDraftSignal[]> | undefined {
  if (!Array.isArray(rows)) return undefined;
  const map = new Map<string, DeskDraftSignal[]>();
  for (const row of rows) {
    if (!row?.id || !row.project_id) continue;
    map.set(row.project_id, [
      ...(map.get(row.project_id) ?? []),
      {
        id: row.id,
        kind: row.kind,
        status: row.status,
        to_email: row.to_email ?? null,
        subject: row.subject,
        body: row.body,
        created_at: row.created_at,
      },
    ]);
  }
  return map;
}

/** C-29: live quotes whose valid-until is near. The read takes a day of slack
 *  each side (UTC vs local dates); quoteExpiring decides exactly. */
const DESK_QUOTE_LIMIT = 200;

/**
 * C-29: live (not superseded) vendor quotes with a valid-until date, one signal
 * per quote keyed by project_id, counting the lines it prices that are live and
 * not yet on a purchase order.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDeskQuotes(rows: any): Map<string, DeskQuoteSignal[]> | undefined {
  if (!Array.isArray(rows)) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const one = (v: any) => (Array.isArray(v) ? v[0] : v);
  const map = new Map<string, DeskQuoteSignal[]>();
  for (const row of rows) {
    if (!row?.id || !row.project_id || !row.valid_until) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const openLines = ((row.lines ?? []) as any[]).filter((line) => {
      const item = one(line?.ffe_item);
      return item && !item.purchase_order_id && !item.removed_at;
    }).length;
    map.set(row.project_id, [
      ...(map.get(row.project_id) ?? []),
      {
        quoteId: row.id,
        vendorName: one(row.vendor)?.name ?? null,
        quoteRef: row.quote_ref ?? null,
        validUntil: row.valid_until,
        openLines,
      },
    ]);
  }
  return map;
}

/** C-30: open exceptions in the member's read. */
const DESK_EXCEPTION_LIMIT = 200;

/**
 * C-30: procurement exceptions still `open`, one signal per row keyed by
 * project_id, with the line or PO it names; exceptionNeedsPath decides which
 * ask for a path.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDeskExceptions(rows: any): Map<string, DeskExceptionSignal[]> | undefined {
  if (!Array.isArray(rows)) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const one = (v: any) => (Array.isArray(v) ? v[0] : v);
  const map = new Map<string, DeskExceptionSignal[]>();
  for (const row of rows) {
    if (!row?.id || !row.project_id) continue;
    const po = one(row.purchase_order);
    map.set(row.project_id, [
      ...(map.get(row.project_id) ?? []),
      {
        id: row.id,
        type: row.type,
        status: row.status,
        itemName: one(row.ffe_item)?.name ?? null,
        poLabel: po ? (po.po_number ?? po.vendor_po_number ?? po.sidemark ?? 'A purchase order') : null,
        clockDueOn: row.clock_due_on ?? null,
        isPatinaCatalog: Boolean(po?.is_patina_catalog),
      },
    ]);
  }
  return map;
}

/**
 * C-20: the claim_window_closing notices (00700's procurement-clocks-daily
 * writes one the day before the vendor deadline) folded to one signal per PO,
 * keyed by project_id, each carrying its deadline from
 * procurement_claim_deadline. Only POs whose drafted claim has not reached the
 * vendor ask for a deadline; the derivation decides the rest. Any failure
 * degrades to no answer, never takes the Desk down.
 */
async function loadDeskClaimWindows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notices: any,
): Promise<Map<string, DeskClaimWindowSignal[]> | undefined> {
  if (!Array.isArray(notices)) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const one = (v: any) => (Array.isArray(v) ? v[0] : v);
  const byPo = new Map<string, Omit<DeskClaimWindowSignal, 'deadline'> & { projectId: string }>();
  for (const notice of notices) {
    const po = one(notice?.purchase_order);
    if (!po?.id || !po.project_id || byPo.has(po.id)) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inspections = ((po.inspections ?? []) as any[])
      .slice()
      .sort((a, b) => String(b?.inspected_at ?? '').localeCompare(String(a?.inspected_at ?? '')));
    byPo.set(po.id, {
      projectId: po.project_id,
      purchaseOrderId: po.id,
      poLabel: po.po_number ?? po.vendor_po_number ?? po.sidemark ?? 'A delivery',
      vendorName: one(po.vendor)?.name ?? null,
      claimStates: inspections.flatMap((i) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((i?.claims ?? []) as any[]).map((c) => String(c?.state)),
      ),
      latestOutcome: inspections[0]?.outcome ?? null,
    });
  }
  const live = [...byPo.values()].filter(
    (w) => w.claimStates.includes('drafted') && w.latestOutcome !== 'clean',
  );
  try {
    const deadlines = await Promise.all(
      live.map(async (w) => {
        const { data, error } = await supabase.rpc('procurement_claim_deadline', {
          p_po_id: w.purchaseOrderId,
        });
        if (error) throw error;
        return (Array.isArray(data) ? data[0] : data)?.vendor_deadline ?? null;
      }),
    );
    const map = new Map<string, DeskClaimWindowSignal[]>();
    live.forEach(({ projectId, ...w }, i) => {
      const deadline = deadlines[i] as string | null;
      if (!deadline) return;
      map.set(projectId, [...(map.get(projectId) ?? []), { ...w, deadline }]);
    });
    return map;
  } catch {
    return undefined;
  }
}

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
        { data: claimNotices, error: claimNoticesError },
        { data: paymentNotices, error: paymentNoticesError },
        { data: returnRows, error: returnRowsError },
        { data: draftRows, error: draftRowsError },
        { data: quoteRows, error: quoteRowsError },
        { data: exceptionRows, error: exceptionRowsError },
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
          .select('id, project_id, source_event, conflicts_with_committed, created_at')
          .eq('state', 'proposed')
          .order('created_at', { ascending: false })
          .limit(DESK_PROPOSAL_LIMIT),
        // C-20: claim_window_closing notices. 00700's studio read policy lets
        // a co-member see a colleague's notice, so this is not filtered to
        // the viewer; the loader dedupes per PO.
        supabase
          .from('procurement_notifications')
          .select(
            'purchase_order:purchase_orders!procurement_notifications_subject_purchase_order_id_fkey(id, project_id, po_number, vendor_po_number, sidemark, vendor:vendors!purchase_orders_vendor_id_fkey(name), inspections:receiving_inspections!receiving_inspections_purchase_order_id_fkey(outcome, inspected_at, claims:damage_claims!damage_claims_receiving_inspection_id_fkey(state)))',
          )
          .eq('kind', 'claim_window_closing')
          .gte(
            'created_at',
            new Date(Date.now() - DESK_CLAIM_NOTICE_DAYS * 86_400_000).toISOString(),
          )
          .order('created_at', { ascending: false })
          .limit(DESK_CLAIM_NOTICE_LIMIT),
        // C-22: due and failed payment notices whose payment row is still
        // open. The inner join drops a covered (paid) or refunded row from
        // the read, so the need clears with the act.
        supabase
          .from('procurement_notifications')
          .select(
            'kind, payment:po_payments!procurement_notifications_subject_payment_id_fkey!inner(id, kind, state, due_date, amount_cents, stripe_checkout_session_id, stripe_payment_intent_id), purchase_order:purchase_orders!procurement_notifications_subject_purchase_order_id_fkey(id, project_id, po_number, vendor_po_number, sidemark, is_patina_catalog, vendor:vendors!purchase_orders_vendor_id_fkey(name))',
          )
          .in('kind', PAYMENT_NOTICE_KINDS)
          .in('payment.state', ['pending', 'due'])
          .order('created_at', { ascending: false })
          .limit(DESK_PAYMENT_NOTICE_LIMIT),
        // C-25: live, returnable project purchases whose return-by date is
        // near. A returned or void purchase drops out of the read itself.
        supabase
          .from('studio_purchases')
          .select(
            'id, project_id, description, payee_name, return_by, ffe_item:project_ffe_items!studio_purchases_ffe_item_id_fkey(status, received_quantity)',
          )
          .in('status', ['recorded', 'billed'])
          .eq('returnable', true)
          .is('returned_on', null)
          .gte('return_by', new Date(Date.now() - 86_400_000).toISOString().slice(0, 10))
          .lte(
            'return_by',
            new Date(Date.now() + (RETURN_BY_LEAD_DAYS + 1) * 86_400_000).toISOString().slice(0, 10),
          )
          .order('return_by')
          .limit(DESK_RETURN_LIMIT),
        // C-28: composed letters awaiting a member's review. A sent or
        // discarded draft drops out of the read, so the need clears with the act.
        // buildDeskDrafts drops a studio-level draft (no project).
        supabase
          .from('procurement_drafts')
          .select('id, project_id, kind, status, to_email, subject, body, created_at')
          .eq('status', 'awaiting_review')
          .order('created_at')
          .limit(DESK_DRAFT_LIMIT),
        // C-29: live quotes whose valid-until is near (R6: the date is all
        // the need reads). A superseded quote drops out of the read itself.
        supabase
          .from('vendor_quotes')
          .select(
            'id, project_id, quote_ref, valid_until, vendor:vendors!vendor_quotes_vendor_id_fkey(name), lines:vendor_quote_lines(ffe_item:project_ffe_items!vendor_quote_lines_ffe_item_id_fkey(purchase_order_id, removed_at))',
          )
          .is('superseded_by', null)
          .gte('valid_until', new Date(Date.now() - 86_400_000).toISOString().slice(0, 10))
          .lte('valid_until', new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10))
          .order('valid_until')
          .limit(DESK_QUOTE_LIMIT),
        // C-30: exceptions waiting for a path. An ack discrepancy is the
        // acknowledgment check's (SQ-426), not this need's.
        supabase
          .from('procurement_exceptions')
          .select(
            'id, project_id, type, status, clock_due_on, purchase_order:purchase_orders!procurement_exceptions_purchase_order_id_fkey(po_number, vendor_po_number, sidemark, is_patina_catalog), ffe_item:project_ffe_items!procurement_exceptions_ffe_item_id_fkey(name)',
          )
          .eq('status', 'open')
          .neq('type', 'ack_discrepancy')
          .order('opened_at')
          .limit(DESK_EXCEPTION_LIMIT),
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
      // Same sentinel as the phases read, same reason: a capped page silently
      // drops whole projects, and a project missing from a PRESENT feed reads
      // as "nothing proposed" rather than "unanswered".
      const proposalRows = (deskProposals ?? []) as DeskProposalRow[];
      const proposalsTruncated = proposalRows.length >= DESK_PROPOSAL_LIMIT;
      const answeredProposals =
        deskProposalsError || proposalsTruncated ? [] : proposalRows;
      // Degradation runs both ways: a failed phases read must not silence the
      // proposals, which need no chain to be true.
      const schedules =
        deskPhasesError || phasesTruncated
          ? answeredProposals.length > 0
            ? buildDeskProposalSignals(answeredProposals)
            : undefined
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
              answeredProposals,
            );
      const claimWindows = claimNoticesError
        ? undefined
        : await loadDeskClaimWindows(supabase, claimNotices);
      const payments = paymentNoticesError ? undefined : buildDeskPayments(paymentNotices);
      const returns = returnRowsError ? undefined : buildDeskReturns(returnRows);
      const drafts = draftRowsError ? undefined : buildDeskDrafts(draftRows);
      const quotes = quoteRowsError ? undefined : buildDeskQuotes(quoteRows);
      const exceptions = exceptionRowsError ? undefined : buildDeskExceptions(exceptionRows);

      const result = partitionDesk(
        rows,
        now,
        conflicts,
        receivables,
        flaggedLines,
        ceremoniesByLeadId,
        ceremoniesByDesignerClientId,
        schedules,
        claimWindows,
        payments,
        returns,
        drafts,
        quotes,
        exceptions,
      );
      previousResultRef.current = result;
      return result;
    },
  });
}
