'use client';

import { useState } from 'react';
import { MessageThread, MessageComposer, StatusDot, type ThreadMessage } from '@patina/design-system';
import { useThread, useSendMessage, useThreads } from '@/hooks/use-comms';
import {
  PHASE_CONFIG,
  ALL_PHASES,
  type MockTask,
  type MockTimelineSegment,
  type PhaseApproval,
} from '@/types/project-ui';

interface PhaseTimelineV2Props {
  projectId?: string;
  segments: MockTimelineSegment[];
  tasks: MockTask[];
  approvals?: PhaseApproval[];
  onTaskToggle?: (taskId: string, done: boolean) => void;
}

const indicatorStyles: Record<string, { bg: string; border: string; color: string; icon: string }> = {
  decision: {
    bg: 'rgba(196, 165, 123, 0.06)',
    border: 'rgba(196, 165, 123, 0.12)',
    color: 'var(--color-clay)',
    icon: '',
  },
  blocked: {
    bg: 'rgba(199, 123, 110, 0.04)',
    border: 'rgba(199, 123, 110, 0.12)',
    color: 'var(--color-terracotta)',
    icon: '',
  },
  deliverable: {
    bg: 'rgba(139, 156, 173, 0.06)',
    border: 'rgba(139, 156, 173, 0.12)',
    color: 'var(--color-dusty-blue)',
    icon: '',
  },
  gate: {
    bg: 'rgba(196, 165, 123, 0.08)',
    border: 'rgba(196, 165, 123, 0.15)',
    color: 'var(--color-clay)',
    icon: '',
  },
};

const approvalBadgeStyles: Record<string, { bg: string; border: string; color: string; label: string }> = {
  pending: {
    bg: 'rgba(212, 160, 144, 0.06)',
    border: 'rgba(212, 160, 144, 0.2)',
    color: 'var(--color-terracotta)',
    label: 'Awaiting Client Approval',
  },
  needs_discussion: {
    bg: 'rgba(232, 197, 71, 0.06)',
    border: 'rgba(232, 197, 71, 0.2)',
    color: 'var(--color-golden-hour)',
    label: 'Needs Discussion',
  },
  approved: {
    bg: 'rgba(168, 181, 160, 0.06)',
    border: 'rgba(168, 181, 160, 0.2)',
    color: 'var(--color-sage)',
    label: 'Approved',
  },
  rejected: {
    bg: 'rgba(199, 123, 110, 0.06)',
    border: 'rgba(199, 123, 110, 0.2)',
    color: 'var(--color-terracotta)',
    label: 'Changes Requested',
  },
};

function ApprovalBadge({ approval }: { approval: PhaseApproval }) {
  const style = approvalBadgeStyles[approval.status] ?? approvalBadgeStyles.pending;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5"
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        fontFamily: 'var(--font-meta)',
        fontSize: '0.5rem',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: style.color,
      }}
    >
      {approval.status === 'pending' && '● '}
      {approval.status === 'approved' && '✓ '}
      {approval.status === 'rejected' && '✕ '}
      {style.label}
    </span>
  );
}

function ApprovalDetailRow({ approval }: { approval: PhaseApproval }) {
  const style = approvalBadgeStyles[approval.status] ?? approvalBadgeStyles.pending;
  const dateStr = approval.decidedAt
    ? new Date(approval.decidedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : new Date(approval.requestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div
      className="flex items-start gap-2.5 py-2"
      style={{ paddingLeft: '1.5rem' }}
    >
      <StatusDot
        status={approval.status === 'approved' ? 'completed' : approval.status === 'rejected' ? 'blocked' : 'pending'}
        size="sm"
        className="mt-1"
      />
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: 'var(--text-primary)',
          }}
        >
          {approval.type === 'design_concept' && 'Design Concept Review'}
          {approval.type === 'material_selection' && 'Material Selection Review'}
          {approval.type === 'budget_change' && 'Budget Change Approval'}
          {approval.type === 'milestone' && 'Milestone Sign-Off'}
          {!['design_concept', 'material_selection', 'budget_change', 'milestone'].includes(approval.type) && (approval.type || 'Approval')}
        </div>
        {approval.comment && (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
              marginTop: '0.25rem',
            }}
          >
            &ldquo;{approval.comment}&rdquo;
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.48rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: style.color,
          whiteSpace: 'nowrap',
          paddingTop: '0.15rem',
        }}
      >
        {approval.decidedAt ? dateStr : `Requested ${dateStr}`}
      </div>
    </div>
  );
}

function PhaseMessageThread({ projectId, phase }: { projectId: string; phase: string }) {
  const scope = `phase:${projectId}:${phase}`;
  const { data: threadsData } = useThreads({ scope });
  const threads = threadsData as any[] | undefined;
  const threadId = threads?.[0]?.id ?? null;
  const { data: threadData } = useThread(threadId);
  const thread = threadData as any;
  const sendMessage = useSendMessage();

  const messages: ThreadMessage[] = (thread?.messages ?? []).map((msg: any) => ({
    id: msg.id,
    author: {
      id: msg.senderId ?? msg.sender_id ?? 'unknown',
      name: msg.senderName ?? msg.sender?.full_name ?? 'Team',
      role: msg.senderRole ?? 'designer',
    },
    timestamp: new Date(msg.createdAt ?? msg.created_at),
    body: msg.bodyText ?? msg.body_text ?? msg.message ?? '',
    variant: msg.senderRole === 'client' ? 'incoming' : 'outgoing',
  }));

  const handleSend = async ({ body }: { body: string }) => {
    if (!threadId) return;
    await sendMessage.mutateAsync({
      threadId,
      data: { bodyText: body },
    });
  };

  return (
    <div className="mt-3 border-t border-[var(--border-subtle)] pt-3" style={{ paddingLeft: '1.5rem' }}>
      <div
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.5rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--text-muted)',
          marginBottom: '0.5rem',
        }}
      >
        Phase Messages
      </div>
      <div className="border border-[var(--border-default)] rounded-[3px] overflow-hidden">
        <MessageThread
          className="h-40 rounded-none border-0"
          messages={messages}
          currentUserId="designer"
          showDaySeparators={false}
          emptyState={
            <p className="type-body-small px-3 py-4 text-center">
              No messages in this phase yet.
            </p>
          }
        />
      </div>
      {threadId && (
        <div className="mt-2">
          <MessageComposer
            placeholder="Message about this phase..."
            rows={1}
            busy={sendMessage.isPending}
            onSend={handleSend}
          />
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, onToggle, isFuture }: { task: MockTask; onToggle?: (id: string, done: boolean) => void; isFuture: boolean }) {
  const isDone = task.status === 'done';
  const isBlocked = task.status === 'blocked';

  return (
    <div
      className="grid items-start gap-2.5 py-1"
      style={{
        gridTemplateColumns: '18px 1fr auto',
        paddingLeft: '1.5rem',
        opacity: isFuture ? 0.45 : 1,
      }}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle?.(task.id, !isDone)}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm"
        style={{
          border: `1.5px solid ${isDone ? 'var(--color-sage)' : isBlocked ? 'var(--color-terracotta)' : task.indicators?.includes('decision') ? 'var(--color-golden-hour)' : 'var(--color-pearl)'}`,
          background: isDone ? 'rgba(122, 155, 118, 0.08)' : 'transparent',
          color: isDone ? 'var(--color-sage)' : isBlocked ? 'var(--color-terracotta)' : 'var(--color-golden-hour)',
          fontSize: '0.5rem',
        }}
      >
        {isDone && '✓'}
        {isBlocked && '⚡'}
        {!isDone && !isBlocked && task.indicators?.includes('decision') && '◉'}
      </button>

      {/* Task content */}
      <div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: isDone ? 'var(--text-muted)' : 'var(--text-primary)',
            textDecoration: isDone ? 'line-through' : 'none',
            textDecorationColor: isDone ? 'var(--color-pearl)' : undefined,
          }}
        >
          {task.title}
        </div>
        {task.indicators && task.indicatorText && (
          <span
            className="mt-0.5 inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5"
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.48rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: indicatorStyles[task.indicators[0]]?.bg,
              border: `1px solid ${indicatorStyles[task.indicators[0]]?.border}`,
              color: indicatorStyles[task.indicators[0]]?.color,
              fontWeight: task.indicators[0] === 'gate' ? 500 : 400,
            }}
          >
            {task.indicators[0] === 'gate' && '★ '}
            {task.indicators[0] === 'decision' && !isDone && '◉ '}
            {task.indicators[0] === 'decision' && isDone && '✓ '}
            {task.indicators[0] === 'blocked' && '⚡ '}
            {task.indicatorText}
          </span>
        )}
      </div>

      {/* Date */}
      <div
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.48rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: isBlocked
            ? 'var(--color-terracotta)'
            : 'var(--text-muted)',
          whiteSpace: 'nowrap',
          paddingTop: '0.15rem',
        }}
      >
        {isBlocked
          ? 'Blocked'
          : task.completedAt
            ? new Date(task.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : task.dueDate
              ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : ''}
      </div>
    </div>
  );
}

export function PhaseTimelineV2({ projectId, segments, tasks, approvals = [], onTaskToggle }: PhaseTimelineV2Props) {
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  return (
    <div>
      <h3
        style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 500,
          fontSize: '1.25rem',
          lineHeight: 1.35,
          marginBottom: '0.25rem',
        }}
      >
        Phase Timeline
      </h3>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Phases advance through client approval gates · Each phase has deliverables and sign-off
      </div>

      {ALL_PHASES.map((phase) => {
        const segment = segments.find((s) => s.phase === phase);
        const phaseTasks = tasks.filter((t) => t.phase === phase);
        const phaseApprovals = approvals.filter((a) => a.phaseKey === phase);
        const pendingApprovals = phaseApprovals.filter((a) => a.status === 'pending' || a.status === 'needs_discussion');
        const config = PHASE_CONFIG[phase];
        const status = segment?.status ?? 'pending';
        const isDone = status === 'completed';
        const isActive = status === 'in_progress';
        const isFuture = status === 'pending';

        // Format dates
        const startDate = segment?.startDate
          ? new Date(segment.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : '';
        const endDate = segment?.endDate
          ? new Date(segment.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : isActive ? 'Present' : '';
        const dateRange = startDate ? `${startDate}${endDate ? `–${endDate}` : ''}` : '';

        return (
          <div
            key={phase}
            className={`border-b py-5 ${isFuture ? 'future' : ''}`}
            style={{ borderColor: 'var(--border-default)' }}
          >
            {/* Phase header */}
            <div className="mb-2.5 flex items-center gap-2.5">
              <StatusDot
                status={isDone ? 'completed' : isActive ? 'active' : 'pending'}
                size="lg"
              />
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '0.92rem',
                  color: isFuture ? 'var(--color-pearl)' : isDone ? 'var(--text-muted)' : 'var(--text-primary)',
                }}
              >
                {config.label}
              </span>
              {isDone && (
                <span
                  className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5"
                  style={{
                    background: 'rgba(196, 165, 123, 0.06)',
                    border: '1px solid rgba(196, 165, 123, 0.12)',
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.5rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-clay)',
                  }}
                >
                  ✓ Gate Passed
                </span>
              )}
              {pendingApprovals.length > 0 && (
                <ApprovalBadge approval={pendingApprovals[0]} />
              )}
              {pendingApprovals.length > 1 && (
                <span
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.48rem',
                    color: 'var(--color-terracotta)',
                  }}
                >
                  +{pendingApprovals.length - 1} more
                </span>
              )}
              <span
                className="ml-auto"
                style={{
                  fontFamily: 'var(--font-meta)',
                  fontSize: '0.52rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: isActive ? 'var(--color-clay)' : 'var(--text-muted)',
                }}
              >
                {isActive ? `${startDate}–Present` : dateRange ? dateRange : `Est. ${config.typicalWeeks}`}
              </span>
            </div>

            {/* Tasks */}
            {phaseTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={onTaskToggle}
                isFuture={isFuture}
              />
            ))}

            {/* Approvals */}
            {phaseApprovals.length > 0 && (
              <div className="mt-2 border-t border-[var(--border-subtle)] pt-2">
                <div
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.5rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--text-muted)',
                    paddingLeft: '1.5rem',
                    marginBottom: '0.25rem',
                  }}
                >
                  Client Approvals
                </div>
                {phaseApprovals.map((approval) => (
                  <ApprovalDetailRow key={approval.id} approval={approval} />
                ))}
              </div>
            )}

            {/* Phase Messages */}
            {projectId && !isFuture && (
              <>
                {expandedMessages.has(phase) ? (
                  <>
                    <PhaseMessageThread projectId={projectId} phase={phase} />
                    <button
                      type="button"
                      onClick={() => setExpandedMessages((prev) => {
                        const next = new Set(prev);
                        next.delete(phase);
                        return next;
                      })}
                      className="mt-1 type-meta text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      style={{ paddingLeft: '1.5rem', fontSize: '0.52rem' }}
                    >
                      Hide messages
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setExpandedMessages((prev) => new Set(prev).add(phase))}
                    className="mt-2 type-meta text-[var(--accent-primary)] hover:text-[var(--text-primary)] transition-colors"
                    style={{ paddingLeft: '1.5rem', fontSize: '0.52rem' }}
                  >
                    Show messages
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}

      <div className="mt-3 flex gap-2">
        <button
          className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500 }}
        >
          + Add Task
        </button>
        <button
          className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500 }}
        >
          + Add Phase
        </button>
      </div>
    </div>
  );
}
