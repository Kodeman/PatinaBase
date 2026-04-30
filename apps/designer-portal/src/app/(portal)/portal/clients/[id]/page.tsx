'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  useClient,
  useClientActivity,
  useClientDecisions,
  useClientProjects,
  useClientRoomScans,
} from '@patina/supabase';
import type { DesignerClient, ClientLifecycleStage } from '@patina/supabase';
import { StageBadge } from '@/components/portal/stage-badge';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { StyleTag } from '@/components/portal/style-tag';
import { ClientTimeline } from '@/components/portal/client-timeline';
import { DecisionCard } from '@/components/portal/decision-card';
import { ActivityFeed } from '@/components/portal/activity-feed';
import { StrataMark } from '@/components/portal/strata-mark';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { PortalButton } from '@/components/portal/button';
import { ProjectCard } from '@/components/portal/project-card';
import { ScanCard } from '@/components/portal/scan-card';

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

  if (isLoading) return <LoadingStrata />;
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

  // Build timeline from activity log — milestone and status-change events only.
  // Status assignment heuristic (ascending sort by created_at):
  //   • Last entry       → 'active'  (most recent in-progress milestone)
  //   • All entries before it → 'done'
  //   • No 'future' entries are emitted because the seed data does not encode
  //     scheduled-but-not-yet-completed milestones in the activity log.
  const sortedTimelineActivities = (activities ?? [])
    .filter((a) => TIMELINE_ACTIVITY_TYPES.has(a.activity_type))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const lastTimelineIdx = sortedTimelineActivities.length - 1;
  const timelineEntries = sortedTimelineActivities.map((a, i) => ({
    id: a.id,
    label: a.title,
    date: new Date(a.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    status: (i === lastTimelineIdx ? 'active' : 'done') as 'done' | 'active' | 'future',
  }));

  // Style preferences from JSONB
  const prefs = (client.style_preferences || {}) as Record<string, string>;

  return (
    <div className="pt-8">
      {/* Breadcrumb */}
      <div className="type-meta mb-6">
        <Link
          href="/portal/clients"
          className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]"
        >
          Clients
        </Link>
        <span className="mx-2">&rarr;</span>
        <span>{name}</span>
      </div>

      {/* Profile Hero */}
      <div
        className="mb-8 grid items-start gap-6 pb-6"
        style={{
          gridTemplateColumns: '64px 1fr auto',
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
          <div className="mb-1 flex items-center gap-2">
            <StageBadge stage={stage} />
            <span
              style={{
                fontFamily: 'var(--font-meta)',
                fontSize: '0.52rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-muted)',
              }}
            >
              · Since{' '}
              {new Date(client.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
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

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <PortalButton variant="primary" asChild>
            <Link href={`/portal/clients/${id}/messages`}>Message</Link>
          </PortalButton>
          {projects?.[0]?.id ? (
            <PortalButton variant="secondary" asChild>
              <Link href={`/portal/projects/${projects[0].id}`}>View Project</Link>
            </PortalButton>
          ) : (
            <PortalButton variant="secondary" disabled>
              View Project
            </PortalButton>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-12 md:grid-cols-2">
        {/* Left column */}
        <div>
          {/* Contact */}
          <FieldGroup label="Contact">
            {email && <DetailRow label="Email" value={email} />}
            {phone && <DetailRow label="Phone" value={phone} />}
            {client.location && <DetailRow label="Location" value={client.location} />}
            {client.preferred_contact && (
              <DetailRow label="Preferred" value={client.preferred_contact} />
            )}
          </FieldGroup>

          <StrataMark variant="micro" />

          {/* Style DNA */}
          <FieldGroup label="Style DNA">
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
          </FieldGroup>

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

          {/* Financial Summary */}
          <FieldGroup label="Financial Summary">
            <DetailRow
              label="Project Value"
              value={
                client.total_revenue > 0
                  ? `$${(client.total_revenue / 100).toLocaleString()}`
                  : '—'
              }
            />
            <DetailRow
              label="Projects"
              value={String(client.total_projects || 0)}
            />
            {(client as DesignerClient & { first_project_at?: string }).first_project_at && (
              <DetailRow
                label="First Project"
                value={new Date(
                  (client as DesignerClient & { first_project_at: string }).first_project_at
                ).toLocaleDateString('en-US', {
                  month: 'short',
                  year: 'numeric',
                })}
              />
            )}
          </FieldGroup>
        </div>

        {/* Right column */}
        <div>
          {/* Relationship Journey */}
          <FieldGroup label="Relationship Journey">
            <ClientTimeline entries={timelineEntries} />
          </FieldGroup>

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
