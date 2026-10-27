import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ReadyToSendSheet } from '../ready-to-send-sheet';

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('@/lib/analytics/document-events', () => ({ documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() } }));
jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => ({ value: false }) }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'designer' } }) }));
jest.mock('../../acts/act-viewer', () => ({ useActViewer: () => ({ ready: true, canSend: mockCanSend, recheck: async () => true }) }));
jest.mock('../../buying/draft-review', () => ({ DraftReview: () => null }));

let mockCanSend = true;
const mockSend = jest.fn();
const mockSave = jest.fn();
const draft = (over: Record<string, unknown> = {}) => ({
  id: 'draft', project_id: 'project', organization_id: 'studio', kind: 'invoice_reminder',
  recipient_kind: 'client', to_address: 'fictional@example.test', status: 'awaiting_review',
  ref_type: 'invoice', ref_id: 'invoice', body: 'Stored words', subject: 'Fictional invoice',
  channel: 'email', created_at: '2026-10-26T00:00:00Z', updated_at: '2026-10-26T00:00:00Z',
  claimed_at: null, last_send_outcome: null, delivered_at: null, ...over,
});
let mockDrafts = [draft()];
jest.mock('@patina/supabase', () => ({
  OPEN_PROCUREMENT_DRAFT_STATUSES: ['awaiting_review', 'sending'],
  useOrganizationMembers: () => ({ data: [], isSuccess: true }),
  useOutboundDrafts: () => ({ data: mockDrafts }), useProcurementDrafts: () => ({ data: [] }),
  useSendOutboundDrafts: () => ({ mutateAsync: mockSend }),
  useUpdateOutboundDraft: () => ({ mutateAsync: mockSave }),
  useDiscardOutboundDraft: () => ({ mutateAsync: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks(); mockCanSend = true; mockDrafts = [draft()];
  mockSave.mockResolvedValue({});
  mockSend.mockResolvedValue({ results: [{ id: 'draft', ok: true }] });
});

function openDraft() {
  render(<ReadyToSendSheet projectId="project" />);
  fireEvent.click(screen.getByRole('button', { name: /Invoice reminder/ }));
  return screen.getByTestId('outbound-draft-review');
}

it('visible unsaved text survives a parent rerender and revert and saves before Send', async () => {
  const review = openDraft();
  const body = within(review).getByRole('textbox', { name: 'Correspondence' });
  fireEvent.change(body, { target: { value: 'Reviewed B' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(body, { target: { value: 'Reviewed C' } });
  fireEvent.change(body, { target: { value: 'Reviewed B' } });
  expect(body).toHaveValue('Reviewed B');
  fireEvent.click(within(review).getByRole('button', { name: 'Send', exact: true }));
  await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
  expect(mockSave).toHaveBeenCalledWith({ id: 'draft', subject: 'Fictional invoice', body: 'Reviewed B' });
  expect(mockSave.mock.invocationCallOrder[0]).toBeLessThan(mockSend.mock.invocationCallOrder[0]);
});

it('collaborator can save retained words after reopening review', () => {
  mockCanSend = false;
  const review = openDraft();
  fireEvent.change(within(review).getByRole('textbox', { name: 'Correspondence' }), { target: { value: 'Collaborator B' } });
  expect(screen.getByRole('button', { name: /Save the draft for/ })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Invoice reminder/ }));
  fireEvent.click(screen.getByRole('button', { name: /Invoice reminder/ }));
  expect(screen.getByRole('textbox', { name: 'Correspondence' })).toHaveValue('Collaborator B');
  expect(screen.getByRole('button', { name: /Save the draft for/ })).toBeVisible();
});

it('unknown provider outcome keeps words and stable focus after claim refetch without resend', async () => {
  const view = render(<ReadyToSendSheet projectId="project" />);
  fireEvent.click(screen.getByRole('button', { name: /Invoice reminder/ }));
  const body = screen.getByRole('textbox', { name: 'Correspondence' });
  const send = screen.getByRole('button', { name: 'Send', exact: true });
  fireEvent.change(body, { target: { value: 'Held words' } });
  mockSend.mockResolvedValueOnce({ results: [{ id: 'draft', ok: false, error: 'send_outcome_unknown' }] });
  send.focus(); fireEvent.click(send);
  await waitFor(() => expect(screen.getByText('Held — check outcome')).toBeVisible());
  mockDrafts = [draft({ status: 'sending', last_send_outcome: 'unknown', body: 'Held words' })];
  view.rerender(<ReadyToSendSheet projectId="project" />);
  expect(document.activeElement).not.toBe(document.body);
  expect(screen.getByDisplayValue('Held words')).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Correspondence' })).toHaveAttribute('readonly');
  expect(screen.queryByRole('button', { name: /Send again|^Send$/ })).not.toBeInTheDocument();
  expect(mockSend).toHaveBeenCalledTimes(1);
});

it('confirmed delivery offers existing finalize hook once, even after an earlier held result', async () => {
  const view = render(<ReadyToSendSheet projectId="project" />);
  fireEvent.click(screen.getByRole('button', { name: /Invoice reminder/ }));
  mockSend.mockResolvedValueOnce({ results: [{ id: 'draft', ok: false, error: 'finalize_failed' }] });
  fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
  await waitFor(() => expect(screen.getByText('Held — check outcome')).toBeVisible());
  mockSend.mockClear();
  mockDrafts = [draft({ status: 'sending', delivered_at: '2026-10-26T01:00:00Z', last_send_outcome: 'delivered' })];
  view.rerender(<ReadyToSendSheet projectId="project" />);
  const finish = screen.getByRole('button', { name: 'Finish recording delivery' });
  fireEvent.click(finish); fireEvent.click(finish);
  await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
  expect(mockSend).toHaveBeenCalledWith(['draft']);
  expect(mockSave).not.toHaveBeenCalled();
});

it('unconfirmed delivery has no finalize or resend action', () => {
  mockDrafts = [draft({ status: 'sending', claimed_at: '2026-01-01T00:00:00Z', last_send_outcome: 'unknown' })];
  openDraft();
  expect(screen.queryByRole('button', { name: /Finish recording delivery|Send again|^Send$/ })).not.toBeInTheDocument();
  expect(mockSend).not.toHaveBeenCalled();
});

it('confirmed delivery still holds for a collaborator', () => {
  mockCanSend = false;
  mockDrafts = [draft({ status: 'sending', delivered_at: '2026-10-26T01:00:00Z' })];
  openDraft();
  expect(screen.queryByRole('button', { name: 'Finish recording delivery' })).not.toBeInTheDocument();
  expect(mockSend).not.toHaveBeenCalled();
});
