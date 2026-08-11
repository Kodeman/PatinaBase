'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  useCreateProjectApproval,
  useProjectApprovalArtifactCandidates,
  useProjectApprovalRealtime,
  useProjectApprovals,
  useProjectDecisionAuthority,
  usePublishProjectApproval,
  useSetProjectDecisionAuthority,
  useSupersedeProjectApproval,
  useWithdrawProjectApproval,
  type ProjectApprovalArtifactCandidate,
  type ProjectApprovalReview,
} from '@patina/supabase';

import { DocumentAction, DocumentActionRow } from '../document-action';
import {
  eligibleSupersessionCandidates,
  newApprovalIdempotencyKey,
  parseSignedDelta,
  projectApprovalActions,
  toFutureDueAt,
} from './project-approval-model';
import {
  FOCUS_PROJECT_APPROVAL_EVENT,
  type FocusProjectApprovalDetail,
} from './project-approval-navigation';

export interface ProjectApprovalPhase {
  id: string;
  name: string;
  status: string;
}

interface ApprovalFormState {
  title: string;
  question: string;
  context: string;
  dueAt: string;
  phaseId: string;
  artifactValue: string;
  costCentsDelta: string;
  scheduleDaysDelta: string;
  leadTimeDaysDelta: string;
  idempotencyKey: string;
}

interface SupersedeState extends Omit<ApprovalFormState, 'phaseId'> {
  decisionId: string;
}

const INPUT =
  'min-h-11 w-full min-w-0 rounded-[5px] border border-[var(--color-pearl)] bg-white px-2.5 py-2 text-[14px] text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]';
const LABEL =
  'mb-1 block font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';

function emptyForm(): ApprovalFormState {
  return {
    title: '',
    question: '',
    context: '',
    dueAt: '',
    phaseId: '',
    artifactValue: '',
    costCentsDelta: '0',
    scheduleDaysDelta: '0',
    leadTimeDaysDelta: '0',
    idempotencyKey: newApprovalIdempotencyKey(),
  };
}

function artifactValue(candidate: ProjectApprovalArtifactCandidate): string {
  return `${candidate.artifactKind}:${candidate.artifactId}`;
}

function findArtifact(
  candidates: readonly ProjectApprovalArtifactCandidate[],
  value: string,
) {
  return candidates.find((candidate) => artifactValue(candidate) === value);
}

function readableStatus(review: ProjectApprovalReview): string {
  if (review.disposition === 'withdrawn') return 'Withdrawn';
  if (review.disposition === 'superseded') return 'Superseded';
  if (review.outcome === 'changes_requested') return 'Changes requested';
  if (review.outcome === 'needs_discussion') return 'Needs discussion';
  if (review.outcome === 'approved') return 'Approved';
  if (review.lifecycleStatus === 'draft') return 'Draft';
  if (review.isOverdue) return 'Pending · overdue';
  return review.lifecycleStatus === 'pending' ? 'Pending' : 'Expired';
}

function formatDelta(value: number, unit: string): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value} ${unit}`;
}

export function ProjectApprovalDocument({
  projectId,
  clientProfileId,
  phases,
}: {
  projectId: string;
  clientProfileId: string | null;
  phases: readonly ProjectApprovalPhase[];
}) {
  const approvalsQuery = useProjectApprovals(projectId);
  const candidatesQuery = useProjectApprovalArtifactCandidates(projectId);
  const authorityQuery = useProjectDecisionAuthority(projectId);
  const setAuthority = useSetProjectDecisionAuthority();
  const createApproval = useCreateProjectApproval();
  const publishApproval = usePublishProjectApproval();
  const withdrawApproval = useWithdrawProjectApproval();
  const supersedeApproval = useSupersedeProjectApproval();
  useProjectApprovalRealtime(projectId);

  const approvals = approvalsQuery.data ?? [];
  const candidates = candidatesQuery.data ?? [];
  const authority = authorityQuery.data;
  const authorityMatches =
    Boolean(clientProfileId) &&
    authority?.decisionLeadId === clientProfileId &&
    authority.requiredCoapproverId === null;

  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState<ApprovalFormState>(emptyForm);
  const [withdrawState, setWithdrawState] = useState<{
    decisionId: string;
    reason: string;
    idempotencyKey: string;
  } | null>(null);
  const [supersedeState, setSupersedeState] = useState<SupersedeState | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{
    kind: 'status' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    const onFocusApproval = (event: Event) => {
      const decisionId = (
        event as CustomEvent<FocusProjectApprovalDetail | undefined>
      ).detail?.decisionId;
      if (!decisionId) return;
      const target = document.getElementById(`project-approval-${decisionId}`);
      if (!target || target.dataset.projectApprovalCurrentLeaf !== 'true')
        return;
      target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      target.focus({ preventScroll: true });
    };

    window.addEventListener(
      FOCUS_PROJECT_APPROVAL_EVENT,
      onFocusApproval as EventListener,
    );
    return () =>
      window.removeEventListener(
        FOCUS_PROJECT_APPROVAL_EVENT,
        onFocusApproval as EventListener,
      );
  }, []);

  const phaseById = useMemo(
    () => new Map(phases.map((phase) => [phase.id, phase])),
    [phases],
  );
  const availablePhases = useMemo(
    () => phases.filter((phase) => phase.status !== 'completed'),
    [phases],
  );
  const availablePhaseIds = useMemo(
    () => new Set(availablePhases.map((phase) => phase.id)),
    [availablePhases],
  );

  const updateForm = (patch: Partial<ApprovalFormState>) =>
    setForm((current) => ({ ...current, ...patch }));

  const assignAuthority = async () => {
    if (!clientProfileId) return;
    setFeedback(null);
    try {
      await setAuthority.mutateAsync({
        projectId,
        decisionLeadId: clientProfileId,
        expectedRevision: authority?.revision ?? 0,
      });
      setFeedback({
        kind: 'status',
        text: 'The project client is now the designated decision lead.',
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Decision authority could not be assigned.',
      });
    }
  };

  const submitDraft = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    try {
      if (!authorityMatches)
        throw new Error('Assign the project decision lead first.');
      const artifact = findArtifact(candidates, form.artifactValue);
      if (!artifact) throw new Error('Choose an issued artifact.');
      if (!availablePhaseIds.has(form.phaseId))
        throw new Error('Choose a live project phase.');
      const title = form.title.trim();
      const question = form.question.trim();
      if (!title || !question)
        throw new Error('Title and approval question are required.');

      await createApproval.mutateAsync({
        projectId,
        idempotencyKey: form.idempotencyKey,
        payload: {
          title,
          question,
          context: form.context.trim() || null,
          dueAt: toFutureDueAt(form.dueAt),
          phaseId: form.phaseId,
          artifactKind: artifact.artifactKind,
          artifactId: artifact.artifactId,
          costCentsDelta: parseSignedDelta(form.costCentsDelta, 'Cost delta'),
          scheduleDaysDelta: parseSignedDelta(
            form.scheduleDaysDelta,
            'Schedule delta',
          ),
          leadTimeDaysDelta: parseSignedDelta(
            form.leadTimeDaysDelta,
            'Lead-time delta',
          ),
        },
      });
      setForm(emptyForm());
      setComposing(false);
      setFeedback({
        kind: 'status',
        text: 'Approval draft created. The client must confirm review before publish.',
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Approval draft could not be created.',
      });
    }
  };

  const submitWithdrawal = async (review: ProjectApprovalReview) => {
    if (!withdrawState || withdrawState.decisionId !== review.decisionId)
      return;
    const reason = withdrawState.reason.trim();
    if (!reason) {
      setFeedback({ kind: 'error', text: 'A withdrawal reason is required.' });
      return;
    }
    setFeedback(null);
    try {
      await withdrawApproval.mutateAsync({
        projectId,
        decisionId: review.decisionId,
        expectedUpdatedAt: review.updatedAt,
        reason,
        idempotencyKey: withdrawState.idempotencyKey,
      });
      setWithdrawState(null);
      setFeedback({
        kind: 'status',
        text: 'Approval withdrawn. Its evidence remains in the record.',
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Approval could not be withdrawn.',
      });
    }
  };

  const beginSupersede = (review: ProjectApprovalReview) => {
    setWithdrawState(null);
    setSupersedeState({
      decisionId: review.decisionId,
      title: review.artifactTitle,
      question: review.question,
      context: review.context ?? '',
      dueAt: '',
      artifactValue: '',
      costCentsDelta: String(review.costCentsDelta),
      scheduleDaysDelta: String(review.scheduleDaysDelta),
      leadTimeDaysDelta: String(review.leadTimeDaysDelta),
      idempotencyKey: newApprovalIdempotencyKey(),
    });
  };

  const submitSupersession = async (
    event: FormEvent,
    review: ProjectApprovalReview,
  ) => {
    event.preventDefault();
    if (!supersedeState || supersedeState.decisionId !== review.decisionId)
      return;
    setFeedback(null);
    try {
      const eligible = eligibleSupersessionCandidates(review, candidates);
      const artifact = findArtifact(eligible, supersedeState.artifactValue);
      if (!artifact) throw new Error('Choose a genuinely new issued artifact.');
      const title = supersedeState.title.trim();
      const question = supersedeState.question.trim();
      if (!title || !question)
        throw new Error('Title and approval question are required.');
      await supersedeApproval.mutateAsync({
        projectId,
        decisionId: review.decisionId,
        expectedUpdatedAt: review.updatedAt,
        idempotencyKey: supersedeState.idempotencyKey,
        payload: {
          title,
          question,
          context: supersedeState.context.trim() || null,
          dueAt: toFutureDueAt(supersedeState.dueAt),
          artifactKind: artifact.artifactKind,
          artifactId: artifact.artifactId,
          costCentsDelta: parseSignedDelta(
            supersedeState.costCentsDelta,
            'Cost delta',
          ),
          scheduleDaysDelta: parseSignedDelta(
            supersedeState.scheduleDaysDelta,
            'Schedule delta',
          ),
          leadTimeDaysDelta: parseSignedDelta(
            supersedeState.leadTimeDaysDelta,
            'Lead-time delta',
          ),
        },
      });
      setSupersedeState(null);
      setFeedback({
        kind: 'status',
        text: 'A new approval draft now supersedes the prior leaf.',
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Approval could not be superseded.',
      });
    }
  };

  return (
    <section
      aria-labelledby="project-approvals-title"
      data-project-approval-document
      className="mt-6 min-w-0 border-y border-[var(--border-subtle)] py-6"
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            Exact artifact · named authority
          </p>
          <h2
            id="project-approvals-title"
            className="font-heading text-[22px] font-medium text-[var(--color-charcoal)]"
          >
            Client approvals
          </h2>
        </div>
        {authorityMatches && availablePhases.length > 0 && (
          <DocumentAction
            actionKey="compose-project-approval"
            surfaceKey="open-document"
            regionKey="project-approvals"
            variant="primary"
            onClick={() => setComposing((open) => !open)}
            aria-expanded={composing}
          >
            {composing ? 'Close draft' : 'New approval'}
          </DocumentAction>
        )}
      </div>
      <p className="mt-2 max-w-[66ch] text-[14px] leading-relaxed text-[var(--text-muted)]">
        Bind each request to one issued plan, client-ready specification, or
        published budget checkpoint. Discussion stays in the project thread;
        only the recorded outcome settles an approval.
      </p>

      {!clientProfileId && (
        <p role="status" className="mt-4 text-[13px] text-[var(--text-muted)]">
          Add the project client before assigning decision authority.
        </p>
      )}
      {clientProfileId && authority === null && !authorityQuery.isLoading && (
        <div className="mt-4 border-l-2 border-[var(--color-golden-hour)] pl-3">
          <p className="text-[13px] text-[var(--color-charcoal)]">
            This project does not have a designated decision lead yet.
          </p>
          <DocumentAction
            actionKey="assign-project-decision-lead"
            surfaceKey="open-document"
            regionKey="project-approvals"
            variant="primary"
            loading={setAuthority.isPending}
            loadingLabel="Assigning…"
            onClick={assignAuthority}
          >
            Assign project client
          </DocumentAction>
        </div>
      )}
      {authority && !authorityMatches && clientProfileId && (
        <div className="mt-4 border-l-2 border-[var(--color-terracotta)] pl-3">
          <p
            role="alert"
            className="text-[13px] text-[var(--color-terracotta)]"
          >
            Decision authority does not match this project’s current client.
          </p>
          <DocumentAction
            actionKey="reassign-project-decision-lead"
            surfaceKey="open-document"
            regionKey="project-approvals"
            variant="primary"
            loading={setAuthority.isPending}
            loadingLabel="Assigning…"
            onClick={assignAuthority}
          >
            Assign current project client
          </DocumentAction>
        </div>
      )}

      {authorityMatches && availablePhases.length === 0 && (
        <p role="status" className="mt-4 text-[13px] text-[var(--text-muted)]">
          Add or reopen a project phase before authoring a new approval.
          Completed phases cannot receive a new unresolved blocker.
        </p>
      )}

      {feedback && (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          aria-live={feedback.kind === 'error' ? 'assertive' : 'polite'}
          className="mt-4 text-[13px] text-[var(--color-charcoal)]"
        >
          {feedback.text}
        </p>
      )}

      {composing && authorityMatches && availablePhases.length > 0 && (
        <form
          onSubmit={submitDraft}
          className="mt-5 min-w-0 border-t border-[var(--color-pearl)] pt-5"
        >
          <h3 className="font-heading text-[18px] text-[var(--color-charcoal)]">
            Draft an exact review request
          </h3>
          <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 min-[560px]:grid-cols-2">
            <Field label="Title" id="approval-title">
              <input
                id="approval-title"
                className={INPUT}
                value={form.title}
                onChange={(event) => updateForm({ title: event.target.value })}
                required
              />
            </Field>
            <Field label="Approval question" id="approval-question">
              <input
                id="approval-question"
                className={INPUT}
                value={form.question}
                onChange={(event) =>
                  updateForm({ question: event.target.value })
                }
                required
              />
            </Field>
            <Field label="Exact project phase" id="approval-phase">
              <select
                id="approval-phase"
                className={INPUT}
                value={form.phaseId}
                onChange={(event) =>
                  updateForm({ phaseId: event.target.value })
                }
                required
              >
                <option value="">Choose a phase</option>
                {availablePhases.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Issued artifact" id="approval-artifact">
              <select
                id="approval-artifact"
                className={INPUT}
                value={form.artifactValue}
                onChange={(event) =>
                  updateForm({ artifactValue: event.target.value })
                }
                required
                disabled={candidatesQuery.isLoading}
              >
                <option value="">
                  {candidatesQuery.isLoading
                    ? 'Reading issued artifacts…'
                    : 'Choose an issued artifact'}
                </option>
                {candidates.map((candidate) => (
                  <option
                    key={artifactValue(candidate)}
                    value={artifactValue(candidate)}
                  >
                    {candidate.artifactTitle} · v{candidate.artifactVersion}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due date and time" id="approval-due">
              <input
                id="approval-due"
                type="datetime-local"
                className={INPUT}
                value={form.dueAt}
                onChange={(event) => updateForm({ dueAt: event.target.value })}
                required
              />
            </Field>
            <div className="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-3 min-[560px]:col-span-2">
              <DeltaField
                id="approval-cost-delta"
                label="Cost delta (cents)"
                value={form.costCentsDelta}
                onChange={(costCentsDelta) => updateForm({ costCentsDelta })}
              />
              <DeltaField
                id="approval-schedule-delta"
                label="Schedule delta (days)"
                value={form.scheduleDaysDelta}
                onChange={(scheduleDaysDelta) =>
                  updateForm({ scheduleDaysDelta })
                }
              />
              <DeltaField
                id="approval-lead-delta"
                label="Lead-time delta (days)"
                value={form.leadTimeDaysDelta}
                onChange={(leadTimeDaysDelta) =>
                  updateForm({ leadTimeDaysDelta })
                }
              />
            </div>
            <Field
              label="Context (optional, not an approval response)"
              id="approval-context"
              wide
            >
              <textarea
                id="approval-context"
                rows={3}
                className={INPUT}
                value={form.context}
                onChange={(event) =>
                  updateForm({ context: event.target.value })
                }
              />
            </Field>
          </div>
          <DocumentActionRow
            surfaceKey="open-document"
            regionKey="project-approval-composer"
            className="mt-3"
            aria-label="Approval draft actions"
          >
            <DocumentAction
              actionKey="create-project-approval-draft"
              variant="primary"
              type="submit"
              loading={createApproval.isPending}
              loadingLabel="Creating…"
            >
              Create review draft
            </DocumentAction>
            <DocumentAction
              actionKey="cancel-project-approval-draft"
              variant="tertiary"
              onClick={() => setComposing(false)}
            >
              Cancel
            </DocumentAction>
          </DocumentActionRow>
        </form>
      )}

      <div className="mt-6 min-w-0 border-t border-[var(--color-pearl)] pt-4">
        <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          Approval record
        </h3>
        {(approvalsQuery.isLoading || authorityQuery.isLoading) && (
          <p
            aria-busy="true"
            className="mt-3 text-[13px] text-[var(--text-muted)]"
          >
            Reading approvals…
          </p>
        )}
        {approvalsQuery.isError && (
          <p
            role="alert"
            className="mt-3 text-[13px] text-[var(--color-terracotta)]"
          >
            Approvals could not be read.
          </p>
        )}
        {!approvalsQuery.isLoading && approvals.length === 0 && (
          <p className="mt-3 text-[13px] italic text-[var(--text-muted)]">
            No exact-artifact approvals have been authored.
          </p>
        )}
        <ol className="mt-2 min-w-0">
          {approvals.map((review) => {
            const boundPhase = phaseById.get(review.phaseId);
            const boundPhaseCompleted = boundPhase?.status === 'completed';
            const actions = projectApprovalActions(review, {
              boundPhaseCompleted,
            });
            const eligibleArtifacts = eligibleSupersessionCandidates(
              review,
              candidates,
            );
            const withdrawing = withdrawState?.decisionId === review.decisionId;
            const superseding =
              supersedeState?.decisionId === review.decisionId;
            return (
              <li
                key={review.decisionId}
                id={`project-approval-${review.decisionId}`}
                data-project-approval-current-leaf={
                  review.disposition === 'active' &&
                  review.successorDecisionId === null &&
                  (review.lifecycleStatus === 'draft' ||
                    review.lifecycleStatus === 'pending' ||
                    (review.lifecycleStatus === 'responded' &&
                      (review.outcome === 'changes_requested' ||
                        review.outcome === 'needs_discussion')))
                    ? 'true'
                    : 'false'
                }
                tabIndex={-1}
                className="min-w-0 scroll-mt-6 border-b border-[var(--color-pearl)] py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-heading text-[17px] text-[var(--color-charcoal)]">
                      {review.artifactTitle}
                    </p>
                    <p className="mt-1 break-words text-[13px] text-[var(--color-charcoal)]">
                      {review.question}
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      {boundPhase?.name ?? 'Bound project phase'} · artifact v
                      {review.artifactVersion}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-[3px] border border-[var(--color-pearl)] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
                    {readableStatus(review)}
                  </span>
                </div>
                <p className="mt-2 text-[12px] text-[var(--text-muted)]">
                  Review {review.completedReviewCount} of{' '}
                  {review.requiredReviewCount} ·{' '}
                  {formatDelta(review.costCentsDelta, '¢')} ·{' '}
                  {formatDelta(review.scheduleDaysDelta, 'schedule days')} ·{' '}
                  {formatDelta(review.leadTimeDaysDelta, 'lead-time days')}
                </p>
                {review.lifecycleStatus === 'draft' &&
                  !actions.publish &&
                  review.disposition === 'active' &&
                  review.successorDecisionId === null && (
                    <p className="mt-2 text-[12px] italic text-[var(--text-muted)]">
                      Publish unlocks after every frozen reviewer has confirmed
                      the exact artifact.
                    </p>
                  )}
                {boundPhaseCompleted &&
                  review.disposition === 'active' &&
                  review.successorDecisionId === null &&
                  (review.lifecycleStatus === 'pending' ||
                    review.lifecycleStatus === 'responded') && (
                    <p
                      role="status"
                      className="mt-2 text-[12px] italic text-[var(--text-muted)]"
                    >
                      This approval belongs to a completed phase and cannot be
                      superseded there. Author a new approval in a live phase.
                    </p>
                  )}
                <DocumentActionRow
                  surfaceKey="open-document"
                  regionKey={`project-approval-${review.decisionId}`}
                  className="mt-2"
                  aria-label={`${review.artifactTitle} approval actions`}
                >
                  {review.lifecycleStatus === 'draft' &&
                    review.disposition === 'active' &&
                    review.successorDecisionId === null && (
                      <DocumentAction
                        actionKey="publish-project-approval"
                        variant="primary"
                        disabled={!actions.publish}
                        loading={publishApproval.isPending}
                        loadingLabel="Publishing…"
                        onClick={() =>
                          void publishApproval
                            .mutateAsync({
                              projectId,
                              decisionId: review.decisionId,
                            })
                            .catch((error: unknown) =>
                              setFeedback({
                                kind: 'error',
                                text:
                                  error instanceof Error
                                    ? error.message
                                    : 'Approval could not be published.',
                              }),
                            )
                        }
                      >
                        Publish
                      </DocumentAction>
                    )}
                  {actions.withdraw && (
                    <DocumentAction
                      actionKey="withdraw-project-approval"
                      variant="danger"
                      aria-expanded={withdrawing}
                      onClick={() => {
                        setSupersedeState(null);
                        setWithdrawState({
                          decisionId: review.decisionId,
                          reason: '',
                          idempotencyKey: newApprovalIdempotencyKey(),
                        });
                      }}
                    >
                      Withdraw
                    </DocumentAction>
                  )}
                  {actions.supersede && (
                    <DocumentAction
                      actionKey="supersede-project-approval"
                      variant="secondary"
                      aria-expanded={superseding}
                      onClick={() => beginSupersede(review)}
                    >
                      Supersede with new artifact
                    </DocumentAction>
                  )}
                </DocumentActionRow>
                {withdrawing && withdrawState && (
                  <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 min-[560px]:grid-cols-[minmax(0,1fr)_auto]">
                    <Field
                      label="Withdrawal reason"
                      id={`withdraw-${review.decisionId}`}
                    >
                      <input
                        id={`withdraw-${review.decisionId}`}
                        className={INPUT}
                        value={withdrawState.reason}
                        onChange={(event) =>
                          setWithdrawState({
                            ...withdrawState,
                            reason: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <DocumentActionRow
                      surfaceKey="open-document"
                      regionKey="withdraw-project-approval"
                      className="self-end"
                      aria-label="Confirm withdrawal"
                    >
                      <DocumentAction
                        actionKey="confirm-withdraw-project-approval"
                        variant="danger"
                        loading={withdrawApproval.isPending}
                        loadingLabel="Withdrawing…"
                        onClick={() => submitWithdrawal(review)}
                      >
                        Confirm withdrawal
                      </DocumentAction>
                      <DocumentAction
                        actionKey="cancel-withdraw-project-approval"
                        variant="tertiary"
                        onClick={() => setWithdrawState(null)}
                      >
                        Cancel
                      </DocumentAction>
                    </DocumentActionRow>
                  </div>
                )}
                {superseding && supersedeState && (
                  <form
                    onSubmit={(event) => submitSupersession(event, review)}
                    className="mt-4 min-w-0 border-l-2 border-[var(--color-clay)] pl-3"
                  >
                    <h4 className="font-heading text-[16px] text-[var(--color-charcoal)]">
                      Superseding request
                    </h4>
                    <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 min-[560px]:grid-cols-2">
                      <Field
                        label="New issued artifact"
                        id={`supersede-artifact-${review.decisionId}`}
                      >
                        <select
                          id={`supersede-artifact-${review.decisionId}`}
                          className={INPUT}
                          value={supersedeState.artifactValue}
                          onChange={(event) =>
                            setSupersedeState({
                              ...supersedeState,
                              artifactValue: event.target.value,
                            })
                          }
                          required
                        >
                          <option value="">
                            Choose a genuinely new artifact
                          </option>
                          {eligibleArtifacts.map((candidate) => (
                            <option
                              key={artifactValue(candidate)}
                              value={artifactValue(candidate)}
                            >
                              {candidate.artifactTitle} · v
                              {candidate.artifactVersion}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field
                        label="New due date and time"
                        id={`supersede-due-${review.decisionId}`}
                      >
                        <input
                          id={`supersede-due-${review.decisionId}`}
                          type="datetime-local"
                          className={INPUT}
                          value={supersedeState.dueAt}
                          onChange={(event) =>
                            setSupersedeState({
                              ...supersedeState,
                              dueAt: event.target.value,
                            })
                          }
                          required
                        />
                      </Field>
                      <Field
                        label="Title"
                        id={`supersede-title-${review.decisionId}`}
                      >
                        <input
                          id={`supersede-title-${review.decisionId}`}
                          className={INPUT}
                          value={supersedeState.title}
                          onChange={(event) =>
                            setSupersedeState({
                              ...supersedeState,
                              title: event.target.value,
                            })
                          }
                          required
                        />
                      </Field>
                      <Field
                        label="Approval question"
                        id={`supersede-question-${review.decisionId}`}
                      >
                        <input
                          id={`supersede-question-${review.decisionId}`}
                          className={INPUT}
                          value={supersedeState.question}
                          onChange={(event) =>
                            setSupersedeState({
                              ...supersedeState,
                              question: event.target.value,
                            })
                          }
                          required
                        />
                      </Field>
                      <div className="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-3 min-[560px]:col-span-2">
                        <DeltaField
                          id={`supersede-cost-${review.decisionId}`}
                          label="Cost delta (cents)"
                          value={supersedeState.costCentsDelta}
                          onChange={(costCentsDelta) =>
                            setSupersedeState({
                              ...supersedeState,
                              costCentsDelta,
                            })
                          }
                        />
                        <DeltaField
                          id={`supersede-schedule-${review.decisionId}`}
                          label="Schedule delta (days)"
                          value={supersedeState.scheduleDaysDelta}
                          onChange={(scheduleDaysDelta) =>
                            setSupersedeState({
                              ...supersedeState,
                              scheduleDaysDelta,
                            })
                          }
                        />
                        <DeltaField
                          id={`supersede-lead-${review.decisionId}`}
                          label="Lead-time delta (days)"
                          value={supersedeState.leadTimeDaysDelta}
                          onChange={(leadTimeDaysDelta) =>
                            setSupersedeState({
                              ...supersedeState,
                              leadTimeDaysDelta,
                            })
                          }
                        />
                      </div>
                    </div>
                    <DocumentActionRow
                      surfaceKey="open-document"
                      regionKey="supersede-project-approval"
                      className="mt-2"
                      aria-label="Supersession actions"
                    >
                      <DocumentAction
                        actionKey="confirm-supersede-project-approval"
                        variant="primary"
                        type="submit"
                        loading={supersedeApproval.isPending}
                        loadingLabel="Superseding…"
                      >
                        Create superseding draft
                      </DocumentAction>
                      <DocumentAction
                        actionKey="cancel-supersede-project-approval"
                        variant="tertiary"
                        onClick={() => setSupersedeState(null)}
                      >
                        Cancel
                      </DocumentAction>
                    </DocumentActionRow>
                  </form>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Field({
  label,
  id,
  wide = false,
  children,
}: {
  label: string;
  id: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? 'min-w-0 min-[560px]:col-span-2' : 'min-w-0'}>
      <label className={LABEL} htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

function DeltaField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} id={id}>
      <input
        id={id}
        inputMode="numeric"
        pattern="[+-]?[0-9]+"
        className={INPUT}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </Field>
  );
}
