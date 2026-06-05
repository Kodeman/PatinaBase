'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  useClient,
  useClientActivity,
  useClientDecisions,
  useClientProjects,
  useClientRoomScans,
  useProjectPhases,
} from '@patina/supabase';
import type { DesignerClient, ClientLifecycleStage } from '@patina/supabase';
import { PageActionBar } from '@/components/portal/page-action-bar';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { StyleTag } from '@/components/portal/style-tag';
import { ClientTimeline } from '@/components/portal/client-timeline';
import { DecisionCard } from '@/components/portal/decision-card';
import { ActivityFeed } from '@/components/portal/activity-feed';
import { StrataMark } from '@/components/portal/strata-mark';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { PortalButton } from '@/components/portal/button';
import { ProjectCard } from '@/components/portal/project-card';
import { ScanCard } from '@/components/portal/scan-card';
// F1.6 — Client profile screen layered with help-system. Tooltip wraps each
// Relationship-metric value so the designer sees "what this measures" on
// hover. StrataInfoIcon marks Patina-specific concepts (Style DNA,
// Relationship Journey). FieldHelper provides at-a-glance context next to the
// Contact section heading. Per spec §4.1 / §4.2 / §4.4. All copy lives in
// Sanity once authored; inline `fallback` props keep the surface meaningful
// pre-deploy.
import {
  FieldHelper,
  StrataInfoIcon,
  SurfaceKeys,
  Tooltip,
} from '@patina/help-system';

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

const avatarColors: Record<string, { bg: string; fg: string }> = {
  lead: { bg: 'rgba(139, 156, 173, 0.12)', fg: 'var(--color-dusty-blue)' },
  proposal: { bg: 'rgba(196, 165, 123, 0.15)', fg: 'var(--color-mocha)' },
  active: { bg: 'rgba(122, 155, 118, 0.12)', fg: 'var(--color-sage)' },
  completed: { bg: 'rgba(196, 165, 123, 0.15)', fg: 'var(--color-mocha)' },
  nurture: { bg: 'rgba(196, 165, 123, 0.1)', fg: 'var(--accent-primary)' },
};

const TIMELINE_ACTIVITY_TYPES = new Set([
  'milestone',
  'status_change',
  'project_update',
]);

export default function ClientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const hydrated = useHydrated();
  const { data: client, isLoading } = useClient(id) as {
    data: DesignerClient | undefined;
    isLoading: boolean;
  };
  const { data: activities } = useClientActivity(id, 10);
  const { data: decisions } = useClientDecisions(id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: projects } = useClientProjects(id) as { data: any[] | undefined };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: roomScans } = useClientRoomScans(id) as { data: any[] | undefined };
  // CLI-17 — Relationship Journey reads authoritative project_phases for the
  // client's primary (most-recent) project. Disabled gracefully when the
  // client has no project; we fall back to the activity-log heuristic below.
  const primaryProjectId = projects?.[0]?.id ?? '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: projectPhases } = useProjectPhases(primaryProjectId) as {
    data: any[] | undefined;
  };

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) return <LoadingStrata />;
  if (!client) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Client not found.
      </p>
    );
  }

  const name =
    client.client?.full_name ||
    client.client_name ||
    client.client_email ||
    'Unknown Client';
  // Direct threads need a registered profile. Profile-less clients would hit
  // the legacy /messages route's "Cannot open conversation" dead-end, so we
  // disable the action instead (CLI-11).
  const canMessage = !!(client.client?.id || client.client_id);
  const email = client.client?.email || client.client_email || '';
  const phone = client.client?.phone || '';
  const stage = (client.status || 'active') as ClientLifecycleStage;
  const colors = avatarColors[stage] || avatarColors.active;

  const pendingDecisions = (decisions ?? []).filter((d) => d.status === 'pending');
  const activityItems = (activities ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    actorName: a.actor_name || undefined,
    timestamp: new Date(a.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
  }));

  // CLI-17 — Relationship Journey from authoritative project_phases.
  //   project_phases.status (migration 00066) maps directly to the timeline:
  //     completed              → 'done'
  //     in_progress            → 'active'
  //     pending | delayed      → 'future'
  //   Phases are ordered by sort_order (already applied by the hook). The
  //   target_end_date drives the displayed date (falls back to start_date).
  const PHASE_STATUS_MAP: Record<string, 'done' | 'active' | 'future'> = {
    completed: 'done',
    in_progress: 'active',
    pending: 'future',
    delayed: 'future',
  };

  const formatTimelineDate = (value: string | null | undefined): string =>
    value
      ? new Date(value).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phaseEntries = (projectPhases ?? []).map((p: any) => ({
    id: p.id,
    label: p.name,
    date: formatTimelineDate(p.target_end_date ?? p.start_date ?? p.completed_at),
    status: (PHASE_STATUS_MAP[p.status] ?? 'future') as 'done' | 'active' | 'future',
  }));

  // Fallback timeline from the activity log — used only when the client has no
  // project phases (e.g. no project, or a project predating phase tracking).
  // Status heuristic (ascending sort by created_at): last entry → 'active',
  // all earlier entries → 'done'.
  const sortedTimelineActivities = (activities ?? [])
    .filter((a) => TIMELINE_ACTIVITY_TYPES.has(a.activity_type))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const lastTimelineIdx = sortedTimelineActivities.length - 1;
  const activityTimelineEntries = sortedTimelineActivities.map((a, i) => ({
    id: a.id,
    label: a.title,
    date: new Date(a.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    status: (i === lastTimelineIdx ? 'active' : 'done') as 'done' | 'active' | 'future',
  }));

  // Prefer authoritative phases; fall back to the activity-log heuristic.
  const timelineEntries =
    phaseEntries.length > 0 ? phaseEntries : activityTimelineEntries;

  // Style preferences from JSONB
  const prefs = (client.style_preferences || {}) as Record<string, string>;

  const stageToneMap: Record<ClientLifecycleStage, 'info' | 'warning' | 'success' | 'neutral' | 'accent'> = {
    lead: 'info',
    proposal: 'warning',
    active: 'success',
    completed: 'neutral',
    nurture: 'accent',
  };

  const sinceDate = new Date(client.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="pt-8">
      {/* Page action bar — status chip, meta, and primary actions */}
      <PageActionBar
        status={{ tone: stageToneMap[stage] ?? 'neutral', label: stage.charAt(0).toUpperCase() + stage.slice(1), dot: true }}
        meta={
          <span className="type-label-secondary">
            Since {sinceDate}
            {email ? ` · ${email}` : ''}
          </span>
        }
        actions={
          <>
            {canMessage ? (
              <PortalButton variant="primary" size="sm" asChild>
                <Link href={`/portal/clients/${id}/messages`}>Message</Link>
              </PortalButton>
            ) : (
              <PortalButton
                variant="primary"
                size="sm"
                disabled
                title="This client has no registered profile yet — invite them to enable messaging."
              >
                Message
              </PortalButton>
            )}
            <PortalButton variant="secondary" size="sm" asChild>
              <Link href={`/portal/clients/${id}/decisions/new`}>+ New Decision</Link>
            </PortalButton>
            {projects?.[0]?.id ? (
              <PortalButton variant="secondary" size="sm" asChild>
                <Link href={`/portal/projects/${projects[0].id}`}>View Project</Link>
              </PortalButton>
            ) : (
              <PortalButton variant="secondary" size="sm" disabled>
                View Project
              </PortalButton>
            )}
          </>
        }
      />

      {/* Profile Hero — avatar + name + location */}
      <div
        className="mb-8 grid items-start gap-6 pb-6"
        style={{
          gridTemplateColumns: '64px 1fr',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {/* Avatar */}
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: '64px',
            height: '64px',
            background: colors.bg,
            color: colors.fg,
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: '1.1rem',
          }}
        >
          {getInitials(name)}
        </div>

        {/* Info */}
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.8rem',
              fontWeight: 400,
              lineHeight: 1.2,
              color: 'var(--text-primary)',
              marginBottom: '0.15rem',
            }}
          >
            {name}
          </h1>
          <div className="type-label-secondary">
            {[client.location, client.referral_source ? `Referred by ${client.referral_source}` : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-12 md:grid-cols-2">
        {/* Left column */}
        <div>
          {/* Contact — section helper renders below the heading via FieldHelper.
              The DetailRow rows are display-only; we don't convert each row
              into a separate FieldLabel/FieldHelper because that would
              over-emphasize a passive lookup. Instead, one Sanity-authored
              helper sets context for the whole section per spec §8 ("one
              question, one answer"). */}
          <FieldGroup label="Contact">
            <FieldHelper
              surfaceKey={SurfaceKeys.DesignerPortal.Clients.Contact.Section}
              fallback="How the client prefers to reach you and be reached."
              className="mb-2"
            />
            {email && <DetailRow label="Email" value={email} />}
            {phone && <DetailRow label="Phone" value={phone} />}
            {client.location && <DetailRow label="Location" value={client.location} />}
            {client.preferred_contact && (
              <DetailRow label="Preferred" value={client.preferred_contact} />
            )}
          </FieldGroup>

          <StrataMark variant="micro" />

          {/* Style DNA — Patina concept (the system's read on this client's
              aesthetic preferences). StrataInfoIcon sits next to the heading
              per spec §4.2 so the designer can hover to read what "Style DNA"
              actually represents. We inline the heading instead of using
              `<FieldGroup label="...">` because the design-system primitive
              only accepts a string label — composing the icon into the label
              requires a JSX heading. */}
          <div className="mb-8">
            <span className="type-meta mb-2 flex items-center gap-1.5">
              Style DNA
              <StrataInfoIcon
                surfaceKey={SurfaceKeys.DesignerPortal.Clients.Concept.StyleDna}
                fallback="The aesthetic profile we've learned for this client — primary styles, material and color preferences, and lifestyle cues."
                ariaLabel="About Style DNA"
              />
            </span>
            {client.style_tags && client.style_tags.length > 0 && (
              <div className="mb-4">
                <div
                  className="mb-2"
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.62rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Primary Styles
                </div>
                <div className="flex flex-wrap gap-2">
                  {client.style_tags.map((tag: string) => (
                    <StyleTag key={tag} label={tag} active />
                  ))}
                </div>
              </div>
            )}

            {Object.keys(prefs).length > 0 && (
              <div className="mb-4">
                <div
                  className="mb-2"
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.62rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Preferences Learned
                </div>
                {prefs.materials && <DetailRow label="Materials" value={prefs.materials} />}
                {prefs.color && <DetailRow label="Color" value={prefs.color} />}
                {prefs.budget && <DetailRow label="Budget" value={prefs.budget} />}
                {prefs.lifestyle && <DetailRow label="Lifestyle" value={prefs.lifestyle} />}
              </div>
            )}

            {client.inspiration_quote && (
              <div>
                <div
                  className="mb-2"
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.62rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Inspiration Quote
                </div>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.85rem',
                    fontStyle: 'italic',
                    color: 'var(--color-aged-oak)',
                    lineHeight: 1.6,
                  }}
                >
                  &ldquo;{client.inspiration_quote}&rdquo;
                </p>
              </div>
            )}
          </div>

          <StrataMark variant="micro" />

          {/* Active & Past Projects */}
          <FieldGroup label="Active & Past Projects">
            {!projects || projects.length === 0 ? (
              <p className="type-body py-2 italic text-[var(--text-muted)]">
                No projects yet.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {projects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            )}
          </FieldGroup>

          <StrataMark variant="micro" />

          {/* Room Scans */}
          <FieldGroup label="Room Scans">
            {!roomScans || roomScans.length === 0 ? (
              <p className="type-body py-2 italic text-[var(--text-muted)]">
                No scans shared yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {roomScans.map((scan) => (
                  <ScanCard
                    key={scan.id}
                    scan={{
                      id: scan.id,
                      name: scan.name,
                      thumbnail_url: scan.thumbnail_url ?? null,
                      room_type: scan.room_type ?? null,
                      quality_grade: (scan.quality_grade ?? null) as string | null,
                    }}
                  />
                ))}
              </div>
            )}
          </FieldGroup>

          <StrataMark variant="micro" />

          {/* Financial Summary — each metric row is wrapped in a Tooltip so
              hovering over the value reveals "what this measures." Tooltip
              uses `asChild` semantics under the hood (Radix), so the row
              renders as a focusable button. Per spec §4.1 the body should
              stay under 160 chars; the inline fallbacks comply pre-Sanity
              deploy, and Sanity authors are guided by the same cap. */}
          <FieldGroup label="Financial Summary">
            <Tooltip
              surfaceKey={SurfaceKeys.DesignerPortal.Clients.Metric.LifetimeValue}
              fallback="Total revenue from completed and active Patina projects for this client (not including unsigned proposals)."
            >
              <button
                type="button"
                className="grid w-full cursor-help grid-cols-[110px_1fr] gap-3 py-[0.35rem] text-left"
                aria-label="Lifetime project value — what does this measure?"
              >
                <span className="type-meta">Project Value</span>
                <span className="type-body-small">
                  {client.total_revenue > 0
                    ? `$${(client.total_revenue / 100).toLocaleString()}`
                    : '—'}
                </span>
              </button>
            </Tooltip>
            <Tooltip
              surfaceKey={SurfaceKeys.DesignerPortal.Clients.Metric.ProjectCount}
              fallback="Number of Patina projects this client has signed — counts active and completed engagements together."
            >
              <button
                type="button"
                className="grid w-full cursor-help grid-cols-[110px_1fr] gap-3 py-[0.35rem] text-left"
                aria-label="Project count — what does this measure?"
              >
                <span className="type-meta">Projects</span>
                <span className="type-body-small">
                  {String(client.total_projects || 0)}
                </span>
              </button>
            </Tooltip>
            {(client as DesignerClient & { first_project_at?: string }).first_project_at && (
              <Tooltip
                surfaceKey={SurfaceKeys.DesignerPortal.Clients.Metric.FirstProject}
                fallback="The month and year this client first signed with you on Patina."
              >
                <button
                  type="button"
                  className="grid w-full cursor-help grid-cols-[110px_1fr] gap-3 py-[0.35rem] text-left"
                  aria-label="First project — what does this measure?"
                >
                  <span className="type-meta">First Project</span>
                  <span className="type-body-small">
                    {new Date(
                      (client as DesignerClient & { first_project_at: string }).first_project_at
                    ).toLocaleDateString('en-US', {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </button>
              </Tooltip>
            )}
          </FieldGroup>
        </div>

        {/* Right column */}
        <div>
          {/* Relationship Journey — Patina concept (chronological log of how
              the engagement has progressed). StrataInfoIcon per spec §4.2;
              same inline-heading pattern as Style DNA above. */}
          <div className="mb-8">
            <span className="type-meta mb-2 flex items-center gap-1.5">
              Relationship Journey
              <StrataInfoIcon
                surfaceKey={
                  SurfaceKeys.DesignerPortal.Clients.Concept.RelationshipJourney
                }
                fallback="The arc of this engagement on Patina — milestones, status changes, and key project events in chronological order."
                ariaLabel="About Relationship Journey"
              />
            </span>
            <ClientTimeline entries={timelineEntries} />
          </div>

          <StrataMark variant="micro" />

          {/* Pending Decisions */}
          {pendingDecisions.length > 0 && (
            <>
              <FieldGroup label="Pending Decisions">
                {pendingDecisions.map((d) => (
                  <DecisionCard
                    key={d.id}
                    title={d.title}
                    dueDate={d.due_date ?? undefined}
                    description={d.context || undefined}
                    optionCount={d.options?.length}
                    status={d.status}
                  />
                ))}
              </FieldGroup>
              <StrataMark variant="micro" />
            </>
          )}

          {/* Recent Activity */}
          <FieldGroup label="Recent Activity">
            <ActivityFeed items={activityItems} />
          </FieldGroup>

          {/* Notes */}
          {client.notes && (
            <>
              <StrataMark variant="micro" />
              <FieldGroup label="Notes">
                <p className="type-body max-w-[640px]">{client.notes}</p>
              </FieldGroup>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
