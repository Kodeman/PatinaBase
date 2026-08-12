import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
const invalidateQueries = vi.fn(() => Promise.resolve());

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ rpc, from }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQuery: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import {
  invalidateProjectContextualHandoffs,
  parseProjectContextualHandoff,
  projectContextualHandoffKeys,
  useApproveSiteRequestItem,
  useCloseSiteRequest,
  useNudgeSiteRequest,
  useProjectContextualHandoffs,
  useRequestSiteRequestRedo,
  useSiteRequestActionDetail,
} from '../use-project-contextual-handoffs';

const APPROVAL_HANDOFF = {
  sourceKind: 'project_approval',
  sourceId: 'decision-1',
  projectId: 'project-1',
  phaseId: 'phase-1',
  canonicalStageKey: 'contract_administration',
  workflowTrack: 'construction',
  stageAttribution: 'exact_project_phase',
  sourceState: 'response_required',
  responsibility: {
    sender: { kind: 'studio', label: null },
    recipient: { kind: 'client', label: null },
    currentOwner: { kind: 'client', label: null },
  },
  expectedResponse: 'select_approval_outcome',
  dueAt: '2026-08-20T12:00:00.000Z',
  isOverdue: false,
  escalation: null,
  artifact: {
    kind: 'plan_issue',
    version: 2,
    checksum: 'a'.repeat(64),
    title: 'Issued drawing set 02',
  },
  actionKind: 'open_approval_response',
  updatedAt: '2026-08-11T12:00:00.000Z',
};

const SITE_HANDOFF = {
  sourceKind: 'site_request',
  sourceId: 'request-1',
  projectId: 'project-1',
  phaseId: null,
  canonicalStageKey: 'contract_administration',
  workflowTrack: null,
  stageAttribution: 'source_domain',
  sourceState: 'delivered',
  responsibility: {
    sender: { kind: 'site_party', label: 'Frozen Field Party' },
    recipient: { kind: 'studio', label: null },
    currentOwner: { kind: 'studio', label: null },
  },
  expectedResponse: 'review_delivered_items',
  dueAt: '2026-08-10T12:00:00.000Z',
  isOverdue: true,
  escalation: { nudgeSent: false, dueReminderSent: true },
  artifact: {
    kind: 'site_request_item_set',
    dueContext: 'Before inspection',
    itemCount: 1,
    items: [
      {
        title: 'Safe delivered measurement',
        kitCode: 'K-01',
        version: 1,
        status: 'delivered',
        hasDeliveredEvidence: true,
        hasApprovedEvidence: false,
      },
    ],
  },
  actionKind: 'review_site_request',
  updatedAt: '2026-08-11T12:00:00.000Z',
};

type QueryConfig = {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
  enabled: boolean;
  refetchOnWindowFocus: boolean;
  refetchInterval: number;
  refetchIntervalInBackground: boolean;
};

type MutationConfig<TInput> = {
  mutationFn: (input: TInput) => Promise<unknown>;
  onSuccess?: (result: unknown, input: TInput) => Promise<void> | void;
};

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  invalidateQueries.mockReset();
  invalidateQueries.mockResolvedValue(undefined);
});

describe('project contextual handoff read model', () => {
  it('uses the exact RPC, canonical key, and foreground-only refresh', async () => {
    rpc.mockResolvedValue({
      data: [APPROVAL_HANDOFF, SITE_HANDOFF],
      error: null,
    });

    const query = useProjectContextualHandoffs(
      'project-1',
    ) as unknown as QueryConfig;

    expect(query).toEqual(
      expect.objectContaining({
        queryKey: ['project-contextual-handoffs', 'project-1'],
        enabled: true,
        refetchOnWindowFocus: true,
        refetchInterval: 30_000,
        refetchIntervalInBackground: false,
      }),
    );
    await expect(query.queryFn()).resolves.toEqual([
      expect.objectContaining({ sourceKind: 'project_approval' }),
      expect.objectContaining({ sourceKind: 'site_request' }),
    ]);
    expect(rpc).toHaveBeenCalledWith('get_project_contextual_handoffs', {
      p_project_id: 'project-1',
    });
  });

  it('strips undocumented values and rejects malformed responsibility/evidence', () => {
    expect(
      parseProjectContextualHandoff({
        ...SITE_HANDOFF,
        secretPayload: 'must not survive',
      }),
    ).not.toHaveProperty('secretPayload');

    expect(() =>
      parseProjectContextualHandoff({
        ...SITE_HANDOFF,
        responsibility: {
          ...SITE_HANDOFF.responsibility,
          currentOwner: { kind: 'unknown_actor' },
        },
      }),
    ).toThrow(/currentOwner/);

    expect(() =>
      parseProjectContextualHandoff({
        ...SITE_HANDOFF,
        artifact: {
          ...SITE_HANDOFF.artifact,
          items: [{ title: 'Unproven item' }],
        },
      }),
    ).toThrow(/artifact item/);
  });

  it('accepts awaiting consent as a navigation-only forward-compatible state', () => {
    expect(
      parseProjectContextualHandoff({
        ...SITE_HANDOFF,
        sourceState: 'awaiting_consent',
        expectedResponse: 'provide_sms_consent',
        actionKind: 'open_site_request',
        isOverdue: false,
        responsibility: {
          sender: { kind: 'studio', label: null },
          recipient: { kind: 'site_party', label: 'Frozen Field Party' },
          currentOwner: { kind: 'site_party', label: 'Frozen Field Party' },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        sourceKind: 'site_request',
        sourceState: 'awaiting_consent',
      }),
    );
  });

  it('rejects mismatched state, action, response, and responsibility routes', () => {
    expect(() =>
      parseProjectContextualHandoff({
        ...APPROVAL_HANDOFF,
        actionKind: 'publish_approval_request',
      }),
    ).toThrow(/route/);

    expect(() =>
      parseProjectContextualHandoff({
        ...SITE_HANDOFF,
        responsibility: {
          ...SITE_HANDOFF.responsibility,
          currentOwner: { kind: 'site_party', label: 'Wrong owner' },
        },
      }),
    ).toThrow(/route/);

    expect(() =>
      parseProjectContextualHandoff({
        ...SITE_HANDOFF,
        sourceState: 'awaiting_consent',
        expectedResponse: 'provide_sms_consent',
        actionKind: 'open_site_request',
        isOverdue: true,
        responsibility: {
          sender: { kind: 'studio', label: null },
          recipient: { kind: 'site_party', label: 'Frozen Field Party' },
          currentOwner: { kind: 'site_party', label: null },
        },
      }),
    ).toThrow(/overdue/);
  });

  it('rejects invalid timestamps, checksums, and non-positive artifact versions', () => {
    expect(() =>
      parseProjectContextualHandoff({
        ...APPROVAL_HANDOFF,
        dueAt: 'not-a-timestamp',
      }),
    ).toThrow(/dueAt/);

    expect(() =>
      parseProjectContextualHandoff({
        ...APPROVAL_HANDOFF,
        artifact: { ...APPROVAL_HANDOFF.artifact, checksum: 'not-a-hash' },
      }),
    ).toThrow(/checksum/);

    expect(() =>
      parseProjectContextualHandoff({
        ...SITE_HANDOFF,
        artifact: {
          ...SITE_HANDOFF.artifact,
          items: [{ ...SITE_HANDOFF.artifact.items[0], version: 0 }],
        },
      }),
    ).toThrow(/version/);
  });

  it('fails closed when the RPC does not return an array', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const query = useProjectContextualHandoffs(
      'project-1',
    ) as unknown as QueryConfig;
    await expect(query.queryFn()).rejects.toThrow(/invalid list/);
  });
});

describe('Site Request coherent action detail', () => {
  it('uses one sanitized RPC and keeps only its exact coherent projection', async () => {
    rpc.mockResolvedValue({
      data: {
        projectId: 'project-1',
        requestId: 'request-1',
        coherent: true,
        items: [
          {
            itemId: 'item-1',
            title: 'Window measure',
            kitCode: 'K-01',
            version: 2,
            roomId: null,
            status: 'delivered',
            deliverableId: 'delivery-1',
            privatePayload: 'strip me',
          },
        ],
        rooms: [{ id: 'room-1', name: 'Living room', secret: 'strip me' }],
        rawRequest: 'must not survive',
      },
      error: null,
    });

    const query = useSiteRequestActionDetail(
      'project-1',
      'request-1',
    ) as unknown as QueryConfig;
    expect(query.queryKey).toEqual([
      'site-request-action-detail',
      'project-1',
      'request-1',
    ]);
    expect(query).toEqual(
      expect.objectContaining({
        enabled: true,
        refetchOnWindowFocus: true,
        refetchInterval: 30_000,
        refetchIntervalInBackground: false,
      }),
    );
    await expect(query.queryFn()).resolves.toEqual({
      projectId: 'project-1',
      requestId: 'request-1',
      coherent: true,
      items: [
        {
          itemId: 'item-1',
          title: 'Window measure',
          kitCode: 'K-01',
          version: 2,
          roomId: null,
          status: 'delivered',
          deliverableId: 'delivery-1',
        },
      ],
      rooms: [{ id: 'room-1', name: 'Living room' }],
    });
    expect(rpc).toHaveBeenCalledWith('get_site_request_action_detail', {
      p_project_id: 'project-1',
      p_request_id: 'request-1',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('preserves the existence-safe incoherent response without raw reads', async () => {
    rpc.mockResolvedValue({
      data: {
        projectId: 'project-1',
        requestId: 'request-1',
        coherent: false,
        items: [],
        rooms: [],
      },
      error: null,
    });

    const query = useSiteRequestActionDetail(
      'project-1',
      'request-1',
    ) as unknown as QueryConfig;
    await expect(query.queryFn()).resolves.toEqual({
      projectId: 'project-1',
      requestId: 'request-1',
      coherent: false,
      items: [],
      rooms: [],
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects incoherent identities, evidence, and room choices', async () => {
    rpc.mockResolvedValue({
      data: {
        projectId: 'different-project',
        requestId: 'request-1',
        coherent: true,
        items: [],
        rooms: [],
      },
      error: null,
    });
    const query = useSiteRequestActionDetail(
      'project-1',
      'request-1',
    ) as unknown as QueryConfig;
    await expect(query.queryFn()).rejects.toThrow(/identity/);

    rpc.mockResolvedValue({
      data: {
        projectId: 'project-1',
        requestId: 'request-1',
        coherent: true,
        items: [
          {
            itemId: 'item-1',
            title: 'Window measure',
            kitCode: 'K-01',
            version: 0,
            roomId: 'foreign-room',
            status: 'delivered',
            deliverableId: null,
          },
        ],
        rooms: [{ id: 'room-1', name: 'Living room' }],
      },
      error: null,
    });
    await expect(query.queryFn()).rejects.toThrow(/item/);
  });

  it('is fully disabled with no RPC or table read while closed', async () => {
    const query = useSiteRequestActionDetail(
      'project-1',
      undefined,
    ) as unknown as QueryConfig;

    expect(query.enabled).toBe(false);
    await expect(query.queryFn()).resolves.toEqual({
      projectId: 'project-1',
      requestId: '',
      coherent: false,
      items: [],
      rooms: [],
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});

describe('Site Request checked mutations', () => {
  it('uses exact RPC signatures and exact-project invalidation', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    const nudge = useNudgeSiteRequest() as unknown as MutationConfig<{
      projectId: string;
      requestId: string;
      note: string;
    }>;
    const approve = useApproveSiteRequestItem() as unknown as MutationConfig<{
      projectId: string;
      requestId: string;
      itemId: string;
      deliverableId: string;
      roomId: string | null;
    }>;
    const redo = useRequestSiteRequestRedo() as unknown as MutationConfig<{
      projectId: string;
      requestId: string;
      itemId: string;
      note: string;
    }>;
    const close = useCloseSiteRequest() as unknown as MutationConfig<{
      projectId: string;
      requestId: string;
    }>;

    await nudge.mutationFn({
      projectId: 'project-1',
      requestId: 'request-1',
      note: 'Checking in on the field request.',
    });
    expect(rpc).toHaveBeenLastCalledWith('site_request_nudge', {
      p_request_id: 'request-1',
      p_note: 'Checking in on the field request.',
    });

    await approve.mutationFn({
      projectId: 'project-1',
      requestId: 'request-1',
      itemId: 'item-1',
      deliverableId: 'delivery-1',
      roomId: null,
    });
    expect(rpc).toHaveBeenLastCalledWith('site_request_approve_item', {
      p_item_id: 'item-1',
      p_deliverable_id: 'delivery-1',
      p_room_id: null,
    });

    await redo.mutationFn({
      projectId: 'project-1',
      requestId: 'request-1',
      itemId: 'item-1',
      note: 'Please recapture the tape edge.',
    });
    expect(rpc).toHaveBeenLastCalledWith('site_request_redo_item', {
      p_item_id: 'item-1',
      p_note: 'Please recapture the tape edge.',
    });

    await close.mutationFn({ projectId: 'project-1', requestId: 'request-1' });
    expect(rpc).toHaveBeenLastCalledWith('site_request_close', {
      p_request_id: 'request-1',
    });

    await approve.onSuccess?.(
      {},
      {
        projectId: 'project-1',
        requestId: 'request-1',
        itemId: 'item-1',
        deliverableId: 'delivery-1',
        roomId: null,
      },
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['project-contextual-handoffs', 'project-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['site-request-action-detail', 'project-1', 'request-1'],
    });
  });

  it('rejects empty nudge and redo notes before calling either RPC', async () => {
    const nudge = useNudgeSiteRequest() as unknown as MutationConfig<{
      projectId: string;
      requestId: string;
      note: string;
    }>;
    const redo = useRequestSiteRequestRedo() as unknown as MutationConfig<{
      projectId: string;
      requestId: string;
      itemId: string;
      note: string;
    }>;
    await expect(
      nudge.mutationFn({
        projectId: 'project-1',
        requestId: 'request-1',
        note: '   ',
      }),
    ).rejects.toThrow(/note is required/);
    await expect(
      redo.mutationFn({
        projectId: 'project-1',
        requestId: 'request-1',
        itemId: 'item-1',
        note: '   ',
      }),
    ).rejects.toThrow(/note is required/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('owns a reusable canonical invalidation helper', async () => {
    await invalidateProjectContextualHandoffs(
      { invalidateQueries },
      {
        projectId: 'project-1',
        requestId: 'request-1',
      },
    );
    expect(projectContextualHandoffKeys.project('project-1')).toEqual([
      'project-contextual-handoffs',
      'project-1',
    ]);
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });
});
