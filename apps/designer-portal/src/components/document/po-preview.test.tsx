/**
 * C-09 — PoPreview is the one PO send UI. The note to the vendor is a plain
 * optional textarea; its text rides the 'send' mutation as `message`, and the
 * manual mark-sent path (no email) never carries it.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const sendMutateAsync = jest.fn();
const setShipToMutateAsync = jest.fn();
const poSent = jest.fn();
// The studio's purchase-orders list the ship-to band reads (C-02).
const mockOrders: { list: Array<Record<string, unknown>> } = { list: [] };

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useSendPurchaseOrder: () => ({ mutateAsync: sendMutateAsync, isPending: false }),
  useLogPOAcknowledgment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetPurchaseOrderShipTo: () => ({ mutateAsync: setShipToMutateAsync, isPending: false }),
  usePurchaseOrders: () => ({ data: mockOrders.list }),
  useOrganizations: () => ({
    data: [{ address: { street: '1 Main St', city: 'Madison', state: 'WI', zip: '53703' } }],
  }),
  useProject: () => ({ data: { site_address: null } }),
}));

jest.mock('@/lib/analytics/procurement-events', () => ({
  procurementEvents: {
    poSent: (...args: unknown[]) => poSent(...args),
    poAcknowledgmentLogged: jest.fn(),
  },
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import { PoPreview } from './po-preview';

beforeEach(() => {
  sendMutateAsync.mockReset();
  setShipToMutateAsync.mockReset();
  setShipToMutateAsync.mockResolvedValue({ id: 'po-1' });
  mockOrders.list = [];
  poSent.mockReset();
  sendMutateAsync.mockImplementation(async ({ mode }: { mode: string }) =>
    mode === 'preview'
      ? { ok: true, signedUrl: 'https://files.test/po.pdf', poNumber: 'PO-0042' }
      : { ok: true, poNumber: 'PO-0042', recipient: 'orders@acme.test' },
  );
});

function renderPreview(over: Partial<Parameters<typeof PoPreview>[0]> = {}) {
  const onOpenChange = jest.fn();
  const onSent = jest.fn();
  render(
    <PoPreview
      open
      onOpenChange={onOpenChange}
      purchaseOrderId="po-1"
      vendorName="Acme"
      vendorEmailHint="orders@acme.test"
      onSent={onSent}
      {...over}
    />,
  );
  return { onOpenChange, onSent };
}

async function waitForPdf() {
  await screen.findByTitle('Purchase order PDF');
}

describe('PoPreview · note to the vendor', () => {
  it('passes the note to the send mutation as the email message', async () => {
    const { onSent } = renderPreview();
    await waitForPdf();

    fireEvent.change(screen.getByLabelText('Note to the vendor'), {
      target: { value: '  Please confirm the walnut lot before cutting.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send to vendor' }));

    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(sendMutateAsync).toHaveBeenLastCalledWith({
      purchaseOrderId: 'po-1',
      mode: 'send',
      recipientEmail: 'orders@acme.test',
      message: 'Please confirm the walnut lot before cutting.',
    });
    expect(poSent).toHaveBeenCalledWith({ method: 'email' });
  });

  it('sends no message when the note is left blank', async () => {
    const { onSent } = renderPreview();
    await waitForPdf();

    fireEvent.click(screen.getByRole('button', { name: 'Send to vendor' }));

    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(sendMutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'send', message: undefined }),
    );
  });

  it('never carries the note on a manual mark-sent', async () => {
    const { onSent } = renderPreview();
    await waitForPdf();

    fireEvent.change(screen.getByLabelText('Note to the vendor'), {
      target: { value: 'Ordered by phone.' },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /mark as sent/i }),
      );
    });

    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(sendMutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'mark_sent', message: undefined }),
    );
    expect(poSent).toHaveBeenCalledWith({ method: 'manual' });
  });
});

describe('PoPreview · ship-to not set (C-02)', () => {
  const unsent = { id: 'po-1', project_id: 'project-1', sent_at: null, ship_to: null };

  it('offers the ship-to choice on an unsent PO with none, and sets it with the shown text', async () => {
    mockOrders.list = [unsent];
    renderPreview();
    await waitForPdf();

    expect(screen.getByText('Ship-to not set')).toBeInTheDocument();
    const studio = screen.getByRole('radio', { name: /the studio/i });
    expect(studio).not.toBeChecked();
    // No site address on the project → no job-site option.
    expect(screen.queryByRole('radio', { name: /the job site/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set ship-to' })).toBeDisabled();

    fireEvent.click(studio);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set ship-to' }));
    });

    expect(setShipToMutateAsync).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      shipTo: '1 Main St, Madison, WI 53703',
    });
    // The paper re-renders so the PDF carries the new ship-to.
    await waitFor(() =>
      expect(
        sendMutateAsync.mock.calls.filter(([a]) => a.mode === 'preview'),
      ).toHaveLength(2),
    );
  });

  it('stays quiet when the PO already has a ship-to', async () => {
    mockOrders.list = [{ ...unsent, ship_to: '1 Main St, Madison, WI 53703' }];
    renderPreview();
    await waitForPdf();
    expect(screen.queryByText('Ship-to not set')).not.toBeInTheDocument();
  });

  it('is not offered on a resend', async () => {
    mockOrders.list = [unsent];
    renderPreview({ mode: 'resend', sentAt: '2026-10-01T00:00:00Z' });
    await waitForPdf();
    expect(screen.queryByText('Ship-to not set')).not.toBeInTheDocument();
  });
});
