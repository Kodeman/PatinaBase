/**
 * Regression test for the [id] proposal detail page's handling of the 00414
 * retired-legacy marker.
 *
 * get_client_commercial_document_bundle used to raise for legacy rows, so
 * the page fell back to commercialSummaryFromProposal (which derives state
 * from the proposal's real `status`). The migration now answers with a fixed
 * retired marker instead of raising — and adaptCommercialDocumentBundle had
 * not been taught to read that marker's `status`, so it collapsed every
 * legacy document to state 'draft'. That silently killed isActionable,
 * taking the retirement copy, Decline, and Request-a-change with it (see
 * apps/client-portal/src/lib/commercial-documents.ts, adaptCommercialDocumentBundle).
 *
 * This test renders the real page against the real adapter fed the exact
 * marker shape the migration returns, so a regression in either the adapter
 * or the page's branching is caught here, not just in the adapter's own
 * unit tests.
 */
import { Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';
import type { Proposal } from '@patina/supabase';

import ClientProposalDetailPage from '../page';
import { useClientProposal } from '@/hooks/use-proposals-client';
import { useClientCommercialDocument } from '@/hooks/use-commercial-client';
import { adaptCommercialDocumentBundle } from '@/lib/commercial-documents';

jest.mock('@/hooks/use-proposals-client', () => ({
  useClientProposal: jest.fn(),
}));
jest.mock('@/hooks/use-commercial-client', () => ({
  useClientCommercialDocument: jest.fn(),
}));
jest.mock('@patina/supabase', () => ({
  useStudioIdentity: () => ({ data: undefined }),
}));
jest.mock('@patina/help-system', () => ({
  FeatureAnnouncementCoachmark: () => null,
  SurfaceKeys: { ClientPortal: { Proposals: { Welcome: 'client-portal/proposals/welcome' } } },
}));
jest.mock('@/components/help/help-state-setup', () => ({
  useHelpStateReady: () => false,
}));
jest.mock('@/components/proposal-document', () => ({
  ProposalDocument: () => <div data-testid="proposal-document-stub" />,
}));
jest.mock('@/components/commercial-document-shell', () => ({
  CommercialDocumentShell: () => null,
}));
jest.mock('@/components/commercial-notification-recovery', () => ({
  CommercialNotificationRecovery: () => null,
}));
jest.mock('@/components/proposals/ProposalDeclineDialog', () => ({
  ProposalDeclineDialog: () => null,
}));
jest.mock('@/components/proposals/ProposalRequestChangeDialog', () => ({
  ProposalRequestChangeDialog: () => null,
}));
jest.mock('@/components/proposals/ProposalClarifyButton', () => ({
  ProposalClarifyButton: () => null,
}));

const mockUseClientProposal = useClientProposal as jest.Mock;
const mockUseClientCommercialDocument = useClientCommercialDocument as jest.Mock;

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'legacy-marker-1',
    project_id: 'project-1',
    designer_id: 'designer-1',
    client_id: 'client-1',
    designer_client_id: 'dc-1',
    title: 'Kitchen refresh',
    description: null,
    project_address: null,
    client_visibility_tier: null,
    total_amount: 750000,
    payment_terms: null,
    payment_notes: null,
    status: 'sent',
    valid_until: null,
    sent_at: '2026-01-02T00:00:00Z',
    proposal_send_dispatch_id: null,
    viewed_at: null,
    responded_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
    parent_proposal_id: null,
    revision_summary: null,
    client_feedback: null,
    document_kind: 'legacy',
    ...overrides,
  } as Proposal;
}

// The exact retired-marker shape get_client_commercial_document_bundle
// (00414) returns for a legacy proposal — nested under `document`, carrying
// only id/documentKind/kind/retired/title/status/commercialState/
// supersededAt/replacementProposalId/validUntil/sentAt.
function retiredMarker(status: string) {
  return {
    document: {
      id: 'legacy-marker-1',
      documentKind: 'legacy',
      kind: 'legacy',
      retired: true,
      title: 'Kitchen refresh',
      status,
      commercialState: null,
      supersededAt: null,
      replacementProposalId: null,
      validUntil: null,
      sentAt: '2026-01-02T00:00:00Z',
    },
  };
}

function mockPage(status: string) {
  // proposal.signed_at/signed_by_name aren't in the Proposal TS interface
  // (the page reads them via an unknown cast — see proposalAudit in
  // page.tsx), but the real row carries them once accepted.
  const audit = status === 'accepted' ? { signed_at: '2026-01-03T00:00:00Z', signed_by_name: 'Jamie' } : {};
  const proposal = { ...makeProposal({ status: status as Proposal['status'] }), ...audit };
  mockUseClientProposal.mockReturnValue({
    data: proposal,
    bundle: {
      proposal,
      sections: [],
      payment_milestones: [],
      phases: [],
      exclusions: [],
      scope_rooms: [],
      boards: [],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
  mockUseClientCommercialDocument.mockReturnValue({
    data: adaptCommercialDocumentBundle(retiredMarker(status)),
  });
}

// ClientProposalDetailPage reads its route param via React 19's `use()`,
// which suspends on the first render of a not-yet-tracked promise — even one
// created already-fulfilled via Promise.resolve. A Suspense boundary is
// required here the same way Next's own routing provides one at runtime, and
// the retry after the promise settles must be awaited inside act() or the
// DOM update lands after the assertions run.
async function renderDetailPage(id: string) {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <ClientProposalDetailPage params={Promise.resolve({ id })} />
      </Suspense>,
    );
  });
}

describe('ClientProposalDetailPage — 00414 retired legacy marker', () => {
  it('renders the retirement copy and Decline for a sent legacy proposal, not the draft/no-action state', async () => {
    mockPage('sent');
    await renderDetailPage('legacy-marker-1');

    expect(
      await screen.findByText(/your designer will send a new agreement/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId('proposal-decline-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('proposal-request-change-trigger')).toBeInTheDocument();
    // Legacy no longer signs in the portal — no Sign link, even while actionable.
    expect(screen.queryByRole('link', { name: /sign document/i })).not.toBeInTheDocument();
  });

  it('renders the signed banner for an accepted legacy marker instead of collapsing to draft', async () => {
    mockPage('accepted');
    await renderDetailPage('legacy-marker-1');

    expect(await screen.findByText(/signed by/i)).toBeInTheDocument();
    // Accepted (state 'executed') is not actionable — no retirement action bar.
    expect(screen.queryByTestId('proposal-decline-trigger')).not.toBeInTheDocument();
  });

  it('renders the declined banner for a declined legacy marker instead of collapsing to draft', async () => {
    mockPage('declined');
    await renderDetailPage('legacy-marker-1');

    expect(await screen.findByText(/you declined this proposal/i)).toBeInTheDocument();
  });
});
