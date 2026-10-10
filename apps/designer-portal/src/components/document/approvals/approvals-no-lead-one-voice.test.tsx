/**
 * US-19 FR2 F2-26 — Cedar's Client approvals with no decision lead named:
 * `This project does not have a designated decision lead yet.` and
 * `0 decided · no decision lead` become one sentence under `one-voice`:
 * `No decision lead named yet.` one-voice off keeps both of today's strings.
 */
import { render, screen } from '@testing-library/react';

import { ProjectApprovalDocument } from './project-approval-document';
import { __setDensityForTest } from '@/hooks/use-lens-density';

let mockOneVoice = true;
let authority: Record<string, unknown> | null = null;
let proposals: Array<Record<string, unknown>> = [];

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => ({
    value: flag === 'one-voice' ? mockOneVoice : false,
    isLoading: false,
  }),
}));

const idle = { mutateAsync: jest.fn(), isPending: false };
jest.mock('@patina/supabase', () => ({
  useProjectApprovals: () => ({ data: [], isLoading: false, isFetching: false, isError: false }),
  useProjectApprovalArtifactCandidates: () => ({ data: [], isLoading: false, isError: false }),
  useProjectDecisionAuthority: () => ({ data: authority, isLoading: false, isError: false }),
  useProposals: () => ({ data: proposals, isLoading: false, isError: false }),
  useSetProjectDecisionAuthority: () => idle,
  useCreateProjectApproval: () => idle,
  usePublishProjectApproval: () => idle,
  useWithdrawProjectApproval: () => idle,
  useSupersedeProjectApproval: () => idle,
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

const renderCedar = () =>
  render(
    <ProjectApprovalDocument
      projectId="project-cedar"
      clientProfileId="client-1"
      clientName="Nora Cedar"
      phases={[{ id: 'phase-1', name: 'Design development', status: 'in_progress' }]}
    />,
  );

beforeEach(() => {
  window.localStorage.clear();
  mockOneVoice = true;
  authority = null;
  proposals = [];
  __setDensityForTest('full');
});
afterEach(() => {
  __setDensityForTest(undefined);
});

describe('No decision lead named (F2-26)', () => {
  it('says it once: No decision lead named yet.', () => {
    renderCedar();
    expect(screen.getAllByText('No decision lead named yet.')).toHaveLength(1);
    expect(
      screen.queryByText('This project does not have a designated decision lead yet.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/no decision lead$/)).not.toBeInTheDocument();
  });

  it('keeps today’s two strings with one-voice off', () => {
    mockOneVoice = false;
    renderCedar();
    expect(
      screen.getByText('This project does not have a designated decision lead yet.'),
    ).toBeInTheDocument();
    expect(screen.getByText('0 decided · no decision lead')).toBeInTheDocument();
  });

  it('names the lead as before once one is named', () => {
    authority = { decisionLeadId: 'client-1', requiredCoapproverId: null };
    renderCedar();
    expect(screen.queryByText('No decision lead named yet.')).not.toBeInTheDocument();
    expect(screen.getByText('0 decided · Nora Cedar')).toBeInTheDocument();
  });
});

// US-25 fix-now 15 — a job whose client has already decided the proposal reads
// that decision, never `No decision lead named yet.`; the assign act stays.
describe('the proposal’s outcome on a job with a client and a decision', () => {
  it('reads the accepted proposal, not the missing lead', () => {
    proposals = [
      { id: 'p-1', status: 'accepted', responded_at: '2026-10-08T12:00:00Z', updated_at: '2026-10-08T12:00:00Z' },
    ];
    renderCedar();
    expect(screen.getByText('Nora Cedar accepted the proposal · 8 October')).toBeInTheDocument();
    expect(screen.queryByText('No decision lead named yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /assign project client/i })).toBeInTheDocument();
  });

  it('reads a declined proposal as declined', () => {
    proposals = [
      { id: 'p-1', status: 'declined', responded_at: '2026-10-06T12:00:00Z', updated_at: '2026-10-07T12:00:00Z' },
    ];
    renderCedar();
    expect(screen.getByText('Nora Cedar declined the proposal · 6 October')).toBeInTheDocument();
  });
});
