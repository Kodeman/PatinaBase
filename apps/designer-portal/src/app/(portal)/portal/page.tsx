'use client';

import { useAuth } from '@/hooks/use-auth';
import { useLeads, useLeadStats, useAllDecisions } from '@patina/supabase';
import { useProjects } from '@/hooks/use-projects';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProject = any;
import { useEarningsStats } from '@patina/supabase';
import { StrataMark } from '@/components/portal/strata-mark';
import { MetricBlock } from '@/components/portal/metric-block';
import { LeadListItem } from '@/components/portal/lead-list-item';
import { ProjectListItem } from '@/components/portal/project-list-item';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { AnimatedText } from '@/components/portal/animated-text';
import { StaggerChildren } from '@/components/portal/stagger-children';
import { DecisionCard } from '@/components/portal/decision-card';
// F1.1 — Designer Today migrated to ambient help-system per spec §9.2.
// EmptyState + SectionIntro are CMS-backed; copy lives in Sanity once content
// is published. Until then, SectionIntro renders the inline `fallback`, and
// EmptyState renders nothing on a clean (no-error) CMS miss per spec §13.4
// (graceful absence). Analytics events `help.empty_state.shown` and
// `help.section_intro.shown` fire automatically via window.posthog on first
// render of a CMS hit (no portal-side wiring needed).
import { EmptyState, SectionIntro, SurfaceKeys } from '@patina/help-system';
import { CheckCircle2, Inbox, Folder } from 'lucide-react';

function getClientName(decision: {
  designer_client?: {
    client_name: string | null;
    client_email: string | null;
    client?: { full_name: string | null } | null;
  };
}): string {
  return (
    decision.designer_client?.client?.full_name ||
    decision.designer_client?.client_name ||
    decision.designer_client?.client_email ||
    'Unknown'
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatPhase(phase: string): string {
  return phase
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: leads, isLoading: leadsLoading } = useLeads({ status: 'new' });
  const { data: leadStats } = useLeadStats();
  const { data: rawProjects, isLoading: projectsLoading } = useProjects({
    status: 'active',
  });
  const projects = (Array.isArray(rawProjects) ? rawProjects : []) as AnyProject[];
  const { data: earningsStats } = useEarningsStats();
  const { data: overdueDecisions = [] } = useAllDecisions({ isOverdue: true });

  const firstName = user?.name?.split(' ')[0] || 'Designer';

  if (leadsLoading && projectsLoading) {
    return <LoadingStrata />;
  }

  return (
    <div>
      {/* Greeting Block */}
      <div className="flex items-baseline justify-between pb-4 pt-12 animate-section-enter">
        <h1 className="type-page-title">
          <AnimatedText as="span" className="inline" delay={0} mode="words">
            {`${getGreeting()},`}
          </AnimatedText>{' '}
          <AnimatedText
            as="span"
            className="inline font-heading italic text-[var(--color-aged-oak)]"
            delay={250}
          >
            {firstName}
          </AnimatedText>
        </h1>
        <span
          className="type-meta hidden md:block animate-section-enter"
          style={{ animationDelay: '300ms' }}
        >
          {formatDate()}
        </span>
      </div>

      {/* Metrics Row */}
      <div
        className="mt-10 grid grid-cols-2 gap-6 border-b border-[var(--border-default)] pb-8 md:grid-cols-4 md:gap-0 animate-section-enter"
        style={{ animationDelay: '150ms' }}
      >
        <div className="pr-0 md:pr-8">
          <MetricBlock
            label="New Leads"
            value={leadStats?.new ?? 0}
            change={leadStats?.new ? `${leadStats.new} waiting` : undefined}
            trend="neutral"
          />
        </div>
        <div className="border-0 pl-0 pr-0 md:border-l md:border-[var(--border-default)] md:pl-8 md:pr-8">
          <MetricBlock
            label="Active Projects"
            value={projects.length}
          />
        </div>
        <div className="border-0 pl-0 pr-0 md:border-l md:border-[var(--border-default)] md:pl-8 md:pr-8">
          <MetricBlock
            label="This Month"
            value={
              earningsStats?.thisMonthEarnings
                ? `$${(earningsStats.thisMonthEarnings / 100).toLocaleString()}`
                : '$0'
            }
          />
        </div>
        <div className="border-0 pl-0 md:border-l md:border-[var(--border-default)] md:pl-8">
          <MetricBlock
            label="Avg Match"
            value={leadStats?.avgMatchScore ?? 0}
          />
        </div>
      </div>

      <div
        className="animate-section-enter"
        style={{ animationDelay: '300ms' }}
      >
        <StrataMark variant="mini" />
      </div>

      {/* Overdue Decisions */}
      <section
        className="mt-10 animate-section-enter"
        style={{ animationDelay: '350ms' }}
      >
        <h2 className="type-section-head mb-2 border-b border-[var(--border-default)] pb-3">
          Overdue decisions
        </h2>
        <SectionIntro
          className="mb-6"
          surfaceKey={SurfaceKeys.DesignerPortal.Today.Intro.OverdueDecisions}
          fallback="Decisions waiting on your call — sorted by how long they've been blocked."
        />
        {overdueDecisions.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<CheckCircle2 className="h-12 w-12" />}
            surfaceKey={SurfaceKeys.DesignerPortal.Today.Empty.OverdueDecisions}
          />
        ) : (
          <div>
            {overdueDecisions.map((d) => (
              <DecisionCard
                key={d.id}
                id={d.id}
                title={d.title}
                dueDate={d.due_date ?? undefined}
                description={d.context ?? undefined}
                status={d.status}
                decisionType={d.decision_type}
                blockingStatus={d.blocking_status}
                projectName={d.project?.name ?? undefined}
                clientName={getClientName(d)}
                optionThumbnails={
                  d.options
                    ?.filter((o) => o.image_url)
                    .map((o) => o.image_url!) ?? []
                }
                href={`/portal/decisions/${d.id}`}
              />
            ))}
          </div>
        )}
      </section>

      {/* Two-Column Content */}
      <div className="mt-10 grid gap-12 overflow-hidden md:grid-cols-[58%_42%]">
        {/* Leads Column */}
        <div
          className="animate-section-enter"
          style={{ animationDelay: '400ms' }}
        >
          <AnimatedText
            as="h2"
            className="type-section-head mb-2 border-b border-[var(--border-default)] pb-3"
            delay={450}
          >
            Leads waiting for you
          </AnimatedText>
          <SectionIntro
            className="mb-6"
            surfaceKey={SurfaceKeys.DesignerPortal.Today.Intro.Leads}
            fallback="New leads matched to your style — respond before the timer runs out."
          />
          {leads && leads.length > 0 ? (
            <StaggerChildren interval={60} baseDelay={500}>
              {leads.slice(0, 5).map((lead) => (
                <LeadListItem
                  key={lead.id}
                  id={lead.id}
                  clientName={
                    lead.homeowner?.full_name || 'Anonymous Client'
                  }
                  projectType={lead.project_type || ''}
                  location={
                    [lead.location_city, lead.location_state]
                      .filter(Boolean)
                      .join(', ') || ''
                  }
                  budgetRange={lead.budget_range || ''}
                  responseDeadline={
                    lead.response_deadline
                      ? formatRelativeTime(lead.response_deadline)
                      : ''
                  }
                  matchScore={lead.match_score || 0}
                />
              ))}
            </StaggerChildren>
          ) : (
            <EmptyState
              icon={<Inbox className="h-12 w-12" />}
              surfaceKey={SurfaceKeys.DesignerPortal.Today.Empty.Leads}
            />
          )}
        </div>

        {/* Active Projects Column */}
        <div
          className="animate-section-enter"
          style={{ animationDelay: '450ms' }}
        >
          <AnimatedText
            as="h2"
            className="type-section-head mb-2 border-b border-[var(--border-default)] pb-3"
            delay={500}
          >
            Active work
          </AnimatedText>
          <SectionIntro
            className="mb-6"
            surfaceKey={SurfaceKeys.DesignerPortal.Today.Intro.ActiveWork}
            fallback="Your active projects — phase, progress, and what's next at a glance."
          />
          {projects.length > 0 ? (
            <StaggerChildren interval={60} baseDelay={550}>
              {projects.map((project: AnyProject) => (
                <ProjectListItem
                  key={project.id}
                  id={project.id}
                  name={project.name}
                  phase={formatPhase(
                    project.current_phase || project.status || 'active'
                  )}
                  progress={project.progress ?? 0}
                />
              ))}
            </StaggerChildren>
          ) : (
            <EmptyState
              size="sm"
              icon={<Folder className="h-12 w-12" />}
              surfaceKey={SurfaceKeys.DesignerPortal.Today.Empty.ActiveWork}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffHours < 0) return 'expired';
  if (diffHours < 1) return 'less than 1h';
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d`;
}
