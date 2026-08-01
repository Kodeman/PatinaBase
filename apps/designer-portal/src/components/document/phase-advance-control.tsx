'use client';

/**
 * Project phase actions live beside the shared schedule mount because both the
 * legacy Timeline and the Rule/Spine render the same project lifecycle.
 *
 * The database owns the phase graph. This component deliberately does not
 * sort phases, select a successor, or require one globally active phase: main
 * and thread lanes can progress independently. It sends only the target phase
 * and expected transition, then renders the authoritative RPC receipt.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  type CoordinationItem,
  type Database,
  type ProjectPhaseTransitionReceipt,
  useCoordinationItems,
  useUpdateProjectPhaseChain,
  useUpdateProjectPhaseStatus,
} from '@patina/supabase';
import { DocumentAction, DocumentActionGroup } from './document-action';

type PhaseRow = Database['public']['Tables']['project_phases']['Row'];

type ActivePhaseAction = {
  phase: PhaseRow;
  predecessor: PhaseRow | null;
  blockers: CoordinationItem[];
  topologyIssue: PhaseTopologyIssue | null;
};

type PhaseTopologyIssue = {
  kind:
    | 'ambiguous'
    | 'cross-lane'
    | 'cyclic'
    | 'dangling'
    | 'missing'
    | 'predecessor-not-completed'
    | 'successor-not-pending';
  message: string;
  repairAfter: PhaseRow | null;
  repairCandidates: PhaseRow[];
  disconnectPhase: PhaseRow | null;
  disconnectParent: PhaseRow | null;
};

const UNFINISHED_PHASE_STATUSES = new Set([
  'pending',
  'in_progress',
  'delayed',
]);

function isRuntimePhaseBlocker(item: CoordinationItem, phaseId: string) {
  return (
    item.phase_id === phaseId &&
    item.status === 'pending' &&
    (item.blocks_kind === 'phase' || item.blocking_status === 'blocks_phase')
  );
}

function threadComponent(rows: readonly PhaseRow[], targetId: string) {
  const rowById = new Map(rows.map((phase) => [phase.id, phase]));
  const componentIds = new Set([targetId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const phase of rows) {
      const predecessor = phase.follows_phase_id
        ? rowById.get(phase.follows_phase_id)
        : null;
      if (
        (phase.follows_phase_id && componentIds.has(phase.follows_phase_id)) ||
        (predecessor && componentIds.has(phase.id))
      ) {
        if (!componentIds.has(phase.id)) {
          componentIds.add(phase.id);
          changed = true;
        }
        if (predecessor && !componentIds.has(predecessor.id)) {
          componentIds.add(predecessor.id);
          changed = true;
        }
      }
    }
  }

  return rows.filter((phase) => componentIds.has(phase.id));
}

function isSafePendingLinearRoot(
  root: PhaseRow,
  sameLane: readonly PhaseRow[],
) {
  if (root.status !== 'pending' || root.follows_phase_id !== null) return false;

  const childrenByPredecessor = new Map<string, PhaseRow[]>();
  for (const phase of sameLane) {
    if (!phase.follows_phase_id) continue;
    const children = childrenByPredecessor.get(phase.follows_phase_id) ?? [];
    children.push(phase);
    childrenByPredecessor.set(phase.follows_phase_id, children);
  }

  const visited = new Set<string>();
  let cursor: PhaseRow | undefined = root;
  while (cursor) {
    if (visited.has(cursor.id) || cursor.status !== 'pending') return false;
    visited.add(cursor.id);
    const followers: PhaseRow[] = childrenByPredecessor.get(cursor.id) ?? [];
    if (followers.length > 1) return false;
    cursor = followers[0];
  }
  return true;
}

/**
 * Mirror the server's exact-edge topology checks without inventing an order.
 * Main phases are one trunk, so an unfinished disconnected root needs an
 * explicit repair. Thread roots are independent components: only the target's
 * connected component participates in its handoff.
 */
export function phaseTopologyIssue(
  target: PhaseRow,
  rows: readonly PhaseRow[],
): PhaseTopologyIssue | null {
  if (target.status !== 'in_progress' && target.status !== 'delayed')
    return null;

  const sameLane = rows.filter((phase) => phase.lane === target.lane);
  const targetComponent = threadComponent(sameLane, target.id);
  const targetComponentIds = new Set(targetComponent.map((phase) => phase.id));
  const childrenByPredecessor = new Map<string, PhaseRow[]>();

  for (const phase of targetComponent) {
    if (!phase.follows_phase_id) continue;
    const children = childrenByPredecessor.get(phase.follows_phase_id) ?? [];
    children.push(phase);
    childrenByPredecessor.set(phase.follows_phase_id, children);
  }

  for (const [predecessorId, followers] of childrenByPredecessor) {
    if (followers.length > 1) {
      const predecessor = targetComponent.find(
        (phase) => phase.id === predecessorId,
      );
      return {
        kind: 'ambiguous',
        message: `${predecessor?.name ?? 'A phase'} has more than one next phase. Open the schedule and leave one exact successor before this handoff.`,
        repairAfter: null,
        repairCandidates: [],
        disconnectPhase: null,
        disconnectParent: null,
      };
    }
  }

  // A one-predecessor graph can still loop. Walk every component row so a loop
  // above the active phase is caught as well as one below it.
  const phaseById = new Map(targetComponent.map((phase) => [phase.id, phase]));
  for (const start of targetComponent) {
    const path = new Set<string>();
    let cursor: PhaseRow | undefined = start;
    while (cursor) {
      if (path.has(cursor.id)) {
        return {
          kind: 'cyclic',
          message:
            'This phase chain contains a loop. Open the schedule and repair its connections before this handoff.',
          repairAfter: null,
          repairCandidates: [],
          disconnectPhase: null,
          disconnectParent: null,
        };
      }
      path.add(cursor.id);
      cursor = cursor.follows_phase_id
        ? phaseById.get(cursor.follows_phase_id)
        : undefined;
    }
  }

  // Every same-component predecessor must already be complete. A cross-lane
  // follows edge is a component boundary, never a lifecycle predecessor.
  let predecessor = target.follows_phase_id
    ? phaseById.get(target.follows_phase_id)
    : undefined;
  while (predecessor) {
    if (predecessor.status !== 'completed') {
      return {
        kind: 'predecessor-not-completed',
        message: `${predecessor.name} comes before ${target.name} but is not complete. Review that phase before this handoff.`,
        repairAfter: null,
        repairCandidates: [],
        disconnectPhase: null,
        disconnectParent: null,
      };
    }
    predecessor = predecessor.follows_phase_id
      ? phaseById.get(predecessor.follows_phase_id)
      : undefined;
  }

  let tail = target;
  while (true) {
    const successor = (childrenByPredecessor.get(tail.id) ?? [])[0];
    if (!successor) break;
    if (successor.status !== 'pending') {
      return {
        kind: 'successor-not-pending',
        message: `${successor.name} follows ${tail.name} but is not pending. Review its status before moving ${target.name}.`,
        repairAfter: null,
        repairCandidates: [],
        disconnectPhase: null,
        disconnectParent: null,
      };
    }
    tail = successor;
  }

  // Main is one trunk: every unfinished main row must belong to the target's
  // connected component. Thread roots remain independent and are intentionally
  // excluded from this missing-edge check.
  const disconnected = (target.lane === 'main' ? sameLane : []).filter(
    (phase) =>
      phase.id !== target.id &&
      UNFINISHED_PHASE_STATUSES.has(phase.status) &&
      !targetComponentIds.has(phase.id),
  );

  if (disconnected.length > 0) {
    const repairCandidates = disconnected.filter((phase) =>
      isSafePendingLinearRoot(phase, sameLane),
    );
    const count = disconnected.length;
    return {
      kind: 'missing',
      message:
        repairCandidates.length > 0
          ? `${count} unfinished ${laneLabel(target.lane).toLowerCase()} phase${count === 1 ? ' is' : 's are'} not connected after ${tail.name}. Choose the exact next root below; Patina will not guess from display order or dates.`
          : `${count} unfinished ${laneLabel(target.lane).toLowerCase()} phase${count === 1 ? ' is' : 's are'} outside this chain, but none is a safe pending root to connect here. Review the schedule’s exact dependencies; Patina will not overwrite history or guess an order.`,
      repairAfter: tail,
      repairCandidates,
      disconnectPhase: null,
      disconnectParent: null,
    };
  }

  return null;
}

/** Project-global integrity gate run by the RPC before target-component checks. */
export function projectPhaseGraphIssue(
  rows: readonly PhaseRow[],
): PhaseTopologyIssue | null {
  const phaseById = new Map(rows.map((phase) => [phase.id, phase]));

  for (const phase of rows) {
    if (!phase.follows_phase_id) continue;
    const parent = phaseById.get(phase.follows_phase_id);
    if (!parent) {
      return {
        kind: 'dangling',
        message: `${phase.name} points to a phase outside this project. Clear that invalid dependency before any phase handoff.`,
        repairAfter: null,
        repairCandidates: [],
        disconnectPhase: phase,
        disconnectParent: null,
      };
    }
    if (parent.lane !== phase.lane) {
      return {
        kind: 'cross-lane',
        message: `${phase.name} (${laneLabel(phase.lane).toLowerCase()}) follows ${parent.name} (${laneLabel(parent.lane).toLowerCase()}). Cross-lane handoffs are unsupported; make it an independent root before any phase handoff.`,
        repairAfter: null,
        repairCandidates: [],
        disconnectPhase: phase,
        disconnectParent: parent,
      };
    }
  }

  return null;
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
      (phase) => phase.status === 'in_progress' || phase.status === 'delayed',
    )
    .map((phase) => ({
      phase,
      predecessor: phase.follows_phase_id
        ? (phasesById.get(phase.follows_phase_id) ?? null)
        : null,
      blockers: coordinationItems.filter((item) =>
        isRuntimePhaseBlocker(item, phase.id),
      ),
      topologyIssue: phaseTopologyIssue(phase, rows),
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
      receipt.next_phase_id !== action.phase.id ||
      receipt.terminal
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

  const coherentTerminalReceipt =
    receipt.completed_phase_id === action.phase.id &&
    receipt.next_phase_id === null &&
    receipt.terminal;
  const coherentSuccessorReceipt =
    receipt.completed_phase_id === action.phase.id &&
    receipt.next_phase_id !== null &&
    !receipt.terminal;

  if (!coherentTerminalReceipt && !coherentSuccessorReceipt) {
    return {
      kind: 'error',
      message:
        'The server returned an invalid completion receipt. Refresh the schedule before trying again.',
    };
  }

  if (receipt.terminal) {
    return {
      kind: 'success',
      message: `${action.phase.name} is complete. Its lane is now complete.`,
    };
  }

  const successor = receipt.next_phase_id
    ? phasesById.get(receipt.next_phase_id)
    : null;

  return {
    kind: 'success',
    message: successor
      ? `${action.phase.name} is complete. ${successor.name} is now in progress in this lane.`
      : `${action.phase.name} is complete. The server advanced this lane to its canonical next phase.`,
  };
}

export function phaseTransitionErrorMessage(error: unknown) {
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
  if (raw.includes('cross-lane handoff is unsupported')) {
    return 'A phase is connected across the main and thread lanes. Make it an independent root, then reconnect it within the correct lane if needed.';
  }
  if (
    raw.includes('references another project') ||
    raw.includes('outside this project') ||
    raw.includes('dangling')
  ) {
    return 'A phase points outside this project’s schedule. Clear that invalid connection before trying again.';
  }
  if (raw.includes('canonical successor is ambiguous')) {
    return 'More than one phase is connected next. Repair the schedule so this phase has one exact successor.';
  }
  if (raw.includes('canonical successor chain is cyclic')) {
    return 'The schedule contains a loop. Repair the phase connections before completing this phase.';
  }
  if (raw.includes('canonical successor is not pending')) {
    return 'The next phase is not ready to begin. Refresh the schedule and review its status.';
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
  blockersChecking,
  blockersFailed,
  connectionPending,
  externalDescriptionId,
  onTransition,
  onConnect,
}: {
  action: ActivePhaseAction;
  disabled: boolean;
  pending: boolean;
  blockersChecking: boolean;
  blockersFailed: boolean;
  connectionPending: boolean;
  externalDescriptionId?: string;
  onTransition: (action: ActivePhaseAction) => void;
  onConnect: (action: ActivePhaseAction, successorId: string) => void;
}) {
  const descriptionId = useId();
  const phaseHeadingId = useId();
  const blockerListId = useId();
  const blockerCheckId = useId();
  const blockerFailureId = useId();
  const topologyIssueId = useId();
  const completing = action.phase.status === 'in_progress';
  const lane = laneLabel(action.phase.lane);
  const actionLabel = `${completing ? 'Complete' : 'Resume'} ${action.phase.name} (${lane.toLowerCase()})`;
  const [selectedSuccessorId, setSelectedSuccessorId] = useState('');
  const selectedSuccessor = action.topologyIssue?.repairCandidates.find(
    (phase) => phase.id === selectedSuccessorId,
  );
  const transitionBlocked =
    action.topologyIssue !== null ||
    (completing &&
      (blockersChecking || blockersFailed || action.blockers.length > 0));
  const describedBy = [
    descriptionId,
    action.blockers.length > 0 ? blockerListId : null,
    completing && blockersChecking ? blockerCheckId : null,
    completing && blockersFailed ? blockerFailureId : null,
    action.topologyIssue ? topologyIssueId : null,
    externalDescriptionId,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li
      aria-labelledby={phaseHeadingId}
      aria-busy={pending || connectionPending || undefined}
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
            id={blockerListId}
            role="note"
            aria-label={`Open blockers for ${action.phase.name}`}
            className="mt-1 text-[11px] leading-relaxed text-[var(--color-terracotta)]"
          >
            <b>Open phase blockers ·</b>{' '}
            {action.blockers.map((blocker) => blocker.title).join(' · ')}.
            Resolve these in Coordination before completing the phase.
          </div>
        ) : null}

        {completing && blockersChecking ? (
          <p
            id={blockerCheckId}
            role="status"
            className="mt-1 text-[11px] text-[var(--text-muted)]"
          >
            Checking open phase blockers before completion…
          </p>
        ) : null}

        {completing && blockersFailed ? (
          <p
            id={blockerFailureId}
            role="alert"
            className="mt-1 text-[11px] text-[var(--color-terracotta)]"
          >
            Phase blockers could not be checked. Check again before completing
            this phase.
          </p>
        ) : null}

        {action.topologyIssue ? (
          <div
            id={topologyIssueId}
            role="note"
            aria-label={`Schedule connection needed for ${action.phase.name}`}
            className="mt-2 border-l-2 border-[var(--color-terracotta)] pl-3 text-[11px] leading-relaxed text-[var(--color-charcoal)]"
          >
            <p>
              <b>Schedule connection needed ·</b> {action.topologyIssue.message}
            </p>
            {action.topologyIssue.kind === 'missing' &&
            action.topologyIssue.repairAfter &&
            action.topologyIssue.repairCandidates.length > 0 ? (
              <div className="mt-2 flex flex-col items-start gap-2 sm:flex-row sm:items-end">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
                    Exact phase after {action.topologyIssue.repairAfter.name}
                  </span>
                  <select
                    value={selectedSuccessorId}
                    onChange={(event) =>
                      setSelectedSuccessorId(event.target.value)
                    }
                    aria-label={`Next phase after ${action.topologyIssue.repairAfter.name}`}
                    disabled={connectionPending}
                    className="min-h-11 w-full rounded-[4px] border border-[var(--color-pearl)] bg-white px-3 text-[12px] text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] disabled:opacity-50"
                  >
                    <option value="">Choose an unlinked root…</option>
                    {action.topologyIssue.repairCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name} · {candidate.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
                <DocumentAction
                  actionKey="connect-next-project-phase"
                  surfaceKey="open-document"
                  regionKey="phase-topology-repair"
                  variant="secondary"
                  disabled={disabled || !selectedSuccessor}
                  loading={connectionPending}
                  loadingLabel="Connecting…"
                  aria-label={
                    selectedSuccessor
                      ? `Connect ${selectedSuccessor.name} after ${action.topologyIssue.repairAfter.name}`
                      : 'Connect selected next phase'
                  }
                  onClick={() =>
                    selectedSuccessor && onConnect(action, selectedSuccessor.id)
                  }
                >
                  Connect selected phase
                </DocumentAction>
              </div>
            ) : null}
            {selectedSuccessor && action.topologyIssue.repairAfter ? (
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                Confirming changes the schedule dependency:{' '}
                {selectedSuccessor.name} will follow{' '}
                {action.topologyIssue.repairAfter.name}.
              </p>
            ) : null}
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
          aria-describedby={describedBy}
          disabled={disabled || transitionBlocked}
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
  const globalTopologyIssueId = useId();
  const updatePhase = useUpdateProjectPhaseStatus();
  const updateChain = useUpdateProjectPhaseChain();
  const coordination = useCoordinationItems(projectId);
  const pendingPhaseRef = useRef<string | null>(null);
  const [pendingPhaseId, setPendingPhaseId] = useState<string | null>(null);
  const [pendingConnectionPhaseId, setPendingConnectionPhaseId] = useState<
    string | null
  >(null);
  const [notice, setNotice] = useState<PhaseNotice | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const actions = useMemo(
    () =>
      phases ? deriveActivePhaseActions(phases, coordination.data ?? []) : null,
    [coordination.data, phases],
  );
  const phasesById = useMemo(
    () => new Map((phases ?? []).map((phase) => [phase.id, phase])),
    [phases],
  );
  const globalTopologyIssue = useMemo(
    () => (phases ? projectPhaseGraphIssue(phases) : null),
    [phases],
  );
  const authoritativePhaseSignature = JSON.stringify(phases ?? 'loading');
  const authorityKey = `${projectId}:${authoritativePhaseSignature}`;
  const authorityKeyRef = useRef(authorityKey);
  authorityKeyRef.current = authorityKey;

  useEffect(() => {
    pendingPhaseRef.current = null;
    setPendingPhaseId(null);
    setPendingConnectionPhaseId(null);
    setNotice((current) => (current?.kind === 'success' ? current : null));
  }, [authoritativePhaseSignature]);

  useEffect(() => {
    setNotice(null);
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, [projectId]);

  const publishNotice = (next: PhaseNotice) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice(next);
    if (next.kind === 'success') {
      noticeTimerRef.current = setTimeout(() => setNotice(null), 10_000);
    }
  };

  if (actions == null) {
    return (
      <section aria-label="Phase handoffs" aria-busy className={shellCls}>
        <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Reading phase handoffs…
        </p>
      </section>
    );
  }

  const hasCompletionActions = actions.some(
    (action) => action.phase.status === 'in_progress',
  );
  const blockersChecking = Boolean(
    hasCompletionActions &&
    !coordination.isError &&
    (coordination.isLoading ||
      coordination.isPending ||
      coordination.data === undefined),
  );
  const blockersFailed = hasCompletionActions && coordination.isError;
  const transitionPending =
    pendingPhaseId !== null ||
    pendingConnectionPhaseId !== null ||
    updatePhase.isPending ||
    updateChain.isPending;

  const handleTransition = (action: ActivePhaseAction) => {
    if (pendingPhaseRef.current !== null || transitionPending) return;

    if (globalTopologyIssue) return;
    if (action.topologyIssue) return;
    if (
      action.phase.status === 'in_progress' &&
      (blockersChecking || blockersFailed || action.blockers.length > 0)
    ) {
      return;
    }

    const phaseId = action.phase.id;
    const completing = action.phase.status === 'in_progress';
    const requestAuthorityKey = authorityKey;
    pendingPhaseRef.current = phaseId;
    setPendingPhaseId(phaseId);
    setNotice(null);

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

          publishNotice(noticeForReceipt(action, receipt, phasesById));
        },
        onError: (error) => {
          pendingPhaseRef.current = null;
          setPendingPhaseId(null);
          if (authorityKeyRef.current !== requestAuthorityKey) return;

          publishNotice({
            kind: 'error',
            message: phaseTransitionErrorMessage(error),
          });
        },
      },
    );
  };

  const handleConnect = (action: ActivePhaseAction, successorId: string) => {
    const repairAfter = action.topologyIssue?.repairAfter;
    const successor = action.topologyIssue?.repairCandidates.find(
      (phase) => phase.id === successorId,
    );
    if (!repairAfter || !successor || transitionPending) return;

    setNotice(null);
    setPendingConnectionPhaseId(action.phase.id);
    updateChain.mutate(
      {
        phaseId: successor.id,
        projectId,
        followsPhaseId: repairAfter.id,
      },
      {
        onSuccess: () => {
          setPendingConnectionPhaseId(null);
          publishNotice({
            kind: 'success',
            message: `${successor.name} now follows ${repairAfter.name}. Review any remaining schedule connections before completing the phase.`,
          });
        },
        onError: () => {
          setPendingConnectionPhaseId(null);
          publishNotice({
            kind: 'error',
            message:
              'The schedule connection could not be saved. Refresh the schedule and try again.',
          });
        },
      },
    );
  };

  const handleDisconnect = (issue: PhaseTopologyIssue) => {
    const phase = issue.disconnectPhase;
    if (!phase || transitionPending) return;

    setNotice(null);
    setPendingConnectionPhaseId(phase.id);
    updateChain.mutate(
      {
        phaseId: phase.id,
        projectId,
        followsPhaseId: null,
      },
      {
        onSuccess: () => {
          setPendingConnectionPhaseId(null);
          publishNotice({
            kind: 'success',
            message: `${phase.name} is now an independent ${laneLabel(phase.lane).toLowerCase()} root. Review the schedule before moving this phase.`,
          });
        },
        onError: () => {
          setPendingConnectionPhaseId(null);
          publishNotice({
            kind: 'error',
            message:
              'The invalid schedule connection could not be cleared. Refresh the schedule and try again.',
          });
        },
      },
    );
  };

  return (
    <section aria-labelledby={headingId} className={shellCls}>
      <h3
        id={headingId}
        className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]"
      >
        Phase handoffs
      </h3>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
        Each active lane advances independently. The server verifies blockers
        and chooses the canonical next phase.
      </p>

      {blockersFailed ? (
        <div className="mt-2 flex flex-wrap items-center gap-2" role="alert">
          <span className="text-[11px] text-[var(--color-terracotta)]">
            Phase blockers could not be checked. Completion is paused.
          </span>
          <DocumentAction
            actionKey="retry-phase-blocker-check"
            surfaceKey="open-document"
            regionKey="phase-handoff"
            variant="secondary"
            loading={coordination.isFetching}
            loadingLabel="Checking…"
            onClick={() => void coordination.refetch()}
          >
            Check blockers again
          </DocumentAction>
        </div>
      ) : null}

      {globalTopologyIssue?.disconnectPhase ? (
        <div
          id={globalTopologyIssueId}
          role="note"
          aria-label="Project schedule connection issue"
          className="mt-2 border-l-2 border-[var(--color-terracotta)] pl-3 text-[11px] leading-relaxed text-[var(--color-charcoal)]"
        >
          <p>
            <b>Every phase handoff is paused ·</b> {globalTopologyIssue.message}
          </p>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">
            Confirming changes the schedule dependency:{' '}
            {globalTopologyIssue.disconnectPhase.name} will become an
            independent{' '}
            {laneLabel(globalTopologyIssue.disconnectPhase.lane).toLowerCase()}{' '}
            root.
          </p>
          <DocumentAction
            actionKey="clear-invalid-project-phase-connection"
            surfaceKey="open-document"
            regionKey="phase-topology-repair"
            variant="secondary"
            disabled={transitionPending}
            loading={
              pendingConnectionPhaseId ===
              globalTopologyIssue.disconnectPhase.id
            }
            loadingLabel="Disconnecting…"
            aria-label={
              globalTopologyIssue.disconnectParent
                ? `Disconnect ${globalTopologyIssue.disconnectPhase.name} from ${globalTopologyIssue.disconnectParent.name}`
                : `Clear invalid connection for ${globalTopologyIssue.disconnectPhase.name}`
            }
            onClick={() => handleDisconnect(globalTopologyIssue)}
          >
            Make independent root
          </DocumentAction>
        </div>
      ) : null}

      {notice ? (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          aria-live={notice.kind === 'success' ? 'polite' : undefined}
          className={`mt-2 text-[11px] ${
            notice.kind === 'error'
              ? 'text-[var(--color-terracotta)]'
              : 'text-[var(--color-sage)]'
          }`}
        >
          {notice.message}
        </p>
      ) : null}

      {actions.length === 0 ? (
        <p
          role={notice ? undefined : 'status'}
          className="mt-2 text-[12px] text-[var(--text-muted)]"
        >
          No active phase handoffs need attention.
        </p>
      ) : (
        <ul className="mt-2">
          {actions.map((action) => (
            <PhaseActionRow
              key={action.phase.id}
              action={action}
              disabled={transitionPending || globalTopologyIssue !== null}
              pending={pendingPhaseId === action.phase.id}
              blockersChecking={blockersChecking}
              blockersFailed={blockersFailed}
              connectionPending={pendingConnectionPhaseId === action.phase.id}
              externalDescriptionId={
                globalTopologyIssue ? globalTopologyIssueId : undefined
              }
              onTransition={handleTransition}
              onConnect={handleConnect}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
