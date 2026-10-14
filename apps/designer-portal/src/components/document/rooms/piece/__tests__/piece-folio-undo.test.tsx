/**
 * US-34 N15: with `optimistic-ink` on, removing a folio image asks no confirm.
 * An in-flow Undo row takes focus and reads "Removing…", then "Removed" only
 * on the server receipt. Undo writes back only the removed image, into the
 * list as it is now, so a change made in between survives it. Runs the real
 * `usePieceField` against deferred products UPDATEs and records each payload.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { PieceFolio } from '../piece-folio';

type Reply = { data: unknown; error: { message: string } | null };
type Write = { images: string[]; reply: (r: Reply) => void };
let mockWrites: Write[] = [];
let mockServer: { id: string; images: string[] };

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    from: () => ({
      update: (updates: { images: string[] }) => ({
        eq: () => ({
          select: () => ({
            single: () =>
              new Promise<Reply>((resolve) => {
                mockWrites.push({ images: updates.images, reply: resolve });
              }),
          }),
        }),
      }),
    }),
  }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'optimistic-ink', isLoading: false }),
}));

jest.mock('../../../document-action', () => ({
  DocumentAction: ({
    children,
    loading: _loading,
    loadingLabel: _loadingLabel,
    actionKey: _actionKey,
    variant: _variant,
    ...rest
  }: Record<string, unknown> & { children: React.ReactNode }) => (
    <button type="button" {...rest}>
      {children}
    </button>
  ),
  DocumentActionRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const A = 'https://img/a.jpg';
const B = 'https://img/b.jpg';
const C = 'https://img/c.jpg';
const D = 'https://img/d.jpg';

function Harness() {
  const { data } = useQuery({
    queryKey: ['product', 'p-1'],
    queryFn: async () => ({ ...mockServer }),
    initialData: { ...mockServer },
    staleTime: Infinity,
  });
  return <PieceFolio productId="p-1" images={data.images} />;
}

const renderFolio = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <Harness />
    </QueryClientProvider>,
  );

/** The server accepts write `n`: it now holds that write's list. */
async function accept(n: number) {
  await waitFor(() => expect(mockWrites.length).toBeGreaterThan(n));
  mockServer = { id: 'p-1', images: mockWrites[n].images };
  await act(async () => mockWrites[n].reply({ data: { ...mockServer }, error: null }));
}

const previews = () =>
  screen
    .getAllByRole('button', { name: /^Preview image/ })
    .map((b) => b.getAttribute('data-folio-preview'));

let confirmSpy: jest.SpyInstance;
beforeEach(() => {
  mockWrites = [];
  mockServer = { id: 'p-1', images: [A, B, C] };
  confirmSpy = jest.spyOn(window, 'confirm');
});
afterEach(() => jest.restoreAllMocks());

describe('N15 — folio image remove with Undo', () => {
  it('reads "Removed" only after the receipt, and Undo restores the image', async () => {
    renderFolio();
    fireEvent.click(screen.getByRole('button', { name: 'Remove image 2' }));

    await waitFor(() => expect(mockWrites).toHaveLength(1));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mockWrites[0].images).toEqual([A, C]);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Image 2: Removing…');
    expect(status).not.toHaveTextContent('Removed');
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toHaveFocus();
    expect(undo.className).toContain('min-h-[44px]');
    // Still visible until the server confirms.
    expect(previews()).toEqual([A, B, C]);

    await accept(0);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Image 2: Removed'));
    expect(previews()).toEqual([A, C]);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(mockWrites).toHaveLength(2));
    expect(mockWrites[1].images).toEqual([A, B, C]);
    expect(screen.getByRole('button', { name: 'Restoring…' })).toBeInTheDocument();

    await accept(1);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(previews()).toEqual([A, B, C]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview image 2 of 3' })).toHaveFocus());
  });

  it('a refused remove closes the Undo row and never reads "Removed"', async () => {
    renderFolio();
    fireEvent.click(screen.getByRole('button', { name: 'Remove image 2' }));
    await waitFor(() => expect(mockWrites).toHaveLength(1));

    await act(async () => mockWrites[0].reply({ data: null, error: { message: 'Refused by the server.' } }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Refused by the server.'));
    expect(screen.queryByText(/Removed/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(previews()).toEqual([A, B, C]);
  });

  it('a change made before Undo survives the Undo', async () => {
    renderFolio();
    fireEvent.click(screen.getByRole('button', { name: 'Remove image 2' }));
    await accept(0);
    await waitFor(() => expect(previews()).toEqual([A, C]));

    // Another image goes in while the Undo row is open.
    fireEvent.change(screen.getByPlaceholderText('paste an image URL (or a cut sheet)'), {
      target: { value: D },
    });
    fireEvent.click(screen.getByRole('button', { name: '+ add' }));
    await waitFor(() => expect(mockWrites).toHaveLength(2));
    expect(mockWrites[1].images).toEqual([A, C, D]);
    await accept(1);
    await waitFor(() => expect(previews()).toEqual([A, C, D]));

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(mockWrites).toHaveLength(3));
    // Only the removed image goes back, at its old index; D stays.
    expect(mockWrites[2].images).toEqual([A, B, C, D]);
    await accept(2);
    await waitFor(() => expect(previews()).toEqual([A, B, C, D]));
  });
});
