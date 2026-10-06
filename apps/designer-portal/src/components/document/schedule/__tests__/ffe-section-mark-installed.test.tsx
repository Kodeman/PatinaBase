import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { todayYmd } from '@/lib/document/format';

let mockItems: Record<string, unknown>[] = [];
const mockRecordInstalled = jest.fn();

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

// C-34: the install manifest reads its own hooks; this suite is about the table.
jest.mock('@/components/document/buying/install-manifest', () => ({ InstallManifest: () => null }));

jest.mock('@patina/supabase', () => ({
  useStudioPurchases: () => ({ data: [] }),
  useProjectPoCostLines: () => ({ data: [] }),
  useProjectFFEItems: () => ({
    data: mockItems,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useProjectFfeReadiness: () => ({
    data: mockItems.map((item) => ({
      selectionId: item.id,
      ready: true,
      missingFields: [],
    })),
    isLoading: false,
    isError: false,
  }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
  useRecordFfeInstalled: () => ({
    mutateAsync: mockRecordInstalled,
    isPending: false,
  }),
}));

jest.mock('../add-to-project-sheet', () => ({
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
  useSendFurnishingsAuthorization: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
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

jest.mock('../../accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
}));
jest.mock('../../work-block', () => ({ WorkBlock: () => null }));
jest.mock('../../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('../../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../../strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('../../line-unfold', () => ({ LineUnfold: () => null }));

// The region root owns the work reads (D-B49); mocked like every other hook so
// the section mounts without a QueryClientProvider.
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

import { FFESection } from '../../ffe-section';

const line = (id: string, name: string, status: string) => ({
  id,
  name,
  quantity: 1,
  status,
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 100_000,
  line_total_cents: 100_000,
  project_room_id: null,
  received_quantity: null,
});

const renderInstall = () =>
  render(
    <FFESection
      projectId="project-1"
      projectName="Ellsworth"
      mode="install"
      sectionKey="install"
    />,
  );

const chooser = () =>
  screen.queryByRole('button', { name: /choose what.s installed/i });

describe('FF&E section · mark several installed (C-04)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockRecordInstalled.mockReset();
    mockItems = [
      line('line-a', 'Walnut bed, king', 'delivered'),
      line('line-b', 'Linen drapery', 'shipped'),
      line('line-c', 'Brass sconce pair', 'delivered'),
      line('line-d', 'Wool runner', 'installed'),
    ];
  });

  it('offers no selection while nothing is delivered', () => {
    mockItems = [
      line('line-b', 'Linen drapery', 'shipped'),
      line('line-d', 'Wool runner', 'installed'),
    ];
    renderInstall();
    expect(chooser()).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('offers the selection once a line is delivered', () => {
    renderInstall();
    expect(chooser()).toBeInTheDocument();
    expect(
      screen.getByText('2 delivered, not yet installed'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('ticks only delivered lines, and gives the others a reason', () => {
    renderInstall();
    fireEvent.click(chooser() as HTMLElement);
    expect(
      screen.getByRole('checkbox', { name: 'Mark Walnut bed, king installed' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('checkbox', { name: 'Mark Brass sconce pair installed' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('checkbox', { name: 'Mark Linen drapery installed' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: 'Mark Wool runner installed' }),
    ).toBeDisabled();
    expect(screen.getByText('not yet delivered')).toBeInTheDocument();
    expect(screen.getByText('installed')).toBeInTheDocument();
  });

  it('"Mark N installed" records exactly the ticked ids, then puts the ticks away', async () => {
    mockRecordInstalled.mockResolvedValue([]);
    renderInstall();
    fireEvent.click(chooser() as HTMLElement);
    expect(
      screen.queryByRole('button', { name: /mark \d+ installed/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Mark Walnut bed, king installed' }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Mark Brass sconce pair installed' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark 2 installed' }));

    expect(mockRecordInstalled).toHaveBeenCalledTimes(1);
    expect(mockRecordInstalled).toHaveBeenCalledWith({
      projectId: 'project-1',
      itemIds: ['line-a', 'line-c'],
      installedOn: todayYmd(),
    });
    await waitFor(() =>
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(),
    );
  });

  it('an unticked line falls out of the call', () => {
    mockRecordInstalled.mockResolvedValue([]);
    renderInstall();
    fireEvent.click(chooser() as HTMLElement);
    const bed = screen.getByRole('checkbox', {
      name: 'Mark Walnut bed, king installed',
    });
    fireEvent.click(bed);
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Mark Brass sconce pair installed' }),
    );
    fireEvent.click(bed);
    fireEvent.click(screen.getByRole('button', { name: 'Mark 1 installed' }));
    expect(mockRecordInstalled).toHaveBeenCalledWith({
      projectId: 'project-1',
      itemIds: ['line-c'],
      installedOn: todayYmd(),
    });
  });

  it('says "Couldn’t save" inline and keeps the ticks when refused', async () => {
    mockRecordInstalled.mockRejectedValue(new Error('refused'));
    renderInstall();
    fireEvent.click(chooser() as HTMLElement);
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Mark Walnut bed, king installed' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark 1 installed' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t save/i);
    expect(
      screen.getByRole('checkbox', { name: 'Mark Walnut bed, king installed' }),
    ).toBeChecked();
  });

  it('Put back leaves without writing anything', () => {
    renderInstall();
    fireEvent.click(chooser() as HTMLElement);
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Mark Walnut bed, king installed' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Put back' }));
    expect(mockRecordInstalled).not.toHaveBeenCalled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(chooser()).toBeInTheDocument();
  });
});
