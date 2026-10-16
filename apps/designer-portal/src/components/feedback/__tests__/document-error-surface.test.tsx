/**
 * US-34 N12b (PQ11) — no global "Error" toast from a (document) mutation;
 * the act answers inline (R83). Runs against the portal's real queryClient,
 * so its real MutationCache decides whether the toast fires.
 */
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/react-query';
import { setToastFunction } from '@/lib/error-handler';
import { InlineErrorSurface } from '../inline-error-surface';
import { ActFailLine, TRY_AGAIN } from '../act-fail-line';
import { ResolvePunch } from '@/components/document/coordination/item-resolve/resolve-punch';
import { ResolveRfi } from '@/components/document/coordination/item-resolve/resolve-rfi';
import { DiscoveryMargin } from '@/components/document/discovery/discovery-margin';

const mockResolveFn = jest.fn();
const mockCreateNoteFn = jest.fn();

function useMockRealMutation(fn: jest.Mock) {
  const { useMutation: useRealMutation } = jest.requireActual('@tanstack/react-query');
  return useRealMutation({ mutationFn: (vars: unknown) => fn(vars) });
}

jest.mock('@patina/supabase', () => ({
  useResolveCoordinationItem: () => useMockRealMutation(mockResolveFn),
}));
jest.mock('@/hooks/use-margin-notes', () => ({
  useCreateMarginNote: () => useMockRealMutation(mockCreateNoteFn),
}));
jest.mock('@/hooks/use-discovery-margin', () => ({
  useDiscoveryMarginNotes: () => ({ data: [] }),
}));
jest.mock('@/components/document/margin-item', () => ({ MarginItem: () => null }));
jest.mock('@/components/document/coordination/open-item-sheet', () => ({
  ButtonRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Field: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  QuietConfirm: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResolveButton: ({
    actionKey: _actionKey,
    tone: _tone,
    variant: _variant,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    actionKey?: string;
    tone?: string;
    variant?: string;
  }) => <button {...props}>{children}</button>,
  ResolveQuestion: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  ResolveShell: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  ResolveTextarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

const toast = jest.fn();

/** The (document) layout's posture: the surface marker sits beside the page. */
function OnDocument({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <InlineErrorSurface />
      {children}
    </QueryClientProvider>
  );
}

const ITEM = { id: 'item-1', options: [] } as never;

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.getMutationCache().clear();
  setToastFunction(toast);
});

describe('the global mutation toast (N12b gate)', () => {
  function Act() {
    const m = useMutation({
      mutationFn: async () => {
        throw new Error('The write was refused.');
      },
    });
    return (
      <>
        <button type="button" onClick={() => m.mutate()}>
          Act
        </button>
        <ActFailLine error={m.error} />
      </>
    );
  }

  it('does not raise the "Error" toast for a mutation failing on a (document) surface', async () => {
    render(
      <OnDocument>
        <Act />
      </OnDocument>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Act' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The write was refused.');
    expect(toast).not.toHaveBeenCalled();
  });

  it('keeps the toast on a non-document route (no InlineErrorSurface mounted)', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Act />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Act' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          description: 'The write was refused.',
          variant: 'destructive',
        }),
      ),
    );
  });

  it('gives the toast back once the (document) surface unmounts', async () => {
    const { unmount } = render(
      <OnDocument>
        <span />
      </OnDocument>,
    );
    unmount();
    render(
      <QueryClientProvider client={queryClient}>
        <Act />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Act' }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
  });
});

describe('converted (document) acts answer inline (R83)', () => {
  it('ResolvePunch: a refused verify reads inline with a 44 px Try again that re-runs it', async () => {
    mockResolveFn.mockRejectedValueOnce(new Error('Could not record the verification.'));
    mockResolveFn.mockResolvedValueOnce({});
    render(
      <OnDocument>
        <ResolvePunch item={ITEM} projectId="project-1" onResolved={jest.fn()} />
      </OnDocument>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Verify & close →' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not record the verification.');
    const retry = screen.getByRole('button', { name: TRY_AGAIN });
    expect(retry).toHaveClass('min-h-[44px]');
    expect(toast).not.toHaveBeenCalled();

    fireEvent.click(retry);
    await waitFor(() => expect(mockResolveFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('ResolveRfi: a failed answer (a send) reads inline and never offers Try again', async () => {
    mockResolveFn.mockRejectedValueOnce(new Error('The answer did not go.'));
    render(
      <OnDocument>
        <ResolveRfi item={ITEM} projectId="project-1" onResolved={jest.fn()} />
      </OnDocument>,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Use the 3/4 reveal.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send answer →' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The answer did not go.');
    expect(screen.queryByRole('button', { name: TRY_AGAIN })).not.toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();
  });

  it('DiscoveryMargin: a note that failed to save keeps its words and offers Try again', async () => {
    mockCreateNoteFn.mockRejectedValueOnce(new Error('The note was not saved.'));
    mockCreateNoteFn.mockResolvedValueOnce({});
    render(
      <OnDocument>
        <DiscoveryMargin designerClientId="dc-1" />
      </OnDocument>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Note/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'She lit up at the oak.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The note was not saved.');
    expect(screen.getByRole('textbox')).toHaveValue('She lit up at the oak.');
    expect(toast).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: TRY_AGAIN }));
    await waitFor(() => expect(mockCreateNoteFn).toHaveBeenCalledTimes(2));
    expect(mockCreateNoteFn).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: 'She lit up at the oak.', designerClientId: 'dc-1' }),
    );
  });
});
