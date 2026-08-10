'use client';

import { useId, type ReactNode } from 'react';
import {
  RESIDENTIAL_WORKFLOW_STAGES,
  type ResidentialWorkflowStage,
} from '@patina/types';

import type {
  WorkflowActiveGroup,
  WorkflowStageDocumentState,
  WorkflowStageStatus,
  WorkflowUnclassifiedActivePhase,
} from '@/lib/document/workflow-stage-derivation';

export interface WorkflowStageDocumentProps {
  state: WorkflowStageDocumentState;
}

const STATUS_LABEL: Readonly<Record<WorkflowStageStatus, string>> = {
  canonical: 'Canonical stage',
  scheduled: 'Scheduled',
  complete: 'Complete',
  active: 'Active',
  delayed: 'Active · delayed',
};

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
          <p
            className={
              current
                ? 'mt-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.07em] text-[var(--color-aged-oak)]'
                : 'mt-0.5 font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--text-muted)]'
            }
          >
            {STATUS_LABEL[status]}
          </p>
        </div>
      </div>
    </li>
  );
}

function ValueList({ values }: { values: readonly string[] }) {
  return (
    <ul className="min-w-0 space-y-1">
      {values.map((value) => (
        <li
          key={value}
          className="min-w-0 break-words before:mr-2 before:content-['—']"
        >
          {value}
        </li>
      ))}
    </ul>
  );
}

function DefinitionRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1 py-3 min-[560px]:grid-cols-[8.5rem_minmax(0,1fr)]">
      <dt className="font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-[11px] leading-relaxed text-[var(--text-primary)]">
        {children}
      </dd>
    </div>
  );
}

function ActiveGroupRecord({ group }: { group: WorkflowActiveGroup }) {
  const phaseNames = group.activePhases.map((phase) => phase.phase_name);

  return (
    <li
      data-workflow-group={group.key}
      className="min-w-0 border-t border-[var(--border-default)] py-5 first:border-t-0 first:pt-0"
    >
      <header className="min-w-0">
        <p className="break-words text-[13px] font-semibold leading-snug text-[var(--text-primary)]">
          {group.stage.number} · {group.stage.title} · {group.track.label}
        </p>
        <p className="mt-1 break-words font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
          {STATUS_LABEL[group.status]}
          {phaseNames.length > 0
            ? ` · ${phaseNames.join(' · ')}`
            : ' · Section guidance'}
        </p>
      </header>

      <dl className="mt-2 min-w-0 divide-y divide-[var(--border-subtle)]">
        <DefinitionRow label="Purpose">{group.stage.purpose}</DefinitionRow>
        <DefinitionRow label="Expected gate">
          {group.stage.expectedGate}
        </DefinitionRow>
        <DefinitionRow label="Configured gate">
          {group.configuredGates.length > 0 ? (
            <ValueList values={group.configuredGates} />
          ) : group.source === 'section' ? (
            'No project phase gate in this section.'
          ) : (
            'No gate configured on the active phase rows.'
          )}
        </DefinitionRow>
        <DefinitionRow label="Expected outputs">
          <ValueList values={group.stage.expectedOutputs} />
        </DefinitionRow>
        <DefinitionRow label="Expected deliverables">
          <ValueList values={group.stage.defaultDeliverables} />
        </DefinitionRow>
        <DefinitionRow label="Configured deliverables">
          {group.configuredDeliverables.length > 0 ? (
            <ValueList values={group.configuredDeliverables} />
          ) : group.source === 'section' ? (
            'No project phase deliverables in this section.'
          ) : (
            'No deliverables configured on the active phase rows.'
          )}
        </DefinitionRow>
        <DefinitionRow label="Blockers">
          {group.blockers.length > 0 ? (
            <ValueList
              values={group.blockers.map(
                (blocker) => `${blocker.kind}: ${blocker.title}`,
              )}
            />
          ) : (
            'No current blockers reported.'
          )}
        </DefinitionRow>
        <DefinitionRow label="Responsibility lane">
          {group.responsibleLane.label}
        </DefinitionRow>
        <DefinitionRow label="Schedule lane">
          {group.scheduleLanes.length > 0
            ? group.scheduleLanes.join(' · ')
            : 'No project schedule lane in this section.'}
        </DefinitionRow>
        <DefinitionRow label="Source">
          {group.provenance.length > 0 ? (
            <ValueList
              values={group.provenance.map(
                (source) => `${source.slug} · version ${source.version}`,
              )}
            />
          ) : (
            'No template provenance recorded.'
          )}
        </DefinitionRow>
        <DefinitionRow label="Next phase action">
          <ValueList values={group.nextActions.map((action) => action.label)} />
        </DefinitionRow>
      </dl>
    </li>
  );
}

function UnclassifiedRecord({
  item,
}: {
  item: WorkflowUnclassifiedActivePhase;
}) {
  return (
    <li className="min-w-0 border-t border-[var(--border-default)] py-5 first:border-t-0 first:pt-0">
      <p className="break-words text-[13px] font-semibold text-[var(--text-primary)]">
        Unclassified active phase · {item.phase.phase_name}
      </p>
      <p className="mt-1 break-words text-[11px] leading-relaxed text-[var(--text-muted)]">
        {item.reason}. The local phase key “{item.phase.phase_key ?? 'none'}” is
        displayed for reference and is never used to infer a workflow stage.
      </p>
      <dl className="mt-2 min-w-0 divide-y divide-[var(--border-subtle)]">
        <DefinitionRow label="Schedule lane">
          {item.phase.lane ?? 'Not recorded'}
        </DefinitionRow>
        <DefinitionRow label="Blockers">
          {item.blockers.length > 0 ? (
            <ValueList
              values={item.blockers.map(
                (blocker) => `${blocker.kind}: ${blocker.title}`,
              )}
            />
          ) : (
            'No current blockers reported.'
          )}
        </DefinitionRow>
        <DefinitionRow label="Next phase action">
          {item.nextAction.label}
        </DefinitionRow>
      </dl>
    </li>
  );
}

export function WorkflowStageDocument({ state }: WorkflowStageDocumentProps) {
  const headingId = useId();
  const railId = useId();
  const projectGroupId = useId();
  const detailId = useId();

  const beforeProject = RESIDENTIAL_WORKFLOW_STAGES.slice(0, 3);
  const projectStages = RESIDENTIAL_WORKFLOW_STAGES.slice(3, 9);
  const afterProject = RESIDENTIAL_WORKFLOW_STAGES.slice(9);
  const hasCurrentWork =
    state.activeGroups.length > 0 ||
    state.unclassifiedActivePhases.length > 0;

  return (
    <section
      aria-labelledby={headingId}
      data-workflow-document
      data-layout="single-column-base-two-column-wide"
      className="mt-8 min-w-0 max-w-full overflow-x-clip border-y border-[var(--border-subtle)] py-6"
    >
      <header className="min-w-0">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          Workflow document
        </p>
        <h3
          id={headingId}
          className="mt-1 break-words font-heading text-[22px] leading-tight text-[var(--text-primary)]"
        >
          Residential project workflow
        </h3>
        <p className="mt-1 max-w-[62ch] break-words text-[11px] leading-relaxed text-[var(--text-muted)]">
          Eleven canonical stages. Stages 04–09 live inside Project; project
          records are grouped by canonical stage and workflow track without
          changing the schedule graph.
        </p>
      </header>

      <div className="mt-6 grid min-w-0 grid-cols-1 gap-7 min-[900px]:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)] min-[900px]:gap-10">
        <section aria-labelledby={railId} className="min-w-0">
          <h4 id={railId} className="sr-only">
            Residential design workflow stages
          </h4>
          <ol className="min-w-0">
            {beforeProject.map((stage) => (
              <StageRow
                key={stage.key}
                stage={stage}
                status={state.stageStatus[stage.key]}
              />
            ))}
            <li
              value={4}
              className="list-none border-t border-[var(--border-default)] py-3"
            >
              <section aria-labelledby={projectGroupId} className="min-w-0 pl-2">
                <div className="min-w-0 border-l-2 border-[var(--color-aged-oak)] pl-3">
                  <h5
                    id={projectGroupId}
                    className="font-mono text-[9px] font-semibold uppercase tracking-[0.09em] text-[var(--color-aged-oak)]"
                  >
                    Project · stages 04–09
                  </h5>
                  <ol start={4} className="mt-1 min-w-0">
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
        </section>

        <section
          aria-labelledby={detailId}
          className="min-w-0 border-t border-[var(--border-default)] pt-4 min-[900px]:border-l min-[900px]:border-t-0 min-[900px]:pl-7 min-[900px]:pt-0"
        >
          <h4
            id={detailId}
            className="font-mono text-[9px] font-semibold uppercase tracking-[0.09em] text-[var(--color-aged-oak)]"
          >
            Active stages and tracks
          </h4>

          {hasCurrentWork ? (
            <ul className="mt-3 min-w-0">
              {state.activeGroups.map((group) => (
                <ActiveGroupRecord key={group.key} group={group} />
              ))}
              {state.unclassifiedActivePhases.map((item) => (
                <UnclassifiedRecord key={item.phase.phase_id} item={item} />
              ))}
            </ul>
          ) : (
            <p
              role="status"
              className="mt-3 break-words text-[11px] leading-relaxed text-[var(--text-muted)]"
            >
              {state.mode === 'project'
                ? 'No active or delayed project phase is configured.'
                : 'This section has no explicit non-project workflow mapping.'}
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
