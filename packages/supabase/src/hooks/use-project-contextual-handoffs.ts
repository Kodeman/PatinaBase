import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { createBrowserClient } from '../client';

export type ContextualHandoffSourceKind = 'project_approval' | 'site_request';
export type ContextualHandoffActorKind = 'studio' | 'client' | 'site_party';
export type ContextualHandoffStageAttribution =
  | 'exact_project_phase'
  | 'source_domain';

export interface ContextualHandoffActor {
  kind: ContextualHandoffActorKind;
  label: string | null;
}

export interface ContextualHandoffResponsibility {
  sender: ContextualHandoffActor;
  recipient: ContextualHandoffActor;
  currentOwner: ContextualHandoffActor;
}

export interface ProjectApprovalHandoffArtifact {
  kind: string;
  version: number;
  checksum: string;
  title: string;
}

export interface SiteRequestHandoffArtifactItem {
  title: string;
  kitCode: string;
  version: number;
  status: string;
  hasDeliveredEvidence: boolean;
  hasApprovedEvidence: boolean;
}

export interface SiteRequestHandoffArtifact {
  kind: 'site_request_item_set';
  dueContext: string | null;
  itemCount: number;
  items: SiteRequestHandoffArtifactItem[];
}

interface ContextualHandoffBase {
  sourceId: string;
  projectId: string;
  phaseId: string | null;
  canonicalStageKey: string | null;
  workflowTrack: 'core' | 'ffe' | 'construction' | null;
  stageAttribution: ContextualHandoffStageAttribution;
  sourceState: string;
  responsibility: ContextualHandoffResponsibility;
  expectedResponse: string;
  dueAt: string;
  isOverdue: boolean;
  actionKind: string;
  updatedAt: string;
}

export interface ProjectApprovalContextualHandoff extends ContextualHandoffBase {
  sourceKind: 'project_approval';
  escalation: null;
  artifact: ProjectApprovalHandoffArtifact;
}

export interface SiteRequestContextualHandoff extends ContextualHandoffBase {
  sourceKind: 'site_request';
  sourceState:
    | 'awaiting_consent'
    | 'sent'
    | 'in_progress'
    | 'delivered'
    | 'completed';
  escalation: {
    nudgeSent: boolean;
    dueReminderSent: boolean;
  };
  artifact: SiteRequestHandoffArtifact;
}

export type ProjectContextualHandoff =
  | ProjectApprovalContextualHandoff
  | SiteRequestContextualHandoff;

export interface SiteRequestActionItem {
  itemId: string;
  title: string;
  kitCode: string;
  version: number;
  roomId: string | null;
  status: string;
  deliverableId: string | null;
}

export interface SiteRequestActionDetail {
  projectId: string;
  requestId: string;
  coherent: boolean;
  items: SiteRequestActionItem[];
}

export const projectContextualHandoffKeys = {
  project: (projectId: string) =>
    ['project-contextual-handoffs', projectId] as const,
  siteRequestDetail: (projectId: string, requestId: string) =>
    ['site-request-action-detail', projectId, requestId] as const,
};

const HANDOFF_FOREGROUND_REFRESH_MS = 30_000;
const handoffForegroundRefresh = {
  refetchOnWindowFocus: true,
  refetchInterval: HANDOFF_FOREGROUND_REFRESH_MS,
  refetchIntervalInBackground: false,
} as const;

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function stringValue(
  row: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} is missing ${key}`);
  }
  return value;
}

function nullableStringValue(
  row: Record<string, unknown>,
  key: string,
  label: string,
): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} has invalid ${key}`);
  }
  return value;
}

function numberValue(
  row: Record<string, unknown>,
  key: string,
  label: string,
): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} is missing ${key}`);
  }
  return value;
}

function booleanValue(
  row: Record<string, unknown>,
  key: string,
  label: string,
): boolean {
  const value = row[key];
  if (typeof value !== 'boolean') {
    throw new Error(`${label} is missing ${key}`);
  }
  return value;
}

function parseActor(value: unknown, field: string): ContextualHandoffActor {
  const actor = recordValue(value, `Contextual handoff ${field}`);
  const kind = stringValue(actor, 'kind', `Contextual handoff ${field}`);
  if (!['studio', 'client', 'site_party'].includes(kind)) {
    throw new Error(`Contextual handoff ${field} has invalid kind`);
  }
  const label =
    actor.label === undefined
      ? null
      : nullableStringValue(actor, 'label', `Contextual handoff ${field}`);
  return { kind: kind as ContextualHandoffActorKind, label };
}

function parseResponsibility(value: unknown): ContextualHandoffResponsibility {
  const row = recordValue(value, 'Contextual handoff responsibility');
  return {
    sender: parseActor(row.sender, 'sender'),
    recipient: parseActor(row.recipient, 'recipient'),
    currentOwner: parseActor(row.currentOwner, 'currentOwner'),
  };
}

function parseApprovalArtifact(value: unknown): ProjectApprovalHandoffArtifact {
  const row = recordValue(value, 'Contextual handoff approval artifact');
  return {
    kind: stringValue(row, 'kind', 'Contextual handoff approval artifact'),
    version: numberValue(
      row,
      'version',
      'Contextual handoff approval artifact',
    ),
    checksum: stringValue(
      row,
      'checksum',
      'Contextual handoff approval artifact',
    ),
    title: stringValue(row, 'title', 'Contextual handoff approval artifact'),
  };
}

function parseSiteArtifactItem(value: unknown): SiteRequestHandoffArtifactItem {
  const row = recordValue(value, 'Contextual handoff artifact item');
  return {
    title: stringValue(row, 'title', 'Contextual handoff artifact item'),
    kitCode: stringValue(row, 'kitCode', 'Contextual handoff artifact item'),
    version: numberValue(row, 'version', 'Contextual handoff artifact item'),
    status: stringValue(row, 'status', 'Contextual handoff artifact item'),
    hasDeliveredEvidence: booleanValue(
      row,
      'hasDeliveredEvidence',
      'Contextual handoff artifact item',
    ),
    hasApprovedEvidence: booleanValue(
      row,
      'hasApprovedEvidence',
      'Contextual handoff artifact item',
    ),
  };
}

function parseSiteArtifact(value: unknown): SiteRequestHandoffArtifact {
  const row = recordValue(value, 'Contextual handoff site artifact');
  if (row.kind !== 'site_request_item_set') {
    throw new Error('Contextual handoff site artifact has invalid kind');
  }
  if (!Array.isArray(row.items)) {
    throw new Error('Contextual handoff site artifact has invalid items');
  }
  const itemCount = numberValue(
    row,
    'itemCount',
    'Contextual handoff site artifact',
  );
  if (!Number.isInteger(itemCount) || itemCount < 0) {
    throw new Error('Contextual handoff site artifact has invalid itemCount');
  }
  const items = row.items.map(parseSiteArtifactItem);
  if (items.length !== itemCount) {
    throw new Error(
      'Contextual handoff site artifact item count is incoherent',
    );
  }
  return {
    kind: 'site_request_item_set',
    dueContext: nullableStringValue(
      row,
      'dueContext',
      'Contextual handoff site artifact',
    ),
    itemCount,
    items,
  };
}

export function parseProjectContextualHandoff(
  value: unknown,
): ProjectContextualHandoff {
  const row = recordValue(value, 'Project contextual handoff');
  const sourceKind = stringValue(
    row,
    'sourceKind',
    'Project contextual handoff',
  );
  if (sourceKind !== 'project_approval' && sourceKind !== 'site_request') {
    throw new Error('Project contextual handoff has invalid sourceKind');
  }
  const stageAttribution = stringValue(
    row,
    'stageAttribution',
    'Project contextual handoff',
  );
  if (
    stageAttribution !== 'exact_project_phase' &&
    stageAttribution !== 'source_domain'
  ) {
    throw new Error('Project contextual handoff has invalid stageAttribution');
  }
  const workflowTrack = nullableStringValue(
    row,
    'workflowTrack',
    'Project contextual handoff',
  );
  if (
    workflowTrack !== null &&
    !['core', 'ffe', 'construction'].includes(workflowTrack)
  ) {
    throw new Error('Project contextual handoff has invalid workflowTrack');
  }

  const base = {
    sourceId: stringValue(row, 'sourceId', 'Project contextual handoff'),
    projectId: stringValue(row, 'projectId', 'Project contextual handoff'),
    phaseId: nullableStringValue(row, 'phaseId', 'Project contextual handoff'),
    canonicalStageKey: nullableStringValue(
      row,
      'canonicalStageKey',
      'Project contextual handoff',
    ),
    workflowTrack: workflowTrack as ContextualHandoffBase['workflowTrack'],
    stageAttribution: stageAttribution as ContextualHandoffStageAttribution,
    sourceState: stringValue(row, 'sourceState', 'Project contextual handoff'),
    responsibility: parseResponsibility(row.responsibility),
    expectedResponse: stringValue(
      row,
      'expectedResponse',
      'Project contextual handoff',
    ),
    dueAt: stringValue(row, 'dueAt', 'Project contextual handoff'),
    isOverdue: booleanValue(row, 'isOverdue', 'Project contextual handoff'),
    actionKind: stringValue(row, 'actionKind', 'Project contextual handoff'),
    updatedAt: stringValue(row, 'updatedAt', 'Project contextual handoff'),
  };

  if (sourceKind === 'project_approval') {
    if (row.escalation !== null) {
      throw new Error('Project approval handoff has invalid escalation');
    }
    return {
      ...base,
      sourceKind,
      escalation: null,
      artifact: parseApprovalArtifact(row.artifact),
    };
  }

  if (
    ![
      'awaiting_consent',
      'sent',
      'in_progress',
      'delivered',
      'completed',
    ].includes(base.sourceState)
  ) {
    throw new Error('Site Request handoff has invalid sourceState');
  }
  const escalation = recordValue(
    row.escalation,
    'Contextual handoff escalation',
  );
  return {
    ...base,
    sourceKind,
    sourceState:
      base.sourceState as SiteRequestContextualHandoff['sourceState'],
    escalation: {
      nudgeSent: booleanValue(
        escalation,
        'nudgeSent',
        'Contextual handoff escalation',
      ),
      dueReminderSent: booleanValue(
        escalation,
        'dueReminderSent',
        'Contextual handoff escalation',
      ),
    },
    artifact: parseSiteArtifact(row.artifact),
  };
}

export function useProjectContextualHandoffs(
  projectId: string | null | undefined,
) {
  return useQuery({
    queryKey: projectContextualHandoffKeys.project(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async (): Promise<ProjectContextualHandoff[]> => {
      if (!projectId) return [];
      const { data, error } = await createBrowserClient().rpc(
        'get_project_contextual_handoffs',
        { p_project_id: projectId },
      );
      if (error) throw error;
      if (!Array.isArray(data)) {
        throw new Error(
          'get_project_contextual_handoffs returned an invalid list',
        );
      }
      return data.map(parseProjectContextualHandoff);
    },
    ...handoffForegroundRefresh,
  });
}

type SiteRequestItemRead = {
  id: string;
  request_id: string;
  status: string;
  current_version_id: string | null;
  current_version_number: number;
  sort_order: number;
};

type SiteRequestVersionRead = {
  id: string;
  item_id: string;
  title: string;
  kit_code: string;
  version_number: number;
  room_id: string | null;
};

type SiteRequestDeliverableRead = {
  id: string;
  request_id: string;
  item_id: string;
  item_version_id: string;
  status: string;
  attempt_number: number;
  delivered_at: string | null;
};

function incoherentSiteRequestDetail(
  projectId: string,
  requestId: string,
): SiteRequestActionDetail {
  return { projectId, requestId, coherent: false, items: [] };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isSiteRequestItemRead(value: unknown): value is SiteRequestItemRead {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    isNonEmptyString(row.id) &&
    isNonEmptyString(row.request_id) &&
    isNonEmptyString(row.status) &&
    isNonEmptyString(row.current_version_id) &&
    Number.isInteger(row.current_version_number) &&
    Number.isInteger(row.sort_order)
  );
}

function isSiteRequestVersionRead(
  value: unknown,
): value is SiteRequestVersionRead {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    isNonEmptyString(row.id) &&
    isNonEmptyString(row.item_id) &&
    isNonEmptyString(row.title) &&
    isNonEmptyString(row.kit_code) &&
    Number.isInteger(row.version_number) &&
    (row.room_id === null || isNonEmptyString(row.room_id))
  );
}

function isSiteRequestDeliverableRead(
  value: unknown,
): value is SiteRequestDeliverableRead {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    isNonEmptyString(row.id) &&
    isNonEmptyString(row.request_id) &&
    isNonEmptyString(row.item_id) &&
    isNonEmptyString(row.item_version_id) &&
    row.status === 'delivered' &&
    Number.isInteger(row.attempt_number) &&
    (row.delivered_at === null || isNonEmptyString(row.delivered_at))
  );
}

export function useSiteRequestActionDetail(
  projectId: string | null | undefined,
  requestId: string | null | undefined,
) {
  return useQuery({
    queryKey: projectContextualHandoffKeys.siteRequestDetail(
      projectId ?? '',
      requestId ?? '',
    ),
    enabled: Boolean(projectId && requestId),
    queryFn: async (): Promise<SiteRequestActionDetail> => {
      if (!projectId || !requestId) {
        return incoherentSiteRequestDetail(projectId ?? '', requestId ?? '');
      }
      const supabase = createBrowserClient();
      const { data: requestData, error: requestError } = await supabase
        .from('site_requests')
        .select('id, project_id')
        .eq('id', requestId)
        .maybeSingle();
      if (requestError) throw requestError;
      if (
        !requestData ||
        requestData.id !== requestId ||
        requestData.project_id !== projectId
      ) {
        return incoherentSiteRequestDetail(projectId, requestId);
      }
      const { data: itemData, error: itemError } = await supabase
        .from('site_request_items')
        .select(
          'id, request_id, status, current_version_id, current_version_number, sort_order',
        )
        .eq('request_id', requestId);
      if (itemError) throw itemError;

      if (!(itemData ?? []).every(isSiteRequestItemRead)) {
        return incoherentSiteRequestDetail(projectId, requestId);
      }
      const items = (itemData ?? []) as SiteRequestItemRead[];
      const itemIds = new Set(items.map((item) => item.id));
      const currentVersionIds = new Set(
        items.map((item) => item.current_version_id),
      );
      if (
        itemIds.size !== items.length ||
        currentVersionIds.size !== items.length ||
        items.some(
          (item) =>
            item.request_id !== requestId ||
            !item.current_version_id ||
            !Number.isInteger(item.current_version_number),
        )
      ) {
        return incoherentSiteRequestDetail(projectId, requestId);
      }
      if (items.length === 0) {
        return { projectId, requestId, coherent: true, items: [] };
      }

      const versionIds = items.map((item) => item.current_version_id as string);
      const { data: versionData, error: versionError } = await supabase
        .from('site_request_item_versions')
        .select('id, item_id, title, kit_code, version_number, room_id')
        .in('id', versionIds);
      if (versionError) throw versionError;

      const { data: deliverableData, error: deliverableError } = await supabase
        .from('site_deliverables')
        .select(
          'id, request_id, item_id, item_version_id, status, attempt_number, delivered_at',
        )
        .eq('request_id', requestId)
        .eq('status', 'delivered')
        .order('attempt_number', { ascending: false });
      if (deliverableError) throw deliverableError;

      if (
        !(versionData ?? []).every(isSiteRequestVersionRead) ||
        !(deliverableData ?? []).every(isSiteRequestDeliverableRead)
      ) {
        return incoherentSiteRequestDetail(projectId, requestId);
      }
      const versions = (versionData ?? []) as SiteRequestVersionRead[];
      const deliverables = (deliverableData ??
        []) as SiteRequestDeliverableRead[];
      const versionById = new Map<string, SiteRequestVersionRead>();
      for (const version of versions) {
        if (versionById.has(version.id)) {
          return incoherentSiteRequestDetail(projectId, requestId);
        }
        versionById.set(version.id, version);
      }

      const actionItems: SiteRequestActionItem[] = [];
      for (const item of [...items].sort(
        (a, b) => a.sort_order - b.sort_order,
      )) {
        const currentVersionId = item.current_version_id as string;
        const version = versionById.get(currentVersionId);
        if (
          !version ||
          version.item_id !== item.id ||
          version.version_number !== item.current_version_number
        ) {
          return incoherentSiteRequestDetail(projectId, requestId);
        }
        const deliverable = deliverables.find(
          (candidate) =>
            candidate.request_id === requestId &&
            candidate.item_id === item.id &&
            candidate.item_version_id === currentVersionId &&
            candidate.status === 'delivered' &&
            typeof candidate.delivered_at === 'string',
        );
        if (item.status === 'delivered' && !deliverable) {
          return incoherentSiteRequestDetail(projectId, requestId);
        }
        actionItems.push({
          itemId: item.id,
          title: version.title,
          kitCode: version.kit_code,
          version: version.version_number,
          roomId: version.room_id,
          status: item.status,
          deliverableId: deliverable?.id ?? null,
        });
      }

      return { projectId, requestId, coherent: true, items: actionItems };
    },
    ...handoffForegroundRefresh,
  });
}

export interface ProjectContextualHandoffInvalidationScope {
  projectId: string;
  requestId?: string | null;
}

export async function invalidateProjectContextualHandoffs(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
  scope: ProjectContextualHandoffInvalidationScope,
): Promise<void> {
  const keys: Array<readonly unknown[]> = [
    projectContextualHandoffKeys.project(scope.projectId),
  ];
  if (scope.requestId) {
    keys.push(
      projectContextualHandoffKeys.siteRequestDetail(
        scope.projectId,
        scope.requestId,
      ),
    );
  }
  await Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

type SiteRequestRpcName =
  | 'site_request_nudge'
  | 'site_request_approve_item'
  | 'site_request_redo_item'
  | 'site_request_close';

async function runSiteRequestRpc(
  name: SiteRequestRpcName,
  args: Record<string, string | null>,
): Promise<unknown> {
  const { data, error } = await createBrowserClient().rpc(name, args as never);
  if (error) throw error;
  if (data == null) throw new Error(`${name} returned no data`);
  return data;
}

function useSiteRequestMutation<
  TInput extends ProjectContextualHandoffInvalidationScope,
>(mutationFn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (_result, input) =>
      invalidateProjectContextualHandoffs(queryClient, input),
  });
}

export function useNudgeSiteRequest() {
  return useSiteRequestMutation(
    (input: { projectId: string; requestId: string; note: string }) => {
      if (input.note.trim().length === 0) {
        return Promise.reject(new Error('A nudge note is required.'));
      }
      return runSiteRequestRpc('site_request_nudge', {
        p_request_id: input.requestId,
        p_note: input.note,
      });
    },
  );
}

export function useApproveSiteRequestItem() {
  return useSiteRequestMutation(
    (input: {
      projectId: string;
      requestId: string;
      itemId: string;
      deliverableId: string;
      roomId: string | null;
    }) =>
      runSiteRequestRpc('site_request_approve_item', {
        p_item_id: input.itemId,
        p_deliverable_id: input.deliverableId,
        p_room_id: input.roomId,
      }),
  );
}

export function useRequestSiteRequestRedo() {
  return useSiteRequestMutation(
    (input: {
      projectId: string;
      requestId: string;
      itemId: string;
      note: string;
    }) => {
      if (input.note.trim().length === 0) {
        return Promise.reject(new Error('A redo note is required.'));
      }
      return runSiteRequestRpc('site_request_redo_item', {
        p_item_id: input.itemId,
        p_note: input.note,
      });
    },
  );
}

export function useCloseSiteRequest() {
  return useSiteRequestMutation(
    (input: { projectId: string; requestId: string }) =>
      runSiteRequestRpc('site_request_close', {
        p_request_id: input.requestId,
      }),
  );
}
