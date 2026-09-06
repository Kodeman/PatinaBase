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
/**
 * Which chair the caller is sitting in for one projected row (00569).
 * `lead` is the frozen decision lead — the only person respond_project_approval
 * accepts; `studio` is a design-studio co-member reading over her shoulder;
 * `household` is the project's client on a row whose frozen lead is somebody
 * else. Null for a projection minted before 00569.
 */
export type ProjectApprovalViewerRole = 'lead' | 'studio' | 'household';

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
  /**
   * P-13 — the designer's one-line why, frozen into the artifact snapshot at
   * compose time. Null on every artifact minted before the column existed, and
   * on any approval whose composer left the (optional) field empty. Optional on
   * the interface until the projection carries the column on every surface —
   * `parseProjectApprovalReview` always sets it, to null when absent.
   */
  why?: string | null;
  /**
   * P-13 — the display name of the hand that WROTE the why, carried by the
   * projection so the sentence is signed by its author rather than by whoever
   * is reading it: a studio has more than one designer, and the record is
   * immutable and client-facing. Null on any row minted before the projection
   * carried the name, and on any artifact whose author cannot be resolved; an
   * unsigned sentence is honest, a wrongly signed one is not. Every surface
   * renders this value verbatim (ruling, 2026-09-05) — no surface shortens it.
   */
  whyAuthorName?: string | null;
  context: string | null;
  /** Null when the projection predates 00569 — never guessed from the client. */
  viewerRole: ProjectApprovalViewerRole | null;
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
  /**
   * P-26 — the name she typed when she signed, so the printed Record of
   * Decision can say who answered and not only how. Carried by the projection
   * from 00573; null on Return and Hold (press-and-hold only, no name), on
   * every approval answered before 00569, and on any older projection.
   */
  clientSignature?: string | null;
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
  /** P-13 — optional, at most 200 characters, frozen with the artifact. */
  why?: string | null;
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
  snooze: (decisionId: string) => ['decision-snooze', decisionId] as const,
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
    keys.push(projectApprovalKeys.snooze(scope.decisionId));
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
  | 'set_decision_snooze'
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

function isViewerRole(value: unknown): value is ProjectApprovalViewerRole {
  return value === 'lead' || value === 'studio' || value === 'household';
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
    why: nullableString(row, 'why'),
    whyAuthorName: nullableString(row, 'whyAuthorName'),
    context: nullableString(row, 'context'),
    // Arrived with 00569 and absent from every older projection, so it may
    // not be required here: absence is null, never a guess.
    viewerRole: isViewerRole(row.viewerRole) ? row.viewerRole : null,
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
    // Arrived with 00573; an older projection simply has no name to give.
    clientSignature: nullableString(row, 'clientSignature'),
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

/**
 * P-13 — the why is one line on its way to `p_why`. The composer strips
 * newlines as they are typed; this is the last gate before the sentence
 * freezes into `project_approval_artifacts`, a table that is append-only by
 * design, so an interior newline reaching it could never be corrected.
 */
function oneLineWhy(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/gu, ' ').trim();
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
    ) => {
      const why = oneLineWhy(input.payload.why);
      return parseActionResult(
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
          // P-13 — the key is omitted entirely when there is no why, so the
          // call still matches the pre-`p_why` RPC signature.
          ...(why ? { p_why: why } : {}),
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
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

/**
 * How the client agreed. `respond_project_approval` accepts the pair from
 * 00570 onward; before it the wrapper refused any payload key but `outcome`
 * and `optionId`, which is why the keys are sent ONLY when a method is given.
 */
export type ProjectApprovalConsentMethod =
  | 'electronic_signature'
  | 'click_through';

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
        /** The typed legal name (R1). Required by the RPC for a signature. */
        clientSignature?: string | null;
        clientConsentMethod?: ProjectApprovalConsentMethod | null;
      },
    ) =>
      parseActionResult(
        await runRpc('respond_project_approval', {
          p_decision_id: input.decisionId,
          p_payload: input.clientConsentMethod
            ? {
                outcome: input.outcome,
                clientConsentMethod: input.clientConsentMethod,
                clientSignature: input.clientSignature ?? null,
              }
            : { outcome: input.outcome },
          p_expected_updated_at: input.expectedUpdatedAt,
          p_idempotency_key: input.idempotencyKey,
        }),
      ),
  );
}

/* ── P-28 · she sets the pace, per approval ─────────────────────────────────
   A snooze moves the REMINDERS and nothing else. The approval stays open, her
   answer stays hers to give, and two classes of mail ignore this setting
   entirely: the overdue notice (it is the last thing Patina says before it
   goes quiet, and burying it would leave her with nothing at all) and a
   superseding edition (a new edition is news, not a reminder).

   The four choices are SYMBOLIC, not timestamps. "Tomorrow morning" and
   "Sunday" are questions about her wall calendar, and "when it's due" is a
   date only the row knows; resolving them server-side keeps one answer for
   the mail, the push and the in-app row, where a client-computed instant would
   drift the moment she crossed a timezone.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * The four kinds `set_decision_snooze` accepts (00572). `never` is "don't
 * remind me — I'll come back": it stands the reminders down until the overdue
 * notice, which no snooze suppresses.
 */
export type DecisionSnoozeChoice =
  | 'tomorrow_morning'
  | 'sunday'
  | 'when_due'
  | 'never';

export interface DecisionSnoozeInput extends ProjectApprovalInvalidationScope {
  decisionId: string;
  choice: DecisionSnoozeChoice;
}

/** One row of `decision_snoozes`, as its own owner reads it back (00572). */
export interface DecisionSnoozeStanding {
  choice: DecisionSnoozeChoice;
  /** `'infinity'` for `never` and for a dateless `when_due`. */
  snoozedUntil: string;
}

const DECISION_SNOOZE_CHOICES: readonly DecisionSnoozeChoice[] = [
  'tomorrow_morning',
  'sunday',
  'when_due',
  'never',
];

/**
 * The snooze a stored row still stands for, or null.
 *
 * Read HONESTLY, the same rule iOS's `DecisionSnooze.standing` applies: a hold
 * that has already lifted is not a hold, and saying "the reminders are held
 * until Sunday" on the Monday after would be the same lie in the other
 * direction. `snoozed_until = 'infinity'` (`never`, and a dateless `when_due`)
 * never lifts, and Postgres serialises it as the word.
 */
export function standingDecisionSnooze(
  row: { kind?: unknown; snoozed_until?: unknown } | null | undefined,
  now: Date = new Date(),
): DecisionSnoozeStanding | null {
  if (!row) return null;
  const kind = typeof row.kind === 'string' ? row.kind.trim() : '';
  if (!DECISION_SNOOZE_CHOICES.includes(kind as DecisionSnoozeChoice)) {
    return null;
  }
  const until =
    typeof row.snoozed_until === 'string' ? row.snoozed_until.trim() : '';
  if (!until) return null;
  const choice = kind as DecisionSnoozeChoice;
  if (until === 'infinity') return { choice, snoozedUntil: until };
  const lifts = new Date(until);
  if (Number.isNaN(lifts.getTime())) return null;
  return lifts > now ? { choice, snoozedUntil: until } : null;
}

/**
 * `P-28` — the snooze already standing on this approval.
 *
 * The write was the only half the web had, so the choice lived exactly as long
 * as the tab did and a reload drew the four acts as though she had never
 * asked. RLS hands back her own row and nobody else's
 * (`decision_snoozes_owner_select`, 00572), which is why this is a plain table
 * read rather than another RPC: there is nothing to filter that the policy has
 * not already filtered. A list rather than `.maybeSingle()` for the same reason
 * iOS takes one — `UNIQUE (user_id, decision_id)` makes at most one row
 * possible, a snooze being replaced rather than stacked.
 */
export function useDecisionSnooze(decisionId: string | undefined) {
  return useQuery({
    queryKey: projectApprovalKeys.snooze(decisionId ?? ''),
    queryFn: async () => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('decision_snoozes')
        .select('kind,snoozed_until')
        .eq('decision_id', decisionId as string)
        .limit(1);
      if (error) throw error;
      return standingDecisionSnooze(
        (data as Array<{ kind: string; snoozed_until: string }> | null)?.[0],
      );
    },
    enabled: !!decisionId,
    ...approvalForegroundRefresh,
  });
}

/**
 * Stand this approval's reminders down (P-28).
 *
 * Rides the same invalidation rail every authoritative Stage-2 mutation uses,
 * so the ask redraws with the snooze it was just given rather than with the
 * one it had a moment ago.
 */
export function useSetDecisionSnooze() {
  const queryClient = useQueryClient();
  return approvalMutation(queryClient, async (input: DecisionSnoozeInput) => {
    // The RPC resolves her zone itself (notification_time_zone), so the
    // browser sends no timezone: two clocks would eventually disagree and the
    // server's is the one the mail, the push and the in-app row are minted on.
    const row = asRecord(
      await runRpc('set_decision_snooze', {
        p_decision_id: input.decisionId,
        p_kind: input.choice,
      }),
      'Decision snooze',
    );
    // This RPC answers about the SNOOZE, not about the approval: it returns
    // decisionId / kind / snoozedUntil / timeZone and no projectId. Demanding
    // one here would report a snooze that landed as a snooze that failed, so
    // the invalidation rail takes the projectId the caller already carries.
    return {
      ...row,
      projectId: input.projectId,
      decisionId: stringValue(row, 'decisionId', 'Decision snooze'),
    } as ProjectApprovalActionResult;
  });
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
    ) => {
      const why = oneLineWhy(input.payload.why);
      return parseActionResult(
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
          // P-13 — a re-ask travels; silence omits the key, and the RPC then
          // carries the predecessor's frozen why forward rather than clearing
          // it. Omitting also leaves the supersession's idempotency hash
          // unchanged for every key minted before `p_why` existed.
          ...(why ? { p_why: why } : {}),
          p_expected_updated_at: input.expectedUpdatedAt,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
  );
}
