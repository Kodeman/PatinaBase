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
import { familyLabel } from './family-label';

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
  'Fill the {N} placeholders': 'scored',
  'Open the pieces': 'scored',
  'Hold a window': 'scored',
  // FR6 F6-10 — the held `Ask the maker for a date`'s repair, as the act.
  'Add the maker': 'scored',
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
  'Invite {first name}': 'plain',
  // Plain — the need acts D3 does not raise
  'Send reminder': 'plain',
  'Notify the maker': 'plain',
  // FR6 F6-1b — the proposal's reminder email, named for what it does.
  'Send a reminder': 'plain',
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
  'Answer the maker': 'plain',
  'Reconfirm the price': 'plain',
  // FR1 R7 — plain at rest, scored only while it is Next; never filled.
  'Approve the CFA': 'plain',
  'Mark returned': 'plain',
  'Choose a path': 'plain',
  'Return it or keep it': 'plain',
  // FR8 F8-4 (§3-15) — the studio's countersign, D2 applied to a control the
  // paper already mounts; its button prints this name verbatim.
  'Countersign agreement': 'plain',
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
  countersign: 'Countersign agreement',
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

/** FR6 F6-1 (D1-b, D1-c) — the proposal watch's reminder email. Never a
 *  `Nudge`: the Message composer is the paper's one `Nudge {first}`. */
export const SEND_A_REMINDER = 'Send a reminder';

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

/** The control a no-login household's repair lands on (FR4 524-a): an invite,
 *  the First Letter (`client-invite-letter`), the lapsed letter's `Write again`
 *  (FR5 529-3), or none the paper can mount. */
export type NoLoginRepair = 'invite' | 'write' | 'write-again' | null;

/** FR3 F3-6 (516-3 / 518-2) — Message held for a LINKED household with no
 *  login: the blocking condition is the login, not the link. `Invite Elena`,
 *  or the family fallback `Invite the client`. FR4 524-b — an article-led
 *  household keeps its article and takes the plural verb: `The Ashfords have
 *  no login yet.` 524-a — the repair's label follows its control (`Write to
 *  …` for the letter), and with no control there is no repair. FR5 529-3 — a
 *  lapsed letter's control is the row's own `Write again`. 529-4 — a conjoined
 *  household (`Sam & Alex`, `Sam and Alex`) is plural too. */
export function messageNoLogin(
  firstName: string | null,
  control: NoLoginRepair = 'invite',
): {
  reason: string;
  repair: string | null;
} {
  const first = firstName?.trim() || null;
  const who = first ?? 'the client';
  const plural = first !== null && (/^the\s/i.test(first) || /\S\s+(?:&|and)\s+\S/i.test(first));
  const verb = plural ? 'have' : 'has';
  return {
    reason: `${who.charAt(0).toUpperCase()}${who.slice(1)} ${verb} no login yet.`,
    repair:
      control === 'invite'
        ? `Invite ${who}`
        : control === 'write'
          ? `Write to ${who}`
          : control === 'write-again'
            ? 'Write again'
            : null,
  };
}

/** FR3 F3-13 — the household's display name without the seed's trailing
 *  ` (no-login household)`; the no-login fact is held Message's reason.
 *  FR6 F6-7 (D14) — `''` where there is no household to name (none, the
 *  seed's `Client User`, or any value the placeholder guard reads as `the
 *  client`): a client-less paper prints no name. `the client` stays the
 *  sentence fallback (`messageLabel`, `messageNoLogin`), never a name. */
export function householdDisplayName(name: string | null | undefined): string {
  const shown = (name ?? '').replace(/\s*\(no-login household\)\s*$/i, '');
  return familyLabel(shown) === 'the client' ? '' : shown;
}

// ── Where a Next act lands (US-19 F3-2, P-2) ─────────────────────────────────

/**
 * The window events a Next act's press dispatches so the region that owns the
 * act lands it on its own control. Each is cancelable: the owner cancels it
 * when it took the act, and the press keeps its old landing when nobody did.
 * - `askTheMaker` — the Install row opens its sheet on the first field.
 * - `ffeAct` (detail `FfeActLandingDetail`) — Pieces lands on its own control.
 * - `composeMessage` (detail `{ named: string[]; act?: string }`) — the
 *   letterhead's Message composer opens, naming what is overdue; `act` is the
 *   pressed act's name, printed as the composer's eyebrow (FR6 F6-1).
 */
export const ACT_LANDING_EVENTS = {
  askTheMaker: 'document:ask-the-maker',
  ffeAct: 'document:land-ffe-act',
  composeMessage: 'document:compose-message',
} as const;

/**
 * `ACT_LANDING_EVENTS.ffeAct`'s detail — the Pieces control an act lands on
 * (F3-2, FR4 Fixes 3, 4, 6, 8). `claim`: the damaged line's claim act, or the
 * Receiving claim card's at PO grain. `follow-up`: the maker composer for the
 * oldest unanswered PO. `send`: the drafted PO's send act. `spec`: the first
 * placeholder line's spec act. `open`: the first line's unfold control.
 * `release`: the Pieces head's own `Release for authorization` entry, held or
 * not (FR5 F5-1).
 */
export type FfeActLanding = 'claim' | 'follow-up' | 'send' | 'spec' | 'open' | 'release';

/**
 * FR9 F9-1 — the event's detail: a landing alone (Pieces picks the line by its
 * own rule), or a landing on a named line (`itemId`), as a per-PO silence's
 * `Follow up with the maker` lands on its own PO's line.
 */
export type FfeActLandingDetail = FfeActLanding | { act: FfeActLanding; itemId: string };

/**
 * US-21 T-3 — the count of lines with no product yet, as every surface prints
 * it (ticket, region head, band, letterhead strip). The band parses it back
 * (`lens-band-derivation.ts`), so the word lives here once.
 */
export function placeholderCount(n: number): string {
  return `${n} ${n === 1 ? 'placeholder' : 'placeholders'}`;
}

/** The Pieces own act and the band row's act for those lines. */
function fillThePlaceholders(n: number): string {
  return `Fill the ${placeholderCount(n)}`;
}

const FILL_THE_PLACEHOLDERS = /^Fill the \d+ placeholders?$/;

/**
 * FR4 522-3 — the Pieces landing an act's printed name asks for, so a
 * Standing-sheet row lands where its name says. Null where Pieces owns no
 * control for the act.
 */
export function ffeActLandingOf(label: string): FfeActLanding | null {
  if (label === NAMED_ACTS.fileClaim) return 'claim';
  if (label === NEED_ACT_LABELS.po_unacknowledged) return 'follow-up';
  if (label === NEED_ACT_LABELS.po_unsent) return 'send';
  if (label === 'Open the pieces') return 'open';
  if (label === 'Release for authorization') return 'release';
  return FILL_THE_PLACEHOLDERS.test(label) ? 'spec' : null;
}

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
  proposalReminder: 'document-act-proposal-reminder',
  countersign: 'document-act-countersign',
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
  /** Proposal: the letterhead's Message composer can open (its `canSendNote`).
   *  False reroutes a sent proposal's act to the reminder (FR6 F6-1); unset
   *  reads as reachable. */
  clientMessageable?: boolean;
  /** Proposal, sent: past the hesitation threshold (the Desk prints its
   *  reason line, `sentProposalReasonLine`). False is inside it, where a sent
   *  proposal has no act (FR7 F7-2, R22); unset reads as hesitating. */
  proposalHesitating?: boolean;
  /** Proposal, sent, Message held: the send wall offers the reminder
   *  (`deriveSendWallLine(...).verb === 'nudge'`). False — inside its cooldown,
   *  countersign pending, issued on paper — is no act (FR7 F7-3, D2); unset
   *  reads as available. */
  reminderAvailable?: boolean;
  /** Proposal, sent: the client has signed and the studio's countersign form
   *  is on the paper (`SentProposalVoice.countersignPending`). True makes
   *  `Countersign agreement` the act, ahead of hesitation and Message (FR8
   *  F8-4, D2); unset reads as not pending. */
  countersignPending?: boolean;
  /** Project: FF&E lines not yet specified. */
  unspecifiedCount: number;
  /** Project: lines are eligible to release for authorization. */
  releaseEligible: boolean;
  /** Install: the reading's state, and whether a window is already held.
   *  FR6 F6-10 — `makerRecorded` (the reading's `makerRecorded`, R42's
   *  `lineMaker`): false, `Ask the maker for a date` is held and its repair,
   *  `Add the maker`, is the act. Absent reads as recorded, which is how the
   *  region head's own reading keeps leading with the held act. */
  install: { state: InstallReadingState; windowHeld: boolean; makerRecorded?: boolean } | null;
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
 * (or none), and Install with no reading — and FR7's: a sent proposal inside
 * the hesitation threshold, or held to a reminder that cannot be sent. The
 * band's Next then falls to the top standing row by D2's order.
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
          // FR8 F8-4 — the client has signed: the countersign waits on the
          // studio, not on her, whatever the hesitation or Message say.
          if (facts.countersignPending) {
            return act(NAMED_ACTS.countersign, ACT_TARGET_IDS.countersign);
          }
          // FR7 F7-2 — inside the hesitation threshold her only act is waiting.
          if (facts.proposalHesitating === false) return null;
          // D1-a — held Message: the act follows the control that can reach her.
          if (facts.clientMessageable === false) {
            // FR7 F7-3 — a reminder that cannot be sent is not an act.
            if (facts.reminderAvailable === false) return null;
            return act(SEND_A_REMINDER, ACT_TARGET_IDS.proposalReminder);
          }
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
          fillThePlaceholders(facts.unspecifiedCount),
          ACT_TARGET_IDS.piecesHead,
          'Fill the {N} placeholders',
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
          // FR6 F6-10 (D20) — held for no maker: its repair is the act.
          return reading.makerRecorded === false
            ? act('Add the maker', ACT_TARGET_IDS.installReading)
            : act('Ask the maker for a date', ACT_TARGET_IDS.installReading);
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
  claim_window: 'Notify the maker',
  damage_claim: 'File the claim',
  proposal_declined: 'Follow up',
  proposal_expired: 'Revise proposal',
  lines_flagged: 'Open the flagged lines',
  new_lead: 'Respond to the inquiry',
  ceremony_pending: 'Continue the introduction',
  reconnect_due: 'Message {first name}',
  hesitating_proposal: 'Nudge {first name}',
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
  ack_discrepancy: 'Answer the maker',
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

// ── A standing row's act (498-e) ─────────────────────────────────────────────

/** The standing rows no need names: the ticket's exceptions (`1 damaged`,
 *  `$X owed you`, …) and the guide's `N blocked project items` input. */
export type StandingRowKind =
  | 'damaged'
  | 'awaiting_decision'
  | 'owed'
  | 'install_passed'
  | 'blocked'
  | 'unspecified'
  | 'po_silence';

/**
 * FR3 512-6 / 498-e — every standing row carries its act, from this one table.
 * `targetId` names the control the press lands on; null where `ACT_TARGET_IDS`
 * names none yet (Message, F3-2), and the press lands on the stage's region.
 */
export const STANDING_ROW_ACTS: Readonly<
  Record<StandingRowKind, { label: string; targetId: ActTargetId | null }>
> = {
  damaged: { label: NAMED_ACTS.fileClaim, targetId: ACT_TARGET_IDS.piecesHead },
  awaiting_decision: { label: 'Nudge {first name}', targetId: null },
  owed: { label: 'Nudge {first name}', targetId: null },
  install_passed: { label: 'Set dates', targetId: ACT_TARGET_IDS.installWindow },
  blocked: { label: 'Open the pieces', targetId: ACT_TARGET_IDS.piecesHead },
  unspecified: { label: 'Fill the {N} placeholders', targetId: ACT_TARGET_IDS.piecesHead },
  po_silence: { label: NEED_ACT_LABELS.po_unacknowledged, targetId: ACT_TARGET_IDS.piecesHead },
};

/** The row's act as it prints: `{first name}` as `needActLabel` fills it,
 *  `{N}` the count the row states. */
export function standingRowActLabel(
  kind: StandingRowKind,
  { firstName = null, count = 0 }: { firstName?: string | null; count?: number } = {},
): string {
  // `{N} placeholders` agrees with its count, as the own act prints it.
  if (kind === 'unspecified') return fillThePlaceholders(count);
  const first = firstName?.trim();
  return STANDING_ROW_ACTS[kind].label
    .replace('{first name}', first || 'the client')
    .replace('{N}', String(count));
}
