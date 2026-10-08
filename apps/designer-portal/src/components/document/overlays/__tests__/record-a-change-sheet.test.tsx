import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

let mockAskThePaper = true;
let mockItems: Record<string, unknown>[] = [];

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => ({
    value: flag === 'ask-the-paper' ? mockAskThePaper : false,
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

// The destinations are proven in their own suites; here they only have to be
// reached, with the right line.
jest.mock('@/components/document/overlays/amendment-sheet', () => ({
  AmendmentSheet: ({ open, projectId }: { open: boolean; projectId: string }) =>
    open ? <div data-testid="amendment-sheet">{projectId}</div> : null,
}));

// D10/D11 (SQ-545): the focus and Esc tests stand in the real sheet.
let mockRealChangeOrder = false;
jest.mock('@/components/document/line-unfold/change-order', () => {
  const actual = jest.requireActual('@/components/document/line-unfold/change-order');
  return {
    ...actual,
    ChangeOrderSheet: (props: { item: { id: string }; poLabel: string }) =>
      mockRealChangeOrder ? (
        <actual.ChangeOrderSheet {...props} />
      ) : (
        <div data-testid="change-order-sheet">
          {props.item.id} · {props.poLabel}
        </div>
      ),
  };
});

// ── The Pieces region's harness (ffe-section-spec-details-link.test.tsx) ──

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@/components/document/buying/install-manifest', () => ({
  InstallManifest: () => null,
}));

// The install reading is proven in its own suite; here it only stands where
// the Install head's leader stands, so the order of acts can be read.
jest.mock('@/components/document/overlays/ask-maker-sheet', () => ({
  InstallReadingLine: () => (
    <button type="button" data-action-key="install-reading-act">
      Ask the maker for a date
    </button>
  ),
}));

jest.mock('@patina/supabase', () => ({
  useProjectV2: () => ({ data: null }),
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
  }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
  useStartPurchaseOrderChange: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useFindVendorMatch: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useResolveOrCreateVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useVendors: () => ({ data: { data: [] } }),
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
jest.mock('@/components/document/work-block', () => ({ WorkBlock: () => null }));
jest.mock('@/components/document/folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('@/components/document/strata-mark', () => ({ StrataMark: () => null }));
jest.mock('@/components/document/strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('@/components/document/line-unfold', () => ({
  LineUnfold: ({ item }: { item: { id: string } }) => (
    <div data-testid={`line-unfold-${item.id}`} />
  ),
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

import { FFESection } from '@/components/document/ffe-section';
import { __setDensityForTest } from '@/hooks/use-lens-density';
import {
  RECORD_A_CHANGE_ON_PIECE_EVENT,
  RecordAChangeSheet,
  openRecordAChange,
} from '../record-a-change-sheet';

const onPO = {
  id: 'line-sofa',
  name: 'Linen slipcovered sofa — 96 in',
  quantity: 1,
  status: 'ordered',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 640_000,
  line_total_cents: 640_000,
  project_room_id: null,
  received_quantity: null,
  vendor_name: 'Nordic Atelier',
  purchase_order: { id: 'po-1', po_number: 'NA-2026-077', status: 'confirmed' },
};

const noPO = {
  id: 'line-lamp',
  name: 'Brass reading lamp',
  quantity: 1,
  status: 'specified',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 42_000,
  line_total_cents: 42_000,
  project_room_id: null,
  received_quantity: null,
  purchase_order: null,
};

const renderRouter = () =>
  render(<RecordAChangeSheet projectId="project-1" clientName="Halloran" />);

const renderPaper = () =>
  render(
    <>
      <FFESection projectId="project-1" projectName="Halloran House" mode="project" />
      <RecordAChangeSheet projectId="project-1" clientName="Halloran" />
    </>,
  );

const continueAct = () => screen.getByRole('button', { name: /Continue/ });

beforeEach(() => {
  mockAskThePaper = true;
  mockRealChangeOrder = false;
  mockItems = [onPO, noPO];
  __setDensityForTest('full');
});
afterEach(() => {
  __setDensityForTest(undefined);
});

describe('Record a change — the router (D5)', () => {
  it('mounts nothing and hears nothing with ask-the-paper off', () => {
    mockAskThePaper = false;
    const { container } = renderRouter();
    expect(container).toBeEmptyDOMElement();

    act(() => openRecordAChange({ origin: 'pieces-head' }));
    expect(screen.queryByText('What changed?')).not.toBeInTheDocument();
  });

  it('asks one question with two native radio options and their helpers', () => {
    renderRouter();
    act(() => openRecordAChange({ origin: 'pieces-head' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('group', { name: 'What changed?' })).toBeInTheDocument();
    const piece = within(dialog).getByRole('radio', { name: /On a piece/ });
    const agreement = within(dialog).getByRole('radio', { name: /On the agreement/ });
    expect(piece).toHaveAccessibleDescription(
      'Swap, add or remove a piece, or change its maker.',
    );
    expect(agreement).toHaveAccessibleDescription('The scope, the fee or the terms.');
  });

  it('holds Continue, focusable, with its reason until a choice is made', () => {
    const heard = jest.fn();
    window.addEventListener(RECORD_A_CHANGE_ON_PIECE_EVENT, heard);
    renderRouter();
    act(() => openRecordAChange({ origin: 'pieces-head' }));

    const held = continueAct();
    expect(held).toHaveAttribute('aria-disabled', 'true');
    expect(held).not.toBeDisabled();
    expect(held).toHaveAccessibleDescription('Choose one to continue.');

    fireEvent.click(held);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(heard).not.toHaveBeenCalled();
    expect(screen.queryByTestId('amendment-sheet')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /On a piece/ }));
    expect(continueAct()).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByText('Choose one to continue.')).not.toBeInTheDocument();
    window.removeEventListener(RECORD_A_CHANGE_ON_PIECE_EVENT, heard);
  });

  it('On the agreement opens the amendment sheet', () => {
    renderRouter();
    act(() => openRecordAChange({ origin: 'money-head' }));
    fireEvent.click(screen.getByRole('radio', { name: /On the agreement/ }));
    fireEvent.click(continueAct());

    expect(screen.queryByText('What changed?')).not.toBeInTheDocument();
    expect(screen.getByTestId('amendment-sheet')).toHaveTextContent('project-1');
  });

  it('On a piece hands the Pieces region the choice, and Enter continues', () => {
    const heard = jest.fn();
    window.addEventListener(RECORD_A_CHANGE_ON_PIECE_EVENT, heard);
    renderRouter();
    act(() => openRecordAChange({ origin: 'cmdk' }));
    const piece = screen.getByRole('radio', { name: /On a piece/ });
    fireEvent.click(piece);
    fireEvent.keyDown(piece, { key: 'Enter' });

    expect(heard).toHaveBeenCalledTimes(1);
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toEqual({});
    expect(screen.queryByText('What changed?')).not.toBeInTheDocument();
    expect(screen.queryByTestId('amendment-sheet')).not.toBeInTheDocument();
    window.removeEventListener(RECORD_A_CHANGE_ON_PIECE_EVENT, heard);
  });

  it('a dispatch naming a line skips the question', () => {
    const heard = jest.fn();
    window.addEventListener(RECORD_A_CHANGE_ON_PIECE_EVENT, heard);
    renderRouter();
    act(() => openRecordAChange({ origin: 'line', itemId: 'line-sofa' }));

    expect(screen.queryByText('What changed?')).not.toBeInTheDocument();
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toEqual({ itemId: 'line-sofa' });
    window.removeEventListener(RECORD_A_CHANGE_ON_PIECE_EVENT, heard);
  });

  it('Esc puts the router back and returns focus to the control that opened it', async () => {
    renderRouter();
    const opener = document.createElement('button');
    opener.textContent = 'Record a change';
    opener.addEventListener('click', () => openRecordAChange({ origin: 'pieces-head' }));
    document.body.appendChild(opener);
    opener.focus();

    act(() => opener.click());
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('What changed?')).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
    opener.remove();
  });
});

describe('Record a change from the Pieces head (rulings §3, 1-3)', () => {
  const headAct = () => screen.getByRole('button', { name: 'Record a change' });

  it('prints as the head\'s second act, and not at all with the flag off', () => {
    const { unmount } = renderPaper();
    // The head's ledger, links and buttons alike: index 0 is the leader.
    const acts = Array.from(
      (document.getElementById('project-ffe') as HTMLElement).querySelectorAll(
        '[data-action-key]',
      ),
    );
    expect(acts[1]).toHaveAttribute('data-action-key', 'record-a-change-pieces-head');
    unmount();

    mockAskThePaper = false;
    renderPaper();
    expect(screen.queryByRole('button', { name: 'Record a change' })).not.toBeInTheDocument();
  });

  it('On the agreement opens the amendment sheet', () => {
    renderPaper();
    fireEvent.click(headAct());
    fireEvent.click(screen.getByRole('radio', { name: /On the agreement/ }));
    fireEvent.click(continueAct());
    expect(screen.getByTestId('amendment-sheet')).toBeInTheDocument();
  });

  it('On a piece prompts Choose the piece; a line on a PO opens its change order', async () => {
    renderPaper();
    fireEvent.click(headAct());
    fireEvent.click(screen.getByRole('radio', { name: /On a piece/ }));
    fireEvent.click(continueAct());

    const prompt = screen.getByText('Choose the piece');
    await waitFor(() => expect(prompt).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: /Linen slipcovered sofa/ }));
    expect(screen.getByTestId('change-order-sheet')).toHaveTextContent(
      'line-sofa · NA-2026-077',
    );
    expect(screen.getByTestId('line-unfold-line-sofa')).toBeInTheDocument();
    expect(screen.queryByText('Choose the piece')).not.toBeInTheDocument();
  });

  it('On a piece, a line without a PO unfolds with today\'s controls', () => {
    renderPaper();
    fireEvent.click(headAct());
    fireEvent.click(screen.getByRole('radio', { name: /On a piece/ }));
    fireEvent.click(continueAct());

    fireEvent.click(screen.getByRole('button', { name: /Brass reading lamp/ }));
    expect(screen.getByTestId('line-unfold-line-lamp')).toBeInTheDocument();
    expect(screen.queryByTestId('change-order-sheet')).not.toBeInTheDocument();
  });

  it('Esc returns focus to the head\'s act', async () => {
    renderPaper();
    headAct().focus();
    fireEvent.click(headAct());
    await screen.findByRole('dialog');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(headAct()).toHaveFocus());
  });

  it('each unfolded line leads with Record a change, which goes straight to its change order', () => {
    renderPaper();
    fireEvent.click(screen.getByRole('button', { name: /Linen slipcovered sofa/ }));

    const lineAct = document.querySelector(
      '[data-action-key="record-a-change-line"]',
    ) as HTMLElement;
    expect(lineAct).toHaveTextContent('Record a change');
    // First: before the unfold's own acts.
    expect(
      lineAct.compareDocumentPosition(screen.getByTestId('line-unfold-line-sofa')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(lineAct);
    expect(screen.queryByText('What changed?')).not.toBeInTheDocument();
    expect(screen.getByTestId('change-order-sheet')).toHaveTextContent('line-sofa');
  });

  it('a line with no PO unfolds for editing without Record a change as its first act (R35)', () => {
    renderPaper();
    fireEvent.click(screen.getByRole('button', { name: /Brass reading lamp/ }));

    expect(screen.getByTestId('line-unfold-line-lamp')).toBeInTheDocument();
    expect(
      document.querySelector('[data-action-key="record-a-change-line"]'),
    ).not.toBeInTheDocument();
  });
});

describe('Leaving Choose the piece (R34, F3)', () => {
  const headAct = () => screen.getByRole('button', { name: 'Record a change' });

  /** The shell's Put down listens on the document; it must never hear Esc
   *  while she is choosing. */
  let shell: jest.Mock;
  beforeEach(() => {
    shell = jest.fn();
    document.addEventListener('keydown', shell);
  });
  afterEach(() => {
    document.removeEventListener('keydown', shell);
  });

  const choose = async () => {
    renderPaper();
    headAct().focus();
    fireEvent.click(headAct());
    fireEvent.click(screen.getByRole('radio', { name: /On a piece/ }));
    fireEvent.click(continueAct());
    const prompt = screen.getByText('Choose the piece');
    await waitFor(() => expect(prompt).toHaveFocus());
    return prompt;
  };

  it('the prompt carries Put back · Esc as a plain act', async () => {
    await choose();
    const putBack = screen.getByRole('button', { name: 'Put back · Esc' });
    expect(putBack).toHaveAttribute('data-action-variant', 'secondary');
  });

  it('Esc ends choosing, returns focus to Record a change, and never reaches Put down', async () => {
    const prompt = await choose();
    fireEvent.keyDown(prompt, { key: 'Escape' });

    expect(shell).not.toHaveBeenCalled();
    expect(screen.queryByText('Choose the piece')).not.toBeInTheDocument();
    expect(headAct()).toHaveFocus();

    // Choosing is over: a line press unfolds the line and opens no change order.
    fireEvent.click(screen.getByRole('button', { name: /Linen slipcovered sofa/ }));
    expect(screen.queryByTestId('change-order-sheet')).not.toBeInTheDocument();
  });

  it('Esc from a line she has tabbed to still ends choosing, not the paper', async () => {
    await choose();
    const line = screen.getByRole('button', { name: /Linen slipcovered sofa/ });
    line.focus();
    fireEvent.keyDown(line, { key: 'Escape' });

    expect(shell).not.toHaveBeenCalled();
    expect(screen.queryByText('Choose the piece')).not.toBeInTheDocument();
    expect(headAct()).toHaveFocus();
  });

  it('Put back ends choosing and returns focus to Record a change', async () => {
    await choose();
    fireEvent.click(screen.getByRole('button', { name: 'Put back · Esc' }));

    expect(screen.queryByText('Choose the piece')).not.toBeInTheDocument();
    expect(headAct()).toHaveFocus();
  });

  it('once choosing is over, Esc belongs to the shell again', async () => {
    const prompt = await choose();
    fireEvent.keyDown(prompt, { key: 'Escape' });
    fireEvent.keyDown(headAct(), { key: 'Escape' });
    expect(shell).toHaveBeenCalledTimes(1);
  });
});

describe('Record a change on Install and Care spreads (R33)', () => {
  const renderSpread = (sectionKey: 'install' | 'care') =>
    render(
      <>
        <FFESection
          projectId="project-1"
          projectName="Halloran House"
          mode="install"
          sectionKey={sectionKey}
        />
        <RecordAChangeSheet projectId="project-1" clientName="Halloran" />
      </>,
    );
  const actKeys = () =>
    Array.from(
      (document.getElementById('project-ffe') as HTMLElement).querySelectorAll(
        '[data-action-key]',
      ),
    ).map((act) => act.getAttribute('data-action-key'));

  it("prints as the Install head's second act, after the reading's act", () => {
    renderSpread('install');
    const keys = actKeys();
    const reading = keys.indexOf('install-reading-act');
    expect(reading).toBeGreaterThanOrEqual(0);
    expect(keys[reading + 1]).toBe('record-a-change-install-head');
    expect(
      document.querySelector('[data-action-key="record-a-change-install-head"]'),
    ).toHaveAttribute('data-action-variant', 'secondary');
  });

  it('prints on the Care spread, and not at all with the flag off', () => {
    const { unmount } = renderSpread('care');
    expect(actKeys()).toContain('record-a-change-install-head');
    unmount();

    mockAskThePaper = false;
    renderSpread('install');
    expect(screen.queryByRole('button', { name: 'Record a change' })).not.toBeInTheDocument();
  });

  it('On a piece at install: a line on a PO opens its change order', async () => {
    renderSpread('install');
    fireEvent.click(screen.getByRole('button', { name: 'Record a change' }));
    fireEvent.click(screen.getByRole('radio', { name: /On a piece/ }));
    fireEvent.click(continueAct());
    await screen.findByText('Choose the piece');

    fireEvent.click(screen.getByRole('button', { name: /Linen slipcovered sofa/ }));
    expect(screen.getByTestId('change-order-sheet')).toHaveTextContent(
      'line-sofa · NA-2026-077',
    );
  });

  it('an unfolded line on a PO at care leads with Record a change', () => {
    renderSpread('care');
    fireEvent.click(screen.getByRole('button', { name: /Linen slipcovered sofa/ }));
    const lineAct = document.querySelector(
      '[data-action-key="record-a-change-line"]',
    ) as HTMLElement;
    expect(lineAct).toHaveTextContent('Record a change');
    fireEvent.click(lineAct);
    expect(screen.getByTestId('change-order-sheet')).toHaveTextContent('line-sofa');
  });
});

describe('Record a change — focus lands on a control, one Esc puts back (walk D10, D11)', () => {
  const nameOf = (dialog: HTMLElement) => {
    const ids = (dialog.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);
    return ids.map((id) => document.getElementById(id)?.textContent?.trim()).join(' ');
  };

  it('the chooser opens on its first option and is named by its visible title', async () => {
    renderRouter();
    act(() => openRecordAChange({ origin: 'pieces-head' }));

    const dialog = screen.getByRole('dialog');
    expect(nameOf(dialog)).toBe('Record a change');
    expect(dialog).toHaveAccessibleName('Record a change');
    await waitFor(() =>
      expect(within(dialog).getByRole('radio', { name: /On a piece/ })).toHaveFocus(),
    );
  });

  it('opened from a ⌘K row that is then gone, Esc returns focus to the band’s Next act (D18)', async () => {
    const rects = jest
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockImplementation(() => [{}] as unknown as DOMRectList);
    const band = document.createElement('div');
    band.setAttribute('data-lens-line', '2');
    band.innerHTML = '<button type="button" data-part="act">Send the purchase order</button>';
    document.body.appendChild(band);
    const row = document.createElement('input');
    document.body.appendChild(row);
    row.focus();

    renderRouter();
    act(() => openRecordAChange({ origin: 'cmdk' }));
    // The palette closes as its row runs.
    row.remove();
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(screen.queryByText('What changed?')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send the purchase order' })).toHaveFocus(),
    );
    band.remove();
    rects.mockRestore();
  });

  it('Change this order opens on the preselected Cancel, named by its title; one Esc returns to the line', async () => {
    mockRealChangeOrder = true;
    renderPaper();
    const headAct = screen.getByRole('button', { name: 'Record a change' });
    headAct.focus();
    fireEvent.click(headAct);
    fireEvent.click(screen.getByRole('radio', { name: /On a piece/ }));
    fireEvent.click(continueAct());
    await waitFor(() => expect(screen.getByText('Choose the piece')).toHaveFocus());

    const line = screen.getByRole('button', { name: /Linen slipcovered sofa/ });
    line.focus();
    fireEvent.click(line);

    const dialog = await screen.findByRole('dialog');
    expect(nameOf(dialog)).toBe('Change NA-2026-077');
    expect(dialog).toHaveAccessibleName('Change NA-2026-077');
    const cancel = within(dialog).getByRole('radio', { name: /Cancel/ });
    expect(cancel).toBeChecked();
    await waitFor(() => expect(cancel).toHaveFocus());

    fireEvent.keyDown(cancel, { key: 'Escape' });
    expect(screen.queryByTestId('po-change-sheet')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Linen slipcovered sofa/ })).toHaveFocus(),
    );
  });
});
