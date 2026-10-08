/**
 * US-19 FR7 F7-8 (one door per surface): the resend paper keeps the
 * acknowledgment check's door and, under `one-voice`, drops its heading —
 * the door's own fact line says it. Flag off, the heading prints as today.
 * The real AckCheckForm renders here; its own suite is
 * buying/__tests__/ack-check.test.tsx.
 */

import { render, screen } from '@testing-library/react';

const sendMutateAsync = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useSendPurchaseOrder: () => ({ mutateAsync: sendMutateAsync, isPending: false }),
  useSetPurchaseOrderShipTo: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetPurchaseOrderShipToLocation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useStudioLocations: () => ({ data: [] }),
  usePurchaseOrders: () => ({
    data: [
      {
        id: 'po-1',
        project_id: 'project-1',
        sent_at: '2026-10-01T12:00:00Z',
        ship_to: '1 Main St, Madison, WI 53703',
      },
    ],
  }),
  usePurchaseOrderChanges: () => ({ data: [] }),
  useOrganizations: () => ({ data: [] }),
  useProject: () => ({ data: { studio_id: 'org-project', designer_id: 'owner-1', site_address: null } }),
  useStudioIdentity: () => ({ data: undefined }),
  useStudioVendorAccount: () => ({ data: undefined }),
  // The acknowledgment check's reads: nothing acknowledged yet.
  isChangeOrderRequired: () => false,
  poAckBasisKey: (id: string) => ['buying-phase2', 'ack-basis', id],
  useLogPoAcknowledgment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useResolveAckLine: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePoAckBasis: () => ({ data: undefined, isLoading: false, isError: false }),
  usePoAcknowledgments: () => ({ data: [] }),
  usePoCostLines: () => ({ data: [] }),
  useVendorQuotes: () => ({ data: [] }),
  useProcurementDrafts: () => ({ data: [] }),
}));

let mockOneVoice = false;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({ value: name === 'one-voice' && mockOneVoice, isLoading: false }),
}));

jest.mock('@/lib/analytics/procurement-events', () => ({
  procurementEvents: { poSent: jest.fn(), poAcknowledgmentLogged: jest.fn() },
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import { PoPreview } from '../po-preview';

const SENT = '2026-10-01T12:00:00Z';

beforeEach(() => {
  mockOneVoice = false;
  sendMutateAsync.mockReset().mockResolvedValue({
    ok: true,
    signedUrl: 'https://files.test/po.pdf',
    poNumber: 'PO-0042',
  });
});

function renderResend() {
  render(
    <PoPreview
      open
      onOpenChange={jest.fn()}
      purchaseOrderId="po-1"
      vendorName="Acme"
      vendorEmailHint="orders@acme.test"
      mode="resend"
      sentAt={SENT}
      acknowledgedAt={null}
    />,
  );
}

describe('PoPreview · resend paper — one acknowledgment door (US-19 F7-8)', () => {
  it('under one-voice prints no heading and exactly one door', async () => {
    mockOneVoice = true;
    renderResend();
    await screen.findByTitle('Purchase order PDF');
    expect(screen.queryByText(/Vendor confirmed/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId('ack-check-door')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Log what they confirmed' })).toHaveLength(1);
    expect(screen.getByTestId('ack-check-door')).toHaveTextContent('awaiting acknowledgment');
  });

  it('flag off keeps the heading and the open form as today', async () => {
    renderResend();
    await screen.findByTitle('Purchase order PDF');
    expect(screen.getByText('Vendor confirmed by phone or email?')).toBeInTheDocument();
    expect(screen.queryByTestId('ack-check-door')).not.toBeInTheDocument();
    expect(screen.getByTestId('ack-check')).toBeInTheDocument();
  });
});
