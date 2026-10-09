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
const cancelQueries = vi.fn(async () => undefined);
const setQueryData = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries, cancelQueries, setQueryData }),
}));

// Import AFTER mocks.
import {
  useAddLaborLine,
  useBatchCreateNamedProjectNeeds,
  useDraftRelease,
  useHandBackRoom,
  useMakeFfeLineAllowance,
  useMergeStudioProduct,
  useProjectLineGroups,
  useProjectRoomPlacements,
  useRemovedProjectLines,
  useRestoreProjectSelection,
  useRoomHandbacks,
  useSetFfeLineBuildFields,
  useSetLaborLinePrice,
  useSetLineGroup,
  useSetLinePlacements,
  useSetRoomFinishes,
} from '../use-pieces';
import { useProjectFFEItems, useProjectPalettes } from '../use-project-v2';

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
// Drafted release (00755, W4 review F-B1)
// ─────────────────────────────────────────────────────────────────────────────

describe('useDraftRelease', () => {
  interface Config {
    queryKey: unknown[];
    queryFn: () => Promise<unknown>;
    enabled: boolean;
  }

  it('reads draft_release_for_project from the server, keyed on ["project-draft-release", projectId]', async () => {
    rpc.mockResolvedValue({
      data: { documentId: 'doc-3', proposalId: 'prop-3', itemIds: ['L1', 'R1', 'R1a'] },
      error: null,
    });
    const config = useDraftRelease('p1') as unknown as Config;

    expect(config.queryKey).toEqual(['project-draft-release', 'p1']);
    expect(config.enabled).toBe(true);
    await expect(config.queryFn()).resolves.toEqual({
      documentId: 'doc-3',
      proposalId: 'prop-3',
      itemIds: ['L1', 'R1', 'R1a'],
    });
    expect(rpc).toHaveBeenCalledWith('draft_release_for_project', { p_project_id: 'p1' });
  });

  it('returns null when the job has no draft', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const config = useDraftRelease('p1') as unknown as Config;
    await expect(config.queryFn()).resolves.toBeNull();
  });

  it('throws the RPC error', async () => {
    const error = { message: 'project not found or access denied' };
    rpc.mockResolvedValue({ data: null, error });
    const config = useDraftRelease('p1') as unknown as Config;
    await expect(config.queryFn()).rejects.toBe(error);
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
// Room finishes (00760, D16, Q10, W6)
// ─────────────────────────────────────────────────────────────────────────────

describe('useSetRoomFinishes', () => {
  function upsertChain(result: { data: unknown; error: unknown }) {
    const calls: Array<[string, unknown[]]> = [];
    const chain: Record<string, unknown> = {};
    for (const method of ['upsert', 'select']) {
      chain[method] = (...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      };
    }
    chain.single = () => {
      calls.push(['single', []]);
      return Promise.resolve(result);
    };
    return { chain, calls };
  }

  const WALLS = {
    surface: 'Walls',
    product: 'Farrow & Ball Setting Plaster No. 231',
    brand: null,
    brandCode: null,
    sheen: 'Eggshell',
    hex: '#F2DCD2',
    sortOrder: 4,
  };

  it("upserts the room's one project_palettes row by (project_id, scope_room_id) and refreshes only the palettes key", async () => {
    const { chain, calls } = upsertChain({ data: { id: 'pal1' }, error: null });
    from.mockReturnValue(chain);
    const mutation = useSetRoomFinishes() as unknown as MutationConfig<unknown, unknown> & {
      onSuccess: (result: unknown, vars: unknown) => Promise<void>;
    };
    const vars = { projectId: 'p1', roomId: 'r1', finishes: [WALLS] };
    const result = await mutation.mutationFn(vars);
    await mutation.onSuccess(result, vars);

    expect(from).toHaveBeenCalledWith('project_palettes');
    expect(calls[0]).toEqual([
      'upsert',
      [
        {
          project_id: 'p1',
          scope_room_id: 'r1',
          name: 'Finishes',
          swatches: [
            {
              surface: 'Walls',
              product: 'Farrow & Ball Setting Plaster No. 231',
              brand: null,
              brand_code: null,
              sheen: 'Eggshell',
              hex: '#F2DCD2',
              sort_order: 0,
            },
          ],
        },
        { onConflict: 'project_id,scope_room_id' },
      ],
    ]);
    expect(rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'pal1' });
    expect(invalidatedKeys()).toEqual([['project-palettes', 'p1']]);
  });

  it('writes over an older swatch, keeping its other keys, the hidden swatches and the palette name', async () => {
    const { chain, calls } = upsertChain({ data: { id: 'pal1' }, error: null });
    from.mockReturnValue(chain);
    const mutation = useSetRoomFinishes() as unknown as MutationConfig<unknown, unknown>;
    const wall = {
      hex: '#E8E4DA',
      name: 'Pointing',
      role: 'wall',
      brand: 'Farrow & Ball',
      brand_code: 'No. 2003',
      paint_color_id: 'pc-2003',
      source_note: 'from the proposal',
      sort_order: 3,
    };
    const textile = { hex: '#7A6A58', name: 'Linen', role: 'textile', sort_order: 1 };
    await mutation.mutationFn({
      projectId: 'p1',
      roomId: 'r1',
      name: 'Kitchen palette',
      finishes: [
        {
          surface: 'Walls',
          product: 'Farrow & Ball Pointing No. 2003',
          brand: 'Farrow & Ball',
          brandCode: 'No. 2003',
          sheen: 'Eggshell',
          hex: '#E8E4DA',
          sortOrder: 3,
          stored: wall,
        },
      ],
      kept: [textile],
    });

    const row = (calls[0][1] as [{ name: string; swatches: unknown[] }])[0];
    expect(row.name).toBe('Kitchen palette');
    expect(row.swatches).toEqual([
      {
        name: 'Pointing',
        role: 'wall',
        paint_color_id: 'pc-2003',
        source_note: 'from the proposal',
        surface: 'Walls',
        product: 'Farrow & Ball Pointing No. 2003',
        brand: 'Farrow & Ball',
        brand_code: 'No. 2003',
        sheen: 'Eggshell',
        hex: '#E8E4DA',
        sort_order: 0,
      },
      textile,
    ]);
    expect(row.swatches[1]).toBe(textile);
  });

  it('shows a failed write only inline, never as a toast (R83)', () => {
    expect((useSetRoomFinishes() as unknown as { meta: unknown }).meta).toEqual({
      errorSurface: 'inline',
    });
  });

  it('starts a write only after the one before it has landed, so the last list wins', async () => {
    const order: string[] = [];
    let landFirst!: () => void;
    const slow = upsertChain({ data: { id: 'pal1' }, error: null });
    slow.chain.single = () =>
      new Promise((resolve) => {
        landFirst = () => {
          order.push('first landed');
          resolve({ data: { id: 'pal1' }, error: null });
        };
      });
    const fast = upsertChain({ data: { id: 'pal1' }, error: null });
    const fastUpsert = fast.chain.upsert as (...args: unknown[]) => unknown;
    fast.chain.upsert = (...args: unknown[]) => {
      order.push('second sent');
      return fastUpsert(...args);
    };
    from.mockReturnValueOnce(slow.chain).mockReturnValueOnce(fast.chain);
    const mutation = useSetRoomFinishes() as unknown as MutationConfig<unknown, unknown>;

    const first = mutation.mutationFn({ projectId: 'p1', roomId: 'r1', finishes: [WALLS] });
    const second = mutation.mutationFn({ projectId: 'p1', roomId: 'r1', finishes: [] });
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual([]);
    landFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['first landed', 'second sent']);
  });

  it('puts the saved row in the cache before the write settles', async () => {
    from.mockReturnValue(upsertChain({ data: { id: 'pal1', swatches: ['new'] }, error: null }).chain);
    const mutation = useSetRoomFinishes() as unknown as MutationConfig<unknown, unknown> & {
      onSuccess: (result: unknown, vars: unknown) => Promise<void>;
    };

    const vars = { projectId: 'p1', roomId: 'r1', finishes: [WALLS] };
    await mutation.onSuccess(await mutation.mutationFn(vars), vars);
    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: ['project-palettes', 'p1'] });
    expect(setQueryData.mock.calls[0][0]).toEqual(['project-palettes', 'p1']);
    const update = setQueryData.mock.calls[0][1] as (old: unknown) => unknown;
    expect(
      update([
        { id: 'pal0', swatches: [] },
        { id: 'pal1', swatches: ['old'] },
      ]),
    ).toEqual([
      { id: 'pal0', swatches: [] },
      { id: 'pal1', swatches: ['new'] },
    ]);
    expect(update([{ id: 'pal0' }])).toEqual([{ id: 'pal0' }, { id: 'pal1', swatches: ['new'] }]);
    expect(update(undefined)).toBeUndefined();
  });

  it('throws the write error and invalidates nothing', async () => {
    const error = { message: 'new row violates row-level security policy' };
    from.mockReturnValue(upsertChain({ data: null, error }).chain);
    const mutation = useSetRoomFinishes() as unknown as MutationConfig<unknown, unknown>;

    await expect(mutation.mutationFn({ projectId: 'p1', roomId: 'r1', finishes: [] })).rejects.toBe(error);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Line groups (00751, D6, Q9, W5)
// ─────────────────────────────────────────────────────────────────────────────

describe('useProjectLineGroups', () => {
  interface Config {
    queryKey: unknown[];
    queryFn: () => Promise<unknown>;
    enabled: boolean;
  }

  it('keys on ["project-line-groups", projectId] and maps rows to ProjectLineGroup', async () => {
    const { chain, calls } = makeChain({
      data: [{ id: 'g1', project_id: 'p1', project_room_id: 'r1', name: 'Shower', sort_order: 0 }],
      error: null,
    });
    from.mockReturnValue(chain);
    const config = useProjectLineGroups('p1') as unknown as Config;
    expect(config.queryKey).toEqual(['project-line-groups', 'p1']);
    expect(config.enabled).toBe(true);
    await expect(config.queryFn()).resolves.toEqual([
      { id: 'g1', projectId: 'p1', projectRoomId: 'r1', name: 'Shower', sortOrder: 0 },
    ]);
    expect(from).toHaveBeenCalledWith('project_line_groups');
    expect(calls).toContainEqual(['eq', ['project_id', 'p1']]);
  });
});

describe('useSetLineGroup', () => {
  it('calls set_line_group with p_ffe_item_ids and p_group, and invalidates groups + ffe caches', async () => {
    rpc.mockResolvedValue({
      data: { groupId: 'g1', ffeItemIds: ['i1', 'i2'], deletedGroupIds: [] },
      error: null,
    });
    const group = { name: 'Shower', roomId: 'r1' };
    const result = await runMutation(useSetLineGroup(), { projectId: 'p1', itemIds: ['i1', 'i2'], group });

    expect(rpc).toHaveBeenCalledWith('set_line_group', { p_ffe_item_ids: ['i1', 'i2'], p_group: group });
    expect(result).toEqual({ groupId: 'g1', ffeItemIds: ['i1', 'i2'], deletedGroupIds: [] });
    expect(invalidatedKeys()).toContainEqual(['project-line-groups', 'p1']);
    expectFfeCachesInvalidated();
  });

  it('ungroups with a null group', async () => {
    rpc.mockResolvedValue({ data: { groupId: null, ffeItemIds: ['i1'], deletedGroupIds: ['g1'] }, error: null });
    const result = await runMutation(useSetLineGroup(), { projectId: 'p1', itemIds: ['i1'], group: null });

    expect(rpc).toHaveBeenCalledWith('set_line_group', { p_ffe_item_ids: ['i1'], p_group: null });
    expect(result).toEqual({ groupId: null, ffeItemIds: ['i1'], deletedGroupIds: ['g1'] });
  });

  it('throws the RPC error and invalidates nothing', async () => {
    const error = { message: 'This line was removed.' };
    rpc.mockResolvedValue({ data: null, error });
    const mutation = useSetLineGroup() as unknown as MutationConfig<unknown, unknown>;

    await expect(
      mutation.mutationFn({ projectId: 'p1', itemIds: ['i1'], group: { groupId: 'g1' } }),
    ).rejects.toBe(error);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Catalog merge (00753, D11, Q11, S5, W5)
// ─────────────────────────────────────────────────────────────────────────────

describe('useMergeStudioProduct', () => {
  it('calls merge_studio_product with p_from and p_into, and invalidates products + ffe caches', async () => {
    rpc.mockResolvedValue({
      data: { fromId: 'prod-dup', intoId: 'prod-keep', lines: 3, boardItems: 1, projectProducts: 2, earlierMerges: 0 },
      error: null,
    });
    const result = await runMutation(useMergeStudioProduct(), {
      fromProductId: 'prod-dup',
      intoProductId: 'prod-keep',
    });

    expect(rpc).toHaveBeenCalledWith('merge_studio_product', { p_from: 'prod-dup', p_into: 'prod-keep' });
    expect(result).toEqual({
      fromId: 'prod-dup',
      intoId: 'prod-keep',
      lines: 3,
      boardItems: 1,
      projectProducts: 2,
      earlierMerges: 0,
    });
    const keys = invalidatedKeys();
    expect(keys).toContainEqual(['products']);
    expect(keys).toContainEqual(['project-ffe-items']);
    expect(keys).toContainEqual(['projects']);
    expect(keys).toContainEqual(['procurement-items']);
    expect(keys).toContainEqual(['project-ffe-readiness']);
  });

  it('throws the RPC error and invalidates nothing', async () => {
    const error = { message: 'A product cannot merge into itself.' };
    rpc.mockResolvedValue({ data: null, error });
    const mutation = useMergeStudioProduct() as unknown as MutationConfig<unknown, unknown>;

    await expect(
      mutation.mutationFn({ fromProductId: 'prod-dup', intoProductId: 'prod-dup' }),
    ).rejects.toBe(error);
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

describe('useProjectPalettes', () => {
  it('fails silently: its readers show their own empty state (R83)', () => {
    const config = useProjectPalettes('p1') as unknown as { queryKey: unknown[]; meta: unknown };
    expect(config.queryKey).toEqual(['project-palettes', 'p1']);
    expect(config.meta).toEqual({ errorSurface: 'silent' });
  });
});
