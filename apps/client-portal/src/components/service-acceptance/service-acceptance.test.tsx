import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ServiceAcceptancePage, ServiceAcceptanceReading, acceptanceRefusal } from './service-acceptance';
import { ServiceAcceptanceDoor } from './service-acceptance-door';
import type { MyServiceAcceptanceRequest, MyServiceAcceptanceEvidence } from '@patina/supabase';
const mockMutate = jest.fn();
const mockSignedUrl = jest.fn();
jest.mock('@/hooks/use-documents-client', () => ({ documentSignedUrl: (...args: unknown[]) => mockSignedUrl(...args) }));
let mockQuery: any;
let mockEvidenceQuery: any;
jest.mock('@patina/supabase', () => ({ useMyStudioServiceCompletion: () => ({ data: null, isPending: false, isError: false }), useMyServiceAcceptanceRequests: () => mockQuery, useMyServiceAcceptanceEvidence: () => mockEvidenceQuery, useRespondServiceAcceptance: () => ({ mutateAsync: mockMutate, isPending: false }) }));
jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));
const request = (over: Partial<MyServiceAcceptanceRequest> = {}): MyServiceAcceptanceRequest => ({
  requestId: 'r1', projectId: 'p1', requestNumber: 4, scopeEditionId: 'edition-1',
  scopeContentHash: 'a'.repeat(64), evidenceManifestHash: 'b'.repeat(64), signerPolicyRevision: 2,
  lifecycle: 'sent', aggregateOutcome: 'pending', sentAt: 'today', closedAt: null,
  viewerRole: 'signer_required', viewerSignerId: 's1',
  signers: [{ signerId: 's1', slot: 'Client', required: true, response: null }], ...over,
});
const receipt = (pendingRequiredSigners: { signerId: string; slot: string }[] = [], aggregateOutcome = 'accepted') => ({
  responseId: 'response-1', aggregateOutcome,
  pendingRequiredSigners, signerPolicyRevision: 2, replayed: false,
});
const evidence: MyServiceAcceptanceEvidence = {
  requestId: 'r1', requestNumber: 4,
  scope: { editionId: 'edition-1', contentHash: 'a'.repeat(64), packages: [
    { key: 'design', label: 'Design services', inclusion: 'included', conditionText: null,
      responsibilities: { design: 'studio', purchasing: 'client', installation: 'none' }, phases: [{ name: 'Room plans', service: 'design' }] },
    { key: 'delivery', label: 'Delivery', inclusion: 'excluded', conditionText: null,
      responsibilities: { design: 'none', purchasing: 'none', installation: 'none' }, phases: [] },
    { key: 'install', label: 'Installation', inclusion: 'conditional', conditionText: 'After the final walk',
      responsibilities: { design: 'none', purchasing: 'none', installation: 'gc' }, phases: [] },
  ] },
  evidence: { manifestId: 'manifest-1', manifestHash: 'b'.repeat(64), members: [
    { kind: 'plan_issue', title: 'Issued room plan', issuedAt: '2026-10-28', content: null,
      documents: [{ bucket: 'project-documents', path: 'plans/room.pdf', title: 'Room plan PDF' }] },
  ] },
};
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }));
beforeEach(() => { mockMutate.mockReset(); mockSignedUrl.mockResolvedValue('https://signed.example/room.pdf'); mockQuery = { data: [request()], isPending: false, isError: false, refetch: jest.fn().mockResolvedValue({}) };
  mockEvidenceQuery = { data: evidence, isSuccess: true, isError: false, refetch: jest.fn() }; });
it('shows exact references and required unanswered response controls without signature wording', () => {
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  expect(screen.getByText('a'.repeat(64))).toBeInTheDocument();
  expect(screen.getByText('b'.repeat(64))).toBeInTheDocument();
  expect(screen.getByText('edition-1')).toBeInTheDocument();
  expect(screen.getByText('Design services · Included')).toBeInTheDocument();
  expect(screen.getByText('Delivery · Not included').closest('li')).toHaveClass('border-l-2');
  expect(screen.getByText('Design: your studio')).toBeInTheDocument();
  expect(screen.getByText('Purchasing: you')).toBeInTheDocument();
  expect(screen.getByText('Installation · Included if conditions are met')).toBeInTheDocument();
  expect(screen.getByText('Installation: your general contractor')).toBeInTheDocument();
  expect(screen.queryByText(/Installation: none|design · none/)).not.toBeInTheDocument();
  expect(screen.getByText('Issued plan · Issued October 28, 2026')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Room plan PDF' })).toBeEnabled();
  for (const name of ['Accept', 'Accept with conditions', 'Return']) expect(screen.getByRole('button', { name, exact: true })).toBeEnabled();
  expect(document.body.textContent).not.toMatch(/sign(?:ature|ing)|e-sign/i);
});
it.each(['signer_optional', 'observer', 'future_role'])('keeps %s read only', (viewerRole) => {
  render(<ServiceAcceptanceReading request={request({ viewerRole: viewerRole as any })} reload={mockQuery.refetch} />);
  expect(screen.queryByRole('button', { name: 'Accept', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText(/What you’re accepting|You confirm the studio delivered/)).not.toBeInTheDocument();
  expect(screen.getByText(/This request records responses/)).toBeInTheDocument();
});
it.each(['withdrawn', 'superseded', 'closed'])('keeps %s request read only', (lifecycle) => {
  render(<ServiceAcceptanceReading request={request({ lifecycle: lifecycle as any })} reload={mockQuery.refetch} />);
  expect(screen.queryByRole('button', { name: 'Accept', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText(/Waiting for \d+ required responses/)).not.toBeInTheDocument();
});
it('requires conditions and confirmation then sends the exact presented snapshot', async () => {
  const shown = request();
  mockMutate.mockResolvedValue(receipt([{ signerId: 's2', slot: 'Partner' }], 'pending'));
  render(<ServiceAcceptanceReading request={shown} reload={mockQuery.refetch} />);
  click('Accept with conditions');
  expect(screen.getByRole('button', { name: 'Review response' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Condition 1'), { target: { value: ' Finish trim ' } });
  click('Review response');
  expect(mockMutate).not.toHaveBeenCalled();
  click('Confirm response');
  await waitFor(() => expect(screen.getByText('Your response is recorded')).toBeInTheDocument());
  expect(mockMutate).toHaveBeenCalledWith({ request: shown, response: 'accept_with_conditions', conditions: [{ text: 'Finish trim' }], returnReason: '' });
  expect(screen.getByText('Accept with conditions · Authenticated portal response')).toBeInTheDocument();
});
it('requires return reason and does not confirm delivery on return', async () => {
  mockMutate.mockResolvedValue(receipt([], 'returned'));
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
  mockMutate.mockRejectedValueOnce({ code: '42501' }).mockResolvedValueOnce(receipt([], 'returned'));
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  click('Return'); fireEvent.change(screen.getByLabelText('Reason for returning'), { target: { value: 'Keep my words' } }); click('Review response'); click('Confirm response');
  expect(await screen.findByRole('status')).toHaveTextContent("Responses are paused for now. Nothing you've seen is lost.");
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
  render(<ServiceAcceptanceReading request={request({ signers: [{ signerId: 's1', slot: 'Client', required: true, response: own }, { signerId: 's2', slot: 'Partner', required: true, response: { ...own, method: 'paper_intake' } }] })} reload={mockQuery.refetch} />);
  expect(within(screen.getByRole('region', { name: 'Your recorded response' })).getByText('Accept · Authenticated iOS response')).toBeInTheDocument();
  expect(screen.getByText('Accept · Reviewed paper response')).toBeInTheDocument();
  expect(screen.getByText('Issued room plan')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Accept', exact: true })).not.toBeInTheDocument();
});
it('discovers only required unanswered sent requests in the current house', () => {
  mockQuery.data = [request(), request({ requestId: 'other', projectId: 'p2' }), request({ requestId: 'optional', viewerRole: 'signer_optional' }), request({ requestId: 'observer', viewerRole: 'observer' }), request({ requestId: 'withdrawn', lifecycle: 'withdrawn' })];
  render(<ServiceAcceptanceDoor projectId="p1" />);
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('link')).toHaveAttribute('href', '/acceptance/r1');
});
it('labels allowed product facts and pairs dimension values with their unit', () => {
  mockEvidenceQuery = { ...mockEvidenceQuery, data: { ...evidence, evidence: { ...evidence.evidence,
    members: [{ ...evidence.evidence.members[0], kind: 'product_configuration', content: {
      productName: 'Dining table', dimensions: { width: 81.25, unit: 'in' }, leadTimeWeeks: 8,
    } }] } } };
  render(<ServiceAcceptanceReading request={request({ lifecycle: 'closed', aggregateOutcome: 'accepted' })} reload={mockQuery.refetch} />);
  expect(screen.getByText('Request 4 · Closed · Accepted')).toBeInTheDocument();
  expect(screen.getByText('Furniture')).toBeInTheDocument();
  expect(screen.getByText('81.25 in')).toBeInTheDocument();
  expect(screen.queryByText('Unit')).not.toBeInTheDocument();
});
it('opens a blank document window in the click gesture before signing, then navigates it', async () => {
  let finishSigning!: (url: string) => void;
  mockSignedUrl.mockImplementation(() => new Promise<string>((resolve) => { finishSigning = resolve; }));
  const popup = { opener: {} as Window | null, close: jest.fn(), location: { replace: jest.fn() } };
  const open = jest.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  click('Room plan PDF');
  expect(open).toHaveBeenCalledWith('about:blank', '_blank');
  expect(popup.opener).toBeNull();
  expect(popup.location.replace).not.toHaveBeenCalled();
  expect(mockSignedUrl).toHaveBeenCalledWith('plans/room.pdf');
  finishSigning('https://signed.example/room.pdf');
  await waitFor(() => expect(popup.location.replace).toHaveBeenCalledWith('https://signed.example/room.pdf'));
});
it('offers a signed link if the document window is blocked', async () => {
  jest.spyOn(window, 'open').mockReturnValue(null);
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  click('Room plan PDF');
  const link = await screen.findByRole('link', { name: 'Open Room plan PDF in a new tab' });
  expect(link).toHaveAttribute('href', 'https://signed.example/room.pdf');
  expect(link).toHaveAttribute('target', '_blank');
});
it('keeps response controls off until matching evidence loads and retries a failed read', () => {
  mockEvidenceQuery = { data: undefined, isSuccess: false, isError: false, refetch: jest.fn().mockResolvedValue({ data: undefined }) };
  const { rerender } = render(<ServiceAcceptancePage requestId="r1" />);
  expect(screen.getByRole('button', { name: 'Accept', exact: true })).toBeDisabled();
  mockEvidenceQuery = { ...mockEvidenceQuery, isError: true };
  rerender(<ServiceAcceptancePage requestId="r1" />);
  expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load the agreed scope and evidence');
  click('Try again');
  expect(mockEvidenceQuery.refetch).toHaveBeenCalledTimes(1);
  mockEvidenceQuery = { ...mockEvidenceQuery, data: { ...evidence, scope: { ...evidence.scope, contentHash: 'changed' } }, isSuccess: true, isError: false };
  rerender(<ServiceAcceptancePage requestId="r1" />);
  expect(screen.getByRole('button', { name: 'Accept', exact: true })).toBeDisabled();
  mockEvidenceQuery = { ...mockEvidenceQuery, data: evidence };
  rerender(<ServiceAcceptancePage requestId="r1" />);
  expect(screen.getByRole('button', { name: 'Accept', exact: true })).toBeEnabled();
});
it.each([
  ['request', { ...evidence, requestId: 'other' }],
  ['edition', { ...evidence, scope: { ...evidence.scope, editionId: 'other' } }],
  ['request number', { ...evidence, requestNumber: 5 }],
  ['manifest hash', { ...evidence, evidence: { ...evidence.evidence, manifestHash: 'different' } }],
])('holds controls when evidence has a different %s', (_name, data) => {
  mockEvidenceQuery = { data, isError: false, isSuccess: true, refetch: jest.fn() };
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  expect(screen.getByRole('button', { name: 'Accept', exact: true })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('This request changed');
  click('Reload request');
  expect(mockQuery.refetch).toHaveBeenCalledTimes(1);
});
it('keeps a matching snapshot and draft usable when background refresh fails', () => {
  mockEvidenceQuery = { data: evidence, isError: true, isSuccess: false, refetch: jest.fn() };
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  expect(screen.getByText('Issued room plan')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Couldn’t refresh');
  expect(screen.getByRole('button', { name: 'Accept', exact: true })).toBeEnabled();
  click('Accept'); click('Review response');
  expect(screen.getByRole('button', { name: 'Confirm response' })).toBeEnabled();
});
it('focuses the scope heading after a successful evidence retry', async () => {
  mockEvidenceQuery = { data: undefined, isError: true, isSuccess: false, refetch: jest.fn().mockResolvedValue({ data: evidence }) };
  const { rerender } = render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  const fieldset = screen.getByRole('group', { name: 'How would you like to respond?' });
  expect(fieldset).toHaveAttribute('aria-describedby', screen.getByRole('alert').id);
  click('Try again');
  await waitFor(() => expect(mockEvidenceQuery.refetch).toHaveBeenCalledTimes(1));
  mockEvidenceQuery = { ...mockEvidenceQuery, data: evidence, isError: false, isSuccess: true };
  rerender(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Agreed scope' })).toHaveFocus());
  expect(fieldset).not.toHaveAttribute('aria-describedby');
});
it('keeps the door invisible during an initial pending read', () => {
  mockQuery = { data: undefined, isPending: true, isError: false, refetch: jest.fn() };
  render(<ServiceAcceptanceDoor projectId="p1" />);
  expect(screen.queryByText('Checking for acceptance requests…')).not.toBeInTheDocument();
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});
it('uses a read-only evidence error without response language for observers', () => {
  mockEvidenceQuery = { data: undefined, isError: true, isSuccess: false, refetch: jest.fn() };
  render(<ServiceAcceptanceReading request={request({ viewerRole: 'observer' })} reload={mockQuery.refetch} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load the agreed scope and evidence.');
  expect(screen.getByRole('alert')).not.toHaveTextContent('Your response is unavailable');
});
it('shows the entrance read error even without cached requests and offers retry', () => {
  mockQuery = { data: undefined, isPending: false, isError: true, refetch: jest.fn() };
  render(<ServiceAcceptanceDoor projectId="p1" />);
  expect(screen.getByRole('status')).toHaveTextContent('Couldn’t load acceptance requests');
  click('Try again');
  expect(mockQuery.refetch).toHaveBeenCalledTimes(1);
});

it('keeps cached actionable requests visible without a refresh error', () => {
  mockQuery = { data: [request()], isPending: false, isError: true, refetch: jest.fn() };
  render(<ServiceAcceptanceDoor projectId="p1" />);
  expect(screen.getByRole('link', { name: /Waiting for your acceptance/ })).toBeInTheDocument();
  expect(screen.queryByText(/could not be refreshed|Couldn’t load acceptance/)).not.toBeInTheDocument();
});
it('keeps a failed refresh over cached empty requests silent', () => {
  mockQuery = { data: [], isPending: false, isError: true, refetch: jest.fn() };
  render(<ServiceAcceptanceDoor projectId="p1" />);
  expect(screen.queryByText('Couldn’t load acceptance requests.')).not.toBeInTheDocument();
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});
it.each(['null', 'throws'])('closes a blank document window when signing %s', async (failure) => {
  const popup = { opener: null, close: jest.fn(), location: { replace: jest.fn() } };
  jest.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  if (failure === 'null') mockSignedUrl.mockResolvedValue(null);
  else mockSignedUrl.mockRejectedValue(new Error('offline'));
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  click('Room plan PDF');
  await waitFor(() => expect(popup.close).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t open this file');
});
it('isolates document errors per button and clears one after success', async () => {
  const popup = { opener: null, close: jest.fn(), location: { replace: jest.fn() } };
  jest.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  mockSignedUrl.mockRejectedValueOnce(new Error('offline')).mockResolvedValue('https://signed.example/room.pdf');
  const withDocuments = { ...evidence, evidence: { ...evidence.evidence, members: [{ ...evidence.evidence.members[0],
    documents: [...evidence.evidence.members[0].documents, { bucket: 'project-documents' as const, path: 'plans/second.pdf', title: 'Second PDF' }] }] } };
  mockEvidenceQuery = { ...mockEvidenceQuery, data: withDocuments };
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  click('Room plan PDF');
  await waitFor(() => expect(within(screen.getByRole('button', { name: 'Room plan PDF' }).closest('li')!).getByRole('alert')).toBeInTheDocument());
  expect(within(screen.getByRole('button', { name: 'Second PDF' }).closest('li')!).queryByRole('alert')).not.toBeInTheDocument();
  click('Room plan PDF');
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(popup.location.replace).toHaveBeenCalledWith('https://signed.example/room.pdf');
});
it('blocks an open confirmation if evidence changes before submit', () => {
  const { rerender } = render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  click('Accept'); click('Review response');
  mockEvidenceQuery = { ...mockEvidenceQuery, data: { ...evidence, requestNumber: 5 } };
  rerender(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  expect(screen.getByRole('button', { name: 'Confirm response' })).toBeDisabled();
  click('Confirm response');
  expect(mockMutate).not.toHaveBeenCalled();
});
it('shows no door refresh error when cached requests have no actionable request', () => {
  mockQuery = { data: [request({ viewerRole: 'observer' })], isPending: false, isError: true, refetch: jest.fn() };
  render(<ServiceAcceptanceDoor projectId="p1" />);
  expect(screen.queryByText(/refresh|load acceptance/i)).not.toBeInTheDocument();
});
it('maps each authoritative refusal to calm copy', () => {
  for (const message of ['permission denied for function respond_service_acceptance', 'scope_editions_inactive']) expect(acceptanceRefusal({ message })).toMatch(/paused/);
  for (const message of ['stale_scope', 'stale_signer_policy']) expect(acceptanceRefusal({ message })).toMatch(/request changed/);
  expect(acceptanceRefusal({ message: 'already_responded' })).toMatch(/already recorded/);
  expect(acceptanceRefusal({ message: 'request_not_open' })).toMatch(/no longer open/);
  expect(acceptanceRefusal({ message: 'signer_not_active' })).toMatch(/no longer asked/);
  expect(acceptanceRefusal({ code: '42501', message: 'insufficient_privilege' })).toMatch(/not authorized/);
  expect(acceptanceRefusal({ message: 'service_acceptance_response_invalid' })).toMatch(/Check your conditions/);
  expect(acceptanceRefusal(new Error('offline'))).toMatch(/words are kept/);
});

it('shows scope_editions_inactive as a paused status and retains the conditional answer', async () => {
  mockMutate.mockRejectedValue({ code: '55000', message: 'scope_editions_inactive' });
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  click('Accept with conditions');
  fireEvent.change(screen.getByLabelText('Condition 1'), { target: { value: 'Finish trim' } });
  click('Review response'); click('Confirm response');
  expect(await screen.findByRole('status')).toHaveTextContent('Responses are paused');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Condition 1')).toHaveValue('Finish trim');
});
it('mirrors condition count and text limits and allows removal', () => {
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  click('Accept with conditions');
  fireEvent.change(screen.getByLabelText('Condition 1'), { target: { value: 'x'.repeat(2001) } });
  expect(screen.getByRole('button', { name: 'Review response' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Condition 1'), { target: { value: '  ' + 'x'.repeat(2000) + '  ' } });
  expect(screen.getByRole('button', { name: 'Review response' })).toBeEnabled();
  for (let i=1; i<20; i++) click('Add condition');
  expect(screen.getAllByRole('textbox')).toHaveLength(20);
  expect(screen.getByRole('button', { name: 'Add condition' })).toBeDisabled();
  click('Remove condition 20');
  expect(screen.getAllByRole('textbox')).toHaveLength(19);
  for (let i=19; i>=1; i--) click('Remove condition ' + i);
  expect(screen.getByRole('button', { name: 'Review response' })).toBeDisabled();
  click('Add condition');
  expect(screen.getByLabelText('Condition 1')).toHaveValue('');
});
it('lets invalid conditions be corrected without reloading or losing words', async () => {
  mockMutate.mockRejectedValueOnce({ message: 'service_acceptance_response_invalid' }).mockResolvedValueOnce(receipt([], 'accepted_with_conditions'));
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  click('Accept with conditions');
  fireEvent.change(screen.getByLabelText('Condition 1'), { target: { value: 'Finish trim' } });
  click('Review response'); click('Confirm response');
  expect(await screen.findByRole('alert')).toHaveTextContent('Check your conditions');
  expect(screen.queryByRole('button', { name: 'Reload request' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Condition 1'), { target: { value: 'Finish trim carefully' } });
  click('Review response'); click('Confirm response');
  const recorded = await screen.findByRole('status', { name: 'Your recorded response' });
  expect(recorded).toHaveTextContent('Your response is recorded');
  expect(screen.queryByText(/Waiting for \d+ required responses/)).not.toBeInTheDocument();
});

it('blocks whitespace and permits exactly twenty nonempty conditions', () => {
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  click('Accept with conditions');
  fireEvent.change(screen.getByLabelText('Condition 1'), { target: { value: '   ' } });
  expect(screen.getByRole('button', { name: 'Review response' })).toBeDisabled();
  for (let i=1; i<20; i++) click('Add condition');
  for (let i=1; i<=20; i++) fireEvent.change(screen.getByLabelText('Condition ' + i), { target: { value: 'Condition ' + i } });
  expect(screen.getByRole('button', { name: 'Review response' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Add condition' })).toBeDisabled();
});
it('enforces the return reason length boundary', () => {
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  click('Return');
  for (const value of ['   ', 'x'.repeat(2001)]) {
    fireEvent.change(screen.getByLabelText('Reason for returning'), { target: { value } });
    expect(screen.getByRole('button', { name: 'Review response' })).toBeDisabled();
  }
  fireEvent.change(screen.getByLabelText('Reason for returning'), { target: { value: 'x'.repeat(2000) } });
  expect(screen.getByRole('button', { name: 'Review response' })).toBeEnabled();
});
it('shows a waiting count for remaining required signers after an own recorded response', () => {
  const own = { response: 'accept' as const, conditions: [], returnReason: null, respondedAt: 'today', method: 'portal_authenticated' as const };
  render(<ServiceAcceptanceReading request={request({ signers: [{ signerId: 's1', slot: 'Client', required: true, response: own }, { signerId: 's2', slot: 'Partner', required: true, response: null }] })} reload={mockQuery.refetch} />);
  expect(screen.getByText('Waiting for 1 required responses')).toBeInTheDocument();
});

it('does not wait for remaining signers after a terminal returned receipt', async () => {
  mockMutate.mockResolvedValue(receipt([{ signerId: 's2', slot: 'Partner' }], 'returned'));
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  click('Return');
  fireEvent.change(screen.getByLabelText('Reason for returning'), { target: { value: 'Work remains' } });
  click('Review response'); click('Confirm response');
  await screen.findByText('Your response is recorded');
  expect(screen.queryByText(/Waiting for .* required responses/)).not.toBeInTheDocument();
});
it('waits for remaining signers only while the receipt aggregate is pending', async () => {
  mockMutate.mockResolvedValue(receipt([{ signerId: 's2', slot: 'Partner' }], 'pending'));
  render(<ServiceAcceptanceReading request={request()} reload={mockQuery.refetch} />);
  click('Accept'); click('Review response'); click('Confirm response');
  await screen.findByText('Your response is recorded');
  expect(screen.getByText('Waiting for 1 required responses')).toBeInTheDocument();
});
