/**
 * T-60j F19: a substitution's alternate ordered on the order paper. The
 * alternate's row carries its room as the PostgREST join `{id, name}`; the
 * paper takes a room name, so the overlay hands it the name.
 */

import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockOrderPaper = jest.fn();
const mockLines: { data: Record<string, unknown>[] } = { data: [] };
function mockMutation() {
  return { mutateAsync: jest.fn(), isPending: false };
}

jest.mock('@patina/supabase', () => ({
  invalidateProcurementExceptions: jest.fn(),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useOpenProcurementException: () => mockMutation(),
  useResolveProcurementException: () => mockMutation(),
  useStartPurchaseOrderChange: () => mockMutation(),
  useRecordVendorRefund: () => mockMutation(),
  useComposeProcurementDraft: () => mockMutation(),
  useRequestSubstitutionApproval: () => mockMutation(),
  usePublishDraftDecision: () => mockMutation(),
  useTriageProjectFfeItems: () => mockMutation(),
  useProcurementDrafts: () => ({ data: [] }),
  useProjectFFEItems: () => ({ data: mockLines.data }),
  useDecision: () => ({
    data: {
      id: 'decision-1',
      status: 'answered',
      options: [
        { id: 'o0', name: 'Walnut console', selected: false, sort_order: 0, product_id: 'p-orig' },
        { id: 'o1', name: 'Oak console', selected: true, sort_order: 1, product_id: 'p-alt' },
      ],
    },
  }),
  useProjectRecordedStudio: () => ({ data: null }),
  useCanSeeStudioMargin: () => ({ data: false }),
  useVendor: (id: string) => ({ data: id ? { id, name: 'Hewn' } : null }),
}));
jest.mock('@/components/portal/procurement/order-paper', () => ({
  OrderPaper: (props: unknown) => {
    mockOrderPaper(props);
    return null;
  },
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import { SubstitutionFlow } from '../buying/exception-overlay';

const wrap = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const line = (over: Record<string, unknown>) => ({
  project_id: 'p1',
  removed_at: null,
  purchase_order_id: null,
  quantity: 1,
  line_total_cents: 90000,
  assignment_scope: 'room',
  project_room_id: 'room-living',
  ...over,
});

const exception = {
  id: 'x1',
  project_id: 'p1',
  type: 'substitution',
  status: 'awaiting_vendor',
  ffe_item_id: 'item-orig',
  purchase_order_id: null,
  client_decision_id: 'decision-1',
  po_change_id: 'change-1',
  purchase_order: null,
} as never;

beforeEach(() => {
  mockOrderPaper.mockReset();
  mockLines.data = [
    line({ id: 'item-orig', name: 'Walnut console', product_id: 'p-orig', design_disposition: 'not_selected' }),
    line({
      id: 'item-alt',
      name: 'Oak console',
      product_id: 'p-alt',
      vendor_id: 'v-hewn',
      design_disposition: 'selected',
      room: { id: 'room-living', name: 'Living Room' },
    }),
  ];
});

describe('SubstitutionFlow · the order paper’s room (T-60j F19)', () => {
  it('hands the paper the alternate’s room name, not the {id, name} join', () => {
    render(<SubstitutionFlow exception={exception} onDecline={jest.fn()} />, { wrapper: wrap });
    const { ffeItems } = mockOrderPaper.mock.calls.at(-1)?.[0] as {
      ffeItems: Array<Record<string, unknown>>;
    };
    expect(ffeItems).toHaveLength(1);
    expect(ffeItems[0].id).toBe('item-alt');
    expect(ffeItems[0].room).toBe('Living Room');
  });
});
