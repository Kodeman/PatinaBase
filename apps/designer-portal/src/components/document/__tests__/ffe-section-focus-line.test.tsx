/**
 * US-19 F1 / R28 — ⌘K's `Open the order` lands on the line: Pieces unfolds,
 * the line unfolds, and focus is on the PO control itself, never the Order
 * group. A request made before the Pieces listener exists waits in
 * `focusFfeLinePending` and is landed on mount.
 */
import { act, render, screen, waitFor } from '@testing-library/react';

let mockItems: Record<string, unknown>[] = [];
// Stands in for the unfold: the Order cell and its PO control, as order-cell.tsx
// prints them.
const mockLineUnfold = jest.fn(() => (
  <div role="group" aria-label="Order" data-testid="line-po-cell">
    <button type="button" data-po-control aria-label="Open the order, PO WS-188">
      WS-188
    </button>
  </div>
));

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
  useStudioPurchases: () => ({ data: [] }),
  useProjectPoCostLines: () => ({ data: [] }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useProjectFFEItems: () => ({ data: mockItems, isLoading: false, isError: false, refetch: jest.fn() }),
  useProjectFfeReadiness: () => ({
    data: mockItems.map((item) => ({ selectionId: item.id, ready: true, missingFields: [] })),
  }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
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
import { FOCUS_FFE_LINE_EVENT, focusFfeLinePending } from '@/lib/document/registry';

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
  focusFfeLinePending.request = null;
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
});
