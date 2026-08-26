import {
  deriveNeed,
  type DocumentStateRow,
  type NeedKind,
  type NeedLine,
  type SectionKey,
} from './desk-derivation';
import type { CommercialDocumentKind, CommercialState } from './commercial-documents';
import type { SectionScheduleFacts } from './section-derivation';
import type { SendWallLine } from './proposal-watch-derivation';
import type { TicketRow } from './ticket-derivation';
import { deriveTicketLeader, leadTicketException } from './ticket-leader';
import {
  gateActionLabel,
  gateSentence,
  gateStageLabel,
  handoffAnchorId,
  type WorkflowGate,
} from './workflow-gate';

export type LegacyProposalLifecycle =
  | 'draft'
  | 'ready'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'revised';

const LEGACY_PROPOSAL_LIFECYCLES: readonly LegacyProposalLifecycle[] = [
  'draft', 'ready', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'revised',
];

export function asLegacyProposalLifecycle(value: unknown): LegacyProposalLifecycle | null {
  return LEGACY_PROPOSAL_LIFECYCLES.includes(value as LegacyProposalLifecycle)
    ? (value as LegacyProposalLifecycle)
    : null;
}

export interface DocumentGuideInputFact {
  label: string;
  owner: 'Designer' | 'Client' | 'Studio' | 'Project team';
  blocks: string;
  focusId?: string;
}

export type DocumentGuideState =
  | 'unavailable'
  | 'paused'
  | 'actionable'
  | 'needs_input'
  | 'waiting'
  | 'on_track';

export type DocumentGuideDestination =
  | { kind: 'href'; href: string }
  /** Re-read whatever source left guidance unavailable. It moves nowhere, so it
   *  must not borrow a section anchor's shape to say so. */
  | { kind: 'retry' }
  | { kind: 'anchor'; section: SectionKey; focusId?: string; activate?: boolean }
  | { kind: 'ledger'; name: string; context?: { page?: string; invoiceId?: string; projectId?: string } };

export interface DocumentGuideAction {
  key: string;
  label: string;
  destination: DocumentGuideDestination;
}

export interface DocumentGuideModel {
  state: DocumentGuideState;
  stage: SectionKey;
  eyebrow: string;
  headline: string;
  reason: string;
  action: DocumentGuideAction | null;
  topInput: DocumentGuideInputFact | null;
  remainingInputCount: number;
}

export interface ProposalGuideFacts {
  status: LegacyProposalLifecycle | null;
  documentKind: CommercialDocumentKind | null;
  commercialState: CommercialState | null;
  projectId: string | null;
  /** The send wall's own line (`deriveSendWallLine`). The proposal headline is
   *  a template over `sentText`, and SP-12 reads `verb` to print the wall's
   *  live act instead of a stand-in phrase. Absent = the wall has not answered,
   *  and the sentence falls back to its undated form. */
  sendWall?: SendWallLine | null;
}

interface DeriveDocumentGuideInput {
  row: DocumentStateRow;
  availability?: 'ready' | 'unavailable';
  retryAvailable?: boolean;
  now?: Date;
  operationalNeed?: NeedLine | null;
  proposal?: ProposalGuideFacts | null;
  /** The resolver's answer, as the section bars read it. The install headline
   *  is a template over `install.date`, spoken only in a register that carries
   *  a day (R107/R108) — absent, or band/frame, and the sentence stays undated. */
  schedule?: SectionScheduleFacts | null;
  inputFacts?: readonly DocumentGuideInputFact[];
  /** The nearest open gate on this project (Ruling V). `undefined` means the
   *  gate read has not answered; `null` means it answered that none is open. */
  gate?: WorkflowGate | null;
  /** A3-L7 — the care band's own closure gate (`closureReady`,
   *  closure-derivation.ts:275): every checklist item ticked AND the
   *  operational closeout readiness (contract balance collected, etc.)
   *  clear. `undefined` (the read has not answered) reads the same as
   *  `false` — the care rest state never claims a book is closed on an
   *  absent answer. */
  closureReady?: boolean;
  /** A3-L8 — has the read that feeds `inputFacts` for THIS stage answered yet?
   *  An empty `inputFacts` from a read still in flight is not the same fact as
   *  a read that answered "nothing outstanding", and only the second may rest.
   *  Omitted (the caller does not track it) reads as answered. */
  inputsPending?: boolean;
  /** B2-L3 — the eight ticket rows this spread prints, which the sixth rung
   *  elects its sentence from. Absent or `null` (a document whose spread does
   *  not derive a ticket yet, or a read that failed) falls back to the
   *  `stageCopy`/`restCopy` path below, so a spread without a map is guided
   *  exactly as it was. */
  ticketRows?: readonly TicketRow[] | null;
}

export const stageCopy: Record<SectionKey, Omit<DocumentGuideModel, 'stage' | 'topInput' | 'remainingInputCount'>> = {
  brief: {
    state: 'actionable',
    eyebrow: 'Brief · decide the fit',
    headline: 'Decide on this inquiry',
    reason: 'Choose whether to accept, nurture, or pass so the relationship has a clear next move.',
    action: { key: 'review-inquiry', label: 'Accept and begin', destination: { kind: 'anchor', section: 'brief' } },
  },
  discovery: {
    state: 'needs_input',
    eyebrow: 'Discovery · shape the brief',
    headline: 'Finish what you need to know',
    reason: 'Capture the essential scope, budget, timing, style, and lifestyle inputs before shaping direction.',
    action: { key: 'continue-discovery', label: 'Add scope & rooms', destination: { kind: 'anchor', section: 'discovery' } },
  },
  direction: {
    state: 'actionable',
    eyebrow: 'Direction · compose the offer',
    headline: 'Draw up the direction',
    reason: 'Turn the agreed discovery into scope, fees, terms, and a visual point of view.',
    action: { key: 'open-drafting-room', label: 'Open the Drafting Room', destination: { kind: 'anchor', section: 'direction' } },
  },
  // The proposal stage never reaches here for its headline or act — every
  // proposal document is answered by proposalGuide, which carries the ⌥ dated
  // sentence and SP-12's live act. This entry supplies the stage's eyebrow to
  // the paused and needs-attention branches, and its undated fallback.
  proposal: {
    state: 'waiting',
    eyebrow: 'Proposal · in the client’s hands',
    headline: 'Wait for the client’s signature',
    reason: 'Review its current state and use the existing proposal controls for the next client touch.',
    action: { key: 'review-proposal', label: 'Review signing controls', destination: { kind: 'anchor', section: 'proposal' } },
  },
  project: {
    state: 'on_track',
    eyebrow: 'Project · active work',
    headline: 'The work is in motion — nothing is waiting on you',
    reason: 'Start with the schedule and the active work that needs a decision, release, or follow-through.',
    action: { key: 'review-project-work', label: 'Open the FF&E schedule', destination: { kind: 'anchor', section: 'project' } },
  },
  install: {
    state: 'actionable',
    eyebrow: 'Install · finish in the field',
    headline: 'Complete the installation',
    reason: 'Work through arrivals, inspections, installation details, and closeout items in the schedule.',
    action: { key: 'review-installation', label: 'Check what\'s arriving', destination: { kind: 'anchor', section: 'install' } },
  },
  care: {
    state: 'actionable',
    eyebrow: 'Care · close the loop',
    headline: 'Close the book on this one',
    reason: 'Resolve the remaining care items, hand off the finished work, and close the book.',
    action: { key: 'review-closeout', label: 'Run the closeout checklist', destination: { kind: 'anchor', section: 'care' } },
  },
};

/**
 * A3-L7 (direction-b §3.3) — a named sentence and act for the quiet case,
 * so no stage shrugs even when nothing is wrong. `stageCopy` above already
 * covers `project`'s quiet case (`on_track`); this table covers the other
 * six, plus restates `project` and `install` for the one table `stage` reads
 * both from.
 *
 * `actionLabel: null` (`brief` only) means the rest state prints no act —
 * "Nothing to decide yet." asks for nothing. Every other row is a verb and
 * an object; `Review` — the word F18 retired from the top of the paper —
 * appears nowhere here.
 *
 * `install`'s headline is a placeholder: `installGuideHeadline` (below)
 * still supplies the real, dated sentence when the schedule facts carry a
 * committed or record-fidelity date, and `deriveDocumentGuide` only reaches
 * for this row's `headline` when that function returns `null` — so a
 * project without a known install day never states one.
 */
export const restCopy: Record<SectionKey, { headline: string; actionLabel: string | null }> = {
  brief: { headline: 'Nothing to decide yet.', actionLabel: null },
  discovery: { headline: 'Discovery is complete. Shape the direction.', actionLabel: 'Begin the direction' },
  direction: { headline: 'The direction is written. Send it.', actionLabel: 'Send the agreement' },
  proposal: { headline: 'Signed. Open the project.', actionLabel: 'Open the project' },
  project: { headline: 'Everything ordered is moving.', actionLabel: 'Release the next room' },
  install: { headline: 'Install day is {Weekday}, {Month d}.', actionLabel: 'Hold the window' },
  care: { headline: 'Everything is settled.', actionLabel: 'Close the book' },
};

/**
 * A3-L7's predicate: is this stage's base-fallback branch (no need, no gate,
 * not paused — `deriveDocumentGuide` has already ruled those out by the time
 * this runs) ALSO the quiet case for the stage itself, or is there still
 * something the stage's own default copy should name?
 *
 *   brief      — reaching here at all means no `new_lead` (or any other) need
 *                fired, so there is nothing left to decide. Always quiet.
 *   discovery  — quiet once every discovery input is answered; `inputFacts`
 *                (the checklist row-source) is the same list `withInputs`
 *                already reads, so an empty/absent list IS the "five things
 *                missing" list going to zero — but only once the read has
 *                ANSWERED (`inputsPending`), because a discovery query still
 *                in flight also yields an empty list, and a stage may not
 *                announce itself complete on a fact nobody has stated.
 *   direction  — quiet once the direction has a proposal drafted
 *                (`row.proposal_id`) AND every direction input is answered
 *                (the same `inputFacts` emptiness `discovery` reads): a
 *                proposal record existing while `phases & fees` is still
 *                outstanding is a draft in progress, not a written direction
 *                ready to send.
 *   project    — reaching here means no operational need fired. Always quiet.
 *   install    — reaching here means no operational need (a carrier window,
 *                a missing arrival) fired. Always quiet.
 *   care       — quiet only once the closure gate answers true; an unread or
 *                incomplete closure never claims the book is settled.
 */
export function isRestState(
  stage: SectionKey,
  row: DocumentStateRow,
  inputFacts: readonly DocumentGuideInputFact[] | undefined,
  closureReady: boolean | undefined,
  inputsPending = false,
): boolean {
  const inputsSettled = !inputsPending && (!inputFacts || inputFacts.length === 0);
  switch (stage) {
    case 'brief': return true;
    case 'discovery': return inputsSettled;
    case 'direction': return Boolean(row.proposal_id) && inputsSettled;
    case 'project': return true;
    case 'install': return true;
    case 'care': return closureReady === true;
    // 'proposal' never reaches this predicate — it is answered by
    // `proposalGuide` before the base fallback runs (see
    // `deriveDocumentGuide`). `restCopy.proposal` still carries the rest
    // sentence for direct testing and for a future wiring pass.
    case 'proposal': return false;
  }
}

/** `ffe-section.tsx` — the FF&E region heading, the project act's landing. */
const ffeRegionAnchorId = (projectId: string) => `ffe-region-heading-${projectId}`;

/** `ffe-section.tsx` — the movement column: the lines as they arrive, printed
 *  only on the install and care spreads. The install act's landing. */
const ffeMovementAnchorId = (projectId: string) => `ffe-movement-${projectId}`;

/** `care-band.tsx` — the closure checklist. The care act's landing. */
const CLOSING_THE_BOOK_ANCHOR_ID = 'closing-the-book';

/** `proposal-instruments.tsx` — the send wall's state line and its nudge. */
const SEND_WALL_ANCHOR_ID = 'proposal-send-wall';

/** `ffe-section.tsx` — one FF&E line's own row. */
const ffeLineAnchorId = (lineId: string) => `ffe-selection-${lineId}`;

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
];

const spell = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** Bare DATE columns must parse as LOCAL midnight, or the rendered day slips
 *  back a day in negative-offset timezones. */
const asLocalDate = (iso: string) =>
  new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);

const DAY_MS = 86_400_000;

/** Whole calendar days from `now` to `iso`, in the reader's own zone. */
function calendarDaysUntil(iso: string, now: Date): number | null {
  const then = asLocalDate(iso);
  if (Number.isNaN(then.getTime())) return null;
  const thenMidnight = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((thenMidnight - nowMidnight) / DAY_MS);
}

const fmtWeekdayDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    .format(asLocalDate(iso));

/**
 * ⌥ `Install is three weeks out — {Weekday}, {Month d}` (C-AP-10).
 *
 * `null` = the facts do not carry a day this sentence may state, and the caller
 * keeps the undated headline. Only the committed and record registers state a
 * day at all (R107/R108: a band never names one and a frame only approximates
 * one), and an install already behind us is no longer "out".
 */
function installGuideHeadline(
  schedule: SectionScheduleFacts | null | undefined,
  now: Date,
): string | null {
  const install = schedule?.install;
  if (!install?.date) return null;
  if (install.fidelity !== 'committed' && install.fidelity !== 'record') return null;
  const days = calendarDaysUntil(install.date, now);
  if (days === null || days < 0) return null;
  const when = fmtWeekdayDate(install.date);
  if (days === 0) return `Install is today — ${when}`;
  if (days === 1) return `Install is tomorrow — ${when}`;
  // Days up to a fortnight, then whole weeks. Rounding straight to weeks said
  // "one week out" at ten days, which the date beside it contradicted.
  if (days < 14) return `Install is ${spell(days)} days out — ${when}`;
  return `Install is ${spell(Math.round(days / 7))} weeks out — ${when}`;
}

const fmtShortDay = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
    .format(new Date(iso));

/**
 * ⌥ `Sent {Mon d} · not opened yet` (C-AP-10). The date is the row's own
 * `proposal_sent_at`, never the wall's prose: `sentText` is relative for its
 * first thirty days ("Sent 3 days ago") and reads `Issued on paper` for a
 * handover that generated no send at all — and nothing handed over on paper can
 * be reported as unopened, because no open event was ever possible.
 *
 * `null` = the wall has not answered, the row states no send date, or the
 * client HAS opened it; the caller then keeps the undated headline rather than
 * printing a claim the facts contradict.
 */
function proposalGuideHeadline(
  row: DocumentStateRow,
  sendWall: SendWallLine | null | undefined,
): string | null {
  if (!sendWall) return null;
  const opened =
    (row.proposal_open_count ?? 0) > 0 ||
    Boolean(row.proposal_last_opened_at) ||
    Boolean(row.proposal_viewed_at);
  if (opened) return null;
  if (!row.proposal_sent_at) return null;
  const sent = new Date(row.proposal_sent_at);
  if (Number.isNaN(sent.getTime())) return null;
  return `Sent ${fmtShortDay(row.proposal_sent_at)} · not opened yet`;
}

function withInputs(
  model: Omit<DocumentGuideModel, 'topInput' | 'remainingInputCount'>,
  inputFacts: readonly DocumentGuideInputFact[] | undefined,
): DocumentGuideModel {
  const firstInput = inputFacts?.[0] ?? null;
  // Only the needs-input branch derives its act from the missing input. Paused,
  // needs-attention, proposal-lifecycle, and stage-default branches each state
  // their own act, and an input fact must never displace it.
  const inputAction =
    firstInput?.focusId && model.state === 'needs_input'
      ? {
          key: 'open-missing-input',
          label: `Add ${firstInput.label}`,
          destination: {
            kind: 'anchor' as const,
            section: model.stage,
            focusId: firstInput.focusId,
            activate: true,
          },
        }
      : model.action;
  return {
    ...model,
    action: inputAction,
    topInput: firstInput,
    remainingInputCount: Math.max(0, (inputFacts?.length ?? 0) - 1),
  };
}

/**
 * Ruling V — the guide's sentence and its act both come from the nearest open
 * gate, keyed by the gate's canonical stage. The act names the gate's own
 * control in the margin; it neither invents a surface nor activates it, so the
 * guide can never toggle an item the designer already opened.
 */
function gateGuide(
  gate: WorkflowGate,
  row: DocumentStateRow,
): Omit<DocumentGuideModel, 'topInput' | 'remainingInputCount'> {
  const stage = row.active_section;
  const stageLabel = gateStageLabel(gate.canonicalStageKey);
  return {
    // A gate the studio can move reads as actionable; one whose next move
    // belongs to the other party reads as waiting. Neither carries a count.
    state: gate.act?.kind === 'nudge' ? 'waiting' : 'actionable',
    stage,
    eyebrow: stageLabel ? `${stageLabel} · gate` : `${stageCopy[stage].eyebrow} · gate`,
    headline: gateSentence(gate),
    reason: gate.provenance,
    action: {
      key: `gate-${gate.act?.kind ?? 'open'}`,
      label: gateActionLabel(gate),
      destination: {
        kind: 'anchor',
        section: stage,
        focusId: handoffAnchorId(gate.sourceId),
      },
    },
  };
}

/**
 * The kind's own verb — the act the paper prints for a need. Exhaustive over
 * `NeedKind`, so a new kind is a type error rather than a silent shrug.
 *
 * It is authoritative here, not a fallback: `NEED_ACTION_LABELS` (the folio
 * footer's own copy, non-null for seventeen of the nineteen kinds) leads six of
 * them with `Review`, which is the word F18 retired from the top of the paper.
 * The Desk's folio keeps that copy; the document states the verb and its object.
 */
function needVerb(kind: NeedKind): string {
  switch (kind) {
    case 'overdue_decision': return 'Chase the approval';
    case 'overdue_invoice': return 'Send reminder';
    case 'proposal_signed': return 'Open the project';
    case 'damage_claim': return 'File the claim';
    case 'proposal_declined': return 'Follow up';
    case 'proposal_expired': return 'Revise proposal';
    case 'lines_flagged': return 'Open the flagged lines';
    case 'new_lead': return 'Respond to the inquiry';
    case 'ceremony_pending': return 'Continue the introduction';
    case 'reconnect_due': return 'Reach out';
    case 'hesitating_proposal': return 'Follow up';
    case 'awaiting_inspection': return 'Inspect the delivery';
    case 'schedule_conflict': return 'Resolve the schedule';
    case 'schedule_proposal': return 'Open the proposed date';
    case 'task_due': return 'Open the task';
    case 'schedule_unconfigured': return 'Open the schedule';
    case 'po_unsent': return 'Send the purchase order';
    case 'po_unacknowledged': return 'Follow up with the maker';
    case 'pulse_due': return 'Send the pulse';
  }
}

/** The act a need points at — extracted so a region that prints needs itself
 *  can reach the same destination the guide strip would have offered. `stage`
 *  is the section an anchor destination lands in; `projectId` reaches the
 *  orders-ledger context and the FF&E region anchor; `lineId` is the FF&E line
 *  the need is about, where the caller knows it.
 *
 *  No production caller knows one yet: `NeedLine` (desk-derivation.ts:214–240)
 *  carries no line id, so C12's re-point lands on the FF&E REGION today, and the
 *  line-level landing arrives with the A3 field extension that gives a need its
 *  own subject. */
export function needGuideAction(
  need: NeedLine,
  stage: SectionKey,
  projectId?: string | null,
  lineId?: string | null,
): DocumentGuideAction {
  // C12 — a purchase order acts on the line it was raised for, so its act lands
  // on that body rather than on the Orders ledger it used to open. A claim has
  // no line to land on until one is carried, and keeps the receiving page.
  const lineAnchor: DocumentGuideDestination | null =
    lineId
      ? { kind: 'anchor', section: stage, focusId: ffeLineAnchorId(lineId) }
      : null;
  const ffeAnchor: DocumentGuideDestination | null =
    lineAnchor ??
    (projectId
      ? { kind: 'anchor', section: stage, focusId: ffeRegionAnchorId(projectId) }
      : null);
  const destination: DocumentGuideDestination = need.kind === 'reconnect_due'
    ? { kind: 'href', href: '/people?view=nurture' }
    : (need.kind === 'po_unsent' || need.kind === 'po_unacknowledged') && ffeAnchor
      ? ffeAnchor
    : (need.kind === 'damage_claim' || need.kind === 'awaiting_inspection') && lineAnchor
      ? lineAnchor
    : need.kind === 'damage_claim' || need.kind === 'awaiting_inspection'
      ? { kind: 'ledger', name: 'orders', context: { page: 'receiving', projectId: projectId ?? undefined } }
    : need.kind === 'po_unsent' || need.kind === 'po_unacknowledged'
      ? { kind: 'ledger', name: 'orders', context: { page: 'ledger', projectId: projectId ?? undefined } }
    : need.ledger
    ? { kind: 'ledger', name: need.ledger.name, context: need.ledger.context }
    : need.deepLink
      ? { kind: 'href', href: need.deepLink }
      : {
          kind: 'anchor',
          section: stage,
          focusId:
            need.kind === 'overdue_decision'
              ? 'document-decision-controls'
              : need.kind === 'task_due'
                ? 'document-task-controls'
                : need.kind === 'pulse_due'
                  ? 'document-pulse-control'
                  : undefined,
          activate: need.kind === 'pulse_due',
        };
  return {
    key: `resolve-${need.kind}`,
    label: needVerb(need.kind),
    destination,
  };
}

function proposalGuide(
  row: DocumentStateRow,
  proposal: ProposalGuideFacts | null | undefined,
): Omit<DocumentGuideModel, 'topInput' | 'remainingInputCount'> {
  const stage = row.active_section;
  const documentKind = proposal?.documentKind ?? 'legacy';
  const isCommercial = documentKind === 'design_services';
  const state = isCommercial ? proposal?.commercialState : proposal?.status ?? row.proposal_status;
  const controls: DocumentGuideAction = {
    key: 'review-signing-controls',
    label: 'Review signing controls',
    destination: { kind: 'anchor', section: 'proposal' },
  };

  if (state === 'draft') {
    return {
      state: 'actionable', stage, eyebrow: 'Proposal · in the studio',
      headline: isCommercial ? 'Finish the design agreement' : 'Finish the proposal',
      reason: 'Review the current draft and complete the client-facing terms before it leaves the studio.',
      action: row.proposal_id
        ? { key: 'open-drafting-room', label: 'Open Drafting Room', destination: { kind: 'href', href: `/drafting/${row.proposal_id}` } }
        : controls,
    };
  }
  if (state === 'client_signed') {
    return {
      state: 'actionable', stage, eyebrow: 'Proposal · client signed',
      headline: 'Countersign the design agreement',
      reason: 'Client consent is recorded. Use the agreement controls to add the studio signature and authorize the work.',
      action: { ...controls, key: 'review-countersign-controls', label: 'Review countersign controls' },
    };
  }
  if (state === 'executed') {
    return {
      state: 'actionable', stage, eyebrow: 'Proposal · executed',
      headline: proposal?.projectId ? 'Open the authorized project' : 'Review the executed agreement',
      reason: proposal?.projectId
        ? 'Both signatures are recorded and the project is ready for active work.'
        : 'Both signatures are recorded; review the execution controls for the authoritative project doorway.',
      action: proposal?.projectId
        ? { key: 'open-authorized-project', label: 'Open the project', destination: { kind: 'href', href: `/doc/${proposal.projectId}` } }
        : controls,
    };
  }
  if (state === 'accepted') {
    return {
      state: 'actionable', stage, eyebrow: 'Proposal · signed',
      headline: 'The client has signed',
      reason: 'Use the signed-proposal controls below to open or enter the project through the canonical activation action.',
      action: controls,
    };
  }
  if (state === 'declined' || state === 'expired' || state === 'superseded' || state === 'revised') {
    const outcome = state === 'revised' ? 'superseded' : state;
    return {
      state: 'actionable', stage, eyebrow: `Proposal · ${outcome}`,
      headline: outcome === 'expired' ? 'Follow up on the expired proposal' : 'Follow up on the proposal',
      reason: 'Review the recorded outcome and use the existing proposal controls for the next client conversation.',
      action: { key: 'review-proposal-follow-up', label: 'Review follow-up controls', destination: { kind: 'anchor', section: 'proposal' } },
    };
  }
  // SP-12 — the real act is the send wall's nudge, ~200px lower. When the wall
  // offers one, the strip prints that act instead of a stand-in phrase; where
  // no nudge exists, `Review signing controls` is still the only truthful act.
  const sendWall = proposal?.sendWall;
  return {
    state: 'waiting', stage, eyebrow: 'Proposal · with the client',
    headline: proposalGuideHeadline(row, sendWall) ?? 'Wait for the client’s signature',
    reason: 'The proposal is in the client’s hands. Review its activity and follow-up controls below.',
    action:
      sendWall?.verb === 'nudge'
        ? {
            key: 'nudge-client',
            // `client_name` is typed non-null but arrives empty on rows the
            // Desk's own derivation guards the same way; `Nudge ` is not an act.
            label: row.client_name.trim()
              ? `Nudge ${row.client_name.trim()}`
              : 'Nudge the client',
            destination: {
              kind: 'anchor',
              section: 'proposal',
              focusId: SEND_WALL_ANCHOR_ID,
            },
          }
        : controls,
  };
}

export function deriveDocumentGuide({
  row,
  availability = 'ready',
  retryAvailable = false,
  now = new Date(),
  proposal,
  schedule,
  operationalNeed,
  inputFacts,
  gate,
  closureReady,
  inputsPending = false,
  ticketRows,
}: DeriveDocumentGuideInput): DocumentGuideModel {
  const stage = row.active_section;
  if (availability === 'unavailable') {
    return withInputs({
      // SP-08 — the eyebrow names its own branch instead of borrowing `Next up`,
      // a label with exactly one, wrong, use.
      state: 'unavailable', stage, eyebrow: 'Guidance is unavailable', headline: 'Guidance is unavailable',
      // Only the retryable source gets the retry instruction. Telling a designer
      // to try again where no Try again exists is copy that cannot be obeyed.
      reason: retryAvailable
        ? 'Try again before acting so missing data is never mistaken for an empty section.'
        : 'Part of this document could not be read, so nothing is claimed here. Work from the sections below rather than reading this space as an empty one.',
      action: retryAvailable
        ? { key: 'retry-guidance', label: 'Try again', destination: { kind: 'retry' } }
        : null,
    }, undefined);
  }
  if (row.is_paused) {
    return withInputs({
      state: 'paused', stage, eyebrow: `${stageCopy[stage].eyebrow} · paused`, headline: 'This project is paused',
      reason: 'Review the project status before resuming lifecycle work.',
      action: {
        key: 'review-paused-project',
        label: 'Review project status',
        destination: { kind: 'anchor', section: stage, focusId: 'document-project-status' },
      },
    }, inputFacts);
  }

  // The gate outranks the operational signals: an open gate IS the project's
  // current state, and nothing else gets to decide what the strip says.
  //
  // Both absent sentinels fall through to the same place. Unlike the Desk's
  // operational need — where `null` means "answered: no need" and suppresses a
  // local re-derivation — a gate has no local derivation to suppress: the strip
  // has nothing to say ABOUT a gate that the row alone could tell it. So
  // `undefined` (not yet answered) and `null` (answered, none open) are read
  // alike here, and the input keeps both spellings only to stay legible
  // alongside `operationalNeed`.
  if (gate) {
    return withInputs(gateGuide(gate, row), inputFacts);
  }

  const need = operationalNeed === undefined ? deriveNeed(row, now) : operationalNeed;
  const proposalLifecycleNeed =
    need?.kind === 'proposal_signed' ||
    need?.kind === 'proposal_declined' ||
    need?.kind === 'proposal_expired' ||
    (proposal?.documentKind === 'design_services' &&
      proposal.commercialState !== 'sent' &&
      need?.kind === 'hesitating_proposal');
  if (need && !proposalLifecycleNeed) {
    return withInputs({
      state: 'actionable', stage, eyebrow: `${stageCopy[stage].eyebrow} · needs attention`,
      headline: need.text,
      reason: 'Something on this job needs a decision.',
      action: needGuideAction(need, row.active_section, row.project_id),
    }, inputFacts);
  }

  if (stage === 'proposal') {
    const guide = proposalGuide(row, proposal);
    return withInputs(guide, inputFacts);
  }

  const base = stageCopy[stage];
  // Each act lands on the body it names: the drafting room, the FF&E heading
  // the project sentence points at, the movement column the install spread
  // prints its arrivals in, and the closure checklist care is about. Where a
  // spread does not mount the body (the care spread prints the settled Care
  // section, not the band), `jumpToSection` still lands on the section.
  const ffeAnchor: DocumentGuideDestination | null =
    row.project_id
      ? { kind: 'anchor', section: stage, focusId: ffeRegionAnchorId(row.project_id) }
      : null;
  const movementAnchor: DocumentGuideDestination | null =
    row.project_id
      ? { kind: 'anchor', section: stage, focusId: ffeMovementAnchorId(row.project_id) }
      : null;
  const destination: DocumentGuideDestination | null =
    stage === 'direction' && row.proposal_id
      ? { kind: 'href', href: `/drafting/${row.proposal_id}` }
      : stage === 'project' && ffeAnchor
        ? ffeAnchor
      : stage === 'install' && movementAnchor
        ? movementAnchor
      : stage === 'care'
        ? { kind: 'anchor', section: stage, focusId: CLOSING_THE_BOOK_ANCHOR_ID }
        : null;
  const action = destination ? { ...base.action!, destination } : base.action;
  const installHeadline = stage === 'install' ? installGuideHeadline(schedule, now) : null;

  // B2-L3 — with the ticket on the spread, the sixth rung stops reading a
  // table keyed by the stage alone and names the exception the map is already
  // printing, in direction-b §3.2's order. Only the leader's exception-led
  // sentence is taken here: its rest sentence is the same `restCopy` row the
  // branch below prints, and that branch also holds the facts the leader is
  // not passed — the closure gate, the discovery inputs, the day the install
  // sentence states.
  const lead = ticketRows ? leadTicketException(ticketRows) : null;
  if (ticketRows && lead) {
    const leader = deriveTicketLeader(ticketRows, stage);
    return withInputs({
      ...base,
      stage,
      // The stage's own `state`/`reason`/`eyebrow` are the CALM register, and
      // the sentence this branch prints is an exception the map is standing on.
      // Rung 4 says the same thing the same way for the Desk's operational
      // need; a strip cannot carry `Money · $17,500 owed you` in the voice it
      // uses for `Everything ordered is moving.`
      state: 'actionable',
      eyebrow: `${base.eyebrow} · needs attention`,
      reason: 'The job ticket is showing something unresolved.',
      headline: leader.headline,
      action: leader.action
        ? { ...leader.action, destination: destination ?? leader.action.destination }
        : null,
    }, inputFacts);
  }

  // A3-L7 (direction-b §3.3) — the quiet case gets its own named sentence
  // and act rather than reusing the always-actionable default above.
  // `install` is the one stage whose rest sentence itself carries a fact (the
  // date): it is only "at rest" once that fact is known, so it reads
  // `installHeadline` — the same ⌥ template `installGuideHeadline` builds for
  // the non-rest branch — rather than the literal placeholder in `restCopy`.
  const restActive =
    stage === 'install'
      ? installHeadline !== null
      : isRestState(stage, row, inputFacts, closureReady, inputsPending);
  if (restActive) {
    const rest = restCopy[stage];
    // The leader's other seven states. With no row unclear it returns this
    // stage's `restCopy` row, so routing the rest half through it too is what
    // makes "fourteen states, all derived from the ticket" true of the wired
    // path rather than only of the module's own tests. The two facts the leader
    // is not passed stay this branch's: `install`'s dated sentence, and the
    // landing each stage's working act already resolved.
    const leader = ticketRows ? deriveTicketLeader(ticketRows, stage) : null;
    // A rest state changes what the strip SAYS, and its act keeps the working
    // landing — with one exception: `discovery`'s rest act names the DIRECTION,
    // and landing `Begin the direction` back on the discovery checklist it has
    // just called complete would point a verb at the wrong object (C20). It
    // takes the landing the `direction` stage's own act uses.
    const restDestination: DocumentGuideDestination =
      stage === 'discovery'
        ? stageCopy.direction.action!.destination
        : (action?.destination ?? stageCopy[stage].action!.destination);
    const restAction: DocumentGuideAction | null = leader
      ? leader.action
        ? { ...leader.action, destination: restDestination }
        : null
      : rest.actionLabel === null
        ? null
        : {
            key: `rest-${stage}`,
            label: rest.actionLabel,
            destination: restDestination,
          };
    return withInputs({
      ...base,
      stage,
      headline:
        stage === 'install'
          ? installHeadline!
          : (leader?.headline ?? rest.headline),
      action: restAction,
    }, inputFacts);
  }

  return withInputs({
    ...base,
    stage,
    headline: stage === 'install' ? installHeadline ?? base.headline : base.headline,
    action,
  }, inputFacts);
}
