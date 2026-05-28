'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  useProject,
  useProjectTasks,
  useProjectTimeline,
  useProjectDocuments,
  useProjectMilestones,
  useProjectRooms,
  useProjectFFEItems,
  useProjectFinancials,
  useProjectTimeTracking,
  useProjectKeyMetrics,
  useUpdateTask,
} from '@/hooks/use-projects';
import { useDecisionsByProject, useProjectActivityFromLog } from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { StrataMark } from '@/components/portal/strata-mark';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { PHASE_CONFIG, type ProjectPhase } from '@/types/project-ui';
import {
  EditModeBar,
  ProjectIdentityHeader,
  KeyMetricsRow,
  ProjectBriefPanel,
  RoomScopeGrid,
  PhaseTimelineV2,
  FFESummaryTile,
  FinancialsPanel,
  DocumentGrid,
  TimeTrackingPanel,
  RecentActivityPanel,
} from '@/components/portal/project-detail';
import { DecisionsPanel } from '@/components/portal/project-detail/decisions-panel';
import { TeamPanel } from '@/components/portal/project-detail/team-panel';
import { ProjectCommunicationsPanel } from '@/components/portal/project-communications-panel';
import { adaptProjectRooms } from '@/lib/project-room-adapter';

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
  const { data: activityLog = [] } = useProjectActivityFromLog(id, 6);
  const { data: milestones = [] } = useProjectMilestones(id);

  // V2 data
  const { data: rooms = [] } = useProjectRooms(id);
  const { data: ffeItems = [] } = useProjectFFEItems(id);
  const { data: financials = [] } = useProjectFinancials(id);
  const { data: timeTracking } = useProjectTimeTracking(id);
  const { data: keyMetrics } = useProjectKeyMetrics(id);
  const { data: projectDecisions = [] } = useDecisionsByProject(id);

  // FFESummaryTile surfaces procurement KPIs + a CTA into /portal/procurement/*.
  // Pilot-gate it the same way the Today card and procurement zone are gated
  // so the pilot stays invisible to non-pilot designers
  // (W3.5.5 CRITICAL-1 + HIGH-2).
  const { value: procurementPilotEnabled } = useFeatureFlag(
    'procurement-workspace-pilot',
  );

  // Decisions count must match the DecisionsPanel list below (which treats
  // pending/draft as "Open"). useProjectKeyMetrics derives its own count from a
  // separate query that omits drafts, so override it here to keep the
  // KeyMetricsRow stat consistent with the list (B-06).
  const openDecisionsCount = useMemo(
    () =>
      (Array.isArray(projectDecisions) ? projectDecisions : []).filter(
        (d) => d.status === 'pending' || d.status === 'draft',
      ).length,
    [projectDecisions],
  );

  const updateTask = useUpdateTask();

  // Adapt raw project_rooms + project_ffe_items into the MockRoom shape
  // RoomScopeGrid expects (derives itemCount/orderedCount/progress/itemNames).
  // Must be declared before any early return to satisfy Rules of Hooks.
  const adaptedRooms = useMemo(
    () =>
      adaptProjectRooms(
        Array.isArray(rooms) ? rooms : [],
        Array.isArray(ffeItems) ? ffeItems : [],
      ),
    [rooms, ffeItems],
  );

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
  // Adapt ClientActivity shape → ActivityItem shape expected by RecentActivityPanel
  const typedActivity = (Array.isArray(activityLog) ? activityLog : []).map((item) => ({
    id: item.id as string,
    title: item.title as string,
    actorName: (item.actor_name as string | null) ?? undefined,
    timestamp: item.created_at as string,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedMilestones = (Array.isArray(milestones) ? milestones : []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedRooms = (Array.isArray(rooms) ? rooms : []) as any[];
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

      <div className="pt-8">
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
          <KeyMetricsRow
            metrics={{ ...keyMetrics, decisionsOpen: openDecisionsCount }}
          />
        )}

        <Link
          href={`/portal/projects/${id}/decisions`}
          className="mb-8 inline-flex items-baseline gap-3 rounded-[3px] border px-4 py-3 no-underline transition-colors hover:bg-[var(--surface-subtle)]"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <span
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.58rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
            }}
          >
            Open Decisions
          </span>
          <span
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.4rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              lineHeight: 1,
            }}
          >
            {openDecisionsCount}
          </span>
          <span className="type-meta-small text-[var(--accent-primary)]">View history &rarr;</span>
        </Link>

        {/* Zone 3a: Project Brief (preserved proposal narrative) */}
        <ProjectBriefPanel
          projectId={id}
          kickoffMessage={(project as { kickoff_message?: string | null }).kickoff_message ?? null}
        />

        {/* Zone 3b: Room-by-Room Scope */}
        {adaptedRooms.length > 0 && (
          <>
            <RoomScopeGrid rooms={adaptedRooms} />
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

        {/* Zone 5: Procurement summary (collapsed from full FF&E table — Sprint 1 W1.4).
            Pilot-gated — see procurementPilotEnabled comment above. */}
        {procurementPilotEnabled && (
          <>
            <FFESummaryTile projectId={id} />
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

        {/* Zone 7: Decisions */}
        {project.client_id && (
          <>
            <DecisionsPanel
              projectId={id}
              designerClientId={project.designer_client_id ?? project.client_id}
            />
            <StrataMark variant="mini" />
          </>
        )}

        {/* Zone 8: Documents */}
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

        {/* Zone 11: Communications — project group thread */}
        <ProjectCommunicationsPanel projectId={id} />
        <StrataMark variant="mini" />

        {/* Zone 12: Project meta — Team */}
        <TeamPanel
          projectId={id}
          leadDesignerName={project.designer?.full_name ?? project.lead_designer_name ?? undefined}
          currentDesignerId={project.designer_id ?? undefined}
        />
        <StrataMark variant="mini" />

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
