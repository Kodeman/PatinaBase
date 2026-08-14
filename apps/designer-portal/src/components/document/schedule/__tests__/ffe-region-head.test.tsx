import { fireEvent, render, screen } from '@testing-library/react';

let mockItems: Record<string, unknown>[] = [];
let mockRooms: Record<string, unknown>[] = [];
let mockInstruments: Record<string, unknown>[] = [];
let mockTradeScopes: Record<string, unknown>[] = [];
let mockAuthority: { data: unknown } = { data: null };

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

jest.mock('@patina/supabase', () => ({
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
}));

const openAddToProject = jest.fn();
jest.mock('../add-to-project-sheet', () => ({
  AddToProjectSheet: () => null,
  openAddToProject: (...args: unknown[]) => openAddToProject(...args),
}));

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: mockRooms }),
  useAddDocumentRoom: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: { budget: (id: string) => ['working-budget', id] },
  useProjectInstruments: () => ({ data: mockInstruments }),
  useTradeScopes: () => ({ data: mockTradeScopes, isPending: false }),
  useProjectBillingAuthority: () => mockAuthority,
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
jest.mock('../../mobile/mobile-margin-chips', () => ({
  MobileMarginChips: () => null,
}));
jest.mock('../../work-block', () => ({ WorkBlock: () => null }));
jest.mock('../../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('../../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../../strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('../../line-unfold', () => ({ LineUnfold: () => null }));

import { FFESection } from '../../ffe-section';

/** A furnishing the studio still has to release. */
const line = (over: Record<string, unknown> = {}) => ({
  id: 'line-1',
  name: 'Walnut bed, king',
  quantity: 1,
  status: 'specified',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 1_230_000,
  line_total_cents: 1_230_000,
  project_room_id: 'room-1',
  room: { id: 'room-1', name: 'Primary bedroom' },
  received_quantity: null,
  ...over,
});

const renderProject = (projectId = 'project-1') =>
  render(
    <FFESection projectId={projectId} projectName="Ellsworth" mode="project" />,
  );

const renderInstall = (projectId = 'project-1') =>
  render(
    <FFESection projectId={projectId} projectName="Ellsworth" mode="install" />,
  );

describe('FF&E project-mode region head', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockRooms = [{ id: 'room-1', name: 'Primary bedroom', budget_cents: 0 }];
    mockItems = [line()];
    mockInstruments = [];
    mockTradeScopes = [];
    mockAuthority = { data: null };
  });

  it('inks exactly one ledger entry — Add to project, when there is no authority to release against', () => {
    renderProject();
    const inked = document.querySelectorAll('[data-action-variant="inked"]');
    expect(inked).toHaveLength(1);
    expect(inked[0]).toHaveTextContent('Add to project');
  });

  it('inks Release for authorization instead, once canRelease holds', () => {
    mockAuthority = { data: { state: 'active', agreementId: 'agreement-1' } };
    renderProject();
    const inked = document.querySelectorAll('[data-action-variant="inked"]');
    expect(inked).toHaveLength(1);
    expect(inked[0]).toHaveTextContent('Release for authorization');
    // Add to project survives, demoted rather than dropped.
    expect(screen.getByRole('button', { name: 'Add to project' })).toHaveAttribute(
      'data-action-variant',
      'secondary',
    );
  });

  it('renders the fold seam by default when the schedule has settled empty', () => {
    mockItems = [];
    renderProject();
    expect(
      screen.getByText('1 rooms · no lines yet', { exact: false }),
    ).toBeInTheDocument();
  });

  it('opens from the seam back to the full head, round-trip', () => {
    mockItems = [];
    renderProject();
    fireEvent.click(screen.getByRole('button', { name: /unfold/i }));
    expect(
      screen.getByRole('heading', { name: 'Project · FF&E' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Fold ↑' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fold ↑' }));
    expect(
      screen.queryByRole('heading', { name: 'Project · FF&E' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/unfold/i)).toBeInTheDocument();
  });

  it('leaves install mode rendering its own head, no RegionHead at all', () => {
    renderInstall();
    expect(screen.getByRole('heading', { name: 'Install' })).toBeInTheDocument();
    // RegionHead's fold control never appears in install mode.
    expect(
      screen.queryByRole('button', { name: 'Fold ↑' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/unfold/i)).not.toBeInTheDocument();
  });
});
