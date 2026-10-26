import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ReadyToSendSheet } from '../../outbound/ready-to-send-sheet';
import { ItemComposer } from '../item-composer';

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('@/lib/analytics/document-events', () => ({ documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() } }));
jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => ({ value: false }) }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'designer' } }) }));
jest.mock('../../acts/act-viewer', () => ({ useActViewer: () => ({ ready: true, canSend: true, recheck: async () => true }) }));
jest.mock('../../buying/draft-review', () => ({ DraftReview: () => null }));
jest.mock('../composer-option-builder', () => ({ ComposerOptionBuilder: () => null }));
jest.mock('../../roster/party-mini-row', () => ({ PartyMiniRow: () => null }));
jest.mock('../../roster/rolodex-picker', () => ({ RolodexPicker: () => null }));
jest.mock('@/components/portal/decision-option-builder', () => ({
  emptyOption: () => ({ id: 'option', name: '' }), optionToValue: (v: unknown) => v,
  optionValueToInput: (v: unknown) => v, useMaterializeDraftOptions: () => async (v: unknown) => v,
}));

const mockSend = jest.fn();
const mockSave = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockPublish = jest.fn();
const mockDelete = jest.fn();
const draft = (over: Record<string, unknown> = {}) => ({
  id: 'draft', project_id: 'project', organization_id: 'studio', kind: 'invoice_reminder',
  recipient_kind: 'client', to_address: 'fictional@example.test', status: 'awaiting_review',
  ref_type: 'invoice', ref_id: 'invoice', body: 'Stored words', subject: 'Fictional invoice',
  channel: 'email', created_at: '2026-10-26T00:00:00Z', updated_at: '2026-10-26T00:00:00Z',
  claimed_at: null, last_send_outcome: null, ...over,
});
let mockDrafts = [draft()];
jest.mock('@patina/supabase', () => ({
  OPEN_PROCUREMENT_DRAFT_STATUSES: ['awaiting_review', 'sending'],
  useOrganizationMembers: () => ({ data: [], isSuccess: true }),
  useOutboundDrafts: () => ({ data: mockDrafts }), useProcurementDrafts: () => ({ data: [] }),
  useSendOutboundDrafts: () => ({ mutateAsync: mockSend }),
  useUpdateOutboundDraft: () => ({ mutateAsync: mockSave }),
  useDiscardOutboundDraft: () => ({ mutateAsync: jest.fn() }),
  useCreateCoordinationItem: () => ({ mutateAsync: mockCreate }),
  useUpdateCoordinationItem: () => ({ mutateAsync: mockUpdate }),
  usePublishCoordinationItem: () => ({ mutateAsync: mockPublish }),
  useDeleteCoordinationItem: () => ({ mutateAsync: mockDelete }),
  isProjectArtifactApproval: () => false,
}));

beforeEach(() => {
  jest.clearAllMocks(); mockDrafts = [draft()];
  mockSave.mockResolvedValue({}); mockCreate.mockResolvedValue({ id: 'created' });
  mockSend.mockResolvedValue({ results: [{ id: 'draft', ok: true }] });
});

function openDraft() {
  render(<ReadyToSendSheet projectId="project" />);
  fireEvent.click(screen.getByRole('button', { name: /Invoice reminder/ }));
  return screen.getByTestId('outbound-draft-review');
}
function composer() {
  render(<ItemComposer projectId="project" designerClientId="engagement" tasks={[]} ffeItems={[]}
    phases={[]} parties={[]} initialTitle="Fictional choice" onClose={jest.fn()} onCreated={jest.fn()} />);
}

it('requires an explicit audience before either Save or Publish; Private writes zero coordination rows', async () => {
  composer();
  expect(screen.getByRole('radio', { name: 'Private — studio only' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'Shared — client and project parties' })).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save as draft', exact: true })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Publish', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Save as draft', exact: true }));
  fireEvent.click(screen.getByRole('radio', { name: 'Private — studio only' }));
  expect(screen.getByText(/Use the existing private note in the margin/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Publish', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save as draft', exact: true })).not.toBeInTheDocument();
  expect(mockCreate).not.toHaveBeenCalled(); expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockPublish).not.toHaveBeenCalled(); expect(mockDelete).not.toHaveBeenCalled();
});

it('truthfully includes saved drafts in Shared and saves only on the explicit action', async () => {
  composer();
  fireEvent.click(screen.getByRole('radio', { name: 'Shared — client and project parties' }));
  expect(screen.getByText(/The client and project parties can see this, including saved drafts/)).toBeVisible();
  expect(mockCreate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save as draft', exact: true }));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' })));
  expect(mockPublish).not.toHaveBeenCalled(); expect(mockSend).not.toHaveBeenCalled();
});

it.each([
  ['missing recipient', { to_address: '  ' }],
  ['unknown audience', { recipient_kind: 'everyone' }],
  ['client PO', { ref_type: 'purchase_order' }],
  ['unruled client subject', { ref_type: 'ffe_item' }],
  ['missing subject', { ref_type: '' }],
  ['unknown outcome', { last_send_outcome: 'unknown' }],
  ['rejected outcome', { last_send_outcome: 'rejected' }],
])('holds %s in both batch and individual Send', (_, over) => {
  mockDrafts = [draft(over)];
  const review = openDraft();
  expect(within(review).getByRole('button', { name: 'Send', exact: true })).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(within(review).getByRole('button', { name: 'Send', exact: true }));
  expect(screen.getByRole('checkbox')).toBeDisabled();
  expect(mockSend).not.toHaveBeenCalled();
});

it('does not offer a stalled unknown send for retry after a fresh mount', () => {
  mockDrafts = [draft({ status: 'sending', last_send_outcome: 'unknown', claimed_at: '2026-01-01T00:00:00Z' })];
  openDraft();
  expect(screen.queryByRole('button', { name: 'Send again' })).not.toBeInTheDocument();
  expect(mockSend).not.toHaveBeenCalled();
});

it.each(['failed', 'missing', 'duplicate', 'transport'])('holds a %s receipt, retains words and focus and never claims Sent', async (outcome) => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  if (outcome === 'transport') mockSend.mockRejectedValueOnce(new Error('offline'));
  else mockSend.mockResolvedValueOnce({ results: outcome === 'missing' ? [] : outcome === 'duplicate'
    ? [{ id: 'draft', ok: true }, { id: 'draft', ok: false }]
    : [{ id: 'draft', ok: false, error: 'provider refused' }] });
  const review = openDraft();
  const body = within(review).getByRole('textbox', { name: 'Correspondence' });
  fireEvent.change(body, { target: { value: 'Keep my typed words' } });
  const send = within(review).getByRole('button', { name: 'Send', exact: true });
  send.focus(); fireEvent.click(send);
  await waitFor(() => expect(send).toHaveAttribute('aria-disabled', 'true'));
  await waitFor(() => expect(screen.getByText('Held — check outcome')).toBeVisible());
  expect(body).toHaveValue('Keep my typed words'); expect(send).toHaveFocus();
  expect(screen.queryByText(/^Sent/)).not.toBeInTheDocument();
  fireEvent.click(send); expect(mockSend).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /Invoice reminder/ }));
  fireEvent.click(screen.getByRole('button', { name: /Invoice reminder/ }));
  expect(screen.getByRole('textbox', { name: 'Correspondence' })).toHaveValue('Keep my typed words');
  expect(mockSave).toHaveBeenCalledWith({ id: 'draft', subject: 'Fictional invoice', body: 'Keep my typed words' });
  log.mockRestore();
});

it('saves edited text first and marks Sent only for the matching confirmed receipt', async () => {
  const review = openDraft();
  expect(mockSend).not.toHaveBeenCalled();
  fireEvent.change(within(review).getByRole('textbox', { name: 'Correspondence' }), { target: { value: 'Reviewed text' } });
  fireEvent.click(within(review).getByRole('button', { name: 'Send', exact: true }));
  await waitFor(() => expect(screen.getByText('Sent to fictional@example.test.')).toBeVisible());
  expect(mockSave.mock.invocationCallOrder[0]).toBeLessThan(mockSend.mock.invocationCallOrder[0]);
  expect(mockSend).toHaveBeenCalledWith(['draft']);
});
