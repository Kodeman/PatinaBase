import { fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockItems: Record<string, unknown>[] = [];
const mockLineUnfold = jest.fn(() => null);

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
jest.mock('../mobile/mobile-margin-chips', () => ({
  MobileMarginChips: () => null,
}));
jest.mock('../work-block', () => ({ WorkBlock: () => null }));
jest.mock('../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../strata-mini-rule', () => ({ StrataMiniRule: () => null }));
// LineUnfold itself is out of this lane's ownership; stubbed so the test
// exercises only what ffe-section.tsx renders around it.
jest.mock('../line-unfold', () => ({
  LineUnfold: (props: Record<string, unknown>) => mockLineUnfold(props),
}));

import { FFESection } from '../ffe-section';

const renderSection = (mode: 'project' | 'install' = 'project') =>
  render(<FFESection projectId="project-1" projectName="Ellsworth" mode={mode} />);

const furnishing = {
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
};

describe('SP-19/F57 — the unfolded FF&E line links to its spec-book entry', () => {
  beforeEach(() => {
    mockItems = [furnishing];
    mockLineUnfold.mockClear();
  });

  it('offers no such act while folded', () => {
    renderSection();
    expect(screen.queryByRole('link', { name: /Edit spec details/ })).not.toBeInTheDocument();
  });

  it('prints "Edit spec details →" on unfold, routed to that line\'s spec-book entry', () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /Walnut bed, king/ }));

    const act = screen.getByRole('link', { name: /Edit spec details/ });
    expect(act).toHaveAttribute(
      'href',
      '/doc/project-1/spec-book?ffeItemId=line-1',
    );
  });

  it('enables the artifact plate only for the Project/Pieces spread', () => {
    const project = renderSection('project');
    fireEvent.click(screen.getByRole('button', { name: /Walnut bed, king/ }));
    expect(mockLineUnfold).toHaveBeenLastCalledWith(
      expect.objectContaining({ showArtifactPlate: true }),
    );

    project.unmount();
    mockLineUnfold.mockClear();
    renderSection('install');
    fireEvent.click(screen.getByRole('button', { name: /Walnut bed, king/ }));
    expect(mockLineUnfold).toHaveBeenLastCalledWith(
      expect.objectContaining({ showArtifactPlate: false }),
    );
  });

  it('unfolds the Piece named by a direct-link request', async () => {
    render(
      <FFESection
        projectId="project-1"
        projectName="Ellsworth"
        mode="project"
        requestedLineId="line-1"
      />,
    );

    await waitFor(() =>
      expect(mockLineUnfold).toHaveBeenLastCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({ id: 'line-1' }),
          showArtifactPlate: true,
        }),
      ),
    );
  });
});
