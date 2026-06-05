'use client';

import { useState } from 'react';
import { Button, Input, StatusBadge } from '@/components/ui/controls';

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
        <StatusBadge tone="warning">
          Ready to send {'·'} Completed {completedDate}
        </StatusBadge>
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
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            className="w-auto"
          />
          <Button variant="primary" onClick={confirmSchedule}>
            Confirm
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setScheduling(false);
              setDate('');
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="primary" onClick={onSend} disabled={busy}>
            {busy ? 'Sending…' : 'Send Review Request'}
          </Button>
          {onCustomize && (
            <Button variant="secondary" onClick={onCustomize}>
              Customize Message
            </Button>
          )}
          {onSchedule && (
            <Button variant="ghost" onClick={() => setScheduling(true)}>
              Schedule for Later
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
