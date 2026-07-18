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
  useCreateTask,
  useDeleteTask,
  useUploadProjectDocument,
  useAddProjectRoom,
  useUpdateProject,
} from '@/hooks/use-projects';
import {
  useDecisionsByProject,
  useDesignerClientForClientUser,
  useProjectActivityFromLog,
  useCreateProjectPhase,
  useUpdateProjectPhaseStatus,
  useUpdatePaymentMilestoneStatus,
  useProjectInvoices,
  useStartProjectThread,
  useSendMessage,
  useIsStudioOwner,
} from '@patina/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { RoomFilesSection } from '@/components/room-file/room-files-section';
import { useHydrated } from '@/hooks/use-hydrated';
import { useToast } from '@/components/portal/toast-provider';
import { queryKeys } from '@/lib/react-query';
import { StrataMark } from '@/components/portal/strata-mark';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { PHASE_CONFIG, ALL_PHASES, normalizePhaseSlug, type ProjectPhase, type PaymentMilestone } from '@/types/project-ui';
import {
  EditModeBar,
  ProjectIdentityHeader,
  KeyMetricsRow,
  ProjectBriefPanel,
  ProjectBoardsSection,
  RoomScopeGrid,
  PhaseTimelineV2,
  FFESummaryTile,
  FinancialsPanel,
  DocumentGrid,
  TimeTrackingPanel,
  RecentActivityPanel,
} from '@/components/portal/project-detail';
import { Button } from '@/components/ui/controls';
import { DecisionsPanel } from '@/components/portal/project-detail/decisions-panel';
import { SendUpdateModal } from '@/components/portal/project-detail/send-update-modal';
import { LogTimeDialog } from '@/components/portal/time/log-time-dialog';
import { TeamPanel } from '@/components/portal/project-detail/team-panel';
import { ProjectCommunicationsPanel } from '@/components/portal/project-communications-panel';
import { adaptProjectRooms } from '@/lib/project-room-adapter';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProject = any;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const hydrated = useHydrated();
  const [editMode, setEditMode] = useState(true);
  const [showUpdateComposer, setShowUpdateComposer] = useState(false);
  const [showLogTime, setShowLogTime] = useState(false);

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
  // The project carries the client's AUTH uid (client_id), not a designer_clients
  // row id. Resolve the real designer_clients.id so the decision composer inserts
  // a valid designer_client_id (raw auth uid fails the client_decisions RLS check).
  const { data: decisionClient } = useDesignerClientForClientUser(project?.client_id);

  // Invoice linkage for the Financials panel: which payment milestones are
  // already billed on a live (non-void) invoice, and where. Mock (slug)
  // projects skip the query (UUID guard) and render the legacy controls.
  const { data: projectInvoices = [] } = useProjectInvoices(
    UUID_PATTERN.test(id) ? id : null,
  );
  const milestoneBilling = useMemo(() => {
    const map: Record<
      string,
      { invoiceId: string; invoiceNumber: string | null; invoiceStatus: (typeof projectInvoices)[number]['status'] }
    > = {};
    for (const invoice of projectInvoices) {
      if (invoice.status === 'void') continue;
      for (const line of invoice.line_items ?? []) {
        if (line.milestone_id) {
          map[line.milestone_id] = {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            invoiceStatus: invoice.status,
          };
        }
      }
    }
    return map;
  }, [projectInvoices]);

  // FFESummaryTile surfaces procurement KPIs + a CTA into /portal/procurement/*.
  // Pilot-gate it the same way the Today card and procurement zone are gated
  // so the pilot stays invisible to non-pilot designers
  // (W3.5.5 CRITICAL-1 + HIGH-2).
  const { value: procurementPilotEnabled } = useFeatureFlag(
    'procurement-workspace-pilot',
  );

  // Room File v0 (Field Capture P1, item 12) — the "Room Files" zone lists
  // this project's scans that have a generated drawing set. Fail-closed behind
  // `room-file`; the section itself renders nothing when there are none.
  const { value: roomFileEnabled } = useFeatureFlag('room-file');

  // Margin visibility (00185 dual pricing): trade cost + margin are studio-
  // owner-only. While roles load this is false → margin row simply hidden.
  const { isStudioOwner } = useIsStudioOwner();

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
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();
  const uploadDocument = useUploadProjectDocument();
  const addRoom = useAddProjectRoom();
  const updateProject = useUpdateProject();
  const startThread = useStartProjectThread();
  const sendMessage = useSendMessage();

  // Phase / milestone mutations live in @patina/supabase (use-project-v2) and
  // invalidate their OWN query keys, which the portal does not read. We call them
  // here and additionally invalidate the portal's keys (queryKeys.projects.all)
  // so the timeline, financials, and key-metrics surfaces refresh in place.
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updatePhaseStatus = useUpdateProjectPhaseStatus();
  const updateMilestoneStatus = useUpdatePaymentMilestoneStatus();
  const createPhase = useCreateProjectPhase();

  // Mutating controls only make sense for real (Supabase-backed) projects — the
  // mutation hooks hit Supabase directly and would error on slug fixtures.
  const isRealProject = UUID_PATTERN.test(id);
  const editable = editMode && isRealProject;

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

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) return <LoadingStrata />;
  if (!project) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Project not found.
      </p>
    );
  }

  // Normalize to a canonical PhaseSlug — activated projects persist a
  // simplified vocab (e.g. 'concept') that isn't in PHASE_CONFIG; an
  // un-normalized value crashes ProjectIdentityHeader (AP-C0).
  const phase = normalizePhaseSlug(project.current_phase) as ProjectPhase;

  const handleTaskToggle = (taskId: string, done: boolean) => {
    updateTask.mutate({
      taskId,
      data: { status: done ? 'done' : 'todo' },
    });
  };

  const refreshProject = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });

  const handlePhaseStatusChange = async (phaseId: string, status: string) => {
    try {
      await updatePhaseStatus.mutateAsync({ phaseId, projectId: id, status });
      refreshProject();
      toast(status === 'completed' ? 'Phase marked complete' : 'Phase started', 'success');
    } catch {
      toast('Could not update phase', 'error');
    }
  };

  const handlePhaseProgressChange = async (phaseId: string, progress: number) => {
    try {
      await updatePhaseStatus.mutateAsync({ phaseId, projectId: id, progress });
      refreshProject();
      toast('Progress updated', 'success');
    } catch {
      toast('Could not update progress', 'error');
    }
  };

  const handleMilestoneStatusChange = async (
    milestoneId: string,
    status: PaymentMilestone['status'],
  ) => {
    try {
      await updateMilestoneStatus.mutateAsync({ milestoneId, projectId: id, status });
      refreshProject();
      toast(status === 'paid' ? 'Payment marked paid' : 'Milestone updated', 'success');
    } catch {
      toast('Could not update milestone', 'error');
    }
  };

  const handleAddTask = async (phase: string, title: string) => {
    if (!title.trim()) return;
    try {
      await createTask.mutateAsync({ projectId: id, data: { title: title.trim(), phase } });
      toast('Task added', 'success');
    } catch {
      toast('Could not add task', 'error');
    }
  };

  const handleUpdateTaskTitle = async (taskId: string, title: string) => {
    if (!title.trim()) return;
    try {
      await updateTask.mutateAsync({ taskId, data: { title: title.trim() } });
      toast('Task updated', 'success');
    } catch {
      toast('Could not update task', 'error');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTask.mutateAsync(taskId);
      toast('Task deleted', 'success');
    } catch {
      toast('Could not delete task', 'error');
    }
  };

  const handleSendUpdate = async (body: string) => {
    if (!body.trim()) return;
    try {
      const threadId = await startThread.mutateAsync(id);
      await sendMessage.mutateAsync({ threadId, body: body.trim() });
      toast('Update sent to client', 'success');
      setShowUpdateComposer(false);
    } catch {
      toast('Could not send update', 'error');
    }
  };

  const handleChangeStatus = async (status: string, verb: string) => {
    try {
      await updateProject.mutateAsync({ id, data: { status } });
      refreshProject();
      toast(`Project ${verb}`, 'success');
    } catch {
      toast('Could not update project status', 'error');
    }
  };

  const handleAddRoom = async (room: {
    name: string;
    dimensions?: string;
    budgetCents?: number;
    notes?: string;
  }) => {
    try {
      await addRoom.mutateAsync({ projectId: id, data: room });
      toast('Room added', 'success');
    } catch {
      toast('Could not add room', 'error');
    }
  };

  const handleUploadDocument = async (file: File) => {
    try {
      await uploadDocument.mutateAsync({ projectId: id, file });
      toast('Document uploaded', 'success');
    } catch {
      toast('Could not upload document', 'error');
    }
  };

  const handleAddPhase = async (phaseKey: string) => {
    try {
      const label = PHASE_CONFIG[phaseKey as ProjectPhase]?.label ?? phaseKey;
      const sortOrder = ALL_PHASES.indexOf(phaseKey as ProjectPhase);
      await createPhase.mutateAsync({
        projectId: id,
        phaseKey,
        name: label,
        sortOrder: sortOrder >= 0 ? sortOrder : undefined,
      });
      refreshProject();
      toast('Phase added', 'success');
    } catch {
      toast('Could not add phase', 'error');
    }
  };

  // Safely coerce arrays
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedTasks = (Array.isArray(tasks) ? tasks : []) as any[];
  // Adapt project_phases rows into the segment shape PhaseTimelineV2 matches on.
  // Real (UUID) projects expose phase_key / start_date / target_end_date and a
  // non-canonical phase vocab; the component matches `segment.phase ===
  // canonicalSlug`, so without this mapping nothing matched and every phase
  // rendered as "pending" (AP-C4). Mock (slug) rows already have the right shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedTimeline = (Array.isArray(timeline) ? timeline : []).map((seg: any) =>
    seg && seg.phase_key !== undefined
      ? {
          id: seg.id,
          phase: normalizePhaseSlug(seg.phase_key),
          status: seg.status,
          startDate: seg.start_date ?? undefined,
          endDate: seg.target_end_date ?? undefined,
          progress: seg.progress ?? 0,
        }
      : seg
  ) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedDocuments = (Array.isArray(documents) ? documents : []) as any[];
  // Adapt ClientActivity shape → ActivityItem shape expected by RecentActivityPanel
  const typedActivity = (Array.isArray(activityLog) ? activityLog : []).map((item) => ({
    id: item.id as string,
    title: item.title as string,
    actorName: (item.actor_name as string | null) ?? undefined,
    timestamp: item.created_at as string,
  }));
  // Normalize milestones to the PaymentMilestone shape the panel renders. Real
  // (UUID) projects return raw project_payment_milestones rows (label /
  // amount_cents / due_date / paid_at); mock fixtures already match the UI shape.
  // Without this map, FinancialsPanel read m.title (undefined) on real projects.
  const typedMilestones: PaymentMilestone[] = (Array.isArray(milestones) ? milestones : []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (m: any) =>
      m && m.amount_cents !== undefined
        ? {
            id: m.id,
            title: m.label ?? m.title ?? 'Payment',
            percentage: m.percentage ?? 0,
            amount: m.amount_cents ?? 0,
            status: m.status,
            date: m.paid_at
              ? new Date(m.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : m.due_date
                ? new Date(m.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : undefined,
          }
        : (m as PaymentMilestone),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedRooms = (Array.isArray(rooms) ? rooms : []) as any[];
  // Adapt useProjectFinancials into the FinancialLineItem[] the panel renders.
  // Real (UUID) projects return an aggregate OBJECT ({ byCategory, ... });
  // mock (slug) projects return an array of line items. This page previously
  // only handled the array shape (`Array.isArray(financials) ? … : []`), so
  // the inline Financials panel silently never rendered for real projects
  // (AP-C6). Earnings are now derived (12% commission on product spend, matching
  // the /financials page) instead of hardcoded fabricated numbers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const financialsObj = financials as any;
  const isFinArray = Array.isArray(financials);
  const designFeeCents: number =
    (isFinArray ? undefined : financialsObj?.designFeeCents) ??
    project.design_fee_cents ??
    project.design_fee ??
    0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const financialItems: any[] = isFinArray
    ? (financials as any[])
    : [
        ...(designFeeCents > 0
          ? [{ id: 'design-fee', category: 'Design Fee', label: 'Design Fee', budget: designFeeCents, committed: designFeeCents, actual: designFeeCents, variance: 0 }]
          : []),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...((financialsObj?.byCategory ?? []) as any[]).map((c: any) => ({
          id: c.category,
          category: c.category,
          label: c.category,
          budget: c.budgetCents ?? 0,
          committed: c.committedCents ?? 0,
          actual: c.actualCents ?? 0,
          variance: (c.actualCents ?? 0) - (c.budgetCents ?? 0),
        })),
      ];
  const committedCents: number = isFinArray ? 0 : (financialsObj?.committedCents ?? 0);
  const productSpend = Math.max(committedCents - designFeeCents, 0);
  const designerEarnings = {
    designFee: designFeeCents,
    commissions: Math.round(productSpend * 0.12),
    commissionRate: 0.12,
    productTotal: productSpend,
  };
  // Margin row (00185 dual pricing) — studio owners only; hidden (not
  // disabled) for everyone else, and skipped for mock (array-shape) financials
  // which carry no trade data. marginCents stays null (never 0-coalesced) when
  // no item has a trade cost.
  const financialsMargin =
    isStudioOwner && !isFinArray && financialsObj
      ? {
          marginCents: financialsObj.marginCents ?? null,
          tradeTotalCents: financialsObj.tradeTotalCents ?? null,
          itemsWithTradeCount: financialsObj.itemsWithTradeCount ?? 0,
          totalItemCount: financialsObj.totalItemCount ?? 0,
        }
      : undefined;

  return (
    <div>
      {/* Edit Mode Bar */}
      {editMode && (
        <EditModeBar
          onToggleClientView={() => setEditMode(false)}
          onSendUpdate={() => setShowUpdateComposer(true)}
        />
      )}

      <SendUpdateModal
        open={showUpdateComposer}
        sending={startThread.isPending || sendMessage.isPending}
        onClose={() => setShowUpdateComposer(false)}
        onSend={handleSendUpdate}
      />

      {isRealProject && (
        <LogTimeDialog
          open={showLogTime}
          projectId={id}
          defaultPhase={phase}
          onClose={() => setShowLogTime(false)}
          onLogged={() => toast('Time logged', 'success')}
        />
      )}

      <div className="pt-8">
        {/* Zone 1: Project Identity — the global breadcrumb (SubNav) now
            carries the project name, so the header renders only the
            PageActionBar (status/meta + quick actions). */}
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

        {/* Zone 3a': Mood boards carried from the signed proposal (00180).
            Renders nothing when the project has none; slug fixtures skip the
            query (project_boards.project_id is a uuid column). */}
        <ProjectBoardsSection projectId={isRealProject ? id : null} />

        {/* Zone 3b: Room-by-Room Scope */}
        {(adaptedRooms.length > 0 || editable) && (
          <>
            <RoomScopeGrid
              rooms={adaptedRooms}
              editable={editable}
              onAddRoom={handleAddRoom}
            />
            <StrataMark variant="mini" />
          </>
        )}

        {/* Zone 3c: Room Files (Field Capture P1, item 12) — scans with a
            generated drawing set. Fail-closed behind `room-file`; the section
            self-hides (renders null, its own mb-8 spacing, no external divider —
            ProjectBoardsSection precedent) when the project has none. */}
        {roomFileEnabled && isRealProject && <RoomFilesSection projectId={id} />}

        {/* Zone 4: Phase Timeline */}
        <PhaseTimelineV2
          projectId={id}
          segments={typedTimeline}
          tasks={typedTasks}
          onTaskToggle={handleTaskToggle}
          editable={editable}
          onPhaseStatusChange={handlePhaseStatusChange}
          onPhaseProgressChange={handlePhaseProgressChange}
          onAddTask={handleAddTask}
          onUpdateTaskTitle={handleUpdateTaskTitle}
          onDeleteTask={handleDeleteTask}
          onAddPhase={handleAddPhase}
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
        {financialItems.length > 0 && (
          <>
            <FinancialsPanel
              items={financialItems}
              milestones={typedMilestones}
              earnings={designerEarnings}
              editable={editable}
              onMilestoneStatusChange={handleMilestoneStatusChange}
              projectId={UUID_PATTERN.test(id) ? id : undefined}
              milestoneBilling={milestoneBilling}
              margin={financialsMargin}
            />
            <StrataMark variant="mini" />
          </>
        )}

        {/* Zone 7: Decisions */}
        {project.client_id && (
          <>
            <DecisionsPanel
              projectId={id}
              designerClientId={decisionClient?.id ?? project.designer_client_id ?? project.client_id}
            />
            <StrataMark variant="mini" />
          </>
        )}

        {/* Zone 8: Documents */}
        <DocumentGrid
          documents={typedDocuments}
          editable={editable}
          uploading={uploadDocument.isPending}
          onUpload={handleUploadDocument}
        />
        <StrataMark variant="mini" />

        {/* Zones 8 + 9: Time Tracking + Recent Activity */}
        <div className="grid gap-8 md:grid-cols-2">
          {/* Zone 8: Time Tracking — real projects always render the panel
              (zeros summary + "Log time" affordance when empty, 00177);
              slug fixtures keep their mock data, no log affordance. */}
          {timeTracking && (
            <TimeTrackingPanel
              tracking={timeTracking}
              designFee={project.design_fee_cents ?? project.design_fee ?? 250000}
              projectId={isRealProject ? id : undefined}
              onLogTime={isRealProject ? () => setShowLogTime(true) : undefined}
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

          {/* Lifecycle status — hold / reactivate / archive (real projects). */}
          {editable && (
            <div className="ml-auto flex items-center gap-2">
              <span
                className="type-meta-small text-[var(--text-muted)]"
                style={{ textTransform: 'capitalize' }}
              >
                {String(project.status ?? 'active').replace('_', ' ')}
              </span>
              {project.status === 'active' && (
                <Button variant="secondary" size="sm" onClick={() => handleChangeStatus('on_hold', 'put on hold')}>
                  Put on hold
                </Button>
              )}
              {project.status === 'draft' && (
                <Button variant="secondary" size="sm" onClick={() => handleChangeStatus('active', 'activated')}>
                  Activate
                </Button>
              )}
              {(project.status === 'on_hold' ||
                project.status === 'archived' ||
                project.status === 'completed') && (
                <Button variant="secondary" size="sm" onClick={() => handleChangeStatus('active', 'reactivated')}>
                  Reactivate
                </Button>
              )}
              {project.status !== 'archived' && project.status !== 'completed' && (
                <Button variant="secondary" size="sm" onClick={() => handleChangeStatus('archived', 'archived')}>
                  Archive
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
