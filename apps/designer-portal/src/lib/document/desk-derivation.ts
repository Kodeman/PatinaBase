/**
 * Desk derivation — spec v1.1 §7, rulings R1/R2.
 *
 * Pure functions from `document_state` rows (migration 00191) to the Desk's
 * two populations: needs-your-hand folders (each with exactly ONE need line —
 * "the one thing") and in-motion chips (never actionable).
 *
 * Deliberately dependency-free: no stages.ts import (it pulls
 * @patina/help-system, the Jest ESM trap), no design-system imports. Stamp
 * colors are CSS-var strings resolved by the portal's globals.css tokens.
 *
 * Thresholds (R10 — Leah-calibrated, Middlewest-authoritative; spec v1.2 §7):
 *   hesitating = sent ≥1 day unopened OR opened ≥2 days unsigned;
 *   lead urgency = deadline inside 24h. Precision watch at Session 02;
 *   per-studio settings when studio #2 onboards.
 */

// The one exception to "dependency-free" is deliberate: overdue-condition.ts
// imports nothing at all, and Ruling IV requires the Desk's order to read the
// same derivation the margin stamp and the guide sentence read.
import {
  deriveOverdue,
  NOT_OVERDUE,
  type OverdueCondition,
} from './overdue-condition';
import {
  DESK_SCHEDULE_UNCONFIGURED,
  isCeremonySourceEvent,
  type DeskScheduleInput,
} from './desk-schedule';

export type EngagementKind = 'project' | 'proposal' | 'lead' | 'relationship';

export type SectionKey =
  | 'brief'
  | 'discovery'
  | 'direction'
  | 'proposal'
  | 'project'
  | 'install'
  | 'care';

export interface DocumentStateRow {
  engagement_kind: EngagementKind;
  engagement_id: string;
  project_id: string | null;
  proposal_id: string | null;
  lead_id: string | null;
  designer_id: string | null;
  client_profile_id: string | null;
  client_name: string;
  title: string;
  project_status: string | null;
  current_phase: string | null;
  active_section: SectionKey;
  is_paused: boolean;
  is_archived: boolean;
  proposal_status: string | null;
  proposal_sent_at: string | null;
  proposal_viewed_at: string | null;
  /** R45 (00211): last touch on a still-drafting proposal — quiet while it's
   *  warm, an "untouched Nd" chip once it goes cold. Null until first edit. */
  proposal_updated_at: string | null;
  /** R71 (00230): opened-event rollups over proposal_engagement — lets the Desk
   *  read "Opened 3×, last Jun 22" instead of first-open only. 0/null until the
   *  client opens it (and only meaningful on the proposal shape). */
  proposal_open_count: number | null;
  proposal_last_opened_at: string | null;
  lead_response_deadline: string | null;
  lead_status: string | null;
  overdue_decision_count: number;
  earliest_overdue_due: string | null;
  awaiting_inspection_count: number;
  blocked_item_count: number;
  in_flight_count: number;
  installed_count: number;
  item_count: number;
  updated_at: string;
  /** R7 (00192): open damage claims on this project's POs. */
  open_claim_count: number;
  open_claim_po: string | null;
  /** D5 (00195): current-week draft pulses (rise on the Desk Friday). */
  unsent_pulse_count: number;
  pulse_week_of: string | null;
  /** R18 (00200): the send weave's Desk inputs. */
  draft_unsent_po_count: number;
  oldest_draft_po_created_at: string | null;
  draft_po_label: string | null;
  unacked_po_count: number;
  oldest_unacked_sent_at: string | null;
  unacked_po_label: string | null;
  /** R23 (00202): dued tasks pass the R22 action test (the act: do it). */
  due_task_count: number;
  earliest_task_due: string | null;
  due_task_title: string | null;
}

export type NeedKind =
  | 'overdue_decision'
  | 'overdue_invoice'
  | 'proposal_signed'
  | 'damage_claim'
  | 'proposal_declined'
  | 'proposal_expired'
  // C4 (Schedule & Boards Wave 2): the client flagged lines on a live proposal.
  | 'lines_flagged'
  | 'new_lead'
  // R106 §3 (the Arrival Arc): a claimed lead whose ceremony was put down
  // mid-draft — the act is WRITING the introduction, so it earns a folder
  // (the R22 action test), never a chip.
  | 'ceremony_pending'
  | 'reconnect_due'
  | 'hesitating_proposal'
  | 'awaiting_inspection'
  | 'schedule_conflict'
  // R109/R110 (00475): an act proposed a schedule anchor and is waiting for the
  // designer's one commit-or-dismiss. Sorts under the contradiction it might
  // one day cause, over the setup nudge.
  | 'schedule_proposal'
  | 'task_due'
  // R113 + R6: the setup nudges the doc body used to leak as error copy. Setup,
  // not a live obstruction — it sorts under both schedule_conflict and task_due.
  | 'schedule_unconfigured'
  | 'po_unsent'
  | 'po_unacknowledged'
  | 'pulse_due';

/** The visible next act printed in each Desk folio footer. Triage-owned lead
 * needs intentionally have no footer act: their TriageBar carries the choices. */
export const NEED_ACTION_LABELS: Record<NeedKind, string | null> = {
  overdue_decision: 'Review decisions',
  overdue_invoice: 'Send reminder',
  proposal_signed: 'Open the project',
  damage_claim: 'Review the claim',
  proposal_declined: 'Follow up',
  proposal_expired: 'Revise proposal',
  lines_flagged: 'Review flagged lines',
  new_lead: null,
  ceremony_pending: 'Continue the introduction',
  reconnect_due: null,
  hesitating_proposal: 'Follow up',
  awaiting_inspection: 'Inspect the delivery',
  schedule_conflict: 'Resolve the schedule',
  schedule_proposal: 'Review the proposed date',
  task_due: 'Open the task',
  schedule_unconfigured: 'Open the schedule',
  po_unsent: 'Review the purchase order',
  po_unacknowledged: 'Follow up with the maker',
  pulse_due: 'Review and send',
};

/** R28 conflict inputs (built client-side from delivery_events by
 *  lib/document/desk-conflicts.ts — the Wave 2.1 precedent). Collision tier
 *  rises as the folder's need line; drift tier rides an in-motion chip. */
export interface DeskConflictInput {
  collision: { text: string; label: string; date: string | null } | null;
  drift: string | null;
}

/** R36 receivables input (built client-side from invoices by
 *  lib/document/desk-receivables.ts — the same Wave 2.1 precedent as conflicts).
 *  An overdue + unchased receivable rises as the folder's need line; the act
 *  (send the reminder / chase) lives on the Accounts book's Receivables page,
 *  so one act clears both surfaces. Keyed by project_id. */
export interface ReceivableSignal {
  count: number;
  /** Oldest due_date among the overdue + unchased invoices (ISO). */
  oldestDue: string | null;
  totalBalanceCents: number;
  /** The invoice the Desk act addresses (the oldest overdue one). */
  invoiceId: string;
  /** Display label for that invoice (number, or "A draft invoice"). */
  invoiceLabel: string;
}

/** C4 flagged-lines input (built client-side from item_feedback by
 *  lib/document/desk-flagged-lines.ts — the same Wave 2.1 precedent as conflicts
 *  and receivables). A proposal with unresolved client rejections rises as the
 *  folder's need line ("N lines flagged on {doc}"); the act — respond / resolve /
 *  revise — lives in the document's line unfold. Keyed by proposal_id. Typed
 *  structurally here (not imported) to keep this module dependency-free. */
export interface DeskFlaggedSignal {
  /** How many lines the client has flagged and not-yet-resolved. */
  count: number;
  /** The proposal's title, for the need line. */
  docTitle: string;
  proposalId: string;
}

/** R106 (the Arrival Arc) ceremony input, structural (not imported — the
 *  desk-conflicts precedent: this module stays dependency-free). One
 *  `match_ceremonies` row's Desk-relevant shape, built by
 *  lib/document/desk-ceremonies.ts and looked up per engagement by
 *  partitionDesk — by lead_id for the parked-card need (Shape C), by
 *  designer_client_id for the in-motion chip (Shape D). A flag-off designer
 *  has no ceremony rows at all, so every ceremony-shaped branch below is
 *  simply unreachable — that IS the flag-off safety net at this pure layer;
 *  no separate flag check belongs here. */
export interface DeskCeremonySignal {
  id: string;
  state: 'draft' | 'sent' | 'picked';
  introText: string | null;
  offeredSlots: ReadonlyArray<{
    id: string;
    starts_at: string;
    duration_minutes: number;
  }> | null;
  offeredAt: string | null;
  pickedSlotStartsAt: string | null;
  timezone: string | null;
  threadId: string | null;
}

export interface NeedLine {
  kind: NeedKind;
  text: string;
  /** Explicit, non-PII next-act copy printed on the whole-card folio footer.
   *  `null` means the card owns a visible TriageBar instead. */
  actionLabel: string | null;
  /** `color` is the stamp border; `ink` (optional) darkens the text for
   *  contrast on paper, per the prototype's stamp treatment. */
  stamp: { label: string; color: string; ink?: string };
  urgent: boolean;
  /** When set, the folder's act opens a Drawer ledger (R36: the overdue-invoice
   *  need opens the Accounts book onto Receivables) rather than the document.
   *  Typed structurally to keep this module dependency-free (no command-bar
   *  import); folder-card maps it onto openLedger(). */
  ledger?: {
    name: string;
    context?: { page?: string; invoiceId?: string; projectId?: string };
  };
  /** When set, the folder's act follows this href instead of /doc/[engagement_id].
   *  The lines_flagged walk-in points at the Drafting Room (?flagged=1), where the
   *  flagged line's Alternatives band lives. Typed structurally; folder-card maps it. */
  deepLink?: string;
  /** R106 §3: the parked-ceremony card's held-draft preview — the intro's
   *  first words, when she'd started writing before putting it down. Absent
   *  for every other need kind (and for a ceremony still at its blank stub). */
  sub?: string;
}

export interface DeskFolder {
  row: DocumentStateRow;
  need: NeedLine;
  /** Ruling IV — the one overdue derivation, read by this folio's order and by
   *  its stamp. Undefined only where a folder was built outside partitionDesk. */
  overdue?: OverdueCondition;
  /** The whole chain this row produced, priority-ordered — `need` is its head.
   *  Undefined only where a folder was built outside partitionDesk. */
  needs?: NeedLine[];
}

// ─── R53: People on the Desk (the nurture-due / reconnect surface) ──────────
//
// A dormant high-trust tie is a need — but a *quiet* one, and one that lives
// over the unified directory (people_directory), NOT over document_state. So it
// is kept a SEPARATE Desk population from the engagement folders: it never
// touches partitionDesk / the project-folder model. The Desk page derives it
// from the People Room's own nurture queue (deriveNurtureQueue, Track B) and
// renders it under the in-motion chips as its own small section.
//
// The act is not "pick up a document" — it is "reach out" — so the line links
// into the People Room's Nurture view (/people), the same R22 awareness logic
// the receivables/send-weave needs use (the act lives where it belongs).

/** The minimal shape `deriveReconnectNeeds` reads off a NurtureEntry — kept
 *  structural so this module stays dependency-free (no people-derivation
 *  import, mirroring how DeskConflictInput / ReceivableSignal are passed in). */
export interface NurtureLike {
  person: {
    person_id: string;
    role: string;
    display_name: string;
    last_touch_at: string | null;
    meta?: Record<string, unknown> | null;
  };
  /** Reconnect-now (true) vs warm/keep-tending (false). */
  due: boolean;
  /** Why this surfaced (the human reason line). */
  reason: string;
  /** Ranking weight — higher sorts first. */
  score: number;
}

/** A quiet Desk reconnect line — a person who has drifted past the reconnect
 *  threshold (a dormant high-trust tie, or a lead owing a reply). Distinct from
 *  a NeedLine: it carries no stamp and never an urgent outline; it is the
 *  softest tier on the Desk, below the in-motion chips. */
export interface ReconnectNeed {
  personId: string;
  role: string;
  /** The person's name (the line's subject). */
  name: string;
  /** The human reason — why now. */
  reason: string;
}

// R53 — how many reconnect ties surface on the Desk at once. The Desk is a
// place of focus, not a CRM queue: only the strongest few dormant ties rise;
// the full ranked list lives in the People Room's Nurture view.
const MAX_RECONNECT_NEEDS = 3;

/** The Desk's reconnect surface (R53): the strongest few "reconnect now" ties,
 *  derived from the People Room's nurture queue. Takes the already-ranked
 *  entries (deriveNurtureQueue output) so the ranking logic stays single-source
 *  in people-derivation; this only filters to the DUE band and caps the count.
 *  Returns [] when nothing is due — the section then never renders. */
export function deriveReconnectNeeds(
  entries: readonly NurtureLike[],
  _now: Date,
  limit: number = MAX_RECONNECT_NEEDS,
): ReconnectNeed[] {
  return entries
    .filter((e) => e.due)
    .slice(0, Math.max(0, limit))
    .map((e) => ({
      personId: e.person.person_id,
      role: e.person.role,
      name: e.person.display_name,
      reason: e.reason,
    }));
}

/** R45: the in-motion chip's flavor — a stable style/telemetry hook independent
 *  of the (translatable, count-bearing) display text. `deriveMotion` returns
 *  one of these alongside `text`; the chip component may key its treatment off
 *  it (optional — the default chip styling is kind-agnostic). */
export type MotionKind =
  | 'drafting'
  | 'sent_unopened'
  | 'with_client'
  | 'in_discovery'
  | 'paused'
  | 'in_flight'
  | 'drift'
  | 'conflict'
  // R108: the project's own position, spoken in the register its dates support.
  | 'schedule_position'
  // R106 §4 (the Arrival Arc): the four ceremony-in-motion states, replacing
  // the static "Schedule the discovery call" text for a relationship whose
  // ceremony has sent. Never promotes to a folder — the wait is a chip
  // forever (the prototype's own note: "the wait is a chip, never a desk
  // folder — R22").
  | 'discovery_scheduled'
  | 'slots_stale'
  | 'intro_nudge'
  | 'intro_sent';

export interface MotionChip {
  row: DocumentStateRow;
  kind: MotionKind;
  text: string;
  /** Overrides the default `/doc/{engagement_id}` destination. R106 §4: the
   *  discovery-scheduled/stale-slots states deep-link into the Discovery
   *  fold, and the nudge state opens the thread instead of the document.
   *  Absent for every pre-arc chip kind — the default stays byte-identical. */
  href?: string;
  /** R106 §5 (telemetry) — the ceremony this chip renders, so the
   *  nudge/fresh-times-requested events can dedupe per ceremony rather than
   *  per render. Set only for the ceremony-derived chip kinds. */
  ceremonyId?: string;
}

const DAY_MS = 86_400_000;
// R10 thresholds — FINAL (Leah-calibrated; stand as-is, zero-FP/zero-miss at
// heat, L3): opened ≥2 days unsigned → folder (act: follow up); lead ≤24h.
const HESITATION_UNSIGNED_DAYS = 2;
const LEAD_URGENT_WINDOW_MS = 24 * 3_600_000;
// R22 — the awareness tier: a sent-unopened proposal's only act on day 1 is
// waiting, so it renders as an In-motion chip carrying its state; it PROMOTES
// to a needs-your-hand folder at 2 days unopened (act: follow up).
const SENT_UNOPENED_CHIP_DAYS = 1;
const SENT_UNOPENED_PROMOTE_DAYS = 2;
// R45 — PROVISIONAL (Leah-calibration-pending): a still-drafting proposal is
// quiet while she's actively in it (touched < this many days). Once it goes
// cold (untouched ≥ this), it surfaces as an "drafting, untouched Nd" in-motion
// chip — state carried, never a nag. Number stands until Leah confirms.
const DRAFTING_UNTOUCHED_CHIP_DAYS = 3;
// R18 send-weave thresholds — FINAL (Leah's numbers, L3 capture): a drafted
// PO unsent / a sent PO unacknowledged is the designer's own pen / a chase
// after one day.
const PO_DRAFT_UNSENT_DAYS = 1;
const PO_SENT_UNACKED_DAYS = 1;
// R36 A/R aging — PROVISIONAL (constants watch, like the send weave): a
// receivable past due rises on the Desk (act: send the reminder); once the
// designer chases it, the only available act is over, so it drops for a
// cooldown before it can rise again. Leah-calibrated when Accounts goes live.
export const AR_OVERDUE_NEEDS_DAYS = 1;
export const AR_CHASE_COOLDOWN_DAYS = 7;
const MAX_MOTION_CHIPS = 6;

/** Severity rank — lower sorts first within the needs stack. */
const NEED_RANK: Record<NeedKind, number> = {
  overdue_decision: 0,
  // R36: money owed past its terms is the studio's own exposure — it sorts
  // just under a blocking client decision, above the proposal/lead moments.
  overdue_invoice: 1,
  proposal_signed: 2,
  damage_claim: 3,
  proposal_declined: 4,
  proposal_expired: 5,
  // C4: a client flag on a live proposal is a proposal-cluster need — the client
  // actively raised a concern and is waiting on the designer, so it sorts just
  // under the terminal proposal states and above a fresh lead / a silent
  // hesitation. Fractional to stay surgical (the sort is numeric).
  lines_flagged: 5.5,
  new_lead: 6,
  // R106 §3: a claimed lead with the ceremony parked mid-draft — the same
  // Brief-active triage tier as a fresh lead (rank "at/near new_lead" per the
  // ruling); ties break on the fallback date key (row.updated_at, which the
  // claim itself stamps).
  ceremony_pending: 6,
  // R65: a due reconnect is a real need but a soft one — it sorts just under a
  // fresh inquiry (a new lead outranks a scheduled touchpoint) and above the
  // hesitating-proposal nudge. Fractional to stay surgical (sort is numeric).
  reconnect_due: 6.5,
  hesitating_proposal: 7,
  awaiting_inspection: 8,
  // R28: a schedule collision slots under awaiting-inspection; R33's blessed
  // ordering (TASK DUE below awaiting-inspection, above send-weave) holds.
  schedule_conflict: 9,
  // R109/R110: a proposed anchor is a real pending act — it sorts directly
  // under the contradiction and above a committed task. Fractional to stay
  // surgical (sort is numeric).
  schedule_proposal: 9.5,
  task_due: 10,
  // R113/R6: an unconfigured schedule is setup work, not a live obstruction —
  // it sorts under the collision it might one day cause and under a task the
  // designer already committed to. Fractional to stay surgical (sort is numeric).
  schedule_unconfigured: 10.5,
  po_unsent: 11,
  po_unacknowledged: 12,
  pulse_due: 13,
};

/** Prototype stamp palette (v0.3 is the look authority): borders use brand
 *  vars; warm-toned stamps darken their text ink for contrast on paper.
 *  Golden Hour is reserved for the urgent folder outline, never stamp text. */
const STAMP = {
  due: { color: 'var(--color-terracotta)', ink: '#C4836F' },
  terracotta: { color: 'var(--color-terracotta)', ink: '#C4836F' },
  clay: { color: 'var(--color-clay)', ink: '#A8895E' },
  dustyBlue: { color: 'var(--color-dusty-blue)' },
  sage: { color: 'var(--color-sage)', ink: '#85947C' },
} as const;

// Bare DATE columns (e.g. an invoice due_date 'YYYY-MM-DD') must parse as LOCAL
// midnight, or `new Date()` reads them as UTC and the rendered day slips back a
// day in negative-offset timezones. Timestamps (with a time part) are unaffected.
const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso),
  );

const daysBetween = (earlierIso: string, now: Date) =>
  Math.floor((now.getTime() - new Date(earlierIso).getTime()) / DAY_MS);

// R106 — the Arrival Arc's small text helpers. Kept local (not folder-tab's
// last-name convention): the parked card's copy is first-name, conversational
// ("Introduce yourself to Elena").
function firstName(name: string | null | undefined, fallback = 'them'): string {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first || fallback;
}

/** "Discovery · Thu 2:00 PM" — day + time in the ceremony's own timezone
 *  (falls back to UTC when the ceremony carries none). No comma (unlike
 *  Intl's default weekday+time punctuation) to match the prototype's copy. */
function fmtDayTime(iso: string, timezone: string | null): string {
  const d = new Date(iso);
  const tz = timezone || 'UTC';
  const day = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: tz,
  }).format(d);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  }).format(d);
  return `${day} ${time}`;
}

/** The parked-ceremony sub-line's draft preview (scene 3b: "draft held —
 *  'Elena, I keep thinking about what you said about rooms that…'"). */
function truncateWords(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}…`;
}

/** Words that mean "we don't actually know the client" — the view's
 *  fallbacks and seed-account role nouns. The tab never wears them (R16). */
const ROLE_NOUNS = new Set(['client', 'user']);

/** Folder-tab text (R1: the family name; R16 fallback: when no surname
 *  resolves, the first word of the document title — never a role noun). */
export function folderTab(
  row: Pick<DocumentStateRow, 'client_name' | 'title'>,
): string {
  const parts = (row.client_name ?? '').trim().split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  if (last && !ROLE_NOUNS.has(last.toLowerCase())) return last;
  const firstOfTitle = (row.title ?? '').trim().split(/\s+/)[0];
  return firstOfTitle || last || '—';
}

/** Everything deriveNeed used to read off its parameter list, bundled so the
 *  chain below can be a list of rules instead of one long function. */
interface NeedContext {
  row: DocumentStateRow;
  now: Date;
  conflict?: DeskConflictInput | null;
  receivable?: ReceivableSignal | null;
  flagged?: DeskFlaggedSignal | null;
  ceremony?: DeskCeremonySignal | null;
  schedule?: DeskScheduleInput | null;
}

/** A rule that owns its engagement kind outright. The original deriveNeed
 *  returned from INSIDE the proposal and lead blocks — with a need or with
 *  null — so no rule below them could ever see those rows. Sealing is how that
 *  early exit survives being cut into a list. */
interface SealedNeed {
  sealed: true;
  need: NeedLine | null;
}

const seal = (need: NeedLine | null): SealedNeed => ({ sealed: true, need });

type NeedRule = (ctx: NeedContext) => NeedLine | SealedNeed | null;

const needOverdueDecision: NeedRule = ({ row }) => {
  if (row.overdue_decision_count > 0) {
    const oldest = row.earliest_overdue_due
      ? ` — oldest due ${fmtDay(row.earliest_overdue_due)}`
      : '';
    const n = row.overdue_decision_count;
    return {
      kind: 'overdue_decision',
      text:
        n === 1
          ? `1 decision overdue${oldest}`
          : `${n} decisions overdue${oldest}`,
      actionLabel: NEED_ACTION_LABELS.overdue_decision,
      stamp: { label: 'DECISION DUE', ...STAMP.due },
      urgent: true,
    };
  }
  return null;
};

// R36: an overdue + unchased receivable rises here (just under a blocking
// decision). The act isn't "pick up the document" — it's "send the reminder",
// which lives on the Accounts book's Receivables page, so the folder opens
// that ledger (need.ledger) rather than the document. Chasing the invoice
// stamps ar_last_chased_at; on the next read this signal is gone and the
// folder clears — the same R22 awareness tier as the send weave.
const needOverdueInvoice: NeedRule = ({ receivable }) => {
  if (receivable) {
    const oldest = receivable.oldestDue
      ? ` — oldest due ${fmtDay(receivable.oldestDue)}`
      : '';
    const n = receivable.count;
    return {
      kind: 'overdue_invoice',
      text:
        n === 1
          ? `${receivable.invoiceLabel} overdue${oldest} — send a reminder`
          : `${n} invoices overdue${oldest} — send a reminder`,
      actionLabel: NEED_ACTION_LABELS.overdue_invoice,
      stamp: { label: 'PAST DUE', ...STAMP.terracotta },
      urgent: false,
      ledger: {
        name: 'accounts',
        context: { page: 'receivables', invoiceId: receivable.invoiceId },
      },
    };
  }
  return null;
};

const needProposal: NeedRule = ({ row, now, flagged }) => {
  if (row.engagement_kind === 'proposal') {
    // Signed but no project row yet (DECISIONS.md I7): the signing moment
    // is waiting on the designer's hand — activation opens the project.
    if (row.proposal_status === 'accepted') {
      return seal({
        kind: 'proposal_signed',
        text: 'Signed — open the project',
        actionLabel: NEED_ACTION_LABELS.proposal_signed,
        stamp: { label: 'SIGNED', ...STAMP.sage },
        urgent: false,
      });
    }
    if (row.proposal_status === 'declined') {
      return seal({
        kind: 'proposal_declined',
        text: 'Proposal declined — follow up',
        actionLabel: NEED_ACTION_LABELS.proposal_declined,
        stamp: { label: 'DECLINED', ...STAMP.terracotta },
        urgent: false,
      });
    }
    if (row.proposal_status === 'expired') {
      return seal({
        kind: 'proposal_expired',
        text: 'Proposal expired — revise or follow up',
        actionLabel: NEED_ACTION_LABELS.proposal_expired,
        stamp: { label: 'EXPIRED', ...STAMP.terracotta },
        urgent: false,
      });
    }
    // C4: the client has flagged lines on a still-live proposal — a concrete
    // concern raised on the copy, waiting on the designer to respond (resolve /
    // revise). It's a stronger, more actionable need than a silent hesitation,
    // so it rises above the sent-unopened / viewed-unsigned nudges below. The
    // clay FLAGGED stamp matches the line's own verdict chip.
    if (flagged && flagged.count > 0) {
      const n = flagged.count;
      return seal({
        kind: 'lines_flagged',
        text:
          n === 1
            ? `1 line flagged on ${flagged.docTitle}`
            : `${n} lines flagged on ${flagged.docTitle}`,
        actionLabel: NEED_ACTION_LABELS.lines_flagged,
        stamp: { label: 'FLAGGED', color: 'var(--color-clay)' },
        urgent: false,
        deepLink: `/drafting/${flagged.proposalId}?flagged=1`,
      });
    }
    if (
      row.proposal_status === 'sent' &&
      row.proposal_sent_at &&
      !row.proposal_viewed_at
    ) {
      const days = daysBetween(row.proposal_sent_at, now);
      // R22: a folder only once waiting is no longer the only act (≥2 days
      // unopened = follow up). Day 1 lives as an In-motion chip (deriveMotion).
      if (days >= SENT_UNOPENED_PROMOTE_DAYS) {
        return seal({
          kind: 'hesitating_proposal',
          text: `Sent ${fmtDay(row.proposal_sent_at)} — not yet opened`,
          actionLabel: NEED_ACTION_LABELS.hesitating_proposal,
          stamp: { label: 'SENT', ...STAMP.dustyBlue },
          urgent: false,
        });
      }
    }
    if (row.proposal_status === 'viewed' && row.proposal_viewed_at) {
      const days = daysBetween(row.proposal_viewed_at, now);
      if (days >= HESITATION_UNSIGNED_DAYS) {
        // R71: when they've come back more than once, the count is the signal
        // (engaged but not committing); a single open keeps the calm first-open
        // read. proposal_last_opened_at is the freshest touch (00230 rollup).
        const opens = row.proposal_open_count ?? 0;
        const lastOpen = row.proposal_last_opened_at ?? row.proposal_viewed_at;
        const text =
          opens > 1
            ? `Opened ${opens}× — last ${fmtDay(lastOpen)}, no signature yet`
            : `Opened ${fmtDay(lastOpen)} — no signature yet`;
        return seal({
          kind: 'hesitating_proposal',
          text,
          actionLabel: NEED_ACTION_LABELS.hesitating_proposal,
          stamp: { label: 'VIEWED', ...STAMP.dustyBlue },
          urgent: false,
        });
      }
    }
    return seal(null);
  }
  return null;
};

const needLead: NeedRule = ({ row, now, ceremony }) => {
  if (row.engagement_kind === 'lead') {
    // R106 §3: a claimed lead whose ceremony was put down mid-draft is
    // "Introduce yourself to {first name}" — the act available is WRITING
    // the introduction, so it earns a folder (the R22 action test), never a
    // chip. Outranks the nurture/new-lead branches below; a lead never
    // routed through the arc's claim (or a flag-off designer, who has no
    // ceremony rows at all) falls straight through unchanged.
    if (ceremony && ceremony.state === 'draft') {
      const draftText = (ceremony.introText ?? '').trim();
      return seal({
        kind: 'ceremony_pending',
        text: `Introduce yourself to ${firstName(row.client_name)}`,
        actionLabel: NEED_ACTION_LABELS.ceremony_pending,
        stamp: { label: 'CLAIMED · CEREMONY WAITING', ...STAMP.clay },
        urgent: false,
        deepLink: `/ceremony/${row.lead_id}`,
        sub: draftText
          ? `Your draft is held — "${truncateWords(draftText, 60)}"`
          : undefined,
      });
    }

    // R65 — a nurtured lead (status='contacted') carries a RECONNECT DATE in
    // response_deadline. It stays off the needs-hand band until that date, then
    // rises again here as a 'reconnect_due' need — a dated thing earns a return
    // (R22). An undated or still-future reconnect → no folder (People's quiet
    // reconnect band covers the undated case). Reuses response_deadline; the
    // meaning follows status, so nothing is added (D7).
    if (row.lead_status === 'contacted') {
      const reconnectAt = row.lead_response_deadline;
      if (reconnectAt && new Date(reconnectAt).getTime() <= now.getTime()) {
        return seal({
          kind: 'reconnect_due',
          text: `Reconnect — touchpoint due ${fmtDay(reconnectAt)}`,
          actionLabel: NEED_ACTION_LABELS.reconnect_due,
          stamp: { label: 'RECONNECT', ...STAMP.dustyBlue },
          urgent: false,
        });
      }
      return seal(null);
    }

    // R61 — the new-lead triage gate. Shape C (`document_state`) still includes
    // `leads.status='contacted'` (handled above); accepted/declined leave Shape
    // C entirely. Only a lead the designer hasn't yet acted on (new/viewed) is
    // "the one thing today".
    if (row.lead_status !== 'new' && row.lead_status !== 'viewed')
      return seal(null);

    const deadline = row.lead_response_deadline;
    const msLeft = deadline
      ? new Date(deadline).getTime() - now.getTime()
      : null;
    const closing = msLeft !== null && msLeft < LEAD_URGENT_WINDOW_MS;
    const text =
      deadline === null
        ? 'New lead — respond'
        : msLeft! < 0
          ? 'Response window passed — reply anyway'
          : closing
            ? `Respond by ${fmtDay(deadline)} — closing soon`
            : `New lead — respond by ${fmtDay(deadline)}`;
    return seal({
      kind: 'new_lead',
      text,
      actionLabel: NEED_ACTION_LABELS.new_lead,
      stamp: { label: 'NEW LEAD', ...STAMP.clay },
      urgent: closing,
    });
  }
  return null;
};

// R7: claims surface at the grain where they are true — the PO. The line
// stamp stays suppressed until per-item attribution exists (Slice 4).
const needDamageClaim: NeedRule = ({ row }) => {
  if (row.open_claim_count > 0) {
    const n = row.open_claim_count;
    return {
      kind: 'damage_claim',
      text:
        n === 1
          ? `${row.open_claim_po ?? 'A delivery'} has an open damage claim`
          : `${n} open damage claims — review receiving`,
      actionLabel: NEED_ACTION_LABELS.damage_claim,
      stamp: { label: 'CLAIM OPEN', ...STAMP.terracotta },
      urgent: false,
    };
  }
  return null;
};

const needAwaitingInspection: NeedRule = ({ row }) => {
  if (row.awaiting_inspection_count > 0) {
    const n = row.awaiting_inspection_count;
    return {
      kind: 'awaiting_inspection',
      text:
        n === 1
          ? '1 piece delivered — awaiting inspection'
          : `${n} pieces delivered — awaiting inspection`,
      actionLabel: NEED_ACTION_LABELS.awaiting_inspection,
      stamp: { label: 'DELIVERED', ...STAMP.sage },
      urgent: false,
    };
  }
  return null;
};

// R28: the calendar's intelligence, promoted — a collision needs her hand
// (two installs one week, or a delivery landing after its install). Drift
// with no act stays an in-motion chip (deriveMotion).
const needScheduleCollision: NeedRule = ({ conflict }) => {
  if (conflict?.collision) {
    return {
      kind: 'schedule_conflict',
      text: conflict.collision.text,
      actionLabel: NEED_ACTION_LABELS.schedule_conflict,
      stamp: { label: conflict.collision.label, ...STAMP.terracotta },
      urgent: false,
    };
  }
  return null;
};

// R4 / "Ruling IV" (overdue-condition.ts): one fact, exactly three
// renderings. The resolver's own contradiction — a chain that no longer fits
// the anchor holding it — already stamps the spine row (Slice 03) and, by
// riding the SAME need kind, re-sorts this folder and speaks the guide's
// sentence. No fourth rendering. The text is built upstream from phase
// NAMES; the resolver's own message carries raw ids and never surfaces.
const needScheduleContradiction: NeedRule = ({ schedule }) => {
  if (schedule?.contradictionText) {
    return {
      kind: 'schedule_conflict',
      text: schedule.contradictionText,
      actionLabel: NEED_ACTION_LABELS.schedule_conflict,
      stamp: { label: 'SCHEDULE', ...STAMP.terracotta },
      urgent: false,
    };
  }
  return null;
};

// R109's third class rides the same register: an act whose date contradicts
// an anchor already committed reports — it never offers a slide to commit.
const needScheduleProposalConflict: NeedRule = ({ schedule }) => {
  if (schedule?.proposals && schedule.proposals.conflicting > 0) {
    return {
      kind: 'schedule_conflict',
      text: 'A recorded date contradicts an anchor already committed',
      actionLabel: NEED_ACTION_LABELS.schedule_conflict,
      stamp: { label: 'SCHEDULE', ...STAMP.terracotta },
      urgent: false,
    };
  }
  return null;
};

// R109/R110 (00475): an act proposed an anchor and is waiting for one
// designer act — commit it or dismiss it. The line names the source honestly:
// a signed act and a recorded event are not the same evidence.
const needScheduleProposal: NeedRule = ({ schedule }) => {
  if (schedule?.proposals && schedule.proposals.count > 0) {
    return {
      kind: 'schedule_proposal',
      text: isCeremonySourceEvent(schedule.proposals.latestSourceEvent)
        ? 'A signed act proposes a schedule anchor — review'
        : 'A recorded event proposes a schedule anchor — review',
      actionLabel: NEED_ACTION_LABELS.schedule_proposal,
      stamp: { label: 'PROPOSED', ...STAMP.clay },
      urgent: false,
    };
  }
  return null;
};

// R23: a dued task is the designer's own committed act — it rises (the
// R22 test passes: the act is doing it). Undated tasks never nag.
const needTaskDue: NeedRule = ({ row }) => {
  if (row.due_task_count > 0 && row.earliest_task_due) {
    const n = row.due_task_count;
    return {
      kind: 'task_due',
      text:
        n === 1
          ? `Task due — ${row.due_task_title ?? 'one line in the work'}`
          : `${n} tasks due — oldest ${fmtDay(row.earliest_task_due)}`,
      actionLabel: NEED_ACTION_LABELS.task_due,
      stamp: { label: 'TASK DUE', ...STAMP.clay },
      urgent: false,
    };
  }
  return null;
};

// R113 + R6: the setup nudges the doc body used to leak as error copy, now
// gated on the sections where composing a schedule IS the act. Ranked below
// the collision and below a committed task — this is setup, not obstruction.
const needScheduleUnconfigured: NeedRule = ({ row, schedule }) => {
  if (
    schedule?.unconfigured &&
    row.engagement_kind === 'project' &&
    (row.active_section === 'project' || row.active_section === 'install')
  ) {
    return {
      kind: 'schedule_unconfigured',
      text:
        schedule.unconfigured === 'no-phases'
          ? 'Name the phases for this project'
          : 'Anchor the install week',
      actionLabel: NEED_ACTION_LABELS.schedule_unconfigured,
      stamp: { label: 'BAND', ...STAMP.clay },
      urgent: false,
    };
  }
  return null;
};

// R18: the send weave. A drafted PO the studio never sent is the
// designer's own pen (rises first); a sent PO the vendor hasn't
// acknowledged is a nudge. Both thresholds provisional (constants watch).
const needPoUnsent: NeedRule = ({ row, now }) => {
  if (row.draft_unsent_po_count > 0 && row.oldest_draft_po_created_at) {
    const days = daysBetween(row.oldest_draft_po_created_at, now);
    if (days >= PO_DRAFT_UNSENT_DAYS) {
      const n = row.draft_unsent_po_count;
      return {
        kind: 'po_unsent',
        text:
          n === 1
            ? `${row.draft_po_label ?? 'A purchase order'} drafted — not yet sent`
            : `${n} POs drafted — not yet sent`,
        actionLabel: NEED_ACTION_LABELS.po_unsent,
        stamp: { label: 'UNSENT', ...STAMP.clay },
        urgent: false,
      };
    }
  }
  return null;
};

const needPoUnacknowledged: NeedRule = ({ row, now }) => {
  if (row.unacked_po_count > 0 && row.oldest_unacked_sent_at) {
    const days = daysBetween(row.oldest_unacked_sent_at, now);
    if (days >= PO_SENT_UNACKED_DAYS) {
      const n = row.unacked_po_count;
      return {
        kind: 'po_unacknowledged',
        text:
          n === 1
            ? `${row.unacked_po_label ?? 'A purchase order'} sent — no acknowledgment`
            : `${n} POs sent — no acknowledgment`,
        actionLabel: NEED_ACTION_LABELS.po_unacknowledged,
        stamp: { label: 'NO ACK', ...STAMP.dustyBlue },
        urgent: false,
      };
    }
  }
  return null;
};

// D5: Friday unsent Pulses rise on the Desk — never earlier in the week.
const needPulseDue: NeedRule = ({ row, now }) => {
  if (row.unsent_pulse_count > 0 && row.pulse_week_of) {
    const monday = new Date(`${row.pulse_week_of}T00:00:00`);
    const friday = monday.getTime() + 4 * DAY_MS;
    if (now.getTime() >= friday) {
      return {
        kind: 'pulse_due',
        text: 'Friday Pulse drafted — review & send',
        actionLabel: NEED_ACTION_LABELS.pulse_due,
        stamp: { label: 'PULSE', ...STAMP.sage },
        urgent: false,
      };
    }
  }
  return null;
};

/** The chain, in the order it has always been read. Priority is position:
 *  deriveNeed still takes the first line this list produces. */
const NEED_RULES: readonly NeedRule[] = [
  needOverdueDecision,
  needOverdueInvoice,
  needProposal,
  needLead,
  needDamageClaim,
  needAwaitingInspection,
  needScheduleCollision,
  needScheduleContradiction,
  needScheduleProposalConflict,
  needScheduleProposal,
  needTaskDue,
  needScheduleUnconfigured,
  needPoUnsent,
  needPoUnacknowledged,
  needPulseDue,
];

/** EVERY thing this engagement needs from the designer today, in priority
 *  order — the whole chain read out instead of stopped at its first line.
 *  An archived or paused engagement needs nothing. */
export function deriveNeeds(
  row: DocumentStateRow,
  now: Date,
  conflict?: DeskConflictInput | null,
  receivable?: ReceivableSignal | null,
  flagged?: DeskFlaggedSignal | null,
  ceremony?: DeskCeremonySignal | null,
  schedule?: DeskScheduleInput | null,
): NeedLine[] {
  if (row.is_archived || row.is_paused) return [];
  const ctx: NeedContext = {
    row,
    now,
    conflict,
    receivable,
    flagged,
    ceremony,
    schedule,
  };
  const needs: NeedLine[] = [];
  for (const rule of NEED_RULES) {
    const result = rule(ctx);
    if (result === null) continue;
    if ('sealed' in result) {
      if (result.need) needs.push(result.need);
      break;
    }
    needs.push(result);
  }
  return needs;
}

/** The ONE thing this engagement needs from the designer today, or null. */
export function deriveNeed(
  row: DocumentStateRow,
  now: Date,
  conflict?: DeskConflictInput | null,
  receivable?: ReceivableSignal | null,
  flagged?: DeskFlaggedSignal | null,
  ceremony?: DeskCeremonySignal | null,
  schedule?: DeskScheduleInput | null,
): NeedLine | null {
  return (
    deriveNeeds(row, now, conflict, receivable, flagged, ceremony, schedule)[0] ??
    null
  );
}

/** One quiet line for an engagement progressing without the designer, paired
 *  with its `kind` (a stable style/telemetry hook). Null = nothing shows. */
export function deriveMotion(
  row: DocumentStateRow,
  now: Date,
  conflict?: DeskConflictInput | null,
  ceremony?: DeskCeremonySignal | null,
  schedule?: DeskScheduleInput | null,
): {
  kind: MotionKind;
  text: string;
  href?: string;
  ceremonyId?: string;
} | null {
  if (row.is_archived) return null;
  if (row.is_paused) return { kind: 'paused', text: 'Paused' };

  if (row.engagement_kind === 'proposal') {
    if (row.proposal_status === 'draft') {
      // R45: actively-drafting is quiet — while she's in it, nothing shows. The
      // chip only appears once the draft goes cold (untouched ≥ threshold), and
      // then it carries state, never a nag. Falls back to updated_at when the
      // view has no proposal-level touch (pre-00211 rows, or never edited).
      const touchedIso = row.proposal_updated_at ?? row.updated_at;
      const days = daysBetween(touchedIso, now);
      if (days >= DRAFTING_UNTOUCHED_CHIP_DAYS) {
        return { kind: 'drafting', text: `drafting, untouched ${days}d` };
      }
      return null;
    }
    if (
      row.proposal_status === 'sent' &&
      row.proposal_sent_at &&
      !row.proposal_viewed_at
    ) {
      const days = daysBetween(row.proposal_sent_at, now);
      // R22: the awareness tier — state carried, never a nag. (Promotes to a
      // folder at SENT_UNOPENED_PROMOTE_DAYS, where deriveNeed takes over.)
      if (days >= SENT_UNOPENED_CHIP_DAYS) {
        return { kind: 'sent_unopened', text: `sent, unopened ${days}d` };
      }
      return {
        kind: 'with_client',
        text: `With client since ${fmtDay(row.proposal_sent_at)}`,
      };
    }
    if (row.proposal_status === 'sent' || row.proposal_status === 'viewed') {
      const since = row.proposal_sent_at
        ? ` since ${fmtDay(row.proposal_sent_at)}`
        : '';
      // R71: a fresh viewed proposal that's come back more than once carries the
      // count quietly (still an awareness chip, never a nag).
      const opens = row.proposal_open_count ?? 0;
      const opened = opens > 1 ? ` · opened ${opens}×` : '';
      return { kind: 'with_client', text: `With client${since}${opened}` };
    }
    return null;
  }

  // R61: a relationship in Discovery (Shape D — the post-Accept state) carries
  // its real next act. "Schedule the discovery call" reads more honestly than the
  // bare "In discovery": it tells the designer what the document is waiting on.
  //
  // R106 §4: once the Arrival Arc ceremony has actually sent, that static
  // line is replaced by the real state of the introduction — in priority
  // order: picked (the discovery is scheduled) → stale offered slots → a
  // quiet-48h nudge → a fresh "awaiting their pick". A relationship with no
  // ceremony row (pre-arc, or a flag-off designer) falls straight through to
  // the byte-identical default below.
  if (row.engagement_kind === 'relationship') {
    if (ceremony) {
      if (ceremony.state === 'picked' && ceremony.pickedSlotStartsAt) {
        return {
          kind: 'discovery_scheduled',
          text: `Discovery · ${fmtDayTime(ceremony.pickedSlotStartsAt, ceremony.timezone)}`,
          href: `/doc/${row.engagement_id}#discovery`,
          ceremonyId: ceremony.id,
        };
      }
      // Chip texts are NAMELESS by ruling: the InMotionChip wrapper already
      // renders "{row.title} — {chip.text}", so R106 §4's example line
      // ("Elena Vasquez — intro sent, awaiting her pick") is achieved by the
      // wrapper + a name-free text. Pronoun-neutral ("their") — the ruling's
      // "her" was Elena-specific.
      if (ceremony.state === 'sent') {
        const slots = ceremony.offeredSlots ?? [];
        const allStale =
          slots.length > 0 &&
          slots.every((s) => new Date(s.starts_at).getTime() < now.getTime());
        if (allStale) {
          return {
            kind: 'slots_stale',
            text: 'offered times went by — offer fresh ones',
            href: `/doc/${row.engagement_id}#discovery`,
            ceremonyId: ceremony.id,
          };
        }
        const offeredAtMs = ceremony.offeredAt
          ? new Date(ceremony.offeredAt).getTime()
          : null;
        const quiet48h =
          offeredAtMs !== null && now.getTime() - offeredAtMs >= 48 * 3_600_000;
        if (quiet48h) {
          return {
            kind: 'intro_nudge',
            // Scene 04's exact register: "quiet 48h — nudge, or offer fresh
            // times". State carried, but an act exists again at 48h (R22).
            text: 'quiet 48h — nudge, or offer fresh times',
            href: ceremony.threadId
              ? `/people?thread=${ceremony.threadId}`
              : `/doc/${row.engagement_id}`,
            ceremonyId: ceremony.id,
          };
        }
        return {
          kind: 'intro_sent',
          text: 'intro sent, awaiting their pick',
          href: `/doc/${row.engagement_id}`,
          ceremonyId: ceremony.id,
        };
      }
    }
    return { kind: 'in_discovery', text: 'Schedule the discovery call' };
  }

  // R28/R22 drift tier: state carried, never a nag. Drift is an existing R22
  // chip and outranks a plain statement of position.
  if (conflict?.drift) return { kind: 'drift', text: conflict.drift };

  // R108: where the project actually stands, in the register its dates support.
  // Never a bare date on a band — an unanchored project says so.
  if (schedule && row.engagement_kind === 'project') {
    const position = schedule.positionText;
    if (schedule.fidelity === 'band') {
      if (position) return { kind: 'schedule_position', text: 'Band — no anchor yet' };
    } else if (position && schedule.activePhaseName) {
      return {
        kind: 'schedule_position',
        text: `${schedule.activePhaseName} · ${position}`,
      };
    }
  }

  if (row.in_flight_count > 0) {
    const n = row.in_flight_count;
    return {
      kind: 'in_flight',
      text: n === 1 ? '1 piece on the way' : `${n} pieces on the way`,
    };
  }

  return null;
}

function needSortKey(folder: DeskFolder): [number, number, number] {
  const { row, need } = folder;
  const date =
    need.kind === 'overdue_decision' && row.earliest_overdue_due
      ? new Date(row.earliest_overdue_due).getTime()
      : (need.kind === 'new_lead' || need.kind === 'reconnect_due') &&
          row.lead_response_deadline
        ? new Date(row.lead_response_deadline).getTime()
        : need.kind === 'hesitating_proposal' && row.proposal_sent_at
          ? new Date(row.proposal_sent_at).getTime()
          : need.kind === 'po_unsent' && row.oldest_draft_po_created_at
            ? new Date(row.oldest_draft_po_created_at).getTime()
            : need.kind === 'po_unacknowledged' && row.oldest_unacked_sent_at
              ? new Date(row.oldest_unacked_sent_at).getTime()
              : need.kind === 'task_due' && row.earliest_task_due
                ? new Date(row.earliest_task_due).getTime()
                : new Date(row.updated_at).getTime();
  // Ruling IV's third rendering needs no new tier: `overdue_decision` is the
  // only urgent need AND rank 0, so an overdue folio already sorts above every
  // other folio, and ties already break on `earliest_overdue_due` above. A
  // leading overdue tier was measurably inert here — and actively harmful when
  // `earliest_overdue_due` is null, since it demoted a real need below
  // non-overdue folios.
  return [need.urgent ? 0 : 1, NEED_RANK[need.kind], date];
}

/** Split rows into the needs-your-hand stack and the in-motion chips.
 *  `conflicts` (R28) maps project_id → Desk conflict inputs. `ceremoniesByLeadId`
 *  / `ceremoniesByDesignerClientId` (R106, the Arrival Arc) map a `match_ceremonies`
 *  row two ways: by lead_id for a Shape C lead's parked-card need, by
 *  designer_client_id for a Shape D relationship's in-motion chip — the same
 *  ceremony is looked up under whichever key matches the row's shape. */
export function partitionDesk(
  rows: DocumentStateRow[],
  now: Date,
  conflicts?: ReadonlyMap<string, DeskConflictInput>,
  receivables?: ReadonlyMap<string, ReceivableSignal>,
  flaggedLines?: ReadonlyMap<string, DeskFlaggedSignal>,
  ceremoniesByLeadId?: ReadonlyMap<string, DeskCeremonySignal>,
  ceremoniesByDesignerClientId?: ReadonlyMap<string, DeskCeremonySignal>,
  /** R108/R113 — per-project resolver output. `undefined` = the feed degraded;
   *  a project absent from a PRESENT map genuinely has no phases at all. */
  schedules?: ReadonlyMap<string, DeskScheduleInput>,
): { folders: DeskFolder[]; chips: MotionChip[]; composed: Record<string, true> } {
  const folders: DeskFolder[] = [];
  const chips: MotionChip[] = [];
  // Every engagement this composition actually put through deriveNeed. A reader
  // asking "does this document have a need?" can only be answered `no` for an
  // engagement that is in here; anything absent — archived rows, rows outside
  // this read's RLS scope, a stale composition — is unanswered, not need-free.
  //
  // A plain object, not a Set: React Query's replaceEqualDeep does not recurse
  // into Sets, so a Set here would make every 60s tick return a fresh result
  // object and re-render every consumer of this query portal-wide.
  const composed: Record<string, true> = {};

  for (const row of rows) {
    if (row.is_archived) continue;
    composed[row.engagement_id] = true;
    const conflict = row.project_id
      ? (conflicts?.get(row.project_id) ?? null)
      : null;
    const receivable = row.project_id
      ? (receivables?.get(row.project_id) ?? null)
      : null;
    // C4: flagged lines are keyed by proposal_id (a proposal engagement carries
    // proposal_id, project_id null).
    const flagged = row.proposal_id
      ? (flaggedLines?.get(row.proposal_id) ?? null)
      : null;
    // R106: a lead row's ceremony is found by lead_id; a relationship row's by
    // its own engagement_id (== designer_clients.id == designer_client_id).
    const ceremony =
      row.engagement_kind === 'lead' && row.lead_id
        ? (ceremoniesByLeadId?.get(row.lead_id) ?? null)
        : row.engagement_kind === 'relationship'
          ? (ceremoniesByDesignerClientId?.get(row.engagement_id) ?? null)
          : null;
    const schedule =
      schedules && row.project_id
        ? (schedules.get(row.project_id) ?? DESK_SCHEDULE_UNCONFIGURED)
        : null;
    const needs = deriveNeeds(row, now, conflict, receivable, flagged, ceremony, schedule);
    const need = needs[0] ?? null;
    if (need) {
      // Ruling IV: the overdue condition rides the folder so the sort, the
      // folio's need line, and the margin stamp all read one derivation.
      folders.push({
        row,
        need,
        needs,
        overdue:
          need.kind === 'overdue_decision'
            ? deriveOverdue(row.earliest_overdue_due, now)
            : NOT_OVERDUE,
      });
      continue;
    }
    const motion = deriveMotion(row, now, conflict, ceremony, schedule);
    if (motion)
      chips.push({
        row,
        kind: motion.kind,
        text: motion.text,
        href: motion.href,
        ceremonyId: motion.ceremonyId,
      });
  }

  folders.sort((a, b) => {
    const ka = needSortKey(a);
    const kb = needSortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
  });

  return { folders, chips: chips.slice(0, MAX_MOTION_CHIPS), composed };
}
