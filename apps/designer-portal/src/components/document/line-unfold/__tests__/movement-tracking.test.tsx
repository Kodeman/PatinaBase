import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { fmtDay } from '@/lib/document/format';
import { MovementCell } from '../movement-cell';
import {
  etaMoveText,
  etaMoves,
  trackingPatch,
  trackingUrl,
} from '../movement-tracking';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const mockSetTracking = jest.fn();
const mockUpdateEta = jest.fn();
jest.mock('@patina/supabase', () => ({
  useSetPurchaseOrderTracking: () => ({
    mutateAsync: mockSetTracking,
    isPending: false,
  }),
  useUpdatePurchaseOrderETA: () => ({ mutateAsync: mockUpdateEta, isPending: false }),
  useUpdatePurchaseOrderStatus: () => ({ mutateAsync: jest.fn(), isPending: false }),
  // C-26 shipments ride in the cell; their own suite is shipments.test.tsx.
  usePoShipments: () => ({ data: [] }),
  useProcurementDrafts: () => ({ data: [] }),
  useProcurementItems: () => ({ data: [], isLoading: false }),
  useRecordPoShipment: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const mockUpload = jest.fn();
jest.mock('@/hooks/use-folio', () => ({
  useUploadFolioFile: () => ({ mutateAsync: mockUpload, isPending: false }),
  folioSignedUrl: jest.fn(),
}));

// The calendar trigger has its own suite; a plain input carries value in and out.
jest.mock('../../date-text-input', () => ({
  DateTextInput: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string | null;
    onChange: (value: string | null) => void;
    ariaLabel?: string;
  }) => (
    <input
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    />
  ),
}));

const HISTORY = [
  { eta: '2026-11-02', note: null, at: '2026-10-01T10:00:00Z', by: 'u1' },
  { eta: '2026-11-14', note: 'vendor delay', at: '2026-10-05T10:00:00Z', by: 'u1' },
];

describe('trackingUrl', () => {
  it('fills the UPS, FedEx and USPS templates, encoding the number', () => {
    expect(trackingUrl('UPS', '1Z 999')).toBe(
      'https://www.ups.com/track?tracknum=1Z%20999',
    );
    expect(trackingUrl('FedEx Ground', '7712')).toBe(
      'https://www.fedex.com/fedextrack/?trknbr=7712',
    );
    expect(trackingUrl('usps', '9400')).toBe(
      'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400',
    );
  });

  it('is null for any other carrier or a missing number', () => {
    expect(trackingUrl('Estes', '4471-0091')).toBeNull();
    expect(trackingUrl('Their truck', '12')).toBeNull();
    expect(trackingUrl('UPS', '  ')).toBeNull();
    expect(trackingUrl(null, '1Z')).toBeNull();
  });
});

describe('ETA history', () => {
  it('reads newest first, each move naming the date it replaced and why', () => {
    const moves = etaMoves(HISTORY);
    expect(moves).toEqual([
      { eta: '2026-11-14', was: '2026-11-02', note: 'vendor delay' },
      { eta: '2026-11-02', was: null, note: null },
    ]);
    expect(etaMoveText(moves[0])).toBe(
      `${fmtDay('2026-11-14')} (was ${fmtDay('2026-11-02')} · vendor delay)`,
    );
    expect(etaMoveText(moves[1])).toBe(fmtDay('2026-11-02'));
  });

  it('is empty for no history', () => {
    expect(etaMoves(undefined)).toEqual([]);
    expect(etaMoves(null)).toEqual([]);
  });
});

describe('trackingPatch', () => {
  const before = {
    carrier: 'UPS',
    tracking_number: '1Z999',
    shipped_on: '2026-10-22',
  };

  it('sends only the fields that changed', () => {
    expect(
      trackingPatch(before, { carrier: 'UPS', trackingNumber: '1Z000', shippedOn: '2026-10-22' }),
    ).toEqual({ trackingNumber: '1Z000' });
  });

  it('sends blank as null, and nothing when nothing changed', () => {
    expect(
      trackingPatch(before, { carrier: ' ', trackingNumber: '1Z999 ', shippedOn: '' }),
    ).toEqual({ carrier: null, shippedOn: null });
    expect(
      trackingPatch(before, { carrier: 'UPS', trackingNumber: '1Z999', shippedOn: '2026-10-22' }),
    ).toEqual({});
  });
});

describe('MovementCell tracking (C-18)', () => {
  const item = { id: 'line-1', status: 'shipped', eta: null };
  const po = {
    id: 'po-1',
    status: 'shipped',
    confirmed_eta: '2026-11-14',
    carrier: 'UPS',
    tracking_number: '1Z999',
    shipped_on: '2026-10-22',
    bol_document_path: null,
    eta_history: HISTORY,
  };

  beforeEach(() => {
    mockSetTracking.mockReset().mockResolvedValue({ id: 'po-1' });
    mockUpdateEta.mockReset().mockResolvedValue({ id: 'po-1' });
  });

  const renderCell = (overrides: Record<string, unknown> = {}) =>
    render(
      <MovementCell
        item={item}
        po={{ ...po, ...overrides }}
        projectId="proj-1"
        poStatus={(overrides.status as string) ?? 'shipped'}
        showAdvance={false}
        onAdvanced={jest.fn()}
      />,
    );

  it('shows the dated record with the tracking number linked to the carrier', () => {
    renderCell();
    const tracking = screen.getByTestId('line-movement-tracking');
    expect(tracking).toHaveTextContent(`Shipped ${fmtDay('2026-10-22')} · UPS 1Z999`);
    expect(within(tracking).getByRole('link', { name: '1Z999' })).toHaveAttribute(
      'href',
      'https://www.ups.com/track?tracknum=1Z999',
    );
  });

  it('shows an unknown carrier’s number as plain text', () => {
    renderCell({ carrier: 'Estes', tracking_number: '4471-0091' });
    const tracking = screen.getByTestId('line-movement-tracking');
    expect(tracking).toHaveTextContent('Estes 4471-0091');
    expect(within(tracking).queryByRole('link')).toBeNull();
  });

  it('lists the ETA history quietly, newest first', () => {
    renderCell();
    const items = within(screen.getByRole('list', { name: 'ETA history' })).getAllByRole(
      'listitem',
    );
    expect(items.map((li) => li.textContent)).toEqual([
      `${fmtDay('2026-11-14')} (was ${fmtDay('2026-11-02')} · vendor delay)`,
      fmtDay('2026-11-02'),
    ]);
  });

  it('saves only the changed tracking field through the tracking RPC', async () => {
    renderCell();
    fireEvent.click(screen.getByRole('button', { name: 'Edit tracking' }));
    fireEvent.change(screen.getByPlaceholderText('PRO or tracking number'), {
      target: { value: '1Z000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save tracking' }));
    expect(mockSetTracking).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      tracking: { trackingNumber: '1Z000' },
    });
    // The edit folds away once saved.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save tracking' })).toBeNull(),
    );
  });

  it('attaches the bill of lading through the folio, then records its path', async () => {
    mockUpload.mockResolvedValue({ storage_path: 'proj-1/1-bol.pdf' });
    renderCell();
    fireEvent.click(screen.getByRole('button', { name: 'Edit tracking' }));
    const file = new File(['bol'], 'bol.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Attach the bill of lading'), {
      target: { files: [file] },
    });
    expect(mockUpload).toHaveBeenCalledWith({
      file,
      anchor: { kind: 'line', anchorId: 'line-1' },
    });
    await waitFor(() =>
      expect(mockSetTracking).toHaveBeenCalledWith({
        purchaseOrderId: 'po-1',
        tracking: { bolDocumentPath: 'proj-1/1-bol.pdf' },
      }),
    );
  });

  it('sends the reason with a new ETA', () => {
    renderCell();
    fireEvent.change(screen.getByLabelText('Why the ETA moved'), {
      target: { value: 'vendor delay' },
    });
    fireEvent.change(screen.getByLabelText('Confirmed ETA'), {
      target: { value: '2026-11-20' },
    });
    expect(mockUpdateEta).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      newEta: '2026-11-20',
      notes: 'vendor delay',
    });
  });

  it('offers no tracking edit before production', () => {
    renderCell({
      status: 'confirmed',
      carrier: null,
      tracking_number: null,
      shipped_on: null,
    });
    expect(screen.queryByTestId('line-movement-tracking')).toBeNull();
  });
});
