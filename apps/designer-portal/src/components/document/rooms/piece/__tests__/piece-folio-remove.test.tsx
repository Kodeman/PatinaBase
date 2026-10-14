/**
 * US-34 F15c: removing a folio image is pending-only (no Undo yet, N15). The
 * image stays visible, reading "Removing…", until the server confirms; a
 * refused remove keeps it and announces the failure with `role="alert"`.
 * Runs the real `usePieceField` against a deferred products UPDATE.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { PieceFolio } from '../piece-folio';

type Reply = { data: unknown; error: { message: string } | null };
let mockReply: ((r: Reply) => void) | null = null;
let mockServer: { id: string; images: string[] };

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () =>
              new Promise<Reply>((resolve) => {
                mockReply = resolve;
              }),
          }),
        }),
      }),
    }),
  }),
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

beforeEach(() => {
  mockReply = null;
  mockServer = { id: 'p-1', images: ['https://img/a.jpg', 'https://img/b.jpg'] };
});

describe('F15c — folio image remove is pending-only', () => {
  it('keeps the image reading "Removing…" until the server confirms', async () => {
    renderFolio();
    expect(document.querySelector('img[src="https://img/a.jpg"]')).toHaveAttribute('fetchpriority', 'high');
    expect(document.querySelector('img[src="https://img/a.jpg"]')).toHaveAttribute('decoding', 'async');
    expect(document.querySelector('img[src="https://img/a.jpg"]')).not.toHaveAttribute('loading', 'lazy');
    fireEvent.click(screen.getByRole('button', { name: 'Remove image 2' }));

    await waitFor(() => expect(mockReply).not.toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('Removing…');
    expect(screen.getByRole('button', { name: 'Preview image 2 of 2' })).toBeInTheDocument();
    // No second write may race the pending remove.
    expect(screen.getByRole('button', { name: 'Remove image 1' })).toBeDisabled();

    mockServer = { id: 'p-1', images: ['https://img/a.jpg'] };
    await act(async () => mockReply?.({ data: mockServer, error: null }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Preview image 2 of 2' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Preview image 1 of 1' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the image and shows the alert on reject', async () => {
    renderFolio();
    fireEvent.click(screen.getByRole('button', { name: 'Remove image 2' }));
    await waitFor(() => expect(mockReply).not.toBeNull());

    await act(async () => mockReply?.({ data: null, error: { message: 'Refused by the server.' } }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Refused by the server.'),
    );
    expect(screen.getByRole('button', { name: 'Preview image 2 of 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove image 2' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
