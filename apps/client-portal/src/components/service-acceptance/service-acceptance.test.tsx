import { randomUUID } from 'node:crypto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
Object.defineProperty(globalThis.crypto, 'randomUUID', { value: randomUUID, configurable: true });
import { ServiceAcceptancePage, ServiceAcceptanceReading, acceptanceRefusal } from './service-acceptance';
import { ServiceAcceptanceDoor } from './service-acceptance-door';
import type { MyServiceAcceptanceRequest } from '@patina/supabase';
const mockMutate = jest.fn();
let mockQuery: any;
jest.mock('@patina/supabase', () => ({ useMyServiceAcceptanceRequests: () => mockQuery, useRespondServiceAcceptance: () => ({ mutateAsync: mockMutate, isPending: false }) }));
jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));
const request = (over: Partial<MyServiceAcceptanceRequest> = {}): MyServiceAcceptanceRequest => ({
  requestId: 'r1', projectId: 'p1', requestNumber: 4, scopeEditionId: 'edition-1',
  scopeContentHash: 'a'.repeat(64), evidenceManifestHash: 'b'.repeat(64), signerPolicyRevision: 2,
  lifecycle: 'sent', aggregateOutcome: 'pending', sentAt: 'today', closedAt: null,
  viewerRole: 'signer_required', viewerSignerId: 's1',
  signers: [{ signerId: 's1', slot: 'Client', required: true, response: null }], ...over,
});
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }));
beforeEach(() => { mockMutate.mockReset(); mockQuery = { data: [request()], isPending: false, isError: false, refetch: jest.fn().mockResolvedValue({}) }; });
it('shows exact references and required unanswered response controls without signature wording', () => {
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  expect(screen.getByText('a'.repeat(64))).toBeInTheDocument();
  expect(screen.getByText('b'.repeat(64))).toBeInTheDocument();
  expect(screen.getByText('edition-1')).toBeInTheDocument();
  expect(screen.getByText(/contents are not available/)).toBeInTheDocument();
  for (const name of ['Accept', 'Accept with conditions', 'Return']) expect(screen.getByRole('button', { name, exact: true })).toBeEnabled();
  expect(document.body.textContent).not.toMatch(/sign(?:ature|ing)|e-sign/i);
});
it.each(['signer_optional', 'observer', 'future_role'])('keeps %s read only', (viewerRole) => {
  render(<ServiceAcceptanceReading request={request({ viewerRole: viewerRole as any })} reload={mockQuery.refetch} />);
  expect(screen.queryByRole('button', { name: 'Accept', exact: true })).not.toBeInTheDocument();
});
it.each(['withdrawn', 'superseded', 'closed'])('keeps %s request read only', (lifecycle) => {
  render(<ServiceAcceptanceReading request={request({ lifecycle: lifecycle as any })} reload={mockQuery.refetch} />);
  expect(screen.queryByRole('button', { name: 'Accept', exact: true })).not.toBeInTheDocument();
});
it('requires conditions and confirmation then sends the exact presented snapshot', async () => {
  const shown = request();
  mockMutate.mockResolvedValue({ pendingRequiredSigners: 1 });
  render(<ServiceAcceptanceReading request={shown} reload={mockQuery.refetch} />);
  click('Accept with conditions');
  expect(screen.getByRole('button', { name: 'Review response' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Condition 1'), { target: { value: ' Finish trim ' } });
  click('Review response');
  expect(mockMutate).not.toHaveBeenCalled();
  click('Confirm response');
  await waitFor(() => expect(screen.getByText('Your response is recorded')).toBeInTheDocument());
  expect(mockMutate).toHaveBeenCalledWith({ request: shown, response: 'accept_with_conditions', conditions: [{ conditionId: expect.any(String), text: 'Finish trim' }], returnReason: '' });
  expect(screen.getByText('Accept with conditions · Authenticated portal response')).toBeInTheDocument();
});
it('requires return reason and does not confirm delivery on return', async () => {
  mockMutate.mockResolvedValue({ pendingRequiredSigners: 0 });
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  click('Return');
  expect(screen.getByRole('button', { name: 'Review response' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Reason for returning'), { target: { value: 'Work remains' } });
  click('Review response');
  expect(screen.getByText(/not accepting delivery/)).toBeInTheDocument();
  const confirmation = screen.getByText('Confirm: Return').parentElement!;
  expect(confirmation.textContent).not.toMatch(/You confirm the studio delivered/);
  click('Confirm response');
  await waitFor(() => expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ response: 'return', returnReason: 'Work remains', conditions: [] })));
});
it('retains words and confirmation through inactive grant refusal and retries the same body', async () => {
  mockMutate.mockRejectedValueOnce({ code: '42501' }).mockResolvedValueOnce({ pendingRequiredSigners: 0 });
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  click('Return'); fireEvent.change(screen.getByLabelText('Reason for returning'), { target: { value: 'Keep my words' } }); click('Review response'); click('Confirm response');
  expect(await screen.findByRole('alert')).toHaveTextContent("Responses are paused for now. Nothing you've seen is lost.");
  expect(screen.getByLabelText('Reason for returning')).toHaveValue('Keep my words');
  click('Confirm response');
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2));
  expect(mockMutate.mock.calls[1][0]).toEqual(mockMutate.mock.calls[0][0]);
});
it('holds stale presented data until a successful reload and preserves words on failed refresh', async () => {
  const reload = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});
  const { rerender } = render(<ServiceAcceptanceReading request={request()} reload={reload} />);
  click('Return'); fireEvent.change(screen.getByLabelText('Reason for returning'), { target: { value: 'Keep words' } }); click('Review response');
  rerender(<ServiceAcceptanceReading request={request({ signerPolicyRevision: 3 })} reload={reload} />);
  expect(screen.getByRole('alert')).toHaveTextContent('This request changed');
  expect(screen.getByRole('button', { name: 'Confirm response' })).toBeDisabled();
  click('Reload request'); await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText('Reason for returning')).toHaveValue('Keep words');
  click('Reload request'); await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirm response' })).not.toBeInTheDocument());
  click('Return'); expect(screen.getByLabelText('Reason for returning')).toHaveValue('Keep words');
});
it('keeps mounted draft on warm read error and shows unavailable for a foreign id', () => {
  const { rerender } = render(<ServiceAcceptancePage requestId="r1" />);
  click('Return'); fireEvent.change(screen.getByLabelText('Reason for returning'), { target: { value: 'My draft' } });
  mockQuery = { ...mockQuery, isError: true };
  rerender(<ServiceAcceptancePage requestId="r1" />);
  expect(screen.getByLabelText('Reason for returning')).toHaveValue('My draft');
  mockQuery = { ...mockQuery, isError: false };
  rerender(<ServiceAcceptancePage requestId="foreign" />);
  expect(screen.getByText('Request unavailable')).toBeInTheDocument();
});
it('shows own and other response methods without allowing a second response', () => {
  const own = { response: 'accept' as const, conditions: [], returnReason: null, respondedAt: 'today', method: 'ios_authenticated' as const };
  render(<ServiceAcceptanceReading request={request({ signers: [{ signerId: 's1', slot: 'Client', required: true, response: own }, { signerId: 's2', slot: 'Partner', required: true, response: { ...own, method: 'paper_intake' } }] })} reload={mockQuery.refetch} evidence={<p>Authorized evidence contents</p>} />);
  expect(within(screen.getByRole('region', { name: 'Your recorded response' })).getByText('Accept · Authenticated iOS response')).toBeInTheDocument();
  expect(screen.getByText('Accept · Reviewed paper response')).toBeInTheDocument();
  expect(screen.getByText('Authorized evidence contents')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Accept', exact: true })).not.toBeInTheDocument();
});
it('discovers only required unanswered sent requests in the current house', () => {
  mockQuery.data = [request(), request({ requestId: 'other', projectId: 'p2' }), request({ requestId: 'optional', viewerRole: 'signer_optional' }), request({ requestId: 'observer', viewerRole: 'observer' }), request({ requestId: 'withdrawn', lifecycle: 'withdrawn' })];
  render(<ServiceAcceptanceDoor projectId="p1" />);
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('link')).toHaveAttribute('href', '/acceptance/r1');
});
it('maps each authoritative refusal to calm copy', () => {
  for (const message of ['permission denied', 'scope_composition_disabled', 'insufficient_privilege']) expect(acceptanceRefusal({ message })).toMatch(/paused/);
  for (const message of ['stale_scope', 'stale_signer_policy']) expect(acceptanceRefusal({ message })).toMatch(/request changed/);
  expect(acceptanceRefusal({ message: 'already_responded' })).toMatch(/already recorded/);
  expect(acceptanceRefusal({ message: 'request_not_open' })).toMatch(/no longer open/);
  expect(acceptanceRefusal({ message: 'signer_not_active' })).toMatch(/no longer asked/);
  expect(acceptanceRefusal(new Error('offline'))).toMatch(/words are kept/);
});
