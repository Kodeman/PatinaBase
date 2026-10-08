/**
 * One name per act — rulings D1 and D3 (US-19, `delivery/rulings.md`).
 *
 * The act's name is the label of the control it lands on, verbatim, on every
 * surface that prints it: band, Desk card, ⌘K, region head, dock. This module
 * is the one table those five read. It is pure data and isomorphic: no React,
 * no DOM, no network.
 *
 * Tiers here are the act's tier at rest (D3). `held` is a runtime state (the
 * act is offered but this person cannot take it now), never a table entry, and
 * promotion of a plain act to scored because it is Next is the caller's.
 */

import type { NeedKind, SectionKey } from './desk-derivation';

// ── Stage words (D1, Q1, Q4) ─────────────────────────────────────────────────

/** The seven document words, in order. The only stage words a studio surface
 *  prints; the eleven workflow names stay data. */
export const STAGE_WORDS = [
  'Brief',
  'Discovery',
  'Direction',
  'Proposal',
  'Project',
  'Install',
  'Care',
] as const;

export type StageWord = (typeof STAGE_WORDS)[number];

/** The paper's section id → its stage word. */
export const STAGE_WORD: Record<SectionKey, StageWord> = {
  brief: 'Brief',
  discovery: 'Discovery',
  direction: 'Direction',
  proposal: 'Proposal',
  project: 'Project',
  install: 'Install',
  care: 'Care',
};

/**
 * Band line 1's eyebrow, as data: `{ stage, detail }` prints as
 * `STAGE · detail`, with caps applied in CSS.
 *
 * - normally `{ stage: 'Project', detail: 'Chen Residence' }`
 * - held (`on_hold`, no date: the record carries none) `{ stage, detail: 'On hold' }`
 * - archived (FR1 R9, in the held form, no date) `{ stage, detail: 'Archived' }`
 * - closed (`completed`) `{ stage: 'Care', detail: 'Closed' }`
 */
export interface StageEyebrow {
  stage: StageWord;
  detail: string;
}

export function stageEyebrow(
  stage: SectionKey,
  projectStatus: string | null,
  name: string,
): StageEyebrow {
  if (projectStatus === 'completed') return { stage: 'Care', detail: 'Closed' };
  if (projectStatus === 'on_hold') return { stage: STAGE_WORD[stage], detail: 'On hold' };
  if (projectStatus === 'archived') return { stage: STAGE_WORD[stage], detail: 'Archived' };
  return { stage: STAGE_WORD[stage], detail: name };
}

// ── Tiers (D3) ───────────────────────────────────────────────────────────────

export type ActTier = 'filled' | 'scored' | 'plain';

/**
 * Every act string this module prints, with its D3 tier. Templated acts are
 * keyed by their template (`{…}` marks the slot).
 *
 * Filled: money moves or is recorded as moved, or a paper is signed or sent
 * for signature. Scored: the stage's own act and the four named acts. Plain:
 * everything else.
 */
export const ACT_TIER: Readonly<Record<string, ActTier>> = {
  // Filled
  'Record the payment': 'filled',
  'Release for authorization': 'filled',
  'Send the proposal': 'filled',
  'Send the invoice': 'filled',
  // FR2 P-1 — the filled set is D3's four, worn by the landing control only.
  // These two print only as pointers (band, Desk, ⌘K), and a pointer is
  // scored; FR1 R4/R7's fill belongs to the control each lands on.
  'Send the purchase order': 'scored',
  'Pay again': 'scored',

  // Scored — the four named acts
  'Record a change': 'scored',
  'Ask the maker for a date': 'scored',
  'Open the order': 'scored',
  'File the claim': 'scored',
  // Scored — the stages' own acts (D1), leading their region heads
  'Respond to the inquiry': 'scored',
  'Add the {essential}': 'scored',
  'Write the proposal': 'scored',
  'Nudge {first name}': 'scored',
  'Open the project': 'scored',
  'Spec the {N} unspecified': 'scored',
  'Open the pieces': 'scored',
  'Hold a window': 'scored',
  'Open the punch list': 'scored',
  'Run the closeout checklist': 'scored',

  // Plain — D3's list
  'Set dates': 'plain',
  'Set a budget band': 'plain',
  "Preview the client's copy": 'plain',
  Sharing: 'plain',
  'Call sheet': 'plain',
  Fold: 'plain',
  'Open the record': 'plain',
  'Draw an invoice': 'plain',
  // Plain — Message and its repair (FR1 R6: a reconnect is a Message, plain)
  'Message {first name}': 'plain',
  'Link a client': 'plain',
  // Plain — the need acts D3 does not raise
  'Send reminder': 'plain',
  'Notify the vendor': 'plain',
  'Follow up': 'plain',
  'Revise proposal': 'plain',
  'Open the flagged lines': 'plain',
  'Continue the introduction': 'plain',
  'Inspect the delivery': 'plain',
  'Resolve the schedule': 'plain',
  'Open the proposed date': 'plain',
  'Open the task': 'plain',
  'Open the schedule': 'plain',
  'Follow up with the maker': 'plain',
  'Send the pulse': 'plain',
  'Answer the vendor': 'plain',
  'Reconfirm the price': 'plain',
  // FR1 R7 — plain at rest, scored only while it is Next; never filled.
  'Approve the CFA': 'plain',
  'Mark returned': 'plain',
  'Choose a path': 'plain',
  'Return it or keep it': 'plain',
};

// ── Named acts (D1) ──────────────────────────────────────────────────────────

/** D1's named acts, as they print. Message's label is templated: use
 *  `messageLabel`. */
export const NAMED_ACTS = {
  recordChange: 'Record a change',
  askMakerForDate: 'Ask the maker for a date',
  openOrder: 'Open the order',
  message: 'Message {first name}',
  fileClaim: 'File the claim',
  recordPayment: 'Record the payment',
  punch: 'Open the punch list',
  preview: "Preview the client's copy",
} as const;

/**
 * D1's "Never" column. `exact` labels may never print as an act; `prefix`
 * labels may never start one. ("Message the client" while no client is linked
 * is a state rule, not a string: see `MESSAGE_WITHHELD`.)
 */
export const FORBIDDEN_ACT_LABELS = {
  exact: [
    'Amendment',
    'Change order',
    'Add a change',
    'Open PO',
    'Review the claim',
    'Record',
    'Punch',
    'Preview',
  ],
  prefix: ['Chase'],
} as const;

/** FR2 499-9 / 506-6 — the act a held draft lands on: its review, where Send
 *  and Discard live. The Desk and the install row print it. */
export const OPEN_THE_HELD_DRAFT = 'Open the held draft';

/** `Message Chen`, or `Message the client` with no first name. */
export function messageLabel(firstName: string | null): string {
  const first = firstName?.trim();
  return first ? `Message ${first}` : 'Message the client';
}

/** Message offered while no client is linked: the reason prints beneath it,
 *  the repair act beside it (D1, D3, D7). */
export const MESSAGE_WITHHELD = {
  reason: 'Link a client first.',
  repair: 'Link a client',
} as const;

// ── The stage's own act (D1) ─────────────────────────────────────────────────

/**
 * Stable ids for the controls the own acts land on. Slice 2 attaches these to
 * the real controls so a press lands with focus there (L-10).
 */
export const ACT_TARGET_IDS = {
  inquiryReply: 'document-act-inquiry-reply',
  essentialProjectType: 'document-act-essential-project-type',
  essentialRooms: 'document-act-essential-rooms',
  essentialScope: 'document-act-essential-scope',
  essentialBudgetBand: 'document-act-essential-budget-band',
  contractRoomDoor: 'document-act-contract-room',
  proposalSend: 'document-act-proposal-send',
  proposalNudge: 'document-act-proposal-nudge',
  projectPaper: 'document-act-project-paper',
  piecesHead: 'document-act-pieces-head',
  installReading: 'document-act-install-reading',
  installWindow: 'document-act-install-window',
  punchList: 'document-act-punch-list',
  closeoutChecklist: 'document-act-closeout-checklist',
} as const;

export type ActTargetId = (typeof ACT_TARGET_IDS)[keyof typeof ACT_TARGET_IDS];

/** The four Discovery essentials, in the order the paper asks for them. */
export type DiscoveryEssential = 'project_type' | 'rooms' | 'scope' | 'budget_band';

const ESSENTIAL: Record<DiscoveryEssential, { noun: string; targetId: ActTargetId }> = {
  project_type: { noun: 'project type', targetId: ACT_TARGET_IDS.essentialProjectType },
  rooms: { noun: 'rooms', targetId: ACT_TARGET_IDS.essentialRooms },
  scope: { noun: 'scope', targetId: ACT_TARGET_IDS.essentialScope },
  budget_band: { noun: 'budget band', targetId: ACT_TARGET_IDS.essentialBudgetBand },
};

/**
 * D6's install reading, by state: a piece not here with no arrival date, with
 * its arrival date passed, with it ahead; or everything here.
 */
export type InstallReadingState =
  | 'not_here_undated'
  | 'not_here_past'
  | 'not_here_ahead'
  | 'all_here';

/** The least the D1 own-act table reads. Each field is read only at its stage. */
export interface OwnActFacts {
  /** Brief: an inquiry is open and unanswered. */
  inquiryOpen: boolean;
  /** Discovery: the first essential still missing, or null when all are set. */
  firstMissingEssential: DiscoveryEssential | null;
  /** Proposal: where the proposal stands. */
  proposalState: 'draft' | 'sent' | 'accepted' | null;
  /** The client's first name, already through the placeholder guard; null
   *  when there is no usable name. */
  clientFirstName: string | null;
  /** Project: FF&E lines not yet specified. */
  unspecifiedCount: number;
  /** Project: lines are eligible to release for authorization. */
  releaseEligible: boolean;
  /** Install: the reading's state, and whether a window is already held. */
  install: { state: InstallReadingState; windowHeld: boolean } | null;
}

export interface OwnAct {
  label: string;
  targetId: ActTargetId;
  tier: ActTier;
}

const act = (label: string, targetId: ActTargetId, tierKey = label): OwnAct => ({
  label,
  targetId,
  tier: ACT_TIER[tierKey],
});

/**
 * The stage's own act (D1): the act that always leads its region head. null
 * where the table gives no act: an install piece arriving with a window
 * already held (D6: silence), and FR1 R8's silences — Brief with no open
 * inquiry, Discovery with every essential set, Proposal declined or expired
 * (or none), and Install with no reading. The band's Next then falls to the
 * top standing row by D2's order.
 */
export function ownAct(stage: SectionKey, facts: OwnActFacts): OwnAct | null {
  switch (stage) {
    case 'brief':
      return facts.inquiryOpen
        ? act('Respond to the inquiry', ACT_TARGET_IDS.inquiryReply)
        : null;
    case 'discovery': {
      const missing = facts.firstMissingEssential;
      if (!missing) return null;
      const { noun, targetId } = ESSENTIAL[missing];
      return act(`Add the ${noun}`, targetId, 'Add the {essential}');
    }
    case 'direction':
      return act('Write the proposal', ACT_TARGET_IDS.contractRoomDoor);
    case 'proposal': {
      switch (facts.proposalState) {
        case 'draft':
          return act('Send the proposal', ACT_TARGET_IDS.proposalSend);
        case 'sent': {
          const first = facts.clientFirstName?.trim();
          return act(
            first ? `Nudge ${first}` : 'Nudge the client',
            ACT_TARGET_IDS.proposalNudge,
            'Nudge {first name}',
          );
        }
        case 'accepted':
          return act('Open the project', ACT_TARGET_IDS.projectPaper);
        default:
          return null;
      }
    }
    case 'project':
      if (facts.unspecifiedCount > 0) {
        return act(
          `Spec the ${facts.unspecifiedCount} unspecified`,
          ACT_TARGET_IDS.piecesHead,
          'Spec the {N} unspecified',
        );
      }
      if (facts.releaseEligible) {
        return act('Release for authorization', ACT_TARGET_IDS.piecesHead);
      }
      return act('Open the pieces', ACT_TARGET_IDS.piecesHead);
    case 'install': {
      const reading = facts.install;
      if (!reading) return null;
      switch (reading.state) {
        case 'not_here_undated':
        case 'not_here_past':
          return act('Ask the maker for a date', ACT_TARGET_IDS.installReading);
        case 'not_here_ahead':
          return reading.windowHeld
            ? null
            : act('Hold a window', ACT_TARGET_IDS.installWindow);
        case 'all_here':
          return act('Open the punch list', ACT_TARGET_IDS.punchList);
      }
    }
    case 'care':
      return act('Run the closeout checklist', ACT_TARGET_IDS.closeoutChecklist);
  }
}

// ── A need's act (D1 "Rule of names") ────────────────────────────────────────

/**
 * The one name for each need's act, replacing both `document-guide.ts`
 * `needVerb` and `desk-derivation.ts` `NEED_ACTION_LABELS` behind `one-voice`.
 *
 * D1's named and own acts win over either source (`damage_claim`,
 * `payment_due`, `new_lead`). Where the sources agree, their string stands.
 * Where they disagreed, FR1 (`delivery/design-review-1.md` §1) ruled:
 * R1 `overdue_decision` · R2 `lines_flagged` · R3 `schedule_proposal` ·
 * R4 `po_unsent` · R5 `pulse_due` · R6 `reconnect_due`. Templated labels carry
 * `{first name}`; print them through `needActLabel`.
 */
export const NEED_ACT_LABELS: Record<NeedKind, string> = {
  overdue_decision: 'Nudge {first name}',
  overdue_invoice: 'Send reminder',
  proposal_signed: 'Open the project',
  claim_window: 'Notify the vendor',
  damage_claim: 'File the claim',
  proposal_declined: 'Follow up',
  proposal_expired: 'Revise proposal',
  lines_flagged: 'Open the flagged lines',
  new_lead: 'Respond to the inquiry',
  ceremony_pending: 'Continue the introduction',
  reconnect_due: 'Message {first name}',
  hesitating_proposal: 'Follow up',
  awaiting_inspection: 'Inspect the delivery',
  schedule_conflict: 'Resolve the schedule',
  schedule_proposal: 'Open the proposed date',
  task_due: 'Open the task',
  schedule_unconfigured: 'Open the schedule',
  po_unsent: 'Send the purchase order',
  po_unacknowledged: 'Follow up with the maker',
  pulse_due: 'Send the pulse',
  payment_due: 'Record the payment',
  payment_failed: 'Pay again',
  ack_discrepancy: 'Answer the vendor',
  quote_expiring: 'Reconfirm the price',
  cfa_pending: 'Approve the CFA',
  memo_return: 'Mark returned',
  exception_open: 'Choose a path',
  return_by: 'Return it or keep it',
};

/**
 * The need's act as it prints. `firstName` fills `{first name}` (R1 `Nudge`,
 * R6 `Message`) and must already be through the placeholder guard; with none,
 * the act names `the client`.
 */
export function needActLabel(kind: NeedKind, firstName: string | null = null): string {
  const first = firstName?.trim();
  return NEED_ACT_LABELS[kind].replace('{first name}', first || 'the client');
}
