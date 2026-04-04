'use client';

import type { ProposalEngagementEvent } from '@/hooks/use-proposals';

const eventConfig: Record<string, { icon: string; className: string }> = {
  opened: {
    icon: '\u25C9',
    className: 'bg-[rgba(196,165,123,0.1)] text-[var(--accent-primary)]',
  },
  section_viewed: {
    icon: '\u25CE',
    className: 'bg-[rgba(139,156,173,0.1)] text-[var(--color-dusty-blue)]',
  },
  signed: {
    icon: '\u2713',
    className: 'bg-[rgba(122,155,118,0.1)] text-[var(--color-sage)]',
  },
  downloaded: {
    icon: '\u2193',
    className: 'bg-[rgba(139,156,173,0.1)] text-[var(--color-dusty-blue)]',
  },
};

function formatEventTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return `Today, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min} min ${sec} sec`;
}

function formatEventDescription(event: ProposalEngagementEvent): JSX.Element {
  const viewerName = event.viewer?.full_name || 'Someone';

  switch (event.event_type) {
    case 'opened':
      return (
        <span>
          <strong>{viewerName}</strong> opened the proposal
        </span>
      );
    case 'section_viewed': {
      const sectionLabel = event.section_type
        ? event.section_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        : 'a section';
      const duration = event.duration_seconds ? ` for ${formatDuration(event.duration_seconds)}` : '';
      return (
        <span>
          Viewed <strong>{sectionLabel}</strong>{duration}
        </span>
      );
    }
    case 'signed':
      return (
        <span>
          <strong>{viewerName}</strong> signed the proposal
        </span>
      );
    case 'downloaded':
      return (
        <span>
          <strong>{viewerName}</strong> downloaded a PDF copy
        </span>
      );
    default:
      return <span>{event.event_type}</span>;
  }
}

interface EngagementTimelineProps {
  events: ProposalEngagementEvent[];
}

export function EngagementTimeline({ events }: EngagementTimelineProps) {
  return (
    <div>
      {events.map((event) => {
        const config = eventConfig[event.event_type] || eventConfig.opened;

        return (
          <div
            key={event.id}
            className="grid items-center gap-4 border-b border-[rgba(229,226,221,0.3)] py-2.5"
            style={{ gridTemplateColumns: 'auto 1fr auto' }}
          >
            {/* Icon */}
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[0.75rem] ${config.className}`}
            >
              {config.icon}
            </div>

            {/* Description */}
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.82rem',
                color: 'var(--text-body)',
              }}
            >
              {formatEventDescription(event)}
            </div>

            {/* Time */}
            <div
              className="whitespace-nowrap"
              style={{
                fontFamily: 'var(--font-meta)',
                fontSize: '0.55rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-muted)',
              }}
            >
              {formatEventTime(event.created_at)}
            </div>
          </div>
        );
      })}

      {events.length === 0 && (
        <p
          className="py-8 text-center italic"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
          }}
        >
          No activity yet. Events will appear here when the client views the proposal.
        </p>
      )}
    </div>
  );
}
