/**
 * US-19 FR3 F3-2 / FR4 (P-2) — a Pieces act lands with focus on Pieces' own
 * control: `File the claim` on the damaged line's claim control (or, at PO
 * grain, Receiving's claim card), `Follow up with the maker` in the maker
 * composer with the body focused, `Send the purchase order` on the drafted
 * PO's send act, `Spec the N unspecified` on the first unspecified line's spec
 * act, the held head's `Open the pieces` on the first line's unfold control,
 * and `Release for authorization` on the Pieces head's own entry (FR5 F5-1),
 * held form included, or on the lift's entry when the head prints none (FR6
 * F6-2). `Choose the piece` heads the lines list (F6-5). The press is taken (the event cancelled) only when Pieces carries
 * the act; otherwise it keeps its old landing.
 */
import type { ReactElement } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ACT_LANDING_EVENTS, ffeActLandingOf, type FfeActLanding } from '@/lib/document/act-names';
import type { NeedLine } from '@/lib/document/desk-derivation';

let mockItems: Record<string, unknown>[] = [];
let mockOneVoice = false;
// An executed agreement behind the project is what lets Pieces release.
let mockAuthority: unknown = null;
// Stands in for the unfold: the Order cell's PO control (order-cell.tsx), the
// drafted PO's send act (line-unfold.tsx) and, on a line with an open claim,
// the claim's act (claim-acts.tsx).
const mockLineUnfold = jest.fn((props: Record<string, unknown>) => {
  const item = props.item as
    | {
        id: string;
        item_claims?: unknown[];
        purchase_order?: { status?: string; sent_at?: string | null } | null;
      }
    | undefined;
  const po = item?.purchase_order;
  return (
    <>
      <div role="group" aria-label="Order" data-testid="line-po-cell">
        <button type="button" data-po-control aria-label={`Open the order for ${item?.id}`}>
          PO
        </button>
      </div>
      {po?.status === 'draft' && !po.sent_at && (
        <button type="button" data-action-key="send-ffe-line-to-vendor">
          Send to vendor
        </button>
      )}
      {(item?.item_claims ?? []).length > 0 && (
        <button type="button" data-action-key="notify-vendor-of-ffe-claim">
          Notify the maker
        </button>
      )}
    </>
  );
});
const mockOpenLedger = jest.fn();

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({ value: name === 'one-voice' && mockOneVoice, isLoading: false }),
}));
jest.mock('../command-bar', () => ({
  openLedger: (...args: unknown[]) => mockOpenLedger(...args),
}));
jest.mock('../orders-book-receiving', () => ({ receivingClaimLanding: { pending: false } }));
jest.mock('../orders-ledger', () => ({ ordersSendLanding: { pending: false } }));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn(), regionFolded: jest.fn() },
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
  useUser: () => ({ user: { id: 'designer-1' } }),
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
  useProjectBillingAuthority: () => ({ data: mockAuthority }),
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
jest.mock('../accounts/invoice-overlays', () => ({ openInvoiceComposer: jest.fn() }));
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

import { FFESection, ffeActLine } from '../ffe-section';
import { ReleaseLift } from '../worktable/release-lift';
import { START_RELEASE_EVENT } from '../commercial/void-supersede-act';
import { RECORD_A_CHANGE_ON_PIECE_EVENT } from '../overlays/record-a-change-sheet';
import { receivingClaimLanding } from '../orders-book-receiving';
import { ordersSendLanding } from '../orders-ledger';
import { __setDensityForTest } from '@/hooks/use-lens-density';

/** The follow-up composer holds a draft through react-query's mutation. */
function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const need = (kind: NeedLine['kind']) =>
  ({ kind, text: kind, actionLabel: '', urgent: false }) as unknown as NeedLine;

const line = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Piece ${id}`,
  quantity: 1,
  status: 'ordered',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 100_000,
  line_total_cents: 100_000,
  project_room_id: 'room-1',
  room: { id: 'room-1', name: 'Living Room' },
  received_quantity: 0,
  ...over,
});

const answered = line('line-answered', {
  purchase_order: { id: 'po-1', po_number: 'WS-101', status: 'sent', sent_at: '2026-09-01', acknowledged_at: '2026-09-02' },
});
const newer = line('line-newer', {
  purchase_order: { id: 'po-2', po_number: 'WS-102', status: 'sent', sent_at: '2026-09-20', acknowledged_at: null },
});
const older = line('line-older', {
  purchase_order: { id: 'po-3', po_number: 'WS-103', status: 'sent', sent_at: '2026-09-10', acknowledged_at: null },
});
const damaged = line('line-damaged', {
  status: 'delivered',
  received_quantity: 1,
  item_claims: [{ id: 'claim-1', state: 'drafted' }],
});
const halloran = line('line-halloran', {
  name: 'Halloran dining table',
  product_id: 'product-1',
  vendor_name: 'Nordic Atelier',
  purchase_order: {
    id: 'po-4',
    po_number: 'NA-2026-077',
    status: 'sent',
    sent_at: '2026-10-01',
    acknowledged_at: null,
  },
});
const specified = (id: string, over: Record<string, unknown> = {}) =>
  line(id, { product_id: `product-${id}`, ...over });

/** What page.tsx's band press, and the Standing sheet's rows, do under
 *  one-voice; true when taken. */
const press = (detail: FfeActLanding) =>
  !window.dispatchEvent(new CustomEvent(ACT_LANDING_EVENTS.ffeAct, { detail, cancelable: true }));

beforeEach(() => {
  __setDensityForTest('full');
  mockLineUnfold.mockClear();
  mockOpenLedger.mockClear();
  mockOneVoice = false;
  mockAuthority = null;
  receivingClaimLanding.pending = false;
  ordersSendLanding.pending = false;
  window.localStorage.clear();
});
afterEach(() => {
  __setDensityForTest(undefined);
});

describe('ffeActLine', () => {
  it('picks the damaged line with an open claim, and the oldest unanswered PO', () => {
    expect(ffeActLine([answered, newer, older, damaged], 'claim')?.id).toBe('line-damaged');
    expect(ffeActLine([answered, newer, older, damaged], 'follow-up')?.id).toBe('line-older');
  });

  it('picks the first unspecified line, and the first line whose PO is drafted and unsent', () => {
    const drafted = specified('line-drafted', {
      purchase_order: { status: 'draft', sent_at: null, acknowledged_at: null },
    });
    const sentDraft = specified('line-sent', {
      purchase_order: { status: 'draft', sent_at: '2026-09-01', acknowledged_at: null },
    });
    expect(ffeActLine([specified('a'), line('b'), line('c')], 'spec')?.id).toBe('b');
    expect(ffeActLine([specified('a'), { ...line('b'), removed_at: '2026-10-01' }], 'spec')).toBeNull();
    expect(ffeActLine([answered, sentDraft, drafted], 'send')?.id).toBe('line-drafted');
    expect(ffeActLine([answered, sentDraft], 'send')).toBeNull();
  });

  it('skips a removed line, a settled claim, and a delivered or cancelled PO', () => {
    expect(
      ffeActLine(
        [
          { ...damaged, removed_at: '2026-10-01' },
          line('line-settled', { item_claims: [{ state: 'resolved' }] }),
        ],
        'claim',
      ),
    ).toBeNull();
    expect(
      ffeActLine(
        [
          line('d', { purchase_order: { sent_at: '2026-09-01', acknowledged_at: null, status: 'delivered' } }),
          line('c', { purchase_order: { sent_at: '2026-09-01', acknowledged_at: null, status: 'cancelled' } }),
          line('u', { purchase_order: { sent_at: null, acknowledged_at: null, status: 'draft' } }),
        ],
        'follow-up',
      ),
    ).toBeNull();
  });
});

describe('a need’s act lands on its line’s control (F3-2)', () => {
  it('File the claim: unfolds the damaged line and focuses its claim control', async () => {
    // Pieces closed by the designer on an earlier visit: the landing unfolds it.
    window.localStorage.setItem('patina:doc-fold:project-1:ffe', '1');
    mockItems = [answered, damaged];
    render(<FFESection projectId="project-1" projectName="Chen" mode="project" />);

    let taken = false;
    act(() => {
      taken = press('claim');
    });
    expect(taken).toBe(true);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Notify the maker' })),
    );
    expect(document.getElementById('ffe-selection-line-damaged')).toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  it('Follow up with the maker (520-2): opens the maker composer on the oldest unanswered PO, body focused', async () => {
    mockItems = [answered, newer, halloran, older];
    renderWithQuery(<FFESection projectId="project-1" projectName="Halloran" mode="project" />);

    let taken = false;
    act(() => {
      taken = press('follow-up');
    });
    expect(taken).toBe(true);
    const sheet = await screen.findByRole('dialog', { name: 'Follow up with the maker' });
    expect(within(sheet).getByLabelText('Subject')).toHaveValue('WS-103 — following up');
    await waitFor(() => expect(document.activeElement).toBe(within(sheet).getByLabelText('Note')));
    // Never the order ledger, never the PO button.
    expect(mockOpenLedger).not.toHaveBeenCalled();
    expect(within(sheet).getByRole('button', { name: 'Hold for review' })).toBeInTheDocument();
  });

  it('the Pieces head’s Follow up with the maker opens the composer named for its PO', async () => {
    mockOneVoice = true;
    mockItems = [halloran];
    renderWithQuery(
      <FFESection
        projectId="project-1"
        projectName="Halloran"
        mode="project"
        needs={[need('po_unacknowledged')]}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Follow up with the maker' }));
    const sheet = await screen.findByRole('dialog', { name: 'Follow up with the maker' });
    expect(within(sheet).getByLabelText('Subject')).toHaveValue('NA-2026-077 — following up');
    expect(within(sheet).getByText('Nordic Atelier')).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(within(sheet).getByLabelText('Note')));
    expect(mockOpenLedger).not.toHaveBeenCalled();
  });

  it('File the claim at PO grain (520-4): opens Receiving with its claim landing armed', async () => {
    mockItems = [answered];
    render(
      <FFESection
        projectId="project-1"
        projectName="Olsen"
        mode="project"
        needs={[need('damage_claim')]}
      />,
    );

    let taken = false;
    act(() => {
      taken = press('claim');
    });
    expect(taken).toBe(true);
    await waitFor(() =>
      expect(mockOpenLedger).toHaveBeenCalledWith('orders', {
        page: 'receiving',
        projectId: 'project-1',
      }),
    );
    expect(receivingClaimLanding.pending).toBe(true);
  });

  it('Send the purchase order (522-3): focuses the drafted PO’s send act', async () => {
    mockItems = [
      answered,
      line('line-drafted', {
        purchase_order: { id: 'po-5', po_number: 'WS-105', status: 'draft', sent_at: null },
      }),
    ];
    render(<FFESection projectId="project-1" projectName="Olsen" mode="project" />);

    let taken = false;
    act(() => {
      taken = press('send');
    });
    expect(taken).toBe(true);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Send to vendor' })),
    );
    expect(document.getElementById('ffe-selection-line-drafted')).toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  it('Send the purchase order with no line on the drafted PO (walk D3): opens the Orders ledger with its send landing armed', async () => {
    // Olsen: the need counts the project's drafted PO; no line carries it.
    mockItems = [answered];
    render(
      <FFESection
        projectId="project-1"
        projectName="Olsen"
        mode="project"
        needs={[need('po_unsent')]}
      />,
    );

    let taken = false;
    act(() => {
      taken = press('send');
    });
    expect(taken).toBe(true);
    await waitFor(() =>
      expect(mockOpenLedger).toHaveBeenCalledWith('orders', {
        page: 'ledger',
        projectId: 'project-1',
      }),
    );
    expect(ordersSendLanding.pending).toBe(true);
  });

  it('a held order’s po_unsent need leaves Send untaken with no drafted line', () => {
    mockItems = [answered];
    render(
      <FFESection
        projectId="project-1"
        projectName="Olsen"
        mode="project"
        needs={[{ ...need('po_unsent'), releaseHeld: true } as NeedLine]}
      />,
    );
    let taken = true;
    act(() => {
      taken = press('send');
    });
    expect(taken).toBe(false);
    expect(mockOpenLedger).not.toHaveBeenCalled();
    expect(ordersSendLanding.pending).toBe(false);
  });

  it('Spec the N unspecified (522-3): focuses the first unspecified line’s spec act', async () => {
    mockItems = [specified('line-a'), line('line-unspecified'), line('line-later')];
    render(<FFESection projectId="project-1" projectName="Chen" mode="project" />);

    let taken = false;
    act(() => {
      taken = press('spec');
    });
    expect(taken).toBe(true);
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('data-action-key', 'edit-ffe-line-spec-details'),
    );
    expect(document.getElementById('ffe-selection-line-unspecified')).toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  it('leaves the press untaken when no line carries the act', () => {
    mockItems = [specified('line-answered', { purchase_order: answered.purchase_order })];
    render(<FFESection projectId="project-1" projectName="Chen" mode="project" />);
    let taken: boolean[] = [];
    act(() => {
      taken = (['claim', 'follow-up', 'send', 'spec'] as const).map(press);
    });
    expect(taken).toEqual([false, false, false, false]);
    expect(mockOpenLedger).not.toHaveBeenCalled();
  });
});

describe('the held head’s Open the pieces (523-1)', () => {
  it('lands on the first line’s unfold control', async () => {
    mockOneVoice = true;
    mockItems = [specified('line-first'), specified('line-second')];
    render(
      <FFESection projectId="project-1" projectName="Harrow" mode="project" projectStatus="on_hold" />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open the pieces' }));
    const first = document.querySelector('#ffe-selection-line-first button[aria-expanded]');
    expect(first).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(first));
  });

  it('with no lines, lands on the Pieces heading', async () => {
    mockOneVoice = true;
    mockItems = [];
    render(
      <FFESection projectId="project-1" projectName="Harrow" mode="project" projectStatus="on_hold" />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open the pieces' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById('ffe-region-heading-project-1')),
    );
  });
});

describe('the band’s Release for authorization lands on the head’s own entry (F5-1)', () => {
  /** What page.tsx's band press does with the own act's printed name. */
  const pressRelease = () => {
    const landing = ffeActLandingOf('Release for authorization');
    expect(landing).toBe('release');
    return press(landing as FfeActLanding);
  };

  it('unfolds a folded Pieces and focuses the entry, without pressing it', async () => {
    window.localStorage.setItem('patina:doc-fold:project-1:ffe', '1');
    mockOneVoice = true;
    mockAuthority = { state: 'active', agreementId: 'agreement-1' };
    mockItems = [specified('line-ready')];
    render(<FFESection projectId="project-1" projectName="Chen" mode="project" />);

    let taken = false;
    act(() => {
      taken = pressRelease();
    });
    expect(taken).toBe(true);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Release for authorization' }),
      ),
    );
    expect(document.activeElement).toHaveAttribute('data-action-key', 'release-for-authorization');
    // Landed, never clicked: the schedule is not turned into a selection.
    expect(screen.queryByText('Choose what to release')).not.toBeInTheDocument();
  });

  it('lands on the held form, which keeps aria-disabled and its printed reason', async () => {
    mockOneVoice = true;
    mockAuthority = { state: 'active', agreementId: 'agreement-1' };
    mockItems = [specified('line-blocked', { blocked: true })];
    render(<FFESection projectId="project-1" projectName="Chen" mode="project" />);

    let taken = false;
    act(() => {
      taken = pressRelease();
    });
    expect(taken).toBe(true);
    const entry = screen.getByRole('button', { name: 'Release for authorization' });
    await waitFor(() => expect(document.activeElement).toBe(entry));
    expect(entry).toHaveAttribute('aria-disabled', 'true');
    expect(entry).not.toHaveAttribute('disabled');
    expect(screen.getByText('No lines are currently eligible for release.')).toBeInTheDocument();
  });

  it('leaves the press untaken when the head prints no release', () => {
    mockOneVoice = true;
    mockItems = [specified('line-ready')];
    render(<FFESection projectId="project-1" projectName="Chen" mode="project" />);

    let taken = true;
    act(() => {
      taken = pressRelease();
    });
    expect(taken).toBe(false);
  });

  it('lands on the lift’s entry when the release is lifted to the Delivery table (F6-2)', async () => {
    mockOneVoice = true;
    mockAuthority = { state: 'active', agreementId: 'agreement-1' };
    mockItems = [specified('line-ready')];
    const started = jest.fn();
    window.addEventListener(START_RELEASE_EVENT, started);
    // page.tsx prints the lift outside Pieces, at the Delivery table's head.
    render(
      <>
        <ReleaseLift />
        <FFESection
          projectId="project-1"
          projectName="Chen"
          mode="project"
          releaseLeaderElsewhere
        />
      </>,
    );
    // The head prints none: the lift's is the one entry on the page.
    const entries = screen.getAllByRole('button', { name: 'Release for authorization' });
    expect(entries).toHaveLength(1);
    const liftEntry = entries[0];
    expect(liftEntry.closest('[data-release-lift]')).not.toBeNull();

    let taken = false;
    act(() => {
      taken = pressRelease();
    });
    expect(taken).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(liftEntry));
    // Landed, never clicked: no ceremony was started.
    expect(started).not.toHaveBeenCalled();
    window.removeEventListener(START_RELEASE_EVENT, started);
  });
});

describe('Choose the piece sits with the lines (F6-5)', () => {
  it('heads the lines list, directly before the first line row, and lands focus on itself', async () => {
    mockOneVoice = true;
    mockItems = [specified('line-first'), specified('line-second')];
    const scrolled: Element[] = [];
    const originalScroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this);
    };
    try {
      render(<FFESection projectId="project-1" projectName="Chen" mode="project" />);
      act(() => {
        window.dispatchEvent(new CustomEvent(RECORD_A_CHANGE_ON_PIECE_EVENT, { detail: {} }));
      });

      const prompt = await screen.findByTestId('ffe-choose-the-piece');
      const firstRow = document.getElementById('ffe-selection-line-first');
      expect(firstRow).not.toBeNull();
      // Inside the lines list, the item just before the first line row.
      const promptItem = prompt.closest('li');
      expect(promptItem).not.toBeNull();
      expect(promptItem?.parentElement).toBe(firstRow?.parentElement);
      expect(promptItem?.nextElementSibling).toBe(firstRow);
      await waitFor(() => expect(document.activeElement).toBe(prompt));
      expect(scrolled).toContain(firstRow);
    } finally {
      Element.prototype.scrollIntoView = originalScroll;
    }
  });
});
