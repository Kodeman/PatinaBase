/**
 * US-19 F1 / R28 — ⌘K's `Open the order` lands on the line: Pieces unfolds,
 * the line unfolds, and focus is on the PO control itself, never the Order
 * group. A request made before the Pieces listener exists waits in
 * `focusFfeLinePending` and is landed on mount.
 *
 * US-19 F2-3 / 2-5 — `Record the payment` (band, dock, ⌘K) lands on the PO
 * line's record-payment control: Pieces and the line unfold, the money out
 * opens its form, and focus is on the one filled act beneath its sentence.
 */
import { act, render, screen, waitFor } from '@testing-library/react';

let mockItems: Record<string, unknown>[] = [];
let mockWithMoneyOut = false;
// Stands in for the unfold: the Order cell and its PO control, as order-cell.tsx
// prints them — and, for the payment landing, the line's real money out.
const mockLineUnfold = jest.fn((props: Record<string, unknown>) => {
  const { PoMoneyOut } = jest.requireActual('../line-unfold/record-payment');
  const item = props.item as { id: string; purchase_order?: { id: string } } | undefined;
  return (
    <>
      <div role="group" aria-label="Order" data-testid="line-po-cell">
        <button type="button" data-po-control aria-label="Open the order, PO WS-188">
          WS-188
        </button>
      </div>
      {/* FR5 F5-2: the Movement cell's held maker note, as movement-cell.tsx prints it. */}
      <div data-testid="line-held-maker-note">
        <p>Follow-up to Halloran Joinery drafted — not sent.</p>
        <input aria-label="Held note subject" defaultValue="WS-188 — following up" />
      </div>
      {mockWithMoneyOut && item?.purchase_order && (
        <PoMoneyOut
          purchaseOrderId={item.purchase_order.id}
          projectId="project-1"
          receiptAnchor={{ kind: 'line', anchorId: item.id }}
        />
      )}
    </>
  );
});

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@/components/document/buying/install-manifest', () => ({ InstallManifest: () => null }));

jest.mock('@patina/supabase', () => ({
  useProcurementDrafts: () => ({ data: [] }),
  useStudioPurchases: () => ({ data: [] }),
  useProjectPoCostLines: () => ({ data: [] }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useProjectFFEItems: () => ({ data: mockItems, isLoading: false, isError: false, refetch: jest.fn() }),
  useProjectFfeReadiness: () => ({
    data: mockItems.map((item) => ({ selectionId: item.id, ready: true, missingFields: [] })),
  }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
  // The line's money out (record-payment.tsx), for the payment landing.
  usePOPayments: () => ({
    data: [
      { id: 'pay-dep', kind: 'deposit', state: 'paid', amount_cents: 340_000, paid_date: '2026-03-02' },
      { id: 'pay-bal', kind: 'balance', state: 'due', amount_cents: 340_000, due_date: '2026-05-12' },
    ],
  }),
  useVendorPayments: () => ({ data: [] }),
  useStudioPaymentMethods: () => ({ data: [] }),
  useRecordVendorPayment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useVoidVendorPayment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useStartPoCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUser: () => ({ user: { id: 'designer-1' } }),
  usePurchaseOrders: () => ({
    data: [{ id: 'po-188', designer_id: 'designer-1', vendor: { id: 'v-1', name: 'Woodward & Sons' } }],
  }),
}));

jest.mock('@/hooks/use-folio', () => ({
  ...jest.requireActual('@/hooks/use-folio'),
  useUploadFolioFile: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

// The Folio trigger has its own suite; a plain input carries the day.
jest.mock('../date-text-input', () => ({
  DateTextInput: ({ value, ariaLabel }: { value: string | null; ariaLabel?: string }) => (
    <input aria-label={ariaLabel} value={value ?? ''} readOnly />
  ),
}));

jest.mock('../schedule/add-to-project-sheet', () => ({
  AddToProjectSheet: () => null,
  openAddToProject: jest.fn(),
}));

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: [] }),
  useAddDocumentRoom: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: { budget: (id: string) => ['working-budget', id] },
  useProjectInstruments: () => ({ data: [] }),
  useTradeScopes: () => ({ data: [], isPending: false }),
  useProjectBillingAuthority: () => ({ data: null }),
  useWorkingBudget: () => ({ isLoading: false, data: null }),
  useReleaseForAuthorization: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSendFurnishingsAuthorization: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePublishBudgetCheckpoint: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useOverrideBudgetCheckpoint: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/components/portal/ffe/stages', () => ({
  STAGE_CONFIG: new Proxy(
    {},
    {
      get: (_target, key: string) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        color: 'var(--text-muted)',
      }),
    },
  ),
}));

jest.mock('../accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
}));
jest.mock('../work-block', () => ({ WorkBlock: () => null }));
jest.mock('../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('../line-unfold', () => ({
  LineUnfold: (props: Record<string, unknown>) => mockLineUnfold(props),
}));

jest.mock('@/hooks/use-section-work', () => {
  const actual = jest.requireActual('@/hooks/use-section-work');
  const idle = { mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false };
  return {
    ...actual,
    useSectionTasks: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn() }),
    useSectionGates: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn() }),
    useSectionLoggedMinutes: () => ({ data: 0 }),
    useCreateSectionTask: () => idle,
    useToggleSectionTask: () => idle,
    useRequestSectionGate: () => idle,
  };
});

import { FFESection } from '../ffe-section';
import { __setDensityForTest } from '@/hooks/use-lens-density';
import {
  FOCUS_FFE_LINE_EVENT,
  focusFfeLinePending,
  landRecordPayment,
  recordPaymentPending,
} from '@/lib/document/registry';

const sectional = {
  id: 'line-sectional',
  name: 'Custom Walnut Sectional — 3 pc',
  quantity: 1,
  status: 'delivered',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 1_230_000,
  line_total_cents: 1_230_000,
  project_room_id: 'room-1',
  room: { id: 'room-1', name: 'Living Room' },
  received_quantity: 1,
  purchase_order: { id: 'po-188', po_number: 'WS-188', status: 'sent' },
};

/** What ⌘K's row does on Enter (command-bar.tsx). */
function askForTheLine() {
  const request = { itemId: 'line-sectional', cell: 'order' as const };
  focusFfeLinePending.request = request;
  window.dispatchEvent(new CustomEvent(FOCUS_FFE_LINE_EVENT, { detail: request }));
}

const poControl = () => screen.getByRole('button', { name: 'Open the order, PO WS-188' });

beforeEach(() => {
  __setDensityForTest('full');
  mockItems = [sectional];
  mockLineUnfold.mockClear();
  mockWithMoneyOut = false;
  focusFfeLinePending.request = null;
  recordPaymentPending.request = null;
  window.localStorage.clear();
});
afterEach(() => {
  __setDensityForTest(undefined);
});

describe('⌘K lands on the line (F1, R28)', () => {
  it('queues a request made before Pieces is mounted, and lands it on mount with Pieces folded', async () => {
    // Pieces closed by the designer on an earlier visit.
    window.localStorage.setItem('patina:doc-fold:project-1:ffe', '1');
    askForTheLine(); // no listener exists yet
    expect(focusFfeLinePending.request).toEqual({ itemId: 'line-sectional', cell: 'order' });

    render(<FFESection projectId="project-1" projectName="Chen" mode="project" />);

    await waitFor(() => expect(document.activeElement).toBe(poControl()));
    expect(screen.getByRole('button', { name: /Custom Walnut Sectional/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(focusFfeLinePending.request).toBeNull();
    expect(document.activeElement).not.toBe(screen.getByTestId('line-po-cell'));
  });

  it('lands on the PO control, not the Order group, when Pieces is already open', async () => {
    render(<FFESection projectId="project-1" projectName="Chen" mode="project" />);
    expect(mockLineUnfold).not.toHaveBeenCalled();

    act(() => askForTheLine());

    await waitFor(() => expect(document.activeElement).toBe(poControl()));
    expect(focusFfeLinePending.request).toBeNull();
  });

  it("FR5 F5-2: the band's Open the held draft lands on the held note's DraftReview", async () => {
    render(<FFESection projectId="project-1" projectName="Chen" mode="project" />);
    const request = { itemId: 'line-sectional', cell: 'draft' as const };
    act(() => {
      window.dispatchEvent(new CustomEvent(FOCUS_FFE_LINE_EVENT, { detail: request }));
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('Held note subject')),
    );
  });
});

describe('Record the payment lands on the PO line’s control (F2-3, 2-5)', () => {
  const flags = process.env.NEXT_PUBLIC_FLAG_OVERRIDES;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_FLAG_OVERRIDES = 'one-voice:true';
    mockWithMoneyOut = true;
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_FLAG_OVERRIDES = flags;
  });

  const recordAct = () => screen.getByRole('button', { name: 'Record the payment · $3,400' });

  async function expectLanded(container: HTMLElement) {
    await waitFor(() => expect(document.activeElement).toBe(recordAct()));
    // Nothing else on the paper is filled.
    const filled = container.querySelectorAll('.da-terminal');
    expect(filled).toHaveLength(1);
    expect(filled[0]).toBe(recordAct());
    // 499-5 — its one sentence directly above it.
    const sentence = screen.getByText(/^Records \$3,400 paid to Woodward & Sons on /);
    expect(sentence).toHaveTextContent(/— voidable with a reason, never edited\.$/);
    expect(sentence.compareDocumentPosition(recordAct()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(recordPaymentPending.request).toBeNull();
  }

  it('lands with Pieces folded, the press made before Pieces mounted', async () => {
    window.localStorage.setItem('patina:doc-fold:project-1:ffe', '1');
    landRecordPayment('po-188'); // no listener exists yet

    const { container } = render(
      <FFESection projectId="project-1" projectName="Chen" mode="project" />,
    );

    await expectLanded(container);
    expect(screen.getByRole('button', { name: /Custom Walnut Sectional/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('lands with Pieces open, the line still folded', async () => {
    const { container } = render(
      <FFESection projectId="project-1" projectName="Chen" mode="project" />,
    );
    expect(container.querySelectorAll('.da-terminal')).toHaveLength(0);

    act(() => landRecordPayment('po-188'));

    await expectLanded(container);
  });
});
