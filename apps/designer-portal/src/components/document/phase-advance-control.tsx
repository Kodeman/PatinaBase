'use client';

/**
 * Project phase actions live beside the shared schedule mount because both the
 * legacy Timeline and the Rule/Spine render the same project lifecycle.
 *
 * The database owns the phase graph. This component deliberately does not
 * sort phases or infer successors from display lanes: direct edges may branch
 * and may cross main/thread labels. It sends only the target phase and expected
 * transition, then renders every successor in the authoritative RPC receipt.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  type CoordinationItem,
  type Database,
  type ProjectPhaseTransitionReceipt,
  useCoordinationItems,
  useUpdateProjectPhaseStatus,
} from '@patina/supabase';
import { DocumentAction, DocumentActionGroup } from './document-action';

type PhaseRow = Database['public']['Tables']['project_phases']['Row'];

type ActivePhaseAction = {
  phase: PhaseRow;
  predecessor: PhaseRow | null;
  blockers: CoordinationItem[];
};

function isRuntimePhaseBlocker(item: CoordinationItem, phaseId: string) {
  return (
    item.phase_id === phaseId &&
    item.status === 'pending' &&
    (item.blocks_kind === 'phase' || item.blocking_status === 'blocks_phase')
  );
}

/**
 * Preserve server order and derive chain context only from follows_phase_id.
 * sort_order is presentation metadata and cannot establish lifecycle topology.
 */
export function deriveActivePhaseActions(
  rows: readonly PhaseRow[],
  coordinationItems: readonly CoordinationItem[] = [],
): ActivePhaseAction[] {
  const phasesById = new Map(rows.map((phase) => [phase.id, phase]));

  return rows
    .filter(
      (phase) =>
        phase.status === 'in_progress' || phase.status === 'delayed',
    )
    .map((phase) => ({
      phase,
      predecessor: phase.follows_phase_id
        ? (phasesById.get(phase.follows_phase_id) ?? null)
        : null,
      blockers: coordinationItems.filter((item) =>
        isRuntimePhaseBlocker(item, phase.id),
      ),
    }));
}

type PhaseNotice = { kind: 'success' | 'error'; message: string };

function noticeForReceipt(
  action: ActivePhaseAction,
  receipt: ProjectPhaseTransitionReceipt,
  phasesById: ReadonlyMap<string, PhaseRow>,
): PhaseNotice {
  const completing = action.phase.status === 'in_progress';

  if (!completing) {
    if (
      receipt.completed_phase_id !== null ||
      receipt.next_phase_ids.length !== 1 ||
      receipt.next_phase_ids[0] !== action.phase.id
    ) {
      return {
        kind: 'error',
        message:
          'The server returned an invalid resume receipt. Refresh the schedule before trying again.',
      };
    }

    return {
      kind: 'success',
      message: `${action.phase.name} is back in progress.`,
    };
  }

  const coherentCompletionReceipt =
    receipt.completed_phase_id === action.phase.id &&
    receipt.terminal === (receipt.next_phase_ids.length === 0);

  if (!coherentCompletionReceipt) {
    return {
      kind: 'error',
      message:
        'The server returned an invalid completion receipt. Refresh the schedule before trying again.',
    };
  }

  if (receipt.terminal) {
    return {
      kind: 'success',
      message: `${action.phase.name} is complete. No direct phases follow it.`,
    };
  }

  const successorNames = receipt.next_phase_ids
    .map((phaseId) => phasesById.get(phaseId)?.name)
    .filter((name): name is string => Boolean(name));
  const namesAreComplete =
    successorNames.length === receipt.next_phase_ids.length;

  if (receipt.next_phase_ids.length === 1) {
    return {
      kind: 'success',
      message: namesAreComplete
        ? `${action.phase.name} is complete. ${successorNames[0]} is now in progress.`
        : `${action.phase.name} is complete. Its direct next phase is now in progress.`,
    };
  }

  const finalName = successorNames.at(-1);
  const precedingNames = successorNames.slice(0, -1);
  const successorLabel = namesAreComplete
    ? `${precedingNames.join(', ')}${precedingNames.length > 0 ? ' and ' : ''}${finalName}`
    : `${receipt.next_phase_ids.length} direct phases`;

  return {
    kind: 'success',
    message: `${action.phase.name} is complete. ${successorLabel} are now in progress.`,
  };
}

function errorMessage(error: unknown) {
  const raw =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim()
      ? error.message.toLowerCase()
      : '';

  if (raw.includes('unresolved phase blocker')) {
    return 'This phase still has open blockers. Resolve them in Coordination, then try again.';
  }
  if (raw.includes('canonical successor is missing')) {
    return 'This schedule is not connected after this phase. Choose and connect the exact next phase, then try again.';
  }
  if (raw.includes('cross-project handoff is unsupported')) {
    return 'A phase here is connected to a phase in another project. Make it an independent root, then reconnect it inside this project if needed.';
  }
  if (raw.includes('successor is ambiguous')) {
    return 'More than one phase is connected next. Repair the schedule so this phase has one exact successor.';
  }
  if (raw.includes('canonical successor chain is cyclic')) {
    return 'The schedule contains a loop. Repair the phase connections before completing this phase.';
  }
  if (raw.includes('predecessor phases must be completed')) {
    return 'An earlier phase in this schedule is still open. Complete or repair that predecessor before this handoff.';
  }
  if (raw.includes('successor phases must be pending')) {
    return 'A later phase in this schedule has already started or closed. Review the phase statuses before this handoff.';
  }
  if (
    raw.includes('status changed') ||
    raw.includes('phase changed during') ||
    raw.includes('successor changed during') ||
    raw.includes('project pointer update failed')
  ) {
    return 'The schedule changed while this handoff was running. Refresh it before trying again.';
  }
  if (raw.includes('project is not active')) {
    return 'Only an active project can move between phases.';
  }
  if (
    raw.includes('project not found or access denied') ||
    raw.includes('phase does not belong to project')
  ) {
    return 'This phase is no longer available to change. Refresh the project or ask its owner for access.';
  }
  if (raw.includes('authenticated user') || raw.includes('jwt')) {
    return 'Your session could not be verified. Sign in again before changing this phase.';
  }
  if (
    raw.includes('failed to fetch') ||
    raw.includes('network') ||
    raw.includes('load failed')
  ) {
    return 'Patina could not reach the server. Check your connection and try again.';
  }

  return 'The server rejected this phase handoff. Refresh the schedule and try again.';
}

function laneLabel(lane: string) {
  if (lane === 'main') return 'Main lane';
  if (lane === 'thread') return 'Thread lane';
  if (!lane) return 'Phase lane';
  return `${lane.charAt(0).toUpperCase()}${lane.slice(1)} lane`;
}

const shellCls =
  'mb-5 border-y border-[var(--color-pearl)] py-3 text-[var(--color-charcoal)]';

function PhaseActionRow({
  action,
  disabled,
  pending,
  notice,
  onTransition,
}: {
  action: ActivePhaseAction;
  disabled: boolean;
  pending: boolean;
  notice: PhaseNotice | null;
  onTransition: (action: ActivePhaseAction) => void;
}) {
  const descriptionId = useId();
  const phaseHeadingId = useId();
  const completing = action.phase.status === 'in_progress';
  const lane = laneLabel(action.phase.lane);
  const actionLabel = `${completing ? 'Complete' : 'Resume'} ${action.phase.name} (${lane.toLowerCase()})`;

  return (
    <li
      aria-labelledby={phaseHeadingId}
      aria-busy={pending || undefined}
      className="flex flex-col items-start justify-between gap-3 border-t border-[var(--color-pearl)] py-3 first:border-t-0 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <div className="min-w-0">
        <h4 id={phaseHeadingId} className="text-[12px] font-semibold">
          {action.phase.name}
        </h4>
        <p
          id={descriptionId}
          className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]"
        >
          {lane} · {completing ? 'In progress' : 'Delayed'}
          {action.predecessor ? ` · Follows ${action.predecessor.name}` : ''}
        </p>

        {action.phase.gate_condition ? (
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
            <b>Configured gate note ·</b> {action.phase.gate_condition}
          </p>
        ) : null}

        {action.blockers.length > 0 ? (
          <div
            role="note"
            aria-label={`Open blockers for ${action.phase.name}`}
            className="mt-1 text-[11px] leading-relaxed text-[var(--color-terracotta-ink)]"
          >
            <b>Open phase blockers ·</b>{' '}
            {action.blockers.map((blocker) => blocker.title).join(' · ')}
          </div>
        ) : null}
      </div>

      <DocumentActionGroup
        surfaceKey="open-document"
        regionKey="phase-handoff"
        aria-label={`${action.phase.name} phase actions`}
        className="shrink-0"
      >
        <DocumentAction
          actionKey={
            completing ? 'complete-project-phase' : 'resume-project-phase'
          }
          variant="primary"
          aria-label={actionLabel}
          aria-describedby={descriptionId}
          disabled={disabled}
          loading={pending}
          loadingLabel={completing ? 'Completing…' : 'Resuming…'}
          onClick={() => onTransition(action)}
        >
          {completing ? 'Complete phase' : 'Resume phase'}
        </DocumentAction>
      </DocumentActionGroup>

      {pending ? (
        <p
          role="status"
          aria-live="polite"
          className="basis-full text-[11px] text-[var(--text-muted)]"
        >
          {completing
            ? `Completing ${action.phase.name}…`
            : `Resuming ${action.phase.name}…`}
        </p>
      ) : null}
      {notice ? (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          aria-live={notice.kind === 'success' ? 'polite' : undefined}
          className={`basis-full text-[11px] ${
            notice.kind === 'error'
              ? 'text-[var(--color-terracotta-ink)]'
              : 'text-[var(--color-sage)]'
          }`}
        >
          {notice.message}
        </p>
      ) : null}
    </li>
  );
}

export function PhaseAdvanceControl({
  projectId,
  phases,
}: {
  projectId: string;
  phases: readonly PhaseRow[] | undefined;
}) {
  const headingId = useId();
  const updatePhase = useUpdateProjectPhaseStatus();
  const coordination = useCoordinationItems(projectId);
  const pendingPhaseRef = useRef<string | null>(null);
  const [pendingPhaseId, setPendingPhaseId] = useState<string | null>(null);
  const [noticeByPhase, setNoticeByPhase] = useState<
    Record<string, PhaseNotice | undefined>
  >({});

  const actions = useMemo(
    () =>
      phases
        ? deriveActivePhaseActions(phases, coordination.data ?? [])
        : null,
    [coordination.data, phases],
  );
  const phasesById = useMemo(
    () => new Map((phases ?? []).map((phase) => [phase.id, phase])),
    [phases],
  );
  const authoritativePhaseSignature = JSON.stringify(phases ?? 'loading');
  const authorityKey = `${projectId}:${authoritativePhaseSignature}`;
  const authorityKeyRef = useRef(authorityKey);
  authorityKeyRef.current = authorityKey;

  useEffect(() => {
    pendingPhaseRef.current = null;
    setPendingPhaseId(null);
    setNoticeByPhase({});
  }, [authoritativePhaseSignature, projectId]);

  if (actions == null) {
    return (
      <section aria-label="Phase handoffs" aria-busy className={shellCls}>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Reading phase handoffs…
        </p>
      </section>
    );
  }

  if (actions.length === 0) {
    return (
      <section aria-label="Phase handoffs" className={shellCls}>
        <p role="status" className="text-[12px] text-[var(--text-muted)]">
          No active phase handoffs need attention.
        </p>
      </section>
    );
  }

  const transitionPending = pendingPhaseId !== null || updatePhase.isPending;

  const handleTransition = (action: ActivePhaseAction) => {
    if (pendingPhaseRef.current !== null || updatePhase.isPending) return;

    const phaseId = action.phase.id;
    const completing = action.phase.status === 'in_progress';
    const requestAuthorityKey = authorityKey;
    pendingPhaseRef.current = phaseId;
    setPendingPhaseId(phaseId);
    setNoticeByPhase((current) => ({ ...current, [phaseId]: undefined }));

    updatePhase.mutate(
      {
        phaseId,
        projectId,
        status: completing ? 'completed' : 'in_progress',
      },
      {
        onSuccess: (receipt) => {
          pendingPhaseRef.current = null;
          setPendingPhaseId(null);
          if (authorityKeyRef.current !== requestAuthorityKey) return;

          setNoticeByPhase((current) => ({
            ...current,
            [phaseId]: noticeForReceipt(action, receipt, phasesById),
          }));
        },
        onError: (error) => {
          pendingPhaseRef.current = null;
          setPendingPhaseId(null);
          if (authorityKeyRef.current !== requestAuthorityKey) return;

          setNoticeByPhase((current) => ({
            ...current,
            [phaseId]: { kind: 'error', message: errorMessage(error) },
          }));
        },
      },
    );
  };

  return (
    <section aria-labelledby={headingId} className={shellCls}>
      <h3
        id={headingId}
        className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]"
      >
        Phase handoffs
      </h3>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
        Completing a phase activates every direct follower in the project
        graph. The server verifies blockers and the exact transition.
      </p>

      <ul className="mt-2">
        {actions.map((action) => (
          <PhaseActionRow
            key={action.phase.id}
            action={action}
            disabled={transitionPending}
            pending={pendingPhaseId === action.phase.id}
            notice={noticeByPhase[action.phase.id] ?? null}
            onTransition={handleTransition}
          />
        ))}
      </ul>
    </section>
  );
}
