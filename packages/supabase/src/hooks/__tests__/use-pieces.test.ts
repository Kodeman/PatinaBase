import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — useQuery/useMutation return their own config, so a test reads the
// query key, runs the queryFn, and calls mutationFn/onSuccess directly.
// ─────────────────────────────────────────────────────────────────────────────

/** A PostgREST builder: every method records itself and returns the chain. */
function makeChain(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'not', 'order']) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return { chain, calls };
}

const rpc = vi.fn();
const from = vi.fn();
const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  from,
  rpc,
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

// Import AFTER mocks.
import {
  useAddLaborLine,
  useBatchCreateNamedProjectNeeds,
  useHandBackRoom,
  useMakeFfeLineAllowance,
  useProjectRoomPlacements,
  useRemovedProjectLines,
  useRestoreProjectSelection,
  useRoomHandbacks,
  useSetFfeLineBuildFields,
  useSetLaborLinePrice,
  useSetLinePlacements,
} from '../use-pieces';
import { useProjectFFEItems } from '../use-project-v2';

beforeEach(() => {
  vi.clearAllMocks();
});

const invalidatedKeys = () => invalidateQueries.mock.calls.map((c) => c[0].queryKey);

/** invalidateFfeCaches (use-procurement.ts) for project p1. */
const FFE_CACHE_KEYS = [
  ['project-ffe-items', 'p1'],
  ['projects', 'p1'],
  ['procurement-items'],
  ['project-ffe-readiness'],
];

interface MutationConfig<TVars, TResult> {
  mutationFn: (vars: TVars) => Promise<TResult>;
  onSuccess: (result: TResult, vars: TVars) => void;
}

async function runMutation<TVars, TResult>(config: unknown, vars: TVars): Promise<TResult> {
  const mutation = config as MutationConfig<TVars, TResult>;
  const result = await mutation.mutationFn(vars);
  mutation.onSuccess(result, vars);
  return result;
}

function expectFfeCachesInvalidated() {
  const keys = invalidatedKeys();
  for (const key of FFE_CACHE_KEYS) expect(keys).toContainEqual(key);
}

// ─────────────────────────────────────────────────────────────────────────────
// Room placements (00734)
// ─────────────────────────────────────────────────────────────────────────────

describe('useProjectRoomPlacements', () => {
  interface Config {
    queryKey: unknown[];
    queryFn: () => Promise<unknown>;
    enabled: boolean;
  }

  it('keys on ["project-room-placements", projectId] and is off without a project', () => {
    const config = useProjectRoomPlacements('p1') as unknown as Config;
    expect(config.queryKey).toEqual(['project-room-placements', 'p1']);
    expect(config.enabled).toBe(true);
    expect((useProjectRoomPlacements(null) as unknown as Config).enabled).toBe(false);
  });

  it('reads project_ffe_placements for the project and maps to FfeRoomPlacement', async () => {
    const { chain, calls } = makeChain({
      data: [
        { id: 'pl-1', ffe_item_id: 'i1', project_room_id: 'r1', quantity: 210, area_note: 'hall', sort_order: 0 },
      ],
      error: null,
    });
    from.mockReturnValue(chain);
    const config = useProjectRoomPlacements('p1') as unknown as Config;
    await expect(config.queryFn()).resolves.toEqual([
      { id: 'pl-1', ffeItemId: 'i1', projectRoomId: 'r1', quantity: 210, areaNote: 'hall', sortOrder: 0 },
    ]);
    expect(from).toHaveBeenCalledWith('project_ffe_placements');
    expect(calls).toContainEqual(['eq', ['project_id', 'p1']]);
  });
});

describe('useSetLinePlacements', () => {
  it('calls set_line_placements with p_ffe_item_id and p_placements, maps the result, and invalidates placements + ffe caches', async () => {
    rpc.mockResolvedValue({
      data: {
        placements: [
          { placementId: 'pl-1', roomId: 'r1', roomName: 'Hall', quantity: 210, areaNote: null, sortOrder: 0 },
          { placementId: 'pl-2', roomId: 'r2', roomName: 'Living', quantity: 620, areaNote: 'under rug', sortOrder: 1 },
        ],
        wasteQuantity: 83,
      },
      error: null,
    });
    const placements = [
      { roomId: 'r1', quantity: 210 },
      { roomId: 'r2', quantity: 620, areaNote: 'under rug' },
    ];
    const result = await runMutation(useSetLinePlacements(), { projectId: 'p1', itemId: 'i1', placements });

    expect(rpc).toHaveBeenCalledWith('set_line_placements', { p_ffe_item_id: 'i1', p_placements: placements });
    expect(result).toEqual({
      placements: [
        { id: 'pl-1', ffeItemId: 'i1', projectRoomId: 'r1', quantity: 210, areaNote: null, sortOrder: 0 },
        { id: 'pl-2', ffeItemId: 'i1', projectRoomId: 'r2', quantity: 620, areaNote: 'under rug', sortOrder: 1 },
      ],
      wasteQuantity: 83,
    });
    expect(invalidatedKeys()).toContainEqual(['project-room-placements', 'p1']);
    expectFfeCachesInvalidated();
  });

  it('throws the RPC error and invalidates nothing', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'over quantity' } });
    const config = useSetLinePlacements() as unknown as MutationConfig<unknown, unknown>;
    await expect(config.mutationFn({ projectId: 'p1', itemId: 'i1', placements: [] })).rejects.toEqual({
      message: 'over quantity',
    });
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Needs and build fields (00730)
// ─────────────────────────────────────────────────────────────────────────────

describe('useBatchCreateNamedProjectNeeds', () => {
  it('sends the whole request as p_request and invalidates the ffe caches', async () => {
    rpc.mockResolvedValue({ data: { selectionIds: ['s1', 's2'] }, error: null });
    const request = {
      projectId: 'p1',
      roomId: 'r1',
      assignmentScope: 'room' as const,
      lines: [{ name: 'Vanity', quantity: 2, unit: 'each' as const, roughCents: 480000 }, { name: 'Tile' }],
      idempotencyKey: 'k1',
    };
    const result = await runMutation(useBatchCreateNamedProjectNeeds(), request);

    expect(rpc).toHaveBeenCalledWith('batch_create_named_project_needs', { p_request: request });
    expect(result).toEqual({ selectionIds: ['s1', 's2'] });
    expectFfeCachesInvalidated();
  });
});

describe('useSetFfeLineBuildFields', () => {
  it('sends p_item_id and only the build fields as p_request, never projectId or itemId', async () => {
    rpc.mockResolvedValue({ data: { id: 'i1', unit: 'roll' }, error: null });
    await runMutation(useSetFfeLineBuildFields(), {
      projectId: 'p1',
      itemId: 'i1',
      quantity: 9,
      unit: 'roll' as const,
      roughCents: null,
    });

    expect(rpc).toHaveBeenCalledWith('set_project_ffe_line_build_fields', {
      p_item_id: 'i1',
      p_request: { quantity: 9, unit: 'roll', roughCents: null },
    });
    const sent = rpc.mock.calls[0][1].p_request as Record<string, unknown>;
    expect(sent).not.toHaveProperty('projectId');
    expect(sent).not.toHaveProperty('itemId');
    // A null rough is sent so the RPC clears it.
    expect(sent).toHaveProperty('roughCents', null);
    expectFfeCachesInvalidated();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Removed lines and restore (00731)
// ─────────────────────────────────────────────────────────────────────────────

describe('useRemovedProjectLines', () => {
  interface Config {
    queryKey: unknown[];
    queryFn: () => Promise<unknown>;
  }

  it('keys on ["project-ffe-removed", projectId] and reads removed_at IS NOT NULL', async () => {
    const { chain, calls } = makeChain({ data: [{ id: 'i9' }], error: null });
    from.mockReturnValue(chain);
    const config = useRemovedProjectLines('p1') as unknown as Config;
    expect(config.queryKey).toEqual(['project-ffe-removed', 'p1']);
    await expect(config.queryFn()).resolves.toEqual([{ id: 'i9' }]);
    expect(from).toHaveBeenCalledWith('project_ffe_items');
    expect(calls).toContainEqual(['eq', ['project_id', 'p1']]);
    expect(calls).toContainEqual(['not', ['removed_at', 'is', null]]);
  });
});

describe('useRestoreProjectSelection', () => {
  it('calls restore_project_selection with p_ffe_item_id and invalidates the ffe caches + removed', async () => {
    rpc.mockResolvedValue({ data: { selectionId: 'i9', restored: true }, error: null });
    const result = await runMutation(useRestoreProjectSelection(), { projectId: 'p1', selectionId: 'i9' });

    expect(rpc).toHaveBeenCalledWith('restore_project_selection', { p_ffe_item_id: 'i9' });
    expect(result).toEqual({ selectionId: 'i9', restored: true });
    expect(invalidatedKeys()).toContainEqual(['project-ffe-removed', 'p1']);
    expectFfeCachesInvalidated();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Labor lines (00732)
// ─────────────────────────────────────────────────────────────────────────────

describe('useAddLaborLine', () => {
  it('calls add_labor_line with p_parent_ffe_item_id and the labor request, and invalidates the ffe caches', async () => {
    rpc.mockResolvedValue({ data: { selectionId: 'lab-1', parentFfeItemId: 'i1' }, error: null });
    const result = await runMutation(useAddLaborLine(), {
      projectId: 'p1',
      parentItemId: 'i1',
      name: 'Install wallpaper',
      quantity: 9,
      unit: 'roll' as const,
      vendorId: 'v-installer',
    });

    expect(rpc).toHaveBeenCalledWith('add_labor_line', {
      p_parent_ffe_item_id: 'i1',
      p_request: { name: 'Install wallpaper', quantity: 9, unit: 'roll', vendorId: 'v-installer' },
    });
    expect(result).toMatchObject({ selectionId: 'lab-1' });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_unit_price_cents');
    expectFfeCachesInvalidated();
  });

  it('sends unitPriceCents as p_unit_price_cents, never inside p_request (00737)', async () => {
    rpc.mockResolvedValue({ data: { selectionId: 'lab-2', parentFfeItemId: 'i1' }, error: null });
    await runMutation(useAddLaborLine(), {
      projectId: 'p1',
      parentItemId: 'i1',
      name: 'Install wallpaper',
      quantity: 9,
      unit: 'roll' as const,
      unitPriceCents: 8500,
    });

    expect(rpc).toHaveBeenCalledWith('add_labor_line', {
      p_parent_ffe_item_id: 'i1',
      p_request: { name: 'Install wallpaper', quantity: 9, unit: 'roll' },
      p_unit_price_cents: 8500,
    });
    expectFfeCachesInvalidated();
  });
});

describe('useSetLaborLinePrice', () => {
  it('calls set_labor_line_price with p_ffe_item_id and p_unit_price_cents, and invalidates the ffe caches', async () => {
    rpc.mockResolvedValue({
      data: { selectionId: 'lab-1', unitPriceCents: 8500, lineTotalCents: 76500 },
      error: null,
    });
    const result = await runMutation(useSetLaborLinePrice(), { projectId: 'p1', itemId: 'lab-1', unitPriceCents: 8500 });

    expect(rpc).toHaveBeenCalledWith('set_labor_line_price', { p_ffe_item_id: 'lab-1', p_unit_price_cents: 8500 });
    expect(result).toEqual({ selectionId: 'lab-1', unitPriceCents: 8500, lineTotalCents: 76500 });
    expectFfeCachesInvalidated();
  });

  it('throws the RPC error and invalidates nothing', async () => {
    const error = { message: 'Released labor changes through Record a change.' };
    rpc.mockResolvedValue({ data: null, error });
    const mutation = useSetLaborLinePrice() as unknown as MutationConfig<unknown, unknown>;

    await expect(mutation.mutationFn({ projectId: 'p1', itemId: 'lab-1', unitPriceCents: 9000 })).rejects.toBe(error);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Room hand-backs (00742, W4)
// ─────────────────────────────────────────────────────────────────────────────

describe('useRoomHandbacks', () => {
  interface Config {
    queryKey: unknown[];
    queryFn: () => Promise<unknown>;
  }

  it('keys on ["project-room-handbacks", projectId] and maps rows to RoomHandback', async () => {
    const { chain, calls } = makeChain({
      data: [{ id: 'hb-1', project_room_id: 'r1', handed_back_by: 'u1', handed_back_at: '2026-10-08T00:00:00Z' }],
      error: null,
    });
    from.mockReturnValue(chain);
    const config = useRoomHandbacks('p1') as unknown as Config;
    expect(config.queryKey).toEqual(['project-room-handbacks', 'p1']);
    await expect(config.queryFn()).resolves.toEqual([
      { id: 'hb-1', projectRoomId: 'r1', handedBackBy: 'u1', handedBackAt: '2026-10-08T00:00:00Z' },
    ]);
    expect(from).toHaveBeenCalledWith('project_room_handbacks');
    expect(calls).toContainEqual(['eq', ['project_id', 'p1']]);
    expect(calls).toContainEqual(['order', ['handed_back_at', { ascending: false }]]);
  });
});

describe('useHandBackRoom', () => {
  it('calls hand_back_project_room with p_project_room_id and invalidates only the handbacks key, never the ffe caches', async () => {
    rpc.mockResolvedValue({ data: { handedBackAt: '2026-10-08T00:00:00Z' }, error: null });
    const result = await runMutation(useHandBackRoom(), { projectId: 'p1', roomId: 'r1' });

    expect(rpc).toHaveBeenCalledWith('hand_back_project_room', { p_project_room_id: 'r1' });
    expect(result).toEqual({ handedBackAt: '2026-10-08T00:00:00Z' });
    expect(invalidatedKeys()).toEqual([['project-room-handbacks', 'p1']]);
  });

  it('throws the RPC error and invalidates nothing', async () => {
    const error = { message: 'project not found or access denied' };
    rpc.mockResolvedValue({ data: null, error });
    const mutation = useHandBackRoom() as unknown as MutationConfig<unknown, unknown>;

    await expect(mutation.mutationFn({ projectId: 'p1', roomId: 'r1' })).rejects.toBe(error);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Allowance (00743, W4)
// ─────────────────────────────────────────────────────────────────────────────

describe('useMakeFfeLineAllowance', () => {
  it('calls make_ffe_line_allowance with p_item_id and p_budget_max_cents, and invalidates the ffe caches', async () => {
    rpc.mockResolvedValue({ data: { id: 'i1', item_type: 'allowance', budget_max_cents: 500000 }, error: null });
    const result = await runMutation(useMakeFfeLineAllowance(), { projectId: 'p1', itemId: 'i1', budgetMaxCents: 500000 });

    expect(rpc).toHaveBeenCalledWith('make_ffe_line_allowance', { p_item_id: 'i1', p_budget_max_cents: 500000 });
    expect(result).toEqual({ id: 'i1', item_type: 'allowance', budget_max_cents: 500000 });
    expectFfeCachesInvalidated();
  });

  it('throws the RPC error and invalidates nothing', async () => {
    const error = { message: "An allowance needs a ceiling above $0." };
    rpc.mockResolvedValue({ data: null, error });
    const mutation = useMakeFfeLineAllowance() as unknown as MutationConfig<unknown, unknown>;

    await expect(mutation.mutationFn({ projectId: 'p1', itemId: 'i1', budgetMaxCents: 0 })).rejects.toBe(error);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useProjectFFEItems (use-project-v2.ts): the computed stage fields (00736)
// ─────────────────────────────────────────────────────────────────────────────

describe('useProjectFFEItems', () => {
  interface Config {
    queryKey: unknown[];
    queryFn: () => Promise<unknown>;
  }

  it('selects ffe_line_stage and ffe_line_authorization and keeps its key', async () => {
    const { chain, calls } = makeChain({ data: [], error: null });
    from.mockReturnValue(chain);
    const config = useProjectFFEItems('p1') as unknown as Config;
    expect(config.queryKey).toEqual(['project-ffe-items', 'p1', undefined, { withLifecycle: false }]);
    await config.queryFn();

    const select = calls.find(([method]) => method === 'select');
    const columns = String(select?.[1][0]).split(/[\s,]+/);
    expect(columns).toContain('ffe_line_stage');
    expect(columns).toContain('ffe_line_authorization');
    expect(calls).toContainEqual(['is', ['removed_at', null]]);
  });
});
