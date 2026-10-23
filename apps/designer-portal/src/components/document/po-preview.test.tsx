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
// The studio's account with the PO's vendor (C-12): its orders_email_override.
const mockAccount: { row: Record<string, unknown> | null } = { row: null };

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({

  usePoReleaseState: () => ({ data: { cleared: true, group_total_cents: 1248000, threshold_cents: 2000000 } }),
  usePoReleasePreview: () => ({ data: { cleared: true, group_total_cents: 1248000, threshold_cents: 2000000 } }),

  useFfeInvoiceCoverage: () => ({ data: { 'line-sofa': { coverage: 'paid' } } }),
  useProcurementItems: ({ purchaseOrderId }: { purchaseOrderId: string }) => ({ data: [{ id: 'line-sofa', purchase_order_id: purchaseOrderId }] }),
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
  // The project resolves to its studio, as po-send resolves it.
  useStudioIdentity: (p: { projectId?: string | null }) => ({
    data: p?.projectId ? { studioId: 'org-project' } : undefined,
  }),
  useStudioVendorAccount: (studioId: string | null, vendorId: string | null) => ({
    data: studioId === 'org-project' && vendorId === 'vendor-1' ? mockAccount.row : undefined,
  }),
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

// C-27: the acknowledgment check rides the resend paper; its own suite is
// buying/__tests__/ack-check.test.tsx.
jest.mock('./buying/ack-check', () => ({
  AckCheckForm: () => <div data-testid="ack-check" />,
  AckRecord: () => null,
  usePoAckSummary: () => ({ copy: null }),
}));


jest.mock('@/hooks/use-project-purchasing-agreement', () => ({
  useProjectPurchasingAgreement: () => ({ data: { state: 'patina_signed' } }),
}));
jest.mock('@/hooks/use-commercial-documents', () => ({
  useProjectInstruments: () => ({ data: [{ state: 'executed', number: 1, items: [{ sourceFfeItemId: 'line-sofa' }] }] }),
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
    { id: 'po-1', project_id: 'project-1', total_cents: 1248000, released_total_cents: 1500000, vendor_id: 'vendor-1', sent_at: null, ship_to: '1 Main St, Madison, WI 53703' },
  ];
  poSent.mockReset();
  mockChanges.list = [];
  mockAccount.row = null;
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

describe('PoPreview · lifted paper', () => {
  it('portals the dialog to document.body outside an isolated row and removes it when closed', async () => {
    const props = {
      open: true,
      onOpenChange: jest.fn(),
      purchaseOrderId: 'po-1',
      vendorName: 'Acme',
      vendorEmailHint: 'orders@acme.test',
    };
    const { rerender, container } = render(
      <div style={{ isolation: 'isolate' }}>
        <PoPreview {...props} />
      </div>,
    );
    await waitForPdf();

    const dialog = screen.getByRole('dialog', { name: 'Purchase order preview' });
    expect(dialog.parentElement).toBe(document.body);
    expect(container).not.toContainElement(dialog);
    expect(within(dialog).getByRole('button', { name: 'Send to vendor' })).toBeEnabled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    rerender(
      <div style={{ isolation: 'isolate' }}>
        <PoPreview {...props} open={false} />
      </div>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reserves the published drawer or mobile bar height and lets long paper scroll', async () => {
    renderPreview();
    await waitForPdf();

    const paper = screen.getByRole('dialog').querySelector('[data-spotlight-frame]') as HTMLElement;
    expect(paper).toHaveClass(
      'bottom-[calc(4vh_+_max(var(--doc-drawer-height,0px),var(--doc-mobile-bar-height,0px),env(safe-area-inset-bottom,0px)))]',
    );
    expect(paper).toHaveClass('overflow-y-auto');
    expect(paper).not.toHaveClass('h-[92vh]');
  });
});

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
    const onMarked = jest.fn();
    const { onSent } = renderPreview({ onMarked });
    await waitForPdf();

    fireEvent.change(screen.getByLabelText('Note to the vendor'), {
      target: { value: 'Ordered by phone.' },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /mark as sent/i }),
      );
    });

    await waitFor(() => expect(onMarked).toHaveBeenCalledTimes(1));
    expect(onSent).not.toHaveBeenCalled();
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

  it('opens the spotlight on the lifted paper when a held act is pressed (SQ-1211)', async () => {
    mockOrders.list = [unsent];
    // A sheet frame hosts the preview, as order-paper's DocSheet does, and
    // the preview's root is laid out fixed as Tailwind's `fixed` does at
    // runtime (jsdom computes no utility classes).
    render(
      <div data-spotlight-frame data-testid="host">
        <PoPreview
          open
          onOpenChange={jest.fn()}
          purchaseOrderId="po-1"
          vendorName="Acme"
          vendorEmailHint="orders@acme.test"
        />
      </div>,
    );
    await waitForPdf();
    screen.getByRole('dialog', { name: 'Purchase order preview' }).style.position = 'fixed';

    const mark = screen.getByRole('button', { name: /mark as sent/i });
    await act(async () => {
      fireEvent.click(mark);
    });

    const layer = document.querySelector('[data-hold-spotlight]');
    expect(layer).not.toBeNull();
    const paper = layer!.closest('[data-spotlight-frame]')!;
    expect(paper).not.toBe(screen.getByTestId('host'));
    expect(paper.contains(screen.getByRole('button', { name: 'Send to vendor', hidden: true }))).toBe(true);
    expect(
      Array.from(document.querySelectorAll('[data-hold-spotlight-window]')).map((el) =>
        el.getAttribute('data-hold-spotlight-window'),
      ),
    ).toHaveLength(1);
    expect(sendMutateAsync.mock.calls.filter(([a]) => a.mode !== 'preview')).toHaveLength(0);
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

describe('PoPreview · who the PO goes to (C-12, F7)', () => {
  const withVendor = [
    {
      id: 'po-1',
      project_id: 'project-1',
      vendor_id: 'vendor-1',
      sent_at: null,
      ship_to: '1 Main St, Madison, WI 53703',
    },
  ];

  it("names the studio's own orders inbox, the address po-send mails first", async () => {
    mockOrders.list = withVendor;
    mockAccount.row = { orders_email_override: ' studio-orders@acme.test ', archived_at: null };
    renderPreview();
    await waitForPdf();
    expect(screen.getByText('Sends to studio-orders@acme.test')).toBeInTheDocument();
    expect(screen.queryByText('Sends to orders@acme.test')).not.toBeInTheDocument();
  });

  it("falls back to the vendor's address when the studio account is archived", async () => {
    mockOrders.list = withVendor;
    mockAccount.row = { orders_email_override: 'old@acme.test', archived_at: '2026-09-01T00:00:00Z' };
    renderPreview();
    await waitForPdf();
    expect(screen.getByText('Sends to orders@acme.test')).toBeInTheDocument();
  });

  it('enables Send on the studio inbox alone when the vendor has no email', async () => {
    mockOrders.list = withVendor;
    mockAccount.row = { orders_email_override: 'studio-orders@acme.test', archived_at: null };
    renderPreview({ vendorEmailHint: null });
    await waitForPdf();
    expect(screen.getByText('Sends to studio-orders@acme.test')).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send to vendor' });
    expect(send).toBeEnabled();
    expect(send).not.toHaveAttribute('aria-disabled');
  });

  it('says plainly when there is nowhere to send, and holds Send', async () => {
    mockOrders.list = withVendor;
    renderPreview({ vendorEmailHint: null });
    await waitForPdf();
    expect(screen.getByText('No email on file for this vendor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to vendor' })).toBeDisabled();
  });
});

describe('shared purchase order review', () => {
  it('renders four separate standings and sends only after an explicit click', async () => {
    const beforeSend = jest.fn().mockResolvedValue(undefined);
    renderPreview({ initialNote: 'Keep the walnut finish.', beforeSend });
    await waitForPdf();
    expect(screen.getByLabelText('Purchasing standings')).toHaveTextContent('AgreementSigned in Patina');
    expect(screen.getByLabelText('Purchasing standings')).toHaveTextContent('Client authorization1 of 1 pieces authorized by the client');
    expect(screen.getByLabelText('Purchasing standings')).toHaveTextContent('Funds received1 of 1 pieces paid in full');
    expect(screen.getByLabelText('Purchasing standings')).toHaveTextContent('Released up to $15,000; this paper is $12,480; aggregate to this maker on this job $12,480; studio release line $20,000');
    expect(screen.getByLabelText('Note to the vendor')).toHaveValue('Keep the walnut finish.');
    expect(sendMutateAsync.mock.calls.map(([input]) => input.mode)).toEqual(['preview']);
    expect(beforeSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send to vendor' }));
    await waitFor(() => expect(sendMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ mode: 'send' })));
    expect(beforeSend).toHaveBeenCalledTimes(1);
  });
});
