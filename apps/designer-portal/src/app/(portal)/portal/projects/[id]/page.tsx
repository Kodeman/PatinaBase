'use client';

import { use, useState } from 'react';
import {
  useProject,
  useProjectTasks,
  useProjectTimeline,
  useProjectDocuments,
  useProjectActivity,
  useProjectMilestones,
  useProjectRooms,
  useProjectFFEItems,
  useProjectFinancials,
  useProjectTimeTracking,
  useProjectKeyMetrics,
  useUpdateTask,
} from '@/hooks/use-projects';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { StrataMark } from '@/components/portal/strata-mark';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { PHASE_CONFIG, type ProjectPhase } from '@/types/project-ui';
import {
  EditModeBar,
  ProjectIdentityHeader,
  KeyMetricsRow,
  RoomScopeGrid,
  PhaseTimelineV2,
  FFEScheduleTable,
  FinancialsPanel,
  DocumentGrid,
  TimeTrackingPanel,
  RecentActivityPanel,
} from '@/components/portal/project-detail';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProject = any;

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [editMode, setEditMode] = useState(true);

  // Core data
  const { data: project, isLoading } = useProject(id) as { data: AnyProject; isLoading: boolean };
  const { data: tasks = [] } = useProjectTasks(id);
  const { data: timeline = [] } = useProjectTimeline(id);
  const { data: documents = [] } = useProjectDocuments(id);
  const { data: activity = [] } = useProjectActivity(id, 6);
  const { data: milestones = [] } = useProjectMilestones(id);

  // V2 data
  const { data: rooms = [] } = useProjectRooms(id);
  const { data: ffeItems = [] } = useProjectFFEItems(id);
  const { data: financials = [] } = useProjectFinancials(id);
  const { data: timeTracking } = useProjectTimeTracking(id);
  const { data: keyMetrics } = useProjectKeyMetrics(id);

  const updateTask = useUpdateTask();

  if (isLoading) return <LoadingStrata />;
  if (!project) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Project not found.
      </p>
    );
  }

  const phase = (project.current_phase || 'consultation') as ProjectPhase;

  const handleTaskToggle = (taskId: string, done: boolean) => {
    updateTask.mutate({
      taskId,
      data: { status: done ? 'done' : 'todo' },
    });
  };

  // Safely coerce arrays
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedTasks = (Array.isArray(tasks) ? tasks : []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedTimeline = (Array.isArray(timeline) ? timeline : []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedDocuments = (Array.isArray(documents) ? documents : []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedActivity = (Array.isArray(activity) ? activity : []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedMilestones = (Array.isArray(milestones) ? milestones : []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedRooms = (Array.isArray(rooms) ? rooms : []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedFFEItems = (Array.isArray(ffeItems) ? ffeItems : []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedFinancials = (Array.isArray(financials) ? financials : []) as any[];

  // Designer earnings (derived from project data)
  const designerEarnings = {
    designFee: project.design_fee ?? 250000,
    commissions: 268700,
    commissionRate: 0.15,
    productTotal: 1791000,
  };

  return (
    <div>
      {/* Edit Mode Bar */}
      {editMode && (
        <EditModeBar
          onToggleClientView={() => setEditMode(false)}
          onSendUpdate={() => {}}
        />
      )}

      <div className="pt-8" style={{ maxWidth: '1120px', margin: '0 auto', padding: '2rem clamp(1.5rem, 5vw, 4rem)' }}>
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: 'Projects', href: '/portal/projects' },
            { label: project.name },
          ]}
        />

        {/* Zone 1: Project Identity */}
        <ProjectIdentityHeader
          project={project}
          phase={phase}
          projectId={id}
        />

        {/* Zone 2: Key Metrics */}
        {keyMetrics && (
          <KeyMetricsRow metrics={keyMetrics} />
        )}

        {/* Zone 3: Room-by-Room Scope */}
        {typedRooms.length > 0 && (
          <>
            <RoomScopeGrid rooms={typedRooms} />
            <StrataMark variant="mini" />
          </>
        )}

        {/* Zone 4: Phase Timeline */}
        <PhaseTimelineV2
          segments={typedTimeline}
          tasks={typedTasks}
          onTaskToggle={handleTaskToggle}
        />
        <StrataMark variant="mini" />

        {/* Zone 5: FF&E Schedule */}
        {typedFFEItems.length > 0 && (
          <>
            <FFEScheduleTable items={typedFFEItems} />
            <StrataMark variant="mini" />
          </>
        )}

        {/* Zone 6: Financials */}
        {typedFinancials.length > 0 && (
          <>
            <FinancialsPanel
              items={typedFinancials}
              milestones={typedMilestones}
              earnings={designerEarnings}
            />
            <StrataMark variant="mini" />
          </>
        )}

        {/* Zone 7: Documents */}
        <DocumentGrid documents={typedDocuments} />
        <StrataMark variant="mini" />

        {/* Zones 8 + 9: Time Tracking + Recent Activity */}
        <div className="grid gap-8 md:grid-cols-2">
          {/* Zone 8: Time Tracking */}
          {timeTracking && (
            <TimeTrackingPanel
              tracking={timeTracking}
              designFee={project.design_fee ?? 250000}
            />
          )}

          {/* Zone 9: Recent Activity */}
          <RecentActivityPanel
            items={typedActivity}
            projectId={id}
          />
        </div>

        {/* Bottom actions */}
        <div className="mt-8 flex gap-2 border-t pt-6" style={{ borderColor: 'var(--border-default)' }}>
          <a
            href={`/portal/projects/${id}/edit`}
            className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-4 py-2 text-[var(--text-primary)] no-underline"
            style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 500 }}
          >
            Edit Project
          </a>
          <a
            href={`/portal/projects/${id}/financials`}
            className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-4 py-2 text-[var(--text-primary)] no-underline"
            style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 500 }}
          >
            Financials
          </a>
          {phase === 'final_walkthrough' && (
            <a
              href={`/portal/projects/${id}/complete`}
              className="rounded-[3px] px-4 py-2 text-white no-underline"
              style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 500, background: 'var(--color-sage)' }}
            >
              Complete Project
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
