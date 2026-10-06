/**
 * C-09 — PoPreview is the one PO send UI. The note to the vendor is a plain
 * optional textarea; its text rides the 'send' mutation as `message`, and the
 * manual mark-sent path (no email) never carries it.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const sendMutateAsync = jest.fn();
const setShipToMutateAsync = jest.fn();
const setShipToLocationMutateAsync = jest.fn();
// The project studio's live locations (C-13).
const mockLocations: { list: Array<Record<string, unknown>> } = { list: [] };
const poSent = jest.fn();
// The studio's purchase-orders list the ship-to band reads (C-02).
const mockOrders: { list: Array<Record<string, unknown>> } = { list: [] };
// The PO's change history (C-21).
const mockChanges: { list: Array<Record<string, unknown>> } = { list: [] };

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useSendPurchaseOrder: () => ({ mutateAsync: sendMutateAsync, isPending: false }),
  useLogPOAcknowledgment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetPurchaseOrderShipTo: () => ({ mutateAsync: setShipToMutateAsync, isPending: false }),
  useSetPurchaseOrderShipToLocation: () => ({
    mutateAsync: setShipToLocationMutateAsync,
    isPending: false,
  }),
  useStudioLocations: (studioId: string | null) => ({
    data: studioId === 'org-project' ? mockLocations.list : undefined,
  }),
  usePurchaseOrders: () => ({ data: mockOrders.list }),
  usePurchaseOrderChanges: () => ({ data: mockChanges.list }),
  // The caller belongs to two studios; the project belongs to the second (F11).
  useOrganizations: () => ({
    data: [
      { id: 'org-other', address: { street: '9 Elm St', city: 'Racine', state: 'WI', zip: '53403' } },
      { id: 'org-project', address: { street: '1 Main St', city: 'Madison', state: 'WI', zip: '53703' } },
    ],
  }),
  useProject: () => ({
    data: { studio_id: 'org-project', designer_id: 'owner-1', site_address: null },
  }),
  useStudioIdentity: () => ({ data: undefined }),
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
  setShipToLocationMutateAsync.mockReset();
  setShipToLocationMutateAsync.mockResolvedValue({ id: 'po-1' });
  mockLocations.list = [];
  // A ready PO by default: a ship-to on file.
  mockOrders.list = [
    { id: 'po-1', project_id: 'project-1', sent_at: null, ship_to: '1 Main St, Madison, WI 53703' },
  ];
  poSent.mockReset();
  mockChanges.list = [];
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

  it('offers the studio receivers first, none chosen, and sets a location by id (C-13)', async () => {
    mockOrders.list = [unsent];
    mockLocations.list = [
      { id: 'loc-store', kind: 'storage', label: 'Cold Store', address: null, is_default_receiver: false },
      { id: 'loc-badger', kind: 'receiver', label: 'Badger Receiving', address: null, is_default_receiver: true },
    ];
    renderPreview();
    await waitForPdf();

    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('value'))).toEqual([
      'location:loc-badger',
      'location:loc-store',
      'studio',
      'other',
    ]);
    radios.forEach((r) => expect(r).not.toBeChecked());
    expect(screen.getByRole('radio', { name: /Default receiver/ })).toHaveAccessibleName(
      expect.stringContaining('Badger Receiving'),
    );
    expect(screen.getByRole('button', { name: 'Set ship-to' })).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: /Cold Store/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set ship-to' }));
    });
    expect(setShipToLocationMutateAsync).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      locationId: 'loc-store',
    });
    expect(setShipToMutateAsync).not.toHaveBeenCalled();
  });

  it('stays quiet when the PO already has a ship-to', async () => {
    mockOrders.list = [{ ...unsent, ship_to: '1 Main St, Madison, WI 53703' }];
    renderPreview();
    await waitForPdf();
    expect(screen.queryByText('Ship-to not set')).not.toBeInTheDocument();
  });

  it('offers "The studio" at the project studio address, not the first org', async () => {
    mockOrders.list = [unsent];
    renderPreview();
    await waitForPdf();
    const studio = screen.getByRole('radio', { name: /the studio/i });
    expect(studio).toHaveAccessibleName(expect.stringContaining('1 Main St, Madison, WI 53703'));
    expect(screen.queryByText(/9 Elm St/)).not.toBeInTheDocument();
  });

  it('is offered on a resend of a sent PO with no ship-to (F1)', async () => {
    const sent = { ...unsent, sent_at: '2026-10-01T00:00:00Z' };
    mockOrders.list = [sent];
    renderPreview({ mode: 'resend', sentAt: sent.sent_at });
    await waitForPdf();

    expect(screen.getByText('Ship-to not set')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /the studio/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set ship-to' }));
    });
    expect(setShipToMutateAsync).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      shipTo: '1 Main St, Madison, WI 53703',
    });
  });

  it('stays quiet on a resend once the PO has a ship-to', async () => {
    mockOrders.list = [
      { ...unsent, sent_at: '2026-10-01T00:00:00Z', ship_to: '1 Main St, Madison, WI 53703' },
    ];
    renderPreview({ mode: 'resend', sentAt: '2026-10-01T00:00:00Z' });
    await waitForPdf();
    expect(screen.queryByText('Ship-to not set')).not.toBeInTheDocument();
  });
});

describe('PoPreview · Send and Mark as sent gated on ship-to (F2, F1)', () => {
  const unsent = { id: 'po-1', project_id: 'project-1', sent_at: null, ship_to: null };
  const REASON = 'Choose where this ships.';

  it('holds Send and Mark as sent with the reason while the PO has no ship-to', async () => {
    mockOrders.list = [unsent];
    const { onSent } = renderPreview();
    await waitForPdf();

    const send = screen.getByRole('button', { name: 'Send to vendor' });
    const mark = screen.getByRole('button', { name: /mark as sent/i });
    const reason = screen.getByText(REASON);
    for (const btn of [send, mark]) {
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      expect(btn).toHaveAttribute('aria-describedby', reason.id);
    }

    await act(async () => {
      fireEvent.click(send);
      fireEvent.click(mark);
    });
    expect(sendMutateAsync.mock.calls.filter(([a]) => a.mode !== 'preview')).toHaveLength(0);
    expect(onSent).not.toHaveBeenCalled();
  });

  it('holds Resend on a sent PO with no ship-to', async () => {
    mockOrders.list = [{ ...unsent, sent_at: '2026-10-01T00:00:00Z' }];
    renderPreview({ mode: 'resend', sentAt: '2026-10-01T00:00:00Z' });
    await waitForPdf();
    expect(screen.getByRole('button', { name: 'Resend to vendor' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByText(REASON)).toBeInTheDocument();
  });

  it('enables Send and Mark as sent once a ship-to is on file', async () => {
    mockOrders.list = [{ ...unsent, ship_to: '1 Main St, Madison, WI 53703' }];
    renderPreview();
    await waitForPdf();

    const send = screen.getByRole('button', { name: 'Send to vendor' });
    const mark = screen.getByRole('button', { name: /mark as sent/i });
    expect(send).toBeEnabled();
    expect(send).not.toHaveAttribute('aria-disabled');
    expect(mark).toBeEnabled();
    expect(mark).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
  });
});

describe('PoPreview · change history (C-21)', () => {
  it('renders nothing while the PO has no changes', async () => {
    renderPreview();
    await waitForPdf();
    expect(screen.queryByTestId('po-change-history')).not.toBeInTheDocument();
  });

  it('lists each change with its kind, maker, replacement and reason', async () => {
    mockChanges.list = [
      {
        id: 'chg-2',
        change_kind: 'vendor_change',
        status: 'open',
        reason: 'Hale discontinued the frame',
        created_at: '2026-10-06T12:00:00Z',
        replacement_purchase_order_id: 'po-2',
        replacement: { po_number: 'PO-0043' },
        requested_vendor: { name: 'Hollowell Woodshop' },
      },
      {
        id: 'chg-1',
        change_kind: 'claim',
        status: 'resolved',
        reason: 'Arm scuffed in transit',
        created_at: '2026-10-02T12:00:00Z',
        replacement_purchase_order_id: null,
        replacement: null,
        requested_vendor: null,
      },
    ];
    renderPreview();
    await waitForPdf();

    const items = within(screen.getByTestId('po-change-history')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(
      /maker change · to Hollowell Woodshop · replaced by PO-0043 — Hale discontinued the frame/,
    );
    expect(items[1]).toHaveTextContent(/claim · resolved — Arm scuffed in transit/);
  });
});
