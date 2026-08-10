import {
  ESSENTIAL_KEYS,
  deriveDiscoveryReadiness,
  type DiscoveryFacts,
  type EssentialKey,
} from './discovery-readiness';
import type { DocumentStateRow } from './desk-derivation';
import type {
  DocumentGuideInputFact,
  ProposalGuideFacts,
} from './document-guide';

type ReadState<T> =
  | { state: 'idle' | 'loading' | 'error'; data?: undefined }
  | { state: 'ready'; data: T };

export interface DocumentGuideReadinessFacts {
  discovery: ReadState<Partial<DiscoveryFacts>>;
  drafting: ReadState<{ gaps: readonly string[] }>;
}

const DISCOVERY_INPUTS: Record<EssentialKey, DocumentGuideInputFact> = {
  scope: { label: 'Project type and named rooms', owner: 'Designer', blocks: 'Direction' },
  budget: { label: 'Working budget', owner: 'Client', blocks: 'Direction' },
  timeline: { label: 'Target or hard date', owner: 'Client', blocks: 'Direction' },
  style: { label: 'Style direction', owner: 'Client', blocks: 'Direction' },
  lifestyle: { label: 'Lifestyle needs', owner: 'Client', blocks: 'Direction' },
};

const EMPTY_DISCOVERY: DiscoveryFacts = {
  project_type: null,
  rooms: [],
  budget_max_cents: null,
  target_date: null,
  hard_date: null,
  style_tag_ids: [],
  style_keywords: [],
  lifestyle: [],
  keep_items: [],
  avoid_items: [],
  decision_makers: [],
  room_scan_id: null,
  site_notes: null,
};

export function composeDocumentGuideInputs({
  row,
  proposal,
  readiness,
}: {
  row: DocumentStateRow;
  proposal: ProposalGuideFacts | null;
  readiness: DocumentGuideReadinessFacts;
}): DocumentGuideInputFact[] {
  if (row.active_section === 'discovery' && readiness.discovery.state === 'ready') {
    const facts: DiscoveryFacts = { ...EMPTY_DISCOVERY, ...readiness.discovery.data };
    const derived = deriveDiscoveryReadiness(facts);
    return ESSENTIAL_KEYS.filter((key) => !derived.done[key]).map(
      (key) => DISCOVERY_INPUTS[key],
    );
  }

  if (row.active_section === 'direction' && readiness.drafting.state === 'ready') {
    return readiness.drafting.data.gaps.map((gap) => ({
      label: gap,
      owner: 'Designer' as const,
      blocks: 'Client proposal',
    }));
  }

  if (row.active_section === 'proposal') {
    if (proposal?.documentKind === 'design_services') {
      if (proposal.commercialState === 'client_signed') {
        return [{ label: 'Studio countersignature', owner: 'Studio', blocks: 'Project activation' }];
      }
      if (proposal.commercialState === 'sent') {
        return [{ label: 'Client signature', owner: 'Client', blocks: 'Project activation' }];
      }
    }
    if (proposal?.status === 'sent' || proposal?.status === 'viewed') {
      return [{ label: 'Client signature', owner: 'Client', blocks: 'Project activation' }];
    }
  }

  if (row.overdue_decision_count > 0) {
    return [{
      label: `${row.overdue_decision_count} overdue client decision${row.overdue_decision_count === 1 ? '' : 's'}`,
      owner: 'Client',
      blocks: 'Active project work',
    }];
  }
  if (row.blocked_item_count > 0) {
    return [{
      label: `${row.blocked_item_count} blocked project item${row.blocked_item_count === 1 ? '' : 's'}`,
      owner: 'Project team',
      blocks: 'Active project work',
    }];
  }

  return [];
}

