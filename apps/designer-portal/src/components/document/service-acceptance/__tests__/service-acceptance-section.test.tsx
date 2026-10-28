import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ServiceAcceptanceSection } from '../service-acceptance-section';

// Mocked hooks: the DB-backed walk is W6. The predicates are proven in the
// @patina/supabase vitest suite; here they follow the same token contract.
const mockRead = jest.fn();
const mockCreate = jest.fn();
const mockReview = jest.fn();
const mockUser = { id: 'owner-1' };
jest.mock('@patina/supabase', () => ({
  useServiceAcceptance: () => mockRead(),
  useScopeEditions: () => ({ data: [{ id: 'edition-1', status: 'active', editionNumber: 2 }], isPending: false }),
  useServiceAcceptanceManifests: () => ({
    data: [{ id: 'manifest-1', manifestHash: 'abcdef0123', createdAt: '2026-10-27T10:00:00Z' }], isPending: false,
  }),
  useCreateServiceAcceptanceRequest: () => ({ mutateAsync: mockCreate, isPending: false }),
  useWithdrawServiceAcceptanceRequest: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useReplaceServiceAcceptanceSigner: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRecordServiceAcceptancePaperIntake: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useReviewServiceAcceptancePaperIntake: () => ({ mutateAsync: mockReview, isPending: false }),
  useStampServiceAcceptancePaper: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProjectHousehold: () => ({ data: { household: { member_person_ids: [] } } }),
  useStudioContact: (id: string | null) => ({ data: id ? { full_name: 'Sam Rivera' } : undefined }),
  isServiceAcceptanceInactive: (error: { code?: string; message?: string }) =>
    /permission denied for function/.test(error?.message ?? '') || error?.message === 'scope_editions_inactive',
  serviceAcceptanceRefusal: (error: { message?: string }) =>
    /^[a-z_]+$/.test(error?.message ?? '') ? error.message : null,
}));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../outbound/ready-to-send-sheet', () => ({
  ReadyToSendSheet: ({ projectId }: { projectId: string }) => <div data-testid="ready-to-send">{projectId}</div>,
}));
jest.mock('../../overlays/doc-sheet', () => ({
  DocSheet: ({ open, title, children }: { open: boolean; title: string; children: ReactNode }) =>
    open ? <div role="dialog" aria-label={title}>{children}</div> : null,
}));

const signer = (over: Record<string, unknown> = {}) => ({
  signerId: 'signer-1', slot: 'client', required: true, profileId: 'client-1', householdPersonId: null,
  status: 'active', replacedBySignerId: null, replacementReason: null, replacedAt: null, response: null, ...over,
});
const intake = (over: Record<string, unknown> = {}) => ({
  intakeId: 'intake-1', signerId: 'signer-2', storageObjectId: 'object-1', documentSha256: null,
  paperSignedOn: '2026-10-26', signedName: 'Sam Rivera', disposition: 'accept', conditions: [], returnReason: null,
  presentedSignerPolicyRevision: 1, reviewState: 'pending_review', lapsedReason: null, recordedBy: 'owner-1',
  recordedAt: '2026-10-27T10:00:00Z', reviewedBy: null, reviewedAt: null, reviewNote: null, ...over,
});
const request = (over: Record<string, unknown> = {}) => ({
  requestId: 'request-2', projectId: 'job-1', requestNumber: 2, predecessorRequestId: 'request-1',
  scopeEditionId: 'edition-1', scopeContentHash: 'scope', evidenceManifestId: 'manifest-1', evidenceManifestHash: 'm',
  signerPolicyRevision: 1, lifecycle: 'draft', aggregateOutcome: 'pending', closedReason: null, closedAt: null,
  sentAt: null, supersededReason: null, supersededAt: null, withdrawnAt: null, withdrawReason: null,
  outboundDraftId: 'draft-2', createdAt: '2026-10-27T10:00:00Z', signers: [signer()], paperIntakes: [], ...over,
});
const readOf = (requests: unknown[]) => ({
  data: { projectId: 'job-1', capability: 'inactive', requests }, isPending: false, isError: false, refetch: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.id = 'owner-1';
});

test('create drafts a request and hands it to the existing ready-to-send sheet, never sending here', async () => {
  mockRead.mockReturnValue(readOf([]));
  mockCreate.mockImplementation(async () => {
    mockRead.mockReturnValue(readOf([request({ predecessorRequestId: null })]));
    return { requestId: 'request-2', lifecycle: 'draft', outboundDraftId: 'draft-2' };
  });
  const { rerender } = render(<ServiceAcceptanceSection projectId="job-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Draft the request' }));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ scopeEditionId: 'edition-1', evidenceManifestId: 'manifest-1' }));
  rerender(<ServiceAcceptanceSection projectId="job-1" />);
  expect(await screen.findByText('Request drafted. Review and send it when it reads right.')).toBeInTheDocument();
  const card = screen.getByText(/Request 2 · Drafted, not sent/).closest('li')!;
  expect(within(card).getByText('Drafted for your review. Nothing has been sent.')).toBeInTheDocument();
  const send = within(card).getByRole('button', { name: 'Review and send' });
  expect(send).toHaveAttribute('data-outbound-draft-id', 'draft-2');
  expect(screen.queryByTestId('ready-to-send')).toBeNull();
  fireEvent.click(send);
  expect(within(screen.getByRole('dialog', { name: 'Ready to send' })).getByTestId('ready-to-send')).toHaveTextContent('job-1');
});

test('a denied act while switched off reads as one calm note, and the record stays visible', async () => {
  mockRead.mockReturnValue(readOf([request({ lifecycle: 'closed', aggregateOutcome: 'accepted', outboundDraftId: null })]));
  mockCreate.mockRejectedValue({ code: '42501', message: 'permission denied for function create_service_acceptance_request' });
  render(<ServiceAcceptanceSection projectId="job-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Draft the request' }));
  const note = await screen.findByRole('status');
  expect(note).toHaveTextContent("Service acceptance isn't switched on for this studio yet.");
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText(/Request 2 · Closed · Accepted/)).toBeInTheDocument();
});

test('a real refusal is explained in plain words', async () => {
  mockRead.mockReturnValue(readOf([]));
  mockCreate.mockRejectedValue({ code: '23514', message: 'signer_policy_duplicate' });
  render(<ServiceAcceptanceSection projectId="job-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Draft the request' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The same person is named twice.');
});

test('the recorder of paper waits for a second reviewer and is not offered confirm', () => {
  mockRead.mockReturnValue(readOf([request({ lifecycle: 'sent', outboundDraftId: 'draft-2', sentAt: '2026-10-27T11:00:00Z',
    signers: [signer(), signer({ signerId: 'signer-2', slot: 'partner', profileId: null, householdPersonId: 'card-1' })],
    paperIntakes: [intake({ documentSha256: 'c'.repeat(64) })] })]));
  render(<ServiceAcceptanceSection projectId="job-1" />);
  const row = document.querySelector('[data-paper-intake="intake-1"]') as HTMLElement;
  expect(within(row).getByText('Waiting for a second reviewer.')).toBeInTheDocument();
  expect(within(row).queryByRole('button', { name: 'Confirm paper' })).toBeNull();
  expect(within(row).queryByRole('button', { name: 'Reject paper' })).toBeNull();
});

test('another owner sees the stamped hash prefix, and confirm stays disabled while unstamped', () => {
  mockUser.id = 'admin-2';
  mockRead.mockReturnValue(readOf([request({ lifecycle: 'sent', paperIntakes: [
    intake(), intake({ intakeId: 'intake-2', documentSha256: 'abcdef0123456789'.repeat(4) }),
  ] })]));
  render(<ServiceAcceptanceSection projectId="job-1" />);
  const unstamped = document.querySelector('[data-paper-intake="intake-1"]') as HTMLElement;
  expect(within(unstamped).getByText('The stored PDF is not stamped yet.')).toBeInTheDocument();
  expect(within(unstamped).getByRole('button', { name: 'Confirm paper' })).toBeDisabled();
  expect(within(unstamped).getByRole('button', { name: 'Reject paper' })).toBeEnabled();
  const stamped = document.querySelector('[data-paper-intake="intake-2"]') as HTMLElement;
  expect(within(stamped).getByText('Stored PDF stamped sha256 abcdef012345…')).toBeInTheDocument();
  const confirm = within(stamped).getByRole('button', { name: 'Confirm paper' });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  expect(mockReview).toHaveBeenCalledWith({
    intakeId: 'intake-2', decision: 'confirmed', expectedDocumentSha256: 'abcdef0123456789'.repeat(4), note: null,
  });
});

test('superseded and withdrawn history stays readable beside the current request', () => {
  mockRead.mockReturnValue(readOf([
    request({ requestId: 'request-1', requestNumber: 1, predecessorRequestId: null, lifecycle: 'superseded',
      supersededReason: 'successor_request', outboundDraftId: 'draft-1' }),
    request({ requestId: 'request-0', requestNumber: 3, predecessorRequestId: 'request-1', lifecycle: 'withdrawn',
      withdrawnAt: '2026-10-27T12:00:00Z', withdrawReason: 'Scope is changing', outboundDraftId: null }),
  ]));
  render(<ServiceAcceptanceSection projectId="job-1" />);
  expect(screen.getByText(/Request 1 · Replaced/)).toBeInTheDocument();
  expect(screen.getByText('Replaced because a newer request took its place.')).toBeInTheDocument();
  expect(screen.getByText('Follows request 1.')).toBeInTheDocument();
  expect(screen.getByText(/Withdrawn .*: Scope is changing\./)).toBeInTheDocument();
  // Closed history offers no acts.
  expect(screen.queryByRole('button', { name: 'Review and send' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Withdraw request/ })).toBeNull();
});

test('each response names its method, and click-through is never called a signature', () => {
  const response = (method: string, answer = 'accept') => ({
    responseId: `r-${method}`, response: answer, conditions: answer === 'accept_with_conditions'
      ? [{ conditionId: 'c-1', text: 'Keep the oak floor' }] : [],
    returnReason: null, method, respondedAt: '2026-10-27T12:00:00Z',
  });
  mockRead.mockReturnValue(readOf([request({ lifecycle: 'closed', aggregateOutcome: 'accepted_with_conditions', signers: [
    signer({ response: response('portal_authenticated') }),
    signer({ signerId: 's-2', slot: 'partner', response: response('ios_authenticated') }),
    signer({ signerId: 's-3', slot: 'co_client', profileId: null, householdPersonId: 'card-1', response: response('paper_intake') }),
    signer({ signerId: 's-4', slot: 'guest', required: false, response: response('portal_authenticated', 'accept_with_conditions') }),
  ] })]));
  const { container } = render(<ServiceAcceptanceSection projectId="job-1" />);
  expect(screen.getAllByText('Accepted online')).toHaveLength(1);
  expect(screen.getByText('Accepted on iOS')).toBeInTheDocument();
  expect(screen.getByText('Accepted on paper, reviewed')).toBeInTheDocument();
  expect(screen.getByText('Accepted with conditions online')).toBeInTheDocument();
  expect(screen.getByText('Keep the oak floor')).toBeInTheDocument();
  expect(screen.getByText(/Sam Rivera \(Co client\)/)).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/e-?signature|signed online|sign here/i);
});
