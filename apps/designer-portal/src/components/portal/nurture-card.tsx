'use client';

import { PortalButton } from './button';

interface NurtureCardProps {
  clientName: string;
  projectContext: string;
  lastContact: string;
  suggestedTiming: string;
  reason: string;
  isPriority?: boolean;
  onSendNote: () => void;
  onSchedule?: () => void;
  onDismiss?: () => void;
}

export function NurtureCard({
  clientName,
  projectContext,
  lastContact,
  suggestedTiming,
  reason,
  isPriority = false,
  onSendNote,
  onSchedule,
  onDismiss,
}: NurtureCardProps) {
  return (
    <div
      className="mb-4 rounded-lg p-5"
      style={{
        border: isPriority
          ? '1.5px solid var(--accent-primary)'
          : '1px solid var(--color-pearl)',
        background: isPriority ? 'rgba(196, 165, 123, 0.02)' : 'transparent',
      }}
    >
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div className="type-label" style={{ fontSize: '0.88rem' }}>
            {clientName}
          </div>
          <div className="type-label-secondary">
            {projectContext} \u00B7 Last contact: {lastContact}
          </div>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.52rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: isPriority ? 'var(--accent-primary)' : 'var(--text-muted)',
          }}
        >
          Suggested: {suggestedTiming}
        </span>
      </div>

      <p
        className="my-3"
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.82rem',
          color: 'var(--text-body)',
        }}
      >
        {reason}
      </p>

      <div className="flex gap-2">
        <PortalButton variant={isPriority ? 'primary' : 'secondary'} onClick={onSendNote}>
          Send Personalized Note
        </PortalButton>
        {onSchedule && (
          <PortalButton variant="secondary" onClick={onSchedule}>
            Schedule for Later
          </PortalButton>
        )}
        {onDismiss && (
          <PortalButton variant="ghost" onClick={onDismiss}>
            Dismiss
          </PortalButton>
        )}
      </div>
    </div>
  );
}
