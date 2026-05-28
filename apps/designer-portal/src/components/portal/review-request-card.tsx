'use client';

import { useState } from 'react';
import { PortalButton } from './button';

interface ReviewRequestCardProps {
  clientName: string;
  projectName: string;
  completedDate: string;
  daysSinceCompletion: number;
  onSend: () => void;
  onCustomize?: () => void;
  // Schedule the request for a future date (ISO yyyy-mm-dd from the picker).
  onSchedule?: (scheduledFor: string) => void;
  busy?: boolean;
}

export function ReviewRequestCard({
  clientName,
  projectName,
  completedDate,
  daysSinceCompletion,
  onSend,
  onCustomize,
  onSchedule,
  busy = false,
}: ReviewRequestCardProps) {
  const [scheduling, setScheduling] = useState(false);
  const [date, setDate] = useState('');

  const confirmSchedule = () => {
    if (!date || !onSchedule) return;
    onSchedule(new Date(`${date}T09:00:00`).toISOString());
    setScheduling(false);
    setDate('');
  };

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
          Ready to send {'·'} Completed {completedDate}
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

      {scheduling ? (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            className="rounded-[3px] border bg-white px-2 py-1.5 font-body text-[0.82rem] outline-none"
            style={{ borderColor: 'var(--border-default)' }}
          />
          <PortalButton variant="primary" onClick={confirmSchedule}>
            Confirm
          </PortalButton>
          <PortalButton
            variant="ghost"
            onClick={() => {
              setScheduling(false);
              setDate('');
            }}
          >
            Cancel
          </PortalButton>
        </div>
      ) : (
        <div className="flex gap-2">
          <PortalButton variant="primary" onClick={onSend} disabled={busy}>
            {busy ? 'Sending…' : 'Send Review Request'}
          </PortalButton>
          {onCustomize && (
            <PortalButton variant="secondary" onClick={onCustomize}>
              Customize Message
            </PortalButton>
          )}
          {onSchedule && (
            <PortalButton variant="ghost" onClick={() => setScheduling(true)}>
              Schedule for Later
            </PortalButton>
          )}
        </div>
      )}
    </div>
  );
}
