'use client';

import { forwardRef } from 'react';
import type { AgentTask } from '@patina/agent-queue';
import { ActionButton } from '@/components/portal/action-button';
import { ConfidenceBadge } from './confidence-badge';
import { StaleBadge } from './stale-badge';
import { EvidencePack } from './evidence-pack';
import { RejectNotePopover } from './reject-note-popover';

// One approval task, rendered as an expandable hairline row (NOT a card box —
// no shadows on content, ledger rules only). Composed to match the portal's
// ListRow anatomy but reimplemented here because ListRow supports neither an
// expandable evidence body nor a selection affordance.

function formatAge(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface ApprovalCardProps {
  task: AgentTask;
  selected: boolean;
  expanded: boolean;
  rejectOpen: boolean;
  submitting: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
  onApprove: () => void;
  onOpenReject: () => void;
  onSubmitReject: (note: string) => void;
  onCloseReject: () => void;
  onOpenEdit: () => void;
}

export const ApprovalCard = forwardRef<HTMLDivElement, ApprovalCardProps>(function ApprovalCard(
  {
    task,
    selected,
    expanded,
    rejectOpen,
    submitting,
    onSelect,
    onToggleExpand,
    onApprove,
    onOpenReject,
    onSubmitReject,
    onCloseReject,
    onOpenEdit,
  },
  ref,
) {
  return (
    <div
      ref={ref}
      data-testid="approval-card"
      data-task-id={task.id}
      data-selected={selected ? 'true' : 'false'}
      data-expanded={expanded ? 'true' : 'false'}
      className={`relative border-b border-[var(--border-subtle)] pl-3 transition-colors ${
        selected
          ? 'border-l-2 border-l-[var(--accent-primary)] bg-[var(--bg-hover)]'
          : 'border-l-2 border-l-transparent'
      }`}
    >
      <div
        className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-4 py-4 pr-1"
        onClick={onSelect}
      >
        <div className="min-w-0">
          <div className="type-meta-small mb-1 flex items-center gap-2">
            <span className="text-[var(--text-primary)]">{task.task_type}</span>
            <span className="text-[var(--text-subtle)]" aria-hidden>
              ·
            </span>
            <span>{task.source}</span>
            <StaleBadge flaggedStaleAt={task.flagged_stale_at} className="ml-1" />
          </div>
          <div className="type-item-name truncate">{task.summary || task.task_type}</div>
          <div className="type-label-secondary mt-1 flex items-center gap-3">
            <ConfidenceBadge confidence={task.confidence} />
            <span className="text-[var(--text-subtle)]">·</span>
            <span title={new Date(task.created_at).toLocaleString()}>{formatAge(task.created_at)} old</span>
            {task.assignee && (
              <>
                <span className="text-[var(--text-subtle)]">·</span>
                <span
                  data-testid="assignee-chip"
                  className="inline-flex items-center border border-[var(--border-default)] px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.06em] text-[var(--text-muted)]"
                  style={{ fontFamily: 'var(--font-meta)' }}
                >
                  {task.assignee}
                </span>
              </>
            )}
            <span className="text-[var(--text-subtle)]">·</span>
            <span className="text-[var(--text-subtle)]">P{task.priority}</span>
          </div>
        </div>

        <div className="relative flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
          <ActionButton
            variant="muted"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            data-testid="approval-expand"
          >
            {expanded ? 'Hide' : 'Evidence'}
          </ActionButton>
          <ActionButton
            variant="muted"
            onClick={onOpenEdit}
            disabled={submitting}
            data-testid="approval-edit"
          >
            Edit
          </ActionButton>
          <ActionButton
            variant="danger"
            onClick={onOpenReject}
            disabled={submitting}
            data-testid="approval-reject"
          >
            Reject
          </ActionButton>
          <ActionButton
            variant="success"
            onClick={onApprove}
            disabled={submitting}
            data-testid="approval-approve"
          >
            Approve
          </ActionButton>

          <RejectNotePopover
            open={rejectOpen}
            submitting={submitting}
            onSubmit={onSubmitReject}
            onClose={onCloseReject}
          />
        </div>
      </div>

      {expanded && (
        <div className="pb-5 pr-1 pt-1" data-testid="approval-evidence">
          <EvidencePack task={task} />
        </div>
      )}
    </div>
  );
});
