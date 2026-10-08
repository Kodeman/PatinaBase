/**
 * US-19 FR4 524-f (`one-voice`) — the Brief's `Respond to the inquiry` lands
 * on the reply CONTROL: `document-act-inquiry-reply` sits on the open Brief's
 * `Accept · begin`, not on the region. Flag off, and on the Desk's card, the
 * control carries no id. (The Brief letterhead's act set, 524-d, is pinned in
 * letterhead-instruments.test.tsx.)
 */
import { render, screen } from '@testing-library/react';
import { ACT_TARGET_IDS, ownAct, type OwnActFacts } from '@/lib/document/act-names';
import { TriageBar } from '../triage-bar';

jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock('@patina/supabase', () => ({
  useBeginDiscovery: () => ({ mutate: jest.fn(), isPending: false }),
  useNurtureLead: () => ({ mutate: jest.fn(), isPending: false }),
  useDeclineLead: () => ({ mutate: jest.fn(), isPending: false }),
  useAcceptDesignRequest: () => ({ mutate: jest.fn(), isPending: false }),
}));
let mockOneVoice = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({
    value: key === 'one-voice' ? mockOneVoice : false,
    isLoading: false,
  }),
}));

const FACTS: OwnActFacts = {
  inquiryOpen: true,
  firstMissingEssential: null,
  proposalState: null,
  clientFirstName: null,
  unspecifiedCount: 0,
  releaseEligible: false,
  install: null,
};

beforeEach(() => {
  mockOneVoice = true;
});

describe('the Brief reply target (FR4 524-f)', () => {
  it('the band’s act targets the id the reply control carries', () => {
    expect(ownAct('brief', FACTS)).toMatchObject({
      label: 'Respond to the inquiry',
      targetId: ACT_TARGET_IDS.inquiryReply,
    });
    render(<TriageBar leadId="lead-1" variant="brief" />);
    const reply = document.getElementById(ACT_TARGET_IDS.inquiryReply);
    expect(reply).toBe(screen.getByRole('button', { name: 'Accept · begin' }));
    expect(reply?.tagName).toBe('BUTTON');
  });

  it('the Desk’s card never carries the paper’s id', () => {
    render(<TriageBar leadId="lead-1" variant="desk" />);
    expect(document.getElementById(ACT_TARGET_IDS.inquiryReply)).toBeNull();
  });

  it('flag off: no id', () => {
    mockOneVoice = false;
    render(<TriageBar leadId="lead-1" variant="brief" />);
    expect(document.getElementById(ACT_TARGET_IDS.inquiryReply)).toBeNull();
  });
});
