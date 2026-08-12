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
  sourceState:
    | 'review_required'
    | 'ready_to_publish'
    | 'response_required'
    | 'changes_requested'
    | 'needs_discussion';
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
  status: 'open' | 'delivered' | 'redo_requested' | 'approved';
  deliverableId: string | null;
}

export interface SiteRequestRoomChoice {
  id: string;
  name: string;
}

export interface SiteRequestActionDetail {
  projectId: string;
  requestId: string;
  coherent: boolean;
  items: SiteRequestActionItem[];
  rooms: SiteRequestRoomChoice[];
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

function timestampValue(
  row: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = stringValue(row, key, label);
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} has invalid ${key}`);
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
  const version = numberValue(
    row,
    'version',
    'Contextual handoff approval artifact',
  );
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error('Contextual handoff approval artifact has invalid version');
  }
  const checksum = stringValue(
    row,
    'checksum',
    'Contextual handoff approval artifact',
  );
  if (!/^[0-9a-f]{64}$/i.test(checksum)) {
    throw new Error(
      'Contextual handoff approval artifact has invalid checksum',
    );
  }
  return {
    kind: stringValue(row, 'kind', 'Contextual handoff approval artifact'),
    version,
    checksum,
    title: stringValue(row, 'title', 'Contextual handoff approval artifact'),
  };
}

function parseSiteArtifactItem(value: unknown): SiteRequestHandoffArtifactItem {
  const row = recordValue(value, 'Contextual handoff artifact item');
  const version = numberValue(
    row,
    'version',
    'Contextual handoff artifact item',
  );
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error('Contextual handoff artifact item has invalid version');
  }
  return {
    title: stringValue(row, 'title', 'Contextual handoff artifact item'),
    kitCode: stringValue(row, 'kitCode', 'Contextual handoff artifact item'),
    version,
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

interface HandoffRoute {
  expectedResponse: string;
  actionKind: string;
  sender: ContextualHandoffActorKind;
  recipient: ContextualHandoffActorKind;
  currentOwner: ContextualHandoffActorKind;
  canBeOverdue: boolean;
}

const APPROVAL_ROUTES: Record<
  ProjectApprovalContextualHandoff['sourceState'],
  HandoffRoute
> = {
  review_required: {
    expectedResponse: 'confirm_artifact_review',
    actionKind: 'open_approval_review',
    sender: 'studio',
    recipient: 'client',
    currentOwner: 'client',
    canBeOverdue: false,
  },
  ready_to_publish: {
    expectedResponse: 'publish_confirmed_approval',
    actionKind: 'publish_approval_request',
    sender: 'client',
    recipient: 'studio',
    currentOwner: 'studio',
    canBeOverdue: false,
  },
  response_required: {
    expectedResponse: 'select_approval_outcome',
    actionKind: 'open_approval_response',
    sender: 'studio',
    recipient: 'client',
    currentOwner: 'client',
    canBeOverdue: true,
  },
  changes_requested: {
    expectedResponse: 'revise_and_resubmit',
    actionKind: 'supersede_approval_request',
    sender: 'client',
    recipient: 'studio',
    currentOwner: 'studio',
    canBeOverdue: false,
  },
  needs_discussion: {
    expectedResponse: 'resolve_client_discussion',
    actionKind: 'open_approval_discussion',
    sender: 'client',
    recipient: 'studio',
    currentOwner: 'studio',
    canBeOverdue: false,
  },
};

const SITE_REQUEST_ROUTES: Record<
  SiteRequestContextualHandoff['sourceState'],
  HandoffRoute
> = {
  awaiting_consent: {
    expectedResponse: 'provide_sms_consent',
    actionKind: 'open_site_request',
    sender: 'studio',
    recipient: 'site_party',
    currentOwner: 'site_party',
    canBeOverdue: false,
  },
  sent: {
    expectedResponse: 'acknowledge_and_begin',
    actionKind: 'open_site_request',
    sender: 'studio',
    recipient: 'site_party',
    currentOwner: 'site_party',
    canBeOverdue: true,
  },
  in_progress: {
    expectedResponse: 'deliver_current_item_versions',
    actionKind: 'continue_site_request',
    sender: 'studio',
    recipient: 'site_party',
    currentOwner: 'site_party',
    canBeOverdue: true,
  },
  delivered: {
    expectedResponse: 'review_delivered_items',
    actionKind: 'review_site_request',
    sender: 'site_party',
    recipient: 'studio',
    currentOwner: 'studio',
    canBeOverdue: true,
  },
  completed: {
    expectedResponse: 'close_completed_request',
    actionKind: 'close_site_request',
    sender: 'site_party',
    recipient: 'studio',
    currentOwner: 'studio',
    canBeOverdue: false,
  },
};

function assertHandoffRoute(
  route: HandoffRoute | undefined,
  handoff: {
    expectedResponse: string;
    actionKind: string;
    responsibility: ContextualHandoffResponsibility;
    isOverdue: boolean;
  },
  label: string,
): void {
  if (
    !route ||
    handoff.expectedResponse !== route.expectedResponse ||
    handoff.actionKind !== route.actionKind ||
    handoff.responsibility.sender.kind !== route.sender ||
    handoff.responsibility.recipient.kind !== route.recipient ||
    handoff.responsibility.currentOwner.kind !== route.currentOwner
  ) {
    throw new Error(`${label} has an invalid route`);
  }
  if (handoff.isOverdue && !route.canBeOverdue) {
    throw new Error(`${label} has invalid overdue state`);
  }
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
    dueAt: timestampValue(row, 'dueAt', 'Project contextual handoff'),
    isOverdue: booleanValue(row, 'isOverdue', 'Project contextual handoff'),
    actionKind: stringValue(row, 'actionKind', 'Project contextual handoff'),
    updatedAt: timestampValue(row, 'updatedAt', 'Project contextual handoff'),
  };

  if (sourceKind === 'project_approval') {
    if (row.escalation !== null) {
      throw new Error('Project approval handoff has invalid escalation');
    }
    if (
      !Object.prototype.hasOwnProperty.call(
        APPROVAL_ROUTES,
        base.sourceState,
      ) ||
      base.phaseId === null ||
      base.stageAttribution !== 'exact_project_phase' ||
      (base.canonicalStageKey === null) !== (base.workflowTrack === null)
    ) {
      throw new Error('Project approval handoff has an invalid route');
    }
    assertHandoffRoute(
      APPROVAL_ROUTES[
        base.sourceState as ProjectApprovalContextualHandoff['sourceState']
      ],
      base,
      'Project approval handoff',
    );
    return {
      ...base,
      sourceKind,
      sourceState:
        base.sourceState as ProjectApprovalContextualHandoff['sourceState'],
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
  if (
    base.phaseId !== null ||
    base.canonicalStageKey !== 'contract_administration' ||
    base.workflowTrack !== null ||
    base.stageAttribution !== 'source_domain'
  ) {
    throw new Error('Site Request handoff has an invalid route');
  }
  assertHandoffRoute(
    SITE_REQUEST_ROUTES[
      base.sourceState as SiteRequestContextualHandoff['sourceState']
    ],
    base,
    'Site Request handoff',
  );
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

function incoherentSiteRequestDetail(
  projectId: string,
  requestId: string,
): SiteRequestActionDetail {
  return { projectId, requestId, coherent: false, items: [], rooms: [] };
}

function parseSiteRequestRoomChoice(value: unknown): SiteRequestRoomChoice {
  const row = recordValue(value, 'Site Request room choice');
  return {
    id: stringValue(row, 'id', 'Site Request room choice'),
    name: stringValue(row, 'name', 'Site Request room choice'),
  };
}

function parseSiteRequestActionItem(value: unknown): SiteRequestActionItem {
  const row = recordValue(value, 'Site Request action item');
  const version = numberValue(row, 'version', 'Site Request action item');
  const status = stringValue(row, 'status', 'Site Request action item');
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error('Site Request action item has invalid version');
  }
  if (!['open', 'delivered', 'redo_requested', 'approved'].includes(status)) {
    throw new Error('Site Request action item has invalid status');
  }
  const deliverableId = nullableStringValue(
    row,
    'deliverableId',
    'Site Request action item',
  );
  if (status === 'delivered' && deliverableId === null) {
    throw new Error('Site Request action item has invalid delivered evidence');
  }
  return {
    itemId: stringValue(row, 'itemId', 'Site Request action item'),
    title: stringValue(row, 'title', 'Site Request action item'),
    kitCode: stringValue(row, 'kitCode', 'Site Request action item'),
    version,
    roomId: nullableStringValue(row, 'roomId', 'Site Request action item'),
    status: status as SiteRequestActionItem['status'],
    deliverableId,
  };
}

export function parseSiteRequestActionDetail(
  value: unknown,
  expectedProjectId: string,
  expectedRequestId: string,
): SiteRequestActionDetail {
  const row = recordValue(value, 'Site Request action detail');
  const projectId = stringValue(row, 'projectId', 'Site Request action detail');
  const requestId = stringValue(row, 'requestId', 'Site Request action detail');
  if (projectId !== expectedProjectId || requestId !== expectedRequestId) {
    throw new Error('Site Request action detail has invalid identity');
  }
  const coherent = booleanValue(row, 'coherent', 'Site Request action detail');
  if (!Array.isArray(row.items) || !Array.isArray(row.rooms)) {
    throw new Error('Site Request action detail has invalid collections');
  }
  const items = row.items.map(parseSiteRequestActionItem);
  const rooms = row.rooms.map(parseSiteRequestRoomChoice);
  if (!coherent) {
    if (items.length > 0 || rooms.length > 0) {
      throw new Error('Site Request action detail has incoherent evidence');
    }
    return { projectId, requestId, coherent, items: [], rooms: [] };
  }

  const itemIds = new Set(items.map((item) => item.itemId));
  const roomIds = new Set(rooms.map((room) => room.id));
  if (
    itemIds.size !== items.length ||
    roomIds.size !== rooms.length ||
    items.some((item) => item.roomId !== null && !roomIds.has(item.roomId))
  ) {
    throw new Error('Site Request action detail has incoherent item evidence');
  }
  return { projectId, requestId, coherent, items, rooms };
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
      const { data, error } = await createBrowserClient().rpc(
        'get_site_request_action_detail',
        { p_project_id: projectId, p_request_id: requestId },
      );
      if (error) throw error;
      return parseSiteRequestActionDetail(data, projectId, requestId);
    },
    ...handoffForegroundRefresh,
    // TODO(wave1-00471-held): remove silent once 00471 (site_request_authority_action_detail) is applied to prod
    meta: { errorSurface: 'silent' },
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
