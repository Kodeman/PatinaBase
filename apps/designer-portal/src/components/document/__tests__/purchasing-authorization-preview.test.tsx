import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';

const mockSend = jest.fn();
const mockRetry = jest.fn();
const mockRefetch = jest.fn();
let mockRead: any;
let mockBudget: any;
const mockUnfold = jest.fn();
jest.mock('@/lib/document/document-index', () => ({ requestRegionUnfold: (...args: unknown[]) => mockUnfold(...args) }));
jest.mock('@/hooks/use-commercial-documents', () => ({
  useWorkingBudget: () => mockBudget,
  useFurnishingsAuthorizationPreview: () => mockRead,
  useSendFurnishingsAuthorization: () => ({ mutateAsync: mockSend, isPending: false }),
}));
jest.mock('@patina/supabase', () => ({
  useRetryProposalSend: () => ({ mutateAsync: mockRetry, isPending: false }),
}));
jest.mock('@/lib/analytics/document-events', () => ({ documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() } }));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
import { PurchasingAuthorizationPreviewSheet } from '../overlays/purchasing-authorization-preview-sheet';

const saved = (over: object = {}) => ({
  proposalId: 'saved-1', projectId: 'project-1', state: 'draft', title: 'Saved authorization', documentFingerprint: 'reviewed-v1',
  body: { items: [{ description: 'Frozen chair', quantity: 3, unit: 'each', roomName: 'Living', rooms: [], clientUnitPriceCents: 333, clientLineTotalCents: 1000, currency: 'USD', allowance: true }], totalAmountCents: 1000, depositPercent: 50 },
  ...over,
});
const props = { projectId: 'project-1', proposalId: 'saved-1', onClose: jest.fn() };
const sendButton = () => screen.getByRole('button', { name: 'Send to client' });
beforeEach(() => {
  jest.clearAllMocks();
  mockBudget = { data: { version: null, checkpoint: null }, isLoading: false, isFetching: false, error: null };
  mockRead = { data: saved(), isPending: false, isFetching: false, isError: false, refetch: mockRefetch };
  mockRefetch.mockResolvedValue({ isError: false });
  mockSend.mockResolvedValue({ sentAt: '2026-10-19', proposalSendDispatchId: 'dispatch-1', _emailDispatched: true, _emailDeliveryState: 'delivered' });
  mockRetry.mockResolvedValue({ _emailDispatched: true, _emailRetryable: false, _emailDeliveryState: 'delivered' });
});

describe('saved purchasing authorization preview', () => {
  it.each([
    ['missing', 'Set up a working budget'],
    ['unpublished', 'Review the working budget before publishing a first checkpoint'],
    ['awaiting', 'Waiting for the client to acknowledge the current published spending plan'],
    ['loading', 'Loading current budget status'],
    ['error', 'Current budget status could not be loaded'],
  ])('explains saved draft budget %s without changing the reviewed document', (state, text) => {
    if (state === 'unpublished') mockBudget.data.version = { id: 'budget-1' };
    if (state === 'awaiting') mockBudget.data = { version: { id: 'budget-1' }, checkpoint: { id: 'check-1', state: 'open' } };
    if (state === 'loading') mockBudget.isLoading = true;
    if (state === 'error') mockBudget.error = new Error('offline');
    render(<PurchasingAuthorizationPreviewSheet {...props} />);
    expect(screen.getAllByText(new RegExp(text))[0]).toBeVisible();
    expect(screen.getByText('Frozen chair')).toBeVisible();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it('leaves the saved preview for Working budget with durable destination focus and exact ID intact', async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return <><h2 id="money-region-heading" tabIndex={-1}>Working budget destination</h2><button onClick={() => setOpen(true)}>Reopen saved</button>{open && <PurchasingAuthorizationPreviewSheet {...props} onOpenWorkingBudget={() => setOpen(false)} />}</>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up a working budget' }));
    await waitFor(() => expect(screen.getByText('Working budget destination')).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockUnfold).toHaveBeenCalledWith('money');
    fireEvent.click(screen.getByRole('button', { name: 'Reopen saved' }));
    await act(async () => { fireEvent.click(sendButton()); });
    expect(mockSend).toHaveBeenCalledWith({ proposalId: 'saved-1', expectedFingerprint: 'reviewed-v1' });
    expect(mockRefetch).not.toHaveBeenCalled();
  });
  it('shows the frozen shared body and sends only its displayed identity and reviewed token on explicit Send', async () => {
    render(<PurchasingAuthorizationPreviewSheet {...props} />);
    expect(screen.getByText('Preview · Not sent')).toBeVisible();
    expect(screen.getByText('Frozen chair')).toBeVisible();
    expect(screen.getAllByText('$10').length).toBeGreaterThan(0);
    expect(mockSend).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(sendButton()); fireEvent.click(sendButton()); });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({ proposalId: 'saved-1', expectedFingerprint: 'reviewed-v1' });
    expect(screen.queryByRole('button', { name: 'Send to client' })).not.toBeInTheDocument();
    expect(screen.getByText(/email delivered/)).toBeVisible();
  });

  it.each(['loading', 'fetching', 'error', 'wrong document', 'wrong project', 'sent', 'voided'])('fails closed for %s without sending', (state) => {
    if (state === 'loading') mockRead.isPending = true;
    if (state === 'fetching') mockRead.isFetching = true;
    if (state === 'error') mockRead.isError = true;
    if (state === 'wrong document') mockRead.data = saved({ proposalId: 'other' });
    if (state === 'wrong project') mockRead.data = saved({ projectId: 'other' });
    if (state === 'sent' || state === 'voided') mockRead.data = saved({ state });
    render(<PurchasingAuthorizationPreviewSheet {...props} />);
    expect(sendButton()).toHaveAttribute('aria-disabled', 'true'); fireEvent.click(sendButton()); expect(mockSend).not.toHaveBeenCalled();
  });

  it.each(['loading', 'error', 'sent', 'executed', 'voided', 'declined', 'expired'])('labels persisted %s state without claiming an unsent draft', (state) => {
    if (state === 'loading') mockRead.isPending = true;
    else if (state === 'error') mockRead.isError = true;
    else mockRead.data = saved({ state });
    render(<PurchasingAuthorizationPreviewSheet {...props} />);
    expect(screen.queryByText('Preview · Not sent')).not.toBeInTheDocument();
    expect(screen.getByText(state === 'loading' || state === 'error' ? 'Preview' : `Preview · ${state}`)).toBeVisible();
    expect(sendButton()).toHaveAttribute('aria-disabled', 'true');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('retries a failed preview read using the retained saved identity and never sends on reload', async () => {
    mockRead.isError = true;
    const { rerender } = render(<PurchasingAuthorizationPreviewSheet {...props} />);
    expect(screen.getByRole('alert')).toHaveTextContent('reservations are retained');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reload preview' })); });
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    mockRead.isError = false; rerender(<PurchasingAuthorizationPreviewSheet {...props} />);
    expect(sendButton()).not.toHaveAttribute('aria-disabled', 'true'); expect(mockSend).not.toHaveBeenCalled();
  });

  it.each(['PT409', '40001', 'serialization_failure', '42501', 'insufficient_privilege'])('holds transition failure %s until explicit reload and re-review', async (code) => {
    mockSend.mockRejectedValueOnce({ code });
    const { rerender } = render(<PurchasingAuthorizationPreviewSheet {...props} />);
    await act(async () => { fireEvent.click(sendButton()); });
    expect(sendButton()).toHaveAttribute('aria-disabled', 'true'); expect(screen.getByRole('alert')).toBeVisible();
    mockRead.data = saved({ documentFingerprint: 'reviewed-v2' }); rerender(<PurchasingAuthorizationPreviewSheet {...props} />);
    expect(sendButton()).toHaveAttribute('aria-disabled', 'true');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reload preview' })); });
    expect(mockSend).toHaveBeenCalledTimes(1); expect(mockRetry).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Retry email delivery' })).not.toBeInTheDocument();
    expect(sendButton()).not.toHaveAttribute('aria-disabled', 'true');
    await act(async () => { fireEvent.click(sendButton()); });
    expect(mockSend).toHaveBeenLastCalledWith({ proposalId: 'saved-1', expectedFingerprint: 'reviewed-v2' });
  });

  it('distinguishes a failed transition from pending notification and retries only the existing dispatch', async () => {
    mockSend.mockRejectedValueOnce(new Error('Transition failed'));
    render(<PurchasingAuthorizationPreviewSheet {...props} />);
    await act(async () => { fireEvent.click(sendButton()); });
    expect(screen.getByRole('alert')).toHaveTextContent('Transition failed');
    expect(screen.queryByRole('button', { name: 'Retry email delivery' })).not.toBeInTheDocument();
    mockSend.mockResolvedValueOnce({ sentAt: '2026-10-19', proposalSendDispatchId: 'dispatch-1', _emailDispatched: false, _emailDeliveryState: 'pending_retry', _emailRetryable: true, _emailDispatchDetail: 'Transport unavailable' });
    await act(async () => { fireEvent.click(sendButton()); });
    expect(screen.getByText('Transport unavailable')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Send to client' })).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry email delivery' })); });
    expect(mockRetry).toHaveBeenCalledWith({ proposalId: 'saved-1', sentAt: '2026-10-19', dispatchId: 'dispatch-1' });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('ignores an old document completion after project and document change', async () => {
    let finish!: (v: unknown) => void; mockSend.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { rerender } = render(<PurchasingAuthorizationPreviewSheet {...props} />);
    fireEvent.click(sendButton());
    mockRead.data = saved({ projectId: 'project-2', proposalId: 'saved-2', documentFingerprint: 'new' });
    rerender(<PurchasingAuthorizationPreviewSheet {...props} projectId="project-2" proposalId="saved-2" />);
    await act(async () => { finish({ sentAt: 'old', _emailDispatched: true }); });
    expect(screen.getByText('Preview · Not sent')).toBeVisible(); expect(sendButton()).not.toHaveAttribute('aria-disabled', 'true');
    await act(async () => { fireEvent.click(sendButton()); });
    expect(mockSend).toHaveBeenLastCalledWith({ proposalId: 'saved-2', expectedFingerprint: 'new' });
  });

  it('Back and Escape are read-only and return keyboard focus to the durable trigger', async () => {
    function Harness() {
      const [open, setOpen] = useState(false); const anchor = useRef<HTMLButtonElement>(null);
      return <><button ref={anchor} onClick={() => setOpen(true)}>Preview saved draft</button>{open && <PurchasingAuthorizationPreviewSheet {...props} fallbackFocusRef={anchor} onClose={() => setOpen(false)} />}</>;
    }
    render(<Harness />); const trigger = screen.getByRole('button', { name: 'Preview saved draft' });
    trigger.focus(); fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog'); await waitFor(() => expect(dialog).toHaveFocus());
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(sendButton()).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    fireEvent.click(trigger); fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(mockSend).not.toHaveBeenCalled(); expect(mockRefetch).not.toHaveBeenCalled();
  });
});
