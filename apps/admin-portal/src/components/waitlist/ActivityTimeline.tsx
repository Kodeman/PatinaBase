'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  CircleSlash,
  FileText,
  Mail,
  MessageSquare,
  PhoneCall,
  UserCheck,
  UserPlus2,
  ArrowRightCircle,
  ClipboardCheck,
  ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/portal';
import {
  useLogWaitlistActivity,
  useWaitlistActivities,
} from '@/hooks/use-waitlist';
import type { WaitlistActivity, WaitlistActivityKind } from '@/services/waitlist';

const KIND_META: Record<WaitlistActivityKind, { label: string; Icon: typeof FileText }> = {
  note: { label: 'Note', Icon: FileText },
  email_sent: { label: 'Email sent', Icon: Mail },
  call_logged: { label: 'Call', Icon: PhoneCall },
  stage_changed: { label: 'Stage changed', Icon: ArrowRightCircle },
  assigned: { label: 'Assigned', Icon: UserPlus2 },
  contacted: { label: 'Contacted', Icon: MessageSquare },
  qualified: { label: 'Qualified', Icon: UserCheck },
  disqualified: { label: 'Disqualified', Icon: CircleSlash },
  converted: { label: 'Converted', Icon: CheckCircle2 },
  task_created: { label: 'Task created', Icon: ClipboardList },
  task_completed: { label: 'Task completed', Icon: ClipboardCheck },
};

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function describeMetadata(activity: WaitlistActivity): string | null {
  const meta = activity.metadata;
  if (!meta) return null;
  if (activity.kind === 'stage_changed' || ['contacted', 'qualified', 'disqualified', 'converted'].includes(activity.kind)) {
    const from = (meta as any).from as string | undefined;
    const to = (meta as any).to as string | undefined;
    if (from && to) return `${from} → ${to}`;
  }
  if (activity.kind === 'assigned') {
    const to = (meta as any).to;
    if (!to) return 'Unassigned';
  }
  return null;
}

export function ActivityTimeline({ waitlistId }: { waitlistId: string }) {
  const { data: activities, isLoading } = useWaitlistActivities(waitlistId);
  const logActivity = useLogWaitlistActivity();
  const [note, setNote] = useState('');

  const handleLogNote = async () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    await logActivity.mutateAsync({ id: waitlistId, kind: 'note', body: trimmed });
    setNote('');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          placeholder="Log a note about this prospect…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleLogNote}
            disabled={!note.trim() || logActivity.isPending}
          >
            {logActivity.isPending ? 'Saving…' : 'Add note'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading activity…</div>
      ) : !activities || activities.length === 0 ? (
        <EmptyState message="No activity yet." />
      ) : (
        <ol className="space-y-3">
          {activities.map((a) => {
            const meta = KIND_META[a.kind] ?? KIND_META.note;
            const Icon = meta.Icon;
            const transitionLabel = describeMetadata(a);
            return (
              <li key={a.id} className="flex gap-3">
                <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--bg-hover)] text-[var(--text-muted)]">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 border-b border-[var(--border-subtle)] pb-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{meta.label}</span>
                    {transitionLabel && (
                      <span className="text-xs text-muted-foreground">{transitionLabel}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatRelativeTime(a.createdAt)}
                    </span>
                  </div>
                  {a.body && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                      {a.body}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
