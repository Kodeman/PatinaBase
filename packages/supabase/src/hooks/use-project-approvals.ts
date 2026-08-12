import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { createBrowserClient } from '../client';
import { invalidateProjectWorkflow } from './use-project-workflow';

export const PROJECT_APPROVAL_CONTRACT = 'project_artifact_v1' as const;

export type ProjectApprovalArtifactKind =
  | 'plan_issue'
  | 'spec_book_artifact'
  | 'budget_version';
export type ProjectApprovalLifecycleStatus =
  | 'draft'
  | 'pending'
  | 'responded'
  | 'expired';
export type ProjectApprovalOutcome =
  | 'approved'
  | 'changes_requested'
  | 'needs_discussion';
export type ProjectApprovalDisposition = 'active' | 'withdrawn' | 'superseded';

/** Studio-safe immutable artifact identity returned by the 00438 candidate RPC. */
export interface ProjectApprovalArtifactCandidate {
  artifactKind: ProjectApprovalArtifactKind;
  artifactId: string;
  artifactVersion: number;
  artifactChecksum: string;
  artifactTitle: string;
  issuedAt: string | null;
  publishedAt: string | null;
}

/** Client-safe Stage-2 approval projection returned by get_project_decision_reviews. */
export interface ProjectApprovalReview {
  decisionId: string;
  projectId: string;
  phaseId: string;
  sectionKey: string | null;
  artifactKind: ProjectApprovalArtifactKind;
  artifactId: string;
  artifactVersion: number;
  artifactChecksum: string;
  artifactTitle: string;
  question: string;
  context: string | null;
  dueAt: string;
  costCentsDelta: number;
  scheduleDaysDelta: number;
  leadTimeDaysDelta: number;
  lifecycleStatus: ProjectApprovalLifecycleStatus;
  outcome: ProjectApprovalOutcome | null;
  disposition: ProjectApprovalDisposition;
  isOverdue: boolean;
  completedReviewCount: number;
  requiredReviewCount: number;
  /**
   * Frozen, non-identifying CAS value required by confirm_project_decision_review.
   * Optional until the sanitized 00438 projection is present; callers must never
   * guess it when absent.
   */
  authorityRevision: number | null;
  predecessorDecisionId: string | null;
  successorDecisionId: string | null;
  createdAt: string;
  sentAt: string | null;
  respondedAt: string | null;
  updatedAt: string;
}

export interface ProjectDecisionAuthority {
  projectId: string;
  decisionLeadId: string;
  requiredCoapproverId: null;
  revision: number;
  assignedBy: string;
  assignedAt: string;
  updatedAt: string;
}

export interface ProjectApprovalCreatePayload {
  title: string;
  question: string;
  context?: string | null;
  dueAt: string;
  phaseId: string;
  sectionKey?: string | null;
  artifactKind: ProjectApprovalArtifactKind;
  artifactId: string;
  costCentsDelta: number;
  scheduleDaysDelta: number;
  leadTimeDaysDelta: number;
}

export interface ProjectApprovalActionResult {
  receiptId?: string;
  projectId: string;
  decisionId: string;
  status?: ProjectApprovalLifecycleStatus;
  outcome?: ProjectApprovalOutcome;
  disposition?: ProjectApprovalDisposition;
  predecessorDecisionId?: string | null;
  successorDecisionId?: string | null;
  updatedAt?: string;
  idempotent?: boolean;
  [key: string]: unknown;
}

export const projectApprovalKeys = {
  all: ['project-approvals'] as const,
  project: (projectId: string) => ['project-approvals', projectId] as const,
  authority: (projectId: string) =>
    ['project-approval-authority', projectId] as const,
  candidates: (projectId: string) =>
    ['project-approval-artifact-candidates', projectId] as const,
  decision: (decisionId: string) => ['project-approval', decisionId] as const,
  mine: () => ['my-project-approval-reviews'] as const,
};

const APPROVAL_FOREGROUND_REFRESH_MS = 30_000;

// Tracked migrations do not publish the approval/evidence/candidate tables to
// Realtime. Every client-safe and studio-authoring read therefore self-heals
// while foregrounded without polling a backgrounded tab.
const approvalForegroundRefresh = {
  refetchOnWindowFocus: true,
  refetchInterval: APPROVAL_FOREGROUND_REFRESH_MS,
  refetchIntervalInBackground: false,
} as const;

export interface ProjectApprovalInvalidationScope {
  projectId: string;
  decisionId?: string | null;
  designerClientId?: string | null;
}

/** One invalidation rail for every authoritative Stage-2 mutation and event. */
export async function invalidateProjectApprovalQueries(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
  scope: ProjectApprovalInvalidationScope,
): Promise<void> {
  const keys: Array<readonly unknown[]> = [
    projectApprovalKeys.project(scope.projectId),
    projectApprovalKeys.authority(scope.projectId),
    projectApprovalKeys.candidates(scope.projectId),
    projectApprovalKeys.mine(),
    ['project-contextual-handoffs', scope.projectId],
    ['project-decisions', scope.projectId],
    ['all-decisions'],
    ['decision-metrics'],
    ['section-gates', scope.projectId],
    ['section-tasks', scope.projectId],
    ['coordination-items', scope.projectId],
    ['project-ffe-items', scope.projectId],
    ['project-ffe', scope.projectId],
    ['margin-items'],
    ['document-state'],
  ];

  if (scope.decisionId) {
    keys.push(projectApprovalKeys.decision(scope.decisionId));
    keys.push(['client-decision', scope.decisionId]);
  }
  if (scope.designerClientId) {
    keys.push(['client-decisions', scope.designerClientId]);
  }

  await Promise.all([
    ...keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    invalidateProjectWorkflow(queryClient, scope.projectId),
  ]);
}

type ProjectApprovalRpcName =
  | 'set_project_decision_authority'
  | 'create_project_approval_decision'
  | 'confirm_project_decision_review'
  | 'publish_client_decision'
  | 'respond_project_approval'
  | 'withdraw_project_approval_decision'
  | 'supersede_project_approval_decision'
  | 'get_project_decision_reviews'
  | 'get_project_approval_artifact_candidates'
  | 'get_project_decision_review'
  | 'list_my_project_decision_reviews';

interface ProjectApprovalRpcClient {
  rpc(
    name: ProjectApprovalRpcName,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown | null }>;
}

function getRpcClient(): ProjectApprovalRpcClient {
  // database.types.ts currently marks p_required_coapprover_id as non-null even
  // though 00436 explicitly requires NULL. Keep that generated mismatch at this
  // boundary; every authority write below still sends an explicit null.
  return createBrowserClient() as unknown as ProjectApprovalRpcClient;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} returned an invalid payload`);
  }
  return value as Record<string, unknown>;
}

function stringValue(
  row: Record<string, unknown>,
  key: string,
  label: string,
): string {
  if (typeof row[key] !== 'string' || row[key] === '') {
    throw new Error(`${label} is missing ${key}`);
  }
  return row[key] as string;
}

function nullableString(
  row: Record<string, unknown>,
  key: string,
): string | null {
  return typeof row[key] === 'string' ? (row[key] as string) : null;
}

function numberValue(
  row: Record<string, unknown>,
  key: string,
  label: string,
): number {
  if (typeof row[key] !== 'number' || !Number.isFinite(row[key])) {
    throw new Error(`${label} is missing ${key}`);
  }
  return row[key] as number;
}

function isArtifactKind(value: unknown): value is ProjectApprovalArtifactKind {
  return (
    value === 'plan_issue' ||
    value === 'spec_book_artifact' ||
    value === 'budget_version'
  );
}

function isLifecycleStatus(
  value: unknown,
): value is ProjectApprovalLifecycleStatus {
  return (
    value === 'draft' ||
    value === 'pending' ||
    value === 'responded' ||
    value === 'expired'
  );
}

function isOutcome(value: unknown): value is ProjectApprovalOutcome {
  return (
    value === 'approved' ||
    value === 'changes_requested' ||
    value === 'needs_discussion'
  );
}

function isDisposition(value: unknown): value is ProjectApprovalDisposition {
  return value === 'active' || value === 'withdrawn' || value === 'superseded';
}

export function parseProjectApprovalReview(
  value: unknown,
): ProjectApprovalReview {
  const label = 'Project approval review';
  const row = asRecord(value, label);
  const artifactKind = row.artifactKind;
  const lifecycleStatus = row.lifecycleStatus;
  const disposition = row.disposition;
  if (!isArtifactKind(artifactKind)) {
    throw new Error(`${label} has an invalid artifactKind`);
  }
  if (!isLifecycleStatus(lifecycleStatus)) {
    throw new Error(`${label} has an invalid lifecycleStatus`);
  }
  if (!isDisposition(disposition)) {
    throw new Error(`${label} has an invalid disposition`);
  }
  if (row.outcome != null && !isOutcome(row.outcome)) {
    throw new Error(`${label} has an invalid outcome`);
  }

  const dueAt = stringValue(row, 'dueAt', label);
  if (typeof row.isOverdue !== 'boolean') {
    throw new Error(`${label} is missing isOverdue`);
  }

  return {
    decisionId: stringValue(row, 'decisionId', label),
    projectId: stringValue(row, 'projectId', label),
    phaseId: stringValue(row, 'phaseId', label),
    sectionKey: nullableString(row, 'sectionKey'),
    artifactKind,
    artifactId: stringValue(row, 'artifactId', label),
    artifactVersion: numberValue(row, 'artifactVersion', label),
    artifactChecksum: stringValue(row, 'artifactChecksum', label),
    artifactTitle: stringValue(row, 'artifactTitle', label),
    question: stringValue(row, 'question', label),
    context: nullableString(row, 'context'),
    dueAt,
    costCentsDelta: numberValue(row, 'costCentsDelta', label),
    scheduleDaysDelta: numberValue(row, 'scheduleDaysDelta', label),
    leadTimeDaysDelta: numberValue(row, 'leadTimeDaysDelta', label),
    lifecycleStatus,
    outcome: row.outcome == null ? null : row.outcome,
    disposition,
    isOverdue: row.isOverdue,
    completedReviewCount: numberValue(row, 'completedReviewCount', label),
    requiredReviewCount: numberValue(row, 'requiredReviewCount', label),
    authorityRevision:
      typeof row.authorityRevision === 'number' &&
      Number.isInteger(row.authorityRevision)
        ? row.authorityRevision
        : null,
    predecessorDecisionId: nullableString(row, 'predecessorDecisionId'),
    successorDecisionId: nullableString(row, 'successorDecisionId'),
    createdAt: stringValue(row, 'createdAt', label),
    sentAt: nullableString(row, 'sentAt'),
    respondedAt: nullableString(row, 'respondedAt'),
    updatedAt: stringValue(row, 'updatedAt', label),
  };
}

export function parseProjectApprovalArtifactCandidate(
  value: unknown,
): ProjectApprovalArtifactCandidate {
  const label = 'Project approval artifact candidate';
  const row = asRecord(value, label);
  if (!isArtifactKind(row.artifactKind)) {
    throw new Error(`${label} has an invalid artifactKind`);
  }

  return {
    artifactKind: row.artifactKind,
    artifactId: stringValue(row, 'artifactId', label),
    artifactVersion: numberValue(row, 'artifactVersion', label),
    artifactChecksum: stringValue(row, 'artifactChecksum', label),
    artifactTitle: stringValue(row, 'artifactTitle', label),
    issuedAt: nullableString(row, 'issuedAt'),
    publishedAt: nullableString(row, 'publishedAt'),
  };
}

function parseActionResult(value: unknown): ProjectApprovalActionResult {
  const row = asRecord(value, 'Project approval action');
  return {
    ...row,
    projectId: stringValue(row, 'projectId', 'Project approval action'),
    decisionId: stringValue(row, 'decisionId', 'Project approval action'),
  } as ProjectApprovalActionResult;
}

async function runRpc(
  name: ProjectApprovalRpcName,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await getRpcClient().rpc(name, args);
  if (error) throw error;
  if (data == null) throw new Error(`${name} returned no data`);
  return data;
}

export function useProjectApprovals(projectId: string | undefined) {
  return useQuery({
    queryKey: projectApprovalKeys.project(projectId ?? ''),
    queryFn: async () => {
      const data = await runRpc('get_project_decision_reviews', {
        p_project_id: projectId,
      });
      if (!Array.isArray(data)) {
        throw new Error(
          'get_project_decision_reviews returned an invalid list',
        );
      }
      return data.map(parseProjectApprovalReview);
    },
    enabled: !!projectId,
    ...approvalForegroundRefresh,
  });
}

export function useProjectApprovalArtifactCandidates(
  projectId: string | undefined,
) {
  return useQuery({
    queryKey: projectApprovalKeys.candidates(projectId ?? ''),
    queryFn: async () => {
      const data = await runRpc('get_project_approval_artifact_candidates', {
        p_project_id: projectId,
      });
      if (!Array.isArray(data)) {
        throw new Error(
          'get_project_approval_artifact_candidates returned an invalid list',
        );
      }
      return data.map(parseProjectApprovalArtifactCandidate);
    },
    enabled: !!projectId,
    ...approvalForegroundRefresh,
  });
}

export function useProjectApproval(
  projectId: string | undefined,
  decisionId: string | undefined,
) {
  const query = useProjectApprovals(projectId);
  return {
    ...query,
    data: query.data?.find((approval) => approval.decisionId === decisionId),
  };
}

/** Exact sanitized read for notification/deep-link consumers (00440). */
export function useProjectApprovalByDecision(decisionId: string | undefined) {
  return useQuery({
    queryKey: projectApprovalKeys.decision(decisionId ?? ''),
    queryFn: async () => {
      const { data, error } = await getRpcClient().rpc(
        'get_project_decision_review',
        { p_decision_id: decisionId },
      );
      if (error) throw error;
      return data == null ? null : parseProjectApprovalReview(data);
    },
    enabled: !!decisionId,
    ...approvalForegroundRefresh,
  });
}

/** Caller-global sanitized inbox read for installed native/portal clients (00440). */
export function useMyProjectApprovalReviews() {
  return useQuery({
    queryKey: projectApprovalKeys.mine(),
    queryFn: async () => {
      const { data, error } = await getRpcClient().rpc(
        'list_my_project_decision_reviews',
        {},
      );
      if (error) throw error;
      if (!Array.isArray(data)) {
        throw new Error(
          'list_my_project_decision_reviews returned an invalid list',
        );
      }
      return data.map(parseProjectApprovalReview);
    },
    ...approvalForegroundRefresh,
  });
}

export function useProjectDecisionAuthority(projectId: string | undefined) {
  return useQuery({
    queryKey: projectApprovalKeys.authority(projectId ?? ''),
    queryFn: async () => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('project_decision_authorities')
        .select('*')
        .eq('project_id', projectId as string)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        projectId: data.project_id,
        decisionLeadId: data.decision_lead_id,
        requiredCoapproverId: null,
        revision: data.revision,
        assignedBy: data.assigned_by,
        assignedAt: data.assigned_at,
        updatedAt: data.updated_at,
      } satisfies ProjectDecisionAuthority;
    },
    enabled: !!projectId,
    ...approvalForegroundRefresh,
  });
}

function approvalMutation<TInput extends ProjectApprovalInvalidationScope>(
  queryClient: QueryClient,
  mutationFn: (input: TInput) => Promise<ProjectApprovalActionResult>,
) {
  return useMutation({
    mutationFn,
    onSuccess: async (result, input) => {
      await invalidateProjectApprovalQueries(queryClient, {
        projectId: result.projectId || input.projectId,
        decisionId: result.decisionId || input.decisionId,
        designerClientId: input.designerClientId,
      });
    },
  });
}

export function useSetProjectDecisionAuthority() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      decisionLeadId: string;
      expectedRevision: number;
    }) => {
      const data = asRecord(
        await runRpc('set_project_decision_authority', {
          p_project_id: input.projectId,
          p_decision_lead_id: input.decisionLeadId,
          p_required_coapprover_id: null,
          p_expected_revision: input.expectedRevision,
        }),
        'Project decision authority',
      );
      return {
        projectId: stringValue(data, 'projectId', 'Project decision authority'),
        decisionLeadId: stringValue(
          data,
          'decisionLeadId',
          'Project decision authority',
        ),
        requiredCoapproverId: null,
        revision: numberValue(data, 'revision', 'Project decision authority'),
        assignedBy: stringValue(
          data,
          'assignedBy',
          'Project decision authority',
        ),
        assignedAt: stringValue(
          data,
          'assignedAt',
          'Project decision authority',
        ),
        updatedAt: stringValue(data, 'updatedAt', 'Project decision authority'),
      } satisfies ProjectDecisionAuthority;
    },
    onSuccess: async (authority) => {
      await invalidateProjectApprovalQueries(queryClient, {
        projectId: authority.projectId,
      });
    },
  });
}

export function useCreateProjectApproval() {
  const queryClient = useQueryClient();
  return approvalMutation(
    queryClient,
    async (
      input: ProjectApprovalInvalidationScope & {
        payload: ProjectApprovalCreatePayload;
        idempotencyKey: string;
      },
    ) =>
      parseActionResult(
        await runRpc('create_project_approval_decision', {
          p_project_id: input.projectId,
          p_payload: {
            title: input.payload.title,
            question: input.payload.question,
            context: input.payload.context ?? null,
            dueAt: input.payload.dueAt,
            phaseId: input.payload.phaseId,
            sectionKey: input.payload.sectionKey ?? null,
            artifactKind: input.payload.artifactKind,
            artifactId: input.payload.artifactId,
            costCentsDelta: input.payload.costCentsDelta,
            scheduleDaysDelta: input.payload.scheduleDaysDelta,
            leadTimeDaysDelta: input.payload.leadTimeDaysDelta,
          },
          p_idempotency_key: input.idempotencyKey,
        }),
      ),
  );
}

export function useConfirmProjectApprovalReview() {
  const queryClient = useQueryClient();
  return approvalMutation(
    queryClient,
    async (
      input: ProjectApprovalInvalidationScope & {
        decisionId: string;
        authorityRevision: number;
        artifactChecksum: string;
        idempotencyKey: string;
      },
    ) =>
      parseActionResult(
        await runRpc('confirm_project_decision_review', {
          p_decision_id: input.decisionId,
          p_payload: {
            authorityRevision: input.authorityRevision,
            artifactHash: input.artifactChecksum,
            reviewMethod: 'portal_clickthrough',
          },
          p_idempotency_key: input.idempotencyKey,
        }),
      ),
  );
}

export function usePublishProjectApproval() {
  const queryClient = useQueryClient();
  return approvalMutation(
    queryClient,
    async (
      input: ProjectApprovalInvalidationScope & { decisionId: string },
    ) => {
      const row = asRecord(
        await runRpc('publish_client_decision', {
          p_decision_id: input.decisionId,
        }),
        'Project approval publish',
      );
      return {
        projectId: input.projectId,
        decisionId: input.decisionId,
        status: isLifecycleStatus(row.status) ? row.status : undefined,
        updatedAt: nullableString(row, 'updated_at') ?? undefined,
      };
    },
  );
}

export function useRespondProjectApproval() {
  const queryClient = useQueryClient();
  return approvalMutation(
    queryClient,
    async (
      input: ProjectApprovalInvalidationScope & {
        decisionId: string;
        outcome: ProjectApprovalOutcome;
        expectedUpdatedAt: string;
        idempotencyKey: string;
      },
    ) =>
      parseActionResult(
        await runRpc('respond_project_approval', {
          p_decision_id: input.decisionId,
          p_payload: { outcome: input.outcome },
          p_expected_updated_at: input.expectedUpdatedAt,
          p_idempotency_key: input.idempotencyKey,
        }),
      ),
  );
}

export function useWithdrawProjectApproval() {
  const queryClient = useQueryClient();
  return approvalMutation(
    queryClient,
    async (
      input: ProjectApprovalInvalidationScope & {
        decisionId: string;
        expectedUpdatedAt: string;
        reason: string;
        idempotencyKey: string;
      },
    ) =>
      parseActionResult(
        await runRpc('withdraw_project_approval_decision', {
          p_decision_id: input.decisionId,
          p_expected_updated_at: input.expectedUpdatedAt,
          p_reason: input.reason,
          p_idempotency_key: input.idempotencyKey,
        }),
      ),
  );
}

export function useSupersedeProjectApproval() {
  const queryClient = useQueryClient();
  return approvalMutation(
    queryClient,
    async (
      input: ProjectApprovalInvalidationScope & {
        decisionId: string;
        payload: Omit<ProjectApprovalCreatePayload, 'phaseId' | 'sectionKey'>;
        expectedUpdatedAt: string;
        idempotencyKey: string;
      },
    ) =>
      parseActionResult(
        await runRpc('supersede_project_approval_decision', {
          p_decision_id: input.decisionId,
          p_payload: {
            title: input.payload.title,
            question: input.payload.question,
            context: input.payload.context ?? null,
            dueAt: input.payload.dueAt,
            artifactKind: input.payload.artifactKind,
            artifactId: input.payload.artifactId,
            costCentsDelta: input.payload.costCentsDelta,
            scheduleDaysDelta: input.payload.scheduleDaysDelta,
            leadTimeDaysDelta: input.payload.leadTimeDaysDelta,
          },
          p_expected_updated_at: input.expectedUpdatedAt,
          p_idempotency_key: input.idempotencyKey,
        }),
      ),
  );
}
