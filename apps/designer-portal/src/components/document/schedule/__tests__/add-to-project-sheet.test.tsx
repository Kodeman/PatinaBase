import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AddToProjectSheet, openAddToProject } from '../add-to-project-sheet';

const push = jest.fn();
const placeProduct = jest.fn();
const createNeed = jest.fn();
const resolveVendor = jest.fn();
const upsertAccount = jest.fn();
const setCommercials = jest.fn();
const setSpec = jest.fn();
const stageDocument = jest.fn();
const commitImport = jest.fn();
let prefill: Record<string, unknown> | null = null;
let importRows: unknown[] | undefined;
let photoFlag = false;
let canSeeMargin = true;
let vendorResults: Array<{ id: string; name: string }> = [];

jest.mock('next/navigation', () => ({
  usePathname: () => '/doc/project-1',
  useRouter: () => ({ push }),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/lib/analytics/ffe-events', () => ({
  ffeEvents: {
    entranceOpened: jest.fn(), routingChosen: jest.fn(), placementCompleted: jest.fn(), failed: jest.fn(),
  },
}));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('@/lib/document/shelves', () => ({ NEW_BOARD_EVENT: 'document:new-project-board' }));
jest.mock('@/hooks/use-board-find-this-piece', () => ({ PHOTO_MATCH_FLAG: 'board-photo-match' }));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: photoFlag, loading: false }),
}));

jest.mock('@patina/supabase', () => ({
  usePlaceProductInProjectV2: () => ({ mutateAsync: placeProduct, isPending: false }),
  useCreateNamedProjectNeed: () => ({ mutateAsync: createNeed, isPending: false }),
  useResolveOrCreateVendor: () => ({ mutateAsync: resolveVendor, isPending: false }),
  useUpsertStudioVendorAccount: () => ({ mutateAsync: upsertAccount, isPending: false }),
  useSetFfeLineCommercials: () => ({ mutateAsync: setCommercials, isPending: false }),
  useSetFfeLineSpecFields: () => ({ mutateAsync: setSpec, isPending: false }),
  useProjectRecordedStudio: () => ({ data: 'studio-1' }),
  useCanSeeStudioMargin: () => ({ data: canSeeMargin }),
  useLineCardProductPrefill: (productId: string | null) => ({ data: productId ? prefill : undefined }),
  useVendors: (filters?: { search?: string }) => ({
    data: { data: filters?.search ? vendorResults : [] },
  }),
  DOCUMENT_IMPORT_TYPES: { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
  useStageProjectFfeDocument: () => ({ mutateAsync: stageDocument, isPending: false }),
  useProjectFfeImportRows: (batchId: string | null) => ({ data: batchId ? importRows : undefined, isLoading: false }),
  useCommitProjectFfeImport: () => ({ mutateAsync: commitImport, isPending: false }),
}));

jest.mock('@/components/portal/proposals/product-picker-modal', () => ({
  ProductPickerModal: ({ open, initialTab, onPick }: {
    open: boolean;
    initialTab: string;
    onPick: (value: Record<string, unknown>) => void;
  }) => open ? (
    <div data-testid="picker" data-initial-tab={initialTab}>
      <button
        type="button"
        onClick={() => onPick({
          productId: 'product-1', name: 'Cove Sofa', imageUrl: null, priceCents: 972000,
          priceTradeCents: null, vendorName: 'Hale Upholstery', scopeRoomId: null,
        })}
      >
        Pick Cove Sofa
      </button>
    </div>
  ) : null,
}));

const boards = [
  { id: 'board-wide', name: 'Project board', status: 'active', project_room_id: null },
] as any;

const CREATED = { outcome: 'created', selectionId: 'selection-1', threadId: 'thread-1', placementId: null };

function renderSheet() {
  render(
    <AddToProjectSheet
      projectId="project-1"
      projectName="Kochaver Residence"
      rooms={[{ id: 'room-1', name: 'Living room' }]}
      boards={boards}
      placeholders={[{ id: 'placeholder-1', name: 'Reading chair' }]}
    />,
  );
  act(() => openAddToProject('section'));
}

const road = (name: RegExp) => screen.getByRole('button', { name });
/** The sheet head prints the page label as "· <label>". */
const pageLabel = (label: string) => screen.getByText(`· ${label}`);

describe('Add to the job — roads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prefill = {
      productId: 'product-1', name: 'Cove Sofa', imageUrl: null, sourceUrl: 'https://hale-upholstery.com/cove',
      vendorId: 'vendor-hale', sku: 'HU-88-COVE', finish: 'Ebonized oak legs',
      dimensions: { width: 88, depth: 38, height: 32, unit: 'in' },
      retailCents: 972000, tradeCents: 648000, leadTimeWeeks: 11,
    };
    importRows = undefined;
    photoFlag = false;
    canSeeMargin = true;
    vendorResults = [];
  });

  it('shows ten roads under their heads', () => {
    renderSheet();
    const have = screen.getByRole('region', { name: 'From something you have' });
    const notInCatalog = screen.getByRole('region', { name: 'Not in any catalog' });
    expect(within(have).getAllByRole('button')).toHaveLength(6);
    expect(within(notInCatalog).getAllByRole('button')).toHaveLength(4);
    expect(within(notInCatalog).getByRole('button', { name: /Name a need/ })).toBeInTheDocument();
  });

  it('holds the photo road when the flag is off, and never hides it', () => {
    renderSheet();
    const photo = road(/From a photo/);
    expect(photo).toHaveAttribute('aria-disabled', 'true');
    expect(photo).toHaveTextContent('Not switched on for this studio yet.');
    fireEvent.click(photo);
    expect(screen.queryByText('The line, as it will be bought')).not.toBeInTheDocument();
  });

  it('the Library road reaches the line card pre-filled from the product', async () => {
    placeProduct.mockResolvedValue(CREATED);
    renderSheet();
    fireEvent.click(road(/From the Library/));
    expect(screen.getByTestId('picker')).toHaveAttribute('data-initial-tab', 'library');
    fireEvent.click(screen.getByRole('button', { name: 'Pick Cove Sofa' }));

    expect(screen.getByText('The line, as it will be bought')).toBeInTheDocument();
    expect(pageLabel('from the Library')).toBeInTheDocument();
    expect(await screen.findByTestId('line-card-maker')).toHaveTextContent('Hale Upholstery');
    expect(screen.getByLabelText('SKU')).toHaveValue('HU-88-COVE');
    expect(screen.getByLabelText('Finish')).toHaveValue('Ebonized oak legs');
    expect(screen.getByLabelText('Trade cost')).toHaveValue('6480');
    expect(screen.getByTestId('line-card-client-price')).toHaveTextContent('read from the source');
    expect(screen.getByTestId('line-card-readiness')).toHaveTextContent("Orderable once it has: the client's yes");
    expect(screen.queryByTestId('retail-as-trade-warning')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Put it on the schedule' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Put on the schedule · Cove Sofa');
    expect(placeProduct).toHaveBeenCalledWith(expect.objectContaining({ productId: 'product-1', quantity: 1 }));
    // Nothing changed from the source: no commercials or spec write.
    expect(setCommercials).not.toHaveBeenCalled();
    expect(setSpec).not.toHaveBeenCalled();
  });

  it('the link road opens captures and saves an edited trade cost and SKU after placement', async () => {
    placeProduct.mockResolvedValue(CREATED);
    renderSheet();
    fireEvent.click(road(/Paste a link/));
    expect(screen.getByTestId('picker')).toHaveAttribute('data-initial-tab', 'captures');
    fireEvent.click(screen.getByRole('button', { name: 'Pick Cove Sofa' }));
    expect(pageLabel('from a link')).toBeInTheDocument();
    await screen.findByTestId('line-card-maker');
    fireEvent.change(screen.getByLabelText('Trade cost'), { target: { value: '6100' } });
    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'HU-88-COVE-B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Put it on the schedule' }));

    await waitFor(() => expect(setSpec).toHaveBeenCalledWith({ projectId: 'project-1', itemId: 'selection-1', sku: 'HU-88-COVE-B' }));
    expect(setCommercials).toHaveBeenCalledWith({ itemId: 'selection-1', projectId: 'project-1', tradePriceCents: 610000 });
    expect(placeProduct.mock.invocationCallOrder[0]).toBeLessThan(setCommercials.mock.invocationCallOrder[0]);
  });

  it.each([
    [/A custom piece/, 'a custom piece', 'custom-piece', 'fixed'],
    [/A store buy/, 'a store buy', 'store-buy', 'fixed'],
    [/Name a need/, 'a need', 'named-need', 'tbd'],
  ])('%s reaches the line card and places with its kind', async (row, label, source, itemType) => {
    createNeed.mockResolvedValue(CREATED);
    renderSheet();
    fireEvent.click(road(row));
    expect(pageLabel(label)).toBeInTheDocument();
    expect(screen.queryByTestId('line-card-maker')).not.toBeInTheDocument();
    expect(screen.getByLabelText('SKU')).toHaveValue('');
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Side table' } });
    fireEvent.change(screen.getByLabelText('Optional board placement'), { target: { value: 'board-wide' } });
    fireEvent.click(screen.getByRole('button', { name: 'Put it on the schedule' }));
    await waitFor(() => expect(createNeed).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Side table', boardId: 'board-wide', assignmentScope: 'unassigned', source, itemType,
    })));
    expect(placeProduct).not.toHaveBeenCalled();
  });

  it('a find asks for a seller, not a maker, and carries it on the placement', async () => {
    createNeed.mockResolvedValue(CREATED);
    renderSheet();
    fireEvent.click(road(/A find/));
    expect(pageLabel('a find')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Maker' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Name the piece'), { target: { value: 'Brimfield mirror' } });
    fireEvent.change(screen.getByLabelText('Seller name'), { target: { value: 'Ann Dealer' } });
    fireEvent.change(screen.getByLabelText('Where'), { target: { value: 'Brimfield' } });
    fireEvent.click(screen.getByRole('button', { name: 'Put it on the schedule' }));
    await waitFor(() => expect(createNeed).toHaveBeenCalledWith(expect.objectContaining({
      source: 'find',
      sourceMetadata: { seller: { name: 'Ann Dealer', where: 'Brimfield', howPaid: '' } },
    })));
    expect(resolveVendor).not.toHaveBeenCalled();
  });

  it('the photo road reaches a manual line card when switched on', () => {
    photoFlag = true;
    renderSheet();
    fireEvent.click(road(/From a photo/));
    expect(pageLabel('from a photo')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Maker' })).toBeInTheDocument();
  });

  it('Bring in a deck is a doorway to a project board', () => {
    const listener = jest.fn();
    window.addEventListener('document:new-project-board', listener);
    renderSheet();
    fireEvent.click(road(/Bring in a deck/));
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('document:new-project-board', listener);
  });
});

describe('the line card — R-DI4 and R-PB4', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    importRows = undefined;
    photoFlag = false;
    canSeeMargin = true;
    vendorResults = [];
  });

  it('warns when only a retail price was read and never files it as trade', async () => {
    prefill = {
      productId: 'product-1', name: 'Cove Sofa', imageUrl: null, sourceUrl: null, vendorId: 'vendor-hale',
      sku: null, finish: null, dimensions: null, retailCents: 972000, tradeCents: null, leadTimeWeeks: null,
    };
    placeProduct.mockResolvedValue(CREATED);
    renderSheet();
    fireEvent.click(road(/Paste a link/));
    fireEvent.click(screen.getByRole('button', { name: 'Pick Cove Sofa' }));
    await screen.findByTestId('line-card-maker');

    expect(screen.getByLabelText('Trade cost')).toHaveValue('');
    expect(screen.getByTestId('retail-as-trade-warning')).toHaveTextContent(
      'Only a retail price was read ($9,720). That is the client price, not your trade cost.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Put it on the schedule' }));
    await screen.findByRole('status');
    expect(setCommercials).not.toHaveBeenCalled();
  });

  it('the warning clears once a trade cost is entered', async () => {
    prefill = {
      productId: 'product-1', name: 'Cove Sofa', imageUrl: null, sourceUrl: null, vendorId: null,
      sku: null, finish: null, dimensions: null, retailCents: 972000, tradeCents: null, leadTimeWeeks: null,
    };
    renderSheet();
    fireEvent.click(road(/From the Library/));
    fireEvent.click(screen.getByRole('button', { name: 'Pick Cove Sofa' }));
    expect(await screen.findByTestId('retail-as-trade-warning')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Trade cost'), { target: { value: '6480' } });
    expect(screen.queryByTestId('retail-as-trade-warning')).not.toBeInTheDocument();
  });

  it('shows a negative markup plainly and warns at the floor; hides price when margin is restricted', async () => {
    prefill = {
      productId: 'product-1', name: 'Cove Sofa', imageUrl: null, sourceUrl: null, vendorId: null,
      sku: null, finish: null, dimensions: null, retailCents: 500000, tradeCents: 600000, leadTimeWeeks: null,
    };
    renderSheet();
    fireEvent.click(road(/From the Library/));
    fireEvent.click(screen.getByRole('button', { name: 'Pick Cove Sofa' }));
    expect(await screen.findByText('−17% markup')).toBeInTheDocument();
    expect(screen.getByText(/client price is below trade cost/)).toBeInTheDocument();
  });

  it('hides the client price from a seat that cannot see margin', () => {
    canSeeMargin = false;
    prefill = null;
    renderSheet();
    fireEvent.click(road(/A custom piece/));
    expect(screen.queryByTestId('line-card-client-price')).not.toBeInTheDocument();
  });

  it('a new maker resolves first (website, then name) and the line names the resolved maker', async () => {
    vendorResults = [];
    resolveVendor.mockResolvedValue('vendor-resolved');
    createNeed.mockResolvedValue(CREATED);
    renderSheet();
    fireEvent.click(road(/A custom piece/));
    fireEvent.change(screen.getByPlaceholderText('Name the piece'), { target: { value: 'Banquette' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Maker' }), { target: { value: 'Ojai Workroom' } });
    fireEvent.click(screen.getByRole('option', { name: /Add a maker: “Ojai Workroom”/ }));
    expect(screen.getByText("Saved to your studio's makers. Patina looks for this maker by website, then by name, before adding one.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Website'), { target: { value: 'ojaiworkroom.com' } });
    fireEvent.change(screen.getByLabelText('Orders email'), { target: { value: 'orders@ojaiworkroom.com' } });
    fireEvent.change(screen.getByLabelText('Trade cost'), { target: { value: '4200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Put it on the schedule' }));

    await waitFor(() => expect(setCommercials).toHaveBeenCalled());
    expect(resolveVendor).toHaveBeenCalledWith({ name: 'Ojai Workroom', website: 'ojaiworkroom.com' });
    expect(resolveVendor.mock.invocationCallOrder[0]).toBeLessThan(createNeed.mock.invocationCallOrder[0]);
    expect(upsertAccount).toHaveBeenCalledWith({
      organizationId: 'studio-1', vendorId: 'vendor-resolved', request: { ordersEmailOverride: 'orders@ojaiworkroom.com' },
    });
    expect(setCommercials).toHaveBeenCalledWith({
      itemId: 'selection-1', projectId: 'project-1', vendorId: 'vendor-resolved', tradePriceCents: 420000,
    });
  });

  it('a retry after a failed save does not resolve the maker twice and keeps one idempotency key', async () => {
    resolveVendor.mockResolvedValue('vendor-resolved');
    createNeed.mockRejectedValueOnce(new Error('connection closed')).mockResolvedValueOnce(CREATED);
    renderSheet();
    fireEvent.click(road(/A store buy/));
    fireEvent.change(screen.getByPlaceholderText('Name the piece'), { target: { value: 'Lamp' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Maker' }), { target: { value: 'CB2' } });
    fireEvent.click(screen.getByRole('option', { name: /Add a maker/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Put it on the schedule' }));
    await screen.findByRole('alert');
    expect(screen.getByTestId('line-card-maker')).toHaveTextContent('CB2');
    fireEvent.click(screen.getByRole('button', { name: 'Put it on the schedule' }));
    await screen.findByRole('status');
    expect(resolveVendor).toHaveBeenCalledTimes(1);
    expect(createNeed.mock.calls[1][0].idempotencyKey).toBe(createNeed.mock.calls[0][0].idempotencyKey);
  });

  it('a product road keeps one idempotency key across an ambiguous retry and sends the duplicate enum', async () => {
    prefill = null;
    placeProduct.mockRejectedValueOnce(new Error('connection closed')).mockResolvedValueOnce(CREATED);
    renderSheet();
    fireEvent.click(road(/From the Library/));
    fireEvent.click(screen.getByRole('button', { name: 'Pick Cove Sofa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Separate need' }));
    fireEvent.click(screen.getByRole('button', { name: 'Put it on the schedule' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Put it on the schedule' }));
    await waitFor(() => expect(placeProduct).toHaveBeenCalledTimes(2));
    expect(placeProduct.mock.calls[0][0].duplicateMode).toBe('create');
    expect(placeProduct.mock.calls[1][0].idempotencyKey).toBe(placeProduct.mock.calls[0][0].idempotencyKey);
  });

  it('fills an explicit placeholder and reports the filled outcome', async () => {
    prefill = null;
    placeProduct.mockResolvedValue({ ...CREATED, outcome: 'filled', selectionId: 'placeholder-1' });
    renderSheet();
    fireEvent.click(road(/From the Library/));
    fireEvent.click(screen.getByRole('button', { name: 'Pick Cove Sofa' }));
    fireEvent.change(screen.getByLabelText('Optional placeholder to fill'), { target: { value: 'placeholder-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Put it on the schedule' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Filled placeholder · Cove Sofa');
    expect(placeProduct).toHaveBeenCalledWith(expect.objectContaining({ placeholderSelectionId: 'placeholder-1' }));
  });
});

describe('document import review — accept, edit, skip', () => {
  const pdf = () => new File(['%PDF-1.7'], 'quote.pdf', { type: 'application/pdf' });

  beforeEach(() => {
    jest.clearAllMocks();
    photoFlag = false;
    importRows = [
      {
        id: 'r1', rowOrdinal: 1, projectRoomId: 'room-1', assignmentScope: 'room', committedFfeItemId: null,
        raw: {
          name: 'Cove Sofa', roomName: 'Living room',
          maker: { value: 'Hale Upholstery', confidence: 0.9, state: 'unconfirmed' },
          sku: { value: 'HU-88', confidence: 0.9, state: 'unconfirmed' },
          unitPriceMinor: { value: 648000, confidence: 0.8, state: 'unconfirmed' },
          currency: { value: 'USD', confidence: 0.9, state: 'unconfirmed' },
        },
        normalized: { name: 'Cove Sofa', quantity: 1, pageNumber: 1, confidence: 0.9 },
        validationErrors: ['unconfirmed_commercial_value'],
      },
      {
        id: 'r2', rowOrdinal: 2, projectRoomId: null, assignmentScope: null, committedFfeItemId: null,
        raw: { name: 'Side chair' },
        normalized: { name: 'Side chair', quantity: 2, pageNumber: 1, confidence: 0.5 },
        validationErrors: [],
      },
    ];
    stageDocument.mockResolvedValue({ batchId: 'batch-1', status: 'staged', reused: false, rowCount: 2, unconfirmedCommercialRows: 1 });
    commitImport.mockResolvedValue({
      batchId: 'batch-1', status: 'committed', committedCount: 2,
      results: [{ rowOrdinal: 1, outcome: 'created', selectionId: 'sel-1' }, { rowOrdinal: 2, outcome: 'held' }],
    });
    resolveVendor.mockResolvedValue('vendor-hale');
  });

  async function openReview(row: RegExp) {
    renderSheet();
    fireEvent.click(road(row));
    fireEvent.change(screen.getByLabelText(/Choose the/), { target: { files: [pdf()] } });
    await screen.findByText('Cove Sofa');
  }

  it("a vendor's quote stages through the extractor and shows one review row per line", async () => {
    await openReview(/From a vendor's quote/);
    expect(stageDocument).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1' }));
    expect(document.querySelectorAll('[data-import-row]')).toHaveLength(2);
    expect(screen.getByText(/Read on page 1 · clear · Hale Upholstery · HU-88/)).toBeInTheDocument();
  });

  it('warns that a read price is not saved as trade until its basis is said', async () => {
    await openReview(/Import a schedule/);
    expect(screen.getByTestId('import-price-warning')).toHaveTextContent('Patina never files a read price as your trade cost.');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Cove Sofa' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Our trade cost' }));
    expect(screen.queryByTestId('import-price-warning')).not.toBeInTheDocument();
  });

  it('accept and skip become one decision per row; the skipped row places nothing', async () => {
    await openReview(/Import a schedule/);
    const commitButton = () => screen.getByRole('button', { name: /Bring in/ });
    expect(commitButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Accept Cove Sofa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip Side chair' }));
    expect(commitButton()).toHaveTextContent('Bring in 1 line');
    fireEvent.click(commitButton());

    await waitFor(() => expect(commitImport).toHaveBeenCalled());
    expect(commitImport.mock.calls[0][0]).toEqual({
      projectId: 'project-1',
      batchId: 'batch-1',
      decisions: [
        {
          rowOrdinal: 1, assignmentScope: 'room', roomId: 'room-1', duplicateMode: 'create',
          // R-DI4: the read price stays unsaved — no basis was said.
          commercial: { maker: 'Hale Upholstery', sku: 'HU-88', unitPriceMinor: null, currency: null, priceBasis: null },
        },
        { rowOrdinal: 2, assignmentScope: 'unassigned', duplicateMode: 'hold' },
      ],
    });
    // R-PB4: the confirmed maker resolves to the shared record before the line names it.
    await waitFor(() => expect(setCommercials).toHaveBeenCalledWith({ itemId: 'sel-1', projectId: 'project-1', vendorId: 'vendor-hale' }));
    expect(resolveVendor).toHaveBeenCalledWith({ name: 'Hale Upholstery', website: null });
    expect(await screen.findByRole('status')).toHaveTextContent('Brought in 1 line · 1 skipped');
  });

  it('a row the server cannot place holds the whole batch with the reason', async () => {
    (importRows as any[])[1].validationErrors = ['formula_like_value'];
    await openReview(/Import a schedule/);
    expect(screen.getByRole('alert')).toHaveTextContent('Line 2 has a value that looks like a spreadsheet formula.');
    expect(screen.getByRole('button', { name: 'Accept Side chair' })).toBeDisabled();
  });

  it('refuses a spreadsheet with a plain reason and stages nothing', () => {
    renderSheet();
    fireEvent.click(road(/Import a schedule/));
    const sheet = new File(['a,b'], 'schedule.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText(/Choose the/), { target: { files: [sheet] } });
    return waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Spreadsheets are not read yet');
      expect(stageDocument).not.toHaveBeenCalled();
    });
  });
});
