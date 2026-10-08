/**
 * US-19 FR2 (design-review-2) — the Pieces region under `one-voice`:
 *   F2-18 / 508-2 — `Record a change` prints on the project spread's Pieces
 *                   head at every density, as it does on install and care.
 *   508-1         — under one-voice it prints whatever ask-the-paper says.
 *   F2-19 / 499-10 — the head's spec act is the own-act table's name.
 *   499-7         — the empty state's title is `No pieces yet.`.
 *   508-3         — a damaged Install row's one stamp is DAMAGED.
 *   508-4         — the punch list counts what is open, never a ratio.
 * With both flags off the head is today's.
 */
import { act, render, screen, within } from '@testing-library/react';

let mockAskThePaper = false;
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
import { ownAct } from '@/lib/document/act-names';

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
  mockAskThePaper = false;
  mockOneVoice = true;
  mockItems = [unspecified];
  act(() => {
    __setDensityForTest(null);
  });
});
afterEach(() => {
  __setDensityForTest(undefined);
});

describe('Record a change on the project spread’s Pieces head (F2-18, 508-1/2)', () => {
  it('prints beside the leader at quiet, scored, with ask-the-paper off', () => {
    renderProject();
    expect(document.getElementById('project-ffe')).toHaveAttribute('data-density', 'quiet');
    expect(headActs()).toEqual(['open-spec-book', 'record-a-change-pieces-head']);
    const change = document.querySelector('[data-action-key="record-a-change-pieces-head"]');
    expect(change).toHaveTextContent('Record a change');
    expect(change).toHaveAttribute('data-action-variant', 'secondary');
  });

  it('prints second in the full ledger', () => {
    act(() => {
      __setDensityForTest('full');
    });
    renderProject();
    expect(headActs().slice(0, 2)).toEqual(['open-spec-book', 'record-a-change-pieces-head']);
  });

  it('keeps today’s head with one-voice off: the leader alone at quiet', () => {
    mockOneVoice = false;
    mockAskThePaper = true;
    renderProject();
    expect(headActs()).toEqual(['open-spec-book']);
  });

  it('prints no Record a change with both flags off', () => {
    mockOneVoice = false;
    act(() => {
      __setDensityForTest('full');
    });
    renderProject();
    expect(headActs()).not.toContain('record-a-change-pieces-head');
  });
});

describe('The Pieces head reads its spec act from the own-act table (F2-19, 499-10)', () => {
  it('names the leader exactly as ownAct does', () => {
    mockItems = [unspecified, { ...unspecified, id: 'line-2' }, { ...unspecified, id: 'line-3' }];
    renderProject();
    const own = ownAct('project', {
      inquiryOpen: false,
      firstMissingEssential: null,
      proposalState: null,
      clientFirstName: null,
      unspecifiedCount: 3,
      releaseEligible: false,
      install: null,
    })!.label;
    expect(own).toBe('Fill the 3 placeholders');
    expect(document.querySelector('[data-action-key="open-spec-book"]')).toHaveTextContent(own);
  });
});

describe('A held job’s Pieces head leads with the own act (F3-10)', () => {
  /** Harrow's line: specified, ordered, priced, never invoiced. */
  const uninvoiced = { ...unspecified, product_id: 'product-1', status: 'ordered' };
  const renderHarrow = (projectStatus?: string) =>
    render(
      <FFESection
        projectId="project-1"
        projectName="Harrow"
        mode="project"
        projectStatus={projectStatus}
      />,
    );

  beforeEach(() => {
    mockItems = [uninvoiced];
    act(() => {
      __setDensityForTest('full');
    });
  });

  it('leads with Open the pieces, inked, and Bill 1 uninvoiced line prints plain', () => {
    renderHarrow('on_hold');
    expect(headActs()[0]).toBe('open-the-pieces');
    const lead = document.querySelector('[data-action-key="open-the-pieces"]');
    expect(lead).toHaveTextContent('Open the pieces');
    expect(lead).toHaveAttribute('data-action-variant', 'inked');
    expect(
      document.querySelectorAll('[data-region-head="ffe"] [data-action-variant="inked"]'),
    ).toHaveLength(1);
    expect(document.querySelector('[data-action-key="bill-project-ffe"]')).toHaveAttribute(
      'data-action-variant',
      'secondary',
    );
    expect(headActs()[1]).toBe('record-a-change-pieces-head');
  });

  it('prints Open the pieces beside Record a change at quiet', () => {
    act(() => {
      __setDensityForTest(null);
    });
    renderHarrow('on_hold');
    expect(headActs()).toEqual(['open-the-pieces', 'record-a-change-pieces-head']);
  });

  it('keeps the bill leader on a job that is not held', () => {
    renderHarrow('active');
    expect(headActs()[0]).toBe('bill-project-ffe');
    expect(headActs()).not.toContain('open-the-pieces');
  });

  it('keeps today’s head with one-voice off, held or not', () => {
    mockOneVoice = false;
    renderHarrow('on_hold');
    expect(headActs()[0]).toBe('bill-project-ffe');
    expect(headActs()).not.toContain('open-the-pieces');
  });
});

describe('The work block counts what is open (F3-20)', () => {
  beforeEach(() => {
    act(() => {
      __setDensityForTest('full');
    });
  });
  const renderWork = () =>
    render(
      <FFESection projectId="project-1" projectName="Chen" mode="project" sectionKey="project" />,
    );

  it('asks the block for the open count on the project spread', () => {
    renderWork();
    const block = screen.getByTestId('work-block');
    expect(block).toHaveAttribute('data-heading', '');
    expect(block).toHaveAttribute('data-tally', 'open');
  });

  it('keeps the default tally with one-voice off', () => {
    mockOneVoice = false;
    renderWork();
    expect(screen.getByTestId('work-block')).toHaveAttribute('data-tally', '');
  });
});

describe('The empty schedule (499-7)', () => {
  it('titles it No pieces yet. and keeps the act beneath verbatim', () => {
    mockItems = [];
    act(() => {
      __setDensityForTest('full');
    });
    renderProject();
    expect(screen.getByText('No pieces yet.')).toBeInTheDocument();
    expect(screen.queryByText('Build the FF&E schedule')).not.toBeInTheDocument();
    expect(screen.getByText('Open the spec book')).toBeInTheDocument();
  });

  it('keeps Build the FF&E schedule with one-voice off', () => {
    mockOneVoice = false;
    mockItems = [];
    act(() => {
      __setDensityForTest('full');
    });
    renderProject();
    expect(screen.getByText('Build the FF&E schedule')).toBeInTheDocument();
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
