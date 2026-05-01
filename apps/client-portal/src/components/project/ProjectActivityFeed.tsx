'use client';

import {
  CheckCircle2,
  ClipboardList,
  FileText,
  History,
  MessageSquare,
} from 'lucide-react';

import { useProjectActivityFromLog, type ActivityType } from '@patina/supabase';

import { formatRelativeTime } from '@/lib/utils/format';

const ICON_BY_TYPE: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  message: MessageSquare,
  decision: CheckCircle2,
  status_change: History,
  invoice: FileText,
  project_update: History,
  review: CheckCircle2,
  note: ClipboardList,
  milestone: CheckCircle2,
  lead_reassigned: History,
  scope_change_requested: ClipboardList,
};

export function ProjectActivityFeed({ projectId }: { projectId: string }) {
  const { data: events = [], isLoading } = useProjectActivityFromLog(projectId, 20);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-[var(--border-default)] bg-white p-5">
        <h3 className="font-heading text-base text-[var(--text-primary)] mb-3">Activity</h3>
        <p className="type-body-small text-[var(--text-muted)]">Loading…</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border-default)] bg-white p-5">
        <h3 className="font-heading text-base text-[var(--text-primary)] mb-3">Activity</h3>
        <p className="type-body-small text-[var(--text-muted)]">
          No recent activity. New decisions, proposals, and updates will appear here.
        </p>
      </div>
    );
  }

  return (
    <section
      className="rounded-lg border border-[var(--border-default)] bg-white p-5"
      data-testid="project-activity-feed"
    >
      <h3 className="font-heading text-base text-[var(--text-primary)] mb-4">Activity</h3>
      <ol className="space-y-4">
        {events.map((event) => {
          const Icon = ICON_BY_TYPE[event.activity_type] ?? History;
          return (
            <li key={event.id} className="flex gap-3">
              <div
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'rgba(196,165,123,0.10)' }}
              >
                <Icon className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--text-primary)]">{event.title}</p>
                {event.description && (
                  <p className="type-body-small mt-0.5 text-[var(--text-muted)]">
                    {event.description}
                  </p>
                )}
                <p className="type-meta-small mt-1 text-[var(--text-muted)]">
                  {event.actor_name ? `${event.actor_name} · ` : ''}
                  {formatRelativeTime(event.created_at) ?? 'just now'}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
