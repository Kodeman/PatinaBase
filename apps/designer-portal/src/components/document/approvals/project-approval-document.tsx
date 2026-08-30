'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { RegionHead, type RegionLedgerEntry } from '../region/region-head';
import { useRegionFold } from '../region/use-region-fold';
import { useRegionUnfoldRequest } from '@/hooks/use-region-unfold';
import { FoldSeam, focusRegionHeading } from '../region/fold-seam';
import { RegionRule } from '../region/region-rule';
import {
  useCreateProjectApproval,
  useProjectApprovalArtifactCandidates,
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
import { fmtDay } from '@/lib/document/format';
import {
  ArtifactEdges,
  GateCeremony,
  GateFieldset,
  GateImpact,
  GatePartBlock,
  GatePlain,
  GateQuestion,
} from './gate-anatomy';
import {
  eligibleSupersessionCandidates,
  formatGateImpact,
  gateScope,
  newApprovalIdempotencyKey,
  parseSignedDelta,
  projectApprovalActions,
  toFutureDueAt,
} from './project-approval-model';
import {
  FOCUS_PROJECT_APPROVAL_EVENT,
  type FocusProjectApprovalDetail,
} from './project-approval-navigation';
import { SectionLoadingLine } from '../section-loading-line';

const APPROVALS_BODY_ID = 'project-approvals-body';

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
  'mb-1 block font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';
const META =
  'font-mono text-[12px] uppercase tracking-[0.09em] text-[var(--text-muted)]';

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

/**
 * The paper has settled only when the question is answered for good. Changes
 * requested and needs discussion are bounced, not settled — the same component
 * still marks them the current live leaf, so their anatomy stays unfolded.
 */
function isSealed(review: ProjectApprovalReview): boolean {
  return review.disposition !== 'active' || review.outcome === 'approved';
}

function sealFor(review: ProjectApprovalReview): {
  label: string;
  className: string;
} {
  const settledOn = review.respondedAt ?? review.updatedAt;
  const label = `${readableStatus(review)}${
    settledOn ? ` · ${fmtDay(settledOn)}` : ''
  }`;
  const className =
    review.outcome === 'approved'
      ? 'border-[var(--color-mocha)] text-[var(--color-mocha)]'
      : review.disposition === 'active'
        ? 'border-[var(--color-aged-oak)] text-[var(--color-aged-oak)]'
        : 'border-[var(--color-pearl)] text-[var(--text-muted)]';
  return { label, className };
}

function artifactMeta(version: number, checksum: string): string {
  return `Edition ${version} · frozen at publish · proof ${checksum.slice(0, 8)}`;
}

/**
 * M2 names the lead on the paper. The designer portal already knows the
 * household's name; only the internal reviewer set is withheld, and that is not
 * what this line states.
 */
function decisionLeadLine(clientName: string | null | undefined): string {
  const named = clientName?.trim();
  return named
    ? `Decision lead — ${named} · frozen at publish`
    : 'Decision lead — the designated project client · frozen at publish';
}

function focusApprovalRow(decisionId: string) {
  const target = document.getElementById(`project-approval-${decisionId}`);
  if (!target) return;
  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView?.({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'center',
  });
  target.focus({ preventScroll: true });
}

export function ProjectApprovalDocument({
  projectId,
  clientProfileId,
  clientName,
  phases,
}: {
  projectId: string;
  clientProfileId: string | null;
  clientName?: string | null;
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

  const pendingFocusDecisionId = useRef<string | null>(null);
  const approvalsPending = useRef(
    approvalsQuery.isLoading || approvalsQuery.isFetching,
  );
  approvalsPending.current =
    approvalsQuery.isLoading || approvalsQuery.isFetching;

  const settlePendingApprovalFocus = useCallback(() => {
    const decisionId = pendingFocusDecisionId.current;
    if (!decisionId || approvalsPending.current) return;

    pendingFocusDecisionId.current = null;
    const target = document.getElementById(`project-approval-${decisionId}`);
    if (!target || target.dataset.projectApprovalCurrentLeaf !== 'true') return;

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView?.({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'center',
    });
    target.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onFocusApproval = (event: Event) => {
      const decisionId = (
        event as CustomEvent<FocusProjectApprovalDetail | undefined>
      ).detail?.decisionId;
      if (!decisionId) return;
      pendingFocusDecisionId.current = decisionId;
      settlePendingApprovalFocus();
    };

    window.addEventListener(
      FOCUS_PROJECT_APPROVAL_EVENT,
      onFocusApproval as EventListener,
    );
    return () => {
      pendingFocusDecisionId.current = null;
      window.removeEventListener(
        FOCUS_PROJECT_APPROVAL_EVENT,
        onFocusApproval as EventListener,
      );
    };
  }, [settlePendingApprovalFocus]);

  useEffect(() => {
    settlePendingApprovalFocus();
  }, [
    approvalsQuery.data,
    approvalsQuery.isFetching,
    approvalsQuery.isLoading,
    settlePendingApprovalFocus,
  ]);

  const phaseById = useMemo(
    () => new Map(phases.map((phase) => [phase.id, phase])),
    [phases],
  );
  const approvalById = useMemo(
    () => new Map(approvals.map((review) => [review.decisionId, review])),
    [approvals],
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

  const composerArtifact = findArtifact(candidates, form.artifactValue);

  const decisionLeadId = authority?.decisionLeadId ?? null;
  const decidedCount = approvals.filter(isSealed).length;
  const openCount = approvals.length - decidedCount;
  const leadName = authorityMatches
    ? clientName?.trim() || 'the designated client'
    : null;
  const headStatus =
    openCount > 0
      ? `${openCount} awaiting decision · ${leadName ?? 'no decision lead'}`
      : `${decidedCount} decided · ${leadName ?? 'no decision lead'}`;

  const composeAvailable = authorityMatches && availablePhases.length > 0;
  const assignAvailable =
    Boolean(clientProfileId) && authority === null && !authorityQuery.isLoading;
  const reassignAvailable =
    Boolean(authority) && !authorityMatches && Boolean(clientProfileId);

  const headLedger: RegionLedgerEntry[] = [];
  if (composeAvailable) {
    headLedger.push({
      key: 'compose-project-approval',
      label: composing ? 'Close draft' : 'New approval',
      onClick: () => setComposing((open) => !open),
      'aria-expanded': composing,
    });
  } else if (assignAvailable) {
    headLedger.push({
      key: 'assign-project-decision-lead',
      label: 'Assign project client',
      loading: setAuthority.isPending,
      loadingLabel: 'Assigning…',
      onClick: () => void assignAuthority(),
    });
  } else if (reassignAvailable) {
    headLedger.push({
      key: 'reassign-project-decision-lead',
      label: 'Assign current project client',
      loading: setAuthority.isPending,
      loadingLabel: 'Assigning…',
      onClick: () => void assignAuthority(),
    });
  }

  const queriesSettled = !approvalsQuery.isLoading && !authorityQuery.isLoading;
  const defaultFolded = queriesSettled
    ? (approvals.length === 0 && !decisionLeadId) ||
      (approvals.length > 0 && approvals.every(isSealed))
    : null;
  const fold = useRegionFold({
    docId: projectId,
    region: 'approvals',
    defaultFolded,
  });
  const unfoldFocusRef = useRef(false);
  const foldSetFolded = fold.setFolded;

  // The running index jumps to readable content, never to a seam.
  const openApprovalsRegion = useCallback(
    () => foldSetFolded(false),
    [foldSetFolded],
  );
  useRegionUnfoldRequest('approvals', openApprovalsRegion);

  useEffect(() => {
    if (!fold.folded && unfoldFocusRef.current) {
      unfoldFocusRef.current = false;
      focusRegionHeading('project-approvals-title');
    }
  }, [fold.folded]);

  if (fold.folded) {
    const leadPhrase = authorityMatches
      ? `Decision lead — ${clientName?.trim() || 'the designated client'}`
      : 'No decision lead';
    const authoredPhrase =
      approvals.length === 0
        ? 'no approvals authored'
        : `${approvals.length} approval${approvals.length === 1 ? '' : 's'} authored`;
    return (
      <div data-index-region="approvals" className="mt-[var(--doc-region-gap)]">
        <RegionRule weight="mid" />
        <FoldSeam
          headingId="project-approvals-title"
          bodyId={APPROVALS_BODY_ID}
          name="Client approvals"
          summary={`${leadPhrase} · ${authoredPhrase}`}
          cause={fold.cause}
          onUnfold={() => {
            unfoldFocusRef.current = true;
            fold.setFolded(false);
          }}
          surfaceKey="open-document"
          regionKey="approvals-head"
        />
      </div>
    );
  }

  return (
    <section
      aria-labelledby="project-approvals-title"
      data-index-region="approvals"
      data-project-approval-document
      // FID-07 — `py-6` is the region's own breathing room inside its `border-y`,
      // not a gap between roots; it was collateral of the `mt-6 … py-6` →
      // `mt-[var(--doc-region-gap)]` replacement, and without it the head and
      // the content sit flush against the region's own rules.
      className="mt-[var(--doc-region-gap)] min-w-0 border-y border-[var(--border-subtle)] py-6"
    >
      <RegionRule />
      <RegionHead
        headingId="project-approvals-title"
        name="Client approvals"
        status={headStatus}
        eyebrow="Exact artifact · named authority"
        surfaceKey="open-document"
        regionKey="approvals-head"
        actions={headLedger}
        bodyId={APPROVALS_BODY_ID}
        onFold={() => fold.setFolded(true)}
      />
      <div id={APPROVALS_BODY_ID}>
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
        </div>
      )}
      {authority && !authorityMatches && clientProfileId && (
        <div className="mt-4 border-l-2 border-[var(--color-terracotta)] pl-3">
          <p
            role="alert"
            className="text-[13px] text-[var(--color-terracotta-ink)]"
          >
            Decision authority does not match this project’s current client.
          </p>
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

          <GateCeremony label="Gate anatomy">
            <GateFieldset part="artifact">
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
              {composerArtifact && (
                <div className="mt-3">
                  <ArtifactEdges
                    title={composerArtifact.artifactTitle}
                    meta={artifactMeta(
                      composerArtifact.artifactVersion,
                      composerArtifact.artifactChecksum,
                    )}
                  />
                </div>
              )}
            </GateFieldset>

            <GateFieldset part="question">
              <div className="grid min-w-0 grid-cols-1 gap-4 min-[560px]:grid-cols-2">
                <Field label="Title" id="approval-title">
                  <input
                    id="approval-title"
                    className={INPUT}
                    value={form.title}
                    onChange={(event) =>
                      updateForm({ title: event.target.value })
                    }
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
              </div>
            </GateFieldset>

            <GateFieldset part="scope">
              <div className="grid min-w-0 grid-cols-1 gap-4">
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
                <Field label="Scope note" id="approval-context">
                  <textarea
                    id="approval-context"
                    rows={2}
                    className={INPUT}
                    placeholder="What this releases, and what it does not."
                    value={form.context}
                    onChange={(event) =>
                      updateForm({ context: event.target.value })
                    }
                  />
                </Field>
                <p className={META}>
                  The bound phase is the scope of record; the note qualifies it
                  and is never an approval response
                </p>
              </div>
            </GateFieldset>

            <GateFieldset part="impact">
              <div className="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-3">
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
            </GateFieldset>

            <GateFieldset part="authority">
              <GatePlain>{decisionLeadLine(clientName)}</GatePlain>
            </GateFieldset>

            <GateFieldset part="confirmation">
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
              <DocumentActionRow
                surfaceKey="open-document"
                regionKey="project-approval-composer"
                className="mt-3"
                aria-label="Approval draft actions"
              >
                <DocumentAction
                  actionKey="create-project-approval-draft"
                  variant="secondary"
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
            </GateFieldset>
          </GateCeremony>
        </form>
      )}

      <div className="mt-6 min-w-0 border-t border-[var(--color-pearl)] pt-4">
        <h3 className="font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          Approval record
        </h3>
        {(approvalsQuery.isLoading || authorityQuery.isLoading) && (
          <SectionLoadingLine label="Reading approvals" className="mt-3" />
        )}
        {approvalsQuery.isError && (
          <p
            role="alert"
            className="mt-3 text-[13px] text-[var(--color-terracotta-ink)]"
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
            const scope = gateScope(review, boundPhase?.name ?? null);
            const sealed = isSealed(review);
            const seal = sealFor(review);
            const predecessor = review.predecessorDecisionId
              ? approvalById.get(review.predecessorDecisionId)
              : undefined;

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
                data-gate-state={sealed ? 'sealed' : 'open'}
                tabIndex={-1}
                className="min-w-0 scroll-mt-6 border-b border-[var(--color-pearl)] py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
              >
                {sealed ? (
                  /* State B — the section folds where it stands. */
                  <>
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="min-w-0 break-words font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--color-mocha)]">
                          {review.artifactTitle}
                        </p>
                        {/* A settled gate must state which edition settled. */}
                        <p className={`mt-1 ${META}`}>
                          {artifactMeta(
                            review.artifactVersion,
                            review.artifactChecksum,
                          )}
                        </p>
                        <p className="mt-1.5 min-w-0 break-words text-[13px] leading-relaxed text-[var(--text-muted)]">
                          {scope.note ?? scope.binding}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-[3px] border px-2 py-1 font-mono text-[12px] font-semibold uppercase tracking-[0.06em] ${seal.className}`}
                      >
                        {seal.label}
                      </span>
                    </div>
                    {predecessor && (
                      <p className="mt-3">
                        <button
                          type="button"
                          onClick={() =>
                            focusApprovalRow(predecessor.decisionId)
                          }
                          className="min-h-11 font-mono text-[12px] uppercase tracking-[0.09em] text-[var(--text-muted)] underline decoration-[var(--color-aged-oak)] underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
                        >
                          Edition {predecessor.artifactVersion} superseded — view
                        </button>
                      </p>
                    )}
                  </>
                ) : (
                  /* State A — the boundary unfolded. */
                  <GateCeremony label={`${review.artifactTitle} gate`}>
                    <GatePartBlock part="artifact">
                      <ArtifactEdges
                        title={review.artifactTitle}
                        meta={artifactMeta(
                          review.artifactVersion,
                          review.artifactChecksum,
                        )}
                      />
                    </GatePartBlock>

                    <GatePartBlock part="question">
                      <GateQuestion>{review.question}</GateQuestion>
                    </GatePartBlock>

                    <GatePartBlock part="scope">
                      <GatePlain>{scope.binding}</GatePlain>
                      {scope.note && (
                        <p className="mt-1 min-w-0 break-words text-[14px] leading-relaxed text-[var(--text-muted)]">
                          {scope.note}
                        </p>
                      )}
                    </GatePartBlock>

                    <GatePartBlock part="impact">
                      <GateImpact>{formatGateImpact(review)}</GateImpact>
                    </GatePartBlock>

                    <GatePartBlock part="authority">
                      <GatePlain>{decisionLeadLine(clientName)}</GatePlain>
                      <p className={`mt-1 ${META}`}>
                        Review {review.completedReviewCount} of{' '}
                        {review.requiredReviewCount} confirmed
                      </p>
                    </GatePartBlock>

                    <GatePartBlock part="confirmation">
                      <p className={META}>
                        {review.lifecycleStatus === 'draft'
                          ? `Due ${fmtDay(review.dueAt)} once published`
                          : review.outcome
                            ? `${readableStatus(review)} · ${fmtDay(
                                review.respondedAt ?? review.updatedAt,
                              )} · awaiting a superseding edition`
                            : `Published${
                                review.sentAt ? ` ${fmtDay(review.sentAt)}` : ''
                              } · due ${fmtDay(review.dueAt)}`}
                        {review.isOverdue && !review.outcome
                          ? ' · overdue'
                          : ''}
                      </p>
                      {review.lifecycleStatus === 'draft' &&
                        !actions.publish && (
                          <p className="mt-2 text-[13px] italic text-[var(--text-muted)]">
                            Publish unlocks after every frozen reviewer has
                            confirmed the exact artifact.
                          </p>
                        )}
                      {boundPhaseCompleted &&
                        (review.lifecycleStatus === 'pending' ||
                          review.lifecycleStatus === 'responded') && (
                          <p
                            role="status"
                            className="mt-2 text-[13px] italic text-[var(--text-muted)]"
                          >
                            This approval belongs to a completed phase and
                            cannot be superseded there. Author a new approval in
                            a live phase.
                          </p>
                        )}
                      <DocumentActionRow
                        surfaceKey="open-document"
                        regionKey={`project-approval-${review.decisionId}`}
                        className="mt-2"
                        aria-label={`${review.artifactTitle} approval actions`}
                      >
                        {review.lifecycleStatus === 'draft' && (
                          <DocumentAction
                            actionKey="publish-project-approval"
                            variant="secondary"
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
                            Publish for approval
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
                    </GatePartBlock>
                  </GateCeremony>
                )}

                {sealed && (
                  <>
                    {boundPhaseCompleted && review.disposition === 'active' && (
                      <p
                        role="status"
                        className="mt-2 text-[13px] italic text-[var(--text-muted)]"
                      >
                        This approval belongs to a completed phase and cannot be
                        superseded there. Author a new approval in a live phase.
                      </p>
                    )}
                    {(actions.withdraw || actions.supersede) && (
                      <DocumentActionRow
                        surfaceKey="open-document"
                        regionKey={`project-approval-${review.decisionId}`}
                        className="mt-2"
                        aria-label={`${review.artifactTitle} approval actions`}
                      >
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
                    )}
                  </>
                )}

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

                    <GateCeremony label="Superseding gate anatomy">
                      <GateFieldset part="artifact">
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
                      </GateFieldset>

                      <GateFieldset part="question">
                        <div className="grid min-w-0 grid-cols-1 gap-3 min-[560px]:grid-cols-2">
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
                        </div>
                      </GateFieldset>

                      <GateFieldset part="scope">
                        <Field
                          label="Scope note"
                          id={`supersede-context-${review.decisionId}`}
                        >
                          <textarea
                            id={`supersede-context-${review.decisionId}`}
                            rows={2}
                            className={INPUT}
                            placeholder="What this releases, and what it does not."
                            value={supersedeState.context}
                            onChange={(event) =>
                              setSupersedeState({
                                ...supersedeState,
                                context: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <p className={`mt-2 ${META}`}>
                          {scope.binding}
                        </p>
                      </GateFieldset>

                      <GateFieldset part="impact">
                        <div className="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-3">
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
                      </GateFieldset>

                      <GateFieldset part="authority">
                        <GatePlain>{decisionLeadLine(clientName)}</GatePlain>
                      </GateFieldset>

                      <GateFieldset part="confirmation">
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
                        <DocumentActionRow
                          surfaceKey="open-document"
                          regionKey="supersede-project-approval"
                          className="mt-2"
                          aria-label="Supersession actions"
                        >
                          <DocumentAction
                            actionKey="confirm-supersede-project-approval"
                            variant="secondary"
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
                      </GateFieldset>
                    </GateCeremony>
                  </form>
                )}
              </li>
            );
          })}
        </ol>
      </div>
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
