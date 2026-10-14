/**
 * US-34 F15b/F15c: the swatch row never shows a state the database lacks.
 * A refused role rolls the select back to the server value; a delete is
 * pending-only (no Undo yet), so the row stays reading "Removing…" until the
 * server confirms, and a refused delete says so inline.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaletteSwatchEditor } from '../palette-swatch-editor';

type Deferred = { resolve: () => void; reject: (e: Error) => void };
let mockUpsertFn: () => Promise<unknown>;
let mockDelete: Deferred | null = null;

jest.mock('@patina/supabase', () => {
  const { useMutation: mockUseMutation } = jest.requireActual('@tanstack/react-query');
  return {
    useUpsertSwatch: () => mockUseMutation({ mutationFn: () => mockUpsertFn() }),
    useDeleteSwatch: () =>
      mockUseMutation({
        mutationFn: () =>
          new Promise<void>((resolve, reject) => {
            mockDelete = { resolve, reject };
          }),
      }),
  };
});

const swatch = {
  id: 'swatch-1',
  palette_id: 'palette-1',
  hex: '#A8B5A6',
  name: 'Sage',
  role: 'wall',
  paint_color_id: null,
  brand: null,
  brand_code: null,
  source_pixel: null,
  sort_order: 0,
  created_at: '2026-07-31T12:00:00Z',
} as never;

const renderEditor = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <PaletteSwatchEditor proposalId="proposal-1" swatch={swatch} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  mockDelete = null;
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('F15b — a refused role rolls back to the server value', () => {
  it('shows the server role after the write is refused', async () => {
    mockUpsertFn = () => Promise.reject(new Error('permission denied'));
    renderEditor();
    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('wall');

    fireEvent.change(select, { target: { value: 'accent' } });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t save'));
    expect(select).toHaveValue('wall');
  });

  type Write = { resolve: (row: unknown) => void; reject: (e: Error) => void };
  const deferWrites = () => {
    const writes: Write[] = [];
    mockUpsertFn = () => new Promise((resolve, reject) => writes.push({ resolve, reject }));
    return writes;
  };
  const editorFor = (role: string) => (
    <PaletteSwatchEditor proposalId="proposal-1" swatch={{ ...(swatch as object), role } as never} />
  );

  it('A then B before A lands; A succeeds and B is refused: the select shows A', async () => {
    const writes = deferWrites();
    renderEditor();
    const select = screen.getByRole('combobox');

    fireEvent.change(select, { target: { value: 'accent' } });
    fireEvent.change(select, { target: { value: 'trim' } });
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(select).toHaveValue('trim');

    await act(async () => writes[0].resolve({ ...(swatch as object), role: 'accent' }));
    expect(select).toHaveValue('trim');
    await act(async () => writes[1].reject(new Error('permission denied')));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t save'));
    expect(select).toHaveValue('accent');
  });

  it('takes a new server role from props only while no role write is pending', async () => {
    const writes = deferWrites();
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrap = (role: string) => <QueryClientProvider client={client}>{editorFor(role)}</QueryClientProvider>;
    const { rerender } = render(wrap('wall'));
    const select = screen.getByRole('combobox');

    rerender(wrap('floor'));
    expect(select).toHaveValue('floor');

    fireEvent.change(select, { target: { value: 'accent' } });
    await waitFor(() => expect(writes).toHaveLength(1));
    // A refetch lands while the choice is in flight: the choice stays.
    rerender(wrap('trim'));
    expect(select).toHaveValue('accent');

    // Refused: back to the role the database last confirmed.
    await act(async () => writes[0].reject(new Error('permission denied')));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t save'));
    expect(select).toHaveValue('trim');
  });
});

describe('F15c — swatch delete is pending-only', () => {
  it('keeps the swatch reading "Removing…" until resolve', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Delete swatch' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Removing…'));
    expect(screen.getByText('#A8B5A6')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Sage')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete swatch' })).not.toBeInTheDocument();

    await act(async () => mockDelete?.resolve());
    // Confirmed: the row leaves on the parent's refetch and never offers delete again.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Removing…'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the alert and keeps the swatch on reject', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Delete swatch' }));
    await waitFor(() => expect(mockDelete).not.toBeNull());

    await act(async () => mockDelete?.reject(new Error('refused')));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t remove the swatch'),
    );
    expect(screen.getByText('#A8B5A6')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete swatch' })).toBeInTheDocument();
  });
});
