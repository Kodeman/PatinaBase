import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LayerProductLayer } from '@patina/supabase';
import { LibrarianBar } from '../librarian-bar';
import { LibraryToolbar } from '../library-toolbar';

const mockUseCrossLayerSearch = jest.fn();

jest.mock('@patina/supabase', () => ({
  useCrossLayerSearch: (options: unknown) => mockUseCrossLayerSearch(options),
}));

jest.mock('@/components/document/engine/engine-results', () => ({
  EngineResults: ({ query }: { query: string }) => (
    <div data-testid="engine-results">{query}</div>
  ),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

const exactRow = {
  id: 'piece-1',
  name: 'Linnea Sideboard',
  brand: 'Vërellen',
  price_retail: null,
  price_trade: null,
  images: null,
  source_url: null,
  status: 'published',
  category: 'casegoods',
  layer: 'personal' as const,
  owner_user_id: 'designer-1',
  studio_id: null,
  created_at: '2026-07-31T00:00:00.000Z',
};

afterEach(() => jest.useRealTimers());

describe('Library omnibox', () => {
  beforeEach(() => {
    mockUseCrossLayerSearch.mockReset();
    mockUseCrossLayerSearch.mockReturnValue({
      data: {
        rows: [exactRow],
        byLayer: { personal: [exactRow], studio: [], catalog: [] },
      },
      isLoading: false,
      isError: false,
    });
  });

  it('uses one search control for debounced exact matches and explicit Engine asks', () => {
    jest.useFakeTimers();
    render(<LibrarianBar />);

    const searchboxes = screen.getAllByRole('searchbox');
    expect(searchboxes).toHaveLength(1);
    const omnibox = searchboxes[0];

    fireEvent.change(omnibox, { target: { value: 'white oak console' } });
    act(() => jest.advanceTimersByTime(220));
    expect(mockUseCrossLayerSearch).toHaveBeenLastCalledWith({
      query: 'white oak console',
    });
    expect(screen.getByRole('link', { name: /Linnea Sideboard/ })).toBeInTheDocument();
    expect(screen.queryByTestId('engine-results')).not.toBeInTheDocument();

    fireEvent.submit(omnibox.closest('form') as HTMLFormElement);
    expect(screen.getByTestId('engine-results')).toHaveTextContent('white oak console');

    fireEvent.change(omnibox, { target: { value: 'walnut cabinet' } });
    expect(screen.queryByTestId('engine-results')).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(220));
    expect(mockUseCrossLayerSearch).toHaveBeenLastCalledWith({
      query: 'walnut cabinet',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(screen.getByTestId('engine-results')).toHaveTextContent('walnut cabinet');
  });
});

function ToolbarHarness({
  onCompose,
  onImport,
}: {
  onCompose: () => void;
  onImport: () => void;
}) {
  const [active, setActive] = useState<LayerProductLayer>('personal');
  return (
    <>
      <LibraryToolbar
        activeLayer={active}
        counts={{ personal: 2, studio: 7, catalog: 31 }}
        onLayerChange={setActive}
        onCompose={onCompose}
        onImport={onImport}
      />
      <section
        id="library-shelf-panel"
        role="tabpanel"
        aria-labelledby={`library-lens-${active}`}
      >
        {active}
      </section>
    </>
  );
}

describe('Library lens and Add disclosure', () => {
  it('shows one active counted shelf lens and supports arrow-key selection', async () => {
    render(<ToolbarHarness onCompose={jest.fn()} onImport={jest.fn()} />);

    const mine = screen.getByRole('tab', { name: 'Mine, 2 pieces' });
    const studio = screen.getByRole('tab', { name: 'Studio, 7 pieces' });
    const panel = screen.getByRole('tabpanel');
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(panel).toHaveAttribute('id', 'library-shelf-panel');
    expect(mine).toHaveAttribute('aria-controls', panel.id);
    expect(studio).toHaveAttribute('aria-controls', panel.id);
    expect(mine).toHaveAttribute('aria-selected', 'true');
    expect(panel).toHaveTextContent('personal');

    fireEvent.click(studio);
    expect(studio).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('studio');

    fireEvent.keyDown(studio, { key: 'ArrowRight' });
    const patina = screen.getByRole('tab', { name: 'Patina, 31 pieces' });
    expect(patina).toHaveAttribute('aria-controls', panel.id);
    expect(patina).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(patina).toHaveFocus());
  });

  it('routes Compose and Import through one disclosure with quiet dismissal', async () => {
    const onCompose = jest.fn();
    const onImport = jest.fn();
    render(<ToolbarHarness onCompose={onCompose} onImport={onImport} />);

    const trigger = screen.getByRole('button', { name: 'Add to Library' });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Add to Library options' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Compose a piece' })).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: 'Compose a piece' }));
    expect(onCompose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region', { name: 'Add to Library options' })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Import a list' }));
    expect(onImport).toHaveBeenCalledTimes(1);

    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Compose a piece' }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('region', { name: 'Add to Library options' })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('region', { name: 'Add to Library options' })).not.toBeInTheDocument();
  });
});
