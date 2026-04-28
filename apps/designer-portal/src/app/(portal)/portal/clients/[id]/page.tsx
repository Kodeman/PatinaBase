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
import type { DesignerClient, ClientLifecycleStage, RoomScan } from '@patina/supabase';
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

const projectStatusColors: Record<string, string> = {
  active: 'var(--color-sage)',
  completed: 'var(--text-muted)',
  on_hold: 'var(--color-golden-hour)',
  cancelled: 'var(--color-terracotta)',
};

const TIMELINE_ACTIVITY_TYPES = new Set([
  'milestone',
  'status_change',
  'project_update',
]);

function qualityGradeColor(grade: string | null): string {
  if (grade === 'excellent') return 'var(--color-sage)';
  if (grade === 'good') return 'var(--color-dusty-blue)';
  if (grade === 'fair') return 'var(--color-golden-hour)';
  return 'var(--text-muted)';
}

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
  const { data: roomScans } = useClientRoomScans(id) as { data: RoomScan[] | undefined };

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

  // Build timeline from activity log — milestone and status-change events only
  const timelineEntries = (activities ?? [])
    .filter((a) => TIMELINE_ACTIVITY_TYPES.has(a.activity_type))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((a) => ({
      id: a.id,
      label: a.title,
      date: new Date(a.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      status: 'done' as const,
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
          <Link href={`/portal/clients/${id}/messages`}>
            <PortalButton variant="primary">Message</PortalButton>
          </Link>
          <PortalButton variant="secondary">View Project</PortalButton>
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
                {projects.map((project) => {
                  const statusColor =
                    projectStatusColors[project.status as string] || 'var(--text-muted)';
                  const started = project.start_date
                    ? new Date(project.start_date).toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric',
                      })
                    : null;
                  const ended = project.target_end_date
                    ? new Date(project.target_end_date).toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric',
                      })
                    : null;

                  return (
                    <div
                      key={project.id}
                      style={{
                        padding: '0.75rem 1rem',
                        background: 'var(--bg-surface)',
                        borderRadius: '6px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.88rem',
                            fontWeight: 500,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {project.name}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-meta)',
                            fontSize: '0.55rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: statusColor,
                          }}
                        >
                          {project.status}
                        </span>
                      </div>

                      {(started || ended) && (
                        <div
                          style={{
                            fontFamily: 'var(--font-meta)',
                            fontSize: '0.55rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: 'var(--text-muted)',
                            marginBottom: '0.5rem',
                          }}
                        >
                          {started && ended
                            ? `${started} — ${ended}`
                            : started
                              ? `Started ${started}`
                              : `Due ${ended}`}
                        </div>
                      )}

                      {project.current_phase && (
                        <div
                          style={{
                            fontFamily: 'var(--font-meta)',
                            fontSize: '0.55rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: 'var(--text-muted)',
                            marginBottom: '0.5rem',
                          }}
                        >
                          Phase: {project.current_phase}
                        </div>
                      )}

                      <Link
                        href={`/portal/projects/${project.id}`}
                        style={{
                          fontFamily: 'var(--font-meta)',
                          fontSize: '0.6rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: 'var(--accent-primary)',
                          textDecoration: 'none',
                        }}
                      >
                        View Project &rarr;
                      </Link>
                    </div>
                  );
                })}
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
                {roomScans.map((scan) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const grade = (scan as any).quality_grade as string | null;
                  return (
                    <div
                      key={scan.id}
                      style={{
                        position: 'relative',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-surface)',
                        aspectRatio: '4/3',
                      }}
                    >
                      {scan.thumbnail_url ? (
                        <img
                          src={scan.thumbnail_url}
                          alt={scan.name}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-meta)',
                            fontSize: '0.6rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {scan.room_type || 'Scan'}
                        </div>
                      )}

                      {/* Overlay: name + grade */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          padding: '0.35rem 0.5rem',
                          background: 'rgba(0,0,0,0.45)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-meta)',
                            fontSize: '0.55rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: 'rgba(255,255,255,0.85)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {scan.name}
                        </span>
                        {grade && (
                          <span
                            style={{
                              fontFamily: 'var(--font-meta)',
                              fontSize: '0.5rem',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              color: qualityGradeColor(grade),
                              flexShrink: 0,
                              marginLeft: '0.5rem',
                            }}
                          >
                            {grade}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                    dueDate={
                      d.due_date
                        ? new Date(d.due_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })
                        : undefined
                    }
                    isOverdue={d.due_date ? new Date(d.due_date) < new Date() : false}
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
