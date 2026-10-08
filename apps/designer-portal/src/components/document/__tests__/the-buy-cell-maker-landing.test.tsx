/**
 * US-19 FR2 511-R1 (SQ-517) — `Add the maker` lands with focus on the line's
 * maker selector in every mode, install included. Install mode's buy cell is
 * otherwise read-only (`canEditSelection: mode === 'project'`), which left the
 * landing nowhere to land.
 *
 * The real FFESection landing, the real Install reading line and the real buy
 * cell render here; the unfold carries only the buy cell, with the same
 * `canEdit` the real unfold hands it.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockItems: Record<string, unknown>[] = [];

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => ({ value: flag === 'ask-the-paper', isLoading: false }),
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn(), regionFolded: jest.fn() },
}));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@/components/document/buying/install-manifest', () => ({
  InstallManifest: () => null,
}));

jest.mock('@patina/supabase', () => {
  const idle = { mutateAsync: jest.fn(), isPending: false };
  return {
    buyingPhase2Keys: { all: ['buying-phase2'] },
    useInstallWindow: () => ({ isSuccess: true, data: null }),
    useProcurementDrafts: () => ({ data: [], isPending: false, isError: false }),
    useStudioPurchases: () => ({ data: [] }),
    useProjectPoCostLines: () => ({ data: [] }),
    useUnresolvedProcurementExceptions: () => ({ data: [] }),
    useProjectFFEItems: () => ({ data: mockItems, isLoading: false, isError: false, refetch: jest.fn() }),
    useProjectFfeReadiness: () => ({
      data: mockItems.map((item) => ({ selectionId: item.id, ready: true, missingFields: [] })),
    }),
    useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
    useFfeInvoiceCoverage: () => ({ data: {} }),
    // The buy cell's own reads and writes.
    useFindVendorMatch: () => idle,
    useResolveOrCreateVendor: () => idle,
    useSetFfeLineCommercials: () => idle,
    useVendors: () => ({ data: undefined }),
    useProductPrices: () => ({ data: undefined }),
  };
});

// The unfold, reduced to the buy cell with the edit right the real one hands it.
jest.mock('@/components/document/line-unfold', () => {
  const { TheBuyCell } = jest.requireActual('@/components/document/line-unfold/the-buy-cell');
  return {
    LineUnfold: ({
      item,
      projectId,
      canEditSelection = true,
    }: {
      item: Record<string, unknown>;
      projectId: string;
      canEditSelection?: boolean;
    }) => (
      <TheBuyCell item={item} po={null} projectId={projectId} canEdit={canEditSelection} />
    ),
  };
});
jest.mock('@/components/document/buying/com-piece', () => ({ ComPiece: () => null }));
jest.mock('@/components/document/line-unfold/sample-request', () => ({ LineSamples: () => null }));

jest.mock('@/components/document/schedule/add-to-project-sheet', () => ({
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
jest.mock('@/components/document/accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
}));
jest.mock('@/components/document/work-block', () => ({ WorkBlock: () => null }));
jest.mock('@/components/document/folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('@/components/document/strata-mark', () => ({ StrataMark: () => null }));
jest.mock('@/components/document/strata-mini-rule', () => ({ StrataMiniRule: () => null }));
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

import { FFESection } from '@/components/document/ffe-section';

/** 506-1: Cedar Lane's Side table — no vendor, no PO vendor, no brand. */
const sideTable = {
  id: 'line-side-table',
  name: 'Side table',
  quantity: 1,
  status: 'approved',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 0,
  line_total_cents: 0,
  project_room_id: 'room-study',
  room: { id: 'room-study', name: 'Study' },
  received_quantity: null,
  vendor_id: null,
  vendor_name: null,
  product: null,
  purchase_order_id: null,
  purchase_order: null,
};

beforeEach(() => {
  mockItems = [sideTable];
});

describe('Add the maker in install mode (511-R1)', () => {
  it('lands with focus on the line maker selector', async () => {
    render(
      <FFESection projectId="project-1" projectName="Cedar Lane" mode="install" sectionKey="install" />,
    );
    const act = await screen.findByRole('button', { name: 'Ask the maker for a date' });
    expect(act).toHaveAccessibleDescription('No maker is recorded on this line.');

    fireEvent.click(screen.getByRole('button', { name: 'Add the maker' }));

    await waitFor(
      () => expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Maker' })),
      { timeout: 2000 },
    );
    // Only the maker is offered; the trade cost stays read-only in install mode.
    expect(screen.queryByRole('textbox', { name: 'Trade cost' })).toBeNull();
  });
});
