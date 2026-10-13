/**
 * US-28 S10c: each shelf is a Section that closes on its own rule and folds
 * past one screen; "Used on" reaches each plate's caption.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { LibraryShelf, SHELF_FOLD_AT } from '../library-shelf';
import { groupPieceUsage } from '../use-piece-usage';

let rows: Array<Record<string, unknown>> = [];

jest.mock('@patina/supabase', () => ({
  useLayerProducts: () => ({ data: rows, isLoading: false, isError: false }),
  useCaptureVenueLabels: () => ({ data: {} }),
  useStyleArchetypes: () => ({ data: [], isLoading: false }),
  useAssignStyle: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProductStyles: () => ({ data: [], isLoading: false }),
  useSubmitValidation: () => ({ mutateAsync: jest.fn(), isPending: false, variables: undefined }),
  createBrowserClient: jest.fn(),
}));

jest.mock('../use-piece-usage', () => ({
  ...jest.requireActual('../use-piece-usage'),
  usePieceUsage: () => ({
    data: {
      'p-0': [{ projectId: 'proj-h', title: 'Holloway Den', clientName: null, stage: 'project' }],
    },
  }),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

function piece(i: number) {
  return {
    id: `p-${i}`,
    name: `Piece ${i}`,
    brand: 'Fenmoor Joinery',
    images: null,
    source_url: null,
    category: 'seating',
    layer: 'studio',
    price_retail: null,
    configuration_mode: null,
    configuration_summary: null,
    capture_source: null,
    captured_at: null,
    field_capture_id: null,
  };
}

function renderShelf() {
  return render(
    <LibraryShelf
      layer="studio"
      name="Studio library"
      meta="Products shared within your studio"
      id="library-shelf-panel"
      labelledBy="library-lens-studio"
      teachingIds={new Set<string>()}
      onDeep={jest.fn()}
    />,
  );
}

beforeEach(() => {
  rows = [];
});

describe('LibraryShelf — a Section that closes and folds', () => {
  it('is a Section with an eyebrow naming the shelf, closing on its own rule', () => {
    rows = [piece(0)];
    renderShelf();
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveClass('section');
    expect(screen.getByRole('heading', { name: 'Studio library' })).toHaveClass('eb');
    expect(screen.getByText('Used on Holloway Den')).toHaveClass('tick', 'st-project');
  });

  it('shows one screen of plates and folds the rest behind one act', () => {
    rows = Array.from({ length: SHELF_FOLD_AT + 3 }, (_, i) => piece(i));
    const { container } = renderShelf();

    expect(container.querySelectorAll('[data-library-card]')).toHaveLength(SHELF_FOLD_AT);
    const unfold = screen.getByRole('button', { name: `Show all ${SHELF_FOLD_AT + 3} pieces` });
    expect(unfold).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(unfold);
    expect(container.querySelectorAll('[data-library-card]')).toHaveLength(SHELF_FOLD_AT + 3);
    const fold = screen.getByRole('button', { name: 'Fold the shelf' });
    expect(fold).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(fold);
    expect(container.querySelectorAll('[data-library-card]')).toHaveLength(SHELF_FOLD_AT);
  });

  it('does not offer the fold when the shelf fits one screen', () => {
    rows = Array.from({ length: SHELF_FOLD_AT }, (_, i) => piece(i));
    renderShelf();
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('says an empty shelf in one sentence inside the Section', () => {
    renderShelf();
    expect(screen.getByText('This shelf is empty.')).toHaveClass('empty-t');
  });
});

describe('groupPieceUsage — the jobs a piece is on', () => {
  it('names each job once, by its project, with the document stage', () => {
    const grouped = groupPieceUsage(
      [
        { product_id: 'p-1', project_id: 'proj-h', project: { name: 'Holloway Den' } },
        { product_id: 'p-1', project_id: 'proj-h', project: { name: 'Holloway Den' } },
        { product_id: 'p-1', project_id: 'proj-p', project: { name: 'Pell Court Dining' } },
        { product_id: 'p-2', project_id: 'proj-p', project: { name: 'Pell Court Dining' } },
        { product_id: null, project_id: 'proj-x', project: { name: 'Nothing' } },
      ],
      [
        { project_id: 'proj-h', client_name: 'Nora and Sam Holloway', active_section: 'project' },
        { project_id: 'proj-p', client_name: 'Rosalind Fairweather', active_section: 'install' },
      ],
    );

    expect(grouped['p-1']).toEqual([
      { projectId: 'proj-h', title: 'Holloway Den', clientName: 'Nora and Sam Holloway', stage: 'project' },
      { projectId: 'proj-p', title: 'Pell Court Dining', clientName: 'Rosalind Fairweather', stage: 'install' },
    ]);
    expect(grouped['p-2']).toHaveLength(1);
    expect(Object.keys(grouped)).toEqual(['p-1', 'p-2']);
  });

  it('reads an unknown or missing stage as Project', () => {
    const grouped = groupPieceUsage(
      [{ product_id: 'p-1', project_id: 'proj-q', project: { name: 'Quay Street Loft' } }],
      [],
    );
    expect(grouped['p-1'][0].stage).toBe('project');
  });
});
