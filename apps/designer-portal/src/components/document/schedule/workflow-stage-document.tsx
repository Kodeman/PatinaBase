'use client';

import { useId, useMemo } from 'react';
import {
  RESIDENTIAL_WORKFLOW_STAGES,
  RESIDENTIAL_WORKFLOW_TRACKS,
  type ResidentialWorkflowStage,
} from '@patina/types';

import {
  deriveWorkflowStageDocument,
  type WorkflowCoordinationItemLike,
  type WorkflowPhaseLike,
  type WorkflowStageStatus,
} from '@/lib/document/workflow-stage-derivation';

export interface WorkflowStageDocumentProps {
  phases: readonly WorkflowPhaseLike[];
  coordinationItems: readonly WorkflowCoordinationItemLike[];
}

const STATUS_LABEL: Readonly<Record<WorkflowStageStatus, string>> = {
  canonical: 'Canonical stage',
  scheduled: 'Scheduled',
  complete: 'Complete',
  active: 'Active',
  delayed: 'Active · delayed',
};

function trackLabel(stage: ResidentialWorkflowStage) {
  return (
    RESIDENTIAL_WORKFLOW_TRACKS.find((track) => track.key === stage.trackKey)
      ?.label ?? stage.trackKey
  );
}

function StageRow({
  stage,
  status,
}: {
  stage: ResidentialWorkflowStage;
  status: WorkflowStageStatus;
}) {
  const current = status === 'active' || status === 'delayed';

  return (
    <li
      value={stage.ordinal}
      data-workflow-stage={stage.key}
      aria-current={current ? 'step' : undefined}
      className="min-w-0 border-t border-[var(--border-subtle)] py-2.5 first:border-t-0"
    >
      <div className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-2.5">
        <span
          aria-hidden="true"
          className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--text-muted)]"
        >
          {stage.number}
        </span>
        <div className="min-w-0">
          <p className="break-words text-[12px] font-semibold leading-snug text-[var(--text-primary)]">
            <span className="sr-only">Stage {stage.number}: </span>
            {stage.title}
          </p>
          <p className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
            <span>{trackLabel(stage)}</span>
            <span
              className={
                current
                  ? 'font-semibold text-[var(--color-aged-oak)]'
                  : undefined
              }
            >
              {STATUS_LABEL[status]}
            </span>
          </p>
        </div>
      </div>
    </li>
  );
}

function ValueList({ values }: { values: readonly string[] }) {
  return (
    <ul className="space-y-1">
      {values.map((value) => (
        <li
          key={value}
          className="break-words before:mr-2 before:content-['—']"
        >
          {value}
        </li>
      ))}
    </ul>
  );
}

export function WorkflowStageDocument({
  phases,
  coordinationItems,
}: WorkflowStageDocumentProps) {
  const headingId = useId();
  const projectGroupId = useId();
  const detailId = useId();
  const state = useMemo(
    () => deriveWorkflowStageDocument(phases, coordinationItems),
    [coordinationItems, phases],
  );

  const beforeProject = RESIDENTIAL_WORKFLOW_STAGES.slice(0, 3);
  const projectStages = RESIDENTIAL_WORKFLOW_STAGES.slice(3, 9);
  const afterProject = RESIDENTIAL_WORKFLOW_STAGES.slice(9);

  const activeStageLabel = state.activeStage
    ? `${state.activeStage.number} · ${state.activeStage.title}`
    : state.activePhase
      ? `Legacy phase · ${state.activePhase.name}`
      : 'No active project phase';

  return (
    <section
      aria-labelledby={headingId}
      data-layout="single-column-base-two-column-wide"
      className="mt-8 min-w-0 border-y border-[var(--border-subtle)] py-6"
    >
      <header className="min-w-0">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          Workflow document
        </p>
        <div className="mt-1 grid min-w-0 grid-cols-1 gap-3 min-[760px]:grid-cols-[minmax(0,1fr)_minmax(13rem,0.7fr)] min-[760px]:items-end">
          <div className="min-w-0">
            <h3
              id={headingId}
              className="font-heading text-[22px] leading-tight text-[var(--text-primary)]"
            >
              Residential project workflow
            </h3>
            <p className="mt-1 max-w-[62ch] text-[11px] leading-relaxed text-[var(--text-muted)]">
              Eleven canonical stages. Stages 04–09 live inside Project and read
              from the active schedule phase without changing its record.
            </p>
          </div>
          <div className="min-w-0 border-t border-[var(--border-subtle)] pt-2 min-[760px]:border-t-0 min-[760px]:pt-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Active stage / track
            </p>
            <p className="mt-0.5 break-words text-[12px] font-semibold leading-snug text-[var(--text-primary)]">
              {activeStageLabel}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              {state.activeTrack?.label ?? 'Not mapped to a canonical track'}
            </p>
          </div>
        </div>
      </header>

      <div className="mt-6 grid min-w-0 grid-cols-1 gap-7 min-[900px]:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)] min-[900px]:gap-10">
        <nav
          aria-label="Residential design workflow stages"
          className="min-w-0"
        >
          <ol
            aria-label="Residential design workflow stages"
            className="min-w-0"
          >
            {beforeProject.map((stage) => (
              <StageRow
                key={stage.key}
                stage={stage}
                status={state.stageStatus[stage.key]}
              />
            ))}
            <li className="list-none border-t border-[var(--border-default)] py-3">
              <section
                aria-labelledby={projectGroupId}
                className="min-w-0 pl-2"
              >
                <div className="border-l-2 border-[var(--color-aged-oak)] pl-3">
                  <h4
                    id={projectGroupId}
                    className="font-mono text-[9px] font-semibold uppercase tracking-[0.09em] text-[var(--color-aged-oak)]"
                  >
                    Project · stages 04–09
                  </h4>
                  <ol
                    start={4}
                    aria-label="Project stages 04 through 09"
                    className="mt-1 min-w-0"
                  >
                    {projectStages.map((stage) => (
                      <StageRow
                        key={stage.key}
                        stage={stage}
                        status={state.stageStatus[stage.key]}
                      />
                    ))}
                  </ol>
                </div>
              </section>
            </li>
            {afterProject.map((stage) => (
              <StageRow
                key={stage.key}
                stage={stage}
                status={state.stageStatus[stage.key]}
              />
            ))}
          </ol>
        </nav>

        <section
          aria-labelledby={detailId}
          className="min-w-0 border-t border-[var(--border-default)] pt-4 min-[900px]:border-l min-[900px]:border-t-0 min-[900px]:pl-7 min-[900px]:pt-0"
        >
          <h4
            id={detailId}
            className="font-mono text-[9px] font-semibold uppercase tracking-[0.09em] text-[var(--color-aged-oak)]"
          >
            Current stage record
          </h4>

          {state.isLegacyPhase && (
            <p
              role="status"
              className="mt-3 border-l-2 border-[var(--color-aged-oak)] pl-3 text-[11px] leading-relaxed text-[var(--text-primary)]"
            >
              This schedule phase has no recognized canonical key. The Document
              will not infer a stage from its name.
            </p>
          )}

          <dl className="mt-3 min-w-0 divide-y divide-[var(--border-subtle)]">
            <div className="grid min-w-0 grid-cols-1 gap-1 py-3 min-[560px]:grid-cols-[8.5rem_minmax(0,1fr)]">
              <dt className="font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
                Purpose
              </dt>
              <dd className="break-words text-[11px] leading-relaxed text-[var(--text-primary)]">
                {state.activeStage?.purpose ??
                  'Map the active phase to reveal the canonical stage purpose.'}
              </dd>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-1 py-3 min-[560px]:grid-cols-[8.5rem_minmax(0,1fr)]">
              <dt className="font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
                Expected gate
              </dt>
              <dd className="break-words text-[11px] leading-relaxed text-[var(--text-primary)]">
                {state.activeStage?.expectedGate ?? 'Unavailable until mapped'}
              </dd>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-1 py-3 min-[560px]:grid-cols-[8.5rem_minmax(0,1fr)]">
              <dt className="font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
                Configured gate
              </dt>
              <dd className="break-words text-[11px] leading-relaxed text-[var(--text-primary)]">
                {state.configuredGate ?? 'No gate configured on this phase'}
              </dd>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-1 py-3 min-[560px]:grid-cols-[8.5rem_minmax(0,1fr)]">
              <dt className="font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
                Expected outputs
              </dt>
              <dd className="break-words text-[11px] leading-relaxed text-[var(--text-primary)]">
                {state.activeStage ? (
                  <ValueList values={state.activeStage.expectedOutputs} />
                ) : (
                  'Unavailable until mapped'
                )}
              </dd>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-1 py-3 min-[560px]:grid-cols-[8.5rem_minmax(0,1fr)]">
              <dt className="font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
                Expected deliverables
              </dt>
              <dd className="break-words text-[11px] leading-relaxed text-[var(--text-primary)]">
                {state.activeStage ? (
                  <ValueList values={state.activeStage.defaultDeliverables} />
                ) : (
                  'Unavailable until mapped'
                )}
              </dd>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-1 py-3 min-[560px]:grid-cols-[8.5rem_minmax(0,1fr)]">
              <dt className="font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
                Configured deliverables
              </dt>
              <dd className="break-words text-[11px] leading-relaxed text-[var(--text-primary)]">
                {state.configuredDeliverables.length > 0 ? (
                  <ValueList values={state.configuredDeliverables} />
                ) : (
                  'No deliverables configured on this phase'
                )}
              </dd>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-1 py-3 min-[560px]:grid-cols-[8.5rem_minmax(0,1fr)]">
              <dt className="font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
                Blockers
              </dt>
              <dd className="break-words text-[11px] leading-relaxed text-[var(--text-primary)]">
                {state.blockers.length > 0 ? (
                  <ValueList
                    values={state.blockers.map((blocker) => blocker.title)}
                  />
                ) : (
                  'No open phase blockers'
                )}
              </dd>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-1 py-3 min-[560px]:grid-cols-[8.5rem_minmax(0,1fr)]">
              <dt className="font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
                Responsible lane
              </dt>
              <dd className="break-words text-[11px] leading-relaxed text-[var(--text-primary)]">
                {state.responsibleLane?.label ?? 'Not mapped'}
              </dd>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-1 py-3 min-[560px]:grid-cols-[8.5rem_minmax(0,1fr)]">
              <dt className="font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
                Next phase action
              </dt>
              <dd className="break-words text-[11px] font-semibold leading-relaxed text-[var(--text-primary)]">
                {state.nextAction.label}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}
