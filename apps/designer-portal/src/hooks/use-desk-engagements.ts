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
import {
  createBrowserClient,
  docKeys,
  fetchHeldPurchaseOrders,
  type HeldPurchaseOrder,
  type Invoice,
} from '@patina/supabase';
import {
  partitionDesk,
  RETURN_BY_LEAD_DAYS,
  type DeskClaimWindowSignal,
  type DeskHeldReleaseSignal,
  type DeskSampleSignal,
  type DeskPaymentSignal,
  type DeskQuoteSignal,
  type DeskExceptionSignal,
  type DeskReturnSignal,
  type DeskDraftSignal,
  type DeskLandedPaymentSignal,
  type DeskLeadSignal,
  type DeskProposalOutcomeSignal,
  type DeskPurchaseOrderSignal,
  LANDED_PAYMENT_DAYS,
  type DeskFolder,
  type DocumentStateRow,
  type MotionChip,
  type NeedLine,
} from '@/lib/document/desk-derivation';
import { buildDeskConflicts } from '@/lib/document/desk-conflicts';
import { lineMaker, linePoNumber } from '@/lib/document/install-reading';
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
  /** Fix-now 6 — the modelled feeds this read could not answer, in the words
   *  the Desk prints ("Not checked: invoices, deliveries."). Empty only when
   *  every feed answered, which is the one state that may say nothing is open. */
  unreadFeeds: string[];
  /** Studio-scoped outbound drafts have no project folder to rise on. */
  studioDrafts?: DeskDraftSignal[];
}

interface DeskQueryData extends DeskData {
  /** Unprojected source rows; each observer filters these in its own `select`. */
  outboundDraftRows: unknown[];
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
 * C-28: procurement drafts awaiting review (or sending), keyed by project_id. A studio-level
 * draft (no project) has no engagement to rise on, so it is dropped here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDeskDrafts(rows: any, outboundRows?: any): Map<string, DeskDraftSignal[]> | undefined {
  if (!Array.isArray(rows)) return undefined;
  const map = new Map<string, DeskDraftSignal[]>();
  // US-31 B5a: staged outbound drafts ride the same map, marked by `outbound`.
  for (const row of Array.isArray(outboundRows) ? outboundRows : []) {
    if (!row?.id || !row.project_id) continue;
    map.set(row.project_id, [
      ...(map.get(row.project_id) ?? []),
      {
        id: row.id,
        kind: row.kind,
        status: row.status,
        to_email: row.to_address ?? null,
        subject: row.subject ?? '',
        body: row.body,
        created_at: row.created_at,
        updated_at: row.updated_at,
        claimed_at: row.claimed_at ?? null,
        outbound: { channel: row.channel, recipientKind: row.recipient_kind },
      },
    ]);
  }
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
        updated_at: row.updated_at,
        // FR2 506-6: a line-level draft names its maker, by R42's one selector.
        ...(row.ffe_item ? { maker: lineMaker(row.ffe_item) } : {}),
        // F3-22 517-5: and carries that line, for Add an address's landing.
        ...(row.ffe_item?.id ? { makerLine: row.ffe_item } : {}),
        // FR7 F7-1: and that line's PO number, so the band relabels only its PO's silence.
        ...(row.ffe_item ? { poNumber: linePoNumber(row.ffe_item) } : {}),
        // F8-6 (SQ-556 risk): and the studio's own PO number, since the silence
        // row's label can carry either number when the two disagree.
        ...(row.ffe_item
          ? { studioPoNumber: row.ffe_item.purchase_order?.po_number ?? null }
          : {}),
        // FR8 F8-2: and the PO a draft answers, so Answer the maker finds its line.
        ...(row.purchase_order_id ? { purchaseOrderId: String(row.purchase_order_id) } : {}),
      },
    ]);
  }
  return map;
}

// Studio-level drafts have no project map key; keep them as a separate Desk population.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDeskStudioDrafts(rows: any, organizationId?: string | null): DeskDraftSignal[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row?.id && !row.project_id && organizationId && row.organization_id === organizationId)
    .map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      kind: row.kind,
      status: row.status,
      to_email: row.to_address ?? null,
      subject: row.subject ?? '',
      body: row.body,
      created_at: row.created_at,
      updated_at: row.updated_at,
      claimed_at: row.claimed_at ?? null,
      outbound: { channel: row.channel, recipientKind: row.recipient_kind },
    }));
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

/** C-35: live samples in the member's read. */
const DESK_SAMPLE_LIMIT = 200;

/**
 * C-35: samples requested or received (not yet returned or cancelled) with a
 * return-by date, one signal per row keyed by project_id; memoReturnDue decides
 * which are due.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDeskSamples(rows: any): Map<string, DeskSampleSignal[]> | undefined {
  if (!Array.isArray(rows)) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const one = (v: any) => (Array.isArray(v) ? v[0] : v);
  const map = new Map<string, DeskSampleSignal[]>();
  for (const row of rows) {
    if (!row?.id || !row.project_id) continue;
    map.set(row.project_id, [
      ...(map.get(row.project_id) ?? []),
      {
        id: row.id,
        kind: row.kind,
        vendorName: one(row.vendor)?.name ?? null,
        returnBy: row.return_by ?? null,
      },
    ]);
  }
  return map;
}

/**
 * C-32: POs held for release, one signal per PO keyed by project_id, each with
 * whether the viewer's seat may release it; the derivation shows only those.
 */
export function buildDeskHeldReleases(
  rows: readonly HeldPurchaseOrder[] | null | undefined,
): Map<string, DeskHeldReleaseSignal[]> | undefined {
  if (!Array.isArray(rows)) return undefined;
  const map = new Map<string, DeskHeldReleaseSignal[]>();
  for (const row of rows) {
    map.set(row.projectId, [
      ...(map.get(row.projectId) ?? []),
      {
        purchaseOrderId: row.id,
        vendorName: row.vendorName,
        totalCents: row.totalCents,
        heldAt: row.heldAt,
        heldByName: row.heldByName,
        viewerCanRelease: row.viewerCanRelease,
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

/** N3: caps on the live-job reads. A proposals or purchase-order page that
 *  comes back FULL is no answer (a missing job would read as "nothing open"). */
const DESK_LIVE_PROPOSAL_LIMIT = 500;
const DESK_SENT_PO_LIMIT = 500;
const DESK_LANDED_LIMIT = 200;
const DESK_LEAD_LIMIT = 500;

/**
 * N3: proposals on live jobs, folded to the signed and declined outcomes that
 * still stand, keyed by project_id. A proposal some later version revised (it
 * is another row's parent, or it carries a replacement) has been answered.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDeskProposalOutcomes(rows: any): Map<string, DeskProposalOutcomeSignal[]> | undefined {
  if (!Array.isArray(rows)) return undefined;
  const revised = new Set(rows.map((r) => r?.parent_proposal_id).filter(Boolean));
  const map = new Map<string, DeskProposalOutcomeSignal[]>();
  for (const row of rows) {
    if (!row?.id || !row.project_id || revised.has(row.id)) continue;
    if (row.superseded_at || row.replacement_proposal_id) continue;
    if (row.status !== 'accepted' && row.status !== 'declined') continue;
    const live = (Array.isArray(row.items) ? row.items : [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .flatMap((item: any) => (Array.isArray(item?.ffe) ? item.ffe : item?.ffe ? [item.ffe] : []))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((ffe: any) => ffe && !ffe.removed_at);
    map.set(row.project_id, [
      ...(map.get(row.project_id) ?? []),
      {
        proposalId: row.id,
        title: row.title?.trim() || 'The proposal',
        status: row.status,
        at:
          row.status === 'accepted'
            ? (row.signed_at ?? row.accepted_at ?? null)
            : (row.declined_at ?? null),
        reason: row.decline_reason ?? row.client_feedback ?? null,
        lineCount: live.length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        orderedCount: live.filter((ffe: any) => !!ffe.purchase_order_id).length,
      },
    ]);
  }
  return map;
}

const PAYMENT_WORD: Record<string, string> = {
  deposit: 'Deposit',
  balance: 'Balance',
  milestone: 'Payment',
  full_upfront: 'Payment in full',
};

/**
 * N3: money landed on a live job — client invoices paid, and maker payments
 * the records cover — keyed by project_id. Either read answering is an answer;
 * the derivation decides whether it still stands (LANDED_PAYMENT_DAYS).
 */
export function buildDeskLandedPayments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoices: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  poPayments: any,
): Map<string, DeskLandedPaymentSignal[]> | undefined {
  if (!Array.isArray(invoices) && !Array.isArray(poPayments)) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const one = (v: any) => (Array.isArray(v) ? v[0] : v);
  const map = new Map<string, DeskLandedPaymentSignal[]>();
  const add = (projectId: string, signal: DeskLandedPaymentSignal) =>
    map.set(projectId, [...(map.get(projectId) ?? []), signal]);
  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!inv?.id || !inv.project_id || !inv.paid_at) continue;
    add(inv.project_id, {
      id: inv.id,
      label: inv.invoice_number ?? inv.title ?? 'An invoice',
      amountCents:
        typeof inv.amount_paid_cents === 'number'
          ? inv.amount_paid_cents
          : typeof inv.total_cents === 'number'
            ? inv.total_cents
            : null,
      landedAt: inv.paid_at,
    });
  }
  for (const payment of Array.isArray(poPayments) ? poPayments : []) {
    const po = one(payment?.purchase_order);
    if (!payment?.id || !po?.project_id || !payment.paid_date) continue;
    const word = PAYMENT_WORD[String(payment.kind ?? '')] ?? 'Payment';
    const vendor = one(po.vendor)?.name;
    const poLabel = po.po_number ?? po.vendor_po_number ?? po.sidemark ?? 'a purchase order';
    add(po.project_id, {
      id: payment.id,
      label: vendor ? `${word} to ${vendor}` : `${word} on ${poLabel}`,
      amountCents: typeof payment.amount_cents === 'number' ? payment.amount_cents : null,
      landedAt: payment.paid_date,
    });
  }
  return map;
}

/** N3: sent purchase orders still in play, with their acknowledgment, keyed by
 *  project_id. A full page is no answer (the row's aggregate stands). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDeskPurchaseOrders(rows: any): Map<string, DeskPurchaseOrderSignal[]> | undefined {
  if (!Array.isArray(rows) || rows.length >= DESK_SENT_PO_LIMIT) return undefined;
  const map = new Map<string, DeskPurchaseOrderSignal[]>();
  for (const row of rows) {
    if (!row?.id || !row.project_id || !row.sent_at) continue;
    map.set(row.project_id, [
      ...(map.get(row.project_id) ?? []),
      {
        purchaseOrderId: row.id,
        poLabel: row.po_number ?? row.vendor_po_number ?? row.sidemark ?? 'A purchase order',
        sentAt: row.sent_at,
        acknowledgedAt: row.acknowledged_at ?? null,
      },
    ]);
  }
  return map;
}

/** N6: each open lead's arrival and contact name, keyed by lead id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDeskLeads(rows: any): Map<string, DeskLeadSignal> | undefined {
  if (!Array.isArray(rows)) return undefined;
  const map = new Map<string, DeskLeadSignal>();
  for (const row of rows) {
    if (!row?.id || !row.created_at) continue;
    map.set(row.id, { createdAt: row.created_at, contactName: row.contact_name ?? null });
  }
  return map;
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

export function useDeskEngagements(options: { enabled?: boolean; organizationId?: string | null } = {}) {
  // Arrival Arc Phase 0 (I64): tracks the last successfully computed Desk so
  // the zero-row breadcrumb can tell "went quiet after real work" apart from
  // "was already quiet" — a fresh mount has nothing to compare against, so it
  // never breadcrumbs on first load. Lives outside TanStack's own cache
  // because the queryFn needs it read-and-write on every call, synchronously.
  const previousResultRef = useRef<DeskData | null>(null);

  return useQuery<DeskQueryData, Error, DeskData>({
    queryKey: docKeys.desk(),
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
      // Existing drafts remain reviewable regardless of the UI feature flag;
      // the database rollout gates composition, not visibility of stored rows.
      const outboundRead: Promise<{ data: unknown; error: unknown }> = Promise.resolve(
        supabase
          .from('outbound_drafts')
          .select(
            'id, organization_id, project_id, kind, channel, recipient_kind, status, to_address, subject, body, created_at, updated_at, claimed_at',
          )
          .in('status', ['awaiting_review', 'sending'])
          .order('created_at')
          .limit(DESK_DRAFT_LIMIT),
      ).catch((outboundError) => ({ data: null, error: outboundError }));
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
        { data: heldRows, error: heldRowsError },
        { data: sampleRows, error: sampleRowsError },
        { data: liveProposalRows, error: liveProposalsError },
        { data: paidInvoices, error: paidInvoicesError },
        { data: paidPoPayments, error: paidPoPaymentsError },
        { data: sentPoRows, error: sentPoRowsError },
        { data: leadRows, error: leadRowsError },
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
        // C-28: composed letters awaiting a member's review, or claimed by a
        // send (00720: a stalled one offers Send again). A sent or discarded
        // draft drops out of the read, so the need clears with the act.
        // buildDeskDrafts drops a studio-level draft (no project).
        supabase
          .from('procurement_drafts')
          .select(
            'id, project_id, purchase_order_id, kind, status, to_email, subject, body, created_at, updated_at, ffe_item:project_ffe_items!procurement_drafts_ffe_item_id_fkey(id, vendor_id, vendor_name, product:products!product_id(brand), purchase_order:purchase_orders!purchase_order_id(vendor_id, po_number, vendor_po_number, vendor:vendors!purchase_orders_vendor_id_fkey(name)))',
          )
          .in('status', ['awaiting_review', 'sending'])
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
        // C-32: orders held for an owner/admin release, with the viewer's seat.
        // A failed read (or seat check) degrades to no answer.
        (async () => {
          try {
            return { data: await fetchHeldPurchaseOrders(supabase), error: null };
          } catch (heldError) {
            return { data: null, error: heldError };
          }
        })(),
        // C-35: samples still out with a return-by date; the need decides the
        // window (memoReturnDue), so a returned or cancelled one drops out here.
        supabase
          .from('sample_requests')
          .select('id, project_id, kind, return_by, vendor:vendors!sample_requests_vendor_id_fkey(name)')
          .in('status', ['requested', 'received'])
          .not('return_by', 'is', null)
          .order('return_by')
          .limit(DESK_SAMPLE_LIMIT),
        // N3: proposals on live jobs, every status, so a revision proves its
        // parent answered; each line's FF&E rows say whether it was ordered.
        supabase
          .from('proposals')
          .select(
            'id, project_id, status, title, version, parent_proposal_id, created_at, signed_at, accepted_at, declined_at, decline_reason, client_feedback, superseded_at, replacement_proposal_id, items:proposal_items!proposal_items_proposal_id_fkey(ffe:project_ffe_items!project_ffe_items_source_proposal_item_id_fkey(purchase_order_id, removed_at))',
          )
          .not('project_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(DESK_LIVE_PROPOSAL_LIMIT),
        // N3: client invoices paid inside the landed window (a day of slack).
        supabase
          .from('invoices')
          .select('id, project_id, invoice_number, title, total_cents, amount_paid_cents, paid_at')
          .eq('status', 'paid')
          .gte(
            'paid_at',
            new Date(Date.now() - (LANDED_PAYMENT_DAYS + 1) * 86_400_000).toISOString(),
          )
          .order('paid_at', { ascending: false })
          .limit(DESK_LANDED_LIMIT),
        // N3: maker payments recorded paid inside the same window.
        supabase
          .from('po_payments')
          .select(
            'id, kind, amount_cents, paid_date, purchase_order:purchase_orders!po_payments_purchase_order_id_fkey(project_id, po_number, vendor_po_number, sidemark, vendor:vendors!purchase_orders_vendor_id_fkey(name))',
          )
          .eq('state', 'paid')
          .gte(
            'paid_date',
            new Date(Date.now() - (LANDED_PAYMENT_DAYS + 1) * 86_400_000).toISOString().slice(0, 10),
          )
          .order('paid_date', { ascending: false })
          .limit(DESK_LANDED_LIMIT),
        // N3: sent POs still in play, acknowledged or not, so a chase names
        // its PO and an acknowledgment clears it.
        supabase
          .from('purchase_orders')
          .select('id, project_id, po_number, vendor_po_number, sidemark, sent_at, acknowledged_at')
          .not('sent_at', 'is', null)
          .not('status', 'in', '(delivered,cancelled)')
          .order('sent_at')
          .limit(DESK_SENT_PO_LIMIT),
        // N6: open leads' arrival times and contact names.
        supabase
          .from('leads')
          .select('id, created_at, contact_name')
          .in('status', ['new', 'viewed', 'contacted'])
          .order('created_at')
          .limit(DESK_LEAD_LIMIT),
      ]);
      const { data: outboundRows, error: outboundRowsError } = await outboundRead;
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
      const drafts =
        draftRowsError && outboundRowsError
          ? undefined
          : buildDeskDrafts(draftRowsError ? [] : draftRows, outboundRowsError ? [] : outboundRows);
      const quotes = quoteRowsError ? undefined : buildDeskQuotes(quoteRows);
      const exceptions = exceptionRowsError ? undefined : buildDeskExceptions(exceptionRows);
      const heldReleases = heldRowsError ? undefined : buildDeskHeldReleases(heldRows);
      const samples = sampleRowsError ? undefined : buildDeskSamples(sampleRows);
      const liveProposalsTruncated =
        Array.isArray(liveProposalRows) && liveProposalRows.length >= DESK_LIVE_PROPOSAL_LIMIT;
      const proposalOutcomes =
        liveProposalsError || liveProposalsTruncated
          ? undefined
          : buildDeskProposalOutcomes(liveProposalRows);
      const landedPayments = buildDeskLandedPayments(
        paidInvoicesError ? null : paidInvoices,
        paidPoPaymentsError ? null : paidPoPayments,
      );
      // The per-PO and leads reads fall back to the row's own aggregate and
      // wording, so their failure leaves nothing unchecked.
      const purchaseOrders = sentPoRowsError ? undefined : buildDeskPurchaseOrders(sentPoRows);
      const leads = leadRowsError ? undefined : buildDeskLeads(leadRows);

      // Fix-now 6: name every modelled feed this read could not answer. Any one
      // failed contributing read leaves its feed unread, even where the other
      // half answered and still prints what it found (SQ-751 F4).
      const unreadFeeds = [
        ...(invoicesError || paidInvoicesError ? ['invoices'] : []),
        ...(eventsError ? ['deliveries'] : []),
        ...(flaggedError || boardFlaggedError ? ['flagged lines'] : []),
        ...(ceremoniesError ? ['introductions'] : []),
        ...(deskPhasesError ||
        phasesTruncated ||
        deskMilestonesError ||
        deskProjectStartsError ||
        deskProposalsError ||
        proposalsTruncated
          ? ['schedules']
          : []),
        ...(liveProposalsError || liveProposalsTruncated ? ['proposals'] : []),
        ...(claimNoticesError || !claimWindows ? ['claim windows'] : []),
        ...(paymentNoticesError || paidPoPaymentsError ? ['maker payments'] : []),
        ...(returnRowsError ? ['returns'] : []),
        ...(draftRowsError || outboundRowsError ? ['letters'] : []),
        ...(quoteRowsError ? ['quotes'] : []),
        ...(exceptionRowsError ? ['exceptions'] : []),
        ...(heldRowsError ? ['held orders'] : []),
        ...(sampleRowsError ? ['samples'] : []),
      ];

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
        heldReleases,
        samples,
        proposalOutcomes,
        landedPayments,
        purchaseOrders,
        leads,
      );
      const desk: DeskQueryData = {
        ...result,
        unreadFeeds,
        outboundDraftRows: outboundRowsError || !Array.isArray(outboundRows) ? [] : outboundRows,
      };
      previousResultRef.current = desk;
      return desk;
    },
    select: ({ outboundDraftRows, ...desk }) => ({
      ...desk,
      studioDrafts: buildDeskStudioDrafts(outboundDraftRows, options.organizationId),
    }),
  });
}
