/**
 * The Post — row derivation (R82). Pure logic, no DOM, no component imports
 * (stays off the help-system → @portabletext ESM trap, like desk-derivation).
 *
 * Two row families gather in the Post:
 *   · the Record — a dated ledger over `notification_log` (system notices).
 *   · Letters   — cross-document messages over the comms model.
 *
 * The load-bearing rule (R82): a Record row whose SUBJECT the Desk already
 * surfaces as a need line renders as a quiet CROSS-REFERENCE ("on your Desk"),
 * pointing at the Desk / the document — never as its own act. The act lives on
 * the Desk; two acts for one truth would teach the designer to distrust both.
 * Everything else is a plain NOTICE (an event that happened — read it, move on).
 */

import type {
  InboxNotification,
  InboxMessage,
  ProcurementNotification,
  ProcurementNotificationKind,
} from '@patina/supabase';
import type { NeedKind, SectionKey } from './desk-derivation';
import { sectionAnchorId } from './section-anchor';

/**
 * Notification `type` → the Desk {@link NeedKind} that already carries its act.
 * A type in this map is need-backed: the Record shows it as a cross-reference,
 * never a duplicate act (R82). Keep this the single source of the mapping — the
 * contract test pins it, and the Post reads it. Types absent here are notices.
 *
 * (The notification vocabulary is emitted by the edge functions in
 * supabase/functions/{decision-reminders, invoice-reminders, po-send,
 * lead-expiration-check, ...}; both the `notify_`-prefixed and bare forms are
 * mapped so the Record classifies a notice regardless of which leg wrote it.)
 */
export const NOTIFICATION_NEED_KIND: Record<string, NeedKind> = {
  // Decisions the client owes — the Desk's overdue-decision need.
  decision_overdue: 'overdue_decision',
  decision_required: 'overdue_decision',
  notify_decision_overdue: 'overdue_decision',
  notify_decision_required: 'overdue_decision',
  // Money owed — the Desk's overdue-invoice need (opens Accounts → Receivables).
  invoice_overdue: 'overdue_invoice',
  invoice_ar_flagged: 'overdue_invoice',
  // A damaged piece — the Desk's damage-claim need.
  damage_claim_drafted: 'damage_claim',
  // A lead about to go cold — the Desk's lead-urgency need.
  lead_expiring: 'new_lead',
  new_lead: 'new_lead',
  // The proposal turned — the Desk holds these at Proposal-active (R1).
  proposal_declined: 'proposal_declined',
  proposal_expired: 'proposal_expired',
};

// ─── R106 (the Arrival Arc) — notification audience census ──────────────────
//
// Three new notification_log types ride the arc (accept_design_request /
// ceremony_complete / client_pick). All three are read through the SAME
// designer-portal path — use-inbox.ts's `.eq('user_id', userId)` against the
// signed-in designer's own id — so a row's `user_id` decides whether The Post
// ever sees it at all, independent of any type-level mapping here:
//
//   · 'design_request_held'     — accept_design_request writes
//     user_id = leads.homeowner_id. Homeowner-bound; a designer's own
//     `.eq('user_id', <designer>)` read never matches this row. SKIPPED —
//     nothing to map, the row never reaches this designer's Post.
//   · 'match_introduction'      — ceremony_complete writes
//     user_id = leads.homeowner_id. Same as above — homeowner-bound, SKIPPED.
//   · 'discovery_call_picked'   — client_pick writes
//     user_id = match_ceremonies.designer_id — THIS is the one the designer
//     actually receives. It is NOT need-backed (no Desk folder derives from a
//     picked discovery time — only the in-motion chip does, and R82's
//     cross-reference rule is scoped to Desk NEED lines, not chips), so it is
//     correctly a plain NOTICE, not a cross-reference. It needs no entry in
//     NOTIFICATION_NEED_KIND. Its RPC-authored metadata already carries
//     everything the generic notice path reads: `title` ("{Client} chose
//     {day time}" — the P3-fixed named+timed copy), `message`, and
//     `deep_link`/`url` = `/doc/{designer_client_id ?? lead_id}` — a Document
//     route, so `deepLinkFor` + `isDocumentRoute` resolve it without any
//     code change here. Pinned by the `discovery_call_picked` cases in
//     post-derivation.test.ts.

export type RecordRowKind = 'cross_reference' | 'notice';

export interface RecordRow {
  kind: RecordRowKind;
  /** Where the row navigates — always a Document-model route, or null (a notice
   *  with no Document home is read-only; the Post never bounces out to a zone). */
  href: string | null;
  /** True for cross-references: render the quiet "on your Desk" reference, not an
   *  act. Drives the muted styling + the trailing label. */
  onDesk: boolean;
  /** The Desk need this row defers to, when it is one. */
  needKind: NeedKind | null;
}

/** Document routes the Post is allowed to follow. Legacy `/portal/*` deep links
 *  are NOT here — a notice minted before the R21 dissolve still carries one, and
 *  following it would leave the Document (D1); such notices read in place
 *  instead. (next.config's permanent table would land them somewhere true, but
 *  the Post does not launch links it cannot name.) The list is every route the
 *  (document) tree answers to, including the surfaces the dissolve rehoused:
 *  /rooms + /room/[scanId] (and its /file leaf), /ceremony, /help.
 *
 *  `/preferences` is deliberately ABSENT. It is a real page but it lives OUTSIDE
 *  the (document) route group on purpose (R91 — it has to answer unauthenticated
 *  for the emailed unsubscribe token, so it carries no Desk chrome). Following a
 *  notice into it would launch the designer out of the Document, which is exactly
 *  what D1 forbids; the designer's own notification settings are reachable from
 *  inside, through the Account sheet (`/desk?account=notifications`). */
const DOCUMENT_ROUTE_PREFIXES = [
  '/doc',
  '/desk',
  '/people',
  '/library',
  '/drafting',
  '/compose',
  '/rooms',
  '/room',
  '/ceremony',
  '/help',
];

function isDocumentRoute(href: string | null | undefined): href is string {
  return (
    !!href &&
    DOCUMENT_ROUTE_PREFIXES.some(
      (p) =>
        href === p ||
        href.startsWith(`${p}/`) ||
        href.startsWith(`${p}#`) ||
        href.startsWith(`${p}?`),
    )
  );
}

function metaString(
  md: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  if (!md) return null;
  for (const k of keys) {
    const v = md[k];
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

/** The document address a notification points at, if any: `/doc/{id}` (with a
 *  section anchor when the notice names one). Null when the notice carries no
 *  project. */
export function documentHrefFor(n: InboxNotification): string | null {
  const md = n.metadata ?? {};
  const projectId = metaString(md, 'project_id', 'projectId');
  if (!projectId) return null;
  const section = metaString(md, 'section', 'section_key') as SectionKey | null;
  return section ? `/doc/${projectId}#${sectionAnchorId(section)}` : `/doc/${projectId}`;
}

/** The raw deep link a notice carries (metadata.deep_link ?? metadata.url) —
 *  ported from the legacy inbox page, kept only to honor Document-route links. */
export function deepLinkFor(n: InboxNotification): string | null {
  const md = n.metadata ?? {};
  return metaString(md, 'deep_link', 'url');
}

/**
 * Classify one Record row (R82). Need-backed types become cross-references to
 * the Desk / the document; everything else is a plain notice.
 */
export function deriveRecordRow(n: InboxNotification): RecordRow {
  const type = (n.type ?? '').toLowerCase();
  // C4 (Schedule & Boards Wave 2): a per-line client verdict lands as ONE
  // notification type ('client_feedback') for approve / flag / note. Only a FLAG
  // is Desk-backed — the 'lines_flagged' need carries the act (resolve / revise)
  // — so only a rejected verdict becomes a quiet cross-reference (R82). An
  // approval or a note has no Desk act and reads as a plain notice. Handled here
  // (not in NOTIFICATION_NEED_KIND) because that map keys on type alone and one
  // type covers all three verdicts.
  const needKind: NeedKind | null =
    type === 'client_feedback'
      ? metaString(n.metadata, 'verdict') === 'rejected'
        ? 'lines_flagged'
        : null
      : (NOTIFICATION_NEED_KIND[type] ?? null);
  const docHref = documentHrefFor(n);

  if (needKind) {
    // The act is on the Desk. Point at the document when we can address it,
    // otherwise at the Desk itself — never at the notice's own act route.
    return {
      kind: 'cross_reference',
      href: docHref ?? '/desk',
      onDesk: true,
      needKind,
    };
  }

  // A plain notice: navigate only if it resolves inside the Document model.
  const deep = deepLinkFor(n);
  const href = docHref ?? (isDocumentRoute(deep) ? deep : null);
  return { kind: 'notice', href, onDesk: false, needKind: null };
}

// ─── The unified Record item (Wave 0B) ───────────────────────────────────────
//
// The Record reads TWO ledgers: notification_log (the inbox feed) and
// procurement_notifications (00151 — deposits/balances due, deliveries,
// damage claims; written by triggers + pg_cron 00189, which never
// double-write into notification_log). Both map into one RecordItem so the
// sheet renders a single dated list and mark-read routes back to the right
// table.

export type RecordSource = 'inbox' | 'procurement';

export interface RecordItem {
  /** Stable list key across both feeds. */
  key: string;
  source: RecordSource;
  /** Source-row id — what mark-read needs. */
  id: string;
  createdAt: string;
  read: boolean;
  title: string;
  body: string;
  /** The mono footer label (the inbox row's humanized type). */
  typeLabel: string;
  row: RecordRow;
}

/** An inbox (notification_log) notice as a Record item. */
export function inboxRecordItem(n: InboxNotification): RecordItem {
  return {
    key: `inbox:${n.id}`,
    source: 'inbox',
    id: n.id,
    createdAt: n.created_at,
    read: isNotificationRead(n),
    title: notificationTitle(n),
    body: notificationBody(n),
    typeLabel: formatType(n.type),
    row: deriveRecordRow(n),
  };
}

/**
 * Procurement kind → the Desk {@link NeedKind} that already carries its act
 * (R82, the NOTIFICATION_NEED_KIND rule): a drafted damage claim is a Desk
 * need, so its Record row is a quiet cross-reference. The due/delivery kinds
 * have no Desk need line — they are plain notices.
 */
export const PROCUREMENT_NEED_KIND: Partial<
  Record<ProcurementNotificationKind, NeedKind>
> = {
  damage_claim_drafted: 'damage_claim',
};

const PROCUREMENT_KIND_TITLE: Record<ProcurementNotificationKind, string> = {
  deposit_due: 'Deposit due',
  balance_due: 'Balance due',
  milestone_due: 'Milestone payment due',
  delivery_this_week: 'Delivery this week',
  damage_claim_drafted: 'Damage claim drafted',
};

/**
 * A procurement notice as a Record item. The title carries the vendor when
 * the joined PO names one ("Deposit due — Hewn Woodworks"); the body is the
 * project name. Navigation follows the Record's own rule: a joined project
 * makes it a document address (`/doc/{id}`), a need-backed kind with no
 * project defers to the Desk, and anything unaddressable is read-only
 * (href null) — the Post never bounces out to a zone.
 */
export function procurementRecordItem(n: ProcurementNotification): RecordItem {
  const kindTitle = PROCUREMENT_KIND_TITLE[n.kind] ?? formatType(n.kind);
  const vendorName = n.purchase_order?.vendor?.name ?? null;
  const projectId = n.purchase_order?.project_id ?? null;
  const needKind = PROCUREMENT_NEED_KIND[n.kind] ?? null;
  const docHref = projectId ? `/doc/${projectId}` : null;

  return {
    key: `procurement:${n.id}`,
    source: 'procurement',
    id: n.id,
    createdAt: n.created_at,
    read: !!n.read_at,
    title: vendorName ? `${kindTitle} — ${vendorName}` : kindTitle,
    body: n.purchase_order?.project?.name ?? '',
    typeLabel: 'Procurement',
    row: needKind
      ? { kind: 'cross_reference', href: docHref ?? '/desk', onDesk: true, needKind }
      : { kind: 'notice', href: docHref, onDesk: false, needKind: null },
  };
}

/** One dated ledger: both feeds merged, newest first. */
export function mergeRecordItems(...feeds: RecordItem[][]): RecordItem[] {
  return feeds
    .flat()
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

// ─── Presentation helpers (pure — shared by the sheet, testable in isolation) ──

export function notificationTitle(n: InboxNotification): string {
  const md = n.metadata ?? {};
  return metaString(md, 'subject', 'headline', 'title') ?? formatType(n.type);
}

export function notificationBody(n: InboxNotification): string {
  const md = n.metadata ?? {};
  return metaString(md, 'preview', 'message', 'body') ?? '';
}

export function formatType(type: string): string {
  return type.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isNotificationRead(n: InboxNotification): boolean {
  return !!n.metadata?.read_at;
}

/** A Letter opens the People Room's Threads view on the shared conversation —
 *  never a copy (the People Room reads `?thread=`, mirrors the person param). */
export function letterHref(message: Pick<InboxMessage, 'thread_id'>): string {
  return `/people?thread=${message.thread_id}`;
}

/** The Letter's headline: the thread's own title, or a scope-derived label. */
export function letterTitle(message: InboxMessage): string {
  const t = message.thread;
  if (t?.title) return t.title;
  switch (t?.kind) {
    case 'project':
      return 'Project conversation';
    case 'vendor_brief':
      return 'Vendor brief';
    case 'support':
      return 'Support';
    default:
      return 'Direct message';
  }
}

/** Relative time for the dated ledger. Older than a week falls back to a date. */
export function relTime(value: string, now: Date = new Date()): string {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return '';
  const sec = Math.round((now.getTime() - then) / 1000);
  if (sec < 60) return `${Math.max(sec, 0)}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(value).toLocaleDateString();
}
