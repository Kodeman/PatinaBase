import { renderHook } from '@testing-library/react';
import type { MarginItemRow } from '@/lib/document/margin-derivation';
import type { WorkflowGate } from '@/lib/document/workflow-gate';

let mockItems: MarginItemRow[] = [];
let mockCoordinationItems: unknown[] | undefined = [];
let mockGates: WorkflowGate[] = [];
let mockFfeItems: Array<{
  id: string;
  name: string;
  room?: { name?: string | null } | null;
}> = [];

jest.mock('@/hooks/use-margin-items', () => ({
  useMarginItems: () => ({ data: mockItems }),
}));

jest.mock('@patina/supabase', () => ({
  useCoordinationItems: () => ({
    data: mockCoordinationItems,
    isLoading: false,
    isPending: false,
    isError: false,
  }),
  useProjectFFEItems: () => ({ data: mockFfeItems }),
  isProjectArtifactApproval: () => false,
}));

jest.mock('@/components/document/margin-handoff-item', () => ({
  useHandoffGates: () => ({
    gates: mockGates,
    handoffsById: new Map(),
    isError: false,
  }),
}));

import { useMarginSheet } from '../use-margin-sheet';

function row(overrides: Partial<MarginItemRow>): MarginItemRow {
  return {
    kind: 'decision',
    item_id: 'item-1',
    project_id: 'proj-1',
    proposal_id: null,
    anchor_kind: 'letterhead',
    anchor_id: null,
    state: 'pending',
    title: 'A decision',
    detail: '',
    ts: '2026-08-01T00:00:00Z',
    payload: {},
    ...overrides,
  };
}

function gate(overrides: Partial<WorkflowGate>): WorkflowGate {
  return {
    id: 'gate-1',
    sourceKind: 'project_approval',
    sourceId: 'src-1',
    sourceState: 'pending',
    projectId: 'proj-1',
    canonicalStageKey: null,
    lane: 'With Marta',
    studioLane: false,
    terms: 'Awaiting a pick',
    provenance: '',
    dueAt: null,
    overdue: { isOverdue: false, days: 0 },
    act: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockItems = [];
  mockCoordinationItems = [];
  mockGates = [];
  mockFfeItems = [];
});

describe('useMarginSheet (W5-R1, the whole margin)', () => {
  it('groups THE WHOLE JOB (letterhead/section) ahead of BESIDE PIECES (line), mirroring the seed’s 4/3 split', () => {
    mockItems = [
      row({ item_id: 'overdue6', anchor_kind: 'letterhead', state: 'overdue', title: 'Primary bedroom' }),
      row({ item_id: 'dining', anchor_kind: 'letterhead', state: 'responded', title: 'Dining finish' }),
      row({ item_id: 'hardware', anchor_kind: 'letterhead', state: 'responded', title: 'Hardware' }),
      row({
        item_id: 'invoice',
        kind: 'invoice',
        anchor_kind: 'letterhead',
        state: 'sent',
        title: 'INV-2026-114',
      }),
      row({ item_id: 'com', anchor_kind: 'line', anchor_id: 'ffe-2', state: 'overdue', title: 'Living room fabric' }),
      row({ item_id: 'console', kind: 'message', anchor_kind: 'line', anchor_id: 'ffe-1', state: 'unread', title: 'Console thread' }),
      row({ item_id: 'po', kind: 'message', anchor_kind: 'line', anchor_id: 'ffe-19', state: 'unread', title: 'PO thread' }),
    ];

    const { result } = renderHook(() =>
      useMarginSheet({ projectId: 'proj-1', proposalId: null }),
    );

    expect(result.current.groups.map((g) => g.heading)).toEqual([
      'THE WHOLE JOB',
      'BESIDE PIECES',
    ]);
    expect(result.current.groups[0].rows).toHaveLength(4);
    expect(result.current.groups[1].rows).toHaveLength(3);
    expect(result.current.count).toBe(7);
  });

  it('names a line-anchored row’s line as "<room> · <item name>"', () => {
    mockItems = [
      row({ item_id: 'com', anchor_kind: 'line', anchor_id: 'ffe-2', title: 'Living room fabric' }),
    ];
    mockFfeItems = [
      { id: 'ffe-2', name: 'Reading Chair — COM Fabric Pending', room: { name: 'Living Room' } },
    ];

    const { result } = renderHook(() =>
      useMarginSheet({ projectId: 'proj-1', proposalId: null }),
    );

    const besidePieces = result.current.groups.find((g) => g.heading === 'BESIDE PIECES');
    expect(besidePieces?.rows[0].lineLabel).toBe(
      'Living Room · Reading Chair — COM Fabric Pending',
    );
  });

  it('leaves lineLabel null for a non-line-anchored row', () => {
    mockItems = [row({ item_id: 'a', anchor_kind: 'letterhead' })];

    const { result } = renderHook(() =>
      useMarginSheet({ projectId: 'proj-1', proposalId: null }),
    );

    expect(result.current.groups[0].rows[0].lineLabel).toBeNull();
  });

  it('prints no BESIDE group when nothing is line-anchored (the …d6 case)', () => {
    mockItems = [row({ item_id: 'a', anchor_kind: 'letterhead' })];

    const { result } = renderHook(() =>
      useMarginSheet({ projectId: 'proj-1', proposalId: null }),
    );

    expect(result.current.groups.map((g) => g.heading)).toEqual(['THE WHOLE JOB']);
  });

  it('counts an overdue decision regardless of anchor kind, and never counts money', () => {
    mockItems = [
      row({ item_id: 'overdue6', anchor_kind: 'letterhead', state: 'overdue' }),
      row({ item_id: 'com', anchor_kind: 'line', anchor_id: 'ffe-2', state: 'overdue' }),
      // W5-C11 — an invoice in state `'overdue'`, so the assertion has teeth.
      // The old fixture used `'sent'`, which ANY implementation excludes: it
      // proved a state filter, never the kind filter W5-R1 asks for.
      row({
        item_id: 'invoice',
        kind: 'invoice',
        anchor_kind: 'letterhead',
        state: 'overdue',
        payload: { due_date: '2020-01-01' },
      }),
    ];

    const { result } = renderHook(() =>
      useMarginSheet({ projectId: 'proj-1', proposalId: null }),
    );

    expect(result.current.overdueCount).toBe(2);
  });

  it('counts every item plus handoff gates, across all anchor kinds', () => {
    mockItems = [
      row({ item_id: 'a', anchor_kind: 'letterhead' }),
      row({ item_id: 'b', anchor_kind: 'line', anchor_id: 'ffe-1' }),
    ];
    mockGates = [gate({ id: 'g1' })];

    const { result } = renderHook(() =>
      useMarginSheet({ projectId: 'proj-1', proposalId: null }),
    );

    expect(result.current.count).toBe(3);
  });
});
