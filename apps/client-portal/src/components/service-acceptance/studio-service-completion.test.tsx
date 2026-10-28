import { fireEvent, render, screen, within } from '@testing-library/react';
import { StudioServiceCompletion } from './studio-service-completion';
import { ServiceAcceptancePage } from './service-acceptance';
import { readMyStudioServiceCompletion } from '@patina/supabase/hooks/use-my-service-acceptance';

let mockHydrated = true;
const mockCompletion = jest.fn();
const mockRefetch = jest.fn();
let mockRequest = {
  requestId: 'r1', projectId: 'p1', requestNumber: 4, scopeEditionId: 'old-edition',
  scopeContentHash: 'old-hash', evidenceManifestHash: 'evidence-hash',
  lifecycle: 'closed', aggregateOutcome: 'accepted', signers: [], viewerRole: 'observer',
};
jest.mock('@patina/supabase', () => ({
  useMyStudioServiceCompletion: (projectId: string | null, requestId: string) => mockCompletion(projectId, requestId),
  useMyServiceAcceptanceRequests: () => ({ data: [mockRequest], isPending: false, isError: false }),
}));
jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => mockHydrated }));
const completion = {
  completionId: 'c1', acceptanceRequestId: 'r1', scopeEditionId: 'accepted-edition',
  scopeContentHash: 'accepted-scope-hash', requestNumber: 7,
  state: 'completed', completedAt: '2026-10-27T12:00:00Z', conditionsClosedAt: null,
};
const query = (value: unknown = completion, over = {}) => ({
  data: { projectId: 'p1', completion: value }, isPending: false, isError: false,
  refetch: mockRefetch, ...over,
});
beforeEach(() => { mockHydrated = true; mockRequest = { ...mockRequest, lifecycle: 'closed', aggregateOutcome: 'accepted' }; mockRefetch.mockReset(); mockCompletion.mockReset().mockReturnValue(query()); });

it('mounts additive completion on the acceptance page with its own accepted scope and date, not project closure', () => {
  render(<ServiceAcceptancePage requestId="r1" />);
  expect(mockCompletion).toHaveBeenCalledWith('p1', 'r1');
  const section = within(screen.getByRole('region', { name: 'Studio service' }));
  expect(section.getByText('The studio’s service is complete')).toBeInTheDocument();
  expect(section.getByText('October 27, 2026')).toHaveAttribute('dateTime', completion.completedAt);
  expect(section.getByText('Accepted scope · request 7')).toBeInTheDocument();
  expect(section.getByText('accepted-edition')).toBeInTheDocument();
  expect(section.getByText('accepted-scope-hash')).toBeInTheDocument();
  expect(section.getByText('Care questions are still welcome.')).toBeInTheDocument();
  expect(section.queryByText(/financial|hold|project.*closed|old-hash|old-edition/i)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Service acceptance' })).toBeInTheDocument();
});
it('keeps unresolved conditions distinct then reads resolved conditions as complete without inventing a count or texts', () => {
  mockCompletion.mockReturnValue(query({ ...completion, state: 'completed_with_conditions' }));
  const { rerender } = render(<StudioServiceCompletion projectId="p1" requestId="r1" aggregateOutcome="accepted" />);
  expect(screen.getByText('Complete, with conditions still being resolved')).toBeInTheDocument();
  expect(screen.queryByText('The studio’s service is complete')).not.toBeInTheDocument();
  mockCompletion.mockReturnValue(query({ ...completion, state: 'completed_with_conditions', conditionsClosedAt: '2026-10-28T12:00:00Z' }));
  rerender(<StudioServiceCompletion projectId="p1" requestId="r1" aggregateOutcome="accepted" />);
  expect(screen.getByText('The studio’s service is complete')).toBeInTheDocument();
  expect(screen.getByText('October 28, 2026')).toHaveAttribute('dateTime', '2026-10-28T12:00:00Z');
  expect(screen.queryByText('Complete, with conditions still being resolved')).not.toBeInTheDocument();
});
it('shows will-confirm for absent completion including the suppressed studio/revoked projection', () => {
  const read = readMyStudioServiceCompletion({ projectId: 'p1', audience: 'studio',
    completions: [{ ...completion, revokedAt: '2026-10-28T12:00:00Z', financialHold: { private: true } }],
  }, 'p1', 'r1');
  mockCompletion.mockReturnValue(query(null, { data: read }));
  render(<StudioServiceCompletion projectId="p1" requestId="r1" aggregateOutcome="accepted" />);
  expect(screen.getByText('The studio will confirm when its service is complete')).toBeInTheDocument();
  expect(screen.queryByText('The studio’s service is complete')).not.toBeInTheDocument();
});
it('hides inactive and permission-denied readings even after a cached completion', () => {
  const { rerender } = render(<StudioServiceCompletion projectId="p1" requestId="r1" aggregateOutcome="accepted" />);
  mockCompletion.mockReturnValue(query(null, { data: null }));
  rerender(<StudioServiceCompletion projectId="p1" requestId="r1" aggregateOutcome="accepted" />);
  expect(screen.queryByRole('region', { name: 'Studio service' })).not.toBeInTheDocument();
});
it('gates hydration and loading, and reports refresh failure instead of stale completion with a local retry', () => {
  mockHydrated = false;
  const { rerender } = render(<StudioServiceCompletion projectId="p1" requestId="r1" aggregateOutcome="accepted" />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading studio service');
  mockHydrated = true;
  mockCompletion.mockReturnValue(query(null, { isPending: true }));
  rerender(<StudioServiceCompletion projectId="p1" requestId="r1" aggregateOutcome="accepted" />);
  expect(screen.getByRole('status')).toBeInTheDocument();
  mockCompletion.mockReturnValue(query(completion, { isError: true }));
  rerender(<StudioServiceCompletion projectId="p1" requestId="r1" aggregateOutcome="accepted" />);
  expect(screen.getByRole('alert')).toHaveTextContent('could not be refreshed');
  expect(screen.queryByText('The studio’s service is complete')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry service status' }));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});

it.each(['pending', 'returned'])('hides the studio service section on a %s request page', (aggregateOutcome) => {
  mockRequest = { ...mockRequest, lifecycle: 'sent', aggregateOutcome };
  render(<ServiceAcceptancePage requestId="r1" />);
  expect(screen.queryByRole('region', { name: 'Studio service' })).not.toBeInTheDocument();
  expect(screen.queryByText('Care questions are still welcome.')).not.toBeInTheDocument();
});
it('shows will-confirm on an accepted page when the only completion belongs to another request', () => {
  mockCompletion.mockImplementation((projectId, requestId) => query(null, { data:
    readMyStudioServiceCompletion({ projectId: 'p1', audience: 'client', completions: [
      { ...completion, acceptanceRequestId: 'r2' },
    ] }, projectId, requestId),
  }));
  render(<ServiceAcceptancePage requestId="r1" />);
  expect(screen.getByText('The studio will confirm when its service is complete')).toBeInTheDocument();
  expect(screen.queryByText('The studio’s service is complete')).not.toBeInTheDocument();
  expect(screen.queryByText('Care questions are still welcome.')).not.toBeInTheDocument();
});
it('shows matching conditional acceptance completion on its accepted-with-conditions page', () => {
  mockRequest = { ...mockRequest, aggregateOutcome: 'accepted_with_conditions' };
  mockCompletion.mockReturnValue(query({ ...completion, state: 'completed_with_conditions' }));
  render(<ServiceAcceptancePage requestId="r1" />);
  expect(screen.getByText('Complete, with conditions still being resolved')).toBeInTheDocument();
  expect(screen.getByText('Care questions are still welcome.')).toBeInTheDocument();
});
