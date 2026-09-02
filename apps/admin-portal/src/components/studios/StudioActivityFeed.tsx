'use client';

import { cn } from '@/lib/utils';
import { LoadingStrata } from '@/components/portal';
import { useStudioActivity } from '@/hooks/use-studios';
import { formatDistanceToNow } from 'date-fns';

interface StudioActivityFeedProps {
  studioId: string;
}

// Lifted from users/[id]/page.tsx's Activity tab timeline — same audit-log
// -> event-timeline transform, scoped to a studio's audit_logs rows instead
// of a user's.
export function StudioActivityFeed({ studioId }: StudioActivityFeedProps) {
  const { data, isLoading } = useStudioActivity(studioId);

  if (isLoading) return <LoadingStrata />;

  const events = (data?.data ?? []).map((log) => {
    const actionParts = log.action.split('.');
    const actionType = actionParts[actionParts.length - 1] || log.action;
    const title = actionType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    let tone: 'success' | 'warning' | 'destructive' | 'info' = 'info';
    if (log.result === 'success') {
      if (log.action.includes('remove') || log.action.includes('deactivate')) {
        tone = 'destructive';
      } else if (log.action.includes('suspend')) {
        tone = 'warning';
      } else {
        tone = 'success';
      }
    } else if (log.result === 'failure' || log.result === 'denied') {
      tone = 'destructive';
    }

    return {
      id: log.id,
      title,
      description: `${log.resourceType} operation`,
      timestamp: log.timestamp,
      tone,
      context: log.metadata ? JSON.stringify(log.metadata) : undefined,
    };
  });

  if (events.length === 0) {
    return (
      <p className="type-body py-8 text-center italic text-[var(--text-muted)]">
        No activity logged for this studio yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {events.map((event, index) => (
        <div key={event.id} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                event.tone === 'success' && 'bg-success',
                event.tone === 'warning' && 'bg-warning',
                event.tone === 'destructive' && 'bg-destructive',
                event.tone === 'info' && 'bg-primary',
              )}
            />
            {index !== events.length - 1 && <div className="mt-1 h-full w-px bg-border" />}
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium">{event.title}</p>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{event.description}</p>
            {event.context && <p className="text-xs text-muted-foreground">{event.context}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
