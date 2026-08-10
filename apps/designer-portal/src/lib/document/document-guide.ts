import { deriveNeed, type DocumentStateRow, type NeedLine, type SectionKey } from './desk-derivation';
import type { CommercialDocumentKind, CommercialState } from './commercial-documents';

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
}

interface DeriveDocumentGuideInput {
  row: DocumentStateRow;
  availability?: 'ready' | 'unavailable';
  now?: Date;
  proposal?: ProposalGuideFacts | null;
  inputFacts?: readonly DocumentGuideInputFact[];
}

const stageCopy: Record<SectionKey, Omit<DocumentGuideModel, 'stage' | 'topInput' | 'remainingInputCount'>> = {
  brief: {
    state: 'actionable',
    eyebrow: 'Brief · decide the fit',
    headline: 'Review the inquiry',
    reason: 'Choose whether to accept, nurture, or pass so the relationship has a clear next move.',
    action: { key: 'review-inquiry', label: 'Review the brief', destination: { kind: 'anchor', section: 'brief' } },
  },
  discovery: {
    state: 'needs_input',
    eyebrow: 'Discovery · shape the brief',
    headline: 'Complete Discovery',
    reason: 'Capture the essential scope, budget, timing, style, and lifestyle inputs before shaping direction.',
    action: { key: 'continue-discovery', label: 'Continue Discovery', destination: { kind: 'anchor', section: 'discovery' } },
  },
  direction: {
    state: 'actionable',
    eyebrow: 'Direction · compose the offer',
    headline: 'Shape the direction',
    reason: 'Turn the agreed discovery into scope, fees, terms, and a visual point of view.',
    action: { key: 'open-drafting-room', label: 'Open Drafting Room', destination: { kind: 'anchor', section: 'direction' } },
  },
  proposal: {
    state: 'waiting',
    eyebrow: 'Proposal · in the client’s hands',
    headline: 'Follow up on the proposal',
    reason: 'Review its current state and use the existing proposal controls for the next client touch.',
    action: { key: 'review-proposal', label: 'Review proposal', destination: { kind: 'anchor', section: 'proposal' } },
  },
  project: {
    state: 'on_track',
    eyebrow: 'Project · active work',
    headline: 'Move the project forward',
    reason: 'Start with the schedule and the active work that needs a decision, release, or follow-through.',
    action: { key: 'review-project-work', label: 'Review active work', destination: { kind: 'anchor', section: 'project' } },
  },
  install: {
    state: 'actionable',
    eyebrow: 'Install · finish in the field',
    headline: 'Complete the installation',
    reason: 'Work through arrivals, inspections, installation details, and closeout items in the schedule.',
    action: { key: 'review-installation', label: 'Review installation', destination: { kind: 'anchor', section: 'install' } },
  },
  care: {
    state: 'actionable',
    eyebrow: 'Care · close the loop',
    headline: 'Close out the project',
    reason: 'Resolve the remaining care items, hand off the finished work, and close the book.',
    action: { key: 'review-closeout', label: 'Review closeout', destination: { kind: 'anchor', section: 'care' } },
  },
};

function withInputs(
  model: Omit<DocumentGuideModel, 'topInput' | 'remainingInputCount'>,
  inputFacts: readonly DocumentGuideInputFact[] | undefined,
): DocumentGuideModel {
  const firstInput = inputFacts?.[0] ?? null;
  const inputAction =
    firstInput?.focusId && model.stage === 'discovery'
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

function actionForNeed(need: NeedLine, row: DocumentStateRow): DocumentGuideAction {
  const orderPage =
    need.kind === 'damage_claim' || need.kind === 'awaiting_inspection'
      ? 'receiving'
      : need.kind === 'po_unsent' || need.kind === 'po_unacknowledged'
        ? 'ledger'
        : null;
  const destination: DocumentGuideDestination = need.kind === 'reconnect_due'
    ? { kind: 'href', href: '/people?view=nurture' }
    : orderPage
      ? { kind: 'ledger', name: 'orders', context: { page: orderPage, projectId: row.project_id ?? undefined } }
    : need.ledger
    ? { kind: 'ledger', name: need.ledger.name, context: need.ledger.context }
    : need.deepLink
      ? { kind: 'href', href: need.deepLink }
      : {
          kind: 'anchor',
          section: row.active_section,
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
    label: need.actionLabel ?? 'Review now',
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
  return {
    state: 'waiting', stage, eyebrow: 'Proposal · with the client',
    headline: 'Wait for the client’s signature',
    reason: 'The proposal is in the client’s hands. Review its activity and follow-up controls below.',
    action: controls,
  };
}

export function deriveDocumentGuide({
  row,
  availability = 'ready',
  now = new Date(),
  proposal,
  inputFacts,
}: DeriveDocumentGuideInput): DocumentGuideModel {
  const stage = row.active_section;
  if (availability === 'unavailable') {
    return withInputs({
      state: 'unavailable', stage, eyebrow: 'Next up', headline: 'Guidance is unavailable',
      reason: 'Reload the document before acting so missing data is never mistaken for an empty section.',
      action: null,
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

  const need = deriveNeed(row, now);
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
      reason: 'This action comes from the operational signals available on the current document.',
      action: actionForNeed(need, row),
    }, inputFacts);
  }

  if (stage === 'proposal') {
    const guide = proposalGuide(row, proposal);
    return withInputs(guide, inputFacts);
  }

  const base = stageCopy[stage];
  const action =
    stage === 'direction' && row.proposal_id
      ? { ...base.action!, destination: { kind: 'href' as const, href: `/drafting/${row.proposal_id}` } }
      : base.action;
  return withInputs({
    ...base,
    stage,
    action,
  }, inputFacts);
}
