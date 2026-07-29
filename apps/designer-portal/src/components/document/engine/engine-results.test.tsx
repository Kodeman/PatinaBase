/**
 * EngineResults (Wave 3C) — the ask surface shared by ⌘K and the librarian.
 * Asserts the surface laws:
 *   • the Engine's ranked items render with matched-on chips (never "AI");
 *   • server degradation ({degraded:true}) shows "the Engine is resting"
 *     quietly WITH the FTS results (§12.1 rung 2);
 *   • an unreachable fn falls back to the keyword cross-layer search under
 *     the same resting line (the librarian never goes silent);
 *   • Place → keeps the placement contract (id + dual pricing → the
 *     use-place-in-document hook, which owns added_via='engine').
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { EngineResults } from './engine-results';

type AskState = {
  data?: unknown;
  isLoading?: boolean;
  isError?: boolean;
};

let askState: AskState = {};
let crossLayerState: { data?: unknown; isLoading?: boolean } = {};
let crossLayerCalls: Array<{ query: string; enabled?: boolean }> = [];
const mutateAsync = jest.fn();

jest.mock('@patina/supabase', () => ({
  useEngineAsk: () => ({
    data: askState.data,
    isLoading: askState.isLoading ?? false,
    isError: askState.isError ?? false,
  }),
  useCrossLayerSearch: (opts: { query: string; enabled?: boolean }) => {
    crossLayerCalls.push(opts);
    return {
      data: opts.enabled === false ? undefined : crossLayerState.data,
      isLoading: crossLayerState.isLoading ?? false,
    };
  },
  useProjects: () => ({
    data: [
      { id: 'proj-1', name: 'Aspen House', status: 'active' },
      { id: 'proj-2', name: 'Closed One', status: 'completed' },
    ],
  }),
}));

jest.mock('@/hooks/use-place-in-document', () => ({
  usePlaceInDocument: () => ({ mutateAsync, isPending: false }),
}));

const item = (id: string, matched_on: string[]) => ({
  id,
  name: `Piece ${id}`,
  brand: 'Fixture & Co',
  price_retail: 120000,
  price_trade: 90000,
  images: null,
  category: 'storage',
  layer: 'studio',
  matched_on,
  score: 0.03,
});

beforeEach(() => {
  askState = {};
  crossLayerState = {};
  crossLayerCalls = [];
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({ id: 'ffe-1' });
});

describe('EngineResults', () => {
  it('renders the Engine’s ranked items with matched-on chips, no resting line', () => {
    askState = {
      data: {
        items: [item('a', ['vector', 'fts']), item('b', ['fts'])],
        degraded: false,
        latency_ms: 90,
        result_count: 2,
      },
    };
    render(<EngineResults query="warm oak sideboard" />);

    expect(screen.getByText('Piece a')).toBeInTheDocument();
    expect(screen.getByText(/the Engine’s read/)).toBeInTheDocument();
    expect(screen.getByText(/keyword match/)).toBeInTheDocument();
    expect(
      screen.queryByText(/the Engine is resting/i),
    ).not.toBeInTheDocument();
    // Copy law: nothing user-facing says "AI".
    expect(screen.queryByText(/\bAI\b/)).not.toBeInTheDocument();
    // Ask path healthy → keyword fallback stays disabled.
    expect(crossLayerCalls.every((c) => c.enabled === false)).toBe(true);
  });

  it('server degradation: shows "the Engine is resting" with the FTS results', () => {
    askState = {
      data: {
        items: [item('a', ['fts'])],
        degraded: true,
        latency_ms: 1600,
        result_count: 1,
      },
    };
    render(<EngineResults query="warm oak sideboard" />);

    expect(screen.getByText(/the Engine is resting/i)).toBeInTheDocument();
    expect(screen.getByText('Piece a')).toBeInTheDocument();
  });

  it('unreachable fn: falls back to keyword cross-layer results under the resting line', () => {
    askState = { isError: true };
    crossLayerState = {
      data: {
        byLayer: {
          studio: [item('s1', [])],
          catalog: [item('c1', [])],
          personal: [],
        },
        counts: { personal: 0, studio: 1, catalog: 1 },
        total: 2,
      },
    };
    render(<EngineResults query="warm oak sideboard" />);

    expect(screen.getByText(/the Engine is resting/i)).toBeInTheDocument();
    // Fallback ordering: studio before catalog.
    const names = screen.getAllByText(/Piece /).map((n) => n.textContent);
    expect(names).toEqual(['Piece s1', 'Piece c1']);
    expect(crossLayerCalls.some((c) => c.enabled === true)).toBe(true);
  });

  it('Place → keeps the placement contract (id + dual pricing) and reports back', async () => {
    askState = {
      data: {
        items: [item('a', ['vector'])],
        degraded: false,
        latency_ms: 80,
        result_count: 1,
      },
    };
    const onPlaced = jest.fn();
    render(
      <EngineResults
        query="warm oak sideboard"
        inDocument={{ projectId: 'proj-1', projectName: 'Aspen House' }}
        onPlaced={onPlaced}
      />,
    );

    const place = screen.getByRole('button', { name: 'Place' });
    expect(place).toHaveTextContent(/Place\s*→/);
    fireEvent.click(place);
    await waitFor(() =>
      expect(onPlaced).toHaveBeenCalledWith('Piece a', 'Aspen House'),
    );
    expect(mutateAsync).toHaveBeenCalledWith({
      projectId: 'proj-1',
      piece: {
        id: 'a',
        name: 'Piece a',
        price_trade: 90000,
        price_retail: 120000,
      },
    });
    expect(screen.getByText('placed ✓')).toBeInTheDocument();
  });

  it('empty answer: teach-more copy', () => {
    askState = {
      data: { items: [], degraded: false, latency_ms: 40, result_count: 0 },
    };
    render(<EngineResults query="cursed obelisk" />);
    expect(
      screen.getByText(/Nothing on your shelves answers that yet/i),
    ).toBeInTheDocument();
  });
});
