import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ServiceAcceptanceSection } from '../service-acceptance-section';

// Mocked hooks: the DB-backed walk is W6. The predicates are proven in the
// @patina/supabase vitest suite; here they follow the same token contract.
const mockRead = jest.fn();
const mockCreate = jest.fn();
const mockReview = jest.fn();
const mockRecord = jest.fn();
const mockEditions = jest.fn();
const mockManifests = jest.fn();
const mockPaper = jest.fn();
const mockDrafts = jest.fn();
const mockPresent = jest.fn();
const mockUser = { id: 'owner-1' };
jest.mock('@patina/supabase', () => ({
  useServiceAcceptance: () => mockRead(),
  useOutboundDrafts: (options: unknown) => mockDrafts(options),
  useScopeEditions: () => mockEditions(),
  useServiceAcceptanceManifests: () => mockManifests(),
  useCreateServiceAcceptanceRequest: () => ({ mutateAsync: mockCreate, isPending: false }),
  useWithdrawServiceAcceptanceRequest: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePresentServiceAcceptanceOffline: () => ({ mutateAsync: mockPresent, isPending: false }),
  useReplaceServiceAcceptanceSigner: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRecordServiceAcceptancePaperIntake: () => ({ mutateAsync: mockRecord, isPending: false }),
  useReviewServiceAcceptancePaperIntake: () => ({ mutateAsync: mockReview, isPending: false }),
  useStampServiceAcceptancePaper: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useServiceAcceptancePaperDocument: (_projectId: string, intake: unknown, enabled: boolean) => mockPaper(intake, enabled),
  normalizePaperCode: (value: string) => {
    const code = value.replace(/\s+/g, '').toLowerCase();
    return /^[0-9a-f]{64}$/.test(code) ? code : null;
  },
  useProjectHousehold: () => ({ data: { household: { member_person_ids: [] } } }),
  useStudioContact: (id: string | null) => ({ data: id ? { full_name: 'Sam Rivera' } : undefined }),
  isServiceAcceptanceInactive: (error: { code?: string; message?: string }) =>
    /permission denied for function/.test(error?.message ?? '') || error?.message === 'scope_editions_inactive',
  serviceAcceptanceRefusal: (error: { message?: string }) =>
    /^[a-z_]+$/.test(error?.message ?? '') ? error.message : null,
}));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../outbound/ready-to-send-sheet', () => ({
  // The sheet's own open-state set, not a copy.
  OPEN_STATUSES: jest.requireActual('../../outbound/ready-to-send-sheet').OPEN_STATUSES,
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
  offlinePresentedAt: null, offlinePresentedBy: null, outboundDraftId: 'draft-2', createdAt: '2026-10-27T10:00:00Z', signers: [signer()], paperIntakes: [], ...over,
});
const readOf = (requests: unknown[]) => ({
  data: { projectId: 'job-1', capability: 'inactive', requests }, isPending: false, isError: false, refetch: jest.fn(),
});

const SCOPE = 'a'.repeat(64);
const EVIDENCE = 'b'.repeat(64);
const STAMP = 'abcdef0123456789'.repeat(4);
const sentRequest = (over: Record<string, unknown> = {}) => request({
  lifecycle: 'sent', sentAt: '2026-10-27T11:00:00Z', scopeContentHash: SCOPE, evidenceManifestHash: EVIDENCE, ...over,
});
const settled = (data: unknown) => ({ data, isPending: false, isError: false, refetch: jest.fn() });

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.id = 'owner-1';
  mockEditions.mockReturnValue(settled([{ id: 'edition-1', status: 'active', editionNumber: 2 }]));
  mockDrafts.mockReturnValue({ data: undefined });
  mockManifests.mockReturnValue(settled([{ id: 'manifest-1', manifestHash: 'abcdef0123', createdAt: '2026-10-27T10:00:00Z' }]));
  mockPaper.mockImplementation((_intake: unknown, enabled: boolean) => (enabled
    ? settled({ url: 'http://127.0.0.1:54321/storage/v1/object/sign/paper', sha256: STAMP, matchesStamp: true })
    : { data: undefined, isPending: true, isError: false, refetch: jest.fn() }));
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
  mockRead.mockReturnValue(readOf([sentRequest({ paperIntakes: [
    intake(), intake({ intakeId: 'intake-2', documentSha256: STAMP }),
  ] })]));
  render(<ServiceAcceptanceSection projectId="job-1" />);
  const unstamped = document.querySelector('[data-paper-intake="intake-1"]') as HTMLElement;
  expect(within(unstamped).getByText('The stored PDF is not stamped yet.')).toBeInTheDocument();
  fireEvent.click(within(unstamped).getByRole('button', { name: 'View the stored paper' }));
  expect(within(unstamped).getByRole('button', { name: 'Confirm paper' })).toBeDisabled();
  expect(within(unstamped).getByRole('button', { name: 'Reject paper' })).toBeEnabled();
  const stamped = document.querySelector('[data-paper-intake="intake-2"]') as HTMLElement;
  expect(within(stamped).getByText('Stored PDF stamped sha256 abcdef012345…')).toBeInTheDocument();
  fireEvent.click(within(stamped).getByRole('button', { name: 'View the stored paper' }));
  const confirm = within(stamped).getByRole('button', { name: 'Confirm paper' });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  expect(mockReview).toHaveBeenCalledWith({
    intakeId: 'intake-2', decision: 'confirmed', expectedDocumentSha256: STAMP, note: null,
  });
});

test('the reviewer sees the exact stored PDF beside the transcription before Confirm opens', () => {
  mockUser.id = 'admin-2';
  mockRead.mockReturnValue(readOf([sentRequest({ paperIntakes: [intake({ signerId: 'signer-1', documentSha256: STAMP })] })]));
  render(<ServiceAcceptanceSection projectId="job-1" />);
  const row = document.querySelector('[data-paper-intake="intake-1"]') as HTMLElement;
  const binding = within(row).getByLabelText('Recorded as printed on the paper');
  expect(binding).toHaveTextContent(SCOPE);
  expect(binding).toHaveTextContent(EVIDENCE);
  // Stamped, but the paper is not in front of the reviewer yet.
  expect(within(row).getByRole('button', { name: 'Confirm paper' })).toBeDisabled();
  expect(row.querySelector('iframe')).toBeNull();
  expect(mockPaper).toHaveBeenLastCalledWith(expect.objectContaining({ storageObjectId: 'object-1' }), false);
  fireEvent.click(within(row).getByRole('button', { name: 'View the stored paper' }));
  expect(mockPaper).toHaveBeenLastCalledWith(expect.objectContaining({ storageObjectId: 'object-1' }), true);
  const frame = within(row).getByTitle('Stored paper for Client');
  expect(frame).toHaveAttribute('src', 'http://127.0.0.1:54321/storage/v1/object/sign/paper');
  expect(within(row).getByRole('button', { name: 'Confirm paper' })).toBeEnabled();
});

test('a stored file that no longer matches its stamp keeps Confirm closed', () => {
  mockUser.id = 'admin-2';
  mockPaper.mockReturnValue(settled({ url: 'u', sha256: 'f'.repeat(64), matchesStamp: false }));
  mockRead.mockReturnValue(readOf([sentRequest({ paperIntakes: [intake({ documentSha256: STAMP })] })]));
  render(<ServiceAcceptanceSection projectId="job-1" />);
  const row = document.querySelector('[data-paper-intake="intake-1"]') as HTMLElement;
  fireEvent.click(within(row).getByRole('button', { name: 'View the stored paper' }));
  expect(within(row).getByRole('alert')).toHaveTextContent('The stored file does not match its stamp.');
  expect(row.querySelector('iframe')).toBeNull();
  expect(within(row).getByRole('button', { name: 'Confirm paper' })).toBeDisabled();
});

test('reject needs a note, and a server review refusal is explained as that validation', async () => {
  mockUser.id = 'admin-2';
  mockRead.mockReturnValue(readOf([sentRequest({ paperIntakes: [intake()] })]));
  render(<ServiceAcceptanceSection projectId="job-1" />);
  const row = document.querySelector('[data-paper-intake="intake-1"]') as HTMLElement;
  expect(within(row).getByLabelText('Review note (required to reject)')).toBeInTheDocument();
  fireEvent.click(within(row).getByRole('button', { name: 'Reject paper' }));
  expect(within(row).getByRole('alert')).toHaveTextContent('Say why the paper is rejected');
  expect(mockReview).not.toHaveBeenCalled();
  mockReview.mockRejectedValueOnce({ code: '23514', message: 'service_acceptance_review_invalid' });
  fireEvent.change(within(row).getByLabelText('Review note (required to reject)'), { target: { value: 'Wrong version' } });
  fireEvent.click(within(row).getByRole('button', { name: 'Reject paper' }));
  await waitFor(() => expect(mockReview).toHaveBeenCalledWith({
    intakeId: 'intake-1', decision: 'rejected', expectedDocumentSha256: null, note: 'Wrong version',
  }));
  const alert = await within(row).findByRole('alert');
  expect(alert).toHaveTextContent('A rejection needs a note saying why');
  expect(alert).not.toHaveTextContent(/cannot be reviewed by you/);
});

test('paper is recorded with the binding typed from the paper, never the request on screen', async () => {
  mockRead.mockReturnValue(readOf([sentRequest()]));
  mockRecord.mockRejectedValueOnce({ code: '40001', message: 'stale_scope' });
  render(<ServiceAcceptanceSection projectId="job-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Record paper' }));
  const form = screen.getByRole('form', { name: 'Record paper for Client' });
  const scope = within(form).getByLabelText('Scope code (full)');
  const evidence = within(form).getByLabelText('Evidence code (full)');
  const number = within(form).getByLabelText('Request number');
  const revision = within(form).getByLabelText('Signer revision');
  // Nothing is prefilled from the request.
  for (const input of [scope, evidence, number, revision]) expect(input).toHaveValue('');
  const file = new File(['%PDF-1.7'], 'paper.pdf', { type: 'application/pdf' });
  fireEvent.change(within(form).getByLabelText('PDF of the paper (up to 20 MiB)'), { target: { files: [file] } });
  fireEvent.change(within(form).getByLabelText('Date on the paper'), { target: { value: '2026-10-26' } });
  fireEvent.change(within(form).getByLabelText('Name written on the paper'), { target: { value: 'Sam Rivera' } });
  fireEvent.change(number, { target: { value: '1' } });
  fireEvent.change(revision, { target: { value: '1' } });
  fireEvent.change(scope, { target: { value: 'abcdef01' } });
  fireEvent.change(evidence, { target: { value: EVIDENCE } });
  fireEvent.click(within(form).getByRole('button', { name: 'Record paper' }));
  expect(within(form).getByRole('alert')).toHaveTextContent('not the short form');
  expect(mockRecord).not.toHaveBeenCalled();
  const older = 'C'.repeat(64);
  fireEvent.change(scope, { target: { value: older } });
  fireEvent.click(within(form).getByRole('button', { name: 'Record paper' }));
  await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
  expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({
    requestId: 'request-2', signerId: 'signer-1', file,
    presented: { requestNumber: 1, scopeContentHash: older.toLowerCase(), evidenceManifestHash: EVIDENCE,
      signerPolicyRevision: 1 },
  }));
  expect(await within(form).findByRole('alert')).toHaveTextContent(
    "The paper doesn't match this request. Check the request number and codes printed on it.");
});

test('a draft offers no paper intake, but its signers can still be replaced', () => {
  mockRead.mockReturnValue(readOf([request()]));
  render(<ServiceAcceptanceSection projectId="job-1" />);
  const card = screen.getByText(/Request 2 · Drafted, not sent/).closest('li')!;
  expect(within(card).queryByRole('button', { name: 'Record paper' })).toBeNull();
  expect(within(card).getByRole('button', { name: 'Replace this person' })).toBeInTheDocument();
});

test('a signer who has answered an open request can still be replaced, but takes no more paper', () => {
  const answered = { responseId: 'r-1', response: 'accept', conditions: [], returnReason: null,
    method: 'portal_authenticated', respondedAt: '2026-10-27T12:00:00Z' };
  mockRead.mockReturnValue(readOf([sentRequest({ signers: [
    signer({ response: answered }),
    signer({ signerId: 'signer-2', slot: 'partner', profileId: null, householdPersonId: 'card-1' }),
  ] })]));
  render(<ServiceAcceptanceSection projectId="job-1" />);
  const rows = screen.getAllByRole('listitem').filter((row) => row.getAttribute('data-signer-status') === 'active');
  const [client, partner] = rows;
  expect(within(client).getByText('Accepted online')).toBeInTheDocument();
  expect(within(client).getByRole('button', { name: 'Replace this person' })).toBeInTheDocument();
  expect(within(client).queryByRole('button', { name: 'Record paper' })).toBeNull();
  expect(within(partner).getByRole('button', { name: 'Record paper' })).toBeInTheDocument();
  expect(within(partner).getByRole('button', { name: 'Replace this person' })).toBeInTheDocument();
});

test('a failed refresh keeps the cards and the work typed into them, with a retry beside them', () => {
  const read = readOf([sentRequest()]);
  mockRead.mockReturnValue(read);
  const { rerender } = render(<ServiceAcceptanceSection projectId="job-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Replace this person' }));
  fireEvent.change(screen.getByLabelText('Reason for the change'), { target: { value: 'Partner travelling' } });
  const refetch = jest.fn();
  mockRead.mockReturnValue({ ...read, isError: true, refetch });
  rerender(<ServiceAcceptanceSection projectId="job-1" />);
  expect(screen.getByLabelText('Reason for the change')).toHaveValue('Partner travelling');
  expect(screen.getByText(/Request 2 · Sent to the client/)).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('could not be refreshed');
  fireEvent.click(screen.getByRole('button', { name: 'Retry service acceptance' }));
  expect(refetch).toHaveBeenCalled();
});

test('a failed scope or evidence read is offered as a retry, not reported as absent', () => {
  mockRead.mockReturnValue(readOf([]));
  const refetchScope = jest.fn();
  mockEditions.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch: refetchScope });
  const { rerender } = render(<ServiceAcceptanceSection projectId="job-1" />);
  expect(screen.getByRole('alert')).toHaveTextContent('The agreed scope could not be read.');
  expect(screen.queryByText(/No agreed scope edition is active/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry the agreed scope' }));
  expect(refetchScope).toHaveBeenCalled();

  mockEditions.mockReturnValue(settled([{ id: 'edition-1', status: 'active', editionNumber: 2 }]));
  const refetchEvidence = jest.fn();
  mockManifests.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch: refetchEvidence });
  rerender(<ServiceAcceptanceSection projectId="job-1" />);
  expect(screen.getByRole('alert')).toHaveTextContent('The evidence sets could not be read.');
  expect(screen.queryByText(/No service acceptance evidence set/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry the evidence sets' }));
  expect(refetchEvidence).toHaveBeenCalled();
});

// 00891: each required signer has its own notice draft on the request.
const notice = (over: Record<string, unknown> = {}) => ({
  id: 'draft-2', project_id: 'job-1', kind: 'service_acceptance_request', ref_type: 'service_acceptance_request',
  ref_id: 'request-2', status: 'awaiting_review', ...over,
});

test('a draft request names every signer notice waiting for review, read from the project drafts', () => {
  mockRead.mockReturnValue(readOf([request({ predecessorRequestId: null })]));
  mockDrafts.mockReturnValue({ data: [notice(), notice({ id: 'draft-3' }),
    notice({ id: 'other', ref_id: 'request-9' }), notice({ id: 'note', ref_type: 'site_request' })] });
  render(<ServiceAcceptanceSection projectId="job-1" />);
  expect(mockDrafts).toHaveBeenCalledWith({ projectId: 'job-1' });
  expect(screen.getByText('Drafted for 2 signers, for your review. Nothing has been sent.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review and send' }));
  expect(within(screen.getByRole('dialog', { name: 'Ready to send' })).getByTestId('ready-to-send')).toHaveTextContent('job-1');
});

test('a sent request keeps Review and send while another signer notice still waits, and drops it once all are sent', () => {
  mockRead.mockReturnValue(readOf([sentRequest({ predecessorRequestId: null })]));
  mockDrafts.mockReturnValue({ data: [notice({ status: 'sent' }), notice({ id: 'draft-3' })] });
  const { rerender } = render(<ServiceAcceptanceSection projectId="job-1" />);
  expect(screen.getByText('One signer’s notice is still waiting for your review.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review and send' }));
  expect(screen.getByRole('dialog', { name: 'Ready to send' })).toBeInTheDocument();

  mockDrafts.mockReturnValue({ data: [notice({ status: 'sent' }), notice({ id: 'draft-3', status: 'sent' })] });
  rerender(<ServiceAcceptanceSection projectId="job-1" />);
  expect(screen.queryByRole('button', { name: 'Review and send' })).toBeNull();
  expect(screen.queryByText(/still waiting for your review/)).toBeNull();
});

test('a delivered but unfinalized last notice keeps Review and send and the open sheet mounted', () => {
  mockRead.mockReturnValue(readOf([sentRequest({ predecessorRequestId: null })]));
  mockDrafts.mockReturnValue({ data: [notice({ status: 'sent' }), notice({ id: 'draft-3' })] });
  const { rerender } = render(<ServiceAcceptanceSection projectId="job-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Review and send' }));
  expect(screen.getByRole('dialog', { name: 'Ready to send' })).toBeInTheDocument();

  // The provider took draft-3 but its finalization failed: still sending, with
  // delivered_at and no after_send_done_at. The sheet keeps it open to retry.
  mockDrafts.mockReturnValue({ data: [notice({ status: 'sent' }), notice({ id: 'draft-3', status: 'sending',
    delivered_at: '2026-10-28T12:00:00Z', after_send_done_at: null })] });
  rerender(<ServiceAcceptanceSection projectId="job-1" />);
  expect(screen.getByRole('button', { name: 'Review and send' })).toBeInTheDocument();
  expect(within(screen.getByRole('dialog', { name: 'Ready to send' })).getByTestId('ready-to-send')).toHaveTextContent('job-1');
  // SQ-2351 R2: a notice already sending is not waiting for review.
  expect(screen.getByText('One signer’s notice is still being sent.')).toBeInTheDocument();
  expect(screen.queryByText(/waiting for your review/)).toBeNull();
});

test('a draft request whose notice is sending never says nothing has been sent (SQ-2351 R2)', () => {
  mockRead.mockReturnValue(readOf([request({ predecessorRequestId: null })]));
  mockDrafts.mockReturnValue({ data: [notice({ status: 'sending' }), notice({ id: 'draft-3' })] });
  render(<ServiceAcceptanceSection projectId="job-1" />);
  expect(screen.getByText('One signer’s notice is still waiting for your review. One signer’s notice is still being sent.'))
    .toBeInTheDocument();
  expect(screen.queryByText(/Nothing has been sent/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Review and send' })).toBeInTheDocument();
});

test('closed history offers no hand-off even if a signer notice was never sent', () => {
  mockRead.mockReturnValue(readOf([request({ lifecycle: 'closed', aggregateOutcome: 'accepted' })]));
  mockDrafts.mockReturnValue({ data: [notice()] });
  render(<ServiceAcceptanceSection projectId="job-1" />);
  expect(screen.queryByRole('button', { name: 'Review and send' })).toBeNull();
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

test('a draft is marked presented on paper only after a confirm, binding its hashes and sending nothing', async () => {
  mockRead.mockReturnValue(readOf([request({ scopeContentHash: SCOPE, evidenceManifestHash: EVIDENCE, outboundDraftId: null })]));
  mockPresent.mockResolvedValue({ requestId: 'request-2', lifecycle: 'sent', replayed: false });
  render(<ServiceAcceptanceSection projectId="job-1" />);
  const card = screen.getByText(/Request 2 · Drafted, not sent/).closest('li')!;
  fireEvent.click(within(card).getByRole('button', { name: 'Presented on paper' }));
  expect(mockPresent).not.toHaveBeenCalled();
  const confirm = within(card).getByRole('group', { name: 'Present request 2 on paper' });
  expect(confirm).toHaveTextContent('Nothing is emailed and no answer is recorded.');
  fireEvent.click(within(confirm).getByRole('button', { name: 'Mark presented' }));
  await waitFor(() => expect(mockPresent).toHaveBeenCalledWith({
    requestId: 'request-2', scopeContentHash: SCOPE, evidenceManifestHash: EVIDENCE,
  }));
  expect(screen.queryByTestId('ready-to-send')).toBeNull();
});

test('a request presented on paper says so instead of "Sent", and offers no second presentation', () => {
  mockRead.mockReturnValue(readOf([sentRequest({
    outboundDraftId: null, offlinePresentedAt: '2026-10-27T11:00:00Z', offlinePresentedBy: 'owner-1',
  })]));
  render(<ServiceAcceptanceSection projectId="job-1" />);
  const card = screen.getByText(/Request 2 · Sent to the client/).closest('li')!;
  expect(within(card).getByText(/^Presented on paper .+2026\.$/)).toBeInTheDocument();
  expect(within(card).queryByText(/^Sent /)).toBeNull();
  expect(within(card).queryByRole('button', { name: 'Presented on paper' })).toBeNull();
});

test('a seat without studio authority hears why it cannot present on paper', async () => {
  mockRead.mockReturnValue(readOf([request({ outboundDraftId: null })]));
  mockPresent.mockRejectedValue({ code: '42501', message: 'insufficient_privilege' });
  render(<ServiceAcceptanceSection projectId="job-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Presented on paper' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mark presented' }));
  expect(await screen.findByRole('alert'))
    .toHaveTextContent('Marking a request presented on paper needs an owner or admin of an active studio.');
});
