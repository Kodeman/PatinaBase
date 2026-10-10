/**
 * The Pieces region with `one-voice` and `ask-the-paper` pinned ON:
 *   US-21 Q14     — the project spread's head is Build the item list (inked),
 *                   Add to the job, Release for authorization and Record a
 *                   change; the own act, the held lead, the bill leader, the
 *                   reading lens, Tasks and the guided empty state retire.
 *   508-3         — a damaged Install row's one stamp is DAMAGED.
 *   508-4         — the punch list counts what is open, never a ratio.
 * Install keeps its flag-off cases: install mode is unchanged.
 */
import { act, render, screen, within } from '@testing-library/react';

let mockAskThePaper = true;
let mockOneVoice = true;
let mockItems: Record<string, unknown>[] = [];

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => ({
    value:
      flag === 'ask-the-paper'
        ? mockAskThePaper
        : flag === 'one-voice'
          ? mockOneVoice
          : false,
    isLoading: false,
  }),
}));

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

jest.mock('@/components/document/buying/install-manifest', () => ({
  InstallManifest: () => null,
}));

jest.mock('@/components/document/overlays/ask-maker-sheet', () => ({
  InstallReadingLine: () => null,
}));

jest.mock('@patina/supabase', () => ({
  useProjectRoomPlacements: () => ({ data: [] }),
  useProjectPalettes: () => ({ data: [] }),
  useProcurementDrafts: () => ({ data: [] }),
  useStudioPurchases: () => ({ data: [] }),
  useProjectPoCostLines: () => ({ data: [] }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useProjectFFEItems: () => ({
    data: mockItems,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useProjectFfeReadiness: () => ({
    data: mockItems.map((item) => ({ selectionId: item.id, ready: true, missingFields: [] })),
    isLoading: false,
    isError: false,
  }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
}));

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
jest.mock('@/components/document/work-block', () => ({
  WorkBlock: ({ heading, tally }: { heading?: string; tally?: string }) => (
    <div data-testid="work-block" data-heading={heading ?? ''} data-tally={tally ?? ''} />
  ),
}));
jest.mock('@/components/document/folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('@/components/document/strata-mark', () => ({ StrataMark: () => null }));
jest.mock('@/components/document/strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('@/components/document/line-unfold', () => ({ LineUnfold: () => null }));

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
import { __setDensityForTest } from '@/hooks/use-lens-density';

/** A line nobody has specified yet. */
const unspecified = {
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

/** Olsen's credenza: delivered with an open damage claim. */
const damaged = {
  id: 'line-credenza',
  name: 'Oak credenza',
  quantity: 1,
  status: 'delivered',
  blocked: false,
  item_type: 'fixed',
  product_id: 'product-1',
  unit_price_cents: 420_000,
  line_total_cents: 420_000,
  project_room_id: 'room-study',
  room: { id: 'room-study', name: 'Study' },
  received_quantity: null,
  vendor_name: 'Fixture Metalworks',
  item_claims: [{ state: 'drafted' }],
};

const renderProject = () =>
  render(<FFESection projectId="project-1" projectName="Chen Residence" mode="project" />);

const renderInstall = () =>
  render(
    <FFESection
      projectId="project-1"
      projectName="Olsen"
      mode="install"
      sectionKey="install"
    />,
  );

const headActs = () =>
  Array.from(
    document.querySelector('[data-region-head="ffe"]')!.querySelectorAll('[data-action-key]'),
  )
    .map((el) => el.getAttribute('data-action-key'))
    .filter((key) => key !== 'ffe-fold');

beforeEach(() => {
  window.localStorage.clear();
  mockAskThePaper = true;
  mockOneVoice = true;
  mockItems = [unspecified];
  act(() => {
    __setDensityForTest(null);
  });
});
afterEach(() => {
  __setDensityForTest(undefined);
});

describe('The project spread’s Pieces head (US-21 Q14)', () => {
  it('prints Build the item list, inked, beside Record a change at quiet', () => {
    renderProject();
    expect(document.getElementById('project-ffe')).toHaveAttribute('data-density', 'quiet');
    expect(headActs()).toEqual(['work-the-pieces', 'record-a-change-pieces-head']);
    const lead = document.querySelector('[data-action-key="work-the-pieces"]');
    expect(lead).toHaveTextContent('Build the item list');
    expect(lead).toHaveAttribute('data-action-variant', 'inked');
    expect(lead).toHaveAttribute('href', '/doc/project-1/pieces?lens=rough');
    expect(
      document.querySelector('[data-action-key="record-a-change-pieces-head"]'),
    ).toHaveAttribute('data-action-variant', 'secondary');
  });

  it('prints Build the item list, Add to the job, Release for authorization, Record a change in the full ledger', () => {
    act(() => {
      __setDensityForTest('full');
    });
    renderProject();
    expect(headActs()).toEqual([
      'work-the-pieces',
      'open-add-to-project',
      'release-for-authorization',
      'record-a-change-pieces-head',
    ]);
    expect(
      document.querySelectorAll('[data-region-head="ffe"] [data-action-variant="inked"]'),
    ).toHaveLength(1);
  });

  it('retires the own act, the held lead, the bill leader and the reading lens', () => {
    const uninvoiced = { ...unspecified, product_id: 'product-1', status: 'ordered' };
    mockItems = [unspecified, { ...unspecified, id: 'line-2' }, uninvoiced];
    act(() => {
      __setDensityForTest('full');
    });
    render(
      <FFESection projectId="project-1" projectName="Harrow" mode="project" projectStatus="on_hold" />,
    );
    expect(headActs()[0]).toBe('work-the-pieces');
    for (const retired of ['open-spec-book', 'open-the-pieces', 'bill-project-ffe']) {
      expect(headActs()).not.toContain(retired);
    }
    expect(screen.queryByText(/^Fill the \d+ placeholders?$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Spec the \d+ unspecified/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Bill \d+ uninvoiced lines?/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Read by/i)).not.toBeInTheDocument();
  });

  it('mounts no work block (Tasks) on the project spread', () => {
    act(() => {
      __setDensityForTest('full');
    });
    render(
      <FFESection projectId="project-1" projectName="Chen" mode="project" sectionKey="project" />,
    );
    expect(screen.queryByTestId('work-block')).not.toBeInTheDocument();
  });

  it('prints no guided empty state on an empty schedule', () => {
    mockItems = [];
    act(() => {
      __setDensityForTest('full');
    });
    renderProject();
    expect(screen.queryByText('No pieces yet.')).not.toBeInTheDocument();
    expect(screen.queryByText('Build the FF&E schedule')).not.toBeInTheDocument();
    expect(screen.getByText('by room · 0 rooms · 0 lines')).toBeInTheDocument();
  });
});

describe('A damaged Install row’s one stamp is DAMAGED (508-3)', () => {
  it('prints Damaged in terracotta where the state word stood, and the detail line drops it', () => {
    mockItems = [damaged];
    renderInstall();
    const row = document.getElementById('ffe-selection-line-credenza') as HTMLElement;
    const stamp = within(row).getByText('Damaged');
    expect(stamp).toHaveAttribute('data-install-stamp', 'damaged');
    expect(stamp).toHaveStyle({ color: 'var(--color-terracotta-ink)' });
    // The other stamp yields: no state word on the row.
    expect(row.querySelectorAll('[data-install-state]')).toHaveLength(1);
    expect(within(row).getByText('Fixture Metalworks · Study')).toBeInTheDocument();
  });

  it('keeps the state word and the status in the detail line with one-voice off', () => {
    mockOneVoice = false;
    mockItems = [damaged];
    renderInstall();
    const row = document.getElementById('ffe-selection-line-credenza') as HTMLElement;
    expect(row.querySelector('[data-install-stamp]')).toBeNull();
    expect(within(row).getByText('Fixture Metalworks · Study · Damaged')).toBeInTheDocument();
  });
});

describe('The punch list counts what is open (508-4)', () => {
  it('names the block Punch list and counts it open', () => {
    mockAskThePaper = true;
    mockItems = [{ ...damaged, item_claims: [], id: 'line-here' }];
    renderInstall();
    const block = screen.getByTestId('work-block');
    expect(block).toHaveAttribute('data-heading', 'Punch list');
    expect(block).toHaveAttribute('data-tally', 'open');
  });

  it('keeps The punch list and its ratio with one-voice off', () => {
    mockAskThePaper = true;
    mockOneVoice = false;
    mockItems = [{ ...damaged, item_claims: [], id: 'line-here' }];
    renderInstall();
    const block = screen.getByTestId('work-block');
    expect(block).toHaveAttribute('data-heading', 'The punch list');
    expect(block).toHaveAttribute('data-tally', '');
  });
});
