/**
 * US-34 F16 / E1 §6 #6–8 — the scope builder's silent deletes and Mark
 * satisfied become pending-only acts: while the write is in flight the act
 * is disabled and `aria-busy`, its word says what is happening, and a second
 * press is ignored. Never optimistic (a delete without Undo; a gate outcome).
 * The mutations are real TanStack mutations so `isPending` is the library's.
 */
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExclusionsList } from '../exclusions-list';
import { GateConditionsEditor } from '../gate-conditions-editor';

const mockRemoveExclusion = jest.fn();
const mockRemoveGate = jest.fn();
const mockSatisfyGate = jest.fn();

jest.mock('@/lib/analytics', () => ({
  proposalEvents: { scopeUpdated: jest.fn() },
}));

jest.mock('@patina/supabase', () => {
  const { useMutation } = jest.requireActual('@tanstack/react-query');
  const idle = () => ({ mutate: jest.fn(), isPending: false });
  return {
    useProposalExclusions: () => ({
      data: [
        { id: 'ex-1', description: 'Permit applications', category: 'construction' },
        { id: 'ex-2', description: 'Custom millwork', category: 'procurement' },
      ],
      isLoading: false,
    }),
    useAddExclusion: idle,
    useRemoveExclusion: () =>
      useMutation({ mutationFn: (v: unknown) => mockRemoveExclusion(v) }),
    usePhaseGates: () => ({
      data: [
        {
          id: 'gate-1',
          phase_id: 'phase-1',
          gate_kind: 'client_signature',
          payload: {},
          satisfied_at: null,
          satisfied_by: null,
          override_reason: null,
          sort_order: 0,
          created_at: '2026-10-01T00:00:00Z',
          updated_at: '2026-10-01T00:00:00Z',
        },
      ],
      isLoading: false,
    }),
    useAddGate: idle,
    useUpdateGate: idle,
    useDesignerOverrideGate: idle,
    useRemoveGate: () => useMutation({ mutationFn: (v: unknown) => mockRemoveGate(v) }),
    useSatisfyGate: () => useMutation({ mutationFn: (v: unknown) => mockSatisfyGate(v) }),
  };
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => (resolve = res));
  return { promise, resolve };
}

function withClient(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockRemoveExclusion.mockReset();
  mockRemoveGate.mockReset();
  mockSatisfyGate.mockReset();
});

describe('ExclusionsList remove (F16, E1 §6 #6)', () => {
  it('holds every remove while one is pending, and says which', async () => {
    const write = deferred();
    mockRemoveExclusion.mockReturnValue(write.promise);
    render(withClient(<ExclusionsList proposalId="proposal-1" />));

    const [first, second] = screen.getAllByRole('button', { name: 'x' });
    fireEvent.click(first);

    const removing = await screen.findByRole('button', { name: 'Removing…' });
    expect(removing).toHaveAttribute('aria-busy', 'true');
    expect(removing).toBeDisabled();
    expect(second).toBeDisabled();
    expect(second).not.toHaveAttribute('aria-busy');

    fireEvent.click(removing);
    fireEvent.click(second);
    expect(mockRemoveExclusion).toHaveBeenCalledTimes(1);

    await act(async () => write.resolve());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Removing…' })).toBeNull(),
    );
    expect(screen.getAllByRole('button', { name: 'x' })[1]).toBeEnabled();
  });
});

describe('GateConditionsEditor (F16, E1 §6 #7–8)', () => {
  const editor = () =>
    render(withClient(<GateConditionsEditor phaseId="phase-1" allPhases={[]} milestones={[]} />));

  it('Mark satisfied is disabled and aria-busy while pending; a second press is ignored', async () => {
    const write = deferred();
    mockSatisfyGate.mockReturnValue(write.promise);
    editor();

    fireEvent.click(screen.getByRole('button', { name: 'Mark satisfied' }));
    const marking = await screen.findByRole('button', { name: 'Marking satisfied…' });
    expect(marking).toHaveAttribute('aria-busy', 'true');
    expect(marking).toBeDisabled();
    fireEvent.click(marking);
    expect(mockSatisfyGate).toHaveBeenCalledTimes(1);

    await act(async () => write.resolve());
    expect(await screen.findByRole('button', { name: 'Mark satisfied' })).toBeEnabled();
  });

  it('remove is disabled and aria-busy while pending; a second press is ignored', async () => {
    const write = deferred();
    mockRemoveGate.mockReturnValue(write.promise);
    editor();

    fireEvent.click(screen.getByRole('button', { name: 'Remove gate' }));
    const removing = await screen.findByRole('button', { name: 'Removing gate' });
    expect(removing).toHaveAttribute('aria-busy', 'true');
    expect(removing).toBeDisabled();
    fireEvent.click(removing);
    expect(mockRemoveGate).toHaveBeenCalledTimes(1);

    await act(async () => write.resolve());
    expect(await screen.findByRole('button', { name: 'Remove gate' })).toBeEnabled();
  });
});
