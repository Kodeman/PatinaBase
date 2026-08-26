import { render, screen } from '@testing-library/react';

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

const renderInstall = (projectId = 'project-1') =>
  render(
    <FFESection
      projectId={projectId}
      projectName="Ellsworth"
      mode="install"
      sectionKey="install"
    />,
  );

const renderCare = (projectId = 'project-1') =>
  render(
    <FFESection
      projectId={projectId}
      projectName="Ellsworth"
      mode="install"
      sectionKey="care"
    />,
  );

describe('FF&E install/care head — SP-01/F03, F48', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockRooms = [{ id: 'room-1', name: 'Primary bedroom', budget_cents: 0 }];
    mockItems = [line()];
    mockInstruments = [];
    mockTradeScopes = [];
    mockAuthority = { data: null };
  });

  it('reads Install on an install document', () => {
    renderInstall();
    expect(screen.getByRole('heading', { name: 'Install' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Care' })).not.toBeInTheDocument();
  });

  it('reads Care, not Install, on a care document', () => {
    renderCare();
    expect(screen.getByRole('heading', { name: 'Care' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Install' })).not.toBeInTheDocument();
  });

  it('prints the SP-01 empty state verbatim on a care document with no open lines', () => {
    mockItems = [];
    renderCare();
    expect(
      screen.getByText('No FF&E lines remain open for care.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No FF&E lines are scheduled for installation.'),
    ).not.toBeInTheDocument();
  });

  it('keeps the install empty state unchanged when care is not the section', () => {
    mockItems = [];
    renderInstall();
    expect(
      screen.getByText('No FF&E lines are scheduled for installation.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No FF&E lines remain open for care.'),
    ).not.toBeInTheDocument();
  });

  it('F48 — Spec book → renders on install, no longer gated to project mode', () => {
    renderInstall();
    const link = screen.getByRole('link', { name: 'Spec book →' });
    expect(link).toHaveAttribute('href', '/doc/project-1/spec-book');
  });

  it('F48 — Spec book → also renders on care', () => {
    renderCare();
    const link = screen.getByRole('link', { name: 'Spec book →' });
    expect(link).toHaveAttribute('href', '/doc/project-1/spec-book');
  });
});
