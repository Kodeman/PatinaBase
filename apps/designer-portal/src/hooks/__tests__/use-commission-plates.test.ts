/**
 * WP-01.8 — the studio's commission plates read board covers and proposal
 * covers only ("Studio plate images" ruling): never a scan or a Field capture,
 * and a job with neither source has no plate (the studio sets its name).
 */
import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockTables: string[] = [];
const mockRows: Record<string, unknown[]> = {};

function mockQuery(table: string) {
  const result = { data: mockRows[table] ?? [], error: null };
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'not', 'or', 'in']) chain[method] = () => chain;
  chain.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    from: (table: string) => {
      mockTables.push(table);
      return mockQuery(table);
    },
  }),
  // Signing is the board-storage helper's own concern; covers pass through.
  signBoardMediaValue: async (_client: unknown, value: unknown) => value,
}));

import {
  pickCommissionPlates,
  useCommissionPlates,
  type CommissionJob,
} from '../use-commission-plates';

const job = (jobId: string, projectId: string | null, proposalId: string | null): CommissionJob => ({
  jobId,
  projectId,
  proposalId,
});

describe('pickCommissionPlates', () => {
  it("takes the job's newest board cover, from its project or its proposal", () => {
    const plates = pickCommissionPlates(
      [job('p1', 'p1', 'q1')],
      [
        { project_id: 'p1', proposal_id: null, cover_image_url: 'https://cdn/old.jpg', updated_at: '2026-09-01T00:00:00Z' },
        { project_id: null, proposal_id: 'q1', cover_image_url: 'https://cdn/new.jpg', updated_at: '2026-10-01T00:00:00Z' },
      ],
      [{ id: 'q1', cover_image: 'https://cdn/proposal.jpg' }],
    );
    expect(plates.get('p1')).toEqual({ url: 'https://cdn/new.jpg', source: 'board' });
  });

  it("falls back to the proposal's cover when no board has one", () => {
    const plates = pickCommissionPlates(
      [job('p1', 'p1', 'q1')],
      [{ project_id: 'p1', proposal_id: null, cover_image_url: null, updated_at: '2026-10-01T00:00:00Z' }],
      [{ id: 'q1', cover_image: 'https://cdn/proposal.jpg' }],
    );
    expect(plates.get('p1')).toEqual({ url: 'https://cdn/proposal.jpg', source: 'proposal' });
  });

  it('gives a job with neither source no plate, and never borrows another job’s', () => {
    const plates = pickCommissionPlates(
      [job('p1', 'p1', null), job('lead-1', null, null)],
      [{ project_id: 'p2', proposal_id: null, cover_image_url: 'https://cdn/other.jpg', updated_at: null }],
      [{ id: 'q9', cover_image: '  ' }],
    );
    expect(plates.size).toBe(0);
  });
});

describe('useCommissionPlates', () => {
  beforeEach(() => {
    mockTables.length = 0;
    for (const key of Object.keys(mockRows)) delete mockRows[key];
  });

  function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return createElement(QueryClientProvider, { client }, children);
  }

  it('reads proposal_boards and proposals only — never scans or Field captures', async () => {
    mockRows.proposal_boards = [
      { project_id: 'p1', proposal_id: null, cover_image_url: 'https://cdn/board.jpg', updated_at: '2026-10-01T00:00:00Z' },
    ];
    mockRows.proposals = [{ id: 'q2', cover_image: 'https://cdn/cover.jpg' }];
    const jobs = [job('p1', 'p1', 'q1'), job('q2', null, 'q2')];
    const { result } = renderHook(() => useCommissionPlates(jobs), { wrapper });

    await waitFor(() => expect(result.current.plates.size).toBe(2));
    expect(result.current.plates.get('p1')).toEqual({ url: 'https://cdn/board.jpg', source: 'board' });
    expect(result.current.plates.get('q2')).toEqual({ url: 'https://cdn/cover.jpg', source: 'proposal' });
    expect([...new Set(mockTables)].sort()).toEqual(['proposal_boards', 'proposals']);
  });

  it('reads nothing for a studio with no jobs', () => {
    const { result } = renderHook(() => useCommissionPlates([]), { wrapper });
    expect(result.current.plates.size).toBe(0);
    expect(result.current.isPending).toBe(false);
    expect(mockTables).toEqual([]);
  });
});
