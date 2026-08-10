import { deriveNeed, type DocumentStateRow, type NeedLine, type SectionKey } from './desk-derivation';

export type DocumentGuideState =
  | 'unavailable'
  | 'paused'
  | 'actionable'
  | 'needs_input'
  | 'waiting'
  | 'on_track';

export interface DocumentGuideInput {
  label: string;
  owner: 'Designer' | 'Client' | 'Studio' | 'Maker';
  blocks: string;
}

export type DocumentGuideDestination =
  | { kind: 'href'; href: string }
  | { kind: 'anchor'; section: SectionKey }
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
  topInput: DocumentGuideInput | null;
  remainingInputCount: number;
  action: DocumentGuideAction | null;
}

interface DeriveDocumentGuideInput {
  row: DocumentStateRow;
  availability?: 'ready' | 'unavailable';
  now?: Date;
  hardInputs?: DocumentGuideInput[];
  operationalNeed?: NeedLine | null;
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

function actionForNeed(need: NeedLine, stage: SectionKey): DocumentGuideAction {
  const destination: DocumentGuideDestination = need.ledger
    ? { kind: 'ledger', name: need.ledger.name, context: need.ledger.context }
    : need.deepLink
      ? { kind: 'href', href: need.deepLink }
      : { kind: 'anchor', section: stage };
  return {
    key: `resolve-${need.kind}`,
    label: need.actionLabel ?? 'Review now',
    destination,
  };
}

export function deriveDocumentGuide({
  row,
  availability = 'ready',
  now = new Date(),
  hardInputs = [],
  operationalNeed,
}: DeriveDocumentGuideInput): DocumentGuideModel {
  const stage = row.active_section;
  if (availability === 'unavailable') {
    return {
      state: 'unavailable', stage, eyebrow: 'Next up', headline: 'Guidance is unavailable',
      reason: 'Reload the document before acting so missing data is never mistaken for an empty section.',
      topInput: null, remainingInputCount: 0, action: null,
    };
  }
  if (row.is_paused) {
    return {
      state: 'paused', stage, eyebrow: `${stageCopy[stage].eyebrow} · paused`, headline: 'This project is paused',
      reason: 'Review the project status before resuming lifecycle work.', topInput: null,
      remainingInputCount: 0, action: { key: 'review-paused-project', label: 'Review project', destination: { kind: 'anchor', section: stage } },
    };
  }

  const need = operationalNeed === undefined ? deriveNeed(row, now) : operationalNeed;
  if (need) {
    return {
      state: 'actionable', stage, eyebrow: `${stageCopy[stage].eyebrow} · needs attention`,
      headline: need.text, reason: 'This is the highest-priority open action in the current document.',
      topInput: null, remainingInputCount: 0, action: actionForNeed(need, stage),
    };
  }

  const base = stageCopy[stage];
  const action =
    stage === 'direction' && row.proposal_id
      ? { ...base.action!, destination: { kind: 'href' as const, href: `/drafting/${row.proposal_id}` } }
      : base.action;
  return {
    ...base,
    stage,
    action,
    topInput: hardInputs[0] ?? null,
    remainingInputCount: Math.max(0, hardInputs.length - 1),
  };
}
