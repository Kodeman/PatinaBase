/**
 * C-28: the draft review — recipient visible, subject and body editable while
 * awaiting review, Send (saving an edit first) and Discard. Nothing sends
 * except through the Send click.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockUpdate = jest.fn();
const mockSend = jest.fn();
const mockDiscard = jest.fn();
const mockResend = jest.fn();
const mockDrafts: { data: Record<string, unknown>[] } = { data: [] };

jest.mock('@patina/supabase', () => ({
  OPEN_PROCUREMENT_DRAFT_STATUSES: ['awaiting_review', 'sending'],
  useUpdateProcurementDraft: () => ({ mutateAsync: mockUpdate, isPending: false }),
  useSendProcurementDraft: () => ({ mutateAsync: mockSend, isPending: false }),
  useDiscardProcurementDraft: () => ({ mutateAsync: mockDiscard, isPending: false }),
  useResendStalledProcurementDraft: () => ({ mutateAsync: mockResend, isPending: false }),
  useProcurementDrafts: () => ({ data: mockDrafts.data }),
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import { DraftReview, PurchaseOrderDrafts, type ReviewableDraft } from '../draft-review';
import { MOVEMENT_DRAFT_KINDS } from '../../line-unfold/movement-cell';

const DRAFT: ReviewableDraft = {
  id: 'draft-1',
  kind: 'ack_discrepancy_reply',
  status: 'awaiting_review',
  to_email: 'orders@hale.test',
  subject: 'PO 1042: acknowledgment differences',
  body: 'Hello,\n\nYour ack lists Walnut 04.\n\nThank you,\nLeah',
};

beforeEach(() => {
  mockUpdate.mockReset().mockResolvedValue({});
  mockSend.mockReset().mockResolvedValue({ draftId: 'draft-1', messageId: 'msg-1' });
  mockDiscard.mockReset().mockResolvedValue({});
  mockResend.mockReset().mockResolvedValue({ draftId: 'draft-1', messageId: 'msg-2' });
  mockDrafts.data = [];
});

describe('DraftReview', () => {
  it('shows the recipient and the editable subject and body', () => {
    render(<DraftReview draft={DRAFT} />);
    expect(screen.getByTestId('draft-recipient')).toHaveTextContent('To orders@hale.test');
    expect(screen.getByLabelText('Subject')).toHaveValue(DRAFT.subject);
    expect(screen.getByLabelText('Letter')).toHaveValue(DRAFT.body);
    expect(screen.getByText('Reply to the maker')).toBeInTheDocument();
  });

  it('sends the stored draft by id without an update when nothing was edited', async () => {
    render(<DraftReview draft={DRAFT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('draft-1'));
    expect(mockUpdate).not.toHaveBeenCalled();
    await screen.findByText('Sent to orders@hale.test.');
  });

  it('saves an edit, then sends', async () => {
    render(<DraftReview draft={DRAFT} />);
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: '  PO 1042: please confirm  ' } });
    fireEvent.change(screen.getByLabelText('Letter'), { target: { value: 'Please confirm 07 Smoke.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('draft-1'));
    expect(mockUpdate).toHaveBeenCalledWith({
      draftId: 'draft-1',
      request: { subject: 'PO 1042: please confirm', body: 'Please confirm 07 Smoke.' },
    });
    expect(mockUpdate.mock.invocationCallOrder[0]).toBeLessThan(mockSend.mock.invocationCallOrder[0]);
  });

  it('does not send when the edit fails to save, and says why', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('subject is 1–300 characters'));
    render(<DraftReview draft={DRAFT} />);
    fireEvent.change(screen.getByLabelText('Letter'), { target: { value: 'Edited.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('subject is 1–300 characters');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('discards by id', async () => {
    render(<DraftReview draft={DRAFT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(mockDiscard).toHaveBeenCalledWith('draft-1'));
    expect(mockSend).not.toHaveBeenCalled();
    await screen.findByText('Discarded.');
  });

  it('cannot send without a recipient', () => {
    render(<DraftReview draft={{ ...DRAFT, to_email: null }} />);
    expect(screen.getByTestId('draft-recipient')).toHaveTextContent('no address on file');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('is read-only once sent', () => {
    render(<DraftReview draft={{ ...DRAFT, status: 'sent' }} />);
    expect(screen.queryByLabelText('Subject')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Sent to orders@hale.test.');
  });

  it('offers no send while another send has claimed it', () => {
    const claimedAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    render(<DraftReview draft={{ ...DRAFT, status: 'sending', updated_at: claimedAt }} />);
    expect(screen.queryByLabelText('Subject')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send again' })).toBeNull();
    const time = new Date(claimedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    expect(screen.getByRole('status')).toHaveTextContent(/^Sending since /);
    expect(screen.getByRole('status')).toHaveTextContent(`${time}.`);
  });

  it('offers Send again once the send has stalled, and reads sent after it', async () => {
    const claimedAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    render(<DraftReview draft={{ ...DRAFT, status: 'sending', updated_at: claimedAt }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Sending since /);
    fireEvent.click(screen.getByRole('button', { name: 'Send again' }));
    await waitFor(() => expect(mockResend).toHaveBeenCalledWith('draft-1'));
    expect(mockSend).not.toHaveBeenCalled();
    await screen.findByText('Sent to orders@hale.test.');
    expect(screen.queryByRole('button', { name: 'Send again' })).toBeNull();
  });

  it('says why when sending again fails', async () => {
    mockResend.mockRejectedValueOnce(new Error('The provider refused the message.'));
    const claimedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    render(<DraftReview draft={{ ...DRAFT, status: 'sending', updated_at: claimedAt }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send again' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The provider refused the message.');
  });
});

describe('PurchaseOrderDrafts', () => {
  it("renders only this PO's drafts of the cell's kinds", () => {
    mockDrafts.data = [
      { ...DRAFT, purchase_order_id: 'po-1' },
      { ...DRAFT, id: 'draft-2', kind: 'receiver_inbound_notice', purchase_order_id: 'po-1' },
      { ...DRAFT, id: 'draft-3', purchase_order_id: 'po-2' },
    ];
    render(
      <PurchaseOrderDrafts projectId="project-1" purchaseOrderId="po-1" kinds={['ack_discrepancy_reply']} />,
    );
    expect(screen.getAllByTestId('draft-review')).toHaveLength(1);
    expect(screen.getByText('Reply to the maker')).toBeInTheDocument();
  });

  it("R37: the Movement cell's PO lists the held arrival date request, and a member sends it", async () => {
    const ask = {
      ...DRAFT,
      id: 'draft-eta',
      kind: 'maker_eta_request',
      purchase_order_id: 'po-1',
      to_email: 'orders@woodward.test',
      subject: 'Arrival date: Library ladder and rail · PO WS-214',
    };
    mockDrafts.data = [ask, { ...ask, id: 'draft-other-po', purchase_order_id: 'po-2' }];
    render(
      <PurchaseOrderDrafts projectId="project-1" purchaseOrderId="po-1" kinds={MOVEMENT_DRAFT_KINDS} />,
    );
    expect(screen.getAllByTestId('draft-review')).toHaveLength(1);
    expect(
      screen.getByRole('region', { name: 'Arrival date request to the maker, drafted' }),
    ).toBeInTheDocument();
    expect(mockSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('draft-eta'));
  });
});
