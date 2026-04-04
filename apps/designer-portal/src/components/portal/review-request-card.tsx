'use client';

import { PortalButton } from './button';

interface ReviewRequestCardProps {
  clientName: string;
  projectName: string;
  completedDate: string;
  daysSinceCompletion: number;
  onSend: () => void;
  onCustomize?: () => void;
  onSchedule?: () => void;
}

export function ReviewRequestCard({
  clientName,
  projectName,
  completedDate,
  daysSinceCompletion,
  onSend,
  onCustomize,
  onSchedule,
}: ReviewRequestCardProps) {
  return (
    <div
      className="mb-6 rounded-md p-5"
      style={{
        background: 'rgba(232, 197, 71, 0.04)',
        border: '1px solid rgba(232, 197, 71, 0.15)',
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="type-label" style={{ fontSize: '0.88rem' }}>
          {projectName} &mdash; {clientName}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.52rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-golden-hour)',
          }}
        >
          Ready to send \u00B7 Completed {completedDate}
        </span>
      </div>
      <p
        className="mb-3"
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.82rem',
          color: 'var(--text-body)',
        }}
      >
        Project completed {daysSinceCompletion} day{daysSinceCompletion !== 1 ? 's' : ''} ago.
        Recommended timing to request a review &mdash; client satisfaction peaks in the first week.
      </p>
      <div className="flex gap-2">
        <PortalButton variant="primary" onClick={onSend}>
          Send Review Request
        </PortalButton>
        {onCustomize && (
          <PortalButton variant="secondary" onClick={onCustomize}>
            Customize Message
          </PortalButton>
        )}
        {onSchedule && (
          <PortalButton variant="ghost" onClick={onSchedule}>
            Schedule for Later
          </PortalButton>
        )}
      </div>
    </div>
  );
}
